import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {copyCases,copyCaseIDs,copyLimitations} from './copybutton-complete-cases.mjs';
import {copySchema,copyOracles} from './copybutton-complete-evidence.mjs';
import {loadCopyInputs,copySHA} from './copybutton-complete-inputs.mjs';
assert.equal(process.env.CI,'true','full browser execution is CI-only');
const base=fileURLToPath(new URL('../../../../',import.meta.url));
const output=join(base,'test-results/copybutton-complete');await mkdir(join(output,'screenshots'),{recursive:true});
const inputs=await loadCopyInputs(base), {assetBodies,fixtureBodies,...binding}=inputs;
const invocation=JSON.parse(await readFile(process.env.COPYBUTTON_INVOCATION_PATH,'utf8'));
assert.equal(process.env.COPYBUTTON_RUN_TOKEN,invocation.runToken);
for(const key of Object.keys(binding))assert.deepEqual(binding[key],invocation[key],'child current input '+key);
const report={schema:copySchema,runToken:invocation.runToken,...binding,caseInventory:copyCaseIDs,limitations:copyLimitations,browserVersion:'',checks:[],responses:[],errors:[],status:'failed',stage:'starting'};
let browser,server;
try {
  server=createServer((req,res)=>{
    const path=new URL(req.url,'http://localhost').pathname,asset=assetBodies.get(path),body=asset?.body||fixtureBodies.get(path),metadata=inputs.assets[path]||inputs.fixtures[path];
    if(!body){report.errors.push('Unknown request '+path);res.writeHead(404).end();return;}
    res.setHeader('content-type',metadata.contentType);res.setHeader('cache-control',path.startsWith('/assets/')?'public, max-age=3600':'no-store');res.end(body);
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const origin=`http://127.0.0.1:${server.address().port}`;
  browser=await chromium.launch({headless:true});report.browserVersion=browser.version();
  for(const spec of copyCases) {
    const context=await browser.newContext({viewport:{width:spec.zoom?320:1000,height:900},reducedMotion:spec.reducedMotion||'no-preference',colorScheme:spec.theme||'light'});
    if(spec.id==='real-clipboard')await context.grantPermissions(['clipboard-read','clipboard-write'],{origin});
    const page=await context.newPage(),raw={snapshots:[],log:[],errors:[],environment:{clock:spec.id==='real-clock'?'browser-real':'playwright-controlled',reducedMotion:spec.reducedMotion||'no-preference',theme:spec.theme||'light',zoom:spec.zoom||1,viewport:page.viewportSize()},aria:{},screenshots:{}};
    const check={id:spec.id,raw,oracles:[],status:'failed'},responses=[],seen=new Set();report.checks.push(check);
    page.on('pageerror',error=>raw.errors.push(String(error)));
    page.on('console',message=>{if(message.type()==='error'&&!(spec.id==='missing-icon'&&message.location().url===origin+'/assets/ely/icons/copy.svg'&&message.text()==='Failed to load resource: net::ERR_FAILED'))raw.errors.push('console: '+message.text());});
    page.on('requestfailed',request=>{if(spec.id==='missing-icon'&&request.url()===origin+'/assets/ely/icons/copy.svg')responses.push(page.evaluate(error=>copyProbe.record('operation',{name:'icon-request-failed',path:'/assets/ely/icons/copy.svg',error}),request.failure()?.errorText).catch(error=>raw.errors.push(error.message)));else raw.errors.push('request: '+request.url()+' '+request.failure()?.errorText);});
    page.on('response',response=>{responses.push((async()=>{
      const path=new URL(response.url()).pathname;if(seen.has(path))return;seen.add(path);
      const body=await response.body(),request=response.request();
      report.responses.push({caseID:spec.id,path,status:response.status(),bytes:body.length,sha256:copySHA(body),method:request.method(),htmx:request.headers()['hx-request']||null});
    })().catch(error=>raw.errors.push('response: '+error.message)));});
    const evaluate=fn=>page.evaluate(fn),mode=value=>page.evaluate(value=>copyProbe.setMode(value),value);
    const flush=()=>page.evaluate(()=>Promise.resolve());
    const tick=async ms=>{if(spec.id==='real-clock')await page.waitForTimeout(ms);else await page.clock.runFor(ms);await flush();};
    const selector=(key='a',index=0)=>key==='adapter'?'#copy-adapter [data-interaction-copy]':key==='adapter-disabled'?'#copy-adapter-disabled [data-interaction-copy]':`#copy-${key} [data-interaction-copy] >> nth=${index}`;
    const click=async(key='a',index=0,options={})=>{
      const locator=page.locator(key.startsWith('#')?key:selector(key,index));await locator.evaluate(n=>n.scrollIntoView({block:'center'}));const box=await locator.boundingBox();assert(box,'physical pointer target');
      await page.mouse.click(box.x+box.width/2,box.y+box.height/2,options);await flush();
    };
    const key=async value=>{await page.keyboard.press(value);await flush();};
    const focus=async(key='a',index=0)=>{await page.locator(selector(key,index)).focus();};
    const settle=async(index=0,outcome='resolve')=>{await page.evaluate(({index,outcome})=>copyProbe.settle(index,outcome),{index,outcome});await flush();};
    const fontsReady=async()=>{let deadline;try{const status=await Promise.race([page.evaluate(async()=>{document.body.getBoundingClientRect();await document.fonts.ready;return document.fonts.status;}),new Promise((_,reject)=>{deadline=setTimeout(()=>reject(new Error('Same-case font readiness deadline exceeded')),5000);})]);assert.equal(status,'loaded');await page.evaluate(status=>copyProbe.record('operation',{name:'fonts-ready',status}),status);}finally{clearTimeout(deadline);}};
    const snap=async name=>{
      await fontsReady();
      raw.snapshots.push(await page.evaluate(name=>copyProbe.capture(name),name));
      const ariaKey=spec.id==='empty-value'?'empty':spec.id==='explicit-override'?'override':spec.id==='adapter'?'adapter':'a';raw.aria[name]=await page.locator(selector(ariaKey)).ariaSnapshot();
      const path=`screenshots/${spec.id}-${name}.png`,bytes=await page.screenshot({animations:'allow',caret:'initial',timeout:10000});await writeFile(join(output,path),bytes);
      raw.screenshots[name]={path,sha256:copySHA(bytes),bytes:bytes.length};
    };
    const remount=()=>page.evaluate(async()=>{
      const root=document.querySelector('#copy-a'),parent=root.parentNode,next=root.nextSibling;root.remove();await Promise.resolve();await Promise.resolve();parent.insertBefore(root,next);const api=await import('/assets/ely-api.js');api.mount(root);copyProbe.record('operation',{name:'remount',token:copyProbe.token(root),connected:root.isConnected});
    });
    const rebind=()=>page.evaluate(async()=>{
      const root=document.querySelector('#copy-a'),api=await import('/assets/ely-api.js'),before=copyProbe.token(root);api.mount(root,{onAction:d=>copyProbe.record('host',{name:'new-action',value:d.value}),onChange:d=>copyProbe.record('host',{name:'new-change',value:d.value})});copyProbe.record('operation',{name:'rebind',before,after:copyProbe.token(root),connected:root.isConnected});
    });
    try {
      if(spec.id==='missing-icon')await page.route('**/assets/ely/icons/copy.svg',async route=>{await page.evaluate(()=>copyProbe.record('operation',{name:'icon-route-abort',path:'/assets/ely/icons/copy.svg'}));await route.abort('failed');});
      if(spec.id!=='real-clock') {await page.clock.install({time:new Date('2026-10-19T00:00:00Z')});await page.clock.pauseAt(new Date('2026-10-19T00:00:01Z'));}
      await page.goto(origin,{waitUntil:'networkidle'});await page.waitForFunction(()=>document.querySelector('#copy-a')?.dataset.elyReady==='true',null,{polling:50});
      await page.evaluate(({theme,zoom})=>{document.documentElement.classList.toggle('dark',theme==='dark');document.documentElement.dataset.theme=theme;if(zoom){document.querySelector('main').style.zoom=String(zoom);document.querySelector('main').style.width='128px';}},spec);
      if(spec.id==='real-clipboard')await mode('real');
      await snap('idle');
      if(spec.id.startsWith('appearance-')) {
        const b=page.locator(selector());await b.hover();await tick(450);await snap('hover');
        const box=await b.boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await snap('pressed');await page.mouse.move(1,1);await page.mouse.up();
        await page.locator('#before-copy').focus();await key('Tab');await tick(450);await snap('focus');await key('Enter');await snap('copied');await tick(1400);await snap('reset');
      } else if(spec.id.startsWith('activation-')) {
        if(spec.input==='pointer')await click();else {await focus();await key(spec.input==='enter'?'Enter':'Space');}await snap('copied');await tick(1400);await snap('reset');
      } else if(spec.id==='cancelled-pointer') {
        const box=await page.locator(selector()).boundingBox();await page.mouse.move(box.x+box.width/2,box.y+box.height/2);await page.mouse.down();await page.mouse.move(1,1);await page.mouse.up();await snap('cancelled');await click('a',0,{button:'right'});await snap('right-click');
      } else if(['exact-timing','repeat-lockout'].includes(spec.id)) {
        await mode('pending');await click();await snap('pending');
        if(spec.id==='exact-timing'){await tick(2000);await snap('delayed');}
        else {await click();await focus();await key('Enter');await key('Space');await snap('repeated-pending');}
        await settle();await snap('copied');
        // CSS animations use the real rendering timeline, independent of page.clock.
        if(spec.id==='exact-timing')await new Promise(resolve=>setTimeout(resolve,150));
        if(spec.id==='repeat-lockout'){await click();await focus();await key('Enter');await key('Space');await snap('repeated-copied');}
        await tick(1399);await snap('before-deadline');await tick(1);await snap('deadline');await mode('success');await click();await new Promise(resolve=>setTimeout(resolve,150));await snap('replayed');
      } else if(spec.id==='reduced-motion') {
        await click();await snap('copied');await tick(1399);await snap('before-deadline');await tick(1);await snap('deadline');
      } else if(spec.id.startsWith('failure-')) {
        await mode(spec.failure);await click();await snap('failed');await mode('success');await click();await snap('retry');
      } else if(spec.id==='empty-value') {await click('empty');await snap('copied');}
      else if(spec.id==='captured-payload') {
        await mode('pending');await click();await snap('pending');await page.evaluate(()=>{const b=document.querySelector('#copy-a-control'),beforeValue=b.value,beforeAction=b.dataset.elyAction;b.value='changed';b.dataset.elyAction='changed-action';copyProbe.record('operation',{name:'change-payload',beforeValue,beforeAction,afterValue:b.value,afterAction:b.dataset.elyAction});});await settle();await snap('copied');
      } else if(spec.id==='cancelled-action') {
        await page.evaluate(()=>document.querySelector('#copy-a').addEventListener('ely:action',e=>{e.preventDefault();copyProbe.record('operation',{name:'cancel-action',defaultPrevented:e.defaultPrevented});},{once:true}));await click();await snap('copied');
      } else if(spec.id==='host-error') {
        await page.evaluate(async()=>{const api=await import('/assets/ely-api.js');api.mount(document.querySelector('#copy-a'),{onAction(){copyProbe.record('host',{name:'throw'});throw new Error('Intentional host callback error');}});});await click();await snap('copied');
      } else if(spec.id==='disabled') {
        await click('disabled');await click('items',2);await page.locator(selector('disabled')).dispatchEvent('click');await page.locator(selector('items',2)).dispatchEvent('click');await snap('attempted');await tick(1400);await snap('reset');
      } else if(spec.id.endsWith('-independent')) {
        const items=spec.id==='items-independent';await mode('pending');await click(items?'items':'a',0);await click(items?'items':'b',items?1:0);await snap('pending');await settle(1);await snap('b-first');await tick(200);await settle(0);await snap('a-second');await tick(1200);await snap('b-reset');await tick(200);await snap('a-reset');
      } else if(spec.id.startsWith('callback-')) {
        await page.evaluate(async operation=>{const api=await import('/assets/ely-api.js'),root=document.querySelector('#copy-a');api.mount(root,{onAction(){copyProbe.record('host',{name:operation});if(operation==='rebind')api.mount(root,{onChange:d=>copyProbe.record('host',{name:'new-change',value:d.value})});else {const parent=root.parentNode,next=root.nextSibling;root.remove();queueMicrotask(()=>{parent.insertBefore(root,next);api.mount(root);});}}});},spec.operation);
        await click();await flush();await snap('returned');await tick(1400);await snap('deadline');
      } else if(spec.id==='pending-rebind') {
        await page.evaluate(async()=>{const api=await import('/assets/ely-api.js');api.mount(document.querySelector('#copy-a'),{onAction:()=>copyProbe.record('host',{name:'old-action'})});});await mode('pending');await click();await snap('pending');await rebind();await snap('rebound');await settle();await snap('settled');await tick(1400);await mode('success');await click();await snap('fresh');
      } else if(spec.id.startsWith('child-')) {
        await mode('pending');await click();await snap('pending');await page.evaluate(operation=>{const old=document.querySelector('#copy-a-control'),beforeParent=copyProbe.token(old.parentNode),clone=old.cloneNode(true);clone.removeAttribute('aria-busy');delete clone.dataset.interactionCopied;old.replaceWith(clone);let afterParent=null;if(operation==='moved'){document.querySelector('#copy-b .ely-interaction__copy-specimens').append(old);afterParent=copyProbe.token(old.parentNode);}copyProbe.record('operation',{name:operation,oldControl:copyProbe.token(old),newControl:copyProbe.token(clone),beforeParent,afterParent,connected:old.isConnected});},spec.operation);
        await snap('changed');await settle();await snap('settled');await tick(1400);await mode('success');await click(spec.operation==='moved'?'b':'a',spec.operation==='moved'?1:0);await snap('fresh');
      } else if(spec.id.startsWith('htmx-')) {
        await mode(spec.phase==='pending'?'pending':'success');await click();await snap('active');
        const response=page.waitForResponse(response=>new URL(response.url()).pathname==='/fragment/'+spec.swap);await click('#replace-'+spec.swap);await response;await tick(100);
        await page.waitForFunction(()=>document.querySelector('#copy-a')?.dataset.elyReady==='true',null,{polling:50});await snap('swapped');
        if(spec.phase==='pending')await settle(0,spec.reject?'reject':'resolve');else await tick(1400);await snap('settled');await mode('success');await click();await snap('fresh');
      } else if(spec.id==='moved-copied') {
        await click();await snap('old-copied');await tick(200);await page.evaluate(()=>{const old=document.querySelector('#copy-a-control'),beforeParent=copyProbe.token(old.parentNode),clone=old.cloneNode(true);delete clone.dataset.interactionCopied;old.replaceWith(clone);document.querySelector('#copy-b .ely-interaction__copy-specimens').append(old);copyProbe.record('operation',{name:'move-copied',control:copyProbe.token(old),beforeParent,afterParent:copyProbe.token(old.parentNode),connected:old.isConnected});});await snap('moved');await click('b',1);await snap('fresh');await tick(1200);await snap('old-deadline');await tick(200);await snap('new-deadline');
      } else if(spec.id==='same-node-remount') {
        await mode('pending');await click();await snap('pending');await remount();await snap('remounted');await settle();await snap('settled');await mode('success');await click();await snap('fresh');await tick(1400);await snap('reset');
      } else if(spec.id==='repeat-initialization') {
        await click();await snap('copied');await tick(200);await page.evaluate(()=>{const root=document.querySelector('#copy-a');document.dispatchEvent(new CustomEvent('htmx:after:swap'));document.dispatchEvent(new CustomEvent('htmx:after:swap'));copyProbe.record('operation',{name:'repeat-start',root:copyProbe.token(root)});});await snap('reinitialized');await tick(1200);await snap('deadline');
      } else if(spec.id==='tab-order') {
        await page.locator('#before-copy').focus();await key('Tab');await snap('tab');await key('Tab');await key('Shift+Tab');await snap('shift-tab');await key('Space');await snap('copied');await tick(1400);await snap('reset');
      } else if(spec.id==='explicit-override') {await click('override');await snap('copied');}
      else if(spec.id==='real-clipboard') {await click();for(let i=0;i<250&&!(await page.evaluate(()=>copyProbe.log.some(r=>r.type==='clipboard-settle')));i++)await new Promise(resolve=>setTimeout(resolve,20));await snap('copied');const text=await page.evaluate(()=>navigator.clipboard.readText());await page.evaluate(text=>copyProbe.record('operation',{name:'real-read',value:text,secure:window.isSecureContext}),text);await snap('read');}
      else if(spec.id==='real-clock') {await click();await snap('copied');let elapsed=await page.evaluate(t=>performance.now()-t,raw.snapshots.at(-1).time);await tick(Math.max(0,1000-elapsed));await snap('before-deadline');elapsed=await page.evaluate(t=>performance.now()-t,raw.snapshots.find(s=>s.name==='copied').time);await tick(Math.max(0,1600-elapsed));await snap('reset');}
      else if(spec.id==='missing-icon') {await click();await snap('copied');}
      else if(spec.id==='adapter') {await click('adapter');await snap('copied');await click('adapter-disabled');await page.locator(selector('adapter-disabled')).dispatchEvent('click');await snap('disabled');}
      else if(spec.id==='narrow-zoom') {await click();await snap('copied');await tick(1400);await snap('reset');}
      else throw new Error('No implementation for source-owned case '+spec.id);
      await Promise.all(responses);raw.log=await page.evaluate(()=>copyProbe.log);

    } catch(error) {raw.errors.push(error.stack);try{raw.log=await page.evaluate(()=>copyProbe.log);}catch{} report.errors.push(spec.id+': '+error.message);}
    finally {try{if(!page.isClosed())await fontsReady();}catch(error){raw.errors.push(error.message);report.errors.push(spec.id+': '+error.message);}await Promise.all(responses);try{raw.log=await page.evaluate(()=>copyProbe.log);if(raw.snapshots.length===spec.checkpoints.length){check.oracles=copyOracles(check);check.status=check.oracles.every(o=>o.pass)?'passed':'failed';console.log(JSON.stringify({copybuttonCase:spec.id,status:check.status,failed:check.oracles.filter(o=>!o.pass).map(o=>o.id)}));}}catch(error){raw.errors.push(error.message);report.errors.push(spec.id+': '+error.message);}await context.close();}
  }
  report.stage='complete';report.status=report.errors.length===0&&report.checks.every(c=>c.status==='passed')?'passed':'failed';
} catch(error) {report.errors.push(error.stack);} finally {
  await browser?.close();if(server?.listening)await new Promise(resolve=>server.close(resolve));
  const bytes=JSON.stringify(report,null,2);await writeFile(join(output,'report.json'),bytes);
  console.log(JSON.stringify({copybuttonCompletion:1,runToken:report.runToken,reportSHA256:copySHA(bytes),status:report.status}));
  process.exitCode=report.status==='passed'?0:1;
}
