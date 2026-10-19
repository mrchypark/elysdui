import assert from 'node:assert/strict';
import {activationMutations,activationMutationMetadata} from './palette-activation-mutants.mjs';
export const activationRepairSourcePaths=[
 'ui/gohtmx/tests/browser/palette-activation-policy.mjs',
 'ui/gohtmx/tests/browser/palette-activation-mutants.mjs',
 'ui/gohtmx/tests/unit/palette_activation_harness.mjs',
 'ui/gohtmx/tests/unit/palette_activation_test.mjs',
 'ui/gohtmx/tests/unit/palette_owner_context_test.mjs',
 'ui/gohtmx/tests/unit/palette_activation_mutants_test.mjs',
 'ui/gohtmx/palette_activation_test.go',
 'adapters/gohtmx/tests/fixtures/palette-activation/ownership_test.go',
 'scripts/initializer-cleanup-negative-test.mjs',
 'scripts/palette-activation-controls.mjs',
 'scripts/palette-activation-controls-evidence-test.mjs',
 'scripts/palette-activation-repair-evidence-test.mjs',
];
export function activationSelection(options={}){
 assert(options&&typeof options==='object'&&!Array.isArray(options));
 assert(Object.keys(options).every(key=>['mode','mutation'].includes(key)),'known activation selection keys');
 const {mode='baseline',mutation='control'}=options;
 assert(['baseline','repaired'].includes(mode),'explicit finite activation mode');
 assert(activationMutations.includes(mutation),'source-owned activation mutation');
 assert(mode==='repaired'||mutation==='control','baseline cannot serve a repair mutant');
 return {mode,mutation};
}
export function activationPolicy(options={}){
 const selected=activationSelection(options);
 return {...selected,definition:selected.mode==='repaired'?activationMutationMetadata(selected.mutation):null};
}
export function activationEnvironment(env=process.env){
 return activationSelection({mode:env.PALETTE_ACTIVATION_MODE||'baseline',mutation:env.PALETTE_ACTIVATION_MUTATION||'control'});
}
export const activationTemplateMarkerCounts={'/':10,'/empty-initial':5,'/empty-disabled':10,'/sdui-response-primary':0,'/sdui-response-peer':0};
export function verifyActivationPolicy(report,trusted){
 const expected=activationPolicy({mode:trusted.activationPolicy.mode,mutation:trusted.activationPolicy.mutation});
 assert.equal(trusted.productionPolicy,expected.mode==='repaired'?'activation-repair':'strict','activation maps to exact inherited production policy');
 assert.equal(report.productionPolicy,trusted.productionPolicy,'reported inherited production policy');
 assert.deepEqual(trusted.activationPolicy,expected,'independently fixed source policy');
 assert.deepEqual(report.activationPolicy,expected,'report cannot choose source policy');
 assert.deepEqual(Object.keys(trusted.activationRepairSourceFiles),expected.mode==='repaired'?activationRepairSourcePaths:[],'exact repair source inventory');
 assert.deepEqual(report.activationRepairSourceFiles,trusted.activationRepairSourceFiles);
 for(const value of Object.values(trusted.activationRepairSourceFiles))assert(/^[a-f0-9]{64}$/.test(value));
 for(const [path,entry]of Object.entries(trusted.assets)){
  const key=path==='/assets/ely-api.js'?'core':path==='/assets/ely-api-interaction.js'?'runtime':null;
  if(expected.mode==='repaired'&&key){const file=expected.definition.files[key];assert.deepEqual([entry.sourceSHA256,entry.servedSHA256,entry.bytes],[file.sourceSHA256,file.servedSHA256,file.servedBytes],path+' exact source/served policy');}
  else assert.equal(entry.sourceSHA256,entry.servedSHA256,path+' unmutated asset');
 }
 assert.deepEqual(report.activationRenderMutation,trusted.activationRenderMutation);
 if(expected.mode==='repaired'&&expected.mutation==='template-marker-omitted'){
  const template=expected.definition.files.template;
  assert.deepEqual(Object.keys(trusted.activationRenderMutation),Object.keys(trusted.fixtures));
  for(const [path,entry]of Object.entries(trusted.fixtures)){
   const proof=trusted.activationRenderMutation[path],count=activationTemplateMarkerCounts[path];
   assert.deepEqual(proof,{compilePolicy:'go-build-embed-overlay',templateSourceSHA256:template.sourceSHA256,templateTransformedSHA256:template.transformedSourceSHA256,sourceMarkers:count,servedMarkers:0,removedMarkers:count});
   if(count)assert.notEqual(entry.sourceSHA256,entry.servedSHA256,path+' overlay must affect compiled output');else assert.equal(entry.sourceSHA256,entry.servedSHA256);
  }
 }else{assert.deepEqual(trusted.activationRenderMutation,{});for(const entry of Object.values(trusted.fixtures))assert.equal(entry.sourceSHA256,entry.servedSHA256);}
}
