import {createHash} from 'node:crypto';
import {supplementalMutation} from '../ui/gohtmx/tests/browser/palette-query-supplemental-mutants.mjs';
import {supplementalOracles} from '../ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs';
// Synthetic producer only. These observations exercise validators; they are
// never browser evidence. Positive witnesses independently enforce the model.
const copy=structuredClone,sha=value=>createHash('sha256').update(value).digest('hex');
function reindex(log){log.timeline=log.timeline.map((entry,i)=>({...entry,sequence:i+1}));}
function removeKinds(log,kinds){for(const kind of kinds)log[kind]=[];log.timeline=log.timeline.filter(entry=>!kinds.includes(entry.kind));reindex(log);}
function keysOnly(log){const map=new Map();log.inputs=log.inputs.filter((event,i)=>{if(!['keydown','keyup'].includes(event.type))return false;map.set(i,map.size);return true;});log.timeline=log.timeline.filter(entry=>entry.kind!=='inputs'||map.has(entry.index)).map(entry=>entry.kind==='inputs'?{...entry,index:map.get(entry.index)}:entry);reindex(log);}
export function mutateSupplementalSchemaFixture(f,mode,runtime){
 const {report:r,trusted:t}=f,path='/assets/ely-api-interaction.js',served=supplementalMutation(runtime,mode);
 t.mode=mode;t.assets[path]={...t.assets[path],sourceSHA256:sha(runtime),servedSHA256:sha(served),bytes:Buffer.byteLength(served)};t.mutation={mode,path,sourceSHA256:sha(runtime),servedSHA256:sha(served),classification:'synthetic causal fixture'};r.mode=mode;r.assets=copy(t.assets);r.mutation=copy(t.mutation);
 for(const p of [...r.httpAssetProof,...r.browserResponses])if(p.path===path){p.expectedSHA256=p.receivedSHA256=sha(served);p.bytes=t.assets[path].bytes;}
 for(const p of r.requests)if(p.path===path){p.responseSHA256=sha(served);p.responseBytes=t.assets[path].bytes;}
 if(mode==='focus-button'){
  const rank=r.checks[0].raw,scroll=r.checks[1].raw;
  for(const s of [rank.arrow,rank.refined,rank.restored,rank.reselected,...scroll.steps]){
   s.state.focusedInput=false;s.state.activeTag='BUTTON';s.state.activeValue=s.state.rows.find(row=>row.selected).value;
  }
  for(const [i,s] of scroll.steps.entries())if(i>0)Object.assign(s.log.inputs[0],{targetTag:'BUTTON',field:false,value:scroll.steps[i-1].state.activeValue,selectionStart:null,selectionEnd:null});
  for(const s of [rank.arrow,...scroll.steps]){const e=s.log.inputs.at(-1);Object.assign(e,{targetTag:'BUTTON',field:false,value:s.state.activeValue,selectionStart:null,selectionEnd:null});}
  for(const label of ['refined','restored']){
   const s=rank[label];s.state.query='op';s.state.selectionStart=s.state.selectionEnd=2;s.state.rows=copy(rank.arrow.state.rows);s.geometry=copy(rank.arrow.geometry);s.state.activeValue='open-file';keysOnly(s.log);removeKinds(s.log,['changes','hostChanges']);
   for(const e of s.log.inputs)Object.assign(e,{targetTag:'BUTTON',field:false,value:'open-file',selectionStart:null,selectionEnd:null});
  }
  // The continued log contains the exact earlier Arrow snapshot prefix.
  rank.refined.log.inputs.splice(0,2,...copy(rank.arrow.log.inputs));rank.refined.log.inputs[2].value='option-file';
  keysOnly(rank.reselected.log);removeKinds(rank.reselected.log,['changes','hostChanges']);
  for(const e of rank.reselected.log.inputs)Object.assign(e,{targetTag:'BUTTON',field:false,value:'open-file',selectionStart:null,selectionEnd:null});
  rank.reselected.log.inputs.at(-1).value='option-file';
  for(const c of r.checks)for(const label of ['down','after']){const e=c.raw[label].log.inputs[0];Object.assign(e,{targetTag:'BUTTON',field:false,value:c.name==='rank.stable-identity'?'option-file':'entry-40',selectionStart:null,selectionEnd:null});}
 }
 if(mode==='wrong-enter')for(const c of r.checks){
  const value=c.name==='rank.stable-identity'?'open-file':'entry-01',action=c.name==='rank.stable-identity'?'open-command':'entry-command';
  for(const s of [c.raw.down,c.raw.after]){
   for(const k of ['actions','hosts','results'])for(const e of s.log[k]){e.value=value;e.action=action;}
   for(const k of ['changes','hostChanges'])for(const e of s.log[k].filter(e=>e.name==='palette'))e.value=value;
   for(const row of s.state.rows)row.selected=row.value===value;
  }
  for(const req of r.requests.filter(x=>x.check===c.name&&x.path==='/sdui-action'))req.fields=req.fields.map(([k,v])=>[k,k==='commandValue'?value:k==='commandAction'?action:v]);
 }
 for(const c of r.checks){
  const visited=new Set();
  for(const [label,value]of Object.entries(c.raw))for(const s of label==='steps'?value:[value]){
   visited.add(s.state.rows.find(row=>row.selected).value);
   for(const [slot,state]of [['primary',s.state],['peer',s.peer]]){
    const original=state.rows.find(row=>row.selected).id;
    if(mode==='active-missing')state.relationship.activeID=null;
    else if(mode==='active-peer'||mode==='option-peer-id')state.relationship.activeID=s.peer.rows[0].id;
    else if(mode==='focus-button'&&slot==='primary'&&!['down','after'].includes(label))state.relationship.activeID=state.rows.find(row=>row.value===(c.name==='scroll.active-visible'&&!['ready','opened'].includes(label)?'entry-01':'open-file')).id;
    else state.relationship.activeID=original;
    if(mode==='controls-peer')state.relationship.controls=s.peer.relationship.listID;
    if(mode==='list-role')state.relationship.listRole='group';
    for(const row of state.rows)if(slot==='primary'?visited.has(row.value):row.value==='peer-open'){
     if(mode==='option-role')row.role='button';
     if(mode==='option-peer-id'){const geo=slot==='primary'?s.geometry:s.peerGeometry;geo.rows.find(g=>g.value===row.value).id=s.peer.rows[0].id;row.id=s.peer.rows[0].id;}
    }
   }
  }
  for(const s of [c.raw.down,c.raw.after])for(const k of ['hosts','actions'])for(const e of s.log[k])e.state=copy(c.raw.down.state);
 }
 if(mode==='no-scroll')for(const s of r.checks[1].raw.steps)s.geometry=copy(r.checks[1].raw.query.geometry);
 for(const c of r.checks){c.oracles=supplementalOracles(c,r.surface);c.status=c.oracles.every(o=>o.pass)?'passed':'failed';c.finalTrace=copy(c.raw.after.log);}r.status=r.checks.every(c=>c.status==='passed')?'passed':'failed';return f;
}
