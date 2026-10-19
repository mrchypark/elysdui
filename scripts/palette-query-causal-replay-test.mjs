import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile,mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {mutateSupplementalSchemaFixture} from './palette-query-supplemental-schema-fixture.mjs';
import {buildSupplementalSchemaFixture} from './palette-query-supplemental-evidence-test.mjs';
import {buildReentryGuardSchemaFixture} from './palette-query-reentry-guard-evidence-test.mjs';
import {supplementalOracles,verifySupplementalEvidence} from '../ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs';
import {reentryOracles,reconstructReentryWrites,verifyReentryEvidence} from '../ui/gohtmx/tests/browser/palette-query-reentry-evidence.mjs';
import {causalCompletion,causalCompletionEmission,causalSelection,causalRunToken,causalAnchor,loadCausalInputs,verifyCausalRun} from './palette-query-causal-controls.mjs';
const base=fileURLToPath(new URL('../',import.meta.url)),temp=await mkdtemp(join(tmpdir(),'palette-causal-replay-')),sha=s=>createHash('sha256').update(s).digest('hex');
let positive=0,negative=0;
try {
 for(const [suite,mode]of [['supplemental','control'],['supplemental','active-peer'],['reentry','control'],['reentry','guard-removed']]){
  const selection=causalSelection(suite,'go-qualified',mode,process.env.PALETTE_QUERY_PRODUCTION_POLICY||'strict'),current=await loadCausalInputs(base,selection),runToken=causalRunToken();
  assert.deepEqual(JSON.parse(JSON.stringify(current)),current,'JSON-safe independent source inputs');
  const f=suite==='supplemental'?buildSupplementalSchemaFixture(selection.surface):buildReentryGuardSchemaFixture(selection.surface,mode);
  if(suite==='supplemental'&&mode!=='control')mutateSupplementalSchemaFixture(f,mode,await readFile(new URL('../ui/gohtmx/assets/ely-api-interaction.js',import.meta.url),'utf8'));
  const report=f.report;Object.assign(report,current,{runToken});
  if(suite==='supplemental')for(const c of report.checks){c.oracles=supplementalOracles(c,selection.surface);c.status=c.oracles.every(o=>o.pass)?'passed':'failed';c.finalTrace=structuredClone(c.raw.after.log);}
  else {const c=report.checks[0];c.raw.fragment.bytes=current.fixtures['/fragment'].bytes;c.raw.fragment.sha256=current.fixtures['/fragment'].servedSHA256;c.oracles=reentryOracles(c.raw,selection.surface);c.writes=reconstructReentryWrites(c.raw);}
  report.status=mode==='control'?'passed':'failed';
  const paths=[...Object.keys(current.assets),...Object.keys(current.fixtures)],entry=p=>current.assets[p]||current.fixtures[p];
  const proof=path=>({path,status:200,bytes:entry(path).bytes,expectedSHA256:entry(path).servedSHA256,receivedSHA256:entry(path).servedSHA256});
  report.httpAssetProof=paths.map(proof);
  report.browserResponses=report.browserResponses.map(p=>({...p,...proof(p.path)}));
  if(suite==='supplemental'){
   report.requests=report.requests.filter(p=>p.check!==null).map(p=>({...p,responseSHA256:entry(p.path).servedSHA256,responseBytes:entry(p.path).bytes}));
   report.requests.unshift(...paths.map(path=>({path,check:null,method:'GET',htmx:null,status:200,responseSHA256:entry(path).servedSHA256,responseBytes:entry(path).bytes})));
  }else{
   report.requests=[];for(const [phase,list]of [['preflight',paths],['browser',report.browserResponses.map(p=>p.path)]])for(const path of list)report.requests.push({phase,path,method:'GET',htmx:null,status:200,responseSHA256:entry(path).servedSHA256,responseBytes:entry(path).bytes});
  }
  const status=mode==='control'?0:1,invocation={...current,runToken},exit={productionPolicy:selection.productionPolicy,revision:current.revision,tree:current.tree,runToken,...(suite==='reentry'?{mode}:{}),exitCode:status},anchor=causalAnchor(current,selection,runToken),child={error:null,signal:null,status,truncated:false};
  const rawBytes=Object.fromEntries(Object.entries({report,invocation,exit}).map(([k,v])=>[k,JSON.stringify(v)])),verdict=(suite==='supplemental'?verifySupplementalEvidence:verifyReentryEvidence)(report,invocation,status);
  const completion=causalCompletion(verdict,runToken,status,rawBytes),completionBytes=JSON.stringify(completion,null,2);
  child.stdout=JSON.stringify(causalCompletionEmission(completion,completionBytes))+'\n';child.stderr=report.checks.flatMap(c=>c.oracles.filter(o=>!o.pass).map(o=>`${o.id}: observed=${JSON.stringify(o.observed)} expected=${JSON.stringify(o.expected)}\n`)).join('');
  const result=verifyCausalRun({report,invocation,exit,completion,completionBytes,rawBytes,anchor,child,current},selection,runToken),suffixes=['','.invocation.json','.exit.json','.validation.json','.aggregation-invocation.json','.aggregation-process.json'];
  const texts=[rawBytes.report,rawBytes.invocation,rawBytes.exit,completionBytes,JSON.stringify(anchor),JSON.stringify(child)],output=join(temp,suite+'-'+mode+'.json');
  const receipt={...result,rawFiles:Object.fromEntries(['report','invocation','exit','completion'].map((key,i)=>[key,sha(texts[i])])),anchorSHA256:sha(texts[4])};
  for(let i=0;i<texts.length;i++)await writeFile(output+suffixes[i],texts[i]);await writeFile(output+'.aggregation.json',JSON.stringify(receipt));
  const toolchain=join(temp,'independent-toolchain.json');await writeFile(toolchain,JSON.stringify(current.toolchain));
  const args=['scripts/palette-query-causal-replay.mjs',output,suite,selection.surface,mode,selection.productionPolicy,current.revision,current.tree,runToken,toolchain];
  const invoke=argv=>spawnSync(process.execPath,argv,{cwd:base,encoding:'utf8',maxBuffer:8*1024*1024});
  let replay=invoke(args);assert.equal(replay.status,0,replay.stdout+replay.stderr);positive++;
  for(const [index,value,reason]of [[8,causalRunToken(),'pre-spawn'],[4,'foreign','mode'],[5,'foreign','policy'],[6,'0'.repeat(40),'equal']]){const bad=[...args];bad[index]=value;replay=invoke(bad);assert.equal(replay.status,1);assert((replay.stderr+replay.stdout).includes(reason));negative++;}
  // A stale successful aggregate receipt cannot bless a fresh failed process.
  await writeFile(output+'.aggregation-process.json',JSON.stringify({...child,signal:'SIGTERM',status:null}));replay=invoke(args);assert.equal(replay.status,1);assert(replay.stderr.includes('signal'));negative++;
  await writeFile(output+'.aggregation-process.json',JSON.stringify(child));
  await rm(output+'.validation.json');replay=invoke(args);assert.equal(replay.status,1);assert(replay.stderr.includes('ENOENT'));negative++;
  for(const [label,value]of [['absent',null],['stale',{...completion,runToken:causalRunToken()}],['forged-hash',{...completion,rawFiles:{...completion.rawFiles,report:'0'.repeat(64)}}]]){await writeFile(output+'.validation.json',JSON.stringify(value));replay=invoke(args);assert.equal(replay.status,1,label+' completion denial');assert(replay.stderr.includes('completion'));negative++;}
 }
 console.log(`Causal current-source serialized CLI tests passed: ${positive} positives and ${negative} reason-checked denials; synthetic raw observations only.`);
} finally {await rm(temp,{recursive:true,force:true});}
