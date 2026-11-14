use std::collections::BTreeMap;

use ely_gpui_component::{init_for_tests, theme::Theme};
use elysdui_gpui::{
    catalogue::CatalogueView,
    dashboard::{Screen, ScreenNode},
};
use gpui::{AppContext, Modifiers, TestAppContext};
use serde_json::json;

#[gpui::test]
fn mobile_tag_input_preserves_initial_tags_and_emits_go_values(cx: &mut TestAppContext) {
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
        id: "tag-input-mobile".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "tags".into(),
            node_type: "forms/TagInput".into(),
            props: BTreeMap::from([
                ("name".into(), json!("topics")),
                ("value".into(), json!("rust,gpui")),
                ("placeholder".into(), json!("Add a tag")),
            ]),
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
    assert!(
        vcx.debug_bounds("tag cat-tags-tag-0").is_some(),
        "rust chip"
    );
    assert!(
        vcx.debug_bounds("tag cat-tags-tag-1").is_some(),
        "gpui chip"
    );
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("topics"), Some(&json!("rust,gpui")))
    });

    vcx.update(|window, cx| window.focus_next(cx));
    vcx.simulate_input("mobile");
    vcx.simulate_keystrokes("enter");
    vcx.run_until_parked();
    assert!(
        vcx.debug_bounds("tag cat-tags-tag-2").is_some(),
        "added chip"
    );
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("topics"), Some(&json!("rust,gpui,mobile")));
        assert!(view.events().iter().any(|event| event.node_id == "tags"
            && event.event == "ely:change"
            && event.value == json!({"id":"tags", "component":"forms/TagInput", "name":"topics", "value":"rust,gpui,mobile", "checked":false, "type":"hidden"})));
    });

    let first = vcx.debug_bounds("tag cat-tags-tag-0").expect("first chip");
    vcx.simulate_click(
        gpui::point(first.right() - gpui::px(8.), first.center().y),
        Modifiers::none(),
    );
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("topics"), Some(&json!("gpui,mobile")));
        assert!(view.events().iter().any(|event| event.node_id == "tags"
            && event.event == "ely:change"
            && event.value == json!({"id":"tags", "component":"forms/TagInput", "name":"topics", "value":"gpui,mobile", "checked":false, "type":"hidden"})));
    });
}
