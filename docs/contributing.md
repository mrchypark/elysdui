# Contributing and verifying changes

These commands are for a repository checkout. Consumers follow
[getting started](gohtmx/getting-started.md) and do not need the Node toolchain.
Use Go 1.26.x and Node 24 to match [.github/workflows/test.yml](../.github/workflows/test.yml).
Check the actual workflow filename if it changes; CI is authoritative.

## Source map

- `ui/gohtmx/`: public template/assets/component APIs, shared `templates/`, `assets/`
  and `components.json`; no SDUI dependency.
- `ui/gohtmx/assets/input.css`: source styles; `app.css`: committed Tailwind output.
- `sdui/`: renderer-neutral schema, typed registry, validation and semantic resolution.
- `adapters/gohtmx/`: web rendering, catalogue, HTTP actions and browser integration.
- `adapters/ios/`, `adapters/android/`: bounded native client adapters.
- `contracts/native/profile-v1/`: native protocol, schema, support matrix and fixtures.
- `internal/gallery/`: demonstration fixtures/routes, never production defaults.
- `internal/playground/`, `cmd/sdui-playground/`: authoring server.
- `examples/gohtmx/`, `examples/sdui/web/`, `examples/native-profile/`: consumer examples.
- `.agents/skills/elysdui/`: reusable agent entrypoint.
- `docs/gohtmx/`, `docs/sdui/`, `docs/native/`: focused guides.

Fix library behavior in shared templates/assets, not only a gallery wrapper.
Keep unrelated edits intact. Retain licenses and attribution. Write new docs and
visible example copy in English. Update links when moving source or documentation;
this migration deliberately supplies no old-path stubs. Read [architecture](architecture.md).

## Standard checks

Run from repository root (the order matches CI):

```sh
go test ./...
go vet ./...
go test -race ./sdui ./adapters/gohtmx ./examples/sdui/web ./internal/playground
npm ci
npm test
npm run build:css
git diff --exit-code ui/gohtmx/assets/app.css
```

When intentionally changing styles, inspect and commit the generated CSS, then
rerun the build and ensure it is reproducible. Do not treat a generated CSS diff
as automatically safe. For component/contract changes also run:

```sh
go generate ./adapters/gohtmx
go run ./cmd/sdui-catalogue -check
```

Review generated contract/fixture diffs. Update focused renderer, escape,
interaction and regression tests rather than testing only documentation wording.

## Browser and static Pages checks

```sh
npx playwright install --with-deps chromium
npm run test:browser
npm run test:visual-regressions
node scripts/sdui-static-unit-test.mjs
bash scripts/build-pages.sh dist /elysdui/
node adapters/gohtmx/tests/browser/sdui-static-browser-test.mjs
GALLERY_STATIC=1 node ui/gohtmx/tests/browser/gallery-browser-test.mjs
```

The browser scripts start their own servers; do not leave competing servers on
their ports. Tests may need OS browser dependencies and permission to bind local
sockets. If blocked, report the failing command and rely only on separately
verified CI results, not an assumed browser pass. `dist/` and `test-results/` are
build/test output; do not include them in a source PR.

`test:visual-regressions` runs focused chart, heatmap contrast, tree, dialog, native-gallery and
workspace/calendar layout regressions, including mobile, theme and classic-scrollbar cases. It
retains screenshots and source-hash receipts under `test-results/`; CI uploads
these separately from the gallery evidence. Passing this finite regression set
does not establish visual coverage of every component or action state.

The static build compiles the Go renderer to WASM and writes a base-path-aware
Pages bundle. Building/testing it does not deploy. Deployment is the main-branch
workflow after all jobs pass; merging/deploying requires maintainer approval.
See [GitHub Pages](github-pages.md) for hosting and preview limits.

## Documentation and skill checks

Run `go run ./cmd/check-doc-links` from the repository root. It parses all
tracked Markdown (including README and skill files) with Goldmark/GFM and HTML
with an HTML tokenizer. It checks rendered links, reference links, images,
relative files, GitHub main-branch source links and document heading/HTML anchors;
code examples are not treated as navigation. Current-module imports must match their source packages; historical revision
links remain evidence about their original contents.

After building Pages, run `go run ./cmd/check-doc-links -pages dist` to also
validate the hub's generated asset/navigation targets and public Pages URLs
against the actual export. CI runs both offline checks. Public external links
can be checked separately with `go run ./cmd/check-doc-links -external` (15-second
limit per URL). HTTP 404/410 fails; blocked/rate-limited responses and timeouts
are reported as `UNVERIFIED`, not silently accepted or called broken. Local demo
addresses are skipped. External fragments and browser-only redirects require
manual verification; network-dependent checks do not gate CI.

Run `go test ./examples/gohtmx/minimal` after changing the starter. Copy its source and
test into a new module using [the consumer commands](gohtmx/getting-started.md) to catch
accidental use of internal packages or checkout-only assumptions. When revising
the skill, have an independent agent use only the entrypoint and linked docs to
build a tiny consumer in a temporary directory. Record gaps and fix observed
failures. Check relative links, exact CLI flags and examples against the code.

In a PR, report the exact revision, checks passed, failures/limits and any
remaining manual/browser validation. Historical [v0.1.0 verification](verification.md)
is not evidence for a new commit. Open a draft PR; do not merge or deploy implicitly.

## Native profile slice

For `sdui/native.go`, `examples/native-profile` or native app changes, also run:

```sh
go test ./sdui ./examples/native-profile
go test -race ./sdui ./adapters/gohtmx ./examples/native-profile
```

Follow [iOS](../adapters/ios/README.md) and [Android](../adapters/android/README.md)
for native build/test commands. `.github/workflows/native.yml` compiles the real
app targets, runs platform model/transport tests, and exercises native profile
validation/save interactions against Go in iOS Simulator and Android Emulator.
It retains screenshots and reports; inspect the exact-head run before claiming
these checks passed. Shared JSON fixtures are
verified against actual Go HTTP responses, then decoded by both native clients.
To intentionally regenerate them after a reviewed contract change:

```sh
UPDATE_NATIVE_FIXTURES=1 go test ./examples/native-profile -run 'TestNative.*Fixtures'
```

A v1 wire change requires updating all three implementations/fixtures together.
Report app compilation, model tests and actual simulator/device interaction as
separate stages. Native accessibility, IME and focus behavior need manual
platform validation beyond a compile.

## Embedded notices

The standalone UI embeds copies of the repository license and third-party notice.
After changing either canonical root file, run `node scripts/sync-ui-notices.mjs`.
CI and conformance tests reject stale copies. Legal text remains unchanged by
asset packaging.
