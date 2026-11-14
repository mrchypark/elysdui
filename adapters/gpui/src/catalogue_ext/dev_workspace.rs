use std::{
    collections::HashSet,
    path::PathBuf,
    rc::Rc,
    time::{Duration, Instant},
};

use ely_gpui_component::{
    buttons::{Button, ButtonVariant},
    charts::{GanttChart, Task as GanttTask},
    debug::{
        Breakpoint, BreakpointList, DebugState, DebugToolbar, HexViewer, NetworkInspector, Request,
        ValueKind, Variable, VariablesPanel,
    },
    devtools::{
        ApiRequest, ApiRequestBuilder, Auth, Connection, ConnectionManager, ConnectionState,
        Container, ContainerList, ContainerState, DbTable, Direction, Engine, Field,
        GraphQLExplorer, JsonViewer, Method, RedisKey, RedisKeyBrowser, RedisValue, RegexTester,
        Schema, SchemaTree, SchemaType, SocketMessage, SocketState, TableStructureEditor, TypeKind,
        WebSocketConsole, XmlViewer, YamlViewer,
    },
    documents::{
        Backlink, Backlinks, BlockData, BlockEditor, BlockKind, Chapter, DocPage, DocumentViewer,
        EpubReader, Favorite, Favorites, Footnote, Margins, MarkdownEditor, MarkdownMode,
        MarkdownRenderer, PageCover, Paper, PrintPreview, PrintSettings, RichTextEditor, Template,
        TemplatePicker, TodoItem, TrashBin, Trashed, Version, VersionHistory,
    },
    editor::{
        ActionKind, CodeAction, CodeActionMenu, CodeEditor, CompletionItem, CompletionMenu,
        ConsoleEntry, CursorPosition, DebugConsole, FileHits, FindOptions, FindWidget, Hit,
        Problem, ProblemsPanel, Project, RecentProjects, SearchPanel, Setting, SettingValue,
        SettingsEditor, SymbolKind, WelcomePage,
    },
    files::{
        ArchiveEntry, ArchiveViewer, DownloadManager, DuplicateFinder, Duplicates, FileExplorer,
        FileGrid, FileIcon, FileItem, FileOperation, FileOperationProgress, FilePreview,
        FileSearch, FileView, FoundFile, RecentFile, RecentFiles, Transfer, TransferQueue,
        TransferState,
    },
    forms::TextInput,
    git::{
        Blame, BlameView, Branch, BranchList, BranchSelector, Changed, ChangesList, DiffLayout,
        DiffViewer, PullRequest, PullRequestCard, PullState, ThreeWayMerge, regions,
    },
    layout::{h_stack, v_stack},
    lists::{DirEntry, GitStatus},
    mail::Label,
    primitives::{IconName, Severity},
    project::{
        DatabaseView, IssueId, LabelManager, Load, MilestoneProgress, Person, PomodoroTimer,
        Priority, Status, StatusSelect, Task, TaskDetailPanel, TaskItem, TimeEntry, TimeTracker,
        WorkloadView,
    },
    terminal::{Process, ProcessList, Terminal},
    theme::ControlSize,
};
use gpui::{
    AnyElement, App, ImageSource, InteractiveElement, IntoElement, ParentElement, SharedString,
    SharedUri, Styled, WeakEntity, Window, div, px,
};
use jiff::{Timestamp, civil::Date};
use serde_json::{Value, json};

use crate::{
    catalogue::{
        CatalogueView, best_body, best_label, best_title, non_empty_or, prop_bool, prop_f64,
        prop_str, value_to_f64,
    },
    dashboard::ScreenNode,
};

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
    let el: AnyElement = match kind {
        // ---------------- debug ----------------
        "debug/BreakpointList" => render_breakpoint_list(node, eid, view),
        "debug/DebugToolbar" => render_debug_toolbar(node, eid, state_key, view_state, view),
        "debug/NetworkInspector" => {
            render_network_inspector(node, eid, state_key, view_state, view)
        }
        "debug/VariablesPanel" => {
            render_variables_panel(node, eid, state_key, view_state, window, cx, view)
        }

        // ---------------- devtools ----------------
        "devtools/ApiRequestBuilder" => render_api_request_builder(node, eid, view),
        "devtools/ConnectionManager" => {
            render_connection_manager(node, eid, state_key, view_state, view)
        }
        "devtools/ContainerList" => render_container_list(node, eid, view),
        "devtools/DocumentViewer" => render_devtools_document_viewer(node, eid, window, cx),
        "devtools/GraphQLExplorer" => {
            render_graphql_explorer(node, eid, state_key, window, cx, view)
        }
        "devtools/RedisKeyBrowser" => {
            render_redis_key_browser(node, eid, state_key, view_state, window, cx, view)
        }
        "devtools/RegexTester" => render_regex_tester(node, eid),
        "devtools/SchemaTree" => render_schema_tree(node, eid, state_key, view_state, view),
        "devtools/TableStructureEditor" => {
            render_table_structure_editor(node, eid, state_key, view)
        }
        "devtools/WebSocketConsole" => render_websocket_console(node, eid, window, cx, view),

        // ---------------- documents ----------------
        "documents/Backlinks" => render_backlinks(node, eid, view),
        "documents/BlockEditor" => render_block_editor(node, eid, window, cx),
        "documents/DocumentViewer" => render_documents_viewer(node, eid, state_key, view),
        "documents/EpubReader" => render_epub_reader(node, eid),
        "documents/Footnote" => render_footnote(node, eid),
        "documents/MarkdownEditor" => {
            render_markdown_editor(node, eid, state_key, view_state, window, cx, view)
        }
        "documents/MarkdownRenderer" => render_markdown_renderer(node, eid, view),
        "documents/PageCover" => render_page_cover(node, eid, state_key, view_state, view),
        "documents/PrintPreview" => render_print_preview(node, eid, state_key, window, cx, view),
        "documents/RichTextEditor" => render_rich_text_editor(node, eid, window, cx),
        "documents/TemplatePicker" => render_template_picker(node, eid, view),
        "documents/TodoItem" => render_todo_item(node, eid, state_key, view_state, view),
        "documents/TrashBin" => render_trash_bin(node, eid, view),
        "documents/VersionHistory" => {
            render_version_history(node, eid, state_key, view_state, view)
        }

        // ---------------- editor ----------------
        "editor/CodeActionMenu" => render_code_action_menu(node, eid, view),
        "editor/CodeEditor" => render_code_editor(node, eid, window, cx),
        "editor/CompletionMenu" => render_completion_menu(node, eid, view),
        "editor/CursorPosition" => render_cursor_position(node, eid, view),
        "editor/DebugConsole" => render_debug_console(node, eid, window, cx, view),
        "editor/FindWidget" => render_find_widget(node, eid, state_key, window, cx, view),
        "editor/ProblemsPanel" => render_problems_panel(node, eid, view),
        "editor/SearchPanel" => render_search_panel(node, eid, view),
        "editor/SettingsEditor" => render_settings_editor(node, eid, state_key, window, cx, view),
        "editor/WelcomePage" => render_welcome_page(node, eid, state_key, view_state, view),

        // ---------------- files ----------------
        "files/ArchiveViewer" => render_archive_viewer(node, eid, view),
        "files/DownloadManager" => render_download_manager(node, eid, view),
        "files/DuplicateFinder" => render_duplicate_finder(node, eid, view),
        "files/Favorites" => render_files_favorites(node, eid, view),
        "files/FileExplorer" => render_file_explorer(node, eid, state_key, view_state, view),
        "files/FileGrid" => render_file_grid(node, eid, state_key, view_state, view),
        "files/FileIcon" => render_file_icon(node),
        "files/FileItem" => render_file_item(node, eid),
        "files/FileOperationProgress" => render_file_operation_progress(node, eid, view),
        "files/FilePreview" => render_file_preview(node, eid),
        "files/FileSearch" => render_file_search(node, eid, window, cx, view),
        "files/HexViewer" => render_hex_viewer(node, eid, state_key, view),
        "files/RecentFiles" => render_recent_files(node, eid, view),
        "files/TransferQueue" => render_transfer_queue(node, eid, view),

        // ---------------- git ----------------
        "git/BlameView" => render_blame_view(node, eid, view),
        "git/BranchSelector" => render_branch_selector(node, eid, state_key, window, cx, view),
        "git/ChangesList" => render_changes_list(node, eid, view),
        "git/DiffViewer" => render_diff_viewer(node, eid, state_key, view_state, view),
        "git/PullRequestCard" => render_pull_request_card(node, eid, view),
        "git/ThreeWayMerge" => render_three_way_merge(node, eid, state_key, view),

        // ---------------- project ----------------
        "project/DatabaseView" => render_database_view(node, eid, view),
        "project/GanttChart" => render_gantt_chart(node, eid),
        "project/LabelManager" => render_label_manager(node, eid, view),
        "project/MilestoneProgress" => render_milestone_progress(node, eid),
        "project/Pomodoro Timer" | "project/PomodoroTimer" => {
            render_pomodoro_timer(node, eid, view)
        }
        "project/StatusSelect" => render_status_select(node, eid, state_key, view_state, view),
        "project/TaskDetailPanel" => render_task_detail_panel(node, eid, state_key, view),
        "project/TaskItem" => render_task_item(node, eid, state_key, view),
        "project/TimeTracker" => render_time_tracker(node, eid, view),
        "project/WorkloadView" => render_workload_view(node, eid),

        // ---------------- terminal ----------------
        "terminal/ProcessList" => render_process_list(node, eid, state_key, view),
        "terminal/Terminal" => render_terminal(node, eid, window, cx),

        _ => return None,
    };
    Some(el)
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

fn sized_box(height_px: f32, child: impl IntoElement) -> AnyElement {
    div()
        .w_full()
        .h(px(height_px))
        .child(child)
        .into_any_element()
}

fn devtools_val<'a>(node: &'a ScreenNode, key: &str) -> Option<&'a Value> {
    node.props
        .get("devtools")
        .and_then(|d| d.get(key))
        .or_else(|| node.props.get(key))
}

fn devtools_str(node: &ScreenNode, key: &str) -> Option<String> {
    devtools_val(node, key).and_then(|v| match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    })
}

fn json_str(v: &Value, key: &str) -> Option<String> {
    v.get(key).and_then(|x| match x {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        Value::Bool(b) => Some(b.to_string()),
        _ => None,
    })
}

fn parse_ts(s: Option<&str>) -> Timestamp {
    s.and_then(|raw| raw.trim().parse::<Timestamp>().ok())
        .unwrap_or(Timestamp::UNIX_EPOCH)
}

fn default_date() -> Date {
    jiff::civil::date(2026, 10, 13)
}

fn parse_date(s: Option<&str>) -> Option<Date> {
    let raw = s?.trim();
    let date_part = raw.split('T').next().unwrap_or(raw);
    date_part.parse::<Date>().ok()
}

fn parse_human_bytes(v: Option<&Value>) -> u64 {
    let Some(v) = v else {
        return 0;
    };
    if let Some(n) = v.as_u64() {
        return n;
    }
    if let Some(f) = v.as_f64().filter(|f| f.is_finite() && *f >= 0.0) {
        return f as u64;
    }
    let Some(raw) = v.as_str() else {
        return 0;
    };
    let s = raw.trim();
    let mut num_end = 0;
    for (idx, ch) in s.char_indices() {
        if ch.is_ascii_digit() || ch == '.' {
            num_end = idx + ch.len_utf8();
        } else {
            break;
        }
    }
    let num = s[..num_end].parse::<f64>().ok().filter(|f| f.is_finite());
    let Some(num) = num else {
        return 0;
    };
    let unit = s[num_end..].trim().to_ascii_lowercase();
    let mult = match unit.as_str() {
        "kb" | "k" => 1_000.0,
        "kib" => 1_024.0,
        "mb" | "m" => 1_000_000.0,
        "mib" => 1_048_576.0,
        "gb" | "g" => 1_000_000_000.0,
        "gib" => 1_073_741_824.0,
        _ => 1.0,
    };
    (num.max(0.0) * mult) as u64
}

fn parse_severity(s: Option<&str>) -> Severity {
    match s.unwrap_or("").trim().to_ascii_lowercase().as_str() {
        "error" | "danger" | "critical" | "fatal" => Severity::Danger,
        "warn" | "warning" => Severity::Warning,
        "ok" | "success" | "pass" | "passed" => Severity::Success,
        _ => Severity::Info,
    }
}

fn image_source(raw: &str) -> ImageSource {
    if raw.starts_with("http://") || raw.starts_with("https://") {
        SharedUri::from(raw.to_owned()).into()
    } else {
        PathBuf::from(raw).into()
    }
}

fn keyed_text_input(
    eid: &SharedString,
    suffix: &str,
    placeholder: &str,
    initial: &str,
    multiline: bool,
    window: &mut Window,
    cx: &mut App,
) -> gpui::Entity<TextInput> {
    let placeholder = placeholder.to_owned();
    let initial = initial.to_owned();
    window.use_keyed_state(
        SharedString::from(format!("{eid}-{suffix}")),
        cx,
        |window, cx| {
            let mut ti = TextInput::new(window, cx).placeholder(placeholder);
            if multiline {
                ti = ti.multi_line(4, 12);
            }
            if !initial.is_empty() {
                ti.set_text(initial, cx);
            }
            ti
        },
    )
}

fn keyed_code_editor(
    eid: &SharedString,
    suffix: &str,
    initial: &str,
    language: &str,
    window: &mut Window,
    cx: &mut App,
) -> gpui::Entity<CodeEditor> {
    let initial = initial.to_owned();
    let language = language.to_owned();
    window.use_keyed_state(
        SharedString::from(format!("{eid}-{suffix}")),
        cx,
        |window, cx| {
            let mut ed = CodeEditor::new(initial, window, cx);
            if !language.is_empty() {
                ed = ed.language(language);
            }
            ed
        },
    )
}

// ============================================================================
// debug
// ============================================================================

fn render_breakpoint_list(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let points: Vec<Breakpoint> = node
        .props
        .get("breakpoints")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, item)| Breakpoint {
                    path: json_str(item, "file")
                        .or_else(|| json_str(item, "path"))
                        .unwrap_or_else(|| format!("src/file_{ix}.rs"))
                        .into(),
                    line: item
                        .get("line")
                        .and_then(Value::as_u64)
                        .unwrap_or((ix + 1) as u64)
                        .max(1) as usize,
                    enabled: item.get("enabled").and_then(Value::as_bool).unwrap_or(true),
                    condition: json_str(item, "condition")
                        .filter(|s| !s.is_empty())
                        .map(Into::into),
                    hits: item.get("hits").and_then(Value::as_u64).unwrap_or(0) as usize,
                })
                .collect()
        })
        .unwrap_or_default();

    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    let v1 = view.clone();
    let v2 = view.clone();
    let v3 = view.clone();
    let (nid1, nid2, nid3) = (nid.clone(), nid.clone(), nid);
    let (nt1, nt2, nt3) = (ntype.clone(), ntype.clone(), ntype);

    BreakpointList::new(gpui::ElementId::from(eid.clone()), points)
        .on_toggle(move |ix, enabled, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "toggle": ix, "enabled": enabled }),
                cx,
            );
        })
        .on_open(move |ix, _, cx| {
            emit_event(&v2, &nid2, &nt2, "ely:action", json!({ "open": ix }), cx);
        })
        .on_remove(move |ix, _, cx| {
            emit_event(&v3, &nid3, &nt3, "ely:action", json!({ "remove": ix }), cx);
        })
        .into_any_element()
}

fn render_debug_toolbar(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let status = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| prop_str(node, "status"))
        .or_else(|| prop_str(node, "state"))
        .unwrap_or_default();
    let state = if status.eq_ignore_ascii_case("running") {
        DebugState::Running
    } else {
        DebugState::Paused
    };
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    DebugToolbar::new(gpui::ElementId::from(eid.clone()), state)
        .on_command(move |cmd, _, cx| {
            emit_event(
                &v,
                &nid,
                &ntype,
                "ely:action",
                json!(format!("{cmd:?}")),
                cx,
            );
        })
        .into_any_element()
}

fn render_network_inspector(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut selected_idx = view_state
        .value(state_key)
        .and_then(Value::as_u64)
        .map(|n| n as usize);
    let requests: Vec<Request> = node
        .props
        .get("requests")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, item)| {
                    if selected_idx.is_none()
                        && item.get("selected").and_then(Value::as_bool) == Some(true)
                    {
                        selected_idx = Some(ix);
                    }
                    let status = item
                        .get("status")
                        .and_then(Value::as_u64)
                        .and_then(|s| u16::try_from(s).ok());
                    let start = item
                        .get("start")
                        .and_then(value_to_f64)
                        .filter(|f| f.is_finite() && *f >= 0.0)
                        .unwrap_or(0.0);
                    let duration = item
                        .get("duration")
                        .and_then(value_to_f64)
                        .filter(|f| f.is_finite() && *f >= 0.0)
                        .unwrap_or(0.0);
                    let headers = item
                        .get("headers")
                        .and_then(Value::as_array)
                        .map(|hs| {
                            hs.iter()
                                .map(|h| {
                                    (
                                        json_str(h, "name")
                                            .or_else(|| json_str(h, "key"))
                                            .unwrap_or_default()
                                            .into(),
                                        json_str(h, "value").unwrap_or_default().into(),
                                    )
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    Request {
                        method: json_str(item, "method")
                            .unwrap_or_else(|| "GET".into())
                            .into(),
                        url: json_str(item, "url")
                            .or_else(|| json_str(item, "name"))
                            .unwrap_or_else(|| "/".into())
                            .into(),
                        status,
                        kind: json_str(item, "kind")
                            .unwrap_or_else(|| "fetch".into())
                            .into(),
                        size: parse_human_bytes(item.get("size")),
                        start,
                        duration,
                        headers,
                        body: json_str(item, "body").map(Into::into),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let mut inspector = NetworkInspector::new(gpui::ElementId::from(eid.clone()), requests);
    if let Some(query) = prop_str(node, "query") {
        inspector = inspector.query(query);
    }
    if let Some(ix) = selected_idx {
        inspector = inspector.selected(ix);
    }
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    inspector
        .on_select(move |ix, _, cx| {
            emit_event(&v, &sk, &ntype, "change", json!(ix), cx);
        })
        .into_any_element()
}

fn parse_var(
    item: &Value,
    path: &str,
    open: &mut Vec<SharedString>,
    changed: &mut Vec<SharedString>,
) -> Variable {
    let name = json_str(item, "name").unwrap_or_else(|| "var".into());
    let key: SharedString = json_str(item, "key")
        .unwrap_or_else(|| format!("{path}/{name}"))
        .into();
    if item.get("open").and_then(Value::as_bool) == Some(true) {
        open.push(key.clone());
    }
    if item.get("changed").and_then(Value::as_bool) == Some(true) {
        changed.push(key.clone());
    }
    let kind = match json_str(item, "kind")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "number" | "int" | "float" => ValueKind::Number,
        "bool" | "boolean" => ValueKind::Bool,
        "null" | "nil" => ValueKind::Null,
        "object" | "struct" | "map" => ValueKind::Object,
        "list" | "array" | "slice" => ValueKind::List,
        "function" | "fn" => ValueKind::Function,
        _ => ValueKind::Text,
    };
    let children = item
        .get("children")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|c| parse_var(c, &key, open, changed))
                .collect()
        })
        .unwrap_or_default();
    Variable {
        name: name.into(),
        value: json_str(item, "value").unwrap_or_default().into(),
        kind,
        type_name: json_str(item, "type").map(Into::into),
        children,
    }
}

fn render_variables_panel(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    _view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut initial_open: Vec<SharedString> = Vec::new();
    let mut changed: Vec<SharedString> = Vec::new();
    let mut scopes: Vec<(SharedString, Vec<Variable>)> = node
        .props
        .get("scopes")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|sc| {
                    let sname = json_str(sc, "name").unwrap_or_else(|| "Locals".into());
                    if sc.get("open").and_then(Value::as_bool).unwrap_or(true) {
                        initial_open.push(sname.clone().into());
                    }
                    let vars = sc
                        .get("variables")
                        .and_then(Value::as_array)
                        .map(|vs| {
                            vs.iter()
                                .map(|v| parse_var(v, &sname, &mut initial_open, &mut changed))
                                .collect()
                        })
                        .unwrap_or_default();
                    (sname.into(), vars)
                })
                .collect()
        })
        .unwrap_or_default();

    if scopes.is_empty()
        && let Some(vars) = node.props.get("variables").and_then(Value::as_array)
    {
        initial_open.push("Locals".into());
        let parsed = vars
            .iter()
            .map(|v| parse_var(v, "Locals", &mut initial_open, &mut changed))
            .collect();
        scopes.push(("Locals".into(), parsed));
    }

    let open_state =
        window.use_keyed_state(SharedString::from(format!("{eid}-open")), cx, |_, _| {
            initial_open
        });
    let open_keys = open_state.read(cx).clone();
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();

    VariablesPanel::new(gpui::ElementId::from(eid.clone()), scopes)
        .open(open_keys)
        .changed(changed)
        .on_toggle(move |key, is_open, _, cx| {
            open_state.update(cx, |keys, cx| {
                if is_open {
                    if !keys.contains(key) {
                        keys.push(key.clone());
                    }
                } else {
                    keys.retain(|k| k != key);
                }
                cx.notify();
            });
            emit_event(
                &v,
                &sk,
                &ntype,
                "change",
                json!({ "key": key.as_ref(), "open": is_open }),
                cx,
            );
        })
        .into_any_element()
}

// ============================================================================
// devtools
// ============================================================================

fn parse_method(s: Option<&str>) -> Method {
    match s.unwrap_or("GET").trim().to_ascii_uppercase().as_str() {
        "POST" => Method::Post,
        "PUT" => Method::Put,
        "PATCH" => Method::Patch,
        "DELETE" => Method::Delete,
        "HEAD" => Method::Head,
        "OPTIONS" => Method::Options,
        _ => Method::Get,
    }
}

fn render_api_request_builder(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let open_key = devtools_str(node, "open");
    let req_val = devtools_val(node, "requests")
        .and_then(Value::as_array)
        .and_then(|arr| {
            open_key
                .as_deref()
                .and_then(|ok| {
                    arr.iter()
                        .find(|r| json_str(r, "key").as_deref() == Some(ok))
                })
                .or_else(|| arr.first())
        });

    let request = if let Some(r) = req_val {
        let mut req = ApiRequest::new(
            json_str(r, "key").unwrap_or_else(|| node.id.clone()),
            parse_method(json_str(r, "method").as_deref()),
            json_str(r, "url").unwrap_or_else(|| "/".into()),
        );
        req.params = r
            .get("params")
            .and_then(Value::as_array)
            .map(|ps| {
                ps.iter()
                    .map(|p| {
                        (
                            json_str(p, "key").unwrap_or_default(),
                            json_str(p, "value").unwrap_or_default(),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();
        req.headers = r
            .get("headers")
            .and_then(Value::as_array)
            .map(|hs| {
                hs.iter()
                    .map(|h| {
                        (
                            json_str(h, "key").unwrap_or_default(),
                            json_str(h, "value").unwrap_or_default(),
                        )
                    })
                    .collect()
            })
            .unwrap_or_default();
        req.body = json_str(r, "body").unwrap_or_default().into();
        if let Some(auth) = r.get("auth") {
            match json_str(auth, "type")
                .unwrap_or_default()
                .to_ascii_lowercase()
                .as_str()
            {
                "bearer" => {
                    req.auth = Auth::Bearer(json_str(auth, "token").unwrap_or_default().into())
                }
                "basic" => {
                    req.auth = Auth::Basic {
                        user: json_str(auth, "user").unwrap_or_default().into(),
                        password: json_str(auth, "password").unwrap_or_default().into(),
                    }
                }
                _ => {}
            }
        }
        req
    } else {
        ApiRequest::new(
            node.id.clone(),
            parse_method(prop_str(node, "method").as_deref()),
            prop_str(node, "endpoint").unwrap_or_else(|| "/api/resource".into()),
        )
    };

    let active_env = devtools_str(node, "environment");
    let vars: Vec<(SharedString, SharedString)> = devtools_val(node, "environments")
        .and_then(Value::as_array)
        .and_then(|envs| {
            active_env
                .as_deref()
                .and_then(|ek| {
                    envs.iter()
                        .find(|e| json_str(e, "key").as_deref() == Some(ek))
                })
                .or_else(|| envs.first())
        })
        .and_then(|e| e.get("variables"))
        .and_then(Value::as_array)
        .map(|vs| {
            vs.iter()
                .map(|v| {
                    (
                        json_str(v, "key").unwrap_or_default().into(),
                        json_str(v, "value").unwrap_or_default().into(),
                    )
                })
                .collect()
        })
        .unwrap_or_default();

    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    ApiRequestBuilder::new(gpui::ElementId::from(eid.clone()), request)
        .variables(vars)
        .on_send(move |req, _, cx| {
            emit_event(
                &v,
                &nid,
                &ntype,
                "ely:action",
                json!({ "method": req.method.name(), "url": req.address() }),
                cx,
            );
        })
        .into_any_element()
}

fn parse_engine(s: Option<&str>) -> Engine {
    match s.unwrap_or("").trim().to_ascii_lowercase().as_str() {
        "mysql" => Engine::MySql,
        "sqlite" => Engine::Sqlite,
        "redis" => Engine::Redis,
        "mongodb" | "mongo" => Engine::MongoDb,
        _ => Engine::Postgres,
    }
}

fn render_connection_manager(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let conns: Vec<Connection> = devtools_val(node, "connections")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, c)| {
                    let engine = parse_engine(json_str(c, "engine").as_deref());
                    let key = json_str(c, "key").unwrap_or_else(|| format!("conn-{ix}"));
                    let name = json_str(c, "name").unwrap_or_else(|| key.clone());
                    let mut conn = Connection::new(key, name, engine);
                    if let Some(host) = json_str(c, "host") {
                        conn.host = host.into();
                    }
                    conn.port = c
                        .get("port")
                        .and_then(Value::as_u64)
                        .and_then(|p| u16::try_from(p).ok())
                        .or_else(|| engine.port());
                    conn.database = json_str(c, "database").unwrap_or_default().into();
                    conn.user = json_str(c, "user").unwrap_or_default().into();
                    conn.password = json_str(c, "password").unwrap_or_default().into();
                    conn.tls = c.get("tls").and_then(Value::as_bool).unwrap_or(false);
                    conn.state = match json_str(c, "state")
                        .unwrap_or_default()
                        .to_ascii_lowercase()
                        .as_str()
                    {
                        "connected" => ConnectionState::Connected,
                        "failed" => ConnectionState::Failed(
                            json_str(c, "error")
                                .unwrap_or_else(|| "Connection failed".into())
                                .into(),
                        ),
                        _ => ConnectionState::Idle,
                    };
                    conn
                })
                .collect()
        })
        .unwrap_or_default();

    let selected = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| devtools_str(node, "selected"));
    let v1 = view.clone();
    let v2 = view.clone();
    let sk = state_key.to_owned();
    let nid = node.id.clone();
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());

    ConnectionManager::new(gpui::ElementId::from(eid.clone()), conns)
        .selected(selected)
        .on_select(move |k, _, cx| {
            emit_event(&v1, &sk, &nt1, "change", json!(k.as_ref()), cx);
        })
        .on_open(move |k, _, cx| {
            emit_event(
                &v2,
                &nid,
                &nt2,
                "ely:action",
                json!({ "open": k.as_ref() }),
                cx,
            );
        })
        .into_any_element()
}

fn render_container_list(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let containers: Vec<Container> = devtools_val(node, "containers")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, c)| {
                    let key = json_str(c, "key")
                        .or_else(|| json_str(c, "id"))
                        .unwrap_or_else(|| format!("ctr-{ix}"));
                    let name = json_str(c, "name").unwrap_or_else(|| key.clone());
                    let image = json_str(c, "image").unwrap_or_else(|| "image:latest".into());
                    let exit_code = c.get("exitCode").and_then(Value::as_i64).unwrap_or(0) as i32;
                    let state_str = json_str(c, "state")
                        .or_else(|| json_str(c, "status"))
                        .unwrap_or_default()
                        .to_ascii_lowercase();
                    let state = match state_str.as_str() {
                        "paused" => ContainerState::Paused,
                        "restarting" => ContainerState::Restarting,
                        "exited" | "stopped" => ContainerState::Exited(exit_code),
                        _ => ContainerState::Running,
                    };
                    let ports = match c.get("ports") {
                        Some(Value::Array(ps)) => ps
                            .iter()
                            .filter_map(Value::as_str)
                            .map(|s| s.to_owned().into())
                            .collect(),
                        Some(Value::String(s)) if !s.is_empty() => vec![s.clone().into()],
                        _ => Vec::new(),
                    };
                    let cpu = c
                        .get("cpu")
                        .and_then(value_to_f64)
                        .filter(|f| f.is_finite() && *f >= 0.0)
                        .unwrap_or(0.0) as f32;
                    Container {
                        key: key.into(),
                        name: name.into(),
                        image: image.into(),
                        state,
                        ports,
                        cpu,
                        memory: parse_human_bytes(c.get("memory")),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let v1 = view.clone();
    let v2 = view.clone();
    let (nid1, nid2) = (node.id.clone(), node.id.clone());
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    ContainerList::new(gpui::ElementId::from(eid.clone()), containers)
        .on_toggle(move |k, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "toggle": k.as_ref() }),
                cx,
            );
        })
        .on_restart(move |k, _, cx| {
            emit_event(
                &v2,
                &nid2,
                &nt2,
                "ely:action",
                json!({ "restart": k.as_ref() }),
                cx,
            );
        })
        .into_any_element()
}

fn render_devtools_document_viewer(
    node: &ScreenNode,
    eid: &SharedString,
    window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    let search = keyed_text_input(eid, "doc-search", "Filter keys...", "", false, window, cx);
    if let Some(json_text) = devtools_str(node, "json") {
        return sized_box(
            280.,
            JsonViewer::new(gpui::ElementId::from(eid.clone()), json_text, &search),
        );
    }
    if let Some(yaml_text) = devtools_str(node, "yaml") {
        return sized_box(
            280.,
            YamlViewer::new(gpui::ElementId::from(eid.clone()), yaml_text, &search),
        );
    }
    if let Some(xml_text) = devtools_str(node, "xml") {
        return sized_box(
            280.,
            XmlViewer::new(gpui::ElementId::from(eid.clone()), xml_text),
        );
    }
    let fallback = prop_str(node, "value").unwrap_or_else(|| "{}".into());
    sized_box(
        280.,
        JsonViewer::new(gpui::ElementId::from(eid.clone()), fallback, &search),
    )
}

fn render_graphql_explorer(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let types: Vec<SchemaType> = devtools_val(node, "types")
        .or_else(|| node.props.get("schemaTypes"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, t)| {
                    let kind = match json_str(t, "kind")
                        .unwrap_or_default()
                        .to_ascii_lowercase()
                        .as_str()
                    {
                        "input" => TypeKind::Input,
                        "enum" => TypeKind::Enum,
                        "scalar" => TypeKind::Scalar,
                        _ => TypeKind::Object,
                    };
                    let fields = t
                        .get("fields")
                        .and_then(Value::as_array)
                        .map(|fs| {
                            fs.iter()
                                .map(|f| {
                                    (
                                        json_str(f, "name").unwrap_or_default().into(),
                                        json_str(f, "type").unwrap_or_default().into(),
                                    )
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    SchemaType {
                        name: json_str(t, "name")
                            .unwrap_or_else(|| format!("Type{ix}"))
                            .into(),
                        kind,
                        fields,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let q_text = devtools_str(node, "query").unwrap_or_else(|| "query { __typename }".into());
    let vars_text = devtools_str(node, "variables")
        .or_else(|| prop_str(node, "variablesJSON"))
        .unwrap_or_else(|| "{}".into());
    let query = keyed_code_editor(eid, "gql-query", &q_text, "GraphQL", window, cx);
    let variables = keyed_code_editor(eid, "gql-vars", &vars_text, "JSON", window, cx);
    let search = keyed_text_input(eid, "gql-search", "Filter answer...", "", false, window, cx);

    let v1 = view.clone();
    let v2 = view.clone();
    let nid = node.id.clone();
    let sk = state_key.to_owned();
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());

    let mut explorer = GraphQLExplorer::new(
        gpui::ElementId::from(eid.clone()),
        types,
        &query,
        &variables,
        &search,
        move |q, vars, _, cx| {
            emit_event(
                &v1,
                &nid,
                &nt1,
                "ely:action",
                json!({ "query": q, "variables": vars }),
                cx,
            );
        },
    )
    .on_pick(move |path, _, cx| {
        emit_event(&v2, &sk, &nt2, "change", json!(path.as_ref()), cx);
    });

    if let Some(ans) = devtools_str(node, "answer").or_else(|| prop_str(node, "responseJSON")) {
        explorer = explorer.answer(ans);
    }
    sized_box(340., explorer)
}

fn render_redis_key_browser(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let keys: Vec<RedisKey> = devtools_val(node, "keys")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, item)| {
                    let key = json_str(item, "key").unwrap_or_else(|| format!("key:{ix}"));
                    let kind = json_str(item, "type")
                        .unwrap_or_default()
                        .to_ascii_lowercase();
                    let raw_val = item.get("value");
                    let value = match kind.as_str() {
                        "hash" => {
                            let pairs = raw_val
                                .and_then(Value::as_array)
                                .map(|ps| {
                                    ps.iter()
                                        .map(|p| {
                                            (
                                                json_str(p, "key").unwrap_or_default().into(),
                                                json_str(p, "value").unwrap_or_default().into(),
                                            )
                                        })
                                        .collect()
                                })
                                .unwrap_or_else(|| {
                                    vec![(
                                        "value".into(),
                                        json_str(item, "preview").unwrap_or_default().into(),
                                    )]
                                });
                            RedisValue::Hash(pairs)
                        }
                        "list" => RedisValue::List(
                            raw_val
                                .and_then(Value::as_array)
                                .map(|xs| {
                                    xs.iter()
                                        .filter_map(Value::as_str)
                                        .map(|s| s.to_owned().into())
                                        .collect()
                                })
                                .unwrap_or_default(),
                        ),
                        "set" => RedisValue::Set(
                            raw_val
                                .and_then(Value::as_array)
                                .map(|xs| {
                                    xs.iter()
                                        .filter_map(Value::as_str)
                                        .map(|s| s.to_owned().into())
                                        .collect()
                                })
                                .unwrap_or_default(),
                        ),
                        "zset" => RedisValue::Sorted(
                            raw_val
                                .and_then(Value::as_array)
                                .map(|xs| {
                                    xs.iter()
                                        .map(|x| {
                                            (
                                                json_str(x, "key").unwrap_or_default().into(),
                                                x.get("value")
                                                    .and_then(value_to_f64)
                                                    .filter(|f| f.is_finite())
                                                    .unwrap_or(0.0),
                                            )
                                        })
                                        .collect()
                                })
                                .unwrap_or_default(),
                        ),
                        _ => RedisValue::Text(
                            json_str(item, "value")
                                .or_else(|| json_str(item, "preview"))
                                .unwrap_or_default()
                                .into(),
                        ),
                    };
                    RedisKey {
                        key: key.into(),
                        value,
                        ttl: item.get("ttl").and_then(Value::as_u64),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let pat = prop_str(node, "query").unwrap_or_default();
    let pattern = keyed_text_input(eid, "redis-pat", "Pattern (*)", &pat, false, window, cx);
    let selected = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| devtools_str(node, "selected"));
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();

    RedisKeyBrowser::new(gpui::ElementId::from(eid.clone()), keys, &pattern)
        .selected(selected)
        .on_select(move |k, _, cx| {
            emit_event(&v, &sk, &ntype, "change", json!(k.as_ref()), cx);
        })
        .into_any_element()
}

fn render_regex_tester(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let pattern = devtools_str(node, "pattern").unwrap_or_default();
    let sample = devtools_str(node, "text").unwrap_or_default();
    RegexTester::new(gpui::ElementId::from(eid.clone()), pattern, sample).into_any_element()
}

fn parse_db_field(f: &Value, ix: usize) -> Field {
    let name = json_str(f, "name").unwrap_or_else(|| format!("col_{ix}"));
    let ty = json_str(f, "type").unwrap_or_else(|| "text".into());
    let mut field = Field::new(name, ty);
    if f.get("nullable").and_then(Value::as_bool) == Some(true) {
        field = field.nullable();
    }
    if f.get("primary").and_then(Value::as_bool) == Some(true) {
        field = field.primary();
    } else if let Some(r) = f.get("ref") {
        let table = json_str(r, "table").unwrap_or_default();
        let col = json_str(r, "field").unwrap_or_default();
        if !table.is_empty() {
            field = field.refers(table, col);
        }
    }
    if let Some(def) = json_str(f, "default") {
        field = field.default_value(def);
    }
    field
}

fn render_schema_tree(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let schemas: Vec<Schema> = devtools_val(node, "schemas")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, s)| {
                    let tables = s
                        .get("tables")
                        .and_then(Value::as_array)
                        .map(|ts| {
                            ts.iter()
                                .enumerate()
                                .map(|(tix, t)| {
                                    let fields = t
                                        .get("fields")
                                        .and_then(Value::as_array)
                                        .map(|fs| {
                                            fs.iter()
                                                .enumerate()
                                                .map(|(fix, f)| parse_db_field(f, fix))
                                                .collect::<Vec<_>>()
                                        })
                                        .unwrap_or_default();
                                    let mut table = DbTable::new(
                                        json_str(t, "name")
                                            .unwrap_or_else(|| format!("table_{tix}")),
                                        fields,
                                    );
                                    if t.get("view").and_then(Value::as_bool) == Some(true) {
                                        table = table.view();
                                    }
                                    table
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    Schema {
                        name: json_str(s, "name")
                            .unwrap_or_else(|| format!("schema_{ix}"))
                            .into(),
                        tables,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let open: Vec<String> = devtools_val(node, "open")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default();
    let selected: Vec<String> = view_state
        .value(state_key)
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect()
        })
        .unwrap_or_default();

    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    sized_box(
        280.,
        SchemaTree::new(gpui::ElementId::from(eid.clone()), schemas)
            .open(open)
            .selected(selected)
            .on_select(move |keys, _, cx| {
                let vals: Vec<&str> = keys.iter().map(|k| k.as_ref()).collect();
                emit_event(&v, &sk, &ntype, "change", json!(vals), cx);
            }),
    )
}

fn render_table_structure_editor(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let raw_fields = devtools_val(node, "fields")
        .or_else(|| node.props.get("columns"))
        .and_then(Value::as_array);
    let fields: Vec<Field> = raw_fields
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, f)| parse_db_field(f, ix))
                .collect()
        })
        .unwrap_or_default();

    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    div()
        .w_full()
        .debug_selector(|| "table-structure-container".into())
        .child(TableStructureEditor::new(
            gpui::ElementId::from(eid.clone()),
            fields,
            move |updated, _, cx| {
                let names: Vec<&str> = updated.iter().map(|f| f.name.as_ref()).collect();
                emit_event(&v, &sk, &ntype, "change", json!(names), cx);
            },
        ))
        .into_any_element()
}

fn render_websocket_console(
    node: &ScreenNode,
    eid: &SharedString,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let url = devtools_str(node, "url")
        .or_else(|| prop_str(node, "endpoint"))
        .unwrap_or_else(|| "wss://localhost/socket".into());
    let source_state = devtools_str(node, "state");
    let state = match source_state
        .as_deref()
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "open" | "connected" => SocketState::Open,
        "opening" | "connecting" => SocketState::Opening,
        _ => SocketState::Closed,
    };
    let now = parse_ts(devtools_str(node, "now").as_deref());
    let messages: Vec<SocketMessage> = devtools_val(node, "messages")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|m| {
                    let direction = match json_str(m, "direction")
                        .unwrap_or_default()
                        .to_ascii_lowercase()
                        .as_str()
                    {
                        "sent" | "out" => Direction::Sent,
                        "received" | "in" => Direction::Received,
                        _ => Direction::Note,
                    };
                    SocketMessage {
                        direction,
                        text: json_str(m, "text").unwrap_or_default().into(),
                        at: parse_ts(json_str(m, "at").as_deref()),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let disabled = prop_bool(node, "disabled");
    let draft = keyed_text_input(
        eid,
        if disabled {
            "ws-draft-disabled"
        } else {
            "ws-draft"
        },
        "Send message...",
        "",
        false,
        window,
        cx,
    );
    if draft.read(cx).is_disabled() != disabled {
        draft.update(cx, |draft, cx| draft.set_disabled(disabled, cx));
    }
    let send_url = url.clone();
    let toggle_url = url.clone();
    let v1 = view.clone();
    let v2 = view.clone();
    let (nid1, nid2) = (node.id.clone(), node.id.clone());
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());

    let console = WebSocketConsole::new(
        gpui::ElementId::from(eid.clone()),
        url,
        state,
        messages,
        &draft,
        now,
        move |msg, _, cx| {
            if disabled {
                return;
            }
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "action": "send-socket", "text": msg.as_ref(), "url": send_url }),
                cx,
            );
        },
    );
    let toggle = Button::new(
        (gpui::ElementId::from(eid.clone()), "socket-toggle"),
        if state == SocketState::Open {
            "Disconnect"
        } else {
            "Connect"
        },
    )
    .variant(ButtonVariant::Secondary)
    .debug_selector(|| "socket-toggle".into())
    .disabled(disabled || state == SocketState::Opening)
    .on_click(move |_, _, cx| {
        let mut detail = json!({ "action": "toggle-socket", "url": toggle_url });
        if let Some(state) = &source_state {
            detail["state"] = json!(state);
        }
        emit_event(&v2, &nid2, &nt2, "ely:action", detail, cx);
    });
    v_stack()
        .gap_2()
        .child(toggle)
        .child(console)
        .into_any_element()
}

// ============================================================================
// documents
// ============================================================================

fn render_backlinks(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let links: Vec<Backlink> = node
        .props
        .get("links")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, item)| {
                    let page = json_str(item, "title")
                        .or_else(|| json_str(item, "page"))
                        .unwrap_or_else(|| format!("Page {}", ix + 1));
                    let before = json_str(item, "excerptBefore").unwrap_or_default();
                    let after = json_str(item, "excerptAfter").unwrap_or_default();
                    let context = if !before.is_empty() || !after.is_empty() {
                        format!("{before}{page}{after}")
                    } else {
                        json_str(item, "context").unwrap_or_else(|| page.clone())
                    };
                    let mention = if !before.is_empty() || !after.is_empty() {
                        let start = before.len();
                        let end = start + page.len();
                        if end <= context.len()
                            && context.is_char_boundary(start)
                            && context.is_char_boundary(end)
                        {
                            start..end
                        } else {
                            0..0
                        }
                    } else {
                        0..0
                    };
                    Backlink {
                        icon: json_str(item, "icon").unwrap_or_else(|| "↗".into()).into(),
                        page: page.into(),
                        context: context.into(),
                        mention,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    Backlinks::new(gpui::ElementId::from(eid.clone()), links)
        .on_open(move |ix, _, cx| {
            emit_event(&v, &nid, &ntype, "ely:action", json!(ix), cx);
        })
        .into_any_element()
}

fn render_block_editor(
    node: &ScreenNode,
    eid: &SharedString,
    window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    let blocks: Vec<BlockData> = node
        .props
        .get("blocks")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|b| {
                    let text = json_str(b, "text").unwrap_or_default();
                    let kind = match json_str(b, "type")
                        .unwrap_or_default()
                        .to_ascii_lowercase()
                        .as_str()
                    {
                        "heading" | "h1" => BlockKind::Heading(1),
                        "h2" => BlockKind::Heading(2),
                        "h3" => BlockKind::Heading(3),
                        "bullet" => BlockKind::Bullet,
                        "numbered" => BlockKind::Numbered,
                        "todo" => BlockKind::Todo(
                            b.get("checked").and_then(Value::as_bool).unwrap_or(false),
                        ),
                        "quote" => BlockKind::Quote,
                        "callout" => BlockKind::Callout,
                        "code" => BlockKind::Code,
                        "math" => BlockKind::Math,
                        "divider" => {
                            return BlockData::new(BlockKind::Divider, Vec::<String>::new());
                        }
                        _ => BlockKind::Paragraph,
                    };
                    BlockData::new(kind, [text])
                })
                .collect()
        })
        .filter(|bs: &Vec<BlockData>| !bs.is_empty())
        .unwrap_or_else(|| {
            let body = best_body(node).unwrap_or_default();
            if body.is_empty() {
                vec![BlockData::new(BlockKind::Paragraph, [""])]
            } else {
                BlockData::from_markdown(&body)
            }
        });

    let editor = window.use_keyed_state(
        SharedString::from(format!("{eid}-block-editor")),
        cx,
        |window, cx| BlockEditor::new(blocks, window, cx),
    );
    sized_box(280., editor)
}

fn extract_doc_pages(node: &ScreenNode) -> Vec<DocPage> {
    let pages: Vec<DocPage> = node
        .props
        .get("pages")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|p| DocPage {
                    source: json_str(p, "source")
                        .or_else(|| json_str(p, "imageURL"))
                        .unwrap_or_default()
                        .into(),
                    width: p
                        .get("width")
                        .and_then(value_to_f64)
                        .filter(|w| w.is_finite() && *w > 0.0)
                        .unwrap_or(612.0) as f32,
                    height: p
                        .get("height")
                        .and_then(value_to_f64)
                        .filter(|h| h.is_finite() && *h > 0.0)
                        .unwrap_or(792.0) as f32,
                })
                .collect()
        })
        .unwrap_or_default();
    if pages.is_empty() {
        vec![DocPage {
            source: "".into(),
            width: 612.0,
            height: 792.0,
        }]
    } else {
        pages
    }
}

fn render_documents_viewer(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let title = non_empty_or(
        &prop_str(node, "filename").unwrap_or_else(|| best_title(node)),
        "Document",
    );
    let pages = Rc::new(extract_doc_pages(node));
    let zoom = prop_f64(node, "zoom")
        .filter(|z| z.is_finite() && *z > 0.0)
        .unwrap_or(1.0) as f32;
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    sized_box(
        320.,
        DocumentViewer::new(gpui::ElementId::from(eid.clone()), title, pages)
            .thumbnails()
            .zoom(zoom, move |next, _, cx| {
                emit_event(&v, &sk, &ntype, "change", json!(next), cx);
            }),
    )
}

fn render_epub_reader(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let title = non_empty_or(
        &prop_str(node, "bookTitle").unwrap_or_else(|| best_title(node)),
        "Book",
    );
    let mut chapters: Vec<Chapter> = node
        .props
        .get("chapters")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, c)| Chapter {
                    title: json_str(c, "title")
                        .unwrap_or_else(|| format!("Chapter {}", ix + 1))
                        .into(),
                    markdown: json_str(c, "content")
                        .or_else(|| json_str(c, "markdown"))
                        .unwrap_or_default()
                        .into(),
                })
                .collect()
        })
        .unwrap_or_default();
    if chapters.is_empty() {
        chapters.push(Chapter {
            title: "Chapter 1".into(),
            markdown: best_body(node).unwrap_or_default().into(),
        });
    }
    sized_box(
        300.,
        EpubReader::new(gpui::ElementId::from(eid.clone()), title, chapters),
    )
}

fn render_footnote(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let number = node
        .props
        .get("number")
        .and_then(Value::as_u64)
        .unwrap_or(1)
        .max(1) as usize;
    let note = prop_str(node, "definition")
        .or_else(|| best_body(node))
        .or_else(|| {
            node.props
                .get("footnotes")
                .and_then(Value::as_array)
                .and_then(|arr| arr.first())
                .and_then(|f| json_str(f, "text"))
        })
        .unwrap_or_else(|| "Footnote".into());
    Footnote::new(gpui::ElementId::from(eid.clone()), number, note).into_any_element()
}

fn render_markdown_editor(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let initial = prop_str(node, "value")
        .or_else(|| best_body(node))
        .unwrap_or_default();
    let field = keyed_text_input(
        eid,
        "md-input",
        "Write markdown...",
        &initial,
        true,
        window,
        cx,
    );
    let mode_raw = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| prop_str(node, "markdownMode"))
        .unwrap_or_else(|| "split".into());
    let mode_state =
        window.use_keyed_state(SharedString::from(format!("{eid}-md-mode")), cx, |_, _| {
            match mode_raw.to_ascii_lowercase().as_str() {
                "visual" => MarkdownMode::Visual,
                "source" => MarkdownMode::Source,
                _ => MarkdownMode::Split,
            }
        });
    let mode = *mode_state.read(cx);
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    MarkdownEditor::new(gpui::ElementId::from(eid.clone()), &field, mode)
        .on_mode(move |next, _, cx| {
            mode_state.update(cx, |m, cx| {
                *m = next;
                cx.notify();
            });
            emit_event(&v, &sk, &ntype, "change", json!(format!("{next:?}")), cx);
        })
        .into_any_element()
}

fn render_markdown_renderer(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let src = prop_str(node, "value")
        .or_else(|| best_body(node))
        .unwrap_or_default();
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    MarkdownRenderer::new(gpui::ElementId::from(eid.clone()), src)
        .on_link(move |url, _, cx| {
            emit_event(&v, &nid, &ntype, "ely:action", json!(url), cx);
        })
        .into_any_element()
}

fn render_page_cover(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let src = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| prop_str(node, "imageURL"))
        .or_else(|| prop_str(node, "src"))
        .unwrap_or_default();
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    PageCover::new(gpui::ElementId::from(eid.clone()), src.clone())
        .choices([src], move |picked, _, cx| {
            emit_event(
                &v,
                &sk,
                &ntype,
                "change",
                json!(picked.map(|s| s.to_string())),
                cx,
            );
        })
        .into_any_element()
}

fn render_print_preview(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let pages = Rc::new(extract_doc_pages(node));
    let paper = match prop_str(node, "paper")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "a4" => Paper::A4,
        "legal" => Paper::Legal,
        _ => Paper::Letter,
    };
    let landscape = prop_str(node, "orientation")
        .map(|s| s.eq_ignore_ascii_case("landscape"))
        .unwrap_or_else(|| prop_bool(node, "landscape"));
    let copies = node
        .props
        .get("copies")
        .and_then(Value::as_u64)
        .unwrap_or(1)
        .clamp(1, 99) as u32;
    let settings_state = window.use_keyed_state(
        SharedString::from(format!("{eid}-print-settings")),
        cx,
        |_, _| PrintSettings {
            paper,
            landscape,
            margins: Margins::Normal,
            copies,
        },
    );
    let settings = *settings_state.read(cx);
    let (v1, v2, v3) = (view.clone(), view.clone(), view.clone());
    let sk = state_key.to_owned();
    let (nid2, nid3) = (node.id.clone(), node.id.clone());
    let (nt1, nt2, nt3) = (
        node.node_type.clone(),
        node.node_type.clone(),
        node.node_type.clone(),
    );
    let s_state = settings_state.clone();
    sized_box(
        320.,
        PrintPreview::new(
            gpui::ElementId::from(eid.clone()),
            pages,
            settings,
            move |next, _, cx| {
                s_state.update(cx, |s, cx| {
                    *s = next;
                    cx.notify();
                });
                emit_event(
                    &v1,
                    &sk,
                    &nt1,
                    "change",
                    json!({ "copies": next.copies }),
                    cx,
                );
            },
            move |final_s, _, cx| {
                emit_event(
                    &v2,
                    &nid2,
                    &nt2,
                    "ely:action",
                    json!({ "print": final_s.copies }),
                    cx,
                );
            },
            move |_, cx| {
                emit_event(&v3, &nid3, &nt3, "ely:action", json!("cancel"), cx);
            },
        ),
    )
}

fn render_rich_text_editor(
    node: &ScreenNode,
    eid: &SharedString,
    window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    let initial = best_body(node)
        .or_else(|| prop_str(node, "value"))
        .unwrap_or_default();
    let field = keyed_text_input(
        eid,
        "rich-input",
        "Write document...",
        &initial,
        true,
        window,
        cx,
    );
    RichTextEditor::new(gpui::ElementId::from(eid.clone()), &field).into_any_element()
}

fn render_template_picker(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut templates: Vec<Template> = node
        .props
        .get("templates")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, t)| Template {
                    name: json_str(t, "name")
                        .unwrap_or_else(|| format!("Template {}", ix + 1))
                        .into(),
                    icon: json_str(t, "icon").unwrap_or_else(|| "📄".into()).into(),
                    category: json_str(t, "category")
                        .unwrap_or_else(|| "General".into())
                        .into(),
                    description: json_str(t, "description").unwrap_or_default().into(),
                    markdown: json_str(t, "content")
                        .or_else(|| json_str(t, "markdown"))
                        .unwrap_or_default()
                        .into(),
                })
                .collect()
        })
        .unwrap_or_default();
    if templates.is_empty() {
        templates.push(Template {
            name: "Blank".into(),
            icon: "📄".into(),
            category: "General".into(),
            description: "Empty document".into(),
            markdown: "# Untitled\n".into(),
        });
    }
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    sized_box(
        300.,
        TemplatePicker::new(gpui::ElementId::from(eid.clone()), templates).on_use(
            move |ix, _, cx| {
                emit_event(&v, &nid, &ntype, "ely:action", json!(ix), cx);
            },
        ),
    )
}

fn render_todo_item(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    if let Some(todos) = node.props.get("todos").and_then(Value::as_array)
        && !todos.is_empty()
    {
        let mut list = v_stack().gap_1();
        for (ix, item) in todos.iter().enumerate() {
            let label = json_str(item, "text")
                .or_else(|| json_str(item, "label"))
                .unwrap_or_else(|| format!("Todo {}", ix + 1));
            let tid = json_str(item, "id").unwrap_or_else(|| format!("{state_key}-{ix}"));
            let done = view_state
                .value(&tid)
                .and_then(Value::as_bool)
                .unwrap_or_else(|| {
                    item.get("checked")
                        .and_then(Value::as_bool)
                        .unwrap_or(false)
                });
            let v = view.clone();
            let ntype = node.node_type.clone();
            list = list.child(
                TodoItem::new(SharedString::from(format!("{eid}-todo-{ix}")), label, done)
                    .on_toggle(move |next, _, cx| {
                        emit_event(&v, &tid, &ntype, "change", json!(next), cx);
                    }),
            );
        }
        return list.into_any_element();
    }
    let label = non_empty_or(&best_label(node), "To-do item");
    let done = view_state.current_bool(state_key, node);
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    TodoItem::new(gpui::ElementId::from(eid.clone()), label, done)
        .on_toggle(move |next, _, cx| {
            emit_event(&v, &sk, &ntype, "change", json!(next), cx);
        })
        .into_any_element()
}

fn render_trash_bin(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let pages: Vec<Trashed> = node
        .props
        .get("deleted")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, item)| {
                    let path = json_str(item, "path").unwrap_or_else(|| format!("page-{ix}.md"));
                    let title = path.rsplit('/').next().unwrap_or(&path).to_owned();
                    Trashed {
                        key: json_str(item, "id")
                            .unwrap_or_else(|| format!("trash-{ix}"))
                            .into(),
                        icon: "📄".into(),
                        title: title.into(),
                        place: path.into(),
                        deleted: parse_ts(json_str(item, "deletedAt").as_deref()),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let (v1, v2, v3) = (view.clone(), view.clone(), view.clone());
    let (nid1, nid2, nid3) = (node.id.clone(), node.id.clone(), node.id.clone());
    let (nt1, nt2, nt3) = (
        node.node_type.clone(),
        node.node_type.clone(),
        node.node_type.clone(),
    );
    TrashBin::new(gpui::ElementId::from(eid.clone()), pages)
        .on_restore(move |k, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "restore": k.as_ref() }),
                cx,
            );
        })
        .on_delete(move |k, _, cx| {
            emit_event(
                &v2,
                &nid2,
                &nt2,
                "ely:action",
                json!({ "delete": k.as_ref() }),
                cx,
            );
        })
        .on_empty(move |_, cx| {
            emit_event(&v3, &nid3, &nt3, "ely:action", json!("empty"), cx);
        })
        .into_any_element()
}

fn render_version_history(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut versions: Vec<Version> = node
        .props
        .get("revisions")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, r)| {
                    let ts_raw = json_str(r, "time")
                        .map(|t| t.replace(' ', "T") + if t.ends_with('Z') { "" } else { ":00Z" });
                    Version {
                        at: parse_ts(ts_raw.as_deref()),
                        author: json_str(r, "author")
                            .unwrap_or_else(|| format!("Author {}", ix + 1))
                            .into(),
                        markdown: json_str(r, "content")
                            .or_else(|| json_str(r, "summary"))
                            .unwrap_or_default()
                            .into(),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    // VersionHistory::new asserts versions are ordered newest-first.
    versions.sort_by(|a, b| b.at.cmp(&a.at));
    let selected = view_state
        .value(state_key)
        .and_then(Value::as_u64)
        .or_else(|| node.props.get("selectedRevision").and_then(Value::as_u64))
        .unwrap_or(0) as usize;
    let selected = selected.min(versions.len().saturating_sub(1));
    let (v1, v2) = (view.clone(), view.clone());
    let sk = state_key.to_owned();
    let nid = node.id.clone();
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    sized_box(
        300.,
        VersionHistory::new(gpui::ElementId::from(eid.clone()), versions, selected)
            .on_select(move |ix, _, cx| {
                emit_event(&v1, &sk, &nt1, "change", json!(ix), cx);
            })
            .on_restore(move |ix, _, cx| {
                emit_event(&v2, &nid, &nt2, "ely:action", json!({ "restore": ix }), cx);
            }),
    )
}

// ============================================================================
// editor
// ============================================================================

fn render_code_action_menu(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let actions: Vec<CodeAction> = node
        .props
        .get("codeActions")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, a)| {
                    let cmd = json_str(a, "command")
                        .unwrap_or_default()
                        .to_ascii_lowercase();
                    let kind = if cmd.contains("refactor") {
                        ActionKind::Refactor
                    } else if cmd.contains("source") {
                        ActionKind::Source
                    } else {
                        ActionKind::QuickFix
                    };
                    let mut act = CodeAction::new(
                        json_str(a, "label").unwrap_or_else(|| format!("Action {}", ix + 1)),
                        kind,
                    );
                    if ix == 0 {
                        act = act.preferred();
                    }
                    act
                })
                .collect()
        })
        .unwrap_or_default();
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    CodeActionMenu::new(gpui::ElementId::from(eid.clone()), actions)
        .on_pick(move |ix, _, cx| {
            emit_event(&v, &nid, &ntype, "ely:action", json!(ix), cx);
        })
        .into_any_element()
}

fn render_code_editor(
    node: &ScreenNode,
    eid: &SharedString,
    window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    let text = node
        .props
        .get("lines")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|line| {
                    if let Some(t) = json_str(line, "text") {
                        t
                    } else if let Some(spans) = line.get("spans").and_then(Value::as_array) {
                        spans
                            .iter()
                            .filter_map(|s| json_str(s, "text"))
                            .collect::<String>()
                    } else {
                        String::new()
                    }
                })
                .collect::<Vec<_>>()
                .join("\n")
        })
        .filter(|s| !s.is_empty())
        .or_else(|| prop_str(node, "value"))
        .unwrap_or_default();
    let lang = prop_str(node, "language").unwrap_or_else(|| "Rust".into());
    let minimap = prop_bool(node, "minimap");
    let readonly = prop_bool(node, "readonly");
    let editor = window.use_keyed_state(
        SharedString::from(format!("{eid}-code-editor")),
        cx,
        |window, cx| {
            let mut ed = CodeEditor::new(text, window, cx).language(lang);
            if minimap {
                ed = ed.minimap();
            }
            if readonly {
                ed = ed.read_only();
            }
            ed
        },
    );
    sized_box(280., editor)
}

fn render_completion_menu(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let items: Vec<CompletionItem> = node
        .props
        .get("candidates")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, c)| {
                    let mut item = CompletionItem::new(
                        json_str(c, "label").unwrap_or_else(|| format!("item_{ix}")),
                        SymbolKind::Function,
                    );
                    if let Some(detail) = json_str(c, "detail") {
                        item = item.detail(detail);
                    }
                    if let Some(docs) = json_str(c, "documentation") {
                        item = item.docs(docs);
                    }
                    item
                })
                .collect()
        })
        .unwrap_or_default();
    let typed = prop_str(node, "value").unwrap_or_default();
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    CompletionMenu::new(gpui::ElementId::from(eid.clone()), items)
        .typed(typed)
        .on_pick(move |item, _, cx| {
            emit_event(
                &v,
                &nid,
                &ntype,
                "ely:action",
                json!(item.label.as_ref()),
                cx,
            );
        })
        .into_any_element()
}

fn render_cursor_position(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let (mut line, mut col) = (
        node.props.get("line").and_then(Value::as_u64).unwrap_or(1) as usize,
        node.props
            .get("column")
            .and_then(Value::as_u64)
            .unwrap_or(1) as usize,
    );
    if let Some(cursor) = prop_str(node, "cursor") {
        let nums: Vec<usize> = cursor
            .split(|c: char| !c.is_ascii_digit())
            .filter(|p| !p.is_empty())
            .filter_map(|p| p.parse::<usize>().ok())
            .collect();
        if let Some(&l) = nums.first() {
            line = l;
        }
        if let Some(&c) = nums.get(1) {
            col = c;
        }
    }
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    CursorPosition::new(gpui::ElementId::from(eid.clone()), line.max(1), col.max(1))
        .on_click(move |_, cx| {
            emit_event(&v, &nid, &ntype, "click", json!("cursor"), cx);
        })
        .into_any_element()
}

fn render_debug_console(
    node: &ScreenNode,
    eid: &SharedString,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let entries: Vec<ConsoleEntry> = node
        .props
        .get("consoleEntries")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|e| {
                    let text = json_str(e, "text").unwrap_or_default();
                    match json_str(e, "kind")
                        .unwrap_or_default()
                        .to_ascii_lowercase()
                        .as_str()
                    {
                        "input" => ConsoleEntry::Input(text.into()),
                        "value" => ConsoleEntry::Value(
                            text.into(),
                            json_str(e, "type").unwrap_or_default().into(),
                        ),
                        "error" => ConsoleEntry::Error(text.into()),
                        _ => ConsoleEntry::Output(text.into()),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let expr = prop_str(node, "expression").unwrap_or_default();
    let field = keyed_text_input(
        eid,
        "console-in",
        "Evaluate expression...",
        &expr,
        false,
        window,
        cx,
    );
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    sized_box(
        240.,
        DebugConsole::new(gpui::ElementId::from(eid.clone()), &field, entries).on_eval(
            move |cmd, _, cx| {
                emit_event(&v, &nid, &ntype, "ely:action", json!(cmd.as_ref()), cx);
            },
        ),
    )
}

fn render_find_widget(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let query = prop_str(node, "query").unwrap_or_default();
    let find_field = keyed_text_input(eid, "find-in", "Find...", &query, false, window, cx);
    let total = node
        .props
        .get("lines")
        .and_then(Value::as_array)
        .map(|arr| arr.len())
        .unwrap_or(0);
    let current = (total > 0).then_some(0);
    let opts_state = window.use_keyed_state(
        SharedString::from(format!("{eid}-find-opts")),
        cx,
        |_, _| FindOptions::default(),
    );
    let opts = *opts_state.read(cx);
    let (v1, v2) = (view.clone(), view.clone());
    let sk = state_key.to_owned();
    let nid = node.id.clone();
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    FindWidget::new(
        gpui::ElementId::from(eid.clone()),
        &find_field,
        current,
        total,
    )
    .options(opts)
    .on_options(move |next, _, cx| {
        opts_state.update(cx, |o, cx| {
            *o = next;
            cx.notify();
        });
        emit_event(
            &v1,
            &sk,
            &nt1,
            "change",
            json!({ "case": next.case, "word": next.word, "regex": next.regex }),
            cx,
        );
    })
    .on_step(move |forward, _, cx| {
        emit_event(
            &v2,
            &nid,
            &nt2,
            "ely:action",
            json!({ "forward": forward }),
            cx,
        );
    })
    .into_any_element()
}

fn render_problems_panel(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let problems: Vec<Problem> = node
        .props
        .get("problems")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|p| Problem {
                    path: json_str(p, "file")
                        .or_else(|| json_str(p, "path"))
                        .unwrap_or_else(|| "src/main.rs".into())
                        .into(),
                    line: p.get("line").and_then(Value::as_u64).unwrap_or(1).max(1) as usize,
                    column: p.get("column").and_then(Value::as_u64).unwrap_or(1).max(1) as usize,
                    severity: parse_severity(json_str(p, "severity").as_deref()),
                    message: json_str(p, "message").unwrap_or_default().into(),
                    source: json_str(p, "source").map(Into::into),
                })
                .collect()
        })
        .unwrap_or_default();
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    ProblemsPanel::new(gpui::ElementId::from(eid.clone()), problems)
        .on_open(move |p, _, cx| {
            emit_event(
                &v,
                &nid,
                &ntype,
                "ely:action",
                json!({ "path": p.path.as_ref(), "line": p.line }),
                cx,
            );
        })
        .into_any_element()
}

fn render_search_panel(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let files: Vec<FileHits> = node
        .props
        .get("items")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, item)| FileHits {
                    path: json_str(item, "path")
                        .or_else(|| json_str(item, "label"))
                        .unwrap_or_else(|| format!("file_{ix}"))
                        .into(),
                    hits: vec![Hit {
                        line: item.get("line").and_then(Value::as_u64).unwrap_or(1).max(1) as usize,
                        text: json_str(item, "detail")
                            .or_else(|| json_str(item, "text"))
                            .unwrap_or_default()
                            .into(),
                        ranges: Vec::new(),
                    }],
                })
                .collect()
        })
        .unwrap_or_default();
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    SearchPanel::new(gpui::ElementId::from(eid.clone()), files)
        .on_open(move |path, line, _, cx| {
            emit_event(
                &v,
                &nid,
                &ntype,
                "ely:action",
                json!({ "path": path.as_ref(), "line": line }),
                cx,
            );
        })
        .into_any_element()
}

fn render_settings_editor(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut groups: Vec<(SharedString, Vec<Setting>)> = node
        .props
        .get("groups")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(gix, g)| {
                    let title =
                        json_str(g, "label").unwrap_or_else(|| format!("Group {}", gix + 1));
                    let settings = g
                        .get("settings")
                        .and_then(Value::as_array)
                        .map(|ss| {
                            ss.iter()
                                .enumerate()
                                .map(|(six, s)| {
                                    let key = json_str(s, "key")
                                        .unwrap_or_else(|| format!("setting_{gix}_{six}"));
                                    let label = json_str(s, "label").unwrap_or_else(|| key.clone());
                                    let desc = json_str(s, "description").unwrap_or_default();
                                    let kind = json_str(s, "type")
                                        .unwrap_or_default()
                                        .to_ascii_lowercase();
                                    let val = if kind == "number"
                                        || s.get("value").and_then(value_to_f64).is_some()
                                    {
                                        let min = s
                                            .get("min")
                                            .and_then(value_to_f64)
                                            .filter(|f| f.is_finite())
                                            .unwrap_or(0.0);
                                        let raw_max = s
                                            .get("max")
                                            .and_then(value_to_f64)
                                            .filter(|f| f.is_finite())
                                            .unwrap_or(100.0);
                                        let max = if raw_max > min { raw_max } else { min + 1.0 };
                                        let step = s
                                            .get("step")
                                            .and_then(value_to_f64)
                                            .filter(|f| f.is_finite() && *f > 0.0)
                                            .unwrap_or(1.0);
                                        let num = s
                                            .get("value")
                                            .and_then(value_to_f64)
                                            .filter(|f| f.is_finite())
                                            .unwrap_or(min)
                                            .clamp(min, max);
                                        SettingValue::Number {
                                            value: num,
                                            min,
                                            max,
                                            step,
                                        }
                                    } else if let Some(b) = s.get("value").and_then(Value::as_bool)
                                    {
                                        SettingValue::Bool(b)
                                    } else {
                                        let cur = json_str(s, "value")
                                            .unwrap_or_else(|| "default".into());
                                        let mut choices: Vec<SharedString> = s
                                            .get("options")
                                            .and_then(Value::as_array)
                                            .map(|opts| {
                                                opts.iter()
                                                    .filter_map(|o| {
                                                        o.as_str()
                                                            .map(ToOwned::to_owned)
                                                            .or_else(|| json_str(o, "value"))
                                                    })
                                                    .map(Into::into)
                                                    .collect()
                                            })
                                            .unwrap_or_default();
                                        if choices.is_empty() {
                                            choices.push(cur.clone().into());
                                        }
                                        SettingValue::Choice {
                                            value: cur.into(),
                                            choices,
                                        }
                                    };
                                    Setting {
                                        key: key.into(),
                                        title: label.into(),
                                        description: desc.into(),
                                        default: val.clone(),
                                        value: val,
                                    }
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    (title.into(), settings)
                })
                .collect()
        })
        .unwrap_or_default();
    if groups.is_empty() {
        groups.push(("General".into(), Vec::new()));
    }

    let section_state =
        window.use_keyed_state(SharedString::from(format!("{eid}-section")), cx, |_, _| {
            0usize
        });
    let section = *section_state.read(cx);
    let v1 = view.clone();
    let sk = state_key.to_owned();
    let nt = node.node_type.clone();
    SettingsEditor::new(gpui::ElementId::from(eid.clone()), groups)
        .section(section)
        .on_section(move |ix, _, cx| {
            section_state.update(cx, |s, cx| {
                *s = ix;
                cx.notify();
            });
        })
        .on_change(move |k, val, _, cx| {
            emit_event(
                &v1,
                &sk,
                &nt,
                "change",
                json!({ "key": k.as_ref(), "value": format!("{val:?}") }),
                cx,
            );
        })
        .into_any_element()
}

fn render_welcome_page(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let title = prop_str(node, "welcomeTitle")
        .unwrap_or_else(|| non_empty_or(&best_title(node), "Workspace"));
    let tagline = prop_str(node, "welcomeSubtitle")
        .or_else(|| best_body(node))
        .unwrap_or_else(|| "Open a project or start a file.".into());
    let projects: Vec<Project> = node
        .props
        .get("projects")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, p)| Project {
                    name: json_str(p, "name")
                        .unwrap_or_else(|| format!("Project {}", ix + 1))
                        .into(),
                    path: json_str(p, "path")
                        .unwrap_or_else(|| "~/workspace".into())
                        .into(),
                    branch: json_str(p, "branch").map(Into::into),
                    opened: json_str(p, "opened")
                        .unwrap_or_else(|| "recently".into())
                        .into(),
                    pinned: p.get("pinned").and_then(Value::as_bool).unwrap_or(false),
                })
                .collect()
        })
        .unwrap_or_default();
    let show = view_state
        .value(state_key)
        .and_then(Value::as_bool)
        .unwrap_or_else(|| {
            node.props
                .get("showAtStart")
                .and_then(Value::as_bool)
                .unwrap_or(true)
        });

    let v1 = view.clone();
    let v2 = view.clone();
    let v3 = view.clone();
    let (nid1, nid2) = (node.id.clone(), node.id.clone());
    let sk = state_key.to_owned();
    let (nt1, nt2, nt3) = (
        node.node_type.clone(),
        node.node_type.clone(),
        node.node_type.clone(),
    );

    let recent = RecentProjects::new(SharedString::from(format!("{eid}-recent")), projects)
        .on_open(move |ix, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "openProject": ix }),
                cx,
            );
        });

    let mut page = WelcomePage::new(gpui::ElementId::from(eid.clone()), title, tagline)
        .action(IconName::FilePlus, "New file", Some("cmd-n"))
        .action(IconName::FolderOpen, "Open folder", Some("cmd-o"))
        .recent(recent)
        .show_at_start(show)
        .on_action(move |ix, _, cx| {
            emit_event(&v2, &nid2, &nt2, "ely:action", json!({ "action": ix }), cx);
        })
        .on_show(move |next, _, cx| {
            emit_event(&v3, &sk, &nt3, "change", json!(next), cx);
        });
    if let Some(tasks) = node.props.get("tasks").and_then(Value::as_array) {
        for t in tasks.iter().take(2) {
            if let Some(lbl) = json_str(t, "label") {
                page = page.action(IconName::Play, lbl, None);
            }
        }
    }
    page.into_any_element()
}

// ============================================================================
// files
// ============================================================================

fn parse_dir_entry(item: &Value, ix: usize) -> DirEntry {
    let name = json_str(item, "name").unwrap_or_else(|| format!("entry_{ix}"));
    let ts = parse_ts(json_str(item, "modified").as_deref());
    if item.get("folder").and_then(Value::as_bool) == Some(true) {
        DirEntry::folder(name, ts)
    } else {
        let size = item
            .get("bytes")
            .and_then(Value::as_u64)
            .unwrap_or_else(|| parse_human_bytes(item.get("size")));
        DirEntry::file(name, size, ts)
    }
}

fn parse_transfer(item: &Value, ix: usize, force_download: bool) -> Transfer {
    let key = json_str(item, "id")
        .or_else(|| json_str(item, "key"))
        .unwrap_or_else(|| format!("tr-{ix}"));
    let name = json_str(item, "name").unwrap_or_else(|| key.clone());
    let moved = item.get("moved").and_then(Value::as_u64).unwrap_or(0);
    let total = item.get("total").and_then(Value::as_u64).unwrap_or(moved);
    let rate = item.get("rate").and_then(Value::as_u64).unwrap_or(0);
    let state = match json_str(item, "state")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "moving" | "active" | "running" => TransferState::Moving { rate },
        "paused" => TransferState::Paused,
        "done" | "completed" => TransferState::Done,
        "failed" | "error" => TransferState::Failed(
            json_str(item, "error")
                .unwrap_or_else(|| "Transfer failed".into())
                .into(),
        ),
        _ => TransferState::Queued,
    };
    Transfer {
        key: key.into(),
        name: name.into(),
        upload: if force_download {
            false
        } else {
            item.get("upload").and_then(Value::as_bool).unwrap_or(false)
        },
        moved,
        total,
        state,
    }
}

fn render_archive_viewer(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let name = prop_str(node, "archiveName")
        .unwrap_or_else(|| non_empty_or(&best_title(node), "archive.zip"));
    let mut seen = HashSet::new();
    let entries: Vec<ArchiveEntry> = node
        .props
        .get("archiveEntries")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, e)| {
                    let path = json_str(e, "path").unwrap_or_else(|| format!("file_{ix}"));
                    if !seen.insert(path.clone()) {
                        return None;
                    }
                    Some(ArchiveEntry {
                        path: path.into(),
                        size: e.get("size").and_then(Value::as_u64).unwrap_or(0),
                        packed: e.get("packed").and_then(Value::as_u64).unwrap_or(0),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    sized_box(
        260.,
        ArchiveViewer::new(gpui::ElementId::from(eid.clone()), name, entries).on_open(
            move |entry, _, cx| {
                emit_event(
                    &v,
                    &nid,
                    &ntype,
                    "ely:action",
                    json!(entry.path.as_ref()),
                    cx,
                );
            },
        ),
    )
}

fn render_download_manager(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut seen = HashSet::new();
    let downloads: Vec<Transfer> = node
        .props
        .get("transfers")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, t)| {
                    let tr = parse_transfer(t, ix, true);
                    seen.insert(tr.key.to_string()).then_some(tr)
                })
                .collect()
        })
        .unwrap_or_default();
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    DownloadManager::new(gpui::ElementId::from(eid.clone()), downloads)
        .on_clear(move |_, cx| {
            emit_event(&v, &nid, &ntype, "ely:action", json!("clear"), cx);
        })
        .into_any_element()
}

fn render_duplicate_finder(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut marked: Vec<SharedString> = Vec::new();
    let groups: Vec<Duplicates> = node
        .props
        .get("duplicateSets")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, g)| {
                    let mut seen = HashSet::new();
                    let paths: Vec<SharedString> = g
                        .get("paths")
                        .and_then(Value::as_array)
                        .map(|ps| {
                            ps.iter()
                                .filter_map(|p| {
                                    let path = p
                                        .as_str()
                                        .map(ToOwned::to_owned)
                                        .or_else(|| json_str(p, "path"))?;
                                    if !seen.insert(path.clone()) {
                                        return None;
                                    }
                                    if p.get("marked").and_then(Value::as_bool) == Some(true) {
                                        marked.push(path.clone().into());
                                    }
                                    Some(path.into())
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    if paths.len() < 2 {
                        return None;
                    }
                    Some(Duplicates {
                        name: json_str(g, "name")
                            .unwrap_or_else(|| format!("group_{ix}"))
                            .into(),
                        size: g.get("bytes").and_then(Value::as_u64).unwrap_or(0),
                        paths,
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let (v1, v2) = (view.clone(), view.clone());
    let (nid1, nid2) = (node.id.clone(), node.id.clone());
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    DuplicateFinder::new(gpui::ElementId::from(eid.clone()), groups)
        .marked(marked)
        .on_mark(move |path, on, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "path": path.as_ref(), "marked": on }),
                cx,
            );
        })
        .on_remove(move |paths, _, cx| {
            let list: Vec<&str> = paths.iter().map(|p| p.as_ref()).collect();
            emit_event(
                &v2,
                &nid2,
                &nt2,
                "ely:action",
                json!({ "remove": list }),
                cx,
            );
        })
        .into_any_element()
}

fn render_files_favorites(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let pages: Vec<Favorite> = node
        .props
        .get("pins")
        .or_else(|| node.props.get("items"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, p)| Favorite {
                    key: json_str(p, "key")
                        .unwrap_or_else(|| format!("fav-{ix}"))
                        .into(),
                    icon: json_str(p, "icon").unwrap_or_else(|| "📁".into()).into(),
                    title: json_str(p, "title")
                        .or_else(|| json_str(p, "label"))
                        .unwrap_or_else(|| format!("Item {}", ix + 1))
                        .into(),
                })
                .collect()
        })
        .unwrap_or_default();
    let (v1, v2) = (view.clone(), view.clone());
    let (nid1, nid2) = (node.id.clone(), node.id.clone());
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    Favorites::new(gpui::ElementId::from(eid.clone()), pages)
        .on_open(move |k, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "open": k.as_ref() }),
                cx,
            );
        })
        .on_unpin(move |k, _, cx| {
            emit_event(
                &v2,
                &nid2,
                &nt2,
                "ely:action",
                json!({ "unpin": k.as_ref() }),
                cx,
            );
        })
        .into_any_element()
}

fn render_file_explorer(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut path_segments: Vec<(String, String)> = node
        .props
        .get("breadcrumbs")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, b)| {
                    let lbl = json_str(b, "label").unwrap_or_else(|| format!("Folder {ix}"));
                    let val = json_str(b, "value").unwrap_or_else(|| lbl.clone());
                    (lbl, val)
                })
                .collect()
        })
        .unwrap_or_default();
    if path_segments.is_empty() {
        let raw_path = prop_str(node, "path").unwrap_or_else(|| "Home".into());
        let mut acc = String::new();
        for seg in raw_path.split('/').filter(|s| !s.is_empty()) {
            if !acc.is_empty() {
                acc.push('/');
            }
            acc.push_str(seg);
            path_segments.push((seg.to_owned(), acc.clone()));
        }
    }
    if path_segments.is_empty() {
        path_segments.push(("Home".into(), "Home".into()));
    }

    let raw_levels = node.props.get("levels").and_then(Value::as_array);
    let dir_entries: Vec<DirEntry> = node
        .props
        .get("directoryEntries")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, e)| parse_dir_entry(e, ix))
                .collect()
        })
        .unwrap_or_default();

    let mut levels: Vec<Vec<DirEntry>> = Vec::with_capacity(path_segments.len());
    for (ix, (name, full_path)) in path_segments.iter().enumerate() {
        let matched = raw_levels
            .and_then(|lvls| {
                lvls.iter()
                    .find(|l| {
                        json_str(l, "path").as_deref() == Some(full_path.as_str())
                            || json_str(l, "name").as_deref() == Some(name.as_str())
                    })
                    .and_then(|l| l.get("entries"))
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .enumerate()
                            .map(|(eix, e)| parse_dir_entry(e, eix))
                            .collect::<Vec<_>>()
                    })
            })
            .unwrap_or_else(|| {
                if ix + 1 == path_segments.len() {
                    dir_entries.clone()
                } else {
                    Vec::new()
                }
            });
        levels.push(matched);
    }
    let path_names: Vec<String> = path_segments.into_iter().map(|(n, _)| n).collect();
    let view_mode = match prop_str(node, "fileView")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "icons" | "grid" => FileView::Icons,
        "columns" => FileView::Columns,
        _ => FileView::List,
    };

    let mut explorer = FileExplorer::new(
        gpui::ElementId::from(eid.clone()),
        path_names,
        levels,
        view_mode,
    );
    if let Some(sel) = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| prop_str(node, "selected"))
        .filter(|s| !s.is_empty())
    {
        explorer = explorer.selected(sel);
    }
    let (v1, v2) = (view.clone(), view.clone());
    let sk = state_key.to_owned();
    let nid = node.id.clone();
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    sized_box(
        300.,
        explorer
            .on_select(move |name, _, cx| {
                emit_event(&v1, &sk, &nt1, "change", json!(name.as_ref()), cx);
            })
            .on_open(move |entry, _, cx| {
                emit_event(
                    &v2,
                    &nid,
                    &nt2,
                    "ely:action",
                    json!(entry.name().as_ref()),
                    cx,
                );
            }),
    )
}

fn render_file_grid(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut seen = HashSet::new();
    let entries: Vec<DirEntry> = node
        .props
        .get("files")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, item)| {
                    let entry = parse_dir_entry(item, ix);
                    seen.insert(entry.name().to_string()).then_some(entry)
                })
                .collect()
        })
        .unwrap_or_default();
    let mut grid = FileGrid::new(gpui::ElementId::from(eid.clone()), entries);
    if let Some(sel) = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| prop_str(node, "selected"))
        .filter(|s| !s.is_empty())
    {
        grid = grid.selected(sel);
    }
    let (v1, v2) = (view.clone(), view.clone());
    let sk = state_key.to_owned();
    let nid = node.id.clone();
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    sized_box(
        280.,
        grid.on_select(move |name, _, cx| {
            emit_event(&v1, &sk, &nt1, "change", json!(name.as_ref()), cx);
        })
        .on_open(move |entry, _, cx| {
            emit_event(
                &v2,
                &nid,
                &nt2,
                "ely:action",
                json!(entry.name().as_ref()),
                cx,
            );
        }),
    )
}

fn render_file_icon(node: &ScreenNode) -> AnyElement {
    if let Some(files) = node.props.get("files").and_then(Value::as_array)
        && !files.is_empty()
    {
        let mut row = h_stack().flex_wrap().gap_3();
        for f in files {
            let icon = if f.get("folder").and_then(Value::as_bool) == Some(true) {
                FileIcon::folder(f.get("open").and_then(Value::as_bool) == Some(true))
            } else {
                FileIcon::file(json_str(f, "name").unwrap_or_else(|| "file.txt".into()))
            };
            row = row.child(icon);
        }
        return row.into_any_element();
    }
    if prop_bool(node, "folder") {
        FileIcon::folder(prop_bool(node, "open")).into_any_element()
    } else {
        FileIcon::file(non_empty_or(&best_label(node), "file.txt")).into_any_element()
    }
}

fn render_file_item(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    if let Some(files) = node.props.get("files").and_then(Value::as_array)
        && !files.is_empty()
    {
        let mut list = v_stack().gap_1();
        for (ix, f) in files.iter().enumerate() {
            list = list.child(FileItem::new(
                SharedString::from(format!("{eid}-fi-{ix}")),
                parse_dir_entry(f, ix),
            ));
        }
        return list.into_any_element();
    }
    let name = non_empty_or(&best_label(node), "Document.md");
    let entry = if prop_bool(node, "folder") {
        DirEntry::folder(name, Timestamp::UNIX_EPOCH)
    } else {
        DirEntry::file(name, 1024, Timestamp::UNIX_EPOCH)
    };
    FileItem::new(gpui::ElementId::from(eid.clone()), entry).into_any_element()
}

fn render_file_operation_progress(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let ops = node.props.get("operations").and_then(Value::as_array);
    let mut list = v_stack().gap_2();
    if let Some(arr) = ops
        && !arr.is_empty()
    {
        for (ix, op_val) in arr.iter().enumerate() {
            let tr = parse_transfer(op_val, ix, false);
            let kind = if json_str(op_val, "operation")
                .unwrap_or_default()
                .eq_ignore_ascii_case("move")
            {
                FileOperation::Move
            } else {
                FileOperation::Copy
            };
            let items = op_val
                .get("count")
                .and_then(Value::as_u64)
                .unwrap_or(1)
                .max(1) as usize;
            let to = json_str(op_val, "to").unwrap_or_else(|| "Destination".into());
            let mut w = FileOperationProgress::new(
                SharedString::from(format!("{eid}-fop-{ix}")),
                kind,
                items,
                to,
                (tr.moved, tr.total),
                tr.state,
            );
            if let Some(cur) = json_str(op_val, "current") {
                w = w.current(cur);
            }
            let (v1, v2, v3) = (view.clone(), view.clone(), view.clone());
            let (nid1, nid2, nid3) = (node.id.clone(), node.id.clone(), node.id.clone());
            let (nt1, nt2, nt3) = (
                node.node_type.clone(),
                node.node_type.clone(),
                node.node_type.clone(),
            );
            w = w
                .on_pause(move |_, cx| {
                    emit_event(&v1, &nid1, &nt1, "ely:action", json!({ "pause": ix }), cx);
                })
                .on_resume(move |_, cx| {
                    emit_event(&v2, &nid2, &nt2, "ely:action", json!({ "resume": ix }), cx);
                })
                .on_cancel(move |_, cx| {
                    emit_event(&v3, &nid3, &nt3, "ely:action", json!({ "cancel": ix }), cx);
                });
            list = list.child(w);
        }
        return list.into_any_element();
    }
    FileOperationProgress::new(
        gpui::ElementId::from(eid.clone()),
        FileOperation::Copy,
        1,
        "Destination",
        (0, 100),
        TransferState::Queued,
    )
    .into_any_element()
}

fn render_file_preview(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let first = node
        .props
        .get("files")
        .and_then(Value::as_array)
        .and_then(|arr| arr.first());
    let entry = first.map(|f| parse_dir_entry(f, 0)).unwrap_or_else(|| {
        DirEntry::file(
            non_empty_or(&best_label(node), "Preview.txt"),
            1024,
            Timestamp::UNIX_EPOCH,
        )
    });
    let mut preview = FilePreview::new(gpui::ElementId::from(eid.clone()), entry);
    if let Some(f) = first {
        if let Some(img_url) = json_str(f, "imageURL").filter(|s| !s.is_empty()) {
            let ratio = f
                .get("ratio")
                .and_then(value_to_f64)
                .filter(|r| r.is_finite() && *r > 0.0)
                .unwrap_or(1.5) as f32;
            preview = preview.picture(image_source(&img_url), ratio);
        } else if let Some(text) = json_str(f, "content") {
            preview = preview.text(text);
        }
    } else if let Some(body) = best_body(node) {
        preview = preview.text(body);
    }
    preview.into_any_element()
}

fn render_file_search(
    node: &ScreenNode,
    eid: &SharedString,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let q = prop_str(node, "query").unwrap_or_default();
    let query = keyed_text_input(eid, "file-search", "Search files...", &q, false, window, cx);
    let mut seen = HashSet::new();
    let found: Vec<FoundFile> = node
        .props
        .get("foundFiles")
        .or_else(|| node.props.get("files"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, f)| {
                    let name = json_str(f, "name").unwrap_or_else(|| format!("file_{ix}"));
                    let folder = json_str(f, "folder").unwrap_or_else(|| ".".into());
                    let place = format!("{folder}/{name}");
                    seen.insert(place).then_some(FoundFile {
                        name: name.into(),
                        folder: folder.into(),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    FileSearch::new(gpui::ElementId::from(eid.clone()), &query, found)
        .on_open(move |file, _, cx| {
            emit_event(
                &v,
                &nid,
                &ntype,
                "ely:action",
                json!({ "name": file.name.as_ref(), "folder": file.folder.as_ref() }),
                cx,
            );
        })
        .into_any_element()
}

fn render_hex_viewer(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let bytes: Vec<u8> = node
        .props
        .get("bytes")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|b| b.as_u64().map(|n| (n & 0xff) as u8))
                .collect()
        })
        .filter(|bs: &Vec<u8>| !bs.is_empty())
        .unwrap_or_else(|| b"ELF\x00hex-viewer-sample".to_vec());
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    sized_box(
        260.,
        HexViewer::new(gpui::ElementId::from(eid.clone()), Rc::new(bytes)).on_select(
            move |offset, _, cx| {
                emit_event(&v, &sk, &ntype, "change", json!(offset), cx);
            },
        ),
    )
}

fn render_recent_files(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut seen = HashSet::new();
    let files: Vec<RecentFile> = node
        .props
        .get("files")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, f)| {
                    let name = json_str(f, "name").unwrap_or_else(|| format!("file_{ix}"));
                    let folder = json_str(f, "folder").unwrap_or_else(|| ".".into());
                    let place = format!("{folder}/{name}");
                    seen.insert(place).then_some(RecentFile {
                        name: name.into(),
                        folder: folder.into(),
                        opened: parse_ts(json_str(f, "opened").as_deref()),
                    })
                })
                .collect()
        })
        .unwrap_or_default();
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    RecentFiles::new(gpui::ElementId::from(eid.clone()), files)
        .on_open(move |file, _, cx| {
            emit_event(
                &v,
                &nid,
                &ntype,
                "ely:action",
                json!(file.name.as_ref()),
                cx,
            );
        })
        .into_any_element()
}

fn render_transfer_queue(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut seen = HashSet::new();
    let transfers: Vec<Transfer> = node
        .props
        .get("transfers")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, t)| {
                    let tr = parse_transfer(t, ix, false);
                    seen.insert(tr.key.to_string()).then_some(tr)
                })
                .collect()
        })
        .unwrap_or_default();
    let (v1, v2, v3, v4) = (view.clone(), view.clone(), view.clone(), view.clone());
    let (nid1, nid2, nid3, nid4) = (
        node.id.clone(),
        node.id.clone(),
        node.id.clone(),
        node.id.clone(),
    );
    let (nt1, nt2, nt3, nt4) = (
        node.node_type.clone(),
        node.node_type.clone(),
        node.node_type.clone(),
        node.node_type.clone(),
    );
    TransferQueue::new(gpui::ElementId::from(eid.clone()), transfers)
        .pause(move |k, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "pause": k.as_ref() }),
                cx,
            );
        })
        .resume(move |k, _, cx| {
            emit_event(
                &v2,
                &nid2,
                &nt2,
                "ely:action",
                json!({ "resume": k.as_ref() }),
                cx,
            );
        })
        .retry(move |k, _, cx| {
            emit_event(
                &v3,
                &nid3,
                &nt3,
                "ely:action",
                json!({ "retry": k.as_ref() }),
                cx,
            );
        })
        .cancel(move |k, _, cx| {
            emit_event(
                &v4,
                &nid4,
                &nt4,
                "ely:action",
                json!({ "cancel": k.as_ref() }),
                cx,
            );
        })
        .into_any_element()
}

// ============================================================================
// git
// ============================================================================

fn render_blame_view(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let rows = node
        .props
        .get("rows")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let mut lines = Vec::new();
    let mut owners = Vec::new();
    let mut blames = Vec::new();
    for (ix, row) in rows.iter().enumerate() {
        lines.push(json_str(row, "text").unwrap_or_default());
        owners.push(ix);
        let age = match json_str(row, "age").unwrap_or_default().as_str() {
            "recent" => 0.1,
            "older" => 0.7,
            _ => 0.4,
        };
        blames.push(Blame {
            commit: json_str(row, "revision")
                .unwrap_or_else(|| format!("c{ix:06}"))
                .into(),
            author: json_str(row, "author")
                .unwrap_or_else(|| "Author".into())
                .into(),
            when: json_str(row, "age")
                .unwrap_or_else(|| "today".into())
                .into(),
            subject: json_str(row, "subject")
                .unwrap_or_else(|| "Update".into())
                .into(),
            age,
        });
    }
    let code = if lines.is_empty() {
        "fn main() {}".to_owned()
    } else {
        lines.join("\n")
    };
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    sized_box(
        260.,
        BlameView::new(gpui::ElementId::from(eid.clone()), code, owners, blames).on_commit(
            move |rev, _, cx| {
                emit_event(&v, &nid, &ntype, "ely:action", json!(rev.as_ref()), cx);
            },
        ),
    )
}

fn render_branch_selector(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let selected = prop_str(node, "selected").unwrap_or_default();
    let branches: Vec<Branch> = node
        .props
        .get("branches")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, b)| {
                    let name = json_str(b, "label")
                        .or_else(|| json_str(b, "value"))
                        .unwrap_or_else(|| format!("branch-{ix}"));
                    Branch {
                        current: name == selected,
                        remote: b.get("remote").and_then(Value::as_bool).unwrap_or(false),
                        ahead: b.get("ahead").and_then(Value::as_u64).unwrap_or(0) as usize,
                        behind: b.get("behind").and_then(Value::as_u64).unwrap_or(0) as usize,
                        subject: json_str(b, "upstream").unwrap_or_default().into(),
                        when: json_str(b, "when").unwrap_or_default().into(),
                        name: name.into(),
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let open_state = window.use_keyed_state(
        SharedString::from(format!("{eid}-branch-open")),
        cx,
        |_, _| false,
    );
    let is_open = *open_state.read(cx);
    let open_for_btn = open_state.clone();
    let open_for_close = open_state.clone();

    let v1 = view.clone();
    let sk1 = state_key.to_owned();
    let nt1 = node.node_type.clone();

    let mut list = BranchList::new(gpui::ElementId::from(eid.clone()), branches.clone()).on_pick(
        move |name, _, cx| {
            emit_event(&v1, &sk1, &nt1, "change", json!(name.as_ref()), cx);
        },
    );
    if !selected.is_empty() {
        list = list.selected(selected);
    }

    let mut box_el = v_stack()
        .gap_2()
        .child(
            Button::new(
                SharedString::from(format!("{eid}-open-selector")),
                "Switch branch",
            )
            .size(ControlSize::Sm)
            .variant(ButtonVariant::Secondary)
            .on_click(move |_, _, cx| {
                open_for_btn.update(cx, |open, cx| {
                    *open = true;
                    cx.notify();
                });
            }),
        )
        .child(list);

    if is_open {
        let v2 = view.clone();
        let v3 = view.clone();
        let sk2 = state_key.to_owned();
        let nid3 = node.id.clone();
        let (nt2, nt3) = (node.node_type.clone(), node.node_type.clone());
        let open_after_pick = open_state.clone();
        box_el = box_el.child(
            BranchSelector::new(
                SharedString::from(format!("{eid}-palette")),
                branches,
                move |_, cx| {
                    open_for_close.update(cx, |open, cx| {
                        *open = false;
                        cx.notify();
                    });
                },
            )
            .on_pick(move |name, _, cx| {
                open_after_pick.update(cx, |open, cx| {
                    *open = false;
                    cx.notify();
                });
                emit_event(&v2, &sk2, &nt2, "change", json!(name.as_ref()), cx);
            })
            .on_create(move |name, _, cx| {
                emit_event(
                    &v3,
                    &nid3,
                    &nt3,
                    "ely:action",
                    json!({ "create": name.as_ref() }),
                    cx,
                );
            }),
        );
    }
    box_el.into_any_element()
}

fn parse_git_status(s: Option<&str>) -> GitStatus {
    match s.unwrap_or("").trim().to_ascii_lowercase().as_str() {
        "added" | "a" => GitStatus::Added,
        "deleted" | "d" => GitStatus::Deleted,
        "untracked" | "u" => GitStatus::Untracked,
        "renamed" | "r" => GitStatus::Renamed,
        "conflicted" | "!" => GitStatus::Conflicted,
        _ => GitStatus::Modified,
    }
}

fn parse_changed_list(v: Option<&Value>) -> Vec<Changed> {
    v.and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, c)| Changed {
                    path: json_str(c, "path")
                        .unwrap_or_else(|| format!("file_{ix}"))
                        .into(),
                    status: parse_git_status(json_str(c, "status").as_deref()),
                    lines: None,
                })
                .collect()
        })
        .unwrap_or_default()
}

fn render_changes_list(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let staged = parse_changed_list(node.props.get("stagedChanges"));
    let unstaged = parse_changed_list(node.props.get("changes"));
    let (v1, v2) = (view.clone(), view.clone());
    let (nid1, nid2) = (node.id.clone(), node.id.clone());
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    ChangesList::new(gpui::ElementId::from(eid.clone()), staged, unstaged)
        .on_action(move |path, section, action, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({
                    "path": path.as_ref(),
                    "section": format!("{section:?}"),
                    "action": format!("{action:?}")
                }),
                cx,
            );
        })
        .on_all(move |stage, _, cx| {
            emit_event(
                &v2,
                &nid2,
                &nt2,
                "ely:action",
                json!({ "stageAll": stage }),
                cx,
            );
        })
        .into_any_element()
}

fn render_diff_viewer(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let path = prop_str(node, "path").unwrap_or_else(|| "src/lib.rs".into());
    let (old_text, new_text) =
        if let (Some(o), Some(n)) = (prop_str(node, "old"), prop_str(node, "new")) {
            (o, n)
        } else if let Some(hunks) = node.props.get("hunks").and_then(Value::as_array) {
            let mut old_lines = Vec::new();
            let mut new_lines = Vec::new();
            for h in hunks {
                if let Some(lines) = h.get("lines").and_then(Value::as_array) {
                    for l in lines {
                        let txt = json_str(l, "text").unwrap_or_default();
                        match json_str(l, "type")
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
            (old_lines.join("\n"), new_lines.join("\n"))
        } else {
            ("old\n".into(), "new\n".into())
        };
    let layout_str = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| prop_str(node, "diffLayout"))
        .unwrap_or_default();
    let layout = if layout_str.eq_ignore_ascii_case("split") {
        DiffLayout::Split
    } else {
        DiffLayout::Unified
    };
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    sized_box(
        280.,
        DiffViewer::new(
            gpui::ElementId::from(eid.clone()),
            path,
            &old_text,
            &new_text,
        )
        .layout(layout)
        .on_layout(move |next, _, cx| {
            let s = match next {
                DiffLayout::Unified => "unified",
                DiffLayout::Split => "split",
            };
            emit_event(&v, &sk, &ntype, "change", json!(s), cx);
        }),
    )
}

fn render_pull_request_card(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let state = match prop_str(node, "status")
        .unwrap_or_default()
        .to_ascii_lowercase()
        .as_str()
    {
        "draft" => PullState::Draft,
        "merged" => PullState::Merged,
        "closed" => PullState::Closed,
        _ => PullState::Open,
    };
    let (mut passed, mut failed, mut running) = (0usize, 0usize, 0usize);
    if let Some(checks) = node.props.get("checks").and_then(Value::as_array) {
        for c in checks {
            match json_str(c, "status")
                .unwrap_or_default()
                .to_ascii_lowercase()
                .as_str()
            {
                "passed" | "success" => passed += 1,
                "failed" | "error" => failed += 1,
                _ => running += 1,
            }
        }
    }
    let reviewers: Vec<SharedString> = node
        .props
        .get("reviewers")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|r| {
                    r.as_str()
                        .map(ToOwned::to_owned)
                        .or_else(|| json_str(r, "name"))
                })
                .map(Into::into)
                .collect()
        })
        .unwrap_or_default();
    let pr = PullRequest {
        number: node
            .props
            .get("number")
            .and_then(Value::as_u64)
            .unwrap_or(1) as u32,
        title: prop_str(node, "subject")
            .unwrap_or_else(|| non_empty_or(&best_title(node), "Pull request"))
            .into(),
        author: prop_str(node, "author")
            .unwrap_or_else(|| "Author".into())
            .into(),
        head: prop_str(node, "sourceBranch")
            .unwrap_or_else(|| "feature".into())
            .into(),
        base: prop_str(node, "targetBranch")
            .unwrap_or_else(|| "main".into())
            .into(),
        state,
        checks: (passed, failed, running),
        reviewers,
        comments: node
            .props
            .get("commentCount")
            .and_then(Value::as_u64)
            .unwrap_or(0) as usize,
        added: node.props.get("added").and_then(Value::as_u64).unwrap_or(0) as usize,
        removed: node
            .props
            .get("removed")
            .and_then(Value::as_u64)
            .unwrap_or(0) as usize,
        when: prop_str(node, "updated")
            .unwrap_or_else(|| "now".into())
            .into(),
    };
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    PullRequestCard::new(gpui::ElementId::from(eid.clone()), pr)
        .on_open(move |_, cx| {
            emit_event(&v, &nid, &ntype, "ely:action", json!("open"), cx);
        })
        .into_any_element()
}

fn render_three_way_merge(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let base = prop_str(node, "base").unwrap_or_default();
    let ours = prop_str(node, "ours").unwrap_or_default();
    let theirs = prop_str(node, "theirs").unwrap_or_default();
    let mut labels = ["ours".to_owned(), "base".to_owned(), "theirs".to_owned()];
    if let Some(sides) = node.props.get("mergeSides").and_then(Value::as_array) {
        for s in sides {
            if let (Some(id), Some(lbl)) = (json_str(s, "id"), json_str(s, "label")) {
                match id.as_str() {
                    "ours" => labels[0] = lbl,
                    "base" => labels[1] = lbl,
                    "theirs" => labels[2] = lbl,
                    _ => {}
                }
            }
        }
    }
    let merge_regions = Rc::new(regions(&base, &ours, &theirs));
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    sized_box(
        260.,
        ThreeWayMerge::new(
            gpui::ElementId::from(eid.clone()),
            [labels[0].as_str(), labels[1].as_str(), labels[2].as_str()],
            merge_regions,
        )
        .on_take(move |ix, take, _, cx| {
            emit_event(
                &v,
                &sk,
                &ntype,
                "change",
                json!({ "conflict": ix, "take": format!("{take:?}") }),
                cx,
            );
        }),
    )
}

// ============================================================================
// project
// ============================================================================

fn parse_project_status(s: Option<&str>) -> Status {
    match s.unwrap_or("").trim().to_ascii_lowercase().as_str() {
        "backlog" => Status::Backlog,
        "in progress" | "in-progress" | "inprogress" | "ready" => Status::InProgress,
        "in review" | "in-review" | "inreview" => Status::InReview,
        "done" | "completed" => Status::Done,
        "canceled" | "cancelled" => Status::Canceled,
        _ => Status::Todo,
    }
}

fn parse_project_priority(s: Option<&str>) -> Priority {
    match s.unwrap_or("").trim().to_ascii_lowercase().as_str() {
        "urgent" => Priority::Urgent,
        "high" => Priority::High,
        "medium" => Priority::Medium,
        "low" => Priority::Low,
        _ => Priority::None,
    }
}

fn parse_issue_id(raw: &str) -> Option<IssueId> {
    let (team, num_str) = raw.trim().split_once('-')?;
    let valid_team = (1..=5).contains(&team.len()) && team.chars().all(|c| c.is_ascii_uppercase());
    let number = num_str.parse::<u32>().ok().filter(|n| *n > 0)?;
    valid_team.then(|| IssueId::new(team.to_owned(), number))
}

fn parse_person_opt(
    name: Option<String>,
    key: Option<String>,
    fallback_ix: usize,
) -> Option<Person> {
    let name = name?;
    if name.trim().is_empty() {
        return None;
    }
    let k = key
        .filter(|k| !k.trim().is_empty())
        .unwrap_or_else(|| format!("p-{fallback_ix}"));
    Some(Person::new(k, name))
}

fn parse_task(item: &Value, ix: usize) -> Task {
    let key = json_str(item, "value")
        .or_else(|| json_str(item, "id"))
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| format!("task-{ix}"));
    let title = json_str(item, "title")
        .or_else(|| json_str(item, "label"))
        .unwrap_or_else(|| format!("Task {}", ix + 1));
    let mut task = Task::new(key, title)
        .status(parse_project_status(json_str(item, "status").as_deref()))
        .priority(parse_project_priority(
            json_str(item, "priority").as_deref(),
        ));
    if item.get("done").and_then(Value::as_bool) == Some(true) {
        task = task.status(Status::Done);
    }
    if let Some(issue) = json_str(item, "issue").and_then(|s| parse_issue_id(&s)) {
        task = task.issue(issue);
    }
    if let Some(start) = parse_date(json_str(item, "start").as_deref()) {
        task = task.starts(start);
    }
    if let Some(due) = parse_date(json_str(item, "due").as_deref()) {
        task = task.due(due);
    }
    if let Some(person) = parse_person_opt(
        json_str(item, "assignee"),
        json_str(item, "assigneeValue"),
        ix,
    ) {
        task = task.assignee(person);
    }
    task
}

fn render_database_view(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let today = parse_date(prop_str(node, "today").as_deref()).unwrap_or_else(default_date);
    let mut seen = HashSet::new();
    let tasks: Vec<Task> = node
        .props
        .get("items")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, item)| {
                    let t = parse_task(item, ix);
                    seen.insert(t.key.to_string()).then_some(t)
                })
                .collect()
        })
        .unwrap_or_default();
    let (v1, v2) = (view.clone(), view.clone());
    let (nid1, nid2) = (node.id.clone(), node.id.clone());
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    DatabaseView::new(gpui::ElementId::from(eid.clone()), tasks)
        .today(today)
        .on_open(move |k, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "open": k.as_ref() }),
                cx,
            );
        })
        .on_status(move |k, status, _, cx| {
            emit_event(
                &v2,
                &nid2,
                &nt2,
                "ely:action",
                json!({ "task": k.as_ref(), "status": status.words() }),
                cx,
            );
        })
        .into_any_element()
}

fn render_gantt_chart(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let today = parse_date(prop_str(node, "today").as_deref()).unwrap_or_else(default_date);
    let mut chart = GanttChart::new(eid.clone()).today(today);
    let items = node
        .props
        .get("items")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    if items.is_empty() {
        let d1 = default_date();
        let d2 = jiff::civil::date(2026, 10, 20);
        chart = chart.task(GanttTask::new("Task 1", d1, d2).done(0.5));
        return chart.into_any_element();
    }
    for (ix, item) in items.iter().enumerate() {
        let name = json_str(item, "label")
            .or_else(|| json_str(item, "title"))
            .unwrap_or_else(|| format!("Task {}", ix + 1));
        let start = parse_date(json_str(item, "start").as_deref()).unwrap_or(today);
        let raw_end = parse_date(json_str(item, "end").as_deref()).unwrap_or(start);
        // GanttTask::new asserts end >= start.
        let end = if raw_end >= start { raw_end } else { start };
        let raw_done = item
            .get("progress")
            .and_then(value_to_f64)
            .filter(|f| f.is_finite())
            .unwrap_or(0.0);
        let share = if raw_done > 1.0 {
            (raw_done / 100.0).clamp(0.0, 1.0)
        } else {
            raw_done.clamp(0.0, 1.0)
        } as f32;
        let mut task = GanttTask::new(name, start, end).done(share);
        if let Some(after) = item.get("after").and_then(Value::as_array) {
            for dep in after {
                if let Some(dep_ix) = dep.as_u64().map(|n| n as usize)
                    && dep_ix < ix
                {
                    task = task.after(dep_ix);
                }
            }
        }
        chart = chart.task(task);
    }
    chart.into_any_element()
}

fn render_label_manager(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut seen_keys = HashSet::new();
    let mut seen_names = HashSet::new();
    let labels: Vec<Label> = node
        .props
        .get("items")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, item)| {
                    let name = json_str(item, "label")
                        .or_else(|| json_str(item, "name"))
                        .unwrap_or_else(|| format!("Label {}", ix + 1));
                    let trimmed = name.trim();
                    if trimmed.is_empty() {
                        return None;
                    }
                    let lower = trimmed.to_ascii_lowercase();
                    let key = json_str(item, "value")
                        .or_else(|| json_str(item, "key"))
                        .filter(|k| !k.is_empty())
                        .unwrap_or_else(|| format!("lbl-{ix}"));
                    // LabelManager::new asserts unique keys and unique non-blank case-insensitive names.
                    if !seen_keys.insert(key.clone()) || !seen_names.insert(lower) {
                        return None;
                    }
                    let hue = item.get("hue").and_then(Value::as_u64).unwrap_or(0) as usize;
                    Some(Label::new(key, trimmed.to_owned(), hue))
                })
                .collect()
        })
        .unwrap_or_default();
    let (v1, v2, v3, v4) = (view.clone(), view.clone(), view.clone(), view.clone());
    let (nid1, nid2, nid3, nid4) = (
        node.id.clone(),
        node.id.clone(),
        node.id.clone(),
        node.id.clone(),
    );
    let (nt1, nt2, nt3, nt4) = (
        node.node_type.clone(),
        node.node_type.clone(),
        node.node_type.clone(),
        node.node_type.clone(),
    );
    LabelManager::new(gpui::ElementId::from(eid.clone()), labels)
        .on_rename(move |k, name, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "rename": k.as_ref(), "name": name.as_ref() }),
                cx,
            );
        })
        .on_recolor(move |k, hue, _, cx| {
            emit_event(
                &v2,
                &nid2,
                &nt2,
                "ely:action",
                json!({ "recolor": k.as_ref(), "hue": hue }),
                cx,
            );
        })
        .on_delete(move |k, _, cx| {
            emit_event(
                &v3,
                &nid3,
                &nt3,
                "ely:action",
                json!({ "delete": k.as_ref() }),
                cx,
            );
        })
        .on_create(move |name, _, cx| {
            emit_event(
                &v4,
                &nid4,
                &nt4,
                "ely:action",
                json!({ "create": name.as_ref() }),
                cx,
            );
        })
        .into_any_element()
}

fn render_milestone_progress(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let fallback_today = parse_date(prop_str(node, "due").as_deref()).unwrap_or_else(default_date);
    if let Some(items) = node.props.get("items").and_then(Value::as_array)
        && !items.is_empty()
    {
        let mut stack = v_stack().gap_3();
        for (ix, item) in items.iter().enumerate() {
            let name = json_str(item, "title")
                .or_else(|| json_str(item, "label"))
                .unwrap_or_else(|| format!("Milestone {}", ix + 1));
            let start = parse_date(json_str(item, "start").as_deref()).unwrap_or(fallback_today);
            let raw_target = parse_date(json_str(item, "end").as_deref()).unwrap_or(start);
            let target = if raw_target >= start {
                raw_target
            } else {
                start
            };
            let done = item.get("completed").and_then(Value::as_u64).unwrap_or(0) as usize;
            let total = item
                .get("total")
                .and_then(Value::as_u64)
                .unwrap_or(done.max(1) as u64)
                .max(1) as usize;
            let today = parse_date(json_str(item, "today").as_deref()).unwrap_or(fallback_today);
            stack = stack.child(
                MilestoneProgress::new(
                    SharedString::from(format!("{eid}-ms-{ix}")),
                    name,
                    (start, target),
                    (done, total),
                )
                .today(today),
            );
        }
        return stack.into_any_element();
    }
    let name = non_empty_or(&best_title(node), "Milestone");
    let start = parse_date(prop_str(node, "start").as_deref()).unwrap_or(fallback_today);
    let raw_target = parse_date(prop_str(node, "end").as_deref()).unwrap_or(start);
    let target = if raw_target >= start {
        raw_target
    } else {
        start
    };
    let progress = prop_f64(node, "progress")
        .filter(|f| f.is_finite())
        .unwrap_or(0.0)
        .clamp(0.0, 100.0) as usize;
    MilestoneProgress::new(
        gpui::ElementId::from(eid.clone()),
        name,
        (start, target),
        (progress, 100),
    )
    .today(fallback_today)
    .into_any_element()
}

fn render_pomodoro_timer(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let focus = node
        .props
        .get("focusMinutes")
        .and_then(Value::as_u64)
        .unwrap_or(25)
        .max(1);
    let short = node
        .props
        .get("shortBreakMinutes")
        .and_then(Value::as_u64)
        .unwrap_or(5)
        .max(1);
    let long = node
        .props
        .get("longBreakMinutes")
        .and_then(Value::as_u64)
        .unwrap_or(15)
        .max(1);
    let rounds = node
        .props
        .get("rounds")
        .and_then(Value::as_u64)
        .unwrap_or(4)
        .clamp(1, u8::MAX as u64) as u8;
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    PomodoroTimer::new(eid.clone())
        .minutes(focus, short, long)
        .rounds(rounds)
        .on_phase(move |phase, _, cx| {
            emit_event(&v, &nid, &ntype, "ely:action", json!(phase.words()), cx);
        })
        .into_any_element()
}

fn render_status_select(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let current = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| prop_str(node, "status"))
        .or_else(|| prop_str(node, "value"));
    let status = parse_project_status(current.as_deref());
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    StatusSelect::new(gpui::ElementId::from(eid.clone()), status)
        .on_change(move |next, _, cx| {
            emit_event(&v, &sk, &ntype, "change", json!(next.words()), cx);
        })
        .into_any_element()
}

fn render_task_detail_panel(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut task = Task::new(
        prop_str(node, "value")
            .filter(|s| !s.is_empty())
            .unwrap_or_else(|| node.id.clone()),
        non_empty_or(&best_title(node), "Task"),
    )
    .status(parse_project_status(prop_str(node, "status").as_deref()))
    .priority(parse_project_priority(
        prop_str(node, "priority").as_deref(),
    ));
    if let Some(issue) = prop_str(node, "issue").and_then(|s| parse_issue_id(&s)) {
        task = task.issue(issue);
    }
    if let Some(due) = parse_date(prop_str(node, "due").as_deref()) {
        task = task.due(due);
    }
    if let Some(person) = parse_person_opt(
        prop_str(node, "assignee"),
        prop_str(node, "assigneeValue"),
        0,
    ) {
        task = task.assignee(person);
    }
    if let Some(labels) = node.props.get("labels").and_then(Value::as_array) {
        for (ix, l) in labels.iter().enumerate() {
            let name = json_str(l, "label").unwrap_or_else(|| format!("Label {ix}"));
            let hue = l.get("hue").and_then(Value::as_u64).unwrap_or(0) as usize;
            task = task.label(Label::new(format!("lbl-{ix}"), name, hue));
        }
    }

    let mut seen_people = HashSet::new();
    let people: Vec<Person> = node
        .props
        .get("assignees")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, p)| {
                    let name = json_str(p, "label")
                        .or_else(|| json_str(p, "name"))
                        .unwrap_or_else(|| format!("Member {}", ix + 1));
                    let key = json_str(p, "value")
                        .or_else(|| json_str(p, "key"))
                        .filter(|k| !k.trim().is_empty())
                        .unwrap_or_else(|| format!("person-{ix}"));
                    seen_people
                        .insert(key.clone())
                        .then(|| Person::new(key, name))
                })
                .collect()
        })
        .unwrap_or_default();

    let steps: Vec<(String, bool)> = node
        .props
        .get("items")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, s)| {
                    (
                        json_str(s, "label").unwrap_or_else(|| format!("Step {}", ix + 1)),
                        s.get("done").and_then(Value::as_bool).unwrap_or(false),
                    )
                })
                .collect()
        })
        .unwrap_or_default();

    let mut panel =
        TaskDetailPanel::new(gpui::ElementId::from(eid.clone()), task, people).steps(steps);
    if let Some(notes) = prop_str(node, "notes").filter(|s| !s.is_empty()) {
        panel = panel.notes(notes);
    }
    let (v1, v2, v3, v4) = (view.clone(), view.clone(), view.clone(), view.clone());
    let sk = state_key.to_owned();
    let (nid2, nid3, nid4) = (node.id.clone(), node.id.clone(), node.id.clone());
    let (nt1, nt2, nt3, nt4) = (
        node.node_type.clone(),
        node.node_type.clone(),
        node.node_type.clone(),
        node.node_type.clone(),
    );
    panel
        .on_change(move |t, _, cx| {
            emit_event(
                &v1,
                &sk,
                &nt1,
                "change",
                json!({ "title": t.title.as_ref(), "status": t.status.words() }),
                cx,
            );
        })
        .on_close(move |_, cx| {
            emit_event(&v2, &nid2, &nt2, "ely:action", json!("close"), cx);
        })
        .on_step(move |ix, done, _, cx| {
            emit_event(
                &v3,
                &nid3,
                &nt3,
                "ely:action",
                json!({ "step": ix, "done": done }),
                cx,
            );
        })
        .on_add_step(move |text, _, cx| {
            emit_event(
                &v4,
                &nid4,
                &nt4,
                "ely:action",
                json!({ "addStep": text.as_ref() }),
                cx,
            );
        })
        .into_any_element()
}

fn render_task_item(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let today = parse_date(prop_str(node, "due").as_deref()).unwrap_or_else(default_date);
    if let Some(items) = node.props.get("items").and_then(Value::as_array)
        && !items.is_empty()
    {
        let mut list = v_stack().gap_1();
        for (ix, item) in items.iter().enumerate() {
            let task = parse_task(item, ix);
            let tkey = task.key.to_string();
            let v = view.clone();
            let ntype = node.node_type.clone();
            list = list.child(
                TaskItem::new(SharedString::from(format!("{eid}-task-{ix}")), task)
                    .today(today)
                    .on_toggle(move |done, _, cx| {
                        emit_event(&v, &tkey, &ntype, "change", json!(done), cx);
                    }),
            );
        }
        return list.into_any_element();
    }
    let task = Task::new(node.id.clone(), non_empty_or(&best_title(node), "Task"))
        .status(parse_project_status(prop_str(node, "status").as_deref()))
        .priority(parse_project_priority(
            prop_str(node, "priority").as_deref(),
        ));
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    TaskItem::new(gpui::ElementId::from(eid.clone()), task)
        .today(today)
        .on_toggle(move |done, _, cx| {
            emit_event(&v, &sk, &ntype, "change", json!(done), cx);
        })
        .into_any_element()
}

fn render_time_tracker(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let entries: Vec<TimeEntry> = node
        .props
        .get("entries")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, e)| {
                    let secs = e.get("seconds").and_then(Value::as_u64).unwrap_or(0);
                    TimeEntry::new(
                        format!("entry-{ix}"),
                        json_str(e, "label").unwrap_or_else(|| format!("Task {}", ix + 1)),
                        Duration::from_secs(secs),
                    )
                })
                .collect()
        })
        .unwrap_or_default();
    let mut tracker = TimeTracker::new(gpui::ElementId::from(eid.clone()), entries);
    if let Some(running_task) = prop_str(node, "task").filter(|s| !s.is_empty()) {
        tracker = tracker.running(running_task, Instant::now());
    }
    let (v1, v2) = (view.clone(), view.clone());
    let (nid1, nid2) = (node.id.clone(), node.id.clone());
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    tracker
        .on_start(move |task, _, _, cx| {
            emit_event(
                &v1,
                &nid1,
                &nt1,
                "ely:action",
                json!({ "start": task.as_ref() }),
                cx,
            );
        })
        .on_stop(move |_, _, cx| {
            emit_event(&v2, &nid2, &nt2, "ely:action", json!("stop"), cx);
        })
        .into_any_element()
}

fn render_workload_view(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let unit = prop_str(node, "unit").unwrap_or_else(|| "pts".into());
    let mut seen = HashSet::new();
    let loads: Vec<Load> = node
        .props
        .get("items")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .filter_map(|(ix, item)| {
                    let name = json_str(item, "label")
                        .or_else(|| json_str(item, "name"))
                        .unwrap_or_else(|| format!("Member {}", ix + 1));
                    let key = json_str(item, "id")
                        .or_else(|| json_str(item, "key"))
                        .filter(|k| !k.trim().is_empty())
                        .unwrap_or_else(|| format!("wl-{ix}"));
                    if !seen.insert(key.clone()) {
                        return None;
                    }
                    let assigned = item
                        .get("value")
                        .and_then(value_to_f64)
                        .filter(|f| f.is_finite() && *f >= 0.0)
                        .unwrap_or(0.0) as f32;
                    let capacity = item
                        .get("capacity")
                        .and_then(value_to_f64)
                        .filter(|f| f.is_finite() && *f > 0.0)
                        .unwrap_or(10.0) as f32;
                    Some(Load::new(Person::new(key, name), assigned, capacity))
                })
                .collect()
        })
        .unwrap_or_default();
    WorkloadView::new(gpui::ElementId::from(eid.clone()), loads, unit).into_any_element()
}

// ============================================================================
// terminal
// ============================================================================

fn render_process_list(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let processes: Vec<Process> = node
        .props
        .get("processes")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(ix, p)| Process {
                    pid: p
                        .get("pid")
                        .and_then(Value::as_u64)
                        .unwrap_or((1000 + ix) as u64) as u32,
                    name: json_str(p, "name")
                        .unwrap_or_else(|| format!("proc-{ix}"))
                        .into(),
                    user: json_str(p, "user").unwrap_or_else(|| "user".into()).into(),
                    cpu: p
                        .get("cpu")
                        .and_then(value_to_f64)
                        .filter(|f| f.is_finite() && *f >= 0.0)
                        .unwrap_or(0.0) as f32,
                    memory: parse_human_bytes(p.get("memory")),
                })
                .collect()
        })
        .unwrap_or_default();
    let query = prop_str(node, "query").unwrap_or_default();
    let (v1, v2) = (view.clone(), view.clone());
    let sk = state_key.to_owned();
    let nid = node.id.clone();
    let (nt1, nt2) = (node.node_type.clone(), node.node_type.clone());
    ProcessList::new(gpui::ElementId::from(eid.clone()), processes)
        .query(query)
        .on_select(move |pids, _, cx| {
            emit_event(&v1, &sk, &nt1, "change", json!(pids), cx);
        })
        .on_end(move |pids, _, cx| {
            emit_event(&v2, &nid, &nt2, "ely:action", json!({ "end": pids }), cx);
        })
        .into_any_element()
}

fn render_terminal(
    node: &ScreenNode,
    eid: &SharedString,
    window: &mut Window,
    cx: &mut App,
) -> AnyElement {
    let mut lines: Vec<String> = node
        .props
        .get("entries")
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(|e| json_str(e, "text")).collect())
        .unwrap_or_default();
    if lines.is_empty() {
        if let Some(cmd) = prop_str(node, "command") {
            lines.push(format!("$ {cmd}"));
        }
        if let Some(out) = prop_str(node, "output").or_else(|| best_body(node)) {
            lines.push(out);
        }
    }
    if lines.is_empty() {
        lines.push("$ ready".into());
    }
    let bytes = lines.join("\r\n").into_bytes();
    // Replay recorded terminal output without spawning any OS shell process.
    let terminal = window.use_keyed_state(
        SharedString::from(format!("{eid}-terminal")),
        cx,
        |_window, cx| Terminal::replay(&bytes, 80, 16, cx),
    );
    sized_box(220., terminal)
}
