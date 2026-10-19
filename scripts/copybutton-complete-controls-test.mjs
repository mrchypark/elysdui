import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {join, resolve} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {buildCopySchemaFixture} from './copybutton-complete-evidence-test.mjs';
import {testCopyTimerObserver} from './copybutton-complete-timers-test.mjs';
import {copyCases} from '../ui/gohtmx/tests/browser/copybutton-complete-cases.mjs';
import {copyOracles} from '../ui/gohtmx/tests/browser/copybutton-complete-evidence.mjs';
import {copySHA, loadCopyInputs} from '../ui/gohtmx/tests/browser/copybutton-complete-inputs.mjs';
import {copyModes, copyMutants, copyMode, transformCopySource} from '../ui/gohtmx/tests/browser/copybutton-complete-mutants.mjs';
import {copyCausalFailures, verifyCopyCausalRun} from './copybutton-complete-controls.mjs';

const base = fileURLToPath(new URL('../', import.meta.url));
const clone = value => structuredClone(value);
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aJZkAAAAASUVORK5CYII=', 'base64');
const rederive = report => {
  for (const check of report.checks) { check.oracles = copyOracles(check); check.status = check.oracles.every(oracle => oracle.pass) ? 'passed' : 'failed'; }
  report.status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed'; return report;
};
function rewriteLog(check, {before = new Map(), remove = new Set()} = {}) {
  const rows = [], mapping = new Map();
  for (const row of check.raw.log) { for (const added of before.get(row.sequence) || []) rows.push({...added, sequence: null}); if (!remove.has(row.sequence)) rows.push(row); }
  for (const [index, row] of rows.entries()) { if (row.sequence !== null) mapping.set(row.sequence, index + 1); }
  for (const [index, row] of rows.entries()) { row.sequence = index + 1; for (const key of ['input','call']) if (row[key] != null) row[key] = mapping.get(row[key]); }
  for (const snapshot of check.raw.snapshots) snapshot.sequence = mapping.get(snapshot.sequence);
  check.raw.log = rows;
}
function addResetTrace(report, mutant = false) {
  const check = report.checks.find(check => check.id === 'moved-copied'), {log, snapshots} = check.raw, before = new Map();
  const snap = name => snapshots.find(snapshot => snapshot.name === name);
  const calls = log.filter(row => row.type === 'clipboard-call');
  const add = (sequence, rows) => before.set(sequence, [...before.get(sequence) || [], ...rows]);
  const timer = (index, event, time, copied, currentRoot = calls[index].root) => ({time, type: 'timer', event, timer: index + 1, delay: 1400, call: calls[index].sequence, control: calls[index].control, root: calls[index].root, currentRoot, copied});
  for (const [index, call] of calls.entries()) {
    const settlement = log.find(row => row.type === 'clipboard-settle' && row.call === call.sequence);
    add(settlement.sequence + 1, [timer(index, 'scheduled', settlement.time, 'true')]);
  }
  if (mutant) add(snap('old-deadline').sequence - 1, [timer(0, 'fired', snap('old-deadline').time, 'true', calls[1].root), timer(0, 'completed', snap('old-deadline').time, null, calls[1].root)]);
  else add(calls[1].sequence, [timer(0, 'cancelled', calls[1].time, null, calls[1].root)]);
  add(snap('new-deadline').sequence - 1, [timer(1, 'fired', snap('new-deadline').time, mutant ? null : 'true'), timer(1, 'completed', snap('new-deadline').time, null)]);
  rewriteLog(check, {before});
}
function syntheticDeviation(report, mode) {
  const check = id => report.checks.find(check => check.id === id), snapshot = (id, name) => check(id).raw.snapshots.find(snapshot => snapshot.name === name);
  if (mode === 'captured-action') check('captured-payload').raw.log.find(row => row.type === 'event' && row.event === 'ely:action').detail.action = 'changed-action';
  if (mode === 'default-radius') for (const id of ['appearance-light','appearance-dark']) snapshot(id, 'idle').roots['#copy-a'].controls[0].style.borderRadius = '7px';
  if (mode === 'check-color' || mode === 'motion-duration') for (const c of report.checks) {
    for (const s of c.raw.snapshots) for (const root of Object.values(s.roots)) for (const button of root.controls) for (const icon of button.icons) {
      if (mode === 'check-color' && icon.name === 'check') icon.style.color = root.themeForeground;
      if (mode === 'motion-duration') for (const animation of icon.animations) if (animation.timing.duration === 120) animation.timing.duration = 121;
    }
    if (mode === 'motion-duration') for (const row of c.raw.log.filter(row => row.type === 'animation')) for (const animation of row.animations) if (animation.timing.duration === 120) animation.timing.duration = 121;
  }
  if (mode === 'stale-timer-defenses') snapshot('moved-copied','old-deadline').roots['#copy-b'].controls[1].copied = null;
  if (mode === 'completion-owner') for (const id of ['pending-rebind','child-moved','child-replaced','htmx-inner-pending','htmx-control-pending','same-node-remount']) {
    const c = check(id), settlement = c.raw.log.find(row => row.type === 'clipboard-settle');
    const action = clone(c.raw.log.find(row => row.type === 'event' && row.event === 'ely:action'));
    action.time = settlement.time; action.target = c.raw.snapshots[0].roots['#copy-a'].token;
    action.rootID = c.raw.snapshots[0].roots['#copy-a'].id; action.detail.id = action.rootID;
    rewriteLog(c, {before: new Map([[settlement.sequence + 1, [action]]])});
    if (id === 'same-node-remount') snapshot(id,'settled').roots['#copy-a'].controls[0].copied = 'true';
  }
  if (mode === 'copied-lockout') {
    const c = check('repeat-lockout'), {log, snapshots} = c.raw;
    const copied = snapshots.find(snapshot => snapshot.name === 'copied'), repeat = snapshots.find(snapshot => snapshot.name === 'repeated-copied'), replay = snapshots.find(snapshot => snapshot.name === 'replayed');
    const input = log.find(row => row.type === 'input' && row.event === 'click' && row.sequence > copied.sequence && row.sequence < repeat.sequence);
    const first = log.find(row => row.type === 'clipboard-call'), fresh = log.findLast(row => row.type === 'clipboard-call');
    const remove = new Set(log.filter(row => row.sequence >= fresh.sequence && (row.type === 'clipboard-call' || row.type === 'clipboard-settle' || row.type === 'event' || row.type === 'animation')).map(row => row.sequence));
    // The original real first-cycle start survives even though copied-phase
    // reentry starts an unresolved write and blocks the deadline replay.
    const firstStart = {time: copied.time, type: 'animation', event: 'animationstart', control: first.control, root: first.root, call: first.sequence, pseudo: '', icon: 'check', animations: clone(copied.roots['#copy-a'].controls[0].icons.find(icon => icon.name === 'check').animations)};
    rewriteLog(c, {before: new Map([[copied.sequence - 1, [firstStart]], [input.sequence + 1, [{...first, time: input.time, input: input.sequence}]]]), remove});
    for (const snapshot of snapshots.filter(snapshot => ['repeated-copied','before-deadline','deadline','replayed'].includes(snapshot.name))) {
      const root = snapshot.roots['#copy-a'], button = root.controls[0]; button.copied = null; button.busy = 'true'; button.icons = clone(snapshots[0].roots['#copy-a'].controls[0].icons); root.statuses[0].text = '';
    }
  }
}
function captureFor(report, trusted, extra = {}) {
  const reportBytes = Buffer.from(JSON.stringify(report));
  const completion = {copybuttonCompletion: 1, runToken: trusted.runToken, reportSHA256: copySHA(reportBytes), status: report.status};
  return {reportBytes, stdout: Buffer.from(JSON.stringify(completion) + '\n'), stderr: Buffer.alloc(0), exit: {schema: 'copybutton-process-exit-v1', runToken: trusted.runToken, revision: trusted.revision, tree: trusted.tree, status: report.status === 'passed' ? 0 : 1, signal: null, error: null, truncated: false}, ...extra};
}
export async function syntheticFixture(mode) {
  const {report, trusted} = buildCopySchemaFixture();
  report.checks[0].raw.snapshots[0].roots['#copy-a'].controls[0].visibleText = '';
  trusted.mode = mode; trusted.mutation = null;
  if (mode !== 'control') {
    const spec = copyMutants[mode], source = await readFile(join(base, 'ui/gohtmx' + spec.asset));
    const transformed = transformCopySource(source, mode);
    trusted.mutation = transformed.mutation; trusted.sourceFiles[transformed.mutation.source] = copySHA(source);
    trusted.assets[spec.asset] = {sourceSHA256: copySHA(source), servedSHA256: copySHA(transformed.body), bytes: transformed.body.length, contentType: spec.asset.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'};
  }
  Object.assign(report, clone(trusted));
  for (const response of report.responses) { const meta = trusted.assets[response.path] || trusted.fixtures[response.path]; response.sha256 = meta.servedSHA256; response.bytes = meta.bytes; }
  syntheticDeviation(report, mode); addResetTrace(report, mode === 'stale-timer-defenses'); rederive(report);
  const screenshots = new Map();
  for (const check of report.checks) for (const screenshot of Object.values(check.raw.screenshots)) { screenshot.bytes = png.length; screenshot.sha256 = copySHA(png); screenshots.set(screenshot.path, png); }
  return {report, trusted, capture: captureFor(report, trusted), readScreenshot: async path => { assert(screenshots.has(path)); return screenshots.get(path); }};
}

export async function corruptCopyCausalEvidence({report, trusted, capture, readScreenshot}, mode) {
  const accepted = await verifyCopyCausalRun(capture, trusted, mode, readScreenshot);
  let rejected = 0;
  const reject = async (label, change, {derive = false} = {}) => {
    const candidate = clone(report); change(candidate); if (derive) rederive(candidate);
    await assert.rejects(() => verifyCopyCausalRun(captureFor(candidate, trusted), trusted, mode, readScreenshot), undefined, label); rejected++;
  };
  for (const [index, spec] of copyCases.entries()) {
    await reject('missing case ' + spec.id, r => r.checks.splice(index, 1));
    await reject('duplicate case ' + spec.id, r => r.checks.splice(index, 0, clone(r.checks[index])));
    await reject('foreign case ' + spec.id, r => { r.checks[index].id = 'foreign'; });
    await reject('missing native input ' + spec.id, r => { for (const row of r.checks[index].raw.log) if (row.type === 'input') row.trusted = false; }, {derive: true});
    if (report.checks[index].raw.log.some(row => row.type === 'clipboard-settle')) await reject('lost settlement association ' + spec.id, r => { r.checks[index].raw.log.find(row => row.type === 'clipboard-settle').call = -1; }, {derive: true});
    await reject('browser error ' + spec.id, r => r.checks[index].raw.errors.push('unexpected'));
    await reject('cached desired pass ' + spec.id, r => { r.checks[index].oracles[0].pass = !r.checks[index].oracles[0].pass; });
    for (const name of spec.checkpoints) await reject('missing checkpoint ' + spec.id + '.' + name, r => { r.checks[index].raw.snapshots = r.checks[index].raw.snapshots.filter(snapshot => snapshot.name !== name); });
  }
  await reject('report-selected mode', r => { r.mode = mode === 'control' ? 'default-radius' : 'control'; });
  await reject('early report exit', r => { r.stage = 'starting'; });
  await reject('stale cached pass', r => { r.status = r.status === 'passed' ? 'failed' : 'passed'; });
  await reject('missing required reset trace', r => { r.checks.find(check => check.id === 'moved-copied').raw.log.find(row => row.type === 'timer' && row.event === 'scheduled').event = 'completed'; });
  const timerEvents = report.checks.find(check => check.id === 'moved-copied').raw.log.filter(row => row.type === 'timer');
  for (const event of ['fired','completed']) for (const key of ['call','control','root','timer','delay']) {
    const target = timerEvents.find(row => row.event === event);
    await reject('timer ' + event + ' wrong ' + key, r => { r.checks.find(check => check.id === 'moved-copied').raw.log.find(row => row.sequence === target.sequence)[key] = 999; });
  }
  await reject('timer callback chronology', r => { r.checks.find(check => check.id === 'moved-copied').raw.log.find(row => row.type === 'timer' && row.event === 'fired').event = 'completed'; });
  await reject('timer cancelled and fired', r => { r.checks.find(check => check.id === 'moved-copied').raw.log.find(row => row.type === 'timer' && row.event === 'completed').event = 'cancelled'; });
  await reject('unrelated desired regression', r => { r.checks.find(check => check.id === 'appearance-light').raw.snapshots[0].roots['#copy-a'].controls[0].style.cursor = 'default'; }, {derive: true});
  if (mode !== 'control') {
    await reject('missing mutation receipt', r => { r.mutation = null; });
    await reject('wrong served mutation hash', r => { r.mutation.servedSHA256 = '0'.repeat(64); });
    const repaired = clone(report), firstFailure = copyCausalFailures(mode)[0];
    repaired.checks.flatMap(check => check.oracles).find(oracle => oracle.id === firstFailure).pass = true;
    await assert.rejects(() => verifyCopyCausalRun(captureFor(repaired, trusted), trusted, mode, readScreenshot)); rejected++;
  }
  for (const [label, change] of [
    ['missing completion', c => { c.stdout = Buffer.alloc(0); }],
    ['duplicate completion', c => { c.stdout = Buffer.concat([c.stdout, c.stdout]); }],
    ['stale token', c => { c.exit.runToken = '00000000-0000-4000-8000-000000000099'; }],
    ['wrong raw exit', c => { c.exit.status = c.exit.status === 0 ? 1 : 0; }],
    ['early child signal', c => { c.exit.signal = 'SIGTERM'; }],
    ['truncated output', c => { c.exit.truncated = true; }],
    ['stderr error', c => { c.stderr = Buffer.from('unexpected error'); }],
    ['changed report bytes', c => { c.reportBytes = Buffer.concat([c.reportBytes, Buffer.from(' ')]); }],
  ]) { const candidate = {...capture, exit: clone(capture.exit)}; change(candidate); await assert.rejects(() => verifyCopyCausalRun(candidate, trusted, mode, readScreenshot), undefined, label); rejected++; }
  for (const read of [async () => { throw new Error('missing PNG'); }, async path => Buffer.concat([await readScreenshot(path), Buffer.from('corrupt')])]) {
    await assert.rejects(() => verifyCopyCausalRun(capture, trusted, mode, read)); rejected++;
  }
  for (const foreignMode of copyModes.filter(value => value !== mode)) { await assert.rejects(() => verifyCopyCausalRun(capture, trusted, foreignMode, readScreenshot)); rejected++; }
  return {mode, accepted: accepted.outcome, screenshotCount: accepted.screenshotEvidence.screenshots, rejectedCorruptions: rejected};
}

export async function testCopyCausalSchema() {
  assert.throws(() => copyMode('foreign')); assert.throws(() => copyMode(''));
  const transformations = [];
  for (const mode of copyModes.slice(1)) {
    const spec = copyMutants[mode], source = await readFile(join(base, 'ui/gohtmx' + spec.asset)), before = Buffer.from(source);
    const transformed = transformCopySource(source, mode); assert(source.equals(before), 'committed source remains unchanged');
    assert.equal(transformed.body.toString(), source.toString().replace(spec.before, spec.after));
    assert.throws(() => transformCopySource(Buffer.from('missing'), mode));
    assert.throws(() => transformCopySource(Buffer.from(source.toString() + spec.before), mode));
    assert.throws(() => transformCopySource(transformed.body, mode));
    transformations.push({mode, sourceSHA256: copySHA(source), servedSHA256: copySHA(transformed.body), replacements: 1});
  }
  const blockedReplay = await syntheticFixture('copied-lockout');
  const blockedCase = blockedReplay.report.checks.find(check => check.id === 'repeat-lockout');
  assert.equal(blockedCase.raw.log.filter(row => row.type === 'animation' && row.event === 'animationstart').length, 1, 'original first-cycle start survives blocked replay');
  assert.equal(blockedCase.raw.log.filter(row => row.type === 'clipboard-settle' && row.outcome === 'resolve').length, 1, 'blocked replay has no fresh resolved write');
  for (const suffix of ['rotation-animation','motion-duration','motion-runs','cubic-ease-out']) assert.equal(blockedCase.oracles.find(oracle => oracle.id === 'repeat-lockout.replayed.' + suffix).pass, false, 'old first-cycle start cannot certify fresh replay ' + suffix);
  const modes = [];
  for (const mode of copyModes) {
    modes.push(await corruptCopyCausalEvidence(await syntheticFixture(mode), mode));
    console.log(JSON.stringify({copybuttonSyntheticCausalMode: mode, rejectedCorruptions: modes.at(-1).rejectedCorruptions}));
  }
  return {sourceOnly: true, classification: 'synthetic schema/process/PNG examples only; no browser or production behavior credit', modes, transformations, timerObserver: testCopyTimerObserver()};
}

// Replays actual downloaded CI artifacts with independent current-source inputs.
// The caller must check out that exact CI revision and explicitly select mode;
// report/receipt metadata cannot select its own acceptance policy.
export async function testActualCopyCausalArtifacts(directory, mode) {
  copyMode(mode);
  const {assetBodies, fixtureBodies, ...current} = await loadCopyInputs(base, mode);
  assert.equal(current.dirty, '', 'actual artifact replay requires exact clean source');
  const invocation = JSON.parse(await readFile(join(directory, 'invocation.json'), 'utf8'));
  assert.deepEqual(invocation, {...current, runToken: invocation.runToken}, 'actual CI invocation binds independent current source');
  const capture = {reportBytes: await readFile(join(directory, 'report.json')), stdout: await readFile(join(directory, 'stdout.log')), stderr: await readFile(join(directory, 'stderr.log')), exit: JSON.parse(await readFile(join(directory, 'exit.json'), 'utf8'))};
  const report = JSON.parse(capture.reportBytes.toString('utf8'));
  return {classification: 'actual CI artifact corruption replay; no new browser execution', ...await corruptCopyCausalEvidence({report, trusted: invocation, capture, readScreenshot: path => readFile(join(directory, path))}, mode)};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  if (args.length) { assert.equal(args.length, 4); assert.equal(args[0], '--artifacts'); assert.equal(args[2], '--mode'); console.log(JSON.stringify(await testActualCopyCausalArtifacts(resolve(args[1]), args[3]))); }
  else console.log(JSON.stringify(await testCopyCausalSchema()));
}
