import assert from 'node:assert/strict';
import {readFile,writeFile,mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {buildSupplementalSchemaFixture} from './palette-query-supplemental-evidence-test.mjs';
import {mutateSupplementalSchemaFixture} from './palette-query-supplemental-schema-fixture.mjs';
import {buildReentryGuardSchemaFixture} from './palette-query-reentry-guard-evidence-test.mjs';
import {supplementalModes} from '../ui/gohtmx/tests/browser/palette-query-supplemental-mutants.mjs';
import {supplementalOracles,verifySupplementalEvidence} from '../ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs';
import {reentryOracles,reconstructReentryWrites,verifyReentryEvidence} from '../ui/gohtmx/tests/browser/palette-query-reentry-evidence.mjs';
import {assertSupplementalPositiveWitnesses,assertReentryPositiveWitnesses} from '../ui/gohtmx/tests/browser/palette-query-positive-witnesses.mjs';
import {causalSelection,causalAnchor,causalCompletion,causalCompletionEmission,verifyCausalRun} from './palette-query-causal-controls.mjs';
// Authored synthetic observations only. No browser, server, native timing,
// geometry or historical-head certification is supplied by these schema tests.
const copy=structuredClone,token='12345678-1234-4234-9234-123456789abc';
const runtime=await readFile(new URL('../ui/gohtmx/assets/ely-api-interaction.js',import.meta.url),'utf8');
let positives=0,denials=0,semanticControls=0,variations=0,integrationReversals=0;const bypasses=[];
function refresh(f,suite){
 for(const c of f.report.checks){
  c.oracles=suite==='supplemental'?supplementalOracles(c,f.report.surface):reentryOracles(c.raw,f.report.surface);
  c.status=c.oracles.every(o=>o.pass)?'passed':'failed';
  if(suite==='supplemental')c.finalTrace=copy(c.raw.after.log);
  else{c.writes=reconstructReentryWrites(c.raw);c.finalCapture={log:copy(c.raw.log),baseTrace:copy(c.raw.baseTrace)};}
 }
 f.report.status=f.report.checks.every(c=>c.status==='passed')?'passed':'failed';f.exit=f.report.status==='passed'?0:1;
 return f;
}
function verify(f,suite,aggregate=verifyCausalRun,rawOverride=null){
 refresh(f,suite);const report=copy(f.report),current=copy(f.trusted);delete current.runToken;report.runToken=token;
 const invocation={...copy(current),runToken:token},selection=causalSelection(suite,current.surface,current.mode,'strict');
 const verdict=(rawOverride||(suite==='supplemental'?verifySupplementalEvidence:verifyReentryEvidence))(report,invocation,f.exit);
 const exit={productionPolicy:'strict',revision:current.revision,tree:current.tree,runToken:token,...(suite==='reentry'?{mode:current.mode}:{}),exitCode:f.exit};
 const rawBytes=Object.fromEntries(Object.entries({report,invocation,exit}).map(([k,v])=>[k,JSON.stringify(v)]));
 const completion=causalCompletion(verdict,token,f.exit,rawBytes),completionBytes=JSON.stringify(completion);
 const child={error:null,signal:null,status:f.exit,truncated:false,stdout:JSON.stringify(causalCompletionEmission(completion,completionBytes))+'\n',stderr:report.checks.flatMap(c=>c.oracles.filter(o=>!o.pass).map(o=>`${o.id}: observed=${JSON.stringify(o.observed)} expected=${JSON.stringify(o.expected)}\n`)).join('')};
 return aggregate(JSON.parse(JSON.stringify({report,invocation,exit,rawBytes,completion,completionBytes,child,current,anchor:causalAnchor(current,selection,token)})),selection,token);
}
const witness=(f,suite)=>(suite==='supplemental'?assertSupplementalPositiveWitnesses:assertReentryPositiveWitnesses)(f.report,f.trusted.surface,f.trusted.mode);
function reject(f,suite,label,change){const q=copy(f);change(q.report);assert.throws(()=>{refresh(q,suite);witness(q,suite);},undefined,'raw/positive witness: '+label);assert.throws(()=>verify(q,suite),undefined,'full raw/completion/aggregate path: '+label);denials++;}
function reindex(log){log.timeline.forEach((entry,i)=>entry.sequence=i+1);}
function remove(log,kind,predicate=()=>true){const map=new Map();log[kind]=log[kind].filter((entry,i)=>{if(predicate(entry))return false;map.set(i,map.size);return true;});log.timeline=log.timeline.filter(e=>e.kind!==kind||map.has(e.index)).map(e=>e.kind===kind?{...e,index:map.get(e.index)}:e);reindex(log);}
const snapshots=r=>r.checks.flatMap(c=>Object.entries(c.raw).flatMap(([key,value])=>key==='steps'?value:[value]));
for(const surface of ['go-qualified','go-chapter','sdui']){
 for(const mode of supplementalModes){
  const f=buildSupplementalSchemaFixture(surface);if(mode!=='control')mutateSupplementalSchemaFixture(f,mode,runtime);verify(f,'supplemental');positives++;
  for(const [label,change]of [
   ['callback before Enter',log=>{const e=log.timeline.find(e=>e.kind==='hosts');log.timeline=log.timeline.filter(x=>x!==e);log.timeline.unshift(e);reindex(log);}],
   ['action phase disagrees with native key',log=>log.actions[0].phase='keyup'],
   ['missing action',log=>remove(log,'actions')],['missing successful result',log=>remove(log,'results')],
   ['unsuccessful host result',log=>log.results[0].result.ok=false],
   ['missing selection change',log=>remove(log,'changes',e=>e.name==='palette')],
   ['missing host selection change',log=>remove(log,'hostChanges',e=>e.name==='palette')],
   ['wrong actual command value',log=>{for(const k of ['actions','hosts','results'])log[k][0].value='foreign';}],
   ['foreign Enter down target',log=>Object.assign(log.inputs[0],{targetTag:'BUTTON',field:false,value:'foreign',selectionStart:null,selectionEnd:null})],
   ['Enter inputType forgery',log=>log.inputs[0].inputType='foreign'],
  ])reject(f,'supplemental',mode+'/'+label,r=>{for(const c of r.checks)for(const name of ['down','after'])change(c.raw[name].log);});
  reject(f,'supplemental','callback after keyup',r=>{for(const c of r.checks){const log=c.raw.after.log,up=log.timeline.find(e=>e.kind==='inputs'&&e.index===1);log.timeline=log.timeline.filter(e=>e!==up);log.timeline.splice(1,0,up);reindex(log);}});
  reject(f,'supplemental','foreign Enter up target',r=>{for(const c of r.checks)c.raw.after.log.inputs[1].value='foreign';});
  reject(f,'supplemental','native Arrow data forgery',r=>{for(const s of [r.checks[0].raw.arrow,r.checks[0].raw.refined])s.log.inputs[0].data='foreign';});
  const specific={
   control:r=>r.checks[0].raw.arrow.state.relationship.activeID='foreign',
   'focus-button':r=>r.checks[0].raw.refined.state.query='foreign',
   'active-missing':r=>r.checks[0].raw.arrow.state.relationship.activeID='foreign',
   'active-peer':r=>r.checks[0].raw.arrow.state.relationship.activeID='foreign',
   'option-peer-id':r=>{const s=r.checks[0].raw.arrow;for(const row of s.state.rows.filter(row=>['open-file','option-file'].includes(row.value)))row.id=s.peer.rows[1].id;for(const row of s.geometry.rows.filter(row=>['open-file','option-file'].includes(row.value)))row.id=s.peer.rows[1].id;},
   'option-role':r=>r.checks[0].raw.arrow.state.rows.find(row=>row.value==='option-file').role='link',
   'list-role':r=>r.checks[0].raw.arrow.state.relationship.listRole='region',
   'controls-peer':r=>r.checks[0].raw.arrow.state.relationship.controls='foreign',
   'wrong-enter':r=>{for(const c of r.checks)for(const s of [c.raw.down,c.raw.after]){for(const k of ['actions','hosts','results'])s.log[k][0].value='foreign';}for(const request of r.requests.filter(request=>request.path==='/sdui-action'))request.fields=request.fields.map(([key,value])=>[key,key==='commandValue'?'foreign':value]);},
   'no-scroll':r=>{const g=r.checks[1].raw.steps[0].geometry;g.list.scrollTop=1;for(const row of g.rows.filter(row=>row.height)){row.top--;row.bottom--;}}};
  reject(f,'supplemental','exact mode counterfactual',specific[mode]);
  const bypass=copy(f);if(mode==='control')bypass.report.checks[0].raw.after.log.inputs[1].value='foreign';else specific[mode](bypass.report);bypasses.push({f:bypass,suite:'supplemental'});
  if(mode==='focus-button')for(const [label,edit]of [['retained query caret',r=>r.checks[0].raw.refined.state.selectionStart=99],['native button caret',r=>r.checks[0].raw.reselected.log.inputs[0].selectionStart=99]])reject(f,'supplemental',label,edit);
  if(['option-role','option-peer-id'].includes(mode))reject(f,'supplemental','report order cannot select mutation history',r=>{const c=r.checks[0];c.raw=Object.fromEntries(Object.entries(c.raw).reverse());const s=c.raw.ready,row=s.state.rows.find(row=>row.value==='option-file');if(mode==='option-role')row.role='button';else{row.id=s.peer.rows[0].id;s.geometry.rows.find(row=>row.value==='option-file').id=row.id;}});
  if(mode==='focus-button')reject(f,'supplemental','filter transition cannot add a second deviation',r=>r.checks[0].raw.refined.state.rows.find(row=>row.value==='other-place').hidden=true);
  if(mode==='focus-button')reject(f,'supplemental','known-row focus continuity',r=>r.checks[0].raw.reselected.log.inputs[2].value='option-file');
  const reordered=copy(f);for(const c of reordered.report.checks)c.raw=Object.fromEntries(Object.entries(c.raw).reverse());verify(reordered,'supplemental');variations++;
  // Legitimate geometry and browser metadata are not copied pixel constants.
  const shifted=copy(f);for(const s of snapshots(shifted.report))for(const g of [s.geometry,s.peerGeometry])for(const box of [g.input,g.list,...g.rows]){box.left+=0.25;box.right+=0.25;}shifted.report.browserVersion='compatible-browser-metadata';verify(shifted,'supplemental');variations++;
  if(mode==='no-scroll'){const varied=copy(f);for(const s of [varied.report.checks[1].raw.query,...varied.report.checks[1].raw.steps])s.geometry.list.scrollHeight+=1;verify(varied,'supplemental');variations++;}
  // SDUI transport may finish before or after keyup. The fixture onAction
  // returns immediately, so its separate ely:result is already in down.
  if(surface==='sdui'){const early=copy(f);for(const c of early.report.checks){const log=c.raw.after.log,bridge=log.timeline.find(e=>e.kind==='bridge');log.timeline=log.timeline.filter(e=>e!==bridge);log.timeline.splice(c.raw.down.log.timeline.length,0,bridge);reindex(log);}verify(early,'supplemental');variations++;}
  // Intermediate query callbacks and close events are explicitly uncredited.
  // Preserve the required last setup callback and both snapshot prefixes.
  const diagnostic=copy(f);for(const s of snapshots(diagnostic.report)){
   remove(s.log,'closes');for(const kind of ['changes','hostChanges']){const last=s.log[kind].filter(e=>e.name==='cmdQuery').at(-1);remove(s.log,kind,e=>e.name==='cmdQuery'&&e!==last);}
  }
  verify(diagnostic,'supplemental');variations++;
  if(mode==='control'){const changed=copy(f);changed.report.checks[0].raw.arrow.state.focusedInput=false;refresh(changed,'supplemental');assert.equal(verifySupplementalEvidence(changed.report,changed.trusted,1).status,'failed');assert.throws(()=>verify(changed,'supplemental'));semanticControls++;}
 }
 for(const mode of ['control','guard-removed']){
  const f=buildReentryGuardSchemaFixture(surface,mode);verify(f,'reentry');positives++;
  const earlier=copy(f),earlierRaw=earlier.report.checks[0].raw,document=earlierRaw.log.events.find(e=>e.phase==='document-arrow-bubble');document.sequence=earlierRaw.log.events.find(e=>e.phase==='arrow-continuation-return').sequence+0.5;
  const all=[...earlierRaw.log.events,...earlierRaw.log.batches].sort((a,b)=>a.sequence-b.sequence),map=new Map(all.map((e,i)=>[e.sequence,i+1]));for(const e of all){e.sequence=map.get(e.sequence);for(const k of ['sourceArrowSequence','sourceFocusSequence','scheduleSequence'])if(Object.hasOwn(e,k))e[k]=map.get(e[k]);}earlierRaw.log.events.sort((a,b)=>a.sequence-b.sequence);earlierRaw.log.batches.sort((a,b)=>a.sequence-b.sequence);verify(earlier,'reentry');variations++;
  const extra=copy(f),rawExtra=extra.report.checks[0].raw,batch=rawExtra.log.batches.at(-1),id=rawExtra.before.ownerID+'-palette-option-0';
  batch.records.push({type:'attributes',targetToken:rawExtra.before.queryToken,attribute:'aria-activedescendant',oldValue:id,finalValue:id});
  refresh(extra,'reentry');assert.throws(()=>witness(extra,'reentry'));assert.throws(()=>verify(extra,'reentry'));denials++;bypasses.push({f:extra,suite:'reentry'});
  const boundaryNames=['installed','query-focus-listener','pre-swap-microtask-scheduled','ely:cleanup','htmx:before:swap','native-focus-return','arrow-continuation-return'];
  for(const name of boundaryNames)for(const key of ['token','id','value'])reject(f,'reentry','credited old identity '+name+'/'+key,r=>{const state=r.checks[0].raw.log.events.find(e=>e.phase===name).state;state.old[key]=key==='token'?999:'foreign';});
  for(const name of boundaryNames)reject(f,'reentry','credited LI identity '+name,r=>{r.checks[0].raw.log.events.find(e=>e.phase===name).state.oldRowToken=999;});
  for(const key of ['token','id','value'])reject(f,'reentry','replacement drain identity '+key,r=>{const state=r.checks[0].raw.log.batches.find(b=>b.reason==='native-focus-return').state;state.rows.find(row=>row.value==='option-file')[key]=key==='token'?999:'foreign';});
  reject(f,'reentry','drain precedes swap',r=>{const raw=r.checks[0].raw;raw.log.batches.find(b=>b.reason==='native-focus-return').sequence=raw.log.events.find(e=>e.phase==='htmx:before:swap').sequence-0.5;});
  reject(f,'reentry','retired Option cannot alias peer',r=>{const raw=r.checks[0].raw,old=raw.before.rows.find(row=>row.value==='option-file').token;for(const peer of [raw.peerBefore,raw.peerAfter])peer.rows[1].token=old;});
  const renamed=copy(f);function rename(value,key=''){
   if(Array.isArray(value))return value.map(item=>rename(item,key));
   if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,rename(v,k)]));
   return typeof value==='number'&&(key==='token'||key.endsWith('Token')||['added','removed'].includes(key))?value+1000:value;
  }
  renamed.report.checks[0].raw=rename(renamed.report.checks[0].raw);verify(renamed,'reentry');variations++;
  reject(f,'reentry','native query progression',r=>{const e=r.checks[0].raw.log.events.find(e=>e.phase==='keyup'&&e.key==='o');e.targetValue=e.state.query=e.state.focusedValue='foreign';});
  if(mode==='guard-removed')for(const label of ['other source row','dangling target','stale batch after checkpoint'])reject(f,'reentry',label,r=>{
   const raw=r.checks[0].raw,option=raw.before.ownerID+'-palette-option-1';
   if(label==='stale batch after checkpoint'){const write=reconstructReentryWrites(raw).find(w=>w.value===option),batch=raw.log.batches.find(b=>b.sequence===write.batchSequence),checkpoint=raw.log.events.find(e=>e.phase==='arrow-continuation-return');[batch.sequence,checkpoint.sequence]=[checkpoint.sequence,batch.sequence];}
   else{const other=label==='other source row'?raw.before.ownerID+'-palette-option-2':'foreign';for(const state of [raw.before,raw.tab,raw.final,...raw.log.events.map(e=>e.state),...raw.log.batches.map(b=>b.state)])if(state.activeID===option){state.activeID=other;state.activeToken=state.rows.find(row=>row.id===other)?.token||null;}for(const batch of raw.log.batches)for(const record of batch.records)if(record.attribute==='aria-activedescendant')for(const key of ['oldValue','finalValue'])if(record[key]===option)record[key]=other;}
  });
 }
 console.log('Positive witness synthetic surface complete: '+surface);
}
// Remove only the positive-witness calls in temporary offline validator source
// projections. Every mode must then admit its wrong counterfactual with freshly
// recomputed caches/completion. This proves actual integration sensitivity, not
// just helper-unit rejection. It is never current-source/native certification.
const temp=await mkdtemp(join(tmpdir(),'palette-witness-projection-'));
try{
 const evidenceURL=new URL('../ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs',import.meta.url),aggregateURL=new URL('./palette-query-causal-controls.mjs',import.meta.url);
 const reentryURL=new URL('../ui/gohtmx/tests/browser/palette-query-reentry-evidence.mjs',import.meta.url);
 const rawPath=join(temp,'raw.mjs'),reentryPath=join(temp,'reentry.mjs'),aggregatePath=join(temp,'aggregate.mjs');
 const project=async(url,needle,replacement,remap={})=>{let source=await readFile(url,'utf8');assert.equal(source.split(needle).length,2,'one source-owned integration call');source=source.replace(needle,replacement);return source.replace(/(from\s*['"])(\.[^'"]+)(['"])/g,(_,a,spec,z)=>a+(remap[new URL(spec,url).href]||new URL(spec,url).href)+z);};
 await writeFile(rawPath,await project(evidenceURL,"if(mode!=='control')assertSupplementalPositiveWitnesses(report,surface,mode);",''));
 await writeFile(reentryPath,await project(reentryURL,'assertReentryPositiveWitnesses(report,trusted.surface,trusted.mode);',''));
 await writeFile(aggregatePath,await project(aggregateURL,"(selection.suite==='supplemental'?assertSupplementalPositiveWitnesses:assertReentryPositiveWitnesses)(report,selection.surface,selection.mode);",'',{[evidenceURL.href]:pathToFileURL(rawPath).href,[reentryURL.href]:pathToFileURL(reentryPath).href}));
 const raw=await import(pathToFileURL(rawPath)),reentry=await import(pathToFileURL(reentryPath)),aggregate=await import(pathToFileURL(aggregatePath));
 for(const {f,suite} of bypasses){assert.throws(()=>verify(copy(f),suite));verify(f,suite,aggregate.verifyCausalRun,suite==='supplemental'?raw.verifySupplementalEvidence:reentry.verifyReentryEvidence);integrationReversals++;}
}finally{await rm(temp,{recursive:true,force:true});}
console.log(JSON.stringify({suite:'palette-positive-witnesses',syntheticOnly:true,positives,denials,semanticControls,variations,integrationReversals}));
