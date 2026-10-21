import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, readFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

// Focused regression for the shared TaskItem check and its TaskList alias.
// Builds a real export, but visits and executes only these two component cases.
const repo=fileURLToPath(new URL('../../../../',import.meta.url));
const temp=await mkdtemp(resolve(tmpdir(),'elysdui-task-selection-'));
const names=['project/TaskItem','project/TaskList'];
const env={...process.env,GOTOOLCHAIN:'go1.26.9'};
let child,server,browser,serverOutput='';
const listen=async server=>{await new Promise((ok,fail)=>{server.once('error',fail);server.listen(0,'127.0.0.1',ok);});return server.address().port;};
const close=server=>new Promise((ok,fail)=>server.close(error=>error?fail(error):ok()));
try{
  const binary=resolve(temp,'gallery'),exportDir=resolve(temp,'static');
  console.log('Task selection: build live gallery and static export with Go 1.26.9');
  execFileSync('go',['build','-o',binary,'./examples/gohtmx/gallery'],{cwd:repo,env,stdio:'inherit'});
  execFileSync('go',['run','./cmd/ely-gallery-static','-dir',exportDir,'-base','/elysdui/go-htmx/'],{cwd:repo,env,stdio:'inherit'});
  const reservation=createServer(),port=await listen(reservation);await close(reservation);
  child=spawn(binary,['-addr',`127.0.0.1:${port}`],{cwd:repo,stdio:['ignore','pipe','pipe']});
  child.stdout.on('data',chunk=>serverOutput+=chunk);child.stderr.on('data',chunk=>serverOutput+=chunk);
  let startupError;child.on('error',error=>startupError=error);
  const live=`http://127.0.0.1:${port}`;
  for(let attempt=0;;attempt++){
    if(startupError)throw startupError;
    if(child.exitCode!==null)throw new Error(serverOutput);
    try{if((await fetch(live+'/components')).ok)break;}catch{}
    assert(attempt<200,'live gallery startup timed out');await delay(30);
  }
  const base='/elysdui/go-htmx/';
  server=createServer(async(request,response)=>{
    try{
      let path=new URL(request.url,'http://local').pathname;
      if(path==='/favicon.ico'){response.writeHead(204).end();return;}
      if(!path.startsWith(base)){response.writeHead(404).end();return;}
      path=decodeURIComponent(path.slice(base.length));if(path.endsWith('/'))path+='index.html';
      const file=resolve(exportDir,path);if(!file.startsWith(exportDir+sep)){response.writeHead(403).end();return;}
      const mime={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.woff2':'font/woff2'};
      response.setHeader('Content-Type',mime[extname(file)]||'application/octet-stream');response.end(await readFile(file));
    }catch{response.writeHead(404).end();}
  });
  const staticOrigin=`http://127.0.0.1:${await listen(server)}`;
  browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  for(const mode of ['live','static']){
    const origin=mode==='live'?live:staticOrigin,prefix=mode==='live'?'/':base;
    const context=await browser.newContext(),page=await context.newPage(),errors=[];
    page.on('pageerror',error=>errors.push(String(error)));
    page.on('response',response=>{if(response.status()>=400)errors.push(`${response.status()} ${response.url()}`);});
    const open=async name=>{
      const alias=name.endsWith('/TaskList');
      await page.goto(origin+(mode==='live'?`/components/audit?family=communication${alias?'&aliases=1':''}`:`${base}components/audit/communication/${alias?'aliases/':''}`));
      const record=page.locator(`[data-audit-name="${name}"]`);
      assert.equal(await record.count(),1,`${mode} ${name} inventory`);
      assert.equal(await record.getAttribute('data-audit-key'),'project/TaskItem','alias must execute the shared check');
      await record.locator('[data-audit-main] > [data-ely-ready="true"]').waitFor();
      return record;
    };
    const run=()=>page.evaluate(async prefix=>{
      const {executeRegisteredCheck}=await import(prefix+'assets/advanced-checks.js');
      const root=document.querySelector('[data-task-check-root]'),actions=[];
      const capture=event=>{if(event.target===root)actions.push(event.detail);};
      root.addEventListener('ely:action',capture);
      try{return await executeRegisteredCheck('project/TaskItem',{root,actions});}
      finally{root.removeEventListener('ely:action',capture);}
    },prefix);
    for(const name of names){
      let record=await open(name);
      await record.locator('[data-audit-main] > [data-ely-family]').evaluate(root=>root.setAttribute('data-task-check-root',''));
      assert((await run()).assertions>0);
      // Prove the repaired check rejects missing selection, focus and host data.
      for(const mutation of ['pressed','focus','payload']){
        record=await open(name);
        await record.locator('[data-audit-main] > [data-ely-family]').evaluate((root,mutation)=>{
          root.setAttribute('data-task-check-root','');
          const next=root.querySelectorAll('[data-project-task-select]')[1];
          if(mutation==='pressed')next.setAttribute=()=>{};
          if(mutation==='focus')next.focus=()=>{};
          if(mutation==='payload')root.addEventListener('ely:action',event=>{if(event.detail.action==='open-task')event.detail.value='wrong-task';});
        },mutation);
        await assert.rejects(run,mutation==='payload'?/task Enter did not open caller key exactly once/:/task arrow selection failed/);
      }
      record=await open(name);
      const root=record.locator('[data-audit-main] > [data-ely-family]');
      const twin=record.locator('[data-audit-twin] > [data-ely-family]');
      const twinBefore=await twin.innerHTML();
      const rows=root.locator('[data-project-row]'),buttons=root.locator('button[data-project-task-select]'),box=rows.first().locator('input[type=checkbox]');
      assert.equal(await rows.count(),6);
      assert.equal(await root.locator('[data-project-row][aria-selected], [data-project-row][tabindex]').count(),0);
      await root.evaluate(root=>{window.taskActions=[];root.addEventListener('ely:action',event=>window.taskActions.push(event.detail));});
      const expectSelection=async index=>{
        assert.deepEqual(await buttons.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),Array.from({length:6},(_,i)=>String(i===index)));
        assert.equal(await buttons.nth(index).evaluate(node=>document.activeElement===node),true);
      };
      await box.focus();await page.keyboard.press('Space');assert.equal(await box.isChecked(),true);
      assert.deepEqual(await buttons.evaluateAll(nodes=>nodes.map(node=>node.getAttribute('aria-pressed'))),Array(6).fill('false'));
      await page.keyboard.press('Tab');assert.equal(await buttons.first().evaluate(node=>document.activeElement===node),true);
      await page.keyboard.press('ArrowDown');await expectSelection(1);
      await page.keyboard.press('ArrowUp');await expectSelection(0);
      await page.keyboard.press('ArrowDown');await page.keyboard.press('Enter');await expectSelection(1);
      const taskId=await rows.nth(1).getAttribute('data-task-id'),id=await root.getAttribute('id');
      const actions=await page.evaluate(()=>window.taskActions);
      assert.equal(actions.length,2,'checkbox and Enter must each emit once; arrows must not emit');
      assert.equal(actions[0].action,'toggle-task');assert.equal(actions[0].taskId,await box.inputValue());assert.equal(actions[0].done,true);
      assert.equal(actions[1].action,'open-task');assert.equal(actions[1].value,taskId);
      for(const action of actions){assert.equal(action.id,id);assert.equal(action.component,name);}
      await buttons.first().focus();await page.keyboard.press('Space');await expectSelection(0);
      assert.equal((await page.evaluate(()=>window.taskActions)).length,2,'Space selects without opening');
      assert.equal(await box.isChecked(),true);assert.equal(await twin.innerHTML(),twinBefore,'twin must remain unchanged');
      console.log(`${mode} ${name}: shared check, 3 negative controls, native Tab/Space/ArrowDown/ArrowUp/Enter, exact host payloads and twin isolation passed`);
    }
    assert.deepEqual(errors,[]);await context.close();
  }
}finally{
  await browser?.close();
  if(child&&child.exitCode===null){const exited=new Promise(ok=>child.once('exit',ok));child.kill('SIGTERM');await exited;}
  if(server?.listening)await close(server);
  await rm(temp,{recursive:true,force:true});
  console.log('Task selection cleanup: browser, owned servers, binary and static export removed');
}
