import assert from 'node:assert/strict';
import {loadPaletteHistory} from './palette-history-fixtures.mjs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadContextOwnerAssets, productionContentType, productionCSSReferences} from './context-owner-assets.mjs';
import {paletteSourcePaths, paletteSurfaces, paletteBaseline, paletteBaselineTree} from './palette-query-evidence.mjs';
import {paletteProductionPolicy, paletteProductionPaths, paletteActivationRepairPins} from './palette-query-production-policy.mjs';
export const paletteSHA = value => createHash('sha256').update(value).digest('hex');
export async function loadPaletteInputs(base, surface, {productionPolicy = 'strict'} = {}) {
  paletteProductionPolicy(productionPolicy);
  assert(paletteSurfaces.includes(surface));
  const git = args => execFileSync('git', args, {cwd: base, encoding: 'utf8'}).trim();
  const revision = git(['rev-parse', 'HEAD']), tree = git(['rev-parse', 'HEAD^{tree}']), dirty = git(['status', '--porcelain']);
  const history = loadPaletteHistory(base);
  assert.equal(history.tree(paletteBaseline), paletteBaselineTree, 'actual-main recorded tree');
  const sourceFiles = {};
  for (const path of paletteSourcePaths) sourceFiles[path] = paletteSHA(await readFile(join(base, path)));
  // The original baseline remains immutable at paletteBaseline. This repair
  // admits only the policy's explicitly reviewed runtime/template/catalogue
  // and asset bytes. Candidate pins are fixed below and joined to clean HEAD;
  // every other production input remains byte-equal to baseline.
  const repairedProduction = new Set(paletteProductionPaths(productionPolicy));
  if (productionPolicy === 'activation-repair') for (const [path, expected] of Object.entries(paletteActivationRepairPins)) {
    assert.equal(sourceFiles[path], expected, 'fixed activation-repair production input: ' + path);
  }
  for (const path of paletteSourcePaths.filter(path => !/tests\/|^scripts\/|^package|^\.github/.test(path))) {
    const ref = repairedProduction.has(path) ? revision : paletteBaseline;
    const expected = ref === paletteBaseline ? history.sha256(ref, path) : paletteSHA(execFileSync('git', ['show', `${ref}:${path}`], {cwd: base, maxBuffer: 8 * 1024 * 1024}));
    assert.equal(expected, sourceFiles[path], 'reviewed production input: ' + path);
  }
  const assetBodies = await loadContextOwnerAssets(base);
  const pending = ['/assets/ely-controls.css', '/assets/ely-patterns.css', '/assets/ely-controls.js', '/assets/ely-patterns.js', ...(surface === 'sdui' ? ['/assets/sdui.css', '/assets/sdui.js'] : [])];
  for (let index = 0; index < pending.length; index++) {
    const path = pending[index]; if (assetBodies.has(path)) continue;
    const source = path.startsWith('/assets/sdui') ? 'adapters/gohtmx' : 'ui/gohtmx';
    const body = await readFile(join(base, source, path));
    assetBodies.set(path, {body, sourceSHA256: paletteSHA(body), servedSHA256: paletteSHA(body), bytes: body.length, contentType: productionContentType(path)});
    if (path.endsWith('.css')) pending.push(...productionCSSReferences(body.toString('utf8'), path));
  }
  for (const [path, asset] of assetBodies) {
    const directory = path.startsWith('/assets/sdui') ? 'adapters/gohtmx' : 'ui/gohtmx';
    const ref = repairedProduction.has(`${directory}${path}`) ? revision : paletteBaseline;
    const expected = ref === paletteBaseline ? history.sha256(ref, `${directory}${path}`) : paletteSHA(execFileSync('git', ['show', `${ref}:${directory}${path}`], {cwd: base, maxBuffer: 16 * 1024 * 1024}));
    assert.equal(expected, asset.sourceSHA256, 'loaded production assets pinned to reviewed source: ' + path);
  }
  const observer = await readFile(join(base, 'ui/gohtmx/tests/browser/palette-query-observer.js'));
  assetBodies.set('/fixture-observer.js', {body: observer, sourceSHA256: paletteSHA(observer), servedSHA256: paletteSHA(observer), bytes: observer.length, contentType: 'text/javascript; charset=utf-8'});
  const assets = Object.fromEntries([...assetBodies].map(([path, {sourceSHA256, servedSHA256, bytes, contentType}]) => [path, {sourceSHA256, servedSHA256, bytes, contentType}]));
  const go = process.env.GO || 'go';
  const deps = execFileSync(go, ['list', '-deps', './ui/gohtmx/tests/fixtures/palette-query'], {cwd: base, encoding: 'utf8'}).trim().split('\n');
  assert(!deps.some(dep => /github\.com\/mrchypark\/elysdui\/(sdui|adapters)(\/|$)/.test(dep)), 'standalone UI fixture boundary');
  const temp = await mkdtemp(join(tmpdir(), 'ely-palette-inputs-'));
  const fixtures = {}, fixtureBodies = new Map(); let fixtureManifest;
  try {
    const binary = join(temp, 'fixture');
    execFileSync(go, ['build', '-o', binary, surface === 'sdui' ? './adapters/gohtmx/tests/fixtures/palette-query' : './ui/gohtmx/tests/fixtures/palette-query'], {cwd: base, stdio: 'pipe'});
    fixtureManifest = JSON.parse(execFileSync(binary, ['-surface=' + surface, '-dump=/manifest.json'], {cwd: base, encoding: 'utf8'}));
    for (const path of ['/', '/fragment', ...(surface === 'sdui' ? ['/sdui-response-primary', '/sdui-response-peer'] : [])]) {
      const body = execFileSync(binary, ['-surface=' + surface, '-dump=' + path], {cwd: base, maxBuffer: 8 * 1024 * 1024});
      fixtureBodies.set(path, body);
      fixtures[path] = {sourceSHA256: paletteSHA(body), servedSHA256: paletteSHA(body), bytes: body.length, html: 'palette-query-fixtures/' + paletteSHA(body) + '.html', renderer: surface === 'sdui' ? 'CatalogueRegistry + Decode + Compile + Plan.Render/RenderRegion' : 'ui.RenderComponent ' + surface};
    }
  } finally { await rm(temp, {recursive: true, force: true}); }
  for (const entry of fixtureManifest.sourceFiles) assert.equal(entry.sha256, paletteSHA(await readFile(join(base, entry.path))), 'manifest source rehash: ' + entry.path);
  return {productionPolicy, revision, tree, dirty, sourceFiles, assets, fixtures, fixtureManifest, assetBodies, fixtureBodies,
    standaloneDependencyProof: {SHA256: paletteSHA(deps.join('\n')), forbiddenImports: []},
    toolchain: {node: process.version, go: execFileSync(go, ['version'], {cwd: base, encoding: 'utf8'}).trim(), playwright: JSON.parse(await readFile(join(base, 'node_modules/playwright/package.json'), 'utf8')).version}};
}
