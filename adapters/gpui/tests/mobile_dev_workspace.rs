use std::collections::BTreeMap;

use ely_gpui_component::{init_for_tests, theme::Theme};
use elysdui_gpui::{
    catalogue::CatalogueView,
    dashboard::{Screen, ScreenNode},
};
use gpui::{AppContext, Modifiers, TestAppContext};
use serde_json::json;

fn socket_screen(state: &str, disabled: bool) -> Screen {
    Screen {
        version: "1".into(),
        id: "mobile-socket".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "socket".into(),
            node_type: "devtools/WebSocketConsole".into(),
            props: BTreeMap::from([
                (
                    "devtools".into(),
                    json!({"url":"wss://example.test/live", "state":state}),
                ),
                ("disabled".into(), json!(disabled)),
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
    }
}

fn setup<'a>(
    cx: &'a mut TestAppContext,
    state: &str,
    disabled: bool,
) -> (gpui::Entity<CatalogueView>, &'a mut gpui::VisualTestContext) {
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
    let screen = socket_screen(state, disabled);
    vcx.update(|window, cx| {
        assert_eq!(
            window.viewport_size(),
            gpui::size(gpui::px(390.), gpui::px(844.))
        );
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();
    (view, vcx)
}

#[gpui::test]
fn mobile_socket_send_emits_host_action_with_message_and_url(cx: &mut TestAppContext) {
    let (view, vcx) = setup(cx, "open", false);
    let input = vcx.debug_bounds("input-text").expect("socket input");
    vcx.simulate_click(input.center(), Modifiers::none());
    vcx.simulate_input("hello mobile");
    vcx.run_until_parked();
    vcx.simulate_keystrokes("enter");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert!(view.events().iter().any(|event| event.node_id == "socket" && event.event == "ely:action" && event.value == json!({"action":"send-socket", "text":"hello mobile", "url":"wss://example.test/live"})));
    });
    vcx.simulate_keystrokes("enter");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(
            view.events()
                .iter()
                .filter(|event| event.event == "ely:action")
                .count(),
            1
        );
    });
}

#[gpui::test]
fn mobile_socket_toggle_reports_current_state(cx: &mut TestAppContext) {
    let (view, vcx) = setup(cx, "closed", false);
    let toggle = vcx.debug_bounds("socket-toggle").expect("socket toggle");
    vcx.simulate_click(toggle.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert!(view.events().iter().any(|event| event.node_id == "socket" && event.event == "ely:action" && event.value == json!({"action":"toggle-socket", "url":"wss://example.test/live", "state":"closed"})));
    });
}

#[gpui::test]
fn mobile_disabled_socket_rejects_input_and_toggle(cx: &mut TestAppContext) {
    let (view, vcx) = setup(cx, "open", true);
    let toggle = vcx.debug_bounds("socket-toggle").expect("disabled toggle");
    vcx.simulate_click(toggle.center(), Modifiers::none());
    let input = vcx.debug_bounds("input-text").expect("disabled input");
    vcx.simulate_click(input.center(), Modifiers::none());
    vcx.simulate_input("must not send");
    vcx.simulate_keystrokes("enter");
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert!(view.events().is_empty()));
}

#[gpui::test]
fn mobile_opening_socket_cannot_toggle(cx: &mut TestAppContext) {
    let (view, vcx) = setup(cx, "opening", false);
    let toggle = vcx.debug_bounds("socket-toggle").expect("opening toggle");
    vcx.simulate_click(toggle.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| assert!(view.events().is_empty()));
}

#[gpui::test]
fn mobile_table_structure_does_not_overlap_following_control(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| {
            theme.touch_mode = true;
            theme.reduced_motion = true;
        });
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(2000.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).unwrap();
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let mut socket = socket_screen("open", false).root;
    let mut editor = socket.clone();
    editor.id = "structure".into();
    editor.node_type = "devtools/TableStructureEditor".into();
    editor.props = BTreeMap::from([(
        "devtools".into(),
        json!({"fields":[
            {"name":"id","type":"int"}, {"name":"user_id","type":"int"},
            {"name":"total","type":"numeric"}, {"name":"placed_at","type":"text"}
        ]}),
    )]);
    socket.id = "socket".into();
    let mut root = socket.clone();
    root.id = "stack".into();
    root.node_type = "basic/stack".into();
    root.props = BTreeMap::new();
    root.children = vec![editor, socket];
    let screen = Screen {
        version: "1".into(),
        id: "structure-stack".into(),
        loader: None,
        templates: BTreeMap::new(),
        root,
    };
    vcx.update(|window, cx| view.update(cx, |v, cx| v.load_screen(screen, window, cx).unwrap()));
    vcx.run_until_parked();
    let editor = vcx
        .debug_bounds("table-structure-container")
        .expect("structure editor");
    let toggle = vcx.debug_bounds("socket-toggle").expect("next component");
    assert!(
        editor.size.height > gpui::px(280.),
        "mobile editor needs its natural height: {editor:?}"
    );
    assert!(
        toggle.top() >= editor.bottom(),
        "the following component must not overlap: {editor:?}, {toggle:?}"
    );
}
