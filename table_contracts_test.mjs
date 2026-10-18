import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
// Run the complete production family initializer; fake DOM only supplies browser primitives.
class Element {
 constructor(dataset={}) { this.dataset=dataset;this.handlers={};this.attrs={};this.value='';this.checked=false;this.disabled=false;this.hidden=false;this.textContent=''; }
 addEventListener(type,fn,{signal}={}) { (this.handlers[type]??=[]).push(fn);signal?.addEventListener('abort',()=>this.handlers[type]=this.handlers[type].filter(f=>f!==fn)); }
 fire(type) { for(const fn of this.handlers[type]||[]) fn({target:this}); }
 setAttribute(k,v) {this.attrs[k]=v;}
 getAttribute(k) {return this.attrs[k];}
 toggleAttribute(k,v) {this[k]=v;}
 closest(s) {return this.parent;}
 querySelector(s) {return this.querySelectorAll(s)[0]||null;}
 querySelectorAll(s) {return this.queries?.[s]||[];}
 dispatchEvent(e) {this.events.push(e.detail);}
}
let initialize;
runInNewContext(readFileSync(new URL('./assets/ely-api-data.js',import.meta.url),'utf8').replace(/^import .*\n/gm,''),{register:(_,fn)=>initialize=fn,AbortController,CustomEvent:class {constructor(_,o){this.detail=o.detail;}},WeakMap,Number,Intl,console});
function fixture() {
 const root=new Element();root.id='table';root.events=[];
 const tableRoot=new Element(),search=new Element(),status=new Element({elyTableFilterColumn:'2'}),size=new Element();size.value='8';
 const all=new Element(),previous=new Element({elyTablePage:'previous'}),next=new Element({elyTablePage:'next'}),heading=new Element();heading.setAttribute('aria-sort','none');
 const sort=new Element({uiTableSort:'0'});sort.parent=heading;
 const column=new Element({uiTableColumn:'0'});column.checked=true;
 const rows=Array.from({length:10},(_,i)=>{const row=new Element();row.cells=['',String([10,2,9,1,8,3,7,4,6,5][i]),i%2?'Draft':'Live'].map(text=>Object.assign(new Element(),{textContent:text}));row.textContent=row.cells.map(c=>c.textContent).join(' ');row.control=new Element();row.control.parent=row;return row;});
 const body={rows:[...rows],append(...next){this.rows=next;}};
 const table={tBodies:[body]};
 tableRoot.queries={'table':[table],'[data-ui-table-filter]':[search],'[data-ely-table-filter-column]':[status],'[data-ely-table-page-size]':[size],'[data-ely-table-page-status]':[new Element()],'[data-ui-table-summary]':[new Element()],'[data-ely-table-page="previous"]':[previous],'[data-ely-table-page="next"]':[next],'[data-ely-table-page]':[previous,next],'[data-ui-table-column]':[column],'[data-ui-table-sort]':[sort],'[data-ui-table-density]':[new Element()],'[data-ely-table-select-all]':[all],'th[aria-sort]':[heading],'tr':rows};
 const base=tableRoot.querySelectorAll.bind(tableRoot);tableRoot.querySelectorAll=s=>s==='[data-ely-table-select]'?rows.map(r=>r.control):s==='[data-ely-table-select]:checked'?rows.filter(r=>r.control.checked).map(r=>r.control):base(s);
 status.parent=tableRoot;root.queries={'[data-ely-paged-table]':[tableRoot],'[data-ely-table-filter-column]':[status]};
 const cleanup=initialize(root);return {root,body,rows,sort,heading,status,search,all,column,next,previous,cleanup};
}
const f=fixture();
f.next.fire('click');assert.equal(f.rows.filter(r=>!r.hidden).length,2);assert.equal(f.next.disabled,true);f.previous.fire('click');assert.equal(f.rows.filter(r=>!r.hidden).length,8);
f.sort.fire('click');assert.equal(f.body.rows[0].cells[1].textContent,'1','sort must address data column after selector');
f.sort.fire('click');assert.equal(f.body.rows[0].cells[1].textContent,'10');f.sort.fire('click');assert.equal(f.heading.getAttribute('aria-sort'),'none');assert.deepEqual(f.body.rows.map(row=>row.cells[1].textContent),['10','2','9','1','8','3','7','4','6','5'],'third sort must restore caller order');
f.column.checked=false;f.column.fire('change');assert.equal(f.rows[0].cells[1].hidden,true);assert.equal(f.rows[0].cells[0].hidden,false);
f.status.value='Live';f.status.fire('change');assert.equal(f.root.events.filter(e=>e.action==='filter').length,1);assert.equal(f.rows.filter(r=>!r.hidden).length,5,'status filter uses configured physical column');f.search.value='10';f.search.fire('input');assert.equal(f.rows.filter(r=>!r.hidden).length,1);f.search.value='';f.search.fire('input');
f.rows[0].control.checked=true;f.rows[0].control.fire('change');assert.equal(f.all.indeterminate,true,'partial selection is mixed');f.all.checked=true;f.all.fire('change');assert.equal(f.all.checked,true);assert.equal(f.all.indeterminate,false);assert.equal(f.rows.filter(r=>r.control.checked).length,5);
f.search.value='missing';f.search.fire('input');assert.equal(f.all.disabled,true);assert.equal(f.all.checked,false);assert.equal(f.all.indeterminate,false);
const before=f.root.events.length;f.previous.fire('click');f.next.fire('click');assert.equal(f.root.events.length,before,'disabled paging emits no action');
f.cleanup();f.sort.fire('click');assert.equal(f.heading.getAttribute('aria-sort'),'none','cleanup removes listeners');
const fresh=fixture();fresh.rows[0].control.disabled=true;fresh.all.checked=true;fresh.all.fire('change');assert.equal(fresh.rows[0].control.checked,false,'select all skips disabled rows');fresh.sort.fire('click');assert.equal(fresh.heading.getAttribute('aria-sort'),'ascending');
console.log('Paged table production initializer contracts passed');
