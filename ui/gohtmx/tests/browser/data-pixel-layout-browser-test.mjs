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
await mkdir(outputRoot, {recursive: true});
const output = await mkdtemp(join(outputRoot, 'run-'));
const temp = await mkdtemp(join(tmpdir(), 'ely-data-pixel-'));
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
  if (group === 'chart') return metrics.labels.length > 0 && metrics.labels.every(label => label.text && label.fill === label.color && label.width > 0 && label.height > 0);
  if (!metrics.contained) return false;
  if (group === 'dashboard') return metrics.columns === (mobile ? 1 : 12) && metrics.tiles.length === 5 && metrics.tiles.every(tile => tile.textFits && tile.ordered) && (!mobile || metrics.tiles.every((tile, i, all) => i === 0 || tile.top >= all[i - 1].bottom - 1));
  return metrics.gauges.length === 2 && metrics.gauges.every(gauge => gauge.width > 0 && gauge.contained) && metrics.meterContained;
}
async function measure(root, group) {
  return root.evaluate((root, group) => {
    const rect = node => {const r = node.getBoundingClientRect(); return {left:r.left, right:r.right, top:r.top, bottom:r.bottom, width:r.width, height:r.height};};
    const inside = (child, parent) => child.left >= parent.left - 1 && child.right <= parent.right + 1;
    const bounds = rect(root);
    const viewportContained = bounds.left >= -1 && bounds.right <= document.documentElement.clientWidth + 1;
    if (group === 'chart') return {bounds, viewportContained, labels: [...root.querySelectorAll('.ely-data__chart svg text')].map(node => ({text:node.textContent.trim(), fill:getComputedStyle(node).fill, color:getComputedStyle(node).color, ...rect(node)}))};
    const panel = root.querySelector(group === 'dashboard' ? '[data-ely-dashboard]' : '.ely-data__measures');
    const panelBounds = rect(panel);
    const base = {bounds, panelBounds, viewportContained, contained:inside(panelBounds, bounds) && panel.scrollWidth <= panel.clientWidth + 1};
    if (group === 'dashboard') return {...base, columns:getComputedStyle(panel).gridTemplateColumns.split(' ').length, tiles:[...panel.querySelectorAll('[data-ely-dashboard-tile]')].map(tile => {
      const box = rect(tile), texts = [...tile.querySelectorAll('h2,small,output')].map(node => {const range = document.createRange(); range.selectNodeContents(node); return rect(range);});
      return {...box, key:tile.dataset.elyKey, x:tile.dataset.elyX, y:tile.dataset.elyY, w:tile.dataset.elyW, h:tile.dataset.elyH,
        textFits:inside(box,panelBounds) && texts.every(text => inside(text,box) && text.top >= box.top - 1 && text.bottom <= box.bottom + 1),
        ordered:texts.every((text,i,all) => i === 0 || text.top >= all[i-1].bottom - 1)};
    })};
    return {...base, meterContained:inside(rect(panel.querySelector('.ely-data__meter')),bounds), gauges:[...panel.querySelectorAll('.ely-data__gauge')].map(node => ({...rect(node),contained:inside(rect(node),bounds),text:node.textContent.trim()}))};
  }, group);
}
const report = {node:process.version, checks:[], negatives:[], screenshots:[], console:[], cleanup:{}};
let child, browser;
async function capture(root, name) {
  assert(report.screenshots.length < 88, 'bounded screenshot count');
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
  const reservation = createServer();
  await new Promise((resolve,reject) => {reservation.once('error',reject); reservation.listen(0,'127.0.0.1',resolve);});
  const port = reservation.address().port;
  await new Promise(resolve => reservation.close(resolve));
  const base = `http://127.0.0.1:${port}`;
  child = spawn(join(temp,'gallery'),['-addr',`127.0.0.1:${port}`],{stdio:'ignore'});
  report.serverPID = child.pid;
  let ready = false;
  for (let i=0;i<200;i++) {try {if ((await fetch(`${base}/components`,{signal:AbortSignal.timeout(500)})).ok) {ready=true;break;}} catch {} await new Promise(resolve => setTimeout(resolve,50));}
  assert(ready,'owned gallery startup');
  browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
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
        const target = group === 'chart' ? root.locator('.ely-data__chart text').first() : root.locator(group === 'dashboard' ? '[data-ely-dashboard]' : '.ely-data__measures');
        const original = await target.getAttribute('style');
        await target.evaluate((node,group) => {
          if(group==='chart')node.style.setProperty('fill','rgb(255, 0, 255)','important');
          else if(group==='dashboard'){node.style.setProperty('grid-template-columns','repeat(4,minmax(0,1fr))','important');node.style.setProperty('grid-auto-rows','5.5rem','important');}
          else {
            const widerThanRoot = node.closest('[data-ely-family]').getBoundingClientRect().width + 100;
            node.style.setProperty('grid-template-columns','minmax(14rem,2fr) repeat(2,7rem)','important');
            node.style.setProperty('min-width',`${widerThanRoot}px`,'important');
          }
        },group);
        const broken = await measure(root,group);
        report.negatives.push({profile,identity,group,metrics:broken,rejected:!valid(broken,group,mobile)});
        await capture(root,`${profile}-negative-${group}`);
        assert(!valid(broken,group,mobile),`${profile} ${group} negative must be rejected`);
        await target.evaluate((node,style) => {if(style===null)node.removeAttribute('style');else node.setAttribute('style',style);},original);
        await page.evaluate(() => window.scrollTo(0,window.scrollY));
        assert(valid(await measure(root,group),group,mobile),`${group} restored after negative`);
      }
    }
    await page.close();
  }
  assert.equal(report.checks.length,76);
  assert.equal(report.negatives.length,12);
  assert.equal(report.console.length,0,JSON.stringify(report.console));
  assert.deepEqual(await snapshot(),report.sourceHashes,'focused source changed during run');
  assert.equal(run('git',['rev-parse','HEAD']),report.revision,'HEAD changed during run');
  report.status='passed';
} catch(error) {report.status='failed';report.error=String(error.stack || error);process.exitCode=1;}
finally {
  try {if(browser)await browser.close();report.cleanup.browserClosed=true;} catch(error) {report.cleanup.browserError=String(error);process.exitCode=1;}
  if(child && child.exitCode===null && child.signalCode===null) {
    const exited = new Promise(resolve => child.once('exit',resolve));
    child.kill('SIGTERM');
    await Promise.race([exited,new Promise(resolve => setTimeout(resolve,3000))]);
    if(child.exitCode===null && child.signalCode===null){child.kill('SIGKILL');await Promise.race([exited,new Promise(resolve => setTimeout(resolve,3000))]);}
  }
  report.cleanup.serverExited=!child || child.exitCode!==null || child.signalCode!==null;
  await rm(temp,{recursive:true,force:true});
  try {await access(temp);report.cleanup.tempRemoved=false;} catch(error) {if(error.code!=='ENOENT')throw error;report.cleanup.tempRemoved=true;}
  if(!Object.values(report.cleanup).every(value => value===true)){report.status='failed';process.exitCode=1;}
  report.pixelReview='pending independent inspection; screenshot capture and computed checks are not visual approval';
  await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify({status:report.status,output,checks:report.checks.length,negatives:report.negatives.length,cleanup:report.cleanup}));
}
