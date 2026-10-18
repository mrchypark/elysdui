# Exact menu alias defaults

This bounded increment covers `menus/RadioMenuItem` and `menus/OverflowMenu`
through both `ui.RenderComponent` and the SDUI catalogue registry. They continue
to share the existing primary renderers. This is not a new widget registration
or a change to all names within either story.

## Source and compatibility decision

The historical menu source pin remains
`49ed1f84056fa13347d68801b479a4a5a8e03b53`; the additional audit pin remains
`da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721`. At both revisions:

- `tasks/ch01-10.md` maps RadioMenuItem to `MenuItem::radio`, separately from
  `MenuItem::check`; `src/menus/model.rs:45-53` distinguishes their row kinds.
- `src/menus/hosts.rs:115-154` gives `OverflowMenu` an ellipsis icon trigger,
  without a primary action. `SplitButton` is a separate host at lines 157-220.
  The entire hosts file is identical between these pins.

The [interaction guide](advanced-interaction.md) already documents alias
identity (`Variant`/`ComponentName`) and the canonical DropdownMenu's legacy
omitted-Host split presentation. It did not explicitly promise that selecting
RadioMenuItem would default to checkboxes or that OverflowMenu would default to
a split primary action. The alias-specific defaults below correct those
mismatches while preserving the documented canonical compatibility surface.

## Exact behavior

- `menus/RadioMenuItem`: direct leaf rows default to radio semantics when `Radio`
  is omitted. Explicit `Radio: false` retains checkbox semantics. `Checkbox: true`
  also retains checkbox semantics unless `Radio: true` is set; explicit radio
  continues to win when both flags are true. `Checkbox: false` does not suppress
  the radio alias default. `Group`
  defaults to `default`, and `Selected`, `Disabled`, and `Action` keep their
  existing meanings. Submenu triggers remain ordinary menuitems, and the alias
  default does not propagate into nested menus. Give nested rows explicit kinds.
- `menus/CheckboxMenuItem`: its checkbox default and explicit radio rows remain
  unchanged.
- `menus/OverflowMenu`: omitted or empty `Host` selects the ellipsis-only overflow
  presentation. Explicit `Host: "dropdown"`, `"split"`, or `"overflow"` wins.
- `menus/DropdownMenu` and `menus/SplitButton`: omitted or empty `Host` retains
  the legacy split presentation. `buttons/SplitButton` remains a distinct exact
  name and registration.
- SDUI uses the same semantics with lower-camel properties (`radio`, `checkbox`,
  `host`, `items`, and so on). These are renderer defaults, not injected sample
  data or new registry property defaults.

Radio selection still updates only the matching group in the nearest panel,
closes before change/action observers, and invokes the caller when reselecting
an already selected radio. Failed caller operations leave the local choice
visible until the owner replaces or updates it. These events do not assert
persistence or authorization. Overflow activation uses the existing menu action
path. Disabled roots and rows suppress both paths.

## Verification boundaries

[Standalone Go tests](../../ui/gohtmx/menu_alias_defaults_test.go) and
[SDUI adapter tests](../../adapters/gohtmx/menu_alias_defaults_test.go) render actual public names, verify
radio and checkbox overrides, grouping attributes, selected/disabled state,
escaping, accessible trigger relationships, and all explicit host presentations.
The catalogue manifest changes only its source hash.

The [browser fixture](../../adapters/gohtmx/tests/fixtures/menu-alias-contracts/main.go) renders the exact qualified Go, Chapter/Name Go,
and SDUI aliases using production templates. The
[browser requirements](../../adapters/gohtmx/tests/browser/menu-alias-contracts-browser-test.mjs) cover
native keyboard/click activation, callback order, rejection of both aliases on all
three rendering surfaces, disabled inputs,
focus restoration, and actual innerHTML/outerHTML HTMX replacements. Each alias
and rendering surface is replaced once with innerHTML and once with outerHTML;
removed controls must be inert, owner
selection restored, and the new instance must dispatch exactly once.

```sh
go test ./ui/gohtmx ./adapters/gohtmx -run TestMenuAlias -count=1
node adapters/gohtmx/tests/browser/menu-alias-contracts-browser-test.mjs
MENU_ALIAS_NEGATIVE_CONTROL=radio-default node adapters/gohtmx/tests/browser/menu-alias-contracts-browser-test.mjs
MENU_ALIAS_NEGATIVE_CONTROL=overflow-default node adapters/gohtmx/tests/browser/menu-alias-contracts-browser-test.mjs
```

The two negative controls each disable one exact production template condition.
A kill requires that mutant's designated semantic assertion, not a timeout,
syntax error, or unrelated exception. Reports under `test-results/contracts/`
record source/served template hashes, fixture and asset hashes, revision, both
pins, requests, named requirements, all 45 declared per-surface requirement cells,
and failure details. The six rejection cells verify exactly one caller/error, no
success result, dismissed state and restored focus; only radio emits a change. Actual browser execution
belongs to CI; local renderer and syntax checks are not browser proof.

## Scoped gallery check

The gallery audit routes `menus/RadioMenuItem` to its exact
`gallery-check:menus/RadioMenuItem` key. Its caller fixture checks default and
explicit density radio groups, exclusive selection and reselection, group/twin
isolation, ordered change/action payloads, dismissal and trigger focus.
`menus/CheckboxMenuItem` retains its mandatory checkbox-role/toggle check.
Audit markup and the expected evidence inventory share this routing. Gallery
reports retain `fullContractVerified: false` because these are scoped fixture
assertions.

`go test ./internal/gallery -run TestMenuAliasGalleryCheckRouting -count=1`
checks the rendered route and roles. `node scripts/menu-alias-gallery-test.mjs`
executes the registered checks against bounded production selection branches,
with modeled DOM/event/focus adapters and seven causal controls. These local
checks do not establish live or static browser execution.

## Deferred ambiguities

`menus/SubMenu` (capital M) still resolves to a full Menu host, whereas upstream
maps the name to `MenuItem::submenu`. The intended standalone-vs-host web API
needs a separate compatibility decision. An explicitly empty child `Items: []`
also still becomes a leaf because the current template tests truthiness. Neither
case is changed or claimed as covered here. Other remaining menu requirements
stay in the [bounded menu contract's remaining list](menu-interaction-contracts.md#explicitly-remaining-contracts).
