# Native profile protocol v1

This is the implementation contract shared by the Go, SwiftUI and Compose example.
The transport is JSON over HTTP; no HTML, JavaScript, expressions, asset URLs or
remote action URLs are accepted by a native renderer. The API base URL is host
configuration. The example is loopback-only demo authentication.

## Requests

GET `/native/profile?protocolVersion=1&requestID=<UUID>&capabilities=region,form,stack,text,input,button,notice`
loads the screen and establishes an HttpOnly demo session cookie. Native clients
must retain/send the cookie (URLSession and a Java CookieManager respectively).
An existing valid cookie retains the profile. The response contains a separate
non-secret screen sessionID and csrfToken. POST `/native/profile` sends
`Content-Type: application/json` and `X-CSRF-Token: <csrfToken>`.

```
{
  "protocolVersion":"1", "screenID":"profile", "screenRevision":"<opaque>",
  "sessionID":"<from load>", "requestID":"<new UUID, reuse exact request on retry>",
  "dataVersion":0, "nodeID":"profile-form", "event":"submit",
  "action":"save-profile", "target":"profile-region",
  "fields":{"displayName":"Alice"}, "editRevisions":{"displayName":1},
  "capabilities":["region","form","stack","text","input","button","notice"]
}
```

This example request is the legacy single-field form. Only the registered action
tuple and the exact field set declared by the host screen are allowed. The
expanded controls demo additionally declares company, notifications, digestConsent and colorTheme. A request ID reused
with changed content fails. Session auth, CSRF, action permission and revision
checks are server-owned. A new mutation needs the current dataVersion; an exact
retry is replayed before checking its old dataVersion. In-memory business replay
and mutation are atomic in this demo, bounded to the session lifetime/capacity;
production requires a durable transactional store.

## Response

Both load and action replies use this envelope (HTTP 200 ready/saved, 422 invalid,
409 conflict). Other HTTP errors contain `{ "error": {"code":"...","message":"..."} }`.

```
{
  "protocolVersion":"1", "screenID":"profile", "screenRevision":"<opaque>",
  "sessionID":"<opaque>", "requestID":"<echo>", "dataVersion":0,
  "status":"ready", "csrfToken":"<token>",
  "requiredCapabilities":["region","form","stack","text","input","button","notice"],
  "region":{"id":"profile-region","type":"region","props":{"label":"Profile"},"children":[]},
  "fields":{"displayName":"Ada"}, "acknowledgedEdits":{}, "errors":{},
  "message":"Edit your display name."
}
```

The example clients require exactly one profile region, one registered submit
form, one input, switch, checkbox or select control per declared field, and at least one submit
button. The legacy screen declares only displayName; the expanded demo declares
five fields. This registered-action validation is not a universal native SDUI runtime. The Go
projection can resolve repeated text/layout nodes, but the clients never imply
support for every combination in the web catalogue.

A node has stable `id`, `type`, a `props` object, optional `children` and optional
`events` (`on`, `action`, `target`). Only `form` / `submit` is supported
in this v1 profile contract; input changes stay local and button click/reset
actions are not supported. Values, conditions, templates and stable-key
repeats are resolved by Go. Clients never evaluate bindings. Structural types:
region/form/stack. Leaves: text, ordinary text input, switch, checkbox, select, button, notice. The projection accepts only the canonical DefaultRegistry property contracts
(and equivalent definitions in CatalogueRegistry), not arbitrary registered
components with similar names. Properties retain existing SDUI lower-camel
names; native input supports only type=text. Form submit actions are inherited by a button with type=submit.
Unsupported node types, protocol versions or required capabilities produce a
visible native fallback, never a WebView. Switch support requires the optional
`switch` capability; checkbox and select have their own optional capabilities. Other catalogue controls remain unsupported.

## Client state and response acceptance

`screenRevision` identifies the definition; `dataVersion` is the server mutation
version; each local field has an independent monotonically increasing edit
revision. Keep `draft` separate from the authoritative baseline `fields`.

- Only one save is in flight. Editing remains possible while it runs.
- Capture all submitted edit revisions/values in the pending request. A network
  failure retains that exact request for a Retry button, including requestID.
- Accept a response only for the currently pending requestID and current
  sessionID/screenID; never apply an older dataVersion. Reject malformed or
  unsupported responses before replacing the tree. Full-region replacement only.
- On ready, initialize baseline and drafts. On saved, update baseline and adopt
  canonical server values only for fields whose current local edit revision
  equals acknowledgedEdits. Newer edits must survive the earlier save response.
- On invalid/conflict, preserve all drafts. Display field errors only if the
  local edit revision still equals that request's acknowledgedEdits; later edits
  clear stale errors. Baseline updates from the authoritative fields.
- A 409 keeps drafts and displays the message; the returned revision/version
  may be used for the next explicit save. A hard auth/protocol failure keeps
  drafts and exposes an explicit reload/error path. Reload is explicit, with
  draft discard clearly explained; it is never triggered automatically.
- During IME composition no network event is sent; text edits are local. Preserve
  stable control identity/focus across the replacement and use native labels,
  error/status accessibility semantics and disabled/loading save feedback.

Required limits: 1 MiB response, 1000 nodes, depth 32, unique stable IDs; validate
before rendering. Unknown JSON object members may be ignored for forward
compatibility; unknown required types/capabilities may not.

## Multi-field and switch extension

Protocol version remains `1`. `switch` is an optional negotiated capability;
legacy profile envelopes keep their original required capabilities and field set.
An envelope may declare 1–64 fields with names matching
`^[A-Za-z][A-Za-z0-9_]{0,63}$` and values of at most 16,384 UTF-8 bytes. Each field
must have exactly one input, switch, checkbox or select control inside the registered form.
Unknown, duplicate, missing or unbound fields fail closed. Error and acknowledged
revision keys must belong to declared fields; non-ready replies acknowledge every
submitted field. A save response cannot change its field set; reload is required.

Switch nodes use the existing core `switch` schema (`name`, `label`, `checked`,
`disabled`, optional `value`). Authoritative `fields[name]` and local drafts drive
the control; boolean values must be the strings `true` or `false`. A switch edit
increments only that field's local revision. No change event sends a request.
Disabled controls do not permit edits. Saves, retries, invalid responses and
late responses preserve per-field drafts under the same reconciliation rules.

The action allowlist remains `profile` / `profile-form` / `submit` /
`save-profile` / `profile-region`. Additional fields are declared by the host's
screen, and the host must validate the exact allowed field set and value modes.
The expanded Go demo validates and atomically persists displayName, company,
notifications, digestConsent and colorTheme; the legacy demo continues accepting only displayName.

## Checkbox and single-selection extension

`checkbox` and `select` are optional negotiated capabilities in protocol `1`.
The default seven-type profile is unchanged; the controls demo now declares five
fields. A checkbox follows the switch's canonical `"true"`/`"false"` field values,
with `name`, `label`, `checked`, `disabled` and optional `value` properties. It is
a two-state control; indeterminate, readonly and required modes are unsupported.

A select has `name`, `label`, optional `value` and `disabled`, and a required
`options` array of 1–64 closed `{ "value": "dark", "label": "Dark" }` records.
Option values and labels are nonempty strings bounded to 16,384 UTF-8 bytes;
values must be unique. The authoritative field value must match an option.
Checkbox and select property objects are closed. Multiple selection, placeholders
and option-level selected/disabled flags are unsupported. Values and checked properties describe the resolved baseline; the
renderers always bind to their revision-aware local drafts.

Changing a field's control type, supported mode or selection options during a
save is rejected before replacing the visible screen. Existing drafts remain
available and an explicit reload is required. This prevents a newer selection
from being silently discarded when an older response replaces the region.
Checkbox and picker edits are local until explicit form submission. The host
validates every submitted selection and commits all five fields atomically.
The JSON schema checks option shape and bounds; unique option values, field to
option membership, UTF-8 byte limits and cross-response compatibility are
additionally checked in code.

## Native layout and notice semantics

Within the supported profile subset, stack `align` defaults to `stretch` and
applies on the cross axis: column item containers fill the available width, while
row item containers fill the tallest child's height. Text glyphs and fixed-size
controls retain their own natural drawing size within those containers. `start`, `center` and `end` retain
natural cross-axis sizes. Row children are not assigned equal widths. Gap tokens
remain `none` / `xs` / `sm` / `md` / `lg` (0 / 4 / 8 / 16 / 24 native points or dp).
Native controls retain platform sizing rules; this is not a general CSS flexbox
implementation. In particular, constrained rows use platform-specific measurement
and should be tested with their actual controls, localization and text sizes.

Notices expose their title and text together. Android uses a merged polite live
region, or assertive when `urgent` is true. iOS posts the combined text when a
notice first appears or its text/title/urgency changes; ordinary announcements
are queued, while urgent announcements may interrupt current speech. Unchanged
stable notices do not reannounce on unrelated iOS state updates. Delivery and
interruption are ultimately controlled by VoiceOver/TalkBack, so automated
semantics and announcement-request tests do not establish actual spoken output.
These checks do not imply full catalogue or ten-component feature completeness.
