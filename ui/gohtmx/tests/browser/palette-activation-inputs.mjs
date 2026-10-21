import assert from 'node:assert/strict';
import {loadPaletteHistory} from './palette-history-fixtures.mjs';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPaletteInputs,paletteSHA as sha} from './palette-query-inputs.mjs';
import {activationSelection,activationPolicy,activationRepairSourcePaths,activationTemplateMarkerCounts} from './palette-activation-policy.mjs';
import {paletteActivationRepairPins} from './palette-query-production-policy.mjs';
import {applyActivationMutation} from './palette-activation-mutants.mjs';
import {applyActivationAuditCandidateMutation} from './palette-activation-audit-candidate.mjs';
import {paletteProductionPaths} from './palette-query-production-policy.mjs';
export const activationBaseline='ee28495c7cd6581d49d53874e831c6cea40930a4';
export const activationBaselineTree='c2d6ed91c378f59070fde8d626df2748e9fd837c';
export const activationSourcePaths=[
 'ui/gohtmx/tests/browser/palette-activation-inputs.mjs','ui/gohtmx/tests/browser/palette-activation-observer.js',
 'ui/gohtmx/tests/browser/palette-activation-browser-test.mjs','ui/gohtmx/tests/browser/palette-activation-evidence.mjs',
 'ui/gohtmx/tests/fixtures/paletteactivation/fixture.go','ui/gohtmx/tests/fixtures/paletteactivation/verify.go',
 'ui/gohtmx/tests/fixtures/palette-activation/main.go','ui/gohtmx/tests/fixtures/palette-activation/main_test.go',
 'adapters/gohtmx/tests/fixtures/palette-activation/main.go','adapters/gohtmx/tests/fixtures/palette-activation/main_test.go',
 'scripts/palette-activation-run.mjs','scripts/palette-activation-replay.mjs','scripts/palette-activation-evidence-test.mjs',
 '.github/workflows/palette-activation.yml','ui/gohtmx/tests/browser/diagnostics/palette-activation.md',
];
export async function loadActivationInputs(base,surface,options={}){
 const selected=activationSelection(options),productionPolicy=selected.productionPolicy||(selected.mode==='repaired'?'activation-repair':'strict'),inputs=await loadPaletteInputs(base,surface,{productionPolicy}),history=loadPaletteHistory(base);
 assert.equal(history.tree(activationBaseline),activationBaselineTree);
 // Baseline is immutable. Repaired assets must match explicit reviewed pins;
 // neither arbitrary HEAD bytes nor an unpinned CSS change is admitted.
 for(const [path,entry]of inputs.assetBodies){
  if(!path.startsWith('/assets/'))continue;
  const dir=path.startsWith('/assets/sdui')?'adapters/gohtmx':'ui/gohtmx',sourcePath=dir+path;
  if(productionPolicy==='audit-candidate'&&paletteProductionPaths(productionPolicy).includes(sourcePath))continue;
  if(selected.mode==='repaired'&&['/assets/ely-api.js','/assets/ely-api-interaction.js','/assets/ely-api-interaction.css','/assets/ely/icons/check.svg'].includes(path)){
   assert.equal(entry.sourceSHA256,paletteActivationRepairPins[sourcePath],'fixed activation repaired asset: '+path);
   continue;
  }
  assert.equal(history.sha256(activationBaseline,sourcePath),entry.sourceSHA256);
 }
 inputs.activationPolicy=activationPolicy(selected);inputs.activationRepairSourceFiles={};inputs.activationRenderMutation={};
 let transformed;
 if(selected.mode==='repaired'){
  for(const path of activationRepairSourcePaths)inputs.activationRepairSourceFiles[path]=sha(await readFile(join(base,path)));
  const sources=Object.fromEntries(await Promise.all([['core','ui/gohtmx/assets/ely-api.js'],['runtime','ui/gohtmx/assets/ely-api-interaction.js'],['template','ui/gohtmx/templates/ely-api-interaction.html']].map(async([key,path])=>[key,await readFile(join(base,path),'utf8')])));
  transformed=(productionPolicy==='audit-candidate'?applyActivationAuditCandidateMutation:applyActivationMutation)(sources,selected.mutation);assert.deepEqual(transformed.metadata,inputs.activationPolicy.definition);
  for(const [key,path]of [['core','/assets/ely-api.js'],['runtime','/assets/ely-api-interaction.js']]){
   const entry=inputs.assetBodies.get(path),body=Buffer.from(transformed.sources[key]),file=transformed.metadata.files[key];
   assert.equal(entry.sourceSHA256,file.sourceSHA256);assert.equal(sha(body),file.servedSHA256);
   const metadata={...inputs.assets[path],servedSHA256:sha(body),bytes:body.length};inputs.assets[path]=metadata;inputs.assetBodies.set(path,{...entry,...metadata,body});
  }
 }
 inputs.activationSourceFiles={};for(const path of activationSourcePaths)inputs.activationSourceFiles[path]=sha(await readFile(join(base,path)));
 const body=await readFile(join(base,'ui/gohtmx/tests/browser/palette-activation-observer.js'));
 const metadata={sourceSHA256:sha(body),servedSHA256:sha(body),bytes:body.length,contentType:'text/javascript; charset=utf-8'};
 inputs.assetBodies.set('/activation-observer.js',{body,...metadata});inputs.assets['/activation-observer.js']=metadata;
 const go=process.env.GO||'go',deps=execFileSync(go,['list','-deps','./ui/gohtmx/tests/fixtures/palette-activation'],{cwd:base,encoding:'utf8'}).trim().split('\n');assert(!deps.some(x=>/github\.com\/mrchypark\/elysdui\/(sdui|adapters)(\/|$)/.test(x)));
 inputs.standaloneDependencyProof={SHA256:sha(deps.join('\n')),forbiddenImports:[]};
 const temp=await mkdtemp(join(tmpdir(),'ely-palette-activation-'));inputs.fixtures={};inputs.fixtureBodies=new Map();
 try{const binary=join(temp,'fixture');execFileSync(go,['build','-o',binary,surface==='sdui'?'./adapters/gohtmx/tests/fixtures/palette-activation':'./ui/gohtmx/tests/fixtures/palette-activation'],{cwd:base});
 inputs.fixtureManifest=JSON.parse(execFileSync(binary,['-surface='+surface,'-dump=/manifest.json'],{cwd:base,encoding:'utf8'}));
 for(const path of ['/','/empty-initial','/empty-disabled',...(surface==='sdui'?['/sdui-response-primary','/sdui-response-peer']:[])]){
  const body=execFileSync(binary,['-surface='+surface,'-dump='+path],{cwd:base,maxBuffer:8*1024*1024});inputs.fixtureBodies.set(path,body);inputs.fixtures[path]={sourceSHA256:sha(body),servedSHA256:sha(body),bytes:body.length,html:'palette-activation-fixtures/'+sha(body)+'.html',renderer:surface==='sdui'?'CatalogueRegistry + Decode + Compile + Plan.Render/RenderRegion':'ui.RenderComponent '+surface};
 }
 if(selected.mode==='repaired'&&selected.mutation==='template-marker-omitted'){
  const templatePath=join(base,'ui/gohtmx/templates/ely-api-interaction.html'),backing=join(temp,'interaction.html'),overlay=join(temp,'overlay.json'),mutantBinary=join(temp,'mutant-fixture');
  await writeFile(backing,transformed.sources.template);await writeFile(overlay,JSON.stringify({Replace:{[templatePath]:backing}}));
  execFileSync(go,['build','-overlay',overlay,'-o',mutantBinary,surface==='sdui'?'./adapters/gohtmx/tests/fixtures/palette-activation':'./ui/gohtmx/tests/fixtures/palette-activation'],{cwd:base});
  for(const [path,original]of inputs.fixtureBodies){
   const body=execFileSync(mutantBinary,['-surface='+surface,'-dump='+path],{cwd:base,maxBuffer:8*1024*1024}),count=activationTemplateMarkerCounts[path],marker=' data-interaction-palette-action';
   assert.equal(original.toString().split(marker).length-1,count,'source-owned rendered marker count');assert.equal(body.toString().split(marker).length-1,0);
   assert.equal(body.toString(),original.toString().replaceAll(marker,''),'compiled overlay changes only owned row markers');
   const template=transformed.metadata.files.template;inputs.activationRenderMutation[path]={compilePolicy:'go-build-embed-overlay',templateSourceSHA256:template.sourceSHA256,templateTransformedSHA256:template.transformedSourceSHA256,sourceMarkers:count,servedMarkers:0,removedMarkers:count};
   inputs.fixtureBodies.set(path,body);inputs.fixtures[path]={...inputs.fixtures[path],servedSHA256:sha(body),bytes:body.length,html:'palette-activation-fixtures/'+sha(body)+'.html'};
  }
 }
 }finally{await rm(temp,{recursive:true,force:true});}
 for(const file of inputs.fixtureManifest.sourceFiles)assert.equal(file.sha256,sha(await readFile(join(base,file.path))));return inputs;
}
