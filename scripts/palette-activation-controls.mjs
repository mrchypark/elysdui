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
 const one=(check,type,stage='activation')=>{const found=stageEvents(check,type,stage);assert.equal(found.length,1,'causal witness requires one '+stage+' '+type);return found[0];};
 const clickInterval=(check,stage='activation')=>{
  const clicks=stageEvents(check,'click',stage).filter(e=>e.trusted),boundaries=stageEvents(check,'click-boundary',stage).filter(e=>e.trusted);
  assert.equal(clicks.length,1,'causal witness requires one trusted click');assert.equal(boundaries.length,1,'causal witness requires one trusted click return');
  assert.equal(boundaries[0].eventToken,clicks[0].eventToken);assert(clicks[0].sequence<boundaries[0].sequence);return [clicks[0],boundaries[0]];
 };
 const exactAction=(check,payload,stage='activation',binding={label:'original',action:check.raw.before.state.binding.action})=>{
  const direct=one(check,'direct-action',stage),host=one(check,'host',stage),result=one(check,'result',stage);
  for(const event of [direct,host,result])assert.deepEqual(event.payload,payload,'causal witness requires the fixed command payload');
  assert(direct.sequence<host.sequence&&host.sequence<result.sequence,'causal action precedes its host and result');
  assert.equal(host.label,binding.label);assert.equal(host.handlerToken,binding.action);
  assert.deepEqual(result.result,{binding:binding.label,owner:payload.id});return {direct,host,result};
 };
 const selectionWitness=(check,{stage='activation',open=false,after,label='original',binding=check.raw.before.state.binding}={})=>{
  const [,boundary]=clickInterval(check,stage),hosts=stageEvents(check,'host-change',stage).filter(e=>e.detail.name==='palette'),changes=stageEvents(check,'change',stage).filter(e=>e.detail.name==='palette');
  assert.equal(hosts.length,1,'causal selection witness requires one host notification');assert.equal(changes.length,1,'causal selection witness requires one document notification');
  const detail={id:activationPayload(trusted.surface).id,component:'navigation/CommandPalette',name:'palette',value:'option-file',selected:true};
  for(const event of [hosts[0],changes[0]]){assert.deepEqual(event.detail,detail,'causal selection witness exact payload');assert.equal(event.state.open,open);assert.deepEqual(selectedValues(event.state),['option-file']);}
  assert.equal(hosts[0].label,label);assert.equal(hosts[0].handlerToken,binding.change,'causal selection witness uses the installed change callback');
  assert(after.sequence<hosts[0].sequence&&hosts[0].sequence<changes[0].sequence&&changes[0].sequence<boundary.sequence,'causal selection witness stays after delivery and before trusted click return');
 };
 const transport=(check,stage,action)=>{
  const starts=stageEvents(check,'request-start',stage),successes=stageEvents(check,'bridge-success',stage),count=trusted.surface==='sdui'?1:0;
  assert.equal(starts.length,count,'causal witness exact transport starts');assert.equal(successes.length,count,'causal witness exact transport completions');
  if(count){assert.equal(Object.fromEntries(starts[0].fields)._action,action);assert.equal(successes[0].action,action);assert.equal(successes[0].requestId,Object.fromEntries(starts[0].fields)._request);}
 };
 if(['template-marker-omitted','close-after-action'].includes(selected.mutation)){
  const [click,boundary]=clickInterval(pointer),{direct,host}=exactAction(pointer,activationPayload(trusted.surface));
  assert(click.sequence<direct.sequence&&host.sequence<boundary.sequence,'open callback stays in the same trusted click interval');
  const selection=selected.mutation==='template-marker-omitted'?'open-file':'option-file';
  for(const event of [direct,host]){assert.equal(event.state.open,true,'causal witness observes a real callback while open');assert.deepEqual(selectedValues(event.state),[selection],'causal witness preserves the source-specific selection phase');}
  for(const state of [boundary.state,pointer.raw.after.state]){assert.equal(state.open,false);assert.deepEqual(selectedValues(state),['option-file']);}
  selectionWitness(pointer,{open:selected.mutation==='template-marker-omitted',after:host});
  transport(pointer,'activation','command-observed');
 }
 if(selected.mutation==='empty-enter-fallthrough')for(const check of report.checks.filter(c=>c.name.startsWith('empty.'))){
  const query=check.name==='empty.filtered'?'zzzzzz':'',payload=activationPayload(trusted.surface,'run',query),down=one(check,'keydown'),up=one(check,'keyup'),keyBoundary=one(check,'key-boundary');
  assert.equal(keyBoundary.defaultPrevented,false);assert.equal(keyBoundary.eventToken,down.eventToken);
  for(const stage of ['activation','explicit']){
   const submit=one(check,'submit',stage),boundary=one(check,'submit-boundary',stage),{direct,host,result}=exactAction(check,payload,stage);
   assert.equal(submit.trusted,true,'causal witness requires an actual trusted submit');assert.equal(submit.target.token,check.raw.before.state.form.token);assert.equal(boundary.eventToken,submit.eventToken);assert.equal(boundary.target.token,submit.target.token);
   assert.deepEqual([boundary.formAction,boundary.fields,boundary.defaultPrevented],['run',[['cmdQuery',query]],true]);
   assert(submit.sequence<direct.sequence&&host.sequence<boundary.sequence,'submit surrounds its synchronous exact run delivery');
   for(const event of [submit,direct,host,result,boundary]){assert.equal(event.state.open,true);assert.deepEqual(selectedValues(event.state),[]);}
   if(stage==='activation')assert(down.sequence<keyBoundary.sequence&&keyBoundary.sequence<submit.sequence&&boundary.sequence<up.sequence&&result.sequence<up.sequence,'implicit submit and run belong to the same Enter interval');
   else{const call=one(check,'requestSubmit-call',stage),returned=one(check,'requestSubmit-return',stage);assert.deepEqual([call.api,returned.api],['HTMLFormElement.requestSubmit','HTMLFormElement.requestSubmit']);assert(call.sequence<submit.sequence&&boundary.sequence<returned.sequence,'explicit API control retains its real submit and run');}
   transport(check,stage,'query-observed');
  }
 }
 if(selected.mutation==='core-skip-removed'){
  const direct=stageEvents(pointer,'direct-action'),hosts=stageEvents(pointer,'host'),click=stageEvents(pointer,'click').filter(e=>e.trusted),boundary=stageEvents(pointer,'click-boundary').filter(e=>e.trusted);
  assert.equal(click.length,1);assert.equal(boundary.length,1);assert.equal(boundary[0].eventToken,click[0].eventToken);
  assert.equal(direct.length,2,'generic skip reversal duplicates the command');assert.equal(hosts.length,2);
  for(let i=0;i<2;i++){assert.deepEqual(direct[i].payload,activationPayload(trusted.surface));assert.deepEqual(hosts[i].payload,activationPayload(trusted.surface));assert(click[0].sequence<direct[i].sequence&&direct[i].sequence<hosts[i].sequence&&hosts[i].sequence<boundary[0].sequence,'duplicate stays in the same trusted click');assert.equal(direct[i].state.open,i===0);assert.equal(hosts[i].state.open,i===0);assert.equal(hosts[i].label,'original');assert.equal(hosts[i].handlerToken,pointer.raw.before.state.binding.action);for(const event of [direct[i],hosts[i]])assert.deepEqual(selectedValues(event.state),[i===0?'open-file':'option-file']);}
  assert(hosts[0].sequence<direct[1].sequence);for(const event of [direct[1],hosts[1]])assert.deepEqual(selectedValues(event.state),['option-file']);
  const results=stageEvents(pointer,'result');assert.equal(results.length,2,'causal duplicate commands retain both native results');
  for(let i=0;i<2;i++){assert.deepEqual(results[i].payload,activationPayload(trusted.surface));assert.deepEqual(results[i].result,{binding:'original',owner:activationPayload(trusted.surface).id});assert(results[i].sequence>hosts[i].sequence);assert.equal(results[i].state.open,i===0);assert.deepEqual(selectedValues(results[i].state),[i===0?'open-file':'option-file']);}
  assert(results[0].sequence<direct[1].sequence,'native generic result precedes the owned listener');
  selectionWitness(pointer,{after:hosts[1]});for(const state of [boundary[0].state,pointer.raw.after.state]){assert.equal(state.open,false);assert.deepEqual(selectedValues(state),['option-file']);}
  // Native duplicate-dispatch collection is qualified Go only. SDUI's busy
  // source guard may coalesce transport; raw transport joins remain shared.
 }
 if(selected.mutation==='family-emit-omitted'){
  for(const type of ['direct-action','host','result','request-start','bridge-success'])assert.equal(stageEvents(pointer,type).length,0,'owned emit omission has no '+type);
  const [click,boundary]=clickInterval(pointer);selectionWitness(pointer,{after:click});assert.equal(boundary.state.open,false);assert.deepEqual(selectedValues(boundary.state),['option-file']);
  assert.equal(pointer.raw.after.state.open,false);assert.deepEqual(selectedValues(pointer.raw.after.state),['option-file']);assert.equal(report.requests.filter(r=>r.check===pointer.name&&r.method==='POST').length,0);
 }
 if(selected.mutation==='blanket-palette-submit-prevention')for(const check of report.checks.filter(c=>c.name.startsWith('empty.'))){
  for(const type of ['requestSubmit-call','requestSubmit-return'])assert.deepEqual(stageEvents(check,type,'explicit').map(e=>e.api),['HTMLFormElement.requestSubmit']);
  const submits=stageEvents(check,'submit','explicit');assert.equal(submits.length,1,'blanket reversal must retain an actual explicit submit');assert.equal(submits[0].trusted,true);assert.equal(submits[0].target.token,check.raw.before.state.form.token);
  const call=one(check,'requestSubmit-call','explicit'),returned=one(check,'requestSubmit-return','explicit');assert(call.sequence<submits[0].sequence&&submits[0].sequence<returned.sequence,'blanket reversal submit belongs to its explicit API interval');
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
  const result=one(check,'result');assert.deepEqual(result.payload,activationPayload(trusted.surface));assert.deepEqual(result.result,{binding:'replacement',owner:activationPayload(trusted.surface).id});assert(result.sequence>hosts[0].sequence);
  const [freshClick,freshBoundary]=clickInterval(check,'fresh'),fresh=exactAction(check,activationPayload(trusted.surface),'fresh',{label:'replacement',action:transition.state.binding.action});
  assert(freshClick.sequence<fresh.direct.sequence&&fresh.host.sequence<freshBoundary.sequence,'fresh replacement command stays in its trusted click');
  for(const state of [fresh.direct.state,fresh.host.state,check.raw.fresh.state]){assert.equal(state.open,false);assert.deepEqual(selectedValues(state),['option-file']);}
  selectionWitness(check,{stage:'fresh',after:fresh.host,label:'replacement',binding:transition.state.binding});
  assert.equal(freshBoundary.state.open,false);assert.deepEqual(selectedValues(freshBoundary.state),['option-file']);
  for(const type of ['host-change','change'])assert.equal(stageEvents(check,type).filter(e=>e.detail.name==='palette').length,0,'owner bypass has no trailing selection');
  transport(check,'activation','command-observed');
  transport(check,'fresh','command-observed');
  if(trusted.surface==='sdui'){const starts=log.filter(e=>e.type==='request-start'&&e.stage==='activation');assert.equal(starts.length,1);assert(starts[0].sequence>hosts[0].sequence);const fields=Object.fromEntries(starts[0].fields);assert.equal(fields.commandAction,'option-command');assert.equal(fields.commandValue,'option-file');assert.equal(report.requests.filter(r=>r.check===name&&r.method==='POST'&&Object.fromEntries(r.fields)._request===fields._request).length,1);}
 }
 if(selected.mutation==='trailing-notification-guard-removed'){
  const check=report.checks.find(c=>c.name==='callback.reopen'),[click,boundary]=clickInterval(check),{direct,host}=exactAction(check,activationPayload(trusted.surface)),reopen=one(check,'callback-reopen');
  const hostChanges=stageEvents(check,'host-change').filter(e=>e.detail.name==='palette'),changes=stageEvents(check,'change').filter(e=>e.detail.name==='palette');
  assert.equal(hostChanges.length,1,'causal trailing witness retains its host selection');assert.equal(changes.length,1,'causal trailing witness retains its document selection');
  assert(click.sequence<direct.sequence&&host.sequence<reopen.sequence&&reopen.sequence<hostChanges[0].sequence&&hostChanges[0].sequence<changes[0].sequence&&changes[0].sequence<boundary.sequence,'stale selection follows callback reopen inside the original click');
  for(const event of [direct,host]){assert.equal(event.state.open,false);assert.deepEqual(selectedValues(event.state),['option-file']);}
  for(const state of [reopen.state,hostChanges[0].state,changes[0].state,check.raw.after.state]){assert.equal(state.open,true,'causal trailing witness preserves the reopened dialog');assert.equal(state.focus.token,state.query.token);assert.deepEqual(selectedValues(state),['option-file']);}
  const detail={id:activationPayload(trusted.surface).id,component:'navigation/CommandPalette',name:'palette',value:'option-file',selected:true};
  for(const event of [hostChanges[0],changes[0]])assert.deepEqual(event.detail,detail,'causal trailing witness carries the exact stale selection');
  assert.equal(hostChanges[0].label,'original');assert.equal(hostChanges[0].handlerToken,check.raw.before.state.binding.change);
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
