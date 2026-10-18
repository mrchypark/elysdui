# SearchableMenu filter confirmation repair

This is a bounded repair of an existing SearchableMenu query-input contract.
The [historical baseline](searchable-menu-confirmation-baseline.md) records both
upstream pins and the unchanged-production defect. No alias, schema, native
client, global source pin, or whole-component support claim changes here.

The direct-head baseline was reproduced at commit
`839a75e9af6425eb28a832d02078edb3dc09ef04`, tree
`887caf84800ab36f7aacdf53af5f1476a532f4c2`, in
[push run 39173694479](https://github.com/mrchypark/elysdui/actions/runs/39173694479)
and [PR run 39173714068](https://github.com/mrchypark/elysdui/actions/runs/39173714068).
All three rendering surfaces delivered early actions for plain and each actual
modified Enter. Eight preservation cases per surface passed. Those baseline
artifacts remain historical evidence; they are not positive repair evidence.

## Minimal runtime change

Only the SearchableMenu filter gets a new transient Enter gesture:

- Unmodified keydown arms its physical field, menu panel and panel generation;
  it prevents the input's default Enter handling but does not select or dismiss.
- A repeated keydown cannot start a new gesture. Modified press/repeat rejects
  the arm, and a modified release cannot select.
- Matching keyup clears the arm before any callback. It checks current focus,
  field/root ownership, enabled/visible state and unchanged panel generation.
- The release resolves the current first visible enabled result in that panel
  and owner. It uses the existing click path, so dismissal precedes the action.
- Teardown clears the arm. A fresh controller requires its own full gesture.

Text Space remains ordinary input. Existing row Enter/Space and pointer paths
are unchanged. The old isolated keydown-selection expectation was incorrect;
[the complete-runtime model](../../unit/searchable_menu_confirmation_test.mjs)
now runs the whole production core and interaction family with DOM event
propagation, while retaining separate filtering/radio/arrow tests.

Modifier transitions, repeat pairing and physical release matching are bounded
web gesture safeguards. The upstream evidence specifies ordinary unmodified
keyup confirmation, not every possible transition while Enter is held. A brief
blur/refocus within the same still-open panel is outside this proof; this repair
does not add a new focus state machine.

## Stronger replacement setup

The original replacement-release baseline had no visible matches because the
fresh root retained its `root-query` seed. To avoid vacuous stale-release proof,
the repaired runner opens and focuses the replacement, edits its query to
`Alpha` using real Control+A, Backspace and typing while the original Enter is
still held, then delivers the outstanding Enter keyup. There is no fresh Enter
down and no clearing of the original action or input trace.

The existing fifteen cases and `searchableOracles` body retain their original
expectations. Separate replacement prerequisites require physical fresh-owner
identity, actual focused input identity, exact trusted editing phases and query
changes, the current enabled/disabled row profile, and one fresh unmodified
Enter release. The pre-release raw log must be an exact retained prefix of the
post-release log. This is an explicit setup/provenance strengthening, not a
claim that the historical no-match procedure alone proved the stronger case.

## Causal controls and evidence limits

Each surface first requires a fresh all-fifteen-case positive browser run. Four
exact-anchor, test-only served-runtime interventions then target explicit
source-owned inventories:

- `activate-on-keydown`: phase and both replacement cases
- `bypass-filter-modifiers`: the four modifier cases
- `confirm-filter-space`: the text Space case
- `release-without-arm`: both replacement cases with selectable fresh results

These are targeted kills, not full-suite mutant passes. In particular, an
unconditional Space mutation also breaks query setup containing spaces, so its
causal run deliberately selects the designated text case rather than treating
unrelated prerequisite failures as successful evidence. Release-without-arm
models a missing physical gesture pairing; it does not claim that deleting the
cleanup reset alone creates a callback through a disposed controller.

The validator derives inventories and failure targets from trusted source
metadata. Missing, extra, duplicate, reordered or foreign cases, failed
prerequisites, unrelated failures, wrong action values/owners/phases, incidental
errors and stale or altered byte provenance must reject. Raw contract failures
retain exit 1. Only the outer causal wrapper can credit an exact designated
failure after independently validating the clean reference and each report.

Local source parsing, fixture checks, complete-runtime event-model tests and
synthetic corruption tests do not establish trusted browser behavior. The
repair still requires exact-head CI browser runs and independent inspection of
raw artifacts, including all three renderers and all four targeted controls.
No local browser or fixture server is used for this verification stage.
