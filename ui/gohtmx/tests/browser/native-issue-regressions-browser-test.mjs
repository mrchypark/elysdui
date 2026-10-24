import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {access, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

// Focused real-gallery regression for the native visual audit fixes. Set
// NATIVE_ISSUE_OUTPUT_DIR to put captures/receipts outside this checkout.
const repo = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const sourcePaths = [
  'ui/gohtmx/assets/ely-api-native.css',
  'ui/gohtmx/assets/ely-api-native-tooling.css',
  'ui/gohtmx/assets/ely-api-foundation.css',
  'ui/gohtmx/templates/ely-api-native.html',
  'internal/gallery/assets/native-misc-fixtures.json',
  'internal/gallery/advanced_native_fixtures.go',
  'internal/gallery/advanced_native_misc_fixture_test.go',
  'ui/gohtmx/tests/unit/native_misc_test.mjs',
  'ui/gohtmx/tests/unit/foundation_visual_test.mjs',
  'ui/gohtmx/tests/browser/native-issue-regressions-browser-test.mjs',
];
const historicalCSSPaths = ['ui/gohtmx/assets/ely-api-native.css','ui/gohtmx/assets/ely-api-native-tooling.css'];
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
class SourceDriftError extends Error {
  constructor(stage, changedPaths) {
    super(`native regression sources changed ${stage}: ${changedPaths.join(', ')}`);
    this.name = 'SourceDriftError';
    this.stage = stage;
    this.changedPaths = changedPaths;
  }
}
async function readSourceSnapshot() {
  const bytes = new Map(await Promise.all(sourcePaths.map(async path => [path, await readFile(resolve(repo, path))])));
  return {bytes,hashes:new Map([...bytes].map(([path,source])=>[path,sha256(source)]))};
}
function assertSourceSnapshotUnchanged(expected, actual, stage) {
  const changedPaths=sourcePaths.filter(path=>expected.hashes.get(path)!==actual.hashes.get(path));
  if(changedPaths.length)throw new SourceDriftError(stage,changedPaths);
}
function requireHistoricalCSS(ref, resolvedCommit, sources) {
  assert.match(resolvedCommit||'',/^[a-f\d]{40}$/i,`historical CSS ref ${ref} did not resolve to a commit`);
  for(const path of historicalCSSPaths)assert.ok(Buffer.isBuffer(sources.get(path))&&sources.get(path).length>0,`historical CSS ref ${ref} is missing ${path}`);
}
function loadHistoricalCSS(ref) {
  let commit;
  try{commit=execFileSync('git',['rev-parse','--verify','--end-of-options',`${ref}^{commit}`],{cwd:repo,encoding:'utf8',stdio:['ignore','pipe','ignore']}).trim();}
  catch(error){throw new Error(`historical CSS ref ${ref} did not resolve to a commit`,{cause:error});}
  const sources=new Map();
  for(const path of historicalCSSPaths){
    try{sources.set(path,execFileSync('git',['show',`${commit}:${path}`],{cwd:repo,stdio:['ignore','pipe','ignore']}));}
    catch(error){throw new Error(`historical CSS commit ${commit} is missing ${path}`,{cause:error});}
  }
  requireHistoricalCSS(ref,commit,sources);
  return {commit,sources};
}
const initialSnapshot = await readSourceSnapshot();
const liveSources = initialSnapshot.bytes;
const sourceDigest = sha256(Buffer.concat([...liveSources.values()]));
const runId = `${new Date().toISOString().replaceAll(':','').replaceAll('.','')}-${sourceDigest.slice(0,12)}`;
const output = resolve(process.env.NATIVE_ISSUE_OUTPUT_DIR || resolve(repo, 'test-results/native-issue-regressions', runId));
const includeHistoricalCSS = process.env.NATIVE_ISSUE_HISTORICAL_CSS === '1';
const historicalCSSRef = process.env.NATIVE_ISSUE_HISTORICAL_CSS_REF || '5cd6b91';
const historicalEvidenceRoot = process.env.NATIVE_ISSUE_HISTORICAL_EVIDENCE_DIR ? resolve(process.env.NATIVE_ISSUE_HISTORICAL_EVIDENCE_DIR) : null;
const historicalCSS = includeHistoricalCSS?loadHistoricalCSS(historicalCSSRef):null;
const resolvedHistoricalCSSCommit = historicalCSS?.commit||null;
const baselineSources = historicalCSS?.sources||new Map();
if(process.env.NATIVE_ISSUE_HARNESS_SELF_TEST==='1'){
  const stable=await readSourceSnapshot();
  assert.doesNotThrow(()=>assertSourceSnapshotUnchanged(initialSnapshot,stable,'self-test'));
  const drifted={hashes:new Map(stable.hashes)};
  drifted.hashes.set(sourcePaths[0],'deliberately-different-hash');
  assert.throws(()=>assertSourceSnapshotUnchanged(initialSnapshot,drifted,'self-test'),SourceDriftError);
  assert.throws(()=>requireHistoricalCSS('missing-ref',null,new Map()),/did not resolve to a commit/);
  const partialCSS=new Map([[historicalCSSPaths[0],Buffer.from('/* native css */')]]);
  assert.throws(()=>requireHistoricalCSS('resolved-ref','a'.repeat(40),partialCSS),/missing ui\/gohtmx\/assets\/ely-api-native-tooling\.css/);
  console.log('Native regression harness guards passed: clean sources accepted; drift, unavailable historical ref, and incomplete CSS rejected.');
  process.exit(0);
}
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim();
const cases = [
  {key:'generative/PromptDiff', selector:'.ely-native-prompt-history'},
  {key:'generative/PromptVersionHistory', selector:'.ely-native-prompt-history'},
  {key:'tooling/PlaygroundPanel', selector:'.ely-tooling-playground'},
  {key:'misc/BarcodeDisplay', selector:'[data-misc-source-note]'},
  {key:'misc/Rating Widget', selector:'[data-misc-source-note]'},
  {key:'misc/ShareSheet', selector:'[data-misc-source-note]'},
  {key:'media/ImageViewer', selector:'.ely-native-viewer'},
  {key:'theme/Syntax', selector:'.ely-native-syntax-sample'},
  {key:'misc/Signature', selector:'[data-misc-source-note]'},
  {key:'generative/ModelStatus', selector:'.ely-native-status-list'},
  {key:'shell/JumpList', selector:'[data-native-shell-note]'},
  {key:'layout/Panel', family:'foundation', selector:'.ely-foundation__panel-body'},
];
const cssCases = cases.filter(item => ['generative/PromptDiff','generative/PromptVersionHistory','tooling/PlaygroundPanel'].includes(item.key));
const noticeBaselines = [
  {case:'misc/BarcodeDisplay',path:'baseline/live-desktop-light/batch-0045/1093-misc-barcodedisplay-initial.png',sha256:'d42dad546d156570ee9fc214f38f16a0b1cfc8a5377f4f29aa9836d6c56d4762'},
  {case:'misc/Signature',path:'baseline/live-desktop-light/batch-0045/1094-misc-signature-initial.png',sha256:'51943b976d33a489384aa0fab9ee393c2ab9cb8099e4a2c23e28c25e51351082'},
  {case:'misc/ShareSheet',path:'baseline/live-desktop-light/batch-0046/1113-misc-sharesheet-initial.png',sha256:'f86bb4d7e1e711e245d4e5e96a47331cf05edeb1e6c07429b74937af3ded0c74'},
];
const profiles = [
  {name:'desktop-light', viewport:{width:1440,height:1000}, colorScheme:'light'},
  {name:'desktop-dark', viewport:{width:1440,height:1000}, colorScheme:'dark'},
  {name:'mobile-light', viewport:{width:390,height:844}, colorScheme:'light'},
  {name:'mobile-dark', viewport:{width:390,height:844}, colorScheme:'dark'},
];
const reports = [];
const errors = [];
const env={...process.env,GOTOOLCHAIN:process.env.GOTOOLCHAIN||'go1.26.9'};
const canRebindPort=async port=>{
  for(let attempt=0;attempt<20;attempt++){
    const probe=createServer();
    const result=await new Promise(resolve=>{probe.once('error',resolve);probe.listen(port,'127.0.0.1',()=>resolve(true));});
    if(result===true){await new Promise((resolve,reject)=>probe.close(error=>error?reject(error):resolve()));return true;}
    if(result.code!=='EADDRINUSE')throw result;
    await new Promise(resolve=>setTimeout(resolve,50));
  }
  return false;
};
let reservation, server, child, browser, temp, report, runError, cleanupError, portClosed=false;
let port;
try {
  await mkdir(dirname(output),{recursive:true});
  await mkdir(output);
  if(includeHistoricalCSS)await mkdir(resolve(output, 'historical-css-replay'), {recursive:true});
  await mkdir(resolve(output, 'after-current'), {recursive:true});
  if(historicalEvidenceRoot)for(const baseline of noticeBaselines){
    assert.equal(sha256(await readFile(resolve(historicalEvidenceRoot,baseline.path))),baseline.sha256,`immutable historical PNG changed: ${baseline.case}`);
  }
  reservation = createServer();
  await new Promise((accept,reject)=>{reservation.once('error',reject);reservation.listen(0,'127.0.0.1',accept);});
  port = reservation.address().port;
  await new Promise((accept,reject)=>reservation.close(error=>error?reject(error):accept()));
  temp=await mkdtemp(resolve(tmpdir(),'ely-native-issue-'));
  const binary=resolve(temp,'gallery');
  execFileSync('go',['build','-o',binary,'./examples/gohtmx/gallery'],{cwd:repo,env,stdio:'inherit'});
  child = spawn(binary, ['-addr',`127.0.0.1:${port}`], {cwd:repo,stdio:['ignore','pipe','pipe']});
  let serverOutput='';
  child.stdout.on('data',chunk=>serverOutput+=chunk);
  child.stderr.on('data',chunk=>serverOutput+=chunk);
  const origin=`http://127.0.0.1:${port}`;
  const deadline=Date.now()+120000;
  while(Date.now()<deadline){
    if(child.exitCode!==null)throw new Error(`Gallery exited before ready: ${serverOutput}`);
    try{if((await fetch(`${origin}/components/audit?family=native&aliases=1`)).ok)break;}catch{}
    await new Promise(r=>setTimeout(r,100));
  }
  assert(Date.now()<deadline,'gallery did not start');
  const afterBuildSnapshot=await readSourceSnapshot();
  assertSourceSnapshotUnchanged(initialSnapshot,afterBuildSnapshot,'during gallery build');
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  for(const profile of profiles){
    const phases=[...(includeHistoricalCSS?[{id:'historical-css-replay',items:cssCases}]:[]),{id:'after-current',items:cases}];
    for(const phase of phases){
      const context=await browser.newContext({viewport:profile.viewport,colorScheme:profile.colorScheme,reducedMotion:'reduce'});
      const page=await context.newPage();
      await context.addInitScript(mode=>{localStorage.setItem('ely-palette','ely');localStorage.setItem('ely-theme',mode);},profile.colorScheme);
      page.on('pageerror',error=>errors.push(`${profile.name}/${phase}: ${error.message}`));
      if(phase.id==='historical-css-replay'){
        await page.route('**/assets/ely-api-native*.css*',async route=>{
          const path=new URL(route.request().url()).pathname.split('/').at(-1);
          const sourcePath=`ui/gohtmx/assets/${path}`;
          const source=baselineSources.get(sourcePath);
          if(source){
            await route.fulfill({status:200,contentType:'text/css',body:source});
          }
          else await route.continue();
        });
      }
      await page.goto(`${origin}/components/audit?family=native&aliases=1`,{waitUntil:'networkidle'});
      await page.waitForTimeout(80);
      const themeVerification=await page.evaluate(mode=>{
        if(!window.ElyTheme)throw new Error('ElyTheme API did not load');
        window.ElyTheme.apply('ely',mode);
        const current=window.ElyTheme.current(),expected=window.ElyTheme.get('ely')[mode];
        const actual=Object.fromEntries(window.ElyTheme.tokens.map(token=>[token,getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim().toUpperCase()]));
        const computedScheme=getComputedStyle(document.documentElement).colorScheme;
        return {current,computedScheme,expected,actual};
      },profile.colorScheme);
      assert.deepEqual(themeVerification.current,{id:'ely',mode:profile.colorScheme},'project theme API must apply requested theme');
      assert.equal(themeVerification.computedScheme,profile.colorScheme,'computed document color scheme must match requested theme');
      for(const [token,value] of Object.entries(themeVerification.expected))assert.equal(themeVerification.actual[token],value.toUpperCase(),`computed Ely theme token ${token}`);
      for(const item of phase.items){
        if(item.family==='foundation')await page.goto(`${origin}/components/audit?family=foundation&aliases=1`,{waitUntil:'networkidle'});
        const captureTheme= item.family==='foundation'?await page.evaluate(()=>({current:window.ElyTheme.current(),computedScheme:getComputedStyle(document.documentElement).colorScheme,tokens:Object.fromEntries(window.ElyTheme.tokens.map(token=>[token,getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim().toUpperCase()]))})):themeVerification;
        assert.deepEqual(captureTheme.current,{id:'ely',mode:profile.colorScheme},`${item.family||'native'} theme mode for ${profile.name}`);
        assert.equal(captureTheme.computedScheme,profile.colorScheme,`${item.family||'native'} computed scheme for ${profile.name}`);
        const scopedCard=page.locator(`[data-audit-name="${item.key}"]`).first();
        assert.equal(await scopedCard.count(),1,`missing audit case ${item.key}`);
        const target=scopedCard.locator(`[data-audit-main] ${item.selector}`).first();
        assert.equal(await target.count(),1,`missing target ${item.key}`);
        const visible=await target.isVisible();
        const label=await target.innerText();
        const geometry=await target.evaluate(el=>{
          const rect=el.getBoundingClientRect();
          const card=el.closest('[data-audit-main]');
          const cardRect=card.getBoundingClientRect();
          const clips=[];
          for(let parent=el.parentElement;parent&&parent!==card.parentElement;parent=parent.parentElement){
            const style=getComputedStyle(parent),r=parent.getBoundingClientRect();
            if(/hidden|clip|auto|scroll/.test(`${style.overflowX} ${style.overflowY}`))clips.push({tag:parent.tagName,cls:parent.className,scrollWidth:parent.scrollWidth,clientWidth:parent.clientWidth,right:r.right});
            if(parent===card)break;
          }
          const diff=el.matches('.ely-native-prompt-history')?el.querySelector('[data-native-version-diff]'):null;
          const diffRect=diff?.getBoundingClientRect();
          const diffSegments=diff?[...diff.childNodes].map(node=>{const s=getComputedStyle(node.nodeType===1?node:diff),r=node.nodeType===1?node.getBoundingClientRect():null;return{node:node.nodeName,text:node.textContent,display:s.display,position:s.position,float:s.float,border:s.border,whiteSpace:s.whiteSpace,rect:r?{left:r.left,right:r.right,top:r.top,bottom:r.bottom}:null};}):[];
          const overflows=[];
          for(const child of el.querySelectorAll('*')){const r=child.getBoundingClientRect();if(r.width&&r.height&&(r.right>cardRect.right+1||r.left<cardRect.left-1))overflows.push({tag:child.tagName,cls:child.className,left:r.left,right:r.right});}
          const viewer=el.matches('.ely-native-viewer')?{overflowX:getComputedStyle(el).overflowX,overflowY:getComputedStyle(el).overflowY,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,controls:[...el.querySelectorAll('nav button')].map(button=>{const r=button.getBoundingClientRect();return{label:button.getAttribute('aria-label'),left:r.left,right:r.right,insideViewer:r.left>=rect.left-1&&r.right<=rect.right+1,insideCard:r.left>=cardRect.left-1&&r.right<=cardRect.right+1};})}:null;
          const syntax=el.matches('.ely-native-syntax-sample')?{overflowX:getComputedStyle(el).overflowX,whiteSpace:getComputedStyle(el).whiteSpace,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,scrollHeight:el.scrollHeight,clientHeight:el.clientHeight,tokenSpans:[...el.querySelectorAll('[data-native-syntax-color]')].map(span=>({text:span.textContent,display:getComputedStyle(span).display,border:getComputedStyle(span).border,borderWidth:getComputedStyle(span).borderWidth,padding:getComputedStyle(span).padding,background:getComputedStyle(span).backgroundColor,rect:(r=>({left:r.left,right:r.right,top:r.top,bottom:r.bottom}))(span.getBoundingClientRect()),fragments:[...span.getClientRects()].map(r=>({top:r.top,bottom:r.bottom,height:r.height}))}))}:null;
          const foundationSpans=el.matches('.ely-foundation__panel-body')?[...el.querySelectorAll('span')].map(span=>({text:span.textContent,border:getComputedStyle(span).border,padding:getComputedStyle(span).padding})):null;
          const status=el.matches('.ely-native-status-list')?{rows:[...el.querySelectorAll('li')].map(row=>{const label=row.querySelector('strong'),marker=row.querySelector('header>i'),lr=label.getBoundingClientRect(),mr=marker.getBoundingClientRect();return{label:label.textContent,labelLeft:lr.left,labelRight:lr.right,markerLeft:mr.left,markerRight:mr.right,markerBorder:getComputedStyle(marker).border,markerAnimation:getComputedStyle(marker).animationName};})}:null;
          const ancestors=[];for(let parent=el;parent&&parent!==document.body;parent=parent.parentElement){const s=getComputedStyle(parent),r=parent.getBoundingClientRect();ancestors.push({tag:parent.tagName,cls:typeof parent.className==='string'?parent.className:'',width:r.width,left:r.left,right:r.right,maxWidth:s.maxWidth,minWidth:s.minWidth,overflowX:s.overflowX,display:s.display});if(parent===card)break;}
          return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom,width:rect.width,height:rect.height,scrollWidth:el.scrollWidth,clientWidth:el.clientWidth,pageScrollWidth:document.documentElement.scrollWidth,viewportWidth:innerWidth,cardLeft:cardRect.left,cardRight:cardRect.right,cardWidth:cardRect.width,ancestors,diff:diffRect?{left:diffRect.left,right:diffRect.right,width:diffRect.width,scrollWidth:diff.scrollWidth,clientWidth:diff.clientWidth,scrollHeight:diff.scrollHeight,clientHeight:diff.clientHeight}:null,diffSegments,clippingAncestors:clips,childrenOutsideCard:overflows,viewer,syntax,status,foundationSpans};
        });
        const screenshotPath=resolve(output,phase.id,`${profile.name}-${item.key.replaceAll('/','-').replaceAll(' ','-')}.png`);
        await (visible?target:card).screenshot({path:screenshotPath,animations:'disabled',timeout:8000});
        reports.push({phase:phase.id,phaseProvenance:phase.id==='historical-css-replay'?'historical-native-CSS-with-current-HTML-and-fixtures; not a historical end-to-end before state':'current-worktree-HTML-fixtures-and-CSS',profile:profile.name,family:item.family||'native',case:item.key,visible,label,geometry,themeVerification:{current:captureTheme.current,computedScheme:captureTheme.computedScheme,tokens:captureTheme.actual||captureTheme.tokens},screenshotScope:visible?'target':'case-card',screenshot:screenshotPath,screenshotSHA256:sha256(await readFile(screenshotPath))});
      }
      await context.close();
    }
  }
  for(const profile of profiles){
    for(const key of ['generative/PromptDiff','generative/PromptVersionHistory','tooling/PlaygroundPanel']){
      const after=reports.find(r=>r.phase==='after-current'&&r.profile===profile.name&&r.case===key);
      assert(after.geometry.left>=after.geometry.cardLeft-1&&after.geometry.right<=after.geometry.cardRight+1,`${key} escapes its card after fix in ${profile.name}`);
      assert.equal(after.geometry.childrenOutsideCard.length,0,`${key} child escapes its card after fix in ${profile.name}`);
      if(key.startsWith('generative/')){
        assert(after.geometry.diff.right<=after.geometry.cardRight+1,`${key} diff escapes card after fix in ${profile.name}`);
        assert(after.geometry.diffSegments.filter(segment=>segment.node==='SPAN').every(segment=>segment.border.startsWith('0px')),`${key} unchanged diff runs must not inherit bordered-pill styling in ${profile.name}`);
      }
    }
    for(const key of ['misc/BarcodeDisplay','misc/Rating Widget','misc/ShareSheet']){
      const after=reports.find(r=>r.phase==='after-current'&&r.profile===profile.name&&r.case===key);
      assert.equal(after.visible,true,`${key} notice must be visible after fix in ${profile.name}`);
      const expected=key==='misc/BarcodeDisplay'?'BarcodeDisplay, Signature, and Rating Widget are source-only':key==='misc/Rating Widget'?'Rating Widget is source-only':'ShareSheet is source-only';
      assert(after.label.includes(expected),`${key} shows its own accurate source-only label in ${profile.name}: ${after.label}`);
    }
    const viewer=reports.find(r=>r.phase==='after-current'&&r.profile===profile.name&&r.case==='media/ImageViewer');
    assert(viewer.geometry.right<=viewer.geometry.cardRight+1,`ImageViewer root escapes its card after responsive sizing in ${profile.name}`);
    assert(viewer.geometry.viewer.controls.every(control=>control.insideCard),`ImageViewer controls escape their card after responsive sizing in ${profile.name}`);
    const syntax=reports.find(r=>r.phase==='after-current'&&r.profile===profile.name&&r.case==='theme/Syntax');
    assert.equal(syntax.geometry.syntax.tokenSpans.length,13,`Syntax sample token count in ${profile.name}`);
    for(const token of syntax.geometry.syntax.tokenSpans){assert.equal(token.borderWidth,'0px',`Syntax token must not inherit a chip border in ${profile.name}`);assert.equal(token.padding,'0px',`Syntax token must not inherit chip padding in ${profile.name}`);assert(token.fragments.every(fragment=>fragment.height<=21),`Syntax token line fragment must fit 20px rhythm in ${profile.name}: ${JSON.stringify(token.fragments)}`);}
    const foundation=reports.find(r=>r.phase==='after-current'&&r.profile===profile.name&&r.case==='layout/Panel');
    assert.equal(foundation.geometry.foundationSpans.length,2,`foundation Panel span chips rendered in ${profile.name}`);
    assert(foundation.geometry.foundationSpans.every(span=>span.border.startsWith('1px solid')&&span.padding!=='0px'),`foundation Panel chip styling preserved in ${profile.name}`);
  }
  assert.deepEqual(errors,[],'browser console/page errors');
  const finalSnapshot=await readSourceSnapshot();
  assertSourceSnapshotUnchanged(initialSnapshot,finalSnapshot,'during browser capture');
  report={schemaVersion:1,suite:'native-issue-regressions',runId,status:'passed',revision,workingTreeDirty:true,sourceStability:{verifiedAfterGalleryBuild:true,verifiedAtEnd:true,hashSource:'fresh end-of-run filesystem read',sha256:Object.fromEntries(finalSnapshot.hashes)},phaseSemantics:{'after-current':'default: current worktree HTML, fixtures, and CSS','historical-css-replay':'opt-in only: CSS from the resolved git commit with current HTML and fixtures; not a historical end-to-end before state'},legacyNoticeBaselineKind:'immutable-historical-PNG',legacyNoticeBaselines:noticeBaselines.map(baseline=>({...baseline,verifiedInThisRun:historicalEvidenceRoot!==null,availableAtHistoricalEvidenceRoot:Boolean(historicalEvidenceRoot)})),historicalCSSReplay:includeHistoricalCSS,historicalCSSRef:includeHistoricalCSS?historicalCSSRef:null,historicalCSSCommit:resolvedHistoricalCSSCommit,toolchain:{go:execFileSync('go',['version'],{cwd:repo,encoding:'utf8',env:{...process.env,GOTOOLCHAIN:process.env.GOTOOLCHAIN||'go1.26.9'}}).trim(),node:process.version,playwright:JSON.parse(await readFile(resolve(repo,'node_modules/playwright/package.json'),'utf8')).version,browser:browser.version},sourceHashes:Object.fromEntries(sourcePaths.map(path=>[path,{workingTree:finalSnapshot.hashes.get(path),baseline:baselineSources.has(path)?sha256(baselineSources.get(path)):null}])),profiles,cases:reports,errors};
  const preWriteSnapshot=await readSourceSnapshot();
  assertSourceSnapshotUnchanged(initialSnapshot,preWriteSnapshot,'before writing report');
}catch(error){
  runError=error;
}finally{
  try{if(browser)await browser.close();}catch(error){cleanupError??=error;}
  try{
    if(child&&child.exitCode===null&&child.signalCode===null){
      const exited=new Promise(resolve=>child.once('exit',resolve));
      child.kill('SIGTERM');
      let timer;
      await Promise.race([exited,new Promise(resolve=>timer=setTimeout(resolve,5000))]);
      clearTimeout(timer);
      if(child.exitCode===null&&child.signalCode===null){const killed=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGKILL');await killed;}
    }
    if(child&&(child.exitCode===null&&child.signalCode===null))throw new Error('owned gallery process did not exit');
  }catch(error){cleanupError??=error;}
  try{if(reservation?.listening)await new Promise((resolve,reject)=>reservation.close(error=>error?reject(error):resolve()));}catch(error){cleanupError??=error;}
  try{if(server?.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}catch(error){cleanupError??=error;}
  try{if(port)portClosed=await canRebindPort(port);}catch(error){cleanupError??=error;}
  try{if(temp)await rm(temp,{recursive:true,force:true});}catch(error){cleanupError??=error;}
}
const cleanup={galleryPID:child?.pid||null,galleryExited:!child||(child.exitCode!==null||child.signalCode!==null),serverPort:port??null,serverPortClosed:port?Boolean(portClosed):false,browserClosed:!browser||!browser.isConnected(),temporaryBuildDirectory:temp||null,temporaryBuildDirectoryRemoved:!temp||await access(temp).then(()=>false,error=>error.code==='ENOENT')};
await mkdir(dirname(output),{recursive:true});
await writeFile(resolve(output,'cleanup.json'),JSON.stringify({cleanup,error:cleanupError?String(cleanupError):null},null,2)+'\n',{flag:'wx'});
if(runError||cleanupError||!cleanup.galleryExited||!cleanup.serverPortClosed||!cleanup.browserClosed||!cleanup.temporaryBuildDirectoryRemoved){
  const error=runError||cleanupError||new Error('owned resource cleanup could not be verified');
  const failure={schemaVersion:1,suite:'native-issue-regressions',status:error instanceof SourceDriftError?'stale':'failed',revision,output,error:String(error),stack:error?.stack,cleanup,sourceDrift:error instanceof SourceDriftError?{stage:error.stage,changedPaths:error.changedPaths}:null,partialCaptures:reports,errors};
  await writeFile(resolve(output,'native-issue-regressions-failure.json'),JSON.stringify(failure,null,2)+'\n',{flag:'wx'});
  throw error;
}
report.cleanup=cleanup;
await writeFile(resolve(output,'native-issue-regressions.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(`Native issue browser regression passed: ${reports.length} captures; cleanup verified; report ${resolve(output,'native-issue-regressions.json')}`);
