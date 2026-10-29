import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, mkdir, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve, parse} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const repo = process.cwd();
// SVG_REPAIR_OUTPUT selects a parent directory, never an existing run to overwrite.
const outputRoot = resolve(process.env.SVG_REPAIR_OUTPUT || join(repo, 'test-results', 'svg-repair'));
assert(outputRoot !== repo && outputRoot !== parse(outputRoot).root, 'Choose a dedicated SVG repair output directory');
let output, temp;
const env = {...process.env, GOTOOLCHAIN:'go1.26.9'};
const cases = ['charts/AreaChart','charts/StackedArea','charts/BarChart','charts/PieChart','charts/DonutChart','charts/ScatterChart','charts/BubbleChart','charts/RadarChart','charts/Treemap','charts/Sunburst','charts/SankeyChart','charts/FunnelChart','charts/WaterfallChart','charts/Histogram','charts/BoxPlot','charts/ViolinPlot','charts/NetworkGraph','charts/ForceGraph','charts/ChordDiagram','charts/ParallelCoordinates','finance/IndicatorOverlay','finance/IndicatorPane','finance/IndicatorSelector','finance/CompareSymbol','finance/PriceAlertLine','finance/PortfolioSummary','finance/AssetAllocationChart','finance/PerformanceChart','finance/SentimentGauge','charts/HeatmapChart','charts/CalendarHeatmap'];
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = {phases:{}, cleanup:false};
let browser, child;
function run(command, args, options={}) {
  const result = spawnSync(command,args,{cwd:repo,env,encoding:'utf8',maxBuffer:64*1024*1024,...options});
  assert.equal(result.status,0,`${command}: ${result.stderr}`);
  return result.stdout;
}
async function sourceSnapshot() {
  const revision = run('git', ['rev-parse', 'HEAD']).trim();
  const status = run('git', ['status', '--porcelain=v1', '-z']);
  const paths = [...new Set((run('git', ['diff', '--name-only', '-z', 'HEAD']) + run('git', ['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean))].sort();
  const dirtyFiles = [];
  for (const path of paths) {
    try { dirtyFiles.push({path, sha256:hash(await readFile(join(repo,path)))}); }
    catch (error) { if(error.code !== 'ENOENT') throw error; dirtyFiles.push({path, sha256:null, deleted:true}); }
  }
  return {revision, dirty:status.length>0, status, dirtyFiles};
}
async function stopServer() {
  if (!child) return;
  const owned = child; child = null;
  if (owned.exitCode !== null || owned.signalCode !== null) return;
  const exited = new Promise(resolve => owned.once('exit', resolve));
  owned.kill('SIGTERM');
  await exited;
}
try {
  await mkdir(outputRoot,{recursive:true});
  output = await mkdtemp(join(outputRoot, 'run-'));
  temp = await mkdtemp(join(tmpdir(), 'ely-svg-repair-'));
  // Historical comparison is opt-in; ordinary CI can run in a shallow checkout.
  report.baselineRevision = process.env.SVG_REPAIR_BASELINE ? run('git', ['rev-parse', '--verify', `${process.env.SVG_REPAIR_BASELINE}^{commit}`]).trim() : null;
  report.currentSource = await sourceSnapshot();
  report.sourceRevision = report.currentSource.revision;
  report.go = run('go', ['version']).trim();
  report.node = process.version;
  if (report.baselineRevision) {
    const before = join(temp,'before'); await mkdir(before);
    const archive = spawnSync('git',['archive',report.baselineRevision],{cwd:repo,maxBuffer:128*1024*1024});
    assert.equal(archive.status,0);
    run('tar',['-xf','-','-C',before],{input:archive.stdout});
    run('go',['build','-o',join(temp,'before-server'),'./examples/gohtmx/gallery'],{cwd:before});
  }
  run('go',['build','-o',join(temp,'after-server'),'./examples/gohtmx/gallery']);
  assert.deepEqual(await sourceSnapshot(), report.currentSource, 'Source changed while building; retry after writers finish');
  browser = await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  for (const phase of report.baselineRevision ? ['before','after'] : ['after']) {
    const reservation=createServer(); await new Promise(r=>reservation.listen(0,'127.0.0.1',r)); const port=reservation.address().port; await new Promise(r=>reservation.close(r));
    const binary=join(temp,`${phase}-server`), base=`http://127.0.0.1:${port}`;
    child=spawn(binary,['-addr',`127.0.0.1:${port}`],{stdio:'ignore'});
    for(let i=0;i<200;i++){try{if((await fetch(base+'/components')).ok)break;}catch{} await new Promise(r=>setTimeout(r,50));}
    const page=await browser.newPage({viewport:{width:1440,height:1000}}), errors=[];
    page.on('console',m=>{if(m.type()==='error')errors.push(m.text());}); page.on('pageerror',e=>errors.push(e.message));
    await page.goto(base+'/components/audit?family=data&aliases=1'); await page.waitForTimeout(250);
    const results=[]; await mkdir(join(output,phase),{recursive:true});
    for(const name of cases){
      const card=page.locator(`[data-audit-name="${name}"]`); assert.equal(await card.count(),1,name);
      const root=card.locator('[data-audit-main]');
      const result=await root.evaluate(node=>({svgs:[...node.querySelectorAll('svg')].map(svg=>{const box=svg.getBBox(),rect=svg.getBoundingClientRect();return {viewBox:svg.getAttribute('viewBox'),geometry:{width:box.width,height:box.height},visible:{width:rect.width,height:rect.height}};}),heatmaps:[...node.querySelectorAll('.ely-data__heatmap')].map(n=>({cells:n.children.length,text:n.textContent,rect:{width:n.getBoundingClientRect().width,height:n.getBoundingClientRect().height}}))}));
      const file=`${name.replaceAll('/','-')}.png`, path=join(output,phase,file); await card.screenshot({path});
      result.name=name;result.screenshot={path:`${phase}/${file}`,sha256:hash(await readFile(path))}; results.push(result);
      if(phase==='after'){
        if(name.includes('Heatmap')){assert(result.heatmaps[0].cells>0,name+' heatmap cells');assert(result.heatmaps[0].rect.width>0&&result.heatmaps[0].rect.height>0,name+' visible heatmap');assert(result.heatmaps[0].text.trim(),name+' visible cell values');}
        else {assert.equal(result.svgs.length,1,name);const svg=result.svgs[0],numbers=svg.viewBox.trim().split(/[ ,]+/).map(Number);assert.equal(numbers.length,4,name);assert(numbers.every(Number.isFinite)&&numbers[2]>0&&numbers[3]>0,name+' valid viewBox');assert(svg.geometry.width>0&&svg.geometry.height>0&&svg.visible.width>0&&svg.visible.height>0,name+' visible geometry');}
      }
    }
    report.phases[phase]={source:phase==='before'?{revision:report.baselineRevision,dirty:false}:report.currentSource,binarySHA256:hash(await readFile(binary)),errors,results};
    await page.close();await stopServer();
  }
  if (report.phases.before) report.beforeInvalidViewBoxCount=report.phases.before.results.filter(r=>r.svgs.some(s=>!s.viewBox)).length;
  assert.equal(report.phases.after.errors.length,0,'after browser errors');
  report.status='passed';
} catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally {
  await stopServer();
  if(browser)await browser.close();
  if(temp)await rm(temp,{recursive:true,force:true});report.cleanup=true;
  if(output)await writeFile(resolve(output,'report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify({status:report.status,error:report.error,cases:cases.length,cleanup:report.cleanup,output}));
}
