# SDUI catalogue contracts

The catalogue registry exposes 624 primary components and all 1,313 distinct
chapter-qualified names across 44 chapters, plus the 48 public basic templates
listed in `COMPONENTS.md`. It uses their actual renderer branches and recursively
typed caller props. It does not register empty aliases or load gallery data at
runtime.

## Use the catalogue

```go
registry, err := sdui.CatalogueRegistry()
// Existing DefaultRegistry remains the same eight-definition core surface.
// Alternatively, call sdui.RegisterCatalogue(yourRegistry).
```

Catalogue names retain their exact spelling, including spaces. Basic templates
use `basic/<template-name>` so they do not collide with structural primitives or
existing short names:

```json
{
  "version": "1",
  "id": "people-screen",
  "root": {
    "id": "people",
    "type": "tables/DataTable",
    "props": {
      "columns": [{"label": "Name"}, {"label": "Status"}],
      "rows": [
        {"cells": ["Alice", "Ready"]},
        {"cells": ["Bob", "Pending"]}
      ]
    }
  }
}
```

All fixed object fields use lower camel case, including nested records. The
contract's `target` records the exact Go template key: `url` maps to `URL`,
`ariaLabel` to `AriaLabel`, and `avatarURL` to `AvatarURL`. Typed dictionaries,
such as `forms/ExpressionInput`'s `variables`, preserve business keys instead of
renaming them. Unknown fields and incorrect nested values are errors, with the
failing property path in the diagnostic.

`CatalogueContracts()` returns independent contract copies for editor
completion, documentation, or schema tooling. `CatalogueInfo()` returns coverage
metadata. `RegisterCatalogue` validates the whole batch before installing it;
a duplicate registration does not partially modify the registry.

## Generation and review

```sh
go generate ./adapters/gohtmx
go run ./cmd/sdui-catalogue -check
go run ./cmd/sdui-catalogue -describe forms/Select
```

The generated files are deterministic compact JSON. `-describe` prints one
readable contract. CI should run the check command or the corresponding Go
regeneration test after template, catalogue, fixture, or generator changes.

- `adapters/gohtmx/catalogue_manifest.json.gz`: production metadata and contracts only
- `adapters/gohtmx/testdata/catalogue_fixtures.json.gz`: explicit caller input used only by tests
- `internal/sduicatalogue`: build-time extraction and reviewed policy annotations
- `internal/gallery/sdui_fixtures.go`: build-time fixture exporter

The runtime imports neither `internal/gallery` nor `internal/sduicatalogue`.
There are no fixture-derived defaults in the production manifest. Omitted props
remain omitted; normal trusted-template fallback labels retain their existing
behavior.

The source evidence is 639 distinct raw fixtures plus 742 preview instances.
Alias-specific `aliasFixtureProps` changes and preview overrides participate in
type inference. The generated test file has 2,159 deduplicated rendering cases.
Its `source` and optional `sources` retain all contributing examples;
`excluded` explains projection of unused gallery baseline keys and unsupported
capabilities. Projection occurs only while preparing test examples. User input
is validated strictly and is never silently projected.

The live gallery's relative-time examples continue using the current time.
Only the generator's independent copies use fixed timestamps.

## How the contract is derived

1. Resolve names using `ui.ResolveComponent`, including primary-over-alias
   precedence and the exact chapter/name identity
2. Collect independent raw, preview, and alias-adjusted fixture shapes
3. Analyze the real `html/template` parse trees, specializing fixed `Kind`,
   `Chapter`, `Variant`, and `ComponentName` selectors
4. Follow both data-dependent branches; track dot, `$`, range variables,
   assignments, `with`, helper calls, `index`, `dict`, and `withProps`
5. Preserve provenance through helper argument mapping: a helper's `Heading`
   supplied by `.Title` observes the caller's `Title`, not a new root `Heading`
6. Constrain fixture objects to reachable renderer fields and add optional
   fields identified by renderer operations. Integer-only helpers, ranges,
   comparisons, text output, and boolean-only conditions provide typed evidence
7. Merge array-record fields as optional members and heterogeneous scalar data
   as finite `oneOf` alternatives. Closed object schemas remain component-local
8. Apply explicit sink policies, form-composition metadata, map asset metadata,
   and bounded size exceptions, then serialize in a stable order

The generic workspace data serializer is handled specially: it preserves the
closed fixture-derived structure rather than turning every object into an
untyped dictionary. Recursive tree helpers and generated schemas remain bounded
by the runtime's value-depth limit. Unobserved output-only scalar fields are
conservatively exposed as escaped strings, rather than arbitrary JSON values.
Required fields are never inferred merely from their presence in examples.

Map-view coordinate fields have an explicit numeric annotation independent of
fixture values: `center.latitude`, `center.longitude`, and latitude/longitude
inside `points` and `routes[].points`. This applies to `basic/map-view` and every
qualified map-view renderer and alias. Decimal and integer JSON numbers are
accepted and normalized to finite float64 values; strings and non-finite values
are rejected. Callers using quoted coordinates in formerly string-inferred fields
must migrate those values to JSON numbers. Coordinate-display text and GeoJSON
retain their separate schemas.
This does not add geographic range validation or change the browser map engine.

Per-component contracts matter. `forms/TextArea.rows` is an integer, while
`tables/DataTable.rows` is an array of row objects. `Items`, `Groups`, `Columns`,
`Status`, `Variables`, `Value`, and other similarly named fields also differ
between components. There is no global permissive property dictionary.

## Safety and limits

All values remain ordinary data. JSON is never coerced to `template.HTML`,
`template.CSS`, `template.JS`, or `template.URL`.

- Links, images, media, and Markdown destinations accept local absolute paths
  and fragments by default. External HTTP(S) URLs require an explicit
  `WithURLPolicy`; executable schemes, credentials, ambiguous protocol-relative
  forms, controls, and backslashes remain rejected even with that policy
- Native form-name sinks use `identifier`, including the core restriction on
  leading underscores. Display-only record names remain plain text
- Known SVG and browser color sinks use `color`; font-family and CSS custom
  property names have separate bounded formats. Canvas style objects have
  closed field schemas, numeric geometry, and validated color/token members
- Action sinks carry bounded host action keys. Schema event handlers still
  select host-registered actions and authorized replacement regions
- `misc/WebView` and `misc/IframeEmbed` aliases may use `sandbox-html` only
  through their reviewed fixed `sandbox=""` iframe renderer. The validator
  accepts static markup and audits its resource URLs; script/style/event
  attributes, nested frames, and other executable document features fail
- `Devtools` is a narrowly scoped `inert-data` capability only on the exact
  closed `Devtools` root property of `devtools/*` components. It preserves
  escaped YAML `template` keys, SQL join `on` values, and request endpoint
  metadata. It does not authorize network requests or a template selector
- Inline Lottie supports bounded vector-only JSON. Asset/font/audio imports,
  expressions, effects, repeaters, and resource-bearing layers are excluded.
  `AnimationURL` is intentionally unavailable through SDUI until fetched
  documents can receive equivalent resource validation
- Arbitrary `Attrs`, class/CSS injection, event-handler attributes, native
  `FormAction`/form-association overrides, and schema-selected templates are
  unsupported. Overlay DOM-target selectors remain host-owned. The relevant
  contract includes an explicit exclusion

Default per-value limits remain 16 KiB strings, 1,000 array items, and 128 object
properties. Reviewed schema overrides may reach hard limits of 256 KiB, 4,096,
and 1,024 respectively. Values are also bounded by depth 16, 32,768 total values,
and 2 MiB normalized data. Screens retain their 1 MiB JSON limit, and rendering
retains its 2 MiB output limit.

Three generated overrides preserve the real source examples without truncation:
`forms/EmojiPicker.options` allows up to 4,096 entries for its 1,914-option source,
and `media/3DModelViewer.vertices` and `faces` allow up to 256 KiB each (the
largest current source string is 79,056 bytes). No other fixture is silently
shortened to claim coverage.

Terminal execution, model/AI calls, databases, filesystem access, identity and
payment services, and native operating-system integration remain host-owned.
Component support includes their renderer and safe data/event surface; it does
not implement those external services or request browser permissions.

## Verification

The Go tests verify:

- Exact reconciliation of 624 primaries, 1,313 names, 44 chapters, and 48 basics
- All 2,159 generated cases decode, compile, and render through SDUI
- Every one of the 1,361 names responds to a meaningful caller-data mutation;
  changing only the catalogue wrapper's `Disabled` flag does not count
- Every raw/preview source is retained as evidence; production defaults are empty
- Recursive shape preservation, property targets, optional fields, bounded
  unions, and typed dictionaries
- Rejection of unsafe nested URLs, HTML, CSS, form overrides, resource-bearing
  Markdown/Lottie input, unknown fields, and reserved form names
- Independent metadata copies, atomic registration, and byte-identical rebuilds

The small `join` template helper accepts both native `[]string` and JSON-decoded
`[]any` containing only strings. Mixed elements fail instead of being coerced;
this preserves the actual Typewriter component when called through JSON.

Browser verification is complementary: server-side coverage exercises every
qualified renderer, while browser tests establish asset initialization,
interaction, and isolation. A successful identity wrapper alone is never
counted as component support.

Generated manifest and fixture JSON are stored in deterministic gzip form to reduce repository and embedded-binary size. `ely catalog` exports readable JSON; `go generate ./adapters/gohtmx` reproduces the compressed artifacts. Production imports no fixture or generator code.
