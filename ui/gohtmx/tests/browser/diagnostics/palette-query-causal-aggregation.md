# CommandPalette causal CI aggregation

The supplemental and focus-reentry workflows run the original native runners
through `scripts/palette-query-causal-controls.mjs`. Raw controls retain exit 0;
raw mutants retain exit 1. Their reports, invocation files, exit files and logs
are not rewritten. There is no `continue-on-error` or unconditional success.

The wrapper creates a fresh UUID and writes an independent invocation anchor
before spawning the raw runner. Its in-memory token, explicit suite, surface,
mode and production policy are joined to the child's report, invocation and exit.
The child must complete without a spawn error or signal, with exactly the required
status. An early failure cannot reuse a previous invocation's same-head files.
All source, served assets, compiled fixtures and toolchain metadata are rebuilt
after the child and must match the anchor. The raw evidence validator
then checks the full inventories, transport, native provenance, raw observations,
recomputed oracles and every prerequisite.

Controls must pass every desired assertion. Each mutant must fail every designated
kill and exactly its source-owned full failure inventory, including downstream
consequences. The inventory is generated from fixed checkpoint names and suffixes,
never from a report-selected list or a failure count. It was reviewed against all
six records per mode at published head `27895479f7f96f7b9af1131ae4028014037b0c9b`.
Unexpected desired failures and surviving mutants fail aggregation. The scroll
ranges intentionally pin the existing 1280 by 900 fixture geometry; legitimate
future changes require review rather than automatically expanding an allowance.

The raw runner writes `.validation.json` only after its raw verifier returns.
It binds the token and verdict to the exact report, invocation and exit bytes,
then emits a final JSON stdout line with that completion receipt's hash. The
wrapper requires this unique final emission. Captured stderr must equal only
the diagnostics generated in recomputed failed-oracle order; a later exception
cannot hide behind a mutant's expected exit 1.

Additional artifacts are `.aggregation-invocation.json` (written before spawn),
`.aggregation-process.json` (actual process result and captured stdout/stderr),
and `.aggregation.json` (only after acceptance, hashing the three raw files,
completion receipt and anchor). Child streams are echoed unchanged as received.
Capture is bounded at 16 MiB; overflow, truncation, signal and spawn errors reject.
The pre-spawn log records the UUID and anchor hash independently.
These receipts give workflow success a strict meaning without hiding raw red.
Historical failed workflow runs and their immutable native records remain intact.

## Offline acceptance

Run `node scripts/palette-query-causal-replay.mjs REPORT SUITE SURFACE MODE POLICY
EXPECTED_REVISION EXPECTED_TREE EXPECTED_TOKEN INDEPENDENT_TOOLCHAIN_JSON` from a
clean exact checkout. All values are independently selected; the token and toolchain
must be correlated with the retained CI logs. The replay rebuilds source, assets
and fixtures, permits only the explicitly supplied CI toolchain in place of local
host versions, and recomputes the entire acceptance receipt including raw and completion hashes.
It verifies the captured final completion marker and exact desired diagnostics;
the reviewer must also join the marker to independently retained CI job logs.
It never infers a token, mode, policy or expected toolchain from report metadata.

`npm test` runs synthetic aggregation tests by default. These establish validator
and orchestration behavior, not browser behavior. No local browser or HTTP server
is needed. Fresh native CI is required before accepting a newly published wrapper.

## Positive witnesses and claimed observations

A failed-ID list is necessary but cannot identify the intended counterfactual by
itself. `palette-query-positive-witnesses.mjs` adds independently source-owned
positive signatures. Causal raw replay requires them before crediting a kill;
strict aggregation requires them for controls too. The original desired oracle
bodies, failure-ID inventories, passive observers and served mutations are unchanged.
A coherent control behavior regression can still be a valid-red raw diagnostic,
while aggregation requires a fully successful control and its positive witnesses.

| Mode | Required positive signature |
| --- | --- |
| control | Local source IDs, searchbox/listbox/option roles, input-owned native edits and source command |
| focus-button | Each Arrow ends on its selected enabled visible source button; subsequent down events join previous focus; letter keyup may choose a known source row; query/caret stay `op`/2 or `Entry`/5 |
| active-missing | Active reference is exactly null |
| active-peer | Active reference is exactly the first peer option ID |
| option-peer-id | Exactly source-visited options acquire the first peer option ID, including peer initialization |
| option-role | Exactly source-visited options acquire role `button`, including peer initialization |
| list-role | List role is exactly `group` |
| controls-peer | Controls is exactly the peer list ID |
| wrong-enter | Rank activates Open/open-file/open-command; scroll activates Entry01/entry-01/entry-command, with coherent action, host, successful result, selection change and SDUI route |
| no-scroll | The initial source-joined list geometry and scroll position stay unchanged through all 57 Arrow steps |
| guard-removed | Exactly one retained-query Open→fresh Option active write lies after native focus return and before the queued checkpoint, resolving the exact fresh unselected Option token |

Visited rows and checkpoints come from the fixed driver, including the disabled
Entry07 skip and Entry40 wrap. The verifier never derives the expected mutation
history from rows already malformed in a report. Complete captured row profiles
combine fixed identity/label/enabled state, query-derived order/visibility and
selection with the exact intended ID/role deviations. Between-snapshot DOM
transitions are unobserved and carry no completeness claim. Geometry is relational: box
translations and internally consistent content dimensions may vary; arbitrary
coordinates and changed scroll position cannot substitute for no-scroll.

The complete supplemental native input tuple is checked at every checkpoint:
exact event inventory/order, type/key/code/data/inputType, trusted/focused/connected,
source owner/generation, target tag/field/value, caret and modifiers. Setup typing
is `op` or `Entry`; refinement is `o`; clearing is Ctrl+A then Backspace; reselect
is `op` then ArrowDown; long-list navigation is 28 down and 29 up. Ordinary events
remain on the input. The focus-button variant has no insertion/deletion events
after focus leaves the input and retains query/caret. Enter starts on the source
query (selected button for focus-button) and finishes on the empty-valued opener.
Button typeahead allows legitimate source-row variation while preserving target
continuity and final snapshot focus.

Every accepted command has one exact action and host payload, one successful
completed result, and one coherent selection change in both host and document
observations. Native Enter down precedes host→action→host-selection→selection,
which precede keyup. The fixture onAction returns an immediate object; mount awaits
it, and the driver separately awaits the down snapshot before keyup. Its ely:result
therefore follows its action and is already present in down. This is distinct
from the asynchronous SDUI bridge, which may complete on either side of keyup. The down observation must be an exact
prefix of the completed observation; Arrow is an exact prefix of refinement.

Reentry custom key observations retain the exact empty→o→op query progression,
Tab to Open, ArrowDown from Open back to the retained query, and `op` in all
post-typing event/batch states. Runtime token values may be consistently renumbered;
identity joins, fresh/stale node distinction and ordering are mandatory. The full
active-write inventory is one Open→Open remount write for control, or the stale
Open→fresh Option write followed by Option→Open remount for reversal. The remount
write resolves the original selected Open and is observed after the remount
lifecycle and before final capture; extra writes are rejected. The document
diagnostic may appear before or after remount and does not anchor transient safety.

Intermediate query-change callbacks, native close events, duplicate reentry base
input/passive-focus records and child-list diagnostics are not credited as complete
inventories. Existing final query-callback and closed-state assertions still apply;
observed supplemental prefixes cannot be rewritten. The required custom reentry
phases and active-attribute transition history remain mandatory. This does not
claim a universal selected-reference invariant while the owner is readiness-null.

`npm run test:palette-query:witnesses` exercises all modes and renderers with
synthetic observations, recomputed raw caches and completion hashes, wrong
counterfactuals and legitimate geometry/SDUI-timing/diagnostic variations. It also removes
only witness calls in temporary offline source projections to prove integration
sensitivity. Those projections are validator tests, never native certification or
a production runtime bypass. Fresh published-head CI and all-mode actual-report
replay remain the release gate.

### Bounded reentry identity claim

The positive witness joins retained owner/query, original Option, swapped LI and
fresh Option identities at install, focus, swap, the focus-return drain, return
and queued checkpoint. Credited primary identities are distinct from peer
nodes. The drain is the first replacement boundary, before the return event.
Complete active-reference writes and their source-supported intervals remain
required. Consistent global token renumbering and either permitted document
diagnostic placement remain valid.

Opener history, non-active batch nodes, unrelated passive row fields and the
complete `aria-selected` mutation history are uncredited diagnostics. Their
capture does not establish transition completeness. No uncaptured DOM transition
or redundant passive focus/childList observation is claimed. All existing raw
functional oracles and positive prerequisites remain in force.
