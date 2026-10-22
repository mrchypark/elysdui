import assert from 'node:assert/strict';
import {test} from 'node:test';
import {transform,staticCoverageManifest,registrationInventory,actionModuleNames,prepareActionModule,synchronousTrace,compareActionTrace,synchronousTraceInit,registeredOutcomesEqual,registeredOutcomeDifferences,firstDifference,traceContractStatus} from './visual-state-audit-instrument.mjs';
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

test('static coverage preserves alias IDs and unknown mappings without claiming unexecuted actions failed',()=>{
  const source=`const asset='/assets/example.js'; registerChecks('forms',{'forms/Field':()=>{button.click();}});`;
  const inventory={cases:[{name:'forms/Field',key:'forms/Field',family:'forms'},{name:'forms/Alias',key:'forms/Field',family:'forms'}]};
  const sources=[{name:'forms',filename:'forms.js',source}];
  const result=staticCoverageManifest(inventory,sources);
  assert.equal(result.counts.cases,2);
  assert.equal(result.counts.distinctCheckKeys,1);
  assert.equal(result.counts.checkpointed,1);
  assert.notEqual(result.modules.forms.sourceSHA256,result.modules.forms.staticAudit.sourceSHA256);
  assert.notEqual(result.modules.forms.sites[0].siteId,result.modules.forms.staticAudit.sites[0].siteId,'Static rewritten columns must be recomputed, not relabelled');
  assert.equal(result.counts.unresolvedRegistrations,0);
  assert.equal(result.counts.blockingCases,2);
  assert.equal(result.safeForFullActionClaim,false);
  assert.deepEqual(result.blockingCaseIds,['gallery:forms/Field','gallery:forms/Alias']);
  assert.deepEqual(result.cases[0].candidateSafeSiteIds,result.cases[1].candidateSafeSiteIds);
  assert.throws(()=>staticCoverageManifest({cases:[inventory.cases[0],inventory.cases[0]]},sources),/duplicate/);
  assert.throws(()=>staticCoverageManifest(inventory,[{...sources[0],source:'not javascript {'}]),/cannot parse/);
  assert.throws(()=>staticCoverageManifest(inventory,[]),/invalid inventory/);
});

test('static coverage separates unsupported diagnostics and routed tooling from exact contract proof',()=>{
  const sources=[{name:'native',filename:'native.js',source:`registerChecks('native',{'shell/A':()=>{return button.click();}});`},
    {name:'native-tooling',filename:'tooling.js',source:`registerChecks('native',{'tooling/B':()=>{button.click();}});`}];
  const inventory={cases:[{name:'shell/A',key:'shell/A',family:'native'},{name:'tooling/B',key:'tooling/B',family:'native'}]};
  const report=staticCoverageManifest(inventory,sources,identity=>identity==='shell/A'?{steps:[{source:{siteId:'native.js:1:47:click'}}],mappingGaps:[]}:null);
  assert.equal(report.counts.unsupportedActionSites,1);
  assert.equal(report.counts.casesWithCandidateUnsupportedSites,1);
  assert.equal(report.counts.exactContracts,1);
  assert.deepEqual(report.cases[1].registeredModules,['native-tooling']);
  assert(!report.cases[1].blockers.some(gap=>gap.reason==='registered-module-not-transformed-by-action-runner'));
  assert.equal(report.safeForFullActionClaim,false);
});

test('bounded registration mapping handles table factories, assignments and add/set writers without executing checks',()=>{
  const fixtures=[
    `const names={layout:{Stack:['selector','action'],Flex:['selector']}}; registerChecks('foundation',Object.fromEntries([...Object.entries(names.layout).map(([name,[selector,action]])=>[\`layout/\${name}\`,check(selector,action)])]));`,
    `const stories={menus:['Menu','MenuAlias']}; const checks=Object.fromEntries(Object.entries(stories).flatMap(([chapter,names])=>names.map(name=>[\`\${chapter}/\${name}\`,ctx=>check(ctx)]))); registerChecks('interaction',checks);`,
    `const names={lists:['List','Tree']}; const checks={}; for(const [chapter,names] of Object.entries(names))for(const name of names)checks[chapter+'/'+name]=()=>{throw new Error('never execute')}; registerChecks('data',checks);`,
    `const checks={};const groups={fields:['Input','Password']};const set=(chapter,names,check)=>names.forEach(name=>checks[\`\${chapter}/\${name}\`]=check);set('forms',groups.fields,field);checks['forms/Input']=override;registerChecks('forms',checks);`,
  ];
  assert.deepEqual(fixtures.map(source=>registrationInventory(source).entries.map(item=>item.key)),[['layout/Stack','layout/Flex'],['menus/Menu','menus/MenuAlias'],['lists/List','lists/Tree'],['forms/Input','forms/Password']]);
  assert(registrationInventory(`registerChecks('data',unknownFactory());`).unresolved.length);
  assert.deepEqual(registrationInventory(`const checks={};if(flag)checks['lists/A']=check;registerChecks('data',checks);checks['lists/Late']=check;`).entries,[],'Unknown conditional and post-registration writes cannot establish registered IDs');
  assert(registrationInventory(`const a=b,b=a;registerChecks('data',a);`).unresolved.some(item=>item.reason==='cyclic-registration-binding'));
  assert.throws(()=>registrationInventory(`registerChecks('data',{'lists/A':check});registerChecks('data',{'lists/A':check});`),/duplicate registered/);
});

test('native tooling route and source/AST hash guards fail closed before browser startup',()=>{
  assert.deepEqual(actionModuleNames('native'),['native','native-tooling']);
  const source=`const asset='/assets/a.js';registerChecks('native',{'tooling/A':()=>{button.click();}});`;
  const manifest=staticCoverageManifest({cases:[{name:'tooling/A',key:'tooling/A',family:'native'}]},[{name:'native',filename:'internal/gallery/assets/advanced-native-checks.js',source}]);
  for(const surface of ['live-audit','static-audit'])assert.equal(prepareActionModule('native',source,manifest,surface).name,'native');
  assert.throws(()=>prepareActionModule('native',source+' ',manifest,'live-audit'),/source hash mismatch/);
  assert.throws(()=>prepareActionModule('native-tooling',source,manifest,'live-audit'),/source hash mismatch/);
  const tampered=structuredClone(manifest);tampered.modules.native.staticAudit.sites=[];
  assert.throws(()=>prepareActionModule('native',source,tampered,'static-audit'),/AST\/hash mismatch/);
  const wrongRegistration=structuredClone(manifest);wrongRegistration.modules.native.registeredChecks=[];
  assert.throws(()=>prepareActionModule('native',source,wrongRegistration,'live-audit'),/registration mismatch/);
});

test('existing sync telemetry is not an independent complete original-action denominator',async()=>{
  const safe=`function check(){target.click();target.click();}check();`;
  const transformed=transform(safe,'safe-trace.js');
  assert.equal(transformed.interactionSites.length,2);
  assert.equal(transformed.syncUnsupportedSites.length,0,'Safe sites are not part of existing unsupported telemetry');
  const unsafe=`function check(){true&&target.click();}check();`;
  const blocked=transform(unsafe,'unsafe-trace.js');
  assert.equal(blocked.source,unsafe);
  assert.equal(blocked.syncUnsupportedSites.length,0,'Reached non-statement actions currently have no probe');
  assert.deepEqual(await execute(unsafe),['click']);
  const outcome=count=>{let checked=false;for(let i=0;i<count;i++)checked=!checked;return {checked,hostEvents:[]};};
  assert.deepEqual(outcome(2),outcome(0),'Equal final semantics and host events cannot prove all intermediate actions ran');
});

test('optional click caches receivers once, preserves this and emits no nullish hooks',async()=>{
  const traces=[];globalThis.__visualSyncTrace=(site,phase)=>traces.push({siteId:site.siteId,phase});
  try{
    for(const value of ['null','undefined',`{name:'receiver',get click(){events.push('method-get');return function(){assert(this.name==='receiver');events.push('clicked');};}}`]){
      const source=`let reads=0;Object.defineProperty(globalThis,'optionalReceiver',{configurable:true,get(){reads++;return ${value};}});async function check(){optionalReceiver?.click();assert(reads===1);}try{await check();}finally{delete globalThis.optionalReceiver;}`;
      const original=await execute(source),transformed=transform(source,'optional.js'),trace=synchronousTrace(source,'optional.js');
      assert.equal(transformed.interactionSites.length,1);assert.equal(transformed.unsupported.length,0);
      assert.equal(trace.sites[0].traceKind,'statement');
      assert.equal(transformed.interactionSites[0].siteId,trace.sites[0].siteId);
      assert.equal(transformed.interactionSites[0].sourceAnchor.text,'optionalReceiver?.click()');
      const captured=await execute(transformed.source);
      assert.deepEqual(captured.filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
      traces.length=0;assert.deepEqual(await execute(trace.source),original);
      if(value==='null'||value==='undefined'){assert.deepEqual(captured,[]);assert.deepEqual(traces,[]);}
      else {assert.deepEqual(captured,['before:click','method-get','clicked','checkpoint:click']);assert.deepEqual(traces.map(event=>event.phase),['enter','exit']);}
    }
    for(const receiver of [`Object.defineProperty(globalThis,'optionalReceiver',{configurable:true,get(){throw new Error('receiver failed');}});`,`globalThis.optionalReceiver={get click(){throw new Error('method failed');}};`,`globalThis.optionalReceiver={};`]){
      const source=`${receiver}async function check(){optionalReceiver?.click();}try{await check();}catch(error){events.push(error.name+':'+error.message);}finally{delete globalThis.optionalReceiver;}`;
      const original=await execute(source),captured=await execute(transform(source,'throw.js').source);
      assert.deepEqual(captured.filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
      assert(!captured.includes('checkpoint:click'),'Throwing actions have no completed after hook');
      traces.length=0;assert.deepEqual(await execute(synchronousTrace(source,'throw.js').source),original);
      assert(!traces.some(event=>event.phase==='exit'));
      if(receiver.includes('receiver failed'))assert.deepEqual(traces,[],'Receiver exceptions occur before all hooks');
    }
  }finally{delete globalThis.__visualSyncTrace;delete globalThis.optionalReceiver;}
});

test('optional click keeps complex, optional-method, argument and callback sites unsupported',()=>{
  for(const source of [
    `async function check(){box.node?.click();}await check();`,
    `async function check(){lookup()?.click();}await check();`,
    `async function check(){node.click?.();}await check();`,
    `async function check(){node?.click('argument');}await check();`,
    `async function check(){node?.['click']();}await check();`,
    `async function check(){globalThis?.click();}await check();`,
    `button.addEventListener('click',()=>{node?.click();});`,
    `items.forEach(()=>{node?.click();});`,
    `const tap=()=>node?.click();tap();`,
    `function* check(){node?.click();}check().next();`,
  ]){
    const transformed=transform(source,'unsupported-optional.js');
    assert.equal(transformed.interactionSites.length,0);
    assert(transformed.unsupported.some(site=>site.siteId));
    assert(synchronousTrace(source,'unsupported-optional.js').sites.every(site=>site.traceKind==='unsafe-region'));
  }
});

test('optional click preserves collision-free block scope, loops, dangling else and ordered occurrences',async()=>{
  const source=`let count=0;const node={click(){events.push('click'+(++count));}};async function check(){const __visualOptionalTarget_0='caller';if(true)for(const value of [1,2])if(value)node?.click();else events.push('wrong');else events.push('outer-wrong');node?.click();assert(__visualOptionalTarget_0==='caller');}await check();`;
  const at=source.indexOf('node?.click()'),withCollision=source+`const __visualOptionalTarget_${at}=7;`;
  const traces=[];globalThis.__visualSyncTrace=(site,phase)=>traces.push({siteId:site.siteId,phase});
  try{
    const original=await execute(source),captured=await execute(transform(source,'scope.js').source);
    assert.deepEqual(original,['click1','click2','click3']);
    assert.deepEqual(captured,['before:click','click1','checkpoint:click','before:click','click2','checkpoint:click','before:click','click3','checkpoint:click']);
    assert.deepEqual(await execute(synchronousTrace(source,'scope.js').source),original);
    assert.equal(traces.length,6);
    const shadowed=`async function check(undefined){undefined?.click();}await check({click(){events.push('shadowed');}});`;
    assert.deepEqual((await execute(transform(shadowed,'shadow.js').source)).filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),await execute(shadowed));
    assert.deepEqual(await execute(synchronousTrace(shadowed,'shadow.js').source),await execute(shadowed));
    assert(transform(withCollision,'collision.js').source.includes(`const __visualOptionalTarget_${at}_=node`));
    assert(synchronousTrace(withCollision,'collision.js').source.includes(`const __visualOptionalTarget_${at}_=node`));
    assert.deepEqual((await execute(transform(withCollision,'collision.js').source)).filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
  }finally{delete globalThis.__visualSyncTrace;}
});

test('optional click promotes only seven real gallery sites and preserves original anchors',async()=>{
  const filename='internal/gallery/assets/advanced-interaction-checks.js';
  const source=await readFile(new URL('../../../../'+filename,import.meta.url),'utf8');
  const transformed=transform(source,filename,{registeredCheckEntriesAwaited:true}),trace=synchronousTrace(source,filename);
  const promoted=transformed.interactionSites.filter(site=>/^[A-Za-z_$][\w$]*\?\.click\(\)$/.test(site.sourceAnchor.text));
  assert.deepEqual(promoted.map(site=>site.line),[123,133,135,137,140,230,277]);
  assert.equal(transformed.interactionSites.length,168);
  assert.equal(transformed.unsupported.filter(site=>site.siteId).length,7,'Four complex chains and three blocked Lottie sites remain unsupported');
  for(const site of promoted){
    assert.equal(source.slice(site.sourceAnchor.start,site.sourceAnchor.end),site.sourceAnchor.text);
    assert.equal(trace.sites.find(other=>other.siteId===site.siteId)?.traceKind,'statement');
  }
});

test('sync trace preserves repeats, loop scoping, return values and synchronous callback scheduling',async()=>{
  const traces=[];globalThis.__visualSyncTrace=(site,phase)=>traces.push({siteId:site.siteId,phase});
  try{
    const source=`function check(){for(const item of items)target.click();target.click();}check();`;
    const traced=synchronousTrace(source,'trace.js');
    assert(!traced.source.includes('await '));assert(!traced.source.includes('async '));
    assert.deepEqual(await execute(traced.source),await execute(source));
    assert.deepEqual(traces.map(event=>event.phase),['enter','exit','enter','exit']);
    traces.length=0;
    const expression=`const tap=()=>\n(target.click());assert(tap()===19);items.forEach(()=>{target.click();});`;
    assert.deepEqual(await execute(synchronousTrace(expression,'expression.js').source),await execute(expression));
    assert(traces.every(event=>event.phase==='unsafe'),'Expression-return and collection callbacks remain explicit unsafe regions');
    traces.length=0;
    const nested=`const tap=()=>target.click(target.click());tap();`;
    assert.deepEqual(await execute(synchronousTrace(nested,'nested.js').source),await execute(nested));
    assert.equal(traces.length,2);assert(traces.every(event=>event.phase==='unsafe'));
    const skipped=`function check(){false&&target.click();}check();`;
    assert.deepEqual(await execute(synchronousTrace(skipped,'skip.js').source),[]);
    assert(traces.some(event=>event.phase==='unsafe'),'Conservative reach is not proof a short-circuit call ran');
  }finally{delete globalThis.__visualSyncTrace;}
});

test('trace comparator requires exact ordered occurrences, verified semantics and owned before/after images',()=>{
  const events=[{siteId:'a',phase:'enter'},{siteId:'a',phase:'exit'},{siteId:'a',phase:'enter'},{siteId:'a',phase:'exit'}];
  const receipt={siteId:'a',captureStatus:'captured',beforeCaptureStatus:'captured',afterCaptureStatus:'captured',beforeCaptureOwnership:{ownedStateEvidence:true},afterCaptureOwnership:{ownedStateEvidence:true}};
  const proof={originalEvents:events,capturedEvents:events,receipts:[receipt,receipt],originalEquivalent:true,unprobed:[],knownSiteIds:['a'],lateEvents:[]};
  assert.equal(compareActionTrace(proof).status,'passed');
  assert.equal(compareActionTrace(proof).independentContractCoverage,'not-established-by-trace');
  assert.equal(compareActionTrace({...proof,receipts:[receipt]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,capturedEvents:events.slice(0,2)}).status,'blocked');
  assert.equal(compareActionTrace({...proof,originalEquivalent:false}).status,'blocked');
  assert.equal(compareActionTrace({...proof,unprobed:['unknown']}).status,'blocked');
  assert.equal(compareActionTrace({...proof,knownSiteIds:[]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,lateEvents:[{siteId:'a',phase:'enter'}]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,receipts:[{...receipt,afterCaptureOwnership:{ownedStateEvidence:false}},receipt]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,originalEvents:[{siteId:'x',phase:'unsafe'}]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,originalEvents:[],capturedEvents:[],receipts:[]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,originalEvents:events.slice(0,3)}).status,'blocked');
});

test('sync trace keeps microtask/handler ordering and fails visibly on action or probe exceptions',async()=>{
  const traces=[];globalThis.__visualSyncTrace=(site,phase)=>traces.push({siteId:site.siteId,phase});
  try{
    for(const source of [
      `function check(){Promise.resolve().then(()=>events.push('micro'));target.click();events.push('assert');}check();`,
      `const handlers=[];const button={addEventListener(_,handler){handlers.push(handler)}};button.addEventListener('click',()=>{target.click();});handlers[0]();`,
      `function check(){label:for(const item of items){target.click();break label;}}check();`,
    ])assert.deepEqual(await execute(synchronousTrace(source,'timing.js').source),await execute(source));
    traces.length=0;
    const receiver=`const box={get control(){target.click();return target}};function check(){box.control.click();}check();`;
    assert.deepEqual(await execute(synchronousTrace(receiver,'receiver.js').source),await execute(receiver));
    assert(traces.some(event=>event.phase==='unsafe'),'Receiver/getter evaluation cannot be mistaken for method invocation order');
    const throwing=`const node={click(){throw new Error('action failed')}};function check(){node.click();}check();`;
    await assert.rejects(execute(throwing),/action failed/);
    await assert.rejects(execute(synchronousTrace(throwing,'throws.js').source),/action failed/);
    globalThis.__visualSyncTrace=()=>{throw new Error('probe failed')};
    await assert.rejects(execute(synchronousTrace(`function check(){target.click();}check();`,'probe.js').source),/probe failed/);
  }finally{delete globalThis.__visualSyncTrace;}
});

test('page-local sync collector pins source hashes, case ordinals, errors and sealed late events',()=>{
  synchronousTraceInit();
  try{
    const site={siteId:'a',sourceSHA256:'source'};
    globalThis.__visualSyncTrace(site,'enter');
    assert.equal(globalThis.__visualSyncTraceState.events.length,0,'Module-load events are not attributed to a case');
    Object.assign(globalThis.__visualSyncTraceState,{caseId:'fixture',known:{a:'source'}});
    globalThis.__visualSyncTrace(site,'enter');globalThis.__visualSyncTrace(site,'exit');
    assert.deepEqual(globalThis.__visualSyncTraceState.events.map(event=>[event.caseId,event.ordinal,event.phase]),[['fixture',1,'enter'],['fixture',2,'exit']]);
    assert.throws(()=>globalThis.__visualSyncTrace({...site,sourceSHA256:'changed'},'enter'),/Invalid synchronous trace/);
    assert.equal(globalThis.__visualSyncTraceState.errors.length,1);
    globalThis.__visualSyncTraceState.events.length=16384;
    assert.throws(()=>globalThis.__visualSyncTrace(site,'enter'),/trace event budget exceeded/);
    assert(globalThis.__visualSyncTraceState.errors.includes('trace event budget exceeded'));
    Object.assign(globalThis.__visualSyncTraceState,{caseId:null,sealed:true});
    globalThis.__visualSyncTrace(site,'enter');
    assert.equal(globalThis.__visualSyncTraceState.lateEvents.length,1);
  }finally{delete globalThis.__visualSyncTrace;delete globalThis.__visualSyncTraceState;}
});

test('untouched calibration compares every existing semantic, result, payload and twin field',()=>{
  const reference={initial:{text:'initial'},finalTwin:{text:'twin'},result:{checkResult:{passed:true},actions:[{entries:[['content','first\nsecond']]}],hostEvents:[{value:'caller'}],finalState:{caret:4}}};
  assert(registeredOutcomesEqual(reference,structuredClone(reference)));
  for(const field of ['initial','finalTwin']){const changed=structuredClone(reference);changed[field]={text:'changed'};assert(!registeredOutcomesEqual(reference,changed));}
  for(const field of ['checkResult','actions','hostEvents','finalState']){const changed=structuredClone(reference);changed.result[field]=null;assert(!registeredOutcomesEqual(reference,changed));}
  assert(!registeredOutcomesEqual(reference,null));
});

test('calibration diagnoses EventLogger time and twin changes without normalizing either',()=>{
  const reference={initial:{text:'Type here'},finalTwin:{text:'Empty',controls:[{value:''}]},result:{checkResult:{assertions:9},actions:[],hostEvents:[],finalState:{text:'+0.00s key down 54'}}};
  assert.deepEqual(registeredOutcomeDifferences(reference,structuredClone(reference)),[]);
  const traced=structuredClone(reference);
  traced.result.finalState.text='+0.01s key down 54';
  assert(!registeredOutcomesEqual(reference,traced));
  assert.deepEqual(registeredOutcomeDifferences(reference,traced),[{path:'$.result.finalState.text',original:'"+0.00s key down 54"',instrumented:'"+0.01s key down 54"'}]);
  traced.finalTwin.controls[0].value='changed';
  assert.deepEqual(registeredOutcomeDifferences(reference,traced).map(item=>item.path),['$.finalTwin.controls[0].value','$.result.finalState.text']);
  assert.equal(registeredOutcomeDifferences(reference,null)[0].reason,'missing-registered-outcome');
  for(const field of ['checkResult','actions','hostEvents','finalState'])traced.result[field]={changed:'x'.repeat(1000)};
  traced.initial={changed:true};
  const differences=registeredOutcomeDifferences(reference,traced);
  assert.equal(differences.length,6,'At most one bounded first difference per exact calibration field');
  assert(differences.every(item=>item.original.length<=180&&item.instrumented.length<=180));
  assert.equal(firstDifference({items:[1,2]},{items:[1,3]}).path,'$.items[1]');
});

test('passing reached traces never close independent contracts or relax the three existing exact drivers',()=>{
  const events=[{siteId:'a',phase:'enter'},{siteId:'a',phase:'exit'},{siteId:'b',phase:'unsafe'}];
  const contract={mappingGaps:[],steps:[{source:{siteId:'a'}},{source:{siteId:'b'}}]};
  assert.deepEqual(traceContractStatus(null,events,true,[]),{independentContractGap:true,traceCalibrationValid:false});
  assert.deepEqual(traceContractStatus(contract,events,true,[]),{independentContractGap:false,traceCalibrationValid:true});
  for(const changed of [events.slice(0,2),[...events,events[2]],events.toReversed(),[]])assert.equal(traceContractStatus(contract,changed,true,[]).traceCalibrationValid,false);
  assert.equal(traceContractStatus(contract,events,false,[]).traceCalibrationValid,false);
  assert.equal(traceContractStatus(contract,[events[0],events[2]],true,[]).traceCalibrationValid,false,'An exact contract never excuses a missing synchronous exit');
  assert.equal(traceContractStatus(contract,events,true,[{siteId:'late'}]).traceCalibrationValid,false);
  assert.equal(traceContractStatus({...contract,mappingGaps:[{reason:'unknown-guard'}]},events,true,[]).traceCalibrationValid,false);
});

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

test('action cameras distinguish covered foreign paint, exposed corners and empty clips without DOM isolation',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:600,height:400}});
    await page.setContent(`<style>body{margin:0}#main{width:500px;height:30px}#panel{position:absolute;left:0;top:35px;width:200px;height:120px;background:white;border:1px solid black;border-radius:8px;z-index:2}#peer{position:absolute;top:60px;width:500px;height:30px}#peer button{margin-left:20px}#outside{position:absolute;top:250px}</style>
      <div data-audit-main><div id="main" data-ely-family="interaction"><span id="nested"><button aria-controls="panel">Open</button></span><aside id="panel" role="region"><strong>Owned source content</strong></aside></div></div>
      <div data-audit-twin><div id="peer" data-ely-family="interaction"><button>Twin content</button></div></div>
      <div data-audit-twin><div id="outside" data-ely-family="interaction"><div role="menu">Unrelated outside camera</div></div></div>
      <aside id="nested-portal" role="region" data-ely-owner="nested" style="position:absolute;top:300px">Nested owner portal</aside>`);
    const originalHTML=await page.content(),inventory=await page.locator('#main').evaluate(ownedOverlayInventory);
    assert.deepEqual(inventory.filter(item=>item.owned).map(item=>item.id),['panel','nested-portal']);
    assert.equal(inventory.find(item=>item.id==='panel').openerReferences[0].ariaControls,'panel');
    const context=await captureTargetPNG(page,page.locator('#main'));
    assert(context.foreignDOMIntersections.some(item=>item.id==='peer'),'Broad root image retains exposed twin paint as context');
    const panel=await captureTargetPNG(page,page.locator('#panel'));
    assert.deepEqual(panel.foreignDOMIntersections,[],'Opaque higher-stacked panel covers the twin paint, not merely its layout box');
    assert(panel.occludedForeignPaint.some(item=>item.id==='peer'));
    assert.equal(await page.content(),originalHTML,'Camera must not hide, resize, detach or mutate either instance');
    for(const position of ['sticky','fixed']){
      await page.locator('#main').evaluate((node,position)=>{node.style.position=position;},position);
      assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Unmodelled auto-z ancestor stacking contexts cannot clear foreign paint');
      await page.locator('#main').evaluate(node=>{node.style.position='';});
    }
    for(const [selector,property,value] of [['#main','isolation',['iso','late'].join('')],['#main','overflow','hidden'],['#main','overflow','clip'],['#main','maskImage','linear-gradient(black,transparent)'],['body','overflow','hidden'],['body','clipPath','inset(10px round 8px)']]){
      await page.locator(selector).evaluate((node,{property,value})=>{node.style[property]=value;},{property,value});
      assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Owned ancestor stacking contexts or ancestor clipping/masks must disable subtraction');
      await page.locator(selector).evaluate((node,property)=>{node.style[property]='';},property);
    }
    await page.locator('#panel').evaluate(node=>{node.style.background='transparent';});
    assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Transparent panel cannot hide foreign paint');
    await page.locator('#panel').evaluate(node=>{node.style.background='white';});
    await page.evaluate(()=>{const portal=document.createElement('aside');portal.id='foreign-portal';portal.dataset.elyPortal='';portal.dataset.elyOwner='peer';portal.style.cssText='position:absolute;left:30px;top:65px;width:40px;height:20px;background:red;z-index:3';document.body.append(portal);});
    assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='foreign-portal'),'A detached foreign portal inside the pixels must block ownership');
    await page.locator('#foreign-portal').evaluate(node=>node.remove());
    for(const topLayer of ['dialog','popover']){
      await page.evaluate(kind=>{const foreign=document.createElement(kind==='dialog'?'dialog':'aside');foreign.id='foreign-top-layer';foreign.dataset.elyPortal='';foreign.dataset.elyOwner='peer';foreign.textContent='Foreign top layer';foreign.style.cssText='position:fixed;left:30px;top:65px;width:40px;height:20px;margin:0;background:red;z-index:auto';document.body.append(foreign);if(kind==='dialog')foreign.showModal();else{foreign.popover='auto';foreign.showPopover();}},topLayer);
      assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='foreign-top-layer'),'A foreign top layer with auto z-index is never below a normal owned panel');
      await page.locator('#foreign-top-layer').evaluate(node=>node.remove());
    }
    await page.locator('#peer').evaluate(node=>{node.style.zIndex='3';});
    assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Foreign stacking above panel must block ownership');
    await page.locator('#peer').evaluate(node=>{node.style.zIndex='';node.style.top='150px';node.style.background='red';});
    assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Paint exposed through a rounded corner remains blocking');
    await page.setContent(`<style>body{margin:0}#main{height:40px;width:200px}#submit{position:absolute;top:40px;left:0;width:2px;height:28px;clip-path:inset(50%);overflow:hidden}</style><div data-audit-main><div id="main" data-ely-family="communication"><select><option>Done</option></select><button id="submit">Update</button></div></div><div data-audit-twin><div id="peer" data-ely-family="communication" style="position:absolute;top:60px">Twin</div></div>`);
    const clipped=await captureTargetPNG(page,page.locator('#main'));
    assert.equal(clipped.bounds.clip.height,40);assert.deepEqual(clipped.foreignDOMIntersections,[]);
    await page.locator('#submit').evaluate(node=>{node.style.clipPath='none';});
    const visible=await captureTargetPNG(page,page.locator('#main'));
    assert(visible.bounds.clip.height>=68,'Unclipped submit pixels must remain in the camera');
    assert(visible.foreignDOMIntersections.some(item=>item.id==='peer'));
    await page.setContent('<style>body{margin:0;height:2400px}#radio{position:absolute;top:1200px;width:200px;height:32px}</style><div data-audit-main><div id="radio" data-ely-family="interaction" data-ely-component="menus/RadioMenuItem"><button>View</button></div></div>');
    const radioHTML=await page.content();
    await captureTargetPNG(page,page.locator('#radio'));
    assert(await page.locator('#radio').evaluate(node=>Math.abs(node.getBoundingClientRect().bottom-innerHeight)<1),'Finite Radio camera must leave room for the production menu upward collision placement');
    assert.equal(await page.content(),radioHTML,'Radio camera uses scrolling only, never instance isolation or DOM mutation');
  }finally{await browser.close();}
});
