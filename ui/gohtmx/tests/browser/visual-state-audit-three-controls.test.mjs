import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {requestedStateContract,runRequestedStateActions,assertStatusSelectDueEvents} from './visual-state-audit-drivers.mjs';

const source=path=>readFile(new URL(`../../../../${path}`,import.meta.url),'utf8');

test('three exact public contracts declare ten steps without alias promotion',()=>{
  const expected=[
    ['project/StatusSelect','StatusSelect','task-due-submit',['change-due','submit-current-due']],
    ['data/Tag','Tag','remove-four-tags',['remove-design','remove-motion','remove-accessibility','remove-rust']],
    ['menus/RadioMenuItem','CheckboxMenuItem','radio-groups-reselection',['select-default','reselect-default','select-density','reselect-density']],
  ];
  for(const [identity,kind,sequence,steps] of expected){
    const contract=requestedStateContract(identity);
    assert.equal(contract.identity,identity);assert.equal(contract.kind,kind);assert.equal(contract.focusedSequence,sequence);
    assert.deepEqual(contract.steps.map(step=>step.id),steps);assert.deepEqual(contract.mappingGaps,[]);
    assert.equal(contract.requestedStateOnly,true);assert.match(contract.scope,/separate from registered-check coverage/);
    assert(contract.steps.every(step=>step.source.provenance&&step.source.sourceAnchor===null&&step.source.siteId.startsWith(`focused-state:${identity}:`)));
  }
  for(const alias of ['project/AssigneePicker','project/DueDatePicker','data/Chip','menus/CheckboxMenuItem','menus/Menu'])assert.equal(requestedStateContract(alias),null,`${alias} has no independently verified equivalent sequence`);
});

test('due and tag expectations agree with actual public templates, handlers and fixture',async()=>{
  const [communication,projectFixture,api,data,tagFixture,tagTemplate]=await Promise.all([
    source('ui/gohtmx/assets/ely-api-communication.js'),source('internal/gallery/advanced_communication_fixtures.go'),source('ui/gohtmx/assets/ely-api.js'),
    source('ui/gohtmx/assets/ely-api-data.js'),source('internal/gallery/advanced_data_fixtures.go'),source('ui/gohtmx/templates/ely-api-data.html'),
  ]);
  assert.match(projectFixture,/'?"In progress", "brief", "In progress", "2026-10-12", "ana"/);
  assert.match(communication,/changed\(root,input.name,input.value,\{taskId:form.dataset.taskId\}\);emit\(root,'update-task',\{taskId:form.dataset.taskId,field:input.name,value:input.value,formData:data,values:\[\.\.\.data\]\}\)/);
  assert.match(api,/submitter: event.submitter\?\.value \|\| ''/);
  assert.match(tagTemplate,/data-ely-tag-remove value="\{\{.Value\}\}" aria-label="Remove \{\{.Label\}\}"/);
  for(const key of ['design','motion','accessibility','rust'])assert.match(tagFixture,new RegExp(`"Value": "${key}"[^\\n]+"Removable": true`));
  assert.match(data,/tag\?\.remove\(\);\s*emit\(root, 'tag-remove', \{ value \}\)/);
});

test('radio contract retains group isolation, reselection and settled event semantics',async()=>{
  const [interaction,docs]=await Promise.all([source('ui/gohtmx/assets/ely-api-interaction.js'),source('docs/gohtmx/menu-alias-contracts.md')]);
  assert.match(interaction,/item.closest\('\[role="menu"\]'\) === panel && item.dataset.interactionMenuRadio === radio.dataset.interactionMenuRadio/);
  assert.match(interaction,/close\(true\);\s*change\(root, \{name: radio.dataset.interactionMenuRadio, value: radio.value, checked: true\}\);\s*menuAction\(root, event, radio\)/);
  assert.match(docs,/invokes the caller when reselecting/);
  const driver=runRequestedStateActions.toString();
  for(const fragment of ["event.target!==node","detail.formData instanceof FormData","Independent audit twin is required","await due.fill('2026-10-20')","await due.press('Tab')","assertStatusSelectDueEvents(observed,{id,identity,entries,nativeChangeCount:await dueChanges()-dueChangesBefore})","submitter:''","keys.slice(index+1)","repeat of [false,true]","row.group!==group","event.panelClosed===true&&event.focusReturned===true"])
    assert(driver.includes(fragment),`Missing independently observable contract assertion: ${fragment}`);
  assert.match(driver,/await target.click\(\)/);assert.match(driver,/await control.click\(\)/);
});

test('StatusSelect due commit retains generic change then task change/action from actual handler bodies',async()=>{
  const [api,project,template]=await Promise.all([source('ui/gohtmx/assets/ely-api.js'),source('ui/gohtmx/assets/ely-api-communication.js'),source('ui/gohtmx/templates/ely-api-communication.html')]);
  assert.match(template,/<input type="date" name="due"[^>]+data-project-property/);
  assert(api.indexOf("root.addEventListener('change', change)")<api.indexOf('registerCleanup(initialize(root,'),'Generic listener is registered before family initializer');
  const generic=api.slice(api.indexOf('    const change = event => {'),api.indexOf("    root.addEventListener('click', click);"));
  const projectChange=project.slice(project.indexOf("  root.addEventListener('change',event=>{const input=event.target;"),project.indexOf("  root.addEventListener('input',event=>{if(event.target.matches('[data-project-label-name]"));
  assert(projectChange.length>0);
  const entries=[['status','In progress'],['assignee','ana'],['due','2026-10-20']],identity='project/StatusSelect',id='actual-status';
  class FixtureFormData{constructor(form){this.entries=form.entries;}[Symbol.iterator](){return this.entries[Symbol.iterator]();}}
  const form={entries,dataset:{taskId:'brief'},reportValidity:()=>true};
  const field={name:'due',value:'2026-10-20',type:'date',checked:false,closest:selector=>{assert.equal(selector,'form');return form;},matches:selector=>selector==='input,textarea,select'||selector==='[data-project-property]'};
  const root=new EventTarget();root.id=id;root.dataset={elyComponent:identity};const observed=[],nativeListeners=[];
  for(const type of ['ely:change','ely:action'])root.addEventListener(type,event=>{const detail={...event.detail};if(detail.formData instanceof FixtureFormData)detail.formData=[...detail.formData];observed.push({type,detail});});
  nativeListeners.push(new Function('root','belongs',`${generic};return change;`)(root,()=>true));
  const changedCode=project.match(/const changed=([^\n]+);/)[0];
  const emitCode=api.slice(api.indexOf('export function emit('),api.indexOf('\nfunction belongs(')).replace('export ','');
  const emit=new Function(`${emitCode};return emit;`)();
  const registrationRoot={addEventListener(type,listener){assert.equal(type,'change');nativeListeners.push(listener);}};
  new Function('root','options','FormData','changed','emit',projectChange)(registrationRoot,{},FixtureFormData,new Function(`${changedCode};return changed;`)(),(_root,...args)=>emit(root,...args));
  // The real callback closes over the registration root; share its event identity.
  registrationRoot.id=id;registrationRoot.dataset=root.dataset;registrationRoot.dispatchEvent=event=>root.dispatchEvent(event);
  for(const listener of nativeListeners)listener({target:field});
  const before=structuredClone(observed);assert.equal(observed.length,3);assert.deepEqual(assertStatusSelectDueEvents(observed,{id,identity,entries,nativeChangeCount:1}),before);assert.deepEqual(observed,before,'Raw event history is not normalized or filtered');
  assertStatusSelectDueEvents([...observed,...observed],{id,identity,entries,nativeChangeCount:2});
  assert.throws(()=>assertStatusSelectDueEvents([...observed,...observed],{id,identity,entries,nativeChangeCount:1}),'Duplicate complete triplets without another native change must fail');
  for(const count of [0,-1,1.5,undefined])assert.throws(()=>assertStatusSelectDueEvents(observed,{id,identity,entries,nativeChangeCount:count}));
  for(const mutate of [events=>events.shift(),events=>events.pop(),events=>events.reverse(),events=>events.push(events[0]),events=>{events[0].detail.checked=true;},events=>{events[0].detail.type='text';},events=>{events[1].detail.taskId='other';},events=>{events[2].detail.component='alias';},events=>{events[2].detail.formData=[['due','stale']];}]){const bad=structuredClone(observed);mutate(bad);assert.throws(()=>assertStatusSelectDueEvents(bad,{id,identity,entries,nativeChangeCount:1}));}
});
