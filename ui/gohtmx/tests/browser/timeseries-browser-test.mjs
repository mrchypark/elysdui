import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const reserve = createServer();
await new Promise(resolve => reserve.listen(0, '127.0.0.1', resolve));
const port = reserve.address().port;
await new Promise(resolve => reserve.close(resolve));
const url = `http://127.0.0.1:${port}`;
const server = spawn('go', ['run', './examples/gohtmx/timeseries', '-addr', `127.0.0.1:${port}`], {detached: true, stdio: 'ignore'});
let browser;
try {
  let ready = false;
  for (let i = 0; i < 300; i++) {
    try { if ((await fetch(url)).ok) { ready = true; break; } } catch {}
    await delay(100);
  }
  assert.ok(ready, 'example server did not start');
  browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  for (const profile of [{name: 'desktop', width: 1200, height: 800}, {name: 'mobile-emulation', width: 390, height: 844, isMobile: true, hasTouch: true, deviceScaleFactor: 3}]) {
    const page = await browser.newPage({viewport: {width: profile.width, height: profile.height}, isMobile: profile.isMobile, hasTouch: profile.hasTouch, deviceScaleFactor: profile.deviceScaleFactor, timezoneId: 'UTC'});
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(url);
    await page.waitForFunction(() => window.chartMetrics && window.chart?.plot?.series[0].idxs[1] > 0);
    await page.waitForTimeout(300);
    const snapshot = () => page.evaluate(() => {
      const p = window.chart.plot, xs = p.data[0], idx = p.series[0].idxs;
      return {metrics: window.chartMetrics, min: p.scales.x.min, max: p.scales.x.max, first: xs[0], last: xs.at(-1), length: xs.length, drawnLast: idx[1], gaps: p.data.slice(1).map(y => y.filter(v => v === null).length)};
    });
    const before = await snapshot();
    assert.equal(before.metrics.samples, 1_000_000);
    assert.equal(before.metrics.series, 3);
    assert.ok(before.length < 100_000, `too many rendered samples: ${before.length}`);
    assert.equal(before.drawnLast, before.length - 1, 'all reduced points must be in uPlot visible range');
    assert.equal(before.last, 1700999999, 'last timestamp must remain visible');
    assert.ok(before.gaps.every(n => n > 0), 'each series must retain gap markers');
    const north = page.locator('.u-series').filter({hasText: 'North'});
    await north.click();
    assert.equal(await page.evaluate(() => window.chart.plot.series[1].show), false, 'legend hides its series');
    await north.click();
    assert.equal(await page.evaluate(() => window.chart.plot.series[1].show), true, 'legend restores its series');
    const box = await page.locator('.u-over').boundingBox();
    assert.ok(box);
    if (!profile.hasTouch) {
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.waitForFunction(() => window.chart.plot.cursor.idx != null);
      await page.mouse.move(box.x + box.width * .25, box.y + box.height / 2);
      await page.mouse.down();
      await page.mouse.move(box.x + box.width * .6, box.y + box.height / 2, {steps: 5});
      await page.mouse.up();
      assert.ok(await page.evaluate(() => window.chart.plot.select.width > 0), 'mouse drag selects a time range');
      await page.keyboard.down('Control');
      await page.mouse.wheel(0, -300);
      await page.keyboard.up('Control');
    } else {
      const cdp = await page.context().newCDPSession(page);
      const y = box.y + box.height / 2, center = box.x + box.width / 2;
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x: center - 40, y, id: 1}, {x: center + 40, y, id: 2}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: center - 90, y, id: 1}, {x: center + 90, y, id: 2}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
    }
    await page.waitForFunction(span => window.chart.plot.scales.x.max - window.chart.plot.scales.x.min < span, before.max - before.min);
    await page.waitForTimeout(300);
    const after = await snapshot();
    assert.ok(after.drawnLast >= after.length - 2, 'zoom redraw must include visible data');
    if (profile.hasTouch) {
      const cdp = await page.context().newCDPSession(page);
      const y = box.y + box.height / 2, x = box.x + box.width / 2;
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchStart', touchPoints: [{x, y, id: 1}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchMove', touchPoints: [{x: x - 50, y, id: 1}]});
      await cdp.send('Input.dispatchTouchEvent', {type: 'touchEnd', touchPoints: []});
      await page.waitForFunction(min => window.chart.plot.scales.x.min > min, after.min);
      await page.touchscreen.tap(x, y);
      await page.waitForFunction(() => document.querySelector('#status').textContent.startsWith('Selected:'));
      assert.equal(await page.locator('#chart .ely-timeseries-selection').isVisible(), true, 'touch tap selects an X value');
    }
    const frameTimes = await page.evaluate(async () => {
      const samples = [], p = window.chart.plot;
      for (let i = 0; i < 20; i++) {
        const start = performance.now(), {min, max} = p.scales.x, shift = (max - min) * (i % 2 ? -.01 : .01);
        p.setScale('x', {min: min + shift, max: max + shift});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        samples.push(performance.now() - start);
      }
      samples.sort((a, b) => a - b);
      return {p50Ms: samples[9], p95Ms: samples[18], count: samples.length};
    });
    await page.getByRole('button', {name: 'Reset'}).click();
    await page.waitForFunction(span => window.chart.plot.scales.x.max - window.chart.plot.scales.x.min >= span, before.max - before.min);
    await page.getByRole('button', {name: 'Zoom in'}).click();
    await page.waitForFunction(span => window.chart.plot.scales.x.max - window.chart.plot.scales.x.min < span, before.max - before.min);
    await page.getByRole('button', {name: 'Reset'}).click();
    await page.waitForFunction(max => window.chart.plot.scales.x.max === max, before.max);
    const appendMs = await page.evaluate(async () => {
      const xs = Float64Array.from({length: 1000}, (_, i) => 1701000000 + i);
      const ys = [0, 1, 2].map(s => Float64Array.from(xs, (_, i) => i + s));
      const start = performance.now(); window.chart.append(xs, ys, {follow: true});
      const elapsed = performance.now() - start;
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return elapsed;
    });
    assert.equal(await page.evaluate(() => window.chart.plot.scales.x.max), 1701000999, 'stream append follows the latest X');
    if (!profile.hasTouch) {
      await page.evaluate(async () => {
        const root = document.createElement('div'); root.id = 'callback-chart'; document.querySelector('main').append(root);
        const {mountTimeSeries} = await import('/assets/ely-timeseries.js');
        window.callbackChart = mountTimeSeries(root, {x: Float64Array.from([1,2,3,4]), series: [Float64Array.from([10,20,30,40])], time: false,
          onCursor: value => { window.callbackCursor = value; }, onCursorX: value => { window.callbackCursorX = value; },
          onSelect: value => { window.callbackSelection = value; }, onSelectX: value => { window.callbackSelectedX = value; }});
      });
      await page.locator('#callback-chart .u-over').scrollIntoViewIfNeeded();
      const cb = await page.locator('#callback-chart .u-over').boundingBox();
      await page.mouse.move(cb.x + cb.width * .25, cb.y + cb.height / 2);
      await page.waitForFunction(() => window.callbackCursor?.x != null);
      assert.equal(await page.evaluate(() => window.callbackCursor.values[0]), await page.evaluate(() => window.callbackCursor.x * 10));
      await page.mouse.down(); await page.mouse.move(cb.x + cb.width * .75, cb.y + cb.height / 2, {steps: 5}); await page.mouse.up();
      assert.ok(await page.evaluate(() => window.callbackSelection?.max > window.callbackSelection?.min), 'selection callback reports ordered bounds');
      await page.mouse.click(cb.x + cb.width * .5, cb.y + cb.height / 2);
      assert.ok(await page.evaluate(() => window.callbackSelectedX > 1 && window.callbackSelectedX < 4), 'click reports data X');
      assert.equal(await page.locator('#callback-chart .ely-timeseries-selection').isVisible(), true, 'selection marker is visible');
      const append = await page.evaluate(async () => {
        window.callbackChart.setSelectedX(3);
        window.callbackChart.append([5,6], [[50, NaN]], {follow: true});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        window.callbackChart.append([7], [[70]], {follow: true});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        let rejected = false;
        try { window.callbackChart.append([7], [[999]]); } catch (e) { rejected = e instanceof RangeError; }
        const p = window.callbackChart.plot;
        return {last: p.data[0].at(-1), value: p.data[1].at(-1), gap: p.data[1].includes(null), max: p.scales.x.max, rejected};
      });
      assert.deepEqual(append, {last: 7, value: 70, gap: true, max: 7, rejected: true}, 'incremental append follows new data and preserves gaps');
      await page.evaluate(() => document.querySelector('#callback-chart').dispatchEvent(new CustomEvent('htmx:beforeCleanupElement', {bubbles: true})));
      assert.equal(await page.locator('#callback-chart').evaluate(root => root.childElementCount), 0, 'htmx cleanup destroys chart');
      const scales = await page.evaluate(async () => {
        const {mountTimeSeries} = await import('/assets/ely-timeseries.js');
        const root = document.querySelector('#callback-chart');
        const x = Float64Array.from([1,2,3,4,5]), values = Float64Array.from([-100,-1,0,1,100]);
        const chart = mountTimeSeries(root,{x,series:[values],time:false,yScale:{type:'symlog',constant:3}});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const roundtrips = [...values].map(v => chart.plot.posToVal(chart.plot.valToPos(v,'y'),'y'));
        chart.destroy();
        let rejected=false; try {mountTimeSeries(root,{x,series:[values],time:false,yScale:{type:'log'}});} catch (error) {rejected=error instanceof RangeError;}
        const log = mountTimeSeries(root,{x,series:[Float64Array.from([1,2,10,20,100])],time:false,yScale:{type:'log',base:10}});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const logPosition=log.plot.posToVal(log.plot.valToPos(10,'y'),'y'); log.destroy();
        const start=1704067200;
        const kst=mountTimeSeries(root,{x:Float64Array.from([start,start+3600]),series:[Float64Array.from([1,2])],timeZone:'Asia/Seoul'});
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        const label=kst.plot.series[0].value(kst.plot,start,0,0), splits=kst.plot.axes[0]._splits; kst.destroy();
        return {roundtrips,rejected,logPosition,label,splits};
      });
      for (const [i, expected] of [-100,-1,0,1,100].entries()) assert.ok(Math.abs(scales.roundtrips[i]-expected)<1e-8,'symlog renders with invertible mapping');
      assert.ok(scales.rejected && Math.abs(scales.logPosition-10)<1e-8,'log rejects nonpositive values and maps positives');
      assert.match(scales.label,/9:00am/i,'KST formatter uses 09:00 for 00:00 UTC independently of browser time zone');
      assert.ok(scales.splits.length && scales.splits.every(value => value % 300 === 0),'hour-range KST ticks align to five-minute boundaries');
    }
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({profile: profile.name, before, after, frameTimes, appendMs}));
    await page.evaluate(() => { window.chart.destroy(); window.chart.destroy(); });
    assert.equal(await page.locator('#chart').evaluate(root => root.childElementCount), 0, 'destroy removes chart and controls');
    await page.close();
  }
} finally {
  await browser?.close();
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
}
