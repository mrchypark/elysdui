//! Native profile-v1 protocol decoder, state reconciliation, and GPUI renderer.

use std::{
    collections::{BTreeMap, BTreeSet},
    fmt,
    rc::Rc,
};

use ely_gpui_component::{
    buttons::{Button, ButtonVariant},
    feedback::Alert,
    forms::{Checkbox, Choice, Form, FormField, Input, InputEvent, Select, Switch, TextInput},
    primitives::Severity,
    theme::{ActiveTheme, ControlSize},
    typography::{Caption, Heading, Paragraph},
};
use gpui::{
    AnyElement, App, Context, Entity, IntoElement, ParentElement, Render, SharedString, Styled,
    Subscription, Window, div, prelude::*, px,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

pub const PROTOCOL_VERSION: &str = "1";
pub const CAPABILITIES: [&str; 10] = [
    "region", "form", "stack", "text", "input", "button", "notice", "switch", "checkbox", "select",
];
pub const MAX_RESPONSE_BYTES: usize = 1_048_576;
pub const MAX_NODES: usize = 1_000;
pub const MAX_DEPTH: usize = 32;
pub const MAX_STRING_BYTES: usize = 16_384;
pub const MAX_SAFE_INT: i64 = 9_007_199_254_740_991;
pub const MAX_FIELDS: usize = 64;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProtocolFailure {
    pub message: String,
}

impl ProtocolFailure {
    pub fn new(message: impl Into<String>) -> Self {
        Self {
            message: message.into(),
        }
    }
}

impl fmt::Display for ProtocolFailure {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.write_str(&self.message)
    }
}

impl std::error::Error for ProtocolFailure {}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct SelectOption {
    pub value: String,
    pub label: String,
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NodeProps {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub options: Option<Vec<SelectOption>>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub checked: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub label: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub text: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub title: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub urgent: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub value: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub placeholder: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none", rename = "type")]
    pub input_type: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub required: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub disabled: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub readonly: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub multiple: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub direction: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub align: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub gap: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub variant: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub size: Option<String>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NodeEvent {
    pub on: String,
    pub action: String,
    pub target: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct NativeNode {
    pub id: String,
    #[serde(rename = "type")]
    pub node_type: String,
    pub props: NodeProps,
    #[serde(default)]
    pub children: Vec<NativeNode>,
    #[serde(default)]
    pub events: Vec<NodeEvent>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ResponseStatus {
    Ready,
    Saved,
    Invalid,
    Conflict,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProfileEnvelope {
    pub protocol_version: String,
    #[serde(rename = "screenID")]
    pub screen_id: String,
    pub screen_revision: String,
    #[serde(rename = "sessionID")]
    pub session_id: String,
    #[serde(rename = "requestID")]
    pub request_id: String,
    pub data_version: i64,
    pub status: ResponseStatus,
    pub csrf_token: String,
    pub required_capabilities: Vec<String>,
    pub region: NativeNode,
    pub fields: BTreeMap<String, String>,
    pub acknowledged_edits: BTreeMap<String, i64>,
    pub errors: BTreeMap<String, String>,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveRequest {
    pub protocol_version: String,
    #[serde(rename = "screenID")]
    pub screen_id: String,
    pub screen_revision: String,
    #[serde(rename = "sessionID")]
    pub session_id: String,
    #[serde(rename = "requestID")]
    pub request_id: String,
    pub data_version: i64,
    #[serde(rename = "nodeID")]
    pub node_id: String,
    pub event: String,
    pub action: String,
    pub target: String,
    pub fields: BTreeMap<String, String>,
    pub edit_revisions: BTreeMap<String, i64>,
    pub capabilities: Vec<String>,
}

impl SaveRequest {
    pub fn from_envelope(
        envelope: &ProfileEnvelope,
        request_id: String,
        fields: BTreeMap<String, String>,
        edit_revisions: BTreeMap<String, i64>,
    ) -> Self {
        Self {
            protocol_version: PROTOCOL_VERSION.into(),
            screen_id: envelope.screen_id.clone(),
            screen_revision: envelope.screen_revision.clone(),
            session_id: envelope.session_id.clone(),
            request_id,
            data_version: envelope.data_version,
            node_id: "profile-form".into(),
            event: "submit".into(),
            action: "save-profile".into(),
            target: "profile-region".into(),
            fields,
            edit_revisions,
            capabilities: CAPABILITIES.iter().map(|s| (*s).into()).collect(),
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum PendingKind {
    Load,
    Save(SaveRequest),
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct PendingRequest {
    pub kind: PendingKind,
    pub request_id: String,
    pub csrf_token: Option<String>,
    pub body: Option<Vec<u8>>,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum RequestPhase {
    Idle,
    Sending,
    Retryable,
    Blocked,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Acceptance {
    Applied,
    Ignored,
}

pub fn is_valid_node_id(id: &str) -> bool {
    let bytes = id.as_bytes();
    (1..=128).contains(&bytes.len())
        && bytes[0].is_ascii_alphabetic()
        && bytes[1..]
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'_' || *b == b'-')
}

pub fn is_valid_field_name(name: &str) -> bool {
    let bytes = name.as_bytes();
    (1..=64).contains(&bytes.len())
        && bytes[0].is_ascii_alphabetic()
        && bytes[1..]
            .iter()
            .all(|b| b.is_ascii_alphanumeric() || *b == b'_')
}

/// Reject duplicate object keys (including escaped forms) and excessive JSON nesting
/// before serde parses values.
pub fn reject_ambiguous_json(bytes: &[u8]) -> Result<(), ProtocolFailure> {
    struct Frame {
        is_object: bool,
        keys: BTreeSet<String>,
    }

    let mut frames: Vec<Frame> = Vec::new();
    let mut i = 0;
    while i < bytes.len() {
        match bytes[i] {
            b'{' | b'[' => {
                if frames.len() >= 100 {
                    return Err(ProtocolFailure::new("JSON nesting limit exceeded."));
                }
                frames.push(Frame {
                    is_object: bytes[i] == b'{',
                    keys: BTreeSet::new(),
                });
            }
            b'}' | b']' => {
                if frames.pop().is_none() {
                    return Err(ProtocolFailure::new("Malformed JSON response."));
                }
            }
            b'"' => {
                let start = i;
                i += 1;
                let mut closed = false;
                while i < bytes.len() {
                    if bytes[i] == b'\\' {
                        i += 2;
                        continue;
                    }
                    if bytes[i] == b'"' {
                        closed = true;
                        break;
                    }
                    i += 1;
                }
                if !closed {
                    return Err(ProtocolFailure::new("Malformed JSON string."));
                }
                let mut next = i + 1;
                while next < bytes.len() && matches!(bytes[next], b' ' | b'\t' | b'\n' | b'\r') {
                    next += 1;
                }
                if next < bytes.len() && bytes[next] == b':' {
                    let Some(frame) = frames.last_mut().filter(|f| f.is_object) else {
                        return Err(ProtocolFailure::new("Malformed JSON object key."));
                    };
                    let key: String = serde_json::from_slice(&bytes[start..=i])
                        .map_err(|e| ProtocolFailure::new(format!("Invalid JSON key: {e}")))?;
                    if !frame.keys.insert(key.clone()) {
                        return Err(ProtocolFailure::new(format!(
                            "Duplicate JSON object key: {key}."
                        )));
                    }
                }
            }
            _ => {}
        }
        i += 1;
    }
    if !frames.is_empty() {
        return Err(ProtocolFailure::new("Unterminated JSON structure."));
    }
    Ok(())
}

fn preflight_value_tree(root: &Value) -> Result<(), ProtocolFailure> {
    let mut stack = vec![(root, 1usize)];
    let mut count = 0usize;
    while let Some((node, depth)) = stack.pop() {
        count += 1;
        if count > MAX_NODES || depth > MAX_DEPTH {
            return Err(ProtocolFailure::new(
                "The screen exceeds the supported size or depth.",
            ));
        }
        let Some(obj) = node.as_object() else {
            return Err(ProtocolFailure::new("Malformed node object."));
        };
        if let Some(node_type) = obj.get("type").and_then(Value::as_str)
            && matches!(node_type, "checkbox" | "select")
        {
            let allowed: &[&str] = if node_type == "checkbox" {
                &["name", "label", "checked", "disabled", "value"]
            } else {
                &["name", "label", "value", "disabled", "options"]
            };
            let Some(props) = obj.get("props").and_then(Value::as_object) else {
                return Err(ProtocolFailure::new(
                    "Unsupported selection control properties.",
                ));
            };
            if props
                .iter()
                .any(|(k, v)| !allowed.contains(&k.as_str()) || v.is_null())
            {
                return Err(ProtocolFailure::new(
                    "Unsupported selection control properties.",
                ));
            }
        }
        if let Some(raw_children) = obj.get("children") {
            let Some(children) = raw_children.as_array() else {
                return Err(ProtocolFailure::new(
                    "The screen contains malformed children.",
                ));
            };
            for child in children {
                stack.push((child, depth + 1));
            }
        }
    }
    Ok(())
}

pub fn decode_envelope(bytes: &[u8]) -> Result<ProfileEnvelope, ProtocolFailure> {
    if bytes.len() > MAX_RESPONSE_BYTES {
        return Err(ProtocolFailure::new(
            "The response exceeds the 1 MiB limit.",
        ));
    }
    reject_ambiguous_json(bytes)?;
    let value: Value = serde_json::from_slice(bytes)
        .map_err(|e| ProtocolFailure::new(format!("Invalid JSON response: {e}")))?;
    let Some(region) = value.get("region").filter(|v| v.is_object()) else {
        return Err(ProtocolFailure::new(
            "The response does not contain a replacement region.",
        ));
    };
    preflight_value_tree(region)?;
    let envelope: ProfileEnvelope = serde_json::from_value(value)
        .map_err(|e| ProtocolFailure::new(format!("Invalid profile envelope: {e}")))?;
    validate_envelope(&envelope)?;
    Ok(envelope)
}

pub fn validate_envelope(envelope: &ProfileEnvelope) -> Result<(), ProtocolFailure> {
    if envelope.protocol_version != PROTOCOL_VERSION {
        return Err(ProtocolFailure::new(
            "This screen requires an unsupported protocol version.",
        ));
    }
    let supported: BTreeSet<&str> = CAPABILITIES.iter().copied().collect();
    let mut seen_caps = BTreeSet::new();
    if envelope.required_capabilities.len() > MAX_FIELDS {
        return Err(ProtocolFailure::new(
            "This screen declares too many required capabilities.",
        ));
    }
    for cap in &envelope.required_capabilities {
        if !supported.contains(cap.as_str()) {
            return Err(ProtocolFailure::new(
                "This screen requires an unsupported native component.",
            ));
        }
        if !seen_caps.insert(cap.as_str()) {
            return Err(ProtocolFailure::new(
                "Duplicate capability in requiredCapabilities.",
            ));
        }
    }
    if envelope.screen_id != "profile"
        || envelope.screen_revision.is_empty()
        || envelope.screen_revision.len() > 256
        || envelope.session_id.is_empty()
        || envelope.session_id.len() > 256
        || envelope.request_id.is_empty()
        || envelope.request_id.len() > 256
        || envelope.csrf_token.is_empty()
        || envelope.csrf_token.len() > 256
        || !(0..=MAX_SAFE_INT).contains(&envelope.data_version)
        || envelope.fields.is_empty()
        || envelope.fields.len() > MAX_FIELDS
        || envelope.errors.len() > MAX_FIELDS
        || envelope
            .fields
            .iter()
            .any(|(k, v)| !is_valid_field_name(k) || v.len() > MAX_STRING_BYTES)
        || envelope
            .errors
            .iter()
            .any(|(k, v)| !envelope.fields.contains_key(k) || v.len() > MAX_STRING_BYTES)
        || envelope
            .acknowledged_edits
            .iter()
            .any(|(k, v)| !envelope.fields.contains_key(k) || !(0..=MAX_SAFE_INT).contains(v))
        || envelope.region.id != "profile-region"
        || envelope.region.node_type != "region"
    {
        return Err(ProtocolFailure::new(
            "The server returned an invalid profile envelope.",
        ));
    }
    match envelope.status {
        ResponseStatus::Ready => {
            if !envelope.acknowledged_edits.is_empty() {
                return Err(ProtocolFailure::new(
                    "A ready envelope must have empty acknowledgedEdits.",
                ));
            }
        }
        ResponseStatus::Saved | ResponseStatus::Invalid | ResponseStatus::Conflict => {
            if envelope.acknowledged_edits.len() != envelope.fields.len()
                || !envelope
                    .fields
                    .keys()
                    .all(|k| envelope.acknowledged_edits.contains_key(k))
            {
                return Err(ProtocolFailure::new(
                    "Non-ready replies must acknowledge every declared field.",
                ));
            }
        }
    }

    let mut ids = BTreeSet::new();
    let mut inputs = BTreeSet::new();
    let mut count = 0usize;
    let mut forms = 0usize;
    let mut submit_buttons = 0usize;

    fn visit(
        node: &NativeNode,
        depth: usize,
        form: Option<&str>,
        envelope: &ProfileEnvelope,
        ids: &mut BTreeSet<String>,
        inputs: &mut BTreeSet<String>,
        count: &mut usize,
        forms: &mut usize,
        submit_buttons: &mut usize,
    ) -> Result<(), ProtocolFailure> {
        *count += 1;
        if depth > MAX_DEPTH
            || *count > MAX_NODES
            || !is_valid_node_id(&node.id)
            || node.id.starts_with("sdui-internal-")
            || !ids.insert(node.id.clone())
        {
            return Err(ProtocolFailure::new(
                "The screen contains duplicate or invalid stable IDs, or exceeds its limits.",
            ));
        }
        if !CAPABILITIES.contains(&node.node_type.as_str()) {
            return Err(ProtocolFailure::new(format!(
                "Unsupported native component: {}.",
                node.node_type
            )));
        }
        let structural = matches!(node.node_type.as_str(), "region" | "form" | "stack");
        if !structural && !node.children.is_empty() {
            return Err(ProtocolFailure::new(
                "A native leaf component cannot contain children.",
            ));
        }
        if node.node_type != "form" && !node.events.is_empty() {
            return Err(ProtocolFailure::new(
                "The screen requests an unsupported native event.",
            ));
        }

        let mut child_form = form;
        match node.node_type.as_str() {
            "region" => {
                if depth != 1 {
                    return Err(ProtocolFailure::new(
                        "Nested replacement regions are unsupported.",
                    ));
                }
            }
            "form" => {
                *forms += 1;
                if form.is_some()
                    || node.id != "profile-form"
                    || node.events.len() != 1
                    || node.events[0].on != "submit"
                    || node.events[0].action != "save-profile"
                    || node.events[0].target != "profile-region"
                {
                    return Err(ProtocolFailure::new(
                        "The screen requests an unregistered form action.",
                    ));
                }
                child_form = Some(node.id.as_str());
            }
            "stack" => {
                let dir = node.props.direction.as_deref().unwrap_or("column");
                let align = node.props.align.as_deref().unwrap_or("stretch");
                let gap = node.props.gap.as_deref().unwrap_or("md");
                if !matches!(dir, "column" | "row")
                    || !matches!(align, "start" | "center" | "end" | "stretch")
                    || !matches!(gap, "none" | "xs" | "sm" | "md" | "lg")
                {
                    return Err(ProtocolFailure::new(
                        "The screen requests unsupported stack properties.",
                    ));
                }
            }
            "input" | "switch" | "checkbox" | "select" => {
                let Some(name) = node.props.name.as_deref() else {
                    return Err(ProtocolFailure::new(
                        "The form contains an unsupported or duplicate field.",
                    ));
                };
                if form != Some("profile-form")
                    || !envelope.fields.contains_key(name)
                    || node.props.label.is_none()
                    || node.props.input_type.as_deref().unwrap_or("text") != "text"
                    || node.props.multiple == Some(true)
                    || !inputs.insert(name.to_owned())
                {
                    return Err(ProtocolFailure::new(
                        "The form contains an unsupported or duplicate field.",
                    ));
                }
                let field_val = &envelope.fields[name];
                if matches!(node.node_type.as_str(), "switch" | "checkbox")
                    && (node.props.readonly == Some(true)
                        || node.props.required == Some(true)
                        || !matches!(field_val.as_str(), "true" | "false"))
                {
                    return Err(ProtocolFailure::new(
                        "A boolean field must contain true or false.",
                    ));
                }
                if matches!(node.node_type.as_str(), "checkbox" | "select") {
                    let label = node.props.label.as_deref().unwrap_or("");
                    if node.props.required.is_some()
                        || node.props.readonly.is_some()
                        || node.props.multiple.is_some()
                        || node.props.placeholder.is_some()
                        || node.props.input_type.is_some()
                        || node.props.text.is_some()
                        || node.props.title.is_some()
                        || node.props.urgent.is_some()
                        || node.props.direction.is_some()
                        || node.props.align.is_some()
                        || node.props.gap.is_some()
                        || node.props.variant.is_some()
                        || node.props.size.is_some()
                        || label.is_empty()
                        || label.len() > MAX_STRING_BYTES
                        || node
                            .props
                            .value
                            .as_ref()
                            .is_some_and(|v| v.len() > MAX_STRING_BYTES)
                    {
                        return Err(ProtocolFailure::new(
                            "Unsupported selection control properties.",
                        ));
                    }
                    if node.node_type == "checkbox" {
                        if node.props.options.is_some() {
                            return Err(ProtocolFailure::new(
                                "Checkbox options are unsupported.",
                            ));
                        }
                    } else {
                        let Some(options) = node.props.options.as_ref() else {
                            return Err(ProtocolFailure::new(
                                "A select requires unique bounded options and a matching field value.",
                            ));
                        };
                        if node.props.checked.is_some()
                            || options.is_empty()
                            || options.len() > MAX_FIELDS
                        {
                            return Err(ProtocolFailure::new(
                                "A select requires unique bounded options and a matching field value.",
                            ));
                        }
                        let mut opt_values = BTreeSet::new();
                        for opt in options {
                            if opt.value.is_empty()
                                || opt.label.is_empty()
                                || opt.value.len() > MAX_STRING_BYTES
                                || opt.label.len() > MAX_STRING_BYTES
                                || !opt_values.insert(opt.value.as_str())
                            {
                                return Err(ProtocolFailure::new(
                                    "A select requires unique bounded options and a matching field value.",
                                ));
                            }
                        }
                        if !opt_values.contains(field_val.as_str()) {
                            return Err(ProtocolFailure::new(
                                "A select requires unique bounded options and a matching field value.",
                            ));
                        }
                    }
                }
            }
            "button" => {
                *submit_buttons += 1;
                let variant = node.props.variant.as_deref().unwrap_or("default");
                let size = node.props.size.as_deref().unwrap_or("default");
                if form != Some("profile-form")
                    || node.props.label.is_none()
                    || node.props.input_type.as_deref() != Some("submit")
                    || !matches!(
                        variant,
                        "default" | "primary" | "secondary" | "outline" | "ghost" | "destructive"
                    )
                    || !matches!(size, "default" | "xs" | "sm" | "lg")
                {
                    return Err(ProtocolFailure::new(
                        "Only the registered form submit button is supported.",
                    ));
                }
            }
            "text" | "notice" => {
                if node.props.text.is_none() {
                    return Err(ProtocolFailure::new(
                        "A text component is missing its text.",
                    ));
                }
            }
            _ => {}
        }

        for child in &node.children {
            visit(
                child,
                depth + 1,
                child_form,
                envelope,
                ids,
                inputs,
                count,
                forms,
                submit_buttons,
            )?;
        }
        Ok(())
    }

    visit(
        &envelope.region,
        1,
        None,
        envelope,
        &mut ids,
        &mut inputs,
        &mut count,
        &mut forms,
        &mut submit_buttons,
    )?;

    let declared_keys: BTreeSet<String> = envelope.fields.keys().cloned().collect();
    if forms != 1 || submit_buttons == 0 || inputs != declared_keys {
        return Err(ProtocolFailure::new(
            "The screen must contain its registered form and exactly one control per field.",
        ));
    }
    Ok(())
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct ProfileState {
    envelope: Option<ProfileEnvelope>,
    baseline: BTreeMap<String, String>,
    drafts: BTreeMap<String, String>,
    edit_revisions: BTreeMap<String, i64>,
    field_errors: BTreeMap<String, String>,
    pending: Option<PendingRequest>,
    phase: RequestPhase,
    failure_message: Option<String>,
    status_message: String,
}

impl Default for ProfileState {
    fn default() -> Self {
        Self::new()
    }
}

impl ProfileState {
    pub fn new() -> Self {
        Self {
            envelope: None,
            baseline: BTreeMap::new(),
            drafts: BTreeMap::new(),
            edit_revisions: BTreeMap::new(),
            field_errors: BTreeMap::new(),
            pending: None,
            phase: RequestPhase::Idle,
            failure_message: None,
            status_message: String::new(),
        }
    }

    pub fn envelope(&self) -> Option<&ProfileEnvelope> {
        self.envelope.as_ref()
    }

    pub fn baseline(&self) -> &BTreeMap<String, String> {
        &self.baseline
    }

    pub fn drafts(&self) -> &BTreeMap<String, String> {
        &self.drafts
    }

    pub fn edit_revisions(&self) -> &BTreeMap<String, i64> {
        &self.edit_revisions
    }

    pub fn field_errors(&self) -> &BTreeMap<String, String> {
        &self.field_errors
    }

    pub fn pending(&self) -> Option<&PendingRequest> {
        self.pending.as_ref()
    }

    pub fn phase(&self) -> RequestPhase {
        self.phase
    }

    pub fn failure_message(&self) -> Option<&str> {
        self.failure_message.as_deref()
    }

    pub fn status_message(&self) -> &str {
        &self.status_message
    }

    pub fn is_sending(&self) -> bool {
        self.phase == RequestPhase::Sending
    }

    pub fn is_loading(&self) -> bool {
        matches!(
            self.pending,
            Some(PendingRequest {
                kind: PendingKind::Load,
                ..
            })
        )
    }

    pub fn can_save(&self) -> bool {
        self.envelope.is_some() && self.pending.is_none() && self.phase == RequestPhase::Idle
    }

    pub fn has_unsaved_changes(&self) -> bool {
        self.drafts != self.baseline
    }

    pub fn begin_load(
        &mut self,
        discarding_drafts: bool,
        request_id: impl Into<String>,
    ) -> Result<PendingRequest, ProtocolFailure> {
        if !discarding_drafts && (self.envelope.is_some() || self.pending.is_some()) {
            return Err(ProtocolFailure::new(
                "Reloading discards local edits. Confirm reload first.",
            ));
        }
        let request = PendingRequest {
            kind: PendingKind::Load,
            request_id: request_id.into(),
            csrf_token: None,
            body: None,
        };
        self.pending = Some(request.clone());
        self.phase = RequestPhase::Sending;
        self.failure_message = None;
        Ok(request)
    }

    pub fn edit(&mut self, field: &str, value: impl Into<String>) {
        let value = value.into();
        if self.envelope.is_none() || self.is_loading() {
            return;
        }
        let Some(current) = self.drafts.get(field) else {
            return;
        };
        if current == &value {
            return;
        }
        let revision = *self.edit_revisions.get(field).unwrap_or(&0);
        if revision >= MAX_SAFE_INT {
            self.failure_message =
                Some("The local edit limit was reached. Reload before editing again.".into());
            return;
        }
        self.drafts.insert(field.to_owned(), value);
        self.edit_revisions.insert(field.to_owned(), revision + 1);
        self.field_errors.remove(field);
        if self
            .envelope
            .as_ref()
            .is_some_and(|e| e.status == ResponseStatus::Invalid)
        {
            self.status_message.clear();
        }
    }

    pub fn begin_save(
        &mut self,
        request_id: impl Into<String>,
    ) -> Result<PendingRequest, ProtocolFailure> {
        let Some(envelope) = self.envelope.as_ref() else {
            return Err(ProtocolFailure::new(
                "Resolve the current request before saving again.",
            ));
        };
        if !self.can_save() {
            return Err(ProtocolFailure::new(
                "Resolve the current request before saving again.",
            ));
        }
        let request_id = request_id.into();
        let save = SaveRequest::from_envelope(
            envelope,
            request_id.clone(),
            self.drafts.clone(),
            self.edit_revisions.clone(),
        );
        let body = serde_json::to_vec(&save)
            .map_err(|e| ProtocolFailure::new(format!("Encode save request: {e}")))?;
        let request = PendingRequest {
            kind: PendingKind::Save(save),
            request_id,
            csrf_token: Some(envelope.csrf_token.clone()),
            body: Some(body),
        };
        self.pending = Some(request.clone());
        self.phase = RequestPhase::Sending;
        self.failure_message = None;
        Ok(request)
    }

    pub fn retry(&mut self) -> Result<PendingRequest, ProtocolFailure> {
        let Some(pending) = self.pending.clone() else {
            return Err(ProtocolFailure::new("No retryable request is available."));
        };
        if self.phase != RequestPhase::Retryable {
            return Err(ProtocolFailure::new("No retryable request is available."));
        }
        self.phase = RequestPhase::Sending;
        self.failure_message = None;
        Ok(pending)
    }

    pub fn fail(&mut self, request_id: &str, message: impl Into<String>, retryable: bool) {
        if self
            .pending
            .as_ref()
            .is_some_and(|p| p.request_id == request_id)
        {
            self.phase = if retryable {
                RequestPhase::Retryable
            } else {
                RequestPhase::Blocked
            };
            self.failure_message = Some(message.into());
        }
    }

    pub fn receive(&mut self, response: ProfileEnvelope) -> Result<Acceptance, ProtocolFailure> {
        let Some(pending) = self.pending.clone() else {
            return Ok(Acceptance::Ignored);
        };
        if response.request_id != pending.request_id {
            return Ok(Acceptance::Ignored);
        }
        if let PendingKind::Save(submitted) = &pending.kind
            && (response.screen_id != submitted.screen_id
                || response.session_id != submitted.session_id)
        {
            return Ok(Acceptance::Ignored);
        }
        if let Some(current) = &self.envelope
            && response.session_id == current.session_id
            && response.data_version < current.data_version
        {
            return Ok(Acceptance::Ignored);
        }
        validate_envelope(&response)?;

        if let PendingKind::Save(submitted) = &pending.kind {
            if response.fields.len() != submitted.fields.len()
                || !submitted
                    .fields
                    .keys()
                    .all(|k| response.fields.contains_key(k))
            {
                return Err(ProtocolFailure::new(
                    "The field set changed during a save. Reload the screen before continuing.",
                ));
            }
            if let Some(current) = &self.envelope {
                let old = collect_controls(&current.region);
                let new = collect_controls(&response.region);
                let compatible = old.iter().all(|(name, prev)| {
                    new.get(name).is_some_and(|next| {
                        prev.id == next.id
                            && prev.node_type == next.node_type
                            && prev.props.options == next.props.options
                            && prev.props.disabled == next.props.disabled
                            && prev.props.readonly == next.props.readonly
                            && prev.props.required == next.props.required
                            && prev.props.multiple == next.props.multiple
                            && prev.props.input_type == next.props.input_type
                    })
                });
                if !compatible {
                    return Err(ProtocolFailure::new(
                        "The control modes or options changed during a save. Reload the screen before continuing.",
                    ));
                }
            }
        }

        match &pending.kind {
            PendingKind::Load => {
                if response.status != ResponseStatus::Ready
                    || !response.acknowledged_edits.is_empty()
                {
                    return Err(ProtocolFailure::new(
                        "The load response has an invalid status or acknowledgment.",
                    ));
                }
                self.baseline = response.fields.clone();
                self.drafts = response.fields.clone();
                self.edit_revisions = response.fields.keys().map(|k| (k.clone(), 0)).collect();
                self.field_errors.clear();
            }
            PendingKind::Save(submitted) => {
                if response.status == ResponseStatus::Ready
                    || response.acknowledged_edits != submitted.edit_revisions
                {
                    return Err(ProtocolFailure::new(
                        "The server did not acknowledge the submitted edit revisions.",
                    ));
                }
                if response.status == ResponseStatus::Saved {
                    if response.data_version <= submitted.data_version {
                        return Err(ProtocolFailure::new(
                            "The saved response did not advance the data version.",
                        ));
                    }
                    for (name, value) in &response.fields {
                        if self.edit_revisions.get(name) == response.acknowledged_edits.get(name) {
                            self.drafts.insert(name.clone(), value.clone());
                        }
                    }
                }
                self.baseline = response.fields.clone();
                self.field_errors = response
                    .errors
                    .iter()
                    .filter(|(k, _)| {
                        self.edit_revisions.get(*k) == response.acknowledged_edits.get(*k)
                    })
                    .map(|(k, v)| (k.clone(), v.clone()))
                    .collect();
            }
        }

        self.status_message =
            if response.status == ResponseStatus::Invalid && self.field_errors.is_empty() {
                String::new()
            } else {
                response.message.clone()
            };
        self.envelope = Some(response);
        self.pending = None;
        self.phase = RequestPhase::Idle;
        self.failure_message = None;
        Ok(Acceptance::Applied)
    }
}

fn collect_controls<'a>(node: &'a NativeNode) -> BTreeMap<&'a str, &'a NativeNode> {
    let mut result = BTreeMap::new();
    fn walk<'a>(node: &'a NativeNode, out: &mut BTreeMap<&'a str, &'a NativeNode>) {
        if matches!(
            node.node_type.as_str(),
            "input" | "switch" | "checkbox" | "select"
        ) && let Some(name) = node.props.name.as_deref()
        {
            out.entry(name).or_insert(node);
        }
        for child in &node.children {
            walk(child, out);
        }
    }
    walk(node, &mut result);
    result
}

type RequestCallback = Rc<dyn Fn(PendingRequest, &mut Window, &mut App)>;

/// GPUI entity rendering profile-v1 trees with Ely components.
pub struct ProfileView {
    state: ProfileState,
    inputs: BTreeMap<String, Entity<TextInput>>,
    _input_subs: Vec<Subscription>,
    next_request_seq: u64,
    decode_error: Option<String>,
    on_request: Option<RequestCallback>,
}

impl ProfileView {
    pub fn new() -> Self {
        Self {
            state: ProfileState::new(),
            inputs: BTreeMap::new(),
            _input_subs: Vec::new(),
            next_request_seq: 1,
            decode_error: None,
            on_request: None,
        }
    }

    pub fn state(&self) -> &ProfileState {
        &self.state
    }

    pub fn decode_error(&self) -> Option<&str> {
        self.decode_error.as_deref()
    }

    pub fn on_request(
        mut self,
        handler: impl Fn(PendingRequest, &mut Window, &mut App) + 'static,
    ) -> Self {
        self.on_request = Some(Rc::new(handler));
        self
    }

    pub fn begin_load(
        &mut self,
        discarding_drafts: bool,
        request_id: impl Into<String>,
    ) -> Result<PendingRequest, ProtocolFailure> {
        self.decode_error = None;
        self.state.begin_load(discarding_drafts, request_id)
    }

    pub fn apply_response_bytes(
        &mut self,
        bytes: &[u8],
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Result<Acceptance, ProtocolFailure> {
        let envelope = match decode_envelope(bytes) {
            Ok(env) => env,
            Err(err) => {
                self.decode_error = Some(err.message.clone());
                cx.notify();
                return Err(err);
            }
        };
        self.apply_envelope(envelope, window, cx)
    }

    pub fn apply_envelope(
        &mut self,
        envelope: ProfileEnvelope,
        window: &mut Window,
        cx: &mut Context<Self>,
    ) -> Result<Acceptance, ProtocolFailure> {
        match self.state.receive(envelope) {
            Ok(acceptance) => {
                if acceptance == Acceptance::Applied {
                    self.decode_error = None;
                    self.sync_inputs(window, cx);
                }
                cx.notify();
                Ok(acceptance)
            }
            Err(err) => {
                self.decode_error = Some(err.message.clone());
                cx.notify();
                Err(err)
            }
        }
    }

    pub fn edit_field(&mut self, field: &str, value: impl Into<String>, cx: &mut Context<Self>) {
        let value = value.into();
        self.state.edit(field, value.clone());
        if let Some(input) = self.inputs.get(field).cloned() {
            input.update(cx, |ti, cx| {
                if ti.text() != value {
                    ti.set_text(value, cx);
                }
            });
        }
        cx.notify();
    }

    pub fn submit(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let req_id = format!("gpui-save-{}", self.next_request_seq);
        self.next_request_seq += 1;
        match self.state.begin_save(req_id) {
            Ok(pending) => {
                if let Some(cb) = &self.on_request {
                    cb(pending, window, cx);
                }
            }
            Err(err) => {
                self.decode_error = Some(err.message);
            }
        }
        cx.notify();
    }

    fn retry_or_reload(&mut self, reload: bool, window: &mut Window, cx: &mut Context<Self>) {
        let result = if reload {
            let req_id = format!("gpui-load-{}", self.next_request_seq);
            self.next_request_seq += 1;
            self.state.begin_load(true, req_id)
        } else {
            self.state.retry()
        };
        match result {
            Ok(pending) => {
                self.decode_error = None;
                if let Some(cb) = &self.on_request {
                    cb(pending, window, cx);
                }
            }
            Err(err) => {
                self.decode_error = Some(err.message);
            }
        }
        cx.notify();
    }

    fn sync_inputs(&mut self, window: &mut Window, cx: &mut Context<Self>) {
        let Some(envelope) = self.state.envelope() else {
            return;
        };
        let controls = collect_controls(&envelope.region);
        let input_names: BTreeSet<String> = controls
            .iter()
            .filter(|(_, node)| node.node_type == "input")
            .map(|(name, _)| (*name).to_owned())
            .collect();
        self.inputs.retain(|name, _| input_names.contains(name));

        let mut subs = Vec::new();
        for (name, node) in controls {
            if node.node_type != "input" {
                continue;
            }
            let draft = self
                .state
                .drafts()
                .get(name)
                .cloned()
                .unwrap_or_default();
            let label = node.props.label.clone().unwrap_or_default();
            let placeholder = node.props.placeholder.clone().unwrap_or_default();
            let disabled = node.props.disabled == Some(true) || self.state.is_loading();

            let entity = if let Some(existing) = self.inputs.get(name) {
                existing.clone()
            } else {
                cx.new(|cx| {
                    let mut ti = TextInput::new(window, cx)
                        .label(label.clone())
                        .placeholder(placeholder.clone());
                    ti.set_text(draft.clone(), cx);
                    ti
                })
            };

            entity.update(cx, |ti, cx| {
                ti.set_label(label, cx);
                ti.set_placeholder(placeholder, cx);
                ti.set_disabled(disabled, cx);
                if ti.text() != draft {
                    ti.set_text(draft, cx);
                }
            });

            let field_name = name.to_owned();
            let sub = cx.subscribe_in(
                &entity,
                window,
                move |this, input, event: &InputEvent, window, cx| match event {
                    InputEvent::Changed => {
                        let text = input.read(cx).text().to_owned();
                        this.state.edit(&field_name, text);
                        cx.notify();
                    }
                    InputEvent::Submit => {
                        this.submit(window, cx);
                    }
                    InputEvent::Focus | InputEvent::Blur => {}
                },
            );
            subs.push(sub);
            self.inputs.insert(name.to_owned(), entity);
        }
        self._input_subs = subs;
    }

    fn render_node(&self, node: &NativeNode, cx: &Context<Self>) -> AnyElement {
        let colors = &cx.theme().colors;
        let view = cx.entity().downgrade();
        match node.node_type.as_str() {
            "region" => div()
                .id(SharedString::from(node.id.clone()))
                .w_full()
                .flex()
                .flex_col()
                .gap(px(16.))
                .children(node.children.iter().map(|child| self.render_node(child, cx)))
                .into_any_element(),
            "stack" => {
                let mut container = div().id(SharedString::from(node.id.clone())).flex();
                container = match node.props.direction.as_deref().unwrap_or("column") {
                    "row" => container.flex_row(),
                    _ => container.flex_col(),
                };
                container = match node.props.align.as_deref().unwrap_or("stretch") {
                    "start" => container.items_start(),
                    "center" => container.items_center(),
                    "end" => container.items_end(),
                    _ => container.items_stretch(),
                };
                let gap = match node.props.gap.as_deref().unwrap_or("md") {
                    "none" => px(0.),
                    "xs" => px(4.),
                    "sm" => px(8.),
                    "lg" => px(24.),
                    _ => px(16.),
                };
                container
                    .gap(gap)
                    .children(node.children.iter().map(|child| self.render_node(child, cx)))
                    .into_any_element()
            }
            "text" => {
                let text = node.props.text.clone().unwrap_or_default();
                if node.id.ends_with("-title") {
                    Heading::h2(text).into_any_element()
                } else {
                    Paragraph::new(text).into_any_element()
                }
            }
            "notice" => {
                let title = node
                    .props
                    .title
                    .clone()
                    .filter(|t| !t.is_empty())
                    .unwrap_or_else(|| "Notice".into());
                let body = node.props.text.clone().unwrap_or_default();
                let severity = if node.props.urgent == Some(true) {
                    Severity::Warning
                } else {
                    Severity::Info
                };
                Alert::new(SharedString::from(node.id.clone()), severity, title)
                    .body(body)
                    .into_any_element()
            }
            "form" => {
                let mut form = Form::new(SharedString::from(node.id.clone())).on_submit(
                    move |window, cx| {
                        let _ = view.update(cx, |this, cx| this.submit(window, cx));
                    },
                );
                for child in &node.children {
                    form = form.child(self.render_node(child, cx));
                }
                form.into_any_element()
            }
            "input" => {
                let name = node.props.name.as_deref().unwrap_or_default();
                let label = node.props.label.clone().unwrap_or_default();
                let err = self.state.field_errors().get(name).cloned();
                let has_error = err.is_some();
                let mut field = FormField::new(SharedString::from(node.id.clone()), label);
                if node.props.required == Some(true) {
                    field = field.required();
                }
                if let Some(error) = err {
                    field = field.error(error);
                }
                if let Some(input_entity) = self.inputs.get(name) {
                    field = field.child(Input::new(input_entity).invalid(has_error));
                } else {
                    field = field.child(Caption::new("Input unavailable"));
                }
                field.into_any_element()
            }
            "switch" => {
                let name = node.props.name.clone().unwrap_or_default();
                let label = node.props.label.clone().unwrap_or_default();
                let checked = self
                    .state
                    .drafts()
                    .get(&name)
                    .is_some_and(|v| v == "true");
                let disabled = node.props.disabled == Some(true) || self.state.is_loading();
                let err = self.state.field_errors().get(&name).cloned();
                let mut field =
                    FormField::new(SharedString::from(format!("{}-field", node.id)), label.clone());
                if let Some(error) = err {
                    field = field.error(error);
                }
                let field_name = name.clone();
                let sw = Switch::new(SharedString::from(node.id.clone()), checked)
                    .label(label)
                    .name(name)
                    .disabled(disabled)
                    .on_change(move |next, _, cx| {
                        let _ = view.update(cx, |this, cx| {
                            this.state
                                .edit(&field_name, if next { "true" } else { "false" });
                            cx.notify();
                        });
                    });
                field.child(sw).into_any_element()
            }
            "checkbox" => {
                let name = node.props.name.clone().unwrap_or_default();
                let label = node.props.label.clone().unwrap_or_default();
                let checked = self
                    .state
                    .drafts()
                    .get(&name)
                    .is_some_and(|v| v == "true");
                let disabled = node.props.disabled == Some(true) || self.state.is_loading();
                let err = self.state.field_errors().get(&name).cloned();
                let mut field =
                    FormField::new(SharedString::from(format!("{}-field", node.id)), label.clone());
                if let Some(error) = err {
                    field = field.error(error);
                }
                let field_name = name.clone();
                let cb = Checkbox::new(SharedString::from(node.id.clone()), checked)
                    .label(label)
                    .disabled(disabled)
                    .on_change(move |next, _, cx| {
                        let _ = view.update(cx, |this, cx| {
                            this.state
                                .edit(&field_name, if next { "true" } else { "false" });
                            cx.notify();
                        });
                    });
                field.child(cb).into_any_element()
            }
            "select" => {
                let name = node.props.name.clone().unwrap_or_default();
                let label = node.props.label.clone().unwrap_or_default();
                let selected = self.state.drafts().get(&name).cloned().unwrap_or_default();
                let disabled = node.props.disabled == Some(true) || self.state.is_loading();
                let err = self.state.field_errors().get(&name).cloned();
                let choices: Vec<Choice> = node
                    .props
                    .options
                    .as_ref()
                    .into_iter()
                    .flatten()
                    .map(|opt| Choice::new(opt.value.clone(), opt.label.clone()))
                    .collect();
                let mut field =
                    FormField::new(SharedString::from(format!("{}-field", node.id)), label.clone());
                if let Some(error) = err {
                    field = field.error(error);
                }
                let field_name = name.clone();
                let select = Select::new(SharedString::from(node.id.clone()), choices)
                    .label(label)
                    .selected(selected)
                    .disabled(disabled)
                    .on_change(move |value: &SharedString, _, cx| {
                        let val = value.to_string();
                        let _ = view.update(cx, |this, cx| {
                            this.state.edit(&field_name, val);
                            cx.notify();
                        });
                    });
                field.child(select).into_any_element()
            }
            "button" => {
                let label = node.props.label.clone().unwrap_or_else(|| "Submit".into());
                let variant = match node.props.variant.as_deref().unwrap_or("default") {
                    "primary" => ButtonVariant::Primary,
                    "outline" => ButtonVariant::Outline,
                    "ghost" => ButtonVariant::Ghost,
                    "destructive" => ButtonVariant::Danger,
                    _ => ButtonVariant::Secondary,
                };
                let size = match node.props.size.as_deref().unwrap_or("default") {
                    "xs" | "sm" => ControlSize::Sm,
                    "lg" => ControlSize::Lg,
                    _ => ControlSize::Md,
                };
                let disabled = node.props.disabled == Some(true) || !self.state.can_save();
                Button::new(SharedString::from(node.id.clone()), label)
                    .variant(variant)
                    .size(size)
                    .disabled(disabled)
                    .loading(self.state.is_sending())
                    .on_click(cx.listener(|this, _, window, cx| {
                        this.submit(window, cx);
                    }))
                    .into_any_element()
            }
            other => div()
                .p_3()
                .rounded(px(6.))
                .border_1()
                .border_color(colors.danger)
                .child(
                    Alert::new(
                        SharedString::from(format!("{}-unsupported", node.id)),
                        Severity::Danger,
                        "Unsupported native component",
                    )
                    .body(format!("Component type '{other}' is not supported.")),
                )
                .into_any_element(),
        }
    }
}

impl Default for ProfileView {
    fn default() -> Self {
        Self::new()
    }
}

impl Render for ProfileView {
    fn render(&mut self, _: &mut Window, cx: &mut Context<Self>) -> impl IntoElement {
        let mut root = div().w_full().flex().flex_col().gap_3();

        if let Some(err) = &self.decode_error {
            let mut alert = Alert::new("profile-decode-error", Severity::Danger, "Unsupported screen")
                .body(err.clone());
            if self.on_request.is_some() {
                alert = alert.action(
                    Button::new("profile-error-reload", "Reload (discard edits)")
                        .size(ControlSize::Sm)
                        .variant(ButtonVariant::Outline)
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.retry_or_reload(true, window, cx);
                        })),
                );
            }
            root = root.child(alert);
        }

        if let Some(failure) = self.state.failure_message() {
            let mut alert = Alert::new("profile-request-error", Severity::Danger, "Request failed")
                .body(failure.to_owned());
            if self.state.phase() == RequestPhase::Retryable {
                alert = alert.action(
                    Button::new("profile-retry", "Retry")
                        .size(ControlSize::Sm)
                        .variant(ButtonVariant::Primary)
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.retry_or_reload(false, window, cx);
                        })),
                );
            } else if self.state.phase() == RequestPhase::Blocked {
                alert = alert.action(
                    Button::new("profile-reload", "Reload (discard edits)")
                        .size(ControlSize::Sm)
                        .variant(ButtonVariant::Outline)
                        .on_click(cx.listener(|this, _, window, cx| {
                            this.retry_or_reload(true, window, cx);
                        })),
                );
            }
            root = root.child(alert);
        } else if !self.state.status_message().is_empty() {
            let severity = match self.state.envelope().map(|e| e.status) {
                Some(ResponseStatus::Saved) => Severity::Success,
                Some(ResponseStatus::Invalid | ResponseStatus::Conflict) => Severity::Warning,
                _ => Severity::Info,
            };
            root = root.child(Alert::new(
                "profile-status",
                severity,
                self.state.status_message().to_owned(),
            ));
        }

        if let Some(envelope) = self.state.envelope() {
            root = root.child(self.render_node(&envelope.region, cx));
        } else if self.state.is_loading() {
            root = root.child(Caption::new("Loading profile..."));
        } else {
            root = root.child(
                Alert::new("profile-empty", Severity::Info, "No profile loaded")
                    .body("Waiting for a profile-v1 response."),
            );
        }

        root
    }
}
