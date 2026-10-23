import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {requestedStateContract,assertTrashLayout} from './visual-state-audit-drivers.mjs';

test('Trash requested states require explicit distinct fixture identities and preserve host boundaries',()=>{
  assert.equal(requestedStateContract('documents/TrashBin'),null);
  assert.throws(()=>requestedStateContract('documents/TrashBin','unknown'));
  for(const fixture of ['default','empty','longpath']){
    const contract=requestedStateContract('documents/TrashBin',fixture);
    assert.equal(contract.identity,'documents/TrashBin');assert.equal(contract.trashFixture,fixture);
    assert.equal(contract.steps.length,fixture==='empty'?1:10);
    assert.equal(contract.steps[0].event,'passive rendered-state inspection');
    assert(contract.steps.slice(1).every(step=>step.event==='trusted native pointer click'));
    if(fixture!=='empty')assert.deepEqual(contract.steps.map(step=>step.id),['inspect-layout','restore','delete-arm','delete-blur-restore','delete-rearm','delete-confirm','empty-arm','empty-blur-restore','empty-rearm','empty-confirm']);
    assert.match(contract.scope,/never local persistence/);
  }
});

test('Trash geometry rejects actual horizontal/vertical escapes overlap and clipped labels',()=>{
  const good={card:{left:0,top:0,right:308,bottom:180},boxes:[{kind:'text',label:'complete caller path',left:16,top:10,right:200,bottom:30},{kind:'button',label:'Confirm empty trash',left:16,top:50,right:170,bottom:80,scrollWidth:154,clientWidth:154,scrollHeight:30,clientHeight:30}]};
  assertTrashLayout(good);
  for(const mutate of [x=>x.boxes[1].right=320,x=>x.boxes[1].bottom=192,x=>x.boxes[1].top=20,x=>x.boxes[1].scrollWidth+=2,x=>x.boxes[1].scrollHeight+=3,x=>x.boxes[0].right=Infinity]){
    const broken=structuredClone(good);mutate(broken);
    assert.throws(()=>assertTrashLayout(broken));
  }
});

test('Trash source keeps genuine pointer activation confirmation exact payload and immutable peer guards',async()=>{
  const source=await readFile(new URL('./visual-state-audit-drivers.mjs',import.meta.url),'utf8');
  const branch=source.slice(source.indexOf('if(contract.trashFixture){'),source.indexOf("if(['task-due-submit'"));
  for(const text of ["document.addEventListener('click'","trusted:event.isTrusted","clickVisibleControl(control)","clicks.length,count+1","clicks.at(-1).trusted,true","after.actions.slice(before.actions.length)","formData:null,values:[]","Every Trash state must preserve its independent twin","Host request must not remove caller records","Confirm empty trash","Confirm delete"]){assert(branch.includes(text),text);}
  assert(!branch.includes('.dispatchEvent('));assert(!branch.includes('.focus('));assert(!branch.includes('force:true'));
});

test('actual Trash handlers preserve label span and immediate confirmation cancellation with exact dispatch',async()=>{
  const workspace=await readFile(new URL('../../assets/ely-api-workspace.js',import.meta.url),'utf8');
  const start=workspace.indexOf("  onRoot('click', event => {\n    const button=event.target.closest('[data-ws-trash-confirm]');");
  const end=workspace.indexOf("  onRoot('click', event => {\n    const cover=",start);
  assert(start>=0&&end>start);
  const helper=workspace.slice(start,end);
  const api=await readFile(new URL('../../assets/ely-api.js',import.meta.url),'utf8');
  const clickSource=api.slice(api.indexOf('    const click = event => {'),api.indexOf('    const submit = event => {'));
  const emitSource=api.slice(api.indexOf('export function emit('),api.indexOf('\nfunction belongs(')).replace('export ','');
  for(const [initial,action]of [['Delete','delete-file-permanently'],['Empty trash','empty-trash']])for(const bare of [false,true]){
    const run=(source=helper)=>{
      const callbacks=new Map(),root=new EventTarget(),actions=[];root.id='caller-trash';root.dataset={elyComponent:'documents/TrashBin'};
      root.addEventListener('ely:action',event=>actions.push(event.detail));
      const label={textContent:initial};
      const button={disabled:false,type:'button',form:null,value:action==='empty-trash'?'':'caller-id',dataset:{elyAction:action},querySelector:selector=>{assert.equal(selector,'[data-ws-trash-label]');return bare?null:label;},getAttribute:()=>null};
      Object.defineProperty(button,'textContent',{get:()=>label.textContent,set:value=>{if(!bare)throw new Error('destroyed visible label span');label.textContent=value;}});
      new Function('onRoot',source)((type,callback)=>callbacks.set(type,callback));
      const emit=new Function(`${emitSource};return emit;`)();
      const generic=new Function('root','belongs','emit','FormData',`${clickSource};return click;`)(root,()=>true,emit,FormData);
      const click=target=>{const event={target:{closest:selector=>selector==='[data-ws-trash-confirm]'?(target===button?button:null):target},preventDefault(){this.prevented=true;},stopImmediatePropagation(){this.stopped=true;}};callbacks.get('click')(event);if(!event.stopped)generic(event);return event;};
      return {button,label,actions,click,blur:()=>callbacks.get('focusout')({target:{closest:()=>button}})};
    };
    const state=run();
    const first=state.click(state.button);assert(first.prevented&&first.stopped);assert.deepEqual(state.actions,[]);assert.equal(state.label.textContent,'Confirm '+initial.toLowerCase());
    state.blur();assert.equal(state.label.textContent,initial);assert.equal(state.button.dataset.confirming,'false');assert.deepEqual(state.actions,[]);
    // A normal other-button activation follows immediate blur; it is not swallowed.
    const restore={disabled:false,type:'button',form:null,value:'caller-id',dataset:{elyAction:'restore-file'},getAttribute:()=>null};
    state.click(restore);assert.deepEqual(state.actions,[{value:'caller-id',formData:null,values:[],id:'caller-trash',component:'documents/TrashBin',action:'restore-file'}]);
    state.actions.length=0;state.click(state.button);assert.deepEqual(state.actions,[]);state.click(state.button);
    assert.deepEqual(state.actions,[{value:state.button.value,formData:null,values:[],id:'caller-trash',component:'documents/TrashBin',action}]);assert.equal(state.label.textContent,initial);
    state.actions.length=0;state.button.disabled=true;state.click(state.button);assert.deepEqual(state.actions,[]);assert.equal(state.label.textContent,initial);
    if(!bare){
      const destructive=helper.replace("const label=button.querySelector('[data-ws-trash-label]')||button;","const label=button;");assert.notEqual(destructive,helper);
      const red=run(destructive);assert.throws(()=>red.click(red.button),/destroyed visible label span/);
    }
  }
});
