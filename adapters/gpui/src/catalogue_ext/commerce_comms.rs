use std::{collections::BTreeSet, path::Path, time::Duration};

use ely_gpui_component::{
    account::{
        Account, AccountSwitcher, BillingHistory, Invitation, InvitationList, Invoice,
        InvoiceState, LoginForm, MagicLinkForm, Member as AccountMember, ProfileCard,
        Role as AccountRole, Session, SessionList, SignupForm, TeamMemberTable, TwoFactorInput,
    },
    agent::{
        AgentStep, AgentStepList, ArtifactPanel, BrowserPreview, ChangeState, FileChange,
        FileChangeCard, McpServer, McpServerList, Memory, MemoryPanel, SandboxState, SandboxStatus,
        ServerState, ToolApprovalDialog, ToolCallCard,
    },
    buttons::{Button, ButtonVariant},
    chat::{
        Attachment, AttachmentChip, ChatContainer, CitationBadge, CodeBlock, Conversation,
        ConversationList, ErrorMessage, FollowUpSuggestions, ImageMessage, MessageAvatar,
        MessageBubble, MessageHeader, PromptInput, QuoteReply, Role as ChatRole, SearchProgress,
        SharedConversationView, Source, StepState, StreamingText, SuggestionChips, ThinkingBlock,
        WelcomeScreen,
    },
    collab::{
        AccessList, AnnotatedText, Annotation, Comment, CommentSidebar, CommentThread, EditMode,
        InviteInput, LinkAccess, Member as CollabMember, Peer, PresenceAvatars, Reaction,
        Role as CollabRole, ShareDialog, SuggestionMode, Thread,
    },
    data_display::{Avatar, Presence},
    forms::{Choice, TextInput},
    layout::v_stack,
    mail::{
        Contact, Label as MailLabel, LabelPicker, Mail, MailComposer, MailList, MailReader,
        MailThreadView, Mailbox, MailboxList, Message as MailMessage, ScheduleSend,
        SignatureEditor, SnoozePicker,
    },
    messaging::{
        CallControls, ChannelHeader, ChannelItem, ChannelList, ChatMessage, ChatRow, ClearAfter,
        Delivery, DirectMessageItem, Gif, GifPicker, Gifs, IncomingCallDialog, Member as MsgMember,
        MemberList, MessageThread, OnlineStatus, ParticipantTile, PinnedMessage, PinnedMessages,
        ReadReceipt, ScreenShareView, Status as MsgStatus, StatusSetter, Sticker, StickerPack,
        StickerPicker,
    },
    primitives::IconName,
    theme::ControlSize,
    typography::Paragraph,
};
use gpui::{
    AnyElement, App, Entity, ImageSource, IntoElement, ParentElement, SharedString, SharedUri,
    Styled, WeakEntity, Window,
};
use jiff::Timestamp;
use serde_json::{Map, Value, json};

use crate::{
    catalogue::{
        CatalogueView, best_body, best_label, best_title, extract_choices, extract_item_objects,
        non_empty_or, prop_bool, prop_f64, prop_str, value_to_f64,
    },
    dashboard::ScreenNode,
};

fn image_source(raw: &str) -> ImageSource {
    if raw.starts_with("http://") || raw.starts_with("https://") {
        SharedUri::from(raw.to_owned()).into()
    } else {
        Path::new(raw).into()
    }
}

fn maybe_image(s: Option<&str>) -> Option<ImageSource> {
    s.filter(|raw| raw.contains('/') || raw.contains('.'))
        .map(image_source)
}

fn obj_str(obj: &Map<String, Value>, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|k| {
        obj.get(*k).and_then(|v| match v {
            Value::String(s) if !s.trim().is_empty() => Some(s.clone()),
            Value::Number(n) => Some(n.to_string()),
            _ => None,
        })
    })
}

fn obj_bool(obj: &Map<String, Value>, key: &str) -> bool {
    obj.get(key).and_then(Value::as_bool).unwrap_or(false)
}

fn arr_objs(node: &ScreenNode, key: &str) -> Vec<Map<String, Value>> {
    node.props
        .get(key)
        .and_then(Value::as_array)
        .map(|arr| arr.iter().filter_map(|v| v.as_object().cloned()).collect())
        .unwrap_or_default()
}

fn parse_money(raw: Option<&str>) -> f64 {
    raw.and_then(|s| {
        let norm = s.replace('\u{2212}', "-");
        value_to_f64(&Value::String(norm))
    })
    .filter(|v| v.is_finite())
    .unwrap_or(0.0)
}

fn parse_presence(raw: Option<&str>) -> Presence {
    match raw.map(str::to_ascii_lowercase).as_deref() {
        Some("away") => Presence::Away,
        Some("busy") | Some("dnd") => Presence::Busy,
        Some("offline") => Presence::Offline,
        _ => Presence::Online,
    }
}

fn parse_step_state(raw: Option<&str>) -> StepState {
    match raw.map(str::to_ascii_lowercase).as_deref() {
        Some("done" | "complete" | "completed" | "success") => StepState::Done,
        Some("working" | "running" | "active" | "in_progress") => StepState::Working,
        Some("failed" | "error") => StepState::Failed,
        _ => StepState::Waiting,
    }
}

fn parse_timestamp(raw: Option<&str>) -> Timestamp {
    raw.and_then(|s| s.parse::<Timestamp>().ok())
        .unwrap_or(Timestamp::UNIX_EPOCH)
}

fn parse_collab_role(raw: Option<&str>) -> CollabRole {
    match raw.map(str::to_ascii_lowercase).as_deref() {
        Some("edit" | "editor") => CollabRole::Edit,
        Some("comment" | "commenter") => CollabRole::Comment,
        _ => CollabRole::View,
    }
}

fn collab_role_str(role: CollabRole) -> &'static str {
    match role {
        CollabRole::View => "view",
        CollabRole::Comment => "comment",
        CollabRole::Edit => "edit",
    }
}

fn safe_ratio(val: Option<f64>, fallback: f32) -> f32 {
    val.filter(|v| v.is_finite() && *v > 0.0)
        .map(|v| v as f32)
        .unwrap_or(fallback)
}

fn keyed_text_input(
    eid: &SharedString,
    suffix: &'static str,
    placeholder: &str,
    initial: &str,
    multiline: bool,
    window: &mut Window,
    cx: &mut App,
) -> Entity<TextInput> {
    let ph = placeholder.to_owned();
    let init = initial.to_owned();
    window.use_keyed_state(
        (gpui::ElementId::from(eid.clone()), suffix),
        cx,
        move |window, cx| {
            let mut ti = TextInput::new(window, cx).placeholder(ph);
            if multiline {
                ti = ti.multi_line(2, 6);
            }
            if !init.is_empty() {
                ti.set_text(init, cx);
            }
            ti
        },
    )
}

fn emit_event(
    view: &WeakEntity<CatalogueView>,
    key: &str,
    ntype: &str,
    event: &str,
    val: Value,
    cx: &mut App,
) {
    let _ = view.update(cx, |this, cx| {
        this.trigger_event(key, ntype, event, val, cx);
    });
}

fn dialog_open(view_state: &CatalogueView, state_key: &str, node: &ScreenNode) -> bool {
    view_state
        .value(state_key)
        .and_then(Value::as_bool)
        .unwrap_or_else(|| prop_bool(node, "open"))
}

fn close_dialog_and_emit(
    view: &WeakEntity<CatalogueView>,
    state_key: &str,
    nid: &str,
    ntype: &str,
    val: Value,
    cx: &mut App,
) {
    let _ = view.update(cx, |this, cx| {
        this.set_value(state_key, Value::Bool(false), cx);
        this.trigger_event(nid, ntype, "ely:action", val, cx);
    });
}

fn extract_account_roles(node: &ScreenNode) -> Vec<AccountRole> {
    let opts = node
        .props
        .get("options")
        .and_then(Value::as_array)
        .cloned()
        .or_else(|| {
            arr_objs(node, "fields")
                .into_iter()
                .find_map(|f| f.get("options").and_then(Value::as_array).cloned())
        })
        .unwrap_or_default();
    let mut roles: Vec<AccountRole> = opts
        .into_iter()
        .enumerate()
        .filter_map(|(ix, opt)| {
            let obj = opt.as_object()?;
            let name = obj_str(obj, &["label", "title", "name", "value"])
                .unwrap_or_else(|| format!("Role {}", ix + 1));
            let key =
                obj_str(obj, &["value", "id", "name"]).unwrap_or_else(|| name.to_ascii_lowercase());
            let description = obj_str(obj, &["text", "hint"]).unwrap_or_default();
            Some(AccountRole {
                key: key.into(),
                name: name.into(),
                description: description.into(),
            })
        })
        .collect();
    if roles.is_empty() {
        roles.push(AccountRole {
            key: "member".into(),
            name: "Member".into(),
            description: "".into(),
        });
    }
    roles
}

fn resolve_role_key(
    roles: &[AccountRole],
    raw: Option<&str>,
    default_key: &SharedString,
) -> SharedString {
    let Some(raw) = raw.map(str::trim).filter(|s| !s.is_empty()) else {
        return default_key.clone();
    };
    roles
        .iter()
        .find(|r| {
            r.key.as_ref().eq_ignore_ascii_case(raw) || r.name.as_ref().eq_ignore_ascii_case(raw)
        })
        .map(|r| r.key.clone())
        .unwrap_or_else(|| default_key.clone())
}

fn render_message_bubbles(node: &ScreenNode, eid: &SharedString) -> AnyElement {
    let items = extract_item_objects(node);
    let mut col = v_stack().gap_3();
    if items.is_empty() {
        if let Some(body) = best_body(node) {
            let mut bubble = MessageBubble::new(ChatRole::Assistant);
            bubble = bubble.child(Paragraph::new(body));
            col = col.child(bubble);
        }
        return col.into_any_element();
    }
    for (ix, item) in items.iter().enumerate() {
        let role = match obj_str(item, &["role"]).as_deref() {
            Some("user") => ChatRole::User,
            Some("system") => ChatRole::System,
            Some("error") => ChatRole::Error,
            _ => ChatRole::Assistant,
        };
        let author = obj_str(item, &["author", "label"]).unwrap_or_else(|| match role {
            ChatRole::User => "User".into(),
            ChatRole::System => "System".into(),
            ChatRole::Error => "Error".into(),
            ChatRole::Assistant => "Assistant".into(),
        });
        let content = obj_str(item, &["content", "text", "body"]).unwrap_or_default();
        let mut bubble = MessageBubble::new(role)
            .avatar(MessageAvatar::new(
                (gpui::ElementId::from(eid.clone()), format!("av-{ix}")),
                role,
                author.clone(),
            ))
            .header(MessageHeader::new(
                (gpui::ElementId::from(eid.clone()), format!("hd-{ix}")),
                author,
            ));
        bubble = bubble.child(Paragraph::new(content));
        col = col.child(bubble);
    }
    col.into_any_element()
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
    let eid = eid.clone();
    let state_key = state_key.to_owned();
    let nid = node.id.clone();
    let ntype = node.node_type.clone();

    let el: AnyElement = match kind {
        // ---- account ----
        "account/AccountSwitcher" => {
            let mut accounts: Vec<Account> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| Account {
                    key: obj_str(&item, &["value", "id", "key"])
                        .unwrap_or_else(|| format!("acc-{ix}"))
                        .into(),
                    name: obj_str(&item, &["label", "name", "title"])
                        .unwrap_or_else(|| "Account".into())
                        .into(),
                    email: obj_str(&item, &["text", "email"])
                        .unwrap_or_default()
                        .into(),
                    image: maybe_image(obj_str(&item, &["image", "url"]).as_deref()),
                })
                .collect();
            if accounts.is_empty() {
                accounts.push(Account {
                    key: "default".into(),
                    name: non_empty_or(&best_label(node), "Account").into(),
                    email: prop_str(node, "email").unwrap_or_default().into(),
                    image: None,
                });
            }
            let current = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_else(|| accounts[0].key.to_string());
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            let mut sw = AccountSwitcher::new(eid, accounts, current, move |key, _, cx| {
                emit_event(&v, &sk, &nt, "change", json!(key.to_string()), cx);
            });
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            if prop_str(node, "addAction").is_some() {
                sw = sw.on_add(move |_, cx| {
                    emit_event(&v2, &nid2, &nt2, "ely:action", json!("add-account"), cx);
                });
            }
            sw.into_any_element()
        }
        "account/BillingHistory" => {
            let currency = prop_str(node, "currency").unwrap_or_else(|| "USD".into());
            let invoices: Vec<Invoice> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let state = match obj_str(&item, &["status", "state"])
                        .map(|s| s.to_ascii_lowercase())
                        .as_deref()
                    {
                        Some("due") => InvoiceState::Due,
                        Some("failed") => InvoiceState::Failed,
                        Some("refunded") => InvoiceState::Refunded,
                        _ => InvoiceState::Paid,
                    };
                    Invoice {
                        key: obj_str(&item, &["value", "id", "key"])
                            .unwrap_or_else(|| format!("inv-{ix}"))
                            .into(),
                        date: obj_str(&item, &["date", "time"]).unwrap_or_default().into(),
                        description: obj_str(&item, &["description", "text", "label"])
                            .unwrap_or_else(|| "Invoice".into())
                            .into(),
                        amount: parse_money(obj_str(&item, &["amount"]).as_deref()),
                        currency: currency.clone().into(),
                        state,
                    }
                })
                .collect();
            let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
            BillingHistory::new(eid, invoices)
                .on_download(move |key, _, cx| {
                    emit_event(&v, &nid, &nt, "ely:action", json!(key.to_string()), cx);
                })
                .into_any_element()
        }
        "account/LoginForm" => {
            let (v, nid_s, nt) = (view.clone(), nid.clone(), ntype.clone());
            let mut form = LoginForm::new(eid, move |login, _, cx| {
                emit_event(
                    &v,
                    &nid_s,
                    &nt,
                    "ely:action",
                    json!({ "action": "login", "email": login.email.as_ref(), "remember": login.remember }),
                    cx,
                );
            })
            .busy(prop_bool(node, "busy") || prop_bool(node, "loading"));
            if let Some(err) = prop_str(node, "error").filter(|s| !s.trim().is_empty()) {
                form = form.error(err);
            }
            if prop_str(node, "forgotAction").is_some() {
                let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
                form = form.on_forgot(move |_, cx| {
                    emit_event(&v, &nid, &nt, "ely:action", json!("forgot-password"), cx);
                });
            }
            if prop_str(node, "otherAction").is_some() {
                let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
                form = form.on_sign_up(move |_, cx| {
                    emit_event(&v, &nid, &nt, "ely:action", json!("sign-up"), cx);
                });
            }
            form.into_any_element()
        }
        "account/MagicLinkForm" => {
            let (v, nid_s, nt) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            MagicLinkForm::new(eid, move |email, _, cx| {
                emit_event(
                    &v,
                    &nid_s,
                    &nt,
                    "ely:action",
                    json!({ "action": "magic-link", "email": email.as_ref() }),
                    cx,
                );
            })
            .sent(prop_bool(node, "sent"))
            .busy(prop_bool(node, "busy") || prop_bool(node, "loading"))
            .on_other(move |_, cx| {
                emit_event(&v2, &nid2, &nt2, "ely:action", json!("other-email"), cx);
            })
            .into_any_element()
        }
        "account/ProfileCard" => {
            let name = prop_str(node, "displayName")
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| non_empty_or(&best_title(node), "User"));
            let mut card = ProfileCard::new(gpui::ElementId::from(eid.clone()), name);
            if let Some(role) = prop_str(node, "role").filter(|s| !s.trim().is_empty()) {
                card = card.title(role);
            }
            if let Some(bio) = best_body(node).filter(|s| !s.trim().is_empty()) {
                card = card.bio(bio);
            }
            if let Some(p) = prop_str(node, "presence") {
                card = card.presence(parse_presence(Some(&p)));
            }
            if let Some(email) = prop_str(node, "email").filter(|s| !s.trim().is_empty()) {
                card = card.detail(IconName::Mail, email);
            }
            if let Some(loc) = prop_str(node, "location").filter(|s| !s.trim().is_empty()) {
                card = card.detail(IconName::MapPin, loc);
            }
            for (ix, ch) in extract_choices(node).into_iter().enumerate() {
                let (v, nid, nt, val) = (
                    view.clone(),
                    nid.clone(),
                    ntype.clone(),
                    ch.value.to_string(),
                );
                card = card.action(
                    Button::new(
                        (gpui::ElementId::from(eid.clone()), format!("act-{ix}")),
                        ch.label,
                    )
                    .variant(ButtonVariant::Secondary)
                    .size(ControlSize::Sm)
                    .on_click(move |_, _, cx| {
                        emit_event(&v, &nid, &nt, "click", json!(val), cx);
                    }),
                );
            }
            card.into_any_element()
        }
        "account/SessionList" => {
            let mut seen_current = false;
            let sessions: Vec<Session> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let device =
                        obj_str(&item, &["label", "device"]).unwrap_or_else(|| "Device".into());
                    let lower = device.to_ascii_lowercase();
                    let icon = if lower.contains("phone")
                        || lower.contains("ios")
                        || lower.contains("android")
                    {
                        IconName::Smartphone
                    } else {
                        IconName::Monitor
                    };
                    let is_curr = obj_bool(&item, "current") && !seen_current;
                    if is_curr {
                        seen_current = true;
                    }
                    Session {
                        key: obj_str(&item, &["value", "id", "key"])
                            .unwrap_or_else(|| format!("sess-{ix}"))
                            .into(),
                        icon,
                        device: device.into(),
                        client: obj_str(&item, &["text", "client"])
                            .unwrap_or_default()
                            .into(),
                        place: obj_str(&item, &["place", "location"])
                            .unwrap_or_default()
                            .into(),
                        seen: obj_str(&item, &["time", "seen"])
                            .unwrap_or_else(|| "Recently".into())
                            .into(),
                        current: is_curr,
                    }
                })
                .collect();
            let (v, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let mut list = SessionList::new(eid, sessions, move |key, _, cx| {
                emit_event(&v, &nid1, &nt1, "ely:action", json!(key.to_string()), cx);
            });
            if prop_str(node, "othersAction").is_some() {
                let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
                list = list.on_sign_out_others(move |_, cx| {
                    emit_event(&v, &nid, &nt, "ely:action", json!("sign-out-others"), cx);
                });
            }
            list.into_any_element()
        }
        "account/SignupForm" => {
            let (v, nid_s, nt) = (view.clone(), nid.clone(), ntype.clone());
            let mut form = SignupForm::new(eid, move |signup, _, cx| {
                emit_event(
                    &v,
                    &nid_s,
                    &nt,
                    "ely:action",
                    json!({ "action": "signup", "name": signup.name.as_ref(), "email": signup.email.as_ref() }),
                    cx,
                );
            })
            .busy(prop_bool(node, "busy") || prop_bool(node, "loading"));
            if let Some(terms) = prop_str(node, "termsLabel").filter(|s| !s.trim().is_empty()) {
                form = form.terms(terms);
            }
            if let Some(err) = prop_str(node, "error").filter(|s| !s.trim().is_empty()) {
                form = form.error(err);
            }
            if prop_str(node, "otherAction").is_some() {
                let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
                form = form.on_sign_in(move |_, cx| {
                    emit_event(&v, &nid, &nt, "ely:action", json!("sign-in"), cx);
                });
            }
            form.into_any_element()
        }
        "account/TeamMemberTable" => {
            let roles = extract_account_roles(node);
            let default_role = roles[0].key.clone();
            let members: Vec<AccountMember> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| AccountMember {
                    key: obj_str(&item, &["value", "id", "key"])
                        .unwrap_or_else(|| format!("mem-{ix}"))
                        .into(),
                    name: obj_str(&item, &["label", "name"])
                        .unwrap_or_else(|| "Member".into())
                        .into(),
                    email: obj_str(&item, &["email"]).unwrap_or_default().into(),
                    role: resolve_role_key(
                        &roles,
                        obj_str(&item, &["role", "text"]).as_deref(),
                        &default_role,
                    ),
                    seen: obj_str(&item, &["time", "seen"]).unwrap_or_default().into(),
                    image: maybe_image(obj_str(&item, &["image", "url"]).as_deref()),
                    owner: obj_bool(&item, "owner"),
                })
                .collect();
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            TeamMemberTable::new(
                eid,
                members,
                roles,
                move |member, role, _, cx| {
                    emit_event(
                        &v1,
                        &nid1,
                        &nt1,
                        "change",
                        json!({ "member": member.as_ref(), "role": role.as_ref() }),
                        cx,
                    );
                },
                move |member, _, cx| {
                    emit_event(
                        &v2,
                        &nid2,
                        &nt2,
                        "ely:action",
                        json!({ "remove": member.as_ref() }),
                        cx,
                    );
                },
            )
            .into_any_element()
        }
        "account/InvitationList" => {
            let roles = extract_account_roles(node);
            let default_role = roles[0].key.clone();
            let invitations: Vec<Invitation> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| Invitation {
                    key: obj_str(&item, &["value", "id", "key"])
                        .unwrap_or_else(|| format!("inv-{ix}"))
                        .into(),
                    email: obj_str(&item, &["email"]).unwrap_or_default().into(),
                    role: resolve_role_key(
                        &roles,
                        obj_str(&item, &["role", "text"]).as_deref(),
                        &default_role,
                    ),
                    sent: obj_str(&item, &["time", "sent"]).unwrap_or_default().into(),
                    expired: obj_bool(&item, "expired"),
                })
                .collect();
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            let (v3, nid3, nt3) = (view.clone(), nid.clone(), ntype.clone());
            InvitationList::new(
                eid,
                invitations,
                roles,
                move |email, role, _, cx| {
                    emit_event(
                        &v1,
                        &nid1,
                        &nt1,
                        "ely:action",
                        json!({ "action": "invite", "email": email.as_ref(), "role": role.as_ref() }),
                        cx,
                    );
                },
                move |key, _, cx| {
                    emit_event(
                        &v2,
                        &nid2,
                        &nt2,
                        "ely:action",
                        json!({ "action": "resend", "key": key.as_ref() }),
                        cx,
                    );
                },
                move |key, _, cx| {
                    emit_event(
                        &v3,
                        &nid3,
                        &nt3,
                        "ely:action",
                        json!({ "action": "revoke", "key": key.as_ref() }),
                        cx,
                    );
                },
            )
            .into_any_element()
        }
        "account/TwoFactorInput" => {
            let (v1, sk, nt1) = (view.clone(), state_key.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            let failed = prop_f64(node, "failed")
                .filter(|v| v.is_finite() && *v >= 0.0)
                .map(|v| v as usize)
                .unwrap_or(0);
            TwoFactorInput::new(eid, move |code, _, cx| {
                emit_event(&v1, &sk, &nt1, "change", json!(code.to_string()), cx);
            })
            .failed(failed)
            .busy(prop_bool(node, "busy") || prop_bool(node, "loading"))
            .on_recovery(move |_, cx| {
                emit_event(&v2, &nid2, &nt2, "ely:action", json!("recovery-code"), cx);
            })
            .into_any_element()
        }

        // ---- agent ----
        "agent/AgentStepList" => {
            let steps: Vec<AgentStep> = extract_item_objects(node)
                .into_iter()
                .map(|item| AgentStep {
                    title: obj_str(&item, &["label", "title"])
                        .unwrap_or_else(|| "Step".into())
                        .into(),
                    state: parse_step_state(obj_str(&item, &["status", "state"]).as_deref()),
                    detail: obj_str(&item, &["content", "description", "text"]).map(Into::into),
                    took: item
                        .get("tookMs")
                        .and_then(value_to_f64)
                        .filter(|v| v.is_finite() && *v >= 0.0)
                        .map(|ms| Duration::from_millis(ms as u64)),
                })
                .collect();
            AgentStepList::new(eid, steps).into_any_element()
        }
        "agent/ArtifactPanel" => {
            let title = non_empty_or(&best_title(node), "Artifact");
            let mut panel = ArtifactPanel::new(
                gpui::ElementId::from(eid.clone()),
                title,
                IconName::FileText,
            );
            let preview = best_body(node);
            let source = prop_str(node, "source");
            if let Some(p) = &preview {
                panel = panel.preview(Paragraph::new(p.clone()));
            }
            if let Some(s) = &source {
                panel = panel.source(CodeBlock::new(
                    (gpui::ElementId::from(eid.clone()), "src"),
                    s.clone(),
                ));
            }
            if preview.is_none() && source.is_none() {
                panel = panel.preview(Paragraph::new("Artifact"));
            }
            let opts = arr_objs(node, "options");
            if opts.len() > 1 {
                let current = opts
                    .iter()
                    .position(|o| obj_bool(o, "selected"))
                    .unwrap_or(0)
                    .min(opts.len() - 1);
                let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
                panel = panel.version(current, opts.len(), move |ix, _, cx| {
                    emit_event(&v, &sk, &nt, "change", json!(ix), cx);
                });
            }
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            panel
                .on_copy(move |_, cx| {
                    emit_event(&v1, &nid1, &nt1, "ely:action", json!("copy"), cx);
                })
                .on_download(move |_, cx| {
                    emit_event(&v2, &nid2, &nt2, "ely:action", json!("download"), cx);
                })
                .into_any_element()
        }
        "agent/BrowserPreview" => {
            let url = prop_str(node, "url").unwrap_or_else(|| "https://example.com".into());
            let frame_objs = arr_objs(node, "frames");
            let mut shown = 0usize;
            let mut frames: Vec<String> = frame_objs
                .iter()
                .enumerate()
                .filter_map(|(ix, f)| {
                    if obj_bool(f, "active") {
                        shown = ix;
                    }
                    obj_str(f, &["src", "url", "value"])
                })
                .collect();
            if frames.is_empty() {
                if let Some(src) = prop_str(node, "src") {
                    frames.push(src);
                } else {
                    frames.push("/assets/sample.svg".into());
                }
            }
            let shown = shown.min(frames.len().saturating_sub(1));
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            let mut bp = BrowserPreview::new(eid, url, frames, shown)
                .loading(prop_bool(node, "loading"))
                .on_show(move |ix, _, cx| {
                    emit_event(&v, &sk, &nt, "change", json!(ix), cx);
                });
            if let Some(r) = prop_f64(node, "ratio").filter(|v| v.is_finite() && *v > 0.0) {
                bp = bp.ratio(r as f32);
            }
            bp.into_any_element()
        }
        "agent/FileChangeCard" => {
            let path = prop_str(node, "path").unwrap_or_else(|| "src/lib.rs".into());
            let (old, new) = if let Some(diff) = prop_str(node, "diff") {
                let mut o = Vec::new();
                let mut n = Vec::new();
                for line in diff.lines() {
                    if let Some(rest) = line.strip_prefix('-') {
                        o.push(rest.trim_start().to_owned());
                    } else if let Some(rest) = line.strip_prefix('+') {
                        n.push(rest.trim_start().to_owned());
                    } else {
                        o.push(line.to_owned());
                        n.push(line.to_owned());
                    }
                }
                (o.join("\n"), n.join("\n"))
            } else {
                (
                    prop_str(node, "old").unwrap_or_default(),
                    prop_str(node, "new").unwrap_or_default(),
                )
            };
            let state = match prop_str(node, "status")
                .map(|s| s.to_ascii_lowercase())
                .as_deref()
            {
                Some("accepted") => ChangeState::Accepted,
                Some("rejected") => ChangeState::Rejected,
                _ => ChangeState::Proposed,
            };
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            FileChangeCard::new(
                eid,
                FileChange {
                    path: path.into(),
                    old: old.into(),
                    new: new.into(),
                    state,
                },
            )
            .on_decide(move |accepted, _, cx| {
                emit_event(&v, &sk, &nt, "change", json!(accepted), cx);
            })
            .into_any_element()
        }
        "agent/MCPServerList" => {
            let raw = {
                let s = arr_objs(node, "servers");
                if s.is_empty() {
                    extract_item_objects(node)
                } else {
                    s
                }
            };
            let servers: Vec<McpServer> = raw
                .into_iter()
                .enumerate()
                .map(|(ix, item)| {
                    let state = match obj_str(&item, &["state", "status"])
                        .map(|s| s.to_ascii_lowercase())
                        .as_deref()
                    {
                        Some("connected") => ServerState::Connected,
                        Some("connecting") => ServerState::Connecting,
                        Some("failed" | "error") => ServerState::Failed,
                        _ => ServerState::Off,
                    };
                    McpServer {
                        key: obj_str(&item, &["value", "id", "key"])
                            .unwrap_or_else(|| format!("srv-{ix}"))
                            .into(),
                        name: obj_str(&item, &["label", "name"])
                            .unwrap_or_else(|| "Server".into())
                            .into(),
                        detail: obj_str(&item, &["content", "detail", "url"])
                            .unwrap_or_default()
                            .into(),
                        state,
                        tools: item.get("tools").and_then(Value::as_u64).unwrap_or(0) as usize,
                    }
                })
                .collect();
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            McpServerList::new(eid, servers)
                .on_toggle(move |key, on, _, cx| {
                    emit_event(
                        &v,
                        &sk,
                        &nt,
                        "change",
                        json!({ "server": key.as_ref(), "enabled": on }),
                        cx,
                    );
                })
                .into_any_element()
        }
        "agent/MemoryPanel" => {
            let ph = prop_str(node, "placeholder").unwrap_or_else(|| "Remember something".into());
            let field = keyed_text_input(&eid, "mem-input", &ph, "", false, window, cx);
            let memories: Vec<Memory> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .map(|(ix, item)| Memory {
                    key: obj_str(&item, &["value", "id", "key"])
                        .unwrap_or_else(|| format!("mem-{ix}"))
                        .into(),
                    text: obj_str(&item, &["content", "text", "label"])
                        .unwrap_or_default()
                        .into(),
                    source: obj_str(&item, &["source"]).map(Into::into),
                    at: parse_timestamp(obj_str(&item, &["at"]).as_deref()),
                })
                .collect();
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            MemoryPanel::new(eid, &field, memories)
                .on_add(move |text, _, cx| {
                    emit_event(&v1, &nid1, &nt1, "ely:action", json!({ "add": text }), cx);
                })
                .on_forget(move |key, _, cx| {
                    emit_event(
                        &v2,
                        &nid2,
                        &nt2,
                        "ely:action",
                        json!({ "forget": key.as_ref() }),
                        cx,
                    );
                })
                .into_any_element()
        }
        "agent/SandboxStatus" => {
            let name = non_empty_or(&best_title(node), "Sandbox");
            let state = match prop_str(node, "status")
                .map(|s| s.to_ascii_lowercase())
                .as_deref()
            {
                Some("ready") => SandboxState::Ready,
                Some("busy" | "running") => SandboxState::Busy,
                Some("stopped") => SandboxState::Stopped,
                Some("failed" | "error") => SandboxState::Failed,
                _ => SandboxState::Starting,
            };
            let mut sb = SandboxStatus::new(eid, name, state);
            if let Some(cpu) = prop_f64(node, "cpu").filter(|v| v.is_finite()) {
                sb = sb.cpu((cpu as f32).clamp(0.0, 1.0));
            }
            if let (Some(used), Some(limit)) = (
                prop_f64(node, "memoryUsed").filter(|v| v.is_finite() && *v >= 0.0),
                prop_f64(node, "memoryLimit").filter(|v| v.is_finite() && *v > 0.0),
            ) {
                sb = sb.memory(used as u64, (limit as u64).max(1));
            }
            if let Some(secs) =
                prop_f64(node, "uptimeSeconds").filter(|v| v.is_finite() && *v >= 0.0)
            {
                sb = sb.uptime(Duration::from_secs(secs as u64));
            }
            sb.into_any_element()
        }
        "agent/ToolApprovalDialog" => {
            let tool =
                prop_str(node, "tool").unwrap_or_else(|| non_empty_or(&best_title(node), "tool"));
            let args = prop_str(node, "payload")
                .or_else(|| prop_str(node, "arguments"))
                .unwrap_or_else(|| "{}".into());
            let open = dialog_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), &format!("Approve {tool}"));
            let (v_open, sk_open, nt_open) = (view.clone(), state_key.clone(), ntype.clone());
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .debug_selector({
                        let id = nid.clone();
                        move || format!("cat-dlg-open-{id}")
                    })
                    .variant(ButtonVariant::Secondary)
                    .disabled(prop_bool(node, "disabled"))
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &nt_open, "change", json!(true), cx);
                    }),
            );
            if open {
                let (v, sk, nid_d, nt) =
                    (view.clone(), state_key.clone(), nid.clone(), ntype.clone());
                let mut dlg = ToolApprovalDialog::new(eid, tool, args, move |approved, _, cx| {
                    close_dialog_and_emit(
                        &v,
                        &sk,
                        &nid_d,
                        &nt,
                        json!({ "approved": approved }),
                        cx,
                    );
                });
                if let Some(detail) = prop_str(node, "detail").or_else(|| best_body(node)) {
                    dlg = dlg.detail(detail);
                }
                stack = stack.child(dlg);
            }
            stack.into_any_element()
        }
        "agent/ToolCallCard" => {
            let name =
                prop_str(node, "tool").unwrap_or_else(|| non_empty_or(&best_title(node), "tool"));
            let status = parse_step_state(prop_str(node, "status").as_deref());
            let mut card = ToolCallCard::new(eid, name, status);
            if let Some(s) = prop_str(node, "summary").filter(|s| !s.trim().is_empty()) {
                card = card.summary(s);
            }
            if let Some(ms) = prop_f64(node, "tookMs").filter(|v| v.is_finite() && *v >= 0.0) {
                card = card.took(Duration::from_millis(ms as u64));
            }
            if let Some(args) = prop_str(node, "arguments").or_else(|| prop_str(node, "payload")) {
                card = card.arguments(args);
            }
            let result = if status == StepState::Failed {
                prop_str(node, "error").or_else(|| prop_str(node, "result"))
            } else {
                prop_str(node, "result")
            };
            if let Some(res) = result {
                card = card.result(res);
            }
            card.into_any_element()
        }

        // ---- chat ----
        "chat/ChatContainer" => {
            let messages = render_message_bubbles(node, &eid);
            let ph = prop_str(node, "placeholder").unwrap_or_else(|| "Ask anything".into());
            let field = keyed_text_input(&eid, "chat-composer", &ph, "", true, window, cx);
            let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
            let f2 = field.clone();
            let composer = PromptInput::new(
                (gpui::ElementId::from(eid.clone()), "composer"),
                &field,
                move |_, cx| {
                    let text = f2.read(cx).text().to_owned();
                    emit_event(&v, &nid, &nt, "ely:action", json!({ "send": text }), cx);
                },
            );
            ChatContainer::new(messages)
                .composer(composer)
                .into_any_element()
        }
        "chat/CitationBadge" => {
            let num = prop_f64(node, "number")
                .filter(|v| v.is_finite() && *v >= 1.0)
                .map(|v| v as usize)
                .unwrap_or(1);
            let url = prop_str(node, "href")
                .or_else(|| prop_str(node, "url"))
                .unwrap_or_default();
            let src = Source {
                site: prop_str(node, "sourceSite")
                    .unwrap_or_else(|| "source".into())
                    .into(),
                title: prop_str(node, "sourceTitle")
                    .unwrap_or_else(|| non_empty_or(&best_title(node), "Source"))
                    .into(),
                url: url.clone().into(),
                snippet: best_body(node).map(Into::into),
            };
            let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
            CitationBadge::new(eid, num, src)
                .on_open(move |_, cx| {
                    emit_event(&v, &nid, &nt, "click", json!(url), cx);
                })
                .into_any_element()
        }
        "chat/CodeBlock" => {
            let lines = arr_objs(node, "lines");
            let code = prop_str(node, "code").unwrap_or_else(|| {
                if !lines.is_empty() {
                    lines
                        .iter()
                        .filter_map(|l| l.get("text").and_then(Value::as_str))
                        .collect::<Vec<_>>()
                        .join("\n")
                } else {
                    best_body(node).unwrap_or_default()
                }
            });
            let mut block = CodeBlock::new(eid, code);
            if let Some(lang) = prop_str(node, "language").filter(|s| !s.trim().is_empty()) {
                block = block.language(lang);
            }
            let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
            block
                .on_run(move |_, cx| {
                    emit_event(&v, &nid, &nt, "ely:action", json!("run"), cx);
                })
                .into_any_element()
        }
        "chat/ConversationList" => {
            let mut convs = Vec::new();
            let mut active = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(SharedString::from);
            let sections = arr_objs(node, "sections");
            let raw_items: Vec<Map<String, Value>> = if !sections.is_empty() {
                sections
                    .into_iter()
                    .flat_map(|s| {
                        s.get("items")
                            .and_then(Value::as_array)
                            .cloned()
                            .unwrap_or_default()
                    })
                    .filter_map(|v| v.as_object().cloned())
                    .collect()
            } else {
                extract_item_objects(node)
            };
            for (ix, item) in raw_items.into_iter().enumerate() {
                let key: SharedString = obj_str(&item, &["value", "id", "key"])
                    .unwrap_or_else(|| format!("conv-{ix}"))
                    .into();
                if active.is_none() && obj_bool(&item, "active") {
                    active = Some(key.clone());
                }
                convs.push(Conversation {
                    key,
                    title: obj_str(&item, &["label", "title"])
                        .unwrap_or_else(|| "Conversation".into())
                        .into(),
                    at: parse_timestamp(obj_str(&item, &["at"]).as_deref()),
                    pinned: obj_bool(&item, "pinned"),
                });
            }
            let today = jiff::civil::date(2026, 11, 14);
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            let (v3, nid3, nt3) = (view.clone(), nid.clone(), ntype.clone());
            ConversationList::new(eid, convs, today)
                .active(active, move |key, _, cx| {
                    emit_event(&v, &sk, &nt, "change", json!(key.to_string()), cx);
                })
                .actions(
                    move |key, _, cx| {
                        emit_event(
                            &v1,
                            &nid1,
                            &nt1,
                            "ely:action",
                            json!({ "rename": key.as_ref() }),
                            cx,
                        );
                    },
                    move |key, _, cx| {
                        emit_event(
                            &v2,
                            &nid2,
                            &nt2,
                            "ely:action",
                            json!({ "pin": key.as_ref() }),
                            cx,
                        );
                    },
                    move |key, _, cx| {
                        emit_event(
                            &v3,
                            &nid3,
                            &nt3,
                            "ely:action",
                            json!({ "delete": key.as_ref() }),
                            cx,
                        );
                    },
                )
                .into_any_element()
        }
        "chat/ErrorMessage" => {
            let title = non_empty_or(&best_title(node), "Something went wrong");
            let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
            let mut err = ErrorMessage::new(eid, title).on_retry(move |_, cx| {
                emit_event(&v, &nid, &nt, "ely:action", json!("retry"), cx);
            });
            if let Some(detail) = best_body(node) {
                err = err.detail(detail);
            }
            err.into_any_element()
        }
        "chat/FollowUpSuggestions" => {
            let mut qs: Vec<String> = extract_choices(node)
                .into_iter()
                .map(|c| c.label.to_string())
                .collect();
            if qs.is_empty() {
                qs.push("Tell me more".into());
            }
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            FollowUpSuggestions::new(eid, qs, move |ix, _, cx| {
                emit_event(&v, &sk, &nt, "change", json!(ix), cx);
            })
            .into_any_element()
        }
        "chat/ImageMessage" => {
            let src = prop_str(node, "url")
                .or_else(|| prop_str(node, "src"))
                .unwrap_or_else(|| "/assets/sample.svg".into());
            let w = safe_ratio(prop_f64(node, "width"), 400.0);
            let h = safe_ratio(prop_f64(node, "height"), 300.0);
            let (v, nid, nt, src_ev) = (view.clone(), nid.clone(), ntype.clone(), src.clone());
            let mut im = ImageMessage::new(eid, src, w, h).on_open(move |_, cx| {
                emit_event(&v, &nid, &nt, "click", json!(src_ev), cx);
            });
            if let Some(cap) = prop_str(node, "caption").filter(|s| !s.trim().is_empty()) {
                im = im.caption(cap);
            }
            im.into_any_element()
        }
        "chat/PromptInput" => {
            let ph = prop_str(node, "placeholder").unwrap_or_else(|| "Ask anything".into());
            let init = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_default();
            let field = keyed_text_input(&eid, "prompt", &ph, &init, true, window, cx);
            let (v, nid_s, nt) = (view.clone(), nid.clone(), ntype.clone());
            let f2 = field.clone();
            let mut pi =
                PromptInput::new(gpui::ElementId::from(eid.clone()), &field, move |_, cx| {
                    let text = f2.read(cx).text().to_owned();
                    emit_event(&v, &nid_s, &nt, "ely:action", json!({ "send": text }), cx);
                });
            for (ix, att) in arr_objs(node, "attachments").into_iter().enumerate() {
                let progress = att
                    .get("progress")
                    .and_then(value_to_f64)
                    .filter(|v| v.is_finite())
                    .map(|v| (v as f32).clamp(0.0, 1.0));
                pi = pi.above(AttachmentChip::new(
                    (gpui::ElementId::from(eid.clone()), format!("att-{ix}")),
                    Attachment {
                        key: obj_str(&att, &["value", "id"])
                            .unwrap_or_else(|| format!("att-{ix}"))
                            .into(),
                        name: obj_str(&att, &["name", "label"])
                            .unwrap_or_else(|| "file".into())
                            .into(),
                        bytes: att.get("bytes").and_then(Value::as_u64).unwrap_or(1024),
                        preview: None,
                        progress,
                    },
                ));
            }
            let cmds: Vec<Choice> = arr_objs(node, "commands")
                .into_iter()
                .enumerate()
                .map(|(ix, c)| {
                    let lbl =
                        obj_str(&c, &["label", "value"]).unwrap_or_else(|| format!("/cmd{ix}"));
                    let val = obj_str(&c, &["value", "label"]).unwrap_or_else(|| lbl.clone());
                    Choice::new(val, lbl)
                })
                .collect();
            if !cmds.is_empty() {
                let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
                pi = pi.commands(cmds, move |cmd, _, cx| {
                    emit_event(
                        &v,
                        &nid,
                        &nt,
                        "ely:action",
                        json!({ "command": cmd.as_ref() }),
                        cx,
                    );
                });
            }
            let ctxs: Vec<Choice> = arr_objs(node, "context")
                .into_iter()
                .enumerate()
                .map(|(ix, c)| {
                    let lbl =
                        obj_str(&c, &["label", "value"]).unwrap_or_else(|| format!("ctx{ix}"));
                    let val = obj_str(&c, &["value", "label"]).unwrap_or_else(|| lbl.clone());
                    Choice::new(val, lbl)
                })
                .collect();
            if !ctxs.is_empty() {
                let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
                pi = pi.context(ctxs, move |mention, _, cx| {
                    emit_event(
                        &v,
                        &nid,
                        &nt,
                        "ely:action",
                        json!({ "mention": mention.as_ref() }),
                        cx,
                    );
                });
            }
            pi.into_any_element()
        }
        "chat/QuoteReply" => {
            let author = prop_str(node, "quoteAuthor")
                .or_else(|| prop_str(node, "author"))
                .unwrap_or_else(|| "Author".into());
            let text = prop_str(node, "quote")
                .or_else(|| best_body(node))
                .unwrap_or_default();
            let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
            QuoteReply::new(eid, author, text)
                .on_remove(move |_, cx| {
                    emit_event(&v, &nid, &nt, "ely:action", json!("remove-quote"), cx);
                })
                .into_any_element()
        }
        "chat/SearchProgress" => {
            let steps: Vec<(String, StepState)> = extract_item_objects(node)
                .into_iter()
                .map(|item| {
                    (
                        obj_str(&item, &["label", "title"]).unwrap_or_else(|| "Searching".into()),
                        parse_step_state(obj_str(&item, &["state", "status"]).as_deref()),
                    )
                })
                .collect();
            SearchProgress::new(eid, steps).into_any_element()
        }
        "chat/SharedConversationView" => {
            let sharer = prop_str(node, "sharedBy")
                .or_else(|| prop_str(node, "author"))
                .unwrap_or_else(|| "User".into());
            let at = parse_timestamp(prop_str(node, "sharedAt").as_deref());
            let messages = render_message_bubbles(node, &eid);
            let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
            SharedConversationView::new(eid, sharer, at, messages)
                .on_continue(move |_, cx| {
                    emit_event(&v, &nid, &nt, "ely:action", json!("continue"), cx);
                })
                .into_any_element()
        }
        "chat/StreamingText" => {
            let paras: Vec<String> = node
                .props
                .get("paragraphs")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .map(ToOwned::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            let text = if !paras.is_empty() {
                paras.join("\n\n")
            } else {
                best_body(node).unwrap_or_default()
            };
            let live = prop_bool(node, "live")
                || prop_bool(node, "streaming")
                || prop_str(node, "status").as_deref() == Some("Streaming");
            StreamingText::new(eid, text, live).into_any_element()
        }
        "chat/ThinkingBlock" => {
            let reasoning = best_body(node).unwrap_or_default();
            let thinking = prop_bool(node, "thinking") || prop_bool(node, "streaming");
            let secs = prop_f64(node, "seconds")
                .filter(|v| v.is_finite() && *v >= 0.0)
                .unwrap_or(12.0) as u64;
            ThinkingBlock::new(eid, reasoning, thinking, Duration::from_secs(secs))
                .into_any_element()
        }
        "chat/WelcomeScreen" => {
            let hour = prop_f64(node, "hour")
                .filter(|v| v.is_finite() && *v >= 0.0)
                .map(|v| (v as u8).min(23))
                .unwrap_or(9);
            let mut ws = WelcomeScreen::new(gpui::ElementId::from(eid.clone()), hour);
            if let Some(name) = prop_str(node, "userName").filter(|s| !s.trim().is_empty()) {
                ws = ws.name(name);
            }
            let suggestions: Vec<(String, IconName)> = arr_objs(node, "suggestions")
                .into_iter()
                .map(|s| {
                    (
                        obj_str(&s, &["label", "value"]).unwrap_or_else(|| "Suggest".into()),
                        IconName::Sparkles,
                    )
                })
                .collect();
            if !suggestions.is_empty() {
                let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
                ws = ws.child(SuggestionChips::new(
                    (gpui::ElementId::from(eid), "chips"),
                    suggestions,
                    move |ix, _, cx| {
                        emit_event(&v, &sk, &nt, "change", json!(ix), cx);
                    },
                ));
            }
            ws.into_any_element()
        }

        // ---- collab ----
        "collab/Annotation" => {
            let mut text = String::new();
            let mut annotations = Vec::new();
            for part in arr_objs(node, "annotationParts") {
                let seg = obj_str(&part, &["text"]).unwrap_or_default();
                if seg.is_empty() {
                    continue;
                }
                let start = text.len();
                text.push_str(&seg);
                let end = text.len();
                if let Some(author_name) = obj_str(&part, &["author"]) {
                    let hue = part.get("hue").and_then(Value::as_u64).unwrap_or(0) as usize;
                    let key = obj_str(&part, &["id"]).unwrap_or_else(|| author_name.clone());
                    annotations.push(Annotation {
                        range: start..end,
                        author: Peer::new(key, author_name, hue),
                        note: obj_str(&part, &["note"]).map(Into::into),
                    });
                }
            }
            if text.is_empty() {
                text = best_body(node).unwrap_or_else(|| "Annotated text".into());
            }
            let picked = view_state
                .value(&state_key)
                .and_then(value_to_f64)
                .filter(|v| v.is_finite() && *v >= 0.0)
                .map(|v| v as usize);
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            AnnotatedText::new(eid, text, annotations)
                .picked(picked, move |ix, _, cx| {
                    emit_event(&v, &sk, &nt, "change", json!(ix), cx);
                })
                .into_any_element()
        }
        "collab/CommentSidebar" | "collab/CommentThread" => {
            let threads: Vec<Thread> = arr_objs(node, "threads")
                .into_iter()
                .enumerate()
                .filter_map(|(tix, t)| {
                    let key: SharedString = obj_str(&t, &["id", "key", "value"])
                        .unwrap_or_else(|| format!("thread-{tix}"))
                        .into();
                    let comments: Vec<Comment> = t
                        .get("comments")
                        .and_then(Value::as_array)
                        .map(|arr| {
                            arr.iter()
                                .filter_map(Value::as_object)
                                .enumerate()
                                .map(|(cix, c)| {
                                    let author_name =
                                        obj_str(c, &["author"]).unwrap_or_else(|| "User".into());
                                    let hue =
                                        c.get("hue").and_then(Value::as_u64).unwrap_or(0) as usize;
                                    let reactions = c
                                        .get("reactions")
                                        .and_then(Value::as_array)
                                        .map(|rs| {
                                            rs.iter()
                                                .filter_map(Value::as_object)
                                                .map(|r| Reaction {
                                                    emoji: obj_str(r, &["emoji", "value"])
                                                        .unwrap_or_else(|| "👍".into())
                                                        .into(),
                                                    count: r
                                                        .get("count")
                                                        .and_then(Value::as_u64)
                                                        .unwrap_or(1)
                                                        as usize,
                                                    mine: obj_bool(r, "mine"),
                                                })
                                                .collect()
                                        })
                                        .unwrap_or_default();
                                    Comment {
                                        author: Peer::new(
                                            obj_str(c, &["id"])
                                                .unwrap_or_else(|| format!("p-{tix}-{cix}")),
                                            author_name,
                                            hue,
                                        ),
                                        at: parse_timestamp(obj_str(c, &["at"]).as_deref()),
                                        body: obj_str(c, &["text", "body", "content"])
                                            .unwrap_or_default()
                                            .into(),
                                        reactions,
                                    }
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    if comments.is_empty() {
                        None
                    } else {
                        Some(Thread {
                            key,
                            quote: obj_str(&t, &["quote"]).map(Into::into),
                            comments,
                            resolved: obj_bool(&t, "resolved"),
                        })
                    }
                })
                .collect();
            let reply_field =
                keyed_text_input(&eid, "comment-reply", "Reply", "", false, window, cx);
            if kind == "collab/CommentThread" {
                let thread = threads.into_iter().next().unwrap_or_else(|| Thread {
                    key: "thread-0".into(),
                    quote: None,
                    comments: vec![Comment {
                        author: Peer::new("user", "User", 0),
                        at: Timestamp::UNIX_EPOCH,
                        body: best_body(node).unwrap_or_else(|| "Comment".into()).into(),
                        reactions: Vec::new(),
                    }],
                    resolved: false,
                });
                let (v1, nid1, nt1, rf) = (
                    view.clone(),
                    nid.clone(),
                    ntype.clone(),
                    reply_field.clone(),
                );
                let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
                let (v3, nid3, nt3) = (view.clone(), nid.clone(), ntype.clone());
                CommentThread::new(eid, thread)
                    .reply(&reply_field, move |_, cx| {
                        let text = rf.read(cx).text().to_owned();
                        emit_event(&v1, &nid1, &nt1, "ely:action", json!({ "reply": text }), cx);
                    })
                    .on_resolve(move |resolved, _, cx| {
                        emit_event(
                            &v2,
                            &nid2,
                            &nt2,
                            "ely:action",
                            json!({ "resolved": resolved }),
                            cx,
                        );
                    })
                    .on_react(move |ix, emoji, _, cx| {
                        emit_event(
                            &v3,
                            &nid3,
                            &nt3,
                            "ely:action",
                            json!({ "index": ix, "emoji": emoji.as_ref() }),
                            cx,
                        );
                    })
                    .into_any_element()
            } else {
                let active = view_state
                    .value(&state_key)
                    .and_then(Value::as_str)
                    .map(SharedString::from)
                    .or_else(|| prop_str(node, "activeThread").map(SharedString::from));
                let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
                let (v1, nid1, nt1, rf) = (
                    view.clone(),
                    nid.clone(),
                    ntype.clone(),
                    reply_field.clone(),
                );
                let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
                let (v3, nid3, nt3) = (view.clone(), nid.clone(), ntype.clone());
                CommentSidebar::new(eid, threads)
                    .active(active, move |key, _, cx| {
                        emit_event(&v, &sk, &nt, "change", json!(key.to_string()), cx);
                    })
                    .reply(&reply_field, move |_, cx| {
                        let text = rf.read(cx).text().to_owned();
                        emit_event(&v1, &nid1, &nt1, "ely:action", json!({ "reply": text }), cx);
                    })
                    .on_resolve(move |key, resolved, _, cx| {
                        emit_event(
                            &v2,
                            &nid2,
                            &nt2,
                            "ely:action",
                            json!({ "thread": key.as_ref(), "resolved": resolved }),
                            cx,
                        );
                    })
                    .on_react(move |key, ix, emoji, _, cx| {
                        emit_event(
                            &v3,
                            &nid3,
                            &nt3,
                            "ely:action",
                            json!({ "thread": key.as_ref(), "index": ix, "emoji": emoji.as_ref() }),
                            cx,
                        );
                    })
                    .into_any_element()
            }
        }
        "collab/PresenceAvatars" => {
            let peers: Vec<Peer> = arr_objs(node, "people")
                .into_iter()
                .enumerate()
                .map(|(ix, p)| {
                    let mut peer = Peer::new(
                        obj_str(&p, &["id", "key", "value"])
                            .unwrap_or_else(|| format!("peer-{ix}")),
                        obj_str(&p, &["name", "label"]).unwrap_or_else(|| "User".into()),
                        p.get("hue").and_then(Value::as_u64).unwrap_or(ix as u64) as usize,
                    );
                    peer.place = obj_str(&p, &["status", "place"]).map(Into::into);
                    peer
                })
                .collect();
            let max = prop_f64(node, "max")
                .filter(|v| v.is_finite() && *v >= 1.0)
                .map(|v| v as usize)
                .unwrap_or(4)
                .max(1);
            let following = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(SharedString::from);
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            PresenceAvatars::new(eid, peers)
                .max(max)
                .follow(following, move |key, _, cx| {
                    emit_event(&v, &sk, &nt, "change", json!(key.to_string()), cx);
                })
                .into_any_element()
        }
        "collab/ShareDialog" => {
            let title = prop_str(node, "documentTitle")
                .unwrap_or_else(|| non_empty_or(&best_title(node), "Document"));
            let open = dialog_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), &format!("Share “{title}”"));
            let (v_open, sk_open, nt_open) = (view.clone(), state_key.clone(), ntype.clone());
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .debug_selector({
                        let id = nid.clone();
                        move || format!("cat-dlg-open-{id}")
                    })
                    .variant(ButtonVariant::Secondary)
                    .disabled(prop_bool(node, "disabled"))
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &nt_open, "change", json!(true), cx);
                    }),
            );
            if open {
                let emails: Vec<String> = arr_objs(node, "invitees")
                    .into_iter()
                    .filter_map(|i| obj_str(&i, &["email"]))
                    .collect();
                let members: Vec<CollabMember> = arr_objs(node, "members")
                    .into_iter()
                    .map(|m| CollabMember {
                        name: obj_str(&m, &["name", "label"])
                            .unwrap_or_else(|| "Member".into())
                            .into(),
                        email: obj_str(&m, &["email"]).unwrap_or_default().into(),
                        picture: None,
                        role: parse_collab_role(obj_str(&m, &["role"]).as_deref()),
                        owner: obj_bool(&m, "owner"),
                    })
                    .collect();
                let share_url =
                    prop_str(node, "shareURL").unwrap_or_else(|| "https://example.com".into());
                let anyone = match prop_str(node, "linkAccess")
                    .map(|s| s.to_ascii_lowercase())
                    .as_deref()
                {
                    Some("restricted") | None => None,
                    Some(r) => Some(parse_collab_role(Some(r))),
                };
                let (v_close, sk_c, nid_c, nt_c) =
                    (view.clone(), state_key.clone(), nid.clone(), ntype.clone());
                let (v_ic, nid_ic, nt_ic) = (view.clone(), nid.clone(), ntype.clone());
                let (v_ii, nid_ii, nt_ii) = (view.clone(), nid.clone(), ntype.clone());
                let (v_ar, nid_ar, nt_ar) = (view.clone(), nid.clone(), ntype.clone());
                let (v_ax, nid_ax, nt_ax) = (view.clone(), nid.clone(), ntype.clone());
                let (v_la, nid_la, nt_la) = (view.clone(), nid.clone(), ntype.clone());
                stack = stack.child(
                    ShareDialog::new(gpui::ElementId::from(eid.clone()), title, move |_, cx| {
                        close_dialog_and_emit(&v_close, &sk_c, &nid_c, &nt_c, json!("close"), cx);
                    })
                    .invite(InviteInput::new(
                        (gpui::ElementId::from(eid.clone()), "invite"),
                        emails,
                        move |list, _, cx| {
                            let vals: Vec<String> = list.iter().map(|s| s.to_string()).collect();
                            emit_event(&v_ic, &nid_ic, &nt_ic, "change", json!(vals), cx);
                        },
                        move |_, cx| {
                            emit_event(&v_ii, &nid_ii, &nt_ii, "ely:action", json!("invite"), cx);
                        },
                    ))
                    .access(
                        AccessList::new((gpui::ElementId::from(eid.clone()), "access"), members)
                            .on_role(move |ix, role, _, cx| {
                                emit_event(
                                    &v_ar,
                                    &nid_ar,
                                    &nt_ar,
                                    "change",
                                    json!({ "memberIndex": ix, "role": collab_role_str(role) }),
                                    cx,
                                );
                            })
                            .on_remove(move |ix, _, cx| {
                                emit_event(
                                    &v_ax,
                                    &nid_ax,
                                    &nt_ax,
                                    "ely:action",
                                    json!({ "removeMember": ix }),
                                    cx,
                                );
                            }),
                    )
                    .link(LinkAccess::new(
                        (gpui::ElementId::from(eid), "link"),
                        share_url,
                        anyone,
                        move |role, _, cx| {
                            emit_event(
                                &v_la,
                                &nid_la,
                                &nt_la,
                                "change",
                                json!(role.map(collab_role_str)),
                                cx,
                            );
                        },
                    )),
                );
            }
            stack.into_any_element()
        }
        "collab/SuggestionMode" => {
            let raw = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "mode"));
            let mode = match raw.map(|s| s.to_ascii_lowercase()).as_deref() {
                Some("editing") => EditMode::Editing,
                Some("viewing") => EditMode::Viewing,
                _ => EditMode::Suggesting,
            };
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            SuggestionMode::new(eid, mode, move |next, _, cx| {
                let val = match next {
                    EditMode::Editing => "editing",
                    EditMode::Suggesting => "suggesting",
                    EditMode::Viewing => "viewing",
                };
                emit_event(&v, &sk, &nt, "change", json!(val), cx);
            })
            .into_any_element()
        }

        // ---- mail ----
        "mail/LabelPicker" => {
            let mut seen_keys = BTreeSet::new();
            let mut seen_names = BTreeSet::new();
            let mut labels = Vec::new();
            let mut selected_init = Vec::new();
            for (ix, item) in extract_item_objects(node).into_iter().enumerate() {
                let key =
                    obj_str(&item, &["value", "id", "key"]).unwrap_or_else(|| format!("lbl-{ix}"));
                let name =
                    obj_str(&item, &["label", "name"]).unwrap_or_else(|| format!("Label {ix}"));
                let lname = name.to_lowercase();
                if !seen_keys.insert(key.clone()) || !seen_names.insert(lname) {
                    continue;
                }
                if obj_bool(&item, "selected") {
                    selected_init.push(key.clone());
                }
                let hue = item.get("hue").and_then(Value::as_u64).unwrap_or(ix as u64) as usize;
                labels.push(MailLabel::new(key, name, hue));
            }
            let selected: Vec<String> = view_state
                .value(&state_key)
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .map(ToOwned::to_owned)
                        .collect()
                })
                .unwrap_or(selected_init);
            let (v1, sk, nt1) = (view.clone(), state_key.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            LabelPicker::new(eid, labels)
                .selected(selected)
                .on_change(move |vals, _, cx| {
                    let out: Vec<String> = vals.iter().map(|s| s.to_string()).collect();
                    emit_event(&v1, &sk, &nt1, "change", json!(out), cx);
                })
                .on_create(move |name, _, cx| {
                    emit_event(
                        &v2,
                        &nid2,
                        &nt2,
                        "ely:action",
                        json!({ "createLabel": name.as_ref() }),
                        cx,
                    );
                })
                .into_any_element()
        }
        "mail/MailComposer" => {
            let contacts: Vec<Contact> = arr_objs(node, "contacts")
                .into_iter()
                .filter_map(|c| {
                    let email = obj_str(&c, &["email", "address"])?;
                    let name = obj_str(&c, &["label", "name"]).unwrap_or_else(|| email.clone());
                    Some(Contact::new(name, email))
                })
                .collect();
            let files: Vec<Attachment> = arr_objs(node, "files")
                .into_iter()
                .enumerate()
                .map(|(ix, f)| Attachment {
                    key: obj_str(&f, &["value", "id"])
                        .unwrap_or_else(|| format!("file-{ix}"))
                        .into(),
                    name: obj_str(&f, &["name", "label"])
                        .unwrap_or_else(|| "attachment".into())
                        .into(),
                    bytes: f.get("bytes").and_then(Value::as_u64).unwrap_or(1024),
                    preview: None,
                    progress: None,
                })
                .collect();
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            let (v3, nid3, nt3) = (view.clone(), nid.clone(), ntype.clone());
            let (v4, nid4, nt4) = (view.clone(), nid.clone(), ntype.clone());
            let (v5, nid5, nt5) = (view.clone(), nid.clone(), ntype.clone());
            let mut mc = MailComposer::new(eid)
                .contacts(contacts)
                .files(files)
                .on_send(move |draft, _, cx| {
                    emit_event(
                        &v1,
                        &nid1,
                        &nt1,
                        "ely:action",
                        json!({ "send": draft.subject.as_ref() }),
                        cx,
                    );
                })
                .on_schedule(move |draft, at, _, cx| {
                    emit_event(
                        &v2,
                        &nid2,
                        &nt2,
                        "ely:action",
                        json!({ "schedule": at.to_string(), "subject": draft.subject.as_ref() }),
                        cx,
                    );
                })
                .on_discard(move |_, cx| {
                    emit_event(&v3, &nid3, &nt3, "ely:action", json!("discard"), cx);
                })
                .on_attach(move |_, cx| {
                    emit_event(&v4, &nid4, &nt4, "ely:action", json!("attach"), cx);
                })
                .on_remove(move |key, _, cx| {
                    emit_event(
                        &v5,
                        &nid5,
                        &nt5,
                        "ely:action",
                        json!({ "removeFile": key.as_ref() }),
                        cx,
                    );
                });
            if let Some(to) = prop_str(node, "to").filter(|s| !s.trim().is_empty()) {
                mc = mc.to([to]);
            }
            if let Some(subj) = prop_str(node, "subject").filter(|s| !s.trim().is_empty()) {
                mc = mc.subject(subj);
            }
            if let Some(sig) = prop_str(node, "signature").filter(|s| !s.trim().is_empty()) {
                mc = mc.signature(sig);
            }
            mc.into_any_element()
        }
        "mail/MailList" => {
            let mut seen_keys = BTreeSet::new();
            let mut mails = Vec::new();
            let mut selected_init = Vec::new();
            for (ix, item) in extract_item_objects(node).into_iter().enumerate() {
                let key =
                    obj_str(&item, &["value", "id", "key"]).unwrap_or_else(|| format!("mail-{ix}"));
                if !seen_keys.insert(key.clone()) {
                    continue;
                }
                if obj_bool(&item, "selected") {
                    selected_init.push(key.clone());
                }
                let from =
                    obj_str(&item, &["label", "from", "author"]).unwrap_or_else(|| "Sender".into());
                let subject =
                    obj_str(&item, &["title", "subject"]).unwrap_or_else(|| "Message".into());
                let mut mail = Mail::new(key, from, subject, parse_timestamp(None))
                    .unread(obj_bool(&item, "unread"))
                    .starred(obj_bool(&item, "starred"))
                    .attachments(
                        item.get("attachments").and_then(Value::as_u64).unwrap_or(0) as usize
                    );
                if let Some(snip) = obj_str(&item, &["content", "snippet"]) {
                    mail = mail.snippet(snip);
                }
                mails.push(mail);
            }
            let selected: Vec<String> = view_state
                .value(&state_key)
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .map(ToOwned::to_owned)
                        .collect()
                })
                .unwrap_or(selected_init);
            let (v1, sk, nt1) = (view.clone(), state_key.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            MailList::new(eid, mails)
                .selected(selected)
                .on_select(move |keys, _, cx| {
                    let vals: Vec<String> = keys.iter().map(|s| s.to_string()).collect();
                    emit_event(&v1, &sk, &nt1, "change", json!(vals), cx);
                })
                .on_star(move |key, starred, _, cx| {
                    emit_event(
                        &v2,
                        &nid2,
                        &nt2,
                        "ely:action",
                        json!({ "star": key.as_ref(), "starred": starred }),
                        cx,
                    );
                })
                .into_any_element()
        }
        "mail/MailReader" => {
            let subject = prop_str(node, "subject")
                .unwrap_or_else(|| non_empty_or(&best_title(node), "Message"));
            let from = Contact::new(
                prop_str(node, "from")
                    .or_else(|| prop_str(node, "author"))
                    .unwrap_or_else(|| "Sender".into()),
                prop_str(node, "email").unwrap_or_else(|| "sender@example.com".into()),
            );
            let mut msg = MailMessage::new(
                prop_str(node, "value").unwrap_or_else(|| "msg-1".into()),
                from,
                Timestamp::UNIX_EPOCH,
            );
            if let Some(to) = prop_str(node, "to").filter(|s| !s.trim().is_empty()) {
                msg = msg.to([Contact::new(to.clone(), to)]);
            }
            if let Some(cc) = prop_str(node, "cc").filter(|s| !s.trim().is_empty()) {
                msg = msg.cc([Contact::new(cc.clone(), cc)]);
            }
            for f in arr_objs(node, "files") {
                let name = obj_str(&f, &["name", "label"]).unwrap_or_else(|| "file".into());
                let bytes = f.get("bytes").and_then(Value::as_u64).unwrap_or(1024);
                msg = msg.file(name, bytes);
            }
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            let (v3, nid3, nt3) = (view.clone(), nid.clone(), ntype.clone());
            let mut reader = MailReader::new(eid, subject, msg)
                .on_reply(move |key, _, cx| {
                    emit_event(
                        &v1,
                        &nid1,
                        &nt1,
                        "ely:action",
                        json!({ "reply": key.as_ref() }),
                        cx,
                    );
                })
                .on_reply_all(move |key, _, cx| {
                    emit_event(
                        &v2,
                        &nid2,
                        &nt2,
                        "ely:action",
                        json!({ "replyAll": key.as_ref() }),
                        cx,
                    );
                })
                .on_forward(move |key, _, cx| {
                    emit_event(
                        &v3,
                        &nid3,
                        &nt3,
                        "ely:action",
                        json!({ "forward": key.as_ref() }),
                        cx,
                    );
                });
            let paras: Vec<String> = node
                .props
                .get("paragraphs")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .map(ToOwned::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            if !paras.is_empty() {
                for p in paras {
                    reader = reader.child(Paragraph::new(p));
                }
            } else if let Some(body) = best_body(node) {
                reader = reader.child(Paragraph::new(body));
            }
            reader.into_any_element()
        }
        "mail/MailThreadView" => {
            let subject = prop_str(node, "subject")
                .unwrap_or_else(|| non_empty_or(&best_title(node), "Thread"));
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            let mut tv = MailThreadView::new(eid, subject)
                .on_reply(move |key, _, cx| {
                    emit_event(
                        &v1,
                        &nid1,
                        &nt1,
                        "ely:action",
                        json!({ "reply": key.as_ref() }),
                        cx,
                    );
                })
                .on_forward(move |key, _, cx| {
                    emit_event(
                        &v2,
                        &nid2,
                        &nt2,
                        "ely:action",
                        json!({ "forward": key.as_ref() }),
                        cx,
                    );
                });
            let mut seen_keys = BTreeSet::new();
            let mut count = 0usize;
            for (ix, item) in extract_item_objects(node).into_iter().enumerate() {
                let key =
                    obj_str(&item, &["value", "id", "key"]).unwrap_or_else(|| format!("m-{ix}"));
                if !seen_keys.insert(key.clone()) {
                    continue;
                }
                let from = Contact::new(
                    obj_str(&item, &["label", "author"]).unwrap_or_else(|| "Sender".into()),
                    obj_str(&item, &["email"]).unwrap_or_else(|| "sender@example.com".into()),
                );
                let body = obj_str(&item, &["content", "text"]).unwrap_or_default();
                let mut msg = MailMessage::new(key, from, Timestamp::UNIX_EPOCH);
                if let Some(snip) = obj_str(&item, &["snippet"]) {
                    msg = msg.snippet(snip);
                }
                tv = tv.message(msg, Paragraph::new(body));
                count += 1;
            }
            if count == 0 {
                let msg = MailMessage::new(
                    "m-0",
                    Contact::new("Sender", "sender@example.com"),
                    Timestamp::UNIX_EPOCH,
                );
                tv = tv.message(msg, Paragraph::new(best_body(node).unwrap_or_default()));
            }
            tv.into_any_element()
        }
        "mail/MailboxList" => {
            let mut seen_sections = BTreeSet::new();
            let mut seen_keys = BTreeSet::new();
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            let mut list = MailboxList::new(eid).on_open(move |key, _, cx| {
                emit_event(&v, &sk, &nt, "change", json!(key.to_string()), cx);
            });
            let mut added_sections = 0usize;
            for (six, sec) in arr_objs(node, "sections").into_iter().enumerate() {
                let title =
                    obj_str(&sec, &["label", "title"]).unwrap_or_else(|| format!("Section {six}"));
                if !seen_sections.insert(title.clone()) {
                    continue;
                }
                let boxes: Vec<Mailbox> = sec
                    .get("items")
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter_map(Value::as_object)
                            .enumerate()
                            .filter_map(|(bix, b)| {
                                let key = obj_str(b, &["value", "id"])
                                    .unwrap_or_else(|| format!("box-{six}-{bix}"));
                                if !seen_keys.insert(key.clone()) {
                                    return None;
                                }
                                let name =
                                    obj_str(b, &["label", "name"]).unwrap_or_else(|| key.clone());
                                let unread =
                                    b.get("unread").and_then(Value::as_u64).unwrap_or(0) as u32;
                                let mb = if let Some(hue) = b.get("hue").and_then(Value::as_u64) {
                                    Mailbox::label(key, name, hue as usize)
                                } else {
                                    let icon = match key.as_str() {
                                        "starred" => IconName::Star,
                                        "snoozed" => IconName::Clock,
                                        "sent" => IconName::Send,
                                        "drafts" => IconName::File,
                                        "archive" => IconName::Archive,
                                        "trash" => IconName::Trash2,
                                        _ => IconName::Inbox,
                                    };
                                    Mailbox::new(key, name, icon)
                                };
                                Some(mb.unread(unread))
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                if !boxes.is_empty() {
                    list = list.section(title, boxes);
                    added_sections += 1;
                }
            }
            if added_sections == 0 {
                let boxes: Vec<Mailbox> = extract_item_objects(node)
                    .into_iter()
                    .enumerate()
                    .filter_map(|(ix, b)| {
                        let key =
                            obj_str(&b, &["value", "id"]).unwrap_or_else(|| format!("box-{ix}"));
                        if !seen_keys.insert(key.clone()) {
                            return None;
                        }
                        let name = obj_str(&b, &["label", "name"]).unwrap_or_else(|| key.clone());
                        Some(Mailbox::new(key, name, IconName::Inbox))
                    })
                    .collect();
                if !boxes.is_empty() {
                    list = list.section("Mailboxes", boxes);
                } else {
                    list = list.section(
                        "Mailboxes",
                        [Mailbox::new("inbox", "Inbox", IconName::Inbox)],
                    );
                }
            }
            if let Some(open) = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
            {
                list = list.open(open);
            }
            list.into_any_element()
        }
        "mail/ScheduleSend" => {
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, sk, nt2) = (view.clone(), state_key.clone(), ntype.clone());
            ScheduleSend::new(eid)
                .disabled(prop_bool(node, "disabled"))
                .on_send(move |_, cx| {
                    emit_event(&v1, &nid1, &nt1, "ely:action", json!("send"), cx);
                })
                .on_schedule(move |at, _, cx| {
                    emit_event(&v2, &sk, &nt2, "change", json!(at.to_string()), cx);
                })
                .into_any_element()
        }
        "mail/SignatureEditor" => {
            let text = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
                .unwrap_or_default();
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            SignatureEditor::new(eid, text)
                .on_change(move |val, _, cx| {
                    emit_event(&v, &sk, &nt, "change", json!(val.to_string()), cx);
                })
                .into_any_element()
        }
        "mail/SnoozePicker" => {
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            SnoozePicker::new(eid)
                .on_snooze(move |at, _, cx| {
                    emit_event(&v, &sk, &nt, "change", json!(at.to_string()), cx);
                })
                .into_any_element()
        }

        // ---- messaging ----
        "messaging/CallControls" => {
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            let (v3, nid3, nt3) = (view.clone(), nid.clone(), ntype.clone());
            let (v4, nid4, nt4) = (view.clone(), nid.clone(), ntype.clone());
            CallControls::new(eid)
                .mic(prop_bool(node, "mic"), move |on, _, cx| {
                    emit_event(&v1, &nid1, &nt1, "change", json!({ "mic": on }), cx);
                })
                .camera(prop_bool(node, "camera"), move |on, _, cx| {
                    emit_event(&v2, &nid2, &nt2, "change", json!({ "camera": on }), cx);
                })
                .share(prop_bool(node, "share"), move |on, _, cx| {
                    emit_event(&v3, &nid3, &nt3, "change", json!({ "share": on }), cx);
                })
                .on_leave(move |_, cx| {
                    emit_event(&v4, &nid4, &nt4, "ely:action", json!("leave"), cx);
                })
                .into_any_element()
        }
        "messaging/ChannelHeader" => {
            let name = non_empty_or(&best_title(node), "# general");
            let mut hdr = ChannelHeader::new(eid, name);
            if prop_bool(node, "private") {
                hdr = hdr.private();
            }
            if let Some(topic) = best_body(node).filter(|s| !s.trim().is_empty()) {
                hdr = hdr.topic(topic);
            }
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            let (v3, nid3, nt3) = (view.clone(), nid.clone(), ntype.clone());
            hdr.members(
                prop_f64(node, "members")
                    .map(|n| n.max(0.0) as usize)
                    .unwrap_or(12),
                move |_, cx| emit_event(&v1, &nid1, &nt1, "ely:action", json!("members"), cx),
            )
            .pins(
                prop_f64(node, "pins")
                    .map(|n| n.max(0.0) as usize)
                    .unwrap_or(3),
                move |_, cx| emit_event(&v2, &nid2, &nt2, "ely:action", json!("pins"), cx),
            )
            .on_call(move |_, cx| {
                emit_event(&v3, &nid3, &nt3, "ely:action", json!("call"), cx);
            })
            .into_any_element()
        }
        "messaging/ChannelItem" => {
            let items = extract_item_objects(node);
            if items.is_empty() {
                let mut item = ChannelItem::new(eid, non_empty_or(&best_label(node), "general"))
                    .unread(
                        prop_f64(node, "unread")
                            .map(|n| n.max(0.0) as u32)
                            .unwrap_or(0),
                    )
                    .muted(prop_bool(node, "muted"))
                    .pinned(prop_bool(node, "pinned"));
                if prop_bool(node, "private") {
                    item = item.private();
                }
                item.into_any_element()
            } else {
                let mut col = v_stack().gap_1();
                for (ix, it) in items.iter().enumerate() {
                    let name = obj_str(it, &["label", "name"]).unwrap_or_else(|| "channel".into());
                    let mut item = ChannelItem::new(
                        (gpui::ElementId::from(eid.clone()), format!("ch-{ix}")),
                        name,
                    )
                    .unread(it.get("unread").and_then(Value::as_u64).unwrap_or(0) as u32)
                    .muted(obj_bool(it, "muted"))
                    .pinned(obj_bool(it, "pinned"));
                    if obj_bool(it, "private") {
                        item = item.private();
                    }
                    col = col.child(item);
                }
                col.into_any_element()
            }
        }
        "messaging/ChannelList" => {
            let mut seen_sections = BTreeSet::new();
            let mut seen_keys = BTreeSet::new();
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            let mut list = ChannelList::new(eid.clone()).on_open(move |key, _, cx| {
                emit_event(&v, &sk, &nt, "change", json!(key.to_string()), cx);
            });
            let mut added_sections = 0usize;
            for (six, sec) in arr_objs(node, "sections").into_iter().enumerate() {
                let title =
                    obj_str(&sec, &["label", "title"]).unwrap_or_else(|| format!("Section {six}"));
                if !seen_sections.insert(title.clone()) {
                    continue;
                }
                let rows: Vec<(String, ChatRow)> = sec
                    .get("items")
                    .and_then(Value::as_array)
                    .map(|arr| {
                        arr.iter()
                            .filter_map(Value::as_object)
                            .enumerate()
                            .filter_map(|(rix, r)| {
                                let key = obj_str(r, &["value", "id"])
                                    .unwrap_or_else(|| format!("ch-{six}-{rix}"));
                                if !seen_keys.insert(key.clone()) {
                                    return None;
                                }
                                let name =
                                    obj_str(r, &["label", "name"]).unwrap_or_else(|| key.clone());
                                let unread =
                                    r.get("unread").and_then(Value::as_u64).unwrap_or(0) as u32;
                                let row: ChatRow = if r.contains_key("presence") {
                                    DirectMessageItem::new(
                                        (gpui::ElementId::from(eid.clone()), format!("dm-{key}")),
                                        name,
                                        parse_presence(obj_str(r, &["presence"]).as_deref()),
                                    )
                                    .unread(unread)
                                    .into()
                                } else {
                                    let mut ch = ChannelItem::new(
                                        (gpui::ElementId::from(eid.clone()), format!("ch-{key}")),
                                        name,
                                    )
                                    .unread(unread)
                                    .muted(obj_bool(r, "muted"))
                                    .pinned(obj_bool(r, "pinned"));
                                    if obj_bool(r, "private") {
                                        ch = ch.private();
                                    }
                                    ch.into()
                                };
                                Some((key, row))
                            })
                            .collect()
                    })
                    .unwrap_or_default();
                if !rows.is_empty() {
                    list = list.section(title, rows);
                    added_sections += 1;
                }
            }
            if added_sections == 0 {
                let rows: Vec<(String, ChatRow)> = extract_item_objects(node)
                    .into_iter()
                    .enumerate()
                    .filter_map(|(ix, r)| {
                        let key =
                            obj_str(&r, &["value", "id"]).unwrap_or_else(|| format!("ch-{ix}"));
                        if !seen_keys.insert(key.clone()) {
                            return None;
                        }
                        let name = obj_str(&r, &["label", "name"]).unwrap_or_else(|| key.clone());
                        Some((
                            key.clone(),
                            ChannelItem::new(
                                (gpui::ElementId::from(eid.clone()), format!("ch-{key}")),
                                name,
                            )
                            .into(),
                        ))
                    })
                    .collect();
                if !rows.is_empty() {
                    list = list.section("Channels", rows);
                } else {
                    list = list.section(
                        "Channels",
                        [(
                            "general".to_string(),
                            ChannelItem::new((gpui::ElementId::from(eid), "ch-general"), "general"),
                        )],
                    );
                }
            }
            if let Some(open) = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
            {
                list = list.open(open);
            }
            list.into_any_element()
        }
        "messaging/ChatMessage" => {
            let author = prop_str(node, "author").unwrap_or_else(|| "User".into());
            let content = best_body(node).unwrap_or_default();
            ChatMessage::new(eid, author, Timestamp::UNIX_EPOCH)
                .child(Paragraph::new(content))
                .into_any_element()
        }
        "messaging/GifPicker" => {
            let gifs = if prop_bool(node, "loading") {
                Gifs::Loading
            } else {
                let mut seen = BTreeSet::new();
                let items: Vec<Gif> = extract_item_objects(node)
                    .into_iter()
                    .enumerate()
                    .filter_map(|(ix, g)| {
                        let key = obj_str(&g, &["value", "id", "key"])
                            .unwrap_or_else(|| format!("gif-{ix}"));
                        if !seen.insert(key.clone()) {
                            return None;
                        }
                        let title =
                            obj_str(&g, &["label", "title"]).unwrap_or_else(|| "GIF".into());
                        let url = obj_str(&g, &["url", "src"])
                            .unwrap_or_else(|| "/assets/sample.svg".into());
                        let ratio = safe_ratio(g.get("ratio").and_then(value_to_f64), 1.5);
                        Some(Gif::new(key, title, image_source(&url), ratio))
                    })
                    .collect();
                Gifs::Found(items)
            };
            let cats: Vec<String> = node
                .props
                .get("categories")
                .and_then(Value::as_array)
                .map(|arr| {
                    arr.iter()
                        .filter_map(Value::as_str)
                        .map(ToOwned::to_owned)
                        .collect()
                })
                .unwrap_or_default();
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, sk, nt2) = (view.clone(), state_key.clone(), ntype.clone());
            GifPicker::new(eid, gifs)
                .categories(cats)
                .on_query(move |q, _, cx| {
                    emit_event(
                        &v1,
                        &nid1,
                        &nt1,
                        "ely:action",
                        json!({ "query": q.as_ref() }),
                        cx,
                    );
                })
                .on_pick(move |key, _, cx| {
                    emit_event(&v2, &sk, &nt2, "change", json!(key.to_string()), cx);
                })
                .into_any_element()
        }
        "messaging/IncomingCallDialog" => {
            let caller = prop_str(node, "caller")
                .or_else(|| prop_str(node, "author"))
                .unwrap_or_else(|| non_empty_or(&best_title(node), "Caller"));
            let open = dialog_open(view_state, &state_key, node);
            let label = non_empty_or(&best_label(node), &format!("Incoming call: {caller}"));
            let (v_open, sk_open, nt_open) = (view.clone(), state_key.clone(), ntype.clone());
            let mut stack = v_stack().gap_2().child(
                Button::new(SharedString::from(format!("{eid}-open")), label)
                    .debug_selector({
                        let id = nid.clone();
                        move || format!("cat-dlg-open-{id}")
                    })
                    .variant(ButtonVariant::Secondary)
                    .disabled(prop_bool(node, "disabled"))
                    .on_click(move |_, _, cx| {
                        emit_event(&v_open, &sk_open, &nt_open, "change", json!(true), cx);
                    }),
            );
            if open {
                let (v1, sk1, nid1, nt1) =
                    (view.clone(), state_key.clone(), nid.clone(), ntype.clone());
                let (v2, sk2, nid2, nt2) =
                    (view.clone(), state_key.clone(), nid.clone(), ntype.clone());
                let mut dlg = IncomingCallDialog::new(
                    eid,
                    caller,
                    move |_, cx| {
                        close_dialog_and_emit(&v1, &sk1, &nid1, &nt1, json!("accept"), cx);
                    },
                    move |_, cx| {
                        close_dialog_and_emit(&v2, &sk2, &nid2, &nt2, json!("decline"), cx);
                    },
                );
                if prop_bool(node, "video")
                    || best_body(node).is_some_and(|b| b.to_ascii_lowercase().contains("video"))
                {
                    dlg = dlg.video();
                }
                stack = stack.child(dlg);
            }
            stack.into_any_element()
        }
        "messaging/MemberList" => {
            let mut seen = BTreeSet::new();
            let members: Vec<MsgMember> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .filter_map(|(ix, m)| {
                    let key =
                        obj_str(&m, &["value", "id", "key"]).unwrap_or_else(|| format!("mem-{ix}"));
                    if !seen.insert(key.clone()) {
                        return None;
                    }
                    let name = obj_str(&m, &["label", "name"]).unwrap_or_else(|| "Member".into());
                    let presence = parse_presence(obj_str(&m, &["presence"]).as_deref());
                    let mut mem = MsgMember::new(key, name, presence);
                    if let Some(role) = obj_str(&m, &["role", "jobTitle"]) {
                        mem = mem.role(role);
                    }
                    if let Some(st) = obj_str(&m, &["statusText"]) {
                        mem = mem.status(st);
                    }
                    Some(mem)
                })
                .collect();
            let (v1, sk, nt1) = (view.clone(), state_key.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            let mut ml = MemberList::new(eid, members)
                .on_select(move |key, _, cx| {
                    emit_event(&v1, &sk, &nt1, "change", json!(key.to_string()), cx);
                })
                .on_activate(move |key, _, cx| {
                    emit_event(&v2, &nid2, &nt2, "ely:action", json!(key.to_string()), cx);
                });
            if let Some(sel) = view_state
                .value(&state_key)
                .and_then(Value::as_str)
                .map(ToOwned::to_owned)
                .or_else(|| prop_str(node, "value"))
            {
                ml = ml.selected(sel);
            }
            ml.into_any_element()
        }
        "messaging/MessageThread" => {
            let count = prop_f64(node, "count")
                .filter(|v| v.is_finite() && *v >= 1.0)
                .map(|v| v as usize)
                .unwrap_or_else(|| extract_item_objects(node).len().max(1));
            let repliers: Vec<Avatar> = arr_objs(node, "repliers")
                .into_iter()
                .take(count)
                .enumerate()
                .map(|(ix, r)| {
                    Avatar::new(
                        (gpui::ElementId::from(eid.clone()), format!("rep-{ix}")),
                        obj_str(&r, &["label", "name"]).unwrap_or_else(|| "User".into()),
                    )
                })
                .collect();
            let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
            MessageThread::new(eid, count, Timestamp::UNIX_EPOCH)
                .repliers(repliers)
                .on_open(move |_, cx| {
                    emit_event(&v, &nid, &nt, "click", json!("open-thread"), cx);
                })
                .into_any_element()
        }
        "messaging/OnlineStatus" => {
            let p = prop_str(node, "presence").or_else(|| prop_str(node, "status"));
            OnlineStatus::new(parse_presence(p.as_deref())).into_any_element()
        }
        "messaging/ParticipantTile" => {
            let name = prop_str(node, "author")
                .filter(|s| !s.trim().is_empty())
                .unwrap_or_else(|| non_empty_or(&best_title(node), "Participant"));
            let ratio = safe_ratio(prop_f64(node, "ratio"), 16.0 / 9.0);
            let mut tile = ParticipantTile::new(eid, name, ratio)
                .muted(prop_bool(node, "muted"))
                .speaking(prop_bool(node, "speaking"));
            if let Some(url) = prop_str(node, "url").filter(|s| !s.trim().is_empty()) {
                tile = tile.picture(image_source(&url));
            }
            tile.into_any_element()
        }
        "messaging/PinnedMessages" => {
            let mut seen = BTreeSet::new();
            let pins: Vec<PinnedMessage> = extract_item_objects(node)
                .into_iter()
                .enumerate()
                .filter_map(|(ix, p)| {
                    let key =
                        obj_str(&p, &["value", "id", "key"]).unwrap_or_else(|| format!("pin-{ix}"));
                    if !seen.insert(key.clone()) {
                        return None;
                    }
                    Some(PinnedMessage {
                        key: key.into(),
                        author: obj_str(&p, &["author"])
                            .unwrap_or_else(|| "User".into())
                            .into(),
                        at: parse_timestamp(obj_str(&p, &["at"]).as_deref()),
                        text: obj_str(&p, &["label", "text", "content"])
                            .unwrap_or_default()
                            .into(),
                    })
                })
                .collect();
            let (v1, nid1, nt1) = (view.clone(), nid.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            PinnedMessages::new(eid, pins)
                .on_open(move |key, _, cx| {
                    emit_event(
                        &v1,
                        &nid1,
                        &nt1,
                        "ely:action",
                        json!({ "open": key.as_ref() }),
                        cx,
                    );
                })
                .on_unpin(move |key, _, cx| {
                    emit_event(
                        &v2,
                        &nid2,
                        &nt2,
                        "ely:action",
                        json!({ "unpin": key.as_ref() }),
                        cx,
                    );
                })
                .into_any_element()
        }
        "messaging/ReadReceipt" => {
            let delivery = match prop_str(node, "status")
                .map(|s| s.to_ascii_lowercase())
                .as_deref()
            {
                Some("sent") => Delivery::Sent,
                Some("delivered") => Delivery::Delivered,
                Some("read") => Delivery::Read,
                _ => Delivery::Sending,
            };
            let mut rr = ReadReceipt::new(delivery);
            if delivery == Delivery::Read {
                let readers: Vec<Avatar> = arr_objs(node, "readers")
                    .into_iter()
                    .enumerate()
                    .map(|(ix, r)| {
                        Avatar::new(
                            (gpui::ElementId::from(eid.clone()), format!("rd-{ix}")),
                            obj_str(&r, &["label", "name"]).unwrap_or_else(|| "Reader".into()),
                        )
                    })
                    .collect();
                rr = rr.readers(readers);
            }
            rr.into_any_element()
        }
        "messaging/ScreenShareView" => {
            let presenter = prop_str(node, "presenter").unwrap_or_else(|| "Presenter".into());
            let ratio = safe_ratio(prop_f64(node, "ratio"), 16.0 / 10.0);
            let mut sv = ScreenShareView::new(eid, presenter, ratio);
            if let Some(url) = prop_str(node, "url").filter(|s| !s.trim().is_empty()) {
                sv = sv.frame(image_source(&url));
            }
            if prop_bool(node, "selfShare") || prop_bool(node, "presenting") {
                let (v, nid, nt) = (view.clone(), nid.clone(), ntype.clone());
                sv = sv.on_stop(move |_, cx| {
                    emit_event(&v, &nid, &nt, "ely:action", json!("stop-share"), cx);
                });
            }
            sv.into_any_element()
        }
        "messaging/StatusSetter" => {
            let parse_clear = |raw: Option<&str>| -> ClearAfter {
                match raw {
                    Some("Don't clear") => ClearAfter::Never,
                    Some("30 minutes") => ClearAfter::ThirtyMinutes,
                    Some("1 hour") => ClearAfter::OneHour,
                    Some("4 hours") => ClearAfter::FourHours,
                    Some("This week") => ClearAfter::ThisWeek,
                    _ => ClearAfter::Today,
                }
            };
            let suggestions: Vec<MsgStatus> = arr_objs(node, "suggestions")
                .into_iter()
                .map(|s| MsgStatus {
                    emoji: obj_str(&s, &["emoji"]).map(Into::into),
                    text: obj_str(&s, &["label", "text"]).unwrap_or_default().into(),
                    clear: parse_clear(obj_str(&s, &["clearAfter"]).as_deref()),
                })
                .collect();
            let (v1, sk, nt1) = (view.clone(), state_key.clone(), ntype.clone());
            let (v2, nid2, nt2) = (view.clone(), nid.clone(), ntype.clone());
            let mut setter = StatusSetter::new(eid)
                .suggestions(suggestions)
                .on_save(move |st, _, cx| {
                    emit_event(
                        &v1,
                        &sk,
                        &nt1,
                        "change",
                        json!({
                            "emoji": st.emoji.as_deref(),
                            "text": st.text.as_ref(),
                            "clear": st.clear.label(),
                        }),
                        cx,
                    );
                })
                .on_clear(move |_, cx| {
                    emit_event(&v2, &nid2, &nt2, "ely:action", json!("clear-status"), cx);
                });
            if let Some(val) = prop_str(node, "value").filter(|s| !s.trim().is_empty()) {
                setter = setter.status(MsgStatus {
                    emoji: prop_str(node, "emoji")
                        .filter(|s| !s.trim().is_empty())
                        .map(Into::into),
                    text: val.into(),
                    clear: parse_clear(prop_str(node, "clearAfter").as_deref()),
                });
            }
            setter.into_any_element()
        }
        "messaging/StickerPicker" => {
            let mut seen_packs = BTreeSet::new();
            let mut seen_keys = BTreeSet::new();
            let mut packs: Vec<StickerPack> = arr_objs(node, "packs")
                .into_iter()
                .enumerate()
                .filter_map(|(pix, p)| {
                    let name =
                        obj_str(&p, &["label", "name"]).unwrap_or_else(|| format!("Pack {pix}"));
                    if !seen_packs.insert(name.clone()) {
                        return None;
                    }
                    let stickers: Vec<Sticker> = p
                        .get("items")
                        .and_then(Value::as_array)
                        .map(|arr| {
                            arr.iter()
                                .filter_map(Value::as_object)
                                .enumerate()
                                .filter_map(|(six, s)| {
                                    let key = obj_str(s, &["value", "id"])
                                        .unwrap_or_else(|| format!("st-{pix}-{six}"));
                                    if !seen_keys.insert(key.clone()) {
                                        return None;
                                    }
                                    let label = obj_str(s, &["label", "name"])
                                        .unwrap_or_else(|| key.clone());
                                    let url = obj_str(s, &["url", "src"])
                                        .unwrap_or_else(|| "/assets/sample.svg".into());
                                    Some(Sticker::new(key, label, image_source(&url)))
                                })
                                .collect()
                        })
                        .unwrap_or_default();
                    Some(StickerPack::new(name, stickers))
                })
                .collect();
            if packs.is_empty() {
                packs.push(StickerPack::new(
                    "Stickers",
                    [Sticker::new(
                        "smile",
                        "Smile",
                        image_source("/assets/sample.svg"),
                    )],
                ));
            }
            let (v, sk, nt) = (view.clone(), state_key.clone(), ntype.clone());
            StickerPicker::new(eid, packs)
                .on_pick(move |key, _, cx| {
                    emit_event(&v, &sk, &nt, "change", json!(key.to_string()), cx);
                })
                .into_any_element()
        }

        _ => return None,
    };

    Some(el)
}
