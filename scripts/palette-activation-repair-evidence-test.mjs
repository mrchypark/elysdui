// Synthetic raw observations joined to current independently compiled source.
// No browser/server, native behavior or successful causal kill is inferred here.
import assert from 'node:assert/strict';
import {loadPaletteHistory} from '../ui/gohtmx/tests/browser/palette-history-fixtures.mjs';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {buildActivationMutantSchemaFixture,buildActivationPostCloseRejectionFixture,buildActivationShapeRejectionFixture,buildActivationWitnessRejectionFixture,activationWitnessKinds} from './palette-activation-controls-evidence-test.mjs';
import {buildActivationSchemaFixture,drainResponseCaptures} from './palette-activation-evidence-test.mjs';
import {loadActivationInputs} from '../ui/gohtmx/tests/browser/palette-activation-inputs.mjs';
import {activationSelection,activationEnvironment,activationPolicy,verifyActivationPolicy,activationRepairSourcePaths} from '../ui/gohtmx/tests/browser/palette-activation-policy.mjs';
import {activationMutations,activationMutationMetadata,activationMutants,activationSHA256} from '../ui/gohtmx/tests/browser/palette-activation-mutants.mjs';
import {applyActivationAuditCandidateMutation} from '../ui/gohtmx/tests/browser/palette-activation-audit-candidate.mjs';
import {verifyActivationEvidence} from '../ui/gohtmx/tests/browser/palette-activation-evidence.mjs';
import {verifyActivationControl} from './palette-activation-controls.mjs';
import {paletteProductionPolicy,paletteAuditCandidatePins} from '../ui/gohtmx/tests/browser/palette-query-production-policy.mjs';
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
 const productionPolicy=paletteProductionPolicy(process.env.PALETTE_QUERY_PRODUCTION_POLICY||'activation-repair');assert.notEqual(productionPolicy,'strict');
 const base=fileURLToPath(new URL('../',import.meta.url));assert.equal(execFileSync('git',['status','--porcelain'],{cwd:base,encoding:'utf8'}).trim(),'','exact committed current-source repair replay');
 if(productionPolicy==='audit-candidate'){
  const sources=Object.fromEntries(await Promise.all(Object.entries(activationMutationMetadata('control').files).map(async([key,pin])=>[key,await readFile(join(base,pin.sourcePath),'utf8')])));
  const historicalMetadata=activationMutations.map(activationMutationMetadata);
  for(const mode of activationMutations){
   const {sources:output,metadata}=applyActivationAuditCandidateMutation(sources,mode),rule=activationMutants[mode];
   for(const [key,pin]of Object.entries(metadata.files)){
    assert.equal(pin.sourceSHA256,paletteAuditCandidatePins[pin.sourcePath],'candidate policy and transform source pins agree');
    assert.equal(output[key],rule?.source===key?sources[key].replace(rule.find,rule.replace):sources[key],'only the original causal mutation changes candidate bytes');
    if(pin.servedPath){assert.equal(pin.servedSHA256,activationSHA256(output[key]));assert.equal(pin.servedBytes,Buffer.byteLength(output[key]));}
    else{assert.equal(pin.servedSHA256,null);assert.equal(pin.servedBytes,null);}
    assert.throws(()=>applyActivationAuditCandidateMutation({...sources,[key]:sources[key]+'\n'},mode),/candidate source bytes/,'source drift stays rejected');
    assert.throws(()=>applyActivationAuditCandidateMutation({...sources,[key]:'!'+sources[key].slice(1)},mode),/candidate source SHA256/,'equal-length source drift stays rejected');
   }
  }
  for(const rule of Object.values(activationMutants)){
   assert.throws(()=>applyActivationAuditCandidateMutation({...sources,[rule.source]:sources[rule.source].replace(rule.find,'')},'control'),/exactly one original site/);
   assert.throws(()=>applyActivationAuditCandidateMutation({...sources,[rule.source]:sources[rule.source]+rule.find},'control'),/exactly one original site/);
  }
  assert.deepEqual(activationMutations.map(activationMutationMetadata),historicalMetadata,'candidate metadata never mutates historical pins or causal definitions');
 }
 const historical='ac28651be2869bab709bc617a3f7c50bf68d50f5';
 const history=loadPaletteHistory(base),historicalText=path=>history.source(historical,path).toString('utf8');
 const between=(text,start,end)=>text.slice(text.indexOf(start),text.indexOf(end));
 const oraclePath='ui/gohtmx/tests/browser/palette-activation-evidence.mjs';
 assert.equal(between(await readFile(join(base,oraclePath),'utf8'),'export function activationOracles','export const activationBrowserPaths'),between(historicalText(oraclePath),'export function activationOracles','export const activationBrowserPaths'),'historical activation oracles unchanged');
 const browserPath='ui/gohtmx/tests/browser/palette-activation-browser-test.mjs',browserSource=await readFile(join(base,browserPath),'utf8'),historicalBrowser=historicalText(browserPath);
 const actionBody=text=>between(between(text,' for(const name of activationCases){'," report.status=report.checks.every"),'  try{\n   await page.goto(origin+activationPage(name));','  }catch(error){current.error={message:error.message,stack:error.stack};}');
 assert.equal(actionBody(browserSource),actionBody(historicalBrowser),'historical navigation, interaction/action sequence and oracle evaluation unchanged');
 const caseLifecycle=between(browserSource,' for(const name of activationCases){'," report.status=report.checks.every");
 const boundary="try{await page.waitForLoadState('networkidle');}",unregister="page.off('response',captureResponse);",drain="try{await drainResponseCaptures(pending);}catch(error){report.transportErrors.push({check:name,message:`response capture drain:";
 const boundaryAt=caseLifecycle.indexOf(boundary),unregisterAt=caseLifecycle.indexOf(unregister),drainAt=caseLifecycle.indexOf(drain);
 assert.match(caseLifecycle,/page\.on\('response',captureResponse\);/,'each case installs the response listener');
 assert(boundaryAt>=0&&unregisterAt>boundaryAt&&drainAt>unregisterAt,'network-idle boundary freezes response events before listener removal and complete drain');
 assert.match(caseLifecycle,/catch\(error\)\{report\.transportErrors\.push\(\{check,message:String\(error\)\}\);\}/,'response-body failures remain transport errors');
 assert.match(caseLifecycle,/catch\(error\)\{report\.transportErrors\.push\(\{check:name,message:`response capture boundary:/,'boundary failures remain transport errors');
 assert.match(browserSource,/report\.status=report\.checks\.every\(c=>c\.status==='passed'\)&&paletteErrors\.every\(k=>!report\[k\]\.length\)\?'passed':'failed';/,'transport errors still fail the suite');
 const responseDrainSource=await readFile(join(base,'scripts/palette-activation-evidence-test.mjs'),'utf8');
 assert.match(responseDrainSource,/await responseCaptureDrainRegression\(\);/,'late-pending capture regression runs in the pure evidence suite');
 assert.match(responseDrainSource,/assert\.equal\(lateCaptureSettled,true/,'late-pending capture must be awaited');
 assert.match(responseDrainSource,/assert\.equal\(pending\.size,0/,'no capture remains pending after drain');
 const responseDrainError=new Error('synthetic response body read failure');
 await assert.rejects(drainResponseCaptures(new Set([Promise.reject(responseDrainError)])),error=>error===responseDrainError,'drain propagates body-read failures to transport-error reporting');
 const observer='ui/gohtmx/tests/browser/palette-activation-observer.js';assert.equal(await readFile(join(base,observer),'utf8'),historicalText(observer));
 const workflow=await readFile(join(base,'.github/workflows/palette-activation.yml'),'utf8');
 assert.match(workflow,/PALETTE_QUERY_PRODUCTION_POLICY: audit-candidate/);
 assert.deepEqual(activationEnvironment({}),{mode:'baseline',mutation:'control'});
 assert.deepEqual(activationEnvironment({PALETTE_ACTIVATION_MODE:'repaired'}),{mode:'repaired',mutation:'control'});
 assert.deepEqual(activationEnvironment({PALETTE_ACTIVATION_MODE:'repaired',PALETTE_QUERY_PRODUCTION_POLICY:'audit-candidate'}),{mode:'repaired',mutation:'control',productionPolicy:'audit-candidate'});
 assert.deepEqual([...workflow.matchAll(/- \{surface: ([a-z-]+), mutation: ([a-z-]+)\}/g)].map(m=>({surface:m[1],mutation:m[2]})),activationCollectionMatrix,'exact bounded native collection matrix');
 let positive=0,rejected=0;
 for(const options of [{mode:'unknown'},{mode:'baseline',mutation:'empty-enter-fallthrough'},{mode:'repaired',mutation:'unknown'},{mode:'repaired',skipPins:true}]){assert.throws(()=>activationSelection(options));rejected++;}
 // The default policy must still refuse this repaired production snapshot.
 await assert.rejects(()=>loadActivationInputs(base,'go-qualified'),/reviewed production input|loaded production assets pinned/);rejected++;
 if(productionPolicy==='audit-candidate'){await assert.rejects(()=>loadActivationInputs(base,'go-qualified',{mode:'repaired',mutation:'control'}),/fixed activation-repair production input/);rejected++;}
 const temp=await mkdtemp(join(tmpdir(),'palette-activation-repair-replay-'));
 try{for(const {surface,mutation}of activationCollectionMatrix){
  const selected={mode:'repaired',mutation,...(productionPolicy==='audit-candidate'?{productionPolicy}:{})},inputs=await loadActivationInputs(base,surface,selected),{assetBodies,fixtureBodies,...metadata}=inputs;
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
  const mutationIndex=args.length-1;if(productionPolicy==='audit-candidate')args.push(productionPolicy);
  const child=spawnSync(process.execPath,args,{cwd:base,encoding:'utf8',maxBuffer:8*1024*1024});assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);assert.deepEqual(JSON.parse(child.stdout),{evidenceValidation:'valid-replay',...expected,...(mutation==='control'?{}:{causalValidation:'passed',causalControl:'killed',kills:causal.kills}),rawExit:f.exit});positive++;
  if(productionPolicy==='audit-candidate')for(const policyArgs of [args.slice(0,-1),[...args.slice(0,-1),'activation-repair']]){const denied=spawnSync(process.execPath,policyArgs,{cwd:base,encoding:'utf8'});assert.equal(denied.status,1);assert.match(denied.stderr,/externally selected activation policy/);rejected++;}
  args[mutationIndex]=mutation==='control'?'core-skip-removed':'control';const wrong=spawnSync(process.execPath,args,{cwd:base,encoding:'utf8'});assert.equal(wrong.status,1);assert.match(wrong.stderr,/externally selected activation policy/);rejected++;
  args[mutationIndex]=mutation;
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
