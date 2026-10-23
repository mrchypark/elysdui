import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {captureTargetPNG,screenshotWithoutCaretMutation,ownedOverlayInventory,captureForeignPaint} from './visual-state-audit-drivers.mjs';
import {captureBounds} from './visual-state-audit-bounds.mjs';
import {basicOwnedModal,basicModalCaptureTarget} from './visual-state-audit-basic-actions.mjs';

test('camera bounds clip an absolutely positioned map SVG at its canvas but retain visible SVG paint',{
  skip:process.env.RUN_ACTION_CAMERA_BROWSER!=='1',
  timeout:30000,
},async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:900,height:700}});
    await page.setContent(`<style>
      body{margin:0}.case{position:relative;width:100px;height:80px;margin:12px}
      .canvas{position:relative;width:100px;height:80px;overflow:hidden}
      .canvas svg{position:absolute;inset:0;width:100%;height:100%}
      .visible-canvas{position:relative;width:100px;height:80px;overflow:visible}
      .visible-canvas svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
      .fixed-clip{position:relative;width:100px;height:80px;overflow:hidden}
      .fixed-clip svg{position:fixed;left:150px;top:120px;width:100px;height:80px;overflow:visible}
      .paint{fill:rgb(220,40,40)}
    </style>
    <section class="case" id="map"><div class="canvas"><svg viewBox="0 0 100 80" preserveAspectRatio="none"><rect class="paint" x="-200" y="-20" width="600" height="120"/></svg></div></section>
    <section class="case" id="visible"><div class="visible-canvas"><svg viewBox="0 0 100 80" preserveAspectRatio="none"><rect class="paint" x="150" y="10" width="250" height="50"/></svg></div></section>
    <section class="case" id="fixed"><div class="fixed-clip"><svg viewBox="0 0 100 80"><rect class="paint" x="0" y="0" width="100" height="80"/></svg></div></section>`);
    const clipped=await page.locator('#map').evaluate(captureBounds);
    assert.deepEqual(clipped.clip,{x:12,y:12,width:100,height:80},'Map-like off-viewBox geometry must not enlarge the target camera beyond the hidden canvas');
    assert(clipped.clippedCount>0);
    const visible=await page.locator('#visible').evaluate(captureBounds);
    assert(visible.clip.width>100,'Visible SVG overflow remains in the painted union instead of being blanket-capped');
    assert(visible.extendsRoot);
    const fixed=await page.locator('#fixed').evaluate(captureBounds);
    assert(fixed.clip.width>100,'Fixed SVG paint escapes a relative overflow-hidden ancestor');
    assert(fixed.extendsRoot);
  }finally{await browser.close();}
});

test('foreign paint honors proven absolute overflow clips but keeps escaping positioned paint conservative',{
  skip:process.env.RUN_ACTION_CAMERA_BROWSER!=='1',timeout:30000,
},async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:400,height:240}});
    await page.setContent(`<style>
      body{margin:0}.root{position:relative;width:100px;height:60px}
      .twin{position:relative;width:100px;height:60px;margin-top:-60px}.twin.first{margin-top:0}
      .scroll{position:relative;width:100px;height:60px;overflow:auto}
      .content{position:relative;width:100px;height:180px}.slot{position:relative;height:140px}
      .inside{position:absolute;top:80px;left:0;width:80px;height:30px;background:#c22;z-index:2}
      .inside small{display:block;overflow:hidden}
      .svg-clip{position:relative;width:100px;height:60px;overflow:hidden}
      .svg-clip>svg{position:absolute;top:50px;left:0;width:80px;height:30px;overflow:visible;z-index:2}
      .outer{position:relative;width:100px;height:60px}.clip{width:100px;height:60px;overflow:hidden}
      .outside{position:absolute;top:70px;left:0;width:40px;height:30px;background:#2c2;z-index:2}
      .fixed{position:fixed;top:70px;left:50px;width:40px;height:30px;background:#22c;z-index:2}
      #owned{position:absolute;left:0;top:65px;width:100px;height:100px}
    </style><body>
      <div class="twin first" data-audit-twin><section class="root" id="calendar-twin" data-ely-family="communication">
        <div class="scroll" id="calendar-scroll"><div class="content"><div class="slot"><button class="inside" id="clipped-calendar-button"><small>calendar event</small></button></div></div></div>
      </section></div>
      <div class="twin" data-audit-twin><section class="root" id="svg-twin" data-ely-family="fixture"><div class="svg-clip" id="svg-clip"><svg id="clipped-absolute-svg" viewBox="0 0 80 30"><rect width="80" height="30" fill="#c22"/></svg></div></section></div>
      <div class="twin" data-audit-twin><section class="root" id="outside-twin" data-ely-family="fixture"><div class="outer"><div class="clip"><button class="outside" id="escaped-absolute">absolute escape</button></div></div></section></div>
      <div class="twin" data-audit-twin><section class="root" id="fixed-twin" data-ely-family="fixture"><button class="fixed" id="escaped-fixed">fixed escape</button></section></div>
      <div data-audit-main><section id="owned" data-ely-family="fixture"></section></div></body>`);
    await page.locator('#calendar-scroll').evaluate(node=>{node.scrollTop=20;});
    const geometry=await page.evaluate(()=>{
      const r=id=>{const b=document.getElementById(id).getBoundingClientRect();return {left:b.left,top:b.top,right:b.right,bottom:b.bottom};};
      return {target:r('owned'),calendarRoot:r('calendar-twin'),scroll:r('calendar-scroll'),button:r('clipped-calendar-button'),svgRoot:r('svg-twin'),svgClip:r('svg-clip'),svg:r('clipped-absolute-svg'),absolute:r('escaped-absolute'),fixed:r('escaped-fixed'),absoluteCB:document.getElementById('escaped-absolute').offsetParent?.className,fixedPosition:getComputedStyle(document.getElementById('escaped-fixed')).position};
    });
    assert(geometry.button.top<geometry.target.bottom&&geometry.button.bottom>geometry.target.top,'Raw calendar button box must overlap the later target');
    assert(geometry.button.bottom>geometry.scroll.bottom,'Calendar button must geometrically extend past its scrollport');
    assert(geometry.target.top>=geometry.scroll.bottom&&geometry.calendarRoot.bottom<geometry.target.top,'Calendar button overlap must lie wholly outside the twin scrollport and root');
    assert(geometry.svg.top<geometry.target.bottom&&geometry.svg.bottom>geometry.target.top&&geometry.svg.bottom>geometry.svgClip.bottom,'Absolute SVG box must overlap the later target beyond its clipping parent');
    assert(geometry.target.top>=geometry.svgClip.bottom&&geometry.svgRoot.bottom<geometry.target.top,'SVG overlap must lie wholly outside its clipping parent and root');
    assert(geometry.absolute.top<geometry.target.bottom&&geometry.absolute.bottom>geometry.target.top,'Unproven absolute escape must geometrically intersect the target');
    assert(geometry.fixed.top<geometry.target.bottom&&geometry.fixed.bottom>geometry.target.top,'Fixed escape must geometrically intersect the target');
    assert.equal(geometry.absoluteCB,'outer','Negative absolute control must have a containing block outside the overflow clip');
    assert.equal(geometry.fixedPosition,'fixed');
    const result=await page.locator('#owned').evaluate(captureForeignPaint,{clip:{x:0,y:65,width:100,height:100},checkedRootID:'owned'});
    assert(!result.foreignDOMIntersections.some(item=>item.id==='calendar-twin'),'Calendar absolute paint wholly beyond its scrollport must not be counted in the target');
    assert(!result.foreignDOMIntersections.some(item=>item.id==='svg-twin'),'Absolute SVG paint wholly beyond its positioned clipping parent must not be counted in the target');
    assert(result.foreignDOMIntersections.some(item=>item.id==='outside-twin'),'Absolute paint with containing block outside overflow clip remains a conservative foreign witness');
    assert(result.foreignDOMIntersections.some(item=>item.id==='fixed-twin'),'Fixed paint escaping an overflow ancestor remains a conservative foreign witness');
  }finally{await browser.close();}
});

test('masked empty leaves are trimmed only by proven ancestor overflow clips',{
  skip:process.env.RUN_ACTION_CAMERA_BROWSER!=='1',timeout:30000,
},async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:240,height:120}});
    const capture=async({overflow='auto',scrollWidth=80,scrollMargin=0,leafTop=30,leafWidth=16,leafStyle='',maskClip='border-box'}={})=>{
      await page.setContent(`<style>
        body{margin:0}[data-audit-main],[data-audit-twin]{position:absolute;inset:0}
        .root{position:relative;width:220px;height:100px}
        #owned-panel{position:absolute;left:0;top:0;width:100px;height:60px;z-index:5;background:#fff;border:0;border-radius:0}
        .scrollport{width:${scrollWidth}px;height:20px;margin-left:${scrollMargin}px;overflow:${overflow}}
        #masked-leaf{display:block;width:${leafWidth}px;height:16px;margin-top:${leafTop}px;background:#c22;mask-image:linear-gradient(#000,#000);mask-size:contain;mask-repeat:no-repeat;mask-clip:${maskClip};${leafStyle}}
      </style><div data-audit-main><section class="root" id="owned-root" data-ely-family="fixture"><article id="owned-panel">owned panel</article></section></div><div data-audit-twin><section class="root" id="twin-root" data-ely-family="fixture"><div class="scrollport"><span id="masked-leaf"></span></div></section></div>`);
      return page.locator('#owned-panel').evaluate(captureForeignPaint,{clip:{x:0,y:0,width:220,height:100},checkedRootID:'owned-root'});
    };
    const pixelClip={x:105,y:25,width:30,height:25};
    const clipped=await capture({scrollMargin:110});
    assert.deepEqual(clipped.foreignDOMIntersections,[],'An empty masked leaf wholly outside an ordinary ancestor scrollport is clipped before intersection');
    const clippedPixels=await screenshotWithoutCaretMutation(page,{clip:pixelClip,animations:'disabled',scale:'css'});
    const visible=await capture({leafTop:0});
    assert(visible.foreignDOMIntersections.some(peer=>peer.id==='twin-root'),'Visible masked pixels remain a foreign witness');
    const protruding=await capture({scrollWidth:20,scrollMargin:70,leafTop:0,leafWidth:40});
    assert(protruding.foreignDOMIntersections.some(peer=>peer.id==='twin-root'),'A partially visible masked box protruding beyond its scrollport remains blocking');
    const noClip=await capture({overflow:'visible',scrollMargin:110});
    assert(noClip.foreignDOMIntersections.some(peer=>peer.id==='twin-root'),'Without an ancestor clip the original masked bounds remain blocking');
    const visibleOverflowPixels=await screenshotWithoutCaretMutation(page,{clip:pixelClip,animations:'disabled',scale:'css'});
    assert.notDeepEqual(clippedPixels,visibleOverflowPixels,'An independent raster comparison sees masked paint only when the ancestor overflow clip is removed');
    const noClipMask=await capture({leafTop:0,maskClip:'no-clip'});
    assert(noClipMask.foreignDOMIntersections.some(peer=>peer.id==='twin-root'),'A mask whose clip is not border-box remains unproven');
    const fixed=await capture({leafStyle:'position:fixed;left:10px;top:10px',leafTop:0});
    assert(fixed.foreignDOMIntersections.some(peer=>peer.id==='twin-root'),'Fixed masked paint escaping its scrollport remains blocking');
  }finally{await browser.close();}
});

test('opaque panel subtracts only covered foreign paint with provably inactive static z-index',{
  skip:process.env.RUN_ACTION_CAMERA_BROWSER!=='1',timeout:30000,
},async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:240,height:120}});
    const twinMarkup='<div data-audit-twin><section class="root" id="twin-root" data-ely-family="fixture"><div class="chip-parent"><button id="foreign-chip">foreign chip</button></div></section></div>';
    const capture=async({parentDisplay='block',chipStyle='position:static;z-index:1;overflow:hidden',ownerStyle='',pseudoStyle='',left=10,width=60,includeTwin=true}={})=>{
      await page.setContent(`<style>
        body{margin:0}[data-audit-main],[data-audit-twin]{position:absolute;inset:0}
        .root{position:relative;width:220px;height:100px}
        #owned-panel{position:absolute;left:0;top:0;width:100px;height:60px;z-index:5;background:#fff;border:0;border-radius:0;${ownerStyle}}
        .chip-parent{display:${parentDisplay};width:220px;height:80px}
        #foreign-chip{position:static;width:${width}px;height:20px;margin:0 0 0 ${left}px;padding:0;border:0;background:#c22;${chipStyle}}
        #foreign-chip::after{${pseudoStyle}}
      </style><div data-audit-main><section class="root" id="owned-root" data-ely-family="fixture"><article id="owned-panel">owned panel</article></section></div>${includeTwin?twinMarkup:''}`);
      return page.locator('#owned-panel').evaluate(captureForeignPaint,{clip:{x:0,y:0,width:220,height:100},checkedRootID:'owned-root'});
    };
    const pixelClip={x:0,y:0,width:100,height:60};
    await capture({includeTwin:false});
    const ownerOnlyPixels=await screenshotWithoutCaretMutation(page,{clip:pixelClip,animations:'disabled',scale:'css'});
    const covered=await capture();
    assert.deepEqual(covered.foreignDOMIntersections,[],'Static z-index under a computed block parent is inactive; node overflow can only shrink its covered paint');
    assert(covered.occludedForeignPaint.some(peer=>peer.id==='twin-root'));
    const coveredPixels=await screenshotWithoutCaretMutation(page,{clip:pixelClip,animations:'disabled',scale:'css'});
    assert.deepEqual(coveredPixels,ownerOnlyPixels,'The independently captured owner panel pixels are unchanged by fully covered static foreign paint');
    const clippedStaticDot=await capture({pseudoStyle:'content:"";display:inline-block;width:8px;height:8px;background:#c22'});
    assert.deepEqual(clippedStaticDot.foreignDOMIntersections,[],'A static in-flow pseudo dot clipped by its own button stays within the covered button box');
    assert(clippedStaticDot.occludedForeignPaint.some(peer=>peer.id==='twin-root'));
    const staticDotPixels=await screenshotWithoutCaretMutation(page,{clip:pixelClip,animations:'disabled',scale:'css'});
    assert.deepEqual(staticDotPixels,ownerOnlyPixels,'A static clipped pseudo dot adds no pixels above the opaque owner panel');
    const extendedClipPseudo=await capture({chipStyle:'position:static;z-index:1;overflow:clip;overflow-clip-margin:40px',pseudoStyle:'content:"";display:inline-block;width:120px;height:40px;background:red'});
    assert(extendedClipPseudo.foreignDOMIntersections.some(peer=>peer.id==='twin-root'),'A nonzero overflow-clip-margin lets static pseudo paint escape its button box');
    assert.deepEqual(extendedClipPseudo.occludedForeignPaint,[],'A clip margin outside the raw paint bound blocks opaque subtraction');
    const escapingPseudo=await capture({pseudoStyle:'content:"";position:absolute;z-index:10;top:10px;left:10px;width:60px;height:20px;background:red'});
    assert(escapingPseudo.foreignDOMIntersections.some(peer=>peer.id==='twin-root'),'A positioned high-z pseudo escapes the static chip overflow clip and remains foreign evidence');
    assert.deepEqual(escapingPseudo.occludedForeignPaint,[],'The pseudo-element stacking counterexample blocks opaque subtraction');
    const escapingPseudoPixels=await screenshotWithoutCaretMutation(page,{clip:pixelClip,animations:'disabled',scale:'css'});
    assert.notDeepEqual(escapingPseudoPixels,ownerOnlyPixels,'The independent raster sees the high-z pseudo painted above the owner panel');
    for(const [label,style,parentDisplay]of [
      ['lower active flex-item z-index','z-index:1;overflow:hidden','flex'],
      ['equal active grid-item z-index','z-index:5;overflow:hidden','grid'],
      ['higher active flex-item z-index','z-index:6;overflow:hidden','flex'],
      ['higher positioned z-index','position:relative;z-index:6;overflow:hidden','block'],
      ['unknown contents parent','z-index:1;overflow:hidden','contents'],
      ['foreign box shadow','z-index:1;overflow:hidden;box-shadow:0 0 8px #c22','block'],
      ['foreign text shadow','z-index:1;overflow:hidden;text-shadow:0 0 8px #c22','block'],
      ['foreign outline','z-index:1;overflow:hidden;outline:2px solid #c22','block'],
      ['foreign filter','z-index:1;overflow:hidden;filter:blur(1px)','block'],
      ['foreign individual translate','z-index:1;overflow:hidden;translate:1px 0','block'],
      ['foreign individual rotate','z-index:1;overflow:hidden;rotate:1deg','block'],
      ['foreign individual scale','z-index:1;overflow:hidden;scale:1.1','block'],
    ]){
      const result=await capture({chipStyle:style,parentDisplay});
      assert(result.foreignDOMIntersections.some(peer=>peer.id==='twin-root'),`${label} must remain blocking`);
      assert.deepEqual(result.occludedForeignPaint,[],`${label} cannot be subtracted as opaque-panel coverage`);
    }
    const transformedCover=await capture({ownerStyle:'translate:1px 0'});
    assert(transformedCover.foreignDOMIntersections.some(peer=>peer.id==='twin-root'),'An owned cover with individual translation stays unproven');
    assert.deepEqual(transformedCover.occludedForeignPaint,[],'Unproven transformed cover cannot subtract foreign paint');
    const protruding=await capture({left:85,width:40});
    const remaining=protruding.foreignDOMIntersections.find(peer=>peer.id==='twin-root');
    assert(remaining&&remaining.exposedPaintArea>0,'Native chip paint protruding beyond the opaque panel remains foreign evidence');
    assert.deepEqual(protruding.occludedForeignPaint,[],'Partially covered native paint is not reported as fully occluded');
  }finally{await browser.close();}
});

// Separate explicit grant only: RUN_ACTION_CAMERA_BROWSER=1 node --test <this file>.
test('action camera tall-page, outline and centered native-modal causal pixels',{
  skip:process.env.RUN_ACTION_CAMERA_BROWSER!=='1',
  timeout:60000,
},async()=>{
  const repo=fileURLToPath(new URL('../../../../',import.meta.url)),parent=join(repo,'test-results/action-camera');
  await mkdir(parent,{recursive:true});
  const output=await mkdtemp(join(parent,'run-')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const sources=['visual-state-audit-drivers.mjs','visual-state-audit-bounds.mjs','visual-state-audit-basic-actions.mjs','visual-state-audit-camera.browser.test.mjs','../../assets/ely-controls.css','../../../../adapters/gohtmx/tests/fixtures/basic-audit/main.go'];
  const sourceHashes=async()=>Object.fromEntries(await Promise.all(sources.map(async name=>[name,hash(await readFile(new URL(name,import.meta.url)))])));
  const receipt={node:process.version,runnerPID:process.pid,revision:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),profile:{viewport:{width:1440,height:1000},deviceScaleFactor:1},sources:await sourceHashes(),status:'running',browserClosed:false,captures:[]};
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
    receipt.chromium=browser.version();
    const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
    page.setDefaultTimeout(10000);
    await page.setContent('<style>body{margin:0;background:magenta}#spacer{height:64419px}#target{margin-left:85px;width:400px;height:180px;background:rgb(0,128,0)}#target>div{width:150px;height:90px;background:rgb(0,0,255)}#tail{height:2000px}</style><div id="spacer"></div><div id="target"><div></div></div><div id="tail"></div>');
    const root=page.locator('#target');
    const reference=await screenshotWithoutCaretMutation(root,{path:join(output,'reference.png'),animations:'disabled',scale:'css'});
    receipt.referenceSHA256=hash(reference);
    for(let index=0;index<3;index++){
      const path=join(output,`capture-${index}.png`),capture=await captureTargetPNG(page,root,path);
      receipt.captures.push({path,sha256:hash(capture.png),bounds:capture.bounds,foreignDOMIntersections:capture.foreignDOMIntersections});
      assert(capture.bounds.clip.y>64000);
      assert.equal(capture.bounds.camera.fullPage,false);
      assert.deepEqual(capture.foreignDOMIntersections,[]);
      assert.deepEqual(capture.png,reference,'Compare actual target pixels, not just PNG dimensions or pre-capture ownership');
    }
    // Author-only until an exclusive browser grant: independent six-pixel paint reference.
    await page.setContent('<style>body{margin:0;background:magenta}#spacer{height:64419px}#target{margin-left:85px;width:200px;height:40px}input{box-sizing:border-box;width:200px;height:40px;border:0;background:green;outline:none;caret-color:transparent}input:focus-visible{outline:2px solid blue;outline-offset:4px}#target[data-outline-negative] input{outline:none!important}#tail{height:2000px}</style><div id="spacer"></div><div id="target" data-ely-family="forms"><input aria-label="Outline calibration"></div><div id="tail"></div>');
    await page.keyboard.press('Tab');
    assert.equal(await page.locator('input').evaluate(node=>node===document.activeElement&&node.matches(':focus-visible')),true);
    await root.scrollIntoViewIfNeeded();
    const rect=await root.boundingBox();assert(rect);
    const outlineClip={x:rect.x-6,y:rect.y-6,width:212,height:52};
    const outlineReference=await screenshotWithoutCaretMutation(page,{path:join(output,'outline-reference.png'),clip:outlineClip,animations:'disabled',scale:'css'});
    const outlined=await captureTargetPNG(page,root,join(output,'outline-capture.png'));
    assert.equal(outlined.bounds.focusOutline?.status,'bounded');
    assert.deepEqual(outlined.foreignDOMIntersections,[]);
    assert.deepEqual(outlined.png,outlineReference,'Actual owned focus ring pixels must equal the independent full-outline reference');
    let outlineDisabled;
    try{
      await root.evaluate(node=>node.setAttribute('data-outline-negative',''));
      outlineDisabled=await screenshotWithoutCaretMutation(page,{path:join(output,'outline-disabled-negative.png'),clip:outlineClip,animations:'disabled',scale:'css'});
    }finally{await root.evaluate(node=>node.removeAttribute('data-outline-negative'));}
    for(const offset of [16,20])assert.equal(outlineDisabled.readUInt32BE(offset),outlineReference.readUInt32BE(offset),'Negative control must retain the same PNG dimensions');
    assert.notDeepEqual(outlineDisabled,outlineReference,'Disabling only the fixture outline must change pixels in the identical 212x52 camera');
    receipt.outlineCalibration={status:'passed',referenceSHA256:hash(outlineReference),captureSHA256:hash(outlined.png),outlineDisabledSHA256:hash(outlineDisabled),negativeClip:outlineClip,bounds:outlined.bounds};
    // Author-only: a centered native modal crosses the adjacent normal-flow
    // native select under 320px spacing, even after aligning its own root.
    const controlCSS=await readFile(new URL('../../assets/ely-controls.css',import.meta.url),'utf8');
    assert(controlCSS.includes('dialog[data-ui-component="dialog"], [data-ui-component] dialog { margin: auto; }'),'Production root-dialog centering must be fixed before camera calibration');
    const fixtureSource=await readFile(new URL('../../../../adapters/gohtmx/tests/fixtures/basic-audit/main.go',import.meta.url),'utf8');
    const actionCSS=fixtureSource.match(/const actionCSS = `([^`]+)`/)[1];
    assert.equal(actionCSS,'.basic-record{margin-block-end:100vh}.basic-pair{row-gap:100vh}.basic-frame[data-basic-component="basic/slider"]{padding:1rem .5rem;margin-inline:-.5rem}');
    receipt.modalCausal={stages:[]};
    for(const spacing of ['320px','100vh']){
      await page.setContent(`<style>body{margin:0;background:magenta}#spacer{height:2000px}.gallery{max-width:1248px;margin:auto}.basic-pair{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px}.basic-frame{min-width:0;height:50px}#next-title{height:80px;margin:0}select{box-sizing:border-box;width:100%;height:110px}dialog{box-sizing:border-box;position:fixed;inset:0;margin:0;width:196.203125px;height:54px;padding:0;border:0;background:white;color:black}button[data-slot]:focus-visible{outline:2px solid blue;outline-offset:4px}</style><div id="spacer"></div><main class="gallery"><article class="basic-record"><div class="basic-pair"><div data-audit-main><section class="basic-frame" id="main-frame" data-basic-component="basic/dialog"><button id="open">Open</button><dialog id="owned-dialog" data-ui-component="dialog">Native modal<form method="dialog"><button id="close" data-slot="button">Close</button></form></dialog></section></div><div data-audit-twin><section class="basic-frame" id="twin-frame" data-basic-component="basic/dialog"><select size="3"><option>Independent peer</option></select></section></div></div></article><article class="basic-record"><h2 id="next-title">Following case</h2><div data-audit-main><section id="next-frame" data-basic-component="basic/selectable-list"><select size="3"><option>Following foreign native control</option></select></section></div></article></main><div style="height:2000px"></div>`);
      await page.addStyleTag({content:controlCSS});
      await page.addStyleTag({content:spacing==='100vh'?actionCSS:'.basic-record{margin-block-end:320px}.basic-pair{row-gap:320px}'});
      await page.locator('#main-frame').evaluate(node=>node.scrollIntoView({block:'center',inline:'nearest',behavior:'instant'}));
      await page.locator('#open').evaluate(node=>node.addEventListener('click',()=>node.parentElement.querySelector('dialog').showModal()));
      await page.locator('#open').click();
      const main=page.locator('#main-frame'),dialog=page.locator('#owned-dialog'),twin=page.locator('#twin-frame');
      const selection=await main.evaluate(basicOwnedModal);assert.deepEqual(selection,{id:'owned-dialog',checkedRootID:'main-frame'});
      const inventory=await main.evaluate(ownedOverlayInventory);assert.equal(inventory.filter(p=>p.id===selection.id&&p.owned&&p.ownershipScope==='component-root').length,1);
      const panelRect=await dialog.boundingBox();assert(panelRect);
      assert(Math.abs(panelRect.x+panelRect.width/2-720)<1&&Math.abs(panelRect.y+panelRect.height/2-500)<1,'Actual corrected native UI must be viewport-centered');
      const peerBefore=await twin.evaluate(node=>({html:node.innerHTML,values:[...node.querySelectorAll('select')].map(n=>n.value)}));
      const focusState=()=>dialog.locator('#close').evaluate(node=>{const s=getComputedStyle(node),r=node.getBoundingClientRect();return {activeID:document.activeElement.id||null,focused:node===document.activeElement,focusVisible:node.matches(':focus-visible'),owned:node.closest('dialog[open]:modal')?.id==='owned-dialog',outlineStyle:s.outlineStyle,outlineWidth:s.outlineWidth,outlineOffset:s.outlineOffset,outlineColor:s.outlineColor,rect:{left:r.left,top:r.top,right:r.right,bottom:r.bottom}};});
      for(const mode of spacing==='320px'?['union','panel-only','panel-root-start']:['viewport-slot-root-start']){
        const stage={spacing,mode};receipt.modalCausal.stages.push(stage);
        stage.pointerOpenFocus=await focusState();stage.keyboardSetup=[];
        if(spacing==='100vh'){
          for(let i=0;i<4;i++){
            const observed=await focusState();if(observed.focused&&observed.focusVisible)break;
            await page.keyboard.press('Tab');stage.keyboardSetup.push({key:'Tab',focus:await focusState()});
          }
        }
        const prefix=`modal-${spacing}-${mode}`,beforePath=join(output,prefix+'-before-context.png');
        const beforePNG=await screenshotWithoutCaretMutation(page,{path:beforePath,animations:'disabled'});
        stage.beforeContext={path:beforePath,sha256:hash(beforePNG)};
        const focus=await page.evaluate(()=>document.activeElement.id);
        const target=mode==='union'?main:mode==='panel-only'?dialog:await basicModalCaptureTarget(main,selection);
        stage.preCaptureFocus=await focusState();
        if(spacing==='100vh'){
          const f=stage.preCaptureFocus;
          assert.equal(f.activeID,'close');assert(f.focused&&f.focusVisible&&f.owned,'Real keyboard navigation must establish visible focus on the owned native Close control before capture');
          assert.equal(f.outlineStyle,'solid');assert.equal(f.outlineWidth,'2px');assert.equal(f.outlineOffset,'4px');assert.equal(f.outlineColor,'rgb(0, 0, 255)');
        }
        const geometry=await page.evaluate(()=>Object.fromEntries(['main-frame','owned-dialog','twin-frame','next-frame'].map(id=>{const r=document.getElementById(id).getBoundingClientRect();return [id,{x:r.x,y:r.y,width:r.width,height:r.height}];})));
        stage.geometry=geometry;
        const intersects=(a,b)=>a.x<b.x+b.width&&b.x<a.x+a.width&&a.y<b.y+b.height&&b.y<a.y+a.height;
        const expectedForeign=mode==='panel-root-start'?'next-frame':'twin-frame';
        if(spacing==='320px')assert(intersects(geometry['owned-dialog'],geometry[expectedForeign]),'Negative control must establish an actual foreign-rectangle intersection, not force an expected failure');
        else for(const id of ['twin-frame','next-frame'])assert(!intersects(geometry['owned-dialog'],geometry[id]),'Viewport slots must physically remove foreign rectangles from the panel camera');
        const captured=await captureTargetPNG(page,target,join(output,prefix+'-component.png'),{checkedRootID:selection.checkedRootID});
        const afterPath=join(output,prefix+'-after-context.png'),afterPNG=await screenshotWithoutCaretMutation(page,{path:afterPath,animations:'disabled'});
        Object.assign(stage,{bounds:captured.bounds,foreignDOMIntersections:captured.foreignDOMIntersections,sha256:hash(captured.png),afterContext:{path:afterPath,sha256:hash(afterPNG)}});
        assert.equal(await page.evaluate(()=>document.activeElement.id),focus,'Camera framing must not move native focus');
        assert.deepEqual(await twin.evaluate(node=>({html:node.innerHTML,values:[...node.querySelectorAll('select')].map(n=>n.value)})),peerBefore,'Camera framing must not mutate the independent peer');
        if(spacing==='320px')assert(captured.foreignDOMIntersections.some(p=>p.id===expectedForeign),'Existing unchanged guard must reject the causally intersecting foreign paint');
        else{
          assert.deepEqual(captured.foreignDOMIntersections,[]);
          assert.equal(captured.bounds.focusOutline?.status,'bounded','Positive modal evidence requires a bounded owned focus outline');
          assert.deepEqual(await focusState(),stage.preCaptureFocus,'The camera must preserve actual focus, outline style and control geometry');
          const r=await dialog.boundingBox(),clip={x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.x+r.width)-Math.floor(r.x),height:Math.ceil(r.y+r.height)-Math.floor(r.y)};
          const control=stage.preCaptureFocus.rect;
          // Independent six-pixel outline envelope clipped by this fixture's
          // borderless native dialog scrollport, not by the camera algorithm.
          stage.independentOutlinePaint={left:Math.max(r.x,control.left-6),top:Math.max(r.y,control.top-6),right:Math.min(r.x+r.width,control.right+6),bottom:Math.min(r.y+r.height,control.bottom+6)};
          const paint=stage.independentOutlinePaint;assert(paint.right>paint.left&&paint.bottom>paint.top);
          assert(paint.left>=r.x&&paint.top>=r.y&&paint.right<=r.x+r.width&&paint.bottom<=r.y+r.height,'Visible native outline is contained by the owned dialog, not missing');
          assert(paint.left<control.left||paint.top<control.top||paint.right>control.right||paint.bottom>control.bottom,'At least one outline strip must remain visibly outside the control border');
          assert.deepEqual(captured.bounds.focusOutline.paint,paint,'Bounded focus metadata must match the independently derived visible outline');
          const independent=await screenshotWithoutCaretMutation(page,{path:join(output,'modal-independent-reference.png'),clip,animations:'disabled',scale:'css'});
          receipt.modalCausal.referenceSHA256=hash(independent);
          assert.deepEqual(captured.png,independent,'Primary modal pixels must equal the independent full-panel viewport reference');
          assert.equal(r.width,panelRect.width);assert.equal(r.height,panelRect.height);
        }
      }
    }
    assert.deepEqual(await sourceHashes(),receipt.sources,'Camera source bytes must remain stable during pixel verification');
    receipt.status='passed';
  }catch(error){receipt.status='failed';receipt.error=String(error);throw error;}
  finally{
    try{await browser?.close();receipt.browserClosed=!browser?.isConnected();}
    catch(error){receipt.status='failed';receipt.cleanupError=String(error);throw error;}
    finally{await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}
  }
});

// Independent finite paint proof; no pseudo geometry parser and no camera changes.
test('action camera slider checked-frame allocation contains native paint in four profiles',{
  skip:process.env.RUN_ACTION_CAMERA_BROWSER!=='1',timeout:120000,
},async()=>{
  const repo=fileURLToPath(new URL('../../../../',import.meta.url)),parent=join(repo,'test-results/action-camera');
  await mkdir(parent,{recursive:true});
  const output=await mkdtemp(join(parent,'run-')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const paths=['adapters/gohtmx/tests/fixtures/basic-audit/main.go','ui/gohtmx/templates/shadcn-slider.html','ui/gohtmx/assets/app.css','ui/gohtmx/assets/ely-controls.css','ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs','ui/gohtmx/tests/browser/visual-state-audit-bounds.mjs','ui/gohtmx/tests/browser/visual-state-audit-camera.browser.test.mjs'];
  const sources=async()=>Object.fromEntries(await Promise.all(paths.map(async path=>[path,hash(await readFile(join(repo,path)))])));
  const fixture=await readFile(join(repo,paths[0]),'utf8'),slider=await readFile(join(repo,paths[1]),'utf8');
  const fixtureCSS=fixture.match(/const fixtureCSS = `([^`]+)`/)[1],actionCSS=fixture.match(/const actionCSS = `([^`]+)`/)[1];
  const inputClass=slider.match(/class="(h-2 w-full[^\"]+)"/)[1];
  const wrapperClass=slider.match(/<span data-slot="slider"[\s\S]*?class="([^"]+)"/)[1].replace('{{if .Disabled}}opacity-50{{end}}','');
  assert(!wrapperClass.includes('{{'),'Controlled enabled wrapper must contain no unrendered template action');
  const receipt={node:process.version,runnerPID:process.pid,revision:execFileSync('git',['rev-parse','HEAD'],{cwd:repo,encoding:'utf8'}).trim(),sources:await sources(),status:'running',browserClosed:false,states:[],loadedAssets:[],assetProofKind:'Local file bytes read and route-fulfilled; NOT11-asset requestfinished production delivery proof',scope:'Controlled CSS/native paint calibration with extracted enabled wrapper/input classes and named endpoint variants; actual canonical fixture/props, all11 delivered assets and4-profile Slider action proof still required'};
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});receipt.chromium=browser.version();
    for(const [size,viewport]of [['desktop',{width:1440,height:1000}],['mobile',{width:390,height:844}]])for(const theme of ['light','dark']){
      const context=await browser.newContext({viewport,colorScheme:theme,deviceScaleFactor:1}),page=await context.newPage();page.setDefaultTimeout(10000);
      const errors=[];page.on('pageerror',error=>errors.push(String(error)));
      await page.route('https://slider-calibration.invalid/**',async route=>{
        const path=new URL(route.request().url()).pathname;
        if(!/^\/assets\/(?:app\.css|ely-controls\.css|ely\/fonts\/[A-Za-z0-9-]+\.ttf|[a-z-]+\.woff2)$/.test(path)){errors.push('Unexpected calibration request '+path);return route.abort();}
        const body=await readFile(join(repo,'ui/gohtmx',path.slice(1)));receipt.loadedAssets.push({path,sha256:hash(body),bytes:body.length});
        await route.fulfill({body,contentType:path.endsWith('.css')?'text/css':path.endsWith('.ttf')?'font/ttf':'font/woff2'});
      });
      try{for(const value of [0,50,100])for(const focused of [false,true]){
        const key=`${size}-${theme}-${value}-${focused?'focused':'unfocused'}`,stage={key,viewport,value,focused};receipt.states.push(stage);
        const instance=scope=>`<div data-audit-${scope==='main'?'main':'twin'}><section class="basic-frame" id="basic-slider-${scope}-frame" data-basic-component="basic/slider"><span data-slot="slider" class="${wrapperClass}"><input id="basic-slider-${scope}" name="basic-slider-${scope}_value" aria-label="Caller control" type="range" min="0" max="100" value="${value}" class="${inputClass}"></span></section></div>`;
        await page.setContent(`<html data-theme="${theme}"><head><base href="https://slider-calibration.invalid/"><link rel="stylesheet" href="/assets/app.css"><link rel="stylesheet" href="/assets/ely-controls.css"><style>${fixtureCSS}${actionCSS}</style><style id="allocation-control">.basic-frame[data-basic-component="basic/slider"]{padding:0;margin-inline:0}</style><style id="thumb-negative"></style><style id="track-negative"></style></head><body><div style="height:64419px"></div><main><article class="basic-record"><div class="basic-pair">${instance('main')}${instance('twin')}</div></article></main><div style="height:2000px"></div></body></html>`);
        await page.evaluate(async()=>{await document.fonts.load('16px Inter','Slider');await document.fonts.ready;});
        const root=page.locator('#basic-slider-main-frame'),input=page.locator('#basic-slider-main');
        const snapshot=()=>input.evaluate(node=>{
          const r=node.getBoundingClientRect(),s=getComputedStyle(node),frame=node.closest('.basic-frame').getBoundingClientRect();
          return {rect:{x:r.x,y:r.y,width:r.width,height:r.height},frame:{x:frame.x,y:frame.y,width:frame.width,height:frame.height},value:node.value,activeID:document.activeElement?.id,focusVisible:node.matches(':focus-visible'),fontReady:document.fonts.status,fontLoaded:document.fonts.check('16px Inter','Slider'),rootFontSize:getComputedStyle(document.documentElement).fontSize,metrics:Object.fromEntries(['fontFamily','fontSize','lineHeight','appearance','boxSizing','padding','borderWidth','margin','width','height','direction','writingMode','outlineStyle','outlineWidth'].map(key=>[key,s[key]]))};
        });
        stage.unallocated=await snapshot();
        await page.locator('#allocation-control').evaluate(node=>node.textContent='');
        await root.scrollIntoViewIfNeeded();
        if(focused){await page.keyboard.press('Tab');assert.equal(await input.evaluate(node=>node===document.activeElement),true,'Real Tab must reach the primary slider');}
        stage.allocated=await snapshot();
        assert.equal(stage.allocated.rect.width,stage.unallocated.rect.width,'Host allocation must preserve actual input width');
        assert.equal(stage.allocated.rect.height,stage.unallocated.rect.height,'Host allocation must preserve actual input height');
        assert.equal(stage.allocated.rect.x,stage.unallocated.rect.x,'Negative inline margins compensate padding, not shrink/reposition the input');
        assert.deepEqual(stage.allocated.metrics,stage.unallocated.metrics,'All recorded component metrics/styles remain unchanged');
        assert.equal(stage.allocated.rect.height,8,'Calibration must exercise the actual old eight-pixel range box');
        assert.equal(stage.allocated.frame.width,stage.allocated.rect.width+16);
        assert.equal(stage.allocated.frame.height,stage.allocated.rect.height+32);
        assert.equal(stage.allocated.rootFontSize,'16px');assert(stage.allocated.fontLoaded);assert.equal(stage.allocated.fontReady,'loaded');
        assert.equal(stage.allocated.focusVisible,focused);assert.equal(stage.allocated.value,String(value));
        const twin=()=>page.locator('#basic-slider-twin-frame').evaluate(node=>({html:node.innerHTML,value:node.querySelector('input').value}));
        const peer=await twin();
        stage.beforeCamera=await snapshot();
        const captured=await captureTargetPNG(page,root,join(output,key+'-component.png'));
        stage.afterCamera=await snapshot();assert.deepEqual(stage.afterCamera,stage.beforeCamera,'Camera must preserve native focus, geometry, styles and value');
        assert.equal(captured.bounds.camera.fullPage,false);assert.deepEqual(captured.foreignDOMIntersections,[]);
        const reference=await screenshotWithoutCaretMutation(page,{path:join(output,key+'-reference.png'),animations:'disabled',scale:'css'});
        const before=await snapshot();let negative;
        const frameClip={x:Math.floor(before.frame.x),y:Math.floor(before.frame.y),width:Math.ceil(before.frame.x+before.frame.width)-Math.floor(before.frame.x),height:Math.ceil(before.frame.y+before.frame.height)-Math.floor(before.frame.y)};
        assert.deepEqual(captured.bounds.camera.clip,frameClip,'Checked allocation must be the actual frame, not a camera-expanded paint estimate');
        assert(frameClip.x>0&&frameClip.y>0&&frameClip.x+frameClip.width<viewport.width&&frameClip.y+frameClip.height<viewport.height,'Independent reference must have actual pixels outside every checked-frame edge');
        let blurred=null;
        if(focused){
          await page.mouse.click(2,2);stage.blurred=await snapshot();assert(!stage.blurred.focusVisible);assert.notEqual(stage.blurred.activeID,'basic-slider-main');
          for(const field of ['rect','frame','metrics','value','fontReady','fontLoaded','rootFontSize'])assert.deepEqual(stage.blurred[field],before[field],'Blur comparison preserves '+field);
          blurred=await screenshotWithoutCaretMutation(page,{path:join(output,key+'-blurred-focus-negative.png'),animations:'disabled',scale:'css'});
          for(let tabs=0;tabs<4;tabs++){await page.keyboard.press('Tab');if(await input.evaluate(node=>node===document.activeElement))break;}
          stage.refocused=await snapshot();assert.deepEqual(stage.refocused,before,'Real Tab restores identical focus-visible state without changing geometry/value');
        }
        try{
          await page.locator('#thumb-negative').evaluate(node=>node.textContent='#basic-slider-main::-webkit-slider-thumb{opacity:0!important}');
          negative=await screenshotWithoutCaretMutation(page,{path:join(output,key+'-thumb-opacity0.png'),animations:'disabled',scale:'css'});
          assert.deepEqual(await snapshot(),before,'Opacity negative must preserve geometry, metrics, value and actual native focus');
        }finally{await page.locator('#thumb-negative').evaluate(node=>node.textContent='');}
        let trackNegative;
        try{
          await page.locator('#track-negative').evaluate(node=>node.textContent='#basic-slider-main::-webkit-slider-runnable-track{background-color:transparent!important}');
          trackNegative=await screenshotWithoutCaretMutation(page,{path:join(output,key+'-track-background-negative.png'),animations:'disabled',scale:'css'});
          assert.deepEqual(await snapshot(),before,'Track background negative must preserve geometry and native state');
        }finally{await page.locator('#track-negative').evaluate(node=>node.textContent='');}
        const old={x:Math.floor(before.rect.x),y:Math.floor(before.rect.y),width:Math.ceil(before.rect.x+before.rect.width)-Math.floor(before.rect.x),height:Math.ceil(before.rect.y+before.rect.height)-Math.floor(before.rect.y)};
        const oldPNG=await screenshotWithoutCaretMutation(page,{path:join(output,key+'-old8px-negative.png'),clip:old,animations:'disabled',scale:'css'});
        stage.pixels=await page.evaluate(async({positive,negative,component,trackNegative,blurred,clip,old})=>{
          const decode=async encoded=>{const bitmap=await createImageBitmap(new Blob([Uint8Array.from(atob(encoded),c=>c.charCodeAt(0))],{type:'image/png'}));try{const canvas=new OffscreenCanvas(bitmap.width,bitmap.height),context=canvas.getContext('2d');context.drawImage(bitmap,0,0);return {width:bitmap.width,height:bitmap.height,data:context.getImageData(0,0,bitmap.width,bitmap.height).data};}finally{bitmap.close();}};
          const a=await decode(positive),b=await decode(negative),c=await decode(component),t=await decode(trackNegative),f=blurred?await decode(blurred):null;
          for(const other of [b,t,...(f?[f]:[])])if(a.width!==other.width||a.height!==other.height)throw new Error('Negative reference dimensions changed');
          let changed=0,outsideFrame=0,outsideOld=0,atReferenceEdge=0,cropMismatch=0,trackChanged=0,trackOutsideFrame=0,focusChanged=0,focusOutsideOld=0,focusOutsideFrame=0;
          for(let y=0;y<a.height;y++)for(let x=0;x<a.width;x++){
            const i=(y*a.width+x)*4,outside=x<clip.x||x>=clip.x+clip.width||y<clip.y||y>=clip.y+clip.height,oldOutside=x<old.x||x>=old.x+old.width||y<old.y||y>=old.y+old.height;
            if([0,1,2,3].some(channel=>a.data[i+channel]!==t.data[i+channel])){trackChanged++;if(outside)trackOutsideFrame++;}
            if(f&&[0,1,2,3].some(channel=>a.data[i+channel]!==f.data[i+channel])){focusChanged++;if(oldOutside)focusOutsideOld++;if(outside)focusOutsideFrame++;}
            if(![0,1,2,3].some(channel=>a.data[i+channel]!==b.data[i+channel]))continue;
            changed++;if(outside)outsideFrame++;
            if(oldOutside)outsideOld++;
            if(x===0||y===0||x===a.width-1||y===a.height-1)atReferenceEdge++;
          }
          if(c.width!==clip.width||c.height!==clip.height)throw new Error('Component camera dimensions differ from checked frame');
          for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++)for(let channel=0;channel<4;channel++)if(c.data[(y*c.width+x)*4+channel]!==a.data[((y+clip.y)*a.width+x+clip.x)*4+channel])cropMismatch++;
          return {changed,outsideFrame,outsideOld,atReferenceEdge,cropMismatch,trackChanged,trackOutsideFrame,focusChanged,focusOutsideOld,focusOutsideFrame,oldClip:old,checkedFrameClip:clip};
        },{positive:reference.toString('base64'),negative:negative.toString('base64'),component:captured.png.toString('base64'),trackNegative:trackNegative.toString('base64'),blurred:blurred?.toString('base64')??null,clip:captured.bounds.camera.clip,old});
        stage.bounds=captured.bounds;stage.hashes={component:hash(captured.png),reference:hash(reference),negative:hash(negative)};
        stage.images={component:join(output,key+'-component.png'),reference:join(output,key+'-reference.png'),negative:join(output,key+'-thumb-opacity0.png'),old8px:{path:join(output,key+'-old8px-negative.png'),sha256:hash(oldPNG)}};
        stage.images.trackNegative={path:join(output,key+'-track-background-negative.png'),sha256:hash(trackNegative)};
        if(blurred)stage.images.focusNegative={path:join(output,key+'-blurred-focus-negative.png'),sha256:hash(blurred)};
        assert(stage.pixels.changed>0,'The same-geometry opacity negative must remove actual thumb/ring/shadow ink');
        assert(stage.pixels.outsideOld>0,'The old input-height clip must demonstrably omit ink, not merely have different dimensions');
        assert.equal(stage.pixels.outsideFrame,0,'Any native thumb/ring/shadow outside the checked frame retains HOLD; never auto-increase allocation');
        assert.equal(stage.pixels.atReferenceEdge,0,'Reference must not itself crop the differential paint');
        assert.equal(stage.pixels.cropMismatch,0,'Unmodified camera pixels must equal the independently cropped viewport RGBA');
        assert(stage.pixels.trackChanged>0,'Track negative must remove actual visible track paint');assert.equal(stage.pixels.trackOutsideFrame,0);
        if(focused){assert(stage.pixels.focusChanged>0&&stage.pixels.focusOutsideOld>0,'Focused-versus-blurred pixels must demonstrate real focus paint outside the input box');assert.equal(stage.pixels.focusOutsideFrame,0);}
        assert.deepEqual(await twin(),peer);assert.deepEqual(await snapshot(),before);assert.deepEqual(errors,[]);stage.status='passed';
      }}finally{await context.close();}
    }
    assert.equal(receipt.states.length,24);assert.deepEqual(await sources(),receipt.sources);
    for(const asset of receipt.loadedAssets)assert.equal(hash(await readFile(join(repo,'ui/gohtmx',asset.path.slice(1)))),asset.sha256,'Delivered calibration font/style bytes remain stable');
    receipt.status='passed';
  }catch(error){receipt.status='failed';receipt.error=String(error);throw error;}
  finally{try{await browser?.close();receipt.browserClosed=!browser?.isConnected();}catch(error){receipt.status='failed';receipt.cleanupError=String(error);throw error;}finally{await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}}
});
