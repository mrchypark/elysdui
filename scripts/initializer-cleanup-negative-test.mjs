import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';

// Each independent control changes exactly one unique production-source anchor.
// The entire mutated core runs in the same VM as its designated positive test.
const source = readFileSync('ui/gohtmx/assets/ely-api.js', 'utf8');
const test = 'ui/gohtmx/tests/unit/initializer_cleanup_test.mjs';
const registration = 'registerCleanup(initialize(root, registerCleanup));';
const dedupe = "if (typeof cleanup !== 'function' || registeredCleanups.has(cleanup)) return;";
const identity = 'if (mounted.get(root) === cleanups) cleanups.push(cleanup);';
const isolation = 'function dispose(root, cleanup) {\n  try { cleanup(); }\n  catch (error) {';
const controls = [
  {
    name: 'legacy-return', from: registration, to: 'initialize(root, registerCleanup);',
    check: 'I1.one-argument initializers retain returned-cleanup compatibility',
    oracle: 'legacy returned cleanup runs on stop',
  },
  {
    name: 'initializer-registrar', from: registration, to: 'registerCleanup(initialize(root));',
    check: 'I2.registered and returned functions dispose once, including after stop',
    oracle: 'initializer receives registerCleanup',
  },
  {
    name: 'registration-dedupe', from: dedupe, to: "if (typeof cleanup !== 'function') return;",
    check: 'I2.registered and returned functions dispose once, including after stop',
    oracle: 'registered and returned cleanup runs exactly once',
  },
  {
    name: 'stopped-dedupe', from: dedupe,
    to: "if (typeof cleanup !== 'function' || (mounted.get(root) === cleanups && registeredCleanups.has(cleanup))) return;",
    check: 'I2.registered and returned functions dispose once, including after stop',
    oracle: 'the once-only set survives stop',
  },
  {
    name: 'late-disposal', from: 'else dispose(root, cleanup);', to: 'else void cleanup;',
    check: 'I3.late registration after stop disposes immediately once',
    oracle: 'late cleanup runs immediately after stop',
  },
  {
    name: 'registration-owner', from: identity, to: 'if (mounted.has(root)) cleanups.push(cleanup);',
    check: 'I4.late old registration cannot join a replacement mount',
    oracle: 'old registrar checks the captured cleanup-array identity',
  },
  {
    name: 'early-registration', from: identity, to: 'if (mounted.get(root) === cleanups) void cleanup;',
    check: 'I5.stop during initialization disposes early cleanup before return',
    oracle: 'registered cleanup is available to a synchronous stop',
  },
  {
    name: 'returned-cleanup-routing', from: registration,
    to: "const cleanup = initialize(root, registerCleanup);\n      if (typeof cleanup === 'function') cleanups.push(cleanup);",
    check: 'I6.legacy return after synchronous stop is disposed immediately',
    oracle: 'legacy late return routes through registration',
  },
  {
    name: 'remounted-return-dedupe', from: 'registeredCleanups.add(cleanup);',
    to: 'if (mounted.get(root) !== cleanups) registeredCleanups.add(cleanup);',
    check: 'I7.old registered return cannot destroy a fresh mount',
    oracle: 'old registered return must not dispose again after remount',
  },
  {
    name: 'ready-owner', from: "if (mounted.get(root) === cleanups) root.dataset.elyReady = 'true';", to: "root.dataset.elyReady = 'true';",
    check: 'I8.old successful return cannot overwrite a fresh initialization error',
    oracle: 'old success cannot overwrite the newer mount error state',
  },
  {
    name: 'stale-error-owner', from: 'if (mounted.get(root) !== cleanups) return;', to: '/* Negative control: stale initializer errors escape. */',
    check: 'I9.old initialization error cannot publish into a fresh mount',
    oracle: 'stale initialization errors are not published',
  },
  {
    name: 'owned-error-compatibility', from: 'if (mounted.get(root) !== cleanups) return;', to: 'if (mounted.get(root) === cleanups) return;',
    check: 'I10.owned initialization errors preserve existing failed-mount behavior',
    oracle: 'owned initialization still emits its exact error',
  },
  {
    name: 'error-write-owner', from: "if (mounted.get(root) === cleanups) root.dataset.elyReady = 'error';", to: "root.dataset.elyReady = 'error';",
    check: 'I11.error-event remount owns subsequent readiness writes',
    oracle: 'error handler remount cannot receive the old error state',
  },
  {
    name: 'stop-ready-order', from: 'if (scope === document || scope.isConnected) start(scope);',
    to: 'if (scope === document || scope.isConnected) { start(scope); delete root.dataset.elyReady; }',
    check: 'I12.cleanup-event remount keeps fresh readiness and callbacks',
    oracle: 'old stop cannot erase the replacement ready state',
  },
  {
    name: 'cleanup-exception-isolation', from: isolation, to: isolation + '\n    throw error;',
    check: 'I13.throwing cleanup cannot strand later cleanup or sibling roots',
    oracle: 'cleanup exception must not escape teardown',
  },
  {
    name: 'late-exception-isolation', from: isolation, to: isolation + '\n    throw error;',
    check: 'I14.throwing late cleanup is isolated and remains once-only',
    oracle: 'late cleanup exception must not escape registration',
  },
  {
    name: 'cleanup-error-remount-dedupe', from: 'registeredCleanups.add(cleanup);',
    to: 'if (mounted.get(root) !== cleanups) registeredCleanups.add(cleanup);',
    check: 'I15.cleanup-error remount survives the old initializer return',
    oracle: 'throwing cleanup returned after remount remains once-only',
  },
];
const sha = value => createHash('sha256').update(value).digest('hex');
const temp = mkdtempSync(join(tmpdir(), 'initializer-cleanup-controls-'));
const report = {suite: 'production-core-initializer-cleanup-causal-controls', coreSHA256: sha(source), browserExecuted: false, controls: []};
const run = (corePath, check, reportPath) => spawnSync(process.execPath, [test], {
  encoding: 'utf8', env: {...process.env, INITIALIZER_CORE_SOURCE: corePath, INITIALIZER_CORE_CHECK: check, INITIALIZER_CORE_REPORT: reportPath},
});
try {
  const positivePath = join(temp, 'production.js'); writeFileSync(positivePath, source);
  for (const control of controls) {
    const anchorCount = source.split(control.from).length - 1;
    assert.equal(anchorCount, 1, `${control.name}: production anchor must occur exactly once`);
    const positiveReport = join(temp, `${control.name}-positive.json`);
    const positive = run(positivePath, control.check, positiveReport);
    assert.equal(positive.error, undefined, `${control.name}: positive runner error`);
    assert.equal(positive.status, 0, `${control.name}: designated positive test must pass\n${positive.stderr}`);
    const mutated = source.replace(control.from, control.to);
    const path = join(temp, `${control.name}.js`), evidencePath = join(temp, `${control.name}.json`);
    writeFileSync(path, mutated);
    const result = run(path, control.check, evidencePath);
    assert.equal(result.error, undefined, `${control.name}: mutant runner error`);
    assert.equal(result.status, 1, `${control.name}: mutant must fail its behavioral oracle`);
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    assert.equal(evidence.checks.length, 1, `${control.name}: run only the designated independent check`);
    const failed = evidence.checks[0];
    assert.equal(failed.name, control.check); assert.equal(failed.status, 'failed');
    assert.match(failed.error, /AssertionError/, `${control.name}: unrelated exception cannot kill the control`);
    assert(failed.error.includes(control.oracle), `${control.name}: wrong causal assertion\n${failed.error}`);
    assert.equal(evidence.coreSHA256, sha(mutated), `${control.name}: exact mutated production core executed`);
    report.controls.push({name: control.name, anchorCount, anchor: control.from, coreSHA256: sha(source), mutatedCoreSHA256: sha(mutated), designatedOracle: control.check, assertion: control.oracle, positiveExit: positive.status, firstFailure: failed, exit: result.status, status: 'killed'});
    console.log(`${control.name}: killed by ${control.check}: ${control.oracle}`);
  }
  report.status = 'passed';
} finally {
  mkdirSync('test-results/contracts', {recursive: true});
  writeFileSync(process.env.INITIALIZER_CONTROLS_REPORT || 'test-results/contracts/initializer-cleanup-controls.json', JSON.stringify(report, null, 2) + '\n');
  rmSync(temp, {recursive: true, force: true});
}
