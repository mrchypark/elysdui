import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {parse} from 'acorn';
import {cleanupRemountCoreControls, mutateCleanupRemountCore} from '../ui/gohtmx/tests/browser/cleanup-remount-core-controls.mjs';

const source = readFileSync('ui/gohtmx/assets/ely-api.js', 'utf8');
const test = 'ui/gohtmx/tests/unit/cleanup_remount_test.mjs';
const controls = [
  ...Object.entries(cleanupRemountCoreControls).map(([name, control]) => ({name, ...control})),
  {
    name: 'pending-descendants',
    anchor: '[...pendingSwaps.keys()].some(owner => overlaps(owner, root))', replacement: 'pendingSwaps.has(root)',
    check: 'R7.new pending context blocks queued roots and new descendants', oracle: 'pending ancestor blocks a newly inserted descendant',
  },
  {
    name: 'pending-ancestors',
    anchor: '[...pendingSwaps.keys()].some(owner => overlaps(owner, root))', replacement: '[...pendingSwaps.keys()].some(owner => owner === root || owner.contains(root))',
    check: 'R17.pending descendant also blocks a new ancestor initializer', oracle: 'pending descendant must block its new ancestor without freezing an unrelated sibling',
  },
  {
    name: 'cached-replay-snapshot',
    anchor: 'teardown.starts.add(scope);', replacement: 'teardown.starts.add({isConnected: scope.isConnected, querySelectorAll: () => [root]});',
    check: 'R18.replay rescans descendants inserted after the last startup request', oracle: 'replay must discover descendants added after the queued startup request',
  },
];
const sha = value => createHash('sha256').update(value).digest('hex');
const temp = mkdtempSync(join(tmpdir(), 'cleanup-remount-controls-'));
const report = {suite: 'production-core-cleanup-remount-causal-controls', coreSHA256: sha(source), browserExecuted: false, controls: []};
const run = (corePath, check, reportPath) => spawnSync(process.execPath, [test], {
  encoding: 'utf8', env: {...process.env, CLEANUP_REMOUNT_CORE_SOURCE: corePath, CLEANUP_REMOUNT_CORE_CHECK: check, CLEANUP_REMOUNT_CORE_REPORT: reportPath},
});
try {
  const productionPath = join(temp, 'production.js'); writeFileSync(productionPath, source);
  for (const control of controls) {
    const anchorCount = source.split(control.anchor).length - 1;
    assert.equal(anchorCount, 1, `${control.name}: exactly one production anchor required`);
    const positive = run(productionPath, control.check, join(temp, `${control.name}-positive.json`));
    assert.equal(positive.error, undefined); assert.equal(positive.status, 0, `${control.name}: positive check must pass\n${positive.stderr}`);
    const mutated = Object.hasOwn(cleanupRemountCoreControls, control.name) ? mutateCleanupRemountCore(source, control.name) : source.replace(control.anchor, control.replacement); parse(mutated, {ecmaVersion: 'latest', sourceType: 'module'});
    const path = join(temp, `${control.name}.js`), evidencePath = join(temp, `${control.name}.json`); writeFileSync(path, mutated);
    const result = run(path, control.check, evidencePath);
    assert.equal(result.error, undefined); assert.equal(result.status, 1, `${control.name}: intended behavioral assertion must fail`);
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    assert.equal(evidence.checks.length, 1); const failed = evidence.checks[0];
    assert.equal(failed.name, control.check); assert.equal(failed.status, 'failed');
    assert.match(failed.error, /AssertionError/); assert(failed.error.includes(control.oracle), `${control.name}: wrong failure\n${failed.error}`);
    assert.equal(evidence.coreSHA256, sha(mutated));
    report.controls.push({name: control.name, anchorCount, anchor: control.anchor, coreSHA256: sha(source), mutatedCoreSHA256: sha(mutated), designatedOracle: control.check, assertion: control.oracle, positiveExit: positive.status, exit: result.status, firstFailure: failed, status: 'killed'});
    console.log(`${control.name}: killed by ${control.check}: ${control.oracle}`);
  }
  report.status = 'passed';
} finally {
  mkdirSync('test-results/contracts', {recursive: true});
  writeFileSync(process.env.CLEANUP_REMOUNT_CONTROLS_REPORT || 'test-results/contracts/cleanup-remount-controls.json', JSON.stringify(report, null, 2) + '\n');
  rmSync(temp, {recursive: true, force: true});
}
