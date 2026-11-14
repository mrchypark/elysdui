use std::collections::BTreeMap;

use ely_gpui_component::init_for_tests;
use elysdui_gpui::{
    catalogue::CatalogueView,
    dashboard::{Screen, ScreenNode},
};
use gpui::{AppContext, Modifiers, TestAppContext};
use serde_json::json;

fn node(id: &str, node_type: &str, props: BTreeMap<String, serde_json::Value>) -> ScreenNode {
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

fn prompt_screen(disabled: bool) -> Screen {
    Screen {
        version: "1".into(),
        id: format!("prompt-{disabled}"),
        loader: None,
        templates: BTreeMap::new(),
        root: node(
            "prompt",
            "chat/PromptInput",
            BTreeMap::from([
                ("disabled".into(), json!(disabled)),
                ("value".into(), json!("already typed")),
            ]),
        ),
    }
}

fn disabled_prompt_rejects_a_verified_send_tap(cx: &mut TestAppContext) {
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).expect("catalogue view");
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.load_screen(prompt_screen(false), window, cx).unwrap()
        });
    });
    vcx.run_until_parked();

    let root = vcx.debug_bounds("cat-screen-root").expect("prompt bounds");
    for x in [32., 48., 64., 80.] {
        for y in (32..=816).step_by(16) {
            let point = gpui::point(root.right() - gpui::px(x), root.top() + gpui::px(y as f32));
            vcx.simulate_click(point, Modifiers::none());
            vcx.run_until_parked();
            if vcx.read_entity(&view, |view, _| {
                view.events()
                    .iter()
                    .any(|event| event.value == json!({ "send": "already typed" }))
            }) {
                vcx.update(|window, cx| {
                    view.update(cx, |view, cx| {
                        view.load_screen(prompt_screen(true), window, cx).unwrap()
                    });
                });
                vcx.run_until_parked();
                let baseline = vcx.read_entity(&view, |view, _| view.events().len());
                vcx.simulate_click(point, Modifiers::none());
                vcx.run_until_parked();
                vcx.read_entity(&view, |view, _| {
                    assert!(
                        view.events().len() == baseline,
                        "disabled prompt emitted an action"
                    );
                });
                return;
            }
        }
    }
    panic!("the enabled prompt send control was not reached");
}

#[gpui::test]
fn disabled_prompt_does_not_send_its_initial_value(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    disabled_prompt_rejects_a_verified_send_tap(cx);
}
