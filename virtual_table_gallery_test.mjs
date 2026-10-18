import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
// Execute the real gallery check against the real family initializer. This models
// DOM contracts; browser layout remains a separate CI stage.
class Element {
 constructor(){this.dataset={};this.children=[];this.style={height:''};this.attrs={};this.handlers={};this._scrollTop=0;}
 get clientHeight(){return this.style.height==='64px'?62:298;}
 get scrollHeight(){return 320;}
 get scrollTop(){return this._scrollTop;}
 set scrollTop(value){this._scrollTop=Math.max(0,Math.min(value,this.scrollHeight-this.clientHeight));}
 getBoundingClientRect(){return {height:32};}
 closest(){return this.parentRoot;}
 setAttribute(k,v){this.attrs[k]=v;}
 getAttribute(k){return this.attrs[k];}
 append(...els){this.children.push(...els);}
 replaceChildren(...els){this.children=els;}
 get firstElementChild(){return this.children[0];}
 addEventListener(type,fn,{signal}={}){(this.handlers[type]??=[]).push(fn);signal?.addEventListener('abort',()=>this.handlers[type]=this.handlers[type].filter(f=>f!==fn));}
 dispatchEvent(event){event.target=this;event.preventDefault=()=>{};for(const fn of this.handlers[event.type]||[])fn(event);}
 querySelectorAll(s){return this.queries?.[s]||[];}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
}
const production=readFileSync(new URL('./assets/ely-api-data.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'');
const gallery=readFileSync(new URL('./internal/gallery/assets/advanced-data-checks.js',import.meta.url),'utf8').replace(/^import .*\n/gm,'');
function setup(mutation=''){
 let initialize,checks;
 let source=production;
 if(mutation==='unbounded')source=source.replace('...rows.slice(start, end)','...rows');
 if(mutation==='keyboard')source=source.replace("listen(viewport, 'keydown', event =>", "listen(viewport, 'unused-keydown', event =>");
 const context={register:(_,fn)=>initialize=fn,registerChecks:(_,value)=>checks=value,assert:(value,message)=>assert(value,message),AbortController,WeakMap,Number,Intl,document:{createElement:()=>new Element()},getComputedStyle:()=>({overflowY:'auto'}),Event:class{constructor(type,options={}){this.type=type;Object.assign(this,options);}},KeyboardEvent:class{constructor(type,options={}){this.type=type;Object.assign(this,options);}}};
 runInNewContext(source,context);runInNewContext(gallery,context);
 const root=new Element(),container=new Element(),viewport=new Element(),table=new Element(),body=new Element(),status=new Element();
 const rows=Array.from({length:9},(_,i)=>{const row=new Element();row.dataset.elyVirtualRow=String(i);row.textContent=`Event ${i+1}`;return row;});
 Object.defineProperty(body,'rows',{get(){return this.children;}});body.replaceChildren(...rows);table.tBodies=[body];table.tHead={getBoundingClientRect:()=>({height:32}),rows:[{cells:[{},{},{}]}]};container.parentRoot=root;container.dataset.elyTotal='100000';
 root.queries={'[data-ely-virtual-table]':[container],'[data-ely-virtual-viewport]':[viewport],'[data-ely-virtual-status]':[status]};container.queries={'[data-ely-virtual-viewport]':[viewport],'[data-ely-virtual-status]':[status]};viewport.queries={'table':[table]};
 viewport.querySelectorAll=s=>s==='[data-ely-virtual-row]'?body.rows.filter(row=>row.dataset.elyVirtualRow!==undefined):s==='[data-ely-virtual-spacer]'?body.rows.filter(row=>row.dataset.elyVirtualSpacer!==undefined):viewport.queries[s]||[];
 const cleanup=initialize(root);if(mutation==='phantom-total')table.setAttribute('aria-rowcount','100000');
 return {run:()=>checks['tables/VirtualTable']({root,actions:[]}),cleanup,viewport,rows,body};
}
const baseline=setup();await baseline.run();assert.equal(baseline.viewport.style.height,'');assert.equal(baseline.viewport.scrollTop,0);assert.equal(baseline.body.rows.filter(row=>row.dataset.elyVirtualRow!==undefined).length,9);baseline.cleanup();
for(const [mutation,message] of [['unbounded','bound the actual attached row window'],['phantom-total','distinguish supplied rows'],['keyboard','End must recycle caller rows']]){
 const test=setup(mutation);await assert.rejects(test.run,new RegExp(message));assert.equal(test.viewport.style.height,'','failed checks must restore viewport style');test.cleanup();
}
console.log('VirtualTable gallery check passes production initializer and rejects unbounded rows, phantom totals and missing keyboard recycling');
