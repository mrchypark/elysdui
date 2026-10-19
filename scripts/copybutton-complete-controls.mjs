import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {copyMode, copyModes, copyMutants, verifyCopyMutation} from '../ui/gohtmx/tests/browser/copybutton-complete-mutants.mjs';
import {copySHA} from '../ui/gohtmx/tests/browser/copybutton-complete-inputs.mjs';
import {verifyCopyEvidence} from '../ui/gohtmx/tests/browser/copybutton-complete-evidence.mjs';
import {runCopyEvidence, verifyProcessEvidence, verifyCopyScreenshots} from './copybutton-complete-run.mjs';

const appearance = ['appearance-light', 'appearance-dark'];
const expectedFailures = Object.freeze({
  control: [],
  'copied-lockout': ['holds-to-1399','resets-at-1400','copied-locked','fresh-cycle','replayed.rotation-animation','replayed.motion-duration','replayed.motion-runs','replayed.cubic-ease-out'].map(id => 'repeat-lockout.' + id),
  'captured-action': ['captured-payload.copied.one-action'],
  'completion-owner': ['pending-rebind.old-completion-silent','child-moved.old-completion-silent','child-replaced.old-completion-silent','htmx-inner-pending.old-completion-silent','htmx-inner-pending.replacement-usable','htmx-control-pending.old-completion-silent','htmx-control-pending.replacement-usable','same-node-remount.old-completion-silent','same-node-remount.fresh-mount-usable'],
  'stale-timer-defenses': ['moved-copied.old-reset-cannot-clear-new'],
  'default-radius': appearance.map(id => id + '.default-radius'),
  'check-color': [...appearance, 'reduced-motion', 'narrow-zoom'].map(id => id + '.copied.success-color'),
  'motion-duration': [...appearance.map(id => id + '.copied.motion-duration'), ...['exact-timing','repeat-lockout'].flatMap(id => ['copied','replayed'].map(checkpoint => id + '.' + checkpoint + '.motion-duration'))],
});
export function copyCausalFailures(externalMode) {
  copyMode(externalMode);
  return [...expectedFailures[externalMode]].sort();
}
const positives = [
  'activation-pointer.copied.one-write', 'activation-pointer.copied.one-action', 'activation-pointer.copied.one-change',
  'activation-enter.intended-native-input', 'activation-space.intended-native-input',
  'failure-reject.retry-success', 'failure-throw.retry-success', 'failure-missing.retry-success',
  'roots-independent.exact-independent-events', 'items-independent.exact-independent-events',
  'pending-rebind.fresh-owner-usable', 'child-moved.fresh-owner-usable', 'child-replaced.fresh-owner-usable',
  'explicit-override.copied.one-action', 'real-clipboard.real-roundtrip', 'adapter.copied.one-action',
];

function verifyResetWitness(report, externalMode) {
  const check = report.checks.find(check => check.id === 'moved-copied'), {log, snapshots} = check.raw;
  const snapshot = name => snapshots.find(snapshot => snapshot.name === name);
  const old = snapshot('old-copied'), fresh = snapshot('fresh'), deadline = snapshot('old-deadline');
  const oldControl = old.roots['#copy-a'].controls[0], newControl = fresh.roots['#copy-b'].controls[1];
  assert.equal(oldControl.token, newControl.token, 'reset witness retains physical control');
  assert.equal(oldControl.copied, 'true'); assert.equal(newControl.copied, 'true');
  const timers = log.filter(row => row.type === 'timer' && row.event === 'scheduled' && row.control === oldControl.token);
  assert.equal(timers.length, 2, 'two real success-owned reset schedules');
  const [first, second] = timers;
  const timerRows = log.filter(row => row.type === 'timer');
  assert(timerRows.every(row => timers.some(schedule => row.timer === schedule.timer)), 'no foreign reset timer records');
  assert.equal(new Set(timers.map(schedule => schedule.timer)).size, 2, 'unique old and new timer identities');
  for (const [index, schedule] of timers.entries()) {
    const rows = timerRows.filter(row => row.timer === schedule.timer);
    const expected = index === 0 && externalMode !== 'stale-timer-defenses' ? ['scheduled','cancelled'] : ['scheduled','fired','completed'];
    assert.deepEqual(rows.map(row => row.event), expected, 'exact success-owned timer lifecycle');
    for (const row of rows) {
      for (const key of ['timer','delay','call','control','root']) assert.equal(row[key], schedule[key], 'timer event belongs to its unique schedule: ' + key);
      assert(row.sequence >= schedule.sequence && row.time >= schedule.time, 'timer lifecycle follows schedule');
      if (row.event === 'fired' || row.event === 'completed') assert.equal(row.time, schedule.time + schedule.delay, 'actual reset callback exact deadline');
    }
    assert.equal(rows[0].currentRoot, schedule.root, 'schedule occurs in its own physical root');
    if (expected.includes('fired')) assert(rows[1].sequence < rows[2].sequence, 'callback completion follows firing');
    else assert(rows[1].time < schedule.time + schedule.delay, 'cancellation precedes original deadline');
  }
  for (const schedule of timers) {
    const call = log.find(row => row.type === 'clipboard-call' && row.sequence === schedule.call);
    assert(call && call.control === schedule.control && call.root === schedule.root, 'timer joins its actual clipboard/control/root');
    assert(log.some(row => row.type === 'clipboard-settle' && row.call === call.sequence && row.outcome === 'resolve' && row.sequence < schedule.sequence && row.time === schedule.time), 'timer follows its own resolved write at the actual success time');
    assert(log.some(row => row.type === 'event' && row.event === 'ely:change' && row.detail.copied === true && row.target === schedule.root && row.sequence > schedule.sequence), 'timer has observed own successful notification');
    assert.equal(schedule.delay, 1400); assert.equal(schedule.copied, 'true');
  }
  assert.equal(second.time - first.time, 200, 'new owner clock starts 200ms later');
  assert.equal(deadline.time - first.time, 1400, 'old timer exact deadline');
  assert(second.time + second.delay > deadline.time, 'new owner reset remains later');
  const oldFires = log.filter(row => row.type === 'timer' && row.timer === first.timer && row.event === 'fired');
  if (externalMode === 'stale-timer-defenses') {
    assert.equal(oldFires.length, 1, 'old timer actually fires');
    assert.equal(oldFires[0].time, deadline.time); assert.equal(oldFires[0].currentRoot, second.root); assert.equal(oldFires[0].copied, 'true');
    const completed = log.filter(row => row.type === 'timer' && row.timer === first.timer && row.event === 'completed');
    assert.equal(completed.length, 1); assert.equal(completed[0].time, deadline.time);
    assert.equal(completed[0].currentRoot, second.root); assert.equal(completed[0].copied, null, 'old callback removes the newer success marker');
    assert.equal(deadline.roots['#copy-b'].controls[1].copied, null);
  } else {
    assert.deepEqual(oldFires, [], 'clean timer cancellation prevents old callback');
    assert.equal(log.filter(row => row.type === 'timer' && row.timer === first.timer && row.event === 'cancelled').length, 1);
    assert.equal(deadline.roots['#copy-b'].controls[1].copied, 'true', 'new owner survives original deadline');
  }
}

// This is a classification step AFTER the sole strict evidence gate. It never
// accepts report-selected modes, missing witnesses, arbitrary failures, or a
// full-suite cached pass. Unrelated passive diagnostics need not equal control.
export function verifyCopyCausalOutcome(report, trusted, rawExit, externalMode) {
  copyMode(externalMode); verifyCopyMutation(trusted, externalMode);
  const evidence = verifyCopyEvidence(report, trusted, rawExit);
  const expected = copyCausalFailures(externalMode), all = report.checks.flatMap(check => check.oracles);
  assert.deepEqual([...evidence.failedAssertions].sort(), expected, 'exact source-owned designated failures; every other desired assertion must pass');
  for (const oracle of all.filter(oracle => oracle.prerequisite)) assert.equal(oracle.pass, true, 'all positive prerequisites remain required: ' + oracle.id);
  for (const id of positives) assert(all.some(oracle => oracle.id === id && oracle.pass), 'independent positive control: ' + id);
  verifyResetWitness(report, externalMode);
  assert.equal(rawExit, externalMode === 'control' ? 0 : 1, 'mutant raw exit must remain one');
  assert.equal(report.status, externalMode === 'control' ? 'passed' : 'failed');
  assert.equal(report.checks.length, 41, 'finite full 41-case contract, never a mutant subset');
  return {mode: externalMode, outcome: externalMode === 'control' ? 'passed' : 'killed', rawExit, failedAssertions: expected, positiveControls: [...positives]};
}

export async function verifyCopyCausalRun(capture, trusted, externalMode, readScreenshot) {
  // The caller supplies externally bound current inputs and actual process
  // bytes. No alternate acceptance path or weaker mutant report schema.
  const processEvidence = verifyProcessEvidence(capture, trusted);
  const report = JSON.parse(Buffer.from(capture.reportBytes).toString('utf8'));
  const outcome = verifyCopyCausalOutcome(report, trusted, capture.exit.status, externalMode);
  const screenshotEvidence = await verifyCopyScreenshots(report, readScreenshot);
  return {outcome, processEvidence, screenshotEvidence};
}

export async function runCopyControls(base) {
  assert.equal(process.env.CI, 'true', 'browser execution is restricted to CI');
  const results = [], failures = [], runTokens = new Set();
  let common = null;
  for (const mode of copyModes) {
    try {
      const {status, receipt, report, invocation} = await runCopyEvidence(base, mode);
      // runCopyEvidence already validates exact current inputs, actual process
      // bytes, report, every PNG, and an independent after-child source rebuild.
      const current = Object.fromEntries(['revision','tree','dirty','sourceFiles','fixtures','toolchain','dependencyProof'].map(key => [key, invocation[key]]));
      if (common) assert.deepEqual(current, common, 'all modes must use one exact committed source and toolchain');
      else common = current;
      assert(!runTokens.has(invocation.runToken), 'each full browser run needs a fresh invocation UUID'); runTokens.add(invocation.runToken);
      const outcome = verifyCopyCausalOutcome(report, invocation, status, mode);
      results.push({...outcome, validationDigestSHA256: receipt.digestSHA256, runToken: receipt.runToken});
    } catch (error) { failures.push({mode, error: String(error.stack || error)}); }
  }
  assert.deepEqual(results.map(result => result.mode).concat(failures.map(result => result.mode)).sort(), [...copyModes].sort(), 'all finite modes attempted');
  const receipt = {schema: 'copybutton-causal-controls-v1', revision: common?.revision ?? null, tree: common?.tree ?? null, status: failures.length ? 'failed' : 'passed', modes: [...copyModes], results, failures, limitations: 'Seven bounded transformations; stale-timer-defenses combines cancellation and identity reversal. No independent cancellation-vs-identity, icon-only or check-glyph sensitivity claim.'};
  receipt.digestSHA256 = copySHA(JSON.stringify(receipt));
  const output = join(base, 'test-results/copybutton-complete-controls'); await mkdir(output, {recursive: true});
  await writeFile(join(output, 'aggregate.json'), JSON.stringify(receipt, null, 2) + '\n');
  console.log(JSON.stringify(receipt));
  return {status: failures.length ? 1 : 0, receipt};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { process.exitCode = (await runCopyControls(fileURLToPath(new URL('../', import.meta.url)))).status; }
  catch (error) { console.error(error.stack || error); process.exitCode = 1; }
}
