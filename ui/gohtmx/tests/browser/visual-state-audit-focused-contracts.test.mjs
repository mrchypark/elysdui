import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {runInNewContext} from 'node:vm';
import {assertSpecialInputState} from './visual-state-audit-drivers.mjs';
import {assertRegionalFormStep} from './visual-state-audit-drivers.mjs';
import {assertPathNativeStep} from './visual-state-audit-drivers.mjs';
import {assertRangeFormStep} from './visual-state-audit-drivers.mjs';
import {assertComplexFormStep} from './visual-state-audit-drivers.mjs';
import {assertCronNativePreview} from './visual-state-audit-drivers.mjs';
import {assertJsonHighlight} from './visual-state-audit-drivers.mjs';
import {nativeDateFocusedSegment,nativeDateKeyboardRoute,assertNativeDateResult} from './visual-state-audit-drivers.mjs';
import {assertFormTwinWitness,isDurationOwnUnitCommit} from './visual-state-audit-drivers.mjs';
import {assertEightFormStep,assertDurationNativeProof,probeFailureStateAndPayload,retainFailurePayload,cleanupPreservingPrimary} from './visual-state-audit-drivers.mjs';
import {assertActivityLogScopedAuditPage,assertCommunicationCallerRequest,assertDockCallerAction,assertDockNativeEvents,assertEvalLastColumnGeometry,assertNativeEmbedOpen,activatePresenceStep,assertPresenceNativeRequest,assertFoundationPublicEvents,assertPlainInputNativeEvents,assertFormattedInputState,calendarDraftWheelDecision,requestedStateContract,runRequestedStateActions} from './visual-state-audit-drivers.mjs';

const read=path=>readFile(new URL(`../../../../${path}`,import.meta.url),'utf8');

test('complex eight forms require twenty whole ordered native and public windows',()=>{
  const n=(type,control,value,trusted=true,key=null)=>({type,control,value,trusted,key});
  let count=0;
  for(const name of ['FormField','FormSection','InlineForm','FieldArray','TagInput','TokenInput','HashtagInput','MentionInput']){
    const identity='forms/'+name,contract=requestedStateContract(identity);assert.equal(contract.nativeFormTwinWitness,true);
    const p=detail=>({type:'ely:change',detail:{...detail,id:'primary',component:identity}}),c=(name,value,type='text')=>p({name,value,...(type==='textarea'?{}:{checked:false}),type});
    const email='caller@example.test',url='https://example.test',tag='NewCallerTag',query=name==='HashtagInput'?'#b':'@b',inserted=name==='HashtagInput'?'#beta ':'@beta ';
    let rows;
    if(['FormField','FormSection','InlineForm'].includes(name))rows=[
      ['email-edit',{value:email,valid:true},[n('input','field',email)]],
      ['email-commit',{value:email,valid:true},[n('keydown','field',email,true,'Tab'),n('change','field',email),c('email',email,'email'),n('blur','field',email)]],
      ...(name==='InlineForm'?[['form-submit',{value:email,valid:true},[n('click','submit',''),n('submit','form',null),{type:'ely:action',actualFormData:true,detail:{formData:[['email',email]],values:[['email',email]],submitter:'',id:'primary',component:identity,action:'save'}}]]]:[]),
    ];
    else if(name==='FieldArray')rows=[
      ['array-add',{values:[''],forms:0},[n('click','add',''),p({name:'links',values:['']})]],
      ['array-edit',{values:[url],forms:0},[n('input','field',url)]],
      ['array-remove',{values:[],forms:0},[n('change','field',url),c('links',url),n('blur','field',url),n('click','remove',''),p({name:'links',values:[]})]],
    ];
    else if(name==='TagInput'||name==='TokenInput')rows=[
      ['tag-edit',{value:'alpha',entry:tag,tags:['alpha']},[n('input','field',tag)]],
      ['tag-add',{value:'alpha,'+tag,entry:'',tags:['alpha',tag]},[n('keydown','field',tag,true,'Enter'),n('input','hidden','alpha,'+tag,false),n('change','hidden','alpha,'+tag,false),c('caller_value','alpha,'+tag,'hidden')]],
      ['tag-remove',{value:'alpha',entry:'',tags:['alpha']},[n('blur','field',''),n('click','remove',tag),n('input','hidden','alpha',false),n('change','hidden','alpha',false),c('caller_value','alpha','hidden')]],
    ];
    else rows=[
      ['mention-edit',{value:query,listHidden:false,visible:['beta']},[n('input','field',query)]],
      ['mention-select',{value:inserted,listHidden:true,visible:['alpha','beta']},[n('change','field',query),c('caller_value',query,'textarea'),n('blur','field',query),n('click','option','beta'),n('input','field',inserted,false),n('change','field',inserted,false),c('caller_value',inserted,'textarea'),n('blur','option','beta')]],
    ];
    assert.deepEqual(contract.steps.map(s=>s.id),rows.map(r=>r[0]));
    for(const [stage,state,events]of rows){
      const proof={identity,rootID:'primary',truncated:false,foreignEvents:false,state,events,focusLeft:stage==='email-commit',siblings:name==='FormField'||name==='FormSection'?[['name',''],['bio','']]:[],submitterMatches:true,submitDefaultPrevented:true};
      assertComplexFormStep(identity,stage,proof);count++;
      for(const mutate of [p=>p.identity='forms/Other',p=>p.truncated=true,p=>p.foreignEvents=true,p=>p.events[0].trusted=false,p=>p.events.push({type:'ely:action',detail:{action:'save'}}),p=>p.events.pop()]){const bad=structuredClone(proof);mutate(bad);assert.throws(()=>assertComplexFormStep(identity,stage,bad));}
      if(events.length>1){const bad=structuredClone(proof);bad.events.reverse();assert.throws(()=>assertComplexFormStep(identity,stage,bad));}
      if(stage==='form-submit'){
        for(const mutate of [p=>p.submitterMatches=false,p=>p.submitDefaultPrevented=false,p=>p.events[2].actualFormData=false,p=>p.events[2].detail.formData=[['email','stale']],p=>p.events.push(p.events[2])]){const bad=structuredClone(proof);mutate(bad);assert.throws(()=>assertComplexFormStep(identity,stage,bad));}
      }
      if(stage==='email-commit')assert.throws(()=>assertComplexFormStep(identity,stage,{...proof,focusLeft:false}));
      if(stage==='tag-remove'){const committed=structuredClone(proof);committed.events.unshift(n('change','field',''));assertComplexFormStep(identity,stage,committed);committed.events.unshift(n('change','field',''));assert.throws(()=>assertComplexFormStep(identity,stage,committed));}
    }
  }
  assert.equal(count,20);assert.throws(()=>assertComplexFormStep('forms/Form','email-edit',{}));
});

test('complex eight forms execute array and mention production branches with source submit ownership',async()=>{
  const source=await read('ui/gohtmx/assets/ely-api-forms.js'),api=await read('ui/gohtmx/assets/ely-api.js');
  const calls=[],arrayInput={name:'links',value:'https://example.test'},array={querySelector:s=>s==='template'?{content:{querySelector:()=>arrayInput}}:{focus(){calls.push('focus-add');}},querySelectorAll:()=>array.removed?[]:[arrayInput],closest:()=>null};
  const arrayChanged=runInNewContext(source.slice(source.indexOf('const arrayChanged ='),source.indexOf('const initialForms ='))+';arrayChanged',{root:'primary',changed:(root,detail)=>calls.push(JSON.parse(JSON.stringify({root,detail})))});
  arrayChanged(array);assert.deepEqual(calls,[{root:'primary',detail:{name:'links',values:['https://example.test']}}]);
  const removeCode=source.slice(source.indexOf("if(button.matches('[data-ely-array-remove]')")).split('\n')[0];assert(removeCode.endsWith('return;}'));
  const remove=runInNewContext('(button)=>{'+removeCode+'}',{arrayChanged});
  remove({matches:()=>true,closest:s=>s==='.ely-api-field-array'?array:{remove(){array.removed=true;}}});assert.equal(calls[1],'focus-add');assert.deepEqual(calls[2],{root:'primary',detail:{name:'links',values:[]}});
  const mentionBranch=source.slice(source.indexOf("if(button.matches('[data-ely-mention-value]')")).split('\n')[0];assert(mentionBranch.endsWith('return;}'));
  for(const identity of ['forms/MentionInput','forms/HashtagInput']){const field={value:identity.endsWith('HashtagInput')?'#b':'@b',focus(){calls.push('focus-mention');}},list={hidden:false};let notified=0;
    const select=runInNewContext('(button)=>{'+mentionBranch+'}',{root:{dataset:{elyComponent:identity}},q:s=>s==='[data-ely-mention]'?field:list,setMentionActive:index=>assert.equal(index,-1),notify:n=>{assert.equal(n,field);notified++;}});
    select({matches:()=>true,value:'beta'});assert.equal(field.value,identity.endsWith('HashtagInput')?'#beta ':'@beta ');assert.equal(list.hidden,true);assert.equal(notified,1);
  }
  const start=source.indexOf("register('forms', root =>");assert(source.slice(start).includes("root.addEventListener('submit',feedbackSubmit)"));assert(!source.slice(start).includes("root.addEventListener('submit',submit"));
  const submitCode=api.slice(api.indexOf('const submit = event => {'),api.indexOf('const change = event => {'));
  const form={dataset:{elySubmit:'save'},matches:()=>true,reportValidity:()=>true},button={value:''},emitted=[];
  class FormDataStub{constructor(node){assert.equal(node,form);}*[Symbol.iterator](){yield ['email','caller@example.test'];}}
  const submit=runInNewContext(submitCode+';submit',{root:'primary',belongs:()=>true,FormData:FormDataStub,emit:(root,action,detail)=>emitted.push({root,action,detail})});
  const event={target:form,submitter:button,preventDefault(){this.defaultPrevented=true;}};submit(event);assert.equal(event.defaultPrevented,true);assert.equal(emitted.length,1);assert.equal(emitted[0].action,'save');assert.deepEqual(Array.from(emitted[0].detail.formData),[['email','caller@example.test']]);assert.equal(emitted[0].detail.submitter,'');
});

test('seven range forms require eighteen exact native transitions with independent payload bounds and trust',()=>{
  const specs=[['RelativeDatePicker','relative',['Yesterday','Last 7 days']],['Slider','slider',['0','5','4']],['VerticalSlider','slider',['0','5','4']],['RangeSlider','range',['5','0','1','1']],['Knob','knob',['3','2']],['Dial','knob',['3','2']],['Stepper','stepper',['3','2']]];
  let count=0;
  for(const [name,mode,values]of specs){const identity='forms/'+name,contract=requestedStateContract(identity);assert.equal(contract.nativeFormTwinWitness,true);assert.equal(contract.steps.length,values.length);
    values.forEach((value,index)=>{
      const step=contract.fixtureGuards.steps[index],[stage,selector,key]=step,end=selector.includes('range-end'),synthetic=mode==='knob'||mode==='stepper',control=mode==='knob'?'knob':mode==='stepper'?(index?'down':'up'):end?'end':'field',type=mode==='relative'?'select-one':mode==='stepper'?'number':'range';
      const controlIDs={field:'primary-control',...(mode==='range'?{end:'primary-end'}:{}),...(mode==='knob'?{knob:'owned-knob'}:{}),...(mode==='stepper'?{up:'owned-up',down:'owned-down'}:{})};
      const start=mode==='range'?['3','0','1','1'][index]:value,finish=mode==='range'?['5','5','5','1'][index]:null;
      const field={id:controlIDs.field,name:'caller_value',type,value:start,min:'',max:mode==='relative'?'':finish??'5',step:'',disabled:false,valid:true};
      const changed=end?'end':'field',proof={identity,rootID:'primary',fieldID:field.id,controlIDs,truncated:false,fields:[field,...(finish===null?[]:[{id:controlIDs.end,name:'caller_value_end',type:'range',value:finish,min:start,max:'5',step:'',disabled:false,valid:true}])],nativeEvents:[{type:key?'keydown':'click',control,targetID:controlIDs[control],trusted:true,key,value:null},...['input','change'].map(type=>({type,control:changed,targetID:controlIDs[changed],trusted:!synthetic,key:null,value}))],publicEvents:[{type:'ely:change',detail:{id:'primary',component:identity,name:end?'caller_value_end':'caller_value',value,...(type==='select-one'?{}:{checked:false}),type}}],output:mode==='range'?`${start}–${finish}`:value,knob:mode==='knob'?{value,output:value,angle:String(-135+Number(value)/5*270),sweep:`${Number(value)/5*270}deg`}:null,orientation:{writingMode:'vertical-lr',direction:'rtl',width:36,height:140}};
      assertRangeFormStep(identity,stage,proof);count++;
      for(const mutate of [p=>p.identity='forms/Unknown',p=>p.truncated=true,p=>p.fields[0].value='stale',p=>p.fields[0].max='100',p=>p.nativeEvents[0].trusted=false,p=>p.nativeEvents[1].trusted=synthetic,p=>p.nativeEvents[1].targetID='twin',p=>p.publicEvents[0].detail.component='forms/SliderOther',p=>p.publicEvents.push(p.publicEvents[0])]){const bad=structuredClone(proof);mutate(bad);assert.throws(()=>assertRangeFormStep(identity,stage,bad));}
      if(mode==='range'){const bad=structuredClone(proof);bad.fields[1].min='0';if(start!=='0')assert.throws(()=>assertRangeFormStep(identity,stage,bad));}
      if(mode==='knob')assert.throws(()=>assertRangeFormStep(identity,stage,{...proof,knob:{...proof.knob,output:'stale'}}));
      if(name==='VerticalSlider')assert.throws(()=>assertRangeFormStep(identity,stage,{...proof,orientation:{...proof.orientation,height:20}}));
    });
  }
  assert.equal(count,18);assert.equal(requestedStateContract('forms/DateRangePicker'),null);
});

test('seven range forms execute production range synchronization and knob arrow handler',async()=>{
  const source=await read('ui/gohtmx/assets/ely-api-forms.js'),notifySource=source.slice(source.indexOf('const notify ='),source.indexOf('// Bounded settings'));
  const rangeSource=source.slice(source.indexOf('const range ='),source.indexOf('const dateRange ='));
  const keyStart=source.indexOf("if(event.target.matches('[data-ely-knob]')"),keySource=source.slice(keyStart,source.indexOf("if(event.target.matches('[data-ely-multi-entry]')",keyStart));assert(keySource.includes('field.stepUp()'));
  const events=[],style={},attrs={},output={value:''},field={value:'2',min:'',max:'5',step:'',disabled:false,stepUp(){this.value=String(Math.min(5,Number(this.value)+1));},stepDown(){this.value=String(Math.max(0,Number(this.value)-1));},dispatchEvent(event){events.push([event.type,event.isTrusted,this.value]);}};
  const knob={style:{setProperty:(name,value)=>style[name]=value},setAttribute:(name,value)=>attrs[name]=value};
  field.closest=()=>null;
  const q=selector=>({'[data-ely-number]':field,'[data-ely-knob]':knob,'[data-ely-knob-value]':output}[selector]??null);
  const key=runInNewContext(notifySource+rangeSource+';(event)=>{'+keySource+'}',{Event,q});
  const target={matches:s=>s==='[data-ely-knob]',closest:()=>null};
  for(const [pressed,value]of [['ArrowUp','3'],['ArrowDown','2']]){const event={key:pressed,target,preventDefault(){this.prevented=true;}};key(event);assert.equal(event.prevented,true);assert.equal(field.value,value);assert.equal(output.value,value);assert.equal(attrs['aria-valuenow'],value);assert.equal(style['--ely-knob-angle'],String(-135+Number(value)/5*270));}
  assert.deepEqual(events,[['input',false,'3'],['change',false,'3'],['input',false,'2'],['change',false,'2']]);field.disabled=true;key({key:'ArrowUp',target,preventDefault(){}});assert.equal(events.length,4);
});

test('PathInput native contract requires exact edit commit request and rejects duplicates',async()=>{
  const contract=requestedStateContract('forms/PathInput');assert.equal(contract.nativeFormTwinWitness,true);assert.deepEqual(contract.steps.map(s=>s.id),['path-edit','path-commit','path-request']);assert.equal(contract.steps[1].nativeTabCommit,true);
  for(const stage of contract.steps.map(s=>s.id)){
    const proof={identity:'forms/PathInput',rootID:'primary',fieldID:'primary-control',truncated:false,value:'~/Projects/ely',valid:true,focusLeft:stage!=='path-edit',nativeEvents:[],publicEvents:[]};
    const event=(type,control,key=null)=>({type,control,key,targetID:control==='field'?proof.fieldID:null,trusted:true,value:control==='field'?proof.value:''});
    proof.nativeEvents=stage==='path-edit'?[event('input','field')]:stage==='path-commit'?[event('keydown','field','Tab'),event('change','field'),event('blur','field')]:[event('click','button')];
    if(stage==='path-commit')proof.publicEvents=[{type:'ely:change',detail:{id:proof.rootID,component:proof.identity,name:'caller_value',value:proof.value,checked:false,type:'text'}}];
    if(stage==='path-request')proof.publicEvents=[{type:'ely:action',detail:{id:proof.rootID,component:proof.identity,action:'choose-path',value:proof.value}}];
    assertPathNativeStep(stage,proof);
    for(const mutate of [p=>p.identity='forms/InputGroup',p=>p.value='stale',p=>p.truncated=true,p=>p.nativeEvents[0].trusted=false,p=>p.publicEvents.push({type:'ely:action',detail:{action:'choose-path',value:''}})]){const bad=structuredClone(proof);mutate(bad);assert.throws(()=>assertPathNativeStep(stage,bad));}
    if(stage==='path-commit')assert.throws(()=>assertPathNativeStep(stage,{...proof,focusLeft:false}));
  }
  const fixtures=await read('internal/gallery/advanced_forms_fixtures.go');assert(fixtures.includes('case "PathInput":'));assert(fixtures.includes('"Value": "alpha"'));
  const driver=await read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),branch=driver.slice(driver.indexOf("if(contract.focusedSequence==='forms-path-native'){"),driver.indexOf("if(contract.focusedSequence==='forms-regional-native'){"));
  for(const text of ["field.fill('~/Projects/ely')","field.press('Tab')",'button.click()','receipt.nativeFormProof=proof','retainFailurePayload','cleanupPreservingPrimary'])assert(branch.includes(text));
  assert(!branch.includes('dispatchEvent('));assert(!/\.value\s*=/.test(branch));
});

test('forms action ownership production listeners emit exactly once in actual registration order',async()=>{
  const api=await read('ui/gohtmx/assets/ely-api.js'),forms=await read('ui/gohtmx/assets/ely-api-forms.js');
  const coreRegistration=api.indexOf("root.addEventListener('click', click)"),familyInitialization=api.indexOf('registerCleanup(initialize(root');
  assert(coreRegistration>=0&&familyInitialization>coreRegistration);
  const core=api.slice(api.indexOf('const click = event => {'),api.indexOf('const submit = event => {'));
  const start=forms.indexOf('const click = event => {',forms.indexOf("register('forms', root =>"));
  const family=forms.slice(start,forms.indexOf('const input = event => {',start));
  assert(forms.includes("root.addEventListener('click',click);"),'Forms installs its own bubble listener after core');
  const root={dataset:{elyFamily:'forms'}},foreign={},requests=[];let cancel=false,pathMode=true,groupMode=false,disabled=false,ariaDisabled=false,fieldsetDisabled=false,owner=root,action='choose-path',screen=false;
  const field={value:'~/Projects/ely'},groupField={value:'group-value'};
  let legend=null;
  const button={tagName:'BUTTON',value:'',type:'button',form:null,get disabled(){return disabled;},get dataset(){return {elyAction:action};},getAttribute(name){return name==='aria-disabled'&&ariaDisabled?'true':null;},matches(selector){return selector===':disabled'?disabled||fieldsetDisabled&&legend!=='first':selector==='[data-ely-pick-screen-color]'&&screen;},closest(selector){if(selector==='[data-ely-family]')return owner;if(selector==='[data-ely-action]')return this;if(selector==='button')return this.tagName==='BUTTON'?this:null;if(selector==='fieldset:disabled')return fieldsetDisabled?{}:null;if(selector==='.ely-api-path-input')return pathMode?{querySelector:()=>field}:null;if(selector==='.ely-api-input-group')return groupMode?{querySelector:()=>groupField}:null;return null;}};
  const nested={closest:selector=>button.closest(selector)};
  const emit=(_root,action,payload)=>{requests.push({action,payload:JSON.parse(JSON.stringify(payload))});return !cancel;};
  const context={root,emit,q:selector=>{assert.equal(selector,'[data-ely-color]');return {value:'#228855'};},belongs:(_root,target)=>target.closest('[data-ely-family]')===_root};
  const listeners=[runInNewContext(core+';click',{...context}),runInNewContext(family+';click',{...context})];
  const click=(target=button)=>{const event={target,defaultPrevented:false,preventDefault(){this.defaultPrevented=true;}};for(const listener of listeners)listener(event);return event;};
  click();assert.deepEqual(requests,[{action:'choose-path',payload:{value:'~/Projects/ely'}}]);
  action='browse-custom';field.value='/new/path';click(nested);assert.deepEqual(requests.at(-1),{action:'browse-custom',payload:{value:'/new/path'}});assert.equal(requests.length,2);
  click();assert.equal(requests.length,3,'Second activation adds exactly one request');
  cancel=true;assert.equal(click().defaultPrevented,true);assert.equal(requests.length,4,'Cancellation must not trigger fallback emission');cancel=false;
  disabled=true;click();assert.equal(requests.length,4);disabled=false;ariaDisabled=true;click();assert.equal(requests.length,4);ariaDisabled=false;fieldsetDisabled=true;click();assert.equal(requests.length,4);fieldsetDisabled=false;owner=foreign;click();assert.equal(requests.length,4);owner=root;
  fieldsetDisabled=true;legend='second';click();assert.equal(requests.length,4,'Later legend is effectively disabled');legend='first';click();assert.equal(requests.length,5,'Native enabled first-legend control emits exactly once');assert.deepEqual(requests.pop(),{action:'browse-custom',payload:{value:'/new/path'}});legend=null;fieldsetDisabled=false;
  root.dataset.elyDisabled='true';click();assert.equal(requests.length,4);delete root.dataset.elyDisabled;
  pathMode=false;action='ordinary';click();assert.deepEqual(requests.at(-1),{action:'ordinary',payload:{value:''}});assert.equal(requests.length,5);
  groupMode=true;action='copy';click(nested);assert.deepEqual(requests.at(-1),{action:'copy',payload:{value:'group-value'}});assert.equal(requests.length,6);cancel=true;assert.equal(click().defaultPrevented,true);assert.equal(requests.length,7);cancel=false;groupMode=false;
  for(const [name,value] of [['sample-color',''],['search',''],['share',''],['try-feature',''],['open-help','help-key'],['footer-custom','footer-value']]){action=name;button.value=value;const before=requests.length;click(nested);assert.equal(requests.length,before+1);assert.deepEqual(requests.at(-1),{action:name,payload:{value}});}
  action='sample-color';screen=true;const beforeScreen=requests.length;click();assert.equal(requests.length,beforeScreen+1);assert.deepEqual(requests.at(-1),{action:'sample-color',payload:{value:'#228855'}});cancel=true;assert.equal(click().defaultPrevented,true);cancel=false;screen=false;
  button.tagName='A';action='link-action';const beforeLink=requests.length;click();assert.equal(requests.length,beforeLink+1);assert.equal(requests.at(-1).action,'link-action');button.tagName='BUTTON';
  button.type='submit';button.form={matches:()=>true};const beforeSubmit=requests.length;click();assert.equal(requests.length,beforeSubmit,'data-ely-submit form retains submit-event ownership');button.form=null;click();assert.equal(requests.length,beforeSubmit+1,'Ordinary submit action retains core ownership');button.type='button';
  root.dataset.elyFamily='native';pathMode=true;const before=requests.length;listeners[0]({target:button,preventDefault(){}});assert.equal(requests.length,before+1,'Non-forms families retain generic ownership');
});

test('forms action ownership preserves actual suite capture confirmation before core bubble',async()=>{
  const forms=await read('ui/gohtmx/assets/ely-api-forms.js'),api=await read('ui/gohtmx/assets/ely-api.js');
  assert(forms.includes("root.addEventListener('click',click,{...options,capture:true})"));
  const start=forms.indexOf('const click=event=>'),end=forms.indexOf('const submit=event=>',start),suite=forms.slice(start,end);
  const root={dataset:{elyFamily:'forms'}},requests=[],data={elyAction:'revoke-custom',suiteConfirm:'Confirm revoke?'};
  const button={dataset:data,textContent:'Revoke',value:'key-1',disabled:false,form:null,matches:()=>false,closest(selector){return selector==='button'?this:selector==='[data-ely-family]'?root:null;},setAttribute(){},removeAttribute(){}};
  const capture=runInNewContext(suite+';click',{root,disabled:()=>false,all:()=>[],action:(action,payload)=>requests.push({action,value:payload.value}),status:()=>{}});
  const core=runInNewContext(api.slice(api.indexOf('const click = event => {'),api.indexOf('const submit = event => {'))+';click',{root,belongs:()=>true,emit:()=>assert.fail('Stopped suite click must never reach core')});
  const click=()=>{const event={target:button,preventDefault(){this.defaultPrevented=true;},stopImmediatePropagation(){this.stopped=true;}};capture(event);if(!event.stopped)core(event);assert.equal(event.defaultPrevented,true);assert.equal(event.stopped,true);};
  click();assert.equal(data.suiteArmed,'true');assert.deepEqual(requests,[]);click();assert.deepEqual(requests,[{action:'revoke-custom',value:'key-1'}]);assert.equal(data.suiteArmed,undefined);assert.equal(button.textContent,'Revoke');
});

const regionalProof=(identity,selected)=>({identity,rootID:'primary',searchID:'primary-control-input',hiddenID:'primary-control-value',truncated:false,
  state:{name:'caller_value',value:selected?'beta':'alpha',search:selected?'Caller Beta':'beta',preview:selected?'beta':'alpha',expanded:!selected,listHidden:selected,activeValue:selected?null:'beta',selected:[selected?'beta':'alpha'],visible:['beta'],disabled:false,readOnly:false,valid:true},
  nativeEvents:selected?[
    {type:'keydown',control:'search',targetID:'primary-control-input',trusted:true,value:'beta',key:'Enter'},
    {type:'input',control:'hidden',targetID:'primary-control-value',trusted:false,value:'beta',key:null},
    {type:'change',control:'hidden',targetID:'primary-control-value',trusted:false,value:'beta',key:null},
  ]:[{type:'input',control:'search',targetID:'primary-control-input',trusted:true,value:'beta',key:null}],
  publicEvents:selected?[{type:'ely:change',detail:{id:'primary',component:identity,name:'caller_value',value:'beta',checked:false,type:'hidden'}}]:[],
});

test('regional forms exact aliases require native search selection payload and strict negatives',()=>{
  for(const identity of ['forms/LanguageSelect','forms/CountrySelect','forms/CurrencySelect']){
    const contract=requestedStateContract(identity);assert.equal(contract.kind,'LanguageSelect');assert.equal(contract.nativeFormTwinWitness,true);
    assert.deepEqual(contract.steps.map(s=>s.id),['regional-search','regional-select','regional-unmatched','regional-escape']);assert.deepEqual(contract.fixtureGuards.options,[['alpha','Caller Alpha'],['beta','Caller Beta']]);
    for(const selected of [false,true]){
      const stage=selected?'regional-select':'regional-search',proof=regionalProof(identity,selected);assertRegionalFormStep(identity,stage,proof);
      for(const mutation of [p=>p.identity='forms/Select',p=>p.truncated=true,p=>p.state.value='stale',p=>p.state.preview='stale',p=>p.state.disabled=true,p=>p.state.activeValue='foreign',p=>p.nativeEvents[0].trusted=false,p=>p.nativeEvents[0].targetID='twin',p=>p.publicEvents.push({type:'ely:action',detail:{action:'save'}})]){const bad=structuredClone(proof);mutation(bad);assert.throws(()=>assertRegionalFormStep(identity,stage,bad));}
      if(selected)for(const mutation of [p=>p.nativeEvents[1].trusted=true,p=>p.publicEvents[0].detail.component='forms/Select',p=>p.publicEvents[0].detail.name='preview',p=>p.nativeEvents.pop()]){const bad=structuredClone(proof);mutation(bad);assert.throws(()=>assertRegionalFormStep(identity,stage,bad));}
    }
  }
  assert.throws(()=>assertRegionalFormStep('forms/Select','regional-select',regionalProof('forms/Select',true)));
  assert.throws(()=>assertRegionalFormStep('forms/LanguageSelect','unknown',regionalProof('forms/LanguageSelect',true)));
});

test('regional forms unmatched and Escape preserve selected beta without extra public changes',()=>{
  for(const identity of ['forms/LanguageSelect','forms/CountrySelect','forms/CurrencySelect'])for(const stage of ['regional-unmatched','regional-escape']){
    const escape=stage==='regional-escape',proof=regionalProof(identity,true);
    Object.assign(proof.state,{search:escape?'Caller Beta':'no-matching-region',expanded:!escape,listHidden:escape,activeValue:null,visible:[]});proof.publicEvents=[];
    proof.nativeEvents=[{type:escape?'keydown':'input',control:'search',targetID:proof.searchID,trusted:true,value:'no-matching-region',key:escape?'Escape':null}];
    assertRegionalFormStep(identity,stage,proof);
    for(const mutate of [p=>p.state.value='',p=>p.state.search='unrestored',p=>p.state.preview='alpha',p=>p.state.visible=['alpha'],p=>p.publicEvents=[{type:'ely:change',detail:{value:'beta'}}],p=>p.nativeEvents[0].trusted=false]){const bad=structuredClone(proof);mutate(bad);assert.throws(()=>assertRegionalFormStep(identity,stage,bad));}
  }
});

test('regional forms source fixture and connected handler guards do not transfer previews',async()=>{
  const fixtures=await read('internal/gallery/advanced_forms_fixtures.go'),templates=await read('ui/gohtmx/templates/ely-api-forms.html'),controls=await read('ui/gohtmx/assets/ely-controls.js');
  assert(fixtures.includes('{"Value": "alpha", "Label": "Caller Alpha"}'));assert(fixtures.includes('{"Value": "beta", "Label": "Caller Beta"}'));
  assert(templates.includes('{{else if eq .Kind "LanguageSelect"}}'));assert(templates.includes('data-ely-picker-preview'));
  const handler=controls.slice(controls.indexOf('const selectCombo ='),controls.indexOf('const addKeyValue ='));
  assert(handler.includes("hidden.dispatchEvent(new Event('input', { bubbles: true }))"));assert(handler.includes("hidden.dispatchEvent(new Event('change', { bubbles: true }))"));assert(handler.includes('input.focus()'));assert(handler.includes('closeCombo(component)'));
  const driver=await read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs');
  const branch=driver.slice(driver.indexOf("if(contract.focusedSequence==='forms-regional-native'){"),driver.indexOf("if(contract.focusedSequence==='forms-eight-explicit-native'){"));
  assert(branch.includes("search.press('Enter')"));assert(branch.includes("search.fill('beta')"));assert(branch.includes('receipt.nativeFormProof=proof'));assert(branch.includes('retainFailurePayload'));assert(branch.includes('cleanupPreservingPrimary'));
  assert(!branch.includes('dispatchEvent('));assert(!/\.value\s*=/.test(branch));assert(!branch.includes('PreviewExamples'));
});

test('regional forms execute production selection helper without fabricating trusted notifications',async()=>{
  const source=await read('ui/gohtmx/assets/ely-controls.js');
  const helper=source.slice(source.indexOf('const selectCombo ='),source.indexOf('const addKeyValue ='));
  const options=['alpha','beta'].map(value=>({dataset:{value,uiLabel:`Caller ${value==='alpha'?'Alpha':'Beta'}`},selected:value==='alpha',getAttribute(){return null;},setAttribute(name,value){assert.equal(name,'aria-selected');this.selected=value==='true';}}));
  const events=[],hidden={value:'alpha',dispatchEvent(event){events.push({type:event.type,bubbles:event.bubbles,trusted:event.isTrusted,value:this.value});}},input={value:'beta',disabled:false,readOnly:false,focus(){this.focused=true;}};
  const component={querySelector(selector){assert.equal(selector,'[data-ui-combobox-input]');return input;},querySelectorAll(selector){assert.equal(selector,'[data-ui-option]');return options;}};
  let closed=0;
  const select=runInNewContext(`${helper};selectCombo`,{Event,hiddenValue:node=>{assert.equal(node,component);return hidden;},closeCombo:node=>{assert.equal(node,component);closed++;}});
  select(component,options[1]);
  assert.equal(hidden.value,'beta');assert.equal(input.value,'Caller Beta');assert.equal(input.focused,true);assert.equal(closed,1);assert.deepEqual(options.map(n=>n.selected),[false,true]);
  assert.deepEqual(events,[{type:'input',bubbles:true,trusted:false,value:'beta'},{type:'change',bubbles:true,trusted:false,value:'beta'}]);
  for(const property of ['disabled','readOnly']){input[property]=true;select(component,options[0]);assert.equal(hidden.value,'beta');assert.equal(events.length,2);input[property]=false;}
  options[0].getAttribute=()=> 'true';select(component,options[0]);assert.equal(hidden.value,'beta');assert.equal(events.length,2);
});

test('exact DateTime Week AX keyboard routes preserve targets trust and bounded actual departure',async()=>{
  for(const identity of ['forms/DateTimePicker','forms/WeekPicker']){
    const week=identity==='forms/WeekPicker',names=week?['Week Week','Year Year']:['Month Month','Day Day','Year Year','Hours Hours','Minutes Minutes','AM/PM AM/PM'];
    let focus=0,active=true,day=20,hour=12,minute=30,weekValue=42;const keys=[],trace=[];
    const value=()=>week?`2026-W${weekValue}`:`2026-10-${day}T${hour}:${minute}`;
    const observe=async()=>({active,value:value(),valid:true,ownedIDs:names.map((_,i)=>i+1),ax:names.map((name,i)=>({backendDOMNodeId:i+1,role:{value:'spinbutton'},name:{value:name},properties:[{name:'settable',value:{value:true}},{name:'focused',value:{value:active&&focus===i}}]}))});
    const press=async key=>{keys.push(key);if(key==='Tab'){focus++;if(focus>names.length)active=false;}else if(key==='Shift+Tab')focus--;else if(key==='ArrowUp'){if(week)weekValue++;else if(names[focus]==='Day Day')day++;else if(names[focus]==='Hours Hours')hour++;else if(names[focus]==='Minutes Minutes')minute++;else assert.fail('Wrong segment edited');}else assert.fail('Unexpected key');};
    const edited=await nativeDateKeyboardRoute(identity,'edit',observe,press,trace);assert.equal(edited.value,requestedStateContract(identity).fixtureGuards.changed);
    assert.equal(keys.filter(k=>k==='ArrowUp').length,week?1:17);
    const departed=await nativeDateKeyboardRoute(identity,'commit',observe,press,[]);assert.equal(departed.active,false);
    const state=await observe();state.active=true;state.ax[0].properties[1].value.value=true;state.ax[1].properties[1].value.value=true;assert.throws(()=>nativeDateFocusedSegment(state),/ambiguous/);
    await assert.rejects(()=>nativeDateKeyboardRoute(identity,'edit',async()=>({...state,value:requestedStateContract(identity).fixtureGuards.initial}),async()=>assert.fail('Ambiguous AX must stop before any key'),[]),/ambiguous/);
    assert.throws(()=>nativeDateFocusedSegment({...state,ax:[]}),/unavailable/);
    assert.throws(()=>nativeDateFocusedSegment({...state,ownedIDs:[]}),/unavailable/);
    const payload={identity,rootID:'primary',fieldID:'primary-control',value:edited.value,valid:true,active:true,events:[],truncated:false};
    const count=week?1:17;
    for(let i=0;i<count;i++)payload.events.push({type:'keydown',key:'ArrowUp',trusted:true,targetId:payload.fieldID},{type:'input',trusted:true,targetId:payload.fieldID,value:edited.value},{type:'change',trusted:true,targetId:payload.fieldID,value:edited.value},{type:'ely:change',trusted:false,detail:{id:payload.rootID,component:identity,name:'caller_value',value:edited.value,checked:false,type:week?'week':'datetime-local'}});
    assertNativeDateResult(identity,'edit',payload);
    for(const mutation of [p=>p.value='wrong',p=>p.events[1].trusted=false,p=>p.events[1].targetId='twin',p=>p.events[3].detail.component='forms/DatePicker',p=>p.events[3].detail.value='stale',p=>p.truncated=true]){const bad=structuredClone(payload);mutation(bad);assert.throws(()=>assertNativeDateResult(identity,'edit',bad));}
    const commit={...payload,active:false,events:[{type:'keydown',key:'Tab',trusted:true,targetId:payload.fieldID},{type:'blur',trusted:true,targetId:payload.fieldID}]};assertNativeDateResult(identity,'commit',commit);assert.throws(()=>assertNativeDateResult(identity,'commit',{...commit,active:true}));
    active=true;focus=0;const stuck=async()=>{};await assert.rejects(()=>nativeDateKeyboardRoute(identity,'commit',observe,stuck,[]),/departure/);
    await assert.rejects(()=>nativeDateKeyboardRoute(identity,'edit',async()=>({...await observe(),value:requestedStateContract(identity).fixtureGuards.initial}),stuck,[]),/navigation bound|must change/);
  }
  await assert.rejects(()=>nativeDateKeyboardRoute('forms/DatePicker','edit',()=>{},()=>{},[]),/Exact/);
  let wrongWeek='2026-W42';const weekAX={active:true,valid:true,ownedIDs:[1],ax:[{backendDOMNodeId:1,role:{value:'spinbutton'},name:{value:'Week Week'},properties:[{name:'settable',value:{value:true}},{name:'focused',value:{value:true}}]}]};
  await assert.rejects(()=>nativeDateKeyboardRoute('forms/WeekPicker','edit',async()=>({...weekAX,value:wrongWeek}),async()=>{wrongWeek='2026-W44';},[]),/exact fixture target/);
  const driver=await read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs');
  const branch=driver.slice(driver.indexOf("if(identity==='forms/DateTimePicker'||identity==='forms/WeekPicker'){"),driver.indexOf("const field=root.locator(contract.steps[0].control);assert.equal(await field.count(),1);assert.equal(await field.getAttribute('type')",driver.indexOf("if(identity==='forms/DateTimePicker'||identity==='forms/WeekPicker'){")));
  assert(branch.includes('nativeDateKeyboardRoute'));assert(branch.includes("context().newCDPSession"));assert(!/\.fill\(|dispatchEvent|\.value\s*=/.test(branch));assert(branch.includes('failureDiagnostics.nativeDate=proof'));
});

const segmentDiagnosticMaxBytes=1024*1024;
function boundedSegmentJSON(value,maxBytes=segmentDiagnosticMaxBytes){
  assert(Number.isSafeInteger(maxBytes)&&maxBytes>0,'Invalid diagnostic byte cap');
  let units=0,bytes=0;
  const add=count=>{bytes+=count;assert(bytes<=maxBytes,'Diagnostic JSON byte cap exceeded');};
  const stringBytes=text=>{
    assert(text.length<=8192,'Diagnostic string limit exceeded');add(2);
    for(let i=0;i<text.length;i++){
      const code=text.charCodeAt(i);
      if(code===34||code===92||[8,9,10,12,13].includes(code))add(2);
      else if(code<32)add(6);
      else if(code<128)add(1);
      else if(code<2048)add(2);
      else if(code>=0xd800&&code<=0xdbff&&text.charCodeAt(i+1)>=0xdc00&&text.charCodeAt(i+1)<=0xdfff){add(4);i++;}
      else if(code>=0xd800&&code<=0xdfff)add(6);
      else add(3);
    }
  };
  const check=(item,depth=0)=>{
    assert(depth<=24&&++units<=50000,'Diagnostic collection limit exceeded');
    if(typeof item==='string')stringBytes(item);
    else if(item===null||item===undefined)add(4);
    else if(typeof item==='boolean')add(item?4:5);
    else if(typeof item==='number')add(Number.isFinite(item)?String(item).length:4);
    else if(item&&typeof item==='object'){
      assert(Array.isArray(item)||Object.getPrototypeOf(item)===Object.prototype||Object.getPrototypeOf(item)===null,'Diagnostic requires plain JSON data');
      assert(!('toJSON' in item),'Diagnostic custom serialization forbidden');
      add(2);let count=0,members=0;
      if(Array.isArray(item)){
        assert(item.length<=256,'Diagnostic member limit exceeded');
        for(let i=0;i<item.length;i++){if(i)add(1);const property=Object.getOwnPropertyDescriptor(item,String(i));assert(!property||'value' in property,'Diagnostic accessors forbidden');check(property?.value,depth+1);}
      }else for(const key in item){
        if(!Object.hasOwn(item,key))continue;
        assert(++members<=256,'Diagnostic member limit exceeded');assert(key.length<=256);
        const property=Object.getOwnPropertyDescriptor(item,key);assert('value' in property,'Diagnostic accessors forbidden');
        if(property.value===undefined)continue;
        if(count++)add(1);stringBytes(key);add(1);check(property.value,depth+1);
      }
    }else assert.fail('Unsupported diagnostic JSON value');
  };
  assert(value!==undefined,'Diagnostic root must be JSON data');check(value);
  const json=JSON.stringify(value);assert.equal(Buffer.byteLength(json),bytes,'Diagnostic JSON byte accounting mismatch');return json;
}
function segmentDiagnosticOutput(proof,maxBytes=segmentDiagnosticMaxBytes){
  try{return boundedSegmentJSON(proof,maxBytes);}
  catch(error){return boundedSegmentJSON({kind:'native-segment-diagnostic-not-contract-approval',truncated:true,failed:true,reason:String(error.message).slice(0,256),cleanup:proof.cleanup,source:proof.source,retainedCaseCount:proof.cases.length},maxBytes);}
}

test('native segment diagnostic caps bytes unicode raw strings and member allocation fail closed',()=>{
  const proof={source:'a'.repeat(40),cases:[],cleanup:true};
  assert.equal(JSON.parse(segmentDiagnosticOutput(proof)).cleanup,true);
  for(const extra of [{text:'x'.repeat(8193)},{items:Array(257).fill(0)},{text:'界'.repeat(500)}]){
    const json=segmentDiagnosticOutput({...proof,...extra},512),result=JSON.parse(json);
    assert(Buffer.byteLength(json)<=512);assert.equal(result.truncated,true);assert.equal(result.failed,true);assert.equal(result.mechanicsObserved,undefined);
  }
  assert.throws(()=>boundedSegmentJSON({text:'界'.repeat(200)},512));
});

test('native segment diagnostic rejects aggregate before stringify and counts UTF8 escaping containers exactly',()=>{
  runInNewContext(`assert.throws(()=>(${boundedSegmentJSON.toString()})(Array.from({length:200},()=>Array(200).fill('small')),1024),/byte cap/);`,{assert,JSON:{stringify(){assert.fail('Aggregate overflow must reject before stringify');}}});
  for(const value of ['界','😀','\ud800','\udfff','"\\\b\f\n\r\t\u0000\u001f','é',[null,undefined,true,false,0,-0,1e30,NaN,Infinity],{'界"': ['😀','\ud800'],omitted:undefined}]){
    const expected=JSON.stringify(value),bytes=Buffer.byteLength(expected);
    assert.equal(boundedSegmentJSON(value,bytes),expected);
    assert.throws(()=>boundedSegmentJSON(value,bytes-1),/byte cap/);
  }
  assert.throws(()=>boundedSegmentJSON({get value(){assert.fail('Getter must not execute');}}),/accessors/);
  assert.throws(()=>boundedSegmentJSON({toJSON(){assert.fail('toJSON must not execute');}}),/custom serialization/);
});

// This function runs in Chromium before nodes are transferred over CDP.
function boundedSegmentDOMNodes(){
  const nodes=[],queue=[this];
  while(queue.length){const node=queue.shift();if(nodes.length>=64||node.childNodes.length>64||nodes.length+queue.length+node.childNodes.length>64)throw Error('Diagnostic DOM collection truncated');nodes.push(node);for(const child of node.childNodes)queue.push(child);}
  return nodes;
}

function boundedSegmentTwinSnapshot(root,maxBytes=65536){
  let bytes=2;const queue=[root],snapshot=[];
  const add=count=>{bytes+=count;if(bytes>maxBytes)throw Error('Diagnostic twin snapshot byte cap exceeded');};
  const string=value=>{
    add(2);for(let i=0;i<value.length;i++){
      const code=value.charCodeAt(i);
      if(code===34||code===92||[8,9,10,12,13].includes(code))add(2);
      else if(code<32)add(6);else if(code<128)add(1);else if(code<2048)add(2);
      else if(code>=0xd800&&code<=0xdbff&&value.charCodeAt(i+1)>=0xdc00&&value.charCodeAt(i+1)<=0xdfff){add(4);i++;}
      else if(code>=0xd800&&code<=0xdfff)add(6);else add(3);
    }
  };
  while(queue.length){
    const node=queue.shift(),index=snapshot.length;
    if(index+queue.length+node.childNodes.length>=128||node.attributes?.length>32)throw Error('Diagnostic twin snapshot truncated');
    const text=node.nodeType===3?node.nodeValue:null,value=node.value??null,checked=node.checked??null;
    if(node.nodeName.length>256||text?.length>256||value?.length>256)throw Error(`Diagnostic twin text truncated node=${index}`);
    if(index)add(1);add(2);let fields=0;
    const primitive=(key,item)=>{if(fields++)add(1);string(key);add(1);if(item===null)add(4);else if(typeof item==='boolean')add(item?4:5);else string(item);};
    primitive('tag',node.nodeName);primitive('text',text);
    if(fields++)add(1);string('attributes');add(3);const attributes=[];
    for(const attr of node.attributes||[]){
      if(attr.name.length>256||attr.value.length>8192)throw Error(`Diagnostic twin attribute truncated node=${index} tag=${node.nodeName.slice(0,64)} attribute=${attr.name.slice(0,64)} nameLength=${attr.name.length} valueLength=${attr.value.length}`);
      if(attributes.length)add(1);add(3);string(attr.name);string(attr.value);attributes.push([attr.name,attr.value]);
    }
    primitive('value',value);primitive('checked',checked);
    snapshot.push({tag:node.nodeName,text,attributes,value,checked});for(const child of node.childNodes)queue.push(child);
  }
  return snapshot;
}

test('native segment diagnostic twin preserves actual shared input class with bounded exact attributes',async()=>{
  const template=await read('ui/gohtmx/templates/shadcn-input.html'),classValue=template.match(/\$base := "([^"]+)"/)[1];
  assert.equal(classValue.length,656);const node={nodeName:'INPUT',nodeType:1,childNodes:[],attributes:[{name:'class',value:classValue}],value:'2026-10-20T12:30',checked:false};
  const result=boundedSegmentTwinSnapshot(node);assert.equal(result[0].attributes[0][1],classValue);
  const exactBytes=Buffer.byteLength(JSON.stringify(result));assert.deepEqual(boundedSegmentTwinSnapshot(node,exactBytes),result);assert.throws(()=>boundedSegmentTwinSnapshot(node,exactBytes-1),/byte cap/);
  const changed={...node,attributes:[{name:'class',value:classValue+' changed'}]};assert.notDeepEqual(boundedSegmentTwinSnapshot(changed),result);
  for(const value of ['界😀"\\\n\ud800','x'.repeat(8192)]){const sample={...node,attributes:[{name:'data-proof',value}]},snapshot=boundedSegmentTwinSnapshot(sample),bytes=Buffer.byteLength(JSON.stringify(snapshot));assert.deepEqual(boundedSegmentTwinSnapshot(sample,bytes),snapshot);assert.throws(()=>boundedSegmentTwinSnapshot(sample,bytes-1),/byte cap/);}
  assert.throws(()=>boundedSegmentTwinSnapshot({...node,attributes:[{name:'data-long',value:'x'.repeat(8193)}]}),/node=0 tag=INPUT attribute=data-long.*valueLength=8193/);
  assert.throws(()=>boundedSegmentTwinSnapshot({...node,attributes:Array.from({length:32},(_,i)=>({name:'data-'+i,value:'x'.repeat(8192)}))}),/byte cap/);
});

test('native segment diagnostic bounds DOM traversal before transferring raw nodes',()=>{
  const leaf={childNodes:[]};assert.equal(boundedSegmentDOMNodes.call({childNodes:[leaf]}).length,2);
  assert.throws(()=>boundedSegmentDOMNodes.call({childNodes:Array(65).fill(leaf)}),/truncated/);
  assert.throws(()=>boundedSegmentDOMNodes.call({childNodes:Array(8).fill({childNodes:Array(8).fill(leaf)})}),/truncated/);
});

test('native segment diagnostic source retains scoped CDP and fail closed capped output',async()=>{
  const source=await readFile(new URL(import.meta.url),'utf8');
  const entry=source.slice(source.lastIndexOf("test('opt-in DateTime Week DL native segment cause diagnostic only'"),source.lastIndexOf("test('eight exact forms contracts execute"));
  assert(!entry.includes('getFullAXTree'));assert(!entry.includes('depth:-1'));assert(!entry.includes('.innerHTML'));assert(!entry.includes('.outerHTML'));
  assert(entry.includes('fetchRelatives:false'));assert(entry.includes('boundedSegmentDOMNodes.toString()'));assert(entry.includes('segmentDiagnosticOutput(proof)'));
  assert(entry.includes("assert(!JSON.parse(text).failed,'Diagnostic output truncated')"));
});

function observedNativeSegment(dom,ax){
  const ids=new Set();
  const visit=node=>{if(node.backendNodeId)ids.add(node.backendNodeId);for(const child of [...(node.children||[]),...(node.shadowRoots||[])])visit(child);};visit(dom);
  const segments=ax.filter(node=>!node.ignored&&ids.has(node.backendDOMNodeId)&&node.role?.value==='spinbutton');
  const focused=segments.filter(node=>node.properties?.some(p=>p.name==='focused'&&p.value?.value===true));
  assert(segments.length>0&&segments.length<=8,'Native segment count unavailable or unbounded');
  assert.equal(focused.length,1,'Native focused segment is ambiguous or absent');
  assert(focused[0].name?.value,'Native segment lacks an observed identity');
  assert.equal(new Set(segments.map(node=>node.backendDOMNodeId)).size,segments.length,'Duplicate native segment ownership');
  return {segment:focused[0],count:segments.length};
}

test('native date segment diagnostic rejects absent foreign and ambiguous AX ownership',()=>{
  const dom={backendNodeId:1,shadowRoots:[{backendNodeId:2,children:[{backendNodeId:3},{backendNodeId:4}]}]};
  const node=(id,focused=true)=>({backendDOMNodeId:id,role:{value:'spinbutton'},name:{value:'Observed segment'},properties:[{name:'focused',value:{value:focused}}]});
  assert.equal(observedNativeSegment(dom,[node(3),node(4,false)]).count,2);
  for(const ax of [[],[node(99)],[node(3),node(4)],[{...node(3),name:{value:''}}],[{...node(3),ignored:true}]])assert.throws(()=>observedNativeSegment(dom,ax));
  assert.throws(()=>observedNativeSegment(dom,[node(3),node(3,false)]));
});

test('opt-in DateTime Week DL native segment cause diagnostic only',{skip:process.env.ELY_NATIVE_SEGMENT_DIAGNOSTIC!=='1'},async()=>{
  const {writeFile}=await import('node:fs/promises');
  const {chromium}=await import('playwright');
  const base=process.env.ELY_NATIVE_SEGMENT_URL,output=process.env.ELY_NATIVE_SEGMENT_OUTPUT;
  assert(base&&output&&process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH&&/^[a-f0-9]{40}$/.test(process.env.ELY_NATIVE_SEGMENT_SOURCE||''),'Explicit existing gallery URL, source pin, immutable output and browser executable required');
  const url=new URL(base);assert(['127.0.0.1','localhost'].includes(url.hostname),'Local owned gallery only');
  const proof={kind:'native-segment-diagnostic-not-contract-approval',maxBytes:segmentDiagnosticMaxBytes,source:process.env.ELY_NATIVE_SEGMENT_SOURCE,sourcePinIsCallerSupplied:true,cases:[],runtime:{node:process.version},cleanup:false,truncated:false};
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH});proof.runtime.browser=browser.version();
    assert.match(proof.runtime.browser,/^143\./,'Diagnostic comparison requires the installed Chromium143');
    const context=await browser.newContext({viewport:{width:1440,height:900},colorScheme:'light'});
    const page=await context.newPage(),cdp=await context.newCDPSession(page);
    await cdp.send('DOM.enable');await cdp.send('Accessibility.enable');
    for(const [identity,type,initial] of [['forms/DateTimePicker','datetime-local','2026-10-20T12:30'],['forms/WeekPicker','week','2026-W42']]){
      const row={identity,observations:[]};proof.cases.push(row);const target=new URL(base);target.searchParams.set('case',identity);
      await page.goto(target.href,{waitUntil:'networkidle'});
      const main=page.locator('[data-audit-main]'),twin=page.locator('[data-audit-twin]');
      assert.equal(await main.count(),1);assert.equal(await twin.count(),1);
      const field=main.locator(`input[type="${type}"]`);assert.equal(await field.count(),1);assert.equal(await field.inputValue(),initial);
      const id=await field.getAttribute('id');assert(id,'Exact field ID required');
      await page.evaluate(()=>{window.__segmentDiagnosticEvents=[];window.__segmentDiagnosticTruncated=false;for(const type of ['keydown','input','change','focusin','focusout','ely:change','ely:action'])document.addEventListener(type,event=>{
        const bounded=value=>{if(typeof value==='string'&&value.length>256){window.__segmentDiagnosticTruncated=true;return value.slice(0,256);}return value;};
        if(window.__segmentDiagnosticEvents.length>=128){window.__segmentDiagnosticTruncated=true;return;}
        const detail={};if(event.type.startsWith('ely:')){let count=0;for(const key in event.detail||{}){if(++count>16){window.__segmentDiagnosticTruncated=true;break;}const value=event.detail[key];if(value!==null&&!['string','boolean','number'].includes(typeof value)){window.__segmentDiagnosticTruncated=true;continue;}detail[bounded(key)]=bounded(value);}}
        window.__segmentDiagnosticEvents.push({type:event.type,trusted:event.isTrusted,key:bounded(event.key||null),targetId:bounded(event.target?.id||null),value:bounded(event.target?.value??null),detail});
      },true);});
      const twinSnapshot=()=>twin.evaluate(boundedSegmentTwinSnapshot);
      const twinBefore=await twinSnapshot();
      const observe=async stage=>{
        const {root}=await cdp.send('DOM.getDocument',{depth:0});
        const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector:`#${await field.evaluate(node=>CSS.escape(node.id))}`});assert(nodeId);
        const {node}=await cdp.send('DOM.describeNode',{nodeId,depth:0});
        assert((node.shadowRoots||[]).length<=2,'Diagnostic shadow root collection truncated');
        const ids=new Set(),nodes=[];
        for(const backendNodeId of [node.backendNodeId,...(node.shadowRoots||[]).map(root=>root.backendNodeId)]){
          const {object}=await cdp.send('DOM.resolveNode',{backendNodeId});assert(object.objectId);
          try{
            const result=await cdp.send('Runtime.callFunctionOn',{objectId:object.objectId,functionDeclaration:boundedSegmentDOMNodes.toString()});assert(!result.exceptionDetails,'Diagnostic DOM collection truncated');assert(result.result.objectId);
            try{
              const properties=await cdp.send('Runtime.getProperties',{objectId:result.result.objectId,ownProperties:true});assert(properties.result.length<=66,'Diagnostic DOM properties truncated');
              for(const property of properties.result.filter(p=>/^\d+$/.test(p.name))){
                const {node:child}=await cdp.send('DOM.describeNode',{objectId:property.value.objectId,depth:0});ids.add(child.backendNodeId);assert(ids.size<=64,'Diagnostic DOM collection truncated');
              }
            }finally{await cdp.send('Runtime.releaseObject',{objectId:result.result.objectId});}
          }finally{await cdp.send('Runtime.releaseObject',{objectId:object.objectId});}
        }
        for(const backendNodeId of ids){const partial=await cdp.send('Accessibility.getPartialAXTree',{backendNodeId,fetchRelatives:false});assert(partial.nodes.length<=1,'Diagnostic AX collection truncated');for(const ax of partial.nodes){boundedSegmentJSON(ax,32768);nodes.push(ax);}}
        const state=await field.evaluate(node=>({value:node.value,active:document.activeElement===node,valid:node.validity.valid}));
        const events=await page.evaluate(()=>({events:window.__segmentDiagnosticEvents,truncated:window.__segmentDiagnosticTruncated}));assert(!events.truncated,'Diagnostic native event collection truncated');
        const raw={stage,dom:{backendNodeId:node.backendNodeId,children:[...ids].map(backendNodeId=>({backendNodeId}))},ax:nodes,state,events:events.events};row.observations.push(raw);boundedSegmentJSON(proof,segmentDiagnosticMaxBytes-8192);return raw;
      };
      await field.click();const before=await observe('clicked');assert(before.state.active);const observed=observedNativeSegment(before.dom,before.ax);
      await page.keyboard.press('ArrowUp');const after=await observe('one-arrow-up');assert(after.state.active);observedNativeSegment(after.dom,after.ax);assert.notEqual(after.state.value,before.state.value);assert(after.state.valid);
      for(let n=0;n<observed.count+1;n++){await page.keyboard.press('Tab');const state=await observe(`tab-${n+1}`);if(!state.state.active)break;}
      const last=row.observations.at(-1);assert.equal(last.state.active,false,'Bounded Tab traversal must actually leave the field');
      assert(last.events.some(e=>e.type==='keydown'&&e.key==='ArrowUp'&&e.targetId===id&&e.trusted));
      assert(last.events.some(e=>e.type==='input'&&e.targetId===id&&e.trusted));
      assert(last.events.filter(e=>['keydown','input','change'].includes(e.type)&&e.targetId===id).every(e=>e.trusted),'Native events must remain trusted');
      assert.deepEqual(await twinSnapshot(),twinBefore);assert(!last.events.some(e=>e.targetId&&e.targetId!==id&&['input','change'].includes(e.type)),'No neighboring control input');
      row.mechanicsObserved=true;
    }
  }catch(error){proof.failed=true;proof.truncated=/truncated|limit|byte cap/.test(error.message);proof.error={name:error.name,message:error.message.slice(0,1024),stack:error.stack?.slice(0,4096)};throw error;}
  finally{try{if(browser)await browser.close();proof.cleanup=true;}finally{const text=segmentDiagnosticOutput(proof);await writeFile(output,text,{flag:'wx'});if(!proof.failed)assert(!JSON.parse(text).failed,'Diagnostic output truncated');}}
});

test('eight exact forms contracts execute 28 native checkpoint oracles with strict payload trust and source fixtures',async()=>{
  const rows=[['NumberInput','NumberInput',4],['ScrubInput','ScrubInput',2],['PinInput','PinInput',3],['OTPInput','PinInput',3],['InlineEdit','InlineEdit',6],['EditableText','InlineEdit',6],['InputGroup','InputGroup',2],['InputAddon','InputGroup',2]];
  const event=(type,control,value,trusted=true,key=null)=>({type,control,value,trusted,key,targetId:control==='field'||control==='hidden'?'primary-field':control.startsWith('slot-')?'primary-'+control:null});
  const change=(identity,value,type)=>({type:'ely:change',detail:{id:'primary',component:identity,name:'caller_value',value,checked:false,type}});
  let count=0;
  for(const [name,kind,cp] of rows){
    const identity='forms/'+name,contract=requestedStateContract(identity),fixture=contract.fixtureGuards;
    assert.equal(contract.kind,kind);assert.equal(contract.focusedSequence,'forms-eight-explicit-native');assert.equal(contract.nativeFormTwinWitness,true);assert.equal(contract.steps.length,cp);
    assert(contract.steps.every(step=>step.source.provenance.includes(identity)&&step.source.provenance.includes('not PreviewExamples')));
    assert.deepEqual(contract.steps.map(s=>s.nativeTabCommit),fixture.steps.map(s=>s.startsWith('commit-')));
    for(const stage of fixture.steps){
      const proof={id:'primary',fieldID:'primary-field',nativeEvents:[],publicEvents:[]};
      if(fixture.mode==='number'||fixture.mode==='group'){
        const commit=stage.startsWith('commit-'),invalid=stage.endsWith('invalid');proof.value=fixture.mode==='number'?(invalid?'100':'5'):'beta';
        proof.nativeEvents=commit?[event('keydown','field',proof.value,true,'Tab'),event('change','field',proof.value),event('blur','field',proof.value)]:[event('input','field',proof.value)];
        proof.publicEvents=commit?[change(identity,proof.value,fixture.mode==='number'?'number':'text')]:[];proof.focusLeft=commit;
        proof.bounds={min:'1',max:'99',step:'1'};proof.validity=Object.fromEntries(['badInput','customError','patternMismatch','rangeOverflow','rangeUnderflow','stepMismatch','tooLong','tooShort','typeMismatch','valueMissing','valid'].map(key=>[key,key==='valid'?!invalid:key==='rangeOverflow'&&invalid]));
      }else if(fixture.mode==='scrub'){
        proof.value=stage==='scrub-right'?'121':'120';proof.ariaValue=proof.value;proof.bounds={min:'-2000',max:'2000',step:'1'};
        proof.nativeEvents=[event('keydown','scrub',null,true,stage==='scrub-right'?'ArrowRight':'ArrowLeft'),event('input','field',proof.value,false),event('change','field',proof.value,false)];proof.publicEvents=[change(identity,proof.value,'number')];
      }else if(fixture.mode==='pin'){
        const first=stage==='pin-replace-first',invalid=stage==='pin-reject-nondigit';proof.value=first?'923456':invalid?'93456':'983456';
        proof.slots=first?['9','2','3','4','5','6']:invalid?['9','','3','4','5','6']:['9','8','3','4','5','6'];proof.slotIDs=Array.from({length:6},(_,i)=>'primary-slot-'+i);proof.focusedSlot=stage==='pin-repair-second'?2:1;
        proof.nativeEvents=[event('input',first?'slot-0':'slot-1',first?'9':invalid?'x':'8'),event('input','hidden',proof.value,false),event('change','hidden',proof.value,false)];proof.publicEvents=[change(identity,proof.value,'hidden')];
      }else{
        const edit=stage==='inline-edit'||stage==='inline-reedit',save=stage==='inline-save',cancel=stage==='inline-cancel';proof.value=save||stage==='inline-reedit'?'beta':stage==='inline-edit'?'draft':'alpha';
        proof.editorHidden=save||cancel;proof.openerHidden=!proof.editorHidden;proof.openerText=save?'beta':'alpha';proof.focusedControl=proof.editorHidden?'open':'field';
        proof.nativeEvents=edit?[event('input','field',proof.value)]:[...(cancel||save?[event('change','field',cancel?'draft':'beta')]:[]),event('click',cancel?'cancel':save?'save':'open','')];
        proof.publicEvents=cancel?[change(identity,'draft','text')]:save?[change(identity,'beta','text'),{type:'ely:change',detail:{id:'primary',component:identity,name:'caller_value',value:'beta'}},{type:'ely:action',detail:{id:'primary',component:identity,action:'save',name:'caller_value',value:'beta'}}]:[];
      }
      assert.equal(assertEightFormStep(identity,stage,proof),proof);count++;
      if(proof.nativeEvents.some(e=>['field','hidden'].includes(e.control)||e.control.startsWith('slot-'))){const bad=structuredClone(proof);bad.nativeEvents.find(e=>['field','hidden'].includes(e.control)||e.control.startsWith('slot-')).targetId='foreign-field';assert.throws(()=>assertEightFormStep(identity,stage,bad));}
      for(const mutate of [p=>p.value='wrong',p=>p.nativeEvents=[],p=>p.nativeEvents[0].trusted=false,p=>p.nativeEvents[0].control='twin',p=>p.publicEvents.push({type:'ely:action',detail:{id:'primary',component:identity,action:'unexpected'}})]){const bad=structuredClone(proof);mutate(bad);assert.throws(()=>assertEightFormStep(identity,stage,bad),`${identity} ${stage}: ${mutate}`);}
      for(const key of ['id','component','name','value'])if(proof.publicEvents.length){const bad=structuredClone(proof);bad.publicEvents[0].detail[key]='wrong';assert.throws(()=>assertEightFormStep(identity,stage,bad));}
      if(proof.publicEvents.length){assert.throws(()=>assertEightFormStep(identity,stage,{...proof,publicEvents:[]}));assert.throws(()=>assertEightFormStep(identity,stage,{...proof,publicEvents:[...proof.publicEvents,...proof.publicEvents]}));}
      if(fixture.mode==='scrub'||fixture.mode==='pin'){const bad=structuredClone(proof);bad.nativeEvents.filter(e=>!e.trusted).forEach(e=>e.trusted=true);assert.throws(()=>assertEightFormStep(identity,stage,bad),'Production synthetic events may not become trusted');}
      if(fixture.mode==='pin'){for(const mutate of [p=>p.focusedSlot=5,p=>p.slots[0]='0']){const bad=structuredClone(proof);mutate(bad);assert.throws(()=>assertEightFormStep(identity,stage,bad));}}
      if(fixture.mode==='number')for(const key of Object.keys(proof.validity)){const bad=structuredClone(proof);bad.validity[key]=!bad.validity[key];assert.throws(()=>assertEightFormStep(identity,stage,bad));}
    }
  }
  assert.equal(count,28);assert.equal(count*4,112);
  assert.equal(requestedStateContract('forms/TokenInput'),null);assert.equal(requestedStateContract('forms/Stepper'),null);
  const [fixtures,aliases,template,controls,forms,actions]=await Promise.all(['internal/gallery/advanced_forms_fixtures.go','internal/gallery/advanced.go','ui/gohtmx/templates/ely-api-forms.html','ui/gohtmx/assets/ely-controls.js','ui/gohtmx/assets/ely-api-forms.js','ui/gohtmx/tests/browser/visual-state-audit-actions.mjs'].map(read));
  assert.match(fixtures,/story.Name == "NumberInput"[\s\S]*?= "Seats", "4", "1", 99, true, "220"/);
  assert.match(fixtures,/story.Name == "ScrubInput"[\s\S]*?= "X", "120", "-2000", 2000, "260"/);
  assert.match(fixtures,/props\["Items"\], props\["Value"\] = \[\]int\{1, 2, 3, 4, 5, 6\}, "123456"/);
  assert.match(aliases,/case "forms\/InputAddon":\s*props\["Prefix"\] = "@"/);
  assert.match(template,/eq \.Kind "InlineEdit"[\s\S]*?data-ely-inline-cancel/);
  assert.match(controls,/hidden.value = slots.map\(\(slot\) => slot.value\).join\(''\)/);
  assert.match(controls,/value.replace\(\/\\D\/g, ''\).slice\(-1\)/);
  assert.match(forms,/inlineClose = save[\s\S]*?if\(!save\)input.value=inlinePrevious;else[\s\S]*?changed\(root,\{name:input.name,value:input.value\}\);emit\(root,'save'/);
  assert.match(actions,/contract.nativeFormTwinWitness===true/);assert.match(actions,/Only the preceding authorized paired Tab target may return/);
  assert(actions.indexOf('receipt.twinWitness={before:twinBefore}')<actions.indexOf('receipt.actionActivation=await action()'),'Twin witness exists before any native action');
  const branch=runRequestedStateActions.toString().split("if(contract.focusedSequence==='forms-eight-explicit-native')")[1].split("if(contract.focusedSequence==='forms-seven-native-local')")[0];
  assert.match(branch,/receipt.nativeFormProof=proof;\s*assertEightFormStep/);assert.match(branch,/retainFailurePayload\(failureDiagnostics,'eightFormsNative'/);assert.match(branch,/finally\{await cleanupPreservingPrimary/);assert.doesNotMatch(branch,/dispatchEvent|new Event|requestSubmit|\.value\s*=/);
  const guard=branch.match(/root\.evaluate\((\(node,cursors\)=>\{if\(node\.__eightFormsNative\.length[^\n]+?\}),\{native:nativeCursor/)[1];
  const node={__eightFormsNative:[{}],__eightFormsPublic:[{}]},cursors={native:1,public:1};
  runInNewContext(`(${guard})(node,cursors)`,{node,cursors});
  for(const bad of [{native:0,public:1},{native:1,public:0},{native:2,public:1}])assert.throws(()=>runInNewContext(`(${guard})(node,cursors)`,{node,cursors:bad}),/Unaccounted native\/public event/);
});

test('DurationPicker serializes trusted native edit/commit and exact public payload',async()=>{
  const base={identity:'forms/DurationPicker',rootID:'duration-root',fieldID:'duration-root-duration',type:'number',value:'31',valid:true,hostRequests:0,truncated:false};
  const edit={...base,nativeEvents:[{type:'input',trusted:true,targetId:base.fieldID,value:'31'}],publicEvents:[]};
  assert.equal(assertDurationNativeProof('edit',edit),edit);
  for(const mutate of [p=>p.nativeEvents[0].trusted=false,p=>p.nativeEvents[0].targetId='twin',p=>p.publicEvents.push({type:'ely:change',detail:{}}),p=>p.value='30']){const bad=structuredClone(edit);mutate(bad);assert.throws(()=>assertDurationNativeProof('edit',bad));}
  const commit={...base,focusLeft:true,nativeEvents:[{type:'change',trusted:true,targetId:base.fieldID,value:'31'},{type:'blur',trusted:true,targetId:base.fieldID,value:'31'}],publicEvents:[{type:'ely:change',detail:{id:base.rootID,component:base.identity,name:'caller_value',value:'31',checked:false,type:'number'}}]};
  assert.equal(assertDurationNativeProof('commit',commit),commit);
  for(const mutate of [p=>p.nativeEvents[1].trusted=false,p=>p.publicEvents[0].detail.value='30',p=>p.publicEvents[0].detail.component='forms/YearPicker',p=>p.publicEvents=[],p=>p.publicEvents.push(structuredClone(p.publicEvents[0])),p=>p.focusLeft=false]){const bad=structuredClone(commit);mutate(bad);assert.throws(()=>assertDurationNativeProof('commit',bad));}
  const source=await read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),branch=source.split("if(identity==='forms/DurationPicker'){\n      const rootID=")[1].split("\n    }\n    await observeNative(field);")[0];
  assert.match(branch,/addEventListener\('ely:change',node\.__durationPublicListener,true\)/);assert.match(branch,/nativeEvents:observed\.native\.slice\(cursor\.native\),publicEvents:observed\.public\.slice\(cursor\.public\)/);assert.match(branch,/assertDurationNativeProof\(stage,proof\)/);assert.doesNotMatch(branch,/dispatchEvent|new Event|requestSubmit|\.value\s*=/);
});

test('eight forms paired Tab return preserves exact twin events and failure payload without waiver',async()=>{
  const focus={id:'paired',eventTarget:'caller_value_twin',matchesExpectedControl:true,matchingControlCount:1};
  const before={snapshot:{controls:[{id:'paired',value:'4'}]},focusWithin:true,focusTarget:focus,events:[]};
  const after={snapshot:before.snapshot,focusWithin:false,events:[{type:'focusout',isTrusted:true,target:'caller_value_twin',targetId:'paired'}]};
  assert.equal(assertFormTwinWitness(before,after,{allowPairedNativeCommitReturn:true}),true);
  for(const mutate of [p=>p.events=[],p=>p.events[0].isTrusted=false,p=>p.events[0].targetId='foreign',p=>p.events.push({type:'input',isTrusted:true}),p=>p.snapshot.controls[0].value='changed',p=>p.focusWithin=true]){const bad=structuredClone(after);mutate(bad);assert.throws(()=>assertFormTwinWitness(before,bad,{allowPairedNativeCommitReturn:true}));}
  assert.throws(()=>assertFormTwinWitness({...before,focusTarget:{...focus,matchesExpectedControl:false}},after,{allowPairedNativeCommitReturn:true}));
  assert.throws(()=>assertFormTwinWitness(before,after,{allowPairedNativeCommitReturn:true,allowPairedNativeCommitFocus:true}));
  const payload={nativeEvents:[{type:'input',trusted:false}],publicEvents:[]};
  const failure=await probeFailureStateAndPayload({eightFormsNative:payload},async()=>({value:'diagnostic'}),async()=>{throw Error('Must retain already collected payload');});
  assert.deepEqual(failure.nativePayload,payload);
  const failedRead={};await retainFailurePayload(failedRead,'eightFormsNative',async()=>{throw Error('closed diagnostic context');});
  const retained=await probeFailureStateAndPayload(failedRead,async()=>({}),async()=>null);
  assert.equal(retained.diagnosticError[0].phase,'eight-forms-native-payload');assert.equal(retained.diagnosticError[0].message,'closed diagnostic context');
  const cleanupError=Error('closed cleanup context');await cleanupPreservingPrimary(async()=>{throw cleanupError;},Error('original assertion'),failedRead,'eightFormsCleanupError');
  const withCleanup=await probeFailureStateAndPayload(failedRead,async()=>({}),async()=>null);assert.equal(withCleanup.diagnosticError[1].phase,'eight-forms-cleanup');
  await assert.rejects(cleanupPreservingPrimary(async()=>{throw cleanupError;},null,{},'eightFormsCleanupError'),error=>error===cleanupError);
});

test('DurationPicker failure payload survives failed verification and listener cleanup',async()=>{
  const failureDiagnostics={},payload={native:[{type:'change',trusted:true,targetId:'duration-field',value:'31'}],public:[{type:'ely:change',detail:{value:'wrong'}}]};let livePayload=payload,primaryError;
  try{assertDurationNativeProof('commit',{identity:'forms/DurationPicker',rootID:'duration-root',fieldID:'duration-field',type:'number',value:'31',valid:true,hostRequests:0,focusLeft:true,truncated:false,nativeEvents:payload.native,publicEvents:payload.public});}
  catch(error){primaryError=error;await retainFailurePayload(failureDiagnostics,'durationNative',async()=>livePayload);}
  finally{await cleanupPreservingPrimary(async()=>{livePayload=null;},primaryError,failureDiagnostics,'durationNativeCleanupError');}
  assert(primaryError,'The intentionally wrong payload must fail verification');
  const retained=await probeFailureStateAndPayload(failureDiagnostics,async()=>({closed:true}),async()=>{assert.equal(livePayload,null);throw Error('listener state was already cleaned');});
  assert.deepEqual(retained.nativePayload,payload,'The pre-cleanup native and public evidence remains the persisted failure payload');
  assert.deepEqual(retained.diagnosticError,undefined);
  const failedRead={};await retainFailurePayload(failedRead,'durationNative',async()=>{throw Error('duration listener read failed');});
  const readFailure=await probeFailureStateAndPayload(failedRead,async()=>({}),async()=>{throw Error('no fallback payload');});
  assert.deepEqual(readFailure.diagnosticError.map(error=>error.phase),['duration-native-payload','native-payload']);
  const cleanupError=Error('duration listener cleanup failed');await cleanupPreservingPrimary(async()=>{throw cleanupError;},Error('original proof failure'),failedRead,'durationNativeCleanupError');
  const cleanupFailure=await probeFailureStateAndPayload(failedRead,async()=>({}),async()=>null);
  assert(cleanupFailure.diagnosticError.some(error=>error.phase==='duration-native-cleanup'&&error.message===cleanupError.message));
});

test('Input TextField ClearableInput finite native contracts preserve aliases and distinguish production clear events',async()=>{
  const identities=['forms/Input','forms/TextField','forms/ClearableInput'];
  for(const identity of identities){
    const contract=requestedStateContract(identity);
    assert.equal(contract.identity,identity);assert.equal(contract.kind,'Input');assert.equal(contract.requestedStateOnly,true);assert.equal(contract.focusedSequence,'input-public-edit-clear');assert.deepEqual(contract.mappingGaps,[]);
    assert.deepEqual(contract.steps.map(step=>step.id),['fill-text','commit-text','clear-text','commit-empty']);
    assert(contract.steps.every(step=>step.source.provenance.includes(identity)&&step.source.provenance.includes('no host fulfillment')));
    assert.equal(contract.steps[2].control,identity==='forms/ClearableInput'?'button[data-ui-action="clear"]':'input[name="caller_value"]');
    const id='audit-exact',value='Changed caller value',detail={id,component:identity,name:'caller_value',value,checked:false,type:'text'},events=[{type:'ely:change',detail}];
    assertFoundationPublicEvents(identity,id,events,{value});
    for(const bad of [{...detail,component:'forms/Other'},{...detail,id:'twin'},{...detail,name:'other'},{...detail,value:'wrong'}])assert.throws(()=>assertFoundationPublicEvents(identity,id,[{type:'ely:change',detail:bad}],{value}));
    assert.throws(()=>assertFoundationPublicEvents(identity,id,[...events,...events],{value}));
    assert.throws(()=>assertFoundationPublicEvents(identity,id,[{type:'ely:action',detail}],{value}));
  }
  assert.equal(identities.length*4*4,48,'Three identities, four live profiles, four checkpoints; no alias receipt promotion');
  assert.equal(requestedStateContract('forms/TokenInput'),null,'No generic input-family expansion');
  const event=(type,value,isTrusted)=>({type,value,isTrusted,defaultPrevented:false});
  for(const stage of ['fill-text','commit-text','clear-text','commit-empty']){
    const value=stage==='fill-text'||stage==='commit-text'?'Changed caller value':'',type=stage.startsWith('commit')?'change':'input',events=[event(type,value,true)];
    assertPlainInputNativeEvents(stage,events,{value});
    assert.throws(()=>assertPlainInputNativeEvents(stage,[event(type,value,false)],{value}),/Exact native/);
    assert.throws(()=>assertPlainInputNativeEvents(stage,[...events,...events],{value}),/Exact native/);
  }
  const clearEvents=[event('click','',true),event('input','',false),event('change','',false)];
  assertPlainInputNativeEvents('clear-text',clearEvents,{clearButton:true,value:''});
  assertPlainInputNativeEvents('commit-empty',[],{clearButton:true,value:''});
  assert.throws(()=>assertPlainInputNativeEvents('clear-text',clearEvents.map(e=>({...e,isTrusted:true})),{clearButton:true,value:''}),/Exact native/,'Generated clear events must not be mislabeled trusted');
  assert.throws(()=>assertPlainInputNativeEvents('clear-text',clearEvents.map(e=>({...e,isTrusted:false})),{clearButton:true,value:''}),/Exact native/,'A synthetic initiating click cannot pass');
  assert.throws(()=>assertPlainInputNativeEvents('commit-empty',[event('change','',false)],{clearButton:true,value:''}),/Exact native/,'Duplicate clear commit cannot pass');
  const [fixtures,template,controls,api,actions]=await Promise.all([read('internal/gallery/advanced_forms_fixtures.go'),read('ui/gohtmx/templates/ely-api-forms.html'),read('ui/gohtmx/assets/ely-controls.js'),read('ui/gohtmx/assets/ely-api.js'),read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs')]);
  assert.match(fixtures,/"Name": "caller_value", "Value": "alpha"/);
  assert.match(template,/eq \.Variant "ClearableInput"[\s\S]*?template "clearable-input"/);
  assert.match(controls,/action === 'clear'[\s\S]*?input\.value = ''[\s\S]*?new Event\('input'[\s\S]*?new Event\('change'[\s\S]*?input\.focus\(\)/);
  assert.match(api,/component: root\.dataset\.elyComponent, name: event\.target\.name/);
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/);
  const driver=runRequestedStateActions.toString(),branch=driver.slice(driver.indexOf("if(contract.focusedSequence==='input-public-edit-clear'"),driver.indexOf("if(['button-public-boundary','textarea-public-multiline']"));
  assert.match(branch,/Exact primary caller input must be unique/);assert.doesNotMatch(branch,/\.first\(|\.nth\(/);
  assert.match(branch,/initialPeers/);assert.match(branch,/await fresh\(\)/);assert.match(branch,/field\.fill\(/);assert.match(branch,/clear\.click\(\)/);assert.match(branch,/field\.press\('Backspace'\)/);assert.match(branch,/field\.press\('Tab'\)/);
  assert.doesNotMatch(branch,/dispatchEvent|requestSubmit|new Event|\.value\s*=/,'Driver must not synthesize input, mutate fixture values, or submit host work');
  assert.match(branch,/finally\{await root\.evaluate/);
});

test('five formatted input contracts retain exact fixture types bounds native validity and alias events',async()=>{
  const expected=[
    ['forms/EmailInput','EmailInput','email','caller@example.test','changed@example.test','not-an-email','typeMismatch'],
    ['forms/UrlInput','EmailInput','url','https://example.test/source','https://example.test/changed','not-a-url','typeMismatch'],
    ...['CurrencyInput','PercentInput','UnitInput'].map(name=>['forms/'+name,'CurrencyInput','number','3','4','11','rangeOverflow']),
  ];
  for(const [identity,kind,type,initial,valid,invalid,invalidFlag]of expected){
    const contract=requestedStateContract(identity),fixture=contract.inputFixture;
    assert.equal(contract.identity,identity);assert.equal(contract.kind,kind);assert.equal(contract.focusedSequence,'input-public-validity');assert.equal(contract.requestedStateOnly,true);assert.deepEqual(contract.mappingGaps,[]);
    assert.deepEqual(fixture,{kind,type,initial,...(type==='number'?{min:'0',max:'10',step:'1'}:{}),valid,invalid,invalidFlag});
    assert.deepEqual(contract.steps.map(step=>step.id),['fill-valid','commit-valid','fill-invalid','commit-invalid']);
    assert.equal(contract.steps[0].control,`:scope > .ely-api-format-field input[name="caller_value"][type="${type}"]`);
    assert(contract.steps.every(step=>step.source.provenance.includes(identity)&&step.source.provenance.includes('no unit switching')));
    for(const bad of [false,true]){
      const value=bad?invalid:valid,state={name:'caller_value',type,value,...(type==='number'?{min:'0',max:'10',step:'1'}:{}),validity:Object.fromEntries(['badInput','customError','patternMismatch','rangeOverflow','rangeUnderflow','stepMismatch','tooLong','tooShort','typeMismatch','valueMissing','valid'].map(key=>[key,key==='valid'?!bad:bad&&key===invalidFlag]))};
      assert.deepEqual(assertFormattedInputState(identity,state,{invalid:bad}),state);
      for(const key of Object.keys(state.validity)){const changed=structuredClone(state);changed.validity[key]=!changed.validity[key];assert.throws(()=>assertFormattedInputState(identity,changed,{invalid:bad}),/Exact native validity/,'Every extra or missing validity reason fails closed: '+key);}
      for(const key of ['name','type','value',...(type==='number'?['min','max','step']:[])])assert.throws(()=>assertFormattedInputState(identity,{...state,[key]:'wrong'},{invalid:bad}));
      const id='exact-main',events=[{type:'ely:change',detail:{id,component:identity,name:'caller_value',value,checked:false,type}}];
      assertFoundationPublicEvents(identity,id,events,{value});
      for(const change of [{id:'twin'},{component:'forms/Other'},{name:'preview_field'},{type:'text'},{value:'stale'}])assert.throws(()=>assertFoundationPublicEvents(identity,id,[{type:'ely:change',detail:{...events[0].detail,...change}}],{value}));
      assert.throws(()=>assertFoundationPublicEvents(identity,id,[...events,...events],{value}));assert.throws(()=>assertFoundationPublicEvents(identity,id,[{type:'ely:action',detail:events[0].detail}],{value}));
      for(const [stage,eventType]of [['fill-text','input'],['commit-text','change']]){const native={type:eventType,value,isTrusted:true,defaultPrevented:false};assertPlainInputNativeEvents(stage,[native],{value});assert.throws(()=>assertPlainInputNativeEvents(stage,[{...native,isTrusted:false}],{value}));}
    }
  }
  assert.equal(expected.length*4*4,80,'Five exact IDs by four checkpoints by four live profiles; no shared alias receipts');
  for(const identity of ['forms/TagInput','forms/RegexInput'])assert.equal(requestedStateContract(identity),null);
  assert.throws(()=>assertFormattedInputState('forms/Other',{},{}),/No generic/);
  const [fixtures,aliases,template]=await Promise.all([read('internal/gallery/advanced_forms_fixtures.go'),read('internal/gallery/advanced.go'),read('ui/gohtmx/templates/ely-api-forms.html')]);
  assert.match(fixtures,/case "NumberInput", "ScrubInput", "CurrencyInput":\s*props\["Value"\], props\["Min"\], props\["Max"\], props\["Step"\] = "3", "0", 10, "1"/);
  assert.match(fixtures,/case "EmailInput":\s*props\["Value"\] = "caller@example.test"/);
  assert.match(aliases,/case "UrlInput":\s*props\["Value"\], props\["Type"\] = "https:\/\/example.test\/source", "url"/);
  assert.match(template,/eq \.Kind "CurrencyInput"[\s\S]*?"Type" "number"/);
  assert.match(template,/eq \.Variant "UrlInput"[\s\S]*?\$type = "url"/);
  const driver=runRequestedStateActions.toString(),branch=driver.slice(driver.indexOf("if(contract.focusedSequence==='input-public-edit-clear'"),driver.indexOf("if(['button-public-boundary','textarea-public-multiline']"));
  assert.match(branch,/assertFormattedInputState/);assert.match(branch,/node\.validity\[key\]/);assert.match(branch,/formatted\?\.initial/);assert.match(branch,/getAttribute\(key\),formatted\[key\]/);assert.match(branch,/initialPeers/);assert.match(branch,/await fresh\(\)/);
  assert.doesNotMatch(branch,/\.first\(|\.nth\(|reportValidity|requestSubmit|dispatchEvent|new Event|\.value\s*=/);
});

test('Search Password Phone Masked explicit native contracts retain canonical masks public events and toggle trust',async()=>{
  const fixtures=[
    ['forms/SearchInput','SearchInput','search',['fill-text','commit-text','clear-text']],
    ['forms/PasswordInput','PasswordInput','password',['fill-text','commit-text','show-password','hide-password']],
    ['forms/PhoneInput','PhoneInput','tel',['fill-partial','fill-masked','commit-text']],
    ['forms/MaskedInput','PhoneInput','text',['fill-partial','fill-masked','commit-text']],
  ];
  for(const [identity,kind,type,stages]of fixtures){
    const contract=requestedStateContract(identity);assert.equal(contract.kind,kind);assert.equal(contract.focusedSequence,'input-public-special');assert.equal(contract.requestedStateOnly,true);assert.deepEqual(contract.steps.map(step=>step.id),stages);assert.deepEqual(contract.mappingGaps,[]);
    assert(contract.steps.every(step=>step.source.provenance.includes(identity)&&step.source.provenance.includes('not PreviewExamples')));
    const masked=identity==='forms/PhoneInput'||identity==='forms/MaskedInput';
    const aliasMask=identity==='forms/MaskedInput';
    assert.equal(contract.inputFixture.initial,aliasMask?'ab-1234':masked?'01012345678':'alpha');
    if(masked)assert.equal(contract.inputFixture.mask,aliasMask?'aa-9999':'###-####-####');
    for(const stage of stages){
      const toggle=stage.endsWith('-password'),value=masked?(aliasMask?(stage==='fill-partial'?'a':'ab-9876'):(stage==='fill-partial'?'010':'010-9876-5432')):stage==='clear-text'?'':'Changed caller value';
      const state={name:'caller_value',type:stage==='show-password'?'text':type,value,valid:true,...(toggle?{label:stage==='show-password'?'Hide':'Show',ariaLabel:stage==='show-password'?'Hide password':'Show password'}:{})};
      assertSpecialInputState(identity,stage,state);
      for(const key of Object.keys(state))assert.throws(()=>assertSpecialInputState(identity,stage,{...state,[key]:key==='valid'?false:'wrong'}));
      if(toggle){const event={type:'click',value,isTrusted:true,defaultPrevented:false};assertPlainInputNativeEvents(stage,[event],{value});for(const bad of [[{...event,isTrusted:false}],[event,event],[event,{...event,type:'change'}]])assert.throws(()=>assertPlainInputNativeEvents(stage,bad,{value}));}
      if(stage==='commit-text'||stage==='clear-text'){
        const detail={id:'primary',component:identity,name:'caller_value',value,checked:false,type},events=[{type:'ely:change',detail}];assertFoundationPublicEvents(identity,'primary',events,{value});
        for(const change of [{id:'twin'},{component:'forms/Other'},{name:'preview'},{type:'wrong'},{value:'stale'},{checked:true}])assert.throws(()=>assertFoundationPublicEvents(identity,'primary',[{type:'ely:change',detail:{...detail,...change}}],{value}));
        assert.throws(()=>assertFoundationPublicEvents(identity,'primary',[...events,...events],{value}));assert.throws(()=>assertFoundationPublicEvents(identity,'primary',[{type:'ely:action',detail}],{value}));
      }
    }
  }
  assert.equal(fixtures.reduce((count,row)=>count+row[3].length,0),13);
  assert.throws(()=>assertSpecialInputState('forms/Other','fill-text',{}));assert.throws(()=>assertSpecialInputState('forms/PhoneInput','show-password',{}));
  const [fixture,template,controls,forms]=await Promise.all([read('internal/gallery/advanced_forms_fixtures.go'),read('ui/gohtmx/templates/ely-api-forms.html'),read('ui/gohtmx/assets/ely-controls.js'),read('ui/gohtmx/assets/ely-api-forms.js')]);
  assert.match(fixture,/props\["Value"\], props\["Mask"\] = "01012345678", "###-####-####"/);
  assert.match(template,/eq \.Variant "MaskedInput"[\s\S]*?\$type = "text"/);assert.match(template,/"Type" "search"/);
  assert.match(controls,/action === 'password-toggle'[\s\S]*?input\.type = shown \? 'password' : 'text'[\s\S]*?'Show password' : 'Hide password'/);
  assert.match(forms,/field\.value=fitFormMask\(field\.dataset\.elyMask,field\.value\)/);
  const aliases=await read('internal/gallery/advanced.go');
  const override=aliases.match(/case "forms\/MaskedInput":\s*props\["Mask"\], props\["Value"\], props\["Placeholder"\] = "([^"]+)", "([^"]+)", "([^"]+)"/);
  assert(override,'Qualified MaskedInput alias override must be read, not inferred from PhoneInput');
  const maskedFixture=requestedStateContract('forms/MaskedInput').inputFixture;
  assert.equal(maskedFixture.mask,override[1]);assert.equal(maskedFixture.initial,override[2]);assert.equal(override[3],'__-____');
  assert.throws(()=>assertSpecialInputState('forms/MaskedInput','fill-masked',{name:'caller_value',type:'text',value:'010-9876-5432',valid:true}),'Phone cooked value must not approve the qualified alias');
  assert.equal(maskedFixture.raw,'1ab!987654z');
  const driver=runRequestedStateActions.toString(),branch=driver.slice(driver.indexOf("if(contract.focusedSequence==='input-public-edit-clear'"),driver.indexOf("if(['button-public-boundary','textarea-public-multiline']"));
  assert.match(branch,/special\.raw/);assert.match(branch,/toggle\.click\(\)/);assert.match(branch,/assertSpecialInputState/);assert.match(branch,/Last recent search: nothing yet/);assert.match(branch,/Canonical mask fixture has no country selector/);
  assert.doesNotMatch(branch,/dispatchEvent|new Event|requestSubmit|\.value\s*=|\.first\(|\.nth\(/);
});

test('ActivityLog contract traverses all four native target links by trusted keyboard focus',async()=>{
  const identity='collab/ActivityLog',hrefs=['#gamma-space','#lift','#on-lift','#lift'],contract=requestedStateContract(identity);
  assert.equal(contract.identity,identity);assert.equal(contract.kind,'ActivityLog');assert.equal(contract.family,'workspace');assert.equal(contract.requestedStateOnly,true);assert.equal(contract.focusedSequence,'workspace-activity-native-link-focus');assert.deepEqual(contract.mappingGaps,[]);
  assert.deepEqual(contract.fixtureGuards,{component:identity,entryHrefs:hrefs});
  assert.deepEqual(contract.steps.map(step=>step.id),hrefs.map((_,index)=>`activity-focus-entry-${index+1}`));
  assert.deepEqual(contract.steps.map(step=>step.control),hrefs.map((href,index)=>`li[data-ws-activity-entry]:nth-child(${index+1}) a[href="${href}"]`));
  assert(contract.steps.every(step=>step.event.includes('trusted native Tab')&&step.expectedState.includes('without activating it')&&step.source.siteId.endsWith(`:${step.id}`)&&step.source.sourceAnchor&&step.source.provenance.includes(identity)));
  assert.match(contract.scope,/single-case audit page with its independent twin/);assert.match(contract.scope,/all four primary target links in DOM order/);assert.match(contract.scope,/No link activation, navigation, host request/);
  assert.equal(requestedStateContract('collab/CommentThread'),null,'The exact ActivityLog contract does not promote its family peers');

  const [driver,actions,fixture,template]=await Promise.all([read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs'),read('internal/gallery/advanced_workspace_fixtures.go'),read('ui/gohtmx/templates/ely-api-workspace.html')]);
  const start=driver.indexOf("if(contract.focusedSequence==='workspace-activity-native-link-focus')"),end=driver.indexOf("if(contract.focusedSequence==='workspace-native-presence-follow')",start),branch=driver.slice(start,end);
  assert(start>=0&&end>start);assert.match(branch,/const identity='collab\/ActivityLog'/);assert.match(branch,/links\.count\(\),4/);assert.match(branch,/ownerDocument\.activeElement===node\.ownerDocument\.body/);
  assert.match(branch,/await assertActivityLogScopedAuditPage\(root\)/,'The scoped audit guard must run through the supplied root');
  assert.match(branch,/for\(let count=0;count<32;count\+\+\)[\s\S]*?keyboard\.press\('Tab'\)/,'The first link must be reached through a short bounded native Tab traversal on the exact-case page');
  assert.match(branch,/else await root\.page\(\)\.keyboard\.press\('Tab'\)/,'The remaining three links advance one native Tab at a time');
  assert.match(branch,/tabs\.every\(event=>event\.trusted&&event\.key==='Tab'\)/);assert.match(branch,/focusin/);assert.match(branch,/state\.actions\.slice\(before\.actions\.length\),\[\]/);
  assert.doesNotMatch(branch,/\.focus\(|\.click\(|dispatchEvent\(/,'No programmatic focus, activation, or synthetic DOM event may stand in for keyboard traversal');
  assert.match(actions,/contract\.focusedSequence==='workspace-activity-native-link-focus'[\s\S]*?scopedURL\.searchParams\.set\('case',contract\.identity\)/,'Only the exact native-focus contract opts into the scoped audit route');
  const activity=fixture.slice(fixture.indexOf('case "collab/ActivityLog":'),fixture.indexOf('case "devtools/QueryEditor"'));
  for(const href of hrefs)assert(activity.includes(`"URL": "${href}"`),`Default ActivityLog fixture link ${href}`);
  assert.match(template,/define "ws-activity"[\s\S]*?<a href="\{\{\.URL\}\}">\{\{\.Target\}\}<\/a>[\s\S]*?<time datetime=/);
});

test('ActivityLog scoped-page guard executes against the supplied runner page',async()=>{
  const selectors=[],page={locator(selector){selectors.push(selector);return {async count(){return selector==='[data-audit-case]'||selector==='[data-audit-name="collab/ActivityLog"]'?1:0;}};}},root={page(){return page;}};
  await assertActivityLogScopedAuditPage(root);
  assert.deepEqual(selectors,['[data-audit-case]','[data-audit-name="collab/ActivityLog"]']);
  await assert.rejects(assertActivityLogScopedAuditPage({page(){return {locator(){return {async count(){return 0;}};}};}}),/Exact-case audit route must keep the native tab order bounded to one component pair/);
});

test('forced scroll source guard rejects assignments without mistaking equality comparisons',()=>{
  const forcedScrollAssignment=/scrollTop\s*=(?!=)/;
  assert.match('node.scrollTop = 12',forcedScrollAssignment,'A direct forced-scroll assignment remains forbidden');
  assert.doesNotMatch('next.scrollTop===current.scrollTop',forcedScrollAssignment,'A scroll-position equality check is not an assignment');
});

test('CookieBanner, PromptPlayground, and SubAgentTree add only exact source-backed local-action contracts',async()=>{
  const expected=[
    ['misc/CookieBanner','Terms','native-cookie-owner-boundary',['cookies-accept-all','cookies-reject-all','cookies-open-choices','cookies-select-analytics','cookies-save-choices']],
    ['generative/PromptPlayground','PromptPlayground','native-prompt-owner-boundary',['prompt-fill-topic','prompt-fill-tone','prompt-run-request']],
    ['agent/SubAgentTree','SubAgentTree','communication-subagent-tree-local',['tree-collapse-code','tree-expand-code','tree-select-code']],
  ];
  const contracts=expected.map(([identity,kind,sequence,steps])=>{
    const contract=requestedStateContract(identity);assert.equal(contract?.identity,identity);assert.equal(contract.kind,kind);assert.equal(contract.focusedSequence,sequence);assert.equal(contract.requestedStateOnly,true);assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),steps);
    assert(contract.steps.every(step=>step.source.siteId===`focused-state:${identity}:${step.id}`&&step.source.sourceAnchor&&step.source.provenance.includes(identity)));
    return contract;
  });
  assert.equal(contracts[0].behaviorKey,'misc/Terms','Terms names the shared behavior only; the exact gallery case remains CookieBanner');
  assert.equal(contracts.reduce((sum,contract)=>sum+contract.steps.length,0),11);
  for(const identity of ['misc/Terms','misc/Consent Dialog','generative/PromptDiff','agent/AgentStepList','agent/SubAgentTreeExtra'])assert.equal(requestedStateContract(identity),null,`${identity} must not inherit one of these exact-case contracts`);

  const [driver,nativeTemplate,nativeMisc,nativeMiscJS,promptFixture,promptDefaults,promptJS,communicationTemplate,communicationFixture,communicationJS,communicationGalleryChecks,docs]=await Promise.all([
    read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/templates/ely-api-native.html'),read('internal/gallery/assets/native-misc-fixtures.json'),read('ui/gohtmx/assets/ely-api-native-misc.js'),read('internal/gallery/advanced_native_generative_fixtures.go'),read('internal/gallery/advanced_native_fixtures.go'),read('ui/gohtmx/assets/ely-api-native-generative-tools.js'),read('ui/gohtmx/templates/ely-api-communication.html'),read('internal/gallery/advanced_communication_fixtures.go'),read('ui/gohtmx/assets/ely-api-communication.js'),read('internal/gallery/assets/advanced-communication-checks.js'),read('docs/gohtmx/advanced-communication.md'),
  ]);
  assert.match(nativeTemplate,/eq \.Kind "Terms"[\s\S]*?ne \.Variant "CookieBanner"[\s\S]*?data-cookies="all"[\s\S]*?data-cookies="none"[\s\S]*?data-cookies="choose"/);
  assert.match(nativeMisc,/"Terms":\s*\{[\s\S]*?"CookieKinds"[\s\S]*?"Analytics"[\s\S]*?"Video"/);
  assert.match(nativeMiscJS,/b\.dataset\.cookies==='choose'&&options\.hidden[\s\S]*?options\.hidden=false[\s\S]*?send\(cookies,'choose-cookies',\{values,necessary:true\}\)/);
  assert.match(contracts[0].scope,/no local dismissal or persistence|Host requests do not prove storage/);

  assert.match(promptFixture,/case "PromptPlayground":[\s\S]*?"Write three short notes on \{topic\} in a \{tone\} voice\.",[\s\S]*?"\{\}"/);
  assert.match(promptDefaults,/"Name":\s*"native_value"/,'The shared gallery fixture supplies native_value as the actual PromptPlayground form field');
  assert.match(promptJS,/listen\(template,'input',rebuild\)/);assert.match(promptJS,/listen\(fields,'input'/);assert.match(promptJS,/preview\.replaceChildren\(\)[\s\S]*?mark\.textContent=filled\.text\.slice\(start,end\)/);assert.match(promptJS,/running=true[\s\S]*?emit\(root,form\.dataset\.action/);
  assert.match(promptJS,/listen\(root,'ely:prompt-output'/,'Output is supplied only by the host response boundary');
  assert.match(driver,/topic\.fill\('observability'\)[\s\S]*?tone\.fill\('concise'\)[\s\S]*?clickVisibleControl\(run\)[\s\S]*?answer:'none; host response not supplied'/);
  assert.match(contracts[1].scope,/No synthetic host response, generated answer, or provider claim/);

  assert.match(communicationFixture,/case "SubAgentTree":[\s\S]*?"Status": "working", "Progress": 62, "Open": true[\s\S]*?"Value": "code", "Label": "Code: change the lift", "Status": "working", "Progress": 45, "Open": true/);
  assert.match(communicationTemplate,/define "ely-api-agent-tree-node"[\s\S]*?<details[\s\S]*?<summary[\s\S]*?<progress value="\{\{\.Item\.Progress\}\}" max="100"/);
  assert.match(communicationJS,/if\(element\.matches\('\[data-ely-select\]'\)\)\{const tree=element\.closest\('\.ely-agent-tree'\);if\(tree\)\{tree\.querySelectorAll\('\[data-ely-select\]\[aria-current="true"\]'\)[\s\S]*?setAttribute\('aria-current','true'\);\}else\{root\.querySelectorAll\('\[data-ely-select\]\[aria-selected="true"\]'\)[\s\S]*?setAttribute\('aria-selected','true'\);\}changed\(root,'selection'[\s\S]*?emit\(root,'select',detail\(root,element\)\);return;\}/,'Tree uses aria-current while generic selectable controls retain aria-selected and the same select event');
  const treeGalleryCheck=communicationGalleryChecks.slice(communicationGalleryChecks.indexOf("'agent/SubAgentTree':"),communicationGalleryChecks.indexOf("'agent/FileChangeCard':"));
  assert.match(treeGalleryCheck,/node\.getAttribute\('aria-current'\)==='true'/,'The connected gallery Tree assertion must read its current-selection state');
  assert.doesNotMatch(treeGalleryCheck,/aria-selected/,'The Tree gallery assertion must not use generic-control aria-selected');
  assert.match(communicationJS,/const detail=\(root,element=\{\}\)=>\(\{value:element\.value\|\|element\.dataset\.value\|\|element\.dataset\.elyValue\|\|''/,'Selection host details must honor the template public data-ely-value contract');
  assert.match(driver,/node\.addEventListener\('toggle',event=>node\.__visualDisclosureEvents\.push\([\s\S]*?statusProgress\(current\)[\s\S]*?clickVisibleControl\(marker\)[\s\S]*?clickVisibleControl\(code\)/);
  assert.match(docs,/SubAgentTree uses nested `Items`[\s\S]*?maintains local disclosure and selection/);
  assert.match(contracts[2].scope,/status\/progress|status\/progress/);
  const cookieDriver=driver.slice(driver.indexOf("if(contract.focusedSequence==='native-cookie-owner-boundary')"),driver.indexOf("if(contract.focusedSequence==='native-prompt-owner-boundary')")),promptDriver=driver.slice(driver.indexOf("if(contract.focusedSequence==='native-prompt-owner-boundary')"),driver.indexOf("if(contract.focusedSequence==='communication-subagent-tree-local')"));
  assert.doesNotMatch(cookieDriver,/dispatchEvent\(/,'Cookie choices are activated by native controls');assert.doesNotMatch(promptDriver,/dispatchEvent\(|ely:prompt-output/,'Prompt interactions stay native and do not fabricate a host response');
});

test('focused five-case action contracts stay explicit and source-backed',async()=>{
  const cases=[
    ['forms/HotkeyInput','HotkeyInput','hotkey-record-clear-restore',['record-shortcut','clear-shortcut','restore-shortcut']],
    ['forms/ShortcutRecorder','HotkeyInput','hotkey-record-clear-restore',['record-shortcut','clear-shortcut','restore-shortcut']],
    ['account/SignupForm','SignupForm','signup-terms-label',['fill-name','fill-email','fill-password','accept-terms-label']],
    ['navigation/Tabs','Tabs','tabs-panel-selection',['select-tab','keyboard-select-tab']],
    ['motion/Lottie Player','ParticleBackground','lottie-play-pause-frame-reset',['play-animation','pause-animation','seek-visible-frame','reset-visible-frame']],
  ];
  for(const [identity,kind,sequence,ids] of cases){
    const contract=requestedStateContract(identity);
    assert.equal(contract?.identity,identity);
    assert.equal(contract.kind,kind);
    assert.equal(contract.focusedSequence,sequence);
    assert.equal(contract.requestedStateOnly,true);
    assert.deepEqual(contract.mappingGaps,[]);
    assert.deepEqual(contract.steps.map(step=>step.id),ids);
    assert(contract.steps.every(step=>step.source.siteId.startsWith(`focused-state:${identity}:`)&&step.source.sourceAnchor===null&&step.source.provenance.length>0));
    assert.match(contract.scope,/separate from registered-check coverage/);
  }

  const [controls,formsTemplate,formsCSS,formsJS,controlsJS,interactionTemplate,interactionJS,interactionFixture,components]=await Promise.all([
    read('ui/gohtmx/templates/ely-controls.html'),read('ui/gohtmx/templates/ely-api-forms.html'),read('ui/gohtmx/assets/ely-api-forms.css'),read('ui/gohtmx/assets/ely-api-forms.js'),read('ui/gohtmx/assets/ely-controls.js'),
    read('ui/gohtmx/templates/ely-api-interaction.html'),read('ui/gohtmx/assets/ely-api-interaction.js'),read('internal/gallery/advanced_interaction_fixtures.go'),read('ui/gohtmx/components.json'),
  ]);
  assert.match(controls,/class="ely-api-hotkey-glyph"/);
  assert.match(formsCSS,/\.ely-api-hotkey-control \.ely-api-hotkey-glyph/);
  assert.match(formsCSS,/padding-inline-start:2rem/);
  assert.match(formsJS,/type==='SignupForm'/);
  assert.match(formsTemplate,/class="ely-suite-terms"><input type="checkbox" name="terms" required>/);
  assert.match(formsTemplate,/data-suite-validate="\{\{\.Kind\}\}"/);
  assert.match(formsJS,/form\.checkValidity\(\)/);
  assert.match(formsJS,/send\.disabled=disabled\(\)\|\|!valid/);
  assert.match(controlsJS,/if \(event\.key === 'Escape'\).*uiHotkeyPrevious/);
  assert.match(controlsJS,/if \(event\.key === 'Backspace' \|\| event\.key === 'Delete'\).*value = ''/);
  assert.match(interactionTemplate,/data-interaction-tab/);
  assert.match(interactionTemplate,/role="tabpanel"/);
  assert.match(interactionJS,/animation\.play\(\); status\.textContent = 'Animation playing'/);
  assert.match(interactionJS,/animation\.pause\(\); status\.textContent = 'Animation paused'/);
  assert.match(interactionJS,/animation\.goToAndStop\(Number\(seek\.value\)/);
  assert.match(interactionFixture,/"Autoplay": false, "Loop": false/);
  assert.match(components,/"ShortcutRecorder"/);
});

test('focused driver does not imply neighboring cases or catalog approval',()=>{
  for(const identity of ['forms/TagInput','navigation/EditorTabs','motion/ParticleBackground','account/LoginForm'])
    assert.equal(requestedStateContract(identity),null,`${identity} is outside this focused five-case scope`);
});

test('five rendered presence aliases keep exact native follow and stop request contracts',async()=>{
  const identities=['collab/PresenceAvatars','collab/LiveIndicator','collab/FollowMode','collab/RemoteSelection','collab/RemoteCursor'];
  const steps=['presence-follow-ada','presence-stop-button','presence-follow-ada-again','presence-stop-escape'];
  for(const identity of identities){
    const contract=requestedStateContract(identity);assert.equal(contract?.identity,identity);assert.equal(contract.kind,'PresenceAvatars');assert.equal(contract.family,'workspace');assert.equal(contract.behaviorKey,'collab/PresenceAvatars');assert.equal(contract.requestedStateOnly,true);assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),steps);assert(contract.steps.every(step=>step.source.siteId===`presence-state:${identity}:${step.id}`&&step.source.sourceAnchor.includes('ws-presence')&&step.source.provenance.includes(identity)));
  }
  const [driver,template,handler,emitter]=await Promise.all([read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/templates/ely-api-workspace.html'),read('ui/gohtmx/assets/ely-api-workspace.js'),read('ui/gohtmx/assets/ely-api.js')]);
  assert.match(template,/data-ws-presence data-following="\{\{\.Following\}\}"/);assert.match(template,/data-ws-follow data-ely-action="follow-user" value="\{\{\.ID\}\}"/);assert.match(template,/data-ws-follow-stop/);
  assert.match(handler,/follow\(following\); emit\(root, 'follow-user', \{value: button\.value, following\}\)/);assert.match(handler,/follow\(''\); emit\(root, 'stop-following', \{\}\)/);assert.match(handler,/if \(presence\?\.dataset\.following\) \{ follow\(''\); emit\(root, 'stop-following', \{\}\); \}/);
  assert.match(emitter,/detail: \{ \.\.\.detail, id: root\.id, component: root\.dataset\.elyComponent, action \}/);
  const start=driver.indexOf("if(contract.focusedSequence==='workspace-native-presence-follow')"),end=driver.indexOf("if(contract.focusedSequence==='native-embed-open-host')",start),branch=driver.slice(start,end);
  assert(start>=0&&end>start);for(const source of [...steps,"activatePresenceStep(id,{ada,stop})","event.isTrusted","assertPresenceNativeRequest(id,newEvents,newActions","fixtureSource","document.addEventListener('click'","document.addEventListener('keydown'"])assert(branch.includes(source),source);
  assert.match(assertPresenceNativeRequest.toString(),/trusted:true/);assert.match(assertPresenceNativeRequest.toString(),/control:step==='presence-stop-button'\?'stop':'ada'/);assert.match(assertPresenceNativeRequest.toString(),/assert\.deepEqual\(actions,\[request\]/);
  assert.doesNotMatch(branch,/dispatchEvent\(/,'Presence controls use native Playwright activation, not synthetic dispatch');
});

test('presence activation invokes the requested native control, including Escape on Ada',async()=>{
  const calls=[],ada={click(){calls.push(['ada','click']);return 'follow';},press(key){calls.push(['ada','press',key]);return 'escape-stop';}},stop={click(){calls.push(['stop','click']);return 'button-stop';}};
  assert.equal(await activatePresenceStep('presence-follow-ada',{ada,stop}),'follow');
  assert.equal(await activatePresenceStep('presence-stop-button',{ada,stop}),'button-stop');
  assert.equal(await activatePresenceStep('presence-follow-ada-again',{ada,stop}),'follow');
  assert.equal(await activatePresenceStep('presence-stop-escape',{ada,stop}),'escape-stop');
  assert.deepEqual(calls,[['ada','click'],['stop','click'],['ada','click'],['ada','press','Escape']]);
  assert.throws(()=>activatePresenceStep('presence-stop-unknown',{ada,stop}),/Unknown presence step/);
});

test('presence native request assertion distinguishes Escape target from stop outcome',()=>{
  const id='presence-root',component='collab/RemoteCursor';
  const cases=[
    ['presence-follow-ada',{type:'click',trusted:true,key:null,control:'ada'},{id,component,action:'follow-user',value:'ada',following:'ada'}],
    ['presence-stop-button',{type:'click',trusted:true,key:null,control:'stop'},{id,component,action:'stop-following'}],
    ['presence-follow-ada-again',{type:'click',trusted:true,key:null,control:'ada'},{id,component,action:'follow-user',value:'ada',following:'ada'}],
    ['presence-stop-escape',{type:'keydown',trusted:true,key:'Escape',control:'ada'},{id,component,action:'stop-following'}],
  ];
  for(const [step,native,request]of cases)assert.deepEqual(assertPresenceNativeRequest(step,[native],[request],{id,component}),{native,request});
  assert.throws(()=>assertPresenceNativeRequest('presence-stop-escape',[{type:'keydown',trusted:true,key:'Escape',control:'stop'}],[cases[3][2]],{id,component}),/actual target/,'Escape targets the focused Ada button, not the stop button');
  assert.throws(()=>assertPresenceNativeRequest('presence-stop-escape',[cases[3][1]],[cases[0][2]],{id,component}),/expected alias-scoped host request/,'Escape still must emit stop-following');
  assert.throws(()=>assertPresenceNativeRequest('presence-stop-escape',[{...cases[3][1],trusted:false}],[cases[3][2]],{id,component}),/trusted native input/,'Synthetic key dispatch cannot stand in for native Escape');
});

test('each declared focused sequence has a matching asserted driver path',()=>{
  const driver=runRequestedStateActions.toString();
  for(const id of ['record-shortcut','clear-shortcut','restore-shortcut','fill-name','fill-email','fill-password','accept-terms-label','select-tab','keyboard-select-tab','play-animation','pause-animation','seek-visible-frame','reset-visible-frame'])
    assert.match(driver,new RegExp(`runStep\\('${id}'`),`${id} must be executed by the focused driver`);
  assert.match(driver,/clickVisibleControl\(label\)/,'Signup terms must be activated by a hit-tested visible label');
  assert.match(driver,/await seek\.press\('Home'\)/,'Lottie reset must use the public range keyboard interaction');
  assert.match(driver,/node\.addEventListener\('ely:change'/,'Tabs and Lottie must observe real root-scoped change events');
  assert.match(driver,/name==='tab'&&change\.value===expected&&change\.selected===true/,'Tab changes must be asserted from their emitted detail');
  assert.match(driver,/name==='frame'&&change\.value===String\(expected\)/,'Lottie frame changes must be asserted from their emitted detail');
  assert.match(driver,/getBoundingClientRect\(\)/,'Lottie frame shape geometry must come from rendered SVG bounds');
  assert.match(driver,/movement>4/,'The moving marker must measurably change position at frame 50');
  assert.match(driver,/resetDelta<=1/,'Reset must restore independently observed frame-zero geometry');
});

test('Missing35 shipped communication fixtures have finite native local-action contracts with alias behavior deduplicated',async()=>{
  const expected={
    'agent/EvalResultTable':['sort-tokens-ascending','sort-tokens-descending','eval-scroll-last-column'],
    'calendar/CalendarMonthView':['month-page-down','month-open-day'],
    'calendar/CalendarWeekView':['week-scroll-late-events','week-open-samples','week-open-client','week-create-event','week-open-allday'],
    'calendar/TimeGrid':['week-scroll-late-events','week-open-samples','week-open-client','week-create-event','week-open-allday'],
    'calendar/AllDayRow':['week-scroll-late-events','week-open-samples','week-open-client','week-create-event','week-open-allday'],
    'calendar/CurrentTimeIndicator':['week-scroll-late-events','week-open-samples','week-open-client','week-create-event','week-open-allday'],
    'calendar/CalendarDayView':['day-scroll-late-events','day-open-samples','day-open-client','day-create-event','day-reveal-created-draft'],
    'calendar/TimezoneOverlay':['day-scroll-late-events','day-open-samples','day-open-client','day-create-event','day-reveal-created-draft'],
    'calendar/EventPopover':['popover-open','popover-edit','popover-delete','popover-close','popover-reopen','popover-escape'],
    'calendar/AttendeeList':['popover-open','popover-edit','popover-delete','popover-close','popover-reopen','popover-escape'],
  };
  const contracts=Object.entries(expected).map(([identity,ids])=>{
    const contract=requestedStateContract(identity);assert.equal(contract?.identity,identity);assert.equal(contract.requestedStateOnly,true);assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),ids);
    assert(contract.steps.every(step=>step.event.includes('trusted native')&&step.source.siteId===`communication-state:${identity}:${step.id}`&&step.source.provenance.includes(identity)));
    return contract;
  });
  const byKey=new Map();for(const contract of contracts){const prior=byKey.get(contract.behaviorKey);if(prior)assert.deepEqual(contract.steps.map(step=>step.id),prior.steps.map(step=>step.id));else byKey.set(contract.behaviorKey,contract);}
  assert.equal(contracts.length,10,'All ten exact Missing35 gallery identities remain represented');
  assert.equal(byKey.size,5,'The five shared aliases do not inflate the unique handler roster');
  assert.equal(contracts.reduce((sum,contract)=>sum+contract.steps.length,0),47,'Each identity retains its default-fixture checkpoints, including the appended day draft reveal for each exact identity');
  assert.equal([...byKey.values()].reduce((sum,contract)=>sum+contract.steps.length,0),21,'Unique local handler checkpoint total is deduplicated by behavior key');
  assert.equal(47*4,188,'Four mobile profiles require 188 identity/profile checkpoints');
  assert.equal(188*2,376,'Each checkpoint requires owned before/after PNGs');
  assert.equal(21*4*2,168,'Deduplicated handler comparison is 84 checkpoints/168 PNGs, not the alias-expanded capture denominator');
  assert.equal(5*2*4,40,'The requested day rerun is two exact identities × four mobile profiles × five checkpoints');
  assert.equal(40*2,80,'The requested day rerun requires 80 owned before/after PNGs');
  assert.equal(requestedStateContract('calendar/MiniCalendar'),null,'Unrelated calendar siblings stay outside this contract');
  assert.equal(requestedStateContract('agent/TraceViewer'),null,'The canonical TraceViewer check does not create a second gallery specimen contract');
  assert.equal(requestedStateContract('calendar/CurrentTimeIndicator').directControlRole,'display-only indicator within the shared week fixture');
  assert.equal(requestedStateContract('calendar/TimezoneOverlay').directControlRole,'display-only overlay within the shared day fixture');
  assert.equal(requestedStateContract('calendar/AttendeeList').directControlRole,'display-only attendee content within the shared popover fixture');
  const day=requestedStateContract('calendar/CalendarDayView');
  assert.deepEqual(day.steps.slice(0,4).map(step=>step.id),['day-scroll-late-events','day-open-samples','day-open-client','day-create-event'],'The four existing day checkpoints remain in their original order');
  assert.equal(day.steps[4].id,'day-reveal-created-draft');
  assert.match(day.steps[4].expectedState,/complete painted.*16:00.*16:30/);

  const notificationReview=requestedStateContract('feedback/Notification').steps.find(step=>step.id==='notification-open-review');
  assert.match(notificationReview.expectedState,/review\(""\)/,'Nested Review actions do not inherit the notification row value');
  assert.equal(assertCommunicationCallerRequest([{action:'review',component:'feedback/Notification',value:''}],0,'feedback/Notification','review','').event.value,'');
  assert.throws(()=>assertCommunicationCallerRequest([{action:'review',component:'feedback/Notification',value:'review'}],0,'feedback/Notification','review',''),/default-fixture value/,'A row-derived value must not be invented for nested notification actions');

  assert.throws(()=>assertCommunicationCallerRequest([{action:'delete-event',component:'calendar/EventPopover',value:'review'}],0,'calendar/EventPopover','edit-event','review'),/wrong caller request/,'A plausible but wrong host request must fail the causal control');
  assert.throws(()=>assertCommunicationCallerRequest([{action:'edit-event',component:'calendar/EventPopover',value:'review'},{action:'edit-event',component:'calendar/EventPopover',value:'review'}],0,'calendar/EventPopover','edit-event','review'),/exactly one new caller request/,'Duplicate host requests must fail the causal control');
  const visibleColumns=Array.from({length:6},()=>({insideRoot:true,insideClip:true}));
  assert.equal(assertEvalLastColumnGeometry({scrollLeft:200,previousScrollLeft:0,scrollWidth:580,clientWidth:380,columns:visibleColumns,actionsBefore:2,actionsAfter:2,initiallyVisible:false,didScroll:true}).overflow,true,'Scrollable final column is accepted after local wheel movement with no action');
  assert.equal(assertEvalLastColumnGeometry({scrollLeft:0,previousScrollLeft:0,scrollWidth:380,clientWidth:380,columns:visibleColumns,actionsBefore:2,actionsAfter:2,initiallyVisible:true,didScroll:false}).overflow,false,'A fitting final column is accepted by passive geometry with no wheel or host action');
  assert.throws(()=>assertEvalLastColumnGeometry({scrollLeft:200,previousScrollLeft:0,scrollWidth:580,clientWidth:380,columns:[...visibleColumns.slice(0,5),{insideRoot:true,insideClip:false}],actionsBefore:2,actionsAfter:2,initiallyVisible:false,didScroll:true}),/within the component root and local scrollport/,'A clipped final value cannot pass on wheel movement alone');
  assert.throws(()=>assertEvalLastColumnGeometry({scrollLeft:0,previousScrollLeft:0,scrollWidth:580,clientWidth:380,columns:visibleColumns,actionsBefore:2,actionsAfter:2,initiallyVisible:false,didScroll:false}),/requires native horizontal wheel input/,'An initially hidden final column cannot pass without native wheel input');
  assert.throws(()=>assertEvalLastColumnGeometry({scrollLeft:200,previousScrollLeft:0,scrollWidth:580,clientWidth:380,columns:visibleColumns,actionsBefore:2,actionsAfter:3,initiallyVisible:false,didScroll:true}),/must not emit a host action/,'The passive reachability checkpoint rejects an extra host action');

  const [driver,template,fixture,communicationJS,communicationCSS,actions]=await Promise.all([read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/templates/ely-api-communication.html'),read('internal/gallery/advanced_communication_fixtures.go'),read('ui/gohtmx/assets/ely-api-communication.js'),read('ui/gohtmx/assets/ely-api-communication.css'),read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs')]);
  assert.match(driver,/if\(contract\.focusedSequence\?\.startsWith\('communication-'\)\)/,'Legacy requested-state contracts may omit focusedSequence and must retain the safe optional guard');
  const communicationPath=driver.slice(driver.indexOf("if(contract.focusedSequence?.startsWith('communication-'))"),driver.indexOf("if(contract.focusedSequence==='vertical-range-native-scroll')"));
  assert.doesNotMatch(communicationPath,/\.dispatchEvent\(|innerHTML|scrollTop\s*=(?!=)/,'Input stays native and no DOM injection or forced scroll substitutes for user actions');
  assert.match(communicationPath,/mouse\.wheel/);assert.match(communicationPath,/keyboard\.press\('Escape'\)/);assert.match(communicationPath,/aria-expanded/);assert.match(communicationPath,/assertCommunicationCallerRequest/);
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/,'The existing generic requested-state route must execute these communication contracts without a new whitelist');
  assert.match(communicationPath,/let beforeDate='',expectedDate='';[\s\S]*PageDown selection must equal the independently derived clamped next-month date/,'PageDown result must be checked against a date derived from the pre-action selected date');
  assert.match(communicationPath,/data-ely-date="2026-10-13"\]\[data-ely-time="16:00"/);assert.match(communicationPath,/data-ely-date="2026-10-13"\]\[data-ely-time="16:30"/);
  assert.match(communicationPath,/Exactly one Tuesday 16:00 slot must exist/);assert.match(communicationPath,/event\.start,'2026-10-13T16:00'/);assert.match(communicationPath,/event\.end,'2026-10-13T16:30'/);
  assert.match(communicationJS,/emit\(root,'create-event',\{start:values\[0\],end:values\[1\]\}\)/,'Calendar creation emits an interval payload from native pointer-drag input');
  assert.match(template,/<section class="ely-agent-evals">[\s\S]*?<table>/,'The evaluation table is nested inside its source-defined component section');
  assert.match(communicationCSS,/\.ely-agent-evals\{[^}]*overflow:auto/,'The evaluation section is the native horizontal scroll owner');assert.match(communicationCSS,/\.ely-agent-evals table\{[^}]*min-width:580px/,'The source table can exceed narrow profile width');
  assert.match(communicationPath,/owner=root\.locator\('\.ely-agent-evals'\)/,'The final-column check must use the component section that owns overflow');
  assert.match(communicationPath,/data-eval-column.*?time/,'The final header and cells must be selected by their source-initialized Time-column identity');
  assert.match(communicationPath,/mouse\.wheel\(Math\.max\(120,Math\.round\(box\.width\*\.75\)\),0\)/,'Overflow is inspected with bounded native horizontal wheel input');
  assert.match(communicationPath,/if\(current\.scrollWidth>current\.clientWidth&&!initiallyVisible\)/,'The driver scrolls only when local overflow clips the final column');
  assert.match(fixture,/\{"Value": "time", "Label": "Time"\}/,'The last asserted column is the default fixture Time field');
  assert.equal((template.match(/data-ely-calendar-time-slot data-ely-date="\{\{\.Date\}\}" data-ely-time="\{\{\$slotTime\}\}"/g)||[]).length,2,'Week and day time slots expose both date and time for an exact column match');
  assert.match(communicationPath,/mouse\.wheel\([\s\S]*?requestAnimationFrame\(\(\)=>requestAnimationFrame\(resolve\)\)/,'Every bounded wheel input must settle through two animation frames before reachability is rechecked');
  const calendarKeydown=communicationJS.slice(communicationJS.indexOf("root.addEventListener('keydown',event=>{const day="),communicationJS.indexOf("},options);",communicationJS.indexOf("root.addEventListener('keydown',event=>{const day="))+10);
  assert.match(calendarKeydown,/event\.stopImmediatePropagation\(\)[\s\S]*calendarShift\(day\.value,delta\)[\s\S]*navigate\(delta<0\?'previous':'next',date\)[\s\S]*selectDay\(date\)[\s\S]*next\?\.focus\(\)/,'CalendarMonthView PageDown uses the stateful calendar handler, not the event-only generic fallback');
  assert.match(communicationJS,/emit\(root,'calendar-navigation',\{direction,view:kind,date:shown\}\)/,'The stateful calendar handler emits the navigated date in its caller payload');
  assert(communicationJS.indexOf("if(root.dataset.elyComponent?.startsWith('calendar/'))mountCalendar(root,lifecycle)")<communicationJS.indexOf("root.addEventListener('keydown',onKeyDown)"),'The calendar handler registers before the generic event-only fallback and stops propagation for calendar-day keys');
  assert.match(template,/<td>\{\{\.\}\}<\/td>/,'Evaluation cells remain html/template-escaped text');
  assert.match(template,/\{\{\.Content\}\}/);assert.match(template,/\{\{\.Name\}\}/);assert.doesNotMatch(template,/template\.HTML/,'Communication caller data is not promoted to trusted HTML');
  assert.match(fixture,/case "CalendarWeekView"/);assert.match(fixture,/case "CalendarDayView"/);assert.match(fixture,/case "EventPopover"/);
});

test('WebSocket history and day-event draft reveals append native-wheel checkpoints without changing prior actions',async()=>{
  const socket=requestedStateContract('devtools/WebSocketConsole'),day=requestedStateContract('calendar/CalendarDayView'),dayAlias=requestedStateContract('calendar/TimezoneOverlay');
  assert.deepEqual(socket.steps.slice(0,12).map(step=>step.id),['empty-enter','type-ping','send-enter','type-pong','send-button','request-disconnect','host-ack-closed','type-closed-draft','closed-enter','clear-closed-draft','request-connect','host-ack-open'],'All twelve existing WebSocket send, event, and host-ack checkpoints remain unchanged');
  assert.equal(socket.steps[12].id,'history-wheel-reveal');assert(socket.steps[12].event.includes('native'));assert(socket.steps[12].expectedState.includes('complete first history row'));
  assert.deepEqual(day.steps.slice(0,4).map(step=>step.id),['day-scroll-late-events','day-open-samples','day-open-client','day-create-event'],'All four existing day checkpoints remain unchanged');
  assert.equal(day.steps[4].id,'day-reveal-created-draft');assert.equal(dayAlias.steps[4].id,'day-reveal-created-draft');assert.deepEqual(dayAlias.steps.map(step=>step.id),day.steps.map(step=>step.id));
  assert.equal(13*2,26,'Two WebSocket mobile themes require 26 checkpoints');assert.equal(26*2,52,'WebSocket replay needs 52 before/after primary images');
  assert.equal(5*2*4,40,'Two day identities across four mobile profiles require 40 checkpoints');assert.equal(40*2,80,'Day replay needs 80 before/after primary images');
  const driver=await read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),socketStart=driver.indexOf("if(contract.focusedSequence==='websocket-public-host-boundary')"),socketEnd=driver.indexOf("if(['sheet-native-actions'",socketStart),calendarStart=driver.indexOf("if(contract.focusedSequence==='communication-calendar-week'||contract.focusedSequence==='communication-calendar-day')"),calendarEnd=driver.indexOf("if(contract.focusedSequence==='communication-event-popover')",calendarStart);
  assert(socketStart>=0&&socketEnd>socketStart&&calendarStart>=0&&calendarEnd>calendarStart);
  const socketPath=driver.slice(socketStart,socketEnd),calendarPath=driver.slice(calendarStart,calendarEnd);
  assert.match(socketPath,/root\.page\(\)\.mouse\.wheel\(0,-Math\.max\(120/);assert.match(socketPath,/scrollTop:[^,]+,scrollHeight:[^,]+,clientHeight:[^,]+,scrollMax:/);assert.match(socketPath,/firstRowFullyVisible/);assert.match(socketPath,/history-log/);
  assert.match(calendarPath,/root\.page\(\)\.mouse\.wheel\(decision\.deltaX,decision\.deltaY\)/);assert.match(calendarPath,/scrollLeft:node\.scrollLeft,scrollWidth:node\.scrollWidth,clientWidth:node\.clientWidth,scrollMaxX/);assert.match(calendarPath,/scrollTop:node\.scrollTop,scrollHeight:node\.scrollHeight,clientHeight:node\.clientHeight,scrollMaxY/);assert.match(calendarPath,/draftVisible/);assert.match(calendarPath,/New event · 16:00 – 16:30/);assert.match(calendarPath,/nativeWheels/);
  assert.match(driver,/export function calendarDraftWheelDecision/);assert.match(driver,/if\(left<metrics\.clip\.left\)[\s\S]*?if\(right>metrics\.clip\.right\)[\s\S]*?if\(top<metrics\.clip\.top\)[\s\S]*?if\(bottom>metrics\.clip\.bottom\)/,'The pure classifier resolves horizontal bounds before vertical bounds');
  assert.doesNotMatch(socketPath,/scrollTop\s*=(?!=)|\.scrollIntoView\(|\.style\s*\./,'WebSocket reveal uses native input without forced DOM scrolling or style writes');
  assert.doesNotMatch(calendarPath,/scrollTop\s*=(?!=)|\.scrollIntoView\(|\.style\s*\./,'Calendar reveal uses native input without forced DOM scrolling or style writes');
});

test('calendar draft reveal classifies horizontal clipping before vertical clipping and rejects unreachable text',()=>{
  const metrics=({rects,scrollLeft=0,scrollTop=20})=>({textRects:rects,scrollLeft,scrollWidth:400,clientWidth:300,scrollMaxX:100,scrollTop,scrollHeight:300,clientHeight:100,scrollMaxY:200,clip:{left:0,right:300,top:0,bottom:100}});
  assert.deepEqual(calendarDraftWheelDecision(metrics({rects:[{left:298,right:312,top:95,bottom:115}]})),{axis:'horizontal',deltaX:12,deltaY:0},'Horizontal overrun takes precedence and does not issue a vertical wheel');
  assert.deepEqual(calendarDraftWheelDecision(metrics({rects:[{left:-5,right:50,top:20,bottom:35}],scrollLeft:10})),{axis:'horizontal',deltaX:-5,deltaY:0},'A left-clipped fragment uses native horizontal movement toward the start');
  assert.deepEqual(calendarDraftWheelDecision(metrics({rects:[{left:20,right:80,top:95,bottom:115}]})),{axis:'vertical',deltaX:0,deltaY:15},'Vertical movement is selected only after horizontal bounds fit');
  assert.deepEqual(calendarDraftWheelDecision(metrics({rects:[{left:20,right:80,top:-5,bottom:35}],scrollTop:10})),{axis:'vertical',deltaX:0,deltaY:-5},'A top-clipped fragment uses native vertical movement toward the start');
  assert.equal(calendarDraftWheelDecision(metrics({rects:[{left:-5,right:20,top:10,bottom:30}]})).reason,'Calendar draft remains clipped at the horizontal start endpoint');
  assert.equal(calendarDraftWheelDecision(metrics({rects:[{left:20,right:330,top:10,bottom:30}]})).reason,'Calendar draft text spans 310px, wider than the owned 300px horizontal scrollport');
  assert.deepEqual(calendarDraftWheelDecision(metrics({rects:[{left:20,right:80,top:10,bottom:30}]})),{axis:'visible',deltaX:0,deltaY:0});
});

test('IframeEmbed and EmbedCard retain exact native host-open contracts without provider navigation',async()=>{
  const identities=[['misc/IframeEmbed','iframe-open-host'],['misc/EmbedCard','embedcard-open-host']],url='https://example.com',sourceNote='Web views need macOS for now.';
  for(const [identity,stepId]of identities){
    const contract=requestedStateContract(identity);assert.equal(contract?.identity,identity);assert.equal(contract.kind,'IframeEmbed');assert.equal(contract.family,'native');assert.equal(contract.requestedStateOnly,true);assert.equal(contract.focusedSequence,'native-embed-open-host');assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),[stepId]);
    const step=contract.steps[0];assert.equal(step.control,'header button[data-ely-action="open"][data-value="https://example.com"]');assert.match(step.event,/trusted native Playwright button click/);assert(step.expectedState.includes('exact URL')&&step.expectedState.includes('remain unchanged'));assert.equal(step.source.siteId,`native-state:${identity}:${stepId}`);assert(step.source.provenance.includes(identity));
  }
  assert.equal(identities.length*4,8,'Two exact identities over four live profiles require eight checkpoints');assert.equal(identities.length*4*2,16,'Each checkpoint requires before/after primary captures');

  const [catalogue,fixtures,template,api,driver,actions]=await Promise.all([read('ui/gohtmx/components.json'),read('internal/gallery/assets/native-misc-fixtures.json'),read('ui/gohtmx/templates/ely-api-native.html'),read('ui/gohtmx/assets/ely-api.js'),read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs')]);
  const pages=JSON.parse(catalogue).pages,story=pages.flatMap(page=>page.stories).find(item=>item.name==='IframeEmbed'),fixture=JSON.parse(fixtures).IframeEmbed;
  assert.deepEqual(story.components,['IframeEmbed','EmbedCard'],'EmbedCard is the native catalogue alias, with a separate gallery identity');assert.equal(fixture.URL,url);assert.equal(fixture.SourceNote,sourceNote);assert.equal(fixture.HideHeader,true,'The source fixture header policy must remain as-authored');
  assert.match(template,/<header><span>◎ \{\{\.URL\}\}<\/span><button type="button" data-ely-action="\{\{or \.Action "open"\}\}" data-value="\{\{\.URL\}\}" aria-label="Open with host">/,'The embedded native header action stays rendered independently of the source note');
  assert.match(api,/emit\(root, button\.dataset\.elyAction, \{ value: button\.value \|\| button\.dataset\.value \|\| ''/);assert.match(api,/detail: \{ \.\.\.detail, id: root\.id, component: root\.dataset\.elyComponent, action \}/);assert.doesNotMatch(api,/window\.open\s*\(/,'The control emits to the host; it does not navigate or launch an external provider');
  const embedPath=runRequestedStateActions.toString().slice(runRequestedStateActions.toString().indexOf("if(contract.focusedSequence==='native-embed-open-host')"),runRequestedStateActions.toString().indexOf("if(contract.focusedSequence==='dock-native-actions')"));
  assert.match(embedPath,/header button\[data-ely-action="open"\]\[data-value="https:\/\/example\.com"\]/);assert.match(embedPath,/button\.click\(\)/);assert.match(embedPath,/event\.isTrusted/);assert.match(embedPath,/finally/);assert.doesNotMatch(embedPath,/dispatchEvent|window\.open/,'Native input and host request must not be replaced by synthetic dispatch or navigation');
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/,'The existing generic requested-state route must execute both Embed identities');

  for(const [identity]of identities){
    const rootId=`audit-${identity.replace('/','-')}`,before={id:rootId,component:identity,kind:'IframeEmbed',button:{action:'open',value:url,disabled:false,ariaLabel:'Open with host'},sourceNote,iframeCount:0};
    const action={id:rootId,component:identity,action:'open',value:url},click={trusted:true,id:rootId,component:identity,action:'open',value:url};
    assert.deepEqual(assertNativeEmbedOpen({actions:[action],clicks:[click],identity,rootId,url,before,after:{...before,button:{...before.button}}}),{identity,rootId,url,action:'open',trustedClick:true,localStateUnchanged:true});
    assert.throws(()=>assertNativeEmbedOpen({actions:[{...action,value:'https://wrong.example'}],clicks:[click],identity,rootId,url,before,after:before}),/exact fixture URL/,'A wrong host URL cannot pass');
    const wrongIdentity=identity==='misc/IframeEmbed'?'misc/EmbedCard':'misc/IframeEmbed';
    assert.throws(()=>assertNativeEmbedOpen({actions:[{...action,component:wrongIdentity}],clicks:[click],identity,rootId,url,before,after:before}),/alias identity/,'An alias action cannot be relabeled as its canonical component');
    assert.throws(()=>assertNativeEmbedOpen({actions:[{...action,id:'other-root'}],clicks:[click],identity,rootId,url,before,after:before}),/exact rendered root ID/,'An action from another component root cannot pass');
    assert.throws(()=>assertNativeEmbedOpen({actions:[action],clicks:[{...click,trusted:false}],identity,rootId,url,before,after:before}),/trusted browser input/,'Synthetic click cannot pass');
    assert.throws(()=>assertNativeEmbedOpen({actions:[action],clicks:[click],identity,rootId,url,before,after:{...before,iframeCount:1}}),/must not mutate/,'A provider/frame poststate cannot pass as this host-only fixture action');
  }
});

test('Dock default fixture covers four native tab clicks, Enter/Space activation, and one native HTML drop',async()=>{
  const contract=requestedStateContract('layout/Dock'),ids=['dock-click-files','dock-click-outline','dock-click-search','dock-click-terminal','dock-key-enter-search','dock-key-space-search','dock-drag-files-center'];
  assert.equal(contract?.kind,'Dock');assert.equal(contract.requestedStateOnly,true);assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),ids);
  assert(contract.steps.every(step=>step.source.siteId.startsWith('dock-state:layout/Dock:')&&step.source.sourceAnchor.includes('ely-api-foundation')));
  assert.match(contract.steps[4].event,/trusted native.*keyboard/);assert.match(contract.steps[5].event,/trusted native.*keyboard/);assert.match(contract.steps[6].event,/trusted native.*HTML drag-and-drop/);
  assert.equal(ids.length,7,'Dock contributes seven distinct target checkpoints per selected profile');

  assertDockCallerAction([{action:'change',component:'layout/Dock',value:'Files'}],0,'layout/Dock','Files');
  assertDockCallerAction([{action:'change',component:'layout/Dock',value:'Files',dock:'center'}],0,'layout/Dock','Files','center');
  assert.throws(()=>assertDockCallerAction([{action:'change',component:'layout/Dock',value:'Outline'}],0,'layout/Dock','Files'),/Files/,'A wrong tab payload cannot pass');
  assert.throws(()=>assertDockCallerAction([{action:'change',component:'layout/Dock',value:'Files'},{action:'change',component:'layout/Dock',value:'Files'}],0,'layout/Dock','Files'),/exactly one/,'Duplicate host requests cannot pass');
  assert.throws(()=>assertDockCallerAction([{action:'change',component:'layout/Dock',value:'Files',dock:'right'}],0,'layout/Dock','Files','center'),/center/,'A drop into a different zone cannot pass');
  assertDockNativeEvents('dock-click-files',[{type:'click',trusted:true,detail:1,tab:'Files'}],'Files');
  assertDockNativeEvents('dock-key-enter-search',[{type:'keydown',trusted:true,key:'Enter',tab:'Search'},{type:'click',trusted:true,detail:0,tab:'Search'},{type:'keyup',trusted:true,key:'Enter',tab:'Search'}],'Search');
  assertDockNativeEvents('dock-key-space-search',[{type:'keydown',trusted:true,key:' ',tab:'Search'},{type:'keyup',trusted:true,key:' ',tab:'Search'},{type:'click',trusted:true,detail:0,tab:'Search'}],'Search');
  assertDockNativeEvents('dock-drag-files-center',[{type:'dragstart',trusted:true,tab:'Files'},{type:'dragover',trusted:true,zone:'center'},{type:'drop',trusted:true,zone:'center',transferText:'Files'}],'Files');
  assert.throws(()=>assertDockNativeEvents('dock-click-files',[{type:'click',trusted:false,detail:1,tab:'Files'}],'Files'),/trusted browser input/,'Synthetic click dispatch cannot pass');
  assert.throws(()=>assertDockNativeEvents('dock-key-enter-search',[{type:'keydown',trusted:true,key:'Enter',tab:'Search'},{type:'keyup',trusted:true,key:'Enter',tab:'Search'},{type:'click',trusted:true,detail:0,tab:'Search'}],'Search'),/browser key order/,'Enter in Space order cannot pass');
  assert.throws(()=>assertDockNativeEvents('dock-key-space-search',[{type:'keydown',trusted:true,key:' ',tab:'Search'},{type:'click',trusted:true,detail:0,tab:'Search'},{type:'keyup',trusted:true,key:' ',tab:'Search'}],'Search'),/browser key order/,'Space in Enter order cannot pass');
  assert.throws(()=>assertDockNativeEvents('dock-drag-files-center',[{type:'dragstart',trusted:true,tab:'Files'},{type:'drop',trusted:false,zone:'center',transferText:'Files'}],'Files'),/trusted browser input/,'Synthetic drop cannot pass');
  assert.throws(()=>assertDockNativeEvents('dock-drag-files-center',[{type:'dragstart',trusted:true,tab:'Files'},{type:'drop',trusted:true,zone:'right',transferText:'Files'}],'Files'),/center/,'A drop into the wrong zone cannot pass');

  const [template,fixture,foundation,driver,actions]=await Promise.all([read('ui/gohtmx/templates/ely-api-foundation.html'),read('internal/gallery/advanced_foundation_fixtures.go'),read('ui/gohtmx/assets/ely-api-foundation.js'),read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs')]);
  assert.match(template,/data-foundation-dock-zone="left"[\s\S]*data-foundation-dock-zone="center"[\s\S]*data-foundation-dock-zone="right"[\s\S]*data-foundation-dock-zone="bottom"/,'The contract targets the four default template zones');
  assert.match(fixture,/case "Dock":[\s\S]*"Items": \[\]string\{"Files", "Outline", "Search"\}/,'The default Dock labels are source-backed');
  assert.match(foundation,/const dockTab = event\.target\.closest\('\[data-foundation-dock-tab\]'\)/);assert.match(foundation,/emit\(root, 'change', \{value: dockTab\.textContent\}\)/);
  assert.match(foundation,/const onDragStart = event => \{ const tab = event\.target\.closest\?\.\('\[data-foundation-dock-tab\]'\)/);assert.match(foundation,/emit\(root, 'change', \{dock: dockZone\.dataset\.foundationDockZone, value: label\}\)/);
  const dockPath=runRequestedStateActions.toString().slice(runRequestedStateActions.toString().indexOf("if(contract.focusedSequence==='dock-native-actions')"),runRequestedStateActions.toString().indexOf("if(contract.focusedSequence==='foundation-native-resize')"));
  assert.match(dockPath,/\.click\(\)/);assert.match(dockPath,/\.press\(key\)/);assert.match(dockPath,/\.dragTo\(target\)/);assert.match(dockPath,/event\.isTrusted/);assert.doesNotMatch(dockPath,/dispatchEvent|new DataTransfer/,'Dock input must come from Playwright native interaction, not synthetic dispatch');
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/,'The existing generic requested-state path must execute Dock without a new whitelist');
});

test('ResizeHandle, Notification identities, local scroll sync, and RTL host locale have exact requested-state mappings',async()=>{
  const expected=[
    ['layout/ResizeHandle','ResizeHandle','foundation-native-resize',['resize-horizontal-pointer','resize-vertical-range-home','resize-horizontal-range-end','resize-separator-arrow-up','resize-separator-arrow-down','resize-separator-home','resize-separator-end']],
    ['feedback/Notification','Notification','interaction-notification-actions',['notification-scroll-last-row','notification-open-review','notification-mark-all-read','notification-clear','notification-reset']],
    ['feedback/NotificationCenter','Notification','interaction-notification-actions',['notification-scroll-last-row','notification-open-review','notification-mark-all-read','notification-clear','notification-reset']],
    ['interaction/ScrollSync','VirtualScroller','interaction-scroll-sync',['scrollsync-before-to-after','scrollsync-after-to-before']],
    ['interaction/VirtualScroller','VirtualScroller','interaction-scroll-sync',['virtual-scroller-advance','virtual-sync-before-to-after','virtual-sync-after-to-before']],
    ['i18n/RTL layout','RTL layout','native-rtl-locale-host',['rtl-locale-he','rtl-locale-en-restore']],
  ];
  for(const [identity,kind,sequence,ids]of expected){
    const contract=requestedStateContract(identity);assert.equal(contract?.identity,identity);assert.equal(contract.kind,kind);assert.equal(contract.requestedStateOnly,true);assert.equal(contract.focusedSequence,sequence);assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),ids);assert(contract.steps.every(step=>step.source.siteId.endsWith(`:${step.id}`)&&step.source.sourceAnchor&&step.source.provenance.length>0));
  }
  assert.equal(expected.reduce((sum,[identity])=>sum+requestedStateContract(identity).steps.length,0),24,'The six exact identities resolve to twenty-four checkpoints per live profile');
  assert.equal(requestedStateContract('layout/SplitPane'),null,'ResizeHandle mapping does not expand to nested SplitPane');
  assert.equal(requestedStateContract('i18n/LocaleNumber'),null,'RTL host event mapping does not invent a locale toggle or expand to LocaleNumber');
  const [actions,foundationTemplate,foundationJS,interactionTemplate,interactionJS,nativeTemplate,nativeJS,foundationFixtures,interactionFixtures,nativeFixtures]=await Promise.all([
    read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs'),read('ui/gohtmx/templates/ely-api-foundation.html'),read('ui/gohtmx/assets/ely-api-foundation.js'),read('ui/gohtmx/templates/ely-api-interaction.html'),read('ui/gohtmx/assets/ely-api-interaction.js'),read('ui/gohtmx/templates/ely-api-native.html'),read('ui/gohtmx/assets/ely-api-native-theme.js'),read('internal/gallery/advanced_foundation_fixtures.go'),read('internal/gallery/advanced_interaction_fixtures.go'),read('internal/gallery/advanced_native_fixtures.go'),
  ]);
  const requested=runRequestedStateActions.toString(),branch=requested.slice(requested.indexOf("if(contract.focusedSequence==='foundation-native-resize')"),requested.indexOf("if(contract.focusedSequence?.startsWith('communication-'))"));
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/,'All six exact cases use the existing requested-state route');
  assert.match(foundationTemplate,/eq \.Kind "ResizeHandle"[\s\S]*?data-foundation-split-handle[\s\S]*?input class="ely-foundation__split-range" type="range"/);assert.match(foundationJS,/const setSplit = \(split, value\) =>[\s\S]*?emit\(root, 'change', \{value: bounded\}\)/);assert.match(foundationJS,/splitHandle && \['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'\]\.includes\(event\.key\)[\s\S]*?setSplit\(split, event\.key === 'Home' \? 25 : event\.key === 'End' \? 75 : current \+ \(decrease \? -5 : 5\)/,'Separator keyboard contract remains distinct from the native range input');assert.match(foundationFixtures,/"layout\/ResizeHandle": \{"Before": "", "After": "", "Label": "Resize panes"\}/);
  assert.match(interactionTemplate,/eq \.Kind "Notification"[\s\S]*?data-interaction-notification-read[\s\S]*?data-interaction-notification-clear[\s\S]*?data-interaction-notification-reset/);assert.match(interactionTemplate,/eq \.Kind "VirtualScroller"[\s\S]*?data-direct-count[\s\S]*?data-direct-sync/);assert.match(interactionJS,/value = 'read-all'[\s\S]*?value = 'reset'[\s\S]*?value = 'cleared'/);assert.match(interactionJS,/const directWindow = \(count, height, top, viewport\)/);assert.match(interactionJS,/root\.querySelectorAll\('\[data-direct-sync\]'\)[\s\S]*?other\.scrollTop = pane\.scrollTop/);assert.match(interactionFixtures,/if name == "VirtualScroller"[\s\S]*?props\["Count"\], props\["RowHeight"\], props\["Label"\] = 10000, 28, "Ten thousand rows"/);
  const notificationReview=requestedStateContract('feedback/Notification').steps.find(step=>step.id==='notification-open-review');
  assert.match(notificationReview.expectedState,/review\(""\)/,'The nested Review action emits an empty value, not its parent row value');
  assert.match(interactionFixtures,/\{"Label": "Review", "Action": "review", "ButtonVariant": "primary"\}/,'The default nested Review action has no caller-supplied Value');
  assert.equal(assertCommunicationCallerRequest([{action:'review',component:'feedback/Notification',value:''}],0,'feedback/Notification','review','').event.value,'');
  assert.throws(()=>assertCommunicationCallerRequest([{action:'review',component:'feedback/Notification',value:'review'}],0,'feedback/Notification','review',''),/default-fixture value/,'The containing row value must not be inherited by its nested Review button');
  assert.match(branch,/const review=host\.locator\('\[data-ely-action="review"\]'\);assert\.equal\(await review\.count\(\),1/,'Review target is the unique action control within this exact fixture host');
  assert.match(nativeTemplate,/eq \.Kind "RTL layout"[\s\S]*?data-native-locale-scope/);assert.match(nativeJS,/listen\(root,'ely:locale',event=>[\s\S]*?scope\.dataset\.locale=event\.detail\.locale[\s\S]*?sync\(event\)/);assert.match(nativeFixtures,/props\["Locale"\], props\["RTL"\] = "en-US", false/);
  assert.match(branch,/mouse\.move\(x,box\.y\+box\.height\*\.7/);assert.match(branch,/horizontalHandle\.press\(key\)/);assert.match(branch,/resize-separator-arrow-up/);assert.match(branch,/resize-separator-arrow-down/);assert.match(branch,/resize-separator-home/);assert.match(branch,/resize-separator-end/);assert.match(branch,/control==='separator'&&event\.orientation==='horizontal'/);assert.match(branch,/\.press\(key\)/);assert.match(branch,/assertChange\(cursor,'notification',value\)/);assert.match(branch,/notification-scroll-last-row/);assert.match(branch,/mouse\.wheel/);assert.match(branch,/virtual-scroller-advance/);assert.match(branch,/Math\.abs\(positions\[0\]-positions\[1\]\)<=1/);assert.match(branch,/new CustomEvent\('ely:locale'/);assert.match(branch,/twinUnchanged:true/);
  assert.doesNotMatch(branch,/scrollTop\s*=|\.dispatchEvent\(new (?:PointerEvent|MouseEvent|KeyboardEvent)/,'Scroll/resize inputs cannot be replaced by forced scroll assignment or synthetic native input');
  assert.match(branch,/finally\{await root\.evaluate/,'Temporary event observers must be removed even when a checkpoint fails');
});

test('Cron native driver rejects stale increasing runs and requires exact frozen expression previews',async()=>{
  const contract=requestedStateContract('forms/CronEditor'),initial=['2026-09-25T12:05:00.000Z','2026-09-25T12:10:00.000Z','2026-09-25T12:15:00.000Z'];
  const edited=['2026-09-28T09:00:00.000Z','2026-09-29T09:00:00.000Z','2026-09-30T09:00:00.000Z'],preset=['2026-09-26T09:00:00.000Z','2026-09-27T09:00:00.000Z','2026-09-28T09:00:00.000Z'];
  const {cronPreview}=await import('../../assets/ely-expressions.js');
  for(const [expression,want]of [[contract.fixtureGuards.initial,initial],[contract.fixtureGuards.edited,edited],[contract.fixtureGuards.preset,preset]]){assert.deepEqual(cronPreview(expression,new Date(contract.fixtureGuards.now)).runs,want);assertCronNativePreview(expression,contract.fixtureGuards.now,want);}
  assert.throws(()=>assertCronNativePreview(contract.fixtureGuards.edited,'2026-09-26T12:00:00Z',edited),/frozen cron clock/);
  assert.throws(()=>assertCronNativePreview('0 10 * * *',contract.fixtureGuards.now,preset),/finite canonical/);
  const execute=async staleStage=>{
    let value=contract.fixtureGuards.initial,values=initial;const reached=[];
    const field={inputValue:async()=>value,evaluate:async()=>true,fill:async next=>{value=next;if(staleStage!=='cron-edit')values=edited;}};
    const root={getAttribute:async name=>name==='data-ely-component'?contract.identity:contract.kind,locator:selector=>{
      if(selector==='[data-ely-cron]')return field;
      if(selector==='[data-ely-cron-runs] time')return {evaluateAll:async fn=>fn(values.map(dateTime=>({dateTime})))};
      if(selector==='[data-ely-cron-now]')return {getAttribute:async()=>contract.fixtureGuards.now};
      if(selector==='[data-ely-cron-preset][value="0 9 * * *"]')return {scrollIntoViewIfNeeded:async()=>{},evaluate:async()=>({x:1,y:1}),click:async()=>{value=contract.fixtureGuards.preset;if(staleStage!=='cron-preset')values=preset;}};
      assert.fail('Unexpected cron selector '+selector);
    }};
    await runRequestedStateActions(contract,root,async(id,action,verify)=>{reached.push(id);await action();await verify({actions:[]},{actions:[]});});return reached;
  };
  assert.deepEqual(await execute(null),['cron-edit','cron-preset']);
  for(const stale of ['cron-edit','cron-preset'])await assert.rejects(()=>execute(stale),/Cron preview must be fresh/,'Execute the real driver with stale but increasing prior runs; do not merely test collection');
});

test('ColorPicker native driver follows palette hue150 then ArrowRight151',async()=>{
  const contract=requestedStateContract('forms/ColorPicker');
  const execute=async arrowHue=>{
    let selected=contract.fixtureGuards.initial,h=0;const reached=[];
    const root={getAttribute:async name=>name==='data-ely-component'?contract.identity:contract.kind,locator:selector=>{
      if(selector==='[data-ely-color]'||selector==='[data-ely-color-hex]')return {inputValue:async()=>selected};
      if(selector==='[data-ely-color-status]')return {evaluate:async()=>selected+' at 100%'};
      if(selector==='[data-ely-color-hue]')return {inputValue:async()=>String(h),press:async key=>{assert.equal(key,'ArrowRight');h=arrowHue;selected='#228857';}};
      if(selector==='[data-ely-color-choice="#228855"]')return {count:async()=>1,scrollIntoViewIfNeeded:async()=>{},evaluate:async()=>({x:1,y:1}),click:async()=>{selected='#228855';h=150;}};
      if(selector==='[data-ely-pick-screen-color]')return {count:async()=>1};
      if(selector==='[data-ely-color-channel="g"]')return {inputValue:async()=>'136'};
      assert.fail('Unexpected color selector '+selector);
    }};
    await runRequestedStateActions(contract,root,async(id,action,verify)=>{reached.push(id);await action();await verify({actions:[]},{actions:[]});});return reached;
  };
  assert.deepEqual(await execute(151),['color-palette','color-hue-key']);await assert.rejects(()=>execute(121));await assert.rejects(()=>execute(150));
});

test('Seven exact forms roots have finite native local-state contracts without PreviewName promotion',async()=>{
  const expected=[
    ['forms/DatePicker','DatePicker',['date-edit','date-commit']],
    ['forms/CodeInput','CodeInput',['code-edit','code-commit']],
    ['forms/ColorPicker','ColorPicker',['color-palette','color-hue-key']],
    ['forms/CronEditor','CronEditor',['cron-edit','cron-preset']],
    ['forms/ExpressionInput','ExpressionInput',['expression-edit','expression-invalid']],
    ['forms/Form','Form',['form-edit','form-add-array-row']],
    ['forms/MultiSelect','MultiSelect',['multi-filter','multi-select-beta','multi-remove-last']],
  ];
  for(const [identity,kind,steps]of expected){
    const contract=requestedStateContract(identity);assert.equal(contract?.identity,identity);assert.equal(contract.kind,kind);assert.equal(contract.family,'forms');assert.equal(contract.requestedStateOnly,true);assert.equal(contract.focusedSequence,'forms-seven-native-local');assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),steps);assert(contract.steps.every(step=>step.source.siteId===`forms-state:${identity}:${step.id}`&&step.source.sourceAnchor.includes('advanced_forms_fixtures.go')&&step.source.provenance.includes(`Exact canonical gallery identity ${identity}`)&&step.expectedState.length>0));
  }
  assert.equal(expected.reduce((count,row)=>count+row[2].length,0),15,'Seven exact canonical cases have fifteen finite checkpoints per live profile');
  for(const identity of ['forms/DateRangePicker','forms/TimePicker','forms/CountrySelect','forms/CurrencySelect','forms/Dial','forms/Stepper'])assert.equal(requestedStateContract(identity),null,`${identity} is not promoted from this root contract`);
  assert.equal(requestedStateContract('forms/TextArea').focusedSequence,'textarea-public-multiline','TextArea retains its separate owner contract');
  const [fixture,template,forms,expressions,driver,actions]=await Promise.all([
    read('internal/gallery/advanced_forms_fixtures.go'),read('ui/gohtmx/templates/ely-api-forms.html'),read('ui/gohtmx/assets/ely-api-forms.js'),read('ui/gohtmx/assets/ely-expressions.js'),read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs'),
  ]);
  assert.match(fixture,/PreviewName": "DateRangePicker"/);assert.match(fixture,/case "CodeInput":\s*props\["PreviewExamples"\].*PreviewName.*JsonInput/);assert.match(fixture,/case "ColorPicker":\s*props\["Label"\], props\["Value"\] = "", "#3772bb"/);assert.match(fixture,/case "CronEditor":\s*props\["Value"\], props\["Now"\] = "\*\/5 \* \* \* \*", "2026-09-25T12:00:00Z"/);assert.match(fixture,/case "ExpressionInput":\s*props\["Value"\], props\["Variables"\] = "price \* quantity", map\[string\]any\{"price": 8, "quantity": 3\}/);assert.match(fixture,/case "Form":\s*props\["Label"\], props\["Description"\], props\["ResetLabel"\], props\["ActionLabel"\] = "Profile"/);assert.match(fixture,/case "MultiSelect":\s*props\["Options"\] = append\(options, map\[string\]any\{"Value": "locked"/);
  assert.match(template,/eq \.Kind "DatePicker"[\s\S]*?Type" \(or \.Type "date"\)/);assert.match(template,/eq \.Kind "CodeInput"[\s\S]*?data-ely-code-input/);assert.match(template,/eq \.Kind "ColorPicker"[\s\S]*?data-ely-color-choice/);assert.match(template,/eq \.Kind "CronEditor"[\s\S]*?data-ely-cron-runs/);assert.match(template,/eq \.Kind "ExpressionInput"[\s\S]*?data-ely-evaluation/);assert.match(template,/eq \.Kind "Form"[\s\S]*?template "ely-api-field-array"/);assert.match(template,/data-ely-array-add/);assert.match(template,/eq \.Kind "MultiSelect"[\s\S]*?data-ely-multi-source/);
  assert.match(forms,/if\(field\.matches\('\[data-ely-expression\]'\)\)\{if\(root\.dataset\.elyKind==='ExpressionInput'\)evaluate\(\)/);assert.match(forms,/if\(button\.matches\('\[data-ely-array-add\]'\)\)[\s\S]*?arrayChanged\(array\)/);assert.match(forms,/if\(event\.target\.matches\('\[data-ely-multi-entry\]'\)\)[\s\S]*?selected\.at\(-1\)\?\.click\(\)/);assert.match(expressions,/export function evaluateExpression/);
  const execution=runRequestedStateActions.toString(),branch=execution.slice(execution.indexOf("if(contract.focusedSequence==='forms-seven-native-local')"),execution.indexOf("if(contract.focusedSequence==='forms-six-qualified-native-local')"));
  assert.match(branch,/Only the seven exact canonical forms identities/);assert.match(branch,/state\.actions\.slice\(before\.actions\.length\)/);for(const token of ['date-edit','code-edit','color-palette','cron-edit','expression-edit','form-edit','multi-filter','multi-remove-last'])assert(branch.includes(token),`Missing exact forms execution stage ${token}`);assert.match(branch,/schedulerExecuted:false/);assert.match(branch,/persistence:'not supplied'/);assert.doesNotMatch(branch,/dispatchEvent|requestSubmit|new Event|new KeyboardEvent|\.evaluate\(node=>node\.click/,'Driver actions do not synthesize native input or submit host work');
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/,'The existing requested-state route executes the seven exact contracts without a new runner whitelist');
});

test('Form and six qualified native aliases retain per-action twin witnesses and fail closed on twin changes',async()=>{
  const before={snapshot:{id:'form-twin',component:'forms/Form',text:'Profile',controls:[{id:'paired-control',name:'name',value:'source'}]},focusWithin:false,events:[]};
  assert.equal(assertFormTwinWitness(before,{snapshot:{...before.snapshot,controls:[...before.snapshot.controls]},focusWithin:false,events:[]}),true);
  assert.throws(()=>assertFormTwinWitness(before,{snapshot:{...before.snapshot,text:'mutated'},focusWithin:false,events:[]}),/preserve the independent twin snapshot/,'A changed twin must fail the executable witness');
  assert.throws(()=>assertFormTwinWitness(before,{snapshot:before.snapshot,focusWithin:true,events:[]}),/must not move focus into the independent twin/,'Twin focus movement must fail the executable witness');
  assert.throws(()=>assertFormTwinWitness({...before,focusWithin:true},{snapshot:before.snapshot,focusWithin:false,events:[]}),/must start outside the independent twin/,'Pre-existing focus in the twin must fail closed');
  assert.throws(()=>assertFormTwinWitness(before,{snapshot:before.snapshot,focusWithin:false,events:[{type:'input',isTrusted:true,target:'name'}]}),/dispatch events in the independent twin/,'Any native or public twin event must fail the executable witness');
  assert.throws(()=>assertFormTwinWitness({...before,events:[{type:'input',isTrusted:true,target:'name'}]},{snapshot:before.snapshot,focusWithin:false,events:[{type:'input',isTrusted:true,target:'name'}]}),/no pre-action events/,'Pre-existing twin events must fail closed');
  assert.throws(()=>assertFormTwinWitness({...before,events:undefined},{snapshot:before.snapshot,focusWithin:false,events:[]}),/before-event list is required/,'Missing event evidence must fail closed');
  assert.throws(()=>assertFormTwinWitness({...before,focusWithin:undefined},{snapshot:before.snapshot,focusWithin:false,events:[]}),/before-focus state is required/,'Missing focus evidence must fail closed');
  const expectedTwinFocus={type:'focusin',isTrusted:true,target:'caller_value_twin',targetId:'paired-control'},afterFocus={snapshot:before.snapshot,focusWithin:true,focusTarget:{id:'paired-control',eventTarget:'caller_value_twin',matchesExpectedControl:true,matchingControlCount:1},events:[expectedTwinFocus]};
  assert.equal(assertFormTwinWitness(before,afterFocus,{allowPairedNativeCommitFocus:true}),true,'The six-alias native commit may focus its exact paired control once');
  const ownUnitFocus={snapshot:before.snapshot,focusWithin:false,focusTarget:null,outsideFocusTarget:{id:'duration-unit',name:'duration_unit',tag:'SELECT',matchesExpectedControl:true,matchingControlCount:1},events:[]};
  assert.equal(assertFormTwinWitness(before,ownUnitFocus,{allowPairedNativeCommitFocus:true,allowOwnUnitSelectCommitFocus:true}),true,'Duration commit may focus its exact own unit select while leaving the twin unchanged');
  assert.equal(assertFormTwinWitness(before,ownUnitFocus),true,'The default no-focus/no-event witness remains strict and accepts an unchanged twin');
  assert.throws(()=>assertFormTwinWitness(before,ownUnitFocus,{allowPairedNativeCommitFocus:true}),/must focus the paired control/,'Other alias commits still require the exact paired twin destination');
  assert.throws(()=>assertFormTwinWitness(before,{...ownUnitFocus,outsideFocusTarget:null},{allowPairedNativeCommitFocus:true,allowOwnUnitSelectCommitFocus:true}),/actual own unit-select focus destination/,'A no-twin route without a measured focus destination must fail');
  assert.throws(()=>assertFormTwinWitness(before,{...ownUnitFocus,outsideFocusTarget:{...ownUnitFocus.outsideFocusTarget,matchesExpectedControl:false}},{allowPairedNativeCommitFocus:true,allowOwnUnitSelectCommitFocus:true}),/exact unit select/,'A no-twin route to another element must fail');
  assert.throws(()=>assertFormTwinWitness(before,{...ownUnitFocus,outsideFocusTarget:{...ownUnitFocus.outsideFocusTarget,matchingControlCount:2}},{allowPairedNativeCommitFocus:true,allowOwnUnitSelectCommitFocus:true}),/must be unique/,'Ambiguous own unit selects must fail');
  assert.throws(()=>assertFormTwinWitness(before,{...ownUnitFocus,events:[{type:'input',isTrusted:true,target:'duration_unit'}]},{allowPairedNativeCommitFocus:true,allowOwnUnitSelectCommitFocus:true}),/event-free/,'Any twin event on the no-twin-focus route must fail');
  assert.throws(()=>assertFormTwinWitness(before,{...ownUnitFocus,focusWithin:true},{allowPairedNativeCommitFocus:true,allowOwnUnitSelectCommitFocus:true}),/exact independent twin/,'Twin focus cannot enter the no-twin route without its exact paired control witness');
  assert.throws(()=>assertFormTwinWitness(before,{...afterFocus,focusWithin:false}),/must not dispatch events in the independent twin/,'The default witness rejects even a trusted focusin');
  assert.throws(()=>assertFormTwinWitness(before,{...afterFocus,focusWithin:false},{allowPairedNativeCommitFocus:true}),/must focus the paired control/,'Allowed focusin without actual focus must fail');
  assert.throws(()=>assertFormTwinWitness(before,{...afterFocus,focusTarget:{...afterFocus.focusTarget,id:'foreign-control'}},{allowPairedNativeCommitFocus:true}),/exact independent twin/,'A focus target outside the paired twin must fail');
  assert.throws(()=>assertFormTwinWitness(before,{...afterFocus,focusTarget:{...afterFocus.focusTarget,matchesExpectedControl:false}},{allowPairedNativeCommitFocus:true}),/paired form control/,'A different twin control must fail');
  assert.throws(()=>assertFormTwinWitness(before,{...afterFocus,focusTarget:{...afterFocus.focusTarget,matchingControlCount:2}},{allowPairedNativeCommitFocus:true}),/must be unique/,'Ambiguous paired controls must fail');
  assert.throws(()=>assertFormTwinWitness(before,{...afterFocus,events:[{...expectedTwinFocus,isTrusted:false}]},{allowPairedNativeCommitFocus:true}),/only one trusted focusin/,'Untrusted focusin must fail');
  assert.throws(()=>assertFormTwinWitness(before,{...afterFocus,events:[expectedTwinFocus,expectedTwinFocus]},{allowPairedNativeCommitFocus:true}),/only one trusted focusin/,'Repeated focusin must fail');
  for(const type of ['beforeinput','input','change','click','submit','focusout','ely:change','ely:action','ely:result'])assert.throws(()=>assertFormTwinWitness(before,{...afterFocus,events:[expectedTwinFocus,{type,isTrusted:true,target:'caller_value_twin',targetId:'paired-control'}]},{allowPairedNativeCommitFocus:true}),/only one trusted focusin/,`Twin ${type} must fail`);
  assert.throws(()=>assertFormTwinWitness(before,{...afterFocus,snapshot:{...before.snapshot,text:'mutated'}},{allowPairedNativeCommitFocus:true}),/preserve the independent twin snapshot/,'Allowed focus cannot hide twin state changes');
  assert.throws(()=>assertFormTwinWitness(before,{...afterFocus,events:[{...expectedTwinFocus,targetId:'wrong-control'}]},{allowPairedNativeCommitFocus:true}),/only one trusted focusin/,'The focus event must target the exact paired control');
  const actions=await read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs');
  assert.ok(actions.includes("contract.nativeFormTwinWitness===true"),'Eight-form witness path is retained');assert.match(actions,/assert\.equal\(await twin\.count\(\),1,'Native form case requires its exact independent twin'\)/);assert.match(actions,/node\.__visualFormTwinEvents=\[\]/);assert.match(actions,/targetId:event\.target\?\.id\|\|null/);assert.match(actions,/\['beforeinput','input','change','click','submit','focusin','focusout','ely:change','ely:action','ely:result'\]/);assert.match(actions,/focusWithin:await twin\.evaluate\(node=>node\.contains\(document\.activeElement\)\)/);assert.match(actions,/snapshot:await snapshot\(twin\)/);assert.match(actions,/const twinBefore=formTwinWitness\?await readFormTwinWitness\(\):null/);assert.match(actions,/receipt\.twinWitness=\{before:twinBefore\}/);assert.match(actions,/contract\.focusedSequence==='forms-six-qualified-native-local'&&expected\.id\.endsWith\('-commit'\)/,'Only commits in the six exact aliases opt into a native focus route');assert.match(actions,/select\[name\$="_unit"\]/,'Duration own-unit destination is observed against its exact native selector');assert.match(actions,/contract\.identity==='forms\/DurationPicker'\?await root\.evaluate/,'Only the exact DurationPicker contract reads its own unit focus destination');assert.ok(actions.includes("isDurationOwnUnitCommit(contract.identity,expected.id)"),'Only exact DurationPicker duration-commit opts into the no-twin-focus route');assert.ok(actions.includes("assertFormTwinWitness(twinBefore,twinAfter,receipt.twinWitness.policy)"));
  assert.match(actions,/comparison:\{classification:proof\.status==='passed'\?'target-state-contract-passed':'harness-error-target-state-driver',equivalent:null/,'Direct target-state proof remains separate from registered semantic equivalence');
});

test('Duration own-unit no-twin route is wired only to its exact commit step',async()=>{
  assert.equal(isDurationOwnUnitCommit('forms/DurationPicker','duration-commit'),true);
  for(const [identity,step] of [['forms/DurationPicker','duration-edit'],['forms/DateTimePicker','duration-commit'],['forms/WeekPicker','duration-commit'],['forms/YearPicker','year-commit'],['forms/JsonInput','json-commit'],['forms/AutoResizeInput','autoresize-commit'],['forms/DurationPicker','duration-other']])assert.equal(isDurationOwnUnitCommit(identity,step),false,`${identity} ${step} must not receive the Duration exception`);
  const actions=await read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs');
  assert.match(actions,/const allowOwnUnitSelectCommitFocus=isDurationOwnUnitCommit\(contract\.identity,expected\.id\)/,'The runtime gate uses the same exact identity and step predicate');
});

test('Six exact qualified form aliases keep bounded local native contracts and explicit focus-leave commits',async()=>{
  const expected=[
    ['forms/AutoResizeInput','TextArea',['autoresize-edit','autoresize-commit']],
    ['forms/DateTimePicker','DatePicker',['datetime-edit','datetime-commit']],
    ['forms/WeekPicker','MonthPicker',['week-edit','week-commit']],
    ['forms/YearPicker','MonthPicker',['year-edit','year-commit']],
    ['forms/JsonInput','CodeInput',['json-invalid','json-repair','json-commit']],
    ['forms/DurationPicker','RelativeDatePicker',['duration-edit','duration-commit']],
  ];
  for(const [identity,kind,steps]of expected){
    const contract=requestedStateContract(identity);assert.equal(contract?.identity,identity);assert.equal(contract.kind,kind);assert.equal(contract.family,'forms');assert.equal(contract.requestedStateOnly,true);assert.equal(contract.focusedSequence,'forms-six-qualified-native-local');assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps.map(step=>step.id),steps);assert.equal(contract.fixtureGuards.component,identity);assert.equal(contract.fixtureGuards.renderKind,kind);assert(contract.steps.every(step=>step.source.siteId===`forms-qualified-state:${identity}:${step.id}`&&step.source.provenance.includes(identity)&&step.expectedState.length>0));
  }
  assert.equal(expected.reduce((total,row)=>total+row[2].length,0),13,'Six exact aliases contribute thirteen finite local checkpoints per live profile');
  const auto=requestedStateContract('forms/AutoResizeInput'),year=requestedStateContract('forms/YearPicker'),duration=requestedStateContract('forms/DurationPicker'),week=requestedStateContract('forms/WeekPicker'),dateTime=requestedStateContract('forms/DateTimePicker');
  assert(auto.steps.every(step=>step.source.provenance.includes('resolves to the TextArea story')));assert.equal(auto.fixtureGuards.changed,'one\ntwo\nthree\nfour');
  assert.equal(year.fixtureGuards.noMax,true);assert.equal(year.fixtureGuards.changed,'2027');assert(year.scope.includes('No year range'));assert.equal(duration.fixtureGuards.noMax,true);assert.equal(duration.fixtureGuards.min,'0');assert(duration.scope.includes('duration unit switch'));assert.equal(week.fixtureGuards.changed,'2026-W43');
  for(const contract of [dateTime,week,year,duration])assert(contract.steps.find(step=>step.id.endsWith('-commit')).expectedState.includes('focus leaves')||contract.steps.find(step=>step.id.endsWith('-commit')).expectedState.includes('focus leaving'));
  const json=requestedStateContract('forms/JsonInput');assert.equal(json.fixtureGuards.initial,'{"caller":"source"}');assert.equal(json.fixtureGuards.invalid,'{broken');assert.equal(json.fixtureGuards.changed,'{"caller":"changed"}');
  const [catalogue,aliases,template,forms,driver,actions]=await Promise.all([
    read('ui/gohtmx/components.json'),read('internal/gallery/advanced.go'),read('ui/gohtmx/templates/ely-api-forms.html'),read('ui/gohtmx/assets/ely-api-forms.js'),read('ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'),read('ui/gohtmx/tests/browser/visual-state-audit-actions.mjs'),
  ]);
  assert.match(catalogue,/"title": "TextArea \/ AutoResizeInput"[\s\S]*?"components": \[[\s\S]*?"AutoResizeInput"/);
  assert.match(aliases,/case "JsonInput", "ImportExportSettings":\s*props\["Value"\] = `\{"caller":"source"\}`/);assert.match(aliases,/case "DateTimePicker":\s*props\["Value"\], props\["Type"\] = "2026-10-20T12:30", "datetime-local"/);assert.match(aliases,/case "WeekPicker":\s*props\["Value"\], props\["Type"\] = "2026-W42", "week"/);assert.match(aliases,/case "YearPicker":\s*props\["Value"\], props\["Type"\] = "2026", "number"/);assert.match(aliases,/case "DurationPicker":\s*props\["Value"\], props\["Type"\], props\["Unit"\] = "30", "number", "minutes"/);assert.match(aliases,/case "forms\/YearPicker", "forms\/DurationPicker"/);assert.match(aliases,/delete\(props, "Max"\)/);
  assert.match(template,/eq \.Variant "DateTimePicker"\}\}\s*\{\{template "ely-api-date-field" \(withProps \$p "Type" "datetime-local"\)/);assert.match(template,/eq \.Variant "WeekPicker"\}\}\s*\{\{template "ely-api-date-field" \(withProps \$p "Type" "week"\)/);assert.match(template,/eq \.Variant "YearPicker"\}\}\s*\{\{template "ely-api-date-field" \(withProps \$p "Type" "number" "Step" "1"\)/);assert.match(template,/eq \.Variant "DurationPicker"[\s\S]*?"data-ely-duration" "duration"/);assert.match(template,/eq \.Variant "JsonInput"\) \.Multiline[\s\S]*?data-ely-code-input/);assert.match(template,/eq \.Kind "TextArea"[\s\S]*?data-ely-autoresize/);
  assert.match(forms,/dataset\.elyComponent\.endsWith\('\/JsonInput'\)/);assert.match(forms,/Invalid JSON\./);assert.match(forms,/if\(field\.matches\('\[data-ely-autoresize\]'\)\)\{field\.style\.height='auto'/);
  const execution=runRequestedStateActions.toString(),branch=execution.slice(execution.indexOf("if(contract.focusedSequence==='forms-six-qualified-native-local')"),execution.indexOf("if(contract.focusedSequence==='native-cookie-owner-boundary')"));
  assert.match(branch,/Only the six exact qualified forms identities/);assert.match(branch,/event\.isTrusted/);assert.match(branch,/field\.press\('Tab'\)/);assert.match(branch,/node===document\.activeElement/);assert.match(branch,/await assertTrusted\(field,'change'\)/);assert.match(branch,/await assertTrusted\(field,'blur'\)/);assert.match(branch,/checkValidity/);assert.match(branch,/assertDeepEqual|assert\.deepEqual/);assert.match(branch,/no host request/);assert.doesNotMatch(branch.replace('await field.click();',''),/dispatchEvent|new Event|new KeyboardEvent|requestSubmit|\.click\(/,'Only the exact native Playwright field click may precede AX segment editing; no DOM click or host request');
  assert.match(actions,/if\(contract\.requestedStateOnly\)\{\s*await runRequestedStateActions\(contract,root,step,failureDiagnostics\);/,'The existing requested-state path executes exact alias contracts without a new runner');
});

test('JsonInput invalid and repaired previews require exact source-highlighter tokens and reject stale highlight',()=>{
  const invalid='{broken',repaired='{"caller":"changed"}';
  const invalidTokens=[{kind:'punctuation',text:'{'},{kind:'variable',text:'broken'}];
  const repairedTokens=[{kind:'punctuation',text:'{'},{kind:'property',text:'"caller"'},{kind:'punctuation',text:':'},{kind:'string',text:'"changed"'},{kind:'punctuation',text:'}'}];
  const invalidPreview={text:`${invalid}\n`,tokens:invalidTokens,elementCount:invalidTokens.length};
  const repairedPreview={text:`${repaired}\n`,tokens:repairedTokens,elementCount:repairedTokens.length};
  assert.deepEqual(assertJsonHighlight(invalid,invalidPreview),invalidTokens);
  assert.deepEqual(assertJsonHighlight(repaired,repairedPreview),repairedTokens);
  assert.throws(()=>assertJsonHighlight(repaired,invalidPreview),/JSON preview text must exactly follow the edited source/,'A preview left at the invalid value must fail after repair');
  assert.throws(()=>assertJsonHighlight(repaired,{...repairedPreview,tokens:invalidTokens}),/token classes and text must match/,'Repaired source with stale invalid token spans must fail');
  assert.throws(()=>assertJsonHighlight(repaired,{...repairedPreview,elementCount:repairedTokens.length+1}),/only the expected direct token spans/,'Unexpected preview markup must fail');
});
