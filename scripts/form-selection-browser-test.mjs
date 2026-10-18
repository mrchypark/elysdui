import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const render=(...args)=>execFileSync('go',['run','./tests/form-selection-contracts',...args],{encoding:'utf8'});
let fixture, fragment, children;
const submissions=[];
const report={suite:'form-selection-contracts',revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),status:'running',checks:[],negativeControls:[{id:'missing-runtime',status:'not-run'}]};
const check=async(id,fn)=>{
 const result={id,status:'running'};report.checks.push(result);
 try{await fn();result.status='passed';}catch(error){result.status='failed';result.error=String(error);throw error;}
};
const server=createServer(async(req,res)=>{
 if(req.url==='/')return res.setHeader('content-type','text/html').end(fixture);
 if(req.url==='/children')return res.setHeader('content-type','text/html').end(children);
 if(req.url==='/fragment')return res.setHeader('content-type','text/html').end(fragment);
 if(req.url==='/submit'){let body='';for await(const chunk of req)body+=chunk;submissions.push(Object.fromEntries(new URLSearchParams(body)));return res.end('<p>Saved</p>');}
 if(['/assets/htmx.min.js','/assets/ely-controls.js'].includes(req.url))return res.setHeader('content-type','text/javascript').end(await readFile(new URL('..'+req.url,import.meta.url)));
 res.writeHead(404).end();
});
let browser;
try{
 await check('production-rendering',async()=>{fixture=render();fragment=render('fragment');children=render('children');});
 await check('browser-startup',async()=>{await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});browser=await chromium.launch();});const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
 const origin=`http://127.0.0.1:${server.address().port}`;await page.goto(origin);
 const input=page.locator('#Combobox-enabled-control-input');await check('caller-selected-label',async()=>{assert.equal(await input.inputValue(),'Alpha');});
 await page.evaluate(()=>{window.events=[];for(const type of ['input','change'])document.querySelector('#Combobox-enabled-control-value').addEventListener(type,e=>window.events.push(type+':'+e.target.value));});
 await check('keyboard-disabled-row-and-selection-events',async()=>{await input.focus();assert.equal(await input.getAttribute('aria-activedescendant'),'Combobox-enabled-control-option-1');await input.press('Enter');assert.equal(await input.inputValue(),'Beta');assert.deepEqual(await page.evaluate(()=>window.events),['input:b','change:b']);});
 await check('strict-blur-preserves-commit',async()=>{await input.fill('bad');await input.press('Tab');assert.equal(await input.inputValue(),'Beta');assert.equal(await page.locator('#Combobox-enabled-control-value').inputValue(),'b');});
 await check('trimmed-case-insensitive-filter',async()=>{await input.fill(' GAM ');await input.press('Enter');assert.equal(await input.inputValue(),'Gamma');});
 await check('escape-restores-label-and-aria',async()=>{await input.fill('bad');await input.press('Escape');assert.equal(await input.inputValue(),'Gamma');assert.equal(await input.getAttribute('aria-activedescendant'),null);});
 await check('readonly-keyboard-guard',async()=>{const readonly=page.locator('#Combobox-readonly-control-input');await readonly.focus();await readonly.press('ArrowDown');assert.equal(await readonly.inputValue(),'Alpha');assert.equal(await readonly.getAttribute('aria-expanded'),'false');});
 await check('disabled-control',async()=>{assert.equal(await page.locator('#Combobox-disabled-control-input').isDisabled(),true);});
 await page.evaluate(()=>{window.freeSeen=[];document.querySelector('#Autocomplete-enabled').addEventListener('input',()=>window.freeSeen.push(document.querySelector('#Autocomplete-enabled-control-value').value));});
 await check('free-text-before-ancestor-listener',async()=>{await page.locator('#Autocomplete-enabled-control-input').fill('custom caller');assert.deepEqual(await page.evaluate(()=>window.freeSeen),['custom caller']);await page.locator('#Autocomplete-enabled-control-input').press('Tab');});
 await page.locator('#Select-enabled-control').selectOption('b');await page.locator('#NativeSelect-enabled-control').selectOption('c');
 await check('real-htmx-submitted-values',async()=>{await page.locator('#submit').click();await page.waitForFunction(()=>document.querySelector('#result').textContent==='Saved');assert.equal(submissions[0]['Combobox-enabled'],'c');assert.equal(submissions[0]['Autocomplete-enabled'],'custom caller');assert.equal(submissions[0]['Select-enabled'],'b');assert.equal(submissions[0]['NativeSelect-enabled'],'c');assert.equal(submissions[0]['Combobox-disabled'],undefined);});
 await check('repeated-htmx-outerhtml-replacement',async()=>{for(let i=0;i<2;i++){const old=await page.locator('#Combobox-enabled-control-input').elementHandle();await page.locator('#swap').click();await page.waitForFunction(n=>!n.isConnected,old);await page.waitForFunction(()=>document.querySelector('#Combobox-enabled-control-input').value==='Gamma');await page.locator('#Combobox-enabled-control-input').focus();await page.locator('#Combobox-enabled-control-input').press('ArrowUp');await page.locator('#Combobox-enabled-control-input').press('Enter');assert.equal(await page.locator('#Combobox-enabled-control-value').inputValue(),'b');}});
 await check('retained-root-htmx-innerhtml-replacement',async()=>{const oldChild=await page.locator('#Combobox-enabled-control-input').elementHandle();await page.locator('#children').click();await page.waitForFunction(n=>!n.isConnected,oldChild);await page.waitForFunction(()=>document.querySelector('#Combobox-enabled-control-input').value==='Alpha');assert.equal(await page.locator('#Combobox-enabled-control-value').isDisabled(),false);await page.locator('#Combobox-enabled-control-input').focus();await page.locator('#Combobox-enabled-control-input').press('Enter');assert.equal(await page.locator('#Combobox-enabled-control-value').inputValue(),'b');});
 await check('no-browser-errors',async()=>{assert.deepEqual(errors,[]);});
 // Causal negative control: same rendered HTML, shared controls blocked.
 const control=report.negativeControls[0];control.status='running';
 try{
  const negative=await browser.newPage();await negative.route('**/assets/ely-controls.js',r=>r.abort());await negative.goto(origin);
  control.observed={displayedValue:await negative.locator('#Combobox-enabled-control-input').inputValue(),submittedFieldDisabled:await negative.locator('#Combobox-enabled-control-value').isDisabled()};
  assert.equal(control.observed.displayedValue,'a');assert.equal(control.observed.submittedFieldDisabled,true);
  control.status='passed';control.result='Blocking shared runtime prevents selected-label resolution and submission activation.';
 }catch(error){control.status='failed';control.error=String(error);throw error;}
 report.status='passed';
 console.log('Production-rendered selection contracts, real HTMX submissions/replacements and missing-runtime negative control passed');
}catch(error){report.status='failed';report.error=String(error);throw error;}
finally{
 try{await browser?.close();if(server.listening)await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));}
 catch(error){report.status='failed';report.cleanupError=String(error);process.exitCode=1;}
 finally{await mkdir('test-results/contracts',{recursive:true});await writeFile('test-results/contracts/form-selection.json',JSON.stringify(report,null,2)+'\n');}
}
