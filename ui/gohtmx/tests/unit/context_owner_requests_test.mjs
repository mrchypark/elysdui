import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';

const source=readFileSync(process.env.CONTEXT_REQUEST_SOURCE || 'ui/gohtmx/assets/ely-api-interaction.js','utf8');
const coreSource=readFileSync(process.env.CONTEXT_REQUEST_CORE_SOURCE || 'ui/gohtmx/assets/ely-api.js','utf8');
const slice=(start,end)=>{const a=source.indexOf(start),b=source.indexOf(end,a);assert(a>=0&&b>a,`production boundary ${start}`);return source.slice(a,b);};
const report={suite:'context-owner-production-vm',revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sourceSHA256:createHash('sha256').update(source).digest('hex'),coreSHA256:createHash('sha256').update(coreSource).digest('hex'),checks:[]};
const check=(name,run)=>{try{run();report.checks.push({name,status:'passed'});}catch(error){report.checks.push({name,status:'failed',error:error.stack});}};
const document={body:{},activeElement:null};
class Node {
 constructor(kind,parent=null){this.kind=kind;this.parentElement=parent;this.children=[];parent?.children.push(this);this.dataset={};this.attrs={};this.style={};this.hidden=kind==='panel';this.isConnected=true;this.disabled=false;this.handlers=new Map();this.focusCount=0;}
 contains(node){for(let n=node;n;n=n.parentElement)if(n===this)return true;return false;}
 all(){return this.children.flatMap(n=>[n,...n.all()]);}
 closest(selector){for(let n=this;n;n=n.parentElement){if(selector==='[data-ely-family]'&&n.kind==='root'||selector==='[role="menu"]'&&n.kind==='panel'||selector==='[data-interaction-context]'&&n.kind==='surface'||selector==='[data-ely-context-mode="manual"]'&&n.kind==='surface'&&n.dataset.elyContextMode==='manual'||selector==='[hidden]'&&n.hidden||selector==='.ely-interaction--menus'&&n.kind==='surface')return n;}return null;}
 matches(selector){return selector==='[data-ely-family]'&&this.kind==='root'||selector==='.ely-interaction__menu-row'&&this.kind==='row';}
 querySelectorAll(selector){return this.all().filter(n=>selector==='[data-ely-family]'?n.kind==='root':selector==='.ely-interaction--menus [role="menu"]'?n.kind==='panel':selector==='.ely-interaction--menus [role="menu"]:not([hidden])'?n.kind==='panel'&&!n.hidden:selector==='[data-interaction-context]'?n.kind==='surface':selector==='[data-interaction-menu]'?n.kind==='trigger':selector==='input:not(:disabled)'?n.kind==='input'&&!n.disabled:selector===':is(button,a):not(:disabled)'?(n.kind==='item'||n.kind==='trigger')&&!n.disabled:false);}
 querySelector(selector){if(selector.startsWith('#'))return this.all().find(n=>n.id===selector.slice(1));if(selector.startsWith('[data-interaction-menu="'))return this.all().find(n=>n.dataset.interactionMenu===selector.split('"')[1]);return null;}
 hasAttribute(key){return Object.hasOwn(this.attrs,key);}
 getAttribute(key){return key==='role'&&this.kind==='panel'?'menu':this.attrs[key]??null;}
 setAttribute(key,value){this.attrs[key]=value;}
 getBoundingClientRect(){return {left:0,top:0,right:200,bottom:100,width:200,height:100};}
 focus(){document.activeElement=this;this.focusCount++;this.onfocus?.();}
 addEventListener(type,fn){if(!this.handlers.has(type))this.handlers.set(type,new Set());this.handlers.get(type).add(fn);}
 removeEventListener(type,fn){this.handlers.get(type)?.delete(fn);}
 dispatchEvent(event){event.target??=this;for(const fn of [...this.handlers.get(event.type)||[]])fn(event);if(event.bubbles)this.parentElement?.dispatchEvent(event);return true;}
 dispatch(detail,target=this){for(const fn of [...this.handlers.get('ely:context-request')||[]])fn({target,detail});}
}
const runtime=runInNewContext(slice('const placeMenu =','// Each mount owns its toast clocks.')+'\n({bindContextRequests,validContextRequest,menu,menuReturnFocus,contextRequestOwners})',{document,window:{innerWidth:800,innerHeight:600},CSS:{escape:s=>s},placeOverlay:(panel,anchor)=>{panel.placementAnchor=anchor;Object.assign(panel.style,{left:'0px',top:'0px'});},WeakMap,Reflect});
let serial=0;
const setup=({mode='manual',number=null,empty=false,root=null,disabled=false}={})=>{
 root??=new Node('root');root.id||=`owner-${++serial}`;root.dataset.elyFamily='interaction';root.dataset.elyComponent='menus/ContextMenu';root.dataset.elyDisabled=String(disabled);
 const surface=new Node('surface',root);surface.dataset.elyContextMode=mode;
 if(number!==null){surface.dataset.elyContextNumber=number;surface.dataset.elyContextX='120.5';surface.dataset.elyContextY='80.25';for(const key of ['number','x','y'])surface.attrs[`data-ely-context-${key}`]='';}
 const trigger=new Node('trigger',surface);trigger.dataset.interactionMenu=`${root.id}-menu`;
 const panel=new Node('panel',surface);panel.id=trigger.dataset.interactionMenu;panel.attrs.tabindex='-1';
 const item=empty?null:new Node('item',panel);const second=empty?null:new Node('item',panel);
 const prior=new Node('outside');prior.focus();let resets=0;
 const {cleanup,openSeed}=runtime.bindContextRequests(root,()=>resets++);openSeed();
 return {root,surface,trigger,panel,item,second,prior,cleanup,get resets(){return resets;},request:(number='1',x=100.5,y=80.25)=>root.dispatch({number,x,y}),close:()=>runtime.menu(root,panel.id,false,true)};
};
const snapshot=f=>({hidden:f.panel.hidden,left:f.panel.style.left,top:f.panel.style.top,focus:document.activeElement,resets:f.resets});
const replaceContents=f=>{f.cleanup();for(const node of f.root.all())node.isConnected=false;f.root.children=[];};

check('C1.automatic request is inert; manual no-request starts closed; seed opens',()=>{
 let f=setup({mode:'automatic',number:'1'});assert.equal(f.panel.hidden,true);f.request();assert.equal(f.resets,0);
 f=setup();assert.equal(f.panel.hidden,true);f=setup({number:'1'});assert.equal(f.panel.hidden,false);assert.equal(f.panel.style.left,'120.5px');assert.equal(document.activeElement,f.item);assert.equal(f.resets,1);
});
check('C2.full-range strings and adjacent >2^53 numbers remain distinct',()=>{
 const f=setup();for(const [i,number]of ['0','9007199254740992','9007199254740993','18446744073709551615'].entries()){f.request(number,100.5+i,80.25+i);assert.equal(f.panel.style.left,`${100.5+i}px`);assert.equal(runtime.contextRequestOwners.get(f.root).lastNumber,number);}assert.equal(f.resets,4);
});
check('C3.last-only equality preserves focus, geometry and descendants; null never clears',()=>{
 const f=setup();f.request('1');f.second.focus();const row=new Node('row',f.panel),childTrigger=new Node('trigger',row),child=new Node('panel',row);childTrigger.dataset.interactionMenu=child.id='child';child.hidden=false;
 const before=snapshot(f);f.request('1',444,333);assert.deepEqual(snapshot(f),before);assert.equal(child.hidden,false);
 f.close();f.request('1');assert.equal(f.panel.hidden,true);f.root.dispatch(null);f.request('1');assert.equal(f.panel.hidden,true);
 f.request('2',120,130);assert.equal(f.panel.hidden,false);f.request('1',140,150);assert.equal(f.panel.style.left,'140px');assert.equal(f.resets,3);
});
check('C5.malformed values are atomic and unconsumed; finite extremes clamp',()=>{
 const invalid=[undefined,null,false,1,'',[],{},new Date(),{number:'1',x:0},{number:'1',x:0,y:0,extra:1},{number:1,x:0,y:0},...['','00','01','-1','+1',' 1','1 ','1.0','1e1','1\n','1\r','1\r\n','1\u2028','1\u2029','18446744073709551615\n','١','18446744073709551616','999999999999999999999'].map(number=>({number,x:0,y:0}))];
 for(const coordinate of [undefined,null,false,true,'0',NaN,Infinity,-Infinity,{},[]])for(const key of ['x','y'])invalid.push({number:'1',x:0,y:0,[key]:coordinate});
 const symbol={number:'1',x:0,y:0,[Symbol('extra')]:0};invalid.push({get number(){throw Error('bad getter');},x:0,y:0},new Proxy({}, {ownKeys(){throw Error('bad proxy');}}),symbol,Object.create({number:'1',x:0,y:0}));
 for(const request of invalid){const f=setup();const before=snapshot(f);f.root.dispatch(request);assert.deepEqual(snapshot(f),before);assert.equal(runtime.contextRequestOwners.get(f.root).lastNumber,undefined);f.request('1');assert.equal(f.panel.hidden,false);}
 const f=setup();for(const [number,x,y,wantX,wantY]of [['1',0,0,0,0],['2',-10,-20,0,0],['3',900,700,600,500],['4',Number.MAX_VALUE,Number.MAX_VALUE,600,500],['5',-Number.MAX_VALUE,-Number.MAX_VALUE,0,0]]){f.request(number,x,y);assert.equal(f.panel.style.left,`${wantX}px`);assert.equal(f.panel.style.top,`${wantY}px`);}
});
check('C6.disabled requests do not consume; explicit retry works; empty root focuses panel',()=>{
 for(const kind of ['root','trigger']){const f=setup();if(kind==='root')f.root.dataset.elyDisabled='true';else f.trigger.disabled=true;f.request('1');assert.equal(f.panel.hidden,true);assert.equal(f.resets,0);f.root.dataset.elyDisabled='false';f.trigger.disabled=false;f.request('1');assert.equal(f.panel.hidden,false);}
 const f=setup({empty:true});f.request('1');assert.equal(document.activeElement,f.panel);
 const g=setup();g.item.disabled=true;g.request('1');assert.equal(document.activeElement,g.second);
});
check('C7.re-request preserves first outside focus owner and existing disconnected fallback',()=>{
 const f=setup();f.request('1');f.second.focus();f.request('2');f.close();assert.equal(document.activeElement,f.prior);
 const g=setup();g.request('1');g.prior.isConnected=false;g.request('2');g.close();assert.equal(document.activeElement,g.surface);
});
check('C8.exact local target, component and owned descendants keep requests separate',()=>{
 const f=setup(),g=setup();f.root.dispatch({number:'1',x:1,y:1},f.surface);assert.equal(f.panel.hidden,true);assert.equal(runtime.contextRequestOwners.get(f.root).lastNumber,undefined);f.request('1');g.request('1');assert.equal(f.resets,1);assert.equal(g.resets,1);
 const nested=setup();nested.root.parentElement=f.panel;f.panel.children.push(nested.root);nested.request('1');nested.panel.hidden=false;const before=snapshot(nested);f.request('2');assert.deepEqual(snapshot(nested),{...before,focus:document.activeElement});assert.equal(nested.panel.hidden,false);
 const wrong=setup();wrong.root.dataset.elyComponent='menus/PieMenu';wrong.request('1');assert.equal(wrong.panel.hidden,true);assert.equal(wrong.resets,0);
 const moved=setup();moved.trigger.parentElement=null;moved.request('1');assert.equal(moved.resets,0);
});
check('nested family mounted inside a parent panel owns requests and automatic fallback',()=>{
 const parent=setup();parent.request('1');const root=new Node('root',parent.panel);const child=setup({root});child.request('1');assert.equal(child.panel.hidden,false);child.close();assert.equal(document.activeElement,child.prior);assert.equal(parent.panel.hidden,false);
 const automatic=setup({root:new Node('root',parent.panel),mode:'automatic'});
 const click=runInNewContext('(target)=>{'+slice("    const trigger = target?.closest('[data-interaction-menu]');","    if (target?.closest('.ely-interaction__navigation-menu")+'}',{root:automatic.root,CSS:{escape:s=>s},menu:runtime.menu,close(){}});click({closest:()=>automatic.trigger});assert.equal(automatic.panel.hidden,false,'nested automatic click stays independent of outer manual mode');automatic.close();
 const keyboard=runInNewContext('(event)=>{'+slice("    const menuTrigger = closest(root, event.target, '.ely-interaction--menus [data-interaction-menu]');","    const nested = closest(root")+'}',{root:automatic.root,closest:()=>automatic.trigger,menu:runtime.menu});keyboard({key:'ArrowDown',target:automatic.trigger,preventDefault(){}});assert.equal(automatic.panel.hidden,false,'nested automatic ArrowDown stays independent of outer manual mode');
});
check('empty owner panel never focuses nested-family fallback triggers or inputs',()=>{
 for(const withInput of [false,true]){const parent=setup({empty:true}),nested=setup({root:new Node('root',parent.panel),mode:'automatic'});if(withInput)new Node('input',nested.surface);parent.request('1');assert.equal(document.activeElement,parent.panel);assert.equal(nested.panel.hidden,true);}
});
check('C9.compatible innerHTML remount preserves watermark; new seed opens',()=>{
 let f=setup({number:'1'});const root=f.root;f.close();replaceContents(f);f=setup({root,number:'1'});assert.equal(f.panel.hidden,true);assert.equal(f.resets,0);replaceContents(f);f=setup({root,number:'2'});assert.equal(f.panel.hidden,false);assert.equal(f.resets,1);replaceContents(f);f=setup({root});f.request('2');assert.equal(f.panel.hidden,true);
});
check('C10.replacement resets; detached event and stale callback stay inert; reinsert dedupes',()=>{
 let f=setup({number:'1'});const old=f.root,listener=[...old.handlers.get('ely:context-request')][0],oldPanel=f.panel;f.cleanup();old.isConnected=false;old.dispatch({number:'2',x:2,y:2});listener({target:old,detail:{number:'3',x:3,y:3}});assert.equal(f.resets,1);
 const root=new Node('root');root.id=old.id;f=setup({root,number:'1'});assert.equal(f.panel.hidden,false);assert.notEqual(f.panel,oldPanel);
 old.isConnected=true;for(const node of old.all())node.isConnected=false;old.children=[];f=setup({root:old,number:'1'});assert.equal(f.panel.hidden,true);
});
check('C11.cleanup invalidates cached listener synchronously and requests are never queued',()=>{
 const f=setup();const listener=[...f.root.handlers.get('ely:context-request')][0];f.cleanup();listener({target:f.root,detail:{number:'1',x:1,y:1}});f.request('2');assert.equal(f.resets,0);assert.equal(runtime.contextRequestOwners.get(f.root).lastNumber,undefined);
 for(const node of f.root.all())node.isConnected=false;f.root.children=[];const g=setup({root:f.root});assert.equal(g.panel.hidden,true);g.request('1');assert.equal(g.panel.hidden,false);
});
check('C12.manual/automatic/manual retains memory; observed ID change resets; live mismatch fails',()=>{
 let f=setup({number:'1'});const root=f.root;replaceContents(f);f=setup({root,mode:'automatic',number:'2'});assert.equal(f.panel.hidden,true);replaceContents(f);f=setup({root,number:'1'});assert.equal(f.panel.hidden,true);
 root.id='changed-owner';f.request('2');assert.equal(f.panel.hidden,true);replaceContents(f);f=setup({root,number:'1'});assert.equal(f.panel.hidden,false);
});
check('reentrant same-number focus request is consumed before presentation',()=>{
 const f=setup();f.item.onfocus=()=>f.request('1',450,450);f.request('1');assert.equal(f.resets,1);assert.equal(f.item.focusCount,1);assert.equal(f.panel.style.left,'100.5px');
});
check('focus reentry snapshots detail and retains the latest synchronous request',()=>{
 const f=setup(),detail={number:'1',x:123.5,y:91.25};f.item.onfocus=()=>{detail.number='2';detail.x=NaN;detail.y='bad';};f.root.dispatch(detail);assert.equal(f.panel.style.left,'123.5px');assert.equal(f.panel.style.top,'91.25px');assert.equal(runtime.contextRequestOwners.get(f.root).lastNumber,'1');
 const g=setup();g.item.onfocus=()=>g.request('2',222,233);g.request('1',111,122);assert.equal(g.panel.style.left,'222px');assert.equal(g.panel.style.top,'233px');assert.equal(g.resets,2);
});
check('C4.manual pointer and context-key paths return before default prevention',()=>{
 const f=setup();let prevented=0,clicks=0;f.trigger.click=()=>clicks++;f.surface.querySelector=()=>f.trigger;
 const pointer=runInNewContext('(event)=>{'+slice("    const surface = closest(root, event.target, '[data-interaction-context]');",'  const pointerover = event => {'),{root:f.root,closest:()=>f.surface,CSS:{escape:s=>s},window:{innerWidth:800,innerHeight:600},menu:runtime.menu,menuReturnFocus:runtime.menuReturnFocus,close(){},});
 pointer({target:f.surface,clientX:1,clientY:2,preventDefault:()=>prevented++});assert.equal(f.panel.hidden,true);assert.equal(prevented,0);
 const keyboard=runInNewContext('(event)=>{'+slice("    const context = closest(root, event.target, '[data-interaction-context]');","    const confirmHold = closest")+'}',{root:f.root,closest:()=>f.surface});
 for(const event of [{key:'ContextMenu'},{key:'F10',shiftKey:true}])keyboard({...event,target:f.surface,preventDefault:()=>prevented++});assert.equal(clicks,0);assert.equal(prevented,0);
});
check('C4.hidden root fallback click and ArrowDown cannot bypass manual ownership',()=>{
 const f=setup();const click=runInNewContext('(target)=>{'+slice("    const trigger = target?.closest('[data-interaction-menu]');","    if (target?.closest('.ely-interaction__navigation-menu")+'}',{root:f.root,CSS:{escape:s=>s},menu:runtime.menu,close(){}});click({closest:()=>f.trigger});assert.equal(f.panel.hidden,true);
 const keyboard=runInNewContext('(event)=>{'+slice("    const menuTrigger = closest(root, event.target, '.ely-interaction--menus [data-interaction-menu]');","    const nested = closest(root")+'}',{root:f.root,closest:()=>f.trigger,menu:runtime.menu});let prevented=0;keyboard({key:'ArrowDown',target:f.trigger,preventDefault:()=>prevented++});assert.equal(f.panel.hidden,true);assert.equal(prevented,0);
});
check('cleanup invalidates pending menu focusout microtasks before retained remount',()=>{
 const f=setup();const queued=[],cleanups=[];f.root.querySelectorAll=()=>[f.panel];f.request('1');
 runInNewContext(slice("  root.querySelectorAll('.ely-interaction--menus [role=\"menu\"]').forEach(panel => {","  root.querySelectorAll('[data-interaction-popover]').forEach(panel => {"),{root:f.root,document,contextPointerFocus:null,lottieCleanups:cleanups,queueMicrotask:fn=>queued.push(fn),menu:()=>{throw Error('stale focusout touched a remounted panel');}});
 const focusout=[...f.panel.handlers.get('focusout')][0];focusout({relatedTarget:null});cleanups.forEach(fn=>fn());document.activeElement=f.prior;queued.forEach(fn=>fn());assert.equal(f.panel.handlers.get('focusout').size,0);
});
check('parent controller never binds focusout to independently owned nested panels',()=>{
 const f=setup(),nested=setup({root:new Node('root',f.panel)}),cleanups=[];f.root.querySelectorAll=()=>[f.panel,nested.panel];
 runInNewContext(slice("  root.querySelectorAll('.ely-interaction--menus [role=\"menu\"]').forEach(panel => {","  root.querySelectorAll('[data-interaction-popover]').forEach(panel => {"),{root:f.root,document,contextPointerFocus:null,lottieCleanups:cleanups,queueMicrotask(){},menu(){}});
 assert.equal(f.panel.handlers.get('focusout').size,1);assert.equal(nested.panel.handlers.has('focusout'),false,'parent must not retain child panel callbacks across child-only swaps');cleanups.forEach(fn=>fn());
});
check('production family + core lifecycle retains ownership across stopped, cancelled and replaced roots',()=>{
 const f=setup();f.cleanup();const doc=new Node('document');doc.body=document.body;doc.documentElement=doc;Object.defineProperty(doc,'activeElement',{get:()=>document.activeElement});doc.children=[f.root];f.root.parentElement=doc;
 const win=new Node('window');win.innerWidth=800;win.innerHeight=600;let prune;const queued=[];const errors=[];f.root.addEventListener('ely:error',event=>errors.push(event.detail.error));
 const core=coreSource;const sandbox={document:doc,window:win,Element:Node,HTMLDialogElement:class{},CustomEvent:class{constructor(type,options={}){Object.assign(this,{type},options);}},MutationObserver:class{constructor(fn){prune=fn;}observe(){}},CSS:{escape:s=>s},queueMicrotask:fn=>queued.push(fn),requestAnimationFrame:fn=>0,cancelAnimationFrame(){},setTimeout,clearTimeout,matchMedia:()=>({matches:true})};
 runInNewContext(core.replaceAll('export function ','function ')+'\n'+source.replace(/^import[^\n]*\n/,'')+'\nglobalThis.api={mount,emit};',sandbox);
 assert.deepEqual(errors,[]);assert.equal(f.root.dataset.elyReady,'true');f.request('1');assert.equal(f.panel.hidden,false);
 doc.dispatchEvent({type:'pointerdown',target:f.surface,button:2,pointerId:42});document.activeElement=f.surface;f.panel.dispatchEvent({type:'focusout',relatedTarget:f.surface});queued.splice(0).forEach(fn=>fn());assert.equal(f.panel.hidden,false,'manual right-host pointer focus keeps the presentation open');
 document.activeElement=f.prior;f.surface.dispatchEvent({type:'focusout',target:f.surface,relatedTarget:f.prior,bubbles:true});queued.splice(0).forEach(fn=>fn());assert.equal(f.panel.hidden,true,'manual right-host boundary still dismisses when focus genuinely leaves');
 doc.dispatchEvent({type:'pointerup',target:f.surface,button:2,pointerId:42});f.request('0');doc.dispatchEvent({type:'keydown',target:f.item,key:'Tab'});document.activeElement=f.surface;f.panel.dispatchEvent({type:'focusout',relatedTarget:f.surface});queued.splice(0).forEach(fn=>fn());assert.equal(f.panel.hidden,true,'keyboard Tab still dismisses on manual host focus');f.request('1');

 let callbacks=0;sandbox.api.mount(f.root,{onAction:()=>callbacks++});const ctx={};doc.dispatchEvent({type:'htmx:before:swap',detail:{ctx,tasks:[{target:f.root,swapSpec:{style:'innerHTML'}}]}});assert.equal(f.panel.hidden,true,'old panel closes before mutation');f.request('2');assert.equal(f.panel.hidden,true,'stopped request must remain inert');
 doc.dispatchEvent({type:'htmx:after:swap',detail:{ctx:{}}});f.request('2');assert.equal(f.panel.hidden,true,'unrelated restart must not remount a pending owner');
 doc.dispatchEvent({type:'htmx:finally:swap',detail:{ctx}});f.request('1');assert.equal(f.panel.hidden,true,'cancelled remount keeps last accepted number');f.request('2');assert.equal(f.panel.hidden,false);sandbox.api.emit(f.root,'choose');assert.equal(callbacks,1);
 const inner={};doc.dispatchEvent({type:'htmx:before:swap',detail:{ctx:inner,tasks:[{target:f.root,swapSpec:{style:'innerHTML'}}]}});for(const node of f.root.all())node.isConnected=false;f.root.children=[];const g=setup({root:f.root,number:'2'});g.cleanup();g.panel.hidden=true;doc.dispatchEvent({type:'htmx:after:swap',detail:{ctx:inner}});assert.equal(g.panel.hidden,true,'retained innerHTML seed stays consumed');g.request('3');assert.equal(g.panel.hidden,false);sandbox.api.emit(g.root,'choose');assert.equal(callbacks,2,'retained host callback fires once');
 g.surface.dataset.elyContextNumber='3';g.root.isConnected=false;prune();g.root.isConnected=true;doc.dispatchEvent({type:'htmx:after:swap',detail:{}});g.request('3');assert.equal(g.panel.hidden,true,'same-node reinsertion keeps consumed request');sandbox.api.emit(g.root,'choose');assert.equal(callbacks,2,'removed host binding is not silently restored');
 const before=callbacks;sandbox.api.mount(g.root,{onAction:()=>callbacks++});sandbox.api.emit(g.root,'choose');assert.equal(callbacks,before+1);
 assert.deepEqual(errors,[]);
});

check('nested ordinary Menu keeps its own trigger placement and focus owner',()=>{
 const parent=setup();parent.request('1');
 const root=new Node('root',parent.panel);root.id='nested-ordinary';root.dataset.elyFamily='interaction';root.dataset.elyComponent='menus/Menu';
 const host=new Node('ordinary-host',root),trigger=new Node('trigger',host),panel=new Node('panel',host);new Node('item',panel);trigger.dataset.interactionMenu=panel.id='nested-ordinary-menu';
 host.scrollLeft=host.scrollTop=host.clientLeft=host.clientTop=0;
 const triggerBox={left:310,top:210,right:350,bottom:230,width:40,height:20};trigger.getBoundingClientRect=()=>triggerBox;
 const prior=new Node('outside');prior.focus();runtime.menu(root,panel.id,true);
 assert.equal(panel.placementAnchor,triggerBox,'nested ordinary Menu must anchor to its own trigger');
 runtime.menu(root,panel.id,false,true);assert.equal(document.activeElement,trigger,'nested ordinary Menu must return focus to its own trigger');assert.equal(parent.panel.hidden,false);
});
const startProduction = (f, beforeStart=()=>{}) => {
 f.cleanup();const doc=new Node('document');doc.body=document.body;doc.documentElement=doc;Object.defineProperty(doc,'activeElement',{get:()=>document.activeElement});doc.children=[f.root];f.root.parentElement=doc;
 const win=new Node('window');win.innerWidth=800;win.innerHeight=600;const queued=[],errors=[];f.root.addEventListener('ely:error',event=>errors.push(event.detail.error));
 const sandbox={document:doc,window:win,Element:Node,HTMLDialogElement:class{},CustomEvent:class{constructor(type,options={}){Object.assign(this,{type},options);}},MutationObserver:class{observe(){}},CSS:{escape:s=>s},queueMicrotask:fn=>queued.push(fn),requestAnimationFrame:fn=>0,cancelAnimationFrame(){},setTimeout,clearTimeout,matchMedia:()=>({matches:true})};
 beforeStart({doc,queued});runInNewContext(coreSource.replaceAll('export function ','function ')+'\n'+source.replace(/^import[^\n]*\n/,'')+'\nglobalThis.api={mount,emit,contextRequestOwners};',sandbox);
 return {doc,queued,errors,api:sandbox.api,flush:()=>queued.splice(0).forEach(fn=>fn())};
};
const seed=(f,number,x=120.5,y=80.25)=>{f.surface.dataset.elyContextNumber=number;f.surface.dataset.elyContextX=String(x);f.surface.dataset.elyContextY=String(y);for(const key of ['number','x','y'])f.surface.attrs[`data-ely-context-${key}`]='';};
check('right-host focus followed by trusted-shape surface Tab focusout dismisses',()=>{
 const f=setup(),runtime=startProduction(f);f.request('1');
 runtime.doc.dispatchEvent({type:'pointerdown',target:f.surface,button:2,pointerId:42});document.activeElement=f.surface;f.panel.dispatchEvent({type:'focusout',target:f.item,relatedTarget:f.surface,bubbles:true});runtime.flush();
 assert.equal(f.panel.hidden,false,'manual right-host focus must remain open');
 runtime.doc.dispatchEvent({type:'pointerup',target:f.surface,button:2,pointerId:42});runtime.doc.dispatchEvent({type:'keydown',target:f.surface,key:'Tab'});document.activeElement=f.prior;f.surface.dispatchEvent({type:'focusout',target:f.surface,relatedTarget:f.prior,bubbles:true});runtime.flush();
 assert.equal(f.panel.hidden,true,'Tab away from the actual focused manual surface must dismiss');assert.equal(document.activeElement,f.prior);assert.deepEqual(runtime.errors,[]);
});
check('seed focus can synchronously stop before initialize returns without accepting stopped requests',()=>{
 const f=setup();seed(f,'1');const ctx={};let stopped=false,duringStop;
 const runtime=startProduction(f,({doc})=>{f.item.onfocus=()=>{
  if(stopped)return;stopped=true;doc.dispatchEvent({type:'htmx:before:swap',detail:{ctx,tasks:[{target:f.root,swapSpec:{style:'innerHTML'}}]}});
  duringStop={hidden:f.panel.hidden,listeners:f.root.handlers.get('ely:context-request').size};f.request('2',333,222);duringStop.afterRequestHidden=f.panel.hidden;
 };});
 assert.equal(duringStop.hidden,true,'seed stop must synchronously close the old panel');assert.equal(duringStop.listeners,0,'seed stop must synchronously remove owner listener');assert.equal(duringStop.afterRequestHidden,true,'request inside stopped seed focus callback must remain inert');
 assert.deepEqual(runtime.errors,[]);assert.equal(f.root.dataset.elyReady,undefined,'stopped initialization must not regain ready');assert.equal(runtime.api.contextRequestOwners.get(f.root).lastNumber,'1');assert.equal(f.root.handlers.get('ely:context-request').size,0);
 runtime.doc.dispatchEvent({type:'htmx:after:swap',detail:{ctx:{}}});assert.equal(f.root.dataset.elyReady,undefined);
 runtime.doc.dispatchEvent({type:'htmx:finally:swap',detail:{ctx}});assert.equal(f.root.dataset.elyReady,'true');assert.equal(f.panel.hidden,true);f.request('2',333,222);assert.equal(f.panel.hidden,false,'stopped number remains unconsumed on explicit retry');assert.equal(f.panel.style.left,'333px');
});
check('newer synchronous seeded remount survives the old initializer return',()=>{
 const f=setup();seed(f,'1',111,112);let stopped=false;
 const runtime=startProduction(f,({doc})=>{f.item.onfocus=()=>{
  if(stopped)return;stopped=true;const ctx={};doc.dispatchEvent({type:'htmx:before:swap',detail:{ctx,tasks:[{target:f.root,swapSpec:{style:'innerHTML'}}]}});f.request('99');seed(f,'2',222,223);doc.dispatchEvent({type:'htmx:finally:swap',detail:{ctx}});
 };});
 assert.deepEqual(runtime.errors,[]);assert.equal(f.root.dataset.elyReady,'true');assert.equal(f.panel.hidden,false,'old returned cleanup must not close a newer seeded remount');assert.equal(f.root.handlers.get('ely:context-request').size,1,'newer remount owns exactly one request listener');assert.equal(f.panel.style.left,'222px');assert.equal(f.panel.style.top,'223px');assert.equal(runtime.api.contextRequestOwners.get(f.root).lastNumber,'2');assert.equal(document.activeElement,f.item);
 f.request('99',333,334);assert.equal(f.panel.style.left,'333px','same-stack stopped request number remains available to the new owner');
});

check('cleanup remount seed starts after the old production family disposer',()=>{
 const f=setup();seed(f,'1',111,112);const runtime=startProduction(f);let inside;
 f.root.addEventListener('ely:cleanup',()=>{seed(f,'2',222,223);runtime.api.mount(f.root);inside={number:runtime.api.contextRequestOwners.get(f.root).lastNumber,hidden:f.panel.hidden};});
 runtime.doc.dispatchEvent({type:'htmx:before:swap',detail:{tasks:[{target:f.root,swapSpec:{style:'innerHTML'}}]}});
 assert.deepEqual(inside,{number:'1',hidden:false},'automatic fresh seed remains deferred inside cleanup');
 assert.equal(f.panel.hidden,false,'fresh seed must survive the full old production disposer');assert.equal(f.panel.style.left,'222px');assert.equal(f.panel.style.top,'223px');assert.equal(document.activeElement,f.item);
 assert.equal(runtime.api.contextRequestOwners.get(f.root).lastNumber,'2');assert.equal(f.root.handlers.get('ely:context-request').size,1);assert.equal(f.root.dataset.elyReady,'true');assert.deepEqual(runtime.errors,[]);
});
check('explicit owner request inside cleanup retains the old-listener boundary',()=>{
 const f=setup();seed(f,'1',111,112);const runtime=startProduction(f);let inside;
 f.root.addEventListener('ely:cleanup',()=>{seed(f,'2',222,223);runtime.api.mount(f.root);f.request('2',222,223);inside={number:runtime.api.contextRequestOwners.get(f.root).lastNumber,hidden:f.panel.hidden};});
 runtime.doc.dispatchEvent({type:'htmx:before:swap',detail:{tasks:[{target:f.root,swapSpec:{style:'innerHTML'}}]}});
 assert.deepEqual(inside,{number:'2',hidden:false},'old owner listener can still consume an explicit request before its disposer');
 assert.equal(f.panel.hidden,true,'explicitly consumed number remains consumed when the deferred seed runs');assert.equal(runtime.api.contextRequestOwners.get(f.root).lastNumber,'2');
 assert.equal(f.root.handlers.get('ely:context-request').size,1);assert.equal(f.root.dataset.elyReady,'true');f.request('2');assert.equal(f.panel.hidden,true);f.request('3');assert.equal(f.panel.hidden,false);assert.deepEqual(runtime.errors,[]);
});

report.status=report.checks.every(c=>c.status==='passed')?'passed':'failed';mkdirSync('test-results/contracts',{recursive:true});writeFileSync(process.env.CONTEXT_REQUEST_REPORT||'test-results/contracts/context-owner-vm.json',JSON.stringify(report,null,2));for(const c of report.checks)console.log(`${c.status}: ${c.name}${c.error?'\n'+c.error:''}`);assert.equal(report.status,'passed');
