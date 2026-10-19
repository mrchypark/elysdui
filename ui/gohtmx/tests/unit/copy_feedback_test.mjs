import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync('ui/gohtmx/assets/ely-api-interaction.js','utf8');
const code=source.slice(source.indexOf('const copyFeedback ='),source.indexOf("register('interaction'"));
const timers=new Map();let serial=0;const navigator={clipboard:{writeText:()=>Promise.resolve()}};
const factory=runInNewContext(`${code};copyFeedback`,{navigator,setTimeout(fn,ms){assert.equal(ms,1400);timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}});
const status={textContent:''},root={id:'copy',dataset:{elyComponent:'buttons/CopyButton'},isConnected:true,querySelector:()=>status},events=[];
const button=()=>({value:'<text> & secret',dataset:{},isConnected:true,disabled:false,owner:root,closest(){return this.owner;},setAttribute(n,v){this[n]=v;},removeAttribute(n){delete this[n];}});
const a=button(),b=button();const api=factory(root,x=>events.push(['change',x]),(action,x)=>events.push(['action',action,x]));
const settle=()=>new Promise(r=>setImmediate(r));
navigator.clipboard.writeText=()=>Promise.reject(Error('denied'));api.copy(a);await settle();assert.equal(status.textContent,'Copy failed');assert.equal(events.length,1);assert.equal(events[0][1].copied,false);assert.equal(a.dataset.interactionCopied,undefined);
events.length=0;let written;navigator.clipboard.writeText=value=>{written=value;return Promise.resolve();};api.copy(a);await settle();assert.equal(written,a.value);assert.equal(events.length,2);assert.equal(events[0][0],'action');assert.equal(events[1][1].copied,true);assert.equal(status.textContent,'Copied');assert.equal(a['aria-busy'],undefined);for(const [id,fn] of [...timers]){timers.delete(id);fn();}assert.equal(status.textContent,'');assert.equal(a.dataset.interactionCopied,undefined);
events.length=0;let resolve,writes=0;navigator.clipboard.writeText=()=>{writes++;return new Promise(r=>resolve=r);};api.copy(a);api.copy(a);assert.equal(writes,1);assert.equal(a['aria-busy'],'true');api.destroy();resolve();await settle();assert.equal(events.length,0);assert.equal(timers.size,0);
const second=factory(root,x=>events.push(x),()=>{throw Error('failure emitted action');});navigator.clipboard.writeText=()=>{throw Error('sync failure');};second.copy(b);assert.equal(events.at(-1).copied,false);navigator.clipboard=undefined;second.copy(b);assert.equal(events.at(-1).error,'clipboard-unavailable');assert.equal(b['aria-busy'],undefined);
b.disabled=true;const count=events.length;second.copy(b);assert.equal(events.length,count);
// A deliberately optimistic failure mutation must be killed by these assertions.
const mutated=code.replace('finish(false); return;', 'finish(true); return;');const mutant=runInNewContext(`${mutated};copyFeedback`,{navigator,setTimeout(){},clearTimeout(){}});let falseSuccess=false;mutant(root,()=>{},()=>falseSuccess=true).copy(a);assert.throws(()=>assert.equal(falseSuccess,false,'missing clipboard must not report success'),assert.AssertionError,'the production failure oracle must kill optimistic success');
console.log('Copy feedback: rejection, exact successful payload, reset, pending deduplication, teardown, sync errors, unavailable API, disabled and causal mutation passed');

// Reusing a node after teardown must not let the old promise clear new busy state.
let oldDone,newDone;const reused=button();navigator.clipboard={writeText:()=>new Promise(r=>oldDone=r)};
const old=factory(root,()=>{},()=>{});old.copy(reused);old.destroy();
navigator.clipboard.writeText=()=>new Promise(r=>newDone=r);const fresh=factory(root,()=>{},()=>{});fresh.copy(reused);oldDone();await settle();assert.equal(reused['aria-busy'],'true');newDone();await settle();assert.equal(reused.dataset.interactionCopied,'true');fresh.destroy();assert.equal(reused.dataset.interactionCopied,undefined);assert.equal(status.textContent,'');assert.equal(timers.size,0);

let callbackNotify=0;let teardown;const inCallback=button();navigator.clipboard={writeText:()=>Promise.resolve()};teardown=factory(root,()=>callbackNotify++,()=>teardown.destroy());teardown.copy(inCallback);await settle();assert.equal(callbackNotify,0);assert.equal(timers.size,0);assert.equal(inCallback.dataset.interactionCopied,undefined);

// The public copy() boundary must remain safe even for synthetic activation.
second.destroy(); teardown.destroy();
const makeRoot = id => ({id, dataset:{elyComponent:'buttons/CopyButton'}, isConnected:true, binding:{}, status:{textContent:''}, querySelector(){return this.status;}});
const makeButton = owner => Object.assign(button(), {owner, value:'captured', dataset:{elyAction:'copy'}, nextElementSibling:{textContent:'Copy', matches:()=>true}});
const ownerContext = root => ({captureOwner(){const binding=root.binding;return()=>root.binding===binding;}});
const deferred = () => {let resolve,reject;const promise=new Promise((yes,no)=>{resolve=yes;reject=no;});return {promise,resolve,reject};};
const fixture = id => {const root=makeRoot(id),events=[];const api=factory(root,x=>events.push(['change',x]),(name,x)=>events.push(['action',name,x]),ownerContext(root));return {root,events,api,button:makeButton(root)};};
const fire = id => {const fn=timers.get(id);assert(fn);timers.delete(id);fn();};
{
  const f=fixture('copied-lockout');let writes=0;navigator.clipboard={writeText:()=>{writes++;return Promise.resolve();}};
  f.api.copy(f.button);assert.equal(f.button['aria-disabled'],'true');await settle();const deadline=[...timers.keys()].at(-1);
  assert.equal(f.button.nextElementSibling.textContent,'Copied');assert.equal(f.button['aria-disabled'],'true');
  f.api.copy(f.button);f.api.copy(f.button);await settle();assert.equal(writes,1);assert.equal(f.events.length,2);assert(timers.has(deadline));
  assert.equal(timers.size,1);fire(deadline);assert.equal(f.button['aria-disabled'],undefined);assert.equal(f.button.nextElementSibling.textContent,'Copy');
  f.api.copy(f.button);await settle();assert.equal(writes,2);f.button.disabled=true;f.api.destroy();assert.equal(f.button.disabled,true);assert.equal(f.button['aria-disabled'],undefined);
}
{
  const f=fixture('capture');const d=deferred();navigator.clipboard={writeText:value=>{assert.equal(value,'captured');return d.promise;}};
  f.api.copy(f.button);assert.equal(timers.size,0);f.button.value='replacement';f.button.dataset.elyAction='replacement-action';
  d.resolve();await settle();assert.equal(f.events[0][1],'copy');assert.equal(f.events[0][2].value,'captured');assert.equal(f.events[1][1].value,'captured');f.api.destroy();
}
for(const outcome of ['resolve','reject']) {
  const f=fixture('rebind-'+outcome),old=deferred(),fresh=deferred();let writes=0;
  navigator.clipboard={writeText:()=>++writes===1?old.promise:fresh.promise};f.api.copy(f.button);f.root.binding={};
  // Fresh input before the old promise settles must release its stale lock.
  f.api.copy(f.button);assert.equal(writes,2);assert.equal(f.button['aria-busy'],'true');old[outcome]();await settle();
  assert.equal(f.events.length,0);assert.equal(f.button['aria-busy'],'true');assert.equal(f.button['aria-disabled'],'true');
  fresh.resolve();await settle();assert.equal(f.events.length,2);assert.equal(f.button.dataset.interactionCopied,'true');f.api.destroy();
}
{
  const f=fixture('rebind-settle'),old=deferred();navigator.clipboard={writeText:()=>old.promise};f.api.copy(f.button);f.root.binding={};old.resolve();await settle();
  assert.equal(f.events.length,0);assert.equal(f.button['aria-busy'],undefined);assert.equal(f.button['aria-disabled'],undefined);
  navigator.clipboard.writeText=()=>Promise.resolve();f.api.copy(f.button);await settle();assert.equal(f.events.length,2);f.api.destroy();
}
{
  const root=makeRoot('callback-fresh'),control=makeButton(root),fresh=deferred(),events=[];let api,writes=0;
  navigator.clipboard={writeText:()=>++writes===1?Promise.resolve():fresh.promise};
  api=factory(root,x=>events.push(x),()=>{if(writes===1){root.binding={};api.copy(control);}},ownerContext(root));
  api.copy(control);await settle();assert.equal(writes,2);assert.equal(events.length,0);assert.equal(control['aria-busy'],'true');assert.equal(control.dataset.interactionCopied,undefined);
  fresh.resolve();await settle();assert.equal(events.length,1);assert.equal(control.dataset.interactionCopied,'true');api.destroy();
}
{
  const a=fixture('move-a'),b=fixture('move-b'),old=deferred(),fresh=deferred();let writes=0;
  navigator.clipboard={writeText:()=>++writes===1?old.promise:fresh.promise};a.api.copy(a.button);a.button.owner=b.root;b.api.copy(a.button);
  old.resolve();await settle();assert.equal(a.events.length,0);assert.equal(b.events.length,0);assert.equal(a.button['aria-busy'],'true');
  fresh.resolve();await settle();assert.equal(b.events.length,2);assert.equal(a.button.dataset.interactionCopied,'true');a.api.destroy();
  assert.equal(a.button.dataset.interactionCopied,'true');assert.equal(b.root.status.textContent,'Copied');b.api.destroy();
}
{
  const a=fixture('timer-a'),b=fixture('timer-b');navigator.clipboard={writeText:()=>Promise.resolve()};a.api.copy(a.button);await settle();
  const oldReset=timers.get([...timers.keys()].at(-1));a.button.owner=b.root;b.api.copy(a.button);await settle();
  oldReset();a.api.destroy();assert.equal(a.button.dataset.interactionCopied,'true');assert.equal(a.button['aria-disabled'],'true');assert.equal(b.root.status.textContent,'Copied');
  b.api.destroy();assert.equal(a.button.dataset.interactionCopied,undefined);
}
{
  const root=makeRoot('items'),first=makeButton(root),second=makeButton(root),a=deferred(),b=deferred(),events=[];let writes=0;
  const api=factory(root,x=>events.push(x),()=>{},ownerContext(root));navigator.clipboard={writeText:()=>++writes===1?a.promise:b.promise};
  api.copy(first);api.copy(second);b.resolve();await settle();const bReset=[...timers.keys()].at(-1);a.resolve();await settle();
  assert.equal(root.status.textContent,'Copied');fire(bReset);assert.equal(root.status.textContent,'');assert.equal(first.dataset.interactionCopied,'true');assert.equal(second.dataset.interactionCopied,undefined);assert.equal(events.length,2);api.destroy();
}
{
  const root=makeRoot('host-throw'),control=makeButton(root),events=[];const api=factory(root,x=>events.push(x),()=>{throw Error('host failure');},ownerContext(root));
  navigator.clipboard={writeText:()=>Promise.resolve()};api.copy(control);await settle();assert.equal(events.length,1);assert.equal(events[0].copied,true);assert.equal(root.status.textContent,'Copied');api.destroy();
}
{
  const f=fixture('detached'),old=deferred();navigator.clipboard={writeText:()=>old.promise};f.api.copy(f.button);f.button.isConnected=false;old.resolve();await settle();assert.equal(f.events.length,0);assert.equal(timers.size,0);f.api.destroy();
  const disabled=fixture('root-disabled');disabled.root.dataset.elyDisabled='true';navigator.clipboard.writeText=()=>assert.fail('disabled root wrote');disabled.api.copy(disabled.button);assert.equal(disabled.events.length,0);disabled.api.destroy();
}
assert.equal(timers.size,0);
console.log('Copy feedback: copied lockout, captured action, rebind/settlement/reentrant callback, moved controls, stale timers, independent status, host errors and disabled preservation passed');
