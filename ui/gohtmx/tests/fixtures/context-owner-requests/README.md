# Owner-driven ContextMenu browser fixtures

The standalone command imports only `ui/gohtmx` and a test-only shell/data
package. Its dependency closure is checked by the browser harness. The separate
adapter fixture at `adapters/gohtmx/tests/fixtures/context-owner-requests` uses
`CatalogueRegistry`, `Decode`, `Compile`, and `Plan.Render`, with independent
literal lower-camel wire properties. Neither fixture implements menu behavior.

Generate production full pages or fragments without launching a browser:

```sh
go run ./ui/gohtmx/tests/fixtures/context-owner-requests -full
go run ./adapters/gohtmx/tests/fixtures/context-owner-requests -full
go run ./ui/gohtmx/tests/fixtures/context-owner-requests -id=manual -mode=manual -number=9007199254740993 -x=120.5 -y=80.25
go test ./ui/gohtmx/tests/fixtures/context-owner-requests ./adapters/gohtmx/tests/fixtures/context-owner-requests
node scripts/context-owner-oracles-test.mjs
```

Authorized browser CI commands:

```sh
node ui/gohtmx/tests/browser/context-owner-requests-browser-test.mjs
node scripts/context-owner-browser-controls.mjs
```

The positive command runs C1–C16 on both renderers. The control runner launches
each of fourteen independent single-anchor mutations separately on each renderer.
A focused control requires both environment variables:

```sh
CONTEXT_OWNER_SURFACE=catalogue CONTEXT_OWNER_NEGATIVE_CONTROL=context-request-dedupe node ui/gohtmx/tests/browser/context-owner-requests-browser-test.mjs
```

Evidence is written under `test-results/contracts/context-owner-requests-*` and
includes commit/tree/dirty state, source and served hashes, actual network
requests and response hashes, production fixture provenance, exact passed
prefixes and designated assertions, startup/runtime errors, and input provenance.
Owner CustomEvents are intentionally synthetic; Playwright mouse/keyboard input
is independently recorded as trusted input. NaN and infinities are created in
the page rather than serialized over JSON. All production CSS-referenced fonts
and images are served as exact binary bytes with hashes and correct MIME types;
missing referenced assets fail before browser startup. Geometry checks wait for
the production fonts to settle. Network HTMX exercises default
innerHTML, outerHTML, delayed, cancelled and OOB swaps.

A control is killed only by its declared assertion after all earlier cases have
passed, with no unexplained startup/runtime/server/console/network failure.
The cleanup control deliberately targets the earliest decisive assertion:
C10 same-node reinsertion must remain inert until normal startup. C11 separately
checks the stopped interval during a real delayed swap. C14 separately records
trusted right pointerdown focusing the production manual surface, pointerup,
then trusted Tab to the peer surface. Its focusout evidence must originate on
the surface, never the panel. A single-anchor host-listener control must pass
that exact evidence prefix before failing the dismissal assertion.

C15 composes an ordinary production Menu root inside a ContextMenu panel before
mounting, then verifies independent trigger-relative placement and focus return.
Its synthetic trigger click is labelled separately from trusted Escape. C16
prefetches a production fragment and calls bundled `htmx.swap` synchronously
inside seed focus, with a held swap delay. It verifies real prepared swap tasks,
synchronous cleanup, stopped readiness/request inertness, and retained-root
restart without seed replay. The prefetch is not described as `htmx.ajax`, and
no test-created HTMX lifecycle event is used. Each has its own single-anchor
control and exact within-case prerequisite prefix on both renderer fixtures.
The source audit also checks the existing Menu and empty-submenu cleanup
controls and the Menu native-focus control against their current anchors.

The existing menu browser suite and its 40 native trials remain a separate
required regression gate.

The source-only audit and Go fixture tests are not browser evidence. New owner
request browser results must be obtained from authorized exact-head CI.
