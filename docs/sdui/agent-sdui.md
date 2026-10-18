# SDUI reference for agents

This guide describes the **web adapter**, package `gohtmx`. Where snippets use
`sdui.*` for web methods, import the alias
`sdui "github.com/mrchypark/elysdui/adapters/gohtmx"`. The separate
`github.com/mrchypark/elysdui/sdui` package is the HTML-free semantic core.
Core `NewRegistry(options...)` and web `NewRegistry(tpl, options...)` are distinct.
See [architecture](../architecture.md).

Use `github.com/mrchypark/elysdui/adapters/gohtmx` when a host-owned JSON screen should
compile to elysdui HTML. JSON describes registered components, data bindings and
capability names; Go owns authentication, data, validation, actions and assets.
Start with the [runtime guide](sdui.md) for full host examples and the
[composition grammar](sdui-composition.md) for exact syntax.

## Choose and inspect contracts before authoring

Run from the repository root with the Go version in `go.mod` (Go 1.26+):

```sh
go run ./cmd/ely catalog -type forms/TagInput
go run ./cmd/ely catalog -registry core
go run ./cmd/ely schema > /tmp/ely-sdui.schema.json
go run ./cmd/ely validate ./examples/sdui/web/catalogue-screen.json
```

- Tooling defaults to `catalogue`; `-registry core` selects only the eight
  compatibility types. `ely sdui <command>` is an equivalent spelling. For stdin,
  use `go run ./cmd/ely validate -`. Put flags before the file argument.
- `sdui.DefaultRegistry()` supplies `stack`, `region`, `form`, `text`, `notice`,
  `input`, `button`, and `switch`. `sdui.CatalogueRegistry()` adds reviewed
  chapter-qualified names such as `forms/TagInput` and public `basic/…` names.
  Preserve exact case and alias spelling. Aliases are not independent widgets.
- Inspect `Registry.Definitions()` for property types, required/default values,
  enums, formats, nested objects/arrays, events, slots and assets.
  `sdui.CatalogueContracts()` additionally exposes primary names and intentional
  exclusions; `sdui.CatalogueInfo()` reports inventory metadata. Do not infer an
  SDUI property type from a similarly named field in another component or from
  the Go gallery fixture.
- `sdui.JSONSchema(registry)` and `registry.JSONSchema()` produce Draft 2020-12
  editor metadata. Configure editor associations outside the screen: `$schema`
  is not an accepted screen field.
- Discover visuals in the [component catalogue](../gohtmx/COMPONENTS.md), then use the
  actual typed contract. The [contract design reference](sdui-catalogue-contracts.md)
  explains generation and review; this page does not duplicate that inventory.

CLI validation strictly decodes and compiles; it does not execute host callbacks
or prove loader/action registration, authorization, runtime binding data or a
custom host URL policy. Custom components must be validated with their actual
host registry. In particular, `examples/sdui/web/screen.json` uses the host-only
`profile-summary-card`; the standalone `catalogue-screen.json` works with the
unmodified CLI registry.

## Author a bounded screen

A minimal action-bearing screen:

```json
{
  "version": "1",
  "id": "profile-screen",
  "loader": "load-profile",
  "root": {
    "id": "profile-region",
    "type": "region",
    "children": [{
      "id": "profile-form",
      "type": "form",
      "event": {"on": "submit", "action": "save-profile", "target": "profile-region"},
      "children": [
        {"id": "name", "type": "input", "props": {"name": "name", "label": "Name"}, "bindings": {"value": "/@data/profile/name"}},
        {"id": "save", "type": "button", "props": {"type": "submit", "label": "Save"}}
      ]
    }]
  }
}
```

The loader and action result must provide data such as
`{"profile":{"name":"Ada"}}`. The keys `load-profile` and `save-profile` name
host callbacks, never URLs.

Authoring rules:

- `version` is the string `"1"`. Screen/node IDs match
  `^[A-Za-z][A-Za-z0-9_-]{0,127}$`, must be unique in their applicable compiled
  scope, and must not use the reserved `sdui-internal-` prefix.
- A concrete node chooses registered `type`, literal `props`, and/or `bindings`.
  A property cannot be both literal and bound. An explicit binding suppresses
  the default and must resolve to a valid value at render time.
- Bindings are data paths, not expressions. Prefer explicit JSON Pointers:
  `/@data/profile/name`, `/@params/title`, `/@vars/person/name`.
  Legacy `profile.name` also works. Pointers support arrays and `~0`/`~1`
  escaping. Missing values and explicit null differ; null needs a nullable
  contract. No string-to-boolean or arbitrary HTML coercion is supplied.
- Structural containers accept `children`. Only definitions with registered
  `slots` accept named slot children. Slots contain compiled nodes, not HTML.
- Local `templates` declare typed parameters and one root. A `use` node supplies
  `id`, `use`, optional `params`/`paramBindings`, `when` and `repeat`; do not add
  `type`, `props`, children or events to a use node. Pass outer repeat values
  explicitly into template parameters.
- `when` supports `eq`, `ne`, `exists`, `all`, `any`, `not`.
  `repeat: {"items":"/@data/people","as":"person","key":"/id"}` requires
  unique stable string/integer keys. Do not invent index keys. Reordering keeps
  generated IDs stable; missing/duplicate keys fail rendering.
- Keep replacement regions unconditional and unrepeated, including their
  ancestors and template/slot placement. Put conditional/repeated content
  inside a region. Nested forms, including form-containing widgets, are invalid.

`Decode` rejects unknown fields, duplicate keys, trailing JSON and schemas over
1 MiB. Expanded/rendered trees are bounded to 1,000 nodes and depth 32; HTML
fragments are capped at 2 MiB. Additional string, collection and normalization
budgets apply. See [composition](sdui-composition.md) rather than working around
these bounds with raw markup.

## Connect host data, actions and assets

The integration sequence is `Decode(reader)` → `Compile(screen, registry)` →
`NewHandler(plan, config)`. All return errors that the host must handle.
`Config` needs a local absolute `Endpoint`, `Authenticate`, screen `Authorize`,
`CSRF`, and the loader/action maps required by the screen. Each `Action` requires
`Targets`, `Authorize` and `Run`. See the
[complete host wiring](sdui.md#compile-once-and-connect-a-host) and
[runnable profile example](../../examples/sdui/web/README.md).

For a custom page shell, use `plan.Render(writer, RenderContext{…})`,
`plan.RenderRegion(writer, regionID, RenderContext{…})`, and
`plan.RenderAssets(writer)`. `RenderContext` carries host-owned `Data`, `CSRF`,
`Endpoint`, optional `Revision` and `RequestCompression`. Mount assets with
`sdui.BindAssets(mux)` once, instead of `ui.BindAssets(mux)`, to include
both UI assets and the adapter-owned bridge; generated asset paths currently start at `/assets/`.
Plans snapshot definitions and may render concurrently, but do not mutate their
trusted templates or request data during rendering.

- `Loader` returns `map[string]any`. `Action.Run` receives `Request` with
  `Principal`, `Values` (`url.Values`), `Files` and `HTTPRequest`.
- Return `Result{Data: data}` for success, or
  `Result{Data: data, Status: 422}` for validation errors. Supply all data needed
  by the whole replacement region, including validation messages and retained
  values. Only status 200 (or default zero) and 422 produce action HTML.
- Validate before mutating. A 422 or render failure does not roll back a database
  write. Copy retained uploads during the request; multipart resources are
  cleaned up afterward. Names and MIME types are untrusted.
- Use one `event`, or up to 16 `events`, never both nonempty. `on` must be
  supported by the definition. `target` must name a same-screen region also
  authorized in that action's `Targets`.
- For a widget's `ely:action`, `sourceAction` selects an actual emitted
  `event.detail.action` value. A `payload` mapping explicitly extracts typed
  JSON Pointer fields from event detail. Consult
  [event examples](sdui.md#events-and-typed-payload-extraction); browser type
  checking does not validate a forged POST.
- Preserve native successful controls: repeated names stay repeated,
  unchecked/disabled controls are omitted, submitter values and files survive.
  Names starting with `_` are reserved. Avoid binding both button click and form
  submit to one intended mutation.

## Keep security and state server-owned

JSON cannot grant capabilities, select arbitrary Go templates, execute
expressions, supply trusted HTML/CSS/JavaScript, or configure unrestricted
attributes/`hx-*`. Ordinary strings remain escaped. External HTTP(S) resources
need explicit host `sdui.WithURLPolicy`; safe local absolute paths and fragments
are supported by default. Registered Markdown and sandbox-document adapters
have narrow reviewed policies, not a general trusted-markup escape hatch.
Custom definitions and renderers remain trusted host code that needs review.

Authentication, screen authorization, action authorization and session-backed
CSRF issuance are mandatory. Never derive the expected CSRF token from submitted
input. Check record ownership, field multiplicity, payload JSON, uploads and
business rules in the host. Demo sessions are not production authentication;
payment, mail, AI and device widgets still need their actual service integrations.

A successful action replaces the entire declared region. Matching stable control
focus is restored, but values inside it are server-authoritative. Drafts outside
it remain intact. There is no automatic dirty-field merge or optimistic-state
reconciliation. Assets include the complete compiled tree, even hidden content;
fragments do not install executable scripts.

For runtime definition changes, use `sdui.NewStore(screen, registry, config)`.
Capture `store.Snapshot().Revision`, then call
`Activate(candidate, expectedRevision)`, `Load(reader, expectedRevision)` or
`LoadFile(hostSelectedPath, expectedRevision)`. Invalid candidates preserve the
active screen; stale publishers get `ErrRevisionConflict`. `History()` retains
up to 16 snapshots. `Rollback(oldRevision, expectedActiveRevision)` restores
configuration under a new revision, not business data. `WatchFile` is a blocking,
context-cancelled local-file watcher; JSON cannot select files or remote imports.

An obsolete page receives 409 with `X-SDUI-Reload: required`; the browser emits
`sdui:stale`/`sdui:error`, preserves DOM/drafts and requires explicit reload.
In-flight requests retain their captured snapshot. Browser race/abort guards do
not undo committed actions or impose database ordering. The replay cache is
bounded, in-memory and single-process: implement durable idempotency and
concurrency checks with the business write when needed. See
[state and replay details](sdui.md#draft-activation-history-and-rollback).

## Use the playground without mistaking preview for integration

```sh
go run ./cmd/sdui-playground
```

The local editor listens at `http://127.0.0.1:8094`; `PORT` overrides the port.
It is a loopback development tool, not a deployable multi-user backend. Its
visual tree and JSON editor share one document, and its inspector loads actual
component contracts lazily. See [playground usage](sdui-playground.md).

The [static SDUI Studio](../github-pages.md) runs the same Go renderer through
WASM in a Web Worker without a Go HTTP server. It needs a modern browser,
initial renderer download and available memory. Both editions deliberately show
an inert, sanitized, script-disabled sandbox preview: component JavaScript,
host actions, forms, navigation, external network providers and permissions
cannot be validated there. Run the real host and browser checks for interactions.

**Export JSON exports only the exact screen source.** It does not bundle the
separate sample/fixture data, loaders, actions, host component registrations or
URL policy. Save required data separately and implement the real loader.
Import retains the existing sample data, so recheck bindings against the intended
dataset. Export can preserve invalid draft source; validate it before deployment.
Production catalogue contracts contain no gallery fixture defaults.
`playground/card` is a playground-only registration: supply an equivalent trusted
host definition or replace it before using an exported screen elsewhere.
Browser-local drafts are not durable cloud saves; avoid secrets and private
production datasets.

## Compression and completion checks

Use [HTTP transport](sdui-transport.md) for response negotiation, progressive
request compression and limits; use [transport benchmarks](sdui-transport-benchmarks.md)
for measured tradeoffs. Playground sizes compare screen JSON and raw rendered
HTML using real codecs. They exclude the data object, envelopes, headers,
assets and sanitized wrapper, and are not browser transfer totals.
`Config.CompressResponses` is opt-in: authenticated HTML may mix CSRF tokens
and reflected input, creating compression side channels. `no-store` alone is
not a mitigation. Keep encoded and decoded request limits bounded.

Before calling a screen done:

1. Discover exact contracts and compile with the application's registry.
2. Render with representative complete data, including empty collections,
   validation errors and invalid/missing binding cases.
3. Verify real-host authentication, authorization, CSRF, mutation validation,
   region replacement and assets. Preview success is insufficient.
4. Run relevant checks from [contributor verification](../contributing.md) and the
   [SDUI test list](sdui.md#scope-and-verification). For package changes:
   `go test ./sdui ./adapters/gohtmx ./examples/sdui/web ./cmd/ely`.
