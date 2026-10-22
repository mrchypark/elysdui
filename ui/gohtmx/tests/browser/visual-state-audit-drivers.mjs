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

// Keep the frozen baseline geometry helper; adapt only proven empty CSS clips,
// without changing the DOM, computed styles, or the baseline capture path.
const actionBounds=new Function('node',`
  const nativeStyle=window.getComputedStyle.bind(window);
  const getComputedStyle=element=>{
    const style=nativeStyle(element);
    return /^inset\\(50%(?: 50%){0,3}\\)$/.test(style.clipPath)?{display:'none'}:style;
  };
  return (${captureBounds.toString()})(node);
`);

// A layout box is not painted evidence. Only an opaque, higher-stacked owned
// panel can cover foreign paint; rounded/transparent corners remain checked.
export function captureForeignPaint(node,{clip,checkedRootID}){
  const box=r=>({x:r.left+scrollX,y:r.top+scrollY,width:r.width,height:r.height});
  const intersect=(a,b)=>{const x=Math.max(a.x,b.x),y=Math.max(a.y,b.y),width=Math.min(a.x+a.width,b.x+b.width)-x,height=Math.min(a.y+a.height,b.y+b.height)-y;return width>0&&height>0?{x,y,width,height}:null;};
  const opaque=color=>/^rgb\(/.test(color)||/^rgba\([^)]*,\s*1\)$/.test(color);
  const emptyClip=e=>{for(let p=e;p;p=p.parentElement)if(/^inset\(50%(?: 50%){0,3}\)$/.test(getComputedStyle(p).clipPath))return true;return false;};
  const style=getComputedStyle(node),r=box(node.getBoundingClientRect());
  const radius=Math.max(...['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].map(key=>{
    const value=style[key];return /%/.test(value)?Infinity:Math.max(...value.split(' ').map(parseFloat));
  }));
  const covers=opaque(style.backgroundColor)&&style.backgroundImage==='none'&&style.backgroundClip==='border-box'&&style.clipPath==='none'&&style.maskImage==='none'&&style.position!=='static'&&(Number(style.zIndex)>0||node.matches(':modal,:popover-open'))&&Number.isFinite(radius)?[
    {x:r.x+radius,y:r.y,width:r.width-2*radius,height:r.height},
    {x:r.x,y:r.y+radius,width:r.width,height:r.height-2*radius},
  ].filter(b=>b.width>0&&b.height>0):[];
  const subtract=(a,b)=>{const i=intersect(a,b);if(!i)return [a];return [
    {x:a.x,y:a.y,width:a.width,height:i.y-a.y},
    {x:a.x,y:i.y+i.height,width:a.width,height:a.y+a.height-i.y-i.height},
    {x:a.x,y:i.y,width:i.x-a.x,height:i.height},
    {x:i.x+i.width,y:i.y,width:a.x+a.width-i.x-i.width,height:i.height},
  ].filter(b=>b.width>0.01&&b.height>0.01);};
  const plainChain=(start,end)=>{for(let p=start;p&&p!==end;p=p.parentElement){const s=getComputedStyle(p);if(p.matches(':modal,:popover-open')||['sticky','fixed'].includes(s.position)||s.zIndex!=='auto'||Number(s.opacity)!==1||s.transform!=='none'||s.filter !== 'none'||s.perspective!=='none'||s.maskImage!=='none'||s.backdropFilter!=='none'||s.containerType!=='normal'||s.isolation !== 'auto'||s.mixBlendMode!=='normal'||s.contain!=='none'||s.willChange!=='auto'||s.clipPath!=='none'||s.overflowX!=='visible'||s.overflowY!=='visible')return false;}return true;};
  // Even a shared ancestor can clip the purported opaque cover. Decline the
  // proof instead of attempting to model ancestor paint clips or masks.
  const unclippedAncestors=()=>{for(let p=node.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(s.overflowX!=='visible'||s.overflowY!=='visible'||s.clipPath!=='none'||s.clip!=='auto'||s.maskImage!=='none'||s.filter !== 'none'||s.backdropFilter!=='none'||s.perspective!=='none')return false;}return true;};
  const canCover=paint=>{
    let common=node.parentElement;while(common&&!common.contains(paint))common=common.parentElement;
    return common&&covers.length&&unclippedAncestors()&&Number(style.opacity)===1&&style.transform==='none'&&style.filter==='none'&&style.mixBlendMode==='normal'&&plainChain(node.parentElement,common)&&plainChain(paint,common);
  };
  const rootSelector='[data-audit-main]>[data-ely-family],[data-audit-twin]>[data-ely-family]';
  const checkedRoot=checkedRootID?document.getElementById(checkedRootID):node.closest(rootSelector);
  const owners=new Set(checkedRoot?[checkedRoot.id,...[...checkedRoot.querySelectorAll('[id]')].map(e=>e.id)]:[]);
  const references=new Set(checkedRoot?[...checkedRoot.querySelectorAll('[aria-controls]')].flatMap(e=>(e.getAttribute('aria-controls')||'').split(/\s+/)):[]);
  const foreignRoots=[...document.querySelectorAll(rootSelector)].filter(peer=>peer!==checkedRoot&&peer!==node&&!node.contains(peer)&&!peer.contains(node));
  // Detached portals can paint inside this camera even when their root is far away.
  for(const portal of document.querySelectorAll('[data-ely-portal],dialog[open],:popover-open,[role=menu],[role=dialog],[role=region]')){
    if(portal===node||node.contains(portal)||portal.contains(node)||portal.closest(rootSelector))continue;
    const explicit=portal.getAttribute('data-ely-owner')?.replace(/^#/,'');
    if(explicit?owners.has(explicit):references.has(portal.id))continue;
    foreignRoots.push(portal);
  }
  const intersections=[],occluded=[];
  for(const peer of foreignRoots){
    const painted=[];
    for(const e of [peer,...peer.querySelectorAll('*')]){
      if(!e.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})||emptyClip(e))continue;
      const s=getComputedStyle(e),rect=box(e.getBoundingClientRect());
      // Native controls/media and nontrivial effects are conservative boxes.
      if(e.matches('button,input,select,textarea,img,canvas,svg,video,iframe')||s.backgroundImage!=='none'||s.backgroundColor!=='rgba(0, 0, 0, 0)'||s.boxShadow!=='none'||['Top','Right','Bottom','Left'].some(side=>parseFloat(s[`border${side}Width`])>0))painted.push({e,rect});
      for(const text of e.childNodes){if(text.nodeType!==Node.TEXT_NODE||!text.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(text);for(const part of range.getClientRects())painted.push({e,rect:box(part)});}
    }
    let exposedArea=0,coveredArea=0;const witnesses=[];
    for(const {e,rect} of painted){const overlap=intersect(rect,clip);if(!overlap)continue;
      const residual=canCover(e)?covers.reduce((parts,cover)=>parts.flatMap(part=>subtract(part,cover)),[overlap]):[overlap];
      const remaining=residual.reduce((sum,b)=>sum+b.width*b.height,0);
      exposedArea+=remaining;coveredArea+=overlap.width*overlap.height-remaining;
      if(remaining>0.01&&witnesses.length<3)witnesses.push({tag:e.tagName,id:e.id||null,className:e.getAttribute('class'),paintBox:rect,residual});
    }
    const bounds=box(peer.getBoundingClientRect());
    if(exposedArea>0.01)intersections.push({id:peer.id,component:peer.dataset.elyComponent||null,...bounds,exposedPaintArea:exposedArea,witnesses});
    else if(coveredArea>0)occluded.push({id:peer.id,coveredPaintArea:coveredArea,proof:'opaque owned panel interior above non-stacking foreign paint'});
  }
  return {foreignDOMIntersections:intersections,occludedForeignPaint:occluded};
}

export async function captureTargetPNG(page,root,path,{checkedRootID}={}){
  // This finite menu fixture otherwise opens across the following audit row.
  // Ordinary scrolling selects its existing upward collision placement; no DOM isolation.
  if(await root.evaluate(node=>node.dataset.elyComponent==='menus/RadioMenuItem'))await root.evaluate(node=>node.scrollIntoView({block:'end',inline:'nearest',behavior:'instant'}));
  else await root.scrollIntoViewIfNeeded();
  await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
  const bounds=await root.evaluate(actionBounds);
  assert(bounds.clip.width>0&&bounds.clip.height>0,'Target painted union must have positive dimensions');
  assert(!bounds.negativePageOverflow,'Target painted content extends beyond capturable document coordinates');
  const ownership=await root.evaluate(captureForeignPaint,{clip:bounds.clip,checkedRootID});
  const png=await page.screenshot({path,fullPage:true,clip:bounds.clip,animations:'disabled',scale:'css'});
  assert.equal(png.readUInt32BE(16),bounds.clip.width,'PNG width equals painted union');
  assert.equal(png.readUInt32BE(20),bounds.clip.height,'PNG height equals painted union');
  return {bounds,png,...ownership};
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
  const focused={
    'forms/HotkeyInput':{kind:'HotkeyInput',sequence:'hotkey-record-clear-restore',steps:[
      ['record-shortcut','[data-ui-hotkey]','Control+K is recorded; glyph remains visible and text inset clears its painted bounds'],
      ['clear-shortcut','[data-ui-hotkey]','Backspace clears the recorded shortcut'],
      ['restore-shortcut','[data-ui-hotkey]','Escape restores the value present when the input received focus'],
    ]},
    'forms/ShortcutRecorder':{kind:'HotkeyInput',sequence:'hotkey-record-clear-restore',steps:[
      ['record-shortcut','[data-ui-hotkey]','Control+K is recorded; glyph remains visible and text inset clears its painted bounds'],
      ['clear-shortcut','[data-ui-hotkey]','Backspace clears the recorded shortcut'],
      ['restore-shortcut','[data-ui-hotkey]','Escape restores the value present when the input received focus'],
    ]},
    'account/SignupForm':{kind:'SignupForm',sequence:'signup-terms-label',steps:[
      ['fill-name','input[name="name"]','Caller name is entered'],
      ['fill-email','input[name="email"]','Valid email is entered'],
      ['fill-password','input[name="password"]','Password rules pass while required unchecked terms keep the form invalid'],
      ['accept-terms-label','label.ely-suite-terms','Hit-tested visible label checks the required checkbox, focuses it, and completes form validity'],
    ]},
    'navigation/Tabs':{kind:'Tabs',sequence:'tabs-panel-selection',steps:[
      ['select-tab','[data-interaction-tab]:not(:disabled)','A different enabled tab selects and reveals only its associated panel'],
      ['keyboard-select-tab','[data-interaction-tab]:not(:disabled)','Orientation-aware arrow key selects another enabled tab and its associated panel'],
    ]},
    'motion/Lottie Player':{kind:'ParticleBackground',sequence:'lottie-play-pause-frame-reset',steps:[
      ['play-animation','[data-interaction-lottie-play]','Visible deterministic SVG animation enters playing state'],
      ['pause-animation','[data-interaction-lottie-pause]','Visible SVG animation enters paused state'],
      ['seek-visible-frame','[data-interaction-lottie-seek]','Frame control and progress output both show 50%; SVG remains visible'],
      ['reset-visible-frame','[data-interaction-lottie-seek]','Frame control and progress output return to 0%; SVG remains painted'],
    ]},
  }[identity];
  if(focused){
    const provenance={
      'forms/HotkeyInput':'Explicit focused action contract from ui/gohtmx/templates/ely-controls.html, ui/gohtmx/assets/ely-controls.js and ui/gohtmx/assets/ely-api-forms.css',
      'forms/ShortcutRecorder':'Explicit alias action contract from ui/gohtmx/components.json and the HotkeyInput template, handler and stylesheet',
      'account/SignupForm':'Explicit focused form contract from ui/gohtmx/templates/ely-api-forms.html and ui/gohtmx/assets/ely-api-forms.js',
      'navigation/Tabs':'Explicit selected-tab/panel contract from ui/gohtmx/templates/ely-api-interaction.html and ui/gohtmx/assets/ely-api-interaction.js',
      'motion/Lottie Player':'Explicit deterministic player contract from internal/gallery/advanced_interaction_fixtures.go, ui/gohtmx/templates/ely-api-interaction.html and ui/gohtmx/assets/ely-api-interaction.js',
    }[identity];
    const steps=focused.steps.map(([id,control,expectedState])=>({id,control,expectedState,event:'native Playwright action',source:{siteId:`focused-state:${identity}:${id}`,sourceAnchor:null,provenance}}));
    return {identity,kind:focused.kind,target:null,variant:identity.split('/')[1],focusedSequence:focused.sequence,steps,mappingGaps:[],requestedStateOnly:true,
      fixtureGuards:{component:identity,kind:focused.kind},scope:'Explicit finite focused sequence from the case fixture; separate from registered-check coverage, aliases, and all-catalog approval'};
  }
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
  if(contract.focusedSequence==='hotkey-record-clear-restore'){
    const input=root.locator('[data-ui-hotkey]'),glyph=root.locator('.ely-api-hotkey-glyph');
    assert.equal(await input.count(),1,'Hotkey case must expose one recorder input');
    assert.equal(await glyph.count(),1,'Hotkey case must expose its visible shortcut glyph');
    const original=await input.inputValue();
    await runStep('record-shortcut',async()=>{await input.focus();await input.press('Control+k');},async()=>{
      assert.equal(await input.inputValue(),'Ctrl+K','Control+K must be recorded in the field');
      const clearance=await input.evaluate(node=>{const glyph=node.closest('.ely-api-hotkey-control')?.querySelector('.ely-api-hotkey-glyph');if(!glyph)return null;const field=node.getBoundingClientRect(),mark=glyph.getBoundingClientRect(),style=getComputedStyle(node),reach=style.direction==='rtl'?field.right-mark.left:mark.right-field.left;return {padding:parseFloat(style.paddingInlineStart),reach,glyphVisible:glyph.getClientRects().length>0&&getComputedStyle(glyph).visibility!=='hidden'};});
      assert(clearance?.glyphVisible,'Shortcut glyph must remain visible while recording');
      assert(clearance.padding>clearance.reach,'Shortcut text inset must clear the painted glyph');
      return {value:await input.inputValue(),glyphClearance:clearance};
    });
    await runStep('clear-shortcut',()=>input.press('Backspace'),async()=>{assert.equal(await input.inputValue(),'','Backspace must clear the recorded shortcut');return {value:''};});
    await runStep('restore-shortcut',()=>input.press('Escape'),async()=>{assert.equal(await input.inputValue(),original,'Escape must restore the value captured on focus');return {value:original};});
    return;
  }
  if(contract.focusedSequence==='signup-terms-label'){
    const form=root.locator('form[data-suite-validate="SignupForm"]'),name=form.locator('input[name="name"]'),email=form.locator('input[name="email"]'),password=form.locator('input[name="password"]'),terms=form.locator('input[name="terms"]'),label=form.locator('label.ely-suite-terms'),submit=form.locator('button[type="submit"]');
    assert.equal(await form.count(),1,'Signup fixture form must be unique');
    await runStep('fill-name',()=>name.fill('Ada Lovelace'),async()=>{assert.equal(await name.inputValue(),'Ada Lovelace');return {name:await name.inputValue()};});
    await runStep('fill-email',()=>email.fill('ada@example.test'),async()=>{assert.equal(await email.inputValue(),'ada@example.test');assert.equal(await email.evaluate(node=>node.checkValidity()),true);return {email:await email.inputValue(),valid:true};});
    await runStep('fill-password',()=>password.fill('Example-only-123'),async()=>{assert.equal(await password.inputValue(),'Example-only-123');assert.equal(await form.evaluate(node=>node.checkValidity()),false,'Required terms must still block a complete signup draft');assert.equal(await terms.isChecked(),false);assert.equal(await submit.isDisabled(),true);return {passwordRules:await form.locator('[data-suite-rule]').evaluateAll(nodes=>nodes.map(node=>node.dataset.kept)),termsChecked:false,formValid:false,submitDisabled:true};});
    await runStep('accept-terms-label',()=>clickVisibleControl(label),async()=>{assert.equal(await terms.isChecked(),true,'Activating the visible terms label must check its control');assert.equal(await form.evaluate(node=>node.checkValidity()),true,'The required checkbox must complete native form validity');assert.equal(await submit.isDisabled(),false,'A complete valid signup draft must enable its submit control');assert.equal(await terms.evaluate(node=>document.activeElement===node),true,'Label activation must move focus to the checkbox');return {termsChecked:true,focused:true,formValid:true,submitDisabled:false};});
    return;
  }
  if(contract.focusedSequence==='tabs-panel-selection'){
    const tabs=root.locator('[data-interaction-tab]:not(:disabled)'),enabled=await tabs.count();
    assert(enabled>=2,'Tabs fixture must provide at least two enabled tabs');
    const selected=root.locator('[data-interaction-tab][aria-selected="true"]');
    assert.equal(await selected.count(),1,'Tabs fixture must begin with one selected tab');
    let targetIndex=0;if(await tabs.nth(0).getAttribute('aria-selected')==='true')targetIndex=1;
    const target=tabs.nth(targetIndex),forward=await target.evaluate(node=>node.closest('[role="tablist"]')?.getAttribute('aria-orientation')==='vertical'?'ArrowDown':'ArrowRight');
    const assertSelectedPanel=async expected=>{
      const chosen=root.locator('[data-interaction-tab][aria-selected="true"]'),panels=root.locator('[role="tabpanel"]:not([hidden])');
      assert.equal(await chosen.count(),1,'Exactly one tab remains selected');assert.equal(await panels.count(),1,'Exactly one associated tab panel remains visible');
      assert.equal(await chosen.getAttribute('aria-controls'),await panels.first().getAttribute('id'),'Visible panel must be the selected tab target');
      if(expected)assert.equal(await chosen.getAttribute('value'),expected);
      return {selected:await chosen.getAttribute('value'),panel:await panels.first().getAttribute('id'),visiblePanels:1};
    };
    await runStep('select-tab',()=>target.click(),async()=>{assert.equal(await target.getAttribute('aria-selected'),'true');return assertSelectedPanel(await target.getAttribute('value'));});
    await runStep('keyboard-select-tab',()=>target.press(forward),async()=>{const state=await assertSelectedPanel();assert.notEqual(state.selected,await target.getAttribute('value'),'Arrow navigation must move selection to another enabled tab');return {...state,key:forward};});
    return;
  }
  if(contract.focusedSequence==='lottie-play-pause-frame-reset'){
    const host=root.locator('[data-interaction-lottie]'),play=root.locator('[data-interaction-lottie-play]'),pause=root.locator('[data-interaction-lottie-pause]'),seek=root.locator('[data-interaction-lottie-seek]'),progress=root.locator('[data-interaction-lottie-progress]'),status=root.locator('[data-interaction-lottie-status]'),svg=root.locator('[data-lottie-canvas] svg');
    assert.equal(await host.getAttribute('data-lottie-autoplay'),'false','Deterministic fixture must not autoplay');
    assert.equal(await host.getAttribute('data-lottie-loop'),'false','Deterministic fixture must not loop');
    await svg.waitFor({state:'visible',timeout:5000});
    const visibleFrame=async()=>{
      assert(await svg.isVisible(),'Lottie SVG must remain visible');
      const frame=await svg.evaluate(node=>{const paths=[...node.querySelectorAll('path')];const painted=paths.filter(path=>{const box=path.getBBox(),style=getComputedStyle(path);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0&&style.fill!=='none';});return {pathCount:paths.length,paintedPathCount:painted.length};});
      assert(frame.paintedPathCount>0,'Current Lottie frame must contain a visible painted path');
      return frame;
    };
    await runStep('play-animation',()=>play.click(),async()=>{assert.equal((await status.textContent()).trim(),'Animation playing');const frame=await visibleFrame();return {status:(await status.textContent()).trim(),svgVisible:true,...frame};});
    await runStep('pause-animation',()=>pause.click(),async()=>{assert.equal((await status.textContent()).trim(),'Animation paused');const frame=await visibleFrame();return {status:(await status.textContent()).trim(),svgVisible:true,...frame};});
    await runStep('seek-visible-frame',async()=>{await seek.focus();await seek.press('Home');for(let index=0;index<50;index++)await seek.press('ArrowRight');},async()=>{assert.equal(await seek.inputValue(),'50');assert.equal((await progress.textContent()).trim(),'50%');const frame=await visibleFrame();return {frame:50,progress:(await progress.textContent()).trim(),svgVisible:true,...frame};});
    await runStep('reset-visible-frame',()=>seek.press('Home'),async()=>{assert.equal(await seek.inputValue(),'0');assert.equal((await progress.textContent()).trim(),'0%');const frame=await visibleFrame(),box=await svg.boundingBox();assert(box&&box.width>0&&box.height>0,'Reset frame must retain a painted SVG');return {frame:0,progress:(await progress.textContent()).trim(),svgVisible:true,svgBounds:box,...frame};});
    return;
  }
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
  const selectorAll='dialog[open],:popover-open,[role=dialog],[role=menu],[role=region],[data-ely-portal]';
  return [...document.querySelectorAll(selectorAll)]
    .filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0&&element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});})
    .map(element=>{
      const selector=selectorAll;
      const inside=node.contains(element),foreign=element.closest('[data-audit-main]>[data-ely-family],[data-audit-twin]>[data-ely-family]')||element.closest('[data-ely-family]');
      const explicitOwner=element.getAttribute('data-ely-owner')?.replace(/^#/,'');
      const scope=foreign&&!inside&&foreign!==node&&!owners.has(foreign.id)?'foreign-component':explicitOwner&&!owners.has(explicitOwner)?'foreign-portal-owner':owners.has(explicitOwner)?'portal-owner-attribute':references.has(element.id)?'trigger-reference':inside&&!element.matches('[role=region]')?'component-root':'unowned';
      const rect=element.getBoundingClientRect();
      return {tag:element.tagName,id:element.id||null,role:element.getAttribute('role'),text:(element.innerText||'').trim().slice(0,180),bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        nativeOpen:element.matches('dialog')?element.open:null,popoverOpen:element.matches(':popover-open'),locatorSelector:selector,locatorIndex:[...document.querySelectorAll(selector)].indexOf(element),
        ownerID:explicitOwner||null,checkedRootID:node.id,openerReferences:[...node.querySelectorAll('[aria-controls]')].filter(control=>(control.getAttribute('aria-controls')||'').split(/\s+/).includes(element.id)).map(control=>({id:control.id||null,ariaControls:control.getAttribute('aria-controls')})),
        ownershipScope:scope,owned:['component-root','portal-owner-attribute','trigger-reference'].includes(scope)};
    });
}
