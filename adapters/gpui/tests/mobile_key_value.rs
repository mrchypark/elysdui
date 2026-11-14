use ely_gpui_component::init_for_tests;
use elysdui_gpui::{
    catalogue::CatalogueView,
    dashboard::{Screen, ScreenNode},
};
use gpui::{AppContext, Modifiers, TestAppContext};
use serde_json::json;
use std::collections::BTreeMap;

#[gpui::test]
fn disabled_pair_cannot_be_removed_after_an_earlier_pair_is_removed(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).unwrap();
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let screen = Screen {
        version: "1".into(),
        id: "pairs".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "pairs".into(),
            node_type: "forms/KeyValueInput".into(),
            props: BTreeMap::from([
                ("name".into(), json!("pairs")),
                (
                    "items".into(),
                    json!([
                        {"key":"first","value":"1"}, {"key":"locked","value":"2","disabled":true}
                    ]),
                ),
            ]),
            bindings: BTreeMap::new(),
            children: vec![],
            event: None,
            events: vec![],
            use_template: None,
            params: BTreeMap::new(),
            param_bindings: BTreeMap::new(),
            slots: BTreeMap::new(),
            when: None,
            repeat: None,
        },
    };
    let mut updated = screen.clone();
    updated.root.props.insert(
        "items".into(),
        json!([
            {"key":"locked","value":"updated","disabled":true},
            {"key":"first","value":"new"}
        ]),
    );
    vcx.update(|window, cx| {
        window.activate_window();
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();
    let locked = vcx.debug_bounds("pairs-remove-1").unwrap();
    vcx.simulate_click(locked.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert!(view.events().is_empty()));
    let first = vcx.debug_bounds("pairs-remove-0").unwrap();
    vcx.simulate_click(first.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert!(
            view.events().iter().any(|event| event.event == "change"
                && event.value == json!([{"key":"locked","value":"2"}]))
        )
    });
    let before = vcx.read_entity(&view, |view, _| view.events().len());
    let locked = vcx.debug_bounds("pairs-remove-0").unwrap();
    vcx.simulate_click(locked.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert_eq!(view.events().len(), before));

    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(updated, window, cx).unwrap()
        })
    });
    vcx.run_until_parked();
    let before = vcx.read_entity(&view, |view, _| view.events().len());
    let locked = vcx.debug_bounds("pairs-remove-0").unwrap();
    vcx.simulate_click(locked.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert_eq!(view.events().len(), before));
    let first = vcx.debug_bounds("pairs-remove-1").unwrap();
    vcx.simulate_click(first.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert!(view.events().iter().any(|event| event.event == "change"
            && event.value == json!([{"key":"locked","value":"updated"}])))
    });
}

#[gpui::test]
fn disabled_pair_control_blocks_add_and_remove(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).unwrap();
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let screen = Screen {
        version: "1".into(),
        id: "disabled-pairs".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "pairs".into(),
            node_type: "forms/KeyValueInput".into(),
            props: BTreeMap::from([
                ("name".into(), json!("pairs")),
                ("disabled".into(), json!(true)),
                ("items".into(), json!([{"key":"locked","value":"2"}])),
            ]),
            bindings: BTreeMap::new(),
            children: vec![],
            event: None,
            events: vec![],
            use_template: None,
            params: BTreeMap::new(),
            param_bindings: BTreeMap::new(),
            slots: BTreeMap::new(),
            when: None,
            repeat: None,
        },
    };
    vcx.update(|window, cx| {
        window.activate_window();
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();
    for selector in ["pairs-remove-0", "pairs-add"] {
        let button = vcx.debug_bounds(selector).unwrap();
        vcx.simulate_click(button.center(), Modifiers::none());
        vcx.run_until_parked();
    }
    vcx.read_entity(&view, |view, _| assert!(view.events().is_empty()));
    assert!(vcx.debug_bounds("pairs-remove-0").is_some());
    assert!(vcx.debug_bounds("pairs-remove-1").is_none());
}
