# Using elysdui in an application

elysdui renders Go `html/template` components. Your Go server owns routing,
validation and business operations; htmx can replace HTML fragments. Consumers
need Go 1.26+ and do **not** need Node, Tailwind or a React build.

## Choose and pin a revision

The current module is `github.com/mrchypark/elysdui`. Import the standalone UI as
`ui "github.com/mrchypark/elysdui/ui/gohtmx"`. Pin v0.2.0 in `go.mod` and commit
`go.sum`; never silently upgrade an app. The historical v0.1.0 tag has neither
these package paths nor SDUI.

```sh
go get github.com/mrchypark/elysdui@v0.2.0
```

Repository-relative commands below run from this checkout, not a consumer app.

## Run the smallest integration

[examples/gohtmx/minimal/main.go](../../examples/gohtmx/minimal/main.go) is a complete, copyable
server with asset routes, a native GET form, an htmx fragment and escaped output.
Its [test](../../examples/gohtmx/minimal/main_test.go) verifies full-page fallback, fragment
selection, escaping and CSS delivery without launching a browser.

```sh
# From this repository:
go test ./examples/gohtmx/minimal
go run ./examples/gohtmx/minimal
# Open http://127.0.0.1:8095; stop with Ctrl-C.
```

To turn it into a separate consumer, run from the repository root:

```sh
repo="$PWD"
app=$(mktemp -d)
cp "$repo/examples/gohtmx/minimal/main.go" "$repo/examples/gohtmx/minimal/main_test.go" "$app/"
cd "$app"
go mod init example.com/ely-starter
go get github.com/mrchypark/elysdui@v0.2.0
go mod tidy
go test ./...
go run .
```

For contributor work against a local checkout, use these commands instead of
`go get` in the setup above:

```sh
go mod edit -require github.com/mrchypark/elysdui@v0.0.0
go mod edit -replace github.com/mrchypark/elysdui="$repo"
```

Then run `go mod tidy` and the example as above. Dependencies must already be
cached for offline use. Confirm the selected version or local replacement with
`go list -m github.com/mrchypark/elysdui`.

Initialize `ui.NewTemplates()`, add app templates with `Parse`/`ParseFS`, and call
`ui.BindAssets(mux)` once before serving. Do not modify the template set after its
first execution. Render into a buffer before writing the response so a template
error cannot leave a half-written success response. Set an HTML content type.

The sample uses read-only GET and persists nothing. For mutations, use POST,
server validation, authorization and CSRF protection. [examples/gohtmx/form](../../examples/gohtmx/form)
shows validated form submissions and HTML/full-page responses. Neither demo is a
production authentication system.

## Discover components and props

There are three different naming/property surfaces; do not mix them:

1. **Basic Go templates:** `{{template "input" (dict "ID" "name" "Name" "name")}}`.
   Template/property names are case-sensitive. Inspect [COMPONENTS.md](COMPONENTS.md)
   and the relevant file under `ui/gohtmx/templates/`. Use `ui.Option` for native choices.
2. **Advanced Go components:** `ui.Component{Chapter: "documents", Name:
   "MarkdownRenderer", ID: "preview", Props: map[string]any{"Value": markdown}}`,
   rendered by `ui.RenderComponent(templates, writer, component)`. Go props use
   template keys such as `Value`, `Rows`, `AvatarURL`. `ui.ComponentDefinitions()`
   lists primary definitions and aliases; `ui.ResolveComponent(chapter, name)`
   resolves the family/template. Qualify ambiguous names with their chapter.
3. **SDUI JSON:** names such as `documents/MarkdownRenderer` and `basic/input`;
   properties use lower camel case (`value`, `rows`, `avatarURL`), including nested
   records. Use the typed contract, not a mechanical case conversion. See
   [agent SDUI workflow](../sdui/agent-sdui.md).

Discover one contract without loading the whole catalogue:

```sh
# Repository authoring tools:
go run ./cmd/sdui-catalogue -describe forms/Select
go run ./cmd/ely catalog -type documents/MarkdownRenderer
```

`ui/gohtmx/components.json` indexes stories/names; it is not a complete property schema.
Aliases may share renderers and are not separate full engines. A Go `Component`
ID must match `^[A-Za-z][A-Za-z0-9_-]{0,127}$` and be unique on the page.
Use caller-owned data; never import `internal/gallery` into an app or assume its
fixtures are production defaults. Check the corresponding `advanced-*.md` guide
for host events and behavior. `ely:action` is a request for a host operation, not
proof that an AI/file/payment/authentication operation happened.

## Load the assets your screen needs

Include `/assets/app.css` and `{{template "ui-component-assets"}}` once. Include
`/assets/htmx.min.js` when using htmx attributes, and `/assets/theme.js` if using
saved theme preferences. Advanced components also need `ui-advanced-assets` or
selected `ui-advanced-family-assets`; maps additionally need `ui-map-assets`.
Preload any family that a later fragment can introduce. See [asset loading](asset-loading.md).

`BindAssets` owns exact `GET /assets/...` routes and assumes root-mounted URLs.
Do not register duplicate exact routes. To customize exported assets, use your
own file server instead of `BindAssets`; keep license notices. `ely export -dir`
requires a destination that does not exist. It does not produce a standalone app.

Public embedded text assets negotiate gzip/Brotli/Zstandard automatically on the
current revision. This does not compress private HTML/actions. Do not enable
public dynamic compression for personalized or secret-bearing responses; see
[transport policy](../sdui/sdui-transport.md).

## Troubleshooting

- **Offline `go mod tidy` fails:** tidy may fetch dependencies used only by dependency
  tests (for example Brotli’s test dependency). Populate the cache while online.
  If `go test ./...` already succeeds, a tidy download failure alone does not mean
  the consumer cannot build; do not remove required module sums to silence it.
- **Unknown package/API:** confirm the Go version and module revision; v0.1.0 lacks SDUI.
- **Unknown component or property:** check chapter/name spelling and the typed contract;
  Go `Value` and SDUI `value` are different surfaces.
- **Unstyled/inert controls:** inspect asset 404s, include family assets up front, and
  verify root `/assets/` URLs. Use the shared swap-aware runtime, not a second initializer.
- **Template error after startup:** parse overrides before the first execution; check
  dictionary types and unsupported `Attrs` names. Only `data-*`, `aria-*`, `hx-*`
  names pass the Go attribute allowlist. Attribute values remain escaped.
- **HTMX replaces the entire page:** send the requested fragment for `HX-Request: true`
  and preserve the target ID; vary cached responses by `HX-Request`.
- **Looks correct but does nothing externally:** implement and authorize the host handler.
  The gallery's synthetic demonstrations are not external service integrations.
- **Want HTML content:** use escaped strings by default. Only pass `template.HTML`
  that your trusted renderer produced; never cast user input to it.
