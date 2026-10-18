# Cleanup/remount desired lifecycle baseline

This is a **test-only desired contract**, not an assertion that today's public
API already promises complete reentrant presentation survival. The
[existing lifecycle contract](../gohtmx/asset-loading.md#component-replacement-lifecycle)
expressly preserves fresh readiness during cleanup/error reentry and orders
`ely:cleanup` before disposers. It does not expressly guarantee that all family
presentation survives a same-physical-root mount inside that event. That existing
readiness guarantee and the stronger desired presentation guarantee are separate
oracles here.

## Desired outcome and timing

A caller may reconnect the same physical root inside its `ely:cleanup` listener,
update its seed or replace its descendants with actual rendered markup, and call
public `mount(root, handlers)`. Once the old teardown completes, the requested new
owner should be ready with the new seed visible, properly expanded and positioned,
and keyboard-operable. Old disposers must not close that new presentation or
leave its request identity consumed without the requested presentation. Cleanup
must remain once per controller; only the fresh listeners and callbacks survive.

The browser test observes after a new task and two animation frames, following
real `MutationObserver` pruning. It records state inside the cleanup listener,
but deliberately does not require initialization there to remain synchronous.
There is no claim that arbitrary insertion alone initializes controllers. Every
reconnection requiring initialization explicitly calls public `mount`.

One possible future design is to accept a cleanup-time mount synchronously but
defer its family initialization until the current root's old disposer sequence
has finished, before the next task. That is a proposal, **not implemented here**.
Its compatibility change must be stated: callers cannot rely on newly initialized
presentation being observable before their cleanup listener returns. Ordinary
mounts outside teardown should retain their synchronous behavior. Multiple
cleanup-time mounts, a returned host disposer, disconnection before queued start,
initializer/cleanup errors, nested roots, and pending HTMX contexts need explicit
ownership/cancellation rules and additional tests before selecting that design.

Moving disposers ahead of `ely:cleanup` is not an equivalent fix. It reverses the
documented order and changes what listeners see, handler availability, cleanup
error ordering, and foundation/host listener interactions. This baseline keeps
the pre-disposer event and verifies old presentation is still visible when it
fires. No production guard, event reordering or speculative fix is included.

## Cases and causal isolation

All eight cases start on independent full pages. Both surfaces use the existing
production fixture commands: `ui.RenderComponent` for standalone, and the actual
SDUI `CatalogueRegistry + Decode + Compile + Plan.Render` path for catalogue.
The standalone dependency list must contain neither SDUI nor adapters. All core,
interaction, bundled HTMX, CSS and referenced font/image bytes use the existing
production asset loader. No new Go fixture server or copied runtime is added.

- `observer.same-root`: remove the root, let the real observer clean it, reconnect
  and explicitly mount that exact node in its cleanup listener with seed 2.
- `observer.same-root-new-descendants`: same path, but replace descendants with
  the existing production fragment before explicitly mounting.
- `observer.different-root`: the cleanup listener mounts a different physical
  root with the same textual ID and seed 1, which was already consumed by the old
  root. This isolates physical ownership from the same-root stale-close path.
- `observer.sequential`: wait for observer teardown and listener removal, then
  reconnect/mount the same physical root with seed 2. This isolates reentry timing.
- `observer.normal-detach`: no reconnect; the old visible menu must close and
  listeners/readiness must disappear. A later request to it is inert.
- `htmx.retained`, `htmx.delayed`, `htmx.cancelled`: call actual bundled
  `htmx.ajax` with an HTTP production fragment and an `innerHTML` retained target.
  Context suspension must already exist when cleanup-time mount is requested.
  The delayed case uses the real `swap:120` timer, not an intercepted timer. The
  cancelled case cancels a real prepared swap in a later event listener and must
  resume on its real final notification. Both retain the same desired seed result.

Readiness, cleanup count/order, listener cardinality and function identity,
physical identity, duplicate-seed behavior, presentation, native keyboard input,
fresh callback count and dismissal/focus return have distinct assertions. The
new seed is checked before any recovery request. Later changed-number requests
probe the fresh controller even if the desired presentation assertion failed;
they never erase or reinterpret that failure. The returned report retains every
mismatch and each independent case still runs.

The listener observer forwards native add/remove calls unchanged and never wraps
handlers. Its five tracked event types use non-once production listeners. It is
an identity/count observation only; real event delivery is exercised separately.
Runtime error observers attach directly to each tested old/fresh root as well as
the document, so caught disposer errors on detached roots cannot disappear.
Event-identity deduplication retains one exact message/stack/owner record when a
connected error reaches both observers. A separate Node EventTarget unit check
validates this logger, without claiming browser propagation or lifecycle proof.
Owner requests are intentionally synthetic public CustomEvents, while key input
is trusted Playwright keyboard input. No synthetic HTMX lifecycle event or
private lifecycle function invocation can substitute for the observer cases.

## Diagnostic intervention, not a fix

The original [browser diagnosis](../../ui/gohtmx/tests/browser/diagnostics/cleanup-remount-original.mjs)
is preserved byte-for-byte from the audit. It asserts the observed defect and
therefore is **not** an acceptance test, is not imported by the desired runner,
and was not executed locally as part of this patch.

An optional `elide-close` intervention removes only the exact single teardown
`close()` call from a served test copy of the interaction asset. Source files,
core and all other assets stay unchanged. Anchor cardinality and the one-file
source/served hash difference are checked before browser launch. All eight cases
and the same desired oracles run, including normal detach. For the diagnosed
cause, same-root seed presentation should recover, while normal-detach close
must fail; replacement/sequential/HTMX old-close checks may also fail. Callback,
listener and duplicate identity checks should not be accidentally bypassed.
Compare the case-level results and all unexpected errors with the clean run.
A cause cannot be claimed from an unrelated exception, missing case, or dirty
source. The intervention does not normalize any failure into success and remains
a nonzero diagnostic run. It is not a proposed production implementation.

## Fresh CI and evidence

Publish/restack only after the preceding pointer-selection work is integrated
and the coordinator approves publication. Then run on the exact clean reviewed
commit with Node 24, Go 1.26.x, lockfile Playwright 1.57.0 and installed Chromium:

```sh
npm ci
node scripts/cleanup-remount-oracles-test.mjs
npx playwright install --with-deps chromium
CLEANUP_REMOUNT_SURFACE=standalone CLEANUP_REMOUNT_GROUP=desired node ui/gohtmx/tests/browser/cleanup-remount-browser-test.mjs
CLEANUP_REMOUNT_SURFACE=standalone CLEANUP_REMOUNT_GROUP=controls node ui/gohtmx/tests/browser/cleanup-remount-browser-test.mjs
CLEANUP_REMOUNT_SURFACE=catalogue CLEANUP_REMOUNT_GROUP=desired node ui/gohtmx/tests/browser/cleanup-remount-browser-test.mjs
CLEANUP_REMOUNT_SURFACE=catalogue CLEANUP_REMOUNT_GROUP=controls node ui/gohtmx/tests/browser/cleanup-remount-browser-test.mjs
```

The [focused workflow](../../.github/workflows/cleanup-remount.yml) separates safe
controls from desired cases in independent non-fail-fast jobs, so failing desired
behavior cannot skip safe controls. No failure suppression or expected-red
success mode exists. The baseline branch `test/cleanup-remount-baseline`
automatically runs the close-elision diagnostic for both renderers on push and
pull request, alongside all four clean jobs. Workflow dispatch with `causal=true`
also enables it. This temporary branch-scoped trigger supports a fresh causal
comparison where workflow dispatch is unavailable; preserve the original clean
run and its exact source/tree/artifacts before advancing the branch.

Diagnostic jobs retain their real nonzero exit: normal-close coverage should fail
and they are not release acceptance. They do not modify tracked production files
or suppress clean desired failures. Remove the temporary automatic trigger before
integrating a later production repair, then re-run clean CI and inspect exact-head
reports before treating the strengthened requirement as supported.

Reports under `test-results/contracts/cleanup-remount-*.json` record the clean
Git revision/tree, toolchain and Chromium version, harness/fixture input hashes,
source/served asset hashes, HTTP receipt hashes, browser response-body hashes,
actual fixture HTML, runtime/console/page/server/network errors, case-level
observations, listener identities and native input provenance. Clean source and
zero incidental errors are prerequisites for interpreting behavior. HTTP hashes
alone are not browser-execution evidence; the browser must load the exact core,
interaction and HTMX bytes before each case is interpreted.

Local syntax, source-oracle audits, renderer/unit tests and package checks cannot
establish real observer scheduling, native focus, actual HTMX delivery or browser
presentation. No local browser/user computer execution is part of this patch.
