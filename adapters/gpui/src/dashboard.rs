//! elysdui v1 Screen validation, Perses DashboardSpec projection, and extensible GPUI DashboardGrid renderer.

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
    rc::Rc,
};

use ely_gpui_component::{
    dashboard::{DashboardCard, DashboardGrid, Tile},
    data_display::{Badge, Statistic, Tone},
    feedback::Alert,
    layout::{ScrollArea, h_stack, v_stack},
    primitives::Severity,
    typography::{Caption, Label},
};
use gpui::{
    AnyElement, App, ElementId, IntoElement, ParentElement, SharedString, Styled, Window, div,
    prelude::*, px,
};
use gpui_liveplot::{
    LineStyle, Plot, PlotView, PlotViewConfig, Point as PlotPoint, Rgba, Series, SeriesKind,
    Theme as PlotTheme,
};
use serde::{Deserialize, Serialize};
use serde_json::{Value, json};

use crate::profile::{
    MAX_DEPTH, MAX_NODES, MAX_RESPONSE_BYTES, MAX_STRING_BYTES, is_valid_node_id,
    reject_ambiguous_json,
};

pub const SCHEMA_VERSION: &str = "1";
pub const MAX_SCHEMA_BYTES: usize = MAX_RESPONSE_BYTES;
pub const HARD_MAX_STRING_BYTES: usize = 262_144;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ScreenError {
    pub message: String,
}

impl ScreenError {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ScreenError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ScreenError {}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct Screen {
    pub version: String,
    pub id: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub loader: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub templates: BTreeMap<String, Value>,
    pub root: ScreenNode,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ScreenNode {
    pub id: String,
    #[serde(rename = "type", default)]
    pub node_type: String,
    #[serde(default)]
    pub props: BTreeMap<String, Value>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub bindings: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub children: Vec<ScreenNode>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub event: Option<Value>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub events: Vec<Value>,
    #[serde(rename = "use", default, skip_serializing_if = "Option::is_none")]
    pub use_template: Option<String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub params: BTreeMap<String, Value>,
    #[serde(
        rename = "paramBindings",
        default,
        skip_serializing_if = "BTreeMap::is_empty"
    )]
    pub param_bindings: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub slots: BTreeMap<String, Vec<ScreenNode>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub when: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub repeat: Option<Value>,
}

pub fn decode_screen_json(bytes: &[u8]) -> Result<Screen, ScreenError> {
    if bytes.len() > MAX_SCHEMA_BYTES {
        return Err(ScreenError::new("Schema exceeds 1 MiB limit."));
    }
    reject_ambiguous_json(bytes).map_err(|e| ScreenError::new(e.message))?;
    let screen: Screen = serde_json::from_slice(bytes)
        .map_err(|e| ScreenError::new(format!("Invalid screen JSON: {e}")))?;
    validate_screen(&screen)?;
    Ok(screen)
}

pub fn validate_screen(screen: &Screen) -> Result<(), ScreenError> {
    if screen.version != SCHEMA_VERSION {
        return Err(ScreenError::new(format!(
            "Unsupported schema version '{}': expected '{}'.",
            screen.version, SCHEMA_VERSION
        )));
    }
    if !is_valid_node_id(&screen.id) {
        return Err(ScreenError::new("Invalid screen ID."));
    }
    let mut ids = BTreeSet::new();
    let mut count = 0usize;

    fn check_value_strings(value: &Value) -> Result<(), ScreenError> {
        match value {
            Value::String(s) if s.len() > HARD_MAX_STRING_BYTES => {
                Err(ScreenError::new("String property exceeds 262,144 bytes."))
            }
            Value::Array(items) => {
                for item in items {
                    check_value_strings(item)?;
                }
                Ok(())
            }
            Value::Object(map) => {
                for (k, v) in map {
                    if k.len() > MAX_STRING_BYTES {
                        return Err(ScreenError::new("Object key exceeds 16,384 bytes."));
                    }
                    check_value_strings(v)?;
                }
                Ok(())
            }
            _ => Ok(()),
        }
    }

    fn visit(
        node: &ScreenNode,
        depth: usize,
        ids: &mut BTreeSet<String>,
        count: &mut usize,
    ) -> Result<(), ScreenError> {
        *count += 1;
        if depth > MAX_DEPTH || *count > MAX_NODES {
            return Err(ScreenError::new(
                "Screen exceeds maximum node count or depth.",
            ));
        }
        if !is_valid_node_id(&node.id) || node.id.starts_with("sdui-internal-") {
            return Err(ScreenError::new(format!("Invalid node ID '{}'.", node.id)));
        }
        if !ids.insert(node.id.clone()) {
            return Err(ScreenError::new(format!(
                "Duplicate node ID '{}'.",
                node.id
            )));
        }
        if node.use_template.is_none() && node.node_type.is_empty() {
            return Err(ScreenError::new(format!(
                "Node '{}' must declare either 'type' or 'use'.",
                node.id
            )));
        }
        for (k, v) in &node.props {
            if k.len() > MAX_STRING_BYTES {
                return Err(ScreenError::new("Property key exceeds 16,384 bytes."));
            }
            check_value_strings(v)?;
        }
        for child in &node.children {
            visit(child, depth + 1, ids, count)?;
        }
        for slot_children in node.slots.values() {
            for child in slot_children {
                visit(child, depth + 1, ids, count)?;
            }
        }
        Ok(())
    }

    visit(&screen.root, 1, &mut ids, &mut count)?;
    Ok(())
}

/// Top-level Perses-compatible dashboard document.
#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DashboardSpec {
    pub kind: String,
    pub metadata: DashboardMetadata,
    pub spec: DashboardBody,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DashboardMetadata {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub project: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DashboardBody {
    pub display: DashboardDisplay,
    #[serde(default)]
    pub variables: Vec<VariableSpec>,
    pub panels: BTreeMap<String, PanelSpec>,
    pub layouts: Vec<LayoutSpec>,
    pub duration: String,
    #[serde(
        rename = "refreshInterval",
        default,
        skip_serializing_if = "Option::is_none"
    )]
    pub refresh_interval: Option<String>,
    #[serde(default = "default_timezone")]
    pub timezone: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct DashboardDisplay {
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct VariableSpec {
    pub kind: String,
    pub spec: VariableBody,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct VariableBody {
    pub name: String,
    pub label: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PanelSpec {
    pub kind: String,
    pub spec: PanelBody,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PanelBody {
    pub display: PanelDisplay,
    pub plugin: PluginSpec,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub queries: Vec<QuerySpec>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PanelDisplay {
    pub name: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct PluginSpec {
    pub kind: String,
    #[serde(default)]
    pub spec: Value,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct QuerySpec {
    pub kind: String,
    pub spec: QueryBody,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct QueryBody {
    pub datasource: String,
    pub metric: String,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub variables: Vec<String>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct LayoutSpec {
    pub kind: String,
    pub spec: GridLayoutSpec,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GridLayoutSpec {
    pub columns: u32,
    pub items: Vec<GridItemSpec>,
}

#[derive(Clone, Debug, PartialEq, Serialize, Deserialize)]
pub struct GridItemSpec {
    pub x: u32,
    pub y: u32,
    pub width: u32,
    pub height: u32,
    pub content: JsonRef,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct JsonRef {
    #[serde(rename = "$ref")]
    pub reference: String,
}

fn default_timezone() -> String {
    "UTC".into()
}

impl DashboardSpec {
    pub fn grid_columns(&self) -> u32 {
        self.spec
            .layouts
            .first()
            .map_or(12, |layout| layout.spec.columns.max(1))
    }

    pub fn tiles(&self, compact: bool) -> Vec<Tile> {
        let Some(layout) = self.spec.layouts.first() else {
            return Vec::new();
        };
        layout
            .spec
            .items
            .iter()
            .filter_map(|item| {
                let key = item.content.reference.strip_prefix("#/spec/panels/")?;
                let height = if compact && key == "filters" {
                    item.height.min(3)
                } else {
                    item.height
                };
                Some(Tile::new(
                    key.to_owned(),
                    (item.x, item.y),
                    (item.width, height),
                ))
            })
            .collect()
    }

    pub fn apply_tiles(&mut self, tiles: &[Tile]) {
        let Some(layout) = self.spec.layouts.first_mut() else {
            return;
        };
        layout.spec.items = tiles
            .iter()
            .filter(|tile| self.spec.panels.contains_key(tile.key.as_ref()))
            .map(|tile| GridItemSpec {
                x: tile.x,
                y: tile.y,
                width: tile.w,
                height: tile.h,
                content: JsonRef {
                    reference: format!("#/spec/panels/{}", tile.key),
                },
            })
            .collect();
    }

    pub fn set_variable(&mut self, name: &str, value: Option<String>) {
        if let Some(var) = self.spec.variables.iter_mut().find(|v| v.spec.name == name) {
            var.spec.value = value;
        }
    }

    pub fn variable(&self, name: &str) -> Option<&str> {
        self.spec
            .variables
            .iter()
            .find(|v| v.spec.name == name)
            .and_then(|v| v.spec.value.as_deref())
    }

    pub fn variable_map(&self) -> BTreeMap<String, Option<String>> {
        self.spec
            .variables
            .iter()
            .map(|v| (v.spec.name.clone(), v.spec.value.clone()))
            .collect()
    }

    pub fn to_perses_json(&self) -> Result<String, ScreenError> {
        serde_json::to_string_pretty(self).map_err(|e| ScreenError::new(e.to_string()))
    }

    pub fn from_perses_json(raw: &str) -> Result<Self, ScreenError> {
        let spec: Self = serde_json::from_str(raw).map_err(|e| ScreenError::new(e.to_string()))?;
        if spec.kind != "Dashboard" {
            return Err(ScreenError::new("Invalid Perses kind: expected Dashboard."));
        }
        for layout in &spec.spec.layouts {
            for item in &layout.spec.items {
                let Some(key) = item.content.reference.strip_prefix("#/spec/panels/") else {
                    return Err(ScreenError::new(format!(
                        "Invalid panel ref: {}",
                        item.content.reference
                    )));
                };
                if !spec.spec.panels.contains_key(key) {
                    return Err(ScreenError::new(format!("Missing panel for ref: {key}")));
                }
            }
        }
        Ok(spec)
    }

    pub fn to_elysdui_screen(&self, loader: impl Into<String>) -> Screen {
        let tiles = self.tiles(false);
        let children: Vec<ScreenNode> = tiles
            .iter()
            .filter_map(|tile| {
                let panel = self.spec.panels.get(tile.key.as_ref())?;
                let node_type = resolve_elysdui_type(&panel.spec.plugin);
                let mut props = BTreeMap::new();
                props.insert("title".into(), json!(panel.spec.display.name));
                if let Some(desc) = &panel.spec.display.description {
                    props.insert("description".into(), json!(desc));
                }
                props.insert("x".into(), json!(tile.x));
                props.insert("y".into(), json!(tile.y));
                props.insert("w".into(), json!(tile.w));
                props.insert("h".into(), json!(tile.h));
                if !panel.spec.plugin.spec.is_null() {
                    props.insert("pluginSpec".into(), panel.spec.plugin.spec.clone());
                }
                Some(ScreenNode {
                    id: format!("widget-{}", tile.key),
                    node_type,
                    props,
                    bindings: BTreeMap::from([("variables".into(), "variables".into())]),
                    children: Vec::new(),
                    event: None,
                    events: Vec::new(),
                    use_template: None,
                    params: BTreeMap::new(),
                    param_bindings: BTreeMap::new(),
                    slots: BTreeMap::new(),
                    when: None,
                    repeat: None,
                })
            })
            .collect();

        let mut root_props = BTreeMap::new();
        root_props.insert("columns".into(), json!(self.grid_columns()));
        root_props.insert("duration".into(), json!(self.spec.duration));
        if let Some(interval) = &self.spec.refresh_interval {
            root_props.insert("refreshInterval".into(), json!(interval));
        }
        root_props.insert("timezone".into(), json!(self.spec.timezone));

        Screen {
            version: SCHEMA_VERSION.into(),
            id: self.metadata.name.clone(),
            loader: Some(loader.into()),
            templates: BTreeMap::new(),
            root: ScreenNode {
                id: "dashboard-grid".into(),
                node_type: "dashboard/DashboardGrid".into(),
                props: root_props,
                bindings: BTreeMap::new(),
                children,
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
}

fn resolve_elysdui_type(plugin: &PluginSpec) -> String {
    if let Some(explicit) = plugin.spec.get("elysduiType").and_then(Value::as_str) {
        return explicit.to_owned();
    }
    match plugin.kind.as_str() {
        "StatChart" => "data/StatSummary".into(),
        "FilterList" => "dashboard/FilterSidebar".into(),
        "TimeSeriesChart" => "charts/TimeSeriesChart".into(),
        other => other.to_owned(),
    }
}

/// Context passed to each widget plugin when rendering a dashboard card.
pub struct WidgetContext<'a> {
    pub screen_id: &'a str,
    pub variables: &'a BTreeMap<String, Option<String>>,
    pub tile_size: (u32, u32),
}

pub trait WidgetPlugin {
    fn widget_type(&self) -> &str;
    fn render_card(
        &self,
        node: &ScreenNode,
        ctx: &WidgetContext<'_>,
        window: &mut Window,
        cx: &mut App,
    ) -> DashboardCard;
}

#[derive(Default)]
pub struct WidgetRegistry {
    plugins: BTreeMap<String, Rc<dyn WidgetPlugin>>,
}

impl WidgetRegistry {
    pub fn new() -> Self {
        Self::default()
    }

    pub fn with_defaults() -> Self {
        let mut reg = Self::new();
        reg.register(DefaultStatSummaryWidget);
        reg.register(DefaultFilterSidebarWidget);
        reg.register(DefaultTimeSeriesWidget);
        reg
    }

    pub fn register(&mut self, plugin: impl WidgetPlugin + 'static) {
        self.plugins
            .insert(plugin.widget_type().to_owned(), Rc::new(plugin));
    }

    pub fn get(&self, widget_type: &str) -> Option<&dyn WidgetPlugin> {
        self.plugins.get(widget_type).map(|p| p.as_ref())
    }

    pub fn supported_types(&self) -> Vec<&str> {
        self.plugins.keys().map(String::as_str).collect()
    }

    pub fn render_node(
        &self,
        node: &ScreenNode,
        ctx: &WidgetContext<'_>,
        window: &mut Window,
        cx: &mut App,
    ) -> DashboardCard {
        if let Some(plugin) = self.plugins.get(&node.node_type) {
            return plugin.render_card(node, ctx, window, cx);
        }
        let title = node_title(node);
        DashboardCard::new(title).body(
            Alert::new(
                SharedString::from(format!("{}-unsupported", node.id)),
                Severity::Warning,
                "Unsupported widget",
            )
            .body(format!(
                "Widget type '{}' is not registered.",
                node.node_type
            )),
        )
    }
}

fn node_title(node: &ScreenNode) -> String {
    node.props
        .get("title")
        .and_then(Value::as_str)
        .unwrap_or(&node.id)
        .to_owned()
}

fn node_description(node: &ScreenNode) -> Option<String> {
    node.props
        .get("description")
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
}

struct DefaultStatSummaryWidget;

impl WidgetPlugin for DefaultStatSummaryWidget {
    fn widget_type(&self) -> &str {
        "data/StatSummary"
    }

    fn render_card(
        &self,
        node: &ScreenNode,
        _ctx: &WidgetContext<'_>,
        _window: &mut Window,
        _cx: &mut App,
    ) -> DashboardCard {
        let mut card = DashboardCard::new(node_title(node));
        if let Some(desc) = node_description(node) {
            card = card.subtitle(desc);
        }
        let metrics = node
            .props
            .get("metrics")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut row = div().size_full().flex().flex_wrap().items_center().gap_4();
        if metrics.is_empty() {
            row = row.child(Caption::new("No metrics bound"));
        } else {
            for (idx, metric) in metrics.iter().enumerate() {
                let label = metric
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or("Metric")
                    .to_owned();
                let value = metric.get("value").and_then(Value::as_f64).unwrap_or(0.0);
                let decimals = metric.get("decimals").and_then(Value::as_u64).unwrap_or(0) as usize;
                row = row.child(
                    div().min_w(px(110.)).flex_1().child(
                        Statistic::new(
                            SharedString::from(format!("{}-m-{idx}", node.id)),
                            label,
                            value,
                        )
                        .decimals(decimals),
                    ),
                );
            }
        }
        card.body(row)
    }
}

struct DefaultFilterSidebarWidget;

impl WidgetPlugin for DefaultFilterSidebarWidget {
    fn widget_type(&self) -> &str {
        "dashboard/FilterSidebar"
    }

    fn render_card(
        &self,
        node: &ScreenNode,
        _ctx: &WidgetContext<'_>,
        _window: &mut Window,
        _cx: &mut App,
    ) -> DashboardCard {
        let mut card = DashboardCard::new(node_title(node));
        if let Some(desc) = node_description(node) {
            card = card.subtitle(desc);
        }
        let items = node
            .props
            .get("items")
            .and_then(Value::as_array)
            .cloned()
            .unwrap_or_default();
        let mut list = v_stack().gap_1();
        if items.is_empty() {
            list = list.child(Caption::new("No filters configured"));
        } else {
            for item in &items {
                let label = item
                    .get("label")
                    .and_then(Value::as_str)
                    .unwrap_or("Filter")
                    .to_owned();
                let active = item.get("active").and_then(Value::as_bool).unwrap_or(false);
                list = list.child(
                    h_stack()
                        .justify_between()
                        .items_center()
                        .py_1()
                        .child(Label::new(label))
                        .when(active, |row| {
                            row.child(Badge::new("Active").tone(Tone::Info))
                        }),
                );
            }
        }
        card.body(
            div().size_full().child(
                ScrollArea::new(SharedString::from(format!("{}-scroll", node.id)))
                    .size_full()
                    .child(list),
            ),
        )
    }
}

struct DefaultTimeSeriesWidget;

impl WidgetPlugin for DefaultTimeSeriesWidget {
    fn widget_type(&self) -> &str {
        "charts/TimeSeriesChart"
    }

    fn render_card(
        &self,
        node: &ScreenNode,
        _ctx: &WidgetContext<'_>,
        _window: &mut Window,
        cx: &mut App,
    ) -> DashboardCard {
        let mut card = DashboardCard::new(node_title(node));
        if let Some(desc) = node_description(node) {
            card = card.subtitle(desc);
        }
        let mut plot = Plot::builder().theme(PlotTheme::light()).build();
        if let Some(series_list) = node.props.get("series").and_then(Value::as_array) {
            for (idx, series) in series_list.iter().enumerate() {
                let name = series
                    .get("name")
                    .and_then(Value::as_str)
                    .unwrap_or("series");
                let points: Vec<PlotPoint> = series
                    .get("points")
                    .and_then(Value::as_array)
                    .into_iter()
                    .flatten()
                    .filter_map(|pt| {
                        let x = pt.get("x").and_then(Value::as_f64)?;
                        let y = pt.get("y").and_then(Value::as_f64)?;
                        (x.is_finite() && y.is_finite()).then_some(PlotPoint::new(x, y))
                    })
                    .collect();
                if !points.is_empty() {
                    let color = Rgba {
                        r: if idx % 2 == 0 { 0.05 } else { 0.90 },
                        g: 0.44,
                        b: if idx % 2 == 0 { 0.78 } else { 0.12 },
                        a: 0.9,
                    };
                    plot.add_series(&Series::from_iter_points(
                        name,
                        points,
                        SeriesKind::Line(LineStyle { color, width: 1.5 }),
                    ));
                }
            }
        }
        let view = cx.new(|_| PlotView::with_config(plot, PlotViewConfig::default()));
        card.body(div().size_full().child(view))
    }
}

pub struct DashboardRenderer;

impl DashboardRenderer {
    pub fn tile_key(node: &ScreenNode) -> &str {
        node.id.strip_prefix("widget-").unwrap_or(&node.id)
    }

    pub fn render_grid(
        id: impl Into<ElementId>,
        screen: &Screen,
        tiles: Vec<Tile>,
        registry: &WidgetRegistry,
        variables: &BTreeMap<String, Option<String>>,
        on_change: impl Fn(Vec<Tile>, &mut Window, &mut App) + 'static,
        window: &mut Window,
        cx: &mut App,
    ) -> AnyElement {
        let id = id.into();
        if let Err(err) = validate_screen(screen) {
            return Alert::new(
                (id, "invalid"),
                Severity::Danger,
                "Invalid dashboard screen",
            )
            .body(err.message)
            .into_any_element();
        }
        if screen.root.node_type != "dashboard/DashboardGrid" {
            return Alert::new(
                (id, "wrong-root"),
                Severity::Danger,
                "Unsupported dashboard root",
            )
            .body(format!(
                "Expected 'dashboard/DashboardGrid', got '{}'.",
                screen.root.node_type
            ))
            .into_any_element();
        }
        let columns = screen
            .root
            .props
            .get("columns")
            .and_then(Value::as_u64)
            .map(|c| c.clamp(1, 24) as u32)
            .unwrap_or(12);

        let tile_sizes: BTreeMap<String, (u32, u32)> = tiles
            .iter()
            .map(|t| (t.key.to_string(), (t.w, t.h)))
            .collect();

        let mut grid = DashboardGrid::new(id, columns, tiles, on_change);
        for child in &screen.root.children {
            let key = Self::tile_key(child);
            let tile_size = tile_sizes.get(key).copied().unwrap_or((1, 1));
            let ctx = WidgetContext {
                screen_id: &screen.id,
                variables,
                tile_size,
            };
            let card = registry.render_node(child, &ctx, window, cx);
            grid = grid.card(key.to_owned(), card);
        }
        grid.into_any_element()
    }
}
