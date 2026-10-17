import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
const repo = fileURLToPath(new URL('../', import.meta.url));
const fixtures = JSON.parse(execFileSync('go', ['run', './internal/testfixtures/errorboundary'], {cwd: repo, encoding: 'utf8'}));
const negativeControl = process.env.ERROR_BOUNDARY_NEGATIVE_CONTROL === 'optimistic-retry';
const server = createServer(async (req, res) => {
  const path = new URL(req.url, 'http://localhost').pathname;
  if (path === '/') { res.setHeader('content-type', 'text/html'); res.end(`<!doctype html><html><body>${fixtures.first}${fixtures.second}${fixtures.readonly}${fixtures.disabled}${fixtures.demo}<script type="module">import * as api from '/assets/ely-api.js'; import '/assets/ely-api-interaction.js'; window.api=api;</script></body></html>`); return; }
  if (path === '/favicon.ico') { res.writeHead(204).end(); return; }
  if (path === '/fixtures') { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(fixtures)); return; }
  if (!/^\/assets\/[\w.-]+\.js$/.test(path)) { res.writeHead(404).end(); return; }
  try { res.setHeader('content-type', 'text/javascript'); let body = await readFile(new URL(`..${path}`, import.meta.url), 'utf8');
    if (negativeControl && path === '/assets/ely-api.js') {
      const anchor = '      if (!accepted) event.preventDefault();';
      assert.ok(body.includes(anchor));
      body = body.replace(anchor, `      if (root.id === 'first') root.querySelector('[data-feedback-boundary-error]').hidden = true;\n${anchor}`);
    }
    res.end(body); } catch { res.writeHead(404).end(); }
});
let browser;
try {
 await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
 browser = await chromium.launch({headless:true}); const page = await browser.newPage();
 const errors=[], logs=[];
 page.on('pageerror', e => errors.push(String(e)));
 page.on('console', m => {if(m.type()==='error') logs.push(m.text());});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>window.api && document.querySelector('#first').dataset.elyReady==='true');
 const first=page.locator('#first'), second=page.locator('#second');
 assert.equal(await first.locator('code').textContent(),'service <failed>');
 assert.equal(await first.getByRole('button',{name:'Try again'}).count(),1);
 assert.equal(await page.locator('#readonly button').count(),0);
 assert.equal(await page.locator('#disabled button').isDisabled(),true);
 await page.evaluate(async()=>{
  window.fixtures=await(await fetch('/fixtures')).json(); window.calls=[];window.results=[];window.fail=true;
  const root=document.querySelector('#first');
  root.addEventListener('ely:error', e=>window.results.push({kind:'error',action:e.detail.action}));
  root.addEventListener('ely:result', e=>window.results.push({kind:'result',action:e.detail.action,value:e.detail.result}));
  window.bind=()=>window.api.mount(root,{onAction:async detail=>{window.calls.push(detail);if(window.fail)throw new Error('Host-owned failure');return 'host success';}});
  window.bind();window.bind();window.bind();
 });
 await first.getByRole('button').click();
 await page.waitForFunction(()=>window.results.length===1);
 assert.deepEqual(await page.evaluate(()=>window.results),[{kind:'error',action:'retry-owned'}]);
 assert.equal(await first.locator('[data-feedback-boundary-error]').isVisible(),true,'host failure keeps fallback');
 assert.equal(await second.locator('[data-feedback-boundary-error]').isVisible(),true);
 await page.evaluate(()=>window.fail=false); await first.getByRole('button').focus();await page.keyboard.press('Enter');
 await page.waitForFunction(()=>window.results.length===2);
 assert.deepEqual(await page.evaluate(()=>window.results[1]),{kind:'result',action:'retry-owned',value:'host success'});
 await page.keyboard.press('Space'); await page.waitForFunction(()=>window.results.length===3);
 assert.deepEqual(await page.evaluate(()=>window.results[2]),{kind:'result',action:'retry-owned',value:'host success'});
 assert.equal(await first.locator('[data-feedback-boundary-error]').isVisible(),true,'callback resolution is not a new caller Result');
 assert.equal(await page.evaluate(()=>window.calls.length),3,'repeat binding does not multiply retry');
 await page.evaluate(()=>{document.querySelector('#first').outerHTML=window.fixtures.healthy;document.dispatchEvent(new Event('htmx:after:swap'));});
 await page.waitForFunction(()=>document.querySelector('#first').dataset.elyReady==='true');
 assert.equal(await first.locator('[data-feedback-boundary-content]').textContent(),'Recovered caller content');
 assert.equal(await first.locator('[data-feedback-boundary-error]').isVisible(),false);
 // A detached/reinserted DOM instance is cleaned up and initialized again without duplicate logs.
 await page.evaluate(()=>{window.saved=document.querySelector('#second');window.saved.remove();});
 await page.waitForTimeout(20);
 await page.evaluate(()=>{document.body.append(window.saved);document.dispatchEvent(new Event('htmx:after:swap'));});
 await page.waitForFunction(()=>document.querySelector('#second').dataset.elyReady==='true');
 await page.evaluate(()=>{window.api.mount(window.saved,{onAction:()=>window.calls.push({action:'second'})});});
 await second.getByRole('button').click();
 assert.equal(await page.evaluate(()=>window.calls.filter(x=>x.action==='second').length),1);
 assert.equal(logs.filter(x=>x.startsWith('ErrorBoundary second ')).length,1);
 assert.equal(logs.filter(x=>x.startsWith('ErrorBoundary first ')).length,1);
 // The opt-in demo applies changed supplied errors through the real dispatcher.
 const demo=page.locator('#demo');
 await demo.locator('[data-feedback-boundary-toggle]').click();
 await demo.locator('[data-feedback-boundary-toggle]').click();
 assert.equal(await demo.locator('code').textContent(),'changed chain');
 assert.equal(logs.filter(x=>x.startsWith('ErrorBoundary demo ')).length,2);
 await demo.locator('[data-feedback-boundary-toggle]').click();
 await demo.locator('[data-feedback-boundary-toggle]').click();
 assert.equal(logs.filter(x=>x.startsWith('ErrorBoundary demo ')).length,2,'same changed error is not logged again after recovery');
 await page.evaluate(()=>{document.querySelector('#first').outerHTML=window.fixtures.first;document.dispatchEvent(new Event('htmx:after:swap'));});
 await page.waitForFunction(()=>document.querySelector('#first').dataset.elyReady==='true');
 assert.equal(logs.filter(x=>x.startsWith('ErrorBoundary first ')).length,2,'new replacement instance logs its failure');
 assert.deepEqual(errors,[]); assert.ok(logs.every(x=>x.startsWith('ErrorBoundary ')),logs.join('\n'));
 console.log('ErrorBoundary browser: actual renderer fallback, default/absent/disabled retry, keyboard callback, rejected and resolved host operations, explicit recovery, instance isolation, repeated binding and detach/remount passed');
 if (negativeControl) throw new Error('Negative control unexpectedly passed');
} catch (error) {
 if (!negativeControl || error.code !== 'ERR_ASSERTION' || !error.message.includes('host failure keeps fallback')) throw error;
 console.log('ErrorBoundary browser negative control: premature retry recovery was rejected by the intended fallback assertion');
} finally {await browser?.close();await new Promise(resolve=>server.close(resolve));}
