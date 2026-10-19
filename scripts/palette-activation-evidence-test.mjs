// Synthetic desired/red traces and adversarial replay only. No browser/server.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildPaletteSchemaFixture} from './palette-query-evidence-test.mjs';
import {paletteSourcePaths,paletteErrors,paletteTyping,paletteOptionalBrowserPaths} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';
import {activationSourcePaths} from '../ui/gohtmx/tests/browser/palette-activation-inputs.mjs';
import {activationCases,activationClassification,activationOracles,activationBrowserPaths,verifyActivationEvidence} from '../ui/gohtmx/tests/browser/palette-activation-evidence.mjs';
const clone=structuredClone,sha=value=>createHash('sha256').update(value).digest('hex');
const owner=(surface,slot='primary')=>surface==='sdui'?'sdui-internal-'+sha(`palette-${slot}-screen\0palette-${slot}-component`):`palette-${slot}-component`;
const meta=path=>({sourceSHA256:sha(path),servedSHA256:sha(path),bytes:Buffer.byteLength(path)});
const primary=[['Open','open-file','open-command',false],['Option','option-file','option-command',false],['Other place','other-place','other-command',false],['Open disabled','disabled-open','disabled-command',true],['Zebra','zebra-file','zebra-command',false]];
const peerValues=['peer-open','peer-option','peer-other','peer-disabled','peer-zebra'];
const original={handlers:100,action:101,change:102,dispose:103},replacement={handlers:110,action:111,change:112,dispose:113};
const n=(token,id,tag,value=null)=>({token,id,tag,value,connected:true});
const nodeOnly=node=>Object.fromEntries(['token','id','tag','value','connected'].map(k=>[k,node[k]]));
function state(surface,name){const id=owner(surface),peer=owner(surface,'peer'),empty=name==='empty.initial',disabled=name==='empty.disabled';return {
 owner:n(1,id,'SECTION'),component:'navigation/CommandPalette',ready:'true',binding:null,query:n(2,id+'-palette-query','INPUT',''),form:n(7,'','FORM'),formAction:'run',queryName:'cmdQuery',caret:[0,0],dialog:n(3,id+'-palette','DIALOG'),open:false,opener:n(4,'','BUTTON',''),list:n(5,id+'-palette-results','UL'),activeID:empty||disabled?null:id+'-palette-option-0',controls:id+'-palette-results',focus:n(90,'','BODY'),outside:n(6,'palette-peer-field','INPUT','peer unchanged'),
 rows:empty?[]:primary.map(([label,value,action,off],i)=>({...n(10+i,id+'-palette-option-'+i,'BUTTON',value),label,action,disabled:disabled||off,hidden:false,selected:!disabled&&i===0?'true':'false',role:'option'})),
 peer:{owner:n(30,peer,'SECTION'),open:false,query:'',rows:primary.map(([label,value,action,off],i)=>({...n(40+i,peer+'-palette-option-'+i,'BUTTON',peerValues[i]),label,action,disabled:off,hidden:false,selected:i===0?'true':'false',role:'option'}))},
 };}
const payload=(surface,run,query)=>({id:owner(surface),component:'navigation/CommandPalette',action:run?'run':'option-command',value:run?null:'option-file',hasValue:!run,formDataKind:run?'FormData':'null',formData:run?[['cmdQuery',query]]:null,valuesKind:'array',values:run?[['cmdQuery',query]]:[],submitter:run?'':null});
const baseLog=()=>Object.fromEntries(['inputs','actions','changes','hosts','hostChanges','results','closes','lifecycle','bridge','errors','timeline'].map(k=>[k,[]]));
function buildCheck(surface,name,red){
 const check={name,raw:{}},s=state(surface,name),log=[],base=baseLog();let stage='setup',eventID=200;
 const b=(kind,value)=>{base[kind].push(clone(value));base.timeline.push({sequence:base.timeline.length+1,kind,index:base[kind].length-1});};
 const e=(type,detail={})=>{const event={sequence:log.length+1,type,stage,...clone(detail),state:clone(s)};log.push(event);return event;};
 const snap=key=>check.raw[key]={state:clone(s),log:clone(log),baseTrace:clone(base)};
 const bind=label=>{const previous=clone(s.binding);s.binding=clone(label==='original'?original:replacement);e('binding-installed',{label,previous,current:s.binding});};
 const native=(type,target,key=null,more={})=>{const event=e(type,{eventToken:eventID++,trusted:true,target:nodeOnly(target),path:[target.token,1],defaultPrevented:false,key,code:key==='Enter'?'Enter':null,keyCode:key==='Enter'?13:null,button:type.startsWith('pointer')||['click','click-boundary'].includes(type)?0:null,pointerType:type.startsWith('pointer')||['click','click-boundary'].includes(type)?'mouse':null,ctrl:false,alt:false,shift:false,meta:false,composing:false,...more});if(['keydown','keyup'].includes(type))b('inputs',{type,key,code:event.code,trusted:true,targetTag:target.tag,field:target.token===s.query.token,ownerID:owner(surface),value:target.value,connected:true,ctrl:false,alt:false,shift:false,meta:false});return event;};
 const selection=()=>{s.rows.forEach((row,i)=>row.selected=i===1?'true':'false');s.activeID=s.rows[1].id;};
 const change=()=>{const detail={id:owner(surface),component:'navigation/CommandPalette',name:'palette',value:'option-file',selected:true};if(s.binding)e('host-change',{label:s.binding.handlers===100?'original':'replacement',handlerToken:s.binding.change,detail});e('change',{detail});b('changes',{...detail,slot:'primary',type:null});};
 const request=(run,query)=>{if(surface!=='sdui')return;const requestId=`synthetic-${name}-${stage}-${log.length}`,fields=Object.entries({_action:run?'query-observed':'command-observed',_csrf:'palette-query-fixture',_request:requestId,_target:'palette-primary-result',commandAction:run?'run':'option-command',ownerID:owner(surface),component:'navigation/CommandPalette',...(run?{cmdQuery:query}:{commandValue:'option-file'})});e('request-start',{path:'/sdui-action',method:'POST',fields});e('bridge-success',{action:run?'query-observed':'command-observed',target:'palette-primary-result',status:200,requestId});b('bridge',{action:run?'query-observed':'command-observed',target:'palette-primary-result',status:200,connected:true});};
 const action=(run=false,query='',callback=false,result=true)=>{
  const p=payload(surface,run,query);e('direct-action',{eventToken:eventID++,target:s.owner,payload:p});
  if(s.binding){const label=s.binding.handlers===100?'original':'replacement';e('host',{label,handlerToken:s.binding.action,payload:p});
   if(callback&&name==='callback.reopen'){s.open=true;s.focus=clone(s.query);e('callback-reopen');}
   if(callback&&name==='callback.peer-focus'){s.focus=clone(s.outside);e('callback-peer-focus');}
   if(result){e('result',{payload:p,result:{binding:label,owner:owner(surface)}});b('results',{...p,slot:'primary',result:{binding:label,owner:owner(surface)}});}
  }
  b('actions',{...p,slot:'primary',phase:run?'keydown':null,state:{id:owner(surface),component:'navigation/CommandPalette',ready:'true'}});request(run,query);
 };
 e('initial-unbound');if(name!=='owner.close-bind-absent')bind('original');snap('ready');s.open=true;s.focus=clone(s.query);snap('opened');
 const query=name==='empty.filtered'?'zzzzzz':'';
 if(query){s.query.value=query;s.caret=[query.length,query.length];s.focus=clone(s.query);s.rows.forEach(row=>{row.hidden=true;row.selected='false';});s.activeID=null;for(const input of paletteTyping(query))b('inputs',{...input,selectionStart:input.start,selectionEnd:input.end,trusted:true,ownerID:owner(surface),connected:true,ctrl:false,alt:false,shift:false,meta:false});}
 snap('before');stage='activation';e('armed');
 if(name.startsWith('empty.')){
  const down=native('keydown',s.query,'Enter');e('key-boundary',{...Object.fromEntries(Object.keys(down).filter(k=>!['sequence','type','stage','state'].includes(k)).map(k=>[k,down[k]])),defaultPrevented:!red});
  if(red){native('submit',n(7,'','FORM'));action(true,query);}
  snap('down');native('keyup',s.query,'Enter');snap('after');stage='explicit';e('requestSubmit-call',{api:'HTMLFormElement.requestSubmit'});
  const submit=native('submit',n(7,'','FORM'));action(true,query);e('submit-boundary',{...Object.fromEntries(Object.keys(submit).filter(k=>!['sequence','type','stage','state'].includes(k)).map(k=>[k,submit[k]])),defaultPrevented:true,formAction:'run',formToken:7,fields:[['cmdQuery',query]]});e('requestSubmit-return',{api:'HTMLFormElement.requestSubmit'});snap('explicit');
 }else{
  const row=s.rows[1];native('pointerdown',row);s.focus=nodeOnly(row);native('pointerup',row);const click=native('click',row);
  if(name.startsWith('owner.')){
   if(red)action(false,'',false,false);
   selection();s.open=false;s.focus=clone(s.opener);const focus=native('close-focus-before-bind',s.opener);bind('replacement');native('close-focus-after-bind',s.opener,null,{eventToken:focus.eventToken});native('click-boundary',row,null,{eventToken:click.eventToken});snap('after');
   stage='setup';e('stage');s.open=true;s.focus=clone(s.query);snap('freshBefore');stage='fresh';e('stage');native('pointerdown',row);native('pointerup',row);const freshClick=native('click',row);selection();s.open=false;s.focus=clone(s.opener);action();change();native('click-boundary',row,null,{eventToken:freshClick.eventToken});snap('fresh');
  }else{
   if(red){action(false,'',true);selection();change();s.open=false;s.focus=clone(s.opener);}
   else{selection();s.open=false;s.focus=clone(s.opener);action(false,'',true);if(name!=='callback.reopen')change();}
   native('click-boundary',row,null,{eventToken:click.eventToken});snap('after');
  }
 }
 check.finalTrace=clone(check.raw.fresh||check.raw.explicit||check.raw.after);return check;
}
function refresh(f){for(const c of f.report.checks){c.oracles=activationOracles(c,f.report.surface);c.status=c.oracles.every(o=>o.pass)?'passed':'failed';c.finalTrace=clone(c.raw.fresh||c.raw.explicit||c.raw.after);}f.report.status=f.report.checks.every(c=>c.status==='passed')?'passed':'failed';f.exit=f.report.status==='passed'?0:1;return f;}
export function buildActivationSchemaFixture(surface='go-qualified',red=false){
 const baseline=buildPaletteSchemaFixture(surface,'focus').trusted;
 const assets={...baseline.assets,'/activation-observer.js':{...meta('observer'),contentType:'text/javascript; charset=utf-8'}};for(const path of ['/assets/ely/fonts/Inter-Regular.ttf','/assets/ely/fonts/Inter-SemiBold.ttf'])assets[path]={...meta(path),contentType:'font/ttf'};
 const fixtures=Object.fromEntries(['/','/empty-initial','/empty-disabled',...(surface==='sdui'?['/sdui-response-primary','/sdui-response-peer']:[])].map(p=>[p,{...meta(p),html:sha(p)+'.html',renderer:surface}]));
 const report={suite:'palette-activation',classification:activationClassification,surface,stage:'checks',revision:baseline.revision,tree:baseline.tree,runToken:'synthetic-schema-only-not-browser-evidence',dirty:'',sourceFiles:baseline.sourceFiles,activationSourceFiles:Object.fromEntries(activationSourcePaths.map(path=>[path,sha(path)])),assets,fixtures,fixtureManifest:{...(surface==='sdui'?{sduiQueryBinding:false,sduiRunRoute:true,sduiSourceActions:['open-command','option-command','other-command','disabled-command','zebra-command','run']}:{}),activationBaselineCommit:'ee28495c7cd6581d49d53874e831c6cea40930a4',activationBaselineTree:'c2d6ed91c378f59070fde8d626df2748e9fd837c'},standaloneDependencyProof:baseline.standaloneDependencyProof,toolchain:baseline.toolchain,browserVersion:'synthetic-schema-only',caseInventory:activationCases,checks:activationCases.map(name=>buildCheck(surface,name,red)),requests:[],browserResponses:[],httpAssetProof:[],...Object.fromEntries(paletteErrors.map(k=>[k,[]]))};
 const entry=path=>assets[path]||fixtures[path],proof=(path,check)=>{const item=entry(path==='/sdui-action'?'/sdui-response-primary':path);return {path,...(check?{check}:{}),...(path==='/sdui-action'?{responseFixture:'/sdui-response-primary'}:{}),status:200,bytes:item.bytes,expectedSHA256:item.servedSHA256,receivedSHA256:item.servedSHA256};};
 const request=(path,check,fields)=>{const item=entry(path==='/sdui-action'?'/sdui-response-primary':path);return {path,check,method:fields?'POST':'GET',htmx:null,status:200,responseSHA256:item.servedSHA256,responseBytes:item.bytes,...(fields?{responseFixture:'/sdui-response-primary',fields,requestSHA256:sha(JSON.stringify(fields)),requestBytes:JSON.stringify(fields).length,contentType:'multipart/form-data; boundary=synthetic',idempotencyKey:Object.fromEntries(fields)._request}: {})};};
 for(const path of [...Object.keys(assets),...Object.keys(fixtures)]){report.httpAssetProof.push(proof(path));report.requests.push(request(path,null));}
 for(const c of report.checks){for(const path of [...activationBrowserPaths(surface,c.name),...paletteOptionalBrowserPaths]){report.browserResponses.push(proof(path,c.name));report.requests.push(request(path,c.name));}for(const start of c.finalTrace.log.filter(e=>e.type==='request-start')){report.browserResponses.push(proof('/sdui-action',c.name));report.requests.push(request('/sdui-action',c.name,start.fields));}}
 const trusted=clone(Object.fromEntries(['surface','revision','tree','runToken','sourceFiles','activationSourceFiles','assets','fixtures','fixtureManifest','standaloneDependencyProof','toolchain'].map(k=>[k,report[k]])));return refresh({report,trusted,exit:0});
}
function staleResultFixture(surface){
 const f=buildActivationSchemaFixture(surface,true),check=f.report.checks[1];
 for(const name of ['after','freshBefore','fresh']){
  const snapshot=check.raw[name],index=snapshot.log.findIndex(e=>e.type==='close-focus-after-bind'),host=snapshot.log.find(e=>e.type==='host');
  const result={sequence:0,type:'result',stage:'activation',payload:clone(host.payload),result:{binding:'original',owner:owner(surface)},state:clone(snapshot.log[index].state)};
  snapshot.log.splice(index+1,0,result);snapshot.log.forEach((e,i)=>e.sequence=i+1);
  snapshot.baseTrace.results.unshift({...clone(host.payload),slot:'primary',result:clone(result.result)});
  for(const entry of snapshot.baseTrace.timeline)if(entry.kind==='results')entry.index++;
  const insertion=snapshot.baseTrace.timeline.findIndex(e=>e.kind==='results'||e.kind==='actions'&&e.index===1);
  snapshot.baseTrace.timeline.splice(insertion<0?snapshot.baseTrace.timeline.length:insertion,0,{sequence:0,kind:'results',index:0});snapshot.baseTrace.timeline.forEach((e,i)=>e.sequence=i+1);
 }
 return refresh(f);
}
export function runActivationSchemaTests(){
 let desired=0,red=0,semanticRed=0,rejected=0;
 for(const surface of ['go-qualified','go-chapter','sdui']){
  const f=buildActivationSchemaFixture(surface);assert.deepEqual(f.report.checks.flatMap(c=>c.oracles.filter(o=>!o.pass).map(o=>c.name+'/'+o.id)),[]);assert.equal(verifyActivationEvidence(f.report,f.trusted,0).status,'passed');desired++;
  const bad=buildActivationSchemaFixture(surface,true);assert.equal(bad.exit,1);assert.equal(verifyActivationEvidence(bad.report,bad.trusted,1).status,'failed');red++;
  const stale=staleResultFixture(surface);assert.equal(verifyActivationEvidence(stale.report,stale.trusted,1).status,'failed');assert(stale.report.checks[1].oracles.some(o=>o.id==='safety.results-current-binding'&&!o.pass&&!o.prerequisite));semanticRed++;
  const missingHost=buildActivationSchemaFixture(surface);for(const snapshot of Object.values(missingHost.report.checks[0].raw)){snapshot.log=snapshot.log.filter(e=>e.type!=='host-change');snapshot.log.forEach((e,i)=>e.sequence=i+1);}refresh(missingHost);assert.equal(verifyActivationEvidence(missingHost.report,missingHost.trusted,1).status,'failed');assert(missingHost.report.checks[0].oracles.some(o=>o.id==='activation.one-host-palette-change'&&!o.pass&&!o.prerequisite));semanticRed++;
  if(surface!=='sdui'){
   const extra=buildActivationSchemaFixture(surface),c=extra.report.checks[1],seed=c.raw.fresh.log.filter(e=>['direct-action','host','result'].includes(e.type));
   for(const name of ['freshBefore','fresh']){
    const snapshot=c.raw[name],at=snapshot.log.findIndex(e=>e.type==='stage'&&e.stage==='setup');const state=clone(c.raw.freshBefore.state);
    const injected=seed.map(event=>({...clone(event),stage:'setup',state:clone(state),...(event.type==='direct-action'?{eventToken:900001}:{})}));snapshot.log.splice(at+1,0,...injected);snapshot.log.forEach((e,i)=>e.sequence=i+1);
    const payload=clone(seed[0].payload);snapshot.baseTrace.actions.unshift({...payload,slot:'primary',state:{id:owner(surface),component:'navigation/CommandPalette',ready:'true'}});snapshot.baseTrace.results.unshift({...payload,slot:'primary',result:{binding:'replacement',owner:owner(surface)}});
    for(const entry of snapshot.baseTrace.timeline)if(['actions','results'].includes(entry.kind))entry.index++;
    snapshot.baseTrace.timeline.unshift({sequence:0,kind:'actions',index:0},{sequence:0,kind:'results',index:0});snapshot.baseTrace.timeline.forEach((e,i)=>e.sequence=i+1);
   }
   refresh(extra);assert.equal(verifyActivationEvidence(extra.report,extra.trusted,1).status,'failed');assert(extra.report.checks[1].oracles.some(o=>o.id==='safety.no-setup-activation'&&!o.pass&&!o.prerequisite));semanticRed++;
  }
  for(const mutation of ['host-selection-before-action','host-selection-while-open']){
   const semantic=buildActivationSchemaFixture(surface),snapshot=semantic.report.checks[0].raw.after;
   const index=snapshot.log.findIndex(e=>e.type==='host-change'&&e.detail.name==='palette');
   if(mutation==='host-selection-before-action'){const [event]=snapshot.log.splice(index,1);snapshot.log.splice(snapshot.log.findIndex(e=>e.type==='direct-action'),0,event);snapshot.log.forEach((e,i)=>e.sequence=i+1);}
   else snapshot.log[index].state.open=true;
   refresh(semantic);assert.equal(verifyActivationEvidence(semantic.report,semantic.trusted,1).status,'failed');assert(semantic.report.checks[0].oracles.some(o=>!o.pass&&!o.prerequisite));semanticRed++;
  }
  const reject=(label,mutate,recompute=false,fixture=f)=>{const copy=clone(fixture);assert.throws(()=>{mutate(copy.report);if(recompute)refresh(copy);verifyActivationEvidence(copy.report,copy.trusted,copy.exit);},undefined,label);rejected++;};
  for(const [label,mutate]of [
   ['wrong revision',r=>r.revision='a'.repeat(40)],['extra case',r=>r.checks.push(clone(r.checks[0]))],['missing case',r=>r.checks.pop()],['wrong exit/status',r=>r.status='failed'],['forged oracle',r=>r.checks[0].oracles[0].pass=false],
   ['missing source',r=>delete r.activationSourceFiles[activationSourcePaths[0]]],['unknown source',r=>r.activationSourceFiles['unknown']=sha('x')],['asset bytes',r=>r.assets['/activation-observer.js'].bytes++],['served hash',r=>r.browserResponses[0].receivedSHA256=sha('wrong')],['foreign response case',r=>r.browserResponses.push({...clone(r.browserResponses[0]),check:'foreign'})],['null response case',r=>r.browserResponses.push({...clone(r.browserResponses[0]),check:null})],['missing browser path',r=>r.browserResponses.pop()],['duplicate request',r=>r.requests.push(clone(r.requests.at(-1)))],['extra raw key',r=>r.checks[0].raw.unknown={}],
   ...paletteErrors.map(k=>[k,r=>r[k].push('failure')]),
  ])reject(label,mutate);
  const all=(r,index,fn)=>{const c=r.checks[index];for(const s of Object.values(c.raw))for(const e of s.log)fn(e);};
  for(const [label,mutate]of [
   ['untrusted pointer',r=>all(r,0,e=>{if(e.type==='click')e.trusted=false;})],
   ['wrong pointer owner path',r=>all(r,0,e=>{if(e.type==='click')e.path=[999];})],
   ['pointer payload corruption',r=>all(r,0,e=>{if(e.type==='direct-action')e.payload.value='wrong';})],
   ['legacy composition keyCode',r=>all(r,5,e=>{if(['keydown','keyup','key-boundary'].includes(e.type))e.keyCode=229;})],['function DOM alias',r=>all(r,0,e=>{if(e.state.binding)e.state.binding.handlers=1;if(e.type==='binding-installed')e.current.handlers=1;})],['wrong document owner',r=>{r.checks[0].raw.after.baseTrace.actions[0].state.id='wrong';}],['wrong document slot',r=>{r.checks[0].raw.after.baseTrace.actions[0].slot='peer';}],['peer state mutated',r=>{for(const s of Object.values(r.checks[0].raw))s.state.peer.rows[0].hidden=true;}],['foreign host handler',r=>all(r,0,e=>{if(e.type==='host')e.handlerToken=999;})],
   ['binding identity conflated',r=>all(r,1,e=>{if(e.type==='binding-installed'&&e.label==='replacement')e.current=clone(original);})],
   ['absent owner invented',r=>all(r,2,e=>{if(e.type==='initial-unbound')e.state.binding=clone(original);})],
   ['lost source row',r=>{for(const s of Object.values(r.checks[0].raw))s.state.rows[1].value='wrong';}],
   ['wrong unmodified Enter',r=>all(r,5,e=>{if(e.type==='keydown')e.ctrl=true;})],
   ['untrusted fresh pointer',r=>all(r,1,e=>{if(e.type==='pointerup'&&e.stage==='fresh')e.trusted=false;})],
   ['untrusted Enter',r=>all(r,5,e=>{if(e.type==='keyup')e.trusted=false;})],
   ['immutable boundary modifier drift',r=>all(r,5,e=>{if(e.type==='key-boundary')e.shift=true;})],['missing synchronous click boundary',r=>{const c=r.checks[1];for(const snapshot of Object.values(c.raw)){snapshot.log=snapshot.log.filter(e=>!(e.type==='click-boundary'&&e.stage==='activation'));snapshot.log.forEach((e,i)=>e.sequence=i+1);}}],['invented click-return identity',r=>all(r,1,e=>{if(e.type==='click-boundary'&&e.stage==='activation')e.eventToken=456789;})],['key-boundary token drift',r=>all(r,5,e=>{if(e.type==='key-boundary')e.eventToken=999;})],
   ['dropped explicit API call',r=>all(r,5,e=>{if(e.type==='requestSubmit-call')e.api='click';})],
   ['independent document action lost',r=>{r.checks[0].raw.after.baseTrace.actions=[];r.checks[0].raw.after.baseTrace.timeline=r.checks[0].raw.after.baseTrace.timeline.filter(e=>e.kind!=='actions').map((e,i)=>({...e,sequence:i+1}));}],
  ])reject(label,mutate,true);

  // Exact accepted-green attacks demonstrated by independent offline review.
  const logs=(r,i,fn)=>{for(const s of Object.values(r.checks[i].raw))for(const e of s.log)fn(e);};
  const states=(r,i,fn)=>{for(const s of Object.values(r.checks[i].raw)){fn(s.state);for(const e of s.log)fn(e.state);}};
  const attack=(name,mutate,targetSurface='go-qualified')=>{if(surface===targetSurface)reject('independent/'+name,mutate,true);};
attack('foreign-browser-response',r=>r.browserResponses.push({...clone(r.browserResponses[0]),check:'foreign.case'}));
attack('direct-action-foreign-target',r=>logs(r,0,e=>{if(e.type==='direct-action')e.target=clone(e.state.peer.owner);}));
attack('independent-observer-foreign-slot',r=>{for(const s of Object.values(r.checks[0].raw))for(const e of [...s.baseTrace.actions,...s.baseTrace.results])e.slot='peer';});
attack('peer-selection-mutation',r=>states(r,0,s=>{s.peer.rows[0].selected='false';s.peer.rows[1].selected='true';}));
attack('disconnected-owner',r=>{states(r,0,s=>s.owner.connected=false);logs(r,0,e=>{if(e.type==='direct-action')e.target.connected=false;});});
attack('foreign-host-label',r=>{logs(r,0,e=>{if(e.type==='host')e.label='foreign';if(e.type==='result')e.result.binding='foreign';});for(const s of Object.values(r.checks[0].raw))for(const e of s.baseTrace.results)e.result.binding='foreign';});
attack('native-keycode229',r=>logs(r,5,e=>{if(['keydown','keyup','key-boundary'].includes(e.type))e.keyCode=229;}));
attack('pointer-events-reordered',r=>{const c=r.checks[0],f=c.raw.after.log;const a=f.findIndex(e=>e.stage==='activation'&&e.type==='pointerdown'),b=f.findIndex(e=>e.stage==='activation'&&e.type==='pointerup');[f[a],f[b]]=[f[b],f[a]];f.forEach((e,i)=>e.sequence=i+1);for(const s of Object.values(c.raw))s.log=clone(f.slice(0,s.log.length));});
attack('foreign-stage-extra-action',r=>{const c=r.checks[0],s=c.raw.after;const extra=s.log.filter(e=>['direct-action','host','result'].includes(e.type));for(const e of extra)s.log.push({...clone(e),sequence:s.log.length+1,stage:'fresh',...(e.type==='direct-action'?{eventToken:9001}:{})});for(const kind of ['actions','results']){const old=clone(s.baseTrace[kind][0]);s.baseTrace[kind].push(old);s.baseTrace.timeline.push({sequence:s.baseTrace.timeline.length+1,kind,index:s.baseTrace[kind].length-1});}});
attack('idempotency-header-foreign',r=>{for(const p of r.requests)if(p.method==='POST')p.idempotencyKey='foreign';},'sdui');
attack('request-missing-wire-proof',r=>{for(const p of r.requests)if(p.method==='POST'){delete p.contentType;delete p.requestSHA256;delete p.requestBytes;}},'sdui');
attack('binding-and-node-token-collision',r=>{const swap=b=>{if(b?.handlers===100)b.handlers=1};states(r,0,s=>swap(s.binding));logs(r,0,e=>{if(e.type==='binding-installed'){swap(e.current);swap(e.previous);}});});
attack('primary-row-identity-drift',r=>{const c=r.checks[0];for(const snap of Object.values(c.raw)){snap.state.rows[2].token=999;for(const e of snap.log)e.state.rows[2].token=999;}c.raw.ready.state.rows[2].token=12;});
attack('foreign-snapshot-binding',r=>{r.checks[0].raw.ready.state.binding=null;});
attack('success-before-request-start',r=>{const c=r.checks[0],f=c.raw.after.log;const a=f.findIndex(e=>e.type==='request-start'),b=f.findIndex(e=>e.type==='bridge-success');[f[a],f[b]]=[f[b],f[a]];f.forEach((e,i)=>e.sequence=i+1);for(const s of Object.values(c.raw))s.log=clone(f.slice(0,s.log.length));},'sdui');
attack('borrowed-native-event-identity',r=>logs(r,0,e=>{if(['pointerdown','pointerup','click'].includes(e.type))e.eventToken=9999;}));
  reject('baseline red cannot become green',r=>{r.status='passed';r.checks.forEach(c=>{c.status='passed';c.oracles.forEach(o=>o.pass=true);});},false,bad);
  assert.throws(()=>verifyActivationEvidence(bad.report,bad.trusted,0));rejected++;
  if(surface==='sdui')for(const [label,mutate]of [
   ['missing explicit positive POST',r=>{r.requests=r.requests.filter(p=>!(p.check==='empty.initial'&&p.method==='POST'));}],
   ['wrong HTTP owner',r=>{r.requests.find(p=>p.method==='POST').fields.find(([k])=>k==='ownerID')[1]='wrong';}],
   ['wrong run route',r=>{r.requests.find(p=>p.check==='empty.initial'&&p.method==='POST').fields.find(([k])=>k==='_action')[1]='wrong';}],
   ['extra packet field',r=>{r.requests.find(p=>p.method==='POST').fields.push(['extra','wrong']);}],
   ['wrong bridge request ID',r=>all(r,0,e=>{if(e.type==='bridge-success')e.requestId='wrong';})],
  ])reject(label,mutate,true);
 }
 runActivationObservedStructureTests();
 console.log(`Activation synthetic evidence: ${desired} desired, ${red} baseline red, ${semanticRed} semantic safety/count red, ${rejected} corruptions rejected. No browser verification.`);return {desired,red,semanticRed,rejected};
}

// Reproduce the two structure assumptions exposed by immutable 4ba625b6 CI
// archives. These are synthetic validation controls, not reclassified CI runs.
export function runActivationObservedStructureTests(){
 let positives=0,rejected=0;
 const states=(report,fn)=>{const c=report.checks.find(c=>c.name==='empty.filtered');for(const snapshot of Object.values(c.raw)){fn(snapshot.state);for(const event of snapshot.log)fn(event.state);}};
 const reorder=report=>states(report,state=>{if(state.query.value){const rows=new Map(state.rows.map(row=>[row.value,row]));state.rows=['open-file','zebra-file','option-file','other-place','disabled-open'].map(value=>rows.get(value));}});
 for(const surface of ['go-qualified','go-chapter','sdui'])for(const red of [false,true]){
  const seed=buildActivationSchemaFixture(surface,red),expect=red?'failed':'passed';
  for(const fonts of [[],[paletteOptionalBrowserPaths[0]],[paletteOptionalBrowserPaths[1]],paletteOptionalBrowserPaths]){
   const f=clone(seed),keep=p=>p.check===null||!paletteOptionalBrowserPaths.includes(p.path)||fonts.includes(p.path);f.report.requests=f.report.requests.filter(keep);f.report.browserResponses=f.report.browserResponses.filter(keep);assert.equal(verifyActivationEvidence(f.report,f.trusted,f.exit).status,expect);positives++;
  }
  const ordered=clone(seed);reorder(ordered.report);refresh(ordered);assert.equal(verifyActivationEvidence(ordered.report,ordered.trusted,ordered.exit).status,expect);assert.deepEqual(ordered.report.checks.at(-1).raw.before.state.rows.map(row=>row.value),['open-file','zebra-file','option-file','other-place','disabled-open']);positives++;
  const reject=(name,fixture,mutate,recompute=false)=>{const f=clone(fixture);assert.throws(()=>{mutate(f.report);if(recompute)refresh(f);verifyActivationEvidence(f.report,f.trusted,f.exit);},undefined,name);rejected++;};
  const font=paletteOptionalBrowserPaths[1],match=p=>p.check==='empty.initial'&&p.path===font;
  for(const [name,mutate]of [
   ['optional request omitted',r=>r.requests=r.requests.filter(p=>!match(p))],
   ['optional response omitted',r=>r.browserResponses=r.browserResponses.filter(p=>!match(p))],
   ['optional duplicate pair',r=>{r.requests.push(clone(r.requests.find(match)));r.browserResponses.push(clone(r.browserResponses.find(match)));}],
   ['optional duplicate request',r=>r.requests.push(clone(r.requests.find(match)))],
   ['optional duplicate response',r=>r.browserResponses.push(clone(r.browserResponses.find(match)))],
   ['optional cross-case response',r=>r.browserResponses.find(match).check='empty.disabled'],
   ['optional wrong hash',r=>r.browserResponses.find(match).receivedSHA256=sha('wrong')],
   ['optional wrong bytes',r=>r.requests.find(match).responseBytes++],
   ['optional foreign case',r=>r.browserResponses.find(match).check='foreign'],
   ['unknown optional path',r=>{r.requests.find(match).path='/assets/ely/fonts/foreign.ttf';r.browserResponses.find(match).path='/assets/ely/fonts/foreign.ttf';}],
   ['mandatory pair omitted',r=>{r.requests=r.requests.filter(p=>!(p.check==='empty.initial'&&p.path==='/assets/app.css'));r.browserResponses=r.browserResponses.filter(p=>!(p.check==='empty.initial'&&p.path==='/assets/app.css'));}],
   ['mandatory duplicate pair',r=>{r.requests.push(clone(r.requests.find(p=>p.check==='empty.initial'&&p.path==='/assets/app.css')));r.browserResponses.push(clone(r.browserResponses.find(p=>p.check==='empty.initial'&&p.path==='/assets/app.css')));}],
  ])reject(name,seed,mutate);
  for(const [name,mutate]of [
   ['duplicate row',s=>s.rows[2]=clone(s.rows[1])],['foreign row value',s=>s.rows[1].value='foreign'],['foreign row id',s=>s.rows[1].id=s.peer.rows[1].id],
   ['moved row tokens',s=>{[s.rows[1].token,s.rows[2].token]=[s.rows[2].token,s.rows[1].token];}],['replacement row token',s=>s.rows[1].token=999],
   ['disconnected row',s=>s.rows[1].connected=false],['missing row',s=>s.rows.pop()],['borrowed peer row',s=>s.rows[1]=clone(s.peer.rows[1])],['changed row action',s=>s.rows[1].action='foreign'],
  ])reject(name,ordered,r=>states(r,s=>{if(s.query.value)mutate(s);}),true);
  reject('invented initial order',ordered,r=>r.checks.at(-1).raw.ready.state.rows.reverse(),true);
  reject('peer reorder',ordered,r=>states(r,s=>s.peer.rows.reverse()),true);
 }
 console.log(`Activation observed-structure regressions: ${positives} synthetic positives, ${rejected} corruptions rejected. Original invalid archives remain invalid.`);return {positives,rejected};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runActivationSchemaTests();
