import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

// Serve only the regression fixture and production assets it executes.
const files = new Map([
  ['/tests/controls_swap_browser.html', 'text/html; charset=utf-8'],
  ['/tests/controls_swap_response.html', 'text/html; charset=utf-8'],
  ['/assets/htmx.min.js', 'text/javascript; charset=utf-8'],
  ['/assets/ely-controls.js', 'text/javascript; charset=utf-8'],
  ['/assets/ely-api.js', 'text/javascript; charset=utf-8'],
  ['/assets/sdui.js', 'text/javascript; charset=utf-8'],
]);
const server = createServer(async (request, response) => {
  const path = new URL(request.url, 'http://localhost').pathname;
  const type = files.get(path);
  if (!type) { response.writeHead(404).end(); return; }
  try {
    const source = path.startsWith('/tests/')
      ? `../fixtures/${path.slice('/tests/'.length)}`
      : path === '/assets/sdui.js'
        ? '../../../../adapters/gohtmx/assets/sdui.js'
        : `../..${path}`;
    const contents = await readFile(new URL(source, import.meta.url));
    response.writeHead(200, {'content-type': type, 'cache-control': 'no-store'}).end(contents);
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(`http://127.0.0.1:${server.address().port}/tests/controls_swap_browser.html`);
  await page.waitForFunction(() => window.__controlsSwapResult, null, {timeout: 15000});
  const result = await page.evaluate(() => window.__controlsSwapResult);
  const report = await page.locator('#results').innerText();
  assert.equal(result.passed, true, report);
  assert.deepEqual(errors, [], 'Browser fixture must not throw uncaught errors');
  assert.equal(result.tests, 9, 'Real HTTP, all six swap styles, source replacement and OOB scenarios must run');
  // Real browser editing generates native change on blur; synthetic input-only
  // tests cannot establish exactly-once composite host notifications.
  await page.evaluate(async () => {
    const root = document.createElement('section'); root.id = 'commit-events';
    root.dataset.elyFamily = 'commit-audit'; root.dataset.elyComponent = 'forms/Test';
    root.dataset.sduiScreen = ''; root.dataset.sduiEndpoint = '/commit-audit'; root.dataset.sduiCsrf = 'test-token';
    root.dataset.sduiOn = 'change'; root.dataset.sduiAction = 'save'; root.dataset.sduiTarget = 'commit-region';
    root.innerHTML = await (await fetch('/tests/controls_swap_response.html')).text();
    const region = document.createElement('div'); region.id = 'commit-region'; region.dataset.sduiRegion = ''; root.append(region);
    document.body.append(root);
    window.__commitChanges = []; window.__rawCommitChanges = []; window.__commitRequests = [];
    const fetchOriginal = window.fetch;
    window.fetch = (url, options) => {
      if (new URL(url, location.href).pathname !== '/commit-audit') return fetchOriginal(url, options);
      window.__commitRequests.push(...[...options.body].filter(([name]) => !name.startsWith('_')).map(([name, value]) => ({name, value})));
      return Promise.resolve(new Response('Test host failure, keep controls mounted', {status: 500}));
    };
    await import('/assets/sdui.js');
    const {register, mount} = await import('/assets/ely-api.js');
    register('commit-audit', () => {});
    mount(root, {onChange: detail => window.__commitChanges.push({name: detail.name, value: detail.value})});
    root.addEventListener('change', event => window.__rawCommitChanges.push({name: event.target.name, value: event.target.value}));
    document.dispatchEvent(new CustomEvent('htmx:after:swap'));
  });
  const commits = () => page.evaluate(() => ({host: window.__commitChanges, requests: window.__commitRequests}));
  assert.deepEqual(await commits(), {host: [], requests: []}, 'initialization is silent');
  const pin = page.locator('#commit-events [data-ui-pin-slot]').first();
  await pin.selectText(); await pin.press('9'); await page.keyboard.press('Tab');
  let expected = [{name: 'http-pin', value: '9234'}];
  assert.deepEqual(await commits(), {host: expected, requests: expected}, 'native PIN typing/blur reports one aggregate value');
  await pin.selectText(); await pin.press('9'); await page.keyboard.press('Tab');
  assert.deepEqual(await commits(), {host: expected, requests: expected}, 'unchanged PIN typing/blur is silent');
  // The browser receives a real ClipboardEvent/DataTransfer; OS clipboard access
  // is deliberately unnecessary. Native typing and blur above are trusted keys.
  await pin.evaluate(node => { const data = new DataTransfer(); data.setData('text/plain', '8765'); node.dispatchEvent(new ClipboardEvent('paste', {bubbles: true, cancelable: true, clipboardData: data})); });
  expected = [...expected, {name: 'http-pin', value: '8765'}];
  assert.deepEqual(await commits(), {host: expected, requests: expected}, 'PIN paste reports one aggregate value');
  const tags = page.locator('#commit-events [data-ui-tag-entry]');
  await tags.pressSequentially('gamma'); await tags.press('Enter'); await tags.press('Tab');
  expected = [...expected, {name: 'http-tags', value: 'alpha,beta,gamma'}];
  assert.deepEqual(await commits(), {host: expected, requests: expected}, 'tag commit/blur reports one aggregate value');
  await tags.pressSequentially('gamma'); await tags.press('Enter'); await tags.press('Tab');
  assert.deepEqual(await commits(), {host: expected, requests: expected}, 'duplicate tag commit/blur is silent');
  await tags.pressSequentially('uncommitted'); await tags.press('Tab');
  assert.deepEqual(await commits(), {host: expected, requests: expected}, 'uncommitted editor text is not a submitted change');
  await page.evaluate(() => { document.dispatchEvent(new CustomEvent('htmx:after:swap')); document.dispatchEvent(new CustomEvent('htmx:after:swap')); });
  await tags.fill('delta'); await tags.press('Enter'); await tags.press('Tab');
  expected = [...expected, {name: 'http-tags', value: 'alpha,beta,gamma,delta'}];
  assert.deepEqual(await commits(), {host: expected, requests: expected}, 'repeat swaps preserve one notification per commit');
  assert(await page.evaluate(() => window.__rawCommitChanges.some(change => !change.name)), 'native editor change still bubbles for custom consumers');
  assert.deepEqual(errors, [], 'Composite browser editing must not throw');
  console.log('Native keyboard/blur and browser ClipboardEvent composite commit regression passed');
  console.log(report);
} finally {
  await browser?.close();
  await new Promise((resolve, reject) => server.close(error => {
    if (error && error.code !== 'ERR_SERVER_NOT_RUNNING') reject(error);
    else resolve();
  }));
}
