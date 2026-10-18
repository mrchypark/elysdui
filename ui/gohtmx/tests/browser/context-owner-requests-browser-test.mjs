import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {contextOwnerControls} from './context-owner-controls.mjs';
import {loadContextOwnerAssets} from './context-owner-assets.mjs';

// This suite must run in authorized CI. Owner requests are intentionally
// synthetic CustomEvents; native Playwright mouse/keyboard input is separately
// labelled. Components, fragments, assets and HTMX come from production paths.
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const mutation = process.env.CONTEXT_OWNER_NEGATIVE_CONTROL || '';
const selected = process.env.CONTEXT_OWNER_SURFACE || 'both';
const surfaces = selected === 'both' ? ['standalone', 'catalogue'] : [selected];
const sha = value => createHash('sha256').update(value).digest('hex');
const file = '/assets/ely-api-interaction.js';
const fixturePaths = {
 standalone: './ui/gohtmx/tests/fixtures/context-owner-requests',
 catalogue: './adapters/gohtmx/tests/fixtures/context-owner-requests',
};
const cases = [
 'C1.automatic-and-seed', 'C2.number-precision-and-point', 'C3.equality-watermark',
 'C4.manual-owner-only-input', 'C5.validation-and-clamp', 'C6.disabled-and-empty',
 'C7.focus-and-callback-order', 'C8.root-ownership', 'C9.retained-innerHTML',
 'C10.replacement-and-reinsertion', 'C11.pending-cancelled-oob',
 'C12.mode-and-owner-identity', 'C13.native-menu-regressions',
 'C14.right-host-tab-away', 'C15.nested-ordinary-menu', 'C16.seed-focus-reentrant-swap',
];
const report = {
 suite: 'context-owner-requests', mutation, surfaces, status: 'running', stage: 'startup',
 sourcePins: {menu: '49ed1f84056fa13347d68801b479a4a5a8e03b53', compatibilityAudit: 'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721'},
 baseline: 'f1f785eebc9f163bc30c6077cf5e41865fe5ef64',
 inputLabels: {ownerRequest: 'synthetic root-local CustomEvent', pointer: 'trusted Playwright mouse', keyboard: 'trusted Playwright keyboard', boundary: 'explicit synthetic MouseEvent/KeyboardEvent constructors'},
 checks: [], oracles: [], fixtures: {}, assets: {}, requests: [], swaps: [], observations: [],
 pageErrors: [], startupErrors: [], runtimeErrors: [], serverErrors: [], consoleErrors: [], requestFailures: [],
};
let browser, server, page, temp, activeCheck, currentSurface, activeOracles = [];
const oracle = (id, actual, expected) => {
 try { assert.deepEqual(actual, expected, id); }
 catch (error) { error.contractOracle = id; error.observed = actual; error.expectedValue = expected; throw error; }
 activeOracles.push(id); report.oracles.push({surface: currentSurface, check: activeCheck, id});
};
const cleanRuntime = async () => {
 const errors = await page.evaluate(() => ownerLog.errors);
 report.runtimeErrors.push(...errors.map(error => ({surface: currentSurface, check: activeCheck, ...error})));
 oracle('fixture.no-unexpected-runtime-errors', errors.filter(error => !error.expected), []);
 oracle('fixture.no-page-errors', report.pageErrors, []);
 oracle('fixture.no-server-errors', report.serverErrors, []);
 oracle('fixture.no-console-errors', report.consoleErrors, []);
 oracle('fixture.no-request-failures', report.requestFailures, []);
};
try {
 assert(surfaces.every(surface => Object.hasOwn(fixturePaths, surface)), 'unknown renderer surface');
 assert(!mutation || Object.hasOwn(contextOwnerControls, mutation), 'unknown owner-request control');
 assert(!mutation || selected !== 'both', 'each control requires explicit CONTEXT_OWNER_SURFACE so both renderers are independently verified');
 const control = contextOwnerControls[mutation];
 report.revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: base, encoding: 'utf8'}).trim();
 report.tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: base, encoding: 'utf8'}).trim();
 report.dirty = execFileSync('git', ['status', '--porcelain'], {cwd: base, encoding: 'utf8'}).trim();
 report.harnessSHA256 = sha(await readFile(new URL(import.meta.url)));
 report.controlSourceSHA256 = sha(await readFile(new URL('./context-owner-controls.mjs', import.meta.url)));
 report.workingTreePatchSHA256 = sha(execFileSync('git', ['diff', '--binary', 'HEAD'], {cwd: base}));
 report.fixtureSources = {};
 for (const path of [...Object.values(fixturePaths).map(path => path + '/main.go'), './ui/gohtmx/tests/fixtures/contextfixture/fixture.go', './ui/gohtmx/templates/ely-api-interaction.html', './ui/gohtmx/menu.go', './ui/gohtmx/tests/fixtures/contextfixture/verify.go', './ui/gohtmx/ui.go', './ui/gohtmx/component.go', './adapters/gohtmx/catalogue_manifest.json.gz', './adapters/gohtmx/formats.go', './adapters/gohtmx/render.go']) {
  report.fixtureSources[path] = sha(await readFile(join(base, path)));
 }
 const deps = execFileSync(process.env.GO || 'go', ['list', '-deps', fixturePaths.standalone], {cwd: base, encoding: 'utf8'}).trim().split('\n');
 assert(!deps.some(dep => /github\.com\/mrchypark\/elysdui\/(sdui|adapters)(\/|$)/.test(dep)), 'standalone fixture must have no SDUI/adapter dependency');
 report.standaloneDependencyProof = {command: ['go', 'list', '-deps', fixturePaths.standalone], SHA256: sha(deps.join('\n')), forbiddenImports: []};
 temp = await mkdtemp(join(tmpdir(), 'ely-context-owner-'));
 const binaries = {}, fixtureCache = new Map();
 for (const surface of surfaces) {
  binaries[surface] = join(temp, surface);
  execFileSync(process.env.GO || 'go', ['build', '-o', binaries[surface], fixturePaths[surface]], {cwd: base, stdio: 'pipe'});
 }
 const generate = (surface, url) => {
  const full = url.pathname === '/';
  const args = full ? ['-full'] : ['-id=' + (url.searchParams.get('id') || 'manual'), '-mode=' + (url.searchParams.get('mode') || 'manual'), '-number=' + (url.searchParams.get('number') || ''), '-x=' + (url.searchParams.get('x') || '120.5'), '-y=' + (url.searchParams.get('y') || '80.25')];
  const key = surface + ':' + args.join(' ');
  if (!fixtureCache.has(key)) {
   const body = execFileSync(binaries[surface], args, {cwd: base, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
   fixtureCache.set(key, body);
   report.fixtures[key] = {path: fixturePaths[surface], command: [binaries[surface], ...args], sourceSHA256: sha(body), servedSHA256: sha(body), bytes: Buffer.byteLength(body), productionRenderer: surface === 'standalone' ? 'ui.RenderComponent' : 'CatalogueRegistry + Decode + Compile + Plan.Render'};
  }
  return fixtureCache.get(key);
 };
 const assets = await loadContextOwnerAssets(base,control,mutation);
 report.assetLoaderSHA256=sha(await readFile(new URL('./context-owner-assets.mjs',import.meta.url)));
 for(const [path,asset] of assets) {
  const {body,referencedBy,...metadata}=asset;
  report.assets[path]={...metadata,referencedBy:[...referencedBy]};
 }
 if (control) {
  report.control = {...control, file, anchorCount: 1};
  assert.deepEqual(Object.entries(report.assets).filter(([, value]) => value.sourceSHA256 !== value.servedSHA256).map(([path]) => path), [file], 'one production asset and one anchor must change');
 }
 report.stage = 'server-start';
 server = createServer((req, res) => {
  try {
   const url = new URL(req.url, 'http://localhost'), surface = url.searchParams.get('surface') || surfaces[0];
   const received = {method: req.method, url: req.url, htmx: req.headers['hx-request'] || null, target: req.headers['hx-target'] || null};
   report.requests.push(received);
   const send = (body, contentType) => {received.responseSHA256=sha(body);received.responseBytes=Buffer.byteLength(body);received.status=200;res.setHeader('content-type',contentType).end(body);};
   if (url.pathname === '/' || url.pathname === '/fragment') {
    const body = generate(surface, url);
    return send(body, 'text/html; charset=utf-8');
   }
   if (url.pathname === '/oob') {
    const fragmentURL = new URL('/fragment?' + url.searchParams, url), body = generate(surface, fragmentURL);
    // The OOB envelope is host-owned. Its contents remain actual production
    // rendered HTML. OOB replaces the host slot and its owned component root.
    return send(`<p>OOB response</p><div id="fixture-slot-manual" data-fixture-slot="manual" hx-swap-oob="outerHTML">${body}</div>`, 'text/html; charset=utf-8');
   }
   if (!assets.has(url.pathname)) {received.status=404;return res.writeHead(404).end();}
   const asset=assets.get(url.pathname);
   send(asset.body,asset.contentType);
  } catch (error) { report.serverErrors.push(String(error)); res.writeHead(500).end(String(error)); }
 });
 await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
 report.stage = 'browser-launch';
 browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
 page = await browser.newPage({viewport: {width: 1440, height: 1100}});
 page.setDefaultTimeout(10000);
 page.on('pageerror', error => report.pageErrors.push({surface: currentSurface, check: activeCheck, message: error.message}));
 page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({surface: currentSurface, check: activeCheck, message: message.text()}); });
 page.on('requestfailed', request => report.requestFailures.push({url: request.url(), error: request.failure()?.errorText}));
 await page.addInitScript(() => {
  window.ownerLog = {errors: [], events: [], requests: [], inputs: [], hosts: [], lifecycle: []};
  window.expectedOwnerError = null;
  for (const type of ['error', 'unhandledrejection']) window.addEventListener(type, event => ownerLog.errors.push({type, message: event.message || String(event.reason), expected: false}));
  for (const type of ['ely:action', 'ely:change', 'ely:error', 'ely:result']) document.addEventListener(type, event => {
   const d = event.detail || {}, root = event.target, panel = root.querySelector?.('[role="menu"]');
   if (type === 'ely:error') {
    const expected=window.expectedOwnerError;
    const matches=Boolean(expected && event.target===expected.root && d.id===expected.id && d.action===expected.action && d.error?.message===expected.message);
    if(matches) window.expectedOwnerError=null; // Consume exactly one known error.
    ownerLog.errors.push({type,id:d.id,action:d.action,message:d.error?.message,expected:matches});
   }
   ownerLog.events.push({type, id: d.id, value: d.value, action: d.action, checked: d.checked, values: d.values, panelHidden: panel?.hidden, focus: document.activeElement?.id, checkedState: root.querySelector?.('[value="' + d.value + '"]')?.getAttribute('aria-checked')});
  });
  document.addEventListener('ely:context-request', event => ownerLog.requests.push({target: event.target.id, number: event.detail?.number, input: 'synthetic owner CustomEvent'}), true);
  for (const type of ['contextmenu', 'keydown', 'keyup', 'pointerdown', 'pointerup']) document.addEventListener(type, event => ownerLog.inputs.push({type, key: event.key, button: event.button, isTrusted: event.isTrusted, x: event.clientX, y: event.clientY, defaultPrevented: event.defaultPrevented, owner: event.target.closest?.('[data-ely-family]')?.id, contextSurface: event.target.matches?.('[data-interaction-context]')}), false);
  for (const type of ['htmx:before:swap', 'htmx:after:swap', 'htmx:finally:swap']) document.addEventListener(type, event => ownerLog.lifecycle.push({type, tasks: (event.detail?.tasks || []).map(task => ({target: typeof task.target === 'string' ? task.target : task.target?.id, swap: task.swapSpec?.style || task.swapSpec}))}));
 });
 const selector = slot => `[data-fixture-slot="${slot}"] [data-ely-family]`;
 const root = (slot = 'manual') => page.locator(selector(slot)).first();
 const panel = (slot = 'manual') => root(slot).locator('[role="menu"]').first();
 const surface = (slot = 'manual') => root(slot).locator('[data-interaction-context]').first();
 const trigger = (slot = 'manual') => root(slot).locator('[data-interaction-menu]').first();
 const row = (value, slot = 'manual') => root(slot).locator(`[value="${value}"]`).first();
 const hidden = target => target.evaluate(node => node.hidden);
 const focused = target => target.evaluate(node => node === document.activeElement);
 const state = (slot = 'manual') => root(slot).evaluate(node => {
  const p = node.querySelector('[role="menu"]'), rect = p.getBoundingClientRect();
  return {hidden: p.hidden, style: p.getAttribute('style'), focus: document.activeElement?.id || document.activeElement?.getAttribute('value'), expanded: [...node.querySelectorAll('[data-interaction-menu]')].map(n => n.getAttribute('aria-expanded')), rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height}};
 });
 const request = async (number, x = 120.5, y = 80.25, slot = 'manual') => root(slot).evaluate((node, detail) => node.dispatchEvent(new CustomEvent('ely:context-request', {detail})), {number, x, y});
 const dismiss = async () => { await page.locator('#before').focus(); };
 const clear = () => page.evaluate(() => { ownerLog.events = []; ownerLog.hosts = []; ownerLog.requests = []; });
 const geometry = async (x, y, slot = 'manual') => {
  const actual = await panel(slot).evaluate(node => { const b = node.getBoundingClientRect(); return {x:b.x,y:b.y,width:b.width,height:b.height,position:node.style.position,vw:innerWidth,vh:innerHeight}; });
  oracle('geometry.fixed', actual.position, 'fixed');
  assert(Math.abs(actual.x - Math.max(0, Math.min(x, actual.vw - actual.width))) < 0.6, `clamped x: ${JSON.stringify(actual)}`);
  assert(Math.abs(actual.y - Math.max(0, Math.min(y, actual.vh - actual.height))) < 0.6, `clamped y: ${JSON.stringify(actual)}`);
  report.observations.push({surface: currentSurface, check: activeCheck, requested: {x,y}, measured: actual});
 };
 const swap = async ({slot = 'manual', number = '', mode = 'manual', style, id = slot, x = 120.5, y = 80.25} = {}) => {
  const url = '/fragment?' + new URLSearchParams({surface: currentSurface, id, mode, number, x: String(x), y: String(y)});
  await root(slot).evaluate((node, args) => htmx.ajax('GET', args.url, {source: '#swap-source', target: node, select: args.style === 'outerHTML' ? '[data-ely-family]' : '[data-ely-family] > *', ...(args.style ? {swap: args.style} : {})}), {url, style});
  await page.waitForFunction(sel => document.querySelector(sel)?.dataset.elyReady === 'true', selector(slot));
 };
 const ready = async () => {
  await page.goto(`http://127.0.0.1:${server.address().port}/?surface=${currentSurface}`);
  await page.waitForFunction(() => [...document.querySelectorAll('[data-ely-family]')].length === 10 && [...document.querySelectorAll('[data-ely-family]')].every(node => ['true','error'].includes(node.dataset.elyReady)));
  await page.evaluate(()=>document.fonts.ready);
  oracle('fixture.production-fonts-settled',await page.evaluate(()=>document.fonts.status),'loaded');
  oracle('fixture.production-roots-ready', await page.locator('[data-ely-family]').evaluateAll(nodes => nodes.every(node => node.dataset.elyReady === 'true')), true);
  oracle('fixture.real-catalogue-screen-count', await page.locator('[data-sdui-screen]').count(), currentSurface === 'catalogue' ? 10 : 0);
  oracle('fixture.unique-ids', await page.locator('[id]').evaluateAll(nodes => {const ids=nodes.map(node=>node.id);return new Set(ids).size===ids.length;}), true);
  oracle('fixture.escaped-label', await page.locator('safe').count(), 0);
  await page.evaluate(async () => {
   const {mount} = await import('/assets/ely-api.js'); window.ownerMount = mount;
   window.ownerBind = node => mount(node, {onAction(detail, current) {
    const p = current.querySelector('[role="menu"]');
    ownerLog.hosts.push({id: current.id, value: detail.value, panelHidden: p.hidden, focus: document.activeElement?.id, checkedState: current.querySelector('[value="' + detail.value + '"]')?.getAttribute('aria-checked'), values: detail.values});
    if (window.rejectOwnerAction) return Promise.reject(new Error('expected owner fixture rejection'));
    return {ok: true};
   }});
   document.querySelectorAll('[data-ely-family]').forEach(ownerBind);
   document.getElementById('owner-open').addEventListener('click', () => document.querySelector('[data-fixture-slot="manual"] [data-ely-family]').dispatchEvent(new CustomEvent('ely:context-request', {detail:{number:'77',x:145.5,y:97.25}})));
  });
  report.startupErrors.push(...await page.evaluate(() => ownerLog.errors));
  await cleanRuntime();
 };
 const tests = {};
 tests[cases[0]] = async () => {
  oracle('C1.manual-no-request-closed', await hidden(panel()), true);
  oracle('C1.automatic-seed-inert', await hidden(panel('automatic-seed')), true);
  oracle('C1.manual-seed-open', await hidden(panel('seeded')), false);
  oracle('C1.seed-focus-first-enabled', await focused(row('open', 'seeded')), true);
  await geometry(120.5,80.25,'seeded');
  await dismiss();
  await surface('automatic').click({button:'right',position:{x:18,y:18}});
  oracle('C1.automatic-trusted-right-click', await hidden(panel('automatic')), false);
  await page.keyboard.press('Escape');
  for (const key of ['ContextMenu','Shift+F10']) {
   await surface('automatic').focus(); await page.keyboard.press(key);
   oracle('C1.automatic-native-context-key', await hidden(panel('automatic')), false);
   await page.keyboard.press('Escape');
  }
 };
 tests[cases[1]] = async () => {
  await dismiss(); await clear();
  await request('9007199254740992',120.5,80.25); await geometry(120.5,80.25);
  oracle('C2.first-request-focused', await focused(row('open')), true);
  await request('9007199254740993',220.5,130.25);
  oracle('C2.adjacent-u64-distinct-presentation', (await state()).rect.x, 220.5);
  await geometry(220.5,130.25);
  for (const number of ['18446744073709551615','0']) { await request(number,0,0); await geometry(0,0); }
  oracle('C2.request-strings-preserved', await page.evaluate(() => ownerLog.requests.map(item=>item.number)), ['9007199254740992','9007199254740993','18446744073709551615','0']);
  oracle('C2.open-emits-no-business-event', await page.evaluate(()=>ownerLog.events), []);
 };
 tests[cases[2]] = async () => {
  await dismiss(); await clear(); await request('11');
  await row('branch').focus(); await page.keyboard.press('ArrowRight');
  const before=await state();
  await request('11',400,300);
  oracle('C3.repeat-preserves-focus-position-descendants',await state(),before);
  await dismiss(); await request('11');
  oracle('C3.dismissed-repeat-stays-closed',await hidden(panel()),true);
  await root().evaluate(node=>node.dispatchEvent(new CustomEvent('ely:context-request',{detail:null})));
  await request('11'); oracle('C3.null-keeps-watermark',await hidden(panel()),true);
  await request('12',230,140); oracle('C3.changed-number-opens',await hidden(panel()),false);
  await request('11',260,170); await geometry(260,170);
  await dismiss();
  await root().evaluate(node=>{window.sameNumberReentries=0;node.querySelector('[value="open"]').addEventListener('focus',()=>{sameNumberReentries++;node.dispatchEvent(new CustomEvent('ely:context-request',{detail:{number:'13',x:800,y:600}}));},{once:true});});
  await request('13',290,190);await geometry(290,190);
  oracle('C3.same-number-focus-reentry-no-restart',await page.evaluate(()=>sameNumberReentries),1);
  oracle('C3.no-business-events',await page.evaluate(()=>ownerLog.events),[]);
 };
 tests[cases[3]] = async () => {
  await dismiss(); await clear();
  await surface().click({button:'right',position:{x:18,y:18}});
  oracle('C4.manual-right-click-stays-closed',await hidden(panel()),true);
  oracle('C4.native-context-default-not-prevented',await page.evaluate(()=>ownerLog.inputs.filter(item=>item.type==='contextmenu').at(-1)?.defaultPrevented),false);
  for(const key of ['ContextMenu','Shift+F10']) {
   await surface().focus(); await page.keyboard.press(key);
   oracle('C4.manual-context-key-stays-closed',await hidden(panel()),true);
   oracle('C4.manual-key-default-not-prevented',await page.evaluate(key=>ownerLog.inputs.filter(item=>item.type==='keydown' && item.key===key).at(-1)?.defaultPrevented,key==='Shift+F10'?'F10':key),false);
  }
  oracle('C4.fallback-hidden',await trigger().evaluate(node=>node.hidden),true);
  oracle('C4.fallback-not-tabbable',await trigger().getAttribute('tabindex'),'-1');
  await trigger().evaluate(node=>{node.click();node.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true,cancelable:true}));});
  oracle('C4.hidden-synthetic-fallback-inert',await hidden(panel()),true);
  // Constructor coordinates are recorded separately from native mouse input.
  const boundary=await surface().evaluate(node=>{const event=new MouseEvent('contextmenu',{bubbles:true,cancelable:true,clientX:31,clientY:47});node.dispatchEvent(event);return {x:event.clientX,y:event.clientY,prevented:event.defaultPrevented};});
  oracle('C4.synthetic-context-boundary',boundary,{x:31,y:47,prevented:false});
  await page.locator('#owner-open').focus(); await page.keyboard.press('Enter');
  oracle('C4.accessible-owner-button-opens',await hidden(panel()),false); await geometry(145.5,97.25);
  const before=await state();
  await surface().click({button:'right',position:{x:18,y:18}});
  oracle('C4.right-host-keeps-open-and-position', {hidden:await hidden(panel()),rect:(await state()).rect}, {hidden:false,rect:before.rect});
 };
 tests[cases[4]] = async () => {
  await dismiss();await clear();
  // NaN and infinities are created in the browser, never JSON-transported.
  for(const axis of ['x','y']) for(const kind of ['nan','positive-infinity','negative-infinity','numeric-string','boolean']) {
   const before=await state();
   await root().evaluate((node,{kind,axis})=>{const invalid={nan:NaN,'positive-infinity':Infinity,'negative-infinity':-Infinity,'numeric-string':'120',boolean:true}[kind];const detail={number:'501',x:120,y:80};detail[axis]=invalid;node.dispatchEvent(new CustomEvent('ely:context-request',{detail}));},{kind,axis});
   oracle('C5.invalid-coordinate-atomic-noop',await state(),before);
  }
  await request('501'); oracle('C5.invalid-coordinates-unconsumed',await hidden(panel()),false);await dismiss();
  const invalidNumbers=['','00','01','+1','-1',' 1','1 ','1.0','1e2','1\n','1\r','١','18446744073709551616','999999999999999999999',1,null];
  for(const number of invalidNumbers){const before=await state();await root().evaluate((node,number)=>node.dispatchEvent(new CustomEvent('ely:context-request',{detail:{number,x:120,y:80}})),number);oracle('C5.invalid-number-atomic-noop',await state(),before);}
  const shapes=[{},[],false,'', {number:'502',x:20}, {number:'502',x:20,y:30,extra:true}];
  for(const detail of shapes){const before=await state();await root().evaluate((node,detail)=>node.dispatchEvent(new CustomEvent('ely:context-request',{detail})),detail);oracle('C5.invalid-shape-atomic-noop',await state(),before);}
  await request('502');oracle('C5.invalid-shapes-unconsumed',await hidden(panel()),false);
  for(const [index,x,y] of [[0,-100,-50],[1,100000,100000],[2,Number.MAX_VALUE,Number.MAX_VALUE],[3,-Number.MAX_VALUE,-Number.MAX_VALUE],[4,0,0]]){await request(String(600+index),x,y);await geometry(x,y);}
  oracle('C5.validation-no-business-events',await page.evaluate(()=>ownerLog.events),[]);
 };
 tests[cases[5]] = async () => {
  await dismiss();await clear();
  await request('61',120,80,'disabled');
  oracle('C6.disabled-root-request-inert',await hidden(panel('disabled')),true);
  // Changing enabled props through a real replacement closes/remounts normally.
  // Trigger-only toggling below additionally tests unconsumed same-owner input.
  await swap({slot:'disabled',style:'outerHTML'});await request('61',120,80,'disabled');
  oracle('C6.enabled-reissue-opens',await hidden(panel('disabled')),false);await dismiss();
  await root().evaluate(node=>{node.dataset.elyDisabled='true';});await request('64');
  oracle('C6.same-owner-disabled-initially-closed',await hidden(panel()),true);
  await root().evaluate(node=>{delete node.dataset.elyDisabled;});await request('64');
  oracle('C6.disabled-number-unconsumed',await hidden(panel()),false);await dismiss();
  await trigger().evaluate(node=>{node.disabled=true;});await request('62');
  oracle('C6.disabled-trigger-request-inert',await hidden(panel()),true);
  await trigger().evaluate(node=>{node.disabled=false;});
  oracle('C6.enable-does-not-replay',await hidden(panel()),true);
  await request('62');oracle('C6.same-owner-disabled-number-unconsumed',await hidden(panel()),false);
  oracle('C6.disabled-first-row-skipped',await focused(row('open')),true);
  for(const slot of ['empty','alloff']){await dismiss();await request('63',120,80,slot);oracle('C6.empty-or-disabled-panel-focus',await focused(panel(slot)),true);}
 };
 tests[cases[6]] = async () => {
  await dismiss();await clear();await request('71');await request('72',240,120);await page.keyboard.press('Escape');
  oracle('C7.rerequest-preserves-original-focus-owner',await focused(page.locator('#before')),true);
  await request('73');await row('check').focus();await page.keyboard.press('Enter');
  let log=await page.evaluate(()=>({events:ownerLog.events,hosts:ownerLog.hosts}));
  oracle('C7.checkbox-closed-before-host',log.hosts.map(h=>[h.value,h.panelHidden,h.focus,h.checkedState]),[['check',true,'before','true']]);
  oracle('C7.change-before-action',log.events.filter(e=>['ely:change','ely:action'].includes(e.type)).map(e=>e.type),['ely:change','ely:action']);
  oracle('C7.form-values-preserved',log.hosts[0].values,[['scope','caller-value']]);
  await clear();await request('74');await row('radio-b').focus();await page.keyboard.press('Space');
  oracle('C7.radio-committed-once',await page.evaluate(()=>ownerLog.hosts.map(h=>[h.value,h.checkedState,h.panelHidden])),[['radio-b','true',true]]);
  oracle('C7.radio-peer-cleared',await row('radio-a').getAttribute('aria-checked'),'false');
  await root().evaluate(node=>{expectedOwnerError={root:node,id:node.id,action:'open-file',message:'expected owner fixture rejection'};window.rejectOwnerAction=true;});
  await request('75');await row('open').focus();await page.keyboard.press('Enter');
  await page.waitForFunction(()=>ownerLog.errors.some(error=>error.message==='expected owner fixture rejection'));
  const rejection=await page.evaluate(()=>{window.rejectOwnerAction=false;const consumed=expectedOwnerError===null;expectedOwnerError=null;return {consumed,expected:ownerLog.errors.filter(error=>error.expected).map(error=>({message:error.message,action:error.action,id:error.id}))};});
  oracle('C7.exact-rejection-once',rejection,{consumed:true,expected:[{message:'expected owner fixture rejection',action:'open-file',id:await root().getAttribute('id')}]});
  oracle('C7.rejection-stays-closed',await hidden(panel()),true);
  await page.evaluate(()=>{window.rejectOwnerAction=false;const button=document.createElement('button');button.id='temporary-opener';button.textContent='Temporary opener';document.body.append(button);button.focus();});
  await request('76');await page.locator('#temporary-opener').evaluate(node=>node.remove());await page.keyboard.press('Escape');
  oracle('C7.disconnected-owner-context-fallback',await focused(surface()),true);
 };
 tests[cases[7]] = async () => {
  await dismiss();await clear();await request('81');await dismiss();await request('81',220,120,'peer');
  oracle('C8.same-number-independent-owner',await hidden(panel('peer')),false);await dismiss();
  const before=await state();
  await root().evaluate(node=>node.querySelector('span').dispatchEvent(new CustomEvent('ely:context-request',{bubbles:true,detail:{number:'82',x:140,y:90}})));
  oracle('C8.descendant-event-cannot-open-parent',await state(),before);
  await page.evaluate(()=>document.dispatchEvent(new CustomEvent('ely:context-request',{detail:{number:'82',x:140,y:90}})));
  await root('wrong').evaluate(node=>node.dispatchEvent(new CustomEvent('ely:context-request',{bubbles:true,detail:{number:'82',x:140,y:90}})));
  oracle('C8.document-and-wrong-component-inert',await state(),before);
  await request('82');oracle('C8.rejected-target-number-unconsumed',await hidden(panel()),false);await dismiss();
  await page.evaluate(()=>{const nested=document.querySelector('[data-fixture-slot="nested"] [data-ely-family]');document.querySelector('[data-fixture-slot="manual"] [data-interaction-context]').append(nested);});
  // Use direct owner-root references after nesting rather than broad selectors.
  await root().evaluate(node=>{const child=node.querySelector('[data-ely-family]');window.nestedOwner=child;child.dispatchEvent(new CustomEvent('ely:context-request',{bubbles:true,detail:{number:'83',x:300,y:200}}));});
  oracle('C8.nested-request-parent-stays-closed',await hidden(panel()),true);
  oracle('C8.nested-request-opens-only-child',await page.evaluate(()=>!nestedOwner.querySelector('[role="menu"]').hidden),true);
  await request('83');oracle('C8.nested-number-does-not-consume-parent',await hidden(panel()),false);
  await dismiss();
  // Remove both actual production roots so prune disposes their controllers.
  // Compose the nested topology while detached, before normal startup binds
  // the next controllers. The child's visible automatic fallback must never
  // become the empty parent's initial focus candidate.
  await page.evaluate(()=>{window.emptyParent=document.querySelector('[data-fixture-slot="empty"] [data-ely-family]');window.nestedAutomatic=document.querySelector('[data-fixture-slot="automatic"] [data-ely-family]');emptyParent.remove();nestedAutomatic.remove();});
  await page.waitForFunction(()=>!emptyParent.dataset.elyReady&&!nestedAutomatic.dataset.elyReady);
  await page.evaluate(()=>{emptyParent.querySelector('[role="menu"]').append(nestedAutomatic);document.querySelector('[data-fixture-slot="empty"]').append(emptyParent);ownerBind(emptyParent);ownerBind(nestedAutomatic);});
  oracle('C8.nested-panel-topology-bound-after-composition',await page.evaluate(()=>emptyParent.dataset.elyReady==='true'&&nestedAutomatic.dataset.elyReady==='true'&&nestedAutomatic.parentElement===emptyParent.querySelector('[role="menu"]')),true);
  await request('84',120,80,'empty');
  oracle('C8.empty-parent-with-independent-root-opens',await hidden(panel('empty')),false);
  oracle('C8.empty-parent-panel-owns-focus',await focused(panel('empty')),true);
  oracle('C8.foreign-fallback-and-panel-untouched',await page.evaluate(()=>document.activeElement!==nestedAutomatic.querySelector('[data-interaction-menu]')&&nestedAutomatic.querySelector('[role="menu"]').hidden),true);
  report.observations.push({surface:currentSurface,check:activeCheck,note:'Nested focus can independently dismiss a previously open parent through ordinary focus-leave behavior; the routing check starts the parent closed. A second topology is composed before controller startup to test independent-root focus ownership inside an otherwise empty parent panel.'});
 };
 tests[cases[8]] = async () => {
  await dismiss();await clear();await request('91');await row('branch').focus();await page.keyboard.press('ArrowRight');
  await root().evaluate(node=>{window.retainedOwner=node;window.oldOwnerPanel=node.querySelector('[role="menu"]');window.oldOwnerPanels=[...node.querySelectorAll('[role="menu"]')];window.cleanupSnapshots=[];document.addEventListener('htmx:before:swap',()=>cleanupSnapshots.push({connected:retainedOwner.isConnected,hidden:oldOwnerPanels.every(panel=>panel.hidden)}),{once:true});});
  await swap({number:'91'});
  oracle('C9.exact-root-retained',await root().evaluate(node=>node===retainedOwner),true);
  oracle('C9.old-panels-closed-before-mutation',await page.evaluate(()=>cleanupSnapshots),[{connected:true,hidden:true}]);
  oracle('C9.retained-same-seed-stays-closed',await hidden(panel()),true);
  oracle('C9.old-panels-disconnected-and-closed',await page.evaluate(()=>oldOwnerPanels.every(panel=>!panel.isConnected&&panel.hidden)),true);
  await swap({number:'92',x:210,y:130});oracle('C9.new-seed-opens',await hidden(panel()),false);await geometry(210,130);
  await swap({number:''});oracle('C9.null-seed-stays-closed',await hidden(panel()),true);
  await swap({number:'92'});oracle('C9.unchanged-after-null-stays-closed',await hidden(panel()),true);
  await request('93');await row('open').focus();await page.keyboard.press('Enter');
  oracle('C9.retained-host-callback-once',await page.evaluate(()=>ownerLog.hosts.map(h=>h.value)),['open']);
 };
 tests[cases[9]] = async () => {
  await dismiss();await clear();await request('101');
  await root().evaluate(node=>{window.replacedOwner=node;window.replacedPanel=node.querySelector('[role="menu"]');window.replacedTrigger=node.querySelector('[data-interaction-menu]');window.replacedID=node.id;});
  await swap({number:'101',style:'outerHTML'});
  oracle('C10.new-root-same-textual-id',await root().evaluate(node=>node!==replacedOwner&&node.id===replacedID),true);
  oracle('C10.replacement-same-seed-opens',await hidden(panel()),false);
  oracle('C10.old-panel-closed',await page.evaluate(()=>replacedPanel.hidden),true);
  const staleProbe=()=>page.evaluate(()=>{const before={hidden:replacedPanel.hidden,style:replacedPanel.getAttribute('style')};replacedOwner.dispatchEvent(new CustomEvent('ely:context-request',{detail:{number:'102',x:410,y:210}}));replacedTrigger.click();return {before,after:{hidden:replacedPanel.hidden,style:replacedPanel.getAttribute('style')}};});
  let stale=await staleProbe();oracle('C10.detached-immediate-request-inert',stale.after,stale.before);
  await page.evaluate(()=>Promise.resolve());stale=await staleProbe();oracle('C10.detached-after-prune-request-inert',stale.after,stale.before);
  await root().evaluate(node=>{node.remove();document.querySelector('[data-fixture-slot="manual"]').append(replacedOwner);});
  await page.evaluate(()=>Promise.resolve());
  await request('103');oracle('C10.reinsertion-needs-normal-startup',await hidden(panel()),true);
  await root().evaluate(node=>ownerMount(node,{onAction(detail){ownerLog.hosts.push({value:detail.value,rebound:true});}}));
  await request('101');oracle('C10.same-node-keeps-watermark',await hidden(panel()),true);
  await request('103');oracle('C10.explicit-start-and-request-open',await hidden(panel()),false);
  await row('open').focus();await page.keyboard.press('Enter');
  oracle('C10.only-fresh-host-binding-runs',await page.evaluate(()=>ownerLog.hosts),[{value:'open',rebound:true}]);
 };
 tests[cases[10]] = async () => {
  await dismiss();await clear();await request('111');await row('open').focus();await page.keyboard.down('Enter');
  await root().evaluate(node=>{window.pendingOwner=node;window.pendingPanel=node.querySelector('[role="menu"]');window.pendingRow=node.querySelector('[value="open"]');});
  const url='/fragment?'+new URLSearchParams({surface:currentSurface,id:'manual',mode:'manual'});
  await page.evaluate(url=>{
   const original=htmx.timeout;
   htmx.timeout=function(value){if(Number(value)===12345){htmx.timeout=original;return new Promise(resolve=>{window.releaseOwnerSwap=resolve;});}return original.call(this,value);};
   window.ownerDelayed=htmx.ajax('GET',url,{source:'#swap-source',target:pendingOwner,select:'[data-ely-family] > *',swap:'innerHTML swap:12345'});
  },url);
  await page.waitForFunction(()=>window.releaseOwnerSwap&&!pendingOwner.dataset.elyReady);
  oracle('C11.pending-root-connected-and-stopped',await page.evaluate(()=>pendingOwner.isConnected&&!pendingOwner.dataset.elyReady),true);
  await request('112',300,220);
  oracle('C11.pending-request-inert',await hidden(panel()),true);
  await swap({slot:'peer'});
  oracle('C11.unrelated-swap-does-not-restart-pending-owner',await root().getAttribute('data-ely-ready'),null);
  await page.evaluate(()=>{releaseOwnerSwap();return ownerDelayed;});
  await page.waitForFunction(sel=>document.querySelector(sel)?.dataset.elyReady==='true',selector('manual'));
  oracle('C11.stopped-request-not-queued',await hidden(panel()),true);
  await page.keyboard.up('Enter');
  await page.evaluate(()=>pendingRow.dispatchEvent(new KeyboardEvent('keyup',{key:'Enter',bubbles:true,cancelable:true})));
  oracle('C11.stale-confirm-key-disposed',await page.evaluate(()=>ownerLog.hosts),[]);
  await request('112');oracle('C11.current-explicit-request-still-valid',await hidden(panel()),false);
  // A later listener cancels an actual prepared network swap; finally must
  // restart against retained DOM without replaying the previous seed/event.
  await root().evaluate(node=>{window.cancelledPanel=node.querySelector('[role="menu"]');window.cancelledRoot=node;document.addEventListener('htmx:before:swap',event=>event.preventDefault(),{once:true});});
  await swap({number:'113'});
  oracle('C11.cancelled-swap-retains-old-dom',await root().evaluate(node=>node===cancelledRoot&&node.querySelector('[role="menu"]')===cancelledPanel),true);
  oracle('C11.cancelled-swap-restarts-closed',await hidden(panel()),true);
  await request('113');oracle('C11.cancelled-request-unconsumed',await hidden(panel()),false);
  const oobURL='/oob?'+new URLSearchParams({surface:currentSurface,id:'manual',mode:'manual',number:'113'});
  await page.evaluate(url=>htmx.ajax('GET',url,{source:'#swap-source',target:'#swap-status'}),oobURL);
  await page.waitForFunction(sel=>document.querySelector(sel)?.dataset.elyReady==='true',selector('manual'));
  oracle('C11.oob-replaces-owner-root',await root().evaluate(node=>node!==cancelledRoot),true);
  oracle('C11.oob-old-panel-closed',await page.evaluate(()=>cancelledPanel.hidden),true);
  oracle('C11.oob-new-owner-seed-opens',await hidden(panel()),false);
  report.observations.push({surface:currentSurface,check:activeCheck,note:'A changed-number event dispatched to the current live root is an explicit new owner request. The library does not infer age of host asynchronous work.'});
 };
 tests[cases[11]] = async () => {
  await dismiss();await clear();await request('121');
  await swap({mode:'automatic'});oracle('C12.mode-switch-closes',await hidden(panel()),true);
  await request('122');oracle('C12.automatic-owner-event-inert',await hidden(panel()),true);
  await swap({mode:'manual',number:'121'});oracle('C12.same-owner-mode-roundtrip-keeps-watermark',await hidden(panel()),true);
  await root().evaluate(node=>{window.beforeIdentityOwner=node;node.id+='-changed';});
  await request('122');oracle('C12.active-id-mismatch-fails-closed',await hidden(panel()),true);
  await swap({number:'121'});
  oracle('C12.changed-id-accepts-same-number',await hidden(panel()),false);
  oracle('C12.id-change-retained-physical-node',await root().evaluate(node=>node===beforeIdentityOwner),true);
  await dismiss();
  await root().evaluate(node=>{node.dataset.elyComponent='menus/Menu';});await request('123');
  oracle('C12.active-component-mismatch-fails-closed',await hidden(panel()),true);
  await root().evaluate(node=>{node.dataset.elyComponent='menus/ContextMenu';});
  await swap({style:'outerHTML',number:'121'});
  oracle('C12.replacement-restores-exact-component',await root().getAttribute('data-ely-component'),'menus/ContextMenu');
  oracle('C12.replacement-resets-owner',await hidden(panel()),false);
  report.observations.push({surface:currentSurface,check:activeCheck,note:'Component/family conversions require replacement roots. Arbitrary retained-element cross-family conversion is intentionally outside this contract.'});
 };
 tests[cases[12]] = async () => {
  await dismiss();await clear();await request('131');
  await row('branch').focus();await page.keyboard.press('ArrowRight');oracle('C13.submenu-first-enabled-focus',await focused(row('child')),true);
  await page.keyboard.press('ArrowLeft');oracle('C13.submenu-return-focus',await focused(row('branch')),true);
  await row('last').focus();
  await row('branch').evaluate(node=>node.dispatchEvent(new PointerEvent('pointerover',{bubbles:true,clientX:15,clientY:15,movementX:0,movementY:0})));
  oracle('C13.stationary-synthetic-boundary-keeps-keyboard-focus',await focused(row('last')),true);
  await page.keyboard.press('Enter');oracle('C13.native-leaf-exactly-once',await page.evaluate(()=>ownerLog.hosts.map(h=>h.value)),['last']);
  await request('132');await surface().click({position:{x:15,y:15}});oracle('C13.left-host-dismisses',await hidden(panel()),true);
  await dismiss();await request('133');await page.locator('#after').click();oracle('C13.outside-focusable-default-preserved',await focused(page.locator('#after')),true);
  await dismiss();await request('134');await page.locator('#outside-blank').click({position:{x:20,y:20}});
  oracle('C13.blank-matching-pointerup-restores-owner',await focused(page.locator('#before')),true);
  await dismiss();await request('135');await page.keyboard.press('Tab');oracle('C13.native-tab-dismisses',await hidden(panel()),true);
  oracle('C13.native-input-evidence',await page.evaluate(()=>ownerLog.inputs.some(item=>item.type==='keydown'&&item.isTrusted)&&ownerLog.inputs.some(item=>item.type==='pointerdown'&&item.isTrusted)),true);
  report.observations.push({surface:currentSurface,check:activeCheck,note:'The existing menu-contracts browser suite remains separately wired with its stationary-pointer edge and 40 native trials; this suite does not relabel synthetic owner requests as native trials.'});
 };
 tests[cases[13]] = async () => {
  await dismiss();await clear();await request('141',900,500);
  oracle('C14.initial-focus-is-menu-row',await focused(row('open')),true);
  await root().evaluate(node=>{
   const host=node.querySelector('[data-interaction-context]'),menu=node.querySelector('[role="menu"]');
   const peer=document.querySelector('[data-fixture-slot="peer"] [data-interaction-context]');
   window.rightHostFocusTrace=[];window.rightHostInputStart=ownerLog.inputs.length;
   document.addEventListener('focusout',event=>{
    if(node.contains(event.target))rightHostFocusTrace.push({fromHost:event.target===host,fromPanel:menu.contains(event.target),toHost:event.relatedTarget===host,toPeer:event.relatedTarget===peer,isTrusted:event.isTrusted});
   },true);
  });
  // Keep the open panel away from the host. Native right pointerdown must move
  // focus from the row to the actual production tabindex=0 context surface.
  const hostBox=await surface().boundingBox();assert(hostBox,'manual context host must be visible');
  const point={x:hostBox.x+18,y:hostBox.y+18};
  oracle('C14.right-pointer-hit-is-owned-host',await surface().evaluate((node,point)=>{
   const target=document.elementFromPoint(point.x,point.y);
   return node.contains(target)&&!node.querySelector('[role="menu"]').contains(target)&&target.closest('[data-ely-family]')===node.closest('[data-ely-family]');
  },point),true);
  await page.mouse.move(point.x,point.y);await page.mouse.down({button:'right'});
  oracle('C14.right-pointerdown-focuses-real-host',await focused(surface()),true);
  oracle('C14.right-pointerdown-keeps-menu-open',await hidden(panel()),false);
  oracle('C14.row-to-host-focusout-is-real',await page.evaluate(()=>rightHostFocusTrace),[{fromHost:false,fromPanel:true,toHost:true,toPeer:false,isTrusted:true}]);
  await page.mouse.up({button:'right'});
  oracle('C14.right-pointerup-keeps-real-host-focused',await focused(surface()),true);
  oracle('C14.right-pointerup-keeps-menu-open',await hidden(panel()),false);
  await page.evaluate(()=>{rightHostFocusTrace=[];});
  await page.keyboard.press('Tab');
  oracle('C14.trusted-tab-reaches-peer-surface',await focused(surface('peer')),true);
  // The focused source is the surface, so this focusout never passes through
  // the menu panel. Sending it to the panel would conceal the original defect.
  oracle('C14.tab-focusout-origin-is-host-not-panel',await page.evaluate(()=>rightHostFocusTrace),[{fromHost:true,fromPanel:false,toHost:false,toPeer:true,isTrusted:true}]);
  oracle('C14.trusted-input-sequence',await page.evaluate(()=>ownerLog.inputs.slice(rightHostInputStart).filter(item=>item.type==='pointerdown'||item.type==='pointerup'||item.type==='keydown').map(item=>({type:item.type,key:item.key??null,button:item.button??null,isTrusted:item.isTrusted,owner:item.owner,contextSurface:item.contextSurface}))),[
   {type:'pointerdown',key:null,button:2,isTrusted:true,owner:await root().getAttribute('id'),contextSurface:true},
   {type:'pointerup',key:null,button:2,isTrusted:true,owner:await root().getAttribute('id'),contextSurface:true},
   {type:'keydown',key:'Tab',button:null,isTrusted:true,owner:await root().getAttribute('id'),contextSurface:true},
  ]);
  oracle('C14.host-tab-away-dismisses-menu',await hidden(panel()),true);
  oracle('C14.host-tab-away-preserves-destination',await focused(surface('peer')),true);
  oracle('C14.host-tab-away-emits-no-business-event',await page.evaluate(()=>ownerLog.events),[]);
  report.observations.push({surface:currentSurface,check:activeCheck,note:'Trusted right pointerdown focuses the production context surface; pointerup preserves the menu. Trusted Tab then leaves that surface for the peer surface, with a surface-origin focusout and no panel-origin focusout.'});
 };
 tests[cases[14]] = async () => {
  await dismiss();await clear();
  // Reuse untouched roots rendered by the selected production path. Compose
  // while detached so each controller starts with its final ownership tree.
  await page.evaluate(()=>{
   window.ordinaryParent=document.querySelector('[data-fixture-slot="manual"] [data-ely-family]');
   window.nestedOrdinary=document.querySelector('[data-fixture-slot="wrong"] [data-ely-family]');
   ordinaryParent.remove();nestedOrdinary.remove();
  });
  await page.waitForFunction(()=>!ordinaryParent.dataset.elyReady&&!nestedOrdinary.dataset.elyReady);
  await page.evaluate(()=>{
   ordinaryParent.querySelector('[role="menu"]').append(nestedOrdinary);
   document.querySelector('[data-fixture-slot="manual"]').append(ordinaryParent);
   ownerBind(ordinaryParent);ownerBind(nestedOrdinary);
  });
  oracle('C15.independent-production-menu-roots',await page.evaluate(()=>({parent:ordinaryParent.dataset.elyComponent,child:nestedOrdinary.dataset.elyComponent,parentReady:ordinaryParent.dataset.elyReady,childReady:nestedOrdinary.dataset.elyReady,nested:nestedOrdinary.parentElement===ordinaryParent.querySelector('[role="menu"]')})),{parent:'menus/ContextMenu',child:'menus/Menu',parentReady:'true',childReady:'true',nested:true});
  await request('151',650,70);
  oracle('C15.parent-row-is-original-focus',await focused(row('open')),true);
  // Programmatic click intentionally leaves the previous focus on the parent
  // row. An ordinary Menu must still return to its own trigger on Escape.
  await page.evaluate(()=>nestedOrdinary.querySelector('[data-interaction-menu]').click());
  oracle('C15.child-first-row-focused',await page.evaluate(()=>document.activeElement===nestedOrdinary.querySelector('[value="open"]')),true);
  const placement=await page.evaluate(()=>{
   const trigger=nestedOrdinary.querySelector('[data-interaction-menu]'),panel=nestedOrdinary.querySelector('[role="menu"]');
   const anchor=trigger.getBoundingClientRect(),actual=panel.getBoundingClientRect();
   const expected={x:Math.max(8,Math.min(anchor.left,innerWidth-actual.width-8)),y:Math.max(8,Math.min(anchor.bottom+6+actual.height>innerHeight-8?anchor.top-actual.height-6:anchor.bottom+6,innerHeight-actual.height-8))};
   return {position:panel.style.position,actual:{x:actual.x,y:actual.y,width:actual.width,height:actual.height},anchor:{x:anchor.x,y:anchor.y,width:anchor.width,height:anchor.height},expected};
  });
  report.observations.push({surface:currentSurface,check:activeCheck,placement});
  oracle('C15.ordinary-placement-owned-by-trigger',{position:placement.position,xNear:Math.abs(placement.actual.x-placement.expected.x)<0.6,yNear:Math.abs(placement.actual.y-placement.expected.y)<0.6},{position:'absolute',xNear:true,yNear:true});
  await page.keyboard.press('Escape');
  oracle('C15.ordinary-menu-returns-to-own-trigger',await page.evaluate(()=>document.activeElement===nestedOrdinary.querySelector('[data-interaction-menu]')),true);
  oracle('C15.child-closes-with-parent-preserved',await page.evaluate(()=>({childHidden:nestedOrdinary.querySelector('[role="menu"]').hidden,parentHidden:ordinaryParent.querySelector('[role="menu"]').hidden})),{childHidden:true,parentHidden:false});
  oracle('C15.ordinary-open-dismiss-emits-no-business-event',await page.evaluate(()=>ownerLog.events),[]);
  report.observations.push({surface:currentSurface,check:activeCheck,note:'A production menus/Menu is composed inside a separate production ContextMenu panel before mounting. Synthetic trigger.click leaves the parent row as the previous focus; trusted Escape must return to the ordinary Menu trigger, whose geometry also anchors placement.'});
 };
 tests[cases[15]] = async () => {
  await dismiss();await clear();
  const url='/fragment?'+new URLSearchParams({surface:currentSurface,id:'manual',mode:'manual',number:'161',x:'210.5',y:'130.25'});
  // Prefetch real renderer output before the synchronous focus callback. The
  // bundled public htmx.swap API prepares its own real lifecycle event before
  // awaiting the held delay; no test-created HTMX lifecycle event is involved.
  await page.evaluate(async url=>{
   const response=await fetch(url);if(!response.ok)throw new Error('Reentrant production fragment fetch failed: '+response.status);
   window.reentrantHTML=await response.text();
   window.reentrantOwner=new DOMParser().parseFromString(reentrantHTML,'text/html').querySelector('[data-ely-family]');
   window.reentrantPrevious=document.querySelector('[data-fixture-slot="manual"] [data-ely-family]');
   reentrantPrevious.remove();
  },url);
  await page.waitForFunction(()=>!reentrantPrevious.dataset.elyReady);
  await page.evaluate(()=>{
   const node=reentrantOwner,panel=node.querySelector('[role="menu"]'),first=node.querySelector('[value="open"]');
   window.reentrantPanel=panel;window.reentrantTrace=[];window.reentrantCleanupCount=0;window.reentrantInFocus=false;
   window.reentrantContext={sourceElement:document.getElementById('swap-source'),target:node,text:reentrantHTML,select:'[data-ely-family] > *',swap:'innerHTML swap:12346'};
   const original=htmx.timeout;
   htmx.timeout=function(value){if(Number(value)===12346){htmx.timeout=original;return new Promise(resolve=>{window.releaseReentrantSwap=resolve;});}return original.call(this,value);};
   node.addEventListener('ely:cleanup',()=>reentrantCleanupCount++);
   document.addEventListener('htmx:before:swap',event=>{
    if(event.detail.ctx===reentrantContext)reentrantTrace.push({phase:'prepared',inFocus:reentrantInFocus,connected:node.isConnected,hidden:panel.hidden,ready:node.dataset.elyReady??null,tasks:event.detail.tasks.map(task=>({sameTarget:task.target===node,style:task.swapSpec.style}))});
   });
   first.addEventListener('focus',()=>{
    reentrantInFocus=true;reentrantTrace.push({phase:'seed-focus',focused:document.activeElement===first,hidden:panel.hidden});
    window.reentrantSwap=htmx.swap(reentrantContext);
    reentrantInFocus=false;
   },{once:true});
   document.querySelector('[data-fixture-slot="manual"]').append(node);
   ownerBind(node);
   reentrantTrace.push({phase:'mount-return',connected:node.isConnected,hidden:panel.hidden,ready:node.dataset.elyReady??null});
  });
  const seedTrace=await page.evaluate(()=>reentrantTrace);
  oracle('C16.real-swap-prepared-during-seed-focus',seedTrace.map(({hidden,ready,...entry})=>entry),[
   {phase:'seed-focus',focused:true},
   {phase:'prepared',inFocus:true,connected:true,tasks:[{sameTarget:true,style:'innerHTML'}]},
   {phase:'mount-return',connected:true},
  ]);
  oracle('C16.seed-stop-closes-panel-synchronously',seedTrace.find(entry=>entry.phase==='prepared').hidden,true);
  oracle('C16.stopped-initializer-remains-unready',seedTrace.filter(entry=>entry.phase!=='seed-focus').map(entry=>entry.ready),[null,null]);
  oracle('C16.stopped-initializer-returns-closed',seedTrace.find(entry=>entry.phase==='mount-return').hidden,true);
  oracle('C16.seed-stop-cleanup-runs-once',await page.evaluate(()=>reentrantCleanupCount),1);
  oracle('C16.prepared-swap-waits-before-dom-mutation',await page.evaluate(()=>Boolean(releaseReentrantSwap)&&reentrantOwner.querySelector('[role="menu"]')===reentrantPanel),true);
  const before=await state();await request('162',440,330);
  oracle('C16.stopped-seed-owner-request-inert',await state(),before);
  await page.evaluate(()=>{releaseReentrantSwap();return reentrantSwap;});
  await page.waitForFunction(()=>reentrantOwner.dataset.elyReady==='true');
  oracle('C16.retained-root-restarts-after-real-swap',await root().evaluate(node=>node===reentrantOwner&&node.querySelector('[role="menu"]')!==reentrantPanel),true);
  oracle('C16.disposed-seed-panel-stays-closed',await page.evaluate(()=>!reentrantPanel.isConnected&&reentrantPanel.hidden),true);
  oracle('C16.same-seed-does-not-replay',await hidden(panel()),true);
  await request('162');oracle('C16.stopped-request-number-unconsumed',await hidden(panel()),false);
  await row('open').focus();await page.keyboard.press('Enter');
  oracle('C16.fresh-controller-host-callback-once',await page.evaluate(()=>ownerLog.hosts.map(host=>host.value)),['open']);
  report.observations.push({surface:currentSurface,check:activeCheck,note:'Seed focus synchronously invokes bundled htmx.swap with prefetched production fragment bytes and a held swap delay. Real before:swap must dispose the still-initializing controller before mount returns; this case does not label the prefetch as htmx.ajax.'});
 };
 for (const renderer of surfaces) {
  currentSurface=renderer;
  for(const name of cases){
   activeCheck=name;activeOracles=[];report.stage=renderer+':'+name;
   await ready();
   await tests[name]();
   await cleanRuntime();
   report.swaps.push(...(await page.evaluate(()=>ownerLog.lifecycle)).map(event=>({surface:renderer,check:name,...event})));
   report.checks.push({surface:renderer,name});console.log(`${renderer}: ${name}`);
  }
 }
 assert.equal(mutation,'','negative control survived its own full matrix');
 oracle('fixture.real-htmx-network-requests',report.requests.some(request=>request.url.startsWith('/fragment?')&&request.htmx==='true'),true);
 oracle('fixture.real-oob-network-requests',report.requests.some(request=>request.url.startsWith('/oob?')&&request.htmx==='true'),true);
 report.status='passed';
} catch(error) {
 if(page){try{report.runtimeErrors.push(...(await page.evaluate(()=>ownerLog.errors)).map(item=>({surface:currentSurface,check:activeCheck,...item})));}catch{}}
 report.error=error.stack;report.failedCheck=activeCheck;report.failedOracle=error.contractOracle;
 report.passedPrefix=report.checks;report.oraclePrefix=activeOracles;
 report.observed=error.observed;report.expected=error.expectedValue;
 const control=contextOwnerControls[mutation];
 const prefix=cases.slice(0,cases.indexOf(control?.check));
 const actualPrefix=report.checks.filter(check=>check.surface===currentSurface).map(check=>check.name);
 const caseOraclePrefix=activeOracles.filter(id=>id.startsWith(control?.check.split('.')[0]+'.'));
 if(control&&error instanceof assert.AssertionError&&activeCheck===control.check&&error.contractOracle===control.oracle&&JSON.stringify(actualPrefix)===JSON.stringify(prefix)&&(!control.prior||JSON.stringify(caseOraclePrefix)===JSON.stringify(control.prior))&&(!Object.hasOwn(control,'actual')||error.observed===control.actual)&&(!Object.hasOwn(control,'expected')||error.expectedValue===control.expected)&&!report.pageErrors.length&&!report.serverErrors.length&&!report.consoleErrors.length&&!report.requestFailures.length&&!report.runtimeErrors.some(error=>!error.expected)) {
  report.status='mutation-killed';report.causalEvidence={surface:currentSurface,designatedOracle:control.oracle,exactServedSHA256:report.assets[file]?.servedSHA256,allPriorChecksPassed:true,withinCasePrerequisites:caseOraclePrefix};
 } else {report.status='failed';process.exitCode=1;}
} finally {
 if(page){try{report.lastPageEvidence=await page.evaluate(()=>ownerLog);}catch{}}
 await mkdir(join(base,'test-results/contracts'),{recursive:true});
 await writeFile(join(base,`test-results/contracts/context-owner-requests-${selected}${mutation?'-'+mutation:''}.json`),JSON.stringify(report,null,2));
 await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));if(temp)await rm(temp,{recursive:true,force:true});
 if(report.status==='failed')console.error(report.error);else console.log(report.status);
}
