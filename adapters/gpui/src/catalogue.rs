//! Full elysdui catalogue contract validator and interactive GPUI renderer across
//! all 44 chapters (1,313 qualified names / 624 primaries) and 48 basic templates.

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
    io::Read,
    sync::OnceLock,
};

use crate::event_bindings::{ActionRequest, resolve_event_bindings};
use ely_gpui_component::{
    buttons::{
        ActionBar, BulkActionBar, Button, ButtonGroup, ButtonVariant, ConfirmButton, ConfirmMode,
        CopyButton, FloatingActionButton, SegmentedControl, ToggleButton, ToggleGroup, ToggleItem,
    },
    charts::{
        AreaChart, BarChart, Bullet, BulletChart, BurndownChart, FunnelChart, Histogram,
        LIMIT as CHART_LIMIT, LineChart, PieChart, Points, RadarChart, ScatterChart,
        Series as ChartSeries, WaterfallChart,
    },
    dashboard::{
        AlertList, AlertState, EventStream, Health, MonitorAlert, Service, ServiceStatus,
        StreamEvent, UptimeBar,
    },
    data_display::{
        Avatar, Badge, BeforeAfter, Carousel, Comparison, DescriptionList, Gauge, KpiCard, Meter,
        QrCode, Sparkline, Stars, Statistic, Tag, Timeline, TimelineItem, Tone, UsageBar,
    },
    feedback::{Alert, Banner, Callout, ConfirmationCard, EmptyState, SaveState, SavingIndicator},
    forms::{
        Calendar, Checkbox, Choice, ChoiceChips, CodeInput, ColorPicker, ColorSwatch, Combobox,
        DatePicker, DropZone, Form, FormField, FormLabel, HotkeyInput, InlineForm, Input,
        InputEvent, KeyValueInput, ListBox, MultiSelect, NumberInput, PasswordInput, PathInput,
        PinInput, RadioGroup, RangeSlider, Rating, SearchInput, Select, SignaturePad, Slider,
        Stepper, Switch, TagInput, TextInput, UnitInput,
    },
    layout::{
        Accordion, AccordionItem, AppShell, Card, CardHeader, MasterDetail, Sheet, Sidebar,
        SimpleGrid, SplitPane, h_stack, v_stack,
    },
    lists::{Tree, TreeNode, TreeSelect},
    misc::{Calculator, Clock, Poll, Stopwatch},
    motion::{ProgressBar, ProgressRing, SkeletonText, Spinner},
    navigation::{
        BackForwardNavigation, Breadcrumb, Crumb, EditorTab, EditorTabs, LoadMore, Pagination,
        Steps, Tabs,
    },
    primitives::{Divider, IconName, Place, Severity},
    project::{KanbanBoard, KanbanCard, KanbanColumn, Priority, PriorityIndicator},
    shell::{StatusBar, StatusBarItem, TabBar, TitleBar, WindowTab},
    tables::{Cell, Column, DataTable, HeatmapTable, Row},
    terminal::{AnsiText, CommandBlock, CommandState, LogLevel, LogLine, LogViewer},
    theme::{ActiveTheme, ControlSize},
    typography::{
        AnimatedNumber, Blockquote, Caption, Code, Emoji, Heading, Highlight, Label, Latex, Link,
        Overline, Paragraph, SelectableText, Subtitle, Title,
    },
};
use flate2::read::GzDecoder;
use gpui::{
    AnyElement, App, Axis, Context, Entity, Hsla, IntoElement, ParentElement, Render, Rgba,
    SharedString, Styled, Subscription, Window, div, prelude::*, px,
};
use jiff::{Timestamp, civil::Date};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::{
    dashboard::{Screen, ScreenNode, decode_screen_json, validate_screen},
    profile::MAX_STRING_BYTES,
};

const CATALOGUE_MANIFEST_GZ: &[u8] =
    include_bytes!("../../../adapters/gohtmx/catalogue_manifest.json.gz");

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CatalogueError {
    pub message: String,
}

impl CatalogueError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for CatalogueError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for CatalogueError {}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogueProperty {
    #[serde(rename = "type", default)]
    pub value_type: Option<String>,
    #[serde(default)]
    pub required: bool,
    #[serde(default, rename = "enum")]
    pub enum_values: Vec<String>,
    #[serde(default)]
    pub items: Option<Box<CatalogueProperty>>,
    #[serde(default)]
    pub properties: BTreeMap<String, CatalogueProperty>,
    #[serde(default)]
    pub additional_properties: Option<Box<CatalogueProperty>>,
    #[serde(default)]
    pub one_of: Vec<CatalogueProperty>,
    #[serde(default)]
    pub nullable: bool,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub max_length: Option<usize>,
    #[serde(default)]
    pub max_items: Option<usize>,
    #[serde(default)]
    pub target: Option<String>,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogueExclusion {
    pub path: String,
    pub reason: String,
}

#[derive(Clone, Debug, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CatalogueContract {
    pub name: String,
    #[serde(default)]
    pub chapter: Option<String>,
    #[serde(default)]
    pub component: Option<String>,
    #[serde(default)]
    pub primary: Option<String>,
    #[serde(default)]
    pub family: Option<String>,
    #[serde(default)]
    pub template: Option<String>,
    #[serde(default)]
    pub events: Vec<String>,
    #[serde(default)]
    pub contains_form: Option<bool>,
    #[serde(default)]
    pub assets: Vec<String>,
    #[serde(default, rename = "sandboxHTML")]
    pub sandbox_html: Option<bool>,
    #[serde(default)]
    pub properties: BTreeMap<String, CatalogueProperty>,
    #[serde(default)]
    pub excluded: Vec<CatalogueExclusion>,
}

#[derive(Clone, Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct CatalogueDocument {
    version: String,
    primaries: usize,
    qualified_names: usize,
    chapters: usize,
    basic_templates: usize,
    contracts: Vec<CatalogueContract>,
}

pub struct CatalogueRegistry {
    pub version: String,
    pub primaries: usize,
    pub qualified_names: usize,
    pub chapters: usize,
    pub basic_templates: usize,
    contracts: BTreeMap<String, CatalogueContract>,
}

impl CatalogueRegistry {
    pub fn global() -> &'static Self {
        static REGISTRY: OnceLock<CatalogueRegistry> = OnceLock::new();
        REGISTRY.get_or_init(|| Self::load_embedded().expect("valid embedded catalogue manifest"))
    }

    fn load_embedded() -> Result<Self, CatalogueError> {
        let mut decoder = GzDecoder::new(CATALOGUE_MANIFEST_GZ);
        let mut raw = Vec::new();
        decoder
            .read_to_end(&mut raw)
            .map_err(|e| CatalogueError::new(format!("Decompress catalogue manifest: {e}")))?;
        let doc: CatalogueDocument = serde_json::from_slice(&raw)
            .map_err(|e| CatalogueError::new(format!("Decode catalogue manifest: {e}")))?;
        let mut contracts = BTreeMap::new();
        for c in doc.contracts {
            contracts.insert(c.name.clone(), c);
        }
        Ok(Self {
            version: doc.version,
            primaries: doc.primaries,
            qualified_names: doc.qualified_names,
            chapters: doc.chapters,
            basic_templates: doc.basic_templates,
            contracts,
        })
    }

    pub fn len(&self) -> usize {
        self.contracts.len()
    }

    pub fn is_empty(&self) -> bool {
        self.contracts.is_empty()
    }

    pub fn get(&self, name: &str) -> Option<&CatalogueContract> {
        self.contracts.get(name)
    }

    pub fn names(&self) -> impl Iterator<Item = &str> {
        self.contracts.keys().map(String::as_str)
    }

    pub fn validate_node(&self, node: &ScreenNode) -> Result<&CatalogueContract, CatalogueError> {
        let Some(contract) = self.contracts.get(&node.node_type) else {
            return Err(CatalogueError::new(format!(
                "Unsupported catalogue component '{}'.",
                node.node_type
            )));
        };
        validate_object_against_props(&node.node_type, &node.props, &contract.properties, None)?;
        resolve_event_bindings(node, "", &Value::Null)
            .map_err(|err| CatalogueError::new(err.message))?;
        for binding in node.event.iter().chain(node.events.iter()) {
            if let Some(on) = binding.get("on").and_then(Value::as_str) {
                if !contract.events.iter().any(|supported| supported == on) {
                    return Err(CatalogueError::new(format!(
                        "{} does not support event {on}",
                        node.node_type
                    )));
                }
            }
        }
        for child in &node.children {
            self.validate_node(child)?;
        }
        for slot_nodes in node.slots.values() {
            for child in slot_nodes {
                self.validate_node(child)?;
            }
        }
        Ok(contract)
    }

    pub fn validate_screen(&self, screen: &Screen) -> Result<(), CatalogueError> {
        validate_screen(screen).map_err(|e| CatalogueError::new(e.message))?;
        self.validate_node(&screen.root)?;
        Ok(())
    }
}

fn validate_object_against_props(
    path: &str,
    obj: &BTreeMap<String, Value>,
    declared: &BTreeMap<String, CatalogueProperty>,
    additional: Option<&CatalogueProperty>,
) -> Result<(), CatalogueError> {
    for (key, prop) in declared {
        if prop.required && !obj.contains_key(key) {
            return Err(CatalogueError::new(format!(
                "{path}: missing required property '{key}'."
            )));
        }
    }
    for (key, value) in obj {
        if let Some(prop) = declared.get(key) {
            validate_value(&format!("{path}.{key}"), value, prop)?;
        } else if let Some(extra) = additional {
            validate_value(&format!("{path}.{key}"), value, extra)?;
        } else {
            return Err(CatalogueError::new(format!(
                "{path}: unknown property '{key}'."
            )));
        }
    }
    Ok(())
}

fn validate_value(
    path: &str,
    value: &Value,
    prop: &CatalogueProperty,
) -> Result<(), CatalogueError> {
    if value.is_null() {
        if prop.nullable || !prop.required {
            return Ok(());
        }
        return Err(CatalogueError::new(format!("{path}: null is not allowed.")));
    }
    if !prop.one_of.is_empty() {
        for candidate in &prop.one_of {
            if validate_value(path, value, candidate).is_ok() {
                return Ok(());
            }
        }
        return Err(CatalogueError::new(format!(
            "{path}: value did not match any allowed oneOf schema."
        )));
    }
    let Some(ty) = prop.value_type.as_deref() else {
        return Ok(());
    };
    match ty {
        "string" => {
            let Some(s) = value.as_str() else {
                return Err(CatalogueError::new(format!("{path}: expected string.")));
            };
            let max = prop.max_length.unwrap_or(MAX_STRING_BYTES);
            if s.len() > max {
                return Err(CatalogueError::new(format!(
                    "{path}: string exceeds maxLength {max}."
                )));
            }
            if !prop.enum_values.is_empty() && !prop.enum_values.iter().any(|e| e == s) {
                return Err(CatalogueError::new(format!(
                    "{path}: value '{s}' is not in enum."
                )));
            }
        }
        "boolean" => {
            if !value.is_boolean() {
                return Err(CatalogueError::new(format!("{path}: expected boolean.")));
            }
        }
        "integer" => {
            if value.as_i64().is_none() && value.as_u64().is_none() {
                return Err(CatalogueError::new(format!("{path}: expected integer.")));
            }
        }
        "number" => {
            let Some(n) = value.as_f64() else {
                return Err(CatalogueError::new(format!("{path}: expected number.")));
            };
            if !n.is_finite() {
                return Err(CatalogueError::new(format!(
                    "{path}: expected finite number."
                )));
            }
        }
        "array" => {
            let Some(items) = value.as_array() else {
                return Err(CatalogueError::new(format!("{path}: expected array.")));
            };
            if let Some(max) = prop.max_items
                && items.len() > max
            {
                return Err(CatalogueError::new(format!(
                    "{path}: array exceeds maxItems {max}."
                )));
            }
            if let Some(item_schema) = prop.items.as_deref() {
                for (idx, item) in items.iter().enumerate() {
                    validate_value(&format!("{path}[{idx}]"), item, item_schema)?;
                }
            }
        }
        "object" => {
            let Some(map) = value.as_object() else {
                return Err(CatalogueError::new(format!("{path}: expected object.")));
            };
            let btree: BTreeMap<String, Value> =
                map.iter().map(|(k, v)| (k.clone(), v.clone())).collect();
            if prop.properties.is_empty() && prop.additional_properties.is_none() {
                return Ok(());
            }
            validate_object_against_props(
                path,
                &btree,
                &prop.properties,
                prop.additional_properties.as_deref(),
            )?;
        }
        _ => {}
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct CatalogueEvent {
    pub node_id: String,
    pub component_type: String,
    pub event: String,
    pub value: Value,
}

/// Interactive GPUI runtime host for all elysdui catalogue components.
pub struct CatalogueView {
    registry: &'static CatalogueRegistry,
    screen: Option<Screen>,
    values: BTreeMap<String, Value>,
    nav_groups: BTreeMap<(String, usize), bool>,
    locked_keys: BTreeSet<String>,
    inputs: BTreeMap<String, Entity<TextInput>>,
    _input_subs: Vec<Subscription>,
    events: Vec<CatalogueEvent>,
    action_requests: Vec<ActionRequest>,
    last_error: Option<String>,
}

impl Default for CatalogueView {
    fn default() -> Self {
        Self::new()
    }
}

impl CatalogueView {
    pub fn new() -> Self {
        Self {
            registry: CatalogueRegistry::global(),
            screen: None,
            values: BTreeMap::new(),
            nav_groups: BTreeMap::new(),
            locked_keys: BTreeSet::new(),
            inputs: BTreeMap::new(),
            _input_subs: Vec::new(),
            events: Vec::new(),
            action_requests: Vec::new(),
            last_error: None,
        }
    }

    pub fn registry(&self) -> &'static CatalogueRegistry {
        self.registry
    }

    pub fn screen(&self) -> Option<&Screen> {
        self.screen.as_ref()
    }

    pub fn values(&self) -> &BTreeMap<String, Value> {
        &self.values
    }

    pub fn value(&self, key: &str) -> Option<&Value> {
        self.values.get(key)
    }

    pub fn events(&self) -> &[CatalogueEvent] {
        &self.events
    }

    /// Consume resolved requests. The host must authorize actions before executing them.
    pub fn take_action_requests(&mut self) -> Vec<ActionRequest> {
        std::mem::take(&mut self.action_requests)
    }

    pub fn last_error(&self) -> Option<&str> {
        self.last_error.as_deref()
    }

    pub fn load_screen_json(
        &mut self,
        bytes: &[u8],
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Result<(), CatalogueError> {
        let screen = match decode_screen_json(bytes) {
            Ok(screen) => screen,
            Err(err) => {
                self.last_error = Some(err.message.clone());
                cx.notify();
                return Err(CatalogueError::new(err.message));
            }
        };
        self.load_screen(screen, window, cx)
    }

    pub fn load_screen(
        &mut self,
        screen: Screen,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Result<(), CatalogueError> {
        if let Err(err) = self.registry.validate_screen(&screen) {
            self.last_error = Some(err.message.clone());
            cx.notify();
            return Err(err);
        }
        self.last_error = None;
        if self.screen.as_ref().is_none_or(|old| old.id != screen.id) {
            self.nav_groups.clear();
        }
        self.values.clear();
        self.action_requests.clear();
        self.locked_keys.clear();
        self.seed_node_state(&screen.root);
        self.screen = Some(screen);
        self.sync_inputs(window, cx);
        cx.notify();
        Ok(())
    }

    pub fn set_value(&mut self, key: impl Into<String>, value: Value, cx: &mut Context<Self>) {
        self.values.insert(key.into(), value);
        cx.notify();
    }

    pub(crate) fn nav_group_open(&self, id: &str, index: usize, default: bool) -> bool {
        self.nav_groups
            .get(&(id.to_owned(), index))
            .copied()
            .unwrap_or(default)
    }

    pub(crate) fn set_nav_group_open(
        &mut self,
        id: &str,
        index: usize,
        open: bool,
        cx: &mut Context<Self>,
    ) {
        self.nav_groups.insert((id.to_owned(), index), open);
        cx.notify();
    }

    pub fn set_text(&mut self, state_key: &str, text: impl Into<String>, cx: &mut Context<Self>) {
        if self.locked_keys.contains(state_key) {
            return;
        }
        let text = text.into();
        if let Some(input) = self.inputs.get(state_key).cloned() {
            input.update(cx, |ti, cx| {
                if !ti.is_disabled() && ti.text() != text {
                    ti.set_text(text.clone(), cx);
                }
            });
            if input.read(cx).is_disabled() {
                return;
            }
        }
        self.trigger_event(state_key, "input", "change", Value::String(text), cx);
    }

    pub fn trigger_event(
        &mut self,
        node_id: &str,
        component_type: &str,
        event: &str,
        value: Value,
        cx: &mut Context<Self>,
    ) {
        if event == "change" {
            if self.locked_keys.contains(node_id) {
                return;
            }
            self.values.insert(node_id.to_owned(), value.clone());
        }
        if let Some(screen) = &self.screen {
            let mut matches = Vec::new();
            find_event_nodes(&screen.root, node_id, event == "change", &mut matches);
            if matches.len() == 1 {
                let mut detail = match &value {
                    Value::Object(fields) => fields.clone(),
                    other => serde_json::Map::from_iter([("value".into(), other.clone())]),
                };
                if event == "ely:action" && !detail.contains_key("action") {
                    if let Some(action) = value.as_str() {
                        detail.insert("action".into(), Value::String(action.to_owned()));
                    }
                }
                match resolve_event_bindings(matches[0], event, &Value::Object(detail)) {
                    Ok(requests) => self.action_requests.extend(requests),
                    Err(error) => self.last_error = Some(error.message),
                }
            } else if matches.len() > 1 {
                self.last_error = Some(format!("Ambiguous event source: {node_id}"));
            }
        }
        self.events.push(CatalogueEvent {
            node_id: node_id.to_owned(),
            component_type: component_type.to_owned(),
            event: event.to_owned(),
            value,
        });
        cx.notify();
    }

    pub fn submit(&mut self, node_id: &str, cx: &mut Context<Self>) {
        let snapshot = Value::Object(
            self.values
                .iter()
                .map(|(k, v)| (k.clone(), v.clone()))
                .collect(),
        );
        self.trigger_event(node_id, "form", "submit", snapshot, cx);
    }

    fn seed_node_state(&mut self, node: &ScreenNode) {
        let key = state_key_for_node(node);
        if prop_bool(node, "readonly") || prop_bool(node, "disabled") {
            self.locked_keys.insert(key.clone());
        }
        if let Some(checked) = node.props.get("checked").and_then(Value::as_bool) {
            self.values.insert(key.clone(), Value::Bool(checked));
        } else if let Some(val) = node.props.get("value")
            && !val.is_null()
        {
            self.values.insert(key.clone(), val.clone());
        } else if let Some(tags) = node.props.get("tags").and_then(Value::as_array) {
            self.values.insert(key.clone(), Value::Array(tags.clone()));
        } else if let Some(items) = node.props.get("items").and_then(Value::as_array)
            && let Some(first) = items.first().and_then(|item| {
                item.get("value")
                    .or_else(|| item.get("id"))
                    .or_else(|| item.get("label"))
            })
        {
            self.values.insert(key.clone(), first.clone());
        }

        if let Some(fields) = node.props.get("fields").and_then(Value::as_array) {
            for (idx, field) in fields.iter().enumerate() {
                let fkey = field
                    .get("name")
                    .and_then(Value::as_str)
                    .map(|n| format!("{}:{n}", node.id))
                    .unwrap_or_else(|| format!("{}:field-{idx}", node.id));
                if prop_bool(node, "readonly")
                    || prop_bool(node, "disabled")
                    || field.get("readonly").and_then(Value::as_bool) == Some(true)
                    || field.get("disabled").and_then(Value::as_bool) == Some(true)
                {
                    self.locked_keys.insert(fkey.clone());
                }
                let fval = field.get("value").cloned().unwrap_or_else(|| json!(""));
                self.values.insert(fkey, fval);
            }
        }

        for child in &node.children {
            self.seed_node_state(child);
        }
        for slot in node.slots.values() {
            for child in slot {
                self.seed_node_state(child);
            }
        }
    }

    fn sync_inputs(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(screen) = self.screen.clone() else {
            self.inputs.clear();
            self._input_subs.clear();
            return;
        };
        let mut specs = Vec::new();
        collect_input_specs(&screen.root, &mut specs);
        let active_keys: BTreeSet<String> = specs.iter().map(|s| s.key.clone()).collect();
        self.inputs.retain(|k, _| active_keys.contains(k));

        let mut subs = Vec::new();
        for spec in specs {
            let initial = self
                .values
                .get(&spec.key)
                .and_then(Value::as_str)
                .unwrap_or(&spec.initial)
                .to_owned();
            let entity = if let Some(existing) = self.inputs.get(&spec.key) {
                existing.clone()
            } else {
                cx.new(|cx| {
                    let mut ti = TextInput::new(window, cx)
                        .label(spec.label.clone())
                        .placeholder(spec.placeholder.clone());
                    if spec.masked {
                        ti = ti.masked();
                    }
                    if spec.multiline {
                        ti = ti.multi_line(3, 8);
                    }
                    ti.set_text(initial.clone(), cx);
                    ti
                })
            };
            entity.update(cx, |ti, cx| {
                ti.set_label(spec.label.clone(), cx);
                ti.set_placeholder(spec.placeholder.clone(), cx);
                ti.set_disabled(spec.disabled, cx);
                if ti.text() != initial {
                    ti.set_text(initial, cx);
                }
            });

            let key = spec.key.clone();
            let node_id = spec.node_id.clone();
            let comp_type = spec.component_type.clone();
            let sub = cx.subscribe_in(
                &entity,
                window,
                move |this, input, event: &InputEvent, _, cx| match event {
                    InputEvent::Changed => {
                        let text = input.read(cx).text().to_owned();
                        this.trigger_event(&key, &comp_type, "change", Value::String(text), cx);
                    }
                    InputEvent::Submit => {
                        this.submit(&node_id, cx);
                    }
                    InputEvent::Focus | InputEvent::Blur => {}
                },
            );
            subs.push(sub);
            self.inputs.insert(spec.key, entity);
        }
        self._input_subs = subs;
    }

    fn render_node(
        &self,
        node: &ScreenNode,
        prefix: &str,
        window: &mut Window,
        cx: &mut App,
        view: &gpui::WeakEntity<Self>,
    ) -> AnyElement {
        let eid = SharedString::from(format!("{prefix}-{}", node.id));
        let contract = self.registry.get(&node.node_type);
        let state_key = state_key_for_node(node);
        if let Some(el) = self.render_specific_node(
            &node.node_type,
            node,
            &eid,
            &state_key,
            prefix,
            window,
            cx,
            view,
        ) {
            return el;
        }
        let canonical = canonical_component_type(&node.node_type, contract);
        if canonical != node.node_type
            && let Some(el) = self
                .render_specific_node(&canonical, node, &eid, &state_key, prefix, window, cx, view)
        {
            return el;
        }
        self.render_family_component(node, contract, &eid, &state_key, window, cx, view)
    }

    fn render_specific_node(
        &self,
        kind: &str,
        node: &ScreenNode,
        eid: &SharedString,
        state_key: &str,
        prefix: &str,
        window: &mut Window,
        cx: &mut App,
        view: &gpui::WeakEntity<Self>,
    ) -> Option<AnyElement> {
        let eid = eid.clone();
        let state_key = state_key.to_owned();
        let disabled = prop_bool(node, "disabled");
        let readonly = prop_bool(node, "readonly");

        let el: AnyElement = match kind {
            "basic/stack" | "layout/Stack" | "layout/HStack" | "layout/VStack" => {
                let row = prop_bool(node, "horizontal")
                    || prop_str(node, "direction").as_deref() == Some("row")
                    || node.node_type == "layout/HStack";
                let mut stack = if row {
                    h_stack().gap_2().flex_wrap()
                } else {
                    v_stack().gap_2()
                };
                for (idx, child) in node.children.iter().enumerate() {
                    stack = stack.child(self.render_node(
                        child,
                        &format!("{prefix}-c{idx}"),
                        window,
                        cx,
                        view,
                    ));
                }
                stack.into_any_element()
            }
            "basic/grid" | "layout/SimpleGrid" | "layout/Masonry" | "dashboard/DashboardGrid" => {
                let mut grid = SimpleGrid::new(eid, px(220.), px(12.));
                for (idx, child) in node.children.iter().enumerate() {
                    grid = grid.child(self.render_node(
                        child,
                        &format!("{prefix}-g{idx}"),
                        window,
                        cx,
                        view,
                    ));
                }
                grid.into_any_element()
            }
            "basic/card" | "layout/Card" | "layout/Panel" | "layout/Section"
            | "layout/Fieldset" | "layout/Frame" | "layout/Well" => {
                let title = best_title(node);
                let mut card = Card::new();
                if !title.is_empty() {
                    let mut header = CardHeader::new(title);
                    if let Some(desc) = best_body(node) {
                        header = header.description(desc);
                    }
                    card = card.header(header);
                }
                for (idx, child) in node.children.iter().enumerate() {
                    card = card.child(self.render_node(
                        child,
                        &format!("{prefix}-card{idx}"),
                        window,
                        cx,
                        view,
                    ));
                }
                card.into_any_element()
            }
            "basic/separator" | "primitives/Divider" => Divider::horizontal().into_any_element(),
            "basic/alert"
            | "feedback/Alert"
            | "feedback/Banner"
            | "feedback/Callout"
            | "feedback/InlineMessage"
            | "feedback/StatusMessage"
            | "feedback/Admonition" => {
                let title = best_title(node);
                let body = best_body(node).unwrap_or_default();
                let severity = if prop_bool(node, "urgent") {
                    Severity::Warning
                } else {
                    Severity::Info
                };
                if node.node_type == "feedback/Banner" {
                    let mut banner =
                        Banner::new(eid, severity, if body.is_empty() { title } else { body });
                    if let Some(act_lbl) = prop_str(node, "actionLabel").filter(|s| !s.is_empty()) {
                        let v = view.clone();
                        let nid = node.id.clone();
                        let ntype = node.node_type.clone();
                        let act = prop_str(node, "action").unwrap_or_else(|| act_lbl.clone());
                        banner = banner.action(act_lbl, move |_, cx| {
                            let _ = v.update(cx, |this, cx| {
                                this.trigger_event(&nid, &ntype, "ely:action", json!(act), cx);
                            });
                        });
                    }
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    banner = banner.on_dismiss(move |_, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&nid, &ntype, "ely:action", json!("dismiss"), cx);
                        });
                    });
                    banner.into_any_element()
                } else if matches!(
                    node.node_type.as_str(),
                    "feedback/Callout" | "feedback/Admonition"
                ) {
                    Callout::new(severity)
                        .title(if title.is_empty() {
                            "Note".into()
                        } else {
                            title
                        })
                        .child(Paragraph::new(body))
                        .into_any_element()
                } else {
                    let mut alert = Alert::new(
                        eid,
                        severity,
                        if title.is_empty() {
                            "Notice".into()
                        } else {
                            title
                        },
                    );
                    if !body.is_empty() {
                        alert = alert.body(body);
                    }
                    if prop_bool(node, "dismissible") {
                        let v = view.clone();
                        let nid = node.id.clone();
                        let ntype = node.node_type.clone();
                        alert = alert.on_dismiss(move |_, cx| {
                            let _ = v.update(cx, |this, cx| {
                                this.trigger_event(
                                    &nid,
                                    &ntype,
                                    "ely:action",
                                    json!("dismiss"),
                                    cx,
                                );
                            });
                        });
                    }
                    alert.into_any_element()
                }
            }
            "basic/empty-state"
            | "feedback/EmptyState"
            | "feedback/ErrorView"
            | "feedback/ResultView" => {
                let title = non_empty_or(&best_title(node), "Empty");
                let mut es = EmptyState::new(eid, IconName::Inbox, title);
                if let Some(body) = best_body(node) {
                    es = es.body(body);
                }
                es.into_any_element()
            }
            "basic/avatar" | "data/Avatar" | "data/AvatarGroup" | "data/UserChip" => {
                let name = non_empty_or(
                    prop_str(node, "name")
                        .or_else(|| prop_str(node, "label"))
                        .or_else(|| prop_str(node, "title"))
                        .as_deref()
                        .unwrap_or("User"),
                    "User",
                );
                Avatar::new(eid, name).into_any_element()
            }
            "basic/badge" | "data/Badge" | "data/Tag" | "data/CountBadge" | "data/DotBadge"
            | "account/PlanBadge" => {
                let label = non_empty_or(&best_label(node), "Badge");
                if node.node_type == "data/Tag" {
                    if let Some(rows) = node.props.get("tagRows").and_then(Value::as_array) {
                        let mut col = v_stack().gap_2();
                        for (r_idx, row_val) in rows.iter().enumerate() {
                            if let Some(items) = row_val.as_array() {
                                let mut row = h_stack().gap_2().flex_wrap();
                                for (t_idx, item) in items.iter().enumerate() {
                                    let lbl = item
                                        .get("label")
                                        .and_then(Value::as_str)
                                        .unwrap_or("Tag")
                                        .to_owned();
                                    let val = item
                                        .get("value")
                                        .and_then(Value::as_str)
                                        .unwrap_or(&lbl)
                                        .to_owned();
                                    let mut tag = Tag::new(
                                        SharedString::from(format!("{eid}-t-{r_idx}-{t_idx}")),
                                        lbl,
                                    );
                                    if item.get("removable").and_then(Value::as_bool) == Some(true)
                                    {
                                        let v = view.clone();
                                        let nid = node.id.clone();
                                        let ntype = node.node_type.clone();
                                        tag = tag.on_remove(move |_, cx| {
                                            let _ = v.update(cx, |this, cx| {
                                                this.trigger_event(
                                                    &nid,
                                                    &ntype,
                                                    "ely:action",
                                                    json!({"remove": val}),
                                                    cx,
                                                );
                                            });
                                        });
                                    }
                                    row = row.child(tag);
                                }
                                col = col.child(row);
                            }
                        }
                        col.into_any_element()
                    } else {
                        let mut tag = Tag::new(eid, label);
                        let v = view.clone();
                        let nid = node.id.clone();
                        let ntype = node.node_type.clone();
                        if prop_bool(node, "clearable") {
                            tag = tag.on_remove(move |_, cx| {
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(
                                        &nid,
                                        &ntype,
                                        "ely:action",
                                        json!("remove"),
                                        cx,
                                    );
                                });
                            });
                        }
                        tag.into_any_element()
                    }
                } else {
                    Badge::new(label).tone(Tone::Info).into_any_element()
                }
            }
            "basic/button"
            | "buttons/Button"
            | "buttons/IconButton"
            | "buttons/Icon button"
            | "buttons/BackButton"
            | "buttons/CloseButton"
            | "buttons/CopyButton"
            | "buttons/SubmitButton" => {
                let label = non_empty_or(&best_label(node), "Action");
                let variant = match prop_str(node, "buttonVariant")
                    .or_else(|| prop_str(node, "variant"))
                    .as_deref()
                {
                    Some("primary") => ButtonVariant::Primary,
                    Some("outline") => ButtonVariant::Outline,
                    Some("ghost") => ButtonVariant::Ghost,
                    Some("destructive") => ButtonVariant::Danger,
                    _ => ButtonVariant::Secondary,
                };
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                let action_val = prop_str(node, "value")
                    .or_else(|| prop_str(node, "action"))
                    .unwrap_or_else(|| label.clone());
                Button::new(eid, label)
                    .debug_selector({
                        let id = node.id.clone();
                        move || format!("cat-btn-{id}")
                    })
                    .variant(variant)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&nid, &ntype, "click", json!(action_val), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/pin-input" | "forms/PinInput" => {
                let len = prop_f64(node, "length").unwrap_or(6.0).clamp(1.0, 12.0) as usize;
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                PinInput::new(eid, len)
                    .on_complete(move |code, _, cx| {
                        let val = code.to_string();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", Value::String(val), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/hotkey-input" | "forms/HotkeyInput" => {
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                HotkeyInput::new(eid, None)
                    .on_change(move |ks, _, cx| {
                        let val = ks.map(|k| format!("{k:?}")).unwrap_or_default();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", Value::String(val), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/input"
            | "basic/clearable-input"
            | "basic/password-input"
            | "basic/textarea"
            | "forms/Input"
            | "forms/PasswordInput"
            | "forms/EmailInput"
            | "forms/UrlInput"
            | "forms/MaskedInput"
            | "forms/PhoneInput"
            | "forms/CodeInput"
            | "forms/JsonInput"
            | "forms/ExpressionInput"
            | "forms/RegexInput"
            | "forms/AutoResizeInput"
            | "forms/InlineEdit" => {
                self.render_text_input_node(node, &eid, &state_key, disabled, readonly, cx)
            }
            "basic/checkbox" | "forms/Checkbox" | "forms/CheckboxCard" => {
                let label = non_empty_or(&best_label(node), "Checkbox");
                let checked = self.current_bool(&state_key, node);
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                FormField::new(SharedString::from(format!("{eid}-field")), label.clone())
                    .child(
                        div()
                            .debug_selector({
                                let id = node.id.clone();
                                move || format!("cat-cb-{id}")
                            })
                            .child(
                                Checkbox::new(eid, checked)
                                    .label(label)
                                    .disabled(disabled || readonly)
                                    .on_change(move |next, _, cx| {
                                        let _ = v.update(cx, |this, cx| {
                                            this.trigger_event(
                                                &sk,
                                                &ntype,
                                                "change",
                                                Value::Bool(next),
                                                cx,
                                            );
                                        });
                                    }),
                            ),
                    )
                    .into_any_element()
            }
            "basic/switch" | "forms/Switch" => {
                let label = non_empty_or(&best_label(node), "Switch");
                let checked = self.current_bool(&state_key, node);
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                FormField::new(SharedString::from(format!("{eid}-field")), label.clone())
                    .child(
                        div()
                            .debug_selector({
                                let id = node.id.clone();
                                move || format!("cat-sw-{id}")
                            })
                            .child(
                                Switch::new(eid, checked)
                                    .label(label)
                                    .disabled(disabled || readonly)
                                    .on_change(move |next, _, cx| {
                                        let _ = v.update(cx, |this, cx| {
                                            this.trigger_event(
                                                &sk,
                                                &ntype,
                                                "change",
                                                Value::Bool(next),
                                                cx,
                                            );
                                        });
                                    }),
                            ),
                    )
                    .into_any_element()
            }
            "basic/select" | "forms/Select" | "forms/TimezoneSelect" => {
                let label = non_empty_or(&best_label(node), "Select");
                let choices = extract_choices(node);
                let selected = self
                    .values
                    .get(&state_key)
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .or_else(|| choices.first().map(|c| c.value.to_string()))
                    .unwrap_or_default();
                let is_disabled = disabled || readonly || choices.is_empty();
                let safe_choices = if choices.is_empty() {
                    vec![Choice::new("", "None")]
                } else {
                    choices
                };
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                FormField::new(SharedString::from(format!("{eid}-field")), label.clone())
                    .child(
                        Select::new(eid, safe_choices)
                            .label(label)
                            .selected(selected)
                            .disabled(is_disabled)
                            .on_change(move |picked, _, cx| {
                                let val = picked.to_string();
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(
                                        &sk,
                                        &ntype,
                                        "change",
                                        Value::String(val),
                                        cx,
                                    );
                                });
                            }),
                    )
                    .into_any_element()
            }
            "basic/combobox" | "forms/Combobox" => {
                let choices = extract_choices(node);
                let safe_choices = if choices.is_empty() {
                    vec![Choice::new("default", "Default")]
                } else {
                    choices
                };
                if let Some(input_entity) = self.inputs.get(&state_key) {
                    let v = view.clone();
                    let ntype = node.node_type.clone();
                    let sk = state_key.clone();
                    Combobox::new(eid, input_entity, safe_choices)
                        .on_change(move |picked, _, cx| {
                            let val = picked.to_string();
                            let _ = v.update(cx, |this, cx| {
                                this.trigger_event(&sk, &ntype, "change", Value::String(val), cx);
                            });
                        })
                        .into_any_element()
                } else {
                    Label::new(non_empty_or(&best_label(node), "Combobox")).into_any_element()
                }
            }
            "basic/multi-select" | "forms/MultiSelect" => {
                let choices = extract_choices(node);
                let safe_choices = if choices.is_empty() {
                    vec![Choice::new("default", "Default")]
                } else {
                    choices
                };
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                MultiSelect::new(eid, safe_choices)
                    .on_change(move |picked, _, cx| {
                        let vals: Vec<Value> = picked
                            .iter()
                            .map(|s| Value::String(s.to_string()))
                            .collect();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", Value::Array(vals), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/radio-group" | "forms/RadioGroup" | "forms/Radio" => {
                let choices = extract_choices(node);
                let safe_choices = if choices.is_empty() {
                    vec![Choice::new("a", "Option A"), Choice::new("b", "Option B")]
                } else {
                    choices
                };
                let selected = self
                    .values
                    .get(&state_key)
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| safe_choices[0].value.to_string());
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                RadioGroup::new(eid, safe_choices)
                    .selected(selected)
                    .on_change(move |picked, _, cx| {
                        let val = picked.to_string();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", Value::String(val), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/slider" | "forms/Slider" => {
                let min = prop_f64(node, "min").unwrap_or(0.0);
                let raw_max = prop_f64(node, "max").unwrap_or(100.0);
                let max = if raw_max > min { raw_max } else { min + 100.0 };
                let step = prop_f64(node, "step").filter(|s| *s > 0.0).unwrap_or(1.0);
                let current = self
                    .values
                    .get(&state_key)
                    .and_then(Value::as_f64)
                    .or_else(|| prop_f64(node, "value"))
                    .unwrap_or(min)
                    .clamp(min, max);
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                Slider::new(eid, current)
                    .range(min, max)
                    .step(step)
                    .disabled(disabled || readonly)
                    .on_change(move |next, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", json!(next), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/progress" | "motion/ProgressBar" | "data/Meter" => {
                let max = prop_f64(node, "max").filter(|m| *m > 0.0).unwrap_or(100.0);
                let val = prop_f64(node, "value").unwrap_or(0.5);
                let ratio = ((if val <= 1.0 && max == 100.0 && prop_f64(node, "max").is_none() {
                    val
                } else {
                    val / max
                }) as f32)
                    .clamp(0.0, 1.0);
                if node.node_type == "data/Meter" {
                    Meter::new(eid, non_empty_or(&best_label(node), "Meter"), ratio)
                        .into_any_element()
                } else {
                    ProgressBar::new(eid, ratio).into_any_element()
                }
            }
            "basic/tabs" | "navigation/Tabs" => {
                let tabs = extract_choices(node);
                let safe_tabs = if tabs.is_empty() {
                    vec![Choice::new("tab-1", "Overview")]
                } else {
                    tabs
                };
                let selected = self
                    .values
                    .get(&state_key)
                    .and_then(Value::as_str)
                    .filter(|s| safe_tabs.iter().any(|c| c.value.as_ref() == *s))
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| safe_tabs[0].value.to_string());
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                Tabs::new(eid, safe_tabs, selected.clone())
                    .panel(Caption::new(format!("Active tab: {selected}")))
                    .on_change(move |picked, _, cx| {
                        let val = picked.to_string();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", Value::String(val), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/breadcrumb" | "navigation/Breadcrumb" => {
                let items = extract_choices(node);
                let crumbs: Vec<Crumb> = if items.is_empty() {
                    vec![Crumb::new("home", "Home")]
                } else {
                    items
                        .into_iter()
                        .map(|c| Crumb::new(c.value, c.label))
                        .collect()
                };
                let v = view.clone();
                let ntype = node.node_type.clone();
                let nid = node.id.clone();
                Breadcrumb::new(eid, crumbs)
                    .on_select(move |_, picked, _, cx| {
                        let val = picked.to_string();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&nid, &ntype, "change", Value::String(val), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/accordion" | "layout/Accordion" | "layout/Collapsible" => {
                let mut acc = Accordion::new(eid).first_open();
                let items = extract_item_objects(node);
                if items.is_empty() {
                    acc = acc.item(
                        AccordionItem::new(non_empty_or(&best_title(node), "Section"))
                            .child(Paragraph::new(best_body(node).unwrap_or_default())),
                    );
                } else {
                    for item in items {
                        let title = item
                            .get("title")
                            .or_else(|| item.get("label"))
                            .and_then(Value::as_str)
                            .unwrap_or("Section");
                        let body = item
                            .get("text")
                            .or_else(|| item.get("content"))
                            .or_else(|| item.get("body"))
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        acc = acc.item(AccordionItem::new(title).child(Paragraph::new(body)));
                    }
                }
                acc.into_any_element()
            }
            "basic/data-table" | "basic/table" | "tables/DataTable" | "tables/Table" => {
                render_data_table_interactive(node, &eid, &state_key, self, view)
            }
            "basic/datalist" | "data/DescriptionList" | "data/PropertyGrid" => {
                let mut dl = DescriptionList::new();
                for item in extract_item_objects(node) {
                    let k = item
                        .get("label")
                        .or_else(|| item.get("title"))
                        .or_else(|| item.get("key"))
                        .and_then(Value::as_str)
                        .unwrap_or("Field");
                    let v = item
                        .get("value")
                        .or_else(|| item.get("text"))
                        .and_then(Value::as_str)
                        .unwrap_or("");
                    dl = dl.text(k, v);
                }
                dl.into_any_element()
            }
            "basic/timeline" | "data/Timeline" | "data/ActivityFeed" => {
                let mut tl = Timeline::new();
                for item in extract_item_objects(node) {
                    let title = item
                        .get("title")
                        .or_else(|| item.get("label"))
                        .and_then(Value::as_str)
                        .unwrap_or("Event");
                    let mut ti = TimelineItem::new(Label::new(title));
                    if let Some(time) = item
                        .get("time")
                        .or_else(|| item.get("date"))
                        .and_then(Value::as_str)
                    {
                        ti = ti.time(Caption::new(time));
                    }
                    if let Some(text) = item
                        .get("text")
                        .or_else(|| item.get("description"))
                        .and_then(Value::as_str)
                    {
                        ti = ti.child(Caption::new(text));
                    }
                    tl = tl.item(ti);
                }
                tl.into_any_element()
            }
            "basic/code-block"
            | "typography/Code"
            | "typography/SelectableText"
            | "typography/CopyableText" => {
                let text = best_body(node)
                    .or_else(|| prop_str(node, "code"))
                    .or_else(|| prop_str(node, "value"))
                    .unwrap_or_default();
                if node.node_type == "typography/SelectableText" {
                    SelectableText::new(eid, text).into_any_element()
                } else if node.node_type == "typography/CopyableText" {
                    h_stack()
                        .gap_2()
                        .child(SelectableText::new(eid.clone(), text.clone()))
                        .child(CopyButton::new(
                            SharedString::from(format!("{eid}-copy")),
                            text,
                        ))
                        .into_any_element()
                } else {
                    Code::new(text).into_any_element()
                }
            }
            "basic/kbd" | "basic/kbd-group" | "typography/Kbd" | "typography/KbdCombo" => {
                let label = non_empty_or(&best_label(node), "Key");
                Badge::new(label).tone(Tone::Neutral).into_any_element()
            }
            "basic/tag-input" | "forms/TagInput" => {
                let tags: Vec<String> = self
                    .values
                    .get(&state_key)
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter_map(Value::as_str)
                            .map(ToOwned::to_owned)
                            .collect()
                    })
                    .unwrap_or_default();
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                TagInput::new(eid, tags)
                    .on_change(move |next, _, cx| {
                        let vals: Vec<Value> =
                            next.iter().map(|s| Value::String(s.to_string())).collect();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", Value::Array(vals), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/key-value-input" | "forms/KeyValueInput" => {
                let pairs = extract_item_objects(node)
                    .into_iter()
                    .map(|m| {
                        let k = m
                            .get("key")
                            .or_else(|| m.get("label"))
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_owned();
                        let v = m
                            .get("value")
                            .and_then(Value::as_str)
                            .unwrap_or("")
                            .to_owned();
                        (k, v)
                    })
                    .collect::<Vec<_>>();
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                KeyValueInput::new(eid, pairs)
                    .on_change(move |next, _, cx| {
                        let vals: Vec<Value> = next
                            .into_iter()
                            .map(|(k, val)| json!({"key": k, "value": val}))
                            .collect();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", Value::Array(vals), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/calendar" | "forms/Calendar" => {
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                let mut cal = Calendar::new(eid);
                if let Some(d) = self.current_date(&state_key, node) {
                    cal = cal.selected(d);
                }
                cal.on_pick(move |date, _, cx| {
                    let _ = v.update(cx, |this, cx| {
                        this.trigger_event(&sk, &ntype, "change", json!(date.to_string()), cx);
                    });
                })
                .into_any_element()
            }
            "basic/date-picker" | "forms/DatePicker" => {
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                let mut dp = DatePicker::new(eid, self.current_date(&state_key, node))
                    .disabled(disabled || readonly);
                let min_d = prop_str(node, "min").and_then(|s| s.trim().parse::<Date>().ok());
                let max_d = prop_str(node, "max").and_then(|s| s.trim().parse::<Date>().ok());
                if min_d.is_some() || max_d.is_some() {
                    dp = dp.range(min_d, max_d);
                }
                dp.on_change(move |date, _, cx| {
                    let _ = v.update(cx, |this, cx| {
                        this.trigger_event(&sk, &ntype, "change", json!(date.to_string()), cx);
                    });
                })
                .into_any_element()
            }
            "basic/color-picker" | "forms/ColorPicker" => {
                let raw = self
                    .values
                    .get(&state_key)
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .or_else(|| prop_str(node, "value"))
                    .unwrap_or_default();
                let color = parse_color_hsla(&raw, Hsla::default());
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                ColorPicker::new(eid, color)
                    .on_change(move |picked, _, cx| {
                        let rgba = Rgba::from(picked);
                        let hex = format!(
                            "#{:02x}{:02x}{:02x}",
                            (rgba.r.clamp(0.0, 1.0) * 255.0).round() as u8,
                            (rgba.g.clamp(0.0, 1.0) * 255.0).round() as u8,
                            (rgba.b.clamp(0.0, 1.0) * 255.0).round() as u8
                        );
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", json!(hex), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/signature-pad" | "forms/SignaturePad" => {
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                SignaturePad::new(eid, [])
                    .on_change(move |strokes, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", json!(strokes.len()), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/file-dropzone" | "forms/DropZone" => {
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                DropZone::new(eid)
                    .on_drop(move |paths, _, cx| {
                        let vals: Vec<Value> = paths
                            .into_iter()
                            .map(|p| json!(p.to_string_lossy().to_string()))
                            .collect();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", Value::Array(vals), cx);
                        });
                    })
                    .into_any_element()
            }
            "basic/selectable-list" | "lists/ListBox" | "forms/ListBox" => {
                let choices = extract_choices(node);
                let safe_choices = if choices.is_empty() {
                    vec![Choice::new("item-1", "Item 1")]
                } else {
                    choices
                };
                let selected = self
                    .values
                    .get(&state_key)
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned);
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.clone();
                let mut lb = ListBox::new(eid, safe_choices);
                if let Some(sel) = selected {
                    lb = lb.selected([sel]);
                }
                lb.on_change(move |picked, _, cx| {
                    let vals: Vec<Value> = picked
                        .iter()
                        .map(|s| Value::String(s.to_string()))
                        .collect();
                    let next = vals.first().cloned().unwrap_or(Value::Null);
                    let _ = v.update(cx, |this, cx| {
                        this.trigger_event(&sk, &ntype, "change", next, cx);
                    });
                })
                .into_any_element()
            }
            "basic/chart" | "charts/Sparkline" => {
                let mut pts: Vec<f32> = node
                    .props
                    .get("values")
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter_map(Value::as_f64)
                            .filter(|v| v.is_finite())
                            .map(|v| v as f32)
                            .collect()
                    })
                    .unwrap_or_default();
                if pts.len() < 2 {
                    pts = vec![0.2, 0.6, 0.4, 0.8];
                }
                Sparkline::new(pts).into_any_element()
            }
            "basic/field-label" | "forms/FormLabel" => {
                FormLabel::new(eid, non_empty_or(&best_label(node), "Label")).into_any_element()
            }
            "basic/field-description" => {
                Caption::new(best_body(node).unwrap_or_default()).into_any_element()
            }
            "basic/coordinate-display" | "maps/CoordinateDisplay" => {
                let title = non_empty_or(&best_title(node), "Coordinates");
                let value = prop_str(node, "value").unwrap_or_else(|| "0.0, 0.0".into());
                Card::new()
                    .header(CardHeader::new(title))
                    .child(
                        h_stack()
                            .gap_2()
                            .items_center()
                            .child(SelectableText::new(eid.clone(), value.clone()))
                            .child(CopyButton::new(
                                SharedString::from(format!("{eid}-copy")),
                                value,
                            )),
                    )
                    .into_any_element()
            }
            "basic/map-view" | "maps/MapView" => {
                crate::catalogue_ext::visual_finance::render_map_view(node, &eid, &state_key, view)
            }
            "basic/dialog"
            | "overlays/Dialog"
            | "overlays/AlertDialog"
            | "overlays/ConfirmDialog"
            | "feedback/ConfirmationCard" => {
                let title = non_empty_or(&best_title(node), "Confirm");
                let body = best_body(node).unwrap_or_default();
                let confirm_label =
                    prop_str(node, "actionLabel").unwrap_or_else(|| "Confirm".into());
                let v_ok = view.clone();
                let v_cancel = view.clone();
                let nid_ok = node.id.clone();
                let nid_cancel = node.id.clone();
                let ntype_ok = node.node_type.clone();
                let ntype_cancel = node.node_type.clone();
                let mut card = ConfirmationCard::new(eid, title).confirm(confirm_label);
                if !body.is_empty() {
                    card = card.body(body);
                }
                if node.node_type == "overlays/AlertDialog" {
                    card = card.destructive();
                }
                card.on_confirm(move |_, cx| {
                    let _ = v_ok.update(cx, |this, cx| {
                        this.trigger_event(&nid_ok, &ntype_ok, "ely:action", json!("confirm"), cx);
                    });
                })
                .on_cancel(move |_, cx| {
                    let _ = v_cancel.update(cx, |this, cx| {
                        this.trigger_event(
                            &nid_cancel,
                            &ntype_cancel,
                            "ely:action",
                            json!("cancel"),
                            cx,
                        );
                    });
                })
                .into_any_element()
            }
            "basic/menu" | "menus/Menu" | "menus/DropdownMenu" | "menus/ContextMenu"
            | "menus/OverflowMenu" => {
                let title = non_empty_or(&best_title(node), "Menu");
                let choices = extract_choices(node);
                let card = Card::new().header(CardHeader::new(title));
                let mut list = v_stack().gap_1();
                for (idx, ch) in choices.into_iter().take(12).enumerate() {
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    let val = ch.value.to_string();
                    list = list.child(
                        Button::new(SharedString::from(format!("{eid}-m-{idx}")), ch.label)
                            .size(ControlSize::Sm)
                            .variant(ButtonVariant::Ghost)
                            .disabled(disabled || ch.disabled)
                            .on_click(move |_, _, cx| {
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(&nid, &ntype, "click", json!(val), cx);
                                });
                            }),
                    );
                }
                card.child(list).into_any_element()
            }
            "forms/NumberInput" => {
                let label = non_empty_or(&best_label(node), "Number");
                let min = prop_f64(node, "min").unwrap_or(-1_000_000.0);
                let raw_max = prop_f64(node, "max").unwrap_or(1_000_000.0);
                let max = if raw_max >= min { raw_max } else { min };
                let step = prop_f64(node, "step").filter(|s| *s > 0.0).unwrap_or(1.0);
                let val = self
                    .values
                    .get(&state_key)
                    .and_then(value_to_f64)
                    .or_else(|| prop_f64(node, "value"))
                    .unwrap_or(min.max(0.0))
                    .clamp(min, max);
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                FormField::new(SharedString::from(format!("{eid}-field")), label)
                    .child(
                        NumberInput::new(eid, val)
                            .range(min, max)
                            .step(step)
                            .on_change(move |next, _, cx| {
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(&sk, &ntype, "change", json!(next), cx);
                                });
                            }),
                    )
                    .into_any_element()
            }
            "forms/Stepper" => {
                let label = non_empty_or(&best_label(node), "Stepper");
                let min = prop_f64(node, "min").unwrap_or(0.0);
                let raw_max = prop_f64(node, "max").unwrap_or(100.0);
                let max = if raw_max >= min { raw_max } else { min + 10.0 };
                let step = prop_f64(node, "step").filter(|s| *s > 0.0).unwrap_or(1.0);
                let val = self
                    .values
                    .get(&state_key)
                    .and_then(value_to_f64)
                    .or_else(|| prop_f64(node, "value"))
                    .unwrap_or(min)
                    .clamp(min, max);
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                FormField::new(SharedString::from(format!("{eid}-field")), label)
                    .child(
                        h_stack().child(
                            div()
                                .debug_selector({
                                    let id = node.id.clone();
                                    move || format!("cat-step-{id}")
                                })
                                .child(
                                    Stepper::new(eid, val).range(min, max).step(step).on_change(
                                        move |next, _, cx| {
                                            let _ = v.update(cx, |this, cx| {
                                                this.trigger_event(
                                                    &sk,
                                                    &ntype,
                                                    "change",
                                                    json!(next),
                                                    cx,
                                                );
                                            });
                                        },
                                    ),
                                ),
                        ),
                    )
                    .into_any_element()
            }
            "forms/Rating" => {
                let label = non_empty_or(&best_label(node), "Rating");
                let max = prop_f64(node, "max").unwrap_or(5.0).clamp(1.0, 10.0) as u8;
                let val = self
                    .values
                    .get(&state_key)
                    .and_then(value_to_f64)
                    .or_else(|| prop_f64(node, "value"))
                    .unwrap_or(0.0)
                    .clamp(0.0, f64::from(max)) as u8;
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                FormField::new(SharedString::from(format!("{eid}-field")), label)
                    .child(
                        h_stack().child(
                            div()
                                .debug_selector({
                                    let id = node.id.clone();
                                    move || format!("cat-rate-{id}")
                                })
                                .child(
                                    Rating::new(eid, val)
                                        .max(max)
                                        .disabled(disabled || readonly)
                                        .on_change(move |next, _, cx| {
                                            let _ = v.update(cx, |this, cx| {
                                                this.trigger_event(
                                                    &sk,
                                                    &ntype,
                                                    "change",
                                                    json!(next),
                                                    cx,
                                                );
                                            });
                                        }),
                                ),
                        ),
                    )
                    .into_any_element()
            }
            "forms/ChoiceChips" => {
                let label = non_empty_or(&best_label(node), "Choices");
                let choices = extract_choices(node);
                let safe_choices = if choices.is_empty() {
                    vec![Choice::new("a", "A"), Choice::new("b", "B")]
                } else {
                    choices
                };
                let selected: Vec<String> = match self.values.get(&state_key) {
                    Some(Value::Array(arr)) => arr
                        .iter()
                        .filter_map(Value::as_str)
                        .map(ToOwned::to_owned)
                        .collect(),
                    Some(Value::String(s)) => vec![s.clone()],
                    _ => Vec::new(),
                };
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                FormField::new(SharedString::from(format!("{eid}-field")), label)
                    .child(
                        ChoiceChips::new(eid, safe_choices)
                            .selected(selected)
                            .on_change(move |picked, _, cx| {
                                let vals: Vec<Value> =
                                    picked.iter().map(|s| json!(s.to_string())).collect();
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(
                                        &sk,
                                        &ntype,
                                        "change",
                                        Value::Array(vals),
                                        cx,
                                    );
                                });
                            }),
                    )
                    .into_any_element()
            }
            "forms/RangeSlider" => {
                let min = prop_f64(node, "min").unwrap_or(0.0);
                let raw_max = prop_f64(node, "max").unwrap_or(100.0);
                let max = if raw_max > min { raw_max } else { min + 100.0 };
                let step = prop_f64(node, "step").filter(|s| *s > 0.0).unwrap_or(1.0);
                let low = prop_f64(node, "value").unwrap_or(min).clamp(min, max);
                let high = prop_f64(node, "end").unwrap_or(max).clamp(low, max);
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                RangeSlider::new(eid, low, high)
                    .range(min, max)
                    .step(step)
                    .disabled(disabled || readonly)
                    .on_change(move |(a, b), _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", json!([a, b]), cx);
                        });
                    })
                    .into_any_element()
            }
            "forms/DateTimePicker" | "forms/TimePicker" => {
                let label = non_empty_or(&best_label(node), "Date & time");
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                FormField::new(SharedString::from(format!("{eid}-field")), label)
                    .child(
                        DatePicker::new(eid, self.current_date(&state_key, node))
                            .disabled(disabled || readonly)
                            .on_change(move |date, _, cx| {
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(
                                        &sk,
                                        &ntype,
                                        "change",
                                        json!(date.to_string()),
                                        cx,
                                    );
                                });
                            }),
                    )
                    .into_any_element()
            }
            "forms/SearchInput" => {
                let label = non_empty_or(&best_label(node), "Search");
                let mut field = FormField::new(SharedString::from(format!("{eid}-field")), label);
                if let Some(input_entity) = self.inputs.get(&state_key) {
                    field = field.child(SearchInput::new(eid, input_entity));
                } else {
                    field = field.child(Caption::new(prop_str(node, "value").unwrap_or_default()));
                }
                field.into_any_element()
            }
            "buttons/SegmentedControl" => {
                let choices = extract_grouped_choices(node);
                let safe_choices = if choices.is_empty() {
                    vec![Choice::new("a", "One"), Choice::new("b", "Two")]
                } else {
                    choices
                };
                let selected = self
                    .values
                    .get(&state_key)
                    .and_then(Value::as_str)
                    .filter(|s| safe_choices.iter().any(|c| c.value.as_ref() == *s))
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| safe_choices[0].value.to_string());
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                let mut seg = SegmentedControl::new(eid, selected);
                for ch in safe_choices {
                    seg = seg.segment(ch.value, ch.label, None);
                }
                h_stack()
                    .child(
                        div()
                            .debug_selector({
                                let id = node.id.clone();
                                move || format!("cat-seg-{id}")
                            })
                            .child(seg.on_change(move |picked, _, cx| {
                                let val = picked.to_string();
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(&sk, &ntype, "change", json!(val), cx);
                                });
                            })),
                    )
                    .into_any_element()
            }
            "buttons/ToggleGroup" => {
                let choices = extract_grouped_choices(node);
                let safe_choices = if choices.is_empty() {
                    vec![Choice::new("a", "Toggle")]
                } else {
                    choices
                };
                let selected: Vec<String> = match self.values.get(&state_key) {
                    Some(Value::Array(arr)) => arr
                        .iter()
                        .filter_map(Value::as_str)
                        .map(ToOwned::to_owned)
                        .collect(),
                    Some(Value::String(s)) => vec![s.clone()],
                    _ => Vec::new(),
                };
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                let mut tg = ToggleGroup::new(eid).selected(selected);
                for ch in safe_choices {
                    tg = tg.item(ToggleItem::new(ch.value).label(ch.label));
                }
                tg.on_change(move |picked, _, cx| {
                    let vals: Vec<Value> = picked.iter().map(|s| json!(s.to_string())).collect();
                    let _ = v.update(cx, |this, cx| {
                        this.trigger_event(&sk, &ntype, "change", Value::Array(vals), cx);
                    });
                })
                .into_any_element()
            }
            "buttons/ActionBar" | "buttons/ButtonGroup" => {
                let choices = extract_choices(node);
                let mut bar = ActionBar::new();
                let mut grp = ButtonGroup::new();
                for (idx, ch) in choices.into_iter().take(8).enumerate() {
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    let val = ch.value.to_string();
                    let btn = Button::new(SharedString::from(format!("{eid}-ab-{idx}")), ch.label)
                        .size(ControlSize::Sm)
                        .disabled(disabled || ch.disabled)
                        .on_click(move |_, _, cx| {
                            let _ = v.update(cx, |this, cx| {
                                this.trigger_event(&nid, &ntype, "click", json!(val), cx);
                            });
                        });
                    if node.node_type == "buttons/ButtonGroup" {
                        grp = grp.button(btn);
                    } else {
                        bar = bar.child(btn);
                    }
                }
                if node.node_type == "buttons/ButtonGroup" {
                    grp.into_any_element()
                } else {
                    bar.into_any_element()
                }
            }
            "buttons/ActionSheet" => {
                let title = non_empty_or(&best_title(node), "Actions");
                let choices = extract_choices(node);
                let card = Card::new().header(CardHeader::new(title));
                let mut list = v_stack().gap_1();
                for (idx, ch) in choices.into_iter().take(10).enumerate() {
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    let val = ch.value.to_string();
                    list = list.child(
                        Button::new(SharedString::from(format!("{eid}-as-{idx}")), ch.label)
                            .size(ControlSize::Sm)
                            .variant(ButtonVariant::Secondary)
                            .disabled(disabled || ch.disabled)
                            .on_click(move |_, _, cx| {
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(&nid, &ntype, "click", json!(val), cx);
                                });
                            }),
                    );
                }
                card.child(list).into_any_element()
            }
            "navigation/Pagination" => {
                let total = prop_f64(node, "total").unwrap_or(1.0).clamp(1.0, 10_000.0) as usize;
                let current = self
                    .values
                    .get(&state_key)
                    .and_then(value_to_f64)
                    .or_else(|| prop_f64(node, "page"))
                    .unwrap_or(1.0)
                    .clamp(1.0, total as f64) as usize;
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                h_stack()
                    .child(
                        div()
                            .debug_selector({
                                let id = node.id.clone();
                                move || format!("cat-page-{id}")
                            })
                            .child(Pagination::new(eid, current, total).on_change(
                                move |next, _, cx| {
                                    let _ = v.update(cx, |this, cx| {
                                        this.trigger_event(&sk, &ntype, "change", json!(next), cx);
                                    });
                                },
                            )),
                    )
                    .into_any_element()
            }
            "navigation/Steps" | "navigation/Wizard" => {
                let choices = extract_choices(node);
                let safe_choices = if choices.is_empty() {
                    vec![Choice::new("step-1", "Step 1")]
                } else {
                    choices
                };
                let current = self
                    .values
                    .get(&state_key)
                    .and_then(value_to_f64)
                    .map(|n| n as usize)
                    .unwrap_or(0)
                    .min(safe_choices.len().saturating_sub(1));
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                Steps::new(eid, safe_choices, current)
                    .on_select(move |ix, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", json!(ix), cx);
                        });
                    })
                    .into_any_element()
            }
            "overlays/Sheet" | "overlays/Drawer" => {
                let open = self.current_bool(&state_key, node);
                let title = non_empty_or(&best_title(node), "Sheet");
                let trigger_label = non_empty_or(&best_label(node), &title);
                let body = best_body(node).unwrap_or_default();
                let v_open = view.clone();
                let v_close = view.clone();
                let sk_open = state_key.clone();
                let sk_close = state_key.clone();
                let ntype_open = node.node_type.clone();
                let ntype_close = node.node_type.clone();
                let mut box_el = v_stack().gap_2().child(
                    Button::new(SharedString::from(format!("{eid}-open")), trigger_label)
                        .debug_selector({
                            let id = node.id.clone();
                            move || format!("cat-sheet-open-{id}")
                        })
                        .variant(ButtonVariant::Secondary)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            let _ = v_open.update(cx, |this, cx| {
                                this.trigger_event(
                                    &sk_open,
                                    &ntype_open,
                                    "change",
                                    json!(true),
                                    cx,
                                );
                            });
                        }),
                );
                if open {
                    box_el = box_el.child(
                        Sheet::new(eid, Place::Bottom, title, move |_, cx| {
                            let _ = v_close.update(cx, |this, cx| {
                                this.trigger_event(
                                    &sk_close,
                                    &ntype_close,
                                    "change",
                                    json!(false),
                                    cx,
                                );
                            });
                        })
                        .child(Paragraph::new(body)),
                    );
                }
                box_el.into_any_element()
            }
            "data/Gauge" => {
                let gauges = node
                    .props
                    .get("gauges")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                if !gauges.is_empty() {
                    let mut row = h_stack().flex_wrap().gap_3();
                    for (idx, g) in gauges.iter().enumerate() {
                        let lbl = g.get("label").and_then(Value::as_str).unwrap_or("Gauge");
                        let val = g
                            .get("percent")
                            .or_else(|| g.get("value"))
                            .and_then(value_to_f64)
                            .unwrap_or(0.0)
                            .clamp(0.0, 100.0);
                        row = row.child(Gauge::new(
                            SharedString::from(format!("{eid}-g-{idx}")),
                            lbl.to_owned(),
                            val,
                            0.0,
                            100.0,
                        ));
                    }
                    row.into_any_element()
                } else {
                    let min = prop_f64(node, "min").unwrap_or(0.0);
                    let raw_max = prop_f64(node, "max").unwrap_or(100.0);
                    let max = if raw_max > min { raw_max } else { min + 100.0 };
                    let val = prop_f64(node, "value").unwrap_or(min).clamp(min, max);
                    Gauge::new(eid, non_empty_or(&best_label(node), "Gauge"), val, min, max)
                        .into_any_element()
                }
            }
            "data/UsageBar" => {
                let parts = node
                    .props
                    .get("usageParts")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let sum: f64 = parts
                    .iter()
                    .filter_map(|p| p.get("value").and_then(value_to_f64))
                    .map(|v| v.max(0.0))
                    .sum();
                let total = prop_f64(node, "max").unwrap_or(sum).max(sum).max(1.0);
                let mut bar = UsageBar::new(total);
                if parts.is_empty() {
                    bar = bar.part(non_empty_or(&best_label(node), "Used"), total * 0.5);
                } else {
                    for p in &parts {
                        let lbl = p.get("label").and_then(Value::as_str).unwrap_or("Part");
                        let val = p
                            .get("value")
                            .and_then(value_to_f64)
                            .unwrap_or(0.0)
                            .max(0.0);
                        bar = bar.part(lbl.to_owned(), val);
                    }
                }
                bar.into_any_element()
            }
            "data/Statistic" => {
                let stats = node
                    .props
                    .get("statistics")
                    .or_else(|| node.props.get("metrics"))
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                if stats.is_empty() {
                    let val = prop_f64(node, "value").unwrap_or(0.0);
                    KpiCard::new(Statistic::new(
                        eid,
                        non_empty_or(&best_label(node), "Metric"),
                        val,
                    ))
                    .into_any_element()
                } else {
                    let mut row = h_stack().flex_wrap().gap_3();
                    for (idx, s) in stats.iter().enumerate() {
                        let lbl = s.get("label").and_then(Value::as_str).unwrap_or("Metric");
                        let val = s.get("value").and_then(value_to_f64).unwrap_or(0.0);
                        let mut kpi = KpiCard::new(Statistic::new(
                            SharedString::from(format!("{eid}-st-{idx}")),
                            lbl.to_owned(),
                            val,
                        ));
                        if let Some(cap) = s.get("caption").and_then(Value::as_str) {
                            kpi = kpi.caption(cap.to_owned());
                        }
                        row = row.child(kpi);
                    }
                    row.into_any_element()
                }
            }
            "data/Carousel" => {
                let items = extract_item_objects(node);
                let mut carousel = Carousel::new(eid);
                if items.is_empty() {
                    carousel = carousel.child(Card::new().header(CardHeader::new("Slide 1")));
                } else {
                    for item in items {
                        let lbl = item
                            .get("label")
                            .or_else(|| item.get("title"))
                            .and_then(Value::as_str)
                            .unwrap_or("Slide");
                        let alt = item
                            .get("imageAlt")
                            .or_else(|| item.get("text"))
                            .and_then(Value::as_str)
                            .unwrap_or("");
                        let mut hdr = CardHeader::new(lbl.to_owned());
                        if !alt.is_empty() {
                            hdr = hdr.description(alt.to_owned());
                        }
                        carousel = carousel.child(Card::new().header(hdr));
                    }
                }
                carousel.into_any_element()
            }
            "charts/LineChart"
            | "charts/AreaChart"
            | "charts/BarChart"
            | "charts/ScatterChart"
            | "charts/PieChart" => render_ely_chart(node, &eid),
            "lists/Tree" | "lists/CheckboxTree" | "lists/FileTree" | "files/FileTree"
            | "files/FolderTree" => {
                let nodes = parse_tree_nodes(
                    node.props
                        .get("items")
                        .and_then(Value::as_array)
                        .map(Vec::as_slice)
                        .unwrap_or(&[]),
                );
                let is_check = node.node_type == "lists/CheckboxTree";
                let mut tree = Tree::new(eid, nodes);
                if is_check {
                    let v_chk = view.clone();
                    let sk_chk = state_key.clone();
                    let ntype_chk = node.node_type.clone();
                    let checked: Vec<String> = match self.values.get(&state_key) {
                        Some(Value::Array(arr)) => arr
                            .iter()
                            .filter_map(Value::as_str)
                            .map(ToOwned::to_owned)
                            .collect(),
                        _ => Vec::new(),
                    };
                    tree = tree.checked(checked).on_check(move |keys, _, cx| {
                        let vals: Vec<Value> = keys.iter().map(|s| json!(s.to_string())).collect();
                        let _ = v_chk.update(cx, |this, cx| {
                            this.trigger_event(
                                &sk_chk,
                                &ntype_chk,
                                "change",
                                Value::Array(vals),
                                cx,
                            );
                        });
                    });
                } else {
                    let v_sel = view.clone();
                    let sk_sel = state_key.clone();
                    let ntype_sel = node.node_type.clone();
                    if let Some(sel) = self.values.get(&state_key).and_then(Value::as_str) {
                        tree = tree.selected([sel.to_owned()]);
                    }
                    tree = tree.on_select(move |keys, _, cx| {
                        let next = keys
                            .first()
                            .map(|s| json!(s.to_string()))
                            .unwrap_or(Value::Null);
                        let _ = v_sel.update(cx, |this, cx| {
                            this.trigger_event(&sk_sel, &ntype_sel, "change", next, cx);
                        });
                    });
                }
                tree.into_any_element()
            }
            "project/KanbanBoard" => {
                let lanes = node
                    .props
                    .get("lanes")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let mut board = KanbanBoard::new(eid);
                for (l_idx, lane) in lanes.iter().enumerate() {
                    let l_title = lane
                        .get("title")
                        .or_else(|| lane.get("label"))
                        .and_then(Value::as_str)
                        .unwrap_or("Lane");
                    let mut col = KanbanColumn::new(format!("lane-{l_idx}"), l_title.to_owned());
                    for (c_idx, c) in lane
                        .get("cards")
                        .and_then(Value::as_array)
                        .into_iter()
                        .flatten()
                        .enumerate()
                    {
                        let c_key = c
                            .get("value")
                            .or_else(|| c.get("id"))
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| format!("card-{l_idx}-{c_idx}"));
                        let c_title = c
                            .get("title")
                            .or_else(|| c.get("label"))
                            .and_then(Value::as_str)
                            .unwrap_or("Card");
                        col = col.card(KanbanCard::new(c_key, Label::new(c_title.to_owned())));
                    }
                    board = board.column(col);
                }
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                board
                    .on_open(move |key, _, cx| {
                        let val = key.to_string();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&nid, &ntype, "ely:action", json!(val), cx);
                        });
                    })
                    .into_any_element()
            }
            "layout/SplitPane" => {
                let before = prop_str(node, "before").unwrap_or_else(|| "Before".into());
                let after = prop_str(node, "after").unwrap_or_else(|| "After".into());
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                let mut split = SplitPane::new(eid, Axis::Horizontal, px(120.))
                    .pane(Card::new().header(CardHeader::new(before)))
                    .pane(Card::new().header(CardHeader::new(after)));
                if let Some(sizes) = split_weights(self.value(&state_key), 2) {
                    split = split.sizes(&sizes);
                }
                split
                    .on_resize(move |sizes, _, cx| {
                        let vals: Vec<f32> = sizes.to_vec();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", json!(vals), cx);
                        });
                    })
                    .into_any_element()
            }
            "layout/MasterDetail" => {
                let choices = extract_choices(node);
                let selected = self
                    .values
                    .get(&state_key)
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .or_else(|| choices.first().map(|c| c.value.to_string()))
                    .unwrap_or_else(|| "Detail".into());
                let mut master = v_stack().gap_1();
                for (idx, ch) in choices.into_iter().take(12).enumerate() {
                    let is_active = selected == ch.value.as_ref();
                    let v = view.clone();
                    let sk = state_key.clone();
                    let ntype = node.node_type.clone();
                    let val = ch.value.to_string();
                    master = master.child(
                        Button::new(SharedString::from(format!("{eid}-md-{idx}")), ch.label)
                            .size(ControlSize::Sm)
                            .variant(if is_active {
                                ButtonVariant::Secondary
                            } else {
                                ButtonVariant::Ghost
                            })
                            .on_click(move |_, _, cx| {
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(&sk, &ntype, "change", json!(val), cx);
                                });
                            }),
                    );
                }
                let detail = Card::new().header(
                    CardHeader::new(selected)
                        .description(prop_str(node, "caption").unwrap_or_default()),
                );
                MasterDetail::new(eid, master, detail, px(640.))
                    .available_width(window.viewport_size().width)
                    .into_any_element()
            }
            "layout/AppShell" => {
                let title = non_empty_or(&best_title(node), "Workspace");
                let sidebar_items = node
                    .props
                    .get("sidebarItems")
                    .and_then(Value::as_array)
                    .cloned()
                    .unwrap_or_default();
                let mut sb_col = v_stack().gap_1().p_2();
                for (idx, item) in sidebar_items.iter().enumerate() {
                    let lbl = item.get("label").and_then(Value::as_str).unwrap_or("Nav");
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    let val = lbl.to_owned();
                    sb_col = sb_col.child(
                        Button::new(
                            SharedString::from(format!("{eid}-sb-{idx}")),
                            lbl.to_owned(),
                        )
                        .size(ControlSize::Sm)
                        .variant(ButtonVariant::Ghost)
                        .on_click(move |_, _, cx| {
                            let _ = v.update(cx, |this, cx| {
                                this.trigger_event(&nid, &ntype, "ely:action", json!(val), cx);
                            });
                        }),
                    );
                }
                let sidebar =
                    Sidebar::new(SharedString::from(format!("{eid}-sidebar")), false).child(sb_col);
                AppShell::new()
                    .sidebar(sidebar)
                    .child(Card::new().header(
                        CardHeader::new(title).description(best_body(node).unwrap_or_default()),
                    ))
                    .into_any_element()
            }
            "motion/Spinner" => Spinner::new(eid).into_any_element(),
            "buttons/ToggleButton" => {
                let on = self.current_bool(&state_key, node);
                let label = non_empty_or(&best_label(node), "Toggle");
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                ToggleButton::new(eid, ToggleItem::new(sk.clone()).label(label), on)
                    .disabled(disabled)
                    .on_toggle(move |next, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", json!(next), cx);
                        });
                    })
                    .into_any_element()
            }
            "buttons/ConfirmButton" => {
                let label = non_empty_or(&best_label(node), "Confirm");
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                ConfirmButton::new(eid, label, ConfirmMode::Twice)
                    .on_confirm(move |_, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&nid, &ntype, "ely:action", json!("confirm"), cx);
                        });
                    })
                    .into_any_element()
            }
            "buttons/FloatingActionButton" => {
                let label = non_empty_or(&best_label(node), "Add");
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                FloatingActionButton::new(eid, IconName::Plus)
                    .label(label)
                    .on_click(move |_, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&nid, &ntype, "click", json!("fab"), cx);
                        });
                    })
                    .into_any_element()
            }
            "buttons/BulkActionBar" => {
                let count = extract_choices(node).len().max(1);
                let mut bar = BulkActionBar::new(eid, count);
                for (idx, ch) in extract_choices(node).into_iter().take(4).enumerate() {
                    let v = view.clone();
                    let nid = node.id.clone();
                    let ntype = node.node_type.clone();
                    let val = ch.value.to_string();
                    bar = bar.action(
                        Button::new(SharedString::from(format!("{nid}-bulk-{idx}")), ch.label)
                            .size(ControlSize::Sm)
                            .on_click(move |_, _, cx| {
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(&nid, &ntype, "click", json!(val), cx);
                                });
                            }),
                    );
                }
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                bar = bar.on_clear(move |_, cx| {
                    let _ = v.update(cx, |this, cx| {
                        this.trigger_event(&nid, &ntype, "ely:action", json!("clear"), cx);
                    });
                });
                bar.into_any_element()
            }
            "buttons/SplitButton" => {
                let choices = extract_choices(node);
                let primary = non_empty_or(&best_label(node), "Run");
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                let mut grp = ButtonGroup::new().button(
                    Button::new(SharedString::from(format!("{eid}-main")), primary)
                        .variant(ButtonVariant::Primary)
                        .disabled(disabled)
                        .on_click(move |_, _, cx| {
                            let _ = v.update(cx, |this, cx| {
                                this.trigger_event(&nid, &ntype, "click", json!("primary"), cx);
                            });
                        }),
                );
                if let Some(first) = choices.into_iter().next() {
                    let v2 = view.clone();
                    let nid2 = node.id.clone();
                    let ntype2 = node.node_type.clone();
                    let val2 = first.value.to_string();
                    grp = grp.button(
                        Button::new(SharedString::from(format!("{eid}-alt")), first.label)
                            .variant(ButtonVariant::Secondary)
                            .disabled(disabled)
                            .on_click(move |_, _, cx| {
                                let _ = v2.update(cx, |this, cx| {
                                    this.trigger_event(&nid2, &ntype2, "click", json!(val2), cx);
                                });
                            }),
                    );
                }
                grp.into_any_element()
            }
            "data/Stars" => {
                let max = prop_f64(node, "max").unwrap_or(5.0).clamp(1.0, 10.0) as u8;
                let score = prop_f64(node, "value")
                    .unwrap_or(4.0)
                    .clamp(0.0, f64::from(max)) as f32;
                Stars::new(score).max(max).into_any_element()
            }
            "data/QRCode" => {
                let value = prop_str(node, "value").unwrap_or_else(|| "https://ely.dev".into());
                match QrCode::new(value.as_bytes()) {
                    Ok(qr) => qr.into_any_element(),
                    Err(_) => Badge::new(value).tone(Tone::Info).into_any_element(),
                }
            }
            "data/Comparison" => {
                let cols: Vec<String> = extract_choices(node)
                    .into_iter()
                    .take(3)
                    .map(|c| c.label.to_string())
                    .collect();
                let cols = if cols.is_empty() {
                    vec!["Standard".into(), "Pro".into()]
                } else {
                    cols
                };
                Comparison::new(cols).into_any_element()
            }
            "data/BeforeAfter" => {
                let before = prop_str(node, "before").unwrap_or_else(|| "Before".into());
                let after = prop_str(node, "after").unwrap_or_else(|| "After".into());
                BeforeAfter::new(eid, Label::new(before), Label::new(after)).into_any_element()
            }
            "dashboard/AlertList" => {
                let now = Timestamp::UNIX_EPOCH;
                let items: Vec<MonitorAlert> = extract_item_objects(node)
                    .into_iter()
                    .enumerate()
                    .map(|(i, m)| {
                        let severity = match m.get("severity").and_then(Value::as_str) {
                            Some("danger") => Severity::Danger,
                            Some("info") => Severity::Info,
                            Some("success") => Severity::Success,
                            _ => Severity::Warning,
                        };
                        let state = match m.get("state").and_then(Value::as_str) {
                            Some("acknowledged") => AlertState::Acknowledged,
                            Some("resolved") => AlertState::Resolved,
                            _ => AlertState::Firing,
                        };
                        MonitorAlert {
                            key: m
                                .get("key")
                                .or_else(|| m.get("value"))
                                .and_then(Value::as_str)
                                .map(ToOwned::to_owned)
                                .unwrap_or_else(|| format!("alert-{i}"))
                                .into(),
                            title: m
                                .get("title")
                                .or_else(|| m.get("label"))
                                .and_then(Value::as_str)
                                .unwrap_or("Alert")
                                .to_owned()
                                .into(),
                            source: m
                                .get("source")
                                .and_then(Value::as_str)
                                .unwrap_or("system")
                                .to_owned()
                                .into(),
                            severity,
                            state,
                            since: now,
                        }
                    })
                    .collect();
                let v1 = view.clone();
                let nid1 = node.id.clone();
                let nt1 = node.node_type.clone();
                let v2 = view.clone();
                let nid2 = node.id.clone();
                let nt2 = node.node_type.clone();
                AlertList::new(eid, items, now)
                    .on_open(move |key, _, cx| {
                        let k = key.to_string();
                        let _ = v1.update(cx, |this, cx| {
                            this.trigger_event(&nid1, &nt1, "ely:action", json!({"open": k}), cx);
                        });
                    })
                    .on_acknowledge(move |key, _, cx| {
                        let k = key.to_string();
                        let _ = v2.update(cx, |this, cx| {
                            this.trigger_event(
                                &nid2,
                                &nt2,
                                "ely:action",
                                json!({"acknowledge": k}),
                                cx,
                            );
                        });
                    })
                    .into_any_element()
            }
            "dashboard/UptimeBar" => {
                let services = vec![Service {
                    name: non_empty_or(&best_title(node), "API").into(),
                    health: Health::Operational,
                    uptime: Some(0.999),
                }];
                v_stack()
                    .gap_2()
                    .child(ServiceStatus::new(services))
                    .child(UptimeBar::new(
                        eid,
                        non_empty_or(&best_title(node), "API"),
                        jiff::civil::date(2026, 11, 1),
                        [Some(1.0), Some(1.0), Some(0.995), Some(1.0)],
                    ))
                    .into_any_element()
            }
            "dashboard/EventStream" => {
                let now = Timestamp::UNIX_EPOCH;
                let events: Vec<StreamEvent> = extract_item_objects(node)
                    .into_iter()
                    .enumerate()
                    .map(|(i, m)| StreamEvent {
                        key: format!("ev-{i}").into(),
                        at: now,
                        kind: m
                            .get("kind")
                            .or_else(|| m.get("source"))
                            .and_then(Value::as_str)
                            .unwrap_or("app")
                            .to_owned()
                            .into(),
                        text: m
                            .get("text")
                            .or_else(|| m.get("message"))
                            .or_else(|| m.get("title"))
                            .and_then(Value::as_str)
                            .unwrap_or("Event")
                            .to_owned()
                            .into(),
                        tone: Tone::Info,
                    })
                    .collect();
                EventStream::new(eid, events, now).into_any_element()
            }
            "charts/RadarChart" => RadarChart::new(eid, ["CPU", "Memory", "Disk", "Net"])
                .series(ChartSeries::new(
                    non_empty_or(&best_label(node), "Usage"),
                    [65.0, 80.0, 45.0, 70.0],
                ))
                .into_any_element(),
            "charts/FunnelChart" => FunnelChart::new(eid)
                .stage("Visits", 1000.0)
                .stage("Signups", 420.0)
                .stage("Active", 180.0)
                .into_any_element(),
            "charts/Bullet Chart" => BulletChart::new(eid)
                .bullet(Bullet::new(
                    non_empty_or(&best_label(node), "Target"),
                    72.0,
                    85.0,
                ))
                .into_any_element(),
            "charts/WaterfallChart" => WaterfallChart::new(eid)
                .step("Start", 100.0)
                .step("Delta", 25.0)
                .step("Loss", -10.0)
                .into_any_element(),
            "charts/Histogram" => {
                Histogram::new(eid, [10.0, 14.0, 18.0, 22.0, 25.0, 30.0]).into_any_element()
            }
            "project/Burndown Chart" => BurndownChart::new(
                eid,
                jiff::civil::date(2026, 11, 1),
                jiff::civil::date(2026, 11, 10),
                30.0,
            )
            .into_any_element(),
            "feedback/SavingIndicator" => {
                let saving = prop_bool(node, "saving") || prop_bool(node, "loading");
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                SavingIndicator::new(
                    eid,
                    if saving {
                        SaveState::Saving
                    } else {
                        SaveState::Saved
                    },
                )
                .on_retry(move |_, cx| {
                    let _ = v.update(cx, |this, cx| {
                        this.trigger_event(&nid, &ntype, "ely:action", json!("retry"), cx);
                    });
                })
                .into_any_element()
            }
            "motion/ProgressRing" => {
                let val = prop_f64(node, "value").unwrap_or(0.6).clamp(0.0, 1.0) as f32;
                ProgressRing::new(eid, val).into_any_element()
            }
            "motion/Skeleton" => SkeletonText::new(eid, 3).into_any_element(),
            "forms/ColorSwatch" => {
                let raw_sel = self
                    .values
                    .get(&state_key)
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .or_else(|| prop_str(node, "value"))
                    .unwrap_or_else(|| "#335cff".into());
                let mut choices = extract_choices(node);
                if choices.is_empty()
                    && let Some(arr) = node.props.get("swatches").and_then(Value::as_array)
                {
                    for (ix, item) in arr.iter().enumerate() {
                        if let Some(obj) = item.as_object()
                            && let Some(val) = obj.get("value").and_then(Value::as_str)
                        {
                            let lbl = obj.get("label").and_then(Value::as_str).unwrap_or(val);
                            choices.push(Choice::new(val.to_owned(), lbl.to_owned()));
                        } else if let Some(s) = item.as_str() {
                            choices.push(Choice::new(s.to_owned(), format!("Swatch {}", ix + 1)));
                        }
                    }
                }
                if choices.is_empty() {
                    choices.push(Choice::new(raw_sel.clone(), raw_sel.clone()));
                }
                let mut row = h_stack().gap_2().flex_wrap();
                for (ix, ch) in choices.into_iter().take(12).enumerate() {
                    let val = ch.value.to_string();
                    let selected = raw_sel.eq_ignore_ascii_case(&val);
                    let color = parse_color_hsla(&val, Hsla::default());
                    let v = view.clone();
                    let sk = state_key.clone();
                    let ntype = node.node_type.clone();
                    row = row.child(
                        ColorSwatch::new(SharedString::from(format!("{eid}-sw-{ix}")), color)
                            .selected(selected)
                            .tooltip(ch.label)
                            .on_click(move |_, cx| {
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(&sk, &ntype, "change", json!(val), cx);
                                });
                            }),
                    );
                }
                row.into_any_element()
            }
            "forms/InlineForm" => {
                let mut form = InlineForm::new();
                if let Some(input_entity) = self.inputs.get(&state_key) {
                    form = form.child(Input::new(input_entity));
                }
                let label = prop_str(node, "actionLabel").unwrap_or_else(|| "Apply".into());
                let v = view.clone();
                let nid = node.id.clone();
                form.child(Button::new(eid, label).primary().on_click(move |_, _, cx| {
                    let _ = v.update(cx, |this, cx| this.submit(&nid, cx));
                }))
                .into_any_element()
            }
            "forms/UnitInput" => {
                let val = self
                    .values
                    .get(&state_key)
                    .and_then(value_to_f64)
                    .or_else(|| prop_f64(node, "value"))
                    .unwrap_or(0.0);
                let units: Vec<SharedString> = node
                    .props
                    .get("units")
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter_map(Value::as_str)
                            .map(|s| SharedString::from(s.to_owned()))
                            .collect()
                    })
                    .filter(|v: &Vec<SharedString>| !v.is_empty())
                    .unwrap_or_else(|| {
                        vec![
                            SharedString::from("ms"),
                            SharedString::from("s"),
                            SharedString::from("m"),
                        ]
                    });
                let unit = prop_str(node, "suffix")
                    .filter(|s| units.iter().any(|u| u.as_ref() == s))
                    .map(SharedString::from)
                    .unwrap_or_else(|| units[0].clone());
                let v1 = view.clone();
                let sk1 = state_key.clone();
                let nt1 = node.node_type.clone();
                let v2 = view.clone();
                let nid2 = node.id.clone();
                let nt2 = node.node_type.clone();
                UnitInput::new(eid, val, units, unit)
                    .on_change(move |next, _, cx| {
                        let _ = v1.update(cx, |this, cx| {
                            this.trigger_event(&sk1, &nt1, "change", json!(next), cx);
                        });
                    })
                    .on_unit(move |unit, _, cx| {
                        let _ = v2.update(cx, |this, cx| {
                            this.trigger_event(
                                &nid2,
                                &nt2,
                                "ely:action",
                                json!(unit.to_string()),
                                cx,
                            );
                        });
                    })
                    .into_any_element()
            }
            "forms/PathInput" => {
                if let Some(input_entity) = self.inputs.get(&state_key) {
                    PathInput::new(eid, input_entity).into_any_element()
                } else {
                    Label::new(prop_str(node, "value").unwrap_or_else(|| "/".into()))
                        .into_any_element()
                }
            }
            "lists/TreeSelect" => {
                let nodes = parse_tree_nodes(
                    node.props
                        .get("items")
                        .and_then(Value::as_array)
                        .map(Vec::as_slice)
                        .unwrap_or(&[]),
                );
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                TreeSelect::new(eid, nodes)
                    .on_change(move |picked, _, cx| {
                        let val = picked.to_string();
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", json!(val), cx);
                        });
                    })
                    .into_any_element()
            }
            "lists/SelectableList"
            | "lists/List"
            | "lists/DirectoryListing"
            | "lists/GroupedList"
            | "lists/Outline" => {
                let choices = extract_choices(node);
                let safe = if choices.is_empty() {
                    vec![Choice::new("item-1", "Item 1")]
                } else {
                    choices
                };
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                ListBox::new(eid, safe)
                    .on_change(move |picked, _, cx| {
                        let next = picked
                            .first()
                            .map(|s| json!(s.to_string()))
                            .unwrap_or(Value::Null);
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", next, cx);
                        });
                    })
                    .into_any_element()
            }
            "navigation/BackForwardNavigation" => {
                let choices = extract_choices(node);
                let safe = if choices.is_empty() {
                    vec![Choice::new("home", "Home"), Choice::new("next", "Detail")]
                } else {
                    choices
                };
                let seeded = extract_item_objects(node)
                    .iter()
                    .position(|o| o.get("selected").and_then(Value::as_bool) == Some(true))
                    .unwrap_or(0);
                let cur = self
                    .values
                    .get(&state_key)
                    .and_then(value_to_f64)
                    .map(|n| n as usize)
                    .unwrap_or(seeded)
                    .min(safe.len().saturating_sub(1));
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                BackForwardNavigation::new(eid, safe, cur)
                    .on_go(move |ix, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", json!(ix), cx);
                        });
                    })
                    .into_any_element()
            }
            "navigation/LoadMore" | "motion/LoadMore" => {
                let loading = prop_bool(node, "loading");
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                LoadMore::new(eid, loading)
                    .on_load(move |_, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&nid, &ntype, "click", json!("load-more"), cx);
                        });
                    })
                    .into_any_element()
            }
            "navigation/EditorTabs" => {
                let choices = extract_choices(node);
                let tabs: Vec<EditorTab> = if choices.is_empty() {
                    vec![EditorTab::new("main", "main.rs")]
                } else {
                    choices
                        .into_iter()
                        .map(|c| EditorTab::new(c.value, c.label))
                        .collect()
                };
                let v1 = view.clone();
                let sk1 = state_key.clone();
                let nt1 = node.node_type.clone();
                let v2 = view.clone();
                let nid2 = node.id.clone();
                let nt2 = node.node_type.clone();
                let mut et = EditorTabs::new(eid, tabs);
                if let Some(sel) = self.values.get(&state_key).and_then(Value::as_str) {
                    et = et.selected(sel.to_owned());
                }
                et.on_select(move |key, _, cx| {
                    let _ = v1.update(cx, |this, cx| {
                        this.trigger_event(&sk1, &nt1, "change", json!(key.to_string()), cx);
                    });
                })
                .on_close(move |key, _, cx| {
                    let _ = v2.update(cx, |this, cx| {
                        this.trigger_event(
                            &nid2,
                            &nt2,
                            "ely:action",
                            json!({"close": key.as_ref()}),
                            cx,
                        );
                    });
                })
                .into_any_element()
            }
            "project/PriorityIndicator" => PriorityIndicator::new(eid, Priority::High)
                .labeled()
                .into_any_element(),
            "shell/StatusBar" => {
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                StatusBar::new()
                    .left(
                        StatusBarItem::new(eid)
                            .label(prop_str(node, "status").unwrap_or_else(|| "Ready".into()))
                            .on_click(move |_, _, cx| {
                                let _ = v.update(cx, |this, cx| {
                                    this.trigger_event(&nid, &ntype, "click", json!("status"), cx);
                                });
                            }),
                    )
                    .into_any_element()
            }
            "shell/TitleBar" => TitleBar::new(eid)
                .title(non_empty_or(&best_title(node), "Window"))
                .into_any_element(),
            "shell/TabBar" => {
                let mut bar = TabBar::new(eid);
                for ch in extract_choices(node).into_iter().take(6) {
                    bar = bar.tab(WindowTab::new(ch.value, ch.label));
                }
                if let Some(sel) = self.values.get(&state_key).and_then(Value::as_str) {
                    bar = bar.selected(sel.to_owned());
                }
                let v1 = view.clone();
                let sk1 = state_key.clone();
                let nt1 = node.node_type.clone();
                let v2 = view.clone();
                let nid2 = node.id.clone();
                let nt2 = node.node_type.clone();
                bar.on_select(move |key, _, cx| {
                    let _ = v1.update(cx, |this, cx| {
                        this.trigger_event(&sk1, &nt1, "change", json!(key.to_string()), cx);
                    });
                })
                .on_close(move |key, _, cx| {
                    let _ = v2.update(cx, |this, cx| {
                        this.trigger_event(
                            &nid2,
                            &nt2,
                            "ely:action",
                            json!({"close": key.as_ref()}),
                            cx,
                        );
                    });
                })
                .into_any_element()
            }
            "tables/HeatmapTable" => HeatmapTable::new(["A", "B", "C"])
                .row("Row 1", [10.0, 50.0, 90.0])
                .into_any_element(),
            "terminal/AnsiText" => AnsiText::new(
                best_body(node)
                    .or_else(|| prop_str(node, "value"))
                    .unwrap_or_default(),
            )
            .into_any_element(),
            "terminal/LogViewer" => {
                let lines = std::rc::Rc::new(vec![LogLine {
                    at: "00:00:00".into(),
                    level: LogLevel::Info,
                    target: "app".into(),
                    message: best_body(node).unwrap_or_else(|| "Ready".into()).into(),
                }]);
                let v1 = view.clone();
                let sk1 = state_key.clone();
                let nt1 = node.node_type.clone();
                let v2 = view.clone();
                let sk2 = state_key.clone();
                let nt2 = node.node_type.clone();
                LogViewer::new(eid, lines)
                    .on_follow(move |follow, _, cx| {
                        let _ = v1.update(cx, |this, cx| {
                            this.trigger_event(&sk1, &nt1, "change", json!({"follow": follow}), cx);
                        });
                    })
                    .on_least(move |lvl, _, cx| {
                        let _ = v2.update(cx, |this, cx| {
                            this.trigger_event(
                                &sk2,
                                &nt2,
                                "change",
                                json!({"level": format!("{lvl:?}")}),
                                cx,
                            );
                        });
                    })
                    .into_any_element()
            }
            "terminal/CommandBlock" => {
                let v1 = view.clone();
                let sk1 = state_key.clone();
                let nt1 = node.node_type.clone();
                let v2 = view.clone();
                let nid2 = node.id.clone();
                let nt2 = node.node_type.clone();
                CommandBlock::new(
                    eid,
                    "~",
                    prop_str(node, "command").unwrap_or_else(|| "echo ok".into()),
                    prop_str(node, "output").unwrap_or_default(),
                    CommandState::Done {
                        code: 0,
                        took: std::time::Duration::from_millis(12),
                    },
                )
                .on_fold(move |folded, _, cx| {
                    let _ = v1.update(cx, |this, cx| {
                        this.trigger_event(&sk1, &nt1, "change", json!({"folded": folded}), cx);
                    });
                })
                .on_rerun(move |_, cx| {
                    let _ = v2.update(cx, |this, cx| {
                        this.trigger_event(&nid2, &nt2, "ely:action", json!("rerun"), cx);
                    });
                })
                .into_any_element()
            }
            "typography/Heading" => {
                Heading::h2(non_empty_or(&best_title(node), "Heading")).into_any_element()
            }
            "typography/Title" => {
                Title::new(non_empty_or(&best_title(node), "Title")).into_any_element()
            }
            "typography/Subtitle" => {
                Subtitle::new(non_empty_or(&best_title(node), "Subtitle")).into_any_element()
            }
            "typography/Label" => {
                Label::new(non_empty_or(&best_label(node), "Label")).into_any_element()
            }
            "typography/Caption" => {
                Caption::new(best_body(node).unwrap_or_default()).into_any_element()
            }
            "typography/Overline" => {
                Overline::new(non_empty_or(&best_label(node), "SECTION")).into_any_element()
            }
            "typography/Paragraph" => {
                Paragraph::new(best_body(node).unwrap_or_default()).into_any_element()
            }
            "typography/Blockquote" => Blockquote::new()
                .child(Paragraph::new(best_body(node).unwrap_or_default()))
                .into_any_element(),
            "typography/ExternalLink" | "typography/Link" => {
                let label = non_empty_or(&best_label(node), "Open");
                let v = view.clone();
                let nid = node.id.clone();
                let ntype = node.node_type.clone();
                let target = prop_str(node, "href").unwrap_or_else(|| label.clone());
                Link::new(eid, label, move |_, _, cx| {
                    let _ = v.update(cx, |this, cx| {
                        this.trigger_event(&nid, &ntype, "click", json!(target), cx);
                    });
                })
                .into_any_element()
            }
            "typography/Latex" => {
                let expr = best_body(node)
                    .or_else(|| prop_str(node, "value"))
                    .unwrap_or_else(|| "x^2".into());
                match Latex::parse(&expr) {
                    Ok(math) => math.into_any_element(),
                    Err(_) => Code::new(expr).into_any_element(),
                }
            }
            "typography/AnimatedNumber" => {
                AnimatedNumber::new(eid, prop_f64(node, "value").unwrap_or(0.0)).into_any_element()
            }
            "typography/Highlight" => {
                let txt = best_body(node).unwrap_or_default();
                let query = prop_str(node, "query").unwrap_or_default();
                Highlight::matching(txt, &query).into_any_element()
            }
            "typography/Emoji" => {
                Emoji::new(prop_str(node, "value").unwrap_or_else(|| "✨".into()))
                    .into_any_element()
            }
            "misc/Clock" => Clock::new(eid).into_any_element(),
            "misc/Stopwatch" => Stopwatch::new(eid).into_any_element(),
            "misc/Calculator" => Calculator::new(eid).into_any_element(),
            "misc/Poll" => {
                let q = non_empty_or(&best_title(node), "Poll");
                let opts: Vec<String> = extract_choices(node)
                    .into_iter()
                    .map(|c| c.label.to_string())
                    .collect();
                let opts = if opts.is_empty() {
                    vec!["Yes".into(), "No".into()]
                } else {
                    opts
                };
                let v = view.clone();
                let sk = state_key.clone();
                let ntype = node.node_type.clone();
                Poll::new(eid, q, opts, move |idx, _, cx| {
                    let _ = v.update(cx, |this, cx| {
                        this.trigger_event(&sk, &ntype, "change", json!(idx), cx);
                    });
                })
                .into_any_element()
            }
            _ => {
                return crate::catalogue_ext::render(
                    kind, node, &eid, &state_key, self, window, cx, view,
                );
            }
        };
        Some(el)
    }

    fn render_text_input_node(
        &self,
        node: &ScreenNode,
        eid: &SharedString,
        state_key: &str,
        disabled: bool,
        readonly: bool,
        cx: &App,
    ) -> AnyElement {
        let label = non_empty_or(&best_label(node), "Input");
        let mut field = FormField::new(SharedString::from(format!("{eid}-field")), label);
        if prop_bool(node, "required") {
            field = field.required();
        }
        if let Some(desc) = prop_str(node, "description").or_else(|| prop_str(node, "hint")) {
            field = field.description(desc);
        }
        if readonly && !disabled {
            let value = self
                .values
                .get(state_key)
                .and_then(Value::as_str)
                .or_else(|| prop_str(node, "value").as_deref().map(|_| ""))
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_default();
            let colors = &cx.theme().colors;
            let box_el = div()
                .id(SharedString::from(format!("{eid}-ro")))
                .w_full()
                .min_h(px(36.))
                .flex()
                .items_center()
                .justify_between()
                .gap_2()
                .px_3()
                .py_1p5()
                .rounded(px(6.))
                .border_1()
                .border_color(colors.border)
                .bg(colors.bg)
                .child(div().flex_1().min_w_0().child(SelectableText::new(
                    SharedString::from(format!("{eid}-sel")),
                    value.clone(),
                )))
                .child(CopyButton::new(
                    SharedString::from(format!("{eid}-copy")),
                    value,
                ));
            return field.child(box_el).into_any_element();
        }
        if let Some(input_entity) = self.inputs.get(state_key) {
            let control = if matches!(
                node.node_type.as_str(),
                "basic/password-input" | "forms/PasswordInput"
            ) {
                PasswordInput::new(input_entity).into_any_element()
            } else if node.node_type == "forms/CodeInput" || node.node_type == "forms/JsonInput" {
                CodeInput::new(input_entity).into_any_element()
            } else {
                let mut inp = Input::new(input_entity);
                if node.node_type == "basic/clearable-input" {
                    inp = inp.clearable();
                }
                inp.into_any_element()
            };
            return field.child(control).into_any_element();
        }
        field
            .child(Caption::new(prop_str(node, "value").unwrap_or_default()))
            .into_any_element()
    }

    fn render_family_component(
        &self,
        node: &ScreenNode,
        contract: Option<&CatalogueContract>,
        eid: &SharedString,
        state_key: &str,
        _window: &mut Window,
        cx: &App,
        view: &gpui::WeakEntity<Self>,
    ) -> AnyElement {
        let family = contract
            .and_then(|c| c.family.as_deref())
            .unwrap_or("foundation");
        let title = non_empty_or(&best_title(node), &node.node_type);
        let body_text = best_body(node);
        let disabled = prop_bool(node, "disabled");
        let readonly = prop_bool(node, "readonly");

        let mut header = CardHeader::new(title);
        if let Some(desc) = body_text.clone() {
            header = header.description(desc);
        } else {
            header = header.description(format!("{} ({family})", node.node_type));
        }
        if let Some(action_label) = prop_str(node, "actionLabel")
            .or_else(|| prop_str(node, "submitLabel"))
            .or_else(|| prop_str(node, "createActionLabel"))
        {
            let v = view.clone();
            let nid = node.id.clone();
            let ntype = node.node_type.clone();
            let action_name = prop_str(node, "action").unwrap_or_else(|| action_label.clone());
            header = header.action(
                Button::new(SharedString::from(format!("{eid}-hdr-act")), action_label)
                    .size(ControlSize::Sm)
                    .variant(ButtonVariant::Primary)
                    .disabled(disabled)
                    .on_click(move |_, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&nid, &ntype, "ely:action", json!(action_name), cx);
                        });
                    }),
            );
        }

        let mut card = Card::new().header(header);

        if let Some(fields) = node.props.get("fields").and_then(Value::as_array) {
            let mut form = Form::new(SharedString::from(format!("{eid}-form")));
            let nid = node.id.clone();
            let v_submit = view.clone();
            form = form.on_submit(move |_, cx| {
                let _ = v_submit.update(cx, |this, cx| this.submit(&nid, cx));
            });
            for (idx, field) in fields.iter().enumerate() {
                let fname = field
                    .get("name")
                    .and_then(Value::as_str)
                    .map(ToOwned::to_owned)
                    .unwrap_or_else(|| format!("field-{idx}"));
                let fkey = format!("{}:{fname}", node.id);
                let flabel = field
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or(&fname)
                    .to_owned();
                let f_ro = readonly || field.get("readonly").and_then(Value::as_bool) == Some(true);
                let f_dis =
                    disabled || field.get("disabled").and_then(Value::as_bool) == Some(true);
                let mut ff = FormField::new(SharedString::from(format!("{eid}-ff-{idx}")), flabel);
                if f_ro && !f_dis {
                    let val = self
                        .values
                        .get(&fkey)
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_owned();
                    ff = ff.child(SelectableText::new(
                        SharedString::from(format!("{eid}-ff-ro-{idx}")),
                        val,
                    ));
                } else if let Some(input_entity) = self.inputs.get(&fkey) {
                    ff = ff.child(Input::new(input_entity));
                }
                form = form.child(ff);
            }
            card = card.child(form);
        } else if self.inputs.contains_key(state_key) {
            card = card
                .child(self.render_text_input_node(node, eid, state_key, disabled, readonly, cx));
        }

        if node.props.contains_key("checked") {
            let checked = self.current_bool(state_key, node);
            let v = view.clone();
            let ntype = node.node_type.clone();
            let sk = state_key.to_owned();
            card = card.child(
                Switch::new(SharedString::from(format!("{eid}-sw")), checked)
                    .label(non_empty_or(&best_label(node), "Enabled"))
                    .disabled(disabled || readonly)
                    .on_change(move |next, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", Value::Bool(next), cx);
                        });
                    }),
            );
        }

        let choices = extract_choices(node);
        if !choices.is_empty() {
            let active = self
                .values
                .get(state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            let mut row = h_stack().flex_wrap().gap_1();
            for (idx, choice) in choices.into_iter().take(12).enumerate() {
                let is_active = active.as_deref() == Some(choice.value.as_ref());
                let v = view.clone();
                let ntype = node.node_type.clone();
                let sk = state_key.to_owned();
                let val = choice.value.to_string();
                row = row.child(
                    Button::new(
                        SharedString::from(format!("{eid}-item-{idx}")),
                        choice.label,
                    )
                    .size(ControlSize::Sm)
                    .variant(if is_active {
                        ButtonVariant::Secondary
                    } else {
                        ButtonVariant::Ghost
                    })
                    .disabled(disabled || choice.disabled)
                    .on_click(move |_, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&sk, &ntype, "change", json!(val), cx);
                        });
                    }),
                );
            }
            card = card.child(row);
        }

        if node.props.contains_key("columns") || node.props.contains_key("rows") {
            card = card.child(render_data_table_interactive(
                node, eid, state_key, self, view,
            ));
        }

        if let Some(metric) = prop_f64(node, "value")
            && !self.inputs.contains_key(state_key)
        {
            card = card.child(
                Statistic::new(
                    SharedString::from(format!("{eid}-stat")),
                    non_empty_or(&best_label(node), "Value"),
                    metric,
                )
                .decimals(1),
            );
        }

        if let Some(cancel_label) = prop_str(node, "cancelLabel") {
            let v = view.clone();
            let nid = node.id.clone();
            let ntype = node.node_type.clone();
            card = card.footer(
                Button::new(SharedString::from(format!("{eid}-cancel")), cancel_label)
                    .size(ControlSize::Sm)
                    .variant(ButtonVariant::Ghost)
                    .on_click(move |_, _, cx| {
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&nid, &ntype, "ely:action", json!("cancel"), cx);
                        });
                    }),
            );
        }

        card.into_any_element()
    }

    pub(crate) fn current_bool(&self, state_key: &str, node: &ScreenNode) -> bool {
        self.values
            .get(state_key)
            .and_then(Value::as_bool)
            .unwrap_or_else(|| prop_bool(node, "checked"))
    }

    fn current_date(&self, state_key: &str, node: &ScreenNode) -> Option<Date> {
        self.values
            .get(state_key)
            .and_then(Value::as_str)
            .and_then(|s| s.trim().parse::<Date>().ok())
            .or_else(|| prop_str(node, "value").and_then(|s| s.trim().parse::<Date>().ok()))
    }
}

fn parse_color_hsla(raw: &str, fallback: Hsla) -> Hsla {
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

impl Render for CatalogueView {
    fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let view = cx.entity().downgrade();
        let mut root = v_stack()
            .w_full()
            .gap_3()
            .debug_selector(|| "cat-screen-root".into());
        if let Some(err) = &self.last_error {
            root = root.child(
                Alert::new(
                    "catalogue-error",
                    Severity::Danger,
                    "Unsupported catalogue screen",
                )
                .body(err.clone()),
            );
        }
        if let Some(screen) = &self.screen {
            root = root.child(self.render_node(&screen.root, "cat", window, cx, &view));
        } else {
            root = root.child(Caption::new("No catalogue screen loaded."));
        }
        root
    }
}

struct InputSpec {
    key: String,
    node_id: String,
    component_type: String,
    label: String,
    placeholder: String,
    initial: String,
    masked: bool,
    multiline: bool,
    disabled: bool,
}

fn state_key_for_node(node: &ScreenNode) -> String {
    prop_str(node, "name").unwrap_or_else(|| node.id.clone())
}

fn find_event_nodes<'a>(
    node: &'a ScreenNode,
    key: &str,
    change: bool,
    found: &mut Vec<&'a ScreenNode>,
) {
    if (change && state_key_for_node(node) == key) || (!change && node.id == key) {
        found.push(node);
    }
    for child in &node.children {
        find_event_nodes(child, key, change, found);
    }
    for children in node.slots.values() {
        for child in children {
            find_event_nodes(child, key, change, found);
        }
    }
}

fn is_text_input_node(node: &ScreenNode) -> bool {
    let contract = CatalogueRegistry::global().get(&node.node_type);
    let canonical = canonical_component_type(&node.node_type, contract);
    matches!(
        node.node_type.as_str(),
        "basic/input"
            | "basic/clearable-input"
            | "basic/password-input"
            | "basic/textarea"
            | "basic/hotkey-input"
            | "basic/pin-input"
            | "basic/combobox"
    ) || matches!(canonical.as_str(), |"forms/Input"| "forms/PasswordInput"
        | "forms/SearchInput"
        | "forms/EmailInput"
        | "forms/UrlInput"
        | "forms/MaskedInput"
        | "forms/PhoneInput"
        | "forms/NumberInput"
        | "forms/CodeInput"
        | "forms/JsonInput"
        | "forms/ExpressionInput"
        | "forms/RegexInput"
        | "forms/AutoResizeInput"
        | "forms/PinInput"
        | "forms/HotkeyInput"
        | "forms/InlineEdit"
        | "forms/Combobox"
        | "forms/PathInput")
}

fn canonical_component_type(node_type: &str, contract: Option<&CatalogueContract>) -> String {
    if let Some(c) = contract
        && let (Some(ch), Some(pr)) = (c.chapter.as_deref(), c.primary.as_deref())
    {
        return format!("{ch}/{pr}");
    }
    node_type.to_owned()
}

fn collect_input_specs(node: &ScreenNode, out: &mut Vec<InputSpec>) {
    let disabled = prop_bool(node, "disabled");
    let readonly = prop_bool(node, "readonly");
    if is_text_input_node(node) && !(readonly && !disabled) {
        out.push(InputSpec {
            key: state_key_for_node(node),
            node_id: node.id.clone(),
            component_type: node.node_type.clone(),
            label: non_empty_or(&best_label(node), "Input"),
            placeholder: prop_str(node, "placeholder").unwrap_or_default(),
            initial: prop_str(node, "value").unwrap_or_default(),
            masked: matches!(
                node.node_type.as_str(),
                "basic/password-input" | "forms/PasswordInput"
            ),
            multiline: node.node_type == "basic/textarea",
            disabled,
        });
    }
    if let Some(fields) = node.props.get("fields").and_then(Value::as_array) {
        for (idx, field) in fields.iter().enumerate() {
            let f_dis = disabled || field.get("disabled").and_then(Value::as_bool) == Some(true);
            let f_ro = readonly || field.get("readonly").and_then(Value::as_bool) == Some(true);
            if f_ro && !f_dis {
                continue;
            }
            let fname = field
                .get("name")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("field-{idx}"));
            out.push(InputSpec {
                key: format!("{}:{fname}", node.id),
                node_id: node.id.clone(),
                component_type: node.node_type.clone(),
                label: field
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or(&fname)
                    .to_owned(),
                placeholder: field
                    .get("placeholder")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned(),
                initial: field
                    .get("value")
                    .and_then(Value::as_str)
                    .unwrap_or("")
                    .to_owned(),
                masked: field.get("type").and_then(Value::as_str) == Some("password"),
                multiline: false,
                disabled: f_dis,
            });
        }
    }
    for child in &node.children {
        collect_input_specs(child, out);
    }
    for slot in node.slots.values() {
        for child in slot {
            collect_input_specs(child, out);
        }
    }
}

fn render_data_table_interactive(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &gpui::WeakEntity<CatalogueView>,
) -> AnyElement {
    let state_key = Some(state_key);
    let view_state = Some(view_state);
    let view = Some(view);
    let col_labels: Vec<String> = node
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
                                .or_else(|| c.get("name"))
                                .and_then(Value::as_str)
                                .map(ToOwned::to_owned)
                        })
                        .unwrap_or_else(|| format!("Column {}", i + 1))
                })
                .collect()
        })
        .filter(|cols: &Vec<String>| !cols.is_empty())
        .unwrap_or_else(|| vec!["Item".into(), "Value".into()]);

    let columns: Vec<Column> = col_labels
        .iter()
        .enumerate()
        .map(|(i, title)| Column::new(format!("col-{i}"), title.clone()))
        .collect();
    let col_count = columns.len();

    let rows: Vec<Row> = node
        .props
        .get("rows")
        .and_then(Value::as_array)
        .map(|raw_rows| {
            raw_rows
                .iter()
                .enumerate()
                .map(|(r_idx, r)| {
                    let mut cells: Vec<Cell> = if let Some(arr) = r.as_array() {
                        arr.iter().map(json_to_cell).collect()
                    } else if let Some(arr) = r.get("cells").and_then(Value::as_array) {
                        arr.iter().map(json_to_cell).collect()
                    } else {
                        vec![json_to_cell(r)]
                    };
                    cells.resize(col_count, Cell::Empty);
                    Row::new(format!("row-{r_idx}"), cells)
                })
                .collect()
        })
        .unwrap_or_default();

    let mut table = DataTable::new(SharedString::from(format!("{eid}-table")), columns).rows(rows);
    if let (Some(sk), Some(vs), Some(v)) = (state_key, view_state, view) {
        if let Some(sel) = vs.value(sk).and_then(Value::as_array) {
            let keys: Vec<String> = sel
                .iter()
                .filter_map(Value::as_str)
                .map(ToOwned::to_owned)
                .collect();
            table = table.selected(keys);
        }
        let v = v.clone();
        let sk = sk.to_owned();
        let ntype = node.node_type.clone();
        table = table.on_select(move |keys, _, cx| {
            let vals: Vec<Value> = keys.iter().map(|k| json!(k.to_string())).collect();
            let _ = v.update(cx, |this, cx| {
                this.trigger_event(&sk, &ntype, "change", Value::Array(vals), cx);
            });
        });
    }
    table.into_any_element()
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
        Value::Object(map) => {
            let label = map
                .get("label")
                .or_else(|| map.get("text"))
                .or_else(|| map.get("value"))
                .and_then(Value::as_str)
                .unwrap_or("");
            Cell::Text(label.to_owned().into())
        }
        Value::Array(arr) => Cell::Text(format!("{} items", arr.len()).into()),
    }
}

pub(crate) fn extract_choices(node: &ScreenNode) -> Vec<Choice> {
    for key in ["options", "items", "tabs"] {
        if let Some(arr) = node.props.get(key).and_then(Value::as_array) {
            let mut choices = Vec::new();
            for (idx, item) in arr.iter().enumerate() {
                if let Some(s) = item.as_str() {
                    choices.push(Choice::new(s.to_owned(), s.to_owned()));
                } else if let Some(obj) = item.as_object() {
                    let label = obj
                        .get("label")
                        .or_else(|| obj.get("title"))
                        .or_else(|| obj.get("name"))
                        .or_else(|| obj.get("value"))
                        .and_then(Value::as_str)
                        .unwrap_or("Item");
                    let value = obj
                        .get("value")
                        .or_else(|| obj.get("id"))
                        .or_else(|| obj.get("name"))
                        .or_else(|| obj.get("label"))
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("item-{idx}"));
                    let mut ch = Choice::new(value, label.to_owned());
                    if let Some(note) = obj
                        .get("text")
                        .or_else(|| obj.get("hint"))
                        .and_then(Value::as_str)
                    {
                        ch = ch.note(note.to_owned());
                    }
                    if obj.get("disabled").and_then(Value::as_bool) == Some(true) {
                        ch = ch.disabled();
                    }
                    choices.push(ch);
                }
            }
            if !choices.is_empty() {
                return choices;
            }
        }
    }
    Vec::new()
}

pub(crate) fn extract_item_objects(node: &ScreenNode) -> Vec<serde_json::Map<String, Value>> {
    for key in ["items", "rows", "entries"] {
        if let Some(arr) = node.props.get(key).and_then(Value::as_array) {
            let objs: Vec<_> = arr.iter().filter_map(|v| v.as_object().cloned()).collect();
            if !objs.is_empty() {
                return objs;
            }
        }
    }
    Vec::new()
}

pub(crate) fn prop_str(node: &ScreenNode, key: &str) -> Option<String> {
    node.props.get(key).and_then(|v| match v {
        Value::String(s) => Some(s.clone()),
        Value::Number(n) => Some(n.to_string()),
        _ => None,
    })
}

pub(crate) fn prop_bool(node: &ScreenNode, key: &str) -> bool {
    node.props
        .get(key)
        .and_then(Value::as_bool)
        .unwrap_or(false)
}

pub(crate) fn prop_f64(node: &ScreenNode, key: &str) -> Option<f64> {
    node.props.get(key).and_then(value_to_f64)
}

pub(crate) fn value_to_f64(v: &Value) -> Option<f64> {
    match v {
        Value::Number(n) => n.as_f64().filter(|f| f.is_finite()),
        Value::String(s) => s
            .trim()
            .trim_start_matches('$')
            .trim_end_matches('%')
            .replace(',', "")
            .parse::<f64>()
            .ok()
            .filter(|f| f.is_finite()),
        _ => None,
    }
}

pub(crate) fn split_weights(value: Option<&Value>, count: usize) -> Option<Vec<f32>> {
    let values = value?.as_array()?;
    if values.len() != count {
        return None;
    }
    let weights: Vec<f32> = values
        .iter()
        .map(|v| v.as_f64().unwrap_or(f64::NAN) as f32)
        .collect();
    let sum: f32 = weights.iter().sum();
    (weights.iter().all(|v| v.is_finite() && *v >= 0.0) && sum.is_finite() && sum > 0.0)
        .then_some(weights)
}

pub(crate) fn extract_grouped_choices(node: &ScreenNode) -> Vec<Choice> {
    let direct = extract_choices(node);
    if !direct.is_empty() {
        return direct;
    }
    let mut out = Vec::new();
    if let Some(groups) = node.props.get("groups").and_then(Value::as_array) {
        for g in groups {
            if let Some(items) = g.get("items").and_then(Value::as_array) {
                for (idx, item) in items.iter().enumerate() {
                    let label = item
                        .get("label")
                        .or_else(|| item.get("value"))
                        .and_then(Value::as_str)
                        .unwrap_or("Item");
                    let value = item
                        .get("value")
                        .or_else(|| item.get("label"))
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("g-{idx}"));
                    out.push(Choice::new(value, label.to_owned()));
                }
            }
        }
    }
    out
}

pub(crate) fn parse_tree_nodes(items: &[Value]) -> Vec<TreeNode> {
    items
        .iter()
        .enumerate()
        .map(|(idx, item)| {
            let label = item
                .get("label")
                .or_else(|| item.get("title"))
                .and_then(Value::as_str)
                .unwrap_or("Node");
            let key = item
                .get("value")
                .or_else(|| item.get("id"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("node-{idx}"));
            let mut node = TreeNode::new(key, label.to_owned());
            if let Some(children) = item.get("children").and_then(Value::as_array) {
                node = node.children(parse_tree_nodes(children));
            }
            node
        })
        .collect()
}

fn render_ely_chart(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let clamp_chart = |v: f64| -> f64 {
        if v.is_finite() {
            v.clamp(-CHART_LIMIT * 0.5, CHART_LIMIT * 0.5)
        } else {
            0.0
        }
    };
    if node.node_type == "charts/ScatterChart" {
        let mut pts: Vec<(f64, f64)> = prop_str(node, "points")
            .map(|raw| {
                raw.split_whitespace()
                    .filter_map(|pair| {
                        let (a, b) = pair.split_once(',')?;
                        Some((clamp_chart(a.parse().ok()?), clamp_chart(b.parse().ok()?)))
                    })
                    .collect()
            })
            .unwrap_or_default();
        if pts.is_empty() {
            pts = vec![(0.0, 10.0), (1.0, 20.0), (2.0, 15.0)];
        }
        return ScatterChart::new(eid.clone())
            .points(Points::new("Series", pts))
            .into_any_element();
    }
    if node.node_type == "charts/PieChart" {
        let mut pie = PieChart::new(eid.clone());
        let mut count = 0usize;
        if let Some(items) = node.props.get("segments").and_then(Value::as_array) {
            for (idx, item) in items.iter().enumerate() {
                let lbl = item.get("label").and_then(Value::as_str).unwrap_or("Slice");
                let val = item
                    .get("value")
                    .and_then(value_to_f64)
                    .unwrap_or(1.0)
                    .max(0.0);
                pie = pie.slice(format!("{lbl}-{idx}"), clamp_chart(val).max(0.0));
                count += 1;
            }
        }
        if count == 0 {
            pie = pie.slice("A", 60.0).slice("B", 40.0);
        }
        return pie.into_any_element();
    }
    let mut values: Vec<f64> = if let Some(raw) = prop_str(node, "points") {
        raw.split_whitespace()
            .filter_map(|pair| pair.split_once(',')?.1.parse::<f64>().ok())
            .map(clamp_chart)
            .collect()
    } else if let Some(bars) = node.props.get("bars").and_then(Value::as_array) {
        bars.iter()
            .filter_map(|b| b.get("height").and_then(value_to_f64))
            .map(clamp_chart)
            .collect()
    } else {
        Vec::new()
    };
    if values.len() < 2 {
        values = vec![12.0, 24.0, 18.0, 32.0];
    }
    let labels: Vec<String> = (1..=values.len()).map(|i| format!("{i}")).collect();
    let series = ChartSeries::new(non_empty_or(&best_label(node), "Series"), values);
    match node.node_type.as_str() {
        "charts/BarChart" => BarChart::new(eid.clone(), labels)
            .series(series)
            .into_any_element(),
        "charts/AreaChart" => AreaChart::new(eid.clone(), labels)
            .series(series)
            .into_any_element(),
        _ => LineChart::new(eid.clone(), labels)
            .series(series)
            .into_any_element(),
    }
}

pub(crate) fn best_title(node: &ScreenNode) -> String {
    prop_str(node, "title")
        .or_else(|| prop_str(node, "label"))
        .or_else(|| prop_str(node, "name"))
        .unwrap_or_default()
}

pub(crate) fn best_label(node: &ScreenNode) -> String {
    prop_str(node, "label")
        .or_else(|| prop_str(node, "ariaLabel"))
        .or_else(|| prop_str(node, "title"))
        .or_else(|| prop_str(node, "text"))
        .or_else(|| prop_str(node, "name"))
        .unwrap_or_default()
}

pub(crate) fn best_body(node: &ScreenNode) -> Option<String> {
    prop_str(node, "text")
        .or_else(|| prop_str(node, "content"))
        .or_else(|| prop_str(node, "body"))
        .or_else(|| prop_str(node, "message"))
        .or_else(|| prop_str(node, "description"))
}

pub(crate) fn non_empty_or(s: &str, fallback: &str) -> String {
    if s.trim().is_empty() {
        fallback.to_owned()
    } else {
        s.to_owned()
    }
}
