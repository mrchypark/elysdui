import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const reservation = createServer(); await new Promise(resolve => reservation.listen(0, '127.0.0.1', resolve));
const port = reservation.address().port; await new Promise(resolve => reservation.close(resolve));
const base = `http://127.0.0.1:${port}`;
const child = spawn('go', ['run', './examples/gohtmx/map-tiles', '-addr', `127.0.0.1:${port}`], {cwd: repo, detached: true, stdio: ['ignore', 'pipe', 'pipe']});
let output = '', browser; child.stdout.on('data', data => output += data); child.stderr.on('data', data => output += data);
try {
  let ready = false;
  for (let i = 0; i < 600; i++) { try { if ((await fetch(base)).ok) { ready = true; break; } } catch {} if (child.exitCode !== null) throw new Error(output); await delay(100); }
  assert.ok(ready, `Example did not start: ${output}`);
  browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  const page = await browser.newPage({viewport: {width: 1000, height: 900}, deviceScaleFactor: 1});
  const requests = [], errors = []; page.on('request', request => requests.push(request.url())); page.on('pageerror', error => errors.push(error.message));
  await page.goto(base); const map = page.locator('#raster-map');
  const settled = async (state = 'ready') => page.waitForFunction(state => document.querySelector('#raster-map').dataset.mapTilesState === state, state);
  const viewport = async (latitude, longitude, zoom) => page.evaluate(value => document.querySelector('#raster-map').dispatchEvent(new CustomEvent('ely:map-viewport', {detail: value})), {latitude, longitude, zoom});
  await settled(); await page.waitForFunction(() => document.querySelector('#svg-map').dataset.mapReady === 'true' && [...document.querySelectorAll('#raster-map [data-map-tile] img')].every(image => image.complete && image.naturalWidth > 0));
  assert.equal(await map.locator('[data-map-tile]').count(), 8);
  assert.equal(requests.filter(url => /\/tiles\/1\/\d\/\d\.png$/.test(url)).length, 4, 'Repeated world placements share one fetched tile');
  assert.ok(requests.every(url => new URL(url).origin === base), 'Bundled example must make no external request');
  assert.equal(await map.locator('[data-map-attribution]').textContent(), 'Land: Natural Earth (public domain)');
  const placement = await map.locator('[data-map-tile-column="-1"]').first().evaluate(node => ({tile: node.dataset.mapTile, x: node.style.left, y: node.style.top, w: node.style.width, h: node.style.height}));
  assert.deepEqual(placement, {tile: '1/1/0', x: '-112px', y: '44px', w: '256px', h: '256px'});
  assert.ok(await map.locator('[data-map-tile] img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth === 256)));
  assert.ok(await page.locator('#svg-map [data-map-land] path').count() > 0);
  assert.equal(await page.locator('#svg-map [data-map-tiles]').isVisible(), false);
  await map.locator('[data-map-point]').first().click(); assert.equal(await map.locator('[data-map-popup]').isVisible(), true);
  await map.locator('[data-map-close]').click(); assert.equal(await map.locator('[data-map-popup]').isVisible(), false);
  assert.equal(await map.locator('[data-map-point]').first().evaluate(node => node === document.activeElement), true);
  assert.ok(await map.locator('[data-map-routes] path').count() > 0);
  await viewport(12.3, 45.6, 2.37); await settled();
  const seams = await map.locator('[data-map-tile]').evaluateAll(nodes => nodes.map(node => ({column: +node.dataset.mapTileColumn, row: +node.dataset.mapTile.split('/')[2], x: parseFloat(node.style.left), y: parseFloat(node.style.top), w: parseFloat(node.style.width), h: parseFloat(node.style.height)})));
  for (const tile of seams) { const east = seams.find(next => next.column === tile.column + 1 && next.row === tile.row), south = seams.find(next => next.column === tile.column && next.row === tile.row + 1); if (east) assert.equal(tile.x + tile.w, east.x); if (south) assert.equal(tile.y + tile.h, south.y); }
  await viewport(0, 179.9, 5); await settled(); assert.ok(await map.locator('[data-map-tile]').evaluateAll(nodes => nodes.every(node => node.dataset.mapTile.startsWith('3/') && node.style.width === '1024px')));
  await page.evaluate(() => { globalThis.disposeTiles = ElyMap.registerTileProvider('natural-earth', {revision: 'underzoom', minZoom: 2, maxZoom: 3, attribution: '<b>Host text</b>', urlTemplate: '/assets/ely/tiles/{z}/{x}/{y}.png'}); });
  await viewport(0, 0, 1); await settled(); assert.ok(await map.locator('[data-map-tile]').evaluateAll(nodes => nodes.every(node => node.dataset.mapTile.startsWith('2/') && node.style.width === '128px')));
  assert.equal(await map.locator('[data-map-attribution]').textContent(), '<b>Host text</b>'); assert.equal(await map.locator('[data-map-attribution] b').count(), 0);
  await map.evaluate(node => { node.style.display = 'none'; }); await page.waitForFunction(() => document.querySelectorAll('#raster-map [data-map-tile]').length === 0);
  const beforeHidden = requests.filter(url => url.includes('/tiles/')).length; await delay(50); assert.equal(requests.filter(url => url.includes('/tiles/')).length, beforeHidden);
  await map.evaluate(node => { node.style.display = ''; }); await page.waitForFunction(() => document.querySelectorAll('#raster-map [data-map-tile]').length > 0); await settled();
  await page.evaluate(() => globalThis.disposeTiles()); await settled('unknown-provider'); assert.equal(await map.locator('[data-map-tile]').count(), 0); assert.equal(await map.locator('[data-map-tile-status]').isVisible(), true);
  const pending = []; await page.route('**/delayed/**', route => { pending.push(route); });
  await page.evaluate(() => { globalThis.disposeTiles = ElyMap.registerTileProvider('natural-earth', {revision: 'delayed', minZoom: 0, maxZoom: 3, attribution: 'Delayed test', urlTemplate: '/delayed/{z}/{x}/{y}.png'}); });
  await page.waitForFunction(() => document.querySelector('#raster-map').dataset.mapTilesState === 'pending');
  for (let i = 0; i < 100 && !pending.length; i++) await delay(20); assert.ok(pending.length > 0);
  await map.evaluate(node => { globalThis.detachedMap = node; node.remove(); }); await delay(50);
  const tile = await readFile(new URL('../../assets/ely/tiles/0/0/0.png', import.meta.url));
  for (const route of pending) { try { await route.fulfill({status: 200, contentType: 'image/png', body: tile}); } catch {} }
  await page.evaluate(() => { globalThis.disposeTiles(); ElyMap.registerTileProvider('natural-earth', {revision: 'remount', minZoom: 0, maxZoom: 3, attribution: 'Remounted', urlTemplate: '/assets/ely/tiles/{z}/{x}/{y}.png'}); document.querySelector('main').prepend(globalThis.detachedMap); });
  await settled(); await page.waitForFunction(() => [...document.querySelectorAll('#raster-map [data-map-tile] img')].every(image => image.complete && image.naturalWidth > 0)); assert.equal(await map.locator('[data-map-attribution]').textContent(), 'Remounted'); assert.equal(await map.locator('[data-map-tile] img').evaluateAll(images => images.every(image => image.complete && image.naturalWidth > 0)), true);
  await page.route('**/broken/**', route => route.fulfill({status: 404, body: ''}));
  await page.evaluate(() => ElyMap.registerTileProvider('natural-earth', {revision: 'broken', minZoom: 0, maxZoom: 3, attribution: 'Broken test', urlTemplate: '/broken/{z}/{x}/{y}.png'})); await settled('error');
  assert.ok(await map.locator('[data-map-tile-state="error"]').count() > 0); assert.equal(await map.locator('[data-map-tile-status]').isVisible(), true);
  await page.evaluate(() => ElyMap.registerTileProvider('natural-earth', {revision: 'budget', minZoom: 19, maxZoom: 19, attribution: 'Budget test', urlTemplate: '/budget/{z}/{x}/{y}.png'})); await viewport(0, 0, 0); await settled('coverage-limit'); assert.equal(requests.filter(url => url.includes('/budget/')).length, 0);
  await page.evaluate(() => ElyMap.registerTileProvider('natural-earth', {revision: 'screenshot', minZoom: 0, maxZoom: 3, attribution: 'Land: Natural Earth (public domain)', urlTemplate: '/assets/ely/tiles/{z}/{x}/{y}.png'})); await viewport(0, 0, 1); await settled(); await page.waitForFunction(() => [...document.querySelectorAll('#raster-map [data-map-tile] img')].every(image => image.complete && image.naturalWidth > 0));
  await mkdir(new URL('../../../../test-results/gallery/', import.meta.url), {recursive: true}); await map.screenshot({path: new URL('../../../../test-results/gallery/map-tiles.png', import.meta.url).pathname});
  assert.deepEqual(errors, []);
  console.log('Map tiles browser: bundled raster decode, wrapped dedupe, SVG fallback, marker/popup/route layering, fractional seams, over/underzoom, hidden viewport, unregister, interrupted requests/remount, errors and coverage budget passed');
} finally { await browser?.close(); try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
