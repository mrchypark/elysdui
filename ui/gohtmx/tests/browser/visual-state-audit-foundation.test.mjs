import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {requestedStateContract,assertFoundationPublicEvents,runRequestedStateActions,caseActionContract} from './visual-state-audit-drivers.mjs';

const source=path=>readFile(new URL(`../../../../${path}`,import.meta.url),'utf8');

test('TextArea shared root bounds its grid track without discarding caller width preference',async()=>{
  const [css,template,wrapper,fixtures,catalogue]=await Promise.all([source('ui/gohtmx/assets/ely-api-forms.css'),source('ui/gohtmx/templates/ely-api-forms.html'),source('ui/gohtmx/templates/ely-api.html'),source('internal/gallery/advanced_forms_fixtures.go'),source('ui/gohtmx/components.json')]);
  const selector="[data-ely-family='forms'][data-ely-kind='TextArea']";
  const bounded=styles=>{
    const rule=styles.split(selector+'{')[1]?.split('}')[0];assert(rule,'Shared TextArea root rule required, not a gallery/identity override');
    assert.match(rule,/^grid-template-columns:minmax\(0,1fr\);?$/,'Bound the implicit420px track to the real308px host; no clipping or field-sizing workaround');
  };
  bounded(css);
  for(const replacement of ['',selector+'{grid-template-columns:1fr}',selector+'{grid-template-columns:auto}',selector+'{grid-template-columns:420px}'])assert.throws(()=>bounded(css.replace(selector+'{grid-template-columns:minmax(0,1fr)}',replacement)));
  assert.match(css,/\.is-width-420\{inline-size:26\.25rem;max-inline-size:100%\}/,'Keep preferred420px width on wide hosts, capped to the containing track');
  assert.match(css,/\.is-width-420 \.ely-api-field\{max-inline-size:26\.25rem\}/);
  assert.match(template,/eq \.Kind "TextArea"[\s\S]*?if \.Width[\s\S]*?else if \.MaxWidth[\s\S]*?"data-ely-autoresize" "true"/,'Actual caller Width/MaxWidth and native autoresize remain unchanged');
  assert.match(wrapper,/data-ely-kind="{{\.Kind}}"/,'Rule follows resolved shared Kind, not the gallery fixture name');
  assert.match(fixtures,/"Notes grow from three lines to six, then scroll\.", 3, "420"/,'Keep the measured default fixture, not a narrower test-only width');
  const forms=JSON.parse(catalogue).pages.flatMap(chapter=>chapter.stories||[]);
  assert(forms.some(story=>story.name==='TextArea'&&story.components.includes('AutoResizeInput')),'AutoResizeInput shares this rendering kind, not its native-action proof');
});

test('finite Button and TextArea contracts preserve actual fixture states and event provenance',async()=>{
  const button=requestedStateContract('buttons/Button'),textarea=requestedStateContract('forms/TextArea');
  assert.equal(button.kind,'Button');assert.equal(button.steps.length,15);
  assert.deepEqual(button.steps.slice(0,7).map(step=>step.id),['primary','secondary','outline','ghost','subtle','danger','link'].map(value=>'click-'+value));
  assert.equal(button.steps[7].id,'cancel-primary');
  assert(button.steps.slice(8).every(step=>step.event.includes('disabled negative; not trusted pointer input')));
  assert.equal(textarea.kind,'TextArea');assert.deepEqual(textarea.steps.map(step=>step.id),['fill-multiline','commit-multiline','clear-text','commit-empty']);
  for(const contract of [button,textarea]){assert.equal(contract.requestedStateOnly,true);assert.deepEqual(contract.mappingGaps,[]);assert.match(contract.scope,/separate from registered-check coverage/);assert(contract.steps.every(step=>step.source.provenance.includes('ely-api.js')));}
  assert.equal(requestedStateContract('forms/Input')?.focusedSequence,'input-public-edit-clear','Input has an explicit focused contract');
  assert.equal(requestedStateContract('forms/CurrencyInput')?.focusedSequence,'input-public-validity','CurrencyInput now has an explicit fixture-bound contract');
  const tag=requestedStateContract('forms/TagInput');assert.equal(tag.focusedSequence,'forms-complex-eight-native');assert.equal(tag.fixtureGuards.component,'forms/TagInput');assert.equal(tag.nativeFormTwinWitness,true);assert.deepEqual(tag.mappingGaps,[]);assert.deepEqual(tag.steps.map(step=>step.id),['tag-edit','tag-add','tag-remove']);
  for(const identity of ['buttons/Sizes','buttons/With icons','forms/UnknownTagAlias'])assert.equal(requestedStateContract(identity),null,'No generic alias promotion');
  const [buttons,forms,template]=await Promise.all([source('internal/gallery/advanced_interaction_fixtures.go'),source('internal/gallery/advanced_forms_fixtures.go'),source('ui/gohtmx/templates/ely-api-interaction.html')]);
  const fixture=buttons.slice(buttons.indexOf('if name == "Button" {'),buttons.indexOf('if name == "ShortcutHint"'));
  for(const value of ['primary','secondary','outline','ghost','subtle','danger','link']){assert(fixture.includes(`"Value": "${value}", "Action": "${value}"`));assert(fixture.includes(`"Value": "${value}-disabled"`));}
  assert.equal((fixture.match(/"Disabled": true/g)||[]).length,7);
  assert.match(template,/"data-ely-action" \(or .Action "press"\)/);
  assert.match(forms,/case "TextArea":\s*props\["Label"\], props\["Value"\], props\["Placeholder"\], props\["Rows"\], props\["MaxWidth"\] = "Notes", "", "Notes grow from three lines to six, then scroll\.", 3, "420"/);
});

test('foundation event oracle preserves exact public payloads and rejects callback/persistence inventions',()=>{
  const button=[{type:'ely:action',detail:{id:'actual-button',component:'buttons/Button',action:'primary',value:'primary',formData:null,values:[]}}];
  const textarea=[{type:'ely:change',detail:{id:'actual-textarea',component:'forms/TextArea',name:'caller_value',value:'one\ntwo\nthree\nfour',checked:undefined,type:'textarea'}}];
  for(const [identity,id,events,value] of [['buttons/Button','actual-button',button,'primary'],['forms/TextArea','actual-textarea',textarea,'one\ntwo\nthree\nfour']]){
    const before=structuredClone(events);assert.deepEqual(assertFoundationPublicEvents(identity,id,events,{value}),before);assert.deepEqual(events,before);
    for(const mutate of [e=>{e.length=0;},e=>e.push(structuredClone(e[0])),e=>{e[0].detail.id='twin';},e=>{e[0].detail.component='alias';},e=>{e[0].detail.value='stale';},e=>{e[0].detail.persisted=true;},e=>{e[0].type='input';}]){const changed=structuredClone(events);mutate(changed);assert.throws(()=>assertFoundationPublicEvents(identity,id,changed,{value}));}
  }
  const empty=[{type:'ely:change',detail:{id:'actual-textarea',component:'forms/TextArea',name:'caller_value',value:'',checked:undefined,type:'textarea'}}];
  assertFoundationPublicEvents('forms/TextArea','actual-textarea',empty,{value:''});
  for(const key of ['name','type','checked']){const changed=structuredClone(empty);changed[0].detail[key]='invented';assert.throws(()=>assertFoundationPublicEvents('forms/TextArea','actual-textarea',changed,{value:''}));}
  assert.throws(()=>assertFoundationPublicEvents('forms/Input','actual-textarea',empty,{value:''}));
});

test('foundation driver uses native actions and exact twin/identity guards without application host integration',async()=>{
  const api=await source('ui/gohtmx/assets/ely-api.js'),forms=await source('ui/gohtmx/assets/ely-api-forms.js'),driver=runRequestedStateActions.toString();
  assert.match(api,/bubbles: true, cancelable: true/);assert.match(api,/if \(!accepted\) event.preventDefault\(\)/);
  assert.match(api,/if \(!button \|\| button.disabled/);assert.match(api,/root.addEventListener\('change', change\)/);
  assert.match(api,/name: event.target.name,\s*value: event.target.value, checked: event.target.checked, type: event.target.type/);
  assert.match(forms,/field.style.height='auto';field.style.height=`\$\{Math.min\(600,field.scrollHeight\)\}px`/);
  for(const fragment of ["await control.click()","await control.evaluate(node=>node.click())","await field.fill(value)","await field.press('Tab')","disabled:false,readOnly:false,required:false,rows:3","defaultPrevented:true","isTrusted:true","assert.deepEqual(await fresh(),[])","assertFoundationPublicEvents(identity,id,observed",'Public actions must preserve the independent twin',"removeEventListener('ely:action',node.__visualCancelAction)","removeEventListener(type,node.__visualNativeObserver)"])assert(driver.includes(fragment),fragment);
});

test('actual API click/change bodies honor cancellation, disabled and ownership boundaries source-only',async()=>{
  const api=await source('ui/gohtmx/assets/ely-api.js');
  const emitBody=api.slice(api.indexOf('export function emit('),api.indexOf('\nfunction belongs(')).replace('export ','');
  const emit=new Function(`${emitBody};return emit;`)();
  const clickBody=api.slice(api.indexOf('    const click = event => {'),api.indexOf('    const submit = event => {'));
  const changeBody=api.slice(api.indexOf('    const change = event => {'),api.indexOf("    root.addEventListener('click', click);"));
  const root=new EventTarget();root.id='actual-button';root.dataset={elyComponent:'buttons/Button'};
  const recorded=[];root.addEventListener('ely:action',event=>recorded.push({type:event.type,detail:event.detail}));
  const button={disabled:false,dataset:{elyAction:'primary'},value:'primary',form:null,type:'button',getAttribute:()=>null};
  const target={closest:()=>button};
  const click=new Function('root','belongs','emit','FormData',`${clickBody};return click;`)(root,()=>true,emit,FormData);
  const event=()=>{const event=new Event('click',{cancelable:true});Object.defineProperty(event,'target',{value:target});return event;};
  const first=event();click(first);assert.equal(first.defaultPrevented,false);assertFoundationPublicEvents('buttons/Button',root.id,recorded,{value:'primary'});
  recorded.length=0;const cancel=event=>event.preventDefault();root.addEventListener('ely:action',cancel);
  const canceled=event();click(canceled);assert.equal(canceled.defaultPrevented,true);assertFoundationPublicEvents('buttons/Button',root.id,recorded,{value:'primary'});root.removeEventListener('ely:action',cancel);
  for(const state of [{disabled:true},{disabled:false,getAttribute:()=> 'true'}]){recorded.length=0;Object.assign(button,state);click(event());assert.deepEqual(recorded,[]);}
  button.disabled=false;button.getAttribute=()=>null;recorded.length=0;
  new Function('root','belongs','emit','FormData',`${clickBody};return click;`)(root,()=>false,emit,FormData)(event());assert.deepEqual(recorded,[]);
  root.dataset.elyComponent='forms/TextArea';root.id='actual-textarea';
  const changes=[];root.addEventListener('ely:change',event=>changes.push({type:event.type,detail:event.detail}));
  const field={name:'caller_value',value:'one\ntwo\nthree\nfour',checked:undefined,type:'textarea',matches:()=>true};
  const change=new Function('root','belongs',`${changeBody};return change;`)(root,()=>true);
  change({target:field});assertFoundationPublicEvents('forms/TextArea',root.id,changes,{value:field.value});
  changes.length=0;field.value='';change({target:field});assertFoundationPublicEvents('forms/TextArea',root.id,changes,{value:''});
  changes.length=0;new Function('root','belongs',`${changeBody};return change;`)(root,()=>false)({target:field});assert.deepEqual(changes,[]);
});

test('foundation additions retain existing exact and public contracts including CodeEditor aliases',async()=>{
  const workspace=await source('internal/gallery/assets/advanced-workspace-checks.js');
  for(const name of ['CodeEditor','EditorGutter','LineNumbers','FoldingControl','Ruler','IndentGuide','BracketMatcher','RainbowBrackets','MultiCursor','SelectionHighlight','StickyScroll','Breadcrumb','InlayHints','CodeLens','InlineDecoration']){const contract=caseActionContract('editor/'+name,workspace,'workspace.js');assert.deepEqual(contract.mappingGaps,[]);assert.equal(contract.steps.length,11);assert.equal(contract.identity,'editor/'+name);}
  assert.equal(caseActionContract('editor/MiniMap',workspace,'workspace.js'),null);
  for(const id of ['data/Tag','project/StatusSelect','menus/RadioMenuItem','tooling/EventLogger','forms/HotkeyInput','navigation/Tabs','account/SignupForm','maps/MapPopup'])assert(requestedStateContract(id));
  const password=caseActionContract('forms/PasswordInput',await source('internal/gallery/assets/advanced-forms-checks.js'),'forms.js');assert.deepEqual(password.mappingGaps,[]);
  assert.deepEqual(caseActionContract('files/ArchiveViewer',workspace,'workspace.js').mappingGaps,[]);
});
