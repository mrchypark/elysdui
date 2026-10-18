# Server-driven UI

This guide describes the **web adapter**, package `gohtmx`. Where snippets use
`sdui.*` for web methods, import the alias
`sdui "github.com/mrchypark/elysdui/adapters/gohtmx"`. The separate
`github.com/mrchypark/elysdui/sdui` package is the HTML-free semantic core.
Core `NewRegistry(options...)` and web `NewRegistry(tpl, options...)` are distinct.
See [architecture](../architecture.md).

The optional `github.com/mrchypark/elysdui/adapters/gohtmx` package compiles versioned JSON
screens into Ely's existing Go templates and catalogue components. The server
owns data, validation and actions. A small delegated browser adapter submits
native `FormData` (with progressive text-request compression) and replaces one declared region with server-rendered HTML.

The runtime includes strict decoding, recursive property contracts, local
reusable templates, conditions, stable-key repeats, registered slots,
multi-event routing, authenticated actions, and atomic screen activation with
revision-aware requests. Schema values never select arbitrary Go templates,
execute expressions or grant server capabilities.

Related references:

- [Native SwiftUI/Compose profile transport](../native/README.md) (opt-in: original seven-type profile; controls-v1 adds switch as an eighth type)

- [HTTP compression, performance and security](sdui-transport.md)

- [Composition grammar and full examples](sdui-composition.md)
- [JSON design decisions and primary-source research](sdui-json-design.md)
- [Catalogue contract generation and review design](sdui-catalogue-contracts.md)
- [Implementation roadmap and acceptance criteria](sdui-roadmap.md)
- [Runnable profile example](../../examples/sdui/web/README.md)

## Component surfaces

`DefaultRegistry()` retains the ten built-in types:

| Type | Role | Registered events |
| --- | --- | --- |
| `stack` | Token-based structural layout | none |
| `region` | Stable replacement boundary | none |
| `form` | Native form | `submit` |
| `text` | Escaped paragraph | none |
| `notice` | Existing alert template | none |
| `input` | Basic input, including file/hidden modes | `change` |
| `button` | Basic button | `click` |
| `checkbox` | Basic checkbox | `change` |
| `select` | Basic single-choice control | `change` |
| `switch` | Advanced `forms/Switch` adapter | `change`, `ely:change` |

`CatalogueRegistry()` retains those ten and installs **1,361 additional
contracts**: 1,313 distinct chapter-qualified primary/alias names, representing
624 primary stories in 44 chapters, plus 48 public basic templates under
`basic/<template-name>`. That is 1,371 registered names, not 1,371 independent
widget implementations. Examples are `forms/TagInput`, `documents/MarkdownRenderer`
and `basic/card`. Exact aliases retain catalogue spelling, including spaces.

`RegisterCatalogue(registry)` adds the same manifest to an existing compatible
registry atomically. `Registry.Definitions()`, `CatalogueContracts()` and
`CatalogueInfo()` return tooling metadata. Each component has its own reviewed
property graph and explicit exclusions; sharing a property name does not imply
sharing its type. The production manifest contains no gallery fixture defaults.
Rendering/payment/AI/device widgets does not implement their external services.

## Run the example

With Go 1.26 or newer:

```sh
PORT=8093 go run ./examples/sdui/web
```

Open <http://127.0.0.1:8093>. Try an invalid display name, a successful save, the
advanced switch, repeated fields, a native submitter value and an optional
attachment. The screen also demonstrates a typed reusable summary row,
stable-key repetition inside a host-registered card content slot, a conditional
heading and a conditionally shown
catalogue animation whose assets are included before it becomes visible.

Use a host-selected external JSON file without rebuilding the executable:

```sh
SDUI_SCHEMA=./examples/sdui/web/screen.json PORT=8093 go run ./examples/sdui/web
```

The initial file must decode, compile and resolve its host loader/action
contracts before startup. Without a watcher, later edits need a restart. Enable
validated local-file activation with:

```sh
SDUI_SCHEMA=./examples/sdui/web/screen.json SDUI_WATCH=1 PORT=8093 go run ./examples/sdui/web
```

The example checks the file every 250 ms. Valid changes activate atomically;
invalid changes are logged and leave the previous screen active. Existing pages
keep their DOM and drafts when an old-revision action is rejected. Reload
explicitly to load the new definition and its assets.

This is a **loopback-only demonstration**, not production authentication. An
initial GET issues a random HTTP-only, same-site demo session. State is isolated
per session, kept in memory and lost on restart. Limits are 256 sessions for one
hour, 512 replay entries for ten minutes, 128 KiB request bodies, and one optional
file of at most 64 KiB whose escaped name/size are retained but whose bytes are
discarded. A hidden response delay is capped at 300 ms for race tests. Replace
the session bootstrap and state store before deployment.

## Wire contract

```json
{
  "version": "1",
  "id": "settings-screen",
  "loader": "load-settings",
  "root": {
    "id": "settings-region",
    "type": "region",
    "children": [
      {
        "id": "settings-form",
        "type": "form",
        "event": {"on":"submit","action":"save-settings","target":"settings-region"},
        "children": [
          {
            "id": "settings-name",
            "type": "input",
            "props": {"name":"name","label":"Display name"},
            "bindings": {"value":"/@data/profile/name"}
          },
          {"id":"settings-save","type":"button","props":{"type":"submit","label":"Save"}}
        ]
      }
    ]
  }
}
```

- `version` is the string `"1"`; existing v1 screens remain compatible
- Screen/node IDs are letter-led, use letters/digits/underscores/hyphens, and
  are at most 128 characters. IDs must be unique; `sdui-internal-` is reserved
- A concrete node selects a registered `type`. A reusable node selects `use`
  and supplies typed `params` or `paramBindings`
- `props` and `bindings` are separate. A field cannot be both literal and bound;
  an explicit binding suppresses its default and must resolve when rendered
- Contracts support strings, booleans, exact integers, finite numbers, closed
  objects, bounded arrays, constrained unions, explicitly typed dictionaries,
  nullable values, defaults and semantic formats. Unknown nested keys fail
- Bindings support legacy dotted paths and RFC 6901 pointers with arrays and
  escaped keys. `/@data`, `/@params` and `/@vars/<name>` make scopes explicit
- `children` belong to structural containers. Named `slots` are allowed only
  by a host definition and receive internally rendered child markup
- `when` supports typed `eq`, `ne`, `exists`, `all`, `any` and `not` predicates
- `repeat` supplies an array path, local variable and stable string/integer key.
  Duplicate/missing/invalid keys fail rendering; IDs remain stable on reorder
- Regions must always exist: they cannot be conditional or repeated, including
  through ancestors, templates or slots. Conditional/repeated content belongs
  inside a stable region. Nested forms, including form-containing catalogue
  widgets, are rejected
- Loaders/actions are capability keys, never URLs. Every event target is a
  same-screen region and must also be authorized for its host action

See [composition](sdui-composition.md) for exact scoping, missing/null behavior,
ID rewriting, partial-region parameters and slot constraints.

`Decode` rejects unknown fields, duplicate keys, trailing input and schemas over
1 MiB. Compiled expansion and render-time repetition are limited to 1,000 nodes
and depth 32. Conditions, property metadata, structured values and collection
sizes have their own budgets. Strings default to 16 KiB; reviewed contracts may
set a larger bound up to 256 KiB. Normalization has a shared 2 MiB byte budget,
and every intermediate/final HTML fragment is capped at 2 MiB. These limits
supplement host request/business limits. Rendering finishes validation before
writing any output; writer errors are returned normally.

## Trust and contextual properties

Ordinary strings remain escaped data. JSON/bindings cannot provide trusted Go
HTML/CSS/JavaScript values, arbitrary attributes, class names, inline event
handlers, renderer selectors or unrestricted `hx-*` configuration. Property
names are reviewed in their actual template context:

- `url`, `image-url` and `media-url` formats validate resource/navigation sinks.
  The default policy allows safe local absolute paths, fragments and supported
  empty values. External HTTP(S) origins need an explicit host `WithURLPolicy`
- Typed action labels are local widget selectors. They grant no server action
  until an event maps them to an allowlisted action and region
- Design fields expose bounded tokens and reviewed values, not arbitrary CSS
- Registered Markdown input keeps unsafe HTML/links and resource URLs under
  its reviewed renderer and resource policy
- The reviewed sandbox-document adapters sanitize their bounded string input
  and preserve the fixed script-disabled iframe sandbox. This is not a generic
  trusted-HTML escape hatch
- Registered slots accept compiled nodes only. Untrusted strings never become
  slot markup

Definitions and templates are trusted host code. `Registry.Register` validates
contracts and dangerous passthroughs, but cannot audit arbitrary custom renderer
logic. Each definition selects exactly one renderer, with explicit properties,
events, slots, form-content metadata and any supported fixed asset dependencies.

## Compile once and connect a host

```go
registry, err := sdui.CatalogueRegistry()
if err != nil { return err }
screen, err := sdui.Decode(schemaReader)
if err != nil { return err }
plan, err := sdui.Compile(screen, registry)
if err != nil { return err }
handler, err := sdui.NewHandler(plan, sdui.Config{
    Endpoint: "/settings",
    Authenticate: authenticateRequest,
    Authorize: authorizeSettingsScreen,
    CSRF: csrfTokenForRequest,
    Loaders: map[string]sdui.Loader{"load-settings": loadSettings},
    Actions: map[string]sdui.Action{
        "save-settings": {
            Targets: []string{"settings-region"},
            Authorize: authorizeSettingsMutation,
            Run: saveSettings,
        },
    },
})
if err != nil { return err }
if err := sdui.BindAssets(mux); err != nil { return err }
mux.Handle("/settings", handler)
```

A `Plan` snapshots definitions and is safe for concurrent rendering. Do not
mutate its trusted template set or request data during rendering. `Plan.Render`,
`RenderRegion` and `RenderAssets` also support custom page shells. Assets are
currently mounted at `/assets/`; subpath hosts must provide matching routes.

Authentication, screen authorization, per-action authorization and CSRF issuance
are mandatory. The CSRF callback reads expected tokens from trusted session
state, never submitted input; comparisons are constant time. Keep a page's token
stable until a full render. Use HTTPS, appropriate cookies and resource-level
authorization in production. Per-action authorization runs before replay lookup
and must verify the actual record against the authenticated principal.

`Request` contains `Principal`, `Values` (`url.Values`), `Files`
(`map[string][]*multipart.FileHeader`) and `HTTPRequest`. Validate multiplicity,
field lengths, structured event values, ownership, uploaded contents and business
rules in the host. Read/copy retained files during the request; multipart
resources are cleaned up afterward. File names and content types are untrusted.

Return `Result{Data: data}` for success or `Result{Data: data, Status: 422}` for
validation. The complete replacement region needs all its binding data. Validate
before mutation: a 422 response does not roll back host writes. Only 200
(including the zero/default status) and 422 produce action HTML. Callback/render
failures return generic errors rather than partial output.

## Events and typed payload extraction

The existing singular `event` is preserved. A node may instead supply up to
16 `events`; using both nonempty forms is invalid. Every `on` must be supported
by the registered definition. For advanced multi-action components, an exact
`sourceAction` restricts `ely:action` to one `event.detail.action` value:

```json
{
  "events": [
    {
      "on": "ely:action",
      "sourceAction": "edit",
      "action": "edit-record",
      "target": "results",
      "payload": {"recordID":{"path":"/record/id","type":"integer"}}
    },
    {
      "on": "ely:action",
      "sourceAction": "remove",
      "action": "remove-record",
      "target": "results",
      "payload": {"recordID":{"path":"/record/id","type":"integer"}}
    }
  ]
}
```

Use selectors that the chosen widget actually emits. Unknown selectors do not
choose a host capability. Duplicate/overlapping bindings, including mixing a
catch-all and a specific selector for one event type, fail compilation. Without
`sourceAction`, an event maps to its fixed declared action regardless of an
arbitrary detail action string.

`payload` is a bounded map of explicit fields extracted by JSON Pointer from
`event.detail`. Types are `string`, `boolean`, `integer`, `number`, `object` and
`array`. Browser extraction requires the field and checks its type; objects and
arrays are JSON-encoded, scalars become form strings. Use distinct destination
field names: an explicit payload mapping replaces that named form value.
Reserved transport fields cannot be selected. Missing/malformed payloads fail
before sending the browser request.

These browser checks are not a security boundary. A caller can forge a POST.
The host must validate submitted payload strings/JSON, record IDs and business
permissions exactly as it validates native form values. Node selectors never
bypass the server action/target allowlist or authorization.

Native successful-control semantics remain intact for ordinary form collection:
unchecked/disabled controls are omitted, repeated names remain repeated,
submitter values are preserved and uploads remain file entries. Field names
beginning with `_` are reserved. Avoid binding both a submit button's click and
its form submission when one mutation is intended.

## Draft, activation, history and rollback

Use `Store` when definitions change at runtime:

```go
store, err := sdui.NewStore(initialScreen, registry, config)
if err != nil { return err }
mux.Handle("/settings", store)

// Capture the revision on which the edit is based.
base := store.Snapshot()
// Prepare candidateScreen privately; do not change active configuration yet.
next, err := store.Activate(candidateScreen, base.Revision)
// Or: next, err := store.Load(candidateReader, base.Revision)
// Or: next, err := store.LoadFile(hostSelectedPath, base.Revision)
```

Every candidate is strictly decoded where applicable, compiled, and checked
against current host loader/action contracts before activation. Invalid
candidates leave the active snapshot unchanged. `expectedRevision` is required:
concurrent/stale publishers receive `ErrRevisionConflict`. An unchanged canonical
configuration is a no-op. Each HTTP request pins one snapshot for its lifecycle;
activation cannot mix plans or data halfway through that request.

`History()` returns the active revision followed by earlier retained revisions,
newest first, up to **16 total snapshots**. Roll back an earlier retained revision
with `Rollback(oldRevision, expectedActiveRevision)`. Changed configurations
receive a new revision even when restoring old content; old pages do not become
valid again. Unknown/evicted revisions return `ErrUnknownRevision`. Rollback
changes screen configuration, not completed business mutations.

`WatchFile(ctx, path, interval, onResult)` watches a host-selected local file,
with an interval of at least 100 ms. Changed bytes are validated before
activation, failures are reported without losing the active plan, and context
cancellation stops the blocking watcher. Schemas cannot choose paths or import
remote documents. Keep candidate files separate while editing; activate only
through host-authorized code. No public administration endpoint or durable
revision database is supplied. Persist drafts/history and authenticate
administrative operations in the application when needed.

A stored screen emits `data-sdui-revision`; actions include `_revision`. A new
request with an obsolete revision receives 409 with `X-SDUI-Reload: required`
and the current `X-SDUI-Revision`, before an action runs. Authentication, screen
authorization and CSRF checks remain in force. The browser emits `sdui:stale`
and `sdui:error`, leaves the DOM and current drafts unchanged, and does not reload
automatically. Offer an explicit reload after the user has preserved any draft.
Already in-flight requests retain their captured snapshot.

All snapshots share the bounded replay cache. Changing a revision cannot reset
duplicate-mutation protection; retrying a key with changed transport/input data
can produce a conflict instead of re-executing. Durable business idempotency
still belongs to the host.

## Transport, assets and UI lifecycle

The browser adapter reads server-rendered `data-sdui-*` metadata and uses vetted
same-origin `fetch` requests. Schemas cannot set the endpoint. Requests use
cookies, an `Idempotency-Key` and reserved `_action`, `_target`, `_csrf`, `_request`
and, for stored screens, `_revision` fields. Reserved values are overwritten by
the adapter. Mutation redirects are not followed.

- Duplicate in-flight submits/clicks/actions from the same source are suppressed
- A newer request for a region aborts the previous request where possible
- Sequence and target-identity checks reject stale responses even when abort
  cannot prevent an already committed response
- Accepted 200/422 responses contain exactly the requested region root. Unsafe
  executable markup/attributes and duplicate/conflicting IDs fail before a swap
- Reviewed inert animation JSON and script-disabled sandbox frames have narrow
  adapter checks; ordinary executable script elements remain rejected
- Replacement uses whole-region semantics, then invokes available HTMX processing
  and emits `htmx:after:swap` for component mounting and detached-instance cleanup
- Focus returns to the matching stable control. Values inside a replaced region
  are server-authoritative; drafts outside it remain untouched. There is no
  generic dirty-field, open-widget or optimistic-state merge
- Success emits `sdui:success`; 422 emits `sdui:error` with `validation: true`.
  Other failures emit `sdui:error` without swapping

Assets are computed from the complete compiled tree, including hidden,
repeated, slotted and reusable content. Initial HTML loads common assets,
registered family entrypoints and fixed dependencies once. Fragments do not
load executable scripts. A newly activated definition may need different
assets, which is why old pages must explicitly reload after a revision conflict.

## Idempotency and failure boundaries

Replay keys are scoped to principal, action and target. Canonical form values
and uploaded contents form the input fingerprint, so multipart boundaries do
not change request identity. Identical concurrent/repeated requests receive the
cached outcome; reusing a key with changed input returns 409. Authentication and
authorization are rechecked before replay.

The cache is single-process, in-memory and best-effort. Defaults are a ten-minute
TTL, 1,024 entries and 64 MiB of replay bytes. `Config` exposes `IdempotencyTTL`,
`MaxIdempotencyEntries`, `MaxReplayBytes` and `MaxBodyBytes` (1 MiB by default).
Capacity is checked before running an action; full capacity returns 503.
Completed failures are cached too. Later requests clean expired entries.

Restart, expiry, multiple instances or an uncertain response after a committed
mutation require durable host idempotency in the same transaction as the write.
Cancellation never rolls back a mutation. DOM ordering guards do not enforce
business operation order; use application versions/concurrency checks where
needed. Other common statuses are 401 unauthenticated, 403 unauthorized/CSRF,
400 malformed/unknown input, 413 oversized body and 500 callback/render failure.

## CLI and editor tooling

```sh
go run ./cmd/ely validate ./examples/sdui/web/catalogue-screen.json
go run ./cmd/ely schema > ./sdui.schema.json
go run ./cmd/ely catalog -type forms/TagInput
go run ./cmd/ely catalog -registry core
```

The standalone `catalogue-screen.json` example uses only standard contracts.
The interactive profile `screen.json` additionally uses the host-only
`profile-summary-card` slot adapter, so validate that screen through its example
host or a registry containing the same registration; the generic CLI deliberately
does not infer host components.

The default tooling registry is the catalogue; `-registry core` selects the
compatibility types. `ely sdui <command>` is an equivalent spelling. Validation
compiles only and explicitly reports that host loader/action registration,
authorization and runtime data were not checked. No host callback executes.

`sdui.JSONSchema(registry)` / `registry.JSONSchema()` export Draft 2020-12 editor
metadata from the live contracts. Configure editor associations externally;
`$schema` is not a permitted screen field. Exported constraints aid authoring,
but semantic references, capability registration, conditional region placement,
aggregate limits and future loader data still require `Compile` and `Render`.
See the [composition tooling reference](sdui-composition.md#editor-schema-and-cli).

## Scope and verification

The package supports the existing renderer/data/event surface through explicit
contracts. External payment, AI, mail, database, device and operating-system
services remain application integrations. It does not supply remote template
imports, arbitrary expressions, unrestricted HTML/CSS/JS, automatic routing,
optimistic reconciliation, production authentication, a visual editor or
durable multi-tenant revision/replay storage.

Relevant checks:

```sh
go test ./sdui ./adapters/gohtmx ./examples/sdui/web ./cmd/ely
go test -race ./sdui ./adapters/gohtmx ./examples/sdui/web ./cmd/ely
go run ./cmd/sdui-catalogue -check -root .
go test ./adapters/gohtmx -run='^$' -fuzz=FuzzDecodeCompileRender -fuzztime=10s -parallel=2
npm ci
npx playwright install chromium
node adapters/gohtmx/tests/unit/sdui_runtime_test.mjs
node adapters/gohtmx/tests/browser/sdui-browser-test.mjs
node adapters/gohtmx/tests/browser/sdui-catalogue-browser-test.mjs
```

| Area | Evidence source |
| --- | --- |
| Strict decode, compatibility and structural limits | `sdui/schema_test.go`, `sdui/registry_test.go`, `adapters/gohtmx/registry_test.go` |
| Recursive properties, formats, policies and snapshots | `sdui/values_test.go` |
| Templates, pointers, conditions, repeated IDs, slots, forms and budgets | `adapters/gohtmx/composition_test.go` |
| HTML/asset closure, partial rendering and concurrency | `adapters/gohtmx/render_test.go` |
| Registered multi-events and payload metadata | `adapters/gohtmx/events_test.go`, `adapters/gohtmx/tests/unit/sdui_runtime_test.mjs` |
| Authentication, CSRF, action allowlists and replay | `adapters/gohtmx/http_test.go` |
| CAS activation, pinned requests, history/rollback and file watcher | `adapters/gohtmx/store_test.go` |
| Exact catalogue inventory, generation drift and caller-data fixtures | `adapters/gohtmx/catalogue_test.go` |
| JSON Schema/CLI authoring workflow | `adapters/gohtmx/jsonschema_test.go`, `cmd/ely/sdui_test.go` |
| Actual HTTP/modules, swaps, stale responses and local controls | `adapters/gohtmx/tests/browser/sdui-browser-test.mjs` |
| Registered fixture rendering and family-module browser mount smoke | `adapters/gohtmx/tests/browser/sdui-catalogue-browser-test.mjs` |
| Local host isolation, external schema and multipart behavior | `examples/sdui/web/main_test.go` |
| Decode/compile/render fuzz seeds including composition | `adapters/gohtmx/fuzz_test.go` |

Expanded commit `ed90987a16415920524481eb59278595e1f27ad1` passed both hosted
Go/JavaScript/race checks and actual Chromium in
[run 38614498267](https://github.com/mrchypark/elysdui/actions/runs/38614498267).
See the PR checks for verification of any later commit.
Catalogue mount smoke is distinct from every prop permutation or external
provider operation; browser launch/setup failures are blockers, never passes.
