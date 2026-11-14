use std::collections::BTreeMap;

use ely_gpui_component::{init_for_tests, theme::Theme};
use elysdui_gpui::{
    catalogue::CatalogueView,
    dashboard::{Screen, ScreenNode},
};
use gpui::{AppContext, Modifiers, TestAppContext};
use serde_json::{Value, json};

fn node(id: &str, node_type: &str, props: BTreeMap<String, Value>) -> ScreenNode {
    ScreenNode {
        id: id.into(),
        node_type: node_type.into(),
        props,
        bindings: BTreeMap::new(),
        children: Vec::new(),
        event: None,
        events: Vec::new(),
        use_template: None,
        params: BTreeMap::new(),
        param_bindings: BTreeMap::new(),
        slots: BTreeMap::new(),
        when: None,
        repeat: None,
    }
}

fn mail_screen(id: &str, first_starred: bool) -> Screen {
    Screen {
        version: "1".into(),
        id: id.into(),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "mail-list",
            "mail/MailList",
            BTreeMap::from([(
                "items".into(),
                json!([
                    {"value":"m1", "author":"Mina", "subject":"Mobile contract", "starred":first_starred},
                    {"value":"m2", "author":"Noah", "subject":"Already starred", "starred":true}
                ]),
            )]),
        ),
    }
}

#[gpui::test]
fn mobile_mail_star_preserves_selection_and_matches_htmx_events(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| {
            theme.touch_mode = true;
            theme.reduced_motion = true;
        });
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(mail_screen("mobile-mail", false), window, cx)
                .unwrap()
        })
    });
    vcx.run_until_parked();

    let first_row = vcx
        .debug_bounds("list-item-Mina")
        .expect("first mail row at 390px");
    vcx.simulate_click(first_row.center(), Modifiers::none());
    vcx.run_until_parked();
    assert!(vcx.debug_bounds("item-selected-Mina").is_some());
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("mail-list"), Some(&json!(["m1"])));
    });

    let first_star = vcx
        .debug_bounds("star m1")
        .expect("first mail star at 390px");
    vcx.simulate_click(first_star.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("mail-list"), Some(&json!(["m1"])));
        assert!(view.events().iter().any(|event| {
            event.node_id == "mail-list"
                && event.event == "ely:change"
                && event.value == json!({"name":"starred", "value":"m1", "checked":true})
        }));
        assert!(view.events().iter().any(|event| {
            event.node_id == "mail-list"
                && event.event == "ely:action"
                && event.value == json!({"action":"star-mail", "value":"m1", "starred":true})
        }));
    });
    assert!(vcx.debug_bounds("item-selected-Mina").is_some());

    let first_star = vcx
        .debug_bounds("star m1")
        .expect("persisted first mail star");
    vcx.simulate_click(first_star.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("mail-list"), Some(&json!(["m1"])));
        assert!(view.events().iter().any(|event| {
            event.node_id == "mail-list"
                && event.event == "ely:action"
                && event.value == json!({"action":"star-mail", "value":"m1", "starred":false})
        }));
    });
    assert!(vcx.debug_bounds("item-selected-Mina").is_some());
}

#[gpui::test]
fn mobile_mail_star_uses_changed_source_props_after_screen_reload(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| {
            theme.touch_mode = true;
            theme.reduced_motion = true;
        });
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(mail_screen("mail-before-refresh", false), window, cx)
                .unwrap()
        })
    });
    vcx.run_until_parked();
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(mail_screen("mail-after-refresh", true), window, cx)
                .unwrap()
        })
    });
    vcx.run_until_parked();

    let first_star = vcx
        .debug_bounds("star m1")
        .expect("refreshed first mail star at 390px");
    vcx.simulate_click(first_star.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert!(view.events().iter().any(|event| {
            event.node_id == "mail-list"
                && event.event == "ely:action"
                && event.value == json!({"action":"star-mail", "value":"m1", "starred":false})
        }));
    });
}

#[gpui::test]
fn mobile_mail_star_restores_identical_source_props_after_screen_reload(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| {
            theme.touch_mode = true;
            theme.reduced_motion = true;
        });
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(
                mail_screen("mail-before-identical-refresh", false),
                window,
                cx,
            )
            .unwrap()
        })
    });
    vcx.run_until_parked();
    let first_star = vcx
        .debug_bounds("star m1")
        .expect("initial first mail star");
    vcx.simulate_click(first_star.center(), Modifiers::none());
    vcx.run_until_parked();

    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(
                mail_screen("mail-after-identical-refresh", false),
                window,
                cx,
            )
            .unwrap()
        })
    });
    vcx.run_until_parked();
    let first_star = vcx
        .debug_bounds("star m1")
        .expect("identically refreshed first mail star at 390px");
    vcx.simulate_click(first_star.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        let action = view
            .events()
            .iter()
            .rev()
            .find(|event| event.node_id == "mail-list" && event.event == "ely:action")
            .expect("star action after identical refresh");
        assert_eq!(
            action.value,
            json!({"action":"star-mail", "value":"m1", "starred":true})
        );
    });
}
