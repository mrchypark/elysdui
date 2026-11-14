//! Resolve declared SDUI node events into host action requests.

use std::collections::BTreeMap;

use serde_json::Value;

use crate::dashboard::{ScreenError, ScreenNode};

const MAX_EVENTS: usize = 16;
const MAX_PAYLOAD_FIELDS: usize = 32;
const MAX_POINTER_BYTES: usize = 512;

#[derive(Clone, Debug, PartialEq)]
pub struct ActionRequest {
    pub action: String,
    pub target: String,
    pub payload: BTreeMap<String, Value>,
}

/// Validate a node's event declarations and resolve the declarations matching `detail`.
///
/// `detail` is the event's `event.detail` object. No action is executed here.
pub fn resolve_event_bindings(
    node: &ScreenNode,
    event_type: &str,
    detail: &Value,
) -> Result<Vec<ActionRequest>, ScreenError> {
    let declarations: Vec<&Value> = match (&node.event, node.events.as_slice()) {
        (Some(_), events) if !events.is_empty() => {
            return Err(ScreenError::new("Use either event or events, not both."));
        }
        (Some(event), _) => vec![event],
        (None, events) => events.iter().collect(),
    };
    if declarations.len() > MAX_EVENTS {
        return Err(ScreenError::new("A node may declare at most 16 events."));
    }

    let mut parsed = Vec::with_capacity(declarations.len());
    for declaration in declarations {
        parsed.push(parse_binding(declaration)?);
    }
    for (index, binding) in parsed.iter().enumerate() {
        if parsed[..index].iter().any(|prior| {
            prior.on == binding.on
                && (prior.source_action.is_none()
                    || binding.source_action.is_none()
                    || prior.source_action == binding.source_action)
        }) {
            return Err(ScreenError::new("Duplicate or overlapping event bindings."));
        }
    }

    parsed
        .iter()
        .filter(|binding| {
            binding.on == event_type
                && binding.source_action.as_ref().is_none_or(|action| {
                    detail.get("action").and_then(Value::as_str) == Some(action)
                })
        })
        .map(|binding| {
            Ok(ActionRequest {
                action: binding.action.clone(),
                target: binding.target.clone(),
                payload: resolve_payload(&binding.payload, detail)?,
            })
        })
        .collect()
}

struct Binding {
    on: String,
    action: String,
    target: String,
    source_action: Option<String>,
    payload: BTreeMap<String, PayloadField>,
}

struct PayloadField {
    path: String,
    value_type: String,
}

fn parse_binding(value: &Value) -> Result<Binding, ScreenError> {
    let object = value
        .as_object()
        .ok_or_else(|| ScreenError::new("Event binding must be an object."))?;
    const ALLOWED: &[&str] = &["on", "action", "target", "sourceAction", "payload"];
    if object.keys().any(|key| !ALLOWED.contains(&key.as_str())) {
        return Err(ScreenError::new("Event binding contains an unknown field."));
    }
    let string = |key: &str| -> Result<String, ScreenError> {
        object
            .get(key)
            .and_then(Value::as_str)
            .filter(|s| !s.is_empty())
            .map(str::to_owned)
            .ok_or_else(|| ScreenError::new(format!("Event binding requires a non-empty '{key}'.")))
    };
    let on = string("on")?;
    if !matches!(
        on.as_str(),
        "click" | "change" | "submit" | "ely:action" | "ely:change"
    ) {
        return Err(ScreenError::new("Unsupported event type."));
    }
    let action = string("action")?;
    let target = string("target")?;
    if !valid_registry_key(&action) || !valid_node_id(&target) {
        return Err(ScreenError::new("Invalid event action or target."));
    }
    let source_action = match object.get("sourceAction") {
        Some(Value::String(value)) => Some(value.clone()),
        Some(_) => return Err(ScreenError::new("sourceAction must be a string.")),
        None => None,
    };
    let source_action = source_action.filter(|value| !value.is_empty());
    if source_action.as_ref().is_some_and(|value| {
        on != "ely:action"
            || value.len() > 128
            || value.bytes().any(|byte| matches!(byte, 0 | b'\r' | b'\n'))
    }) {
        return Err(ScreenError::new("Invalid sourceAction."));
    }

    let mut payload = BTreeMap::new();
    if let Some(value) = object.get("payload") {
        let fields = value
            .as_object()
            .ok_or_else(|| ScreenError::new("Event payload must be an object."))?;
        if fields.len() > MAX_PAYLOAD_FIELDS {
            return Err(ScreenError::new("Event payload has too many fields."));
        }
        for (name, value) in fields {
            if !valid_property_name(name) || name.starts_with('_') {
                return Err(ScreenError::new(
                    "Event payload field names must not be empty or reserved.",
                ));
            }
            let spec = value
                .as_object()
                .ok_or_else(|| ScreenError::new("Event payload field must be an object."))?;
            if spec.len() != 2 || spec.keys().any(|key| key != "path" && key != "type") {
                return Err(ScreenError::new(
                    "Event payload fields require only path and type.",
                ));
            }
            let path = spec
                .get("path")
                .and_then(Value::as_str)
                .ok_or_else(|| ScreenError::new("Event payload path must be a JSON Pointer."))?;
            validate_pointer(path)?;
            let value_type = spec
                .get("type")
                .and_then(Value::as_str)
                .ok_or_else(|| ScreenError::new("Event payload type is required."))?;
            if !matches!(
                value_type,
                "string" | "boolean" | "integer" | "number" | "object" | "array"
            ) {
                return Err(ScreenError::new("Unsupported event payload type."));
            }
            payload.insert(
                name.clone(),
                PayloadField {
                    path: path.into(),
                    value_type: value_type.into(),
                },
            );
        }
    }
    Ok(Binding {
        on,
        action,
        target,
        source_action,
        payload,
    })
}

fn validate_pointer(pointer: &str) -> Result<(), ScreenError> {
    if pointer.is_empty() || pointer.len() > MAX_POINTER_BYTES || !pointer.starts_with('/') {
        return Err(ScreenError::new(
            "Event payload path must be a JSON Pointer.",
        ));
    }
    for token in pointer[1..].split('/') {
        let bytes = token.as_bytes();
        let mut index = 0;
        while index < bytes.len() {
            if bytes[index] == b'~' {
                if !matches!(bytes.get(index + 1), Some(b'0' | b'1')) {
                    return Err(ScreenError::new(
                        "Event payload path has an invalid JSON Pointer escape.",
                    ));
                }
                index += 2;
            } else {
                index += 1;
            }
        }
    }
    Ok(())
}

fn valid_registry_key(value: &str) -> bool {
    let bytes = value.as_bytes();
    (1..=128).contains(&bytes.len())
        && bytes[0].is_ascii_alphabetic()
        && bytes[1..]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'.' | b'-'))
}

fn valid_node_id(value: &str) -> bool {
    let bytes = value.as_bytes();
    (1..=128).contains(&bytes.len())
        && bytes[0].is_ascii_alphabetic()
        && bytes[1..]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || matches!(byte, b'_' | b'-'))
        && !value.starts_with("sdui-internal-")
}

fn valid_property_name(value: &str) -> bool {
    let bytes = value.as_bytes();
    (1..=64).contains(&bytes.len())
        && bytes[0].is_ascii_alphabetic()
        && bytes[1..]
            .iter()
            .all(|byte| byte.is_ascii_alphanumeric() || *byte == b'_')
}

fn resolve_payload(
    fields: &BTreeMap<String, PayloadField>,
    detail: &Value,
) -> Result<BTreeMap<String, Value>, ScreenError> {
    fields
        .iter()
        .map(|(name, field)| {
            let value = detail.pointer(&field.path).ok_or_else(|| {
                ScreenError::new(format!("Event payload is missing '{}'.", field.path))
            })?;
            let valid = match field.value_type.as_str() {
                "string" => value.is_string(),
                "boolean" => value.is_boolean(),
                "integer" => value.as_i64().is_some() || value.as_u64().is_some(),
                "number" => value.is_number(),
                "object" => value.is_object(),
                "array" => value.is_array(),
                _ => false,
            };
            if !valid {
                return Err(ScreenError::new(format!(
                    "Event payload '{}' is not type '{}'.",
                    field.path, field.value_type
                )));
            }
            Ok((name.clone(), value.clone()))
        })
        .collect()
}
