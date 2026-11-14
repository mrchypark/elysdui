use std::{
    collections::{BTreeMap, HashSet},
    path::Path,
    rc::Rc,
};

use ely_gpui_component::{
    calendar::{
        AgendaView, Answer, Attendee, AvailabilityPicker, CalendarMonthView, Event, EventCard,
        EventDraft, EventEditor, EventPopover, Frequency, Recurrence, YearView,
    },
    canvas::{
        Artboard, Board, ColorPanel, Constraints, ConstraintsEditor, FlowChart, Frame, Guide,
        InfiniteCanvas, LayerPanel, Link as CanvasLink, MindMap, Pin, Shape, ShapeKind, Step,
        StepKind, Tool as CanvasTool, ToolPalette, Topic, Viewport, Whiteboard,
    },
    charts::{
        CalendarHeatmap, GanttChart, HeatmapChart, LIMIT as CHART_LIMIT, LineChart, NetworkGraph,
        RealtimeChart, SankeyChart, Series as ChartSeries, Task as GanttTask, Treemap,
    },
    dashboard::{
        DashboardCard, DashboardFilter, DashboardFilterBar, DashboardGrid, RefreshIntervalSelector,
        Tile as DashTile, TimeWindow,
    },
    data_display::{Change, Changelog, Gallery, Release, Watermark},
    finance::{
        Arrangement, Candle, CandlestickChart, ChartKind, CurrencyConverter, DepthChart, Dividend,
        DividendTable, EconomicCalendar, LeverageSlider, MarketHeatmap, MarketOverview,
        MarketStatus, MultiChartLayout, OptionChain, OptionQuote, Order, OrderBook, OrderEntry,
        OrderKind, PortfolioSummary, Position, PositionTable, Release as EconRelease, RenkoChart,
        Screener, Session, Side, Strike, TimeAndSales, Trade, Watch, Watchlist,
    },
    forms::Choice,
    layout::{Card, CardHeader, h_stack, v_stack},
    maps::{
        ChoroplethLayer, ChoroplethMap, CoordFormat, GeoHeatmap, GeoJsonLayer, LatLon,
        LocationPicker, MapMarker, MapView, MapViewport, RouteLine, WorldMap, read_geojson,
    },
    overlays::Slide,
    tables::{Cell, Column, Row},
    theme::ActiveTheme,
    typography::Heading,
};
use gpui::{
    AnyElement, App, Hsla, ImageSource, IntoElement, ParentElement, Rgba, SharedString, SharedUri,
    Styled, WeakEntity, Window, div, px,
};
use jiff::{
    Span, Timestamp,
    civil::{Date, date},
    tz::TimeZone,
};
use serde_json::{Value, json};

use crate::{
    catalogue::{
        CatalogueView, best_body, best_title, extract_item_objects, non_empty_or, prop_bool,
        prop_f64, prop_str, value_to_f64,
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
    let el = match kind {
        "calendar/AgendaView" => render_agenda(node, eid, view),
        "calendar/AvailabilityPicker" => {
            render_availability(node, eid, state_key, view_state, view)
        }
        "calendar/CalendarDayView" => render_calendar_days::<1>(node, eid, state_key, view),
        "calendar/CalendarWeekView" => render_calendar_days::<7>(node, eid, state_key, view),
        "calendar/CalendarMonthView" => render_calendar_month(node, eid, state_key, view),
        "calendar/EventCard" => render_event_card(node, eid, view),
        "calendar/EventEditor" => render_event_editor(node, eid, state_key, view),
        "calendar/EventPopover" => render_event_popover(node, eid, view),
        "calendar/YearView" => render_year_view(node, eid, state_key, view),

        "canvas/ColorPanel" => render_color_panel(node, eid, state_key, view_state, cx, view),
        "canvas/ConstraintsEditor" => {
            render_constraints_editor(node, eid, state_key, view_state, view)
        }
        "canvas/FlowChart" => render_flow_chart(node, eid, state_key, view),
        "canvas/InfiniteCanvas" => render_infinite_canvas(node, eid, state_key, view),
        "canvas/LayerPanel" => render_layer_panel(node, eid, state_key, view_state, view),
        "canvas/MindMap" => render_mind_map(node, eid, state_key, view),
        "canvas/ToolPalette" => render_tool_palette(node, eid, state_key, view_state, view),
        "canvas/Whiteboard" => render_whiteboard(node, eid, state_key, view),

        "charts/GanttChart" => render_gantt_chart(node, eid),
        "charts/HeatmapChart" => render_heatmap_chart(node, eid),
        "charts/NetworkGraph" => render_network_graph(node, eid),
        "charts/RealtimeChart" => render_realtime_chart(node, eid),
        "charts/SankeyChart" => render_sankey_chart(node, eid),
        "charts/Treemap" => render_treemap(node, eid),

        "finance/CandlestickChart" => render_candlestick(node, eid, state_key, view),
        "finance/CurrencyConverter" => {
            render_currency_converter(node, eid, state_key, view_state, view)
        }
        "finance/DepthChart" => render_depth_chart(node, eid),
        "finance/DividendTable" => render_dividend_table(node, eid),
        "finance/EconomicCalendar" => render_economic_calendar(node),
        "finance/LeverageSlider" => render_leverage_slider(node, eid, state_key, view_state, view),
        "finance/MarketHeatmap" => render_market_heatmap(node, eid),
        "finance/MarketOverview" => render_market_overview(node, eid),
        "finance/MultiChartLayout" => render_multi_chart(node, eid, state_key, view),
        "finance/OptionChain" => render_option_chain(node, eid, view),
        "finance/OrderBook" => render_order_book(node, eid),
        "finance/OrderEntry" => render_order_entry(node, eid, state_key, window, cx, view),
        "finance/PortfolioSummary" => render_portfolio_summary(node, eid),
        "finance/PositionTable" => render_position_table(node, eid),
        "finance/RenkoChart" => render_renko_chart(node, eid),
        "finance/Screener" => render_screener(node, eid, state_key, view),
        "finance/TimeAndSales" => render_time_and_sales(node, eid),
        "finance/Watchlist" => render_watchlist(node, eid, state_key, view_state, view),

        "maps/ChoroplethMap" => render_choropleth(node, eid, state_key, view),
        "maps/GeoHeatmap" => render_geo_heatmap(node, eid, state_key, view),
        "maps/LocationPicker" => render_location_picker(node, eid, state_key, view),
        "maps/RouteLine" => render_route_line(node, eid, state_key, view),

        "data/Changelog" => render_changelog(node),
        "data/Gallery" => render_gallery(node, eid),
        "data/Watermark" => render_watermark(node, eid),

        "dashboard/Dashboard Grid" => render_dashboard_grid(node, eid, state_key, view_state, view),

        _ => return None,
    };
    Some(el)
}

fn finite_or(v: f64, fallback: f64) -> f64 {
    if v.is_finite() { v } else { fallback }
}

fn clamp_chart(v: f64) -> f64 {
    if v.is_finite() {
        v.clamp(-CHART_LIMIT * 0.5, CHART_LIMIT * 0.5)
    } else {
        0.0
    }
}

fn clamp_date(d: Date) -> Date {
    let y = d.year().clamp(-9998, 9998);
    Date::new(y, d.month(), d.day()).unwrap_or_else(|_| date(2026, 10, 13))
}

fn parse_date(raw: &str) -> Option<Date> {
    let s = raw.trim();
    if let Some(date_part) = s.split(['T', ' ']).next() {
        let mut parts = date_part.split('-');
        if let (Some(y), Some(m), Some(d)) = (parts.next(), parts.next(), parts.next())
            && let (Ok(y), Ok(m), Ok(d)) = (y.parse::<i16>(), m.parse::<i8>(), d.parse::<i8>())
        {
            let y = y.clamp(-9998, 9998);
            if let Ok(parsed) = Date::new(y, m, d) {
                return Some(parsed);
            }
        }
    }
    Date::strptime("%b %d, %Y", s)
        .or_else(|_| Date::strptime("%B %d, %Y", s))
        .ok()
        .map(clamp_date)
}

fn parse_hhmm(raw: &str) -> Option<(i8, i8)> {
    let s = raw.trim();
    let (h, m) = s.split_once(':')?;
    let h = h.trim().parse::<i8>().ok()?;
    let m_str: String = m.chars().take_while(|c| c.is_ascii_digit()).collect();
    let m = m_str.parse::<i8>().ok()?;
    if (0..24).contains(&h) && (0..60).contains(&m) {
        Some((h, m))
    } else {
        None
    }
}

fn ts_at(day: Date, hour: i8, min: i8, sec: i8) -> Timestamp {
    clamp_date(day)
        .at(hour.clamp(0, 23), min.clamp(0, 59), sec.clamp(0, 59), 0)
        .to_zoned(TimeZone::UTC)
        .map(|z| z.timestamp())
        .unwrap_or(Timestamp::UNIX_EPOCH)
}

fn parse_timestamp(raw: &str, base_day: Date) -> Option<Timestamp> {
    let s = raw.trim();
    if let Ok(ts) = s.parse::<Timestamp>() {
        return Some(ts);
    }
    if let Some((d_str, t_str)) = s.split_once('T').or_else(|| s.split_once(' '))
        && let Some(d) = parse_date(d_str)
        && let Some((h, m)) = parse_hhmm(t_str)
    {
        return Some(ts_at(d, h, m, 0));
    }
    if let Some((h, m)) = parse_hhmm(s) {
        return Some(ts_at(base_day, h, m, 0));
    }
    None
}

fn parse_hex_hsla(raw: &str) -> Option<Hsla> {
    let hex = raw.trim().strip_prefix('#')?;
    let (r, g, b, a) = match hex.len() {
        6 => (
            u8::from_str_radix(&hex[0..2], 16).ok()?,
            u8::from_str_radix(&hex[2..4], 16).ok()?,
            u8::from_str_radix(&hex[4..6], 16).ok()?,
            255u8,
        ),
        8 => (
            u8::from_str_radix(&hex[0..2], 16).ok()?,
            u8::from_str_radix(&hex[2..4], 16).ok()?,
            u8::from_str_radix(&hex[4..6], 16).ok()?,
            u8::from_str_radix(&hex[6..8], 16).ok()?,
        ),
        _ => return None,
    };
    Some(
        Rgba {
            r: f32::from(r) / 255.0,
            g: f32::from(g) / 255.0,
            b: f32::from(b) / 255.0,
            a: f32::from(a) / 255.0,
        }
        .into(),
    )
}

fn hsla_to_hex(color: Hsla) -> String {
    let rgba = Rgba::from(color);
    let r = (rgba.r.clamp(0.0, 1.0) * 255.0).round() as u8;
    let g = (rgba.g.clamp(0.0, 1.0) * 255.0).round() as u8;
    let b = (rgba.b.clamp(0.0, 1.0) * 255.0).round() as u8;
    format!("#{r:02x}{g:02x}{b:02x}")
}

fn box_height(node: &ScreenNode, default_px: f32) -> f32 {
    prop_f64(node, "height")
        .map(|v| (v as f32).clamp(180.0, 640.0))
        .unwrap_or(default_px)
}

fn emit_change(
    view: &WeakEntity<CatalogueView>,
    key: &str,
    ntype: &str,
    value: Value,
    cx: &mut App,
) {
    let _ = view.update(cx, |this, cx| {
        this.trigger_event(key, ntype, "change", value, cx);
    });
}

fn emit_action(
    view: &WeakEntity<CatalogueView>,
    id: &str,
    ntype: &str,
    event: &str,
    value: Value,
    cx: &mut App,
) {
    let _ = view.update(cx, |this, cx| {
        this.trigger_event(id, ntype, event, value, cx);
    });
}

fn safe_timed_event(
    key: String,
    title: String,
    start: Timestamp,
    end: Timestamp,
    hue: usize,
    place: Option<String>,
) -> Event {
    let end = if end > start {
        end
    } else {
        start
            .checked_add(Span::new().minutes(30))
            .unwrap_or_else(|_| {
                Timestamp::from_second(start.as_second().saturating_add(1800)).unwrap_or(start)
            })
    };
    let end = if end > start {
        end
    } else {
        Timestamp::from_second(start.as_second() + 60).unwrap_or(start)
    };
    let mut ev = Event::timed(key, title, start, end, hue % 8);
    if let Some(p) = place.filter(|p| !p.trim().is_empty()) {
        ev = ev.place(p);
    }
    ev
}

fn safe_all_day_event(
    key: String,
    title: String,
    first: Date,
    last: Date,
    hue: usize,
    place: Option<String>,
) -> Event {
    let first = clamp_date(first);
    let last = clamp_date(last).max(first);
    let mut ev = Event::all_day(key, title, first, last, hue % 8);
    if let Some(p) = place.filter(|p| !p.trim().is_empty()) {
        ev = ev.place(p);
    }
    ev
}

fn parse_calendar_events(node: &ScreenNode, base_day: Date) -> Vec<Event> {
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    fn push_unique(out: &mut Vec<Event>, seen: &mut HashSet<String>, mut ev: Event, idx: usize) {
        if !seen.insert(ev.key.to_string()) {
            let k = format!("{}-{idx}", ev.key);
            seen.insert(k.clone());
            ev.key = k.into();
        }
        out.push(ev);
    }

    if let Some(arr) = node.props.get("allDayEvents").and_then(Value::as_array) {
        for (idx, item) in arr.iter().enumerate() {
            let title = item
                .get("label")
                .or_else(|| item.get("title"))
                .and_then(Value::as_str)
                .unwrap_or("All day");
            let raw_key = item
                .get("value")
                .or_else(|| item.get("id"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("allday-{idx}"));
            let col = item
                .get("column")
                .and_then(Value::as_i64)
                .unwrap_or(0)
                .clamp(0, 6);
            let span = item
                .get("span")
                .and_then(Value::as_i64)
                .unwrap_or(1)
                .clamp(1, 30);
            let first = base_day
                .checked_add(Span::new().days(col))
                .unwrap_or(base_day);
            let last = first
                .checked_add(Span::new().days(span - 1))
                .unwrap_or(first);
            let hue = item.get("hue").and_then(Value::as_u64).unwrap_or(0) as usize;
            push_unique(
                &mut out,
                &mut seen,
                safe_all_day_event(raw_key, title.to_owned(), first, last, hue, None),
                idx,
            );
        }
    }

    if let Some(rows) = node.props.get("timeGrid").and_then(Value::as_array) {
        for (r_idx, row) in rows.iter().enumerate() {
            let row_time = row.get("time").and_then(Value::as_str).unwrap_or("09:00");
            if let Some(cells) = row.get("cells").and_then(Value::as_array) {
                for (c_idx, cell) in cells.iter().enumerate() {
                    let c_day = cell
                        .get("date")
                        .and_then(Value::as_str)
                        .and_then(parse_date)
                        .unwrap_or(base_day);
                    if let Some(evs) = cell.get("events").and_then(Value::as_array) {
                        for (e_idx, ev) in evs.iter().enumerate() {
                            let title = ev
                                .get("label")
                                .or_else(|| ev.get("title"))
                                .and_then(Value::as_str)
                                .unwrap_or("Event");
                            let key = ev
                                .get("value")
                                .and_then(Value::as_str)
                                .map(ToOwned::to_owned)
                                .unwrap_or_else(|| format!("tg-{r_idx}-{c_idx}-{e_idx}"));
                            let start = parse_timestamp(row_time, c_day)
                                .unwrap_or_else(|| ts_at(c_day, 9, 0, 0));
                            let end = start.checked_add(Span::new().minutes(60)).unwrap_or(start);
                            let hue = ev.get("hue").and_then(Value::as_u64).unwrap_or(0) as usize;
                            push_unique(
                                &mut out,
                                &mut seen,
                                safe_timed_event(key, title.to_owned(), start, end, hue, None),
                                r_idx * 100 + c_idx * 10 + e_idx,
                            );
                        }
                    }
                }
            }
        }
    }

    if out.is_empty()
        && let Some(items) = node.props.get("items").and_then(Value::as_array)
    {
        let mut cursor_day = base_day;
        for (idx, item) in items.iter().enumerate() {
            if let Some(d) = item
                .get("date")
                .and_then(Value::as_str)
                .and_then(parse_date)
            {
                cursor_day = d;
                if let Some(evs) = item.get("events").and_then(Value::as_array) {
                    for (e_idx, ev) in evs.iter().enumerate() {
                        let title = ev
                            .get("label")
                            .or_else(|| ev.get("title"))
                            .and_then(Value::as_str)
                            .unwrap_or("Event");
                        let key = ev
                            .get("value")
                            .and_then(Value::as_str)
                            .map(ToOwned::to_owned)
                            .unwrap_or_else(|| format!("m-{idx}-{e_idx}"));
                        let hue = ev.get("hue").and_then(Value::as_u64).unwrap_or(0) as usize;
                        if let Some(span) = ev.get("span").and_then(Value::as_i64) {
                            let last = cursor_day
                                .checked_add(Span::new().days((span - 1).max(0)))
                                .unwrap_or(cursor_day);
                            push_unique(
                                &mut out,
                                &mut seen,
                                safe_all_day_event(
                                    key,
                                    title.to_owned(),
                                    cursor_day,
                                    last,
                                    hue,
                                    None,
                                ),
                                idx * 10 + e_idx,
                            );
                        } else {
                            let start = ev
                                .get("time")
                                .and_then(Value::as_str)
                                .and_then(|t| parse_timestamp(t, cursor_day))
                                .unwrap_or_else(|| ts_at(cursor_day, 9, 0, 0));
                            let end = start.checked_add(Span::new().minutes(60)).unwrap_or(start);
                            push_unique(
                                &mut out,
                                &mut seen,
                                safe_timed_event(key, title.to_owned(), start, end, hue, None),
                                idx * 10 + e_idx,
                            );
                        }
                    }
                    continue;
                }
            }
            let title = item
                .get("label")
                .or_else(|| item.get("title"))
                .and_then(Value::as_str)
                .unwrap_or("Event");
            let key = item
                .get("value")
                .or_else(|| item.get("id"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("ev-{idx}"));
            let hue = item.get("hue").and_then(Value::as_u64).unwrap_or(0) as usize;
            let place = item
                .get("location")
                .or_else(|| item.get("content"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            let start_raw = item.get("start").and_then(Value::as_str);
            let end_raw = item.get("end").and_then(Value::as_str);
            if let (Some(s_raw), Some(e_raw)) = (start_raw, end_raw)
                && let (Some(s_ts), Some(e_ts)) = (
                    parse_timestamp(s_raw, cursor_day),
                    parse_timestamp(e_raw, cursor_day),
                )
            {
                push_unique(
                    &mut out,
                    &mut seen,
                    safe_timed_event(key, title.to_owned(), s_ts, e_ts, hue, place),
                    idx,
                );
            } else {
                let ev_day = clamp_date(
                    base_day
                        .checked_add(Span::new().days((idx as i64).min(14)))
                        .unwrap_or(base_day),
                );
                push_unique(
                    &mut out,
                    &mut seen,
                    safe_all_day_event(key, title.to_owned(), ev_day, ev_day, hue, place),
                    idx,
                );
            }
        }
    }

    if out.is_empty() {
        let s = ts_at(base_day, 9, 0, 0);
        let e = ts_at(base_day, 10, 0, 0);
        out.push(safe_timed_event(
            "event-1".into(),
            non_empty_or(&best_title(node), "Meeting"),
            s,
            e,
            0,
            prop_str(node, "location"),
        ));
    }
    out
}

fn render_agenda(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let base = prop_str(node, "date")
        .as_deref()
        .and_then(parse_date)
        .unwrap_or_else(|| date(2026, 10, 13));
    let events = parse_calendar_events(node, base);
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    AgendaView::new(gpui::ElementId::from(eid.clone()), base, 14, events)
        .zone(TimeZone::UTC)
        .today(base)
        .on_event(move |key, _, cx| {
            emit_action(&v, &nid, &ntype, "ely:action", json!(key.to_string()), cx);
        })
        .into_any_element()
}

fn render_availability(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut seen_days = HashSet::new();
    let mut days: Vec<Date> = node
        .props
        .get("days")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|d| d.get("date").and_then(Value::as_str).and_then(parse_date))
                .filter(|d| seen_days.insert(*d))
                .collect()
        })
        .unwrap_or_default();
    if days.is_empty() {
        days = vec![date(2026, 10, 14), date(2026, 10, 15), date(2026, 10, 16)];
    }
    let min_day = days
        .iter()
        .copied()
        .min()
        .unwrap_or_else(|| date(2026, 10, 14));
    let now = ts_at(min_day, 0, 0, 0);
    let mut picker = AvailabilityPicker::new(gpui::ElementId::from(eid.clone()), days)
        .zone(TimeZone::UTC)
        .now(now)
        .hours(9, 17)
        .length(30);
    if let Some(sel) = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .and_then(|s| parse_timestamp(s, min_day))
    {
        picker = picker.selected(sel);
    }
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    picker
        .on_pick(move |ts, _, cx| {
            emit_change(&v, &sk, &ntype, json!(ts.to_string()), cx);
        })
        .into_any_element()
}

fn render_calendar_days<const DAYS: usize>(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let day = prop_str(node, "date")
        .as_deref()
        .and_then(parse_date)
        .unwrap_or_else(|| date(2026, 10, 13));
    let today = prop_str(node, "today")
        .as_deref()
        .and_then(parse_date)
        .unwrap_or(day);
    let events = parse_calendar_events(node, day);
    let v1 = view.clone();
    let nid = node.id.clone();
    let nt1 = node.node_type.clone();
    let v2 = view.clone();
    let sk = state_key.to_owned();
    let nt2 = node.node_type.clone();
    let cal = ely_gpui_component::calendar::CalendarDays::<DAYS>::new(
        gpui::ElementId::from(eid.clone()),
        day,
        events,
    )
    .zone(TimeZone::UTC)
    .now(ts_at(today, 10, 0, 0))
    .on_event(move |key, _, cx| {
        emit_action(&v1, &nid, &nt1, "click", json!(key.to_string()), cx);
    })
    .on_step(move |next_day, _, cx| {
        emit_change(&v2, &sk, &nt2, json!(next_day.to_string()), cx);
    });
    div().w_full().h(px(380.0)).child(cal).into_any_element()
}

fn render_calendar_month(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let month = prop_str(node, "date")
        .as_deref()
        .and_then(parse_date)
        .unwrap_or_else(|| date(2026, 10, 13));
    let today = prop_str(node, "today")
        .as_deref()
        .and_then(parse_date)
        .unwrap_or(month);
    let events = parse_calendar_events(node, month);
    let v1 = view.clone();
    let sk = state_key.to_owned();
    let nt1 = node.node_type.clone();
    let v2 = view.clone();
    let nid = node.id.clone();
    let nt2 = node.node_type.clone();
    CalendarMonthView::new(gpui::ElementId::from(eid.clone()), month, events)
        .today(today)
        .zone(TimeZone::UTC)
        .on_day(move |d, _, cx| {
            emit_change(&v1, &sk, &nt1, json!(d.to_string()), cx);
        })
        .on_event(move |k, _, cx| {
            emit_action(&v2, &nid, &nt2, "click", json!(k.to_string()), cx);
        })
        .into_any_element()
}

fn build_single_event(node: &ScreenNode) -> Event {
    let base_day = date(2026, 10, 12);
    let title = non_empty_or(&best_title(node), "Event");
    let key = prop_str(node, "value").unwrap_or_else(|| node.id.clone());
    let hue = prop_f64(node, "hue").unwrap_or(0.0).max(0.0) as usize;
    let place = prop_str(node, "location");
    let start = prop_str(node, "start")
        .as_deref()
        .and_then(|s| parse_timestamp(s, base_day))
        .unwrap_or_else(|| ts_at(base_day, 9, 0, 0));
    let end = prop_str(node, "end")
        .as_deref()
        .and_then(|s| parse_timestamp(s, base_day))
        .unwrap_or_else(|| ts_at(base_day, 10, 0, 0));
    safe_timed_event(key, title, start, end, hue, place)
}

fn render_event_card(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let ev = build_single_event(node);
    let key = ev.key.to_string();
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    let card = EventCard::new(gpui::ElementId::from(eid.clone()), ev)
        .zone(TimeZone::UTC)
        .on_click(move |_, cx| {
            emit_action(&v, &nid, &ntype, "click", json!(key), cx);
        });
    div().w_full().h(px(64.0)).child(card).into_any_element()
}

fn render_event_editor(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let ev = build_single_event(node);
    let mut draft = EventDraft::of(&ev);
    if let Some(notes) = prop_str(node, "notes").or_else(|| best_body(node)) {
        draft.notes = notes.into();
    }
    draft.hue %= 8;
    if let Some(freq_str) = prop_str(node, "frequency") {
        let freq = match freq_str.to_ascii_lowercase().as_str() {
            "daily" => Frequency::Daily,
            "monthly" => Frequency::Monthly,
            "yearly" => Frequency::Yearly,
            _ => Frequency::Weekly,
        };
        let interval = prop_f64(node, "interval").unwrap_or(1.0).clamp(1.0, 365.0) as u16;
        let mut rec = Recurrence::new(freq);
        rec.interval = interval;
        draft.repeat = Some(rec);
    }
    if let Some(rems) = node.props.get("reminders").and_then(Value::as_array) {
        draft.reminders = rems
            .iter()
            .filter_map(value_to_f64)
            .map(|n| n.clamp(0.0, 43_200.0) as u32)
            .collect();
    }
    let mut editor =
        EventEditor::new(gpui::ElementId::from(eid.clone()), draft).zone(TimeZone::UTC);
    let v1 = view.clone();
    let sk = state_key.to_owned();
    let nt1 = node.node_type.clone();
    editor = editor.on_save(move |saved, _, cx| {
        emit_change(&v1, &sk, &nt1, json!(saved.title.to_string()), cx);
    });
    if prop_bool(node, "showCancel") {
        let v = view.clone();
        let nid = node.id.clone();
        let nt = node.node_type.clone();
        editor = editor.on_cancel(move |_, cx| {
            emit_action(&v, &nid, &nt, "ely:action", json!("cancel"), cx);
        });
    }
    if prop_bool(node, "showDelete") {
        let v = view.clone();
        let nid = node.id.clone();
        let nt = node.node_type.clone();
        editor = editor.on_delete(move |_, cx| {
            emit_action(&v, &nid, &nt, "ely:action", json!("delete"), cx);
        });
    }
    editor.into_any_element()
}

fn render_event_popover(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let ev = build_single_event(node);
    let mut attendees = Vec::new();
    let mut seen_emails = HashSet::new();
    let mut has_organizer = false;
    if let Some(arr) = node.props.get("attendees").and_then(Value::as_array) {
        for (idx, item) in arr.iter().enumerate() {
            let name = item
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or("Guest")
                .to_owned();
            let mut email = item
                .get("email")
                .and_then(Value::as_str)
                .unwrap_or("")
                .trim()
                .to_owned();
            if email.is_empty() || !seen_emails.insert(email.clone()) {
                email = format!("guest-{idx}@example.com");
                seen_emails.insert(email.clone());
            }
            let answer = match item
                .get("answer")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase()
                .as_str()
            {
                "going" => Answer::Going,
                "maybe" => Answer::Maybe,
                "declined" => Answer::Declined,
                _ => Answer::Waiting,
            };
            let mut guest = Attendee::new(name, email, answer);
            if item.get("organizer").and_then(Value::as_bool) == Some(true) && !has_organizer {
                guest = guest.organizer();
                has_organizer = true;
            }
            attendees.push(guest);
        }
    }
    let mut pop = EventPopover::new(gpui::ElementId::from(eid.clone()), ev)
        .zone(TimeZone::UTC)
        .attendees(attendees);
    if prop_bool(node, "showEdit") {
        let v = view.clone();
        let nid = node.id.clone();
        let nt = node.node_type.clone();
        pop = pop.on_edit(move |key, _, cx| {
            emit_action(
                &v,
                &nid,
                &nt,
                "ely:action",
                json!(format!("edit:{key}")),
                cx,
            );
        });
    }
    if prop_bool(node, "showDelete") {
        let v = view.clone();
        let nid = node.id.clone();
        let nt = node.node_type.clone();
        pop = pop.on_delete(move |key, _, cx| {
            emit_action(
                &v,
                &nid,
                &nt,
                "ely:action",
                json!(format!("delete:{key}")),
                cx,
            );
        });
    }
    pop.into_any_element()
}

fn render_year_view(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let d = prop_str(node, "date")
        .as_deref()
        .and_then(parse_date)
        .unwrap_or_else(|| date(2026, 10, 13));
    let year = prop_str(node, "title")
        .and_then(|s| s.trim().parse::<i16>().ok())
        .unwrap_or_else(|| d.year())
        .clamp(-9998, 9998);
    let today = prop_str(node, "today")
        .as_deref()
        .and_then(parse_date)
        .unwrap_or(d);
    let events = parse_calendar_events(node, d);
    let v1 = view.clone();
    let sk = state_key.to_owned();
    let nt1 = node.node_type.clone();
    let v2 = view.clone();
    let nid = node.id.clone();
    let nt2 = node.node_type.clone();
    YearView::new(gpui::ElementId::from(eid.clone()), year, events)
        .today(today)
        .zone(TimeZone::UTC)
        .on_day(move |picked, _, cx| {
            emit_change(&v1, &sk, &nt1, json!(picked.to_string()), cx);
        })
        .on_year(move |yr, _, cx| {
            emit_action(&v2, &nid, &nt2, "ely:action", json!(yr), cx);
        })
        .into_any_element()
}

fn parse_canvas_viewport(node: &ScreenNode) -> Viewport {
    let view_obj = node.props.get("canvasScene").and_then(|s| s.get("view"));
    let x = view_obj
        .and_then(|v| v.get("x"))
        .and_then(value_to_f64)
        .map(|v| finite_or(v, 0.0) as f32)
        .unwrap_or(0.0);
    let y = view_obj
        .and_then(|v| v.get("y"))
        .and_then(value_to_f64)
        .map(|v| finite_or(v, 0.0) as f32)
        .unwrap_or(0.0);
    let zoom = view_obj
        .and_then(|v| v.get("zoom"))
        .and_then(value_to_f64)
        .or_else(|| prop_f64(node, "zoom").map(|z| if z > 10.0 { z / 100.0 } else { z }))
        .map(|z| (finite_or(z, 1.0) as f32).clamp(Viewport::ZOOMS.0, Viewport::ZOOMS.1))
        .unwrap_or(1.0);
    Viewport::new(x, y, zoom)
}

fn parse_canvas_shapes(node: &ScreenNode) -> Vec<Shape> {
    let raw_shapes = node
        .props
        .get("canvasScene")
        .and_then(|s| s.get("shapes"))
        .and_then(Value::as_array)
        .or_else(|| node.props.get("shapes").and_then(Value::as_array));
    let mut out = Vec::new();
    let mut seen = HashSet::new();
    if let Some(arr) = raw_shapes {
        for (idx, item) in arr.iter().enumerate() {
            let mut key = item
                .get("id")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            if key.is_empty() || !seen.insert(key.clone()) {
                key = format!("shape-{idx}");
                seen.insert(key.clone());
            }
            let name = item
                .get("name")
                .or_else(|| item.get("label"))
                .and_then(Value::as_str)
                .unwrap_or(&key)
                .to_owned();
            let text = item
                .get("text")
                .or_else(|| item.get("label"))
                .and_then(Value::as_str)
                .unwrap_or(&name)
                .to_owned();
            let x = item
                .get("x")
                .and_then(value_to_f64)
                .map(|v| finite_or(v, 0.0) as f32)
                .unwrap_or(20.0 + idx as f32 * 40.0);
            let y = item
                .get("y")
                .and_then(value_to_f64)
                .map(|v| finite_or(v, 0.0) as f32)
                .unwrap_or(20.0);
            let w = item
                .get("w")
                .or_else(|| item.get("width"))
                .and_then(value_to_f64)
                .map(|v| (finite_or(v, 120.0) as f32).max(1.0))
                .unwrap_or(120.0);
            let h = item
                .get("h")
                .or_else(|| item.get("height"))
                .and_then(value_to_f64)
                .map(|v| (finite_or(v, 60.0) as f32).max(1.0))
                .unwrap_or(60.0);
            let kind = match item.get("type").and_then(Value::as_str).unwrap_or("rect") {
                "ellipse" => ShapeKind::Ellipse,
                "diamond" | "polygon" => ShapeKind::Polygon(4),
                "text" => ShapeKind::Text(text.clone().into()),
                "note" => ShapeKind::Note(text.clone().into()),
                _ => ShapeKind::Rect,
            };
            let hue = item.get("hue").and_then(Value::as_u64).unwrap_or(0) as usize;
            let mut shape = Shape::new(key, name, kind, Frame::new(x, y, w, h)).hue(hue);
            if !text.is_empty() {
                shape = shape.label(text);
            }
            if item.get("visible").and_then(Value::as_bool) == Some(false) {
                shape = shape.hidden(true);
            }
            out.push(shape);
        }
    }
    if out.is_empty()
        && let Some(layers) = node.props.get("layers").and_then(Value::as_array)
    {
        for (idx, l) in layers.iter().enumerate() {
            let key = l
                .get("id")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("layer-{idx}"));
            let name = l
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or(&key)
                .to_owned();
            let visible = l.get("visible").and_then(Value::as_bool).unwrap_or(true);
            out.push(
                Shape::new(
                    key,
                    name,
                    ShapeKind::Rect,
                    Frame::new(20.0, 20.0 + idx as f32 * 80.0, 140.0, 60.0),
                )
                .hidden(!visible),
            );
        }
    }
    if out.is_empty() {
        out.push(
            Shape::new(
                "node-1",
                non_empty_or(&best_title(node), "Canvas"),
                ShapeKind::Rect,
                Frame::new(24.0, 24.0, 160.0, 80.0),
            )
            .label(non_empty_or(&best_title(node), "Canvas")),
        );
    }
    out
}

fn parse_canvas_links(node: &ScreenNode) -> Vec<CanvasLink> {
    let raw = node
        .props
        .get("canvasScene")
        .and_then(|s| s.get("links"))
        .and_then(Value::as_array);
    let mut links = Vec::new();
    if let Some(arr) = raw {
        for (idx, item) in arr.iter().enumerate() {
            let Some(from) = item.get("from").and_then(Value::as_str) else {
                continue;
            };
            let Some(to) = item.get("to").and_then(Value::as_str) else {
                continue;
            };
            if from == to || from.is_empty() || to.is_empty() {
                continue;
            }
            let mut link = CanvasLink::new(format!("link-{idx}"), from.to_owned(), to.to_owned());
            if let Some(txt) = item
                .get("text")
                .and_then(Value::as_str)
                .filter(|s| !s.trim().is_empty())
            {
                link = link.label(txt.to_owned());
            }
            links.push(link);
        }
    }
    links
}

fn render_color_panel(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    cx: &App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let initial = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .and_then(parse_hex_hsla)
        .or_else(|| prop_str(node, "color").as_deref().and_then(parse_hex_hsla))
        .unwrap_or_else(|| cx.theme().colors.accent);
    let swatches: Vec<(SharedString, Hsla)> = node
        .props
        .get("canvasScene")
        .and_then(|s| s.get("style"))
        .and_then(|st| st.get("swatches"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|sw| {
                    let name = sw.get("name").and_then(Value::as_str).unwrap_or("Swatch");
                    let color = sw
                        .get("color")
                        .and_then(Value::as_str)
                        .and_then(parse_hex_hsla)?;
                    Some((SharedString::from(name.to_owned()), color))
                })
                .collect()
        })
        .unwrap_or_default();
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    ColorPanel::new(
        gpui::ElementId::from(eid.clone()),
        initial,
        move |color, _, cx| {
            emit_change(&v, &sk, &ntype, json!(hsla_to_hex(color)), cx);
        },
    )
    .swatches(swatches)
    .into_any_element()
}

fn parse_pin(raw: Option<&str>, fallback: Pin) -> Pin {
    match raw.unwrap_or("").to_ascii_lowercase().as_str() {
        "start" => Pin::Start,
        "end" => Pin::End,
        "both" => Pin::Both,
        "center" => Pin::Center,
        "scale" => Pin::Scale,
        _ => fallback,
    }
}

fn pin_str(pin: Pin) -> &'static str {
    match pin {
        Pin::Start => "start",
        Pin::End => "end",
        Pin::Both => "both",
        Pin::Center => "center",
        Pin::Scale => "scale",
    }
}

fn render_constraints_editor(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let rules = node.props.get("canvasScene").and_then(|s| s.get("rules"));
    let saved = view_state.value(state_key);
    let across = parse_pin(
        saved
            .and_then(|v| v.get("across"))
            .and_then(Value::as_str)
            .or_else(|| rules.and_then(|r| r.get("across")).and_then(Value::as_str)),
        Pin::Start,
    );
    let down = parse_pin(
        saved
            .and_then(|v| v.get("down"))
            .and_then(Value::as_str)
            .or_else(|| rules.and_then(|r| r.get("down")).and_then(Value::as_str)),
        Pin::Start,
    );
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    ConstraintsEditor::new(
        gpui::ElementId::from(eid.clone()),
        Constraints { across, down },
        move |next, _, cx| {
            emit_change(
                &v,
                &sk,
                &ntype,
                json!({"across": pin_str(next.across), "down": pin_str(next.down)}),
                cx,
            );
        },
    )
    .into_any_element()
}

fn render_flow_chart(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let viewport = parse_canvas_viewport(node);
    let shapes = parse_canvas_shapes(node);
    let steps: Vec<Step> = shapes
        .into_iter()
        .map(|s| {
            let kind = match s.kind {
                ShapeKind::Ellipse => StepKind::Terminal,
                ShapeKind::Polygon(_) => StepKind::Decision,
                _ => StepKind::Process,
            };
            Step::new(s.key, kind, s.label.unwrap_or(s.name), s.frame)
        })
        .collect();
    let links = parse_canvas_links(node);
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    let chart = FlowChart::new(gpui::ElementId::from(eid.clone()), viewport, steps, links)
        .on_viewport(move |vp, _, cx| {
            emit_change(
                &v,
                &sk,
                &ntype,
                json!({"x": vp.x, "y": vp.y, "zoom": vp.zoom}),
                cx,
            );
        });
    div()
        .w_full()
        .h(px(box_height(node, 300.0)))
        .child(chart)
        .into_any_element()
}

fn render_infinite_canvas(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let viewport = parse_canvas_viewport(node);
    let shapes = parse_canvas_shapes(node);
    let links = parse_canvas_links(node);
    let artboards: Vec<Artboard> = node
        .props
        .get("canvasScene")
        .and_then(|s| s.get("artboards"))
        .and_then(Value::as_array)
        .or_else(|| node.props.get("artboards").and_then(Value::as_array))
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(i, b)| {
                    let key = b
                        .get("id")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("board-{i}"));
                    let name = b
                        .get("name")
                        .or_else(|| b.get("label"))
                        .and_then(Value::as_str)
                        .unwrap_or(&key)
                        .to_owned();
                    let x = b.get("x").and_then(value_to_f64).unwrap_or(0.0) as f32;
                    let y = b.get("y").and_then(value_to_f64).unwrap_or(0.0) as f32;
                    let w = b
                        .get("w")
                        .or_else(|| b.get("width"))
                        .and_then(value_to_f64)
                        .unwrap_or(300.0)
                        .max(1.0) as f32;
                    let h = b
                        .get("h")
                        .or_else(|| b.get("height"))
                        .and_then(value_to_f64)
                        .unwrap_or(240.0)
                        .max(1.0) as f32;
                    Artboard::new(
                        key,
                        name,
                        Frame::new(
                            if x.is_finite() { x } else { 0.0 },
                            if y.is_finite() { y } else { 0.0 },
                            w,
                            h,
                        ),
                    )
                })
                .collect()
        })
        .unwrap_or_default();
    let guides: Vec<Guide> = node
        .props
        .get("canvasScene")
        .and_then(|s| s.get("guides"))
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|g| {
                    let at = g.get("at").and_then(value_to_f64)? as f32;
                    if !at.is_finite() {
                        return None;
                    }
                    match g.get("axis").and_then(Value::as_str) {
                        Some("y") => Some(Guide::Horizontal(at)),
                        _ => Some(Guide::Vertical(at)),
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let rulers = prop_bool(node, "rulers")
        || node
            .props
            .get("canvasScene")
            .and_then(|s| s.get("rulers"))
            .and_then(Value::as_bool)
            == Some(true);
    let mut canvas = InfiniteCanvas::new(gpui::ElementId::from(eid.clone()), viewport)
        .shapes(shapes)
        .links(links)
        .artboards(artboards)
        .guides(guides);
    if rulers {
        canvas = canvas.rulers();
    }
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    canvas = canvas.on_viewport(move |vp, _, cx| {
        emit_change(
            &v,
            &sk,
            &ntype,
            json!({"x": vp.x, "y": vp.y, "zoom": vp.zoom}),
            cx,
        );
    });
    div()
        .w_full()
        .h(px(box_height(node, 320.0)))
        .child(canvas)
        .into_any_element()
}

fn render_layer_panel(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let shapes = parse_canvas_shapes(node);
    let selected: Vec<String> = match view_state.value(state_key) {
        Some(Value::Array(arr)) => arr
            .iter()
            .filter_map(Value::as_str)
            .map(ToOwned::to_owned)
            .collect(),
        Some(Value::String(s)) => vec![s.clone()],
        _ => node
            .props
            .get("canvasScene")
            .and_then(|s| s.get("selected"))
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(Value::as_str)
                    .map(ToOwned::to_owned)
                    .collect()
            })
            .unwrap_or_default(),
    };
    let v1 = view.clone();
    let sk = state_key.to_owned();
    let nt1 = node.node_type.clone();
    let v2 = view.clone();
    let nid2 = node.id.clone();
    let nt2 = node.node_type.clone();
    let v3 = view.clone();
    let nid3 = node.id.clone();
    let nt3 = node.node_type.clone();
    let panel = LayerPanel::new(gpui::ElementId::from(eid.clone()), shapes)
        .selected(selected)
        .on_select(move |keys, _, cx| {
            let vals: Vec<Value> = keys.iter().map(|s| json!(s.to_string())).collect();
            emit_change(&v1, &sk, &nt1, Value::Array(vals), cx);
        })
        .on_show(move |keys, _, cx| {
            let vals: Vec<Value> = keys.iter().map(|s| json!(s.to_string())).collect();
            emit_action(&v2, &nid2, &nt2, "ely:action", json!({"shown": vals}), cx);
        })
        .on_restack(move |keys, _, cx| {
            let vals: Vec<Value> = keys.iter().map(|s| json!(s.to_string())).collect();
            emit_action(&v3, &nid3, &nt3, "ely:action", json!({"order": vals}), cx);
        });
    div().w_full().h(px(260.0)).child(panel).into_any_element()
}

fn build_topic_tree(
    parent_id: &str,
    raw: &[serde_json::Map<String, Value>],
    visited: &mut HashSet<String>,
) -> Vec<Topic> {
    let mut children = Vec::new();
    for item in raw {
        let p = item.get("parent").and_then(Value::as_str).unwrap_or("");
        if p != parent_id {
            continue;
        }
        let Some(id) = item.get("id").and_then(Value::as_str) else {
            continue;
        };
        if !visited.insert(id.to_owned()) {
            continue;
        }
        let text = item.get("text").and_then(Value::as_str).unwrap_or(id);
        let mut topic = Topic::new(id.to_owned(), text.to_owned());
        for sub in build_topic_tree(id, raw, visited) {
            topic = topic.child(sub);
        }
        children.push(topic);
    }
    children
}

fn render_mind_map(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let viewport = parse_canvas_viewport(node);
    let raw_topics: Vec<serde_json::Map<String, Value>> = node
        .props
        .get("canvasScene")
        .and_then(|s| s.get("topics"))
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(|v| v.as_object().cloned()).collect())
        .unwrap_or_default();
    let root = if let Some(root_obj) = raw_topics
        .iter()
        .find(|t| t.get("parent").and_then(Value::as_str).is_none())
    {
        let root_id = root_obj.get("id").and_then(Value::as_str).unwrap_or("root");
        let root_text = root_obj
            .get("text")
            .and_then(Value::as_str)
            .unwrap_or("Mind Map");
        let mut visited = HashSet::from([root_id.to_owned()]);
        let mut t = Topic::new(root_id.to_owned(), root_text.to_owned());
        for ch in build_topic_tree(root_id, &raw_topics, &mut visited) {
            t = t.child(ch);
        }
        t
    } else {
        Topic::new("root", non_empty_or(&best_title(node), "Mind Map"))
    };
    let selected = node
        .props
        .get("canvasScene")
        .and_then(|s| s.get("selected"))
        .and_then(Value::as_array)
        .and_then(|arr| arr.first())
        .and_then(Value::as_str)
        .map(ToOwned::to_owned);
    let v1 = view.clone();
    let sk = state_key.to_owned();
    let nt1 = node.node_type.clone();
    let v2 = view.clone();
    let nid = node.id.clone();
    let nt2 = node.node_type.clone();
    let map = MindMap::new(gpui::ElementId::from(eid.clone()), root, viewport)
        .selected(selected)
        .on_select(move |key, _, cx| {
            let val = key.map(|s| json!(s.to_string())).unwrap_or(Value::Null);
            emit_change(&v1, &sk, &nt1, val, cx);
        })
        .on_add(move |key, _, cx| {
            emit_action(
                &v2,
                &nid,
                &nt2,
                "ely:action",
                json!(format!("add:{key}")),
                cx,
            );
        });
    div()
        .w_full()
        .h(px(box_height(node, 320.0)))
        .child(map)
        .into_any_element()
}

fn parse_canvas_tool(raw: &str) -> Option<CanvasTool> {
    match raw.trim().to_ascii_lowercase().as_str() {
        "select" => Some(CanvasTool::Select),
        "hand" => Some(CanvasTool::Hand),
        "rect" | "rectangle" => Some(CanvasTool::Rect),
        "ellipse" => Some(CanvasTool::Ellipse),
        "polygon" => Some(CanvasTool::Polygon),
        "line" => Some(CanvasTool::Line),
        "arrow" => Some(CanvasTool::Arrow),
        "pen" => Some(CanvasTool::Pen),
        "text" => Some(CanvasTool::Text),
        "brush" => Some(CanvasTool::Brush),
        "note" => Some(CanvasTool::Note),
        "connector" => Some(CanvasTool::Connector),
        _ => None,
    }
}

fn render_tool_palette(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut tools: Vec<CanvasTool> = node
        .props
        .get("tools")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|item| {
                    item.as_str()
                        .or_else(|| item.get("value").and_then(Value::as_str))
                        .or_else(|| item.get("label").and_then(Value::as_str))
                        .and_then(parse_canvas_tool)
                })
                .collect()
        })
        .unwrap_or_default();
    if tools.is_empty() {
        tools = CanvasTool::ALL.to_vec();
    }
    let active = view_state
        .value(state_key)
        .and_then(Value::as_str)
        .and_then(parse_canvas_tool)
        .or_else(|| {
            prop_str(node, "tool")
                .as_deref()
                .and_then(parse_canvas_tool)
        })
        .filter(|t| tools.contains(t))
        .unwrap_or(tools[0]);
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    ToolPalette::new(gpui::ElementId::from(eid.clone()), active)
        .tools(tools)
        .on_change(move |picked, _, cx| {
            emit_change(&v, &sk, &ntype, json!(picked.words()), cx);
        })
        .into_any_element()
}

fn render_whiteboard(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let board = Board {
        shapes: parse_canvas_shapes(node),
        links: parse_canvas_links(node),
    };
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    let wb = Whiteboard::new(gpui::ElementId::from(eid.clone()), board).on_change(
        move |updated, _, cx| {
            emit_change(&v, &sk, &ntype, json!(updated.shapes.len()), cx);
        },
    );
    div()
        .w_full()
        .h(px(box_height(node, 340.0)))
        .child(wb)
        .into_any_element()
}

fn render_gantt_chart(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let base = date(2026, 10, 1);
    let mut chart = GanttChart::new(eid.clone()).today(date(2026, 10, 15));
    let mut count = 0usize;
    if let Some(tasks) = node.props.get("tasks").and_then(Value::as_array) {
        for (idx, t) in tasks.iter().enumerate() {
            let name = t
                .get("label")
                .or_else(|| t.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("Task");
            let left = t
                .get("left")
                .and_then(value_to_f64)
                .unwrap_or((idx * 5) as f64)
                .clamp(0.0, 365.0) as i64;
            let width = t
                .get("width")
                .and_then(value_to_f64)
                .unwrap_or(10.0)
                .clamp(1.0, 365.0) as i64;
            let start = t
                .get("start")
                .and_then(Value::as_str)
                .and_then(parse_date)
                .unwrap_or_else(|| base.checked_add(Span::new().days(left)).unwrap_or(base));
            let end = t
                .get("end")
                .and_then(Value::as_str)
                .and_then(parse_date)
                .filter(|e| *e >= start)
                .unwrap_or_else(|| {
                    start
                        .checked_add(Span::new().days((width - 1).max(0)))
                        .unwrap_or(start)
                });
            let done = t
                .get("done")
                .and_then(value_to_f64)
                .map(|v| (v as f32).clamp(0.0, 1.0))
                .unwrap_or(0.5);
            chart = chart.task(GanttTask::new(name.to_owned(), start, end).done(done));
            count += 1;
        }
    }
    if count == 0 {
        chart = chart.task(GanttTask::new("Phase 1", base, date(2026, 10, 14)).done(0.5));
    }
    chart.into_any_element()
}

fn render_heatmap_chart(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let vals: Vec<f64> = node
        .props
        .get("cells")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .take(400)
                .map(|c| {
                    c.get("value")
                        .and_then(value_to_f64)
                        .or_else(|| c.get("level").and_then(value_to_f64))
                        .unwrap_or(0.0)
                })
                .map(|v| clamp_chart(v).max(0.0))
                .collect()
        })
        .unwrap_or_default();
    if node.node_type == "charts/CalendarHeatmap" {
        let counts = if vals.is_empty() {
            vec![1.0, 3.0, 2.0, 5.0, 0.0, 4.0, 2.0]
        } else {
            vals
        };
        return CalendarHeatmap::new(gpui::ElementId::from(eid.clone()), date(2026, 1, 1), counts)
            .into_any_element();
    }
    let safe = if vals.is_empty() {
        vec![1.0, 2.0, 3.0, 4.0, 2.0, 5.0, 3.0]
    } else {
        vals
    };
    let cols = safe.len().min(7).max(1);
    let col_labels: Vec<String> = (1..=cols).map(|i| format!("D{i}")).collect();
    let mut hm = HeatmapChart::new(gpui::ElementId::from(eid.clone()), col_labels);
    for (r_idx, chunk) in safe.chunks(cols).enumerate() {
        let mut row_vals = chunk.to_vec();
        row_vals.resize(cols, 0.0);
        hm = hm.row(format!("W{}", r_idx + 1), row_vals);
    }
    hm.into_any_element()
}

fn render_network_graph(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let mut graph = NetworkGraph::new(eid.clone());
    let mut node_coords: Vec<(f64, f64)> = Vec::new();
    if let Some(arr) = node.props.get("nodes").and_then(Value::as_array) {
        for (idx, n) in arr.iter().enumerate() {
            let label = n
                .get("label")
                .or_else(|| n.get("name"))
                .and_then(Value::as_str)
                .unwrap_or("Node");
            let group = n.get("group").and_then(Value::as_u64).unwrap_or(idx as u64) as usize;
            let x = n.get("x").and_then(value_to_f64).unwrap_or(0.0);
            let y = n.get("y").and_then(value_to_f64).unwrap_or(0.0);
            node_coords.push((x, y));
            graph = graph.node(label.to_owned(), group);
        }
    }
    if node_coords.is_empty() {
        graph = graph.node("A", 0).node("B", 1).node("C", 2);
        node_coords = vec![(0.0, 0.0), (1.0, 0.0), (0.0, 1.0)];
    }
    if let Some(edges) = node.props.get("edges").and_then(Value::as_array) {
        for e in edges {
            if let (Some(a), Some(b)) = (
                e.get("from").and_then(Value::as_u64),
                e.get("to").and_then(Value::as_u64),
            ) {
                graph = graph.edge(a as usize, b as usize);
            } else if let (Some(x1), Some(y1), Some(x2), Some(y2)) = (
                e.get("x1").and_then(value_to_f64),
                e.get("y1").and_then(value_to_f64),
                e.get("x2").and_then(value_to_f64),
                e.get("y2").and_then(value_to_f64),
            ) {
                let nearest = |tx: f64, ty: f64| {
                    node_coords
                        .iter()
                        .enumerate()
                        .min_by(|(_, a), (_, b)| {
                            let da = (a.0 - tx).hypot(a.1 - ty);
                            let db = (b.0 - tx).hypot(b.1 - ty);
                            da.total_cmp(&db)
                        })
                        .map(|(i, _)| i)
                        .unwrap_or(0)
                };
                graph = graph.edge(nearest(x1, y1), nearest(x2, y2));
            }
        }
    }
    graph.into_any_element()
}

fn parse_points_y(raw: &str) -> Vec<f64> {
    raw.split_whitespace()
        .filter_map(|pair| pair.split_once(',')?.1.parse::<f64>().ok())
        .map(clamp_chart)
        .collect()
}

fn render_realtime_chart(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let mut values = prop_str(node, "points")
        .as_deref()
        .map(parse_points_y)
        .unwrap_or_default();
    if values.is_empty() {
        values = vec![12.0, 24.0, 18.0, 30.0, 22.0];
    }
    let pushed = prop_f64(node, "samples")
        .map(|n| n.clamp(0.0, 1e12) as u64)
        .unwrap_or(values.len() as u64);
    RealtimeChart::new(gpui::ElementId::from(eid.clone()), values, pushed).into_any_element()
}

fn render_sankey_chart(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let mut names: Vec<String> = node
        .props
        .get("nodes")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(i, n)| {
                    n.get("label")
                        .or_else(|| n.get("name"))
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("N{i}"))
                })
                .collect()
        })
        .unwrap_or_default();
    if names.len() < 2 {
        if names.is_empty() {
            names = vec!["In".into(), "Out".into()];
        } else {
            names.push("Out".into());
        }
    }
    let mut valid_links: Vec<(usize, usize, f64)> = node
        .props
        .get("links")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|l| {
                    let from = l.get("from").and_then(Value::as_u64)? as usize;
                    let to = l.get("to").and_then(Value::as_u64)? as usize;
                    let val = l.get("value").and_then(value_to_f64).unwrap_or(10.0);
                    if from < to && to < names.len() && val.is_finite() && val > 0.0 {
                        Some((from, to, val.min(CHART_LIMIT * 0.5)))
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    if valid_links.is_empty() {
        for i in 0..names.len() - 1 {
            valid_links.push((i, i + 1, 10.0));
        }
    }
    let mut sankey = SankeyChart::new(gpui::ElementId::from(eid.clone()), names);
    for (from, to, val) in valid_links {
        sankey = sankey.link(from, to, val);
    }
    sankey.into_any_element()
}

fn render_treemap(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let mut tm = Treemap::new(eid.clone());
    let mut count = 0usize;
    if let Some(items) = node.props.get("items").and_then(Value::as_array) {
        for (idx, item) in items.iter().enumerate() {
            let label = item
                .get("label")
                .or_else(|| item.get("name"))
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .unwrap_or_else(|| format!("Tile {}", idx + 1));
            let val = item
                .get("value")
                .and_then(value_to_f64)
                .or_else(|| {
                    let w = item.get("width").and_then(value_to_f64)?;
                    let h = item.get("height").and_then(value_to_f64)?;
                    Some(w * h)
                })
                .unwrap_or(10.0);
            tm = tm.tile(label, clamp_chart(val).max(0.0));
            count += 1;
        }
    }
    if count == 0 {
        tm = tm.tile("Alpha", 60.0).tile("Beta", 40.0);
    }
    tm.into_any_element()
}

fn parse_candles(node: &ScreenNode) -> Vec<Candle> {
    let mut out = Vec::new();
    let base_sec = Timestamp::from_second(1_760_000_000).unwrap_or(Timestamp::UNIX_EPOCH);
    if let Some(arr) = node.props.get("candles").and_then(Value::as_array) {
        for (idx, c) in arr.iter().enumerate() {
            let open = c
                .get("open")
                .and_then(value_to_f64)
                .map(|v| finite_or(v, 100.0))
                .unwrap_or(100.0);
            let close = c
                .get("close")
                .and_then(value_to_f64)
                .map(|v| finite_or(v, open))
                .unwrap_or_else(|| {
                    let body = c
                        .get("bodyHeight")
                        .and_then(value_to_f64)
                        .map(|v| finite_or(v, 2.0).abs())
                        .unwrap_or(2.0);
                    if c.get("direction").and_then(Value::as_str) == Some("down") {
                        open - body
                    } else {
                        open + body
                    }
                });
            let raw_hi = c
                .get("high")
                .and_then(value_to_f64)
                .map(|v| finite_or(v, open.max(close)))
                .unwrap_or_else(|| open.max(close));
            let raw_lo = c
                .get("low")
                .and_then(value_to_f64)
                .map(|v| finite_or(v, open.min(close)))
                .unwrap_or_else(|| open.min(close));
            let high = open.max(close).max(raw_hi).max(raw_lo);
            let low = open.min(close).min(raw_hi).min(raw_lo);
            let vol = c
                .get("volume")
                .and_then(value_to_f64)
                .map(|v| finite_or(v, 100.0).max(0.0))
                .unwrap_or(100.0);
            let time = Timestamp::from_second(base_sec.as_second() + idx as i64 * 86_400)
                .unwrap_or(base_sec);
            out.push(Candle::new(time, (open, high, low, close), vol));
        }
    }
    if out.len() < 2 {
        let existing = out.len() as i64;
        for offset in existing..4 {
            let base_p = 100.0 + offset as f64 * 2.5;
            let time =
                Timestamp::from_second(base_sec.as_second() + offset * 86_400).unwrap_or(base_sec);
            out.push(Candle::new(
                time,
                (base_p, base_p + 4.0, base_p - 3.0, base_p + 1.5),
                1_000.0,
            ));
        }
    }
    out
}

fn render_candlestick(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let candles = Rc::new(parse_candles(node));
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    let mut chart = CandlestickChart::new(gpui::ElementId::from(eid.clone()), candles)
        .zone(TimeZone::UTC)
        .on_draw(move |drawing, _, cx| {
            emit_change(&v, &sk, &ntype, json!(format!("{drawing:?}")), cx);
        });
    chart = match node.node_type.as_str() {
        "finance/HeikinAshiChart" => chart.kind(ChartKind::HeikinAshi),
        "finance/LineQuoteChart" => chart.kind(ChartKind::Line),
        "finance/VolumeChart" => chart.volume(),
        _ => chart,
    };
    if let Some(title) = prop_str(node, "caption").filter(|s| !s.is_empty()) {
        chart = chart.title(title);
    }
    chart.into_any_element()
}

fn render_currency_converter(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let saved = view_state.value(state_key);
    let amount = saved
        .and_then(|v| v.get("amount"))
        .and_then(value_to_f64)
        .or_else(|| prop_f64(node, "value"))
        .map(|v| finite_or(v, 1000.0).max(0.0))
        .unwrap_or(1000.0);
    let from = saved
        .and_then(|v| v.get("from"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| prop_str(node, "from"))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "USD".into());
    let to = saved
        .and_then(|v| v.get("to"))
        .and_then(Value::as_str)
        .map(ToOwned::to_owned)
        .or_else(|| prop_str(node, "to"))
        .filter(|s| !s.trim().is_empty())
        .unwrap_or_else(|| "EUR".into());
    let rate = node
        .props
        .get("currencies")
        .and_then(Value::as_array)
        .and_then(|arr| {
            let find_rate = |code: &str| {
                arr.iter()
                    .find(|c| c.get("value").and_then(Value::as_str) == Some(code))
                    .and_then(|c| c.get("rate"))
                    .and_then(value_to_f64)
                    .filter(|r| r.is_finite() && *r > 0.0)
            };
            Some(find_rate(&from)? / find_rate(&to)?)
        })
        .filter(|r| r.is_finite() && *r > 0.0)
        .unwrap_or(0.92);
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    CurrencyConverter::new(
        gpui::ElementId::from(eid.clone()),
        amount,
        (&from, &to),
        rate,
    )
    .on_change(move |amt, f, t, _, cx| {
        emit_change(
            &v,
            &sk,
            &ntype,
            json!({"amount": amt, "from": f.to_string(), "to": t.to_string()}),
            cx,
        );
    })
    .into_any_element()
}

fn parse_book_sides(node: &ScreenNode) -> (Vec<(f64, f64)>, Vec<(f64, f64)>) {
    let parse_side = |key: &str| -> Vec<(f64, f64)> {
        node.props
            .get(key)
            .and_then(Value::as_array)
            .map(|arr| {
                arr.iter()
                    .filter_map(|row| {
                        let cells = row.get("cells").and_then(Value::as_array)?;
                        let p = cells.first().and_then(value_to_f64)?;
                        let sz = cells.get(1).and_then(value_to_f64)?;
                        if p.is_finite() && p > 0.0 && sz.is_finite() && sz > 0.0 {
                            Some((p, sz))
                        } else {
                            None
                        }
                    })
                    .collect()
            })
            .unwrap_or_default()
    };
    let mut bids = parse_side("bids");
    let mut asks = parse_side("asks");
    if bids.is_empty() {
        bids = vec![(187.20, 320.0), (187.15, 415.0), (187.10, 620.0)];
    }
    if asks.is_empty() {
        asks = vec![(187.30, 280.0), (187.35, 370.0), (187.40, 540.0)];
    }
    (bids, asks)
}

fn render_depth_chart(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let (bids, asks) = parse_book_sides(node);
    DepthChart::new(gpui::ElementId::from(eid.clone()), bids, asks).into_any_element()
}

fn render_dividend_table(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let mut divs = Vec::new();
    if let Some(rows) = node.props.get("rows").and_then(Value::as_array) {
        for row in rows {
            let Some(cells) = row.get("cells").and_then(Value::as_array) else {
                continue;
            };
            let str_at = |i: usize| cells.get(i).and_then(Value::as_str).unwrap_or("");
            let ex = parse_date(str_at(0)).unwrap_or_else(|| date(2026, 2, 6));
            let pay = parse_date(str_at(1)).unwrap_or_else(|| date(2026, 2, 13));
            let amount = cells
                .get(2)
                .and_then(value_to_f64)
                .map(|v| finite_or(v, 0.25))
                .unwrap_or(0.25);
            let yield_raw = str_at(3);
            let yield_val = cells
                .get(3)
                .and_then(value_to_f64)
                .map(|v| {
                    if yield_raw.contains('%') {
                        v / 100.0
                    } else {
                        v
                    }
                })
                .map(|v| finite_or(v, 0.01))
                .unwrap_or(0.01);
            let freq = non_empty_or(str_at(4), "Quarterly");
            divs.push(Dividend {
                ex,
                pay,
                amount,
                dividend_yield: yield_val,
                frequency: freq.into(),
            });
        }
    }
    if divs.is_empty() {
        divs.push(Dividend {
            ex: date(2026, 2, 6),
            pay: date(2026, 2, 13),
            amount: 0.45,
            dividend_yield: 0.012,
            frequency: "Quarterly".into(),
        });
    }
    DividendTable::new(gpui::ElementId::from(eid.clone()), divs, "USD").into_any_element()
}

fn render_economic_calendar(node: &ScreenNode) -> AnyElement {
    let base_day = date(2026, 10, 13);
    let mut releases = Vec::new();
    for item in extract_item_objects(node) {
        let event = item
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or("Release")
            .to_owned();
        let detail = item.get("detail").and_then(Value::as_str).unwrap_or("US");
        let region = detail
            .split('·')
            .next()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or("US")
            .to_owned();
        let weight = if detail.contains("high") {
            3
        } else if detail.contains("low") {
            1
        } else {
            2
        };
        let time = item
            .get("time")
            .and_then(Value::as_str)
            .and_then(|t| parse_timestamp(t, base_day))
            .unwrap_or_else(|| ts_at(base_day, 8, 30, 0));
        let actual_raw = item.get("actual").and_then(Value::as_str).unwrap_or("");
        let unit = if actual_raw.contains('%') { "%" } else { "" };
        let actual = item.get("actual").and_then(value_to_f64);
        let forecast = item.get("forecast").and_then(value_to_f64);
        let previous = item.get("previous").and_then(value_to_f64);
        releases.push(EconRelease {
            time,
            region: region.into(),
            event: event.into(),
            weight,
            actual,
            forecast,
            previous,
            unit: unit.into(),
        });
    }
    if releases.is_empty() {
        releases.push(EconRelease {
            time: ts_at(base_day, 8, 30, 0),
            region: "US".into(),
            event: "CPI".into(),
            weight: 3,
            actual: Some(2.4),
            forecast: Some(2.3),
            previous: Some(2.5),
            unit: "%".into(),
        });
    }
    EconomicCalendar::new(releases)
        .zone(TimeZone::UTC)
        .into_any_element()
}

fn render_leverage_slider(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let max = prop_f64(node, "max")
        .unwrap_or(100.0)
        .floor()
        .clamp(2.0, 200.0);
    let val = view_state
        .value(state_key)
        .and_then(value_to_f64)
        .or_else(|| prop_f64(node, "value"))
        .unwrap_or(5.0)
        .clamp(1.0, max);
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    LeverageSlider::new(gpui::ElementId::from(eid.clone()), val, max)
        .on_change(move |next, _, cx| {
            emit_change(&v, &sk, &ntype, json!(next), cx);
        })
        .into_any_element()
}

fn render_market_heatmap(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let mut hm = MarketHeatmap::new(eid.clone());
    let mut count = 0usize;
    for item in extract_item_objects(node) {
        let symbol = item
            .get("label")
            .and_then(Value::as_str)
            .unwrap_or("SYM")
            .to_owned();
        let weight = item
            .get("weight")
            .and_then(value_to_f64)
            .or_else(|| item.get("span").and_then(value_to_f64))
            .map(|v| finite_or(v, 1.0).max(0.0))
            .unwrap_or(1.0);
        let change = item
            .get("value")
            .or_else(|| item.get("change"))
            .and_then(value_to_f64)
            .map(|v| finite_or(v / 100.0, 0.0))
            .unwrap_or(0.0);
        hm = hm.tile(symbol, weight, change);
        count += 1;
    }
    if count == 0 {
        hm = hm.tile("ELY", 5.0, 0.018).tile("NOVA", 3.0, -0.007);
    }
    hm.into_any_element()
}

fn render_market_overview(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let mut ov = MarketOverview::new(eid.clone());
    if let Some(st) = node.props.get("status").and_then(Value::as_object) {
        let label = st.get("label").and_then(Value::as_str).unwrap_or("Market");
        let session = match st
            .get("state")
            .and_then(Value::as_str)
            .unwrap_or("")
            .to_ascii_lowercase()
            .as_str()
        {
            "open" => Session::Open,
            "before" => Session::Before,
            "after" => Session::After,
            _ => Session::Closed,
        };
        let mut ms = MarketStatus::new(label.to_owned(), session);
        if let Some(detail) = st.get("detail").and_then(Value::as_str) {
            ms = ms.next(detail.to_owned());
        }
        ov = ov.status(ms);
    }
    if let Some(items) = node.props.get("items").and_then(Value::as_array) {
        for idx in items {
            let sym = idx.get("label").and_then(Value::as_str).unwrap_or("IDX");
            let desc = idx
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("Index");
            let last = idx
                .get("value")
                .and_then(value_to_f64)
                .filter(|v| *v > 0.0)
                .unwrap_or(100.0);
            let pct = idx
                .get("change")
                .and_then(value_to_f64)
                .map(|v| (v / 100.0).clamp(-0.9, 10.0))
                .unwrap_or(0.0);
            let close = (last / (1.0 + pct)).max(0.01);
            ov = ov.index(
                (sym.to_owned(), desc.to_owned()),
                (last, close),
                [close as f32, ((close + last) * 0.5) as f32, last as f32],
            );
        }
    }
    if let Some(movers) = node.props.get("movers").and_then(Value::as_array) {
        for m in movers {
            let sym = m.get("label").and_then(Value::as_str).unwrap_or("MOV");
            let last = m
                .get("value")
                .and_then(value_to_f64)
                .filter(|v| *v > 0.0)
                .unwrap_or(100.0);
            let pct = m
                .get("change")
                .and_then(value_to_f64)
                .map(|v| (v / 100.0).clamp(-0.9, 10.0))
                .unwrap_or(0.0);
            let close = (last / (1.0 + pct)).max(0.01);
            ov = ov.mover(sym.to_owned(), last, close);
        }
    }
    ov.into_any_element()
}

fn render_multi_chart(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let charts = node
        .props
        .get("charts")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let arrangement = match charts.len() {
        0 | 1 => Arrangement::One,
        2 => Arrangement::Across,
        _ => Arrangement::Four,
    };
    let mut layout = MultiChartLayout::new(gpui::ElementId::from(eid.clone()), arrangement);
    if charts.is_empty() {
        layout = layout.cell(
            LineChart::new(SharedString::from(format!("{eid}-c0")), ["1", "2", "3"])
                .series(ChartSeries::new("Series", [10.0, 20.0, 15.0])),
        );
    } else {
        for (idx, c) in charts.iter().take(4).enumerate() {
            let title = c.get("label").and_then(Value::as_str).unwrap_or("Series");
            let mut vals = c
                .get("points")
                .and_then(Value::as_str)
                .map(parse_points_y)
                .unwrap_or_default();
            if vals.len() < 2 {
                vals = vec![10.0, 20.0, 15.0];
            }
            let labels: Vec<String> = (1..=vals.len()).map(|i| format!("{i}")).collect();
            layout = layout.cell(
                LineChart::new(SharedString::from(format!("{eid}-c{idx}")), labels)
                    .series(ChartSeries::new(title.to_owned(), vals)),
            );
        }
    }
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    layout
        .on_arrange(move |arr, _, cx| {
            emit_change(&v, &sk, &ntype, json!(format!("{arr:?}")), cx);
        })
        .into_any_element()
}

fn render_option_chain(
    node: &ScreenNode,
    eid: &SharedString,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut strikes = Vec::new();
    if let Some(rows) = node.props.get("rows").and_then(Value::as_array) {
        for (idx, row) in rows.iter().enumerate() {
            let Some(cells) = row.get("cells").and_then(Value::as_array) else {
                continue;
            };
            let num = |i: usize, fb: f64| {
                cells
                    .get(i)
                    .and_then(value_to_f64)
                    .map(|v| finite_or(v, fb))
                    .unwrap_or(fb)
            };
            let strike_p = if cells.len() >= 9 {
                num(4, 100.0 + idx as f64 * 5.0)
            } else {
                num(3, 100.0 + idx as f64 * 5.0)
            };
            let call = OptionQuote {
                bid: num(0, 1.0),
                ask: num(1, 1.1),
                volume: num(2, 100.0).max(0.0),
                volatility: 0.25,
            };
            let put = OptionQuote {
                bid: num(cells.len().saturating_sub(3), 1.0),
                ask: num(cells.len().saturating_sub(2), 1.1),
                volume: num(cells.len().saturating_sub(1), 100.0).max(0.0),
                volatility: 0.25,
            };
            strikes.push(Strike {
                strike: strike_p,
                call,
                put,
            });
        }
    }
    if strikes.is_empty() {
        strikes.push(Strike {
            strike: 185.0,
            call: OptionQuote {
                bid: 5.2,
                ask: 5.4,
                volume: 420.0,
                volatility: 0.24,
            },
            put: OptionQuote {
                bid: 2.1,
                ask: 2.3,
                volume: 310.0,
                volatility: 0.26,
            },
        });
    }
    let spot = strikes[strikes.len() / 2].strike;
    let v = view.clone();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();
    OptionChain::new(gpui::ElementId::from(eid.clone()), strikes, spot)
        .on_pick(move |strike, is_call, _, cx| {
            emit_action(
                &v,
                &nid,
                &ntype,
                "click",
                json!({"strike": strike, "call": is_call}),
                cx,
            );
        })
        .into_any_element()
}

fn render_order_book(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let (bids, asks) = parse_book_sides(node);
    OrderBook::new(gpui::ElementId::from(eid.clone()), bids, asks).into_any_element()
}

fn render_order_entry(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    window: &mut Window,
    cx: &mut App,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let symbol = prop_str(node, "symbol").unwrap_or_else(|| "ELY".into());
    let price = prop_f64(node, "price")
        .map(|v| finite_or(v, 100.0).max(0.01))
        .unwrap_or(100.0);
    let quantity = prop_f64(node, "quantity")
        .map(|v| finite_or(v, 100.0).max(0.0))
        .unwrap_or(100.0);
    let kind = node
        .props
        .get("orderKinds")
        .and_then(Value::as_array)
        .and_then(|arr| {
            arr.iter()
                .find(|k| k.get("selected").and_then(Value::as_bool) == Some(true))
                .and_then(|k| k.get("value"))
                .and_then(Value::as_str)
        })
        .map(|k| match k {
            "limit" => OrderKind::Limit,
            "stop" => OrderKind::Stop,
            _ => OrderKind::Market,
        })
        .unwrap_or(OrderKind::Limit);
    let order_state = window.use_keyed_state(
        (gpui::ElementId::from(eid.clone()), "order-entry"),
        cx,
        |_, _| Order {
            symbol: symbol.clone().into(),
            side: Side::Buy,
            kind,
            quantity,
            price,
        },
    );
    let current = order_state.read(cx).clone();
    let st1 = order_state.clone();
    let v1 = view.clone();
    let sk = state_key.to_owned();
    let nt1 = node.node_type.clone();
    let v2 = view.clone();
    let nid = node.id.clone();
    let nt2 = node.node_type.clone();
    OrderEntry::new(gpui::ElementId::from(eid.clone()), current, price)
        .on_change(move |next, _, cx| {
            st1.update(cx, |o, cx| {
                *o = next.clone();
                cx.notify();
            });
            emit_change(
                &v1,
                &sk,
                &nt1,
                json!({"quantity": next.quantity, "price": next.price}),
                cx,
            );
        })
        .on_submit(move |placed, _, cx| {
            emit_action(&v2, &nid, &nt2, "ely:action", json!(placed.words(2)), cx);
        })
        .into_any_element()
}

fn render_portfolio_summary(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let stats = node.props.get("statistics").and_then(Value::as_array);
    let stat_val = |idx: usize, fb: f64| {
        stats
            .and_then(|arr| arr.get(idx))
            .and_then(|s| s.get("value"))
            .and_then(value_to_f64)
            .map(|v| finite_or(v, fb))
            .unwrap_or(fb)
    };
    let stat_trend = |idx: usize| {
        stats
            .and_then(|arr| arr.get(idx))
            .and_then(|s| s.get("trend"))
            .and_then(value_to_f64)
            .map(|v| finite_or(v / 100.0, 0.0))
            .unwrap_or(0.0)
    };
    let total_val = stat_val(0, 100_000.0).max(0.0);
    let day_amt = stat_val(1, 0.0);
    let day_pct = stat_trend(1);
    let all_amt = stat_val(2, 0.0);
    let all_pct = stat_trend(2);
    let cash = stat_val(3, 10_000.0).max(0.0);
    let mut summary = PortfolioSummary::new(
        gpui::ElementId::from(eid.clone()),
        total_val,
        ((day_amt, day_pct), (all_amt, all_pct)),
        cash,
        "USD",
    );
    if let Some(holdings) = node.props.get("holdings").and_then(Value::as_array) {
        for h in holdings {
            let name = h.get("label").and_then(Value::as_str).unwrap_or("Asset");
            let worth = h
                .get("value")
                .and_then(value_to_f64)
                .map(|v| finite_or(v, 0.0).max(0.0))
                .unwrap_or(0.0);
            summary = summary.holding(name.to_owned(), worth);
        }
    }
    summary.into_any_element()
}

fn render_position_table(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let mut positions = Vec::new();
    if let Some(rows) = node.props.get("rows").and_then(Value::as_array) {
        for row in rows {
            let Some(cells) = row.get("cells").and_then(Value::as_array) else {
                continue;
            };
            let sym = cells
                .first()
                .and_then(Value::as_str)
                .unwrap_or("SYM")
                .to_owned();
            let qty = cells
                .get(1)
                .and_then(value_to_f64)
                .map(|v| finite_or(v, 10.0))
                .unwrap_or(10.0);
            let cost = cells
                .get(2)
                .and_then(value_to_f64)
                .map(|v| finite_or(v, 100.0))
                .unwrap_or(100.0);
            let last = cells
                .get(3)
                .and_then(value_to_f64)
                .map(|v| finite_or(v, cost))
                .unwrap_or(cost);
            positions.push(Position {
                symbol: sym.into(),
                quantity: qty,
                cost,
                last,
            });
        }
    }
    if positions.is_empty() {
        positions.push(Position {
            symbol: "ELY".into(),
            quantity: 100.0,
            cost: 160.0,
            last: 182.79,
        });
    }
    PositionTable::new(gpui::ElementId::from(eid.clone()), positions).into_any_element()
}

fn render_renko_chart(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let candles = parse_candles(node);
    let (low, high) = candles.iter().fold((f64::MAX, f64::MIN), |(lo, hi), c| {
        (lo.min(c.low), hi.max(c.high))
    });
    let brick = ((high - low) / 8.0).max(0.5);
    RenkoChart::new(gpui::ElementId::from(eid.clone()), Rc::new(candles), brick)
        .zone(TimeZone::UTC)
        .into_any_element()
}

fn render_screener(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut columns: Vec<Column> = node
        .props
        .get("columns")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(i, c)| {
                    let title = c
                        .as_str()
                        .or_else(|| c.get("label").and_then(Value::as_str))
                        .unwrap_or("Column");
                    Column::new(format!("col-{i}"), title.to_owned())
                })
                .collect()
        })
        .unwrap_or_default();
    if columns.is_empty() {
        columns.push(Column::new("col-0", "Symbol"));
    }
    let col_count = columns.len();
    let rows: Vec<Row> = node
        .props
        .get("rows")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(r_idx, r)| {
                    let mut cells: Vec<Cell> = r
                        .get("cells")
                        .and_then(Value::as_array)
                        .map(|cs| {
                            cs.iter()
                                .map(|v| match v {
                                    Value::String(s) => Cell::Text(s.clone().into()),
                                    Value::Number(n) => n
                                        .as_f64()
                                        .filter(|f| f.is_finite())
                                        .map(Cell::Number)
                                        .unwrap_or(Cell::Empty),
                                    _ => Cell::Empty,
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    cells.resize(col_count, Cell::Empty);
                    Row::new(format!("row-{r_idx}"), cells)
                })
                .collect()
        })
        .unwrap_or_default();
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    Screener::new(gpui::ElementId::from(eid.clone()), columns, rows)
        .on_rules(move |rules, any, _, cx| {
            emit_change(
                &v,
                &sk,
                &ntype,
                json!({"rules": rules.len(), "any": any}),
                cx,
            );
        })
        .into_any_element()
}

fn render_time_and_sales(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let base_day = date(2026, 10, 13);
    let mut trades = Vec::new();
    if let Some(rows) = node.props.get("rows").and_then(Value::as_array) {
        for row in rows {
            let Some(cells) = row.get("cells").and_then(Value::as_array) else {
                continue;
            };
            let time = cells
                .first()
                .and_then(Value::as_str)
                .and_then(|s| parse_timestamp(s, base_day))
                .unwrap_or_else(|| ts_at(base_day, 13, 24, 0));
            let price = cells
                .get(1)
                .and_then(value_to_f64)
                .map(|v| finite_or(v, 100.0))
                .unwrap_or(100.0);
            let size = cells
                .get(2)
                .and_then(value_to_f64)
                .map(|v| finite_or(v, 10.0).max(0.0))
                .unwrap_or(10.0);
            let side = match cells
                .get(3)
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_ascii_lowercase()
                .as_str()
            {
                "sell" => Side::Sell,
                _ => Side::Buy,
            };
            trades.push(Trade {
                time,
                price,
                size,
                side,
            });
        }
    }
    if trades.is_empty() {
        trades.push(Trade {
            time: ts_at(base_day, 13, 24, 0),
            price: 187.26,
            size: 120.0,
            side: Side::Buy,
        });
    }
    TimeAndSales::new(gpui::ElementId::from(eid.clone()), trades)
        .zone(TimeZone::UTC)
        .into_any_element()
}

fn render_watchlist(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let mut watches = Vec::new();
    for (idx, item) in extract_item_objects(node).into_iter().enumerate() {
        let symbol = item
            .get("label")
            .and_then(Value::as_str)
            .map(ToOwned::to_owned)
            .unwrap_or_else(|| format!("SYM{idx}"));
        let name = item
            .get("description")
            .and_then(Value::as_str)
            .unwrap_or(&symbol)
            .to_owned();
        let trailing = item.get("trailing").and_then(Value::as_str).unwrap_or("");
        let mut parts = trailing.split_whitespace();
        let last = parts
            .next()
            .and_then(|s| value_to_f64(&Value::String(s.to_owned())))
            .filter(|v| *v > 0.0)
            .unwrap_or(100.0);
        let pct = parts
            .next()
            .and_then(|s| value_to_f64(&Value::String(s.to_owned())))
            .map(|v| (v / 100.0).clamp(-0.9, 10.0))
            .unwrap_or(0.01);
        let close = (last / (1.0 + pct)).max(0.01);
        watches.push(Watch {
            symbol: symbol.into(),
            name: name.into(),
            last,
            close,
            day: vec![close as f32, ((close + last) * 0.5) as f32, last as f32],
        });
    }
    if watches.is_empty() {
        watches.push(Watch {
            symbol: "ELY".into(),
            name: "Ely Systems".into(),
            last: 182.79,
            close: 179.48,
            day: vec![179.48, 181.0, 182.79],
        });
    }
    let mut wl = Watchlist::new(gpui::ElementId::from(eid.clone()), watches);
    if let Some(sel) = view_state.value(state_key).and_then(Value::as_str) {
        wl = wl.selected(sel.to_owned());
    }
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    wl.on_select(move |sym, _, cx| {
        emit_change(&v, &sk, &ntype, json!(sym.to_string()), cx);
    })
    .into_any_element()
}

fn safe_latlon(lat: f64, lon: f64) -> LatLon {
    LatLon::new(
        finite_or(lat, 0.0).clamp(-90.0, 90.0),
        finite_or(lon, 0.0).clamp(-180.0, 180.0),
    )
}

fn parse_map_viewport(node: &ScreenNode) -> MapViewport {
    let center_obj = node.props.get("center").and_then(Value::as_object);
    let lat = center_obj
        .and_then(|c| c.get("latitude"))
        .and_then(value_to_f64)
        .unwrap_or(25.0);
    let lon = center_obj
        .and_then(|c| c.get("longitude"))
        .and_then(value_to_f64)
        .unwrap_or(10.0);
    let zoom = prop_f64(node, "zoom")
        .map(|z| finite_or(z, 2.0).clamp(MapViewport::ZOOMS.0, MapViewport::ZOOMS.1))
        .unwrap_or(2.0);
    MapViewport::new(safe_latlon(lat, lon), zoom)
}

fn base_map_view_bare(node: &ScreenNode, eid: &SharedString) -> MapView {
    let mut map = MapView::new(gpui::ElementId::from(eid.clone()), parse_map_viewport(node));
    if let Some(attr) = prop_str(node, "attribution").filter(|s| !s.trim().is_empty()) {
        map = map.attribution(attr);
    }
    map
}

fn base_map_view(
    node: &ScreenNode,
    eid: &SharedString,
    _state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> MapView {
    let v = view.clone();
    let id = node.id.clone();
    let ntype = node.node_type.clone();
    let action = prop_str(node, "viewportAction").unwrap_or_else(|| "change-viewport".into());
    base_map_view_bare(node, eid).on_viewport(move |vp, _, cx| {
        emit_action(
            &v,
            &id,
            &ntype,
            "ely:action",
            json!({
                "action": action,
                "viewport": {"latitude": vp.center.lat, "longitude": vp.center.lon, "zoom": vp.zoom},
                "value": format!("{:.4}, {:.4}", vp.center.lat, vp.center.lon),
            }),
            cx,
        );
    })
}

pub(crate) fn render_map_view(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let disabled = prop_bool(node, "disabled");
    let marker_action = prop_str(node, "markerAction").unwrap_or_else(|| "select-marker".into());
    let mut seen = HashSet::new();
    let mut payloads = BTreeMap::new();
    let markers: Vec<MapMarker> = node
        .props
        .get("points")
        .and_then(Value::as_array)
        .map(|points| {
            points
                .iter()
                .enumerate()
                .filter_map(|(index, point)| {
                    let lat = point.get("latitude").and_then(value_to_f64)?;
                    let lon = point.get("longitude").and_then(value_to_f64)?;
                    let raw_key = point
                        .get("key")
                        .or_else(|| point.get("label"))
                        .and_then(Value::as_str)
                        .filter(|key| !key.is_empty())
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("marker-{index}"));
                    let mut key = raw_key.clone();
                    let mut suffix = 0;
                    while !seen.insert(key.clone()) {
                        suffix += 1;
                        key = format!("{raw_key}-{suffix}");
                    }
                    let at = safe_latlon(lat, lon);
                    payloads.insert(
                        key.clone(),
                        json!({
                            "action": marker_action,
                            "key": key,
                            "value": point.get("value").cloned().unwrap_or(Value::Null),
                            "latitude": at.lat,
                            "longitude": at.lon,
                        }),
                    );
                    let mut marker = MapMarker::new(key, at);
                    if let Some(label) = point.get("label").and_then(Value::as_str) {
                        marker = marker.label(label);
                    }
                    if let Some(hue) = point.get("hue").and_then(Value::as_u64) {
                        marker = marker.hue(hue as usize);
                    }
                    Some(marker)
                })
                .collect()
        })
        .unwrap_or_default();
    let mut map = if disabled {
        base_map_view_bare(node, eid)
    } else {
        base_map_view(node, eid, state_key, view)
    }
    .markers(markers);
    if !disabled {
        let v = view.clone();
        let id = node.id.clone();
        let ntype = node.node_type.clone();
        map = map.on_marker(move |key, _, cx| {
            if let Some(payload) = payloads.get(key.as_ref()) {
                emit_action(&v, &id, &ntype, "ely:action", payload.clone(), cx);
            }
        });
    }
    div()
        .w_full()
        .h(px(box_height(node, 320.0)))
        .child(WorldMap::new(
            (gpui::ElementId::from(eid.clone()), "world"),
            map,
            Vec::<(String, f64)>::new(),
        ))
        .into_any_element()
}

fn is_iso_alpha2(code: &str) -> bool {
    const CODES: &[&str] = &[
        "AD", "AE", "AF", "AG", "AI", "AL", "AM", "AO", "AQ", "AR", "AS", "AT", "AU", "AW", "AX",
        "AZ", "BA", "BB", "BD", "BE", "BF", "BG", "BH", "BI", "BJ", "BL", "BM", "BN", "BO", "BQ",
        "BR", "BS", "BT", "BV", "BW", "BY", "BZ", "CA", "CC", "CD", "CF", "CG", "CH", "CI", "CK",
        "CL", "CM", "CN", "CO", "CR", "CU", "CV", "CW", "CX", "CY", "CZ", "DE", "DJ", "DK", "DM",
        "DO", "DZ", "EC", "EE", "EG", "EH", "ER", "ES", "ET", "FI", "FJ", "FK", "FM", "FO", "FR",
        "GA", "GB", "GD", "GE", "GF", "GG", "GH", "GI", "GL", "GM", "GN", "GP", "GQ", "GR", "GS",
        "GT", "GU", "GW", "GY", "HK", "HM", "HN", "HR", "HT", "HU", "ID", "IE", "IL", "IM", "IN",
        "IO", "IQ", "IR", "IS", "IT", "JE", "JM", "JO", "JP", "KE", "KG", "KH", "KI", "KM", "KN",
        "KP", "KR", "KW", "KY", "KZ", "LA", "LB", "LC", "LI", "LK", "LR", "LS", "LT", "LU", "LV",
        "LY", "MA", "MC", "MD", "ME", "MF", "MG", "MH", "MK", "ML", "MM", "MN", "MO", "MP", "MQ",
        "MR", "MS", "MT", "MU", "MV", "MW", "MX", "MY", "MZ", "NA", "NC", "NE", "NF", "NG", "NI",
        "NL", "NO", "NP", "NR", "NU", "NZ", "OM", "PA", "PE", "PF", "PG", "PH", "PK", "PL", "PM",
        "PN", "PR", "PS", "PT", "PW", "PY", "QA", "RE", "RO", "RS", "RU", "RW", "SA", "SB", "SC",
        "SD", "SE", "SG", "SH", "SI", "SJ", "SK", "SL", "SM", "SN", "SO", "SR", "SS", "ST", "SV",
        "SX", "SY", "SZ", "TC", "TD", "TF", "TG", "TH", "TJ", "TK", "TL", "TM", "TN", "TO", "TR",
        "TT", "TV", "TW", "TZ", "UA", "UG", "UM", "US", "UY", "UZ", "VA", "VC", "VE", "VG", "VI",
        "VN", "VU", "WF", "WS", "XK", "YE", "YT", "ZA", "ZM", "ZW",
    ];
    CODES.binary_search(&code).is_ok()
}

fn render_choropleth(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let map = base_map_view(node, eid, state_key, view);
    let hue = prop_f64(node, "hue").unwrap_or(0.0).max(0.0) as usize;
    let mut seen = HashSet::new();
    let mut pairs: Vec<(String, f64)> = node
        .props
        .get("points")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    let label = p.get("label").and_then(Value::as_str)?.trim().to_owned();
                    let val = p.get("value").and_then(value_to_f64)?;
                    if !label.is_empty() && val.is_finite() && seen.insert(label.clone()) {
                        Some((label, val))
                    } else {
                        None
                    }
                })
                .collect()
        })
        .unwrap_or_default();
    let features = prop_str(node, "geoJSON")
        .filter(|s| !s.trim().is_empty())
        .and_then(|raw| read_geojson(&raw).ok())
        .unwrap_or_default();
    let h = box_height(node, 320.0);
    if features.is_empty() && !pairs.is_empty() && pairs.iter().all(|(c, _)| is_iso_alpha2(c)) {
        let wm = WorldMap::new(gpui::ElementId::from(eid.clone()), map, pairs).hue(hue);
        return div().w_full().h(px(h)).child(wm).into_any_element();
    }
    if pairs.is_empty() {
        pairs.push(("region".into(), 1.0));
    }
    let key_prop = features.first().and_then(|f| {
        ["region", "name", "id"]
            .into_iter()
            .find(|k| f.properties.contains_key(*k))
    });
    let mut layer = ChoroplethLayer::new(features, pairs).hue(hue);
    if let Some(prop) = key_prop {
        layer = layer.key_by(prop);
    }
    let cm = ChoroplethMap::new(gpui::ElementId::from(eid.clone()), map, layer);
    div().w_full().h(px(h)).child(cm).into_any_element()
}

fn render_geo_heatmap(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let hue = prop_f64(node, "hue").unwrap_or(0.0).max(0.0) as usize;
    let points: Vec<(LatLon, f32)> = node
        .props
        .get("points")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .filter_map(|p| {
                    let lat = p.get("latitude").and_then(value_to_f64)?;
                    let lon = p.get("longitude").and_then(value_to_f64)?;
                    let weight = p
                        .get("value")
                        .and_then(value_to_f64)
                        .map(|v| (finite_or(v, 1.0) as f32).max(0.0))
                        .unwrap_or(1.0);
                    Some((safe_latlon(lat, lon), weight))
                })
                .collect()
        })
        .unwrap_or_default();
    let map = base_map_view(node, eid, state_key, view).layer(GeoHeatmap::new(points).hue(hue));
    div()
        .w_full()
        .h(px(box_height(node, 320.0)))
        .child(map)
        .into_any_element()
}

fn render_location_picker(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let map = base_map_view_bare(node, eid);
    let fmt = match prop_str(node, "format").as_deref() {
        Some("dms") => CoordFormat::Dms,
        _ => CoordFormat::Decimal,
    };
    let v = view.clone();
    let sk = state_key.to_owned();
    let ntype = node.node_type.clone();
    let picker = LocationPicker::new(gpui::ElementId::from(eid.clone()), map)
        .format(fmt)
        .on_pick(move |loc, _, cx| {
            emit_change(
                &v,
                &sk,
                &ntype,
                json!(format!("{:.4},{:.4}", loc.lat, loc.lon)),
                cx,
            );
        });
    div()
        .w_full()
        .h(px(box_height(node, 288.0)))
        .child(picker)
        .into_any_element()
}

fn render_route_line(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let hue = prop_f64(node, "hue").unwrap_or(0.0).max(0.0) as usize;
    let mut map = base_map_view(node, eid, state_key, view);
    if let Some(features) = prop_str(node, "geoJSON")
        .filter(|s| !s.trim().is_empty())
        .and_then(|raw| read_geojson(&raw).ok())
    {
        map = map.layer(GeoJsonLayer::new(features).hue(hue));
    }
    if let Some(routes) = node.props.get("routes").and_then(Value::as_array) {
        for r in routes {
            let pts: Vec<LatLon> = r
                .get("points")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(|p| {
                            let lat = p.get("latitude").and_then(value_to_f64)?;
                            let lon = p.get("longitude").and_then(value_to_f64)?;
                            Some(safe_latlon(lat, lon))
                        })
                        .collect()
                })
                .unwrap_or_default();
            if pts.len() >= 2 {
                map = map.layer(RouteLine::new(pts).hue(hue));
            }
        }
    }
    div()
        .w_full()
        .h(px(box_height(node, 320.0)))
        .child(map)
        .into_any_element()
}

fn render_changelog(node: &ScreenNode) -> AnyElement {
    let mut log = Changelog::new();
    let mut count = 0usize;
    if let Some(releases) = node.props.get("releases").and_then(Value::as_array) {
        for r in releases {
            let ver = r.get("version").and_then(Value::as_str).unwrap_or("1.0.0");
            let date_s = r.get("date").and_then(Value::as_str).unwrap_or("");
            let mut rel = Release::new(ver.to_owned(), date_s.to_owned());
            if let Some(sum) = r.get("summary").and_then(Value::as_str) {
                rel = rel.summary(sum.to_owned());
            }
            if let Some(changes) = r.get("changes").and_then(Value::as_array) {
                for ch in changes {
                    let kind = match ch
                        .get("kind")
                        .and_then(Value::as_str)
                        .unwrap_or("")
                        .to_ascii_lowercase()
                        .as_str()
                    {
                        "added" => Change::Added,
                        "deprecated" => Change::Deprecated,
                        "removed" => Change::Removed,
                        "fixed" => Change::Fixed,
                        "security" => Change::Security,
                        _ => Change::Changed,
                    };
                    if let Some(items) = ch.get("items").and_then(Value::as_array) {
                        for text in items.iter().filter_map(Value::as_str) {
                            rel = rel.change(kind, text.to_owned());
                        }
                    }
                }
            }
            log = log.release(rel);
            count += 1;
        }
    }
    if count == 0 {
        log = log.release(Release::new("1.0.0", "Today").change(Change::Added, "Initial release"));
    }
    log.into_any_element()
}

fn image_source(raw: &str) -> ImageSource {
    if raw.starts_with("http://") || raw.starts_with("https://") {
        SharedUri::from(raw.to_owned()).into()
    } else {
        Path::new(raw).into()
    }
}

fn render_gallery(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let slides: Vec<Slide> = node
        .props
        .get("items")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .map(|item| {
                    let url = item
                        .get("imageURL")
                        .and_then(Value::as_str)
                        .unwrap_or("/missing.png");
                    let cap = item
                        .get("label")
                        .or_else(|| item.get("imageAlt"))
                        .and_then(Value::as_str)
                        .unwrap_or("Image");
                    Slide::new(image_source(url), cap.to_owned())
                })
                .collect()
        })
        .unwrap_or_default();
    Gallery::new(gpui::ElementId::from(eid.clone()), slides)
        .columns(3)
        .into_any_element()
}

fn render_watermark(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let mark = prop_str(node, "watermark").unwrap_or_else(|| "Confidential".into());
    let title = non_empty_or(&best_title(node), "Document");
    let body = best_body(node).unwrap_or_default();
    Watermark::new(gpui::ElementId::from(eid.clone()), mark)
        .w_full()
        .min_h(px(140.0))
        .child(Card::new().header(CardHeader::new(title).description(body)))
        .into_any_element()
}

fn render_dashboard_grid(
    node: &ScreenNode,
    eid: &SharedString,
    state_key: &str,
    view_state: &CatalogueView,
    view: &WeakEntity<CatalogueView>,
) -> AnyElement {
    let filters: Vec<DashboardFilter> = node
        .props
        .get("filters")
        .and_then(Value::as_array)
        .map(|arr| {
            arr.iter()
                .enumerate()
                .map(|(idx, f)| {
                    let key = f
                        .get("name")
                        .and_then(Value::as_str)
                        .map(ToOwned::to_owned)
                        .unwrap_or_else(|| format!("filter-{idx}"));
                    let name = f
                        .get("label")
                        .and_then(Value::as_str)
                        .unwrap_or(&key)
                        .to_owned();
                    let mut picked = None;
                    let mut choices: Vec<Choice> = f
                        .get("options")
                        .and_then(Value::as_array)
                        .map(|opts| {
                            opts.iter()
                                .enumerate()
                                .map(|(o_idx, o)| {
                                    let val = o
                                        .get("value")
                                        .and_then(Value::as_str)
                                        .map(ToOwned::to_owned)
                                        .unwrap_or_else(|| format!("opt-{o_idx}"));
                                    let lbl = o
                                        .get("label")
                                        .and_then(Value::as_str)
                                        .unwrap_or(&val)
                                        .to_owned();
                                    if o.get("selected").and_then(Value::as_bool) == Some(true) {
                                        picked = Some(SharedString::from(val.clone()));
                                    }
                                    Choice::new(val, lbl)
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    if choices.is_empty() {
                        choices.push(Choice::new("all", "All"));
                    }
                    DashboardFilter {
                        key: key.into(),
                        name: name.into(),
                        choices,
                        picked,
                    }
                })
                .collect()
        })
        .unwrap_or_default();

    let every = node
        .props
        .get("refreshOptions")
        .and_then(Value::as_array)
        .and_then(|arr| {
            arr.iter()
                .find(|o| o.get("selected").and_then(Value::as_bool) == Some(true))
                .and_then(|o| o.get("value"))
                .and_then(value_to_f64)
                .map(|n| n as u32)
        })
        .filter(|s| matches!(*s, 5 | 10 | 30 | 60 | 300 | 900));

    let mut tiles = Vec::new();
    let mut cards = Vec::new();
    let mut seen_keys = HashSet::new();
    if let Some(widgets) = node.props.get("widgets").and_then(Value::as_array) {
        for (idx, w_obj) in widgets.iter().enumerate() {
            let mut key = w_obj
                .get("key")
                .and_then(Value::as_str)
                .unwrap_or("")
                .to_owned();
            if key.is_empty() || !seen_keys.insert(key.clone()) {
                key = format!("widget-{idx}");
                seen_keys.insert(key.clone());
            }
            let x = w_obj
                .get("x")
                .and_then(value_to_f64)
                .unwrap_or(0.0)
                .max(0.0) as u32;
            let y = w_obj
                .get("y")
                .and_then(value_to_f64)
                .unwrap_or(0.0)
                .max(0.0) as u32;
            let w = w_obj
                .get("w")
                .and_then(value_to_f64)
                .unwrap_or(4.0)
                .clamp(1.0, 12.0) as u32;
            let h = w_obj
                .get("h")
                .and_then(value_to_f64)
                .unwrap_or(2.0)
                .clamp(1.0, 12.0) as u32;
            let label = w_obj
                .get("label")
                .and_then(Value::as_str)
                .unwrap_or(&key)
                .to_owned();
            let subtitle = w_obj
                .get("subtitle")
                .and_then(Value::as_str)
                .map(ToOwned::to_owned);
            let value = w_obj
                .get("value")
                .and_then(|v| match v {
                    Value::String(s) => Some(s.clone()),
                    Value::Number(n) => Some(n.to_string()),
                    _ => None,
                })
                .unwrap_or_default();
            tiles.push(DashTile::new(key.clone(), (x, y), (w, h)));
            let mut card = DashboardCard::new(label);
            if let Some(sub) = subtitle {
                card = card.subtitle(sub);
            }
            if !value.is_empty() {
                card = card.body(Heading::h2(value));
            }
            cards.push((key, card));
        }
    }

    let v1 = view.clone();
    let sk1 = state_key.to_owned();
    let nt1 = node.node_type.clone();
    let v2 = view.clone();
    let sk2 = state_key.to_owned();
    let nt2 = node.node_type.clone();
    let bar = DashboardFilterBar::new(
        (gpui::ElementId::from(eid.clone()), "filters"),
        TimeWindow::Day,
        filters,
        move |win, _, cx| {
            emit_change(&v1, &sk1, &nt1, json!(win.words()), cx);
        },
        move |k, val, _, cx| {
            emit_change(
                &v2,
                &sk2,
                &nt2,
                json!({k.to_string(): val.map(|s| s.to_string())}),
                cx,
            );
        },
    );

    let v3 = view.clone();
    let sk3 = state_key.to_owned();
    let nt3 = node.node_type.clone();
    let v4 = view.clone();
    let nid4 = node.id.clone();
    let nt4 = node.node_type.clone();
    let now = Timestamp::from_second(1_760_000_030).unwrap_or(Timestamp::UNIX_EPOCH);
    let last = Timestamp::from_second(1_760_000_000).unwrap_or(Timestamp::UNIX_EPOCH);
    let refresh = RefreshIntervalSelector::new(
        (gpui::ElementId::from(eid.clone()), "refresh"),
        every,
        last,
        now,
        move |sec, _, cx| {
            emit_change(&v3, &sk3, &nt3, json!(sec), cx);
        },
        move |_, cx| {
            emit_action(&v4, &nid4, &nt4, "ely:action", json!("refresh"), cx);
        },
    );

    let v5 = view.clone();
    let sk5 = state_key.to_owned();
    let nt5 = node.node_type.clone();
    let mut grid = DashboardGrid::new(
        (gpui::ElementId::from(eid.clone()), "grid"),
        12,
        tiles,
        move |next, _, cx| {
            emit_change(&v5, &sk5, &nt5, json!(next.len()), cx);
        },
    );
    for (key, card) in cards {
        grid = grid.card(key, card);
    }
    let _ = view_state;
    v_stack()
        .w_full()
        .gap_3()
        .child(
            h_stack()
                .justify_between()
                .flex_wrap()
                .gap_2()
                .child(bar)
                .child(refresh),
        )
        .child(grid)
        .into_any_element()
}
