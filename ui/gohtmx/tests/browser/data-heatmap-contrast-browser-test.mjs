import assert from 'node:assert/strict';
import {readFile, mkdir, mkdtemp, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {execFileSync} from 'node:child_process';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['ui/gohtmx/assets/app.css', 'ui/gohtmx/assets/ely-api.css', 'ui/gohtmx/assets/ely-api-data.css'];
const sources = await Promise.all(paths.map(path => readFile(join(repo, path), 'utf8')));
const currentHashes = Object.fromEntries(paths.map((path, i) => [path, hash(sources[i])]));
const baseline = process.env.DATA_HEATMAP_BASELINE;
if (baseline) sources[2] = execFileSync('git', ['show', `${baseline}:${paths[2]}`], {cwd: repo, encoding: 'utf8'});
const linear = value => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4;
const luminance = rgb => rgb.reduce((sum, value, i) => sum + linear(value) * [.2126, .7152, .0722][i], 0);
const contrast = (a, b) => (Math.max(luminance(a), luminance(b)) + .05) / (Math.min(luminance(a), luminance(b)) + .05);
// The numerical check can run without opening a browser during a capture hold.
assert(contrast([27.75/255,27.75/255,27.75/255], [135.88/255,134.92/255,134.44/255]) >= 4.5);
if (process.argv.includes('--unit')) {
  assert.equal(contrast([0,0,0], [1,1,1]), 21);
  assert.equal(contrast([.5,.5,.5], [.5,.5,.5]), 1);
  console.log('contrast math unit checks passed; no browser started');
  process.exit(0);
}
const outputRoot = resolve(process.env.DATA_HEATMAP_OUTPUT || join(repo, 'test-results/data-heatmap-contrast'));
await mkdir(outputRoot, {recursive: true});
const output = await mkdtemp(join(outputRoot, 'contrast-'));
const report = {evidenceKind: 'controlled CSS matrix; handbuilt numeric cells, not actual component rendering or alias identity proof', node: process.version, revision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(), control: baseline ? {kind: 'historical-data-CSS-only; current controlled cells and other CSS, not historical whole-app execution', revision: baseline} : null, sourceHashes: Object.fromEntries(paths.map((path, i) => [path, hash(sources[i])])), checks: [], cleanup: false};
let browser;
try {
  browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  for (const width of [1440, 390]) for (const theme of ['light', 'dark']) {
    const page = await browser.newPage({viewport: {width, height: 900}});
    const errors = [];
    page.on('pageerror', error => errors.push(String(error)));
    // Exercise actual shared CSS without altering gallery fixtures or intensity values.
    const names = ['charts/HeatmapChart', 'charts/CalendarHeatmap', 'tables/HeatmapTable'];
    await page.setContent(`<html data-theme="${theme}"><head><style>${sources.join('\n')}</style></head><body>${names.map(name => `<section data-ely-family="data" data-case="${name}"><h2>${name}</h2>${name.startsWith('tables/') ? `<div class="ely-data__heatmap-table"><table><tbody><tr>${[135,123,157,19,12].map((value, i) => `<td role="gridcell" data-level="${i+1}">${value}</td>`).join('')}</tr></tbody></table></div>` : `<div class="ely-data__heatmap">${[5,12,19,135,157].map((value, i) => `<span data-level="${i+1}">${value}</span>`).join('')}</div>`}</section>`).join('')}</body></html>`);
    for (const name of names) {
      const root = page.locator(`[data-case="${name}"]`);
      const cells = await root.locator('[data-level]').evaluateAll(nodes => nodes.map(node => {
        const style = getComputedStyle(node);
        // Canvas resolves color(srgb ...) and rgb(...) identically, without rounding to bytes.
        const rgb = color => {
          const canvas = document.createElement('canvas'); canvas.width = canvas.height = 1;
          const ctx = canvas.getContext('2d'); ctx.fillStyle = color; ctx.fillRect(0,0,1,1);
          return Array.from(ctx.getImageData(0,0,1,1).data).slice(0,3).map(value => value/255);
        };
        return {level: node.dataset.level, value: node.textContent, foreground: style.color, background: style.backgroundColor, fg: rgb(style.color), bg: rgb(style.backgroundColor)};
      }));
      assert.equal(cells.length, 5);
      const png = `${theme}-${width}-${name.replaceAll('/', '-')}.png`;
      await root.screenshot({path: join(output, png)});
      const check = {name, theme, width, cells: cells.map(cell => ({...cell, contrast: contrast(cell.fg, cell.bg)})), png, pngSHA256: hash(await readFile(join(output, png)))};
      report.checks.push(check);
      assert.deepEqual(cells.map(cell => cell.value), name.startsWith('tables/') ? ['135','123','157','19','12'] : ['5','12','19','135','157']);
    }
    const custom = await page.evaluate(() => {
      const root = document.querySelector('[data-case]');
      root.style.setProperty('--foreground', 'rgb(1, 2, 3)');
      root.style.color = 'rgb(4, 5, 6)';
      const unknown = document.createElement('span'); unknown.dataset.level = 'unknown'; root.querySelector('.ely-data__heatmap').append(unknown);
      return {supported: getComputedStyle(root.querySelector('[data-level="1"]')).color, unknown: getComputedStyle(unknown).color};
    });
    if (!baseline) assert.deepEqual(custom, {supported: 'rgb(1, 2, 3)', unknown: 'rgb(4, 5, 6)'}, 'custom foreground and unknown-level inheritance');
    await page.emulateMedia({forcedColors: 'active'});
    const forced = await page.locator('[data-case]').first().locator('[data-level="3"]').evaluate(node => {
      const probe = document.createElement('span'); probe.style.color = 'CanvasText'; document.body.append(probe);
      const result = {actual: getComputedStyle(node).color, expected: getComputedStyle(probe).color, adjustment: getComputedStyle(node).forcedColorAdjust}; probe.remove(); return result;
    });
    assert.equal(forced.actual, forced.expected, 'forced-colors uses system text');
    assert.equal(forced.adjustment, 'auto', 'do not disable user forced colors');
    report.checks.push({theme, width, custom, forced});
    assert.deepEqual(errors, []);
    await page.close();
  }
  for (const check of report.checks) for (const cell of check.cells || []) assert(cell.contrast >= 4.5, `${check.name} ${check.theme} level ${cell.level}: ${cell.contrast}`);
  for (let i = 0; i < paths.length; i++) assert.equal(hash(await readFile(join(repo, paths[i]))), currentHashes[paths[i]], 'source drift');
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  report.cleanup = !browser || !browser.isConnected();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({status: report.status, output, cleanup: report.cleanup, error: report.error}));
}
