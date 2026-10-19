import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {causalSelection,loadCausalInputs,verifyCausalRun} from './palette-query-causal-controls.mjs';
const [output,suite,surface,mode,productionPolicy,revision,tree,runToken,toolchainPath]=process.argv.slice(2);
assert(output&&suite&&surface&&mode&&productionPolicy&&revision&&tree&&runToken&&toolchainPath,'usage: node scripts/palette-query-causal-replay.mjs REPORT SUITE SURFACE MODE POLICY EXPECTED_REVISION EXPECTED_TREE EXPECTED_TOKEN INDEPENDENT_TOOLCHAIN_JSON');
const selection=causalSelection(suite,surface,mode,productionPolicy),base=fileURLToPath(new URL('../',import.meta.url));
const current=await loadCausalInputs(base,selection);assert.equal(current.revision,revision);assert.equal(current.tree,tree);
// Offline host versions can differ. This is an explicit external expectation
// joined by the reviewer to CI logs, never metadata obtained from the report.
const expectedToolchain=JSON.parse(await readFile(toolchainPath,'utf8'));
assert.deepEqual(Object.keys(expectedToolchain).sort(),['go','node','playwright']);
for(const value of Object.values(expectedToolchain))assert.equal(typeof value,'string','explicit toolchain strings');
assert(/^v\d+\.\d+\.\d+$/.test(expectedToolchain.node));assert(/^go version go\d+\.\d+\.\d+ \S+$/.test(expectedToolchain.go));assert.equal(expectedToolchain.playwright,current.toolchain.playwright);
current.toolchain=expectedToolchain;
const suffixes=['','.invocation.json','.exit.json','.validation.json','.aggregation-invocation.json','.aggregation-process.json','.aggregation.json'];
const bytes=await Promise.all(suffixes.map(suffix=>readFile(output+suffix,'utf8'))),[report,invocation,exit,completion,anchor,child,receipt]=bytes.map(s=>JSON.parse(s));
const result=verifyCausalRun({report,invocation,exit,completion,rawBytes:Object.fromEntries(['report','invocation','exit'].map((key,i)=>[key,bytes[i]])),completionBytes:bytes[3],anchor,child,current},selection,runToken),sha=s=>createHash('sha256').update(s).digest('hex');
assert.deepEqual(receipt,{...result,rawFiles:Object.fromEntries(['report','invocation','exit','completion'].map((key,i)=>[key,sha(bytes[i])])),anchorSHA256:sha(bytes[4])},'exact recomputed aggregation receipt');
console.log(JSON.stringify({causalAggregation:'valid-replay',...result}));
