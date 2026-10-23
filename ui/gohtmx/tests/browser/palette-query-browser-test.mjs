import assert from 'node:assert/strict';
import {paletteProductionPolicy} from './palette-query-production-policy.mjs';
const productionPolicy = paletteProductionPolicy(process.env.PALETTE_QUERY_PRODUCTION_POLICY || 'strict');
import {mkdir, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {loadPaletteInputs, paletteSHA as sha} from './palette-query-inputs.mjs';
import {paletteCases, paletteSurfaces, paletteErrors, paletteOracles, paletteDiagnostics, paletteSourcePins, paletteBaseline, paletteReportName} from './palette-query-evidence.mjs';

// Real browser execution is CI-only. This file is not an expected-red wrapper:
// every unmet desired contract keeps exit 1 and all later cases still execute.
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const surface = process.env.PALETTE_QUERY_SURFACE || 'go-qualified';
const group = process.env.PALETTE_QUERY_GROUP || 'all';
const report = {suite: 'palette-query', surface, group, caseInventory: paletteCases(group), runToken: process.env.PALETTE_QUERY_RUN_TOKEN || null,
  status: 'running', stage: 'startup', actualMainBaseline: paletteBaseline, sourcePins: paletteSourcePins,
  scope: 'CommandPalette only. Relationships are future repair prerequisites; close-order and empty-submit are separate gaps. No alias, scroll/long-list, IME, native-platform or AT verification.',
  checks: [], requests: [], httpAssetProof: [], browserResponses: [], ...Object.fromEntries(paletteErrors.map(key => [key, []]))};
let page, browser, server, current, inputs;
const responses = [];
const output = join(base, 'test-results/contracts');
const root = (slot = 'primary') => page.locator(`#palette-${slot} [data-ely-family]`).first();
const settle = () => page.evaluate(() => new Promise(resolve => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 20)));
const snap = () => page.evaluate(() => paletteSnapshot());
const clear = () => page.evaluate(() => paletteClear());
async function open() { await page.mouse.move(1, 1); await root().locator('[data-interaction-dialog]').click(); await settle(); }
async function keyboardEdit(text) { await page.keyboard.press('Control+A'); await page.keyboard.press('Backspace'); await page.keyboard.type(text); await settle(); }
async function ready(origin) {
  await page.goto(origin + '/');
  await page.waitForFunction(() => document.querySelectorAll('[data-ely-family]').length === 2 && [...document.querySelectorAll('[data-ely-family]')].every(root => root.dataset.elyReady === 'true'));
  await page.evaluate(async () => { await document.fonts.ready; await paletteBind(paletteRoot()); await paletteBind(paletteRoot('peer')); });
  current.raw.ready = await snap();
  await open(); current.raw.opened = await snap(); await clear();
}
async function prepare(query) { await page.keyboard.type(query); await settle(); current.raw.before = await snap(); await clear(); }
async function enter() {
  await page.keyboard.down('Enter'); const down = await snap();
  await page.keyboard.up('Enter'); await settle();
  if (surface === 'sdui') await page.waitForFunction(() => paletteLog.bridge.length >= paletteLog.actions.filter(e => ['open-command', 'option-command', 'other-command', 'disabled-command', 'zebra-command'].includes(e.action)).length);
  return {down, after: await snap()};
}
async function runCase(name) {
  if (['query.continue', 'cursor.coherence', 'enter.preserve', 'escape.preserve', 'active.relationship'].includes(name)) {
    await prepare('op'); await page.keyboard.press('ArrowDown'); current.raw.arrow = await snap();
    if (name === 'query.continue' || name === 'cursor.coherence') { await page.keyboard.type(name === 'query.continue' ? 'en' : 'o'); await settle(); current.raw.after = await snap(); }
    if (name === 'enter.preserve') {
      await clear(); Object.assign(current.raw, await enter());
      await open(); current.raw.reopened = await snap(); await clear(); await keyboardEdit('open'); current.raw.repeatSetup = await snap(); await clear(); current.raw.repeat = await enter();
    }
    if (name === 'escape.preserve') {
      await clear(); await page.keyboard.press('Escape'); await settle(); current.raw.after = await snap();
      await open(); current.raw.reopened = await snap(); await clear(); await keyboardEdit('open'); current.raw.repeatSetup = await snap();
      await page.keyboard.press('Tab'); current.raw.tab = await snap(); await page.keyboard.press('Shift+Tab'); current.raw.shiftTab = await snap();
      await root().locator('[data-interaction-close]').click(); await settle(); current.raw.repeat = {after: await snap()};
    }
    if (name === 'active.relationship') {
      current.raw.filtered = await snap();
      // Separate explicit edit, never a rescue inside QUERY.CONTINUE.
      await page.keyboard.press('Escape'); await open(); await keyboardEdit('open'); current.raw.refined = await snap();
      await keyboardEdit('zzzzzz'); current.raw.after = await snap();
    }
  } else if (name === 'text.space') {
    await prepare('Other'); await page.keyboard.down('Space'); current.raw.down = await snap(); await page.keyboard.up('Space'); await page.keyboard.type('place'); await settle(); current.raw.after = await snap();
  } else if (name === 'action.close-order' || name === 'empty.submit') {
    await prepare(name === 'empty.submit' ? 'zzzzzz' : 'open'); Object.assign(current.raw, await enter());
  } else if (name === 'owner.replacement') {
    await prepare('open'); Object.assign(current.raw, await enter());
    await page.evaluate(() => { window.paletteOld = paletteRoot(); window.paletteOldField = paletteOld.querySelector('input'); window.paletteCleanups = 0; paletteOld.addEventListener('ely:cleanup', () => paletteCleanups++); });
    await clear(); await page.locator('#palette-swap').click();
    await page.waitForFunction(() => paletteRoot() !== paletteOld && paletteRoot()?.dataset.elyReady === 'true');
    await page.evaluate(() => paletteBind(paletteRoot(), 'fresh')); await settle();
    current.raw.swap = await page.evaluate(() => ({oldID: paletteOld.id, freshID: paletteRoot().id, sameOwner: paletteOld === paletteRoot(), oldConnected: paletteOld.isConnected, oldReady: paletteOld.dataset.elyReady || null, freshReady: paletteRoot().dataset.elyReady, cleanups: paletteCleanups, lifecycle: structuredClone(paletteLog.lifecycle)}));
    current.raw.replaced = await snap();
    // Synthetic detached-node safety probe, explicitly excluded from trusted
    // fresh keyboard evidence. Old event handlers must not reach either host.
    current.raw.staleProbe = await page.evaluate(() => {
      paletteOldField.value = 'stale-detached'; const input = new Event('input', {bubbles: true}), change = new Event('change', {bubbles: true});
      const inputDispatched = paletteOldField.dispatchEvent(input), changeDispatched = paletteOldField.dispatchEvent(change);
      return {ownerID: paletteOld.id, connected: paletteOldField.isConnected, value: paletteOldField.value, inputTrusted: input.isTrusted, changeTrusted: change.isTrusted, inputDispatched, changeDispatched};
    });
    current.raw.stale = await snap();
    await open(); current.raw.reopened = await snap(); await clear(); await page.keyboard.type('open'); await settle(); current.raw.repeatSetup = await snap(); await clear(); current.raw.repeat = await enter();
  } else throw new Error('Unknown case: ' + name);
}
try {
  assert.equal(process.env.CI, 'true', 'browser execution is restricted to CI');
  assert(paletteSurfaces.includes(surface)); assert(report.runToken, 'fresh wrapper token required');
  inputs = await loadPaletteInputs(base, surface, {productionPolicy});
  const {assetBodies, fixtureBodies, ...metadata} = inputs; Object.assign(report, metadata);
  assert.equal(report.dirty, '', 'browser evidence requires a clean committed checkout');
  server = createServer(async (req, res) => {
    const path = new URL(req.url, 'http://localhost').pathname;
    const entry = {check: current?.name || null, path, method: req.method, htmx: req.headers['hx-request'] || null}; report.requests.push(entry);
    try {
      let body = assetBodies.get(path)?.body || fixtureBodies.get(path), contentType = assetBodies.get(path)?.contentType || 'text/html; charset=utf-8';
      if (path === '/sdui-action' && req.method === 'POST') {
        const chunks = []; for await (const chunk of req) chunks.push(chunk);
        const raw = Buffer.concat(chunks);
        const parsed = await new Response(raw, {headers: {'content-type': req.headers['content-type']}}).formData();
        entry.fields = [...parsed].map(([key, value]) => [key, String(value)]);
        const target = parsed.get('_target');
        assert(['palette-primary-result', 'palette-peer-result'].includes(target), 'fixed same-screen SDUI target');
        body = fixtureBodies.get(target === 'palette-primary-result' ? '/sdui-response-primary' : '/sdui-response-peer');
        entry.responseFixture = target === 'palette-primary-result' ? '/sdui-response-primary' : '/sdui-response-peer';
      }
      if (!body) { entry.status = 404; res.writeHead(404).end(); return; }
      entry.status = 200; entry.responseSHA256 = sha(body); entry.responseBytes = body.length;
      res.setHeader('content-type', contentType).end(body);
    } catch (error) { report.serverErrors.push(String(error)); entry.status = 500; res.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const path of [...Object.keys(report.assets), ...Object.keys(report.fixtures)]) {
    const response = await fetch(origin + path), bytes = Buffer.from(await response.arrayBuffer()), expected = report.assets[path] || report.fixtures[path];
    const proof = {path, status: response.status, bytes: bytes.length, expectedSHA256: expected.servedSHA256, receivedSHA256: sha(bytes)};
    report.httpAssetProof.push(proof); assert.equal(proof.status, 200); assert.equal(proof.receivedSHA256, proof.expectedSHA256);
  }
  browser = await chromium.launch({headless: true}); report.browserVersion = browser.version();
  page = await browser.newPage({viewport: {width: 1280, height: 900}}); page.setDefaultTimeout(10000);
  page.on('response', response => {
    const check = current?.name, responseURL = response.url(), requestMethod = response.request().method(), responseStatus = response.status(), responsePath = new URL(responseURL).pathname;
    responses.push((async () => {
      try {
        assert.equal(new URL(responseURL).origin, origin, 'no remote browser assets');
        const path = responsePath, responseFixture = path === '/sdui-action' ? '/sdui-response-primary' : path;
        const wanted = report.assets[path] || report.fixtures[responseFixture]; assert(wanted, 'unexpected browser response');
        const bytes = await response.body();
        const proof = {check, path, ...(path === '/sdui-action' ? {responseFixture} : {}), status: response.status(), expectedSHA256: wanted.servedSHA256, receivedSHA256: sha(bytes), bytes: bytes.length};
        report.browserResponses.push(proof);
        if (proof.status !== 200 || proof.expectedSHA256 !== proof.receivedSHA256 || proof.bytes !== wanted.bytes) report.transportErrors.push(proof);
      } catch (error) { report.transportErrors.push({check, responseURL, path: responsePath, method: requestMethod, status: responseStatus, message: String(error)}); }
    })());
  });
  page.on('pageerror', error => report.pageErrors.push({check: current?.name, message: error.message}));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({check: current?.name, message: message.text()}); });
  page.on('requestfailed', request => report.requestFailures.push({check: current?.name, url: request.url(), error: request.failure()?.errorText}));
  report.stage = 'checks';
  for (const name of report.caseInventory) {
    current = {name, raw: {}, status: 'running'}; report.checks.push(current);
    try { await ready(origin); await runCase(name); current.oracles = paletteOracles(current, surface); current.diagnostics = paletteDiagnostics(current); }
    catch (error) { current.error = {message: error.message, stack: error.stack}; }
    finally {
      try { current.finalTrace = await page.evaluate(() => structuredClone(paletteLog)); report.runtimeErrors.push(...current.finalTrace.errors.map(error => ({check: name, ...error}))); }
      catch (error) { current.captureError = String(error); }
      current.status = !current.error && !current.captureError && current.oracles.every(oracle => oracle.pass) ? 'passed' : 'failed';
      console.log(`${surface}/${name}: ${current.status}`);
      for (const oracle of current.oracles?.filter(oracle => !oracle.pass) || []) console.error(`${oracle.id}: observed=${JSON.stringify(oracle.observed)} expected=${JSON.stringify(oracle.expected)}`);
      await Promise.all(responses);
    }
  }
  report.status = report.checks.every(check => check.status === 'passed') && paletteErrors.every(key => !report[key].length) ? 'passed' : 'failed';
} catch (error) { report.status = 'failed'; report.error = {message: error.message, stack: error.stack}; }
finally {
  await Promise.all(responses); await mkdir(join(output, 'palette-query-fixtures'), {recursive: true});
  for (const body of inputs?.fixtureBodies.values() || []) await writeFile(join(output, 'palette-query-fixtures/' + sha(body) + '.html'), body);
  await writeFile(join(output, paletteReportName(surface, group)), JSON.stringify(report, null, 2));
  await browser?.close(); if (server?.listening) await new Promise(resolve => server.close(resolve));
  if (report.status !== 'passed') process.exitCode = 1;
}
