import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {loadPaletteInputs,paletteSHA as sha} from './palette-query-inputs.mjs';
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
export async function loadActivationInputs(base,surface){
 const inputs=await loadPaletteInputs(base,surface),git=args=>execFileSync('git',args,{cwd:base,maxBuffer:16*1024*1024});
 assert.equal(git(['rev-parse',activationBaseline+'^{tree}']).toString().trim(),activationBaselineTree);
 // Supplemental baseline is test-only: every production byte equals the exact
 // published guarded query/reentry head. Later repair adoption must explicitly repin it.
 for(const [path,entry]of inputs.assetBodies){if(!path.startsWith('/assets/'))continue;const dir=path.startsWith('/assets/sdui')?'adapters/gohtmx':'ui/gohtmx';assert.equal(sha(git(['show',activationBaseline+':'+dir+path])),entry.sourceSHA256);}
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
 }finally{await rm(temp,{recursive:true,force:true});}
 for(const file of inputs.fixtureManifest.sourceFiles)assert.equal(file.sha256,sha(await readFile(join(base,file.path))));return inputs;
}
