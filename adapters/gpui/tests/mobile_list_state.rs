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
fn mobile_lists_select_caller_values_and_request_the_caller_cursor(cx: &mut TestAppContext) {
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
        id: "mobile-lists".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "list-stack",
            "basic/stack",
            BTreeMap::from([("horizontal".into(), json!(false))]),
        ),
    };
    let mut screen = screen;
    screen.root.children = vec![
        node(
            "virtual",
            "lists/VirtualList",
            BTreeMap::from([
                ("selectable".into(), json!(true)),
                ("multiple".into(), json!("true")),
                ("total".into(), json!(10_000)),
                ("start".into(), json!(41)),
                ("end".into(), json!(42)),
                (
                    "items".into(),
                    json!([
                        {"value":"v41", "label":"Virtual 41", "selected":"true"},
                        {"value":"v42", "label":"Virtual 42", "description":"Caller row"}
                    ]),
                ),
            ]),
        ),
        node(
            "infinite",
            "lists/InfiniteList",
            BTreeMap::from([
                ("selectable".into(), json!(true)),
                ("multiple".into(), json!("true")),
                ("cursor".into(), json!("page-2")),
                (
                    "items".into(),
                    json!([
                        {"value":"i1", "label":"Infinite 1", "selected":"true"},
                        {"value":"i2", "label":"Infinite 2"}
                    ]),
                ),
            ]),
        ),
    ];
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap())
    });
    vcx.run_until_parked();
    assert!(vcx.debug_bounds("item-selected-Virtual 41").is_some());
    assert!(vcx.debug_bounds("item-selected-Infinite 1").is_some());

    let virtual_second = vcx
        .debug_bounds("list-item-Virtual 42")
        .expect("virtual row at caller start offset");
    vcx.simulate_click(virtual_second.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(
            view.value("virtual"),
            Some(&json!({"value":"v42", "values":["v41", "v42"]}))
        );
        assert!(view.events().iter().any(|event| {
            event.node_id == "virtual"
                && event.event == "change"
                && event.value == json!({"value":"v42", "values":["v41", "v42"]})
        }));
    });
    assert!(vcx.debug_bounds("item-selected-Virtual 41").is_some());
    assert!(vcx.debug_bounds("item-selected-Virtual 42").is_some());

    let infinite_second = vcx
        .debug_bounds("list-item-Infinite 2")
        .expect("infinite caller row");
    vcx.simulate_click(infinite_second.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(
            view.value("infinite"),
            Some(&json!({"value":"i2", "values":["i1", "i2"]}))
        );
        assert!(view.events().iter().any(|event| {
            event.node_id == "infinite"
                && event.event == "ely:action"
                && event.value == json!({"action":"load-more", "value":"page-2", "cursor":"page-2"})
        }));
    });
    assert!(vcx.debug_bounds("item-selected-Infinite 1").is_some());
    assert!(vcx.debug_bounds("item-selected-Infinite 2").is_some());

    let virtual_first = vcx
        .debug_bounds("item-selected-Virtual 41")
        .expect("selected virtual row");
    vcx.simulate_click(virtual_first.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(
            view.value("virtual"),
            Some(&json!({"value":"v41", "values":["v42"]}))
        );
    });
    assert!(vcx.debug_bounds("item-selected-Virtual 41").is_none());
    assert!(vcx.debug_bounds("item-selected-Virtual 42").is_some());

    let infinite_first = vcx
        .debug_bounds("item-selected-Infinite 1")
        .expect("selected infinite row");
    vcx.simulate_click(infinite_first.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(
            view.value("infinite"),
            Some(&json!({"value":"i1", "values":["i2"]}))
        );
    });
    assert!(vcx.debug_bounds("item-selected-Infinite 1").is_none());
    assert!(vcx.debug_bounds("item-selected-Infinite 2").is_some());
}

#[gpui::test]
fn mobile_single_select_replaces_the_previous_value(cx: &mut TestAppContext) {
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
        id: "mobile-single-list".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "virtual",
            "lists/VirtualList",
            BTreeMap::from([
                ("selectable".into(), json!(true)),
                (
                    "items".into(),
                    json!([
                        {"value":"one", "label":"One"},
                        {"value":"two", "label":"Two"}
                    ]),
                ),
            ]),
        ),
    };
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap())
    });
    vcx.run_until_parked();
    assert!(vcx.debug_bounds("item-selected-One").is_none());
    let first = vcx.debug_bounds("list-item-One").expect("first row");
    vcx.simulate_click(first.center(), Modifiers::none());
    vcx.run_until_parked();
    assert!(vcx.debug_bounds("item-selected-One").is_some());
    let second = vcx.debug_bounds("list-item-Two").expect("second row");
    vcx.simulate_click(second.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |view, _| {
        assert_eq!(view.value("virtual"), Some(&json!("two")));
    });
    assert!(vcx.debug_bounds("item-selected-One").is_none());
    assert!(vcx.debug_bounds("item-selected-Two").is_some());
}

#[gpui::test]
fn mobile_virtual_list_consumes_touch_scroll(cx: &mut TestAppContext) {
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
        id: "scroll-list".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "virtual",
            "lists/VirtualList",
            BTreeMap::from([
                (
                    "items".into(),
                    json!(
                        (1..=8)
                            .map(|i| json!({"value":format!("row-{i}"),"label":format!("Row {i}")}))
                            .collect::<Vec<_>>()
                    ),
                ),
                ("total".into(), json!(10000)),
                ("start".into(), json!(1)),
                ("end".into(), json!(8)),
            ]),
        ),
    };
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| view.load_screen(screen, window, cx).unwrap())
    });
    vcx.run_until_parked();
    let first = vcx.debug_bounds("list-item-Row 1").expect("first row");
    vcx.simulate_event(gpui::ScrollEvent {
        position: first.center(),
        delta: gpui::ScrollDelta::Pixels(gpui::point(gpui::px(0.), gpui::px(-160.))),
        modifiers: Modifiers::none(),
        touch_phase: gpui::TouchPhase::Moved,
        source: gpui::ScrollSource::Touch,
    });
    vcx.run_until_parked();
    let last = vcx
        .debug_bounds("list-item-Row 8")
        .expect("last row is laid out after scrolling");
    assert!(
        last.top() < gpui::px(200.),
        "last row must move into the list viewport: {last:?}"
    );
}
