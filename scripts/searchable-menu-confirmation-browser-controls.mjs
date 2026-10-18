import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {loadSearchableInputs, searchableSHA} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-inputs.mjs';
import {searchableControls, searchableReportName, searchableMutantCases} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-controls.mjs';
import {searchableSurfaces, verifySearchableEvidence} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-evidence.mjs';

// A kill is established only by a fresh genuine-browser failure with exactly
// the designated raw contracts, after a separately verified all-case clean run.
// This driver never rewrites a failing child report or its real exit status.
assert.equal(process.env.CI, 'true', 'browser execution is restricted to CI');
const base = fileURLToPath(new URL('../', import.meta.url));
const surfaces = process.env.SEARCHABLE_MENU_SURFACE ? [process.env.SEARCHABLE_MENU_SURFACE] : searchableSurfaces;
assert(surfaces.every(surface => searchableSurfaces.includes(surface)));
for (const surface of surfaces) {
  const run = async (mutation, positive) => {
    const runToken = randomUUID(), group = 'all';
    const {assetBodies, fixtureBodies, ...trusted} = await loadSearchableInputs(base, surface, mutation);
    assert.equal(trusted.dirty, '', 'browser evidence requires a clean committed checkout');
    if (positive) {
      for (const key of ['revision', 'tree', 'sourceFiles', 'fixtures', 'toolchain', 'standaloneDependencyProof']) assert.deepEqual(trusted[key], positive.trusted[key], 'same clean candidate ' + key);
      assert.deepEqual(Object.keys(trusted.assets), Object.keys(positive.trusted.assets));
      for (const [path, asset] of Object.entries(trusted.assets)) assert.equal(asset.sourceSHA256, positive.trusted.assets[path].sourceSHA256, 'same original source bytes ' + path);
    }
    const child = spawnSync(process.execPath, ['ui/gohtmx/tests/browser/searchable-menu-confirmation-browser-test.mjs'], {
      cwd: base, stdio: 'inherit', env: {...process.env, SEARCHABLE_MENU_SURFACE: surface, SEARCHABLE_MENU_GROUP: group, SEARCHABLE_MENU_MUTATION: mutation, SEARCHABLE_MENU_RUN_TOKEN: runToken},
    });
    assert.ifError(child.error); assert.equal(child.signal, null);
    const filename = searchableReportName(surface, group, mutation);
    const bytes = await readFile(join(base, 'test-results/contracts', filename)), report = JSON.parse(bytes);
    const verdict = verifySearchableEvidence(report, {...trusted, surface, group, runToken}, child.status);
    for (const fixture of Object.values(trusted.fixtures)) assert.equal(searchableSHA(await readFile(join(base, 'test-results/contracts', fixture.html))), fixture.sourceSHA256, 'persisted fixture bytes');
    assert.equal(verdict.status, mutation ? 'failed' : 'passed');
    assert.equal(child.status, mutation ? 1 : 0);
    return {trusted, report, verdict, summary: {mutation, status: mutation ? 'killed' : 'passed', rawStatus: report.status, rawExit: child.status, runToken, report: filename, reportSHA256: searchableSHA(bytes), caseInventory: report.caseInventory, failed: verdict.failed,
      failedContracts: Object.fromEntries(report.checks.filter(check => check.status === 'failed').map(check => [check.name, check.oracles.filter(oracle => !oracle.pass).map(oracle => oracle.id)])), runtime: report.assets['/assets/ely-api-interaction.js']}};
  };
  const positive = await run('');
  const evidence = {suite: 'searchable-menu-confirmation-causal-controls', surface, revision: positive.trusted.revision, tree: positive.trusted.tree, sourceFiles: positive.trusted.sourceFiles, positive: positive.summary, controls: []};
  for (const mutation of Object.keys(searchableControls)) evidence.controls.push((await run(mutation, positive)).summary);
  evidence.status = 'passed';
  await writeFile(join(base, 'test-results/contracts', `searchable-menu-confirmation-causal-controls-${surface}.json`), JSON.stringify(evidence, null, 2) + '\n');
  console.log(`${surface}: clean full inventory passed; all ${evidence.controls.length} independent targeted controls killed by designated raw contracts`);
}
