import assert from 'node:assert/strict';
import {spawnSync, execFileSync} from 'node:child_process';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash, randomUUID} from 'node:crypto';
import {cleanupRemountCoreControls, mutateCleanupRemountCore} from '../ui/gohtmx/tests/browser/cleanup-remount-core-controls.mjs';
import {cleanupRemountSourcePaths, verifyCleanupRemountEvidence} from '../ui/gohtmx/tests/browser/cleanup-remount-evidence.mjs';
import {loadContextOwnerAssets} from '../ui/gohtmx/tests/browser/context-owner-assets.mjs';

// CI-only browser execution. Raw failure reports remain nonzero; the pure
// verifier requires exact inventories and recomputes every raw verdict.
const sha = value => createHash('sha256').update(value).digest('hex');
const revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
const tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {encoding: 'utf8'}).trim();
const sourceFiles = Object.fromEntries(cleanupRemountSourcePaths.map(path => [path, sha(readFileSync(path))]));
const loaded = await loadContextOwnerAssets(process.cwd());
const surfaces = process.env.CLEANUP_REMOUNT_SURFACE ? [process.env.CLEANUP_REMOUNT_SURFACE] : ['standalone', 'catalogue'];
assert(surfaces.every(surface => ['standalone', 'catalogue'].includes(surface)));
for (const surface of surfaces) {
  const evidence = {surface, suite: 'cleanup-remount-browser-causal-controls', controls: []};
  const run = (mutation, positiveReport) => {
    const runToken = randomUUID();
    const assets = Object.fromEntries([...loaded].map(([path, asset]) => {
      const body = mutation && path === cleanupRemountCoreControls[mutation].file ? Buffer.from(mutateCleanupRemountCore(asset.body.toString('utf8'), mutation)) : asset.body;
      return [path, {sourceSHA256: asset.sourceSHA256, servedSHA256: sha(body), bytes: body.length}];
    }));
    const result = spawnSync(process.execPath, ['ui/gohtmx/tests/browser/cleanup-remount-browser-test.mjs'], {
      stdio: 'inherit', env: {...process.env, CLEANUP_REMOUNT_SURFACE: surface, CLEANUP_REMOUNT_GROUP: 'all', CLEANUP_REMOUNT_MUTATION: mutation, CLEANUP_REMOUNT_RUN_TOKEN: runToken},
    });
    assert.ifError(result.error);
    const report = JSON.parse(readFileSync(`test-results/contracts/cleanup-remount-${surface}-all-${mutation || 'clean'}.json`, 'utf8'));
    for (const fixture of Object.values(report.fixtures || {})) {
      assert(/^cleanup-remount-fixtures\/[a-f0-9]{64}\.html$/.test(fixture.html));
      assert.equal(sha(readFileSync('test-results/contracts/' + fixture.html)), fixture.sourceSHA256, 'actual persisted fixture bytes');
    }
    const verdict = verifyCleanupRemountEvidence(report, {mutation, surface, revision, tree, sourceFiles, assets, fixtures: positiveReport?.fixtures, positiveChecks: positiveReport?.checks, runToken}, result.status);
    return {report, verdict, exit: result.status};
  };
  const positive = run('');
  for (const name of Object.keys(cleanupRemountCoreControls)) {
    const {report, verdict, exit} = run(name, positive.report);
    evidence.controls.push({...verdict, rawStatus: report.status, rawExit: exit, core: report.assets[cleanupRemountCoreControls[name].file], oracle: cleanupRemountCoreControls[name].browserOracle});
  }
  evidence.status = 'passed';
  writeFileSync(`test-results/contracts/cleanup-remount-browser-controls-${surface}.json`, JSON.stringify(evidence, null, 2) + '\n');
}
