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
