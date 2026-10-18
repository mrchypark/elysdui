import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source = readFileSync(new URL('../../assets/ely-api-interaction.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('const directClamp ='), source.indexOf("register('interaction'"));
let now = 0, serial = 0;
const timers = new Map(), changes = [], actions = [];
const setTimeout = (fn, delay) => { timers.set(++serial, {fn, at: now + delay}); return serial; };
const clearTimeout = id => timers.delete(id);
const advance = ms => { const end = now + ms; for (;;) { const entry = [...timers].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at)[0]; if (!entry) break; now = entry[1].at; timers.delete(entry[0]); entry[1].fn(); } now = end; };
const camel = name => name.replace(/-([a-z])/g, (_,c) => c.toUpperCase());
let document;
class Node {
  constructor(tag='div', attrs={}) { this.tagName=tag; this.attributes={}; this.dataset={}; this.children=[]; this.style={setProperty(k,v){this[k]=v;}}; this.events={}; this.textContent=''; this.disabled=false; this.hidden=false; this.tabIndex=-1; this.rect={left:0,top:0,width:100,height:30,right:100,bottom:30}; Object.entries(attrs).forEach(([k,v])=>this.setAttribute(k,v)); const classes=new Set(); this.classList={add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n)),contains:n=>classes.has(n),toggle:(n,on)=>on?classes.add(n):classes.delete(n)}; }
  setAttribute(k,v) {this.attributes[k]=String(v);if(k.startsWith('data-'))this.dataset[camel(k.slice(5))]=String(v);}
  getAttribute(k){return this.attributes[k]??null;}
  hasAttribute(k){return Object.hasOwn(this.attributes,k)||k.startsWith('data-')&&Object.hasOwn(this.dataset,camel(k.slice(5)));}
  removeAttribute(k){delete this.attributes[k];if(k.startsWith('data-'))delete this.dataset[camel(k.slice(5))];}
  matches(selector){return selector.split(',').some(s=>{s=s.trim();if(s===':disabled')return this.disabled;if(s==='button:not(:disabled)')return this.tagName==='button'&&!this.disabled;if(s.startsWith('.'))return this.classList.contains(s.slice(1));const m=s.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);if(m)return this.hasAttribute(m[1])&&(m[2]===undefined||this.getAttribute(m[1])===m[2]);return s===this.tagName;});}
  closest(selector){return this.matches(selector)?this:this.parentElement?.closest(selector)||null;}
  querySelectorAll(selector){if(selector.includes(' ')){const parts=selector.split(/ +/).filter(p=>p!=='>');return this.querySelectorAll(parts[0]).flatMap(node=>node.querySelectorAll(parts.slice(1).join(' ')));}return this.children.flatMap(child=>[...(child.matches(selector)?[child]:[]),...child.querySelectorAll(selector)]);}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  append(...nodes){for(const n of nodes){n.remove();n.parentElement=this;n.isConnected=true;this.children.push(n);}}
  prepend(n){this.append(n);this.children.unshift(this.children.pop());}
  remove(){if(this.parentElement)this.parentElement.children=this.parentElement.children.filter(n=>n!==this);this.parentElement=null;this.isConnected=false;}
  replaceChildren(...nodes){this.children.forEach(n=>n.parentElement=null);this.children=[];this.append(...nodes);}
  insertBefore(n,before){n.remove();const index=before?this.children.indexOf(before):this.children.length;n.parentElement=this;this.children.splice(index,0,n);}
  get firstElementChild(){return this.children[0];}get lastElementChild(){return this.children.at(-1);}get nextElementSibling(){return this.parentElement?.children[this.parentElement.children.indexOf(this)+1]||null;}
  getBoundingClientRect(){return this.rect;}
  addEventListener(type,fn){(this.events[type]??=[]).push(fn);}removeEventListener(type,fn){this.events[type]=this.events[type]?.filter(f=>f!==fn)||[];}
  dispatch(type,props={}){const event={target:this,button:0,pointerId:1,clientX:0,clientY:0,preventDefault(){this.prevented=true;},...props};for(const fn of this.events[type]||[])fn(event);return event;}
  focus(){document.activeElement=this;}setPointerCapture(){}hasPointerCapture(){return false;}
  animate(frames,options){this.lastAnimation={frames,options};return {finished:{then(){}},cancel(){}};}
}
document={activeElement:null,createElement:tag=>new Node(tag)};
const api=runInNewContext(`${helpers}\n({resize:directResize,angle:directAngle,zoom:directZoom,window:directWindow,history:directHistory,binding:directBinding,typed:directTyped,bind:bindSourceFamily,loading:bindLoadingFamily,clock:loadingClock,time:loadingTime,landing:reorderLanding})`,{document,performance:{now:()=>now},matchMedia:()=>({matches:false}),setTimeout,clearTimeout,change:(_root,d)=>changes.push(d),emit:(_root,action,d)=>actions.push({action,...d})});
const object=value=>JSON.parse(JSON.stringify(value));
const limits={minWidth:160,maxWidth:360,minHeight:96,maxHeight:220};
assert.deepEqual(object(api.resize({width:260,height:140},'right',500,500,limits)),{width:360,height:140});
assert.deepEqual(object(api.resize({width:260,height:140},'corner',-500,-500,limits)),{width:160,height:96});
assert.equal(api.angle({left:0,top:0,width:120,height:120},120,60,true),90);
const zoom=api.zoom({x:10,y:20,scale:1},50,60,100,.1,8);assert.equal(zoom.scale,8);assert.equal((50-zoom.x)/zoom.scale,40);assert.equal((60-zoom.y)/zoom.scale,40);
assert.deepEqual(object(api.window(10000,28,28000,200)),{start:998,end:1010});
assert.equal(api.typed(['Apple','Apricot','Banana'],0,'a'),1);assert.equal(api.typed(['Apple','Apricot','Banana'],1,'ap'),1);assert.equal(api.typed(['Apple','Apricot','Banana'],2,'a'),0);
const history=api.history(0);history.record(1);history.record(2);assert.equal(history.undo(),1);assert.equal(history.undo(),0);assert.equal(history.undo(),0);assert.equal(history.redo(),1);history.record(4);assert.equal(history.canRedo,false);
const bindings=[{keys:'Meta+Shift+h',action:'shout'},{keys:'Meta+k Meta+s',action:'save-all'}];assert.equal(api.binding(bindings,'','meta+k').pending,'meta+k');assert.equal(api.binding(bindings,'meta+k','meta+s').action,'save-all');assert.equal(api.binding(bindings,'meta+k','meta+shift+h').action,'shout');assert.equal(api.binding(bindings,'meta+k','x').action,undefined);
const root=new Node();
const add=(parent,tag,attrs,text='')=>{const node=new Node(tag,attrs);node.textContent=text;parent.append(node);return node;};
const historyBox=add(root,'div',{'data-direct-history':''});const output=add(historyBox,'output',{'data-interaction-undo-count':''},'4');const increment=add(historyBox,'button',{'data-interaction-increment':''}),decrement=add(historyBox,'button',{'data-interaction-decrement':''}),undo=add(historyBox,'button',{'data-interaction-undo':''}),redo=add(historyBox,'button',{'data-interaction-redo':''});add(root,'output',{'data-interaction-history':''});
const box=add(root,'div',{'data-interaction-resizable':'','data-width':'260','data-height':'140','data-min-width':'160','data-min-height':'96','data-max-width':'360','data-max-height':'220'});add(box,'output',{'data-direct-size':''});const grip=add(box,'button',{'data-direct-resize':'corner'});
const toolbar=add(root,'div',{'data-direct-toolbar':''});const tools=['bold','italic','underline'].map(value=>{const b=add(toolbar,'button',{'data-direct-tool':''},value);b.value=value;return b;});
const fruitList=add(root,'div',{'data-direct-typeahead':''});const fruit=['Apple','Apricot','Banana','Blueberry'].map(label=>{const b=add(fruitList,'button',{'data-direct-fruit':''},label);b.value=label.toLowerCase();return b;});
const hotkeys=add(root,'div',{'data-interaction-hotkeys':''});for(const binding of bindings){const row=add(hotkeys,'div',{'data-direct-binding':binding.keys,'data-action':binding.action});add(row,'output',{},'heard 0 times');}const pending=add(hotkeys,'output',{'data-direct-pending':''});
const press=add(root,'button',{'data-direct-press':'','data-interaction-longpress':'held-custom','data-direct-press-action':'pressed-custom','data-interaction-confirm-threshold':'500'},'Caller press');press.value='record';
const scroller=add(root,'div',{'data-direct-count':'10000','data-direct-row-height':'28','data-direct-prefix':'Caller row'});scroller.scrollTop=0;scroller.clientHeight=200;add(scroller,'div',{'data-direct-virtual-space':''});const virtualRows=add(scroller,'div',{'data-direct-virtual-rows':''});
const sync=add(root,'div',{'data-direct-sync':''});const left=add(sync,'div',{}),right=add(sync,'div',{});left.scrollTop=0;right.scrollTop=0;
const bound=api.bind(root);const click=target=>bound.click({target,detail:0});const key=(target,key,props={})=>bound.keydown({target,key,preventDefault(){},...props});fruit.forEach(button=>button.click=()=>click(button));
assert.equal(undo.disabled,true);click(increment);assert.equal(output.textContent,'5');click(undo);assert.equal(output.textContent,'4');assert.equal(redo.disabled,false);click(decrement);assert.equal(output.textContent,'3');assert.equal(redo.disabled,true);
key(grip,'ArrowRight');assert.equal(box.dataset.width,'268');for(let i=0;i<100;i++)key(grip,'ArrowUp');assert.equal(box.dataset.height,'96');
root.dispatch('pointerdown',{target:grip,clientX:10,clientY:20});root.dispatch('pointermove',{target:grip,clientX:1010,clientY:1020});assert.equal(box.dataset.width,'360');assert.equal(box.dataset.height,'220');root.dispatch('pointerup',{target:grip});
tools[0].focus();key(tools[0],'ArrowRight');assert.equal(document.activeElement,tools[1]);key(tools[2],'ArrowRight');assert.equal(document.activeElement,tools[2]);assert.deepEqual(tools.map(b=>b.tabIndex),[-1,-1,0]);click(tools[1]);assert.equal(tools[1].getAttribute('aria-pressed'),'true');assert.equal(tools[0].getAttribute('aria-pressed'),'false');
key(fruit[0],'a');assert.equal(document.activeElement,fruit[1]);key(fruit[1],'p');assert.equal(document.activeElement,fruit[1]);advance(801);key(fruit[1],'b');assert.equal(document.activeElement,fruit[2]);
let count=actions.length;key(hotkeys,'k',{metaKey:true});assert.equal(actions.length,count);assert.match(pending.textContent,/waiting for the second/);key(hotkeys,'Meta',{metaKey:true});key(hotkeys,'s',{metaKey:true});assert.equal(actions.at(-1).action,'save-all');key(hotkeys,'k',{metaKey:true});key(hotkeys,'Escape');assert.equal(pending.textContent,'No chord waiting.');
press.dispatch('pointerdown');advance(499);press.dispatch('pointerup');assert.equal(actions.at(-1).action,'pressed-custom');count=actions.length;press.dispatch('pointerdown');advance(500);assert.equal(actions.at(-1).action,'held-custom');press.dispatch('pointerup');assert.equal(actions.length,count+1,'long hold must not also press');press.dispatch('pointerdown');press.dispatch('pointerleave');advance(600);assert.equal(actions.length,count+1,'leaving cancels a held press');
assert.ok(virtualRows.children.length<20);assert.equal(virtualRows.firstElementChild.textContent,'Caller row 1');scroller.scrollTop=28000;scroller.dispatch('scroll');assert.equal(virtualRows.firstElementChild.dataset.index,'998');assert.ok(virtualRows.children.length<20);left.scrollTop=300;left.dispatch('scroll');assert.equal(right.scrollTop,300);right.scrollTop=112;right.dispatch('scroll');assert.equal(left.scrollTop,112);
press.dispatch('pointerdown');key(hotkeys,'k',{metaKey:true});bound.destroy();assert.equal(timers.size,0);assert.ok(Object.values(root.events).every(list=>list.length===0));assert.ok(Object.values(press.events).every(list=>list.length===0));
console.log('Motion/direct bounds, snapshot history, pointer resize, roving ends, typeahead, chords, press lifecycle, virtualization, scroll sync and cleanup passed');

// Run production presence and FLIP controls with real caller keys and labels.
const motionRoot=new Node(), presence=add(motionRoot,'section',{'data-interaction-presence':''}), presenceList=add(presence,'ol',{'data-interaction-presence-list':''});
add(presenceList,'li',{'data-motion-key':'added-1'},'Existing caller row');
const recipes=add(presence,'span',{'data-motion-recipes':''});add(recipes,'i',{'data-value':'caller-tag'},'Caller tag');const addTag=add(presence,'button',{'data-interaction-presence-toggle':''});
const flipHost=add(motionRoot,'section',{'data-interaction-flip':''}), flipList=add(flipHost,'ol',{});['a','b','c','d','e'].forEach(value=>add(flipList,'li',{'data-motion-key':value},value));const shuffle=add(flipHost,'button',{'data-interaction-flip-toggle':''});
const motion=api.bind(motionRoot);motion.click({target:addTag});assert.equal(presenceList.children.length,2);const added=presenceList.lastElementChild;assert.equal(added.firstElementChild.textContent,'Caller tag');assert.equal(added.dataset.motionKey,'added-2','generated keys must not collide with caller keys');motion.click({target:added.lastElementChild});assert.equal(added.inert,true);advance(199);assert.equal(presenceList.children.length,2);advance(1);assert.equal(presenceList.children.length,1);assert.equal(changes.at(-1).gone,true);
motion.click({target:shuffle});assert.deepEqual(flipList.children.map(row=>row.dataset.motionKey),['a','d','e','c','b']);motion.destroy();

// Native drag carries caller values, refuses its source lane, and really moves the node.
const dragRoot=new Node(), today=add(dragRoot,'section',{'data-direct-lane':'today','data-interaction-drop':''}), later=add(dragRoot,'section',{'data-direct-lane':'later','data-interaction-drop':''});const chip=add(today,'div',{'data-interaction-draggable':'','data-interaction-value':'caller-chip'});
const dragSource=source.slice(source.indexOf('  let dragging, reorderPreview;'),source.indexOf('  const holdStart ='));
const drag=runInNewContext(`${dragSource}\n({start:dragstart,over:dragover,drop,end:dragend})`,{root:dragRoot,reorderLanding:api.landing,matchMedia:()=>({matches:false}),lottieCleanups:[],closest:(_root,target,selector)=>target.closest(selector),itemValue:item=>item.dataset.interactionValue,emit:(_root,action,d)=>actions.push({action,...d}),change:(_root,d)=>changes.push(d),sourceFamily:{flip:(_list,mutate)=>mutate()}});
const dragEvent=target=>({target,clientY:0,preventDefault(){this.prevented=true;},dataTransfer:{setData(type,value){this.type=type;this.value=value;}}});
const started=dragEvent(chip);drag.start(started);assert.equal(started.dataTransfer.value,'caller-chip');const same=dragEvent(today);drag.over(same);assert.equal(same.prevented,undefined);drag.drop(same);assert.equal(chip.parentElement,today);
const moved=dragEvent(later);drag.over(moved);assert.equal(moved.prevented,true);drag.drop(moved);assert.equal(chip.parentElement,later);assert.equal(actions.at(-1).from,'today');assert.equal(actions.at(-1).to,'later');assert.equal(chip.classList.contains('is-dragging'),false);
console.log('Presence keys/exits, source FLIP permutation and real cross-lane drag contracts passed');

// Source landing respects unequal row heights, the held grab offset and list bounds.
assert.equal(api.landing([20,20,20,20,20],0,40),2);
assert.equal(api.landing([20,20,20,20,20],4,0),0);
assert.equal(api.landing([20,50,10],0,999),2);
assert.equal(api.landing([20,50,10],2,-99),0);
const reorderList=add(dragRoot,'ol',{'data-interaction-reorder':''});
const rows=[20,50,30].map((height,i)=>{const row=add(reorderList,'li',{'data-interaction-draggable':'','data-interaction-value':String(i)});row.rect={...row.rect,top:[0,20,70][i],height};return row;});
let ev=dragEvent(rows[0]);ev.clientY=10;drag.start(ev);ev=dragEvent(reorderList);ev.clientY=95;drag.over(ev);
assert.deepEqual(reorderList.children,rows,'hover must not commit caller order');
assert.equal(rows[1].style.transform,'translateY(-20px)');assert.equal(rows[2].style.transform,'translateY(-20px)');
drag.end();assert.ok(rows.every(row=>row.style.transform===''));assert.deepEqual(reorderList.children,rows,'cancel restores original order');
ev=dragEvent(rows[0]);ev.clientY=10;drag.start(ev);ev=dragEvent(reorderList);ev.clientY=95;drag.over(ev);drag.drop(ev);
assert.deepEqual(reorderList.children,[rows[1],rows[2],rows[0]]);assert.equal(changes.at(-1).from,0);assert.equal(changes.at(-1).to,2);

let clockNow=0;const countdown=api.clock(10,'countdown',()=>clockNow);clockNow=11000;assert.equal(countdown.value(),0);assert.equal(countdown.completed(),true);assert.equal(countdown.completed(),false);countdown.reset();assert.equal(countdown.value(),10);clockNow+=10000;assert.equal(countdown.completed(),true,'restart re-arms completion');
const elapsed=api.clock(0,'timer',()=>clockNow);clockNow+=4500;assert.equal(elapsed.value(),4);elapsed.toggle();clockNow+=9000;assert.equal(elapsed.value(),4);elapsed.toggle();assert.equal(elapsed.value(),0);assert.equal(api.time(8047),'02:14:07');
const loadingRoot=new Node(),clockHost=add(loadingRoot,'div',{'data-loading-clock':'','data-clock-mode':'countdown','data-clock-value':'1'}),clockOutput=add(clockHost,'output',{'data-interaction-countdown':'1'}),restart=add(clockHost,'button',{'data-interaction-countdown-reset':''}),done=add(loadingRoot,'small',{'data-loading-clock-done':''});done.hidden=true;
const transitionHost=add(loadingRoot,'section',{'data-interaction-transition':''}),article=add(transitionHost,'article',{'data-loading-entrance':'rise'}),toggle=add(transitionHost,'button',{'data-interaction-transition-toggle':''});
const loading=api.loading(loadingRoot);advance(1000);assert.equal(clockOutput.textContent,'00:00');assert.equal(done.hidden,false);loading.click({target:restart});assert.equal(clockOutput.textContent,'00:01');assert.equal(done.hidden,true);
loading.click({target:toggle});assert.equal(article.inert,true);assert.equal(article.hidden,false);advance(199);assert.equal(article.hidden,false);advance(1);assert.equal(article.hidden,true);loading.click({target:toggle});assert.equal(article.hidden,false);loading.click({target:toggle});loading.click({target:toggle});advance(200);assert.equal(article.hidden,false,'stale exit cannot hide a newly shown transition');loading.destroy();assert.equal(timers.size,0);
console.log('Source clocks/restart, reversible transitions, measured hover displacement, drag cancellation and commit passed');

// Run production pending controls against two independent buttons and a finite page.
const pendingRoot=new Node(),moreHost=add(pendingRoot,'section',{'data-loading-more':'','data-page-size':'2','data-shown':'1'});
for(let i=0;i<4;i++)add(moreHost,'div',{'data-loading-more-row':''});
const moreButton=add(moreHost,'button',{'data-interaction-more':'','data-interaction-pending-action':'page','data-loading-delay':'900'}),countOutput=add(moreHost,'output',{'data-interaction-more-count':''});
const saveButton=add(pendingRoot,'button',{'data-interaction-loading':'','data-interaction-pending-action':'save'});
const pendingSource=source.slice(source.indexOf('  const pendingTimers ='),source.indexOf('  const close =',source.indexOf('  const pendingTimers =')));
const pendingAPI=runInNewContext(`${pendingSource}\n({begin:beginPending,settle:settlePending})`,{root:pendingRoot,timers,clearTimeout,later:setTimeout,change:(_root,d)=>changes.push(d)});
pendingAPI.begin(moreButton);pendingAPI.begin(saveButton);assert.equal(moreButton.disabled,true);assert.equal(saveButton.disabled,true);pendingAPI.settle(moreButton,false);assert.equal(moreHost.dataset.shown,'1');pendingAPI.begin(moreButton);advance(900);assert.equal(moreHost.dataset.shown,'3');assert.equal(saveButton.disabled,true,'another action must not release Save');pendingAPI.settle(saveButton,true);assert.equal(saveButton.disabled,false);pendingAPI.begin(moreButton);pendingAPI.settle(moreButton,true);assert.equal(moreHost.dataset.shown,'4');assert.equal(moreButton.hidden,true);assert.equal(countOutput.textContent,'Showing 4 of 4');advance(900);assert.equal(moreHost.dataset.shown,'4');

const suspenseRoot=new Node(),suspenseHost=add(suspenseRoot,'section',{'data-interaction-suspense':'','data-loading-delay':'1500'}),resolved=add(suspenseHost,'p',{'data-interaction-suspense-content':''}),rejected=add(suspenseHost,'div',{'data-interaction-suspense-error':''});
const suspenseSource=source.slice(source.indexOf('  const settleSuspense ='),source.indexOf('  const toastStack ='));
const suspenseAPI=runInNewContext(`${suspenseSource}\n({start:startSuspense,settle:settleSuspense})`,{root:suspenseRoot,timers,clearTimeout,later:setTimeout,change:(_root,d)=>changes.push(d)});
suspenseAPI.start(suspenseHost,true);advance(1499);assert.equal(suspenseHost.getAttribute('aria-busy'),'true');advance(1);assert.equal(rejected.hidden,false);suspenseAPI.start(suspenseHost);advance(1500);assert.equal(resolved.hidden,false);assert.equal(rejected.hidden,true);
suspenseAPI.start(suspenseHost,true);suspenseAPI.settle(suspenseHost,false);advance(1500);assert.equal(rejected.hidden,true,'a stale demo failure cannot overwrite the host result');
console.log('Independent pending actions, finite paging, host errors, suspense retry and stale-timer cancellation passed');
