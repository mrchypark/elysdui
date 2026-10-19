import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {paletteSourcePaths,paletteRequiredBrowserPaths,paletteErrors} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';
import {supplementalSourcePaths} from '../ui/gohtmx/tests/browser/palette-query-supplemental-inputs.mjs';
import {supplementalOracles,verifySupplementalEvidence,supplementalCases} from '../ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs';
import {supplementalMutation,supplementalModes,supplementalMutants} from '../ui/gohtmx/tests/browser/palette-query-supplemental-mutants.mjs';
// Pure synthetic validator tests, not browser or geometry evidence. Values and
// native sequences below are independently authored fixed fixture observations.
const copy=structuredClone,sha=x=>createHash('sha256').update(x).digest('hex');
const owner=(s,p='primary')=>s==='sdui'?'sdui-internal-'+sha(`palette-${p}-screen\0palette-${p}-component`):`palette-${p}-component`;
const rows=p=>[
 ['Open',p==='peer'?'peer-open':'open-file',false],['Option',p==='peer'?'peer-option':'option-file',false],['Other place',p==='peer'?'peer-other':'other-place',false],['Open disabled',p==='peer'?'peer-disabled':'disabled-open',true],['Zebra',p==='peer'?'peer-zebra':'zebra-file',false],
 ...Array.from({length:40},(_,i)=>[`Entry ${String(i+1).padStart(2,'0')}`,`${p==='peer'?'peer-':''}entry-${String(i+1).padStart(2,'0')}`,i===6])
];
function state(s,q='',chosen='open-file',open=true,p='primary'){
 let data=rows(p).map(([label,value,disabled],i)=>({id:owner(s,p)+'-palette-option-'+i,label,value,disabled,role:'option',hidden:q==='op'?!['Open','Option','Other place','Open disabled'].includes(label):q==='opo'?label!=='Option':q==='Entry'?!label.startsWith('Entry '):false,selected:value===(p==='peer'?'peer-open':chosen)}));
 if(q==='op')data=[data[0],data[1],data[3],data[2],...data.slice(4)];
 const active=data.find(row=>row.selected);
 return {id:owner(s,p),component:'navigation/CommandPalette',ready:'true',generation:'original',openerFocused:false,focusedInDialog:open,open,query:q,queryName:p==='primary'?'cmdQuery':'peerQuery',focusedInput:open,activeTag:open?'INPUT':'BODY',activeValue:open?q:null,activeOwner:open?owner(s,p):null,selectionStart:q.length,selectionEnd:q.length,rows:data,
 relationship:{inputID:owner(s,p)+'-palette-query',listID:owner(s,p)+'-palette-results',controls:owner(s,p)+'-palette-results',activeID:active.id,inputType:'search',inputRole:'searchbox',listRole:'listbox',controlledIsList:true,descendantInList:true,descendantInRoot:true,descendantRole:'option',descendantValue:chosen,descendantSelected:true,descendantVisibleEnabled:true,uniqueIDs:true}};
}
const log=()=>Object.fromEntries(['inputs','actions','changes','hosts','hostChanges','results','closes','lifecycle','bridge','errors','timeline'].map(k=>[k,[]]));
function record(l,k,v){l[k].push(copy(v));l.timeline.push({sequence:l.timeline.length+1,kind:k,index:l[k].length-1});}
function input(s,type,key,value,opt={}){return {type,key,code:key===null?null:key.length===1?'Key'+key.toUpperCase():key,data:null,inputType:null,trusted:true,targetTag:'INPUT',field:true,slot:'primary',ownerID:owner(s),generation:'original',value,focused:true,connected:true,selectionStart:value.length,selectionEnd:value.length,ctrl:false,alt:false,shift:false,meta:false,...opt};}
function pair(l,s,key,value,opt={}){for(const type of ['keydown','keyup'])record(l,'inputs',input(s,type,key,value,opt));}
function change(l,s,value,name='cmdQuery'){const e={id:owner(s),component:'navigation/CommandPalette',name,value,selected:name==='palette'?true:null,type:null,slot:'primary'};record(l,'hostChanges',{...e,generation:'original'});record(l,'changes',e);}
function typing(l,s,value,text){for(const char of text){record(l,'inputs',input(s,'keydown',char,value));record(l,'inputs',input(s,'beforeinput',null,value,{data:char,inputType:'insertText'}));value+=char;record(l,'inputs',input(s,'input',null,value,{data:char,inputType:'insertText'}));change(l,s,value);record(l,'inputs',input(s,'keyup',char,value));}}
const rect=(top,left,width,height)=>({top,left,width,height,bottom:top+height,right:left+width});
function geometry(st){const items=st.rows.filter(r=>!r.hidden),index=items.findIndex(r=>r.selected),scroll=Math.min(Math.max(0,index-4)*32,Math.max(0,items.length*32-240));return {inputID:st.relationship.inputID,listID:st.relationship.listID,viewport:{width:1280,height:900,scrollX:0,scrollY:0},input:rect(50,100,500,32),list:{...rect(100,100,500,240),scrollTop:scroll,scrollHeight:Math.max(240,items.length*32),clientHeight:240,clientWidth:500,clientTop:0,clientLeft:0},rows:st.rows.map(row=>({id:row.id,value:row.value,...(row.hidden?rect(0,0,0,0):rect(100+items.indexOf(row)*32-scroll,100,500,32))}))};}
function snap(s,q='',chosen='open-file',l=log(),open=true){const st=state(s,q,chosen,open),peer=state(s,'','peer-open',false,'peer');return {state:st,peer,log:copy(l),geometry:geometry(st),peerGeometry:geometry(peer)};}
function command(s,q,value,action){const l=log(),p={id:owner(s),component:'navigation/CommandPalette',action,value,hasValue:true,formDataKind:'null',formData:null,valuesKind:'array',values:[],submitter:null,slot:'primary'};
 record(l,'inputs',input(s,'keydown','Enter',q));change(l,s,value,'palette');const closed=snap(s,q,value,l,false);closed.state.openerFocused=true;closed.state.activeTag='BUTTON';closed.state.activeOwner=owner(s);
 record(l,'hosts',{...p,phase:'keydown',generation:'original',state:copy(closed.state)});record(l,'actions',{...p,phase:'keydown',state:copy(closed.state)});record(l,'results',{...p,result:{ok:true,owner:owner(s),generation:'original'}});record(l,'closes',{slot:'primary',ownerID:owner(s),open:false,trusted:true});const down={...copy(closed),log:copy(l)};
 record(l,'inputs',input(s,'keyup','Enter','',{targetTag:'BUTTON',field:false,selectionStart:null,selectionEnd:null}));if(s==='sdui')record(l,'bridge',{action:'command-observed',target:'palette-primary-result',status:200,connected:true});return {down,after:{...copy(closed),log:copy(l)}};
}
function raw(s,name){const rank=name==='rank.stable-identity',q=rank?'op':'Entry',setup=log();typing(setup,s,'',q);const r={ready:snap(s,'','open-file',log(),false),opened:snap(s),query:snap(s,q,rank?'open-file':'entry-01',setup)};
 if(rank){const nav=log();pair(nav,s,'ArrowDown','op');r.arrow=snap(s,'op','option-file',nav);typing(nav,s,'op','o');r.refined=snap(s,'opo','option-file',nav);
 const clear=log();record(clear,'inputs',input(s,'keydown','Control','opo',{ctrl:true}));pair(clear,s,'A','opo',{ctrl:true});record(clear,'inputs',input(s,'keyup','Control','opo'));record(clear,'inputs',input(s,'keydown','Backspace','opo',{selectionStart:0}));record(clear,'inputs',input(s,'beforeinput',null,'opo',{inputType:'deleteContentBackward',selectionStart:0}));record(clear,'inputs',input(s,'input',null,'',{inputType:'deleteContentBackward'}));change(clear,s,'');record(clear,'inputs',input(s,'keyup','Backspace',''));r.restored=snap(s,'','open-file',clear);const again=log();typing(again,s,'','op');pair(again,s,'ArrowDown','op');r.reselected=snap(s,'op','option-file',again);Object.assign(r,command(s,'op','option-file','option-command'));
 }else{const enabled=rows('primary').slice(5).filter(r=>!r[2]).map(r=>r[1]);let index=0;r.steps=[];for(const key of [...Array(28).fill('ArrowDown'),...Array(29).fill('ArrowUp')]){index=(index+(key==='ArrowDown'?1:enabled.length-1))%enabled.length;const l=log();pair(l,s,key,'Entry');r.steps.push(snap(s,'Entry',enabled[index],l));}Object.assign(r,command(s,'Entry','entry-40','entry-command'));}return r;
}
export function buildSupplementalSchemaFixture(surface='go-qualified'){
 const assets=Object.fromEntries([...new Set([...paletteRequiredBrowserPaths.filter(p=>p!=='/'),'/supplemental-observer.js','/assets/ely/fonts/Inter-Regular.ttf','/assets/ely/fonts/Inter-SemiBold.ttf',...(surface==='sdui'?['/assets/sdui.js','/assets/sdui.css']:[])])].map(path=>[path,{sourceSHA256:sha(path),servedSHA256:sha(path),bytes:100,contentType:'synthetic'}]));
 const fixtures=Object.fromEntries(['/','/fragment',...(surface==='sdui'?['/sdui-response-primary','/sdui-response-peer']:[])].map(path=>[path,{sourceSHA256:sha(path),servedSHA256:sha(path),bytes:100,html:'synthetic-fixture.html',renderer:'synthetic'}]));
 const trusted={surface,mode:'control',revision:'a'.repeat(40),tree:'b'.repeat(40),runToken:'synthetic-unique-token-'+surface,dirty:'',sourceFiles:Object.fromEntries([...paletteSourcePaths,...supplementalSourcePaths].map(p=>[p,sha(p)])),assets,fixtures,fixtureManifest:{syntheticOnly:true},standaloneDependencyProof:{SHA256:sha('deps'),forbiddenImports:[]},toolchain:{node:'synthetic',go:'synthetic',playwright:'synthetic'},mutation:{mode:'control',path:'/assets/ely-api-interaction.js',sourceSHA256:assets['/assets/ely-api-interaction.js'].sourceSHA256,servedSHA256:assets['/assets/ely-api-interaction.js'].servedSHA256,classification:'synthetic'}};
 const report={...copy(trusted),suite:'palette-query-supplemental',stage:'checks',caseInventory:['rank.stable-identity','scroll.active-visible'],checks:[],browserVersion:'synthetic',status:'passed',httpAssetProof:[],browserResponses:[],requests:[],...Object.fromEntries(paletteErrors.map(k=>[k,[]]))};
 const response=(path,check)=>{const f=assets[path]||fixtures[path];return {path,...(check?{check}:{}),status:200,expectedSHA256:f.servedSHA256,receivedSHA256:f.servedSHA256,bytes:f.bytes};};
 const request=(path,check)=>{const f=assets[path]||fixtures[path];return {path,check,method:'GET',htmx:null,status:200,responseSHA256:f.servedSHA256,responseBytes:f.bytes};};
 for(const path of [...Object.keys(assets),...Object.keys(fixtures)]){report.httpAssetProof.push(response(path));report.requests.push(request(path,null));}
 for(const name of report.caseInventory){const check={name,raw:raw(surface,name)};check.oracles=supplementalOracles(check,surface);check.status=check.oracles.every(o=>o.pass)?'passed':'failed';check.finalTrace=copy(check.raw.after.log);report.checks.push(check);
  for(const path of ['/',...Object.keys(assets)]){report.browserResponses.push(response(path,name));report.requests.push(request(path,name));}
  if(surface==='sdui'){const value=name==='rank.stable-identity'?'option-file':'entry-40',action=name==='rank.stable-identity'?'option-command':'entry-command',f=fixtures['/sdui-response-primary'];report.requests.push({path:'/sdui-action',check:name,method:'POST',htmx:null,status:200,responseSHA256:f.servedSHA256,responseBytes:f.bytes,responseFixture:'/sdui-response-primary',fields:Object.entries({_action:'command-observed',_csrf:'palette-query-fixture',_request:'synthetic-request-'+name,_target:'palette-primary-result',commandAction:action,commandValue:value,component:'navigation/CommandPalette',ownerID:owner(surface)})});report.browserResponses.push({check:name,path:'/sdui-action',responseFixture:'/sdui-response-primary',status:200,expectedSHA256:f.servedSHA256,receivedSHA256:f.servedSHA256,bytes:f.bytes});}
 }
 report.status=report.checks.every(c=>c.status==='passed')?'passed':'failed';return {report,trusted};
}
const refresh=report=>{for(const c of report.checks){c.oracles=supplementalOracles(c,report.surface);c.status=c.oracles.every(o=>o.pass)?'passed':'failed';c.finalTrace=copy(c.raw.after.log);}report.status=report.checks.every(c=>c.status==='passed')?'passed':'failed';};
async function main(){let rejected=0,red=0,causal=0;
 const runtime=await readFile(new URL('../ui/gohtmx/assets/ely-api-interaction.js',import.meta.url),'utf8');
 for(const surface of ['go-qualified','go-chapter','sdui']){
  const {report,trusted}=buildSupplementalSchemaFixture(surface);const bad=report.checks.flatMap(c=>c.oracles.filter(o=>!o.pass).map(o=>[c.name,o.id,o.observed,o.expected]));assert.deepEqual(bad,[]);verifySupplementalEvidence(report,trusted,0);
  const reject=(mutate,recompute=false)=>{const r=copy(report),t=copy(trusted);mutate(r,t);if(recompute)refresh(r);assert.throws(()=>verifySupplementalEvidence(r,t,r.status==='passed'?0:1));rejected++;};
  for(const key of ['revision','tree','runToken'])reject(r=>r[key]='foreign');reject(r=>r.sourceFiles[paletteSourcePaths[0]]=sha('changed'));reject(r=>r.mutation.mode='no-scroll');reject(r=>r.status='failed');reject(r=>r.caseInventory.reverse());reject(r=>r.checks.pop());reject(r=>r.checks.push(copy(r.checks[0])));reject(r=>r.checks[0].name='foreign');
  reject(r=>r.httpAssetProof.pop());reject(r=>r.httpAssetProof.push(copy(r.httpAssetProof[0])));reject(r=>r.browserResponses.pop());reject(r=>r.browserResponses.push(copy(r.browserResponses[0])));reject(r=>r.requests.push({...copy(r.requests[0]),path:'/foreign'}));reject(r=>r.browserResponses[0].receivedSHA256=sha('changed'));reject(r=>r.fixtures['/'].bytes++);
  for(const c of report.checks){
   const index=report.checks.indexOf(c);for(const key of Object.keys(c.raw))reject(r=>delete r.checks[index].raw[key]);reject(r=>r.checks[index].raw.foreign=copy(c.raw.query));reject(r=>r.checks[index].oracles.pop());reject(r=>r.checks[index].oracles.push(copy(c.oracles[0])));reject(r=>r.checks[index].oracles[0].expected='forged');reject(r=>r.checks[index].raw.query.log.inputs.reverse(),true);reject(r=>r.checks[index].raw.query.log.inputs[0].ownerID='foreign',true);reject(r=>r.checks[index].raw.query.geometry.list.height=NaN);reject(r=>r.checks[index].raw.query.state.rows[0].value='foreign',true);
  }
  reject(r=>r.checks[1].raw.steps.pop());reject(r=>r.checks[1].raw.steps.push(copy(r.checks[1].raw.steps[0])));reject(r=>{[r.checks[1].raw.steps[0],r.checks[1].raw.steps[1]]=[r.checks[1].raw.steps[1],r.checks[1].raw.steps[0]];});
  for(let i=0;i<57;i++)reject(r=>{r.checks[1].raw.steps[i].log.inputs[0].trusted=false;},true);
  for(const mutate of [r=>r.checks[0].raw.arrow.state.focusedInput=false,r=>r.checks[0].raw.query.state.relationship.activeID='foreign',r=>r.checks[0].raw.query.state.relationship.controls='peer',r=>r.checks[0].raw.query.state.rows[0].role='button',r=>r.checks[1].raw.steps[27].geometry.rows.find(x=>x.value==='entry-30').top=5000]){
   const r=copy(report);mutate(r);refresh(r);assert.equal(r.status,'failed');if(r.checks.some(c=>c.oracles.some(o=>o.prerequisite&&!o.pass))){assert.throws(()=>verifySupplementalEvidence(r,trusted,1));rejected++;}else{verifySupplementalEvidence(r,trusted,1);red++;}
  }

  for(const mode of supplementalModes.filter(m=>m!=='control')){
   const r=copy(report),t=copy(trusted),path='/assets/ely-api-interaction.js',sourceSHA256=sha(runtime),servedSHA256=sha(supplementalMutation(runtime,mode));
   t.mode=mode;t.assets[path]={...t.assets[path],sourceSHA256,servedSHA256,bytes:Buffer.byteLength(supplementalMutation(runtime,mode))};t.mutation={mode,path,sourceSHA256,servedSHA256,classification:'one-site causal control; expected raw red, never pass inversion'};
   r.mode=mode;r.assets=copy(t.assets);r.mutation=copy(t.mutation);
   for(const proof of [...r.httpAssetProof,...r.browserResponses])if(proof.path===path){proof.expectedSHA256=servedSHA256;proof.receivedSHA256=servedSHA256;proof.bytes=t.assets[path].bytes;}
   for(const req of r.requests)if(req.path===path){req.responseSHA256=servedSHA256;req.responseBytes=t.assets[path].bytes;}
   const q=r.checks[0].raw.query;
   if(mode==='focus-button'){r.checks[0].raw.arrow.state.focusedInput=false;r.checks[1].raw.steps[0].state.focusedInput=false;}
   if(mode==='active-missing')q.state.relationship.activeID=null;
   if(mode==='active-peer')q.state.relationship.activeID=q.peer.rows[0].id;
   if(mode==='option-peer-id'){q.state.rows[0].id=q.peer.rows[0].id;q.geometry.rows[0].id=q.peer.rows[0].id;}
   if(mode==='option-role')q.state.rows[0].role='button';
   if(mode==='list-role')q.state.relationship.listRole='group';
   if(mode==='controls-peer')q.state.relationship.controls=q.peer.relationship.listID;
   if(mode==='no-scroll')for(const i of [27,56]){const step=r.checks[1].raw.steps[i],v=i===27?'entry-30':'entry-40',row=step.geometry.rows.find(x=>x.value===v);row.top+=2000;row.bottom+=2000;}
   if(mode==='wrong-enter')for(const c of r.checks){const value=c.name==='rank.stable-identity'?'open-file':'entry-01',action=c.name==='rank.stable-identity'?'open-command':'entry-command';for(const snap of [c.raw.down,c.raw.after])for(const events of ['actions','hosts','results'])for(const e of snap.log[events]){e.value=value;e.action=action;}for(const req of r.requests.filter(x=>x.check===c.name&&x.path==='/sdui-action')){req.fields=req.fields.map(([k,v])=>[k,k==='commandValue'?value:k==='commandAction'?action:v]);}}
   refresh(r);const verdict=verifySupplementalEvidence(r,t,1);assert.deepEqual(verdict.causalKills,supplementalMutants[mode].kills);causal++;
   const forged=copy(r);forged.status='passed';assert.throws(()=>verifySupplementalEvidence(forged,t,0));rejected++;
  }
 }
 for(const mode of supplementalModes){const mutated=supplementalMutation(runtime,mode);assert.equal(mutated===runtime,mode==='control');if(mode!=='control')assert.throws(()=>supplementalMutation('',mode));}
 console.log(`Supplemental synthetic evidence schemas passed: 3 desired records, ${red} valid-red variants, ${causal} source-mutation schema records, ${rejected} corruptions rejected; no browser or geometry claim.`);
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await main();
