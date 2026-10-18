import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

// A real Go example, a real Chromium browser, and the actual bundled assets.
// Every request stays on this loopback server; no external service is involved.
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const schemaDirectory = await mkdtemp(join(tmpdir(), 'ely-sdui-'));
const schemaPath = join(schemaDirectory, 'screen.json');
const initialSchema = JSON.parse(await readFile(new URL('../../../../examples/sdui/web/screen.json', import.meta.url), 'utf8'));
await writeFile(schemaPath, JSON.stringify(initialSchema));
const child = spawn('go', ['run', './examples/sdui/web'], {
  cwd: repo, env: {...process.env, PORT: String(port), SDUI_SCHEMA: schemaPath, SDUI_WATCH: '1'},
  detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
});
let output = '', startupError, browser, page;
let phase = 'start Go server';
let releaseHeldResponse = () => {};
const errors = [], requests = [], postRequests = [], assetResponses = [];
const checkpoint = value => { phase = value; console.log(`[sdui] ${value}`); };
child.stdout.on('data', value => { output += value; });
child.stderr.on('data', value => { output += value; });
child.once('error', error => { startupError = error; });

async function eventually(check, message, timeout = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await delay(25);
  }
  throw new Error(message);
}

try {
  await eventually(async () => {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw new Error(`Go example exited (${child.exitCode}): ${output}`);
    try { return (await fetch(origin)).ok; } catch { return false; }
  }, `Go example did not start: ${output}`, 60_000);
  checkpoint('Go server ready; launch Chromium');
  browser = await chromium.launch();
  const context = await browser.newContext({viewport: {width: 1100, height: 1000}, serviceWorkers: 'block'});
  page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', response => {
    if (new URL(response.url()).pathname.startsWith('/assets/')) assetResponses.push({url: response.url(), status: response.status()});
  });
  page.on('request', request => {
    if (new URL(request.url()).origin !== origin) errors.push(`Unexpected external request: ${request.url()}`);
    requests.push(new URL(request.url()).pathname);
    if (request.method() === 'POST') postRequests.push(request);
  });
  await page.addInitScript(() => {
    window.sduiResults = [];
    window.elyErrors = [];
    window.sduiSwaps = 0;
    for (const type of ['sdui:success', 'sdui:error', 'sdui:stale']) {
      document.addEventListener(type, event => sduiResults.push({type, status: event.detail.status, validation: event.detail.validation}));
    }
    document.addEventListener('ely:error', event => elyErrors.push(String(event.detail.error)));
    document.addEventListener('htmx:after:swap', () => sduiSwaps++);
  });
  checkpoint('load page and selective bundled assets');
  const initialCSSResponse = page.waitForResponse(response => new URL(response.url()).pathname === '/assets/app.css');
  await page.goto(origin, {waitUntil: 'networkidle'});
  const cssResponse = await initialCSSResponse;
  const cssHeaders = await cssResponse.allHeaders();
  const cssRequestHeaders = await cssResponse.request().allHeaders();
  assert(['gzip', 'br', 'zstd'].includes(cssHeaders['content-encoding']), 'Chromium receives compressed static CSS');
  assert(cssRequestHeaders['accept-encoding'].split(',').map(value => value.trim()).includes(cssHeaders['content-encoding']), 'server selects an encoding Chromium advertised');
  assert.match(cssHeaders.vary, /accept-encoding/i, 'asset encoding varies by request support');
  const name = page.locator('#profile-editor input[name="name"]');
  const toggle = page.locator('#updates-switch input[role="switch"]');
  const submit = page.locator('#save-profile button');
  const result = page.locator('#profile-result');
  const ready = () => page.waitForSelector('#updates-switch [data-ely-ready="true"]');
  await ready();
  assert.equal(await page.locator('#profile-screen').count(), 1);
  assert.equal(requests.filter(path => path === '/assets/sdui.js').length, 1);
  assert.equal(requests.filter(path => path === '/assets/ely-api-forms-entry.js').length, 1);
  assert.equal(requests.filter(path => path === '/assets/ely-api.js').length, 1);
  for (const family of ['foundation', 'data', 'workspace', 'communication', 'native']) {
    assert(!requests.includes(`/assets/ely-api-${family}-entry.js`), `unused ${family} entrypoint is absent`);
  }
  assert.equal(requests.filter(path => path === '/assets/ely-api-interaction-entry.js').length, 1, 'conditional branch asset closure is preloaded');
  assert.equal(await page.locator('#saved-animation').count(), 0, 'conditional component starts absent');
  assert(!requests.includes('/assets/lottie-light.min.js'), 'absent animation does not download Lottie');
  assert(!requests.includes('/assets/ely-api-all.js'), 'no all-family loader');

  // Server validation replaces the requested region even on HTTP 422, and
  // keyboard focus follows the input's stable generated ID across the swap.
  checkpoint('assets passed; validate and restore focus');
  await name.focus();
  await name.press('Enter');
  await page.waitForFunction(() => sduiResults.some(result => result.status === 422));
  assert.match(await page.locator('#profile-error').innerText(), /Enter a display name\./);
  await ready();
  assert.equal(await name.evaluate(node => document.activeElement === node), true, 'focus restored after validation');
  assert.equal(await page.locator('#profile-form').count(), 1, 'no duplicate region IDs after 422');
  assert(!requests.includes('/assets/lottie-light.min.js'), 'validation without an animation does not download Lottie');
  const smallRequestHeaders = await postRequests.at(-1).allHeaders();
  assert.match(smallRequestHeaders['content-type'], /^multipart\/form-data; boundary=/i, 'small actions retain native multipart transport');
  assert.equal(smallRequestHeaders['content-encoding'], undefined);

  // Successful native FormData includes repeated names, the clicked submitter,
  // and a real File. File bytes are read by Go, not JSON-serialized or mocked.
  checkpoint('validation passed; submit real FormData and file');
  await name.fill('Ada Lovelace');
  const contents = Buffer.from('Real browser attachment.\n');
  await page.locator('input[name="attachment"]').setInputFiles({name: 'proof.txt', mimeType: 'text/plain', buffer: contents});
  await submit.click();
  await page.waitForFunction(() => document.querySelector('#profile-result')?.textContent.includes('Save #1.'));
  assert.match(await result.innerText(), /Saved Ada Lovelace\. Updates off\./);
  assert.match(await page.locator('#attachment-result').innerText(), new RegExp(`proof\\.txt \\(${contents.length} bytes\\)`));
  assert.match(await page.locator('#tags-result').innerText(), /Repeated fields: go, hypermedia/);
  assert.match(await page.locator('#intent-result').innerText(), /Submitter: save/);
  const uploadHeaders = await postRequests.at(-1).allHeaders();
  assert.match(uploadHeaders['content-type'], /^multipart\/form-data; boundary=/i, 'uploads retain native multipart transport');
  assert.equal(uploadHeaders['content-encoding'], undefined);
  await ready();
  assert.equal(await submit.evaluate(node => document.activeElement === node), true, 'submit button focus restored');

  await page.waitForSelector('#saved-animation [data-ely-ready="true"]');
  await page.waitForFunction(() => document.querySelector('#saved-animation [data-interaction-lottie-status]')?.textContent === 'Animation ready');
  assert.equal(requests.filter(path => path === '/assets/lottie-light.min.js').length, 1, 'first animation mount downloads Lottie once');
  await page.locator('#saved-animation [data-interaction-lottie-play]').click();
  assert.equal(await page.locator('#saved-animation [data-interaction-lottie-status]').innerText(), 'Animation playing');
  await page.locator('#saved-animation [data-interaction-lottie-pause]').click();
  assert.equal(await page.locator('#saved-animation [data-interaction-lottie-status]').innerText(), 'Animation paused');

  // Advanced component change events use the same transport and current form.
  checkpoint('FormData passed; advanced changes and repeated swaps');
  let before = postRequests.length;
  await toggle.check();
  await page.waitForFunction(() => document.querySelector('#profile-result')?.textContent.includes('Save #2.'));
  await page.waitForFunction(() => document.querySelector('#saved-animation [data-interaction-lottie-status]')?.textContent === 'Animation ready' && window.lottie.getRegisteredAnimations().length === 1);
  await ready();
  assert.equal(postRequests.length, before + 1, 'one advanced change causes one request');
  assert.equal(requests.filter(path => path === '/assets/lottie-light.min.js').length, 1, 'later animation mounts reuse Lottie');
  assert.equal(await toggle.isChecked(), true);
  assert.match(await result.innerText(), /Updates on\./);
  assert.equal(await toggle.evaluate(node => document.activeElement === node), true, 'advanced control focus restored');

  // Replacing controls repeatedly must clean old family handlers and retain a
  // single delegated bridge. Retain an old root to explicitly test detachment.
  await page.evaluate(() => {
    window.detachedSwitch = document.querySelector('#updates-switch [data-ely-family]');
    window.detachedChanges = 0;
    detachedSwitch.addEventListener('ely:change', () => detachedChanges++);
  });
  before = postRequests.length;
  await toggle.uncheck();
  await page.waitForFunction(() => document.querySelector('#profile-result')?.textContent.includes('Save #3.'));
  await ready();
  assert.equal(postRequests.length, before + 1, 'replacement did not duplicate handlers');
  await page.evaluate(() => detachedSwitch.querySelector('input').dispatchEvent(new Event('change', {bubbles: true})));
  assert.equal(await page.evaluate(() => detachedChanges), 1, 'only the pre-removal change was observed on detached root');
  assert.equal(postRequests.length, before + 1, 'detached controls never send requests');

  // Repeated in-flight submit events on the same form are suppressed. The
  // server receives one request; later intentional submissions remain allowed.
  before = postRequests.length;
  checkpoint('advanced swaps passed; suppress duplicate submission');
  await name.fill('Repeated submission');
  await page.locator('input[name="delay"]').evaluate(node => { node.value = '150'; });
  await page.evaluate(() => {
    const form = document.querySelector('#profile-editor');
    const button = document.querySelector('#save-profile button');
    form.requestSubmit(button);
    form.requestSubmit(button);
  });
  await page.waitForFunction(() => document.querySelector('#profile-result')?.textContent.includes('Save #4.'));
  await ready();
  assert.equal(postRequests.length, before + 1, 'busy duplicate submit does not reach server');

  // Fetch the older response from the real Go server, then hold its delivery
  // until the newer response has updated the DOM. This proves the sequence
  // guard without depending on CI speed or a narrow server delay window.
  checkpoint('duplicate submission passed; deterministic late-response race');
  await page.evaluate(() => {
    window.realAbort = AbortController.prototype.abort;
    AbortController.prototype.abort = function () {};
  });
  before = postRequests.length;
  let heldResponse, heldHTML, routeError, olderFulfilled = false, olderHeaders = false;
  const responseGate = new Promise(resolve => { releaseHeldResponse = resolve; });
  const oldRequest = request => request.method() === 'POST' && request.postData()?.includes('Older response');
  const observeOlder = response => { if (oldRequest(response.request())) olderHeaders = true; };
  page.on('response', observeOlder);
  const raceRoute = async route => {
    try {
      if (!oldRequest(route.request())) { await route.continue(); return; }
      const response = await route.fetch({maxRedirects: 0, timeout: 15_000});
      // Reading this APIResponse is separate from the browser Fetch response;
      // the browser has not received any headers or HTML yet.
      heldHTML = await response.text();
      heldResponse = response;
      await responseGate;
      await route.fulfill({response});
      olderFulfilled = true;
    } catch (error) {
      routeError = error;
      await route.abort().catch(() => {});
    }
  };
  await page.route(origin + '/', raceRoute);
  await name.fill('Older response');
  await page.locator('input[name="delay"]').evaluate(node => { node.value = '0'; });
  await page.evaluate(() => document.querySelector('#profile-editor').requestSubmit(document.querySelector('#save-profile button')));
  await eventually(() => {
    if (routeError) throw routeError;
    return !!heldResponse;
  }, 'older real Go response was not captured');
  assert.equal(heldResponse.status(), 200);
  assert.match(heldHTML, /Saved Older response\./);
  assert.match(heldHTML, /Save #5\./);
  assert.equal(olderHeaders, false, 'older response remains withheld from the browser');
  await name.fill('Latest response');
  await toggle.check();
  await page.waitForFunction(() => document.querySelector('#profile-result')?.textContent.includes('Saved Latest response.'));
  await ready();
  assert.match(await result.innerText(), /Save #6\./);
  releaseHeldResponse();
  await eventually(() => {
    if (routeError) throw routeError;
    return olderFulfilled && olderHeaders;
  }, 'held response was not delivered after the newer swap');
  // The stale response is intentionally not consumed by the runtime. Waiting
  // on Playwright Response.finished() can hang for that unread fetch stream;
  // response headers plus two browser animation frames let its guard execute.
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))));
  page.off('response', observeOlder);
  await page.unroute(origin + '/', raceRoute);
  assert.match(await result.innerText(), /Saved Latest response\./, 'late stale response cannot replace the newest DOM');
  assert.equal(await name.inputValue(), 'Latest response');
  assert.equal(postRequests.length, before + 2);
  await page.evaluate(() => { AbortController.prototype.abort = realAbort; });
  const refreshed = await context.request.get(origin);
  assert.match(await refreshed.text(), /Saved Latest response\./, 'newest server state survives refresh');
  checkpoint('late-response guard passed; HTTP authorization and replay');

  // HTTP negatives use the actual running server and leave the rendered region
  // untouched. The example never creates a session on unauthenticated POST.
  const csrf = await page.locator('[data-sdui-screen]').getAttribute('data-sdui-csrf');
  const post = (values, key) => context.request.post(origin, {form: values, headers: {'Idempotency-Key': key}});
  const revision = await page.locator('[data-sdui-screen]').getAttribute('data-sdui-revision');
  const payload = {_revision: revision, _action: 'save-profile', _target: 'profile-form', _csrf: csrf, _request: 'browser-retry', name: 'Idempotent request'};
  assert.equal((await post({...payload, _csrf: 'wrong'}, 'bad-csrf')).status(), 403);
  assert.equal((await post({...payload, _action: 'not-registered'}, 'bad-action')).status(), 400);
  const anonymous = await fetch(origin, {method: 'POST', headers: {'Content-Type': 'application/x-www-form-urlencoded', 'Idempotency-Key': 'anonymous'}, body: new URLSearchParams(payload)});
  assert.equal(anonymous.status, 401);
  const first = await post(payload, 'browser-retry');
  const second = await post(payload, 'browser-retry');
  assert.equal(first.status(), 200);
  assert.equal(second.status(), 200);
  assert.equal(await first.text(), await second.text(), 'actual HTTP retry replays byte-identical HTML');
  assert.equal((await post({...payload, name: 'different'}, 'browser-retry')).status(), 409);

  const results = await page.evaluate(() => sduiResults);
  assert.equal(results.filter(item => item.status === 422 && item.validation).length, 1);
  assert.equal(results.filter(item => item.type === 'sdui:success').length, 5, 'superseded response emits no false success');
  assert.equal(await page.evaluate(() => sduiSwaps), 6, 'one swap per accepted response');
  assert.deepEqual(await page.evaluate(() => elyErrors), []);
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  assert(assetResponses.length > 0);
  assert.deepEqual(assetResponses.filter(response => response.status !== 200), [], 'every initial asset request succeeds');

  // Normal document history remains usable. A rejected loader URL must not
  // break delegation after Back/Forward, including browsers using bfcache.
  checkpoint('HTTP checks passed; Back/Forward lifecycle');
  const invalidPage = await page.goto(`${origin}/?unsupported=1`);
  assert.equal(invalidPage.status(), 400);
  await page.goBack();
  await ready();
  assert.equal(await page.locator('#profile-form').count(), 1);
  await page.goForward();
  assert.match(await page.locator('body').innerText(), /invalid page request/);
  await page.goBack();
  await ready();
  before = postRequests.length;
  await name.fill('After history navigation');
  await submit.click();
  await page.waitForFunction(() => document.querySelector('#profile-result')?.textContent.includes('Saved After history navigation.'));
  assert.match(await result.innerText(), /Save #8\./, 'server persisted the prior idempotent save exactly once');
  assert.equal(postRequests.length, before + 1, 'history restoration has one active transport handler');
  assert.deepEqual(errors, [], 'no browser errors after Back/Forward');
  checkpoint('history passed; named-field DOM clobbering');
  // Native forms expose controls as named properties. Real Chromium, unlike
  // the isolated DOM fixture, can shadow these methods with innocent field
  // names. The transport must call native methods and recognize the form.
  before = postRequests.length;
  await name.fill('Named fields remain safe');
  await page.evaluate(() => {
    const form = document.getElementById('profile-editor');
    const button = document.getElementById('save-profile').querySelector('button');
    for (const name of ['closest', 'getAttribute', 'setAttribute', 'removeAttribute', 'matches', 'querySelector', 'form']) {
      const field = document.createElement('input');
      field.type = 'hidden'; field.name = name; field.value = 'ordinary field value';
      form.appendChild(field);
    }
    // Playwright's selector evaluator itself uses element.matches. Submit via
    // the native API until the server replacement removes the named controls.
    HTMLFormElement.prototype.requestSubmit.call(form, button);
  });
  await page.waitForFunction(() => document.querySelector('#profile-result')?.textContent.includes('Saved Named fields remain safe.'));
  assert.match(await result.innerText(), /Save #9\./, 'named properties do not interfere with native form submission');
  assert.equal(postRequests.length, before + 1, 'clobbering regression submits exactly once');
  assert.deepEqual(errors, [], 'named fields cause no browser errors');
  await page.waitForFunction(() => window.lottie.getRegisteredAnimations().length === 1);
  checkpoint('validated atomic file activation and stale-page protection');
  const oldRevision = await page.locator('[data-sdui-screen]').getAttribute('data-sdui-revision');
  await name.fill('Unsaved draft survives activation');
  await writeFile(schemaPath, '{"version":"unsupported","root":{}}');
  await eventually(() => output.includes('rejected'), 'invalid file update was not rejected');
  const unchanged = await context.request.get(origin);
  assert.equal(unchanged.headers()['x-sdui-revision'], oldRevision);
  const candidate = structuredClone(initialSchema);
  candidate.root.children.unshift({id:'live-version',type:'text',props:{text:'Validated replacement is active'}});
  await writeFile(schemaPath, JSON.stringify(candidate));
  await eventually(async () => (await context.request.get(origin)).headers()['x-sdui-revision'] !== oldRevision,
    'valid file update did not activate');
  await submit.click();
  await page.waitForFunction(() => window.sduiResults.some(item => item.type === 'sdui:stale'));
  assert.equal(await name.inputValue(), 'Unsaved draft survives activation');
  assert.equal(await page.locator('#live-version').count(), 0, 'stale page remains unchanged');
  assert.equal(await page.locator('[data-sdui-screen]').getAttribute('data-sdui-revision'), oldRevision);
  await page.reload({waitUntil:'networkidle'}); await ready();
  assert.equal(await page.locator('#live-version').innerText(), 'Validated replacement is active');
  assert.match(await result.innerText(), /Save #9\./, 'stale action did not mutate business state');
  await name.fill('After validated replacement'); await submit.click();
  await page.waitForFunction(() => document.querySelector('#profile-result')?.textContent.includes('Saved After validated replacement.'));
  assert.match(await result.innerText(), /Save #10\./);
  assert.deepEqual(errors, []);
  // Exercise native CompressionStream against the real Go decoder. An empty
  // file input is still a File in FormData, so disable it for this text-only
  // action. The extra repeated tag verifies decoded values reach the action.
  checkpoint('native request compression roundtrip');
  const publicTag = 'public-example-✓-'.repeat(4);
  const publicPadding = 'ordinary public test data '.repeat(256);
  await name.fill('Compressed browser submission');
  const compressionCSRF = await page.locator('[data-sdui-screen]').getAttribute('data-sdui-csrf');
  await page.evaluate(({tag, padding}) => {
    const form = document.getElementById('profile-editor');
    form.querySelector('input[type="file"]').disabled = true;
    const field = document.createElement('input');
    field.type = 'hidden'; field.name = 'tag'; field.value = tag;
    form.appendChild(field);
    const extra = document.createElement('input');
    extra.type = 'hidden'; extra.name = 'public-padding'; extra.value = padding;
    form.appendChild(extra);
  }, {tag: publicTag, padding: publicPadding});
  before = postRequests.length;
  const compressedRequestPromise = page.waitForRequest(request => request.method() === 'POST');
  await submit.click();
  const compressedRequest = await compressedRequestPromise;
  const compressionHeaders = await compressedRequest.allHeaders();
  assert(['gzip', 'zstd'].includes(compressionHeaders['content-encoding']), 'native browser compresses eligible text action');
  assert.match(compressionHeaders['content-type'], /^application\/x-www-form-urlencoded/i);
  assert.equal(compressionHeaders['x-sdui-csrf'], compressionCSRF, 'CSRF is sent in its dedicated header');
  const compressedBytes = compressedRequest.postDataBuffer();
  assert(compressedBytes && compressedBytes.length < Buffer.byteLength(publicPadding), 'wire body is smaller than plain public data');
  const decodedFields = await page.evaluate(async ({bytes, encoding}) => {
    const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream(encoding));
    const values = new URLSearchParams(await new Response(stream).text());
    return {csrfPresent: values.has('_csrf'), tags: values.getAll('tag'), name: values.get('name'), padding: values.get('public-padding')};
  }, {bytes: [...compressedBytes], encoding: compressionHeaders['content-encoding']});
  assert.equal(decodedFields.csrfPresent, false, 'CSRF secret is absent from compressed input');
  assert.deepEqual(decodedFields.tags, ['go', 'hypermedia', publicTag], 'compression preserves repeated Unicode values');
  assert.equal(decodedFields.name, 'Compressed browser submission');
  assert.equal(decodedFields.padding, publicPadding);
  await page.waitForFunction(() => document.querySelector('#profile-result')?.textContent.includes('Saved Compressed browser submission.'));
  await ready();
  assert.match(await result.innerText(), /Save #11\./, 'Go decodes and commits compressed browser input');
  assert.equal(await page.locator('#tags-result').innerText(), `Repeated fields: go, hypermedia, ${publicTag}`);
  assert.equal(postRequests.length, before + 1, 'compression sends exactly one action request');
  assert.deepEqual(errors, []);
  if (process.env.SDUI_SCREENSHOT) await page.screenshot({path: process.env.SDUI_SCREENSHOT, fullPage: true});
  console.log('SDUI browser checks passed: real Go server, selective bundled assets, validation, FormData/files/repeated fields/submitter, advanced changes, repeated swaps and cleanup, focus, duplicate suppression, late-response race, Back/Forward, named-field clobbering, auth/CSRF, idempotent replay, compressed static assets and native request compression.');
} catch (error) {
  // Print the primary failure before cleanup can close a pending request. Every
  // asynchronous route path catches its own failure, so diagnostics cannot be
  // replaced by an unhandled teardown rejection.
  console.error(`[sdui] FAILED during ${phase}:`, error);
  console.error('[sdui] diagnostics:', JSON.stringify({
    phase, errors, posts: postRequests.length,
    failedAssets: assetResponses.filter(response => response.status !== 200),
    serverOutput: output.slice(-4000),
  }));
  if (page && !page.isClosed()) {
    const state = await page.evaluate(() => ({
      url: location.href, results: window.sduiResults, swaps: window.sduiSwaps,
      elyErrors: window.elyErrors, body: document.body?.innerText.slice(0, 3000),
    })).catch(error => ({diagnosticError: String(error)}));
    console.error('[sdui] browser state:', JSON.stringify(state));
  }
  throw error;
} finally {
  releaseHeldResponse();
  await rm(schemaDirectory, {recursive:true, force:true});
  await browser?.close().catch(error => console.error('[sdui] browser cleanup:', String(error)));
  if (child.pid && child.exitCode === null) {
    try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); }
    catch (error) { if (error.code !== 'ESRCH') console.error('[sdui] server cleanup:', String(error)); }
  }
}
