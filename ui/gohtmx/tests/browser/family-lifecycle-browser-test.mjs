import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

// Production Go renderer, production family entrypoint, bundled HTMX network
// swaps. Probe family additionally makes observer/timer disposal measurable.
const rendered = execFileSync('go', ['run', './ui/gohtmx/tests/fixtures/table-contracts'], {encoding: 'utf8'});
const fragment = execFileSync('go', ['run', './ui/gohtmx/tests/fixtures/table-contracts', 'fragment'], {encoding: 'utf8'});
const probeBody = '<button data-ely-action="save">Save</button><input name="value" value="fresh">';
const probes = `<section id="parent" data-ely-family="probe">${probeBody}<section id="nested" data-ely-family="probe">${probeBody}</section></section><section id="unrelated" data-ely-family="probe">${probeBody}</section>`;
const fixture = rendered.replace(' hx-swap="outerHTML"', '').replace('</body>', `${probes}<div id="status"></div><script type="module" src="/probe.js"></script></body>`);
const probeScript = `import {register,mount,emit} from '/assets/ely-api.js';
window.api={mount,emit}; window.stats={starts:{},stops:{},timers:0,observers:0,actions:[],results:[],errors:[]};
register('probe', root=>{ const s=window.stats,id=root.id;s.starts[id]=(s.starts[id]||0)+1;
 const timer=setInterval(()=>{},20);s.timers++;
 const observer=new MutationObserver(()=>{});observer.observe(root,{childList:true});s.observers++;
 return ()=>{clearInterval(timer);observer.disconnect();s.timers--;s.observers--;s.stops[id]=(s.stops[id]||0)+1;}; });
document.addEventListener('ely:result',e=>stats.results.push(e.detail.result));
document.addEventListener('ely:error',e=>stats.errors.push(e.detail.error?.message));`;
const mutation = process.env.LIFECYCLE_NEGATIVE_CONTROL || '';
assert(['', 'stale-refs', 'stale-results'].includes(mutation));
const report = {suite: 'family-lifecycle', revision: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), mutation, checks: [], status: 'running'};
const server = createServer(async (req,res) => {
  try {
    res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/html');
    let content = req.url === '/' ? fixture : req.url === '/fragment' ? fragment : req.url === '/page-fragment' ? rendered : req.url === '/probe-fragment' ? probeBody : req.url === '/oob' ? `<p>done</p><section id="unrelated" hx-swap-oob="innerHTML">${probeBody}</section>` : req.url === '/probe.js' ? probeScript : await readFile(new URL(`../..${req.url}`, import.meta.url), 'utf8');
    if (req.url === '/assets/ely-api.js') {
      if (mutation === 'stale-refs') { assert(content.includes('ordered.forEach(stop);')); content=content.replace('ordered.forEach(stop);','// disabled teardown'); }
      if (mutation === 'stale-results') { assert(content.includes('hostBindings.get(root)?.invalidate();')); content=content.replace('hostBindings.get(root)?.invalidate();','// disabled invalidation'); }
    }
    res.end(content);
  } catch (error) { res.writeHead(500).end(String(error)); }
});
let browser;
try {
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage(), pageErrors=[];page.on('pageerror',e=>pageErrors.push(e.message));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(()=>window.api&&document.querySelector('#table-a')?.dataset.elyReady==='true');
  const paged = id => page.locator(`#${id} > [data-ely-paged-table]`);
  const names=()=>paged('table-a').locator('tbody tr:not([hidden]) td:nth-child(2)').allTextContents();
  const verifyTable = async id => {
    const structure=await page.evaluate(id=>{
      const root=document.getElementById(id), owned=[...root.querySelectorAll('[data-ely-paged-table]')].filter(el=>el.closest('[data-ely-family]')===root);
      const table=owned[0], reuse=root.querySelector(`#${id}-table-reuse`);
      const ids=[...document.querySelectorAll('[id]')].map(el=>el.id);
      return {rootCount:document.querySelectorAll(`[id="${id}"]`).length,
        childTags:[...root.children].map(el=>el.tagName), nestedFamilies:root.querySelectorAll('[data-ely-family]').length,
        ownedCount:owned.length, ownedID:table?.id, direct:table?.parentElement===root,
        sortCount:table?.querySelectorAll('[data-ui-table-sort="0"]').length,
        reuseID:reuse?.id, reuseHidden:reuse?.parentElement?.hidden,
        reuseOwner:reuse?.closest('[data-ely-family]')?.id,
        rows:table?.querySelectorAll('tbody tr').length,
        duplicateIDs:ids.filter((value,index)=>ids.indexOf(value)!==index)};
    },id);
    assert.deepEqual(structure,{rootCount:1,childTags:['DIV','SECTION'],nestedFamilies:0,ownedCount:1,
      ownedID:`${id}-table`,direct:true,sortCount:1,reuseID:`${id}-table-reuse`,reuseHidden:true,reuseOwner:id,rows:10,duplicateIDs:[]},'production fixture must contain exactly one owned paged controller and its separate hidden reuse fixture');
  };
  await verifyTable('table-a'); await verifyTable('table-b');
  report.checks.push('production renderer structure: one owned direct paged table plus separate hidden reuse table, no nested family roots or duplicate IDs');
  for (let i=0;i<3;i++) {
    await page.evaluate(()=>{window.retained=document.querySelector('#table-a');window.oldSort=retained.querySelector(':scope > [data-ely-paged-table] [data-ui-table-sort="0"]');window.oldHeading=oldSort.parentElement;window.oldState=oldHeading.getAttribute('aria-sort');window.cleanupCount=0;retained.addEventListener('ely:cleanup',()=>window.cleanupCount++,{once:true});});
    // ajax forwards select into the request context; bundled HTMX selects
    // these two direct children before swapping. Keep the hidden reuse fixture
    // too, then exercise only the structurally asserted owned paged controller.
    // No swap option: exercise HTMX's actual default innerHTML behavior.
    await page.evaluate(()=>htmx.ajax('GET','/fragment',{source:'#replace',target:'#table-a',select:'#table-a > *'}));
    await page.waitForFunction(()=>document.querySelector('#table-a')?.dataset.elyReady==='true');
    await verifyTable('table-a');
    await paged('table-a').locator('[data-ui-table-sort="0"]').click();
    assert.equal((await names())[0],'1','fresh cached refs must be rebound');
    assert.equal(await page.evaluate(()=>document.querySelector('#table-a')===retained),true);
    assert.equal(await page.evaluate(()=>cleanupCount),1);
    assert.equal(await page.evaluate(()=>{const state=oldHeading.getAttribute('aria-sort');oldSort.dispatchEvent(new MouseEvent('click',{bubbles:true}));return oldHeading.getAttribute('aria-sort')===state;}),true,'old descendant listeners must be inert');
    assert.equal(await paged('table-b').locator('tbody tr').first().locator('td').nth(1).textContent(),'10');
  }
  report.checks.push('three default innerHTML swaps rebuild production DataTable refs, exactly-once cleanup, detached handlers inert, sibling unchanged');
  // Real delayed context A overlaps a completed context B. Context B must not
  // restart A against its old descendants. The source elements are distinct.
  await page.evaluate(()=>{
    const timeout=htmx.timeout;
    htmx.timeout=function(value){
      if(Number(value)===12345){htmx.timeout=timeout;return new Promise(resolve=>{window.releaseDelayedSwap=resolve;});}
      return timeout.call(this,value);
    };
    window.delayed=htmx.ajax('GET','/fragment',{source:'#replace',target:'#table-a',select:'#table-a > *',swap:'innerHTML swap:12345'});
  });
  await page.waitForFunction(()=>window.releaseDelayedSwap&&!document.querySelector('#table-a').dataset.elyReady);
  await page.evaluate(()=>htmx.ajax('GET','/page-fragment',{target:'#table-b',select:'#table-b > *'}));
  assert.equal(await page.locator('#table-a').getAttribute('data-ely-ready'),null,'pending context must not remount on unrelated completion');
  await page.evaluate(()=>{releaseDelayedSwap();return window.delayed;});
  await verifyTable('table-a'); await verifyTable('table-b');
  await paged('table-a').locator('[data-ui-table-sort="0"]').click();assert.equal((await names())[0],'1','delayed swap must bind fresh refs');
  report.checks.push('delayed real HTMX swap cannot be remounted by unrelated completed swap');

  await page.evaluate(()=>{
    const root=document.querySelector('#parent');window.parentRoot=root;
    api.mount(root,{onAction:detail=>{stats.actions.push(detail.action);return new Promise((resolve,reject)=>{window.oldResolve=resolve;window.oldReject=reject;});}});
    api.emit(root,'save');
  });
  await page.evaluate(()=>htmx.ajax('GET','/probe-fragment',{target:'#parent'}));
  await page.evaluate(()=>oldResolve('obsolete')); await page.evaluate(()=>Promise.resolve());
  assert.deepEqual(await page.evaluate(()=>stats.results),[],'stale callback effects must be suppressed');
  assert.deepEqual(await page.evaluate(()=>({timers:stats.timers,observers:stats.observers,starts:stats.starts,stops:stats.stops})),{timers:2,observers:2,starts:{parent:2,nested:1,unrelated:1},stops:{nested:1,parent:1}});
  await page.locator('#parent button').click();assert.deepEqual(await page.evaluate(()=>stats.actions),['save','save'],'retained host callback remains bound once');
  await page.evaluate(()=>oldResolve('current'));await page.waitForFunction(()=>stats.results.length===1);
  assert.deepEqual(await page.evaluate(()=>stats.results),['current']);
  // Start again with same operation name before settling the obsolete promise.
  await page.locator('#parent button').click();await page.evaluate(()=>window.staleResolve=oldResolve);
  await page.evaluate(()=>htmx.ajax('GET','/probe-fragment',{target:'#parent'}));
  await page.locator('#parent button').click();await page.evaluate(()=>{staleResolve('collision');oldResolve('latest');});
  await page.waitForFunction(()=>stats.results.length===2);assert.deepEqual(await page.evaluate(()=>stats.results),['current','latest']);
  report.checks.push('retained host bindings, stale completion invalidation including same-action token reuse, nested disposal and timer/observer balance');
  await page.evaluate(()=>{window.savedTable=document.querySelector('#table-a');window.tableCleanups=0;savedTable.addEventListener('ely:cleanup',()=>window.tableCleanups++);api.mount(savedTable,{onAction:()=>stats.actions.push('old-table')});});
  await page.evaluate(()=>htmx.ajax('GET','/fragment',{target:'#table-a',swap:'outerHTML'}));
  assert.equal(await page.evaluate(()=>tableCleanups),1); await verifyTable('table-a');
  await page.evaluate(()=>{document.querySelector('#table-a').remove();document.body.append(savedTable);document.dispatchEvent(new Event('htmx:after:swap'));api.emit(savedTable,'save');});
  assert.equal(await page.evaluate(()=>stats.actions.includes('old-table')),false,'detached host must not resurrect');
  await page.evaluate(()=>api.mount(savedTable,{onAction:()=>stats.actions.push('rebound-table')}));
  await page.evaluate(()=>api.emit(savedTable,'save'));assert.equal(await page.evaluate(()=>stats.actions.filter(x=>x==='rebound-table').length),1);
  await verifyTable('table-a');
  await paged('table-a').locator('[data-ui-table-filter]').fill('2');assert.deepEqual(await names(),['2']);
  await page.evaluate(()=>{window.unrelatedRoot=document.querySelector('#unrelated');window.parentStarts=stats.starts.parent;});
  await page.evaluate(()=>htmx.ajax('GET','/oob',{source:'#replace',target:'#status'}));
  assert.equal(await page.evaluate(()=>document.querySelector('#unrelated')===unrelatedRoot),true);
  assert.equal(await page.evaluate(()=>stats.starts.unrelated),2);assert.equal(await page.evaluate(()=>stats.stops.unrelated),1);
  assert.equal(await page.evaluate(()=>stats.starts.parent===parentStarts),true);
  assert.equal(await page.evaluate(()=>stats.timers),2);assert.equal(await page.evaluate(()=>stats.observers),2);
  report.checks.push('out-of-band retained-root target tears down once while request source and unrelated roots stay untouched');
  assert.deepEqual(pageErrors,[]);report.checks.push('real outerHTML cleanup and same-node reinsertion with explicit host rebinding');
  assert.equal(mutation,'','negative control survived');report.status='passed';
} catch(error) {
  report.error=error.stack;
  const expected=mutation==='stale-refs'?'fresh cached refs must be rebound':'stale callback effects must be suppressed';
  if(mutation&&error instanceof assert.AssertionError&&error.message.includes(expected))report.status='mutation-killed';
  else {report.status='failed';throw error;}
} finally {
  await mkdir('test-results/contracts',{recursive:true});await writeFile(`test-results/contracts/family-lifecycle${mutation?'-'+mutation:''}.json`,JSON.stringify(report,null,2));
  await browser?.close();await new Promise(resolve=>server.close(resolve));
}
