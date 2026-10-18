import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, readFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {checkEveryGalleryPage} from '../../../../scripts/gallery-complete-checks.mjs';

// Exercise the same visual catalogue against the real Go server or its export:
//   node ui/gohtmx/tests/browser/gallery-browser-test.mjs
//   GALLERY_STATIC=1 node ui/gohtmx/tests/browser/gallery-browser-test.mjs
// Static mode expects scripts/build-pages.sh output in dist unless overridden.
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const staticMode = process.env.GALLERY_STATIC === '1';
const base = staticMode ? '/elysdui/go-htmx/' : '/';
const output = resolve(repo, 'test-results/gallery');
const mode = staticMode ? 'static' : 'live';
const errors = [], badRequests = [];
let server, child, browser, page, serverOutput = '', startupError, phase = 'start server';
const checkpoint = value => { phase = value; console.log(`[gallery ${mode}] ${value}`); };

async function eventually(check, message, timeout = 15_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await delay(30);
  }
  throw new Error(message);
}

async function listen(server) {
  await new Promise((accept, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', accept);
  });
  return server.address().port;
}

try {
  let port;
  if (staticMode) {
    const root = resolve(repo, process.env.GALLERY_STATIC_DIR || 'dist/go-htmx');
    await readFile(resolve(root, 'index.html')); // Fail clearly before launching Chromium.
    const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm', '.wav': 'audio/wav', '.mp4': 'video/mp4'};
    server = createServer(async (request, response) => {
      try {
        let pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
        if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
        if (!pathname.startsWith(base)) { response.writeHead(404).end(); return; }
        pathname = pathname.slice(base.length);
        if (!pathname || pathname.endsWith('/')) pathname += 'index.html';
        const file = resolve(root, pathname);
        if (!file.startsWith(root + sep)) { response.writeHead(403).end(); return; }
        const data = await readFile(file);
        response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
        response.setHeader('Cache-Control', 'no-store');
        response.end(data);
      } catch {
        response.writeHead(404).end();
      }
    });
    port = await listen(server);
  } else {
    const reservation = createServer();
    port = await listen(reservation);
    await new Promise(resolve => reservation.close(resolve));
    child = spawn('go', ['run', './examples/gohtmx/gallery', '-addr', `127.0.0.1:${port}`], {
      cwd: repo, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => { serverOutput += chunk; });
    child.stderr.on('data', chunk => { serverOutput += chunk; });
    child.once('error', error => { startupError = error; });
  }
  const origin = `http://127.0.0.1:${port}`;
  const index = origin + (staticMode ? base : '/components');
  await eventually(async () => {
    if (startupError) throw startupError;
    if (child && child.exitCode !== null) throw new Error(`Gallery exited: ${serverOutput}`);
    try { return (await fetch(index)).ok; } catch { return false; }
  }, 'Gallery did not start within 120 seconds', 120_000);
  browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  const context = await browser.newContext({viewport: {width: 1440, height: 1000}});
  await context.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(origin + base)) return route.continue();
    badRequests.push(`Unexpected request: ${url}`);
    return route.abort();
  });
  page = await context.newPage();
  page.on('pageerror', error => errors.push(String(error)));
  page.on('response', response => {
    if (response.status() >= 400) badRequests.push(`${response.status()} ${response.url()}`);
  });
  await mkdir(output, {recursive: true});
  const cards = () => page.locator('[data-gallery-card]:visible');
  const query = () => page.locator('#component-query');
  const category = () => page.locator('#gallery-category');
  const assertNoOverflow = async label => {
    const size = await page.evaluate(() => ({viewport: innerWidth, scroll: document.documentElement.scrollWidth}));
    assert(size.scroll <= size.viewport + 2, `${label} overflows horizontally: ${JSON.stringify(size)}`);
  };

  checkpoint('visual catalogue and prominent playground entry points');
  await page.goto(index, {waitUntil: 'networkidle'});
  const storyURLs = await page.locator('.chapter-stories a').evaluateAll(nodes => nodes.map(node => node.href));
  assert.equal(await page.locator('html').getAttribute('lang'), 'en', 'gallery defaults to English');
  assert.equal(await cards().count(), 44, 'all 44 component categories are browsable');
  assert.equal(await page.locator('.chapter-stories a').count(), 624, 'every component story has a link');
  assert.equal(await page.locator('[data-gallery-card] .gallery-preview[inert]').count(), 44, 'thumbnail controls do not intercept gallery navigation');
  for (const card of await page.locator('[data-gallery-card]').all()) {
    assert(await card.locator('.gallery-preview [data-ui-component], .gallery-preview [data-ely-kind], .gallery-preview [data-slot]').count() > 0, `rendered preview missing for ${await card.getAttribute('data-category')}`);
  }
  assert.equal(await page.locator('[data-gallery-examples][open]').count(), 0, 'long example lists start collapsed');
  assert((await page.locator('#gallery-results').innerText()).trim(), 'result count is announced');
  const initialResults = await page.locator('#gallery-results').innerText();
  assert.equal(initialResults, '44 categories · 624 examples', 'result count uses English');
  const playgroundURL = origin + base + 'playground/';
  const navigationCTA = page.locator('.header-nav').getByRole('link', {name: 'Playground', exact: true});
  const heroCTA = page.locator('.gallery-hero').getByRole('link', {name: 'Open playground ↗', exact: true});
  assert.equal(await navigationCTA.evaluate(node => node.href), playgroundURL);
  assert.equal(await heroCTA.evaluate(node => node.href), playgroundURL);
  assert(await heroCTA.isVisible(), 'hero exposes the playground without opening a category');
  if (!staticMode) {
    const redirect = await fetch(playgroundURL, {redirect: 'manual'});
    assert.equal(redirect.status, 303, 'local playground entry redirects without fetching the external site');
    assert.equal(redirect.headers.get('location'), 'https://mrchypark.github.io/elysdui/go-htmx/playground/');
  } else {
    assert((await fetch(playgroundURL)).ok, 'exported playground target exists under the project base path');
  }
  await assertNoOverflow('Desktop catalogue');
  await page.screenshot({path: resolve(output, `${mode}-desktop.png`), fullPage: true});
  await page.screenshot({path: resolve(output, `${mode}-desktop-overview.png`)});
  const firstExamples = cards().first().locator('[data-gallery-examples]');
  await firstExamples.locator('summary').focus();
  await page.keyboard.press('Enter');
  await eventually(async () => await firstExamples.getAttribute('open') !== null, 'keyboard opens category examples');
  await page.keyboard.press('Enter');
  await eventually(async () => await firstExamples.getAttribute('open') === null, 'keyboard closes category examples');

  checkpoint('alias search, category intersection, empty state and reset');
  await query().fill('ClearableInput');
  await eventually(async () => await cards().count() === 1, 'alias search narrows to one category');
  assert.equal(await cards().first().getAttribute('data-category'), 'forms');
  assert.equal(await page.locator('#gallery-results').innerText(), '1 category · 1 example found', 'filtered counts use English singulars');
  const matchingStory = page.locator('.chapter-stories a[href*="input-textfield-clearableinput"]');
  assert.equal(await matchingStory.count(), 1, 'alias resolves to its shared story');
  assert.notEqual(await page.locator('#gallery-results').innerText(), initialResults, 'result status updates after filtering');
  await category().selectOption('buttons');
  await eventually(async () => await cards().count() === 0, 'category and alias filters combine');
  assert(await page.locator('#gallery-empty').isVisible(), 'zero results have an explicit empty state');
  assert.equal(await page.locator('#gallery-results').innerText(), '0 categories · 0 examples found');
  assert.equal(await page.locator('#gallery-empty h3').innerText(), 'No matching examples.');
  await page.locator('#gallery-reset').click();
  await eventually(async () => await cards().count() === 44, 'reset restores all categories');
  assert.equal(await query().inputValue(), '');
  assert.equal(await category().inputValue(), '');
  assert.equal(await page.locator('#gallery-empty').isVisible(), false);

  checkpoint('Unicode search survives a shared URL reload');
  await query().fill('가'.repeat(67));
  const unicodeResponse = await page.reload({waitUntil: 'networkidle'});
  assert.equal(unicodeResponse.status(), 200);
  assert.equal(await query().inputValue(), '가'.repeat(67));
  await page.locator('#gallery-reset').click();

  checkpoint('filtered URL, story navigation and browser back restoration');
  await category().selectOption('forms');
  await query().fill('ClearableInput');
  await eventually(async () => {
    const url = new URL(page.url());
    return url.searchParams.get('q') === 'ClearableInput' && url.searchParams.get('category') === 'forms';
  }, 'filter state is reflected in a shareable URL');
  await page.reload({waitUntil: 'networkidle'});
  assert.equal(await query().inputValue(), 'ClearableInput', 'reload restores query');
  assert.equal(await category().inputValue(), 'forms', 'reload restores category');
  assert.equal(await cards().count(), 1, 'reload applies restored filters');
  const examples = cards().first().locator('[data-gallery-examples]');
  if (await examples.getAttribute('open') === null) {
    await examples.locator('summary').focus();
    await page.keyboard.press('Enter');
  }
  await eventually(async () => await examples.getAttribute('open') !== null, 'keyboard opens matching examples');
  await page.locator('.chapter-stories a[href*="input-textfield-clearableinput"]').click();
  await page.waitForURL('**/components/forms/input-textfield-clearableinput' + (staticMode ? '/' : ''));
  assert(await page.locator('[data-demo-story="forms/input-textfield-clearableinput"]').isVisible(), 'real story page opens');
  await page.goBack({waitUntil: 'networkidle'});
  assert.equal(await query().inputValue(), 'ClearableInput', 'back restores query');
  assert.equal(await category().inputValue(), 'forms', 'back restores category');
  assert.equal(await cards().count(), 1, 'back restores filtered cards');
  await page.locator('#gallery-reset').click();
  await eventually(async () => await cards().count() === 44, 'reset still works after browser history navigation');

  checkpoint('390px and 320px galleries retain usable controls and no overflow');
  for (const width of [390, 320]) {
    await page.setViewportSize({width, height: 844});
    await assertNoOverflow(`${width}px catalogue`);
    assert(await heroCTA.isVisible(), `${width}px playground CTA remains visible`);
    await category().selectOption('forms');
    await query().fill('ClearableInput');
    await eventually(async () => await cards().count() === 1, `${width}px search remains usable`);
    await assertNoOverflow(`${width}px search results`);
    await page.locator('#gallery-reset').click();
    await eventually(async () => await cards().count() === 44, `${width}px reset restores gallery`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({path: resolve(output, `${mode}-mobile-${width}.png`), fullPage: true});
    await page.screenshot({path: resolve(output, `${mode}-mobile-${width}-overview.png`)});
  }
  checkpoint('English theme editor labels, validation, import errors and reset');
  await page.setViewportSize({width: 1440, height: 1000});
  await page.goto(origin + base + 'components/themes' + (staticMode ? '/' : ''), {waitUntil: 'networkidle'});
  assert.equal(await page.locator('html').getAttribute('lang'), 'en');
  assert.equal(await page.locator('h1').innerText(), 'Find your palette.');
  assert.equal(await page.locator('[data-theme-hex]').count(), 19, 'all color roles have editable controls');
  assert.equal(await page.locator('[data-theme-check]').innerText(), 'All 28 light and dark contrast checks passed');
  await page.getByLabel('Theme name', {exact: true}).fill('');
  assert.equal(await page.locator('[data-theme-check]').innerText(), 'A theme requires id, name, light, and dark.');
  assert(await page.getByRole('button', {name: 'Apply theme', exact: true}).isDisabled());
  await page.getByLabel('Theme name', {exact: true}).fill('Gallery preview');
  assert.equal(await page.getByRole('button', {name: 'Apply theme', exact: true}).isDisabled(), false);
  await page.getByLabel('Theme JSON', {exact: true}).fill('{invalid');
  await page.getByRole('button', {name: 'Import JSON', exact: true}).click();
  assert.equal(await page.locator('[data-theme-message]').innerText(), 'Import failed: Check that the JSON is valid.');
  await page.getByRole('button', {name: 'Restore default', exact: true}).click();
  assert.equal(await page.locator('[data-theme-message]').innerText(), 'Restored the default Ely Neutral theme.');
  assert.equal(await page.getByLabel('Theme name', {exact: true}).inputValue(), 'Ely Neutral');
  await assertNoOverflow('Desktop theme editor');
  await page.setViewportSize({width: 390, height: 844});
  await assertNoOverflow('390px theme editor');
  checkpoint('every exported page, every story runtime and every component/alias behavior check');
  await checkEveryGalleryPage({browser, origin, base, staticMode, storyURLs, output});
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  assert.deepEqual(badRequests, [], 'no failed, root-absolute static or external asset requests');
  console.log(`Gallery ${mode} browser checks passed: visual cards, aliases, categories, empty/reset, URL/history, story links, playground links, keyboard, responsive layouts and English theme editor.`);
} catch (error) {
  console.error('Gallery diagnostics', JSON.stringify({mode, phase, errors, badRequests, server: serverOutput.slice(-5000)}));
  if (page) await page.screenshot({path: resolve(output, `${mode}-failure.png`), fullPage: true}).catch(() => {});
  throw error;
} finally {
  await browser?.close();
  if (child?.pid && child.exitCode === null) {
    try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); } catch {}
  }
  if (server) await new Promise(resolve => server.close(resolve));
}
