use std::{
    cell::RefCell,
    collections::{BTreeMap, BTreeSet},
    fs,
    io::Read,
    path::PathBuf,
    rc::Rc,
};

use ely_gpui_component::{
    dashboard::{DashboardCard, Tile},
    init_for_tests,
    theme::Theme,
};
use elysdui_gpui::{
    catalogue::{CatalogueRegistry, CatalogueView},
    dashboard::{
        DashboardRenderer, DashboardSpec, Screen, ScreenNode, WidgetContext, WidgetPlugin,
        WidgetRegistry, decode_screen_json, validate_screen,
    },
    profile::{
        Acceptance, CAPABILITIES, MAX_DEPTH, MAX_NODES, MAX_RESPONSE_BYTES, MAX_SAFE_INT,
        PROTOCOL_VERSION, PendingKind, ProfileEnvelope, ProfileState, ProfileView, RequestPhase,
        ResponseStatus, SaveRequest, decode_envelope, reject_ambiguous_json, validate_envelope,
    },
};
use flate2::read::GzDecoder;
use gpui::{
    App, AppContext, Context, IntoElement, Modifiers, Render, Styled, TestAppContext, Window, div,
};
use serde::Deserialize;
use serde_json::{Value, json};

fn contracts_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("..")
        .join("contracts")
        .join("native")
        .join("profile-v1")
}

#[derive(Deserialize)]
struct CatalogueFixture {
    name: String,
    props: BTreeMap<String, Value>,
}

fn load_catalogue_fixtures() -> Vec<CatalogueFixture> {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("..")
        .join("gohtmx")
        .join("testdata")
        .join("catalogue_fixtures.json.gz");
    let gz = fs::read(path).expect("read catalogue_fixtures.json.gz");
    let mut decoder = GzDecoder::new(&gz[..]);
    let mut raw = Vec::new();
    decoder
        .read_to_end(&mut raw)
        .expect("decompress catalogue fixtures");
    serde_json::from_slice(&raw).expect("parse catalogue fixtures")
}

fn make_node(id: &str, node_type: &str, props: BTreeMap<String, Value>) -> ScreenNode {
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

fn load_fixture_bytes(name: &str) -> Vec<u8> {
    fs::read(
        contracts_dir()
            .join("fixtures")
            .join(format!("{name}.json")),
    )
    .expect("read fixture bytes")
}

fn load_fixture(name: &str) -> ProfileEnvelope {
    decode_envelope(&load_fixture_bytes(name)).expect("decode fixture")
}

fn loaded_state(fixture_name: &str) -> ProfileState {
    let ready = load_fixture(fixture_name);
    let mut state = ProfileState::new();
    state
        .begin_load(false, ready.request_id.clone())
        .expect("begin load");
    assert_eq!(state.receive(ready).expect("receive"), Acceptance::Applied);
    state
}

#[test]
fn readonly_and_disabled_fields_reject_local_edits() {
    for mode in ["readonly", "disabled"] {
        let mut ready = load_fixture("profile-ready");
        let props = &mut ready.region.children[0].children[2].children[0].props;
        if mode == "readonly" {
            props.readonly = Some(true);
        } else {
            props.disabled = Some(true);
        }
        let mut state = ProfileState::new();
        state.begin_load(false, ready.request_id.clone()).unwrap();
        state.receive(ready).unwrap();
        state.edit("displayName", "changed");
        assert_eq!(state.drafts()["displayName"], "Ada");
        assert_eq!(state.edit_revisions()["displayName"], 0);
    }
}

fn reply_to(
    pending: &elysdui_gpui::profile::PendingRequest,
    status: ResponseStatus,
    display_name: &str,
) -> ProfileEnvelope {
    let PendingKind::Save(save) = &pending.kind else {
        panic!("expected save request");
    };
    let mut env = load_fixture("profile-ready");
    env.request_id = pending.request_id.clone();
    env.session_id = save.session_id.clone();
    env.screen_revision = save.screen_revision.clone();
    env.data_version = save.data_version + i64::from(status == ResponseStatus::Saved);
    env.status = status;
    env.fields = BTreeMap::from([("displayName".into(), display_name.into())]);
    env.acknowledged_edits = save.edit_revisions.clone();
    env.message = if status == ResponseStatus::Saved {
        "Profile saved.".into()
    } else {
        "No changes saved.".into()
    };
    if status == ResponseStatus::Invalid {
        env.errors = BTreeMap::from([("displayName".into(), "Use 2 to 60 characters.".into())]);
    }
    env
}

#[test]
fn support_matrix_matches_gpui_profile_capabilities() {
    let raw = fs::read_to_string(contracts_dir().join("support-matrix.json"))
        .expect("read support-matrix.json");
    let matrix: Value = serde_json::from_str(&raw).expect("parse support-matrix.json");
    assert_eq!(matrix["protocolVersion"], PROTOCOL_VERSION);
    assert_eq!(matrix["defaultStatus"], "unsupported");
    let matrix_types: BTreeSet<String> = matrix["components"]
        .as_array()
        .expect("components array")
        .iter()
        .map(|c| c["type"].as_str().expect("component type").to_owned())
        .collect();
    let gpui_caps: BTreeSet<String> = CAPABILITIES.iter().map(|s| (*s).to_owned()).collect();
    assert_eq!(matrix_types, gpui_caps);
}

#[test]
fn all_six_shared_fixtures_decode_and_validate() {
    let ready = load_fixture("profile-ready");
    assert_eq!(ready.status, ResponseStatus::Ready);
    assert_eq!(
        ready.fields.get("displayName").map(String::as_str),
        Some("Ada")
    );

    let saved = load_fixture("profile-saved");
    assert_eq!(saved.status, ResponseStatus::Saved);
    assert_eq!(
        saved.fields.get("displayName").map(String::as_str),
        Some("Grace Hopper")
    );

    let invalid = load_fixture("profile-invalid");
    assert_eq!(invalid.status, ResponseStatus::Invalid);
    assert_eq!(invalid.errors.len(), 1);

    let controls_ready = load_fixture("profile-controls-ready");
    assert_eq!(controls_ready.fields.len(), 5);

    let controls_saved = load_fixture("profile-controls-saved");
    assert_eq!(controls_saved.status, ResponseStatus::Saved);
    assert_eq!(
        controls_saved.fields.get("colorTheme").map(String::as_str),
        Some("dark")
    );

    let controls_invalid = load_fixture("profile-controls-invalid");
    assert_eq!(controls_invalid.status, ResponseStatus::Invalid);
    assert!(controls_invalid.errors.contains_key("colorTheme"));
}

#[test]
fn rejects_unsupported_protocol_capability_type_and_action() {
    let mut env = load_fixture("profile-ready");
    env.protocol_version = "2".into();
    assert!(validate_envelope(&env).is_err());

    let mut env = load_fixture("profile-ready");
    env.required_capabilities.push("slider".into());
    assert!(validate_envelope(&env).is_err());

    let mut env = load_fixture("profile-ready");
    env.region.children[0].children[0].node_type = "webview".into();
    assert!(validate_envelope(&env).is_err());

    let mut env = load_fixture("profile-ready");
    env.region.children[0].children[0].id = "profile-region".into();
    assert!(validate_envelope(&env).is_err());

    let mut env = load_fixture("profile-ready");
    env.region.children[0].children[2].events[0].action = "https://evil.invalid/save".into();
    assert!(validate_envelope(&env).is_err());

    let mut env = load_fixture("profile-ready");
    env.region.children[0].children[2].children.pop();
    assert!(validate_envelope(&env).is_err());

    let mut env = load_fixture("profile-ready");
    env.region.children[0].children[2].children[0]
        .props
        .input_type = Some("password".into());
    assert!(validate_envelope(&env).is_err());

    let mut env = load_fixture("profile-ready");
    env.region.children[0].children[2].children[0].props.name = Some("secret".into());
    assert!(validate_envelope(&env).is_err());
}

#[test]
fn enforces_limits_duplicate_keys_and_closed_selection_props() {
    assert!(decode_envelope(&vec![b' '; MAX_RESPONSE_BYTES + 1]).is_err());

    let raw = String::from_utf8(load_fixture_bytes("profile-ready")).unwrap();
    for dup in [r#""region":{},"#, r#""\u0072egion":{},"#] {
        let bad = format!("{{{dup}{}", &raw[1..]);
        let err = decode_envelope(bad.as_bytes()).unwrap_err();
        assert!(err.message.contains("Duplicate JSON"));
    }
    assert!(reject_ambiguous_json(br#"{"a":[{"label":1,"\u006cabel":2}]}"#).is_err());

    let mut obj: Value = serde_json::from_str(&raw).unwrap();
    obj["futureMetadata"] = json!({"anything": true});
    assert!(decode_envelope(&serde_json::to_vec(&obj).unwrap()).is_ok());

    let mut env = load_fixture("profile-ready");
    env.data_version = MAX_SAFE_INT + 1;
    assert!(validate_envelope(&env).is_err());

    let mut env = load_fixture("profile-ready");
    let leaf = env.region.children[0].children[0].clone();
    for i in 0..MAX_NODES {
        let mut copy = leaf.clone();
        copy.id = format!("extra-{i}");
        env.region.children.push(copy);
    }
    assert!(decode_envelope(&serde_json::to_vec(&env).unwrap()).is_err());

    let mut env = load_fixture("profile-ready");
    let mut nested = env.region.children[0].clone();
    nested.children.clear();
    for i in 0..=MAX_DEPTH {
        let mut wrapper = env.region.children[0].clone();
        wrapper.id = format!("deep-{i}");
        wrapper.children = vec![nested];
        nested = wrapper;
    }
    env.region.children.push(nested);
    assert!(decode_envelope(&serde_json::to_vec(&env).unwrap()).is_err());

    let controls_raw = load_fixture_bytes("profile-controls-ready");
    let mut controls_val: Value = serde_json::from_slice(&controls_raw).unwrap();
    let select_props = controls_val["region"]["children"][0]["children"][2]["children"][4]["props"]
        .as_object_mut()
        .unwrap();
    select_props.insert("unknown".into(), json!(false));
    assert!(decode_envelope(&serde_json::to_vec(&controls_val).unwrap()).is_err());

    let mut controls_env = load_fixture("profile-controls-ready");
    controls_env
        .fields
        .insert("colorTheme".into(), "missing".into());
    assert!(validate_envelope(&controls_env).is_err());

    let mut trailing_env = load_fixture("profile-controls-ready");
    let val = trailing_env.fields.remove("company").unwrap();
    trailing_env.fields.insert("company\n".into(), val);
    trailing_env.region.children[0].children[2].children[1]
        .props
        .name = Some("company\n".into());
    assert!(validate_envelope(&trailing_env).is_err());
}

#[test]
fn profile_state_reconciliation_and_stale_guards() {
    let mut state = loaded_state("profile-ready");
    assert_eq!(
        state.drafts().get("displayName").map(String::as_str),
        Some("Ada")
    );
    assert_eq!(state.edit_revisions().get("displayName"), Some(&0));

    state.edit("displayName", "  Grace Hopper  ");
    let pending = state.begin_save("req-1").expect("begin save");
    state.edit("displayName", "Newer local edit");
    assert_eq!(
        state
            .receive(reply_to(&pending, ResponseStatus::Saved, "Grace Hopper"))
            .unwrap(),
        Acceptance::Applied
    );
    assert_eq!(
        state.baseline().get("displayName").map(String::as_str),
        Some("Grace Hopper")
    );
    assert_eq!(
        state.drafts().get("displayName").map(String::as_str),
        Some("Newer local edit")
    );
    assert!(state.has_unsaved_changes());

    let req2 = state.begin_save("req-2").expect("save 2");
    state.fail("req-2", "Timeout", true);
    assert_eq!(state.phase(), RequestPhase::Retryable);
    let retried = state.retry().expect("retry");
    assert_eq!(retried, req2);
    state.edit("displayName", "Even newer");
    state
        .receive(reply_to(&retried, ResponseStatus::Invalid, "Grace Hopper"))
        .unwrap();
    assert!(state.field_errors().is_empty());
    assert_eq!(state.status_message(), "");

    let req3 = state.begin_save("req-3").expect("save 3");
    let mut wrong_req = reply_to(&req3, ResponseStatus::Saved, "Other");
    wrong_req.request_id = "other-req".into();
    assert_eq!(state.receive(wrong_req).unwrap(), Acceptance::Ignored);

    let mut older_ver = reply_to(&req3, ResponseStatus::Conflict, "Old");
    older_ver.data_version = 0;
    assert_eq!(state.receive(older_ver).unwrap(), Acceptance::Ignored);

    let mut conflict = reply_to(&req3, ResponseStatus::Conflict, "Other device");
    conflict.data_version = 8;
    conflict.screen_revision = "rev-8".into();
    assert_eq!(state.receive(conflict).unwrap(), Acceptance::Applied);
    assert_eq!(
        state.drafts().get("displayName").map(String::as_str),
        Some("Even newer")
    );
    let next = state.begin_save("req-4").expect("save 4");
    let wire: SaveRequest = serde_json::from_slice(next.body.as_ref().unwrap()).unwrap();
    assert_eq!(wire.data_version, 8);
    assert_eq!(wire.screen_revision, "rev-8");

    state.fail("req-4", "Session expired", false);
    assert_eq!(state.phase(), RequestPhase::Blocked);
    assert!(state.retry().is_err());
    assert!(state.begin_load(false, "reload-no").is_err());
    let reload = state
        .begin_load(true, "reload-yes")
        .expect("confirm reload");
    let mut ready = load_fixture("profile-ready");
    ready.request_id = reload.request_id;
    ready.session_id = "new-session".into();
    assert_eq!(state.receive(ready).unwrap(), Acceptance::Applied);
    assert_eq!(
        state.drafts().get("displayName").map(String::as_str),
        Some("Ada")
    );
    assert!(state.can_save());
}

#[test]
fn screen_schema_perses_spec_and_widget_registry_contracts() {
    let perses_json = serde_json::to_string(&json!({
        "kind": "Dashboard",
        "metadata": { "name": "ops-overview", "project": "demo" },
        "spec": {
            "display": { "name": "Operations Overview" },
            "variables": [
                { "kind": "ListVariable", "spec": { "name": "filter", "label": "Filter", "value": "all" } }
            ],
            "panels": {
                "stats": {
                    "kind": "Panel",
                    "spec": {
                        "display": { "name": "Summary" },
                        "plugin": { "kind": "StatChart", "spec": {} }
                    }
                },
                "filters": {
                    "kind": "Panel",
                    "spec": {
                        "display": { "name": "Filters" },
                        "plugin": { "kind": "FilterList", "spec": {} }
                    }
                },
                "custom-map": {
                    "kind": "Panel",
                    "spec": {
                        "display": { "name": "Map" },
                        "plugin": { "kind": "CustomMap", "spec": { "elysduiType": "maps/CustomMap" } }
                    }
                },
                "chart": {
                    "kind": "Panel",
                    "spec": {
                        "display": { "name": "Series" },
                        "plugin": { "kind": "TimeSeriesChart", "spec": {} }
                    }
                }
            },
            "layouts": [{
                "kind": "Grid",
                "spec": {
                    "columns": 12,
                    "items": [
                        { "x": 0, "y": 0, "width": 3, "height": 6, "content": { "$ref": "#/spec/panels/filters" } },
                        { "x": 3, "y": 0, "width": 9, "height": 2, "content": { "$ref": "#/spec/panels/stats" } },
                        { "x": 3, "y": 2, "width": 9, "height": 2, "content": { "$ref": "#/spec/panels/custom-map" } },
                        { "x": 3, "y": 4, "width": 9, "height": 2, "content": { "$ref": "#/spec/panels/chart" } }
                    ]
                }
            }],
            "duration": "12h",
            "timezone": "UTC"
        }
    }))
    .unwrap();

    let mut spec = DashboardSpec::from_perses_json(&perses_json).expect("valid perses");
    let mut tiles = spec.tiles(false);
    tiles[1].w = 6;
    spec.apply_tiles(&tiles);
    assert_eq!(spec.tiles(false)[1].w, 6);

    let screen = spec.to_elysdui_screen("ops-loader");
    validate_screen(&screen).expect("screen validates");
    let encoded = serde_json::to_vec(&screen).unwrap();
    let decoded = decode_screen_json(&encoded).expect("roundtrip screen");
    assert_eq!(decoded, screen);
    assert_eq!(decoded.root.children.len(), 4);
    assert_eq!(decoded.root.children[2].node_type, "maps/CustomMap");

    let mut bad_screen = screen.clone();
    bad_screen.version = "2".into();
    assert!(validate_screen(&bad_screen).is_err());

    let mut dup_screen = screen.clone();
    dup_screen.root.children[1].id = dup_screen.root.children[0].id.clone();
    assert!(validate_screen(&dup_screen).is_err());

    let dangling = r##"{"kind":"Dashboard","metadata":{"name":"bad"},"spec":{"display":{"name":"bad"},"panels":{},"layouts":[{"kind":"Grid","spec":{"columns":12,"items":[{"x":0,"y":0,"width":4,"height":2,"content":{"$ref":"#/spec/panels/missing"}}]}}],"duration":"12h"}}"##;
    assert!(DashboardSpec::from_perses_json(dangling).is_err());

    let mut registry = WidgetRegistry::with_defaults();
    assert!(registry.get("data/StatSummary").is_some());
    assert!(registry.get("dashboard/FilterSidebar").is_some());
    assert!(registry.get("charts/TimeSeriesChart").is_some());
    assert!(registry.get("maps/CustomMap").is_none());

    struct CustomMapPlugin;
    impl WidgetPlugin for CustomMapPlugin {
        fn widget_type(&self) -> &str {
            "maps/CustomMap"
        }
        fn render_card(
            &self,
            node: &ScreenNode,
            _ctx: &WidgetContext<'_>,
            _window: &mut Window,
            _cx: &mut App,
        ) -> DashboardCard {
            DashboardCard::new(node.id.clone()).body(div())
        }
    }
    registry.register(CustomMapPlugin);
    assert!(registry.get("maps/CustomMap").is_some());
}

#[gpui::test]
fn gpui_renders_profile_view_and_extensible_dashboard(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    let requests = Rc::new(RefCell::new(Vec::new()));
    let requests_copy = requests.clone();

    let (view, vcx) = cx.add_window_view(|_, _| {
        ProfileView::new().on_request(move |req, _, _| {
            requests_copy.borrow_mut().push(req);
        })
    });

    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            view.begin_load(false, "00000000-0000-4000-8000-000000000001")
                .unwrap();
            view.apply_response_bytes(&load_fixture_bytes("profile-controls-ready"), window, cx)
                .unwrap();
            view.edit_field("displayName", "Grace Hopper", cx);
            view.edit_field("colorTheme", "dark", cx);
            view.submit(window, cx);
        });
    });

    vcx.run_until_parked();
    assert_eq!(requests.borrow().len(), 1);
    let sent_body = requests.borrow()[0].body.clone().unwrap();
    let save: SaveRequest = serde_json::from_slice(&sent_body).unwrap();
    assert_eq!(
        save.fields.get("displayName").map(String::as_str),
        Some("Grace Hopper")
    );
    assert_eq!(
        save.fields.get("colorTheme").map(String::as_str),
        Some("dark")
    );

    vcx.update(|window, cx| {
        view.update(cx, |view, cx| {
            let err = view.apply_response_bytes(br#"{"bad":true}"#, window, cx);
            assert!(err.is_err());
            assert!(view.decode_error().is_some());
        });
    });
    vcx.run_until_parked();

    struct HostMapPlugin;
    impl WidgetPlugin for HostMapPlugin {
        fn widget_type(&self) -> &str {
            "maps/HostMap"
        }
        fn render_card(
            &self,
            node: &ScreenNode,
            ctx: &WidgetContext<'_>,
            _window: &mut Window,
            _cx: &mut App,
        ) -> DashboardCard {
            DashboardCard::new(format!(
                "{} ({}x{})",
                node.id, ctx.tile_size.0, ctx.tile_size.1
            ))
            .body(div().size_full())
        }
    }

    struct DashView {
        screen: Screen,
        registry: WidgetRegistry,
        tiles: Vec<Tile>,
        vars: BTreeMap<String, Option<String>>,
    }

    impl Render for DashView {
        fn render(&mut self, window: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
            DashboardRenderer::render_grid(
                "test-grid",
                &self.screen,
                self.tiles.clone(),
                &self.registry,
                &self.vars,
                |_, _, _| {},
                window,
                cx,
            )
        }
    }

    let screen = Screen {
        version: "1".into(),
        id: "dash-test".into(),
        loader: Some("test".into()),
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "dashboard-grid".into(),
            node_type: "dashboard/DashboardGrid".into(),
            props: BTreeMap::from([("columns".into(), json!(12))]),
            bindings: BTreeMap::new(),
            children: vec![
                ScreenNode {
                    id: "widget-stats".into(),
                    node_type: "data/StatSummary".into(),
                    props: BTreeMap::from([(
                        "metrics".into(),
                        json!([{"label": "Active", "value": 42.0, "decimals": 0}]),
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
                ScreenNode {
                    id: "widget-map".into(),
                    node_type: "maps/HostMap".into(),
                    props: BTreeMap::new(),
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
            ],
            event: None,
            events: Vec::new(),
            use_template: None,
            params: BTreeMap::new(),
            param_bindings: BTreeMap::new(),
            slots: BTreeMap::new(),
            when: None,
            repeat: None,
        },
    };
    let mut registry = WidgetRegistry::with_defaults();
    registry.register(HostMapPlugin);
    let tiles = vec![
        Tile::new("stats", (0, 0), (4, 2)),
        Tile::new("map", (4, 0), (8, 4)),
    ];
    let _dash_win = cx.add_window(|_, _| DashView {
        screen,
        registry,
        tiles,
        vars: BTreeMap::new(),
    });
    cx.run_until_parked();
}

#[test]
fn catalogue_registry_covers_all_1361_contracts_and_2166_fixtures() {
    let registry = CatalogueRegistry::global();
    assert_eq!(registry.primaries, 624);
    assert_eq!(registry.qualified_names, 1313);
    assert_eq!(registry.chapters, 44);
    assert_eq!(registry.basic_templates, 48);
    assert_eq!(registry.len(), 1361);

    let fixtures = load_catalogue_fixtures();
    assert_eq!(fixtures.len(), 2177);
    let mut covered = BTreeSet::new();
    for (idx, f) in fixtures.iter().enumerate() {
        let screen = Screen {
            version: "1".into(),
            id: format!("cat-{idx}"),
            loader: None,
            templates: BTreeMap::new(),
            root: make_node("root", &f.name, f.props.clone()),
        };
        registry
            .validate_screen(&screen)
            .unwrap_or_else(|e| panic!("fixture {idx} ({}) failed: {e}", f.name));
        covered.insert(f.name.clone());
    }
    let expected: BTreeSet<String> = registry.names().map(ToOwned::to_owned).collect();
    assert_eq!(covered, expected);
}

#[test]
fn catalogue_rejects_unknown_component_and_invalid_props() {
    let registry = CatalogueRegistry::global();
    let unknown = Screen {
        version: "1".into(),
        id: "bad-comp".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: make_node("root", "nonexistent/Widget", BTreeMap::new()),
    };
    assert!(registry.validate_screen(&unknown).is_err());

    let bad_prop = Screen {
        version: "1".into(),
        id: "bad-prop".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: make_node(
            "root",
            "basic/alert",
            BTreeMap::from([
                ("title".into(), json!("Hi")),
                ("unknownKey".into(), json!(1)),
            ]),
        ),
    };
    assert!(registry.validate_screen(&bad_prop).is_err());
}

#[gpui::test]
fn gpui_readonly_input_allows_selection_and_copy_without_editing(cx: &mut TestAppContext) {
    cx.update(init_for_tests);
    let (view, vcx) = cx.add_window_view(|_, _| ProfileView::new());

    vcx.update(|window, cx| {
        let mut ready = load_fixture("profile-ready");
        ready.region.children[0].children[2].children[0]
            .props
            .readonly = Some(true);
        view.update(cx, |view, cx| {
            view.begin_load(false, ready.request_id.clone()).unwrap();
            view.apply_envelope(ready, window, cx).unwrap();
            view.edit_field("displayName", "Blocked Edit", cx);
            assert_eq!(
                view.state().drafts().get("displayName").map(String::as_str),
                Some("Ada")
            );
            assert_eq!(view.state().edit_revisions().get("displayName"), Some(&0));
        });
    });
    vcx.run_until_parked();

    let box_bounds = vcx
        .debug_bounds("display-name-readonly-box")
        .expect("readonly box rendered");
    let select_point = gpui::point(box_bounds.origin.x + gpui::px(20.), box_bounds.center().y);
    vcx.simulate_click(select_point, Modifiers::none());
    vcx.simulate_keystrokes("secondary-a secondary-c");
    vcx.run_until_parked();
    let copied = vcx.read_from_clipboard().and_then(|item| item.text());
    assert_eq!(copied.as_deref(), Some("Ada"));
}

#[gpui::test]
fn gpui_renders_all_2166_catalogue_fixtures_and_handles_interactive_events(
    cx: &mut TestAppContext,
) {
    cx.update(init_for_tests);
    let fixtures = load_catalogue_fixtures();
    let (view, vcx) = cx.add_window_view(|_, _| CatalogueView::new());

    for (batch_idx, chunk) in fixtures.chunks(80).enumerate() {
        let children: Vec<ScreenNode> = chunk
            .iter()
            .enumerate()
            .map(|(i, f)| make_node(&format!("item-{batch_idx}-{i}"), &f.name, f.props.clone()))
            .collect();
        let screen = Screen {
            version: "1".into(),
            id: format!("batch-{batch_idx}"),
            loader: None,
            templates: BTreeMap::new(),
            root: ScreenNode {
                id: "stack-root".into(),
                node_type: "basic/stack".into(),
                props: BTreeMap::from([("horizontal".into(), json!(false))]),
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
        };
        vcx.update(|window, cx| {
            view.update(cx, |v, cx| {
                v.load_screen(screen, window, cx)
                    .unwrap_or_else(|e| panic!("batch {batch_idx} failed: {e}"));
            });
        });
        vcx.run_until_parked();
    }

    let interactive_screen = Screen {
        version: "1".into(),
        id: "interactive-check".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "root-stack".into(),
            node_type: "basic/stack".into(),
            props: BTreeMap::from([("horizontal".into(), json!(false))]),
            bindings: BTreeMap::new(),
            children: vec![
                make_node(
                    "name-input",
                    "forms/Input",
                    BTreeMap::from([
                        ("name".into(), json!("username")),
                        ("label".into(), json!("Username")),
                        ("value".into(), json!("Ada")),
                    ]),
                ),
                make_node(
                    "ro-input",
                    "basic/input",
                    BTreeMap::from([
                        ("name".into(), json!("token")),
                        ("ariaLabel".into(), json!("Token")),
                        ("value".into(), json!("tok-123")),
                        ("readonly".into(), json!(true)),
                    ]),
                ),
                make_node(
                    "agree-check",
                    "forms/Checkbox",
                    BTreeMap::from([
                        ("name".into(), json!("agreed")),
                        ("label".into(), json!("Agree")),
                        ("checked".into(), json!(false)),
                    ]),
                ),
                make_node(
                    "notify-switch",
                    "forms/Switch",
                    BTreeMap::from([
                        ("name".into(), json!("notify")),
                        ("label".into(), json!("Notify")),
                        ("checked".into(), json!(false)),
                    ]),
                ),
                make_node(
                    "nav-tabs",
                    "navigation/Tabs",
                    BTreeMap::from([(
                        "items".into(),
                        json!([
                            {"label": "One", "value": "one"},
                            {"label": "Two", "value": "two"}
                        ]),
                    )]),
                ),
                make_node(
                    "save-btn",
                    "basic/button",
                    BTreeMap::from([
                        ("label".into(), json!("Save")),
                        ("value".into(), json!("save")),
                    ]),
                ),
            ],
            event: None,
            events: Vec::new(),
            use_template: None,
            params: BTreeMap::new(),
            param_bindings: BTreeMap::new(),
            slots: BTreeMap::new(),
            when: None,
            repeat: None,
        },
    };

    vcx.update(|window, cx| {
        view.update(cx, |v, cx| {
            v.load_screen(interactive_screen, window, cx).unwrap();
            v.set_text("username", "Grace", cx);
            v.set_text("token", "mutated", cx);
        });
    });
    vcx.run_until_parked();

    let cb_bounds = vcx
        .debug_bounds("cat-cb-agree-check")
        .expect("checkbox bounds");
    vcx.simulate_click(cb_bounds.center(), Modifiers::none());
    vcx.run_until_parked();

    let sw_bounds = vcx
        .debug_bounds("cat-sw-notify-switch")
        .expect("switch bounds");
    vcx.simulate_click(sw_bounds.center(), Modifiers::none());
    vcx.run_until_parked();

    let btn_bounds = vcx.debug_bounds("cat-btn-save-btn").expect("button bounds");
    vcx.simulate_click(btn_bounds.center(), Modifiers::none());
    vcx.run_until_parked();

    vcx.update(|_, cx| {
        view.update(cx, |v, cx| {
            v.trigger_event("nav-tabs", "navigation/Tabs", "change", json!("two"), cx);
            v.submit("root-stack", cx);
        });
    });
    vcx.run_until_parked();

    vcx.read_entity(&view, |v, _| {
        assert_eq!(v.value("username"), Some(&json!("Grace")));
        assert_eq!(v.value("token"), Some(&json!("tok-123")));
        assert_eq!(v.value("agreed"), Some(&json!(true)));
        assert_eq!(v.value("notify"), Some(&json!(true)));
        assert_eq!(v.value("nav-tabs"), Some(&json!("two")));
        assert!(
            v.events()
                .iter()
                .any(|e| e.event == "click" && e.node_id == "save-btn")
        );
        let submit = v
            .events()
            .iter()
            .find(|e| e.event == "submit" && e.node_id == "root-stack")
            .expect("submit event");
        assert_eq!(submit.value["username"], json!("Grace"));
        assert_eq!(submit.value["agreed"], json!(true));
        assert_eq!(submit.value["notify"], json!(true));
    });
}

#[gpui::test]
fn gpui_mobile_touch_widgets_roundtrip(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |t| {
            t.touch_mode = true;
            t.reduced_motion = true;
        });
    });

    let (view, vcx) = cx.add_window_view(|_, _| CatalogueView::new());
    vcx.update(|window, _| {
        window.resize(gpui::size(gpui::px(390.), gpui::px(844.)));
    });
    vcx.run_until_parked();

    let touch_screen = Screen {
        version: "1".into(),
        id: "mobile-touch-controls".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "mobile-stack".into(),
            node_type: "basic/stack".into(),
            props: BTreeMap::from([("horizontal".into(), json!(false))]),
            bindings: BTreeMap::new(),
            children: vec![
                make_node(
                    "guests",
                    "forms/Stepper",
                    BTreeMap::from([
                        ("name".into(), json!("guests")),
                        ("title".into(), json!("Guests")),
                        ("min".into(), json!("1")),
                        ("max".into(), json!(10)),
                        ("value".into(), json!("2")),
                    ]),
                ),
                make_node(
                    "score",
                    "forms/Rating",
                    BTreeMap::from([
                        ("name".into(), json!("score")),
                        ("label".into(), json!("Score")),
                        ("max".into(), json!(5)),
                        ("value".into(), json!("2")),
                    ]),
                ),
                make_node(
                    "period",
                    "buttons/SegmentedControl",
                    BTreeMap::from([
                        ("name".into(), json!("period")),
                        ("label".into(), json!("Period")),
                        ("value".into(), json!("day")),
                        (
                            "items".into(),
                            json!([
                                {"label": "Day", "value": "day"},
                                {"label": "Week", "value": "week"},
                                {"label": "Month", "value": "month"}
                            ]),
                        ),
                    ]),
                ),
                make_node(
                    "pager",
                    "navigation/Pagination",
                    BTreeMap::from([
                        ("label".into(), json!("Pages")),
                        ("page".into(), json!("2")),
                        ("total".into(), json!("5")),
                    ]),
                ),
                make_node(
                    "detail-sheet",
                    "overlays/Sheet",
                    BTreeMap::from([
                        ("label".into(), json!("Open Sheet")),
                        ("title".into(), json!("Details")),
                        ("content".into(), json!("Mobile sheet body")),
                    ]),
                ),
            ],
            event: None,
            events: Vec::new(),
            use_template: None,
            params: BTreeMap::new(),
            param_bindings: BTreeMap::new(),
            slots: BTreeMap::new(),
            when: None,
            repeat: None,
        },
    };

    vcx.update(|window, cx| {
        view.update(cx, |v, cx| v.load_screen(touch_screen, window, cx).unwrap());
    });
    vcx.run_until_parked();

    // Click '+' on Stepper (right side of stepper box)
    let step_bounds = vcx.debug_bounds("cat-step-guests").expect("stepper bounds");
    let plus_pt = gpui::point(step_bounds.right() - gpui::px(12.), step_bounds.center().y);
    vcx.simulate_click(plus_pt, Modifiers::none());
    vcx.run_until_parked();

    // Click 4th star on Rating (roughly 70% across the stars row)
    let rate_bounds = vcx.debug_bounds("cat-rate-score").expect("rating bounds");
    let star_pt = gpui::point(
        rate_bounds.origin.x + rate_bounds.size.width * 0.7,
        rate_bounds.center().y,
    );
    vcx.simulate_click(star_pt, Modifiers::none());
    vcx.run_until_parked();

    // Click 'Month' on SegmentedControl (right third)
    let seg_bounds = vcx.debug_bounds("cat-seg-period").expect("segment bounds");
    let seg_pt = gpui::point(
        seg_bounds.origin.x + seg_bounds.size.width * 0.82,
        seg_bounds.center().y,
    );
    vcx.simulate_click(seg_pt, Modifiers::none());
    vcx.run_until_parked();

    // Click next page on Pagination (right side)
    let page_bounds = vcx
        .debug_bounds("cat-page-pager")
        .expect("pagination bounds");
    let next_pt = gpui::point(page_bounds.right() - gpui::px(12.), page_bounds.center().y);
    vcx.simulate_click(next_pt, Modifiers::none());
    vcx.run_until_parked();

    // Open mobile bottom Sheet
    let sheet_btn = vcx
        .debug_bounds("cat-sheet-open-detail-sheet")
        .expect("sheet trigger bounds");
    vcx.simulate_click(sheet_btn.center(), Modifiers::none());
    vcx.run_until_parked();

    vcx.read_entity(&view, |v, _| {
        assert_eq!(v.value("guests"), Some(&json!(3.0)));
        let score = v.value("score").and_then(Value::as_u64).unwrap_or(0);
        assert!(score >= 3, "expected rating >= 3 after click, got {score}");
        assert_ne!(v.value("period"), Some(&json!("day")));
        assert_eq!(v.value("pager"), Some(&json!(3)));
        assert_eq!(v.value("detail-sheet"), Some(&json!(true)));
        assert!(v.events().len() >= 5);
    });

    // Load responsive MasterDetail, Charts, Gauge, UsageBar, Tree, Kanban, Map at 390px mobile width
    let widgets_screen = Screen {
        version: "1".into(),
        id: "mobile-core-widgets".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "widgets-stack".into(),
            node_type: "basic/stack".into(),
            props: BTreeMap::from([("horizontal".into(), json!(false))]),
            bindings: BTreeMap::new(),
            children: vec![
                make_node(
                    "md",
                    "layout/MasterDetail",
                    BTreeMap::from([
                        ("items".into(), json!(["Alpha", "Beta"])),
                        ("text".into(), json!("Alpha")),
                    ]),
                ),
                make_node(
                    "gauge",
                    "data/Gauge",
                    BTreeMap::from([
                        ("label".into(), json!("CPU")),
                        ("min".into(), json!(0)),
                        ("max".into(), json!(100)),
                        ("value".into(), json!(45)),
                    ]),
                ),
                make_node(
                    "usage",
                    "data/UsageBar",
                    BTreeMap::from([(
                        "usageParts".into(),
                        json!([{"label": "Used", "value": 40}, {"label": "Free", "value": 60}]),
                    )]),
                ),
                make_node(
                    "line",
                    "charts/LineChart",
                    BTreeMap::from([("points".into(), json!("0,10 10,30 20,25 30,50"))]),
                ),
                make_node(
                    "tree",
                    "lists/Tree",
                    BTreeMap::from([(
                        "items".into(),
                        json!([{"label": "Root", "value": "r", "children": [{"label": "Leaf", "value": "l"}]}]),
                    )]),
                ),
                make_node(
                    "board",
                    "project/KanbanBoard",
                    BTreeMap::from([(
                        "lanes".into(),
                        json!([{"title": "Todo", "cards": [{"title": "Task", "value": "t1"}]}]),
                    )]),
                ),
                make_node(
                    "map",
                    "basic/map-view",
                    BTreeMap::from([
                        ("name".into(), json!("site")),
                        ("label".into(), json!("Site")),
                        (
                            "center".into(),
                            json!({"latitude": 37.5665, "longitude": 126.978}),
                        ),
                        (
                            "points".into(),
                            json!([{"label": "Seoul", "value": "seoul", "latitude": 37.5665, "longitude": 126.978}]),
                        ),
                    ]),
                ),
            ],
            event: None,
            events: Vec::new(),
            use_template: None,
            params: BTreeMap::new(),
            param_bindings: BTreeMap::new(),
            slots: BTreeMap::new(),
            when: None,
            repeat: None,
        },
    };

    vcx.update(|window, cx| {
        view.update(cx, |v, cx| {
            v.load_screen(widgets_screen, window, cx).unwrap()
        });
    });
    vcx.run_until_parked();
}

#[gpui::test]
fn gpui_mobile_dialogs_and_account_roles_roundtrip(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |t| {
            t.touch_mode = true;
            t.reduced_motion = true;
        });
    });

    let (view, vcx) = cx.add_window_view(|_, _| CatalogueView::new());
    vcx.update(|window, _| {
        window.resize(gpui::size(gpui::px(390.), gpui::px(844.)));
    });
    vcx.run_until_parked();

    let screen = Screen {
        version: "1".into(),
        id: "dialogs-and-account".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "root".into(),
            node_type: "basic/stack".into(),
            props: BTreeMap::from([("horizontal".into(), json!(false))]),
            bindings: BTreeMap::new(),
            children: vec![
                make_node(
                    "invites",
                    "account/InvitationList",
                    BTreeMap::from([
                        (
                            "fields".into(),
                            json!([
                                {"name": "email", "type": "email"},
                                {
                                    "name": "role",
                                    "type": "select",
                                    "options": [
                                        {"label": "Member", "value": "member"},
                                        {"label": "Admin", "value": "admin"},
                                        {"label": "Guest", "value": "guest"}
                                    ]
                                }
                            ]),
                        ),
                        (
                            "items".into(),
                            json!([
                                {"value": "kat", "email": "katherine@nasa.gov", "text": "Member", "time": "Sent 2 days ago"},
                                {"value": "edsger", "email": "edsger@tue.nl", "text": "Guest", "time": "Sent 9 days ago", "expired": true}
                            ]),
                        ),
                    ]),
                ),
                make_node(
                    "share-dlg",
                    "collab/ShareDialog",
                    BTreeMap::from([("documentTitle".into(), json!("Lift"))]),
                ),
                make_node(
                    "tool-dlg",
                    "agent/ToolApprovalDialog",
                    BTreeMap::from([("tool".into(), json!("deploy"))]),
                ),
                make_node(
                    "call-dlg",
                    "messaging/IncomingCallDialog",
                    BTreeMap::from([("caller".into(), json!("Ada"))]),
                ),
            ],
            event: None,
            events: Vec::new(),
            use_template: None,
            params: BTreeMap::new(),
            param_bindings: BTreeMap::new(),
            slots: BTreeMap::new(),
            when: None,
            repeat: None,
        },
    };

    vcx.update(|window, cx| {
        view.update(cx, |v, cx| v.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();

    // Dialogs stay closed on initial load; tapping trigger opens ShareDialog.
    assert!(vcx.debug_bounds("cat-dlg-open-share-dlg").is_some());
    assert!(vcx.debug_bounds("cat-dlg-open-tool-dlg").is_some());
    assert!(vcx.debug_bounds("cat-dlg-open-call-dlg").is_some());

    let share_btn = vcx.debug_bounds("cat-dlg-open-share-dlg").unwrap();
    vcx.simulate_click(share_btn.center(), Modifiers::none());
    vcx.run_until_parked();
    vcx.read_entity(&view, |v, _| {
        assert_eq!(v.value("share-dlg"), Some(&json!(true)));
    });

    // Pressing Escape closes the open ShareDialog and clears open state.
    vcx.simulate_keystrokes("escape");
    vcx.run_until_parked();
    vcx.read_entity(&view, |v, _| {
        assert_eq!(v.value("share-dlg"), Some(&json!(false)));
        assert!(v.events().iter().any(|e| e.node_id == "share-dlg"
            && e.event == "ely:action"
            && e.value == json!("close")));
    });
}

fn run_2166_fixture_click_audit(
    cx: &mut TestAppContext,
    width: f32,
    height: f32,
    touch_mode: bool,
) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |t| {
            t.touch_mode = touch_mode;
            t.reduced_motion = true;
        });
    });

    let fixtures = load_catalogue_fixtures();
    assert_eq!(fixtures.len(), 2177);
    let (view, vcx) = cx.add_window_view(|_, _| CatalogueView::new());
    vcx.update(|window, _| {
        window.resize(gpui::size(gpui::px(width), gpui::px(height)));
    });
    vcx.run_until_parked();

    let mut zero_bounds = Vec::new();
    let mut event_fired_names = std::collections::BTreeSet::new();
    let mut no_event_names = std::collections::BTreeMap::<String, usize>::new();
    let mut total_events = 0usize;

    for (idx, f) in fixtures.iter().enumerate() {
        let screen = Screen {
            version: "1".into(),
            id: format!("audit-fix-{idx}"),
            loader: None,
            templates: BTreeMap::new(),
            root: ScreenNode {
                id: "audit-root".into(),
                node_type: "basic/stack".into(),
                props: BTreeMap::from([("horizontal".into(), json!(false))]),
                bindings: BTreeMap::new(),
                children: vec![make_node("fix", &f.name, f.props.clone())],
                event: None,
                events: Vec::new(),
                use_template: None,
                params: BTreeMap::new(),
                param_bindings: BTreeMap::new(),
                slots: BTreeMap::new(),
                when: None,
                repeat: None,
            },
        };

        let before = vcx.update(|window, cx| {
            view.update(cx, |v, cx| {
                v.load_screen(screen, window, cx)
                    .unwrap_or_else(|e| panic!("fixture #{idx} ({}) failed: {e}", f.name));
                v.events().len()
            })
        });
        vcx.run_until_parked();

        let bounds = vcx
            .debug_bounds("cat-screen-root")
            .unwrap_or_else(|| panic!("fixture #{idx} ({}) missing root bounds", f.name));
        if bounds.size.width <= gpui::px(0.) || bounds.size.height <= gpui::px(0.) {
            zero_bounds.push((idx, f.name.clone()));
            continue;
        }

        let max_x = f32::from(bounds.right()).min(width - 4.0);
        let min_x = f32::from(bounds.left()).max(4.0);
        let max_y = f32::from(bounds.bottom()).min(height - 4.0);
        let min_y = f32::from(bounds.top()).max(4.0);
        if max_x > min_x && max_y > min_y {
            let xs = [
                (min_x + 14.0).min(max_x),
                (min_x + max_x) * 0.5,
                (max_x - 14.0).max(min_x),
            ];
            let ys = if max_y - min_y > 60.0 {
                vec![
                    (min_y + 20.0).min(max_y),
                    (min_y + max_y) * 0.5,
                    (max_y - 20.0).max(min_y),
                ]
            } else {
                vec![(min_y + max_y) * 0.5]
            };
            // gpui TestWindow::minimize/zoom are unimplemented!(), so skip blind grid clicks on WindowControls.
            let canonical = CatalogueRegistry::global()
                .get(&f.name)
                .and_then(|c| Some((c.chapter.as_deref()?, c.primary.as_deref()?)))
                .map(|(ch, pr)| format!("{ch}/{pr}"))
                .unwrap_or_else(|| f.name.clone());
            if !matches!(
                canonical.as_str(),
                "shell/WindowControls"
                    | "shell/WindowDragRegion"
                    | "shell/TabBar"
                    | "shell/TitleBar"
                    | "shell/ColumnShell"
            ) && !matches!(
                f.name.as_str(),
                "shell/WindowControls"
                    | "shell/WindowDragRegion"
                    | "shell/TabBar"
                    | "shell/TitleBar"
                    | "shell/ColumnShell"
                    | "shell/TrafficLights"
            ) {
                for &y in &ys {
                    for &x in &xs {
                        vcx.simulate_click(
                            gpui::point(gpui::px(x), gpui::px(y)),
                            Modifiers::none(),
                        );
                        vcx.run_until_parked();
                    }
                }
            }
            vcx.simulate_keystrokes("a");
            vcx.run_until_parked();
            vcx.simulate_keystrokes("9 enter");
            vcx.run_until_parked();
            vcx.simulate_keystrokes("escape");
            vcx.run_until_parked();
        }

        let fired = vcx.read_entity(&view, |v, _| {
            assert!(
                v.last_error().is_none(),
                "fixture #{idx} ({}) error after interaction: {:?}",
                f.name,
                v.last_error()
            );
            v.events().len().saturating_sub(before)
        });
        total_events += fired;
        if fired > 0 {
            event_fired_names.insert(f.name.clone());
        } else {
            *no_event_names.entry(f.name.clone()).or_default() += 1;
        }
    }

    eprintln!(
        "AUDIT_SUMMARY mode={} total={} zero_bounds={} fired_types={} no_event_types={} total_events={}",
        if touch_mode { "mobile" } else { "desktop" },
        fixtures.len(),
        zero_bounds.len(),
        event_fired_names.len(),
        no_event_names.len(),
        total_events
    );
    if !zero_bounds.is_empty() {
        eprintln!(
            "ZERO_BOUNDS: {:?}",
            &zero_bounds[..zero_bounds.len().min(20)]
        );
    }
    assert!(
        zero_bounds.is_empty(),
        "found fixtures with zero bounds: {:?}",
        zero_bounds
    );
}

#[gpui::test]
fn gpui_clicks_and_audits_all_2166_fixtures(cx: &mut TestAppContext) {
    run_2166_fixture_click_audit(cx, 390.0, 844.0, true);
}

#[gpui::test]
fn gpui_desktop_clicks_and_audits_all_2166_fixtures(cx: &mut TestAppContext) {
    run_2166_fixture_click_audit(cx, 1280.0, 800.0, false);
}

#[gpui::test]
fn gpui_newly_wired_controls_emit_events_and_update_state(cx: &mut TestAppContext) {
    cx.update(|cx| {
        init_for_tests(cx);
        Theme::update(cx, |t| {
            t.touch_mode = true;
            t.reduced_motion = true;
        });
    });

    let (view, vcx) = cx.add_window_view(|_, _| CatalogueView::new());
    vcx.update(|window, _| {
        window.resize(gpui::size(gpui::px(390.), gpui::px(844.)));
    });
    vcx.run_until_parked();

    let screen = Screen {
        version: "1".into(),
        id: "newly-wired".into(),
        loader: None,
        templates: BTreeMap::new(),
        root: ScreenNode {
            id: "root".into(),
            node_type: "basic/stack".into(),
            props: BTreeMap::from([("horizontal".into(), json!(false))]),
            bindings: BTreeMap::new(),
            children: vec![
                make_node(
                    "swatch",
                    "forms/ColorSwatch",
                    BTreeMap::from([
                        ("name".into(), json!("accent")),
                        ("value".into(), json!("#335cff")),
                        (
                            "options".into(),
                            json!([
                                {"label": "Blue", "value": "#335cff"},
                                {"label": "Green", "value": "#228855"}
                            ]),
                        ),
                    ]),
                ),
                make_node(
                    "unit",
                    "forms/UnitInput",
                    BTreeMap::from([
                        ("name".into(), json!("gap")),
                        ("value".into(), json!("16")),
                        ("units".into(), json!(["px", "%"])),
                        ("suffix".into(), json!("px")),
                    ]),
                ),
                make_node(
                    "nav-hist",
                    "navigation/BackForwardNavigation",
                    BTreeMap::from([(
                        "items".into(),
                        json!([
                            {"label": "Home", "value": "home"},
                            {"label": "Detail", "value": "detail", "selected": true}
                        ]),
                    )]),
                ),
                make_node(
                    "ed-tabs",
                    "navigation/EditorTabs",
                    BTreeMap::from([(
                        "items".into(),
                        json!([
                            {"label": "a.rs", "value": "a"},
                            {"label": "b.rs", "value": "b"}
                        ]),
                    )]),
                ),
                make_node(
                    "cal",
                    "basic/calendar",
                    BTreeMap::from([
                        ("name".into(), json!("day")),
                        ("value".into(), json!("2026-10-14")),
                    ]),
                ),
            ],
            event: None,
            events: Vec::new(),
            use_template: None,
            params: BTreeMap::new(),
            param_bindings: BTreeMap::new(),
            slots: BTreeMap::new(),
            when: None,
            repeat: None,
        },
    };

    vcx.update(|window, cx| {
        view.update(cx, |v, cx| v.load_screen(screen, window, cx).unwrap());
    });
    vcx.run_until_parked();

    // Click second ColorSwatch (#228855): swatch is 24x24 + 8px gap -> second center at (44, 12)
    vcx.simulate_click(gpui::point(gpui::px(44.), gpui::px(12.)), Modifiers::none());
    vcx.run_until_parked();

    vcx.read_entity(&view, |v, _| {
        assert_eq!(v.value("accent"), Some(&json!("#228855")));
        assert!(
            v.events()
                .iter()
                .any(|e| e.node_id == "accent" && e.event == "change"),
            "expected ColorSwatch event, got {:?}",
            v.events()
        );
    });
}
