# SearchableMenu filter confirmation baseline

This records the historical test-only baseline on published main
[`49a792722ed4704d1b6fc06d7d2ee768ffe318aa`](https://github.com/mrchypark/elysdui/commit/49a792722ed4704d1b6fc06d7d2ee768ffe318aa),
source tree `ebbb4d739ee965a92a0e57e265e11556d8a77abe`. That baseline did not change
production behavior, schema, aliases, source pins, or global support claims.
The subsequent bounded implementation and stronger replacement-release setup
are described separately in [repair verification](searchable-menu-confirmation-repair.md).

## Source-owned intended behavior

The historical target remains
[`49ed1f84056fa13347d68801b479a4a5a8e03b53`, menu.rs:313–371](https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Components/src/commit/49ed1f84056fa13347d68801b479a4a5a8e03b53/src/menus/menu.rs#L313-L371),
blob `76670130e17b1149f6fc1edfef12248f93d8a6c8`. The independent comparison is
[`da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721`, menu.rs:348–421](https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Components/src/commit/da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721/src/menus/menu.rs#L348-L421),
blob `5b5c133dfccefba94ccb04a281c17a070d0751a3`. Both select on unmodified
Enter keyup. Space is a confirmation key only outside the typing context.
[SearchableMenu's host passes its text input to that shared menu](https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Components/src/commit/49ed1f84056fa13347d68801b479a4a5a8e03b53/src/menus/hosts.rs#L298-L365)
(blob `0fd16d0e8ffab8ec49a1c343666c1f119aae6797`, identical at both pins).

The published web implementation's
[search-input branch](https://github.com/mrchypark/elysdui/blob/49a792722ed4704d1b6fc06d7d2ee768ffe318aa/ui/gohtmx/assets/ely-api-interaction.js#L1309-L1333)
clicks a leaf on keydown, without a modifier gate. The guarded row/panel
[keyup path](https://github.com/mrchypark/elysdui/blob/49a792722ed4704d1b6fc06d7d2ee768ffe318aa/ui/gohtmx/assets/ely-api-interaction.js#L1850-L1857)
does not arm the filter input. These are source facts, not browser execution.

The historical
[isolated VM search test](https://github.com/mrchypark/elysdui/blob/49a792722ed4704d1b6fc06d7d2ee768ffe318aa/ui/gohtmx/tests/unit/interaction_menu_test.mjs#L44-L53)
expected selection during keydown. The test-only baseline retained it byte-for-byte
and explicitly classified it as an incorrect source-parity oracle. Its green
result could not prove this intended keyphase contract. The baseline source test
pinned its SHA-256 to
`0125f9e765f5f375ce41efd6e40654e0c8f3c2b22ef8ee95677afbac3c20ed14`.
The repair removes that wrong expectation and adds complete-runtime event tests.

## Bounded fixture and case matrix

Each case starts with a fresh document using one of three actual render paths:
qualified Go `menus/SearchableMenu`, chapter/name Go `menus` + `SearchableMenu`,
or SDUI `menus/SearchableMenu` through CatalogueRegistry, Decode, Compile and
Plan.Render. Lower-camel wire properties are authored independently. No alternate
SearchableMenu alias is declared or invented.

Four production roots provide a primary menu, an independent peer, empty items,
and all-disabled items. Primary rows contain a filtered-out command, a disabled
matching command, and two enabled matches with distinct values/actions. Root
query `root-query` is distinct from the item payload. Test shells do not implement
filtering, keyboard handling, lifecycle or callback behavior.

- `desired`: plain Enter phase and Control/Alt/Meta/Shift + Enter. Down and up
  snapshots retain raw actions, host callbacks, dismissal and focus. Keyup's
  target is recorded but filter focus on keyup is not a prerequisite: the known
  early dismissal can legitimately move the native keyup to the trigger.
- `controls`: literal query Space, first visible enabled target and exact item
  payload, no results, empty/all-disabled items, peer isolation, close/reopen,
  dismissal before the host callback, and focused-row Space preservation.
- `lifecycle`: actual bundled HTMX innerHTML/outerHTML replacement between
  physical Enter down/up. Early keydown activation remains a genuine failure.
  Separately, the test checks old-owner cleanup, no extra action on stale keyup,
  replacement identity/readiness, and a complete fresh replacement gesture.
  The relational pre-swap snapshot is constrained to zero callbacks/open or the
  exact known early callback/dismissal profile; arbitrary payloads or duplicates
  cannot pass as a preservation control. The original replacement retained
  `root-query`, which hid every result before the outstanding keyup. Its no-extra-
  callback observation is therefore bounded to that no-match condition; it did
  not independently establish release pairing with a selectable replacement.

No checkbox/radio mutation is claimed by these plain-row fixtures. Nested query
reconciliation, alternate input/result focus models, hover delay/aim, button-row
APIs, arbitrary DOM changes, native clients, RTL, touch and assistive-technology
parity are outside this slice.

## Execution and evidence

Browser execution is CI-only, against a clean committed checkout. The workflow
runs all three surfaces and each group independently with fail-fast disabled.
The wrapper creates a fresh invocation token, independently loads production
assets and renders expected fixtures, runs the browser child once, then validates
its report. A structurally valid failing baseline still exits nonzero. There is
no expected-red success mode or cached-report acceptance command.

The runner uses genuine Playwright keydown/up/type events. Capture logs retain
actual modifier flags, trusted status, phase, input/owner identity and target
value. Fixture setup uses real select-all, deletion and typing. Swap guards use
the public HTMX API, an actual HTTP response and actual lifecycle events.

Evidence retains source/served/HTTP/browser SHA-256 and byte lengths, all source
files that determine the harness and rendered fixture, exact HTML fixture files,
revision/tree, toolchain, browser version, request records, raw snapshots and
incidental error telemetry including disconnected-owner errors. Pure validation
recomputes observations, expectations and verdicts from raw evidence and
source-owned literal/relational constraints. Synthetic verifier fixtures are
kept out of browser output and cannot establish browser behavior.

Source-only checks (no browser or server):

```
node scripts/searchable-menu-confirmation-oracles-test.mjs
node scripts/searchable-menu-confirmation-evidence-test.mjs
go test ./ui/gohtmx/tests/fixtures/searchablefixture ./ui/gohtmx/tests/fixtures/searchable-menu-confirmation ./adapters/gohtmx/tests/fixtures/searchable-menu-confirmation
```

The authorized CI workflow runs `node scripts/searchable-menu-confirmation-run.mjs`
with SEARCHABLE_MENU_SURFACE and SEARCHABLE_MENU_GROUP from its matrix. Before
any implementation change, inspect the exact-commit raw nonzero baseline and
safe controls. Source inspection, fixture checks and synthetic verifier tests
are not substitutes for that browser result.
