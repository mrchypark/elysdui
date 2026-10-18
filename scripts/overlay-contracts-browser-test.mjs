import assert from 'node:assert/strict';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {chromium} from 'playwright';
const render=name=>execFileSync('go',['run','./tests/overlay-contracts',name],{encoding:'utf8'});
const fixture=render('fixture'),fragment=render('fragment');
const report={suite:'overlay-contracts',revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),upstream:'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721',assertions:[],negativeControls:[]};
let browser,requests=0;
const server=createServer(async(req,res)=>{try{const path=new URL(req.url,'http://localhost').pathname;if(path==='/')return res.setHeader('content-type','text/html').end(fixture);if(path==='/fragment'){requests++;return res.setHeader('content-type','text/html').end(fragment);}if(/^\/assets\/[\w.-]+\.(js|css)$/.test(path))return res.setHeader('content-type',path.endsWith('.js')?'text/javascript':'text/css').end(await readFile(new URL(`..${path}`,import.meta.url)));res.writeHead(404).end();}catch(e){res.writeHead(500).end(String(e));}});
try{
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
 const origin=`http://127.0.0.1:${server.address().port}`,page=await browser.newPage({viewport:{width:1100,height:900}}),errors=[];page.on('pageerror',e=>errors.push(String(e)));await page.goto(origin);await page.waitForFunction(()=>document.querySelectorAll('[data-ely-ready="true"]').length===11);
 const check=async(id,fn)=>{await fn();report.assertions.push(id);console.log(id);};
 const trigger=id=>page.locator(`#${id} [data-interaction-dialog], #${id} [data-interaction-menu], #${id} [data-foundation-dialog-open]`).first(),dialog=id=>page.locator(`#${id} dialog`);
 const focused=async (selector,p=page)=>{
  const state=await p.locator(selector).first().evaluate(node=>({matches:node===document.activeElement,active:document.activeElement?.outerHTML.slice(0,350)}));
  assert.equal(state.matches,true,`${selector} receives focus; active element: ${state.active}`);
 };
 // Complete a close and the next focus handoff in one browser task. Force
 // either the next trigger (before Enter) or switch (before Space) to own focus
 // before any queued restoration frame. Await real lifecycle signals, no sleep.
 const dismissToPopover=async (p,phase)=>{
  const selector=phase==='trigger'?'#popover [data-interaction-menu]':'#popover [role="switch"]';
  const state=await p.evaluate(phase=>{
   const opener=document.querySelector('#dialog [data-interaction-dialog]'),dialog=document.querySelector('#dialog dialog');
   const popover=document.querySelector('#popover [data-interaction-menu]'),toggle=document.querySelector('#popover [role="switch"]');
   window.handoffClosed=false;
   dialog.addEventListener('close',()=>window.handoffClosed=true,{once:true});
   window.handoffActions=[];
   document.addEventListener('ely:action',event=>window.handoffActions.push({id:event.detail.id,action:event.detail.action}));
   opener.focus();opener.click();
   const dialogFocused=document.activeElement===dialog.querySelector('input');
   dialog.querySelector('[data-interaction-close]').click();
   const restored=document.activeElement===opener;
   popover.focus();if(phase==='switch')popover.click();
   return {dialogFocused,restored,handoffFocused:document.activeElement===(phase==='trigger'?popover:toggle)};
  },phase);
  assert.equal(state.dialogFocused,true,'dialog input initially receives focus');
  assert.equal(state.restored,true,'native close immediately restores the dialog opener');
  assert.equal(state.handoffFocused,true,`next popover initially focuses its ${phase}`);
  await p.waitForFunction(()=>window.handoffClosed);
  await p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(resolve)));
  const settled=await p.locator(selector).evaluate(node=>({retained:document.activeElement===node,active:document.activeElement?.outerHTML.slice(0,350)}));
  assert.equal(settled.retained,true,`dialog close must retain the next popover ${phase} focus; active element: ${settled.active}`);
  if(phase==='trigger'){
   assert.equal(await p.locator(selector).getAttribute('aria-expanded'),'false');
   await focused(selector,p);await p.keyboard.press('Enter');
   assert.equal(await p.locator(selector).getAttribute('aria-expanded'),'true','Enter activates the still-focused popover trigger');
  }
  await focused('#popover [role="switch"]',p);
  await p.keyboard.down('Space');await focused('#popover [role="switch"]',p);
  await p.keyboard.up('Space');await focused('#popover [role="switch"]',p);
  assert.equal(await p.locator('#popover [role="switch"]').getAttribute('aria-checked'),'true','Space activates the still-focused popover switch');
  assert.deepEqual(await p.evaluate(()=>window.handoffActions),[{id:'popover',action:'toggle'}],'the keyboard handoff emits exactly one popover action');
 };
 // Tailwind resets dialog margins; a fixed (2,2) may be inside the card.
 // Prove both geometry and native top-layer hit testing before dismissal.
 const backdrop=async id=>{
  const point=await dialog(id).evaluate(node=>{
   const box=node.getBoundingClientRect();
   const candidates=[{x:2,y:2},{x:innerWidth-2,y:2},{x:2,y:innerHeight-2},{x:innerWidth-2,y:innerHeight-2}];
   const point=candidates.find(p=>(p.x<box.left||p.x>box.right||p.y<box.top||p.y>box.bottom)&&document.elementFromPoint(p.x,p.y)===node);
   return {point,box:{left:box.left,right:box.right,top:box.top,bottom:box.bottom},open:node.open};
  });
  assert.equal(point.open,true,'backdrop test requires an open dialog');
  assert.ok(point.point,`No native dialog backdrop hit outside card: ${JSON.stringify(point)}`);
  await page.mouse.click(point.point.x,point.point.y);
 };
 const closed=async id=>{await page.waitForFunction(id=>!document.querySelector(`#${id} dialog`).open,id);await page.waitForFunction(id=>document.activeElement===document.querySelector(`#${id} [data-interaction-dialog], #${id} [data-foundation-dialog-open]`),id);};
 await page.evaluate(()=>{window.actions=[];window.results=[];window.fail=false;document.addEventListener('ely:action',e=>window.actions.push({id:e.detail.id,action:e.detail.action,values:e.detail.values,value:e.detail.value}));document.addEventListener('ely:result',e=>window.results.push(e.detail.id));});
 const bind=()=>page.evaluate(async()=>{const {mount}=await import('/assets/ely-api.js');for(const id of ['dialog','prompt','alert','held'])mount(document.getElementById(id),{onAction:async()=>{if(window.fail)throw Error('Host rejected');return {ok:true};}});});await bind();
 await check('dialog.accessible-name-description',async()=>{await trigger('dialog').click();assert.equal(await page.getByRole('dialog',{name:'Edit account'}).count(),1);assert.equal(await dialog('dialog').getAttribute('aria-describedby'),'dialog-dialog-detail');await focused('#dialog input');});
 await check('dialog.tab-trap-both-directions',async()=>{await page.locator('#dialog button[type="submit"]').focus();await page.keyboard.press('Tab');await focused('#dialog [data-interaction-close]');await page.keyboard.press('Shift+Tab');await focused('#dialog button[type="submit"]');});
 await check('dialog.escape-restores-opener-repeated',async()=>{for(let i=0;i<3;i++){if(i)await trigger('dialog').click();await page.keyboard.press('Escape');await closed('dialog');await page.waitForFunction(()=>document.activeElement===document.querySelector('#dialog [data-interaction-dialog]'));}});
 await check('dialog.host-failure-retains-success-closes-once',async()=>{await trigger('dialog').click();await page.locator('#dialog input').fill('changed');await page.evaluate(()=>window.fail=true);await page.locator('#dialog button[type="submit"]').click();await page.waitForFunction(()=>window.actions.length===1);assert.equal(await dialog('dialog').evaluate(n=>n.open),true);assert.deepEqual(await page.evaluate(()=>window.actions[0].values),[['account','changed']]);await page.evaluate(()=>window.fail=false);await page.locator('#dialog button[type="submit"]').click();await closed('dialog');assert.equal(await page.evaluate(()=>window.actions.length),2);assert.deepEqual(await page.evaluate(()=>window.results),['dialog']);});
 await check('dialog.prompt-validation-blocks-host',async()=>{await trigger('prompt').click();for(const value of ['   ','bad/name']){await page.locator('#prompt input').fill(value);await page.locator('#prompt button[type="submit"]').click();assert.equal(await dialog('prompt').evaluate(n=>n.open),true);assert.equal(await page.evaluate(()=>window.actions.length),2);}await page.locator('#prompt input').fill('valid');await page.locator('#prompt button[type="submit"]').click();await closed('prompt');});
 await check('dialog.alert-nondismissible',async()=>{await trigger('alert').click();assert.equal(await page.getByRole('alertdialog',{name:'Confirm deletion'}).count(),1);await page.keyboard.press('Escape');assert.equal(await dialog('alert').evaluate(n=>n.open),true);await backdrop('alert');assert.equal(await dialog('alert').evaluate(n=>n.open),true);await page.locator('#alert [data-interaction-dialog-action]').click();await closed('alert');});
 await check('dialog.generic-dismissible-false',async()=>{await trigger('held').click();assert.equal(await page.locator('#held [data-interaction-close]').count(),0);await page.keyboard.press('Escape');assert.equal(await dialog('held').evaluate(n=>n.open),true);await backdrop('held');assert.equal(await dialog('held').evaluate(n=>n.open),true);await page.locator('#held button[type=submit]').click();await closed('held');});
 await check('dialog.backdrop-dismisses',async()=>{await trigger('dialog').click();await backdrop('dialog');await closed('dialog');});
 for(const phase of ['trigger','switch'])await check(`dialog.dismiss-to-popover-retains-${phase}-focus`,async()=>{
  const p=await browser.newPage();p.on('pageerror',e=>errors.push(String(e)));
  try {await p.goto(origin);await p.waitForFunction(()=>document.querySelector('#popover').dataset.elyReady==='true');await dismissToPopover(p,phase);}
  finally {await p.close();}
 });
 await check('popover.keyboard-focus-toggle-event-isolation',async()=>{await trigger('popover').focus();await focused('#popover [data-interaction-menu]');await page.keyboard.press('Enter');assert.equal(await trigger('popover').getAttribute('aria-expanded'),'true');await focused('#popover [role="switch"]');const before=await page.evaluate(()=>window.actions.length);await page.keyboard.press('Space');await focused('#popover [role="switch"]');assert.equal(await page.locator('#popover [role="switch"]').getAttribute('aria-checked'),'true');assert.equal(await page.evaluate(()=>window.actions.length),before+1);assert.equal(await trigger('peer').getAttribute('aria-expanded'),'false');await page.locator('#popover [data-interaction-close]').focus();await page.keyboard.press('Tab');await focused('#popover [role="switch"]');await page.keyboard.press('Shift+Tab');await focused('#popover [data-interaction-close]');await page.keyboard.press('Escape');await focused('#popover [data-interaction-menu]');assert.equal(await trigger('popover').getAttribute('aria-expanded'),'false');});
 await check('popover.outside-dismissal-repeat',async()=>{for(let i=0;i<3;i++){await trigger('popover').click();await page.locator('#outside').click();assert.equal(await trigger('popover').getAttribute('aria-expanded'),'false');}await trigger('peer').click();await page.locator('#peer [data-interaction-close]').click();await focused('#peer [data-interaction-menu]');});
 await check('disabled-overlays-cannot-open',async()=>{for(const id of ['disabled-dialog','disabled-popover','disabled-drawer']){assert.equal(await trigger(id).isDisabled(),true);await trigger(id).dispatchEvent('click');assert.equal(await page.locator(`#${id} dialog[open], #${id} [data-interaction-popover]:not([hidden])`).count(),0);}});
 await check('drawer.name-dismissal-focus-repeat',async()=>{for(let i=0;i<3;i++){await trigger('drawer').click();assert.equal(await page.getByRole('dialog',{name:'Drawer title'}).count(),1);await page.keyboard.press('Escape');await closed('drawer');await focused('#drawer [data-foundation-dialog-open]');}await trigger('hidden-drawer').click();assert.equal(await page.getByRole('dialog',{name:'Untitled drawer'}).count(),1);assert.equal(await page.locator('#hidden-drawer [data-foundation-dialog-close]').count(),0);await page.keyboard.press('Escape');await closed('hidden-drawer');});
 await check('drawer.drag-threshold-exactly-once-event',async()=>{await trigger('drawer').click();let box=await page.locator('#drawer [data-foundation-dialog-handle]').boundingBox();const height=await dialog('drawer').evaluate(n=>n.offsetHeight),before=await page.evaluate(()=>window.actions.length);const drag=async share=>{box=await page.locator('#drawer [data-foundation-dialog-handle]').boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(box.x+box.width/2,box.y+box.height/2+height*share,{steps:8});await page.mouse.up();};await drag(.15);assert.equal(await dialog('drawer').evaluate(n=>n.open),true);assert.equal(await page.evaluate(()=>window.actions.length),before);await drag(.5);await closed('drawer');assert.equal(await page.evaluate(()=>window.actions.length),before+1);});
 await check('actual-htmx-replacement-open-root-cleanup-remount',async()=>{for(let i=0;i<3;i++){await trigger('popover').click();await page.evaluate(()=>{window.oldOverlay=document.querySelector('#popover');window.cleanupCount=0;window.oldOverlay.addEventListener('ely:cleanup',()=>window.cleanupCount++);});await page.evaluate(()=>htmx.ajax('GET','/fragment',{target:'#region',swap:'outerHTML'}));await page.waitForFunction(()=>window.oldOverlay!==document.querySelector('#popover')&&document.querySelector('#popover').dataset.elyReady==='true');assert.equal(await page.evaluate(()=>window.cleanupCount),1);await bind();await trigger('dialog').click();const before=await page.evaluate(()=>window.actions.length);await page.locator('#dialog button[type="submit"]').click();await closed('dialog');assert.equal(await page.evaluate(()=>window.actions.length),before+1);await trigger('drawer').click();await page.locator('#drawer [data-foundation-dialog-close]').click();await trigger('popover').click();assert.equal(await trigger('popover').getAttribute('aria-expanded'),'true');await page.keyboard.press('Escape');}assert.equal(requests,3);});
 for(const [name,mutation,oracle] of [
 ['popover-focus-trap',"document.querySelector('#popover [data-interaction-close]').addEventListener('keydown',e=>e.stopImmediatePropagation())",async p=>{await p.locator('#popover [data-interaction-menu]').click();await p.locator('#popover [data-interaction-close]').focus();await p.keyboard.press('Tab');assert.equal(await p.locator('#popover [role=switch]').evaluate(n=>n===document.activeElement),true);}],
 ['dialog-accessible-name',"document.querySelector('#dialog dialog').removeAttribute('aria-labelledby')",async p=>{await p.locator('#dialog [data-interaction-dialog]').click();assert.equal(await p.getByRole('dialog',{name:'Edit account'}).count(),1);}]
 ]){const p=await browser.newPage();await p.goto(origin);await p.waitForFunction(()=>document.querySelector('#popover').dataset.elyReady==='true');await p.evaluate(mutation);let caught=false;try{await oracle(p);}catch(error){if(error.code!=='ERR_ASSERTION')throw error;caught=true;}assert.equal(caught,true,`Negative control ${name} must be detected`);report.negativeControls.push(name);await p.close();}
 // Reintroduce exactly the old unguarded deferred refocus. The handoff oracle
 // must reject it at focus retention, before the subsequent Enter/Space action.
 for(const phase of ['trigger','switch']){
  const p=await browser.newPage();
  try {
   await p.goto(origin);await p.waitForFunction(()=>document.querySelector('#popover').dataset.elyReady==='true');
   await p.evaluate(()=>{
    const root=document.querySelector('#dialog'),opener=root.querySelector('[data-interaction-dialog]');
    root.addEventListener('click',event=>{if(event.target.closest('[data-interaction-close]'))requestAnimationFrame(()=>opener.focus({preventScroll:true}));});
   });
   let caught=false;
   try {await dismissToPopover(p,phase);} catch(error) {
    if(error.code!=='ERR_ASSERTION'||!error.message.includes(`dialog close must retain the next popover ${phase} focus`))throw error;
    caught=true;
   }
   assert.equal(caught,true,`Negative control dialog-stale-focus-${phase} must fail the focus-retention oracle`);
   report.negativeControls.push(`dialog-stale-focus-${phase}`);
  } finally {await p.close();}
 }
 assert.deepEqual(errors,[]);report.status='passed';console.log(`Overlay browser contracts: ${report.assertions.length} groups; ${report.negativeControls.length} causal negative controls passed`);
}catch(error){report.status='failed';report.error=String(error.stack||error);throw error;}
finally{await mkdir('test-results/contracts',{recursive:true});await writeFile('test-results/contracts/overlay.json',JSON.stringify(report,null,2));await browser?.close();await new Promise(resolve=>server.close(resolve));}
