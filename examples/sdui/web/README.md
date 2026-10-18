# SDUI profile example

Run from the repository root with Go 1.26 or newer:

```sh
PORT=8093 go run ./examples/sdui/web
```

Open <http://127.0.0.1:8093>. The server binds to loopback only. Save a display
name, try an empty name for validation, or change the advanced switch. Native
form submits and advanced changes share the server action and replacement
region. Optional uploads are limited to 64 KiB; the demo records escaped file
metadata and discards the bytes. Repeated hidden fields and the native submitter
value demonstrate successful-control `FormData` semantics.

The [screen](screen.json) includes a typed local `summaryLine` template,
stable-key summary repetition inside a registered card content slot, JSON Pointer
parameter bindings, a conditional
heading and a conditionally visible catalogue animation. Its family assets are
loaded before the hidden component appears. The host uses a revision-aware
`Store`, while loader/action names remain explicit Go capabilities.

## External file and live activation

```sh
SDUI_SCHEMA=./examples/sdui/web/screen.json PORT=8093 go run ./examples/sdui/web
```

The initial file must decode, compile and satisfy host loader/action contracts
before serving. Without watching, edit the file and restart. To activate valid
changes without restarting:

```sh
SDUI_SCHEMA=./examples/sdui/web/screen.json SDUI_WATCH=1 PORT=8093 go run ./examples/sdui/web
```

The host polls only this local file every 250 ms. A valid changed definition is
activated atomically; malformed schemas and invalid capabilities are logged
while the previous screen stays active. Existing pages retain their current
DOM and drafts. An action from an obsolete revision receives 409 and emits
`sdui:stale` (plus `sdui:error`); reload explicitly after preserving any draft.
Automatic reload would risk discarding unsaved input, so it is not performed.

The reusable library also exposes `Activate`, `Load`, `LoadFile`, `History` and
`Rollback` with expected-revision compare-and-swap checks. Up to 16 snapshots
are retained in memory, including the active one. The demo does not expose an
unauthenticated administration/rollback endpoint or fetch remote schemas.
See [the runtime lifecycle reference](../../../docs/sdui/sdui.md#draft-activation-history-and-rollback).

## Authoring commands

```sh
go run ./cmd/ely validate ./examples/sdui/web/catalogue-screen.json
go run ./cmd/ely schema > ./sdui.schema.json
go run ./cmd/ely catalog -type forms/Switch
```

The standalone `catalogue-screen.json` is for generic CLI validation. The
interactive `screen.json` also requires the example host’s registered
`profile-summary-card` slot adapter. The generic CLI intentionally rejects that
unknown host-only type; the example host validates it with its actual registry.

Validation compiles without invoking loaders/actions or proving future data.
The default catalogue surface contains the eight core definitions plus 1,361
qualified/basic contracts. `-registry core` selects only the original eight.
The example's catalogue animation requires the broader registry.

## Demo limits

An initial GET automatically creates a random HTTP-only, same-site local
session. This demonstrates identity isolation and CSRF checks; it is not a
production login system. Replace it with real authentication and resource-level
authorization before deployment.

Sessions, profile state, replay records and screen history are in memory,
bounded and lost on restart. The demo allows 256 sessions for one hour, 512
replay entries for ten minutes and 128 KiB request bodies. Business mutations
need durable, transactional idempotency in the application's datastore.
Cancellation and configuration rollback never undo a committed mutation.
The hidden `delay` field delays responses by at most 300 ms for browser race
tests; it does not delay the commit and is not an application API feature.

## Checks

```sh
go test ./sdui ./adapters/gohtmx ./examples/sdui/web ./cmd/ely
go test -race ./sdui ./adapters/gohtmx ./examples/sdui/web ./cmd/ely
npm ci
npx playwright install chromium
node adapters/gohtmx/tests/unit/sdui_runtime_test.mjs
node adapters/gohtmx/tests/browser/sdui-browser-test.mjs
```

The real-browser script starts its own Go server on an available loopback port
and closes both server and browser afterward. The separate
`adapters/gohtmx/tests/browser/sdui-catalogue-browser-test.mjs` exercises catalogue fixture mounting.
Test files and commands do not by themselves establish that the final expanded
commit passed CI. See [the SDUI guide](../../../docs/sdui/sdui.md) for the runtime contract,
[composition](../../../docs/sdui/sdui-composition.md) for the complete grammar, and
[design rationale](../../../docs/sdui/sdui-json-design.md) for source-backed decisions.
