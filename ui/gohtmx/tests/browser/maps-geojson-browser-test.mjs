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
  const errors = [], requests = []; page.on('pageerror', error => errors.push(error.message)); page.on('request', request => requests.push(request.url()));
  await page.goto(base);
  await page.waitForFunction(() => document.querySelector('#svg-map').dataset.mapReady === 'true');
  // Clone the actual Go-rendered component, then replace it as an htmx swap does.
  await page.evaluate(() => { globalThis.mapFixture = document.querySelector('#raster-map').cloneNode(true); globalThis.mapFixture.removeAttribute('data-map-tile-provider'); });
  const replace = async (text, raster = false) => page.evaluate(({text, raster}) => {
    const previous = document.querySelector('#geo-test'); const node = globalThis.mapFixture.cloneNode(true); node.id = 'geo-test'; delete node.dataset.mapReady; if (raster) node.dataset.mapTileProvider = 'natural-earth';
    node.querySelectorAll('[id]').forEach(item => { item.id = item.id.replace('raster-map', 'geo-test'); });
    node.querySelectorAll('[aria-labelledby]').forEach(item => item.setAttribute('aria-labelledby', item.getAttribute('aria-labelledby').replace('raster-map', 'geo-test')));
    node.querySelectorAll('[data-map-generated]').forEach(item => item.remove());
    node.querySelector('template[data-map-geojson]')?.remove();
    const template = document.createElement('template'); template.dataset.mapGeojson = ''; template.content.append(document.createTextNode(text)); node.append(template);
    if (previous) previous.replaceWith(node); else document.querySelector('main').prepend(node);
  }, {text, raster});
  const settled = async (state='true') => page.waitForFunction(state => document.querySelector('#geo-test')?.dataset.mapReady === state, state);
  const map = page.locator('#geo-test'), overlay = map.locator('[data-map-geojson-layer]');
  await replace('{"type":"Point","coordinates":[0,0,123]}'); await settled();
  assert.equal(await overlay.locator('circle').count(), 5);
  const radius = await overlay.locator('circle').first().getAttribute('r');
  await map.locator('[data-map-zoom="in"]').click(); assert.equal(Number(await overlay.locator('circle').first().getAttribute('r')),Number(radius)/2);
  await map.locator('[data-map-zoom="reset"]').click(); assert.equal(await overlay.locator('circle').first().getAttribute('r'),radius);
  const nested = {type:'GeometryCollection',geometries:[{type:'MultiPoint',coordinates:[[0,0],[5,5]]},{type:'GeometryCollection',geometries:[{type:'LineString',coordinates:[[-10,0],[10,0]]},{type:'Polygon',coordinates:[[[-20,-20],[20,-20],[20,20],[-20,20],[-20,-20]],[[-5,-5],[-5,5],[5,5],[5,-5],[-5,-5]]]}]}]};
  await replace(JSON.stringify(nested)); await settled(); assert.equal(await overlay.locator('circle').count(),10); assert.equal(await overlay.locator('path').count(),10);
  assert.ok(await overlay.locator('[data-map-geojson-feature="Polygon"]').evaluateAll(nodes => nodes.every(node => node.getAttribute('fill-rule')==='evenodd' && node.getAttribute('d').split(' Z').length===3)));
  assert.equal(await overlay.locator('path').evaluateAll(nodes => nodes.every(node => !/NaN|undefined/.test(node.getAttribute('d')))),true);
  // All seven geometry variants render through the same production component.
  for (const shape of [{type:'MultiLineString',coordinates:[[[0,0],[10,10]]]},{type:'MultiPolygon',coordinates:[[[[0,0],[10,0],[10,10],[0,0]]]]}]) {
    await replace(JSON.stringify(shape));await settled();assert.equal(await overlay.locator('path').count(),5);
  }
  await replace('{"type":"FeatureCollection","features":[{"type":"Feature","geometry":{"type":"Point","coordinates":[0,0]}},{"type":"Feature","geometry":{"type":"Polygon","coordinates":[[[0,0],[1,0],[1,1],[0,1]]]}}]}'); await settled('error');
  assert.equal(await overlay.locator('*').count(),0);assert.equal(await map.locator('[data-map-status]').isVisible(),true);assert.match(await map.locator('[data-map-status]').textContent(),/does not close/);
  await replace(' '.repeat(1048577)); await settled('error'); assert.match(await map.locator('[data-map-status]').textContent(),/1 MiB/); assert.equal(await overlay.locator('*').count(),0);
  await replace('{"type":"Feature","id":9007199254740993,"geometry":{"type":"Point","coordinates":[0,0]}}');await settled();assert.equal(await map.locator('[data-map-status]').isVisible(),false);assert.equal(await overlay.locator('circle').count(),5);
  // Inline validation and tile loading have independent status and lifetimes.
  await replace(JSON.stringify(nested), true); await settled();
  await page.waitForFunction(() => document.querySelector('#geo-test').dataset.mapTilesState === 'ready');
  assert.equal(await overlay.locator('circle').count(),10); assert.ok(await map.locator('[data-map-tile] img').count()>0);
  assert.ok(await map.locator('[data-map-routes] path').count()>0);
  await replace('{"type":"Point","coordinates":[200,0]}', true); await settled('error');
  await page.waitForFunction(() => document.querySelector('#geo-test').dataset.mapTilesState === 'ready');
  assert.equal(await overlay.locator('*').count(),0); assert.ok(await map.locator('[data-map-tile] img').count()>0);
  assert.equal(await map.locator('[data-map-tile-status]').isVisible(),false); assert.equal(await map.locator('[data-map-status]').isVisible(),true);
  const pending=[]; await page.route('**/assets/ely/world-land.json', route => pending.push(route));
  await replace('{"type":"Point","coordinates":[0,0]}');
  for(let i=0;i<100&&!pending.length;i++) await delay(20);assert.ok(pending.length);
  await map.evaluate(node=>{globalThis.cancelledGeoMap=node;node.remove();});await delay(20);
  const land = await readFile(new URL('../../assets/ely/world-land.json',import.meta.url));
  for(const route of pending) {try{await route.fulfill({status:200,contentType:'application/json',body:land});}catch{}}
  await delay(30);assert.equal(await page.evaluate(()=>globalThis.cancelledGeoMap.querySelectorAll('[data-map-geojson-layer] *').length),0);
  await page.unroute('**/assets/ely/world-land.json');await page.evaluate(()=>document.querySelector('main').prepend(globalThis.cancelledGeoMap));await settled();assert.equal(await overlay.locator('circle').count(),5);
  await map.locator('[data-map-point]').first().click();assert.equal(await map.locator('[data-map-popup]').isVisible(),true);await map.locator('[data-map-close]').click();assert.equal(await map.locator('[data-map-popup]').isVisible(),false);
  assert.ok(requests.every(url=>new URL(url).origin===base));assert.deepEqual(errors,[]);
  await replace(JSON.stringify(nested));await settled();await mkdir(new URL('../../../../test-results/gallery/',import.meta.url),{recursive:true});await map.screenshot({path:new URL('../../../../test-results/gallery/map-geojson.png',import.meta.url).pathname});
  console.log('GeoJSON browser: actual component shapes, recursive collections, holes, zoom, atomic errors/budgets, recovery, pending cancellation/remount, popup dismissal and no remote requests passed');
} finally { await browser?.close(); try { process.kill(-child.pid, 'SIGTERM'); } catch {} }
