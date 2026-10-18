# Explicit empty submenu contracts

This bounded addition preserves an explicitly empty child menu from both upstream
source references, `49ed1f84056fa13347d68801b479a4a5a8e03b53` and
`da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721`. It does not change the source pin in
[the interaction guide](advanced-interaction.md), implement other missing menu
APIs, or establish native/browser evidence without a completed corresponding run.

## Caller representation and precedence

In a row, an allocated Go slice/array in `Items`, including an empty slice, means
submenu. SDUI uses the same presence contract with `"items": []`. Missing `Items`,
a nil slice, or a nil pointer remains a leaf in Go; omitting `items` remains a leaf
in SDUI. SDUI `null` remains invalid. Go pointers to arrays/slices follow the same
presence rule. Invalid scalar/object child values fail rendering instead of
becoming clickable actions.

For example, `map[string]any{"Label": "Recent", "Items": []map[string]any{}}`
or `{"label":"Recent","items":[]}` creates an empty submenu. To render an action
instead, omit the child property. A present empty array intentionally takes
precedence over `Action`, `Radio`, `Checkbox`, `Selected`, and inherited checkbox
host behavior, exactly as a nonempty child menu does. The row has `role=menuitem`,
`aria-haspopup=menu`, and a unique controlled, named, initially hidden panel with
`tabindex=-1`; it emits neither leaf actions nor check/radio changes.

Empty child entry via ArrowRight, Enter, Space, or pointer hover/click focuses the
child panel. ArrowLeft or Escape closes only that child and restores its parent
row. A focused empty or all-disabled panel consumes Up/Down/Home/End keydown and
both Enter/Space phases without moving focus, scrolling, or dispatching an action.
Disabled rows stay unavailable. Repeated entry, parent dismissal, and replacement
reuse the existing menu lifecycle. Shortcut text remains display-only.

## Bounded SDUI correction

The generated catalogue remains recursively bounded. At the terminal child
property, the old truthiness expression accidentally inferred `items` as boolean:
`false` compiled and rendered as a leaf; `true` compiled but failed during template
iteration; an empty array was rejected. Fifteen menu contracts contained this
artifact. This addition intentionally replaces only those terminal properties
with an `array` carrying the `empty-array` semantic format. It accepts exactly
`[]`; omission still renders a leaf. It rejects null, booleans, strings, objects,
and every nonempty array, including `[{}]`. Further nesting is not granted.

The bound occurs after six row levels, or seven for `menus/MenuBar Menu`, whose
outer items introduce a separate host level. Shallower typed row contracts and
non-menu contracts are unchanged. This does not claim behavior parity for all
aliases or separate menu presentations sharing the row helper.

`empty-array` is a narrow array validation constraint. Registration rejects it on
other types and rejects nonempty defaults. Host format extensions cannot
override this intrinsic format. Compile, bound-data rendering, editor
JSON Schema (`maxItems: 0`), and the playground validator agree. Ordinary
`MaxItems: 0` continues to mean the existing default bound. No native wire model
or native renderer is changed.

The standalone helper and runtime stay in `ui/gohtmx`, which has no SDUI
imports. Semantic normalization stays in `sdui`; HTML catalogue inference remains
in `internal/sduicatalogue`, and combined web-renderer fixtures live in
`adapters/gohtmx/tests`. The current pointermove-based menu hover routing and
deterministic boundary replay are retained.

## Verification and evidence boundaries

- [Standalone Go tests](../../ui/gohtmx/menu_empty_submenu_test.go) and
  [actual SDUI tests](../../adapters/gohtmx/menu_empty_submenu_test.go) cover qualified and
  chapter lookup, canonical hosts and their row-sharing aliases, escaped labels,
  nil/array/pointer handling, errors, and all fifteen terminal contracts with
  literal and bound data. The exact truthiness regression is reproduced by
  reparsing one expression of the embedded production template.
- [Inference tests](../../internal/sduicatalogue/menu_test.go) protect the array type
  from boolean/string inference. [Format tests](../../sdui/empty_array_test.go) and
  [playground checks](../../scripts/empty-array-contracts-test.mjs) protect the
  terminal boundary and existing zero-limit semantics.
- [Deterministic runtime checks](../../ui/gohtmx/tests/unit/menu_empty_submenu_test.mjs) execute bounded
  production functions for focus ownership, disabled entry, empty-panel key
  containment, hover/repeated click, action suppression, and recursive close.
  These are not actual-browser results.
- [Causal oracle self-checks](../../adapters/gohtmx/tests/unit/menu-empty-submenu-oracles-test.mjs)
  verify all six mutation anchors, five positive/mutant runtime observations,
  exact failure classification, and all sixteen actual renderer fixture variants
  without importing or launching a browser.
- The [production renderer fixture](../../adapters/gohtmx/tests/fixtures/menu-empty-submenu/main.go) and
  [browser suite](../../adapters/gohtmx/tests/browser/menu-empty-submenu-browser-test.mjs) use qualified
  Go, chapter Go, and actual SDUI compilation, production CSS/runtime and real
  HTMX requests. They cover native focus/pointer behavior and innerHTML/outerHTML
  replacement independently for all three renderers, plus Tab/Shift+Tab and
  focusable/blank outside dismissal. Exact source mutants must
  fail their designated assertion after the exact prerequisite check/oracle
  prefix; startup failures, missing locators, page errors and timeouts never count.

```sh
go test ./ui/gohtmx ./adapters/gohtmx ./sdui ./internal/sduicatalogue -run 'TestMenu|TestEmptyArray' -count=1
node scripts/empty-array-contracts-test.mjs
node ui/gohtmx/tests/unit/menu_empty_submenu_test.mjs
node adapters/gohtmx/tests/unit/menu-empty-submenu-oracles-test.mjs
node adapters/gohtmx/tests/browser/menu-empty-submenu-browser-test.mjs
for mutant in template-truthiness focus-fallback focus-return panel-navigation panel-confirm cleanup; do
  MENU_EMPTY_NEGATIVE_CONTROL="$mutant" node adapters/gohtmx/tests/browser/menu-empty-submenu-browser-test.mjs
done
```

Browser evidence is written under `test-results/contracts/menu-empty-submenu*.json`
with source/served hashes, fixtures, mutation identity, precise failure location,
and actual replacement requests. Running Go, source, VM, or fixture-generation
checks does not establish that the browser suite passed. Local browser execution
was intentionally not run during this port; actual browser proof remains a CI
gate for the exact integrated revision. Semantic core regression coverage must
also pass the existing native CI without expanding the native feature scope.
