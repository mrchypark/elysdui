// Synthetic raw observations joined to current independently compiled source.
// No browser/server, native behavior or successful causal kill is inferred here.
import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildActivationMutantSchemaFixture,buildActivationPostCloseRejectionFixture,buildActivationShapeRejectionFixture,buildActivationWitnessRejectionFixture,activationWitnessKinds} from './palette-activation-controls-evidence-test.mjs';
import {buildActivationSchemaFixture} from './palette-activation-evidence-test.mjs';
import {loadActivationInputs} from '../ui/gohtmx/tests/browser/palette-activation-inputs.mjs';
import {activationSelection,activationPolicy,verifyActivationPolicy,activationRepairSourcePaths} from '../ui/gohtmx/tests/browser/palette-activation-policy.mjs';
import {activationMutations} from '../ui/gohtmx/tests/browser/palette-activation-mutants.mjs';
import {verifyActivationEvidence} from '../ui/gohtmx/tests/browser/palette-activation-evidence.mjs';
import {verifyActivationControl} from './palette-activation-controls.mjs';
export const activationCollectionMatrix=[
 ...['go-qualified','go-chapter','sdui'].map(surface=>({surface,mutation:'control'})),
 ...activationMutations.filter(m=>m!=='control').map(mutation=>({surface:'go-qualified',mutation})),
 {surface:'go-chapter',mutation:'template-marker-omitted'},
 {surface:'sdui',mutation:'template-marker-omitted'},
 {surface:'sdui',mutation:'post-close-owner-bypassed'},
];
export function bindActivationMetadata(fixture,metadata){
 const report=structuredClone(fixture.report);Object.assign(report,metadata);
 report.runToken='synthetic-current-source-'+metadata.activationPolicy.mutation+'-'+report.surface;
 const entry=record=>report.assets[record.path]||report.fixtures[record.responseFixture||record.path];
 const paths=[...Object.keys(report.assets),...Object.keys(report.fixtures)];
 report.httpAssetProof=paths.map(path=>{const wanted=entry({path});return {path,status:200,bytes:wanted.bytes,expectedSHA256:wanted.servedSHA256,receivedSHA256:wanted.servedSHA256};});
 for(const record of report.browserResponses){const wanted=entry(record);Object.assign(record,{bytes:wanted.bytes,expectedSHA256:wanted.servedSHA256,receivedSHA256:wanted.servedSHA256});}
 const caseRequests=report.requests.filter(record=>record.check!==null);
 for(const record of caseRequests){const wanted=entry(record);Object.assign(record,{responseSHA256:wanted.servedSHA256,responseBytes:wanted.bytes});}
 report.requests=[...paths.map(path=>{const wanted=entry({path});return {check:null,path,method:'GET',htmx:null,status:200,responseSHA256:wanted.servedSHA256,responseBytes:wanted.bytes};}),...caseRequests];
 return {report,trusted:{...metadata,surface:report.surface,runToken:report.runToken},exit:fixture.exit};
}
export async function runActivationRepairEvidenceTests(){
 const base=fileURLToPath(new URL('../',import.meta.url));assert.equal(execFileSync('git',['status','--porcelain'],{cwd:base,encoding:'utf8'}).trim(),'','exact committed current-source repair replay');
 const historical='ac28651be2869bab709bc617a3f7c50bf68d50f5';
 const historicalText=path=>execFileSync('git',['show',historical+':'+path],{cwd:base,encoding:'utf8',maxBuffer:8*1024*1024});
 const between=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end));
 for(const [path,start,end]of [
  ['ui/gohtmx/tests/browser/palette-activation-evidence.mjs','export function activationOracles','export const activationBrowserPaths'],
  ['ui/gohtmx/tests/browser/palette-activation-browser-test.mjs',' for(const name of activationCases){'," report.status=report.checks.every"],
 ])assert.equal(between(await readFile(join(base,path),'utf8'),start,end),between(historicalText(path),start,end),'historical desired/native case bodies unchanged');
 const observer='ui/gohtmx/tests/browser/palette-activation-observer.js';assert.equal(await readFile(join(base,observer),'utf8'),historicalText(observer));
 const workflow=await readFile(join(base,'.github/workflows/palette-activation.yml'),'utf8');
 assert.deepEqual([...workflow.matchAll(/- \{surface: ([a-z-]+), mutation: ([a-z-]+)\}/g)].map(m=>({surface:m[1],mutation:m[2]})),activationCollectionMatrix,'exact bounded native collection matrix');
 let positive=0,rejected=0;
 for(const options of [{mode:'unknown'},{mode:'baseline',mutation:'empty-enter-fallthrough'},{mode:'repaired',mutation:'unknown'},{mode:'repaired',skipPins:true}]){assert.throws(()=>activationSelection(options));rejected++;}
 // The default policy must still refuse this repaired production snapshot.
 await assert.rejects(()=>loadActivationInputs(base,'go-qualified'),/reviewed production input|loaded production assets pinned/);rejected++;
 const temp=await mkdtemp(join(tmpdir(),'palette-activation-repair-replay-'));
 try{for(const {surface,mutation}of activationCollectionMatrix){
  const selected={mode:'repaired',mutation},inputs=await loadActivationInputs(base,surface,selected),{assetBodies,fixtureBodies,...metadata}=inputs;
  assert.deepEqual(JSON.parse(JSON.stringify(metadata)),metadata,'serialized source metadata contains no private Map/Set');
  for(const [path,entry]of assetBodies)assert.equal(entry.body.length,metadata.assets[path].bytes);
  for(const [path,body]of fixtureBodies)assert.equal(body.length,metadata.fixtures[path].bytes);
  const f=bindActivationMetadata(buildActivationMutantSchemaFixture(surface,mutation),metadata);f.report.surface=surface;
  const expected=verifyActivationEvidence(JSON.parse(JSON.stringify(f.report)),JSON.parse(JSON.stringify(f.trusted)),f.exit);assert.equal(expected.status,mutation==='control'?'passed':'failed');positive++;
  const causal=verifyActivationControl(f.report,f.trusted,f.exit,selected);assert.equal(causal.control,mutation==='control'?'passed':'killed');
  if(mutation!=='control'){const green=bindActivationMetadata(buildActivationSchemaFixture(surface),metadata);assert.equal(verifyActivationEvidence(green.report,green.trusted,0).status,'passed');assert.throws(()=>verifyActivationControl(green.report,green.trusted,0,selected),undefined,'a mutant cannot pass without its designated behavioral kill');rejected++;}
  const rejects=[
   ['missing inherited policy',r=>delete r.productionPolicy],
   ['wrong inherited policy',r=>r.productionPolicy='strict'],
   ['report-selected mode',r=>r.activationPolicy.mode='baseline'],
   ['wrong mutation',r=>r.activationPolicy.mutation=mutation==='control'?'core-skip-removed':'control'],
   ['removed repair source',r=>delete r.activationRepairSourceFiles[activationRepairSourcePaths[0]]],
   ['foreign repair source',r=>r.activationRepairSourceFiles.foreign='a'.repeat(64)],
   ['source hash drift',r=>r.assets['/assets/ely-api.js'].sourceSHA256='a'.repeat(64)],
   ['served hash drift',r=>r.assets['/assets/ely-api-interaction.js'].servedSHA256='a'.repeat(64)],
   ['mutation count drift',r=>r.activationPolicy.definition.originalCount++],
   ['missing HTTP proof',r=>r.httpAssetProof.pop()],
  ];
  for(const [label,mutate]of rejects){const bad=structuredClone(f.report);mutate(bad);assert.throws(()=>verifyActivationEvidence(bad,f.trusted,f.exit),undefined,label);rejected++;}
  if(mutation==='template-marker-omitted')for(const mutate of [r=>r.activationRenderMutation['/'].removedMarkers--,r=>r.activationRenderMutation['/'].templateTransformedSHA256='a'.repeat(64),r=>r.fixtures['/'].servedSHA256=r.fixtures['/'].sourceSHA256]){const bad=structuredClone(f.report);mutate(bad);assert.throws(()=>verifyActivationEvidence(bad,f.trusted,f.exit));rejected++;}
  // Even mutually forged report/invocation policies must match source constants.
  const forged=structuredClone(f);for(const x of [forged.report,forged.trusted])x.activationPolicy.definition.files.core.servedSHA256='a'.repeat(64);assert.throws(()=>verifyActivationPolicy(forged.report,forged.trusted));rejected++;
  const stem=join(temp,surface+'-'+mutation),reportPath=stem+'.report.json',invocationPath=stem+'.invocation.json',exitPath=stem+'.exit.json';
  await writeFile(reportPath,JSON.stringify(f.report));await writeFile(invocationPath,JSON.stringify(f.trusted));await writeFile(exitPath,JSON.stringify({revision:metadata.revision,tree:metadata.tree,runToken:f.report.runToken,productionPolicy:metadata.productionPolicy,activationPolicy:activationPolicy(selected),exitCode:f.exit}));
  const args=['scripts/palette-activation-replay.mjs',reportPath,invocationPath,exitPath,metadata.revision,metadata.tree,f.report.runToken,'repaired',mutation];
  const child=spawnSync(process.execPath,args,{cwd:base,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout),{evidenceValidation:'valid-replay',...expected,...(mutation==='control'?{}:{causalValidation:'passed',causalControl:'killed',kills:causal.kills}),rawExit:f.exit});positive++;
  args[args.length-1]=mutation==='control'?'core-skip-removed':'control';const wrong=spawnSync(process.execPath,args,{cwd:base,encoding:'utf8'});assert.equal(wrong.status,1);assert.match(wrong.stderr,/externally selected activation policy/);rejected++;
  args[args.length-1]=mutation;
  const badShapes=mutation==='post-close-owner-bypassed'?['after-click-boundary','query-run-payload'].map(kind=>buildActivationPostCloseRejectionFixture(surface,kind)):['core-skip-removed','family-emit-omitted','blanket-palette-submit-prevention'].includes(mutation)?[buildActivationShapeRejectionFixture(surface,mutation)]:[];
  for(const seed of badShapes){const bad=bindActivationMetadata(seed,metadata);assert.equal(verifyActivationEvidence(bad.report,bad.trusted,1).status,'failed');assert.throws(()=>verifyActivationControl(bad.report,bad.trusted,1,selected));await writeFile(reportPath,JSON.stringify(bad.report));const failure=spawnSync(process.execPath,args,{cwd:base,encoding:'utf8'});assert.equal(failure.status,1);assert.equal(failure.stderr,'');const denied=JSON.parse(failure.stdout);assert.equal(denied.evidenceValidation,'valid-replay');assert.equal(denied.status,'failed');assert.equal(denied.causalValidation,'failed');assert.equal(denied.rawExit,1);assert.match(denied.causalError.message,/original trusted click interval|fixed captured command payload|duplicates the command|owned emit omission|blanket submit reversal suppresses/);rejected++;}
  for(const kind of activationWitnessKinds(surface,mutation)){
   const bad=bindActivationMetadata(buildActivationWitnessRejectionFixture(surface,mutation,kind),metadata);
   assert.equal(verifyActivationEvidence(bad.report,bad.trusted,1).status,'failed');
   assert.deepEqual(bad.report.checks.flatMap(check=>check.oracles.filter(oracle=>oracle.prerequisite&&!oracle.pass)),[]);
   for(const {case:name,oracle:id}of metadata.activationPolicy.definition.kills)assert.equal(bad.report.checks.find(check=>check.name===name).oracles.find(oracle=>oracle.id===id).pass,false);
   assert.throws(()=>verifyActivationControl(bad.report,bad.trusted,1,selected),undefined,'required positive witness '+kind);
   await writeFile(reportPath,JSON.stringify(bad.report));const failure=spawnSync(process.execPath,args,{cwd:base,encoding:'utf8'});assert.equal(failure.error,undefined);assert.equal(failure.status,1,failure.stderr);assert.equal(failure.stderr,'');const denied=JSON.parse(failure.stdout);
   assert.equal(denied.evidenceValidation,'valid-replay');assert.equal(denied.status,'failed');assert.equal(denied.causalValidation,'failed');assert.equal(denied.rawExit,1);assert(denied.causalError.message.length>0);rejected++;
  }
  console.log(JSON.stringify({syntheticCurrentSource:true,surface,mutation,status:'passed'}));
 }
 }finally{await rm(temp,{recursive:true,force:true});}
 console.log(`Activation repair source/served JSON and CLI: ${positive} positives, ${rejected} rejected controls. Synthetic observations only; native causal outcomes require CI.`);
 return {positive,rejected};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runActivationRepairEvidenceTests();
