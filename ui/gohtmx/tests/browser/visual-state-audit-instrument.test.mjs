import assert from 'node:assert/strict';
import {test} from 'node:test';
import {transform} from './visual-state-audit-instrument.mjs';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {caseActionContract,requestedStateContract,runRequestedStateActions,clickVisibleControl,ownedOverlayInventory,captureTargetPNG,inventoryReceipt,inventoryDrift,unhandledBrowserErrors} from './visual-state-audit-drivers.mjs';

async function execute(source,unsupportedHook=()=>{}){
  const events=[];
  globalThis.events=events;
  globalThis.target={click(){events.push('click');return 19;}};
  globalThis.items=[1];
  globalThis.assert=value=>{if(!value)throw new Error('fixture assertion failed');};
  globalThis.registerChecks=()=>{};
  globalThis.__visualBeforeAction=site=>events.push(`before:${site.method}`);
  globalThis.__visualCheckpoint=site=>events.push(`checkpoint:${site.method}`);
  globalThis.__visualUnsupportedAction=site=>unsupportedHook(site,events);
  try{await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`);}
  finally{for(const key of ['events','target','items','assert','registerChecks','__visualBeforeAction','__visualCheckpoint','__visualUnsupportedAction'])delete globalThis[key];}
  return events;
}

test('propagates async through declaration and arrow helper calls without moving assertions',async()=>{
  const source=`
const events=[];
const button={click(){events.push('click');}};
function tap(){button.click();events.push('assert:helper');}
const check=()=>{tap();events.push('assert:check');};
check();
globalThis.result=events;
`;
  const result=transform(source,'fixture.js');
  assert.equal(result.interactionSites.length,1);
  assert.equal(result.unsupported.length,0);
  assert.equal(result.interactionSites[0].control,'button');
  assert.equal(result.interactionSites[0].event,'click');
  assert.equal(result.interactionSites[0].action,'button.click()');
  assert.equal(result.interactionSites[0].sourceAnchor.text,'button.click()');
  assert.match(result.source,/async function tap/);
  assert.match(result.source,/const check=async\s*\(\)=>\{await tap\(\)/);
  const original=await execute(source),expected=globalThis.result;
  const instrumented=await execute(result.source),actual=globalThis.result;
  assert.deepEqual(expected,['click','assert:helper','assert:check']);
  assert.deepEqual(actual,['click','assert:helper','assert:check']);
  assert.deepEqual(instrumented,['before:click','checkpoint:click']);
  assert.notEqual(result.originalSHA,result.transformedSHA);
  delete globalThis.result;
});

test('supports async arrow check callbacks and checkpoints direct dispatched events in order',async()=>{
  const source=`
const events=[];
const target={dispatchEvent(){events.push('dispatch');}};
const check={run:async()=>{target.dispatchEvent('input');events.push('assert:after-dispatch');}};
await check.run();
globalThis.result=events;
`;
  const result=transform(source,'callback.js');
  assert.equal(result.interactionSites.length,1);
  assert.equal(result.unsupported.length,0);
  const expected=await execute(source),original=globalThis.result;
  const captured=await execute(result.source),instrumented=globalThis.result;
  assert.deepEqual(original,['dispatch','assert:after-dispatch']);
  assert.deepEqual(instrumented,['dispatch','assert:after-dispatch']);
  assert.deepEqual(captured,['before:dispatchEvent','checkpoint:dispatchEvent']);
  delete globalThis.result;
});

test('retains exact interaction anchors and maps helper sites to registered checks',()=>{
  const source=`
const press=()=>{document.querySelector('[data-action="save"]').click();};
const check=()=>{press();};
registerChecks('workspace',{'workspace/Editor':check,'workspace/Alias':check});
`;
  const result=transform(source,'mapped.js');
  assert.equal(result.interactionSites.length,1);
  const [site]=result.interactionSites;
  assert.deepEqual(site.mappedChecks,['workspace/Alias','workspace/Editor']);
  assert.equal(site.checkIdentity,'workspace/Alias');
  assert.equal(site.control,"document.querySelector('[data-action=\"save\"]')");
  assert.equal(site.event,'click');
  assert.equal(site.action,"document.querySelector('[data-action=\"save\"]').click()");
  assert.equal(site.sourceAnchor.text,"document.querySelector('[data-action=\"save\"]').click()");
  assert.equal(site.sourceAnchor.start,source.indexOf(site.sourceAnchor.text));
});

test('reports event-handler and non-statement interactions as unsupported',()=>{
  const source=`
button.addEventListener('click',()=>target.click());
function check(){const changed=target.focus();assert(changed);}
`;
  const result=transform(source,'unsupported.js');
  assert.equal(result.interactionSites.length,0);
  assert.deepEqual(result.unsupported.map(item=>item.reason),['dom-event-handler-callback','interaction-not-a-standalone-statement']);
  assert.equal(result.source,source);
  assert.equal(result.originalSHA,result.transformedSHA);
});

test('keeps blocked nested helpers synchronous and reports only their reached action',async()=>{
  const source=`
const target={click(){return 19;}};
const tap=()=>{target.click();return true;};
function check(){const completed=tap();assert(completed);}
check();
`;
  const result=transform(source,'nested-helper.js');
  assert.notEqual(result.source,source);
  assert.equal(result.interactionSites.length,0);
  assert.equal(result.syncUnsupportedSites.length,1);
  assert(result.unsupported.some(item=>item.reason.startsWith('async-propagation-unsupported')));
  assert(result.unsupported.some(item=>item.reason==='unsupported-containing-helper'));
  const got=await execute(result.source,(site,events)=>events.push(`unsupported:${site.siteId}`));
  assert.deepEqual(got,[`unsupported:${result.syncUnsupportedSites[0].siteId}`]);
  assert.match(result.source,/const tap=\(\)=>/);
});

test('does not propagate async instrumentation into a DOM handler through a helper',()=>{
  const source=`
const run=()=>{target.click();};
button.addEventListener('click',()=>run());
`;
  const result=transform(source,'handler-helper.js');
  assert.equal(result.source,source);
  assert.equal(result.interactionSites.length,0);
  assert(result.unsupported.some(item=>item.reason.includes('called from a DOM event-handler callback')));
  assert(result.unsupported.some(item=>item.reason==='unsupported-containing-helper'));
});

test('marks collection callback actions unsupported with sync-only reach telemetry',async()=>{
  const source=`items.forEach(item=>{target.click();});`;
  const result=transform(source,'iteration.js');
  assert.notEqual(result.source,source);
  assert.equal(result.interactionSites.length,0);
  assert.equal(result.syncUnsupportedSites.length,1);
  assert(result.unsupported.some(item=>item.reason.includes('inside forEach callback')));
  assert(result.unsupported.some(item=>item.reason==='unsupported-containing-helper'));
  assert.deepEqual(await execute(result.source,(site,events)=>events.push(`unsupported:${site.method}`)),['unsupported:click','click']);
});

test('keeps helpers synchronous when a later caller is blocked by a DOM handler',()=>{
  const source=`
const tap=()=>{target.click();};
function check(){tap();}
button.addEventListener('click',()=>check());
`;
  const result=transform(source,'late-blocked-caller.js');
  assert.equal(result.source,source);
  assert.equal(result.interactionSites.length,0);
  assert(result.unsupported.some(item=>item.reason.includes('DOM event-handler callback')));
  assert(result.unsupported.some(item=>item.reason.includes('caller check is blocked')));
  assert.equal(result.originalSHA,result.transformedSHA);
});

test('blocks return helper calls but preserves explicitly awaited helpers',()=>{
  const returned=`const tap=()=>{target.click();}; function check(){return tap();}`;
  const rejected=transform(returned,'return-helper.js');
  assert.match(rejected.source,/try\{globalThis\.__visualUnsupportedAction/);
  assert.match(rejected.source,/function check\(\)\{return tap\(\);\}/);
  assert(rejected.unsupported.some(item=>item.reason.includes('nested or passed as a callback')));
  const awaited=`const tap=()=>{target.click();}; async function check(){await tap();}`;
  const accepted=transform(awaited,'await-helper.js');
  assert.equal(accepted.unsupported.length,0);
  assert.equal(accepted.interactionSites.length,1);
  assert.match(accepted.source,/const tap=async/);
  assert.match(accepted.source,/async function check\(\)\{await tap\(\);\}/);
});

test('allows a registered entry to return an async helper only under the awaited-executor contract',async()=>{
  const source=`const tap=()=>{target.click();events.push('after');return 7;};const check=()=>tap();registerChecks('x',{'x/check':check});`;
  const result=transform(source,'registered-return.js',{registeredCheckEntriesAwaited:true});
  assert.equal(result.unsupported.length,0);
  assert.equal(result.interactionSites.length,1);
  const originalEvents=await execute(`${source};globalThis.value=await check();`),expected=globalThis.value;
  const actualEvents=await execute(`${result.source};globalThis.value=await check();`),actual=globalThis.value;
  assert.deepEqual(actualEvents.filter(event=>!event.startsWith('checkpoint:')&&!event.startsWith('before:')),originalEvents);
  assert.deepEqual(actualEvents.filter(event=>event.startsWith('before:')),['before:click']);
  assert.deepEqual(actualEvents.filter(event=>event.startsWith('checkpoint:')),['checkpoint:click']);
  assert.equal(expected,7);assert.equal(actual,7);
  delete globalThis.value;
  const alsoCalled=`const tap=()=>{target.click();};const check=()=>tap();check();registerChecks('x',{'x/check':check});`;
  const external=transform(alsoCalled,'external-consumer.js',{registeredCheckEntriesAwaited:true});
  assert.equal(external.interactionSites.length,0);
  assert(external.unsupported.length>0);
});

test('instruments registered dialog and tab actions under the gallery awaited-executor contract',()=>{
  const source=`
const dialog=({root})=>{root.querySelector('[data-open]').click();root.querySelector('[data-close]').click();};
const tabs=({root})=>{root.querySelector('[role=tab]').click();};
registerChecks('interaction',{'overlays/Dialog':dialog,'navigation/Tabs':tabs});
`;
  const result=transform(source,'registered-interactions.js',{registeredCheckEntriesAwaited:true});
  assert.equal(result.unsupported.length,0);
  assert.deepEqual(result.interactionSites.map(site=>site.mappedChecks),[['overlays/Dialog'],['overlays/Dialog'],['navigation/Tabs']]);
});

test('sync telemetry cannot change original action return or exception behavior',async()=>{
  const source=`const target={click(){return 19;}};const tap=()=>{target.click();return 23;};function check(){const result=tap();globalThis.value=result;}check();`;
  const result=transform(source,'return-value.js');
  assert.equal(result.syncUnsupportedSites.length,1);
  const instrumented=await execute(result.source,()=>{throw new Error('telemetry failure');});
  assert.equal(globalThis.value,23);assert.deepEqual(instrumented,[]);
  delete globalThis.value;
});

test('pairs hooks in order across adjacent statements and unbraced else branches',async()=>{
  for(const condition of ['true','false']){
    const source=`async function check(){if(${condition}){target.click();}else target.click();target.click();}await check();`;
    const result=transform(source,'adjacent.js');
    assert.equal(result.unsupported.length,0);
    assert.deepEqual(await execute(result.source),['before:click','click','checkpoint:click','before:click','click','checkpoint:click']);
  }
});

test('awaits a curried action helper through its final checkpoint and assertions',async()=>{
  const source=`const form=name=>()=>{target.click();events.push('submitted:'+name);assert(true);};const check=()=>{form('update-task')();};registerChecks('x',{'x/StatusSelect':check});`;
  const result=transform(source,'curried.js',{registeredCheckEntriesAwaited:true});
  assert.equal(result.unsupported.length,0);
  assert.equal(result.interactionSites.length,1);
  const got=await execute(`${result.source};await check();events.push('returned');`);
  assert.deepEqual(got,['before:click','click','checkpoint:click','submitted:update-task','returned']);
});

test('braces eligible unbraced for, for-of, for-in, while and do loops without moving actions',async()=>{
  for(const loop of ['for(let i=0;i<2;i++)target.click();','for(const item of [1,2])target.click();','for(const key in {a:1,b:2})target.click();','let n=0;while(n++<2)target.click();','let n=0;do target.click();while(++n<2);']){
    const source=`function check(){${loop}events.push('after');}check();`;
    const result=transform(source,'loop.js');
    assert.equal(result.unsupported.length,0);
    assert.deepEqual(await execute(result.source),['before:click','click','checkpoint:click','before:click','click','checkpoint:click','after']);
    assert.deepEqual(await execute(source),['click','click','after']);
  }
});
test('loop bracing preserves lexical loop variables and dangling else scopes',async()=>{
  for(const body of ["for(const target of [globalThis.target,globalThis.target])target.click();","if(false)for(const target of [globalThis.target])target.click();else target.click();","if(true)for(const target of [globalThis.target])if(false)target.click();else target.click();else assert(false);"]){
    const source=`function check(){${body}events.push('after');}check();`;
    const transformed=transform(source,'dangling.js');assert.equal(transformed.unsupported.length,0);
    const original=await execute(source),actual=await execute(transformed.source);
    assert.deepEqual(actual.filter(event=>!event.startsWith('before:')&&!event.startsWith('checkpoint:')),original);
  }
  const blocked=`const tap=()=>{for(const target of [globalThis.target,globalThis.target])target.click();return 7;};const value=tap();assert(value===7);`;
  const transformed=transform(blocked,'blocked-loop.js');assert.equal(transformed.interactionSites.length,0);
  assert.deepEqual(await execute(transformed.source),['click','click']);
});
test('connected native mask and forms checklist loop sites remain checkpointable',async()=>{
  for(const family of ['native','forms']){
    const source=await fixtureSource(family),result=transform(source,`${family}.js`,{registeredCheckEntriesAwaited:true});
    const line=family==='native'?39:125;
    assert(result.interactionSites.some(site=>site.line===line),`${family} actual loop interaction must be safe`);
    assert(!result.unsupported.some(site=>site.line===line&&site.reason==='unbraced-loop-body-preserved'));
  }
});

const fixtureSource=family=>readFile(new URL(`../../../../internal/gallery/assets/advanced-${family}-checks.js`,import.meta.url),'utf8');
test('maps only ArchiveViewer branch and called helpers; rejects new or missing exact actions',async()=>{
  const source=await fixtureSource('workspace');
  const contract=caseActionContract('files/ArchiveViewer',source,'workspace.js');
  assert.deepEqual(contract.mappingGaps,[]);
  assert.equal(contract.steps.length,2);
  assert(contract.steps.every(step=>step.source.owner==='domain'));
  const extra=caseActionContract('files/ArchiveViewer',source.replace('folder.click();','folder.click();folder.click();'),'workspace.js');
  assert(extra.mappingGaps.some(gap=>gap.reason==='exact-action-count-changed'));
  const other=caseActionContract('files/ArchiveViewer',source.replace('start.click();','start.click();start.click();'),'workspace.js');
  assert.deepEqual(other.mappingGaps,[],'Unselected RenameInline branch cannot add ArchiveViewer actions');
});
test('maps both synchronous editor submissions and both password helper events exactly',async()=>{
  const editor=caseActionContract('editor/CodeEditor',await fixtureSource('workspace'),'workspace.js');
  const password=caseActionContract('forms/PasswordInput',await fixtureSource('forms'),'forms.js');
  assert.deepEqual(editor.mappingGaps,[]);assert.equal(editor.steps.length,11);
  assert.equal(editor.steps.filter(step=>step.source.owner==='submitData').length,2);
  assert.equal(editor.steps[5].source.siteId,editor.steps[8].source.siteId,'One helper site has two expected invocations');
  assert.deepEqual(password.mappingGaps,[]);assert.deepEqual(password.steps.map(step=>step.source.event),['input','change','click']);
  const changed=caseActionContract('forms/PasswordInput',(await fixtureSource('forms')).replace("node.dispatchEvent(new Event('change',{bubbles:true}));};","};"),'forms.js');
  assert(changed.mappingGaps.length>0,'Removing a helper event must leave a mapping gap');
});
test('unknown guards are mapping gaps; target aliases require their actual panel/toggle contracts',async()=>{
  const source=(await fixtureSource('workspace')).replace("root.dataset.elyKind==='CodeEditor'","root.dataset.unreviewedKind==='CodeEditor'");
  assert(caseActionContract('editor/CodeEditor',source,'workspace.js').mappingGaps.some(gap=>gap.reason==='unresolved-action-guard'));
  for(const [name,index] of [['KeyboardShortcutsList',1],['ProxySettings',2],['PrivacySettings',3],['NotificationSettings',4],['StartupSettings',5],['StorageSettings',6],['ResetToDefault',6],['AdvancedSettings',7],['DeveloperMode Toggle',7]]){
    const contract=requestedStateContract(`settings/${name}`);assert.equal(contract.target[0],index);assert.equal(contract.requestedStateOnly,true);
    assert(contract.steps.some(step=>step.id==='open-target-section'));
    if(contract.target[2])assert(contract.steps.some(step=>step.id==='toggle-target'));
  }
  assert.equal(requestedStateContract('maps/MapPopup').steps[0].id,'open-popup');
  assert.equal(requestedStateContract('settings/UnreviewedAlias'),null);
});
test('inventory hashes describe consumed initial bytes and detect later matrix/coverage drift',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'elysdui-inventory-'));
  try{for(const name of ['matrix.json','coverage.json']){
    const path=join(dir,name);await writeFile(path,'{"value":1}');
    const initial=await inventoryReceipt(path);assert.equal(initial.data.value,1);
    assert.equal((await inventoryDrift(initial)).stable,true);
    await writeFile(path,'{"value":2}');const drift=await inventoryDrift(initial);
    assert.equal(initial.data.value,1);assert.equal(drift.initialSHA256,initial.sha256);assert.equal(drift.stable,false);assert.notEqual(drift.endingSHA256,initial.sha256);
  }}finally{await rm(dir,{recursive:true,force:true});}
});
test('real browser excludes twin/foreign portals, captures painted overflow, and retains unhandled errors',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:600,height:400},deviceScaleFactor:1});
    await page.setContent(`<style>body{margin:0}[role=menu]{width:30px;height:20px}#paint{position:absolute;left:10px;top:10px;width:120px;height:30px}#paint>span{display:block;width:195px;height:58px;background:red}</style>
      <article data-audit-name="fixture"><div id="main" data-ely-family="workspace"><button aria-controls="own foreign">Open</button></div><div id="twin" data-ely-family="workspace"><button aria-controls="twin-portal">Twin</button><div id="twin-panel" role="menu">Twin menu</div></div></article>
      <div id="own" role="menu" data-ely-owner="main">Own</div><div id="foreign" role="menu" data-ely-owner="twin">Foreign</div><div id="twin-portal" role="menu">Twin portal</div><div id="unrelated" data-ely-portal data-ely-owner="elsewhere">Unrelated</div><div id="paint"><span>Painted beyond root</span></div>`);
    const inventory=await page.locator('#main').evaluate(ownedOverlayInventory);
    assert.deepEqual(inventory.filter(item=>item.owned).map(item=>item.id),['own']);
    assert(inventory.filter(item=>['foreign','twin-panel','twin-portal','unrelated'].includes(item.id)).every(item=>!item.owned));
    const captured=await captureTargetPNG(page,page.locator('#paint'));
    assert.equal(captured.bounds.root.right-captured.bounds.root.left,120);
    assert.equal(captured.bounds.extendsRoot,true);assert.equal(captured.png.readUInt32BE(16),195);assert.equal(captured.png.readUInt32BE(20),58);
    await page.locator('#paint').evaluate(node=>{node.style.overflow='hidden';});
    const clipped=await captureTargetPNG(page,page.locator('#paint'));assert.equal(clipped.png.readUInt32BE(16),120);assert.equal(clipped.png.readUInt32BE(20),30);
    await page.setContent('<div data-audit-main><div id="primary" data-ely-family="forms" style="position:absolute;left:10px;top:10px;width:120px;height:30px"><span style="display:block;width:195px;height:58px">Owned overflow</span></div></div><div data-audit-twin><div id="peer" data-ely-family="forms" style="position:absolute;left:160px;top:10px;width:100px;height:58px">Foreign twin</div></div>');
    const mixed=await captureTargetPNG(page,page.locator('#primary'));assert.deepEqual(mixed.foreignDOMIntersections.map(peer=>peer.id),['peer'],'Mixed target/twin crop must be context evidence, not owned proof');
    const errors=[];page.on('pageerror',error=>errors.push({type:'pageerror',text:String(error)}));
    const happened=page.waitForEvent('pageerror');await page.evaluate(()=>setTimeout(()=>{throw new Error('unhandled audit regression');},0));await happened;
    assert.equal(unhandledBrowserErrors(errors).length,1,'An unhandled page error must enter the blocking gate input');
    assert.deepEqual(unhandledBrowserErrors([{type:'warning',text:'known CSS warning'}]),[]);
  }finally{await browser.close();}
});
test('persistent real-browser driver regression opens the requested settings panel then toggles its own control',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage();
    const labels=['Appearance','Keyboard','Network','Privacy','Notifications','Startup','Storage','Advanced'];
    await page.setContent(`<div id="selected">${labels.map((label,index)=>`<button data-ely-settings-tab="${index}">${label}</button><section data-ely-settings-panel="${index}" ${index?'hidden':''}>${label}${index===7?'<input type="checkbox" name="developer">':''}</section>`).join('')}</div>`);
    await page.evaluate(()=>document.querySelectorAll('[data-ely-settings-tab]').forEach(tab=>tab.addEventListener('click',()=>document.querySelectorAll('[data-ely-settings-panel]').forEach(panel=>{panel.hidden=panel.dataset.elySettingsPanel!==tab.dataset.elySettingsTab;}))));
    const root=page.locator('#selected'),observed=[];
    await runRequestedStateActions(requestedStateContract('settings/DeveloperMode Toggle'),root,async(label,action,verify)=>{
      await action();const state=await verify({actions:[]});const capture=await captureTargetPNG(page,root);assert(capture.png.length>0);observed.push({label,state});
    });
    assert.deepEqual(observed.map(item=>item.label),['open-target-section','toggle-target']);
    assert.equal(observed[0].state.panel,7);assert.equal(observed[1].state.before,false);assert.equal(observed[1].state.checked,true);
    assert.equal(await root.locator('[data-ely-settings-panel="0"]').isVisible(),false);
    await page.setContent('<button id="target" style="position:absolute;left:10px;top:10px;width:195px;height:58px">Reset</button><div style="position:absolute;left:80px;top:0;width:200px;height:100px">Foreign twin</div>');
    await page.locator('#target').evaluate(node=>node.addEventListener('click',()=>{node.dataset.activated='true';}));
    const activation=await clickVisibleControl(page.locator('#target'));
    assert(activation.position.x<70,'Actual click must use the unoccluded owned portion');assert.equal(await page.locator('#target').getAttribute('data-activated'),'true');
    await page.locator('#target').evaluate(node=>{delete node.dataset.activated;});
    await page.locator('div').evaluate(node=>{node.style.left='0';node.style.width='300px';});
    await assert.rejects(clickVisibleControl(page.locator('#target')),/no reachable owned pixel/);
    const keyboard=await clickVisibleControl(page.locator('#target'),{allowKeyboard:true});assert(keyboard.pointerActionabilityGap);assert.equal(await page.locator('#target').getAttribute('data-activated'),'true');
  }finally{await browser.close();}
});
