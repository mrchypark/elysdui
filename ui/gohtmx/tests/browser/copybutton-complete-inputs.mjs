import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadContextOwnerAssets, productionContentType, productionCSSReferences} from './context-owner-assets.mjs';
import {copyCases, copyRequiredSources, copyRequiredBrowserPaths} from './copybutton-complete-cases.mjs';

export const copySHA = value => createHash('sha256').update(value).digest('hex');
const loaderDependencies = [
  'ui/gohtmx/tests/browser/context-owner-assets.mjs',
  'ui/gohtmx/tests/browser/context-owner-controls.mjs',
];
const fixtureModes = new Map([
  ['/', []], ['/fragment/root', ['root']], ['/fragment/control', ['control']],
  ['/fragment/inner', ['inner']], ['/manifest.json', ['manifest']],
]);
const productionPath = path => /^(?:ui\/gohtmx|adapters\/gohtmx|sdui|internal\/httpencoding)\//.test(path)
  && !/(?:^|\/)(?:tests|testdata)(?:\/|$)/.test(path) && !/_test\.[^/]+$/.test(path);
const assetSourcePath = path => (path.startsWith('/assets/sdui') ? 'adapters/gohtmx' : 'ui/gohtmx') + path;
const assetMetadata = body => ({sourceSHA256: copySHA(body), servedSHA256: copySHA(body), bytes: body.length});

// This is a current-source contract. No commit ancestry, historical tree, or
// pinned old production file is part of input admission. The caller anchors
// these exact source, fixture and asset bytes before spawning the browser and
// independently rebuilds them after the child has exited.
export async function loadCopyInputs(base) {
  const git = args => execFileSync('git', args, {cwd: base, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024});
  const revision = git(['rev-parse', 'HEAD']).trim();
  const tree = git(['rev-parse', 'HEAD^{tree}']).trim();
  const dirty = git(['status', '--porcelain', '--untracked-files=all']).trim();
  assert(copyCases.length > 0, 'source-owned cases are required');
  assert.equal(new Set(copyCases.map(entry => entry.id)).size, copyCases.length, 'unique source-owned cases');
  assert.equal(new Set(copyRequiredSources).size, copyRequiredSources.length, 'unique required source inventory');

  const tracked = git(['ls-files', '-z']).split('\0').filter(Boolean);
  const paths = new Set([
    ...tracked.filter(path => productionPath(path) || /^(?:go\.(?:mod|sum)|package[^/]*\.json)$/.test(path)),
    // These files are explicit so an untracked, newly authored harness cannot
    // disappear from provenance merely because it has not been committed yet.
    ...copyRequiredSources, ...loaderDependencies,
  ]);
  const sourceFiles = {};
  for (const path of [...paths].sort()) sourceFiles[path] = copySHA(await readFile(join(base, path)));
  for (const path of ['go.mod', 'go.sum', 'package.json', 'package-lock.json']) assert(Object.hasOwn(sourceFiles, path), 'required build input: ' + path);

  const assetBodies = await loadContextOwnerAssets(base);
  const pending = [
    '/assets/ely-controls.css', '/assets/ely-patterns.css',
    '/assets/ely-controls.js', '/assets/ely-patterns.js',
    '/assets/sdui.css', '/assets/sdui.js',
    // These URLs are assembled by the production icon initializer; a CSS
    // url() walk alone cannot discover the icon-name-dependent resources.
    '/assets/ely/icons/copy.svg', '/assets/ely/icons/check.svg',
  ];
  for (let index = 0; index < pending.length; index++) {
    const path = pending[index];
    if (assetBodies.has(path)) continue;
    const body = await readFile(join(base, assetSourcePath(path)));
    assetBodies.set(path, {...assetMetadata(body), body, contentType: productionContentType(path)});
    if (path.endsWith('.css')) pending.push(...productionCSSReferences(body.toString('utf8'), path));
  }
  for (const [path, asset] of assetBodies) {
    assert.equal(sourceFiles[assetSourcePath(path)], asset.sourceSHA256, 'served asset is joined to current production source: ' + path);
    assert.equal(copySHA(asset.body), asset.servedSHA256, 'served asset bytes: ' + path);
    assert.equal(asset.sourceSHA256, asset.servedSHA256, 'baseline serves unmodified production bytes: ' + path);
  }
  const observerPath = 'ui/gohtmx/tests/browser/copybutton-complete-observer.js';
  const observer = await readFile(join(base, observerPath));
  assert.equal(sourceFiles[observerPath], copySHA(observer), 'observer bytes are source-owned');
  assetBodies.set('/copybutton-observer.js', {...assetMetadata(observer), body: observer, contentType: 'text/javascript; charset=utf-8'});
  const assets = Object.fromEntries([...assetBodies].sort(([a], [b]) => a.localeCompare(b)).map(([path, {sourceSHA256, servedSHA256, bytes, contentType}]) => [path, {sourceSHA256, servedSHA256, bytes, contentType}]));

  const go = process.env.GO || 'go';
  // The fixture intentionally uses the adapter as well. Test the public
  // standalone package boundary itself, rather than mislabelling that fixture.
  const dependencies = execFileSync(go, ['list', '-deps', './ui/gohtmx'], {cwd: base, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024}).trim().split('\n');
  const forbiddenImports = dependencies.filter(dep => /^github\.com\/mrchypark\/elysdui\/(?:sdui|adapters)(?:\/|$)/.test(dep));
  assert.deepEqual(forbiddenImports, [], 'standalone UI must not import SDUI or adapters');
  const fixtures = {}, fixtureBodies = new Map();
  const temporary = await mkdtemp(join(tmpdir(), 'ely-copybutton-inputs-'));
  try {
    const binary = join(temporary, process.platform === 'win32' ? 'fixture.exe' : 'fixture');
    execFileSync(go, ['build', '-o', binary, './ui/gohtmx/tests/fixtures/copybutton-complete'], {cwd: base, stdio: 'pipe'});
    for (const [path, args] of fixtureModes) {
      const body = execFileSync(binary, args, {cwd: base, maxBuffer: 16 * 1024 * 1024});
      fixtureBodies.set(path, body);
      fixtures[path] = {...assetMetadata(body), contentType: path.endsWith('.json') ? 'application/json; charset=utf-8' : 'text/html; charset=utf-8'};
    }
  } finally {
    await rm(temporary, {recursive: true, force: true});
  }
  const manifest = JSON.parse(fixtureBodies.get('/manifest.json').toString('utf8'));
  assert.equal(manifest.suite, 'copybutton-complete', 'source-owned fixture manifest');
  assert.equal(manifest.component, 'buttons/CopyButton', 'fixture component');
  for (const path of copyRequiredBrowserPaths) assert(assetBodies.has(path) || fixtureBodies.has(path), 'required browser path must have exact bytes: ' + path);
  const playwright = JSON.parse(await readFile(join(base, 'node_modules/playwright/package.json'), 'utf8')).version;
  const lock = JSON.parse(await readFile(join(base, 'package-lock.json'), 'utf8'));
  assert.equal(playwright, lock.packages['node_modules/playwright'].version, 'installed Playwright matches source-owned lockfile');
  const dependencyProof = {package: './ui/gohtmx', SHA256: copySHA(dependencies.join('\n')), forbiddenImports};
  const toolchain = {
    node: process.version,
    go: execFileSync(go, ['version'], {cwd: base, encoding: 'utf8'}).trim(),
    playwright,
  };
  return {revision, tree, dirty, sourceFiles, assets, fixtures, toolchain, dependencyProof, assetBodies, fixtureBodies};
}
