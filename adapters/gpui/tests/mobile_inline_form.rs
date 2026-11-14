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
fn inline_fields_keep_private_identity_and_route_changes(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| {
            theme.touch_mode = true;
            theme.reduced_motion = true;
        });
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| CatalogueView::new());
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let mut form = node("inline", "forms/InlineForm", BTreeMap::from([(
        "fields".into(), json!([{"name":"message", "label":"Message", "value":"inside"}]),
    )]));
    form.events = vec![
        json!({"on":"change", "action":"native-changed", "target":"inline"}),
        json!({"on":"ely:change", "action":"field-changed", "target":"inline", "payload":{
            "field":{"path":"/name", "type":"string"},
            "value":{"path":"/value", "type":"string"},
            "checked":{"path":"/checked", "type":"boolean"},
            "type":{"path":"/type", "type":"string"},
            "id":{"path":"/id", "type":"string"},
            "component":{"path":"/component", "type":"string"}
        }}),
    ];
    let outside = node("outside", "forms/Input", BTreeMap::from([
        ("name".into(), json!("inline:inline-0")),
        ("value".into(), json!("outside")),
    ]));
    let mut root = node("root", "basic/stack", BTreeMap::new());
    root.children = vec![form, outside];
    let screen = Screen { version: "1".into(), id: "inline-private".into(), loader: None, templates: BTreeMap::new(), root };
    vcx.update(|window, cx| {
        assert_eq!(window.viewport_size(), gpui::size(gpui::px(390.), gpui::px(844.)));
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();
    vcx.update(|_, cx| view.update(cx, |view, cx| view.set_text("inline:inline-0", "outside changed", cx)));
    vcx.run_until_parked();
    let field = vcx.debug_bounds("inline-form-field-0").expect("inline field");
    vcx.simulate_click(gpui::point(field.center().x, field.bottom() - gpui::px(10.)), Modifiers::none());
    vcx.simulate_keystrokes("end");
    vcx.simulate_input("!");
    vcx.run_until_parked();
    vcx.update(|_, cx| view.update(cx, |view, _| {
        assert_eq!(view.value("inline:inline-0"), Some(&json!("outside changed")));
        let detail = json!({"id":"inline", "component":"forms/InlineForm", "name":"message", "value":"inside!", "checked":false, "type":"text"});
        assert!(view.events().iter().any(|event| event.node_id == "inline" && event.event == "ely:change" && event.value == detail));
        let requests = view.take_action_requests();
        assert!(requests.iter().any(|request| request.action == "native-changed"));
        let request = requests.iter().find(|request| request.action == "field-changed" && request.payload.get("value") == Some(&json!("inside!"))).expect("field change binding");
        assert_eq!(request.payload.get("field"), Some(&json!("message")));
        assert_eq!(request.payload.get("checked"), Some(&json!(false)));
        assert_eq!(request.payload.get("type"), Some(&json!("text")));
        assert_eq!(request.payload.get("id"), Some(&json!("inline")));
        assert_eq!(request.payload.get("component"), Some(&json!("forms/InlineForm")));
    }));
    let submit = vcx.debug_bounds("inline-form-submit-inline").expect("submit");
    vcx.simulate_click(submit.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert!(view.events().iter().any(|event| event.node_id == "inline" && event.event == "ely:action" && event.value["formData"] == json!([["message", "inside!"]]))));
}

#[gpui::test]
fn disabled_inline_field_does_not_lock_a_public_namesake(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| CatalogueView::new());
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let form = node("inline", "forms/InlineForm", BTreeMap::from([(
        "fields".into(), json!([{"name":"private", "label":"Private", "value":"hidden", "disabled":true}]),
    )]));
    let outside = node("outside", "forms/Input", BTreeMap::from([
        ("name".into(), json!("inline:inline-0")),
        ("value".into(), json!("outside")),
    ]));
    let mut root = node("root", "basic/stack", BTreeMap::new());
    root.children = vec![form, outside];
    let screen = Screen { version: "1".into(), id: "inline-lock".into(), loader: None, templates: BTreeMap::new(), root };
    vcx.update(|window, cx| view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap()));
    vcx.run_until_parked();
    vcx.update(|_, cx| view.update(cx, |view, cx| view.set_text("inline:inline-0", "updated", cx)));
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert_eq!(view.value("inline:inline-0"), Some(&json!("updated"))));
    let submit = vcx.debug_bounds("inline-form-submit-inline").expect("submit");
    vcx.simulate_click(submit.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert!(view.events().iter().any(|event| event.node_id == "inline" && event.event == "ely:action" && event.value["formData"] == json!([]))));
}

#[gpui::test]
fn inline_form_submits_only_its_ordered_successful_text_fields(cx: &mut TestAppContext) {
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
    let mut form = node(
        "inline",
        "forms/InlineForm",
        BTreeMap::from([(
            "fields".into(),
            json!([
                {"name":"tag", "label":"Tag", "value":"", "required":true},
                {"name":"tag", "label":"Read only", "value":"second", "readonly":true},
                {"name":"skip", "label":"Disabled", "value":"secret", "disabled":true}
            ]),
        )]),
    );
    form.event = Some(
        json!({"on":"ely:action", "sourceAction":"save", "action":"save-inline", "target":"inline"}),
    );
    let outside = node(
        "outside",
        "forms/Input",
        BTreeMap::from([
            ("name".into(), json!("outside")),
            ("value".into(), json!("not-in-form")),
        ]),
    );
    let mut root = node("root", "basic/stack", BTreeMap::new());
    root.children = vec![form, outside];
    let screen = Screen {
        version: "1".into(),
        id: "inline-test".into(),
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
    let submit = vcx
        .debug_bounds("inline-form-submit-inline")
        .expect("submit button");
    vcx.simulate_click(submit.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert!(
            !view
                .events()
                .iter()
                .any(|event| event.event == "ely:action")
        )
    });
    let field = vcx
        .debug_bounds("inline-form-field-0")
        .expect("required field");
    vcx.simulate_click(
        gpui::point(field.center().x, field.bottom() - gpui::px(10.)),
        Modifiers::none(),
    );
    vcx.simulate_input("first");
    vcx.run_until_parked();
    let submit = vcx
        .debug_bounds("inline-form-submit-inline")
        .expect("submit button");
    vcx.simulate_click(submit.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.update(|_, cx| view.update(cx, |view, _| {
        let event = view.events().iter().find(|event| event.node_id == "inline" && event.event == "ely:action").expect("inline action");
        assert_eq!(event.value, json!({"action":"save", "formData":[["tag","first"],["tag","second"]], "values":[["tag","first"],["tag","second"]], "submitter":""}));
        assert!(view.take_action_requests().iter().any(|request| request.action == "save-inline" && request.target == "inline"));
    }));
}

#[gpui::test]
fn inline_form_rejects_unsupported_field_type_instead_of_submitting(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let screen = Screen {
        version: "1".into(),
        id: "unsupported-inline".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "inline",
            "forms/InlineForm",
            BTreeMap::from([(
                "items".into(),
                json!([{"name":"mail", "type":"email", "value":"bad"}]),
            )]),
        ),
    };
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap())
    });
    vcx.run_until_parked();
    let submit = vcx
        .debug_bounds("inline-form-submit-inline")
        .expect("submit button");
    vcx.simulate_click(submit.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert!(
            view.last_error()
                .is_some_and(|error| error.contains("unsupported"))
        );
        assert!(
            !view
                .events()
                .iter()
                .any(|event| event.event == "ely:action")
        );
    });
}

#[gpui::test]
fn inline_form_blocks_disabled_submission_and_enter_submits_items(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| theme.touch_mode = true);
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let screen = |disabled| Screen {
        version: "1".into(),
        id: "inline-items".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "inline",
            "forms/InlineForm",
            BTreeMap::from([
                ("disabled".into(), json!(disabled)),
                ("action".into(), json!("update")),
                (
                    "items".into(),
                    json!([{"name":"message", "label":"Message", "value":"ready"}]),
                ),
            ]),
        ),
    };
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(screen(true), window, cx).unwrap()
        })
    });
    vcx.run_until_parked();
    let submit = vcx
        .debug_bounds("inline-form-submit-inline")
        .expect("disabled submit");
    vcx.simulate_click(submit.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert!(
            !view
                .events()
                .iter()
                .any(|event| event.event == "ely:action")
        )
    });
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(screen(false), window, cx).unwrap()
        })
    });
    vcx.run_until_parked();
    let field = vcx
        .debug_bounds("inline-form-field-0")
        .expect("enabled field");
    vcx.simulate_click(
        gpui::point(field.center().x, field.bottom() - gpui::px(10.)),
        Modifiers::none(),
    );
    vcx.simulate_keystrokes("end");
    vcx.simulate_input("!");
    vcx.run_until_parked();
    vcx.simulate_keystrokes("enter");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert!(view.events().iter().any(|event| event.event == "ely:action" && event.value == json!({"action":"update", "formData":[["message","ready!"]], "values":[["message","ready!"]], "submitter":""}))));
}

#[gpui::test]
fn mobile_time_picker_keeps_time_and_changes_in_quarter_hours(cx: &mut TestAppContext) {
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
    let screen = Screen {
        version: "1".into(),
        id: "mobile-time".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "clock",
            "forms/TimePicker",
            BTreeMap::from([("value".into(), json!("12:30"))]),
        ),
    };
    vcx.update(|window, cx| {
        assert_eq!(
            window.viewport_size(),
            gpui::size(gpui::px(390.), gpui::px(844.))
        );
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();
    assert!(vcx.debug_bounds("time-picker-control").is_some());
    vcx.update(|window, cx| window.focus_next(cx));
    vcx.simulate_keystrokes("enter");
    vcx.run_until_parked();
    vcx.simulate_keystrokes("down");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("clock"), Some(&json!("12:45")));
        assert!(view.events().iter().any(|event| event.node_id == "clock"
            && event.event == "change"
            && event.value == json!("12:45")));
    });
}

#[gpui::test]
fn mobile_time_picker_preserves_seconds_and_disabled_state(cx: &mut TestAppContext) {
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
    let screen = |disabled| Screen {
        version: "1".into(),
        id: "time-seconds".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "clock",
            "forms/TimePicker",
            BTreeMap::from([
                ("value".into(), json!("12:30:05.123")),
                ("disabled".into(), json!(disabled)),
            ]),
        ),
    };
    vcx.update(|window, cx| {
        assert_eq!(
            window.viewport_size(),
            gpui::size(gpui::px(390.), gpui::px(844.))
        );
        view.update(cx, |view, cx| {
            view.load_screen(screen(false), window, cx).unwrap()
        });
    });
    vcx.run_until_parked();
    vcx.update(|window, cx| window.focus_next(cx));
    vcx.simulate_keystrokes("enter");
    vcx.run_until_parked();
    vcx.simulate_keystrokes("down");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("clock"), Some(&json!("12:45:05.123")))
    });
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(screen(true), window, cx).unwrap()
        })
    });
    vcx.run_until_parked();
    let control = vcx
        .debug_bounds("time-picker-control")
        .expect("disabled picker");
    let event_count = vcx.read_entity(&view, |view, _| view.events().len());
    vcx.simulate_click(control.center(), Modifiers::none());
    vcx.simulate_keystrokes("enter down");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("clock"), Some(&json!("12:30:05.123")));
        assert_eq!(view.events().len(), event_count);
    });
}

#[gpui::test]
fn mobile_inline_form_never_submits_unchecked_length_constraints(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    for key in ["minLength", "maxLength"] {
        let make_screen = |length: Value| Screen {
            version: "1".into(),
            id: "length-guard".into(),
            loader: None,
            templates: BTreeMap::new(),
            root: node(
                "inline",
                "forms/InlineForm",
                BTreeMap::from([(
                    "fields".into(),
                    json!([{"name":"text", "value":"x", (key):length}]),
                )]),
            ),
        };
        vcx.update(|window, cx| {
            view.update(cx, |view, cx| {
                let error = view
                    .load_screen(make_screen(json!(4)), window, cx)
                    .unwrap_err();
                assert!(error.message.contains("expected string"));
                view.load_screen(make_screen(json!("4")), window, cx)
                    .unwrap();
            })
        });
        vcx.run_until_parked();
        let submit = vcx
            .debug_bounds("inline-form-submit-inline")
            .expect("submit");
        vcx.simulate_click(submit.center(), Modifiers::none());
        vcx.run_until_parked();
        vcx.read_entity(&view, |view, _| {
            assert!(
                view.last_error()
                    .is_some_and(|error| error.contains("unsupported"))
            );
            assert!(
                !view
                    .events()
                    .iter()
                    .any(|event| event.event == "ely:action")
            );
        });
    }
}

#[gpui::test]
fn mobile_time_picker_enforces_minimum_and_uses_its_step_base(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| theme.touch_mode = true);
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let screen = Screen {
            version: "1".into(),
            id: "bounded-time".into(),
            loader: None,
            templates: BTreeMap::new(),
            root: node(
                "clock",
                "forms/TimePicker",
                BTreeMap::from([
                    ("value".into(), json!("09:05")),
                    ("min".into(), json!("09:05")),
                ]),
            ),
        };
    vcx.update(|window, cx| view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap()));
    vcx.run_until_parked();
    vcx.update(|window, cx| window.focus_next(cx));
    vcx.simulate_keystrokes("enter up");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("clock"), Some(&json!("09:05")));
        assert!(!view.events().iter().any(|event| event.node_id == "clock" && event.event == "change"));
    });
    vcx.simulate_keystrokes("down");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("clock"), Some(&json!("09:20")));
        assert!(view.events().iter().any(|event| event.node_id == "clock" && event.event == "change" && event.value == json!("09:20")));
    });
}

#[gpui::test]
fn mobile_time_picker_keeps_original_step_base_after_state_changes(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| theme.touch_mode = true);
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| CatalogueView::new());
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let screen = Screen {
        version: "1".into(), id: "stable-time-base".into(), loader: None, templates: BTreeMap::new(),
        root: node("clock", "forms/TimePicker", BTreeMap::from([("value".into(), json!("12:31"))])),
    };
    vcx.update(|window, cx| {
        assert_eq!(window.viewport_size(), gpui::size(gpui::px(390.), gpui::px(844.)));
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();
    vcx.update(|_, cx| view.update(cx, |view, cx| view.set_value("clock", json!("12:45"), cx)));
    vcx.run_until_parked();
    vcx.update(|window, cx| window.focus_next(cx));
    vcx.simulate_keystrokes("enter down");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("clock"), Some(&json!("12:46")));
        assert!(view.events().iter().any(|event| event.node_id == "clock" && event.event == "change" && event.value == json!("12:46")));
    });
}

#[gpui::test]
fn mobile_time_picker_crosses_midnight_and_stops_at_maximum(cx: &mut TestAppContext) {
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
    let screen = Screen {
        version: "1".into(),
        id: "overnight-time".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "clock",
            "forms/TimePicker",
            BTreeMap::from([
                ("value".into(), json!("23:45")),
                ("min".into(), json!("23:00")),
                ("max".into(), json!("00:00")),
            ]),
        ),
    };
    vcx.update(|window, cx| {
        assert_eq!(window.viewport_size(), gpui::size(gpui::px(390.), gpui::px(844.)));
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();
    vcx.update(|window, cx| window.focus_next(cx));
    vcx.simulate_keystrokes("enter down");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("clock"), Some(&json!("00:00")));
        assert!(view.events().iter().any(|event| event.node_id == "clock"
            && event.event == "change" && event.value == json!("00:00")));
    });
    vcx.simulate_keystrokes("down");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("clock"), Some(&json!("00:00")));
        assert_eq!(view.events().iter().filter(|event| event.node_id == "clock"
            && event.event == "change").count(), 1);
    });
}

#[gpui::test]
fn mobile_time_picker_ignores_invalid_html_bounds(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| theme.touch_mode = true);
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let screen = Screen {
        version: "1".into(),
        id: "invalid-time-bounds".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "clock",
            "forms/TimePicker",
            BTreeMap::from([
                ("value".into(), json!("12:30")),
                ("min".into(), json!("0")),
                ("max".into(), json!(23)),
            ]),
        ),
    };
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap())
    });
    vcx.run_until_parked();
    vcx.update(|window, cx| window.focus_next(cx));
    vcx.simulate_keystrokes("enter");
    vcx.run_until_parked();
    vcx.simulate_keystrokes("down");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("clock"), Some(&json!("12:45")));
        assert!(view.events().iter().any(|event| event.node_id == "clock"
            && event.event == "change"
            && event.value == json!("12:45")));
    });
}

#[gpui::test]
fn inline_form_schema_rejects_submit_binding(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let mut form = node("inline", "forms/InlineForm", BTreeMap::new());
    form.event = Some(json!({"on":"submit", "action":"save-inline", "target":"inline"}));
    let screen = Screen {
        version: "1".into(),
        id: "unsupported-binding".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: form,
    };
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            let error = view.load_screen(screen, window, cx).unwrap_err();
            assert!(error.message.contains("does not support event submit"));
        })
    });
}
