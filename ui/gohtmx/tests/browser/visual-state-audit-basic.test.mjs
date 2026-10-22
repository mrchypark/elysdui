// Deliberately pure source/metadata checks: no runner import, subprocess, server or browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {baselineFixture, basicFixturePackage, basicFixtureRoute, basicRootSelector, basicSourcePrefixes, validateBasicMatrix} from './visual-state-audit-basic.mjs';

const source = path => readFile(new URL(`../../../../${path}`, import.meta.url), 'utf8');
async function metadata() {
  const go = await source('internal/sduicatalogue/basic.go');
  const names = go.match(/return strings\.Fields\(`([^`]+)`\)/)[1].split(/\s+/);
  const revision = 'a'.repeat(40), hash = 'b'.repeat(64);
  const profiles = ['live', 'static'].flatMap(mode => ['desktop', 'mobile'].flatMap(size => ['light', 'dark'].map(theme => `${mode}-${size}-${theme}`)));
  return {
    revision,
    manifest: {basicNames: names, cases: names.map(name => ({name: `basic/${name}`, template: name, propsSHA256: hash}))},
    matrix: {fixture: 'basic', source: {revision}, auditCases: names.map(name => ({caseId: `basic:${name}`, componentIdentity: `basic/${name}`, fixtureIdentity: `basic-fixture:basic/${name}`, template: name, fixturePropsSHA256: hash, family: 'basic', sourceSHA: revision, surface: ['live-basic', 'static-basic'], profileIds: profiles, aliasMapping: {requestedName: `basic/${name}`, relation: 'canonical-basic-template'}}))},
  };
}

test('basic fixture routing is explicit and default advanced path stays distinct', () => {
  assert.equal(baselineFixture(), 'advanced');
  assert.equal(baselineFixture('basic'), 'basic');
  for (const value of ['all', 'stories', '', null, 'basic/']) assert.throws(() => baselineFixture(value));
  assert.equal(basicFixturePackage, './adapters/gohtmx/tests/fixtures/basic-audit');
  assert.equal(basicFixtureRoute, '/basic-audit/');
  assert.equal(basicRootSelector, '[data-audit-main] > [data-basic-component]');
  assert(basicSourcePrefixes.includes('internal/sduicatalogue/'));
});

test('exact48 source-defined identities and eight profiles are required independently of selection', async () => {
  const {matrix, manifest, revision} = await metadata();
  assert.equal(validateBasicMatrix(matrix, manifest, revision), true);
  for (const mutate of [
    m => m.auditCases.pop(),
    m => m.auditCases.push(m.auditCases[0]),
    m => m.auditCases[1].caseId = m.auditCases[0].caseId,
    m => m.auditCases[0].componentIdentity = 'forms/Input',
    m => m.auditCases[0].fixturePropsSHA256 = 'c'.repeat(64),
    m => m.auditCases[0].profileIds = ['live-desktop-light'],
    m => m.auditCases[0].surface = ['live-audit', 'static-audit'],
    m => m.auditCases[0].sourceSHA = 'c'.repeat(40),
    m => m.auditCases[0].aliasMapping.relation = 'alias',
    m => m.source.revision = 'c'.repeat(40),
    m => m.fixture = 'advanced',
  ]) {
    const bad = structuredClone(matrix); mutate(bad);
    assert.throws(() => validateBasicMatrix(bad, manifest, revision));
  }
  const bad = structuredClone(manifest); bad.basicNames[1] = bad.basicNames[0];
  assert.throws(() => validateBasicMatrix(matrix, bad, revision));
});

test('test-only Go fixture reuses canonical props and renders directly without trusted caller markup', async () => {
  const go = await source('adapters/gohtmx/tests/fixtures/basic-audit/main.go');
  assert(go.includes('sduicatalogue.BasicNames()') && go.includes('sduicatalogue.BasicFixtures()'));
  assert(go.includes('tpl.ExecuteTemplate(w, f.Template, instanceProps(f, scope))'));
  assert(!go.includes('template.HTML('));
  assert(!go.includes('"github.com/mrchypark/elysdui/sdui"'));
  assert(!go.includes('props["Options"] ='));
  assert(go.includes('native-dialog-closed-context-only'));
  assert(go.includes('native-datalist-nonvisual-context-only'));
  assert(go.includes('export requires a new owned directory'));
  assert(go.includes('ui.BindAssets(mux)'));
  assert(go.includes('fs.WalkDir(ui.Files'));
});

test('basic adapter retains owned lifecycle, exact source/loaded-byte proof and advanced route branch', async () => {
  const runner = await source('ui/gohtmx/tests/browser/visual-state-audit-baseline.mjs');
  for (const text of [
    'validateBasicMatrix(matrix, await manifestResponse.json(), currentRevision)',
    "assert.equal(sourceBase.sourceFiles.length, 0, 'basic captures require committed fixture and production sources')",
    'basicSourcePrefixes.some(prefix => path.startsWith(prefix))',
    "basicRootSelector : '[data-audit-main] > [data-ely-family]'",
    "new URL('/components/audit', origin)",
    "? basicFixturePackage : './examples/gohtmx/gallery'",
    'const response = await route.fetch()',
    'await route.fulfill({response, body: bytes})',
    'candidate === request',
    'await completed',
    "loadedProof: 'owned-route identical bytes; exact browser requestfinished'",
    'actualSHA256 !== loaded.sha256',
    'chromium.launchPersistentContext(userDataDir',
    'source pin changed',
    'metadata.basicFixture',
    'visualAssessment: \'pending; capture success is not a component visual pass\'',
  ]) assert(runner.includes(text), text);
  assert(runner.includes('basic phase1 requires an owned compiled fixture/export, not --base-url'));
  assert(runner.includes("metadata.captureIdentity = {requested: item.componentIdentity, rendered: await root.getAttribute(options.fixture === 'basic' ? 'data-basic-component' : 'data-ely-component')"));
});

test('canonical hook includes only the separate pure test file, not a new test/browser command', async () => {
  const pkg = JSON.parse(await source('package.json'));
  const argument = ' ui/gohtmx/tests/browser/visual-state-audit-basic.test.mjs';
  assert.equal(pkg.scripts['test:visual-regressions'].split(argument).length, 2);
  const ownSource = await readFile(new URL('./visual-state-audit-basic.test.mjs', import.meta.url), 'utf8');
  assert(!/^import .*from ['"](?:node:child_process|playwright)['"]/m.test(ownSource));
});
