import assert from 'node:assert/strict';
import {isDeepStrictEqual as same} from 'node:util';
import {paletteOwner,paletteRows,paletteSourcePaths,paletteSurfaces,paletteRequiredBrowserPaths,paletteErrors,paletteTyping} from './palette-query-evidence.mjs';
import {activationSourcePaths,activationBaseline,activationBaselineTree} from './palette-activation-inputs.mjs';
export const activationCases=['pointer.activation','owner.close-rebind','owner.close-bind-absent','callback.reopen','callback.peer-focus','empty.initial','empty.disabled','empty.filtered'];
export const activationClassification='supplemental activation and empty-confirmation baseline; close-rebind cancellation is added web ownership policy, not native parity';
export const activationReportName=surface=>`palette-activation-${surface}.json`;
export const activationPage=name=>name==='empty.initial'?'/empty-initial':name==='empty.disabled'?'/empty-disabled':'/';
export const activationQuery=name=>name==='empty.filtered'?'zzzzzz':'';
const keys=(object,wanted)=>assert.deepEqual(Object.keys(object).sort(),[...wanted].sort(),'exact raw keys');
const token=value=>Number.isInteger(value)&&value>0, hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
const nodeKeys=['token','id','tag','value','connected'],bindingKeys=['handlers','action','change','dispose'];
const stateKeys=['owner','component','ready','binding','query','form','formAction','queryName','caret','dialog','open','opener','list','activeID','controls','focus','rows','peer','outside'];
const rowKeys=[...nodeKeys,'label','action','disabled','hidden','selected','role'];
const eventKeys=['eventToken','trusted','target','path','defaultPrevented','key','code','keyCode','button','pointerType','ctrl','alt','shift','meta','composing'];
const nativeTypes=['pointerdown','pointerup','click','keydown','keyup','focus','submit','click-boundary','key-boundary','close-focus-before-bind','close-focus-after-bind'];
const extras={
 'initial-unbound':[], 'binding-installed':['label','previous','current'],armed:[],stage:[],
 'direct-action':['eventToken','target','payload'],host:['label','handlerToken','payload'],
 'host-change':['label','handlerToken','detail'],change:['detail'],result:['payload','result'],close:['trusted','target'],
 'callback-reopen':[],'callback-peer-focus':[], 'requestSubmit-call':['api'],'requestSubmit-return':['api'],
 'request-start':['path','method','fields'],'bridge-success':['action','target','status','requestId'],
 'submit-boundary':[...eventKeys,'formAction','formToken','fields'],
};
const payloadKeys=['id','component','action','value','hasValue','formDataKind','formData','valuesKind','values','submitter'];
const commands=['open-command','option-command','other-command','disabled-command','zebra-command'];
export const activationPayload=(surface,action='option-command',query='')=>({id:paletteOwner(surface),component:'navigation/CommandPalette',action,value:action==='run'?null:'option-file',hasValue:action!=='run',formDataKind:action==='run'?'FormData':'null',formData:action==='run'?[['cmdQuery',query]]:null,valuesKind:'array',values:action==='run'?[['cmdQuery',query]]:[],submitter:action==='run'?'':null});
const events=(snapshot,type,stage)=>snapshot.log.filter(e=>e.type===type&&(!stage||e.stage===stage));
const selected=state=>state.rows.filter(row=>row.selected==='true').map(row=>row.value);
function assertNode(n){keys(n,nodeKeys);assert(token(n.token));for(const k of ['id','tag'])assert.equal(typeof n[k],'string');assert.equal(typeof n.connected,'boolean');assert(n.value===null||typeof n.value==='string');}
function assertBinding(b){if(b===null)return;keys(b,bindingKeys);for(const value of Object.values(b))assert(token(value));assert.equal(new Set(Object.values(b)).size,4);}
function assertState(s,surface,name){
 keys(s,stateKeys);for(const k of ['owner','query','form','dialog','opener','list','focus','outside']){assertNode(s[k]);assert.equal(s[k].connected,true,'same live DOM probe');}assertBinding(s.binding);
 assert.equal(s.owner.id,paletteOwner(surface));assert.equal(s.component,'navigation/CommandPalette');assert.equal(s.ready,'true');assert.equal(s.query.id,s.owner.id+'-palette-query');assert.equal(s.query.tag,'INPUT');assert.equal(s.queryName,'cmdQuery');assert.equal(s.form.tag,'FORM');assert.equal(s.formAction,'run');assert.equal(s.list.id,s.owner.id+'-palette-results');assert.equal(s.controls,s.list.id);assert.equal(s.dialog.id,s.owner.id+'-palette');assert.equal(s.outside.id,'palette-peer-field');assert.equal(s.outside.value,'peer unchanged');
 assert.equal(typeof s.open,'boolean');assert.equal(s.caret.length,2);s.caret.forEach(n=>assert(Number.isInteger(n)&&n>=0));assert(s.activeID===null||typeof s.activeID==='string');
 keys(s.peer,['owner','open','query','rows']);assertNode(s.peer.owner);assert.equal(s.peer.owner.connected,true);assert.equal(s.peer.owner.id,paletteOwner(surface,'peer'));assert.equal(s.peer.open,false);assert.equal(s.peer.query,'');
 for(const [slot,rows]of [['primary',s.rows],['peer',s.peer.rows]]){
  const wanted=slot==='primary'&&name==='empty.initial'?[]:paletteRows(slot);
  assert.equal(rows.length,wanted.length);const owner=paletteOwner(surface,slot);
  rows.forEach((row,i)=>{keys(row,rowKeys);assertNode(Object.fromEntries(nodeKeys.map(k=>[k,row[k]])));assert.deepEqual([row.id,row.value,row.label,row.action,row.disabled,row.role,row.tag,row.connected],[owner+'-palette-option-'+i,wanted[i].value,wanted[i].label,commands[i],wanted[i].disabled||(slot==='primary'&&name==='empty.disabled'),'option','BUTTON',true]);assert.equal(typeof row.hidden,'boolean');assert(['true','false'].includes(row.selected));if(slot==='peer')assert.deepEqual([row.hidden,row.selected],[false,i===0?'true':'false'],'untouched peer row state');});
 }
 const nodes=[s.owner,s.query,s.form,s.dialog,s.opener,s.list,s.outside,...s.rows,s.peer.owner,...s.peer.rows];assert.equal(new Set(nodes.map(n=>n.token)).size,nodes.length,'distinct actual nodes');
}
export function assertActivationRaw(check,surface){
 assert(activationCases.includes(check.name));const empty=check.name.startsWith('empty.'),owner=check.name.startsWith('owner.');
 const names=['ready','opened','before','after',...(owner?['freshBefore','fresh']:[]),...(empty?['down','explicit']:[])];keys(check.raw,names);
 const r=check.raw,all=Object.values(r),final=owner?r.fresh:empty?r.explicit:r.after;
 for(const snapshot of all){keys(snapshot,['state','log','baseTrace']);const base=snapshot.baseTrace, logKeys=['inputs','actions','changes','hosts','hostChanges','results','closes','lifecycle','bridge','errors','timeline'];keys(base,logKeys);const indexes=Object.fromEntries(logKeys.filter(k=>k!=='timeline').map(k=>[k,0]));for(const value of Object.values(base))assert(Array.isArray(value));base.timeline.forEach((e,i)=>{keys(e,['sequence','kind','index']);assert.equal(e.sequence,i+1);assert(Object.hasOwn(indexes,e.kind));assert.equal(e.index,indexes[e.kind]++);});for(const [k,count]of Object.entries(indexes))assert.equal(base[k].length,count);assertState(snapshot.state,surface,check.name);assert(Array.isArray(snapshot.log));assert.deepEqual(snapshot.log,final.log.slice(0,snapshot.log.length),'snapshots preserve full raw prefixes');const latestBinding=snapshot.log.filter(e=>e.type==='binding-installed').at(-1)?.current??null;assert.deepEqual(snapshot.state.binding,latestBinding,'snapshot binding matches exact event prefix');}
 const allowedStages=owner?['setup','activation','setup','fresh']:empty?['setup','activation','explicit']:['setup','activation'];const actualStages=final.log.filter((e,i)=>i===0||e.stage!==final.log[i-1].stage).map(e=>e.stage);assert.deepEqual(actualStages,allowedStages,'exact per-case stage progression');
 for(const [label,snapshot]of Object.entries(r)){const stage=label==='fresh'?'fresh':label==='explicit'?'explicit':['after','down'].includes(label)?'activation':'setup';assert.equal(snapshot.log.at(-1)?.stage,stage,'snapshot stage attribution');}
 const nativeIdentities=new Map();
 for(const [i,e]of final.log.entries()){
  assert.equal(e.sequence,i+1);assert(['setup','activation','fresh','explicit'].includes(e.stage));assertState(e.state,surface,check.name);
  const extra=nativeTypes.includes(e.type)?eventKeys:extras[e.type];assert(extra,'source-owned event type '+e.type);keys(e,['sequence','type','stage','state',...extra]);
  if(nativeTypes.includes(e.type)||e.type==='submit-boundary'){
   assert(token(e.eventToken));assertNode(e.target);assert.equal(e.target.connected,true);assert(e.path.includes(e.target.token));e.path.forEach(x=>assert(token(x)));for(const k of ['trusted','defaultPrevented','ctrl','alt','shift','meta','composing'])assert.equal(typeof e[k],'boolean');
   // Every raw owner event is tied to this exact connected instance, not an ID match.
   assert(e.path.includes(e.state.owner.token)||e.target.token===e.state.outside.token);
   const normalized=e.type==='click-boundary'?'click':e.type==='key-boundary'?'keydown':e.type==='submit-boundary'?'submit':e.type.startsWith('close-focus-')?'focus':e.type;const signature=Object.fromEntries(['trusted','target','path','key','code','keyCode','button','pointerType','ctrl','alt','shift','meta','composing'].map(k=>[k,e[k]]));const seen=nativeIdentities.get(e.eventToken);if(seen){assert.equal(seen.type,normalized,'different native events need distinct identity');assert.deepEqual(seen.signature,signature,'same native event observation agrees');assert(!seen.observations.has(e.type),'one capture per event boundary');seen.observations.add(e.type);}else nativeIdentities.set(e.eventToken,{type:normalized,signature,observations:new Set([e.type])});
   const known=[e.state.query,e.state.form,e.state.opener,e.state.dialog,e.state.outside,...e.state.rows];const target=known.find(n=>n.token===e.target.token);if(target)assert.deepEqual(e.target,Object.fromEntries(nodeKeys.map(k=>[k,target[k]])));
  }
  if(e.type==='submit'||e.type==='submit-boundary'){assert.deepEqual(e.target,e.state.form);if(e.type==='submit-boundary'){assert.equal(e.formToken,e.state.form.token);assert.equal(e.formAction,e.state.formAction);}}
  if(e.type==='direct-action'){assert.deepEqual(e.target,e.state.owner);assert(token(e.eventToken));}
  if(e.payload)keys(e.payload,payloadKeys);

  if(e.type==='binding-installed'){assertBinding(e.previous);assertBinding(e.current);assert.deepEqual(e.current,e.state.binding);if(e.previous)for(const key of bindingKeys)assert.notEqual(e.previous[key],e.current[key]);}
 }
 // Snapshot identities cannot drift inside these same-root probes.
 for(const snapshot of all)for(const key of ['owner','query','form','dialog','opener','list','outside'])assert.equal(snapshot.state[key].token,r.ready.state[key].token);
 for(const capture of [...all,...final.log])assert.deepEqual(capture.state.rows.map(row=>[row.id,row.token]),r.ready.state.rows.map(row=>[row.id,row.token]),'exact same primary row objects');
 for(const snapshot of all)assert.deepEqual(snapshot.state.peer,r.ready.state.peer,'exact peer node identities and state');
 for(const e of final.log)assert.deepEqual(e.state.peer,r.ready.state.peer,'exact peer node identities and state');
 for(const e of final.log)for(const key of ['owner','query','form','dialog','opener','list','outside'])assert.equal(e.state[key].token,r.ready.state[key].token);
 const domTokens=new Set(),eventTokens=new Set(),functionTokens=new Set();for(const capture of [...all,...final.log]){const s=capture.state;for(const node of [s.owner,s.query,s.form,s.dialog,s.opener,s.list,s.focus,s.outside,s.peer.owner,...s.rows,...s.peer.rows])domTokens.add(node.token);if(s.binding)Object.values(s.binding).forEach(t=>functionTokens.add(t));if(capture.target&&typeof capture.target==='object')domTokens.add(capture.target.token);if(Array.isArray(capture.path))capture.path.forEach(t=>domTokens.add(t));if(capture.eventToken)eventTokens.add(capture.eventToken);}for(const t of functionTokens){assert(!domTokens.has(t),'function/DOM token namespaces disjoint');assert(!eventTokens.has(t),'function/event token namespaces disjoint');}for(const t of eventTokens)assert(!domTokens.has(t),'event/DOM token namespaces disjoint');
 const directEvents=events(final,'direct-action'),nativeTokens=new Set(final.log.filter(e=>nativeTypes.includes(e.type)||e.type==='submit-boundary').map(e=>e.eventToken));assert.equal(new Set(directEvents.map(e=>e.eventToken)).size,directEvents.length);directEvents.forEach(e=>assert(!nativeTokens.has(e.eventToken),'CustomEvent identity distinct from native input'));
 for(const e of final.baseTrace.actions){assert.equal(e.slot,'primary');assert.equal(e.state.id,paletteOwner(surface));assert.equal(e.state.component,'navigation/CommandPalette');assert.equal(e.state.ready,'true');}
 for(const e of final.baseTrace.results)assert.equal(e.slot,'primary');
 const rawKeys=final.baseTrace.inputs.slice(r.before.baseTrace.inputs.length).filter(e=>['keydown','keyup'].includes(e.type));const capturedKeys=final.log.filter(e=>['keydown','keyup'].includes(e.type)&&e.stage!=='setup');assert.deepEqual(rawKeys.map(e=>[e.type,e.key,e.code,e.trusted,e.targetTag,e.field,e.ownerID,e.value,e.connected,e.ctrl,e.alt,e.shift,e.meta]),capturedKeys.map(e=>[e.type,e.key,e.code,e.trusted,e.target.tag,e.target.token===e.state.query.token,e.state.owner.id,e.target.value,e.target.connected,e.ctrl,e.alt,e.shift,e.meta]),'independent native keyboard capture joins after setup');
 const project=e=>Object.fromEntries(payloadKeys.map(k=>[k,e[k]]));assert.deepEqual(final.baseTrace.actions.map(project),events(final,'direct-action').map(e=>e.payload),'independent document/direct action observation');assert.deepEqual(final.baseTrace.results.map(project),events(final,'result').map(e=>e.payload));assert.deepEqual(final.baseTrace.hosts,[]);assert.deepEqual(final.baseTrace.hostChanges,[]);
 const binds=events(final,'binding-installed'),initial=events(final,'initial-unbound');assert.equal(new Set(binds.flatMap(e=>Object.values(e.current))).size,binds.length*4,'every fixture binding uses fresh handler and disposer objects');assert.equal(initial.length,1);assert.equal(initial[0].state.binding,null);
 let current=null;const installed=new Map();for(const e of final.log){if(e.type==='binding-installed'){assert.deepEqual(e.previous,current);current=e.current;installed.set(e.current.action,e.label);installed.set(e.current.change,e.label);}if(['host','host-change'].includes(e.type))assert.equal(e.label,installed.get(e.handlerToken),'known actual installed callback identity');assert.deepEqual(e.state.binding,current,'binding generation timeline');}
 // Direct and host payloads refer to the same public event in dispatch order.
 for(const e of events(final,'host')){const preceding=final.log.slice(0,e.sequence-1).filter(x=>x.type==='direct-action').at(-1);assert(preceding);assert.deepEqual(e.payload,preceding.payload,'direct/host payload join');}
 for(const e of events(final,'result')){const host=final.log.slice(0,e.sequence-1).filter(x=>x.type==='host'&&x.label===e.result.binding&&same(x.payload,e.payload)).at(-1);assert(host,'result has actual originating callback');assert.deepEqual(e.result,{binding:host.label,owner:paletteOwner(surface)});}
 return final;
}
export function activationOracles(check,surface){
 const final=assertActivationRaw(check,surface),r=check.raw,name=check.name,empty=name.startsWith('empty.'),rebind=name.startsWith('owner.'),query=activationQuery(name),out=[];
 const add=(id,observed,expected,prerequisite=false)=>out.push({id,observed,expected,prerequisite,pass:same(observed,expected)});
 add('setup.closed-empty-query',[r.ready.state.open,r.ready.state.query.value],[false,''],true);
 add('setup.native-opened-query',[r.opened.state.open,r.opened.state.focus.token],[true,r.opened.state.query.token],true);
 add('setup.prepared-query',[r.before.state.open,r.before.state.query.value,r.before.state.focus.token,r.before.state.caret],[true,query,r.before.state.query.token,[query.length,query.length]],true);
 add('setup.no-actions',events(r.before,'direct-action'),[],true);
 const edit=e=>({type:e.type,key:e.key,data:e.data,inputType:e.inputType,value:e.value,start:e.selectionStart,end:e.selectionEnd,field:e.field,targetTag:e.targetTag});
 add('setup.source-fixed-native-query-typing',r.before.baseTrace.inputs.map(edit),paletteTyping(query),true);add('setup.trusted-typing-owner',r.before.baseTrace.inputs.map(e=>[e.trusted,e.ownerID,e.connected,e.ctrl,e.alt,e.shift,e.meta]),r.before.baseTrace.inputs.map(()=>[true,paletteOwner(surface),true,false,false,false,false]),true);
 add('safety.host-callback-current-binding',events(final,'host').map(e=>e.handlerToken),events(final,'host').map(e=>e.state.binding?.action??null));
 add('safety.host-change-current-binding',events(final,'host-change').map(e=>e.handlerToken),events(final,'host-change').map(e=>e.state.binding?.change??null));
 add('safety.results-current-binding',events(final,'result').map(e=>e.state.binding),events(final,'result').map(e=>final.log.slice(0,e.sequence-1).filter(x=>x.type==='host'&&x.label===e.result.binding&&same(x.payload,e.payload)).at(-1)?.state.binding??null));
 add('safety.no-setup-activation',final.log.filter(e=>e.stage==='setup'&&(['direct-action','host','result','request-start','bridge-success'].includes(e.type)||['change','host-change'].includes(e.type)&&e.detail.name==='palette')),[]);
 add('setup.no-runtime-errors',final.baseTrace.errors,[],true);
 add('setup.exact-bindings',events(final,'binding-installed').map(e=>e.label),name==='owner.close-bind-absent'?['replacement']:rebind?['original','replacement']:['original'],true);
 const direct=events(r.after,'direct-action','activation'),hosts=events(r.after,'host','activation'),changes=events(r.after,'change','activation').filter(e=>e.detail.name==='palette'),hostChanges=events(r.after,'host-change','activation').filter(e=>e.detail.name==='palette');
 const ordinary=['direct-action','host','host-change','change'];
 const stages=['setup','activation',...(rebind?['fresh']:[]),...(empty?['explicit']:[])];
 for(const stage of stages){const expected=stage==='setup'||stage==='activation'&&(empty||rebind)?[]:stage==='explicit'||name==='callback.reopen'?['direct-action','host']:ordinary;const observed=final.log.filter(e=>e.stage===stage&&(['direct-action','host'].includes(e.type)||['host-change','change'].includes(e.type)&&e.detail.name==='palette'));add(stage+'.exact-transaction-notification-order',observed.map(e=>e.type),expected);const selection=observed.filter(e=>['host-change','change'].includes(e.type));add(stage+'.selection-delivered-closed-and-committed',selection.map(e=>[e.state.open,selected(e.state)]),selection.map(()=>[false,['option-file']]));}
 const selectionPayload={id:paletteOwner(surface),component:'navigation/CommandPalette',name:'palette',value:'option-file',selected:true};
 if(empty){
  add('empty.no-enabled-results',r.before.state.rows.filter(row=>!row.hidden&&!row.disabled).map(row=>row.value),[],true);
  const key=events(r.after,'keydown','activation'),up=events(r.after,'keyup','activation'),boundary=events(r.after,'key-boundary','activation');
  add('empty.trusted-complete-plain-enter',r.after.log.filter(e=>['keydown','keyup'].includes(e.type)&&e.stage==='activation').map(e=>[e.type,e.key,e.code,e.keyCode,e.trusted,e.ctrl,e.alt,e.shift,e.meta,e.composing,e.target.token]),['keydown','keyup'].map(type=>[type,'Enter','Enter',13,true,false,false,false,false,false,r.before.state.query.token]),true);
  add('empty.actual-boundary-event',boundary.map(e=>[e.eventToken,e.target.token]),key.map(e=>[e.eventToken,e.target.token]),true);
  add('empty.consumed-at-handler-boundary',boundary.map(e=>e.defaultPrevented),[true]);
  add('empty.no-submit',events(r.after,'submit','activation'),[]);add('empty.no-action',direct,[]);add('empty.no-host',hosts,[]);add('empty.no-selection',changes,[]);add('empty.no-host-selection',hostChanges,[]);
  add('empty.presentation-preserved',[r.after.state.open,r.after.state.query.value,r.after.state.caret,r.after.state.focus.token,selected(r.after.state)],[true,query,[query.length,query.length],r.before.state.query.token,[]]);
  add('explicit.api-control',events(final,'requestSubmit-call').map(e=>[e.stage,e.api]),[['explicit','HTMLFormElement.requestSubmit']],true);
  const explicit=events(final,'direct-action','explicit'),submit=events(final,'submit-boundary','explicit');
  add('explicit.exact-query-payload',explicit.map(e=>e.payload),[activationPayload(surface,'run',query)]);
  add('explicit.exact-result',events(final,'result','explicit').map(e=>e.payload),[activationPayload(surface,'run',query)]);
  add('explicit.host-payload',events(final,'host','explicit').map(e=>e.payload),[activationPayload(surface,'run',query)]);
  add('explicit.form-contract',submit.map(e=>[e.formAction,e.fields,e.defaultPrevented]),[['run',[['cmdQuery',query]],true]]);
  add('explicit.one-real-submit',events(final,'submit','explicit').length,1);
  add('explicit.stays-open',r.explicit.state.open,true);
 }else{
  const pointer=r.after.log.filter(e=>['pointerdown','pointerup','click'].includes(e.type)&&e.stage==='activation'&&e.trusted);
  const option=r.before.state.rows[1];
  add('pointer.actual-family-return-boundary',events(r.after,'click-boundary','activation').filter(e=>e.trusted).map(e=>[e.eventToken,e.target,e.path]),pointer.filter(e=>e.type==='click').map(e=>[e.eventToken,e.target,e.path]),true);
  add('pointer.complete-trusted-gesture',pointer.map(e=>[e.type,e.trusted,e.button,e.pointerType,e.ctrl,e.alt,e.shift,e.meta]),['pointerdown','pointerup','click'].map(type=>[type,true,0,'mouse',false,false,false,false]),true);
  add('pointer.exact-option-target-path',pointer.map(e=>e.path.includes(option.token)&&e.path.includes(r.before.state.owner.token)),[true,true,true],true);
  add('pointer.query-and-selection-preserved',[r.after.state.query.value,r.after.state.caret,selected(r.after.state)],['',[0,0],['option-file']]);
  add('pointer.different-row-before-activation',selected(r.before.state),['open-file'],true);
  if(rebind){
   const a=events(r.after,'close-focus-before-bind'),b=events(r.after,'close-focus-after-bind');
   add('owner.native-close-focus',a.map(e=>[e.trusted,e.target.token,e.state.open,e.state.focus.token]),[[true,r.before.state.opener.token,false,r.before.state.opener.token]],true);
   add('owner.one-binding-transition',b.length,1,true);add('owner.same-native-focus-event',b.map(e=>e.eventToken),a.map(e=>e.eventToken),true);
   add('owner.binding-before-after',[a[0]?.state.binding,b[0]?.state.binding],[r.before.state.binding,r.after.state.binding],true);
   const boundary=events(r.after,'click-boundary','activation').filter(e=>e.trusted);add('owner.synchronous-focus-rebind-before-click-return',Boolean(a[0]&&b[0]&&boundary.length===1&&a[0].sequence<b[0].sequence&&b[0].sequence<boundary[0].sequence),true,true);
   add('owner.close-committed-selection',a.map(e=>selected(e.state)),[['option-file']]);
   add('owner.cancel-old-command',[direct,hosts,changes,hostChanges],[[],[],[],[]]);
   add('owner.no-stale-result',events(r.after,'result','activation'),[]);
   add('owner.fresh-trusted-pointer',r.fresh.log.filter(e=>['pointerdown','pointerup','click'].includes(e.type)&&e.stage==='fresh'&&e.trusted).map(e=>[e.type,e.path.includes(option.token),e.path.includes(r.before.state.owner.token),e.trusted,e.button,e.pointerType,e.ctrl,e.alt,e.shift,e.meta]),['pointerdown','pointerup','click'].map(type=>[type,true,true,true,0,'mouse',false,false,false,false]),true);
   add('owner.fresh-replacement-host',events(r.fresh,'host','fresh').map(e=>[e.label,e.payload,e.state.open]),[['replacement',activationPayload(surface),false]]);
   add('owner.fresh-return-boundary',events(r.fresh,'click-boundary','fresh').filter(e=>e.trusted).map(e=>[e.eventToken,e.target,e.path]),events(r.fresh,'click','fresh').filter(e=>e.trusted).map(e=>[e.eventToken,e.target,e.path]),true);
   add('owner.fresh-selection-change',events(r.fresh,'change','fresh').filter(e=>e.detail.name==='palette').map(e=>e.detail),[selectionPayload]);
   add('owner.fresh-host-selection-change',events(r.fresh,'host-change','fresh').filter(e=>e.detail.name==='palette').map(e=>e.detail),[selectionPayload]);
   add('owner.fresh-result',events(r.fresh,'result','fresh').map(e=>e.payload),[activationPayload(surface)]);
   add('owner.fresh-once',events(r.fresh,'direct-action','fresh').map(e=>e.payload),[activationPayload(surface)]);
  }else{
   add('activation.exact-result',events(r.after,'result','activation').map(e=>e.payload),[activationPayload(surface)]);
   add('activation.direct-payload',direct.map(e=>e.payload),[activationPayload(surface)]);
   add('activation.host-payload',hosts.map(e=>e.payload),[activationPayload(surface)]);
   add('activation.closed-before-direct-and-host',[...direct,...hosts].map(e=>e.state.open),[false,false]);
   add('activation.committed-selection-before-callback',[...direct,...hosts].map(e=>selected(e.state)),[['option-file'],['option-file']]);
   if(name==='callback.reopen'){
    const callback=events(r.after,'callback-reopen');add('callback.reopened-query-focused',callback.map(e=>[e.state.open,e.state.focus.token]),[[true,r.before.state.query.token]]);
    add('callback.reopen-survives-close-task-raf',[r.after.state.open,r.after.state.focus.token],[true,r.before.state.query.token]);
    add('callback.no-stale-selection',[changes,hostChanges],[[],[]]);
   }else{
    add('activation.closed-after-tasks',r.after.state.open,false);
    add('activation.one-palette-change',changes.map(e=>e.detail),[selectionPayload]);add('activation.one-host-palette-change',hostChanges.map(e=>e.detail),[selectionPayload]);
    add('activation.action-before-selection',Boolean(direct[0]&&changes[0]&&direct[0].sequence<changes[0].sequence),true);
    if(name==='callback.peer-focus')add('callback.peer-focus-survives-close-task-raf',[events(r.after,'callback-peer-focus').map(e=>e.state.focus.token),r.after.state.focus.token],[[r.before.state.outside.token],r.before.state.outside.token]);
   }
  }
 }
 // Bridge expectations are fixed by the intended contract; transport integrity
 // separately reconciles every actual request, including valid baseline reds.
 for(const stage of ['activation',...(rebind?['fresh']:[]),...(empty?['explicit']:[])]){
  const wanted=surface==='sdui'?(stage==='explicit'?['query-observed']:empty||rebind&&stage==='activation'?[]:['command-observed']):[];
  add(stage+'.request-actions',events(final,'request-start',stage).map(e=>Object.fromEntries(e.fields)._action),wanted);
  if(surface==='sdui'&&!empty&&!rebind&&name==='pointer.activation')add('activation.closed-at-request-start',events(final,'request-start',stage).map(e=>e.state.open),[false]);
 }
 return out;
}
export const activationBrowserPaths=(surface,name)=>[...paletteRequiredBrowserPaths.map(p=>p==='/'?activationPage(name):p),'/activation-observer.js','/assets/ely/fonts/Inter-Regular.ttf','/assets/ely/fonts/Inter-SemiBold.ttf',...(surface==='sdui'?['/assets/sdui.js','/assets/sdui.css']:[])];
export function verifyActivationEvidence(report,trusted,exitCode){
 assert.equal(report.suite,'palette-activation');assert.equal(report.classification,activationClassification);assert.equal(report.stage,'checks');assert(paletteSurfaces.includes(trusted.surface));
 for(const key of ['surface','revision','tree','runToken'])assert.equal(report[key],trusted[key]);for(const key of ['revision','tree'])assert(/^[a-f0-9]{40}$/.test(trusted[key]));assert(typeof trusted.runToken==='string'&&trusted.runToken.length>10);
 assert.equal(report.dirty,'');for(const key of ['error','captureError','validationError'])assert.equal(report[key],undefined);assert.equal(trusted.fixtureManifest.activationBaselineCommit,activationBaseline);assert.equal(trusted.fixtureManifest.activationBaselineTree,activationBaselineTree);if(trusted.surface==='sdui'){assert.equal(trusted.fixtureManifest.sduiQueryBinding,false);assert.equal(trusted.fixtureManifest.sduiRunRoute,true);assert.deepEqual(trusted.fixtureManifest.sduiSourceActions,[...commands,'run']);}
 assert.deepEqual(Object.keys(trusted.sourceFiles),paletteSourcePaths);assert.deepEqual(Object.keys(trusted.activationSourceFiles),activationSourcePaths);
 for(const key of ['sourceFiles','activationSourceFiles','assets','fixtures','fixtureManifest','standaloneDependencyProof','toolchain'])assert.deepEqual(report[key],trusted[key]);
 for(const h of [...Object.values(trusted.sourceFiles),...Object.values(trusted.activationSourceFiles)])assert(hash(h));
 for(const entry of Object.values({...trusted.assets,...trusted.fixtures})){assert(hash(entry.sourceSHA256));assert.equal(entry.sourceSHA256,entry.servedSHA256);assert(entry.bytes>0);}
 assert(hash(report.standaloneDependencyProof.SHA256));assert.deepEqual(report.standaloneDependencyProof.forbiddenImports,[]);
 for(const k of ['node','go','playwright'])assert(typeof report.toolchain[k]==='string'&&report.toolchain[k]);assert(typeof report.browserVersion==='string'&&report.browserVersion);
 for(const k of paletteErrors)assert.deepEqual(report[k],[]);assert.deepEqual(report.caseInventory,activationCases);assert.deepEqual(report.checks.map(c=>c.name),activationCases);
 const paths=[...Object.keys(trusted.assets),...Object.keys(trusted.fixtures)];assert.deepEqual(report.httpAssetProof.map(p=>p.path),paths);
 for(const proof of report.browserResponses)assert(activationCases.includes(proof.check),'browser response belongs to an exact case');
 for(const proof of [...report.httpAssetProof,...report.browserResponses]){keys(proof,['path','status','bytes','expectedSHA256','receivedSHA256',...(Object.hasOwn(proof,'check')?['check']:[]),...(proof.path==='/sdui-action'?['responseFixture']:[])]);const entry=trusted.assets[proof.path]||trusted.fixtures[proof.responseFixture||proof.path];assert(entry);assert.deepEqual([proof.status,proof.bytes,proof.expectedSHA256,proof.receivedSHA256],[200,entry.bytes,entry.servedSHA256,entry.servedSHA256]);}
 assert.deepEqual(report.requests.filter(r=>r.check===null).map(r=>r.path),paths);
 for(const request of report.requests){keys(request,['check','path','method','htmx','status','responseSHA256','responseBytes',...(request.path==='/sdui-action'?['fields','requestSHA256','requestBytes','contentType','idempotencyKey','responseFixture']:[])]);assert.equal(request.htmx,null);assert(request.check===null||activationCases.includes(request.check));const entry=trusted.assets[request.path]||trusted.fixtures[request.responseFixture||request.path];assert(entry);assert.deepEqual([request.status,request.responseSHA256,request.responseBytes],[200,entry.servedSHA256,entry.bytes]);assert.equal(request.method,request.path==='/sdui-action'?'POST':'GET');}
 for(const check of report.checks){
  assert.equal(check.error,undefined);assert.equal(check.captureError,undefined);const final=assertActivationRaw(check,trusted.surface);assert.deepEqual(check.finalTrace,final);
  const computed=activationOracles(check,trusted.surface);assert.deepEqual(check.oracles,computed,'independently recomputed raw expectations');for(const o of computed)if(o.prerequisite)assert(o.pass,check.name+': '+o.id);
  assert.equal(check.status,computed.every(o=>o.pass)?'passed':'failed');
  const requests=report.requests.filter(r=>r.check===check.name),responses=report.browserResponses.filter(r=>r.check===check.name),wanted=activationBrowserPaths(trusted.surface,check.name);
  for(const list of [requests,responses])assert.deepEqual(list.filter(p=>p.path!=='/sdui-action').map(p=>p.path).sort(),[...wanted].sort(),'exact source-owned per-case HTTP inventory');
  const starts=events(final,'request-start'),posts=requests.filter(r=>r.path==='/sdui-action'),proofs=responses.filter(r=>r.path==='/sdui-action'),success=events(final,'bridge-success');
  assert.equal(posts.length,starts.length);assert.equal(proofs.length,starts.length);assert.equal(success.length,starts.length);
  if(trusted.surface!=='sdui')assert.equal(starts.length,0);
  const seen=new Set();starts.forEach((start,i)=>{
   const fields=Object.fromEntries(start.fields);assert.equal(start.fields.length,Object.keys(fields).length);assert.equal(start.path,'/sdui-action');assert.equal(start.method,'POST');assert(typeof fields._request==='string'&&fields._request.length>10);assert(!seen.has(fields._request));seen.add(fields._request);
   const action=fields.commandAction;assert(['option-command','run'].includes(action));const query=activationQuery(check.name);
   const expected={_action:action==='run'?'query-observed':'command-observed',_csrf:'palette-query-fixture',_request:fields._request,_target:'palette-primary-result',commandAction:action,ownerID:paletteOwner(trusted.surface),component:'navigation/CommandPalette',...(action==='run'?{cmdQuery:query}:{commandValue:'option-file'})};assert.deepEqual(fields,expected,'fixed source-bound packet');
   assert(success[i].sequence>start.sequence,'bridge completion follows actual request start');
   const direct=final.log.slice(0,start.sequence-1).filter(e=>e.type==='direct-action'&&e.stage===start.stage).at(-1);assert(direct,'request has real action');assert.deepEqual(direct.payload,activationPayload(trusted.surface,action,query));
   assert(hash(posts[i].requestSHA256));assert(Number.isInteger(posts[i].requestBytes)&&posts[i].requestBytes>0);assert(/^multipart\/form-data; boundary=.+/.test(posts[i].contentType));assert.equal(posts[i].idempotencyKey,fields._request);
   assert.deepEqual(Object.fromEntries(posts[i].fields),fields,'raw HTTP/request-start packet join');assert.equal(posts[i].fields.length,start.fields.length);assert.equal(posts[i].responseFixture,'/sdui-response-primary');assert.equal(proofs[i].responseFixture,'/sdui-response-primary');assert.deepEqual([success[i].action,success[i].target,success[i].status,success[i].requestId],[fields._action,fields._target,200,fields._request]);
  });
 }
 const status=report.checks.every(c=>c.status==='passed')?'passed':'failed';assert.equal(report.status,status);assert.equal(exitCode,status==='passed'?0:1,'raw nonzero contract exit preserved');return {status,surface:trusted.surface,revision:trusted.revision,failed:report.checks.filter(c=>c.status==='failed').map(c=>c.name)};
}
