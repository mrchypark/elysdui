import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {randomUUID,createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {paletteSurfaces} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';
import {paletteProductionPolicy} from '../ui/gohtmx/tests/browser/palette-query-production-policy.mjs';
import {loadSupplementalInputs} from '../ui/gohtmx/tests/browser/palette-query-supplemental-inputs.mjs';
import {supplementalReportName,verifySupplementalEvidence} from '../ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs';
import {supplementalModes,supplementalMutants} from '../ui/gohtmx/tests/browser/palette-query-supplemental-mutants.mjs';
import {loadReentryInputs} from '../ui/gohtmx/tests/browser/palette-query-reentry-inputs.mjs';
import {reentryReportName,verifyReentryEvidence} from '../ui/gohtmx/tests/browser/palette-query-reentry-evidence.mjs';
import {assertSupplementalPositiveWitnesses,assertReentryPositiveWitnesses} from '../ui/gohtmx/tests/browser/palette-query-positive-witnesses.mjs';

const range=(first,last)=>Array.from({length:last-first+1},(_,i)=>i+first);
const steps=range(0,56).map(i=>'scroll.step-'+i);
const rank=['query','arrow','refined','restored','reselected'].map(s=>'rank.'+s);
const states=[...rank,'scroll.query',...steps];
const snapshots=[...['ready','opened','query','arrow','refined','restored','reselected','down','after'].map(s=>'rank.'+s),...['ready','opened','query','down','after'].map(s=>'scroll.'+s),...steps];
const cross=(labels,suffixes)=>labels.flatMap(label=>suffixes.map(suffix=>label+'.'+suffix));
export const reentryCausalFailures=['reentry.no-old-handler-active-write-after-disposal','reentry.every-active-write-resolves-selected-live-option'];
export function causalSelection(suite,surface,mode,productionPolicy){
 assert(['supplemental','reentry'].includes(suite),'known causal suite');assert(paletteSurfaces.includes(surface),'known causal surface');
 assert((suite==='supplemental'?supplementalModes:['control','guard-removed']).includes(mode),'known causal mode');
 return {suite,surface,mode,productionPolicy:paletteProductionPolicy(productionPolicy)};
}
// Fixed checkpoint/suffix sets for the pinned fixture, viewport and gestures.
// No report, failure count or runtime-selected checkpoint defines this oracle.
// All six native records per mode at 27895479 had these exact consequences.
export function causalFailureIDs(suite,mode){
 causalSelection(suite,'go-qualified',mode,'activation-repair');
 if(mode==='control')return [];
 if(suite==='reentry')return [...reentryCausalFailures].sort();
 const active=cross(states,['active-local-selected']);
 const ids={
  'active-missing':active,'active-peer':active,
  'option-peer-id':[...active,...cross(snapshots,['source-owned-ids','unique-peer-ids'])],
  'option-role':[...active,...cross(snapshots,['raw-option-roles','peer-fixed-dom'])],
  'list-role':cross(states,['controlled-list']),'controls-peer':cross(states,['controlled-list']),
  'wrong-enter':cross(['rank.enter','scroll.enter'],['completed-payload','down-payload','host-payload','host-result','selection-change']),
  'no-scroll':[
   ...cross([...range(5,49),56].map(i=>'scroll.step-'+i),['selected-inside-list']),
   ...cross([...range(19,35),56].map(i=>'scroll.step-'+i),['selected-inside-viewport']),
   'scroll.step-27.list-moved'],
  'focus-button':[
   ...cross([...rank.filter(s=>s!=='rank.query'),...steps],['input-focus','input-target']),
   ...cross([...rank.filter(s=>s!=='rank.query'),...steps.filter(s=>s!=='scroll.step-55')],['active-local-selected']),
   ...cross(['rank.arrow',...steps],['native-input-target']),
   ...cross(['rank.refined','rank.restored'],['caret','query','visible-enabled']),
   'rank.refined.native-insertion','rank.reselected.native-typing','rank.restored.native-delete','rank.restored.selected','rank.restored.source-order'],
 }[mode];
 assert(ids);assert.equal(new Set(ids).size,ids.length);return [...ids].sort();
}
export function assertCausalOutcome(report,selection,exitCode){
 const {suite,mode}=selection,expected=causalFailureIDs(suite,mode),oracles=report.checks.flatMap(check=>check.oracles);
 for(const oracle of oracles)if(oracle.prerequisite)assert.equal(oracle.pass,true,'causal prerequisite '+oracle.id);
 const failed=oracles.filter(o=>!o.pass).map(o=>o.id).sort();
 assert.deepEqual(failed,expected,'exact source-owned causal failure inventory; extra/missing failures require review');
 assert.equal(report.status,mode==='control'?'passed':'failed','causal raw status');assert.equal(exitCode,mode==='control'?0:1,'causal raw exit');
 const kills=mode==='control'?[]:suite==='supplemental'?supplementalMutants[mode].kills:reentryCausalFailures;
 for(const id of kills)assert(oracles.some(o=>o.id===id&&!o.prerequisite&&!o.pass),'designated behavioral kill '+id);
 return {control:mode==='control'?'passed':'killed',failedAssertions:failed,kills:[...kills],rawExit:exitCode};
}
export function causalRunToken(provided){
 const value=provided===undefined?randomUUID():provided;
 assert(typeof value==='string'&&/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value),'explicit aggregation UUID');return value;
}
export async function loadCausalInputs(base,selection){
 const load=selection.suite==='supplemental'?loadSupplementalInputs:loadReentryInputs;
 const {assetBodies,fixtureBodies,...current}=await load(base,selection.surface,selection.mode,{productionPolicy:selection.productionPolicy});
 assert.equal(current.dirty,'','committed clean aggregation source required');return {...current,surface:selection.surface,mode:selection.mode};
}
export function causalAnchor(current,selection,runToken){
 causalSelection(selection.suite,selection.surface,selection.mode,selection.productionPolicy);causalRunToken(runToken);
 for(const key of ['surface','mode','productionPolicy'])assert.equal(current[key],selection[key]);
 return {schema:'palette-causal-invocation-v1',selection:{...selection},runToken,inputs:structuredClone(current)};
}
// current is independently rebuilt after the child; expectedToken is generated
// before spawn (or explicitly supplied by an offline reviewer), never read from
// any report/invocation/exit/anchor file. An early child cannot reuse old proof.
export function verifyCausalRun({report,invocation,exit,completion,rawBytes,completionBytes,anchor,child,current},selection,expectedToken){
 const expected=causalAnchor(current,selection,expectedToken);
 assert.deepEqual(anchor,expected,'independent pre-spawn anchor and current inputs');
 assert.deepEqual(Object.keys(child).sort(),['error','signal','status','stderr','stdout','truncated']);assert.equal(child.error,null,'raw runner spawn error');assert.equal(child.signal,null,'raw runner signal');assert.equal(child.truncated,false,'raw runner capture must be complete');
 assert.equal(typeof child.stdout,'string');assert.equal(typeof child.stderr,'string');
 assert(Buffer.byteLength(child.stdout)+Buffer.byteLength(child.stderr)<=16*1024*1024,'independent process capture byte bound');
 assert.equal(child.status,selection.mode==='control'?0:1,'raw runner child status');
 const trusted={...current,runToken:expectedToken};assert.deepEqual(invocation,trusted,'current invocation including pre-spawn token');
 const expectedExit={productionPolicy:selection.productionPolicy,revision:current.revision,tree:current.tree,runToken:expectedToken,...(selection.suite==='reentry'?{mode:selection.mode}:{}),exitCode:child.status};
 assert.deepEqual(exit,expectedExit,'raw exit provenance and child status');
 const verify=selection.suite==='supplemental'?verifySupplementalEvidence:verifyReentryEvidence;
 const raw=verify(report,trusted,child.status),outcome=assertCausalOutcome(report,selection,child.status);
 (selection.suite==='supplemental'?assertSupplementalPositiveWitnesses:assertReentryPositiveWitnesses)(report,selection.surface,selection.mode);
 for(const [key,value]of Object.entries({report,invocation,exit}))assert.deepEqual(JSON.parse(rawBytes[key]),value,'exact raw bytes '+key);
 assert.deepEqual(completion,causalCompletion(raw,expectedToken,child.status,rawBytes),'raw runner reached validated completion');
 assert.deepEqual(JSON.parse(completionBytes),completion,'exact completion bytes');
 const emission=causalCompletionEmission(completion,completionBytes),lines=child.stdout.split('\n').filter(line=>line.length),markers=lines.flatMap(line=>{try{const value=JSON.parse(line);return value&&Object.hasOwn(value,'causalRawCompletion')?[value]:[];}catch{return [];}});
 assert.deepEqual(markers,[emission],'unique actual raw completion emission');assert.equal(lines.at(-1),JSON.stringify(emission),'final raw completion emission');
 const diagnostics=report.checks.flatMap(check=>check.oracles.filter(o=>!o.pass).map(o=>`${o.id}: observed=${JSON.stringify(o.observed)} expected=${JSON.stringify(o.expected)}\n`)).join('');
 assert.equal(child.stderr,diagnostics,'only exact recomputed desired diagnostics; unexpected process errors stay red');
 return {schema:'palette-causal-acceptance-v1',...selection,revision:current.revision,tree:current.tree,runToken:expectedToken,...outcome,rawValidation:raw};
}
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function causalRawHashes(rawBytes){
 assert.deepEqual(Object.keys(rawBytes).sort(),['exit','invocation','report']);for(const value of Object.values(rawBytes))assert.equal(typeof value,'string');
 return Object.fromEntries(['report','invocation','exit'].map(key=>[key,sha(rawBytes[key])]));
}
export function causalCompletion(verdict,runToken,rawExit,rawBytes){
 causalRunToken(runToken);return {schema:'palette-raw-completion-v1',runToken,rawExit,rawFiles:causalRawHashes(rawBytes),verdict};
}
export function causalCompletionEmission(completion,bytes){
 assert.deepEqual(JSON.parse(bytes),completion);return {causalRawCompletion:'validated',runToken:completion.runToken,completionSHA256:sha(bytes),rawFiles:completion.rawFiles};
}
// Tee the original streams unchanged while retaining bounded exact UTF-8 text.
// Overflow, truncation, spawn error, signal and abnormal status all fail closed.
export async function captureRawRunner(base,selection,env,sinks={stdout:process.stdout,stderr:process.stderr}){
 assert(['supplemental','reentry'].includes(selection.suite));
 const limit=16*1024*1024,output={stdout:'',stderr:''};let size=0,error=null,truncated=false;
 return await new Promise(resolve=>{
  const child=spawn(process.execPath,[`scripts/palette-query-${selection.suite}-run.mjs`],{cwd:base,env,stdio:['ignore','pipe','pipe']});
  for(const kind of ['stdout','stderr']){child[kind].setEncoding('utf8');child[kind].on('data',text=>{sinks[kind].write(text);if(truncated)return;size+=Buffer.byteLength(text);if(size>limit){truncated=true;error='raw runner capture exceeds 16 MiB';child.kill('SIGTERM');return;}output[kind]+=text;});}
  child.on('error',value=>{error=String(value);});child.on('close',(status,signal)=>resolve({error,signal,status,...output,truncated}));
 });
}
export async function runCausalControl(base,selection){
 assert.equal(process.env.CI,'true','browser execution is restricted to CI');
 const current=await loadCausalInputs(base,selection),runToken=causalRunToken(),anchor=causalAnchor(current,selection,runToken);
 const name=selection.suite==='supplemental'?supplementalReportName:reentryReportName,output=join(base,'test-results/contracts',name(selection.surface,selection.mode));
 await mkdir(join(base,'test-results/contracts'),{recursive:true});
 const anchorBytes=JSON.stringify(anchor,null,2);await writeFile(output+'.aggregation-invocation.json',anchorBytes);
 console.log(JSON.stringify({causalInvocation:'started',...selection,revision:current.revision,tree:current.tree,runToken,anchorSHA256:sha(anchorBytes)}));
 const child=await captureRawRunner(base,selection,{...process.env,PALETTE_QUERY_PRODUCTION_POLICY:selection.productionPolicy,PALETTE_QUERY_SURFACE:selection.surface,PALETTE_SUPPLEMENTAL_MODE:selection.mode,PALETTE_QUERY_REENTRY_MODE:selection.mode,PALETTE_CAUSAL_RUN_TOKEN:runToken});
 await writeFile(output+'.aggregation-process.json',JSON.stringify(child,null,2));
 // Check process completion before opening potentially stale child artifacts.
 assert.equal(child.error,null);assert.equal(child.signal,null);assert.equal(child.truncated,false);assert.equal(child.status,selection.mode==='control'?0:1);
 const bytes=await Promise.all(['','.invocation.json','.exit.json','.validation.json'].map(suffix=>readFile(output+suffix,'utf8')));
 const [report,invocation,exit,completion]=bytes.map(value=>JSON.parse(value)),rawBytes=Object.fromEntries(['report','invocation','exit'].map((key,i)=>[key,bytes[i]]));
 const rebuilt=await loadCausalInputs(base,selection);
 const result=verifyCausalRun({report,invocation,exit,completion,rawBytes,completionBytes:bytes[3],anchor,child,current:rebuilt},selection,runToken);
 const receipt={...result,rawFiles:Object.fromEntries(['report','invocation','exit','completion'].map((key,i)=>[key,sha(bytes[i])])),anchorSHA256:sha(anchorBytes)};
 await writeFile(output+'.aggregation.json',JSON.stringify(receipt,null,2));console.log(JSON.stringify({causalAggregation:'accepted',...receipt}));return receipt;
}
async function main(){
 const suite=process.argv[2],surface=process.env.PALETTE_QUERY_SURFACE||'go-qualified',mode=process.env[suite==='supplemental'?'PALETTE_SUPPLEMENTAL_MODE':'PALETTE_QUERY_REENTRY_MODE']||'control';
 await runCausalControl(fileURLToPath(new URL('../',import.meta.url)),causalSelection(suite,surface,mode,process.env.PALETTE_QUERY_PRODUCTION_POLICY||'strict'));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
