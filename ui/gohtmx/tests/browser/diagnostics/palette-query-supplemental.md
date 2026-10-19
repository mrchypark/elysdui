# CommandPalette supplemental repair evidence

This suite adds new coverage for the proposed CommandPalette query-focus and
active-descendant repair. It does not retroactively enlarge the original nine-case
baseline or change its expected results. Its fixtures contain the original five
commands plus Entry 01 through Entry 40, with Entry 07 disabled. All are produced
by the actual qualified Go, chapter Go, or compiled SDUI renderer.

## Exact cases

- `rank.stable-identity`: native `op`, ArrowDown, `o`, then native clear and
  reselection. Observe real ranking/filtering and restoration of source order.
  Every row retains its original source-index ID. Query input, local list and
  active enabled selected option must resolve by raw IDs and roles; peer IDs
  must remain distinct. Completed Enter must activate Option once with the exact
  public payload and owned host/SDUI result.
- `scroll.active-visible`: native `Entry`, 28 ArrowDown gestures, then 29
  ArrowUp gestures. Entry 07 is skipped; step 27 selects Entry 30; step 56 wraps
  to Entry 40. Every native step retains the query input and caret. Raw list,
  row and viewport rectangles establish that the selected option is inside the
  scroll container and viewport, while the query remains visible. The initial
  Entry 30 rectangle must be below the list viewport and list scrolling must
  actually occur. Enter activates Entry 40 once.

The observer is passive. It reads geometry and native event provenance without
focusing nodes, changing values, setting ARIA or scrolling. Browser execution is
restricted to CI. Local source, renderer, schema and replay checks never start a
browser or HTTP server.

## Causal controls

Nine named controls replace one exact reviewed runtime source site in served
bytes: button focus, missing active reference, peer active reference, duplicate
peer option ID, incorrect option/list roles, peer controlled-list reference, wrong Enter target, and omitted scrolling.
The current source bytes and changed served bytes are separately hashed. Every
control retains raw exit 1 and must kill a named desired assertion. Control
failures are never relabeled pass. The ordinary repaired-source run is separate.
The [causal aggregation gate](palette-query-causal-aggregation.md) now gives CI
success only to validated green controls and the exact complete source-owned
mutant failure inventories, while retaining every raw exit and report.

The workflow runs all three rendering surfaces. Each report has independently
written pre-browser invocation and exit records, an exact two-case/raw-step
inventory, full source/fixture/asset manifests, actual response hashes, native
input logs, and recomputed desired/prerequisite assertions. Schema corruption
tests run by default and are explicitly synthetic, not layout proof. The replay
CLI rebuilds current inputs from the expected clean revision/tree and checks an
independently supplied run token before validating the original raw status.

Original close-before-callback and empty-submit desired failures remain in the
original baseline workflow. This suite does not suppress or redefine them.
Focus-time caller reentry is a separately named proposed-repair probe. None of
these automated cases certifies screen-reader behavior, IME, Home/End editing
policy, pointer hover, other palette kinds, or native-platform accessibility.
