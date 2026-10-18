# SDUI JSON design decisions

This is the rationale for the implemented v1 composition grammar. The aim is a
small, reusable screen document that can safely reuse existing Ely renderers,
with predictable authoring and validation. It is not a claim that declarative
UI, templates, typed actions or JSON schema tooling are novel.

## Primary-source comparisons

The references below were reviewed on 2026-10-14. They inform the choices; their
wire formats are not accepted as Ely screen schemas.

| Reference | Relevant mechanism | Choice in this runtime |
| --- | --- | --- |
| [JSON Forms controls](https://jsonforms.io/docs/uischema/controls/) | Controls identify their data-schema property through a `scope`; renderer behavior follows the declared property type | Keep component presentation, typed data contracts and request data separate. `props` carries literals; `bindings` carries references to request values |
| [DivKit templates](https://divkit.tech/docs/en/concepts/templates) | Parameterized template definitions reduce repeated card descriptions; the source also describes template chains and override propagation | Use screen-local `templates` with typed `params`, explicit `use` and `paramBindings`. Give each instance a lexical scope and deterministic IDs; do not implement implicit template-chain overrides |
| [Adaptive Cards template language](https://learn.microsoft.com/en-us/adaptive-cards/templating/language) | Array-bound `$data` repeats an element; explicit data scopes and `$when` control contextual rendering | Supply bounded `repeat` and `when` directives. Use named item variables and a small predicate AST rather than importing its interpolation/expression language |
| [DivKit typed actions](https://divkit.tech/docs/en/concepts/interaction#typed-actions) | Structured action objects make action parameters explicit instead of encoding them into action URLs | Keep event selectors, host action names, target regions and typed payload extraction separate. Never derive a server capability from an arbitrary widget label or URL |
| [JSON Schema structure and reuse](https://json-schema.org/understanding-json-schema/structuring) | `$defs` and references structure reusable schemas | Generate editor schemas from the actual registry and Property contracts. Runtime templates remain a separately typed UI feature, with no remote reference resolution |
| [RFC 6901 JSON Pointer](https://www.rfc-editor.org/rfc/rfc6901) | A standard reference syntax addresses JSON members and array elements, with defined escaping | Accept explicit slash paths and `~0`/`~1` escapes. Retain existing dotted paths for compatibility; scope prefixes are an Ely-specific extension |

## 1. Separate meaning rather than compressing every field name

A node's `type`, `props`, `bindings`, `events`, `slots`, `when` and `repeat` have
different roles. A string in `props` never suddenly becomes an expression, a URL
fetch, a template selector or a server action because it contains special text.
A field cannot supply both a literal and a binding. The renderer validates both
routes against the same property contract.

This costs a few explicit JSON keys but keeps validation and code review local.
Compactness comes primarily from reusable trees, shared request data and
bounded defaults, not ambiguous abbreviations or an embedded programming
language. Lower-camel-case wire props are mapped to the renderer's trusted Go
field names by the registered contract. Different components keep independent
contracts even when their field names match.

## 2. Local reusable definitions with typed inputs

Use one reusable definition for a repeated structural pattern, then supply only
its varying parameters. The [composition example](sdui-composition.md#reuse-and-parameters)
uses this for person rows. Literal `params` and dynamic `paramBindings` stay
separate, just like component props and bindings.

The compiler expands uses once, validates unknown/missing parameters and cycles,
and namespaces local IDs and targets. A template's root adopts the use ID;
its descendants get instance-specific IDs. Nested templates receive only their
explicit parameters and root data, with fresh repeat-variable scopes. This
prevents an unrelated outer loop or same-named parameter from silently changing
a reusable definition's meaning.

Templates are local to the screen. No remote imports, executable includes or
renderer-source overrides are permitted. Typed parameter contracts cannot
select trusted property targets or grant host-only capabilities.

## 3. Paths are data references

Legacy `profile.name` continues to address nested object fields. JSON Pointer
handles arrays and keys that cannot be represented by dotted identifiers.
Explicit `/@data`, `/@params` and `/@vars/<name>` domains distinguish request
data, template parameters and repeat items.

The domains are a runtime convention layered over pointer parsing; they are not
part of RFC 6901. `/@data` also provides an escape for literal root keys beginning
with `@`. Paths have byte/depth limits, reject malformed escapes and prototype
keys, and do not invoke methods or reflect over arbitrary objects. Declared
parameter object/array shapes give the compiler additional early diagnostics.

## 4. Conditions and repetition remain bounded

`when` has six explicit operators: `eq`, `ne`, `exists`, `all`, `any` and `not`.
They have typed scalar/null semantics and bounded complexity. Arbitrary
arithmetic, interpolation, function calls and ambient globals belong in the
host loader, where ordinary application tests and authorization can govern
them. A hidden branch still compiles, validates actions and contributes assets;
only its data-dependent rendering is skipped.

`repeat` requires an array and a stable item identity. An empty or omitted key
pointer means the scalar item itself; object items need a selected string or
integer key. Typed key encoding distinguishes string and numeric identities,
and hashing the complete nesting scope keeps IDs bounded and stable across
reordering. Duplicate keys fail rather than producing ambiguous DOM state.

A repeat runs before its per-item condition and parameter bindings. Region
boundaries remain outside conditional/repeated content. This deliberate limit
keeps action targets and direct partial rendering stable; it avoids introducing
an implicit scoped-region addressing language.

## 5. Composition is granted by the renderer contract

A structural container can have `children`. A catalogue/basic renderer can
accept only its explicitly registered named `slots`, with a known target,
allowed root types, required declaration and node budget. The slot's HTML is
produced by recursively rendering validated child nodes; schema strings do not
become trusted markup.

Form-content metadata includes forms hidden inside catalogue renderer branches.
The compiler carries it through containers, slots, repeats and reusable trees
so a visually harmless outer wrapper cannot hide an invalid nested form.

## 6. UI events do not define server authority

A registered event type determines which browser events are eligible. Optional
`sourceAction` values match exact advanced-widget labels. Each matching binding
selects a fixed host action and a stable target region. Ambiguous bindings fail
compilation, and all compiled action/target pairs must pass the host allowlist.

Typed payload extraction describes specific fields of `event.detail`; it does
not serialize arbitrary widget state or alter reserved transport fields.
Native form values, repeated fields, submitter values and files still use the
existing `FormData` path. Explicit mapped payload destinations should be distinct
from native control names, since a mapping replaces its selected form field.
The server revalidates all submitted values and record permissions. Browser
validation never establishes authorization.

## 7. Wire version and active revision are different

`version: "1"` identifies the grammar. The new directives are optional additions:
existing v1 screens still compile, while an older runtime may reject fields it
does not know. An incompatible grammar would require a new version and a
migration rather than silently reinterpreting old fields.

An active `Store` revision identifies a concrete validated configuration. It is
not the wire grammar version. Candidate compilation and capability checks happen
before compare-and-swap activation. A request captures one immutable snapshot,
and a later request from an obsolete page is rejected before an action runs.
This also avoids inserting a newly activated widget family into a page lacking
its initial assets.

History/rollback are bounded and in memory. They restore definitions, not
business state, and retain replay protection across activation. Production
draft storage, administration, authorization and durable idempotency remain host
responsibilities.

## 8. Authoring metadata comes from runtime contracts

`Registry.Definitions()` supplies independent snapshots; JSON Schema generation
uses the same scalar/structured shapes, required fields, defaults, enums,
limits, slots and registered event types. The [Draft 2020-12 dialect](https://json-schema.org/draft/2020-12/json-schema-core)
is declared explicitly. The CLI offers compilation, schema export and contract
inspection without running host actions.

Some constraints cannot be expressed completely as an editor schema: local
reference cycles, region placement through ancestors, generated-ID collisions,
aggregate expansion/byte budgets, host URL policy, authorization and future
loader data. The exporter labels that boundary. `Compile` and `Render` remain
the semantic authority, and typed payload metadata still requires host request
validation.

## Efficiency claims and limits

The implementation avoids repeatedly parsing bindings or expanding reusable
static structure on each request. Family assets are collected before rendering,
plans contain no user data, and one plan can serve concurrent requests. Repeats
only instantiate their bounded request-specific rows, and all fragments are
buffered within output limits before a write.

Reuse reduces repeated structural JSON when several nodes share a template; it
does not inherently reduce per-item data or final HTML. This document makes no
latency, memory or compression benchmark claim. Large screens still need real
workload measurements and appropriately scoped regions. Safety budgets are
part of the contract rather than a substitute for those measurements.

## Deliberate exclusions

There is no raw renderer selection, generic trusted HTML, arbitrary CSS/attrs,
JavaScript/expression execution, remote templates, automatic URL actions,
implicit global-variable propagation, repeated target regions or automatic
revision-conflict reload that could discard a draft. Provider-backed widgets
still need provider integrations. These limits are explicit so adding a safe
capability later requires a reviewed contract and corresponding tests.
