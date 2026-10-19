import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {loadActivationInputs} from '../ui/gohtmx/tests/browser/palette-activation-inputs.mjs';
import {activationEnvironment,activationPolicy} from '../ui/gohtmx/tests/browser/palette-activation-policy.mjs';
import {activationReportName,activationPayload,verifyActivationEvidence} from '../ui/gohtmx/tests/browser/palette-activation-evidence.mjs';
// The same raw verifier is used for controls and reversals. A schema/transport
// failure can never substitute for the fixed behavioral failure of a mutant.
export function verifyActivationControl(report,trusted,exitCode,selected){
 assert.equal(selected.mode,'repaired');assert.deepEqual(trusted.activationPolicy,activationPolicy(selected));
 const verified=verifyActivationEvidence(report,trusted,exitCode),definition=trusted.activationPolicy.definition;
 if(selected.mutation==='control'){assert.equal(verified.status,'passed');assert.equal(exitCode,0);return {...verified,control:'passed',kills:[]};}
 assert.equal(verified.status,'failed');assert.equal(exitCode,1);
 const kills=definition.kills.map(({case:name,oracle:id})=>{const check=report.checks.find(c=>c.name===name),oracle=check?.oracles.find(o=>o.id===id);assert(oracle&&!oracle.prerequisite&&!oracle.pass,'designated non-prerequisite kill '+name+'/'+id);return {case:name,oracle:id};});
 const stageEvents=(check,type,stage='activation')=>(check.raw.fresh||check.raw.explicit||check.raw.after).log.filter(e=>e.type===type&&e.stage===stage);
 const selectedValues=state=>state.rows.filter(row=>row.selected==='true').map(row=>row.value);
 const pointer=report.checks.find(c=>c.name==='pointer.activation');
 if(selected.mutation==='core-skip-removed'){
  const direct=stageEvents(pointer,'direct-action'),hosts=stageEvents(pointer,'host'),click=stageEvents(pointer,'click').filter(e=>e.trusted),boundary=stageEvents(pointer,'click-boundary').filter(e=>e.trusted);
  assert.equal(click.length,1);assert.equal(boundary.length,1);assert.equal(boundary[0].eventToken,click[0].eventToken);
  assert.equal(direct.length,2,'generic skip reversal duplicates the command');assert.equal(hosts.length,2);
  for(let i=0;i<2;i++){assert.deepEqual(direct[i].payload,activationPayload(trusted.surface));assert.deepEqual(hosts[i].payload,activationPayload(trusted.surface));assert(click[0].sequence<direct[i].sequence&&direct[i].sequence<hosts[i].sequence&&hosts[i].sequence<boundary[0].sequence,'duplicate stays in the same trusted click');assert.equal(direct[i].state.open,i===0);assert.equal(hosts[i].state.open,i===0);}
  assert(hosts[0].sequence<direct[1].sequence);for(const event of [direct[1],hosts[1]])assert.deepEqual(selectedValues(event.state),['option-file']);
  // Native duplicate-dispatch collection is qualified Go only. SDUI's busy
  // source guard may coalesce transport; raw transport joins remain shared.
 }
 if(selected.mutation==='family-emit-omitted'){
  for(const type of ['direct-action','host','result','request-start','bridge-success'])assert.equal(stageEvents(pointer,type).length,0,'owned emit omission has no '+type);
  assert.equal(pointer.raw.after.state.open,false);assert.deepEqual(selectedValues(pointer.raw.after.state),['option-file']);assert.equal(report.requests.filter(r=>r.check===pointer.name&&r.method==='POST').length,0);
 }
 if(selected.mutation==='blanket-palette-submit-prevention')for(const check of report.checks.filter(c=>c.name.startsWith('empty.'))){
  for(const type of ['requestSubmit-call','requestSubmit-return'])assert.deepEqual(stageEvents(check,type,'explicit').map(e=>e.api),['HTMLFormElement.requestSubmit']);
  const submits=stageEvents(check,'submit','explicit');assert.equal(submits.length,1,'blanket reversal must retain an actual explicit submit');assert.equal(submits[0].trusted,true);assert.equal(submits[0].target.token,check.raw.before.state.form.token);
  for(const type of ['direct-action','host','result','request-start','bridge-success'])assert.equal(stageEvents(check,type,'explicit').length,0,'blanket submit reversal suppresses '+type);
  assert.equal(report.requests.filter(r=>r.check===check.name&&r.method==='POST').length,0);
 }
 if(selected.mutation==='post-close-owner-bypassed')for(const name of ['owner.close-rebind','owner.close-bind-absent']){
  const check=report.checks.find(c=>c.name===name),log=check.raw.after.log,transition=log.find(e=>e.type==='close-focus-after-bind'),hosts=log.filter(e=>e.type==='host'&&e.stage==='activation'),direct=log.filter(e=>e.type==='direct-action'&&e.stage==='activation');
  const boundaries=log.filter(e=>e.type==='click-boundary'&&e.stage==='activation'&&e.trusted),clicks=log.filter(e=>e.type==='click'&&e.stage==='activation'&&e.trusted);
  assert(transition);assert.equal(direct.length,1);assert.equal(hosts.length,1);assert.equal(boundaries.length,1);assert.equal(clicks.length,1);assert.equal(boundaries[0].eventToken,clicks[0].eventToken);
  assert(transition.sequence<direct[0].sequence&&direct[0].sequence<hosts[0].sequence&&hosts[0].sequence<boundaries[0].sequence,'replacement delivery stays in the original trusted click interval');
  assert.equal(hosts[0].label,'replacement');assert.equal(hosts[0].handlerToken,transition.state.binding.action);
  for(const event of [direct[0],hosts[0]]){assert.deepEqual(event.payload,activationPayload(trusted.surface),'replacement receives the fixed captured command payload');assert.equal(event.state.open,false);assert.deepEqual(event.state.rows.filter(row=>row.selected==='true').map(row=>row.value),['option-file'],'replacement command observes committed Option');}
  if(trusted.surface==='sdui'){const starts=log.filter(e=>e.type==='request-start'&&e.stage==='activation');assert.equal(starts.length,1);assert(starts[0].sequence>hosts[0].sequence);const fields=Object.fromEntries(starts[0].fields);assert.equal(fields.commandAction,'option-command');assert.equal(fields.commandValue,'option-file');assert.equal(report.requests.filter(r=>r.check===name&&r.method==='POST'&&Object.fromEntries(r.fields)._request===fields._request).length,1);}
 }
 return {...verified,control:'killed',mutation:selected.mutation,kills,rawExit:exitCode};
}
async function main(){
 assert.equal(process.env.CI,'true','browser execution is restricted to CI');
 const base=fileURLToPath(new URL('../',import.meta.url)),selected=activationEnvironment();assert.equal(selected.mode,'repaired');assert.notEqual(selected.mutation,'control');
 const surface=process.env.PALETTE_QUERY_SURFACE||'go-qualified',child=spawnSync(process.execPath,['scripts/palette-activation-run.mjs'],{cwd:base,env:process.env,stdio:'inherit'});
 assert.equal(child.error,undefined);assert.equal(child.signal,null);assert.equal(child.status,1,'mutant runner keeps its actual failing exit');
 const output=join(base,'test-results/contracts',activationReportName(surface));const [report,invocation,exit]=await Promise.all(['','.invocation.json','.exit.json'].map(async suffix=>JSON.parse(await readFile(output+suffix,'utf8'))));
 const {assetBodies,fixtureBodies,...current}=await loadActivationInputs(base,surface,selected);assert.equal(current.dirty,'');
 for(const key of Object.keys(current))assert.deepEqual(invocation[key],current[key],'independent current-source control '+key);
 for(const key of ['revision','tree','runToken','productionPolicy','activationPolicy'])assert.deepEqual(exit[key],invocation[key]);
 const result=verifyActivationControl(report,{...current,...invocation},exit.exitCode,selected);await writeFile(output+'.control.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
