# CommandPalette query continuation: unchanged-production baseline

This is a bounded keyboard baseline for `navigation/CommandPalette`, built on
actual main `0a972e071452f7bdb9bc64f6d27d50c042108885` (tree
`c400233c889a6701682ded31429a3ce0127bacf0`). Production runtime, templates,
styles and SDUI adapter bytes remain unchanged. The input loader independently
checks every loaded production asset against that commit before execution.

## Source and scope

The palette source at both upstream pins is identical:

- H: `49ed1f84056fa13347d68801b479a4a5a8e03b53`
- A: `da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721`
- `src/navigation/palette/mod.rs`: blob `b5805939c0a20d36cca5c1720d2fcdc7d57c8e3f`
- `src/navigation/palette/kinds.rs`: blob `d97f1a63ff24ed1df9d177d169b7d4e5a8ab5ac6`
- `src/navigation/palette/tests.rs`: blob `b5810aabb4c0f37de7504c5ee39755cbdc257ad2`

The [query/cursor source](https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Components/src/commit/49ed1f84056fa13347d68801b479a4a5a8e03b53/src/navigation/palette/mod.rs#L152-L230)
keeps query focus and advances a separate cursor. Current web arrow handling
focuses a result button. Subsequent printable keys therefore stop editing the
query and may instead run generic label-prefix navigation.

This baseline uses actual qualified Go, chapter/name Go, and independently
authored typed SDUI documents compiled through the real registry. Standalone UI
fixtures import no SDUI or adapter. Five fixed caller rows include a disabled
match and a nonmatch; a second instance supplies an ownership boundary.

No assertion imports SearchableMenu's keyup or modifier rules. Palette Enter is
observed on keydown and required to emit exactly once across the complete
keydown/keyup gesture, close, remain closed and work again after reopening.

## Independent cases

- `focus`: `query.continue` drives `op → ArrowDown → en` with no refocus,
  requiring `open`, input focus/caret, correct filtering and local/host query
  payloads. `cursor.coherence` drives `op → ArrowDown → o`, requiring `opo`
  and Option as the sole enabled matching result.
- `preserve`: `enter.preserve` starts independently from `op → ArrowDown`
  and chooses Option, then reopens and chooses Open. `escape.preserve`
  checks the actual opener, reopening/editing, Tab containment and explicit
  Close. `text.space` enters `Other place` while the input owns focus.
  `owner.replacement` uses real bundled HTMX HTTP replacement, documented
  `ui.mount` rebinding, a separately labeled synthetic detached-field probe,
  and a fresh trusted keyboard gesture.
- `adjacent`: `active.relationship` records currently missing relationships
  and tests the desired repair prerequisite. `action.close-order` separately
  compares callback-time dialog state with upstream close-before-callback.
  `empty.submit` separately probes native empty-results Enter and rejects
  every command or implicit form-submit callback.

Missing input/list/option IDs and control/active references are explicit future
repair prerequisites. They are not a claim that those DOM attributes existed
historically. The relationships must resolve to a unique local visible enabled
selected option and clear on empty results; local sorting must retain IDs.
DOM assertions do not prove assistive-technology behavior.

This is not full palette-family parity. It does not verify long-list scrolling,
Home/End policy, pointer-hover selection, IME/composition, mobile/native clients,
remote-result reconciliation or aliases. Existing shared-family suites must be
retained if a later implementation repair touches the shared handler.

## Execution and evidence

Browser execution is CI-only. The scoped push/pull-request and dispatch workflow `palette-query.yml`
runs three surfaces by three case groups. Expected unmet contracts keep their
ordinary nonzero exit; neither runner nor validator converts red into green.
Each case runs in a fresh document and records later observations even when an
earlier desired assertion fails. Infrastructure or failed setup prerequisites
cannot count as a contract result.

```sh
# Local, non-browser checks
go test ./ui/gohtmx/tests/fixtures/palettefixture ./ui/gohtmx/tests/fixtures/palette-query ./adapters/gohtmx/tests/fixtures/palette-query
node scripts/palette-query-oracles-test.mjs
node scripts/palette-query-evidence-test.mjs
node ui/gohtmx/tests/unit/palette_query_test.mjs

# Authorized CI only, clean committed source
CI=true PALETTE_QUERY_SURFACE=go-qualified PALETTE_QUERY_GROUP=focus npm run test:palette-query
```

The wrapper independently compiles/dumps fixtures and loads source/assets,
writes an invocation record before launching the browser, generates a fresh
run token and validates raw observations afterward. Reports retain event
interleaving, trusted flags, targets, owner/generation, beforeinput/input data,
selection range, down/up snapshots, callback-time state, native close events,
HTTP/bridge requests, exact byte hashes and per-case outcomes.

SDUI event routing uses five explicit item source actions. The form-submit
`run` action is deliberately unbound so an empty native submit remains visible
to the generic callback probe rather than becoming an SDUI payload error.

Replay requires the report, independent invocation/exit records and separately
verified expected revision/tree/token. It recompiles fixtures and rehashes the
current clean checkout. It never trusts report-authored expected values or
provenance as the independent input.

```sh
node scripts/palette-query-replay.mjs REPORT INVOCATION EXIT EXPECTED_REVISION EXPECTED_TREE EXPECTED_TOKEN
```

Default `npm test` includes exact source-owned case/snapshot inventories and
schema-corruption tests. Synthetic schema fixtures prove validator behavior;
the Node handler probe proves only unchanged handler state transitions. Neither
is browser typing, layout, focus-return or implicit-submission evidence.
