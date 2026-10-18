import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
const mutation=process.env.VIRTUAL_TABLE_NEGATIVE_CONTROL||'';
const expected={unbounded:'attached rows must stay bounded',spacer:'top spacer must preserve scroll geometry',cleanup:'detached controller must stay inert'}[mutation];
const report={suite:'virtual-table',revision:null,mutation,status:'running',stage:'startup',checks:[]};
const renderOptions={encoding:'utf8',maxBuffer:16*1024*1024};
async function asset(url){let s=await readFile(new URL(`..${url}`,import.meta.url),'utf8');if(url==='/assets/ely-api-data.js'){
 const replacements={unbounded:['...rows.slice(start, end)','...rows'],spacer:['`${start * rowHeight}px`','`0px`'],cleanup:["listen(viewport, 'scroll', render, { passive: true });","viewport.addEventListener('scroll', render, { passive: true });"]};
 if(mutation){const [from,to]=replacements[mutation];assert(s.includes(from),'mutation anchor missing');s=s.replace(from,to);}
}return s;}
let browser,server;
try{
 assert(['','unbounded','spacer','cleanup'].includes(mutation),'unknown mutation');
 report.revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 report.stage='render-fixture';
 const fixture=execFileSync('go',['run','./tests/virtual-table-contracts'],renderOptions);
 report.stage='render-fragment';
 const fragment=execFileSync('go',['run','./tests/virtual-table-contracts','fragment'],renderOptions);
 report.fixtureBytes=Buffer.byteLength(fixture);report.fragmentBytes=Buffer.byteLength(fragment);
 report.stage='server-start';
 server=createServer(async(req,res)=>{try{res.setHeader('content-type',req.url.endsWith('.css')?'text/css':req.url.startsWith('/assets/')?'text/javascript':'text/html');res.end(req.url==='/'?fixture:req.url==='/fragment'?fragment:await asset(req.url));}catch(e){res.writeHead(500).end(String(e));}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 report.stage='browser-launch';
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 report.stage='browser-contracts';
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(`http://127.0.0.1:${server.address().port}`);await page.waitForFunction(()=>document.querySelector('#virtual-a')?.dataset.elyReady==='true');
 const viewport=page.locator('#virtual-a [data-ely-virtual-viewport]'),rows=page.locator('#virtual-a [data-ely-virtual-row]');
 assert(await rows.count()<=20,'attached rows must stay bounded');assert.equal(await rows.first().getAttribute('data-ely-key'),'key-0');assert.equal(await rows.first().getAttribute('aria-rowindex'),'2');assert.equal(await page.locator('#virtual-a table').getAttribute('aria-rowcount'),'1001');assert.equal(await rows.first().locator('td').last().textContent(),'<unsafe> long cell text which must not change the row height and should remain escaped');
 const geometry=await viewport.evaluate(el=>({height:el.clientHeight,scroll:el.scrollHeight,header:el.querySelector('thead').getBoundingClientRect().height,row:el.querySelector('[data-ely-virtual-row]').getBoundingClientRect().height}));
 assert.equal(geometry.row,32);assert.equal(geometry.header,32);assert(Math.abs(geometry.scroll-32032)<=1);report.checks.push('production CSS fixed row height, supplied-only scroll extent, escaped text and accessible indices');
 await rows.first().evaluate(el=>window.firstVirtualRow=el);
 await viewport.evaluate(el=>{el.scrollTop=400*32;el.dispatchEvent(new Event('scroll'));});assert.equal(await page.locator('#virtual-a [data-ely-key="key-400"]').evaluate(el=>el.getBoundingClientRect().height),32,'empty cell arrays retain fixed row height');
 await viewport.evaluate(el=>{el.scrollTop=16000;el.dispatchEvent(new Event('scroll'));});
 assert.equal(await page.locator('#virtual-a [data-ely-virtual-spacer] td').first().evaluate(el=>el.getBoundingClientRect().height),15872,'top spacer must preserve scroll geometry');
 assert.equal(await rows.first().getAttribute('data-ely-key'),'key-496');assert.equal(await rows.last().getAttribute('data-ely-key'),'key-512');
 assert(await rows.count()<=20,'attached rows must stay bounded');
 assert.equal(await page.locator('#virtual-b [data-ely-virtual-row]').first().getAttribute('data-ely-key'),'key-0');
 await viewport.focus();await page.keyboard.press('End');await page.waitForFunction(()=>document.querySelector('#virtual-a [data-ely-virtual-row="999"]'));assert.equal(await rows.last().getAttribute('data-ely-key'),'key-999');
 const last=await rows.last().boundingBox(),box=await viewport.boundingBox();assert(last.y+last.height<=box.y+box.height+1);await page.keyboard.press('Home');assert.equal(await rows.first().evaluate(el=>el===window.firstVirtualRow),true,'row identity survives recycling');
 await page.keyboard.press('PageDown');assert(await viewport.evaluate(el=>el.scrollTop)>0);await page.keyboard.press('Home');await page.keyboard.press('ArrowDown');assert.equal(await viewport.evaluate(el=>el.scrollTop),32);report.checks.push('mid/end windows, stable row identity/order, keyboard scroll, sticky headings and instance isolation');
 assert.match(await page.locator('#virtual-a [data-ely-virtual-status]').textContent(),/remaining rows not supplied/);assert.equal(await page.locator('#virtual-empty [data-ely-virtual-row]').count(),0);assert.match(await page.locator('#virtual-empty').textContent(),/No caller events/);assert.equal(await page.locator('#virtual-error [role=alert]').textContent(),'Could not load caller rows.');assert.equal(await page.locator('#virtual-error [data-ely-virtual-viewport]').count(),0);
 const nested=page.locator('#virtual-nested [data-ely-virtual-viewport]');assert.equal(await page.locator('#virtual-nested table').getAttribute('aria-rowcount'),'1001');await nested.focus();await page.keyboard.press('ArrowDown');assert.equal(await nested.evaluate(el=>el.scrollTop),32,'nested root keyboard applies once');
 const disabled=page.locator('#virtual-disabled [data-ely-virtual-viewport]');await disabled.dispatchEvent('keydown',{key:'End',bubbles:true});assert.equal(await disabled.evaluate(el=>el.scrollTop),0);assert.equal(await disabled.getAttribute('tabindex'),'-1');report.checks.push('empty, caller error, declared-total boundary and disabled keyboard state');
 for(let i=0;i<2;i++){
  await page.evaluate(()=>window.oldVirtual=document.querySelector('#virtual-a'));await page.locator('#replace').click();await page.waitForFunction(()=>!window.oldVirtual.isConnected&&document.querySelector('#virtual-a')?.dataset.elyReady==='true');
  await page.waitForFunction(()=>window.oldVirtual.querySelectorAll('[data-ely-virtual-row]').length===1000);
  const detached=await page.evaluate(()=>{const el=window.oldVirtual.querySelector('[data-ely-virtual-viewport]');el.scrollTop=9999;el.dispatchEvent(new Event('scroll'));return el.querySelectorAll('[data-ely-virtual-row]').length;});assert.equal(detached,1000,'detached controller must stay inert');
  await viewport.focus();await page.keyboard.press('ArrowDown');assert.equal(await viewport.evaluate(el=>el.scrollTop),32,'remount keyboard applies once');assert(await rows.count()<=20,'attached rows must stay bounded');
 }
 assert.deepEqual(errors,[]);assert.equal(mutation,'','negative control survived');report.checks.push('two real HTMX replacements clean old controllers and mount keyboard handlers exactly once');report.status='passed';
}catch(error){report.error=error.stack;if(mutation&&error instanceof assert.AssertionError&&error.message.includes(expected)){report.status='mutation-killed';}else{report.status='failed';throw error;}}
finally{await mkdir('test-results/contracts',{recursive:true});await writeFile(`test-results/contracts/virtual-table${mutation?'-'+mutation:''}.json`,JSON.stringify(report,null,2));await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));}
