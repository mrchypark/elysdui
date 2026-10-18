import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {navigationMarkupMutations,mutateNavigationMarkup,readTabRelations,assertTabRelations} from './navigation-virtual-oracles.mjs';
const mutation=process.env.NAVIGATION_NEGATIVE_CONTROL||'';
const scriptMutations={
 'disabled-panel':["tab.closest('[data-interaction-tabs]')?.querySelectorAll('[data-interaction-tab]')","tab.closest('[data-interaction-tabs]')?.querySelectorAll('[data-interaction-tab]:not(:disabled)')",'disabled selected panel must be hidden'],
 'repeat-radio':["if (choice.getAttribute('aria-checked') === 'true') return;",'', 'radio reselect must not notify'],
 'selection-payload':['...(selection ? {values} : {})','...(selection ? {values: []} : {})','toggle payload must contain whole selection'],
 'radio-keyboard':["if (choice && !choice.disabled && root.dataset.elyDisabled !== 'true'",'if (false && choice && !choice.disabled', 'radio arrows must skip disabled choices'],
};
const mutations={...scriptMutations,...navigationMarkupMutations};
const report={suite:'navigation-contracts',revision:null,mutation,checks:[],status:'running',stage:'startup'};
const asset=async url=>{let content=await readFile(new URL(`..${url}`,import.meta.url),'utf8');if(scriptMutations[mutation]&&url==='/assets/ely-api-interaction.js'){const [from,to]=mutations[mutation];assert(content.includes(from),'mutation anchor must exist');content=content.replace(from,to);}return content;};
let browser,server;
try {
 assert(!mutation||mutations[mutation],'unknown mutation');
 report.revision=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 report.stage='render-fixture';
 const fixture=mutateNavigationMarkup(execFileSync('go',['run','./tests/navigation-contracts'],{encoding:'utf8'}),mutation);
 report.stage='render-fragment';
 const fragment=mutateNavigationMarkup(execFileSync('go',['run','./tests/navigation-contracts','fragment'],{encoding:'utf8'}),mutation);
 report.stage='render-grouped-fragment';
 const groupedFragment=execFileSync('go',['run','./tests/navigation-contracts','grouped-fragment'],{encoding:'utf8'});
 report.stage='server-start';
 server=createServer(async(req,res)=>{try{res.setHeader('content-type',req.url.startsWith('/assets/')?'text/javascript':'text/html');res.end(req.url==='/'?fixture:req.url==='/fragment'?fragment:req.url==='/grouped-fragment'?groupedFragment:await asset(req.url));}catch{res.writeHead(404).end();}});
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
 report.stage='browser-launch';
 browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
 report.stage='browser-contracts';
 const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{window.selectionEvents=[];window.navigationErrors=[];document.addEventListener('ely:error',e=>window.navigationErrors.push({id:e.detail?.id,message:e.detail?.error?.message||String(e.detail?.error)}));for(const type of ['ely:change','ely:action'])document.addEventListener(type,e=>window.selectionEvents.push({type,...e.detail,selectedTabs:[...e.target.querySelectorAll('[aria-selected="true"]')].map(n=>n.value),visiblePanels:e.target.querySelectorAll('[role="tabpanel"]:not([hidden])').length}));});
 await page.goto(`http://127.0.0.1:${server.address().port}`);
 await page.waitForFunction(()=>window.navigationErrors.length>0||[...document.querySelectorAll('[data-ely-family=interaction]')].every(root=>root.dataset.elyReady==='true'));
 assert.deepEqual(await page.evaluate(()=>window.navigationErrors),[],'production navigation initialization must not report errors');
 const tabs=page.locator('#tabs-a'),segments=page.locator('#segments-a');
 const checkTabLinks=async phase=>{
  for(const [id,count] of [['tabs-a',3],['tabs-b',3],['tabs-disabled',3],['tabs-empty',0]])assertTabRelations(await page.locator('#'+id).evaluate(readTabRelations),count,`${phase} ${id}`);
  assert.equal(await tabs.locator('[role=tablist]').getAttribute('aria-orientation'),'vertical',`${phase}: left tabs must expose vertical orientation`);
  report.checks.push(`${phase}: unique tab IDs, owned aria-controls, reciprocal aria-labelledby and vertical orientation`);
 };
 await checkTabLinks('initial render');
 const reset=()=>page.evaluate(()=>window.selectionEvents=[]);const events=()=>page.evaluate(()=>window.selectionEvents);
 const grouped=page.locator('#grouped');
 const groupedState=()=>grouped.locator('[role=radio]').evaluateAll(items=>items.map(item=>({name:item.name,value:item.value,checked:item.getAttribute('aria-checked'),tabindex:item.tabIndex,disabled:item.disabled})));
 const initialGroups=[
  {name:'range',value:'a',checked:'false',tabindex:-1,disabled:false},
  {name:'range',value:'b',checked:'true',tabindex:0,disabled:false},
  {name:'range',value:'c',checked:'false',tabindex:-1,disabled:true},
  {name:'locked',value:'a',checked:'true',tabindex:-1,disabled:true},
  {name:'locked',value:'b',checked:'false',tabindex:-1,disabled:true},
  {name:'fallback',value:'a',checked:'true',tabindex:0,disabled:false},
  {name:'fallback',value:'b',checked:'false',tabindex:-1,disabled:false},
 ];
 const checkGroupedSelection=async phase=>{
  await page.waitForFunction(()=>document.querySelector('#grouped [data-ely-family]')?.dataset.elyReady==='true');
  assert.equal(await grouped.locator('[role=radiogroup]').count(),3,`${phase}: SDUI must render all three groups`);
  assert.deepEqual(await groupedState(),initialGroups,`${phase}: grouped string Value must override conflicting Selected flags with exclusive checked and focus state`);
  const peerSelections=await page.locator('#segments-a [aria-checked=true],#segments-b [aria-checked=true]').evaluateAll(items=>items.map(item=>item.value));
  await reset();await grouped.locator('[name=range][value=a]').click();
  const selectedA=initialGroups.map(item=>item.name==='range'&&!item.disabled?{...item,checked:String(item.value==='a'),tabindex:item.value==='a'?0:-1}:item);
  assert.deepEqual(await groupedState(),selectedA,`${phase}: group selection must not change sibling groups`);
  assert.deepEqual((await events()).map(({name,value})=>({name,value})),[{name:'range',value:'a'}],`${phase}: grouped change must notify exactly once with the group name`);
  assert.deepEqual(await page.locator('#segments-a [aria-checked=true],#segments-b [aria-checked=true]').evaluateAll(items=>items.map(item=>item.value)),peerSelections,`${phase}: grouped selection must not change peer instances`);
  await reset();await grouped.locator('[name=range][value=a]').focus();
  for(const [key,value] of [['ArrowRight','b'],['ArrowRight','a'],['End','b'],['Home','a']]){
   await page.keyboard.press(key);
   assert.deepEqual(await groupedState(),value==='a'?selectedA:initialGroups,`${phase}: grouped keyboard must skip disabled items and preserve other groups`);
   assert.deepEqual(await page.evaluate(()=>({name:document.activeElement.name,value:document.activeElement.value})),{name:'range',value},`${phase}: grouped keyboard must move focus within its own group`);
  }
  assert.deepEqual((await events()).map(({name,value})=>({name,value})),['b','a','b','a'].map(value=>({name:'range',value})),`${phase}: grouped keyboard changes must notify once per action`);
  assert.deepEqual(await page.locator('#segments-a [aria-checked=true],#segments-b [aria-checked=true]').evaluateAll(items=>items.map(item=>item.value)),peerSelections,`${phase}: grouped keyboard must not change peer instances`);
  await reset();await grouped.locator('[name=range][value=a]').click();
  for(const selector of ['[name=range][value=c]','[name=locked][value=b]']){await grouped.locator(selector).dispatchEvent('click');await grouped.locator(selector).dispatchEvent('keydown',{key:'Home',bubbles:true});}
  assert.deepEqual(await events(),[],`${phase}: reselect and disabled group/item activation must not notify`);
  assert.deepEqual(await groupedState(),selectedA,`${phase}: reselect and disabled activation must leave groups unchanged`);
  report.checks.push(`${phase}: SDUI grouped string Value, exclusive checked/focus state, names, keyboard, disabled guards and group/instance isolation`);
 };
 assert.equal(await tabs.locator('[aria-selected="true"]').getAttribute('value'),'b');assert.equal(await tabs.locator('[role="tabpanel"]:not([hidden])').textContent(),'Beta body');assert.equal(await tabs.locator('[value="a"]').textContent(),'Alpha <safe>');report.checks.push('root value, exclusive panel and escaped label');
 await tabs.locator('[value="b"]').focus();await page.keyboard.press('ArrowUp');assert.equal(await tabs.locator('[aria-selected="true"]').getAttribute('value'),'a');assert.deepEqual((await events()).at(-1).selectedTabs,['a']);assert.equal((await events()).at(-1).visiblePanels,1);await page.keyboard.press('End');assert.equal(await tabs.locator('[aria-selected="true"]').getAttribute('value'),'b');await page.keyboard.press('ArrowDown');assert.equal(await tabs.locator('[aria-selected="true"]').getAttribute('value'),'a');assert.equal(await page.locator('#tabs-b [aria-selected="true"]').getAttribute('value'),'off');report.checks.push('vertical arrows, wrap, End, disabled skip and instance isolation');
 await page.locator('#tabs-b [value="b"]').click();assert.equal(await page.locator('#tabs-b [role="tabpanel"]:not([hidden])').count(),1,'disabled selected panel must be hidden');report.checks.push('disabled previous selection is cleared');
 await reset();await tabs.locator('[value="a"]').click();assert.equal((await events()).length,0,'tab reselect must not notify');await tabs.locator('[value="a"]').scrollIntoViewIfNeeded();const tabBox=await tabs.locator('[value="a"]').boundingBox();assert(tabBox&&tabBox.width>0&&tabBox.height>0);const point={x:Math.floor(tabBox.x+tabBox.width/2),y:Math.floor(tabBox.y+tabBox.height/2)};await page.mouse.click(point.x,point.y,{button:'right'});assert.deepEqual((await events()).map(({action,value,x,y})=>({action,value,x,y})),[{action:'tab-menu',value:'a',...point}]);await reset();await tabs.locator('[value="off"]').dispatchEvent('contextmenu');assert.equal((await events()).length,0);report.checks.push('tab idempotence and opt-in context value/pointer with disabled guard');
 await reset();await segments.locator('[value="b"]').click();assert.equal((await events()).length,0,'radio reselect must not notify');
 await segments.locator('[value="b"]').focus();await page.keyboard.press('ArrowLeft');assert.equal(await segments.locator('[aria-checked="true"]').getAttribute('value'),'a','radio arrows must skip disabled choices');assert.equal(await segments.locator('[tabindex="0"]').count(),1);assert.equal((await events()).length,1);assert.equal((await events())[0].name,'view');await page.keyboard.press('End');assert.equal(await segments.locator('[aria-checked="true"]').getAttribute('value'),'b');assert.equal(await page.locator('#segments-b [aria-checked="true"]').getAttribute('value'),'a');report.checks.push('radio keyboard, roving focus, idempotence and named event');
 await reset();await page.locator('#toggles-a [value="b"]').click();assert.deepEqual((await events()).at(-1).values,['a','b'],'toggle payload must contain whole selection');await page.locator('#toggles-a [value="a"]').click();assert.deepEqual((await events()).at(-1).values,['b']);await page.locator('#toggles-b [value="b"]').focus();await page.keyboard.press('Space');assert.deepEqual((await events()).at(-1).values,['b']);await page.keyboard.press('Enter');assert.deepEqual((await events()).at(-1).values,[]);report.checks.push('multiple and single toggle state, full selection, keyboard deselection');
 await reset();for(const id of ['tabs-disabled','segments-disabled','toggles-disabled'])await page.locator(`#${id} button`).first().dispatchEvent('click');for(const id of ['tabs-a','segments-a','toggles-a'])await page.locator(`#${id} [value="off"]`).dispatchEvent('click');await tabs.locator('[value="off"]').dispatchEvent('keydown',{key:'Home'});assert.equal((await events()).length,0);report.checks.push('root and item disabled synthetic activation blocked');
 await checkGroupedSelection('initial grouped render');
 for(let pass=0;pass<2;pass++) {await page.evaluate(()=>{window.oldTabs=document.querySelector('#tabs-a');window.oldSelection=window.oldTabs.querySelector('[aria-selected="true"]').value;});await page.locator('#replace').click();await page.waitForFunction(()=>document.querySelector('#tabs-a')!==window.oldTabs&&document.querySelector('#tabs-a')?.dataset.elyReady==='true');await checkTabLinks(`HTMX swap ${pass+1}`);await reset();await page.evaluate(()=>window.oldTabs.querySelector(window.oldSelection==='a'?'[value="b"]':'[value="a"]').click());assert.equal(await page.evaluate(()=>window.oldTabs.querySelector('[aria-selected="true"]').value===window.oldSelection),true,'removed instance handlers must be detached');assert.equal((await events()).length,0);await tabs.locator('[value="a"]').click();assert.equal((await events()).length,1,'HTMX remount must notify exactly once');assert.equal((await events())[0].id,'tabs-a');}
 for(let pass=0;pass<2;pass++){
  await page.evaluate(()=>window.oldGrouped=document.querySelector('#grouped-screen'));
  await page.locator('#replace-grouped').click();
  await page.waitForFunction(()=>!window.oldGrouped.isConnected&&document.querySelector('#grouped [data-ely-family]')?.dataset.elyReady==='true');
  await reset();await page.evaluate(()=>window.oldGrouped.querySelector('[name=range][value=b]').click());
  assert.equal(await page.evaluate(()=>window.oldGrouped.querySelector('[name=range][aria-checked=true]').value),'a','removed grouped instance must retain its last selection');
  assert.deepEqual(await events(),[],'removed grouped instance must not notify');
  await checkGroupedSelection(`grouped HTMX swap ${pass+1}`);
 }
 report.checks.push('two real grouped SDUI HTMX outerHTML swaps, old-instance cleanup and exactly-once remount');
 report.checks.push('two real HTMX outerHTML swaps, old-instance cleanup and exactly-once remount');assert.deepEqual(errors,[]);assert.deepEqual(await page.evaluate(()=>window.navigationErrors),[],'navigation runtime must not report errors');assert.equal(mutation,'','mutation unexpectedly survived');report.status='passed';
} catch(error) {report.error=error.stack;if(mutations[mutation]&&error instanceof assert.AssertionError&&error.message.includes(mutations[mutation][2]))report.status='mutation-killed';else{report.status='failed';throw error;}}
finally {await mkdir('test-results/contracts',{recursive:true});await writeFile(`test-results/contracts/navigation${mutation?'-'+mutation:''}.json`,JSON.stringify(report,null,2));await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));}
