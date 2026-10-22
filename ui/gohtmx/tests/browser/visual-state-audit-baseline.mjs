import assert from 'node:assert/strict';
import {spawn, spawnSync, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, mkdtemp, readFile, readdir, writeFile, rm, access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {resolve, join, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';
import {captureBounds} from './visual-state-audit-bounds.mjs';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
function pinnedSourceRoot(sourceRoot, revision) {
  assert.match(revision || '', /^[a-f0-9]{40}$/, 'explicit source root requires full --source-revision pin');
  const root = resolve(sourceRoot);
  const git = args => execFileSync('git', args, {cwd: root, encoding: 'utf8'}).trim();
  assert.equal(resolve(git(['rev-parse', '--show-toplevel'])), root, 'source root must be the repository root');
  assert.equal(git(['rev-parse', 'HEAD']), revision, 'source revision pin mismatch');
  return root;
}
function captureCamera(clip, scroll, viewport) {
  const viewportClip = {...clip, x: clip.x - scroll.x, y: clip.y - scroll.y};
  const fits = viewportClip.x >= 0 && viewportClip.y >= 0 && viewportClip.x + clip.width <= viewport.width && viewportClip.y + clip.height <= viewport.height;
  return {fullPage: !fits, clip: fits ? viewportClip : clip};
}
async function fulfillAsset(route, page, timeout = 30000) {
  const request = route.request(), path = new URL(request.url()).pathname;
  const context = page.context();
  let finish;
  const completed = new Promise(resolve => { finish = resolve; });
  const done = candidate => { if (candidate === request) finish(request.failure() ? {error: 'asset request completion failed'} : {}); };
  const failed = candidate => { if (candidate === request) finish({error: 'asset request failed'}); };
  const closed = () => finish({error: 'asset target closed before request completion'});
  page.on('requestfinished', done); page.on('requestfailed', failed);
  page.on('close', closed); context.on('close', closed);
  const timer = setTimeout(() => finish({error: 'asset request completion missing'}), timeout);
  try {
    const response = await route.fetch();
    assert(response.ok(), `asset response failed: ${path}`);
    assert.equal(new URL(response.url()).pathname, path, 'asset redirect changed identity');
    const bytes = await response.body();
    // Fulfill may resolve on target closure; require this exact browser request to finish.
    await route.fulfill({response, body: bytes});
    const completion = await completed;
    assert(!completion.error, completion.error);
    return {path, bytes: bytes.length, sha256: sha256(bytes), loadedProof: 'owned-route identical bytes; exact browser requestfinished'};
  } finally {
    clearTimeout(timer);
    page.off('requestfinished', done); page.off('requestfailed', failed);
    page.off('close', closed); context.off('close', closed);
  }
}
const profiles = Object.freeze({
  'live-desktop-light': {mode: 'live', viewport: {width: 1440, height: 1000}, colorScheme: 'light', deviceScaleFactor: 1},
  'live-desktop-dark': {mode: 'live', viewport: {width: 1440, height: 1000}, colorScheme: 'dark', deviceScaleFactor: 1},
  'live-mobile-light': {mode: 'live', viewport: {width: 390, height: 844}, colorScheme: 'light', deviceScaleFactor: 1},
  'live-mobile-dark': {mode: 'live', viewport: {width: 390, height: 844}, colorScheme: 'dark', deviceScaleFactor: 1},
  'static-desktop-light': {mode: 'static', viewport: {width: 1440, height: 1000}, colorScheme: 'light', deviceScaleFactor: 1},
  'static-desktop-dark': {mode: 'static', viewport: {width: 1440, height: 1000}, colorScheme: 'dark', deviceScaleFactor: 1},
  'static-mobile-light': {mode: 'static', viewport: {width: 390, height: 844}, colorScheme: 'light', deviceScaleFactor: 1},
  'static-mobile-dark': {mode: 'static', viewport: {width: 390, height: 844}, colorScheme: 'dark', deviceScaleFactor: 1},
});

function argsFrom(argv) {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const options = {sourceRoot: null, sourceRevision: null, matrix: process.env.VISUAL_AUDIT_MATRIX ? resolve(process.env.VISUAL_AUDIT_MATRIX) : null, output: process.env.VISUAL_AUDIT_OUTPUT_DIR ? resolve(process.env.VISUAL_AUDIT_OUTPUT_DIR) : resolve(repo, 'test-results', 'visual-audit', `${stamp}-${process.pid}`), profile: 'live-desktop-light', mode: null, families: [], caseIds: [], contextCases: [], baseURL: null, help: false};
  for (const arg of argv) {
    if (arg === '--help' || arg === '-h') options.help = true;
    else if (arg.startsWith('--source-root=')) options.sourceRoot = resolve(arg.slice('--source-root='.length));
    else if (arg.startsWith('--source-revision=')) options.sourceRevision = arg.slice('--source-revision='.length);
    else if (arg.startsWith('--matrix=')) options.matrix = resolve(arg.slice('--matrix='.length));
    else if (arg.startsWith('--output-dir=')) options.output = resolve(arg.slice('--output-dir='.length));
    else if (arg.startsWith('--base-url=')) options.baseURL = arg.slice('--base-url='.length).replace(/\/$/, '');
    else if (arg.startsWith('--profile=')) options.profile = arg.slice('--profile='.length);
    else if (arg.startsWith('--mode=')) options.mode = arg.slice('--mode='.length);
    else if (arg.startsWith('--family=')) options.families.push(...arg.slice('--family='.length).split(',').filter(Boolean));
    else if (arg.startsWith('--case=')) options.caseIds.push(...arg.slice('--case='.length).split(',').filter(Boolean));
    else if (arg.startsWith('--context-case=')) options.contextCases.push(...arg.slice('--context-case='.length).split(',').filter(Boolean));
    else throw new Error(`Unknown option: ${arg}`);
  }
  if (options.help) {
    console.log('Usage: node visual-state-audit-baseline.mjs --matrix=/path/to/acceptance-matrix.json [--source-root=/production/repo --source-revision=<fullSHA>] [--profile=<profile>] [--mode=live|static] [--family=a,b] [--case=id,...] [--context-case=id,...] [--output-dir=path] [--base-url=http://127.0.0.1:port]');
    console.log(`Profiles: ${Object.keys(profiles).join(', ')}`);
    return null;
  }
  if (!options.matrix) {
    console.error('Error: missing required --matrix=/path/to/acceptance-matrix.json (or set VISUAL_AUDIT_MATRIX). No default inventory is bundled.');
    process.exit(2);
  }
  assert(profiles[options.profile], `Unknown profile: ${options.profile}`);
  assert(!options.mode || ['live', 'static'].includes(options.mode), '--mode must be live or static');
  if (options.mode) assert.equal(options.mode, profiles[options.profile].mode, `Profile requires --mode=${profiles[options.profile].mode}`);
  options.mode = profiles[options.profile].mode;
  return options;
}

const options = argsFrom(process.argv.slice(2));
if (!options) process.exit(0);
const sourceRepo = options.sourceRoot ? pinnedSourceRoot(options.sourceRoot, options.sourceRevision) : repo;
const batchSize = 25;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
async function sourceBaseSnapshot(matrixBytes, matrix) {
  const git = args => execFileSync('git', args, {cwd: sourceRepo, encoding: 'utf8'});
  const paths = [...new Set((git(['diff', 'HEAD', '--name-only', '-z']) + git(['ls-files', '--others', '--exclude-standard', '-z'])).split('\0').filter(Boolean))];
  const sourceFiles = [];
  for (const path of paths) {
    if (path.startsWith('ui/gohtmx/tests/browser/')) continue;
    if (!/^(?:go\.(?:mod|sum|work|work\.sum)$|ui\/gohtmx\/|internal\/gallery\/|examples\/gohtmx\/gallery\/|cmd\/ely-gallery-static\/)/.test(path)) continue;
    let contentHash;
    try { contentHash = sha256(await readFile(resolve(sourceRepo, path))); }
    catch (error) { if (error.code !== 'ENOENT') throw error; contentHash = 'deleted'; }
    sourceFiles.push({path, sha256: contentHash});
  }
  sourceFiles.sort((left, right) => left.path.localeCompare(right.path));
  const currentRevision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: sourceRepo, encoding: 'utf8'}).trim();
  if (options.sourceRoot) assert.equal(currentRevision, options.sourceRevision, 'production source pin changed');
  const branch = execFileSync('git', ['branch', '--show-current'], {cwd: sourceRepo, encoding: 'utf8'}).trim();
  const matrixSHA256 = sha256(await readFile(options.matrix));
  const harnessFiles = await Promise.all(['visual-state-audit-baseline.mjs', 'visual-state-audit-bounds.mjs'].map(async name => ({path: name, sha256: sha256(await readFile(new URL(name, import.meta.url)))})));
  const harnessSource = {root: repo, revision: execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'}).trim(), files: harnessFiles};
  return {
    productionRoot: sourceRepo,
    harnessSource,
    matrix: options.matrix,
    matrixSHA256,
    matrixSource: matrix.source || null,
    currentRevision,
    sourceTreeSHA256: sha256(Buffer.from(JSON.stringify({currentRevision, branch, matrixSHA256, sourceFiles, harnessFiles, productionRoot: sourceRepo, harnessSource}))),
    sourceFiles,
    harnessFiles,
    branch,
  };
}
const slug = value => value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100);
const sleepFrame = page => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));

async function listen(server) {
  await new Promise((accept, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', accept); });
  return server.address().port;
}

async function chromiumRSS(profileDir) {
  try {
    const {stdout} = await new Promise((accept, reject) => {
      const child = spawn('ps', ['-axo', 'pid=,rss=,command='], {stdio: ['ignore', 'pipe', 'pipe']});
      let stdout = '', stderr = '';
      child.stdout.on('data', data => stdout += data);
      child.stderr.on('data', data => stderr += data);
      child.once('error', reject);
      child.once('exit', code => code === 0 ? accept({stdout, stderr}) : reject(new Error(stderr)));
    });
    const rows = stdout.split('\n').filter(line => line.includes(profileDir));
    return {processCount: rows.length, rssBytes: rows.reduce((sum, line) => sum + Number(line.trim().split(/\s+/, 3)[1] || 0) * 1024, 0)};
  } catch (error) { return {processCount: null, rssBytes: null, error: String(error)}; }
}

async function processRSS(pid) {
  if (!pid) return 0;
  try {
    const {stdout} = await new Promise((accept, reject) => {
      const child = spawn('ps', ['-o', 'rss=', '-p', String(pid)], {stdio: ['ignore', 'pipe', 'pipe']});
      let stdout = '', stderr = '';
      child.stdout.on('data', data => stdout += data);
      child.stderr.on('data', data => stderr += data);
      child.once('error', reject);
      child.once('exit', code => code === 0 ? accept({stdout}) : reject(new Error(stderr)));
    });
    return Number(stdout.trim()) * 1024 || 0;
  } catch { return 0; }
}

async function assertEmptyOutput(output) {
  try { assert.equal((await readdir(output)).length, 0, `Evidence output must be empty; prior captures are immutable: ${output}`); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}

const errorsByCase = new Map();
let activeCaseId = null;
let familyErrors = [];
function addPageError(type, text) {
  if (!activeCaseId) { familyErrors.push({type, text}); return; }
  if (!errorsByCase.has(activeCaseId)) errorsByCase.set(activeCaseId, []);
  errorsByCase.get(activeCaseId).push({type, text});
}

let child, browser, context, runDir, outputDir, staticHTTPServer, staticDir, buildArtifactSHA256 = null, serverOutput = '';
let serverRssPeak = 0, nodeRssPeak = 0, chromiumRssPeak = 0;
let captureStartedAt = 0;
let captureSuccessCount = 0, captureFailureCount = 0;
let captureAttemptCount = 0, sourceDrift = null, sourceBase = null, selectedCaseCount = 0, profileRunStartedAt = null;
const productionAssets = new Map();
const casesWithErrors = new Set();
let currentThemeVerification = null;

try {
  const matrixBytes = await readFile(options.matrix);
  const matrix = JSON.parse(matrixBytes.toString('utf8'));
  if (options.sourceRoot) assert.equal(matrix.source?.revision, options.sourceRevision, 'matrix production revision pin mismatch');
  sourceBase = await sourceBaseSnapshot(matrixBytes, matrix);
  const currentRevision = sourceBase.currentRevision;
  const profile = profiles[options.profile];
  let cases = matrix.auditCases.filter(item => item.profileIds.includes(options.profile) && item.surface.includes(`${options.mode}-audit`));
  if (options.families.length) cases = cases.filter(item => options.families.includes(item.family));
  if (options.caseIds.length) cases = cases.filter(item => options.caseIds.includes(item.caseId) || options.caseIds.includes(item.componentIdentity));
  for (const id of options.contextCases) assert(cases.some(item => item.caseId === id || item.componentIdentity === id), `requested context case not selected: ${id}`);
  assert(cases.length > 0, 'filters selected no acceptance cases');
  assert.equal(sourceBase.matrixSHA256, sha256(matrixBytes), 'matrix changed while loading');
  if ((cases.length > batchSize || (!options.caseIds.length && !options.families.length)) && sourceBase.sourceFiles.length) {
    console.error(`Error: large profile captures require clean committed production inputs; dirty files: ${sourceBase.sourceFiles.map(item => item.path).join(', ')}`);
    process.exit(2);
  }
  selectedCaseCount = cases.length;
  profileRunStartedAt = new Date().toISOString();
  cases.sort((left, right) => left.family.localeCompare(right.family) || left.caseId.localeCompare(right.caseId));

  outputDir = options.output;
  await mkdir(outputDir, {recursive: true});
  await assertEmptyOutput(outputDir);

  runDir = await mkdtemp(join(tmpdir(), 'elysdui-visual-baseline-'));
  const userDataDir = join(runDir, 'chromium-profile');
  await mkdir(userDataDir);
  let origin = options.baseURL;
  if (!origin && options.mode === 'live') {
    const binary = join(runDir, 'gallery');
    const build = spawnSync('go', ['build', '-o', binary, './examples/gohtmx/gallery'], {cwd: sourceRepo, env: {...process.env, GOTOOLCHAIN: 'go1.26.9'}, encoding: 'utf8'});
    if (build.status !== 0) throw new Error(`Gallery build failed: ${build.stderr || build.stdout}`);
    buildArtifactSHA256 = sha256(await readFile(binary));
    const reservation = createServer();
    const port = await listen(reservation);
    await new Promise((accept, reject) => reservation.close(error => error ? reject(error) : accept()));
    child = spawn(binary, ['-addr', `127.0.0.1:${port}`], {cwd: sourceRepo, detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe']});
    child.stdout.on('data', data => serverOutput += data);
    child.stderr.on('data', data => serverOutput += data);
    origin = `http://127.0.0.1:${port}`;
    let ready = false;
    for (let i = 0; i < 300; i++) {
      if (child.exitCode !== null) throw new Error(`Gallery exited before ready: ${serverOutput}`);
      try { if ((await fetch(origin + '/components')).ok) { ready = true; break; } } catch {}
      await delay(50);
    }
    assert(ready, `Gallery startup timeout: ${serverOutput}`);
  } else if (!origin && options.mode === 'static') {
    staticDir = join(runDir, 'static');
    const exported = spawnSync('go', ['run', './cmd/ely-gallery-static', '-dir', staticDir, '-base', '/'], {cwd: sourceRepo, env: {...process.env, GOTOOLCHAIN: 'go1.26.9'}, encoding: 'utf8'});
    if (exported.status !== 0) throw new Error(`Static export failed: ${exported.stderr || exported.stdout}`);
    staticHTTPServer = createServer(async (request, response) => {
      try {
        let path = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
        if (path.endsWith('/')) path += 'index.html';
        const file = resolve(staticDir, `.${path}`);
        if (!file.startsWith(staticDir + sep)) { response.writeHead(403).end(); return; }
        const mime = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
        response.setHeader('Content-Type', mime[extname(file)] || 'application/octet-stream');
        response.end(await readFile(file));
      } catch { response.writeHead(404).end(); }
    });
    const port = await listen(staticHTTPServer);
    origin = `http://127.0.0.1:${port}`;
  }
  assert(/^https?:\/\//.test(origin), '--base-url must be an absolute http(s) URL');
  context = await chromium.launchPersistentContext(userDataDir, {
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined,
    viewport: profile.viewport,
    colorScheme: profile.colorScheme,
    deviceScaleFactor: profile.deviceScaleFactor,
    reducedMotion: 'reduce',
  });
  await context.addInitScript(mode => { localStorage.setItem('ely-palette', 'ely'); localStorage.setItem('ely-theme', mode); }, profile.colorScheme);
  browser = context.browser();
  captureStartedAt = Date.now();
  const page = context.pages()[0] || await context.newPage();
  page.on('console', message => { if (['error', 'warning'].includes(message.type())) addPageError(`console-${message.type()}`, message.text()); });
  page.on('pageerror', error => addPageError('pageerror', String(error)));
  page.on('requestfailed', request => addPageError('requestfailed', `${request.failure()?.errorText || 'failed'} ${request.url()}`));
  await page.route(/\/assets\/.*\.(?:css|js)(?:\?.*)?$/, route => {
    const path = new URL(route.request().url()).pathname;
    const loaded = fulfillAsset(route, page).catch(async error => {
      await route.abort().catch(() => {});
      return {path, error: String(error)};
    });
    if (!productionAssets.has(path)) productionAssets.set(path, loaded);
    return loaded;
  });
  page.on('response', response => {
    if (response.status() >= 400) addPageError('http', `${response.status()} ${response.url()}`);
  });

  let nextBatch = 1;
  let batch = [];
  let currentFamily = null;
  const verifySource = async checkpoint => {
    const actual = await sourceBaseSnapshot(matrixBytes, matrix);
    if (actual.sourceTreeSHA256 === sourceBase.sourceTreeSHA256) return true;
    sourceDrift = {checkpoint, expectedSourceTreeSHA256: sourceBase.sourceTreeSHA256, actualSourceTreeSHA256: actual.sourceTreeSHA256, detectedAt: new Date().toISOString(), actualSourceBase: actual};
    return false;
  };
  const familyPage = async family => {
    activeCaseId = null;
    familyErrors = [];
    console.log(`LOAD_FAMILY ${family}`);
    const url = options.mode === 'live' ? new URL('/components/audit', origin) : new URL(`/components/audit/${family}/aliases/`, origin);
    if (options.mode === 'live') { url.searchParams.set('aliases', '1'); url.searchParams.set('family', family); }
    const response = await page.goto(url.href, {waitUntil: 'domcontentloaded', timeout: 120000});
    assert(response?.ok(), `audit route ${family} returned ${response?.status()}`);
    await page.evaluate(() => document.fonts.ready);
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    const themeState = await page.evaluate(mode => {
      if (!window.ElyTheme) throw new Error('ElyTheme API did not load');
      window.ElyTheme.apply('ely', mode);
      const current = window.ElyTheme.current();
      const expected = window.ElyTheme.get('ely')[mode];
      const actual = Object.fromEntries(window.ElyTheme.tokens.map(token => [token, getComputedStyle(document.documentElement).getPropertyValue(`--${token}`).trim().toUpperCase()]));
      return {current, expected, actual};
    }, profile.colorScheme);
    assert.deepEqual(themeState.current, {id: 'ely', mode: profile.colorScheme}, 'actual project theme API must apply requested mode');
    for (const [token, value] of Object.entries(themeState.expected)) assert.equal(themeState.actual[token], value.toUpperCase(), `computed project theme token ${token}`);
    currentThemeVerification = {id: themeState.current.id, mode: themeState.current.mode, tokens: themeState.actual};
    return url.href;
  };
  const flush = async () => {
    if (!batch.length) return;
    const dirName = `batch-${String(nextBatch++).padStart(4, '0')}`;
    const batchDir = join(outputDir, dirName);
    await mkdir(batchDir);
    for (const item of batch) {
      if (item.png) await writeFile(join(batchDir, item.evidence.path.slice(dirName.length + 1)), item.png, {flag: 'wx'});
      if (item.contextPNG) await writeFile(join(batchDir, item.contextEvidence.path.slice(dirName.length + 1)), item.contextPNG, {flag: 'wx'});
    }
    const serializableCases = batch.map(({png, contextPNG, ...item}) => item);
    const receipt = {
      schemaVersion: 1,
      evidenceKind: 'initial-state-component-pixel-baseline',
      immutableBatch: true,
      batchId: dirName,
      sourceRevision: currentRevision,
      sourceTreeSHA256: sourceBase.sourceTreeSHA256,
      profile: {id: options.profile, renderMode: options.mode, viewport: profile.viewport, colorScheme: profile.colorScheme, deviceScaleFactor: profile.deviceScaleFactor},
      sourceBase,
      nodeVersion: process.version,
      buildArtifactSHA256,
      productionAssets: await Promise.all([...productionAssets.keys()].sort().map(async path => {
        const loaded = await productionAssets.get(path);
        try {
          const response = await fetch(new URL(path, origin));
          const bytes = Buffer.from(await response.arrayBuffer());
          const actualSHA256 = sha256(bytes);
          if (!response.ok || loaded.error || actualSHA256 !== loaded.sha256) sourceDrift ||= {checkpoint: 'asset-recheck', path, loaded, actualSHA256, status: response.status};
          return {...loaded, recheckStatus: response.status, recheckSHA256: actualSHA256};
        }
        catch (error) { sourceDrift ||= {checkpoint: 'asset-recheck', path, error: String(error)}; return {path, error: String(error)}; }
      })),
      goVersion: execFileSync('go', ['version'], {cwd: sourceRepo, env: {...process.env, GOTOOLCHAIN: 'go1.26.9'}, encoding: 'utf8'}).trim(),
      captureMethod: 'Playwright page clip of target root plus visible descendant and text overflow at CSS-pixel scale, respecting CSS clipping; target identity in every receipt; viewport context supplement for overflow/portals; no actions executed.',
      startedAt: batch[0].capturedAt,
      completedAt: new Date().toISOString(),
      caseCount: batch.length,
      capturedCount: batch.filter(item => item.captureStatus === 'captured').length,
      blockedCount: batch.filter(item => item.captureStatus !== 'captured').length,
      observedPeak: {chromiumRSSBytes: chromiumRssPeak || null, nodeRSSBytes: nodeRssPeak, serverRSSBytes: serverRssPeak || null},
      cases: serializableCases,
    };
    await writeFile(join(batchDir, 'receipts.json'), JSON.stringify(receipt, null, 2) + '\n', {flag: 'wx'});
    console.log(`BATCH_COMPLETE ${join(outputDir, dirName)} cases=${batch.length} captured=${receipt.capturedCount} blocked=${receipt.blockedCount} chromiumRSSMiB=${((chromiumRssPeak || 0) / 1048576).toFixed(1)}`);
    batch = [];
  };

  for (let index = 0; index < cases.length; index++) {
    if (index % batchSize === 0 && !(await verifySource(`before-case-${index + 1}`))) {
      console.error(`SOURCE_DRIFT ${JSON.stringify(sourceDrift)}`);
      break;
    }
    const item = cases[index];
    if (currentFamily !== item.family) {
      if (!(await verifySource(`before-family-${item.family}`))) {
        console.error(`SOURCE_DRIFT ${JSON.stringify(sourceDrift)}`);
        break;
      }
      currentFamily = item.family;
      await familyPage(currentFamily);
    }
    activeCaseId = item.caseId;
    captureAttemptCount++;
    errorsByCase.set(item.caseId, []);
    const caseSelector = `[data-audit-name=${JSON.stringify(item.componentIdentity)}]`;
    const record = page.locator(caseSelector);
    const result = {
      caseId: item.caseId,
      componentIdentity: item.componentIdentity,
      family: item.family,
      aliasMapping: item.aliasMapping,
      fixtureIdentity: item.fixtureIdentity,
      profile: {id: options.profile, viewport: profile.viewport, colorScheme: profile.colorScheme, deviceScaleFactor: profile.deviceScaleFactor},
      surface: `${options.mode}-audit primary fixture root`,
      actionCheckpoint: 'initial-render-before-interaction',
      sourceSHA: currentRevision,
      matrixSourceSHA: item.sourceSHA,
      referenceCitation: item.referenceCitation,
      captureStatus: 'blocked',
      behaviorStatus: 'not-run',
      visualStatus: 'pending',
      capturedAt: new Date().toISOString(),
      evidence: null,
      contextEvidence: null,
      error: null,
    };
    try {
      assert.equal(await record.count(), 1, `case record ${item.componentIdentity} must occur once on ${currentFamily} route`);
      const root = record.locator('[data-audit-main] > [data-ely-family]');
      assert.equal(await root.count(), 1, `primary component root missing for ${item.componentIdentity}`);
      await root.scrollIntoViewIfNeeded();
      await root.waitFor({state: 'attached', timeout: 15000});
      const readyBefore = await root.getAttribute('data-ely-ready');
      if (readyBefore !== null && readyBefore !== 'true') {
        try { await root.evaluate(node => new Promise((accept, reject) => {
          const start = Date.now();
          const poll = () => node.dataset.elyReady === 'true' ? accept() : Date.now() - start > 10000 ? reject(new Error('component readiness marker did not settle')) : setTimeout(poll, 25);
          poll();
        })); } catch (error) { throw new Error(`component mount unsettled (${String(error)})`); }
      }
      await page.evaluate(() => document.fonts.ready);
      await root.evaluate(async node => {
        await Promise.all([...node.querySelectorAll('img')].map(image => image.decode?.().catch(() => {}) || Promise.resolve()));
      });
      await sleepFrame(page);
      await root.scrollIntoViewIfNeeded();
      const metadata = await page.evaluate(({element, caseId}) => {
        const box = node => { const rect = node.getBoundingClientRect(); return {x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, right: rect.right, bottom: rect.bottom, left: rect.left}; };
        const visible = node => { const style = getComputedStyle(node), rect = node.getBoundingClientRect(); return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) !== 0 && rect.width > 0 && rect.height > 0; };
        const targetRecord = element.closest('[data-audit-name]');
        const overlays = [...document.querySelectorAll('dialog[open],[role="dialog"],[role="menu"],[role="listbox"],[data-ely-portal],[data-portal]')].filter(node => {
          if (!visible(node)) return false;
          const rect = node.getBoundingClientRect();
          return rect.bottom > 0 && rect.right > 0 && rect.top < innerHeight && rect.left < innerWidth;
        }).map(node => {
          const ownerRecord = node.closest('[data-audit-name]');
          const ownerReference = node.getAttribute('data-ely-owner') || node.getAttribute('aria-labelledby') || null;
          const targetRecordName = targetRecord?.getAttribute('data-audit-name') || caseId;
          const ownedByTarget = element.contains(node) || ownerRecord?.getAttribute('data-audit-name') === targetRecordName || Boolean(ownerReference && (ownerReference === element.id || ownerReference.startsWith(element.id + '-')));
          return {tag: node.tagName, role: node.getAttribute('role'), id: node.id || null, text: (node.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 300), bounds: box(node), insideComponent: element.contains(node), ownerRecord: ownerRecord?.getAttribute('data-audit-name') || null, ownerReference, ownedByTarget, ownershipStatus: ownedByTarget ? 'target-owned' : ownerRecord ? 'other-case' : 'ambiguous-external'};
        }).filter(overlay => overlay.ownedByTarget);
        const style = getComputedStyle(element);
        const faces = [...document.fonts].map(face => ({family: face.family, status: face.status, weight: face.weight, style: face.style}));
        const controlSelector = 'button,input,select,textarea,summary,a[href],[role="button"],[role="option"],[role="menuitem"],[role="switch"],[role="checkbox"],[role="radio"],[role="tab"],[role="combobox"],[tabindex],[contenteditable="true"],[data-ely-action],[data-ui-action],[data-ws-action],[data-native-action],[data-action]';
        const controlsInRoot = [...element.querySelectorAll(controlSelector)];
        const controls = controlsInRoot.filter(node => {
          const hasActionAttribute = [...node.attributes].some(attr => attr.name.startsWith('data-') && attr.name.includes('action'));
          return visible(node) || node.hidden || node.disabled || hasActionAttribute;
        }).slice(0, 300);
        const uniqueLocator = node => {
          const parts = [];
          let current = node;
          while (current && current !== element) {
            let part = current.localName;
            const sameTag = [...current.parentElement.children].filter(sibling => sibling.localName === current.localName);
            if (sameTag.length > 1) part += `:nth-of-type(${sameTag.indexOf(current) + 1})`;
            parts.unshift(part);
            current = current.parentElement;
          }
          return `:scope > ${parts.join(' > ')}`;
        };
        const controlsSnapshot = controls.map((node, index) => {
          const dataActionAttrs = Object.fromEntries([...node.attributes].filter(attr => attr.name.startsWith('data-') && attr.name.includes('action')).map(attr => [attr.name, attr.value.slice(0, 160)]));
          const ariaAttrs = Object.fromEntries([...node.attributes].filter(attr => attr.name.startsWith('aria-')).map(attr => [attr.name, attr.value.slice(0, 240)]));
          const labels = [...(node.labels || [])].map(label => (label.innerText || label.textContent || '').trim()).filter(Boolean);
          const labelledBy = node.getAttribute('aria-labelledby');
          const accessibleLabel = node.getAttribute('aria-label') || (labelledBy ? labelledBy.split(/\s+/).map(id => document.getElementById(id)?.innerText || '').join(' ').trim() : '') || labels.join(' ') || node.getAttribute('title') || (['BUTTON','SUMMARY','A'].includes(node.tagName) ? (node.innerText || '').trim() : '');
          const fingerprint = [node.localName, node.type || '', node.getAttribute('role') || '', node.name || '', node.getAttribute('data-ely-action') || node.getAttribute('data-ui-action') || node.getAttribute('data-ws-action') || node.getAttribute('data-native-action') || node.getAttribute('data-action') || '', accessibleLabel].join('|').toLowerCase().replace(/\s+/g, ' ').slice(0, 160);
          const groupSlug = fingerprint.replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'unnamed-control';
          const locator = uniqueLocator(node);
          const uniqueWithinComponent = element.querySelectorAll(locator).length === 1;
          return {uniqueLocator: locator, uniqueWithinComponent, groupId: `control-${groupSlug}`, index, tag: node.tagName.toLowerCase(), accessibleLabel: accessibleLabel.slice(0, 240), type: node.getAttribute('type'), role: node.getAttribute('role'), name: node.getAttribute('name'), value: ('value' in node ? String(node.value) : node.getAttribute('value'))?.slice(0, 300) ?? null, disabled: Boolean(node.disabled), readonly: Boolean(node.readOnly), hidden: Boolean(node.hidden), required: Boolean(node.required), min: node.getAttribute('min'), max: node.getAttribute('max'), step: node.getAttribute('step'), checked: 'checked' in node ? Boolean(node.checked) : null, selected: node.getAttribute('aria-selected'), dataActionAttrs, ariaAttrs, bounds: box(node)};
        });
        const svgRoots = [...(element.matches('svg') ? [element] : []), ...element.querySelectorAll('svg')];
        const invalidViewBoxes = [], malformedNumericGeometry = [];
        for (const [svgIndex, svg] of svgRoots.entries()) {
          const viewBox = svg.getAttribute('viewBox');
          if (viewBox !== null) {
            const parts = viewBox.trim().split(/[\s,]+/).filter(Boolean).map(Number);
            if (parts.length !== 4 || parts.some(value => !Number.isFinite(value)) || parts[2] <= 0 || parts[3] <= 0) invalidViewBoxes.push({svgIndex, value: viewBox, reason: 'expected four finite numbers with positive width and height'});
          }
          for (const [nodeIndex, node] of [...svg.querySelectorAll('*')].entries()) {
            for (const name of ['x','y','width','height','cx','cy','r','rx','ry','x1','y1','x2','y2','stroke-width','d','points']) {
              const value = node.getAttribute(name);
              if (value !== null && /(?:NaN|Infinity|undefined|null)/i.test(value)) malformedNumericGeometry.push({svgIndex, nodeIndex, tag: node.tagName.toLowerCase(), attribute: name, value: value.slice(0, 240)});
            }
          }
        }
        return {rootBounds: box(element), fixtureSnapshot: {recordSHA256: null, rootSHA256: null}, viewport: {width: innerWidth, height: innerHeight, devicePixelRatio}, scroll: {x: scrollX, y: scrollY, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight}, readyMarker: element.getAttribute('data-ely-ready'), fonts: {documentStatus: document.fonts.status, rootFamily: style.fontFamily, rootSize: style.fontSize, faces}, visibleOverlays: overlays, componentText: (element.innerText || '').trim().replace(/\s+/g, ' ').slice(0, 1200), controlInventory: {count: controlsInRoot.length, maxRows: 300, truncated: controlsInRoot.length > 300, controls: controlsSnapshot}, svgGeometryDiagnostics: {svgCount: svgRoots.length, invalidViewBoxes, malformedNumericGeometry}};
      }, {element: await root.elementHandle(), caseId: item.caseId});
      const fixtureHTML = await record.evaluate(node => ({record: node.outerHTML, root: node.querySelector('[data-audit-main] > [data-ely-family]')?.outerHTML || ''}));
      metadata.fixtureSnapshot = {recordSHA256: sha256(fixtureHTML.record), rootSHA256: sha256(fixtureHTML.root)};
      metadata.themeVerification = currentThemeVerification;
      const bounds = await root.evaluate(captureBounds);
      assert(bounds.visibleCount > 0 && bounds.clip.width > 0 && bounds.clip.height > 0, 'target has no visible painted bounds');
      metadata.captureBounds = bounds;
      metadata.captureIdentity = {requested: item.componentIdentity, rendered: await root.getAttribute('data-ely-component'), behaviorKey: item.aliasMapping?.behaviorKey || null, visualAssessment: 'pending; capture success is not a component visual pass'};
      result.actual = metadata;
      const caseSlug = slug(item.componentIdentity) || String(index + 1);
      const initialFile = `${String(index + 1).padStart(4, '0')}-${caseSlug}-initial.png`;
      if (batch.length >= batchSize) await flush();
      const batchName = `batch-${String(nextBatch).padStart(4, '0')}`;
      // Keep in-memory screenshot bytes only until this bounded batch is sealed.
      // Playwright's non-fullPage clip is viewport-relative; avoid deferred offscreen paint.
      const camera = captureCamera(bounds.clip, metadata.scroll, metadata.viewport);
      const png = await page.screenshot({...camera, animations: 'disabled', caret: 'hide', scale: 'css', timeout: 30000});
      assert.equal(png.readUInt32BE(16), bounds.clip.width, 'PNG width must match target capture bounds');
      assert.equal(png.readUInt32BE(20), bounds.clip.height, 'PNG height must match target capture bounds');
      result.evidence = {path: `${batchName}/${initialFile}`, bytes: png.length, sha256: sha256(png), crop: 'target root union visible descendant/text bounds; intentional CSS clipping retained', componentIdentity: item.componentIdentity};
      result.screenshotGeometry = {widthCSS: bounds.clip.width, heightCSS: bounds.clip.height, clip: bounds.clip, camera, coordinateSpace: 'document receipt; camera.clip is viewport-relative when fullPage=false', scale: 'css', deviceScaleFactor: metadata.viewport.devicePixelRatio};
      const overlayVisible = metadata.visibleOverlays.length > 0;
      const contextRequested = options.contextCases.includes(item.caseId) || options.contextCases.includes(item.componentIdentity);
      if (contextRequested || overlayVisible || bounds.extendsRoot || bounds.viewportTruncated || bounds.clippedCount) {
        const contextFile = `${String(index + 1).padStart(4, '0')}-${caseSlug}-initial-context.png`;
        const contextPNG = await page.screenshot({animations: 'disabled', caret: 'hide', scale: 'css', timeout: 30000});
        result.contextEvidence = {path: `${batchName}/${contextFile}`, bytes: contextPNG.length, sha256: sha256(contextPNG), componentIdentity: item.componentIdentity, explicitlyRequested: contextRequested, reason: 'explicit target request, overflow, clipping, viewport truncation or owned overlay; context is supplemental and does not establish a visual pass'};
        result.contextPNG = contextPNG;
      }
      result.png = png;
      result.captureStatus = 'captured';
      captureSuccessCount++;
      result.consoleAndErrors = {familyLoad: familyErrors, duringCaseCapture: errorsByCase.get(item.caseId)};
      if (result.consoleAndErrors.familyLoad.length || result.consoleAndErrors.duringCaseCapture.length) casesWithErrors.add(item.caseId);
      const rss = await chromiumRSS(userDataDir);
      if (rss.rssBytes !== null) chromiumRssPeak = Math.max(chromiumRssPeak, rss.rssBytes);
      serverRssPeak = Math.max(serverRssPeak, await processRSS(child?.pid));
      nodeRssPeak = Math.max(nodeRssPeak, process.memoryUsage().rss);
      batch.push(result);
      console.log(`CAPTURE ${index + 1}/${cases.length} ${item.caseId} ${result.captureStatus} root=${Math.round(metadata.rootBounds.width)}x${Math.round(metadata.rootBounds.height)} font=${metadata.fonts.documentStatus} overlays=${metadata.visibleOverlays.length} controls=${metadata.controlInventory.count} chromiumRSSMiB=${((rss.rssBytes || 0) / 1048576).toFixed(1)} familyErrors=${familyErrors.length} caseErrors=${result.consoleAndErrors.duringCaseCapture.length}`);
      if (batch.length >= batchSize) await flush();
    } catch (error) {
      result.error = String(error);
      result.consoleAndErrors = {familyLoad: familyErrors, duringCaseCapture: errorsByCase.get(item.caseId) || []};
      if (result.consoleAndErrors.familyLoad.length || result.consoleAndErrors.duringCaseCapture.length) casesWithErrors.add(item.caseId);
      result.captureStatus = 'blocked';
      result.behaviorStatus = 'not-run';
      captureFailureCount++;
      batch.push(result);
      console.error(`BLOCKED ${index + 1}/${cases.length} ${item.caseId}: ${result.error}`);
      if (batch.length >= batchSize) await flush();
    }
  }
  if (batch.length) await flush();
  const endingSourceBase = await sourceBaseSnapshot(matrixBytes, matrix);
  if (!sourceDrift && endingSourceBase.sourceTreeSHA256 !== sourceBase.sourceTreeSHA256) sourceDrift = {checkpoint: 'profile-end', expectedSourceTreeSHA256: sourceBase.sourceTreeSHA256, actualSourceTreeSHA256: endingSourceBase.sourceTreeSHA256, detectedAt: new Date().toISOString(), actualSourceBase: endingSourceBase};
  const profileStatus = sourceDrift ? 'stale' : captureFailureCount ? 'blocked' : captureAttemptCount === selectedCaseCount ? 'complete' : 'partial';
  if (sourceDrift || captureFailureCount || captureAttemptCount !== selectedCaseCount) process.exitCode = 1;
  await writeFile(join(outputDir, 'profile-summary.json'), JSON.stringify({schemaVersion: 1, status: profileStatus, profile: options.profile, mode: options.mode, sourceBase, endingSourceBase, sourceDrift, selected: selectedCaseCount, attempted: captureAttemptCount, captured: captureSuccessCount, blocked: captureFailureCount, unattempted: selectedCaseCount - captureAttemptCount, startedAt: profileRunStartedAt, completedAt: new Date().toISOString(), noActionsExecuted: true}, null, 2) + '\n', {flag: 'wx'});
  const elapsedSeconds = (Date.now() - captureStartedAt) / 1000;
  const attempted = captureAttemptCount;
  console.log(JSON.stringify({runKind: options.caseIds.length || options.families.length ? 'filtered-profile-capture' : 'profile-capture', status: profileStatus, selected: selectedCaseCount, attempted, captured: captureSuccessCount, blocked: captureFailureCount, unattempted: selectedCaseCount - attempted, sourceTreeSHA256: sourceBase.sourceTreeSHA256, profile: options.profile, elapsedSeconds: Math.round(elapsedSeconds), averageSecondsPerCase: attempted ? +(elapsedSeconds / attempted).toFixed(2) : null, chromiumPeakRSSMiB: +(chromiumRssPeak / 1048576).toFixed(1), nodePeakRSSMiB: +(nodeRssPeak / 1048576).toFixed(1), output: outputDir, noActionsExecuted: true, allVisualStatusesPending: true, casesWithConsoleOrErrors: casesWithErrors.size}, null, 2));
} finally {
  await context?.close();
  await browser?.close().catch(() => {});
  if (staticHTTPServer?.listening) await new Promise(resolve => staticHTTPServer.close(resolve));
  if (child?.pid && child.exitCode === null && child.signalCode === null) {
    const exited = new Promise(accept => child.once('exit', accept));
    if (process.platform === 'win32') child.kill('SIGTERM'); else process.kill(-child.pid, 'SIGTERM');
    await Promise.race([exited, delay(5000)]);
    if (child.exitCode === null && child.signalCode === null) {
      try { if (process.platform === 'win32') child.kill('SIGKILL'); else process.kill(-child.pid, 'SIGKILL'); } catch {}
      await Promise.race([exited, delay(1000)]);
    }
  }
  if (runDir) await rm(runDir, {recursive: true, force: true});
  let tempRemoved = !runDir;
  if (runDir) try { await access(runDir); } catch (error) { if (error.code === 'ENOENT') tempRemoved = true; else throw error; }
  const cleanup = {ownedServerPID: child?.pid || null, ownedServerStopped: !child || child.exitCode !== null || child.signalCode !== null, staticServerStopped: !staticHTTPServer?.listening, browserClosed: !browser?.isConnected(), tempRemoved};
  if (runDir && outputDir) await writeFile(join(outputDir, 'cleanup.json'), JSON.stringify(cleanup, null, 2) + '\n', {flag: 'wx'});
  assert(Object.entries(cleanup).filter(([key]) => key !== 'ownedServerPID').every(([, value]) => value), 'owned-resource cleanup did not complete');
}
