import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

// Hosted CI runs the actual Go playground and Chromium. Nothing is mocked:
// preview HTML, contracts, examples and compression sizes come from Go.
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const temporary = await mkdtemp(join(tmpdir(), 'ely-playground-test-'));
const child = spawn('go', ['run', './cmd/sdui-playground'], {
  cwd: repo, env: {...process.env, PORT: String(port)},
  detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
});
let serverOutput = '', startupError, browser, page, phase = 'start real Go server';
const pageErrors = [], externalRequests = [], requests = [];
child.stdout.on('data', chunk => { serverOutput += chunk; });
child.stderr.on('data', chunk => { serverOutput += chunk; });
child.once('error', error => { startupError = error; });
const checkpoint = value => { phase = value; console.log(`[sdui playground] ${value}`); };

async function eventually(check, message, timeout = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await delay(30);
  }
  throw new Error(message);
}
const clone = value => structuredClone(value);
const simpleScreen = text => ({
  version: '1', id: 'playground-browser-screen',
  root: {id: 'browser-layout', type: 'stack', props: {gap: 'md'}, children: [
    {id: 'browser-message', type: 'text', props: {text}},
  ]},
});
const compositionData = {headline: 'Bound live value', rows: [
  {id: 'first', label: 'First repeated row'}, {id: 'second', label: 'Second repeated row'},
]};
const compositionScreen = {
  version: '1', id: 'playground-composition-screen',
  templates: {row: {
    params: {label: {type: 'string', required: true}},
    root: {id: 'row-text', type: 'text', bindings: {text: '/@params/label'}},
  }},
  root: {id: 'composition-layout', type: 'stack', props: {gap: 'md'}, children: [
    {id: 'bound-title', type: 'text', bindings: {text: '/@data/headline'},
      when: {op: 'exists', path: '/@data/headline'}},
    {id: 'repeated-row', use: 'row', paramBindings: {label: '/@vars/row/label'},
      repeat: {items: '/@data/rows', as: 'row', key: '/id'}},
    {id: 'static-footer', type: 'text', props: {text: 'Unchanged footer'}},
  ]},
};
const previewResponse = response => new URL(response.url()).pathname === '/api/preview';
const source = async () => JSON.parse(await page.locator('#screen-editor').inputValue());
// JSON paths contain quotes and brackets. Avoid CSS selector escaping entirely.
async function selectNode(path) {
  const encoded = JSON.stringify(path);
  const index = await page.locator('#node-tree [data-node-path]').evaluateAll((nodes, target) =>
    nodes.findIndex(node => node.dataset.nodePath === target), encoded);
  assert(index >= 0, `tree contains ${encoded}`);
  await page.locator('#node-tree [data-node-path]').nth(index).click();
  await page.locator('#tab-properties').click();
}
async function waitSource(check, message) {
  await eventually(async () => {
    try { return check(await source()); } catch { return false; }
  }, message);
}
async function renderScreen(screen, data = {}) {
  const expected = JSON.stringify(screen);
  const response = page.waitForResponse(response => {
    if (!previewResponse(response)) return false;
    try { return JSON.stringify(response.request().postDataJSON().screen) === expected; } catch { return false; }
  });
  await page.locator('#tab-data').click();
  await page.locator('#data-editor').fill(JSON.stringify(data, null, 2));
  await page.locator('#tab-screen').click();
  await page.locator('#screen-editor').fill(JSON.stringify(screen, null, 2));
  await page.locator('#screen-editor').press('Control+Enter');
  const result = await response;
  assert.equal(result.status(), 200, `preview succeeds: ${await result.text()}`);
  const body = await result.json();
  await eventually(async () => (await page.locator('#preview-frame').getAttribute('srcdoc'))?.includes(screen.root.id),
    'successful preview reaches iframe');
  return body;
}
const frame = () => page.frameLocator('#preview-frame');
async function readFrameText() { return frame().locator('body').innerText(); }

try {
  await eventually(async () => {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw new Error(`Go playground exited (${child.exitCode}): ${serverOutput}`);
    try { return (await fetch(origin)).ok; } catch { return false; }
  }, `Go playground did not start: ${serverOutput}`, 60_000);
  browser = await chromium.launch();
  // Playwright's serviceWorkers:'block' init script reads navigator.serviceWorker
  // inside every frame, which itself throws in our intentionally opaque sandbox.
  // Use a fresh worker-free context and fail on registration instead; do not
  // weaken the sandbox or hide genuine page errors to accommodate test injection.
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  context.on('serviceworker', worker => pageErrors.push(`Unexpected service worker: ${worker.url()}`));
  await context.route('**/*', async route => {
    const url = route.request().url();
    if (url.startsWith(origin + '/')) return route.continue();
    externalRequests.push(url);
    return route.abort('blockedbyclient');
  });
  await context.routeWebSocket('**/*', socket => {
    externalRequests.push(socket.url()); socket.close();
  });
  page = await context.newPage();
  page.on('pageerror', error => pageErrors.push(String(error)));
  page.on('dialog', dialog => dialog.accept());
  page.on('request', request => requests.push(request));
  await page.goto(origin, {waitUntil: 'networkidle'});
  await page.locator('#tab-screen').click();
  await page.locator('#screen-editor').waitFor();

  checkpoint('live JSON uses the real renderer and measured codecs');
  const live = await renderScreen(simpleScreen('Live JSON reaches the real Go renderer'));
  await eventually(async () => (await readFrameText()).includes('Live JSON reaches the real Go renderer'), 'live preview text');
  assert.match(live.html, /data-sdui-node/, 'preview contains actual SDUI renderer markers');
  assert.equal(await frame().locator('#browser-layout').evaluate(node => getComputedStyle(node).display), 'flex', 'hash-approved real renderer CSS applies inside opaque sandbox');
  for (const kind of ['json', 'html']) {
    for (const coding of ['identity', 'gzip', 'br', 'zstd']) {
      assert(Number.isInteger(live.sizes[kind][coding]) && live.sizes[kind][coding] > 0, `${kind}/${coding} has measured bytes`);
    }
  }
  assert(['identity', 'gzip', 'br', 'zstd'].includes(live.sizes.html.selected), 'HTML selection names an actual measured coding');
  assert(['identity', 'gzip', 'br', 'zstd'].includes(live.sizes.json.selected), 'JSON selection names an actual measured coding');
  assert(Array.isArray(live.assets), 'asset closure is reported separately from executable preview');
  const initialComponentLoads = requests.filter(request => new URL(request.url()).pathname === '/api/component').length;
  assert(initialComponentLoads < 20, 'startup loads selected contracts, not the entire catalogue');
  const catalogue = await (await context.request.get(origin + '/api/catalogue?q=TagInput')).json();
  assert(catalogue.items.some(item => item.name === 'forms/TagInput'));
  assert(catalogue.items.every(item => !Object.hasOwn(item, 'properties')), 'catalogue search carries names, not all contracts');

  checkpoint('compression controls use real profile and threshold selection');
  await page.locator('.compression-settings summary').click();
  const policyResponse = page.waitForResponse(response => {
    if (!previewResponse(response)) return false;
    const body = response.request().postDataJSON();
    return body.profile === 'static' && body.minBytes === 2097152;
  });
  await page.locator('#compression-profile').selectOption('static');
  await page.locator('#min-bytes').fill('2097152');
  await page.locator('#min-bytes').press('Tab');
  const policy = await (await policyResponse).json();
  assert.equal(policy.sizes.json.selected, 'identity');
  assert.equal(policy.sizes.html.selected, 'identity');
  await page.locator('#compression-profile').selectOption('dynamic');
  await page.locator('#min-bytes').fill('256');
  await page.locator('#min-bytes').press('Tab');
  await renderScreen(simpleScreen('Live JSON reaches the real Go renderer'));

  checkpoint('invalid JSON and invalid contracts preserve draft and last preview');
  const lastGood = await page.locator('#preview-frame').getAttribute('srcdoc');
  await page.locator('#screen-editor').fill('{"version": "1", "root":');
  await page.locator('#screen-editor').press('Control+Enter');
  await eventually(async () => (await page.locator('#validation-message').innerText()).trim().length > 0, 'JSON syntax diagnostic');
  assert.equal(await page.locator('#screen-editor').inputValue(), '{"version": "1", "root":', 'invalid draft is not overwritten');
  assert.equal(await page.locator('#preview-frame').getAttribute('srcdoc'), lastGood, 'syntax error retains last preview');
  assert.equal(await page.locator('#add-component').isDisabled(), true, 'visual changes cannot destroy invalid JSON');
  const invalidContract = simpleScreen('Invalid contract draft');
  invalidContract.root.children[0].props.text = 17;
  const invalidResponse = page.waitForResponse(response => previewResponse(response) && response.status() >= 400);
  await page.locator('#screen-editor').fill(JSON.stringify(invalidContract, null, 2));
  await page.locator('#screen-editor').press('Control+Enter');
  await invalidResponse;
  await eventually(async () => /text|property|string/i.test(await page.locator('#validation-message').innerText()), 'property contract diagnostic');
  assert.deepEqual(await source(), invalidContract, 'contract failure preserves the authored draft');
  assert.equal(await page.locator('#preview-frame').getAttribute('srcdoc'), lastGood, 'contract error retains last preview');

  checkpoint('visual tree mutations retain templates, bindings, conditions and repeats');
  await renderScreen(compositionScreen, compositionData);
  await eventually(async () => /Bound live value/.test(await readFrameText()) && /Second repeated row/.test(await readFrameText()), 'composed fixture renders');
  await selectNode(['root']);
  await page.locator('#component-search').fill('text');
  const textChoice = page.locator('#catalogue-results [data-component-name="text"]');
  await textChoice.waitFor();
  await textChoice.click();
  await page.locator('#add-component').click();
  await waitSource(screen => screen.root.children.length === 4, 'visual add writes JSON');
  const added = (await source()).root.children[3];
  assert.equal(added.type, 'text');
  assert(added.id && !compositionScreen.root.children.some(node => node.id === added.id), 'added node gets a unique ID');
  await selectNode(['root', 'children', 3]);
  await page.locator('#property-fields [data-property="text"]').fill('Edited from the visual inspector');
  await page.locator('#property-fields [data-property="text"]').press('Tab');
  await waitSource(screen => screen.root.children[3].props.text === 'Edited from the visual inspector', 'property input writes JSON');
  await eventually(async () => (await readFrameText()).includes('Edited from the visual inspector'), 'property input rerenders');
  await page.locator('#node-up').click();
  await waitSource(screen => screen.root.children[2].id === added.id, 'move up changes JSON ordering');
  await page.locator('#node-down').click();
  await waitSource(screen => screen.root.children[3].id === added.id, 'move down changes JSON ordering');
  await page.locator('#node-duplicate').click();
  await waitSource(screen => screen.root.children.length === 5, 'duplicate inserts a node');
  assert.equal(new Set((await source()).root.children.map(node => node.id)).size, 5, 'duplicate regenerates node IDs');
  await page.locator('#node-delete').click();
  await waitSource(screen => screen.root.children.length === 4, 'delete removes the duplicate');
  await selectNode(['root', 'children', 3]);
  await page.locator('#node-delete').click();
  await waitSource(screen => screen.root.children.length === 3, 'delete removes added node');
  assert.deepEqual(await source(), compositionScreen, 'round trip leaves all unrelated metadata lossless');
  await page.locator('#undo').click();
  await waitSource(screen => screen.root.children.length === 4, 'undo restores deletion');
  await page.locator('#redo').click();
  await waitSource(screen => screen.root.children.length === 3, 'redo reapplies deletion');
  assert.deepEqual(await source(), compositionScreen);

  checkpoint('source edits update the tree, and keyboard history stays scoped');
  const fromJSON = clone(compositionScreen);
  fromJSON.root.children[2].props.text = 'Changed in source';
  await renderScreen(fromJSON, compositionData);
  await selectNode(['root', 'children', 2]);
  assert.equal(await page.locator('#property-fields [data-property="text"]').inputValue(), 'Changed in source');
  await page.locator('#node-tree [data-node-path]').first().focus();
  await page.keyboard.press('End');
  const lastPath = await page.evaluate(() => document.activeElement?.dataset.nodePath);
  assert(lastPath, 'tree keyboard navigation keeps focus on a node');
  await page.keyboard.press('Home');
  assert.equal(await page.evaluate(() => document.activeElement?.dataset.nodePath), '["root"]', 'Home focuses root');
  await page.keyboard.press('ArrowDown');
  assert.notEqual(await page.evaluate(() => document.activeElement?.dataset.nodePath), '["root"]', 'ArrowDown moves tree focus');
  await selectNode(['root', 'children', 2]);
  await page.locator('#node-delete').click();
  await waitSource(screen => screen.root.children.length === 2, 'keyboard history fixture deletion');
  await page.locator('#undo').focus();
  await page.keyboard.press('Control+z');
  await waitSource(screen => screen.root.children.length === 3, 'keyboard undo restores node outside source editor');
  await page.keyboard.press('Control+Shift+z');
  await waitSource(screen => screen.root.children.length === 2, 'keyboard redo restores deletion');

  checkpoint('search loads a component contract lazily');
  await page.locator('#component-search').fill('forms/TagInput');
  await page.locator('#catalogue-results [data-component-name="forms/TagInput"]').click();
  await eventually(() => requests.some(request => {
    const url = new URL(request.url());
    return url.pathname === '/api/component' && url.searchParams.get('name') === 'forms/TagInput';
  }), 'selected catalogue result fetches its contract');
  const contract = await (await context.request.get(origin + '/api/component?name=forms%2FTagInput')).json();
  assert.equal(contract.name, 'forms/TagInput');
  assert(Object.keys(contract.properties).length > 0, 'the lazy endpoint returns the reviewed property graph');

  checkpoint('built-in examples are editable, renderable and local');
  const examples = await (await context.request.get(origin + '/api/examples')).json();
  assert(examples.length >= 5, 'basic, advanced, slots, repeats and events examples exist');
  for (const example of examples) {
    const rendered = page.waitForResponse(response => {
      if (!previewResponse(response)) return false;
      try { return response.request().postDataJSON().screen.id === example.screen.id; } catch { return false; }
    });
    await page.locator('#example-select').selectOption(example.id);
    await page.locator('#load-example').click();
    const response = await rendered;
    assert.equal(response.status(), 200, `${example.id}: ${await response.text()}`);
    assert.deepEqual(await source(), example.screen, `${example.id} loads complete editable schema`);
    assert.deepEqual(JSON.parse(await page.locator('#data-editor').inputValue()), example.data);
  }

  checkpoint('visual insertion respects registered named slots');
  const slotsExample = examples.find(example => example.id === 'slots');
  await renderScreen(slotsExample.screen, slotsExample.data);
  await selectNode(['root', 'children', 0]);
  await page.locator('#component-search').fill('text');
  await page.locator('#catalogue-results [data-component-name="text"]').click();
  await eventually(async () => await page.locator('#insert-target').inputValue() === 'slot:content', 'registered content slot becomes insertion target');
  await page.locator('#add-component').click();
  await waitSource(screen => screen.root.children[0].slots.content.length === 3, 'visual add writes into named slot');
  await selectNode(['root', 'children', 0]);
  await page.locator('#component-search').fill('form');
  await page.locator('#catalogue-results [data-component-name="form"]').click();
  await eventually(async () => (await page.locator('#component-name').innerText()) === 'form' && await page.locator('#copy-component').isEnabled(), 'form contract loaded');
  assert.equal(await page.locator('#add-component').isDisabled(), true, 'slot forbids a component outside allowedTypes');

  checkpoint('export and import round-trip a composed document');
  await renderScreen(compositionScreen, compositionData);
  const downloadEvent = page.waitForEvent('download');
  await page.locator('#export-screen').click();
  const download = await downloadEvent;
  const exportedPath = join(temporary, 'export.json');
  await download.saveAs(exportedPath);
  const exported = JSON.parse(await readFile(exportedPath, 'utf8'));
  const exportedScreen = exported.screen || exported;
  assert.deepEqual(exportedScreen, compositionScreen, 'export preserves all composition metadata');
  await renderScreen(simpleScreen('Replace before import'));
  await page.locator('#import-file').setInputFiles(exportedPath);
  await waitSource(screen => screen.id === compositionScreen.id, 'file import restores schema');
  assert.deepEqual(await source(), compositionScreen, 'import/export is structurally lossless');
  if (exported.data) assert.deepEqual(JSON.parse(await page.locator('#data-editor').inputValue()), compositionData);

  checkpoint('cancelled replacement and invalid imports preserve edits');
  await renderScreen(simpleScreen('Unsaved cancellation draft'));
  const beforeCancel = await page.locator('#screen-editor').inputValue();
  page.removeAllListeners('dialog');
  page.once('dialog', dialog => dialog.dismiss());
  await page.locator('#example-select').selectOption('basic');
  await page.locator('#load-example').click();
  assert.equal(await page.locator('#screen-editor').inputValue(), beforeCancel, 'Cancel retains the current document');
  page.on('dialog', dialog => dialog.accept());
  await page.locator('#import-file').setInputFiles({name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{broken')});
  await eventually(async () => /Could not import/i.test(await page.locator('#notice').innerText()), 'invalid import is explained');
  assert.equal(await page.locator('#screen-editor').inputValue(), beforeCancel, 'invalid import cannot replace the current document');

  checkpoint('sandbox blocks scripts and preview actions never call external services');
  await renderScreen(simpleScreen('<script>window.playgroundInjected=true</script><img src="https://invalid.example/probe">'));
  assert.equal(await page.locator('#preview-frame').getAttribute('sandbox'), '', 'preview has no sandbox capability grants');
  assert.equal(await frame().locator('script').count(), 0, 'renderer does not turn untrusted text into executable markup');
  assert.equal(await frame().locator('img[src="https://invalid.example/probe"]').count(), 0, 'escaped text is not a network sink');
  assert((await readFrameText()).includes('<script>'), 'HTML-looking source remains visible escaped text');
  assert.equal(await page.evaluate(() => window.playgroundInjected), undefined);
  const token = await page.locator('meta[name="csrf-token"]').getAttribute('content');
  assert(token, 'preview endpoint has a server-issued CSRF token');
  const denied = await context.request.post(origin + '/api/preview', {data: {screen: simpleScreen('CSRF check'), data: {}}});
  assert.equal(denied.status(), 403, 'preview POST without CSRF token is denied');
  const invalidProfile = await context.request.post(origin + '/api/preview', {
    headers: {'X-CSRF-Token': token}, data: {screen: simpleScreen('Profile check'), data: {}, profile: 'invalid-profile'},
  });
  assert(invalidProfile.status() >= 400 && invalidProfile.status() < 500, 'unsupported codec profile is rejected');

  checkpoint('mobile layout retains readable editors and keyboard access');
  await page.setViewportSize({width: 390, height: 844});
  await renderScreen(simpleScreen('Mobile preview'));
  await page.locator('#screen-editor').scrollIntoViewIfNeeded();
  assert.equal(await page.locator('#screen-editor').isVisible(), true);
  assert.equal(await page.locator('#preview-frame').isVisible(), true);
  const dimensions = await page.evaluate(() => ({width: innerWidth, scroll: document.documentElement.scrollWidth}));
  assert(dimensions.scroll <= dimensions.width + 2, `mobile page does not overflow horizontally: ${JSON.stringify(dimensions)}`);
  await page.locator('#screen-editor').focus();
  await page.keyboard.press('Control+Enter');
  await eventually(async () => (await readFrameText()).includes('Mobile preview'), 'keyboard preview works at mobile width');
  checkpoint('invalid browser-local drafts survive reload');
  await page.locator('#screen-editor').fill('{"unfinished":');
  await page.locator('#screen-editor').press('Control+Enter');
  await page.reload({waitUntil: 'networkidle'});
  await page.locator('#tab-screen').click();
  assert.equal(await page.locator('#screen-editor').inputValue(), '{"unfinished":', 'reload restores even an invalid draft without silently replacing it');
  await renderScreen(simpleScreen('Recovered after reload'));
  assert.deepEqual(externalRequests, [], 'editor and sandbox make no external requests');
  assert.deepEqual(pageErrors, [], 'no uncaught browser errors');
  console.log('SDUI playground browser checks passed: real rendering, validation recovery, lossless visual editing, lazy contracts, examples, import/export, sandbox, mobile and keyboard paths.');
} catch (error) {
  console.error('SDUI playground diagnostics', JSON.stringify({phase, pageErrors, externalRequests, server: serverOutput.slice(-5000)}));
  throw error;
} finally {
  await browser?.close();
  if (child.pid && child.exitCode === null) {
    try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); } catch {}
  }
  await rm(temporary, {recursive: true, force: true});
}
