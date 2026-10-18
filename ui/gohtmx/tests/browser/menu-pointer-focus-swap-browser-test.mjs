import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {loadContextOwnerAssets} from './context-owner-assets.mjs';

// Supplemental real-browser regression, separate from the immutable 31-case
// baseline. A caller focus listener invokes the bundled public HTMX swap API;
// no lifecycle event, runtime handler, production row, or expected error is faked.
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const surface = process.env.MENU_POINTER_SURFACE;
assert(['qualified', 'chapter', 'sdui'].includes(surface), 'one explicit renderer is required');
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {suite: 'menu-pointer-focus-swap', surface, status: 'running', checks: [], requests: [], assets: {}, fixtureSources: {}, fixtures: {}, httpAssetProof: [], browserResponses: [], transportErrors: [], serverErrors: [], pageErrors: [], consoleErrors: [], requestFailures: [], runtimeErrors: [], sourcePins: {menu: '49ed1f84056fa13347d68801b479a4a5a8e03b53', compatibilityAudit: 'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721'}, scope: 'Synchronous bundled htmx.swap during pointer-induced leaf focus, root innerHTML safe control and focused-row outerHTML regression; no arbitrary DOM reconciliation claim.'};
let browser, server, page, temp, current;
const responses = [];
const record = (id, observed, expected, prerequisite = false) => {
  let pass = true; try { assert.deepEqual(observed, expected); } catch { pass = false; }
  current.oracles.push({id, observed, expected, pass, prerequisite});
  if (!pass && prerequisite) { const error = new Error(`Prerequisite ${id}: ${JSON.stringify(observed)} != ${JSON.stringify(expected)}`); error.prerequisite = id; throw error; }
};
const expect = (id, observed, expected) => record(id, observed, expected);
const must = (id, observed, expected) => record(id, observed, expected, true);
const root = () => page.locator('[data-fixture-slot="primary"] [data-ely-family]').first();
const panel = () => root().locator('[role="menu"]').first();
const row = value => root().locator(`[value="${value}"]`).first();
const active = target => target.evaluate(node => document.activeElement === node);
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
try {
  report.revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: base, encoding: 'utf8'}).trim();
  report.tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: base, encoding: 'utf8'}).trim();
  report.dirty = execFileSync('git', ['status', '--porcelain'], {cwd: base, encoding: 'utf8'}).trim();
  report.workingTreePatchSHA256 = sha(execFileSync('git', ['diff', '--binary', 'HEAD'], {cwd: base}));
  report.toolchain = {node: process.version, playwright: JSON.parse(await readFile(join(base, 'node_modules/playwright/package.json'), 'utf8')).version, go: execFileSync(process.env.GO || 'go', ['version'], {encoding: 'utf8'}).trim()};
  const fixturePath = surface === 'sdui' ? './adapters/gohtmx/tests/fixtures/menu-pointer-selection' : './ui/gohtmx/tests/fixtures/menu-pointer-selection';
  for (const path of ['ui/gohtmx/tests/browser/menu-pointer-focus-swap-browser-test.mjs', 'ui/gohtmx/tests/browser/menu-pointer-selection-browser-test.mjs', 'ui/gohtmx/tests/browser/context-owner-assets.mjs', fixturePath + '/main.go', 'ui/gohtmx/tests/fixtures/pointerfixture/fixture.go', 'ui/gohtmx/tests/fixtures/pointerfixture/verify.go', 'ui/gohtmx/templates/ely-api-interaction.html', 'ui/gohtmx/component.go', 'ui/gohtmx/menu.go', 'adapters/gohtmx/catalogue_manifest.json.gz', 'adapters/gohtmx/render.go']) report.fixtureSources[path] = sha(await readFile(join(base, path)));
  temp = await mkdtemp(join(tmpdir(), 'ely-pointer-focus-swap-'));
  const binary = join(temp, 'fixture');
  execFileSync(process.env.GO || 'go', ['build', '-o', binary, fixturePath], {cwd: base, stdio: 'pipe'});
  const args = ['-id=primary', '-alias=Menu', ...(surface === 'sdui' ? [] : ['-mode=' + surface])];
  const bodies = new Map([['/', execFileSync(binary, ['-full', ...args], {cwd: base})], ['/fragment', execFileSync(binary, args, {cwd: base})]]);
  for (const [path, body] of bodies) report.fixtures[path] = {html: `menu-pointer-fixtures/${sha(body)}.html`, sourceSHA256: sha(body), servedSHA256: sha(body), bytes: body.length, command: [binary, ...(path === '/' ? ['-full'] : []), ...args]};
  const assets = await loadContextOwnerAssets(base);
  const icon = await readFile(join(base, 'ui/gohtmx/assets/ely/icons/circle.svg'));
  assets.set('/assets/ely/icons/circle.svg', {body: icon, contentType: 'image/svg+xml', sourceSHA256: sha(icon), servedSHA256: sha(icon), bytes: icon.length, referencedBy: new Set(['production fixture icon'])});
  for (const [path, {body, referencedBy, ...metadata}] of assets) report.assets[path] = {...metadata, referencedBy: [...referencedBy]};
  assert(Object.values(report.assets).every(asset => asset.sourceSHA256 === asset.servedSHA256), 'supplement must serve unmodified production bytes');
  server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const entry = {path, method: request.method, htmx: request.headers['hx-request'] || null}; report.requests.push(entry);
    try {
      const asset = assets.get(path), body = bodies.get(path) || asset?.body;
      if (!body) { entry.status = 404; return response.writeHead(404).end(); }
      entry.status = 200; entry.responseSHA256 = sha(body);
      response.setHeader('content-type', bodies.has(path) ? 'text/html; charset=utf-8' : asset.contentType).end(body);
    } catch (error) { report.serverErrors.push(String(error)); response.writeHead(500).end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [path, asset] of assets) {
    const response = await fetch(origin + path), received = Buffer.from(await response.arrayBuffer());
    const proof = {path, status: response.status, expectedSHA256: asset.servedSHA256, receivedSHA256: sha(received)};
    report.httpAssetProof.push(proof); assert.equal(proof.status, 200); assert.equal(proof.receivedSHA256, proof.expectedSHA256);
  }
  browser = await chromium.launch({headless: true}); report.browserVersion = browser.version();
  page = await browser.newPage({viewport: {width: 1440, height: 1100}}); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.pageErrors.push({check: current?.name, message: error.message, stack: error.stack}));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({check: current?.name, message: message.text()}); });
  page.on('requestfailed', request => report.requestFailures.push({check: current?.name, url: request.url(), error: request.failure()?.errorText}));
  page.on('response', response => {
    const check = current?.name, path = new URL(response.url()).pathname;
    responses.push((async () => {
      try {
        const received = await response.body(), expected = report.assets[path]?.servedSHA256 || report.fixtures[path]?.servedSHA256;
        const proof = {check, path, status: response.status(), expectedSHA256: expected, receivedSHA256: sha(received)};
        report.browserResponses.push(proof);
        if (!expected || proof.status !== 200 || proof.receivedSHA256 !== expected) report.transportErrors.push(proof);
      } catch (error) { report.transportErrors.push({check, path, error: String(error)}); }
    })());
  });
  await page.addInitScript(() => {
    window.focusSwapInputs = []; window.focusSwapTrace = []; window.focusSwapActions = []; window.focusSwapRuntimeErrors = [];
    document.addEventListener('ely:error', event => focusSwapRuntimeErrors.push({id: event.detail?.id, action: event.detail?.action, message: event.detail?.error?.message, stack: event.detail?.error?.stack}));
    document.addEventListener('pointermove', event => focusSwapInputs.push({type: event.type, isTrusted: event.isTrusted, value: event.target.closest?.('button')?.value, slot: event.target.closest?.('[data-fixture-slot]')?.dataset.fixtureSlot, label: event.target.hasAttribute?.('data-interaction-menu-label'), x: event.clientX, y: event.clientY}), true);
  });
  for (const kind of ['root-innerHTML', 'row-outerHTML']) {
    current = {name: kind, status: 'running', oracles: []}; report.checks.push(current);
    const errorStart = report.pageErrors.length;
    try {
      await page.goto(origin + '/');
      await page.waitForFunction(() => document.querySelectorAll('[data-ely-family]').length === 8 && [...document.querySelectorAll('[data-ely-family]')].every(node => node.dataset.elyReady === 'true'));
      await page.evaluate(() => document.fonts.ready); await Promise.all(responses);
      must('fixture.exact-browser-runtime', report.browserResponses.some(proof => proof.check === kind && proof.path === '/assets/ely-api-interaction.js' && proof.receivedSHA256 === report.assets['/assets/ely-api-interaction.js'].sourceSHA256), true);
      must('fixture.clean-transport', report.transportErrors, []);
      await page.evaluate(async () => {
        const response = await fetch('/fragment'); if (!response.ok) throw new Error('Production fragment prefetch failed');
        window.focusSwapHTML = await response.text();
        window.focusSwapOwner = document.querySelector('[data-fixture-slot="primary"] [data-ely-family]');
        const {mount} = await import('/assets/ely-api.js');
        mount(focusSwapOwner, {onAction(detail, node) { focusSwapActions.push({value: detail.value, closed: node.querySelector('[role="menu"]').hidden}); }});
      });
      await Promise.all(responses);
      must('fixture.prefetched-exact-production-fragment', report.browserResponses.some(proof => proof.check === kind && proof.path === '/fragment' && proof.status === 200 && proof.receivedSHA256 === report.fixtures['/fragment'].sourceSHA256), true);
      await page.mouse.move(2, 2); await root().locator('[data-interaction-menu]').first().focus(); await page.keyboard.press('ArrowDown');
      await row('branch').focus(); await page.keyboard.press('ArrowRight');
      must('setup.valid-open-child-selection', await row('child-first').evaluate(node => document.activeElement === node && !node.closest('[hidden]')), true);
      await page.evaluate(kind => {
        const owner = focusSwapOwner, leaf = owner.querySelector('[value="plain"]'), oldRow = leaf.closest('.ely-interaction__menu-row'), oldPanel = owner.querySelector('[role="menu"]'), oldChild = owner.querySelector('#' + CSS.escape(owner.querySelector('[value="branch"]').getAttribute('aria-controls')));
        window.focusSwapOld = {leaf, row: oldRow, panel: oldPanel, child: oldChild};
        window.focusSwapCleanups = 0; window.focusSwapInFocus = false;
        const target = kind === 'root-innerHTML' ? owner : oldRow, style = kind === 'root-innerHTML' ? 'innerHTML' : 'outerHTML';
        window.focusSwapContext = {sourceElement: document.getElementById('swap-source'), target, text: focusSwapHTML, select: kind === 'root-innerHTML' ? '[data-ely-family] > *' : '.ely-interaction__menu-row:has(> [value="plain"])', swap: style + ' settle:0'};
        owner.addEventListener('ely:cleanup', () => focusSwapCleanups++);
        for (const type of ['htmx:before:swap', 'htmx:after:swap', 'htmx:finally:swap']) document.addEventListener(type, event => {
          if (event.detail.ctx !== focusSwapContext) return;
          focusSwapTrace.push({phase: type, inFocus: focusSwapInFocus, ownerSame: document.querySelector('[data-fixture-slot="primary"] [data-ely-family]') === owner, ownerID: owner.id, contextTargetSame: event.detail.ctx.target === target, ready: owner.dataset.elyReady || null, tasks: (event.detail.tasks || []).map(task => ({sameTarget: task.target === target, targetOwner: task.target.closest('[data-ely-family]') === owner, targetID: task.target.id || null, targetRowValue: task.target.matches('.ely-interaction__menu-row') ? task.target.querySelector(':scope > button')?.value : null, style: task.swapSpec.style})), oldChildHidden: oldChild.hidden});
        });
        leaf.addEventListener('focus', event => {
          focusSwapInFocus = true;
          focusSwapTrace.push({phase: 'leaf-focus', active: document.activeElement === leaf, rowConnected: oldRow.isConnected, isTrusted: event.isTrusted});
          window.focusSwapPromise = htmx.swap(focusSwapContext);
          focusSwapTrace.push({phase: 'focus-return', oldRowConnected: oldRow.isConnected, oldRowHasParent: Boolean(oldRow.parentElement), ownerSame: document.querySelector('[data-fixture-slot="primary"] [data-ely-family]') === owner});
          focusSwapInFocus = false;
        }, {once: true});
        focusSwapInputs.length = 0;
      }, kind);
      const box = await row('plain').locator('[data-interaction-menu-label]').boundingBox();
      must('input.label-has-box', Boolean(box && box.width > 0 && box.height > 0), true);
      const point = {x: box.x + box.width / 2, y: box.y + box.height / 2};
      await page.mouse.move(point.x, point.y); await settle();
      const input = await page.evaluate(() => focusSwapInputs.at(-1));
      current.pointerTrial = {requested: point, observed: input};
      must('input.trusted-movement-to-intended-label', Boolean(input?.isTrusted && input.value === 'plain' && input.slot === 'primary' && input.label && Math.abs(input.x - point.x) < 1 && Math.abs(input.y - point.y) < 1), true);
      must('focus.pointer-induced-focus-started-real-swap', await page.evaluate(() => Boolean(focusSwapPromise) && focusSwapTrace.some(event => event.phase === 'leaf-focus' && event.active && event.rowConnected && event.isTrusted)), true);
      await page.evaluate(() => focusSwapPromise); await page.waitForFunction(() => focusSwapOwner.dataset.elyReady === 'true');
      const trace = await page.evaluate(() => focusSwapTrace); current.trace = trace;
      const ownerID = await root().getAttribute('id');
      expect('swap.before-target-and-synchronous-disposal', trace.filter(event => event.phase === 'htmx:before:swap'), [{phase: 'htmx:before:swap', inFocus: true, ownerSame: true, ownerID, contextTargetSame: true, ready: null, tasks: [{sameTarget: true, targetOwner: true, targetID: kind === 'root-innerHTML' ? ownerID : null, targetRowValue: kind === 'root-innerHTML' ? null : 'plain', style: kind === 'root-innerHTML' ? 'innerHTML' : 'outerHTML'}], oldChildHidden: true}]);
      expect('swap.mutated-before-focus-return', trace.filter(event => event.phase === 'focus-return'), [{phase: 'focus-return', oldRowConnected: false, oldRowHasParent: kind === 'root-innerHTML', ownerSame: true}]);
      expect('swap.after-and-finally-target-owner', trace.filter(event => ['htmx:after:swap', 'htmx:finally:swap'].includes(event.phase)).map(({phase, inFocus, ownerSame, ownerID, contextTargetSame, ready}) => ({phase, inFocus, ownerSame, ownerID, contextTargetSame, ready})), ['htmx:after:swap', 'htmx:finally:swap'].map(phase => ({phase, inFocus: false, ownerSame: true, ownerID, contextTargetSame: true, ready: 'true'})));
      expect('swap.cleanup-once', await page.evaluate(() => focusSwapCleanups), 1);
      expect('swap.old-child-remains-closed', await page.evaluate(() => focusSwapOld.child.hidden), true);
      expect('swap.fresh-row-replaces-old-identity', await row('plain').evaluate(node => node !== focusSwapOld.leaf && node.isConnected), true);
      expect('swap.no-family-runtime-error', await page.evaluate(() => focusSwapRuntimeErrors), []);
      expect('swap.pointer-continuation-has-no-runtime-error', report.pageErrors.slice(errorStart), []);
      expect('swap.no-spurious-host-action', await page.evaluate(() => focusSwapActions), []);
      await page.mouse.move(2, 2); await root().locator('[data-interaction-menu]').first().focus(); await page.keyboard.press('ArrowDown');
      must('fresh.first-row-focus', await active(row('first')), true);
      const freshBox = await row('plain').locator('[data-interaction-menu-label]').boundingBox();
      await page.mouse.move(freshBox.x + freshBox.width / 2, freshBox.y + freshBox.height / 2); await settle();
      expect('fresh.pointer-selects-new-leaf', await active(row('plain')), true);
      await page.keyboard.down('Enter'); expect('fresh.keydown-emits-nothing', await page.evaluate(() => focusSwapActions), []);
      await page.keyboard.up('Enter'); await settle();
      expect('fresh.keyup-callback-once-after-dismissal', await page.evaluate(() => focusSwapActions), [{value: 'plain', closed: true}]);
    } catch (error) { current.error = {message: error.message, stack: error.stack, prerequisite: error.prerequisite || null}; }
    try { current.runtimeErrors = await page.evaluate(() => focusSwapRuntimeErrors); report.runtimeErrors.push(...current.runtimeErrors.map(error => ({check: kind, ...error}))); }
    catch (error) { current.traceError = String(error); }
    current.status = current.error || current.traceError || current.runtimeErrors?.length || current.oracles.some(oracle => !oracle.pass) ? 'failed' : 'passed';
    console.log(`${surface}/${kind}: ${current.status}`);
    for (const failure of current.oracles.filter(oracle => !oracle.pass)) console.error(`${failure.id}: observed=${JSON.stringify(failure.observed)} expected=${JSON.stringify(failure.expected)}`);
  }
  await Promise.all(responses);
  const incidental = ['transportErrors', 'serverErrors', 'pageErrors', 'consoleErrors', 'requestFailures', 'runtimeErrors'].some(key => report[key].length);
  report.status = !incidental && report.checks.length === 2 && report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  for (const [path, body] of bodies) { const file = join(base, 'test-results/contracts', report.fixtures[path].html); await mkdir(join(base, 'test-results/contracts/menu-pointer-fixtures'), {recursive: true}); await writeFile(file, body); }
} catch (error) { report.status = 'failed'; report.startupError = {message: error.message, stack: error.stack}; }
finally {
  await Promise.all(responses);
  const directory = join(base, 'test-results/contracts'); await mkdir(directory, {recursive: true});
  await writeFile(join(directory, `menu-pointer-focus-swap-${surface}.json`), JSON.stringify(report, null, 2));
  await browser?.close(); if (server) await new Promise(resolve => server.close(resolve)); if (temp) await rm(temp, {recursive: true, force: true});
}
if (report.status !== 'passed') process.exitCode = 1;
