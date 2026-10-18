#!/usr/bin/env node
// Run with the same Go toolchain used to build the supplied WASM binary:
// node scripts/sdui-wasm-smoke-test.cjs path/to/playground.wasm
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { performance } = require('node:perf_hooks');
const { gzipSync } = require('node:zlib');

globalThis.crypto = require('node:crypto').webcrypto;
const goroot = execFileSync('go', ['env', 'GOROOT'], { encoding: 'utf8' }).trim();
require(path.join(goroot, 'lib/wasm/wasm_exec.js'));
const root = path.resolve(__dirname, '..');

(async () => {
  if (!process.argv[2]) throw new Error('Usage: node scripts/sdui-wasm-smoke-test.cjs path/to/playground.wasm');
  const started = performance.now();
  const go = new Go();
  const bytes = fs.readFileSync(process.argv[2]);
  const result = await WebAssembly.instantiate(bytes, go.importObject);
  go.run(result.instance).catch(error => { console.error(error); process.exit(1); });
  const styles = {};
  for (const directory of ['ui/gohtmx/assets', 'adapters/gohtmx/assets']) {
    for (const name of fs.readdirSync(path.join(root, directory))) {
      if (name.endsWith('.css')) styles['assets/' + name] = fs.readFileSync(path.join(root, directory, name), 'utf8');
    }
  }
  assert.deepEqual(JSON.parse(elyPlaygroundInit(JSON.stringify(styles))), { ok: true });
  const initialized = performance.now();
  function request(raw, status = 200) {
    const result = JSON.parse(elyPlaygroundRequest('POST', '/api/preview', raw));
    assert.equal(result.status, status, result.body);
    return JSON.parse(result.body);
  }
  const rawScreen = '{"version":"1","id":"demo","root":{"id":"root","type":"text","props":{"text":"WASM renderer works"}}}';
  const preview = request('{"screen":' + rawScreen + ',"data":{},"profile":"dynamic","strategy":"smallest"}');
  assert(preview.html.includes('WASM renderer works'));
  assert(preview.html.includes('Content-Security-Policy'));
  assert(preview.html.includes("default-src 'none'"));
  assert(!preview.html.includes('<script'));
  assert.equal(preview.sizes.json.identity, Buffer.byteLength(rawScreen));
  for (const kind of ['json', 'html']) {
    for (const coding of ['identity', 'gzip', 'br', 'zstd']) assert(preview.sizes[kind][coding] > 0);
    assert(['identity', 'gzip', 'br', 'zstd'].includes(preview.sizes[kind].selected));
  }
  assert(preview.assets.includes('/assets/app.css'));
  // These become duplicate repeat keys if any bridge parses JSON as JS Numbers.
  request('{"screen":{"version":"1","id":"precision","root":{"id":"root","type":"text","props":{"text":"Exact integers"},"repeat":{"items":"/items","as":"item","key":"/id"}}},"data":{"items":[{"id":9007199254740992},{"id":9007199254740993}]}}');
  request('{"screen":', 422);
  request(' '.repeat(2 * 1024 * 1024 + 1), 413);
  assert.equal(JSON.parse(elyPlaygroundRequest('GET', '/api/preview', '')).status, 404);
  console.log(JSON.stringify({ passed: true, wasmBytes: bytes.length, gzipBytes: gzipSync(bytes, { level: 9 }).length, initializationMs: Math.round(initialized - started), smokeMs: Math.round(performance.now() - initialized), sizes: preview.sizes }, null, 2));
  process.exit(0);
})().catch(error => { console.error(error); process.exit(1); });
