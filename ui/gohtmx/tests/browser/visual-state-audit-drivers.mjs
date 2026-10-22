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

// Playwright's default caret hiding writes inline styles on every control,
// including twins; its cleanup can leave an added empty style attribute.
// Avoid that preparation rather than restoring over real application changes.
export const screenshotWithoutCaretMutation=(surface,options)=>surface.screenshot({...options,caret:'initial'});

// Keep the frozen baseline geometry helper; adapt only proven empty CSS clips,
// without changing the DOM, computed styles, or the baseline capture path.
const actionBounds=new Function('node',`
  const nativeStyle=window.getComputedStyle.bind(window);
  const getComputedStyle=element=>{
    const style=nativeStyle(element);
    return /^inset\\(50%(?: 50%){0,3}\\)$/.test(style.clipPath)?{display:'none'}:style;
  };
  return (${activeOutlineBounds.toString()})(node, (${captureBounds.toString()})(node));
`);

// Only the active owned control's simple outline; not generic shadow/paint padding.
export function activeOutlineBounds(node,bounds){
  const active=document.activeElement;
  if(!active||!node.contains(active))return bounds;
  const style=getComputedStyle(active),width=parseFloat(style.outlineWidth),offset=parseFloat(style.outlineOffset);
  const alpha=style.outlineColor.match(/\/\s*([\d.]+%?)\s*\)$/)?.[1]??style.outlineColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+%?)\s*\)$/)?.[1];
  if(style.outlineStyle==='none'||style.outlineStyle==='hidden'||width===0||style.outlineColor==='transparent'||(alpha!==undefined&&parseFloat(alpha)===0))return bounds;
  const gap=reason=>({...bounds,focusOutline:{status:'unsupported',reason}});
  if(active.closest('[data-ely-family]')!==node.closest('[data-ely-family]'))return gap('nested component focus ownership');
  if(style.outlineStyle==='auto'||!Number.isFinite(width)||!Number.isFinite(offset))return gap('unbounded outline style');
  if(active.getClientRects().length!==1)return gap('fragmented focus outline');
  const margin=Math.max(0,width+offset),r=active.getBoundingClientRect();
  const paint={left:r.left-margin,top:r.top-margin,right:r.right+margin,bottom:r.bottom+margin};
  for(let ancestor=active;ancestor;ancestor=ancestor.parentElement){
    const s=getComputedStyle(ancestor);
    if(s.display==='none'||Number(s.opacity)===0||s.contentVisibility==='hidden'||(ancestor===active&&s.visibility!=='visible'))return bounds;
    if(ancestor!==active&&s.visibility!=='visible')return gap('ancestor visibility overridden by visible focused child');
    if(s.transform!=='none'||s.perspective!=='none'||s.filter !== 'none'||s.clipPath!=='none'||s.clip!=='auto'||s.maskImage!=='none'||s.contain.split(/\s+/).some(value=>['paint','strict','content'].includes(value))||(s.zoom!=='normal'&&Number(s.zoom)!==1))return gap('complex outline geometry or clipping');
    if(ancestor===active)continue;
    const clipX=s.overflowX!=='visible',clipY=s.overflowY!=='visible';
    if(!clipX&&!clipY)continue;
    if((s.overflowX==='clip'||s.overflowY==='clip')&&s.overflowClipMargin!=='0px')return gap('nonzero overflow clip margin');
    if(['borderTopLeftRadius','borderTopRightRadius','borderBottomLeftRadius','borderBottomRightRadius'].some(key=>parseFloat(s[key])!==0))return gap('rounded ancestor clip');
    const box=ancestor.getBoundingClientRect(),left=box.left+ancestor.clientLeft,top=box.top+ancestor.clientTop;
    if(clipX){paint.left=Math.max(paint.left,left);paint.right=Math.min(paint.right,left+ancestor.clientWidth);}
    if(clipY){paint.top=Math.max(paint.top,top);paint.bottom=Math.min(paint.bottom,top+ancestor.clientHeight);}
  }
  if(paint.right<=paint.left||paint.bottom<=paint.top)return bounds;
  if(paint.left+scrollX<0||paint.top+scrollY<0)return gap('outline extends outside document camera');
  const left=Math.min(bounds.clip.x,Math.floor(paint.left+scrollX)),top=Math.min(bounds.clip.y,Math.floor(paint.top+scrollY));
  const right=Math.max(bounds.clip.x+bounds.clip.width,Math.ceil(paint.right+scrollX)),bottom=Math.max(bounds.clip.y+bounds.clip.height,Math.ceil(paint.bottom+scrollY));
  return {...bounds,clip:{x:left,y:top,width:right-left,height:bottom-top},
    extendsRoot:bounds.extendsRoot||paint.left<bounds.root.left||paint.right>bounds.root.right||paint.top<bounds.root.top||paint.bottom>bounds.root.bottom,
    viewportTruncated:bounds.viewportTruncated||paint.left<0||paint.top<0||paint.right>innerWidth||paint.bottom>innerHeight,
    focusOutline:{status:'bounded',width,offset,paint}};
}

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
  const rootSelector='[data-audit-main]>[data-ely-family],[data-audit-twin]>[data-ely-family],[data-audit-main]>[data-basic-component],[data-audit-twin]>[data-basic-component]';
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
  const {scroll,viewport}=await page.evaluate(()=>({scroll:{x:scrollX,y:scrollY},viewport:{width:innerWidth,height:innerHeight}}));
  // Same camera rule as the frozen baseline: document capture is only the fallback.
  const viewportClip={...bounds.clip,x:bounds.clip.x-scroll.x,y:bounds.clip.y-scroll.y};
  const fits=viewportClip.x>=0&&viewportClip.y>=0&&viewportClip.x+bounds.clip.width<=viewport.width&&viewportClip.y+bounds.clip.height<=viewport.height;
  const camera={fullPage:!fits,clip:fits?viewportClip:bounds.clip};
  const ownership=await root.evaluate(captureForeignPaint,{clip:bounds.clip,checkedRootID});
  const png=await screenshotWithoutCaretMutation(page,{path,...camera,animations:'disabled',scale:'css'});
  assert.equal(png.readUInt32BE(16),bounds.clip.width,'PNG width equals painted union');
  assert.equal(png.readUInt32BE(20),bounds.clip.height,'PNG height equals painted union');
  return {bounds:{...bounds,scroll,viewport,camera,coordinateSpace:'document clip; camera.clip is viewport-relative when fullPage=false'},png,...ownership};
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
  // MiniMap deliberately renders a different read-only control and takes an early return.
  const editorAliases=['EditorGutter','LineNumbers','FoldingControl','Ruler','IndentGuide','BracketMatcher','RainbowBrackets','MultiCursor','SelectionHighlight','StickyScroll','Breadcrumb','InlayHints','CodeLens','InlineDecoration'];
  const editor=identity==='editor/CodeEditor'||editorAliases.some(name=>identity===`editor/${name}`);
  const definition=contracts[editor?'editor/CodeEditor':identity];if(!definition)return null;
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
    fixtureGuards:{component:identity,kind:definition.kind,devtoolsSourceAbsent:identity!=='forms/PasswordInput',canvasSceneAbsent:identity==='files/ArchiveViewer',requiredEditor:editor}};
}

const settingsTargets={KeyboardShortcutsList:[1,'Keyboard'],ProxySettings:[2,'Network'],PrivacySettings:[3,'Privacy','telemetry'],NotificationSettings:[4,'Notifications','quiet'],StartupSettings:[5,'Startup','login'],StorageSettings:[6,'Storage'],ResetToDefault:[6,'Storage'],AdvancedSettings:[7,'Advanced','developer'],'DeveloperMode Toggle':[7,'Advanced','developer']};
export function requestedStateContract(identity){
  const canvasIdentity=['canvas/InfiniteCanvas','canvas/CanvasGrid','canvas/Guides','canvas/Ruler','canvas/ArtboardFrame','canvas/ZoomControls','canvas/ZoomIndicator','canvas/MiniMap'].includes(identity);
  const focused={
    'buttons/ActionSheet':{kind:'ActionSheet',sequence:'sheet-native-actions',steps:[
      ...['wallpaper','duplicate','delete'].flatMap(value=>[[`open-${value}`,'[data-interaction-dialog]','Native pointer opens the owned modal and focuses its enabled header Close control in actual DOM order'],[`choose-${value}`,`[data-interaction-sheet-action][value="${value}"]`,'One exact public action; native dialog closes and focus returns to its opener']]),
      ['open-cancel','[data-interaction-dialog]','Open the owned modal again and focus its header Close control'],['cancel-sheet','.ely-interaction__sheet-cancel','Native Cancel closes without any public action'],
      ['open-close','[data-interaction-dialog]','Open the owned modal again and focus its header Close control'],['close-sheet','dialog [aria-label="Close"]','Native close button closes without any public action'],
    ]},
    'buttons/BulkActionBar':{kind:'BulkActionBar',sequence:'bulk-canonical-zero',steps:[
      ['select-first','[data-interaction-bulk-add]','Actual initial zero becomes one; all count surfaces agree and bar is visible'],
      ['select-second','[data-interaction-bulk-add]','Selection becomes two through a second native pointer activation, not an initial-Value2 fixture'],
      ['move-selection','[data-ely-action="move"]','Exact move action/value; count remains two, no persistence claimed'],
      ['delete-selection','[data-ely-action="delete"]','Exact delete action/value; count remains two, no deletion fabricated'],
      ['clear-selection','[data-interaction-bulk-clear]','All counts become zero and bar hides; exact bulk change'],
      ['select-again','[data-interaction-bulk-add]','Hidden bar reopens with one selected'],
      ['clear-again','[data-interaction-bulk-clear]','Repeated clear restores zero consistently'],
    ]},
    'layout/Collapsible':{kind:'Collapsible',sequence:'native-disclosure',steps:[
      ['open-disclosure','summary','Native pointer opens the initially closed details; await captured native toggle and exact public open=true'],
      ['close-disclosure','summary','Native pointer closes details; await captured native toggle and exact public open=false'],
    ]},
    ...Object.fromEntries(['layout/Accordion','layout/AccordionItem'].map(identity=>[identity,{kind:'Accordion',sequence:'native-disclosure',steps:[
      ['open-second','details:nth-child(2) > summary','Second opens and first closes exclusively; await both exact public toggle actions'],
      ['open-third','details:nth-child(3) > summary','Third opens and second closes exclusively; await both exact public toggle actions'],
      ['close-third','details:nth-child(3) > summary','Third closes; all items closed; exact public toggle action'],
      ['reopen-first','details:nth-child(1) > summary','First reopens alone; exact public toggle action with actual selected alias identity'],
    ]}])),
    'buttons/Button':{kind:'Button',sequence:'button-public-boundary',steps:[
      ...['primary','secondary','outline','ghost','subtle','danger','link'].map(value=>[`click-${value}`,`button[value="${value}"]`,'Native click emits exactly the caller action/value; no form or persistence fabricated']),
      ['cancel-primary','button[value="primary"]','Canceling the public action prevents the originating native click default; no host operation is asserted'],
      ...['primary','secondary','outline','ghost','subtle','danger','link'].map(value=>[`disabled-${value}`,`button[value="${value}-disabled"]`,'Native HTMLButtonElement.click on an actually disabled control emits neither click nor public events']),
    ]},
    'forms/TextArea':{kind:'TextArea',sequence:'textarea-public-multiline',steps:[
      ['fill-multiline','textarea[data-ely-autoresize]','Native input preserves exact multiline caller text and grows height; no change before commit'],
      ['commit-multiline','textarea[data-ely-autoresize]','Native blur commits exactly one public change with actual name/type/value'],
      ['clear-text','textarea[data-ely-autoresize]','Native input clears caller text without fabricating required validation or host action'],
      ['commit-empty','textarea[data-ely-autoresize]','Native blur commits the exact empty value; optional field remains valid'],
    ]},
    'tooling/EventLogger':{kind:'EventLogger',sequence:'eventlogger-public-timestamps',steps:[
      ['coalesce-pointer','[data-tool-event-target]','Two public pointer moves coalesce; exact observed-event elapsed display'],
      ['capture-consumed-key','[data-tool-event-target] input','Capture-phase Ctrl+K survives child stopPropagation'],
      ['wheel-units','[data-tool-event-target]','Wheel delta and line units remain exact'],
      ['retain-fifty-keys','[data-tool-event-target] input','55 keys retain exactly newest 50 rows and their observed timestamps'],
    ]},
    'project/StatusSelect':{kind:'StatusSelect',sequence:'task-due-submit',steps:[
      ['change-due','input[type="date"][name="due"][data-project-property]','Native due edit emits current task property and complete form values; peers unchanged'],
      ['reveal-update','button[type="submit"]','Real Tab navigation from due reveals the focus-visible Update button; painted owned pixels are reachable'],
      ['submit-current-due','button[type="submit"]','Native Enter on the keyboard-revealed Update submits exact current values; unfocused pointer activation unsupported'],
    ]},
    'data/Tag':{kind:'Tag',sequence:'remove-four-tags',steps:[
      ['remove-design','[data-ely-tag-remove][value="design"]','Only Design removed; exact tag-remove payload'],
      ['remove-motion','[data-ely-tag-remove][value="motion"]','Only Motion removed; exact tag-remove payload'],
      ['remove-accessibility','[data-ely-tag-remove][value="accessibility"]','Only Accessibility removed; exact tag-remove payload'],
      ['remove-rust','[data-ely-tag-remove][value="rust"]','Only static Research, Pinned, Urgent remain'],
    ]},
    'menus/RadioMenuItem':{kind:'CheckboxMenuItem',sequence:'radio-groups-reselection',steps:[
      ['select-default','[data-interaction-menu-radio="default"][value="minimap"]','Exclusive default selection; density unchanged; settled change then action'],
      ['reselect-default','[data-interaction-menu-radio="default"][value="minimap"]','Reselection remains selected and notifies again'],
      ['select-density','[data-interaction-menu-radio="density"][value="compact"]','Exclusive density selection; default unchanged; settled change then action'],
      ['reselect-density','[data-interaction-menu-radio="density"][value="compact"]','Reselection remains selected and notifies again'],
    ]},
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
    'canvas/InfiniteCanvas':{kind:'InfiniteCanvas',sequence:'canvas-minimap-zoom-fit-hit-test',steps:[
      ['zoom-in','[data-cs-zoom-in]','Native hit-tested zoom action increases zoom and keeps the rendered world transform in sync'],
      ['fit-canvas','[data-cs-fit]','Fit centers and scales the actual rendered artboard union within the actual stage viewBox'],
      ['navigate-minimap','[data-cs-minimap]','Trusted pointer hit navigates to the point represented by the rendered minimap; target remains reachable'],
    ]},
  }[canvasIdentity?'canvas/InfiniteCanvas':identity];
  if(focused){
    const provenance={
      'buttons/ActionSheet':'internal/gallery/advanced_interaction_fixtures.go ActionSheet; ely-api-interaction.html native dialog/actions; ely-api.js interactionSheetAction dispatch exclusion; ely-api-interaction.js sheetAction/closeDialog; no host application callback execution',
      'buttons/BulkActionBar':'internal/gallery/advanced_interaction_fixtures.go explicitly SelectedCount0; ely-api-interaction.html effective-count rendering; ely-api-interaction.js bulk add/clear; separate initial Value2 render proof is TestBulkActionBarEffectiveInitialCount, NOT this gallery runtime fixture',
      'layout/Collapsible':'internal/gallery/advanced_foundation_fixtures.go Collapsible; ely-api-foundation.html native details; ely-api-foundation.js captured nonbubbling toggle emits change action asynchronously',
      'layout/Accordion':'internal/gallery/advanced_foundation_fixtures.go three AccordionItems; ely-api-foundation.html first details open; ely-api-foundation.js captured toggle enforces single-open before emitting change action',
      'layout/AccordionItem':'Explicit separate layout/AccordionItem inventory row resolves Accordion fixture; public identity remains layout/AccordionItem; no other alias promotion; ely-api-foundation.js native captured toggle contract',
      'buttons/Button':'internal/gallery/advanced_interaction_fixtures.go Button Groups; ui/gohtmx/templates/ely-api-interaction.html ely-api-buttons; ui/gohtmx/assets/ely-api.js click/emit; public cancelable event boundary only, not application onClick execution',
      'forms/TextArea':'internal/gallery/advanced_forms_fixtures.go TextArea; ui/gohtmx/templates/ely-api-forms.html TextArea; ui/gohtmx/assets/ely-api-forms.js input autoresize; ui/gohtmx/assets/ely-api.js change; no disabled/readOnly/required fixture is claimed',
      'tooling/EventLogger':'internal/gallery/advanced_native_tooling_fixtures.go EventLogger; ui/gohtmx/templates/ely-api-native-tooling.html EventLogger; ui/gohtmx/assets/ely-api-native-tooling.js receive/recordInput; exact global trace calibration remains separate',
      'project/StatusSelect':'ui/gohtmx/templates/ely-api-communication.html:108,115; ui/gohtmx/assets/ely-api-communication.css:296-297 focus-visible-only Update; ui/gohtmx/assets/ely-api-communication.js:258; ui/gohtmx/assets/ely-api.js submit handler',
      'data/Tag':'internal/gallery/advanced_data_fixtures.go Tag; ui/gohtmx/templates/ely-api-data.html ely-api-tag; ui/gohtmx/assets/ely-api-data.js tag-remove handler',
      'menus/RadioMenuItem':'docs/gohtmx/menu-alias-contracts.md; internal/gallery/assets/advanced-interaction-checks.js radioMenuItemCheck; ui/gohtmx/assets/ely-api-interaction.js radio handler',
      'forms/HotkeyInput':'Explicit focused action contract from ui/gohtmx/templates/ely-controls.html, ui/gohtmx/assets/ely-controls.js and ui/gohtmx/assets/ely-api-forms.css',
      'forms/ShortcutRecorder':'Explicit alias action contract from ui/gohtmx/components.json and the HotkeyInput template, handler and stylesheet',
      'account/SignupForm':'Explicit focused form contract from ui/gohtmx/templates/ely-api-forms.html and ui/gohtmx/assets/ely-api-forms.js',
      'navigation/Tabs':'Explicit selected-tab/panel contract from ui/gohtmx/templates/ely-api-interaction.html and ui/gohtmx/assets/ely-api-interaction.js',
      'motion/Lottie Player':'Explicit deterministic player contract from internal/gallery/advanced_interaction_fixtures.go, ui/gohtmx/templates/ely-api-interaction.html and ui/gohtmx/assets/ely-api-interaction.js',
      'canvas/InfiniteCanvas':'Eight explicit canvas inventory IDs resolve the canonical InfiniteCanvas fixture via internal/gallery/advanced.go with no canvas aliasFixtureProps overrides; ui/gohtmx/component.go preserves actual alias identity and canonical Kind; action behavior from ui/gohtmx/assets/ely-api-workspace-canvas.js; action geometry is read from rendered SVG, not a presumed fit percentage; each alias and profile requires its own runtime evidence',
    }[canvasIdentity?'canvas/InfiniteCanvas':identity];
    const steps=focused.steps.map(([id,control,expectedState])=>({id,control,expectedState,event:identity==='tooling/EventLogger'?'synthetic public DOM event via Playwright':id.startsWith('disabled-')?'native HTMLButtonElement.click (disabled negative; not trusted pointer input)':'native Playwright action',source:{siteId:`focused-state:${identity}:${id}`,sourceAnchor:null,provenance}}));
    return {identity,kind:focused.kind,target:null,variant:identity.split('/')[1],focusedSequence:focused.sequence,steps,mappingGaps:[],requestedStateOnly:true,
      fixtureGuards:{component:identity,kind:focused.kind},...(identity==='project/StatusSelect'?{inputSupport:{submit:'real Tab reveal followed by native Enter',unfocusedPointer:'unsupported: Update is 1px and clipped until focus-visible'}}:{}),scope:canvasIdentity?`Only the separate gallery:${identity} three-action focused sequence; source-defined contract is not runtime approval; all eight IDs across four profiles require 32 separate case/profile runs`: 'Explicit finite focused sequence from the case fixture; separate from registered-check coverage, aliases, and all-catalog approval'+(identity==='tooling/EventLogger'?'; four grouped scenario checkpoints, not per-event pixel coverage or trusted physical input; exact trace calibration remains separate':identity==='project/StatusSelect'?'; keyboard-only submit; no unfocused pointer activation approval':'')};
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

// Independent finite expected rows, not production recordInput or a clock override.
export function assertEventLoggerPublicState(stage,observation){
  const {rawEvents,rows,initialEmpty,consumedKeys,bubbledKeys}=observation;
  const counts={'coalesce-pointer':2,'capture-consumed-key':3,'wheel-units':4,'retain-fifty-keys':59};
  assert(Object.hasOwn(counts,stage),'Unknown EventLogger stage');
  assert.equal(initialEmpty,true,'An existing row makes the internal timestamp origin unobservable');
  assert.equal(rawEvents.length,counts[stage],'Unexpected public events cannot be silently ignored');
  assert(rawEvents.every(event=>event.isTrusted===false),'This finite contract covers synthetic public events only');
  assert(rawEvents.every((event,index)=>Number.isFinite(event.timeStamp)&&event.timeStamp>=0&&(!index||event.timeStamp>=rawEvents[index-1].timeStamp)),'Public event timestamps must be finite, nonnegative and ordered');
  assert.deepEqual(rawEvents.slice(0,2).map(event=>[event.type,event.x,event.y]),[['pointermove',10,12],['pointermove',11,13]]);
  const expected=[{event:rawEvents[1],message:'move to 11, 13 ×2'}];
  if(rawEvents.length>=3){
    assert.deepEqual([rawEvents[2].type,rawEvents[2].key,rawEvents[2].ctrlKey],['keydown','K',true]);
    assert.equal(consumedKeys,1);assert.equal(bubbledKeys,stage==='retain-fifty-keys'?55:0,'Ctrl+K must not reach the root bubble listener');
    expected.unshift({event:rawEvents[2],message:'key down ctrl+K'});
  }
  if(rawEvents.length>=4){
    assert.deepEqual([rawEvents[3].type,rawEvents[3].deltaX,rawEvents[3].deltaY,rawEvents[3].deltaMode],['wheel',0,4,1]);
    expected.unshift({event:rawEvents[3],message:'wheel 0, 4 lines'});
  }
  if(stage==='retain-fifty-keys'){
    assert.deepEqual(rawEvents.slice(4).map(event=>[event.type,event.key,event.ctrlKey]),Array.from({length:55},(_,index)=>['keydown',String(index),false]));
    expected.splice(0,expected.length,...Array.from({length:50},(_,index)=>({event:rawEvents[58-index],message:`key down ${54-index}`})));
  }
  assert.equal(rows.length,expected.length,'Exact retention/coalescing row count');
  expected.forEach(({event,message},index)=>{
    const time=`+${(Math.max(0,event.timeStamp-rawEvents[0].timeStamp)/1000).toFixed(2)}s`;
    assert.deepEqual(rows[index],{time,message,text:time+message},'Displayed timestamp and message must match the observed event; no normalization or tolerance');
  });
  return {...observation,timestampOrigin:rawEvents[0].timeStamp,timestampRule:'first accepted public event.timeStamp; exact two-decimal elapsed seconds',eventProvenance:'Synthetic public DOM events through actual component listeners; trusted physical input is not established'};
}

export function assertFoundationPublicEvents(identity,id,observed,{value}){
  assert.equal(typeof id,'string');assert(id.length>0);
  if(identity==='buttons/Button')assert.deepEqual(observed.map(event=>[event.type,event.detail]),[['ely:action',{id,component:identity,action:value,value,formData:null,values:[]}]]);
  else if(identity==='forms/TextArea')assert.deepEqual(observed.map(event=>[event.type,event.detail]),[['ely:change',{id,component:identity,name:'caller_value',value,checked:undefined,type:'textarea'}]]);
  else assert.fail('No finite foundation public event contract for '+identity);
  return observed;
}

export function assertStatusSelectDueEvents(observed,{id,identity,entries,nativeChangeCount}){
  assert(Number.isInteger(nativeChangeCount)&&nativeChangeCount>=1,'Due commit requires an observed native change');
  assert.equal(observed.length,nativeChangeCount*3,'Every native change must retain exactly one generic change, task change and action triplet');
  const expected=[
    ['ely:change',{id,component:identity,name:'due',value:'2026-10-20',checked:false,type:'date'}],
    ['ely:change',{id,component:identity,name:'due',value:'2026-10-20',taskId:'brief'}],
    ['ely:action',{id,component:identity,action:'update-task',taskId:'brief',field:'due',value:'2026-10-20',formData:entries,values:entries}],
  ];
  for(let index=0;index<observed.length;index+=3)assert.deepEqual(observed.slice(index,index+3).map(event=>[event.type,event.detail]),expected,'Each native change retains every public event in listener-registration order');
  return observed;
}

export function assertMinimapViewport(before,actual,{bounds,ratio,point}){
  const zoom=before.view.zoom,expected={zoom,
    x:bounds.x+(point.x-10)/ratio-before.stage.width/zoom/2,
    y:bounds.y+(point.y-10)/ratio-before.stage.height/zoom/2};
  for(const key of ['zoom','x','y'])assert(Math.abs(actual[key]-expected[key])<=1e-6,`Minimap ${key} must preserve pre-click viewport semantics: expected ${expected[key]}, got ${actual[key]}`);
  return expected;
}

export async function runRequestedStateActions(contract,root,runStep){
  if(['task-due-submit','remove-four-tags','radio-groups-reselection','eventlogger-public-timestamps','button-public-boundary','textarea-public-multiline','canvas-minimap-zoom-fit-hit-test','sheet-native-actions','bulk-canonical-zero','native-disclosure'].includes(contract.focusedSequence)){
    const identity=await root.getAttribute('data-ely-component');
    assert.equal(identity,contract.identity,'Exact alias identity is required');
    assert.equal(await root.getAttribute('data-ely-kind'),contract.kind);
    await root.evaluate(node=>{
      node.__visualControlEvents=[];
      for(const type of ['ely:change','ely:action'])node.addEventListener(type,event=>{
        if(event.target!==node)return;
        const detail={...event.detail};
        if(detail.formData instanceof FormData)detail.formData=[...detail.formData];
        const trigger=node.querySelector('[data-interaction-menu]'),panel=trigger&&node.querySelector('#'+CSS.escape(trigger.getAttribute('aria-controls')));
        node.__visualControlEvents.push({type,detail,panelClosed:panel?.hidden,focusReturned:trigger?document.activeElement===trigger:undefined});
      });
    });
    const events=()=>root.evaluate(node=>node.__visualControlEvents);
    const twinState=()=>root.evaluate(node=>{
      const twin=node.closest('[data-audit-name]')?.querySelector('[data-audit-twin] > [data-ely-family]');
      if(!twin)throw new Error('Independent audit twin is required');
      return {html:twin.innerHTML,fields:[...twin.querySelectorAll('input,select,textarea')].map(field=>[field.name,field.value,field.checked])};
    });
    const initialTwin=await twinState(),id=await root.getAttribute('id');
    let cursor=0;
    const begin=async()=>{cursor=(await events()).length;};
    const fresh=async()=>{assert.deepEqual(await twinState(),initialTwin,'Public actions must preserve the independent twin');return (await events()).slice(cursor);};
    if(['sheet-native-actions','bulk-canonical-zero','native-disclosure'].includes(contract.focusedSequence)){
      await root.evaluate(node=>{
        node.__visualFiniteClicks=[];
        node.__visualFiniteClickObserver=event=>{const target=event.target.closest('button,summary');if(target?.closest('[data-ely-family]')===node)node.__visualFiniteClicks.push({trusted:event.isTrusted,tag:target.tagName,value:target.value,label:target.textContent});};
        node.addEventListener('click',node.__visualFiniteClickObserver);
      });
      const clicks=()=>root.evaluate(node=>node.__visualFiniteClicks);
      let clickCursor=0;
      const start=async()=>{await begin();clickCursor=(await clicks()).length;};
      const pointer=async()=>{const activated=(await clicks()).slice(clickCursor);assert.equal(activated.length,1,'Exactly one native control click is required');assert.equal(activated[0].trusted,true,'Real controls require trusted pointer input');return activated[0];};
      try{
        if(contract.focusedSequence==='sheet-native-actions'){
          const opener=root.locator('[data-interaction-dialog]'),dialog=root.locator('dialog.is-sheet');
          assert.equal(await opener.count(),1);assert.equal(await dialog.count(),1);assert.equal(await opener.isEnabled(),true);
          const headerClose=dialog.locator('header > button[data-interaction-close][aria-label="Close"]');
          assert.equal(await headerClose.count(),1);assert.equal(await headerClose.isEnabled(),true);
          assert.equal(await dialog.evaluate(node=>node.open),false);assert.equal(await dialog.getAttribute('id'),await opener.getAttribute('data-interaction-dialog'));
          assert.deepEqual(await dialog.locator('[data-interaction-sheet-action]').evaluateAll(nodes=>nodes.map(node=>[node.value,node.dataset.elyAction,node.disabled])),[['wallpaper','set-wallpaper',false],['duplicate','duplicate',false],['delete','delete',false]]);
          for(const value of ['wallpaper','duplicate','delete','cancel','close']){
            await runStep(`open-${value}`,async()=>{await start();return clickVisibleControl(opener);},async()=>{await pointer();assert.deepEqual(await fresh(),[]);assert.equal(await dialog.evaluate(node=>node.open&&node.matches(':modal')),true);assert.equal(await headerClose.evaluate(node=>document.activeElement===node),true,'Actual DOM-first enabled header Close control receives focus');return {open:true,focusedControl:'owned header Close'};});
            const action=['wallpaper','duplicate','delete'].includes(value),control=action?dialog.locator(`[data-interaction-sheet-action][value="${value}"]`):value==='cancel'?dialog.locator('.ely-interaction__sheet-cancel'):dialog.locator('[aria-label="Close"]');
            await runStep(action?`choose-${value}`:value==='cancel'?'cancel-sheet':'close-sheet',async()=>{await start();return clickVisibleControl(control);},async()=>{
              await pointer();await root.page().waitForFunction(node=>!node.open,await dialog.elementHandle());await root.page().waitForFunction(node=>document.activeElement===node,await opener.elementHandle());
              const observed=await fresh(),expected=action?[['ely:action',{id,component:identity,action:value==='wallpaper'?'set-wallpaper':value,value}]]:[];
              assert.deepEqual(observed.map(event=>[event.type,event.detail]),expected,'Sheet selection emits once; close/cancel emits no action');return {open:false,focusReturned:true,events:observed};
            });
          }
        }else if(contract.focusedSequence==='bulk-canonical-zero'){
          const host=root.locator('[data-interaction-bulk]'),bar=host.locator('.ely-interaction__bar.is-bulk');
          const checkCount=async count=>{assert.equal(await host.getAttribute('data-interaction-bulk-count'),String(count));assert.equal(await host.locator('[data-interaction-bulk-count]').textContent(),String(count));assert.equal(await host.locator('[data-interaction-bulk-summary]').textContent(),`${count} selected`);assert.equal(await bar.evaluate(node=>node.hidden),count===0);};
          assert.equal(await host.count(),1);await checkCount(0);
          assert.deepEqual(await bar.locator('[data-ely-action]').evaluateAll(nodes=>nodes.map(node=>[node.value,node.dataset.elyAction,node.disabled])),[['move','move',false],['delete','delete',false]]);
          for(const [label,selector,count,action] of [['select-first','[data-interaction-bulk-add]',1],['select-second','[data-interaction-bulk-add]',2],['move-selection','[data-ely-action="move"]',2,'move'],['delete-selection','[data-ely-action="delete"]',2,'delete'],['clear-selection','[data-interaction-bulk-clear]',0],['select-again','[data-interaction-bulk-add]',1],['clear-again','[data-interaction-bulk-clear]',0]]){
            await runStep(label,async()=>{await start();return clickVisibleControl(host.locator(selector));},async()=>{await pointer();await checkCount(count);const observed=await fresh();assert.deepEqual(observed.map(event=>[event.type,event.detail]),action?[['ely:action',{id,component:identity,action,value:action,formData:null,values:[]}]]:[['ely:change',{id,component:identity,name:'bulk',value:String(count),selected:count>0}]]);return {count,events:observed,fixtureScope:'Canonical initial SelectedCount0 only; reaching2 does not prove an initial Value2 fixture'};});
          }
        }else{
          await root.page().evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
          const accordion=contract.kind==='Accordion',details=accordion?root.locator('[data-foundation-accordion] > details'):root.locator('details');
          assert.equal(await details.count(),accordion?3:1);assert.deepEqual(await details.evaluateAll(nodes=>nodes.map(node=>node.open)),accordion?[true,false,false]:[false]);
          if(accordion)assert.deepEqual(await details.locator('summary').allTextContents(),['What is Ely?','Does it animate?','Can I theme it?']);
          const specs=accordion?[['open-second',1,[false,true,false],[true,false]],['open-third',2,[false,false,true],[true,false]],['close-third',2,[false,false,false],[false]],['reopen-first',0,[true,false,false],[true]]]:[['open-disclosure',0,[true],[true]],['close-disclosure',0,[false],[false]]];
          for(const [label,index,state,opens] of specs){
            await runStep(label,async()=>{await start();return clickVisibleControl(details.nth(index).locator('summary'));},async()=>{
              await root.page().waitForFunction(({id,cursor,state,count,accordion})=>{const node=document.getElementById(id),items=[...node.querySelectorAll(accordion?'[data-foundation-accordion] > details':'details')];return JSON.stringify(items.map(item=>item.open))===JSON.stringify(state)&&node.__visualControlEvents.slice(cursor).length===count;},{id,cursor,state,count:opens.length,accordion});
              await pointer();assert.deepEqual(await details.evaluateAll(nodes=>nodes.map(node=>node.open)),state);const observed=await fresh();assert.deepEqual(observed.map(event=>[event.type,event.detail]),opens.map(open=>['ely:action',{id,component:identity,action:'change',open}]),'Retain every asynchronous native toggle action with its exact alias identity');return {openStates:state,events:observed};
            });
          }
        }
      }finally{await root.evaluate(node=>{node.removeEventListener('click',node.__visualFiniteClickObserver);delete node.__visualFiniteClickObserver;});}
      return;
    }
    if(contract.focusedSequence==='canvas-minimap-zoom-fit-hit-test'){
      const scene=()=>root.evaluate(node=>{
        const host=node.querySelector('[data-ws-canvas-scene]'),stage=host?.querySelector('[data-cs-stage]'),world=host?.querySelector('[data-cs-world]'),map=host?.querySelector('[data-cs-minimap]');
        if(!host||!stage||!world||!map)throw new Error('InfiniteCanvas must render its scene, stage, world and minimap');
        const match=(world.getAttribute('transform')||'').match(/^scale\(([-+\d.e]+)\) translate\(([-+\d.e]+) ([-+\d.e]+)\)$/);
        if(!match)throw new Error('Rendered canvas world transform is not the public scale/translate form');
        const artboards=[...world.querySelectorAll('[data-cs-artboard]')].map(element=>({id:element.getAttribute('data-cs-artboard'),x:Number(element.getAttribute('x')),y:Number(element.getAttribute('y')),w:Number(element.getAttribute('width')),h:Number(element.getAttribute('height'))}));
        const rect=element=>{const value=element.getBoundingClientRect();return {left:value.left,top:value.top,right:value.right,bottom:value.bottom,width:value.width,height:value.height};};
        return {kind:host.dataset.sceneKind,stage:{width:stage.viewBox.baseVal.width,height:stage.viewBox.baseVal.height},view:{zoom:Number(match[1]),x:-Number(match[2]),y:-Number(match[3])},artboards,shapes:world.querySelectorAll('[data-cs-shape]').length,guides:world.querySelectorAll('[data-cs-guide]').length,grid:host.querySelectorAll('[data-cs-grid] circle').length,rulers:host.querySelectorAll('[data-cs-rulers] text').length,mapBounds:JSON.parse(map.dataset.bounds),mapRect:rect(map),viewRect:rect(host.querySelector('[data-cs-view]')),zoomRect:rect(host.querySelector('[data-cs-zoom]')),zoomTargets:[...host.querySelectorAll('[data-cs-zoom] button')].map(rect)};
      });
      const initial=await scene();
      assert.equal(initial.kind,'InfiniteCanvas','Exact canonical fixture kind is required');
      assert.deepEqual(initial.stage,{width:820,height:460},'Canonical InfiniteCanvas stage geometry changed');
      assert.deepEqual(initial.view,{x:-60,y:-60,zoom:.7},'Initial viewport must match the canonical scene contract');
      assert.deepEqual(initial.artboards.map(({id})=>id),['home','detail'],'The rendered fixture must contain its two canonical artboards');
      assert.equal(initial.shapes,8,'The combined fixture must retain its eight rendered shapes');
      assert.equal(initial.guides,2,'Both canonical guides must be painted');
      assert(initial.grid>0&&initial.rulers>0,'The grid and ruler aliases must both render content');
      const union=rects=>{const x=Math.min(...rects.map(rect=>rect.x)),y=Math.min(...rects.map(rect=>rect.y));return {x,y,w:Math.max(...rects.map(rect=>rect.x+rect.w))-x,h:Math.max(...rects.map(rect=>rect.y+rect.h))-y};};
      const close=(actual,expected,message)=>assert(Math.abs(actual-expected)<=1e-6,message+`: expected ${expected}, got ${actual}`);
      const initialBounds=union(initial.artboards);
      for(const key of ['x','y','w','h'])close(initial.mapBounds.bounds[key],initialBounds[key],`Rendered minimap ${key} bound must cover the rendered artboard union`);
      assert(initial.mapBounds.ratio>0,'Rendered minimap must have a positive scene-to-map scale');
      const assertWorld=async expected=>{
        const current=await scene();
        close(current.view.zoom,expected.zoom,'Rendered canvas zoom must match the action state');
        close(current.view.x,expected.x,'Rendered canvas x must match the action state');
        close(current.view.y,expected.y,'Rendered canvas y must match the action state');
        return current;
      };
      const controls=['[data-cs-zoom-out]','[data-cs-zoom-reset]','[data-cs-zoom-in]','[data-cs-fit]'];
      assert.equal(await root.locator('[data-cs-zoom] button').count(),controls.length,'All four zoom targets must be present');
      const overlap=(a,b)=>a.left<b.right&&b.left<a.right&&a.top<b.bottom&&b.top<a.bottom;
      assert(!overlap(initial.zoomRect,initial.mapRect),'Zoom controls and minimap must not overlap');
      for(let left=0;left<initial.zoomTargets.length;left++)for(let right=left+1;right<initial.zoomTargets.length;right++)assert(!overlap(initial.zoomTargets[left],initial.zoomTargets[right]),'Zoom control targets must not overlap each other');
      assert(initial.mapRect.left>=initial.viewRect.left&&initial.mapRect.right<=initial.viewRect.right&&initial.mapRect.top>=initial.viewRect.top&&initial.mapRect.bottom<=initial.viewRect.bottom,'Minimap must remain inside its rendered canvas view');
      for(const selector of controls){
        const target=root.locator(selector);assert.equal(await target.count(),1,`${selector} must be unique`);
        const hit=await target.evaluate(node=>{const rect=node.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,element=document.elementFromPoint(x,y);return {reachable:!!element&&(element===node||node.contains(element)),disabled:node.disabled};});
        assert.equal(hit.reachable,true,`${selector} center must be an owned hit target`);assert.equal(hit.disabled,false,`${selector} must be enabled`);
      }
      const mapHit=await root.locator('[data-cs-minimap]').evaluate(node=>{const rect=node.getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2,element=document.elementFromPoint(x,y);return !!element&&(element===node||node.contains(element));});
      assert.equal(mapHit,true,'Minimap center must be an owned hit target');
      await root.evaluate(node=>{node.__visualCanvasClicks=[];node.__visualCanvasClickObserver=event=>{if(event.target.closest?.('[data-cs-minimap]'))node.__visualCanvasClicks.push({trusted:event.isTrusted,x:event.clientX,y:event.clientY});};node.addEventListener('click',node.__visualCanvasClickObserver,true);});
      try{
        let beforeZoom;
        await runStep('zoom-in',async()=>{await begin();beforeZoom=await scene();return clickVisibleControl(root.locator('[data-cs-zoom-in]'));},async()=>{
          const observed=await fresh();assert.deepEqual(observed.map(event=>event.type),['ely:action']);
          const detail=observed[0].detail;assert.equal(detail.id,id);assert.equal(detail.component,identity);assert.equal(detail.action,'change-viewport');assert(detail.scene?.view,'Viewport action must carry the public scene view');
          const stops=[.1,.25,.5,.75,1,1.5,2,3,4,6,8],zoom=stops.find(value=>value>beforeZoom.view.zoom+.001)??beforeZoom.view.zoom,center={x:beforeZoom.stage.width/2,y:beforeZoom.stage.height/2};
          const expected={zoom,x:beforeZoom.view.x+center.x/beforeZoom.view.zoom-center.x/zoom,y:beforeZoom.view.y+center.y/beforeZoom.view.zoom-center.y/zoom};
          close(detail.scene.view.zoom,expected.zoom,'Zoom-in must advance exactly one canonical zoom stop from the pre-click state');close(detail.scene.view.x,expected.x,'Zoom-in must preserve the pre-click center anchor');close(detail.scene.view.y,expected.y,'Zoom-in must preserve the pre-click center anchor');
          await assertWorld(detail.scene.view);return {action:detail.action,view:detail.scene.view,expected,preClick:beforeZoom.view,events:observed};
        });
        const afterZoom=await scene();
        await runStep('fit-canvas',async()=>{await begin();return clickVisibleControl(root.locator('[data-cs-fit]'));},async()=>{
          const observed=await fresh();assert.deepEqual(observed.map(event=>event.type),['ely:action']);
          const detail=observed[0].detail;assert.equal(detail.id,id);assert.equal(detail.component,identity);assert.equal(detail.action,'change-viewport');assert(detail.scene?.view,'Fit action must carry the public scene view');
          const bounds=union(afterZoom.artboards),margin=48,zoom=Math.max(.1,Math.min(1,Math.min(Math.max(1,afterZoom.stage.width-2*margin)/Math.max(1,bounds.w),Math.max(1,afterZoom.stage.height-2*margin)/Math.max(1,bounds.h))));
          const expected={zoom,x:bounds.x+bounds.w/2-afterZoom.stage.width/2/zoom,y:bounds.y+bounds.h/2-afterZoom.stage.height/2/zoom};
          close(detail.scene.view.zoom,expected.zoom,'Fit zoom must be derived from rendered artboards and stage dimensions');close(detail.scene.view.x,expected.x,'Fit x must center rendered artboards');close(detail.scene.view.y,expected.y,'Fit y must center rendered artboards');
          await assertWorld(detail.scene.view);return {action:detail.action,view:detail.scene.view,expected,geometry:{stage:afterZoom.stage,artboards:afterZoom.artboards}};
        });
        let beforeMinimap;
        await runStep('navigate-minimap',async()=>{await begin();beforeMinimap=await scene();return clickVisibleControl(root.locator('[data-cs-minimap]'));},async()=>{
          const observed=await fresh();assert.deepEqual(observed.map(event=>event.type),['ely:action']);
          const detail=observed[0].detail;assert.equal(detail.id,id);assert.equal(detail.component,identity);assert.equal(detail.action,'change-viewport');assert(detail.scene?.view,'Minimap action must carry the public scene view');
          const clicks=await root.evaluate(node=>node.__visualCanvasClicks);assert.equal(clicks.length,1,'Exactly one native minimap pointer click must be observed');
          const click=clicks[0];assert.equal(click.trusted,true,'Minimap activation must use a trusted native pointer click');
          const point=await root.locator('[data-cs-minimap]').evaluate((map,click)=>{const local=new DOMPoint(click.x,click.y).matrixTransform(map.getScreenCTM().inverse());return {x:local.x,y:local.y};},click);
          const expected=assertMinimapViewport(beforeMinimap,detail.scene.view,{bounds:beforeMinimap.mapBounds.bounds,ratio:beforeMinimap.mapBounds.ratio,point});
          await assertWorld(detail.scene.view);return {action:detail.action,view:detail.scene.view,expected,pointer:click};
        });
      }finally{await root.evaluate(node=>{node.removeEventListener('click',node.__visualCanvasClickObserver,true);delete node.__visualCanvasClickObserver;delete node.__visualCanvasClicks;});}
      return;
    }
    if(['button-public-boundary','textarea-public-multiline'].includes(contract.focusedSequence)){
      await root.evaluate(node=>{
        node.__visualNativeControls=[];
        node.__visualNativeObserver=event=>node.__visualNativeControls.push({type:event.type,value:event.target.value,isTrusted:event.isTrusted,defaultPrevented:event.defaultPrevented});
        for(const type of ['click','input','change'])node.addEventListener(type,node.__visualNativeObserver);
      });
      const native=()=>root.evaluate(node=>node.__visualNativeControls);
      try{
        if(contract.focusedSequence==='button-public-boundary'){
          assert.equal(await root.locator('button').count(),14);
          for(const value of ['primary','secondary','outline','ghost','subtle','danger','link']){
            const control=root.locator(`button[value="${value}"]`);
            assert.equal(await control.isEnabled(),true);assert.equal(await control.getAttribute('data-ely-action'),value);
            await runStep(`click-${value}`,async()=>{await begin();await control.click();},async()=>{
              const observed=await fresh();assertFoundationPublicEvents(identity,id,observed,{value});
              assert.deepEqual((await native()).at(-1),{type:'click',value,isTrusted:true,defaultPrevented:false});return {events:observed};
            });
          }
          await runStep('cancel-primary',async()=>{
            await begin();await root.evaluate(node=>{node.__visualCancelAction=event=>event.preventDefault();node.addEventListener('ely:action',node.__visualCancelAction);});
            try{await root.locator('button[value="primary"]').click();}
            finally{await root.evaluate(node=>{node.removeEventListener('ely:action',node.__visualCancelAction);delete node.__visualCancelAction;});}
          },async()=>{const observed=await fresh();assertFoundationPublicEvents(identity,id,observed,{value:'primary'});assert.deepEqual((await native()).at(-1),{type:'click',value:'primary',isTrusted:true,defaultPrevented:true});return {events:observed,scope:'Public cancellation only; application onClick callback not executed by harness'};});
          for(const value of ['primary','secondary','outline','ghost','subtle','danger','link']){
            const control=root.locator(`button[value="${value}-disabled"]`);assert.equal(await control.isDisabled(),true);
            let before;
            await runStep(`disabled-${value}`,async()=>{await begin();before=await native();await control.evaluate(node=>node.click());},async()=>{assert.deepEqual(await fresh(),[]);assert.deepEqual(await native(),before);return {disabled:true,scope:'native disabled DOM click; no trusted pointer action claimed'};});
          }
        }else{
          const field=root.locator('textarea[data-ely-autoresize]');assert.equal(await field.count(),1);
          const initial=await field.evaluate(node=>({name:node.name,value:node.value,disabled:node.disabled,readOnly:node.readOnly,required:node.required,rows:node.rows}));
          assert.deepEqual(initial,{name:'caller_value',value:'',disabled:false,readOnly:false,required:false,rows:3});
          const initialHeight=await field.evaluate(node=>node.getBoundingClientRect().height);
          let multilineHeight;
          for(const [suffix,value] of [['multiline','one\ntwo\nthree\nfour'],['empty','']]){
            await runStep(suffix==='multiline'?'fill-multiline':'clear-text',async()=>{await begin();await field.fill(value);},async()=>{
              assert.deepEqual(await fresh(),[]);assert.equal(await field.inputValue(),value);
              const painted=await field.evaluate(node=>({height:parseFloat(node.style.height),scrollHeight:node.scrollHeight,valid:node.checkValidity()}));
              assert(painted.height>0&&painted.height<=600&&Math.abs(painted.height-Math.min(600,painted.scrollHeight))<=2,'Textarea autoresize follows its actual scroll height');assert.equal(painted.valid,true);
              const height=await field.evaluate(node=>node.getBoundingClientRect().height);
              if(suffix==='multiline'){assert(height>initialHeight,'Four lines must grow the initial three-row fixture');multilineHeight=height;}
              else assert(height<multilineHeight,'Clearing the fixture must shrink its multiline height');
              assert.deepEqual((await native()).at(-1),{type:'input',value,isTrusted:true,defaultPrevented:false});return {value,painted};
            });
            await runStep(`commit-${suffix}`,async()=>{await begin();await field.press('Tab');},async()=>{const observed=await fresh();assertFoundationPublicEvents(identity,id,observed,{value});assert.deepEqual((await native()).at(-1),{type:'change',value,isTrusted:true,defaultPrevented:false});return {value,events:observed};});
          }
        }
      }finally{await root.evaluate(node=>{for(const type of ['click','input','change'])node.removeEventListener(type,node.__visualNativeObserver);delete node.__visualNativeObserver;});}
      return;
    }
    if(contract.focusedSequence==='eventlogger-public-timestamps'){
      await root.evaluate(node=>{
        const target=node.querySelector('[data-tool-event-target]'),log=node.querySelector('[data-tool-event-log]');
        if(!target||!log||log.querySelector('time')||!log.querySelector('[data-tool-event-empty]'))throw new Error('EventLogger requires an empty observable timestamp origin');
        const proof=node.__visualEventLogger={rawEvents:[],initialEmpty:true,consumedKeys:0,bubbledKeys:0};
        proof.observe=event=>{if(!target.contains(event.target))return;const rect=target.getBoundingClientRect();proof.rawEvents.push({type:event.type,timeStamp:event.timeStamp,isTrusted:event.isTrusted,x:Number.isFinite(event.clientX)?Math.round(event.clientX-rect.left):undefined,y:Number.isFinite(event.clientY)?Math.round(event.clientY-rect.top):undefined,key:event.key,ctrlKey:event.ctrlKey,deltaX:event.deltaX,deltaY:event.deltaY,deltaMode:event.deltaMode});};
        proof.bubble=()=>proof.bubbledKeys++;
        for(const type of ['pointermove','pointerdown','pointerup','wheel','keydown','keyup'])node.addEventListener(type,proof.observe,true);
        node.addEventListener('keydown',proof.bubble);
      });
      try{
        for(const stage of contract.steps.map(step=>step.id))await runStep(stage,()=>root.evaluate((node,stage)=>{
          const target=node.querySelector('[data-tool-event-target]'),field=target.querySelector('input'),proof=node.__visualEventLogger;
          if(stage==='coalesce-pointer'){
            const rect=target.getBoundingClientRect();
            for(const [x,y]of [[10,12],[11,13]])target.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.left+x,clientY:rect.top+y}));
          }else if(stage==='capture-consumed-key'){
            const stop=event=>{proof.consumedKeys++;event.stopPropagation();};field.addEventListener('keydown',stop);
            try{field.dispatchEvent(new KeyboardEvent('keydown',{key:'K',ctrlKey:true,bubbles:true,cancelable:true}));}
            finally{field.removeEventListener('keydown',stop);}
          }else if(stage==='wheel-units')target.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaX:0,deltaY:4,deltaMode:1}));
          else for(let index=0;index<55;index++)field.dispatchEvent(new KeyboardEvent('keydown',{key:String(index),bubbles:true,cancelable:true}));
        },stage),async()=>{
          assert.deepEqual(await fresh(),[],'EventLogger must not fabricate host actions or change events');
          const observation=await root.evaluate(node=>{
            const proof=node.__visualEventLogger,log=node.querySelector('[data-tool-event-log]');
            if(log.querySelector('[data-tool-event-empty]'))throw new Error('Empty hint survived public input');
            return {initialEmpty:proof.initialEmpty,rawEvents:proof.rawEvents,consumedKeys:proof.consumedKeys,bubbledKeys:proof.bubbledKeys,rows:[...log.children].map(row=>{const time=row.querySelector('time');if(!time)throw new Error('Event row has no timestamp');return {time:time.textContent,message:[...row.childNodes].filter(child=>child!==time).map(child=>child.textContent).join(''),text:row.textContent};})};
          });
          return assertEventLoggerPublicState(stage,observation);
        });
      }finally{
        await root.evaluate(node=>{const proof=node.__visualEventLogger;for(const type of ['pointermove','pointerdown','pointerup','wheel','keydown','keyup'])node.removeEventListener(type,proof.observe,true);node.removeEventListener('keydown',proof.bubble);delete node.__visualEventLogger;});
      }
      return;
    }
    if(contract.focusedSequence==='task-due-submit'){
      const form=root.locator('form[data-project-properties][data-ely-submit="update-task"]'),due=form.locator('input[type="date"][name="due"][data-project-property]');
      assert.equal(await form.getAttribute('data-task-id'),'brief');
      assert.equal(await due.inputValue(),'2026-10-12');assert.equal(await due.isEnabled(),true);
      assert.equal(await form.locator('[name="status"]').inputValue(),'In progress');assert.equal(await form.locator('[name="assignee"]').inputValue(),'ana');
      const entries=[['status','In progress'],['assignee','ana'],['due','2026-10-20']];
      const dueChanges=()=>root.evaluate(()=>globalThis.__visualDirectDOMEvents.filter(event=>event.type==='change'&&event.target==='due').length);
      let dueChangesBefore;
      const checkForm=async()=>{assert.equal(await due.inputValue(),'2026-10-20');assert.equal(await form.evaluate(node=>node.checkValidity()),true);assert.deepEqual(await form.evaluate(node=>[...new FormData(node)]),entries);};
      await runStep('change-due',async()=>{await begin();dueChangesBefore=await dueChanges();await due.fill('2026-10-20');},async()=>{
        await checkForm();const observed=await fresh();assertStatusSelectDueEvents(observed,{id,identity,entries,nativeChangeCount:await dueChanges()-dueChangesBefore});
        return {due:'2026-10-20',events:observed};
      });
      const submit=form.locator('button[type="submit"]');
      const focused=()=>submit.evaluate(node=>document.activeElement===node);
      const paintedUpdate=()=>submit.evaluate(node=>{
        const rect=node.getBoundingClientRect(),style=getComputedStyle(node),x=rect.left+rect.width/2,y=rect.top+rect.height/2,hit=document.elementFromPoint(x,y);
        return {focused:document.activeElement===node,focusVisible:node.matches(':focus-visible'),disabled:node.disabled,position:style.position,clipPath:style.clipPath,width:rect.width,height:rect.height,reachable:!!hit&&(hit===node||node.contains(hit))};
      });
      const assertPainted=state=>{assert.equal(state.focused,true);assert.equal(state.focusVisible,true);assert.equal(state.disabled,false);assert.equal(state.position,'static');assert.equal(state.clipPath,'none');assert(state.width>1&&state.height>1);assert.equal(state.reachable,true,'Keyboard-revealed submit must have reachable owned painted pixels');};
      await runStep('reveal-update',async()=>{
        await begin();assert.equal(await due.evaluate(node=>document.activeElement===node),true,'Tab navigation starts at the actual filled due field');
        let tabs=0;
        while(!await focused()&&tabs<8){await root.page().keyboard.press('Tab');tabs++;assert(await focused()||await due.evaluate(node=>document.activeElement===node),'Tab must not escape to another control or twin');}
        assert(tabs>0&&await focused(),'Bounded real Tab navigation must reach Update');
        return {method:'real Tab navigation from due',tabs,unfocusedPointer:contract.inputSupport.unfocusedPointer};
      },async()=>{await checkForm();assert.deepEqual(await fresh(),[],'Keyboard reveal must not fabricate public changes or host actions');const painted=await paintedUpdate();assertPainted(painted);return {painted,unfocusedPointer:contract.inputSupport.unfocusedPointer};});
      await runStep('submit-current-due',async()=>{await begin();assertPainted(await paintedUpdate());await root.page().keyboard.press('Enter');return {method:'native keyboard Enter',unfocusedPointer:contract.inputSupport.unfocusedPointer};},async()=>{await checkForm();const observed=await fresh();assert.deepEqual(observed.map(event=>[event.type,event.detail]),[['ely:action',{id,component:identity,action:'update-task',formData:entries,values:entries,submitter:''}]]);return {due:'2026-10-20',events:observed,unfocusedPointer:contract.inputSupport.unfocusedPointer};});
    }else if(contract.focusedSequence==='remove-four-tags'){
      const keys=['design','motion','accessibility','rust'],labels=['Design','Motion','Accessibility','Rust'];
      const tagLabels=()=>root.locator('.ely-data__tag > span').allTextContents();
      assert.deepEqual(await tagLabels(),['Research','Pinned','Urgent',...labels]);
      assert.deepEqual(await root.locator('[data-ely-tag-remove]').evaluateAll(nodes=>nodes.map(node=>node.value)),keys);
      for(let index=0;index<keys.length;index++){
        const key=keys[index],control=root.locator(`[data-ely-tag-remove][value="${key}"]`);
        assert.equal(await control.getAttribute('aria-label'),`Remove ${labels[index]}`);
        await runStep(`remove-${key}`,async()=>{await begin();await control.click();},async()=>{assert.equal(await control.count(),0);assert.deepEqual(await tagLabels(),['Research','Pinned','Urgent',...labels.slice(index+1)]);assert.deepEqual(await root.locator('[data-ely-tag-remove]').evaluateAll(nodes=>nodes.map(node=>node.value)),keys.slice(index+1));const observed=await fresh();assert.deepEqual(observed.map(event=>[event.type,event.detail]),[['ely:action',{id,component:identity,action:'tag-remove',value:key}]]);return {remaining:keys.slice(index+1),events:observed};});
      }
    }else{
      const trigger=root.locator('[data-interaction-menu][aria-haspopup="menu"]'),panelID=await trigger.getAttribute('aria-controls');
      const panel=root.locator(`[id=${JSON.stringify(panelID)}][role="menu"]`);
      assert.equal(await panel.getAttribute('id'),panelID);assert.equal(await panel.getAttribute('hidden'),'');
      const state=()=>panel.locator('[data-interaction-menu-radio]').evaluateAll(nodes=>nodes.map(node=>({value:node.value,group:node.dataset.interactionMenuRadio,checked:node.getAttribute('aria-checked'),role:node.getAttribute('role')})));
      const initial=await state();assert.equal(initial.length,6);assert(initial.every(row=>row.role==='menuitemradio'));
      assert.deepEqual(initial.map(row=>[row.value,row.group,row.checked]),[['sidebar','default','true'],['minimap','default','false'],['status-bar','default','true'],['compact','density','false'],['standard','density','true'],['comfortable','density','false']]);
      for(const [group,value] of [['default','minimap'],['density','compact']]){
        const peers=(await state()).filter(row=>row.group!==group),target=panel.locator(`[data-interaction-menu-radio="${group}"][value="${value}"]`);
        for(const repeat of [false,true])await runStep(`${repeat?'reselect':'select'}-${group}`,async()=>{await trigger.click();assert.equal(await trigger.getAttribute('aria-expanded'),'true');assert.equal(await panel.isVisible(),true);await begin();await target.click();},async()=>{
          const current=await state();assert.deepEqual(current.filter(row=>row.group!==group),peers);assert(current.filter(row=>row.group===group).every(row=>row.checked===String(row.value===value)));
          assert.equal(await panel.isVisible(),false);assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await trigger.evaluate(node=>document.activeElement===node),true);
          const observed=await fresh();assert.deepEqual(observed.map(event=>[event.type,event.detail]),[['ely:change',{id,component:identity,name:group,value,checked:true}],['ely:action',{id,component:identity,action:'select',value,formData:null,values:[]}]]);assert(observed.every(event=>event.panelClosed===true&&event.focusReturned===true),'Dismissal and focus must settle before observers');return {group,value,reselected:repeat,state:current,events:observed};
        });
      }
    }
    return;
  }
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
    await root.evaluate(node=>{node.__visualFocusedChanges=[];node.addEventListener('ely:change',event=>node.__visualFocusedChanges.push({...event.detail}));});
    const changes=()=>root.evaluate(node=>node.__visualFocusedChanges.map(change=>({...change})));
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
    let changesBefore=0;
    const assertChange=async expected=>{const recorded=await changes(),event=recorded.slice(changesBefore).find(change=>change.name==='tab'&&change.value===expected&&change.selected===true);assert(event,'Tab selection must emit the documented ely:change payload');assert.deepEqual(event,{id:await root.getAttribute('id'),component:contract.identity,name:'tab',value:expected,selected:true});return event;};
    await runStep('select-tab',async()=>{changesBefore=(await changes()).length;await target.click();},async()=>{assert.equal(await target.getAttribute('aria-selected'),'true');const panel=await assertSelectedPanel(await target.getAttribute('value')),event=await assertChange(panel.selected);return {...panel,change:event};});
    await runStep('keyboard-select-tab',async()=>{changesBefore=(await changes()).length;await target.press(forward);},async()=>{const state=await assertSelectedPanel();assert.notEqual(state.selected,await target.getAttribute('value'),'Arrow navigation must move selection to another enabled tab');const event=await assertChange(state.selected);return {...state,key:forward,change:event};});
    return;
  }
  if(contract.focusedSequence==='lottie-play-pause-frame-reset'){
    const host=root.locator('[data-interaction-lottie]'),play=root.locator('[data-interaction-lottie-play]'),pause=root.locator('[data-interaction-lottie-pause]'),seek=root.locator('[data-interaction-lottie-seek]'),progress=root.locator('[data-interaction-lottie-progress]'),status=root.locator('[data-interaction-lottie-status]'),svg=root.locator('[data-lottie-canvas] svg');
    assert.equal(await host.getAttribute('data-lottie-autoplay'),'false','Deterministic fixture must not autoplay');
    assert.equal(await host.getAttribute('data-lottie-loop'),'false','Deterministic fixture must not loop');
    await svg.waitFor({state:'visible',timeout:5000});
    for(let attempt=0;attempt<40&&(await status.textContent()).trim()!=='Animation ready';attempt++)await new Promise(resolve=>setTimeout(resolve,25));
    assert.equal((await status.textContent()).trim(),'Animation ready','Lottie SVG must finish loading before its initial frame is measured');
    await root.evaluate(node=>{node.__visualFocusedChanges=[];node.addEventListener('ely:change',event=>node.__visualFocusedChanges.push({...event.detail}));});
    const changes=()=>root.evaluate(node=>node.__visualFocusedChanges.map(change=>({...change})));
    let changesBefore=0;
    const assertFrameChange=async expected=>{const recorded=await changes(),event=recorded.slice(changesBefore).find(change=>change.name==='frame'&&change.value===String(expected));assert(event,`Lottie seek must emit ely:change frame=${expected}`);assert.deepEqual(event,{id:await root.getAttribute('id'),component:contract.identity,name:'frame',value:String(expected)});return event;};
    assert.equal(await seek.inputValue(),'0','Non-autoplay Lottie fixture must start at frame zero');
    assert.equal((await progress.textContent()).trim(),'0%','Non-autoplay Lottie fixture must report its initial frame');
    const visibleFrame=async()=>{
      assert(await svg.isVisible(),'Lottie SVG must remain visible');
      const frame=await svg.evaluate(node=>{const paths=[...node.querySelectorAll('path')];const painted=paths.filter(path=>{const box=path.getBBox(),style=getComputedStyle(path);return box.width>0&&box.height>0&&style.display!=='none'&&style.visibility!=='hidden'&&Number(style.opacity)>0&&style.fill!=='none';});return {pathCount:paths.length,paintedPathCount:painted.length};});
      assert(frame.paintedPathCount>0,'Current Lottie frame must contain a visible painted path');
      return frame;
    };
    const visibleGeometry=async()=>svg.evaluate(node=>{const svgBox=node.getBoundingClientRect();return [...node.querySelectorAll('path')].flatMap(path=>{const shape=path.getBoundingClientRect(),style=getComputedStyle(path),box=path.getBBox();if(!box.width||!box.height||style.display==='none'||style.visibility==='hidden'||Number(style.opacity)<=0||style.fill==='none')return [];return [{x:shape.x-svgBox.x,y:shape.y-svgBox.y,width:shape.width,height:shape.height}];});});
    const frame0Geometry=await visibleGeometry();assert(frame0Geometry.length>0,'Initial frame must expose visible fixture shape geometry');
    await runStep('play-animation',()=>play.click(),async()=>{assert.equal((await status.textContent()).trim(),'Animation playing');const frame=await visibleFrame();return {status:(await status.textContent()).trim(),svgVisible:true,...frame};});
    await runStep('pause-animation',()=>pause.click(),async()=>{assert.equal((await status.textContent()).trim(),'Animation paused');const frame=await visibleFrame();return {status:(await status.textContent()).trim(),svgVisible:true,...frame};});
    let frame50Geometry=[];
    await runStep('seek-visible-frame',async()=>{changesBefore=(await changes()).length;await seek.focus();await seek.press('Home');for(let index=0;index<50;index++)await seek.press('ArrowRight');},async()=>{assert.equal(await seek.inputValue(),'50');assert.equal((await progress.textContent()).trim(),'50%');const frame=await visibleFrame();frame50Geometry=await visibleGeometry();assert.equal(frame50Geometry.length,frame0Geometry.length,'Frame geometry must remain independently comparable');const movement=Math.max(...frame50Geometry.map((shape,index)=>Math.hypot(shape.x-frame0Geometry[index].x,shape.y-frame0Geometry[index].y,shape.width-frame0Geometry[index].width,shape.height-frame0Geometry[index].height)));assert(movement>4,`The visible marker must move at frame 50 (observed maximum geometry delta ${movement}px)`);const change=await assertFrameChange(50);return {frame:50,progress:(await progress.textContent()).trim(),svgVisible:true,maximumGeometryDelta:movement,geometry:frame50Geometry,change,...frame};});
    await runStep('reset-visible-frame',async()=>{changesBefore=(await changes()).length;await seek.press('Home');},async()=>{assert.equal(await seek.inputValue(),'0');assert.equal((await progress.textContent()).trim(),'0%');const frame=await visibleFrame(),geometry=await visibleGeometry(),box=await svg.boundingBox();assert(box&&box.width>0&&box.height>0,'Reset frame must retain a painted SVG');assert.equal(geometry.length,frame0Geometry.length,'Reset geometry must match the original frame');const resetDelta=Math.max(...geometry.flatMap((shape,index)=>['x','y','width','height'].map(key=>Math.abs(shape[key]-frame0Geometry[index][key]))));assert(resetDelta<=1,`Reset frame must restore frame-zero shape geometry (observed maximum delta ${resetDelta}px)`);const change=await assertFrameChange(0);return {frame:0,progress:(await progress.textContent()).trim(),svgVisible:true,svgBounds:box,maximumResetGeometryDelta:resetDelta,geometry,change,...frame};});
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
      const inside=node.contains(element),foreign=element.closest('[data-audit-main]>[data-ely-family],[data-audit-twin]>[data-ely-family],[data-audit-main]>[data-basic-component],[data-audit-twin]>[data-basic-component]')||element.closest('[data-ely-family]');
      const explicitOwner=element.getAttribute('data-ely-owner')?.replace(/^#/,'');
      const scope=foreign&&!inside&&foreign!==node&&!owners.has(foreign.id)?'foreign-component':explicitOwner&&!owners.has(explicitOwner)?'foreign-portal-owner':owners.has(explicitOwner)?'portal-owner-attribute':references.has(element.id)?'trigger-reference':inside&&!element.matches('[role=region]')?'component-root':'unowned';
      const rect=element.getBoundingClientRect();
      return {tag:element.tagName,id:element.id||null,role:element.getAttribute('role'),text:(element.innerText||'').trim().slice(0,180),bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        nativeOpen:element.matches('dialog')?element.open:null,popoverOpen:element.matches(':popover-open'),locatorSelector:selector,locatorIndex:[...document.querySelectorAll(selector)].indexOf(element),
        ownerID:explicitOwner||null,checkedRootID:node.id,openerReferences:[...node.querySelectorAll('[aria-controls]')].filter(control=>(control.getAttribute('aria-controls')||'').split(/\s+/).includes(element.id)).map(control=>({id:control.id||null,ariaControls:control.getAttribute('aria-controls')})),
        ownershipScope:scope,owned:['component-root','portal-owner-attribute','trigger-reference'].includes(scope)};
    });
}
