import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const phase = process.env.DIALOG_REPAIR_PHASE || 'run';
const runId = new Date().toISOString().replaceAll(':', '').replaceAll('.', '');
// DIALOG_REPAIR_OUTPUT_DIR selects the output root; each run uses a new child directory.
const outputRoot = resolve(repo, process.env.DIALOG_REPAIR_OUTPUT_DIR || 'test-results');
const outputDir = resolve(outputRoot, `visual-state-audit-dialog-layout-${phase}-${runId}`);
const reportPath = resolve(outputDir, 'report.json');
const provenanceFiles = [
  'ui/gohtmx/assets/ely-api-interaction.css',
  'ui/gohtmx/assets/ely-api-interaction.js',
  'ui/gohtmx/templates/ely-api-interaction.html',
  'internal/gallery/advanced_interaction_fixtures.go',
  'go.mod',
  'go.sum',
  'ui/gohtmx/tests/browser/visual-state-audit-dialog-layout-test.mjs'
];
const portServer = createServer();
let child, browser, output = '', startupError;
const checks = [], captures = [], failures = [];

async function provenance() {
  const hashes = {};
  for (const path of provenanceFiles) {
    hashes[path] = createHash('sha256').update(await readFile(resolve(repo, path))).digest('hex');
  }
  const head = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'});
  const status = spawnSync('git', ['status', '--porcelain'], {cwd: repo, encoding: 'utf8'});
  return {
    gitHead: head.status === 0 ? head.stdout.trim() : null,
    worktreeStatusAvailable: status.status === 0,
    worktreeClean: status.status === 0 ? status.stdout.trim().length === 0 : null,
    sha256: hashes,
    sourceSetSha256: createHash('sha256').update(JSON.stringify(hashes)).digest('hex')
  };
}

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  return server.address().port;
}

async function eventually(check, message, timeout = 120_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (startupError) throw startupError;
    if (child?.exitCode !== null && child?.exitCode !== undefined) throw new Error(`${message}: ${output}`);
    if (await check()) return;
    await delay(40);
  }
  throw new Error(`${message}: ${output}`);
}

function record(id, ok, details) {
  checks.push({id, status: ok ? 'pass' : 'fail', details});
  if (!ok) failures.push({id, details});
}

function horizontalCenterError(box) {
  return Math.abs(box.x - (box.viewport.width - box.width) / 2);
}

function measureViewport() {
  const root = document.documentElement, style = getComputedStyle(root);
  // Root client dimensions may include a reserved gutter; measure the fixed containing block directly.
  const probe = document.createElement('div');
  probe.style.cssText = 'all:initial;position:fixed;inset:0;visibility:hidden;pointer-events:none';
  root.append(probe);
  const rect = probe.getBoundingClientRect();
  probe.remove();
  return {width:rect.width,height:rect.height,innerWidth,innerHeight,clientWidth:root.clientWidth,clientHeight:root.clientHeight,offsetWidth:root.offsetWidth,rootRectWidth:root.getBoundingClientRect().width,bodyRectWidth:document.body.getBoundingClientRect().width,rootWidth:style.width,rootPadding:style.padding,rootOverflow:style.overflow,rootGutter:style.scrollbarGutter};
}

if (process.env.DIALOG_GEOMETRY_SELF_CHECK === '1') {
  for (const [layoutWidth, width, x] of [[1440, 440, 500], [1425, 440, 492.5], [390, 390, 0], [375, 375, 0]]) {
    const box = {x, width, viewport: {width: layoutWidth}};
    assert.equal(horizontalCenterError(box), 0);
    assert(horizontalCenterError({...box, x: x + 2}) > 1.5, 'Off-center dialog must still fail');
  }
  assert.equal(horizontalCenterError({x: 492.5, width: 440, viewport: {width: 1440}}), 7.5, 'Inner width must not replace layout width with classic scrollbars');
  console.log('Dialog geometry: overlay/classic scrollbar layout widths and off-center rejection passed');
  process.exit(0);
}

async function inspectOpenDialog(page, theme, size, view) {
  const dialog = page.locator('[data-ely-component="overlays/Dialog"] dialog').first();
  const expected = await dialog.evaluate((node, layout) => {
    const r = node.getBoundingClientRect();
    return {
      x: r.x, y: r.y, width: r.width, height: r.height,
      right: r.right, bottom: r.bottom,
      viewport: {width: layout.width, height: layout.height},
      innerWidth,
      layoutDiagnostics: layout,
      title: node.querySelector('h2')?.textContent?.trim(),
      text: node.innerText,
      activeIsFirstInput: document.activeElement === node.querySelector('input'),
      open: node.open,
      computedMargin: getComputedStyle(node).margin,
      background: getComputedStyle(node).backgroundColor,
      color: getComputedStyle(node).color
    };
  }, await page.evaluate(measureViewport));
  const centerError = {
    x: horizontalCenterError(expected),
    y: Math.abs(expected.y - (expected.viewport.height - expected.height) / 2)
  };
  const centered = centerError.x <= 1.5 && centerError.y <= 1.5;
  const inside = expected.x >= -0.5 && expected.y >= -0.5 && expected.right <= expected.viewport.width + 0.5 && expected.bottom <= expected.viewport.height + 0.5;
  const visibleContent = expected.title === 'Edit profile' && expected.text.includes('How others see you across the workspace.') && expected.text.includes('Cancel') && expected.text.includes('Save');
  record(`${theme}/${size}.centered`, centered, {bounds: expected, centerError});
  record(`${theme}/${size}.in-viewport`, inside, {bounds: expected});
  record(`${theme}/${size}.content-and-focus`, visibleContent && expected.activeIsFirstInput && expected.open, {title: expected.title, activeIsFirstInput: expected.activeIsFirstInput, open: expected.open});
  const stem = `${phase}-${theme}-${size}`;
  const panelPath = resolve(outputDir, `${stem}-panel.png`);
  const viewportPath = resolve(outputDir, `${stem}-viewport.png`);
  await dialog.screenshot({path: panelPath, animations: 'disabled'});
  await page.screenshot({path: viewportPath, animations: 'disabled'});
  captures.push({caseId: 'interaction/overlays/Dialog', profile: {theme, viewport: expected.viewport}, state: 'open-before-cancel', reference: ['docs/gohtmx/advanced-interaction.md:187-189 (440px card and modal fixture variants)', 'native modal viewport-centering expectation; geometry calculated from measured box'], bounds: {x: expected.x, y: expected.y, width: expected.width, height: expected.height}, computedMargin: expected.computedMargin, computedBackground: expected.background, computedColor: expected.color, panel: panelPath, viewport: viewportPath});
  if (process.env.DIALOG_CLASSIC_SCROLLBAR === '1') {
    record(`${theme}/${size}.nonzero-classic-gutter`, expected.innerWidth - expected.viewport.width >= 14, expected.layoutDiagnostics);
    const shifted = await dialog.evaluate(node => {
      const before = node.getAttribute('style');
      node.style.transform = 'translateX(8px)';
      const r = node.getBoundingClientRect();
      if (before === null) node.removeAttribute('style'); else node.setAttribute('style', before);
      return {x:r.x,width:r.width};
    });
    record(`${theme}/${size}.rejects-off-center-control`, horizontalCenterError({...shifted,viewport:expected.viewport}) > 1.5, shifted);
  }
}

try {
  await mkdir(outputRoot, {recursive: true});
  await mkdir(outputDir, {recursive: false});
  const port = await listen(portServer);
  await new Promise(resolve => portServer.close(resolve));
  child = spawn('go', ['run', './examples/gohtmx/gallery', '-addr', `127.0.0.1:${port}`], {cwd: repo, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']});
  child.stdout.on('data', chunk => { output += chunk; });
  child.stderr.on('data', chunk => { output += chunk; });
  child.once('error', error => { startupError = error; });
  const origin = `http://127.0.0.1:${port}`;
  await eventually(async () => { try { return (await fetch(`${origin}/components/audit?family=interaction`)).ok; } catch { return false; } }, 'own gallery server did not become ready');
  browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined, ...(process.env.DIALOG_CLASSIC_SCROLLBAR === '1' ? {ignoreDefaultArgs: ['--hide-scrollbars']} : {})});

  for (const theme of ['light', 'dark']) {
    const context = await browser.newContext({viewport: {width: 1440, height: 1000}, colorScheme: theme});
    const page = await context.newPage();
    const pageErrors = [];
    page.on('pageerror', error => pageErrors.push(String(error)));
    await page.goto(`${origin}/components/audit?family=interaction`, {waitUntil: 'domcontentloaded'});
    if (process.env.DIALOG_CLASSIC_SCROLLBAR === '1') await page.evaluate(() => {
      const sheet = new CSSStyleSheet();
      sheet.replaceSync('::-webkit-scrollbar{width:15px;height:15px}');
      document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    });
    const beforeModal = await page.evaluate(measureViewport);
    record(`${theme}/before-modal-layout`, beforeModal.width > 0 && beforeModal.height > 0 && Math.abs(beforeModal.width - beforeModal.rootRectWidth) <= 1.5, beforeModal);
    await page.waitForFunction(theme => document.documentElement.dataset.theme === theme, theme);
    const root = page.locator('[data-ely-family="interaction"][data-ely-component="overlays/Dialog"]').first();
    await root.waitFor({state: 'visible'});
    const opener = root.locator('[data-interaction-dialog]').first();
    await opener.scrollIntoViewIfNeeded();
    await page.evaluate(() => { window.__dialogRepairActions = []; document.addEventListener('ely:action', e => window.__dialogRepairActions.push(e.detail)); });
    await opener.click();
    const dialog = root.locator('dialog').first();
    await dialog.waitFor({state: 'visible'});
    await page.waitForFunction(() => document.activeElement?.matches('[data-ely-component="overlays/Dialog"] dialog input'));
    await inspectOpenDialog(page, theme, 'desktop-1440x1000', 'before-cancel');

    await page.setViewportSize({width: 390, height: 844});
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await inspectOpenDialog(page, theme, 'resized-mobile-390x844', 'before-cancel');
    await dialog.locator('[data-interaction-close]').filter({hasText: 'Cancel'}).click();
    await page.waitForFunction(() => !document.querySelector('[data-ely-component="overlays/Dialog"] dialog').open);
    const cancel = await page.evaluate(() => ({actions: window.__dialogRepairActions, openerFocused: document.activeElement === document.querySelector('[data-ely-component="overlays/Dialog"] [data-interaction-dialog]')}));
    record(`${theme}/cancel-no-action-payload-and-focus-restore`, cancel.actions.length === 0 && cancel.openerFocused, cancel);

    const sheetRoot = page.locator('[data-ely-family="interaction"][data-ely-component="buttons/ActionSheet"]').first();
    await sheetRoot.locator('[data-interaction-dialog]').first().click();
    const sheet = sheetRoot.locator('dialog.is-sheet');
    await sheet.waitFor({state: 'visible'});
    const sheetBox = await sheet.evaluate((node,layout) => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height,bottom:r.bottom,viewport:{width:layout.width,height:layout.height},layoutDiagnostics:layout}; },await page.evaluate(measureViewport));
    record(`${theme}/sheet-remains-bottom-centered`, Math.abs(sheetBox.bottom - sheetBox.viewport.height) <= 1.5 && horizontalCenterError(sheetBox) <= 1.5, sheetBox);
    await sheet.locator('[data-interaction-close]').last().click();
    await page.waitForFunction(() => !document.querySelector('[data-ely-component="buttons/ActionSheet"] dialog').open);

    const popoverRoot = page.locator('[data-ely-family="interaction"][data-ely-component="overlays/Popover"]').first();
    const popoverTrigger = popoverRoot.locator('[data-interaction-menu]').first();
    await popoverTrigger.scrollIntoViewIfNeeded();
    await popoverTrigger.click();
    const popover = popoverRoot.locator('[data-interaction-popover]').first();
    await popover.waitFor({state: 'visible'});
    const popoverBox = await popover.evaluate(node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height,viewport:{width:innerWidth,height:innerHeight}}; });
    record(`${theme}/popover-remains-in-viewport`, popoverBox.x >= 0 && popoverBox.y >= 0 && popoverBox.right <= 390 && popoverBox.bottom <= 844, popoverBox);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !document.querySelector('[data-ely-component="overlays/Popover"] [data-interaction-popover]:not([hidden])'));
    record(`${theme}/no-page-errors`, pageErrors.length === 0, pageErrors);
    await context.close();
  }

  const source = await provenance();
  const report = {schemaVersion: 1, suite: 'visual-state-audit-dialog-layout', phase, sourceRevision: source.worktreeClean ? source.gitHead : null, provenance: source, outputDir, status: failures.length ? 'failed' : 'passed', expectedDialogSize: '440px desktop; viewport-constrained at mobile', viewportProfiles: [{width:1440,height:1000},{width:390,height:844}], themes: ['light','dark'], checks, captures, failures, server: 'own temporary Go gallery process; loopback ephemeral port; stopped in finally'};
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, {flag: 'wx'});
  console.log(JSON.stringify({reportPath,status:report.status,checkCount:checks.length,captureCount:captures.length,failures}, null, 2));
  if (failures.length) process.exitCode = 1;
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (child && child.pid && child.exitCode === null) {
    try { process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM'); } catch {}
    await new Promise(resolve => { const timeout = setTimeout(resolve, 3000); child.once('close', () => { clearTimeout(timeout); resolve(); }); });
    if (child.exitCode === null && process.platform !== 'win32') { try { process.kill(-child.pid, 'SIGKILL'); } catch {} }
  }
}
