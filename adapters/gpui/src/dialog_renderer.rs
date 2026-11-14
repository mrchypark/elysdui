//! GPUI rendering for the SDUI Dialog interaction family.

use ely_gpui_component::{
    buttons::{Button, ButtonVariant},
    devtools::find as regex_find,
    forms::{FormField, Input, PasswordInput, TextInput},
    overlays::{AlertDialog, ConfirmDialog, Dialog},
    primitives::Severity,
};
use gpui::{
    AnyElement, App, AppContext, Bounds, ElementId, Entity, IntoElement, ParentElement, Pixels,
    SharedString, Window, div, point, prelude::*, size,
};
use serde_json::{Value, json};

use crate::{catalogue::CatalogueView, dashboard::ScreenNode};

fn text<'a>(props: &'a Value, key: &str) -> Option<&'a str> {
    props
        .get(key)
        .and_then(Value::as_str)
        .filter(|s| !s.is_empty())
}

fn variant(value: Option<&str>) -> ButtonVariant {
    match value.unwrap_or("") {
        "danger" => ButtonVariant::Danger,
        "success" => ButtonVariant::Success,
        "secondary" => ButtonVariant::Secondary,
        "outline" => ButtonVariant::Outline,
        "ghost" => ButtonVariant::Ghost,
        "subtle" => ButtonVariant::Subtle,
        "link" => ButtonVariant::Link,
        _ => ButtonVariant::Primary,
    }
}

fn dismissible(props: &Value) -> bool {
    props
        .get("dismissible")
        .and_then(Value::as_bool)
        .unwrap_or(text(props, "presentation") != Some("alert"))
}

struct FieldSpec {
    name: String,
    label: String,
    value: String,
    input_type: String,
    required: bool,
    disabled: bool,
}

struct DialogField {
    spec: FieldSpec,
    input: Entity<TextInput>,
    error: Option<String>,
}

struct DialogFormState {
    fields: Vec<DialogField>,
}

fn field_specs(props: &Value, disabled: bool, simple_form: bool) -> Vec<FieldSpec> {
    if let Some(fields) = props
        .get("fields")
        .and_then(Value::as_array)
        .filter(|fields| !fields.is_empty())
    {
        return fields
            .iter()
            .enumerate()
            .map(|(index, field)| {
                let name = field
                    .get("name")
                    .and_then(Value::as_str)
                    .filter(|name| !name.is_empty())
                    .map(str::to_owned)
                    .unwrap_or_else(|| format!("field-{index}"));
                FieldSpec {
                    label: field
                        .get("label")
                        .and_then(Value::as_str)
                        .filter(|label| !label.is_empty())
                        .unwrap_or(&name)
                        .to_owned(),
                    name,
                    value: field
                        .get("value")
                        .and_then(Value::as_str)
                        .unwrap_or_default()
                        .to_owned(),
                    input_type: field
                        .get("type")
                        .and_then(Value::as_str)
                        .unwrap_or("text")
                        .to_owned(),
                    required: field.get("required").and_then(Value::as_bool) == Some(true),
                    disabled: disabled
                        || field.get("disabled").and_then(Value::as_bool) == Some(true),
                }
            })
            .collect();
    }
    if text(props, "presentation") == Some("prompt") {
        return vec![FieldSpec {
            name: text(props, "name").unwrap_or("value").to_owned(),
            label: text(props, "fieldLabel").unwrap_or("New name").to_owned(),
            value: text(props, "value").unwrap_or_default().to_owned(),
            input_type: "text".to_owned(),
            required: true,
            disabled,
        }];
    }
    if simple_form {
        return vec![FieldSpec {
            name: text(props, "name").unwrap_or_default().to_owned(),
            label: text(props, "label")
                .or_else(|| text(props, "title"))
                .unwrap_or("Value")
                .to_owned(),
            value: text(props, "value").unwrap_or_default().to_owned(),
            input_type: "text".to_owned(),
            required: props.get("required").and_then(Value::as_bool) == Some(true),
            disabled,
        }];
    }
    Vec::new()
}

fn validate_form(
    state: &DialogFormState,
    props: &Value,
    cx: &App,
) -> Result<Vec<(String, String)>, Vec<Option<String>>> {
    let values: Vec<String> = state
        .fields
        .iter()
        .map(|field| field.input.read(cx).text().to_owned())
        .collect();
    let mut errors = vec![None; state.fields.len()];
    for (index, field) in state.fields.iter().enumerate() {
        if field.spec.disabled {
            continue;
        }
        if field.spec.required && values[index].is_empty() {
            errors[index] = Some("This field is required.".to_owned());
        } else if !values[index].is_empty() && field.spec.input_type.eq_ignore_ascii_case("email") {
            // HTML's single-address email syntax; dialogs do not expose `multiple`.
            let pattern = r"\A[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*\z";
            if !regex_find(pattern, &[], &values[index]).is_ok_and(|matches| !matches.is_empty()) {
                errors[index] = Some("Enter a valid email address.".to_owned());
            }
        }
    }
    let first = (!state.fields.is_empty()).then_some(0);
    if let Some(first) = first.filter(|index| !state.fields[*index].spec.disabled) {
        if props.get("trimRequired").and_then(Value::as_bool) == Some(true)
            && values[first].trim().is_empty()
        {
            errors[first] = Some("A name cannot be empty.".to_owned());
        }
        if let Some(disallow) = text(props, "disallow")
            && disallow.chars().any(|ch| values[first].contains(ch))
        {
            errors[first] = Some(
                text(props, "validationMessage")
                    .unwrap_or("This value contains a disallowed character.")
                    .to_owned(),
            );
        }
        if text(props, "presentation") == Some("prompt")
            && props
                .get("fields")
                .and_then(Value::as_array)
                .is_none_or(Vec::is_empty)
            && !values[first].is_empty()
            && let Some(pattern) = text(props, "pattern")
        {
            let full_pattern = format!(r"\A(?:{pattern})\z");
            match regex_find(&full_pattern, &[], &values[first]) {
                Ok(matches) if matches.is_empty() => {
                    errors[first] = Some("Match the requested format.".to_owned());
                }
                Err(_) => {
                    errors[first] = Some("This input pattern cannot be validated here.".to_owned());
                }
                _ => {}
            }
        }
    }
    if errors.iter().any(Option::is_some) {
        return Err(errors);
    }
    Ok(state
        .fields
        .iter()
        .enumerate()
        .filter(|(_, field)| !field.spec.disabled && !field.spec.name.is_empty())
        .map(|(index, field)| (field.spec.name.clone(), values[index].clone()))
        .collect())
}

fn body(node: &ScreenNode) -> Option<String> {
    ["text", "content", "body", "message", "description"]
        .into_iter()
        .find_map(|key| {
            node.props
                .get(key)
                .and_then(Value::as_str)
                .map(str::to_owned)
        })
}

fn disabled(node: &ScreenNode) -> bool {
    node.props.get("disabled").and_then(Value::as_bool) == Some(true)
}

fn usable_bounds(window: &Window) -> Bounds<Pixels> {
    let viewport = window.viewport_size();
    Bounds::new(
        point(Pixels::ZERO, Pixels::ZERO),
        size(viewport.width, viewport.height),
    )
}

/// Render one SDUI Dialog-family node, including its trigger and local open state.
pub(crate) fn render(
    node: &ScreenNode,
    eid: &SharedString,
    window: &mut Window,
    cx: &mut App,
    view: &gpui::WeakEntity<CatalogueView>,
) -> AnyElement {
    let root_props = Value::Object(
        node.props
            .iter()
            .map(|(k, v)| (k.clone(), v.clone()))
            .collect(),
    );
    let items = root_props
        .get("items")
        .and_then(Value::as_array)
        .filter(|items| !items.is_empty());
    let simple_form = items.is_none()
        && text(&root_props, "presentation").is_none()
        && root_props
            .get("fields")
            .and_then(Value::as_array)
            .is_none_or(Vec::is_empty);
    let mut launchers = div().flex().flex_wrap().gap_2();
    if let Some(items) = items {
        for (index, item) in items.iter().enumerate() {
            launchers = launchers.child(render_one(
                node,
                item,
                text(&root_props, "content"),
                false,
                eid,
                index,
                window,
                cx,
                view,
            ));
        }
    } else {
        launchers = launchers.child(render_one(
            node,
            &root_props,
            None,
            simple_form,
            eid,
            0,
            window,
            cx,
            view,
        ));
    }
    launchers.into_any_element()
}

fn render_one(
    node: &ScreenNode,
    props: &Value,
    root_content: Option<&str>,
    simple_form: bool,
    eid: &SharedString,
    index: usize,
    window: &mut Window,
    cx: &mut App,
    view: &gpui::WeakEntity<CatalogueView>,
) -> AnyElement {
    let id = format!("{eid}-dialog-{index}");
    let element_id = ElementId::from(id.clone());
    let open = window.use_keyed_state((element_id.clone(), "open"), cx, |_, _| false);
    let disabled = disabled(node) || props.get("disabled").and_then(Value::as_bool) == Some(true);
    let trigger_label = if simple_form {
        text(props, "label").or_else(|| text(props, "title"))
    } else {
        text(props, "label").or_else(|| text(props, "value"))
    }
    .unwrap_or_default()
    .to_owned();
    let trigger_open = open.clone();
    let mut root = div().child(
        Button::new((element_id.clone(), "trigger"), trigger_label)
            .debug_selector(|| "sdui-dialog-trigger".into())
            .disabled(disabled)
            .on_click(move |_, _, cx| {
                trigger_open.update(cx, |open, cx| {
                    *open = true;
                    cx.notify();
                })
            }),
    );
    if !*open.read(cx) {
        return root.into_any_element();
    }

    let specs = field_specs(props, disabled, simple_form);
    let form_present = !specs.is_empty();
    let form_state = form_present.then(|| {
        window.use_keyed_state((element_id.clone(), "fields"), cx, |window, cx| {
            let fields = specs
                .into_iter()
                .map(|spec| {
                    let input = cx.new(|cx| {
                        let mut input = TextInput::new(window, cx);
                        input.set_text(spec.value.clone(), cx);
                        input.set_disabled(spec.disabled, cx);
                        if spec.input_type == "password" {
                            input.set_masked(true, cx);
                        }
                        input
                    });
                    DialogField {
                        spec,
                        input,
                        error: None,
                    }
                })
                .collect();
            DialogFormState { fields }
        })
    });

    let title = text(props, "title")
        .or_else(|| text(props, "label"))
        .unwrap_or("Dialog")
        .to_owned();
    let message = text(props, "content")
        .or(root_content)
        .or_else(|| text(props, "body"))
        .map(str::to_owned)
        .or_else(|| body(node))
        .unwrap_or_default();
    let action_label = text(props, "actionLabel")
        .unwrap_or(if form_present { "Save" } else { "Continue" })
        .to_owned();
    let action = text(props, "action")
        .unwrap_or(if form_present { "submit" } else { "confirm" })
        .to_owned();
    let kind = node.node_type.as_str();
    let can_dismiss = dismissible(props);
    let bounds = usable_bounds(window);
    let no_actions = props.get("noActions").and_then(Value::as_bool) == Some(true);
    let dialog_close = open.clone();
    let close = move |_: &mut Window, cx: &mut App| {
        dialog_close.update(cx, |open, cx| {
            *open = false;
            cx.notify();
        })
    };

    let dialog = if !form_present && !no_actions && !can_dismiss {
        let v = view.clone();
        let nid = node.id.clone();
        let ntype = node.node_type.clone();
        let action = action.clone();
        let ack_close = move |window: &mut Window, cx: &mut App| {
            close(window, cx);
            let _ = v.update(cx, |this, cx| {
                this.trigger_event(&nid, &ntype, "ely:action", json!(action), cx)
            });
        };
        let alert = AlertDialog::new(
            element_id.clone(),
            Severity::Info,
            title,
            message,
            ack_close,
        )
        .usable_bounds(bounds)
        .label(action_label);
        alert.into_any_element()
    } else if !form_present && kind == "overlays/ConfirmDialog" && !no_actions {
        let v = view.clone();
        let nid = node.id.clone();
        let ntype = node.node_type.clone();
        let action = action.clone();
        let mut confirm = ConfirmDialog::new(element_id.clone(), title, message, close)
            .usable_bounds(bounds)
            .confirm(action_label)
            .on_confirm(move |_, cx| {
                let _ = v.update(cx, |this, cx| {
                    this.trigger_event(&nid, &ntype, "ely:action", json!(action), cx)
                });
            });
        if text(props, "buttonVariant") == Some("danger") {
            confirm = confirm.destructive();
        }
        confirm.into_any_element()
    } else {
        let mut dialog = Dialog::new(element_id.clone(), title, close).usable_bounds(bounds);
        if !message.is_empty() {
            dialog = dialog.detail(message);
        }
        if let Some(form_state) = &form_state {
            let fields = form_state.read(cx).fields.iter().enumerate().fold(
                div().flex().flex_col().gap_3(),
                |form, (index, field)| {
                    let mut form_field = FormField::new(
                        (element_id.clone(), format!("field-{index}")),
                        field.spec.label.clone(),
                    );
                    if field.spec.required {
                        form_field = form_field.required();
                    }
                    if let Some(error) = &field.error {
                        form_field = form_field.error(error.clone());
                    }
                    form.child(form_field.child(
                        div().debug_selector(|| "sdui-dialog-field".into()).child(
                            if field.spec.input_type == "password" {
                                PasswordInput::new(&field.input).into_any_element()
                            } else {
                                Input::new(&field.input).into_any_element()
                            },
                        ),
                    ))
                },
            );
            dialog = dialog.child(fields);
            if can_dismiss {
                let cancel_id = (element_id.clone(), "cancel");
                let cancel_label = text(props, "cancelLabel").unwrap_or("Cancel").to_owned();
                dialog = dialog.action(move |close| {
                    Button::new(cancel_id, cancel_label)
                        .variant(ButtonVariant::Ghost)
                        .debug_selector(|| "sdui-dialog-cancel".into())
                        .on_click(move |_, window, cx| close(window, cx))
                });
            }
            let submit_state = form_state.clone();
            let submit_props = props.clone();
            let submit_view = view.clone();
            let submit_node = node.id.clone();
            let submit_type = node.node_type.clone();
            let button_id = (element_id.clone(), "submit");
            let button_label = action_label;
            dialog = dialog.action(move |_| {
                let state = submit_state.clone();
                let props = submit_props.clone();
                let view = submit_view.clone();
                let node = submit_node.clone();
                let node_type = submit_type.clone();
                Button::new(button_id, button_label)
                    .debug_selector(|| "sdui-dialog-submit".into())
                    .disabled(disabled)
                    .on_click(
                        move |_, _, cx| match validate_form(&state.read(cx), &props, cx) {
                            Ok(payload) => {
                                state.update(cx, |state, cx| {
                                    for field in &mut state.fields {
                                        field.error = None;
                                    }
                                    cx.notify();
                                });
                                let entries: Vec<Value> = payload
                                    .into_iter()
                                    .map(|(name, value)| json!([name, value]))
                                    .collect();
                                let action = props
                                    .get("action")
                                    .and_then(Value::as_str)
                                    .filter(|action| !action.is_empty())
                                    .unwrap_or("submit");
                                let detail = json!({
                                    "action": action,
                                    "formData": entries,
                                    "values": entries,
                                    "submitter": "",
                                });
                                let _ = view.update(cx, |this, cx| {
                                    this.trigger_event(&node, &node_type, "ely:action", detail, cx)
                                });
                            }
                            Err(errors) => {
                                state.update(cx, |state, cx| {
                                    for (field, error) in state.fields.iter_mut().zip(errors) {
                                        field.error = error;
                                    }
                                    cx.notify();
                                });
                            }
                        },
                    )
            });
        } else if !no_actions {
            if can_dismiss {
                let cancel_id = (element_id.clone(), "cancel");
                let cancel_label = text(props, "cancelLabel").unwrap_or("Cancel").to_owned();
                dialog = dialog.action(move |close| {
                    Button::new(cancel_id, cancel_label)
                        .variant(ButtonVariant::Ghost)
                        .on_click(move |_, window, cx| close(window, cx))
                });
            }
            let v = view.clone();
            let nid = node.id.clone();
            let ntype = node.node_type.clone();
            let action_value = action;
            let button_id = (element_id.clone(), "action");
            let button_label = action_label;
            let button_variant = variant(text(props, "buttonVariant"));
            dialog = dialog.action(move |close| {
                Button::new(button_id, button_label)
                    .variant(button_variant)
                    .disabled(disabled)
                    .on_click(move |_, window, cx| {
                        close(window, cx);
                        let _ = v.update(cx, |this, cx| {
                            this.trigger_event(&nid, &ntype, "ely:action", json!(action_value), cx)
                        });
                    })
            });
        }
        // shortcut: held generic and form dialogs are unavailable in the pinned Ely API; upgrade when Dialog exposes dismissal controls.
        dialog.into_any_element()
    };
    root = root.child(
        div()
            .debug_selector(|| "sdui-dialog-surface".into())
            .child(dialog),
    );
    root.into_any_element()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn button_variant_contract_defaults_to_primary_and_maps_danger() {
        assert_eq!(variant(None), ButtonVariant::Primary);
        assert_eq!(variant(Some("danger")), ButtonVariant::Danger);
        assert_eq!(variant(Some("unknown")), ButtonVariant::Primary);
    }

    #[test]
    fn dismissal_defaults_to_held_only_for_alert_presentation() {
        assert!(dismissible(&json!({"presentation":"modal"})));
        assert!(!dismissible(&json!({"presentation":"alert"})));
        assert!(!dismissible(
            &json!({"presentation":"alert","dismissible":false})
        ));
        assert!(dismissible(
            &json!({"presentation":"alert","dismissible":true})
        ));
        assert!(!dismissible(&json!({"dismissible":false})));
    }
}
