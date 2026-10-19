import assert from 'node:assert/strict';
import {paletteProductionPolicy} from './palette-query-production-policy.mjs';
const productionPolicy = paletteProductionPolicy(process.env.PALETTE_QUERY_PRODUCTION_POLICY || 'strict');
import {mkdir, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {loadReentryInputs} from './palette-query-reentry-inputs.mjs';
import {paletteSHA as sha} from './palette-query-inputs.mjs';
import {paletteSurfaces, paletteErrors} from './palette-query-evidence.mjs';
import {reentryCase, reentryClassification, reentryReportName, reentryOracles, reconstructReentryWrites} from './palette-query-reentry-evidence.mjs';
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const surface = process.env.PALETTE_QUERY_SURFACE || 'go-qualified';
const mode = process.env.PALETTE_QUERY_REENTRY_MODE || 'control';
const report = {suite:'palette-query-reentry', classification:reentryClassification, surface, runToken:process.env.PALETTE_QUERY_REENTRY_RUN_TOKEN || null, status:'running', stage:'startup', caseInventory:[reentryCase], checks:[], requests:[], browserResponses:[], httpAssetProof:[], ...Object.fromEntries(paletteErrors.map(key=>[key,[]]))};
const output = join(base,'test-results/contracts'), pending=[];
let inputs, server, browser, page, phase='preflight', check;
const settle = () => page.evaluate(()=>new Promise(resolve=>setTimeout(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)),30)));
try {
  assert.equal(process.env.CI,'true','browser execution is restricted to CI'); assert(paletteSurfaces.includes(surface)); assert(report.runToken);
  inputs = await loadReentryInputs(base,surface,mode, {productionPolicy}); const {assetBodies,fixtureBodies,...metadata}=inputs; Object.assign(report,metadata);
  assert.equal(report.dirty,'','browser evidence requires clean committed source');
  server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname, entry={phase,path,method:req.method,htmx:req.headers['hx-request']||null}; report.requests.push(entry);
    const body=assetBodies.get(path)?.body||fixtureBodies.get(path), contentType=assetBodies.get(path)?.contentType||'text/html; charset=utf-8';
    if(!body){entry.status=404;report.serverErrors.push({path,status:404});res.writeHead(404).end();return;}
    entry.status=200;entry.responseSHA256=sha(body);entry.responseBytes=body.length;res.setHeader('content-type',contentType).end(body);
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  const origin=`http://127.0.0.1:${server.address().port}`;
  for(const path of [...Object.keys(report.assets),...Object.keys(report.fixtures)]){
    const response=await fetch(origin+path), bytes=Buffer.from(await response.arrayBuffer()), wanted=report.assets[path]||report.fixtures[path];
    const proof={path,status:response.status,bytes:bytes.length,expectedSHA256:wanted.servedSHA256,receivedSHA256:sha(bytes)}; report.httpAssetProof.push(proof);
    assert.equal(proof.status,200);assert.equal(proof.receivedSHA256,proof.expectedSHA256);
  }
  browser=await chromium.launch({headless:true});report.browserVersion=browser.version();page=await browser.newPage({viewport:{width:1280,height:900}});page.setDefaultTimeout(10000);phase='browser';
  page.on('response',response=>pending.push((async()=>{
    try{const url=new URL(response.url());assert.equal(url.origin,origin);const path=url.pathname,wanted=report.assets[path]||report.fixtures[path];assert(wanted,'known browser bytes');const bytes=await response.body();
      const proof={path,status:response.status(),bytes:bytes.length,expectedSHA256:wanted.servedSHA256,receivedSHA256:sha(bytes)};report.browserResponses.push(proof);
      if(proof.status!==200||proof.receivedSHA256!==proof.expectedSHA256||proof.bytes!==wanted.bytes)report.transportErrors.push(proof);
    }catch(error){report.transportErrors.push(String(error));}
  })()));
  page.on('pageerror',error=>report.pageErrors.push(error.message));page.on('console',message=>{if(message.type()==='error')report.consoleErrors.push(message.text());});page.on('requestfailed',request=>report.requestFailures.push({url:request.url(),error:request.failure()?.errorText}));
  check={name:reentryCase,status:'running',raw:{}};report.checks.push(check);report.stage='checks';
  await page.goto(origin+'/');
  await page.waitForFunction(()=>document.querySelectorAll('[data-ely-family]').length===2&&[...document.querySelectorAll('[data-ely-family]')].every(node=>node.dataset.elyReady==='true'));
  await page.evaluate(async()=>{await document.fonts.ready;await paletteBind(paletteRoot());await paletteBind(paletteRoot('peer'));});
  await page.addScriptTag({url:origin+'/reentry-observer.js'});
  await page.mouse.move(1,1);await page.locator('#palette-primary [data-interaction-dialog]').click();await settle();
  await page.keyboard.type('op');await settle();Object.assign(check.raw,await page.evaluate(()=>({before:paletteReentrySnapshot(),peerBefore:paletteReentryPeerSnapshot()})));
  // No locator.focus(), synthetic event, query repair or scrolling instrumentation.
  await page.keyboard.press('Tab');check.raw.tab=await page.evaluate(()=>paletteReentrySnapshot());
  assert.equal(check.raw.tab.focusedValue,'open-file','native Tab reaches first Open option');
  check.raw.fragment=await page.evaluate(async()=>{
    const response=await fetch('/fragment');if(!response.ok)throw new Error('actual fragment prefetch failed');
    const bytes=await response.arrayBuffer(), text=new TextDecoder().decode(bytes), parsed=new DOMParser().parseFromString(text,'text/html'), matches=parsed.querySelectorAll('li:has(> [data-interaction-palette-option][value="option-file"])'), option=matches[0]?.querySelector('[data-interaction-palette-option]');
    window.paletteReentryFragment=text;
    const digest=await crypto.subtle.digest('SHA-256',bytes), sha256=[...new Uint8Array(digest)].map(value=>value.toString(16).padStart(2,'0')).join('');
    return {path:'/fragment',status:response.status,bytes:bytes.byteLength,sha256,ownerCount:parsed.querySelectorAll('#palette-primary [data-ely-family]').length,peerCount:parsed.querySelectorAll('#palette-peer').length,optionCount:matches.length,optionID:option?.id||null,optionSelected:option?.getAttribute('aria-selected')||null};
  });
  await Promise.all(pending);
  assert.equal(check.raw.fragment.sha256,report.fixtures['/fragment'].servedSHA256,'browser-prefetched exact independently rendered fragment');
  assert(report.browserResponses.some(proof=>proof.path==='/fragment'&&proof.receivedSHA256===check.raw.fragment.sha256));
  await page.evaluate(()=>paletteReentryInstall());
  await page.keyboard.press('ArrowDown');
  await page.evaluate(async()=>{if(!window.paletteReentryPromise)throw new Error('trusted ArrowDown did not reenter query focus');await paletteReentryPromise;});
  await page.waitForFunction(()=>paletteRoot().dataset.elyReady==='true');await settle();
  Object.assign(check.raw,await page.evaluate(()=>{paletteReentryDrain('final');return {log:structuredClone(paletteReentryLog),final:paletteReentrySnapshot(),peerAfter:paletteReentryPeerSnapshot(),baseTrace:structuredClone(paletteLog)};}));
  report.runtimeErrors.push(...check.raw.baseTrace.errors);check.oracles=reentryOracles(check.raw,surface);check.writes=reconstructReentryWrites(check.raw);check.status=check.oracles.every(oracle=>oracle.pass)?'passed':'failed';report.status=check.status;
  for(const oracle of check.oracles.filter(oracle=>!oracle.pass))console.error(`${oracle.id}: observed=${JSON.stringify(oracle.observed)} expected=${JSON.stringify(oracle.expected)}`);
  await Promise.all(pending);if(paletteErrors.some(key=>report[key].length))report.status='failed';
}catch(error){report.status='failed';report.error={message:error.message,stack:error.stack};}
finally{
  await Promise.all(pending);
  if(page&&check){try{check.finalCapture=await page.evaluate(()=>({log:window.paletteReentryLog||null,baseTrace:window.paletteLog||null}));}catch(error){report.captureError=String(error);}}
  await mkdir(join(output,'palette-query-fixtures'),{recursive:true});for(const body of inputs?.fixtureBodies.values()||[])await writeFile(join(output,'palette-query-fixtures/'+sha(body)+'.html'),body);
  await writeFile(join(output,reentryReportName(surface,mode)),JSON.stringify(report,null,2));await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
  if(report.status!=='passed')process.exitCode=1;
}
