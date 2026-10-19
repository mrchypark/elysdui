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
after the child and must match the anchor. The unmodified raw evidence validator
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
