import assert from 'node:assert/strict';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

// Deterministic execution of bounded production functions. This suite does not
// stand in for native DOM focus, pointer defaults, layout, or actual HTMX swaps.
const source=readFileSync('./ui/gohtmx/assets/ely-api-interaction.js','utf8');
const cut=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`production boundary: ${start}`);return source.slice(a,b);};
const hash=s=>createHash('sha256').update(s).digest('hex');
const report={suite:'menu-empty-submenu-vm',revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSHA256:hash(source),dirty:!!execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),checks:[],status:'running'};
const check=(name,fn)=>{try{fn();report.checks.push({name,status:'passed'});}catch(error){report.checks.push({name,status:'failed',error:error.stack});}};

const fixture=()=>{
 const document={activeElement:null,body:{}};
 const panels=new Map(),triggers=new Map();
 const root={dataset:{},isConnected:true,contains:n=>n?.isConnected,querySelector(selector){return selector.startsWith('#')?panels.get(selector.slice(1)):triggers.get(selector.match(/="([^"]+)"/)[1]);}};
 const add=(id,parent)=>{
  const trigger={isConnected:true,disabled:false,dataset:{interactionMenu:id},attrs:{},value:id,getAttribute(k){return this.attrs[k]??null;},setAttribute(k,v){this.attrs[k]=v;},hasAttribute(){return false;},closest(s){if(s==='[role="menu"]')return parent||null;if(s==='[data-ely-family]')return root;return null;},focus(){document.activeElement=this;},getBoundingClientRect:()=>({left:20,top:20,right:100,bottom:40})};
  const panel={id,isConnected:true,hidden:true,style:{},parentElement:{matches:()=>!!parent},children:[],hasAttribute:k=>k==='tabindex',getAttribute:k=>k==='role'?'menu':null,closest:s=>s==='[data-ely-family]'?root:null,matches:()=>false,contains(n){return n===panel||this.children.some(c=>c===n||panels.get(c.dataset.interactionMenu)?.contains(n));},querySelector:()=>null,querySelectorAll(s){return s==='[data-interaction-menu]'?this.children:s==='input:not(:disabled)'?[]:this.children.filter(c=>!c.disabled);},focus(){document.activeElement=this;},getBoundingClientRect:()=>({width:200,height:8,right:220,bottom:48})};
  if(parent)parent.children.push(trigger);panels.set(id,panel);triggers.set(id,trigger);return {trigger,panel};
 };
 const parent=add('root'),child=add('child',parent.panel),disabled=add('disabled',parent.panel);disabled.trigger.disabled=true;
 const runtime=runInNewContext(cut('const placeMenu =','// Each mount owns its toast clocks.')+'\n({menu,menuReturnFocus,menuAction})',{document,window:{innerWidth:1000,innerHeight:800},CSS:{escape:s=>s},placeOverlay(){throw Error('nested panels use own positioning');},emit(){throw Error('empty submenus must not invoke actions');},FormData:class{}});
 const menu=(id,open,restore=false)=>runtime.menu(root,id,open,restore);
 return {document,root,parent,child,disabled,runtime,menu,panels,triggers};
};
check('nested empty panel receives focus and left/escape returns only to its parent row',()=>{
 const f=fixture();f.menu('root',true);f.menu('child',true);assert.equal(f.document.activeElement,f.child.panel,'empty child focus fallback');assert.equal(f.parent.panel.hidden,false);assert.equal(f.child.trigger.attrs['aria-expanded'],'true');
 const closeKey=runInNewContext('(event)=>{'+cut('    const menuTrigger = closest(root, event.target,', '    const menubar = closest(root, event.target,')+'}',{root:f.root,closest:(_r,target,selector)=>selector.includes('> [role="menu"]')?target:null,menu:f.runtime.menu});
 for(const key of ['ArrowLeft','Escape']){f.menu('child',true);let prevented=false;closeKey({target:f.child.panel,key,preventDefault(){prevented=true;}});assert(prevented);assert.equal(f.child.panel.hidden,true);assert.equal(f.document.activeElement,f.child.trigger,'nested close restores parent trigger');assert.equal(f.parent.panel.hidden,false,'nested close leaves root open');}
});
check('disabled child and disabled root never open an empty panel',()=>{
 const f=fixture();f.menu('root',true);const owner=f.document.activeElement;f.menu('disabled',true);assert.equal(f.disabled.panel.hidden,true);assert.equal(f.document.activeElement,owner);f.root.dataset.elyDisabled='true';f.menu('child',true);assert.equal(f.child.panel.hidden,true);assert.equal(f.document.activeElement,owner);
});
check('direct empty-panel navigation and both confirmation phases remain contained',()=>{
 const f=fixture();f.menu('root',true);f.menu('child',true);let activates=0;
 f.child.panel.click=()=>{activates++;};
 const begin=cut('  let menuConfirmKey','    if (sourceFamily.keydown(event)) return;');
 const end=cut('  const keyup = event => {',"  root.addEventListener('pointerdown', holdStart)");
 const handlers=runInNewContext(begin+'};\n'+end+'\n({keydown,keyup})',{root:f.root,closest:(_r,target,selector)=>selector.endsWith('button')?null:target,holdEnd(){}});
 for(const key of ['ArrowUp','ArrowDown','Home','End','Enter',' ']){
  const events=[];const event={key,target:f.child.panel,preventDefault(){events.push('prevent');},stopPropagation(){events.push('stop');}};
  handlers.keydown(event);assert.deepEqual(events,['stop','prevent'],`panel ${key} keydown contained`);
  if(['Enter',' '].includes(key)){handlers.keyup(event);assert.deepEqual(events,['stop','prevent','stop','prevent'],`panel ${key} keyup contained`);}
  assert.equal(f.document.activeElement,f.child.panel);assert.equal(f.child.panel.hidden,false);assert.equal(activates,0);
 }
 for(const modifier of ['ctrlKey','metaKey','altKey','shiftKey'])for(const key of ['Enter',' ']){const event={key,target:f.child.panel,[modifier]:true,preventDefault(){},stopPropagation(){}};handlers.keydown(event);handlers.keyup(event);assert.equal(f.document.activeElement,f.child.panel);}
});
check('hover and repeated click keep the empty child open without an action',()=>{
 const f=fixture();f.menu('root',true);
 const row={isConnected:true,closest:()=>f.root,parentElement:{querySelectorAll:()=>[f.child.trigger]},contains:n=>n===f.child.trigger,querySelector(selector){assert.equal(selector,':scope > button');return f.child.trigger;}};
 const pointer=runInNewContext(cut('  const pointerover = event => {',"  root.querySelectorAll('[data-interaction-search-menu]")+'\npointerover',{root:f.root,closest:(_r,_t,s)=>s==='.ely-interaction__menu-row'?row:s==='.ely-interaction__menu-row > [data-interaction-menu]'?f.child.trigger:null,menu:f.runtime.menu});
 pointer({type:'pointermove',target:f.child.trigger});assert.equal(f.child.panel.hidden,false);assert.equal(f.document.activeElement,f.child.panel);
 const click=runInNewContext('(target)=>{'+cut("    const trigger = target?.closest('[data-interaction-menu]');","    if (target?.closest('.ely-interaction__navigation-menu")+'}',{root:f.root,CSS:{escape:s=>s},menu:f.runtime.menu,close(){throw Error('submenu click must not close root');}});
 for(let n=0;n<3;n++){click({closest:()=>f.child.trigger});assert.equal(f.child.panel.hidden,false);assert.equal(f.document.activeElement,f.child.panel);f.runtime.menuAction(f.root,{preventDefault(){throw Error('unmarked trigger cannot cancel an action');}},f.child.trigger);}
});
check('parent close recursively clears empty children and focus ownership',()=>{
 const f=fixture();f.menu('root',true);f.menu('child',true);assert(f.runtime.menuReturnFocus.has(f.child.panel));f.menu('root',false,true);assert.equal(f.parent.panel.hidden,true);assert.equal(f.child.panel.hidden,true);assert.equal(f.child.trigger.attrs['aria-expanded'],'false');assert.equal(f.runtime.menuReturnFocus.has(f.child.panel),false);assert.equal(f.runtime.menuReturnFocus.has(f.parent.panel),false);assert.equal(f.document.activeElement,f.parent.trigger);
 f.menu('root',true);f.menu('child',true);assert.equal(f.document.activeElement,f.child.panel);f.menu('root',false);assert.equal(f.child.panel.hidden,true);
});
report.status=report.checks.every(x=>x.status==='passed')?'passed':'failed';
mkdirSync('test-results/contracts',{recursive:true});writeFileSync('test-results/contracts/menu-empty-submenu-vm.json',JSON.stringify(report,null,2)+'\n');
for(const check of report.checks)console.log(`${check.status}: ${check.name}${check.error?'\n'+check.error:''}`);
if(report.status!=='passed')process.exitCode=1;
