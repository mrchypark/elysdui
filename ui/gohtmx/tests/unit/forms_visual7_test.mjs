import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../assets/ely-api-forms.js',import.meta.url),'utf8');
const fit=runInNewContext(source.slice(source.indexOf('export function fitFormMask'),source.indexOf('const bundledIcons')).replace('export ','')+';fitFormMask');
for(const [mask,value,want] of [['###-####-####','01098765432','010-9876-5432'],['(999) 999-9999','2125550123','(212) 555-0123'],['aa-9999','aB1234','aB-1234'],['aa-9999','12a!B-12x34','aB-1234'],['aa-9999','aB-1234','aB-1234'],['aa-9999','',''],['**-99','Z712','Z7-12']])assert.equal(fit(mask,value),want);
// Execute production event branches with deterministic DOM collaborators.
const actions=[],root={},unit={dataset:{elyUnit:'px'},matches:s=>s==='[data-ely-unit]'};
const unitBranch=source.match(/if\(button.matches\('\[data-ely-unit\]'\)\)\{[^\n]+/)[0];
const cycle=runInNewContext('(button)=>{'+unitBranch+'}',{root,all:()=>['px','%','em'].map(elyUnitOption=>({dataset:{elyUnitOption}})),q:()=>({value:'16'}),changed:(_root,payload)=>actions.push(payload)});
cycle(unit);assert.equal(unit.textContent,'%');cycle(unit);assert.equal(unit.textContent,'em');cycle(unit);assert.equal(unit.textContent,'px');assert.equal(actions.length,3);assert.equal(actions[0].value,'16');
const number={dataset:{},value:'2125550123'},country={value:'GB',matches:s=>s==='[data-ely-phone-country]',selectedOptions:[{dataset:{mask:'9999 999999'}}]};
const countryBranch=source.match(/if\(field.matches\('\[data-ely-phone-country\]'\)\)\{[^\n]+/)[0];
const change=runInNewContext('(field)=>{'+countryBranch+'}',{root,q:()=>number,fitFormMask:fit,changed:(_root,payload)=>actions.push(payload)});
change(country);assert.equal(number.value,'2125 550123');assert.equal(number.placeholder,'____ ______');assert.equal(actions.at(-1).country,'GB');assert.equal(actions.at(-1).value,number.value);
console.log('Forms visual7: legacy/source masks, filtered paste, unit cycle and country-change state/payload passed');
const checks=readFileSync(new URL('../../../../internal/gallery/assets/advanced-forms-checks.js',import.meta.url),'utf8');
const measure=runInNewContext(checks.slice(checks.indexOf('export function checkFormsVisual7Layout'),checks.indexOf('\nconst need=')).replace('export ','')+';checkFormsVisual7Layout',{assert:(ok,message)=>assert.ok(ok,message),getComputedStyle:node=>({backgroundColor:node.background||'rgba(0, 0, 0, 0)'})});
const rect=(width,height,left=0,top=0)=>({width,height,left,top,right:left+width,bottom:top+height});
const radio={getBoundingClientRect:()=>rect(16,16),closest:()=>({getBoundingClientRect:()=>rect(90,21),closest:()=>null})};
const stars=Array.from({length:5},()=>({})),rating={getBoundingClientRect:()=>rect(108,24),querySelectorAll:()=>stars};
const knob={getBoundingClientRect:()=>rect(48,48),closest:()=>({querySelector:()=>({})})};
const scope={querySelectorAll:s=>s==='.ely-api-radio-group input[type=radio]'?[radio]:s==='.ely-api-rating'?[rating]:s==='[data-ely-knob]'?[knob]:[]};
measure(scope);
radio.getBoundingClientRect=()=>rect(36,36);assert.throws(()=>measure(scope),/compact native/);radio.getBoundingClientRect=()=>rect(16,16);
rating.getBoundingClientRect=()=>rect(195,24);assert.throws(()=>measure(scope),/compact stars/);rating.getBoundingClientRect=()=>rect(108,24);
stars[0].background='rgb(0, 0, 0)';assert.throws(()=>measure(scope),/selected rectangles/);delete stars[0].background;
knob.getBoundingClientRect=()=>rect(72,72);assert.throws(()=>measure(scope),/48px/);
console.log('Forms geometry assertions reject 36px radios, 195px rating, filled star rectangles and 72px knobs');

const choiceCode=checks.slice(checks.indexOf('export function checkChoiceCardState'),checks.indexOf("checks['forms/CheckboxCard']=")).replace('export ','');
const choiceCheck=runInNewContext(choiceCode+';checkChoiceCardState',{assert:(ok,message)=>assert.ok(ok,message),need:(root,selector)=>root.querySelector(selector)});
function choices(type,broken){
 const controls=[true,false].map(checked=>({type,name:'caller_value',checked,disabled:false}));
 for(const control of controls)control.click=()=>{if(type==='checkbox'){control.checked=!control.checked;if(broken==='linked')controls[1].checked=!controls[1].checked;}else if(broken==='toggle'){const before=control.checked;controls.forEach(other=>other.checked=false);control.checked=!before;}else {if(broken!=='multiple')controls.forEach(other=>other.checked=false);control.checked=true;}};
 return {querySelectorAll:()=>controls.map(control=>({querySelector:()=>control}))};
}
choiceCheck(choices('radio'));choiceCheck(choices('checkbox'));
assert.throws(()=>choiceCheck(choices('radio','multiple')),/exclusive/);
assert.throws(()=>choiceCheck(choices('radio','toggle')),/retain/);
assert.throws(()=>choiceCheck(choices('checkbox','linked')),/independent/);
console.log('Caller card checks accept exclusive radio/independent checkbox behavior and reject broken selection semantics');

// Caller labels may span lines; fixed source specimen labels must still fit.
knob.getBoundingClientRect=()=>rect(48,48);
radio.closest=()=>({getBoundingClientRect:()=>rect(180,42),closest:()=>null});measure(scope);
radio.closest=()=>({getBoundingClientRect:()=>rect(180,42),closest:()=>({})});
assert.throws(()=>measure(scope),/Source radio label/);
console.log('Caller multiline labels accepted; wrapped source specimen labels still rejected');

// Execute the shared check against each exact caller fixture, not inferred options.
const pickerCode=checks.slice(checks.indexOf("checks['forms/IconPicker']="),checks.indexOf("checks['forms/GradientEditor']="));
const pickerDocument={activeElement:null};
const pickerCheck=runInNewContext('const checks={};'+pickerCode+";checks['forms/IconPicker']",{
 assert:(ok,message)=>assert.ok(ok,message),document:pickerDocument,
 KeyboardEvent:class {constructor(type,options){this.type=type;Object.assign(this,options);}},
 need:(root,selector)=>{const node=root.querySelector(selector);assert.ok(node,`Missing ${selector}`);return node;},
 input:(node,value)=>node.input(value)
});
function pickerFixture(component,values,broken){
 const selected={value:''},empty={hidden:true},queries=[];
 const labels=values[0]==='✨'?['Sparkles','Woman technologist']:['alpha','beta'];
 const options=values.map((value,index)=>({
  value,hidden:false,querySelector:()=>null,
  focus(){pickerDocument.activeElement=this;},
  click(){selected.value=broken==='value'?'wrong':value;},
  dispatchEvent(event){if(event.key==='ArrowRight'&&broken!=='navigation')options[index+1]?.focus();}
 }));
 const search={
  input(query){queries.push(query);options.forEach((option,index)=>{option.hidden=broken==='search'||!labels[index].toLowerCase().includes(query.toLowerCase());});empty.hidden=options.some(option=>!option.hidden);},
  dispatchEvent(event){if(event.key==='ArrowDown'&&broken!=='navigation')options.find(option=>!option.hidden)?.focus();}
 };
 return {dataset:{elyComponent:component},queries,selected,
  querySelector(selector){
   if(selector==='[data-ely-icon-search]')return search;
   if(selector==='[data-ely-icon-value]')return selected;
   if(selector==='[data-ely-icon-empty]')return empty;
   return options.find(option=>selector===`[data-ely-icon-option][value="${option.value}"]`);
  }
 };
}
for(const [component,values,query] of [
 ['forms/IconPicker',['alpha','beta'],'alpha'],
 ['forms/EmojiPicker',['✨','👩‍💻'],'Sparkles']
]){
 const fixture=pickerFixture(component,values);
 await pickerCheck({root:fixture});
 assert.deepEqual(fixture.queries,[query,'no-matching-icon','']);
 assert.equal(fixture.selected.value,values[0]);
 assert.equal(pickerDocument.activeElement.value,values[1]);
 const wrongValues=component==='forms/EmojiPicker'?['alpha','beta']:['✨','👩‍💻'];
 await assert.rejects(pickerCheck({root:pickerFixture(component,wrongValues)}),/Missing .*data-ely-icon-option/);
 for(const broken of ['search','navigation','value']){
  await assert.rejects(pickerCheck({root:pickerFixture(component,values,broken)}),/Icon search hid|ArrowDown did not|Icon value did not/);
 }
}
console.log('Exact IconPicker/EmojiPicker checks pass search, navigation and values; wrong fixtures and broken behavior rejected');
