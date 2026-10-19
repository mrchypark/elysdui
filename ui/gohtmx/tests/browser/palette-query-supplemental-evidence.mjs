import assert from 'node:assert/strict';
import {verifyPaletteProductionPolicy} from './palette-query-production-policy.mjs';
import {isDeepStrictEqual as same} from 'node:util';
import {paletteOwner,paletteRows,paletteExpectedAction,paletteTyping,paletteRequiredBrowserPaths,paletteSurfaces,paletteErrors,paletteSourcePaths} from './palette-query-evidence.mjs';
import {supplementalSourcePaths} from './palette-query-supplemental-inputs.mjs';
import {supplementalModes,supplementalMutants} from './palette-query-supplemental-mutants.mjs';
import {assertSupplementalObservationJoins,assertSupplementalPositiveWitnesses} from './palette-query-positive-witnesses.mjs';
export const supplementalCases=()=>['rank.stable-identity','scroll.active-visible'];
export const supplementalReportName=(surface,mode)=>`palette-query-supplemental-${surface}-${mode}.json`;
export const supplementalRows=(slot='primary')=>[...paletteRows(slot),...Array.from({length:40},(_,i)=>({label:`Entry ${String(i+1).padStart(2,'0')}`,value:`${slot==='peer'?'peer-':''}entry-${String(i+1).padStart(2,'0')}`,disabled:i===6}))];
const entryValues=supplementalRows().slice(5).filter(r=>!r.disabled).map(r=>r.value);
export const supplementalSteps=()=>[...Array(28).fill('ArrowDown'),...Array(29).fill('ArrowUp')];
export const supplementalStepValues=()=>{let i=0;return supplementalSteps().map(key=>{i=(i+(key==='ArrowDown'?1:entryValues.length-1))%entryValues.length;return entryValues[i]});};
const logKeys=['inputs','actions','changes','hosts','hostChanges','results','closes','lifecycle','bridge','errors','timeline'];
const id=(surface,value,slot='primary')=>paletteOwner(surface,slot)+'-palette-option-'+supplementalRows(slot).findIndex(row=>row.value===value);
const keys=key=>['keydown','keyup'].map(type=>({type,key}));
const keyTrace=log=>log.inputs.filter(e=>['keydown','keyup'].includes(e.type)).map(({type,key})=>({type,key}));
const edit=e=>({type:e.type,key:e.key,data:e.data,inputType:e.inputType,value:e.value,start:e.selectionStart,end:e.selectionEnd,field:e.field,targetTag:e.targetTag});
const selected=state=>state.rows.filter(r=>r.selected).map(r=>r.value);
const visible=state=>state.rows.filter(r=>!r.hidden&&!r.disabled).map(r=>r.value);
const profile=rows=>rows.map(({label,value,disabled})=>({label,value,disabled})).sort((a,b)=>a.value.localeCompare(b.value));
const payload=e=>Object.fromEntries(Object.keys(paletteExpectedAction('go-qualified','','')).map(k=>[k,e[k]]));
const snapshots=check=>Object.entries(check.raw).flatMap(([key,value])=>key==='steps'?value.map((s,i)=>['step-'+i,s]):[[key,value]]);
export function assertSupplementalShape(check){
 const names=check.name==='rank.stable-identity'?['ready','opened','query','arrow','refined','restored','reselected','down','after']:['ready','opened','query','steps','down','after'];
 assert(supplementalCases().includes(check.name));assert.deepEqual(Object.keys(check.raw).sort(),names.sort(),'fixed raw snapshot inventory');
 if(check.name==='scroll.active-visible'){assert(Array.isArray(check.raw.steps));assert.equal(check.raw.steps.length,57,'fixed native step inventory');}
 for(const [,s] of snapshots(check)){
  assert.deepEqual(Object.keys(s).sort(),['geometry','log','peer','peerGeometry','state']);assert.deepEqual(Object.keys(s.log).sort(),[...logKeys].sort());
  const indexes=Object.fromEntries(logKeys.filter(k=>k!=='timeline').map(k=>[k,0]));
  for(const value of Object.values(s.log))assert(Array.isArray(value));
  s.log.timeline.forEach((e,i)=>{assert.deepEqual(Object.keys(e).sort(),['index','kind','sequence']);assert.equal(e.sequence,i+1);assert(Object.hasOwn(indexes,e.kind));assert.equal(e.index,indexes[e.kind]++);});
  for(const [k,n] of Object.entries(indexes))assert.equal(s.log[k].length,n,'complete event timeline');
  for(const geo of [s.geometry,s.peerGeometry]){
   assert.deepEqual(Object.keys(geo).sort(),['input','inputID','list','listID','rows','viewport']);assert.equal(geo.rows.length,45);
   for(const obj of [geo.input,geo.list,geo.viewport,...geo.rows])for(const [k,v]of Object.entries(obj))if(!['id','value'].includes(k))assert(Number.isFinite(v),'finite raw geometry');
   assert.deepEqual(Object.keys(geo.input).sort(),['top','bottom','left','right','width','height'].sort());
   assert.deepEqual(Object.keys(geo.list).sort(),['top','bottom','left','right','width','height','scrollTop','scrollHeight','clientHeight','clientTop','clientLeft','clientWidth'].sort());
   assert.deepEqual(Object.keys(geo.viewport).sort(),['width','height','scrollX','scrollY'].sort());
   for(const row of geo.rows)assert.deepEqual(Object.keys(row).sort(),['id','value','top','bottom','left','right','width','height'].sort());
  }
 }
}
export function supplementalOracles(check,surface){
 assert(paletteSurfaces.includes(surface));assertSupplementalShape(check);
 const out=[],r=check.raw,rank=check.name==='rank.stable-identity',prefix=rank?'rank':'scroll';
 const add=(name,observed,expected,prerequisite=false)=>out.push({id:name,observed,expected,pass:same(observed,expected),prerequisite});
 const noAction=(label,s)=>add(label+'.no-actions',[s.log.actions,s.log.hosts,s.log.results,s.log.bridge],[[],[],[],[]]);
 function state(label,s,query,chosen,shown){
  add(label+'.query',s.state.query,query);add(label+'.input-focus',s.state.focusedInput,true);
  add(label+'.input-target',{tag:s.state.activeTag,value:s.state.activeValue,owner:s.state.activeOwner,inDialog:s.state.focusedInDialog},{tag:'INPUT',value:query,owner:paletteOwner(surface),inDialog:true});
  add(label+'.caret',[s.state.selectionStart,s.state.selectionEnd],[query.length,query.length]);
  add(label+'.selected',selected(s.state),[chosen]);add(label+'.visible-enabled',visible(s.state),shown);
  const rel=s.state.relationship,rows=s.state.rows,target=rows.find(row=>row.id===rel.activeID);
  add(label+'.controlled-list',[rel.inputID,rel.listID,rel.controls,rel.inputType,rel.inputRole,rel.listRole],[paletteOwner(surface)+'-palette-query',paletteOwner(surface)+'-palette-results',paletteOwner(surface)+'-palette-results','search','searchbox','listbox']);
  add(label+'.active-local-selected',{activeID:rel.activeID,resolves:rows.filter(row=>row.id===rel.activeID).length,row:target?{value:target.value,selected:target.selected,hidden:target.hidden,disabled:target.disabled,role:target.role}:null},{activeID:id(surface,chosen),resolves:1,row:{value:chosen,selected:true,hidden:false,disabled:false,role:'option'}});
 }
 for(const [label,s]of snapshots(check)){
  const full=prefix+'.'+label;
  add(full+'.owner',{id:s.state.id,component:s.state.component,ready:s.state.ready,generation:s.state.generation,queryName:s.state.queryName},{id:paletteOwner(surface),component:'navigation/CommandPalette',ready:'true',generation:'original',queryName:'cmdQuery'},true);
  add(full+'.source-owned-rows',profile(s.state.rows),profile(supplementalRows()),true);
  add(full+'.source-owned-ids',s.state.rows.map(({value,id})=>({value,id})).sort((a,b)=>a.value.localeCompare(b.value)),supplementalRows().map(row=>({value:row.value,id:id(surface,row.value)})).sort((a,b)=>a.value.localeCompare(b.value)));
  add(full+'.raw-option-roles',s.state.rows.map(row=>row.role),Array(45).fill('option'));
  const peer=s.peer;
  add(full+'.peer-fixed-source',{id:peer.id,component:peer.component,generation:peer.generation,query:peer.query,open:peer.open,queryName:peer.queryName,rows:profile(peer.rows)},{id:paletteOwner(surface,'peer'),component:'navigation/CommandPalette',generation:'original',query:'',open:false,queryName:'peerQuery',rows:profile(supplementalRows('peer'))},true);
  add(full+'.peer-fixed-dom',peer.rows.map(({id,value,role,hidden,selected})=>({id,value,role,hidden,selected})),supplementalRows('peer').map((row,i)=>({id:id(surface,row.value,'peer'),value:row.value,role:'option',hidden:false,selected:i===0})));
  const primaryIDs=[s.state.relationship.inputID,s.state.relationship.listID,...s.state.rows.map(row=>row.id)],peerIDs=[peer.relationship.inputID,peer.relationship.listID,...peer.rows.map(row=>row.id)];
  add(full+'.unique-peer-ids',[...primaryIDs,...peerIDs].every(value=>typeof value==='string'&&value.length>0)&&new Set([...primaryIDs,...peerIDs]).size===94,true);
  add(full+'.native-owner',s.log.inputs.map(e=>({trusted:e.trusted,slot:e.slot,ownerID:e.ownerID,generation:e.generation,connected:e.connected,focused:e.focused,tag:['INPUT','BUTTON'].includes(e.targetTag),field:e.field===(e.targetTag==='INPUT')})),s.log.inputs.map(()=>({trusted:true,slot:'primary',ownerID:paletteOwner(surface),generation:'original',connected:true,focused:true,tag:true,field:true})),true);
  add(full+'.no-peer-callback',[...s.log.actions,...s.log.hosts,...s.log.hostChanges,...s.log.results].filter(e=>e.slot!=='primary'),[],true);
  add(full+'.no-runtime-error',s.log.errors,[],true);
  add(full+'.geometry-row-identity',s.geometry.rows.map(({id,value})=>({id,value})),s.state.rows.map(({id,value})=>({id,value})),true);
  add(full+'.viewport',[s.geometry.viewport.width,s.geometry.viewport.height,s.peerGeometry.viewport.width,s.peerGeometry.viewport.height],[1280,900,1280,900],true);
  add(full+'.peer-geometry-identity',s.peerGeometry.rows.map(({id,value})=>({id,value})),s.peer.rows.map(({id,value})=>({id,value})),true);
  add(full+'.plain-key-modifiers',s.log.inputs.map(e=>[e.ctrl,e.alt,e.shift,e.meta]),s.log.inputs.map(e=>[label==='restored'&&e.key==='Control'&&e.type==='keydown'||label==='restored'&&e.key==='A',false,false,false]),true);
  add(full+'.peer-geometry-owner',[s.peerGeometry.inputID,s.peerGeometry.listID],[s.peer.relationship.inputID,s.peer.relationship.listID],true);
  add(full+'.geometry-owner',[s.geometry.inputID,s.geometry.listID],[s.state.relationship.inputID,s.state.relationship.listID],true);
 }
 add(prefix+'.ready.closed',r.ready.state.open,false,true);add(prefix+'.opened.native-focus',[r.opened.state.open,r.opened.state.focusedInput],[true,true],true);
 for(const label of ['ready','opened']) { const snap=r[label];add(prefix+'.'+label+'.fixed-setup',{query:snap.state.query,selected:selected(snap.state),visible:visible(snap.state)},{query:'',selected:['open-file'],visible:supplementalRows().filter(row=>!row.disabled).map(row=>row.value)},true);add(prefix+'.'+label+'.no-native-keys',snap.log.inputs,[],true);noAction(prefix+'.'+label,snap);}
 const query=rank?'op':'Entry';add(prefix+'.query.native-typing',r.query.log.inputs.map(edit),paletteTyping(query),true);
 add(prefix+'.query.no-modifiers',r.query.log.inputs.map(e=>[e.ctrl,e.alt,e.shift,e.meta]),r.query.log.inputs.map(()=>[false,false,false,false]),true);
 state(prefix+'.query',r.query,query,rank?'open-file':'entry-01',rank?['open-file','option-file','other-place']:entryValues);noAction(prefix+'.query',r.query);
 const queryPayload=value=>({id:paletteOwner(surface),component:'navigation/CommandPalette',name:'cmdQuery',value});
 for(const field of ['changes','hostChanges'])add(prefix+'.query.'+field,r.query.log[field].filter(e=>e.name==='cmdQuery').map(({id,component,name,value})=>({id,component,name,value})).at(-1),queryPayload(query),true);
 if(rank){
  add('rank.opened.source-order',r.opened.state.rows.map(row=>row.value),supplementalRows().map(row=>row.value),true);
  add('rank.query.ranked-order',r.query.state.rows.filter(row=>!row.hidden).map(row=>row.value),['open-file','option-file','disabled-open','other-place']);
  add('rank.arrow.native-key',keyTrace(r.arrow.log),keys('ArrowDown'),true);
  state('rank.arrow',r.arrow,'op','option-file',['open-file','option-file','other-place']);noAction('rank.arrow',r.arrow);
  add('rank.arrow.native-input-target',r.arrow.log.inputs.map(e=>[e.targetTag,e.field,e.value,e.selectionStart,e.selectionEnd]),[['INPUT',true,'op',2,2],['INPUT',true,'op',2,2]]);
  add('rank.refined.native-key-sequence',keyTrace(r.refined.log),[...keys('ArrowDown'),...keys('o')],true);
  add('rank.refined.native-insertion',r.refined.log.inputs.slice(2).map(edit),paletteTyping('o','op'));
  state('rank.refined',r.refined,'opo','option-file',['option-file']);noAction('rank.refined',r.refined);
  add('rank.restored.native-clear-keys',keyTrace(r.restored.log),[{type:'keydown',key:'Control'},...keys('A'),{type:'keyup',key:'Control'},...keys('Backspace')],true);
  add('rank.restored.native-delete',r.restored.log.inputs.filter(e=>['beforeinput','input'].includes(e.type)).map(({type,inputType,data,value,selectionStart,selectionEnd,field,targetTag})=>({type,inputType,data,value,selectionStart,selectionEnd,field,targetTag})),[{type:'beforeinput',inputType:'deleteContentBackward',data:null,value:'opo',selectionStart:0,selectionEnd:3,field:true,targetTag:'INPUT'},{type:'input',inputType:'deleteContentBackward',data:null,value:'',selectionStart:0,selectionEnd:0,field:true,targetTag:'INPUT'}]);
  state('rank.restored',r.restored,'','open-file',supplementalRows().filter(row=>!row.disabled).map(row=>row.value));
  add('rank.restored.source-order',r.restored.state.rows.map(row=>row.value),supplementalRows().map(row=>row.value));noAction('rank.restored',r.restored);
  add('rank.reselected.native-keys',keyTrace(r.reselected.log),[...keys('o'),...keys('p'),...keys('ArrowDown')],true);
  add('rank.reselected.native-typing',r.reselected.log.inputs.slice(0,8).map(edit),paletteTyping('op'));
  state('rank.reselected',r.reselected,'op','option-file',['open-file','option-file','other-place']);noAction('rank.reselected',r.reselected);
 } else {
  const values=supplementalStepValues();
  add('scroll.query.overflow',r.query.geometry.list.scrollHeight>r.query.geometry.list.clientHeight&&r.query.geometry.list.clientHeight>40,true,true);
  const initialTarget=r.query.geometry.rows.find(row=>row.value==='entry-30'),list=r.query.geometry.list;
  add('scroll.query.target-originally-below',initialTarget.top>=list.top+list.clientTop+list.clientHeight,true,true);
  r.steps.forEach((s,i)=>{
   const label='scroll.step-'+i;add(label+'.native-key',keyTrace(s.log),keys(supplementalSteps()[i]),true);state(label,s,'Entry',values[i],entryValues);noAction(label,s);add(label+'.native-input-target',s.log.inputs.map(e=>[e.targetTag,e.field,e.value,e.selectionStart,e.selectionEnd]),[['INPUT',true,'Entry',5,5],['INPUT',true,'Entry',5,5]]);
   const g=s.geometry,l=g.list,row=g.rows.find(row=>row.value===values[i]),v=g.viewport;
   const epsilon=1;const finiteBox=x=>x.width>0&&x.height>0&&Math.abs(x.bottom-x.top-x.height)<epsilon&&Math.abs(x.right-x.left-x.width)<epsilon;
   add(label+'.geometry-valid',finiteBox(l)&&finiteBox(row)&&finiteBox(g.input)&&l.clientHeight>0&&l.clientHeight<=l.height+epsilon&&l.scrollTop>=0&&l.scrollTop<=l.scrollHeight-l.clientHeight+epsilon,true,true);
   add(label+'.selected-inside-list',row.top>=l.top+l.clientTop-epsilon&&row.bottom<=l.top+l.clientTop+l.clientHeight+epsilon&&row.left>=l.left+l.clientLeft-epsilon&&row.right<=l.left+l.clientLeft+l.clientWidth+epsilon,true);
   add(label+'.selected-inside-viewport',row.top>=0&&row.bottom<=v.height&&row.left>=0&&row.right<=v.width,true);
   add(label+'.input-still-visible',g.input.top>=0&&g.input.bottom<=v.height&&g.input.left>=0&&g.input.right<=v.width,true);
   add(label+'.page-not-scrolled',[v.scrollX,v.scrollY],[r.query.geometry.viewport.scrollX,r.query.geometry.viewport.scrollY]);
  });
  add('scroll.step-27.list-moved',r.steps[27].geometry.list.scrollTop>r.query.geometry.list.scrollTop,true);
  add('scroll.step-56.wrap-target',selected(r.steps[56].state),['entry-40']);
 }
 const value=rank?'option-file':'entry-40',action=rank?'option-command':'entry-command',wanted=paletteExpectedAction(surface,value,action);
 add(prefix+'.enter.native-key',keyTrace(r.after.log),keys('Enter'),true);
 add(prefix+'.enter.down-payload',r.down.log.actions.map(payload),[wanted]);add(prefix+'.enter.completed-payload',r.after.log.actions.map(payload),[wanted]);
 add(prefix+'.enter.host-payload',r.after.log.hosts.map(payload),[wanted]);
 add(prefix+'.enter.host-generation',r.after.log.hosts.map(e=>e.generation),['original']);
 add(prefix+'.enter.host-result',r.after.log.results.map(e=>({...payload(e),result:e.result})),[{...wanted,result:{ok:true,owner:paletteOwner(surface),generation:'original'}}]);
 add(prefix+'.enter.selection-change',r.after.log.changes.filter(e=>e.name==='palette').map(({id,component,name,value,selected})=>({id,component,name,value,selected})),[{id:paletteOwner(surface),component:'navigation/CommandPalette',name:'palette',value,selected:true}]);
 add(prefix+'.enter.closed-and-opener',[r.down.state.open,r.after.state.open,r.after.state.openerFocused],[false,false,true]);
 add(prefix+'.enter.phase',r.after.log.hosts.map(e=>e.phase),['keydown']);
 add(prefix+'.enter.bridge',r.after.log.bridge,surface==='sdui'?[{action:'command-observed',target:'palette-primary-result',status:200,connected:true}]:[]);
 return out;
}
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
export function verifySupplementalEvidence(report,trusted,exitCode){
  verifyPaletteProductionPolicy(report, trusted);
 const {surface,mode,revision,tree,runToken,assets,fixtures}=trusted;
 assert(paletteSurfaces.includes(surface));assert(supplementalModes.includes(mode));assert.equal(report.suite,'palette-query-supplemental');assert.equal(report.stage,'checks');
 for(const [k,v]of Object.entries({surface,mode,revision,tree,runToken}))assert.equal(report[k],v,'independent '+k);
 assert(/^[a-f0-9]{40}$/.test(revision));assert(/^[a-f0-9]{40}$/.test(tree));assert(typeof runToken==='string'&&runToken.length>10);assert.equal(report.dirty,'');assert.equal(report.error,undefined);assert.equal(report.validationError,undefined);
 assert.deepEqual(Object.keys(trusted.sourceFiles),[...paletteSourcePaths,...supplementalSourcePaths]);
 for(const key of ['sourceFiles','assets','fixtures','fixtureManifest','standaloneDependencyProof','toolchain','mutation'])assert.deepEqual(report[key],trusted[key],key+' independently loaded');
 for(const value of Object.values(report.sourceFiles))assert(hash(value));for(const entry of Object.values({...assets,...fixtures})){assert(hash(entry.sourceSHA256));assert(hash(entry.servedSHA256));assert(entry.bytes>0);}
 for(const key of paletteErrors)assert.deepEqual(report[key],[],key+' cannot become desired red');
 const inventory=supplementalCases();assert.deepEqual(report.caseInventory,inventory);assert.deepEqual(report.checks.map(c=>c.name),inventory);assert(typeof report.browserVersion==='string'&&report.browserVersion);
 const paths=[...Object.keys(assets),...Object.keys(fixtures)];assert.deepEqual(report.httpAssetProof.map(p=>p.path),paths);
 assert.deepEqual(report.requests.filter(p=>p.check===null).map(p=>p.path),paths,'exact independent HTTP request inventory');
 const browserPaths=[...paletteRequiredBrowserPaths,'/supplemental-observer.js','/assets/ely/fonts/Inter-Regular.ttf','/assets/ely/fonts/Inter-SemiBold.ttf',...(surface==='sdui'?['/assets/sdui.js','/assets/sdui.css']:[])];
 for(const proofs of [report.requests,report.browserResponses]){
  const unique=proofs.filter(p=>p.path!=='/sdui-action').map(p=>p.check+':'+p.path);assert.equal(new Set(unique).size,unique.length,'no duplicate request/response proof');
 }
 for(const req of report.requests){
  assert(req.check===null||inventory.includes(req.check));assert.equal(req.htmx,null,'supplemental uses native static loads and typed SDUI fetch only');assert(Object.hasOwn(assets,req.path)||Object.hasOwn(fixtures,req.path)||surface==='sdui'&&req.path==='/sdui-action');
  assert.equal(Object.hasOwn(req,'responseFixture'),req.path==='/sdui-action');const entry=assets[req.path]||fixtures[req.responseFixture||req.path];assert(entry);assert.equal(req.status,200);assert.equal(req.responseSHA256,entry.servedSHA256);assert.equal(req.responseBytes,entry.bytes);assert.equal(req.method,req.path==='/sdui-action'?'POST':'GET');
  if(req.path==='/sdui-action'){assert(inventory.includes(req.check));assert.equal(req.responseFixture,'/sdui-response-primary');}else if(req.path==='/fragment')assert.equal(req.check,null,'no synthetic/redundant replacement in supplemental');
 }
 for(const proof of [...report.httpAssetProof,...report.browserResponses]){
  assert(Object.hasOwn(assets,proof.path)||Object.hasOwn(fixtures,proof.path)||surface==='sdui'&&proof.path==='/sdui-action');assert.equal(Object.hasOwn(proof,'responseFixture'),proof.path==='/sdui-action');const entry=assets[proof.path]||fixtures[proof.responseFixture||proof.path];assert(entry);assert.equal(proof.status,200);assert.equal(proof.expectedSHA256,entry.servedSHA256);assert.equal(proof.receivedSHA256,entry.servedSHA256);assert.equal(proof.bytes,entry.bytes);if(Object.hasOwn(proof,'check'))assert(inventory.includes(proof.check));
 }
 for(const check of report.checks){
  assert.equal(check.error,undefined);assert.equal(check.captureError,undefined);assert.deepEqual(check.finalTrace,check.raw.after.log);const computed=supplementalOracles(check,surface);assert.deepEqual(check.oracles,computed,'recompute fixed oracles from raw');for(const o of computed)if(o.prerequisite)assert(o.pass,check.name+'/'+o.id+' prerequisite');assert.equal(check.status,computed.every(o=>o.pass)?'passed':'failed');
  assert.deepEqual(report.browserResponses.filter(p=>p.check===check.name&&p.path!=='/sdui-action').map(p=>p.path).sort(),[...browserPaths].sort(),'exact case browser response paths');
  assert.deepEqual(report.requests.filter(p=>p.check===check.name&&p.path!=='/sdui-action').map(p=>p.path).sort(),[...browserPaths].sort(),'exact case browser request paths');
  for(const path of browserPaths)assert.equal(report.browserResponses.filter(p=>p.check===check.name&&p.path===path).length,1,'required browser bytes '+path);
  const requests=report.requests.filter(p=>p.check===check.name&&p.path==='/sdui-action');const expectedValue=check.name==='rank.stable-identity'?'option-file':'entry-40';assert.equal(requests.length,surface==='sdui'?1:0);assert.equal(report.browserResponses.filter(p=>p.check===check.name&&p.path==='/sdui-action').length,surface==='sdui'?1:0);
  for(const req of requests){const fields=Object.fromEntries(req.fields);assert.equal(Object.keys(fields).length,req.fields.length);assert.deepEqual(Object.keys(fields).sort(),['_action','_csrf','_request','_target','commandAction','commandValue','component','ownerID'].sort());assert.equal(fields._action,'command-observed');assert.equal(fields._csrf,'palette-query-fixture');assert.equal(fields._target,'palette-primary-result');assert.equal(fields.component,'navigation/CommandPalette');assert.equal(fields.ownerID,paletteOwner(surface));assert(typeof fields._request==='string'&&fields._request.length>10);
   // Transport must match the actual captured command even for a wrong-payload
   // causal control. Desired payload remains independently source-fixed above.
   assert.equal(fields.commandValue,check.raw.after.log.actions[0]?.value);assert.equal(fields.commandAction,check.raw.after.log.actions[0]?.action);
  }
 }
 for(const check of report.checks)assertSupplementalObservationJoins(check);
 if(mode!=='control')assertSupplementalPositiveWitnesses(report,surface,mode);
 const status=report.checks.every(c=>c.status==='passed')?'passed':'failed';assert.equal(report.status,status);assert.equal(exitCode,status==='passed'?0:1,'retain raw nonzero');
 const causalKills=mode==='control'?[]:supplementalMutants[mode].kills.filter(id=>report.checks.some(c=>c.oracles.some(o=>o.id===id&&!o.pass)));
 if(mode!=='control'){assert.equal(status,'failed','causal mutant must retain raw failure');assert.deepEqual(causalKills,supplementalMutants[mode].kills,'every designated source-owned causal kill required');}
 return {productionPolicy:trusted.productionPolicy,status,surface,mode,revision,tree,failed:report.checks.filter(c=>c.status==='failed').map(c=>c.name),causalKills};
}
