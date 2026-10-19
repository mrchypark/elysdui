import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildPaletteSchemaFixture} from './palette-query-evidence-test.mjs';
import {paletteOwner, paletteRows, paletteErrors} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';
import {reentryMutationMetadata, reentryRuntimePath, reentryRuntimeSourcePath} from '../ui/gohtmx/tests/browser/palette-query-reentry-mutants.mjs';
import {reentrySourcePaths} from '../ui/gohtmx/tests/browser/palette-query-reentry-inputs.mjs';
import {reentryCase, reentryClassification, reentryOracles, reconstructReentryWrites, verifyReentryEvidence} from '../ui/gohtmx/tests/browser/palette-query-reentry-evidence.mjs';
const copy=value=>structuredClone(value), sha=value=>createHash('sha256').update(value).digest('hex');
const metadata=path=>{const value='synthetic schema only: '+path;return {sourceSHA256:sha(value),servedSHA256:sha(value),bytes:Buffer.byteLength(value)};};
export function buildReentrySchemaFixture(surface='go-qualified',red=false){
  const baseline=buildPaletteSchemaFixture(surface,'focus').trusted, owner=paletteOwner(surface), queryID=owner+'-palette-query', openID=owner+'-palette-option-0', optionID=owner+'-palette-option-1';
  const before={openerToken:60,openerID:'',openerValue:'',ownerToken:1,ownerID:owner,ready:'true',queryToken:2,queryID,query:'op',focusedToken:2,focusedID:queryID,focusedValue:'op',controls:owner+'-palette-results',listID:owner+'-palette-results',activeID:openID,activeToken:11,open:true,
    rows:paletteRows().map((row,i)=>({token:11+i,id:owner+'-palette-option-'+i,value:row.value,role:'option',selected:i===0?'true':'false',connected:true,inOwner:true,inList:true,hidden:i===4,disabled:row.disabled})),old:null,oldRowToken:null};
  const tab=copy(before);Object.assign(tab,{focusedToken:11,focusedID:openID,focusedValue:'open-file'});
  const started=copy(before);started.rows[0].selected='false';started.rows[1].selected='true';started.old=copy(started.rows[1]);started.oldRowToken=30;
  const returned=copy(started);returned.ready=null;returned.old.connected=returned.old.inOwner=returned.old.inList=false;returned.rows[1].token=20;returned.rows[1].selected='false';
  const final=copy(returned);final.ready='true';final.rows[0].selected='true';
  const raw={before,tab,fragment:{path:'/fragment',status:200,bytes:baseline.fixtures['/fragment'].bytes,sha256:baseline.fixtures['/fragment'].servedSHA256,ownerCount:1,peerCount:0,optionCount:1,optionID,optionSelected:'false'},log:{events:[],batches:[]},final,baseTrace:{actions:[],hosts:[],results:[],errors:[]}};
  const peerID=paletteOwner(surface,'peer'),peer=copy(before);Object.assign(peer,{openerToken:61,ownerToken:50,ownerID:peerID,queryToken:51,queryID:peerID+'-palette-query',query:'',controls:peerID+'-palette-results',listID:peerID+'-palette-results',activeID:peerID+'-palette-option-0',activeToken:40,open:false});
  peer.rows=paletteRows('peer').map((row,i)=>({token:40+i,id:peerID+'-palette-option-'+i,value:row.value,role:'option',selected:i===0?'true':'false',connected:true,inOwner:true,inList:true,hidden:false,disabled:row.disabled}));raw.peerBefore=copy(peer);raw.peerAfter=copy(peer);
  let sequence=0;
  const event=(phase,state,extra={})=>{const result={sequence:++sequence,phase,...extra,state:copy(state)};raw.log.events.push(result);return result;};
  const native=(phase,key,state)=>event(phase,state,{trusted:true,key,targetToken:state.focusedToken,targetID:state.focusedID,targetValue:state.focusedValue,targetTag:state.focusedToken===2?'INPUT':'BUTTON',targetConnected:true,targetFocused:true,ctrl:false,alt:false,shift:false,meta:false});
  native('focus',null,{...before,focusedToken:before.openerToken,focusedID:'',focusedValue:''});
  native('focus',null,before);
  for(const key of ['o','p'])for(const phase of ['keydown','keyup'])native(phase,key,before);
  native('keydown','Tab',before);native('focus',null,tab);native('keyup','Tab',tab);
  const installed=copy(tab);installed.old=copy(installed.rows[1]);installed.oldRowToken=30;event('installed',installed);
  const arrowEntry=native('keydown','ArrowDown',installed);native('focus',null,started);const focusEntry=event('query-focus-listener',started,{trusted:true});
  const scheduled=event('pre-swap-microtask-scheduled',started,{sourceArrowSequence:arrowEntry.sequence,sourceFocusSequence:focusEntry.sequence,queryToken:2});
  event('ely:cleanup',{...started,ready:null});
  event('htmx:before:swap',{...started,ready:null},{inFocus:true,contextTargetSame:true,tasks:[{targetSame:true,targetToken:30,style:'outerHTML'}]});
  raw.log.batches.push({sequence:++sequence,reason:'native-focus-return',records:[
    {type:'attributes',targetToken:11,attribute:'aria-selected',oldValue:'true',finalValue:'false'},
    {type:'attributes',targetToken:12,attribute:'aria-selected',oldValue:'false',finalValue:'true'},
    {type:'childList',targetToken:3,added:[31],removed:[30]},
  ],nodes:[...copy(returned.rows),copy(returned.old)],state:copy(returned)});
  event('native-focus-return',returned,{oldRowConnected:false,oldRowParent:false});
  const checkpoint=copy(returned);
  if(red) {
    checkpoint.activeID=optionID;checkpoint.activeToken=20;
    raw.log.batches.push({sequence:++sequence,reason:'observer-callback',records:[{type:'attributes',targetToken:2,attribute:'aria-activedescendant',oldValue:openID,finalValue:optionID}],nodes:[...copy(checkpoint.rows),copy(checkpoint.old)],state:copy(checkpoint)});
  }
  event('arrow-continuation-return',checkpoint,{trusted:true,targetToken:11,scheduleSequence:scheduled.sequence,sourceArrowSequence:arrowEntry.sequence,sourceFocusSequence:focusEntry.sequence,queryToken:2,inFocus:false});
  raw.log.batches.push({sequence:++sequence,reason:'observer-callback',records:[
    {type:'attributes',targetToken:11,attribute:'aria-selected',oldValue:'false',finalValue:'true'},
    {type:'attributes',targetToken:2,attribute:'aria-activedescendant',oldValue:red?optionID:openID,finalValue:openID},
  ],nodes:[...copy(final.rows),copy(final.old)],state:copy(final)});
  event('htmx:after:swap',final,{inFocus:false,contextTargetSame:true,tasks:[{targetSame:true,targetToken:30,style:'outerHTML'}]});
  event('htmx:finally:swap',final,{inFocus:false,contextTargetSame:true,tasks:[{targetSame:true,targetToken:30,style:'outerHTML'}]});
  event('document-arrow-bubble',final,{trusted:true,targetToken:11});
  native('keyup','ArrowDown',final);
  const assets={...baseline.assets,'/reentry-observer.js':{...metadata('observer'),contentType:'text/javascript; charset=utf-8'}};
  for(const path of ['/assets/ely/fonts/Inter-Regular.ttf','/assets/ely/fonts/Inter-SemiBold.ttf'])assets[path]={...metadata(path),contentType:'font/ttf'};
  const mutation=reentryMutationMetadata('control');
  baseline.sourceFiles[reentryRuntimeSourcePath]=mutation.sourceSHA256;
  assets[reentryRuntimePath]={...assets[reentryRuntimePath],sourceSHA256:mutation.sourceSHA256,servedSHA256:mutation.servedSHA256};
  const report={mode:'control',mutation,suite:'palette-query-reentry' ,classification:reentryClassification,surface,stage:'checks',runToken:'synthetic-reentry-schema-no-browser-proof',revision:baseline.revision,tree:baseline.tree,dirty:'',sourceFiles:baseline.sourceFiles,reentrySourceFiles:Object.fromEntries(reentrySourcePaths.map(path=>[path,sha('source: '+path)])),assets,fixtures:baseline.fixtures,fixtureManifest:baseline.fixtureManifest,standaloneDependencyProof:baseline.standaloneDependencyProof,toolchain:baseline.toolchain,browserVersion:'synthetic-schema-only',caseInventory:[reentryCase],checks:[{name:reentryCase,raw,finalCapture:{log:copy(raw.log),baseTrace:copy(raw.baseTrace)}}],requests:[],browserResponses:[],httpAssetProof:[],...Object.fromEntries(paletteErrors.map(key=>[key,[]]))};
  const paths=[...Object.keys(assets),...Object.keys(report.fixtures)],browserPaths=['/',...Object.keys(assets),'/fragment'];
  const proof=path=>{const entry=assets[path]||report.fixtures[path];return {path,status:200,bytes:entry.bytes,expectedSHA256:entry.servedSHA256,receivedSHA256:entry.servedSHA256};};
  for(const path of paths)report.httpAssetProof.push(proof(path));for(const path of browserPaths)report.browserResponses.push(proof(path));
  for(const [phase,list]of [['preflight',paths],['browser',browserPaths]])for(const path of list){const entry=assets[path]||report.fixtures[path];report.requests.push({phase,path,method:'GET',htmx:null,status:200,responseSHA256:entry.servedSHA256,responseBytes:entry.bytes});}
  const trusted=copy(Object.fromEntries(['surface','revision','tree','runToken','mode','mutation','sourceFiles','reentrySourceFiles','assets','fixtures','fixtureManifest','standaloneDependencyProof','toolchain'].map(key=>[key,report[key]])));
  return refresh({report,trusted,exit:0});
}
function renumber(log) {
  const entries=[...log.events,...log.batches].sort((a,b)=>a.sequence-b.sequence), mapping=new Map(entries.map((entry,index)=>[entry.sequence,index+1]));
  for(const entry of entries) { entry.sequence=mapping.get(entry.sequence); for(const key of ['scheduleSequence','sourceArrowSequence','sourceFocusSequence']) if(Object.hasOwn(entry,key)) entry[key]=mapping.get(entry[key]) ?? entry[key]; }
  log.events.sort((a,b)=>a.sequence-b.sequence);log.batches.sort((a,b)=>a.sequence-b.sequence);
}
function refresh(fixture){
  const check=fixture.report.checks[0];check.oracles=reentryOracles(check.raw,fixture.report.surface);check.writes=reconstructReentryWrites(check.raw);check.status=fixture.report.status=check.oracles.every(oracle=>oracle.pass)?'passed':'failed';fixture.exit=fixture.report.status==='passed'?0:1;check.finalCapture={log:copy(check.raw.log),baseTrace:copy(check.raw.baseTrace)};return fixture;
}
export function runReentrySchemaTests(){
  let accepted=0,rejected=0,red=0;
  for(const surface of ['go-qualified','go-chapter','sdui']){
    const fixture=buildReentrySchemaFixture(surface);assert.deepEqual(fixture.report.checks[0].oracles.filter(oracle=>!oracle.pass),[]);assert.equal(verifyReentryEvidence(fixture.report,fixture.trusted,0).status,'passed');accepted++;
    const reject=(label,change,{recompute=false,exit=0,independent=false}={})=>{const f=copy(fixture);change(independent?f:f.report);assert.throws(()=>{if(recompute)refresh(f);verifyReentryEvidence(f.report,f.trusted,exit);},undefined,surface+': '+label);rejected++;};
    const c=r=>r.checks[0], focus=r=>c(r).raw.log.events.find(event=>event.phase==='native-focus-return');
    for(const [label,change] of [
      ['missing case',r=>r.checks.pop()],['duplicate case',r=>r.checks.push(copy(c(r)))],['foreign case',r=>c(r).name='foreign'],['inventory',r=>r.caseInventory=[]],['classification',r=>r.classification='baseline credit'],
      ['missing oracle',r=>c(r).oracles.pop()],['reordered oracle',r=>c(r).oracles.reverse()],['forged oracle',r=>c(r).oracles[0].pass=false],['forged write',r=>c(r).writes[0].value='forged'],['missing writes',r=>c(r).writes=[]],
      ['status',r=>r.status='failed'],['case status',r=>c(r).status='failed'],['source',r=>r.sourceFiles[Object.keys(r.sourceFiles)[0]]=sha('wrong')],['own source',r=>r.reentrySourceFiles[reentrySourcePaths[0]]=sha('wrong')],['missing own source',r=>delete r.reentrySourceFiles[reentrySourcePaths[0]]],
      ['missing HTTP',r=>r.httpAssetProof.pop()],['duplicate HTTP',r=>r.httpAssetProof.push(copy(r.httpAssetProof[0]))],['HTTP bytes',r=>r.httpAssetProof[0].bytes++],['HTTP hash',r=>r.httpAssetProof[0].receivedSHA256=sha('wrong')],
      ['missing browser',r=>r.browserResponses.splice(r.browserResponses.findIndex(proof=>proof.path==='/fragment'),1)],['duplicate browser',r=>r.browserResponses.push(copy(r.browserResponses[0]))],['browser hash',r=>r.browserResponses[0].receivedSHA256=sha('wrong')],['foreign browser',r=>r.browserResponses[0].path='/foreign'],
      ['drop known font response and request',r=>{const path='/assets/ely/fonts/Inter-Regular.ttf';r.browserResponses=r.browserResponses.filter(proof=>proof.path!==path);r.requests=r.requests.filter(request=>request.phase!=='browser'||request.path!==path);}],['missing request',r=>r.requests.pop()],['duplicate request',r=>r.requests.push(copy(r.requests[0]))],['request response',r=>r.requests[0].responseSHA256=sha('wrong')],['wrong HTTP method',r=>r.requests[0].method='POST'],
      ['revision',r=>r.revision='f'.repeat(40)],['tree',r=>r.tree='e'.repeat(40)],['token',r=>r.runToken='stale token'],['dirty',r=>r.dirty=' M file'],['error',r=>r.error={}],['capture error',r=>r.captureError='failure'],['case error',r=>c(r).error={}],['toolchain',r=>r.toolchain.go='wrong'],['browser version',r=>r.browserVersion=''],
      ['fragment bytes',r=>c(r).raw.fragment.bytes++],['fragment hash',r=>c(r).raw.fragment.sha256=sha('wrong')],
      ...paletteErrors.map(key=>[key,r=>r[key].push('failure')]),
    ])reject(label,change);
    for(const [label,change]of [
      ['missing raw field',r=>delete c(r).raw.tab],['extra raw field',r=>c(r).raw.foreign={}],['untrusted Tab',r=>c(r).raw.log.events.find(e=>e.key==='Tab').trusted=false],['untrusted focus',r=>c(r).raw.log.events.find(e=>e.phase==='query-focus-listener').trusted=false],['wrong tab target',r=>c(r).raw.tab.focusedValue='option-file'],['foreign native token',r=>c(r).raw.log.events[0].targetToken=999],['foreign native tag',r=>c(r).raw.log.events[0].targetTag='DIV'],['foreign native value',r=>c(r).raw.log.events[0].targetValue='foreign'],['wrong Tab token',r=>c(r).raw.tab.focusedToken=999],['peer changed',r=>c(r).raw.peerAfter.query='changed'],
      ['wrong next identity',r=>focus(r).state.rows[1].token=focus(r).state.old.token],['old still connected',r=>focus(r).state.old.connected=true],['replacement preselected',r=>focus(r).state.rows[1].selected='true'],['not actual fragment',r=>c(r).raw.fragment.peerCount=1],['template different ID',r=>c(r).raw.fragment.optionID='foreign'],['template selected',r=>c(r).raw.fragment.optionSelected='true'],
      ['lost sequence',r=>c(r).raw.log.batches[0].sequence=999],['foreign attribute',r=>c(r).raw.log.batches[0].records[0].attribute='fake'],['wrong target',r=>c(r).raw.log.batches[1].records.at(-1).targetToken=999],['wrong task token',r=>c(r).raw.log.events.find(e=>e.phase==='htmx:before:swap').tasks[0].targetToken=999],['missing focus-return batch',r=>c(r).raw.log.batches[0].reason='final'],['before outside focus',r=>c(r).raw.log.events.find(e=>e.phase==='htmx:before:swap').inFocus=false],['wrong swap style',r=>c(r).raw.log.events.find(e=>e.phase==='htmx:before:swap').tasks[0].style='innerHTML'],
    ])reject(label,change,{recompute:true,exit:1});
    const phase=(report,name)=>c(report).raw.log.events.find(event=>event.phase===name);
    const shift=(report,left,right)=>{const log=c(report).raw.log,a=phase(report,left),b=phase(report,right);[a.sequence,b.sequence]=[b.sequence,a.sequence];renumber(log);};
    for(const [label,change]of [
      ['missing schedule boundary',r=>{const log=c(r).raw.log;log.events=log.events.filter(event=>event.phase!=='pre-swap-microtask-scheduled');renumber(log);}],
      ['missing document diagnostic',r=>{const log=c(r).raw.log;log.events=log.events.filter(event=>event.phase!=='document-arrow-bubble');renumber(log);}],
      ['duplicate schedule boundary',r=>{const log=c(r).raw.log;log.events.push({...copy(phase(r,'pre-swap-microtask-scheduled')),sequence:log.events.at(-1).sequence+1});renumber(log);}],
      ['schedule after before-swap',r=>shift(r,'pre-swap-microtask-scheduled','htmx:before:swap')],
      ['schedule before native focus',r=>shift(r,'pre-swap-microtask-scheduled','query-focus-listener')],
      ['queued checkpoint after async swap',r=>shift(r,'arrow-continuation-return','htmx:after:swap')],
      ['queued checkpoint before focus returns',r=>shift(r,'arrow-continuation-return','native-focus-return')],
      ['wrong schedule source arrow',r=>phase(r,'pre-swap-microtask-scheduled').sourceArrowSequence=1],
      ['wrong schedule source focus',r=>phase(r,'pre-swap-microtask-scheduled').sourceFocusSequence=1],
      ['wrong schedule query token',r=>phase(r,'pre-swap-microtask-scheduled').queryToken=999],
      ['wrong callback schedule',r=>phase(r,'arrow-continuation-return').scheduleSequence=1],
      ['wrong callback source arrow',r=>phase(r,'arrow-continuation-return').sourceArrowSequence=1],
      ['wrong callback source focus',r=>phase(r,'arrow-continuation-return').sourceFocusSequence=1],
      ['wrong callback query token',r=>phase(r,'arrow-continuation-return').queryToken=999],
      ['callback while focus stack active',r=>phase(r,'arrow-continuation-return').inFocus=true],
      ['callback foreign owner identity',r=>phase(r,'arrow-continuation-return').state.ownerToken=999],
      ['callback already remounted',r=>phase(r,'arrow-continuation-return').state.ready='true'],
      ['callback loses query focus',r=>phase(r,'arrow-continuation-return').state.focusedToken=11],
      ['callback old identity changed',r=>phase(r,'arrow-continuation-return').state.old.token=999],
      ['callback replacement identity changed',r=>phase(r,'arrow-continuation-return').state.rows.find(row=>row.value==='option-file').token=999],
      ['document diagnostic untrusted',r=>phase(r,'document-arrow-bubble').trusted=false],
      ['document diagnostic wrong target',r=>phase(r,'document-arrow-bubble').targetToken=999],
    ])reject(label,change,{recompute:true,exit:1});
    for(const key of ['revision','tree'])reject('malformed trusted '+key,f=>f.report[key]=f.trusted[key]='invalid',{independent:true});
    reject('matching malformed own hash',f=>f.report.reentrySourceFiles[reentrySourcePaths[0]]=f.trusted.reentrySourceFiles[reentrySourcePaths[0]]='invalid',{independent:true});
    reject('matching altered served source',f=>f.report.assets['/reentry-observer.js'].servedSHA256=f.trusted.assets['/reentry-observer.js'].servedSHA256=sha('wrong'),{independent:true});
    reject('exit mismatch',()=>{},{exit:1});
    const bad=buildReentrySchemaFixture(surface,true),writes=bad.report.checks[0].writes;assert.equal(writes.length,2);assert.equal(writes[0].value,paletteOwner(surface)+'-palette-option-1');assert.equal(writes[0].rows[0].selected,'false');assert.equal(writes[1].rows[0].selected,'true');
    assert.equal(bad.exit,1);assert.equal(verifyReentryEvidence(bad.report,bad.trusted,1).status,'failed');red++;
    assert.throws(()=>verifyReentryEvidence(bad.report,bad.trusted,0),/nonzero contract exit/);rejected++;
    for(const [label,change] of [
      ['drop stale write',f=>f.report.checks[0].raw.log.batches[1].records=[]],
      ['forge oldValue chain',f=>f.report.checks[0].raw.log.batches[1].records[0].oldValue='foreign'],
      ['forge final query attribute',f=>f.report.checks[0].raw.log.batches[1].records[0].finalValue=paletteOwner(surface)+'-palette-option-0'],
      ['forge selected final attribute',f=>f.report.checks[0].raw.log.batches[0].records[0].finalValue='true'],
      ['drop return checkpoint',f=>{const log=f.report.checks[0].raw.log;log.events=log.events.filter(event=>event.phase!=='arrow-continuation-return');[...log.events,...log.batches].sort((a,b)=>a.sequence-b.sequence).forEach((entry,i)=>entry.sequence=i+1);}],
    ]) {const f=copy(bad);assert.throws(()=>{change(f);refresh(f);verifyReentryEvidence(f.report,f.trusted,1);},undefined,label);rejected++;}
    // A forged history may erase the stale mutation and adjust the next
    // oldValue. The independent queued snapshot must still keep the report red.
    const erased=copy(bad), erasedRaw=erased.report.checks[0].raw;
    erasedRaw.log.batches.splice(1,1);erasedRaw.log.batches[1].records.find(record=>record.attribute==='aria-activedescendant').oldValue=paletteOwner(surface)+'-palette-option-0';renumber(erasedRaw.log);refresh(erased);
    assert.equal(verifyReentryEvidence(erased.report,erased.trusted,1).status,'failed');assert(erased.report.checks[0].oracles.some(oracle=>oracle.id==='reentry.no-old-handler-active-write-after-disposal'&&!oracle.pass));red++;
    assert.throws(()=>verifyReentryEvidence(erased.report,erased.trusted,0),/nonzero contract exit/);rejected++;
    const drained=copy(bad);drained.report.checks[0].raw.log.batches[1].reason='pre-swap-microtask';refresh(drained);assert.equal(verifyReentryEvidence(drained.report,drained.trusted,1).status,'failed');red++;
    // Document bubbling is diagnostic. Either side of async lifecycle is valid
    // as long as the queued checkpoint itself remains before async remount.
    const earlyDocument=copy(fixture), earlyLog=earlyDocument.report.checks[0].raw.log, doc=earlyLog.events.find(event=>event.phase==='document-arrow-bubble'), queued=earlyLog.events.find(event=>event.phase==='arrow-continuation-return');
    doc.sequence=queued.sequence+0.5;doc.state=copy(queued.state);renumber(earlyLog);refresh(earlyDocument);assert.equal(verifyReentryEvidence(earlyDocument.report,earlyDocument.trusted,0).status,'passed');accepted++;
    // The first published harness's late document-only checkpoint is not
    // upgraded into valid evidence by this source repair.
    const legacy=copy(bad), legacyLog=legacy.report.checks[0].raw.log;
    legacyLog.events=legacyLog.events.filter(event=>!['pre-swap-microtask-scheduled','arrow-continuation-return'].includes(event.phase));
    legacyLog.events.find(event=>event.phase==='document-arrow-bubble').phase='arrow-continuation-return';renumber(legacyLog);
    assert.throws(()=>{refresh(legacy);verifyReentryEvidence(legacy.report,legacy.trusted,1);},undefined,'legacy document-only report remains harness-invalid');rejected++;
    const hidden=copy(bad);hidden.report.checks[0].writes=hidden.report.checks[0].writes.slice(-1);assert.throws(()=>verifyReentryEvidence(hidden.report,hidden.trusted,1));rejected++;
  }
  // A separate pure reconstruction control puts multiple writes and selection
  // repair in one callback. The final DOM alone says Open is selected, but the
  // intermediate Option write must retain its unselected identity.
  const sameBatch=buildReentrySchemaFixture('go-qualified',true).report.checks[0].raw;
  const stale=sameBatch.log.batches[1], repaired=sameBatch.log.batches[2];
  const combined={...copy(repaired),records:[...copy(stale.records),...copy(repaired.records)]};
  combined.records[0].finalValue=repaired.state.activeID;
  const replay=reconstructReentryWrites({log:{batches:[combined]}});
  assert.equal(replay.length,2);assert.equal(replay[0].value,paletteOwner('go-qualified')+'-palette-option-1');assert.equal(replay[0].rows[0].selected,'false');assert.equal(replay[1].rows[0].selected,'true');
  const cleared=copy(combined);cleared.records=[
    {type:'attributes',targetToken:2,attribute:'aria-activedescendant',oldValue:'initial',finalValue:'final'},
    {type:'attributes',targetToken:2,attribute:'aria-activedescendant',oldValue:null,finalValue:'final'},
  ];assert.equal(reconstructReentryWrites({log:{batches:[cleared]}})[0].value,null);
  console.log(`Reentry synthetic schemas: ${accepted} desired, ${red} valid red, ${rejected} corruptions rejected. No browser verification.`);return {accepted,red,rejected};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runReentrySchemaTests();
