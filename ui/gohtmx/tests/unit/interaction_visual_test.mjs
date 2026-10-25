import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import test from 'node:test';
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
test('interaction common and sheet dispatch use faithful HTMLElement family mocks',()=>{
  const common = readFileSync(new URL('../../assets/ely-api.js', import.meta.url), 'utf8');
  const family = source;
  const commonClick = common.slice(common.indexOf('    const click = event => {'), common.indexOf('    const submit = event => {'));
  const sheetClick = family.slice(family.indexOf('    const sheetAction ='), family.indexOf('    const toastShow ='));
  assert.ok(commonClick.includes('const accepted = emit('));
  assert.ok(sheetClick.includes('closeDialog('));
  
  // Replay the two production branches in listener-registration order. This is
  // dispatch coverage, not a native dialog/focus or trusted-click browser claim.
  for (const action of ['delete', 'select']) {
    const root = {dataset:{elyFamily:'interaction'}}, dialog = {}, calls = [];
    const button = {
      dataset: {elyAction: action, interactionSheetAction: ''},
      value: 'caller-value', disabled: false, type: 'button', tagName: 'BUTTON',
      getAttribute: () => null,
      closest: selector => selector === 'dialog' ? dialog : button,
    };
    const context = {
      root, belongs: (owner, target) => owner === root && target === button,
      emit: (owner, name, detail) => { calls.push({owner, name, value: detail.value}); return true; },
      closeDialog: target => { assert.equal(target, dialog); calls.push('close'); },
    };
    const generic = runInNewContext(`${commonClick}\nclick`, context);
    const sheet = runInNewContext(`target => { ${sheetClick} }`, context);
    generic({target: button, preventDefault() { throw Error('unexpected cancellation'); }});
    sheet(button);
    assert.deepEqual(calls, [{owner: root, name: action, value: 'caller-value'}, 'close']);
  
    // Ordinary public action buttons must still dispatch through the common path.
    delete button.dataset.interactionSheetAction;
    calls.length = 0;
    generic({target: button, preventDefault() {}});
    assert.deepEqual(calls, [{owner: root, name: action, value: 'caller-value'}]);
    button.disabled = true;
    calls.length = 0;
    generic({target: button, preventDefault() {}});
    assert.equal(calls.length, 0);
    // Only forms-owned non-submit buttons delegate; generic links/submits retain core dispatch.
    button.disabled=false;root.dataset.elyFamily='forms';calls.length=0;
    generic({target:button,preventDefault(){}});assert.equal(calls.length,0);
    button.type='submit';generic({target:button,preventDefault(){}});assert.equal(calls.length,1);
    calls.length=0;button.type='';button.tagName='A';generic({target:button,preventDefault(){}});assert.equal(calls.length,1);
  }
});
console.log('Interaction visual behavior: chord chips, quick-action selection, disabled isolation and single sheet dispatch passed.');
