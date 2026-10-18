import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';

// Bounded production-function execution. Native focus/layout and HTTP swaps are
// deliberately reserved for the production-renderer Playwright companion.
const source = readFileSync(process.env.MENU_CONTRACT_SOURCE || './assets/ely-api-interaction.js', 'utf8');
const core = readFileSync(process.env.MENU_CORE_SOURCE || './assets/ely-api.js', 'utf8');
const harness = readFileSync(process.env.MENU_BROWSER_HARNESS || './scripts/menu-contracts-browser-test.mjs', 'utf8');
const slice = (text, start, end) => { const a=text.indexOf(start),b=text.indexOf(end,a);assert(a>=0&&b>a,`missing production boundary ${start}`);return text.slice(a,b); };
const report = {suite:'menu-contracts-vm',revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSHA256:createHash('sha256').update(source).digest('hex'),coreSHA256:createHash('sha256').update(core).digest('hex'),harnessSHA256:createHash('sha256').update(harness).digest('hex'),checks:[],status:'running'};
const check = (name,fn) => {try {fn();report.checks.push({name,status:'passed'});} catch(error) {report.checks.push({name,status:'failed',error:error.message});}};
const button = (name, group='density', checked=false) => ({name,value:name,dataset:{interactionMenuRadio:group,elyAction:'choose'},attrs:{'aria-checked':String(checked)},getAttribute(k){return this.attrs[k]??null;},setAttribute(k,v){this.attrs[k]=v;},hasAttribute(){return false;},focus(){document.activeElement=this;},closest(){return null;}});
let document;
check('radio state is panel-local and committed before observers',()=>{
 const top={},nested={},a=button('a'),b=button('b','density',true),child=button('child','density',true),color=button('color','color',true);
 for(const n of [a,b,color])n.closest=()=>top;child.closest=()=>nested;top.querySelectorAll=()=>[a,b,child,color];
 const snapshots=[];let closed=false;
 const handler=runInNewContext('(radio,event)=>{'+slice(source,'    if (radio) {','    if (checkbox) {')+'}',{root:{},change:(_,d)=>snapshots.push({...d,closed,states:[a,b,child,color].map(n=>n.attrs['aria-checked'])}),close(){closed=true;},menuAction(){}});
 handler(a,{});
 assert.deepEqual([a,b,child,color].map(n=>n.attrs['aria-checked']),['true','false','true','true'],'parent selection must preserve nested radio group');
 assert.equal(snapshots.length,1);assert.equal(snapshots[0].closed,true,'change observer must see closed menu');
});
const menuFunction = () => {
 const start=source.includes('const placeMenu =')?'const placeMenu =':source.includes('const menuReturnFocus =')?'const menuReturnFocus =':'const menu =';
 return slice(source,start,'// Each mount owns its toast clocks.');
};
const fixture = ({context=false,empty=false}={}) => {
 document={activeElement:null,body:{}};
 const surface=button('surface'),prior=button('prior'),trigger=button('trigger'),item=button('item');
 for(const n of [surface,prior,trigger,item])n.isConnected=true;
 const panel={hidden:true,style:{},parentElement:{matches:()=>false},hasAttribute:k=>k==='tabindex',getAttribute:()=> 'menu',contains:n=>n===item||n===panel,closest:s=>s==='.ely-interaction--menus'?{}:null,querySelector:()=>null,querySelectorAll:s=>s==='[data-interaction-menu]'?[]:empty?[]:[item],matches:()=>false,focus(){document.activeElement=this;},getBoundingClientRect:()=>({width:200,height:80,right:200,bottom:80})};
 trigger.closest=s=>s==='[data-interaction-context]'&&context?surface:null;trigger.getBoundingClientRect=()=>({left:180,right:220,top:20,bottom:50});surface.getBoundingClientRect=trigger.getBoundingClientRect;
 item.closest=s=>s==='[role="menu"]'?panel:null;
 const root={dataset:{},querySelector:s=>s.startsWith('#')?panel:trigger};document.activeElement=context?prior:trigger;
 const placements=[];const runtime=runInNewContext(menuFunction()+'\n({menu,returns:typeof menuReturnFocus==="undefined"?null:menuReturnFocus})',{document,window:{innerWidth:320,innerHeight:200},CSS:{escape:s=>s},WeakMap,placeOverlay:(p,b)=>placements.push({p,b})});
 return {root,trigger,panel,item,surface,prior,menu:runtime.menu,returns:runtime.returns,placements};
};
check('context dismissal returns the pre-menu focus owner',()=>{const f=fixture({context:true});f.menu(f.root,'menu',true);assert.equal(document.activeElement,f.item);f.menu(f.root,'menu',false,true);assert.equal(document.activeElement,f.prior,'context close must return original focus');});
check('empty menu receives keyboard focus and restores trigger',()=>{const f=fixture({empty:true});f.menu(f.root,'menu',true);assert.equal(document.activeElement,f.panel);f.menu(f.root,'menu',false,true);assert.equal(document.activeElement,f.trigger);});
check('ordinary menu opening requests viewport-aware placement',()=>{const f=fixture();f.menu(f.root,'menu',true);assert.equal(f.placements.length,1,'root menu must request viewport-aware placement');});
check('generic dispatch leaves marked menu actions to the family',()=>{
 const actions=[];const item=button('leaf');item.dataset.interactionMenuAction='';item.hasAttribute=k=>k==='data-interaction-menu-action';item.closest=()=>null;
 const target={closest:()=>item};const root={};const click=runInNewContext(slice(core,'    const click = event => {','    const submit = event => {')+'\nclick',{belongs:()=>true,root,emit:(_,name)=>actions.push(name),FormData:class{}});
 click({target,preventDefault(){}});assert.deepEqual(actions,[],'menu host action must wait for family state and dismissal');
});
check('hover-open submenu remains open on click',()=>{
 const panel={hidden:false},nested={};const trigger={dataset:{interactionMenu:'sub'},closest:s=>s==='[role="menu"]'?nested:null};
 let state;
 const click=runInNewContext('(target)=>{'+slice(source,"    const trigger = target?.closest('[data-interaction-menu]');","    if (target?.closest('.ely-interaction__navigation-menu")+'}',{root:{querySelector:()=>panel},CSS:{escape:s=>s},menu:(_r,_id,open)=>{state=open;},close(){}});
 click({closest:()=>trigger});assert.equal(state,true,'clicking hover-open submenu must keep it open');
});
check('native pointer focus back to a submenu trigger does not dismiss its panel',()=>{
 const pending=[],handlers={},cleanups=[];
 let dismissals=0;
 const child={},trigger={},outside={};
 const panel={id:'menu',hidden:false,parentElement:{matches:()=>false},contains:n=>n===child||n===trigger,addEventListener:(type,handler)=>{handlers[type]=handler;},removeEventListener(type,handler){assert.equal(handlers[type],handler);delete handlers[type];}};
 const root={isConnected:true,querySelectorAll:()=>[panel]};
 document={activeElement:child,body:{}};
 runInNewContext(slice(source,"  root.querySelectorAll('.ely-interaction--menus [role=\"menu\"]').forEach(panel => {","  root.querySelectorAll('[data-interaction-popover]').forEach(panel => {"),{root,document,lottieCleanups:cleanups,queueMicrotask:fn=>pending.push(fn),menu:(_root,_id,open)=>{dismissals++;panel.hidden=!open;}});
 // Hover opens a submenu and focuses its first child. Native mousedown then
 // focuses its parent trigger: focusout runs while activeElement is body,
 // before focusin installs relatedTarget as the new active element. A native
 // event callback may reach its microtask checkpoint between these phases.
 document.activeElement=document.body;
 handlers.focusout({target:child,relatedTarget:trigger});
 while(pending.length)pending.shift()();
 assert.equal(panel.hidden,false,'in-panel native focus transition must not hide the clicked submenu trigger');
 document.activeElement=trigger;
 // Real departure still dismisses, without stealing the destination focus.
 document.activeElement=document.body;handlers.focusout({target:trigger,relatedTarget:outside});
 while(pending.length)pending.shift()();assert.equal(panel.hidden,true);
 panel.hidden=false;document.activeElement=child;handlers.focusout({target:trigger,relatedTarget:null});
 while(pending.length)pending.shift()();assert.equal(panel.hidden,false,'null relatedTarget must retain the settled-focus fallback');
 document.activeElement=outside;handlers.focusout({target:child,relatedTarget:null});
 while(pending.length)pending.shift()();assert.equal(panel.hidden,true,'null relatedTarget must still dismiss when settled focus leaves');
 handlers.focusout({target:child,relatedTarget:outside});while(pending.length)pending.shift()();assert.equal(dismissals,2,'an already hidden panel must not dismiss again');
 panel.hidden=false;root.isConnected=false;handlers.focusout({target:child,relatedTarget:outside});
 while(pending.length)pending.shift()();assert.equal(panel.hidden,false,'a detached root must ignore pending focusout work');assert.equal(dismissals,2);
 assert.equal(cleanups.length,1);cleanups[0]();assert.equal(handlers.focusout,undefined,'teardown must remove the focusout listener');
});
check('outside blank pointer restores focus only while its gesture still owns dismissal',()=>{
 const setup=(priorDetached=false)=>{
  const listeners=new Map(),cleanups=[],blank={},next={};
  document={body:{},activeElement:null,addEventListener(type,fn){const list=listeners.get(type)||[];list.push(fn);listeners.set(type,list);},removeEventListener(type,fn){listeners.set(type,listeners.get(type).filter(item=>item!==fn));}};
  const opener={isConnected:true,disabled:false,focus(){document.activeElement=this;}},panel={id:'menu',isConnected:true,hidden:false,parentElement:{matches:()=>false},contains:()=>false};
  opener.contains=node=>node===opener;
  const root={dataset:{},isConnected:true,contains:node=>node===opener,querySelector:()=>opener,querySelectorAll:selector=>selector.startsWith('[data-interaction-popover]')||panel.hidden?[]:[panel]};
  const menuReturnFocus=new WeakMap([[panel,priorDetached?{isConnected:false}:opener]]);
  const menuGeneration=new WeakMap([[panel,1]]);
  const begin=source.includes('  let menuPointerReturn;')?'  let menuPointerReturn;':'  const outside = event => {';
  runInNewContext(slice(source,begin,'  return () => { close(); clearReorderPreview();'),{root,document,CSS:{escape:s=>s},menuReturnFocus,menuGeneration,lottieCleanups:cleanups,close(){},menu:(_root,_id,open,restore)=>{menuGeneration.set(panel,menuGeneration.get(panel)+1);panel.hidden=!open;if(restore)opener.focus();}});
  const send=(type,extra={})=>{const event={type,target:blank,pointerId:1,...extra};for(const fn of listeners.get(type)||[])fn(event);};
  document.activeElement={};send('pointerdown');assert.equal(panel.hidden,true);assert.equal(document.activeElement,opener,'pointerdown initially restores the owner');
  // Native mousedown follows pointerdown and blurs focus on nonfocusable space.
  document.activeElement=document.body;
  return {send,opener,panel,root,next,cleanups,listeners,menuGeneration};
 };
 let h=setup();h.send('pointerup');assert.equal(document.activeElement,h.opener,'blank pointer dismissal must retain opener focus after the native default');
 h=setup(true);h.send('pointerup');assert.equal(document.activeElement,h.opener,'a disconnected prior owner must use the actual restored context fallback');
 for(const interrupt of ['focus-destination','focus-then-blur','new-pointer','new-key','cancel','different-pointer','reopen','reopen-reclose','disconnect-root','disconnect-panel','disconnect-opener','disable-opener','cleanup']) {
  h=setup();
  if(interrupt.startsWith('focus-')){document.activeElement=h.next;h.send('focusin',{target:h.next});if(interrupt==='focus-then-blur')document.activeElement=document.body;}
  if(interrupt==='new-pointer')h.send('pointerdown',{pointerId:2});
  if(interrupt==='new-key')h.send('keydown');
  if(interrupt==='cancel')h.send('pointercancel');
  if(interrupt==='reopen')h.panel.hidden=false;
  if(interrupt==='reopen-reclose')h.menuGeneration.set(h.panel,h.menuGeneration.get(h.panel)+2);
  if(interrupt==='disconnect-root')h.root.isConnected=false;
  if(interrupt==='disconnect-panel')h.panel.isConnected=false;
  if(interrupt==='disconnect-opener')h.opener.isConnected=false;
  if(interrupt==='disable-opener')h.opener.disabled=true;
  if(interrupt==='cleanup'){h.cleanups.forEach(fn=>fn());assert.equal([...h.listeners.values()].flat().length,1,'only the separately-owned outside listener remains');}
  const expected=document.activeElement;h.send('pointerup',{pointerId:interrupt==='different-pointer'?2:1});assert.equal(document.activeElement,expected,`${interrupt} must cancel stale outside focus restoration`);
 }
});
check('context submenus return to their own trigger',()=>{
 const f=fixture({context:true});f.trigger.closest=s=>s==='[role="menu"]'?{}:s==='[data-interaction-context]'?f.surface:null;
 f.menu(f.root,'sub',true);f.menu(f.root,'sub',false,true);assert.equal(document.activeElement,f.trigger);
});
check('settled menu action preserves caller form data and cancellation',()=>{
 const rows=[['scope','value']],calls=[];const item=button('leaf');item.hasAttribute=()=>true;item.form={};
 class FormData {constructor(form){assert.equal(form,item.form);} *[Symbol.iterator](){yield*rows;}}
 const handler=runInNewContext(slice(source,'const menuAction =','// Each mount owns its toast clocks.')+'\nmenuAction',{FormData,emit:(_root,action,detail)=>{calls.push({action,detail});return false;}});
 let prevented=false;handler({}, {preventDefault(){prevented=true;}},item);
 assert.equal(calls[0].action,'choose');assert.deepEqual(Array.from(calls[0].detail.values,entry=>Array.from(entry)),rows);assert(calls[0].detail.formData instanceof FormData);assert(prevented);
});
check('menu confirms activate once on keyup and block modified keys',()=>{
 const calls=[],control={disabled:false,closest:()=>null,click:()=>calls.push('activate')},root={isConnected:true,contains:()=>true};
 const begin=slice(source,'  let menuConfirmKey','    if (sourceFamily.keydown(event)) return;');
 const end=slice(source,'  const keyup = event => {',"  root.addEventListener('pointerdown', holdStart)");
 const handlers=runInNewContext(begin+'};\n'+end+'\n({keydown,keyup})',{root,closest:()=>control,holdEnd(){}});
 const event=key=>({target:control,key,stopPropagation(){calls.push('stop');},preventDefault(){calls.push('prevent');}});
 for(const key of ['Enter',' ']) {calls.length=0;handlers.keydown(event(key));assert(!calls.includes('activate'),'keydown must not activate');handlers.keyup(event(key));assert.deepEqual(calls,['stop','prevent','stop','prevent','activate']);}
 calls.length=0;handlers.keydown({...event('Enter'),ctrlKey:true});handlers.keyup({...event('Enter'),ctrlKey:true});assert(!calls.includes('activate'));
});
check('repeated context opening preserves the original focus owner',()=>{
 const f=fixture({context:true});f.surface.querySelector=()=>f.trigger;f.menu(f.root,'menu',true);f.trigger.dataset.interactionMenu='menu';
 const handler=runInNewContext('(event)=>{'+slice(source,"    const surface = closest(root, event.target, '[data-interaction-context]');",'  const pointerover = event => {'),{root:f.root,closest:()=>f.surface,CSS:{escape:s=>s},window:{innerWidth:320,innerHeight:200},menu:f.menu,menuReturnFocus:f.returns,close:()=>f.menu(f.root,'menu',false)});
 handler({target:{closest:()=>null},clientX:300,clientY:180,preventDefault(){}});f.menu(f.root,'menu',false,true);assert.equal(document.activeElement,f.prior,'repeat context open must preserve its original focus owner');
});
check('stationary menu boundaries preserve keyboard confirmation and child selection',()=>{
 let active,checked=true;
 const root={},calls=[],menuHost={};
 const parentRow={parentElement:{querySelectorAll:()=>[parent]},contains:node=>node===parent,closest:()=>menuHost};
 const leafRow={parentElement:parentRow.parentElement,contains:()=>false,closest:()=>menuHost};
 const parent={row:parentRow,disabled:false,dataset:{interactionMenu:'sub'},expanded:'false',getAttribute(){return this.expanded;}};
 const child={disabled:false,closest:()=>null,click(){}},ruler={row:leafRow,disabled:false,closest:()=>null,click(){checked=!checked;}},label={row:parentRow,trigger:parent};
 const closest=(_root,target,selector)=>selector==='[data-interaction-quickaction]'?null:selector==='.ely-interaction__menu-row'?target.row:selector==='.ely-interaction__menu-row > [data-interaction-menu]'?(target===parent?parent:target.trigger):selector==='.ely-interaction--menus .ely-interaction__menu-row'&&target.row?.closest()?target.row:null;
 const hover=runInNewContext(slice(source,'  const pointerover = event => {',"  root.querySelectorAll('[data-interaction-search-menu] [data-interaction-filter]')")+'\n({pointerover,move:typeof menuPointerMove==="function"?menuPointerMove:null})',{root,closest,menu:(_root,_id,open)=>{calls.push(open);parent.expanded=String(open);if(open)active=child;},close(){}});
 const start=slice(source,'  let menuConfirmKey','    if (sourceFamily.keydown(event)) return;'),end=slice(source,'  const keyup = event => {',"  root.addEventListener('pointerdown', holdStart)");
 const keys=runInNewContext(start+'};\n'+end+'\n({keydown,keyup})',{root:{isConnected:true,contains:()=>true},closest:(_root,target)=>target,holdEnd(){}});
 const key=()=>({target:active,key:' ',preventDefault(){},stopPropagation(){}});
 active=ruler;keys.keydown(key());hover.pointerover({type:'pointerover',target:label,clientX:831.32,clientY:189,movementX:0,movementY:0});keys.keyup(key());
 assert.equal(checked,false,'stationary pointer must not steal checkbox keyboard confirmation');assert.equal(active,ruler);assert.deepEqual(calls,[]);
 hover.move({type:'pointermove',target:label,clientX:831.5,clientY:189,movementX:0,movementY:0});assert.equal(active,child,'actual pointermove must open enabled nested rows, including fractional movement');assert.equal(parent.expanded,'true');
 hover.pointerover({type:'pointerover',target:ruler});assert.equal(parent.expanded,'true','stationary sibling boundary must not close the keyboard-owned child');
 hover.move({type:'pointermove',target:ruler});assert.equal(parent.expanded,'false','pointer movement to sibling must close the old child');
 parent.disabled=true;const count=calls.length;hover.move({type:'pointermove',target:parent});assert.equal(calls.length,count,'disabled submenu must not open on movement');
 parent.disabled=false;parentRow.closest=()=>null;hover.pointerover({type:'pointerover',target:parent});assert.equal(parent.expanded,'true','other families retain their existing pointerover path');
 assert(source.includes("root.addEventListener('pointermove', menuPointerMove);"));assert(source.includes("root.removeEventListener('pointermove', menuPointerMove);"));
});
check('stationary boundary fixture declares synthetic PointerEvent input and cleans up',()=>{
 class PointerEvent extends Event {constructor(type,init){super(type,init);for(const key of ['pointerType','clientX','clientY','movementX','movementY','buttons'])this[key]=init[key];}}
 const callback=runInNewContext(slice(harness,'const dispatchStationaryBoundary =','// Observe the current requirement')+'\ndispatchStationaryBoundary',{PointerEvent});
 const listeners=new Set(),label={dispatchEvent(event){for(const fn of listeners)fn(event);}},element={querySelector:()=>label,addEventListener(type,fn,capture){assert.equal(type,'pointerover');assert.equal(capture,true);listeners.add(fn);},removeEventListener(type,fn,capture){assert.equal(type,'pointerover');assert.equal(capture,true);listeners.delete(fn);}};
 const point={clientX:831,clientY:189},received=callback(element,point);
 assert.deepEqual({...received},{constructor:'PointerEvent',type:'pointerover',isTrusted:false,pointerType:'mouse',...point,movementX:0,movementY:0,buttons:0});assert.equal(listeners.size,0);
 label.dispatchEvent=()=>{throw Error('fixture dispatch failed');};assert.throws(()=>callback(element,point),/fixture dispatch failed/);assert.equal(listeners.size,0,'injection capture must be removed even when dispatch fails');
});
check('synthetic context fixture delivers a coordinate-bearing MouseEvent',()=>{
 class MouseEvent extends Event {constructor(type,init){super(type,init);this.clientX=init.clientX;this.clientY=init.clientY;}}
 const callback=runInNewContext(slice(harness,'const dispatchContextPointer =','const report =')+'\ndispatchContextPointer',{MouseEvent,Event,window:{}});
 const listeners=new Set(),surface={addEventListener(type,fn){assert.equal(type,'contextmenu');listeners.add(fn);},removeEventListener(_type,fn){listeners.delete(fn);},dispatchEvent(event){for(const fn of listeners)fn(event);}};
 for(const point of [{clientX:1098,clientY:898},{clientX:60,clientY:214}]) {
  const received=callback(surface,point);assert.deepEqual({...received},{constructor:'MouseEvent',type:'contextmenu',...point,isTrusted:false});assert.equal(listeners.size,0);
 }
 assert(!harness.includes("surface.dispatchEvent('contextmenu'"),'coordinate fixtures must use the typed browser callback');
});
const failure=report.checks.some(c=>c.status==='failed');report.status=failure?'failed':'passed';
mkdirSync('test-results/contracts',{recursive:true});writeFileSync(`test-results/contracts/menu-vm${process.env.MENU_EVIDENCE?'-'+process.env.MENU_EVIDENCE:''}.json`,JSON.stringify(report,null,2));
for(const c of report.checks)console.log(`${c.status}: ${c.name}${c.error?'\n  '+c.error:''}`);
assert(!failure,'menu contracts failed');
