import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('./assets/ely-api-interaction.js',import.meta.url),'utf8');
const branch=(start,end)=>source.slice(source.indexOf(start),source.indexOf(end,source.indexOf(start)));
const events=[],root={};
const item=(value,on)=>({value,attrs:{'aria-pressed':String(on),'aria-checked':String(on)},getAttribute(k){return this.attrs[k]},setAttribute(k,v){this.attrs[k]=v}});
const a=item('a',true),b=item('b',false);const group={querySelectorAll:()=>[a,b]};let multiple=true;
for(const n of [a,b])n.closest=s=>s.includes('="single"')?(multiple?null:group):group;
const toggle=runInNewContext('(target)=>{'+branch("    const toggle = target?.closest('[data-interaction-toggle]');","    const choice = target?.closest('[data-interaction-choice]');")+'}',{root,change:(_,d)=>events.push(d)});
toggle({closest:()=>b});assert.deepEqual([...events.at(-1).values],['a','b']);toggle({closest:()=>a});assert.deepEqual([...events.at(-1).values],['b']);multiple=false;toggle({closest:()=>a});assert.deepEqual([...events.at(-1).values],['a']);toggle({closest:()=>a});assert.deepEqual([...events.at(-1).values],[]);
const choice=runInNewContext('(target)=>{'+branch("    const choice = target?.closest('[data-interaction-choice]');","    const checkbox = target?.closest('[data-interaction-checkbox]');")+'}',{root,change:(_,d)=>events.push(d)});
a.closest=b.closest=()=>group;const before=events.length;choice({closest:()=>a});assert.equal(events.length,before,'reselecting radio is not a change');choice({closest:()=>b});assert.equal(events.length,before+1);assert.equal(a.tabIndex,-1);assert.equal(b.tabIndex,0);
console.log('Production selection handlers: full toggle selection, deselection, radio idempotence and roving tab state passed');
const tabA=item('a',false),tabB=item('b',false),disabled=item('off',false);
for (const [i,n] of [tabA,disabled,tabB].entries()) {n.attrs['aria-selected']=String(n===disabled);n.attrs['aria-controls']='panel-'+i;n.panel={hidden:n!==disabled};}
const tabGroup={querySelectorAll:selector=>selector.includes(':not(:disabled)')?[tabA,tabB]:[tabA,disabled,tabB]};
for(const n of [tabA,disabled,tabB])n.closest=()=>tabGroup;
root.querySelector=selector=>[tabA,disabled,tabB].find(n=>'#'+n.attrs['aria-controls']===selector)?.panel;
const tab=runInNewContext('(target)=>{'+branch("    const tab = target?.closest('[data-interaction-tab]');","    const page = target?.closest('[data-interaction-page]');")+'}',{root,CSS:{escape:s=>s},change:(_,d)=>events.push(d)});
tab({closest:()=>tabB});assert.equal(disabled.panel.hidden,true,'disabled prior panel is hidden');assert.equal(disabled.attrs['aria-selected'],'false');assert.equal(tabB.panel.hidden,false);const tabBefore=events.length;tab({closest:()=>tabB});assert.equal(events.length,tabBefore,'active tab reselect is idempotent');
console.log('Production tab handler: disabled selection cleanup and reselect idempotence passed');

const snapshots=[];
const atomicTab=runInNewContext('(target)=>{'+branch("    const tab = target?.closest('[data-interaction-tab]');","    const page = target?.closest('[data-interaction-page]');")+'}',{root,CSS:{escape:s=>s},change:()=>snapshots.push([tabA,disabled,tabB].map(n=>({selected:n.attrs['aria-selected'],hidden:n.panel.hidden})))});
atomicTab({closest:()=>tabA});assert.deepEqual(snapshots,[[{selected:'true',hidden:false},{selected:'false',hidden:true},{selected:'false',hidden:true}]],'change observers see fully committed selection');

// EditorTabs shares this handler and legacy callers may render multiple selections.
tabB.attrs['aria-selected']='true';tabB.panel.hidden=false;
atomicTab({closest:()=>tabA});assert.equal(tabB.attrs['aria-selected'],'false');assert.equal(tabB.panel.hidden,true);
const enabled=[{value:'a'},{value:'b'}],keyCalls=[];
const unavailable={value:'off',disabled:true,click:()=>keyCalls.push('off'),focus:()=>keyCalls.push('focus:off')};
const keyItems=selector=>selector.endsWith(':not(:disabled)')?enabled:[enabled[0],unavailable,enabled[1]];
for(const n of enabled){n.click=()=>keyCalls.push(n.value);n.focus=()=>keyCalls.push('focus:'+n.value);n.closest=()=>({querySelectorAll:keyItems});}
root.dataset={};
const radioKey=runInNewContext('(event)=>{'+branch("    const choice = closest(root, event.target, '[data-interaction-choice]');","    const orientation = tab?.closest")+'}',{root,closest:(_,target)=>target});
for(const [key,current,want] of [['ArrowLeft',1,'a'],['ArrowRight',1,'a'],['Home',1,'a'],['End',0,'b'],['ArrowUp',0,'b'],['ArrowDown',0,'b']]){radioKey({target:enabled[current],key,preventDefault(){}});assert.equal(keyCalls.at(-2),want);}
const callCount=keyCalls.length;radioKey({target:{disabled:true},key:'Home',preventDefault(){}});assert.equal(keyCalls.length,callCount);
let orientation='vertical';
for(const n of enabled)n.closest=selector=>selector==='[role="tablist"]'?{getAttribute:()=>orientation}:{querySelectorAll:keyItems};
const tabKey=runInNewContext('(tab,event)=>{'+branch("    const orientation = tab?.closest", "    const hotkeys = closest")+'}',{});
tabKey(enabled[0],{key:'ArrowUp',preventDefault(){}});assert.equal(keyCalls.at(-2),'b');orientation='horizontal';tabKey(enabled[1],{key:'ArrowRight',preventDefault(){}});assert.equal(keyCalls.at(-2),'a');const tabCalls=keyCalls.length;tabKey({...enabled[0],disabled:true},{key:'Home',preventDefault(){}});assert.equal(keyCalls.length,tabCalls);
console.log('Production keyboard branches: radio arrows/Home/End, tab orientation/wrap and disabled target guards passed');
tabKey(enabled[0],{key:'ArrowRight',preventDefault(){}});assert.equal(keyCalls.at(-2),'b','horizontal tab arrow skips disabled middle item');orientation='vertical';tabKey(enabled[1],{key:'ArrowUp',preventDefault(){}});assert.equal(keyCalls.at(-2),'a','vertical tab arrow skips disabled middle item');
