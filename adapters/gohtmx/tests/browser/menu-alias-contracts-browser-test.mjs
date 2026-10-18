import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {createHash} from 'node:crypto';
import {readFile, mkdir, mkdtemp, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';

const surfaces = ['go','go-chapter','sdui'];
const mutation = process.env.MENU_ALIAS_NEGATIVE_CONTROL || '';
const mutations = {
  'radio-default': {from:'(eq $.Variant "RadioMenuItem")',to:'(eq $.Variant "__disabled_radio_default__")',oracle:'RadioMenuItem without Radio must expose radio semantics'},
  'overflow-default': {from:'(eq .Variant "OverflowMenu")',to:'(eq .Variant "__disabled_overflow_default__")',oracle:'OverflowMenu without Host must not expose a primary action'},
};
const hash = text => createHash('sha256').update(text).digest('hex');
const report = {
  suite:'menu-alias-contracts',revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  dirty:!!execFileSync('git',['status','--porcelain','--untracked-files=no'],{encoding:'utf8'}).trim(),
  sourcePins:{implementedMenuReference:'49ed1f84056fa13347d68801b479a4a5a8e03b53',compatibilityAudit:'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721'},
  mutation,status:'running',checks:[],cells:[],assets:{},fixtures:{},requests:[],
};
let browser,server,temp;
try {
  assert(!mutation || mutations[mutation], 'unknown menu alias mutation');
  const source=await readFile('ui/gohtmx/templates/ely-api-interaction.html','utf8');let served=source;
  for(const mutant of Object.values(mutations))assert.equal(source.split(mutant.from).length,2,'alias mutation anchor must be unique');
  if(mutation)served=source.replace(mutations[mutation].from,mutations[mutation].to);
  report.template={sourceSHA256:hash(source),servedSHA256:hash(served)};
  temp=await mkdtemp(join(tmpdir(),'ely-menu-alias-'));const templatePath=join(temp,'template.html');await writeFile(templatePath,served);
  const env={...process.env};delete env.MENU_ALIAS_TEMPLATE_FILE;if(mutation)env.MENU_ALIAS_TEMPLATE_FILE=templatePath;
  const fixture=execFileSync('go',['run','./adapters/gohtmx/tests/fixtures/menu-alias-contracts'],{encoding:'utf8',env});report.fixtures.full=hash(fixture);
  const fragments=new Map();for(const surface of surfaces)for(const kind of ['radio','overflow']) {
    const id=`${surface}-${kind}`,fragment=execFileSync('go',['run','./adapters/gohtmx/tests/fixtures/menu-alias-contracts',id],{encoding:'utf8',env});fragments.set(id,fragment);report.fixtures[id]=hash(fragment);
  }
  const assets=new Map();for(const path of ['/assets/ely-api.js','/assets/ely-api-interaction.js','/assets/ely-api-interaction-entry.js','/assets/htmx.min.js']) {const text=await readFile(new URL(`../../../../ui/gohtmx${path}`,import.meta.url),'utf8');assets.set(path,text);report.assets[path]=hash(text);}
  server=createServer(async(req,res)=>{try {
    const url=new URL(req.url,'http://localhost');
    if(url.pathname==='/')return res.setHeader('content-type','text/html').end(fixture);
    if(url.pathname==='/fragment'&&fragments.has(url.searchParams.get('id'))) {report.requests.push({method:req.method,path:url.pathname,id:url.searchParams.get('id')});return res.setHeader('content-type','text/html').end(fragments.get(url.searchParams.get('id')));}
    if(!/^\/assets\/[\w/.-]+$/.test(url.pathname)||url.pathname.includes('..'))return res.writeHead(404).end();
    res.setHeader('content-type',url.pathname.endsWith('.css')?'text/css':url.pathname.endsWith('.svg')?'image/svg+xml':'text/javascript');res.end(assets.get(url.pathname)||await readFile(new URL(`../../../../ui/gohtmx${url.pathname}`,import.meta.url)));
  }catch(error){res.writeHead(500).end(String(error));}});
  await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',resolve);});
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1200,height:900}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{window.aliasAllErrors=[];document.addEventListener('ely:error',e=>aliasAllErrors.push({id:e.detail?.id,action:e.detail?.action||null,message:e.detail?.error?.message||String(e.detail?.error)}));});
  const expectedCases=surfaces.flatMap(surface=>Object.entries({radio:'RadioMenuItem',overflow:'OverflowMenu','disabled-radio':'RadioMenuItem','disabled-overflow':'OverflowMenu','legacy-dropdown':'DropdownMenu','explicit-split':'OverflowMenu'}).map(([kind,name])=>({id:`${surface}-${kind}`,component:`menus/${name}`})));
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.waitForFunction(cases=>aliasAllErrors.length>0||cases.every(({id})=>['true','error'].includes(document.querySelector(`#case-${id} [data-ely-family="interaction"]`)?.dataset.elyReady)),expectedCases);
  assert.deepEqual(await page.evaluate(()=>aliasAllErrors),[],'alias startup must not emit a component error');
  assert.deepEqual(await page.evaluate(cases=>cases.map(({id})=>{const roots=document.querySelectorAll(`#case-${id} [data-ely-family="interaction"]`);return {id,count:roots.length,component:roots[0]?.dataset.elyComponent,ready:roots[0]?.dataset.elyReady};}),expectedCases),expectedCases.map(({id,component})=>({id,count:1,component,ready:'true'})),'all eighteen exact alias fixture roots must initialize');
  const expectedRejections=await Promise.all(surfaces.flatMap(surface=>['radio','overflow'].map(async kind=>({id:await page.locator(`#case-${surface}-${kind} [data-ely-family="interaction"]`).getAttribute('id'),action:kind==='radio'?'density':'open-file',message:'Alias host rejected'}))));
  await page.evaluate(async()=>{
    const {mount}=await import('/assets/ely-api.js');window.aliasLog={actions:[],changes:[],results:[],errors:[],order:[]};
    window.aliasSnapshot=root=>({open:!root.querySelector('[role="menu"]').hidden,selected:[...root.querySelectorAll('[aria-checked="true"]')].map(n=>n.value)});
    window.bindAlias=root=>mount(root,{
      onAction:detail=>{aliasLog.order.push('action');aliasLog.actions.push({component:detail.component,action:detail.action,value:detail.value,...aliasSnapshot(root)});if(window.failAlias)throw Error('Alias host rejected');return {saved:true};},
      onChange:detail=>{aliasLog.order.push('change');aliasLog.changes.push({...detail,...aliasSnapshot(root)});},
    });
    document.querySelectorAll('[data-ely-family="interaction"]').forEach(bindAlias);
    document.addEventListener('ely:result',e=>aliasLog.results.push({action:e.detail.action}));document.addEventListener('ely:error',e=>aliasLog.errors.push({action:e.detail.action,message:e.detail.error?.message}));
  });
  const check=async(name,fn)=>{await fn();report.checks.push(name);console.log(name);};
  const record=(requirement,surface,kind,details={})=>report.cells.push({requirement,surface,kind,status:'passed',...details});
  const root=id=>page.locator(`#case-${id} [data-ely-family="interaction"]`);
  const trigger=id=>root(id).locator('[data-interaction-menu]').first();
  const panel=id=>root(id).locator('[role="menu"]').first();
  const row=(id,value)=>root(id).locator(`[value="${value}"]`);
  const isClosed=async id=>panel(id).evaluate(n=>n.hidden);
  const focused=async locator=>assert.equal(await locator.evaluate(n=>document.activeElement===n),true,'expected control must own focus');
  const open=async id=>{await trigger(id).focus();await page.keyboard.press('ArrowDown');assert.equal(await isClosed(id),false);};
  const reset=()=>page.evaluate(()=>{for(const key of Object.keys(aliasLog))aliasLog[key]=[];});
  const logs=()=>page.evaluate(()=>aliasLog);
  await check('aliases.exact-go-and-sdui-default-accessibility',async()=>{
    for(const surface of surfaces) {
      const radio=`${surface}-radio`,overflow=`${surface}-overflow`;
      assert.equal(await row(radio,'compact').getAttribute('role'),'menuitemradio','RadioMenuItem without Radio must expose radio semantics');
      assert.equal(await row(radio,'compact').getAttribute('data-interaction-menu-radio'),'density');assert.equal(await row(radio,'compact').getAttribute('data-interaction-checkbox'),null);
      assert.equal(await root(overflow).locator('[data-interaction-menu-primary]').count(),0,'OverflowMenu without Host must not expose a primary action');
      assert.equal((await trigger(overflow).textContent()).trim(),'⋯');assert.equal(await trigger(overflow).getAttribute('aria-label'),`${surface} more commands`);
      assert.equal(await row(radio,'compact').locator('[data-interaction-menu-label]').textContent(),'Compact <safe>');
      for(const [id,name] of [[radio,'RadioMenuItem'],[overflow,'OverflowMenu']]) {
        assert.equal(await root(id).getAttribute('data-ely-component'),`menus/${name}`);assert.equal(await trigger(id).getAttribute('aria-controls'),await panel(id).getAttribute('id'));assert.equal(await trigger(id).getAttribute('aria-haspopup'),'menu');assert.equal(await trigger(id).getAttribute('aria-expanded'),'false');assert.equal(await panel(id).getAttribute('tabindex'),'-1');assert(await panel(id).getAttribute('aria-label'));record('defaults',surface,name==='RadioMenuItem'?'radio':'overflow');
      }
    }
  });
  await check('radio-alias.keyboard-selection-groups-repeat-and-callback-order',async()=>{
    for(const surface of surfaces) {
      const id=`${surface}-radio`;await open(id);await focused(row(id,'comfortable'));await page.keyboard.press('ArrowDown');await focused(row(id,'compact'));await reset();await page.keyboard.press('Enter');
      let log=await logs();assert.deepEqual(log.order,['change','action']);assert.deepEqual(log.actions,[{component:'menus/RadioMenuItem',action:'density',value:'compact',open:false,selected:['compact','dark']}]);
      assert.equal(log.changes.length,1);assert.equal(log.changes[0].name,'density');assert.equal(log.changes[0].value,'compact');assert.equal(log.changes[0].open,false);assert.equal(await row(id,'comfortable').getAttribute('aria-checked'),'false');assert.equal(await row(id,'compact').getAttribute('aria-checked'),'true');
      await open(id);await row(id,'compact').focus();await page.keyboard.press('Space');log=await logs();assert.equal(log.actions.length,2);assert.equal(log.changes.length,2);assert.equal(await row(id,'compact').getAttribute('aria-checked'),'true');
      for(const other of surfaces.filter(other=>other!==surface)) {const peer=`${other}-radio`;assert.equal(await row(peer,'dark').getAttribute('aria-checked'),'true');if(surface==='go')assert.equal(await row(peer,'comfortable').getAttribute('aria-checked'),'true');}
      record('radio-selection',surface,'radio',{actions:log.actions.length,changes:log.changes.length,order:log.order});
    }
  });
  await check('radio-alias.explicit-checkbox-and-nested-row-compatibility',async()=>{
    for(const surface of surfaces) {
      const id=`${surface}-radio`;assert.equal(await row(id,'check').getAttribute('role'),'menuitemcheckbox');await open(id);await reset();await row(id,'check').click();assert.equal(await row(id,'check').getAttribute('aria-checked'),'true');assert.equal((await logs()).changes[0].checked,true);
      assert.equal(await row(id,'parent').getAttribute('role'),'menuitem');assert.equal(await row(id,'child').getAttribute('role'),'menuitem');await open(id);await row(id,'parent').focus();await page.keyboard.press('ArrowRight');await focused(row(id,'child'));await reset();await page.keyboard.press('Enter');assert.equal((await logs()).changes.length,0);assert.equal((await logs()).actions[0].action,'child');assert.equal(await isClosed(id),true);record('radio-overrides',surface,'radio');
    }
  });
  await check('overflow-alias.native-action-and-explicit-split-legacy-defaults',async()=>{
    for(const surface of surfaces) {
      const id=`${surface}-overflow`;await trigger(id).click();await focused(row(id,'open'));await reset();await page.keyboard.press('Enter');assert.deepEqual((await logs()).actions,[{component:'menus/OverflowMenu',action:'open-file',value:'open',open:false,selected:[]}]);assert.equal((await logs()).changes.length,0);record('activation',surface,'overflow',{action:(await logs()).actions[0]});
      for(const kind of ['legacy-dropdown','explicit-split']) {const split=`${surface}-${kind}`;assert.equal(await root(split).locator('[data-interaction-menu-primary]').count(),1);await open(split);await reset();await root(split).locator('[data-interaction-menu-primary]').evaluate(n=>n.click());assert.equal((await logs()).actions[0].action,'publish');assert.equal((await logs()).actions[0].open,false);assert.equal((await logs()).actions.length,1);record('activation',surface,kind,{action:(await logs()).actions[0]});}
    }
  });
  await check('aliases.disabled-and-modified-input-are-inert-and-escape-restores',async()=>{
    for(const surface of surfaces)for(const kind of ['radio','overflow']) {
      const id=`${surface}-${kind}`,disabled=`${surface}-disabled-${kind}`;await reset();await trigger(disabled).dispatchEvent('click');await trigger(disabled).dispatchEvent('keydown',{key:'ArrowDown'});assert.equal(await isClosed(disabled),true);
      await root(disabled).locator('[data-ely-action]').first().dispatchEvent('click');await open(id);await row(id,'off').dispatchEvent('click');await row(id,kind==='radio'?'compact':'open').focus();await page.keyboard.press('Control+Enter');assert.equal((await logs()).actions.length,0);assert.equal((await logs()).changes.length,0);assert.equal(await isClosed(id),false);await page.keyboard.press('Escape');assert.equal(await isClosed(id),true);await focused(trigger(id));record('disabled-input',surface,kind);
    }
  });
  await check('aliases.rejection-emits-once-keeps-state-and-dismisses',async()=>{
    for(const surface of surfaces)for(const kind of ['radio','overflow']) {
      const id=`${surface}-${kind}`,value=kind==='radio'?'comfortable':'open',action=kind==='radio'?'density':'open-file';
      await open(id);await reset();await page.evaluate(()=>window.failAlias=true);
      await row(id,value).click();await page.waitForFunction(()=>aliasLog.errors.length===1);
      const log=await logs();assert.equal(log.actions.length,1,'rejected alias must invoke its caller exactly once');
      assert.equal(log.results.length,0);assert.deepEqual(log.errors,[{action,message:'Alias host rejected'}]);
      assert.deepEqual(log.order,kind==='radio'?['change','action']:['action']);assert.equal(log.changes.length,kind==='radio'?1:0);
      assert.equal(log.actions[0].action,action);assert.equal(log.actions[0].value,value);assert.equal(log.actions[0].open,false);
      assert.equal(await isClosed(id),true);assert.equal(await trigger(id).getAttribute('aria-expanded'),'false');await focused(trigger(id));
      if(kind==='radio') {assert.equal(await row(id,'comfortable').getAttribute('aria-checked'),'true');assert.equal(await row(id,'compact').getAttribute('aria-checked'),'false');}
      await page.evaluate(()=>window.failAlias=false);record('rejection',surface,kind,{actions:log.actions.length,changes:log.changes.length,results:log.results.length,errors:log.errors,order:log.order,closed:true,focusRestored:true});
    }
  });
  await check('aliases.real-htmx-inner-and-outer-replacement-dispose-and-remount',async()=>{
    for(const surface of surfaces)for(const kind of ['radio','overflow'])for(const style of ['innerHTML','outerHTML']) {
      const id=`${surface}-${kind}`,value=kind==='radio'?'compact':'open';await open(id);
      await root(id).evaluate((n,value)=>{window.oldAlias=n;window.oldAliasPanel=n.querySelector('[role="menu"]');window.oldAliasTrigger=n.querySelector('[data-interaction-menu]');window.oldAliasRow=n.querySelector(`[value="${value}"]`);window.oldAliasChecked=oldAliasRow.getAttribute('aria-checked');window.aliasCleanups=0;n.addEventListener('ely:cleanup',()=>window.aliasCleanups++,{once:true});},value);
      await page.evaluate(({id,style})=>{const target=window.oldAlias;return htmx.ajax('GET',`/fragment?id=${id}`,style==='innerHTML'?{source:'#before',target,select:`#${CSS.escape(target.id)} > *`}:{source:'#before',target,select:`#${CSS.escape(target.id)}`,swap:'outerHTML'});},{id,style});
      await page.waitForFunction(id=>document.querySelector(`#case-${id} [data-ely-family="interaction"]`)?.dataset.elyReady==='true',id);
      assert.equal(await page.evaluate(()=>oldAliasPanel.hidden),true,'alias replacement must close the removed open panel');assert.equal(await page.evaluate(()=>oldAliasTrigger.getAttribute('aria-expanded')),'false');assert.equal(await page.evaluate(()=>aliasCleanups),1);assert.equal(await root(id).evaluate(n=>n===oldAlias),style==='innerHTML');
      if(style==='outerHTML')await root(id).evaluate(n=>bindAlias(n));await reset();await page.evaluate(()=>{oldAliasTrigger.click();oldAliasRow.click();});assert.equal((await logs()).actions.length,0);assert.equal((await logs()).changes.length,0);assert.equal(await page.evaluate(()=>oldAliasRow.getAttribute('aria-checked')),await page.evaluate(()=>oldAliasChecked));
      if(kind==='radio') {assert.equal(await row(id,'comfortable').getAttribute('aria-checked'),'true');assert.equal(await row(id,'compact').getAttribute('role'),'menuitemradio');}else assert.equal(await root(id).locator('[data-interaction-menu-primary]').count(),0);
      await open(id);await row(id,value).focus();await page.keyboard.press('Enter');const log=await logs();assert.equal(log.actions.length,1,'replacement alias must emit exactly one action');assert.equal(log.changes.length,kind==='radio'?1:0);assert.equal(log.actions[0].open,false);if(kind==='radio')assert.equal(await row(id,'comfortable').getAttribute('aria-checked'),'false');record('replacement',surface,kind,{swap:style,actions:log.actions.length,changes:log.changes.length});
    }
    assert.equal(report.requests.length,12);assert(report.requests.every(r=>r.method==='GET'&&r.path==='/fragment'));
  });
  const expectedCells=surfaces.flatMap(surface=>[
    ...['radio','overflow'].map(kind=>`defaults/${surface}/${kind}/`),
    `radio-selection/${surface}/radio/`,`radio-overrides/${surface}/radio/`,
    ...['overflow','legacy-dropdown','explicit-split'].map(kind=>`activation/${surface}/${kind}/`),
    ...['disabled-input','rejection'].flatMap(requirement=>['radio','overflow'].map(kind=>`${requirement}/${surface}/${kind}/`)),
    ...['radio','overflow'].flatMap(kind=>['innerHTML','outerHTML'].map(swap=>`replacement/${surface}/${kind}/${swap}`)),
  ]);
  assert.deepEqual(report.cells.map(({requirement,surface,kind,swap=''})=>`${requirement}/${surface}/${kind}/${swap}`).sort(),expectedCells.sort(),'every declared alias/surface requirement cell must execute exactly once');
  assert.equal(report.checks.length,7,'all named alias requirements must execute');assert.deepEqual(await page.evaluate(()=>aliasAllErrors),expectedRejections,'only the six deliberately rejected alias callbacks may emit ely:error');assert.deepEqual(errors,[]);assert.equal(mutation,'','menu alias negative control unexpectedly survived');report.status='passed';
} catch(error) {
  report.error=error.stack;
  if(mutation&&error instanceof assert.AssertionError&&error.message.includes(mutations[mutation]?.oracle))report.status='mutation-killed';
  else {report.status='failed';throw error;}
} finally {
  await mkdir('test-results/contracts',{recursive:true});await writeFile(`test-results/contracts/menu-alias${mutation?'-'+mutation:''}.json`,JSON.stringify(report,null,2));await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));if(temp)await rm(temp,{recursive:true,force:true});
}
