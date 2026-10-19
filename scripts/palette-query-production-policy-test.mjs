import assert from 'node:assert/strict';
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {paletteProductionPolicy,paletteProductionPaths,paletteReviewedProduction,paletteActivationRepairPins,verifyPaletteProductionPolicy} from '../ui/gohtmx/tests/browser/palette-query-production-policy.mjs';
import {loadPaletteInputs,paletteSHA} from '../ui/gohtmx/tests/browser/palette-query-inputs.mjs';
import {loadSupplementalInputs} from '../ui/gohtmx/tests/browser/palette-query-supplemental-inputs.mjs';
import {verifyPaletteEvidence} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';
import {verifySupplementalEvidence} from '../ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs';
import {buildPaletteSchemaFixture} from './palette-query-evidence-test.mjs';
import {buildSupplementalSchemaFixture} from './palette-query-supplemental-evidence-test.mjs';
import {reentryGuardBlock,reentryMutation,reentryRuntimePins} from '../ui/gohtmx/tests/browser/palette-query-reentry-mutants.mjs';
const base=fileURLToPath(new URL('../',import.meta.url)),surface='go-qualified';
const productionPolicy=paletteProductionPolicy(process.env.PALETTE_QUERY_PRODUCTION_POLICY||'strict');
assert.equal(paletteProductionPolicy(),'strict');
assert.deepEqual(paletteProductionPaths(),paletteReviewedProduction);
assert.deepEqual(paletteProductionPaths('activation-repair'),[...paletteReviewedProduction,'ui/gohtmx/assets/ely-api.js']);
assert.deepEqual(Object.keys(paletteActivationRepairPins).sort(),paletteProductionPaths('activation-repair').sort());
for(const bad of ['foreign','HEAD','',null,{},true])assert.throws(()=>paletteProductionPolicy(bad),/source-owned production policy/);
for(const policy of ['strict','activation-repair']){
  verifyPaletteProductionPolicy({productionPolicy:policy},{productionPolicy:policy});
  for(const report of [{},{productionPolicy:'foreign'},{productionPolicy:policy==='strict'?'activation-repair':'strict'}])assert.throws(()=>verifyPaletteProductionPolicy(report,{productionPolicy:policy}));
  assert.throws(()=>verifyPaletteProductionPolicy({productionPolicy:policy},{}));
}
const historical=execFileSync('git',['show','ac28651be2869bab709bc617a3f7c50bf68d50f5:ui/gohtmx/assets/ely-api-interaction.js'],{cwd:base,encoding:'utf8'});
const runtime=await readFile(join(base,'ui/gohtmx/assets/ely-api-interaction.js'),'utf8');
assert.equal(paletteSHA(reentryGuardBlock),'99b8a01d26a7c7918439eaf559c1274b55275a9f14481f1896e13c307ed60363');
assert.equal(Buffer.byteLength(reentryGuardBlock),1321);
for(const [policy,source] of [['strict',historical],[productionPolicy,runtime]]){
  assert.equal(paletteSHA(reentryMutation(source,'control',policy)),reentryRuntimePins[policy].sourceSHA256);
  assert.equal(reentryMutation(source,'guard-removed',policy),source.replace(reentryGuardBlock,''));
}
if(productionPolicy==='activation-repair'){
  assert.throws(()=>reentryMutation(runtime,'control'),/reviewed guarded runtime source/);
  assert.throws(()=>reentryMutation(historical,'control',productionPolicy),/reviewed guarded runtime source/);
  await assert.rejects(loadPaletteInputs(base,surface),/reviewed production input: ui\/gohtmx\/assets\/ely-api.js/);
}
await assert.rejects(loadPaletteInputs(base,surface,{productionPolicy:'foreign'}),/source-owned production policy/);
assert.equal(execFileSync('git',['status','--porcelain'],{cwd:base,encoding:'utf8'}).trim(),'','source-built policy replay requires clean committed source');
const temp=await mkdtemp(join(tmpdir(),'palette-production-policy-'));let positives=0,negatives=0;
try{
  for(const suite of ['original','supplemental']){
    const {assetBodies,fixtureBodies,...metadata}=suite==='original'?await loadPaletteInputs(base,surface,{productionPolicy}):await loadSupplementalInputs(base,surface,'control',{productionPolicy});
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
  console.log(`Production policy source and serialized CLI tests passed: ${positives} current-source synthetic positives, ${negatives} reason-checked negatives. Strict default rejects candidate core; exact historical/candidate guard pins remain separate. No native evidence.`);
}finally{await rm(temp,{recursive:true,force:true});}
