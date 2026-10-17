import assert from 'node:assert/strict';
import {families,pageIdentity} from './gallery-inventory.mjs';
export const mutations = [
 {id:'icon-bundled-asset-removed',key:'primitives/Icon',error:'Icon did not resolve a bundled icon asset'},
 {id:'icon-size-specimen-removed',key:'primitives/Icon',error:'Icon did not render caller size and tone specimens'},
 {id:'portal-click-suppressed',key:'primitives/Portal',error:'Portal did not open its deferred note'},
];
export const mutationIDs=mutations.map(row=>row.id);
export function validateGalleryEvidence(report, {mode, revision, inventory} = {}) {
  assert(inventory,'authoritative inventory required');
  assert(['live','static'].includes(report.mode),'unknown gallery mode');
  assert.equal(report.schemaVersion, 2);
  assert.equal(report.evidenceKind, 'browser-execution');
  assert.equal(report.fullContractVerified, false, 'scoped checks must never claim full support');
  assert.match(report.revision, /^[a-f0-9]{40}$/);
  if (revision) assert.equal(report.revision, revision, 'evidence is from a different checkout revision');
  if (mode) assert.equal(report.mode, mode);
  assert.equal(report.pages.length, 646);
  assert.equal(new Set(report.pages.map(row => row.url)).size, 646);
  assert.deepEqual(report.pages.map(row=>pageIdentity(row.url)).sort(),inventory.pages.map(pageIdentity).sort(),'page identities differ from authoritative inventory');
  assert.deepEqual(report.behaviors.map(row=>row.family).sort(),[...families].sort(),'family identities differ');
  assert(report.pages.every(row => row.status === 'passed'), 'page failures or skips');
  assert.equal(report.behaviors.length, 7);
  const results = report.behaviors.flatMap(family => {
    assert.equal(family.failed, 0);
    assert.equal(family.passed, family.expected);
    assert.equal(family.results.length, family.expected);
    assert.equal(family.runtime.status, 'passed');
    assert.deepEqual(family.results.map(row=>`${row.name}|${row.key}`).sort(),inventory.cases.filter(row=>row.family===family.family).map(row=>`${row.name}|${row.key}`).sort(),'case identities differ from authoritative registry');
    return family.results;
  });
  assert.equal(results.length, 1313);
  assert.equal(new Set(results.map(row => row.caseId)).size, 1313);
  assert(results.every(row => row.status === 'passed' && Number.isInteger(row.componentAssertions) && row.componentAssertions > 0 && row.fullContractVerified === false && row.claimId === `gallery-check:${row.key}` && row.caseId === `gallery:${row.name}`), 'missing, skipped or invalid case execution');
  assert.deepEqual(report.negativeControls.map(row => row.id).sort(), [...mutationIDs].sort());
  assert(report.negativeControls.every(row => row.status === 'detected' && Number.isInteger(row.baselineAssertions) && row.baselineAssertions > 0 && row.observedError), 'a mutation survived or baseline never ran');
  for(const mutation of mutations){const row=report.negativeControls.find(row=>row.id===mutation.id);assert.equal(row.claimId,`gallery-check:${mutation.key}`);assert.equal(row.observedError,mutation.error);}
  return results.length;
}
