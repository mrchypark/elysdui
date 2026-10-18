import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import {chromium} from 'playwright';

// Real Go rendering + local HTTP + actual bundled HTMX. No production routes,
// external services, installed browser extensions or caller data are involved.
const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const temp = await mkdtemp(join(tmpdir(), 'ely-family-assets-'));
let browser, server;
try {
  const generator = join(temp, 'main.go');
  await writeFile(generator, `package main
import (
  "bytes"
  "encoding/json"
  "os"
  ui "github.com/mrchypark/elysdui/ui/gohtmx"
)
func main() {
  tpl, err := ui.NewTemplates(); if err != nil { panic(err) }
  render := func(name string, value any) string {
    var out bytes.Buffer
    if err := tpl.ExecuteTemplate(&out, name, value); err != nil { panic(err) }
    return out.String()
  }
  body := func(prefix string, mixed bool) string {
    components := []ui.Component{
      {Chapter:"documents", Name:"MarkdownRenderer", ID:prefix+"-document", Props:map[string]any{"Value":"# Selective asset fixture"}},
      {Chapter:"canvas", Name:"ColorPanel", ID:prefix+"-color", Props:map[string]any{"CanvasScene":map[string]any{"style":map[string]any{"color":"#123456","start":"#123456","end":"#abcdef"}}}},
    }
    if mixed { components = append(components, ui.Component{Chapter:"typography", Name:"Label", ID:prefix+"-label", Props:map[string]any{"Label":"Foundation fixture"}}) }
    var out bytes.Buffer
    for _, component := range components {
      if err := ui.RenderComponent(tpl, &out, component); err != nil { panic(err) }
    }
    return out.String()
  }
  fixtures := map[string]string{
    "common":render("ui-component-assets", nil), "all":render("ui-advanced-assets", nil),
    "workspace":render("ui-advanced-family-assets", "workspace"),
    "forms":render("ui-advanced-family-assets", "forms"),
    "foundation":render("ui-advanced-family-assets", "foundation"),
    "body":body("main", false), "fragment":body("swapped", false),
    "mixedBody":body("main", true), "mixedFragment":body("swapped", true),
  }
  if err := json.NewEncoder(os.Stdout).Encode(fixtures); err != nil { panic(err) }
}
`);
  const generated = spawnSync('go', ['run', generator], {cwd: repo, encoding: 'utf8'});
  assert.equal(generated.status, 0, generated.stderr || 'Go fixture rendering failed');
  const fixtures = JSON.parse(generated.stdout);
  const mime = {'.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.woff2':'font/woff2', '.png':'image/png', '.jpg':'image/jpeg'};
  server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, 'http://localhost');
      response.setHeader('Cache-Control', 'no-store');
      if (url.pathname.startsWith('/assets/')) {
        const root = resolve(repo, 'ui/gohtmx/assets');
        const path = resolve(root, decodeURIComponent(url.pathname.slice('/assets/'.length)));
        if (!path.startsWith(root + sep)) { response.writeHead(403).end(); return; }
        response.setHeader('Content-Type', mime[extname(path)] || 'application/octet-stream');
        response.end(await readFile(path));
        return;
      }
      if (url.pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
      if (!['/', '/fragment'].includes(url.pathname)) { response.writeHead(404).end(); return; }
      const mode = url.searchParams.get('mode') || 'selective';
      const mixed = ['mixed', 'all'].includes(mode);
      response.setHeader('Content-Type', 'text/html; charset=utf-8');
      if (url.pathname === '/fragment') { response.end(fixtures[mixed ? 'mixedFragment' : 'fragment']); return; }
      let head = fixtures.workspace;
      if (mode === 'legacy') head = head.replace('ely-api-workspace-entry.js', 'ely-api-all.js');
      if (mode === 'mixed') head += fixtures.workspace + fixtures.forms + fixtures.foundation;
      if (mode === 'all') head = fixtures.all;
      response.end(`<!doctype html><html><head><meta charset="utf-8"><title>Family assets ${mode}</title>
        <script>window.assetErrors=[];document.addEventListener('ely:error',e=>assetErrors.push(String(e.detail.error)));window.assetActions=[];document.addEventListener('ely:action',e=>assetActions.push({id:e.detail.id,action:e.detail.action}));</script>
        <link rel="stylesheet" href="/assets/app.css">${fixtures.common}${head}<script src="/assets/htmx.min.js" defer></script>
        </head><body>${fixtures[mixed ? 'mixedBody' : 'body']}
        <button id="swap" hx-get="/fragment?mode=${mode}" hx-target="#swapped" hx-swap="innerHTML">Insert fragment</button>
        <div id="swapped"></div></body></html>`);
    } catch (error) {
      response.writeHead(500).end(String(error));
    }
  });
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch();

  async function graph(entry, seen = new Set()) {
    if (seen.has(entry)) return seen;
    seen.add(entry);
    const source = await readFile(join(repo, 'ui/gohtmx/assets', entry), 'utf8');
    for (const match of source.matchAll(/^import\s+(?:[^'"\n]*?\s+from\s+)?['"]\.\/([^'"]+)['"];?/gm)) await graph(match[1], seen);
    return seen;
  }
  const all = await graph('ely-api-all.js');
  const candidates = new Set([...all, 'ely-api-workspace-entry.js', 'ely-api-forms-entry.js', 'ely-api-foundation-entry.js']);
  const report = [];
  async function check(mode) {
    // Fresh context + disabled cache for every sample, with identical viewport,
    // same-origin server, compression policy, assets and fixture for before/after.
    const context = await browser.newContext({viewport:{width:1280,height:900}, serviceWorkers:'block'});
    try {
      const page = await context.newPage();
      const cdp = await context.newCDPSession(page);
      await cdp.send('Network.enable');
      await cdp.send('Network.setCacheDisabled', {cacheDisabled:true});
      const errors = [], requests = [];
      page.on('pageerror', error => errors.push(String(error)));
      page.on('request', request => requests.push(new URL(request.url()).pathname));
      page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
      await page.goto(`${origin}/?mode=${mode}`, {waitUntil:'networkidle'});
      await page.waitForFunction(() => [...document.querySelectorAll('[data-ely-family]')].every(root => root.dataset.elyReady === 'true'));
      assert.equal(await page.locator('#main-color-fill').getAttribute('data-ely-ready'), 'true', 'workspace loads nested forms');
      assert.equal(await page.locator('#main-color-gradient').getAttribute('data-ely-ready'), 'true', 'workspace loads gradient forms');
      const initialRequests = requests.slice();
      const expected = mode === 'legacy' || mode === 'all' ? all : await graph('ely-api-workspace-entry.js');
      if (mode === 'mixed') {
        await graph('ely-api-forms-entry.js', expected);
        await graph('ely-api-foundation-entry.js', expected);
      }
      const requestedModules = initialRequests.filter(path => candidates.has(path.slice('/assets/'.length))).map(path => path.slice('/assets/'.length));
      // ui-component-assets also loads patterns as a classic script in every mode.
      const expectedScriptURLs = new Set([...expected, 'ely-patterns.js']);
      assert.deepEqual([...new Set(requestedModules)].sort(), [...expectedScriptURLs].sort(), `${mode}: no missing or unrelated family/support scripts`);
      assert.equal(initialRequests.filter(path => path === '/assets/ely-api.js').length, 1, `${mode}: one shared runtime request`);
      for (const family of ['workspace', 'forms', 'foundation']) {
        assert(initialRequests.filter(path => path === `/assets/ely-api-${family}.js`).length <= 1, `${mode}: family registration module requested once`);
        assert(initialRequests.filter(path => path === `/assets/ely-api-${family}-entry.js`).length <= 1, `${mode}: repeated entrypoint requested once`);
      }
      const metrics = await page.evaluate(() => {
        const navigation = performance.getEntriesByType('navigation')[0];
        const resources = performance.getEntriesByType('resource');
        const entries = [navigation, ...resources];
        const total = key => entries.reduce((sum, entry) => sum + (entry[key] || 0), 0);
        return {
          transferBytes:total('transferSize'), encodedBodyBytes:total('encodedBodySize'), decodedBodyBytes:total('decodedBodySize'),
          domContentLoadedMs:navigation.domContentLoadedEventEnd, loadMs:navigation.loadEventEnd,
        };
      });
      report.push({mode, requestCount:initialRequests.length, staticModuleURLs:[...expected].sort(), observedFamilySupportScriptURLs:[...new Set(requestedModules)].sort(), requests:initialRequests, ...metrics});
      await page.locator('#main-color-fill [data-ely-color-hex]').fill('#654321');
      assert.equal(await page.locator('#main-color-fill [data-ely-color]').inputValue(), '#654321', `${mode}: nested form behavior is active`);
      async function clickProbe(prefix) {
        await page.evaluate(prefix => {
          const button = document.createElement('button');
          button.id = prefix + '-probe'; button.type = 'button'; button.dataset.elyAction = 'probe'; button.textContent = 'Probe';
          document.getElementById(prefix + '-document').append(button);
        }, prefix);
        await page.locator(`#${prefix}-probe`).click();
        const actions = await page.evaluate(prefix => assetActions.filter(action => action.id === prefix + '-document' && action.action === 'probe').length, prefix);
        assert.equal(actions, 1, `${mode}: one action for a single click after ${prefix} mount`);
      }
      await clickProbe('main');
      await page.locator('#swap').click();
      await page.waitForSelector('#swapped-color-gradient[data-ely-ready="true"]');
      await page.waitForSelector('#swapped-document[data-ely-ready="true"]');
      await clickProbe('swapped');
      await page.locator('#swapped-color-fill [data-ely-color-hex]').fill('#abcdef');
      assert.equal(await page.locator('#swapped-color-fill [data-ely-color]').inputValue(), '#abcdef', `${mode}: HTMX-inserted nested forms work`);
      // Replace the same IDs a second time and prove the detached instance was cleaned.
      await page.evaluate(() => {
        window.oldRoot = document.getElementById('swapped-document'); window.detachedActions = 0; window.cleanups = 0;
        oldRoot.addEventListener('ely:cleanup', () => cleanups++);
        oldRoot.addEventListener('ely:action', () => detachedActions++);
      });
      await page.locator('#swap').click();
      await page.waitForFunction(() => cleanups === 1 && document.getElementById('swapped-document') !== oldRoot && document.getElementById('swapped-document')?.dataset.elyReady === 'true');
      await page.evaluate(() => oldRoot.querySelector('[data-ely-action="probe"]').click());
      assert.equal(await page.evaluate(() => detachedActions), 0, `${mode}: detached root no longer dispatches actions`);
      assert.deepEqual(await page.evaluate(() => assetErrors), [], `${mode}: no Ely initialization errors`);
      assert.deepEqual(errors, [], `${mode}: no JavaScript or HTTP failures`);
    } finally { await context.close(); }
  }
  // Alternate before/after to reduce order bias. These are synthetic local
  // samples, not representative production/user performance benchmarks.
  for (let sample = 0; sample < 3; sample++) {
    for (const mode of sample % 2 ? ['selective', 'legacy'] : ['legacy', 'selective']) await check(mode);
  }
  await check('mixed');
  await check('all');
  console.log('Family assets browser checks passed: network isolation, cross-family forms, repeated helpers, all-loader, initial mount and repeated HTMX swaps.');
  console.log('MEASURED SYNTHETIC LOCAL COLD-CACHE SAMPLES; not a production/user benchmark. Legacy and selective samples use the same rendered workspace fixture and CSS, differing only in the module entrypoint.');
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  if (server?.listening) await new Promise(resolve => server.close(resolve));
  await rm(temp, {recursive:true, force:true});
}
