// Deliberately pure source/metadata checks: no runner import, subprocess, server or browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {baselineFixture, basicFixturePackage, basicFixtureRoute, basicRootSelector, basicSourcePrefixes, validateBasicMatrix} from './visual-state-audit-basic.mjs';
import {basicActionContract,basicActionVariants,validateBasicActionMatrix,runBasicActions} from './visual-state-audit-basic-actions.mjs';

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

test('phase2 source-only classification is exact48, with datalist conditional and actual data-table controls',async()=>{
  const {manifest}=await metadata(),contracts=manifest.basicNames.map(name=>basicActionContract(`basic/${name}`));
  assert(contracts.every(Boolean));
  assert.equal(contracts.filter(c=>c.classification==='noninteractive-canonical-fixture').length,17);
  assert.equal(contracts.filter(c=>c.classification==='finite-actions').length,30);
  assert.equal(contracts.filter(c=>c.classification==='conditional-no-associated-input').length,1);
  assert.equal(basicActionContract('basic/data-table').steps.length,6);
  for(const identity of ['input','forms/Input','basic/unknown','basic/input@second-enabled-option','basic/select@other'])assert.equal(basicActionContract(identity),null);
  for(const c of contracts){assert(c.source);assert(c.scope);for(const s of c.steps)assert.equal(s.sourceSiteId,`basic-action:${c.identity}:${s.id}`);}
  assert.match(basicActionContract('basic/file-dropzone').boundaries.join(' '),/not OS file-picker/);
  assert.match(basicActionContract('basic/coordinate-display').boundaries.join(' '),/never writes to the user clipboard/);
  assert.match(basicActionContract('basic/dialog').boundaries.join(' '),/fixture-host/);
  const driver=runBasicActions.toString();assert(!driver.includes('force:true'));assert(!driver.includes('requestSubmit'));
  assert(driver.includes('Disabled Beta must actually be rendered unavailable'));
});

test('phase2 source-only named variants have independent identities/hashes, never canonical promotion',async()=>{
  const {matrix,manifest,revision}=await metadata();matrix.actionFixture=true;manifest.variants=[];
  for(const template of basicActionVariants){
    const identity=`basic/${template}@second-enabled-option`,canonical=matrix.auditCases.find(c=>c.template===template);
    manifest.variants.push({name:identity,template,propsSHA256:'c'.repeat(64)});
    matrix.auditCases.push({...structuredClone(canonical),caseId:`basic:${template}@second-enabled-option`,componentIdentity:identity,fixtureIdentity:`basic-fixture:${identity}`,fixturePropsSHA256:'c'.repeat(64),aliasMapping:{requestedName:identity,relation:'named-basic-action-variant'}});
    assert.equal(basicActionContract(identity).variant,'second-enabled-option');
  }
  validateBasicActionMatrix(matrix,manifest,revision);
  for(const mutate of [m=>m.auditCases.pop(),m=>m.actionFixture=false,m=>m.auditCases.at(-1).fixturePropsSHA256='d'.repeat(64),m=>m.auditCases.at(-1).componentIdentity='basic/select',m=>m.auditCases.at(-1).profileIds=['live-desktop-light'],m=>m.auditCases.at(-1).sourceSHA='d'.repeat(40)]){const bad=structuredClone(matrix);mutate(bad);assert.throws(()=>validateBasicActionMatrix(bad,manifest,revision));}
  const bad=structuredClone(manifest);bad.variants[0].propsSHA256=bad.cases[0].propsSHA256;assert.throws(()=>validateBasicActionMatrix(matrix,bad,revision));
});

test('phase2 source-only runner routes basic without advanced registries and preserves fail-closed ownership',async()=>{
  const runner=await source('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs'),go=await source('adapters/gohtmx/tests/fixtures/basic-audit/main.go');
  assert(runner.includes('if(!basic){\n  assert.equal(coverageManifest.source?.revision'));
  assert(runner.includes('validateBasicActionMatrix(matrix,coverageManifest,expectedRevision)'));
  assert(runner.includes('basic?basicFixturePackage'));
  assert(runner.includes('sourceBefore.status===\'\'&&sourceAfter.status===\'\''));
  assert(runner.includes('Every finite action requires owned before/after pixels'));
  assert(runner.includes("if(result.status==='failed')break"));
  assert(runner.includes('canvases:[...n.querySelectorAll(\'canvas\')].map(c=>c.toDataURL())'));
  assert(runner.includes("fullRunGate:{safe:false,fullMatrixComplete:false"));
  assert(go.includes('f.Name += "@second-enabled-option"'));
  assert(go.includes('"Value": "gamma", "Label": "Caller Gamma"'));
  assert(!go.includes('"Disabled"] = false'));
  const camera=await source('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs');
  assert(camera.includes('[data-audit-main]>[data-basic-component],[data-audit-twin]>[data-basic-component]'));
});

test('phase2 source-only basic native button cannot pass a synthetic click or unexpected event',async()=>{
  const contract=basicActionContract('basic/button');
  for(const [trusted,unexpected,passes]of [[true,false,true],[false,false,false],[true,true,false]]){
    const state={__basicEvents:[],__basicCursor:0,__basicClicks:[],__basicClickCursor:0};
    const root={page:()=>({}),evaluate:async fn=>fn(state),locator:()=>({click:async()=>{state.__basicClicks.push({trusted});if(unexpected)state.__basicEvents.push({type:'ely:action'});}})};
    const execute=()=>runBasicActions(contract,root,async(id,control,action,verify)=>{assert.equal(id,'activate');assert.equal(control,'button');await action();await verify();});
    if(passes)await execute();else await assert.rejects(execute);
  }
});
