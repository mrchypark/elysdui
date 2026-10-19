import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
// Whole production core; these event doubles establish lifecycle logic only.
const source = readFileSync(new URL('../../assets/ely-api.js', import.meta.url), 'utf8');
class Event {
 constructor(type, options={}) { Object.assign(this,{type,bubbles:false,defaultPrevented:false},options); }
 preventDefault(){this.defaultPrevented=true;} stopImmediatePropagation(){this.stopped=true;}
}
class Element {
 constructor(id, parent=null, family=null){this.id=id;this.parentElement=parent;this.children=[];this.dataset=family?{elyFamily:family}:{};this.listeners=new Map();this.disabled=false;this.value='';this.type='button';this.attrs={};parent?.children.push(this);}
 get isConnected(){return this.documentRoot||!!this.parentElement?.isConnected;}
 matches(s){return s==='[data-ely-family]'?this.dataset.elyFamily!==undefined:s==='[data-ely-submit]'?this.dataset.elySubmit!==undefined:s==='[data-ely-action]'?this.dataset.elyAction!==undefined:false;}
 closest(s){return this.matches(s)?this:this.parentElement?.closest(s)||null;}
 querySelectorAll(s){return this.children.flatMap(n=>[...(n.matches(s)?[n]:[]),...n.querySelectorAll(s)]);}
 contains(n){return n===this||this.children.some(c=>c.contains(n));}
 getAttribute(k){return this.attrs[k]??null;}
 addEventListener(t,fn){if(!this.listeners.has(t))this.listeners.set(t,new Set());this.listeners.get(t).add(fn);}
 removeEventListener(t,fn){this.listeners.get(t)?.delete(fn);}
 dispatchEvent(e){e.target||=this;for(const fn of [...this.listeners.get(e.type)||[]])if(this.listeners.get(e.type)?.has(fn)&&!e.stopped)fn(e);if(e.bubbles&&!e.stopped)this.parentElement?.dispatchEvent(e);return !e.defaultPrevented;}
}
function harness(runtime=source){
 const document=new Element('document');document.documentRoot=true;document.documentElement=document;
 const root=new Element('root',document,'test');root.dataset.elyComponent='test/Owner';
 let prune;const sandbox={document,Element,CustomEvent:Event,FormData:class{constructor(form){this.fields=form.fields;form.onFormData?.();}*[Symbol.iterator](){yield*this.fields;}},MutationObserver:class{constructor(fn){prune=fn;}observe(){}}};
 runInNewContext(runtime.replaceAll('export function ','function ')+'\nglobalThis.api={register,mount,emit};',sandbox);
 const stop=()=>{const ctx={};document.dispatchEvent(new Event('htmx:before:swap',{detail:{ctx,tasks:[{target:root,swapSpec:{style:'innerHTML'}}]}}));return ctx;};
 const start=ctx=>document.dispatchEvent(new Event('htmx:after:swap',{detail:{ctx}}));
 return {document,root,...sandbox.api,stop,start,prune:()=>prune()};
}
function run(runtime=source){
 const h=harness(runtime),contexts=[],registers=[];let returned=0;
 h.register('test',(root,cleanup,context)=>{assert.equal(root,h.root);registers.push(cleanup);contexts.push(context);return()=>returned++;});
 assert(Object.isFrozen(contexts[0]),'private owner context is frozen');assert.deepEqual(Object.keys(contexts[0]),['captureOwner']);assert.equal(typeof registers[0],'function');
 const unbound=contexts[0].captureOwner();assert.equal(unbound(),true,'connected original unbound owner');
 const handlers={onAction(){return 'ok';}},disposeFirst=h.mount(h.root,handlers);assert.equal(unbound(),false,'absent binding changed');
 const first=contexts[0].captureOwner();assert.equal(first(),true);
 const disposeSecond=h.mount(h.root,handlers);assert.equal(first(),false,'same handler object still creates new binding generation');
 const second=contexts[0].captureOwner();disposeFirst();assert.equal(second(),true,'stale disposer cannot invalidate current owner');
 disposeSecond();assert.equal(second(),false,'current disposer invalidates captured binding');
 const absentAgain=contexts[0].captureOwner();assert.equal(absentAgain(),true);h.mount(h.root,{});assert.equal(absentAgain(),false,'second absent-to-present transition');
 const mounted=contexts[0].captureOwner(),oldContext=contexts[0],ctx=h.stop();assert.equal(mounted(),false,'stopped mounted generation is invalid');assert.equal(returned,1);h.start(ctx);assert.equal(contexts.length,2);assert.equal(mounted(),false);
 assert.equal(oldContext.captureOwner()(),false,'old initializer cannot capture a replacement generation');assert.equal(contexts[1].captureOwner()(),true,'fresh initializer is live');
 const connected=contexts[1].captureOwner();h.root.parentElement=null;assert.equal(connected(),false,'detached root is invalid before prune');h.prune();
 // Legacy callback arity and registered/returned cleanup remain compatible.
 for(const arity of [1,2]){const l=harness(runtime);let calls=0,disposed=0;const cleanup=()=>disposed++;const one=root=>{assert.equal(root,l.root);calls++;return cleanup;};const two=(root,registerCleanup)=>{assert.equal(root,l.root);calls++;registerCleanup(cleanup);return cleanup;};l.register('test',arity===1?one:two);assert.equal(l.root.dataset.elyReady,'true');l.stop();assert.equal(calls,1);assert.equal(disposed,1,'legacy cleanup executes once');}
 // Generic routing stays unchanged for unmarked buttons, menu/clipboard skip,
 // submit forms, exact payloads, cancellation and unrelated roots.
 const g=harness(runtime);g.register('test',()=>{});const actions=[];g.root.addEventListener('ely:action',e=>actions.push(e.detail));
 const button=new Element('button',g.root);button.dataset.elyAction='pick';button.value='item';
 const click=()=>button.dispatchEvent(new Event('click',{bubbles:true}));click();assert.equal(actions.length,1);assert.equal(actions[0].value,'item');assert.equal(actions[0].formData,null);assert.equal(actions[0].values.length,0);
 button.dataset.interactionPaletteAction='';click();assert.equal(actions.length,1,'palette marker skips generic action');delete button.dataset.interactionPaletteAction;
 for(const key of ['interactionMenuAction','interactionCopy']){button.dataset[key]='';click();assert.equal(actions.length,1,key+' keeps family ownership');delete button.dataset[key];}
 click();assert.equal(actions.length,2,'unmarked palette/generic buttons retain routing');
 button.form={fields:[['field','value']]};click();assert.equal(actions.length,3);assert.equal(JSON.stringify(actions.at(-1).values),'[["field","value"]]');
 g.root.addEventListener('ely:action',e=>e.preventDefault());const cancelled=new Event('click',{bubbles:true});button.dispatchEvent(cancelled);assert.equal(cancelled.defaultPrevented,true,'action cancellation propagates to original click');
 const child=new Element('nested',g.root,'child');child.dataset.elyComponent='test/Child';const nestedButton=new Element('nested-button',child);nestedButton.dataset.elyAction='nested';const before=actions.length;nestedButton.dispatchEvent(new Event('click',{bubbles:true}));assert.equal(actions.length,before,'nested-family buttons do not emit at parent');
 return true;
}
run();
const controls=[
 ['binding-comparison',' && hostBindings.get(root) === binding','', 'absent binding changed'],
 ['mounted-comparison','mounted.get(root) === cleanups && ','', 'stopped mounted generation is invalid'],
 ['connectivity','root.isConnected && mounted.get(root) === cleanups','mounted.get(root) === cleanups','detached root is invalid before prune'],
 ['generic-palette-skip','      if (button.dataset.interactionPaletteAction !== undefined) return;\n','', 'palette marker skips generic action'],
];
for(const [name,anchor,replacement,message]of controls){assert.equal(source.split(anchor).length,2,name+' exact one source anchor');let killed=false;try{run(source.replace(anchor,replacement));}catch(error){assert(error instanceof assert.AssertionError);assert(error.message.includes(message),name+': '+error.message);killed=true;}assert(killed,name+' must fail its owner/routing oracle');}
console.log('CommandPalette private owner context: whole-core lifecycle, legacy initializer and routing positives passed; 4 exact causal reversals killed. DOM doubles only.');
