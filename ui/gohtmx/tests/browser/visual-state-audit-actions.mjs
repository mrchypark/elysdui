import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {execFileSync, spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, mkdtemp, readFile, rm, stat, unlink, writeFile} from 'node:fs/promises';
import {extname, resolve, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {isDeepStrictEqual} from 'node:util';
import {chromium} from 'playwright';
import {actionModuleNames,prepareActionModule,synchronousTraceInit,registeredOutcomesEqual,registeredOutcomeDifferences,firstDifference,compareActionTrace,traceContractStatus} from './visual-state-audit-instrument.mjs';
import {caseActionContract, requestedStateContract, runRequestedStateActions, runRegisteredCanvasActions, ownedOverlayInventory, captureTargetPNG, screenshotWithoutCaretMutation, inventoryReceipt, inventoryDrift, unhandledBrowserErrors, visualCaptureGap, persistDirectCaseFailure} from './visual-state-audit-drivers.mjs';
import {basicFixturePackage,basicRootSelector} from './visual-state-audit-basic.mjs';
import {basicActionContract,validateBasicActionMatrix,runBasicActions,basicActionSurface,selectBasicActionCases,fulfillBasicActionAsset,assertBasicActionAssets,retainBasicFailureEvidence,basicOwnedModal,basicModalCaptureTarget} from './visual-state-audit-basic-actions.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const defaultEvidenceRoot = resolve(repo, 'ui/gohtmx/tests/browser/visual-state-audit-evidence');
const environmentEvidenceRoot = process.env.VISUAL_ACTION_AUDIT_EVIDENCE_ROOT || defaultEvidenceRoot;
const defaultOutput = process.env.VISUAL_ACTION_AUDIT_OUTPUT_DIR || resolve(repo, 'test-results', `visual-action-audit-${new Date().toISOString().replaceAll(':', '').replaceAll('.', '')}`);
const profiles = {
  'live-desktop-light': {viewport: {width: 1440, height: 1000}, colorScheme: 'light'},
  'live-desktop-dark': {viewport: {width: 1440, height: 1000}, colorScheme: 'dark'},
  'live-mobile-light': {viewport: {width: 390, height: 844}, colorScheme: 'light'},
  'live-mobile-dark': {viewport: {width: 390, height: 844}, colorScheme: 'dark'},
  'static-desktop-light': {viewport: {width: 1440, height: 1000}, colorScheme: 'light'},
  'static-desktop-dark': {viewport: {width: 1440, height: 1000}, colorScheme: 'dark'},
  'static-mobile-light': {viewport: {width: 390, height: 844}, colorScheme: 'light'},
  'static-mobile-dark': {viewport: {width: 390, height: 844}, colorScheme: 'dark'},
};
const familyModule = {foundation: 'foundation', interaction: 'interaction', data: 'data', workspace: 'workspace', communication: 'communication', native: 'native', forms: 'forms'};
const pilotNames = [
  'layout/Drawer', 'layout/Collapsible', 'layout/Accordion',
  'menus/RadioMenuItem', 'overlays/Dialog', 'navigation/Tabs',
  'data/Tag', 'data/Carousel', 'lists/Tree',
  'files/ArchiveViewer', 'project/TaskItem', 'editor/CodeEditor',
  'chat/CitationBadge', 'messaging/IncomingCallDialog', 'project/StatusSelect',
  'shell/ZoomControl', 'media/Playlist', 'media/VideoPlayer',
  'forms/PasswordInput', 'forms/Checkbox',
];

function parseArgs(argv) {
  const options = {fixture:'advanced',fixtureManifest:null,evidenceRoot: environmentEvidenceRoot, output: defaultOutput, matrixPath: null, coverageManifestPath: null, families: [], caseIds: [], pilot: 20, full: false, baseURL: null, profileId: 'live-desktop-light', surface: 'live-audit', maxCaptureBytes: 1024 ** 3};
  for (const arg of argv) {
    if (arg === '--full') options.full = true;
    else if(arg.startsWith('--fixture='))options.fixture=arg.slice('--fixture='.length);
    else if(arg.startsWith('--fixture-manifest='))options.fixtureManifest=resolve(arg.slice('--fixture-manifest='.length));
    else if(arg==='--states-only')options.statesOnly=true;
    else if(arg.startsWith('--trash-fixture='))options.trashFixture=arg.slice('--trash-fixture='.length);
    else if (arg.startsWith('--evidence-root=')) options.evidenceRoot = resolve(arg.slice('--evidence-root='.length));
    else if (arg.startsWith('--output-dir=')) options.output = resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--matrix=')) options.matrixPath = resolve(arg.slice('--matrix='.length));
    else if (arg.startsWith('--coverage-manifest=')) options.coverageManifestPath = resolve(arg.slice('--coverage-manifest='.length));
    else if (arg.startsWith('--max-capture-bytes=')) options.maxCaptureBytes = Number(arg.slice('--max-capture-bytes='.length));
    else if (arg.startsWith('--base-url=')) options.baseURL = arg.slice('--base-url='.length).replace(/\/$/, '');
    else if (arg.startsWith('--family=')) options.families.push(...arg.slice('--family='.length).split(',').filter(Boolean));
    else if (arg.startsWith('--case=')) options.caseIds.push(...arg.slice('--case='.length).split(',').filter(Boolean));
    else if (arg.startsWith('--pilot=')) options.pilot = Number(arg.slice('--pilot='.length));
    else if (arg.startsWith('--profile=')) options.profileId = arg.slice('--profile='.length);
    else if (arg.startsWith('--surface=')) options.surface = arg.slice('--surface='.length);
    else throw new Error(`Unknown option: ${arg}`);
  }
  assert(Number.isInteger(options.pilot) && options.pilot >= 1, '--pilot must be a positive integer');
  assert(Number.isSafeInteger(options.maxCaptureBytes) && options.maxCaptureBytes > 0, '--max-capture-bytes must be a positive safe integer');
  assert(!options.full || (!options.caseIds.length && !options.families.length), '--full cannot be combined with --case or --family');
  assert(!options.full||!options.statesOnly,'--states-only is a bounded proof mode, not --full');
  if(options.trashFixture){assert(['default','empty','longpath'].includes(options.trashFixture));assert(options.statesOnly&&options.fixture==='advanced'&&options.surface==='live-audit'&&options.profileId.startsWith('live-'),'Trash fixtures require explicit live requested-state proof');assert.deepEqual(options.caseIds,['documents/TrashBin']);}
  assert(profiles[options.profileId], `Unsupported profile: ${options.profileId}`);
  assert(['advanced','basic'].includes(options.fixture),'Unsupported fixture');
  assert((options.fixture==='basic'?['live-basic','static-basic']:['live-audit','static-audit']).includes(options.surface), `Unsupported surface: ${options.surface}`);
  if(options.fixture==='basic'){basicActionSurface(options.profileId,options.surface);assert(options.fixtureManifest,'Basic actions require --fixture-manifest=<action-manifest.json>');assert(!options.statesOnly,'Basic has its own finite action gate, not advanced --states-only');assert(!options.baseURL,'Basic actions require the owned compiled fixture/export, not --base-url');}
  assert(options.matrixPath, 'Pass --matrix=<acceptance-matrix.json> from the existing audit inventory; no matrix is bundled');
  options.coverageManifestPath ||= resolve(options.evidenceRoot, 'evidence/instrument-coverage.json');
  return options;
}

async function basicAudit({cases,origin,captures,matrixInput,coverageInput,sourceBefore,goEnv}){
  const reports=[],browserErrors=[];
  const expectedAssets=coverageInput.data.assetHashes;
  for(const [path,expectedSHA256]of Object.entries(expectedAssets)){
    if(['/assets/basic-audit.css','/assets/basic-audit-actions.js','/assets/basic-audit-actions.css'].includes(path))continue; // Compiled test-host constants are pinned by the immutable manifest/fixture source.
    assert.equal(sourceBefore.files.find(f=>f.path==='ui/gohtmx'+path)?.sha256,expectedSHA256,'Embedded asset must match frozen checkout: '+path);
  }
  for(const item of cases){
    const context=await browser.newContext({viewport:profile.viewport,colorScheme:profile.colorScheme}),page=await context.newPage();
    const contract=basicActionContract(item.componentIdentity),receipts=[];
    const result={caseId:item.caseId,componentIdentity:item.componentIdentity,fixtureIdentity:item.fixtureIdentity,fixturePropsSHA256:item.fixturePropsSHA256,contract,receipts,status:'running',assetsVerified:false};
    const assetTasks=[];
    const verifyAssets=async()=>{result.productionAssets=await Promise.all(assetTasks);assertBasicActionAssets(result.productionAssets,expectedAssets);result.assetsVerified=true;};
    const record=page.locator(`[data-audit-name=${JSON.stringify(item.componentIdentity)}]`),root=record.locator(basicRootSelector),twin=record.locator('[data-audit-twin]>[data-basic-component]');
    const peer=async()=>{
      assert.equal(await twin.count(),1,'Exact independent twin root required');
      assert.equal(await twin.getAttribute('data-basic-component'),item.componentIdentity);
      assert.equal(await twin.getAttribute('data-basic-props-sha256'),item.fixturePropsSHA256);
      return digest(await twin.evaluate(n=>({html:n.innerHTML,fields:[...n.querySelectorAll('input,select,textarea')].map(e=>({id:e.id,name:e.name,value:e.value,checked:e.checked,disabled:e.disabled})),canvases:[...n.querySelectorAll('canvas')].map(c=>c.toDataURL())})));
    };
    const state=async()=>({ownedOverlays:(await discoverOverlays(root)).filter(p=>p.owned)});
    reports.push(result);assert(contract,'Exact basic source contract required');
    page.on('pageerror',error=>browserErrors.push({caseId:item.caseId,type:'pageerror',text:String(error)}));
    page.on('response',response=>{if(response.status()>=400)browserErrors.push({caseId:item.caseId,type:'http-error',url:response.url(),status:response.status()});});
    page.on('requestfailed',request=>browserErrors.push({caseId:item.caseId,type:'requestfailed',url:request.url(),error:request.failure()?.errorText}));
    try{
      // Test boundary only: never call the user clipboard, even after a real click.
      await page.addInitScript(()=>{globalThis.__basicClipboardRequests=[];Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async value=>{globalThis.__basicClipboardRequests.push(String(value));}}});});
      await page.route('**/*',route=>{
        const url=new URL(route.request().url());
        if(url.origin!==origin){browserErrors.push({caseId:item.caseId,type:'external-dependency',url:url.href});return route.abort();}
        if(/^\/assets\/.*\.(?:js|css)$/.test(url.pathname)){
          const proof=fulfillBasicActionAsset(route,page,expectedAssets).catch(async error=>{await route.abort().catch(()=>{});return {path:url.pathname,error:String(error)};});
          assetTasks.push(proof);return proof;
        }
        return route.continue();
      });
      await page.goto(origin+'/basic-actions/',{waitUntil:'networkidle'});await sleepFrames(page);
      assert.equal(await root.count(),1);assert.equal(await twin.count(),1);
      assert.equal(await root.getAttribute('data-basic-component'),item.componentIdentity);assert.equal(await root.getAttribute('data-basic-props-sha256'),item.fixturePropsSHA256);
      await page.waitForFunction(()=>[...document.querySelectorAll('[data-ui-component="map-view"]')].every(n=>n.dataset.mapReady==='true'));
      await verifyAssets();
      const initialTwin=await peer();
      result.initialTwinSHA256=initialTwin;
      await root.evaluate(node=>{
        node.__basicEvents=[];node.__basicClicks=[];node.__basicLifecycle=[];
        for(const type of ['input','change','ui:select','ely:action','ely:change'])node.addEventListener(type,e=>node.__basicEvents.push({type,target:e.target.id||null,name:e.target.name||null,value:e.target.value??null,checked:e.target.checked??null,trusted:e.isTrusted,detail:e.detail===undefined?null:JSON.parse(JSON.stringify(e.detail)),...(e.target.tagName==='TEXTAREA'?{inputType:e.inputType??null,data:e.data??null}:{})}));
        node.addEventListener('click',e=>node.__basicClicks.push({trusted:e.isTrusted,target:e.target.id||null}));
        for(const type of ['toggle','close','cancel'])node.addEventListener(type,e=>node.__basicLifecycle.push({type,target:e.target.id||null,tag:e.target.tagName,trusted:e.isTrusted,oldState:e.oldState??null,newState:e.newState??null}),true);
      });
      const step=async(id,control,action,verify)=>{
        const expected=contract.steps[receipts.length];assert.equal(expected?.id,id,'Exact source sequence');
        const receipt={action:id,control,source:expected,beforeState:await snapshot(root)};receipts.push(receipt);
        receipt.beforeCaptureOwnership=await captureOwnedState({page,record,root,caseId:item.caseId,siteId:id,checkpointIndex:receipts.length,phase:'before',captures,state:await state()});
        await root.evaluate(n=>{n.__basicCursor=n.__basicEvents.length;n.__basicClickCursor=n.__basicClicks.length;n.__basicLifecycleCursor=n.__basicLifecycle.length;});
        let actionError;
        try{await action(receipt);await sleepFrames(page);receipt.events=await root.evaluate(n=>n.__basicEvents.slice(n.__basicCursor));receipt.assertedState=await verify();receipt.assertionsPassed=true;}
        catch(error){actionError=error;throw error;}
        finally{try{receipt.events=await root.evaluate(n=>n.__basicEvents.slice(n.__basicCursor));}catch(error){receipt.eventReadError=String(error);if(!actionError)throw error;}}
        receipt.lifecycleEvents=await root.evaluate(n=>n.__basicLifecycle.slice(n.__basicLifecycleCursor));
        receipt.nativeClicks=await root.evaluate(n=>n.__basicClicks.slice(n.__basicClickCursor));
        if(!['menu','map-view','coordinate-display'].includes(contract.template))assert(!receipt.events.some(e=>['ely:action','ely:change','ui:select'].includes(e.type)),'Basic native controls must not fabricate advanced public payloads');
        const scope=(await root.getAttribute('id')).replace(/-frame$/,'')+'_value';
        for(const e of receipt.events)if(e.name)assert(e.name.startsWith(scope),'Every named native event stays scoped to this actual main instance');
        assert.deepEqual(await peer(),initialTwin,'Basic action must preserve exact independent twin');
        receipt.afterState=await snapshot(root);
        receipt.afterCaptureOwnership=await captureOwnedState({page,record,root,caseId:item.caseId,siteId:id,checkpointIndex:receipts.length,phase:'after',captures,state:await state()});
        assert.deepEqual(await peer(),initialTwin,'Basic camera preparation must not mutate twin');
        receipt.captureStatus=receipt.beforeCaptureOwnership.ownedStateEvidence&&receipt.afterCaptureOwnership.ownedStateEvidence?'captured':'context-only';
        assert.equal(receipt.captureStatus,'captured','Every finite action requires owned before/after pixels');
        await verifyAssets();
      };
      if(contract.classification==='finite-actions')await runBasicActions(contract,root,step);
      else{
        assert.equal(contract.steps.length,0);
        if(contract.classification==='noninteractive-canonical-fixture')assert.equal(await root.locator('button,input,select,textarea,summary,a[href],[tabindex]').count(),0,'No-action classification must fail if actual controls appear');
        else{assert.equal(await root.locator('datalist').count(),1);assert.equal(await root.locator('input').count(),0,'Datalist resource classification requires no associated input');}
        result.initialEvidence=await captureOwnedState({page,record,root,caseId:item.caseId,siteId:'explicit-no-action-fixture',checkpointIndex:0,phase:'initial',captures,state:await state()});
        assert.equal(result.initialEvidence.ownedStateEvidence,true);
      }
      assert.equal(receipts.length,contract.steps.length);assert.deepEqual(await peer(),initialTwin);
      result.finalTwinSHA256=await peer();
      await verifyAssets();
      result.status=contract.classification==='finite-actions'?'passed-finite-actions':contract.classification;
    }catch(error){
      await retainBasicFailureEvidence(result,error,peer,async()=>{
        assert.equal(await record.count(),1);assert.equal(await root.count(),1,'Failed action root must still exist');
        assert.equal(await root.getAttribute('data-basic-component'),item.componentIdentity);
        assert.equal(await root.getAttribute('data-basic-props-sha256'),item.fixturePropsSHA256);
        const receipt=receipts.at(-1);
        return captureOwnedState({page,record,root,caseId:item.caseId,siteId:receipt?.action||'case-failure',checkpointIndex:receipts.length,phase:'failure-after',captures,state:await state()});
      });
    }
    finally{
      try{await context.close();}catch(error){result.status='failed';result.contextCloseError=String(error);result.error??=String(error);}
      result.productionAssets=await Promise.all(assetTasks);
      try{assertBasicActionAssets(result.productionAssets,expectedAssets);}catch(error){result.assetsVerified=false;result.status='failed';result.assetError=String(error);result.error??=String(error);}
    }
    if(result.status==='failed')break; // Stop the bounded batch on the first new failure.
  }
  const sourceAfter=await sourceReceipt(),inventoryChecks=await Promise.all([inventoryDrift(matrixInput),inventoryDrift(coverageInput)]);
  const sourceStableDuringRun=sourceBefore.treeSHA256===sourceAfter.treeSHA256&&sourceBefore.revision===sourceAfter.revision;
  const files=await(await import('node:fs/promises')).readdir(captures);
  const report={schemaVersion:1,evidenceKind:'basic-finite-native-action-receipts',fixture:'basic',sourceRevision:matrixInput.data.source.revision,sourceBefore,sourceAfter,sourceStableDuringRun,
    matrix:{path:matrixInput.path,sha256:matrixInput.sha256},fixtureManifest:{path:coverageInput.path,sha256:coverageInput.sha256},inventoryChecks,profile,surface:options.surface,
    runtime:{node:process.version,chromium:browser.version(),go:execFileSync('go',['version'],{cwd:repo,env:goEnv,encoding:'utf8'}).trim()},cases:reports,caseCount:reports.length,browserErrors,
    imageCount:files.filter(f=>f.endsWith('.png')).length,captureBytes,registeredCheckEquivalence:'not-applicable: no advanced registered checks are fabricated',
    requestedCaseIDs:cases.map(c=>c.caseId),completedCaseIDs:reports.map(c=>c.caseId),
    basicActionGate:{safe:sourceBefore.status===''&&sourceAfter.status===''&&sourceStableDuringRun&&inventoryChecks.every(c=>c.stable)&&isDeepStrictEqual(reports.map(c=>c.caseId),cases.map(c=>c.caseId))&&!browserErrors.length&&reports.every(c=>c.status!=='failed'&&c.assetsVerified),scope:'Exact selected finite fixture case set, successful actual browser-delivered JS/CSS proofs, separately labelled noninteractive/conditional fixtures and explicit boundary exclusions only'},
    fullRunGate:{safe:false,fullMatrixComplete:false,reason:'Finite basic fixture evidence never establishes all public control paths, native OS surfaces or all-prop coverage'}};
  await writeFile(resolve(options.output,'report.json'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
  await writeFile(resolve(options.output,'blockers.json'),JSON.stringify({failed:reports.filter(c=>c.status==='failed').map(c=>({caseId:c.caseId,error:c.error})),notRun:cases.slice(reports.length).map(c=>c.caseId),boundaries:reports.flatMap(c=>(c.contract.boundaries||[]).map(reason=>({caseId:c.caseId,reason}))),fullRunGate:report.fullRunGate},null,2)+'\n',{flag:'wx'});
  assert(report.basicActionGate.safe,'Basic finite action gate blocked; inspect immutable report');
}

const options = parseArgs(process.argv.slice(2));
const evidenceRoot = options.evidenceRoot;
const matrixPath = options.matrixPath;
const coverageManifestPath = options.coverageManifestPath;
const profile = {id: options.profileId, ...profiles[options.profileId], deviceScaleFactor: 1};
const sha256 = value => createHash('sha256').update(value).digest('hex');
const digest = value => sha256(JSON.stringify(value));
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 90);
let child, browser, runDir, staticServer, serverOutput = '', captureBytes = 0;

async function sourceReceipt() {
  const paths = [...new Set(execFileSync('git', ['ls-files', '-z', '--cached', '--others', '--exclude-standard'], {cwd: repo, encoding: 'utf8'}).split('\0').filter(Boolean))].sort();
  const files = [];
  for (const path of paths) {
    try { files.push({path, sha256: sha256(await readFile(resolve(repo, path)))}); }
    catch (error) { if (error.code === 'ENOENT') files.push({path, deleted: true}); else throw error; }
  }
  return {revision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(),
    status: execFileSync('git', ['status', '--porcelain=v1', '--untracked-files=all'], {cwd: repo, encoding: 'utf8'}),
    treeSHA256: digest(files), files};
}

async function listen(server) {
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  return server.address().port;
}

async function sleepFrames(page) {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
}

async function snapshot(locator) {
  return locator.evaluate(root => {
    const controls = [...root.querySelectorAll('button,input,select,textarea,summary,details,dialog,[role]')].slice(0, 180).map(node => ({
      tag: node.tagName, id: node.id || null, text: (node.innerText || node.value || '').trim().replace(/\s+/g, ' ').slice(0, 120),
      type: node.type || null, value: node.value ?? null, checked: node.checked ?? null, open: node.open ?? null,
      hidden: node.hidden ?? null, disabled: node.disabled ?? null,
      aria: [...node.attributes].filter(attribute => attribute.name.startsWith('aria-')).map(attribute => [attribute.name, attribute.value]),
    }));
    return {id: root.id || null, kind: root.dataset.elyKind || null, component: root.dataset.elyComponent || null,
      text: root.innerText.trim().replace(/\s+/g, ' ').slice(0, 1200), controls};
  });
}

async function discoverOverlays(root) {
  return root.evaluate(ownedOverlayInventory);
}

async function imageReceipt(path) {
  const bytes = await readFile(path);
  if (captureBytes + bytes.length > options.maxCaptureBytes) {
    await unlink(path);
    throw new Error(`Capture budget exceeded: ${options.maxCaptureBytes} bytes`);
  }
  captureBytes += bytes.length;
  return {path, bytes: bytes.length, sha256: sha256(bytes)};
}

async function captureComponent(page,root,path,checkedRootID) {
  const {bounds,foreignDOMIntersections,occludedForeignPaint}=await captureTargetPNG(page,root,path,{checkedRootID});
  const receipt=await imageReceipt(path);
  const focusOutlineGap=bounds.focusOutline?.status==='unsupported'?bounds.focusOutline.reason:null;
  return {scope:foreignDOMIntersections.length?'target-painted-union-with-foreign-context':'component-painted-union',countsAsOwnedEvidence:!foreignDOMIntersections.length&&!focusOutlineGap,focusOutlineGap,bounds,foreignDOMIntersections,occludedForeignPaint,...receipt};
}

async function captureOwnedState({page, record, root, caseId, siteId, checkpointIndex, phase, captures, state}) {
  const stem = `${slug(caseId)}-${String(checkpointIndex).padStart(3, '0')}-${slug(siteId)}`;
  const componentPath = resolve(captures, `${stem}-${phase}-component.png`);
  const modal=await root.evaluate(node=>node.matches('[data-audit-main]>[data-basic-component]'))?await root.evaluate(basicOwnedModal):null;
  let target=root,beforeFramingViewport=null;
  if(modal){
    assert.equal(state.ownedOverlays.filter(item=>item.tag==='DIALOG'&&item.id===modal.id&&item.checkedRootID===modal.checkedRootID&&item.ownershipScope==='component-root'&&item.owned).length,1,'Existing overlay inventory must independently own this modal');
    const path=resolve(captures,`${stem}-${phase}-before-framing-viewport.png`);
    await screenshotWithoutCaretMutation(page,{path,animations:'disabled'});
    beforeFramingViewport={scope:'viewport-context-before-framing',countsAsOwnedEvidence:false,bounds:{x:0,y:0,...page.viewportSize()},...await imageReceipt(path)};
    target=await basicModalCaptureTarget(root,modal);
  }
  const component = await captureComponent(page,target,componentPath,modal?.checkedRootID);
  const overlays = [];
  for (let index = 0; index < state.ownedOverlays.length; index++) {
    const item = state.ownedOverlays[index];
    if(modal&&item.id===modal.id){overlays.push({...component,scope:'visible-owned-panel',overlay:item});continue;}
    const locator = item.id ? page.locator(`[id="${item.id.replaceAll('"', '\\"')}"]`) : page.locator(item.locatorSelector).nth(item.locatorIndex);
    assert(item.locatorIndex < await page.locator(item.locatorSelector).count(), `Overlay locator index exists: ${item.locatorSelector}[${item.locatorIndex}]`);
    assert.equal(await locator.count(), 1, `Overlay resolves uniquely: ${item.id || item.tag}`);
    const overlayBounds = await locator.boundingBox();
    assert(overlayBounds && overlayBounds.width > 0 && overlayBounds.height > 0, `Owned overlay has visible bounds: ${item.id || item.tag}`);
    const path = resolve(captures, `${stem}-${phase}-overlay-${String(index + 1).padStart(2, '0')}.png`);
    overlays.push({...await captureComponent(page,locator,path,item.checkedRootID),scope:'visible-owned-panel',overlay:item});
  }
  let viewport = null;
  if (overlays.length || component.focusOutlineGap || overlays.some(item=>item.focusOutlineGap) || component.bounds.extendsRoot || component.bounds.viewportTruncated || component.bounds.clippedCount) {
    const path = resolve(captures, `${stem}-${phase}-viewport.png`);
    await screenshotWithoutCaretMutation(page,{path, animations: 'disabled'});
    const size = page.viewportSize();
    viewport = {scope: 'viewport-context', countsAsOwnedEvidence:false, bounds: {x: 0, y: 0, width: size.width, height: size.height}, ...(await imageReceipt(path))};
  }
  return {component,primaryTarget:modal?{scope:'exact-owned-native-modal',...modal}:null,beforeFramingViewport,ownedOverlays: overlays, viewport,ownedStateEvidence:!component.focusOutlineGap&&(overlays.length?overlays.every(item=>item.countsAsOwnedEvidence):component.countsAsOwnedEvidence)};
}

async function executeCheck(page, item, onCheckpoint) {
  const record = page.locator(`[data-audit-name=${JSON.stringify(item.componentIdentity)}]`);
  assert.equal(await record.count(), 1, `fixture exists: ${item.componentIdentity}`);
  const root = record.locator('[data-audit-main] > [data-ely-family]');
  const twin = record.locator('[data-audit-twin] > [data-ely-family]');
  await page.waitForFunction(element => element.dataset.elyReady === 'true', await root.elementHandle());
  await page.waitForFunction(element => element.dataset.elyReady === 'true', await twin.elementHandle());
  await record.scrollIntoViewIfNeeded();
  const initial = await snapshot(root);
  const result = await page.evaluate(async ({name, checkpointed}) => {
    const record = document.querySelector(`[data-audit-name="${CSS.escape(name)}"]`);
      const checkRoot = record.querySelector('[data-audit-main] > [data-ely-family]');
      const otherRoot = record.querySelector('[data-audit-twin] > [data-ely-family]');
    const hostEvents = [], actions = [];
    const normalize = value => JSON.parse(JSON.stringify(value, (_key, item) => {
      if (item instanceof FormData) return {entries: [...item.entries()].map(([name, entry]) => [name, entry instanceof File ? {name: entry.name, size: entry.size, type: entry.type} : entry])};
      return item instanceof File ? {name: item.name, size: item.size, type: item.type} : item;
    }));
    const listener = event => { hostEvents.push(normalize(event.detail)); actions.push(event.detail); };
    checkRoot.addEventListener('ely:action', listener);
    try {
      const api = globalThis.elyGalleryAudit;
      const checkResult = await api.executeRegisteredCheck(record.dataset.auditKey, {root: checkRoot, twin: otherRoot, actions, assert: api.assert, waitFor: api.waitFor, expectError: () => {}});
      // Native selectionchange is queued after contenteditable mutations. Both
      // drivers must observe settled caret state, including its visible output.
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      return {checkResult, actions: normalize(actions), hostEvents, finalState: await globalThis.__visualSemanticSnapshot(checkRoot)};
    } finally { checkRoot.removeEventListener('ely:action', listener); }
  }, {name: item.componentIdentity, checkpointed: Boolean(onCheckpoint)});
  const finalTwin = await snapshot(twin);
  return {record, root, twin, initial, finalTwin, result};
}

// Execute exact guarded contracts on unmodified modules; never make a
// return-valued helper or a DOM handler async to obtain screenshots.
async function directCaseDriver({item, familyURL, captures, reference, semanticSnapshotInit, contract, browserErrors,failureReceiptPath}) {
  const context = await browser.newContext({viewport: profile.viewport, colorScheme: profile.colorScheme});
  const page = await context.newPage(), receipts = [];
  const failureDiagnostics={threewayCleanupFailures:[]};
  let root,failureProbe=async()=>({});
  page.on('pageerror',error=>browserErrors.push({family:item.family,driver:'direct-playwright',caseId:item.caseId,type:'pageerror',text:String(error)}));
  try {
    await page.addInitScript(semanticSnapshotInit);
    const trashAssets=[];
    if(contract.trashFixture)await page.route('**/assets/**',async route=>{
      const url=new URL(route.request().url());assert.equal(url.origin,new URL(familyURL).origin);
      if(!/\.(?:css|js)$/.test(url.pathname))return route.continue();
      const relative=url.pathname.slice('/assets/'.length);assert(!relative.split('/').includes('..'));
      let bytes;
      try{bytes=await readFile(resolve(repo,'ui/gohtmx/assets',relative));}
      catch(error){if(error.code!=='ENOENT')throw error;bytes=await readFile(resolve(repo,'internal/gallery/assets',relative));}
      const expected={[url.pathname]:sha256(bytes)};
      const proof=fulfillBasicActionAsset(route,page,expected).catch(async error=>{await route.abort().catch(()=>{});return {path:url.pathname,error:String(error)};});trashAssets.push(proof);return proof;
    });
    const response=await page.goto(familyURL, {waitUntil: 'networkidle'});
    let fixtureProof=null;
    if(contract.trashFixture){
      assert.equal(response.status(),200);const headers=await response.allHeaders();
      assert.equal(headers['x-ely-audit-fixture'],`documents/TrashBin@${contract.trashFixture}`);
      assert.match(headers['x-ely-audit-props-sha256']||'',/^[a-f0-9]{64}$/);
      fixtureProof={identity:headers['x-ely-audit-fixture'],propsSHA256:headers['x-ely-audit-props-sha256'],url:response.url()};
      fixtureProof.assets=await Promise.all(trashAssets);
      for(const asset of fixtureProof.assets)assert(!asset.error,asset.error);
      for(const path of ['/assets/app.css','/assets/ely-api.js','/assets/ely-api-workspace.js','/assets/ely-api-workspace.css'])assert(fixtureProof.assets.some(asset=>asset.path===path),'Required actual Trash runtime asset missing: '+path);
    }
    const record = page.locator(`[data-audit-name=${JSON.stringify(item.componentIdentity)}]`);
    root = record.locator('[data-audit-main] > [data-ely-family]');
    const twin = record.locator('[data-audit-twin] > [data-ely-family]');
    await page.waitForFunction(node => node.dataset.elyReady === 'true', await root.elementHandle());
    const initialTwin=await snapshot(twin);
    assert.deepEqual(contract.mappingGaps, [], 'Exact source action contract must resolve');
    assert.equal(await root.getAttribute('data-ely-component'), contract.identity, 'Exact selected component');
    assert.equal(await root.getAttribute('data-ely-kind'), contract.kind, 'Exact selected kind');
    if(contract.fixtureGuards.devtoolsSourceAbsent)assert.equal(await root.locator('[data-ws-devtools-source]').count(),0);
    if(contract.fixtureGuards.canvasSceneAbsent)assert.equal(await root.locator('[data-ws-canvas-scene]').count(),0);
    if(contract.fixtureGuards.requiredEditor)assert.equal(await root.locator('form[data-ws-edit-form]').getAttribute('data-ws-required'),'true');
    if(contract.fixtureGuards.passwordInputName)assert.equal(await root.locator('input:not([type=hidden])').getAttribute('name'),contract.fixtureGuards.passwordInputName,'Exact PasswordInput fixture name is required before dispatch');
    if(reference)assert.deepEqual(await snapshot(root),reference.initial,'Direct driver begins from the same semantic state');
    await root.evaluate(node => {
      globalThis.__visualDirectActions = [];
      globalThis.__visualDirectDOMEvents = [];
      node.addEventListener('ely:action', event => globalThis.__visualDirectActions.push(event.detail));
      for(const name of ['input','change'])node.addEventListener(name,event=>globalThis.__visualDirectDOMEvents.push({type:event.type,target:event.target.name||event.target.dataset.name||event.target.tagName}));
    });
    const state = async () => {
      const overlays = await discoverOverlays(root, record);
      return {semantic: await snapshot(root), ownedOverlays: overlays.filter(item => item.owned)};
    };
    const observe=()=>root.evaluate(node=>{
      const editor=node.querySelector('[data-workspace-rich]'),password=node.querySelector('input:not([type=hidden])'),folder=node.querySelector('[data-ws-archive-node="Atrium/Design"]');
      const actions=JSON.parse(JSON.stringify(globalThis.__visualDirectActions,(_key,value)=>value instanceof FormData?{entries:[...value.entries()]}:value));
      return {actions,domEvents:globalThis.__visualDirectDOMEvents,fold:node.querySelector('[data-ws-code-line="2"] [data-ws-fold]')?.getAttribute('aria-expanded'),
        folder:folder?{expanded:folder.getAttribute('aria-expanded'),childrenHidden:folder.nextElementSibling.hidden}:null,
        password:password?{value:password.value,type:password.type,valid:password.checkValidity()}:null,
        editor:editor?{name:editor.dataset.name,value:node.querySelector('input[data-ws-content-value]')?.value,invalid:editor.getAttribute('aria-invalid'),error:node.querySelector('[data-ws-edit-error]')?.textContent,cursor:node.querySelector('[data-workspace-cursor]')?.textContent}:null};
    });
    failureProbe=async()=>({currentState:await observe(),nativePayload:await root.evaluate(node=>node.__presenceNativeEvents??null)});
    const step = async (label, action, verify) => {
      const index = receipts.length + 1, siteId = `direct-playwright:${label}`;
      const expected=contract.steps[index-1];assert.equal(expected?.id,label,'Driver order must equal the exact contract');
      assert.equal(typeof verify,'function','Each action requires an observable state assertion');
      const receipt = {siteId, fixture:fixtureProof, executionMode: 'direct-playwright', action: label, sourceSiteId:expected.source.siteId, sourceAnchor:expected.source.sourceAnchor,
        control:expected.control,event:expected.event,expectedState:expected.expectedState,beforeState:await observe()};
      receipts.push(receipt);
      for (const phase of ['before', 'after']) {
        if (phase === 'after') receipt.actionActivation=await action();
        await sleepFrames(page);
        receipt[`${phase}CaptureOwnership`] = await captureOwnedState({page, record, root, caseId: `${item.caseId}-direct`, siteId, checkpointIndex: index, phase, captures, state: await state()});
      }
      receipt.afterState=await observe();
      for(const event of receipt.afterState.actions.slice(receipt.beforeState.actions.length)){
        assert.equal(event.component,contract.identity,'Public action retains the actual alias identity');
        assert.equal(event.id,await root.getAttribute('id'),'Public action retains the actual instance ID');
      }
      receipt.assertedTarget=await verify(receipt.afterState,receipt.beforeState);
      receipt.assertionsPassed=true;
      receipt.visualEvidenceGap=visualCaptureGap(receipt.beforeCaptureOwnership,receipt.afterCaptureOwnership);
      receipt.captureStatus = receipt.visualEvidenceGap?'captured-context-only':'captured';
    };
    if(contract.requestedStateOnly){
      await runRequestedStateActions(contract,root,step,failureDiagnostics);
    }else if(contract.registeredCanvas){
      await runRegisteredCanvasActions(contract,root,step);
    }else if(contract.identity==='files/ArchiveViewer'){
      assert.equal(await root.locator('[data-ws-archive-summary]').textContent(),'6 files · 3.2 MB · 5% smaller');
      const folder=root.locator('[data-ws-archive-node="Atrium/Design"]');
      assert.equal(await folder.getAttribute('aria-expanded'),'false');
      await step('expand-folder',()=>folder.click(),state=>{assert.equal(state.folder.expanded,'true');assert.equal(state.folder.childrenHidden,false);});
      await step('open-entry',()=>root.locator('[data-ws-archive-node="Atrium/Design/Palette.json"]').dispatchEvent('keydown',{key:'Enter',bubbles:true}),state=>{assert.equal(state.actions.at(-1)?.action,'open-archive-entry');assert.equal(state.actions.at(-1)?.path,'Atrium/Design/Palette.json');});
    }else if(contract.identity==='forms/PasswordInput'){
      const input=root.locator('input:not([type=hidden])'),toggle=root.locator('[data-ui-action="password-toggle"]');
      assert.equal(await input.getAttribute('type'),'password');assert.equal(await input.isDisabled(),false);
      await step('password-input',()=>input.fill('Changed caller value'),state=>{assert.equal(state.password.value,'Changed caller value');assert.equal(state.password.type,'password');assert.equal(state.password.valid,true);assert.equal(state.domEvents.at(-1)?.type,'input');});
      await step('password-change',()=>input.dispatchEvent('change'),state=>{assert.equal(state.password.value,'Changed caller value');assert.equal(state.domEvents.at(-1)?.type,'change');});
      await step('password-toggle',()=>toggle.click(),state=>{assert.equal(state.password.type,'text');assert.equal(state.password.value,'Changed caller value');});
    }else{
    const fold = root.locator('[data-ws-code-line="2"] [data-ws-fold]');
    await step('fold', () => fold.click(),state=>{assert.equal(state.fold,'true');assert.equal(state.actions.at(-1)?.action,'toggle-code-fold');assert.equal(state.actions.at(-1)?.line,'2');});
    for (const [label, selector] of [['code-lens', '[data-ws-code-lens="references"]'], ['minimap', '[data-ws-editor-tool="toggle-minimap"]'], ['breadcrumb', '[data-ws-editor-breadcrumb="src/worker.go"]']]) {
      const [action,field,value]={ 'code-lens':['run-code-lens','lens','references'],minimap:['editor-tool','tool','toggle-minimap'],breadcrumb:['open-code-location','location','src/worker.go']}[label];
      await step(label, () => root.locator(selector).click(),state=>{assert.equal(state.actions.at(-1)?.action,action);assert.equal(state.actions.at(-1)?.[field],value);});
    }
    const editor = root.locator('[data-workspace-rich]'), form = root.locator('form[data-ws-edit-form]');
    const submit = form.locator('button[type="submit"]');
    await step('multiline-input', async () => {
      await editor.evaluate(node => {
        const line = document.createElement('div'), gutter = document.createElement('span'), source = document.createElement('code');
        gutter.contentEditable = 'false'; gutter.textContent = '1'; source.textContent = 'first line'; line.append(gutter, source);
        const added = document.createElement('div'); added.textContent = 'new browser line'; node.replaceChildren(line, added);
      });
      await editor.dispatchEvent('input');
    },state=>assert.equal(state.editor.value,'first line\nnew browser line'));
    const submitted=expected=>(state,before)=>{assert.equal(state.actions.length,before.actions.length+1);assert.equal(state.actions.at(-1)?.formData?.entries.find(([name])=>name===state.editor.name)?.[1],expected);};
    await step('submit-multiline', () => submit.click(),submitted('first line\nnew browser line'));
    await editor.evaluate(node => { const line = node.firstElementChild; line.querySelector('code').textContent = ''; node.replaceChildren(line); });
    await step('reject-line-number-only', () => submit.click(),(state,before)=>{assert.equal(state.editor.invalid,'true');assert.equal(state.actions.length,before.actions.length);});
    await step('changed-input', async () => { await editor.evaluate(node => { node.textContent = 'changed caller code'; }); await editor.dispatchEvent('input'); },state=>assert.equal(state.editor.value,'changed caller code'));
    await step('submit-changed', () => submit.click(),submitted('changed caller code'));
    await step('empty-input', async () => { await editor.evaluate(node => { node.textContent = ''; }); await editor.dispatchEvent('input'); },state=>assert.equal(state.editor.value,''));
    await step('reject-empty', () => submit.click(),(state,before)=>{assert.equal(state.editor.invalid,'true');assert.equal(state.editor.error,'Enter content before submitting.');assert.equal(state.actions.length,before.actions.length);assert.match(state.editor.cursor,/Ln \d+, Col \d+/);});
    }
    assert.equal(receipts.length,contract.steps.length,'Every exact action needs a paired receipt');
    const actions = await page.evaluate(() => JSON.parse(JSON.stringify(globalThis.__visualDirectActions, (_key, value) => {
      if (value instanceof FormData) return {entries: [...value.entries()].map(([name, entry]) => [name, entry instanceof File ? {name: entry.name, size: entry.size, type: entry.type} : entry])};
      return value instanceof File ? {name: value.name, size: value.size, type: value.type} : value;
    })));
    const finalState = await root.evaluate(globalThisRoot => {
      // Use the same semantic collector as the registered-check comparison.
      return globalThis.__visualSemanticSnapshot(globalThisRoot);
    });
    const finalTwin = await snapshot(twin);
    assert.deepEqual(finalTwin,initialTwin,'Direct actions must not change the audit twin');
    const differences = reference&&!contract.requestedStateOnly?[['actions', reference.result.actions, actions], ['hostEvents', reference.result.hostEvents, actions],
      ['finalState', reference.result.finalState, finalState], ['twinState', reference.finalTwin, finalTwin]]
      .map(([field, left, right]) => { const difference = firstDifference(left, right); return difference ? {field, ...difference} : null; }).filter(Boolean):[];
    return {driver: 'Playwright native clicks and dispatched input events after the registered check DOM mutations; unmodified production and registered-check modules',
      status: differences.length ? 'mismatch' : 'passed', differences, receipts, ...(fixtureProof?{fixture:fixtureProof}:{}), actionsSHA256: digest(actions), finalStateSHA256: digest(finalState),
      visualActionabilityGaps:receipts.filter(receipt=>receipt.actionActivation?.pointerActionabilityGap||receipt.visualEvidenceGap).map(receipt=>({action:receipt.action,control:receipt.control,reason:receipt.actionActivation?.pointerActionabilityGap||receipt.visualEvidenceGap})),
      comparisonScope:contract.requestedStateOnly?'Explicit target state assertions; registered ending state is different and not compared':'Exact registered-check actions, host events, final semantic state and unchanged twin',
      limitation: 'Independent action sequence; does not replace or inflate registered-check assertion counts or prove unreached variant branches.'};
  } catch (error) {
    let currentState=null,nativePayload=null,diagnosticError=null;
    try{({currentState,nativePayload}=await failureProbe());}catch(probeError){diagnosticError={name:probeError?.name??'Error',message:probeError?.message??String(probeError),stack:probeError?.stack??null};}
    let failureReceipt=null,failureReceiptWriteError=null;
    try{failureReceipt=await persistDirectCaseFailure({caseId:item.caseId,error,receipts,currentState,nativePayload,diagnosticError},receipt=>writeFile(failureReceiptPath,JSON.stringify(receipt,null,2)+'\n',{flag:'wx'}));}
    catch(writeError){failureReceiptWriteError={name:writeError?.name??'Error',message:writeError?.message??String(writeError),stack:writeError?.stack??null};}
    return {status: 'failed', error: String(error), errorStack:error?.stack??null, receipts,failureReceiptPath,failureReceiptWriteError,...(failureReceipt?{failureReceipt}:{}),...(failureDiagnostics.threewayCleanupFailures.length?{threewayCleanupFailures:failureDiagnostics.threewayCleanupFailures}:{})};
  }
  finally { await context.close(); }
}

try {
  const basic=options.fixture==='basic';
  const matrixInput=await inventoryReceipt(matrixPath),coverageInput=await inventoryReceipt(basic?options.fixtureManifest:coverageManifestPath);
  const matrix = matrixInput.data;
  const coverageManifest = coverageInput.data;
  const expectedRevision = matrix.source.revision;
  assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(), expectedRevision, 'checkout revision');
  const sourceBefore = await sourceReceipt();
  if(options.full||basic)assert.equal(sourceBefore.status,'','Action audit requires the parent clean commit after the bounded source freeze');
  if(basic)validateBasicActionMatrix(matrix,coverageManifest,expectedRevision);
  let cases = basic?selectBasicActionCases(matrix,options):matrix.auditCases.filter(item => item.profileIds.includes(profile.id) && item.surface.includes(options.surface));
  if(!basic){
  if (options.families.length) cases = cases.filter(item => options.families.includes(item.family));
  if (options.caseIds.length) cases = cases.filter(item => options.caseIds.includes(item.caseId) || options.caseIds.includes(item.componentIdentity));
  if(options.statesOnly&&!basic)cases=cases.filter(item=>requestedStateContract(item.componentIdentity,options.trashFixture));
  if (!basic&&!options.statesOnly && !options.full && !options.families.length && !options.caseIds.length) {
    cases = pilotNames.map(name => matrix.auditCases.find(item => item.componentIdentity === name && item.aliasMapping.relation !== 'alias-shared-check')).filter(Boolean);
  } else if (!options.full && options.pilot) cases = cases.slice(0, options.pilot);
  }
  assert(cases.length > 0, 'No cases selected');
  assert(new Set(cases.map(item => item.componentIdentity)).size === cases.length, 'pilot cases must use unique component names');
  assert(cases.every(item => basic?item.family==='basic':familyModule[item.family]), 'case uses an unsupported family');

  const preparedByFamily=new Map();
  if(!basic){
  assert.equal(coverageManifest.source?.revision,expectedRevision,'coverage manifest revision');
  for(const [name,path]of [['instrumenter','ui/gohtmx/tests/browser/visual-state-audit-instrument.mjs'],['drivers','ui/gohtmx/tests/browser/visual-state-audit-drivers.mjs'],['actions','ui/gohtmx/tests/browser/visual-state-audit-actions.mjs']])assert.equal(coverageManifest.source?.[`${name}SHA256`],sha256(await readFile(resolve(repo,path))),`coverage ${name} input hash`);
  for(const family of new Set(cases.map(item=>item.family))){
    const modules=[];
    for(const name of actionModuleNames(family))modules.push(prepareActionModule(name,await readFile(resolve(repo,`internal/gallery/assets/advanced-${name}-checks.js`),'utf8'),coverageManifest,options.surface));
    preparedByFamily.set(family,modules);
  }
  }

  await mkdir(options.output, {recursive: false});
  const captures = resolve(options.output, 'captures');
  await mkdir(captures);
  runDir = await mkdtemp(resolve(options.output, '.run-'));
  await writeFile(resolve(options.output, 'resources.json'), JSON.stringify({runnerPID: process.pid, runDir, state: 'running'}) + '\n', {flag: 'wx'});
  const goEnv = {...process.env, GOTOOLCHAIN: process.env.GOTOOLCHAIN || 'go1.26.9'};
  let origin = options.baseURL;
  const staticBasePath = '/visual-action-audit/';
  if (options.surface.startsWith('static-') && !origin) {
    const binary = resolve(runDir, 'gallery-static');
    const staticRoot = resolve(runDir, 'static');
    execFileSync('go', ['build', '-o', binary, basic?basicFixturePackage:'./cmd/ely-gallery-static'], {cwd: repo, env: goEnv, stdio: 'inherit'});
    execFileSync(binary, basic?['-dir',staticRoot]:['-dir', staticRoot, '-base', staticBasePath], {cwd: repo, env: goEnv, stdio: 'inherit'});
    const mime = {'.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.wasm': 'application/wasm'};
    staticServer = createServer(async (request, response) => {
      try {
        let pathname = decodeURIComponent(new URL(request.url, 'http://local').pathname);
        if (pathname === '/favicon.ico') { response.writeHead(204).end(); return; }
        if (!basic&&!pathname.startsWith(staticBasePath)) { response.writeHead(404).end(); return; }
        pathname = basic?pathname.slice(1):pathname.slice(staticBasePath.length);
        if (!pathname || pathname.endsWith('/')) pathname += 'index.html';
        const file = resolve(staticRoot, pathname);
        if (!file.startsWith(staticRoot + sep)) { response.writeHead(403).end(); return; }
        const data = await readFile(file);
        response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
        response.setHeader('Cache-Control', 'no-store');
        response.end(data);
      } catch { response.writeHead(404).end(); }
    });
    origin = `http://127.0.0.1:${await listen(staticServer)}`;
  } else if (!origin) {
    const binary = resolve(runDir, 'gallery');
    execFileSync('go', ['build', '-o', binary, basic?basicFixturePackage:'./examples/gohtmx/gallery'], {cwd: repo, env: goEnv, stdio: 'inherit'});
    const reservation = createServer();
    await new Promise((accept, reject) => { reservation.once('error', reject); reservation.listen(0, '127.0.0.1', accept); });
    const port = reservation.address().port;
    await new Promise((accept, reject) => reservation.close(error => error ? reject(error) : accept()));
    child = spawn(binary, ['-addr', `127.0.0.1:${port}`], {cwd: repo, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']});
    await writeFile(resolve(options.output, 'resources.json'), JSON.stringify({runnerPID: process.pid, galleryPID: child.pid, galleryBinary: binary, runDir, state: 'running'}) + '\n');
    child.stdout.on('data', chunk => serverOutput += chunk);
    child.stderr.on('data', chunk => serverOutput += chunk);
    origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 200; i++) {
      if (child.exitCode !== null) throw new Error(`Gallery exited: ${serverOutput}`);
      try { if ((await fetch(`${origin}${basic?'/action-manifest.json':'/components'}`)).ok) { ready = true; break; } } catch {}
      await delay(50);
    }
    assert(ready, `Gallery startup timed out: ${serverOutput}`);
  }
  assert(/^https?:\/\//.test(origin), 'base URL must be an absolute http(s) URL');
  browser = await chromium.launch({executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});

  if(basic){
    const response=await fetch(origin+'/action-manifest.json');assert(response.ok);assert.deepEqual(await response.json(),coverageManifest,'Served fixture manifest equals pinned compiled props');
    await basicAudit({cases,origin,captures,matrixInput,coverageInput,sourceBefore,goEnv});
  }else{
  const byFamily = new Map();
  for (const item of cases) { if (!byFamily.has(item.family)) byFamily.set(item.family, []); byFamily.get(item.family).push(item); }
  const reports = [], transformReports = {}, browserErrors = [];
  for (const [family, familyCases] of byFamily) {
    const preparedModules=preparedByFamily.get(family),primary=preparedModules[0];
    const {filename}=primary;
    const transformed={...primary.transformed,interactionSites:preparedModules.flatMap(module=>module.transformed.interactionSites),unsupported:preparedModules.flatMap(module=>module.transformed.unsupported)};
    for(const module of preparedModules)transformReports[module.filename]={localSourceSHA:sha256(module.localSource),originalSHA:module.transformed.originalSHA,transformedSHA:module.transformed.transformedSHA,
      manifestCounts:coverageManifest.modules[module.name].counts,manifestSourceSHA256:coverageManifest.modules[module.name].sourceSHA256,
      safeSiteCount:module.transformed.interactionSites.length,unsupportedCount:module.transformed.unsupported.length,
      safeSites:module.transformed.interactionSites.map(site=>({siteId:site.siteId,checkIdentity:site.checkIdentity,mappedChecks:site.mappedChecks,line:site.line,column:site.column,control:site.control,event:site.event,action:site.action})),
      unsupportedSites:module.transformed.unsupported.map(site=>({siteId:site.siteId||null,checkIdentity:site.checkIdentity||null,mappedChecks:site.mappedChecks||[],line:site.line||null,reason:site.reason}))};
    const contexts = await Promise.all([browser.newContext({viewport: profile.viewport, colorScheme: profile.colorScheme}), browser.newContext({viewport: profile.viewport, colorScheme: profile.colorScheme})]);
    const pages = await Promise.all(contexts.map(context => context.newPage()));
    const [originalPage, instrumentedPage] = pages;
    let traceMode=false,originalInterceptionError=null;
    const originalRoutes=new Map();
    for(const module of preparedModules)await originalPage.route(`**/assets/advanced-${module.name}-checks.js`,async route=>{
      const routedTrace=traceMode;
      try{
        const response=await route.fetch();
        assert.equal(sha256(await response.text()),module.transformed.originalSHA,`untouched reference served hash: ${module.filename}`);
        const key=`${routedTrace?'trace':'untouched'}:${module.filename}`;originalRoutes.set(key,(originalRoutes.get(key)||0)+1);
        await route.fulfill(routedTrace?{response,body:module.trace.source}:{response});
      }catch(error){originalInterceptionError=String(error);await route.abort('failed').catch(()=>{});}
    });
    await originalPage.addInitScript(synchronousTraceInit);
    const familyURL = options.surface === 'static-audit'
      ? `${origin}${staticBasePath}components/audit/${encodeURIComponent(family)}/aliases/`
      : `${origin}/components/audit?aliases=1&family=${encodeURIComponent(family)}${options.trashFixture?'&trash-fixture='+encodeURIComponent(options.trashFixture):''}`;
    let interceptCount = 0, interceptionError = null;
    const moduleInterceptCounts=new Map(preparedModules.map(module=>[module.filename,0]));
    for(const module of preparedModules)await instrumentedPage.route(`**/assets/advanced-${module.name}-checks.js`, async route => {
      try {
        const response = await route.fetch();
        const fetched = await response.text();
        assert.equal(sha256(fetched), module.transformed.originalSHA, `intercepted original SHA matches expected served bytes for ${module.filename}`);
        interceptCount++;
        moduleInterceptCounts.set(module.filename,moduleInterceptCounts.get(module.filename)+1);
        await route.fulfill({response, body: module.transformed.source});
      } catch (error) {
        interceptionError = String(error);
        await route.abort('failed').catch(() => {});
      }
    });
    const semanticSnapshotInit = () => {
      globalThis.__visualSemanticSnapshot = root => {
        const nodes = [...root.querySelectorAll('button,input,select,textarea,summary,details,dialog,[role]')].slice(0, 180).map(node => ({
          tag: node.tagName, id: node.id || null, text: (node.innerText || node.value || '').trim().replace(/\s+/g, ' ').slice(0, 100),
          value: node.value ?? null, checked: node.checked ?? null, open: node.open ?? null, hidden: node.hidden ?? null,
          disabled: node.disabled ?? null, aria: [...node.attributes].filter(attribute => attribute.name.startsWith('aria-')).map(attribute => [attribute.name, attribute.value]),
        }));
        return {id: root.id || null, kind: root.dataset.elyKind || null, component: root.dataset.elyComponent || null,
          text: root.innerText.trim().replace(/\s+/g, ' ').slice(0, 1200), nodes};
      };
    };
    await Promise.all(pages.map(page => page.addInitScript(semanticSnapshotInit)));
    for (const page of pages) {
      page.on('console', message => { if (['error','warning'].includes(message.type())) browserErrors.push({family, type: message.type(), text: message.text()}); });
      page.on('pageerror', error => browserErrors.push({family, type: 'pageerror', text: String(error)}));
      page.on('response', response => { if (response.status() >= 400) browserErrors.push({family, type: 'http', text: `${response.status()} ${response.url()}`}); });
    }
    const statesByName = new Map();
    let active = null, checkpointIndex = 0;
    await instrumentedPage.exposeFunction('__visualBeforeAction', async site => {
      if (!active) throw new Error('Checkpoint fired without an active registered check');
      active.traceEvents.push({siteId:site.siteId,phase:'enter'});
      checkpointIndex++;
      const receipt = {siteId: site.siteId, actionSiteId: site.siteId, sourceLocation: {filename: site.filename, line: site.line, column: site.column},
        containingFunction: site.containingFunction, controlExpression: site.control, eventExpression: site.event, actionExpression: site.action,
        checkIdentity: site.checkIdentity, mappedChecks: site.mappedChecks, checkpointWait: 'two requestAnimationFrame callbacks before and after each transformed action statement; driver timing intentionally changed by awaited capture hooks',
        runtimeAttribution: {caseId: active.item.caseId, componentIdentity: active.item.componentIdentity, fixture: active.item.fixtureIdentity},
        captureStatus: 'pending', beforeCaptureStatus: 'pending', afterCaptureStatus: 'pending'};
      active.sites.push(receipt);
      active.pending.push(receipt);
      try {
        await sleepFrames(instrumentedPage);
        const overlayInventory = await discoverOverlays(active.root, active.record);
        const state = {semantic: await snapshot(active.root), ownedOverlays: overlayInventory.filter(item => item.owned),
          ignoredUnownedVisibleOverlayCount: overlayInventory.filter(item => !item.owned).length};
        receipt.beforeSemantic = {sha256: digest(state.semantic), controlCount: state.semantic.controls.length, overlayCount: state.ownedOverlays.length};
        receipt.beforeCaptureOwnership = await captureOwnedState({page: instrumentedPage, record: active.record, root: active.root, caseId: active.item.caseId,
          siteId: site.siteId, checkpointIndex, phase: 'before', captures, state});
        receipt.beforeCaptureStatus = receipt.beforeCaptureOwnership.ownedStateEvidence?'captured':'captured-context-only';
      } catch (error) {
        receipt.beforeCaptureStatus = 'failed';
        receipt.beforeCaptureError = String(error);
      }
    });
    await instrumentedPage.exposeFunction('__visualCheckpoint', async site => {
      if(!active)throw new Error('Checkpoint completion without an active check');
      active.traceEvents.push({siteId:site.siteId,phase:'exit'});
      const receiptIndex = active?.pending.findLastIndex(item => item.siteId === site.siteId) ?? -1;
      if (receiptIndex < 0) throw new Error(`After-action checkpoint has no matching before receipt: ${site.siteId}`);
      const [receipt] = active.pending.splice(receiptIndex, 1);
      try {
        await sleepFrames(instrumentedPage);
        const overlayInventory = await discoverOverlays(active.root, active.record);
        const state = {semantic: await snapshot(active.root), ownedOverlays: overlayInventory.filter(item => item.owned),
          ignoredUnownedVisibleOverlayCount: overlayInventory.filter(item => !item.owned).length};
        receipt.afterSemantic = {sha256: digest(state.semantic), controlCount: state.semantic.controls.length, overlayCount: state.ownedOverlays.length};
        receipt.afterCaptureOwnership = await captureOwnedState({page: instrumentedPage, record: active.record, root: active.root, caseId: active.item.caseId,
          siteId: site.siteId, checkpointIndex, phase: 'after', captures, state});
        receipt.afterCaptureStatus = receipt.afterCaptureOwnership.ownedStateEvidence?'captured':'captured-context-only';
      } catch (error) {
        receipt.afterCaptureStatus = 'failed';
        receipt.afterCaptureError = String(error);
      }
      receipt.captureStatus = receipt.beforeCaptureStatus === 'captured' && receipt.afterCaptureStatus === 'captured' ? 'captured' : 'failed';
    });
    await instrumentedPage.exposeFunction('__visualUnsupportedAction', site => {
      if (!active){browserErrors.push({family,type:'pageerror',text:'Unsupported action outside an active check'});return;}
      active.traceEvents.push({siteId:site.siteId,phase:'unsafe'});
      active.unsupportedReached.push({siteId: site.siteId, checkIdentity: site.checkIdentity, mappedChecks: site.mappedChecks, reason: site.reason || 'sync-only unsupported action reached'});
    });
    await Promise.all(pages.map(page => page.goto(familyURL, {waitUntil: 'networkidle'})));
    assert.equal(interceptionError, null, 'check-module interception');
    for(const module of preparedModules){assert(moduleInterceptCounts.get(module.filename)>0,`required check module intercepted: ${module.filename}`);transformReports[module.filename].routeInterceptCount=moduleInterceptCounts.get(module.filename);}
    for (const item of familyCases) {
      checkpointIndex = 0;
      if(options.statesOnly){
        const contract=requestedStateContract(item.componentIdentity,options.trashFixture);
        const proof=await directCaseDriver({item,familyURL,captures,reference:null,semanticSnapshotInit,contract,browserErrors,failureReceiptPath:resolve(options.output,`${slug(item.caseId)}.failure.json`)});
        reports.push({caseId:item.caseId,componentIdentity:item.componentIdentity,comparison:{classification:proof.status==='passed'?'target-state-contract-passed':'harness-error-target-state-driver',equivalent:null,semanticDifferences:[]},
          actionSites:[],directFallback:null,requestedStateEvidence:proof,originalError:null,instrumentedError:proof.error||null,namedUnsupportedActionSites:[],
          actionCoverage:{incompleteCoverage:proof.status!=='passed',runtimeCheckpointCountForCase:proof.receipts.length,coverageStatus:proof.status==='passed'?'requested-state-captured-and-asserted':'requested-state-failed',staticallyNamedUnsupportedSiteIds:[],unsupportedActionsReachedAtRuntime:[],staticSafeSitesNotReachedForCase:[],captureFailureSiteIds:[],unknownReachedSiteIds:[],missingRuntimeOccurrences:[],exactContract:contract}});
        console.log(`${item.caseId}: ${proof.status}; requested-state-receipts=${proof.receipts.length}`);
        continue;
      }
      // Fresh documents give untouched, sync-traced and captured runs the same
      // fixture starting state without adding a third simultaneous context.
      await Promise.all(pages.map(page=>page.goto(familyURL,{waitUntil:'networkidle'})));
      assert.equal(originalInterceptionError,null,'untouched check-module interception');
      const untouchedCounts=new Map(originalRoutes);
      const originalRecord = originalPage.locator(`[data-audit-name=${JSON.stringify(item.componentIdentity)}]`);
      const instrumentRecord = instrumentedPage.locator(`[data-audit-name=${JSON.stringify(item.componentIdentity)}]`);
      assert.equal(await originalRecord.count(), 1, `original fixture ${item.componentIdentity}`);
      assert.equal(await instrumentRecord.count(), 1, `instrumented fixture ${item.componentIdentity}`);
      const initialOriginalRoot = originalRecord.locator('[data-audit-main] > [data-ely-family]');
      const initialInstrumentRoot = instrumentRecord.locator('[data-audit-main] > [data-ely-family]');
      await originalRecord.scrollIntoViewIfNeeded();
      const initialOriginal = await snapshot(initialOriginalRoot), initialInstrumented = await snapshot(initialInstrumentRoot);
      const initialPath = resolve(captures, `${slug(item.caseId)}-initial.png`);
      const initialCapture = await captureComponent(originalPage,initialOriginalRoot,initialPath);

      let originalOutcome, originalError;
      try { originalOutcome = await executeCheck(originalPage, item); } catch (error) { originalError = String(error); }
      let traceOutcome,originalTraceError,originalTrace={events:[],lateEvents:[],errors:[]};
      try{
        traceMode=true;
        await originalPage.goto(familyURL,{waitUntil:'networkidle'});
        assert.equal(originalInterceptionError,null,'sync trace served-source interception');
        for(const module of preparedModules)assert((originalRoutes.get(`trace:${module.filename}`)||0)>(untouchedCounts.get(`trace:${module.filename}`)||0),`sync trace module loaded: ${module.filename}`);
        const known=Object.fromEntries(preparedModules.flatMap(module=>module.trace.sites.map(site=>[site.siteId,site.sourceSHA256])));
        await originalPage.evaluate(({caseId,known})=>Object.assign(globalThis.__visualSyncTraceState,{caseId,known}),{caseId:item.caseId,known});
        traceOutcome=await executeCheck(originalPage,item);
        await originalPage.evaluate(()=>{const state=globalThis.__visualSyncTraceState;state.caseId=null;state.sealed=true;});
        await originalPage.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
        originalTrace=await originalPage.evaluate(()=>{const {events,lateEvents,errors}=globalThis.__visualSyncTraceState;return {events,lateEvents,errors};});
      }catch(error){originalTraceError=String(error);originalTrace=await originalPage.evaluate(()=>{const {events,lateEvents,errors}=globalThis.__visualSyncTraceState;return {events,lateEvents,errors};}).catch(()=>originalTrace);}
      finally{traceMode=false;}
      const instrumentSites = [];
      const unsupportedReached = [];
      const capturedTrace=[];
      active = {item, record: instrumentRecord, root: initialInstrumentRoot, sites: instrumentSites, unsupportedReached, pending: [],traceEvents:capturedTrace};
      let instrumentOutcome, instrumentError;
      try { instrumentOutcome = await executeCheck(instrumentedPage, item); } catch (error) { instrumentError = String(error); }
      finally { active = null; }
      assert(interceptCount > 0, `Playwright route intercepted ${filename}`);

      const originalPass = !originalError, instrumentedPass = !instrumentError;
      const equivalent = originalPass && instrumentedPass && isDeepStrictEqual(originalOutcome.result.checkResult, instrumentOutcome.result.checkResult)
        && isDeepStrictEqual(originalOutcome.result.actions, instrumentOutcome.result.actions)
        && isDeepStrictEqual(originalOutcome.result.hostEvents, instrumentOutcome.result.hostEvents)
        && isDeepStrictEqual(originalOutcome.result.finalState, instrumentOutcome.result.finalState)
        && isDeepStrictEqual(originalOutcome.finalTwin, instrumentOutcome.finalTwin)
        && isDeepStrictEqual(initialOriginal, initialInstrumented);
      const key = await instrumentRecord.getAttribute('data-audit-key');
      const selectedModule=preparedModules.find(module=>module.registeredChecks.includes(key))||primary;
      const contract=caseActionContract(item.componentIdentity,selectedModule.source,selectedModule.filename);
      const candidateUnsupported = transformed.unsupported.filter(site => site.checkIdentity === key || site.mappedChecks?.includes(key));
      const candidateSafeNotHit = transformed.interactionSites.filter(site => (site.checkIdentity === key || site.mappedChecks?.includes(key)) && !instrumentSites.some(captured => captured.siteId === site.siteId));
      const expectedIds=contract?new Set(contract.steps.map(step=>step.source?.siteId).filter(Boolean)):null;
      const namedUnsupported=contract?candidateUnsupported.filter(site=>expectedIds.has(site.siteId)):candidateUnsupported;
      const namedSafeNotHit=contract?candidateSafeNotHit.filter(site=>expectedIds.has(site.siteId)):candidateSafeNotHit;
      const directFallback=contract&&originalPass?await directCaseDriver({item,familyURL,captures,reference:originalOutcome,semanticSnapshotInit,contract,browserErrors,failureReceiptPath:resolve(options.output,`${slug(item.caseId)}.failure.json`)}):null;
      const targetContract=requestedStateContract(item.componentIdentity);
      const requestedStateEvidence=targetContract&&originalPass?await directCaseDriver({item,familyURL,captures,reference:originalOutcome,semanticSnapshotInit,contract:targetContract,browserErrors,failureReceiptPath:resolve(options.output,`${slug(item.caseId)}.failure.json`)}):null;
      // Keep observing sealed late events through capture/direct-driver work,
      // then discard the document before moving to another fixture.
      try{originalTrace=await originalPage.evaluate(()=>{const {events,lateEvents,errors}=globalThis.__visualSyncTraceState;return {events,lateEvents,errors};});}
      catch(error){originalTraceError||=String(error);}
      await originalPage.goto('about:blank');
      const traceEquivalent=!originalError&&!originalTraceError&&!originalTrace.errors.length&&registeredOutcomesEqual(originalOutcome,traceOutcome);
      const originalTraceProof=compareActionTrace({originalEvents:originalTrace.events,capturedEvents:capturedTrace,receipts:instrumentSites,originalEquivalent:traceEquivalent,
        unprobed:preparedModules.flatMap(module=>module.trace.unprobed),knownSiteIds:preparedModules.flatMap(module=>module.trace.sites.map(site=>site.siteId)),lateEvents:originalTrace.lateEvents});
      const reached=[...instrumentSites,...unsupportedReached];
      const unknownReached=contract?reached.filter(site=>!expectedIds.has(site.siteId)):[];
      const unexpectedRuntimeOccurrences=contract?reached.filter((site,index)=>reached.slice(0,index+1).filter(other=>other.siteId===site.siteId).length>contract.steps.filter(step=>step.source?.siteId===site.siteId).length).map(site=>site.siteId):[];
      const missingRuntimeOccurrences=contract?contract.steps.filter((step,index)=>step.source&&reached.filter(site=>site.siteId===step.source.siteId).length<contract.steps.slice(0,index+1).filter(other=>other.source?.siteId===step.source.siteId).length).map(step=>step.id):[];
      const manifestModule = coverageManifest.modules[selectedModule.name];
      const capturedSiteIds = new Set(instrumentSites.map(site => site.siteId));
      const mappedSites = transformed.interactionSites.filter(site => contract?expectedIds.has(site.siteId):site.checkIdentity === key || site.mappedChecks?.includes(key));
      const unmappedRuntimeSites = instrumentSites.filter(site => !site.checkIdentity && !(site.mappedChecks || []).length);
      const captureFailures = instrumentSites.filter(site => site.captureStatus !== 'captured');
      const {traceCalibrationValid,independentContractGap}=traceContractStatus(contract,originalTrace.events,traceEquivalent,originalTrace.lateEvents);
      const incompleteCoverage = independentContractGap||(contract?!traceCalibrationValid:originalTraceProof.status!=='passed')||(contract
        ? contract.mappingGaps.length>0||unknownReached.length>0||unexpectedRuntimeOccurrences.length>0||missingRuntimeOccurrences.length>0||directFallback?.status!=='passed'||directFallback?.visualActionabilityGaps?.length>0||captureFailures.length>0
        : namedUnsupported.length > 0 || namedSafeNotHit.length > 0 || captureFailures.length > 0 || unsupportedReached.length > 0);
      let classification;
      if (originalPass && !instrumentedPass) classification = 'harness-error-instrumented-failed-original-passed';
      else if (!originalPass) classification = 'original-check-failed-not-a-pass';
      else if (!instrumentSites.length) classification = 'unsupported-no-safe-action-checkpoint-executed';
      else if (!equivalent) classification = 'harness-error-semantic-or-event-mismatch';
      else if (!traceEquivalent) classification = 'harness-error-original-trace-calibration';
      else if (incompleteCoverage) classification = !contract&&!captureFailures.length&&!unsupportedReached.length?'mapping-gap-equivalent-semantics':'action-coverage-gap-equivalent-semantics';
      else if(contract)classification='passed-equivalent-with-direct-action-contract';
      else classification = 'passed-equivalent-with-action-checkpoints';
      const actionCoverage = {
        originalTraceProof:{...originalTraceProof,untouchedCalibrationEquivalent:traceEquivalent,error:originalTraceError||null,events:originalTrace.events,eventsSHA256:digest(originalTrace.events),lateEvents:originalTrace.lateEvents,errors:originalTrace.errors,
          calibrationDifferences:registeredOutcomeDifferences(originalOutcome,traceOutcome),
          capturedEvents:capturedTrace,capturedEventsSHA256:digest(capturedTrace),
          untouchedOutcomeSHA256:originalOutcome?digest({initial:originalOutcome.initial,finalTwin:originalOutcome.finalTwin,result:originalOutcome.result}):null,
          tracedOutcomeSHA256:traceOutcome?digest({initial:traceOutcome.initial,finalTwin:traceOutcome.finalTwin,result:traceOutcome.result}):null,
          completionScope:'registered check and its existing two-frame settling, followed by two sealed frames; future asynchronous actions not proved',
          coverageAlternative:contract?'existing guarded exact source contract and independently asserted direct driver; trace only adds calibration/unknown-site vetoes':null},
        independentContractCoverage:independentContractGap?'unresolved-public-controls-and-expected-states':'existing-exact-guarded-source-contract',
        independentContractGap,
        manifestSourceSHA256: manifestModule?.sourceSHA256 || null,
        manifestCheckpointableSiteCount: manifestModule?.counts?.checkpointed ?? null,
        manifestUnsupportedSiteCount: manifestModule?.counts?.unsupported ?? null,
        manifestMappedCheckpointSiteCount: manifestModule?.counts?.mappedCheckpointSites ?? null,
        moduleSafeSiteCount: selectedModule.transformed.interactionSites.length,
        moduleUnsupportedSiteCount: selectedModule.transformed.unsupported.length,
        staticallyMappedSafeSiteCountForCase: mappedSites.length,
        runtimeCheckpointCountForCase: instrumentSites.length,
        runtimeCheckpointSiteIds: instrumentSites.map(site => site.siteId),
        runtimeAttribution: 'active registered case at __visualCheckpoint; valid even when the instrumenter has no static check mapping',
        runtimeSitesWithoutStaticMapping: unmappedRuntimeSites.map(site => site.siteId),
        staticSafeSitesNotReachedForCase: namedSafeNotHit.map(site => site.siteId),
        staticallyNamedUnsupportedSiteIds: namedUnsupported.map(site => site.siteId).filter(Boolean),
        captureFailureSiteIds: captureFailures.map(site => site.siteId),
        unsupportedActionsReachedAtRuntime: unsupportedReached,
        incompleteCoverage,
        exactContract:contract,unknownReachedSiteIds:unknownReached.map(site=>site.siteId),unexpectedRuntimeOccurrences,missingRuntimeOccurrences,
        staticMappingDiagnostic:contract?{status:'shared-dispatcher-candidates-retained-separately-from-exact-contract',unselectedSafeCandidateCount:candidateSafeNotHit.filter(site=>!expectedIds.has(site.siteId)).length,
          unselectedUnsupportedCandidateCount:candidateUnsupported.filter(site=>!expectedIds.has(site.siteId)).length,
          unresolvedSelectedMappingGaps:contract.mappingGaps,unselectedCandidateSamples:[...candidateSafeNotHit,...candidateUnsupported].filter(site=>!expectedIds.has(site.siteId)).slice(0,3).map(site=>site.siteId)}:null,
        coverageStatus: !originalPass ? 'original-check-failed' : independentContractGap?'independent-supported-controls-and-expected-states-unresolved':contract&&!incompleteCoverage?'exact-guarded-contract-captured-and-asserted':!instrumentSites.length ? 'no-runtime-checkpoint-reached' : captureFailures.length ? 'runtime-checkpoints-reached-with-capture-failures' : 'runtime-checkpoints-captured-partial-static-coverage',
      };
      const sourceSHA = {path:selectedModule.filename,localSourceSHA:sha256(selectedModule.localSource),originalSHA:selectedModule.transformed.originalSHA,transformedSHA:selectedModule.transformed.transformedSHA};
      const semanticDifferences = originalPass && instrumentedPass ? [
        ['checkResult', originalOutcome.result.checkResult, instrumentOutcome.result.checkResult],
        ['actions', originalOutcome.result.actions, instrumentOutcome.result.actions],
        ['hostEvents', originalOutcome.result.hostEvents, instrumentOutcome.result.hostEvents],
        ['finalState', originalOutcome.result.finalState, instrumentOutcome.result.finalState],
        ['twinState', originalOutcome.finalTwin, instrumentOutcome.finalTwin],
        ['initialSnapshot', initialOriginal, initialInstrumented],
      ].map(([field, left, right]) => { const difference = firstDifference(left, right); return difference ? {field, ...difference} : null; }).filter(Boolean) : [];
      reports.push({caseId: item.caseId, componentIdentity: item.componentIdentity, family, aliasMapping: item.aliasMapping,
        fixtureIdentity: {route: familyURL, recordName: item.componentIdentity, behaviorCheckKey: key, fixture: item.fixtureIdentity},
        profile, surface: options.surface === 'static-audit' ? 'static Pages registered behavior check' : 'live Go gallery registered behavior check', sourceSHA, referenceCitation: item.referenceCitation,
        initialSnapshot: {originalSHA256: digest(initialOriginal), instrumentedSHA256: digest(initialInstrumented), equivalent: isDeepStrictEqual(initialOriginal, initialInstrumented), captureStatus: 'captured', captureOwnership: initialCapture},
        original: originalPass ? {checkResult: originalOutcome.result.checkResult, actionsSHA256: digest(originalOutcome.result.actions), hostEventsSHA256: digest(originalOutcome.result.hostEvents), finalStateSHA256: digest(originalOutcome.result.finalState), twinStateSHA256: digest(originalOutcome.finalTwin)} : null,
        instrumented: instrumentedPass ? {checkResult: instrumentOutcome.result.checkResult, actionsSHA256: digest(instrumentOutcome.result.actions), hostEventsSHA256: digest(instrumentOutcome.result.hostEvents), finalStateSHA256: digest(instrumentOutcome.result.finalState), twinStateSHA256: digest(instrumentOutcome.finalTwin)} : null,
        originalError: originalError || null, instrumentedError: instrumentError || null,
        comparison: {equivalent, classification, resultEqual: originalPass && instrumentedPass && isDeepStrictEqual(originalOutcome.result.checkResult, instrumentOutcome.result.checkResult),
          actionsEqual: originalPass && instrumentedPass && isDeepStrictEqual(originalOutcome.result.actions, instrumentOutcome.result.actions),
          hostEventsEqual: originalPass && instrumentedPass && isDeepStrictEqual(originalOutcome.result.hostEvents, instrumentOutcome.result.hostEvents),
          finalSemanticStateEqual: originalPass && instrumentedPass && isDeepStrictEqual(originalOutcome.result.finalState, instrumentOutcome.result.finalState)
            && isDeepStrictEqual(originalOutcome.finalTwin, instrumentOutcome.finalTwin), initialSnapshotEqual: isDeepStrictEqual(initialOriginal, initialInstrumented), semanticDifferences},
        captureStatus: instrumentSites.length && !captureFailures.length ? 'captured' : 'unsupported-or-partial', behaviorStatus: originalPass && instrumentedPass ? equivalent ? 'equivalent' : 'mismatch' : 'failed',
        actionStatus: !instrumentSites.length ? 'unsupported-no-reached-checkpoint' : incompleteCoverage ? classification.startsWith('mapping-gap')?'explicit-unresolved-mapping-gap':'gap-unsupported-or-uncaptured-actions' : contract?'exact-supported-action-contract-captured':'runtime-checkpointed-all-mapped-actions', visualStatus: instrumentSites.length && !captureFailures.length ? 'screenshots-captured-before-and-after' : 'gap', actionSites: instrumentSites,
        actionCoverage, directFallback,requestedStateEvidence,
        namedUnsupportedActionSites: namedUnsupported.map(site => ({siteId: site.siteId || null, line: site.line || null, reason: site.reason})),
        namedUncapturedActionSiteIds: namedUnsupported.map(site => site.siteId).filter(siteId=>siteId&&!directFallback?.receipts.some(receipt=>receipt.sourceSiteId===siteId&&receipt.captureStatus==='captured'&&receipt.assertionsPassed)),
        namedSafeButUncapturedActionSiteIds: namedSafeNotHit.map(site => site.siteId),
        unsupportedSiteCountForModule: selectedModule.transformed.unsupported.length, uncapturedSiteMapping: namedUnsupported.length ? 'mapped' : 'transform prototype does not statically map this check key; runtime active case attribution used for reached safe sites',
      });
      console.log(`${item.caseId}: ${classification}; checkpoints=${instrumentSites.length}`);
    }
    await Promise.all(contexts.map(context => context.close()));
    assert(interceptCount > 0, `interception count ${filename}`);
  }

  const files = await (await import('node:fs/promises')).readdir(captures);
  const sourceAfter = await sourceReceipt();
  const inventoryChecks=await Promise.all([inventoryDrift(matrixInput),inventoryDrift(coverageInput)]);
  const report = {schemaVersion: 1, evidenceKind:options.statesOnly?'bounded-requested-target-state-drivers':'instrumented-registered-check-action-pilot', immutableBatch: true,
    runtime: {node: process.version, go: execFileSync('go', ['version'], {cwd: repo, env: goEnv, encoding: 'utf8'}).trim(), chromium: browser.version()},
    sourceBefore, sourceAfter, sourceStableDuringRun: sourceBefore.treeSHA256 === sourceAfter.treeSHA256 && sourceBefore.revision === sourceAfter.revision,
    matrix: {path: matrixPath, sha256: matrixInput.sha256}, coverageManifest: {path: coverageManifestPath, sha256: coverageInput.sha256},inventoryChecks,
    sourceRevision: expectedRevision, runtimeTransform: 'Playwright route interception only for selected /assets/advanced-*-checks.js test-check modules; production assets/runtime bytes unchanged',
    transformation: 'visual-state-audit-instrument.mjs transform(source, filename); checkpoint hooks are awaited only after its safe standalone interaction statements; interactions inside DOM event handlers/unsafe async propagation remain unsupported',
    comparisonMethod: 'Original and instrumented gallery checks run independently in isolated browser contexts, matching the gallery runner: data-audit-main is the checked root and data-audit-twin is the unchanged peer. Compare exact initial semantic snapshot, returned assertion result, test action payloads including FormData entries, captured ely:action host events, and final semantic state of both component instances. Persist SHA-256 receipts for semantic values, plus real before/after screenshots at each action. Runtime checkpoint count is distinct from manifest static mapping; a site reached at __visualCheckpoint is attributed to the active case even when statically unmapped. Capture failures do not erase checkpoint execution.',
    timingChanged: 'Instrumented driver awaits the exposed checkpoint after each instrumented interaction statement; hook waits two requestAnimationFrame callbacks before pixel capture. This changes test-driver timing; production/runtime timing is untouched.',
    profile, surface: options.surface, output: options.output, maxCaptureBytes: options.maxCaptureBytes, moduleTransforms: transformReports,
    caseCount: reports.length, checkpointCount: reports.reduce((sum, item) => sum + item.actionSites.length, 0),
    equivalentWithCheckpoints: reports.filter(item => item.comparison.classification.startsWith('passed-equivalent-with-')).length,
    unsupportedCases: reports.filter(item => item.actionCoverage.incompleteCoverage || item.actionCoverage.runtimeCheckpointCountForCase === 0).map(item => ({caseId: item.caseId, coverageStatus: item.actionCoverage.coverageStatus, staticUnsupportedSiteIds: item.actionCoverage.staticallyNamedUnsupportedSiteIds, unsupportedActionsReachedAtRuntime: item.actionCoverage.unsupportedActionsReachedAtRuntime})),
    harnessErrors: reports.filter(item => item.comparison.classification.startsWith('harness-error')).map(item => ({caseId: item.caseId, classification: item.comparison.classification, instrumentedError: item.instrumentedError})),
    cases: reports, browserErrors};
  report.directFallbacks = reports.filter(item => item.directFallback).map(item => ({caseId: item.caseId, status: item.directFallback.status, receiptCount: item.directFallback.receipts.length, differences: item.directFallback.differences, error: item.directFallback.error}));
  report.unhandledBrowserErrors=unhandledBrowserErrors(browserErrors);
  report.requestedStateGate={safe:reports.some(item=>item.requestedStateEvidence)&&report.sourceStableDuringRun&&inventoryChecks.every(check=>check.stable)&&!report.unhandledBrowserErrors.length&&reports.filter(item=>item.requestedStateEvidence).every(item=>item.requestedStateEvidence.status==='passed'&&!item.requestedStateEvidence.visualActionabilityGaps?.length),
    caseCount:reports.filter(item=>item.requestedStateEvidence).length,receiptCount:reports.reduce((sum,item)=>sum+(item.requestedStateEvidence?.receipts.length||0),0)};
  report.fullRunGate = {safe: !options.statesOnly && report.sourceStableDuringRun && inventoryChecks.every(check=>check.stable) && !report.unhandledBrowserErrors.length && !report.harnessErrors.length && !report.unsupportedCases.length && reports.every(item => item.comparison.equivalent && (!item.directFallback || item.directFallback.status === 'passed') && (!item.requestedStateEvidence||item.requestedStateEvidence.status==='passed'&&!item.requestedStateEvidence.visualActionabilityGaps?.length)),
    scope:'Selected finite fixture actions only; safe is an expansion guard, not an all-property or publication claim',selectedCaseCount:reports.length,inventoryCaseCount:matrix.auditCases.length,
    blockers: [
      ...(options.statesOnly?[{reason:'bounded-target-state-mode-does-not-run-registered-check-equivalence'}]:[]),
      ...(!report.sourceStableDuringRun ? [{reason: 'source-tree-changed-during-run', changedPaths: [...new Set([...sourceBefore.files, ...sourceAfter.files].map(file => file.path))].filter(path => sourceBefore.files.find(file => file.path === path)?.sha256 !== sourceAfter.files.find(file => file.path === path)?.sha256)}] : []),
      ...inventoryChecks.filter(check=>!check.stable).map(check=>({reason:'inventory-bytes-changed-during-run',...check})),
      ...report.unhandledBrowserErrors.slice(0,3).map(error=>({reason:'unhandled-browser-error',...error})),
      ...reports.flatMap(item=>(item.requestedStateEvidence?.visualActionabilityGaps||[]).map(gap=>({caseId:item.caseId,reason:'requested-control-pointer-occluded',...gap}))),
      ...reports.filter(item => (!options.statesOnly&&!item.comparison.classification.startsWith('passed-equivalent-with-')) || item.directFallback?.status === 'failed' || item.directFallback?.status === 'mismatch'||item.requestedStateEvidence?.status==='failed').map(item => ({caseId: item.caseId, classification: item.comparison.classification, differences: item.comparison.semanticDifferences, originalError: item.originalError, instrumentedError: item.instrumentedError,
        unexecutedStaticCandidateCount:item.actionCoverage.staticSafeSitesNotReachedForCase.length,unexecutedStaticCandidateSamples:item.actionCoverage.staticSafeSitesNotReachedForCase.slice(0,3),
        unsupportedSiteCount:item.namedUnsupportedActionSites.length,captureFailureCount:item.actionCoverage.captureFailureSiteIds.length,
        runtimeUnsupportedCount:item.actionCoverage.unsupportedActionsReachedAtRuntime.length,mappingGaps:item.actionCoverage.exactContract?.mappingGaps||[],unknownReachedCount:item.actionCoverage.unknownReachedSiteIds.length,
        missingExpectedActions:item.actionCoverage.missingRuntimeOccurrences,directFallback: item.directFallback ? {status: item.directFallback.status, differences: item.directFallback.differences, error: item.directFallback.error} : null})),
    ]};
  report.fullRunGate.fullMatrixComplete=Boolean(options.full&&sourceBefore.status===''&&report.fullRunGate.safe&&reports.length===matrix.auditCases.filter(item=>item.profileIds.includes(profile.id)&&item.surface.includes(options.surface)).length);
  report.captureBytes = (await Promise.all(files.map(name => stat(resolve(captures, name))))).reduce((sum, item) => sum + item.size, 0);
  report.imageCount = files.filter(name => name.endsWith('.png')).length;
  await writeFile(resolve(options.output, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  await writeFile(resolve(options.output, 'blockers.json'), JSON.stringify({runtime: report.runtime, caseCount: report.caseCount, checkpointCount: report.checkpointCount, equivalentWithCheckpoints: report.equivalentWithCheckpoints, fullRunGate: report.fullRunGate}, null, 2) + '\n', {flag: 'wx'});
  console.log(`Evidence: ${resolve(options.output, 'report.json')}; cases=${report.caseCount}; checkpoints=${report.checkpointCount}; captures=${report.imageCount}; ${(report.captureBytes / 1048576).toFixed(2)} MiB`);
  }
} catch (error) {
  if (runDir) await writeFile(resolve(options.output, 'failure.json'), JSON.stringify({runtime: process.version, error: String(error), stack: error.stack, runnerPID: process.pid, galleryPID: child?.pid, runDir, serverOutput}, null, 2) + '\n', {flag: 'wx'});
  throw error;
} finally {
  await browser?.close();
  if (staticServer?.listening) await new Promise(resolve => staticServer.close(resolve));
  if (child && child.exitCode === null) {
    const exited = new Promise(resolve => child.once('exit', resolve));
    if (process.platform === 'win32') child.kill('SIGTERM'); else process.kill(-child.pid, 'SIGTERM');
    await exited;
  }
  if (runDir) await rm(runDir, {recursive: true, force: true});
  if (runDir) await writeFile(resolve(options.output, 'resources.json'), JSON.stringify({runnerPID: process.pid, galleryPID: child?.pid || null, runDir, state: 'cleaned', browserClosed: true, serverClosed: true, temporaryDirectoryRemoved: true}) + '\n');
}
