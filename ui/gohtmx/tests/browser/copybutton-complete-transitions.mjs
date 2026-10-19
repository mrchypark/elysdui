import assert from 'node:assert/strict';
import {copyTransitionCheckpoints} from './copybutton-complete-cases.mjs';

// Serialized into the page. Only CSS transitions on this physical control,
// its visual descendants/pseudos, associated tooltip and containing theme surfaces
// are relevant. Unrelated controls and siblings are never awaited.
// CSSAnimation objects (including the check entrance) are never awaited.
export async function sampleCopyTransitions({checkpoint, binding, confirm}) {
  const control=document.querySelector('#copy-a [data-interaction-copy]');
  const root=control?.closest('[data-ely-family]');
  if(!control?.isConnected||!root?.isConnected)throw new Error('Appearance control is disconnected');
  if(typeof CSSTransition!=='function')throw new Error('CSSTransition observation is unavailable');
  const tooltip=control.nextElementSibling?.matches('[data-interaction-copy-tooltip]')?control.nextElementSibling:null;
  const identity={control:copyProbe.token(control),root:copyProbe.token(root)};
  const tooltipToken=copyProbe.token(tooltip);
  if(binding&&(binding.control!==identity.control||binding.root!==identity.root||binding.tooltip!==tooltipToken))throw new Error('Appearance control or tooltip changed during transition observation');
  const visuals=[control,...control.querySelectorAll('*'),...(tooltip?[tooltip,...tooltip.querySelectorAll('*')]:[])];
  const ancestors=[];for(let node=control.parentElement;node;node=node.parentElement)ancestors.push(node);
  for(const node of [...visuals,...ancestors]) {
    node.getBoundingClientRect();
    for(const pseudo of [null,'::before','::after'])getComputedStyle(node,pseudo).transitionProperty;
  }
  const transitions=[...new Set([...control.getAnimations({subtree:true}),...(tooltip?tooltip.getAnimations({subtree:true}):[]),...ancestors.flatMap(node=>node.getAnimations())])]
    .filter(animation=>animation instanceof CSSTransition&&animation.playState!=='finished');
  const describe=animation=>({target:copyProbe.token(animation.effect?.target),pseudo:animation.effect?.pseudoElement||'',property:animation.transitionProperty,playState:animation.playState,currentTime:animation.currentTime,duration:animation.effect?.getTiming().duration??null,outcome:null,error:null});
  const observed=transitions.map(describe);
  const record=(phase,transitions)=>copyProbe.record('operation',{name:'appearance-transitions',checkpoint,...identity,phase,transitions});
  record('observed',observed);
  if(!transitions.length) {
    // confirm follows an empty observation and a real Node-time frame window.
    if(confirm)record('settled',[]);
    return {...identity,tooltip:tooltipToken,empty:true,settled:confirm};
  }
  const completed=await Promise.all(transitions.map(async(animation,index)=>{
    try {await animation.finished;return {...observed[index],outcome:'finished'};}
    catch(error) {
      // Cancellation can create a replacement transition. Retain its diagnostic
      // and re-observe; all other failures propagate to the raw harness errors.
      if(error?.name!=='AbortError')throw error;
      return {...observed[index],outcome:'cancelled',error:{name:error.name,message:error.message}};
    }
  }));
  record('completed',completed);
  return {...identity,tooltip:tooltipToken,empty:false,settled:false};
}

export async function settleCopyAppearance(page, checkpoint, {timeoutMs=5000,caseID='appearance-light'}={}) {
  assert(copyTransitionCheckpoints(caseID).includes(checkpoint),'source-owned presentation transition checkpoint');
  assert(Number.isFinite(timeoutMs)&&timeoutMs>0,'bounded transition deadline');
  let deadline,frame,binding=null,confirm=false;
  const expired=new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error(`Appearance ${checkpoint} real CSS transition deadline exceeded (${timeoutMs}ms)`)),timeoutMs);});
  try {
    for(;;) {
      const sample=await Promise.race([page.evaluate(sampleCopyTransitions,{checkpoint,binding,confirm}),expired]);
      binding??={control:sample.control,root:sample.root,tooltip:sample.tooltip};
      if(sample.settled)return sample;
      confirm=sample.empty;
      // page.clock also controls page rAF/timers. A Node timer supplies a real
      // render opportunity, then layout and actual .finished are checked again.
      await Promise.race([new Promise(resolve=>{frame=setTimeout(resolve,20);}),expired]);
    }
  } finally {clearTimeout(deadline);clearTimeout(frame);}
}
