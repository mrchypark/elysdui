import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {loadActivationInputs} from './palette-activation-inputs.mjs';
import {paletteSHA as sha} from './palette-query-inputs.mjs';
import {paletteSurfaces,paletteErrors} from './palette-query-evidence.mjs';
import {activationCases,activationClassification,activationPage,activationQuery,activationReportName,activationOracles} from './palette-activation-evidence.mjs';
const base=fileURLToPath(new URL('../../../../',import.meta.url)),surface=process.env.PALETTE_QUERY_SURFACE||'go-qualified';
const report={suite:'palette-activation',classification:activationClassification,surface,runToken:process.env.PALETTE_ACTIVATION_RUN_TOKEN||null,stage:'startup',status:'running',caseInventory:activationCases,checks:[],requests:[],browserResponses:[],httpAssetProof:[],...Object.fromEntries(paletteErrors.map(k=>[k,[]]))};
const output=join(base,'test-results/contracts'),pending=[];let inputs,server,browser,page,context,current;
const settle=()=>page.evaluate(()=>new Promise(resolve=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)),30)));
const snapshot=()=>page.evaluate(()=>activationSnapshot());
const option=()=>page.locator('#palette-primary [data-interaction-palette-option][value="option-file"]');
const open=async()=>{await page.mouse.move(1,1);await page.locator('#palette-primary [data-interaction-dialog]').click();await settle();};
// The observer's request IDs are joined to server packets at replay. Waiting
// uses the actual completed bridge events, never an assumed desired zero count.
const drain=async()=>{await settle();if(surface==='sdui')await page.waitForFunction(()=>activationLog.filter(e=>e.type==='bridge-success').length===activationLog.filter(e=>e.type==='request-start').length);await Promise.all(pending);};
try{
 assert.equal(process.env.CI,'true','browser execution is restricted to CI');assert(paletteSurfaces.includes(surface));assert(report.runToken);
 inputs=await loadActivationInputs(base,surface);const {assetBodies,fixtureBodies,...metadata}=inputs;Object.assign(report,metadata);assert.equal(report.dirty,'','clean committed baseline required');
 server=createServer(async(req,res)=>{
  const path=new URL(req.url,'http://localhost').pathname,entry={check:current?.name||null,path,method:req.method,htmx:req.headers['hx-request']||null};report.requests.push(entry);
  try{let body=assetBodies.get(path)?.body||fixtureBodies.get(path),contentType=assetBodies.get(path)?.contentType||'text/html; charset=utf-8';
   if(path==='/sdui-action'&&req.method==='POST'){
    const chunks=[];for await(const chunk of req)chunks.push(chunk);const raw=Buffer.concat(chunks),form=await new Response(raw,{headers:{'content-type':req.headers['content-type']}}).formData();
    entry.fields=[...form].map(([key,value])=>[key,String(value)]);entry.requestSHA256=sha(raw);entry.requestBytes=raw.length;entry.contentType=req.headers['content-type'];entry.idempotencyKey=req.headers['idempotency-key'];
    assert.equal(form.get('_target'),'palette-primary-result');entry.responseFixture='/sdui-response-primary';body=fixtureBodies.get(entry.responseFixture);
   }
   if(!body){entry.status=404;report.serverErrors.push({path,status:404});res.writeHead(404).end();return;}
   entry.status=200;entry.responseSHA256=sha(body);entry.responseBytes=body.length;res.setHeader('content-type',contentType).end(body);
  }catch(error){report.serverErrors.push(String(error));entry.status=500;res.writeHead(500).end();}
 });
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});const origin=`http://127.0.0.1:${server.address().port}`;
 for(const path of [...Object.keys(report.assets),...Object.keys(report.fixtures)]){const response=await fetch(origin+path),bytes=Buffer.from(await response.arrayBuffer()),wanted=report.assets[path]||report.fixtures[path];const proof={path,status:response.status,bytes:bytes.length,expectedSHA256:wanted.servedSHA256,receivedSHA256:sha(bytes)};report.httpAssetProof.push(proof);assert.equal(proof.status,200);assert.equal(proof.receivedSHA256,proof.expectedSHA256);}
 browser=await chromium.launch({headless:true});report.browserVersion=browser.version();report.stage='checks';
 for(const name of activationCases){
  current={name,raw:{},status:'running'};report.checks.push(current);
  // Fresh browser context per case makes the source-owned full response
  // inventory explicit without disabling or guessing Chromium HTTP caching.
  context=await browser.newContext({viewport:{width:1280,height:900}});page=await context.newPage();page.setDefaultTimeout(10000);
  page.on('response',response=>{const check=name;pending.push((async()=>{try{const url=new URL(response.url());assert.equal(url.origin,origin);const path=url.pathname,responseFixture=path==='/sdui-action'?'/sdui-response-primary':path,wanted=report.assets[path]||report.fixtures[responseFixture];assert(wanted,'known response');const bytes=await response.body();const proof={check,path,...(path==='/sdui-action'?{responseFixture}:{}),status:response.status(),bytes:bytes.length,expectedSHA256:wanted.servedSHA256,receivedSHA256:sha(bytes)};report.browserResponses.push(proof);if(proof.status!==200||proof.bytes!==wanted.bytes||proof.receivedSHA256!==wanted.servedSHA256)report.transportErrors.push(proof);}catch(error){report.transportErrors.push({check,message:String(error)});}})());});
  page.on('pageerror',error=>report.pageErrors.push({check:name,message:error.message}));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push({check:name,message:message.text()});});page.on('requestfailed',request=>report.requestFailures.push({check:name,url:request.url(),error:request.failure()?.errorText}));
  try{
   await page.goto(origin+activationPage(name));await page.waitForFunction(()=>document.querySelectorAll('[data-ely-family]').length===2&&[...document.querySelectorAll('[data-ely-family]')].every(root=>root.dataset.elyReady==='true'));
   const mode=name.startsWith('owner.')||name.startsWith('callback.')?name.split('.').slice(1).join('.'):'normal';
   await page.evaluate(async mode=>{await document.fonts.ready;await activationInitialize(mode);},mode);current.raw.ready=await snapshot();await open();current.raw.opened=await snapshot();
   const query=activationQuery(name);if(query){await page.keyboard.type(query);await settle();}current.raw.before=await snapshot();await page.evaluate(()=>activationArm());
   if(name.startsWith('empty.')){
    await page.keyboard.down('Enter');current.raw.down=await snapshot();await page.keyboard.up('Enter');await drain();current.raw.after=await snapshot();
    await page.evaluate(()=>activationRequestSubmit());await drain();current.raw.explicit=await snapshot();
   }else{
    await option().click();await drain();current.raw.after=await snapshot();
    if(name.startsWith('owner.')){await page.evaluate(()=>activationStage('setup'));await open();current.raw.freshBefore=await snapshot();await page.evaluate(()=>activationStage('fresh'));await option().click();await drain();current.raw.fresh=await snapshot();}
   }
   current.oracles=activationOracles(current,surface);
  }catch(error){current.error={message:error.message,stack:error.stack};}
  finally{
   try{current.finalTrace=await snapshot();report.runtimeErrors.push(...current.finalTrace.baseTrace.errors.map(error=>({check:name,...error})));}catch(error){current.captureError=String(error);}
   current.status=!current.error&&!current.captureError&&current.oracles.every(o=>o.pass)?'passed':'failed';console.log(`${surface}/${name}: ${current.status}`);for(const oracle of current.oracles?.filter(o=>!o.pass)||[])console.error(`${oracle.id}: observed=${JSON.stringify(oracle.observed)} expected=${JSON.stringify(oracle.expected)}`);
   await Promise.all(pending);await context.close();context=null;
  }
 }
 report.status=report.checks.every(c=>c.status==='passed')&&paletteErrors.every(k=>!report[k].length)?'passed':'failed';
}catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};}
finally{await Promise.all(pending);await mkdir(join(output,'palette-activation-fixtures'),{recursive:true});for(const body of inputs?.fixtureBodies.values()||[])await writeFile(join(output,'palette-activation-fixtures/'+sha(body)+'.html'),body);await writeFile(join(output,activationReportName(surface)),JSON.stringify(report,null,2));await context?.close();await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));if(report.status!=='passed')process.exitCode=1;}
