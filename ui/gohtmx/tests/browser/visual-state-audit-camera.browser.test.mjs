import assert from 'node:assert/strict';
import {test} from 'node:test';
import {mkdir,mkdtemp,readFile,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {captureTargetPNG,screenshotWithoutCaretMutation} from './visual-state-audit-drivers.mjs';

// Separate explicit grant only: RUN_ACTION_CAMERA_BROWSER=1 node --test <this file>.
test('tall-page action camera pixels equal an independent target screenshot',{
  skip:process.env.RUN_ACTION_CAMERA_BROWSER!=='1',
  timeout:60000,
},async()=>{
  const repo=fileURLToPath(new URL('../../../../',import.meta.url)),parent=join(repo,'test-results/action-camera');
  await mkdir(parent,{recursive:true});
  const output=await mkdtemp(join(parent,'run-')),hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const sources=['visual-state-audit-drivers.mjs','visual-state-audit-bounds.mjs','visual-state-audit-camera.browser.test.mjs'];
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
    assert.deepEqual(await sourceHashes(),receipt.sources,'Camera source bytes must remain stable during pixel verification');
    receipt.status='passed';
  }catch(error){receipt.status='failed';receipt.error=String(error);throw error;}
  finally{
    try{await browser?.close();receipt.browserClosed=!browser?.isConnected();}
    catch(error){receipt.status='failed';receipt.cleanupError=String(error);throw error;}
    finally{await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}
  }
});
