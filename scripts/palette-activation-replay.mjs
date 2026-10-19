import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadActivationInputs} from '../ui/gohtmx/tests/browser/palette-activation-inputs.mjs';
import {activationSelection,activationPolicy} from '../ui/gohtmx/tests/browser/palette-activation-policy.mjs';
import {verifyActivationControl} from './palette-activation-controls.mjs';
import {verifyActivationEvidence} from '../ui/gohtmx/tests/browser/palette-activation-evidence.mjs';
const [reportPath,invocationPath,exitPath,revision,tree,runToken,mode='baseline',mutation='control',...extra]=process.argv.slice(2);assert.equal(extra.length,0);const selected=activationSelection({mode,mutation});
assert(reportPath&&invocationPath&&exitPath&&revision&&tree&&runToken,'usage: node scripts/palette-activation-replay.mjs REPORT INVOCATION EXIT EXPECTED_REVISION EXPECTED_TREE EXPECTED_TOKEN [baseline|repaired] [MUTATION]');
const [report,invocation,exit]=await Promise.all([reportPath,invocationPath,exitPath].map(async path=>JSON.parse(await readFile(path,'utf8'))));
for(const source of [invocation,exit])for(const [key,value]of Object.entries({revision,tree,runToken}))assert.equal(source[key],value,'independent invocation '+key);
for(const source of [invocation,exit]){assert.deepEqual(source.activationPolicy,activationPolicy(selected),'externally selected activation policy');assert.equal(source.productionPolicy,selected.mode==='repaired'?'activation-repair':'strict','externally selected inherited production policy');}
const base=fileURLToPath(new URL('../',import.meta.url)),{assetBodies,fixtureBodies,...current}=await loadActivationInputs(base,invocation.surface,selected);assert.equal(current.dirty,'');assert.equal(current.revision,revision);assert.equal(current.tree,tree);
for(const key of ['productionPolicy','activationPolicy','activationRepairSourceFiles','activationRenderMutation','sourceFiles','activationSourceFiles','assets','fixtures','fixtureManifest','standaloneDependencyProof'])assert.deepEqual(invocation[key],current[key],'current-source replay '+key);
const trusted={...current,...invocation,revision,tree,runToken},result=verifyActivationEvidence(report,trusted,exit.exitCode);
let causal=null;
try{if(selected.mode==='repaired'&&selected.mutation!=='control')causal=verifyActivationControl(report,trusted,exit.exitCode,selected);}
catch(error){
 // The original report remains valid raw evidence even when its intended
 // reversal was not witnessed. Keep that separate from provenance failure.
 console.log(JSON.stringify({evidenceValidation:'valid-replay',...result,causalValidation:'failed',causalError:{name:error.name,message:error.message},rawExit:exit.exitCode}));process.exitCode=1;
}
if(!process.exitCode)console.log(JSON.stringify({evidenceValidation:'valid-replay',...result,...(causal?{causalValidation:'passed',causalControl:causal.control,kills:causal.kills}:{}),rawExit:exit.exitCode}));
