mod catalogue {
    pub use elysdui_gpui::catalogue::CatalogueView;
}

mod dashboard {
    pub use elysdui_gpui::dashboard::ScreenNode;
}

#[path = "../src/dialog_renderer.rs"]
mod dialog_renderer;

use std::collections::BTreeMap;

use ely_gpui_component::{init_for_tests, theme::Theme};
use elysdui_gpui::{catalogue::CatalogueView, dashboard::ScreenNode};
use gpui::{
    AppContext, Context, Entity, IntoElement, Modifiers, Render, SharedString, TestAppContext,
};
use serde_json::{Value, json};

struct DialogHost {
    node: ScreenNode,
    events: Entity<CatalogueView>,
}

impl Render for DialogHost {
    fn render(&mut self, window: &mut gpui::Window, cx: &mut Context<Self>) -> impl IntoElement {
        dialog_renderer::render(
            &self.node,
            &SharedString::from("dialog-host"),
            window,
            cx,
            &self.events.downgrade(),
        )
    }
}

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

fn host<'a>(
    cx: &'a mut TestAppContext,
    node: ScreenNode,
) -> (Entity<DialogHost>, &'a mut gpui::VisualTestContext) {
    let (host, window) = cx.add_window_view(|_, cx| DialogHost {
        node,
        events: cx.new(|_| CatalogueView::new()),
    });
    window.update(|window, _| window.resize(gpui::size(gpui::px(390.), gpui::px(844.))));
    window.run_until_parked();
    (host, window)
}

fn click_selector(window: &mut gpui::VisualTestContext, selector: &'static str) {
    let bounds = window
        .debug_bounds(selector)
        .unwrap_or_else(|| panic!("missing {selector}"));
    window.simulate_click(bounds.center(), Modifiers::none());
    window.run_until_parked();
}

#[gpui::test]
fn confirm_dialog_opens_cancels_and_confirms_with_action_payload(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    cx.update(|cx| Theme::update(cx, |theme| theme.touch_mode = true));
    let dialog_node = || {
        node(
            "confirm",
            "overlays/ConfirmDialog",
            BTreeMap::from([
                ("label".into(), json!("Open confirm")),
                ("title".into(), json!("Delete item?")),
                ("presentation".into(), json!("modal")),
                ("content".into(), json!("This cannot be undone.")),
                ("action".into(), json!("delete-record")),
                ("actionLabel".into(), json!("Delete")),
            ]),
        )
    };

    let (host, mut window) = host(cx, dialog_node());
    click_selector(&mut window, "sdui-dialog-trigger");
    assert!(
        window.debug_bounds("sdui-dialog-surface").is_some(),
        "confirm dialog opens at 390×844"
    );
    let actions = window
        .debug_bounds("dialog-actions")
        .expect("confirm actions visible");
    window.simulate_click(
        gpui::point(actions.right() - gpui::px(120.), actions.center().y),
        Modifiers::none(),
    );
    window.run_until_parked();
    assert!(
        window.debug_bounds("sdui-dialog-surface").is_none(),
        "cancel closes dialog"
    );
    window.read_entity(&host, |host, cx| {
        assert!(host.events.read(cx).events().is_empty())
    });

    click_selector(&mut window, "sdui-dialog-trigger");
    assert!(window.debug_bounds("sdui-dialog-surface").is_some());
    let actions = window
        .debug_bounds("dialog-actions")
        .expect("confirm actions visible");
    window.simulate_click(
        gpui::point(actions.right() - gpui::px(20.), actions.center().y),
        Modifiers::none(),
    );
    window.run_until_parked();
    assert!(
        window.debug_bounds("sdui-dialog-surface").is_none(),
        "confirm closes dialog"
    );
    window.read_entity(&host, |host, cx| {
        let events = host.events.read(cx).events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, "ely:action");
        assert_eq!(events[0].value, json!("delete-record"));
    });
}

#[gpui::test]
fn no_actions_dialog_has_no_action_row_and_closes_with_escape(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    cx.update(|cx| Theme::update(cx, |theme| theme.touch_mode = true));
    let node = node(
        "quiet",
        "overlays/Dialog",
        BTreeMap::from([
            ("label".into(), json!("Open details")),
            ("title".into(), json!("Details")),
            ("presentation".into(), json!("modal")),
            ("content".into(), json!("Read-only information.")),
            ("noActions".into(), json!(true)),
        ]),
    );
    let (host, mut window) = host(cx, node);
    click_selector(&mut window, "sdui-dialog-trigger");
    assert!(
        window.debug_bounds("sdui-dialog-surface").is_some(),
        "dialog opens at 390×844"
    );
    assert!(
        window.debug_bounds("dialog-actions").is_none(),
        "noActions omits the footer"
    );
    window.simulate_keystrokes("escape");
    window.run_until_parked();
    assert!(
        window.debug_bounds("sdui-dialog-surface").is_none(),
        "Escape closes dialog"
    );
    window.read_entity(&host, |host, cx| {
        assert!(host.events.read(cx).events().is_empty())
    });
}

#[gpui::test]
fn fields_dialog_validates_and_emits_submit_values(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    cx.update(|cx| Theme::update(cx, |theme| theme.touch_mode = true));
    let node = node(
        "fields",
        "overlays/Dialog",
        BTreeMap::from([
            ("label".into(), json!("Open form")),
            ("title".into(), json!("Profile")),
            ("action".into(), json!("save-profile")),
            ("disallow".into(), json!("@")),
            (
                "validationMessage".into(),
                json!("At signs are not allowed."),
            ),
            (
                "fields".into(),
                json!([{"name":"handle","label":"Handle","required":true}]),
            ),
        ]),
    );
    let (host, mut window) = host(cx, node);
    click_selector(&mut window, "sdui-dialog-trigger");
    assert!(window.debug_bounds("sdui-dialog-surface").is_some());

    click_selector(&mut window, "sdui-dialog-submit");
    window.read_entity(&host, |host, cx| {
        assert!(host.events.read(cx).events().is_empty())
    });
    assert!(window.debug_bounds("sdui-dialog-surface").is_some());

    click_selector(&mut window, "sdui-dialog-field");
    window.simulate_input("ada@example");
    window.run_until_parked();
    click_selector(&mut window, "sdui-dialog-submit");
    window.read_entity(&host, |host, cx| {
        assert!(host.events.read(cx).events().is_empty())
    });

    window.simulate_keystrokes("cmd-a backspace");
    window.simulate_input("ada");
    window.run_until_parked();
    click_selector(&mut window, "sdui-dialog-submit");
    window.read_entity(&host, |host, cx| {
        let events = host.events.read(cx).events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, "ely:action");
        assert_eq!(
            events[0].value,
            json!({
                "action":"save-profile",
                "formData":[["handle","ada"]],
                "values":[["handle","ada"]],
                "submitter":""
            })
        );
    });
    assert!(window.debug_bounds("sdui-dialog-surface").is_some());
}

#[gpui::test]
fn prompt_uses_boolean_dismissible_and_trim_validation(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    cx.update(|cx| Theme::update(cx, |theme| theme.touch_mode = true));
    let node = node(
        "rename",
        "overlays/Dialog",
        BTreeMap::from([
            ("label".into(), json!("Rename")),
            ("title".into(), json!("New name")),
            ("presentation".into(), json!("prompt")),
            ("name".into(), json!("displayName")),
            ("value".into(), json!("   ")),
            ("trimRequired".into(), json!(true)),
            ("dismissible".into(), json!(false)),
            ("action".into(), json!("rename-profile")),
        ]),
    );
    let (host, mut window) = host(cx, node);
    click_selector(&mut window, "sdui-dialog-trigger");
    assert!(window.debug_bounds("sdui-dialog-cancel").is_none());
    click_selector(&mut window, "sdui-dialog-submit");
    window.read_entity(&host, |host, cx| {
        assert!(host.events.read(cx).events().is_empty())
    });

    click_selector(&mut window, "sdui-dialog-field");
    window.simulate_keystrokes("cmd-a backspace");
    window.simulate_input("Grace");
    window.run_until_parked();
    click_selector(&mut window, "sdui-dialog-submit");
    window.read_entity(&host, |host, cx| {
        let events = host.events.read(cx).events();
        assert_eq!(events.len(), 1);
        assert_eq!(events[0].event, "ely:action");
        assert_eq!(
            events[0].value,
            json!({
                "action":"rename-profile",
                "formData":[["displayName","Grace"]],
                "values":[["displayName","Grace"]],
                "submitter":""
            })
        );
    });
}

#[test]
fn isolated_renderer_module_compiles_with_the_public_host_types() {
    let _ = std::any::type_name::<dashboard::ScreenNode>();
    let _ = std::any::type_name::<catalogue::CatalogueView>();
}
