import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp,mkdir,readFile,writeFile,rm,access,realpath,statfs} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve,dirname,isAbsolute,sep} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

// Fixed task approval: human async reply "3GiB로 확대"; not an atomic quota on external writers.
const resourceLimits={aggregateSoftKiB:3080192,aggregateHardKiB:3145728,windowKiB:49152,profileKiB:65536,reportBytes:8*1024**2,errorReserveBytes:65536,diskKiB:4194304,memoryPercent:25};
const approvedEvidenceParent='/Users/cypark/.codex/visualizations/2026/10/19/01a1545f-a780-77f1-9190-f9461a0206fb';
const approvedRoots={evidenceRoot:join(approvedEvidenceParent,'visual-action-audit-20261021'),actionRoot:join(approvedEvidenceParent,'action-capture-completion-20261022')};
class ResourceBudgetError extends Error{constructor(code,fields={}){super(`Resource budget: ${code}`);this.name='ResourceBudgetError';this.code=code;this.fields=fields;}}
function parseResourcePlan(raw){
  if(raw===undefined)return null;let plan;try{if(raw.length>16384)throw Error();plan=JSON.parse(raw);}catch{throw new ResourceBudgetError('invalid-plan');}
  const keys=['mode','evidenceRoot','actionRoot','windowRoot'];
  if(!plan||Object.keys(plan).length!==keys.length||keys.some(key=>typeof plan[key]!=='string')||plan.mode!=='strict-task')throw new ResourceBudgetError('invalid-plan');
  for(const key of keys.slice(1))if(plan[key].length>4096||!isAbsolute(plan[key])||resolve(plan[key])!==plan[key])throw new ResourceBudgetError('invalid-plan');
  if(plan.evidenceRoot!==approvedRoots.evidenceRoot||plan.actionRoot!==approvedRoots.actionRoot)throw new ResourceBudgetError('invalid-plan-roots');
  const inside=(child,parent)=>child.startsWith(parent+sep);
  if(plan.evidenceRoot===plan.actionRoot||inside(plan.evidenceRoot,plan.actionRoot)||inside(plan.actionRoot,plan.evidenceRoot)||!inside(plan.windowRoot,plan.actionRoot))throw new ResourceBudgetError('invalid-plan');return plan;
}
function requireResourceBudget(sample,incomingBytes=0,reportBytes=0,ledgerGrowth=0,reserveReport=true){
  if(![...Object.values(sample),incomingBytes,reportBytes,ledgerGrowth].every(value=>Number.isSafeInteger(value)&&value>=0))throw new ResourceBudgetError('invalid-resource-reading');
  const incomingKiB=incomingBytes?Math.ceil(incomingBytes/4096)*4+4:0,reserveKiB=reserveReport?8192:0,projected=incomingKiB+reserveKiB;
  const fields={...sample,incomingBytes,reportBytes,ledgerGrowth,projectedKiB:projected};
  if(reportBytes+ledgerGrowth>resourceLimits.reportBytes-(reserveReport?resourceLimits.errorReserveBytes:0))throw new ResourceBudgetError('report-reserve',fields);
  if(sample.windowKiB+projected>resourceLimits.windowKiB)throw new ResourceBudgetError('window-cap',fields);
  if(sample.aggregateKiB+projected>=resourceLimits.aggregateSoftKiB)throw new ResourceBudgetError('aggregate-soft-stop',fields);
  if(sample.profileKiB+projected>resourceLimits.profileKiB)throw new ResourceBudgetError('profile-cap',fields);
  if(sample.freeDiskKiB-projected<resourceLimits.diskKiB)throw new ResourceBudgetError('disk-floor',fields);
  if(sample.freeMemoryPercent<resourceLimits.memoryPercent)throw new ResourceBudgetError('memory-floor',fields);
}
if(process.env.WORKSPACE_REPAIR_BUDGET_SELF_TEST==='1'){
  const good={aggregateKiB:1000,windowKiB:0,profileKiB:0,freeDiskKiB:5000000,freeMemoryPercent:25};let writes=0;
  for(const [code,sample]of [['window-cap',{...good,windowKiB:40960}],['aggregate-soft-stop',{...good,aggregateKiB:resourceLimits.aggregateSoftKiB-8192-1}],['disk-floor',{...good,freeDiskKiB:resourceLimits.diskKiB+8192}],['memory-floor',{...good,freeMemoryPercent:24}],['profile-cap',{...good,profileKiB:57344}]])assert.throws(()=>{requireResourceBudget(sample,1,1024,1024);writes++;},error=>error instanceof ResourceBudgetError&&error.code===code);
  for(const raw of ['', '{}', JSON.stringify({mode:'strict-task',evidenceRoot:'/e',actionRoot:'/e/a',windowRoot:'/e/a/w'}),JSON.stringify({mode:'strict-task',...approvedRoots,windowRoot:approvedRoots.actionRoot})])assert.throws(()=>{parseResourcePlan(raw);writes++;},ResourceBudgetError);
  assert.throws(()=>{requireResourceBudget(good,1,resourceLimits.reportBytes);writes++;},error=>error.code==='report-reserve');
  assert.equal(writes,0);assert.doesNotThrow(()=>requireResourceBudget({...good,windowKiB:40960},0,1024,1024));assert.doesNotThrow(()=>requireResourceBudget(good,4096,1024,1024));
  assert(parseResourcePlan(JSON.stringify({mode:'strict-task',...approvedRoots,windowRoot:join(approvedRoots.actionRoot,'info-test-window')})));assert.equal(parseResourcePlan(undefined),null);console.log('Resource guard self-check passed: window/aggregate/disk/memory/report/invalid-plan rejection, zero PNG writes, inclusive window boundary and positives; no resource commands or side effects.');process.exit(0);
}
async function resourceSample(plan,profileDirectory){
  for(const path of [plan.evidenceRoot,plan.actionRoot])if(await realpath(path)!==path)throw new ResourceBudgetError('resource-root-identity');
  try{if(await realpath(plan.windowRoot)!==plan.windowRoot)throw new ResourceBudgetError('resource-root-identity');}catch(error){if(error.code!=='ENOENT')throw error;}
  const command=(name,args)=>{const result=spawnSync(name,args,{encoding:'utf8',maxBuffer:16384});if(result.status!==0)throw new ResourceBudgetError('resource-command-failed',{status:result.status??-1});return result.stdout;};
  const size=async(path,optional=false)=>{try{await access(path);}catch(error){if(optional&&error.code==='ENOENT')return 0;throw new ResourceBudgetError('resource-root-unreadable');}const match=command('du',['-sk',path]).match(/^\s*(\d+)\s/);if(!match)throw new ResourceBudgetError('invalid-resource-reading');return Number(match[1]);};
  const aggregateKiB=await size(plan.evidenceRoot)+await size(plan.actionRoot),windowKiB=await size(plan.windowRoot,true),profileKiB=profileDirectory?await size(profileDirectory,true):0;
  const disk=await statfs(plan.actionRoot,{bigint:true}),memory=command('memory_pressure',['-Q']).match(/free percentage:\s*(\d+)%/);
  if(!memory)throw new ResourceBudgetError('invalid-resource-reading');return {aggregateKiB,windowKiB,profileKiB,freeDiskKiB:Number(disk.bavail*disk.bsize/1024n),freeMemoryPercent:Number(memory[1])};
}
const resourcePlan=parseResourcePlan(process.env.WORKSPACE_REPAIR_RESOURCE_PLAN);
if(resourcePlan){
  if(process.platform!=='darwin'||!process.env.WORKSPACE_REPAIR_OUTPUT||resolve(process.env.WORKSPACE_REPAIR_OUTPUT)!==resourcePlan.windowRoot)throw new ResourceBudgetError('invalid-plan');
  try{for(const path of [resourcePlan.evidenceRoot,resourcePlan.actionRoot,dirname(resourcePlan.windowRoot)])if(await realpath(path)!==path)throw Error();try{if(await realpath(resourcePlan.windowRoot)!==resourcePlan.windowRoot)throw Error();}catch(error){if(error.code!=='ENOENT')throw error;}}
  catch{throw new ResourceBudgetError('invalid-plan-real-roots');}requireResourceBudget(await resourceSample(resourcePlan));
}
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
const sourcePaths=['ui/gohtmx/assets/ely-api-workspace.css','ui/gohtmx/assets/ely-api-workspace.js','ui/gohtmx/assets/ely-api-communication.css','ui/gohtmx/assets/ely-api-calendar-parity.css','ui/gohtmx/assets/ely-api-foundation.css','ui/gohtmx/assets/ely-controls.css','ui/gohtmx/templates/ely-api-workspace.html','ui/gohtmx/templates/ely-api-communication.html','internal/gallery/advanced_communication_fixtures.go','ui/gohtmx/tests/browser/workspace-communication-repair-browser-test.mjs'];
sourcePaths.push('ui/gohtmx/assets/ely-api.css','ui/gohtmx/assets/ely-api-native.css','ui/gohtmx/assets/ely-api-interaction.css','ui/gohtmx/assets/ely-api-native-tooling.js','ui/gohtmx/assets/ely-api-native.js','ui/gohtmx/assets/theme.js','ui/gohtmx/assets/app.css','internal/gallery/advanced_native_tooling_fixtures.go','internal/gallery/advanced_native_generative_fixtures.go','internal/gallery/advanced_interaction_fixtures.go','ui/gohtmx/templates/ely-api-native.html','ui/gohtmx/templates/ely-api-native-tooling.html','ui/gohtmx/templates/ely-api-interaction.html');
sourcePaths.push('ui/gohtmx/assets/ely-api.js','ui/gohtmx/assets/ely-api-native-entry.js','ui/gohtmx/assets/ely-api-native-generative-tools.js','ui/gohtmx/assets/ely-api-interaction.js','internal/gallery/advanced_native_fixtures.go','ui/gohtmx/templates/ely-api.html');
const report={phase,control,profile,viewport,colorScheme,node:process.version,nodeExecutable:process.execPath,checks:[],actions:[],console:[],invalidDateInputs:[],sourceHashes:{},cleanup:false,
  resourceGuard:{mode:resourcePlan?'strict-task':'ordinary-ci',aggregateEnforced:Boolean(resourcePlan),plan:resourcePlan,limits:resourcePlan?resourceLimits:null,approval:resourcePlan?'Human async reply: 3GiB로 확대':null,preventiveNotAtomic:true},resourceLedger:[]};let child,browser,serverPort;
const reportText=()=>JSON.stringify(report,null,2)+'\n';
const run=(cmd,args)=>{const r=spawnSync(cmd,args,{cwd:repo,env,encoding:'utf8'});assert.equal(r.status,0,r.stderr);return r.stdout.trim();};
const serverIdentity=()=>{
  if(!child?.pid)return null;
  const read=field=>{const result=spawnSync('ps',['-ww','-p',String(child.pid),'-o',field+'='],{encoding:'utf8'});return result.status===0?result.stdout.trim():'';};
  const birth=read('lstart'),command=read('command');return birth&&command?{pid:child.pid,birth,command}:null;
};
async function guardedScreenshot(page,target,options,file){
  let entry;
  if(resourcePlan){
    const identity=serverIdentity(),expected=report.serverIdentityAtSpawn,context=page.context();
    if(!identity||!expected||identity.birth!==expected.birth||identity.command!==expected.command||identity.command!==report.serverExpectedCommand||!browser?.isConnected()||!browser.contexts().includes(context)||!context.pages().includes(page))throw new ResourceBudgetError('capture-owner-identity');
    entry={file,utc:new Date().toISOString(),server:identity,contextIndex:browser.contexts().indexOf(context),pageIndex:context.pages().indexOf(page),viewport:page.viewportSize(),preimage:await resourceSample(resourcePlan,output)};
    // Project one bounded prewrite sample plus hash/byte fields, not the PNG contents.
    const ledgerGrowth=Buffer.byteLength(JSON.stringify(entry,null,2))+2048;
    requireResourceBudget(entry.preimage,0,Buffer.byteLength(reportText()),ledgerGrowth);
    report.resourceLedger.push(entry);
  }
  const png=await target.screenshot(options);
  if(resourcePlan){
    entry.bytes=png.length;entry.sha256=digest(png);entry.prewrite=await resourceSample(resourcePlan,output);
    requireResourceBudget(entry.prewrite,png.length,Buffer.byteLength(reportText()),2048);
  }
  await writeFile(join(output,file),png,{flag:'wx'});
  if(resourcePlan){entry.written=true;entry.postwrite=await resourceSample(resourcePlan,output);requireResourceBudget(entry.postwrite,0,Buffer.byteLength(reportText()),2048);}
}
async function stop(){
  report.serverPID=child?.pid??null;
  if(child?.pid&&child.exitCode===null&&child.signalCode===null){
    const current=serverIdentity();report.serverIdentityBeforeTERM=current;
    if(!report.serverIdentityAtSpawn||!current||current.birth!==report.serverIdentityAtSpawn.birth||current.command!==report.serverExpectedCommand||current.command!==report.serverIdentityAtSpawn.command)throw Error('CLEANUP_PENDING: owned server identity not verified; no signal sent');
    let timer,onExit;
    const done=new Promise(resolve=>{onExit=()=>resolve(true);child.once('exit',onExit);timer=setTimeout(()=>resolve(false),5000);});
    try{assert(child.kill('SIGTERM'),'CLEANUP_PENDING: owned server TERM failed');assert(await done,'CLEANUP_PENDING: owned server exit timed out');}
    finally{clearTimeout(timer);child.removeListener('exit',onExit);}
  }
  report.serverStopped=!child?.pid||child.exitCode!==null||child.signalCode!==null;
  if(!report.serverStopped)throw Error('CLEANUP_PENDING: owned server still running');
}
async function verifyPortClosed(){
  if(serverPort===undefined)return true;
  const probe=createServer();let timer;
  try{return await new Promise(resolve=>{timer=setTimeout(()=>resolve(false),2000);probe.once('error',()=>resolve(false));probe.listen(serverPort,'127.0.0.1',()=>probe.close(()=>resolve(true)));});}
  finally{clearTimeout(timer);if(probe.listening)probe.close();}
}
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
  const base=`http://127.0.0.1:${port}`;serverPort=port;report.serverPort=port;
  report.serverExpectedCommand=`${join(temp,'gallery')} -addr 127.0.0.1:${port}`;
  child=spawn(join(temp,'gallery'),['-addr',`127.0.0.1:${port}`],{stdio:'ignore'});
  child.on('error',error=>{report.serverSpawnError=String(error);});
  report.serverIdentityAtSpawn=serverIdentity();
  assert(report.serverIdentityAtSpawn?.command===report.serverExpectedCommand,'owned server spawn identity');
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
      const screenshot=`${name.replaceAll('/','-')}.png`;await guardedScreenshot(page,card,{},screenshot);report.checks.push({name,kind,...result,screenshot,sha256:digest(await readFile(join(output,screenshot)))});
    }
    if(phase==='after'){
      await page.evaluate(()=>{window.repairActions=[];document.addEventListener('ely:action',event=>{window.repairActions.push({action:event.detail.action,values:event.detail.values,hue:event.detail.hue});event.preventDefault();});});
      if(family==='workspace'){
        const main=name=>page.locator(`[data-audit-name="${name}"] [data-audit-main]`);
        // Same left-side native Restore press as the retained 7d blur failure.
        // No retry, forced click, or confirmation-cancellation timing change.
        const trash=main('documents/TrashBin').locator(':scope > [data-ely-family]'),restore=trash.locator('[data-ely-action="restore-file"]'),remove=trash.locator('[data-ely-action="delete-file-permanently"]');
        const trashTwin=page.locator('[data-audit-name="documents/TrashBin"] [data-audit-twin]>[data-ely-family]');
        const twinBefore=await trashTwin.evaluate(node=>node.outerHTML);
        await trash.evaluate(node=>{node.__trashPointerEvents=[];node.addEventListener('ely:action',event=>node.__trashPointerEvents.push({kind:'action',detail:event.detail}));document.addEventListener('click',event=>{const button=event.target.closest('button');if(button&&node.contains(button))node.__trashPointerEvents.push({kind:'click',trusted:event.isTrusted,action:button.dataset.elyAction});},true);});
        await trash.scrollIntoViewIfNeeded();
        const restoreBefore=await restore.boundingBox();assert(restoreBefore);
        const stableRestore=async()=>{const rect=await restore.boundingBox();assert(rect);for(const key of ['x','y','width','height'])assert(Math.abs(rect[key]-restoreBefore[key])<=.5,`Trash Restore ${key} moved while confirmation changed`);return rect;};
        const trashImages=[];
        for(const stage of ['initial','armed','blur-restore']){
          if(stage==='armed')await remove.click();
          if(stage==='blur-restore')await restore.click({position:{x:restoreBefore.width*.05,y:restoreBefore.height/2}});
          await stableRestore();
          const events=await trash.evaluate(node=>node.__trashPointerEvents),actions=events.filter(event=>event.kind==='action');
          assert.equal((await remove.textContent()).trim(),stage==='armed'?'Confirm delete':'Delete');
          if(stage==='blur-restore'){
            assert.deepEqual(actions.map(event=>event.detail),[{value:'deleted-8',formData:null,values:[],id:await trash.getAttribute('id'),component:'documents/TrashBin',action:'restore-file'}]);
            assert.deepEqual(events.filter(event=>event.kind==='click').map(event=>[event.trusted,event.action]),[[true,'delete-file-permanently'],[true,'restore-file']]);
          }else assert.deepEqual(actions,[],'Arming confirmation must not dispatch a host action');
          assert.equal(await trash.locator('[data-ws-trash-item="deleted-8"]').count(),1,'Restore is only a host request, not local deletion');
          assert.equal(await trashTwin.evaluate(node=>node.outerHTML),twinBefore,'Trash pointer sequence must not mutate the twin');
          const screenshot=`trash-confirm-${stage}.png`;await guardedScreenshot(page,trash,{},screenshot);trashImages.push({stage,screenshot,sha256:digest(await readFile(join(output,screenshot))),restore:await stableRestore()});
        }
        report.trashPointerRegression={images:trashImages,events:await trash.evaluate(node=>node.__trashPointerEvents)};
        report.actions.push('Trash confirmation blur preserves native Restore target and exact once request');
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
  if(phase==='after'){
    report.browserVersion=browser.version();report.infoCascade=[];report.infoRestoreErrors=[];
    const nativeInfo=[
      {key:'generative/FineTuneJobCard',selector:'.ely-native-tune[data-state="running"]',role:'badge'},
      {key:'generative/DatasetViewer',selector:'.ely-native-dataset',role:'dataset'},
      {key:'tooling/A11yChecker',selector:'[data-front-token="--info"][data-back-token="--info-subtle"]',role:'checker'},
      {key:'tooling/DesignTokenViewer',selector:'.ely-tooling-token-group',role:'tokens'},
    ];
    const feedbackInfo=[{key:'feedback/Alert',selector:'.ely-interaction__alert.is-info',role:'alert'},{key:'feedback/Callout',selector:'.ely-interaction__callout.is-info',role:'callout'},{key:'feedback/InlineMessage',selector:'.ely-interaction__message.is-info',role:'inline'}];
    const callerCSS=Buffer.from('@layer workspace-info-host { :root { --info:#234567;--info-subtle:#ffffff } .workspace-info-host { --info:#123456;--info-subtle:#ffffff } }');
    const callerURL=`${base}/__caller-test__/info-layered-${digest(callerCSS)}.css`;report.infoCallerStylesheet={kind:'explicit-caller-test-not-production-asset',url:callerURL,bytes:callerCSS.length,sha256:digest(callerCSS),requests:[],finished:[]};
    let finishCaller;const callerFinished=new Promise(resolve=>finishCaller=resolve);
    await page.route(callerURL,async route=>{const request=route.request();report.infoCallerStylesheet.requests.push({url:request.url(),method:request.method()});assert.equal(request.url(),callerURL);assert.equal(request.method(),'GET');await route.fulfill({status:200,headers:{'content-type':'text/css','cache-control':'no-store','x-ely-caller-test':'info-layered-host'},body:callerCSS});});
    page.on('requestfinished',async request=>{if(request.url()!==callerURL)return;try{const response=await request.response(),body=await response.body();const finished={url:request.url(),status:response.status(),contentType:response.headers()['content-type'],bytes:body.length,sha256:digest(body),finished:true};report.infoCallerStylesheet.finished.push(finished);finishCaller(finished);}catch(error){const failed={url:request.url(),error:String(error),finished:false};report.infoCallerStylesheet.finished.push(failed);finishCaller(failed);}});
    report.infoPageCSP=[];
    for(const family of ['native','interaction']){
      const infoResponse=await page.goto(`${base}/components/audit?family=${family}&aliases=1`,{waitUntil:'networkidle'}),csp=infoResponse.headers()['content-security-policy'];report.infoPageCSP.push({family,url:infoResponse.url(),csp});assert(csp?.includes("style-src 'self'")&&!csp.includes("'unsafe-inline'"),'Info caller tests must retain strict gallery CSP');
      await page.evaluate(mode=>window.ElyTheme.apply('ely',mode),colorScheme);await page.evaluate(()=>document.fonts.ready);
      const items=family==='native'?nativeInfo:feedbackInfo;
      // Escape test labels so the CSS utility scanner does not emit styles.
      for(const scenario of family==='native'?['default','scheme\x2donly\x2ddark','layered-nested','inline-low','old-alias-negative']:['default-feedback']){
        const receipt={family,scenario,kind:scenario==='old-alias-negative'?'injected-negative-control-not-historical-before':scenario==='default'||scenario==='default-feedback'?'unmodified-default':'explicit-host-style-test',images:[]};report.infoCascade.push(receipt);let originalError;
        try{
          receipt.setup=await page.evaluate(async({items,scenario,mode,callerURL})=>{
            const roots=items.map(item=>document.querySelector(`[data-audit-name="${item.key}"] [data-audit-main]>[data-ely-family]`));if(roots.some(root=>!root))throw Error('Missing real Info caller root');
            const visible=node=>node.getClientRects().length>0&&getComputedStyle(node).visibility==='visible';
            const owners=roots.map(root=>({main:root.closest('[data-audit-main]'),id:root.id,family:root.getAttribute('data-ely-family')}));
            // Retain the actual component identity when the host test reparents it.
            window.__workspaceInfoRoot=key=>{const index=items.findIndex(item=>item.key===key),root=roots[index],owner=owners[index],mains=document.querySelectorAll(`[data-audit-name="${key}"] [data-audit-main]`);if(!root||mains.length!==1||mains[0]!==owner.main||!owner.main.contains(root)||root.closest('[data-audit-main]')!==owner.main||root.id!==owner.id||root.getAttribute('data-ely-family')!==owner.family||!visible(root))throw Error(`Missing or changed owned Info root: ${key}`);return root;};
            const state=()=>roots.map((root,index)=>{const item=items[index],target=root.querySelector(item.selector),style=getComputedStyle(root);const nodes=item.role==='dataset'?[...target.querySelectorAll('[data-split="Held out"] .ely-native-badge')].filter(visible):item.role==='badge'?[target.querySelector('.ely-native-badge')]:item.role==='checker'?[target.querySelector('[data-tool-a11y-sample]')]:item.role==='tokens'?[...root.querySelectorAll('[data-token="--info"] i,[data-token="--info-subtle"] i')]:[target,...target.querySelectorAll('.ely-interaction__feedback-icon')];return {key:item.key,mode:style.colorScheme,tokens:Object.fromEntries(['--info','--info-subtle','--focus','--ring','--color-focus','--color-info','--color-info-subtle'].map(key=>[key,style.getPropertyValue(key).trim()])),colors:nodes.map(node=>{const s=getComputedStyle(node);return {color:s.color,background:s.backgroundColor};})};});
            const undo=[],verify=[],styles=[];let baseline;
            window.__workspaceInfoRestore=()=>{const errors=[];for(const restore of undo.reverse())try{restore();}catch(error){errors.push(String(error));}for(const root of roots)root.dispatchEvent(new Event('ely:theme'));for(const check of verify)if(!check())errors.push('Scenario restoration verification failed');const restored=state();if(JSON.stringify(restored)!==JSON.stringify(baseline))errors.push('Computed mode/token/color restoration failed');delete window.__workspaceInfoRoot;delete window.__workspaceInfoRestore;if(errors.length)throw Error(errors.join('; '));return {verified:true,checks:verify.length,baseline,restored,styles};};
            baseline=state();
            const properties=node=>[...node.style].map(name=>({name,value:node.style.getPropertyValue(name),priority:node.style.getPropertyPriority(name)}));
            const saveStyle=node=>{const present=node.hasAttribute('style'),saved=properties(node),entry={tag:node.tagName,id:node.id,priorAttributePresent:present,properties:saved};styles.push(entry);undo.push(()=>{for(const name of [...node.style])node.style.removeProperty(name);for(const {name,value,priority}of saved)node.style.setProperty(name,value,priority);if(!present)node.removeAttribute('style');else if(!node.hasAttribute('style'))node.style.cssText='';entry.restoredAttributePresent=node.hasAttribute('style');entry.restoredProperties=properties(node);});verify.push(()=>node.hasAttribute('style')===present&&JSON.stringify(properties(node))===JSON.stringify(saved));};
            const tokens=root=>Object.fromEntries(['--focus','--ring','--color-focus','--color-info','--color-info-subtle'].map(key=>[key,getComputedStyle(root).getPropertyValue(key).trim()]));
            const before=roots.map(tokens),rootLayer=[];const negative=roots.map(root=>({focus:getComputedStyle(root).getPropertyValue('--focus').trim()}));
            if(scenario==='scheme\x2donly\x2ddark'){
              for(const node of document.querySelectorAll('[data-theme],.dark')){const theme=node.getAttribute('data-theme'),cls=node.getAttribute('class');undo.push(()=>{theme===null?node.removeAttribute('data-theme'):node.setAttribute('data-theme',theme);cls===null?node.removeAttribute('class'):node.setAttribute('class',cls);});verify.push(()=>node.getAttribute('data-theme')===theme&&node.getAttribute('class')===cls);node.removeAttribute('data-theme');node.classList.remove('dark');}
              saveStyle(document.documentElement);document.documentElement.style.colorScheme='dark';
            }
            if(scenario==='layered-nested'){
              const link=document.createElement('link');link.rel='stylesheet';link.href=callerURL;undo.push(()=>link.remove());verify.push(()=>!link.isConnected);let timer;
              try{await new Promise((resolve,reject)=>{link.onload=resolve;link.onerror=()=>reject(Error('Caller-test stylesheet blocked or failed'));timer=setTimeout(()=>reject(Error('Caller-test stylesheet load timed out')),5000);document.head.prepend(link);});}finally{clearTimeout(timer);}
              for(const root of roots){root.dispatchEvent(new Event('ely:theme'));rootLayer.push({info:getComputedStyle(root).getPropertyValue('--info').trim(),subtle:getComputedStyle(root).getPropertyValue('--info-subtle').trim()});}
              for(const root of roots){const host=document.createElement('div'),nested=document.createElement('div'),parent=root.parentNode,next=root.nextSibling;host.className='workspace-info-host';nested.dataset.theme=mode==='dark'?'light':'dark';nested.style.colorScheme=nested.dataset.theme;parent.insertBefore(host,root);undo.push(()=>host.remove());undo.push(()=>parent.insertBefore(root,next));verify.push(()=>root.parentNode===parent&&root.nextSibling===next&&!host.isConnected);host.append(nested);nested.append(root);}
            }
            if(scenario==='inline-low'||scenario==='old-alias-negative')for(const [index,root]of roots.entries()){saveStyle(root);root.style.setProperty('--info',scenario==='inline-low'?'#777777':'var(--focus)');root.style.setProperty('--info-subtle',scenario==='inline-low'?'#ffffff':index===0?'#e8eef6':'#ebf4ff');}
            for(const root of roots)root.dispatchEvent(new Event('ely:theme'));
            const support=CSS.supports('color','light-dark(#010203,#fefdfc)'),branches=[],branchSamples=[],probeCanvas=document.createElement('canvas');probeCanvas.width=probeCanvas.height=1;const probeContext=probeCanvas.getContext('2d');if(!probeContext)throw Error('Unsupported light-dark branch measurement');
            const probe=document.createElement('span');undo.push(()=>probe.remove());probe.style.color='light-dark(#010203,#fefdfc)';document.body.append(probe);for(const scheme of ['light','dark']){probe.style.colorScheme=scheme;const color=getComputedStyle(probe).color;branches.push(color);probeContext.clearRect(0,0,1,1);probeContext.fillStyle=color;probeContext.fillRect(0,0,1,1);branchSamples.push([...probeContext.getImageData(0,0,1,1).data]);}probe.remove();
            return {before,after:roots.map(tokens),rootLayer,negative,support,branches,branchSamples,schemes:roots.map(root=>getComputedStyle(root).colorScheme),modeAncestors:roots.map(root=>{const result=[];for(let node=root;node;node=node.parentElement)if(node.hasAttribute('data-theme')||node.classList.contains('dark'))result.push({tag:node.tagName,theme:node.getAttribute('data-theme'),dark:node.classList.contains('dark')});return result;})};
          },{items,scenario,mode:colorScheme,callerURL});
          if(scenario==='layered-nested'){let timer;try{receipt.callerStylesheet=await Promise.race([callerFinished,new Promise((_,reject)=>timer=setTimeout(()=>reject(Error('Caller-test stylesheet requestfinished timed out')),5000))]);}finally{clearTimeout(timer);}assert.equal(receipt.callerStylesheet.finished,true);assert.equal(receipt.callerStylesheet.status,200);assert.equal(receipt.callerStylesheet.contentType,'text/css');assert.equal(receipt.callerStylesheet.sha256,digest(callerCSS));assert.equal(receipt.callerStylesheet.bytes,callerCSS.length);assert.equal(report.infoCallerStylesheet.requests.length,1);}
          receipt.measurements=await page.evaluate(({items,scenario})=>{
            const canvas=document.createElement('canvas');canvas.width=canvas.height=1;const ctx=canvas.getContext('2d',{willReadFrequently:true});if(!ctx)throw Error('Unsupported color measurement: no Canvas2D');
            const sample=raw=>{if(!CSS.supports('color',raw))throw Error(`Unsupported computed color ${raw}`);ctx.clearRect(0,0,1,1);ctx.fillStyle=raw;ctx.fillRect(0,0,1,1);return [...ctx.getImageData(0,0,1,1).data];};
            const luminance=rgb=>{const c=rgb.slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return .2126*c[0]+.7152*c[1]+.0722*c[2];};
            const measure=(node,role)=>{if(!node)throw Error(`Missing measured ${role}`);const style=getComputedStyle(node),layers=[];for(let parent=role==='icon'?node.parentElement:node;parent;parent=parent.parentElement){const s=getComputedStyle(parent);if(Number(s.opacity)!==1||s.backgroundImage!=='none'||s.filter !== 'none'||s.mixBlendMode!=='normal')throw Error(`Unsupported contrast backdrop: ${parent.tagName} opacity/gradient/filter/blend`);layers.push({tag:parent.tagName,background:s.backgroundColor});}
              ctx.clearRect(0,0,1,1);for(const layer of layers.slice().reverse()){ctx.fillStyle=layer.background;ctx.fillRect(0,0,1,1);}const background=[...ctx.getImageData(0,0,1,1).data];if(background[3]!==255)throw Error('Unsupported transparent contrast backing');ctx.fillStyle=style.color;ctx.fillRect(0,0,1,1);const foreground=[...ctx.getImageData(0,0,1,1).data],a=luminance(foreground),b=luminance(background),rect=node.getBoundingClientRect();return {role,text:node.textContent,rawColor:style.color,rawBackground:style.backgroundColor,foregroundSample:sample(style.color),compositedForeground:foreground,compositedBackground:background,layers,fontSize:style.fontSize,fontWeight:style.fontWeight,threshold:role==='icon'?3:4.5,ratio:(Math.max(a,b)+.05)/(Math.min(a,b)+.05),bounds:{x:rect.x,y:rect.y,width:rect.width,height:rect.height}};};
            return items.map(item=>{const root=window.__workspaceInfoRoot(item.key),target=root.querySelector(item.selector),result={key:item.key,role:item.role,info:getComputedStyle(root).getPropertyValue('--info').trim(),subtle:getComputedStyle(root).getPropertyValue('--info-subtle').trim(),samples:[]};try{
              if(item.role==='badge'||item.role==='dataset'){const badge=item.role==='dataset'?[...target.querySelectorAll('[data-split="Held out"] .ely-native-badge')].find(node=>node.getClientRects().length>0&&getComputedStyle(node).visibility==='visible'):target.querySelector('.ely-native-badge');if(item.role==='dataset'){if(!badge||badge.closest('[data-split]').dataset.split!=='Held out')throw Error('Missing visible Held out badge');result.split=badge.closest('[data-split]').dataset.split;}result.samples.push(measure(badge,'text'));}
              if(item.role==='checker'){const swatch=target.querySelector('[data-tool-a11y-sample]');result.samples.push(measure(swatch,'text'));result.need=Number(target.dataset.need);result.displayedRatio=target.querySelector('[data-tool-a11y-ratio]').textContent;result.grade=target.querySelector('[data-tool-a11y-grade]').textContent;}
              if(item.role==='tokens')result.tokens=['--info','--info-subtle'].map(token=>{const el=root.querySelector(`[data-token="${token}"]`);return {token,output:el.querySelector('output').textContent,swatch:getComputedStyle(el.querySelector('i')).backgroundColor,sample:sample(getComputedStyle(el.querySelector('i')).backgroundColor)};});
              if(['alert','callout','inline'].includes(item.role)){result.samples.push(measure(item.role==='callout'?target.querySelector('header'):item.role==='alert'?target.querySelector('strong'):target,'text'));result.samples.push(measure(target.querySelector('.ely-interaction__feedback-icon'),'icon'));}
            }catch(error){result.unsupported=String(error);}return result;});
          },{items,scenario});
          const captureItems=items.filter(item=>scenario==='old-alias-negative'?['badge','checker'].includes(item.role):['layered-nested','inline-low'].includes(scenario)?item.role!=='dataset':true);
          for(const item of captureItems){const target=page.locator(`[data-audit-name="${item.key}"] [data-audit-main] ${item.selector}`).first(),file=`info-${scenario}-${item.key.replaceAll('/','-')}.png`;await guardedScreenshot(page,target,{animations:'disabled'},file);receipt.images.push({caseId:item.key,screenshot:file,sha256:digest(await readFile(join(output,file)))});}
          assert(receipt.setup.support,'Actual browser must support light-dark, not skip');assert.deepEqual(receipt.setup.branchSamples,[[1,2,3,255],[254,253,252,255]],'Actual used color-scheme must select both branches');assert.deepEqual(receipt.setup.after,receipt.setup.before,'Focus and excluded color-info aliases unchanged');
          if(scenario==='scheme\x2donly\x2ddark'){assert(receipt.setup.schemes.every(mode=>mode==='dark'));assert(receipt.setup.modeAncestors.every(list=>list.length===0),'Scheme-only host must have no mode attributes/classes');}
          if(scenario==='layered-nested')assert(receipt.setup.rootLayer.every(row=>row.info==='#234567'&&row.subtle==='#ffffff'),'Layered root overrides survive library roots before nested host overrides');
          for(const row of receipt.measurements){assert(!row.unsupported,`${scenario}/${row.key}: ${row.unsupported}`);if(scenario==='layered-nested')assert.deepEqual([row.info,row.subtle],['#123456','#ffffff']);if(scenario==='inline-low')assert.deepEqual([row.info,row.subtle],['#777777','#ffffff']);
            for(const metric of row.samples){const red=(scenario==='inline-low'||scenario==='old-alias-negative')&&['badge','dataset','checker'].includes(row.role);assert(red?metric.ratio<metric.threshold:metric.ratio>=metric.threshold,`${scenario}/${row.key}/${metric.role} contrast ${metric.ratio}, threshold ${metric.threshold}`);}
            if(row.role==='checker'){assert.equal(row.need,4.5);assert.notEqual(row.grade,'Invalid');assert.equal(row.displayedRatio,row.samples[0].ratio.toFixed(2)+':1');assert.equal(row.grade==='Fail',scenario==='inline-low'||scenario==='old-alias-negative');}
            if(['badge','dataset'].includes(row.role)&&scenario!=='old-alias-negative'){const checker=receipt.measurements.find(value=>value.role==='checker').samples[0];assert.deepEqual(row.samples[0].foregroundSample,checker.foregroundSample,'Actual badge foreground matches resolved checker pair');assert.deepEqual(row.samples[0].compositedBackground,checker.compositedBackground,'Actual badge background matches resolved checker pair');}
            if(row.role==='tokens'){const front=receipt.measurements.find(value=>value.role==='checker').samples[0];assert.deepEqual(row.tokens[0].sample,front.foregroundSample);assert.deepEqual(row.tokens[1].sample,front.compositedBackground);}
          }
        }catch(error){originalError=error;throw error;}finally{
          try{receipt.restoration=await page.evaluate(()=>window.__workspaceInfoRestore?.());assert(receipt.restoration?.verified,'Info scenario restore receipt missing');receipt.restored=true;}catch(error){receipt.restoreError=String(error);report.infoRestoreErrors.push(String(error));if(!originalError)throw error;}
        }
      }
    }
    assert.equal(report.infoCascade.reduce((count,row)=>count+row.images.length,0),19,'Exactly19 Info images per profile (17positive,2negative)');
  }
  const failures=report.checks.filter(c=>!c.ok);report.failureCount=failures.length;
  if(phase==='before'){assert(failures.length>0,'red control must witness real geometry failures');if(control==='original-head')assert(report.invalidDateInputs.some(n=>n.raw==='review'),'red control must locate invalid review datetime fixture');else{assert.deepEqual(failures.map(c=>c.name).sort(),[...groups.graph,...groups.network,...groups.metadata,...groups.hue].sort(),'current prior CSS must reproduce the precise 16 adjudicated defects');assert.equal(report.invalidDateInputs.length,0);}}
  else{assert.equal(failures.length,0,failures.map(c=>c.name).join(', '));assert.equal(report.invalidDateInputs.length,0,'invalid native date/time fixture values');assert.equal(report.console.filter(e=>e.type==='pageerror').length,0,'browser page errors');}
  report.finalSourceHashes={};for(const path of sourcePaths)report.finalSourceHashes[path]=digest(await readFile(path));assert.deepEqual(report.finalSourceHashes,report.sourceHashes,'source freeze during verification');
  report.status='passed';
}catch(error){report.status='failed';report.error=String(error);if(error instanceof ResourceBudgetError)report.resourceFailure={code:error.code,fields:error.fields};process.exitCode=1;}
finally{
  const cleanupErrors=[];
  try{await stop();}catch(error){cleanupErrors.push(String(error));}
  try{if(browser)await browser.close();report.browserClosed=!browser||!browser.isConnected();}catch(error){cleanupErrors.push(String(error));}
  try{report.serverPortClosed=await verifyPortClosed();}catch(error){cleanupErrors.push(String(error));}
  try{
    if(report.serverStopped&&report.serverPortClosed)await rm(temp,{recursive:true,force:true});
    else cleanupErrors.push('CLEANUP_PENDING: private binary retained until server exit and port closure verified');
    report.tempRemoved=await access(temp).then(()=>false,error=>{if(error.code==='ENOENT')return true;throw error;});
  }catch(error){cleanupErrors.push(String(error));}
  try{report.cleanupSourceHashes={};for(const path of sourcePaths)report.cleanupSourceHashes[path]=digest(await readFile(path));assert.deepEqual(report.cleanupSourceHashes,report.sourceHashes,'source freeze at cleanup');}catch(error){report.sourceFreezeError=String(error);cleanupErrors.push(String(error));}
  report.cleanup=Boolean(report.serverStopped&&report.serverPortClosed&&report.browserClosed&&report.tempRemoved&&!cleanupErrors.length);
  report.cleanupStatus=report.cleanup?'VERIFIED':'CLEANUP_PENDING';
  if(!report.cleanup){report.status='failed';report.cleanupError=cleanupErrors.join('; ');process.exitCode=1;}
  let serialized=reportText(),fullReportRetained=false,retentionFailure;
  try{
    if(resourcePlan){const bytes=Buffer.byteLength(serialized);requireResourceBudget(await resourceSample(resourcePlan,output),bytes,bytes,0,false);}
    await writeFile(join(output,'report.json'),serialized,{flag:'wx'});fullReportRetained=true;
  }catch(error){
    process.exitCode=1;retentionFailure={code:error instanceof ResourceBudgetError?error.code:'report-write-failed',fullReportBytes:Buffer.byteLength(serialized),fullReportSha256:digest(serialized),fullReportRetained:false,neededUserAction:'Preserve existing evidence; obtain space/budget approval and review the missing full report before any rerun.'};
    const marker={status:'failed',retentionFailure,originalStatus:report.status,originalError:report.error?{bytes:Buffer.byteLength(report.error),sha256:digest(report.error)}:null,sourceHashes:report.sourceHashes,cleanupSourceHashes:report.cleanupSourceHashes,sourceFreezeError:report.sourceFreezeError,resourceFailure:report.resourceFailure,cleanup:report.cleanup,cleanupStatus:report.cleanupStatus,serverStopped:report.serverStopped,serverPortClosed:report.serverPortClosed,browserClosed:report.browserClosed,tempRemoved:report.tempRemoved};
    try{const text=JSON.stringify(marker,null,2)+'\n',bytes=Buffer.byteLength(text);if(resourcePlan)requireResourceBudget(await resourceSample(resourcePlan,output),bytes,bytes,0,false);await writeFile(join(output,'report-retention-failure.json'),text,{flag:'wx'});retentionFailure.markerRetained=true;}catch{retentionFailure.markerRetained=false;}
  }
  console.log(JSON.stringify({status:retentionFailure?'failed':report.status,failures:report.failureCount,error:report.error,output,cleanup:report.cleanup,cleanupStatus:report.cleanupStatus,fullReportRetained,retentionFailure}));
}
