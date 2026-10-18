import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {contextOwnerControls} from '../ui/gohtmx/tests/browser/context-owner-controls.mjs';

// CI entrypoint: each causal control must reach its own assertion independently
// on BOTH real renderers. Never run this script as a source-only validation.
for (const surface of ['standalone', 'catalogue']) {
 for (const name of Object.keys(contextOwnerControls)) {
  const result = spawnSync(process.execPath, ['ui/gohtmx/tests/browser/context-owner-requests-browser-test.mjs'], {
   stdio: 'inherit', env: {...process.env, CONTEXT_OWNER_SURFACE: surface, CONTEXT_OWNER_NEGATIVE_CONTROL: name},
  });
  assert.ifError(result.error);
  assert.equal(result.status, 0, `${surface}/${name}: browser control process must succeed`);
  const report = JSON.parse(readFileSync(`test-results/contracts/context-owner-requests-${surface}-${name}.json`, 'utf8'));
  assert.equal(report.status, 'mutation-killed', `${surface}/${name}: own named oracle must kill the control`);
  assert.equal(report.causalEvidence.surface, surface);
  const control=contextOwnerControls[name];
  assert.equal(report.failedOracle,control.oracle);
  if(control.prior)assert.deepEqual(report.causalEvidence.withinCasePrerequisites,control.prior,`${surface}/${name}: exact prerequisite evidence must precede the designated failure`);
  if(Object.hasOwn(control,'actual'))assert.deepEqual(report.observed,control.actual);
  if(Object.hasOwn(control,'expected'))assert.deepEqual(report.expected,control.expected);
 }
}
