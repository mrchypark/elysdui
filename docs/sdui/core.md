# Semantic SDUI core

Import `"github.com/mrchypark/elysdui/sdui"` for screen decoding, semantic
contracts, compilation and resolution. This package does not import the UI
library, render HTML or serve browser assets. This package is included in
`github.com/mrchypark/elysdui@v0.2.0`; see the pinned release and local contributor
[setup](../gohtmx/getting-started.md). The historical v0.1.0 release does not include SDUI.

## Compile and resolve

```go
import "github.com/mrchypark/elysdui/sdui"

registry, err := sdui.DefaultRegistry()
if err != nil { return err }
screen, err := sdui.Decode(schemaReader)
if err != nil { return err }
plan, err := sdui.Compile(screen, registry)
if err != nil { return err }
nodes, err := plan.Resolve(sdui.ResolveContext{Data: data})
if err != nil { return err }
// The host passes nodes to its trusted target renderer.
```

`Resolve` and `ResolveRegion` return fresh resolved semantic nodes with IDs,
control IDs, types, properties, children, slots and events. Bindings, conditions
and stable-key repetitions are resolved on the server. A screen definition does
not grant a renderer or business operation permission to run.

`NewRegistry(options...)` constructs a custom semantic registry without an HTML
template set. Core definitions do not select templates, UI components, chapters,
families or assets. `JSONSchema` and `Registry.JSONSchema` support authoring tools.

## Contract ownership

`Screen`, `Node` and `TemplateDefinition` are the shared authoring model. Template
parameter declarations use the core `Property` type, including in web screens.
Web registry properties use the adapter's `Property` type to add explicit target
field mappings; renderer bindings never appear in core properties or slots.

A trusted host can register additional string or closed-object validation rules
with `WithFormats`. Unknown formats fail closed, built-in rules cannot be
replaced, and registered definitions retain policy snapshots. Callbacks are
trusted host code and must be concurrency-safe. Web-only formats such as
sanitized HTML and Markdown are supplied by the Go/htmx adapter, not the core.

A web plan exposes its immutable semantic plan through `SemanticPlan()`. Hosts
can resolve it without changing the adapter's registry snapshot or HTML bindings.

## Native profile

`plan.ResolveNative(regionID, sdui.ResolveContext{Data: data}, capabilities)`
produces the bounded native tree with explicit capability checks. See
[the native protocol](../../contracts/native/profile-v1/PROTOCOL.md),
[support inventory](../native/SUPPORT.md) and
[runnable Go host](../../examples/native-profile).
Host authentication, authorization, persistence and action transport remain
application responsibilities. Unsupported capabilities are errors, not a
fallback to HTML or a success placeholder.

## Web rendering

Use `github.com/mrchypark/elysdui/adapters/gohtmx` for HTML, catalogue registration,
`Store`, HTTP actions and browser assets. Its `NewRegistry(tpl, options...)`
accepts trusted templates. Its plan wraps semantic resolution with HTML methods.
The [web SDUI guide](sdui.md) sometimes aliases that package as `sdui`; this is a
local import alias, not an HTML API in the semantic core.

See [architecture](../architecture.md) for dependency direction and examples.
