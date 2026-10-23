import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {captureTargetPNG,captureForeignPaint,screenshotWithoutCaretMutation,activeOutlineBounds} from './visual-state-audit-drivers.mjs';

// No Playwright import or browser launch: exercise the real capture function
// with explicit geometry and a synthetic PNG header, not pixel evidence.
async function capture(clip,scroll,viewport){
  const bounds={clip,negativePageOverflow:false},ownership={foreignDOMIntersections:[{id:'foreign'}],occludedForeignPaint:[]};
  let options,ownershipArgs,scrolled=false;
  const root={
    async scrollIntoViewIfNeeded(){scrolled=true;},
    async evaluate(fn,arg){
      if(fn===captureForeignPaint){ownershipArgs=arg;return ownership;}
      return scrolled?bounds:false;
    },
  };
  let evaluations=0;
  const page={
    async evaluate(){return ++evaluations===1?undefined:{scroll,viewport};},
    async screenshot(value){options=value;const png=Buffer.alloc(24);png.writeUInt32BE(clip.width,16);png.writeUInt32BE(clip.height,20);return png;},
  };
  const receipt=await captureTargetPNG(page,root,undefined,{checkedRootID:'primary'});
  assert.deepEqual(ownershipArgs,{clip,checkedRootID:'primary'},'Ownership always uses the original document clip');
  assert.deepEqual(receipt.foreignDOMIntersections,ownership.foreignDOMIntersections,'Camera selection cannot clear foreign ownership');
  assert.deepEqual(receipt.bounds.camera,{fullPage:options.fullPage,clip:options.clip});
  assert.deepEqual(receipt.bounds.clip,clip);assert.deepEqual(receipt.bounds.scroll,scroll);assert.deepEqual(receipt.bounds.viewport,viewport);
  assert.equal(options.animations,'disabled');assert.equal(options.scale,'css');
  assert.equal(options.caret,'initial');
  return receipt.bounds.camera;
}

test('action camera converts visible document bounds and preserves exact receipt coordinates',async()=>{
  const clip={x:85,y:64419,width:1270,height:340},scroll={x:0,y:64072},viewport={width:1440,height:1000};
  assert.deepEqual(await capture(clip,scroll,viewport),{fullPage:false,clip:{...clip,y:347}});
  assert.deepEqual(await capture({...clip,x:105},{x:20,y:64072.25},viewport),{fullPage:false,clip:{...clip,y:346.75}});
});

test('action camera retains document fallback for every partially offscreen painted edge',async()=>{
  const clip={x:85,y:64419,width:1270,height:340},viewport={width:1440,height:1000};
  for(const [candidate,scroll]of [
    [{...clip,width:1500},{x:0,y:64072}],
    [clip,{x:86,y:64072}],
    [clip,{x:0,y:64420}],
    [clip,{x:0,y:63000}],
  ])assert.deepEqual(await capture(candidate,scroll,viewport),{fullPage:true,clip:candidate});
  assert.deepEqual(await capture({x:0,y:64072,width:1440,height:1000},{x:0,y:64072},viewport),{fullPage:false,clip:{x:0,y:0,width:1440,height:1000}});
});

test('action camera matches the frozen baseline rule without importing its executable runner',async()=>{
  const source=await readFile(new URL('./visual-state-audit-baseline.mjs',import.meta.url),'utf8');
  const definition=source.match(/function captureCamera\(clip, scroll, viewport\) \{[\s\S]*?\n\}/)?.[0];
  assert(definition,'Pinned baseline camera rule must remain identifiable');
  const baseline=runInNewContext(`(${definition})`),clip={x:85,y:64419,width:1270,height:340},viewport={width:1440,height:1000};
  for(const scroll of [{x:0,y:64072},{x:86,y:64072},{x:0,y:63000}]){
    assert.deepEqual(await capture(clip,scroll,viewport),JSON.parse(JSON.stringify(baseline(clip,scroll,viewport))));
  }
});

test('source-only active owned outline union respects axis clips and fails closed for complex paint',async()=>{
  const box={left:85,top:100,right:285,bottom:140},bounds={clip:{x:85,y:1100,width:200,height:40},root:box,extendsRoot:false,viewportTruncated:false};
  const plain={outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'4px',outlineColor:'rgb(0,0,255)',display:'block',visibility:'visible',opacity:'1',contentVisibility:'visible',transform:'none',translate:'none',rotate:'none',scale:'none',perspective:'none',filter:'none',clipPath:'none',clip:'auto',maskImage:'none',contain:'none',zoom:'1',overflowX:'visible',overflowY:'visible',borderTopLeftRadius:'0px',borderTopRightRadius:'0px',borderBottomLeftRadius:'0px',borderBottomRightRadius:'0px'};
  const owner={},foreign={},parent={style:{...plain},parentElement:null,clientLeft:0,clientTop:0,clientWidth:200,clientHeight:40,getBoundingClientRect:()=>box};
  const active={style:{...plain},parentElement:parent,closest:()=>owner,getBoundingClientRect:()=>box,getClientRects:()=>[box]};
  const node={contains:value=>value===active,closest:()=>owner};
  const context={document:{activeElement:active},getComputedStyle:value=>value.style,scrollX:0,scrollY:1000,innerWidth:1440,innerHeight:1000,node,bounds};
  const run=()=>JSON.parse(JSON.stringify(runInNewContext(`(${activeOutlineBounds.toString()})(node,bounds)`,context)));
  assert.deepEqual(run().clip,{x:79,y:1094,width:212,height:52});
  assert.equal(run().focusOutline.status,'bounded');assert.equal(run().extendsRoot,true);
  parent.style.overflowX='hidden';assert.deepEqual(run().clip,{x:85,y:1094,width:200,height:52},'Horizontal clip must not incorrectly clip the vertical outline');
  parent.style.overflowY='hidden';assert.deepEqual(run().clip,bounds.clip);
  for(const [key,value]of [['transform','matrix(1,0,0,1,0,0)'],['clipPath','inset(1px)'],['maskImage','url(mask)'],['contain','paint']]){
    parent.style={...plain,overflowX:'hidden',[key]:value};assert.equal(run().focusOutline.status,'unsupported',key);assert.deepEqual(run().clip,bounds.clip);
  }
  parent.style={...plain,overflowX:'hidden',borderTopLeftRadius:'5px'};
  const rounded=run();
  assert.equal(rounded.focusOutline.status,'bounded','Rounded overflow uses its enclosing border-box AABB conservatively');
  assert.deepEqual(rounded.focusOutline.paint,{left:85,top:94,right:285,bottom:146},'The rounded corner may be over-included, but the enclosing paint envelope is not under-captured');
  assert.deepEqual(rounded.clip,{x:85,y:1094,width:200,height:52},'The document camera contains the full conservative rounded-clip AABB');
  parent.style={...plain};active.closest=()=>foreign;assert.equal(run().focusOutline.status,'unsupported');active.closest=()=>owner;
  active.getClientRects=()=>[box,box];assert.equal(run().focusOutline.status,'unsupported');active.getClientRects=()=>[box];
  parent.style={...plain,overflowX:'clip',overflowClipMargin:'3px'};assert.equal(run().focusOutline.status,'unsupported');parent.style={...plain};
  parent.style.visibility='hidden';assert.equal(run().focusOutline.status,'unsupported','A visible focused child can override its hidden ancestor');assert.deepEqual(run().clip,bounds.clip);parent.style={...plain};
  for(const outlineColor of ['rgb(255, 0, 0)','rgb(0, 0, 0)','rgba(255, 0, 0, 1)','rgb(255 0 0 / 100%)']){active.style={...plain,outlineColor};assert.equal(run().focusOutline.status,'bounded',outlineColor);assert.deepEqual(run().clip,{x:79,y:1094,width:212,height:52});}
  for(const outlineColor of ['transparent','rgba(255, 0, 0, 0)','rgb(255 0 0 / 0)','rgb(0 0 0 / 0%)']){active.style={...plain,outlineColor};assert.deepEqual(run(),bounds,outlineColor);}
  for(const change of [{outlineWidth:'0px'},{outlineStyle:'none'},{outlineColor:'rgba(0, 0, 255, 0)'},{visibility:'hidden'}]){active.style={...plain,...change};assert.deepEqual(run(),bounds);}
  active.style={...plain,outlineStyle:'auto'};assert.equal(run().focusOutline.status,'unsupported');
  context.document.activeElement={};assert.deepEqual(run(),bounds,'Non-target twin focus must not expand this camera');
  const source=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url),'utf8');
  assert.match(source,/countsAsOwnedEvidence:!foreignDOMIntersections\.length&&!focusOutlineGap/);
  assert.match(source,/if \(overlays\.length \|\| component\.focusOutlineGap/,'Unsupported outline requests existing viewport context');
  assert.match(source,/ownedStateEvidence:!component\.focusOutlineGap&&/,'Context cannot silently approve unsupported outline paint');
  const driver=await readFile(new URL('./visual-state-audit-drivers.mjs',import.meta.url),'utf8');
  assert.match(driver,/captureForeignPaint,\{clip:bounds\.clip,checkedRootID\}/,'Foreign ownership must use the expanded clip');
});

test('caret preparation preserves exact style presence and bytes on all controls and twins, even on throw',async()=>{
  // Model the pinned Playwright preparation/cleanup contract, not a DOM engine.
  const controls=[{id:'primary',style:null},{id:'empty',style:''},{id:'styled',style:' color: red;  caret-color: blue !important; '},{id:'non-target-twin',style:null}];
  const original=structuredClone(controls);let touched=0,finalized=0;
  const surface={async screenshot(options){
    const saved=[];
    try{
      if(options.caret!=='initial')for(const node of controls){saved.push([node,node.style]);node.style='caret-color: transparent !important;';touched++;}
      if(options.fail)throw new Error('capture failed');
      return Buffer.from('synthetic source-test receipt');
    }finally{
      // The real default cleanup restores the property, not attribute presence.
      for(const [node,style]of saved)node.style=style??'';
      finalized++;
    }
  }};
  for(let index=0;index<3;index++){
    await screenshotWithoutCaretMutation(surface,{caret:'hide'});
    assert.deepEqual(controls,original,'Absent, empty and existing attributes must remain byte-for-byte unchanged');
    await assert.rejects(screenshotWithoutCaretMutation(surface,{fail:true}),/capture failed/);
    assert.deepEqual(controls,original,'Throw/finally cannot mutate even a non-target twin');
  }
  assert.equal(finalized,6);assert.equal(touched,0,'No preparation writes or restoration that could mask application changes');
  await surface.screenshot({});
  assert.equal(controls[0].style,'');assert.equal(controls[3].style,'','Negative control reproduces default cleanup adding style to a twin');
});

test('caret-safe screenshot does not restore over genuine runtime changes and all action cameras use it',async()=>{
  const twin={style:null};
  const surface={async screenshot(options){assert.equal(options.caret,'initial');twin.style='color: green;';throw new Error('runtime failure');}};
  await assert.rejects(screenshotWithoutCaretMutation(surface,{}),/runtime failure/);
  assert.equal(twin.style,'color: green;','A real mutation remains visible to exact twin gates');
  for(const name of ['visual-state-audit-actions.mjs','visual-state-audit-drivers.mjs','visual-state-audit-camera.browser.test.mjs']){
    const source=await readFile(new URL(name,import.meta.url),'utf8');
    const directCalls=source.match(/\b(?:page|root)\.screenshot\(/g)||[];
    assert.deepEqual(directCalls,[],`${name} cannot bypass caret-safe preparation`);
    assert(source.includes('screenshotWithoutCaretMutation('));
  }
});
