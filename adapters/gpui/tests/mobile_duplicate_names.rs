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

#[gpui::test]
fn duplicate_names_do_not_share_input_state_or_event_routes(cx: &mut TestAppContext) {
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
    let mut multi = node(
        "multi",
        "forms/MultiSelect",
        BTreeMap::from([
            ("name".into(), json!("shared")),
            ("value".into(), json!("alpha")),
            (
                "options".into(),
                json!([
                    {"value":"alpha", "label":"Alpha"},
                    {"value":"beta", "label":"Beta"}
                ]),
            ),
        ]),
    );
    multi.event = Some(json!({"on":"change", "action":"multi-changed", "target":"multi"}));
    let mut input = node(
        "input",
        "forms/Input",
        BTreeMap::from([
            ("name".into(), json!("shared")),
            ("label".into(), json!("Message")),
            ("value".into(), json!("original text")),
        ]),
    );
    input.event = Some(json!({"on":"change", "action":"input-changed", "target":"input"}));
    let mut root = node("root", "basic/stack", BTreeMap::new());
    root.children = vec![multi, input];
    let screen = Screen {
        version: "1".into(),
        id: "duplicate-names".into(),
        loader: None,
        templates: BTreeMap::new(),
        root,
    };
    vcx.update(|window, cx| {
        assert_eq!(
            window.viewport_size(),
            gpui::size(gpui::px(390.), gpui::px(844.))
        );
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();
    let initial_chip = vcx.debug_bounds("multi-chip-0").is_some();
    let initial = vcx.read_entity(&view, |view, _| {
        (
            view.value("multi").cloned(),
            view.value("input").cloned(),
            view.value("shared").cloned(),
        )
    });

    let control = vcx
        .debug_bounds("multi-select-control")
        .expect("multi-select control");
    vcx.simulate_click(
        gpui::point(control.right() - gpui::px(8.), control.center().y),
        Modifiers::none(),
    );
    vcx.run_until_parked();
    vcx.simulate_keystrokes("down enter");
    vcx.run_until_parked();
    let updated_beta_chip = vcx.debug_bounds("multi-chip-1").is_some();
    let updated = vcx.read_entity(&view, |view, _| {
        (
            view.value("multi").cloned(),
            view.value("input").cloned(),
            view.value("shared").cloned(),
            view.events().to_vec(),
            view.last_error().map(str::to_owned),
        )
    });
    vcx.simulate_keystrokes("escape");
    vcx.run_until_parked();
    let input = vcx.debug_bounds("input-text").expect("text input");
    vcx.simulate_click(input.center(), Modifiers::none());
    vcx.simulate_keystrokes("end");
    vcx.simulate_input("!");
    vcx.run_until_parked();
    let after_input_chip = vcx.debug_bounds("multi-chip-1").is_some();
    let after_input = vcx.read_entity(&view, |view, _| {
        (
            view.value("multi").cloned(),
            view.value("input").cloned(),
            view.value("shared").cloned(),
            view.events().to_vec(),
            view.last_error().map(str::to_owned),
        )
    });
    let actions = vcx.update(|_, cx| view.update(cx, |view, _| view.take_action_requests()));

    assert!(
        initial_chip
            && initial.0 == Some(json!(["alpha"]))
            && initial.1 == Some(json!("original text"))
            && updated_beta_chip
            && updated.0 == Some(json!(["alpha", "beta"]))
            && updated.1 == Some(json!("original text"))
            && updated.3.iter().any(|event| event.node_id == "multi"
                && event.event == "change"
                && event.value == json!(["alpha", "beta"]))
            && after_input_chip
            && after_input.0 == Some(json!(["alpha", "beta"]))
            && after_input.1 == Some(json!("original text!"))
            && after_input.3.iter().any(|event| event.node_id == "input"
                && event.event == "change"
                && event.value == json!("original text!"))
            && actions
                .iter()
                .any(|action| action.action == "multi-changed" && action.target == "multi")
            && actions
                .iter()
                .any(|action| action.action == "input-changed" && action.target == "input")
            && updated.4.is_none()
            && after_input.4.is_none(),
        "duplicate names interfered: initial chip={initial_chip}, initial={initial:?}, beta chip={updated_beta_chip}, updated={updated:?}, chip after typing={after_input_chip}, after_input={after_input:?}, actions={actions:?}"
    );
}

fn two_inputs(disabled_second: bool, first_value: &str, second_value: &str) -> Screen {
    let mut first = node(
        "first",
        "forms/Input",
        BTreeMap::from([
            ("name".into(), json!("shared")),
            ("value".into(), json!(first_value)),
        ]),
    );
    first.event = Some(json!({"on":"change", "action":"first-change", "target":"first"}));
    let mut second = node(
        "second",
        "forms/Input",
        BTreeMap::from([
            ("name".into(), json!("shared")),
            ("value".into(), json!(second_value)),
            ("disabled".into(), json!(disabled_second)),
        ]),
    );
    second.event = Some(json!({"on":"change", "action":"second-change", "target":"second"}));
    let unique = node(
        "unique-id",
        "forms/Input",
        BTreeMap::from([
            ("name".into(), json!("unique")),
            ("value".into(), json!("kept")),
        ]),
    );
    let mut root = node("root", "basic/stack", BTreeMap::new());
    root.children = vec![first, second, unique];
    Screen {
        version: "1".into(),
        id: "two-inputs".into(),
        loader: None,
        templates: BTreeMap::new(),
        root,
    }
}

#[gpui::test]
fn duplicate_inputs_keep_locks_events_and_reload_separate(cx: &mut TestAppContext) {
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
        view.update(cx, |view, cx| {
            view.load_screen(two_inputs(false, "one", "two"), window, cx)
                .unwrap()
        });
    });
    vcx.run_until_parked();
    vcx.update(|window, cx| {
        window.focus_next(cx);
    });
    vcx.simulate_keystrokes("end");
    vcx.simulate_input("!");
    vcx.run_until_parked();
    vcx.update(|window, cx| {
        window.focus_next(cx);
    });
    vcx.simulate_keystrokes("end");
    vcx.simulate_input("!");
    vcx.run_until_parked();
    vcx.update(|_, cx| {
        view.update(cx, |view, cx| {
            assert_eq!(view.value("first"), Some(&json!("one!")));
            assert_eq!(view.value("second"), Some(&json!("two!")));
            assert_eq!(view.value("unique"), Some(&json!("kept")));
            view.set_text("unique", "kept!", cx);
        })
    });
    vcx.run_until_parked();
    vcx.update(|_, cx| {
        view.update(cx, |view, cx| {
            assert_eq!(view.value("first"), Some(&json!("one!")));
            assert_eq!(view.value("second"), Some(&json!("two!")));
            let requests = view.take_action_requests();
            assert!(
                requests
                    .iter()
                    .any(|request| request.action == "first-change" && request.target == "first")
            );
            assert!(
                requests
                    .iter()
                    .any(|request| request.action == "second-change" && request.target == "second")
            );
            view.set_text("shared", "ambiguous", cx);
            assert!(
                view.last_error()
                    .is_some_and(|error| error.contains("Ambiguous state key"))
            );
            assert_eq!(view.value("first"), Some(&json!("one!")));
            assert_eq!(view.value("second"), Some(&json!("two!")));
        })
    });

    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(two_inputs(true, "fresh", "locked"), window, cx)
                .unwrap()
        })
    });
    vcx.run_until_parked();
    vcx.update(|_, cx| {
        view.update(cx, |view, cx| {
            assert_eq!(view.value("first"), Some(&json!("fresh")));
            assert_eq!(view.value("second"), Some(&json!("locked")));
            view.set_text("first", "edited", cx);
            view.set_text("second", "forbidden", cx);
        })
    });
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("first"), Some(&json!("edited")));
        assert_eq!(view.value("second"), Some(&json!("locked")));
    });
}

#[gpui::test]
fn duplicate_name_identity_does_not_collide_with_another_controls_name(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let mut screen = two_inputs(false, "one", "two");
    screen.root.children[2]
        .props
        .insert("name".into(), json!("first"));
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap())
    });
    vcx.run_until_parked();
    vcx.update(|_, cx| {
        view.update(cx, |view, cx| {
            assert_eq!(view.value("first"), Some(&json!("one")));
            assert_eq!(view.value("second"), Some(&json!("two")));
            assert_eq!(view.value("unique-id"), Some(&json!("kept")));
            view.set_text("first", "changed", cx);
        })
    });
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("first"), Some(&json!("changed")));
        assert_eq!(view.value("unique-id"), Some(&json!("kept")));
    });
}
