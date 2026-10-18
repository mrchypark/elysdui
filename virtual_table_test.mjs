import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
class Element {
 constructor(){this.dataset={};this.children=[];this.style={};this.attrs={};this.handlers={};this.clientHeight=300;this.scrollTop=0;}
 closest(){return this.parentRoot;}
 setAttribute(k,v){this.attrs[k]=v;}
 append(...els){this.children.push(...els);}
 replaceChildren(...els){this.children=els;}
 get firstElementChild(){return this.children[0];}
 addEventListener(type,fn,{signal}={}){(this.handlers[type]??=[]).push(fn);signal?.addEventListener('abort',()=>this.handlers[type]=this.handlers[type].filter(f=>f!==fn));}
 fire(type,props={}){for(const f of this.handlers[type]||[])f({target:this,preventDefault(){},...props});}
 querySelectorAll(s){return this.queries?.[s]||[];}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
}
let initialize,observed=0;
runInNewContext(readFileSync(new URL('./assets/ely-api-data.js',import.meta.url),'utf8').replace(/^import .*\n/gm,''),{register:(_,fn)=>initialize=fn,AbortController,WeakMap,Number,Intl,document:{createElement:()=>new Element()},ResizeObserver:class{observe(){observed++;}disconnect(){observed--;}}});
function fixture(count=1000){
 const root=new Element(),container=new Element(),viewport=new Element(),table=new Element(),body=new Element(),status=new Element();
 const rows=Array.from({length:count},(_,i)=>Object.assign(new Element(),{key:`key-${i}`,textContent:`Event ${i}`}));
 Object.defineProperty(body,'rows',{get(){return this.children;}});body.replaceChildren(...rows);table.tBodies=[body];table.tHead={getBoundingClientRect:()=>({height:32}),rows:[{cells:[{},{}]}]};viewport.scrollHeight=count*32+32;
 container.parentRoot=root;root.queries={'[data-ely-virtual-table]':[container]};container.queries={'[data-ely-virtual-viewport]':[viewport],'[data-ely-virtual-status]':[status]};viewport.queries={'table':[table]};container.dataset.elyTotal='100000';
 return {root,viewport,table,body,status,rows};
}
const nested=fixture();const outer=new Element();outer.queries={'[data-ely-virtual-table]':nested.root.querySelectorAll('[data-ely-virtual-table]')};const outerCleanup=initialize(outer);assert.equal(nested.body.rows.length,1000,'ancestor must not initialize nested data root');outerCleanup();
const f=fixture();let cleanup=initialize(f.root);assert.equal(f.body.rows.length,15);assert.equal(f.table.attrs['aria-rowcount'],'1001');assert.equal(f.body.rows[1],f.rows[0]);assert.equal(f.rows[0].attrs['aria-rowindex'],'2');
f.viewport.scrollTop=16000;f.viewport.fire('scroll');assert.equal(f.body.rows.length,19);assert.equal(f.body.rows[1],f.rows[496]);assert.equal(f.body.rows.at(-2),f.rows[512]);assert.equal(f.body.rows[0].firstElementChild.style.height,'15872px');assert.equal(f.body.rows.at(-1).firstElementChild.style.height,'15584px');assert.match(f.status.textContent,/remaining rows not supplied/);
f.viewport.fire('keydown',{key:'Home'});assert.equal(f.viewport.scrollTop,0);assert.equal(f.body.rows[1],f.rows[0]);
f.viewport.fire('keydown',{key:'End'});assert.equal(f.body.rows.at(-2),f.rows[999]);
f.root.dataset.elyDisabled='true';const before=f.viewport.scrollTop;f.viewport.fire('keydown',{key:'Home'});assert.equal(f.viewport.scrollTop,before);f.root.dataset.elyDisabled='false';
cleanup();assert.equal(observed,0);assert.deepEqual(f.body.rows,f.rows);f.viewport.scrollTop=100;f.viewport.fire('scroll');assert.equal(f.body.rows.length,1000,'detached scroll listener removed');
cleanup=initialize(f.root);assert.equal(f.body.rows.length<25,true);cleanup();assert.equal(observed,0);
const empty=fixture(0);const emptyCleanup=initialize(empty.root);assert.equal(empty.table.attrs['aria-rowcount'],'1');assert.match(empty.status.textContent,/0 supplied rows/);emptyCleanup();
console.log('VirtualTable production initializer: bounded rows, geometry, identity, keyboard, disabled, empty and cleanup passed');
