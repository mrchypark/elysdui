import assert from 'node:assert/strict';
import {paletteOwner,paletteRows,paletteExpectedAction} from './palette-query-evidence.mjs';

// Positive counterfactual witnesses complement, and never replace, the original
// desired oracles. These values come from the fixed renderer and one-site
// mutations. No observed failure list chooses a witness or its expected value.
const rows=slot=>[...paletteRows(slot),...Array.from({length:40},(_,i)=>({label:`Entry ${String(i+1).padStart(2,'0')}`,value:`${slot==='peer'?'peer-':''}entry-${String(i+1).padStart(2,'0')}`,disabled:i===6}))];
const entries=rows('primary').slice(5).filter(row=>!row.disabled).map(row=>row.value);
const steps=(()=>{let index=0;return [...Array(28).fill(1),...Array(29).fill(-1)].map(delta=>{index=(index+delta+entries.length)%entries.length;return entries[index];});})();
const rowID=(surface,value,slot='primary')=>paletteOwner(surface,slot)+'-palette-option-'+rows(slot).findIndex(row=>row.value===value);
const snapshots=check=>(check.name==='rank.stable-identity'?['ready','opened','query','arrow','refined','restored','reselected','down','after']:['ready','opened','query','steps','down','after']).flatMap(label=>label==='steps'?check.raw.steps.map((snapshot,i)=>['step-'+i,snapshot]):[[label,check.raw[label]]]);
const payload=(event,surface)=>Object.fromEntries(Object.keys(paletteExpectedAction(surface,'','')).map(key=>[key,event[key]]));
const selected=state=>state.rows.filter(row=>row.selected).map(row=>row.value);
const sequence=(log,kind,index)=>log.timeline.find(entry=>entry.kind===kind&&entry.index===index)?.sequence;
const prefix=(first,last,label)=>{
 for(const key of Object.keys(first))assert.deepEqual(last[key].slice(0,first[key].length),first[key],label+' '+key);
};

// This structural relation also applies to control valid-red diagnostics. It
// does not require an absent callback to exist or turn desired failures green.
// Close events and intermediate query-change events remain diagnostics; only
// their observed prefix is conserved, not an invented fixed cardinality.
export function assertSupplementalObservationJoins(check){
 const {down,after,arrow,refined}=check.raw;
 for(const [,snapshot]of snapshots(check))for(const event of snapshot.log.inputs)if(['keydown','keyup'].includes(event.type))assert.deepEqual([event.data,event.inputType],[null,null],'native key event is not an input insertion record');
 prefix(down.log,after.log,'Enter down observation is an exact completed prefix');
 if(arrow)prefix(arrow.log,refined.log,'Arrow observation is an exact continued prefix');
 for(const [label,snapshot] of [['down',down],['after',after]]){
  const log=snapshot.log,keyDown=log.inputs.findIndex(e=>e.type==='keydown'&&e.key==='Enter'),keyUp=log.inputs.findIndex(e=>e.type==='keyup'&&e.key==='Enter');
  assert.equal(keyDown,0,'Enter observation begins with native keydown');
  assert.equal(keyUp,label==='down'?-1:1,'Enter observation key boundary');
  const start=sequence(log,'inputs',keyDown),end=keyUp<0?Infinity:sequence(log,'inputs',keyUp);
  for(const kind of ['hosts','actions','hostChanges','changes'])log[kind].forEach((event,index)=>{
   if((kind==='changes'||kind==='hostChanges')&&event.name!=='palette')return;
   const at=sequence(log,kind,index);assert(start<at&&at<end,'required command observation occurs within Enter down/up');
   if(kind==='hosts'||kind==='actions')assert.equal(event.phase,'keydown','action and host phase joins native Enter');
  });
  log.results.forEach((event,index)=>{const action=sequence(log,'actions',index);if(action!==undefined)assert(sequence(log,'results',index)>action,'asynchronous result follows its action');});
 }
}

function assertNativeWitness(check,surface,mode){
 const rank=check.name==='rank.stable-identity',focus=mode==='focus-button',owner=paletteOwner(surface);
 const event=(type,key,value,extra={})=>({type,key,code:key===null?null:key==='Control'?'ControlLeft':key.length===1?'Key'+key.toUpperCase():key,data:null,inputType:null,trusted:true,targetTag:'INPUT',field:true,slot:'primary',ownerID:owner,generation:'original',value,focused:true,connected:true,selectionStart:value.length,selectionEnd:value.length,ctrl:false,alt:false,shift:false,meta:false,...extra});
 const pair=(key,value,extra={})=>['keydown','keyup'].map(type=>event(type,key,value,extra));
 const typing=(text,start='')=>{const out=[];let value=start;for(const key of text){out.push(event('keydown',key,value),event('beforeinput',null,value,{data:key,inputType:'insertText'}));value+=key;out.push(event('input',null,value,{data:key,inputType:'insertText'}),event('keyup',key,value));}return out;};
 const button=(type,key,value,extra={})=>event(type,key,value,{targetTag:'BUTTON',field:false,selectionStart:null,selectionEnd:null,...extra});
 for(const [label,snapshot]of snapshots(check)){
  let expected=[];const query=rank?'op':'Entry';
  if(label==='query')expected=typing(query);
  else if(label==='down'||label==='after'){
   expected=[focus?button('keydown','Enter',rank?'option-file':'entry-40'):event('keydown','Enter',query)];
   if(label==='after')expected.push(button('keyup','Enter',''));
  }else if(label.startsWith('step-')){
   const index=Number(label.slice(5)),key=index<28?'ArrowDown':'ArrowUp';
   expected=focus?[index===0?event('keydown',key,'Entry'):button('keydown',key,steps[index-1]),button('keyup',key,steps[index])]:pair(key,'Entry');
  }else if(label==='arrow')expected=focus?[event('keydown','ArrowDown','op'),button('keyup','ArrowDown','option-file')]:pair('ArrowDown','op');
  else if(label==='refined')expected=focus?[event('keydown','ArrowDown','op'),button('keyup','ArrowDown','option-file'),...pair('o','')]:[...pair('ArrowDown','op'),...typing('o','op')];
  else if(label==='restored')expected=[event('keydown','Control','opo',{ctrl:true}),event('keydown','A','opo',{ctrl:true}),event('keyup','A','opo',{ctrl:true,selectionStart:0}),event('keyup','Control','opo',{selectionStart:0}),event('keydown','Backspace','opo',{selectionStart:0}),event('beforeinput',null,'opo',{inputType:'deleteContentBackward',selectionStart:0}),event('input',null,'',{inputType:'deleteContentBackward'}),event('keyup','Backspace','')];
  else if(label==='reselected')expected=[...typing('op'),...pair('ArrowDown','op')];
  if(focus&&['refined','restored','reselected'].includes(label)){
   expected=expected.filter(e=>['keydown','keyup'].includes(e.type));
   expected=expected.map((e,index)=>{
    if(label==='refined'&&index<2)return e;
    const actual=snapshot.log.inputs[index],value=actual?.value;
    assert(snapshot.state.rows.some(row=>row.value===value&&!row.hidden&&!row.disabled),'native typeahead uses an enabled visible source option');
    return button(e.type,e.key,value,{ctrl:e.ctrl});
   });
   let prior=label==='refined'?check.raw.arrow.state.activeValue:label==='restored'?check.raw.refined.state.activeValue:check.raw.restored.state.activeValue;
   for(const e of expected.slice(label==='refined'?2:0)){
    if(e.type==='keydown'||label==='restored')assert.equal(e.value,prior,'native button target continues preceding focus');
    if(e.type==='keyup')prior=e.value;
   }
   assert.equal(prior,snapshot.state.activeValue,'final native button target joins snapshot focus');
   if(label==='refined')assert.equal(expected[2].value,'option-file','continued key starts on arrow-selected option');
   if(label==='reselected')assert.equal(expected.at(-1).value,'option-file','reselected arrow ends on source Option');
  }
  assert.deepEqual(snapshot.log.inputs,expected,'source-owned complete native tuple matrix '+check.name+'/'+label);
 }
}

function assertCommandWitness(check,surface,mode){
 const rank=check.name==='rank.stable-identity',value=mode==='wrong-enter'?(rank?'open-file':'entry-01'):(rank?'option-file':'entry-40');
 const action=rank?(mode==='wrong-enter'?'open-command':'option-command'):'entry-command',wanted=paletteExpectedAction(surface,value,action),owner=paletteOwner(surface);
 for(const [label,snapshot] of [['down',check.raw.down],['after',check.raw.after]]){
  const log=snapshot.log,query=rank?'op':'Entry',button=mode==='focus-button',target=rank?'option-file':'entry-40';
  const native=e=>[e.targetTag,e.field,e.value,e.selectionStart,e.selectionEnd];
  assert.deepEqual(native(log.inputs[0]),button?['BUTTON',false,target,null,null]:['INPUT',true,query,query.length,query.length],'Enter down has source-owned query or selected-button target');
  if(label==='after')assert.deepEqual(native(log.inputs[1]),['BUTTON',false,'',null,null],'Enter up has source-owned opener target');
  for(const kind of ['actions','hosts']){
   assert.equal(log[kind].length,1,'positive command witness has exactly one '+kind);
   assert.deepEqual(payload(log[kind][0],surface),wanted,'source-owned actual '+kind+' payload');
   assert.equal(log[kind][0].slot,'primary','command owner slot');
  }
  assert.equal(log.hosts[0].generation,'original','actual host generation');
  assert.equal(log.results.length,1,'immediate fixture handler result is present by the awaited down snapshot');
  for(const result of log.results){assert.deepEqual(payload(result,surface),wanted,'source-owned actual result payload');assert.equal(result.slot,'primary');assert.deepEqual(result.result,{ok:true,owner,generation:'original'},'actual successful host result');}
  for(const kind of ['changes','hostChanges']){
   const changes=log[kind].filter(event=>event.name==='palette');assert.equal(changes.length,1,'positive selection change '+kind);
   const e=changes[0];assert.deepEqual({id:e.id,component:e.component,name:e.name,value:e.value,selected:e.selected,type:e.type,slot:e.slot},{id:owner,component:'navigation/CommandPalette',name:'palette',value,selected:true,type:null,slot:'primary'},'source-owned selection change');
   if(kind==='hostChanges')assert.equal(e.generation,'original');
  }
  assert.deepEqual(selected(snapshot.state),[value],'actual selected command value');
  assert.deepEqual([snapshot.state.open,snapshot.state.openerFocused],[false,true],'command completed closed with opener focus');
  for(const kind of ['hosts','actions'])assert.deepEqual(log[kind][0].state,check.raw.down.state,'callback state joins down observation');
  const relevant=log.timeline.filter(entry=>['hosts','actions','results'].includes(entry.kind)||['changes','hostChanges'].includes(entry.kind)&&log[entry.kind][entry.index].name==='palette').map(entry=>entry.kind);
  assert.deepEqual(relevant,['hosts','actions','hostChanges','changes',...log.results.map(()=>'results')],'source-owned callback/result order');
 }
 // The typed SDUI request is asynchronous. Its exact payload/target is checked
 // against the same source value; its bridge is not forced before native keyup.
 return {value,action};
}

// Fixed query profiles from the fixture labels and Commands group. Nonmatches
// follow the source label-length ordering; this table does not run production's
// matcher or learn the expected order from observed DOM/query values.
function queryProfile(query){
 const original=rows('primary').map(row=>row.value),entry=original.slice(5);
 const order=query===''?original:query==='op'?['open-file','option-file','disabled-open','other-place','zebra-file',...entry]:query==='opo'?['option-file','open-file','zebra-file',...entry,'other-place','disabled-open']:query==='Entry'?[...entry,'open-file','zebra-file','option-file','other-place','disabled-open']:null;
 assert(order,'source-owned finite query profile');
 const visible=query===''?original:query==='op'?['open-file','option-file','other-place','disabled-open']:query==='opo'?['option-file']:entry;
 return order.map(value=>({value,hidden:!visible.includes(value)}));
}
function chosenValue(rank,label,mode){
 if(label==='ready'||label==='opened')return 'open-file';
 if(label==='down'||label==='after')return mode==='wrong-enter'?(rank?'open-file':'entry-01'):(rank?'option-file':'entry-40');
 if(!rank)return label==='query'?'entry-01':steps[Number(label.slice(5))];
 return ['query','restored'].includes(label)&&!(mode==='focus-button'&&label==='restored')?'open-file':'option-file';
}
function assertSourceDOM(check,surface,mode){
 const rank=check.name==='rank.stable-identity',visited=new Set(['open-file']);
 for(const [label,snapshot]of snapshots(check)){
  const chosen=chosenValue(rank,label,mode);visited.add(chosen);
  for(const [slot,state]of [['primary',snapshot.state],['peer',snapshot.peer]]){
   const expected=rows(slot),seen=slot==='primary'?visited:new Set(['peer-open']);
   for(const row of state.rows){
    assert(expected.some(value=>value.value===row.value),'source-owned row value');
    const original=rowID(surface,row.value,slot),changed=seen.has(row.value);
    assert.equal(row.id,mode==='option-peer-id'&&changed?rowID(surface,'peer-open','peer'):original,'exact visited-row ID mutation');
    assert.equal(row.role,mode==='option-role'&&changed?'button':'option','exact visited-row role mutation');
   }
   const rel=state.relationship,owner=paletteOwner(surface,slot);
   assert.deepEqual([rel.inputID,rel.listID,rel.inputType,rel.inputRole],[owner+'-palette-query',owner+'-palette-results','search','searchbox'],'source input/list identity');
   assert.equal(rel.controls,mode==='controls-peer'?paletteOwner(surface,'peer')+'-palette-results':owner+'-palette-results','exact controls target');
   assert.equal(rel.listRole,mode==='list-role'?'group':'listbox','exact list role');
   let active=rowID(surface,slot==='peer'?'peer-open':chosen,slot);
   if(mode==='active-missing')active=null;
   if(mode==='active-peer'||mode==='option-peer-id')active=rowID(surface,'peer-open','peer');
   if(mode==='focus-button'&&slot==='primary'&&!['down','after'].includes(label))active=rowID(surface,!rank&&label!=='ready'&&label!=='opened'?'entry-01':'open-file');
   assert.equal(rel.activeID,active,'exact source-owned active reference signature');
  }
  assert.deepEqual(selected(snapshot.state),[chosen],'source-owned snapshot selection');
  const query=['ready','opened'].includes(label)?'':rank?(label==='refined'&&mode!=='focus-button'?'opo':label==='restored'&&mode!=='focus-button'?'':'op'):'Entry';
  assert.deepEqual([snapshot.state.query,snapshot.state.selectionStart,snapshot.state.selectionEnd,snapshot.state.open],[query,query.length,query.length,!['ready','down','after'].includes(label)],'source-owned query, caret and dialog state');
  assert.deepEqual(snapshot.state.rows.map(({value,hidden})=>({value,hidden})),queryProfile(query),'fixed source query filter/rank transition');
  assert.deepEqual(snapshot.peer.rows.map(({value,hidden,selected})=>({value,hidden,selected})),rows('peer').map((row,i)=>({value:row.value,hidden:false,selected:i===0})),'peer filter/order/selection remain source fixed');
  if(mode==='focus-button'){
   const query=['ready','opened'].includes(label)?'':rank?'op':'Entry';
   assert.deepEqual([snapshot.state.query,snapshot.state.selectionStart,snapshot.state.selectionEnd],[query,query.length,query.length],'focus-button retains unedited source query and caret');
   for(const event of snapshot.log.inputs)if(event.targetTag==='BUTTON')assert.deepEqual([event.field,event.data,event.inputType,event.selectionStart,event.selectionEnd],[false,null,null,null,null],'native button key has no input insertion or caret');
  }
  if(mode==='focus-button'&&!['ready','opened','query','down','after'].includes(label)){
   const state=snapshot.state;
   assert.deepEqual([state.focusedInput,state.activeTag,state.activeOwner,state.focusedInDialog],[false,'BUTTON',paletteOwner(surface),true],'focus-button owns visible option focus');
   const targets=state.rows.filter(row=>row.value===state.activeValue&&!row.hidden&&!row.disabled);assert.equal(targets.length,1,'focus-button targets an enabled visible source row');
   if(label==='arrow'||label==='reselected'||label.startsWith('step-'))assert.equal(state.activeValue,chosen,'arrow focus matches selected source option');
   for(const event of snapshot.log.inputs)if(event.targetTag==='BUTTON')assert(state.rows.some(row=>row.value===event.value&&!row.hidden&&!row.disabled),'native button target is an enabled visible source row');
   if(label==='arrow'||label==='reselected'||label.startsWith('step-')){
    const up=snapshot.log.inputs.at(-1);assert.deepEqual([up.type,up.targetTag,up.field,up.value,up.selectionStart,up.selectionEnd],['keyup','BUTTON',false,chosen,null,null],'arrow completion targets selected source button');
   }
  }
 }
}

function assertScrollWitness(check,mode){
 if(check.name!=='scroll.active-visible'||mode!=='no-scroll')return;
 const first=check.raw.query.geometry;
 const state=check.raw.query.state;let previous=null;
 for(const row of first.rows){
  const source=state.rows.find(value=>value.value===row.value);assert(source);
  assert(Math.abs(row.bottom-row.top-row.height)<1&&Math.abs(row.right-row.left-row.width)<1,'source-flow row rectangle is internally consistent');
  if(source.hidden)assert.deepEqual([row.width,row.height],[0,0],'hidden source row has no layout box');
  else{assert(row.width>0&&row.height>0,'visible source row has positive layout box');if(previous)assert(row.top>=previous.bottom-1,'visible rows retain fixed source flow order');previous=row;}
 }
 for(const snapshot of check.raw.steps){
  const geo=snapshot.geometry;
  if(mode==='no-scroll'){
   assert.equal(first.list.scrollTop,0,'fresh no-scroll query starts at list origin');
   assert.deepEqual(geo,first,'no-scroll keeps the complete source-joined geometry through every arrow');
  }
  // Layout is joined relationally, not pinned to incidental browser pixels.
  // Same query/order/fonts: each row's content coordinate is invariant while
  // the list scroll offset changes. Hidden rows retain zero-size geometry.
  assert.deepEqual(geo.input,first.input,'scroll witness retains input box');
  assert.deepEqual(geo.viewport,first.viewport,'scroll witness retains viewport');
  for(const key of Object.keys(first.list).filter(key=>key!=='scrollTop'))assert.equal(geo.list[key],first.list[key],'scroll witness fixed list box '+key);
  for(const row of geo.rows){
   const initial=first.rows.find(candidate=>candidate.value===row.value);assert(initial);
   for(const key of ['left','right','width','height'])assert.equal(row[key],initial[key],'scroll witness stable row '+key);
   for(const key of ['top','bottom'])assert.equal(row[key]+(row.height?geo.list.scrollTop:0),initial[key]+(initial.height?first.list.scrollTop:0),'scroll witness source content coordinate');
  }
 }
}

export function assertSupplementalPositiveWitnesses(report,surface,mode){
 for(const check of report.checks){
  assertSupplementalObservationJoins(check);assertNativeWitness(check,surface,mode);assertSourceDOM(check,surface,mode);assertScrollWitness(check,mode);
  const actual=assertCommandWitness(check,surface,mode);
  for(const request of report.requests.filter(request=>request.check===check.name&&request.path==='/sdui-action')){
   const fields=Object.fromEntries(request.fields);assert.deepEqual([fields.commandValue,fields.commandAction,fields.ownerID,fields._action,fields._target],[actual.value,actual.action,paletteOwner(surface),'command-observed','palette-primary-result'],'source-owned actual SDUI command route');
  }
 }
}

export function assertReentryObservationJoins(report){
 const raw=report.checks[0].raw,keys=raw.log.events.filter(event=>['keydown','keyup'].includes(event.phase));
 assert.deepEqual(keys.slice(0,4).map(event=>[event.phase,event.key,event.state.query,event.targetValue,event.state.focusedValue,event.targetToken]),[
  ['keydown','o','','','',raw.before.queryToken],['keyup','o','o','o','o',raw.before.queryToken],
  ['keydown','p','o','o','o',raw.before.queryToken],['keyup','p','op','op','op',raw.before.queryToken],
 ],'source-owned native query key progression');
 const query=raw.before.queryToken,open=raw.before.rows.find(row=>row.value==='open-file');
 assert.deepEqual(keys.slice(4).map(event=>[event.phase,event.key,event.targetTag,event.targetToken,event.targetValue]),[
  ['keydown','Tab','INPUT',query,'op'],['keyup','Tab','BUTTON',open.token,'open-file'],
  ['keydown','ArrowDown','BUTTON',open.token,'open-file'],['keyup','ArrowDown','INPUT',query,'op'],
 ],'source-owned native Tab and Arrow target progression');
 for(const state of [raw.before,raw.tab,raw.final,...raw.log.events.filter(event=>event.sequence>=keys[3].sequence).map(event=>event.state),...raw.log.batches.filter(batch=>batch.sequence>=keys[3].sequence).map(batch=>batch.state)])assert.equal(state.query,'op','post-typing reentry query is retained');
}
export function assertReentryPositiveWitnesses(report,surface,mode){
 assertReentryObservationJoins(report);
 const check=report.checks[0],raw=check.raw,owner=paletteOwner(surface),openID=owner+'-palette-option-0',optionID=owner+'-palette-option-1';
 const at=phase=>{const matches=raw.log.events.filter(event=>event.phase===phase);assert.equal(matches.length,1);return matches[0];};
 const returned=at('native-focus-return'),checkpoint=at('arrow-continuation-return');
 const open=returned.state.rows.find(row=>row.id===openID),fresh=returned.state.rows.find(row=>row.id===optionID);
 assert(open&&fresh);assert.deepEqual([returned.state.activeID,returned.state.activeToken],[openID,open.token],'focus-return exact retained Open reference');
 const expected={token:fresh.token,id:optionID,value:'option-file',role:'option',selected:'false',connected:true,inOwner:true,inList:true,hidden:false,disabled:false};
 const originalOption=raw.before.rows.find(row=>row.id===optionID);
 // These are the nodes that establish the advertised stale-reference proof.
 // Other passive node fields and selection-mutation history are diagnostics.
 const installed=at('installed'),drains=raw.log.batches.filter(batch=>batch.reason==='native-focus-return');
 assert.equal(drains.length,1,'one source focus-return drain');const drain=drains[0],oldRowToken=installed.state.oldRowToken;
 assert(at('htmx:before:swap').sequence<drain.sequence&&drain.sequence<returned.sequence,'replacement drain lies between before-swap and native focus return');
 const identity=row=>({token:row.token,id:row.id,value:row.value});
 const oldIdentity={token:originalOption.token,id:optionID,value:'option-file'};
 const credited=[installed,at('query-focus-listener'),at('pre-swap-microtask-scheduled'),at('ely:cleanup'),at('htmx:before:swap'),drain,returned,checkpoint];
 for(const entry of credited){
  const state=entry.state,replaced=entry.sequence>=drain.sequence;
  assert.deepEqual(identity(state.old),oldIdentity,'credited old Option retains original identity');
  assert.equal(state.oldRowToken,oldRowToken,'credited swap retains the installed LI identity');
  assert.deepEqual(identity(state.rows.find(row=>row.id===optionID)),replaced?identity(fresh):oldIdentity,'credited Option changes identity only at replacement drain');
  if(replaced){
   assert.deepEqual([state.old.connected,state.old.inOwner,state.old.inList],[false,false,false],'credited original Option is detached');
   assert.deepEqual(state.rows.find(row=>row.id===optionID),expected,'credited fresh Option is the same unselected replacement');
  }
 }
 const primaryTokens=[raw.before.ownerToken,raw.before.queryToken,open.token,originalOption.token,fresh.token,oldRowToken];
 assert.equal(new Set(primaryTokens).size,primaryTokens.length,'credited owner/query/option/LI identities are distinct');
 for(const peer of [raw.peerBefore,raw.peerAfter]){
  const peerTokens=[peer.openerToken,peer.ownerToken,peer.queryToken,...peer.rows.map(row=>row.token)];
  assert(primaryTokens.every(token=>!peerTokens.includes(token)),'credited primary identities cannot alias peer nodes');
 }
 for(const event of raw.log.events.filter(event=>event.phase.startsWith('htmx:')))
  assert(event.tasks.every(task=>task.targetToken===oldRowToken),'public swap tasks retain the installed LI identity');
 assert.deepEqual([returned.state.old.token,returned.state.old.id],[originalOption.token,optionID],'detached old Option is original source node');
 assert(!raw.before.rows.some(row=>row.token===fresh.token),'fresh Option has a new source-node token');
 for(const state of [raw.before,raw.tab,raw.final,...raw.log.events.map(event=>event.state),...raw.log.batches.map(batch=>batch.state)]){
  assert.deepEqual([state.ownerToken,state.queryToken],[raw.before.ownerToken,raw.before.queryToken],'all source witnesses retain owner and query');
  for(const row of state.rows.filter(row=>row.id!==optionID))assert.equal(row.token,raw.before.rows.find(original=>original.id===row.id).token,'unreplaced source option token is retained');
 }
 for(const event of raw.log.events.filter(event=>event.sequence>=returned.sequence))assert.equal(event.state.rows.find(row=>row.id===optionID).token,fresh.token,'post-swap fresh Option token is retained');
 for(const batch of raw.log.batches.filter(batch=>batch.sequence>=returned.sequence))assert.equal(batch.state.rows.find(row=>row.id===optionID).token,fresh.token,'post-swap batch retains fresh Option token');
 assert.deepEqual(fresh,expected,'source-owned fresh unselected Option identity');
 assert.deepEqual(checkpoint.state.rows.find(row=>row.id===optionID),expected,'queued checkpoint retains the exact fresh Option');
 assert.deepEqual([checkpoint.state.queryToken,checkpoint.state.ownerToken],[raw.before.queryToken,raw.before.ownerToken],'witness retains original query and owner');
 const between=check.writes.filter(write=>returned.sequence<write.batchSequence&&write.batchSequence<checkpoint.sequence);
 const remounted={...open,selected:'true'},remount=check.writes.at(-1),after=at('htmx:after:swap');
 assert.equal(check.writes.length,mode==='guard-removed'?2:1,'complete source active-write inventory');
 assert.deepEqual({oldValue:remount.oldValue,value:remount.value,queryToken:remount.queryToken,rows:remount.rows},{oldValue:mode==='guard-removed'?optionID:openID,value:openID,queryToken:raw.before.queryToken,rows:[remounted]},'exact remount active-write identity and selection');
 assert(after.sequence<remount.batchSequence,'remount write is observed after remount lifecycle and before final capture');
 assert.equal(raw.log.batches.find(batch=>batch.sequence===remount.batchSequence).state.ready,'true','remount write has ready owner');
 if(mode==='guard-removed'){
  assert.equal(between.length,1,'one exact stale write before queued checkpoint');const write=between[0];
  assert.deepEqual({oldValue:write.oldValue,value:write.value,queryToken:write.queryToken,rows:write.rows},{oldValue:openID,value:optionID,queryToken:raw.before.queryToken,rows:[expected]},'exact source-owned stale fresh-Option write');
  assert.deepEqual([checkpoint.state.activeID,checkpoint.state.activeToken],[optionID,fresh.token],'queued stale reference resolves exact fresh Option token');
 }else{
  assert.equal(mode,'control');assert.deepEqual(between,[],'guard control has no post-focus old-handler write');
  assert.deepEqual([checkpoint.state.activeID,checkpoint.state.activeToken],[openID,open.token],'guard control preserves retained reference');
 }
}
