import assert from 'node:assert/strict';
import {validateBasicMatrix} from './visual-state-audit-basic.mjs';

export const basicActionVariants=Object.freeze(['select','radio-group','combobox','multi-select','selectable-list']);
const noninteractive='field-label field-description badge progress separator kbd kbd-group card stack grid code-block avatar alert empty-state timeline table chart'.split(' ');
const actionIDs={
  input:['edit','commit'],textarea:['edit','commit'],select:['selected-option'],
  'radio-group':['selected-option'],checkbox:['toggle-off','toggle-on'],switch:['toggle-off','toggle-on'],slider:['increase'],button:['activate'],
  'clearable-input':['edit','clear'],'password-input':['reveal','conceal'],'pin-input':['replace-digit'],
  'tag-input':['add-tag','remove-tag'],'key-value-input':['add-pair','remove-pair'],
  'file-dropzone':['set-files'],'date-picker':['edit-date','commit-date'],'color-picker':['set-color'],
  'hotkey-input':['record-shortcut','clear-shortcut','restore-shortcut'],'signature-pad':['type-signature','clear-signature','draw-signature'],
  combobox:['open-options','choose-option'],'multi-select':['toggle-alpha-off','toggle-alpha-on'],
  'selectable-list':['selected-option'],dialog:['host-open','close','host-reopen','escape'],tabs:['second-tab','first-tab'],
  accordion:['open-second','close-second'],breadcrumb:['local-link'],menu:['open-menu','choose-first'],
  'data-table':['filter','clear-filter','density','sort','hide-column','show-column'],
  calendar:['next-month','previous-month','choose-day','keyboard-next-day'],
  'map-view':['zoom-in','reset-view','select-marker','close-popup'],
  'coordinate-display':['copy-boundary'],
};
export function basicActionContract(identity){
  const match=/^basic\/([a-z][a-z0-9-]*)(@second-enabled-option)?$/.exec(identity);
  if(!match)return null;
  const [,template,variant]=match;
  if(variant&&!basicActionVariants.includes(template))return null;
  const source=template==='map-view'||template==='coordinate-display'?'ui/gohtmx/templates/ely-map.html + ui/gohtmx/assets/ely-map.js':
    ['tabs','dialog','clearable-input','password-input','pin-input','tag-input','key-value-input','file-dropzone','date-picker','color-picker','hotkey-input','signature-pad','combobox','multi-select','selectable-list'].includes(template)?'ui/gohtmx/templates/ely-controls.html + ui/gohtmx/assets/ely-controls.js':
    ['menu','accordion','data-table','calendar','breadcrumb','card','stack','grid','code-block','avatar','alert','empty-state','timeline','table','chart'].includes(template)?'ui/gohtmx/templates/ely-patterns.html + ui/gohtmx/assets/ely-patterns.js':`ui/gohtmx/templates/shadcn-${['field-label','field-description','datalist'].includes(template)?'field':template==='kbd-group'?'kbd':template}.html`;
  if(noninteractive.includes(template))return {identity,template,classification:'noninteractive-canonical-fixture',steps:[],source,scope:'Caller content only; no descendant host widgets are supplied'};
  if(template==='datalist')return {identity,template,classification:'conditional-no-associated-input',steps:[],source:'ui/gohtmx/templates/shadcn-field.html',scope:'Native datalist resource only; no associated input or standalone popup approval'};
  if(!actionIDs[template])return null;
  const ids=variant&&['select','radio-group','selectable-list'].includes(template)?['select-gamma']:variant&&template==='multi-select'?['add-gamma','remove-gamma']:actionIDs[template];
  const boundaries={
    'file-dropzone':['Playwright setInputFiles is file injection, not OS file-picker or drag/drop approval'],
    'date-picker':['Native date-popup UI is outside DOM pixel evidence'],
    'color-picker':['Native color-popup UI is outside DOM pixel evidence; fill is browser-supported value injection'],
    'pin-input':['No OS clipboard write/paste approval'],
    dialog:['Open is a real click on explicitly labelled fixture-host showModal integration, not a library opener'],
    'coordinate-display':['Isolated clipboard request spy; never writes to the user clipboard'],
    'map-view':['Canonical markers mode only; no provider network, location mode or OS clipboard approval'],
    breadcrumb:['Only the scoped first fragment link is activated; no disabled second-link enforcement claim'],
  };
  return {identity,template,variant:variant?'second-enabled-option':null,classification:'finite-actions',source,
    steps:ids.map(id=>({id,sourceSiteId:`basic-action:${identity}:${id}`,sourceAnchor:source,eventBoundary:template==='file-dropzone'?'Playwright file injection':['color-picker','date-picker','select','selectable-list'].includes(template)?'Playwright browser value selection':template==='coordinate-display'?'Native click with isolated clipboard spy':template==='dialog'&&id.startsWith('host-')?'Native click on explicit fixture-host opener':'Native Playwright pointer/keyboard or text entry; runtime events retained'})),
    boundaries:boundaries[template]||[],scope:'Exact canonical caller fixture or separately hashed named variant; no advanced registered-check equivalence or all-prop claim'};
}

export function validateBasicActionMatrix(matrix,manifest,revision){
  assert.equal(matrix.actionFixture,true,'Opt-in action fixture matrix required');
  validateBasicMatrix({...matrix,auditCases:matrix.auditCases.filter(row=>!row.componentIdentity.includes('@'))},manifest,revision);
  assert.equal(manifest.variants?.length,5);assert.equal(matrix.auditCases.length,53);
  for(const template of basicActionVariants){
    const identity=`basic/${template}@second-enabled-option`,row=matrix.auditCases.find(row=>row.componentIdentity===identity),fixture=manifest.variants.find(row=>row.name===identity);
    assert(row&&fixture,identity);assert.equal(row.caseId,`basic:${template}@second-enabled-option`);assert.equal(row.template,template);assert.equal(fixture.template,template);assert.equal(row.sourceSHA,revision);assert.equal(row.family,'basic');
    assert.equal(row.fixtureIdentity,`basic-fixture:${identity}`);assert.equal(row.fixturePropsSHA256,fixture.propsSHA256);assert.match(fixture.propsSHA256,/^[a-f0-9]{64}$/);
    assert.notEqual(fixture.propsSHA256,manifest.cases.find(row=>row.template===template).propsSHA256);
    assert.deepEqual(row.aliasMapping,{requestedName:identity,relation:'named-basic-action-variant'});
    assert.deepEqual(row.surface,matrix.auditCases[0].surface);assert.deepEqual(row.profileIds,matrix.auditCases[0].profileIds);
  }
  assert.equal(new Set(matrix.auditCases.map(row=>row.caseId)).size,53);
}

// No launcher: the existing runner supplies owned roots, paired capture and twin checks.
export async function runBasicActions(contract,root,runStep){
  const page=root.page(),t=contract.template,variant=Boolean(contract.variant),one=s=>root.locator(s);
  const value=async(s,expected)=>assert.equal(await one(s).inputValue(),expected);
  const checked=async(s,expected)=>assert.equal(await one(s).isChecked(),expected);
  const step=(id,control,action,verify)=>runStep(id,control,action,verify);
  const field='input:not([type=hidden]),textarea';
  const nativeTypes=async expected=>{const events=await root.evaluate(n=>n.__basicEvents.slice(n.__basicCursor));assert.deepEqual(events.map(e=>e.type),expected);return events;};
  if(['select','radio-group','combobox','multi-select','selectable-list'].includes(t)){
    const beta=one(t==='combobox'?'[data-value="beta"]':t==='select'||t==='selectable-list'?'option[value="beta"]':'input[value="beta"]');
    assert.equal(await beta.count(),1,'Canonical Beta must remain present');
    assert.equal(await beta.evaluate(n=>n.disabled===true||n.getAttribute('aria-disabled')==='true'),true,'Disabled Beta must actually be rendered unavailable; do not silently change the canonical fixture');
  }
  if(['input','textarea','clearable-input','date-picker'].includes(t)){
    const selector=t==='textarea'?'textarea':field,expected=t==='date-picker'?'2026-10-20':t==='textarea'?'first\nsecond\nthird\nfourth':'Changed caller';
    await step(t==='date-picker'?'edit-date':'edit',selector,()=>one(selector).fill(expected),async()=>{await value(selector,expected);await nativeTypes(t==='date-picker'?['input','change']:['input']);});
    if(t==='clearable-input')await step('clear','[data-ui-action="clear"]',()=>one('[data-ui-action="clear"]').click(),async()=>{await value(selector,'');await nativeTypes(['change','input','change']);});
    else await step(t==='date-picker'?'commit-date':'commit',selector,()=>one(selector).press('Tab'),async()=>{await value(selector,expected);await nativeTypes(t==='date-picker'?[]:['change']);});
  }else if(['checkbox','switch','multi-select'].includes(t)){
    const selector=t==='multi-select'?`input[value="${variant?'gamma':'alpha'}"]`:'input[type=checkbox]';
    const targets=t==='multi-select'?(variant?[true,false]:[false,true]):[false,true];
    for(let i=0;i<2;i++)await step(contract.steps[i].id,selector,()=>one(selector).click(),async()=>{await checked(selector,targets[i]);await nativeTypes(['input','change']);});
  }else if(['select','selectable-list','radio-group'].includes(t)){
    const selector=t==='radio-group'?`input[value="${variant?'gamma':'alpha'}"]`:'select';
    await step(contract.steps[0].id,selector,()=>t==='radio-group'?one(selector).click():one(selector).selectOption(variant?'gamma':'alpha'),async()=>{
      if(t==='radio-group')await checked(selector,true);else await value(selector,variant?'gamma':'alpha');
      await nativeTypes(t==='radio-group'&&!variant?[]:['input','change']);
    });
  }else if(t==='button'){
    await step('activate','button',()=>one('button').click(),async()=>{const clicks=await root.evaluate(n=>n.__basicClicks.slice(n.__basicClickCursor));assert.equal(clicks.length,1);assert.equal(clicks[0].trusted,true);await nativeTypes([]);});
  }else if(t==='slider'){
    await step('increase','input[type=range]',()=>one('input[type=range]').press('ArrowRight'),async()=>{await value('input[type=range]','36');await nativeTypes(['input','change']);});
  }else if(t==='password-input'){
    for(const [id,type]of [['reveal','text'],['conceal','password']])await step(id,'[data-ui-action="password-toggle"]',()=>one('[data-ui-action="password-toggle"]').click(),async()=>{assert.equal(await one('input').getAttribute('type'),type);await value('input','alpha');await nativeTypes([]);});
  }else if(t==='pin-input'){
    await step('replace-digit','[data-ui-pin-slot]',()=>one('[data-ui-pin-slot]').first().fill('9'),async()=>{await value('input[type=hidden]','9234');const events=await nativeTypes(['input','input','change']);assert(events.some(e=>e.name?.endsWith('_value')&&e.value==='9234'));});
  }else if(t==='tag-input'){
    const entry='[data-ui-tag-entry]';
    await step('add-tag',entry,async()=>{await one(entry).fill('gamma');await one(entry).press('Enter');},async()=>{await value('input[type=hidden]','alpha,beta,gamma');await nativeTypes(['input','input','change']);});
    await step('remove-tag','[data-ui-action="remove-tag"]',()=>one('[data-ui-action="remove-tag"]').last().click(),async()=>{await value('input[type=hidden]','alpha,beta');await nativeTypes(['input','change']);});
  }else if(t==='key-value-input'){
    const rows='[data-ui-key-value]';assert.equal(await one(rows).count(),2);
    await step('add-pair','[data-ui-action="add-pair"]',()=>one('[data-ui-action="add-pair"]').click(),async()=>{assert.equal(await one(rows).count(),3);await nativeTypes([]);});
    await step('remove-pair','[data-ui-action="remove-pair"]',()=>one('[data-ui-action="remove-pair"]').last().click(),async()=>{assert.equal(await one(rows).count(),2);await nativeTypes([]);});
  }else if(t==='file-dropzone'){
    await step('set-files','input[type=file]',()=>one('input[type=file]').setInputFiles({name:'audit.txt',mimeType:'text/plain',buffer:Buffer.from('finite audit')}),async()=>{assert.deepEqual(await one('input[type=file]').evaluate(n=>[...n.files].map(f=>({name:f.name,size:f.size}))),[{name:'audit.txt',size:12}]);assert.match(await one('[data-ui-file-names]').textContent(),/audit\.txt/);await nativeTypes(['input','change']);});
  }else if(t==='color-picker'){
    await step('set-color','input[type=color]',()=>one('input').fill('#ff0000'),async()=>{await value('input','#ff0000');await nativeTypes(['input','change']);});
  }else if(t==='hotkey-input'){
    for(const [id,key,expected]of [['record-shortcut','Control+Shift+P','Ctrl+Shift+P'],['clear-shortcut','Backspace',''],['restore-shortcut','Escape','Ctrl+K']])await step(id,'[data-ui-hotkey]',()=>one('[data-ui-hotkey]').press(key),async()=>{await value('[data-ui-hotkey]',expected);await nativeTypes([]);});
  }else if(t==='signature-pad'){
    await step('type-signature','textarea',()=>one('textarea').fill('Grace'),async()=>{await value('[data-ui-signature-value]','Grace');await nativeTypes(['change','input']);});
    await step('clear-signature','[data-ui-signature-clear]',()=>one('[data-ui-signature-clear]').click(),async()=>{await value('[data-ui-signature-value]','');assert.match(await one('[data-ui-signature-count]').textContent(),/^0 strokes/);await nativeTypes(['change','change']);});
    await step('draw-signature','canvas[data-ui-signature]',async()=>{const box=await one('canvas').boundingBox();assert(box);await page.mouse.move(box.x+20,box.y+20);await page.mouse.down();try{await page.mouse.move(box.x+80,box.y+50,{steps:8});}finally{await page.mouse.up();}},async()=>{assert.match(await one('[data-ui-signature-value]').inputValue(),/^data:image\/png;base64,/);assert.match(await one('[data-ui-signature-count]').textContent(),/^1 stroke/);});
  }else if(t==='combobox'){
    const input='[data-ui-combobox-input]',target=variant?'gamma':'alpha';
    await step('open-options',input,()=>one(input).click(),async()=>{assert.equal(await one(input).getAttribute('aria-expanded'),'true');await nativeTypes([]);});
    await step('choose-option',`[data-value="${target}"]`,()=>one(`[data-value="${target}"]`).click(),async()=>{await value('input[type=hidden]',target);assert.equal(await one(input).getAttribute('aria-expanded'),'false');await nativeTypes(['input','change']);});
  }else if(t==='dialog'){
    for(const [id,open,action]of [['host-open',true,()=>one('[data-basic-open-dialog]').click()],['close',false,()=>one('dialog button').click()],['host-reopen',true,()=>one('[data-basic-open-dialog]').click()],['escape',false,()=>page.keyboard.press('Escape')]])await step(id,open?'[data-basic-open-dialog]':'dialog',action,async()=>{assert.equal(await one('dialog').evaluate(n=>n.open),open);await nativeTypes([]);if(!open){await page.waitForFunction(id=>{const n=document.getElementById(id);return n.__basicLifecycle.slice(n.__basicLifecycleCursor).some(e=>e.type==='close');},await root.getAttribute('id'));const events=await root.evaluate(n=>n.__basicLifecycle.slice(n.__basicLifecycleCursor).filter(e=>e.type!=='toggle'));assert.deepEqual(events.map(e=>e.type),id==='escape'?['cancel','close']:['close']);assert(events.every(e=>e.trusted));}});
  }else if(t==='tabs'){
    for(const [id,index]of [['second-tab',1],['first-tab',0]])await step(id,'[data-ui-tab]',()=>one('[data-ui-tab]').nth(index).click(),async()=>{assert.equal(await one('[data-ui-tab]').nth(index).getAttribute('aria-selected'),'true');assert.equal(await one('[data-ui-tab-panel]').nth(index).isVisible(),true);assert.equal(await one('[data-ui-tab-panel]').nth(1-index).isVisible(),false);await nativeTypes([]);});
  }else if(t==='accordion'){
    for(const [id,open]of [['open-second',true],['close-second',false]])await step(id,'details:nth-child(2)>summary',()=>one('details').nth(1).locator('summary').click(),async()=>{await page.waitForFunction(({rootID,open})=>{const n=document.getElementById(rootID);return n.querySelectorAll('details')[1].open===open&&n.__basicLifecycle.slice(n.__basicLifecycleCursor).length===1;},{rootID:await root.getAttribute('id'),open});assert.equal(await one('details').first().evaluate(n=>n.open),true);const events=await root.evaluate(n=>n.__basicLifecycle.slice(n.__basicLifecycleCursor));assert.equal(events[0].type,'toggle');assert.equal(events[0].trusted,true);await nativeTypes([]);});
  }else if(t==='breadcrumb'){
    const href=await one('a').first().getAttribute('href');assert(href?.startsWith('#basic-'));
    await step('local-link','a:first-child',()=>one('a').first().click(),async()=>assert.equal(new URL(page.url()).hash,href));
  }else if(t==='menu'){
    const href=await one('[role=menuitem]').first().getAttribute('href');assert(href?.startsWith('#basic-'));
    await step('open-menu','[data-ui-menu-trigger]',()=>one('[data-ui-menu-trigger]').click(),async()=>{await page.waitForFunction(id=>document.getElementById(id).querySelector('[popover]').matches(':popover-open'),await root.getAttribute('id'));assert.equal(await one('[popover] [aria-disabled=true]').count(),1);assert.equal(await one('[popover] [aria-disabled=true]').getAttribute('href'),null);await nativeTypes([]);});
    await step('choose-first','[role=menuitem]',()=>one('[role=menuitem]').first().click(),async()=>{await page.waitForFunction(id=>!document.getElementById(id).querySelector('[popover]').matches(':popover-open'),await root.getAttribute('id'));const events=await nativeTypes(['ui:select']);assert.deepEqual(events[0].detail,{value:href});assert.equal(new URL(page.url()).hash,href);});
  }else if(t==='data-table'){
    await step('filter','[data-ui-table-filter]',()=>one('[data-ui-table-filter]').fill('Alice'),async()=>{assert.equal(await one('tbody tr:visible').count(),1);assert.match(await one('[data-ui-table-summary]').textContent(),/^1 \/ 2 rows$/);});
    await step('clear-filter','[data-ui-table-filter]',()=>one('[data-ui-table-filter]').fill(''),async()=>assert.equal(await one('tbody tr:visible').count(),2));
    await step('density','[data-ui-table-density]',()=>one('[data-ui-table-density]').click(),async()=>assert.equal(await one('[data-ui-component=data-table]').getAttribute('data-density'),'compact'));
    await step('sort','[data-ui-table-sort="0"]',()=>one('[data-ui-table-sort="0"]').click(),async()=>{assert.equal(await one('th').first().getAttribute('aria-sort'),'ascending');assert.match(await one('tbody tr').first().textContent(),/Caller Alice/);});
    for(const [id,visible]of [['hide-column',false],['show-column',true]])await step(id,'[data-ui-table-column="1"]',()=>one('[data-ui-table-column="1"]').click(),async()=>assert.equal(await one('tbody tr').first().locator('td').nth(1).isVisible(),visible));
  }else if(t==='calendar'){
    const initial=await one('[data-ui-calendar-title]').textContent();
    await step('next-month','[data-ui-calendar-month="1"]',()=>one('[data-ui-calendar-month="1"]').click(),async()=>assert.notEqual(await one('[data-ui-calendar-title]').textContent(),initial));
    await step('previous-month','[data-ui-calendar-month="-1"]',()=>one('[data-ui-calendar-month="-1"]').click(),async()=>assert.equal(await one('[data-ui-calendar-title]').textContent(),initial));
    await step('choose-day','[data-date="2026-10-20"]',()=>one('[data-date="2026-10-20"]').click(),async()=>{await value('[data-ui-calendar-input]','2026-10-20');await nativeTypes(['input','change']);assert.equal(await one('[data-date="2026-10-20"]').getAttribute('aria-pressed'),'true');});
    await step('keyboard-next-day','[data-date="2026-10-20"]',()=>one('[data-date="2026-10-20"]').press('ArrowRight'),async()=>{assert.equal(await one('[data-date="2026-10-21"]').evaluate(n=>n===document.activeElement),true);await value('[data-ui-calendar-input]','2026-10-20');await nativeTypes([]);});
  }else if(t==='map-view'){
    const map=one('[data-ui-component="map-view"]'),zoom=Number(await map.getAttribute('data-map-zoom')),center=await map.getAttribute('data-map-center'),mapID=await map.getAttribute('id');
    assert.equal(zoom,1,'Canonical missing Zoom uses the existing source default1');assert.equal(center,'37.5665, 126.9780');
    const action=async name=>{const events=await nativeTypes(['ely:action']);assert.equal(events[0].detail.action,name);assert.equal(events[0].detail.id,mapID);assert.equal(events[0].detail.component,'maps/MapView');return events[0].detail;};
    await step('zoom-in','[data-map-zoom="in"]',()=>one('[data-map-zoom="in"]').click(),async()=>{assert.equal(Number(await map.getAttribute('data-map-zoom')),zoom+1);const detail=await action('change-viewport');assert.deepEqual(detail,{action:'change-viewport',viewport:{latitude:37.5665,longitude:126.978,zoom:2},value:center,id:mapID,component:'maps/MapView'});});
    await step('reset-view','[data-map-zoom="reset"]',()=>one('[data-map-zoom="reset"]').click(),async()=>{assert.equal(Number(await map.getAttribute('data-map-zoom')),zoom);assert.equal(await map.getAttribute('data-map-center'),center);const detail=await action('change-viewport');assert.deepEqual(detail,{action:'change-viewport',viewport:{latitude:37.5665,longitude:126.978,zoom:1},value:center,id:mapID,component:'maps/MapView'});});
    await step('select-marker','[data-map-markers] [data-map-point]',()=>one('[data-map-markers] [data-map-point]').click(),async()=>{assert.equal(await one('[data-map-popup]').isVisible(),true);const detail=await action('select-marker');assert.deepEqual(detail,{action:'select-marker',key:'Caller Seoul',value:'seoul',latitude:37.5665,longitude:126.978,id:mapID,component:'maps/MapView'});});
    await step('close-popup','[data-map-close]',()=>one('[data-map-close]').click(),async()=>{assert.equal(await one('[data-map-popup]').isVisible(),false);const detail=await action('close-map-popup');assert.deepEqual(detail,{action:'close-map-popup',key:'Caller Seoul',id:mapID,component:'maps/MapView'});});
  }else if(t==='coordinate-display'){
    const expected=await one('[data-map-coordinate]').textContent();assert.equal(expected,'alpha','Preserve actual canonical Value instead of inventing a formatted coordinate');
    await step('copy-boundary','[data-map-copy]',()=>one('[data-map-copy]').click(),async()=>{await page.waitForFunction(id=>document.getElementById(id).querySelector('[data-map-copy-status]').textContent==='Copied',await root.getAttribute('id'));assert.deepEqual(await page.evaluate(()=>globalThis.__basicClipboardRequests),[expected]);const events=await nativeTypes(['ely:action']);assert.deepEqual(events[0].detail,{action:'copy-coordinate',value:expected,id:'',component:'maps/MapView'});});
  }else throw new Error(`No executable finite basic action implementation: ${t}`);
}
