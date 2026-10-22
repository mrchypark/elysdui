import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {requestedStateContract,runRequestedStateActions} from './visual-state-audit-drivers.mjs';

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
  for(const fragment of ["event.target!==node","detail.formData instanceof FormData","Independent audit twin is required","await due.fill('2026-10-20')","await due.press('Tab')","observed.length%2===0","formData:entries,values:entries","submitter:''","keys.slice(index+1)","repeat of [false,true]","row.group!==group","event.panelClosed===true&&event.focusReturned===true"])
    assert(driver.includes(fragment),`Missing independently observable contract assertion: ${fragment}`);
  assert.match(driver,/await target.click\(\)/);assert.match(driver,/await control.click\(\)/);
});
