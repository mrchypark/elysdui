import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {pathToFileURL} from 'node:url';
import {buildReentrySchemaFixture} from './palette-query-reentry-evidence-test.mjs';
import {reentryOracles,reconstructReentryWrites,verifyReentryEvidence,reentryReportName} from '../ui/gohtmx/tests/browser/palette-query-reentry-evidence.mjs';
import {reentryModes,reentryRuntimePath,reentryRuntimeSourcePath,reentryGuardBlock,reentryMutation,reentryMutationMetadata,reentryGuardKills} from '../ui/gohtmx/tests/browser/palette-query-reentry-mutants.mjs';
const copy=value=>structuredClone(value);
export function buildReentryGuardSchemaFixture(surface='go-qualified',mode='control',red=mode==='guard-removed') {
  const f=buildReentrySchemaFixture(surface,red), mutation=reentryMutationMetadata(mode);
  for(const target of [f.report,f.trusted]) {
    target.mode=mode;target.mutation=copy(mutation);
    Object.assign(target.assets[reentryRuntimePath],{sourceSHA256:mutation.sourceSHA256,servedSHA256:mutation.servedSHA256});
  }
  for(const proof of [...f.report.httpAssetProof,...f.report.browserResponses]) if(proof.path===reentryRuntimePath) proof.expectedSHA256=proof.receivedSHA256=mutation.servedSHA256;
  for(const request of f.report.requests) if(request.path===reentryRuntimePath) request.responseSHA256=mutation.servedSHA256;
  return f;
}
export function runReentryGuardSchemaTests() {
  const runtime=readFileSync(new URL('../ui/gohtmx/assets/ely-api-interaction.js',import.meta.url),'utf8');
  assert.equal(reentryMutation(runtime,'control'),runtime);
  const reversed=reentryMutation(runtime,'guard-removed');
  assert.equal(reversed,runtime.replace(reentryGuardBlock,''));
  assert(reversed.includes('queryField.focus({preventScroll: true});\n        syncCommandPalette(dialog, options[next], true);'));
  for(const bad of [runtime+' ',runtime.replace(reentryGuardBlock,''),runtime+reentryGuardBlock,runtime.replace("root.dataset.elyReady !== 'true'","root.dataset.elyReady !== 'false'")]) assert.throws(()=>reentryMutation(bad,'guard-removed'));
  assert.throws(()=>reentryMutation(runtime,'foreign'));
  let desired=0,causal=0,rejected=5;
  for(const surface of ['go-qualified','go-chapter','sdui']) for(const mode of reentryModes) {
    const fixture=buildReentryGuardSchemaFixture(surface,mode), verdict=verifyReentryEvidence(fixture.report,fixture.trusted,fixture.exit);
    assert.equal(verdict.status,mode==='control'?'passed':'failed');
    assert.deepEqual(verdict.causalKills,mode==='control'?[]:reentryGuardKills);
    assert.equal(reentryReportName(surface,mode),`palette-query-reentry-${surface}-${mode}.json`);
    if(mode==='control')desired++;else causal++;
    const reject=(label,change)=>{const f=copy(fixture);change(f);assert.throws(()=>verifyReentryEvidence(f.report,f.trusted,f.exit),undefined,surface+' '+mode+': '+label);rejected++;};
    for(const [label,change] of [
      ['missing report mode',f=>delete f.report.mode],['missing trusted mode',f=>delete f.trusted.mode],
      ['wrong report mode',f=>f.report.mode=mode==='control'?'guard-removed':'control'],
      ['coordinated foreign mode',f=>f.report.mode=f.trusted.mode='foreign'],
      ['missing mutation',f=>delete f.report.mutation],['missing trusted mutation',f=>delete f.trusted.mutation],
      ['foreign mutation field',f=>{f.report.mutation.extra=true;f.trusted.mutation.extra=true;}],
      ['coordinated wrong source hash',f=>{f.report.mutation.sourceSHA256=f.trusted.mutation.sourceSHA256='0'.repeat(64);}],
      ['coordinated wrong served hash',f=>{f.report.mutation.servedSHA256=f.trusted.mutation.servedSHA256='0'.repeat(64);}],
      ['coordinated wrong block hash',f=>{f.report.mutation.removedBlockSHA256=f.trusted.mutation.removedBlockSHA256='0'.repeat(64);}],
      ['coordinated wrong path',f=>{f.report.mutation.path=f.trusted.mutation.path='/assets/foreign.js';}],
      ['coordinated wrong classification',f=>{f.report.mutation.classification=f.trusted.mutation.classification='green';}],
      ['unjoined runtime source',f=>{f.report.sourceFiles[reentryRuntimeSourcePath]=f.trusted.sourceFiles[reentryRuntimeSourcePath]='0'.repeat(64);}],
      ['coordinated served asset forgery',f=>{for(const target of [f.report,f.trusted])target.assets[reentryRuntimePath].servedSHA256='0'.repeat(64);}],
      ['coordinated source asset forgery',f=>{for(const target of [f.report,f.trusted])target.assets[reentryRuntimePath].sourceSHA256='0'.repeat(64);}],
      ['second mutated asset',f=>{for(const target of [f.report,f.trusted])target.assets['/reentry-observer.js'].servedSHA256='0'.repeat(64);}],
      ['mutated fixture',f=>{for(const target of [f.report,f.trusted])target.fixtures['/fragment'].servedSHA256='0'.repeat(64);}],
      ['stale runtime response',f=>{f.report.browserResponses.find(p=>p.path===reentryRuntimePath).receivedSHA256='0'.repeat(64);}],
      ['missing runtime proof',f=>{f.report.httpAssetProof=f.report.httpAssetProof.filter(p=>p.path!==reentryRuntimePath);}],
      ['duplicated runtime proof',f=>{f.report.browserResponses.push(copy(f.report.browserResponses.find(p=>p.path===reentryRuntimePath)));}],
      ['changed own source',f=>{const key=Object.keys(f.report.reentrySourceFiles).find(x=>x.endsWith('mutants.mjs'));f.report.reentrySourceFiles[key]='0'.repeat(64);}],
      ['stale token',f=>f.report.runToken='stale-native-run'],['stale status',f=>f.report.status=mode==='control'?'failed':'passed'],
      ['wrong raw exit',f=>f.exit=1-f.exit],
    ])reject(label,change);
    if(mode==='guard-removed') {
      const surviving=buildReentryGuardSchemaFixture(surface,mode,false);
      assert.throws(()=>verifyReentryEvidence(surviving.report,surviving.trusted,surviving.exit),/every designated guard reversal kill/);rejected++;
      // A mode switch coordinated with cached status and every asset proof still
      // cannot make the reverse variant green: the raw source oracle is rerun.
      const noOldWrite=copy(fixture),raw=noOldWrite.report.checks[0].raw;
      const checkpoint=raw.log.events.find(e=>e.phase==='arrow-continuation-return'),returned=raw.log.events.find(e=>e.phase==='native-focus-return');
      checkpoint.state.activeID=returned.state.activeID;checkpoint.state.activeToken=returned.state.activeToken;
      const check=noOldWrite.report.checks[0];check.oracles=reentryOracles(raw,surface);check.writes=reconstructReentryWrites(raw);check.finalCapture={log:copy(raw.log),baseTrace:copy(raw.baseTrace)};
      assert.throws(()=>verifyReentryEvidence(noOldWrite.report,noOldWrite.trusted,1));rejected++;
    }
  }
  const result={suite:'palette-query-reentry-guard-schema',syntheticOnly:true,desired,causal,rejected};console.log(JSON.stringify(result));return result;
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)runReentryGuardSchemaTests();
