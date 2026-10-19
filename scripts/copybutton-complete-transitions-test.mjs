import assert from 'node:assert/strict';
import {createContext,runInContext} from 'node:vm';
import {performance} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {settleCopyAppearance} from '../ui/gohtmx/tests/browser/copybutton-complete-transitions.mjs';

// Offline synthetic DOM/animation objects only. These tests exercise the exact
// serialized observer and Node deadline; they are not real browser evidence.
function fixture() {
  const log=[],calls=[],nodes=new WeakMap();let next=0;
  const token=node=>node?(nodes.has(node)?nodes.get(node):(nodes.set(node,++next),next)):null;
  const make=(id,parent=null)=>({id,parentElement:parent,isConnected:true,animations:[],getBoundingClientRect(){calls.push(['layout',id]);return {};},getAnimations(options){calls.push(['animations',id,options]);return [...this.animations,...(options?.subtree?child.animations:[])];},querySelectorAll(){return [child];},closest(){return root;}});
  const theme=make('theme'),root=make('root',theme),control=make('control',root),child=make('child',control);
  class CSSTransition {
    constructor(target,{state='running',pseudo=''}={}) {
      this.playState=state;this.currentTime=0;this.transitionProperty='background-color';
      this.effect={target,pseudoElement:pseudo,getTiming:()=>({duration:150})};
      this.finished=new Promise((resolve,reject)=>{this.resolve=resolve;this.reject=reject;});
      target.animations.push(this);
      this.finish=()=>{this.playState='finished';target.animations=target.animations.filter(a=>a!==this);this.resolve();};
      this.cancel=()=>{this.playState='idle';target.animations=target.animations.filter(a=>a!==this);this.reject(Object.assign(new Error('Synthetic transition cancelled'),{name:'AbortError'}));};
    }
  }
  const context=createContext({CSSTransition,document:{querySelector:()=>control},getComputedStyle:(node,pseudo)=>{calls.push(['style',node.id,pseudo]);return {transitionProperty:'all'};},copyProbe:{token,record:(type,data)=>{log.push({type,...data});}},setTimeout:()=>{throw new Error('Browser clock must not be used');},requestAnimationFrame:()=>{throw new Error('Fake page rAF must not be used');}});
  const page={evaluate:(fn,arg)=>{context.argument=arg;return runInContext(`(${fn.toString()})(argument)`,context);}};
  return {page,log,calls,CSSTransition,control,child,root,theme};
}

export async function testCopyTransitions() {
  let probes=0;
  {
    const f=fixture(),started=performance.now();
    // An unfinished CSSAnimation-like object must not delay, mutate or erase
    // independent animationstart evidence.
    let animationAwaited=false;
    f.child.animations.push({playState:'running',get finished(){animationAwaited=true;throw new Error('Do not await CSSAnimation');}});
    f.log.push({type:'animation',event:'animationstart'});
    await settleCopyAppearance(f.page,'idle');
    assert(performance.now()-started>=15,'two empty observations have a real Node-time gap');
    assert.equal(animationAwaited,false);assert.equal(f.log[0].event,'animationstart');
    assert.deepEqual(f.log.slice(1).map(r=>r.phase),['observed','observed','settled']);
    for(const id of ['control','child','root','theme'])assert(f.calls.some(c=>c[0]==='layout'&&c[1]===id));
    assert(f.calls.some(c=>c[0]==='style'&&c[1]==='child'&&c[2]==='::after'));
    probes++;
  }
  for(const location of ['control','child','root','theme']) {
    const f=fixture(),transition=new f.CSSTransition(f[location],{pseudo:location==='child'?'::before':''});
    const timer=setTimeout(()=>transition.finish(),35);
    try {await settleCopyAppearance(f.page,'hover');}finally{clearTimeout(timer);}
    assert(f.log.some(r=>r.phase==='completed'&&r.transitions[0].outcome==='finished'));
    assert.equal(f.log.at(-1).phase,'settled');
    assert.equal(f.log.find(r=>r.phase==='observed').transitions[0].pseudo,location==='child'?'::before':'');
    probes++;
  }
  {
    const f=fixture(),old=new f.CSSTransition(f.control);let replacement,finish;
    const cancel=setTimeout(()=>{replacement=new f.CSSTransition(f.control);old.cancel();finish=setTimeout(()=>replacement.finish(),45);},5);
    try {await settleCopyAppearance(f.page,'pressed');}finally{clearTimeout(cancel);clearTimeout(finish);}
    const completed=f.log.filter(r=>r.phase==='completed');
    assert.deepEqual(completed.map(r=>r.transitions[0].outcome),['cancelled','finished']);
    assert.equal(completed[0].transitions[0].error.message,'Synthetic transition cancelled');
    assert.equal(f.log.at(-1).phase,'settled');probes++;
  }
  {
    const f=fixture();let finish;
    const start=setTimeout(()=>{const transition=new f.CSSTransition(f.control);finish=setTimeout(()=>transition.finish(),40);},5);
    try {await settleCopyAppearance(f.page,'focus');}finally{clearTimeout(start);clearTimeout(finish);}
    assert.equal(f.log[0].transitions.length,0);
    assert(f.log.some(r=>r.phase==='completed'),'transition created between empty samples must finish');
    assert.equal(f.log.at(-1).phase,'settled');probes++;
  }
  for(const state of ['running','paused']) {
    const f=fixture(),transition=new f.CSSTransition(f.control,{state}),started=performance.now();
    await assert.rejects(settleCopyAppearance(f.page,'focus',{timeoutMs:40}),/real CSS transition deadline exceeded/);
    assert(performance.now()-started<500,'real deadline bounds a frozen browser clock');
    assert.equal(f.log[0].transitions[0].playState,state);
    assert(!f.log.some(r=>r.phase==='settled'));
    transition.finish();await Promise.resolve();await Promise.resolve();
    assert(!f.log.some(r=>r.phase==='settled'),'late completion cannot resume timed-out Node observation');probes++;
  }
  {
    const f=fixture(),transition=new f.CSSTransition(f.control),failure=new Error('Unrelated animation failure');
    const timer=setTimeout(()=>transition.reject(failure),5);
    try {await assert.rejects(settleCopyAppearance(f.page,'idle'),error=>error===failure);}finally{clearTimeout(timer);}
    assert(!f.log.some(r=>r.phase==='settled'));probes++;
  }
  {
    const f=fixture(),error=new Error('Page evaluation failed');f.page.evaluate=()=>Promise.reject(error);
    await assert.rejects(settleCopyAppearance(f.page,'idle'),failure=>failure===error);probes++;
  }
  {
    const f=fixture();f.page.evaluate=()=>new Promise(()=>{});
    await assert.rejects(settleCopyAppearance(f.page,'idle',{timeoutMs:30}),/deadline exceeded/);probes++;
  }
  {
    const f=fixture(),timer=setTimeout(()=>{f.control.isConnected=false;},5);
    try {await assert.rejects(settleCopyAppearance(f.page,'hover'),/disconnected/);}finally{clearTimeout(timer);}
    assert(!f.log.some(r=>r.phase==='settled'));probes++;
  }
  for(const checkpoint of ['copied','before-deadline','deadline','replayed']) {
    const f=fixture();await assert.rejects(settleCopyAppearance(f.page,checkpoint),/appearance-only/);assert.equal(f.calls.length,0);probes++;
  }
  return {sourceOnly:true,classification:'synthetic transition observation and real Node deadlines only; no browser',transitionProbes:probes};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(await testCopyTransitions()));
