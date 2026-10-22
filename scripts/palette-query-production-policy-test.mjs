import assert from 'node:assert/strict';
import {loadPaletteHistory} from '../ui/gohtmx/tests/browser/palette-history-fixtures.mjs';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {paletteProductionPolicy,paletteProductionPaths,paletteReviewedProduction,paletteActivationRepairPins,paletteAuditCandidateProduction,paletteAuditCandidateAssets,verifyPaletteProductionPolicy} from '../ui/gohtmx/tests/browser/palette-query-production-policy.mjs';
import {paletteSourcePaths,paletteBaseline} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';
import {loadPaletteInputs,paletteSHA} from '../ui/gohtmx/tests/browser/palette-query-inputs.mjs';
import {loadSupplementalInputs} from '../ui/gohtmx/tests/browser/palette-query-supplemental-inputs.mjs';
import {verifyPaletteEvidence} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';
import {verifySupplementalEvidence} from '../ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs';
import {buildPaletteSchemaFixture} from './palette-query-evidence-test.mjs';
import {buildSupplementalSchemaFixture} from './palette-query-supplemental-evidence-test.mjs';
import {reentryGuardBlock,reentryMutation,reentryRuntimePins} from '../ui/gohtmx/tests/browser/palette-query-reentry-mutants.mjs';
import {loadContextOwnerAssets,productionCSSReferences} from '../ui/gohtmx/tests/browser/context-owner-assets.mjs';
const base=fileURLToPath(new URL('../',import.meta.url)),surface='go-qualified';
const productionPolicy=paletteProductionPolicy(process.env.PALETTE_QUERY_PRODUCTION_POLICY||'strict');
assert.equal(paletteProductionPolicy(),'strict');
assert.deepEqual(paletteProductionPaths(),paletteReviewedProduction);
assert.deepEqual(paletteProductionPaths('activation-repair'),[...paletteReviewedProduction,'ui/gohtmx/assets/ely-api.js','ui/gohtmx/assets/ely-api-interaction.css','ui/gohtmx/assets/ely/icons/check.svg']);
assert(!paletteReviewedProduction.includes('ui/gohtmx/assets/ely-api-interaction.css'), 'strict historical policy must not admit repaired CSS');
assert(!paletteReviewedProduction.includes('ui/gohtmx/assets/ely/icons/check.svg'), 'strict historical inventory stays immutable');
assert.deepEqual(paletteProductionPaths('audit-candidate'),[...paletteReviewedProduction,'ui/gohtmx/assets/ely-api.js','ui/gohtmx/assets/ely/icons/check.svg',...paletteAuditCandidateProduction,...paletteAuditCandidateAssets]);
// The audited candidate allowance is exactly the three audited production
// files, and it never widens strict or activation-repair.
assert.deepEqual(paletteAuditCandidateProduction,['ui/gohtmx/assets/ely-controls.js','ui/gohtmx/ui.go','ui/gohtmx/component.go']);
assert.deepEqual(paletteAuditCandidateAssets,['ui/gohtmx/assets/ely-api-interaction.css','ui/gohtmx/assets/ely-controls.css']);
for(const path of paletteAuditCandidateProduction){
  assert(!paletteReviewedProduction.includes(path),'audited file is not a reviewed file');
  assert(!paletteProductionPaths('strict').includes(path),'audited file is not strict-allowed');
  assert(!paletteProductionPaths('activation-repair').includes(path),'audited file is not activation-repair-allowed');
}
for(const path of paletteAuditCandidateAssets){
  assert(!paletteReviewedProduction.includes(path),'audited asset is not a reviewed file');
  assert(!paletteProductionPaths('strict').includes(path),'audited asset is not strict-allowed');
  assert(!paletteProductionPaths('activation-repair').includes(path),'audited asset is not activation-repair-allowed');
}
// The reviewed activation-repair digests stay byte-identical.
assert.deepEqual(paletteActivationRepairPins,{
  'ui/gohtmx/assets/ely/icons/check.svg':'e4bab3ed87dca8961e94a4e72ce23c17a674bebcb72bbbbe5eff4ef41532aa83',
  'ui/gohtmx/assets/ely-api-interaction.css':'abecc707408f8987111997910a2e50fc900c00a6b7e15bdbb0183d67eb12c94e',
  'ui/gohtmx/assets/ely-api.js':'6039000e8e983d7ebe55cd733cb4012810d2f15f949a2e1286f605966ad12116',
  'ui/gohtmx/assets/ely-api-interaction.js':'53f29f4c6232ee96c7e8fa45a61dba5a900a6bb7544f56c163c72052b2f3f5f6',
  'ui/gohtmx/templates/ely-api-interaction.html':'04bb573b7f95b8517d444722efad5aea5c7fa63fe5ece31ebc7bfb3db6b04fec',
  'adapters/gohtmx/catalogue_manifest.json.gz':'b20ca87a4f602f3ba5519d66cf25ed20696a4b06071e5289bb6e4f75f202e96b',
});
assert.deepEqual(Object.keys(paletteActivationRepairPins).sort(),paletteProductionPaths('activation-repair').sort());
for(const bad of ['foreign','HEAD','',null,{},true])assert.throws(()=>paletteProductionPolicy(bad),/source-owned production policy/);
for(const policy of ['strict','activation-repair','audit-candidate']){
  verifyPaletteProductionPolicy({productionPolicy:policy},{productionPolicy:policy});
  for(const report of [{},{productionPolicy:'foreign'},{productionPolicy:policy==='strict'?'audit-candidate':'strict'}])assert.throws(()=>verifyPaletteProductionPolicy(report,{productionPolicy:policy}));
  assert.throws(()=>verifyPaletteProductionPolicy({productionPolicy:policy},{}));
}
// A report can never select its own policy: the independent invocation record
// decides, and a report naming any other policy is rejected.
for(const policy of ['strict','activation-repair','audit-candidate'])for(const other of ['strict','activation-repair','audit-candidate'])if(other!==policy)assert.throws(()=>verifyPaletteProductionPolicy({productionPolicy:other},{productionPolicy:policy}),/independent production policy/);
const historical=loadPaletteHistory(base).source('ac28651be2869bab709bc617a3f7c50bf68d50f5','ui/gohtmx/assets/ely-api-interaction.js').toString('utf8');
const runtime=await readFile(join(base,'ui/gohtmx/assets/ely-api-interaction.js'),'utf8');
assert.equal(paletteSHA(reentryGuardBlock),'99b8a01d26a7c7918439eaf559c1274b55275a9f14481f1896e13c307ed60363');
assert.equal(Buffer.byteLength(reentryGuardBlock),1321);
for(const [policy,source] of [['strict',historical]].concat(productionPolicy==='strict'?[]:[[productionPolicy,runtime]])){
  assert.equal(paletteSHA(reentryMutation(source,'control',policy)),reentryRuntimePins[policy].sourceSHA256);
  assert.equal(reentryMutation(source,'guard-removed',policy),source.replace(reentryGuardBlock,''));
}
if(productionPolicy==='activation-repair'){
  assert.throws(()=>reentryMutation(runtime,'control'),/reviewed guarded runtime source/);
  assert.throws(()=>reentryMutation(historical,'control',productionPolicy),/reviewed guarded runtime source/);
}
// The strict boundary is a negative control for every policy: it keeps
// rejecting the changed candidate core exactly as before, and the audited
// candidate allowance never widens it.
// The audited candidate allowance is exactly its source-owned set, compared
// against clean HEAD bytes; a foreign allowance is not accepted.
for(const foreign of ['foreign','HEAD',''])await assert.rejects(loadPaletteInputs(base,surface,{productionPolicy:foreign}),/source-owned production policy/);
// The loader outcome of a policy is computed independently from the source
// bytes: the first production input that differs from its reference - source
// file or loaded asset - is the exact rejection the loader must report. A
// policy whose inputs all match is satisfiable here and must load.
const baseline=loadPaletteHistory(base);
const productionPaths=paletteSourcePaths.filter(path=>!/tests\/|^scripts\/|^package|^\.github/.test(path));
const headSHA=path=>paletteSHA(execFileSync('git',['show','HEAD:'+path],{cwd:base,maxBuffer:16*1024*1024}));
const baselineSHA=path=>baseline.sha256(paletteBaseline,path);
const currentSHA=async path=>paletteSHA(await readFile(join(base,path)));
// The loaded production assets are discovered exactly like the loader does,
// so the expected rejection can name the loaded asset as well.
const loadedAssetPaths=await (async()=>{
  const bodies=await loadContextOwnerAssets(base);
  const pending=['/assets/ely-controls.css','/assets/ely-patterns.css','/assets/ely-controls.js','/assets/ely-patterns.js',...(surface==='sdui'?['/assets/sdui.css','/assets/sdui.js']:[])];
  for(let index=0;index<pending.length;index++){
    const path=pending[index];if(bodies.has(path))continue;
    const source=path.startsWith('/assets/sdui')?'adapters/gohtmx':'ui/gohtmx';
    const body=await readFile(join(base,source,path));
    bodies.set(path,{body});
    if(path.endsWith('.css'))pending.push(...productionCSSReferences(body.toString('utf8'),path));
  }
  return [...bodies.keys()].map(path=>({servedPath:path,sourcePath:(path.startsWith('/assets/sdui')?'adapters/gohtmx':'ui/gohtmx')+path}));
})();
// Resolve each asset through its selected policy below. The newly loaded
// CopyButton icon has no entry in the immutable historical fixture inventory.
const policyRejection=async policy=>{
  if(policy==='activation-repair')for(const [path,expected] of Object.entries(paletteActivationRepairPins)){
    const current=await currentSHA(path);
    if(current!==expected)return {kind:'fixed-digest',path,message:'fixed activation-repair production input: '+path};
  }
  const allowed=new Set(paletteProductionPaths(policy));
  for(const path of productionPaths){
    const current=await currentSHA(path);
    const expected=allowed.has(path)?headSHA(path):baselineSHA(path);
    if(current!==expected)return {kind:'production-input',path,message:'reviewed production input: '+path};
  }
  for(const {servedPath,sourcePath} of loadedAssetPaths){
    const current=await currentSHA(sourcePath);
    const expected=allowed.has(sourcePath)?headSHA(sourcePath):baselineSHA(sourcePath);
    if(current!==expected)return {kind:'loaded-asset',path:servedPath,message:'loaded production assets pinned to reviewed source: '+servedPath};
  }
  return null;
};
// The loader's own outcome for a policy, reduced to the exact custom
// assertion message it raised. The loader is never allowed to name the
// expected value: the expectation is derived independently below.
const loaderRejection=async policy=>{
  try{await loadPaletteInputs(base,surface,{productionPolicy:policy});return null;}
  catch(error){return String(error.message).split('\n')[0];}
};
// The expected rejection of every policy is computed independently from the
// source bytes and the source-owned reference set. The loader must then
// reject with exactly that message. A policy whose inputs all match its
// reference is satisfiable and must load without raising.
const expectations={};
let policyNegatives=0;
for(const policy of ['strict','activation-repair','audit-candidate']){
  const expected=await policyRejection(policy),actual=await loaderRejection(policy);
  assert.equal(actual,expected===null?null:expected.message,'exact rejection message for policy '+policy);
  expectations[policy]=expected;
  if(expected!==null)policyNegatives++;
}
// Strict is the negative control that must survive every policy: the changed
// candidate core is compared against the historical baseline and therefore
// keeps being rejected, and no audited allowance ever widens it.
assert.notEqual(headSHA('ui/gohtmx/assets/ely-api.js'),baselineSHA('ui/gohtmx/assets/ely-api.js'),'candidate core differs from the historical baseline');
assert.equal(expectations.strict.message,'reviewed production input: ui/gohtmx/assets/ely-api.js','strict keeps rejecting the changed candidate core');
// activation-repair is the second negative control: the audited change also
// carries changed interaction CSS, which the fixed activation-repair
// digests do not admit.
assert.equal(expectations['activation-repair'].message,'fixed activation-repair production input: ui/gohtmx/assets/ely-api-interaction.css','activation-repair keeps rejecting the changed audited CSS');
// The audited candidate allowance is not silently widened into the other
// policies: each of them keeps its own finite boundary.
for(const path of paletteAuditCandidateProduction)assert(!paletteProductionPaths('strict').includes(path),'audited file is not strict-allowed');
for(const policy of ['strict','activation-repair','audit-candidate'])console.log(`policy ${policy}: ${expectations[policy]===null?'ACCEPTED (all production inputs match their reference)':'REJECTED ('+expectations[policy].message+')'}`);
const selectedRejection=expectations[productionPolicy];
// Historical policies remain reason-checked negative controls, but a selected
// audit candidate must exercise the positive replay instead of passing by skip.
if(productionPolicy==='audit-candidate')assert.equal(selectedRejection,null,'selected audit-candidate must be accepted for positive replay');
// The positive replay needs a committed source tree that satisfies the
// selected policy. A tree that still carries the audited change is rejected
// by strict and activation-repair on purpose: that rejection is the negative
// control, and it is asserted exactly above. Only a policy that is genuinely
// satisfied by the committed tree runs the positive replay.
const positiveReplay=selectedRejection===null;
if(!positiveReplay)console.log(`NEGATIVE CONTROL: selected production policy ${productionPolicy} rejects the current tree with the exact message "${selectedRejection.message}".`);
const temp=await mkdtemp(join(tmpdir(),'palette-production-policy-'));let positives=0,negatives=0;
try{
  if(productionPolicy==='activation-repair'){
    // Exercise the real loader against disposable source bytes, not a cached
    // hash comparison. These failures occur before fixture compilation.
    const tampered=join(temp,'tampered-source');
    execFileSync('git',['clone','--shared','--quiet',base,tampered],{stdio:'pipe'});
    const cssPath='ui/gohtmx/assets/ely-api-interaction.css';
    const css=await readFile(join(tampered,cssPath));
    const changed=Buffer.from(css);changed[0]=changed[0]===32?9:32;
    assert.equal(changed.length,css.length);assert.notDeepEqual(changed,css);
    await writeFile(join(tampered,cssPath),changed);
    await assert.rejects(loadPaletteInputs(tampered,surface,{productionPolicy}),/fixed activation-repair production input: ui\/gohtmx\/assets\/ely-api-interaction.css/);
    negatives++;
    await writeFile(join(tampered,cssPath),css);
    const iconPath='ui/gohtmx/assets/ely/icons/check.svg';
    const icon=await readFile(join(tampered,iconPath)),iconChanged=Buffer.from(icon);
    iconChanged[0]=iconChanged[0]===32?9:32;
    await writeFile(join(tampered,iconPath),iconChanged);
    await assert.rejects(loadPaletteInputs(tampered,surface,{productionPolicy}),/fixed activation-repair production input: ui\/gohtmx\/assets\/ely\/icons\/check.svg/);
    negatives++;
    await writeFile(join(tampered,iconPath),icon);
    const otherPath='ui/gohtmx/assets/ely-patterns.js';
    const other=await readFile(join(tampered,otherPath)),otherChanged=Buffer.from(other);
    otherChanged[0]=otherChanged[0]===32?9:32;
    await writeFile(join(tampered,otherPath),otherChanged);
    await assert.rejects(loadPaletteInputs(tampered,surface,{productionPolicy}),/reviewed production input: ui\/gohtmx\/assets\/ely-patterns.js/);
    negatives++;
  }
  for(const suite of (positiveReplay?['original','supplemental']:[])){
    const {assetBodies,fixtureBodies,...metadata}=suite==='original'?await loadPaletteInputs(base,surface,{productionPolicy}):await loadSupplementalInputs(base,surface,'control',{productionPolicy});
    assert.equal(metadata.dirty,'','source-built policy replay requires a clean committed source tree');
    assert.deepEqual(JSON.parse(JSON.stringify(metadata)),metadata,'serialized trusted inputs');
    const fixture=suite==='original'?buildPaletteSchemaFixture(surface,'focus'):buildSupplementalSchemaFixture(surface),report=fixture.report;
    Object.assign(report,metadata,{runToken:'synthetic-current-source-policy-'+suite});
    const invocation={...metadata,surface,runToken:report.runToken,...(suite==='original'?{group:'focus'}:{mode:'control'})};
    const proof=p=>{const x=report.assets[p.path]||report.fixtures[p.responseFixture||p.path];assert(x);return {...p,status:200,expectedSHA256:x.servedSHA256,receivedSHA256:x.servedSHA256,bytes:x.bytes};};
    report.httpAssetProof=[...Object.keys(report.assets),...Object.keys(report.fixtures)].map(path=>proof({path}));
    report.browserResponses=report.browserResponses.map(proof);
    report.requests=report.requests.filter(p=>p.check!==null).map(p=>{const x=report.assets[p.path]||report.fixtures[p.responseFixture||p.path];return {...p,responseSHA256:x.servedSHA256,responseBytes:x.bytes};});
    report.requests=[...Object.keys(report.assets),...Object.keys(report.fixtures)].map(path=>{const x=report.assets[path]||report.fixtures[path];return {check:null,path,method:'GET',htmx:null,status:200,responseSHA256:x.servedSHA256,responseBytes:x.bytes};}).concat(report.requests);
    const verify=suite==='original'?verifyPaletteEvidence:verifySupplementalEvidence;
    const expected=verify(JSON.parse(JSON.stringify(report)),JSON.parse(JSON.stringify(invocation)),0);
    const paths=['report','invocation','exit'].map(name=>join(temp,suite+'.'+name+'.json'));
    const exit={productionPolicy,revision:metadata.revision,tree:metadata.tree,runToken:report.runToken,exitCode:0};
    for(const [index,value]of [report,invocation,exit].entries())await writeFile(paths[index],JSON.stringify(value));
    const script=suite==='original'?'scripts/palette-query-replay.mjs':'scripts/palette-query-supplemental-replay.mjs';
    const args=[script,...paths,metadata.revision,metadata.tree,report.runToken,productionPolicy];
    const invoke=a=>spawnSync(process.execPath,a,{cwd:base,encoding:'utf8'});
    const positive=invoke(args);assert.equal(positive.error,undefined);assert.equal(positive.status,0,positive.stderr);assert.deepEqual(JSON.parse(positive.stdout),{evidenceValidation:'valid-replay',...expected,rawExit:0});positives++;
    const reject=(a,reason)=>{const result=invoke(a);assert.equal(result.error,undefined);assert.equal(result.status,1,result.stderr);assert.match(result.stderr,reason);negatives++;};
    if(productionPolicy==='strict')assert.equal(invoke(args.slice(0,-1)).status,0);else reject(args.slice(0,-1),/independent invocation productionPolicy/);
    reject([...args.slice(0,-1),productionPolicy==='strict'?'activation-repair':'strict'],/independent invocation productionPolicy/);
    reject([...args.slice(0,-1),'foreign'],/independent invocation productionPolicy/);
    const stale=[...args];stale[4]='0'.repeat(40);reject(stale,/independent invocation revision/);
    const changed=structuredClone(report),changedInvocation=structuredClone(invocation),key=Object.keys(changed.sourceFiles)[0];changed.sourceFiles[key]=changedInvocation.sourceFiles[key]='0'.repeat(64);
    await writeFile(paths[0],JSON.stringify(changed));await writeFile(paths[1],JSON.stringify(changedInvocation));reject(args,/current-source replay sourceFiles/);
    await writeFile(paths[0],JSON.stringify({...report,productionPolicy:'foreign'}));await writeFile(paths[1],JSON.stringify(invocation));reject(args,/source-owned production policy/);
    if(productionPolicy==='activation-repair'){
      for(const [index,value]of [report,invocation,exit].entries())await writeFile(paths[index],JSON.stringify({...value,productionPolicy:'strict'}));
      reject([...args.slice(0,-1),'strict'],/reviewed production input: ui\/gohtmx\/assets\/ely-api.js/);
    }

    for(const [path,entry]of assetBodies)assert.equal(entry.body.length,metadata.assets[path].bytes);
    for(const [path,body]of fixtureBodies)assert.equal(body.length,metadata.fixtures[path].bytes);
  }
  if(positiveReplay){
    assert(positives>0,'a positive replay must run at least one current-source positive check');
    console.log(`Production policy source and serialized CLI tests passed: ${positives} current-source synthetic positives, ${negatives} reason-checked negatives. Strict default rejects candidate core; exact historical/candidate guard pins remain separate. No native evidence.`);
  }else{
    // A run that verified nothing positive must never read as a pass. The
    // exact rejection was asserted above as a negative control; the skipped
    // positive replay is reported loudly instead of being counted as success.
    assert.equal(positives,0,'a skipped positive replay must not report positive checks');
    negatives+=policyNegatives;
    console.log(`POSITIVE REPLAY SKIPPED (0 positive checks): policy ${productionPolicy} rejects the current tree with the exact message "${selectedRejection.message}". The rejection was asserted as a negative control.`);
    console.log(`NEGATIVE-CONTROL-ONLY RUN - NO POSITIVE PATH WAS VERIFIED: ${negatives} reason-checked negatives, ${positives} positives. Strict default rejects candidate core; exact historical/candidate guard pins remain separate. No native evidence.`);
  }
}finally{await rm(temp,{recursive:true,force:true});}
