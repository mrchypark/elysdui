import assert from 'node:assert/strict';
import {paletteProductionPolicy} from '../ui/gohtmx/tests/browser/palette-query-production-policy.mjs';
const productionPolicy=paletteProductionPolicy(process.env.PALETTE_QUERY_PRODUCTION_POLICY||'strict');
import {execFileSync,spawnSync} from 'node:child_process';
import {mkdtemp,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadReentryInputs} from '../ui/gohtmx/tests/browser/palette-query-reentry-inputs.mjs';
import {verifyReentryEvidence,reentryOracles,reconstructReentryWrites} from '../ui/gohtmx/tests/browser/palette-query-reentry-evidence.mjs';
import {buildReentryGuardSchemaFixture} from './palette-query-reentry-guard-evidence-test.mjs';
const base=fileURLToPath(new URL('../',import.meta.url)),surface='go-qualified';
assert.equal(execFileSync('git',['status','--porcelain'],{cwd:base,encoding:'utf8'}).trim(),'','current-source CLI regression requires clean committed source');
const temp=await mkdtemp(join(tmpdir(),'palette-reentry-replay-schema-'));
try {
  for(const mode of ['control','guard-removed']) {
    const {assetBodies,fixtureBodies,...metadata}=await loadReentryInputs(base,surface,mode,{productionPolicy});
    assert.deepEqual(JSON.parse(JSON.stringify(metadata)),metadata,'trusted inputs must survive JSON serialization without internal Set/Map leakage');
    const fixture=buildReentryGuardSchemaFixture(surface,mode),report=fixture.report;
    Object.assign(report,metadata,{surface,runToken:`synthetic-current-source-roundtrip-${mode}`});
    const invocation={...metadata,surface,runToken:report.runToken};
    const check=report.checks[0],fragment=report.fixtures['/fragment'];
    check.raw.fragment.bytes=fragment.bytes;check.raw.fragment.sha256=fragment.servedSHA256;
    check.oracles=reentryOracles(check.raw,surface);check.writes=reconstructReentryWrites(check.raw);
    const paths=[...Object.keys(report.assets),...Object.keys(report.fixtures)];
    const browserPaths=report.browserResponses.map(proof=>proof.path); // fixed source-owned used-asset inventory, not every CSS preload
    const proof=path=>{const entry=report.assets[path]||report.fixtures[path];return {path,status:200,bytes:entry.bytes,expectedSHA256:entry.servedSHA256,receivedSHA256:entry.servedSHA256};};
    report.httpAssetProof=paths.map(proof);report.browserResponses=browserPaths.map(proof);report.requests=[];
    for(const [phase,list]of [['preflight',paths],['browser',browserPaths]])for(const path of list){const entry=report.assets[path]||report.fixtures[path];report.requests.push({phase,path,method:'GET',htmx:null,status:200,responseSHA256:entry.servedSHA256,responseBytes:entry.bytes});}
    const rawExit=mode==='control'?0:1;
    const expected=verifyReentryEvidence(JSON.parse(JSON.stringify(report)),JSON.parse(JSON.stringify(invocation)),rawExit);
    const reportPath=join(temp,mode+'.report.json'),invocationPath=join(temp,mode+'.invocation.json'),exitPath=join(temp,mode+'.exit.json');
    await writeFile(reportPath,JSON.stringify(report));await writeFile(invocationPath,JSON.stringify(invocation));
    await writeFile(exitPath,JSON.stringify({productionPolicy,revision:metadata.revision,tree:metadata.tree,runToken:report.runToken,mode,exitCode:rawExit}));
    const args=['scripts/palette-query-reentry-replay.mjs',reportPath,invocationPath,exitPath,metadata.revision,metadata.tree,report.runToken,mode,productionPolicy];
    const child=spawnSync(process.execPath,args,{cwd:base,encoding:'utf8'});
    assert.equal(child.error,undefined);assert.equal(child.status,0,child.stderr);
    assert.deepEqual(JSON.parse(child.stdout),{evidenceValidation:'valid-replay',...expected,rawExit});
    const wrongPolicy=spawnSync(process.execPath,[...args.slice(0,-1),productionPolicy==='strict'?'activation-repair':'strict'],{cwd:base,encoding:'utf8'});
    assert.equal(wrongPolicy.error,undefined);assert.equal(wrongPolicy.status,1);assert.match(wrongPolicy.stderr,/independent invocation productionPolicy/);
    const missingPolicy=spawnSync(process.execPath,args.slice(0,-1),{cwd:base,encoding:'utf8'});
    assert.equal(missingPolicy.error,undefined);assert.equal(missingPolicy.status,productionPolicy==='strict'?0:1);if(productionPolicy!=='strict')assert.match(missingPolicy.stderr,/independent invocation productionPolicy/);
    const stale=args.slice();stale[4]='0'.repeat(40);
    const wrongRevision=spawnSync(process.execPath,stale,{cwd:base,encoding:'utf8'});
    assert.equal(wrongRevision.error,undefined);assert.equal(wrongRevision.status,1);assert.match(wrongRevision.stderr,/independent invocation revision/);
    args[args.length-2]=mode==='control'?'guard-removed':'control';
    const wrong=spawnSync(process.execPath,args,{cwd:base,encoding:'utf8'});
    assert.equal(wrong.error,undefined);assert.equal(wrong.status,1);assert.match(wrong.stderr,/independent invocation mode/);
    for(const [path,entry] of assetBodies)assert.equal(entry.body.length,metadata.assets[path].bytes);
    for(const [path,body] of fixtureBodies)assert.equal(body.length,metadata.fixtures[path].bytes);
  }
  console.log('Current-source reentry JSON roundtrip and positive CLI replay: control and guard-removed accepted; wrong expected modes/policies, missing policies and stale revisions rejected. Synthetic raw observations only; no browser/server.');
} finally {await rm(temp,{recursive:true,force:true});}
