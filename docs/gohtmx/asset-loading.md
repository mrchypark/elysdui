# Selective advanced-family assets

This guide covers standalone `ui/gohtmx`. For SDUI web hosts, use
`gohtmx.BindAssets(mux)` from `adapters/gohtmx` once instead of `ui.BindAssets`,
so the adapter-owned SDUI bridge is registered alongside the UI assets.

`ui-advanced-family-assets` selects JavaScript as well as CSS. Use these helpers
in the initial page shell, after the application stylesheet and basic controls:

```gotemplate
<link rel="stylesheet" href="/assets/app.css">
{{template "ui-component-assets"}}
{{template "ui-advanced-family-assets" "workspace"}}
{{template "ui-advanced-family-assets" "communication"}}
<script src="/assets/htmx.min.js" defer></script>
```

Supported family names are `foundation`, `interaction`, `data`, `workspace`,
`communication`, `native`, and `forms`. A helper emits the shared advanced CSS,
its family CSS, and `/assets/ely-api-<family>-entry.js`. Every entry imports the
common `/assets/ely-api.js` lifecycle and its family module. Existing module
imports supply that family's additional dependencies. `BindAssets` and the
export command include the entrypoints without a consumer-side JavaScript build.

The alternative remains unchanged:

```gotemplate
{{template "ui-component-assets"}}
{{template "ui-advanced-assets"}}
```

That helper still loads `/assets/ely-api-all.js`, every family stylesheet, and
Lottie. Existing direct consumers of `ely-api-all.js` keep all registrations.
Loading it alongside selective entries also loads every family, eliminating the
selective-loading benefit.

## Dependencies and initialization

- All families share `ely-api.js` for initial mount, HTMX swaps, action dispatch,
  and cleanup when a component is removed
- Foundation and communication share `ely-math.js`. KaTeX is still loaded lazily
  only when a math component requests it
- Data includes the shared patterns behavior
- Workspace includes its source, file, devtools, and canvas helpers. Canvas
  imports the forms family for nested color/gradient controls, so the workspace
  asset helper also includes the forms stylesheet
- Forms includes shared code/expression utilities; native includes its existing
  native helpers and expression utility
- Communication additionally includes calendar-parity CSS; native includes
  native-tooling CSS
- Interaction retains its existing deferred classic Lottie script
- Maps still require `ui-map-assets` separately

Different family entries and the all-family loader import the same canonical
module URLs. Browser ES-module caching shares their runtime and registrations;
loading workspace and forms together does not register forms twice. Include
`ui-component-assets` only once. Prefer each family helper once in the page shell
as well: repeated helpers still emit stylesheet tags, and interaction's classic
Lottie script is not governed by ES-module caching. Keep canonical asset URLs;
adding different cache-busting query strings to copies of the same module can
create separate module identities.

## HTMX and dynamic pages

A preloaded family initializes newly swapped component roots on the bundled
HTMX `htmx:after:swap` event. Replacing roots also cleans their previous handlers.
Each instance still needs its own unique ID.

The selective helper does not inspect future HTML or fetch missing families on
demand. Include the union of families that any later fragment can introduce in
the initial shell. For an open-ended component gallery, dynamic editor, or route
shell where that union is unknown, use `ui-advanced-assets`.

Do not rely on asset-helper script tags inside an HTMX fragment to load a new
family: script processing varies by HTMX configuration and a cached entrypoint
does not re-execute. A host implementing explicit lazy loading must load the
family's CSS, import its canonical entrypoint, and then insert/initialize content
through the supported lifecycle. If inserting DOM outside HTMX, call the
`mount(root, handlers)` API from `/assets/ely-api.js` after loading the family.

## Regression checks

```sh
go test ./ui/gohtmx -run 'TestAdvanced(Family|All)Assets|TestAdvancedFamilyEntrypoints'
node ui/gohtmx/tests/unit/family_assets_test.mjs
node ui/gohtmx/tests/unit/family_assets_test.mjs --report
```

The Go checks render every family helper, verify its stylesheet/vendor
requirements and module entrypoint, retain the all-family helper contract, and
check that the new entrypoints are embedded and served. The Node checks traverse
actual static import graphs and execute the actual modules using a small DOM
double. They cover multiple/repeated entries, both all-loader import orders,
initial mounting, repeated HTMX lifecycle events, one action per click, and
cleanup. They do not replace browser verification.

### Static graph comparison, not measured browser performance

The following is a loading-strategy comparison using the same current module
contents on each side. “Before” selects `ely-api-all.js`, as the old family helper
did; “after” selects the corresponding family entrypoint. Counts are unique
static module URLs (a cold module graph's candidate requests); bytes are the sum
of their uncompressed UTF-8 source files. These are **not measured browser
requests, transferred bytes, or load times**.

| Family | Before module URLs | After module URLs | Before source bytes | After source bytes |
| --- | ---: | ---: | ---: | ---: |
| Foundation | 25 | 4 | 881,429 | 54,184 |
| Interaction | 25 | 3 | 881,429 | 149,619 |
| Data | 25 | 4 | 881,429 | 60,473 |
| Workspace | 25 | 10 | 881,429 | 314,884 |
| Communication | 25 | 4 | 881,429 | 115,204 |
| Native | 25 | 12 | 881,429 | 223,772 |
| Forms | 25 | 5 | 881,429 | 94,445 |

Re-run `--report` after changing source files; these byte counts are a snapshot.
The estimate excludes shared classic scripts, CSS, fonts, icons/media, lazy KaTeX,
and workers. It cannot predict HTTP compression/caching, browser parsing and
execution, or end-to-end performance.

### Browser verification and measurement

The optional browser harness requires Go, the npm development dependencies, and
Playwright Chromium:

```sh
npm ci
npx playwright install chromium
node ui/gohtmx/tests/browser/family-assets-browser-test.mjs
```

It generates fixtures through the actual Go templates, serves local HTTP, and
runs actual bundled HTMX. It checks:

1. A workspace-only entry requests precisely its allowed family/support graph
   and initializes its nested forms, including color-input behavior
2. Repeated workspace helpers plus forms/foundation helpers share module
   registration and emit exactly one action for one click
3. The unchanged all-loader still initializes the fixture
4. Script-free fragments initialize on a real HTMX request, and a second swap
   cleans up the removed instance
5. No browser JavaScript, Ely initialization, or HTTP errors occur

Three alternating before/after pairs use fresh browser contexts with cache
explicitly disabled. Before and after use the same rendered workspace fixture,
CSS, static server, viewport, and asset contents; only the module entrypoint
changes. The JSON output records initial requests, their URLs, Resource Timing
transfer/encoded/decoded byte totals, DOMContentLoaded, and load-event timing.
Numbers from this harness are measured **synthetic local cold-cache samples**,
not a production or user-performance benchmark. There is no timing threshold.
The mixed/all checks are separate functional cases, not comparison samples.

Browser launch and socket use were blocked by the local execution sandbox during
implementation. The Go fixtures, JavaScript syntax, import graphs, and Node
lifecycle checks were validated locally; the browser network and timing
acceptance criteria require a successful run on a normal browser-capable runner.
Do not treat the static table above as a substitute for that run.

### Component replacement lifecycle

For bundled HTMX `innerHTML`, `outerHTML`, `outerSync`, `textContent`, and `delete`
swaps, the shared family runtime tears down affected controllers before replacing
markup and initializes connected roots after the swap. This includes actual swap
targets in out-of-band tasks, rather than assuming the request button is the target.
A retained component root therefore gets fresh descendant references after the
normal default `innerHTML` swap. Nested roots affected by replacement clean up
once; unrelated siblings and ancestors of a nested component are left intact.
Repeated after-swap notifications do not duplicate controllers. Delayed and
overlapping swaps keep affected roots suspended until their own contexts finish;
unrelated completed swaps cannot initialize the old descendants. Cancelled prepared
swaps recover their controllers on the final swap notification.

`mount(root, handlers)` bindings belong to that DOM element. A retained root keeps
its host callbacks across replacement, but pending operations from the previous
markup cannot publish `ely:result` or `ely:error`. This does not cancel the host's
own network request or undo effects performed inside its callback. Removed roots
lose their bindings; a replacement element, or an old element reinserted after
removal, needs a new `mount` call. Replacement bindings dispose the previous
binding; an old returned disposer cannot remove the newer binding. Host code must
not rely on arbitrary DOM mutations or custom/morph swaps to rebuild controllers.

Family initializers registered through `register(family, initialize)` may accept
an optional second argument, `initialize(root, registerCleanup)`. Register a
cleanup function before any synchronous focus or event callback that could stop
or replace the controller. Existing one-argument initializers may still return a
cleanup function. Registering and returning the same function disposes it only
once per initialization, including when initialization resumes after a stop.
The registration callback belongs to its original mount: functions registered
after that mount stops or is replaced run immediately, without joining the newer
mount. Stale initializer returns and errors cannot overwrite the newer mount's
readiness or publish an old initialization error.

An initializer that throws while it still owns the root retains the existing
`ely:error` event and `data-ely-ready="error"` behavior; its registered cleanup
runs on teardown. A throwing cleanup also emits `ely:error` with `{id, error}`,
without changing readiness or preventing remaining cleanup and sibling roots
from stopping. Cleanup remains ordered after `ely:cleanup`; a remount during
cleanup or error notification keeps its own readiness. If startup overlaps a
root currently running its old cleanup, family startup waits until all of that
teardown's registered disposers and readiness removal finish. Repeated requests
coalesce, then synchronously re-scan the connected live subtree, current family
and pending HTMX contexts. This includes newly inserted descendant roots; an
unrelated sibling or different replacement element remains synchronous. A pending
ancestor or descendant swap also blocks overlapping startup until its last owning
context completes. Detached queued scopes are discarded.

`mount` still replaces host handlers and returns their disposer immediately;
only overlapping family startup is deferred. A previously returned host disposer
cannot remove the latest binding. Disposing the current host binding during
cleanup removes its callbacks but does not cancel the requested family startup.
Ordinary mounting with no overlapping teardown
or pending swap remains synchronous. No remount is scheduled by cleanup alone.

This serialization does not make arbitrary retired cleanup bodies harmless. An
initializer that stops and then returns a previously unregistered DOM-mutating
cleanup can still affect a fresh mount, as can a later call to its old registrar.
Register the complete cleanup before any callback that can stop initialization.
Also, old family listeners still exist during `ely:cleanup`, before their
disposers run. An explicit `ely:context-request` dispatched there can be consumed
by that old listener; startup deferral does not defer or suppress such input.
Automatic seed startup and explicit input during cleanup are separate behaviors.

Focused checks (browser launch requires a browser-capable runner):

```sh
node ui/gohtmx/tests/unit/initializer_cleanup_test.mjs
node scripts/initializer-cleanup-negative-test.mjs
node ui/gohtmx/tests/unit/cleanup_remount_test.mjs
node scripts/cleanup-remount-negative-test.mjs
node ui/gohtmx/tests/unit/family_lifecycle_test.mjs
LIFECYCLE_NEGATIVE_CONTROL=stale-refs node ui/gohtmx/tests/unit/family_lifecycle_test.mjs
LIFECYCLE_NEGATIVE_CONTROL=stale-results node ui/gohtmx/tests/unit/family_lifecycle_test.mjs
node ui/gohtmx/tests/browser/family-lifecycle-browser-test.mjs
LIFECYCLE_NEGATIVE_CONTROL=stale-refs node ui/gohtmx/tests/browser/family-lifecycle-browser-test.mjs
LIFECYCLE_NEGATIVE_CONTROL=stale-results node ui/gohtmx/tests/browser/family-lifecycle-browser-test.mjs
```

The browser suite uses production Go-rendered DataTables and real default
`innerHTML` and `outerHTML` HTMX requests. It checks cached references, detached
handlers, same-node reinsertion, host callback results, nested ownership, and
balanced timer/observer disposal using an instrumented additional family. The
negative controls deliberately remove teardown or pending-operation invalidation;
they pass only when the corresponding behavioral assertion detects the defect.
