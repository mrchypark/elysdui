import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source = readFileSync(new URL('../../assets/ely-map.js', import.meta.url), 'utf8');
const flush = () => new Promise(resolve => setImmediate(resolve));
function node() {
  return {dataset: {}, style: {}, children: [], attributes: {}, hidden: false, isConnected: true, textContent: '',
    append(child) { this.children.push(child); }, replaceChildren(...children) { this.children = children; },
    setAttribute(name, value) { this.attributes[name] = String(value); }, querySelector() { return this.status; }};
}
function harness(load, imageOptions = {}) {
  const events = new EventTarget(), calls = [], urls = new Set(), revoked = [], timers = new Map(); let serial = 0;
  const document = {baseURI: imageOptions.baseURI || 'https://app.test/maps/', location: {origin: imageOptions.origin || 'https://app.test'}, createElement: node, createElementNS: node,
    addEventListener: events.addEventListener.bind(events), dispatchEvent: events.dispatchEvent.bind(events)};
  class ResourceURL extends URL { static createObjectURL() { const id = `blob:test/${++serial}`; urls.add(id); return id; } static revokeObjectURL(id) { urls.delete(id); revoked.push(id); } }
  class Image { naturalWidth = imageOptions.width || 256; naturalHeight = imageOptions.height || 256; decode() { return imageOptions.decode?.() || Promise.resolve(); } }
  const api = runInNewContext(source.slice(source.indexOf('  const MAX_LAT'), source.indexOf('  const number =')) + '\n({tilePlacements, registerTileProvider, mountTileLayer, tileProviders, abortable})',
    {document, URL: ResourceURL, Image, AbortController, CustomEvent, Blob, setTimeout: fn => { const id = ++serial; timers.set(id, fn); return id; }, clearTimeout: id => timers.delete(id), fetch: (url, options) => { calls.push({url, ...options}); return load ? load(url, options) : Promise.resolve(response()); }});
  const root = node(), layer = node(), attribution = node(), signal = new AbortController(); root.status = node(); root.dataset.mapTileProvider = 'local'; attribution.textContent = 'Original attribution';
  const renderer = api.mountTileLayer(root, layer, attribution, signal.signal);
  const options = {revision: 'v1', minZoom: 0, maxZoom: 3, attribution: 'Natural Earth <local>', urlTemplate: '/tiles/{z}/{x}/{y}.png'};
  const register = (extra = {}, id = 'local') => api.registerTileProvider(id, {...options, ...extra});
  return {api, root, layer, attribution, signal, renderer, calls, urls, revoked, timers, register};
}
function response() { return new Response(new Uint8Array([1, 2, 3]), {headers: {'content-type': 'image/png'}}); }
const g = harness(), tiles = g.api.tilePlacements([0, 0], 1, 800, 600, 0, 19);
const preAborted = new AbortController(); preAborted.abort(); await assert.rejects(g.api.abortable(Promise.reject(new Error('late underlying failure')), preAborted.signal), /cancelled/); await flush();
assert.equal(tiles.length, 8); assert.equal(Math.min(...tiles.map(t => t.column)), -1); assert.equal(Math.max(...tiles.map(t => t.column)), 2);
assert.deepEqual(JSON.parse(JSON.stringify(tiles[0])), {z: 1, tileX: 1, tileY: 0, column: -1, x: -112, y: 44, w: 256, h: 256});
const fractional = g.api.tilePlacements([12.3, 45.6], 2.37, 800, 600, 0, 19);
for (const tile of fractional) {
  for (const key of ['x', 'y', 'w', 'h']) assert.ok(Number.isInteger(tile[key]));
  const east = fractional.find(next => next.column === tile.column + 1 && next.tileY === tile.tileY), south = fractional.find(next => next.column === tile.column && next.tileY === tile.tileY + 1);
  if (east) assert.equal(tile.x + tile.w, east.x); if (south) assert.equal(tile.y + tile.h, south.y);
}
assert.ok(g.api.tilePlacements([0, 0], 5, 800, 600, 0, 3).every(t => t.z === 3 && t.w === 1024 && t.h === 1024));
assert.ok(g.api.tilePlacements([0, 0], 1, 800, 600, 2, 3).every(t => t.z === 2 && t.w === 128 && t.h === 128));
assert.equal(g.api.tilePlacements([0, 0], 1, 799, 600, 0, 19)[0].x, -113, 'Negative half-pixel uses Rust rounding');
assert.equal(g.api.tilePlacements([0, 180], 1, 800, 600, 0, 19)[0].column, 0);
assert.equal(g.api.tilePlacements([0, -180], 1, 800, 600, 0, 19)[0].column, -2);
for (const center of [[90, 180], [-90, -180], [0, 540]]) assert.ok(g.api.tilePlacements(center, 2, 800, 600, 0, 19).every(t => t.tileX >= 0 && t.tileX < 4 && t.tileY >= 0 && t.tileY < 4));
for (const [w, h] of [[0, 600], [800, 0], [-1, 600]]) assert.equal(g.api.tilePlacements([0, 0], 1, w, h, 0, 3).length, 0);
assert.throws(() => g.api.tilePlacements([0, 0], 0, 800, 600, 19, 19), /256/);
for (const extra of [{minZoom: -1}, {maxZoom: 20}, {minZoom: 2, maxZoom: 1}, {minZoom: .5}, {revision: ''}, {attribution: ''}, {urlTemplate: 'javascript:{z}/{x}/{y}'}, {urlTemplate: 'http://outside.test/{z}/{x}/{y}'}, {urlTemplate: 'https://user:pass@outside.test/{z}/{x}/{y}'}, {urlTemplate: '/tiles/{z}/{x}/{bad}'}, {urlTemplate: () => '/tiles'}, {callback: 'alert(1)'}]) assert.throws(() => g.register(extra));
assert.throws(() => g.register({}, 'https://host.test'));
for (const urlTemplate of ['https://{z}.tiles.test/{x}/{y}', 'https://tiles.test:{x}/{z}/{y}', '//{x}.tiles.test/{z}/{y}', '  https://{x}.tiles.test/{z}/{y}', String.raw`https:\\{x}.tiles.test/{z}/{y}`]) assert.throws(() => g.register({urlTemplate}), /tokens/);
const externalBase = harness(undefined, {baseURI: 'http://outside.test/maps/', origin: 'https://app.test'});
assert.throws(() => externalBase.register(), /same-origin/);
externalBase.signal.abort();
g.root.dataset.mapTileProvider = 'https://untrusted.test/{z}/{x}/{y}.png'; g.renderer.update([0, 0], 1, 800, 600); assert.equal(g.calls.length, 0, 'Screen URL text is only an unknown ID'); g.root.dataset.mapTileProvider = 'local';
g.renderer.update([0, 0], 1, 800, 600); assert.equal(g.calls.length, 0); assert.equal(g.root.dataset.mapTilesState, 'unknown-provider'); assert.equal(g.root.status.hidden, false);
const oldDispose = g.register(); await flush(); await flush(); assert.equal(g.calls.length, 4, 'Wrapped world copies reuse four identities'); assert.equal(g.layer.children.length, 8); assert.equal(g.urls.size, 4); assert.equal(g.root.dataset.mapTilesState, 'ready'); assert.equal(g.attribution.textContent, 'Natural Earth <local>');
assert.ok(g.layer.children.every(slot => slot.dataset.mapTileState === 'ready' && slot.children[0].src.startsWith('blob:')));
g.renderer.update([0, 0], 1, 800, 600); await flush(); assert.equal(g.calls.length, 4, 'Repaint reuses decoded tiles');
g.renderer.update([0, 0], 1, 0, 600); await flush(); assert.equal(g.calls.length, 4); assert.equal(g.layer.children.length, 0); assert.equal(g.root.dataset.mapTilesState, 'ready');
g.renderer.update([0, 0], 1, 800, 600); const nextDispose = g.register({revision: 'v2'}); await flush(); await flush(); assert.equal(g.calls.length, 8); assert.equal(g.revoked.length, 4); oldDispose(); assert.ok(g.api.tileProviders.has('local'), 'Old unregister must not remove new provider');
nextDispose(); assert.equal(g.layer.children.length, 0); assert.equal(g.urls.size, 0); assert.equal(g.root.dataset.mapTilesState, 'unknown-provider');
g.root.dataset.mapTileProvider = ''; g.renderer.update([0, 0], 1, 800, 600); assert.equal(g.attribution.textContent, 'Original attribution'); assert.equal(g.layer.hidden, true);
g.root.dataset.mapTileProvider = 'local'; g.register({minZoom: 19, maxZoom: 19}); g.renderer.update([0, 0], 0, 800, 600); assert.equal(g.root.dataset.mapTilesState, 'coverage-limit'); assert.match(g.root.status.textContent, /limit/); assert.equal(g.calls.length, 8); g.signal.abort(); assert.equal(g.timers.size, 0);

const pending = [], slow = harness((url, options) => new Promise(resolve => pending.push({resolve, options, url})));
const disposeSlow = slow.register(); slow.renderer.update([0, 0], 3, 1400, 1000); await flush(); assert.equal(slow.calls.length, 8, 'At most eight concurrent loads');
slow.register({revision: 'new'}); await flush(); assert.equal(slow.calls.length, 16); assert.ok(pending.slice(0, 8).every(p => p.options.signal.aborted)); disposeSlow();
for (const p of pending.slice(0, 8)) p.resolve(response()); await flush(); await flush(); assert.equal(slow.calls.length, 16, 'Stale completions must not start extra current-generation loads'); assert.equal(slow.urls.size, 0);
slow.root.isConnected = false; slow.signal.abort(); for (const p of pending.slice(8)) p.resolve(response()); await flush(); await flush(); assert.equal(slow.layer.children.length, 0); assert.equal(slow.urls.size, 0); assert.equal(slow.root.dataset.mapTilesState, undefined); assert.equal(slow.timers.size, 0); assert.equal(slow.attribution.textContent, 'Original attribution', 'Cleanup restores source-independent attribution for remount');

const registry = harness(); for (let i = 0; i < 32; i++) registry.register({}, `provider${i}`); assert.throws(() => registry.register({}, 'overflow'), /32/); registry.register({revision: 'replace'}, 'provider0'); registry.signal.abort();
const broken = harness(async () => new Response('missing', {status: 404})); broken.register(); broken.renderer.update([0, 0], 1, 800, 600); await flush(); await flush(); assert.equal(broken.root.dataset.mapTilesState, 'error'); assert.ok(broken.layer.children.every(slot => slot.dataset.mapTileState === 'error')); assert.equal(broken.root.status.hidden, false); broken.signal.abort();
const invalid = harness(async () => new Response('<svg/>', {headers: {'content-type': 'image/svg+xml'}})); invalid.register(); invalid.renderer.update([0, 0], 1, 800, 600); await flush(); await flush(); assert.equal(invalid.urls.size, 0); assert.equal(invalid.root.dataset.mapTilesState, 'error'); invalid.signal.abort();
const cache = harness(); cache.register({maxZoom: 8}); for (let i = 0; i < 60; i++) { cache.renderer.update([0, i * 6 - 180], 8, 256, 256); await flush(); await flush(); } assert.ok(cache.urls.size <= 128); assert.ok(cache.revoked.length > 0); cache.signal.abort(); assert.equal(cache.urls.size, 0);
const decoded = [], timeout = harness(undefined, {decode: () => new Promise(resolve => decoded.push(resolve))}); timeout.register(); timeout.renderer.update([0, 0], 1, 800, 600); await flush(); assert.equal(timeout.urls.size, 4); assert.equal(timeout.root.dataset.mapTilesState, 'pending'); for (const expire of [...timeout.timers.values()]) expire(); await flush(); await flush(); assert.equal(timeout.root.dataset.mapTilesState, 'error'); assert.equal(timeout.urls.size, 0); assert.equal(timeout.timers.size, 0); for (const done of decoded) done(); await flush(); assert.equal(timeout.root.dataset.mapTilesState, 'error', 'Late decode cannot resurrect timed-out tiles'); timeout.signal.abort();
const pixels = harness(undefined, {width: 1024, height: 1024}); pixels.register(); pixels.renderer.update([0, 0], 3, 1400, 1000); for (let i = 0; i < 8; i++) await flush(); assert.equal(pixels.urls.size, 16, '16M-pixel retained image budget'); assert.equal(pixels.root.dataset.mapTilesState, 'error'); pixels.signal.abort();
const large = new Uint8Array(3 * 1024 * 1024), encoded = harness(async () => new Response(large, {headers: {'content-type': 'image/png'}})); encoded.register(); encoded.renderer.update([0, 0], 3, 1400, 1000); for (let i = 0; i < 10; i++) await flush(); assert.equal(encoded.urls.size, 10, '32 MiB encoded budget'); assert.equal(encoded.root.dataset.mapTilesState, 'error'); encoded.signal.abort();
const oversize = harness(async () => new Response(new Uint8Array(4 * 1024 * 1024 + 1), {headers: {'content-type': 'image/png'}})); oversize.register(); oversize.renderer.update([0, 0], 1, 800, 600); await flush(); await flush(); assert.equal(oversize.urls.size, 0); assert.equal(oversize.root.dataset.mapTilesState, 'error'); oversize.signal.abort();
const stuckCancel = harness(async () => ({ok: true, headers: new Headers({'content-type': 'image/png'}), body: {getReader: () => ({read: async () => ({done: false, value: new Uint8Array(4 * 1024 * 1024 + 1)}), cancel: () => new Promise(() => {}), releaseLock() {}})}}));
stuckCancel.register(); stuckCancel.renderer.update([0, 0], 1, 800, 600); await flush();
for (const expire of [...stuckCancel.timers.values()]) expire();
await flush(); await flush(); assert.equal(stuckCancel.root.dataset.mapTilesState, 'error'); assert.equal(stuckCancel.timers.size, 0); stuckCancel.signal.abort();
console.log('Map tiles: pinned layout, seam rounding, over/underzoom, bounded coverage/cache/concurrency, registry validation, repeated-world reuse, empty view, failures, provider generations, unregister and unmount passed');
