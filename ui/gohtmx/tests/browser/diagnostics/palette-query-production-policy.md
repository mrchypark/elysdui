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
the selected policy as the last independent positional argument.
Selection is explicit in the three workflows, the parent runner, the browser
child, and offline replay. A report cannot select its own policy. Invocation,
report and exit records retain the policy; offline CLI defaults to strict. A
candidate invocation must supply the policy as the last independent positional
argument.

## The three policies

The production policy decides two things: which production inputs may equal
clean HEAD bytes instead of the historical baseline, and which runtime/core
digests the policy requires. It is always selected by the invocation, never
inferred from an observed hash or from a report field.

### `strict` (default)

* Allowed HEAD set: `ui/gohtmx/assets/ely-api-interaction.js`,
  `ui/gohtmx/templates/ely-api-interaction.html`,
  `adapters/gohtmx/catalogue_manifest.json.gz`.
* Runtime/core pins: the historical strict digests of
  `ui/gohtmx/assets/ely-api.js` (`76d31027…`) and
  `ui/gohtmx/assets/ely-api-interaction.js` (`9aa473de…`).
* Every other production source and every loaded asset must equal the
  historical actual-main baseline. The audited change set is therefore
  **rejected** by strict.

### `activation-repair`

* Allowed HEAD set: the strict reviewed set plus `ui/gohtmx/assets/ely-api.js`,
  `ui/gohtmx/assets/ely-api-interaction.css` and `ui/gohtmx/assets/ely/icons/check.svg`.
* Fixed SHA-256 digests for the six approved production files
  (`ely-api.js`, `ely-api-interaction.js`, `ely-api-interaction.html`,
  `ely-api-interaction.css`, `ely/icons/check.svg`, `adapters/gohtmx/catalogue_manifest.json.gz`).
* It does not authorize arbitrary HEAD production or CSS bytes. The audited
  change set also carries a changed interaction template and changed audited
  files, so **activation-repair rejects** the audited candidate as well.

### `audit-candidate`

The explicit production allowance for the current audit change set. It
permits exactly the source-owned audited files

* production sources: `ui/gohtmx/assets/ely-controls.js`,
  `ui/gohtmx/ui.go`, `ui/gohtmx/component.go`,
* loaded asset: `ui/gohtmx/assets/ely-api-interaction.css`,

in addition to the reviewed set, `ely-api.js` and the CopyButton `ely/icons/check.svg`
dependency. The reviewed interaction template includes the integrated audit ARIA
repairs, with a separate candidate template pin. Its runtime/core pins are
the clean HEAD digests of the reviewed revision
(`ui/gohtmx/assets/ely-api.js` `6039000e…`,
`ui/gohtmx/assets/ely-api-interaction.js` `53f29f4c…`).

Each audited file is compared against the clean HEAD revision bytes
(`git show HEAD:<path>`), not against a hardcoded digest. The allowance is
therefore bound to a committed candidate tree: it holds once the audited change
is committed, and it keeps rejecting the change while that change is still
uncommitted in the shared working tree. No allowance ever lets an uncommitted
tree pass the audited policy, and the audited allowance never widens `strict`
or `activation-repair`.

The policy is selected only by explicit invocation:
`PALETTE_QUERY_PRODUCTION_POLICY=audit-candidate`, or the same value as the
last independent positional argument of the offline replay CLI. A report can
never select it.

## Negative controls and the positive replay

`scripts/palette-query-production-policy-test.mjs` computes the expected
outcome of **all three** policies independently from the source bytes and the
source-owned reference set, and then asserts that the loader raises exactly
that rejection message. The expectations are:

* `strict` → `reviewed production input: ui/gohtmx/assets/ely-api.js`
* `activation-repair` →
  `fixed activation-repair production input: ui/gohtmx/assets/ely-api-interaction.css`
* `audit-candidate` → (only while the audited change is uncommitted)
  `reviewed production input: ui/gohtmx/assets/ely-controls.js`

The strict and activation-repair rejections are explicit negative controls:
the changed candidate core and the changed audit CSS must keep
being rejected by both, under every policy.

The positive replay needs a **clean committed source tree** whose production
inputs satisfy the selected policy; the replay itself asserts
`git status --porcelain` is empty. A tree that still carries the audited
change is rejected by strict and activation-repair on purpose. In that case
the run asserts the exact rejection as a negative control, reports
`POSITIVE REPLAY SKIPPED (0 positive checks)` and
`NEGATIVE-CONTROL-ONLY RUN - NO POSITIVE PATH WAS VERIFIED`, and never counts
the run as a verified positive pass.

Reentry keeps the exact 1,321-byte post-focus guard block and its two desired
safety assertions. Each policy has its own source-owned runtime/served-reversal
hash pair: `strict` pins the historical runtime, while `activation-repair` and
`audit-candidate` pin the clean HEAD runtime of the reviewed revision. Removing
the block changes only served bytes, never production source or an archived
report. Every causal kill remains mandatory.

The default source-built tests check JSON roundtrip, positive offline CLI replay,
missing/wrong/foreign policy, stale revision and coordinated source forgery. The
policy source checks select their policy explicitly. Synthetic records prove
validator behavior only. Fresh CI must establish current native outcomes.

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
