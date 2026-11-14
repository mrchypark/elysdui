use std::collections::BTreeMap;

use ely_gpui_component::{init_for_tests, theme::Theme};
use elysdui_gpui::{
    catalogue::CatalogueView,
    dashboard::{Screen, ScreenNode},
};
use gpui::{AppContext, Modifiers, TestAppContext};
use serde_json::json;

fn screen(disabled: bool, add_label: Option<&str>, add_action: Option<&str>) -> Screen {
    let mut props = BTreeMap::from([
        ("name".into(), json!("account_name")),
        ("label".into(), json!("Account")),
        ("value".into(), json!("a")),
        ("disabled".into(), json!(disabled)),
        ("action".into(), json!("choose-user")),
        (
            "items".into(),
            json!([
                {"value":"a", "label":"Alice", "text":"alice@example.test"},
                {"value":"b", "label":"Bob", "disabled":true},
                {"value":"b", "label":"Bobby"},
                {"value":"c", "label":"Carol"}
            ]),
        ),
    ]);
    if let Some(label) = add_label {
        props.insert("addLabel".into(), json!(label));
    }
    if let Some(action) = add_action {
        props.insert("addAction".into(), json!(action));
    }
    Screen {
        version: "1".into(),
        id: "account-test".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "switcher".into(),
            node_type: "account/AccountSwitcher".into(),
            props,
            bindings: BTreeMap::new(),
            children: vec![],
            event: Some(
                json!({"on":"ely:action", "sourceAction":"choose-user", "action":"route-choice", "target":"switcher", "payload":{"picked":{"path":"/value", "type":"string"}}}),
            ),
            events: vec![],
            use_template: None,
            params: BTreeMap::new(),
            param_bindings: BTreeMap::new(),
            slots: BTreeMap::new(),
            when: None,
            repeat: None,
        },
    }
}

#[gpui::test]
fn account_switcher_honors_disabled_rows_and_custom_actions(cx: &mut TestAppContext) {
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
        assert_eq!(
            window.viewport_size(),
            gpui::size(gpui::px(390.), gpui::px(844.))
        );
        window.activate_window();
        view.update(cx, |view, cx| {
            view.load_screen(
                screen(false, Some("Connect account"), Some("connect-user")),
                window,
                cx,
            )
            .unwrap()
        });
    });
    vcx.run_until_parked();
    let trigger = vcx
        .debug_bounds("account-switcher-trigger")
        .expect("trigger");
    vcx.simulate_click(
        gpui::point(trigger.left() + gpui::px(24.), trigger.center().y),
        Modifiers::none(),
    );
    vcx.run_until_parked();
    let bob = vcx.debug_bounds("menu-row-Bob").expect("disabled Bob");
    vcx.simulate_click(bob.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("account_name"), Some(&json!("a")));
        assert!(
            !view
                .events()
                .iter()
                .any(|event| event.event == "ely:action")
        );
    });
    let bobby = vcx
        .debug_bounds("menu-row-Bobby")
        .expect("enabled duplicate value");
    vcx.simulate_click(bobby.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("account_name"), Some(&json!("b")))
    });
    let trigger = vcx
        .debug_bounds("account-switcher-trigger")
        .expect("updated trigger");
    vcx.simulate_click(trigger.center(), Modifiers::none());
    vcx.run_until_parked();
    let carol = vcx.debug_bounds("menu-row-Carol").expect("enabled Carol");
    vcx.simulate_click(carol.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.update(|_, cx| view.update(cx, |view, _| {
        assert_eq!(view.value("account_name"), Some(&json!("c")));
        assert!(view.events().iter().any(|event| event.node_id == "switcher" && event.event == "ely:change" && event.value == json!({"id":"switcher", "component":"account/AccountSwitcher", "name":"account", "value":"c"})));
        assert!(view.events().iter().any(|event| event.node_id == "switcher" && event.event == "ely:action" && event.value == json!({"id":"switcher", "component":"account/AccountSwitcher", "action":"choose-user", "value":"c"})));
        assert!(view.take_action_requests().iter().any(|request| request.action == "route-choice" && request.payload.get("picked") == Some(&json!("c"))));
    }));
    let trigger = vcx
        .debug_bounds("account-switcher-trigger")
        .expect("updated trigger");
    vcx.simulate_click(
        gpui::point(trigger.left() + gpui::px(24.), trigger.center().y),
        Modifiers::none(),
    );
    vcx.run_until_parked();
    let add = vcx
        .debug_bounds("menu-row-Connect account")
        .expect("custom add label");
    vcx.simulate_click(add.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert!(view.events().iter().any(|event| event.event == "ely:action" && event.value == json!({"id":"switcher", "component":"account/AccountSwitcher", "action":"connect-user"}))));
}

#[gpui::test]
fn disabled_account_switcher_cannot_open_or_emit(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| theme.touch_mode = true);
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(screen(true, Some("Add"), None), window, cx)
                .unwrap()
        })
    });
    vcx.run_until_parked();
    let trigger = vcx
        .debug_bounds("account-switcher-trigger")
        .expect("disabled trigger");
    vcx.simulate_click(trigger.center(), Modifiers::none());
    vcx.run_until_parked();
    assert!(vcx.debug_bounds("menu-row-Carol").is_none());
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("account_name"), Some(&json!("a")));
        assert!(view.events().is_empty());
    });
}

#[gpui::test]
fn account_switcher_add_label_uses_default_action_and_absence_hides_it(cx: &mut TestAppContext) {
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
        window.activate_window();
        view.update(cx, |view, cx| {
            view.load_screen(screen(false, Some("Another"), None), window, cx)
                .unwrap()
        });
    });
    vcx.run_until_parked();
    let trigger = vcx.debug_bounds("account-switcher-trigger").unwrap();
    vcx.simulate_click(
        gpui::point(trigger.left() + gpui::px(24.), trigger.center().y),
        Modifiers::none(),
    );
    vcx.run_until_parked();
    let add = vcx.debug_bounds("menu-row-Another").expect("add option");
    vcx.simulate_click(add.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert!(view.events().iter().any(|event| event.event == "ely:action" && event.value == json!({"id":"switcher", "component":"account/AccountSwitcher", "action":"add-account"}))));
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(screen(false, None, Some("custom-add")), window, cx)
                .unwrap()
        })
    });
    vcx.run_until_parked();
    let trigger = vcx.debug_bounds("account-switcher-trigger").unwrap();
    vcx.simulate_click(
        gpui::point(trigger.left() + gpui::px(24.), trigger.center().y),
        Modifiers::none(),
    );
    vcx.run_until_parked();
    let add = vcx
        .debug_bounds("menu-row-Add account")
        .expect("default add label");
    vcx.simulate_click(add.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert!(view.events().iter().any(|event| event.event == "ely:action" && event.value == json!({"id":"switcher", "component":"account/AccountSwitcher", "action":"custom-add"}))));
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(screen(false, None, None), window, cx)
                .unwrap()
        })
    });
    vcx.run_until_parked();
    let trigger = vcx.debug_bounds("account-switcher-trigger").unwrap();
    vcx.simulate_click(
        gpui::point(trigger.left() + gpui::px(24.), trigger.center().y),
        Modifiers::none(),
    );
    vcx.run_until_parked();
    assert!(vcx.debug_bounds("menu-row-Carol").is_some());
    assert!(vcx.debug_bounds("menu-row-Add account").is_none());
}

#[gpui::test]
fn ely_account_switcher_add_callback_uses_caller_action(cx: &mut TestAppContext) {
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
        window.activate_window();
        view.update(cx, |view, cx| {
            view.load_screen(screen(false, None, Some("connect-user")), window, cx)
                .unwrap()
        });
    });
    vcx.run_until_parked();
    let root = vcx.debug_bounds("cat-screen-root").expect("screen");
    vcx.simulate_click(
        gpui::point(root.left() + gpui::px(30.), root.top() + gpui::px(20.)),
        Modifiers::none(),
    );
    vcx.run_until_parked();
    let add = vcx
        .debug_bounds("menu-row-Add account")
        .expect("Ely add option");
    vcx.simulate_click(add.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert!(view.events().iter().any(|event| event.event == "ely:action" && event.value == json!({"id":"switcher", "component":"account/AccountSwitcher", "action":"connect-user"}))));
}
