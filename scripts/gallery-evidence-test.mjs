import assert from 'node:assert/strict';
import {validateGalleryEvidence,mutations} from './gallery-evidence.mjs';
import {expectedInventory,families} from './gallery-inventory.mjs';
// Synthetic results exercise validation against the actual current registry;
// these are explicitly not persisted as browser execution evidence.
const inventory=expectedInventory('live');
const report={schemaVersion:2,evidenceKind:'browser-execution',fullContractVerified:false,revision:'a'.repeat(40),mode:'live',pages:inventory.pages.map(url=>({url,status:'passed'})),behaviors:families.map(family=>{const results=inventory.cases.filter(row=>row.family===family).map(({name,key})=>({name,key,caseId:`gallery:${name}`,claimId:`gallery-check:${key}`,status:'passed',componentAssertions:1,fullContractVerified:false}));return {family,expected:results.length,passed:results.length,failed:0,results,runtime:{status:'passed'}}}),negativeControls:mutations.map(({id,key,error})=>({id,claimId:`gallery-check:${key}`,status:'detected',baselineAssertions:1,observedError:error}))};
const validate=(report,options={})=>validateGalleryEvidence(report,{inventory,...options});
assert.equal(validate(report),1313);
const corruptions=[
 r=>r.pages.pop(),r=>r.pages[0].status='skipped',r=>r.pages[0].url='/invented',r=>r.behaviors.pop(),
 r=>r.behaviors[0].results[0].status='skipped',r=>r.behaviors[0].results[0].componentAssertions=0,
 r=>r.behaviors[0].results[0].caseId=r.behaviors[0].results[1].caseId,
 r=>Object.assign(r.behaviors[0].results[0],{name:'invented',key:'invented',caseId:'gallery:invented',claimId:'gallery-check:invented'}),
 r=>r.behaviors[0].family=r.behaviors[1].family,
 r=>r.negativeControls.pop(),r=>r.negativeControls[0].status='survived',
 r=>r.negativeControls[0].baselineAssertions=0,r=>r.negativeControls[0].observedError='unrelated setup failure',
 r=>r.negativeControls[0].claimId='wrong',r=>r.fullContractVerified=true,
 r=>r.evidenceKind='registration-only',r=>r.revision='unknown',r=>r.mode='unknown',
];
for(const corrupt of corruptions){const copy=structuredClone(report);corrupt(copy);assert.throws(()=>validate(copy));}
assert.throws(()=>validate(report,{revision:'b'.repeat(40)}));
assert.throws(()=>validateGalleryEvidence(report));
console.log(`Gallery evidence validator passed; ${corruptions.length+2} corrupt/missing/skipped/stale/invented evidence controls rejected.`);
