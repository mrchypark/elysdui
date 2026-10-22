import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {captureTargetPNG,screenshotWithoutCaretMutation,ownedOverlayInventory} from './visual-state-audit-drivers.mjs';
import {basicOwnedModal,basicModalCaptureTarget} from './visual-state-audit-basic-actions.mjs';

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
    await page.setContent('<style>body{margin:0;background:magenta}#spacer{height:64419px}#target{margin-left:85px;width:200px;height:40px}input{box-sizing:border-box;width:200px;height:40px;border:0;background:green;outline:none}input:focus-visible{outline:2px solid blue;outline-offset:4px}#target[data-outline-negative] input{outline:none!important}#tail{height:2000px}</style><div id="spacer"></div><div id="target" data-ely-family="forms"><input aria-label="Outline calibration"></div><div id="tail"></div>');
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
    assert.equal(actionCSS,'.basic-record{margin-block-end:100vh}.basic-pair{row-gap:100vh}');
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
      for(const mode of spacing==='320px'?['union','panel-only','panel-root-start']:['viewport-slot-root-start']){
        const stage={spacing,mode};receipt.modalCausal.stages.push(stage);
        const prefix=`modal-${spacing}-${mode}`,beforePath=join(output,prefix+'-before-context.png');
        const beforePNG=await screenshotWithoutCaretMutation(page,{path:beforePath,animations:'disabled'});
        stage.beforeContext={path:beforePath,sha256:hash(beforePNG)};
        const focus=await page.evaluate(()=>document.activeElement.id);
        const target=mode==='union'?main:mode==='panel-only'?dialog:await basicModalCaptureTarget(main,selection);
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
          assert.equal(await dialog.locator('#close').evaluate(node=>node===document.activeElement&&node.matches(':focus-visible')&&node.closest('dialog[open]:modal')?.id==='owned-dialog'),true,'The native Close control must actually own visible focus');
          const r=await dialog.boundingBox(),clip={x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.x+r.width)-Math.floor(r.x),height:Math.ceil(r.y+r.height)-Math.floor(r.y)};
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
