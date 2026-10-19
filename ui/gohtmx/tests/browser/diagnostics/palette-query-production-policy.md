# Existing palette suites: explicit production policy

The query, supplemental and focus-reentry suites retain their desired assertions,
passive observers and fixtures. Their source loader defaults to `strict`: only the
previously reviewed interaction runtime/template and catalogue fingerprint may
equal clean HEAD; all other production sources and loaded assets must equal the
historical actual-main baseline.

The finite `activation-repair` policy additionally permits `ely-api.js` and the
reviewed `ely-api-interaction.css` CopyButton repair and its newly loaded
`ely/icons/check.svg` dependency (unchanged from the prior main source). It
requires fixed SHA-256 values for all six approved production files. The historical strict policy
does not admit that CSS change. Neither policy authorizes arbitrary HEAD
production or CSS bytes. Selection is explicit in the
three workflows, the parent runner, the browser child, and offline replay. A
report cannot select its own policy. Invocation, report and exit records retain
the policy; offline CLI defaults to strict. A candidate invocation must supply
activation-repair as the last independent positional argument.

Reentry keeps the exact 1,321-byte post-focus guard block and its two desired
safety assertions. Strict and activation-repair runtime/served-reversal hashes
are separately source-owned. Removing the block changes only served bytes, never
production source or an archived report. Every causal kill remains mandatory.

The default source-built tests check JSON roundtrip, positive offline CLI replay,
missing/wrong/foreign policy, stale revision and coordinated source forgery. The
activation-repair source checks require
`PALETTE_QUERY_PRODUCTION_POLICY=activation-repair`; omission deliberately keeps
the historical strict boundary and rejects the changed core. Synthetic records
prove validator behavior only. Fresh CI must establish current native outcomes.

Historical ac28651 and earlier archives remain immutable and are replayed using
their exact committed validators. Their close-order/empty-submit reds and prior
infrastructure failures are not relabeled as candidate outcomes.

The named `palette-query-evidence-test.mjs --actual-transport-root` regression
uses the immutable `4ba625b64cd991cf3874639aace590eae70f279d` evidence module
(SHA-256 `914e91e84c580153573237eae8e1a131c4942bd4a9825b029d8344d0f698057b`)
for its pinned 80560c72/de94a891 records. That module already includes transport
hardening and predates the policy schema. The command verifies all original
report/invocation/exit byte receipts before exercising each record and labels its
output as historical-validator compatibility. It never adds policy fields or
source entries to archived observations, and provides no current-head native
certification. The default schema path and current replay validators remain
strict about missing policy metadata.
