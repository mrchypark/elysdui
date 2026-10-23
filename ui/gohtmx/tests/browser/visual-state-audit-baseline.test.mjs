import assert from 'node:assert/strict';
import {test} from 'node:test';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, mkdtemp, readFile, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {captureBounds} from './visual-state-audit-bounds.mjs';
import {runInNewContext} from 'node:vm';
import {EventEmitter} from 'node:events';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const runner = join(repo, 'ui/gohtmx/tests/browser/visual-state-audit-baseline.mjs');
test('layout attribution pure: exact identities, measured widths and bounded truncation', async () => {
  const source = await readFile(runner, 'utf8');
  const block = source.match(/const layoutDiagnostics = \(\(\) => \{[\s\S]*?\n        \}\)\(\);/)[0];
  const make = width => ({localName:'div',id:'',children:[],childNodes:[],parentElement:null,clientWidth:width,clientHeight:10,clientLeft:0,clientTop:0,scrollWidth:width+188,scrollHeight:10,scrollLeft:0,scrollTop:0,getAttribute:()=>null,getBoundingClientRect:()=>({x:0,y:0,left:0,top:0,right:width,bottom:10,width,height:10}),querySelectorAll:()=>[]});
  const element=make(308); let tail=element;
  for(let i=0;i<34;i++){tail.parentElement=make(308);tail=tail.parentElement;}
  element.children=Array.from({length:100},()=>make(240));
  const text={nodeType:3,textContent:'required label'};element.childNodes=[text];
  const context={element,caseId:'gallery:misc/LicenseViewer',getComputedStyle:()=>({overflowX:'hidden',overflowY:'visible',width:'308px'}),box:node=>node.getBoundingClientRect(),Node:{TEXT_NODE:3},document:{documentElement:{clientWidth:375,clientHeight:844},createRange:()=>({selectNodeContents(){},getClientRects:()=>Array.from({length:33},()=>({left:0,top:0,right:10,bottom:10}))})},window:{visualViewport:{width:390,height:844,offsetLeft:0,offsetTop:0,scale:1}}};
  const evaluate=caseId=>JSON.parse(JSON.stringify(runInNewContext(`${block}\nlayoutDiagnostics`,{...context,caseId})));
  const result=evaluate(context.caseId);
  assert.equal(result.ancestors.length,32);assert.equal(result.ancestorsTruncated,true);
  assert.equal(result.children.length,96);assert.equal(result.childrenTruncated,true);
  assert.equal(result.children[0].textRanges.length,32);assert.equal(result.children[0].textRangesTruncated,true);
  assert.equal(result.ancestors[0].clientWidth,308);assert.equal(result.layoutViewport.clientWidth,375);assert.equal(result.visualViewport.width,390);
  assert.equal(result.ancestors[0].scrollWidth,496);assert.equal(result.ancestors[0].style.overflowX,'hidden');
  assert.equal(result.diagnosticOnly,true);assert.equal(Object.hasOwn(result,'pass'),false);
  const exact=['layout/Layer','layout/ResizeHandle','layout/Dock','primitives/Canvas','primitives/Slot','canvas/InspectorPanel','misc/LicenseViewer'];
  for(const identity of exact)assert(evaluate(`gallery:${identity}`));
  assert.equal(evaluate('gallery:canvas/LayerPanel'),null,'behavior key cannot substitute for exact InspectorPanel');
  assert.equal(evaluate('gallery:misc/Terms'),null);
  element.parentElement=null;element.children=[];element.childNodes=[];
  const short=evaluate(context.caseId);assert.equal(short.ancestorsTruncated,false);assert.equal(short.childrenTruncated,false);
});
test('explicit production root requires exact revision without attributing secondary harness to it', async () => {
  const source = await readFile(runner, 'utf8');
  const fn = source.match(/function pinnedSourceRoot\(sourceRoot, revision\) \{[\s\S]*?\n\}/)[0];
  const pinned = runInNewContext(`(${fn})`, {assert, resolve, execFileSync});
  const revision = execFileSync('git', ['rev-parse','HEAD'], {cwd: repo, encoding:'utf8'}).trim();
  assert.equal(pinned(repo, revision), resolve(repo));
  assert.throws(() => pinned(repo, '0'.repeat(40)), /source revision pin mismatch/);
  assert.throws(() => pinned(repo, null), /requires full/);
  assert.throws(() => pinned(join(repo,'ui'), revision), /repository root/);
  assert(source.includes('productionRoot: sourceRepo'));
  assert(source.includes('harnessSource = {root: repo, revision:'));
  assert(source.includes("readFile(new URL(name, import.meta.url))"), 'hash executing harness, not production copy');
  assert(source.includes("matrix production revision pin mismatch"));
  for (const line of source.split('\n').filter(line => /const build =|const exported =|child = spawn\(binary/.test(line))) assert(line.includes('cwd: sourceRepo'));
});
test('owned asset route proves delivered bytes before worker-close and rejects missing proof', async () => {
  const source = await readFile(runner, 'utf8');
  const fn = source.match(/async function fulfillAsset\(route, page, timeout = 30000\) \{[\s\S]*?\n\}/)[0];
  const hash = bytes => createHash('sha256').update(bytes).digest('hex');
  const fulfillAsset = runInNewContext(`(${fn})`, {URL, assert, sha256: hash, setTimeout, clearTimeout});
  const bytes = Buffer.from('postMessage("ready")');
  const page = new EventEmitter(), context = new EventEmitter();
  page.context = () => context;
  let delivered;
  const response = {ok: () => true, url: () => 'http://owned/assets/worker.js', body: async () => bytes};
  const request = {url: response.url, failure: () => null};
  const route = {request: () => request, fetch: async () => response, fulfill: async options => { assert.equal(options.response, response); delivered = options.body; page.emit('requestfinished', request); context.emit('close'); }};
  const proof = await fulfillAsset(route, page);
  assert.equal(delivered, bytes, 'same actual response bytes are delivered, not recheck bytes');
  assert.equal(proof.sha256, hash(delivered));
  assert.equal(proof.bytes, bytes.length);
  await assert.rejects(fulfillAsset({...route, fetch: async () => ({...response, body: async () => { throw new Error('worker closed before byte proof'); }})}, page), /worker closed before byte proof/);
  await assert.rejects(fulfillAsset({...route, fulfill: async () => { throw new Error('delivery failed'); }}, page), /delivery failed/);
  // Model safeRace resolving undefined on closure without protocol delivery completion.
  await assert.rejects(fulfillAsset({...route, fulfill: async () => { context.emit('close'); return undefined; }}, page), /target closed before request completion/);
  await assert.rejects(fulfillAsset({...route, fulfill: async () => {}}, page, 5), /completion missing/);
  await assert.rejects(fulfillAsset({...route, fulfill: async () => { page.emit('requestfailed', request); }}, page), /request failed/);
  await assert.rejects(fulfillAsset({...route, fulfill: async () => { page.emit('requestfinished', {}); }}, page, 5), /completion missing/, 'unrelated request cannot establish proof');
  assert.equal(page.listenerCount('requestfinished'), 0);
  assert.equal(context.listenerCount('close'), 0);
});
test('capture camera converts document bounds only when the whole union fits viewport', async () => {
  const source = await readFile(runner, 'utf8');
  const fn = source.match(/function captureCamera\(clip, scroll, viewport\) \{[\s\S]*?\n\}/)[0];
  const camera = runInNewContext(`(${fn})`);
  const clip = {x: 85, y: 20242, width: 1270, height: 280};
  const viewport = {width: 1440, height: 1000}, scroll = {x: 0, y: 19866};
  const normalized = value => JSON.parse(JSON.stringify(value));
  assert.deepEqual(normalized(camera(clip, scroll, viewport)), {fullPage: false, clip: {...clip, y: 376}});
  assert.deepEqual(normalized(camera({...clip, width: 1500}, scroll, viewport)), {fullPage: true, clip: {...clip, width: 1500}});
  assert.equal(camera(clip, {x: 86, y: 19866}, viewport).fullPage, true, 'negative viewport edge keeps document fallback');
  assert.equal(camera(clip, {x: 0, y: 19000}, viewport).fullPage, true, 'below viewport keeps document fallback');
  assert.deepEqual(clip, {x: 85, y: 20242, width: 1270, height: 280}, 'receipt coordinates remain unchanged');
});
test('portable CLI requires explicit matrix and lists all eight render profiles', () => {
  const env = {...process.env};
  delete env.VISUAL_AUDIT_MATRIX;
  const missing = spawnSync(process.execPath, [runner], {cwd: '/', env, encoding: 'utf8'});
  assert.equal(missing.status, 2);
  assert.match(missing.stderr, /missing required --matrix/);
  const help = spawnSync(process.execPath, [runner, '--help'], {cwd: '/', env, encoding: 'utf8'});
  assert.equal(help.status, 0);
  for (const mode of ['live', 'static']) for (const size of ['desktop', 'mobile']) for (const theme of ['light', 'dark']) assert(help.stdout.includes(`${mode}-${size}-${theme}`));
});

for (const mutate of [false, true]) test(mutate ? 'matrix changes during capture invalidate the run and return failure' : 'stable matrix and actually served assets remain complete', async () => {
  const temp = await mkdtemp(join(tmpdir(), 'ely-baseline-drift-'));
  const matrixPath = join(temp, 'matrix.json'), output = join(temp, 'capture');
  const matrix = {source: {}, auditCases: [{caseId: 'fixture:Bounds', componentIdentity: 'fixture/Bounds', family: 'fixture', surface: ['live-audit'], profileIds: ['live-desktop-light']}]};
  await writeFile(matrixPath, JSON.stringify(matrix));
  const server = createServer(async (_request, response) => {
    if (_request.url === '/assets/fixture.css') {
      response.setHeader('content-type', 'text/css');
      response.end(':root{--test-token:#FFFFFF}');
      return;
    }
    // The change happens after the runner's starting snapshot, before its ending snapshot.
    if (mutate) await writeFile(matrixPath, JSON.stringify({...matrix, changedDuringCapture: true}));
    response.setHeader('content-type', 'text/html');
    response.end(`<html lang="en"><link rel="stylesheet" href="/assets/fixture.css"><script>
      window.ElyTheme={apply(){},current(){return {id:'ely',mode:'light'}},get(){return {light:{'test-token':'#FFFFFF'}}},tokens:['test-token']};
    </script><article data-audit-name="fixture/Bounds"><div data-audit-main><section data-ely-family="fixture" data-ely-component="fixture/Bounds" data-ely-ready="true">Visible target</section></div></article></html>`);
  });
  let child;
  try {
    await new Promise(r => server.listen(0, '127.0.0.1', r));
    child = spawn(process.execPath, [runner, `--matrix=${matrixPath}`, `--output-dir=${output}`, '--case=fixture/Bounds', '--context-case=fixture/Bounds', `--base-url=http://127.0.0.1:${server.address().port}`], {cwd: repo, env: {...process.env, GOTOOLCHAIN: 'go1.26.9'}});
    let log = '';
    child.stdout.on('data', bytes => log += bytes);
    child.stderr.on('data', bytes => log += bytes);
    const code = await new Promise((accept, reject) => { child.once('error', reject); child.once('exit', accept); });
    assert.equal(code, mutate ? 1 : 0, log);
    const summary = JSON.parse(await readFile(join(output, 'profile-summary.json'), 'utf8'));
    assert.equal(summary.status, mutate ? 'stale' : 'complete', log);
    if (mutate) {
      assert.notEqual(summary.sourceBase.matrixSHA256, summary.endingSourceBase.matrixSHA256);
      assert(summary.sourceDrift);
    } else {
      assert.equal(summary.sourceDrift, null);
      const receipt = JSON.parse(await readFile(join(output, 'batch-0001/receipts.json'), 'utf8'));
      assert.equal(receipt.productionAssets[0].sha256, receipt.productionAssets[0].recheckSHA256);
      assert.equal(receipt.productionAssets[0].recheckStatus, 200);
      assert.equal(receipt.cases[0].contextEvidence.explicitlyRequested, true, 'explicit target gets a context supplement even without overflow');
      assert.equal(receipt.cases[0].contextEvidence.componentIdentity, 'fixture/Bounds');
      assert((await readFile(join(output, receipt.cases[0].contextEvidence.path))).length > 0);
    }
  } finally {
    if (child && child.exitCode === null && child.signalCode === null) {
      const done = new Promise(r => child.once('exit', r));
      child.kill('SIGTERM'); await done;
    }
    await new Promise(r => server.close(r));
    await rm(temp, {recursive: true, force: true});
  }
});

test('actual gallery CSS separates painted audit instances and preserves the responsive API grid', async () => {
  const browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  try {
    const page = await browser.newPage();
    await page.setContent(`<main>
      <ol class="advanced-cases"><li data-audit-case><div class="advanced-grid">
        <div data-audit-main><section class="painted">Primary fixed-width specimen</section></div>
        <div data-audit-twin><section class="painted">Independent fixed-width twin</section></div>
      </div></li></ol>
      <div id="api" class="advanced-grid"><article class="advanced-card">API A</article><article class="advanced-card">API B</article></div>
    </main>`);
    await page.addStyleTag({path: join(repo, 'internal/gallery/assets/advanced.css')});
    await page.addStyleTag({content: ':root{--border:#ccc;--surface:white}body{margin:0}main{max-width:1000px}.painted{width:640px;height:120px;background:#ddd}'});
    const measure = () => page.evaluate(() => {
      const rect = node => { const r = node.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom}; };
      const [primary, twin] = [...document.querySelectorAll('.painted')].map(rect);
      const api = document.querySelector('#api');
      return {
        primary, twin,
        overlaps: primary.left < twin.right && twin.left < primary.right && primary.top < twin.bottom && twin.top < primary.bottom,
        auditColumns: getComputedStyle(document.querySelector('[data-audit-case]>.advanced-grid')).gridTemplateColumns.split(/\s+/).length,
        apiColumns: getComputedStyle(api).gridTemplateColumns.split(/\s+/).length,
        apiCards: [...api.children].map(rect),
      };
    });
    for (const width of [1440, 390]) {
      await page.setViewportSize({width, height: 900});
      const layout = await measure();
      assert.equal(layout.overlaps, false, `${width}: painted fixed-width primary and twin must not overlap`);
      assert(layout.twin.top >= layout.primary.bottom + 20, `${width}: audit specimens keep their vertical gap`);
      assert.equal(layout.auditColumns, 1, `${width}: audit-only stacking`);
      assert.equal(layout.apiColumns, width === 1440 ? 2 : 1, `${width}: ordinary API grid keeps its responsive columns`);
      if (width === 1440) {
        assert.equal(layout.apiCards[0].top, layout.apiCards[1].top, 'desktop API cards share a row');
        const legacy = await page.addStyleTag({content: '[data-audit-case]>.advanced-grid{grid-template-columns:repeat(2,minmax(0,1fr))}'});
        assert.equal((await measure()).overlaps, true, 'red control: two narrow audit columns overlap actual fixed-width painted descendants');
        await legacy.evaluate(node => node.remove());
      } else assert(layout.apiCards[1].top >= layout.apiCards[0].bottom, 'mobile API cards stack');
    }
  } finally { await browser.close(); }
});

test('capture contains target overflow/text, preserves clipping, excludes unrelated composites', async () => {
  const parent = join(repo, 'test-results/visual-audit-bounds');
  await mkdir(parent, {recursive: true});
  const output = await mkdtemp(join(parent, 'run-'));
  const browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  const checks = [];
  try {
    const page = await browser.newPage({viewport: {width: 900, height: 700}});
    await page.setContent(`<style>
      body{margin:0;padding:20px} section{margin:0 0 20px;position:relative;width:120px;height:30px;outline:1px solid black}
      button{position:absolute;left:105px;top:26px;width:90px;height:32px}
      #mail{width:623px;height:55px} #mail>div{width:640px;height:50px;background:#ddd}
      #clipped{overflow:hidden} #clipped>div{width:640px;height:90px;background:red}
      #text{white-space:nowrap;width:40px} #empty{height:0} #empty>span{display:inline-block;width:170px;height:25px}
      #unrelated{position:absolute;left:780px;top:0;width:100px;height:100px}
    </style>
    <div style="height:1400px"></div>
    <section id="buttons"><span>Notification</span><button>Reset</button></section>
    <section id="mail"><div>Fixed width mail contents</div></section>
    <section id="clipped"><div>Intentionally clipped</div></section>
    <section id="text">InteractionAsyncView TypingIndicator SyncStatus</section>
    <section id="empty"><span>DotsLoader</span></section>
    <aside id="unrelated">Irrelevant composite</aside>`);
    for (const id of ['buttons', 'mail', 'clipped', 'text', 'empty']) {
      await page.locator('#' + id).evaluate(node => node.scrollIntoView());
      const bounds = await page.locator('#' + id).evaluate(captureBounds);
      if (id === 'buttons') { assert(bounds.clip.width >= 195); assert(bounds.clip.height >= 58); }
      if (id === 'mail') assert.equal(bounds.clip.width, 640, 'do not shrink the fixed-width pane to 623px');
      if (id === 'clipped') { assert.equal(bounds.clip.width, 120); assert.equal(bounds.clip.height, 30); assert(bounds.clippedCount > 0); }
      if (id === 'text') assert(bounds.clip.width > 250, 'painted text ranges extend beyond element bounds');
      if (id === 'empty') assert.equal(bounds.clip.height, 25, 'zero-height wrapper with visible target children');
      assert(bounds.clip.x + bounds.clip.width < 780, 'exclude unrelated composite fragment');
      const path = join(output, `${id}.png`);
      assert(bounds.clip.y > 700, 'exercise document coordinates after scrolling');
      await page.screenshot({path, fullPage: true, clip: bounds.clip});
      const png = await readFile(path);
      assert.equal(png.readUInt32BE(16), bounds.clip.width, 'actual PNG width matches receipt');
      assert.equal(png.readUInt32BE(20), bounds.clip.height, 'actual PNG height matches receipt');
      checks.push({id, bounds, sha256: createHash('sha256').update(png).digest('hex')});
    }
    await writeFile(join(output, 'report.json'), JSON.stringify({node: process.version, checks}, null, 2) + '\n', {flag: 'wx'});
    console.log(`BOUNDS_EVIDENCE ${output}`);
  } finally { await browser.close(); }
});
