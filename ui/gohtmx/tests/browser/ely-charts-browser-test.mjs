import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const listener = createServer();
await new Promise(resolve => listener.listen(0, '127.0.0.1', resolve));
const port = listener.address().port;
await new Promise(resolve => listener.close(resolve));
const url = `http://127.0.0.1:${port}`;
const child = spawn('go', ['run', './examples/gohtmx/chart-gallery', '-addr', `127.0.0.1:${port}`], {detached:true, stdio:'ignore'});
let browser;
try {
  let ready = false;
  for (let i=0;i<300;i++) { try { if ((await fetch(url)).ok) {ready=true;break;} } catch {} await delay(100); }
  assert.ok(ready, 'gallery did not start');
  browser = await chromium.launch({headless:true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  for (const mobile of [false,true]) {
    const page = await browser.newPage({viewport: mobile ? {width:390,height:844} : {width:1200,height:900}, isMobile:mobile, hasTouch:mobile});
    const errors=[]; page.on('pageerror', e => errors.push(e.message));
    await page.goto(url); await page.waitForFunction(() => document.querySelectorAll('[data-chart][data-ready=true]').length === 21 && document.querySelectorAll('[data-stat][data-ready=true]').length === 4 && document.querySelectorAll('[data-density][data-ready=true]').length === 2 && document.querySelectorAll('[data-relation][data-ready=true]').length === 2 && document.querySelectorAll('[data-comparison][data-ready=true]').length === 2 && document.querySelectorAll('[data-horizon][data-ready=true]').length === 2 && document.querySelectorAll('[data-parallel][data-ready=true]').length === 1 && document.querySelectorAll('[data-surface][data-ready=true]').length === 1);
    for (const card of await page.locator('[data-chart]').all()) assert.ok(await card.locator('canvas').count() >= 1,'each chart renders to a canvas');
    assert.equal(await page.locator('[data-stat] svg').count(),4,'each statistical chart renders');
    assert.equal(await page.locator('[data-density] svg').count(),2,'density charts render');
    assert.equal(await page.locator('[data-relation] svg').count(),2,'relation charts render');
    const surface = page.locator('[data-surface]');
    await surface.locator('[data-surface-cell]').first().focus(); await page.keyboard.press('Enter');
    assert.match(await surface.locator('[aria-live=polite]').innerText(), /Cell/);
    await surface.getByRole('button',{name:'Rotate left'}).click();
    assert.match(await surface.locator('[aria-live=polite]').innerText(), /azimuth/);
    if (mobile) {
      const cell = surface.locator('[data-surface-cell]').last(); await cell.scrollIntoViewIfNeeded();
      const b = await cell.boundingBox(); await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2);
      assert.match(await surface.locator('[aria-live=polite]').innerText(), /Cell/, 'touch selects a surface cell');
      const chart = surface.locator('svg'), box = await chart.boundingBox(), cdp = await page.context().newCDPSession(page);
      const x=box.x+box.width/2, y=box.y+box.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+45,y:y+20,id:1}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForFunction(() => document.querySelector('[data-surface] [aria-live=polite]').textContent.includes('azimuth'));
    }
    const parallel = page.locator('[data-parallel]');
    await parallel.locator('[data-parallel-index]').first().focus(); await page.keyboard.press('Enter');
    assert.match(await parallel.locator('output').innerText(), /East/);
    if (mobile) {
      await page.evaluate(() => { window.parallelSelections=0; document.addEventListener('ely:parallel-sets-select',()=>window.parallelSelections++); });
      const ribbon=parallel.locator('[data-parallel-index]').first(); await ribbon.scrollIntoViewIfNeeded(); const r=await ribbon.boundingBox(); await page.touchscreen.tap(r.x+r.width*.25,r.y+r.height*.5);
      assert.equal(await page.evaluate(() => window.parallelSelections),1,'touch selects a parallel ribbon once');
    }
    await parallel.getByText('Choose a flow').click(); await parallel.getByRole('button',{name:'Select East, A, Won: 20'}).click();
    assert.match(await parallel.locator('output').innerText(), /East, A, Won/);
    const horizon = page.locator('[data-horizon=HorizonChart]');
    await horizon.locator('[role=button]').first().focus(); await page.keyboard.press('Enter');
    assert.match(await horizon.locator('output').innerText(), /band/);
    const radial = page.locator('[data-horizon=RadialLineChart]');
    const radialTarget = radial.locator('[role=button]').first();
    if (mobile) { await radialTarget.scrollIntoViewIfNeeded(); const b = await radialTarget.boundingBox(); await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2); } else await radialTarget.click();
    assert.match(await radial.locator('output').innerText(), /sample/);
    const ridge = page.locator('[data-comparison=RidgelineChart]');
    const ridgeTargets = ridge.locator('[data-comparison-index]');
    for (const [index,label] of [[0,/East/],[1,/West/]]) {
      const target = ridgeTargets.nth(index);
      if (mobile) { await target.scrollIntoViewIfNeeded(); const b = await target.boundingBox(); await page.touchscreen.tap(b.x+b.width/2,b.y+b.height/2); } else await target.click();
      assert.match(await ridge.locator('output').innerText(), label);
    }
    const difference = page.locator('[data-comparison=DifferenceChart]');
    await difference.locator('[data-comparison-index]').first().focus(); await page.keyboard.press('Enter');
    assert.match(await difference.locator('output').innerText(), /primary/);
    if (mobile) {
      const line = page.locator('[data-chart="Line"] canvas').first(); await line.scrollIntoViewIfNeeded();
      const box = await line.boundingBox(), cdp = await page.context().newCDPSession(page);
      const x=box.x+box.width/2, y=box.y+box.height/2;
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-80,y,id:1},{x:x+80,y,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      await page.waitForFunction(() => document.querySelector('[data-chart="Line"] output').textContent.startsWith('Viewport:'));
    }
    const tree = page.locator('[data-chart="Tree"]');
    assert.doesNotMatch(await tree.locator('.ely-web-chart-surface').getAttribute('aria-label'), /NaN/);
    await tree.locator('summary').click();
    assert.equal(await tree.getByRole('button',{name:/One/}).count(),1,'nested nodes are keyboard accessible');
    const pie = page.locator('[data-chart="Pie"]');
    await pie.scrollIntoViewIfNeeded();
    const canvas = await pie.locator('canvas').first().boundingBox();
    if (mobile) await page.touchscreen.tap(canvas.x+canvas.width/2+70,canvas.y+canvas.height/2);
    else await page.mouse.click(canvas.x+canvas.width/2+70,canvas.y+canvas.height/2);
    await page.waitForFunction(() => document.querySelector('[data-chart="Pie"] output').textContent.startsWith('Selected:'));
    await pie.locator('summary').click();
    const button = pie.getByRole('button',{name:/East/}); await button.focus(); await page.keyboard.press('Enter');
    assert.match(await pie.locator('output').textContent(),/East/,'keyboard selection reports the data item');
    const cleanup = await pie.locator('.ely-web-chart').evaluate(node => {
      const root = node.parentElement; root.dispatchEvent(new CustomEvent('htmx:beforeCleanupElement',{bubbles:true})); return root.childElementCount;
    });
    assert.equal(cleanup,0,'htmx cleanup disposes chart');
    await page.evaluate(() => {window.statEvents=0; document.addEventListener('ely:stat-select', () => window.statEvents++);});
    for (const card of await page.locator('[data-stat]').all()) {
      const target = card.locator('[data-stat-index="0"]'); await target.scrollIntoViewIfNeeded();
      const box = await target.boundingBox(); const old = await page.evaluate(() => window.statEvents);
      if (mobile) await page.touchscreen.tap(box.x+box.width/2,box.y+box.height/2);
      else await page.mouse.click(box.x+box.width/2,box.y+box.height/2);
      assert.equal(await page.evaluate(() => window.statEvents),old+1,'selection fires once per tap');
      await target.focus(); await page.keyboard.press('Enter');
      assert.equal(await page.evaluate(() => window.statEvents),old+2,'keyboard activation fires once');
      assert.equal(await target.getAttribute('aria-pressed'),'true');
    }
    const statCleanup = await page.locator('[data-stat="Histogram"] .ely-stat-chart').evaluate(node => {
      const root=node.parentElement;root.dispatchEvent(new CustomEvent('htmx:beforeCleanupElement',{bubbles:true}));return root.childElementCount;
    });
    assert.equal(statCleanup,0,'htmx cleanup removes statistical chart');
    const hex = page.locator('[data-density="HexbinChart"]');
    const hexTarget = hex.locator('.ely-density-hex').first(); await hexTarget.scrollIntoViewIfNeeded();
    const hexBox = await hexTarget.boundingBox();
    if(mobile) await page.touchscreen.tap(hexBox.x+hexBox.width/2,hexBox.y+hexBox.height/2);
    else await page.mouse.click(hexBox.x+hexBox.width/2,hexBox.y+hexBox.height/2);
    assert.equal(await hexTarget.getAttribute('aria-pressed'),'true','hexbin tap selects a bin');
    await hex.getByRole('button',{name:'Reset chart zoom and pan'}).click();
    await hex.locator('svg').scrollIntoViewIfNeeded();
    const densitySvg=hex.locator('svg'), densityBox=await densitySvg.boundingBox();
    const startX=densityBox.x+densityBox.width*.5,startY=densityBox.y+densityBox.height*.5;
    if(mobile){const cdp=await page.context().newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:startX,y:startY,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:startX+40,y:startY,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
    else {await page.mouse.move(startX,startY);await page.mouse.down();await page.mouse.move(startX+40,startY,{steps:4});await page.mouse.up();}
    const translate=await densitySvg.locator('g').first().getAttribute('transform');
    const dx=Number(translate.match(/translate\(([^ ]+)/)[1]);
    assert.ok(Math.abs(dx-40*640/densityBox.width)<1,`pan uses responsive SVG coordinates: ${translate}, width ${densityBox.width}`);
    await hex.getByRole('button',{name:'Reset chart zoom and pan'}).click();
    assert.equal(await densitySvg.locator('g').first().getAttribute('transform'),'translate(0 0) scale(1)');
    await hex.getByRole('button',{name:'Zoom in'}).click();
    assert.ok(Number((await densitySvg.locator('g').first().getAttribute('transform')).match(/scale\(([^)]+)/)[1])>1,'zoom control changes scale');
    await hex.getByRole('button',{name:'Reset chart zoom and pan'}).click();
    if(mobile){
      await densitySvg.scrollIntoViewIfNeeded();const b=await densitySvg.boundingBox(),x=b.x+b.width/2,y=b.y+b.height/2,cdp=await page.context().newCDPSession(page);
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-70,y,id:1},{x:x+70,y,id:2}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      assert.ok(Number((await densitySvg.locator('g').first().getAttribute('transform')).match(/scale\(([^)]+)/)[1])>1,'two-finger pinch zooms density chart');
    }
    const contour=page.locator('[data-density="ContourChart"]');
    const contourTarget=contour.locator('.ely-density-contour').first();await contourTarget.scrollIntoViewIfNeeded();await contourTarget.focus();await page.keyboard.press('Enter');
    assert.equal(await contourTarget.getAttribute('aria-pressed'),'true','contour selection works by keyboard');
    const packing=page.locator('[data-relation="CirclePacking"]');
    const branch=packing.locator('[data-relation-index="1"]');await branch.scrollIntoViewIfNeeded();await branch.focus();await page.keyboard.press('Enter');
    const packingSvg=packing.locator('svg'), originalBox=await packingSvg.getAttribute('viewBox');
    await packing.getByRole('button',{name:'Zoom to selected group'}).click();
    assert.notEqual(await packingSvg.getAttribute('viewBox'),originalBox,'packing branch zoom changes the viewport');
    await packing.getByRole('button',{name:'Reset view'}).click();assert.equal(await packingSvg.getAttribute('viewBox'),originalBox);
    const chord=page.locator('[data-relation="ChordDiagram"] [data-relation-index="0"]');await chord.scrollIntoViewIfNeeded();await chord.focus();await page.keyboard.press('Enter');assert.equal(await chord.getAttribute('aria-pressed'),'true');
    await page.addScriptTag({url:'/assets/htmx.min.js'});
    const disposed = await page.evaluate(async () => {
      const root=document.querySelector('[data-chart="Line"] .ely-web-chart').parentElement;
      const surface=root.querySelector('.ely-web-chart-surface');
      const echarts=await import('/assets/echarts.esm.min.js');
      const instance=echarts.getInstanceByDom(surface);
      let cleanupEvents=0; root.addEventListener('htmx:beforeCleanupElement', () => cleanupEvents++);
      await window.htmx.ajax('GET','/fragment',{target:root,swap:'outerHTML'});
      return {disposed:instance.isDisposed(),connected:root.isConnected,cleanupEvents,body:document.body.textContent.includes('Chart replaced')};
    });
    assert.equal(disposed.disposed,true,`actual htmx outerHTML swap disposes ECharts: ${JSON.stringify(disposed)}`);
    const otherCleanup = await page.evaluate(async () => {
      const root=document.createElement('div'); document.querySelector('main').append(root);
      const {mountTimeSeries}=await import('/assets/ely-timeseries.js');
      const chart=mountTimeSeries(root,{x:Float64Array.from([1,2]),series:[Float64Array.from([1,2])],time:false});
      await window.htmx.ajax('GET','/fragment',{target:root,swap:'outerHTML'});
      let destroyed=false;try {chart.append([3],[[3]]);} catch {destroyed=true;}
      return {destroyed, empty:root.childElementCount===0};
    });
    assert.deepEqual(otherCleanup,{destroyed:true,empty:true},'actual htmx outerHTML swap destroys the uPlot chart');
    const statActual = await page.evaluate(async () => {
      const root=document.createElement('div'); document.querySelector('main').append(root);
      const {mountStatChart}=await import('/assets/ely-stat-charts.js');
      mountStatChart(root,{type:'Histogram',data:[1,2,2,3]});
      await window.htmx.ajax('GET','/fragment',{target:root,swap:'outerHTML'});
      return root.childElementCount;
    });
    assert.equal(statActual,0,'actual htmx outerHTML swap destroys the statistical chart');
    for (const selector of ['[data-density="HexbinChart"] .ely-density','[data-relation="ChordDiagram"] .ely-relation-chart']) {
      const count=await page.evaluate(async selector=>{const content=document.querySelector(selector),root=content.classList.contains('ely-density')?content:content.parentElement;await window.htmx.ajax('GET','/fragment',{target:root,swap:'outerHTML'});return root.childElementCount;},selector);
      assert.equal(count,0,`${selector} is destroyed by an htmx swap`);
    }
    for (const selector of ['[data-surface] > div', '[data-parallel] > div']) {
      const count=await page.evaluate(async selector => { const root=document.querySelector(selector); await window.htmx.ajax('GET','/fragment',{target:root,swap:'outerHTML'}); return root.childElementCount; }, selector);
      assert.equal(count,0,`${selector} is destroyed by an htmx swap`);
    }
    const remount = await page.evaluate(async () => {
      const root=document.createElement('div'); document.querySelector('main').append(root);
      const {mountTimeSeries}=await import('/assets/ely-timeseries.js');
      const options={x:Float64Array.from([1,2]),series:[Float64Array.from([1,2])],time:false};
      const oldChart=mountTimeSeries(root,options), newChart=mountTimeSeries(root,options);
      await new Promise(resolve => setTimeout(resolve,0));
      let oldDestroyed=false;try{oldChart.append([3],[[3]]);}catch{oldDestroyed=true;}
      const intact=root.querySelectorAll('.ely-timeseries').length===1;newChart.destroy();root.remove();return {oldDestroyed,intact};
    });
    assert.deepEqual(remount,{oldDestroyed:true,intact:true},'remount cleanup keeps the new chart intact');
    assert.deepEqual(errors,[]);
    console.log(`${mobile ? 'mobile emulation' : 'desktop'}: 21 ECharts configurations, 4 statistical and 4 density/relation charts, selection, pan, keyboard, cleanup passed`);
    await page.close();
  }
} finally { await browser?.close(); try {process.kill(-child.pid,'SIGTERM');} catch {} }
