import assert from 'node:assert/strict';
import {paletteProductionPolicy, paletteRuntimeCorePins} from '../ui/gohtmx/tests/browser/palette-query-production-policy.mjs';
const productionPolicy=paletteProductionPolicy(process.env.PALETTE_QUERY_PRODUCTION_POLICY||'audit-candidate');
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {parse} from 'acorn';
import {paletteCases, paletteRawKeys, paletteSourcePaths, paletteOwner, paletteExpectedRows, paletteExpectedAction} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';
const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const browser = read('ui/gohtmx/tests/browser/palette-query-browser-test.mjs'), observer = read('ui/gohtmx/tests/browser/palette-query-observer.js'), loader = read('ui/gohtmx/tests/browser/palette-query-inputs.mjs');
for (const path of paletteSourcePaths.filter(path => /\.(mjs|js)$/.test(path))) parse(read(path), {ecmaVersion: 'latest', sourceType: 'module'});
assert.equal(new Set(paletteCases()).size, 9);
for (const name of paletteCases()) assert(paletteRawKeys(name).includes('before') && paletteRawKeys(name).includes('after'));
assert.deepEqual(paletteCases('focus'), ['query.continue', 'cursor.coherence']);
assert(!/\.fill\(|\.focus\(|dispatchEvent\(new (?:KeyboardEvent|InputEvent)/.test(browser), 'real keyboard scenarios must not rescue focus or fake native input');
assert(browser.includes("await page.keyboard.type(name === 'query.continue' ? 'en' : 'o')"));
assert(browser.includes("await page.keyboard.press('ArrowDown'); current.raw.arrow = await snap()"));
assert(browser.includes("await page.keyboard.down('Enter')") && browser.includes("await page.keyboard.up('Enter')"));
assert(browser.includes("parsed.get('_target')") && !browser.includes("parsed.get('target')"), 'actual SDUI bridge field');
assert(browser.includes("req.method === 'POST'") && browser.includes("'/sdui-action'"));
assert(browser.includes("paletteLog.actions.filter(e => ['open-command', 'option-command', 'other-command', 'disabled-command', 'zebra-command'].includes(e.action))"), 'empty form submit cannot become a routed-command wait');
assert(!/dispatchEvent[^\n]+htmx:/.test(browser), 'real HTMX lifecycle, never synthetic dispatch');
assert(observer.includes("detail.formData === null ? 'null'") && observer.includes("valuesKind: Array.isArray(detail.values)"), 'raw payload shape retained');
assert(!/\.focus\(|\.value\s*=|setAttribute\(|\.click\(/.test(observer), 'passive observer cannot repair production DOM');
assert(loader.includes("history.tree(paletteBaseline), paletteBaselineTree"));
assert(loader.includes('history.sha256(ref, path)'));
assert(loader.includes('history.sha256(ref, `${directory}${path}`)'));
assert(loader.includes("'reviewed production input: ' + path"));
assert(loader.includes('cleanHeadProduction.has(path) ? revision : paletteBaseline'));
assert(loader.includes("'loaded production assets pinned to reviewed source: ' + path"));
assert.equal(paletteOwner('sdui'), 'sdui-internal-cb0aff20eca69b4d6a19786f3d9788b761f8ee6825dfcd07bfacf11c0a78a4e4');
assert.deepEqual(paletteExpectedRows('opo').filter(row => !row.hidden && !row.disabled).map(row => row.value), ['option-file']);
assert.deepEqual(paletteExpectedAction('go-qualified', 'option-file', 'option-command').values, []);
const sha = path => createHash('sha256').update(readFileSync(new URL('../' + path, import.meta.url))).digest('hex');
// Each policy pins its own runtime and core digest. The audited candidate
// policy pins the clean HEAD runtime/core of the reviewed revision, the
// strict policy pins the historical baseline bytes, and activation-repair pins
// its fixed reviewed digests. The pin is selected by the policy, never by an
// observed hash.
const runtimeCorePins=paletteRuntimeCorePins(productionPolicy);
assert.equal(sha('ui/gohtmx/assets/ely-api-interaction.js'), runtimeCorePins['ui/gohtmx/assets/ely-api-interaction.js'], 'policy-pinned runtime digest: '+productionPolicy);
assert.equal(sha('ui/gohtmx/assets/ely-api.js'), runtimeCorePins['ui/gohtmx/assets/ely-api.js'], 'policy-pinned core digest: '+productionPolicy);
const pkg = JSON.parse(read('package.json'));
for (const path of ['scripts/palette-query-oracles-test.mjs', 'scripts/palette-query-evidence-test.mjs', 'ui/gohtmx/tests/unit/palette_query_test.mjs']) assert(pkg.scripts.test.includes('node ' + path), path + ' must run by default');
console.log('CommandPalette source-owned keyboard, fixture, payload and reviewed repair pins checked (no browser execution).');
