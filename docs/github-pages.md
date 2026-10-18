# Project hub, static component gallery and SDUI Studio

The root `/elysdui/` introduces the shared SDUI architecture and each project.
The full component gallery lives at `/elysdui/go-htmx/` and its editor at
`/elysdui/go-htmx/playground/`, a
browser-only visual/JSON editor. It needs no Go server, local API, account, or
remote save service. Drafts remain in this browser's local storage; export JSON
for a portable copy. Do not enter secrets into a public demo or a shared browser.

## Build

With the repository's Go and Node toolchains installed:

    bash scripts/build-pages.sh dist /elysdui/

The output directory must not already exist. The base argument is the final
project URL path and must retain its leading/trailing slash. Serve `dist` at
that path; do not open HTML directly using `file:`. A static server must serve
`.wasm` as `application/wasm` (the loader also supports an ordinary byte fetch).
The `.nojekyll` marker keeps GitHub Pages from processing the generated files.
The build copies the `wasm_exec.js` matching the Go compiler automatically.

The hub links to the gallery and editor. The gallery and editor link to each other. The gallery exports real Go-rendered
component stories and local assets. Server-dependent gallery demo actions are
inert and explain that a running backend is required. The editor renders all
registered contracts, including typed slots, bindings, repeats, templates and
event metadata. Preview actions are deliberately inert: the opaque iframe grants
no scripts, forms, navigation, same-origin access, or arbitrary network loads.

## Browsing the gallery

The Go / HTMX gallery landing page presents 44 visual category cards. Each thumbnail is one
representative, inert Go-rendered component; full interactive behavior is on the
linked detail page. All 624 examples remain available through each card's
expandable list. Search includes component names and aliases, and combines with
the category selector. Filters are reflected in the URL and restored on reload
or browser Back. Empty results have a reset action. Without JavaScript, the full
collection and its example links remain available.

Playground is available from the primary navigation and gallery calls to action.
On the local gallery server `/playground/` redirects to the public browser-only
editor; the independent local editor can still be started with
`go run ./cmd/sdui-playground`. Static exports resolve the link under their
configured base path. Advanced API and behavior checks remain available under
Developer tools in the footer.

Gallery regression checks run against the live Go server with
`node ui/gohtmx/tests/browser/gallery-browser-test.mjs` and the static export with
`GALLERY_STATIC=1 node ui/gohtmx/tests/browser/gallery-browser-test.mjs`. CI uploads gallery
screenshots at desktop, 390px and 320px widths, alongside editor evidence.

## Architecture and limits

- Names, examples and per-component contracts are static JSON files. A contract
  loads only when it is selected or needed by the inspector
- The first preview downloads the Go/WASM renderer in a dedicated Web Worker
- The worker runs the same Go Decode → Compile → Render and sanitizer as the
  local playground. Raw JSON crosses the bridge as strings to preserve numbers
- Delivery sizes use the same actual Go gzip, Brotli and zstd codecs/options.
  They are payload measurements, not the browser's HTTP transfer size
- Trusted deployment styles are separate assets; the worker uses only those
  assets and hashes their inline CSS into the preview's restrictive CSP
- Rendering/compression work stays off the editor thread. The first load still
  needs a multi-megabyte download and sufficient memory; older/mobile devices
  can be slower. JSON editing/export remain available if WASM is unsupported
- A modern browser with Web Workers and WebAssembly is required for preview.
  There is no authentication, collaboration, cloud persistence or backend action
  execution in this static edition

The optimized build initially measured 17,307,690 bytes raw and 4,239,345 bytes
with gzip level 9, versus the asset-embedded renderer's 25,283,492 / 8,669,021 bytes.
This is a 31.5% raw and 51.1% gzip reduction. These gzip numbers are reproducible
local compression measurements, not a promise about GitHub Pages transfer
encoding. `build-pages.sh` prints the current build's sizes; CI records actual
browser startup separately. No mobile-device speed claim is made.

## Validation and deployment

CI runs the hub under `/elysdui/` and the gallery/editor under
`/elysdui/go-htmx/`. It tests hub navigation, responsive layout, and real WASM preview, visual
editing, source sync, examples, imports/exports, sandbox behavior and responsive
layout in Chromium. The workflow uploads the built site and browser evidence.
The repository uses Settings → Pages → GitHub Actions. The deployment job runs
only on pushes to `main`, after all three test jobs pass, and publishes
the tested artifact with the official Pages actions. Pull-request runs never deploy.
Merge reviewed changes into `main` to deploy. The `github-pages` environment
protection rules remain in effect; do not weaken them to deploy a feature branch.

GitHub instructions: https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site
