import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {loadSearchableInputs, searchableSHA as sha} from './searchable-menu-confirmation-inputs.mjs';
import {searchableCases, searchableSurfaces, searchableOracles, searchableErrors} from './searchable-menu-confirmation-evidence.mjs';

// CI-only genuine browser baseline. Production sources remain unchanged.
// Desired failures keep exit 1; neither this runner nor its wrapper blesses red.
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const surface = process.env.SEARCHABLE_MENU_SURFACE || 'qualified';
const group = process.env.SEARCHABLE_MENU_GROUP || 'all';
const report = {
  suite: 'searchable-menu-confirmation', surface, group, runToken: process.env.SEARCHABLE_MENU_RUN_TOKEN || null,
  status: 'running', stage: 'startup', actualMainBaseline: '49a792722ed4704d1b6fc06d7d2ee768ffe318aa',
  sourcePins: {menu: '49ed1f84056fa13347d68801b479a4a5a8e03b53', compatibilityAudit: 'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721'},
  scope: 'SearchableMenu query-input confirmation only; no alias, schema, hover, query reconciliation or whole-contract parity claim.',
  inputLabels: {keyboard: 'trusted Playwright keyboard.down/up/type; actual capture flags and targets retained', swap: 'public bundled htmx.ajax with real HTTP, no synthetic lifecycle events'},
  checks: [], requests: [], httpAssetProof: [], browserResponses: [], ...Object.fromEntries(searchableErrors.map(key => [key, []])),
};
let browser, server, page, current, inputs;
const responses = [];
const output = join(base, 'test-results/contracts');
const root = (slot = 'primary') => page.locator(`[data-fixture-slot="${slot}"] [data-ely-family]`).first();
const field = (slot = 'primary') => root(slot).locator('[data-interaction-search-menu] input');
const settle = () => page.evaluate(() => new Promise(resolve => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 0)));
const clear = () => page.evaluate(() => { for (const key of ['actions', 'hosts', 'inputs', 'changes']) searchLog[key] = []; searchPhase = null; });
const snapshot = (slot = 'primary') => page.evaluate(slot => ({state: searchState(searchRoot(slot)), peer: searchState(searchRoot('peer')), log: structuredClone(searchLog)}), slot);

export function observeSearchableBrowser() {
  window.searchLog = {actions: [], hosts: [], inputs: [], changes: [], errors: [], lifecycle: []};
  window.searchPhase = null;
  window.searchRoot = slot => document.querySelector(`[data-fixture-slot="${slot}"] [data-ely-family]`);
  window.searchSlot = node => node?.closest?.('[data-fixture-slot]')?.dataset.fixtureSlot || null;
  window.searchState = node => {
    const panel = node.querySelector('[role="menu"]'), input = node.querySelector('[data-interaction-filter]'), trigger = node.querySelector('[data-interaction-menu]');
    return {id: node.id, hidden: panel.hidden, expanded: trigger.getAttribute('aria-expanded'), focusedFilter: document.activeElement === input, query: input.value, ready: node.dataset.elyReady || null,
      rows: [...node.querySelectorAll('[data-interaction-menu-action]')].map(row => ({value: row.value, hidden: Boolean(row.closest('[hidden]')), disabled: row.disabled}))};
  };
  const seen = new WeakSet(), observed = new WeakSet();
  const error = event => {
    if (seen.has(event)) return; seen.add(event);
    const fault = event.detail?.error || event.reason;
    searchLog.errors.push({type: event.type, message: event.message || fault?.message || String(fault), stack: fault?.stack || null, id: event.target?.id || null, connected: Boolean(event.target?.isConnected)});
  };
  for (const type of ['error', 'unhandledrejection']) window.addEventListener(type, error);
  for (const type of ['ely:error', 'htmx:error']) document.addEventListener(type, error);
  window.searchObserveRoot = node => { if (!observed.has(node)) { observed.add(node); node.addEventListener('ely:error', error); } };
  for (const type of ['keydown', 'keyup', 'input']) document.addEventListener(type, event => {
    if (type !== 'input') searchPhase = type;
    searchLog.inputs.push({type, key: event.key || null, code: event.code || null, isTrusted: event.isTrusted, constructor: event.constructor.name,
      ctrlKey: Boolean(event.ctrlKey), altKey: Boolean(event.altKey), metaKey: Boolean(event.metaKey), shiftKey: Boolean(event.shiftKey),
      slot: searchSlot(event.target), targetID: event.target.id || null, targetTag: event.target.tagName, filter: event.target.matches?.('[data-interaction-filter]') || false,
      value: event.target.value ?? null, activeID: document.activeElement?.id || null, connected: event.target.isConnected});
  }, true);
  document.addEventListener('ely:action', event => searchLog.actions.push({slot: searchSlot(event.target), value: event.detail.value, action: event.detail.action, closed: event.target.querySelector('[role="menu"]').hidden, phase: searchPhase}));
  document.addEventListener('ely:change', event => searchLog.changes.push({slot: searchSlot(event.target), name: event.detail.name, value: event.detail.value}));
  for (const type of ['htmx:before:swap', 'htmx:after:swap', 'htmx:finally:swap']) document.addEventListener(type, event => searchLog.lifecycle.push({type, tasks: (event.detail?.tasks || []).map(task => ({sameTarget: task.target === window.searchSwapTarget, targetID: task.target?.id || null, style: task.swapSpec?.style || task.swapSpec}))}));
}
async function ready(origin) {
  // A fresh document per case isolates early dismissal from later trials.
  await page.goto(origin + '/');
  await page.waitForFunction(() => document.querySelectorAll('[data-ely-family]').length === 4 && [...document.querySelectorAll('[data-ely-family]')].every(node => node.dataset.elyReady === 'true'));
  await page.evaluate(() => document.fonts.ready);
  current.raw.ready = await page.evaluate(() => ({readiness: [...document.querySelectorAll('[data-ely-family]')].map(node => node.dataset.elyReady), screens: document.querySelectorAll('[data-sdui-screen]').length,
    uniqueAndEscaped: new Set([...document.querySelectorAll('[id]')].map(node => node.id)).size === document.querySelectorAll('[id]').length && document.querySelectorAll('safe').length === 0,
    queries: [...document.querySelectorAll('[data-interaction-filter]')].map(node => node.value), actions: structuredClone(searchLog.actions), hosts: structuredClone(searchLog.hosts), errors: structuredClone(searchLog.errors)}));
  await page.evaluate(async () => {
    const {mount} = await import('/assets/ely-api.js');
    window.searchBind = (node, generation = 'original') => {
      searchObserveRoot(node);
      mount(node, {onAction(detail, owner) {
        searchLog.hosts.push({slot: searchSlot(owner), value: detail.value, action: detail.action, closed: owner.querySelector('[role="menu"]').hidden, phase: searchPhase, generation});
        return {ok: true};
      }});
    };
    document.querySelectorAll('[data-ely-family]').forEach(node => searchBind(node));
  });
}
async function prepare(slot = 'primary', query = 'Alpha') {
  await page.mouse.move(1, 1);
  await root(slot).locator('[data-interaction-menu]').first().click();
  await field(slot).focus();
  await clear();
  // Real editing events, including the seed deletion, distinguish raw query
  // changes from item-action payloads. No assigned value/synthetic input oracle.
  await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace');
  await page.keyboard.type(query); await settle();
  const queryTrace = await page.evaluate(() => structuredClone(searchLog));
  await clear();
  return {queryTrace, before: await snapshot(slot)};
}
async function gesture(slot = 'primary', key = 'Enter', modifier = '') {
  if (modifier) await page.keyboard.down(modifier);
  await page.keyboard.down(key); const down = await snapshot(slot);
  await page.keyboard.up(key);
  if (modifier) await page.keyboard.up(modifier);
  await settle(); return {down, after: await snapshot(slot)};
}
async function runCase(name) {
  const slot = name === 'filter.empty' ? 'empty' : name === 'filter.all-disabled' ? 'alloff' : 'primary';
  const query = name === 'filter.no-results' ? 'zzzzzz' : name === 'filter.target' ? 'Alpha two' : 'Alpha';
  Object.assign(current.raw, await prepare(slot, query));
  if (name === 'text.space') {
    await page.keyboard.down('Space'); current.raw.down = await snapshot(slot);
    await page.keyboard.up('Space'); await page.keyboard.type('one'); await settle(); current.raw.after = await snapshot(slot);
  } else if (name.startsWith('swap.')) {
    const style = name.split('.')[1];
    await page.keyboard.down('Enter'); current.raw.down = await snapshot();
    await page.evaluate(async style => {
      window.searchOld = searchRoot('primary'); window.searchCleanups = 0;
      searchOld.addEventListener('ely:cleanup', () => { searchCleanups++; });
      const slot = document.querySelector('[data-fixture-slot="primary"]');
      window.searchSwapTarget = style === 'innerHTML' ? slot : slot.firstElementChild;
      await htmx.ajax('GET', '/fragment', {source: '#swap-source', target: searchSwapTarget, swap: style});
    }, style);
    await page.waitForFunction(() => searchRoot('primary') !== searchOld && searchRoot('primary')?.dataset.elyReady === 'true');
    await settle();
    await page.evaluate(() => searchBind(searchRoot('primary'), 'fresh'));
    current.raw.swap = await page.evaluate(() => ({lifecycle: structuredClone(searchLog.lifecycle), oldID: searchOld.id, freshID: searchRoot('primary').id, oldConnected: searchOld.isConnected, oldReady: searchOld.dataset.elyReady || null, cleanups: searchCleanups, sameOwner: searchRoot('primary') === searchOld, freshReady: searchRoot('primary').dataset.elyReady}));
    // The newly mounted filter receives the outstanding physical keyup. That
    // unarmed keyup must not dispatch through either old or replacement owner.
    await root().locator('[data-interaction-menu]').first().click(); await field().focus();
    await page.keyboard.up('Enter'); await settle(); current.raw.after = await snapshot();
    // Close explicitly so prepare can reopen via the ordinary trigger.
    await page.keyboard.press('Escape');
    current.raw.repeatSetup = await prepare(); current.raw.repeat = (await gesture()).after;
  } else {
    if (name === 'row.space') await root().locator('[value="alpha-one"]').focus();
    Object.assign(current.raw, await gesture(slot, name === 'row.space' ? 'Space' : 'Enter', name.startsWith('modifier.') ? name.split('.')[1] : ''));
    if (name === 'peer.independent' || name === 'confirm.reopen') {
      const target = name === 'peer.independent' ? 'peer' : 'primary';
      current.raw.repeatSetup = await prepare(target, 'Alpha two'); current.raw.repeat = (await gesture(target)).after;
    }
  }
}
try {
  assert.equal(process.env.CI, 'true', 'browser execution is restricted to CI');
  assert(searchableSurfaces.includes(surface)); assert(searchableCases(group)); assert(report.runToken, 'fresh wrapper invocation token required');
  inputs = await loadSearchableInputs(base, surface);
  const {assetBodies, fixtureBodies, ...metadata} = inputs; Object.assign(report, metadata);
  assert.equal(report.dirty, '', 'browser evidence requires a clean committed checkout');
  server = createServer((req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const entry = {check: current?.name || null, path, method: req.method, htmx: req.headers['hx-request'] || null}; report.requests.push(entry);
    try {
      const asset = assetBodies.get(path), body = asset?.body || fixtureBodies.get(path);
      if (!body) { entry.status = 404; res.writeHead(404).end(); return; }
      entry.status = 200; entry.responseSHA256 = sha(body);
      res.setHeader('content-type', asset?.contentType || 'text/html; charset=utf-8').end(body);
    } catch (error) { report.serverErrors.push(String(error)); res.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of [...Object.keys(report.assets), '/', '/fragment']) {
    const response = await fetch(origin + path), bytes = Buffer.from(await response.arrayBuffer());
    const expected = report.assets[path] || report.fixtures[path];
    const proof = {path, status: response.status, bytes: bytes.length, expectedSHA256: expected.servedSHA256, receivedSHA256: sha(bytes)};
    report.httpAssetProof.push(proof); assert.equal(proof.status, 200); assert.equal(proof.receivedSHA256, proof.expectedSHA256);
  }
  browser = await chromium.launch({headless: true}); report.browserVersion = browser.version();
  page = await browser.newPage({viewport: {width: 1440, height: 1000}}); page.setDefaultTimeout(10000);
  await page.addInitScript(observeSearchableBrowser);
  page.on('response', response => {
    const check = current?.name, url = new URL(response.url());
    responses.push((async () => {
      try {
        assert.equal(url.origin, origin, 'no remote browser assets');
        const path = url.pathname, wanted = report.assets[path] || report.fixtures[path]; assert(wanted, 'unexpected browser response');
        const bytes = await response.body();
        const proof = {check, path, status: response.status(), expectedSHA256: wanted.servedSHA256, receivedSHA256: sha(bytes), bytes: bytes.length};
        report.browserResponses.push(proof);
        if (proof.status !== 200 || proof.expectedSHA256 !== proof.receivedSHA256 || proof.bytes !== wanted.bytes) report.transportErrors.push(proof);
      } catch (error) { report.transportErrors.push({check, message: String(error)}); }
    })());
  });
  page.on('pageerror', error => report.pageErrors.push({check: current?.name, message: error.message}));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({check: current?.name, message: message.text()}); });
  page.on('requestfailed', request => report.requestFailures.push({check: current?.name, url: request.url(), error: request.failure()?.errorText}));
  report.stage = 'checks';
  for (const name of searchableCases(group)) {
    current = {name, raw: {}, oracles: [], status: 'running'}; report.checks.push(current);
    try { await ready(origin); await runCase(name); current.oracles = searchableOracles(current, surface); }
    catch (error) { current.error = {message: error.message, stack: error.stack}; }
    finally {
      try { const log = await page.evaluate(() => structuredClone(searchLog)); current.finalTrace = log; report.runtimeErrors.push(...log.errors.map(error => ({check: name, ...error}))); }
      catch (error) { current.captureError = String(error); }
      current.status = !current.error && !current.captureError && current.oracles.every(oracle => oracle.pass) ? 'passed' : 'failed';
      console.log(`${surface}/${name}: ${current.status}`);
      for (const oracle of current.oracles.filter(oracle => !oracle.pass)) console.error(`${oracle.id}: observed=${JSON.stringify(oracle.observed)} expected=${JSON.stringify(oracle.expected)}`);
      await Promise.all(responses);
    }
  }
  report.status = report.checks.every(check => check.status === 'passed') && searchableErrors.every(key => report[key].length === 0) ? 'passed' : 'failed';
} catch (error) { report.status = 'failed'; report.error = {message: error.message, stack: error.stack}; }
finally {
  await Promise.all(responses);
  await mkdir(join(output, 'searchable-menu-fixtures'), {recursive: true});
  for (const body of inputs?.fixtureBodies.values() || []) await writeFile(join(output, 'searchable-menu-fixtures/' + sha(body) + '.html'), body);
  await writeFile(join(output, `searchable-menu-confirmation-${surface}-${group}.json`), JSON.stringify(report, null, 2));
  await browser?.close(); if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (report.status !== 'passed') process.exitCode = 1;
}
