use std::collections::BTreeMap;

use ely_gpui_component::{
    init_for_tests,
    layout::{ScrollArea, reveal_in_bounds},
    theme::Theme,
};
use elysdui_gpui::{
    catalogue::CatalogueView,
    dashboard::{Screen, ScreenNode},
};
use gpui::{
    AppContext, Context, Entity, IntoElement, ParentElement, Pixels, Render, ScrollHandle, Styled,
    TestAppContext, Window, div, px,
};
use serde_json::json;

fn inline_screen() -> Screen {
    Screen {
        version: "1".into(),
        id: "caret-reveal".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "inline".into(),
            node_type: "forms/InlineForm".into(),
            props: BTreeMap::from([(
                "fields".into(),
                json!([
                    {"name": "first", "label": "First"},
                    {"name": "second", "label": "Second"}
                ]),
            )]),
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

#[gpui::test]
fn focused_inline_form_caret_tracks_focus_and_blur(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| theme.reduced_motion = true);
    });
    let window = cx.open_window(gpui::size(gpui::px(390.), gpui::px(844.)), |_, _| {
        CatalogueView::new()
    });
    let view = window.root(cx).unwrap();
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    vcx.update(|window, cx| {
        window.activate_window();
        view.update(cx, |view, cx| {
            view.load_screen(inline_screen(), window, cx).unwrap()
        });
    });
    vcx.run_until_parked();
    vcx.update(|window, cx| window.focus_next(cx));
    vcx.run_until_parked();
    let first = vcx.update(|window, cx| view.read(cx).focused_text_caret(window, cx));
    let (first_focus, first_bounds) = first.expect("focused first input has a painted caret");
    assert!(first_bounds.size.height > gpui::px(0.));

    vcx.update(|window, cx| window.focus_next(cx));
    vcx.run_until_parked();
    let (second_focus, _) = vcx.update(|window, cx| {
        view.read(cx)
            .focused_text_caret(window, cx)
            .expect("second caret")
    });
    assert_ne!(first_focus, second_focus);
    vcx.update(|window, cx| window.blur(cx));
    vcx.run_until_parked();
    assert!(
        vcx.update(|window, cx| view.read(cx).focused_text_caret(window, cx))
            .is_none()
    );
}

struct ScrollHost {
    catalogue: Entity<CatalogueView>,
    scroll: ScrollHandle,
    height: Pixels,
}

impl Render for ScrollHost {
    fn render(&mut self, _: &mut Window, _: &mut Context<Self>) -> impl IntoElement {
        ScrollArea::new("focus-test-scroll")
            .w_full()
            .h(self.height)
            .vertical()
            .track_scroll(&self.scroll)
            .child(div().h(px(420.)))
            .child(self.catalogue.clone())
            .child(div().h(px(120.)))
    }
}

#[gpui::test]
fn inline_caret_can_be_revealed_after_keyboard_reduces_scroll_height(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |theme| theme.reduced_motion = true);
    });
    let window = cx.open_window(gpui::size(px(390.), px(844.)), |_, cx| ScrollHost {
        catalogue: cx.new(|_| CatalogueView::new()),
        scroll: ScrollHandle::new(),
        height: px(800.),
    });
    let host = window.root(cx).unwrap();
    let vcx = gpui::VisualTestContext::from_window(window.into(), cx).into_mut();
    let (catalogue, scroll) = vcx.read_entity(&host, |host, _| {
        (host.catalogue.clone(), host.scroll.clone())
    });
    vcx.update(|window, cx| {
        window.activate_window();
        catalogue.update(cx, |view, cx| {
            view.load_screen(inline_screen(), window, cx).unwrap()
        });
    });
    vcx.run_until_parked();
    vcx.update(|window, cx| window.focus_next(cx));
    vcx.run_until_parked();
    host.update(vcx, |host, cx| {
        host.height = px(300.);
        cx.notify();
    });
    vcx.run_until_parked();
    let moved = vcx.update(|window, cx| {
        let (_, mut caret) = catalogue.read(cx).focused_text_caret(window, cx).unwrap();
        caret.origin.y -= px(12.);
        caret.size.height += px(24.);
        let moved = reveal_in_bounds(&scroll, caret, scroll.bounds());
        if moved {
            window.refresh();
        }
        moved
    });
    assert!(moved, "the occluded caret requires scrolling");
    vcx.run_until_parked();
    let caret =
        vcx.update(|window, cx| catalogue.read(cx).focused_text_caret(window, cx).unwrap().1);
    assert!(
        caret.bottom() <= scroll.bounds().bottom(),
        "focused caret should be visible"
    );
}
