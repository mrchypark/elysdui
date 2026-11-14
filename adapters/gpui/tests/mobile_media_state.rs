use std::collections::BTreeMap;

use ely_gpui_component::{init_for_tests, theme::Theme};
use elysdui_gpui::{
    catalogue::CatalogueView,
    dashboard::{Screen, ScreenNode},
};
use gpui::{AppContext, Modifiers, TestAppContext};
use serde_json::json;

#[gpui::test]
fn mobile_playlist_activation_emits_htmx_change_and_track_action(cx: &mut TestAppContext) {
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
        id: "media-test".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "playlist".into(),
            node_type: "media/Playlist".into(),
            props: BTreeMap::from([
                ("playAction".into(), json!("queue-track")),
                (
                    "items".into(),
                    json!([
                        {"value":"one", "label":"First", "selected":true},
                        {"value":"two", "label":"Second", "action":"play-special"}
                    ]),
                ),
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
        window.activate_window();
        view.update(cx, |view, cx| {
            view.load_screen(screen.clone(), window, cx).unwrap()
        });
    });
    vcx.run_until_parked();
    let position = vcx.debug_bounds("list-item-Second").unwrap().center();
    vcx.simulate_click(position, Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("playlist"), Some(&json!("two")));
        assert_eq!(
            view.events()
                .iter()
                .filter(|event| event.event == "ely:action")
                .count(),
            1
        );
        assert!(view.events().iter().any(|event| event.node_id == "playlist"
            && event.event == "ely:change"
            && event.value == json!({"selection":"two", "playing":true})));
        assert!(view.events().iter().any(|event| event.node_id == "playlist"
            && event.event == "ely:action"
            && event.value == json!({"action":"play-special", "key":"two"})));
    });
    assert!(vcx.debug_bounds("item-selected-Second").is_some());
    assert!(vcx.debug_bounds("playlist-playing-true").is_some());
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();
    assert!(vcx.debug_bounds("item-selected-First").is_some());
    assert!(vcx.debug_bounds("item-selected-Second").is_none());
    assert!(vcx.debug_bounds("playlist-playing-false").is_some());
}
