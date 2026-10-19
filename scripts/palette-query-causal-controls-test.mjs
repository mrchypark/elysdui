import {mutateSupplementalSchemaFixture} from './palette-query-supplemental-schema-fixture.mjs';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {buildSupplementalSchemaFixture} from './palette-query-supplemental-evidence-test.mjs';
import {buildReentryGuardSchemaFixture} from './palette-query-reentry-guard-evidence-test.mjs';
import {supplementalOracles,verifySupplementalEvidence} from '../ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs';
import {supplementalModes,supplementalMutation} from '../ui/gohtmx/tests/browser/palette-query-supplemental-mutants.mjs';
import {verifyReentryEvidence} from '../ui/gohtmx/tests/browser/palette-query-reentry-evidence.mjs';
import {captureRawRunner,causalCompletion,causalCompletionEmission,causalSelection,causalFailureIDs,causalRunToken,causalAnchor,assertCausalOutcome,verifyCausalRun} from './palette-query-causal-controls.mjs';
// Synthetic raw observations and orchestration-only process records. Nothing in
// this test is native browser, real subprocess, scroll or lifecycle evidence.
const copy=structuredClone,sha=s=>createHash('sha256').update(s).digest('hex');
const token='12345678-1234-4234-9234-123456789abc',oldToken='87654321-1234-4234-9234-123456789abc';
let positives=0,rejected=0,inventoryChecks=0;
const runtime=await readFile(new URL('../ui/gohtmx/assets/ely-api-interaction.js',import.meta.url),'utf8');
function refresh(report){for(const c of report.checks){c.oracles=supplementalOracles(c,report.surface);c.status=c.oracles.every(o=>o.pass)?'passed':'failed';c.finalTrace=copy(c.raw.after.log);}report.status=report.checks.every(c=>c.status==='passed')?'passed':'failed';}
const mutate=(f,mode)=>mutateSupplementalSchemaFixture(f,mode,runtime);
function packet(f,suite,mode){
 const selection=causalSelection(suite,f.trusted.surface,mode,'strict'),current=copy(f.trusted);delete current.runToken;current.mode=mode;
 const report=copy(f.report);report.runToken=token;
 const invocation={...copy(current),runToken:token},status=mode==='control'?0:1;
 const exit={productionPolicy:'strict',revision:current.revision,tree:current.tree,runToken:token,...(suite==='reentry'?{mode}:{}),exitCode:status};
 const rawBytes=Object.fromEntries(Object.entries({report,invocation,exit}).map(([k,v])=>[k,JSON.stringify(v)])),verdict=(suite==='supplemental'?verifySupplementalEvidence:verifyReentryEvidence)(report,invocation,status);
 const completion=causalCompletion(verdict,token,status,rawBytes),completionBytes=JSON.stringify(completion,null,2);
 const stderr=report.checks.flatMap(c=>c.oracles.filter(o=>!o.pass).map(o=>`${o.id}: observed=${JSON.stringify(o.observed)} expected=${JSON.stringify(o.expected)}\n`)).join('');
 return {selection,data:{report,invocation,exit,completion,completionBytes,rawBytes,anchor:causalAnchor(current,selection,token),child:{error:null,signal:null,status,stdout:JSON.stringify(causalCompletionEmission(completion,completionBytes))+'\n',stderr,truncated:false},current}};
}
function verify(p){return verifyCausalRun(p.data,p.selection,token);}
const samples=[];
for(const surface of ['go-qualified','go-chapter','sdui']){
 for(const mode of supplementalModes){const f=buildSupplementalSchemaFixture(surface);if(mode!=='control')mutate(f,mode);const p=packet(f,'supplemental',mode);verify(p);samples.push(p);positives++;}
 for(const mode of ['control','guard-removed']){const p=packet(buildReentryGuardSchemaFixture(surface,mode),'reentry',mode);verify(p);samples.push(p);positives++;}
}
for(const p of samples){
 const round=JSON.parse(JSON.stringify(p));assert.deepEqual(verify(round),verify(p),'serialized aggregate positive');
 const reject=(label,edit)=>{const q=copy(p);edit(q);assert.throws(()=>verify(q),undefined,label);rejected++;};
 for(const [label,edit]of [
  ['spawn error',q=>q.data.child.error='ENOENT'],['truncated capture',q=>q.data.child.truncated=true],
  ['missing completion',q=>delete q.data.completion],['missing completion bytes',q=>delete q.data.completionBytes],['stale completion',q=>q.data.completion.runToken=oldToken],['forged completion verdict',q=>q.data.completion.verdict.status='forged'],['wrong completion hash',q=>q.data.completion.rawFiles.report='0'.repeat(64)],['changed raw byte hash',q=>q.data.rawBytes.report+=' '],
  ['no final completion emission',q=>q.data.child.stdout=''],['duplicate completion emission',q=>q.data.child.stdout+=q.data.child.stdout],['nonfinal completion emission',q=>q.data.child.stdout+='unexpected trailing output\n'],['forged completion emission',q=>q.data.child.stdout=q.data.child.stdout.replace('validated','forged')],['wrong completion byte emission',q=>q.data.completionBytes+=' '],['post-completion exception',q=>q.data.child.stderr+='Error: unexpected post-artifact crash\n'],['signal',q=>{q.data.child.signal='SIGTERM';q.data.child.status=null;}],['early non-native exit',q=>q.data.child.status=2],['missing child status',q=>delete q.data.child.status],['early failure with stale same-head files',q=>{q.data.invocation.runToken=q.data.report.runToken=q.data.exit.runToken=oldToken;}],
  ['old anchor',q=>q.data.anchor.runToken=oldToken],['report token',q=>q.data.report.runToken=oldToken],['invocation token',q=>q.data.invocation.runToken=oldToken],['exit token',q=>q.data.exit.runToken=oldToken],['coordinated stale token',q=>{q.data.anchor.runToken=q.data.invocation.runToken=q.data.report.runToken=q.data.exit.runToken=oldToken;}],
  ['changed current source',q=>q.data.current.sourceFiles[Object.keys(q.data.current.sourceFiles)[0]]='f'.repeat(64)],['changed served bytes',q=>q.data.current.assets[Object.keys(q.data.current.assets)[0]].servedSHA256='f'.repeat(64)],['changed fixture bytes',q=>q.data.current.fixtures['/'].bytes++],['changed post-child toolchain',q=>q.data.current.toolchain.node='v0.0.1'],
  ['report-selected policy',q=>q.data.report.productionPolicy='foreign'],['invocation-selected policy',q=>q.data.invocation.productionPolicy='activation-repair'],['exit-selected policy',q=>q.data.exit.productionPolicy='activation-repair'],['anchor-selected mode',q=>q.data.anchor.selection.mode='foreign'],['wrong independent suite',q=>q.selection.suite='foreign'],['wrong independent surface',q=>q.selection.surface='foreign'],['wrong independent policy',q=>q.selection.productionPolicy='foreign'],
  ['missing raw report',q=>delete q.data.report],['missing check',q=>q.data.report.checks.pop()],['duplicate check',q=>q.data.report.checks.push(copy(q.data.report.checks[0]))],['missing oracle',q=>q.data.report.checks[0].oracles.pop()],['forged observed and expected cache',q=>{q.data.report.checks[0].oracles[0].observed=q.data.report.checks[0].oracles[0].expected='forged';q.data.report.checks[0].oracles[0].pass=true;}],['raw status inversion',q=>q.data.report.status=q.data.report.status==='passed'?'failed':'passed'],['exit inversion',q=>q.data.exit.exitCode=1-q.data.exit.exitCode],
 ])reject(label,edit);
 // Inventory-layer tests are deliberately separate from raw verifier positives.
 const expected=causalFailureIDs(p.selection.suite,p.selection.mode),base={status:p.selection.mode==='control'?'passed':'failed',checks:[{oracles:expected.map(id=>({id,prerequisite:false,pass:false}))}]};
 assertCausalOutcome(base,p.selection,p.data.child.status);inventoryChecks++;
 for(const id of expected){const r=copy(base);r.checks[0].oracles=r.checks[0].oracles.filter(o=>o.id!==id);assert.throws(()=>assertCausalOutcome(r,p.selection,p.data.child.status));rejected++;}
 for(const [id,prerequisite]of [['foreign.extra',false],['native.prerequisite',true]]){const r=copy(base);r.checks[0].oracles.push({id,pass:false,prerequisite});assert.throws(()=>assertCausalOutcome(r,p.selection,p.data.child.status));rejected++;}
}
const oversized=copy(samples[0]);oversized.data.child.stdout='x'.repeat(16*1024*1024)+'\n'+oversized.data.child.stdout;assert.equal(oversized.data.child.truncated,false);assert.throws(()=>verify(oversized),/independent process capture byte bound/);rejected++;
assert.notEqual(causalRunToken(),causalRunToken());assert.equal(causalRunToken(token),token);
for(const bad of ['',null,'report-token','12345678-1234-1234-9234-123456789abc']){assert.throws(()=>causalRunToken(bad));rejected++;}
for(const suite of ['supplemental','reentry']){
 const source=await readFile(new URL(`./palette-query-${suite}-run.mjs`,import.meta.url),'utf8');assert(source.includes('causalRunToken(process.env.PALETTE_CAUSAL_RUN_TOKEN)'));assert(source.includes('process.exitCode = child.status')||source.includes('process.exitCode=child.status'));
 const workflow=await readFile(new URL(`../.github/workflows/palette-query-${suite}.yml`,import.meta.url),'utf8');assert(workflow.includes(`node scripts/palette-query-causal-controls.mjs ${suite}`));assert(!workflow.includes('continue-on-error'));assert(!workflow.includes('|| true'));
}
// Exercise the actual bounded process capture with local Node-only scripts.
// Sinks collect counts instead of flooding test logs; production uses the
// default real stdout/stderr sinks and has no environment-selected test path.
const temp=await mkdtemp(join(tmpdir(),'palette-causal-process-'));let processChecks=0;
try{
 await mkdir(join(temp,'scripts'));const script=join(temp,'scripts/palette-query-supplemental-run.mjs');
 const capture=async source=>{await writeFile(script,source);const echoed={stdout:0,stderr:0};const sinks=Object.fromEntries(['stdout','stderr'].map(k=>[k,{write:text=>{echoed[k]+=Buffer.byteLength(text);}}]));return {result:await captureRawRunner(temp,{suite:'supplemental'},process.env,sinks),echoed};};
 let c=await capture("process.stdout.write(Buffer.from([0xe2]));setTimeout(()=>{process.stdout.write(Buffer.from([0x82,0xac,0x0a]));process.stderr.write('diagnostic\\n');},10);");
 assert.equal(c.result.stdout,'€\n');assert.equal(c.result.stderr,'diagnostic\n');assert.equal(c.result.status,0);assert.equal(c.result.error,null);assert.equal(c.result.truncated,false);assert.deepEqual(c.echoed,{stdout:4,stderr:11});processChecks++;
 c=await capture("process.stdout.write('raw failure\\n');process.exitCode=1;");assert.equal(c.result.status,1);assert.equal(c.result.stdout,'raw failure\n');processChecks++;
 c=await capture("process.kill(process.pid,'SIGTERM');");assert.equal(c.result.signal,'SIGTERM');assert.equal(c.result.status,null);processChecks++;
 const absent=await captureRawRunner(join(temp,'missing'),{suite:'supplemental'},process.env,{stdout:{write(){}},stderr:{write(){}}});assert.match(absent.error,/ENOENT/);processChecks++;
 c=await capture("process.stdout.write(Buffer.alloc(17*1024*1024,120));");assert.equal(c.result.truncated,true);assert.match(c.result.error,/exceeds 16 MiB/);assert(Buffer.byteLength(c.result.stdout)<=16*1024*1024);assert(c.echoed.stdout>16*1024*1024);processChecks++;
}finally{await rm(temp,{recursive:true,force:true});}
console.log(`Causal aggregation process capture passed: ${processChecks} real local Node-only child checks, no browser/server.`);
console.log(`Causal aggregation synthetic tests passed: ${positives} full raw positives, ${inventoryChecks} exact inventory projections, ${rejected} rejected corruptions; no browser execution.`);
