# SDUI composition grammar

Version `1` retains its existing node, literal, dotted-binding and event syntax.
The optional fields below add local reusable trees, JSON Pointer bindings,
conditions, keyed repetition and registered slots. They do not evaluate code,
import external definitions or accept arbitrary HTML.

## Reuse and parameters

```json
{
  "version": "1",
  "id": "people",
  "templates": {
    "person": {
      "params": {
        "name": { "type": "string", "required": true }
      },
      "root": {
        "id": "personRoot",
        "type": "text",
        "bindings": { "text": "/@params/name" }
      }
    }
  },
  "root": {
    "id": "results",
    "type": "region",
    "children": [
      {
        "id": "personRow",
        "use": "person",
        "repeat": { "items": "/people", "as": "person", "key": "/id" },
        "paramBindings": { "name": "/@vars/person/name" }
      }
    ]
  }
}
```

The host can render this screen with data such as:

```json
{"people":[{"id":"ada","name":"Ada"},{"id":"grace","name":"Grace"}]}
```

`templates` is a screen-local map. Each definition declares `params` using
bounded `Property` contracts, plus one `root` node. It cannot select a Go
template, remap parameter property names with `target`, or grant a resource
policy or trusted-HTML capability. Scalar, closed object, array, constrained
union and nullable contracts use the same validation as registered properties.

A use node has `id`, `use`, optional literal `params`, optional `paramBindings`,
and optional `when`/`repeat`. It cannot also supply `type`, component props,
children, slots or events. A parameter cannot be both literal and bound.
Required parameters without a default must be supplied. Unknown parameters,
unknown references, invalid defaults, reference cycles and expansion beyond the
budgets fail compilation, including invalid unused definitions.

Each use receives its own parameter scope. Nested uses bind their inputs from
the caller's scope, then enter a fresh parameter/repeat-variable scope. They
can still read explicitly named root data. A template cannot capture an outer
repeat variable implicitly; pass that value through `paramBindings`.

The template root adopts the use node's ID. Descendant IDs normally become
`<use-id>--<local-id>`; long identities use bounded SHA-256-derived IDs. Local
event targets are rewritten to the matching instantiated region. Nested uses
retain access to their enclosing template's rewritten targets. Any final ID
collision is rejected. `Plan.Events()` and `Plan.HasRegion()` expose actual
compiled event targets and region IDs.

Direct `RenderRegion` reconstructs enclosing parameter scopes, so a region
inside a reused template renders with the same caller parameters as a full
screen render. No caller data is cached in the plan.

## Bindings

Existing dotted paths such as `profile.name` continue to work. A leading slash
selects RFC 6901 JSON Pointer syntax:

- `/people/0/name` reads an array element
- `/a~1b/~0key` reads object keys `a/b` and `~key`
- `/` reads an empty object key
- `/@data/people` explicitly reads root request data
- `/@data` reads the complete root data object
- `/@params/name` reads the current reusable template parameter
- `/@vars/person/name` reads the named repeat item

Literal root keys beginning with `@` can be addressed through `/@data`, such
as `/@data/@params`. Pointer escapes must be exactly `~0` or `~1`. Array
indices are non-negative decimal integers without leading zeros; `-` is not a
read index. Paths are at most 512 bytes and 32 pointer segments. Legacy dotted
paths retain their 16-segment limit. Prototype-related key spellings remain
forbidden.

Request objects are `map[string]any`; arrays are `[]any`, `[]map[string]any`
or `[]string`. Traversal never invokes methods or reflects over arbitrary Go
objects. A normal property binding must exist and pass the registered property
contract before any output is written. Parameter paths are also checked against
their declared object/array shape during compilation when that shape is known.

## Conditions

```json
{
  "id": "savedMessage",
  "type": "text",
  "props": { "text": "Saved" },
  "when": {
    "op": "all",
    "conditions": [
      { "op": "exists", "path": "/status" },
      { "op": "eq", "path": "/status", "value": "saved" }
    ]
  }
}
```

Supported predicates are:

- `exists`: one `path`; true for a present value, including null
- `eq` / `ne`: one `path` and a scalar/null `value`; missing paths return false
- `all` / `any`: 1–32 child `conditions`, evaluated with short-circuit semantics
- `not`: exactly one child in `conditions`

Equality is typed. Strings and booleans are never coerced to numbers; a
non-null type mismatch fails rendering. JSON numbers compare by their exact
bounded decimal values. A present null equals null and differs from a non-null
value. An omitted equality `value` has the same meaning as null. Traversing
through a scalar instead of an object/array is invalid data, rather than a
missing terminal key.

Every condition is limited to 128 predicates and depth 16. Compile-time
validation includes hidden branches, their props, event capabilities and asset
families. Runtime property bindings and nested content are evaluated only for
shown nodes. An outer false condition therefore permits otherwise missing
bindings in its skipped descendants.

## Keyed repetition

```json
{
  "id": "row",
  "type": "text",
  "repeat": { "items": "/people", "as": "person", "key": "/id" },
  "bindings": { "text": "/@vars/person/name" },
  "when": { "op": "eq", "path": "/@vars/person/active", "value": true }
}
```

`items` is a binding to an array. `as` declares a local item name; `key` is a
JSON Pointer relative to that item. An empty or omitted `key` identifies a scalar item by its complete value;
writing the empty pointer explicitly is recommended. Keys must be unique strings or exact
integers. String `"1"` and integer `1` are distinct; equivalent integer spellings
are the same key. Missing, duplicate, fractional, object or trusted-HTML keys
fail the entire render.

Repeating a node establishes the item scope before evaluating its `when`,
parameter bindings, props and children. Thus a condition on a repeated node is
a per-item condition. Nested repeats must use distinct variable names within
one template scope. Stable IDs incorporate the complete enclosing repeat-key
scope with SHA-256, preserving the same node/control IDs across reordering
without exposing item keys in HTML IDs. An empty array renders no instances.

Regions cannot be repeated or conditional, including through ancestors,
reusable trees or slots. Put an always-present region outside the variable
content, and target that region from repeated controls. This keeps action
targets stable and independently replaceable.

## Named slots

Slots are opt-in host capabilities. A trusted definition can declare:

```go
Slots: map[string]sdui.SlotDefinition{
    "content": {Target: "Content", Required: true,
        AllowedTypes: []string{"text", "stack"}, MaxNodes: 20},
}
```

A screen can then supply only a tree of ordinary nodes:

```json
{
  "id": "card",
  "type": "card",
  "slots": {
    "content": [
      { "id": "message", "type": "text", "props": { "text": "Hello" } }
    ]
  }
}
```

The registered target receives internally rendered child markup. Schema
strings and bound values never become trusted slot HTML. Unknown slots,
missing required declarations, disallowed direct child types and expanded
slot node counts over `MaxNodes` are rejected. Type restrictions also inspect
the concrete root of a reusable child. `MaxNodes: 0` uses only the global node
limit. A required slot requires a nonempty declared child list; conditions and
empty repeats may still make its rendered content empty.

Ordinary `children` remain limited to structural containers. Catalogue
components carrying `ContainsForm` cannot appear inside structural forms or
another form-containing adapter, even through reuse, repetition or slots.

## Budgets and atomic rendering

- Input JSON: 1 MiB; strict fields, duplicate-key checks and bounded nesting
- Screen templates: at most 128; parameters per definition/use: at most 64
- Compiled expansion and per-render node expansion: at most 1,000 nodes
- Compiled nesting, including reuse levels: at most 32
- Normalized values: aggregate limits defined by the property runtime, applied
  to compilation and independently to each render
- Intermediate and final markup: each capped at 2 MiB

Reusable directives count toward the expanded-node budget. Repeated instances,
including those whose per-item condition is false, consume the runtime node
budget. A slot's expanded-node budget is checked both statically and after
repetition. Failures leave the destination writer untouched; final writer
errors are returned normally. Full and partial rendering share these checks.

Asset families are collected across hidden, repeated, slotted and reusable
nodes before data-dependent selection. Compiled plans are immutable and safe
for concurrent requests, provided the host does not mutate a request's data
while it is rendering. `RenderContext.Revision`, when set by the host, is emitted
on the full screen wrapper for the revision-aware action protocol.

## Editor schema and CLI

```sh
# Compile using all registered catalogue aliases and public basic adapters.
go run ./cmd/ely validate ./screen.json

# The ten backward-compatible core types only; stdin is supported.
cat ./screen.json | go run ./cmd/ely validate -registry core -

# Generate an editor schema from the selected registry.
go run ./cmd/ely schema > ./sdui.schema.json

# Inspect all contracts, or one exact registered name.
go run ./cmd/ely catalog > ./sdui.catalog.json
go run ./cmd/ely catalog -type forms/Switch
```

`ely sdui validate`, `ely sdui schema` and `ely sdui catalog` are equivalent
aliases. Flags precede the filename. `-registry core` selects the ten core
types; the default `catalogue` registry adds the reviewed catalogue and
public basic adapters. Validation exits 0 on a compiled screen, 1 on invalid
input, missing files or a failed registry/export, and 2 on incorrect usage.
It never calls a loader, executes an action, renders against unknown data,
activates a revision or writes the input file. Host applications still need
loader/action registration, authentication, authorization and data validation.

The Go APIs `sdui.JSONSchema(registry)` and `registry.JSONSchema()` return an
independent JSON-compatible map. The exported [Draft 2020-12 schema](https://json-schema.org/draft/2020-12/json-schema-core)
uses the same registry definitions and recursive property contracts as the
runtime: component-specific literal props, bindings, required literal-or-bound
values, mutually exclusive event forms, safe slot declarations and composition
syntax. Default object values are converted back to their author-facing wire
field names. The catalogue command exposes exact registered definitions rather
than gallery fixture values.

Configure the editor's schema association externally; adding `$schema` to a
screen itself is not supported by the strict runtime grammar. JSON Schema is
an editor aid. It cannot prove host capability registration, URL policy,
template reference resolution, ID uniqueness, conditional region placement,
aggregate byte/node budgets, or the types of future loader data. `Compile` and
`Render` remain authoritative. Unicode `maxLength` hints are accompanied by
`x-ely-maxBytes`, because the runtime limits UTF-8 bytes rather than code points.
