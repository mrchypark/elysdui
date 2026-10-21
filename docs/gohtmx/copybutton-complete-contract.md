# CopyButton complete contract and finite repair controls

This finite baseline covers only `buttons/CopyButton`, rendered by the standalone
Go template and one real SDUI adapter specimen. It does not cover Share, Close,
Back, More, other IconButton builders, or the generic button matrix. The original baseline is retained separately. The repair restores this bounded
contract in shared production templates and assets.

## Reference and observable contract

The upstream reference is Ely GPUI Components at
`49ed1f84056fa13347d68801b479a4a5a8e03b53`. Its CopyButton and invoked IconButton,
button tone, size, motion and tooltip paths are unchanged at comparison pin
`da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721`. No Git ancestry or historical checkout
is needed to execute these current-source web tests.

- U1: exact text, including empty, escaped, multiline and Unicode values; keyed identity
- U2: minimal small ghost icon-only default, 24px square, 12px copy glyph, 6px radius
- U3: named button, pointer/hover/active/focus semantics
- U4: only CopyButton's inherited choices, without inventing exposed IconButton builders
- U5: clipboard write precedes success
- U6: noninteractive 1400ms confirmation, 14px success-colored check, Copy/Copied tooltip
- U7: -0.6rad to 0 rotation over 120ms, cubic ease-out, 1ms reduced motion, replay
- U8: copied-phase lockout without extending the original deadline
- U9: independent identities and lifetime-local reset

The web adaptations are separately required:

- W1: minimal standalone defaults and bounded explicit label/aria/size/variant/action overrides
- W2: native HTML pointer, Enter, Space, Tab/Shift-Tab, focus, no scroll or form submission
- W3: external disabled and temporary unavailability
- W4: async pending deduplication and truth after actual clipboard resolution
- W5: rejection, synchronous throw, absent API and retry
- W6: captured payload/action, exactly one action/change, cancellation and callback behavior
- W7: independent roots/items and current host/control ownership
- W8: real bundled HTMX root/inner/control replacement, pending and copied, same-node remount
- W9: presentation, tooltip, reduced motion, narrow 200% zoom and missing-icon fallback
- W10: one actual SDUI adapter render using shared behavior

The executable case inventory and source-owned assertion IDs are in
[copybutton-complete-cases.mjs](../../ui/gohtmx/tests/browser/copybutton-complete-cases.mjs)
and [copybutton-complete-evidence.mjs](../../ui/gohtmx/tests/browser/copybutton-complete-evidence.mjs).
A reference checkbox is not closed merely because a report includes its label.

## Deliberate HTML choices and limitations

The selected HTML policy keeps the same focused native button in the DOM during
copied feedback with
`aria-disabled=true`, a stable accessible name and suppressed activation, while
its visible content becomes the check. This avoids stranding keyboard focus.
It is an HTML accessibility adaptation, not GPUI's exact node replacement.
External `disabled` must remain unchanged. Explicit caller labels remain visible
web overrides; only the minimal Value-only default is icon-only.

Copy/Copied tooltips must be visible on hover and keyboard focus. This harness
allows 450ms before taking its hover/focus observation; the separate native
TooltipTrigger's 400ms default is not a CopyButton requirement. That JS clock
advance does not establish CSS transition completion. After same-case font
readiness, appearance idle (including theme setup), hover, pressed and focus,
and reduced-motion idle, copied, before-deadline and deadline observations flush
layout and await actual `CSSTransition.finished` on the tested control, its
descendants/pseudos, its associated sibling tooltip and containing theme surfaces.
The tooltip's physical identity must remain stable during observation. The shared
reduced-motion stylesheet assigns a nonzero transition duration even to pseudo
size/color and tooltip visibility; their first style sample can therefore precede
the settled rendered state. Two empty
observations separated by a real Node-time render window establish settlement,
under one five-second real deadline. Cancellation is recorded and re-observed;
paused/nonfinishing transitions time out and unrelated failures remain raw errors.
A checkpoint/control/root-bound settlement witness is required before capture.
This does not wait for or change the independent check `CSSAnimation`, or advance
the controlled JavaScript clock. The copied
confirmation observation requires an immediately updated tooltip on an already
active trigger. Tooltip position is a web policy. Cubic easing is tested as the
linear-x cubic Bezier `(1/3, 1, 2/3, 1)`, equivalent to `1-(1-t)^3`, with .001
rounding tolerance, rather than the different CSS keyword `ease-out`. CSS
animation state uses the real rendering timeline: the timing case allows 150ms
of real time before observing the endpoint, separately from the controlled JS
clock used for the exact 1399/1400ms confirmation boundary. A real CSS start
sample is retained for the same physical control and successful clipboard cycle,
so a completed `fill:none` animation is not lost during the font-readiness wait.
Both live and event-time pseudo sampling use `getAnimations({subtree:true})`, then
select only `CSSAnimation` objects on the exact element and exact pseudo-element.
Descendant animations and pseudo `CSSTransition` objects cannot certify rotation.
The [Web Animations API](https://www.w3.org/TR/web-animations-1/#dom-animatable-getanimations)
distinguishes the element-only default from pseudo-inclusive subtree discovery.
Rotation keyframes are compared as exactly two single `rotate()` values at offsets
0 and 1, from -0.6rad to exactly zero. Compatible rad/deg/grad/turn units are
converted numerically without wrapping full turns; matrices, extra transforms,
malformed/nonfinite values and nonzero endpoints are rejected. A fixed 1e-6rad
start tolerance covers the captured Chromium degree serialization
`rotate(-34.3775deg)`, whose error is about 5.636e-7rad. At that magnitude,
six-significant-digit rounding is bounded by .00005deg (8.727e-7rad); this is a
bounded serialization allowance, not a universal browser precision claim or a
visual similarity threshold. Raw strings are retained unchanged. See
[CSS compatible angle units](https://www.w3.org/TR/css-values-4/#angles).
Replay requires its own resolved clipboard call after the source-owned deadline
checkpoint and its own subsequent start witness on the same physical control
and root. Sequence is strictly later; the controlled clock may remain equal. A
retained finished first-cycle animation cannot certify a fresh cycle, including
when an unresolved copied-phase repeat prevents the replay write.

Only standard density is claimed here. Compact/comfortable density and global
font/radius scaling are outside this standard-density constructor-parity claim;
no mapping is certified by this slice. The bounded zoom case uses CSS
200% zoom in a 320px viewport and is not a claim about every browser zoom mode.

The adapter manifest omits standalone Action, Icon and IconOnly, and the baseline
does not widen it. Their adapter API discrepancy remains explicitly deferred.
Adapter value/label/disabled and escaping are checked through the real adapter.
There is no adapter API-completeness claim.

A real screen-reader/browser/OS session is still required for the icon-only name,
temporary copied availability, one polite success/failure announcement, tooltip
description without duplication, and focus through reset/replacement. DOM/ARIA
captures are not AT evidence. Native GPUI keyboard/AT synthesis is outside this
HTML contract. Chromium granted-origin clipboard success does not establish
permission-prompt UX, other browsers or OS-managed clipboard policy.

## Execution and evidence

Offline checks:

```sh
go test ./ui/gohtmx/tests/fixtures/copybutton-complete
node ui/gohtmx/tests/unit/copy_feedback_test.mjs
node scripts/copybutton-complete-evidence-test.mjs
node scripts/copybutton-complete-timers-test.mjs
node scripts/copybutton-complete-animations-test.mjs
node scripts/copybutton-complete-rotation-test.mjs
node scripts/copybutton-complete-controls-test.mjs
```

Full fixture/server/browser execution is restricted to GitHub CI:

```sh
node scripts/copybutton-complete-controls.mjs
```

The focused [workflow](../../.github/workflows/copybutton-complete.yml) retains
reports, exact child stdout/stderr, invocation and exit receipts, validated hash
joins, and screenshots even on failure. Every case runs in its own browser
context and continues after another case's desired assertion failures. Each
capture and context closure waits for document font readiness under a bounded
same-case deadline; font failures are never exempted. No known
missing default, check, tooltip or lockout is converted into a passing assertion.
The desired baseline can therefore remain red while its evidence is valid.

The runner independently loads current source/fixture/asset bytes before and
after its child, with one UUID invocation. The validator demands the exact case
and checkpoint inventory, source-owned raw-oracle rederivation, positive native
input/settlement/ownership/swap witnesses, received asset bytes, process exit,
and one final child completion bound to the exact report bytes. A missing case,
stale cached pass, omitted positive witness or early exit is an integrity error,
not a useful baseline failure. All acceptance goes through the same strict gate.

The existing helper/browser CopyButton suite retains its historical success/error
assertions and two controls. A repeated pending attempt uses a measured real mouse
click, with trusted target/busy witnesses, because an enabled-only Playwright
locator click would wait rather than exercise the temporarily unavailable control. Their historical weak reports do not close any new
case. Seven repair-specific controls are defined in
[copybutton-complete-mutants.mjs](../../ui/gohtmx/tests/browser/copybutton-complete-mutants.mjs):

- copied-lockout: allow repeated copied-phase activation, retain pending deduplication
- captured-action: reread the action at completion, retaining the captured payload
- completion-owner: bypass the stale pending completion ownership guard
- stale-timer-defenses: jointly remove the retained cancellation handle and clear the
  marker before record ownership; this does not certify either protection independently
- default-radius: change only the default 6px radius to 7px
- check-color: change only the success check color to the foreground color
- motion-duration: change only normal-motion duration from 120ms to 121ms

Each mode runs every one of the same 41 cases, with all desired oracles, positive
prerequisites, exact process completion, source/served byte hashes and saved PNGs.
The external mode is bound before browser spawn and source inputs are rebuilt
after it; the report cannot choose an acceptance policy. Only one exact in-memory
source replacement is allowed per mutant. Committed production files are never
modified by a control. The exact designated failure sets and independent positive
controls live in
[copybutton-complete-controls.mjs](../../scripts/copybutton-complete-controls.mjs).
Every non-designated desired assertion must pass. No unrelated passive diagnostic
equality is required. The raw mutant child exit remains 1; the aggregate is green
only after the clean control and all seven exact kills pass the same strict gate.
Missing, duplicate or foreign cases, omissions, browser errors, early exits,
stale passes and unexpected failures remain red.

The observational timer trace preserves native handles, callback receivers,
arguments, results, thrown errors and cancellation semantics. It associates a
1400ms timer only with a unique resolved clipboard call whose actual physical
control is currently copied in that call's root. The stale-timer control requires
old and new success-linked schedules, a moved physical control, the old deadline
firing and clearing the new marker, and a later new deadline. Trace observations
do not repair state. Synthetic wrapper and corruption tests are schema tests,
not browser evidence. Radius and color controls make no separate icon-only or
check-glyph sensitivity claim.

After downloading fresh CI artifacts, check out that exact clean CI revision and
run the actual report corruption replay for each externally selected mode:

```sh
node scripts/copybutton-complete-controls-test.mjs --artifacts /path/to/mode-artifacts --mode control
```

Use each of the seven mode names for its own artifact directory. The replay
independently rebuilds source, fixtures and asset hashes, checks the actual
stdout/stderr, exit and PNG files, and corrupts the full report inventory and
causal admission. A source or toolchain mismatch is a failed replay, not a pass.

A completeness claim requires evidence for every in-scope U/W item on one exact
final tree, explicit accepted adaptations, and named unresolved blockers. Actual
AT remains pending. The automated standard-density constructor slice does not
certify the explicitly excluded density mappings or expanded adapter API.
