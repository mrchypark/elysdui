import assert from 'node:assert/strict';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

// Every control comes from the actual Go template renderer, not copied markup.
const render = name => execFileSync('go', ['run', './ui/gohtmx/tests/fixtures/form-contracts', name], {encoding: 'utf8'});
const fixture = render('fixture'), fragment = render('fragment');
const submissions = [];
const report = {suite: 'basic-form-contracts', revision: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), status: 'running', assertions: [], negativeControls: []};
let browser;
const server = createServer(async (req, res) => {
 try {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/') return res.setHeader('content-type','text/html').end(fixture);
  if (url.pathname === '/fragment') return res.setHeader('content-type','text/html').end(fragment);
  if (url.pathname === '/submit') {
   let body = ''; for await (const chunk of req) body += chunk;
   submissions.push([...new URLSearchParams(body)]);
   return res.setHeader('content-type','text/html').end('<p>Submitted</p>');
  }
  if (['/assets/ely-controls.js','/assets/htmx.min.js'].includes(url.pathname)) return res.setHeader('content-type','text/javascript').end(await readFile(new URL(`../..${url.pathname}`,import.meta.url)));
  res.writeHead(404).end();
 } catch (error) {res.writeHead(500).end(String(error));}
});
try {
 await new Promise((resolve,reject) => {server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 browser = await chromium.launch();
 const page = await browser.newPage();
 const errors = []; page.on('pageerror',error => errors.push(String(error)));
 const origin = `http://127.0.0.1:${server.address().port}`;
 await page.goto(origin);
 const check = async (id, fn) => {await fn(); report.assertions.push(id);};
 await check('basic.checkbox.indeterminate.initial',async () => assert.equal(await page.locator('#mixed').evaluate(n=>n.indeterminate),true));
 await check('basic.input.required.blocks-submit',async () => {
  await page.locator('#submit').click();
  assert.equal(await page.locator('#required').evaluate(n=>n.validity.valueMissing),true);
  assert.equal(submissions.length,0);
 });
 await check('basic.input.readonly.keyboard',async () => {
  await page.locator('#readonly').focus(); await page.keyboard.type('changed');
  assert.equal(await page.locator('#readonly').inputValue(),'fixed');
 });
 await page.evaluate(() => {
  window.choiceEvents = [];
  for (const type of ['input','change']) document.addEventListener(type,event => {
   if (event.target.matches('input[type="checkbox"]')) window.choiceEvents.push(`${event.target.id}:${type}`);
  });
 });
 await check('basic.choice.readonly.mouse-keyboard',async () => {
  for (const id of ['checkbox','switch']) {
   const input = page.locator(`#${id}`), initial = await input.isChecked();
   await input.click(); assert.equal(await input.isChecked(),initial);
   await input.focus(); await page.keyboard.press('Space'); assert.equal(await input.isChecked(),initial);
  }
 });
 await check('basic.choice.enabled-exactly-once-events',async () => {
  assert.deepEqual(await page.evaluate(()=>window.choiceEvents),[],'readonly choices never notify');
  const expected = [];
  for (const id of ['enabled-checkbox','enabled-switch']) {
   await page.locator(`#${id}`).focus(); await page.keyboard.press('Space');
   assert.equal(await page.locator(`#${id}`).isChecked(),true);
   expected.push(`${id}:input`,`${id}:change`);
  }
  assert.deepEqual(await page.evaluate(()=>window.choiceEvents),expected);
 });
 await check('basic.button.aria-disabled.native-activation',async () => {
  await page.locator('#required').fill('valid');
  await page.locator('#blocked').focus(); await page.keyboard.press('Enter');
  await page.keyboard.press('Space');
  // Browser task boundary lets a wrongly activated request reach the local server.
  await page.evaluate(() => new Promise(resolve=>setTimeout(resolve,100)));
  assert.equal(submissions.length,0);
  assert.equal(await page.locator('#aria-link').getAttribute('href'),null);
  assert.equal(await page.locator('#aria-link').getAttribute('role'),'link');
  assert.equal(await page.locator('#aria-link').evaluate(n=>n.tabIndex),0);
  assert.equal(await page.locator('#link').evaluate(n=>n.tabIndex),-1);
  await page.locator('#aria-link').focus();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'aria-link');
  await page.keyboard.press('Enter');
  // locator.click intentionally refuses aria-disabled targets. A real mouse
  // probe must still reach the unavailable link to verify our capture guard.
  const linkBox = await page.locator('#aria-link').boundingBox();
  assert(linkBox && linkBox.width > 0 && linkBox.height > 0);
  const linkPoint = {x:linkBox.x+linkBox.width/2,y:linkBox.y+linkBox.height/2};
  assert.equal(await page.evaluate(({x,y})=>document.elementFromPoint(x,y)?.closest('a')?.id,linkPoint),'aria-link');
  await page.mouse.click(linkPoint.x,linkPoint.y);
  assert.equal(page.url(),`${origin}/`);
  const popups = []; page.on('popup',popup=>popups.push(popup));
  await page.mouse.click(linkPoint.x,linkPoint.y,{button:'middle'});
  await page.evaluate(() => new Promise(resolve=>setTimeout(resolve,100)));
  assert.equal(popups.length,0,'aria-disabled link blocks auxiliary navigation');
  assert.equal(submissions.length,0,'unavailable link must not invoke its HTMX action');
  assert.equal(await page.locator('#link').getAttribute('href'),null);
 });
 await check('basic.select.native-selection-multiple-disabled',async () => {
  assert.equal(await page.locator('#select').inputValue(),'b');
  assert.deepEqual(await page.locator('#multiple').evaluate(n=>[...n.selectedOptions].map(o=>o.value)),['a','b']);
  // Native type-ahead also works on macOS, where a closed select ignores Home/End.
  // Refocusing clears the native type-ahead buffer between independent searches.
  for (const [key, expected] of [['a','a'],['b','b'],['u','b']]) {
   await page.locator('#multiple').focus(); await page.locator('#select').focus();
   await page.keyboard.press(key);
   assert.equal(await page.locator('#select').inputValue(),expected);
  }
  assert.deepEqual(await page.locator('#multiple').evaluate(n=>[...n.selectedOptions].map(o=>o.value)),['a','b']);
 });
 await check('basic.form.real-htmx-successful-controls',async () => {
  const response = page.waitForResponse(r=>r.url()===`${origin}/submit`);
  await page.locator('#submit').focus(); await page.keyboard.press('Enter'); await response;
  assert.deepEqual(submissions.at(-1),[['required','valid'],['readonly','fixed'],['choice','b'],['multi','a'],['multi','b'],['check','yes'],['intent','save']]);
 });
 await check('basic.form.reset-native-defaults',async () => {
  await page.locator('#required').fill('edited'); await page.locator('#select').selectOption('a');
  await page.locator('#multiple').selectOption(['b']);
  await page.locator('#reset').click();
  assert.equal(await page.locator('#required').inputValue(),''); assert.equal(await page.locator('#select').inputValue(),'b');
  assert.deepEqual(await page.locator('#multiple').evaluate(n=>[...n.selectedOptions].map(o=>o.value)),['a','b']);
 });
 await check('basic.checkbox.htmx-replacement-and-repeat-init',async () => {
  for (let i=0;i<2;i++) {
   await page.locator('#replace').click(); await page.waitForFunction(()=>document.querySelector('#swapped')?.indeterminate);
   await page.locator('#swapped').click(); assert.equal(await page.locator('#swapped').evaluate(n=>n.indeterminate),false);
   await page.evaluate(()=>document.dispatchEvent(new CustomEvent('htmx:after:swap')));
   assert.equal(await page.locator('#swapped').evaluate(n=>n.indeterminate),false,'repeat init must preserve user state');
  }
 });
 assert.deepEqual(errors,[]);
 // Mutation controls prove assertions distinguish omitted initialization and guards.
 const mutant = await browser.newPage();
 await mutant.route('**/assets/ely-controls.js',async route => {
  const source = await readFile(new URL('../../assets/ely-controls.js',import.meta.url),'utf8');
  const broken = source.replace('input.indeterminate = true;','input.indeterminate = false;').replace(/const blocked = event\.target\.closest\?\.\([^\n]+\);/,'const blocked = null;');
  assert.notEqual(source,broken);
  await route.fulfill({contentType:'text/javascript',body:broken});
 });
 await mutant.goto(origin);
 assert.equal(await mutant.locator('#mixed').evaluate(n=>n.indeterminate),false);
 report.negativeControls.push('removed-indeterminate-initialization-detected');
 await mutant.locator('#checkbox').click(); assert.equal(await mutant.locator('#checkbox').isChecked(),false);
 report.negativeControls.push('removed-readonly-activation-guard-detected');
 await mutant.locator('#required').fill('mutant');
 const mutantRequest = mutant.waitForResponse(r=>r.url()===`${origin}/submit`);
 const before = submissions.length;
 await mutant.locator('#blocked').focus(); await mutant.keyboard.press('Enter');
 await mutantRequest;
 assert.equal(submissions.length,before+1,'missing aria-disabled guard must produce a real unwanted request');
 report.negativeControls.push('removed-aria-disabled-guard-real-request-detected');
 assert.equal(report.assertions.length,10,'all named behavior checks must execute');
 assert.equal(report.negativeControls.length,3,'all mutations must be detected');
 report.status='passed'; console.log(JSON.stringify(report));
} catch(error) {report.status='failed'; report.error=String(error.stack||error); throw error;}
finally {
 await mkdir('test-results/gallery',{recursive:true});
 await writeFile('test-results/gallery/basic-form-contracts.json',JSON.stringify(report,null,2));
 await browser?.close(); await new Promise(resolve=>server.close(resolve));
}
