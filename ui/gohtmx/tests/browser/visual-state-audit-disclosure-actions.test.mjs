import assert from 'node:assert/strict';
import test from 'node:test';
import {readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {requestedStateContract,runRequestedStateActions,caseActionContract} from './visual-state-audit-drivers.mjs';

const source=path=>readFile(new URL(`../../../../${path}`,import.meta.url),'utf8');
const repo=fileURLToPath(new URL('../../../../',import.meta.url));

test('five finite exact fixtures retain separate identities and explicit native pointer sequences',()=>{
  for(const [id,kind,sequence,count] of [
    ['buttons/ActionSheet','ActionSheet','sheet-native-actions',10],
    ['buttons/BulkActionBar','BulkActionBar','bulk-canonical-zero',7],
    ['layout/Collapsible','Collapsible','native-disclosure',2],
    ['layout/Accordion','Accordion','native-disclosure',4],
    ['layout/AccordionItem','Accordion','native-disclosure',4],
  ]){const c=requestedStateContract(id);assert.equal(c.identity,id);assert.equal(c.kind,kind);assert.equal(c.focusedSequence,sequence);assert.equal(c.steps.length,count);assert.equal(c.requestedStateOnly,true);assert.deepEqual(c.mappingGaps,[]);assert(c.steps.every(step=>step.event==='native Playwright action'&&step.source.siteId.startsWith(`focused-state:${id}:`)&&step.source.provenance));}
  for(const id of ['buttons/ActionBar','buttons/QuickActions','layout/Section'])assert.equal(requestedStateContract(id),null);
  assert.match(requestedStateContract('buttons/BulkActionBar').steps[1].expectedState,/not an initial-Value2 fixture/);
});

test('ActionSheet actual generic and family handlers deliver one exact action before native close',async()=>{
  const api=await source('ui/gohtmx/assets/ely-api.js'),interaction=await source('ui/gohtmx/assets/ely-api-interaction.js');
  const click=api.slice(api.indexOf('    const click = event => {'),api.indexOf('    const submit = event => {'));
  assert.match(click,/if \(button.dataset.interactionSheetAction !== undefined\) return/);
  const sheet=interaction.slice(interaction.indexOf('    const sheetAction ='),interaction.indexOf('    const toastShow ='));
  assert(sheet.includes("closeDialog(sheetAction.closest('dialog'))"));
  const emit=new Function(`${api.slice(api.indexOf('export function emit('),api.indexOf('\nfunction belongs(')).replace('export ','')};return emit;`)();
  for(const [value,action] of [['wallpaper','set-wallpaper'],['duplicate','duplicate'],['delete','delete']]){
    const root=new EventTarget();root.id='actual-sheet';root.dataset={elyComponent:'buttons/ActionSheet'};
    const dialog={open:true},events=[],order=[];root.addEventListener('ely:action',event=>{events.push(event.detail);order.push(['action',dialog.open]);});
    const button={disabled:false,type:'button',form:null,value,dataset:{interactionSheetAction:'',elyAction:action},getAttribute:()=>null,closest:selector=>{assert.equal(selector,'dialog');return dialog;}};
    const target={closest:selector=>selector==='[data-ely-action]'||selector==='[data-interaction-sheet-action]'?button:null};
    new Function('root','belongs','emit','FormData',`${click};return click;`)(root,()=>true,emit,FormData)({target});
    assert.deepEqual(events,[],'Generic listener must leave selection dispatch to ActionSheet');
    new Function('root','target','emit','closeDialog',sheet)(root,target,emit,element=>{assert.equal(element,dialog);dialog.open=false;order.push(['close',false]);});
    assert.deepEqual(events,[{id:root.id,component:'buttons/ActionSheet',action,value}]);assert.deepEqual(order,[['action',true],['close',false]]);
    events.length=0;order.length=0;dialog.open=true;
    const oldBug=click.replace('if (button.dataset.interactionSheetAction !== undefined) return;','');assert.notEqual(oldBug,click);
    new Function('root','belongs','emit','FormData',`${oldBug};return click;`)(root,()=>true,emit,FormData)({target});
    new Function('root','target','emit','closeDialog',sheet)(root,target,emit,()=>{dialog.open=false;});
    assert.equal(events.length,2,'Removing the actual generic dispatch exclusion reproduces the duplicate-action bug');
  }
});

test('ActionSheet initial focus is the exact header Close control, not selector-list action priority',async()=>{
  const template=await source('ui/gohtmx/templates/ely-api-interaction.html'),interaction=await source('ui/gohtmx/assets/ely-api-interaction.js');
  const sheet=template.slice(template.indexOf('{{else if eq .Kind "ActionSheet"}}'),template.indexOf('{{else if eq .Kind "QuickActions"}}'));
  const headerClose=sheet.indexOf('aria-label="Close" data-interaction-close'),actions=sheet.indexOf('class="ely-interaction__sheet-actions"');
  assert(headerClose>0&&actions>headerClose,'The enabled header Close precedes every sheet action in the actual template');
  assert.match(sheet,/<header><h2[^>]*>[\s\S]*?<button type="button" aria-label="Close" data-interaction-close>/);
  assert(!/<input\b/.test(sheet),'No earlier input diverts the actual opener focus path');
  assert(interaction.includes("dialog?.querySelector('input:not(:disabled)') || dialog?.querySelector('[data-ely-action]:not(:disabled), [data-interaction-close]:not(:disabled)')"),'Selector lists use DOM order, not action-selector priority');
  const driver=runRequestedStateActions.toString();
  assert(driver.includes("const headerClose=dialog.locator('header > button[data-interaction-close][aria-label=\"Close\"]')"));
  assert(driver.includes("headerClose.evaluate(node=>document.activeElement===node)"));
  assert(!driver.includes("dialog.locator('[data-interaction-sheet-action]').first().evaluate(node=>document.activeElement===node)"));
  assert(requestedStateContract('buttons/ActionSheet').steps.filter(step=>step.id.startsWith('open-')).every(step=>/header Close/.test(step.expectedState)));
});

test('actual bulk add/clear handlers synchronize dataset, both count outputs and visibility',async()=>{
  const interaction=await source('ui/gohtmx/assets/ely-api-interaction.js'),body=interaction.slice(interaction.indexOf('    const bulkAdd ='),interaction.indexOf('    const sheetAction ='));
  const count={textContent:'0'},summary={textContent:'0 selected'},bar={hidden:true},host={dataset:{interactionBulkCount:'0'},querySelector:selector=>selector==='[data-interaction-bulk-count]'?count:selector==='[data-interaction-bulk-summary]'?summary:bar},events=[];
  const activate=kind=>new Function('root','target','change',body)({}, {closest:selector=>selector===`[data-interaction-bulk-${kind}]`?{closest:()=>host}:null},(_root,detail)=>events.push(detail));
  for(const [kind,value] of [['add',1],['add',2],['clear',0],['add',1],['clear',0]]){events.length=0;activate(kind);assert.equal(host.dataset.interactionBulkCount,String(value));assert.equal(count.textContent,String(value));assert.equal(summary.textContent,`${value} selected`);assert.equal(bar.hidden,value===0);assert.deepEqual(events,[{name:'bulk',value:String(value),selected:value>0}]);}
});

test('Bulk gallery stays initial zero; initial Value2 is a separate existing real Go render fixture',async()=>{
  const [fixture,template,go]=await Promise.all([source('internal/gallery/advanced_interaction_fixtures.go'),source('ui/gohtmx/templates/ely-api-interaction.html'),source('ui/gohtmx/interaction_bulk_count_test.go')]);
  assert.match(fixture,/props\["SelectedCount"\], props\["SelectLabel"\], props\["Items"\] = 0,/);
  assert.match(template,/\$count := or .Value "0"/);assert.match(template,/if ne .SelectedCount nil/);assert.match(template,/eq \(printf "%v" \$count\) "0"/);
  assert.match(go,/"legacy-positive", map\[string\]any\{"Value": "2"\}, "2", false/);
  assert.match(go,/"explicit-zero-wins", map\[string\]any\{"Value": "2", "SelectedCount": 0\}, "0", true/);
  // Separate renderer proof only: this does not create a new gallery/browser case.
  const result=execFileSync('go',['test','./ui/gohtmx','-run','^TestBulkActionBarEffectiveInitialCount$','-count=1'],{cwd:repo,env:{...process.env,GOTOOLCHAIN:'go1.26.9'},encoding:'utf8',timeout:60000,maxBuffer:512*1024});
  assert.match(result,/\bok\s/);
});

test('actual native toggle handler opens Collapsible and keeps both explicit Accordion identities exclusive',async()=>{
  const foundation=await source('ui/gohtmx/assets/ely-api-foundation.js');
  assert.match(foundation,/root.addEventListener\('toggle', onToggle, true\)/);assert.match(foundation,/root.removeEventListener\('toggle', onToggle, true\)/);
  const body=foundation.match(/const onToggle = event => \{([\s\S]*?)\n  \};/)[1];
  for(const identity of ['layout/Collapsible','layout/Accordion','layout/AccordionItem']){
    const accordion=identity!=='layout/Collapsible';
    const queue=[],events=[],root={id:'actual-accordion',dataset:{elyComponent:identity}},items=[];
    const host={querySelectorAll:()=>items};
    for(let i=0;i<(accordion?3:1);i++){let open=accordion&&i===0;const item={matches:selector=>selector==='details',closest:selector=>selector==='[data-ely-family]'?root:accordion?host:null};Object.defineProperty(item,'open',{get:()=>open,set:value=>{if(open!==value){open=value;queue.push(item);}}});items.push(item);}
    const toggle=new Function('event','root','emit',body),emit=(_root,action,detail)=>events.push({id:root.id,component:identity,action,...detail});
    const run=(index,open)=>{events.length=0;items[index].open=open;let count=0;while(queue.length){assert(++count<=6);toggle({target:queue.shift()},root,emit);}return structuredClone(events);};
    if(accordion){assert.deepEqual(run(1,true),[{id:root.id,component:identity,action:'change',open:true},{id:root.id,component:identity,action:'change',open:false}]);assert.deepEqual(items.map(item=>item.open),[false,true,false]);
      assert.deepEqual(run(2,true).map(event=>event.open),[true,false]);assert.deepEqual(items.map(item=>item.open),[false,false,true]);assert.deepEqual(run(2,false).map(event=>event.open),[false]);assert.deepEqual(run(0,true).map(event=>event.open),[true]);
    }else{assert.deepEqual(run(0,true),[{id:root.id,component:identity,action:'change',open:true}]);assert.deepEqual(run(0,false),[{id:root.id,component:identity,action:'change',open:false}]);}
    events.length=0;toggle({target:{matches:()=>true,closest:()=>({})}},root,emit);assert.deepEqual(events,[],'Foreign details cannot emit through this root');
  }
});

test('new drivers preserve trusted pointer activation, async waits, exact identities and twins without DOM click shortcuts',async()=>{
  const driver=runRequestedStateActions.toString(),start=driver.indexOf("if(['sheet-native-actions','bulk-canonical-zero','native-disclosure'].includes(contract.focusedSequence))"),section=driver.slice(start,driver.indexOf("if(contract.focusedSequence==='canvas-minimap-zoom-fit-hit-test')",start));
  assert(start>=0&&section.length>0);
  for(const text of ["clickVisibleControl(opener)","clickVisibleControl(control)","clickVisibleControl(host.locator(selector))","clickVisibleControl(details.nth(index).locator('summary'))","activated[0].trusted,true","node.__visualControlEvents.slice(cursor).length===count","opens.map(open=>['ely:action',{id,component:identity,action:'change',open}])","await fresh()","node.removeEventListener('click',node.__visualFiniteClickObserver)"])assert(section.includes(text),text);
  assert(!/\.click\(|\.focus\(|requestSubmit|force:/.test(section),'Real controls must not use DOM activation, direct focus or force fallback');
  const workspace=await source('internal/gallery/assets/advanced-workspace-checks.js');
  for(const name of ['CodeEditor','EditorGutter','LineNumbers','FoldingControl','Ruler','IndentGuide','BracketMatcher','RainbowBrackets','MultiCursor','SelectionHighlight','StickyScroll','Breadcrumb','InlayHints','CodeLens','InlineDecoration']){const c=caseActionContract('editor/'+name,workspace,'workspace.js');assert.deepEqual(c.mappingGaps,[]);assert.equal(c.steps.length,11);}
  for(const id of ['project/StatusSelect','buttons/Button','forms/TextArea','data/Tag','tooling/EventLogger','canvas/InfiniteCanvas'])assert(requestedStateContract(id));
});
