import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync('ui/gohtmx/assets/ely-api-interaction.js','utf8');
const code=source.slice(source.indexOf('const copyFeedback ='),source.indexOf("register('interaction'"));
const timers=new Map();let serial=0;const navigator={clipboard:{writeText:()=>Promise.resolve()}};
const factory=runInNewContext(`${code};copyFeedback`,{navigator,setTimeout(fn,ms){assert.equal(ms,1400);timers.set(++serial,fn);return serial;},clearTimeout(id){timers.delete(id);}});
const status={textContent:''},root={isConnected:true,querySelector:()=>status},events=[];
const button=()=>({value:'<text> & secret',dataset:{},isConnected:true,disabled:false,setAttribute(n,v){this[n]=v;},removeAttribute(n){delete this[n];}});
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
