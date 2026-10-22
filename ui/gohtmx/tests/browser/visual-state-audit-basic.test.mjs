// Deliberately pure source/metadata checks: no runner import, subprocess, server or browser.
import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {EventEmitter} from 'node:events';
import {baselineFixture, basicFixturePackage, basicFixtureRoute, basicRootSelector, basicSourcePrefixes, validateBasicMatrix} from './visual-state-audit-basic.mjs';
import {basicActionContract,basicActionVariants,validateBasicActionMatrix,runBasicActions,basicActionSurface,selectBasicActionCases,requiredBasicActionAssets,fulfillBasicActionAsset,assertBasicActionAssets,assertBasicTableRows} from './visual-state-audit-basic-actions.mjs';

const source = path => readFile(new URL(`../../../../${path}`, import.meta.url), 'utf8');
async function metadata() {
  const go = await source('internal/sduicatalogue/basic.go');
  const names = go.match(/return strings\.Fields\(`([^`]+)`\)/)[1].split(/\s+/);
  const revision = 'a'.repeat(40), hash = 'b'.repeat(64);
  const profiles = ['live', 'static'].flatMap(mode => ['desktop', 'mobile'].flatMap(size => ['light', 'dark'].map(theme => `${mode}-${size}-${theme}`)));
  return {
    revision,
    manifest: {basicNames: names, cases: names.map(name => ({name: `basic/${name}`, template: name, propsSHA256: hash})),assetHashes:Object.fromEntries(requiredBasicActionAssets.map(path=>[path,hash]))},
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
  assert.equal(basicActionContract('basic/data-table').steps.length,7);
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

test('phase2 source-only radio variant records Gamma, disabled pointer, then native ArrowLeft skipping Beta',async()=>{
  const contract=basicActionContract('basic/radio-group@second-enabled-option');
  assert.deepEqual(contract.steps.map(s=>s.id),['select-gamma','disabled-beta-pointer','keyboard-skip-beta']);
  assert.deepEqual(basicActionContract('basic/radio-group').steps.map(s=>s.id),['selected-option']);
  for(const defect of [null,'already-focused','pointer-change','pointer-occluded','beta-enabled','beta-checked','skip-beta-focus','wrong-order','untrusted','wrong-value','wrong-name','extra-event','tab-change','tab-unreachable']){
    const name='basic-radio-group-second-enabled-option-main_value',state={__basicEvents:[],__basicCursor:0};
    const nodes=Object.fromEntries(['alpha','beta','gamma'].map(value=>[value,{id:'',tagName:'INPUT',name,value,disabled:value==='beta',checked:value==='alpha'}]));
    let focus=null;const calls=[],asserted=[];
    const emit=value=>{const events=['input','change'].map(type=>({type,target:null,name,value,checked:true,trusted:true,detail:null}));
      if(defect==='wrong-order')events.reverse();if(defect==='untrusted')events[0].trusted=false;if(defect==='wrong-value')events[0].value='beta';if(defect==='wrong-name')events[0].name='twin_value';if(defect==='extra-event')events.push({...events[0]});state.__basicEvents.push(...events);};
    const select=value=>{for(const n of Object.values(nodes))n.checked=n.value===value;focus=nodes[value];};
    // Evaluate only the driver's two focus observations; no DOM/browser globals are installed.
    const locator=value=>({count:async()=>1,isDisabled:async()=>nodes[value].disabled,isChecked:async()=>nodes[value].checked,
      getAttribute:async key=>nodes[value][key],boundingBox:async()=>({x:10,y:20,width:12,height:12}),
      evaluate:async fn=>fn.toString().includes('elementFromPoint')?defect!=='pointer-occluded':fn.toString().includes('document.activeElement')?focus===nodes[value]:fn(nodes[value]),
      click:async()=>{calls.push('select-gamma');select('gamma');emit('gamma');if(defect==='beta-enabled')nodes.beta.disabled=false;if(defect==='beta-checked')nodes.beta.checked=true;}});
    const page={mouse:{click:async(x,y)=>{calls.push(['pointer',x,y]);if(defect==='pointer-change'){select('beta');emit('beta');}else if(defect!=='already-focused')focus=null;}},
      keyboard:{press:async key=>{calls.push(key);if(key==='Tab'){if(defect!=='tab-unreachable')focus=nodes.gamma;if(defect==='tab-change'){select('alpha');emit('alpha');}}else if(key==='ArrowLeft'){select('alpha');emit('alpha');if(defect==='skip-beta-focus')focus=nodes.beta;}else assert.fail('Unexpected native key');}}};
    const root={page:()=>page,locator:selector=>locator(selector.match(/value="(\w+)"/)[1]),evaluate:async fn=>fn.toString().includes('document.activeElement')?{id:focus?.id||null,value:focus?.value??null,tag:focus?.tagName||'BODY'}:fn(state)};
    const execute=()=>runBasicActions(contract,root,async(id,control,action,verify)=>{
      assert.equal(id,contract.steps[asserted.length].id);state.__basicCursor=state.__basicEvents.length;await action();asserted.push(await verify());
    });
    if(defect&&defect!=='already-focused')await assert.rejects(execute,undefined,defect);
    else{await execute();assert.deepEqual(calls,['select-gamma',['pointer',16,26],...(defect==='already-focused'?[]:['Tab']),'ArrowLeft']);
      assert.deepEqual(asserted[1],{pointer:{x:16,y:26},selected:'gamma',betaDisabled:true,betaChecked:false});
      assert.deepEqual(asserted[2],{tabSetup:defect==='already-focused'?[]:[{id:null,value:'gamma',tag:'INPUT'}],preselection:'gamma',preArrowFocus:'gamma',key:'ArrowLeft',selected:'alpha',focused:'alpha',betaDisabled:true,betaChecked:false});}
  }
  const driver=runBasicActions.toString(),radio=driver.slice(driver.indexOf("if(t==='radio-group'&&variant)"),driver.indexOf("}else if(t==='button')"));
  assert(!radio.includes('.focus('));assert(!radio.includes('force:'));assert(!radio.includes("press('ArrowRight')"));assert(radio.includes("press('ArrowLeft')"));
});

test('phase2 source-only profile/surface agreement and exact explicit selection precede allocation',async()=>{
  const {matrix}=await metadata();
  for(const mode of ['live','static'])for(const size of ['desktop','mobile'])for(const theme of ['light','dark']){
    const profileId=`${mode}-${size}-${theme}`;basicActionSurface(profileId,`${mode}-basic`);
    assert.throws(()=>basicActionSurface(profileId,`${mode==='live'?'static':'live'}-basic`));
  }
  const options={profileId:'live-desktop-light',surface:'live-basic',families:[],caseIds:matrix.auditCases.slice(0,21).map(c=>c.caseId),full:false,pilot:20};
  assert.deepEqual(selectBasicActionCases(matrix,options).map(c=>c.caseId),options.caseIds,'Implicit default pilot must preserve all21 explicit IDs');
  assert.equal(selectBasicActionCases(matrix,{...options,caseIds:[]}).length,20);
  assert.equal(selectBasicActionCases(matrix,{...options,caseIds:[],full:true}).length,48);
  const expanded=structuredClone(matrix);for(let i=0;i<5;i++)expanded.auditCases.push({...matrix.auditCases[0],caseId:`variant:${i}`,componentIdentity:`variant/${i}`});
  assert.equal(selectBasicActionCases(expanded,{...options,caseIds:[],full:true}).length,53);
  assert.throws(()=>selectBasicActionCases(matrix,{...options,caseIds:[...options.caseIds,'basic:missing']}));
  const sourceRunner=await source('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs');
  assert(sourceRunner.includes('if(!basic){\n  if (options.families.length)'));
  assert(sourceRunner.includes('isDeepStrictEqual(reports.map(c=>c.caseId),cases.map(c=>c.caseId))'));
});

test('phase2 source-only map reset preserves canonical absence and uses actual native canvas keyboard path',async()=>{
  const driver=runBasicActions.toString(),template=await source('ui/gohtmx/templates/ely-map.html'),runtime=await source('ui/gohtmx/assets/ely-map.js');
  assert(template.includes('{{if .ShowReset}}'));
  assert(driver.includes("assert.equal(await one('[data-map-zoom=\"reset\"]').count(),0"));
  assert(driver.includes("page.keyboard.press('Shift+Tab')"));assert(driver.includes("page.keyboard.press('0')"));
  assert(!driver.includes("one('[data-map-zoom=\"reset\"]').click()"));
  assert(runtime.includes("event.target !== canvas"));assert(runtime.includes("event.key === '0'"));
  assert(runtime.includes('center = initialCenter.slice(); zoom = initialZoom; apply(true)'));
});

test('phase2 pure table oracle rejects wrong filtered row and no-op descending sort',()=>{
  const alice=['Caller Alice','Ready'],bob=['Caller Bob','Pending'];
  assertBasicTableRows([alice],[alice]);assertBasicTableRows([bob,alice],[bob,alice]);
  assert.throws(()=>assertBasicTableRows([bob],[alice]));
  assert.throws(()=>assertBasicTableRows([alice,bob],[bob,alice]));
  assert(basicActionContract('basic/data-table').steps.some(s=>s.id==='sort-descending'));
});

test('phase2 pure loaded-asset gate rejects missing wrong failed and incomplete delivery',()=>{
  const expected=Object.fromEntries(requiredBasicActionAssets.map(path=>[path,'a'.repeat(64)]));
  const good=requiredBasicActionAssets.map(path=>({path,bytes:8,sha256:expected[path],expectedSHA256:expected[path],loadedProof:'owned-route identical bytes; exact browser requestfinished'}));
  assertBasicActionAssets(good,expected);
  for(const mutate of [rows=>rows.pop(),rows=>rows[0].sha256='b'.repeat(64),rows=>rows[0].error='failed',rows=>delete rows[0].loadedProof,rows=>rows[0].bytes=0,rows=>rows[0].expectedSHA256='b'.repeat(64),rows=>rows.push({path:'/assets/unmapped.js',bytes:8,loadedProof:rows[0].loadedProof})]){
    const bad=structuredClone(good);mutate(bad);assert.throws(()=>assertBasicActionAssets(bad,expected));
  }
});

test('phase2 pure delivery mechanism requires the exact requestfinished object and unchanged response bytes',async()=>{
  const bytes=Buffer.from('owned asset'),path='/assets/app.css',url='http://owned.test'+path,sha=createHash('sha256').update(bytes).digest('hex');
  for(const mode of ['ok','wrong-bytes','missing','wrong-request','failed','closed','http-error','redirect']){
    const page=new EventEmitter(),context=new EventEmitter();page.context=()=>context;
    const request={url:()=>url,failure:()=>mode==='failed'?{errorText:'failed'}:null};let delivered;
    const route={request:()=>request,fetch:async()=>({ok:()=>mode!=='http-error',url:()=>mode==='redirect'?url+'?redirected':url,body:async()=>bytes}),fulfill:async options=>{delivered=options.body;
      if(mode==='missing')return;
      if(mode==='closed'){context.emit('close');return;}
      page.emit(mode==='failed'?'requestfailed':'requestfinished',mode==='wrong-request'?{...request}:request);
    }};
    const run=()=>fulfillBasicActionAsset(route,page,{[path]:mode==='wrong-bytes'?'b'.repeat(64):sha},5);
    if(mode==='ok'){const proof=await run();assert.equal(proof.sha256,sha);assert.deepEqual(delivered,bytes);}
    else await assert.rejects(run(),undefined,mode);
    assert.equal(page.listenerCount('requestfinished'),0);assert.equal(page.listenerCount('requestfailed'),0);assert.equal(context.listenerCount('close'),0);
  }
  const runner=await source('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs');
  assert(runner.includes('fulfillBasicActionAsset(route,page,expectedAssets)'));
  assert(runner.includes('assertBasicActionAssets(result.productionAssets,expectedAssets)'));
  assert(runner.includes("c.status!=='failed'&&c.assetsVerified"));
  assert(runner.includes("sourceBefore.files.find(f=>f.path==='ui/gohtmx'+path)?.sha256"));
});
