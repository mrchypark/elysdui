import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadContextOwnerAssets} from './context-owner-assets.mjs';
import {searchableSourcePaths, searchableSurfaces} from './searchable-menu-confirmation-evidence.mjs';
export const searchableSHA = value => createHash('sha256').update(value).digest('hex');
export async function loadSearchableInputs(base, surface) {
  assert(searchableSurfaces.includes(surface));
  const git = args => execFileSync('git', args, {cwd: base, encoding: 'utf8'}).trim();
  const sourceFiles = {};
  for (const path of searchableSourcePaths) sourceFiles[path] = searchableSHA(await readFile(join(base, path)));
  const revision = git(['rev-parse', 'HEAD']), tree = git(['rev-parse', 'HEAD^{tree}']), dirty = git(['status', '--porcelain']);
  const assetBodies = await loadContextOwnerAssets(base);
  const icon = '/assets/ely/icons/search.svg', iconBody = await readFile(join(base, 'ui/gohtmx', icon));
  assetBodies.set(icon, {body: iconBody, sourceSHA256: searchableSHA(iconBody), servedSHA256: searchableSHA(iconBody), bytes: iconBody.length, contentType: 'image/svg+xml'});
  const assets = Object.fromEntries([...assetBodies].map(([path, {sourceSHA256, servedSHA256, bytes, contentType}]) => [path, {sourceSHA256, servedSHA256, bytes, contentType}]));
  const fixturePath = surface === 'sdui' ? './adapters/gohtmx/tests/fixtures/searchable-menu-confirmation' : './ui/gohtmx/tests/fixtures/searchable-menu-confirmation';
  const go = process.env.GO || 'go';
  const standaloneDeps = execFileSync(go, ['list', '-deps', './ui/gohtmx/tests/fixtures/searchable-menu-confirmation'], {cwd: base, encoding: 'utf8'}).trim().split('\n');
  assert(!standaloneDeps.some(dep => /github\.com\/mrchypark\/elysdui\/(sdui|adapters)(\/|$)/.test(dep)), 'standalone fixture package boundary');
  const temp = await mkdtemp(join(tmpdir(), 'ely-searchable-inputs-'));
  const fixtureBodies = new Map(), fixtures = {};
  try {
    const binary = join(temp, 'fixture');
    execFileSync(go, ['build', '-o', binary, fixturePath], {cwd: base, stdio: 'pipe'});
    for (const path of ['/', '/fragment']) {
      const args = [...(path === '/' ? ['-full'] : []), '-id=primary', ...(surface === 'sdui' ? [] : ['-mode=' + surface])];
      const body = execFileSync(binary, args, {cwd: base, maxBuffer: 8 * 1024 * 1024});
      fixtureBodies.set(path, body);
      fixtures[path] = {sourceSHA256: searchableSHA(body), servedSHA256: searchableSHA(body), bytes: body.length, html: 'searchable-menu-fixtures/' + searchableSHA(body) + '.html', renderer: surface === 'sdui' ? 'CatalogueRegistry + Decode + Compile + Plan.Render' : 'ui.RenderComponent ' + surface};
    }
  } finally { await rm(temp, {recursive: true, force: true}); }
  return {revision, tree, dirty, sourceFiles, assets, fixtures, assetBodies, fixtureBodies,
    standaloneDependencyProof: {SHA256: searchableSHA(standaloneDeps.join('\n')), forbiddenImports: []},
    toolchain: {node: process.version, go: execFileSync(go, ['version'], {cwd: base, encoding: 'utf8'}).trim(), playwright: JSON.parse(await readFile(join(base, 'node_modules/playwright/package.json'), 'utf8')).version}};
}
