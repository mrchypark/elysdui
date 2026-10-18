import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const mutation = process.env.MENU_NEGATIVE_CONTROL || '';
const mutations = {
  'radio-scope': {asset:'/assets/ely-api-interaction.js', from:`item.closest('[role="menu"]') === panel && item.dataset.interactionMenuRadio`, to:'item.dataset.interactionMenuRadio', oracle:'parent selection must preserve nested radio group'},
  'action-order': {asset:'/assets/ely-api.js', from:"if (button.dataset.interactionMenuAction !== undefined) return;", to:'// restored premature generic menu dispatch', oracle:'host action must observe committed checkbox and dismissed menu'},
  'context-focus': {asset:'/assets/ely-api-interaction.js', from:'(previous?.isConnected ? previous : context || trigger).focus();', to:'trigger.focus();', oracle:'context dismissal must restore original focus'},
  'placement': {asset:'/assets/ely-api-interaction.js', from:"panel.hasAttribute('data-interaction-popover') || panel.closest('.ely-interaction--menus') && !panel.parentElement.matches('.ely-interaction__menu-row') && !panel.matches('.ely-interaction__pie')", to:"panel.hasAttribute('data-interaction-popover')", oracle:'edge dropdown must remain inside viewport'},
  'cleanup': {asset:'/assets/ely-api-interaction.js', from:'return () => { close(); clearReorderPreview();', to:'return () => { clearReorderPreview();', oracle:'teardown must close the old open menu'},
};
const report = {
  suite:'menu-contracts', revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  dirty:!!execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),
  sourcePins:{implementedMenuReference:'49ed1f84056fa13347d68801b479a4a5a8e03b53',compatibilityAudit:'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721'},
  mutation, status:'running', checks:[], assets:{}, requests:[],
};
let browser, server;
try {
  assert(!mutation || mutations[mutation], 'unknown menu mutation');
  const fixture=execFileSync('go',['run','./tests/menu-contracts'],{encoding:'utf8'});
  const fragment=execFileSync('go',['run','./tests/menu-contracts','fragment'],{encoding:'utf8'});
  report.fixtureSHA256=createHash('sha256').update(fixture).digest('hex');
  const assets=new Map();
  for(const path of ['/assets/ely-api.js','/assets/ely-api-interaction.js']) {
    let source=await readFile(new URL(`..${path}`,import.meta.url),'utf8');
    report.assets[path]={sourceSHA256:createHash('sha256').update(source).digest('hex')};
    if(mutations[mutation]?.asset===path){const {from,to}=mutations[mutation];assert.equal(source.split(from).length,2,'mutation anchor must be unique');source=source.replace(from,to);}
    report.assets[path].servedSHA256=createHash('sha256').update(source).digest('hex');assets.set(path,source);
  }
  server=createServer(async(req,res)=>{
    try {
      const path=new URL(req.url,'http://localhost').pathname;
      if(path==='/')return res.setHeader('content-type','text/html').end(fixture);
      if(path==='/fragment'){report.requests.push({method:req.method,path});return res.setHeader('content-type','text/html').end(fragment);}
      if(!/^\/assets\/[\w/.-]+$/.test(path)||path.includes('..'))return res.writeHead(404).end();
      res.setHeader('content-type',path.endsWith('.css')?'text/css':path.endsWith('.svg')?'image/svg+xml':'text/javascript');
      res.end(assets.get(path)||await readFile(new URL(`..${path}`,import.meta.url)));
    } catch(error) {res.writeHead(500).end(String(error));}
  });
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.menuStartupErrors=[];document.addEventListener('ely:error',e=>menuStartupErrors.push({id:e.detail.id,message:e.detail.error?.message}));});
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const expectedIDs=['menu-a','menu-b','dropdown','split','overflow','checks','context-a','empty','all-off','disabled-Menu','disabled-DropdownMenu','disabled-ContextMenu','edge','form-menu'];
  await page.waitForFunction(ids=>ids.every(id=>['true','error'].includes(document.getElementById(id)?.dataset.elyReady)),expectedIDs);
  assert.deepEqual(await page.evaluate(ids=>ids.map(id=>({id,ready:document.getElementById(id).dataset.elyReady})),expectedIDs),expectedIDs.map(id=>({id,ready:'true'})));
  assert.deepEqual(await page.evaluate(()=>menuStartupErrors),[]);
  await page.evaluate(async()=>{
    const {mount}=await import('/assets/ely-api.js');
    window.menuLog={actions:[],changes:[],results:[],errors:[]};window.failMenu=false;window.menuKeyLeaks=[];for(const type of ['keydown','keyup'])document.addEventListener(type,e=>{if(['Enter',' '].includes(e.key))menuKeyLeaks.push({type,key:e.key});});
    window.menuSnapshot=root=>({open:!root.querySelector('[role="menu"]').hidden,selected:[...root.querySelectorAll('[aria-checked="true"]')].map(n=>n.value),focused:document.activeElement?.value||document.activeElement?.id});
    window.bindMenu=root=>mount(root,{
      onAction:detail=>{menuLog.actions.push({id:detail.id,action:detail.action,value:detail.value,values:detail.values,formValues:detail.formData?[...detail.formData]:null,...menuSnapshot(root)});if(window.failMenu)throw Error('Menu host rejected');return {saved:true};},
      onChange:detail=>menuLog.changes.push({...detail,...menuSnapshot(root)}),
    });
    document.querySelectorAll('[data-ely-family="interaction"]').forEach(bindMenu);
    document.addEventListener('ely:result',e=>menuLog.results.push({id:e.detail.id,action:e.detail.action,result:e.detail.result}));
    document.addEventListener('ely:error',e=>menuLog.errors.push({id:e.detail.id,action:e.detail.action,message:e.detail.error?.message}));
  });
  const check=async(name,fn)=>{await fn();report.checks.push(name);console.log(name);};
  const root=id=>page.locator(`#${id}`);
  const trigger=id=>root(id).locator('[data-interaction-menu]').first();
  const panel=id=>root(id).locator('[role="menu"]').first();
  const row=(id,value)=>root(id).locator(`[value="${value}"]`);
  const focused=async(selector,message='expected element must own keyboard focus')=>assert.equal(await page.locator(selector).evaluate(n=>document.activeElement===n),true,message);
  const hidden=async id=>panel(id).evaluate(n=>n.hidden);
  const reset=()=>page.evaluate(()=>{for(const key of Object.keys(menuLog))menuLog[key]=[];});
  const logs=()=>page.evaluate(()=>menuLog);
  const open=async id=>{await trigger(id).focus();await page.keyboard.press('ArrowDown');assert.equal(await hidden(id),false);};
  await check('menu.open-keyboard-disabled-separator-skip-wrap-home-end',async()=>{
    await open('menu-a');await focused('#menu-a [value="open"]');assert.equal(await page.getByRole('menu',{name:'File menu',exact:true}).isVisible(),true);
    assert.equal(await row('menu-a','open').locator('[data-interaction-menu-label]').textContent(),'Open <safe>');assert.equal(await row('menu-a','open').locator('kbd').textContent(),'Ctrl+O');
    await page.keyboard.press('ArrowUp');await focused('#menu-a [value="last"]');
    await page.keyboard.press('Home');await focused('#menu-a [value="open"]');
    await page.keyboard.press('End');await focused('#menu-a [value="last"]');
    await page.keyboard.press('Escape');assert.equal(await hidden('menu-a'),true);await focused('#menu-a [data-interaction-menu="menu-a-menu"]');
    assert.equal(await hidden('menu-b'),true);
  });
  await check('menu.checkbox-commits-before-change-action-rejection',async()=>{
    await open('menu-a');await row('menu-a','sidebar').focus();await reset();await page.evaluate(()=>window.failMenu=true);
    await page.keyboard.press('Space');await page.waitForFunction(()=>menuLog.errors.length>0);
    const log=await logs();assert.equal(await row('menu-a','sidebar').getAttribute('aria-checked'),'true');
    assert.deepEqual(log.actions.map(({action,value,open,selected})=>({action,value,open,selected})),[{action:'toggle-sidebar',value:'sidebar',open:false,selected:['sidebar','comfortable','nested-comfortable']}],'host action must observe committed checkbox and dismissed menu');
    assert.equal(log.changes.length,1);assert.equal(log.changes[0].checked,true);assert.equal(log.changes[0].selected.includes('sidebar'),true);assert.equal(log.changes[0].open,false);
    assert.deepEqual(log.errors,[{id:'menu-a',action:'toggle-sidebar',message:'Menu host rejected'}]);assert.deepEqual(log.results,[]);assert.equal(await hidden('menu-a'),true);
    await page.evaluate(()=>window.failMenu=false);await open('menu-a');await row('menu-a','sidebar').focus();await page.keyboard.press('Enter');await page.waitForFunction(()=>menuLog.results.length===1);
    assert.equal(await row('menu-a','sidebar').getAttribute('aria-checked'),'false');assert.equal((await logs()).actions.length,2);assert.equal((await logs()).changes.length,2);assert.deepEqual(await page.evaluate(()=>menuKeyLeaks),[],'menu confirms must stay inside on both key phases');
  });
  await check('menu.radio-state-is-panel-local-named-and-repeatable',async()=>{
    await open('menu-a');await row('menu-a','compact').focus();await reset();await page.keyboard.press('Enter');
    assert.equal(await row('menu-a','compact').getAttribute('aria-checked'),'true');assert.equal(await row('menu-a','comfortable').getAttribute('aria-checked'),'false');
    assert.equal(await row('menu-a','nested-comfortable').getAttribute('aria-checked'),'true','parent selection must preserve nested radio group');
    let log=await logs();assert.equal(log.changes[0].name,'density');assert.equal(log.changes[0].value,'compact');assert.equal(log.changes[0].open,false);assert.equal(log.actions.length,1);
    await open('menu-a');await row('menu-a','compact').focus();await page.keyboard.press('Space');log=await logs();assert.equal(log.actions.length,2,'selected source radio is still a caller action');assert.equal(log.changes.length,2);
    assert.equal(await row('menu-b','comfortable').getAttribute('aria-checked'),'true');
  });
  await check('menu.nested-depth-disabled-skip-escape-left-and-hover-click',async()=>{
    await open('menu-a');await row('menu-a','recent').focus();await page.keyboard.press('ArrowRight');await focused('#menu-a [value="nested-comfortable"]');
    await page.keyboard.press('End');await focused('#menu-a [value="deep"]');await page.keyboard.press('ArrowRight');await focused('#menu-a [value="deep-leaf"]');
    await page.keyboard.press('Escape');await focused('#menu-a [value="deep"]');assert.equal(await row('menu-a','recent').getAttribute('aria-expanded'),'true');
    await page.keyboard.press('ArrowLeft');await focused('#menu-a [value="recent"]');assert.equal(await row('menu-a','recent').getAttribute('aria-expanded'),'false');
    await row('menu-a','recent').hover();assert.equal(await row('menu-a','recent').getAttribute('aria-expanded'),'true');
    await row('menu-a','recent').click();assert.equal(await row('menu-a','recent').getAttribute('aria-expanded'),'true','clicking a hover-open submenu keeps it open');await focused('#menu-a [value="nested-comfortable"]');
    await row('menu-a','recent').focus();await page.keyboard.press('ArrowDown');await focused('#menu-a [value="last"]');assert.equal(await row('menu-a','recent').getAttribute('aria-expanded'),'false');
    await page.keyboard.press('Escape');
  });
  await check('checkbox-menu.submenu-is-a-trigger-not-an-inherited-check',async()=>{
    await open('checks');await row('checks','parent').click();assert.equal(await row('checks','parent').getAttribute('aria-expanded'),'true');await focused('#checks [value="child"]');
    await reset();await page.keyboard.press('Enter');assert.deepEqual((await logs()).actions.map(({value})=>value),['child']);assert.equal((await logs()).changes.length,0);assert.equal(await hidden('checks'),true);
    await open('checks');await row('checks','ruler').focus();await page.keyboard.press('Space');assert.equal(await row('checks','ruler').getAttribute('aria-checked'),'false');
  });
  await check('dropdown.hosts-primary-closes-before-host-empty-focus',async()=>{
    for(const id of ['dropdown','overflow']) {await trigger(id).click();await focused(`#${id} [value="open"]`);await reset();await page.keyboard.press('Enter');assert.deepEqual((await logs()).actions.map(({action})=>action),['open-file']);assert.equal(await hidden(id),true);}
    await open('split');await reset();
    // HTMLElement.click deliberately bypasses pointerdown/focusout so this
    // observes the primary-action contract rather than incidental dismissal.
    await root('split').locator('[data-interaction-menu-primary]').evaluate(n=>n.click());
    assert.deepEqual((await logs()).actions.map(({action,value,open})=>({action,value,open})),[{action:'publish',value:'branch',open:false}]);
    for(const id of ['empty','all-off']) {await open(id);await focused(`#${id}-menu`);await page.keyboard.press('Escape');assert.equal(await hidden(id),true);await focused(`#${id} [data-interaction-menu]`);}
  });
  await check('menu.tab-exits-and-outside-dismissal-preserves-destination',async()=>{
    await open('menu-a');await page.keyboard.press('Tab');await focused('#menu-b [data-interaction-menu="menu-b-menu"]');assert.equal(await hidden('menu-a'),true);
    await open('menu-a');await page.keyboard.press('Shift+Tab');await focused('#menu-a [data-interaction-menu="menu-a-menu"]');assert.equal(await hidden('menu-a'),true);
    await open('menu-a');await page.locator('#before').click();await focused('#before');assert.equal(await hidden('menu-a'),true);
    await open('menu-a');await page.locator('#outside-blank').click();assert.equal(await hidden('menu-a'),true);await focused('#menu-a [data-interaction-menu="menu-a-menu"]');
    // A nonfocusable descendant outside the panel remains inside the family.
    await open('menu-a');await root('menu-a').evaluate(n=>n.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})));assert.equal(await hidden('menu-a'),true);
  });
  await check('dropdown.viewport-collision-and-submenu-left-placement',async()=>{
    await open('edge');let box=await panel('edge').boundingBox();assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=1100.5&&box.y+box.height<=900.5,'edge dropdown must remain inside viewport');
    await row('edge','recent').focus();await page.keyboard.press('ArrowRight');const sub=root('edge').locator('#edge-sub-7');const subBox=await sub.boundingBox();assert(subBox&&subBox.x>=0&&subBox.x+subBox.width<=1100.5&&subBox.y+subBox.height<=900.5);assert(subBox.x<box.x,'edge submenu must open to the left');await page.keyboard.press('Escape');await page.keyboard.press('Escape');
  });
  await check('context.pointer-clamp-keyboard-reanchor-and-focus-return',async()=>{
    await page.locator('#before').focus();const surface=root('context-a').locator('[data-interaction-context]');
    // ContextMenu does not focus on right pointer in Chromium consistently;
    // send the actual event at a measured canvas point while preserving opener.
    const bounds=await surface.boundingBox();assert(bounds&&bounds.width>0&&bounds.height>0);
    await surface.dispatchEvent('contextmenu',{clientX:1098,clientY:898});
    let box=await panel('context-a').boundingBox();const pointerBox=box;assert(box&&box.x>=0&&box.y>=0&&box.x+box.width<=1100.5&&box.y+box.height<=900.5);
    await focused('#context-a [value="open"]');await surface.dispatchEvent('contextmenu',{clientX:1090,clientY:890});await page.keyboard.press('Escape');await focused('#before','context dismissal must restore original focus');
    await surface.focus();await page.keyboard.press('Shift+F10');await focused('#context-a [value="open"]');box=await panel('context-a').boundingBox();assert(box,'keyboard context needs a visible panel');const anchor=await surface.boundingBox();const expectedLeft=Math.max(8,Math.min(anchor.x,1100-box.width-8));const below=anchor.y+anchor.height+6;const expectedTop=Math.max(8,Math.min(below+box.height>892?anchor.y-box.height-6:below,900-box.height-8));assert(Math.abs(box.x-expectedLeft)<=1&&Math.abs(box.y-expectedTop)<=1,'keyboard context must reanchor to its current surface');assert(Math.abs(box.x-pointerBox.x)>50,'keyboard context must discard the previous pointer position');
    await row('context-a','recent').focus();await page.keyboard.press('ArrowRight');await focused('#context-a [value="nested-comfortable"]');await page.keyboard.press('ArrowLeft');await focused('#context-a [value="recent"]');await page.keyboard.press('Escape');await focused('#context-a [data-interaction-context]');
    await surface.click({button:'right'});assert.equal(await hidden('context-a'),false);await page.keyboard.press('Escape');
    await page.locator('#before').focus();await surface.dispatchEvent('contextmenu',{clientX:bounds.x+20,clientY:bounds.y+20});await page.evaluate(()=>window.menuKeyLeaks=[]);await reset();await page.keyboard.press('Enter');await focused('#before');assert.equal((await logs()).actions.length,1);assert.deepEqual(await page.evaluate(()=>menuKeyLeaks),[],'context confirmation must contain keyup before restoring outside focus');
  });
  await check('menu.disabled-and-modified-activation-do-not-notify',async()=>{
    await reset();for(const id of ['disabled-Menu','disabled-DropdownMenu','disabled-ContextMenu']) {await trigger(id).dispatchEvent('click');await trigger(id).dispatchEvent('keydown',{key:'ArrowDown'});assert.equal(await hidden(id),true);}
    await open('menu-a');await row('menu-a','off').dispatchEvent('click');
    await row('menu-a','open').focus();for(const key of ['Control+Enter','Alt+Enter','Meta+Enter','Shift+Enter','Control+Space'])await page.keyboard.press(key);
    assert.equal((await logs()).actions.length,0);assert.equal((await logs()).changes.length,0);assert.equal(await hidden('menu-a'),false);await page.keyboard.press('Escape');
  });
  await check('menu.caller-form-payload-preserves-values',async()=>{
    await open('form-menu');await reset();await page.keyboard.press('Enter');const [action]=(await logs()).actions;
    assert.equal(action.value,'form-leaf');assert.deepEqual(action.values,[['scope','caller-value']]);assert.deepEqual(action.formValues,[['scope','caller-value']]);
  });
  await check('menu.real-htmx-inner-and-outer-swap-disposal-and-remount',async()=>{
    for(const style of ['innerHTML','outerHTML']) {
      await open('menu-a');await page.evaluate(()=>{window.oldRoot=document.querySelector('#menu-a');window.oldPanel=oldRoot.querySelector('[role="menu"]');window.oldTrigger=oldRoot.querySelector('[data-interaction-menu]');window.oldCheck=oldRoot.querySelector('[value="sidebar"]');window.oldChecked=oldCheck.getAttribute('aria-checked');window.menuCleanups=0;oldRoot.addEventListener('ely:cleanup',()=>window.menuCleanups++,{once:true});});
      // #before has no hx-swap, so this truly exercises the default innerHTML.
      await page.evaluate(style=>htmx.ajax('GET','/fragment',style==='innerHTML'?{source:'#before',target:'#menu-a',select:'#menu-a > *'}:{source:'#replace',target:'#menu-a',swap:style}),style);
      await page.waitForFunction(()=>document.querySelector('#menu-a')?.dataset.elyReady==='true');
      assert.equal(await page.evaluate(()=>oldPanel.hidden),true,'teardown must close the old open menu');assert.equal(await page.evaluate(()=>oldTrigger.getAttribute('aria-expanded')),'false');assert.equal(await page.evaluate(()=>menuCleanups),1);
      assert.equal(await page.evaluate(()=>document.querySelector('#menu-a')===oldRoot),style==='innerHTML');
      if(style==='outerHTML')await page.evaluate(()=>bindMenu(document.querySelector('#menu-a')));
      await reset();await page.evaluate(()=>{oldTrigger.click();oldCheck.click();});assert.equal(await page.evaluate(()=>oldCheck.getAttribute('aria-checked')===oldChecked),true);assert.equal((await logs()).actions.length,0);
      await open('menu-a');await row('menu-a','sidebar').focus();await page.keyboard.press('Space');assert.equal((await logs()).actions.length,1,'fresh menu must notify exactly once after HTMX');assert.equal((await logs()).changes.length,1);assert.equal(await row('menu-b','sidebar').getAttribute('aria-checked'),'false');
    }
    assert.deepEqual(report.requests,[{method:'GET',path:'/fragment'},{method:'GET',path:'/fragment'}]);
  });
  assert.deepEqual(report.checks,['menu.open-keyboard-disabled-separator-skip-wrap-home-end', 'menu.checkbox-commits-before-change-action-rejection', 'menu.radio-state-is-panel-local-named-and-repeatable', 'menu.nested-depth-disabled-skip-escape-left-and-hover-click', 'checkbox-menu.submenu-is-a-trigger-not-an-inherited-check', 'dropdown.hosts-primary-closes-before-host-empty-focus', 'menu.tab-exits-and-outside-dismissal-preserves-destination', 'dropdown.viewport-collision-and-submenu-left-placement', 'context.pointer-clamp-keyboard-reanchor-and-focus-return', 'menu.disabled-and-modified-activation-do-not-notify', 'menu.caller-form-payload-preserves-values', 'menu.real-htmx-inner-and-outer-swap-disposal-and-remount'],'all named menu requirements must execute');
  assert.deepEqual(errors,[]);assert.equal(mutation,'','menu negative control unexpectedly survived');report.status='passed';
} catch(error) {
  report.error=error.stack;
  if(mutation&&error instanceof assert.AssertionError&&error.message.includes(mutations[mutation]?.oracle))report.status='mutation-killed';
  else {report.status='failed';throw error;}
} finally {
  await mkdir('test-results/contracts',{recursive:true});
  await writeFile(`test-results/contracts/menu${mutation?'-'+mutation:''}.json`,JSON.stringify(report,null,2));
  await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
}
