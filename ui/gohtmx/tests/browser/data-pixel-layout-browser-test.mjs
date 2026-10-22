import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, mkdtemp, readFile, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const env = {...process.env, GOTOOLCHAIN: 'go1.26.9'};
const outputRoot = resolve(process.env.DATA_PIXEL_OUTPUT || join(repo, 'test-results/data-pixel-layout'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['ui/gohtmx/assets/ely-api-data.css', 'ui/gohtmx/assets/ely-api-data.js', 'ui/gohtmx/templates/ely-api-data.html', 'internal/gallery/advanced_data_fixtures.go', 'ui/gohtmx/tests/browser/data-pixel-layout-browser-test.mjs', 'go.mod', 'go.sum'];
const snapshot = async () => Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(join(repo, path)))])));
const run = (command, args) => {
  const result = spawnSync(command, args, {cwd: repo, env, encoding: 'utf8', timeout: 120000});
  assert.equal(result.status, 0, `${command}: ${result.error || result.stderr}`);
  return result.stdout.trim();
};
const groups = {
  chart: ['ChordDiagram', 'ForceGraph', 'NetworkGraph', 'ParallelCoordinates', 'FunnelChart', 'SankeyChart', 'Sunburst', 'Treemap'].map(name => `charts/${name}`),
  dashboard: ['Dashboard Grid', 'DashboardCard', 'DashboardFilterBar', 'MetricsChart', 'RefreshIntervalSelector', 'ResourceGauge', 'StatCard', 'Widget'].map(name => `dashboard/${name}`),
  measures: ['Gauge', 'Meter', 'UsageBar'].map(name => `data/${name}`)
};
// The same measured oracle is used for production and deliberately broken DOM styles.
function valid(metrics, group, mobile) {
  if (!metrics.viewportContained) return false;
  if (group === 'chart') return metrics.labels.length > 0 && metrics.labels.every(label => label.text && label.fill === metrics.foreground && label.visible && label.contained && label.contrast >= 4.5 && label.width > 0 && label.height > 0);
  if (!metrics.contained) return false;
  if (group === 'dashboard') return metrics.columns === (mobile ? 1 : 12) && metrics.tiles.length === 5 && metrics.tiles.every(tile => tile.textFits && tile.ordered) && (!mobile || metrics.tiles.every((tile, i, all) => i === 0 || tile.top >= all[i - 1].bottom - 1));
  return metrics.gauges.length === 2 && metrics.gauges.every(gauge => gauge.width > 0 && gauge.height > 0 && gauge.contained && gauge.textFits) && metrics.meterContained;
}
async function measure(root, group) {
  return root.evaluate((root, group) => {
    const rect = node => {const r = node.getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height};};
    const inside = (child, parent) => child.width > 0 && child.height > 0 && child.left >= parent.left - 1 && child.right <= parent.right + 1 && child.top >= parent.top - 1 && child.bottom <= parent.bottom + 1;
    const textRect = node => {const range=document.createRange();range.selectNodeContents(node);return rect(range);};
    const bounds = rect(root);
    const viewportContained = bounds.left >= -1 && bounds.right <= document.documentElement.clientWidth + 1;
    if (group === 'chart') {
      const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const context=canvas.getContext('2d');
      const rgb = value => {if(!CSS.supports('color',value))return null;context.clearRect(0,0,1,1);context.fillStyle=value;context.fillRect(0,0,1,1);const color=[...context.getImageData(0,0,1,1).data];return [...color.slice(0,3),color[3]/255];};
      const blend = (front,back) => front.slice(0,3).map((value,i) => value*front[3]+back[i]*(1-front[3]));
      const luminance = color => color.slice(0,3).map(value => {const channel=value/255;return channel<=0.04045 ? channel/12.92 : ((channel+0.055)/1.055)**2.4;}).reduce((sum,value,i) => sum+value*[0.2126,0.7152,0.0722][i],0);
      return {bounds,viewportContained,foreground:getComputedStyle(root).color,labels:[...root.querySelectorAll('.ely-data__chart svg text')].map(node => {
        const box=rect(node), style=getComputedStyle(node), svg=node.closest('svg');
        let visible=node.getClientRects().length>0, opacity=Number(style.fillOpacity), clips=[bounds,rect(svg)], layers=[];
        for(let ancestor=node;ancestor;ancestor=ancestor.parentElement){
          const computed=getComputedStyle(ancestor);opacity*=Number(computed.opacity);
          visible &&= computed.display!=='none' && computed.visibility==='visible' && computed.contentVisibility!=='hidden' && computed.clipPath==='none' && computed.clip==='auto';
          if(ancestor!==node && /(hidden|clip|auto|scroll)/.test(`${computed.overflowX} ${computed.overflowY}`))clips.push(rect(ancestor));
          const color=rgb(computed.backgroundColor);if(color && color[3]>0)layers.push(color);
        }
        let background=layers.reverse().reduce((back,front) => blend(front,back),[255,255,255]);
        // SVG text can sit on a painted tile rather than the CSS canvas surface.
        const behind=document.elementsFromPoint(box.left+box.width/2,box.top+box.height/2).find(element => element!==node && svg.contains(element) && ['rect','circle','path','polygon'].includes(element.tagName));
        if(behind){const paint=rgb(getComputedStyle(behind).fill);if(paint){paint[3]*=Number(getComputedStyle(behind).fillOpacity);background=blend(paint,background);}}
        const fill=rgb(style.fill), painted=fill ? blend([fill[0],fill[1],fill[2],fill[3]*opacity],background) : background;
        const l1=luminance(painted),l2=luminance(background);
        return {text:node.textContent.trim(),fill:style.fill,color:style.color,...box,visible:visible && opacity>0,opacity,contained:clips.every(clip => inside(box,clip)),background,contrast:(Math.max(l1,l2)+0.05)/(Math.min(l1,l2)+0.05)};
      })};
    }
    const panel = root.querySelector(group === 'dashboard' ? '[data-ely-dashboard]' : '.ely-data__measures');
    const panelBounds = rect(panel);
    const base = {bounds, panelBounds, viewportContained, contained:inside(panelBounds, bounds) && panel.scrollWidth <= panel.clientWidth + 1};
    if (group === 'dashboard') return {...base, columns:getComputedStyle(panel).gridTemplateColumns.split(' ').length, tiles:[...panel.querySelectorAll('[data-ely-dashboard-tile]')].map(tile => {
      const box = rect(tile), texts = [...tile.querySelectorAll('h2,small,output')].map(node => {const range = document.createRange(); range.selectNodeContents(node); return rect(range);});
      return {...box, key:tile.dataset.elyKey, x:tile.dataset.elyX, y:tile.dataset.elyY, w:tile.dataset.elyW, h:tile.dataset.elyH,
        textFits:inside(box,panelBounds) && texts.every(text => inside(text,box) && text.top >= box.top - 1 && text.bottom <= box.bottom + 1),
        ordered:texts.every((text,i,all) => i === 0 || text.top >= all[i-1].bottom - 1)};
    })};
    const meter=panel.querySelector('.ely-data__meter'),meterBox=rect(meter);
    return {...base,meterContained:inside(meterBox,panelBounds) && [...meter.children].every(node => inside(rect(node),meterBox)),gauges:[...panel.querySelectorAll('.ely-data__gauge')].map(node => {
      const box=rect(node),textRanges=[...node.querySelectorAll('output,figcaption')].map(textRect);
      return {...box,contained:inside(box,panelBounds) && inside(box,bounds),textRanges,textFits:textRanges.length===2 && textRanges.every(text => inside(text,box)),text:node.textContent.trim()};
    })};
  }, group);
}
if (process.env.DATA_PIXEL_SELF_CHECK === '1') {
  const chart = {viewportContained:true,foreground:'white',labels:[{text:'A',fill:'white',visible:true,contained:true,contrast:12,width:8,height:12}]};
  const tiles = Array.from({length:5},(_,i) => ({textFits:true,ordered:true,top:i*100,bottom:i*100+90}));
  const dashboard = {viewportContained:true,contained:true,columns:1,tiles};
  const measures = {viewportContained:true,contained:true,meterContained:true,gauges:[{width:112,height:112,contained:true,textFits:true},{width:112,height:112,contained:true,textFits:true}]};
  assert(valid(chart,'chart',true));
  assert(!valid({...chart,labels:[{...chart.labels[0],fill:'black'}]},'chart',true));
  for(const mutation of [{visible:false},{contained:false},{contrast:1},{height:0}])assert(!valid({...chart,labels:[{...chart.labels[0],...mutation}]},'chart',true));
  assert(valid(dashboard,'dashboard',true));
  assert(!valid({...dashboard,columns:4},'dashboard',true));
  assert(!valid({...dashboard,tiles:tiles.map((tile,i) => i===1 ? {...tile,textFits:false} : tile)},'dashboard',true));
  assert(valid({...dashboard,columns:12},'dashboard',false));
  assert(valid(measures,'measures',true));
  assert(!valid({...measures,contained:false},'measures',true));
  assert(!valid({...measures,viewportContained:false},'measures',true));
  assert(!valid({...measures,gauges:[{...measures.gauges[0],textFits:false},measures.gauges[1]]},'measures',true));
  assert(!valid({...measures,gauges:[{...measures.gauges[0],height:0},measures.gauges[1]]},'measures',true));
  console.log('15 measured-oracle self-checks passed; no files, server or browser started');
  process.exit(0);
}
await mkdir(outputRoot, {recursive: true});
const output = await mkdtemp(join(outputRoot, 'run-'));
const temp = await mkdtemp(join(tmpdir(), 'ely-data-pixel-'));
const report = {node:process.version, checks:[], negatives:[], screenshots:[], console:[], cleanup:{}};
let child, browser, browserLaunch, reservation, port, cleanupPromise, interrupted=false;
async function bounded(promise, milliseconds) {
  let timer;
  try {return await Promise.race([promise,new Promise((_,reject) => {timer=setTimeout(() => reject(new Error('owned cleanup timed out')),milliseconds);})]);}
  finally {clearTimeout(timer);}
}
function cleanup() {
  return cleanupPromise ??= (async () => {
    try {if(browserLaunch)browser=await bounded(browserLaunch,11000);if(browser)await bounded(browser.close(),5000);report.cleanup.browserClosed=!browser || !browser.isConnected();}
    catch(error){report.cleanup.browserClosed=false;report.cleanup.browserError=String(error);}
    if(child && child.exitCode===null && child.signalCode===null){
      const exited=new Promise(resolve => child.once('exit',resolve));
      child.kill('SIGTERM');
      try {await bounded(exited,3000);} catch {child.kill('SIGKILL');try {await bounded(exited,3000);} catch {}}
    }
    report.cleanup.serverExited=!child || child.exitCode!==null || child.signalCode!==null;
    if(reservation?.listening)await bounded(new Promise(resolve => reservation.close(resolve)),2000).catch(error => {report.cleanup.reservationError=String(error);});
    report.cleanup.portClosed=port===undefined || await bounded(new Promise(resolve => {
      const probe=createServer();probe.once('error',() => resolve(false));probe.listen(port,'127.0.0.1',() => probe.close(() => resolve(true)));
    }),2000).catch(() => false);
    try {await bounded(rm(temp,{recursive:true,force:true}),5000);report.cleanup.tempRemoved=await access(temp).then(() => false,error => error.code==='ENOENT');}
    catch(error){report.cleanup.tempRemoved=false;report.cleanup.tempError=String(error);}
    if(interrupted || !Object.values(report.cleanup).every(value => value===true)){report.status='failed';process.exitCode=1;}
    report.pixelReview='pending independent inspection; capture/computed checks are not visual approval';
    await bounded(writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'}),5000);
    console.log(JSON.stringify({status:report.status,output,checks:report.checks.length,negatives:report.negatives.length,cleanup:report.cleanup}));
  })();
}
for(const signal of ['SIGTERM','SIGINT'])process.once(signal,() => {
  interrupted=true;report.signal=signal;report.status='failed';
  void cleanup().then(() => process.exit(signal==='SIGINT'?130:143),error => {console.error(error);process.exit(1);});
});
async function capture(root, name) {
  assert(report.screenshots.length < 100, 'bounded screenshot count');
  const path = join(output, `${name}.png`);
  await root.screenshot({path, animations:'disabled', timeout:15000});
  const bytes = await readFile(path);
  assert(bytes.length <= 4 * 1024 * 1024, 'bounded screenshot bytes');
  report.screenshots.push({path,sha256:hash(bytes),bytes:bytes.length});
}
try {
  report.revision = run('git', ['rev-parse','HEAD']);
  report.go = run('go',['version']);
  report.sourceHashes = await snapshot();
  run('go',['build','-o',join(temp,'gallery'),'./examples/gohtmx/gallery']);
  assert.deepEqual(await snapshot(),report.sourceHashes);
  reservation = createServer();
  await new Promise((resolve,reject) => {reservation.once('error',reject); reservation.listen(0,'127.0.0.1',resolve);});
  port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  assert(!interrupted,'interrupted before owned server startup');
  child = spawn(join(temp,'gallery'),['-addr',`127.0.0.1:${port}`],{stdio:'ignore'});
  report.serverPID = child.pid;
  let ready = false;
  for (let i=0;i<200;i++) {try {if ((await fetch(`${base}/components`,{signal:AbortSignal.timeout(500)})).ok) {ready=true;break;}} catch {} await new Promise(resolve => setTimeout(resolve,50));}
  assert(ready,'owned gallery startup');
  assert(!interrupted,'interrupted before owned browser startup');
  browserLaunch=chromium.launch({headless:true,timeout:10000,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  browser = await browserLaunch;
  for (const width of [1440,390]) for (const theme of ['light','dark']) {
    const mobile = width === 390, profile = `${mobile?'mobile':'desktop'}-${theme}`;
    const page = await browser.newPage({viewport:{width,height:1000},colorScheme:theme,timezoneId:'UTC'});
    page.setDefaultTimeout(10000);
    page.on('pageerror',error => report.console.push({profile,type:'pageerror',message:error.message}));
    await page.addInitScript(mode => {localStorage.setItem('ely-palette','ely');localStorage.setItem('ely-theme',mode);},theme);
    await page.goto(`${base}/components/audit?family=data&aliases=1`,{timeout:30000});
    assert.deepEqual(await page.evaluate(mode => {window.ElyTheme.apply('ely',mode);return window.ElyTheme.current();},theme),{id:'ely',mode:theme});
    await page.evaluate(() => document.fonts.ready);
    for (const [group,names] of Object.entries(groups)) for (const identity of names) {
      const root = page.locator(`[data-audit-name="${identity}"] [data-audit-main] > [data-ely-family]`);
      assert.equal(await root.count(),1,identity);
      await page.waitForFunction(identity => document.querySelector(`[data-audit-name="${identity}"] [data-audit-main] > [data-ely-family]`)?.dataset.elyReady === 'true',identity);
      await root.scrollIntoViewIfNeeded();
      await page.evaluate(() => window.scrollTo(0,window.scrollY));
      const initial = await measure(root,group);
      report.checks.push({profile,identity,group,initial});
      await capture(root,`${profile}-${identity.replaceAll('/','-').replaceAll(' ','-')}`);
      assert(valid(initial,group,mobile),`${profile} ${identity}: ${JSON.stringify(initial)}`);
      if (group === 'chart') {
        const expected = /Treemap|Sunburst/.test(identity) ? ['Alpha','Beta'] : /Sankey|Funnel/.test(identity) ? ['In'] : ['A'];
        assert.deepEqual(initial.labels.map(label => label.text),expected,`${identity} caller labels`);
        const original = await root.getAttribute('style');
        await root.evaluate(node => node.style.color='rgb(17, 85, 153)');
        const custom = await measure(root,group);
        assert(custom.labels.every(label => label.fill === 'rgb(17, 85, 153)'),`${identity} caller color inheritance`);
        await root.evaluate((node,style) => {if(style===null)node.removeAttribute('style');else node.setAttribute('style',style);},original);
      } else if (group === 'dashboard') {
        assert.deepEqual(initial.tiles.map(tile => [tile.key,tile.x,tile.y,tile.w,tile.h]),[['requests','0','0','4','2'],['errors','4','0','4','2'],['cpu','8','0','4','2'],['latency','0','2','8','3'],['saturation','8','2','4','3']]);
        await root.evaluate(node => {node.__pixelEvents=[];node.addEventListener('ely:action',event => {if(event.target===node && event.detail.action==='dashboard-layout')node.__pixelEvents.push(event.detail);});});
        const tile = root.locator('[data-ely-key="requests"]');
        await tile.focus();await tile.press('ArrowRight');
        assert.equal(await tile.getAttribute('data-ely-x'),'1');
        await tile.press('ArrowLeft');
        const events = await root.evaluate(node => node.__pixelEvents);
        assert.equal(events.length,2,`${identity} keyboard layout events`);
        const owner = await root.getAttribute('id');
        assert(events.every(event => event.id===owner && event.action==='dashboard-layout'));
        assert.equal(events[0].tiles[0].x,1);assert.equal(events[1].tiles[0].x,0);
        assert(valid(await measure(root,group),group,mobile),`${identity} restored layout`);
      } else {
        assert.deepEqual(initial.gauges.map(gauge => gauge.text.replaceAll(/\s/g,'')),['38%CPU','54°CTemperature']);
      }
      if (identity === names[0]) {
        const modes=group==='chart'?['fill','hidden','offscreen']:group==='dashboard'?['columns']:['minimum','clipped-gauge'];
        for(const mode of modes){
        const target = group === 'chart' ? root.locator('.ely-data__chart text').first() : root.locator(group === 'dashboard' ? '[data-ely-dashboard]' : mode==='clipped-gauge'?'.ely-data__gauge':'.ely-data__measures').first();
        const original = await target.getAttribute('style');
        await target.evaluate((node,mode) => {
          if(mode==='fill')node.style.setProperty('fill','rgb(255, 0, 255)','important');
          else if(mode==='hidden')node.style.setProperty('opacity','0','important');
          else if(mode==='offscreen')node.style.setProperty('transform','translate(10000px,10000px)','important');
          else if(mode==='clipped-gauge'){node.style.setProperty('height','16px','important');node.style.setProperty('max-height','16px','important');node.style.setProperty('overflow','hidden','important');}
          else if(mode==='columns'){node.style.setProperty('grid-template-columns','repeat(4,minmax(0,1fr))','important');node.style.setProperty('grid-auto-rows','5.5rem','important');}
          else {
            const widerThanRoot = node.closest('[data-ely-family]').getBoundingClientRect().width + 100;
            node.style.setProperty('grid-template-columns','minmax(14rem,2fr) repeat(2,7rem)','important');
            node.style.setProperty('min-width',`${widerThanRoot}px`,'important');
          }
        },mode);
        const broken = await measure(root,group);
        if(mode==='hidden')assert.equal(broken.labels[0].visible,false);
        if(mode==='offscreen')assert.equal(broken.labels[0].contained,false);
        if(mode==='clipped-gauge')assert.equal(broken.gauges[0].textFits,false);
        report.negatives.push({profile,identity,group,mode,metrics:broken,rejected:!valid(broken,group,mobile)});
        await capture(root,`${profile}-negative-${group}-${mode}`);
        assert(!valid(broken,group,mobile),`${profile} ${group}/${mode} negative must be rejected`);
        await target.evaluate((node,style) => {if(style===null)node.removeAttribute('style');else node.setAttribute('style',style);},original);
        await page.evaluate(() => window.scrollTo(0,window.scrollY));
        assert(valid(await measure(root,group),group,mobile),`${group} restored after negative`);
        }
      }
    }
    await page.close();
  }
  assert.equal(report.checks.length,76);
  assert.equal(report.negatives.length,24);
  assert.equal(report.console.length,0,JSON.stringify(report.console));
  assert.deepEqual(await snapshot(),report.sourceHashes,'focused source changed during run');
  assert.equal(run('git',['rev-parse','HEAD']),report.revision,'HEAD changed during run');
  report.status='passed';
} catch(error) {report.status='failed';report.error=String(error.stack || error);process.exitCode=1;}
finally {await cleanup();}
