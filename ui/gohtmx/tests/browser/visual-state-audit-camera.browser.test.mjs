import assert from 'node:assert/strict';
import {test} from 'node:test';
import {chromium} from 'playwright';
import {captureTargetPNG} from './visual-state-audit-drivers.mjs';

// Separate explicit grant only: RUN_ACTION_CAMERA_BROWSER=1 node --test <this file>.
test('tall-page action camera pixels equal an independent target screenshot',{
  skip:process.env.RUN_ACTION_CAMERA_BROWSER!=='1',
},async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:1440,height:1000},deviceScaleFactor:1});
    await page.setContent('<style>body{margin:0;background:magenta}#spacer{height:64419px}#target{margin-left:85px;width:400px;height:180px;background:rgb(0,128,0)}#target>div{width:150px;height:90px;background:rgb(0,0,255)}#tail{height:2000px}</style><div id="spacer"></div><div id="target"><div></div></div><div id="tail"></div>');
    const root=page.locator('#target');
    const reference=await root.screenshot({animations:'disabled',scale:'css'});
    for(let index=0;index<3;index++){
      const capture=await captureTargetPNG(page,root);
      assert(capture.bounds.clip.y>64000);
      assert.equal(capture.bounds.camera.fullPage,false);
      assert.deepEqual(capture.foreignDOMIntersections,[]);
      assert.deepEqual(capture.png,reference,'Compare actual target pixels, not just PNG dimensions or pre-capture ownership');
    }
  }finally{await browser.close();}
});
