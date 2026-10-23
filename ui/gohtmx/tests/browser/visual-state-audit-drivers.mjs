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

// Only the active owned control's simple outline; not generic shadow or paint padding.
export function activeOutlineBounds(node,bounds){
  const active=document.activeElement;
  if(!active||!node.contains(active))return bounds;
  const style=getComputedStyle(active);
  if(style.display==='none')return bounds;
  const width=parseFloat(style.outlineWidth),offset=parseFloat(style.outlineOffset);
  const alpha=style.outlineColor.match(/\/\s*([\d.]+%?)\s*\)$/)?.[1]??style.outlineColor.match(/^rgba\([^,]+,[^,]+,[^,]+,\s*([\d.]+%?)\s*\)$/)?.[1];
  if(style.outlineStyle==='none'||style.outlineStyle==='hidden'||width===0||style.outlineColor==='transparent'||(alpha!==undefined&&parseFloat(alpha)===0))return bounds;
  const gap=reason=>({...bounds,focusOutline:{status:'unsupported',reason}});
  const positioned=[];
  if(active.closest('[data-ely-family]')!==node.closest('[data-ely-family]'))return gap('nested component focus ownership');
  if(style.outlineStyle==='auto'||!Number.isFinite(width)||!Number.isFinite(offset))return gap('unbounded outline style');
  if(active.getClientRects().length!==1)return gap('fragmented focus outline');
  const margin=Math.max(0,width+offset),r=active.getBoundingClientRect();
  const paint={left:r.left-margin,top:r.top-margin,right:r.right+margin,bottom:r.bottom+margin};
  for(let ancestor=active;ancestor;ancestor=ancestor.parentElement){
    const s=getComputedStyle(ancestor);
    if(['absolute','fixed'].includes(s.position))positioned.push({node:ancestor,containingBlock:s.position==='absolute'?ancestor.offsetParent:null});
    if(s.display==='none'||Number(s.opacity)===0||s.contentVisibility==='hidden'||(ancestor===active&&s.visibility!=='visible'))return bounds;
    if(ancestor!==active&&s.visibility!=='visible')return gap('ancestor visibility overridden by visible focused child');
    if(s.transform!=='none'||s.translate !== 'none'||s.rotate !== 'none'||s.scale !== 'none'||s.perspective!=='none'||s.filter !== 'none'||s.clipPath!=='none'||s.clip!=='auto'||s.maskImage!=='none'||s.contain.split(/\s+/).some(value=>['paint','strict','content'].includes(value))||(s.zoom!=='normal'&&Number(s.zoom)!==1))return gap('complex outline geometry or clipping');
    if(ancestor===active)continue;
    const clipX=s.overflowX!=='visible',clipY=s.overflowY!=='visible';
    if(!clipX&&!clipY)continue;
    if(positioned.some(item=>item.node!==ancestor&&(!item.containingBlock||!ancestor.contains(item.containingBlock))))return gap('unproven positioned outline overflow clip relationship');
    if((s.overflowX==='clip'||s.overflowY==='clip')&&s.overflowClipMargin!=='0px')return gap('nonzero overflow clip margin');
    // The border box over-approximates the padding and rounded overflow clip.
    const box=ancestor.getBoundingClientRect();
    if(clipX){paint.left=Math.max(paint.left,box.left);paint.right=Math.min(paint.right,box.right);}
    if(clipY){paint.top=Math.max(paint.top,box.top);paint.bottom=Math.min(paint.bottom,box.bottom);}
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
  const plainChain=(start,end,{inactiveForeignPaint=false}={})=>{for(let p=start;p&&p!==end;p=p.parentElement){const s=getComputedStyle(p),outlineWidth=parseFloat(s.outlineWidth),inactiveZ=inactiveForeignPaint&&p===start&&s.position==='static'&&Number.isFinite(Number(s.zIndex))&&Number(s.zIndex)>0&&p.parentElement&&getComputedStyle(p.parentElement).display==='block'&&[s.overflowX,s.overflowY].every(value=>['visible','hidden','clip'].includes(value))&&(s.overflowX==='hidden'||s.overflowX==='clip'||s.overflowY==='hidden'||s.overflowY==='clip');if(p.matches(':modal,:popover-open')||['sticky','fixed'].includes(s.position)||s.zIndex!=='auto'&&!inactiveZ||Number(s.opacity)!==1||s.transform!=='none'||s.translate!=='none'||s.rotate!=='none'||s.scale!=='none'||s.filter !== 'none'||s.perspective!=='none'||s.maskImage!=='none'||s.backdropFilter!=='none'||s.containerType!=='normal'||s.isolation !== 'auto'||s.mixBlendMode!=='normal'||s.contain!=='none'||s.willChange!=='auto'||s.clipPath!=='none'||(s.overflowX!=='visible'||s.overflowY!=='visible')&&!inactiveZ||inactiveZ&&(p===document.activeElement||s.boxShadow!=='none'||s.textShadow!=='none'||!['none','hidden'].includes(s.outlineStyle)&&(!Number.isFinite(outlineWidth)||outlineWidth>0)))return false;}return true;};
  // Even a shared ancestor can clip the purported opaque cover. Decline the
  // proof instead of attempting to model ancestor paint clips or masks.
  const unclippedAncestors=()=>{for(let p=node.parentElement;p;p=p.parentElement){const s=getComputedStyle(p);if(s.overflowX!=='visible'||s.overflowY!=='visible'||s.clipPath!=='none'||s.clip!=='auto'||s.maskImage!=='none'||s.filter !== 'none'||s.backdropFilter!=='none'||s.perspective!=='none')return false;}return true;};
  const canCover=paint=>{
    let common=node.parentElement;while(common&&!common.contains(paint))common=common.parentElement;
    return common&&covers.length&&unclippedAncestors()&&Number(style.opacity)===1&&style.transform==='none'&&style.translate==='none'&&style.rotate==='none'&&style.scale==='none'&&style.filter==='none'&&style.mixBlendMode==='normal'&&plainChain(node.parentElement,common)&&plainChain(paint,common,{inactiveForeignPaint:true});
  };
  // Trim text/control boxes only for measurable clips with ordinary flow or a
  // positioned descendant whose containing block proves the clip applies.
  const clippedPaintRect=(element,rect,text)=>{
    const clipped={...rect},positioned=[];
    for(let p=element;p;p=p.parentElement){
      const s=getComputedStyle(p),position=s.position;
      if(p.matches(':modal,:popover-open')||!['static','relative','absolute'].includes(position)||s.zIndex !== 'auto'&&position!=='absolute'||Number(s.opacity) !== 1||s.transform !== 'none'||s.translate !== 'none'||s.rotate !== 'none'||s.scale !== 'none'||s.filter !== 'none'||s.perspective !== 'none'||s.maskImage !== 'none'||s.backdropFilter !== 'none'||s.containerType !== 'normal'||s.isolation !== 'auto'||s.mixBlendMode !== 'normal'||s.contain !== 'none'||s.willChange !== 'auto'||s.clipPath !== 'none'||s.clip !== 'auto'||(s.zoom !== 'normal'&&Number(s.zoom) !== 1)||s.contentVisibility !== 'visible')return rect;
      if(position==='absolute')positioned.push({node:p,containingBlock:p.offsetParent});
      if(p===element&&!text)continue;
      const clipX=s.overflowX!=='visible',clipY=s.overflowY!=='visible';
      if(clipX||clipY){
        if(s.overflowClipMargin!=='0px')return rect;
        for(const item of positioned){
          let containingBlock=item.containingBlock;
          // Some engines expose no offsetParent for an absolutely positioned SVG viewport.
          if(!containingBlock&&item.node.namespaceURI==='http://www.w3.org/2000/svg'&&item.node.localName==='svg'&&item.node.parentElement===p&&position!=='static')containingBlock=p;
          if(item.node!==p&&(!containingBlock||!p.contains(containingBlock)))return rect;
        }
        const r=p.getBoundingClientRect(),left=r.left+scrollX,top=r.top+scrollY;
        if(clipX){const right=clipped.x+clipped.width;clipped.x=Math.max(clipped.x,left);clipped.width=Math.min(right,r.right+scrollX)-clipped.x;}
        if(clipY){const bottom=clipped.y+clipped.height;clipped.y=Math.max(clipped.y,top);clipped.height=Math.min(bottom,r.bottom+scrollY)-clipped.y;}
      }
    }
    return clipped.width>0&&clipped.height>0?clipped:null;
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
      if(e.matches('button,input,select,textarea,img,canvas,svg,video,iframe')||s.backgroundImage!=='none'||s.backgroundColor!=='rgba(0, 0, 0, 0)'||s.boxShadow!=='none'||['Top','Right','Bottom','Left'].some(side=>parseFloat(s[`border${side}Width`])>0))painted.push({e,rect:box(e.getBoundingClientRect()),text:false});
      for(const text of e.childNodes){if(text.nodeType!==Node.TEXT_NODE||!text.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(text);for(const part of range.getClientRects())painted.push({e,rect:box(part),text:true});}
    }
    let exposedArea=0,coveredArea=0;const witnesses=[];
    for(const {e,rect,text} of painted){const visible=clippedPaintRect(e,rect,text);if(!visible)continue;const overlap=intersect(visible,clip);if(!overlap)continue;
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
const registeredCanvasIDs=['canvas/InfiniteCanvas','canvas/CanvasGrid','canvas/Guides','canvas/Ruler','canvas/ArtboardFrame','canvas/ZoomControls','canvas/ZoomIndicator','canvas/MiniMap'];
const contracts={
  'canvas/InfiniteCanvas':{entry:'canvas',kind:'InfiniteCanvas',steps:[
    step('zoom-in','canvasScene','[data-cs-zoom-in]','click','click','zoom=.75; center held; public view equals rendered transform'),
    step('minimap-arrow-right','canvasScene','[data-cs-minimap]','dispatchEvent','keydown','ArrowRight adds 40/.75 to viewport x; y and zoom unchanged'),
  ]},
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
  const canvas=registeredCanvasIDs.includes(identity);
  const definition=contracts[canvas?'canvas/InfiniteCanvas':editor?'editor/CodeEditor':identity];if(!definition)return null;
  const facts={root:{dataset:{elyKind:definition.kind,elyComponent:identity}},kind:definition.kind,variant:identity.split('/')[1],twin:true,
    selectors:{'[data-ws-devtools-source]':false,'[data-ws-canvas-scene]':canvas},form:{dataset:{wsRequired:'true'}},node:{tagName:'INPUT',type:'password',...(identity==='forms/PasswordInput'?{name:'caller_value'}:{})}};
  const resolved=resolveCaseActionSites(source,filename,{entry:definition.entry,facts});
  const mappingGaps=[...resolved.mappingGaps];
  if(resolved.sites.length!==definition.steps.length)mappingGaps.push({reason:'exact-action-count-changed',expected:definition.steps.length,actual:resolved.sites.length});
  const steps=definition.steps.map((expected,index)=>{
    const actual=resolved.sites[index];
    if(!actual||actual.owner!==expected.owner||(actual.controlSelector||actual.control)!==expected.control||actual.method!==expected.method||actual.event!==expected.event)mappingGaps.push({reason:'action-source-mapping-changed',stepId:expected.id,actualSiteId:actual?.siteId||null});
    return {...expected,source:actual||null};
  });
  return {identity,entry:definition.entry,kind:definition.kind,steps,mappingGaps,
    ...(canvas?{registeredCanvas:true}:{}),
    // advancedFormsCases supplies Name=caller_value; this is not an alias/default assumption.
    fixtureGuards:{component:identity,kind:definition.kind,devtoolsSourceAbsent:identity!=='forms/PasswordInput',canvasSceneAbsent:identity==='files/ArchiveViewer',requiredEditor:editor,...(identity==='forms/PasswordInput'?{passwordInputName:'caller_value'}:{})}};
}

export function assertRegisteredCanvasTransition(label,before,after,detail){
  assert.deepEqual(before.stage,{width:820,height:460});
  assert.deepEqual(after.stage,before.stage);
  assert.equal(detail.action,'change-viewport');
  const view=before.view;
  const expected=label==='zoom-in'?{zoom:.75,x:view.x+410/view.zoom-410/.75,y:view.y+230/view.zoom-230/.75}
    :label==='minimap-arrow-right'?{zoom:view.zoom,x:view.x+40/view.zoom,y:view.y}:null;
  assert(expected,'Unknown registered canvas action');
  for(const key of ['x','y','zoom']){
    assert(Number.isFinite(detail.view?.[key])&&Math.abs(detail.view[key]-expected[key])<=1e-6,`Public canvas ${key} differs from independent transition`);
    assert(Number.isFinite(after.view[key])&&Math.abs(after.view[key]-expected[key])<=1e-6,`Rendered canvas ${key} differs from independent transition`);
  }
  return expected;
}

// Separate fresh two-action replay; the three supplemental fit/pointer actions stay distinct.
export async function runRegisteredCanvasActions(contract,root,runStep){
  assert(registeredCanvasIDs.includes(contract.identity)&&contract.registeredCanvas===true);
  assert.equal(await root.getAttribute('data-ely-component'),contract.identity);
  const scene=()=>root.evaluate(node=>{
    const host=node.querySelector('[data-ws-canvas-scene]'),stage=host?.querySelector('[data-cs-stage]'),world=host?.querySelector('[data-cs-world]');
    if(host?.dataset.sceneKind!=='InfiniteCanvas'||!stage||!world)throw new Error('Exact InfiniteCanvas scene required');
    const match=(world.getAttribute('transform')||'').match(/^scale\(([-+\d.e]+)\) translate\(([-+\d.e]+) ([-+\d.e]+)\)$/);
    if(!match)throw new Error('Unknown canvas world transform');
    return {stage:{width:stage.viewBox.baseVal.width,height:stage.viewBox.baseVal.height},view:{zoom:Number(match[1]),x:-Number(match[2]),y:-Number(match[3])},artboards:host.querySelectorAll('[data-cs-artboard]').length,shapes:host.querySelectorAll('[data-cs-shape]').length};
  });
  const initial=await scene();
  assert.deepEqual(initial,{stage:{width:820,height:460},view:{zoom:.7,x:-60,y:-60},artboards:2,shapes:8});
  const id=await root.getAttribute('id');
  await root.evaluate(node=>{
    node.__registeredCanvasInput=[];
    node.__registeredCanvasObserver=event=>{const target=event.target.closest('[data-cs-zoom-in],[data-cs-minimap]');if(target)node.__registeredCanvasInput.push({type:event.type,key:event.key||null,trusted:event.isTrusted,control:target.hasAttribute('data-cs-zoom-in')?'zoom':'minimap'});};
    node.addEventListener('click',node.__registeredCanvasObserver,true);node.addEventListener('keydown',node.__registeredCanvasObserver,true);
  });
  try{
    for(const label of ['zoom-in','minimap-arrow-right']){
      let before;
      await runStep(label,async()=>{
        before=await scene();
        if(label==='zoom-in')return clickVisibleControl(root.locator('[data-cs-zoom-in]'));
        const map=root.locator('[data-cs-minimap]');await map.focus();await map.press('ArrowRight');
      },async(state,previous)=>{
        const events=state.actions.slice(previous.actions.length);assert.equal(events.length,1);
        const detail=events[0];assert.equal(detail.id,id);assert.equal(detail.component,contract.identity);
        const after=await scene(),expected=assertRegisteredCanvasTransition(label,before,after,detail);
        assert.equal(after.artboards,2);assert.equal(after.shapes,8);
        const inputs=await root.evaluate(node=>node.__registeredCanvasInput);
        assert.deepEqual(inputs,label==='zoom-in'?[{type:'click',key:null,trusted:true,control:'zoom'}]:[{type:'click',key:null,trusted:true,control:'zoom'},{type:'keydown',key:'ArrowRight',trusted:true,control:'minimap'}]);
        return {expected,rendered:after.view,input:inputs.at(-1)};
      });
    }
  }finally{await root.evaluate(node=>{node.removeEventListener('click',node.__registeredCanvasObserver,true);node.removeEventListener('keydown',node.__registeredCanvasObserver,true);delete node.__registeredCanvasInput;delete node.__registeredCanvasObserver;});}
}

const settingsTargets={KeyboardShortcutsList:[1,'Keyboard'],ProxySettings:[2,'Network'],PrivacySettings:[3,'Privacy','telemetry'],NotificationSettings:[4,'Notifications','quiet'],StartupSettings:[5,'Startup','login'],StorageSettings:[6,'Storage'],ResetToDefault:[6,'Storage'],AdvancedSettings:[7,'Advanced','developer'],'DeveloperMode Toggle':[7,'Advanced','developer']};
export function requestedStateContract(identity,trashFixture){
  if(identity==='misc/IframeEmbed'||identity==='misc/EmbedCard'){
    const stepId=identity==='misc/IframeEmbed'?'iframe-open-host':'embedcard-open-host',url='https://example.com';
    return {identity,kind:'IframeEmbed',family:'native',requestedStateOnly:true,focusedSequence:'native-embed-open-host',mappingGaps:[],fixtureGuards:{component:identity,kind:'IframeEmbed',url,sourceNote:'Web views need macOS for now.'},steps:[{id:stepId,control:'header button[data-ely-action="open"][data-value="https://example.com"]',expectedState:'One trusted native click emits exactly open with this root ID, alias-preserving component identity, and exact URL; the source note and iframe-free local state remain unchanged.',event:'trusted native Playwright button click; one host request only; no navigation',source:{siteId:`native-state:${identity}:${stepId}`,sourceAnchor:'ui/gohtmx/components.json IframeEmbed/EmbedCard; internal/gallery/assets/native-misc-fixtures.json IframeEmbed; ui/gohtmx/templates/ely-api-native.html IframeEmbed; ui/gohtmx/assets/ely-api.js generic click emitter',provenance:`Exact default native identity ${identity}; EmbedCard keeps its own alias identity; the fixture source note and local state are preserved, with no provider or navigation claim`}}],scope:'One default header-button action for each of the two catalogue identities; no external provider, browser navigation, alias-family, or registered-check approval claim'};
  }
  if(identity==='layout/Dock')return {identity,kind:'Dock',family:'foundation',requestedStateOnly:true,focusedSequence:'dock-native-actions',mappingGaps:[],fixtureGuards:{component:identity,kind:'Dock'},steps:[
    ['dock-click-files','.ely-foundation__dock-left [data-foundation-dock-tab]:nth-of-type(1)','Native click selects Files in the left zone and updates its local output','trusted native Playwright pointer click'],
    ['dock-click-outline','.ely-foundation__dock-left [data-foundation-dock-tab]:nth-of-type(2)','Native click selects Outline in the left zone and updates its local output','trusted native Playwright pointer click'],
    ['dock-click-search','.ely-foundation__dock-right [data-foundation-dock-tab]','Native click selects Search in the right zone and updates its local output','trusted native Playwright pointer click'],
    ['dock-click-terminal','.ely-foundation__dock-bottom [data-foundation-dock-tab]','Native click selects Terminal in the bottom zone and updates its local output','trusted native Playwright pointer click'],
    ['dock-key-enter-search','.ely-foundation__dock-right [data-foundation-dock-tab]','Native Enter activates the focused Search button using browser button semantics','trusted native Playwright keyboard activation; browser-generated click'],
    ['dock-key-space-search','.ely-foundation__dock-right [data-foundation-dock-tab]','Native Space activates the focused Search button using browser button semantics','trusted native Playwright keyboard activation; browser-generated click'],
    ['dock-drag-files-center','.ely-foundation__dock-left [data-foundation-dock-tab]:nth-of-type(1) → [data-foundation-dock-zone="center"]','Native HTML drag moves the existing Files tab into the center zone and updates that zone; no external operation','trusted native Playwright HTML drag-and-drop; no synthetic event dispatch'],
  ].map(([id,control,expectedState,event])=>({id,control,expectedState,event,source:{siteId:`dock-state:${identity}:${id}`,sourceAnchor:'internal/gallery/advanced_foundation_fixtures.go Dock; ui/gohtmx/templates/ely-api-foundation.html Dock; ui/gohtmx/assets/ely-api-foundation.js dock click/drag handlers',provenance:'Exact shipped layout/Dock default fixture and its local UI state only; no provider, persistence, or business-effect claim'}})),scope:'Four default-fixture tab clicks, native Enter and Space activation, and one native same-component move to center. This is requested-state coverage, separate from registered instrumentation and visual approval.'};
  if(identity==='layout/ResizeHandle')return {identity,kind:'ResizeHandle',family:'foundation',requestedStateOnly:true,focusedSequence:'foundation-native-resize',mappingGaps:[],fixtureGuards:{component:identity,kind:'ResizeHandle',disabled:false},steps:[
    ['resize-horizontal-pointer','[data-foundation-split].ely-foundation__resize-line--horizontal [data-foundation-split-handle]','Trusted pointer drag moves the horizontal split divider and range together within 25–75; one or more bounded change actions report this exact identity'],
    ['resize-vertical-range-home','.ely-foundation__resize-line--vertical input[type="range"]','Native Home sets the vertical range and separator to 25 and emits one bounded change action'],
    ['resize-horizontal-range-end','.ely-foundation__resize-line--horizontal input[type="range"]','Native End sets the horizontal range and separator to 75 and emits one bounded change action'],
    ['resize-separator-arrow-up','.ely-foundation__resize-line--horizontal [data-foundation-split-handle]','Native ArrowUp exercises the separator-specific custom handler and decreases the bounded value by five'],
    ['resize-separator-arrow-down','.ely-foundation__resize-line--horizontal [data-foundation-split-handle]','Native ArrowDown exercises the separator-specific custom handler and increases the bounded value by five'],
    ['resize-separator-home','.ely-foundation__resize-line--horizontal [data-foundation-split-handle]','Native Home on the separator exercises the custom handler and sets both controls to minimum 25'],
    ['resize-separator-end','.ely-foundation__resize-line--horizontal [data-foundation-split-handle]','Native End on the separator exercises the custom handler and sets both controls to maximum 75'],
  ].map(([id,control,expectedState])=>({id,control,expectedState,event:id.includes('pointer')?'trusted native pointer drag':'trusted native range keyboard input',source:{siteId:`resize-state:${identity}:${id}`,sourceAnchor:'internal/gallery/advanced_foundation_fixtures.go layout/ResizeHandle; ui/gohtmx/templates/ely-api-foundation.html ResizeHandle; ui/gohtmx/assets/ely-api-foundation.js setSplit/onChange/onKey/onPointerMove',provenance:'Exact enabled default fixture; range and separator controls are both checked for synchronized bounded state; no nested SplitPane or MasterDetail promotion'}})),scope:'Only layout/ResizeHandle canonical default fixture; native range and separator pointer behavior, no aliases, nested split, registered-check approval, or all-catalog claim'};
  if(identity==='feedback/Notification'||identity==='feedback/NotificationCenter')return {identity,kind:'Notification',family:'interaction',requestedStateOnly:true,focusedSequence:'interaction-notification-actions',mappingGaps:[],fixtureGuards:{component:identity,kind:'Notification',items:5,unread:2},steps:[
    ['notification-scroll-last-row','.ely-interaction__notification ol','Native wheel reaches the final fixture notification within its list clip when overflow requires it; no host event is emitted'],
    ['notification-open-review','.ely-interaction__notification [data-ely-action="review"]','Trusted native click emits exactly review("") with this gallery root identity'],
    ['notification-mark-all-read','.ely-interaction__notification [data-interaction-notification-read]','Native click removes both unread markers, clears the count, and hides Mark all read; all five rows remain'],
    ['notification-clear','.ely-interaction__notification [data-interaction-notification-clear]','Native click removes notification rows and reveals the local empty state'],
    ['notification-reset','[data-interaction-notification-reset]','Native click restores the exact five source rows and two unread markers'],
  ].map(([id,control,expectedState])=>({id,control,expectedState,event:id==='notification-scroll-last-row'?'conditional trusted native wheel or passive reachability read; no host request':'trusted native Playwright input',source:{siteId:`notification-state:${identity}:${id}`,sourceAnchor:'internal/gallery/advanced_interaction_fixtures.go Notification; ui/gohtmx/templates/ely-api-interaction.html Notification; ui/gohtmx/assets/ely-api-interaction.js feedbackNotifications/click notification controls',provenance:`Exact ${identity} fixture and root identity; review is a local host request only, while read/clear/reset remain component-local state changes; no persistence claim`}})),scope:`Only ${identity} exact default fixture; five native/passive checkpoints, with separately asserted review host request and local read/clear/reset changes; no alias verdict transfer or persistence claim`};
  if(identity==='interaction/ScrollSync'||identity==='interaction/VirtualScroller'){
    const virtual=identity==='interaction/VirtualScroller';
    const steps=virtual?[['virtual-scroller-advance','.ely-interaction__scroller[data-direct-count]','Native wheel advances the rendered virtual row window while retaining a bounded set of rows'],['virtual-sync-before-to-after','[data-direct-sync] > :nth-child(1)','Native wheel on Before synchronizes After scroll position'],['virtual-sync-after-to-before','[data-direct-sync] > :nth-child(2)','Native wheel on After synchronizes Before scroll position']]:[['scrollsync-before-to-after','[data-direct-sync] > :nth-child(1)','Native wheel on Before synchronizes After scroll position'],['scrollsync-after-to-before','[data-direct-sync] > :nth-child(2)','Native wheel on After synchronizes Before scroll position']];
    return {identity,kind:'VirtualScroller',family:'interaction',requestedStateOnly:true,focusedSequence:'interaction-scroll-sync',mappingGaps:[],fixtureGuards:{component:identity,kind:'VirtualScroller',count:virtual?10000:undefined,panes:2},steps:steps.map(([id,control,expectedState])=>({id,control,expectedState,event:'trusted native wheel on the exact local scroll owner; no host action expected',source:{siteId:`scroll-state:${identity}:${id}`,sourceAnchor:'internal/gallery/advanced_interaction_fixtures.go VirtualScroller (ScrollSync alias fixture); ui/gohtmx/templates/ely-api-interaction.html VirtualScroller panes; ui/gohtmx/assets/ely-api-interaction.js directWindow and data-direct-sync scroll listeners',provenance:`Exact ${identity} case identity and default VirtualScroller fixture; local native scrolling only, with no networking or application callback claim`}})),scope:`Only ${identity} exact fixture identity; ${virtual?'three':'two'} local scroll checkpoints, no alias verdict transfer, external scrolling, or registered-check approval`};
  }
  if(identity==='i18n/RTL layout')return {identity,kind:'RTL layout',family:'native',requestedStateOnly:true,focusedSequence:'native-rtl-locale-host',mappingGaps:[],fixtureGuards:{component:identity,kind:'RTL layout',initialLocale:'en-US',initialDirection:'ltr'},steps:[
    ['rtl-locale-he','[data-native-locale-scope]','Documented root-targeted ely:locale host input he-IL updates this scope to RTL without mutating its independent twin'],
    ['rtl-locale-en-restore','[data-native-locale-scope]','Documented root-targeted ely:locale host input en-US restores this scope to LTR and preserves the twin'],
  ].map(([id,control,expectedState])=>({id,control,expectedState,event:'programmatic documented host API input (not a native user toggle)',source:{siteId:`rtl-state:${identity}:${id}`,sourceAnchor:'internal/gallery/advanced_native_fixtures.go RTL layout; ui/gohtmx/templates/ely-api-native.html RTL layout; ui/gohtmx/assets/ely-api-native-theme.js data-native-locale-scope/ely:locale',provenance:'Exact default English LTR specimen; direction changes are driven through the documented instance-local host event, not an invented UI toggle'}})),scope:'Only i18n/RTL layout exact default specimen; two host-fed locale transitions and restoration; not a user-toggle, full locale matrix, alias, or all-catalog claim'};
  const verticalRangeKind={'layout/Scrollbar':'Scrollbar','layout/StickyHeader':'StickyHeader'}[identity];
  if(verticalRangeKind)return {identity,kind:verticalRangeKind,family:'foundation',requestedStateOnly:true,focusedSequence:'vertical-range-native-scroll',mappingGaps:[],fixtureGuards:{component:identity,kind:verticalRangeKind},
    steps:[['range-center-pointer','Trusted pointer at track center selects an interior value and scroll position'],['range-top-min-pointer','Trusted pointer at physical track top selects value 0 and scrollTop 0'],['range-bottom-max-pointer','Trusted pointer at physical track bottom selects value 1000 and scrollTop max'],['range-home-min','Trusted Home on the native range selects value 0 and scrollTop 0'],['range-end-max','Trusted End on the native range selects value 1000 and scrollTop max'],['content-wheel-up','Trusted content wheel-up from max moves content upward and synchronizes the range'],['scroll-home-min','Trusted Home on the scroll region selects scrollTop 0 and range value 0'],['scroll-end-max','Trusted End on the scroll region selects scrollTop max and range value 1000']].map(([id,expectedState])=>({id,control:id.startsWith('range-')?'input[type="range"][data-foundation-scrollbar]':'[data-foundation-scroll]',expectedState,event:id==='content-wheel-up'?'trusted native wheel; range input is not required':'trusted native pointer or keyboard input; no public host event expected',source:{siteId:`vertical-range-state:${identity}:${id}`,sourceAnchor:'advanced_foundation_fixtures.go Scrollbar/StickyHeader; ely-api-foundation.html native range; ely-api-foundation.js onThumb/update/onKey/scroll update; ely-api-foundation.css writing-mode/direction',provenance:'Exact canonical layout identity and its own fixture; direct native range/content state, no alias assumption'}})),scope:'Only layout/Scrollbar and layout/StickyHeader; eight direct native states each; no aliases, registered-check approval, CSS approval, or full-catalog claim'};
  if(identity==='git/ThreeWayMerge')return {identity,kind:'ThreeWayMerge',requestedStateOnly:true,focusedSequence:'threeway-native-submit',mappingGaps:[],fixtureGuards:{component:identity,kind:'ThreeWayMerge',action:'operate',required:true,disabled:false},
    steps:[['choose-theirs','input[name="resolution"][value="theirs"]','Only theirs checked; merged=return callerNew; Selected theirs.'],['edit-merged','textarea[name="merged"]','Trusted native fill then Tab commits resolved caller value'],['submit-merged','button[type="submit"]','One operate host request with exact actual FormData; no persistence claim']].map(([id,control,expectedState])=>({id,control,expectedState,event:'trusted native Playwright action',source:{siteId:`threeway-state:${id}`,sourceAnchor:'advanced_workspace_fixtures.go ThreeWayMerge; ely-api-workspace.html ws-conflict; ely-api-workspace.js resolution change; ely-api.js submit',provenance:'Canonical behavioral primary only, excluding nested source previews; not registered submitData coverage'}})),scope:'Three canonical steps only; four live profiles require 12 steps, 24 primary images and at most 24 context images. Aliases and registered submitData site remain unapproved.'};
  if(identity==='misc/LicenseViewer'){
    const labels=['inspect-license','pick-inter','next-jetbrains','wrap-first','wrap-last','home-first','next-lucide','end-last','scroll-license-horizontal','scroll-license-text'];
    return {identity,kind:'LicenseViewer',requestedStateOnly:true,focusedSequence:'license-native-selection-scroll',mappingGaps:[],fixtureGuards:{component:identity,kind:'LicenseViewer'},
      steps:labels.map(id=>({id,control:'[data-misc-licenses]',event:id==='inspect-license'?'passive exact fixture inspection':id.startsWith('scroll-')?'bounded native wheel, at most six attempts':'trusted native click or keyboard',expectedState:'Exact source-pinned package text/events, independent twin, measured local accessibility',source:{siteId:`license-state:${id}`,sourceAnchor:'ely-api-native-misc.js:32; ely-api-native.html:106',provenance:'Only misc/LicenseViewer requested states; no aliases or registered-site approval'}})),
      captureLimits:{stepsPerRow:10,primaryPerRow:20,viewportContextsPerRow:20,totalRows:5,totalPNGs:200,wheelAttemptsPerAxis:6},scope:'Five independently verified rows only; initial baseline35 separate; no OS, persistence or production CSS approval'};
  }
  const communicationBehavior={
    'agent/EvalResultTable':{kind:'TraceViewer',sequence:'communication-eval-sort',fixture:'agent/EvalResultTable',steps:[
      ['sort-tokens-ascending','[data-ely-eval-sort][value="tokens"]','Trusted native sort click orders numeric token counts ascending, updates aria-sort, and emits sort-evaluations(tokens,ascending)'],
      ['sort-tokens-descending','[data-ely-eval-sort][value="tokens"]','Second trusted native sort click orders numeric token counts descending, updates aria-sort, and emits sort-evaluations(tokens,descending)'],
      ['eval-scroll-last-column','.ely-agent-evals','Native horizontal wheel exposes the final Time column within this local scroll owner; if it already fits, assert it passively. No host action is expected.'],
    ]},
    'calendar/CalendarMonthView':{kind:'CalendarMonthView',sequence:'communication-calendar-month',fixture:'calendar/CalendarMonthView',steps:[
      ['month-page-down','[data-ely-calendar-day][aria-pressed="true"]','Native PageDown selects and visibly focuses the clamped target date; calendar-navigation carries that exact date'],
      ['month-open-day','[data-ely-calendar-day][aria-pressed="true"]','Native Enter requests open-day for the selected date; no application navigation is fabricated'],
    ]},
    'calendar/CalendarWeekView':{kind:'CalendarWeekView',sequence:'communication-calendar-week',fixture:'calendar/CalendarWeekView',steps:[
      ['week-scroll-late-events','.ely-calendar-time-grid','Native wheel scroll changes the grid scroll position and makes the 15:00 and 17:00 fixture event controls reachable'],
      ['week-open-samples','.ely-calendar-time-grid [data-ely-calendar-event][value="samples"]','Native click requests open-event(samples)'],
      ['week-open-client','.ely-calendar-time-grid [data-ely-calendar-event][value="client"]','Native click requests open-event(client)'],
      ['week-create-event','.ely-calendar-time-slot[data-ely-date="2026-10-13"][data-ely-time="16:00"]','Native drag from the exact Tuesday 16:00 slot to 16:30 requests create-event(start,end)'],
      ['week-open-allday','.ely-calendar-allday [data-ely-action="open-event"][value="offsite"]','Native click requests open-event(offsite) from the all-day row'],
    ]},
    'calendar/TimeGrid':{kind:'CalendarWeekView',sequence:'communication-calendar-week',fixture:'calendar/CalendarWeekView',sharedBehaviorKey:'calendar/CalendarWeekView'},
    'calendar/AllDayRow':{kind:'CalendarWeekView',sequence:'communication-calendar-week',fixture:'calendar/CalendarWeekView',sharedBehaviorKey:'calendar/CalendarWeekView'},
    'calendar/CurrentTimeIndicator':{kind:'CalendarWeekView',sequence:'communication-calendar-week',fixture:'calendar/CalendarWeekView',sharedBehaviorKey:'calendar/CalendarWeekView',directControlRole:'display-only indicator within the shared week fixture'},
    'calendar/CalendarDayView':{kind:'CalendarDayView',sequence:'communication-calendar-day',fixture:'calendar/CalendarDayView',steps:[
      ['day-scroll-late-events','.ely-calendar-time-grid','Native wheel scroll changes the grid scroll position and makes the 15:00 and 17:00 fixture event controls reachable'],
      ['day-open-samples','.ely-calendar-time-grid [data-ely-calendar-event][value="samples"]','Native click requests open-event(samples)'],
      ['day-open-client','.ely-calendar-time-grid [data-ely-calendar-event][value="client"]','Native click requests open-event(client)'],
      ['day-create-event','.ely-calendar-time-slot[data-ely-date="2026-10-13"][data-ely-time="16:00"]','Native drag from the exact Tuesday 16:00 slot to 16:30 requests create-event(start,end)'],
    ]},
    'calendar/TimezoneOverlay':{kind:'CalendarDayView',sequence:'communication-calendar-day',fixture:'calendar/CalendarDayView',sharedBehaviorKey:'calendar/CalendarDayView',directControlRole:'display-only overlay within the shared day fixture'},
    'calendar/EventPopover':{kind:'EventPopover',sequence:'communication-event-popover',fixture:'calendar/EventPopover',steps:[
      ['popover-open','[data-calendar-popover-open]','Native click opens the default Design review details and exposes aria-expanded=true'],
      ['popover-edit','[data-calendar-popover] [data-ely-action="edit-event"]','Native click emits exactly the local edit-event request for review; no provider or persistence result is asserted'],
      ['popover-delete','[data-calendar-popover] [data-ely-action="delete-event"]','Native click emits exactly the local delete-event request for review; no provider or persistence result is asserted'],
      ['popover-close','[data-calendar-popover-close]','Native Close hides the panel, clears aria-expanded and restores focus to the trigger'],
      ['popover-reopen','[data-calendar-popover-open]','Native click reopens the same details panel'],
      ['popover-escape','[data-calendar-popover]','Native Escape closes the panel and restores focus to the trigger'],
    ]},
    'calendar/AttendeeList':{kind:'EventPopover',sequence:'communication-event-popover',fixture:'calendar/EventPopover',sharedBehaviorKey:'calendar/EventPopover',directControlRole:'display-only attendee content within the shared popover fixture'},
  }[identity];
  if(communicationBehavior){
    const behavior=communicationBehavior.sharedBehaviorKey?requestedStateContract(communicationBehavior.sharedBehaviorKey):communicationBehavior;
    const steps=behavior.steps.map(step=>{const [id,control,expectedState]=Array.isArray(step)?step:[step.id,step.control,step.expectedState];return {id,control,expectedState,event:id==='eval-scroll-last-column'?'conditional trusted native horizontal wheel or passive geometry read; no host action expected':'trusted native Playwright pointer, keyboard, or wheel input',source:{siteId:`communication-state:${identity}:${id}`,sourceAnchor:`internal/gallery/advanced_communication_fixtures.go ${communicationBehavior.fixture}; ui/gohtmx/templates/ely-api-communication.html; ui/gohtmx/assets/ely-api-communication.js`,provenance:`Exact gallery identity ${identity}; shared behavior is retained under its canonical fixture identity${communicationBehavior.sharedBehaviorKey?` ${communicationBehavior.sharedBehaviorKey}`:''}; caller requests only, no external service or persistence result`}};});
    return {identity,kind:communicationBehavior.kind,variant:identity.split('/')[1],fixtureIdentity:`execution-fixture:${communicationBehavior.fixture}`,requestedStateOnly:true,focusedSequence:communicationBehavior.sequence,mappingGaps:[],fixtureGuards:{component:identity,kind:communicationBehavior.kind},behaviorKey:communicationBehavior.sharedBehaviorKey||identity,directControlRole:communicationBehavior.directControlRole||'interactive local control in the default fixture',steps,
      scope:'Only this shipped communication gallery identity and its documented default fixture. Alias roots keep distinct case/profile evidence but reuse the canonical handler sequence; no external provider, persistence, locale matrix, or unrelated nested-content claim.'};
  }
  if(identity==='documents/TrashBin'){
    if(!trashFixture)return null;
    assert(['default','empty','longpath'].includes(trashFixture),'Unknown explicit Trash fixture');
    const steps=[['inspect-layout','[data-ws-trash]','Full readable default/empty/long-path state stays inside its own card']];
    if(trashFixture!=='empty')steps.push(
      ['restore','[data-ely-action="restore-file"]','One exact restore request; caller records remain'],
      ['delete-arm','[data-ely-action="delete-file-permanently"]','First press only exposes complete Confirm delete label'],
      ['delete-blur-restore','[data-ely-action="restore-file"]','Native focus loss cancels delete; only restore request emitted'],
      ['delete-rearm','[data-ely-action="delete-file-permanently"]','First press after blur arms again without delete'],
      ['delete-confirm','[data-ely-action="delete-file-permanently"]','Second press emits exactly one delete request; caller records remain'],
      ['empty-arm','[data-ely-action="empty-trash"]','First press only exposes complete Confirm empty trash label'],
      ['empty-blur-restore','[data-ely-action="restore-file"]','Native focus loss cancels empty; only restore request emitted'],
      ['empty-rearm','[data-ely-action="empty-trash"]','First press after blur arms again without empty request'],
      ['empty-confirm','[data-ely-action="empty-trash"]','Second press emits exactly one empty request; caller records remain']);
    return {identity,kind:'TrashBin',trashFixture,requestedStateOnly:true,mappingGaps:[],fixtureGuards:{component:identity,kind:'TrashBin'},steps:steps.map(([id,control,expectedState])=>({id,control,expectedState,event:id==='inspect-layout'?'passive rendered-state inspection':'trusted native pointer click',source:{siteId:`trash-state:${trashFixture}:${id}`,sourceAnchor:'ely-api-workspace.html ws-trash; ely-api-workspace.js capture confirmation/focusout; ely-api.js action dispatch',provenance:'Explicit action-only Trash fixture; no alias, canonical initial inventory or host persistence approval'}})),scope:'Only selected opt-in Trash fixture; passive empty-state inspection is not an action; restore/delete/empty are host requests, never local persistence'};
  }
  const canvasIdentity=['canvas/InfiniteCanvas','canvas/CanvasGrid','canvas/Guides','canvas/Ruler','canvas/ArtboardFrame','canvas/ZoomControls','canvas/ZoomIndicator','canvas/MiniMap'].includes(identity);
  const focused={
    'devtools/WebSocketConsole':{kind:'WebSocketConsole',sequence:'websocket-public-host-boundary',steps:[
      ['empty-enter','[data-dt-socket-draft]','Empty Enter emits no request'],
      ['type-ping','[data-dt-socket-draft]','Trusted typing enables Send without sending'],
      ['send-enter','[data-dt-socket-draft]','Enter sends ping once and clears draft without fabricating messages'],
      ['type-pong','[data-dt-socket-draft]','Trusted typing enables Send again'],
      ['send-button','[data-dt-socket-send]','Native Send sends pong once and clears draft'],
      ['request-disconnect','[data-dt-socket-toggle]','Request carries current open state; no optimistic disconnect'],
      ['host-ack-closed','root ely:result','Explicit synthetic host acknowledgement rerenders closed state'],
      ['type-closed-draft','[data-dt-socket-draft]','Closed draft queued is retained; Send stays disabled'],
      ['closed-enter','[data-dt-socket-draft]','Closed Enter cannot send or clear queued draft'],
      ['clear-closed-draft','[data-dt-socket-draft]','Native select-all/Backspace clears draft without a request'],
      ['request-connect','[data-dt-socket-toggle]','Request carries current closed state; no optimistic connection'],
      ['host-ack-open','root ely:result','Explicit synthetic acknowledgement restores open state and original messages'],
    ]},
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
      'devtools/WebSocketConsole':'Only canonical source-backed Devtools WebSocketConsole fixture; advanced_workspace_devtools.go and ely-api-workspace-devtools.js socket(); native edits/keys/clicks plus separately labelled synthetic root host acknowledgements; no registered-site or networking approval',
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
    const steps=focused.steps.map(([id,control,expectedState])=>({id,control,expectedState,event:identity==='devtools/WebSocketConsole'&&id.startsWith('host-ack-')?'synthetic controlled host acknowledgement, not trusted user input':identity==='tooling/EventLogger'?'synthetic public DOM event via Playwright':id.startsWith('disabled-')?'native HTMLButtonElement.click (disabled negative; not trusted pointer input)':'native Playwright action',source:{siteId:`focused-state:${identity}:${id}`,sourceAnchor:null,provenance}}));
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

export function assertTrashLayout(observed){
  const finite=box=>['left','top','right','bottom'].every(key=>Number.isFinite(box[key]))&&box.right>box.left&&box.bottom>box.top;
  assert(finite(observed.card),'Actual trash card must have positive finite bounds');
  assert(observed.boxes.length,'Visible card content required');
  for(const box of observed.boxes){
    assert(finite(box),'Visible content needs actual positive bounds');
    for(const key of ['left','top'])assert(box[key]>=observed.card[key]-.5,`Trash ${box.label} escapes card ${key}`);
    for(const key of ['right','bottom'])assert(box[key]<=observed.card[key]+.5,`Trash ${box.label} escapes card ${key}`);
    if(box.kind==='button'){assert(box.scrollWidth<=box.clientWidth+1,'Button label horizontally clipped');assert(box.scrollHeight<=box.clientHeight+1,'Button label vertically clipped');}
  }
  const overlap=(a,b)=>Math.min(a.right,b.right)-Math.max(a.left,b.left)>.5&&Math.min(a.bottom,b.bottom)-Math.max(a.top,b.top)>.5;
  for(let i=0;i<observed.boxes.length;i++)for(let j=i+1;j<observed.boxes.length;j++){
    const a=observed.boxes[i],b=observed.boxes[j];
    if((a.kind==='button'&&b.kind==='button')||(a.kind==='button'&&!b.insideButton&&b.kind==='text')||(b.kind==='button'&&!a.insideButton&&a.kind==='text'))assert(!overlap(a,b),'Trash controls overlap another control or caller text');
  }
}

export const threewaySourcePins={
  'internal/gallery/advanced_workspace_fixtures.go':'c80d3265b34db38b95bdf67816e54b9e794dae140754c7efbefd5d8567dc9a8f',
  'ui/gohtmx/templates/ely-api-workspace.html':'f66a0245d2287fb20a12355a7989b4af8151cc9497707a84667baebd78cf698b',
  'ui/gohtmx/assets/ely-api-workspace.js':'5c38659eb2af5a3ee65bc1bc452f6c687ab1092b001758959af07ce50272f455',
};
export function assertThreewayState(state,{id,stage,twin}){
  assert(['initial','choose-theirs','edit-merged','submit-merged'].includes(stage));
  assert.equal(state.primary,true,'Exact behavioral primary, not a nested preview');
  assert.equal(state.id,id);assert.equal(state.component,'git/ThreeWayMerge');assert.equal(state.kind,'ThreeWayMerge');
  assert.deepEqual(state.panes,[['ours','main','return callerOld'],['base','base','return callerBase'],['theirs','feature/caller','return callerNew']]);
  assert.equal(state.action,'operate');assert.equal(state.required,true);assert.equal(state.disabled,false);
  assert.deepEqual(state.twin,twin);assert.deepEqual(state.twinEvents,[]);
  const initial=stage==='initial',edited=stage==='edit-merged'||stage==='submit-merged';
  assert.deepEqual(state.checked,initial?['ours']:['theirs']);
  assert.equal(state.value,initial?'return callerOld':edited?'resolved caller value':'return callerNew');
  assert.equal(state.status,initial?'':'Selected theirs.');
  const detail={id,component:'git/ThreeWayMerge'},events=initial?[]:[
    {type:'ely:change',detail:{...detail,name:'resolution',value:'theirs',checked:true,type:'radio'}},
    {type:'ely:change',detail:{...detail,name:'merged',value:'return callerNew'}},
  ];
  if(edited)events.push({type:'ely:change',detail:{...detail,name:'merged',value:'resolved caller value',checked:undefined,type:'textarea'}});
  if(stage==='submit-merged')events.push({type:'ely:action',detail:{...detail,action:'operate',submitter:'',formData:[['resolution','theirs'],['merged','resolved caller value']],values:[['resolution','theirs'],['merged','resolved caller value']]},actualFormData:true});
  assert.deepEqual(state.events,events);
  const native=initial?[]:[['click','resolution','theirs'],['input','resolution','theirs'],['change','resolution','theirs']];
  if(edited)native.push(['input','merged','resolved caller value'],['change','merged','resolved caller value']);
  if(stage==='submit-merged')native.push(['click','',''],['submit',null,null]);
  assert.deepEqual(state.native.map(event=>[event.type,event.name,event.value]),native);
  assert(state.native.every(event=>event.trusted===true),'Every recorded native event must be trusted');
  const timeline=initial?[]:['click','input','change','ely:change:resolution','ely:change:merged'];
  if(edited)timeline.push('input','change','ely:change:merged');
  if(stage==='submit-merged')timeline.push('click','submit','ely:action:operate');
  assert.deepEqual(state.timeline,timeline,'Native and public events retain their combined causal order');
}

export async function threewayCleanup(cleanup,primaryFailed,failureDiagnostics){
  try{await cleanup();}
  catch(cleanupError){
    // The runner owns this bounded channel before any capture/action receipt.
    // Never let diagnostic formatting or attachment replace either real error.
    let text='[unprintable cleanup error]';
    try{text=String(cleanupError).slice(0,1000);}catch{}
    try{failureDiagnostics.threewayCleanupFailures.push({phase:'threeway-listener-cleanup',error:text,primaryFailed});}catch{}
    if(!primaryFailed)throw cleanupError;
  }
}

export function assertVerticalRangeSnapshot(identity,stage,state,twinHTML){
  assert(['layout/Scrollbar','layout/StickyHeader'].includes(identity),'Only the two canonical vertical range identities are covered');
  assert(['range-top-min-pointer','range-bottom-max-pointer','range-center-pointer','range-home-min','range-end-max','content-wheel-up','scroll-home-min','scroll-end-max'].includes(stage),'Unknown vertical range state');
  assert.equal(state.component,identity);assert.equal(state.direction,'ltr');assert.equal(state.writingMode,'vertical-lr');
  assert(state.rect.height>state.rect.width,'The native range must be physically vertical');
  assert(state.scrollMax>0);assert.equal(state.scrollMax,state.scrollHeight-state.clientHeight);assert.equal(state.scrollLeft,0);assert.equal(state.documentScrollTop,state.previousDocumentScrollTop,'The page must not jump while operating the local scroll fixture');
  assert(state.value>=0&&state.value<=1000);assert(Math.abs(state.scrollTop-state.scrollMax*state.value/1000)<=1,'Native range value must map to vertical scrollTop');
  if(stage==='range-top-min-pointer'||stage==='range-home-min'||stage==='scroll-home-min'){assert.equal(state.value,0);assert.equal(state.scrollTop,0);}
  if(stage==='range-bottom-max-pointer'||stage==='range-end-max'||stage==='scroll-end-max'){assert.equal(state.value,1000);assert.equal(state.scrollTop,state.scrollMax);}
  if(stage==='range-center-pointer')assert(state.value>0&&state.value<1000,'A center pointer action must select an interior range value');
  if(stage.startsWith('range-')){
    assert(state.nativeEvents.some(event=>event.type==='input'&&event.trusted===true),'Each native range action must emit trusted input');
    assert(state.nativeEvents.every(event=>event.trusted===true),'Native range events must remain trusted');
    if(stage.endsWith('-pointer'))assert(state.nativeEvents.some(event=>event.type==='pointerdown')&&state.nativeEvents.some(event=>event.type==='click'),'Range selection must use a real pointer path');
    if(stage==='range-home-min'||stage==='range-end-max')assert(state.nativeEvents.some(event=>event.type==='keydown'&&event.key===(stage==='range-home-min'?'Home':'End')),'Range endpoint selection must use its native key');
    const nativeChanges=state.nativeEvents.filter(event=>event.type==='change');
    assert.equal(nativeChanges.length,1,'Each changed native range action must emit exactly one native change');
    const nativeChange=nativeChanges[0];assert.equal(nativeChange.trusted,true);
    assert.equal(nativeChange.name,'');assert.equal(nativeChange.checked,false);assert.equal(nativeChange.controlType,'range');
    assert.deepEqual(state.publicEvents,[{type:'ely:change',detail:{id:state.id,component:identity,name:'',value:nativeChange.value,checked:false,type:'range'}}],'Core API must forward the trusted native range change exactly once');
  }else assert.deepEqual(state.publicEvents,[],'Wheel and scroll-region keys do not dispatch public host changes');
  if(stage==='content-wheel-up')assert(state.regionEvents.some(event=>event.type==='wheel'&&event.target==='content'&&event.trusted===true&&event.deltaY<0),'Scroll content must receive a trusted upward wheel; range input is not required');
  if(stage==='scroll-home-min'||stage==='scroll-end-max')assert(state.regionEvents.some(event=>event.type==='keydown'&&event.target==='region'&&event.trusted===true&&event.key===(stage==='scroll-home-min'?'Home':'End')),'Content endpoint selection must use its trusted native key');
  assert.equal(state.twinHTML,twinHTML,'The independent twin must remain unchanged');assert.deepEqual(state.twinEvents,[]);
}

export function assertCommunicationCallerRequest(actions,offset,identity,action,value){
  assert(Array.isArray(actions)&&Number.isInteger(offset)&&offset>=0&&offset<=actions.length,'Caller request observation offset must be valid');
  const emitted=actions.slice(offset);assert.equal(emitted.length,1,'One native activation must emit exactly one new caller request');
  const event=emitted[0];assert.equal(event.action,action,'Native activation emitted the wrong caller request');assert.equal(event.component,identity,'Caller request must retain the exact gallery identity');
  if(value!==undefined)assert.equal(event.value,value,'Caller request must retain the exact default-fixture value');
  return {event,nextOffset:actions.length};
}

export function assertDockCallerAction(actions,offset,identity,value,dock){
  assert(Array.isArray(actions)&&Number.isInteger(offset)&&offset>=0&&offset<=actions.length,'Dock action observation offset must be valid');
  const emitted=actions.slice(offset);assert.equal(emitted.length,1,'One native Dock activation must emit exactly one caller request');
  const event=emitted[0];assert.equal(event.action,'change');assert.equal(event.component,identity);assert.equal(event.value,value);
  if(dock!==undefined)assert.equal(event.dock,dock);
  return actions.length;
}

export function assertNativeEmbedOpen({actions,clicks,identity,rootId,url,before,after}){
  assert(Array.isArray(actions)&&actions.length===1,'One native Embed activation must emit exactly one host action');
  const action=actions[0];assert.equal(action.action,'open');assert.equal(action.value,url,'Host request must preserve the exact fixture URL');assert.equal(action.component,identity,'Host request must preserve the canonical or alias identity');assert.equal(action.id,rootId,'Host request must preserve the exact rendered root ID');
  assert(Array.isArray(clicks)&&clicks.length===1,'One native Embed activation must produce exactly one observed button click');
  const click=clicks[0];assert.equal(click.trusted,true,'Embed activation must be trusted browser input, not synthetic dispatch');assert.equal(click.action,'open');assert.equal(click.value,url);assert.equal(click.component,identity);assert.equal(click.id,rootId);
  assert.deepEqual(after,before,'Opening through the host must not mutate the local Embed fixture');
  return {identity,rootId,url,action:'open',trustedClick:true,localStateUnchanged:true};
}

export function assertDockNativeEvents(stepId,events,label){
  assert(Array.isArray(events)&&events.length>0,'Dock input must produce observed native browser events');
  assert(events.every(event=>event.trusted===true),'Dock input must be trusted browser input, not dispatched synthetic events');
  if(stepId.startsWith('dock-click-')){
    const clicks=events.filter(event=>event.type==='click');assert.equal(clicks.length,1);assert.equal(clicks[0].tab,label);assert(clicks[0].detail>0,'Mouse click must retain pointer activation detail');
  }else if(stepId==='dock-key-enter-search'||stepId==='dock-key-space-search'){
    const isEnter=stepId==='dock-key-enter-search',key=isEnter?'Enter':' ',sequence=events.filter(event=>['keydown','keyup','click'].includes(event.type));
    const expectedOrder=isEnter?['keydown','click','keyup']:['keydown','keyup','click'];
    assert.deepEqual(sequence.map(event=>event.type),expectedOrder,`Native ${isEnter?'Enter':'Space'} button activation must follow its browser key order`);
    assert(sequence.every(event=>event.tab===label),'Keyboard activation must stay on the requested Dock button');
    assert.equal(sequence.find(event=>event.type==='keydown').key,key);assert.equal(sequence.find(event=>event.type==='keyup').key,key);
    assert.equal(sequence.find(event=>event.type==='click').detail,0,'Keyboard-generated click must not masquerade as pointer input');
  }else if(stepId==='dock-drag-files-center'){
    const start=events.find(event=>event.type==='dragstart'),drop=events.find(event=>event.type==='drop');
    assert(start&&drop,'Native drag must reach both dragstart and drop');assert.equal(start.tab,label);assert.equal(drop.zone,'center');assert.equal(drop.transferText,label,'Drop must carry the browser DataTransfer text from the source tab');
  }else assert.fail(`Unknown Dock native-input checkpoint ${stepId}`);
  return {stepId,label,trusted:true};
}

export function assertEvalLastColumnGeometry({scrollLeft,previousScrollLeft,scrollWidth,clientWidth,columns,actionsBefore,actionsAfter,initiallyVisible,didScroll}){
  assert.equal(actionsAfter,actionsBefore,'Reading the final table column must not emit a host action');
  assert.equal(columns.length,6,'The final Time header and all five fixture values must be present');
  if(scrollWidth>clientWidth&&!initiallyVisible)assert.equal(didScroll,true,'An initially clipped final column requires native horizontal wheel input');
  if(didScroll)assert(scrollLeft>previousScrollLeft,'Native horizontal wheel input must advance the local scroll owner');
  assert(columns.every(column=>column.insideRoot&&column.insideClip),'The Time header and every Time value must be reachable within the component root and local scrollport');
  return {overflow:scrollWidth>clientWidth,scrollLeft,columns};
}

export async function runRequestedStateActions(contract,root,runStep,failureDiagnostics){
  if(contract.focusedSequence==='native-embed-open-host'){
    const {identity,kind}=contract,url='https://example.com';assert(['misc/IframeEmbed','misc/EmbedCard'].includes(identity));assert.equal(kind,'IframeEmbed');
    const button=root.locator('header button[data-ely-action="open"][data-value="https://example.com"]');assert.equal(await button.count(),1,'The exact default host-open button must remain present');assert.equal(await button.isEnabled(),true,'The default host-open button must remain enabled');
    const rootId=await root.getAttribute('id'),snapshot=()=>root.evaluate(node=>{const open=node.querySelector('header button[data-ely-action="open"][data-value="https://example.com"]'),note=node.querySelector('[data-misc-source-note]');return {id:node.id,component:node.dataset.elyComponent,kind:node.dataset.elyKind,button:open?{action:open.dataset.elyAction,value:open.dataset.value,disabled:open.disabled,ariaLabel:open.getAttribute('aria-label')}:null,sourceNote:note?.textContent.trim()||null,iframeCount:node.querySelectorAll('iframe').length};});
    const before=await snapshot();assert.deepEqual(before,{id:rootId,component:identity,kind:'IframeEmbed',button:{action:'open',value:url,disabled:false,ariaLabel:'Open with host'},sourceNote:'Web views need macOS for now.',iframeCount:0},'Default note, enabled header action, exact URL, and no-provider frame state are required');
    await root.evaluate(node=>{const proof={clicks:[]};proof.listener=event=>{const target=event.target.closest?.('header button[data-ely-action="open"]');if(!target||target.closest('[data-ely-family]')!==node)return;proof.clicks.push({trusted:event.isTrusted,action:target.dataset.elyAction,value:target.dataset.value,id:node.id,component:node.dataset.elyComponent});};node.__nativeEmbedProof=proof;node.addEventListener('click',proof.listener,true);});
    try{await runStep(contract.steps[0].id,()=>button.click(),async state=>{const after=await snapshot(),clicks=await root.evaluate(node=>node.__nativeEmbedProof.clicks);return assertNativeEmbedOpen({actions:state.actions,clicks,identity,rootId,url,before,after});});}
    finally{await root.evaluate(node=>{const proof=node.__nativeEmbedProof;if(proof)node.removeEventListener('click',proof.listener,true);delete node.__nativeEmbedProof;});}
    return;
  }
  if(contract.focusedSequence==='dock-native-actions'){
    const identity='layout/Dock';assert.equal(contract.identity,identity);assert.equal(contract.kind,'Dock');assert.equal(await root.getAttribute('data-ely-component'),identity);assert.equal(await root.getAttribute('data-ely-kind'),'Dock');
    let actionOffset=0,nativeOffset=0;
    await root.evaluate(node=>{node.__visualDockNativeEvents=[];for(const type of ['click','keydown','keyup','dragstart','dragenter','dragover','dragleave','drop','dragend'])node.addEventListener(type,event=>{const tab=event.target.closest?.('[data-foundation-dock-tab]'),zone=event.target.closest?.('[data-foundation-dock-zone]');node.__visualDockNativeEvents.push({type,trusted:event.isTrusted,key:event.key||null,detail:event.detail??null,tab:tab?.textContent.trim()||null,zone:zone?.dataset.foundationDockZone||null,transferText:type==='drop'?event.dataTransfer?.getData('text/plain')||null:null});},true);});
    const nativeSinceOffset=async()=>root.evaluate((node,offset)=>node.__visualDockNativeEvents.slice(offset),nativeOffset);
    const assertLocalSelection=async(zone,label)=>root.locator(`[data-foundation-dock-zone="${zone}"]`).evaluate((node,wanted)=>{const tabs=[...node.querySelectorAll('[data-foundation-dock-tab]')],selected=tabs.filter(tab=>tab.getAttribute('aria-selected')==='true').map(tab=>tab.textContent.trim()),target=tabs.find(tab=>tab.textContent.trim()===wanted);return {selected,labelSelected:target?.getAttribute('aria-selected')==='true',output:node.querySelector('output')?.textContent.trim()||''};},label);
    for(const [id,zone,index,label]of [['dock-click-files','left',0,'Files'],['dock-click-outline','left',1,'Outline'],['dock-click-search','right',0,'Search'],['dock-click-terminal','bottom',0,'Terminal']]){
      const tab=root.locator(`[data-foundation-dock-zone="${zone}"] [data-foundation-dock-tab]`).nth(index);assert.equal(await tab.count(),1,`Exact ${label} tab required in ${zone} zone`);
      await runStep(id,()=>tab.click(),async state=>{const events=await nativeSinceOffset();assertDockNativeEvents(id,events,label);nativeOffset+=events.length;actionOffset=assertDockCallerAction(state.actions,actionOffset,identity,label);const local=await assertLocalSelection(zone,label);assert.deepEqual(local,{selected:[label],labelSelected:true,output:`${label} panel`});return {zone,label,local};});
    }
    const search=root.locator('.ely-foundation__dock-right [data-foundation-dock-tab]');
    for(const [id,key]of [['dock-key-enter-search','Enter'],['dock-key-space-search','Space']])await runStep(id,()=>search.press(key),async state=>{const events=await nativeSinceOffset();assertDockNativeEvents(id,events,'Search');nativeOffset+=events.length;actionOffset=assertDockCallerAction(state.actions,actionOffset,identity,'Search');const local=await assertLocalSelection('right','Search');assert.deepEqual(local,{selected:['Search'],labelSelected:true,output:'Search panel'});assert.equal(await search.evaluate(node=>node===document.activeElement),true,'Keyboard Dock activation must retain focus on its native button');return {key,local,focused:true};});
    const source=root.locator('.ely-foundation__dock-left [data-foundation-dock-tab]').filter({hasText:'Files'}),target=root.locator('[data-foundation-dock-zone="center"]');assert.equal(await source.count(),1);assert.equal(await target.count(),1);
    await runStep('dock-drag-files-center',()=>source.dragTo(target),async state=>{const events=await nativeSinceOffset();assertDockNativeEvents('dock-drag-files-center',events,'Files');nativeOffset+=events.length;actionOffset=assertDockCallerAction(state.actions,actionOffset,identity,'Files','center');const moved=await root.evaluate(node=>{const left=node.querySelector('.ely-foundation__dock-left'),center=node.querySelector('[data-foundation-dock-zone="center"]'),tabs=[...center.querySelectorAll('[data-foundation-dock-tab]')],tab=tabs.find(item=>item.textContent.trim()==='Files');return {remainingLeft:[...left.querySelectorAll('[data-foundation-dock-tab]')].map(item=>item.textContent.trim()),centerTabs:tabs.map(item=>item.textContent.trim()),centerSelected:tab?.getAttribute('aria-selected')==='true',output:center.querySelector('output')?.textContent.trim()||''};});assert.deepEqual(moved,{remainingLeft:['Outline'],centerTabs:['Files'],centerSelected:true,output:'Files panel'},'Native drop must move the original tab into the target zone without duplicating it');return moved;});
    return;
  }
  if(contract.focusedSequence==='foundation-native-resize'){
    const identity='layout/ResizeHandle';assert.equal(contract.identity,identity);assert.equal(contract.kind,'ResizeHandle');
    assert.equal(await root.getAttribute('data-ely-component'),identity);assert.equal(await root.getAttribute('data-ely-kind'),'ResizeHandle');
    let actionOffset=0;
    await root.evaluate(node=>{node.__requestedResizeEvents=[];node.__requestedResizeListener=event=>{const handle=event.target.closest?.('[data-foundation-split-handle]'),range=event.target.closest?.('input[type="range"]');if(handle||range)node.__requestedResizeEvents.push({type:event.type,key:event.key||null,trusted:event.isTrusted,control:handle?'separator':'range',orientation:(handle||range.closest('[data-foundation-split]')?.querySelector('[data-foundation-split-handle]'))?.getAttribute('aria-orientation')||null});};for(const type of ['pointerdown','pointermove','pointerup','keydown','input','change'])node.addEventListener(type,node.__requestedResizeListener,true);});
    const events=()=>root.evaluate(node=>node.__requestedResizeEvents);
    const split=value=>root.locator(`.ely-foundation__resize-line--${value}`),snapshot=async node=>node.evaluate(item=>({value:item.querySelector('input[type="range"]').value,aria:item.querySelector('[data-foundation-split-handle]').getAttribute('aria-valuenow'),style:item.style.getPropertyValue('--foundation-split')}));
    try{
      const horizontal=split('horizontal'),vertical=split('vertical');assert.equal(await horizontal.count(),1);assert.equal(await vertical.count(),1);
      const pointer=horizontal.locator('[data-foundation-split-handle]');
      let pointerStart=await snapshot(horizontal),pointerEvents=0;
      await runStep('resize-horizontal-pointer',async()=>{const box=await horizontal.boundingBox(),handle=await pointer.boundingBox();assert(box&&handle&&box.height>0,'The source horizontal split must provide a real pointer target');const x=handle.x+handle.width/2,y=handle.y+handle.height/2;await root.page().mouse.move(x,y);await root.page().mouse.down();await root.page().mouse.move(x,box.y+box.height*.7,{steps:3});await root.page().mouse.up();},async state=>{const after=await snapshot(horizontal),native=await events();const emitted=state.actions.slice(actionOffset);assert(emitted.length>=1,'A real split drag must report its change');assert(emitted.every(event=>event.action==='change'&&event.component===identity&&Number(event.value)>=25&&Number(event.value)<=75),'Split drag caller changes must retain identity and 25–75 bounds');actionOffset=state.actions.length;pointerEvents=native.filter(event=>event.type==='pointerdown'||event.type==='pointermove'||event.type==='pointerup');assert(pointerEvents.length>=3&&pointerEvents.every(event=>event.trusted),'ResizeHandle drag must be trusted native pointer input');assert.notEqual(after.value,pointerStart.value,'Pointer drag must move the range');assert.equal(after.value,after.aria);assert.equal(after.style,`${after.value}%`);return {before:pointerStart,after,emitted:emitted.length,trustedPointerEvents:pointerEvents.length};});
      for(const [id,owner,key,wanted]of [['resize-vertical-range-home',vertical,'Home','25'],['resize-horizontal-range-end',horizontal,'End','75']])await runStep(id,async()=>{await owner.locator('input[type="range"]').press(key);},async state=>{const after=await snapshot(owner),native=await events(),emitted=state.actions.slice(actionOffset);assert.deepEqual(emitted.map(event=>({action:event.action,component:event.component,value:String(event.value)})),[{action:'change',component:identity,value:wanted}],'Each native range endpoint must emit one exact bounded change');actionOffset=state.actions.length;assert(native.some(event=>event.type==='keydown'&&event.key===key&&event.trusted&&event.control==='range'),'Range endpoint must use trusted native keyboard input');assert.equal(after.value,wanted);assert.equal(after.aria,wanted);assert.equal(after.style,`${wanted}%`);return {key,value:after.value,aria:after.aria};});
      const horizontalHandle=horizontal.locator('[data-foundation-split-handle]');
      for(const [id,key,wanted]of [['resize-separator-arrow-up','ArrowUp','70'],['resize-separator-arrow-down','ArrowDown','75'],['resize-separator-home','Home','25'],['resize-separator-end','End','75']])await runStep(id,()=>horizontalHandle.press(key),async state=>{const after=await snapshot(horizontal),native=await events(),emitted=state.actions.slice(actionOffset);assert.deepEqual(emitted.map(event=>({action:event.action,component:event.component,value:String(event.value)})),[{action:'change',component:identity,value:wanted}],'Each separator key must produce exactly one identity-scoped bounded change');actionOffset=state.actions.length;assert(native.some(event=>event.type==='keydown'&&event.key===key&&event.trusted&&event.control==='separator'&&event.orientation==='horizontal'),'Custom separator behavior must receive trusted native keyboard input on the horizontal handle');assert.equal(after.value,wanted);assert.equal(after.aria,wanted);assert.equal(after.style,`${wanted}%`);return {key,value:after.value,aria:after.aria};});
    }finally{await root.evaluate(node=>{if(node.__requestedResizeListener)for(const type of ['pointerdown','pointermove','pointerup','keydown','input','change'])node.removeEventListener(type,node.__requestedResizeListener,true);delete node.__requestedResizeEvents;delete node.__requestedResizeListener;});}
    return;
  }
  if(contract.focusedSequence==='interaction-notification-actions'){
    const identity=contract.identity;assert(['feedback/Notification','feedback/NotificationCenter'].includes(identity));assert.equal(contract.kind,'Notification');
    assert.equal(await root.getAttribute('data-ely-component'),identity);assert.equal(await root.getAttribute('data-ely-kind'),'Notification');
    let actionOffset=0;
    await root.evaluate(node=>{node.__requestedNotificationChanges=[];node.__requestedNotificationEvents=[];node.__requestedNotificationListener=event=>{if(event.type==='ely:change'){node.__requestedNotificationChanges.push({target:event.target===node,detail:{...event.detail}});return;}if(event.type==='wheel'||event.type==='click'){const target=event.target.closest?.('[data-interaction-notification-read],[data-interaction-notification-clear],[data-interaction-notification-reset],[data-ely-action="review"]');node.__requestedNotificationEvents.push({type:event.type,trusted:event.isTrusted,control:target?.matches('[data-ely-action="review"]')?'review':target?.hasAttribute('data-interaction-notification-read')?'read':target?.hasAttribute('data-interaction-notification-clear')?'clear':target?.hasAttribute('data-interaction-notification-reset')?'reset':null});}};for(const type of ['ely:change','wheel','click'])node.addEventListener(type,node.__requestedNotificationListener,true);});
    const changes=()=>root.evaluate(node=>node.__requestedNotificationChanges),native=()=>root.evaluate(node=>node.__requestedNotificationEvents);
    const host=root.locator('.ely-interaction__notification'),rows=host.locator('[data-interaction-notification]'),read=host.locator('[data-interaction-notification-read]'),clear=host.locator('[data-interaction-notification-clear]'),reset=root.locator('[data-interaction-notification-reset]');
    const assertChange=async(before,name,value)=>{const after=await changes(),emitted=after.slice(before);assert.equal(emitted.length,1,'Each local notification control must emit exactly one change');assert.deepEqual(emitted[0],{target:true,detail:{id:await root.getAttribute('id'),component:identity,name,value}});};
    try{
      assert.equal(await rows.count(),5);assert.equal(await host.locator('[data-interaction-unread]').count(),2);assert.equal(await reset.count(),1);
      let scrollProof;
      await runStep('notification-scroll-last-row',async()=>{const list=host.locator('ol'),box=await list.boundingBox();assert(box&&box.height>0,'The source notification list must be visible');const before=await list.evaluate(node=>({top:node.scrollTop,height:node.scrollHeight,client:node.clientHeight}));const visible=()=>list.locator('[data-interaction-notification]').last().evaluate(node=>{const list=node.closest('ol'),r=node.getBoundingClientRect(),clip=list.getBoundingClientRect();return r.top>=clip.top+list.clientTop&&r.bottom<=clip.top+list.clientTop+list.clientHeight;});let didWheel=false;if(before.height>before.client&&!await visible()){await list.hover();for(let attempt=0;attempt<8&&!await visible();attempt++){await root.page().mouse.wheel(0,Math.max(100,Math.round(box.height*.7)));didWheel=true;await root.page().evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}}scrollProof={before,after:await list.evaluate(node=>({top:node.scrollTop,height:node.scrollHeight,client:node.clientHeight})),visible:await visible(),didWheel};},async state=>{assert(scrollProof.visible,'The final notification must fit inside its own list clip');assert.deepEqual(state.actions.slice(actionOffset),[],'Notification list scrolling must not emit a host action');assert.equal((await changes()).length,0,'Notification list scrolling must not emit a local state change');if(scrollProof.didWheel){assert(scrollProof.after.top>scrollProof.before.top,'Native wheel must advance an overflowing notification list');assert((await native()).some(event=>event.type==='wheel'&&event.trusted),'List reachability must use trusted wheel input');}return scrollProof;});
      await runStep('notification-open-review',async()=>{const review=host.locator('[data-ely-action="review"]');assert.equal(await review.count(),1,'The exact notification fixture must expose one Review control');await review.click();},async state=>{const result=assertCommunicationCallerRequest(state.actions,actionOffset,identity,'review','');actionOffset=result.nextOffset;const click=(await native()).filter(event=>event.type==='click');assert(click.some(event=>event.trusted&&event.control==='review'),'Review request must follow a trusted native control click');return {action:result.event.action,value:result.event.value,identity};});
      for(const [id,control,value]of [['notification-mark-all-read',read,'read-all'],['notification-clear',clear,'cleared'],['notification-reset',reset,'reset']]){
        const cursor=(await changes()).length;
        await runStep(id,()=>control.click(),async state=>{await assertChange(cursor,'notification',value);assert.deepEqual(state.actions.slice(actionOffset),[],'Local notification controls must not fabricate host requests');const result=await host.evaluate(node=>({rows:node.querySelectorAll('[data-interaction-notification]').length,unread:node.querySelectorAll('[data-interaction-unread]').length,count:node.querySelector('[data-feedback-unread]').textContent,readHidden:node.querySelector('[data-interaction-notification-read]').hidden,clearHidden:node.querySelector('[data-interaction-notification-clear]').hidden,emptyHidden:node.querySelector('[data-feedback-notification-empty]').hidden,status:node.querySelector('[data-interaction-notification-status]').textContent}));
          if(value==='read-all')assert.deepEqual(result,{rows:5,unread:0,count:'',readHidden:true,clearHidden:false,emptyHidden:true,status:'All notifications marked read'});
          else if(value==='cleared')assert.deepEqual(result,{rows:0,unread:0,count:'',readHidden:true,clearHidden:true,emptyHidden:false,status:'Notifications cleared'});
          else assert.deepEqual(result,{rows:5,unread:2,count:'2 new',readHidden:false,clearHidden:false,emptyHidden:true,status:''});
          actionOffset=state.actions.length;return result;});
      }
    }finally{await root.evaluate(node=>{if(node.__requestedNotificationListener)for(const type of ['ely:change','wheel','click'])node.removeEventListener(type,node.__requestedNotificationListener,true);delete node.__requestedNotificationChanges;delete node.__requestedNotificationEvents;delete node.__requestedNotificationListener;});}
    return;
  }
  if(contract.focusedSequence==='interaction-scroll-sync'){
    const identity=contract.identity,virtual=identity==='interaction/VirtualScroller';assert(['interaction/ScrollSync','interaction/VirtualScroller'].includes(identity));assert.equal(contract.kind,'VirtualScroller');
    assert.equal(await root.getAttribute('data-ely-component'),identity);assert.equal(await root.getAttribute('data-ely-kind'),'VirtualScroller');
    const panes=root.locator('[data-direct-sync] > div');assert.equal(await panes.count(),2,'The exact Before/After source panes are required');let actionCount;
    if(virtual){
      const scroller=root.locator('.ely-interaction__scroller[data-direct-count]');assert.equal(await scroller.count(),1);let windowBefore;
      await runStep('virtual-scroller-advance',async()=>{windowBefore=await scroller.evaluate(node=>({top:node.scrollTop,client:node.clientHeight,count:node.querySelectorAll('[data-direct-virtual-rows] > [data-index]').length,first:Number(node.querySelector('[data-direct-virtual-rows] > [data-index]')?.dataset.index)}));assert(windowBefore.client>0&&windowBefore.count>0);await scroller.hover();const box=await scroller.boundingBox();assert(box&&box.height>0);await root.page().mouse.wheel(0,Math.max(160,Math.round(box.height*.8)));await root.page().evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));},async state=>{const after=await scroller.evaluate(node=>({top:node.scrollTop,client:node.clientHeight,count:node.querySelectorAll('[data-direct-virtual-rows] > [data-index]').length,first:Number(node.querySelector('[data-direct-virtual-rows] > [data-index]')?.dataset.index),last:Number(node.querySelector('[data-direct-virtual-rows] > [data-index]:last-child')?.dataset.index)}));assert(after.top>windowBefore.top&&after.first>windowBefore.first,'Native scrolling must advance the virtual window');assert(after.count<=Math.ceil(after.client/28)+5,'VirtualScroller must retain a viewport-bounded row window');actionCount=state.actions.length;assert.equal(actionCount,0,'Virtual row scrolling is local and has no host action');return {before:windowBefore,after};});
    }
    let previous=[0,0];
    for(const [id,sourceIndex,targetIndex]of [[virtual?'virtual-sync-before-to-after':'scrollsync-before-to-after',0,1],[virtual?'virtual-sync-after-to-before':'scrollsync-after-to-before',1,0]])await runStep(id,async()=>{const source=panes.nth(sourceIndex);previous=await Promise.all([panes.nth(0).evaluate(node=>node.scrollTop),panes.nth(1).evaluate(node=>node.scrollTop)]);const box=await source.boundingBox();assert(box&&box.width>0&&box.height>0,'Exact source pane must be scrollable and visible');await source.hover();await root.page().mouse.wheel(0,Math.max(120,Math.round(box.height*.7)));await root.page().evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));},async state=>{const positions=await Promise.all([panes.nth(0).evaluate(node=>node.scrollTop),panes.nth(1).evaluate(node=>node.scrollTop)]);assert(positions[sourceIndex]>previous[sourceIndex],'Trusted native wheel must advance its source pane');assert(Math.abs(positions[0]-positions[1])<=1,'The paired pane must synchronize to the source scroll position');if(actionCount===undefined){actionCount=state.actions.length;assert.equal(actionCount,0,'Native scrolling must not emit host actions');}assert.equal(state.actions.length,actionCount,'Native scrolling must not emit host actions');return {source:sourceIndex===0?'Before':'After',before:previous,after:positions};});
    return;
  }
  if(contract.focusedSequence==='native-rtl-locale-host'){
    const identity='i18n/RTL layout';assert.equal(contract.identity,identity);assert.equal(contract.kind,'RTL layout');assert.equal(await root.getAttribute('data-ely-component'),identity);assert.equal(await root.getAttribute('data-ely-kind'),'RTL layout');
    const scope=root.locator('[data-native-locale-scope]');assert.equal(await scope.count(),1);
    const snapshot=()=>scope.evaluate(node=>({locale:node.dataset.locale,lang:node.lang,dir:node.dir,error:node.querySelector('[data-native-locale-error]')?.textContent||''}));
    const twin=()=>root.evaluate(node=>{const shell=node.closest('[data-audit-name]'),peer=shell?.querySelector('[data-audit-twin] [data-ely-family]');return peer?{html:peer.innerHTML,component:peer.dataset.elyComponent}:null;});
    const twinBefore=await twin();assert(twinBefore,'The independent RTL twin is required');assert.deepEqual(await snapshot(),{locale:'en-US',lang:'en-US',dir:'ltr',error:''});
    await root.evaluate(node=>{node.__requestedLocaleChanges=[];node.__requestedLocaleListener=event=>{if(event.type==='ely:change')node.__requestedLocaleChanges.push({target:event.target===node,detail:{...event.detail}});};node.addEventListener('ely:change',node.__requestedLocaleListener,true);});
    try{for(const [id,locale,direction]of [['rtl-locale-he','he-IL','rtl'],['rtl-locale-en-restore','en-US','ltr']]){const cursor=await root.evaluate(node=>node.__requestedLocaleChanges.length);await runStep(id,()=>root.evaluate((node,value)=>node.dispatchEvent(new CustomEvent('ely:locale',{bubbles:true,detail:{locale:value}})),locale),async state=>{const actual=await snapshot(),events=await root.evaluate((node,offset)=>node.__requestedLocaleChanges.slice(offset),cursor);assert.deepEqual(actual,{locale,lang:locale,dir:direction,error:''});assert.equal(events.length,1,'Documented locale host input must emit one local change');assert.deepEqual(events[0],{target:true,detail:{id:await root.getAttribute('id'),component:identity,locale,direction,messages:[]}});assert.deepEqual(state.actions,[],'Locale API input is not an ely:action request');assert.deepEqual(await twin(),twinBefore,'Locale change must remain bound to the requested instance');return {locale,direction,scope:actual,twinUnchanged:true,sourceInput:'documented ely:locale host event'};});}}
    finally{await root.evaluate(node=>{if(node.__requestedLocaleListener)node.removeEventListener('ely:change',node.__requestedLocaleListener,true);delete node.__requestedLocaleChanges;delete node.__requestedLocaleListener;});}
    return;
  }
  if(contract.focusedSequence?.startsWith('communication-')){
    const identity=contract.identity,grid=root.locator('.ely-calendar-time-grid');
    assert.equal(await root.getAttribute('data-ely-component'),identity,'Exact alias/canonical gallery identity is required');
    assert.equal(await root.getAttribute('data-ely-kind'),contract.kind,'Default fixture must resolve to its documented canonical kind');
    let actionOffset=0;
    const assertAction=(state,name,value)=>{const result=assertCommunicationCallerRequest(state.actions,actionOffset,identity,name,value);actionOffset=result.nextOffset;return result.event;};
    if(contract.focusedSequence==='communication-eval-sort'){
      const tokens=root.locator('[data-ely-eval-sort][value="tokens"]'),table=root.locator('table'),owner=root.locator('.ely-agent-evals');
      assert.equal(await table.locator('tbody tr').count(),5,'Default evaluation fixture must retain its five source rows');
      for(const [id,direction,firstText] of [['sort-tokens-ascending','ascending','Explain a stack trace'],['sort-tokens-descending','descending','Add a settings page']])
        await runStep(id,()=>tokens.click(),async state=>{assert.equal(await tokens.evaluate(node=>node.closest('th').getAttribute('aria-sort')),direction);assert((await table.locator('tbody tr').first().textContent()).includes(firstText),'Sorted first row must match numeric token ordering');const event=assertAction(state,'sort-evaluations');assert.equal(event.column,'tokens');assert.equal(event.direction,direction);return {column:event.column,direction:event.direction,firstRow:(await table.locator('tbody tr').first().textContent()).trim()};});
      let columnGeometry;
      await runStep('eval-scroll-last-column',async()=>{
        assert.equal(await owner.count(),1,'The evaluation table must have one local horizontal scroll owner');
        assert.equal(await owner.locator('table').count(),1);
        const previousScrollLeft=await owner.evaluate(node=>node.scrollLeft),box=await owner.boundingBox();assert(box&&box.width>0,'The local evaluation scroll owner must be visible');
        const inspect=()=>owner.evaluate(node=>{const root=node.closest('[data-ely-family]'),rootRect=root.getBoundingClientRect(),rect=node.getBoundingClientRect(),clip={left:rect.left+node.clientLeft,right:rect.left+node.clientLeft+node.clientWidth,top:rect.top+node.clientTop,bottom:rect.top+node.clientTop+node.clientHeight},table=node.querySelector('table'),cells=[table.querySelector('thead th[data-eval-column="time"]'),...table.querySelectorAll('tbody td[data-eval-column="time"]')];return {scrollLeft:node.scrollLeft,scrollWidth:node.scrollWidth,clientWidth:node.clientWidth,columns:cells.map(cell=>{const r=cell.getBoundingClientRect();return {text:cell.textContent.trim(),insideRoot:r.left>=rootRect.left&&r.right<=rootRect.right&&r.top>=rootRect.top&&r.bottom<=rootRect.bottom,insideClip:r.left>=clip.left&&r.right<=clip.right&&r.top>=clip.top&&r.bottom<=clip.bottom};})};});
        let current=await inspect();const initiallyVisible=current.columns.every(column=>column.insideRoot&&column.insideClip);let didScroll=false;
        if(current.scrollWidth>current.clientWidth&&!initiallyVisible){
          await owner.hover();
          for(let attempt=0;attempt<8&&!current.columns.every(column=>column.insideRoot&&column.insideClip);attempt++){
            await root.page().mouse.wheel(Math.max(120,Math.round(box.width*.75)),0);
            didScroll=true;
            await root.page().evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
            current=await inspect();
          }
        }
        columnGeometry={...current,previousScrollLeft,initiallyVisible,didScroll};
      },async state=>{const result=assertEvalLastColumnGeometry({...columnGeometry,actionsBefore:actionOffset,actionsAfter:state.actions.length});return {owner:{scrollLeft:result.scrollLeft,previousScrollLeft:columnGeometry.previousScrollLeft,scrollWidth:columnGeometry.scrollWidth,clientWidth:columnGeometry.clientWidth},columns:result.columns};});
      return;
    }
    if(contract.focusedSequence==='communication-calendar-month'){
      const selected=root.locator('[data-ely-calendar-day][aria-pressed="true"]');
      let beforeDate='',expectedDate='';
      await runStep('month-page-down',async()=>{beforeDate=await selected.getAttribute('value');assert.match(beforeDate,/^\d{4}-\d\d-\d\d$/,'Default month fixture must expose its selected ISO date');const [year,month,day]=beforeDate.split('-').map(Number),nextMonth=Date.UTC(year,month,1),lastDay=new Date(Date.UTC(year,month+1,0)).getUTCDate();expectedDate=new Date(nextMonth).toISOString().slice(0,8)+String(Math.min(day,lastDay)).padStart(2,'0');await selected.press('PageDown');},async state=>{const date=await root.locator('[data-ely-calendar-day][aria-pressed="true"]').getAttribute('value');assert.equal(date,expectedDate,'PageDown selection must equal the independently derived clamped next-month date');assert.equal(await root.locator('[data-ely-calendar-day][aria-pressed="true"]').evaluate(node=>node===document.activeElement),true,'PageDown must retain visible keyboard focus');const event=assertAction(state,'calendar-navigation');assert.equal(event.direction,'next');assert.equal(event.view,'month');assert.equal(event.date,expectedDate);return {beforeDate,date,focused:true};});
      await runStep('month-open-day',()=>root.locator('[data-ely-calendar-day][aria-pressed="true"]').press('Enter'),async state=>{const event=assertAction(state,'open-day',expectedDate);assert.equal(event.date,expectedDate);return {date:expectedDate,action:event.action};});
      return;
    }
    if(contract.focusedSequence==='communication-calendar-week'||contract.focusedSequence==='communication-calendar-day'){
      let previousScrollTop=0;
      const day=contract.focusedSequence==='communication-calendar-day';
      await runStep(day?'day-scroll-late-events':'week-scroll-late-events',async()=>{assert.equal(await grid.count(),1,'One native calendar time grid is required');previousScrollTop=await grid.evaluate(node=>node.scrollTop);await grid.hover();const box=await grid.boundingBox();assert(box&&box.height>0,'Calendar time grid must be visible for native wheel input');for(let attempt=0;attempt<8;attempt++){const reached=await grid.evaluate(node=>['samples','client'].every(value=>{const target=node.querySelector(`[data-ely-calendar-event][value="${value}"]`);if(!target)return false;const r=target.getBoundingClientRect(),clip=node.getBoundingClientRect();return r.top>=clip.top&&r.bottom<=clip.bottom&&r.left>=clip.left&&r.right<=clip.right;}));if(reached)break;await root.page().mouse.wheel(0,Math.max(120,Math.round(box.height*.75)));await root.page().evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));}},async()=>{const geometry=await grid.evaluate(node=>({scrollTop:node.scrollTop,grid:(()=>{const r=node.getBoundingClientRect();return {top:r.top,bottom:r.bottom,left:r.left,right:r.right};})(),events:Object.fromEntries(['samples','client'].map(value=>{const target=node.querySelector(`[data-ely-calendar-event][value="${value}"]`),r=target.getBoundingClientRect();return [value,{top:r.top,bottom:r.bottom,left:r.left,right:r.right,inside:r.top>=node.getBoundingClientRect().top&&r.bottom<=node.getBoundingClientRect().bottom&&r.left>=node.getBoundingClientRect().left&&r.right<=node.getBoundingClientRect().right}];}))}));assert(geometry.scrollTop>previousScrollTop,'Native wheel must advance the calendar grid itself');assert(Object.values(geometry.events).every(event=>event.inside),'Both target events must be wholly reachable inside the native scrollport');return {previousScrollTop,...geometry,reachable:['samples','client']};});
      for(const value of ['samples','client'])await runStep(`${day?'day':'week'}-open-${value}`,()=>grid.locator(`[data-ely-calendar-event][value="${value}"]`).click(),async state=>{const event=assertAction(state,'open-event',value);return {action:event.action,value:event.value};});
      if(day){
        await runStep('day-create-event',async()=>{const start=grid.locator('.ely-calendar-time-slot[data-ely-date="2026-10-13"][data-ely-time="16:00"]'),end=grid.locator('.ely-calendar-time-slot[data-ely-date="2026-10-13"][data-ely-time="16:30"]');assert.equal(await start.count(),1,'Exactly one Tuesday 16:00 slot must exist');assert.equal(await end.count(),1,'Exactly one Tuesday 16:30 slot must exist');const from=await start.boundingBox(),to=await end.boundingBox();assert(from&&to&&from.width>0&&to.width>0&&to.y>from.y,'Adjacent Tuesday slots must have visible, increasing geometry');await root.page().mouse.move(from.x+from.width/2,from.y+1);await root.page().mouse.down();await root.page().mouse.move(to.x+to.width/2,to.y+1,{steps:3});await root.page().mouse.up();},async state=>{const event=assertAction(state,'create-event');assert.equal(event.start,'2026-10-13T16:00');assert.equal(event.end,'2026-10-13T16:30');return {action:event.action,start:event.start,end:event.end};});
      }else{
        await runStep('week-create-event',async()=>{const start=grid.locator('.ely-calendar-time-slot[data-ely-date="2026-10-13"][data-ely-time="16:00"]'),end=grid.locator('.ely-calendar-time-slot[data-ely-date="2026-10-13"][data-ely-time="16:30"]');assert.equal(await start.count(),1,'Exactly one Tuesday 16:00 slot must exist');assert.equal(await end.count(),1,'Exactly one Tuesday 16:30 slot must exist');const from=await start.boundingBox(),to=await end.boundingBox();assert(from&&to&&from.width>0&&to.width>0&&to.y>from.y,'Adjacent Tuesday slots must have visible, increasing geometry');await root.page().mouse.move(from.x+from.width/2,from.y+1);await root.page().mouse.down();await root.page().mouse.move(to.x+to.width/2,to.y+1,{steps:3});await root.page().mouse.up();},async state=>{const event=assertAction(state,'create-event');assert.equal(event.start,'2026-10-13T16:00');assert.equal(event.end,'2026-10-13T16:30');return {action:event.action,start:event.start,end:event.end};});
        await runStep('week-open-allday',()=>root.locator('.ely-calendar-allday [data-ely-action="open-event"][value="offsite"]').click(),async state=>{const event=assertAction(state,'open-event','offsite');return {action:event.action,value:event.value};});
      }
      return;
    }
    if(contract.focusedSequence==='communication-event-popover'){
      const trigger=root.locator('[data-calendar-popover-open]'),panel=root.locator('[data-calendar-popover]');
      await runStep('popover-open',()=>trigger.click(),async()=>{assert.equal(await panel.isVisible(),true);assert.equal(await trigger.getAttribute('aria-expanded'),'true');assert.equal(await panel.evaluate(node=>node.contains(document.activeElement)),true,'Opening must move keyboard focus into the owned details panel');return {visible:true,expanded:true,focusInside:true};});
      for(const action of ['edit-event','delete-event'])await runStep(`popover-${action==='edit-event'?'edit':'delete'}`,()=>panel.locator(`[data-ely-action="${action}"]`).click(),async state=>{const event=assertAction(state,action,'review');return {action:event.action,value:event.value};});
      await runStep('popover-close',()=>panel.locator('[data-calendar-popover-close]').click(),async()=>{assert.equal(await panel.isVisible(),false);assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await trigger.evaluate(node=>node===document.activeElement),true);return {visible:false,expanded:false,focusRestored:true};});
      await runStep('popover-reopen',()=>trigger.click(),async()=>{assert.equal(await panel.isVisible(),true);assert.equal(await trigger.getAttribute('aria-expanded'),'true');assert.equal(await panel.evaluate(node=>node.contains(document.activeElement)),true);return {visible:true,expanded:true,focusInside:true};});
      await runStep('popover-escape',()=>root.page().keyboard.press('Escape'),async()=>{assert.equal(await panel.isVisible(),false);assert.equal(await trigger.getAttribute('aria-expanded'),'false');assert.equal(await trigger.evaluate(node=>node===document.activeElement),true);return {visible:false,expanded:false,focusRestored:true};});
      return;
    }
    assert.fail(`Unknown focused communication sequence ${contract.focusedSequence}`);
  }
  if(contract.focusedSequence==='vertical-range-native-scroll'){
    assert(['layout/Scrollbar','layout/StickyHeader'].includes(contract.identity));
    const identity=contract.identity,kind=identity.split('/')[1];
    assert.equal(contract.kind,kind);assert.equal(await root.getAttribute('data-ely-component'),identity);assert.equal(await root.getAttribute('data-ely-kind'),kind);
    const range=root.locator('input[type="range"][data-foundation-scrollbar]'),scroll=root.locator('[data-foundation-scroll]');
    assert.equal(await range.count(),1);assert.equal(await scroll.count(),1);
    const snapshot=()=>root.evaluate((node,kind)=>{
      const own=selector=>[...node.querySelectorAll(selector)].filter(child=>child.closest('[data-ely-family]')===node);
      const ranges=own('input[type="range"][data-foundation-scrollbar]'),scrolls=own('[data-foundation-scroll]');
      if(ranges.length!==1||scrolls.length!==1)throw Error('Exactly one owned native range and scroll region required');
      const input=ranges[0],region=scrolls[0],style=getComputedStyle(input),rect=input.getBoundingClientRect(),record=node.closest('[data-audit-name]'),twin=record?.querySelector('[data-audit-twin]>[data-ely-family]');
      if(!twin)throw Error('Independent vertical range twin required');
      const proof=node.__verticalRangeProof;
      return {component:node.dataset.elyComponent,kind:node.dataset.elyKind,family:node.dataset.elyFamily,id:node.id,rangeMin:Number(input.min),rangeMax:Number(input.max),value:Number(input.value),scrollTop:region.scrollTop,scrollLeft:region.scrollLeft,scrollHeight:region.scrollHeight,clientHeight:region.clientHeight,scrollMax:Math.max(0,region.scrollHeight-region.clientHeight),documentScrollTop:document.scrollingElement?.scrollTop||0,scrollRole:region.getAttribute('role'),scrollTabIndex:region.tabIndex,rect:{width:rect.width,height:rect.height},writingMode:style.writingMode,direction:style.direction,
        lineCount:kind==='Scrollbar'?region.querySelectorAll('p').length:null,stickyHeaders:kind==='StickyHeader'?[...region.querySelectorAll(':scope > section > header')].map(header=>header.textContent):null,
        twinHTML:twin.outerHTML,nativeEvents:proof?.nativeEvents||[],regionEvents:proof?.regionEvents||[],publicEvents:proof?.publicEvents||[],twinEvents:proof?.twinEvents||[]};
    },kind);
    const initial=await snapshot();
    assert.equal(initial.family,contract.family);assert.deepEqual([initial.rangeMin,initial.rangeMax],[0,1000]);assert.equal(initial.scrollRole,'region');assert.equal(initial.scrollTabIndex,0);assert(initial.scrollMax>0);
    if(kind==='Scrollbar')assert.equal(initial.lineCount,30,'Scrollbar must use its 30-line canonical fixture');
    else assert.deepEqual(initial.stickyHeaders,['Today','Yesterday','Earlier'],'StickyHeader must use its three canonical fixture groups');
    await root.evaluate(node=>{
      const proof=node.__verticalRangeProof={nativeEvents:[],regionEvents:[],publicEvents:[],twinEvents:[]},range=node.querySelector('input[type="range"][data-foundation-scrollbar]'),region=node.querySelector('[data-foundation-scroll]');
      proof.observeNative=event=>{if(event.target===range)proof.nativeEvents.push({type:event.type,key:event.key||null,value:event.target.value,trusted:event.isTrusted,...(event.type==='change'?{name:event.target.name,checked:event.target.checked,controlType:event.target.type}:{})});};
      proof.observeRegion=event=>{if(region.contains(event.target))proof.regionEvents.push({type:event.type,key:event.key||null,deltaY:event.deltaY??null,trusted:event.isTrusted,target:event.target===region?'region':'content'});};
      proof.observePublic=event=>proof.publicEvents.push({type:event.type,detail:event.detail===undefined?null:JSON.parse(JSON.stringify(event.detail))});
      proof.twin=node.closest('[data-audit-name]').querySelector('[data-audit-twin]>[data-ely-family]');proof.observeTwin=event=>proof.twinEvents.push(event.type);
      for(const type of ['input','change','keydown','keyup','pointerdown','pointerup','click'])node.addEventListener(type,proof.observeNative,true);
      for(const type of ['wheel','keydown'])region.addEventListener(type,proof.observeRegion,true);
      for(const type of ['ely:action','ely:change','ely:result'])node.addEventListener(type,proof.observePublic,true);
      for(const type of ['input','change','keydown','keyup','pointerdown','pointerup','click','ely:action','ely:change','ely:result'])proof.twin.addEventListener(type,proof.observeTwin,true);
    });
    let primaryFailed=false;
    try{
      for(const {id:stage}of contract.steps){
        let before;
        await runStep(stage,async()=>{
          before=await snapshot();
          if(stage==='range-top-min-pointer'||stage==='range-bottom-max-pointer'||stage==='range-center-pointer'){
            const box=await range.boundingBox();assert(box&&box.height>box.width,'Visible native vertical range required');
            const y=stage==='range-top-min-pointer'?2:stage==='range-bottom-max-pointer'?box.height-2:box.height/2;
            await range.click({position:{x:box.width/2,y}});
          }else if(stage==='range-home-min'||stage==='range-end-max')await range.press(stage==='range-home-min'?'Home':'End');
          else if(stage==='content-wheel-up'){
            await scroll.hover();await root.page().mouse.wheel(0,-Math.min(120,before.scrollMax/2));
            await root.page().waitForFunction(id=>{const node=document.getElementById(id),region=node?.querySelector('[data-foundation-scroll]'),input=node?.querySelector('input[type="range"][data-foundation-scrollbar]');if(!region||!input)return false;const max=Math.max(0,region.scrollHeight-region.clientHeight);return region.scrollTop>0&&region.scrollTop<max&&Math.abs(region.scrollTop-max*Number(input.value)/1000)<=1;},initial.id,{timeout:2000});
          }else{await scroll.focus();await scroll.press(stage==='scroll-home-min'?'Home':'End');}
          return {method:stage==='content-wheel-up'?'native upward wheel over scroll content':stage.startsWith('range-')&&stage.endsWith('-pointer')?'native vertical pointer on track':stage.startsWith('range-')?'native range keyboard':'native scroll-region keyboard',key:stage==='range-home-min'||stage==='scroll-home-min'?'Home':stage==='range-end-max'||stage==='scroll-end-max'?'End':null};
        },async()=>{
          const after=await snapshot();
          assertVerticalRangeSnapshot(identity,stage,{...after,previousDocumentScrollTop:before.documentScrollTop,nativeEvents:after.nativeEvents.slice(before.nativeEvents.length),regionEvents:after.regionEvents.slice(before.regionEvents.length),publicEvents:after.publicEvents.slice(before.publicEvents.length),twinEvents:after.twinEvents.slice(before.twinEvents.length)},initial.twinHTML);
          return {value:after.value,scrollTop:after.scrollTop,scrollMax:after.scrollMax,direction:after.direction,writingMode:after.writingMode,orientationRect:after.rect, trustedInput:stage.startsWith('range-'),regionEvents:after.regionEvents.slice(before.regionEvents.length),publicEvents:after.publicEvents.slice(before.publicEvents.length)};
        });
      }
    }catch(error){primaryFailed=true;throw error;}
    finally{await threewayCleanup(()=>root.evaluate(node=>{
      const proof=node.__verticalRangeProof;if(!proof)return;
      for(const type of ['input','change','keydown','keyup','pointerdown','pointerup','click'])node.removeEventListener(type,proof.observeNative,true);
      const region=node.querySelector('[data-foundation-scroll]');for(const type of ['wheel','keydown'])region?.removeEventListener(type,proof.observeRegion,true);
      for(const type of ['ely:action','ely:change','ely:result'])node.removeEventListener(type,proof.observePublic,true);
      for(const type of ['input','change','keydown','keyup','pointerdown','pointerup','click','ely:action','ely:change','ely:result'])proof.twin.removeEventListener(type,proof.observeTwin,true);
      delete node.__verticalRangeProof;
    }),primaryFailed,failureDiagnostics);}
    return;
  }
  if(contract.focusedSequence==='threeway-native-submit'){
    assert.equal(contract.identity,'git/ThreeWayMerge');
    const pinReceipts=[];
    for(const [path,sha256]of Object.entries(threewaySourcePins)){
      const bytes=await readFile(new URL('../../../../'+path,import.meta.url));
      assert.equal(createHash('sha256').update(bytes).digest('hex'),sha256,'ThreeWayMerge independent source pin: '+path);pinReceipts.push({path,sha256});
    }
    contract.sourcePins=pinReceipts;
    const snapshot=()=>root.evaluate(node=>{
      const own=selector=>[...node.querySelectorAll(selector)].filter(child=>child.closest('[data-ely-family]')===node),forms=own('form[data-ws-merge]');
      if(forms.length!==1)throw Error('Exactly one own merge form required');
      const form=forms[0],field=form.elements.namedItem('merged'),record=node.closest('[data-audit-name]'),twin=record?.querySelector('[data-audit-twin]>[data-ely-family]');
      if(!twin||twin===node)throw Error('Separate merge twin required');
      return {primary:record.dataset.auditName==='git/ThreeWayMerge'&&node.parentElement===record.querySelector('[data-audit-main]'),id:node.id,component:node.dataset.elyComponent,kind:node.dataset.elyKind,panes:[...form.querySelectorAll('[data-ws-merge-side]')].map(side=>[side.dataset.wsMergeSide,side.querySelector('h3').textContent,side.querySelector('pre').textContent]),action:form.dataset.elySubmit,required:field.required,disabled:field.disabled||form.querySelector('button[type="submit"]').disabled,checked:[...form.querySelectorAll('[name="resolution"]:checked')].map(control=>control.value),value:field.value,status:form.querySelector('[data-ws-merge-status]').textContent,twin:{html:twin.outerHTML,fields:[...twin.querySelectorAll('input,textarea,select')].map(control=>[control.name,control.value,control.checked])},events:node.__threeway?.events||[],native:node.__threeway?.native||[],timeline:node.__threeway?.timeline||[],twinEvents:node.__threeway?.twinEvents||[]};
    });
    const initial=await snapshot(),id=initial.id,twin=initial.twin;
    assertThreewayState(initial,{id,stage:'initial',twin});
    const form=root.locator(':scope > form[data-ws-merge]');
    assert.equal(await form.count(),1,'Exactly one direct behavioral form; never first nested preview');
    await root.evaluate(node=>{
      const proof=node.__threeway={events:[],native:[],timeline:[],twinEvents:[]};proof.twin=node.closest('[data-audit-name]').querySelector('[data-audit-twin]>[data-ely-family]');
      proof.observe=event=>{
        if(event.type.startsWith('ely:')){if(event.target!==node)return;const detail={...event.detail},actualFormData=detail.formData instanceof FormData;if(actualFormData)detail.formData=[...detail.formData];proof.events.push({type:event.type,detail,...(event.type==='ely:action'?{actualFormData}:{})});proof.timeline.push(event.type+':'+(detail.action||detail.name));}
        else if(event.target.closest('[data-ely-family]')===node){proof.native.push({type:event.type,name:event.type==='submit'?null:event.target.name,value:event.type==='submit'?null:event.target.value,trusted:event.isTrusted});proof.timeline.push(event.type);}
      };
      proof.observeTwin=event=>proof.twinEvents.push(event.type);
      for(const type of ['click','input','change','submit','ely:change','ely:action']){node.addEventListener(type,proof.observe,true);proof.twin.addEventListener(type,proof.observeTwin,true);}
    });
    let primaryFailed=false;
    try{
      for(const stage of contract.steps.map(step=>step.id))await runStep(stage,async()=>{
        if(stage==='choose-theirs')await form.locator('input[name="resolution"][value="theirs"]').click();
        else if(stage==='edit-merged'){await form.locator('textarea[name="merged"]').fill('resolved caller value');await form.locator('textarea[name="merged"]').press('Tab');}
        else await form.locator('button[type="submit"]').click();
        // Existing runStep persists actionActivation even when later assertions fail.
        return {stage,rawState:await snapshot(),sourcePins:pinReceipts};
      },async()=>{const state=await snapshot();contract.threewayEvidence??=[];contract.threewayEvidence.push({stage,state});assertThreewayState(state,{id,stage,twin});return {stage,state,sourcePins:pinReceipts};});
    }catch(error){primaryFailed=true;throw error;}
    finally{await threewayCleanup(()=>root.evaluate(node=>{const proof=node.__threeway;if(!proof)return;for(const type of ['click','input','change','submit','ely:change','ely:action']){node.removeEventListener(type,proof.observe,true);proof.twin.removeEventListener(type,proof.observeTwin,true);}}),primaryFailed,failureDiagnostics);}
    return;
  }
  if(contract.focusedSequence==='license-native-selection-scroll'){
    assert.equal(contract.identity,'misc/LicenseViewer');
    assert.equal(await root.getAttribute('data-ely-component'),contract.identity);
    assert.equal(await root.getAttribute('data-ely-kind'),'LicenseViewer');
    // Same repository root as the existing actions runner; never an external fallback.
    const fixtureURL=new URL('../../../../internal/gallery/assets/native-misc-fixtures.json',import.meta.url);
    const fixture=await inventoryReceipt(fixtureURL),items=fixture.data.LicenseViewer.Items;
    assert.deepEqual(items.map(item=>[item.Label,item.Version,item.License]),[['Ely GPUI Component','0.1.0','MIT'],['Lucide','1.48.0','ISC'],['Inter','4.1','OFL-1.1'],['JetBrains Mono','2.304','OFL-1.1']]);
    contract.fixtureReceipt={path:fixtureURL.pathname,sha256:fixture.sha256,contentSource:'independently source-pinned JSON, not matrix or DOM',endingSHA256:null};
    const id=await root.getAttribute('id'),page=root.page();
    const snapshot=()=>root.evaluate(node=>{
      const section=node.querySelector('[data-misc-licenses]'),buttons=[...section.querySelectorAll('[data-misc-license]')],twin=node.closest('[data-audit-name]').querySelector('[data-audit-twin]>[data-ely-family]');
      if(!twin)throw Error('Independent LicenseViewer twin required');
      return {buttons:buttons.map(button=>({label:button.dataset.title,version:button.dataset.version,license:button.dataset.license,content:button.dataset.content,pressed:button.getAttribute('aria-pressed')})),title:section.querySelector('[data-license-title]').textContent,license:section.querySelector('[data-license-name]').textContent,content:section.querySelector('pre').textContent,focus:buttons.indexOf(document.activeElement),twin:twin.outerHTML,events:node.__licenseEvents||[],native:node.__licenseNative||[],twinEvents:node.__licenseTwinEvents||[],documentX:scrollX};
    });
    const initial=await snapshot();
    const verifyLicenseSelection = (state,index) => {
      assert.equal(state.buttons.length,items.length);
      assert.deepEqual(state.buttons.map(button=>[button.label,button.version,button.license,button.content]),items.map(item=>[item.Label,item.Version,item.License,item.Content]));
      assert.deepEqual(state.buttons.map(button=>button.pressed),items.map((_item,i)=>String(i===index)));
      assert.equal(state.title,`${items[index].Label} ${items[index].Version}`);assert.equal(state.license,items[index].License);assert.equal(state.content,items[index].Content);
      assert.equal(state.twin,initial.twin);assert.deepEqual(state.twinEvents,[]);
    };
    verifyLicenseSelection(initial,0);
    await root.evaluate(node=>{
      node.__licenseEvents=[];node.__licenseNative=[];node.__licenseTwinEvents=[];
      const twin=node.closest('[data-audit-name]').querySelector('[data-audit-twin]>[data-ely-family]');node.__licenseTwin=twin;
      node.__licenseObserver=event=>{
        if(event.type.startsWith('ely:')){if(event.target===node)node.__licenseEvents.push({type:event.type,detail:{...event.detail}});}
        else if(event.target.closest?.('[data-misc-license]'))node.__licenseNative.push({type:event.type,key:event.key||null,trusted:event.isTrusted});
      };
      node.__licenseTwinObserver=event=>node.__licenseTwinEvents.push(event.type);
      for(const type of ['ely:change','ely:action','click','keydown']){node.addEventListener(type,node.__licenseObserver,true);twin.addEventListener(type,node.__licenseTwinObserver,true);}
    });
    const layout=()=>root.evaluate(node=>{
      const rect=element=>{const r=element.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
      const section=node.querySelector('[data-misc-licenses]'),article=section.querySelector('article'),pre=section.querySelector('pre');
      const chain=[];for(let current=section;current;current=current.parentElement){const style=getComputedStyle(current);chain.push({tag:current.localName,rect:rect(current),clientWidth:current.clientWidth,scrollWidth:current.scrollWidth,scrollLeft:current.scrollLeft,overflowX:style.overflowX});}
      const overlays=[...document.querySelectorAll('dialog[open],[role=dialog],[role=menu],[role=listbox]')].filter(element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return r.width>0&&r.height>0&&s.display!=='none'&&s.visibility!=='hidden';});
      return {section:rect(section),article:rect(article),pre:rect(pre),host:{clientWidth:section.parentElement.clientWidth,paddingLeft:getComputedStyle(section.parentElement).paddingLeft,paddingRight:getComputedStyle(section.parentElement).paddingRight},chain,documentX:scrollX,overlays:overlays.length};
    });
    let selected=0;
    assert.equal((await layout()).overlays,0,'Unexpected overlays block before any capture expansion');
    try{
      await runStep('inspect-license',async()=>{const metrics=await layout();assert.equal(metrics.overlays,0,'Unexpected overlay exceeds bounded License capture scope');return metrics;},async()=>{verifyLicenseSelection(await snapshot(),0);return {fixture:contract.fixtureReceipt,layout:await layout()};});
      const picks=[['pick-inter',2,null],['next-jetbrains',3,'ArrowDown'],['wrap-first',0,'ArrowDown'],['wrap-last',3,'ArrowUp'],['home-first',0,'Home'],['next-lucide',1,'ArrowDown'],['end-last',3,'End']];
      for(const [label,index,key]of picks){let before;
        await runStep(label,async()=>{before=await snapshot();assert.equal((await layout()).overlays,0);
          if(key){assert.equal(before.focus,selected,'Receiving button must retain real native focus');await page.keyboard.press(key);}
          else await root.locator('[data-misc-license]').nth(index).click();
          return {method:key?'native keyboard':'non-forced native pointer',key};
        },async()=>{const state=await snapshot();verifyLicenseSelection(state,index);assert.equal(state.focus,index,'Native activation must focus selected package before next key');assert.equal(state.documentX,before.documentX,'Whole-page horizontal scrolling is not local accessibility proof');
          assert.deepEqual(state.events.slice(before.events.length),[{type:'ely:change',detail:{id,component:contract.identity,package:items[index].Label}}]);
          const trace=state.native.slice(before.native.length);assert(trace.some(event=>event.type===(key?'keydown':'click')&&event.trusted&&(!key||event.key===key)));assert(trace.every(event=>event.trusted));assert.equal((await layout()).overlays,0);selected=index;return {selected:index,layout:await layout()};});
      }
      for(const axis of ['horizontal','text']){let before,after;
        await runStep(`scroll-license-${axis}`,async()=>{
          before=await snapshot();assert.equal((await layout()).overlays,0);
          const target=await root.evaluate((node,axis)=>{
            const section=node.querySelector('[data-misc-licenses]');let target=axis==='text'?section.querySelector('pre'):section;
            if(axis==='horizontal'){while(target&&target!==document.body&&target!==document.documentElement){const s=getComputedStyle(target);if(/^(auto|scroll)$/.test(s.overflowX)&&target.scrollWidth>target.clientWidth)break;target=target.parentElement;}if(target===document.body||target===document.documentElement)target=null;}
            if(!target)return null;const r=target.getBoundingClientRect();let left=Math.max(0,r.left),right=Math.min(document.documentElement.clientWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);
            for(let a=target.parentElement;a;a=a.parentElement){const s=getComputedStyle(a),b=a.getBoundingClientRect();if(s.overflowX!=='visible'){left=Math.max(left,b.left+a.clientLeft);right=Math.min(right,b.left+a.clientLeft+a.clientWidth);}if(s.overflowY!=='visible'){top=Math.max(top,b.top+a.clientTop);bottom=Math.min(bottom,b.top+a.clientTop+a.clientHeight);}}
            if(right<=left||bottom<=top)throw Error('Local scroll target has no visible wheel surface');node.__licenseScrollTarget=target;return {x:(left+right)/2,y:(top+bottom)/2};
          },axis);
          const metrics=()=>root.evaluate((node,axis)=>{const target=node.__licenseScrollTarget;if(!target)return null;return {offset:axis==='text'?target.scrollTop:target.scrollLeft,client:axis==='text'?target.clientHeight:target.clientWidth,extent:axis==='text'?target.scrollHeight:target.scrollWidth};},axis);
          const start=target?await metrics():null;let ending=start,attempts=0;
          if(target){await page.mouse.move(target.x,target.y);while(ending.offset+ending.client<ending.extent-1&&attempts<6){await page.mouse.wheel(axis==='horizontal'?Math.max(ending.extent,800):0,axis==='text'?Math.max(ending.extent,800):0);attempts++;await page.waitForFunction(({node,axis,offset})=>{const target=node.__licenseScrollTarget;return (axis==='text'?target.scrollTop:target.scrollLeft)>offset;},{node:await root.elementHandle(),axis,offset:ending.offset},{timeout:2000});ending=await metrics();}assert(ending.offset+ending.client>=ending.extent-1,'Bounded native wheel did not reach local endpoint');}
          after={axis,start,ending,attempts,noLocalScroller:!target};return after;
        },async()=>{const state=await snapshot();verifyLicenseSelection(state,selected);assert.deepEqual(state.events,before.events);assert.equal(state.documentX,before.documentX);assert.equal((await layout()).overlays,0);
          const visible=await root.evaluate((node,axis)=>{const element=node.querySelector(axis==='text'?'pre':'[data-license-title]'),range=document.createRange();range.selectNodeContents(element);const rects=[...range.getClientRects()];const r=axis==='text'?rects.at(-1):element.getBoundingClientRect();if(!r)return false;let left=Math.max(0,r.left),right=Math.min(document.documentElement.clientWidth,r.right),top=Math.max(0,r.top),bottom=Math.min(innerHeight,r.bottom);for(let a=element.parentElement;a;a=a.parentElement){const s=getComputedStyle(a),b=a.getBoundingClientRect();if(s.overflowX!=='visible'){left=Math.max(left,b.left+a.clientLeft);right=Math.min(right,b.left+a.clientLeft+a.clientWidth);}if(s.overflowY!=='visible'){top=Math.max(top,b.top+a.clientTop);bottom=Math.min(bottom,b.top+a.clientTop+a.clientHeight);}}return right>left&&bottom>top&&r.left>=left-1&&r.right<=right+1&&r.top>=top-1&&r.bottom<=bottom+1;},axis);
          assert(visible,'Required detail/last license line not visible through actual clip chain');return {...after,layout:await layout()};});
      }
    }finally{
      const ending=await inventoryReceipt(fixtureURL);contract.fixtureReceipt.endingSHA256=ending.sha256;
      await root.evaluate(node=>{for(const type of ['ely:change','ely:action','click','keydown']){node.removeEventListener(type,node.__licenseObserver,true);node.__licenseTwin.removeEventListener(type,node.__licenseTwinObserver,true);}delete node.__licenseScrollTarget;});
      assert.equal(ending.sha256,fixture.sha256,'Independent license fixture drifted during direct proof');
    }
    return;
  }
  if(contract.trashFixture){
    const fixture=contract.trashFixture,empty=fixture==='empty',id=fixture==='longpath'?'deleted-long':'deleted-8';
    const path=fixture==='longpath'?'docs/'+'long-unbroken-path'.repeat(12)+'/caller-notes.md':'docs/retired.md';
    const card=root.locator('[data-ws-trash]'),restore=root.locator('[data-ely-action="restore-file"]'),remove=root.locator('[data-ely-action="delete-file-permanently"]'),clear=root.locator('[data-ely-action="empty-trash"]');
    assert.equal(await card.count(),1);assert.equal(await root.getAttribute('data-ely-component'),'documents/TrashBin');
    const peer=()=>root.evaluate(node=>{const twin=node.closest('[data-audit-case]').querySelector('[data-audit-twin]>[data-ely-family]');if(!twin)throw new Error('Independent trash twin missing');return twin.outerHTML;});
    const initialPeer=await peer();
    await root.evaluate(node=>{node.__trashClicks=[];document.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&node.contains(button))node.__trashClicks.push({trusted:event.isTrusted,action:button.dataset.elyAction,value:button.value});},true);});
    const layout=async()=>{
      const observed=await card.evaluate(node=>{
        const box=r=>({left:r.left,top:r.top,right:r.right,bottom:r.bottom});
        const boxes=[...node.querySelectorAll('button')].map(button=>({kind:'button',label:button.textContent,...box(button.getBoundingClientRect()),scrollWidth:button.scrollWidth,clientWidth:button.clientWidth,scrollHeight:button.scrollHeight,clientHeight:button.clientHeight}));
        for(const element of node.querySelectorAll('strong,small,time,output,button,p'))for(const child of element.childNodes){if(child.nodeType!==Node.TEXT_NODE||!child.textContent.trim())continue;const range=document.createRange();range.selectNodeContents(child);for(const rect of range.getClientRects())boxes.push({kind:'text',insideButton:Boolean(element.closest('button')),label:child.textContent,...box(rect)});}
        const html=getComputedStyle(document.documentElement);
        return {card:box(node.getBoundingClientRect()),boxes,text:node.textContent,theme:{attribute:document.documentElement.getAttribute('data-theme'),colorScheme:html.colorScheme,paper:html.getPropertyValue('--color-paper').trim(),ink:html.getPropertyValue('--color-ink').trim(),surface:getComputedStyle(node).backgroundColor}};
      });
      assertTrashLayout(observed);
      assert.equal(await peer(),initialPeer,'Every Trash state must preserve its independent twin');
      assert.equal(await root.locator('[data-ws-trash-item]').count(),empty?0:1,'Host request must not remove caller records');
      if(empty){assert(observed.text.includes('The trash is empty'));assert.equal(await card.locator('button').count(),0);}
      else{assert.equal(await root.locator('[data-ws-trash-item]').getAttribute('data-ws-trash-item'),id);assert.equal(await root.locator('[data-ws-trash-item] strong').textContent(),path);}
      return observed;
    };
    await runStep('inspect-layout',async()=>({method:'passive rendered-state inspection'}),async()=>({fixture,layout:await layout()}));
    if(empty)return;
    const press=async(label,control,expectedAction,expectedValue,armed)=>{
      const count=await root.evaluate(node=>node.__trashClicks.length);
      await runStep(label,()=>clickVisibleControl(control),async(after,before)=>{
        const clicks=await root.evaluate(node=>node.__trashClicks);
        assert.equal(clicks.length,count+1);assert.equal(clicks.at(-1).trusted,true);
        assert.equal(clicks.at(-1).action,await control.getAttribute('data-ely-action'));
        assert.deepEqual(after.actions.slice(before.actions.length),expectedAction?[{id:await root.getAttribute('id'),component:'documents/TrashBin',action:expectedAction,value:expectedValue,formData:null,values:[]}]:[]);
        assert.equal((await restore.textContent()).trim(),'Restore');
        assert.equal((await remove.textContent()).trim(),armed==='delete'?'Confirm delete':'Delete');
        assert.equal((await clear.textContent()).trim(),armed==='empty'?'Confirm empty trash':'Empty trash');
        assert.equal(await remove.getAttribute('data-confirming')==='true',armed==='delete');
        assert.equal(await clear.getAttribute('data-confirming')==='true',armed==='empty');
        return {fixture,click:clicks.at(-1),layout:await layout(),hostPersistence:'not supplied; caller record unchanged'};
      });
    };
    await press('restore',restore,'restore-file',id);
    await press('delete-arm',remove,null,null,'delete');
    await press('delete-blur-restore',restore,'restore-file',id);
    await press('delete-rearm',remove,null,null,'delete');
    await press('delete-confirm',remove,'delete-file-permanently',id);
    await press('empty-arm',clear,null,null,'empty');
    await press('empty-blur-restore',restore,'restore-file',id);
    await press('empty-rearm',clear,null,null,'empty');
    await press('empty-confirm',clear,'empty-trash','');
    return;
  }
  if(['task-due-submit','remove-four-tags','radio-groups-reselection','eventlogger-public-timestamps','button-public-boundary','textarea-public-multiline','canvas-minimap-zoom-fit-hit-test','websocket-public-host-boundary','sheet-native-actions','bulk-canonical-zero','native-disclosure'].includes(contract.focusedSequence)){
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
    if(contract.focusedSequence==='websocket-public-host-boundary'){
      assert.equal(identity,'devtools/WebSocketConsole');
      const url='wss://stream.example.com/orders';
      const socket=()=>root.evaluate(node=>{
        const host=node.querySelector('[data-ws-devtools-source]');if(host?.dataset.kind!=='WebSocketConsole')throw new Error('Exact source-backed WebSocketConsole required');
        const panel=host.querySelector('[data-dt-panel="socket"]'),row=panel.querySelector('[data-dt-row]'),draft=panel.querySelector('[data-dt-socket-draft]'),send=panel.querySelector('[data-dt-socket-send]'),toggle=panel.querySelector('[data-dt-socket-toggle]');
        return {state:row.querySelector('[data-dt-badge]').dataset.dtBadge,url:row.children[1].textContent,draft:draft.value,sendDisabled:send.disabled,toggleDisabled:toggle.disabled,toggle:toggle.textContent,rows:[...panel.querySelector('[data-dt-socket-log]').children].map(row=>[...row.children].map(child=>child.textContent)),model:host.querySelector('[data-ws-devtools-data]').innerHTML};
      });
      const initial=await socket();
      assert.equal(initial.state,'open');assert.equal(initial.url,url);assert.equal(initial.draft,'');assert.equal(initial.sendDisabled,true);assert.equal(initial.toggle,'Disconnect');assert.equal(initial.toggleDisabled,false);
      assert.deepEqual(initial.rows.map(row=>row.slice(0,2)),[['ⓘ',`Connected to ${url}`],['↗',JSON.stringify({type:'subscribe',channel:'orders'},null,2)],['↙',JSON.stringify({type:'order',id:1011,total:42.5},null,2)]]);
      await root.evaluate(node=>{
        node.__visualSocketNative=[];
        node.__visualSocketTwinEvents=[];node.__visualSocketTwin=node.closest('[data-audit-name]').querySelector('[data-audit-twin] > [data-ely-family]');
        node.__visualSocketTwinObserver=event=>node.__visualSocketTwinEvents.push(event.type);
        for(const type of ['input','change','ely:action','ely:change','ely:result'])node.__visualSocketTwin.addEventListener(type,node.__visualSocketTwinObserver,true);
        node.__visualSocketObserver=event=>{
          if(event.type==='ely:action'){node.__visualSocketNative.push({type:event.type,detail:{...event.detail}});return;}
          if(event.type==='ely:result'){node.__visualSocketNative.push({type:event.type,trusted:event.isTrusted,root:event.target===node,action:event.detail?.action,state:event.detail?.result?.state});return;}
          const control=event.target.closest?.('[data-dt-socket-draft],[data-dt-socket-send],[data-dt-socket-toggle]');if(!control)return;
          node.__visualSocketNative.push({type:event.type,trusted:event.isTrusted,key:event.key||null,value:control.value||'',control:control.hasAttribute('data-dt-socket-draft')?'draft':control.hasAttribute('data-dt-socket-send')?'send':'toggle'});
        };
        for(const type of ['input','change','keydown','keyup','click','ely:result','ely:action'])node.addEventListener(type,node.__visualSocketObserver,true);
      });
      const native=()=>root.evaluate(node=>node.__visualSocketNative);
      let nativeCursor=0;
      const steps=[
        ['empty-enter','open','',true,null,'Enter'],
        ['type-ping','open','ping',false,null,'ping'],
        ['send-enter','open','',true,{action:'send-socket',text:'ping',url},'Enter'],
        ['type-pong','open','pong',false,null,'pong'],
        ['send-button','open','',true,{action:'send-socket',text:'pong',url},'send'],
        ['request-disconnect','open','',true,{action:'toggle-socket',state:'open',url},'toggle'],
        ['host-ack-closed','closed','',true,null,'closed'],
        ['type-closed-draft','closed','queued',true,null,'queued'],
        ['closed-enter','closed','queued',true,null,'Enter'],
        ['clear-closed-draft','closed','',true,null,'clear'],
        ['request-connect','closed','',true,{action:'toggle-socket',state:'closed',url},'toggle'],
        ['host-ack-open','open','',true,null,'open'],
      ];
      try{for(const [label,state,draft,sendDisabled,expected,activation]of steps){
        await runStep(label,async()=>{
          await begin();nativeCursor=(await native()).length;
          // Reacquire scoped locators after each host-driven ui.replaceChildren render.
          if(label.startsWith('host-ack-')){await root.evaluate((node,state)=>node.dispatchEvent(new CustomEvent('ely:result',{bubbles:true,detail:{action:'toggle-socket',result:{state}}})),activation);return {method:'synthetic root-targeted host acknowledgement',state:activation};}
          if(activation==='send'||activation==='toggle')return clickVisibleControl(root.locator(`[data-dt-socket-${activation}]`));
          const input=root.locator('[data-dt-socket-draft]');
          if(activation==='Enter')await input.press('Enter');
          else if(activation==='clear'){await input.press('ControlOrMeta+A');await input.press('Backspace');}
          else await input.pressSequentially(activation);
        },async()=>{
          const observed=await fresh();assert.deepEqual(observed.map(event=>({type:event.type,detail:event.detail})),expected?[{type:'ely:action',detail:{...expected,id,component:identity}}]:[]);
          const current=await socket();assert.equal(current.state,state);assert.equal(current.url,url);assert.equal(current.draft,draft);assert.equal(current.sendDisabled,sendDisabled);assert.equal(current.toggle,state==='open'?'Disconnect':'Connect');assert.equal(current.toggleDisabled,false);
          assert.deepEqual(current.rows,initial.rows,'No fabricated, removed, reordered or changed message');assert.equal(current.model,initial.model,'Caller fixture data remains unchanged');
          assert.deepEqual(await root.evaluate(node=>node.__visualSocketTwinEvents),[],'Actions and host replies must not reach the independent twin');
          const timeline=(await native()).slice(nativeCursor),inputs=timeline.filter(event=>event.type!=='ely:action');
          assert.deepEqual(timeline.filter(event=>event.type==='ely:action').map(event=>event.detail),expected?[{...expected,id,component:identity}]:[]);
          if(label.startsWith('host-ack-'))assert.deepEqual(inputs,[{type:'ely:result',trusted:false,root:true,action:'toggle-socket',state:activation}]);
          else{
            assert(inputs.length>0&&inputs.every(event=>event.trusted===true&&event.type!=='ely:result'),'Native evidence must be trusted; host replies require their named stage');
            if(['ping','pong','queued'].includes(activation))assert.deepEqual(inputs.filter(event=>event.type==='input').map(event=>event.value),[...activation].map((_letter,index)=>activation.slice(0,index+1)));
            else if(activation==='Enter'){assert.equal(inputs.filter(event=>event.type==='keydown'&&event.key==='Enter').length,1);assert.equal(inputs.filter(event=>event.type==='keyup'&&event.key==='Enter').length,1);if(expected){const down=timeline.findIndex(event=>event.type==='keydown'&&event.key==='Enter'),sent=timeline.findIndex(event=>event.type==='ely:action'),up=timeline.findIndex(event=>event.type==='keyup'&&event.key==='Enter');assert(down<sent&&sent<up,'Send request must occur inside native Enter dispatch');}}
            else if(activation==='clear'){assert.equal(inputs.filter(event=>event.type==='keydown'&&event.key==='Backspace').length,1);assert.deepEqual(inputs.filter(event=>event.type==='input').map(event=>event.value),['']);}
            else{assert.equal(inputs.filter(event=>event.type==='click'&&event.control===activation).length,1);assert(timeline.findIndex(event=>event.type==='click')<timeline.findIndex(event=>event.type==='ely:action'),'Host request must follow native pointer activation');}
          }
          return {state:current.state,draft:current.draft,sendDisabled:current.sendDisabled,events:observed,nativeEvents:timeline,hostAcknowledgement:label.startsWith('host-ack-')};
        });
      }}finally{await root.evaluate(node=>{for(const type of ['input','change','keydown','keyup','click','ely:result','ely:action'])node.removeEventListener(type,node.__visualSocketObserver,true);for(const type of ['input','change','ely:action','ely:change','ely:result'])node.__visualSocketTwin.removeEventListener(type,node.__visualSocketTwinObserver,true);delete node.__visualSocketTwinObserver;delete node.__visualSocketTwinEvents;delete node.__visualSocketTwin;delete node.__visualSocketObserver;delete node.__visualSocketNative;});}
      return;
    }
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
          const detail=observed[0].detail;assert.equal(detail.id,id);assert.equal(detail.component,identity);assert.equal(detail.action,'change-viewport');assert(detail.view,'Viewport action must carry the public view');
          const stops=[.1,.25,.5,.75,1,1.5,2,3,4,6,8],zoom=stops.find(value=>value>beforeZoom.view.zoom+.001)??beforeZoom.view.zoom,center={x:beforeZoom.stage.width/2,y:beforeZoom.stage.height/2};
          const expected={zoom,x:beforeZoom.view.x+center.x/beforeZoom.view.zoom-center.x/zoom,y:beforeZoom.view.y+center.y/beforeZoom.view.zoom-center.y/zoom};
          close(detail.view.zoom,expected.zoom,'Zoom-in must advance exactly one canonical zoom stop from the pre-click state');close(detail.view.x,expected.x,'Zoom-in must preserve the pre-click center anchor');close(detail.view.y,expected.y,'Zoom-in must preserve the pre-click center anchor');
          await assertWorld(detail.view);return {action:detail.action,view:detail.view,expected,preClick:beforeZoom.view,events:observed};
        });
        const afterZoom=await scene();
        await runStep('fit-canvas',async()=>{await begin();return clickVisibleControl(root.locator('[data-cs-fit]'));},async()=>{
          const observed=await fresh();assert.deepEqual(observed.map(event=>event.type),['ely:action']);
          const detail=observed[0].detail;assert.equal(detail.id,id);assert.equal(detail.component,identity);assert.equal(detail.action,'change-viewport');assert(detail.view,'Fit action must carry the public view');
          const bounds=union(afterZoom.artboards),margin=48,zoom=Math.max(.1,Math.min(1,Math.min(Math.max(1,afterZoom.stage.width-2*margin)/Math.max(1,bounds.w),Math.max(1,afterZoom.stage.height-2*margin)/Math.max(1,bounds.h))));
          const expected={zoom,x:bounds.x+bounds.w/2-afterZoom.stage.width/2/zoom,y:bounds.y+bounds.h/2-afterZoom.stage.height/2/zoom};
          close(detail.view.zoom,expected.zoom,'Fit zoom must be derived from rendered artboards and stage dimensions');close(detail.view.x,expected.x,'Fit x must center rendered artboards');close(detail.view.y,expected.y,'Fit y must center rendered artboards');
          await assertWorld(detail.view);return {action:detail.action,view:detail.view,expected,geometry:{stage:afterZoom.stage,artboards:afterZoom.artboards}};
        });
        let beforeMinimap;
        await runStep('navigate-minimap',async()=>{await begin();beforeMinimap=await scene();return clickVisibleControl(root.locator('[data-cs-minimap]'));},async()=>{
          const observed=await fresh();assert.deepEqual(observed.map(event=>event.type),['ely:action']);
          const detail=observed[0].detail;assert.equal(detail.id,id);assert.equal(detail.component,identity);assert.equal(detail.action,'change-viewport');assert(detail.view,'Minimap action must carry the public view');
          const clicks=await root.evaluate(node=>node.__visualCanvasClicks);assert.equal(clicks.length,1,'Exactly one native minimap pointer click must be observed');
          const click=clicks[0];assert.equal(click.trusted,true,'Minimap activation must use a trusted native pointer click');
          const point=await root.locator('[data-cs-minimap]').evaluate((map,click)=>{const local=new DOMPoint(click.x,click.y).matrixTransform(map.getScreenCTM().inverse());return {x:local.x,y:local.y};},click);
          const expected=assertMinimapViewport(beforeMinimap,detail.view,{bounds:beforeMinimap.mapBounds.bounds,ratio:beforeMinimap.mapBounds.ratio,point});
          await assertWorld(detail.view);return {action:detail.action,view:detail.view,expected,pointer:click};
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
  const idElements=[...document.querySelectorAll('[id]')],rootIDs=idElements.filter(element=>element.id===node.id);
  const candidates=[...document.querySelectorAll(selectorAll)]
    .filter(element=>{const rect=element.getBoundingClientRect();return rect.width>0&&rect.height>0&&element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true});})
  let calendarPanel=null;
  if(node.id&&rootIDs.length===1&&rootIDs[0]===node&&['calendar/EventPopover','calendar/AttendeeList'].includes(node.dataset.elyComponent)&&node.dataset.elyKind==='EventPopover'){
    const triggers=[...node.querySelectorAll('[data-calendar-popover-open]')];
    const references=(triggers[0]?.getAttribute('aria-controls')||'').trim().split(/\s+/).filter(Boolean);
    const visible=[...node.querySelectorAll('article[data-calendar-popover]')].filter(element=>{
      const rect=element.getBoundingClientRect();
      return element.id&&element.checkVisibility({checkOpacity:true,checkVisibilityCSS:true})&&rect.width>0&&rect.height>0;
    });
    const matchingIDs=idElements.filter(element=>element.id===references[0]);
    if(triggers.length===1&&triggers[0].getAttribute('aria-expanded')==='true'&&references.length===1&&visible.length===1&&visible[0].id===references[0]&&matchingIDs.length===1&&matchingIDs[0]===visible[0]){
      calendarPanel=visible[0];
      if(!candidates.includes(calendarPanel))candidates.push(calendarPanel);
    }
  }
  return candidates.map(element=>{
      const calendar=element===calendarPanel,selector=calendar?'article[data-calendar-popover]:visible':selectorAll;
      const inside=node.contains(element),foreign=element.closest('[data-audit-main]>[data-ely-family],[data-audit-twin]>[data-ely-family],[data-audit-main]>[data-basic-component],[data-audit-twin]>[data-basic-component]')||element.closest('[data-ely-family]');
      const explicitOwner=element.getAttribute('data-ely-owner')?.replace(/^#/,'');
      const scope=foreign&&!inside&&foreign!==node&&!owners.has(foreign.id)?'foreign-component':explicitOwner&&!owners.has(explicitOwner)?'foreign-portal-owner':owners.has(explicitOwner)?'portal-owner-attribute':references.has(element.id)?'trigger-reference':inside&&!element.matches('[role=region]')?'component-root':'unowned';
      const rect=element.getBoundingClientRect();
      return {tag:element.tagName,id:element.id||null,role:element.getAttribute('role'),text:(element.innerText||'').trim().slice(0,180),bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height},
        nativeOpen:element.matches('dialog')?element.open:null,popoverOpen:element.matches(':popover-open'),locatorSelector:selector,locatorIndex:calendar?0:[...document.querySelectorAll(selector)].indexOf(element),
        ownerID:explicitOwner||null,checkedRootID:node.id,openerReferences:[...node.querySelectorAll('[aria-controls]')].filter(control=>(control.getAttribute('aria-controls')||'').split(/\s+/).includes(element.id)).map(control=>({id:control.id||null,ariaControls:control.getAttribute('aria-controls')})),
        ownershipScope:scope,owned:['component-root','portal-owner-attribute','trigger-reference'].includes(scope)};
    });
}
