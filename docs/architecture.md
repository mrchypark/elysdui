# Monorepo architecture

The module is `github.com/mrchypark/elysdui`. These are separate public surfaces,
not interchangeable names for a single renderer.

## Standalone web UI

Import `ui "github.com/mrchypark/elysdui/ui/gohtmx"` for `NewTemplates`,
`BindAssets`, `Component` and `RenderComponent`. Shared templates, assets and the
component inventory live with this package. A conventional Go/htmx application
can use it without a JSON screen or any SDUI dependency.

`ui/gohtmx` must not import `sdui` or any adapter. Gallery fixture data stays in
`internal/gallery`; it is never a production component default.

## Semantic core

Import `"github.com/mrchypark/elysdui/sdui"` for renderer-neutral schema,
registry, validation, composition and resolved semantic trees. The core has no
HTML template, catalogue UI, browser asset or web rendering dependency.
`sdui.NewRegistry(options...)` constructs a semantic registry without a template
set. Native Go hosts use this package. `DefaultRegistry()` supplies built-in semantic
contracts; `Compile` produces a plan whose `Resolve`/`ResolveRegion` methods
return resolved nodes and whose `ResolveNative` applies native capabilities.
See the [semantic core guide](sdui/core.md).

## Go/htmx adapter

Import `"github.com/mrchypark/elysdui/adapters/gohtmx"` for the web renderer
(package name `gohtmx`). It imports the semantic core and standalone UI, and owns
HTML compilation/rendering, catalogue contracts and browser HTTP actions.
Call `gohtmx.BindAssets(mux)` once to register UI assets and the SDUI bridge
together, instead of also calling `ui.BindAssets`. The bridge lives in
`adapters/gohtmx/assets`; standalone UI assets stay in `ui/gohtmx/assets`.
The adapter’s `Files` combines both for web previews and exports. `ely export`
exports the standalone UI surface, not an SDUI application.
`gohtmx.NewRegistry(tpl, options...)` accepts the UI template set;
`gohtmx.DefaultRegistry()` and `gohtmx.CatalogueRegistry()` construct the built-in
web surfaces. `Compile`, `Render` and HTTP integration belong to this adapter.

The detailed [web SDUI guide](sdui/sdui.md) and runnable
[web example](../examples/sdui/web) describe this layer. Some snippets import it
as `sdui` to keep code concise. That local alias still refers to the web adapter,
not the renderer-neutral core. Do not import the core expecting HTML helpers.

## Native adapters and contracts

SwiftUI is under `adapters/ios`; Jetpack Compose is under `adapters/android`.
The versioned protocol, schema, support matrix and fixtures are under
`contracts/native/profile-v1`. The Go host is `examples/native-profile` and
platform CI helpers are under `scripts/ci/native`.

These clients implement a bounded profile and controls example, not the entire
web catalogue. Capability support is explicit in the contract. See the
[native guide](native/README.md) and [support matrix](native/SUPPORT.md).
There is no implemented GPUI adapter. Upstream Ely GPUI remains a separate
visual/component reference with its attribution retained.

## Examples, docs and verification

- `examples/gohtmx/{minimal,form,map-tiles,gallery}`: standalone UI.
- `examples/sdui/web`: web SDUI adapter.
- `examples/sdui/project-charts`: conventional UI and SDUI chart routes.
- `examples/native-profile`: semantic core/native transport plus an independently compiled web preview.
- `docs/gohtmx`: component, asset and theme references.
- `docs/sdui`: web SDUI authoring, composition, catalogue and transport.
- `docs/native`: native setup, support and design notes.
- `ui/gohtmx/tests/unit`, `tests/browser`, `tests/fixtures`: UI checks.
- `adapters/gohtmx/tests/unit`, `tests/browser`: web SDUI checks.

Run the [contributor checks](contributing.md). A successful server test does not
establish browser or native-device behavior. v0.2.0 introduces this breaking layout;
v0.1.0 verification remains historical evidence only.
