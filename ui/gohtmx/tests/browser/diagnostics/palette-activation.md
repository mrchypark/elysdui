# Supplemental CommandPalette activation baseline

This eight-case suite adds trusted pointer activation, synchronous native-close
focus host rebinding (including an initially absent binding), callback reopening,
callback outside-field focus, and initially empty/disabled-only/filtered-empty
plain Enter. Every empty case separately invokes the real form.requestSubmit API
and routes run through compiled SDUI to query-observed. The API call is explicitly
labeled and is not trusted keyboard evidence.

The collection source pin is the guarded head
ee28495c7cd6581d49d53874e831c6cea40930a4, tree
c2d6ed91c378f59070fde8d626df2748e9fd837c. Every production asset must match
that reachable remote pin; pointer/plain-Enter fixtures execute the guarded
runtime unchanged. The inherited transport-hardening code is test-only and is
pinned by the exact clean-head source inventory, not an unpublished base object.
The initial offline preparation at 7ed5d2560d11ef1064e739004ecd37e33c2f82ac
(tree 8ab05d5aa20910c812bb061f88d5618b77bc4ecf) remains historical evidence.
This restack requires fresh exact-head checks and CI collection; neither offline
preparation grants supplemental browser credit. Original nine-test evidence
remains separate and its suite is unchanged. Canceling an in-flight activation
when close-focus replaces the host binding is an added web ownership safety
policy, not a native parity claim. Modifier/IME characterization is excluded.

All actual browser/server work is CI-only. Local Go fixture inspection and
synthetic evidence/corruption replay are preparation checks, not browser proof.
Run node scripts/palette-activation-evidence-test.mjs locally. The workflow runs
scripts/palette-activation-run.mjs for qualified Go, chapter/name Go, and compiled
SDUI. It preserves every raw failing assertion and nonzero exit. It does not turn
an expected baseline failure into a pass. Independently replay the resulting
report, invocation, and exit files with scripts/palette-activation-replay.mjs and
externally verified revision/tree/run-token arguments in an exact clean checkout.

The observer retains actual DOM-object tokens separately from host-handler,
onAction, onChange, and returned-disposer tokens. It records the unbound setup,
binding transition, native target/path/trust/modifiers, post-family key default,
submit/FormData, direct event, host callback, result, close, and request-start
boundaries. A same-event root click-return boundary proves the focus rebind
occurs during the original pointer handler rather than a later focus frame.
Only test host callbacks induce the documented rebind, reopen, or
peer focus. A fetch tap forwards each original call unchanged and snapshots its
FormData and presentation immediately before the real transport call; it does
not mock fetch. Packet IDs join actual request-start, HTTP POST, and bridge
success. Fresh contexts provide exact per-case source/response inventories
without cache bypass flags or cache-tolerant acceptance.

Future repair causal controls must separately prove early/duplicate generic
emission, missing owned emission, delayed close, omitted renderer marker,
post-close binding-check bypass, trailing close/selection, restored empty-submit,
and blanket submit suppression are killed with prerequisites intact. This
baseline does not claim those future production mutations have been run.
