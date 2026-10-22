import {resolveCaseActionSites} from './visual-state-audit-instrument.mjs';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {captureBounds} from './visual-state-audit-bounds.mjs';

export async function inventoryReceipt(path){
  const bytes=await readFile(path);
  return {path,sha256:createHash('sha256').update(bytes).digest('hex'),data:JSON.parse(bytes)};
}
export async function inventoryDrift(initial){
  const ending=await inventoryReceipt(initial.path);
  return {path:initial.path,initialSHA256:initial.sha256,endingSHA256:ending.sha256,stable:initial.sha256===ending.sha256};
}
// No unhandled page error has a verified exception in this audit.
export const unhandledBrowserErrors=errors=>errors.filter(error=>error.type==='pageerror');

export async function captureTargetPNG(page,root,path){
  await root.scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const bounds=await root.evaluate(captureBounds);
  assert(bounds.clip.width>0&&bounds.clip.height>0,'Target painted union must have positive dimensions');
  assert(!bounds.negativePageOverflow,'Target painted content extends beyond capturable document coordinates');
  const foreignDOMIntersections=await root.evaluate((node,clip)=>{
    if(node.closest('dialog[open],:popover-open'))return [];
    return [...document.querySelectorAll('[data-audit-main] > [data-ely-family],[data-audit-twin] > [data-ely-family]')]
      .filter(peer=>peer!==node&&!node.contains(peer)&&!peer.contains(node)&&peer.checkVisibility({checkOpacity:true,checkVisibilityCSS:true}))
      .map(peer=>{const rect=peer.getBoundingClientRect();return {id:peer.id,component:peer.dataset.elyComponent||null,x:rect.left+scrollX,y:rect.top+scrollY,width:rect.width,height:rect.height};})
      .filter(peer=>Math.min(peer.x+peer.width,clip.x+clip.width)-Math.max(peer.x,clip.x)>1&&Math.min(peer.y+peer.height,clip.y+clip.height)-Math.max(peer.y,clip.y)>1);
  },bounds.clip);
  const png=await page.screenshot({path,fullPage:true,clip:bounds.clip,animations:'disabled',scale:'css'});
  assert.equal(png.readUInt32BE(16),bounds.clip.width,'PNG width equals painted union');
  assert.equal(png.readUInt32BE(20),bounds.clip.height,'PNG height equals painted union');
  return {bounds,png,foreignDOMIntersections};
}

// Choose an actually reachable owned pixel, never a forced click through a twin.
export async function clickVisibleControl(control,{allowKeyboard=false}={}){
  await control.scrollIntoViewIfNeeded();
  const position=await control.evaluate(node=>{
    const rect=node.getBoundingClientRect();
    for(const fy of [.5,.15,.85])for(const fx of [.05,.5,.95]){
      const x=rect.left+rect.width*fx,y=rect.top+rect.height*fy,hit=document.elementFromPoint(x,y);
      if(hit&&(hit===node||node.contains(hit)))return {x:rect.width*fx,y:rect.height*fy};
    }
    return null;
  });
  if(!position&&allowKeyboard){
    await control.focus();await control.press('Enter');
    return {method:'native keyboard Enter',pointerActionabilityGap:'Requested control has no reachable owned pixel in the audit fixture; visual/actionability completion remains blocked'};
  }
  assert(position,'Requested control has no reachable owned pixel; keep this as an actionability gap');
  await control.click({position});
  return {method:'hit-tested native click',position};
}

const step=(id,owner,control,method,event,expectedState)=>({id,owner,control,method,event,expectedState});
const contracts={
  'files/ArchiveViewer':{entry:'domain',kind:'ArchiveViewer',steps:[
    step('expand-folder','domain','folder','click','click','aria-expanded=true; child list visible'),
    step('open-entry','domain','[data-ws-archive-node="Atrium/Design/Palette.json"]','dispatchEvent','keydown','open-archive-entry.path=Atrium/Design/Palette.json'),
  ]},
  'forms/PasswordInput':{entry:'forms/PasswordInput',kind:'PasswordInput',steps:[
    step('password-input','input','node','dispatchEvent','input','value=Changed caller value; native validity=true; type=password'),
    step('password-change','input','node','dispatchEvent','change','retained value=Changed caller value; change event delivered'),
    step('password-toggle','forms/PasswordInput','toggle','click','click','type=text; retained value=Changed caller value'),
  ]},
  'editor/CodeEditor':{entry:'code',kind:'CodeEditor',steps:[
    step('fold','code','fold','click','click','fold aria-expanded=true; toggle-code-fold.line=2'),
    step('code-lens','code','[data-ws-code-lens="references"]','click','click','run-code-lens.lens=references'),
    step('minimap','code','[data-ws-editor-tool="toggle-minimap"]','click','click','editor-tool.tool=toggle-minimap'),
    step('breadcrumb','code','[data-ws-editor-breadcrumb="src/worker.go"]','click','click','open-code-location.location=src/worker.go'),
    step('multiline-input','code','editor','dispatchEvent','input','submitted content=first line\\nnew browser line'),
    step('submit-multiline','submitData','button[type="submit"]','click','click','one host submission; FormData contains exact multiline content'),
    step('reject-line-number-only','code','button[type="submit"]','click','click','aria-invalid=true; no additional host action'),
    step('changed-input','code','editor','dispatchEvent','input','submitted content=changed caller code'),
    step('submit-changed','submitData','button[type="submit"]','click','click','one host submission; FormData contains changed caller code'),
    step('empty-input','checkRequiredEditor','editor','dispatchEvent','input','submitted content is empty; caret remains observable'),
    step('reject-empty','checkRequiredEditor','button[type="submit"]','click','click','aria-invalid=true; required error visible; no additional host action'),
  ]},
};

export function caseActionContract(identity,source,filename){
  const definition=contracts[identity];if(!definition)return null;
  const facts={root:{dataset:{elyKind:definition.kind,elyComponent:identity}},kind:definition.kind,variant:identity.split('/')[1],twin:true,
    selectors:{'[data-ws-devtools-source]':false,'[data-ws-canvas-scene]':false},form:{dataset:{wsRequired:'true'}},node:{tagName:'INPUT',type:'password'}};
  const resolved=resolveCaseActionSites(source,filename,{entry:definition.entry,facts});
  const mappingGaps=[...resolved.mappingGaps];
  if(resolved.sites.length!==definition.steps.length)mappingGaps.push({reason:'exact-action-count-changed',expected:definition.steps.length,actual:resolved.sites.length});
  const steps=definition.steps.map((expected,index)=>{
    const actual=resolved.sites[index];
    if(!actual||actual.owner!==expected.owner||(actual.controlSelector||actual.control)!==expected.control||actual.method!==expected.method||actual.event!==expected.event)mappingGaps.push({reason:'action-source-mapping-changed',stepId:expected.id,actualSiteId:actual?.siteId||null});
    return {...expected,source:actual||null};
  });
  return {identity,entry:definition.entry,kind:definition.kind,steps,mappingGaps,
    fixtureGuards:{component:identity,kind:definition.kind,devtoolsSourceAbsent:identity!=='forms/PasswordInput',canvasSceneAbsent:identity==='files/ArchiveViewer',requiredEditor:identity==='editor/CodeEditor'}};
}

const settingsTargets={KeyboardShortcutsList:[1,'Keyboard'],ProxySettings:[2,'Network'],PrivacySettings:[3,'Privacy','telemetry'],NotificationSettings:[4,'Notifications','quiet'],StartupSettings:[5,'Startup','login'],StorageSettings:[6,'Storage'],ResetToDefault:[6,'Storage'],AdvancedSettings:[7,'Advanced','developer'],'DeveloperMode Toggle':[7,'Advanced','developer']};
export function requestedStateContract(identity){
  const variant=identity.split('/')[1],target=identity.startsWith('settings/')?settingsTargets[variant]:null;
  if(identity!=='maps/MapPopup'&&!target)return null;
  const steps=[];
  const add=(id,control,expectedState)=>steps.push({id,control,expectedState,event:'native Playwright action',source:{siteId:`requested-state:${identity}:${id}`,sourceAnchor:null,
    provenance:'Explicit target-state contract; selectors come from frozen ely-api-forms.html and advanced_forms_fixtures.go, not inferred from unrelated registered-check branches'}});
  if(!target)add('open-popup','button[data-map-point]:not([hidden])','map popup visible with caller content and select-marker host action');
  else{
    if(variant==='ResetToDefault')add('dirty-font','input[name="size"]','font size=18; reset becomes available');
    add('open-target-section',`[data-ely-settings-tab="${target[0]}"]`,`Only ${target[1]} panel visible; requested alias content present`);
    if(target[2])add('toggle-target',`[data-ely-settings-panel="${target[0]}"] input[name="${target[2]}"]`,'checked differs from initial value; exact selected panel remains visible');
    if(variant==='ProxySettings')add('manual-proxy','[data-suite-proxy-mode]','manual proxy fields visible; invalid empty proxy cannot apply');
    if(variant==='ResetToDefault')add('reset-defaults','[data-suite-reset-defaults]','font size restored to 14; reset disabled');
  }
  return {identity,kind:target?'SettingsLayout':'MapView',target,variant,steps,mappingGaps:[],requestedStateOnly:true,
    fixtureGuards:{component:identity,kind:target?'SettingsLayout':'MapView'},scope:'Finite requested target state; independent from registered-check ending state and all-property coverage'};
}

export async function runRequestedStateActions(contract,root,runStep){
  if(!contract.target){
    await root.locator('[data-ui-component=map-view][data-map-ready=true]').waitFor();
    const marker=root.locator('button[data-map-point]:not([hidden])').first(),popup=root.locator('[data-map-popup]');
    assert.equal(await popup.isVisible(),false);
    await runStep('open-popup',()=>marker.click(),async state=>{assert.equal(await popup.isVisible(),true);const text=(await popup.innerText()).trim();assert(text.length>0,'Open popup must paint caller content');assert(state.actions.some(action=>action.action==='select-marker'));return {visible:true,text:text.slice(0,200),marker:await marker.getAttribute('data-map-point')};});
    return;
  }
  const [index,label,toggleName]=contract.target,tabs=root.locator('[data-ely-settings-tab]'),panel=root.locator(`[data-ely-settings-panel="${index}"]`);
  assert.equal(await tabs.count(),8);assert.equal((await tabs.nth(index).textContent()).trim(),label);
  assert.equal(await panel.isVisible(),false,'Target must start inactive so a real opening action is evidenced');
  if(contract.variant==='ResetToDefault')await runStep('dirty-font',async()=>{const size=root.locator('input[name=size]');await size.evaluate(node=>{node.value='18';});await size.dispatchEvent('input');},async()=>{assert.equal(await root.locator('input[name=size]').inputValue(),'18');return {fontSize:'18'};});
  await runStep('open-target-section',()=>tabs.nth(index).click(),async()=>{
    assert.equal(await panel.isVisible(),true);const visible=await root.locator('[data-ely-settings-panel]').evaluateAll(nodes=>nodes.filter(node=>!node.hidden).map(node=>node.dataset.elySettingsPanel));assert.deepEqual(visible,[String(index)]);
    const text=(await panel.innerText()).trim();assert(text.length>0);
    if(contract.variant==='KeyboardShortcutsList'){assert(text.includes('Command palette')&&text.includes('Undo'));}
    if(contract.variant==='NotificationSettings')assert.equal(await panel.locator('.ely-suite-settings-matrix input').count(),9);
    return {panel:index,label,visible:true,text:text.slice(0,200)};
  });
  if(toggleName){
    const toggle=panel.locator(`input[name="${toggleName}"]`),before=await toggle.isChecked();
    const label=toggle.locator('xpath=ancestor::label[1]');
    await runStep('toggle-target',async()=>clickVisibleControl(await label.count()?label:toggle),async()=>{const checked=await toggle.isChecked();assert.equal(checked,!before);assert.equal(await panel.isVisible(),true);return {panel:index,name:toggleName,before,checked};});
  }
  if(contract.variant==='ProxySettings')await runStep('manual-proxy',()=>root.locator('[data-suite-proxy-mode]').selectOption('manual'),async()=>{assert.equal(await root.locator('[data-suite-proxy-fields]').isVisible(),true);assert.equal(await root.locator('[data-suite-proxy-apply]').isDisabled(),true);return {mode:'manual',fieldsVisible:true,applyDisabled:true};});
  if(contract.variant==='ResetToDefault')await runStep('reset-defaults',()=>clickVisibleControl(root.locator('[data-suite-reset-defaults]'),{allowKeyboard:true}),async()=>{assert.equal(await root.locator('input[name=size]').inputValue(),'14');assert.equal(await root.locator('[data-suite-reset-defaults]').isDisabled(),true);return {fontSize:'14',resetDisabled:true,summary:await root.locator('[data-suite-defaults-summary]').textContent()};});
}

// Runs in the page. A twin's descendants/references never confer ownership.
export function ownedOverlayInventory(node){
  const references=new Set(),owners=new Set([node.id,...[...node.querySelectorAll('[id]')].map(item=>item.id)].filter(Boolean));
  const attributes=['aria-controls','popovertarget','data-foundation-dialog-open','data-interaction-dialog','data-ely-dialog-open'];
  for(const control of [node,...node.querySelectorAll(attributes.map(name=>`[${name}]`).join(','))])for(const attribute of attributes)for(const value of(control.getAttribute(attribute)||'').split(/\s+/))if(value)references.add(value.replace(/^#/,''));
  return [...document.querySelectorAll('dialog[open],:popover-open,[role=dialog],[role=menu],[data-ely-portal]')]
    .filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0&&element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});})
    .map(element=>{
      const selector=element.matches('dialog[open]')?'dialog[open]':element.matches(':popover-open')?':popover-open':element.matches('[role=dialog]')?'[role=dialog]':element.matches('[role=menu]')?'[role=menu]':'[data-ely-portal]';
      const inside=node.contains(element),foreign=element.closest('[data-ely-family]');
      const explicitOwner=element.getAttribute('data-ely-owner')?.replace(/^#/,'');
      const scope=inside?'component-root':foreign&&foreign!==node?'foreign-component':explicitOwner&&!owners.has(explicitOwner)?'foreign-portal-owner':owners.has(explicitOwner)?'portal-owner-attribute':references.has(element.id)?'trigger-reference':'unowned';
      const rect=element.getBoundingClientRect();
      return {tag:element.tagName,id:element.id||null,role:element.getAttribute('role'),text:(element.innerText||'').trim().slice(0,180),bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        nativeOpen:element.matches('dialog')?element.open:null,popoverOpen:element.matches(':popover-open'),locatorSelector:selector,locatorIndex:[...document.querySelectorAll(selector)].indexOf(element),
        ownershipScope:scope,owned:['component-root','portal-owner-attribute','trigger-reference'].includes(scope)};
    });
}
