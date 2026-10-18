import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync('ui/gohtmx/assets/ely-api-interaction.js','utf8');
const start=source.indexOf("  root.querySelectorAll('[data-direct-keycaps]').forEach");
const end=source.indexOf("  root.querySelectorAll('[data-interaction-hotkeys]').forEach(host => listen",start);
const node=(text='')=>({textContent:text,children:[],append(child){this.children.push(child);},replaceChildren(){this.children=[];}});
const combo=node();combo.dataset={directKeycaps:'Meta+k Meta+s'};
const context={root:{querySelectorAll:()=>[combo]},document:{createElement:()=>node(),createTextNode:text=>node(text)}};
for(let mount=0;mount<2;mount++){
 runInNewContext(source.slice(start,end),context);
 assert.deepEqual(combo.children.map(group=>group.children.map(cap=>cap.textContent)),[['Meta','+','K'],['Meta','+','S']]);
}
// Pointer selection retains one keyboard entry point and ignores disabled actions.
const actions=[{tabIndex:0},{tabIndex:-1},{tabIndex:-1,disabled:true}];actions.forEach(action=>action.closest=()=>({querySelectorAll:()=>actions}));
const pointer=source.slice(source.indexOf('  const pointerover = event => {'),source.indexOf("    const row = closest(root, event.target, '.ely-interaction__menu-row');",source.indexOf('  const pointerover = event => {')))+'}; pointerover';
const select=runInNewContext(pointer,{root:{},closest:(_root,target)=>target});select({target:actions[1]});assert.deepEqual(actions.map(a=>a.tabIndex),[-1,0,-1]);select({target:actions[2]});assert.deepEqual(actions.map(a=>a.tabIndex),[-1,0,-1]);
console.log('Interaction visual behavior: chord chips survive remount; quick-action selection and disabled isolation passed.');
