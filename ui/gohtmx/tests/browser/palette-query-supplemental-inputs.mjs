import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPaletteInputs,paletteSHA as sha} from './palette-query-inputs.mjs';
import {supplementalMutation,supplementalModes} from './palette-query-supplemental-mutants.mjs';
export const supplementalSourcePaths = [
 '.github/workflows/palette-query-supplemental.yml','ui/gohtmx/tests/browser/diagnostics/palette-query-supplemental.md',
 'ui/gohtmx/tests/browser/palette-query-supplemental-browser-test.mjs',
 'ui/gohtmx/tests/browser/palette-query-supplemental-observer.js',
 'ui/gohtmx/tests/browser/palette-query-supplemental-inputs.mjs',
 'ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs',
 'ui/gohtmx/tests/browser/palette-query-supplemental-mutants.mjs',
 'scripts/palette-query-supplemental-run.mjs','scripts/palette-query-supplemental-replay.mjs','scripts/palette-query-supplemental-evidence-test.mjs',
 'ui/gohtmx/tests/fixtures/palettesupplemental/verify.go','ui/gohtmx/tests/fixtures/palettesupplemental/fixture.go','ui/gohtmx/tests/fixtures/palettesupplemental/fixture_test.go',
 'ui/gohtmx/tests/fixtures/palette-supplemental/main.go','ui/gohtmx/tests/fixtures/palette-supplemental/main_test.go',
 'adapters/gohtmx/tests/fixtures/palette-supplemental/main.go','adapters/gohtmx/tests/fixtures/palette-supplemental/main_test.go',
];
export async function loadSupplementalInputs(base,surface,mode='control') {
 assert(supplementalModes.includes(mode));
 const inputs=await loadPaletteInputs(base,surface), {assetBodies}=inputs;
 for(const path of supplementalSourcePaths)inputs.sourceFiles[path]=sha(await readFile(join(base,path)));
 const observer=await readFile(join(base,'ui/gohtmx/tests/browser/palette-query-supplemental-observer.js'));
 assetBodies.set('/supplemental-observer.js',{body:observer,sourceSHA256:sha(observer),servedSHA256:sha(observer),bytes:observer.length,contentType:'text/javascript; charset=utf-8'});
 const runtime=assetBodies.get('/assets/ely-api-interaction.js'), source=runtime.body.toString('utf8'), mutated=Buffer.from(supplementalMutation(source,mode));
 runtime.body=mutated;runtime.servedSHA256=sha(mutated);runtime.bytes=mutated.length;
 inputs.assets=Object.fromEntries([...assetBodies].map(([path,{sourceSHA256,servedSHA256,bytes,contentType}])=>[path,{sourceSHA256,servedSHA256,bytes,contentType}]));
 inputs.mutation={mode,path:'/assets/ely-api-interaction.js',sourceSHA256:sha(source),servedSHA256:sha(mutated),classification:mode==='control'?'unaltered repaired production':'one-site causal control; expected raw red, never pass inversion'};
 const go=process.env.GO||'go',deps=execFileSync(go,['list','-deps','./ui/gohtmx/tests/fixtures/palette-supplemental'],{cwd:base,encoding:'utf8'}).trim().split('\n');
 assert(!deps.some(x=>/github\.com\/mrchypark\/elysdui\/(sdui|adapters)(\/|$)/.test(x)));
 inputs.standaloneDependencyProof={SHA256:sha(deps.join('\n')),forbiddenImports:[]};
 const temp=await mkdtemp(join(tmpdir(),'ely-palette-supplemental-'));
 inputs.fixtures={};inputs.fixtureBodies=new Map();
 try {
  const binary=join(temp,'fixture');execFileSync(go,['build','-o',binary,surface==='sdui'?'./adapters/gohtmx/tests/fixtures/palette-supplemental':'./ui/gohtmx/tests/fixtures/palette-supplemental'],{cwd:base});
  inputs.fixtureManifest=JSON.parse(execFileSync(binary,['-surface='+surface,'-dump=/manifest.json'],{cwd:base,encoding:'utf8'}));
  for(const path of ['/','/fragment',...(surface==='sdui'?['/sdui-response-primary','/sdui-response-peer']:[])]){
   const body=execFileSync(binary,['-surface='+surface,'-dump='+path],{cwd:base,maxBuffer:8*1024*1024});inputs.fixtureBodies.set(path,body);
   inputs.fixtures[path]={sourceSHA256:sha(body),servedSHA256:sha(body),bytes:body.length,html:'palette-supplemental-fixtures/'+sha(body)+'.html',renderer:surface==='sdui'?'CatalogueRegistry + Decode + Compile + Plan.Render/RenderRegion':'ui.RenderComponent '+surface};
  }
 } finally {await rm(temp,{recursive:true,force:true});}
 for(const item of inputs.fixtureManifest.sourceFiles)assert.equal(item.sha256,sha(await readFile(join(base,item.path))));
 return inputs;
}
