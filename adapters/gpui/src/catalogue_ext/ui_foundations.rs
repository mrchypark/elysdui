use std::{
    collections::{BTreeMap, BTreeSet, HashMap},
    fmt,
    path::Path,
    sync::{Mutex, OnceLock},
    time::{Duration, Instant},
};

use ely_gpui_component::{
    buttons::{Button, ButtonVariant, IconButton, QuickAction, QuickActions},
    data_display::Tone,
    feedback::{
        Countdown, ErrorBoundary, Notification, NotificationCenter, Timer, Toast, ToastViewport,
        Toaster,
    },
    forms::{
        Choice, CronEditor, FontPicker, GradientEditor, GradientStop, IconPicker, Input,
        InputAddon, InputEvent, InputGroup, MentionInput, MonthPicker, ScrubInput, TextInput,
        TransferList, mention_highlights,
    },
    i18n::SkipLink,
    interaction::Resizable,
    layout::{
        AspectRatio, Card, CardHeader, Container, Dock, DockPanel, DockSide, Drawer, FloatingPanel,
        Page, PaneGroup, ScrollArea, ScrollShadow, ScrollToTop, Scrollbar, Sheet, Sidebar,
        StickyHeader, Viewport, Workspace, h_stack, v_stack,
    },
    lists::{InfiniteList, ListItem, SortableList, SwipeAction, SwipeableListItem, VirtualList},
    menus::{Menu, MenuItem, PieItem, PieMenu, SearchableMenu},
    navigation::{
        Anchor, Command, CommandPalette, NavigationMenu, QuickOpen, QuickSwitcher, SearchPalette,
        Sections, TableOfContents,
    },
    onboarding::{
        FeedbackWidget, HelpArticle, HelpPanel, KeyboardShortcutCheatsheet, OnboardingStep,
        OnboardingWizard, SetupChecklist, SetupTask,
    },
    overlays::{
        FloatingToolbar, HoverCard, Lightbox, Peek, Popover, Slide, Spotlight, Tour, TourStep,
    },
    primitives::{
        Backdrop, FocusRing, FocusScope, HelpTooltip, Icon, IconName, Image, IntersectionObserver,
        Measure, Place, Pressable, Severity, TooltipTrigger,
    },
    settings::Shortcut,
    tables::{Aggregate, Cell, Column, DataGrid, PivotTable, Spreadsheet, TreeRow, TreeTable},
    theme::{ActiveTheme, ContainerSize, ControlSize, IconSize, Radius, TextSize},
    typography::{
        Caption, CurrencyText, DateTimeText, DurationStyle, DurationText, EllipsisTooltip,
        FileSizeText, GradientText, Label, MiddleEllipsis, NumberText, Paragraph, PercentText,
        PluralText, RelativeTime, ShimmerText, Typewriter,
    },
};
use gpui::{
    AnyElement, App, Axis, Bounds, Hsla, ImageSource, InteractiveElement, IntoElement, Keystroke,
    OperatingSystem, ParentElement, Pixels, Rgba, ScrollHandle, SharedString, SharedUri,
    StatefulInteractiveElement, Styled, Subscription, WeakEntity, Window, div, point, prelude::*,
    px, size,
};
use jiff::{Timestamp, fmt::strtime, tz::TimeZone};
use serde_json::{Value, json};

use crate::{
    catalogue::{
        CatalogueView, best_body, best_label, best_title, extract_choices, extract_item_objects,
        non_empty_or, prop_bool, prop_f64, prop_str, value_to_f64,
    },
    dashboard::ScreenNode,
};

#[derive(Debug)]
struct UiError(String);

impl fmt::Display for UiError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for UiError {}

struct HeldInput {
    entity: gpui::Entity<TextInput>,
    _sub: Subscription,
}

fn static_str(raw: &str, fallback: &'static str) -> &'static str {
    static INTERNED: OnceLock<Mutex<BTreeSet<&'static str>>> = OnceLock::new();
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return fallback;
    }
    let cache = INTERNED.get_or_init(|| Mutex::new(BTreeSet::new()));
    let Ok(mut set) = cache.lock() else {
        return fallback;
    };
    if let Some(&existing) = set.get(trimmed) {
        return existing;
    }
    if set.len() >= 512 {
        return fallback;
    }
    let leaked: &'static str = Box::leak(trimmed.to_owned().into_boxed_str());
    set.insert(leaked);
    leaked
}

fn icon_by_name(name: Option<&str>, fallback: IconName) -> IconName {
    let Some(raw) = name else {
        return fallback;
    };
    let key = raw.trim().to_ascii_lowercase();
    IconName::ALL
        .iter()
        .copied()
        .find(|icon| icon.name() == key)
        .unwrap_or(fallback)
}

fn parse_severity(raw: Option<&str>) -> Severity {
    match raw.map(str::trim).unwrap_or("") {
        "danger" | "error" => Severity::Danger,
        "warning" | "warn" => Severity::Warning,
        "success" | "ok" => Severity::Success,
        _ => Severity::Info,
    }
}

fn parse_tone(raw: Option<&str>) -> Tone {
    match raw.map(str::trim).unwrap_or("") {
        "danger" | "error" => Tone::Danger,
        "warning" | "warn" => Tone::Warning,
        "success" | "ok" => Tone::Success,
        "accent" | "info" | "primary" => Tone::Accent,
        _ => Tone::Neutral,
    }
}

fn parse_hsla(raw: &str, fallback: Hsla) -> Hsla {
    let digits = raw.trim().trim_start_matches('#');
    let doubled = || digits.chars().flat_map(|c| [c, c]);
    let long: String = match digits.len() {
        3 => doubled().chain("ff".chars()).collect(),
        4 => doubled().collect(),
        6 => format!("{digits}ff"),
        8 => digits.to_owned(),
        _ => return fallback,
    };
    let Ok(v) = u32::from_str_radix(&long, 16) else {
        return fallback;
    };
    let ch = |shift: u32| ((v >> shift) & 0xff) as f32 / 255.0;
    Rgba {
        r: ch(24),
        g: ch(16),
        b: ch(8),
        a: ch(0),
    }
    .into()
}

fn image_source(raw: &str) -> ImageSource {
    if raw.starts_with("http://") || raw.starts_with("https://") {
        SharedUri::from(raw.to_owned()).into()
    } else {
        Path::new(raw).into()
    }
}

fn parse_timestamp(raw: Option<&str>) -> Timestamp {
    let Some(text) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return Timestamp::now();
    };
    if let Ok(ts) = text.parse::<Timestamp>() {
        return ts;
    }
    if let Ok(dt) = text.parse::<jiff::civil::DateTime>()
        && let Ok(zoned) = dt.to_zoned(TimeZone::UTC)
    {
        return zoned.timestamp();
    }
    if let Ok(date) = text.parse::<jiff::civil::Date>()
        && let Ok(zoned) = date.at(0, 0, 0, 0).to_zoned(TimeZone::UTC)
    {
        return zoned.timestamp();
    }
    Timestamp::now()
}

fn is_valid_keystroke(spec: &str) -> bool {
    !spec.is_empty()
        && spec.split_whitespace().all(|part| {
            Keystroke::parse_with_os(part, OperatingSystem::Mac).is_ok()
                && Keystroke::parse_with_os(part, OperatingSystem::Windows).is_ok()
                && Keystroke::parse_with_os(part, OperatingSystem::Linux).is_ok()
        })
}

fn normalize_keystroke(raw: &str) -> Option<String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }
    if is_valid_keystroke(trimmed) {
        return Some(trimmed.to_owned());
    }
    let mut mods = Vec::new();
    let mut s = trimmed.to_owned();
    for (sym, name) in [("⌘", "cmd"), ("⌃", "ctrl"), ("⌥", "alt"), ("⇧", "shift")] {
        if s.contains(sym) {
            mods.push(name);
            s = s.replace(sym, "");
        }
    }
    let normalized = if mods.is_empty() {
        let mut parts: Vec<String> = s
            .split(['+', ' '])
            .filter(|p| !p.is_empty())
            .map(|p| p.to_ascii_lowercase())
            .collect();
        if let Some(last) = parts.last_mut()
            && last == "?"
        {
            *last = "shift-/".to_owned();
        }
        parts.join("-")
    } else {
        let key = s
            .trim()
            .trim_matches('+')
            .trim_matches('-')
            .to_ascii_lowercase();
        if key.is_empty() {
            return None;
        }
        mods.push(&key);
        mods.join("-")
    };
    is_valid_keystroke(&normalized).then_some(normalized)
}

fn prop_open(view_state: &CatalogueView, state_key: &str, node: &ScreenNode) -> bool {
    view_state
        .value(state_key)
        .and_then(Value::as_bool)
        .unwrap_or_else(|| prop_bool(node, "open") || prop_bool(node, "checked"))
}

fn emit_event(
    view: &WeakEntity<CatalogueView>,
    key: &str,
    node_type: &str,
    event: &str,
    value: Value,
    cx: &mut App,
) {
    let _ = view.update(cx, |this, cx| {
        this.trigger_event(key, node_type, event, value, cx);
    });
}

#[allow(clippy::too_many_arguments)]
fn use_synced_input(
    eid: &SharedString,
    suffix: &str,
    initial: &str,
    placeholder: &str,
    state_key: &str,
    node_type: &str,
    mention: bool,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> gpui::Entity<TextInput> {
    let key = (gpui::ElementId::from(eid.clone()), suffix.to_owned());
    let init = initial.to_owned();
    let ph = placeholder.to_owned();
    let sk = state_key.to_owned();
    let ntype = node_type.to_owned();
    let v = view.clone();
    let held = window.use_keyed_state(key, cx, |window, cx| {
        let entity = cx.new(|cx| {
            let mut ti = TextInput::new(window, cx).placeholder(ph.clone());
            if mention {
                ti = ti.highlighter(mention_highlights);
            }
            if !init.is_empty() {
                ti.set_text(init.clone(), cx);
            }
            ti
        });
        let _sub = cx.subscribe(&entity, move |_, input, event: &InputEvent, cx| {
            if *event == InputEvent::Changed {
                let text = input.read(cx).text().to_owned();
                emit_event(&v, &sk, &ntype, "change", Value::String(text), cx);
            }
        });
        HeldInput { entity, _sub }
    });
    held.read(cx).entity.clone()
}

fn extract_string_items(node: &ScreenNode) -> Vec<String> {
    let Some(arr) = node.props.get("items").and_then(Value::as_array) else {
        return Vec::new();
    };
    arr.iter()
        .filter_map(|v| {
            v.as_str().map(ToOwned::to_owned).or_else(|| {
                v.get("label")
                    .or_else(|| v.get("title"))
                    .or_else(|| v.get("value"))
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
            })
        })
        .collect()
}

fn list_selection(view_state: &CatalogueView, state_key: &str) -> Vec<String> {
    match view_state.value(state_key) {
        Some(Value::String(value)) => vec![value.clone()],
        Some(Value::Array(values)) => values
            .iter()
            .filter_map(Value::as_str)
            .map(ToOwned::to_owned)
            .collect(),
        Some(Value::Object(fields)) => fields
            .get("values")
            .and_then(Value::as_array)
            .into_iter()
            .flatten()
            .filter_map(Value::as_str)
            .map(ToOwned::to_owned)
            .collect(),
        _ => Vec::new(),
    }
}

fn list_multiple(node: &ScreenNode) -> bool {
    prop_bool(node, "multiple")
        || matches!(prop_str(node, "multiple").as_deref(), Some("true" | "1"))
}

fn render_children_group(
    node: &ScreenNode,
    eid: &SharedString,
    view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> Vec<AnyElement> {
    node.children
        .iter()
        .enumerate()
        .map(|(idx, child)| {
            let ceid = SharedString::from(format!("{eid}-ch-{idx}"));
            let ckey = prop_str(child, "name").unwrap_or_else(|| child.id.clone());
            if let Some(el) = render(
                &child.node_type,
                child,
                &ceid,
                &ckey,
                view_state,
                window,
                cx,
                view,
            ) {
                return el;
            }
            let title = best_title(child);
            let body = best_body(child);
            if !title.is_empty() || body.is_some() {
                let mut card = Card::new();
                if !title.is_empty() {
                    let mut hdr = CardHeader::new(title);
                    if let Some(b) = body {
                        hdr = hdr.description(b);
                    }
                    card = card.header(hdr);
                } else if let Some(b) = body {
                    card = card.child(Paragraph::new(b));
                }
                for sub in render_children_group(child, &ceid, view_state, window, cx, view) {
                    card = card.child(sub);
                }
                return card.into_any_element();
            }
            Label::new(non_empty_or(&best_label(child), &child.node_type)).into_any_element()
        })
        .collect()
}

fn str_from_obj(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    for key in keys {
        if let Some(s) = obj.get(*key).and_then(Value::as_str) {
            return Some(s.to_owned());
        }
    }
    None
}

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
    let eid = eid.clone();
    let state_key = state_key.to_owned();
    let disabled = prop_bool(node, "disabled");

    let el: AnyElement = match kind {
        "buttons/QuickActions" => {
            let items = extract_item_objects(node);
            let mut qa = QuickActions::new(eid);
            if items.is_empty() {
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                let label = non_empty_or(&best_label(node), "Quick action");
                qa = qa.action(QuickAction::new(IconName::Zap, label, move |_, cx| {
                    emit_event(&v, &nid, &ntype, "click", json!("action"), cx);
                }));
            } else {
                for (idx, item) in items.iter().enumerate() {
                    let label = str_from_obj(item, &["label", "title", "value"])
                        .unwrap_or_else(|| format!("Action {}", idx + 1));
                    let icon =
                        icon_by_name(item.get("icon").and_then(Value::as_str), IconName::Sparkles);
                    let act = str_from_obj(item, &["action", "value"]).unwrap_or(label.clone());
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    let mut qa_item = QuickAction::new(icon, label, move |_, cx| {
                        emit_event(&v, &nid, &ntype, "click", json!(act), cx);
                    });
                    if let Some(note) = str_from_obj(item, &["note", "description"]) {
                        qa_item = qa_item.note(note);
                    }
                    if let Some(raw_sc) = item
                        .get("shortcutKeys")
                        .or_else(|| item.get("shortcut"))
                        .and_then(Value::as_str)
                        && let Some(norm) = normalize_keystroke(raw_sc)
                    {
                        qa_item = qa_item.shortcut(&norm);
                    }
                    qa = qa.action(qa_item);
                }
            }
            qa.into_any_element()
        }
        "feedback/Countdown" => {
            let clocks = node
                .props
                .get("clocks")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if !clocks.is_empty() {
                let mut row = h_stack().flex_wrap().gap_4();
                for (idx, c) in clocks.iter().enumerate() {
                    let lbl = c.get("label").and_then(Value::as_str).unwrap_or("Clock");
                    let mode = c.get("mode").and_then(Value::as_str).unwrap_or("countdown");
                    let secs = c
                        .get("value")
                        .and_then(value_to_f64)
                        .unwrap_or(10.0)
                        .clamp(0.0, 86_400.0 * 365.0) as u64;
                    let face: AnyElement = if mode == "timer" {
                        Timer::new(
                            SharedString::from(format!("{eid}-tm-{idx}")),
                            Instant::now(),
                        )
                        .size(TextSize::Lg)
                        .into_any_element()
                    } else {
                        let v = view.clone();
                        let nid = node.id.clone();
                        let ntype = node.node_type.clone();
                        Countdown::new(
                            SharedString::from(format!("{eid}-cd-{idx}")),
                            Instant::now() + Duration::from_secs(secs.max(1)),
                        )
                        .size(TextSize::Lg)
                        .on_done(move |_, cx| {
                            emit_event(&v, &nid, &ntype, "ely:action", json!("done"), cx);
                        })
                        .into_any_element()
                    };
                    row = row.child(
                        v_stack()
                            .gap_1()
                            .child(Caption::new(lbl.to_owned()))
                            .child(face),
                    );
                }
                row.into_any_element()
            } else {
                let secs = prop_f64(node, "value")
                    .unwrap_or(10.0)
                    .clamp(1.0, 86_400.0 * 365.0) as u64;
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                Countdown::new(eid, Instant::now() + Duration::from_secs(secs))
                    .on_done(move |_, cx| {
                        emit_event(&v, &nid, &ntype, "ely:action", json!("done"), cx);
                    })
                    .into_any_element()
            }
        }
        "feedback/ErrorBoundary" => {
            let recovered =
                view_state.value(&state_key).and_then(Value::as_str) == Some("recovered");
            let err_msg = prop_str(node, "error").or_else(|| prop_str(node, "demoError"));
            let res: Result<AnyElement, _> = if let Some(err) = err_msg.filter(|_| !recovered) {
                let detail = prop_str(node, "detail")
                    .or_else(|| prop_str(node, "demoDetail"))
                    .unwrap_or_default();
                let full = if detail.is_empty() {
                    err
                } else {
                    format!("{err}: {detail}")
                };
                Err(UiError(full).into())
            } else {
                let body = best_body(node).unwrap_or_else(|| "Content loaded.".into());
                Ok(Paragraph::new(body).into_any_element())
            };
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            ErrorBoundary::new(eid, res)
                .on_retry(move |_, cx| {
                    emit_event(&v, &sk, &ntype, "change", json!("recovered"), cx);
                })
                .into_any_element()
        }
        "feedback/Notification" => {
            let items = extract_item_objects(node);
            if items.is_empty() {
                let title = non_empty_or(&best_title(node), "Notification");
                let icon = icon_by_name(prop_str(node, "icon").as_deref(), IconName::Bell);
                let mut n = Notification::new(eid, icon, title).unread(prop_bool(node, "unread"));
                if let Some(body) = best_body(node) {
                    n = n.body(body);
                }
                if let Some(time) = prop_str(node, "time") {
                    n = n.time(time);
                }
                n.into_any_element()
            } else {
                let mut grouped: BTreeMap<String, Vec<Notification>> = BTreeMap::new();
                for (idx, item) in items.iter().enumerate() {
                    let group =
                        str_from_obj(item, &["group"]).unwrap_or_else(|| "Notifications".into());
                    let title = str_from_obj(item, &["label", "title"])
                        .unwrap_or_else(|| format!("Notification {}", idx + 1));
                    let icon =
                        icon_by_name(item.get("icon").and_then(Value::as_str), IconName::Bell);
                    let mut n = Notification::new(
                        SharedString::from(format!("{eid}-n-{idx}")),
                        icon,
                        title,
                    )
                    .unread(item.get("unread").and_then(Value::as_bool) == Some(true));
                    if let Some(body) = str_from_obj(item, &["content", "body", "text"]) {
                        n = n.body(body);
                    }
                    if let Some(time) = str_from_obj(item, &["time"]) {
                        n = n.time(time);
                    }
                    if let Some(actions) = item.get("actions").and_then(Value::as_array) {
                        for (a_idx, act) in actions.iter().enumerate() {
                            let alabel = act
                                .get("label")
                                .and_then(Value::as_str)
                                .unwrap_or("Open")
                                .to_owned();
                            let aval = act
                                .get("action")
                                .or_else(|| act.get("value"))
                                .and_then(Value::as_str)
                                .unwrap_or(&alabel)
                                .to_owned();
                            let v = view.clone();
                            let nid = node.id.clone();
                            let ntype = node.node_type.clone();
                            n = n.action(
                                Button::new(
                                    SharedString::from(format!("{eid}-na-{idx}-{a_idx}")),
                                    alabel,
                                )
                                .size(ControlSize::Sm)
                                .variant(ButtonVariant::Ghost)
                                .on_click(move |_, _, cx| {
                                    emit_event(&v, &nid, &ntype, "ely:action", json!(aval), cx);
                                }),
                            );
                        }
                    }
                    grouped.entry(group).or_default().push(n);
                }
                let v_read = view.clone();
                let nid_read = node.id.clone();
                let ntype_read = node.node_type.clone();
                let v_clr = view.clone();
                let nid_clr = node.id.clone();
                let ntype_clr = node.node_type.clone();
                let mut center = NotificationCenter::new(eid)
                    .on_read_all(move |_, cx| {
                        emit_event(
                            &v_read,
                            &nid_read,
                            &ntype_read,
                            "ely:action",
                            json!("read-all"),
                            cx,
                        );
                    })
                    .on_clear(move |_, cx| {
                        emit_event(
                            &v_clr,
                            &nid_clr,
                            &ntype_clr,
                            "ely:action",
                            json!("clear"),
                            cx,
                        );
                    });
                for (group, list) in grouped {
                    center = center.group(group, list);
                }
                div().w_full().h(px(300.)).child(center).into_any_element()
            }
        }
        "feedback/Toast" => {
            let toaster = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "toaster"),
                cx,
                |_, _| Toaster::default(),
            );
            let items = extract_item_objects(node);
            let triggers = node
                .props
                .get("triggers")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let mut row = h_stack().flex_wrap().gap_2();
            if !triggers.is_empty() {
                for (idx, tr) in triggers.iter().enumerate() {
                    let tlabel = tr
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or("Show toast")
                        .to_owned();
                    let t_idx = tr
                        .get("value")
                        .and_then(Value::as_str)
                        .and_then(|s| s.parse::<usize>().ok())
                        .unwrap_or(idx);
                    let spec = items.get(t_idx).cloned();
                    let toaster = toaster.clone();
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    let msg_title = spec
                        .as_ref()
                        .and_then(|s| str_from_obj(s, &["label", "title"]))
                        .unwrap_or_else(|| tlabel.clone());
                    let msg_body = spec
                        .as_ref()
                        .and_then(|s| str_from_obj(s, &["content", "body", "text"]));
                    let sev = spec
                        .as_ref()
                        .and_then(|s| s.get("severity").and_then(Value::as_str))
                        .map(|s| parse_severity(Some(s)));
                    let is_undo = spec
                        .as_ref()
                        .and_then(|s| s.get("undo").and_then(Value::as_bool))
                        == Some(true);
                    let act_lbl = spec
                        .as_ref()
                        .and_then(|s| str_from_obj(s, &["actionLabel"]));
                    row = row.child(
                        Button::new(SharedString::from(format!("{eid}-tr-{idx}")), tlabel)
                            .size(ControlSize::Sm)
                            .variant(ButtonVariant::Secondary)
                            .disabled(disabled)
                            .on_click(move |_, _, cx| {
                                let mut toast = Toast::new(msg_title.clone())
                                    .stay(Some(Duration::from_secs(5)));
                                if let Some(b) = &msg_body {
                                    toast = toast.body(b.clone());
                                }
                                if let Some(s) = sev {
                                    toast = toast.severity(s);
                                }
                                if is_undo {
                                    let v2 = v.clone();
                                    let nid2 = nid.clone();
                                    let ntype2 = ntype.clone();
                                    toast = toast.undo(move |_, cx| {
                                        emit_event(
                                            &v2,
                                            &nid2,
                                            &ntype2,
                                            "ely:action",
                                            json!("undo"),
                                            cx,
                                        );
                                    });
                                } else if let Some(al) = &act_lbl {
                                    let v2 = v.clone();
                                    let nid2 = nid.clone();
                                    let ntype2 = ntype.clone();
                                    let al_val = al.clone();
                                    toast = toast.action(al.clone(), move |_, cx| {
                                        emit_event(
                                            &v2,
                                            &nid2,
                                            &ntype2,
                                            "ely:action",
                                            json!(al_val),
                                            cx,
                                        );
                                    });
                                }
                                toaster.update(cx, |t, cx| {
                                    t.push(toast, cx);
                                });
                                emit_event(&v, &nid, &ntype, "click", json!(msg_title), cx);
                            }),
                    );
                }
            } else {
                let title = non_empty_or(&best_title(node), "Toast");
                let label = non_empty_or(&best_label(node), "Show toast");
                let toaster = toaster.clone();
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                row = row.child(
                    Button::new(SharedString::from(format!("{eid}-tr")), label)
                        .size(ControlSize::Sm)
                        .variant(ButtonVariant::Secondary)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            toaster.update(cx, |t, cx| {
                                t.push(Toast::new(title.clone()), cx);
                            });
                            emit_event(&v, &nid, &ntype, "click", json!(title), cx);
                        }),
                );
            }
            v_stack()
                .gap_2()
                .child(row)
                .child(ToastViewport::new(
                    SharedString::from(format!("{eid}-vp")),
                    &toaster,
                ))
                .into_any_element()
        }
        "forms/CronEditor" => {
            let init = prop_str(node, "value")
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "0 9 * * 1-5".into());
            let ph = prop_str(node, "placeholder").unwrap_or_else(|| "*/15 9-17 * * 1-5".into());
            let input = use_synced_input(
                &eid,
                "cron-in",
                &init,
                &ph,
                &state_key,
                &node.node_type,
                false,
                window,
                cx,
                view,
            );
            let runs = prop_f64(node, "max")
                .map(|v| (v as usize).clamp(1, 10))
                .unwrap_or(3);
            let mut editor = CronEditor::new(eid, &input).runs(runs);
            if let Some(now_str) = prop_str(node, "now")
                && let Ok(ts) = now_str.parse::<Timestamp>()
            {
                editor = editor.now(ts.to_zoned(TimeZone::UTC).datetime());
            }
            editor.into_any_element()
        }
        "forms/FontPicker" => {
            let init = prop_str(node, "value").unwrap_or_default();
            let input = use_synced_input(
                &eid,
                "font-in",
                &init,
                "Pick a font",
                &state_key,
                &node.node_type,
                false,
                window,
                cx,
                view,
            );
            let current = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value").filter(|s| !s.is_empty()));
            let mut picker = FontPicker::new(eid, &input);
            if let Some(fam) = current {
                picker = picker.selected(fam);
            }
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            picker
                .on_change(move |fam, _, cx| {
                    emit_event(&v, &sk, &ntype, "change", json!(fam.to_string()), cx);
                })
                .into_any_element()
        }
        "forms/GradientEditor" => {
            let start_hex = prop_str(node, "start").unwrap_or_else(|| "#181613".into());
            let end_hex = prop_str(node, "end").unwrap_or_else(|| "#e9e7e5".into());
            let mut stops: Vec<GradientStop> = node
                .props
                .get("stops")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(|s| {
                            let at = s.get("at").and_then(value_to_f64)? as f32;
                            if !at.is_finite() {
                                return None;
                            }
                            let hex = s.get("color").and_then(Value::as_str).unwrap_or("#181613");
                            Some(GradientStop {
                                at: at.clamp(0.0, 1.0),
                                color: parse_hsla(hex, gpui::black()),
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            if stops.len() < 2 {
                stops = vec![
                    GradientStop {
                        at: 0.0,
                        color: parse_hsla(&start_hex, gpui::black()),
                    },
                    GradientStop {
                        at: 1.0,
                        color: parse_hsla(&end_hex, gpui::white()),
                    },
                ];
            }
            stops.sort_by(|a, b| a.at.total_cmp(&b.at));
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            GradientEditor::new(eid, stops)
                .on_change(move |next, _, cx| {
                    let out: Vec<Value> = next.iter().map(|s| json!({ "at": s.at })).collect();
                    emit_event(&v, &sk, &ntype, "change", Value::Array(out), cx);
                })
                .into_any_element()
        }
        "forms/IconPicker" => {
            let mut picker = IconPicker::new(eid);
            let cur = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"));
            if let Some(cur) = cur.as_deref()
                && let Some(found) = IconName::ALL.iter().copied().find(|i| i.name() == cur)
            {
                picker = picker.selected(found);
            }
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            picker
                .on_change(move |icon, _, cx| {
                    emit_event(&v, &sk, &ntype, "change", json!(icon.name()), cx);
                })
                .into_any_element()
        }
        "forms/InputGroup" => {
            let init = prop_str(node, "value").unwrap_or_default();
            let ph = prop_str(node, "placeholder").unwrap_or_else(|| "Enter value".into());
            let input = use_synced_input(
                &eid,
                "grp-in",
                &init,
                &ph,
                &state_key,
                &node.node_type,
                false,
                window,
                cx,
                view,
            );
            let mut group = InputGroup::new(&input);
            if let Some(prefix) = prop_str(node, "prefix") {
                group = group.before(InputAddon::text(prefix));
            }
            if let Some(suffix) = prop_str(node, "suffix") {
                if prop_str(node, "suffixAction").is_some() {
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    let act = suffix.clone();
                    group = group.after(InputAddon::new(
                        Button::new(SharedString::from(format!("{eid}-sfx")), suffix)
                            .size(ControlSize::Sm)
                            .variant(ButtonVariant::Ghost)
                            .on_click(move |_, _, cx| {
                                emit_event(&v, &nid, &ntype, "ely:action", json!(act), cx);
                            }),
                    ));
                } else {
                    group = group.after(InputAddon::text(suffix));
                }
            }
            group.into_any_element()
        }
        "forms/MentionInput" => {
            let init = prop_str(node, "value").unwrap_or_default();
            let ph = prop_str(node, "placeholder").unwrap_or_else(|| "Mention with @ or #".into());
            let input = use_synced_input(
                &eid,
                "mention-in",
                &init,
                &ph,
                &state_key,
                &node.node_type,
                true,
                window,
                cx,
                view,
            );
            let handles: Vec<String> = extract_choices(node)
                .into_iter()
                .map(|c| {
                    c.value
                        .chars()
                        .filter(|ch| ch.is_alphanumeric() || *ch == '_')
                        .collect::<String>()
                })
                .filter(|s| !s.is_empty())
                .collect();
            let handles = if handles.is_empty() {
                vec!["ada".into(), "alan".into()]
            } else {
                handles
            };
            MentionInput::new(eid, &input)
                .trigger('@', handles.clone())
                .trigger('#', handles)
                .into_any_element()
        }
        "forms/MonthPicker" => {
            let raw = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"));
            let parsed = raw.as_deref().and_then(|s| {
                let (y, m) = s.split_once('-')?;
                let year = y.trim().parse::<i16>().ok()?.clamp(1900, 2100);
                let month = m.trim().parse::<i8>().ok()?.clamp(1, 12);
                Some((year, month))
            });
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            MonthPicker::new(eid, parsed)
                .on_change(move |(y, m), _, cx| {
                    emit_event(
                        &v,
                        &sk,
                        &ntype,
                        "change",
                        json!(format!("{y:04}-{m:02}")),
                        cx,
                    );
                })
                .into_any_element()
        }
        "forms/ScrubInput" => {
            let label = non_empty_or(&best_label(node), "Value");
            let min = prop_f64(node, "min").unwrap_or(-10_000.0);
            let raw_max = prop_f64(node, "max").unwrap_or(10_000.0);
            let max = if raw_max >= min { raw_max } else { min + 100.0 };
            let step = prop_f64(node, "step")
                .filter(|s| s.is_finite() && *s > 0.0)
                .unwrap_or(1.0);
            let val = view_state
                .value(&state_key)
                .and_then(value_to_f64)
                .or_else(|| prop_f64(node, "value"))
                .unwrap_or(min)
                .clamp(min, max);
            let precision = if step < 1.0 { 2 } else { 0 };
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            ScrubInput::new(eid, label, val)
                .range(min, max)
                .step(step)
                .precision(precision)
                .on_change(move |next, _, cx| {
                    emit_event(&v, &sk, &ntype, "change", json!(next), cx);
                })
                .into_any_element()
        }
        "forms/TransferList" => {
            let choices = extract_choices(node);
            let safe = if choices.is_empty() {
                vec![Choice::new("a", "Item A"), Choice::new("b", "Item B")]
            } else {
                choices
            };
            let chosen: Vec<String> = match view_state.value(&state_key) {
                Some(Value::Array(arr)) => arr
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToOwned::to_owned)
                    .collect(),
                _ => node
                    .props
                    .get("options")
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter(|o| o.get("selected").and_then(Value::as_bool) == Some(true))
                            .filter_map(|o| {
                                o.get("value")
                                    .or_else(|| o.get("label"))
                                    .and_then(Value::as_str)
                                    .map(ToOwned::to_owned)
                            })
                            .collect()
                    })
                    .unwrap_or_default(),
            };
            let left_title = non_empty_or(&best_label(node), "Available");
            let right_title = prop_str(node, "selectedLabel").unwrap_or_else(|| "Chosen".into());
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            TransferList::new(eid, safe)
                .chosen(chosen)
                .titles(left_title, right_title)
                .on_change(move |vals, _, cx| {
                    let out: Vec<Value> = vals.iter().map(|s| json!(s.to_string())).collect();
                    emit_event(&v, &sk, &ntype, "change", Value::Array(out), cx);
                })
                .into_any_element()
        }
        "i18n/SkipLink" => {
            let target = window
                .use_keyed_state(
                    (gpui::ElementId::from(eid.clone()), "skip-target"),
                    cx,
                    |_, cx| cx.focus_handle(),
                )
                .read(cx)
                .clone();
            let label = prop_str(node, "actionLabel")
                .unwrap_or_else(|| non_empty_or(&best_label(node), "Skip to content"));
            let body = best_body(node).unwrap_or_else(|| "Main content".into());
            v_stack()
                .gap_2()
                .child(SkipLink::new(
                    gpui::ElementId::from(eid.clone()),
                    label,
                    &target,
                ))
                .child(
                    div()
                        .id(SharedString::from(format!("{eid}-target")))
                        .track_focus(&target)
                        .tab_index(0)
                        .child(Paragraph::new(body)),
                )
                .into_any_element()
        }
        "interaction/Resizable" => {
            let min = size(px(80.), px(60.));
            let max = size(px(800.), px(500.));
            let (w, h) = match view_state.value(&state_key) {
                Some(Value::Object(m)) => (
                    m.get("width").and_then(value_to_f64).unwrap_or(280.0) as f32,
                    m.get("height").and_then(value_to_f64).unwrap_or(140.0) as f32,
                ),
                _ => (
                    prop_f64(node, "width").unwrap_or(280.0) as f32,
                    prop_f64(node, "height").unwrap_or(140.0) as f32,
                ),
            };
            let initial = size(px(w.clamp(80.0, 800.0)), px(h.clamp(60.0, 500.0)));
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            let title = non_empty_or(&best_title(node), "Resizable");
            Resizable::new(eid, initial, min, max, move |next, _, cx| {
                emit_event(
                    &v,
                    &sk,
                    &ntype,
                    "change",
                    json!({ "width": f32::from(next.width), "height": f32::from(next.height) }),
                    cx,
                );
            })
            .child(
                Card::new().header(
                    CardHeader::new(title).description(best_body(node).unwrap_or_default()),
                ),
            )
            .into_any_element()
        }
        "layout/AspectRatio" => {
            let ratio = prop_f64(node, "ratio")
                .or_else(|| {
                    node.props
                        .get("aspects")
                        .and_then(Value::as_array)
                        .and_then(|arr| arr.first())
                        .and_then(|a| a.get("ratio"))
                        .and_then(value_to_f64)
                })
                .filter(|r| r.is_finite() && *r > 0.0)
                .unwrap_or(16.0 / 9.0) as f32;
            let mut frame = AspectRatio::new(ratio);
            if node.children.is_empty() {
                frame = frame.child(Card::new().header(CardHeader::new(non_empty_or(
                    &prop_str(node, "value").unwrap_or_default(),
                    "Aspect Ratio",
                ))));
            } else {
                for ch in render_children_group(node, &eid, view_state, window, cx, view) {
                    frame = frame.child(ch);
                }
            }
            div().w(px(280.)).child(frame).into_any_element()
        }
        "layout/Container" => {
            let size = match prop_str(node, "size").as_deref() {
                Some("sm") => ContainerSize::Sm,
                Some("lg") => ContainerSize::Lg,
                _ => ContainerSize::Md,
            };
            let mut container = Container::new(size);
            if node.children.is_empty() {
                let body = best_body(node)
                    .or_else(|| prop_str(node, "value"))
                    .unwrap_or_else(|| "Container".into());
                container = container.child(Paragraph::new(body));
            } else {
                for ch in render_children_group(node, &eid, view_state, window, cx, view) {
                    container = container.child(ch);
                }
            }
            container.into_any_element()
        }
        "layout/Dock" => {
            let items = extract_string_items(node);
            let center_text = best_body(node).unwrap_or_else(|| "Center".into());
            let dock = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "dock"),
                cx,
                |_, cx| {
                    let center = center_text.clone();
                    let mut d = Dock::new(
                        move |_, cx| {
                            div()
                                .size_full()
                                .flex()
                                .items_center()
                                .justify_center()
                                .text_color(cx.theme().colors.fg_subtle)
                                .child(center.clone())
                                .into_any_element()
                        },
                        |id, _, cx| {
                            div()
                                .p_2()
                                .text_size(cx.theme().text_size(TextSize::Sm))
                                .text_color(cx.theme().colors.fg_muted)
                                .child(SharedString::from(format!("{id} panel")))
                                .into_any_element()
                        },
                        cx,
                    );
                    if items.is_empty() {
                        d.add(
                            DockPanel {
                                id: "files".into(),
                                title: "Files".into(),
                                icon: IconName::Folder,
                            },
                            DockSide::Left,
                        );
                        d.add(
                            DockPanel {
                                id: "terminal".into(),
                                title: "Terminal".into(),
                                icon: IconName::Terminal,
                            },
                            DockSide::Bottom,
                        );
                    } else {
                        for (idx, title) in items.iter().enumerate() {
                            let side = match idx % 3 {
                                0 => DockSide::Left,
                                1 => DockSide::Right,
                                _ => DockSide::Bottom,
                            };
                            d.add(
                                DockPanel {
                                    id: SharedString::from(format!("panel-{idx}")),
                                    title: SharedString::from(title.clone()),
                                    icon: IconName::Layers,
                                },
                                side,
                            );
                        }
                    }
                    d
                },
            );
            div().w_full().h(px(280.)).child(dock).into_any_element()
        }
        "layout/Drawer" => {
            let open = prop_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), "Open drawer");
            let body = best_body(node).unwrap_or_else(|| "Drawer content".into());
            let v_open = view.clone();
            let v_close = view.clone();
            let sk_open = state_key.clone();
            let sk_close = state_key.clone();
            let ntype = node.node_type.clone();
            let ntype2 = node.node_type.clone();
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .variant(ButtonVariant::Secondary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &ntype, "change", json!(true), cx);
                    }),
            );
            if open {
                stack = stack.child(
                    Drawer::new(eid, move |_, cx| {
                        emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                    })
                    .child(Paragraph::new(body)),
                );
            }
            stack.into_any_element()
        }
        "layout/FloatingPanel" => {
            let open = prop_open(view_state, &state_key, node);
            let title = non_empty_or(&best_title(node), "Panel");
            let label = non_empty_or(&best_label(node), "Show panel");
            let body = best_body(node)
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_default();
            let x = prop_f64(node, "x").unwrap_or(120.0).clamp(0.0, 2000.0) as f32;
            let y = prop_f64(node, "y").unwrap_or(120.0).clamp(0.0, 2000.0) as f32;
            let v_tog = view.clone();
            let v_move = view.clone();
            let sk_tog = state_key.clone();
            let nid_move = node.id.clone();
            let ntype = node.node_type.clone();
            let ntype2 = node.node_type.clone();
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .variant(ButtonVariant::Secondary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_tog, &sk_tog, &ntype, "change", json!(!open), cx);
                    }),
            );
            if open {
                stack = stack.child(
                    FloatingPanel::new(eid, title, point(px(x), px(y)))
                        .w(px(240.))
                        .on_move(move |pt, _, cx| {
                            emit_event(
                                &v_move,
                                &nid_move,
                                &ntype2,
                                "ely:action",
                                json!({ "x": f32::from(pt.x), "y": f32::from(pt.y) }),
                                cx,
                            );
                        })
                        .child(Caption::new(body)),
                );
            }
            stack.into_any_element()
        }
        "layout/Page" => {
            let title = non_empty_or(&best_title(node), "Page");
            let mut page = Page::new(title);
            if let Some(sub) = best_body(node) {
                page = page.subtitle(sub);
            }
            if let Some(act_lbl) = prop_str(node, "actionLabel") {
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                let act = prop_str(node, "action").unwrap_or_else(|| act_lbl.clone());
                page = page.action(
                    Button::new(SharedString::from(format!("{eid}-act")), act_lbl)
                        .size(ControlSize::Sm)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            emit_event(&v, &nid, &ntype, "ely:action", json!(act), cx);
                        }),
                );
            }
            if node.children.is_empty() {
                for item in extract_string_items(node) {
                    page = page.child(Card::new().header(CardHeader::new(item)));
                }
            } else {
                for ch in render_children_group(node, &eid, view_state, window, cx, view) {
                    page = page.child(ch);
                }
            }
            page.into_any_element()
        }
        "layout/ScrollArea" => {
            let mut area = ScrollArea::new(eid.clone())
                .vertical()
                .shadows()
                .w_full()
                .h(px(180.));
            if node.children.is_empty() {
                let items = extract_string_items(node);
                if items.is_empty() {
                    area = area.child(Paragraph::new(
                        best_body(node).unwrap_or_else(|| "Scrollable content".into()),
                    ));
                } else {
                    for item in items {
                        area = area.child(div().px_2().py_1().child(Label::new(item)));
                    }
                }
            } else {
                for ch in render_children_group(node, &eid, view_state, window, cx, view) {
                    area = area.child(ch);
                }
            }
            area.into_any_element()
        }
        "layout/ScrollShadow" | "layout/ScrollToTop" | "layout/Scrollbar" => {
            let handle = window
                .use_keyed_state((gpui::ElementId::from(eid.clone()), "sh"), cx, |_, _| {
                    ScrollHandle::new()
                })
                .read(cx)
                .clone();
            let items = extract_string_items(node);
            let mut list = div()
                .id(SharedString::from(format!("{eid}-box")))
                .size_full()
                .overflow_y_scroll()
                .track_scroll(&handle)
                .flex()
                .flex_col();
            if items.is_empty() {
                list = list.child(Paragraph::new(
                    best_body(node).unwrap_or_else(|| "Scroll content".into()),
                ));
            } else {
                for item in items {
                    list = list.child(div().px_2().py_1().child(Label::new(item)));
                }
            }
            let overlay: AnyElement = match kind {
                "layout/ScrollShadow" => ScrollShadow::new(&handle).into_any_element(),
                "layout/ScrollToTop" => {
                    ScrollToTop::new(SharedString::from(format!("{eid}-top")), &handle)
                        .into_any_element()
                }
                _ => Scrollbar::new(
                    SharedString::from(format!("{eid}-sb")),
                    &handle,
                    Axis::Vertical,
                )
                .into_any_element(),
            };
            div()
                .relative()
                .w_full()
                .h(px(180.))
                .child(list)
                .child(overlay)
                .into_any_element()
        }
        "layout/Sheet" => {
            let open = prop_open(view_state, &state_key, node);
            let title = non_empty_or(&best_title(node), "Sheet");
            let label = non_empty_or(&best_label(node), &title);
            let body = best_body(node).unwrap_or_default();
            let v_open = view.clone();
            let v_close = view.clone();
            let sk_open = state_key.clone();
            let sk_close = state_key.clone();
            let ntype = node.node_type.clone();
            let ntype2 = node.node_type.clone();
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .variant(ButtonVariant::Secondary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &ntype, "change", json!(true), cx);
                    }),
            );
            if open {
                stack = stack.child(
                    Sheet::new(eid, Place::Right, title, move |_, cx| {
                        emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                    })
                    .child(Paragraph::new(body)),
                );
            }
            stack.into_any_element()
        }
        "layout/Sidebar" => {
            let collapsed = view_state.current_bool(&state_key, node);
            let v_tog = view.clone();
            let sk_tog = state_key.clone();
            let ntype_tog = node.node_type.clone();
            let mut sb = Sidebar::new(gpui::ElementId::from(eid.clone()), collapsed).child(
                Button::new(
                    SharedString::from(format!("{eid}-tog")),
                    if collapsed { ">" } else { "Collapse" },
                )
                .size(ControlSize::Sm)
                .variant(ButtonVariant::Ghost)
                .on_click(move |_, _, cx| {
                    emit_event(&v_tog, &sk_tog, &ntype_tog, "change", json!(!collapsed), cx);
                }),
            );
            let items = node
                .props
                .get("sidebarItems")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            for (idx, item) in items.iter().enumerate() {
                let lbl = item
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or("Item")
                    .to_owned();
                let icon = icon_by_name(item.get("icon").and_then(Value::as_str), IconName::File);
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                let act = lbl.clone();
                sb = sb.child(
                    Button::new(
                        SharedString::from(format!("{eid}-si-{idx}")),
                        if collapsed { String::new() } else { lbl },
                    )
                    .icon(icon)
                    .size(ControlSize::Sm)
                    .variant(ButtonVariant::Ghost)
                    .on_click(move |_, _, cx| {
                        emit_event(&v, &nid, &ntype, "ely:action", json!(act), cx);
                    }),
                );
            }
            div().h(px(220.)).child(sb).into_any_element()
        }
        "layout/StickyHeader" => {
            let handle = window
                .use_keyed_state((gpui::ElementId::from(eid.clone()), "sh"), cx, |_, _| {
                    ScrollHandle::new()
                })
                .read(cx)
                .clone();
            let groups = node
                .props
                .get("stickyGroups")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let mut area = ScrollArea::new(SharedString::from(format!("{eid}-sa")))
                .track_scroll(&handle)
                .vertical()
                .w_full()
                .h(px(200.));
            if groups.is_empty() {
                let hdr_text = non_empty_or(&best_title(node), "Section");
                let mut sh = StickyHeader::new(
                    SharedString::from(format!("{eid}-sh")),
                    &handle,
                    move |_, _| {
                        div()
                            .px_2()
                            .py_1()
                            .child(Label::new(hdr_text.clone()))
                            .into_any_element()
                    },
                );
                for item in extract_string_items(node) {
                    sh = sh.child(div().px_2().py_1().child(Caption::new(item)));
                }
                area = area.child(sh);
            } else {
                for (idx, g) in groups.iter().enumerate() {
                    let hdr_text = g
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or("Group")
                        .to_owned();
                    let mut sh = StickyHeader::new(
                        SharedString::from(format!("{eid}-sh-{idx}")),
                        &handle,
                        move |_, _| {
                            div()
                                .px_2()
                                .py_1()
                                .child(Label::new(hdr_text.clone()))
                                .into_any_element()
                        },
                    );
                    if let Some(items) = g.get("items").and_then(Value::as_array) {
                        for item in items.iter().filter_map(Value::as_str) {
                            sh = sh.child(div().px_2().py_1().child(Caption::new(item.to_owned())));
                        }
                    }
                    area = area.child(sh);
                }
            }
            area.into_any_element()
        }
        "layout/Viewport" => {
            let nodes: Vec<(String, f32, f32, f32)> = node
                .props
                .get("nodes")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .enumerate()
                        .map(|(i, n)| {
                            let lbl = n
                                .get("label")
                                .and_then(Value::as_str)
                                .unwrap_or("Node")
                                .to_owned();
                            let x = n
                                .get("x")
                                .and_then(value_to_f64)
                                .unwrap_or((i * 140) as f64)
                                as f32;
                            let y = n.get("y").and_then(value_to_f64).unwrap_or(40.0) as f32;
                            let w = n
                                .get("width")
                                .and_then(value_to_f64)
                                .unwrap_or(120.0)
                                .max(40.0) as f32;
                            (lbl, x, y, w)
                        })
                        .collect()
                })
                .unwrap_or_default();
            let vp = Viewport::new(eid, move |transform, _, cx| {
                let theme = cx.theme();
                let mut canvas = div().size_full();
                for (lbl, x, y, w) in &nodes {
                    let pos = transform.apply(point(px(*x), px(*y)));
                    canvas = canvas.child(
                        div()
                            .absolute()
                            .left(pos.x)
                            .top(pos.y)
                            .w(px(*w) * transform.scale)
                            .p_2()
                            .rounded(theme.radius(Radius::Md))
                            .border_1()
                            .border_color(theme.colors.border)
                            .bg(theme.colors.surface)
                            .child(Label::new(lbl.clone())),
                    );
                }
                canvas.into_any_element()
            })
            .zoom_range(0.1, 8.0);
            div()
                .w_full()
                .h(px(220.))
                .bg(cx.theme().colors.sunken)
                .child(vp)
                .into_any_element()
        }
        "layout/Workspace" => {
            let dock = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "ws-dock"),
                cx,
                |_, cx| {
                    let mut d = Dock::new(
                        |_, _| Label::new("Center").into_any_element(),
                        |id, _, _| Label::new(id.clone()).into_any_element(),
                        cx,
                    );
                    d.add(
                        DockPanel {
                            id: "files".into(),
                            title: "Files".into(),
                            icon: IconName::Folder,
                        },
                        DockSide::Left,
                    );
                    d
                },
            );
            let panes = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "ws-panes"),
                cx,
                |_, _| {
                    PaneGroup::new(|id, _, _| Label::new(format!("Pane {id}")).into_any_element())
                },
            );
            let saved = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "ws-saved"),
                cx,
                |_, _| None::<String>,
            );
            let save_lbl = prop_str(node, "saveLabel").unwrap_or_else(|| "Save layout".into());
            let rest_lbl = prop_str(node, "restoreLabel").unwrap_or_else(|| "Restore".into());
            let has_saved = saved.read(cx).is_some();
            let (d_save, p_save, s_save) = (dock.clone(), panes.clone(), saved.clone());
            let (d_rest, p_rest, s_rest) = (dock, panes.clone(), saved);
            let v_save = view.clone();
            let v_rest = view.clone();
            let nid_save = node.id.clone();
            let nid_rest = node.id.clone();
            let ntype = node.node_type.clone();
            let ntype2 = node.node_type.clone();
            v_stack()
                .gap_2()
                .child(
                    h_stack()
                        .gap_2()
                        .child(
                            Button::new(SharedString::from(format!("{eid}-save")), save_lbl)
                                .size(ControlSize::Sm)
                                .disabled(disabled)
                                .on_click(move |_, _, cx| {
                                    let json = Workspace::capture(d_save.read(cx), p_save.read(cx))
                                        .to_json();
                                    s_save.update(cx, |s, cx| {
                                        *s = Some(json);
                                        cx.notify();
                                    });
                                    emit_event(
                                        &v_save,
                                        &nid_save,
                                        &ntype,
                                        "ely:action",
                                        json!("save"),
                                        cx,
                                    );
                                }),
                        )
                        .child(
                            Button::new(SharedString::from(format!("{eid}-rest")), rest_lbl)
                                .size(ControlSize::Sm)
                                .variant(ButtonVariant::Ghost)
                                .disabled(disabled || !has_saved)
                                .on_click(move |_, _, cx| {
                                    if let Some(json) = s_rest.read(cx).clone()
                                        && let Ok(ws) = Workspace::from_json(&json)
                                    {
                                        let _ = ws.apply(&d_rest, &p_rest, cx);
                                    }
                                    emit_event(
                                        &v_rest,
                                        &nid_rest,
                                        &ntype2,
                                        "ely:action",
                                        json!("restore"),
                                        cx,
                                    );
                                }),
                        ),
                )
                .child(div().w_full().h(px(180.)).child(panes))
                .into_any_element()
        }
        "lists/InfiniteList" => {
            let items = extract_item_objects(node);
            let selected = list_selection(view_state, &state_key);
            let selectable = prop_bool(node, "selectable");
            let multiple = list_multiple(node);
            let v = view.clone();
            let nid = node.id.clone();
            let ntype = node.node_type.clone();
            let cursor = prop_str(node, "cursor").unwrap_or_default();
            let mut list = InfiniteList::new(eid.clone())
                .loading(prop_bool(node, "loading"))
                .done(prop_bool(node, "done"))
                .on_more(move |_, cx| {
                    emit_event(
                        &v,
                        &nid,
                        &ntype,
                        "ely:action",
                        json!({ "action": "load-more", "value": cursor, "cursor": cursor }),
                        cx,
                    );
                });
            if items.is_empty() {
                list = list.child(ListItem::new(
                    SharedString::from(format!("{eid}-r0")),
                    non_empty_or(&best_label(node), "Row 1"),
                ));
            } else {
                for (idx, item) in items.iter().enumerate() {
                    let value = str_from_obj(item, &["value", "id", "label"])
                        .unwrap_or_else(|| format!("row-{idx}"));
                    let lbl = str_from_obj(item, &["label", "title", "value"])
                        .unwrap_or_else(|| format!("Row {}", idx + 1));
                    let mut row = ListItem::new(SharedString::from(format!("{eid}-r-{idx}")), lbl)
                        .selected(selected.contains(&value))
                        .disabled(item.get("disabled").and_then(Value::as_bool) == Some(true));
                    if let Some(description) = str_from_obj(item, &["description", "detail"]) {
                        row = row.description(description);
                    }
                    if selectable {
                        let v = view.clone();
                        let sk = state_key.clone();
                        let ntype = node.node_type.clone();
                        let selected = selected.clone();
                        row = row.on_click(move |_, _, cx| {
                            if multiple {
                                let mut values = selected.clone();
                                if let Some(index) = values.iter().position(|item| item == &value) {
                                    values.remove(index);
                                } else {
                                    values.push(value.clone());
                                }
                                emit_event(
                                    &v,
                                    &sk,
                                    &ntype,
                                    "change",
                                    json!({ "value": value, "values": values }),
                                    cx,
                                );
                            } else {
                                emit_event(&v, &sk, &ntype, "change", json!(value), cx);
                            }
                        });
                    }
                    list = list.child(row);
                }
            }
            list.into_any_element()
        }
        "lists/SortableList" => {
            let items = extract_item_objects(node);
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            let mut list = SortableList::new(eid.clone()).on_reorder(move |from, to, _, cx| {
                emit_event(
                    &v,
                    &sk,
                    &ntype,
                    "change",
                    json!({ "from": from, "to": to }),
                    cx,
                );
            });
            if items.is_empty() {
                list = list
                    .row("a", ListItem::new("a", "First"))
                    .row("b", ListItem::new("b", "Second"));
            } else {
                for (idx, item) in items.iter().enumerate() {
                    let key = str_from_obj(item, &["value", "id", "label"])
                        .unwrap_or_else(|| format!("row-{idx}"));
                    let lbl = str_from_obj(item, &["label", "title", "value"])
                        .unwrap_or_else(|| key.clone());
                    list = list.row(
                        key,
                        ListItem::new(SharedString::from(format!("{eid}-s-{idx}")), lbl),
                    );
                }
            }
            list.into_any_element()
        }
        "lists/SwipeableListItem" => {
            let items = extract_item_objects(node);
            let mut col = v_stack().gap_1();
            if items.is_empty() {
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                col = col.child(
                    SwipeableListItem::new(
                        eid,
                        ListItem::new("sw-item", non_empty_or(&best_label(node), "Item")),
                    )
                    .action(SwipeAction::new(
                        "Archive",
                        IconName::Archive,
                        move |_, cx| {
                            emit_event(&v, &nid, &ntype, "ely:action", json!("archive"), cx);
                        },
                    )),
                );
            } else {
                for (idx, item) in items.iter().enumerate() {
                    let lbl = str_from_obj(item, &["label", "title"])
                        .unwrap_or_else(|| format!("Item {}", idx + 1));
                    let mut li = ListItem::new(SharedString::from(format!("{eid}-li-{idx}")), lbl);
                    if let Some(desc) = str_from_obj(item, &["description", "content"]) {
                        li = li.description(desc);
                    }
                    let mut sw =
                        SwipeableListItem::new(SharedString::from(format!("{eid}-sw-{idx}")), li);
                    if let Some(actions) = item.get("actions").and_then(Value::as_array) {
                        for act in actions {
                            let albl = act
                                .get("label")
                                .and_then(Value::as_str)
                                .unwrap_or("Action")
                                .to_owned();
                            let aval = act
                                .get("value")
                                .and_then(Value::as_str)
                                .unwrap_or(&albl)
                                .to_owned();
                            let tone = parse_tone(act.get("tone").and_then(Value::as_str));
                            let v = view.clone();
                            let nid = node.id.clone();
                            let ntype = node.node_type.clone();
                            sw = sw.action(
                                SwipeAction::new(albl, IconName::Archive, move |_, cx| {
                                    emit_event(&v, &nid, &ntype, "ely:action", json!(aval), cx);
                                })
                                .tone(tone),
                            );
                        }
                    }
                    col = col.child(sw);
                }
            }
            col.into_any_element()
        }
        "lists/VirtualList" => {
            let items = extract_item_objects(node);
            let selected = list_selection(view_state, &state_key);
            let selectable = prop_bool(node, "selectable");
            let multiple = list_multiple(node);
            let total = prop_f64(node, "total")
                .map(|n| (n as usize).clamp(1, 100_000))
                .unwrap_or_else(|| items.len().max(1));
            let start = prop_f64(node, "start")
                .map(|n| (n as usize).max(1))
                .unwrap_or(1);
            let eid_row = eid.clone();
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            VirtualList::new(eid, items.len(), move |ix, _, _| {
                let item = items.get(ix);
                let value = item
                    .and_then(|item| str_from_obj(item, &["value", "id", "label"]))
                    .unwrap_or_else(|| format!("row-{}", start + ix));
                let label = item
                    .and_then(|item| str_from_obj(item, &["label", "title", "value"]))
                    .unwrap_or_else(|| format!("Row {}", start + ix));
                let mut row =
                    ListItem::new(SharedString::from(format!("{eid_row}-vl-{ix}")), label)
                        .selected(selected.contains(&value))
                        .place(start + ix, total);
                if let Some(description) =
                    item.and_then(|item| str_from_obj(item, &["description", "detail"]))
                {
                    row = row.description(description);
                }
                if item.and_then(|item| item.get("disabled").and_then(Value::as_bool)) == Some(true)
                {
                    row = row.disabled(true);
                }
                if selectable {
                    let v = v.clone();
                    let sk = sk.clone();
                    let ntype = ntype.clone();
                    let selected = selected.clone();
                    row = row.on_click(move |_, _, cx| {
                        if multiple {
                            let mut values = selected.clone();
                            if let Some(index) = values.iter().position(|item| item == &value) {
                                values.remove(index);
                            } else {
                                values.push(value.clone());
                            }
                            emit_event(
                                &v,
                                &sk,
                                &ntype,
                                "change",
                                json!({ "value": value, "values": values }),
                                cx,
                            );
                        } else {
                            emit_event(&v, &sk, &ntype, "change", json!(value), cx);
                        }
                    });
                }
                row.into_any_element()
            })
            .w_full()
            .h(px(200.))
            .into_any_element()
        }
        "menus/PieMenu" => {
            let items = extract_item_objects(node);
            let mut pie_items: Vec<PieItem> = items
                .iter()
                .map(|item| {
                    let lbl =
                        str_from_obj(item, &["label", "title"]).unwrap_or_else(|| "Action".into());
                    let val =
                        str_from_obj(item, &["value", "action"]).unwrap_or_else(|| lbl.clone());
                    let icon =
                        icon_by_name(item.get("icon").and_then(Value::as_str), IconName::Circle);
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    PieItem::new(icon, lbl).on_click(move |_, cx| {
                        emit_event(&v, &nid, &ntype, "ely:action", json!(val), cx);
                    })
                })
                .collect();
            while pie_items.len() < 2 {
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                let ix = pie_items.len();
                pie_items.push(
                    PieItem::new(IconName::Circle, format!("Action {}", ix + 1)).on_click(
                        move |_, cx| {
                            emit_event(
                                &v,
                                &nid,
                                &ntype,
                                "ely:action",
                                json!(format!("action-{ix}")),
                                cx,
                            );
                        },
                    ),
                );
            }
            let body = best_body(node).unwrap_or_else(|| "Right-click for the ring".into());
            PieMenu::new(eid, pie_items)
                .child(div().p_3().child(Caption::new(body)))
                .into_any_element()
        }
        "menus/SearchableMenu" => {
            let mut menu = Menu::new();
            let items = extract_item_objects(node);
            if items.is_empty() {
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                menu = menu.item(MenuItem::new("Action").on_click(move |_, cx| {
                    emit_event(&v, &nid, &ntype, "ely:action", json!("action"), cx);
                }));
            } else {
                for item in items {
                    let lbl =
                        str_from_obj(&item, &["label", "title"]).unwrap_or_else(|| "Item".into());
                    let val =
                        str_from_obj(&item, &["value", "action"]).unwrap_or_else(|| lbl.clone());
                    let icon =
                        icon_by_name(item.get("icon").and_then(Value::as_str), IconName::Folder);
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    menu = menu.item(MenuItem::new(lbl).icon(icon).on_click(move |_, cx| {
                        emit_event(&v, &nid, &ntype, "ely:action", json!(val), cx);
                    }));
                }
            }
            let label = non_empty_or(&best_label(node), "Menu");
            let mut sm = SearchableMenu::new(eid, label, menu);
            if let Some(ph) = prop_str(node, "placeholder") {
                sm = sm.placeholder(ph);
            }
            if let Some(icon) = prop_str(node, "icon") {
                sm = sm.icon(icon_by_name(Some(&icon), IconName::FolderOpen));
            }
            sm.into_any_element()
        }
        "navigation/Anchor" => {
            let scroll = window
                .use_keyed_state(
                    (gpui::ElementId::from(eid.clone()), "anc-sh"),
                    cx,
                    |_, _| ScrollHandle::new(),
                )
                .read(cx)
                .clone();
            let sections = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "anc-sec"),
                cx,
                |_, _| Sections::new(scroll.clone()),
            );
            let items = extract_item_objects(node);
            let mut toc = TableOfContents::new(SharedString::from(format!("{eid}-toc")), &sections);
            let mut body_col = div()
                .id(SharedString::from(format!("{eid}-anc-scroll")))
                .flex_1()
                .h(px(180.))
                .overflow_y_scroll()
                .track_scroll(&scroll)
                .flex()
                .flex_col()
                .gap_3();
            if items.is_empty() {
                toc = toc.entry("s1", non_empty_or(&best_title(node), "Section 1"), 0);
                body_col = body_col.child(Anchor::new(&sections, "s1").child(Paragraph::new(
                    best_body(node).unwrap_or_else(|| "Section".into()),
                )));
            } else {
                for (idx, item) in items.iter().enumerate() {
                    let val =
                        str_from_obj(item, &["value", "id"]).unwrap_or_else(|| format!("s-{idx}"));
                    let lbl =
                        str_from_obj(item, &["label", "title"]).unwrap_or_else(|| val.clone());
                    let depth = item.get("depth").and_then(value_to_f64).unwrap_or(0.0) as usize;
                    let text =
                        str_from_obj(item, &["content", "body"]).unwrap_or_else(|| lbl.clone());
                    toc = toc.entry(val.clone(), lbl.clone(), depth);
                    body_col = body_col.child(
                        Anchor::new(&sections, val).child(
                            v_stack()
                                .gap_1()
                                .child(Label::new(lbl))
                                .child(Paragraph::new(text)),
                        ),
                    );
                }
            }
            h_stack()
                .items_start()
                .gap_4()
                .w_full()
                .child(toc)
                .child(body_col)
                .into_any_element()
        }
        "navigation/CommandPalette" => {
            let open = prop_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), "Command palette");
            let v_open = view.clone();
            let sk_open = state_key.clone();
            let ntype = node.node_type.clone();
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .variant(ButtonVariant::Secondary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &ntype, "change", json!(true), cx);
                    }),
            );
            if open {
                let v_close = view.clone();
                let sk_close = state_key.clone();
                let ntype2 = node.node_type.clone();
                let v_run = view.clone();
                let nid_run = node.id.clone();
                let ntype3 = node.node_type.clone();
                let mut palette = CommandPalette::new(eid, move |_, cx| {
                    emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                })
                .on_run(move |val, _, cx| {
                    emit_event(
                        &v_run,
                        &nid_run,
                        &ntype3,
                        "ely:action",
                        json!(val.to_string()),
                        cx,
                    );
                });
                let mut grouped: BTreeMap<String, Vec<Command>> = BTreeMap::new();
                for (idx, item) in extract_item_objects(node).iter().enumerate() {
                    let grp = str_from_obj(item, &["group"]).unwrap_or_else(|| "Commands".into());
                    let lbl = str_from_obj(item, &["label", "title"])
                        .unwrap_or_else(|| format!("Command {}", idx + 1));
                    let val = str_from_obj(item, &["value", "id"]).unwrap_or_else(|| lbl.clone());
                    let icon =
                        icon_by_name(item.get("icon").and_then(Value::as_str), IconName::Terminal);
                    let mut cmd = Command::new(val, lbl).icon(icon);
                    if let Some(raw_sc) = item.get("shortcut").and_then(Value::as_str)
                        && let Some(norm) = normalize_keystroke(raw_sc)
                    {
                        cmd = cmd.keys(norm);
                    }
                    grouped.entry(grp).or_default().push(cmd);
                }
                if grouped.is_empty() {
                    grouped.insert("Commands".into(), vec![Command::new("run", "Run command")]);
                }
                for (grp, cmds) in grouped {
                    palette = palette.group(grp, cmds);
                }
                stack = stack.child(palette);
            }
            stack.into_any_element()
        }
        "navigation/NavigationMenu" => {
            let items = extract_item_objects(node);
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            let mut nav = NavigationMenu::new(eid).on_select(move |val, _, cx| {
                emit_event(&v, &sk, &ntype, "change", json!(val.to_string()), cx);
            });
            if items.is_empty() {
                nav = nav.entry("Menu", [Choice::new("home", "Home")]);
            } else {
                for (idx, entry) in items.iter().enumerate() {
                    let elbl = str_from_obj(entry, &["label", "title"])
                        .unwrap_or_else(|| format!("Menu {}", idx + 1));
                    let mut links: Vec<Choice> = entry
                        .get("items")
                        .and_then(Value::as_array)
                        .map(|arr| {
                            arr.iter()
                                .enumerate()
                                .map(|(lidx, l)| {
                                    let lbl =
                                        l.get("label").and_then(Value::as_str).unwrap_or("Link");
                                    let val = l
                                        .get("value")
                                        .and_then(Value::as_str)
                                        .map(ToOwned::to_owned)
                                        .unwrap_or_else(|| format!("link-{idx}-{lidx}"));
                                    let mut ch = Choice::new(val, lbl.to_owned());
                                    if let Some(note) = l.get("content").and_then(Value::as_str) {
                                        ch = ch.note(note.to_owned());
                                    }
                                    if let Some(icon) = l.get("icon").and_then(Value::as_str) {
                                        ch = ch.icon(icon_by_name(Some(icon), IconName::Compass));
                                    }
                                    ch
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    if links.is_empty() {
                        links.push(Choice::new(format!("entry-{idx}"), elbl.clone()));
                    }
                    nav = nav.entry(elbl, links);
                }
            }
            nav.into_any_element()
        }
        "navigation/QuickOpen" => {
            let open = prop_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), "Go to file");
            let v_open = view.clone();
            let sk_open = state_key.clone();
            let ntype = node.node_type.clone();
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .variant(ButtonVariant::Secondary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &ntype, "change", json!(true), cx);
                    }),
            );
            if open {
                let items = extract_item_objects(node);
                let mut paths = Vec::new();
                let mut recent = Vec::new();
                for item in &items {
                    let p =
                        str_from_obj(item, &["value", "label"]).unwrap_or_else(|| "main.rs".into());
                    if item.get("recent").and_then(Value::as_bool) == Some(true) {
                        recent.push(p.clone());
                    }
                    paths.push(p);
                }
                if paths.is_empty() {
                    paths.push("src/lib.rs".into());
                }
                let v_close = view.clone();
                let sk_close = state_key.clone();
                let ntype2 = node.node_type.clone();
                let v_pick = view.clone();
                let nid_pick = node.id.clone();
                let ntype3 = node.node_type.clone();
                stack = stack.child(
                    QuickOpen::new(eid, paths, move |_, cx| {
                        emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                    })
                    .recent(recent)
                    .on_open(move |path, _, cx| {
                        emit_event(
                            &v_pick,
                            &nid_pick,
                            &ntype3,
                            "ely:action",
                            json!(path.to_string()),
                            cx,
                        );
                    }),
                );
            }
            stack.into_any_element()
        }
        "navigation/QuickSwitcher" => {
            let open = prop_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), "Switch");
            let v_open = view.clone();
            let sk_open = state_key.clone();
            let ntype = node.node_type.clone();
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .variant(ButtonVariant::Secondary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &ntype, "change", json!(true), cx);
                    }),
            );
            if open {
                let items: Vec<Choice> = extract_item_objects(node)
                    .iter()
                    .enumerate()
                    .map(|(idx, o)| {
                        let lbl = str_from_obj(o, &["label", "title"])
                            .unwrap_or_else(|| format!("Item {}", idx + 1));
                        let val = str_from_obj(o, &["value", "id"]).unwrap_or_else(|| lbl.clone());
                        let mut ch = Choice::new(val, lbl);
                        if let Some(note) = str_from_obj(o, &["content", "note"]) {
                            ch = ch.note(note);
                        }
                        if let Some(icon) = o.get("icon").and_then(Value::as_str) {
                            ch = ch.icon(icon_by_name(Some(icon), IconName::FileText));
                        }
                        ch
                    })
                    .collect();
                let v_close = view.clone();
                let sk_close = state_key.clone();
                let ntype2 = node.node_type.clone();
                let v_sw = view.clone();
                let nid_sw = node.id.clone();
                let ntype3 = node.node_type.clone();
                stack = stack.child(
                    QuickSwitcher::new(eid, items, move |_, cx| {
                        emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                    })
                    .on_switch(move |val, _, cx| {
                        emit_event(
                            &v_sw,
                            &nid_sw,
                            &ntype3,
                            "ely:action",
                            json!(val.to_string()),
                            cx,
                        );
                    }),
                );
            }
            stack.into_any_element()
        }
        "navigation/SearchPalette" => {
            let open = prop_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), "Search");
            let v_open = view.clone();
            let sk_open = state_key.clone();
            let ntype = node.node_type.clone();
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .variant(ButtonVariant::Secondary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &ntype, "change", json!(true), cx);
                    }),
            );
            if open {
                let all_items = extract_item_objects(node);
                let v_close = view.clone();
                let sk_close = state_key.clone();
                let ntype2 = node.node_type.clone();
                let v_pick = view.clone();
                let nid_pick = node.id.clone();
                let ntype3 = node.node_type.clone();
                stack = stack.child(
                    SearchPalette::new(
                        eid,
                        move |query| {
                            let q = query.trim().to_ascii_lowercase();
                            let mut grouped: BTreeMap<String, Vec<Choice>> = BTreeMap::new();
                            for (idx, item) in all_items.iter().enumerate() {
                                let lbl = str_from_obj(item, &["label", "title"])
                                    .unwrap_or_else(|| format!("Result {}", idx + 1));
                                let note = str_from_obj(item, &["content", "note"]);
                                if !q.is_empty()
                                    && !lbl.to_ascii_lowercase().contains(&q)
                                    && !note
                                        .as_deref()
                                        .is_some_and(|n| n.to_ascii_lowercase().contains(&q))
                                {
                                    continue;
                                }
                                let grp = str_from_obj(item, &["group"])
                                    .unwrap_or_else(|| "Results".into());
                                let val = str_from_obj(item, &["value", "id"])
                                    .unwrap_or_else(|| lbl.clone());
                                let mut ch = Choice::new(val, lbl);
                                if let Some(n) = note {
                                    ch = ch.note(n);
                                }
                                if let Some(icon) = item.get("icon").and_then(Value::as_str) {
                                    ch = ch.icon(icon_by_name(Some(icon), IconName::Search));
                                }
                                grouped.entry(grp).or_default().push(ch);
                            }
                            grouped
                                .into_iter()
                                .map(|(g, list)| (SharedString::from(g), list))
                                .collect()
                        },
                        move |_, cx| {
                            emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                        },
                    )
                    .on_open(move |val, _, cx| {
                        emit_event(
                            &v_pick,
                            &nid_pick,
                            &ntype3,
                            "ely:action",
                            json!(val.to_string()),
                            cx,
                        );
                    }),
                );
            }
            stack.into_any_element()
        }
        "onboarding/Checklist" => {
            let title = non_empty_or(&best_label(node), "Checklist");
            let done_keys: Vec<String> = match view_state.value(&state_key) {
                Some(Value::Array(arr)) => arr
                    .iter()
                    .filter_map(Value::as_str)
                    .map(ToOwned::to_owned)
                    .collect(),
                _ => Vec::new(),
            };
            let mut tasks: Vec<SetupTask> = extract_item_objects(node)
                .iter()
                .enumerate()
                .map(|(idx, item)| {
                    let key = str_from_obj(item, &["value", "id"])
                        .unwrap_or_else(|| format!("task-{idx}"));
                    let lbl =
                        str_from_obj(item, &["label", "title"]).unwrap_or_else(|| key.clone());
                    let body =
                        str_from_obj(item, &["text", "content", "description"]).unwrap_or_default();
                    let done = item.get("done").and_then(Value::as_bool) == Some(true)
                        || done_keys.contains(&key);
                    SetupTask {
                        key: key.into(),
                        title: lbl.into(),
                        body: body.into(),
                        done,
                    }
                })
                .collect();
            while tasks.len() < 2 {
                let ix = tasks.len() + 1;
                tasks.push(SetupTask {
                    key: format!("step-{ix}").into(),
                    title: format!("Step {ix}").into(),
                    body: String::new().into(),
                    done: false,
                });
            }
            let v = view.clone();
            let nid = node.id.clone();
            let ntype = node.node_type.clone();
            let v_dis = view.clone();
            let nid_dis = node.id.clone();
            let ntype2 = node.node_type.clone();
            SetupChecklist::new(eid, title, tasks, move |key, _, cx| {
                emit_event(&v, &nid, &ntype, "ely:action", json!(key.to_string()), cx);
            })
            .on_dismiss(move |_, cx| {
                emit_event(
                    &v_dis,
                    &nid_dis,
                    &ntype2,
                    "ely:action",
                    json!("dismiss"),
                    cx,
                );
            })
            .into_any_element()
        }
        "onboarding/FeedbackWidget" => {
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            FeedbackWidget::new(eid, move |sentiment, msg, _, cx| {
                emit_event(
                    &v,
                    &sk,
                    &ntype,
                    "change",
                    json!({ "sentiment": sentiment.key(), "message": msg }),
                    cx,
                );
            })
            .into_any_element()
        }
        "onboarding/HelpPanel" => {
            let search = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "help-search"),
                cx,
                |window, cx| TextInput::new(window, cx).placeholder("Search help"),
            );
            let articles: Vec<HelpArticle> = extract_item_objects(node)
                .iter()
                .enumerate()
                .map(|(idx, item)| {
                    let key = str_from_obj(item, &["value", "id"])
                        .unwrap_or_else(|| format!("art-{idx}"));
                    let title =
                        str_from_obj(item, &["label", "title"]).unwrap_or_else(|| key.clone());
                    let summary = str_from_obj(item, &["text", "summary"]).unwrap_or_default();
                    let body =
                        str_from_obj(item, &["body", "content"]).unwrap_or_else(|| summary.clone());
                    HelpArticle {
                        key: key.into(),
                        title: title.into(),
                        summary: summary.into(),
                        body: body.into(),
                    }
                })
                .collect();
            let open = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(SharedString::from);
            let v_open = view.clone();
            let sk_open = state_key.clone();
            let ntype = node.node_type.clone();
            let v_contact = view.clone();
            let nid_contact = node.id.clone();
            let ntype2 = node.node_type.clone();
            let v_sc = view.clone();
            let nid_sc = node.id.clone();
            let ntype3 = node.node_type.clone();
            div()
                .w_full()
                .h(px(280.))
                .child(
                    HelpPanel::new(eid, articles, &search, open, move |key, _, cx| {
                        let val = key.map(|k| json!(k.to_string())).unwrap_or(Value::Null);
                        emit_event(&v_open, &sk_open, &ntype, "change", val, cx);
                    })
                    .on_contact(move |_, cx| {
                        emit_event(
                            &v_contact,
                            &nid_contact,
                            &ntype2,
                            "ely:action",
                            json!("contact"),
                            cx,
                        );
                    })
                    .on_shortcuts(move |_, cx| {
                        emit_event(
                            &v_sc,
                            &nid_sc,
                            &ntype3,
                            "ely:action",
                            json!("shortcuts"),
                            cx,
                        );
                    }),
                )
                .into_any_element()
        }
        "onboarding/HelpTooltip" => {
            let tip = prop_str(node, "inlineHelp")
                .or_else(|| best_body(node))
                .unwrap_or_else(|| "Help".into());
            let label = non_empty_or(&best_label(node), "Help");
            h_stack()
                .gap_2()
                .child(Label::new(label))
                .child(HelpTooltip::new(eid, tip))
                .into_any_element()
        }
        "onboarding/KeyboardShortcutCheatsheet" => {
            let open = prop_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), "Keyboard shortcuts");
            let v_open = view.clone();
            let sk_open = state_key.clone();
            let ntype = node.node_type.clone();
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .variant(ButtonVariant::Secondary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &ntype, "change", json!(true), cx);
                    }),
            );
            if open {
                let search = window.use_keyed_state(
                    (gpui::ElementId::from(eid.clone()), "ks-search"),
                    cx,
                    |window, cx| TextInput::new(window, cx).placeholder("Filter shortcuts"),
                );
                let shortcuts: Vec<Shortcut> = extract_item_objects(node)
                    .iter()
                    .filter_map(|item| {
                        let name = str_from_obj(item, &["label", "name"])?;
                        let raw_keys = item.get("shortcut").and_then(Value::as_str).unwrap_or("");
                        let keys = normalize_keystroke(raw_keys).unwrap_or_else(|| "cmd-/".into());
                        let group =
                            str_from_obj(item, &["group"]).unwrap_or_else(|| "General".into());
                        Some(Shortcut {
                            group: group.into(),
                            name: name.into(),
                            keys: keys.into(),
                        })
                    })
                    .collect();
                let v_close = view.clone();
                let sk_close = state_key.clone();
                let ntype2 = node.node_type.clone();
                stack = stack.child(KeyboardShortcutCheatsheet::new(
                    eid,
                    shortcuts,
                    &search,
                    move |_, cx| {
                        emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                    },
                ));
            }
            stack.into_any_element()
        }
        "onboarding/OnboardingWizard" => {
            let mut steps: Vec<OnboardingStep> = extract_item_objects(node)
                .iter()
                .enumerate()
                .map(|(idx, item)| OnboardingStep {
                    key: str_from_obj(item, &["value", "id"])
                        .unwrap_or_else(|| format!("step-{idx}"))
                        .into(),
                    title: str_from_obj(item, &["label", "title"])
                        .unwrap_or_else(|| format!("Step {}", idx + 1))
                        .into(),
                    body: str_from_obj(item, &["text", "content", "body"])
                        .unwrap_or_default()
                        .into(),
                })
                .collect();
            while steps.len() < 2 {
                let ix = steps.len() + 1;
                steps.push(OnboardingStep {
                    key: format!("step-{ix}").into(),
                    title: format!("Step {ix}").into(),
                    body: String::new().into(),
                });
            }
            let current = view_state
                .value(&state_key)
                .and_then(value_to_f64)
                .map(|n| n.max(0.0) as usize)
                .unwrap_or(0)
                .min(steps.len() - 1);
            let v_step = view.clone();
            let sk_step = state_key.clone();
            let ntype = node.node_type.clone();
            let v_fin = view.clone();
            let nid_fin = node.id.clone();
            let ntype2 = node.node_type.clone();
            let v_skip = view.clone();
            let nid_skip = node.id.clone();
            let ntype3 = node.node_type.clone();
            OnboardingWizard::new(
                eid,
                steps,
                current,
                move |to, _, cx| {
                    emit_event(&v_step, &sk_step, &ntype, "change", json!(to), cx);
                },
                move |_, cx| {
                    emit_event(&v_fin, &nid_fin, &ntype2, "ely:action", json!("finish"), cx);
                },
            )
            .on_skip(move |_, cx| {
                emit_event(&v_skip, &nid_skip, &ntype3, "ely:action", json!("skip"), cx);
            })
            .into_any_element()
        }
        "overlays/Callout" => {
            let open = prop_open(view_state, &state_key, node);
            let title = non_empty_or(&best_title(node), "Peek");
            let label = non_empty_or(&best_label(node), "Open");
            let body = best_body(node).unwrap_or_default();
            let v_tog = view.clone();
            let v_close = view.clone();
            let sk_tog = state_key.clone();
            let sk_close = state_key.clone();
            let ntype = node.node_type.clone();
            let ntype2 = node.node_type.clone();
            let mut row = h_stack().gap_1().flex_wrap();
            if let Some(before) = prop_str(node, "before") {
                row = row.child(Caption::new(before));
            }
            row = row.child(
                Button::new(SharedString::from(format!("{eid}-tog")), label)
                    .variant(ButtonVariant::Link)
                    .size(ControlSize::Sm)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_tog, &sk_tog, &ntype, "change", json!(!open), cx);
                    }),
            );
            if let Some(after) = prop_str(node, "after") {
                row = row.child(Caption::new(after));
            }
            v_stack()
                .gap_1()
                .child(row)
                .child(
                    Peek::new(eid, title, open, move |_, cx| {
                        emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                    })
                    .child(Paragraph::new(body)),
                )
                .into_any_element()
        }
        "overlays/FloatingToolbar" => {
            let init = prop_str(node, "value")
                .unwrap_or_else(|| "Select some of these words to see the tools.".into());
            let input = use_synced_input(
                &eid,
                "ft-in",
                &init,
                "Type text",
                &state_key,
                &node.node_type,
                false,
                window,
                cx,
                view,
            );
            let mut tb = FloatingToolbar::new(gpui::ElementId::from(eid.clone()), &input);
            let items = extract_item_objects(node);
            if items.is_empty() {
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                tb = tb.child(
                    IconButton::new(SharedString::from(format!("{eid}-b")), IconName::Bold)
                        .tooltip("Bold")
                        .on_click(move |_, _, cx| {
                            emit_event(&v, &nid, &ntype, "ely:action", json!("bold"), cx);
                        }),
                );
            } else {
                for (idx, item) in items.iter().enumerate() {
                    let lbl =
                        str_from_obj(item, &["label", "action"]).unwrap_or_else(|| "Tool".into());
                    let act =
                        str_from_obj(item, &["value", "action"]).unwrap_or_else(|| lbl.clone());
                    let icon =
                        icon_by_name(item.get("icon").and_then(Value::as_str), IconName::Bold);
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    tb = tb.child(
                        IconButton::new(SharedString::from(format!("{eid}-t-{idx}")), icon)
                            .tooltip(lbl)
                            .on_click(move |_, _, cx| {
                                emit_event(&v, &nid, &ntype, "ely:action", json!(act), cx);
                            }),
                    );
                }
            }
            v_stack()
                .gap_2()
                .child(Input::new(&input))
                .child(tb)
                .into_any_element()
        }
        "overlays/HoverCard" => {
            let label = non_empty_or(&best_label(node), "Hover");
            let title = non_empty_or(&best_title(node), &label);
            let subtitle = prop_str(node, "subtitle");
            let body = best_body(node).unwrap_or_default();
            HoverCard::new(
                gpui::ElementId::from(eid.clone()),
                Button::new(SharedString::from(format!("{eid}-hc-btn")), label)
                    .variant(ButtonVariant::Ghost)
                    .size(ControlSize::Sm),
                move |_, _| {
                    let mut col = v_stack()
                        .gap_1()
                        .w(px(240.))
                        .child(Label::new(title.clone()));
                    if let Some(sub) = &subtitle {
                        col = col.child(Caption::new(sub.clone()));
                    }
                    if !body.is_empty() {
                        col = col.child(Paragraph::new(body.clone()));
                    }
                    col
                },
            )
            .into_any_element()
        }
        "overlays/Lightbox" => {
            let open = prop_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), "Open gallery");
            let v_open = view.clone();
            let sk_open = state_key.clone();
            let ntype = node.node_type.clone();
            let at_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "lb-at"),
                cx,
                |_, _| 0usize,
            );
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .variant(ButtonVariant::Secondary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &ntype, "change", json!(true), cx);
                    }),
            );
            if open {
                let mut slides: Vec<Slide> = extract_item_objects(node)
                    .iter()
                    .map(|o| {
                        let src =
                            str_from_obj(o, &["src", "url"]).unwrap_or_else(|| "image.png".into());
                        let cap = str_from_obj(o, &["label", "content", "alt"]).unwrap_or_default();
                        Slide::new(image_source(&src), cap)
                    })
                    .collect();
                if slides.is_empty() {
                    let src = prop_str(node, "src").unwrap_or_else(|| "image.png".into());
                    slides.push(Slide::new(
                        image_source(&src),
                        best_body(node).unwrap_or_default(),
                    ));
                }
                let at = (*at_state.read(cx)).min(slides.len() - 1);
                let v_close = view.clone();
                let sk_close = state_key.clone();
                let ntype2 = node.node_type.clone();
                let step_state = at_state;
                stack = stack.child(
                    Lightbox::new(eid, slides, at, move |_, cx| {
                        emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                    })
                    .on_step(move |to, _, cx| {
                        step_state.update(cx, |idx, cx| {
                            *idx = to;
                            cx.notify();
                        });
                    }),
                );
            }
            stack.into_any_element()
        }
        "overlays/Popover" => {
            let label = non_empty_or(&best_label(node), "Open");
            let body = best_body(node).unwrap_or_else(|| "Popover content".into());
            let mut pop = Popover::new(eid, label, move |_, _| {
                div().w(px(220.)).child(Paragraph::new(body.clone()))
            });
            if prop_str(node, "buttonVariant").as_deref() == Some("link") {
                pop = pop.variant(ButtonVariant::Link);
            }
            let mut row = h_stack().gap_1().flex_wrap();
            if let Some(before) = prop_str(node, "before") {
                row = row.child(Caption::new(before));
            }
            row = row.child(pop);
            if let Some(after) = prop_str(node, "after") {
                row = row.child(Caption::new(after));
            }
            row.into_any_element()
        }
        "overlays/Spotlight" => {
            let open = prop_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), "Show spotlight");
            let target_box = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "spot-box"),
                cx,
                |_, _| Bounds::new(point(px(40.), px(40.)), size(px(120.), px(36.))),
            );
            let at_state = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "spot-at"),
                cx,
                |_, _| 0usize,
            );
            let tb_meas = target_box.clone();
            let v_open = view.clone();
            let sk_open = state_key.clone();
            let ntype = node.node_type.clone();
            let mut stack = v_stack().gap_2().child(
                Measure::new(
                    SharedString::from(format!("{eid}-meas")),
                    move |b, _, cx| {
                        tb_meas.update(cx, |prev, _| *prev = b);
                    },
                )
                .child(
                    Button::new(SharedString::from(format!("{eid}-open")), label)
                        .variant(ButtonVariant::Secondary)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            emit_event(&v_open, &sk_open, &ntype, "change", json!(true), cx);
                        }),
                ),
            );
            if open {
                let bounds = *target_box.read(cx);
                let raw_steps = node
                    .props
                    .get("steps")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let v_close = view.clone();
                let sk_close = state_key.clone();
                let ntype2 = node.node_type.clone();
                if raw_steps.len() >= 2 {
                    let tour_steps: Vec<TourStep> = raw_steps
                        .iter()
                        .enumerate()
                        .map(|(i, s)| {
                            let t = s
                                .get("label")
                                .or_else(|| s.get("coachTitle"))
                                .and_then(Value::as_str)
                                .unwrap_or("Step");
                            let b = s
                                .get("content")
                                .or_else(|| s.get("coachContent"))
                                .and_then(Value::as_str)
                                .unwrap_or("");
                            TourStep::new(bounds, format!("{t} {}", i + 1), b.to_owned())
                        })
                        .collect();
                    let at = (*at_state.read(cx)).min(tour_steps.len() - 1);
                    let step_st = at_state;
                    stack = stack.child(
                        Tour::new(eid, tour_steps, at, move |_, cx| {
                            emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                        })
                        .on_step(move |to, _, cx| {
                            step_st.update(cx, |idx, cx| {
                                *idx = to;
                                cx.notify();
                            });
                        }),
                    );
                } else {
                    let title = non_empty_or(&best_title(node), "Spotlight");
                    let body = best_body(node).unwrap_or_default();
                    stack = stack.child(Spotlight::new(
                        eid,
                        TourStep::new(bounds, title, body),
                        move |_, cx| {
                            emit_event(&v_close, &sk_close, &ntype2, "change", json!(false), cx);
                        },
                    ));
                }
            }
            stack.into_any_element()
        }
        "primitives/FocusRing" => {
            let label = prop_str(node, "value")
                .or_else(|| best_body(node))
                .unwrap_or_else(|| non_empty_or(&best_label(node), "FocusRing"));
            let theme = cx.theme();
            div()
                .id(eid)
                .tab_index(0)
                .px_3()
                .py_1p5()
                .rounded(theme.radius(Radius::Md))
                .border_1()
                .border_color(theme.colors.border)
                .focus_ring(cx)
                .child(label)
                .into_any_element()
        }
        "primitives/FocusScope" => {
            let handle = window
                .use_keyed_state((gpui::ElementId::from(eid.clone()), "fs"), cx, |_, cx| {
                    cx.focus_handle()
                })
                .read(cx)
                .clone();
            let theme = cx.theme();
            let mut scope = FocusScope::new(&handle)
                .trap()
                .flex()
                .gap_2()
                .p_2()
                .rounded(theme.radius(Radius::Md))
                .border_1()
                .border_color(theme.colors.border);
            if node.children.is_empty() {
                let items = extract_string_items(node);
                if items.is_empty() {
                    scope = scope.child(
                        div()
                            .id(SharedString::from(format!("{eid}-stop-0")))
                            .tab_index(0)
                            .px_2()
                            .py_1()
                            .border_1()
                            .border_color(theme.colors.border)
                            .focus_ring(cx)
                            .child(non_empty_or(&best_label(node), "Focus item")),
                    );
                } else {
                    for (idx, item) in items.into_iter().enumerate() {
                        scope = scope.child(
                            div()
                                .id(SharedString::from(format!("{eid}-stop-{idx}")))
                                .tab_index(0)
                                .px_2()
                                .py_1()
                                .border_1()
                                .border_color(theme.colors.border)
                                .focus_ring(cx)
                                .child(item),
                        );
                    }
                }
            } else {
                for ch in render_children_group(node, &eid, view_state, window, cx, view) {
                    scope = scope.child(ch);
                }
            }
            scope.into_any_element()
        }
        "primitives/Icon" => {
            let samples = node
                .props
                .get("iconSamples")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            if samples.is_empty() {
                let name = prop_str(node, "name").or_else(|| prop_str(node, "icon"));
                Icon::new(icon_by_name(name.as_deref(), IconName::Sparkles))
                    .size(IconSize::Md)
                    .into_any_element()
            } else {
                let mut row = h_stack().flex_wrap().gap_2();
                for s in samples {
                    let name = s.get("name").and_then(Value::as_str);
                    let icon_name = icon_by_name(name, IconName::Sparkles);
                    let sz = match s.get("size").and_then(value_to_f64).map(|v| v as u32) {
                        Some(12) => IconSize::Xs,
                        Some(14) => IconSize::Sm,
                        Some(20) => IconSize::Lg,
                        Some(24) => IconSize::Xl,
                        Some(32) => IconSize::Xxl,
                        _ => IconSize::Md,
                    };
                    row = row.child(Icon::new(icon_name).size(sz));
                }
                row.into_any_element()
            }
        }
        "primitives/Image" => {
            let src = prop_str(node, "src").unwrap_or_default();
            let img_el = if src.is_empty() {
                Image::placeholder(eid)
            } else {
                Image::new(eid, image_source(&src))
            };
            img_el
                .w(px(198.))
                .h(px(132.))
                .rounded(cx.theme().radius(Radius::Lg))
                .into_any_element()
        }
        "primitives/IntersectionObserver" => {
            let visible =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "vis"), cx, |_, _| {
                    false
                });
            let is_vis = *visible.read(cx);
            let vis_up = visible;
            let text = best_body(node).unwrap_or_else(|| non_empty_or(&best_label(node), "Marker"));
            IntersectionObserver::new(eid, move |seen, _, cx| {
                vis_up.update(cx, |v, cx| {
                    *v = seen;
                    cx.notify();
                });
            })
            .p_2()
            .border_1()
            .border_color(cx.theme().colors.border)
            .child(Label::new(format!(
                "{text} ({})",
                if is_vis { "visible" } else { "out of view" }
            )))
            .into_any_element()
        }
        "primitives/Measure" => {
            let bounds_state =
                window.use_keyed_state((gpui::ElementId::from(eid.clone()), "meas"), cx, |_, _| {
                    None::<Bounds<Pixels>>
                });
            let measured = *bounds_state.read(cx);
            let st_up = bounds_state;
            let body =
                best_body(node).unwrap_or_else(|| non_empty_or(&best_label(node), "Measured"));
            let note = measured
                .map(|b| {
                    format!(
                        "{:.0} x {:.0}",
                        f32::from(b.size.width),
                        f32::from(b.size.height)
                    )
                })
                .unwrap_or_else(|| "measuring".into());
            Measure::new(eid, move |b, _, cx| {
                st_up.update(cx, |prev, cx| {
                    *prev = Some(b);
                    cx.notify();
                });
            })
            .p_2()
            .border_1()
            .border_color(cx.theme().colors.border)
            .child(
                v_stack()
                    .gap_1()
                    .child(Paragraph::new(body))
                    .child(Caption::new(note)),
            )
            .into_any_element()
        }
        "primitives/Overlay" => {
            let open = prop_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), "Show overlay");
            let title = non_empty_or(&best_title(node), "Overlay");
            let body = best_body(node).unwrap_or_default();
            let v_open = view.clone();
            let sk_open = state_key.clone();
            let ntype = node.node_type.clone();
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .variant(ButtonVariant::Secondary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &ntype, "change", json!(true), cx);
                    }),
            );
            if open {
                let v_dis = view.clone();
                let sk_dis = state_key.clone();
                let ntype2 = node.node_type.clone();
                let v_btn = view.clone();
                let sk_btn = state_key.clone();
                let ntype3 = node.node_type.clone();
                let close_lbl = prop_str(node, "closeLabel").unwrap_or_else(|| "Close".into());
                stack = stack.child(
                    Backdrop::new(eid.clone())
                        .place(Place::Center)
                        .on_dismiss(move |_, cx| {
                            emit_event(&v_dis, &sk_dis, &ntype2, "change", json!(false), cx);
                        })
                        .child(
                            Card::new()
                                .header(CardHeader::new(title).description(body))
                                .footer(
                                    Button::new(
                                        SharedString::from(format!("{eid}-close")),
                                        close_lbl,
                                    )
                                    .size(ControlSize::Sm)
                                    .on_click(
                                        move |_, _, cx| {
                                            emit_event(
                                                &v_btn,
                                                &sk_btn,
                                                &ntype3,
                                                "change",
                                                json!(false),
                                                cx,
                                            );
                                        },
                                    ),
                                ),
                        ),
                );
            }
            stack.into_any_element()
        }
        "primitives/Pressable" => {
            let counts = window.use_keyed_state(
                (gpui::ElementId::from(eid.clone()), "press-cnt"),
                cx,
                |_, _| (0u32, 0u32),
            );
            let (taps, holds) = *counts.read(cx);
            let label = non_empty_or(&best_label(node), "Press");
            let c_press = counts.clone();
            let c_hold = counts;
            let v = view.clone();
            let nid = node.id.clone();
            let ntype = node.node_type.clone();
            let v2 = view.clone();
            let nid2 = node.id.clone();
            let ntype2 = node.node_type.clone();
            Pressable::new(eid, move |pressed, _, cx| {
                let theme = cx.theme();
                div()
                    .px_3()
                    .py_2()
                    .rounded(theme.radius(Radius::Md))
                    .border_1()
                    .border_color(theme.colors.border)
                    .bg(if pressed {
                        theme.colors.active
                    } else {
                        theme.colors.surface
                    })
                    .child(Label::new(format!("{label} (taps {taps} · holds {holds})")))
                    .into_any_element()
            })
            .on_press(move |_, cx| {
                c_press.update(cx, |(t, _), cx| {
                    *t += 1;
                    cx.notify();
                });
                emit_event(&v, &nid, &ntype, "click", json!("press"), cx);
            })
            .on_long_press(move |_, cx| {
                c_hold.update(cx, |(_, h), cx| {
                    *h += 1;
                    cx.notify();
                });
                emit_event(&v2, &nid2, &ntype2, "ely:action", json!("long-press"), cx);
            })
            .into_any_element()
        }
        "primitives/Tooltip Trigger" => {
            let label = non_empty_or(&best_label(node), "Hover me");
            let follow = prop_str(node, "followText");
            let tip = follow
                .clone()
                .or_else(|| best_body(node))
                .or_else(|| prop_str(node, "tooltipNote"))
                .unwrap_or_else(|| "Tooltip".into());
            let mut tt = TooltipTrigger::new(
                gpui::ElementId::from(eid.clone()),
                Button::new(SharedString::from(format!("{eid}-btn")), label)
                    .variant(ButtonVariant::Secondary)
                    .size(ControlSize::Sm),
                move |_, _| Label::new(tip.clone()).into_any_element(),
            );
            if follow.is_some() {
                tt = tt.follow_mouse();
            }
            tt.into_any_element()
        }
        "tables/DataGrid" => {
            let mut titles: Vec<SharedString> = node
                .props
                .get("columns")
                .and_then(Value::as_array)
                .map(|cols| {
                    cols.iter()
                        .enumerate()
                        .map(|(i, c)| {
                            c.as_str()
                                .map(ToOwned::to_owned)
                                .or_else(|| {
                                    c.get("label")
                                        .or_else(|| c.get("title"))
                                        .and_then(Value::as_str)
                                        .map(ToOwned::to_owned)
                                })
                                .unwrap_or_else(|| format!("Col {}", i + 1))
                                .into()
                        })
                        .collect()
                })
                .unwrap_or_default();
            if titles.is_empty() {
                titles = vec!["Item".into(), "Value".into()];
            }
            let col_count = titles.len();
            let mut rows: Vec<Vec<SharedString>> = node
                .props
                .get("rows")
                .and_then(Value::as_array)
                .map(|raw| {
                    raw.iter()
                        .map(|r| {
                            let mut cells: Vec<SharedString> = if let Some(arr) = r.as_array() {
                                arr.iter()
                                    .map(|c| {
                                        c.as_str()
                                            .map(ToOwned::to_owned)
                                            .unwrap_or_else(|| c.to_string())
                                            .into()
                                    })
                                    .collect()
                            } else if let Some(arr) = r.get("cells").and_then(Value::as_array) {
                                arr.iter()
                                    .map(|c| {
                                        c.as_str()
                                            .map(ToOwned::to_owned)
                                            .unwrap_or_else(|| c.to_string())
                                            .into()
                                    })
                                    .collect()
                            } else {
                                vec![SharedString::default()]
                            };
                            cells.truncate(col_count);
                            cells.resize(col_count, SharedString::default());
                            cells
                        })
                        .collect()
                })
                .unwrap_or_default();
            if rows.is_empty() {
                rows.push(vec![SharedString::default(); col_count]);
            }
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            DataGrid::new(eid, titles, rows)
                .on_change(move |edits, _, cx| {
                    let out: Vec<Value> = edits
                        .iter()
                        .map(|(r, c, txt)| json!({ "row": r, "col": c, "value": txt.to_string() }))
                        .collect();
                    emit_event(&v, &sk, &ntype, "change", Value::Array(out), cx);
                })
                .w_full()
                .h(px(220.))
                .into_any_element()
        }
        "tables/PivotTable" => {
            let measures = node.props.get("measures").and_then(Value::as_array);
            let columns = node.props.get("columns").and_then(Value::as_array);
            let mut fields = vec![
                prop_str(node, "rowHeader").unwrap_or_else(|| "Row".into()),
                "Column".into(),
                "Value".into(),
            ];
            let mut records: Vec<Vec<Cell>> = Vec::new();
            if let (Some(ms), Some(cols)) = (measures, columns)
                && let Some(first_m) = ms.first()
                && let Some(m_rows) = first_m.get("rows").and_then(Value::as_array)
            {
                if let Some(m_label) = first_m.get("label").and_then(Value::as_str) {
                    fields[2] = m_label.to_owned();
                }
                for r in m_rows {
                    let rlbl = r.get("label").and_then(Value::as_str).unwrap_or("Row");
                    if rlbl.eq_ignore_ascii_case("total") {
                        continue;
                    }
                    if let Some(cells) = r.get("cells").and_then(Value::as_array) {
                        for (c_idx, c_val) in cells.iter().enumerate() {
                            let clbl = cols
                                .get(c_idx)
                                .and_then(|c| c.get("label").and_then(Value::as_str))
                                .unwrap_or("Col");
                            if clbl.eq_ignore_ascii_case("total") {
                                continue;
                            }
                            if let Some(num) = value_to_f64(c_val) {
                                records.push(vec![
                                    Cell::Text(rlbl.to_owned().into()),
                                    Cell::Text(clbl.to_owned().into()),
                                    Cell::Number(num),
                                ]);
                            }
                        }
                    }
                }
            }
            if records.is_empty() {
                records = vec![
                    vec![
                        Cell::Text("Europe".into()),
                        Cell::Text("Q1".into()),
                        Cell::Number(120.0),
                    ],
                    vec![
                        Cell::Text("Americas".into()),
                        Cell::Text("Q1".into()),
                        Cell::Number(180.0),
                    ],
                ];
            }
            PivotTable::new(fields.clone(), records)
                .pivot(
                    fields[0].clone(),
                    fields[1].clone(),
                    fields[2].clone(),
                    Aggregate::Sum,
                )
                .into_any_element()
        }
        "tables/Spreadsheet" => {
            let raw_rows = node
                .props
                .get("rows")
                .and_then(Value::as_array)
                .cloned()
                .unwrap_or_default();
            let col_count = node
                .props
                .get("columns")
                .and_then(Value::as_array)
                .map(|c| c.len())
                .unwrap_or(0)
                .max(4);
            let row_count = raw_rows.len().max(4);
            let mut cells: HashMap<(usize, usize), SharedString> = HashMap::new();
            for (r_idx, r) in raw_rows.iter().enumerate() {
                let arr = r
                    .as_array()
                    .or_else(|| r.get("cells").and_then(Value::as_array));
                if let Some(arr) = arr {
                    for (c_idx, val) in arr.iter().enumerate() {
                        if c_idx < col_count {
                            let txt = val
                                .as_str()
                                .map(ToOwned::to_owned)
                                .unwrap_or_else(|| val.to_string());
                            if !txt.is_empty() {
                                cells.insert((r_idx, c_idx), txt.into());
                            }
                        }
                    }
                }
            }
            let v = view.clone();
            let sk = state_key.clone();
            let ntype = node.node_type.clone();
            Spreadsheet::new(eid, row_count, col_count)
                .cells(cells)
                .on_change(move |edits, _, cx| {
                    let out: Vec<Value> = edits
                        .iter()
                        .map(|(r, c, txt)| json!({ "row": r, "col": c, "value": txt.to_string() }))
                        .collect();
                    emit_event(&v, &sk, &ntype, "change", Value::Array(out), cx);
                })
                .w_full()
                .h(px(220.))
                .into_any_element()
        }
        "tables/TreeTable" => {
            let mut columns: Vec<Column> = Vec::new();
            columns.push(Column::new("name", non_empty_or(&best_label(node), "Name")));
            if let Some(cols) = node.props.get("columns").and_then(Value::as_array) {
                for (i, c) in cols.iter().enumerate() {
                    let title = c
                        .as_str()
                        .map(ToOwned::to_owned)
                        .or_else(|| {
                            c.get("label")
                                .and_then(Value::as_str)
                                .map(ToOwned::to_owned)
                        })
                        .unwrap_or_else(|| format!("Col {}", i + 1));
                    columns.push(Column::new(format!("c-{i}"), title));
                }
            }
            let col_count = columns.len();
            fn build_tree_rows(
                items: &[Value],
                col_count: usize,
                prefix: &str,
                open: &mut Vec<String>,
            ) -> Vec<TreeRow> {
                items
                    .iter()
                    .enumerate()
                    .map(|(idx, item)| {
                        let key = item
                            .get("value")
                            .or_else(|| item.get("id"))
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| format!("{prefix}-{idx}"));
                        if item.get("open").and_then(Value::as_bool) == Some(true) {
                            open.push(key.clone());
                        }
                        let label = item
                            .get("label")
                            .or_else(|| item.get("title"))
                            .and_then(Value::as_str)
                            .unwrap_or("Node")
                            .to_owned();
                        let mut cells = vec![Cell::Text(label.into())];
                        if let Some(raw_cells) = item.get("cells").and_then(Value::as_array) {
                            for c in raw_cells {
                                let txt = c
                                    .as_str()
                                    .map(ToOwned::to_owned)
                                    .unwrap_or_else(|| c.to_string());
                                cells.push(Cell::Text(txt.into()));
                            }
                        }
                        cells.truncate(col_count);
                        cells.resize(col_count, Cell::Empty);
                        let mut row = TreeRow::new(key.clone(), cells);
                        if let Some(children) = item.get("children").and_then(Value::as_array) {
                            row = row.children(build_tree_rows(children, col_count, &key, open));
                        }
                        row
                    })
                    .collect()
            }
            let mut open_keys = Vec::new();
            let raw_rows = node
                .props
                .get("rows")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or(&[]);
            let rows = build_tree_rows(raw_rows, col_count, "tr", &mut open_keys);
            TreeTable::new(eid, columns, rows)
                .open(open_keys)
                .into_any_element()
        }
        "typography/CurrencyText" => {
            let amount = prop_f64(node, "value").unwrap_or(0.0);
            let code = prop_str(node, "currency").unwrap_or_else(|| "USD".into());
            CurrencyText::new(amount, static_str(&code, "USD")).into_any_element()
        }
        "typography/DateTimeText" => {
            let ts = parse_timestamp(
                prop_str(node, "dateTime")
                    .or_else(|| prop_str(node, "value"))
                    .as_deref(),
            );
            let mut dt = DateTimeText::new(ts);
            if let Some(pat) = prop_str(node, "pattern") {
                let z = ts.to_zoned(TimeZone::UTC);
                if strtime::format(&pat, &z).is_ok() {
                    dt = dt.pattern(static_str(&pat, "%b %-d, %Y · %H:%M"));
                }
            }
            dt.into_any_element()
        }
        "typography/DurationText" => {
            let secs = prop_f64(node, "value")
                .unwrap_or(0.0)
                .clamp(0.0, u64::MAX as f64) as u64;
            let style = match prop_str(node, "durationStyle").as_deref() {
                Some("clock") => DurationStyle::Clock,
                _ => DurationStyle::Compact,
            };
            DurationText::new(secs, style).into_any_element()
        }
        "typography/EllipsisTooltip" => {
            let text = prop_str(node, "value")
                .or_else(|| best_body(node))
                .unwrap_or_default();
            let width = prop_f64(node, "width").unwrap_or(240.0).clamp(80.0, 800.0) as f32;
            div()
                .w(px(width))
                .child(EllipsisTooltip::new(eid, text))
                .into_any_element()
        }
        "typography/FileSizeText" => {
            let bytes = prop_f64(node, "value")
                .unwrap_or(0.0)
                .clamp(0.0, u64::MAX as f64) as u64;
            let mut fs = FileSizeText::new(bytes);
            if prop_bool(node, "binary") {
                fs = fs.binary();
            }
            fs.into_any_element()
        }
        "typography/GradientText" => {
            let text = prop_str(node, "value")
                .or_else(|| best_body(node))
                .unwrap_or_else(|| "Gradient".into());
            let mut gt = GradientText::new(text);
            if let (Some(from), Some(to)) = (prop_str(node, "from"), prop_str(node, "to")) {
                gt = gt.colors(
                    parse_hsla(&from, cx.theme().colors.fg),
                    parse_hsla(&to, cx.theme().colors.fg_subtle),
                );
            }
            gt.into_any_element()
        }
        "typography/MiddleEllipsis" => {
            let text = prop_str(node, "value")
                .or_else(|| best_body(node))
                .unwrap_or_default();
            let width = prop_f64(node, "width").unwrap_or(260.0).clamp(80.0, 800.0) as f32;
            div()
                .w(px(width))
                .child(MiddleEllipsis::new(text))
                .into_any_element()
        }
        "typography/NumberText" => {
            let val = prop_f64(node, "value").unwrap_or(0.0);
            let decimals = prop_f64(node, "decimals")
                .map(|d| (d.max(0.0) as usize).min(12))
                .unwrap_or(0);
            NumberText::new(val).decimals(decimals).into_any_element()
        }
        "typography/PercentText" => {
            let ratio = prop_f64(node, "value").unwrap_or(0.0);
            let decimals = prop_f64(node, "decimals")
                .map(|d| (d.max(0.0) as usize).min(12))
                .unwrap_or(1);
            let mut pt = PercentText::new(ratio).decimals(decimals);
            if prop_bool(node, "signed") {
                pt = pt.signed();
            }
            pt.into_any_element()
        }
        "typography/PluralText" => {
            let count = prop_f64(node, "value")
                .unwrap_or(0.0)
                .clamp(0.0, u64::MAX as f64) as u64;
            let one = prop_str(node, "unit").unwrap_or_else(|| "item".into());
            let other = prop_str(node, "otherUnit").unwrap_or_else(|| format!("{one}s"));
            PluralText::new(count, static_str(&one, "item"), static_str(&other, "items"))
                .into_any_element()
        }
        "typography/RelativeTime" => {
            let ts = parse_timestamp(
                prop_str(node, "dateTime")
                    .or_else(|| prop_str(node, "value"))
                    .as_deref(),
            );
            RelativeTime::new(eid, ts).into_any_element()
        }
        "typography/ShimmerText" => {
            let text = prop_str(node, "value")
                .or_else(|| best_body(node))
                .unwrap_or_else(|| "Loading...".into());
            ShimmerText::new(eid, text).into_any_element()
        }
        "typography/Typewriter" => {
            let text = prop_str(node, "value")
                .or_else(|| best_body(node))
                .unwrap_or_else(|| "Hello".into());
            let speed = prop_f64(node, "speed")
                .filter(|s| s.is_finite() && *s > 0.0)
                .unwrap_or(32.0) as f32;
            Typewriter::new(eid, text).speed(speed).into_any_element()
        }
        _ => return None,
    };

    Some(el)
}
