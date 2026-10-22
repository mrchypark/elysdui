import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm,access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const phase=process.env.WORKSPACE_REPAIR_PHASE||'after';
assert(['before','after'].includes(phase));
const control=process.env.WORKSPACE_REPAIR_CONTROL||'original-head';
assert(['original-head','current-prior-css'].includes(control));
const profile=process.env.WORKSPACE_REPAIR_PROFILE||'desktop-light';
assert(['desktop-light','desktop-dark','mobile-light','mobile-dark'].includes(profile));
const colorScheme=profile.endsWith('dark')?'dark':'light',viewport=profile.startsWith('mobile')?{width:390,height:844}:{width:1440,height:1000};
const repo=process.cwd(),env={...process.env,GOTOOLCHAIN:'go1.26.9'};
const outputRoot=resolve(process.env.WORKSPACE_REPAIR_OUTPUT||'test-results/workspace-communication-recovery');await mkdir(outputRoot,{recursive:true});
const output=await mkdtemp(join(outputRoot,phase+'-'+profile+'-')),temp=await mkdtemp(join(tmpdir(),'ely-workspace-repair-'));
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const groups={
  popup:['editor/CompletionMenu','editor/SignatureHelp','editor/HoverInfo','editor/CodeActionMenu','editor/RenameInput','editor/PeekView','editor/ReferencesPanel','editor/SymbolOutline','editor/GoToSymbol','editor/CallHierarchy','editor/TypeHierarchy'],
  print:['documents/PrintPreview'],comments:['collab/CommentThread','collab/Reply','collab/Reactions','collab/ReactionPicker','collab/CommentSidebar'],
  meter:['devtools/ContainerList','devtools/PodList','devtools/ResourceMonitor'],images:['chat/ImageGrid'],mail:['mail/MailThreadView'],month:['calendar/CalendarMonthView'],
  graph:['git/CommitGraph','git/CommitList','git/CommitItem','documents/Backlinks','documents/GraphView'],network:['debug/NetworkInspector'],
  metadata:['chat/FileMessage','chat/AudioMessage','chat/LinkPreviewCard','chat/SuggestionChips','agent/ToolCallGroup','agent/ToolRegistry Panel','agent/MemoryPanel','agent/CheckpointList','agent/Rewind'],hue:['project/LabelManager']
};
const sourcePaths=['ui/gohtmx/assets/ely-api-workspace.css','ui/gohtmx/assets/ely-api-communication.css','ui/gohtmx/assets/ely-api-calendar-parity.css','ui/gohtmx/assets/ely-api-foundation.css','ui/gohtmx/assets/ely-controls.css','ui/gohtmx/templates/ely-api-workspace.html','ui/gohtmx/templates/ely-api-communication.html','internal/gallery/advanced_communication_fixtures.go','ui/gohtmx/tests/browser/workspace-communication-repair-browser-test.mjs'];
const report={phase,control,profile,viewport,colorScheme,node:process.version,nodeExecutable:process.execPath,checks:[],actions:[],console:[],invalidDateInputs:[],sourceHashes:{},cleanup:false};let child,browser;
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:repo,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
async function stop(){if(!child)return;const owned=child;report.serverPID=owned.pid;if(owned.exitCode===null&&owned.signalCode===null){const done=new Promise(r=>owned.once('exit',r));owned.kill('SIGTERM');const timer=setTimeout(()=>owned.kill('SIGKILL'),5000);try{await done;}finally{clearTimeout(timer);}}report.serverStopped=owned.exitCode!==null||owned.signalCode!==null;}
try{
  report.revision=run('git',['rev-parse','HEAD']);report.go=run('go',['version']);report.dirtyStatus=run('git',['status','--short']);
  for(const path of sourcePaths)report.sourceHashes[path]=digest(await readFile(path));
  const build=['build'];report.buildSourceHashes={...report.sourceHashes};
  if(phase==='before'&&control==='original-head'){
    const Replace={};
    for(const [index,path] of ['ui/gohtmx/assets/ely-api-workspace.css','ui/gohtmx/assets/ely-api-communication.css','ui/gohtmx/assets/ely-api-calendar-parity.css','internal/gallery/advanced_communication_fixtures.go'].entries()){
      const bytes=run('git',['show',`${report.revision}:${path}`]);const backing=join(temp,`baseline-${index}${path.endsWith('.go')?'.go':'.css'}`);
      await writeFile(backing,bytes);Replace[resolve(path)]=backing;report.buildSourceHashes[path]=digest(bytes);
    }
    const overlay=join(temp,'overlay.json');await writeFile(overlay,JSON.stringify({Replace}));build.push('-overlay',overlay);
  }
  run('go',[...build,'-o',join(temp,'gallery'),'./examples/gohtmx/gallery']);
  const reserve=createServer();await new Promise(r=>reserve.listen(0,'127.0.0.1',r));const port=reserve.address().port;await new Promise(r=>reserve.close(r));
  const base=`http://127.0.0.1:${port}`;child=spawn(join(temp,'gallery'),['-addr',`127.0.0.1:${port}`],{stdio:'ignore'});
  let ready=false;for(let i=0;i<200;i++){try{if((await fetch(base+'/components')).ok){ready=true;break;}}catch{}await new Promise(r=>setTimeout(r,50));}assert(ready,'owned gallery startup');
  browser=await chromium.launch({headless:true,...(process.env.WORKSPACE_CLASSIC_SCROLLBAR==='1'?{ignoreDefaultArgs:['--hide-scrollbars']}:{}),...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport,colorScheme,timezoneId:'UTC'});page.setDefaultTimeout(10000);
  await page.addInitScript(mode=>{localStorage.setItem('ely-palette','ely');localStorage.setItem('ely-theme',mode);},colorScheme);
  page.on('console',m=>{if(['error','warning'].includes(m.type()))report.console.push({type:m.type(),text:m.text()});});page.on('pageerror',e=>report.console.push({type:'pageerror',text:e.message}));
  for(const family of ['workspace','communication']){
    await page.goto(`${base}/components/audit?family=${family}&aliases=1`);await page.waitForTimeout(200);
    if(process.env.WORKSPACE_CLASSIC_SCROLLBAR==='1')await page.evaluate(()=>{const sheet=new CSSStyleSheet();sheet.replaceSync('::-webkit-scrollbar{width:15px;height:15px}');document.adoptedStyleSheets=[...document.adoptedStyleSheets,sheet];});
    const theme=await page.evaluate(mode=>{window.ElyTheme.apply('ely',mode);return window.ElyTheme.current();},colorScheme);assert.deepEqual(theme,{id:'ely',mode:colorScheme});
    await page.evaluate(()=>document.fonts.ready);
    await page.locator('img').evaluateAll(nodes=>Promise.all(nodes.map(async node=>{node.loading='eager';try{await node.decode();}catch{}})));
    report.invalidDateInputs.push(...await page.locator('input[type=date],input[type=datetime-local]').evaluateAll(nodes=>nodes.filter(n=>n.getAttribute('value')&&!n.value).map(n=>({component:n.closest('[data-audit-name]')?.dataset.auditName,name:n.name,raw:n.getAttribute('value'),type:n.type}))));
    for(const [kind,names] of Object.entries(groups))for(const name of names){
      if((family==='workspace')!==['popup','print','comments','meter','graph','network'].includes(kind))continue;
      const card=page.locator(`[data-audit-name="${name}"]`);assert.equal(await card.count(),1,name);
      const result=await card.locator('[data-audit-main]').evaluate((root,kind)=>{
        const rect=n=>{const b=n.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,right:b.right,bottom:b.bottom};};
        const style=n=>{const s=getComputedStyle(n);return {display:s.display,position:s.position,width:s.width,minWidth:s.minWidth,gridTemplateColumns:s.gridTemplateColumns,boxSizing:s.boxSizing,top:s.top,marginTop:s.marginTop,paddingTop:s.paddingTop};};
        const fits=(a,b)=>a.x>=b.x-1&&a.right<=b.right+1;
        let ok=false,metrics;
        if(kind==='popup'){const menu=root.querySelector('[data-ws-completion-popup],[data-ws-code-action-menu]'),shell=menu.closest('.ely-workspace__code-shell');metrics={menu:rect(menu),shell:rect(shell),style:style(menu)};ok=fits(metrics.menu,metrics.shell);}
        if(kind==='print'){
          const p=root.querySelector('[data-ws-print-page]:not([hidden])'),pre=p.querySelector('pre'),sheet=p.closest('[data-ws-print-sheet]'),pages=sheet.parentElement,s=getComputedStyle(pages),bounds=rect(pages);
          const left=bounds.x+parseFloat(s.borderLeftWidth)+parseFloat(s.paddingLeft),right=bounds.right-parseFloat(s.borderRightWidth)-parseFloat(s.paddingRight),available=right-left;
          const paperFits=()=>{const paper=rect(p),track=rect(sheet);return available>0&&Math.abs(track.x-left)<=1&&Math.abs(track.right-right)<=1&&paper.width>=Math.min(240,available)-1&&fits(paper,track)&&pre.scrollWidth<=pre.clientWidth+1;};
          metrics={page:rect(p),pre:rect(pre),sheet:rect(sheet),parent:bounds,available,textWidth:pre.scrollWidth,clientWidth:pre.clientWidth,innerWidth,rootWidth:document.documentElement.getBoundingClientRect().width};ok=paperFits();
          const before=p.getAttribute('style');p.style.width='100px';metrics.narrowPaper={page:rect(p),parent:rect(pages)};metrics.rejectsNarrowPaper=!paperFits()&&Math.abs(metrics.narrowPaper.page.width-100)<=1&&Math.abs(metrics.narrowPaper.parent.width-bounds.width)<=1;if(before===null)p.removeAttribute('style');else p.setAttribute('style',before);
          ok=ok&&metrics.rejectsNarrowPaper;
        }
        if(kind==='comments'){const forms=[...root.querySelectorAll('[data-ws-thread-reply]')].filter(n=>n.getClientRects().length);metrics=forms.map(form=>{const input=form.elements.reply,button=form.querySelector('[type=submit]'),range=document.createRange();range.selectNodeContents(button);return {capture:rect(root),thread:rect(form.closest('[data-ws-threads]')),input:rect(input),button:rect(button),text:rect(range),style:style(form),label:style(input.closest('label'))};});ok=metrics.length>0&&metrics.every(m=>m.input.width>100&&m.button.width>=m.text.width&&fits(m.text,m.button)&&fits(m.button,m.capture)&&fits(m.thread,m.capture));}
        if(kind==='meter'){metrics=[...root.querySelectorAll('[data-dt-reading]')].filter(n=>n.querySelector('meter')).map(n=>({card:rect(n),meter:rect(n.querySelector('meter'))}));ok=metrics.length===3&&metrics.every(m=>fits(m.meter,m.card));}
        if(kind==='images'){metrics=[...root.querySelectorAll('img')].map(n=>({src:n.getAttribute('src'),loaded:n.complete&&n.naturalWidth>0}));ok=metrics.length===2&&metrics.every(m=>m.loaded);}
        if(kind==='mail'){const host=root.querySelector('.ely-mail-thread');metrics=[...host.querySelectorAll(':scope > details:not([open]) > summary')].map(n=>({row:rect(n),time:rect(n.querySelector('time')),host:rect(host)}));ok=metrics.length>0&&metrics.every(m=>fits(m.row,m.host)&&fits(m.time,m.host));}
        if(kind==='month'){metrics=[...root.querySelectorAll('[data-calendar-overflow]')].map(n=>({cell:rect(n.closest('article')),details:rect(n),summary:rect(n.querySelector('summary')),style:style(n),summaryStyle:style(n.querySelector('summary'))}));ok=metrics.length>0&&metrics.every(m=>m.summary.y>=m.cell.y&&m.summary.bottom<=m.cell.bottom+1);}
        if(kind==='graph'){metrics=[...root.querySelectorAll('.ely-workspace__graph g')].filter(n=>n.querySelector('circle')&&n.querySelector('text')).map(n=>({node:rect(n.querySelector('circle')),label:rect(n.querySelector('text')),fill:getComputedStyle(n.querySelector('text')).fill,ink:getComputedStyle(root).color}));ok=metrics.length>0&&metrics.every(m=>m.label.x>=m.node.right+1&&m.fill===m.ink&&m.label.height>=9&&fits(m.label,rect(root)));}
        if(kind==='network'){const textRect=n=>{const range=document.createRange();range.selectNodeContents(n);return rect(range);};metrics=[...root.querySelectorAll('[data-ws-network-row]')].map(n=>{const cells=n.querySelectorAll('td');return {kind:textRect(cells[2]),size:textRect(cells[3]),duration:textRect(cells[4])};});ok=metrics.length>0&&metrics.every(m=>m.size.x>=m.kind.right+4&&m.duration.x>=m.size.right+4);}
        if(kind==='metadata'){metrics=[...root.querySelectorAll('.ely-communication-file,.ely-communication-audio,.ely-communication-link a,.ely-chat-suggestion-chips [data-ely-welcome-suggestion],.ely-agent-tool-group summary,.ely-communication-tool-registry [data-ely-tool]>div,.ely-agent-checkpoints li>div')].map(n=>({primary:rect(n.querySelector(':scope > strong')),secondary:rect(n.querySelector(':scope > small,:scope > output'))}));ok=metrics.length>0&&metrics.every(m=>m.secondary.x>=m.primary.right+3||m.secondary.y>=m.primary.bottom+1);}
        if(kind==='hue'){metrics=[...root.querySelectorAll('[data-project-label-hue]')].map(n=>{const s=getComputedStyle(n);return {bounds:rect(n),appearance:s.appearance,backgroundImage:s.backgroundImage,label:n.getAttribute('aria-label'),options:n.options.length};});ok=metrics.length===4&&metrics.every(m=>m.backgroundImage.includes('radial-gradient')&&m.appearance==='none'&&m.bounds.width>=20&&m.bounds.width<=32&&m.label&&m.options===8);}
        return {ok,metrics};
      },kind);
      if(kind==='print'&&process.env.WORKSPACE_CLASSIC_SCROLLBAR==='1')assert(result.metrics.innerWidth-result.metrics.rootWidth>=14,'classic print regression must reserve a real scrollbar gutter');
      const screenshot=`${name.replaceAll('/','-')}.png`;await card.screenshot({path:join(output,screenshot)});report.checks.push({name,kind,...result,screenshot,sha256:digest(await readFile(join(output,screenshot)))});
    }
    if(phase==='after'){
      await page.evaluate(()=>{window.repairActions=[];document.addEventListener('ely:action',event=>{window.repairActions.push({action:event.detail.action,values:event.detail.values,hue:event.detail.hue});event.preventDefault();});});
      if(family==='workspace'){
        const main=name=>page.locator(`[data-audit-name="${name}"] [data-audit-main]`);
        const completion=main('editor/CompletionMenu'),first=completion.locator('[data-ws-complete]').first(),insert=await first.getAttribute('data-insert');await first.click();
        assert((await completion.locator('[data-ws-completion-source]').inputValue()).includes(insert));report.actions.push('completion insertion');
        const print=main('documents/PrintPreview');await print.locator('[data-ws-print-thumb="1"]').click();assert.equal(await print.locator('[data-ws-print-page-content="1"]').isVisible(),true);assert.equal(await print.locator('[data-ws-print-page-content="0"]').isVisible(),false);report.actions.push('print page selection');
        for(const name of groups.comments){const form=main(name).locator('[data-ws-thread-reply]').filter({visible:true}).first(),button=form.locator('[type=submit]');assert.equal(await button.isEnabled(),false);await form.locator('input[name=reply]').fill('Recovery reply');assert.equal(await button.isEnabled(),true);await button.click();assert(await page.evaluate(()=>window.repairActions.some(e=>e.action==='reply-comment'&&e.values?.some(([k,v])=>k==='reply'&&v==='Recovery reply'))));await page.evaluate(()=>window.repairActions=[]);report.actions.push(name+' reply event');}
        const picker=main('collab/ReactionPicker').locator('[data-ws-reaction-picker]').first();await picker.locator('summary').click();await picker.locator('[data-ws-pick-reaction]').first().click();assert.equal(await picker.getAttribute('open'),null);report.actions.push('reaction picker selection');
      }else{
        for(const name of ['mail/SnoozePicker','mail/ScheduleSend']){
          const main=page.locator(`[data-audit-name="${name}"] [data-audit-main]`);await main.locator('[data-ely-mail-time-menu]').click();await main.locator('[data-ely-mail-custom]').click();
          const dialog=main.locator('dialog');assert.equal(await dialog.isVisible(),true);assert.match(await dialog.locator('[data-ely-mail-when]').inputValue(),/^2026-10-14T/);assert.equal(await dialog.locator('input[name=value]').inputValue(),'review');
          await dialog.locator('[data-ely-mail-when]').fill('2099-10-14T09:00');await dialog.locator('[type=submit]').click();
          const action=name.endsWith('SnoozePicker')?'snooze':'schedule-send';assert(await page.evaluate(action=>window.repairActions.some(e=>e.action===action&&e.values?.some(([k,v])=>k==='value'&&v==='review')&&e.values.some(([k,v])=>k==='instant'&&v)),action));report.actions.push(name+' valid time and message identity');
        }
        const main=page.locator('[data-audit-name="calendar/CalendarMonthView"] [data-audit-main]'),more=main.locator('[data-calendar-overflow]').first();await more.locator('summary').click();assert.equal(await more.getAttribute('open'),'');assert(await more.locator('.ely-calendar-chip:visible').count()>0);report.actions.push('month overflow disclosure');
        const hue=page.locator('[data-audit-name="project/LabelManager"] [data-audit-main] [data-project-label-hue]').first(),next=String((Number(await hue.inputValue())+1)%8);await hue.selectOption(next);assert.equal(await hue.getAttribute('data-calendar-hue'),next);assert(await page.evaluate(value=>window.repairActions.some(e=>e.action==='recolor-label'&&e.hue===Number(value)),next));report.actions.push('native label hue selection and host event');
        await page.emulateMedia({forcedColors:'active'});const forced=await hue.evaluate(n=>{const s=getComputedStyle(n);return {appearance:s.appearance,background:s.backgroundImage,color:s.color};});assert.equal(forced.appearance,'auto');assert.equal(forced.background,'none');assert.notEqual(forced.color,'rgba(0, 0, 0, 0)');await page.emulateMedia({forcedColors:'none'});report.actions.push('native hue select forced-colors fallback');
      }
    }
  }
  const failures=report.checks.filter(c=>!c.ok);report.failureCount=failures.length;
  if(phase==='before'){assert(failures.length>0,'red control must witness real geometry failures');if(control==='original-head')assert(report.invalidDateInputs.some(n=>n.raw==='review'),'red control must locate invalid review datetime fixture');else{assert.deepEqual(failures.map(c=>c.name).sort(),[...groups.graph,...groups.network,...groups.metadata,...groups.hue].sort(),'current prior CSS must reproduce the precise 16 adjudicated defects');assert.equal(report.invalidDateInputs.length,0);}}
  else{assert.equal(failures.length,0,failures.map(c=>c.name).join(', '));assert.equal(report.invalidDateInputs.length,0,'invalid native date/time fixture values');assert.equal(report.console.filter(e=>e.type==='pageerror').length,0,'browser page errors');}
  report.finalSourceHashes={};for(const path of sourcePaths)report.finalSourceHashes[path]=digest(await readFile(path));assert.deepEqual(report.finalSourceHashes,report.sourceHashes,'source freeze during verification');
  report.status='passed';
}catch(error){report.status='failed';report.error=String(error);process.exitCode=1;}
finally{try{await stop();if(browser){await browser.close();report.browserClosed=!browser.isConnected();}await rm(temp,{recursive:true,force:true});report.tempRemoved=await access(temp).then(()=>false,()=>true);report.cleanup=report.serverStopped&&report.browserClosed&&report.tempRemoved;assert(report.cleanup,'owned resource cleanup');}catch(error){report.status='failed';report.cleanupError=String(error);process.exitCode=1;}await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({status:report.status,failures:report.failureCount,error:report.error,output,cleanup:report.cleanup}));}
