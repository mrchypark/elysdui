use std::{collections::BTreeSet, path::PathBuf, rc::Rc, time::Duration};

use ely_gpui_component::{
    account::{Quota, Standing, Subscription, SubscriptionCard, UsageQuota},
    agent::HumanInputRequest,
    buttons::{
        Button, ButtonGroup, ButtonVariant, CopyButton, SegmentedControl, ToggleGroup, ToggleItem,
    },
    canvas::{Edge, Node, NodeGraph, Port, Viewport},
    charts::{BarChart, LIMIT as CHART_LIMIT, LineChart, Series as ChartSeries},
    chat::{
        Parameter, ParameterPanel, ProjectKnowledgePanel, SuggestionChips, SystemPromptEditor,
        TokenCounter,
    },
    collab::{Comment, CommentThread, Peer, Reaction, Thread},
    data_display::{
        Activity, ActivityFeed, Avatar, Badge, Barcode, Change, Changelog, CountBadge,
        DescriptionList, Meter, Release, Tag, Tone, UsageBar,
    },
    debug::{Flamegraph, HexViewer, ProfileFrame, Span as DebugSpan, TimelineProfiler},
    devtools::{Outcome, PlanStep, QueryHistory, QueryPlanViewer, QueryRun},
    documents::{
        BlockData, BlockEditor, BlockKind, Chapter, EpubReader, Favorite, Favorites, ZenMode,
    },
    editor::CodeEditor,
    feedback::{EmptyState, Notification, ResultView},
    files::{FileExplorer, FileItem, FileView},
    finance::{DrawingToolbar, IndicatorSelector, Overlay, Study, TickerTape, Tool as FinanceTool},
    forms::{
        Calendar, Cascade, Cascader, Choice, DropZone, FileInput, Form, FormField, InlineEdit,
        Input, InputEvent, Knob, ListInput, RelativeDatePicker, RelativeRange, Select, Switch,
        TextInput, UnitInput,
    },
    generative::{AspectRatioPicker, PromptEnhancer, SeedInput, StylePreset, StylePresetPicker},
    git::{Commit, CommitList, DiffLayout, DiffViewer, lanes},
    i18n::{Direction, LOCALES, Locale, SkipLink},
    interaction::ScrollSync,
    layout::{
        Card, CardHeader, Container, Dock, DockPanel, DockSide, Fieldset, Sidebar, SimpleGrid,
        SplitPane, Well, ZStack, h_stack, resize_handle, v_stack,
    },
    lists::{DirEntry, ListItem, SortableList, Tree, TreeNode, VirtualList},
    maps::{LatLon, MapMarker, MapView, MapViewport},
    media::{ModelViewer, Orbit, Scrubber},
    menus::{ContextMenu, DropdownMenu, Menu, MenuItem},
    misc::CookieBanner,
    motion::{ProgressBar, Pulse},
    navigation::{GoToLine, NavGroup, NavItem, NavigationMenu},
    onboarding::{FeatureHighlight, Hotspot},
    overlays::{HoverCard, Popover},
    primitives::{Icon, IconName, Measure, Pressable, TooltipTrigger},
    project::{Priority, Status, Task, TaskList},
    settings::{KeyboardShortcutsList, Shortcut},
    shell::{ResizeBorder, TabBar, TitleBar, WindowControls, WindowTab, drag_region},
    tables::{Cell, Column, DataTable, Row},
    terminal::{CommandBlock, CommandState},
    theme::{
        ActiveTheme, AvatarSize, ContainerSize, ControlSize, IconSize, Platform, Radius, TextSize,
    },
    tooling::{Knob as PlayKnob, Playground},
    typography::{
        Caption, Code, CopyableText, Ellipsis, EllipsisTooltip, Heading, KbdCombo, Label, Latex,
        Paragraph, Subtitle, Title,
    },
};
use gpui::{
    AnyElement, App, Axis, Hsla, ImageSource, InteractiveElement, IntoElement, ParentElement, Rgba,
    SharedString, SharedUri, Styled, Subscription as GpuiSub, WeakEntity, Window, canvas, div,
    fill, point, prelude::*, px, rems, size,
};
use jiff::{Timestamp, civil::Date, tz::TimeZone};
use serde_json::{Value, json};

use crate::{
    catalogue::{
        CatalogueView, best_body, best_label, best_title, extract_choices, extract_item_objects,
        non_empty_or, parse_tree_nodes, prop_bool, prop_f64, prop_str, value_to_f64,
    },
    dashboard::ScreenNode,
};

struct HeldInput {
    entity: gpui::Entity<TextInput>,
    _sub: GpuiSub,
}

fn emit_event(
    view: &WeakEntity<CatalogueView>,
    state_key: &str,
    node_type: &str,
    event: &str,
    value: Value,
    cx: &mut App,
) {
    let _ = view.update(cx, |this, cx| {
        this.trigger_event(state_key, node_type, event, value, cx);
    });
}

fn held_input(
    key: impl Into<SharedString>,
    initial: &str,
    placeholder: &str,
    multiline_rows: Option<(usize, usize)>,
    disabled: bool,
    view_state: &CatalogueView,
    state_key: &str,
    node_type: &str,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> gpui::Entity<TextInput> {
    let initial_text = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .unwrap_or(initial)
        .to_owned();
    let ph = placeholder.to_owned();
    let v = view.clone();
    let sk = state_key.to_owned();
    let nt = node_type.to_owned();
    let held = window.use_keyed_state(key.into(), cx, |window, cx| {
        let entity = cx.new(|cx| {
            let mut ti = TextInput::new(window, cx).placeholder(ph.clone());
            if let Some((min_r, max_r)) = multiline_rows {
                ti = ti.multi_line(min_r.max(1), max_r.max(min_r).max(1));
            }
            if !initial_text.is_empty() {
                ti.set_text(initial_text.clone(), cx);
            }
            ti.set_disabled(disabled, cx);
            ti
        });
        let _sub = cx.subscribe(&entity, move |_, input, event: &InputEvent, cx| {
            if *event == InputEvent::Changed {
                let text = input.read(cx).text().to_owned();
                emit_event(&v, &sk, &nt, "change", Value::String(text), cx);
            }
        });
        HeldInput { entity, _sub }
    });
    let entity = held.read(cx).entity.clone();
    if entity.read(cx).is_disabled() != disabled {
        entity.update(cx, |ti, cx| {
            ti.set_disabled(disabled, cx);
        });
    }
    entity
}

fn obj_str(obj: &serde_json::Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|k| match obj.get(*k) {
        Some(Value::String(s)) => Some(s.clone()),
        Some(Value::Number(n)) => Some(n.to_string()),
        _ => None,
    })
}

fn obj_bool(obj: &serde_json::Map<String, Value>, key: &str) -> bool {
    obj.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn obj_f64(obj: &serde_json::Map<String, Value>, key: &str) -> Option<f64> {
    obj.get(key).and_then(value_to_f64)
}

fn arr_objs(node: &ScreenNode, key: &str) -> Vec<serde_json::Map<String, Value>> {
    node.props
        .get(key)
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(|v| v.as_object().cloned()).collect())
        .unwrap_or_default()
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

fn button_variant(raw: Option<&str>) -> ButtonVariant {
    match raw.map(str::trim).unwrap_or("") {
        "primary" => ButtonVariant::Primary,
        "outline" => ButtonVariant::Outline,
        "ghost" => ButtonVariant::Ghost,
        "danger" | "destructive" => ButtonVariant::Danger,
        _ => ButtonVariant::Secondary,
    }
}

fn parse_hsla(raw: &str, fallback: Hsla) -> Hsla {
    let digits = raw.trim().trim_start_matches('#');
    let expanded: String = match digits.len() {
        3 | 4 => digits.chars().flat_map(|c| [c, c]).collect(),
        6 | 8 => digits.to_owned(),
        _ => return fallback,
    };
    let Ok(val) = u32::from_str_radix(&expanded, 16) else {
        return fallback;
    };
    let rgba = if expanded.len() == 8 {
        val
    } else {
        (val << 8) | 0xff
    };
    Rgba {
        r: ((rgba >> 24) & 0xff) as f32 / 255.0,
        g: ((rgba >> 16) & 0xff) as f32 / 255.0,
        b: ((rgba >> 8) & 0xff) as f32 / 255.0,
        a: (rgba & 0xff) as f32 / 255.0,
    }
    .into()
}

fn finite_or(v: f64, fallback: f64) -> f64 {
    if v.is_finite() { v } else { fallback }
}

fn clamp_share(v: f64) -> f32 {
    if !v.is_finite() {
        return 0.0;
    }
    if v > 1.0 {
        (v / 100.0).clamp(0.0, 1.0) as f32
    } else {
        v.clamp(0.0, 1.0) as f32
    }
}

fn parse_ts(raw: Option<&str>) -> Timestamp {
    raw.and_then(|s| s.trim().parse::<Timestamp>().ok())
        .unwrap_or(Timestamp::UNIX_EPOCH)
}

fn parse_date(raw: Option<&str>) -> Option<Date> {
    let s = raw?.trim();
    let date_part = s.split(['T', ' ']).next().unwrap_or(s);
    let mut parts = date_part.split('-');
    let y = parts.next()?.parse::<i16>().ok()?.clamp(-9998, 9998);
    let m = parts.next()?.parse::<i8>().ok()?.clamp(1, 12);
    let d = parts.next()?.parse::<i8>().ok()?.clamp(1, 31);
    Date::new(y, m, d).ok()
}

fn parse_bytes(raw: &str) -> u64 {
    let trimmed = raw.trim();
    if let Ok(n) = trimmed.parse::<u64>() {
        return n.max(1);
    }
    let lower = trimmed.to_ascii_lowercase();
    let num_part: String = lower
        .chars()
        .take_while(|c| c.is_ascii_digit() || *c == '.')
        .collect();
    let base = num_part
        .parse::<f64>()
        .ok()
        .filter(|v| v.is_finite() && *v > 0.0)
        .unwrap_or(1.0);
    let mult = if lower.contains("gb") {
        1_000_000_000.0
    } else if lower.contains("mb") {
        1_000_000.0
    } else if lower.contains("kb") {
        1_000.0
    } else {
        1.0
    };
    (base * mult).max(1.0) as u64
}

fn img_source(raw: &str) -> ImageSource {
    if raw.starts_with("http://") || raw.starts_with("https://") {
        SharedUri::from(raw.to_owned()).into()
    } else {
        PathBuf::from(raw).into()
    }
}

fn json_to_cell(v: &Value) -> Cell {
    match v {
        Value::Null => Cell::Empty,
        Value::String(s) => Cell::Text(s.clone().into()),
        Value::Number(n) => n
            .as_f64()
            .filter(|f| f.is_finite())
            .map(Cell::Number)
            .unwrap_or_else(|| Cell::Text(n.to_string().into())),
        Value::Bool(b) => Cell::Tag(
            if *b { "true" } else { "false" }.into(),
            if *b { Tone::Success } else { Tone::Neutral },
        ),
        Value::Object(map) => Cell::Text(
            obj_str(map, &["label", "text", "value"])
                .unwrap_or_default()
                .into(),
        ),
        Value::Array(arr) => Cell::Text(format!("{} items", arr.len()).into()),
    }
}

fn extract_table_columns(node: &ScreenNode) -> Vec<String> {
    let cols: Vec<String> = node
        .props
        .get("columns")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(i, c)| {
                    c.as_str()
                        .map(ToOwned::to_owned)
                        .or_else(|| {
                            c.as_object()
                                .and_then(|m| obj_str(m, &["label", "title", "name"]))
                        })
                        .unwrap_or_else(|| format!("Column {}", i + 1))
                })
                .collect()
        })
        .unwrap_or_default();
    if cols.is_empty() {
        vec!["Item".into(), "Value".into()]
    } else {
        cols
    }
}

fn extract_table_rows(node: &ScreenNode, col_count: usize) -> Vec<Row> {
    node.props
        .get("rows")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, r)| {
                    let key = r
                        .as_object()
                        .and_then(|m| obj_str(m, &["key", "id", "value"]))
                        .unwrap_or_else(|| format!("row-{ix}"));
                    let mut cells: Vec<Cell> = if let Some(list) = r.as_array() {
                        list.iter().map(json_to_cell).collect()
                    } else if let Some(list) = r.get("cells").and_then(Value::as_array) {
                        list.iter().map(json_to_cell).collect()
                    } else {
                        vec![json_to_cell(r)]
                    };
                    cells.resize(col_count, Cell::Empty);
                    Row::new(key, cells)
                })
                .collect()
        })
        .unwrap_or_default()
}

fn extract_string_list(node: &ScreenNode, key: &str) -> Vec<String> {
    node.props
        .get(key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|v| {
                    v.as_str().map(ToOwned::to_owned).or_else(|| {
                        v.as_object()
                            .and_then(|m| obj_str(m, &["label", "title", "name", "value"]))
                    })
                })
                .collect()
        })
        .unwrap_or_default()
}

fn parse_cascade_nodes(items: &[Value]) -> Vec<Cascade> {
    items
        .iter()
        .enumerate()
        .filter_map(|(ix, v)| {
            if let Some(s) = v.as_str() {
                return Some(Cascade::new(s.to_owned(), s.to_owned()));
            }
            let obj = v.as_object()?;
            let label = obj_str(obj, &["label", "title", "name", "value"])
                .unwrap_or_else(|| format!("Option {}", ix + 1));
            let value = obj_str(obj, &["value", "id", "name", "label"])
                .unwrap_or_else(|| format!("opt-{ix}"));
            let mut node = Cascade::new(value, label);
            if let Some(children) = obj.get("children").and_then(Value::as_array) {
                for ch in parse_cascade_nodes(children) {
                    node = node.child(ch);
                }
            }
            Some(node)
        })
        .collect()
}

fn find_cascade_path(nodes: &[Cascade], target: &str) -> Option<Vec<SharedString>> {
    for node in nodes {
        if node.value == target || node.label == target {
            return Some(vec![node.value.clone()]);
        }
        if let Some(mut sub) = find_cascade_path(&node.children, target) {
            let mut path = vec![node.value.clone()];
            path.append(&mut sub);
            return Some(path);
        }
    }
    None
}

fn parse_plan_step(v: &Value, depth: usize, ix: usize) -> PlanStep {
    let obj = v.as_object();
    let key = obj
        .and_then(|m| obj_str(m, &["key", "id"]))
        .unwrap_or_else(|| format!("step-{depth}-{ix}"));
    let op = obj
        .and_then(|m| obj_str(m, &["op", "label", "name"]))
        .unwrap_or_else(|| "Scan".into());
    let cost = obj
        .and_then(|m| obj_f64(m, "cost"))
        .filter(|c| c.is_finite() && *c > 0.0)
        .unwrap_or(1.0);
    let rows = obj
        .and_then(|m| m.get("rows"))
        .and_then(Value::as_u64)
        .unwrap_or(1);
    let ms = obj
        .and_then(|m| obj_f64(m, "ms"))
        .filter(|t| t.is_finite() && *t >= 0.0)
        .unwrap_or(0.5);
    let mut step = PlanStep::new(key, op, cost, rows, ms);
    if let Some(target) = obj.and_then(|m| obj_str(m, &["on", "target"])) {
        step = step.on(target);
    }
    if let Some(children) = obj
        .and_then(|m| m.get("children"))
        .and_then(Value::as_array)
    {
        for (cix, child) in children.iter().enumerate() {
            step = step.child(parse_plan_step(child, depth + 1, cix));
        }
    }
    step
}

fn parse_menu_items(
    raw: &[Value],
    view: &WeakEntity<CatalogueView>,
    state_key: &str,
    node_type: &str,
) -> Menu {
    let mut menu = Menu::new();
    let mut added = 0usize;
    for (ix, v) in raw.iter().enumerate() {
        let Some(obj) = v.as_object() else {
            continue;
        };
        if obj_bool(obj, "separator") {
            menu = menu.separator();
            continue;
        }
        if let Some(heading) = obj_str(obj, &["heading"]) {
            menu = menu.item(MenuItem::new(heading).disabled(true));
            added += 1;
            continue;
        }
        let lbl =
            obj_str(obj, &["label", "title", "name"]).unwrap_or_else(|| format!("Item {}", ix + 1));
        let val = obj_str(obj, &["value", "action", "id"]).unwrap_or_else(|| lbl.clone());
        let disabled = obj_bool(obj, "disabled");
        let checked = obj_bool(obj, "selected") || obj_bool(obj, "checked");
        let mut mi = if obj.contains_key("selected") || obj.contains_key("checked") {
            MenuItem::check(lbl, checked)
        } else {
            MenuItem::new(lbl)
        };
        if let Some(sc) = obj_str(obj, &["shortcut"]) {
            mi = mi.keys(sc);
        }
        if let Some(ic) = obj_str(obj, &["icon"]) {
            mi = mi.icon(icon_by_name(Some(&ic), IconName::Circle));
        }
        mi = mi.disabled(disabled);
        let v_c = view.clone();
        let sk = state_key.to_owned();
        let nt = node_type.to_owned();
        mi = mi.on_click(move |_, cx| {
            emit_event(&v_c, &sk, &nt, "change", json!(val), cx);
        });
        menu = menu.item(mi);
        added += 1;
    }
    if added == 0 {
        let v_c = view.clone();
        let sk = state_key.to_owned();
        let nt = node_type.to_owned();
        menu = menu.item(MenuItem::new("Action").on_click(move |_, cx| {
            emit_event(&v_c, &sk, &nt, "ely:action", json!("action"), cx);
        }));
    }
    menu
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
    let disabled = prop_bool(node, "disabled");
    let readonly = prop_bool(node, "readonly");
    let ntype = node.node_type.clone();
    let sk = state_key.to_owned();
    let id = gpui::ElementId::from(eid.clone());

    let el: AnyElement = match kind {
        // ---------------- account ----------------
        "account/SubscriptionCard" => {
            let plan = prop_str(node, "plan")
                .or_else(|| prop_str(node, "label"))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Pro".into());
            let price_raw = prop_str(node, "price").unwrap_or_default();
            let price = prop_f64(node, "price")
                .or_else(|| {
                    let cleaned: String = price_raw
                        .chars()
                        .filter(|c| c.is_ascii_digit() || *c == '.')
                        .collect();
                    cleaned.parse::<f64>().ok()
                })
                .filter(|p| p.is_finite() && *p >= 0.0)
                .unwrap_or(20.0);
            let currency = prop_str(node, "currency")
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "$".into());
            let renews_str = prop_str(node, "renews").unwrap_or_else(|| "1 October 2026".into());
            let standing = match prop_str(node, "standing")
                .unwrap_or_default()
                .to_ascii_lowercase()
                .as_str()
            {
                "trial" => Standing::Trial {
                    ends: renews_str.into(),
                },
                "canceled" | "cancelled" => Standing::Canceled {
                    ends: renews_str.into(),
                },
                "pastdue" | "past_due" | "past due" => Standing::PastDue,
                _ => Standing::Active {
                    renews: renews_str.into(),
                },
            };
            let canceled = matches!(standing, Standing::Canceled { .. });
            let sub = Subscription {
                plan: plan.into(),
                price,
                currency: currency.into(),
                yearly: price_raw.to_ascii_lowercase().contains("year"),
                standing,
            };
            let mut card = SubscriptionCard::new(id.clone(), sub);
            if !disabled {
                let (v1, sk1, nt1) = (view.clone(), sk.clone(), ntype.clone());
                card = card.on_change(move |_, cx| {
                    emit_event(&v1, &sk1, &nt1, "ely:action", json!("change"), cx);
                });
                if canceled {
                    let (v2, sk2, nt2) = (view.clone(), sk.clone(), ntype.clone());
                    card = card.on_resume(move |_, cx| {
                        emit_event(&v2, &sk2, &nt2, "ely:action", json!("resume"), cx);
                    });
                } else {
                    let (v2, sk2, nt2) = (view.clone(), sk.clone(), ntype.clone());
                    card = card.on_cancel(move |_, cx| {
                        emit_event(&v2, &sk2, &nt2, "ely:action", json!("cancel"), cx);
                    });
                }
            }
            let quotas: Vec<Quota> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, it)| {
                    let name = obj_str(&it, &["label", "name"])
                        .unwrap_or_else(|| format!("Quota {}", ix + 1));
                    let limit = obj_f64(&it, "max")
                        .filter(|m| m.is_finite() && *m > 0.0)
                        .unwrap_or(100.0);
                    let used = obj_f64(&it, "value")
                        .filter(|u| u.is_finite() && *u >= 0.0)
                        .unwrap_or(0.0);
                    let unit = obj_str(&it, &["unit"]).unwrap_or_default();
                    Quota {
                        key: format!("quota-{ix}").into(),
                        name: name.into(),
                        used,
                        limit,
                        unit: unit.into(),
                    }
                })
                .collect();
            if quotas.is_empty() {
                card.into_any_element()
            } else {
                let mut uq = UsageQuota::new((id, "quotas"), quotas);
                if let Some(resets) = prop_str(node, "resets").filter(|s| !s.is_empty()) {
                    uq = uq.resets(resets);
                }
                v_stack().gap_3().child(card).child(uq).into_any_element()
            }
        }

        // ---------------- agent ----------------
        "agent/InterruptButton" => {
            let question = prop_str(node, "question")
                .or_else(|| best_body(node))
                .unwrap_or_else(|| "How should the agent continue?".into());
            let choices: Vec<String> = extract_item_objects(node)
                .into_iter()
                .chain(arr_objs(node, "choices"))
                .filter_map(|m| obj_str(&m, &["label", "value"]))
                .collect();
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let field =
                window.use_keyed_state((id.clone(), "input"), cx, |w, cx| TextInput::new(w, cx));
            let mut req =
                HumanInputRequest::new(id.clone(), question, &field, move |ans, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(ans), cx);
                });
            if !choices.is_empty() {
                req = req.choices(choices);
            }
            let answered = view_state
                .value(&sk)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "answer"))
                .filter(|s| !s.is_empty());
            if let Some(ans) = answered {
                req = req.answered(ans);
            }
            let interrupt_lbl = prop_str(node, "interruptLabel")
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Interrupt".into());
            let v2 = view.clone();
            let sk2 = sk.clone();
            let nt2 = ntype.clone();
            let btn = Button::new((id, "interrupt"), interrupt_lbl)
                .variant(ButtonVariant::Danger)
                .size(ControlSize::Sm)
                .icon(IconName::Square)
                .disabled(disabled)
                .on_click(move |_, _, cx| {
                    emit_event(&v2, &sk2, &nt2, "ely:action", json!("interrupt"), cx);
                });
            v_stack().gap_2().child(req).child(btn).into_any_element()
        }

        "agent/SubAgentTree" => {
            let mut nodes = parse_tree_nodes(
                node.props
                    .get("items")
                    .and_then(Value::as_array)
                    .map(Vec::as_slice)
                    .unwrap_or(&[]),
            );
            if nodes.is_empty() {
                nodes.push(TreeNode::new(
                    "root",
                    non_empty_or(&best_label(node), "Agent"),
                ));
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut tree = Tree::new(id, nodes).on_select(move |keys, _, cx| {
                let vals: Vec<Value> = keys.iter().map(|k| json!(k.to_string())).collect();
                emit_event(&v1, &sk1, &nt1, "change", Value::Array(vals), cx);
            });
            if let Some(sel) = view_state.value(&sk).and_then(Value::as_str) {
                tree = tree.selected([sel.to_owned()]);
            }
            tree.into_any_element()
        }

        "agent/TokenUsageChart" => {
            let max_tokens = prop_f64(node, "max")
                .filter(|m| m.is_finite() && *m >= 1.0)
                .unwrap_or(100.0) as usize;
            let used_tokens = (prop_f64(node, "value")
                .filter(|u| u.is_finite() && *u >= 0.0)
                .unwrap_or(25.0) as usize)
                .min(max_tokens.saturating_mul(10));
            let share = (used_tokens as f32 / max_tokens.max(1) as f32).clamp(0.0, 1.0);
            let series = ChartSeries::new(
                "Tokens",
                vec![
                    (used_tokens as f64 * 0.4).min(CHART_LIMIT * 0.5),
                    (used_tokens as f64 * 0.6).min(CHART_LIMIT * 0.5),
                    (used_tokens as f64).min(CHART_LIMIT * 0.5),
                ],
            );
            v_stack()
                .gap_2()
                .child(TokenCounter::new(used_tokens).limit(max_tokens))
                .child(Meter::new((id.clone(), "meter"), "Token budget", share))
                .child(BarChart::new((id, "bar"), ["Prompt", "Tools", "Total"]).series(series))
                .into_any_element()
        }

        "agent/TraceViewer" => {
            let duration = prop_f64(node, "duration")
                .filter(|d| d.is_finite() && *d > 0.0)
                .unwrap_or(4600.0);
            let raw_tracks = arr_objs(node, "tracks");
            let mut track_names: Vec<String> = Vec::new();
            let mut spans: Vec<DebugSpan> = Vec::new();
            let mut selected_idx: Option<usize> = None;
            for (t_ix, tr) in raw_tracks.iter().enumerate() {
                let tname = obj_str(tr, &["label", "name"])
                    .unwrap_or_else(|| format!("Track {}", t_ix + 1));
                track_names.push(tname);
                if let Some(arr) = tr.get("spans").and_then(Value::as_array) {
                    for sp in arr.iter().filter_map(Value::as_object) {
                        let start = obj_f64(sp, "start").unwrap_or(0.0).clamp(0.0, duration);
                        let end = obj_f64(sp, "end")
                            .unwrap_or(start + 1.0)
                            .clamp(start + 0.1, duration.max(start + 0.1));
                        let name = obj_str(sp, &["label", "name", "value"])
                            .unwrap_or_else(|| "span".into());
                        if obj_bool(sp, "selected") {
                            selected_idx = Some(spans.len());
                        }
                        spans.push(DebugSpan {
                            track: t_ix,
                            name: name.into(),
                            start,
                            end,
                        });
                    }
                }
            }
            if track_names.is_empty() {
                track_names.push("Session".into());
            }
            if spans.is_empty() {
                spans.push(DebugSpan {
                    track: 0,
                    name: non_empty_or(&best_title(node), "trace").into(),
                    start: 0.0,
                    end: duration,
                });
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut tp = TimelineProfiler::new(id, track_names, spans, (0.0, duration)).on_select(
                move |ix, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(ix), cx);
                },
            );
            if let Some(sel) = view_state
                .value(&sk)
                .and_then(Value::as_u64)
                .map(|u| u as usize)
                .or(selected_idx)
            {
                tp = tp.selected(sel);
            }
            tp.into_any_element()
        }

        // ---------------- buttons ----------------
        "buttons/ShortcutHint" => {
            let items = extract_item_objects(node);
            let mut row = h_stack().flex_wrap().gap_2();
            if items.is_empty() {
                let lbl = non_empty_or(&best_label(node), "Action");
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                row = row.child(
                    Button::new((id, "btn"), lbl)
                        .variant(button_variant(prop_str(node, "buttonVariant").as_deref()))
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            emit_event(&v1, &sk1, &nt1, "click", json!("action"), cx);
                        }),
                );
            } else {
                for (ix, it) in items.iter().enumerate() {
                    let lbl = obj_str(it, &["label", "title"])
                        .unwrap_or_else(|| format!("Action {}", ix + 1));
                    let val = obj_str(it, &["value", "action"]).unwrap_or_else(|| lbl.clone());
                    let sc = obj_str(it, &["shortcut", "shortcutKeys"]);
                    let var = button_variant(obj_str(it, &["buttonVariant"]).as_deref());
                    let v1 = view.clone();
                    let sk1 = sk.clone();
                    let nt1 = ntype.clone();
                    let mut item_row = h_stack().items_center().gap_1().child(
                        Button::new(SharedString::from(format!("{eid}-sc-{ix}")), lbl)
                            .variant(var)
                            .disabled(disabled || obj_bool(it, "disabled"))
                            .on_click(move |_, _, cx| {
                                emit_event(&v1, &sk1, &nt1, "click", json!(val), cx);
                            }),
                    );
                    if let Some(sc_text) = sc.filter(|s| !s.is_empty()) {
                        item_row = item_row.child(KbdCombo::new(&sc_text));
                    }
                    row = row.child(item_row);
                }
            }
            row.into_any_element()
        }

        "buttons/Sizes" => {
            let items = extract_item_objects(node);
            let mut row = h_stack().flex_wrap().items_center().gap_2();
            if items.is_empty() {
                for (sz, lbl) in [
                    (ControlSize::Sm, "Small"),
                    (ControlSize::Md, "Medium"),
                    (ControlSize::Lg, "Large"),
                ] {
                    let v1 = view.clone();
                    let sk1 = sk.clone();
                    let nt1 = ntype.clone();
                    row = row.child(
                        Button::new(SharedString::from(format!("{eid}-sz-{lbl}")), lbl)
                            .size(sz)
                            .disabled(disabled)
                            .on_click(move |_, _, cx| {
                                emit_event(&v1, &sk1, &nt1, "click", json!(lbl), cx);
                            }),
                    );
                }
            } else {
                for (ix, it) in items.iter().enumerate() {
                    let lbl = obj_str(it, &["label"]).unwrap_or_else(|| format!("Size {}", ix + 1));
                    let val = obj_str(it, &["value"]).unwrap_or_else(|| lbl.clone());
                    let sz = match obj_str(it, &["size"]).unwrap_or_default().as_str() {
                        "sm" => ControlSize::Sm,
                        "lg" => ControlSize::Lg,
                        _ => ControlSize::Md,
                    };
                    let var = button_variant(
                        obj_str(it, &["buttonVariant"])
                            .or_else(|| prop_str(node, "buttonVariant"))
                            .as_deref(),
                    );
                    let v1 = view.clone();
                    let sk1 = sk.clone();
                    let nt1 = ntype.clone();
                    row = row.child(
                        Button::new(SharedString::from(format!("{eid}-sz-{ix}")), lbl)
                            .variant(var)
                            .size(sz)
                            .disabled(disabled || obj_bool(it, "disabled"))
                            .on_click(move |_, _, cx| {
                                emit_event(&v1, &sk1, &nt1, "click", json!(val), cx);
                            }),
                    );
                }
            }
            row.into_any_element()
        }

        "buttons/With icons" => {
            let items = extract_item_objects(node);
            let mut row = h_stack().flex_wrap().gap_2();
            if items.is_empty() {
                let lbl = non_empty_or(&best_label(node), "Action");
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                row = row.child(
                    Button::new((id, "ic-btn"), lbl)
                        .icon(IconName::Sparkles)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            emit_event(&v1, &sk1, &nt1, "click", json!("action"), cx);
                        }),
                );
            } else {
                for (ix, it) in items.iter().enumerate() {
                    let lbl =
                        obj_str(it, &["label"]).unwrap_or_else(|| format!("Action {}", ix + 1));
                    let val = obj_str(it, &["value"]).unwrap_or_else(|| lbl.clone());
                    let icon = icon_by_name(
                        obj_str(it, &["icon"]).as_deref(),
                        match val.as_str() {
                            "new" => IconName::Plus,
                            "share" => IconName::Share2,
                            "sort" => IconName::ChevronsUpDown,
                            "delete" => IconName::Trash2,
                            _ => IconName::Circle,
                        },
                    );
                    let var = button_variant(
                        obj_str(it, &["buttonVariant"])
                            .or_else(|| prop_str(node, "buttonVariant"))
                            .as_deref(),
                    );
                    let v1 = view.clone();
                    let sk1 = sk.clone();
                    let nt1 = ntype.clone();
                    row = row.child(
                        Button::new(SharedString::from(format!("{eid}-wi-{ix}")), lbl)
                            .variant(var)
                            .icon(icon)
                            .disabled(disabled || obj_bool(it, "disabled"))
                            .on_click(move |_, _, cx| {
                                emit_event(&v1, &sk1, &nt1, "click", json!(val), cx);
                            }),
                    );
                }
            }
            row.into_any_element()
        }

        // ---------------- calendar ----------------
        "calendar/MiniCalendar" => {
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut cal = Calendar::new(id).on_pick(move |d, _, cx| {
                emit_event(&v1, &sk1, &nt1, "change", json!(d.to_string()), cx);
            });
            let selected = view_state
                .value(&sk)
                .and_then(Value::as_str)
                .and_then(|s| parse_date(Some(s)))
                .or_else(|| parse_date(prop_str(node, "date").as_deref()));
            if let Some(d) = selected {
                cal = cal.selected(d);
            }
            if let Some(t) = parse_date(prop_str(node, "today").as_deref()) {
                cal = cal.today(t);
            }
            cal.into_any_element()
        }

        // ---------------- canvas ----------------
        "canvas/NodeEditor" => {
            let scene = node.props.get("canvasScene").and_then(Value::as_object);
            let raw_nodes = scene
                .and_then(|s| s.get("nodes"))
                .and_then(Value::as_array)
                .or_else(|| node.props.get("nodes").and_then(Value::as_array))
                .cloned()
                .unwrap_or_default();
            let raw_links = scene
                .and_then(|s| s.get("links"))
                .and_then(Value::as_array)
                .or_else(|| node.props.get("edges").and_then(Value::as_array))
                .cloned()
                .unwrap_or_default();
            let mut nodes: Vec<Node> = raw_nodes
                .iter()
                .enumerate()
                .filter_map(|(ix, v)| {
                    let obj = v.as_object()?;
                    let key = obj_str(obj, &["id", "key"]).unwrap_or_else(|| format!("n-{ix}"));
                    let title =
                        obj_str(obj, &["name", "label", "title"]).unwrap_or_else(|| key.clone());
                    let x = finite_or(obj_f64(obj, "x").unwrap_or(20.0 + ix as f64 * 220.0), 20.0)
                        as f32;
                    let y = finite_or(obj_f64(obj, "y").unwrap_or(40.0), 40.0) as f32;
                    let mut n = Node::new(key, title, (x, y));
                    if let Some(inputs) = obj.get("inputs").and_then(Value::as_array) {
                        for (pix, p) in inputs.iter().filter_map(Value::as_object).enumerate() {
                            let pk =
                                obj_str(p, &["id", "key"]).unwrap_or_else(|| format!("in-{pix}"));
                            let pn = obj_str(p, &["name", "label"]).unwrap_or_else(|| pk.clone());
                            let pkind =
                                obj_str(p, &["kind", "type"]).unwrap_or_else(|| "any".into());
                            n = n.input(Port::new(pk, pn, pkind));
                        }
                    }
                    if let Some(outputs) = obj.get("outputs").and_then(Value::as_array) {
                        for (pix, p) in outputs.iter().filter_map(Value::as_object).enumerate() {
                            let pk =
                                obj_str(p, &["id", "key"]).unwrap_or_else(|| format!("out-{pix}"));
                            let pn = obj_str(p, &["name", "label"]).unwrap_or_else(|| pk.clone());
                            let pkind =
                                obj_str(p, &["kind", "type"]).unwrap_or_else(|| "any".into());
                            n = n.output(Port::new(pk, pn, pkind));
                        }
                    }
                    Some(n)
                })
                .collect();
            if nodes.is_empty() {
                nodes.push(
                    Node::new("n0", non_empty_or(&best_title(node), "Node"), (24.0, 24.0))
                        .output(Port::new("out", "Out", "any")),
                );
            }
            let edges: Vec<Edge> = raw_links
                .iter()
                .filter_map(|v| {
                    let obj = v.as_object()?;
                    let from = obj_str(obj, &["from", "source"])?;
                    let from_port =
                        obj_str(obj, &["fromPort", "sourcePort"]).unwrap_or_else(|| "out".into());
                    let to = obj_str(obj, &["to", "target"])?;
                    let to_port =
                        obj_str(obj, &["toPort", "targetPort"]).unwrap_or_else(|| "in".into());
                    Some(Edge::new((from, from_port), (to, to_port)))
                })
                .collect();
            let view_obj = scene.and_then(|s| s.get("view")).and_then(Value::as_object);
            let vx = finite_or(view_obj.and_then(|v| obj_f64(v, "x")).unwrap_or(0.0), 0.0) as f32;
            let vy = finite_or(view_obj.and_then(|v| obj_f64(v, "y")).unwrap_or(0.0), 0.0) as f32;
            let vz = finite_or(
                view_obj
                    .and_then(|v| obj_f64(v, "zoom"))
                    .or_else(|| prop_f64(node, "zoom"))
                    .unwrap_or(1.0),
                1.0,
            )
            .clamp(0.1, 8.0) as f32;
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let v2 = view.clone();
            let sk2 = sk.clone();
            let nt2 = ntype.clone();
            div()
                .w_full()
                .h(px(260.))
                .child(
                    NodeGraph::new(id, Viewport::new(vx, vy, vz), nodes, edges)
                        .on_select(move |keys, _, cx| {
                            let vals: Vec<Value> =
                                keys.iter().map(|k| json!(k.to_string())).collect();
                            emit_event(&v1, &sk1, &nt1, "change", Value::Array(vals), cx);
                        })
                        .on_connect(move |edge, _, cx| {
                            emit_event(
                                &v2,
                                &sk2,
                                &nt2,
                                "ely:action",
                                json!({
                                    "from": edge.from.0.to_string(),
                                    "to": edge.to.0.to_string()
                                }),
                                cx,
                            );
                        }),
                )
                .into_any_element()
        }

        // ---------------- chat ----------------
        "chat/FolderList" => {
            let mut tree_nodes = parse_tree_nodes(
                node.props
                    .get("items")
                    .and_then(Value::as_array)
                    .map(Vec::as_slice)
                    .unwrap_or(&[]),
            );
            if tree_nodes.is_empty() {
                tree_nodes.push(TreeNode::new(
                    "folder-0",
                    non_empty_or(&best_label(node), "Folders"),
                ));
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let tree =
                Tree::new((id.clone(), "folders"), tree_nodes).on_select(move |keys, _, cx| {
                    let vals: Vec<Value> = keys.iter().map(|k| json!(k.to_string())).collect();
                    emit_event(&v1, &sk1, &nt1, "change", Value::Array(vals), cx);
                });
            let files: Vec<(String, u64)> = arr_objs(node, "files")
                .into_iter()
                .enumerate()
                .map(|(ix, f)| {
                    let name =
                        obj_str(&f, &["name", "label"]).unwrap_or_else(|| format!("file-{ix}"));
                    let sz = obj_str(&f, &["content", "size"])
                        .map(|s| parse_bytes(&s))
                        .unwrap_or(1024);
                    (name, sz)
                })
                .collect();
            if files.is_empty() {
                tree.into_any_element()
            } else {
                let cap = prop_str(node, "capacity")
                    .map(|c| parse_bytes(&c))
                    .unwrap_or(2_000_000)
                    .max(1);
                let v2 = view.clone();
                let sk2 = sk.clone();
                let nt2 = ntype.clone();
                let kp = ProjectKnowledgePanel::new((id, "knowledge"), files, cap).on_add(
                    move |_, cx| {
                        emit_event(&v2, &sk2, &nt2, "ely:action", json!("add-file"), cx);
                    },
                );
                v_stack().gap_3().child(tree).child(kp).into_any_element()
            }
        }

        "chat/MathBlock" => {
            let formula = prop_str(node, "formula")
                .filter(|s| !s.trim().is_empty())
                .or_else(|| prop_str(node, "value"))
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| "c' = c + t(1 - c)".into());
            let title = non_empty_or(&best_label(node), "Formula");
            let rendered = match Latex::parse(&formula) {
                Ok(l) => l.size(TextSize::Lg).into_any_element(),
                Err(_) => Code::new(formula).into_any_element(),
            };
            Card::new()
                .header(CardHeader::new(title))
                .child(div().p_3().child(rendered))
                .into_any_element()
        }

        "chat/ModelSelector" => {
            let mut choices = extract_choices(node);
            if choices.is_empty() {
                choices.push(Choice::new(
                    "default",
                    non_empty_or(&prop_str(node, "currentLabel").unwrap_or_default(), "Model"),
                ));
            }
            let current = view_state
                .value(&sk)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_else(|| choices[0].value.to_string());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let sel = Select::new((id.clone(), "model"), choices)
                .selected(current)
                .disabled(disabled)
                .on_change(move |val, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(val.to_string()), cx);
                });
            let modes: Vec<Choice> = arr_objs(node, "modes")
                .into_iter()
                .enumerate()
                .map(|(ix, m)| {
                    let lbl = obj_str(&m, &["label"]).unwrap_or_else(|| format!("Mode {}", ix + 1));
                    let val = obj_str(&m, &["value"]).unwrap_or_else(|| lbl.clone());
                    Choice::new(val, lbl)
                })
                .collect();
            let mut out = v_stack().gap_2().child(sel);
            if !modes.is_empty() {
                let m_val = modes[0].value.clone();
                let v2 = view.clone();
                let sk2 = sk.clone();
                let nt2 = ntype.clone();
                let mut seg = SegmentedControl::new((id, "modes"), m_val);
                for ch in modes {
                    seg = seg.segment(ch.value, ch.label, None);
                }
                out = out.child(seg.on_change(move |val, _, cx| {
                    emit_event(&v2, &sk2, &nt2, "change", json!(val.to_string()), cx);
                }));
            }
            if let Some(note) = prop_str(node, "modelNote").filter(|s| !s.is_empty()) {
                out = out.child(Caption::new(note));
            }
            out.into_any_element()
        }

        "chat/PromptLibrary" => {
            let templates = arr_objs(node, "templates");
            let prompts: Vec<(String, IconName)> = if templates.is_empty() {
                vec![(
                    best_body(node).unwrap_or_else(|| "Summarize this workspace".into()),
                    IconName::Sparkles,
                )]
            } else {
                templates
                    .iter()
                    .enumerate()
                    .map(|(ix, t)| {
                        let lbl = obj_str(t, &["title", "label", "category"])
                            .unwrap_or_else(|| format!("Prompt {}", ix + 1));
                        (lbl, IconName::Sparkles)
                    })
                    .collect()
            };
            let contents: Vec<String> = templates
                .iter()
                .map(|t| obj_str(t, &["content", "value", "title"]).unwrap_or_default())
                .collect();
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let chips = SuggestionChips::new((id, "chips"), prompts, move |ix, _, cx| {
                let chosen = contents
                    .get(ix)
                    .cloned()
                    .unwrap_or_else(|| format!("prompt-{ix}"));
                emit_event(&v1, &sk1, &nt1, "change", json!(chosen), cx);
            });
            let ti = held_input(
                SharedString::from(format!("{eid}-prompt-in")),
                &best_body(node).unwrap_or_default(),
                &prop_str(node, "placeholder").unwrap_or_else(|| "Prompt".into()),
                Some((2, 4)),
                disabled,
                view_state,
                &sk,
                &ntype,
                window,
                cx,
                view,
            );
            v_stack()
                .gap_2()
                .child(chips)
                .child(Input::new(&ti))
                .into_any_element()
        }

        "chat/TemperatureSlider" => {
            let mut params: Vec<Parameter> = arr_objs(node, "parameters")
                .into_iter()
                .enumerate()
                .map(|(ix, p)| {
                    let key =
                        obj_str(&p, &["key", "name"]).unwrap_or_else(|| format!("param-{ix}"));
                    let label = obj_str(&p, &["label"]).unwrap_or_else(|| key.clone());
                    let min = finite_or(obj_f64(&p, "min").unwrap_or(0.0), 0.0);
                    let raw_max = finite_or(obj_f64(&p, "max").unwrap_or(2.0), 2.0);
                    let max = if raw_max > min { raw_max } else { min + 1.0 };
                    let step = obj_f64(&p, "step")
                        .filter(|s| s.is_finite() && *s > 0.0)
                        .unwrap_or(0.1);
                    let value = finite_or(obj_f64(&p, "value").unwrap_or((min + max) / 2.0), min)
                        .clamp(min, max);
                    Parameter {
                        key: key.into(),
                        label: label.into(),
                        value,
                        min,
                        max,
                        step,
                        hint: obj_str(&p, &["hint"]).map(Into::into),
                    }
                })
                .collect();
            if params.is_empty() {
                let min = finite_or(prop_f64(node, "min").unwrap_or(0.0), 0.0);
                let raw_max = finite_or(prop_f64(node, "max").unwrap_or(2.0), 2.0);
                let max = if raw_max > min { raw_max } else { min + 1.0 };
                let value = finite_or(prop_f64(node, "value").unwrap_or(0.7), 0.7).clamp(min, max);
                params.push(Parameter {
                    key: "temperature".into(),
                    label: non_empty_or(&best_label(node), "Temperature").into(),
                    value,
                    min,
                    max,
                    step: 0.1,
                    hint: None,
                });
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let panel =
                ParameterPanel::new((id.clone(), "params"), params, move |k, val, _, cx| {
                    emit_event(
                        &v1,
                        &sk1,
                        &nt1,
                        "change",
                        json!({ "key": k.to_string(), "value": val }),
                        cx,
                    );
                });
            if let Some(sys) = prop_str(node, "systemPrompt") {
                let ti = held_input(
                    SharedString::from(format!("{eid}-sys")),
                    &sys,
                    "System instructions",
                    Some((2, 4)),
                    disabled,
                    view_state,
                    &sk,
                    &ntype,
                    window,
                    cx,
                    view,
                );
                let tok = prop_f64(node, "systemTokens").unwrap_or(32.0).max(0.0) as usize;
                let lim = prop_f64(node, "systemLimit").unwrap_or(2000.0).max(1.0) as usize;
                v_stack()
                    .gap_2()
                    .child(panel)
                    .child(SystemPromptEditor::new((id, "sys"), &ti, tok, lim))
                    .into_any_element()
            } else {
                panel.into_any_element()
            }
        }

        // ---------------- collab ----------------
        "collab/ActivityLog" => {
            let mut feed = ActivityFeed::new(id);
            let entries = arr_objs(node, "activities");
            for (ix, it) in entries.iter().enumerate() {
                let actor = obj_str(it, &["author", "actor"]).unwrap_or_else(|| "User".into());
                let verb = obj_str(it, &["action", "verb"]).unwrap_or_else(|| "updated".into());
                let at = parse_ts(obj_str(it, &["dateTime"]).as_deref());
                let mut act = Activity::new(format!("act-{ix}"), actor.clone(), verb, at).avatar(
                    Avatar::new(SharedString::from(format!("{eid}-av-{ix}")), actor)
                        .size(AvatarSize::Xs),
                );
                if let Some(obj) = obj_str(it, &["target", "object"]).filter(|s| !s.is_empty()) {
                    act = act.object(obj);
                }
                feed = feed.entry(act);
            }
            feed.into_any_element()
        }

        "collab/CommentBubble" => {
            let raw_threads = arr_objs(node, "threads");
            let first = raw_threads.first();
            let t_key = first
                .and_then(|t| obj_str(t, &["id", "key"]))
                .unwrap_or_else(|| "thread-0".into());
            let quote = first
                .and_then(|t| obj_str(t, &["quote"]))
                .or_else(|| prop_str(node, "passage"));
            let mut comments: Vec<Comment> = first
                .and_then(|t| t.get("comments"))
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_object)
                        .enumerate()
                        .map(|(cix, c)| {
                            let author_name =
                                obj_str(c, &["author"]).unwrap_or_else(|| "User".into());
                            let hue = c.get("hue").and_then(Value::as_u64).unwrap_or(0) as usize;
                            Comment {
                                author: Peer::new(
                                    obj_str(c, &["id"]).unwrap_or_else(|| format!("p-{cix}")),
                                    author_name,
                                    hue,
                                ),
                                at: parse_ts(obj_str(c, &["dateTime"]).as_deref()),
                                body: obj_str(c, &["text", "body"]).unwrap_or_default().into(),
                                reactions: Vec::<Reaction>::new(),
                            }
                        })
                        .collect()
                })
                .unwrap_or_default();
            if comments.is_empty() {
                comments.push(Comment {
                    author: Peer::new("user", "User", 0),
                    at: Timestamp::UNIX_EPOCH,
                    body: best_body(node).unwrap_or_else(|| "Comment".into()).into(),
                    reactions: Vec::new(),
                });
            }
            let thread = Thread {
                key: t_key.into(),
                quote: quote.map(Into::into),
                comments,
                resolved: view_state.current_bool(&sk, node),
            };
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            CommentThread::new(id, thread)
                .active(true)
                .on_resolve(move |res, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(res), cx);
                })
                .into_any_element()
        }

        // ---------------- debug ----------------
        "debug/MemoryViewer" => {
            let mut bytes: Vec<u8> = Vec::new();
            for row in arr_objs(node, "hexRows") {
                if let Some(cells) = row.get("cells").and_then(Value::as_array) {
                    for cell in cells.iter().filter_map(Value::as_object) {
                        if let Some(hx) = obj_str(cell, &["hex"])
                            && let Ok(b) = u8::from_str_radix(hx.trim(), 16)
                        {
                            bytes.push(b);
                        }
                    }
                }
            }
            if bytes.is_empty()
                && let Some(arr) = node.props.get("bytes").and_then(Value::as_array)
            {
                for v in arr {
                    if let Some(u) = v.as_u64() {
                        bytes.push((u & 0xff) as u8);
                    }
                }
            }
            if bytes.is_empty() {
                bytes = vec![0x45, 0x6c, 0x79, 0x20, 0x4d, 0x65, 0x6d, 0x00];
            }
            let max_base = u64::MAX.saturating_sub(bytes.len() as u64);
            let base = node
                .props
                .get("offset")
                .and_then(Value::as_u64)
                .unwrap_or(0x1000)
                .min(max_base);
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            HexViewer::new(id, bytes)
                .base(base)
                .on_select(move |ix, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(ix), cx);
                })
                .into_any_element()
        }

        "debug/PerformanceProfiler" => {
            let frames = arr_objs(node, "profileFrames");
            let mut root = ProfileFrame {
                name: "root".into(),
                own: 1,
                calls: Vec::new(),
            };
            if let Some(first) = frames.first() {
                root.name = obj_str(first, &["name"])
                    .unwrap_or_else(|| "main".into())
                    .into();
                root.own = first
                    .get("samples")
                    .and_then(Value::as_u64)
                    .unwrap_or(100)
                    .max(1);
                for child in frames.iter().skip(1) {
                    let cname = obj_str(child, &["name"]).unwrap_or_else(|| "frame".into());
                    let csamples = child
                        .get("samples")
                        .and_then(Value::as_u64)
                        .unwrap_or(10)
                        .max(1);
                    root.calls.push(ProfileFrame {
                        name: cname.into(),
                        own: csamples,
                        calls: Vec::new(),
                    });
                }
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            Flamegraph::new(id, root)
                .on_focus(move |path, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(path), cx);
                })
                .into_any_element()
        }

        // ---------------- devtools ----------------
        "devtools/QueryEditor" => {
            let dt = node.props.get("devtools").and_then(Value::as_object);
            let sql_init = prop_str(node, "value").unwrap_or_else(|| "SELECT * FROM users;".into());
            let sql_in = held_input(
                SharedString::from(format!("{eid}-sql")),
                &sql_init,
                "SQL query",
                Some((2, 5)),
                disabled || readonly,
                view_state,
                &sk,
                &ntype,
                window,
                cx,
                view,
            );
            let search_in = held_input(
                SharedString::from(format!("{eid}-qsearch")),
                "",
                "Filter history",
                None,
                disabled,
                view_state,
                &format!("{sk}:search"),
                &ntype,
                window,
                cx,
                view,
            );
            let runs: Vec<QueryRun> = dt
                .and_then(|d| d.get("history"))
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .enumerate()
                        .filter_map(|(ix, v)| {
                            let obj = v.as_object()?;
                            let key = obj_str(obj, &["key"]).unwrap_or_else(|| format!("r-{ix}"));
                            let sql = obj_str(obj, &["sql"]).unwrap_or_default();
                            let at = parse_ts(obj_str(obj, &["at"]).as_deref());
                            let took_ms = obj.get("ms").and_then(Value::as_u64).unwrap_or(1) as u32;
                            let outcome = if let Some(err) = obj_str(obj, &["error"]) {
                                Outcome::Failed(err.into())
                            } else {
                                Outcome::Rows(obj.get("rows").and_then(Value::as_u64).unwrap_or(0))
                            };
                            Some(QueryRun {
                                key: key.into(),
                                sql: sql.into(),
                                at,
                                took_ms,
                                outcome,
                            })
                        })
                        .collect()
                })
                .unwrap_or_default();
            let now = parse_ts(dt.and_then(|d| obj_str(d, &["now"])).as_deref());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let hist = QueryHistory::new((id.clone(), "hist"), runs, &search_in, now).on_run(
                move |k, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "ely:action", json!(k.to_string()), cx);
                },
            );
            let mut out = v_stack().gap_2().child(Input::new(&sql_in)).child(hist);
            if let Some(plan_val) = dt.and_then(|d| d.get("plan")) {
                let step = parse_plan_step(plan_val, 0, 0);
                out = out.child(QueryPlanViewer::new((id, "plan"), step));
            }
            out.into_any_element()
        }

        // ---------------- documents ----------------
        "documents/Block types" => {
            let blocks: Vec<BlockData> = arr_objs(node, "blocks")
                .into_iter()
                .map(|b| {
                    let text = obj_str(&b, &["text", "label"]).unwrap_or_default();
                    let btype = obj_str(&b, &["type"])
                        .unwrap_or_default()
                        .to_ascii_lowercase();
                    let kind = match btype.as_str() {
                        "h1" | "heading" => BlockKind::Heading(1),
                        "h2" => BlockKind::Heading(2),
                        "h3" => BlockKind::Heading(3),
                        "bullet" => BlockKind::Bullet,
                        "numbered" => BlockKind::Numbered,
                        "todo" => BlockKind::Todo(obj_bool(&b, "checked")),
                        "quote" => BlockKind::Quote,
                        "callout" => BlockKind::Callout,
                        "code" => BlockKind::Code,
                        "math" => BlockKind::Math,
                        "diagram" => BlockKind::Diagram,
                        "divider" => {
                            return BlockData::new(BlockKind::Divider, Vec::<String>::new());
                        }
                        _ => BlockKind::Paragraph,
                    };
                    BlockData::new(kind, [text])
                })
                .collect();
            let blocks = if blocks.is_empty() {
                vec![BlockData::new(
                    BlockKind::Paragraph,
                    [best_body(node).unwrap_or_default()],
                )]
            } else {
                blocks
            };
            let editor = window.use_keyed_state(
                SharedString::from(format!("{eid}-block-editor")),
                cx,
                |window, cx| BlockEditor::new(blocks, window, cx),
            );
            div()
                .w_full()
                .min_h(px(140.))
                .child(editor)
                .into_any_element()
        }

        "documents/FocusMode" => {
            let title = non_empty_or(&best_title(node), "Focus mode");
            let body = best_body(node).unwrap_or_else(|| "Distraction-free prose.".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            ZenMode::new(id, true)
                .on_exit(move |_, cx| {
                    emit_event(&v1, &sk1, &nt1, "ely:action", json!("exit"), cx);
                })
                .child(
                    Card::new()
                        .header(CardHeader::new(title))
                        .child(div().p_3().child(Paragraph::new(body))),
                )
                .into_any_element()
        }

        "documents/OfficePreview" => {
            let title = non_empty_or(
                &prop_str(node, "filename").unwrap_or_else(|| best_title(node)),
                "Document",
            );
            let mut chapters: Vec<Chapter> = arr_objs(node, "chapters")
                .into_iter()
                .chain(arr_objs(node, "pages"))
                .enumerate()
                .map(|(ix, c)| Chapter {
                    title: obj_str(&c, &["title", "label"])
                        .unwrap_or_else(|| format!("Page {}", ix + 1))
                        .into(),
                    markdown: obj_str(&c, &["content", "markdown"])
                        .unwrap_or_default()
                        .into(),
                })
                .collect();
            if chapters.is_empty() {
                chapters.push(Chapter {
                    title: title.clone().into(),
                    markdown: best_body(node).unwrap_or_default().into(),
                });
            }
            div()
                .w_full()
                .h(px(260.))
                .child(EpubReader::new(id, title, chapters))
                .into_any_element()
        }

        "documents/PageTree" => {
            let favs: Vec<Favorite> = arr_objs(node, "favorites")
                .into_iter()
                .enumerate()
                .map(|(ix, f)| Favorite {
                    key: obj_str(&f, &["value", "id"])
                        .unwrap_or_else(|| format!("fav-{ix}"))
                        .into(),
                    icon: "file-text".into(),
                    title: obj_str(&f, &["label", "title"])
                        .unwrap_or_else(|| "Page".into())
                        .into(),
                })
                .collect();
            let mut tree_nodes = parse_tree_nodes(
                node.props
                    .get("items")
                    .and_then(Value::as_array)
                    .map(Vec::as_slice)
                    .unwrap_or(&[]),
            );
            if tree_nodes.is_empty() {
                tree_nodes.push(TreeNode::new("page-0", "Home"));
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let tree = Tree::new((id.clone(), "tree"), tree_nodes).on_select(move |keys, _, cx| {
                let vals: Vec<Value> = keys.iter().map(|k| json!(k.to_string())).collect();
                emit_event(&v1, &sk1, &nt1, "change", Value::Array(vals), cx);
            });
            if favs.is_empty() {
                tree.into_any_element()
            } else {
                let v2 = view.clone();
                let sk2 = sk.clone();
                let nt2 = ntype.clone();
                let fav_el = Favorites::new((id, "favs"), favs).on_open(move |k, _, cx| {
                    emit_event(&v2, &sk2, &nt2, "change", json!(k.to_string()), cx);
                });
                v_stack()
                    .gap_2()
                    .child(fav_el)
                    .child(tree)
                    .into_any_element()
            }
        }

        // ---------------- editor ----------------
        "editor/InlineDiff" => {
            let path = prop_str(node, "path").unwrap_or_else(|| "src/lib.rs".into());
            let mut old_lines = Vec::new();
            let mut new_lines = Vec::new();
            for h in arr_objs(node, "hunks") {
                if let Some(lines) = h.get("lines").and_then(Value::as_array) {
                    for l in lines.iter().filter_map(Value::as_object) {
                        let txt = obj_str(l, &["text"]).unwrap_or_default();
                        match obj_str(l, &["type"])
                            .unwrap_or_default()
                            .to_ascii_lowercase()
                            .as_str()
                        {
                            "remove" | "deleted" => old_lines.push(txt),
                            "add" | "added" => new_lines.push(txt),
                            _ => {
                                old_lines.push(txt.clone());
                                new_lines.push(txt);
                            }
                        }
                    }
                }
            }
            let old = if old_lines.is_empty() {
                prop_str(node, "readonlyCode").unwrap_or_else(|| "let before = 1;".into())
            } else {
                old_lines.join("\n")
            };
            let new_txt = if new_lines.is_empty() {
                prop_str(node, "value").unwrap_or_else(|| "let after = 2;".into())
            } else {
                new_lines.join("\n")
            };
            let layout =
                match view_state
                    .value(&sk)
                    .and_then(Value::as_str)
                    .or(prop_str(node, "diffLayout").as_deref())
                {
                    Some("split") => DiffLayout::Split,
                    _ => DiffLayout::Unified,
                };
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            div()
                .w_full()
                .h(px(220.))
                .child(
                    DiffViewer::new(id, path, &old, &new_txt)
                        .layout(layout)
                        .on_layout(move |next, _, cx| {
                            let tag = match next {
                                DiffLayout::Split => "split",
                                DiffLayout::Unified => "unified",
                            };
                            emit_event(&v1, &sk1, &nt1, "change", json!(tag), cx);
                        }),
                )
                .into_any_element()
        }

        "editor/WhitespaceRenderer" => {
            let text = prop_str(node, "value").unwrap_or_else(|| "a b\tc\n".into());
            let editor = window.use_keyed_state(
                SharedString::from(format!("{eid}-ws-editor")),
                cx,
                |window, cx| {
                    CodeEditor::new(text, window, cx)
                        .show_whitespace()
                        .read_only()
                },
            );
            div().w_full().h(px(160.)).child(editor).into_any_element()
        }

        // ---------------- feedback ----------------
        "feedback/Result" => {
            let title = non_empty_or(&best_title(node), "Result");
            let sev = prop_str(node, "severity")
                .unwrap_or_default()
                .to_ascii_lowercase();
            let mut rv = if sev == "danger" || sev == "error" {
                ResultView::failure(id.clone(), title)
            } else {
                ResultView::success(id.clone(), title)
            };
            if let Some(body) = best_body(node).filter(|s| !s.is_empty()) {
                rv = rv.body(body);
            }
            let actions = arr_objs(node, "actions");
            if actions.is_empty() {
                if let Some(lbl) = prop_str(node, "actionLabel").filter(|s| !s.is_empty()) {
                    let val = prop_str(node, "action").unwrap_or_else(|| lbl.clone());
                    let v1 = view.clone();
                    let sk1 = sk.clone();
                    let nt1 = ntype.clone();
                    rv = rv.action(
                        Button::new((id, "act-0"), lbl)
                            .variant(button_variant(prop_str(node, "buttonVariant").as_deref()))
                            .disabled(disabled)
                            .on_click(move |_, _, cx| {
                                emit_event(&v1, &sk1, &nt1, "ely:action", json!(val), cx);
                            }),
                    );
                }
            } else {
                for (ix, act) in actions.iter().take(2).enumerate() {
                    let lbl = obj_str(act, &["label"]).unwrap_or_else(|| "Done".into());
                    let val = obj_str(act, &["action", "value"]).unwrap_or_else(|| lbl.clone());
                    let v1 = view.clone();
                    let sk1 = sk.clone();
                    let nt1 = ntype.clone();
                    rv = rv.action(
                        Button::new(SharedString::from(format!("{eid}-act-{ix}")), lbl)
                            .variant(button_variant(obj_str(act, &["buttonVariant"]).as_deref()))
                            .disabled(disabled)
                            .on_click(move |_, _, cx| {
                                emit_event(&v1, &sk1, &nt1, "ely:action", json!(val), cx);
                            }),
                    );
                }
            }
            rv.into_any_element()
        }

        // ---------------- files ----------------
        "files/DragDropFiles" => {
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut dz = DropZone::new(id)
                .kinds(&["*/*"])
                .on_drop(move |paths, _, cx| {
                    let vals: Vec<Value> = paths
                        .into_iter()
                        .map(|p| json!(p.to_string_lossy().to_string()))
                        .collect();
                    emit_event(&v1, &sk1, &nt1, "change", Value::Array(vals), cx);
                });
            if let Some(hint) = prop_str(node, "hint").filter(|s| !s.is_empty()) {
                dz = dz.hint(hint);
            }
            dz.into_any_element()
        }

        "files/FileContextMenu" => {
            let raw_actions = node
                .props
                .get("actions")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or(&[]);
            let menu = parse_menu_items(raw_actions, view, &sk, &ntype);
            let files = arr_objs(node, "files");
            let mut list = v_stack().gap_1();
            if files.is_empty() {
                list = list.child(FileItem::new(
                    (id.clone(), "f0"),
                    DirEntry::file("document.md", 1024, Timestamp::UNIX_EPOCH),
                ));
            } else {
                for (ix, f) in files.iter().enumerate() {
                    let name = obj_str(f, &["name"]).unwrap_or_else(|| format!("file-{ix}"));
                    let entry = if obj_bool(f, "folder") {
                        DirEntry::folder(name, Timestamp::UNIX_EPOCH)
                    } else {
                        let sz = f.get("bytes").and_then(Value::as_u64).unwrap_or(1024);
                        DirEntry::file(name, sz, Timestamp::UNIX_EPOCH)
                    };
                    list = list.child(FileItem::new(
                        SharedString::from(format!("{eid}-fcm-{ix}")),
                        entry,
                    ));
                }
            }
            ContextMenu::new(id, menu).child(list).into_any_element()
        }

        "files/FileList" => {
            let mut path: Vec<String> = arr_objs(node, "breadcrumbs")
                .into_iter()
                .filter_map(|b| obj_str(&b, &["label", "value"]))
                .filter(|s| !s.is_empty())
                .collect();
            if path.is_empty() {
                path.push("Home".into());
            }
            let entries: Vec<DirEntry> = arr_objs(node, "directoryEntries")
                .into_iter()
                .chain(extract_item_objects(node))
                .enumerate()
                .map(|(ix, f)| {
                    let name =
                        obj_str(&f, &["name", "label"]).unwrap_or_else(|| format!("item-{ix}"));
                    if obj_bool(&f, "folder") {
                        DirEntry::folder(name, Timestamp::UNIX_EPOCH)
                    } else {
                        let sz = f.get("bytes").and_then(Value::as_u64).unwrap_or(1024);
                        DirEntry::file(name, sz, Timestamp::UNIX_EPOCH)
                    }
                })
                .collect();
            let mut levels: Vec<Vec<DirEntry>> = Vec::with_capacity(path.len());
            for depth in 0..path.len() {
                if depth + 1 == path.len() {
                    levels.push(entries.clone());
                } else {
                    let child_folder = path[depth + 1].clone();
                    levels.push(vec![DirEntry::folder(child_folder, Timestamp::UNIX_EPOCH)]);
                }
            }
            let fview = match prop_str(node, "fileView").unwrap_or_default().as_str() {
                "icons" => FileView::Icons,
                "columns" => FileView::Columns,
                _ => FileView::List,
            };
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut fe = FileExplorer::new(id, path, levels, fview).on_select(move |val, _, cx| {
                emit_event(&v1, &sk1, &nt1, "change", json!(val.to_string()), cx);
            });
            if let Some(sel) = prop_str(node, "selected").filter(|s| !s.is_empty()) {
                fe = fe.selected(sel);
            }
            fe.into_any_element()
        }

        "files/RenameInline" => {
            let current = view_state
                .value(&sk)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_else(|| "untitled.txt".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            InlineEdit::new(id, current)
                .on_commit(move |next, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(next.to_string()), cx);
                })
                .into_any_element()
        }

        "files/StorageUsage" => {
            let total = prop_f64(node, "capacity")
                .filter(|c| c.is_finite() && *c > 0.0)
                .unwrap_or(512_000_000_000.0);
            let mut bar = UsageBar::new(total);
            let parts = arr_objs(node, "parts");
            for (ix, p) in parts.iter().enumerate() {
                let name =
                    obj_str(p, &["name", "label"]).unwrap_or_else(|| format!("Part {}", ix + 1));
                let bytes = obj_f64(p, "bytes")
                    .or_else(|| obj_f64(p, "value"))
                    .filter(|b| b.is_finite() && *b >= 0.0)
                    .unwrap_or(0.0);
                bar = bar.part(name, bytes);
            }
            bar.into_any_element()
        }

        // ---------------- finance ----------------
        "finance/DrawingTools" => {
            let current = match view_state.value(&sk).and_then(Value::as_str) {
                Some("trend") | Some("line") => Some(FinanceTool::Trend),
                Some("level") => Some(FinanceTool::Level),
                Some("box") => Some(FinanceTool::Box),
                Some("fib") => Some(FinanceTool::Fib),
                _ => None,
            };
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let tb = DrawingToolbar::new((id.clone(), "dt"), current).on_change(move |t, _, cx| {
                let tag = match t {
                    None => "pointer",
                    Some(FinanceTool::Trend) => "trend",
                    Some(FinanceTool::Level) => "level",
                    Some(FinanceTool::Box) => "box",
                    Some(FinanceTool::Fib) => "fib",
                };
                emit_event(&v1, &sk1, &nt1, "change", json!(tag), cx);
            });
            let chart = LineChart::new((id, "lc"), ["1", "2", "3", "4"])
                .series(ChartSeries::new("Price", vec![90.0, 60.0, 70.0, 40.0]));
            v_stack().gap_2().child(tb).child(chart).into_any_element()
        }

        "finance/IndicatorOverlay" => {
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let sel = IndicatorSelector::new(
                (id.clone(), "ind"),
                vec![Overlay::Sma(20)],
                vec![Study::Rsi],
            )
            .on_change(move |overlays, studies, _, cx| {
                emit_event(
                    &v1,
                    &sk1,
                    &nt1,
                    "change",
                    json!({ "overlays": overlays.len(), "studies": studies.len() }),
                    cx,
                );
            });
            let sym = prop_str(node, "symbol").unwrap_or_else(|| "ACME".into());
            let chart = LineChart::new((id, "lc"), ["1", "2", "3", "4"])
                .series(ChartSeries::new(sym, vec![90.0, 60.0, 70.0, 40.0]));
            v_stack().gap_2().child(sel).child(chart).into_any_element()
        }

        "finance/MarketProfile" => {
            let items = extract_item_objects(node);
            let mut list = v_stack().gap_1p5();
            if items.is_empty() {
                list = list.child(Meter::new((id, "mp-0"), "100.0", 0.5));
            } else {
                for (ix, it) in items.iter().enumerate() {
                    let lbl = obj_str(it, &["label"]).unwrap_or_else(|| format!("{ix}"));
                    let w = obj_f64(it, "width").map(clamp_share).unwrap_or(0.5);
                    list = list.child(Meter::new(
                        SharedString::from(format!("{eid}-mp-{ix}")),
                        lbl,
                        w,
                    ));
                }
            }
            list.into_any_element()
        }

        "finance/Ticker" => {
            let mut tape = TickerTape::new(id);
            let items = extract_item_objects(node);
            if items.is_empty() {
                tape = tape.quote("ELY", 182.79, 0.0184);
            } else {
                for (ix, it) in items.iter().enumerate() {
                    let sym =
                        obj_str(it, &["label", "symbol"]).unwrap_or_else(|| format!("SYM{ix}"));
                    let price = obj_f64(it, "value")
                        .filter(|p| p.is_finite())
                        .unwrap_or(100.0);
                    let share = obj_f64(it, "change")
                        .map(|c| finite_or(c / 100.0, 0.0))
                        .unwrap_or(0.0);
                    tape = tape.quote(sym, price, share);
                }
            }
            tape.into_any_element()
        }

        // ---------------- forms ----------------
        "forms/CascadeSelect" => {
            let mut roots = node
                .props
                .get("options")
                .and_then(Value::as_array)
                .map(|arr| parse_cascade_nodes(arr))
                .unwrap_or_default();
            if roots.is_empty() {
                roots.push(Cascade::new("default", "Default"));
            }
            let target = view_state
                .value(&sk)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_default();
            let selected = find_cascade_path(&roots, &target).unwrap_or_default();
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut casc =
                Cascader::new((id.clone(), "casc"), roots).on_change(move |path, _, cx| {
                    let vals: Vec<Value> = path.iter().map(|s| json!(s.to_string())).collect();
                    emit_event(&v1, &sk1, &nt1, "change", Value::Array(vals), cx);
                });
            if !selected.is_empty() {
                casc = casc.selected(selected);
            }
            FormField::new(id, non_empty_or(&best_label(node), "Select"))
                .child(casc)
                .into_any_element()
        }

        "forms/CurrencyInput" => {
            let mut units = extract_string_list(node, "units");
            if units.is_empty() {
                let pfx = prop_str(node, "prefix")
                    .filter(|s| !s.trim().is_empty())
                    .unwrap_or_else(|| "USD".into());
                units.push(pfx);
                units.push("EUR".into());
            }
            let current_unit = units[0].clone();
            let min = finite_or(prop_f64(node, "min").unwrap_or(0.0), 0.0);
            let raw_max = finite_or(prop_f64(node, "max").unwrap_or(1_000_000.0), 1_000_000.0);
            let max = if raw_max > min { raw_max } else { min + 100.0 };
            let val = view_state
                .value(&sk)
                .and_then(value_to_f64)
                .or_else(|| prop_f64(node, "value"))
                .map(|v| finite_or(v, min))
                .unwrap_or(min)
                .clamp(min, max);
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let v2 = view.clone();
            let sk2 = sk.clone();
            let nt2 = ntype.clone();
            let ui = UnitInput::new((id.clone(), "unit"), val, units, current_unit)
                .range(min, max)
                .precision(2)
                .on_change(move |n, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(n), cx);
                })
                .on_unit(move |u, _, cx| {
                    emit_event(&v2, &sk2, &nt2, "ely:action", json!(u.to_string()), cx);
                });
            FormField::new(id, non_empty_or(&best_label(node), "Amount"))
                .child(ui)
                .into_any_element()
        }

        "forms/FileInput" => {
            let multiple = prop_bool(node, "multiple");
            let mut paths: Vec<PathBuf> = match view_state.value(&sk) {
                Some(Value::Array(arr)) => arr
                    .iter()
                    .filter_map(Value::as_str)
                    .map(PathBuf::from)
                    .collect(),
                Some(Value::String(s)) if !s.is_empty() => vec![PathBuf::from(s)],
                _ => Vec::new(),
            };
            if !multiple {
                paths.truncate(1);
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut fi = FileInput::new((id.clone(), "fi"), paths).on_change(move |next, _, cx| {
                let vals: Vec<Value> = next
                    .into_iter()
                    .map(|p| json!(p.to_string_lossy().to_string()))
                    .collect();
                emit_event(&v1, &sk1, &nt1, "change", Value::Array(vals), cx);
            });
            if multiple {
                fi = fi.multiple();
            }
            FormField::new(id, non_empty_or(&best_label(node), "File"))
                .child(fi)
                .into_any_element()
        }

        "forms/Form" => {
            let nid = node.id.clone();
            let v_sub = view.clone();
            let mut form = Form::new(id.clone()).on_submit(move |_, cx| {
                let _ = v_sub.update(cx, |this, cx| {
                    this.submit(&nid, cx);
                });
            });
            let fields = arr_objs(node, "fields");
            for (ix, f) in fields.iter().enumerate() {
                let fname = obj_str(f, &["name"]).unwrap_or_else(|| format!("field-{ix}"));
                let fkey = format!("{}:{fname}", node.id);
                let flabel = obj_str(f, &["label"]).unwrap_or_else(|| fname.clone());
                let fph = obj_str(f, &["placeholder"]).unwrap_or_default();
                let finit = obj_str(f, &["value"]).unwrap_or_default();
                let fdis = disabled || obj_bool(f, "disabled");
                let rows = f
                    .get("rows")
                    .and_then(Value::as_u64)
                    .map(|r| (r.clamp(2, 6) as usize, r.clamp(4, 10) as usize));
                let ti = held_input(
                    SharedString::from(format!("{eid}-ff-{ix}")),
                    &finit,
                    &fph,
                    rows,
                    fdis,
                    view_state,
                    &fkey,
                    &ntype,
                    window,
                    cx,
                    view,
                );
                let mut ff = FormField::new(SharedString::from(format!("{eid}-ffd-{ix}")), flabel);
                if obj_bool(f, "required") {
                    ff = ff.required();
                }
                if let Some(desc) = obj_str(f, &["description"]) {
                    ff = ff.description(desc);
                }
                form = form.child(ff.child(Input::new(&ti)));
            }
            if let Some(arr_lbl) = prop_str(node, "arrayLabel").filter(|s| !s.is_empty()) {
                let values: Vec<String> = node
                    .props
                    .get("values")
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter_map(Value::as_str)
                            .map(ToOwned::to_owned)
                            .collect()
                    })
                    .unwrap_or_default();
                let v_arr = view.clone();
                let sk_arr = format!("{sk}:list");
                let nt_arr = ntype.clone();
                form = form.child(FormField::new((id.clone(), "arr"), arr_lbl).child(
                    ListInput::new((id.clone(), "list"), values).on_change(move |vals, _, cx| {
                        let arr: Vec<Value> = vals.into_iter().map(|s| json!(s)).collect();
                        emit_event(&v_arr, &sk_arr, &nt_arr, "change", Value::Array(arr), cx);
                    }),
                ));
            }
            let submit_lbl = prop_str(node, "actionLabel")
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Submit".into());
            let nid2 = node.id.clone();
            let v2 = view.clone();
            form = form.child(
                Button::new((id, "submit"), submit_lbl)
                    .primary()
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        let _ = v2.update(cx, |this, cx| {
                            this.submit(&nid2, cx);
                        });
                    }),
            );
            form.into_any_element()
        }

        "forms/Knob" => {
            let min = finite_or(prop_f64(node, "min").unwrap_or(0.0), 0.0);
            let raw_max = finite_or(prop_f64(node, "max").unwrap_or(100.0), 100.0);
            let max = if raw_max > min { raw_max } else { min + 1.0 };
            let step = prop_f64(node, "step")
                .filter(|s| s.is_finite() && *s > 0.0)
                .unwrap_or(1.0);
            let val = view_state
                .value(&sk)
                .and_then(value_to_f64)
                .or_else(|| prop_f64(node, "value"))
                .map(|v| finite_or(v, min))
                .unwrap_or(min)
                .clamp(min, max);
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let knob = Knob::new((id.clone(), "knob"), val)
                .range(min, max)
                .step(step)
                .disabled(disabled)
                .on_change(move |next, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(next), cx);
                });
            FormField::new(id, non_empty_or(&best_label(node), "Knob"))
                .child(knob)
                .into_any_element()
        }

        "forms/LanguageSelect" => {
            let mut choices = extract_choices(node);
            if choices.is_empty() {
                choices = vec![
                    Choice::new("en", "English"),
                    Choice::new("ko", "Korean"),
                    Choice::new("ja", "Japanese"),
                ];
            }
            let ph = prop_str(node, "placeholder").unwrap_or_else(|| "Choose language".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut sel = Select::new((id.clone(), "lang"), choices)
                .placeholder(ph)
                .disabled(disabled)
                .on_change(move |val, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(val.to_string()), cx);
                });
            if let Some(cur) = view_state
                .value(&sk)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
                .filter(|s| !s.is_empty())
            {
                sel = sel.selected(cur);
            }
            FormField::new(id, non_empty_or(&best_label(node), "Language"))
                .child(sel)
                .into_any_element()
        }

        "forms/RelativeDatePicker" => {
            let raw = view_state
                .value(&sk)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"));
            let current = raw.as_deref().and_then(|s| {
                RelativeRange::ALL
                    .into_iter()
                    .find(|r| r.label().eq_ignore_ascii_case(s.trim()))
            });
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let picker = RelativeDatePicker::new((id.clone(), "rdp"), current).on_change(
                move |range, _, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(range.label()), cx);
                },
            );
            FormField::new(id, non_empty_or(&best_label(node), "Date range"))
                .child(picker)
                .into_any_element()
        }

        "forms/TextArea" => {
            let rows = prop_f64(node, "rows").unwrap_or(3.0).clamp(2.0, 12.0) as usize;
            let ti = held_input(
                SharedString::from(format!("{eid}-ta")),
                &prop_str(node, "value").unwrap_or_default(),
                &prop_str(node, "placeholder").unwrap_or_default(),
                Some((rows, rows.max(6))),
                disabled || readonly,
                view_state,
                &sk,
                &ntype,
                window,
                cx,
                view,
            );
            FormField::new(id, non_empty_or(&best_label(node), "Notes"))
                .child(Input::new(&ti))
                .into_any_element()
        }

        // ---------------- generative ----------------
        "generative/DatasetViewer" => {
            let items = extract_item_objects(node);
            let cols = vec![
                Column::new("prompt", "Prompt"),
                Column::new("completion", "Completion"),
                Column::new("split", "Split"),
                Column::new("tokens", "Tokens"),
            ];
            let rows: Vec<Row> = items
                .iter()
                .enumerate()
                .map(|(ix, it)| {
                    Row::new(
                        obj_str(it, &["value"]).unwrap_or_else(|| format!("ex-{ix}")),
                        vec![
                            Cell::Text(obj_str(it, &["label"]).unwrap_or_default().into()),
                            Cell::Text(obj_str(it, &["content"]).unwrap_or_default().into()),
                            Cell::Tag(
                                obj_str(it, &["status"])
                                    .unwrap_or_else(|| "Train".into())
                                    .into(),
                                Tone::Neutral,
                            ),
                            Cell::Number(
                                obj_f64(it, "tokens")
                                    .filter(|t| t.is_finite())
                                    .unwrap_or(0.0),
                            ),
                        ],
                    )
                })
                .collect();
            DataTable::new(id, cols).rows(rows).into_any_element()
        }

        "generative/ImageGenerationPanel" => {
            let prompt_in = held_input(
                SharedString::from(format!("{eid}-gen-prompt")),
                &prop_str(node, "value").unwrap_or_else(|| "A calm architectural courtyard".into()),
                "Describe an image",
                Some((2, 4)),
                disabled,
                view_state,
                &sk,
                &ntype,
                window,
                cx,
                view,
            );
            let seed_in = held_input(
                SharedString::from(format!("{eid}-gen-seed")),
                &prop_str(node, "seed").unwrap_or_else(|| "42".into()),
                "Seed",
                None,
                disabled,
                view_state,
                &format!("{sk}:seed"),
                &ntype,
                window,
                cx,
                view,
            );
            let mut presets: Vec<StylePreset> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, o)| StylePreset {
                    key: obj_str(&o, &["value"])
                        .unwrap_or_else(|| format!("st-{ix}"))
                        .into(),
                    name: obj_str(&o, &["label"])
                        .unwrap_or_else(|| "Style".into())
                        .into(),
                    picture: obj_str(&o, &["url"]).map(Into::into),
                })
                .collect();
            if presets.is_empty() {
                presets.push(StylePreset {
                    key: "photo".into(),
                    name: "Photographic".into(),
                    picture: None,
                });
            }
            let sel_preset = presets[0].key.clone();
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let v2 = view.clone();
            let sk2 = sk.clone();
            let nt2 = ntype.clone();
            let v3 = view.clone();
            let sk3 = sk.clone();
            let nt3 = ntype.clone();
            let v4 = view.clone();
            let sk4 = sk.clone();
            let nt4 = ntype.clone();
            v_stack()
                .gap_3()
                .child(
                    PromptEnhancer::new((id.clone(), "enh"), &prompt_in).on_enhance(
                        move |p, _, cx| {
                            emit_event(&v1, &sk1, &nt1, "ely:action", json!(p), cx);
                        },
                    ),
                )
                .child(
                    AspectRatioPicker::new(
                        (id.clone(), "ratio"),
                        [(1, 1), (3, 2), (16, 9)],
                        (3, 2),
                    )
                    .on_select(move |(w, h), _, cx| {
                        emit_event(&v2, &sk2, &nt2, "change", json!(format!("{w}:{h}")), cx);
                    }),
                )
                .child(
                    StylePresetPicker::new((id.clone(), "style"), presets, sel_preset).on_select(
                        move |k, _, cx| {
                            emit_event(&v3, &sk3, &nt3, "change", json!(k.to_string()), cx);
                        },
                    ),
                )
                .child(
                    h_stack()
                        .gap_2()
                        .items_center()
                        .child(SeedInput::new((id.clone(), "seed"), &seed_in))
                        .child(
                            Button::new(
                                (id, "go"),
                                prop_str(node, "actionLabel").unwrap_or_else(|| "Generate".into()),
                            )
                            .primary()
                            .disabled(disabled)
                            .on_click(move |_, _, cx| {
                                emit_event(&v4, &sk4, &nt4, "ely:action", json!("generate"), cx);
                            }),
                        ),
                )
                .into_any_element()
        }

        // ---------------- git ----------------
        "git/CommitGraph" => {
            let raw_commits = arr_objs(node, "commits");
            let mut commits: Vec<Commit> = if !raw_commits.is_empty() {
                raw_commits
                    .iter()
                    .enumerate()
                    .map(|(ix, c)| {
                        let cid = obj_str(c, &["id"]).unwrap_or_else(|| format!("c{ix}"));
                        let refs: Vec<SharedString> = c
                            .get("refs")
                            .and_then(Value::as_array)
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(Value::as_str)
                                    .map(|s| s.to_owned().into())
                                    .collect()
                            })
                            .unwrap_or_default();
                        Commit {
                            id: cid.into(),
                            parents: Vec::new(),
                            subject: obj_str(c, &["label", "subject"])
                                .unwrap_or_else(|| "Commit".into())
                                .into(),
                            author: obj_str(c, &["author"])
                                .unwrap_or_else(|| "Author".into())
                                .into(),
                            when: obj_str(c, &["time", "when"])
                                .unwrap_or_else(|| "now".into())
                                .into(),
                            refs,
                        }
                    })
                    .collect()
            } else {
                arr_objs(node, "nodes")
                    .iter()
                    .enumerate()
                    .map(|(ix, c)| {
                        let cid = obj_str(c, &["id"]).unwrap_or_else(|| format!("c{ix}"));
                        let parents = c
                            .get("parents")
                            .and_then(Value::as_array)
                            .map(|arr| {
                                arr.iter()
                                    .filter_map(Value::as_str)
                                    .map(|s| s.to_owned().into())
                                    .collect()
                            })
                            .unwrap_or_default();
                        Commit {
                            id: cid.into(),
                            parents,
                            subject: obj_str(c, &["label"])
                                .unwrap_or_else(|| "Commit".into())
                                .into(),
                            author: "Author".into(),
                            when: "now".into(),
                            refs: Vec::new(),
                        }
                    })
                    .collect()
            };
            if commits.is_empty() {
                commits.push(Commit {
                    id: "head".into(),
                    parents: Vec::new(),
                    subject: non_empty_or(&best_title(node), "Initial commit").into(),
                    author: "Author".into(),
                    when: "now".into(),
                    refs: vec!["main".into()],
                });
            }
            for ix in 0..commits.len().saturating_sub(1) {
                if commits[ix].parents.is_empty() {
                    let next_id = commits[ix + 1].id.clone();
                    commits[ix].parents.push(next_id);
                }
            }
            let lane_inputs: Vec<(&str, Vec<&str>)> = commits
                .iter()
                .map(|c| {
                    (
                        c.id.as_ref(),
                        c.parents.iter().map(|p| p.as_ref()).collect::<Vec<_>>(),
                    )
                })
                .collect();
            let rows = lanes(lane_inputs.iter().map(|(id, ps)| (*id, ps.as_slice())));
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            CommitList::new(id, Rc::new(commits))
                .graph(Rc::new(rows))
                .on_pick(move |cid, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(cid.to_string()), cx);
                })
                .into_any_element()
        }

        // ---------------- i18n ----------------
        "i18n/ColorBlindSafe Palette" => {
            let items = extract_item_objects(node);
            let mut grid = SimpleGrid::new(id, px(160.), px(8.));
            if items.is_empty() {
                grid = grid.child(Badge::new("Safe palette").tone(Tone::Accent));
            } else {
                let theme = cx.theme();
                for it in items {
                    let lbl = obj_str(&it, &["label"]).unwrap_or_else(|| "Swatch".into());
                    let hex_normal = obj_str(&it, &["color"]).unwrap_or_else(|| "#3772BB".into());
                    let hex_safe =
                        obj_str(&it, &["safeColor"]).unwrap_or_else(|| hex_normal.clone());
                    let c1 = parse_hsla(&hex_normal, theme.colors.accent);
                    let c2 = parse_hsla(&hex_safe, theme.colors.accent);
                    grid = grid.child(
                        Card::new().header(CardHeader::new(lbl)).child(
                            h_stack()
                                .gap_2()
                                .p_2()
                                .child(div().size(px(24.)).rounded(px(4.)).bg(c1))
                                .child(div().size(px(24.)).rounded(px(4.)).bg(c2))
                                .child(Caption::new(hex_safe)),
                        ),
                    );
                }
            }
            grid.into_any_element()
        }

        "i18n/I18nProvider" => {
            let tag = view_state
                .value(&sk)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "locale"))
                .unwrap_or_else(|| "en-US".into());
            let loc = Locale::of(&tag);
            let choices: Vec<Choice> = {
                let extracted = extract_choices(node);
                if extracted.is_empty() {
                    LOCALES.iter().map(|l| Choice::new(l.tag, l.name)).collect()
                } else {
                    extracted
                }
            };
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let sel =
                Select::new((id, "loc"), choices)
                    .selected(tag)
                    .on_change(move |next, _, cx| {
                        emit_event(&v1, &sk1, &nt1, "change", json!(next.to_string()), cx);
                    });
            let val = finite_or(prop_f64(node, "value").unwrap_or(12345.67), 12345.67);
            let dl = DescriptionList::new()
                .text("Locale", loc.tag)
                .text("Number", loc.number(val, 2))
                .text("Date", loc.date(Timestamp::UNIX_EPOCH, &TimeZone::UTC));
            v_stack().gap_2().child(sel).child(dl).into_any_element()
        }

        "i18n/LocaleNumber" => {
            let tag = view_state
                .value(&sk)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "locale"))
                .unwrap_or_else(|| "en-US".into());
            let decimals = prop_f64(node, "decimals").unwrap_or(2.0).clamp(0.0, 6.0) as usize;
            let val = finite_or(prop_f64(node, "value").unwrap_or(1234.56), 1234.56);
            let loc = Locale::of(&tag);
            let mut choices = extract_choices(node);
            if choices.is_empty() {
                choices = LOCALES.iter().map(|l| Choice::new(l.tag, l.name)).collect();
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            v_stack()
                .gap_2()
                .child(
                    Select::new((id, "ln-sel"), choices)
                        .selected(tag)
                        .on_change(move |next, _, cx| {
                            emit_event(&v1, &sk1, &nt1, "change", json!(next.to_string()), cx);
                        }),
                )
                .child(Label::new(loc.number(val, decimals)))
                .into_any_element()
        }

        "i18n/RTL layout" => {
            let rtl = view_state
                .value(&sk)
                .and_then(Value::as_bool)
                .unwrap_or_else(|| prop_bool(node, "rtl"));
            let dir = if rtl { Direction::Rtl } else { Direction::Ltr };
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let sw = Switch::new((id, "rtl-sw"), rtl)
                .label("Right-to-left")
                .on_change(move |next, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(next), cx);
                });
            let mut rows = v_stack().gap_1();
            for (ix, it) in extract_item_objects(node).iter().enumerate() {
                let lbl = obj_str(it, &["label"]).unwrap_or_else(|| format!("Item {}", ix + 1));
                let note = obj_str(it, &["content"]).unwrap_or_default();
                rows = rows.child(
                    dir.align(
                        dir.row(div().flex().items_center().justify_between().gap_2().p_2())
                            .child(Label::new(lbl))
                            .child(Caption::new(note)),
                    ),
                );
            }
            v_stack().gap_2().child(sw).child(rows).into_any_element()
        }

        // ---------------- interaction ----------------
        "interaction/Autofocus" => {
            let ti = held_input(
                SharedString::from(format!("{eid}-af")),
                &prop_str(node, "value").unwrap_or_default(),
                &prop_str(node, "placeholder").unwrap_or_else(|| "Autofocused field".into()),
                None,
                disabled,
                view_state,
                &sk,
                &ntype,
                window,
                cx,
                view,
            );
            let items = extract_item_objects(node);
            let mut tg = ToggleGroup::new((id, "tg"));
            if items.is_empty() {
                tg = tg.item(ToggleItem::new("bold").label("Bold"));
            } else {
                for (ix, it) in items.iter().enumerate() {
                    let lbl = obj_str(it, &["label"]).unwrap_or_else(|| format!("Opt {ix}"));
                    let val = obj_str(it, &["value"]).unwrap_or_else(|| lbl.clone());
                    tg = tg.item(ToggleItem::new(val).label(lbl));
                }
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            v_stack()
                .gap_2()
                .child(Input::new(&ti))
                .child(tg.on_change(move |picked, _, cx| {
                    let vals: Vec<Value> = picked.iter().map(|s| json!(s.to_string())).collect();
                    emit_event(&v1, &sk1, &nt1, "change", Value::Array(vals), cx);
                }))
                .into_any_element()
        }

        "interaction/Draggable" => {
            let mut sl = SortableList::new(id);
            let items = extract_item_objects(node);
            if items.is_empty() {
                sl = sl
                    .row("item-0", ListItem::new("dr-0", "First item"))
                    .row("item-1", ListItem::new("dr-1", "Second item"));
            } else {
                for (ix, it) in items.iter().enumerate() {
                    let lbl = obj_str(it, &["label"]).unwrap_or_else(|| format!("Item {}", ix + 1));
                    let val = obj_str(it, &["value"]).unwrap_or_else(|| format!("dr-{ix}"));
                    sl = sl.row(
                        val,
                        ListItem::new(SharedString::from(format!("{eid}-dr-{ix}")), lbl),
                    );
                }
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            sl.on_reorder(move |from, to, _, cx| {
                emit_event(
                    &v1,
                    &sk1,
                    &nt1,
                    "change",
                    json!({ "from": from, "to": to }),
                    cx,
                );
            })
            .into_any_element()
        }

        "interaction/Hotkeys" => {
            let bindings = arr_objs(node, "bindings");
            let mut shortcuts: Vec<Shortcut> = Vec::new();
            let mut row = h_stack().flex_wrap().gap_2();
            for (ix, b) in bindings.iter().enumerate() {
                let lbl = obj_str(b, &["label"]).unwrap_or_else(|| format!("Action {}", ix + 1));
                let keys = obj_str(b, &["keys"]).unwrap_or_else(|| "Meta+K".into());
                let act = obj_str(b, &["action"]).unwrap_or_else(|| lbl.clone());
                shortcuts.push(Shortcut {
                    group: "Hotkeys".into(),
                    name: lbl.clone().into(),
                    keys: keys.into(),
                });
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                row = row.child(
                    Button::new(SharedString::from(format!("{eid}-hk-{ix}")), lbl)
                        .variant(button_variant(prop_str(node, "buttonVariant").as_deref()))
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            emit_event(&v1, &sk1, &nt1, "ely:action", json!(act), cx);
                        }),
                );
            }
            if shortcuts.is_empty() {
                shortcuts.push(Shortcut {
                    group: "Hotkeys".into(),
                    name: non_empty_or(&best_label(node), "Trigger").into(),
                    keys: "Meta+S".into(),
                });
            }
            let search_in = held_input(
                SharedString::from(format!("{eid}-hk-search")),
                "",
                "Filter shortcuts",
                None,
                disabled,
                view_state,
                &format!("{sk}:search"),
                &ntype,
                window,
                cx,
                view,
            );
            v_stack()
                .gap_2()
                .child(row)
                .child(KeyboardShortcutsList::new(shortcuts, &search_in))
                .into_any_element()
        }

        "interaction/LongPress" => {
            let lbl = non_empty_or(&best_label(node), "Hold to trigger");
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let v2 = view.clone();
            let sk2 = sk.clone();
            let nt2 = ntype.clone();
            Pressable::new(id, move |_, _, cx| {
                let theme = cx.theme();
                div()
                    .px_3()
                    .py_2()
                    .rounded(theme.radius(Radius::Md))
                    .border_1()
                    .border_color(theme.colors.border)
                    .bg(theme.colors.surface)
                    .child(Label::new(lbl.clone()))
                    .into_any_element()
            })
            .on_press(move |_, cx| {
                emit_event(&v1, &sk1, &nt1, "click", json!("press"), cx);
            })
            .on_long_press(move |_, cx| {
                emit_event(&v2, &sk2, &nt2, "ely:action", json!("long-press"), cx);
            })
            .into_any_element()
        }

        "interaction/Undo" => {
            let count_state =
                window.use_keyed_state(SharedString::from(format!("{eid}-undo-n")), cx, |_, _| {
                    prop_f64(node, "value").unwrap_or(0.0) as i64
                });
            let cur = *count_state.read(cx);
            let st1 = count_state.clone();
            let st2 = count_state;
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let v2 = view.clone();
            let sk2 = sk.clone();
            let nt2 = ntype.clone();
            let undo_lbl = prop_str(node, "undoLabel").unwrap_or_else(|| "Undo".into());
            let redo_lbl = prop_str(node, "redoLabel").unwrap_or_else(|| "Redo".into());
            h_stack()
                .gap_2()
                .items_center()
                .child(
                    ButtonGroup::new()
                        .button(
                            Button::new((id.clone(), "undo"), undo_lbl)
                                .disabled(disabled)
                                .on_click(move |_, _, cx| {
                                    st1.update(cx, |n, cx| {
                                        *n -= 1;
                                        cx.notify();
                                    });
                                    emit_event(&v1, &sk1, &nt1, "change", json!(cur - 1), cx);
                                }),
                        )
                        .button(
                            Button::new((id, "redo"), redo_lbl)
                                .disabled(disabled)
                                .on_click(move |_, _, cx| {
                                    st2.update(cx, |n, cx| {
                                        *n += 1;
                                        cx.notify();
                                    });
                                    emit_event(&v2, &sk2, &nt2, "change", json!(cur + 1), cx);
                                }),
                        ),
                )
                .child(Badge::new(format!("State {cur}")))
                .into_any_element()
        }

        "interaction/VirtualScroller" => {
            let count = prop_f64(node, "count")
                .filter(|c| c.is_finite() && *c >= 1.0)
                .unwrap_or(100.0)
                .min(50_000.0) as usize;
            let prefix = prop_str(node, "rowPrefix").unwrap_or_else(|| "Row".into());
            let eid_row = eid.clone();
            let vl = VirtualList::new((id.clone(), "vl"), count, move |ix, _, _| {
                ListItem::new(
                    SharedString::from(format!("{eid_row}-vs-{ix}")),
                    format!("{prefix} {}", ix + 1),
                )
                .into_any_element()
            })
            .w_full()
            .h(px(180.));
            let panes = arr_objs(node, "panes");
            if panes.len() >= 2 {
                let mut ss = ScrollSync::new((id, "sync"), Axis::Vertical);
                for (pix, pane) in panes.iter().take(2).enumerate() {
                    let mut col = v_stack().gap_1().p_2();
                    if let Some(items) = pane.get("items").and_then(Value::as_array) {
                        for (ix, it) in items.iter().enumerate() {
                            let lbl = it
                                .as_object()
                                .and_then(|m| obj_str(m, &["label"]))
                                .unwrap_or_else(|| format!("Line {}", ix + 1));
                            col = col.child(ListItem::new(
                                SharedString::from(format!("{eid}-ss-{pix}-{ix}")),
                                lbl,
                            ));
                        }
                    }
                    ss = ss.pane(col);
                }
                v_stack()
                    .gap_2()
                    .child(vl)
                    .child(div().h(px(120.)).child(ss))
                    .into_any_element()
            } else {
                vl.into_any_element()
            }
        }

        // ---------------- layout ----------------
        "layout/Absolute" => {
            let before = prop_str(node, "before").unwrap_or_else(|| "Top left".into());
            let val = prop_str(node, "value").unwrap_or_else(|| "Bottom right".into());
            let theme = cx.theme();
            div()
                .relative()
                .w_full()
                .h(px(96.))
                .rounded(theme.radius(Radius::Md))
                .border_1()
                .border_color(theme.colors.border)
                .bg(theme.colors.surface)
                .child(div().absolute().top_2().left_2().child(Badge::new(before)))
                .child(
                    div()
                        .absolute()
                        .bottom_2()
                        .right_2()
                        .child(Badge::new(val).tone(Tone::Accent)),
                )
                .into_any_element()
        }

        "layout/Center" => {
            let val = prop_str(node, "value").unwrap_or_else(|| "Centered".into());
            div()
                .w_full()
                .min_h(px(80.))
                .flex()
                .items_center()
                .justify_center()
                .p_4()
                .child(Card::new().child(div().p_2().child(Label::new(val))))
                .into_any_element()
        }

        "layout/DockZone" => {
            let note = best_body(node)
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_else(|| "Dock zone".into());
            let dock =
                window.use_keyed_state(SharedString::from(format!("{eid}-dock")), cx, |_, cx| {
                    let mut d = Dock::new(
                        move |_, _| {
                            div()
                                .p_3()
                                .child(Caption::new(note.clone()))
                                .into_any_element()
                        },
                        |panel_id, _, _| {
                            div()
                                .p_2()
                                .child(Label::new(format!("Panel: {panel_id}")))
                                .into_any_element()
                        },
                        cx,
                    );
                    d.add(
                        DockPanel {
                            id: "left-panel".into(),
                            title: "Explorer".into(),
                            icon: IconName::Folder,
                        },
                        DockSide::Left,
                    );
                    d.add(
                        DockPanel {
                            id: "bottom-panel".into(),
                            title: "Output".into(),
                            icon: IconName::Terminal,
                        },
                        DockSide::Bottom,
                    );
                    d
                });
            div().w_full().h(px(180.)).child(dock).into_any_element()
        }

        "layout/Flex" => {
            let items = extract_string_list(node, "items");
            let items = if items.is_empty() {
                vec!["fixed".into(), "flex_1".into(), "fixed".into()]
            } else {
                items
            };
            let mut row = h_stack().w_full().gap_2();
            for item in items {
                let pill = Well::new().child(div().p_2().child(Label::new(item.clone())));
                row = if item.contains("flex_1") {
                    row.child(div().flex_1().child(pill))
                } else {
                    row.child(pill)
                };
            }
            row.into_any_element()
        }

        "layout/Grid" => {
            let g_items = arr_objs(node, "gridItems");
            let mut grid = SimpleGrid::new(id, px(140.), px(8.));
            if g_items.is_empty() {
                let items = extract_string_list(node, "items");
                if items.is_empty() {
                    grid = grid.child(Well::new().child(div().p_2().child(Label::new("Cell"))));
                } else {
                    for it in items {
                        grid = grid.child(Well::new().child(div().p_2().child(Label::new(it))));
                    }
                }
            } else {
                for it in g_items {
                    let lbl = obj_str(&it, &["label"]).unwrap_or_else(|| "Cell".into());
                    grid = grid.child(Well::new().child(div().p_2().child(Label::new(lbl))));
                }
            }
            grid.into_any_element()
        }

        "layout/Group" => {
            let lbl = non_empty_or(&best_label(node), "Group");
            let mut fs = Fieldset::new(lbl);
            let items = extract_string_list(node, "items");
            if items.is_empty() {
                fs = fs.child(Label::new(prop_str(node, "value").unwrap_or_default()));
            } else {
                for it in items {
                    fs = fs.child(Label::new(it));
                }
            }
            fs.into_any_element()
        }

        "layout/Inset" => {
            let samples = arr_objs(node, "insetSamples");
            let mut out = h_stack().flex_wrap().gap_3();
            if samples.is_empty() {
                out = out.child(Container::new(ContainerSize::Sm).child(Well::new().child(
                    div().p_4().child(Label::new(
                        prop_str(node, "value").unwrap_or_else(|| "Inset".into()),
                    )),
                )));
            } else {
                for s in samples {
                    let lbl = obj_str(&s, &["label"]).unwrap_or_else(|| "p_2".into());
                    let val = obj_str(&s, &["value"]).unwrap_or_else(|| "content".into());
                    let pad = obj_f64(&s, "padding").unwrap_or(2.0).clamp(1.0, 8.0) as f32 * 4.0;
                    out = out.child(
                        Well::new()
                            .child(div().p(px(pad)).child(Label::new(format!("{lbl}: {val}")))),
                    );
                }
            }
            out.into_any_element()
        }

        "layout/Layer" => {
            let items = extract_string_list(node, "items");
            let mut z = ZStack::new().w_full().min_h(px(100.));
            if items.is_empty() {
                z = z.child(Well::new().child(div().p_3().child(Label::new(
                    prop_str(node, "value").unwrap_or_else(|| "Layer".into()),
                ))));
            } else {
                for (ix, it) in items.into_iter().enumerate() {
                    let off = (ix as f32) * 8.0;
                    z = z.child(
                        div()
                            .pt(px(off))
                            .pl(px(off))
                            .child(Card::new().child(div().p_2().child(Label::new(it)))),
                    );
                }
            }
            z.into_any_element()
        }

        "layout/Pane" => {
            let mut items = extract_string_list(node, "items");
            while items.len() < 2 {
                items.push(format!("Pane {}", items.len() + 1));
            }
            let mut split = SplitPane::new(id, Axis::Horizontal, px(60.));
            for item in items.into_iter().take(4) {
                split = split.pane(Well::new().child(div().p_3().child(Label::new(item))));
            }
            div().w_full().h(px(120.)).child(split).into_any_element()
        }

        "layout/ResizeHandle" => {
            let lbl = non_empty_or(&best_label(node), "Resize panes");
            h_stack()
                .w_full()
                .h(px(72.))
                .items_center()
                .child(
                    div()
                        .flex_1()
                        .child(Well::new().child(div().p_2().child(Label::new(lbl)))),
                )
                .child(resize_handle(id, Axis::Horizontal, cx))
                .child(
                    div()
                        .flex_1()
                        .child(Well::new().child(div().p_2().child(Caption::new("Pane 2")))),
                )
                .into_any_element()
        }

        "layout/Wrap" => {
            let items = extract_string_list(node, "items");
            let mut row = h_stack().flex_wrap().gap_2();
            for (ix, it) in items.into_iter().enumerate() {
                row = row.child(Tag::new(SharedString::from(format!("{eid}-tag-{ix}")), it));
            }
            row.into_any_element()
        }

        // ---------------- mail ----------------
        "mail/InboxZeroState" => {
            let title = non_empty_or(&best_title(node), "All caught up");
            let body = best_body(node).unwrap_or_else(|| "Nothing waits in your inbox.".into());
            let action_lbl = prop_str(node, "actionLabel").unwrap_or_else(|| "Open archive".into());
            let action_val = prop_str(node, "action").unwrap_or_else(|| "open-mailbox".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            EmptyState::new((id.clone(), "empty"), IconName::Inbox, title)
                .body(body)
                .action(
                    Button::new((id, "act"), action_lbl)
                        .variant(ButtonVariant::Secondary)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            emit_event(&v1, &sk1, &nt1, "ely:action", json!(action_val), cx);
                        }),
                )
                .into_any_element()
        }

        // ---------------- maps ----------------
        "maps/MapCluster" => {
            let center_obj = node.props.get("center").and_then(Value::as_object);
            let c_lat = center_obj
                .and_then(|c| obj_f64(c, "latitude"))
                .unwrap_or(42.0)
                .clamp(-85.0, 85.0);
            let c_lon = center_obj
                .and_then(|c| obj_f64(c, "longitude"))
                .unwrap_or(5.0)
                .clamp(-180.0, 180.0);
            let zoom = prop_f64(node, "zoom").unwrap_or(4.0).clamp(0.0, 19.0);
            let mut seen_keys = BTreeSet::new();
            let markers: Vec<MapMarker> = arr_objs(node, "points")
                .into_iter()
                .enumerate()
                .filter_map(|(ix, p)| {
                    let lat = obj_f64(&p, "latitude")?.clamp(-85.0, 85.0);
                    let lon = obj_f64(&p, "longitude")?.clamp(-180.0, 180.0);
                    let raw_key =
                        obj_str(&p, &["key", "id"]).unwrap_or_else(|| format!("pin-{ix}"));
                    let key = if seen_keys.insert(raw_key.clone()) {
                        raw_key
                    } else {
                        let dedup = format!("{raw_key}-{ix}");
                        seen_keys.insert(dedup.clone());
                        dedup
                    };
                    let mut m = MapMarker::new(key, LatLon::new(lat, lon));
                    if let Some(lbl) = obj_str(&p, &["label"]) {
                        m = m.label(lbl);
                    }
                    if let Some(hue) = p.get("hue").and_then(Value::as_u64) {
                        m = m.hue(hue as usize);
                    }
                    Some(m)
                })
                .collect();
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut mv = MapView::new(id, MapViewport::new(LatLon::new(c_lat, c_lon), zoom))
                .cluster_markers()
                .markers(markers)
                .on_marker(move |k, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(k.to_string()), cx);
                });
            if let Some(attr) = prop_str(node, "attribution").filter(|s| !s.is_empty()) {
                mv = mv.attribution(attr);
            }
            let h = prop_f64(node, "height")
                .unwrap_or(240.0)
                .clamp(120.0, 420.0) as f32;
            div().w_full().h(px(h)).child(mv).into_any_element()
        }

        // ---------------- media ----------------
        "media/3DModelViewer" => {
            let ratio = prop_f64(node, "aspectRatio")
                .filter(|r| r.is_finite() && *r > 0.0)
                .unwrap_or(1.5)
                .clamp(0.25, 4.0) as f32;
            let dist = prop_f64(node, "distance")
                .filter(|d| d.is_finite())
                .unwrap_or(1.0)
                .clamp(0.4, 4.0) as f32;
            let orbit = Orbit {
                yaw: prop_f64(node, "yaw")
                    .filter(|v| v.is_finite())
                    .unwrap_or(0.5) as f32,
                pitch: prop_f64(node, "pitch")
                    .filter(|v| v.is_finite())
                    .unwrap_or(0.3) as f32,
                distance: dist,
            };
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut mv = ModelViewer::new(id, ratio, orbit).on_orbit(move |next, _, cx| {
                emit_event(
                    &v1,
                    &sk1,
                    &nt1,
                    "change",
                    json!({ "yaw": next.yaw, "pitch": next.pitch, "distance": next.distance }),
                    cx,
                );
            });
            if let Some(url) = prop_str(node, "url").filter(|s| !s.trim().is_empty()) {
                mv = mv.frame(img_source(&url));
            }
            div().w_full().max_w(px(360.)).child(mv).into_any_element()
        }

        "media/VideoTimeline" => {
            let dur_secs = prop_f64(node, "duration")
                .filter(|d| d.is_finite() && *d >= 1.0)
                .unwrap_or(90.0);
            let length = Duration::from_secs_f64(dur_secs);
            let pos_secs = prop_f64(node, "position")
                .filter(|p| p.is_finite() && *p >= 0.0)
                .unwrap_or(0.0)
                .min(dur_secs);
            let loaded_secs = prop_f64(node, "loaded")
                .filter(|p| p.is_finite() && *p >= 0.0)
                .unwrap_or(pos_secs)
                .min(dur_secs);
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut scrubber = Scrubber::new(id, length, Duration::from_secs_f64(pos_secs))
                .loaded(Duration::from_secs_f64(loaded_secs))
                .on_seek(move |t, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(t.as_secs_f64()), cx);
                });
            let mut chapters: Vec<(u64, String)> = extract_item_objects(node)
                .into_iter()
                .filter_map(|it| {
                    let t = obj_f64(&it, "time")?.max(0.0);
                    if t >= dur_secs {
                        return None;
                    }
                    let lbl = obj_str(&it, &["label"]).unwrap_or_else(|| "Chapter".into());
                    Some((t as u64, lbl))
                })
                .collect();
            chapters.sort_by_key(|(t, _)| *t);
            let mut last_ms: Option<u64> = None;
            for (t_sec, lbl) in chapters {
                let ms = t_sec.saturating_mul(1000);
                if last_ms.is_none_or(|prev| ms > prev) && Duration::from_millis(ms) < length {
                    scrubber = scrubber.chapter(Duration::from_millis(ms), lbl);
                    last_ms = Some(ms);
                }
            }
            scrubber.into_any_element()
        }

        // ---------------- menus ----------------
        "menus/CheckboxMenuItem" => {
            let raw_items = node
                .props
                .get("items")
                .and_then(Value::as_array)
                .map(Vec::as_slice)
                .unwrap_or(&[]);
            let menu = parse_menu_items(raw_items, view, &sk, &ntype);
            DropdownMenu::new(id, non_empty_or(&best_label(node), "View options"), menu)
                .variant(button_variant(prop_str(node, "buttonVariant").as_deref()))
                .into_any_element()
        }

        "menus/MegaMenu" => {
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut nav = NavigationMenu::new(id).on_select(move |val, _, cx| {
                emit_event(&v1, &sk1, &nt1, "change", json!(val.to_string()), cx);
            });
            let entries = extract_item_objects(node);
            if entries.is_empty() {
                nav = nav.entry("Product", [Choice::new("overview", "Overview")]);
            } else {
                for (ix, e) in entries.iter().enumerate() {
                    let title = obj_str(&e, &["label", "title"])
                        .unwrap_or_else(|| format!("Section {}", ix + 1));
                    let mut links: Vec<Choice> = e
                        .get("items")
                        .and_then(Value::as_array)
                        .map(|arr| {
                            arr.iter()
                                .enumerate()
                                .map(|(jx, sub)| {
                                    let sub_obj = sub.as_object();
                                    let lbl = sub_obj
                                        .and_then(|m| obj_str(m, &["label", "title"]))
                                        .filter(|s| !s.is_empty())
                                        .unwrap_or_else(|| format!("{title} {}", jx + 1));
                                    let val = sub_obj
                                        .and_then(|m| obj_str(m, &["value", "href"]))
                                        .filter(|s| !s.is_empty())
                                        .unwrap_or_else(|| format!("item-{ix}-{jx}"));
                                    Choice::new(val, lbl)
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    if links.is_empty() {
                        links.push(Choice::new(format!("item-{ix}-0"), title.clone()));
                    }
                    nav = nav.entry(title, links);
                }
            }
            nav.into_any_element()
        }

        "menus/MenuBar Menu" => {
            let top = extract_item_objects(node);
            let mut bar = h_stack().flex_wrap().gap_1();
            if top.is_empty() {
                let menu = parse_menu_items(&[], view, &sk, &ntype);
                bar = bar.child(
                    DropdownMenu::new((id, "m0"), non_empty_or(&best_label(node), "Menu"), menu)
                        .variant(ButtonVariant::Ghost),
                );
            } else {
                for (ix, m) in top.iter().enumerate() {
                    let lbl = obj_str(&m, &["label"]).unwrap_or_else(|| format!("Menu {}", ix + 1));
                    let sub = m
                        .get("items")
                        .and_then(Value::as_array)
                        .map(Vec::as_slice)
                        .unwrap_or(&[]);
                    let menu = parse_menu_items(sub, view, &sk, &ntype);
                    bar = bar.child(
                        DropdownMenu::new(SharedString::from(format!("{eid}-mb-{ix}")), lbl, menu)
                            .variant(ButtonVariant::Ghost),
                    );
                }
            }
            bar.into_any_element()
        }

        // ---------------- misc ----------------
        "misc/BarcodeDisplay" => {
            let raw = prop_str(node, "value").unwrap_or_default();
            let code: String = raw.chars().filter(|c| (' '..='~').contains(c)).collect();
            let safe = if code.trim().is_empty() {
                "ELY-128".to_owned()
            } else {
                code
            };
            match Barcode::code128(&safe) {
                Ok(b) => b.into_any_element(),
                Err(_) => Code::new(safe).into_any_element(),
            }
        }

        "misc/ChangeLog Viewer" => {
            let mut cl = Changelog::new();
            let items = extract_item_objects(node);
            if items.is_empty() {
                cl = cl.release(
                    Release::new("0.2.0", "2026-10-01")
                        .summary(
                            prop_str(node, "sourceNote").unwrap_or_else(|| "Release notes".into()),
                        )
                        .change(Change::Added, "Catalogue coverage"),
                );
            } else {
                for (ix, it) in items.iter().enumerate() {
                    let ver = obj_str(&it, &["version", "label"])
                        .unwrap_or_else(|| format!("0.{}.0", ix + 1));
                    let date = obj_str(&it, &["date"]).unwrap_or_else(|| "2026-10-01".into());
                    let summary = obj_str(&it, &["content", "description"]).unwrap_or_default();
                    let mut rel = Release::new(ver, date);
                    if !summary.is_empty() {
                        rel = rel.summary(summary);
                    }
                    rel = rel.change(Change::Changed, "Updated");
                    cl = cl.release(rel);
                }
            }
            cl.into_any_element()
        }

        "misc/PrintButton" => {
            let lbl = prop_str(node, "actionLabel")
                .or_else(|| prop_str(node, "label"))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Print".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let btn = Button::new(id, lbl)
                .icon(IconName::Printer)
                .variant(ButtonVariant::Secondary)
                .disabled(disabled || prop_bool(node, "sourceWarning"))
                .on_click(move |_, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "ely:action", json!("print"), cx);
                });
            if let Some(note) = prop_str(node, "sourceNote").filter(|s| !s.is_empty()) {
                v_stack()
                    .gap_1()
                    .child(btn)
                    .child(Caption::new(note))
                    .into_any_element()
            } else {
                btn.into_any_element()
            }
        }

        "misc/Terms" => {
            let msg =
                best_body(node).unwrap_or_else(|| "Review cookie and terms preferences.".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut cb = CookieBanner::new(id, msg, move |picked, _, cx| {
                let vals: Vec<Value> = picked.iter().map(|s| json!(s.to_string())).collect();
                emit_event(&v1, &sk1, &nt1, "change", Value::Array(vals), cx);
            });
            let kinds = arr_objs(node, "cookieKinds");
            if kinds.is_empty() {
                cb = cb.kind("Necessary", "Required for core features.");
            } else {
                for (ix, k) in kinds.iter().enumerate() {
                    let name = obj_str(&k, &["label", "value"])
                        .unwrap_or_else(|| format!("Option {}", ix + 1));
                    let detail = obj_str(&k, &["content", "description"])
                        .unwrap_or_else(|| "Optional preference".into());
                    cb = cb.kind(name, detail);
                }
            }
            cb.into_any_element()
        }

        // ---------------- motion ----------------
        "motion/LoadingButton" => {
            let loading = view_state
                .value(&sk)
                .and_then(Value::as_bool)
                .unwrap_or_else(|| prop_bool(node, "loading"));
            let lbl = prop_str(node, "actionLabel")
                .or_else(|| prop_str(node, "label"))
                .filter(|s| !s.is_empty())
                .unwrap_or_else(|| "Save".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            Button::new(id, lbl)
                .variant(button_variant(prop_str(node, "buttonVariant").as_deref()))
                .loading(loading)
                .disabled(disabled)
                .on_click(move |_, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(!loading), cx);
                })
                .into_any_element()
        }

        // ---------------- navigation ----------------
        "navigation/JumpTo" => {
            let lines = prop_f64(node, "max").unwrap_or(240.0).max(1.0) as usize;
            let ti = held_input(
                SharedString::from(format!("{eid}-goto-in")),
                &prop_str(node, "value").unwrap_or_else(|| "1".into()),
                &prop_str(node, "placeholder").unwrap_or_else(|| "Line or line:column".into()),
                None,
                disabled,
                view_state,
                &sk,
                &ntype,
                window,
                cx,
                view,
            );
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            GoToLine::new(id, &ti, lines)
                .on_jump(move |line, col, _, cx| {
                    emit_event(
                        &v1,
                        &sk1,
                        &nt1,
                        "change",
                        json!({ "line": line, "column": col }),
                        cx,
                    );
                })
                .into_any_element()
        }

        "navigation/Sidebar Navigation" => {
            let folded = prop_bool(node, "folded");
            let active_key = view_state
                .value(&sk)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            let mut sb = Sidebar::new((id, "sb"), folded);
            for (ix, it) in extract_item_objects(node).iter().enumerate() {
                let lbl = obj_str(it, &["label"]).unwrap_or_else(|| format!("Item {}", ix + 1));
                let val = obj_str(it, &["value"]).unwrap_or_else(|| lbl.clone());
                let icon = icon_by_name(obj_str(it, &["icon"]).as_deref(), IconName::Circle);
                let active = active_key.as_deref() == Some(val.as_str())
                    || (active_key.is_none() && obj_bool(it, "selected"));
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                sb = sb.child(
                    NavItem::new(SharedString::from(format!("{eid}-ni-{ix}")), icon, lbl)
                        .active(active)
                        .folded(folded)
                        .on_click(move |_, cx| {
                            emit_event(&v1, &sk1, &nt1, "change", json!(val), cx);
                        }),
                );
            }
            for (gix, grp) in arr_objs(node, "groups").iter().enumerate() {
                let gtitle =
                    obj_str(grp, &["label"]).unwrap_or_else(|| format!("Group {}", gix + 1));
                let mut ng =
                    NavGroup::new(SharedString::from(format!("{eid}-ng-{gix}")), gtitle, true)
                        .folded(folded);
                if let Some(sub) = grp.get("items").and_then(Value::as_array) {
                    for (ix, it) in sub.iter().filter_map(Value::as_object).enumerate() {
                        let lbl =
                            obj_str(it, &["label"]).unwrap_or_else(|| format!("Link {}", ix + 1));
                        let val = obj_str(it, &["value"]).unwrap_or_else(|| lbl.clone());
                        let icon =
                            icon_by_name(obj_str(it, &["icon"]).as_deref(), IconName::Folder);
                        let active = active_key.as_deref() == Some(val.as_str())
                            || (active_key.is_none() && obj_bool(it, "selected"));
                        let v1 = view.clone();
                        let sk1 = sk.clone();
                        let nt1 = ntype.clone();
                        let mut item = NavItem::new(
                            SharedString::from(format!("{eid}-ngi-{gix}-{ix}")),
                            icon,
                            lbl,
                        )
                        .active(active)
                        .folded(folded)
                        .on_click(move |_, cx| {
                            emit_event(&v1, &sk1, &nt1, "change", json!(val), cx);
                        });
                        if let Some(cnt) = obj_str(it, &["count"]).filter(|s| !s.is_empty()) {
                            item = item.count(cnt);
                        }
                        ng = ng.child(item);
                    }
                }
                sb = sb.child(ng);
            }
            div().h(px(240.)).child(sb).into_any_element()
        }

        // ---------------- onboarding ----------------
        "onboarding/Coachmark" => {
            let title = non_empty_or(&best_label(node), "Coachmark");
            let body = best_body(node).unwrap_or_else(|| "Pin views you use often.".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let v2 = view.clone();
            let sk2 = sk.clone();
            let nt2 = ntype.clone();
            let fh = FeatureHighlight::new(
                (id.clone(), "fh"),
                IconName::Sparkles,
                title.clone(),
                body.clone(),
                move |_, cx| {
                    emit_event(&v1, &sk1, &nt1, "ely:action", json!("try"), cx);
                },
                move |_, cx| {
                    emit_event(&v2, &sk2, &nt2, "ely:action", json!("dismiss"), cx);
                },
            );
            let v3 = view.clone();
            let sk3 = sk.clone();
            let nt3 = ntype.clone();
            let hs = Hotspot::new((id, "hs"), title, body, move |_, cx| {
                emit_event(&v3, &sk3, &nt3, "ely:action", json!("got-it"), cx);
            });
            h_stack()
                .items_start()
                .gap_3()
                .child(div().flex_1().child(fh))
                .child(hs)
                .into_any_element()
        }

        // ---------------- overlays ----------------
        "overlays/Tooltip" => {
            let lbl = non_empty_or(&best_label(node), "Hover target");
            let tip = best_body(node).unwrap_or_else(|| "Tooltip details".into());
            let sc = prop_str(node, "shortcut").unwrap_or_default();
            let trigger = Button::new((id.clone(), "tt-btn"), lbl)
                .variant(button_variant(prop_str(node, "buttonVariant").as_deref()))
                .disabled(disabled);
            TooltipTrigger::new(id, trigger, move |_, _| {
                if sc.is_empty() {
                    Label::new(tip.clone()).into_any_element()
                } else {
                    h_stack()
                        .gap_2()
                        .items_center()
                        .child(Label::new(tip.clone()))
                        .child(KbdCombo::new(&sc))
                        .into_any_element()
                }
            })
            .into_any_element()
        }

        // ---------------- primitives ----------------
        "primitives/Box" => {
            let title = prop_str(node, "text")
                .filter(|s| !s.is_empty())
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_else(|| "Box".into());
            let mut row = h_stack().flex_wrap().gap_2();
            for b in arr_objs(node, "boxes") {
                let tone = obj_str(&b, &["tone"]).unwrap_or_else(|| "surface".into());
                let inner = div().p_3().child(Label::new(tone.clone()));
                row = row.child(if tone == "sunken" {
                    Well::new().child(inner).into_any_element()
                } else {
                    Card::new().child(inner).into_any_element()
                });
            }
            v_stack()
                .gap_2()
                .child(row)
                .child(Caption::new(title))
                .into_any_element()
        }

        "primitives/Canvas" => {
            let accent = cx.theme().colors.accent;
            let border = cx.theme().colors.border;
            let label = prop_str(node, "alt")
                .or_else(|| prop_str(node, "text"))
                .unwrap_or_else(|| "Canvas".into());
            v_stack()
                .gap_1()
                .child(
                    div()
                        .w_full()
                        .h(px(72.))
                        .border_1()
                        .border_color(border)
                        .child(
                            canvas(
                                |_, _, _| {},
                                move |bounds, _, window, _| {
                                    let mut inset = bounds;
                                    inset.origin = inset.origin + point(px(8.), px(8.));
                                    inset.size = size(
                                        (inset.size.width - px(16.)).max(px(4.)),
                                        (inset.size.height - px(16.)).max(px(4.)),
                                    );
                                    window.paint_quad(fill(inset, accent.opacity(0.2)));
                                },
                            )
                            .size_full(),
                        ),
                )
                .child(Caption::new(label))
                .into_any_element()
        }

        "primitives/ClickOutside" => {
            let lbl = non_empty_or(&best_label(node), "Open panel");
            let items = extract_string_list(node, "items");
            Popover::new(id, lbl, move |_, _| {
                let mut col = v_stack().gap_1();
                for it in &items {
                    col = col.child(Label::new(it.clone()));
                }
                col
            })
            .into_any_element()
        }

        "primitives/Clipboard" => {
            let val = prop_str(node, "value").unwrap_or_else(|| "Ely".into());
            let lbl = non_empty_or(&best_label(node), "Copy");
            h_stack()
                .items_center()
                .gap_2()
                .child(Label::new(lbl))
                .child(CopyableText::new((id.clone(), "ct"), val.clone()))
                .child(CopyButton::new((id, "cb"), val))
                .into_any_element()
        }

        "primitives/For" => {
            let items = extract_string_list(node, "items");
            let mut col = v_stack().gap_1();
            for (ix, it) in items.into_iter().enumerate() {
                col = col.child(ListItem::new(
                    SharedString::from(format!("{eid}-for-{ix}")),
                    it,
                ));
            }
            col.into_any_element()
        }

        "primitives/Fragment" => {
            let val = prop_str(node, "value").unwrap_or_else(|| "two siblings".into());
            let after = prop_str(node, "after").unwrap_or_default();
            let icon = icon_by_name(prop_str(node, "fragmentIcon").as_deref(), IconName::Layers);
            h_stack()
                .items_center()
                .gap_2()
                .child(Icon::new(icon).size(IconSize::Sm))
                .child(Label::new(val))
                .child(Code::new(after))
                .into_any_element()
        }

        "primitives/HoverArea" => {
            let lbl = non_empty_or(&best_label(node), "Hover target");
            let inside = prop_str(node, "hoverInside").unwrap_or_else(|| "Pointer inside".into());
            HoverCard::new(
                id,
                Well::new().child(div().p_2().child(Label::new(lbl))),
                move |_, _| Label::new(inside.clone()),
            )
            .into_any_element()
        }

        "primitives/IconSet" => {
            let items = extract_string_list(node, "items");
            let mut grid = SimpleGrid::new(id, px(44.), px(6.));
            for name in items.into_iter().take(48) {
                let icon = icon_by_name(Some(&name), IconName::Circle);
                grid = grid.child(div().p_1().child(Icon::new(icon).size(IconSize::Md)));
            }
            grid.into_any_element()
        }

        "primitives/KeyboardHandler" => {
            let val = prop_str(node, "value").unwrap_or_else(|| ".on_key_down(...)".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            div()
                .id(id)
                .p_2()
                .on_key_down(move |ev, _, cx| {
                    emit_event(
                        &v1,
                        &sk1,
                        &nt1,
                        "ely:action",
                        json!(ev.keystroke.key.clone()),
                        cx,
                    );
                })
                .child(
                    h_stack()
                        .gap_2()
                        .items_center()
                        .child(KbdCombo::new("Meta+K"))
                        .child(Code::new(val)),
                )
                .into_any_element()
        }

        "primitives/Portal" => {
            let lbl = non_empty_or(&best_label(node), "Open portal");
            let body = best_body(node)
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_else(|| "Portal content".into());
            Popover::new(id, lbl, move |_, _| {
                div().p_2().child(Label::new(body.clone()))
            })
            .into_any_element()
        }

        "primitives/Show" => {
            let shown = view_state.current_bool(&sk, node);
            let lbl = non_empty_or(&best_label(node), "Show");
            let body = best_body(node).unwrap_or_else(|| "Visible content".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let mut col = v_stack().gap_2().child(
                Switch::new((id, "show-sw"), shown)
                    .label(lbl)
                    .disabled(disabled)
                    .on_change(move |next, _, cx| {
                        emit_event(&v1, &sk1, &nt1, "change", json!(next), cx);
                    }),
            );
            if shown {
                col = col.child(Well::new().child(div().p_2().child(Label::new(body))));
            }
            col.into_any_element()
        }

        "primitives/Slot" => {
            let lbl = non_empty_or(&best_label(node), "Slot");
            let icon = icon_by_name(prop_str(node, "slotIcon").as_deref(), IconName::Sparkles);
            let val = prop_str(node, "value").unwrap_or_else(|| "slot".into());
            Card::new()
                .header(CardHeader::new(lbl))
                .child(
                    h_stack()
                        .gap_2()
                        .p_2()
                        .items_center()
                        .child(Icon::new(icon).size(IconSize::Sm))
                        .child(Code::new(val)),
                )
                .into_any_element()
        }

        "primitives/Spacer" => {
            let before = prop_str(node, "before").unwrap_or_default();
            let after = prop_str(node, "after").unwrap_or_default();
            let leading = icon_by_name(prop_str(node, "leadingIcon").as_deref(), IconName::Menu);
            let trailing = icon_by_name(
                prop_str(node, "trailingIcon").as_deref(),
                IconName::Settings,
            );
            h_stack()
                .w_full()
                .items_center()
                .gap_2()
                .child(Icon::new(leading).size(IconSize::Sm))
                .child(Label::new(before))
                .child(div().flex_1())
                .child(Label::new(after))
                .child(Icon::new(trailing).size(IconSize::Sm))
                .into_any_element()
        }

        "primitives/Svg" => {
            let samples = arr_objs(node, "svgSamples");
            let mut row = h_stack().flex_wrap().items_center().gap_3();
            if samples.is_empty() {
                row = row.child(Icon::new(IconName::Compass).size(IconSize::Lg));
            } else {
                for s in samples {
                    let name = obj_str(&s, &["name", "label"]);
                    let icon = icon_by_name(name.as_deref(), IconName::Compass);
                    row = row.child(Icon::new(icon).size(IconSize::Lg));
                }
            }
            row.into_any_element()
        }

        "primitives/Text" => {
            let runs = arr_objs(node, "runs");
            if runs.is_empty() {
                let body = best_body(node)
                    .or_else(|| prop_str(node, "value"))
                    .unwrap_or_else(|| "Text".into());
                Paragraph::new(body).into_any_element()
            } else {
                let accent = cx.theme().colors.accent;
                let mut row = h_stack().flex_wrap().gap_1();
                for r in runs {
                    let txt = obj_str(&r, &["value", "text"]).unwrap_or_default();
                    if obj_bool(&r, "accent") {
                        row = row.child(div().text_color(accent).child(Label::new(txt)));
                    } else {
                        row = row.child(Label::new(txt));
                    }
                }
                row.into_any_element()
            }
        }

        "primitives/VisuallyHidden" => {
            let lbl = non_empty_or(&best_label(node), "Skip to content");
            let target = window
                .use_keyed_state(
                    SharedString::from(format!("{eid}-skip-target")),
                    cx,
                    |_, cx| cx.focus_handle(),
                )
                .read(cx)
                .clone();
            h_stack()
                .gap_2()
                .items_center()
                .child(SkipLink::new(id, lbl, &target))
                .child(div().track_focus(&target).child(Caption::new("Target")))
                .into_any_element()
        }

        // ---------------- project ----------------
        "project/SubtaskList" => {
            let mut seen = BTreeSet::new();
            let mut tasks: Vec<Task> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, it)| {
                    let raw_key =
                        obj_str(&it, &["value", "id"]).unwrap_or_else(|| format!("task-{ix}"));
                    let key = if seen.insert(raw_key.clone()) {
                        raw_key
                    } else {
                        let d = format!("{raw_key}-{ix}");
                        seen.insert(d.clone());
                        d
                    };
                    let title = obj_str(&it, &["label", "title"])
                        .unwrap_or_else(|| format!("Subtask {}", ix + 1));
                    let done = obj_bool(&it, "done");
                    Task::new(key, title)
                        .status(if done { Status::Done } else { Status::Todo })
                        .priority(Priority::None)
                })
                .collect();
            if tasks.is_empty() {
                tasks.push(Task::new(
                    "subtask-0",
                    non_empty_or(&best_title(node), "Subtask"),
                ));
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let v2 = view.clone();
            let sk2 = sk.clone();
            let nt2 = ntype.clone();
            TaskList::new(id, tasks)
                .on_toggle(move |k, done, _, cx| {
                    emit_event(
                        &v1,
                        &sk1,
                        &nt1,
                        "change",
                        json!({ "key": k.to_string(), "done": done }),
                        cx,
                    );
                })
                .on_open(move |k, _, cx| {
                    emit_event(&v2, &sk2, &nt2, "ely:action", json!(k.to_string()), cx);
                })
                .into_any_element()
        }

        // ---------------- shell ----------------
        "shell/DockBadge" => {
            let count = prop_f64(node, "value")
                .or_else(|| prop_f64(node, "badge"))
                .filter(|v| v.is_finite() && *v >= 0.0)
                .unwrap_or(3.0) as usize;
            CountBadge::new(id, count)
                .over(
                    Well::new().child(
                        div()
                            .p_2()
                            .child(Icon::new(IconName::AppWindow).size(IconSize::Lg)),
                    ),
                )
                .into_any_element()
        }

        "shell/MultiWindow Manager" => {
            let items = extract_item_objects(node);
            let mut tb = TabBar::new((id.clone(), "tabs"));
            if items.is_empty() {
                tb = tb
                    .tab(WindowTab::new("win-1", "Workspace").icon(IconName::AppWindow))
                    .tab(WindowTab::new("win-2", "Inspector").icon(IconName::PanelRight))
                    .selected("win-1");
            } else {
                for (ix, it) in items.iter().enumerate() {
                    let wid = obj_str(&it, &["value", "id"]).unwrap_or_else(|| format!("win-{ix}"));
                    let wtitle = obj_str(&it, &["label", "title"])
                        .unwrap_or_else(|| format!("Window {}", ix + 1));
                    tb = tb.tab(WindowTab::new(wid, wtitle));
                }
            }
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            v_stack()
                .gap_2()
                .child(tb.on_select(move |wid, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(wid.to_string()), cx);
                }))
                .child(WindowControls::new((id, "wc")).platform(cx.theme().platform))
                .into_any_element()
        }

        "shell/NativeMenu" => {
            let notes = extract_string_list(node, "sourceNotes");
            let mut col = v_stack().gap_1();
            if notes.is_empty() {
                col = col.child(ListItem::new((id, "nm-0"), "Native application menu"));
            } else {
                for (ix, note) in notes.into_iter().enumerate() {
                    col = col.child(ListItem::new(
                        SharedString::from(format!("{eid}-nm-{ix}")),
                        note,
                    ));
                }
            }
            col.into_any_element()
        }

        "shell/SystemNotification" => {
            let title = non_empty_or(&best_title(node), "Notification");
            let body = best_body(node)
                .or_else(|| prop_str(node, "sourceNote"))
                .unwrap_or_else(|| "System notification preview".into());
            Notification::new(id, IconName::Bell, title)
                .body(body)
                .unread(true)
                .into_any_element()
        }

        "shell/WindowDragRegion" => {
            let lbl = non_empty_or(&best_label(node), "Window title");
            v_stack()
                .gap_1()
                .child(
                    TitleBar::new((id.clone(), "tb"))
                        .title(lbl)
                        .platform(cx.theme().platform),
                )
                .child(
                    drag_region((id, "drag"), window, cx)
                        .h(px(28.))
                        .w_full()
                        .flex()
                        .items_center()
                        .px_2()
                        .child(Caption::new("Drag region")),
                )
                .into_any_element()
        }

        "shell/WindowResizeBorder" => {
            let note = prop_str(node, "sourceNote")
                .or_else(|| best_body(node))
                .unwrap_or_else(|| "Window resize border".into());
            ResizeBorder::new()
                .child(Well::new().child(div().p_3().child(Caption::new(note))))
                .into_any_element()
        }

        // ---------------- tables ----------------
        "tables/ColumnPinning" => {
            let col_labels = extract_table_columns(node);
            let col_count = col_labels.len();
            let columns: Vec<Column> = col_labels
                .into_iter()
                .enumerate()
                .map(|(i, title)| {
                    let c = Column::new(format!("col-{i}"), title);
                    if i == 0 {
                        c.width(rems(8.0)).pinned()
                    } else {
                        c
                    }
                })
                .collect();
            let rows = extract_table_rows(node, col_count);
            DataTable::new(id, columns).rows(rows).into_any_element()
        }

        "tables/RowExpansion" => {
            let col_labels = extract_table_columns(node);
            let col_count = col_labels.len();
            let columns: Vec<Column> = col_labels
                .into_iter()
                .enumerate()
                .map(|(i, title)| Column::new(format!("col-{i}"), title))
                .collect();
            let rows = extract_table_rows(node, col_count);
            DataTable::new(id, columns)
                .rows(rows)
                .detail(|row_key, _, _| {
                    div()
                        .p_2()
                        .child(Caption::new(format!("Details for {row_key}")))
                        .into_any_element()
                })
                .into_any_element()
        }

        "tables/RowGrouping" => {
            let col_labels = extract_table_columns(node);
            let col_count = col_labels.len();
            let columns: Vec<Column> = col_labels
                .into_iter()
                .enumerate()
                .map(|(i, title)| Column::new(format!("col-{i}"), title))
                .collect();
            let mut rows = Vec::new();
            for (gix, grp) in arr_objs(node, "groups").iter().enumerate() {
                if let Some(g_rows) = grp.get("rows").and_then(Value::as_array) {
                    for (rix, r) in g_rows.iter().enumerate() {
                        let mut cells: Vec<Cell> =
                            if let Some(arr) = r.get("cells").and_then(Value::as_array) {
                                arr.iter().map(json_to_cell).collect()
                            } else {
                                Vec::new()
                            };
                        cells.resize(col_count, Cell::Empty);
                        rows.push(Row::new(format!("g{gix}-r{rix}"), cells));
                    }
                }
            }
            if rows.is_empty() {
                rows = extract_table_rows(node, col_count);
            }
            let group_key = if col_count > 2 { "col-2" } else { "col-0" };
            DataTable::new(id, columns)
                .rows(rows)
                .group_by(group_key)
                .into_any_element()
        }

        "tables/VirtualTable" => {
            let col_labels = extract_table_columns(node);
            let col_count = col_labels.len();
            let columns: Vec<Column> = col_labels
                .into_iter()
                .enumerate()
                .map(|(i, title)| Column::new(format!("col-{i}"), title))
                .collect();
            let rows = extract_table_rows(node, col_count);
            DataTable::new(id, columns)
                .rows(rows)
                .virtualized()
                .w_full()
                .h(px(240.))
                .into_any_element()
        }

        // ---------------- theme ----------------
        "theme/Ink" | "theme/Surfaces" | "theme/Signals" => {
            let items = extract_item_objects(node);
            let theme = cx.theme();
            let mut grid = SimpleGrid::new(id, px(140.), px(8.));
            if items.is_empty() {
                grid = grid.child(Badge::new("Theme tokens"));
            } else {
                for it in items {
                    let lbl = obj_str(&it, &["label"]).unwrap_or_else(|| "token".into());
                    let hex = obj_str(&it, &["color"]).unwrap_or_else(|| "#3772BB".into());
                    let c = parse_hsla(&hex, theme.colors.accent);
                    grid = grid.child(
                        Well::new().child(
                            h_stack()
                                .gap_2()
                                .p_2()
                                .items_center()
                                .child(
                                    div()
                                        .size(px(20.))
                                        .rounded(theme.radius(Radius::Sm))
                                        .border_1()
                                        .border_color(theme.colors.border)
                                        .bg(c),
                                )
                                .child(Label::new(lbl)),
                        ),
                    );
                }
            }
            grid.into_any_element()
        }

        "theme/Motion" => {
            let mut col = v_stack().gap_2();
            col = col.child(
                h_stack()
                    .gap_2()
                    .items_center()
                    .child(
                        Pulse::new((id.clone(), "pulse"))
                            .size(px(12.))
                            .rounded(px(6.))
                            .bg(cx.theme().colors.accent),
                    )
                    .child(div().flex_1().child(ProgressBar::new((id, "pb"), 0.65))),
            );
            for it in extract_item_objects(node) {
                let lbl = obj_str(&it, &["label"]).unwrap_or_else(|| "Curve".into());
                let val = obj_str(&it, &["value"]).unwrap_or_default();
                col = col.child(
                    h_stack()
                        .justify_between()
                        .child(Label::new(lbl))
                        .child(Code::new(val)),
                );
            }
            col.into_any_element()
        }

        "theme/Platform Style" => {
            let cur = view_state.value(&sk).and_then(Value::as_str).unwrap_or(
                match cx.theme().platform {
                    Platform::Mac => "mac",
                    Platform::Windows => "windows",
                    Platform::Linux => "linux",
                },
            );
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let seg = SegmentedControl::new((id, "plat"), cur.to_owned())
                .segment("mac", "macOS", None)
                .segment("windows", "Windows", None)
                .segment("linux", "Linux", None)
                .on_change(move |p, _, cx| {
                    emit_event(&v1, &sk1, &nt1, "change", json!(p.to_string()), cx);
                });
            let mut list = v_stack().gap_1();
            for (ix, it) in extract_item_objects(node).iter().enumerate() {
                let lbl = obj_str(it, &["label"]).unwrap_or_else(|| format!("File {ix}"));
                let icon = icon_by_name(obj_str(it, &["icon"]).as_deref(), IconName::File);
                list = list.child(
                    ListItem::new(SharedString::from(format!("{eid}-ps-{ix}")), lbl)
                        .leading(Icon::new(icon).size(IconSize::Sm)),
                );
            }
            v_stack().gap_2().child(seg).child(list).into_any_element()
        }

        "theme/Type" => {
            let items = extract_item_objects(node);
            let mut col = v_stack().gap_2();
            if items.is_empty() {
                col = col
                    .child(Heading::h2("Type scale"))
                    .child(Paragraph::new("Body"));
            } else {
                for it in items {
                    let txt =
                        obj_str(&it, &["content", "label"]).unwrap_or_else(|| "Sample".into());
                    let sz = obj_str(&it, &["size"]).unwrap_or_default();
                    let el = match sz.as_str() {
                        "display" | "heading" => Heading::h2(txt).into_any_element(),
                        "title" => Title::new(txt).into_any_element(),
                        "subtitle" => Subtitle::new(txt).into_any_element(),
                        "caption" => Caption::new(txt).into_any_element(),
                        _ => Label::new(txt).into_any_element(),
                    };
                    col = col.child(el);
                }
            }
            col.into_any_element()
        }

        // ---------------- tooling ----------------
        "tooling/ComponentGallery" => {
            let items = extract_item_objects(node);
            let mut grid = SimpleGrid::new(id, px(160.), px(8.));
            if items.is_empty() {
                grid = grid.child(Card::new().header(CardHeader::new("Gallery")));
            } else {
                for (ix, it) in items.iter().enumerate() {
                    let lbl = obj_str(it, &["label"]).unwrap_or_else(|| format!("Section {ix}"));
                    let url = obj_str(it, &["url"]).unwrap_or_default();
                    grid = grid.child(
                        Card::new()
                            .header(CardHeader::new(lbl))
                            .child(div().p_2().child(Caption::new(url))),
                    );
                }
            }
            grid.into_any_element()
        }

        "tooling/IconBrowser" => {
            let search_in = held_input(
                SharedString::from(format!("{eid}-ib-search")),
                "",
                &prop_str(node, "placeholder").unwrap_or_else(|| "Filter icons".into()),
                None,
                disabled,
                view_state,
                &format!("{sk}:search"),
                &ntype,
                window,
                cx,
                view,
            );
            let query = search_in.read(cx).text().to_ascii_lowercase();
            let names: Vec<String> = {
                let raw = extract_string_list(node, "icons");
                if raw.is_empty() {
                    IconName::ALL
                        .iter()
                        .take(24)
                        .map(|i| i.name().to_owned())
                        .collect()
                } else {
                    raw
                }
            };
            let mut grid = SimpleGrid::new((id, "grid"), px(48.), px(6.));
            for (ix, name) in names
                .into_iter()
                .filter(|n| query.is_empty() || n.to_ascii_lowercase().contains(&query))
                .take(40)
                .enumerate()
            {
                let icon = icon_by_name(Some(&name), IconName::Circle);
                let v1 = view.clone();
                let sk1 = sk.clone();
                let nt1 = ntype.clone();
                grid = grid.child(
                    Button::new(SharedString::from(format!("{eid}-ib-{ix}")), "")
                        .icon(icon)
                        .variant(ButtonVariant::Ghost)
                        .size(ControlSize::Sm)
                        .on_click(move |_, _, cx| {
                            emit_event(&v1, &sk1, &nt1, "change", json!(name), cx);
                        }),
                );
            }
            v_stack()
                .gap_2()
                .child(Input::new(&search_in))
                .child(grid)
                .into_any_element()
        }

        "tooling/InspectorOverlay" => {
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            let body = best_body(node).unwrap_or_else(|| "Measured element".into());
            Measure::new((id, "meas"), move |bounds, _, cx| {
                let _ = (&v1, &sk1, &nt1, bounds, cx);
            })
            .child(
                Well::new().child(
                    h_stack()
                        .justify_between()
                        .items_center()
                        .p_3()
                        .child(Label::new(body))
                        .child(Badge::new("Inspected").tone(Tone::Accent)),
                ),
            )
            .into_any_element()
        }

        "tooling/PlaygroundPanel" => {
            let first_pg = arr_objs(node, "playgrounds").into_iter().next();
            let mut knobs: Vec<PlayKnob> = Vec::new();
            let mut seen_names = BTreeSet::new();
            if let Some(pg) = first_pg
                && let Some(raw_knobs) = pg.get("knobs").and_then(Value::as_array)
            {
                for (ix, kv) in raw_knobs.iter().enumerate() {
                    let Some(k) = kv.as_object() else { continue };
                    let raw_name = obj_str(k, &["name"]).unwrap_or_else(|| format!("knob_{ix}"));
                    let kname = if seen_names.insert(raw_name.clone()) {
                        raw_name
                    } else {
                        let d = format!("{raw_name}_{ix}");
                        seen_names.insert(d.clone());
                        d
                    };
                    match obj_str(k, &["type"]).unwrap_or_default().as_str() {
                        "toggle" => {
                            knobs.push(PlayKnob::Toggle(kname.into(), obj_bool(k, "value")));
                        }
                        "number" => {
                            let min = finite_or(obj_f64(k, "min").unwrap_or(0.0), 0.0);
                            let raw_max = finite_or(obj_f64(k, "max").unwrap_or(1.0), 1.0);
                            let max = if raw_max > min { raw_max } else { min + 1.0 };
                            let step = obj_f64(k, "step")
                                .filter(|s| s.is_finite() && *s > 0.0)
                                .unwrap_or(0.1);
                            let val =
                                finite_or(obj_f64(k, "value").unwrap_or(min), min).clamp(min, max);
                            knobs.push(PlayKnob::Number(kname.into(), val, (min, max), step));
                        }
                        _ => {
                            let mut opts: Vec<SharedString> = k
                                .get("options")
                                .and_then(Value::as_array)
                                .map(|arr| {
                                    arr.iter()
                                        .filter_map(|o| {
                                            o.as_object()
                                                .and_then(|m| obj_str(m, &["label", "value"]))
                                                .map(Into::into)
                                        })
                                        .collect()
                                })
                                .unwrap_or_default();
                            if opts.is_empty() {
                                opts.push("Default".into());
                            }
                            knobs.push(PlayKnob::Choice(kname.into(), opts, 0));
                        }
                    }
                }
            }
            if knobs.is_empty() {
                knobs.push(PlayKnob::Toggle("disabled".into(), false));
            }
            Playground::new(id, knobs, |settings, _, _| {
                let _ = settings;
                Button::new("pg-preview", "Preview")
                    .variant(ButtonVariant::Primary)
                    .into_any_element()
            })
            .into_any_element()
        }

        "tooling/ScreenshotTest Harness" => {
            let cmd = prop_str(node, "command")
                .unwrap_or_else(|| "cargo test --package elysdui-gpui".into());
            let lbl = prop_str(node, "actionLabel").unwrap_or_else(|| "Capture".into());
            let v1 = view.clone();
            let sk1 = sk.clone();
            let nt1 = ntype.clone();
            v_stack()
                .gap_2()
                .child(CommandBlock::new(
                    (id.clone(), "cmd"),
                    "~",
                    cmd,
                    best_body(node).unwrap_or_default(),
                    CommandState::Done {
                        code: 0,
                        took: Duration::from_millis(12),
                    },
                ))
                .child(Button::new((id, "cap"), lbl).disabled(disabled).on_click(
                    move |_, _, cx| {
                        emit_event(&v1, &sk1, &nt1, "ely:action", json!("capture"), cx);
                    },
                ))
                .into_any_element()
        }

        // ---------------- typography ----------------
        "typography/LineClamp" => {
            let val = prop_str(node, "value").unwrap_or_else(|| "Clamped text".into());
            let w = prop_f64(node, "width").unwrap_or(320.0).clamp(80.0, 960.0) as f32;
            div()
                .w(px(w))
                .child(EllipsisTooltip::new(id, val))
                .into_any_element()
        }

        "typography/Truncate" => {
            let val = prop_str(node, "value").unwrap_or_else(|| "Truncated text".into());
            let before = prop_str(node, "before").unwrap_or_default();
            let w = prop_f64(node, "width").unwrap_or(240.0).clamp(80.0, 960.0) as f32;
            let mut row = h_stack().w(px(w)).gap_2().items_center();
            if !before.is_empty() {
                row = row.child(Badge::new(before));
            }
            row.child(div().flex_1().min_w_0().child(Ellipsis::new(val)))
                .into_any_element()
        }

        _ => return None,
    };
    Some(el)
}
