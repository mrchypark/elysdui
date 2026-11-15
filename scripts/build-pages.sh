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
node - "$out" "$gallery_base" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const [out, base] = process.argv.slice(2);
for (const [source, destination] of [
  ['examples/gohtmx/chart-gallery/index.html', 'go-htmx/charts/index.html'],
  ['examples/gohtmx/timeseries/index.html', 'go-htmx/time-series/index.html'],
]) {
  let html = fs.readFileSync(source, 'utf8').replaceAll('/assets/', `${base}assets/`);
  if (destination.includes('/charts/')) {
    html = html.replace('<div id="gallery"', `<p>Explore pointer, keyboard and touch interactions. These charts use application data without SDUI.</p><p><a href="../time-series/">1 million timestamps × 3 series</a> · <a href="?chart=Scatter1M">1 million point scatter</a> · <a href="https://github.com/mrchypark/elysdui/blob/main/docs/gohtmx/charts.md">Chart documentation</a> · <a href="../">Component gallery</a></p><div id="gallery"`);
  }
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
