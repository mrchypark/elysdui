import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:net';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const reservation=createServer();await new Promise(resolve=>reservation.listen(0,'127.0.0.1',resolve));
const port=reservation.address().port;await new Promise(resolve=>reservation.close(resolve));
const origin=`http://127.0.0.1:${port}`;
const server=spawn('go',['run','./cmd/sdui-browser-fixtures'],{cwd:repo,env:{...process.env,PORT:String(port)},detached:process.platform!=='win32',stdio:['ignore','pipe','pipe']});
let output='',browser;server.stdout.on('data',chunk=>output+=chunk);server.stderr.on('data',chunk=>output+=chunk);
const blocked=new Set(),failures=[];
try{
 let ready=false;
 for(let i=0;i<1200;i++){if(server.exitCode!==null)throw Error(output);try{ready=(await fetch(origin+'/manifest')).ok}catch{}if(ready)break;await delay(50)}
 assert(ready,`fixture server failed: ${output}`);
 const names=await(await fetch(origin+'/manifest')).json();assert.equal(names.length,1361);assert.equal(new Set(names).size,1361);
 browser=await chromium.launch();const context=await browser.newContext({serviceWorkers:'block',viewport:{width:1280,height:1000}});
 await context.route('**/*',async route=>{const url=route.request().url();if(url.startsWith(origin+'/'))return route.continue();blocked.add(url);return route.fulfill({status:204,body:''})});
 await context.routeWebSocket('**/*',socket=>{blocked.add(socket.url());socket.close()});
 const page=await context.newPage();let errors=[];
 page.on('pageerror',error=>errors.push(String(error)));
 await page.addInitScript(()=>{window.fixtureErrors=[];document.addEventListener('ely:error',event=>fixtureErrors.push(String(event.detail?.error||event.detail)))});
 for(let batch=0;batch<Math.ceil(names.length/12);batch++){
  errors=[];const response=await page.goto(`${origin}/?page=${batch}`,{waitUntil:'load'});
  if(response.status()!==200){failures.push({batch,names:names.slice(batch*12,batch*12+12),error:await page.locator('body').innerText()});continue}
  await page.waitForTimeout(100);
  const state=await page.evaluate(()=>({errors:fixtureErrors,nodes:document.querySelectorAll('[data-sdui-node]').length,unready:[...document.querySelectorAll('[data-ely-family]')].filter(node=>node.getAttribute('data-ely-ready')!=='true').map(node=>({id:node.id,component:node.getAttribute('data-ely-component')})),bad:document.body.innerHTML.includes('ZgotmplZ')}));
  if(errors.length||state.errors.length||state.unready.length||state.bad||state.nodes!==Math.min(12,names.length-batch*12))failures.push({batch,names:names.slice(batch*12,batch*12+12),errors,...state});
  if(batch%20===0)console.log(`[sdui catalogue] ${Math.min((batch+1)*12,names.length)}/${names.length} caller-configured contracts loaded`);
 }
 assert.deepEqual(failures,[],'catalogue browser smoke failures');
 console.log(`SDUI catalogue browser smoke passed: ${names.length} registered contracts, real caller props, mounted family modules, ${blocked.size} external fixture resources intercepted locally. Provider/browser-permission features are render-only here.`);
}catch(error){console.error('SDUI catalogue diagnostics',JSON.stringify({failures,server:output.slice(-3000)}));throw error}
finally{await browser?.close();if(server.pid&&server.exitCode===null){try{process.kill(process.platform==='win32'?server.pid:-server.pid,'SIGTERM')}catch{}}}
