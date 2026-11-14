use std::collections::BTreeMap;

use ely_gpui_component::{init_for_tests, theme::Theme};
use elysdui_gpui::{
    catalogue::CatalogueView,
    dashboard::{Screen, ScreenNode},
};
use gpui::{AppContext, Modifiers, TestAppContext};
use serde_json::json;

#[gpui::test]
fn cascade_leaf_updates_scalar_and_emits_label_path(cx: &mut TestAppContext) {
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
    let view = window.root(cx).unwrap();
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let screen = Screen {
        version: "1".into(),
        id: "cascade-screen".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "office-picker".into(),
            node_type: "forms/CascadeSelect".into(),
            props: BTreeMap::from([
                ("name".into(), json!("office")),
                ("value".into(), json!("lis")),
                (
                    "options".into(),
                    json!([{ "value":"eu", "label":"Europe", "children":[{"value":"pt", "label":"Portugal", "children":[{"value":"lis", "label":"Lisbon"}, {"value":"opo", "label":"Porto"}]}]}]),
                ),
            ]),
            bindings: BTreeMap::new(),
            children: vec![],
            event: Some(
                json!({"on":"ely:action", "sourceAction":"select", "action":"office-chosen", "target":"office-picker", "payload":{"picked":{"path":"/value", "type":"string"}}}),
            ),
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
        assert_eq!(
            window.viewport_size(),
            gpui::size(gpui::px(390.), gpui::px(844.))
        );
        window.activate_window();
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("office"), Some(&json!("lis")));
        assert!(view.events().is_empty());
    });
    let trigger = vcx.debug_bounds("field-root").expect("cascade trigger");
    vcx.simulate_click(trigger.center(), Modifiers::none());
    vcx.run_until_parked();
    let leaf = vcx.debug_bounds("cascade-row-2-1").expect("Porto option");
    vcx.simulate_click(leaf.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("office"), Some(&json!("opo")));
        assert!(view.events().iter().any(|e| e.node_id == "office-picker" && e.event == "ely:change" && e.value == json!({"id":"office-picker", "component":"forms/CascadeSelect", "value":"opo", "path":["Europe","Portugal","Porto"]})));
        assert!(view.events().iter().any(|e| e.node_id == "office-picker" && e.event == "ely:action" && e.value == json!({"id":"office-picker", "component":"forms/CascadeSelect", "value":"opo", "path":["Europe","Portugal","Porto"], "action":"select"})));
    });
    vcx.update(|_, cx| {
        view.update(cx, |view, _| {
            assert!(
                view.take_action_requests()
                    .iter()
                    .any(|r| r.action == "office-chosen"
                        && r.payload.get("picked") == Some(&json!("opo")))
            );
        })
    });
    vcx.simulate_click(trigger.center(), Modifiers::none());
    vcx.run_until_parked();
    let lisbon = vcx
        .debug_bounds("cascade-row-2-0")
        .expect("selected path survives rerender");
    vcx.simulate_click(lisbon.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("office"), Some(&json!("lis")));
        let changes: Vec<_> = view.events().iter().filter(|e| e.event == "ely:change").collect();
        assert_eq!(changes.len(), 2);
        assert_eq!(changes[1].value, json!({"id":"office-picker", "component":"forms/CascadeSelect", "value":"lis", "path":["Europe","Portugal","Lisbon"]}));
    });
}
