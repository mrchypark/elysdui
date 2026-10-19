import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {copyCases, copyCaseIDs, copyValue, copyRequiredSources, copyRequiredBrowserPaths, copyLimitations} from '../ui/gohtmx/tests/browser/copybutton-complete-cases.mjs';
import {copySchema, copyOracles, validateCopyRaw, verifyCopyEvidence} from '../ui/gohtmx/tests/browser/copybutton-complete-evidence.mjs';
import {copySHA} from '../ui/gohtmx/tests/browser/copybutton-complete-inputs.mjs';
import {verifyProcessEvidence, verifyCopyScreenshots} from './copybutton-complete-run.mjs';
import {testCopyTransitions} from './copybutton-complete-transitions-test.mjs';

// These source-owned, explicitly synthetic examples exercise report admission.
// They never launch a browser, server, Go build or external process, read a real
// clipboard, produce a screenshot, or claim evidence about component behavior.
const clone = value => structuredClone(value);
const sourceOnly = true;
const keys = ['#copy-a', '#copy-b', '#copy-empty', '#copy-disabled', '#copy-items', '#copy-override', '#copy-adapter', '#copy-adapter-disabled'];
const productionSources = ['ui/gohtmx/assets/ely-api.js', 'ui/gohtmx/assets/ely-api-interaction.js', 'ui/gohtmx/assets/ely-api-interaction.css', 'ui/gohtmx/templates/ely-api-interaction.html'];
const rect = (width=24, height=24) => ({x:24, y:100, width, height});
const style = () => ({color:'rgb(20, 20, 20)',backgroundColor:'rgba(0, 0, 0, 0)',borderColor:'rgba(0, 0, 0, 0)',borderWidth:'1px',borderRadius:'6px',outlineColor:'rgb(70, 90, 200)',outlineWidth:'0px',outlineStyle:'solid',boxShadow:'none',opacity:'1',cursor:'pointer',flexShrink:'0',display:'inline-flex',alignItems:'center',justifyContent:'center',justifyItems:'normal',width:'24px',height:'24px',transform:'none',animationName:'none',animationDuration:'0s',animationTimingFunction:'ease',transitionDuration:'0s',fontSize:'14px',maskImage:'none',content:'normal'});
const animation = reduced => ({id:'synthetic-check-entrance',currentTime:0,playState:'running',timing:{delay:0,direction:'normal',duration:reduced?1:120,easing:'cubic-bezier(0.333333, 1, 0.666667, 1)',endDelay:0,fill:'both',iterationStart:0,iterations:1},frames:[{offset:0,transform:'rotate(-0.6rad)',easing:'linear'},{offset:1,transform:'rotate(0rad)',easing:'linear'}]});
const icon = (name, zoom=1, reduced=false) => ({name,hidden:'true',visible:true,rect:rect((name==='check'?14:12)*zoom,(name==='check'?14:12)*zoom),style:{...style(),color:name==='check'?'rgb(20, 150, 80)':'rgb(20, 20, 20)'},animations:name==='check'?[animation(reduced)]:[]});

function makeRoots(spec) {
  return Object.fromEntries(keys.map((key,index) => {
    const id = key.includes('adapter') ? `sdui-internal-synthetic-${index}` : key.slice(1);
    const root = {token:100+index*10,id,ready:'true',connected:true,controls:[],statuses:[{text:'',live:'polite',role:null}],tooltips:[],themeSuccess:'rgb(20, 150, 80)',themeForeground:'rgb(20, 20, 20)'};
    for(let i=0;i<(key==='#copy-items'?3:1);i++) {
      const disabled=key.includes('disabled')||(key==='#copy-items'&&i===2),zoom=spec.zoom||1;
      const label=key==='#copy-override'?'Copy override':key.includes('adapter')?'Copy adapter text':'Copy';
      root.controls.push({token:root.token+i+1,id:key==='#copy-items'?'':id+'-control',tag:'BUTTON',type:'button',variant:key==='#copy-override'?'outline':'ghost',size:key==='#copy-override'?'sm':'icon-xs',value:key==='#copy-empty'?'':key==='#copy-items'?['first','second','third'][i]:copyValue,text:label,ariaLabel:key==='#copy-override'?'Copy the override value':key.includes('adapter')?null:'Copy',title:null,describedBy:null,pressed:null,disabled,ariaDisabled:null,busy:null,copied:null,focused:false,focusVisible:false,visible:true,connected:true,rect:rect(24*zoom,24*zoom),style:style(),icons:[icon('copy',zoom)],visibleText:key==='#copy-override'||key.includes('adapter')?label:''});
    }
    return [key,root];
  }));
}

function buildCase(spec) {
  const raw={snapshots:[],log:[],errors:[],environment:{clock:spec.id==='real-clock'?'browser-real':'playwright-controlled',reducedMotion:spec.reducedMotion||'no-preference',theme:spec.theme||'light',zoom:spec.zoom||1,viewport:{width:spec.zoom?320:1000,height:900}},aria:{},screenshots:{}};
  const check={id:spec.id,raw,oracles:[],status:'failed'},roots=makeRoots(spec);
  let time=1000,active=null,activeID='',mode='success';
  const r=(key='#copy-a')=>roots[key],b=(key='#copy-a',i=0)=>r(key).controls[i];
  const row=(type,data={})=>{const value={sequence:raw.log.length+1,time,type,...data};raw.log.push(value);return value;};
  const setMode=value=>{mode=value;row('mode',{value});};
  const focus=(key='#copy-a',i=0)=>{for(const root of Object.values(roots))for(const control of root.controls)control.focused=false;const target=b(key,i);target.focused=true;target.focusVisible=true;active=target.token;activeID=target.id;};
  const input=(event='click',key='#copy-a',i=0,extra={})=>{const target=b(key,i);if(!target.disabled)focus(key,i);return row('input',{event,trusted:true,key:null,button:['pointerdown','pointerup','click'].includes(event)?0:null,target:target.token,control:target.token,root:r(key).token,targetID:target.id,rootID:r(key).id,active,defaultPrevented:false,...extra});};
  const activate=(key='#copy-a',i=0,method='pointer')=>{
    if(method==='pointer'){input('pointerdown',key,i);input('pointerup',key,i);return input('click',key,i);}
    const keyValue=method==='enter'?'Enter':' ';input('keydown',key,i,{key:keyValue});input('keyup',key,i,{key:keyValue});return input('click',key,i,{button:0});
  };
  const event=(name,key='#copy-a',detail={},tasks=[])=>row('event',{event:name,rootID:r(key).id,target:r(key).token,detail:{id:r(key).id,component:'buttons/CopyButton',action:null,name:null,value:null,copied:null,error:null,...detail},tasks});
  const state=(phase,key='#copy-a',i=0)=>{
    const target=b(key,i),root=r(key);target.busy=phase==='pending'?'true':null;target.copied=phase==='copied'?'true':null;target.ariaDisabled=phase==='copied'?'true':null;
    target.icons=[icon(phase==='copied'?'check':'copy',spec.zoom||1,!!spec.reducedMotion)];
    root.statuses[0].text=phase==='copied'?'Copied':phase==='failed'?'Copy failed':'';
    root.tooltips=phase==='copied'?[{id:root.id+'-tooltip',text:'Copied',rect:rect(70,24)}]:[];
  };
  const call=(key='#copy-a',i=0,method='pointer')=>{const activation=activate(key,i,method);const receipt=row('clipboard-call',{value:b(key,i).value,input:activation.sequence,control:b(key,i).token,root:r(key).token,rootID:r(key).id,active,mode});state('pending',key,i);return {receipt,key,index:i,value:b(key,i).value,action:key==='#copy-override'?'custom-copy':'copy',rootID:r(key).id,rootToken:r(key).token,controlToken:b(key,i).token};};
  const settle=(call,outcome='resolve')=>row('clipboard-settle',{call:call.receipt.sequence,outcome});
  const notify=(call,{change=true,action=true}={})=>{
    if(action)event('ely:action',call.key,{id:call.rootID,action:call.action,value:call.value});
    if(change)event('ely:change',call.key,{id:call.rootID,name:'copy',value:call.value,copied:true});
  };
  const succeed=(call,options={})=>{settle(call);state('copied',call.key,call.index);notify(call,options);};
  const copy=(key='#copy-a',i=0,method='pointer')=>{const receipt=call(key,i,method);succeed(receipt);return receipt;};
  const snap=name=>{
    if(name==='replayed') {
      const call=raw.log.findLast(row=>row.type==='clipboard-call'&&row.control===b().token&&row.root===r().token);
      row('animation',{event:'animationstart',control:b().token,root:r().token,call:call.sequence,pseudo:'',icon:'check',animations:[animation(false)]});
    }
    row('operation',{name:'fonts-ready',status:'loaded'});
    if(spec.id.startsWith('appearance-')&&['idle','hover','pressed','focus'].includes(name)) {
      const observe=(phase,transitions=[])=>row('operation',{name:'appearance-transitions',checkpoint:name,control:b().token,root:r().token,phase,transitions});
      if(name==='idle') {
        const transition={target:b().token,pseudo:'',property:'background-color',playState:'running',currentTime:0,duration:150,outcome:null,error:null};
        observe('observed',[transition]);observe('completed',[{...transition,outcome:'cancelled',error:{name:'AbortError',message:'Synthetic transition cancellation'}}]);
        observe('observed',[transition]);observe('completed',[{...transition,outcome:'finished'}]);
      }
      for(const phase of ['observed','observed','settled'])observe(phase);
    }
    const witness=row('checkpoint',{name});raw.snapshots.push({name,sequence:witness.sequence,time,active,activeID,scrollY:0,roots:clone(roots)});
    const accessibleName=spec.id==='explicit-override'?'Copy the override value':spec.id==='adapter'?'Copy adapter text':'Copy';raw.aria[name]=`- button "${accessibleName}"`;
    // Hashes identify synthetic labels, not PNG bytes or browser captures.
    raw.screenshots[name]={path:`screenshots/${spec.id}-${name}.png`,sha256:copySHA(`SYNTHETIC-SCHEMA-ONLY ${spec.id} ${name}`),bytes:64};
  };
  const advance=ms=>{time+=ms;};
  const replacement=({root=false}={})=>{if(root)r().token+=1000;b().token+=1000;state('idle');};
  const fresh=()=>{setMode('success');copy();snap('fresh');};
  setMode(spec.id==='real-clipboard'?'real':'success');
  if(spec.id==='missing-icon'){row('operation',{name:'icon-route-abort',path:'/assets/ely/icons/copy.svg'});row('operation',{name:'icon-request-failed',path:'/assets/ely/icons/copy.svg',error:'net::ERR_FAILED'});}
  snap('idle');
  if(spec.id.startsWith('appearance-')) {
    b().style.backgroundColor='rgb(245, 245, 245)';r().tooltips=[{id:'copy-a-tooltip',text:'Copy',rect:rect(60,24)}];snap('hover');
    input('pointerdown');b().style.backgroundColor='rgb(230, 230, 230)';snap('pressed');input('pointerup','#copy-a',0,{target:999,control:null,root:null,targetID:'',rootID:''});
    input('keydown','#copy-a',0,{key:'Tab'});b().style.outlineWidth='2px';snap('focus');copy('#copy-a',0,'enter');snap('copied');advance(1400);state('idle');r().tooltips=[{id:'copy-a-tooltip',text:'Copy',rect:rect(60,24)}];snap('reset');
  } else if(spec.id.startsWith('activation-')) {
    copy('#copy-a',0,spec.input);snap('copied');advance(1400);state('idle');snap('reset');
  } else if(spec.id==='cancelled-pointer') {
    input('pointerdown');input('pointerup','#copy-a',0,{target:999,control:null,root:null,targetID:'',rootID:''});snap('cancelled');input('pointerdown','#copy-a',0,{button:2});input('contextmenu','#copy-a',0,{button:2});snap('right-click');
  } else if(['exact-timing','repeat-lockout','reduced-motion'].includes(spec.id)) {
    let receipt;
    if(spec.id==='reduced-motion')receipt=copy();
    else {setMode('pending');receipt=call();snap('pending');
      if(spec.id==='exact-timing'){advance(2000);snap('delayed');}
      else {activate();activate('#copy-a',0,'enter');activate('#copy-a',0,'space');snap('repeated-pending');}
      succeed(receipt);
    }
    snap('copied');
    if(spec.id==='repeat-lockout'){activate();activate('#copy-a',0,'enter');activate('#copy-a',0,'space');snap('repeated-copied');}
    advance(1399);snap('before-deadline');advance(1);state('idle');snap('deadline');
    if(spec.id!=='reduced-motion'){setMode('success');copy();snap('replayed');}
  } else if(spec.id.startsWith('failure-')) {
    setMode(spec.failure);
    if(spec.failure==='missing')activate();else {const receipt=call();settle(receipt,spec.failure);}
    state('failed');event('ely:change','#copy-a',{name:'copy',value:copyValue,copied:false,error:'clipboard-unavailable'});snap('failed');setMode('success');copy();snap('retry');
  } else if(spec.id==='empty-value') {copy('#copy-empty');snap('copied');}
  else if(spec.id==='captured-payload') {
    setMode('pending');const receipt=call();snap('pending');b().value='changed';row('operation',{name:'change-payload',beforeValue:copyValue,afterValue:'changed',beforeAction:'copy',afterAction:'changed-action'});succeed(receipt);snap('copied');
  } else if(spec.id==='cancelled-action') {copy();row('operation',{name:'cancel-action',defaultPrevented:true});snap('copied');}
  else if(spec.id==='host-error') {copy();row('host',{name:'throw'});event('ely:error','#copy-a',{error:'Intentional host callback error'});snap('copied');}
  else if(spec.id==='disabled') {
    input('pointerdown','#copy-disabled');input('pointerdown','#copy-items',2);input('click','#copy-disabled',0,{trusted:false});input('click','#copy-items',2,{trusted:false});snap('attempted');advance(1400);snap('reset');
  } else if(spec.id.endsWith('-independent')) {
    const items=spec.id==='items-independent',a=items?'#copy-items':'#copy-a',other=items?'#copy-items':'#copy-b',i=items?1:0;
    setMode('pending');const first=call(a),second=call(other,i);snap('pending');succeed(second);snap('b-first');advance(200);succeed(first);snap('a-second');advance(1200);state('idle',other,i);snap('b-reset');advance(200);state('idle',a);snap('a-reset');
  } else if(spec.id.startsWith('callback-')) {
    const receipt=call();settle(receipt);state('copied');notify(receipt,{change:false});row('host',{name:spec.operation});state('idle');snap('returned');advance(1400);snap('deadline');
  } else if(spec.id==='pending-rebind') {
    setMode('pending');const receipt=call();snap('pending');row('operation',{name:'rebind',before:r().token,after:r().token,connected:true});state('idle');snap('rebound');settle(receipt);snap('settled');advance(1400);fresh();
  } else if(spec.id.startsWith('child-')) {
    setMode('pending');const receipt=call(),old=clone(b());snap('pending');replacement();
    if(spec.operation==='moved'){old.busy=null;r('#copy-b').controls.push(old);}
    row('operation',{name:spec.operation,oldControl:receipt.controlToken,newControl:b().token,beforeParent:700,afterParent:spec.operation==='moved'?701:null,connected:spec.operation==='moved'});snap('changed');settle(receipt);snap('settled');advance(1400);if(spec.operation==='moved'){setMode('success');copy('#copy-b',1);snap('fresh');}else fresh();
  } else if(spec.id.startsWith('htmx-')) {
    setMode(spec.phase==='pending'?'pending':'success');const receipt=call();if(spec.phase==='copied')succeed(receipt);snap('active');
    const target=spec.swap==='control'?b().token:r().token;activate('#copy-a',0,'pointer');
    event('htmx:before:swap','#copy-a',{},[{target,style:spec.swap==='inner'?'innerHTML':'outerHTML'}]);replacement({root:spec.swap==='root'});event('htmx:after:swap','#copy-a');advance(100);snap('swapped');
    if(spec.phase==='pending')settle(receipt,spec.reject?'reject':'resolve');else advance(1400);snap('settled');fresh();
  } else if(spec.id==='moved-copied') {
    copy();snap('old-copied');advance(200);const old=clone(b());replacement();old.copied=null;old.ariaDisabled=null;old.icons=[icon('copy')];r('#copy-b').controls.push(old);row('operation',{name:'move-copied',control:old.token,beforeParent:700,afterParent:701,connected:true});snap('moved');copy('#copy-b',1);snap('fresh');advance(1200);snap('old-deadline');advance(200);state('idle','#copy-b',1);snap('new-deadline');
  } else if(spec.id==='same-node-remount') {
    setMode('pending');const receipt=call();snap('pending');row('operation',{name:'remount',token:r().token,connected:true});state('idle');snap('remounted');settle(receipt);snap('settled');fresh();advance(1400);state('idle');snap('reset');
  } else if(spec.id==='repeat-initialization') {
    copy();snap('copied');advance(200);row('operation',{name:'repeat-start',root:r().token});snap('reinitialized');advance(1200);state('idle');snap('deadline');
  } else if(spec.id==='tab-order') {
    input('keydown','#copy-a',0,{key:'Tab'});snap('tab');input('keydown','#copy-a',0,{key:'Tab'});input('keydown','#copy-a',0,{key:'Shift'});input('keydown','#copy-a',0,{key:'Tab'});snap('shift-tab');copy('#copy-a',0,'space');snap('copied');advance(1400);state('idle');snap('reset');
  } else if(spec.id==='explicit-override') {copy('#copy-override');snap('copied');}
  else if(spec.id==='real-clipboard') {copy();snap('copied');row('operation',{name:'real-read',value:copyValue,secure:true});snap('read');}
  else if(spec.id==='real-clock') {copy();snap('copied');advance(1000);snap('before-deadline');advance(600);state('idle');snap('reset');}
  else if(spec.id==='missing-icon') {copy();snap('copied');}
  else if(spec.id==='adapter') {copy('#copy-adapter');snap('copied');input('pointerdown','#copy-adapter-disabled');input('click','#copy-adapter-disabled',0,{trusted:false});snap('disabled');}
  else if(spec.id==='narrow-zoom') {copy();snap('copied');advance(1400);state('idle');snap('reset');}
  else throw new Error('Synthetic case builder missing '+spec.id);
  assert.deepEqual(raw.snapshots.map(s=>s.name),spec.checkpoints,'synthetic source-owned checkpoint inventory');
  return check;
}

// Model an entrance animation that starts before a slow font settlement and
// has already finished when the copied screenshot's animation list is read.
function addSyntheticAnimationStart(report,{id='appearance-light',name='copied',fontDelay=130}={}) {
  const check=report.checks.find(c=>c.id===id),raw=check.raw;
  const snapshot=raw.snapshots.find(s=>s.name===name),root=snapshot.roots['#copy-a'],control=root.controls[0];
  const copiedIcon=control.icons.find(icon=>icon.name==='check');copiedIcon.animations=[];
  const call=raw.log.findLast(row=>row.type==='clipboard-call'&&row.control===control.token&&row.root===root.token&&row.sequence<snapshot.sequence);
  const insertion=snapshot.sequence-1; // Before this checkpoint's fonts-ready row.
  const start={sequence:insertion,time:snapshot.time,type:'animation',event:'animationstart',control:control.token,root:root.token,call:call.sequence,pseudo:'',icon:'check',animations:[animation(false)]};
  for(const row of raw.log){if(row.sequence>=insertion)row.sequence++;if(row.input>=insertion)row.input++;if(row.call>=insertion)row.call++;}
  for(const snap of raw.snapshots)if(snap.sequence>=insertion)snap.sequence++;
  raw.log.splice(insertion-1,0,start);
  // The fixture intentionally records a font wait longer than FAST=120ms.
  snapshot.time+=fontDelay;raw.log.find(row=>row.sequence===snapshot.sequence).time=snapshot.time;
  raw.log.find(row=>row.sequence===snapshot.sequence-1).time=snapshot.time;
  return start;
}

function rederive(report) {
  for(const check of report.checks){check.oracles=copyOracles(check);check.status=check.oracles.every(o=>o.pass)?'passed':'failed';}
  report.status=report.checks.every(check=>check.status==='passed')?'passed':'failed';
  return report;
}

export function buildCopySchemaFixture() {
  const metadata=(path,contentType)=>{const bytes=Buffer.from('SYNTHETIC-SCHEMA-ONLY '+path);return {sourceSHA256:copySHA(bytes),servedSHA256:copySHA(bytes),bytes:bytes.length,contentType};};
  const sourceFiles=Object.fromEntries([...copyRequiredSources,...productionSources,'go.mod','go.sum','package.json','package-lock.json'].map(path=>[path,copySHA('SYNTHETIC-SOURCE '+path)]));
  const assets=Object.fromEntries([...copyRequiredBrowserPaths.filter(path=>path!=='/'),'/assets/ely/icons/copy.svg'].map(path=>[path,metadata(path,path.endsWith('.css')?'text/css; charset=utf-8':'text/javascript; charset=utf-8')]));
  const fixtures=Object.fromEntries(['/','/fragment/root','/fragment/control','/fragment/inner','/manifest.json'].map(path=>[path,metadata(path,path.endsWith('.json')?'application/json; charset=utf-8':'text/html; charset=utf-8')]));
  const trusted={runToken:'00000000-0000-4000-8000-000000000001',revision:'1'.repeat(40),tree:'2'.repeat(40),dirty:'',mode:'control',mutation:null,sourceFiles,assets,fixtures,toolchain:{node:'synthetic-schema-only',go:'synthetic-schema-only',playwright:'synthetic-schema-only'},dependencyProof:{package:'./ui/gohtmx',SHA256:copySHA('synthetic public UI dependencies'),forbiddenImports:[]}};
  for(const [path,meta] of Object.entries(assets))sourceFiles[path==='/copybutton-observer.js'?'ui/gohtmx/tests/browser/copybutton-complete-observer.js':'ui/gohtmx'+path]=meta.sourceSHA256;
  const checks=copyCases.map(buildCase);
  // One deliberate desired-contract failure remains red after raw rederivation.
  // This is an invented schema example, not a baseline observation.
  checks.find(c=>c.id==='appearance-light').raw.snapshots[0].roots['#copy-a'].controls[0].visibleText='Copy';
  const report={schema:copySchema,...clone(trusted),caseInventory:clone(copyCaseIDs),limitations:clone(copyLimitations),browserVersion:'SYNTHETIC-SCHEMA-ONLY-NO-BROWSER',checks,responses:[],errors:[],status:'failed',stage:'complete'};
  for(const spec of copyCases)for(const path of [...copyRequiredBrowserPaths,...(spec.id==='missing-icon'?[]:['/assets/ely/icons/copy.svg']),...(spec.swap?['/fragment/'+spec.swap]:[])]) {
    const meta=assets[path]||fixtures[path];report.responses.push({caseID:spec.id,path,status:200,bytes:meta.bytes,sha256:meta.servedSHA256,method:'GET',htmx:path.startsWith('/fragment/')?'true':null});
  }
  rederive(report);
  return {sourceOnly,classification:'synthetic-schema-only; no browser or component behavior evidence',report,trusted,exit:1};
}

function processFixture(fixture) {
  const {report,trusted}=fixture,reportBytes=Buffer.from(JSON.stringify(report));
  const completion={copybuttonCompletion:1,runToken:trusted.runToken,reportSHA256:copySHA(reportBytes),status:report.status};
  return {reportBytes,stdout:Buffer.from(JSON.stringify(completion)+'\n'),stderr:Buffer.alloc(0),exit:{schema:'copybutton-process-exit-v1',runToken:trusted.runToken,revision:trusted.revision,tree:trusted.tree,status:report.status==='passed'?0:1,signal:null,error:null,truncated:false}};
}

export async function testCopySchemaEvidence() {
  const fixture=buildCopySchemaFixture(),{report,trusted}=fixture;
  const accepted=verifyCopyEvidence(report,trusted,1);
  assert.equal(accepted.status,'failed');assert.equal(accepted.cases,copyCaseIDs.length);assert.deepEqual(accepted.failedAssertions,['appearance-light.default-icon-only']);
  const green=clone(report);green.checks[0].raw.snapshots[0].roots['#copy-a'].controls[0].visibleText='';rederive(green);
  assert.equal(verifyCopyEvidence(green,trusted,0).status,'passed','raw correction produces synthetic green');
  assert.throws(()=>verifyCopyEvidence(green,trusted,1),undefined,'green must retain actual exit zero');
  assert(report.checks.flatMap(c=>c.oracles).filter(o=>o.prerequisite).every(o=>o.pass),'synthetic fixture supplies every positive prerequisite');
  let rejected=0;
  const reject=(label,change,{derive=false,exit=1}={})=>{
    const candidate=clone(report);change(candidate);
    if(derive)rederive(candidate);
    assert.throws(()=>verifyCopyEvidence(candidate,trusted,exit),undefined,label);rejected++;
  };
  const check=(report,id)=>report.checks.find(c=>c.id===id);
  const witness=(id,label,change)=>reject(id+': '+label,r=>change(check(r,id)),{derive:true});

  for(const [index,id] of copyCaseIDs.entries()) {
    reject('missing case '+id,r=>r.checks.splice(index,1));
    reject('duplicate case '+id,r=>r.checks.splice(index,0,clone(r.checks[index])));
    reject('foreign case '+id,r=>{r.checks[index].id='foreign-'+id;});
    reject('reordered case '+id,r=>{const other=(index+1)%r.checks.length;[r.checks[index],r.checks[other]]=[r.checks[other],r.checks[index]];});
    reject('missing inventory entry '+id,r=>r.caseInventory.splice(index,1));
    witness(id,'missing trusted native input',c=>{for(const row of c.raw.log)if(row.type==='input')row.trusted=false;});
    for(const name of copyCases[index].checkpoints) {
      reject(id+': missing checkpoint '+name,r=>{check(r,id).raw.snapshots=check(r,id).raw.snapshots.filter(s=>s.name!==name);});
      reject(id+': missing accessibility '+name,r=>{delete check(r,id).raw.aria[name];});
      reject(id+': missing screenshot '+name,r=>{delete check(r,id).raw.screenshots[name];});
      witness(id,'missing font settlement before '+name,c=>{const snapshot=c.raw.snapshots.find(s=>s.name===name),row=c.raw.log.findLast(r=>r.sequence<snapshot.sequence&&r.type==='operation'&&r.name==='fonts-ready'),sequence=row.sequence,time=row.time;assert.equal(row.name,'fonts-ready');for(const key of Object.keys(row))delete row[key];Object.assign(row,{sequence,time,type:'mode',value:'success'});});
    }
  }
  for(const path of [...copyRequiredSources,...productionSources]) {
    reject('changed source '+path,r=>{r.sourceFiles[path]=copySHA('changed '+path);});
    reject('omitted source '+path,r=>{delete r.sourceFiles[path];});
  }
  reject('coordinated production and served bytes cannot replace trusted snapshot',r=>{
    const path='/assets/ely-api-interaction.js',hash=copySHA('coordinated changed source');r.sourceFiles['ui/gohtmx'+path]=hash;r.assets[path].sourceSHA256=hash;r.assets[path].servedSHA256=hash;
    for(const response of r.responses)if(response.path===path)response.sha256=hash;
  });
  reject('coordinated own verifier and report cannot replace trusted snapshot',r=>{r.sourceFiles['ui/gohtmx/tests/browser/copybutton-complete-evidence.mjs']=copySHA('weakened verifier');r.checks[0].oracles.forEach(o=>o.pass=true);r.checks[0].status='passed';});
  for(const key of ['revision','tree'])reject('stale '+key,r=>{r[key]='f'.repeat(40);});
  reject('stale run token',r=>{r.runToken='00000000-0000-4000-8000-000000000002';});
  reject('dirty checkout',r=>{r.dirty=' M production';});
  reject('early completion',r=>{r.stage='starting';});
  reject('stale aggregate green',r=>{r.status='passed';});
  reject('stale case green',r=>{r.checks[0].status='passed';});
  reject('stale oracle bit',r=>{r.checks[0].oracles.find(o=>!o.pass).pass=true;});
  reject('missing oracle inventory entry',r=>{r.checks[0].oracles.pop();});
  reject('duplicate oracle inventory entry',r=>{r.checks[0].oracles[1]=clone(r.checks[0].oracles[0]);});
  reject('foreign oracle inventory entry',r=>{r.checks[0].oracles[0].id='foreign';});
  reject('reordered oracle inventory',r=>{[r.checks[0].oracles[0],r.checks[0].oracles[1]]=[r.checks[0].oracles[1],r.checks[0].oracles[0]];});

  reject('wrong successful exit',()=>{},{exit:0});
  reject('wrong infrastructure exit',()=>{},{exit:2});
  reject('missing dependency proof',r=>{delete r.dependencyProof;});
  reject('changed dependency proof',r=>{r.dependencyProof.forbiddenImports.push('github.com/mrchypark/elysdui/sdui');});
  reject('changed named limitations',r=>{r.limitations.screenReader='passed';});
  reject('report infrastructure error',r=>r.errors.push('unrelated harness failure'));

  // Exact outer schemas and raw capture inventories are admission requirements,
  // independently of whether the desired component assertions pass or fail.
  for(const key of Object.keys(report))reject('missing report field '+key,r=>{delete r[key];});
  reject('foreign report field',r=>{r.unexpected=true;});
  for(const key of Object.keys(report.checks[0]))reject('missing check field '+key,r=>{delete r.checks[0][key];});
  reject('foreign check field',r=>{r.checks[0].unexpected=true;});
  for(const key of Object.keys(report.checks[0].raw))reject('missing raw field '+key,r=>{delete r.checks[0].raw[key];});
  reject('foreign raw field',r=>{r.checks[0].raw.unexpected=true;});
  for(const key of Object.keys(report.checks[0].raw.environment))reject('missing environment '+key,r=>{delete r.checks[0].raw.environment[key];});
  reject('foreign environment field',r=>{r.checks[0].raw.environment.unexpected=true;});
  for(const key of Object.keys(report.checks[0].raw.snapshots[0]))reject('missing snapshot '+key,r=>{delete r.checks[0].raw.snapshots[0][key];});
  reject('foreign snapshot field',r=>{r.checks[0].raw.snapshots[0].unexpected=true;});
  for(const key of ['path','sha256','bytes'])reject('missing screenshot receipt '+key,r=>{delete r.checks[0].raw.screenshots.idle[key];});
  reject('foreign screenshot field',r=>{r.checks[0].raw.screenshots.idle.unexpected=true;});
  reject('screenshot path not joined',r=>{r.checks[0].raw.screenshots.idle.path='screenshots/foreign.png';});
  reject('invalid screenshot hash',r=>{r.checks[0].raw.screenshots.idle.sha256='not-a-hash';});
  reject('empty screenshot',r=>{r.checks[0].raw.screenshots.idle.bytes=0;});
  reject('empty accessibility capture',r=>{r.checks[0].raw.aria.idle='';});
  reject('log sequence gap',r=>{r.checks[0].raw.log[1].sequence+=1;});
  reject('unknown log type',r=>{r.checks[0].raw.log[0].type='invented';});
  reject('nonfinite log time',r=>{r.checks[0].raw.log[0].time=NaN;});
  witness('appearance-light','checkpoint without log witness',c=>{c.raw.log.find(row=>row.type==='checkpoint'&&row.name==='hover').name='foreign';});
  witness('appearance-light','checkpoint time mismatch',c=>{c.raw.snapshots.find(s=>s.name==='hover').time+=1;});
  witness('appearance-light','missing mounted root',c=>{c.raw.snapshots[0].roots['#copy-a'].ready=null;});
  witness('appearance-light','detached initial control',c=>{c.raw.snapshots[0].roots['#copy-a'].controls[0].connected=false;});
  for(const name of ['idle','hover','pressed','focus'])for(const field of ['phase','control','root','checkpoint'])witness('appearance-light','transition settlement '+name+' '+field,c=>{const row=c.raw.log.find(r=>r.name==='appearance-transitions'&&r.checkpoint===name&&r.phase==='settled');row[field]=field==='phase'?'observed':field==='checkpoint'?(name==='hover'?'idle':'hover'):0;});
  witness('appearance-light','missing real-frame re-observation',c=>{c.raw.log.findLast(r=>r.name==='appearance-transitions'&&r.checkpoint==='idle'&&r.phase==='observed').phase='completed';});
  witness('appearance-light','new active transition after earlier empty observations',c=>{const rows=c.raw.log.filter(r=>r.name==='appearance-transitions'&&r.checkpoint==='idle'),transition=clone(rows[0].transitions[0]);rows[0].transitions=[];rows.findLast(r=>r.phase==='observed').transitions=[transition];});
  witness('real-clock','wrong clock',c=>{c.raw.environment.clock='playwright-controlled';});
  witness('appearance-light','wrong controlled clock',c=>{c.raw.environment.clock='browser-real';});

  for(const path of copyRequiredBrowserPaths)for(const id of copyCaseIDs)reject('missing received asset '+id+' '+path,r=>{r.responses=r.responses.filter(response=>response.caseID!==id||response.path!==path);});
  for(const key of Object.keys(report.responses[0]))reject('missing response field '+key,r=>{delete r.responses[0][key];});
  reject('foreign response field',r=>{r.responses[0].unexpected=true;});
  reject('duplicate response',r=>r.responses.push(clone(r.responses[0])));
  reject('foreign response case',r=>{r.responses[0].caseID='foreign';});
  reject('foreign response path',r=>{r.responses[0].path='/foreign';});
  reject('non-GET response',r=>{r.responses[0].method='POST';});
  reject('non-200 response',r=>{r.responses[0].status=404;});
  reject('different received body',r=>{r.responses[0].sha256=copySHA('different body');});
  reject('different received byte count',r=>{r.responses[0].bytes++;});

  // Positive scenario witnesses are removed while all cached oracles/statuses
  // are rederived. Rejection must therefore come from admission, not stale bits.
  const alterRows=(c,predicate,change)=>{for(const row of c.raw.log)if(predicate(row))change(row);};
  for(const id of ['exact-timing','repeat-lockout'])witness(id,'pending call witness',c=>alterRows(c,r=>r.type==='clipboard-call',r=>{r.mode='success';}));
  for(const id of ['exact-timing','repeat-lockout','reduced-motion'])for(const name of ['before-deadline','deadline'])witness(id,'wrong timer checkpoint '+name,c=>{const snapshot=c.raw.snapshots.find(s=>s.name===name);snapshot.time++;c.raw.log.find(r=>r.sequence===snapshot.sequence).time=snapshot.time;});
  for(const id of ['failure-reject','failure-throw'])witness(id,'missing failed settlement',c=>alterRows(c,r=>r.type==='clipboard-settle'&&r.outcome!=='resolve',r=>{r.outcome='resolve';}));
  for(const id of ['failure-reject','failure-throw','failure-missing'])witness(id,'missing failure mode',c=>alterRows(c,r=>r.type==='mode'&&r.value!=='success',r=>{r.value='success';}));
  for(const id of ['roots-independent','items-independent'])witness(id,'wrong settlement order',c=>{const rows=c.raw.log.filter(r=>r.type==='clipboard-settle');[rows[0].call,rows[1].call]=[rows[1].call,rows[0].call];});
  witness('activation-pointer','settlement without its call',c=>{c.raw.log.find(r=>r.type==='clipboard-settle').call=0;});
  witness('activation-pointer','settlement before its call',c=>{const settlement=c.raw.log.find(r=>r.type==='clipboard-settle'),call=c.raw.log.find(r=>r.type==='clipboard-call');settlement.call=call.sequence+1000;});
  witness('exact-timing','duplicate settlement for one call',c=>{const settlement=c.raw.log.find(r=>r.type==='clipboard-settle'),mode=c.raw.log.findLast(r=>r.type==='mode');const sequence=mode.sequence,time=mode.time;for(const key of Object.keys(mode))delete mode[key];Object.assign(mode,{sequence,time,type:'clipboard-settle',call:settlement.call,outcome:'resolve'});});
  witness('activation-pointer','clipboard call uses another physical root',c=>{c.raw.log.find(r=>r.type==='clipboard-call').root++;});
  witness('activation-pointer','clipboard call uses another control',c=>{c.raw.log.find(r=>r.type==='clipboard-call').control++;});

  for(const operation of ['teardown','rebind'])witness('callback-'+operation,'missing host callback',c=>alterRows(c,r=>r.type==='host'&&r.name===operation,r=>{r.name='foreign';}));
  witness('pending-rebind','disconnected binding',c=>alterRows(c,r=>r.type==='operation'&&r.name==='rebind',r=>{r.connected=false;}));
  witness('pending-rebind','different physical node binding',c=>alterRows(c,r=>r.type==='operation'&&r.name==='rebind',r=>{r.after++;}));
  for(const operation of ['moved','replaced'])witness('child-'+operation,'no ownership change',c=>alterRows(c,r=>r.type==='operation'&&r.name===operation,r=>{r.afterParent=r.beforeParent;}));
  for(const spec of copyCases.filter(c=>c.swap)) {
    witness(spec.id,'no actual before swap',c=>alterRows(c,r=>r.type==='event'&&r.event==='htmx:before:swap',r=>{r.event='ely:result';}));
    witness(spec.id,'wrong swap mode',c=>alterRows(c,r=>r.type==='event'&&r.event==='htmx:before:swap',r=>{r.tasks[0].style='none';}));
    witness(spec.id,'same control not replaced',c=>{const active=c.raw.snapshots.find(s=>s.name==='active').roots['#copy-a'].controls[0];c.raw.snapshots.find(s=>s.name==='swapped').roots['#copy-a'].controls[0].token=active.token;});
    reject(spec.id+': missing HTMX request receipt',r=>{r.responses.find(response=>response.caseID===spec.id&&response.path==='/fragment/'+spec.swap).htmx=null;});
  }
  witness('same-node-remount','missing remount operation',c=>alterRows(c,r=>r.type==='operation'&&r.name==='remount',r=>{r.name='foreign';}));
  witness('same-node-remount','different remounted physical node',c=>{c.raw.snapshots.find(s=>s.name==='remounted').roots['#copy-a'].token++;});
  witness('repeat-initialization','missing repeated initialization',c=>alterRows(c,r=>r.type==='operation'&&r.name==='repeat-start',r=>{r.name='foreign';}));
  for(const id of ['pending-rebind','child-moved','child-replaced','same-node-remount',...copyCases.filter(c=>c.swap).map(c=>c.id)])witness(id,'fresh activation omitted',c=>{const inputs=c.raw.log.filter(r=>r.type==='clipboard-call');inputs.at(-1).input=0;});

  // Exercise exact nested raw schemas directly. Each corrupt candidate is a
  // complete check with valid cached assertions until one concrete field changes.
  const rejectRaw=(id,label,change)=>{const candidate=clone(check(report,id));change(candidate);assert.throws(()=>validateCopyRaw(candidate),undefined,label);rejected++;};
  const exactObject=(id,label,select)=>{
    for(const key of Object.keys(select(check(report,id))))rejectRaw(id,label+' missing '+key,c=>{delete select(c)[key];});
    rejectRaw(id,label+' foreign field',c=>{select(c).unexpected=true;});
  };
  exactObject('appearance-light','fixture root inventory',c=>c.raw.snapshots[0].roots);
  exactObject('appearance-light','root',c=>c.raw.snapshots[0].roots['#copy-a']);
  exactObject('appearance-light','control',c=>c.raw.snapshots[0].roots['#copy-a'].controls[0]);
  exactObject('appearance-light','control rect',c=>c.raw.snapshots[0].roots['#copy-a'].controls[0].rect);
  exactObject('appearance-light','status',c=>c.raw.snapshots[0].roots['#copy-a'].statuses[0]);
  exactObject('appearance-light','tooltip',c=>c.raw.snapshots.find(s=>s.name==='hover').roots['#copy-a'].tooltips[0]);
  exactObject('appearance-light','tooltip rect',c=>c.raw.snapshots.find(s=>s.name==='hover').roots['#copy-a'].tooltips[0].rect);
  exactObject('appearance-light','icon',c=>c.raw.snapshots[0].roots['#copy-a'].controls[0].icons[0]);
  exactObject('appearance-light','animation',c=>c.raw.snapshots.find(s=>s.name==='copied').roots['#copy-a'].controls[0].icons[0].animations[0]);
  for(const key of Object.keys(style()))rejectRaw('appearance-light','missing computed style '+key,c=>{delete c.raw.snapshots[0].roots['#copy-a'].controls[0].style[key];});
  const rowExamples=new Map();
  for(const c of report.checks)for(const row of c.raw.log){const shape=row.type+(['host','operation'].includes(row.type)?':'+row.name:'');if(!rowExamples.has(shape))rowExamples.set(shape,{id:c.id,sequence:row.sequence});}
  for(const [shape,{id,sequence}] of rowExamples)exactObject(id,'raw row '+shape,c=>c.raw.log.find(r=>r.sequence===sequence));
  exactObject('appearance-light','transition',c=>c.raw.log.find(r=>r.name==='appearance-transitions'&&r.transitions.length).transitions[0]);
  exactObject('appearance-light','transition cancellation',c=>c.raw.log.find(r=>r.name==='appearance-transitions'&&r.phase==='completed').transitions[0].error);
  for(const [field,value] of [['target',null],['duration',NaN],['playState','finished'],['outcome','finished'],['error',{}]])rejectRaw('appearance-light','invalid observed transition '+field,c=>{c.raw.log.find(r=>r.name==='appearance-transitions'&&r.transitions.length).transitions[0][field]=value;});
  exactObject('appearance-light','event detail',c=>c.raw.log.find(r=>r.type==='event').detail);
  exactObject('htmx-root-pending','HTMX swap task',c=>c.raw.log.find(r=>r.type==='event'&&r.event==='htmx:before:swap').tasks[0]);
  rejectRaw('appearance-light','unexpected browser diagnostic',c=>c.raw.errors.push('unrelated browser failure'));
  witness('appearance-light','browser diagnostics cannot become valid red',c=>c.raw.errors.push('unrelated browser failure'));
  for(const spec of copyCases.filter(c=>c.id!=='missing-icon'))reject('missing actual icon bytes '+spec.id,r=>{r.responses=r.responses.filter(response=>response.caseID!==spec.id||response.path!=='/assets/ely/icons/copy.svg');});
  for(const c of report.checks)for(const oracle of c.oracles.filter(o=>o.id.endsWith('.physical-activation-attempt'))) {
    const to=oracle.id.slice(c.id.length+1,-'.physical-activation-attempt'.length);
    witness(c.id,'missing physical activation window '+to,candidate=>{
      const index=candidate.raw.snapshots.findIndex(s=>s.name===to),from=candidate.raw.snapshots[index-1].sequence,end=candidate.raw.snapshots[index].sequence;
      for(const row of candidate.raw.log)if(row.type==='input'&&row.event==='click'&&row.sequence>from&&row.sequence<end)row.trusted=false;
    });
  }

  // Every intended call's actual completion must be retained even when the
  // component emits an incorrect optimistic action. Removing an observer row
  // becomes an integrity error rather than another accepted desired failure.
  for(const c of report.checks)for(const settlement of c.raw.log.filter(row=>row.type==='clipboard-settle'))witness(c.id,'omitted intended settlement '+settlement.call,candidate=>{
    const row=candidate.raw.log.find(row=>row.sequence===settlement.sequence),sequence=row.sequence,time=row.time;
    for(const key of Object.keys(row))delete row[key];Object.assign(row,{sequence,time,type:'mode',value:'success'});
  });

  // Bounded independent-review probes are retained here as source-owned
  // regression cases. Behavioral corruptions may remain valid desired red;
  // stale green and missing prerequisites may never be accepted.
  let behavioralProbes=0;
  const behavior=(label,change,expectedFailures,{integrity=false}={})=>{
    const candidate=clone(green);change(candidate);
    assert.throws(()=>verifyCopyEvidence(candidate,trusted,0),undefined,label+' stale green rejected');rejected++;
    rederive(candidate);
    if(integrity){assert.throws(()=>verifyCopyEvidence(candidate,trusted,candidate.status==='passed'?0:1),undefined,label+' integrity rejected');rejected++;}
    else {const observed=verifyCopyEvidence(candidate,trusted,1);assert.equal(observed.status,'failed',label+' remains desired red');for(const id of expectedFailures)assert(observed.failedAssertions.includes(id),label+' observable failure '+id);}
    behavioralProbes++;
  };
  behavior('unexpected raw error',r=>check(r,'activation-pointer').raw.errors.push('unrelated page failure'),[],{integrity:true});
  behavior('paused check animation',r=>{for(const c of r.checks)for(const snapshot of c.raw.snapshots)for(const root of Object.values(snapshot.roots))for(const button of root.controls)for(const icon of button.icons)for(const animation of icon.animations)animation.playState='paused';},['appearance-light.copied.motion-runs','appearance-dark.copied.motion-runs']);
  behavior('resolution after copied deadline',r=>{check(r,'exact-timing').raw.log.find(row=>row.type==='clipboard-settle'&&row.outcome==='resolve').time+=100000;},[],{integrity:true});
  behavior('failure change identity and payload',r=>{for(const id of ['failure-reject','failure-throw','failure-missing']){const event=check(r,id).raw.log.find(row=>row.type==='event'&&row.event==='ely:change'&&row.detail.copied===false);event.detail.id='foreign';event.detail.name='foreign';event.detail.value='wrong payload';}},['failure-reject.one-failure-change','failure-throw.one-failure-change','failure-missing.one-failure-change']);
  behavior('disabled attempts target enabled peer',r=>{const raw=check(r,'disabled').raw,peer=raw.snapshots[0].roots['#copy-b'];for(const event of raw.log.filter(row=>row.type==='input'&&row.event==='click'&&!row.trusted)){event.target=event.control=peer.controls[0].token;event.root=peer.token;event.rootID=peer.id;event.targetID=peer.controls[0].id;}},[],{integrity:true});
  behavior('successful copy also emits failure',r=>{
    const raw=check(r,'activation-pointer').raw,snapshot=raw.snapshots.find(s=>s.name==='copied'),insert=snapshot.sequence;
    const extra=clone(raw.log.find(row=>row.type==='event'&&row.event==='ely:change'&&row.detail.copied===true));extra.sequence=insert;extra.detail.copied=false;extra.detail.error='clipboard-unavailable';
    for(const row of raw.log){if(row.sequence>=insert)row.sequence++;if(row.input>=insert)row.input++;if(row.call>=insert)row.call++;}
    for(const s of raw.snapshots)if(s.sequence>=insert)s.sequence++;raw.log.splice(insert-1,0,extra);
  },['activation-pointer.copied.one-change']);
  behavior('unnamed tested control with misleading peer aria',r=>{for(const id of ['appearance-light','appearance-dark','missing-icon'])for(const snapshot of check(r,id).raw.snapshots){const button=snapshot.roots['#copy-a'].controls[0];button.ariaLabel=null;button.text='';}},['appearance-light.default-type-and-name','appearance-dark.default-type-and-name','missing-icon.fallback-accessible-name']);

  const finishedAnimation=clone(green);addSyntheticAnimationStart(finishedAnimation);rederive(finishedAnimation);
  assert.equal(verifyCopyEvidence(finishedAnimation,trusted,0).status,'passed','historical CSS start survives an empty post-font-wait animation snapshot');
  let animationWitnessProbes=0;
  for(const [label,change] of [
    ['wrong control',row=>{row.control++;}],['wrong root',row=>{row.root++;}],
    ['wrong call',row=>{row.call=0;}],['paused start',row=>{row.animations[0].playState='paused';}],
    ['missing start',row=>{const sequence=row.sequence,time=row.time;for(const key of Object.keys(row))delete row[key];Object.assign(row,{sequence,time,type:'mode',value:'success'});}],
  ]) {
    const candidate=clone(finishedAnimation),row=check(candidate,'appearance-light').raw.log.find(row=>row.type==='animation');change(row);
    assert.throws(()=>verifyCopyEvidence(candidate,trusted,0),undefined,'animation witness '+label+' cannot retain stale green');rejected++;
    rederive(candidate);assert.equal(candidate.status,'failed','animation witness '+label+' cannot rederive green');
    const result=verifyCopyEvidence(candidate,trusted,1);assert.equal(result.status,'failed');
    assert(result.failedAssertions.some(id=>id.startsWith('appearance-light.copied.')&&/rotation-animation|motion-runs/.test(id)),'animation witness '+label+' must fail the intended observable');
    animationWitnessProbes++;
  }

  const replayWitness=clone(green);addSyntheticAnimationStart(replayWitness,{id:'exact-timing',fontDelay:0});rederive(replayWitness);
  assert.equal(verifyCopyEvidence(replayWitness,trusted,0).status,'passed','first-cycle start with a normal replay snapshot is valid');
  const replayRaw=check(replayWitness,'exact-timing').raw,replaySnapshot=replayRaw.snapshots.find(s=>s.name==='replayed');
  const replayCall=replayRaw.log.findLast(row=>row.type==='clipboard-call'&&row.sequence<replaySnapshot.sequence);
  const replayStart=replayRaw.log.find(row=>row.type==='animation'&&row.call===replayCall.sequence),sequence=replayStart.sequence,time=replayStart.time;
  for(const key of Object.keys(replayStart))delete replayStart[key];Object.assign(replayStart,{sequence,time,type:'mode',value:'success'});
  const staleAnimation=replaySnapshot.roots['#copy-a'].controls[0].icons.find(icon=>icon.name==='check').animations[0];
  staleAnimation.playState='finished';staleAnimation.currentTime=120;
  assert.throws(()=>verifyCopyEvidence(replayWitness,trusted,0),undefined,'first-cycle start cannot retain replay green');rejected++;
  rederive(replayWitness);const replayFailure=verifyCopyEvidence(replayWitness,trusted,1);
  assert(replayFailure.failedAssertions.includes('exact-timing.replayed.rotation-animation'),'first-cycle start cannot prove a fresh replay animation');animationWitnessProbes++;
  addSyntheticAnimationStart(replayWitness,{id:'exact-timing',name:'replayed',fontDelay:0});rederive(replayWitness);
  assert.equal(verifyCopyEvidence(replayWitness,trusted,0).status,'passed','correct second-cycle start independently proves replay');
  const animationCheck=check(finishedAnimation,'appearance-light'),startRow=animationCheck.raw.log.find(row=>row.type==='animation');
  for(const key of [...Object.keys(startRow),'unexpected']) {
    const candidate=clone(animationCheck),row=candidate.raw.log.find(row=>row.type==='animation');
    if(key==='unexpected')row.unexpected=true;else delete row[key];
    assert.throws(()=>validateCopyRaw(candidate),undefined,'exact animation row field '+key);rejected++;
  }

  const captured=processFixture(fixture);assert.equal(verifyProcessEvidence(captured,trusted).status,'failed');
  const greenCaptured=processFixture({report:green,trusted});assert.equal(verifyProcessEvidence(greenCaptured,trusted).status,'passed','synthetic green process exit zero');
  assert.throws(()=>verifyProcessEvidence({...greenCaptured,exit:{...greenCaptured.exit,status:1}},trusted),undefined,'green process cannot claim exit one');rejected++;
  const rejectProcess=(label,mutate)=>{const evidence={reportBytes:Buffer.from(captured.reportBytes),stdout:Buffer.from(captured.stdout),stderr:Buffer.from(captured.stderr),exit:clone(captured.exit)};mutate(evidence);assert.throws(()=>verifyProcessEvidence(evidence,trusted),undefined,label);rejected++;};
  rejectProcess('missing actual completion',e=>{e.stdout='';});
  rejectProcess('stale completion token',e=>{const completion=JSON.parse(Buffer.from(e.stdout).toString());completion.runToken='00000000-0000-4000-8000-000000000002';e.stdout=JSON.stringify(completion)+'\n';});
  rejectProcess('stale completion report hash',e=>{const completion=JSON.parse(Buffer.from(e.stdout).toString());completion.reportSHA256=copySHA('stale');e.stdout=JSON.stringify(completion)+'\n';});
  rejectProcess('stale completion status',e=>{const completion=JSON.parse(Buffer.from(e.stdout).toString());completion.status='passed';e.stdout=JSON.stringify(completion)+'\n';});
  rejectProcess('duplicate actual completion',e=>{e.stdout=Buffer.from(e.stdout).toString().repeat(2);});
  rejectProcess('trailing completion output',e=>{e.stdout=Buffer.from(e.stdout).toString()+'unrelated\n';});
  rejectProcess('malformed completion',e=>{e.stdout='{"copybuttonCompletion":\n';});
  rejectProcess('changed saved report bytes',e=>{e.reportBytes=Buffer.from(e.reportBytes).toString()+'\n';});
  rejectProcess('process diagnostics',e=>{e.stderr='unrelated failure\n';});
  rejectProcess('incorrect actual exit',e=>{e.exit.status=0;});
  rejectProcess('stale actual exit token',e=>{e.exit.runToken='00000000-0000-4000-8000-000000000002';});
  rejectProcess('spawn error',e=>{e.exit.error='spawn failed';});
  rejectProcess('terminated process',e=>{e.exit.signal='SIGTERM';});
  rejectProcess('truncated capture',e=>{e.exit.truncated=true;});
  rejectProcess('stale actual exit revision',e=>{e.exit.revision='f'.repeat(40);});
  rejectProcess('stale actual exit tree',e=>{e.exit.tree='f'.repeat(40);});
  rejectProcess('invalid stdout UTF-8',e=>{e.stdout=Buffer.from([0xff]);});
  rejectProcess('invalid report UTF-8',e=>{e.reportBytes=Buffer.from([0xff]);});
  rejectProcess('completion without final newline',e=>{e.stdout=Buffer.from(e.stdout).toString().trimEnd();});
  rejectProcess('foreign completion field',e=>{const completion=JSON.parse(Buffer.from(e.stdout).toString());completion.unexpected=true;e.stdout=JSON.stringify(completion)+'\n';});
  rejectProcess('nonzero abnormal status',e=>{e.exit.status=2;});
  rejectProcess('foreign exit field',e=>{e.exit.unexpected=true;});
  for(const key of Object.keys(captured.exit))rejectProcess('missing actual exit '+key,e=>{delete e.exit[key];});
  const screenshots=await testCopyScreenshotEvidence(report);
  return {sourceOnly,classification:fixture.classification,cases:accepted.cases,assertions:accepted.assertions,syntheticDesiredStatus:accepted.status,syntheticGreenStatus:'passed',behavioralProbes,animationWitnessProbes,screenshotByteChecks:screenshots.screenshots,screenshotCorruptions:screenshots.rejectedCorruptions,rejectedCorruptions:rejected+screenshots.rejectedCorruptions};
}

// A fixed 1×1 transparent PNG is an in-memory schema input, never a browser
// capture. No PNG or report files are written by these byte-verification tests.
export async function testCopyScreenshotEvidence(schemaReport=buildCopySchemaFixture().report) {
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJZkAAAAASUVORK5CYII=','base64');
  const report={checks:schemaReport.checks.map(check=>({id:check.id,raw:{screenshots:clone(check.raw.screenshots)}}))},bodies=new Map();
  const expected=copyCases.flatMap(spec=>spec.checkpoints.map(checkpoint=>`screenshots/${spec.id}-${checkpoint}.png`));
  for(const check of report.checks)for(const receipt of Object.values(check.raw.screenshots)){receipt.bytes=png.length;receipt.sha256=copySHA(png);bodies.set(receipt.path,Buffer.from(png));}
  const readPaths=[];
  const positive=await verifyCopyScreenshots(report,async path=>{readPaths.push(path);assert(bodies.has(path),'only source-owned PNG paths may be read');return bodies.get(path);});
  assert.deepEqual(readPaths,expected,'each exact checkpoint PNG read once in source order');assert.equal(positive.screenshots,expected.length);assert.match(positive.digestSHA256,/^[a-f0-9]{64}$/);
  let rejected=0;
  const corrupt=async(label,change)=>{
    const candidate=clone(report),files=new Map([...bodies].map(([path,bytes])=>[path,Buffer.from(bytes)]));change(candidate,files);
    await assert.rejects(()=>verifyCopyScreenshots(candidate,async path=>{if(!files.has(path))throw new Error('Synthetic missing PNG '+path);return files.get(path);}),undefined,label);rejected++;
  };
  const first=expected[0],receipt=r=>r.checks[0].raw.screenshots.idle;
  const replaceAndRehash=(r,files,bytes)=>{files.set(first,bytes);receipt(r).bytes=bytes.length;receipt(r).sha256=copySHA(bytes);};
  await corrupt('missing actual PNG',(r,files)=>files.delete(first));
  await corrupt('truncated PNG signature',(r,files)=>replaceAndRehash(r,files,png.subarray(0,16)));
  await corrupt('truncated PNG body despite original receipt',(r,files)=>files.set(first,png.subarray(0,32)));
  await corrupt('wrong actual PNG hash',(r,files)=>{const changed=Buffer.from(png);changed[changed.length-1]^=1;files.set(first,changed);});
  await corrupt('wrong PNG receipt hash',r=>{receipt(r).sha256=copySHA('wrong PNG');});
  await corrupt('wrong PNG receipt length',r=>{receipt(r).bytes++;});
  await corrupt('invalid PNG signature with matching receipt',(r,files)=>{const changed=Buffer.from(png);changed[0]=0;replaceAndRehash(r,files,changed);});
  await corrupt('invalid IHDR with matching receipt',(r,files)=>{const changed=Buffer.from(png);changed.write('WRNG',12,'ascii');replaceAndRehash(r,files,changed);});
  await corrupt('zero PNG width with matching receipt',(r,files)=>{const changed=Buffer.from(png);changed.writeUInt32BE(0,16);replaceAndRehash(r,files,changed);});
  await corrupt('zero PNG height with matching receipt',(r,files)=>{const changed=Buffer.from(png);changed.writeUInt32BE(0,20);replaceAndRehash(r,files,changed);});
  await corrupt('nonbinary PNG reader',(r,files)=>files.set(first,new Uint8Array(png)));
  await corrupt('foreign screenshot path',r=>{receipt(r).path='../foreign.png';});
  await corrupt('missing screenshot receipt',r=>{delete r.checks[0].raw.screenshots.idle;});
  await corrupt('extra screenshot receipt',r=>{r.checks[0].raw.screenshots.foreign=clone(receipt(r));});
  await corrupt('missing screenshot case',r=>r.checks.pop());
  await corrupt('duplicate screenshot case',r=>{r.checks[1]=clone(r.checks[0]);});
  await corrupt('reordered screenshot cases',r=>{[r.checks[0],r.checks[1]]=[r.checks[1],r.checks[0]];});
  return {sourceOnly,classification:'synthetic PNG bytes only; no browser screenshots',screenshots:positive.screenshots,rejectedCorruptions:rejected};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){console.log(JSON.stringify(await testCopyTransitions()));console.log(JSON.stringify(await testCopySchemaEvidence()));}
