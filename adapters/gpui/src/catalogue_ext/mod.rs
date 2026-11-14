pub(crate) mod commerce_comms;
pub(crate) mod dev_workspace;
pub(crate) mod media_system;
pub(crate) mod remaining_aliases;
pub(crate) mod ui_foundations;
pub(crate) mod visual_finance;

use gpui::{AnyElement, App, SharedString, WeakEntity, Window};

use crate::{catalogue::CatalogueView, dashboard::ScreenNode};

pub(crate) fn render(
    kind: &str,
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> Option<AnyElement> {
    commerce_comms::render(kind, node, eid, state_key, view_state, window, cx, view)
        .or_else(|| {
            visual_finance::render(kind, node, eid, state_key, view_state, window, cx, view)
        })
        .or_else(|| dev_workspace::render(kind, node, eid, state_key, view_state, window, cx, view))
        .or_else(|| {
            ui_foundations::render(kind, node, eid, state_key, view_state, window, cx, view)
        })
        .or_else(|| media_system::render(kind, node, eid, state_key, view_state, window, cx, view))
        .or_else(|| {
            remaining_aliases::render(kind, node, eid, state_key, view_state, window, cx, view)
        })
}
