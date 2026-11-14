mod dashboard {
    pub use elysdui_gpui::dashboard::ScreenError;
    pub use elysdui_gpui::dashboard::ScreenNode;
}

#[path = "../src/event_bindings.rs"]
mod event_bindings;

use std::collections::BTreeMap;

use dashboard::ScreenNode;
use event_bindings::resolve_event_bindings;
use serde_json::{Value, json};

fn node(event: Option<Value>, events: Vec<Value>) -> ScreenNode {
    ScreenNode {
        id: "widget".into(),
        node_type: "widget".into(),
        props: BTreeMap::new(),
        bindings: BTreeMap::new(),
        children: Vec::new(),
        event,
        events,
        use_template: None,
        params: BTreeMap::new(),
        param_bindings: BTreeMap::new(),
        slots: BTreeMap::new(),
        when: None,
        repeat: None,
    }
}

#[test]
fn routes_source_action_and_extracts_typed_json_pointer_values() {
    let node = node(
        None,
        vec![json!({
            "on":"ely:action", "sourceAction":"edit", "action":"edit-record", "target":"results",
            "payload": {
                "recordID":{"path":"/record/id","type":"integer"},
                "label":{"path":"/record/~0name","type":"string"},
                "tags":{"path":"/tags","type":"array"}
            }
        })],
    );
    let requests = resolve_event_bindings(
        &node,
        "ely:action",
        &json!({
            "action":"edit", "record":{"id":42,"~name":"Ada"}, "tags":["a"]
        }),
    )
    .unwrap();
    assert_eq!(requests.len(), 1);
    assert_eq!(requests[0].action, "edit-record");
    assert_eq!(requests[0].target, "results");
    assert_eq!(requests[0].payload["recordID"], json!(42));
    assert_eq!(requests[0].payload["label"], json!("Ada"));
    assert_eq!(requests[0].payload["tags"], json!(["a"]));
    assert!(
        resolve_event_bindings(&node, "ely:action", &json!({"action":"remove"}))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn malformed_or_missing_payload_fails_closed() {
    for (binding, detail) in [
        (
            json!({"on":"click","action":"save","target":"r","payload":{"id":{"path":"/id~2","type":"integer"}}}),
            json!({"id":1}),
        ),
        (
            json!({"on":"click","action":"save","target":"r","payload":{"_action":{"path":"/id","type":"integer"}}}),
            json!({"id":1}),
        ),
        (
            json!({"on":"click","action":"save","target":"r","payload":{"id":{"path":"/id","type":"integer"}}}),
            json!({"id":"1"}),
        ),
        (
            json!({"on":"click","action":"save","target":"r","payload":{"id":{"path":"/id","type":"integer"}}}),
            json!({}),
        ),
    ] {
        assert!(resolve_event_bindings(&node(Some(binding), vec![]), "click", &detail).is_err());
    }
}

#[test]
fn duplicate_overlap_and_conflicting_event_forms_fail() {
    let catch_all = json!({"on":"ely:action","action":"any","target":"r"});
    let specific = json!({"on":"ely:action","sourceAction":"edit","action":"edit","target":"r"});
    assert!(
        resolve_event_bindings(
            &node(None, vec![catch_all.clone(), specific]),
            "ely:action",
            &json!({})
        )
        .is_err()
    );
    assert!(
        resolve_event_bindings(
            &node(Some(catch_all.clone()), vec![catch_all]),
            "ely:action",
            &json!({})
        )
        .is_err()
    );
}

#[test]
fn filters_by_actual_event_type() {
    let node = node(
        None,
        vec![
            json!({"on":"click","action":"clicked","target":"result"}),
            json!({"on":"change","action":"changed","target":"result"}),
        ],
    );
    let request = resolve_event_bindings(&node, "change", &json!({})).unwrap();
    assert_eq!(request.len(), 1);
    assert_eq!(request[0].action, "changed");
    assert!(
        resolve_event_bindings(&node, "submit", &json!({}))
            .unwrap()
            .is_empty()
    );
}

#[test]
fn enforces_go_server_event_binding_limits_and_rules() {
    let bad_bindings = [
        json!({"on":"load","action":"run","target":"result"}),
        json!({"on":"click","action":"bad/action","target":"result"}),
        json!({"on":"click","action":"run","target":"sdui-internal-region"}),
        json!({"on":"click","sourceAction":"edit","action":"run","target":"result"}),
        json!({"on":"ely:action","sourceAction":"bad\nselector","action":"run","target":"result"}),
        json!({"on":"click","action":"run","target":"result","payload":{"a-b":{"path":"/a","type":"string"}}}),
    ];
    for binding in bad_bindings {
        assert!(resolve_event_bindings(&node(Some(binding), vec![]), "click", &json!({})).is_err());
    }

    let payload = (0..33)
        .map(|index| {
            (
                format!("field{index}"),
                json!({"path":"/v","type":"string"}),
            )
        })
        .collect::<serde_json::Map<_, _>>();
    let oversized = json!({"on":"click","action":"run","target":"result","payload":payload});
    assert!(resolve_event_bindings(&node(Some(oversized), vec![]), "click", &json!({})).is_err());
}
