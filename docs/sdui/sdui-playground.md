# SDUI visual editor and JSON playground

The playground is a local authoring tool for Ely's SDUI schema. Its visual tree,
property inspector and JSON editor share the same screen document. Preview
requests compile that document against the real component registry and render it
with Ely's existing Go templates. There is no separate JavaScript imitation of
the component renderer.

## Run

With Go 1.26 or newer, from the repository root:

```sh
go run ./cmd/sdui-playground
```

Open <http://127.0.0.1:8094>. Set `PORT` to use another port:

```sh
PORT=8095 go run ./cmd/sdui-playground
```

The server binds to `127.0.0.1`, rejects non-loopback Host headers, and is intended
for local development. Do not expose it through a reverse proxy or deploy it as a
multi-user application. A page load issues a process-local session cookie and
CSRF token; restarting the server requires reloading the page.

## Author a screen

- Edit the screen JSON or its separate data object to update the preview
- Select a tree node to inspect its registered properties. Search the catalogue,
  choose a component, then add it to a compatible container or named slot
- Move a child up or down, duplicate it with fresh IDs, or delete it. Undo and redo
  restore document changes
- Property controls use the registered type information. Required values, enum
  choices, bounded numbers and structured properties remain subject to the Go
  compiler's complete contract validation
- Format JSON for a readable source document. Import a JSON file or export a
  portable document before leaving the playground

Visual edits make targeted changes to the current JSON document. Existing
`bindings`, `templates`, `paramBindings`, `when`, `repeat`, `event`/`events` and
`slots` remain present when editing unrelated fields. A repeat or reusable
instance represents its source node in the tree, rather than flattening the
rendered instances into duplicated source. Arbitrary advanced composition is
still available in JSON; the inspector is not a graphical designer for every
schema construct.

Invalid JSON stays in the editor, and visual mutations are disabled until it is
parseable. Compilation or data-binding errors are shown without replacing the
last successful preview. Correct the draft to resume rendering. Rendering is
server-authoritative: a property control cannot make an invalid contract valid.

### Keyboard and small screens

Use Ctrl/Cmd+Enter to request a preview. Outside textareas, Ctrl/Cmd+Z undoes a
visual/document edit and Ctrl/Cmd+Shift+Z redoes it. Inside a textarea, native text
editing history remains available. The tree supports Arrow Up/Down and Home/End
for moving focus. Buttons and form controls remain keyboard accessible.

The layout stacks on narrow screens so the catalogue, tree, editor and preview
remain usable without a page-wide horizontal scroll. The preview is a responsive
frame, not a device emulator.

## Examples

The built-in examples are editable starting points:

| Example | What it demonstrates |
| --- | --- |
| Basic | Text, notice and button components |
| Advanced | A reviewed catalogue component, such as `forms/Switch` |
| Slots | The host-registered `playground/card` and its `content` slot |
| Repeat | Data bindings and stable-key repeated project rows |
| Events | An event/action contract whose preview remains inert |

`playground/card` is registered only by this example host. Its `content` slot
accepts `text`, `button` and `stack` nodes, with a maximum of 16 direct entries.
When exporting a screen that uses it, register an equivalent trusted component
in your application or replace it with one your host already supplies.

The search endpoint returns lightweight component names and families, capped at
40 matches per response. A selected component's detailed property graph, events,
slots and assets are fetched separately and cached by the editor. The page does
not eagerly ship the complete catalogue contract manifest. Registry names may
include aliases; the catalogue size does not equal the number of independent
widget implementations.

## Compression measurements

The comparison reports actual byte lengths from Ely's server-side encoding path
for two representations:

1. Screen JSON as submitted in the preview request
2. The real renderer's HTML, before the sandbox document wrapper and sanitization

Each representation includes identity, gzip, Brotli (`br`) and Zstandard (`zstd`)
bytes, plus the coding selected by the configured policy. The dynamic and static
profiles use the same normalized levels and codec implementations as the server.
Choose the smallest-size or preference strategy and adjust minimum source size,
minimum byte savings, and minimum percent savings to see how selection changes.
A larger minimum source size or savings threshold may select identity even when
an encoded variant is available.

These are reproducible representation measurements, not network transfer totals.
They exclude the data object, request/response envelopes, headers, the editor's
assets and the preview wrapper. All codecs are measured on the Go server; the
numbers do not claim that a browser implements a particular CompressionStream
codec or used it on the wire. The sandboxed response document itself may have a
different byte length from the measured raw renderer HTML. Use the
[transport guide](sdui-transport.md) and
[transport benchmarks](sdui-transport-benchmarks.md) for production negotiation,
request compression, caching and cost/security tradeoffs.

## Security boundary and preview limitations

The editor treats imported JSON, property values and data as untrusted input.
The backend uses `sdui.Decode`, `sdui.Compile` and the normal renderer, including
strict schema decoding, recursive property contracts, URL policy and resource
budgets. Requests have a bounded body size and preview work has a small
concurrency limit. POSTs require the current session's CSRF token and a matching
Origin when one is supplied.

The preview is intentionally static. An iframe with `sandbox=""` receives a
sanitized document with a restrictive content security policy. Script-bearing
nodes, inline event attributes, resource/navigation attributes and embedded
frames are removed before display. Only renderer-selected trusted stylesheet bytes are inlined, authorized by a
SHA-256 CSP hash; the preview has no network resource access. Component JavaScript, network providers, form submission, navigation,
popups and host action execution are unavailable in this preview. The events
example validates the mapping and displays it without executing `save`.

Consequently, a rendered widget is not evidence that its production interaction,
external service or permission-sensitive feature works. Test those in the real
application, with its host-owned loaders, actions, asset lifecycle and security
policy. The playground never provides those capabilities from JSON alone.

The server does not persist screen documents or data. Browser-local drafts,
exports and clipboard contents should be treated with the same care as source
files. This local tool is not a secrets manager; avoid entering production
credentials or private production datasets.

## HTTP endpoints

All `/api/` endpoints require a cookie established by visiting the editor page.

| Method and path | Result |
| --- | --- |
| `GET /api/catalogue?q=...` | `{items: [{name, family}], total, matches}`; at most 40 items |
| `GET /api/component?name=...` | The selected registered definition, or 404 |
| `GET /api/examples` | Examples with `id`, `title`, `screen` and `data` |
| `POST /api/preview` | Sanitized preview `html`, measured `sizes`, stylesheet `assets` and compiled `events` |

A preview request contains `screen` and `data`, with optional `profile`
(`dynamic`/`static`), `strategy` (`smallest`/`preference`), `minBytes`,
`minSavingsBytes` and `minSavingsPercent`. Send `Content-Type: application/json`
and `X-CSRF-Token` from the page's `csrf-token` meta element. Validation failures
return 422 and `{error: "..."}`; request bodies over 2 MiB return 413.
Missing/expired session or CSRF tokens return
403. This is an internal development interface, not a public multi-tenant API.

## Verification

```sh
go test ./internal/playground ./cmd/sdui-playground
npm ci
npx playwright install --with-deps chromium
npm run test:playground
```

The browser script starts the real Go server on an available loopback port and
launches Chromium. It covers JSON-to-HTML rendering, invalid input recovery,
visual editing and undo/redo, preservation of composition metadata, lazy
catalogue contracts, built-in examples, import/export, sandbox isolation, narrow
layouts and keyboard paths. It fails on uncaught browser errors or external
requests and cleans up the server and temporary downloads afterward.

`npm run test:browser` includes this suite alongside the existing SDUI, catalogue
and asset lifecycle tests. CI must run the real browser checks; `node --check`
validates JavaScript syntax only and is not a substitute for browser execution.
