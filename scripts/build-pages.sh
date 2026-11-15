#!/usr/bin/env bash
set -euo pipefail
# Pure static build: no remote APIs, credentials, or runtime server are needed.
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"
out="${1:-dist}"
base="${2:-/elysdui/}"
source "$root/scripts/pages-base.sh"
if ! valid_pages_base "$base"; then
  echo "Base must be a clean absolute path with a trailing slash" >&2
  exit 1
fi
gallery_base="${base}go-htmx/"
if [ -e "$out" ]; then
  echo "Output directory already exists: $out (choose a fresh directory)" >&2
  exit 1
fi
mkdir -p "$out/go-htmx"
cp site/index.html "$out/index.html"
go run ./cmd/ely-gallery-static -dir "$out/go-htmx" -base "$gallery_base"
mkdir -p "$out/go-htmx/charts" "$out/go-htmx/time-series"
cp site/chart-pages.css "$out/go-htmx/assets/chart-pages.css"
node - "$out" "$gallery_base" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [out, base] = process.argv.slice(2);
const galleryIndex = path.join(out, 'go-htmx/index.html');
const index = fs.readFileSync(galleryIndex, 'utf8');
const galleryAction = '<a class="gallery-secondary" href="#gallery-browser">';
if (!index.includes(galleryAction)) throw new Error('Component gallery navigation not found');
fs.writeFileSync(galleryIndex, index.replace(galleryAction, `<a class="gallery-secondary" href="${base}charts/">Explore charts ↗</a>${galleryAction}`));
for (const [source, destination] of [
  ['examples/gohtmx/chart-gallery/index.html', 'go-htmx/charts/index.html'],
  ['examples/gohtmx/timeseries/index.html', 'go-htmx/time-series/index.html'],
]) {
  const gallery = destination.includes('/charts/');
  let html = fs.readFileSync(source, 'utf8').replaceAll('/assets/', `${base}assets/`);
  const header = `<a class="skip" href="#main">Skip to content</a><header class="site-header"><div class="site-header__inner"><a class="wordmark" href="${base}"><span class="brand-mark" aria-hidden="true"></span>elysdui</a><nav class="header-nav" aria-label="Explore examples"><a href="${base}">Components</a><a href="${base}components/usage/">Form examples</a><a href="${base}components/themes/">Themes</a><a href="${base}charts/"${gallery?' aria-current="page"':''}>Charts</a><a href="${base}playground/">Playground</a></nav><button type="button" class="theme-toggle" data-theme-toggle aria-label="Toggle color theme" aria-pressed="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4 8.5 8.5 0 1 0 20 14.5Z"/></svg></button></div></header><p class="project-origin">Independent project inspired by <a href="https://elygpui.com/">Ely GPUI</a>. Not affiliated with or endorsed by Ely GPUI.</p>`;
  if (!html.includes('<body><main>') || !html.includes('<style>')) throw new Error(`Unexpected example structure: ${source}`);
  html = html.replace(/<style>[\s\S]*?<\/style>/, `<link rel="icon" type="image/svg+xml" href="${base}assets/elysdui-mark.svg"><link rel="stylesheet" href="${base}assets/site-chrome.css"><link rel="stylesheet" href="${base}assets/chart-pages.css"><script src="${base}assets/theme.js"></script>`);
  html = html.replace('<body><main>', `<body>${header}<main id="main">`);
  if (gallery) {
    html = html.replace('<h1>Ely web chart gallery</h1><p>Interactive charts from application-supplied data. Open “Chart values” for keyboard access.</p>', `<div class="page-intro"><p class="eyebrow">GO / HTMX · CHARTS</p><h1>Explore the data.</h1><p>Interactive charts for application-supplied data. Select marks or open “Chart values” for keyboard access.</p></div><nav class="chart-links" aria-label="Chart examples"><span>Explore</span><a href="${base}time-series/">1 million timestamps × 3 series</a><a href="${base}charts/?chart=Scatter1M">1 million point scatter</a><a href="https://github.com/mrchypark/elysdui/blob/main/docs/gohtmx/charts.md">Chart documentation ↗</a></nav>`);
  } else {
    html = html.replace('<h1>Time series performance</h1>', `<div class="page-intro"><p class="eyebrow">GO / HTMX · CHARTS / LARGE DATA</p><h1>Time series at scale.</h1><p><a href="${base}charts/">← All chart examples</a> · <a href="${base}charts/?chart=Scatter1M">Try the million point scatter →</a></p></div>`);
  }
  html = html.replace('</main>', `</main><footer class="chart-footer"><a href="${base}">Component gallery</a><a href="${base}charts/">Chart examples</a><a href="https://github.com/mrchypark/elysdui/blob/main/docs/gohtmx/charts.md">Documentation ↗</a><a href="${base}../">Project home</a></footer>`);
  fs.writeFileSync(path.join(out, destination), html);
}
NODE
go run ./cmd/sdui-playground-static -dir "$out/go-htmx/playground"
GOOS=js GOARCH=wasm go build -trimpath -ldflags='-s -w' -o "$out/go-htmx/playground/renderer.wasm" ./cmd/sdui-playground-wasm
cp "$(go env GOROOT)/lib/wasm/wasm_exec.js" "$out/go-htmx/playground/wasm_exec.js"
node scripts/version-pages-assets.mjs "$out" "$base"
touch "$out/.nojekyll"
printf 'Project hub, static gallery and browser-only editor built in %s\n' "$out"
node -e 'const fs=require("fs"),zlib=require("zlib");const b=fs.readFileSync(process.argv[1]);console.log(JSON.stringify({wasmBytes:b.length,gzip9Bytes:zlib.gzipSync(b,{level:9}).length}));' "$out/go-htmx/playground/renderer.wasm"
