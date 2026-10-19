import assert from 'node:assert/strict';
import {copyCases, copyCaseIDs, copyValue, copyRequiredSources, copyRequiredBrowserPaths, copyLimitations} from './copybutton-complete-cases.mjs';
export const copySchema = 'copybutton-complete-v1';
const same = (a,b) => JSON.stringify(a) === JSON.stringify(b);
const keys = (object, expected, label) => assert.deepEqual(Object.keys(object).sort(), [...expected].sort(), label);
const finite = value => typeof value === 'number' && Number.isFinite(value);
const close = (a,b,tolerance=.3) => finite(a) && Math.abs(a-b)<=tolerance;
export function copyOracles(check) {
  const spec=copyCases.find(c=>c.id===check.id); assert(spec, 'source-owned case');
  const {raw}=check, snapshots=Object.fromEntries(raw.snapshots.map(s=>[s.name,s])), log=raw.log, result=[];
  const add=(id,pass,prerequisite=false)=>result.push({id:spec.id+'.'+id,pass:!!pass,prerequisite});
  const snap=name=>snapshots[name], root=(name,key='#copy-a')=>snap(name)?.roots[key], button=(name,key='#copy-a',index=0)=>root(name,key)?.controls[index];
  const until=name=>log.filter(row=>row.sequence<=snap(name).sequence);
  const calls=name=>until(name).filter(row=>row.type==='clipboard-call');
  const events=(name,type)=>until(name).filter(row=>row.type==='event'&&row.event===type);
  const success=name=>events(name,'ely:change').filter(e=>e.detail.copied===true);
  const count=(name,n)=>calls(name).length===n;
  const copied=(name,key='#copy-a',index=0)=>button(name,key,index)?.copied==='true';
  const clean=(name,key='#copy-a',index=0)=>button(name,key,index)?.copied===null&&button(name,key,index)?.busy===null;
  const status=(name,key='#copy-a')=>root(name,key)?.statuses.map(s=>s.text).join('');
  const icon=(name,type,key='#copy-a')=>button(name,key)?.icons.find(i=>i.name===type&&i.visible);
  const tooltip=(name,text,key='#copy-a')=>root(name,key)?.tooltips.some(t=>t.text===text);
  const native=(event,key=null)=>log.filter(r=>r.type==='input'&&r.event===event&&r.trusted&&(key===null||r.key===key));
  const last=spec.checkpoints.at(-1), initial=button('idle');
  add('mounted-fixture',root('idle')?.ready==='true'&&initial?.connected&&initial?.tag==='BUTTON'&&root('idle','#copy-b')?.ready==='true',true);
  add('clock-and-environment',raw.environment.clock===(spec.id==='real-clock'?'browser-real':'playwright-controlled')&&raw.environment.reducedMotion===(spec.reducedMotion||'no-preference')&&raw.environment.theme===(spec.theme||'light'),true);
  add('native-input-witness',native('pointerdown').length+native('keydown').length>0,true);
  add('no-form-submission',!log.some(r=>r.type==='input'&&r.event==='submit'));
  add('no-page-error',raw.errors.length===0);
  for(const name of spec.checkpoints) {
    const s=snap(name);const previous=spec.checkpoints.indexOf(name)>0?snap(spec.checkpoints[spec.checkpoints.indexOf(name)-1]).sequence:0;add(name+'.same-case-fonts-ready',log.some(r=>r.type==='operation'&&r.name==='fonts-ready'&&r.status==='loaded'&&r.sequence>previous&&r.sequence<s.sequence),true);add(name+'.snapshot-joined',log.some(r=>r.type==='checkpoint'&&r.sequence===s.sequence&&r.name===name&&r.time===s.time),true);
  }
  const clipboardCalls=log.filter(r=>r.type==='clipboard-call'), settlements=log.filter(r=>r.type==='clipboard-settle');
  for(const [index,call] of clipboardCalls.entries()) {
    const input=log.find(r=>r.type==='input'&&r.sequence===call.input);
    add('call-'+index+'.activation',input?.trusted&&input.sequence<call.sequence&&['click','keydown','keyup'].includes(input.event)&&input.control===call.control&&input.rootID===call.rootID&&input.root===call.root,true);
    add('call-'+index+'.unique-settlement',settlements.filter(r=>r.call===call.sequence).length<=1,true);
  }
  for(const settlement of settlements) add('settle-'+settlement.call+'.own-call',clipboardCalls.some(c=>c.sequence===settlement.call&&c.sequence<settlement.sequence),true);
  const consumed=new Set();
  for(const [index,event] of log.filter(r=>r.type==='event'&&r.event==='ely:action').entries()) {
    const call=clipboardCalls.find(c=>!consumed.has(c.sequence)&&c.rootID===event.detail.id&&c.root===event.target&&c.value===event.detail.value&&settlements.some(r=>r.call===c.sequence&&r.outcome==='resolve'&&r.sequence<event.sequence));
    add('action-'+index+'.after-own-resolve',!!call);add('action-'+index+'.component',event.detail.component==='buttons/CopyButton');if(call)consumed.add(call.sequence);
  }
  const changedActions=new Set();
  for(const [index,event] of log.filter(r=>r.type==='event'&&r.event==='ely:change'&&r.detail.copied===true).entries()) {
    const action=log.find(r=>r.type==='event'&&r.event==='ely:action'&&!changedActions.has(r.sequence)&&r.sequence<event.sequence&&r.target===event.target&&r.detail.id===event.detail.id&&r.detail.value===event.detail.value);
    add('change-'+index+'.one-own-action',!!action&&event.detail.name==='copy'&&event.detail.component==='buttons/CopyButton'&&event.detail.error===null);if(action)changedActions.add(action.sequence);
  }
  const attempt=(from,to,key='#copy-a',index=0)=>{
    const expected=button(from,key,index)?.token;
    add(to+'.physical-activation-attempt',log.some(r=>r.type==='input'&&r.trusted&&r.event==='click'&&r.control===expected&&r.sequence>snap(from).sequence&&r.sequence<snap(to).sequence),true);
    const intended=clipboardCalls.find(c=>c.control===expected&&c.sequence>snap(from).sequence&&c.sequence<snap(to).sequence);
    if(intended)add(to+'.intended-settlement-witness',settlements.some(r=>r.call===intended.sequence),true);
  };
  if(spec.id.startsWith('appearance-'))attempt('focus','copied');
  else if(spec.id.startsWith('activation-')||['reduced-motion','cancelled-action','host-error','repeat-initialization','real-clipboard','real-clock','missing-icon','narrow-zoom'].includes(spec.id))attempt('idle','copied');
  else if(['exact-timing','repeat-lockout'].includes(spec.id)){attempt('idle','pending');attempt('deadline','replayed');}
  else if(spec.id.startsWith('failure-')){attempt('idle','failed');attempt('failed','retry');}
  else if(spec.id==='empty-value')attempt('idle','copied','#copy-empty');
  else if(spec.id==='captured-payload')attempt('idle','pending');
  else if(spec.id.startsWith('callback-'))attempt('idle','returned');
  else if(spec.id==='pending-rebind'){attempt('idle','pending');attempt('settled','fresh');}
  else if(spec.id.startsWith('child-')){attempt('idle','pending');attempt('settled','fresh',spec.operation==='moved'?'#copy-b':'#copy-a',spec.operation==='moved'?1:0);}
  else if(spec.id.startsWith('htmx-')){attempt('idle','active');attempt('settled','fresh');}
  else if(spec.id==='same-node-remount'){attempt('idle','pending');attempt('settled','fresh');}
  else if(spec.id==='moved-copied'){attempt('idle','old-copied');attempt('moved','fresh','#copy-b',1);}
  else if(spec.id==='tab-order')attempt('shift-tab','copied');
  else if(spec.id==='explicit-override')attempt('idle','copied','#copy-override');
  else if(spec.id==='adapter')attempt('idle','copied','#copy-adapter');
  const checkSuccess=(name,value=copyValue,key='#copy-a',action='copy')=>{
    const actions=events(name,'ely:action'),changes=success(name),identity=root('idle',key)?.id;
    add(name+'.one-write',count(name,1)); add(name+'.exact-value',same(calls(name).map(c=>c.value),[value]));
    add(name+'.one-action',actions.length===1&&actions[0].detail.value===value&&actions[0].detail.action===action&&actions[0].detail.id===identity);
    add(name+'.one-change',events(name,'ely:change').length===1&&changes.length===1&&changes[0].detail.value===value&&changes[0].detail.name==='copy'&&changes[0].detail.id===identity&&actions[0]?.sequence<changes[0].sequence);
    add(name+'.copied',copied(name,key)); add(name+'.not-busy',button(name,key)?.busy===null);
    add(name+'.polite-single-status',root(name,key)?.statuses.length===1&&root(name,key).statuses[0].live==='polite'&&status(name,key)==='Copied');
  };
  const checkPresentation=(name,zoom=1)=>{
    const b=button(name),check=icon(name,'check');
    add(name+'.check-visible',!!check&&!icon(name,'copy'));
    add(name+'.check-size',check&&close(check.rect.width,14*zoom)&&close(check.rect.height,14*zoom));
    add(name+'.success-color',check&&check.style.color===root(name).themeSuccess);
    add(name+'.stable-square',close(b?.rect.width,24*zoom)&&close(b?.rect.height,24*zoom)&&close(b?.rect.width,initial.rect.width)&&close(b?.rect.height,initial.rect.height));
    add(name+'.copied-tooltip',tooltip(name,'Copied'));
    add(name+'.temporary-unavailable',b?.ariaDisabled==='true'&&b?.disabled===false);
  };
  const checkAnimation=(name,reduced=false)=>{
    const b=button(name),owner=root(name),ownCall=[...calls(name)].reverse().find(c=>c.control===b?.token&&c.root===owner?.token&&settlements.some(r=>r.call===c.sequence&&r.outcome==='resolve'&&r.sequence<snap(name).sequence));
    const starts=until(name).filter(r=>r.type==='animation'&&r.event==='animationstart'&&r.icon==='check'&&r.control===b?.token&&r.root===owner?.token&&r.call===ownCall?.sequence&&settlements.some(s=>s.call===r.call&&s.outcome==='resolve'&&s.sequence<r.sequence));
    const animations=name==='replayed'?starts.flatMap(r=>r.animations):[...(icon(name,'check')?.animations||[]),...starts.flatMap(r=>r.animations)];
    const a=animations.find(a=>a.frames?.length>=2),duration=Number(a?.timing?.duration);
    const easing=(a?.timing?.easing==='linear'?a?.frames?.[0]?.easing:a?.timing?.easing)||'',cubic=easing.match(/^cubic-bezier\(([^)]+)\)$/)?.[1].split(',').map(Number);
    add(name+'.rotation-animation',(reduced&&!a)||!!a&&a.frames[0].transform==='rotate(-0.6rad)'&&['rotate(0rad)','rotate(0deg)','rotate(0)'].includes(a.frames.at(-1).transform));
    add(name+'.motion-duration',reduced?(!a||(duration>=0&&duration<=1)):duration===120);
    add(name+'.motion-runs',(reduced&&!a)||['running','finished'].includes(a?.playState)&&finite(a.currentTime)&&a.currentTime>=0);
    add(name+'.cubic-ease-out',(reduced&&!a)||cubic&&close(cubic[0],1/3,.001)&&cubic[1]===1&&close(cubic[2],2/3,.001)&&cubic[3]===1);
  };
  if(spec.id.startsWith('appearance-')) {
    add('default-type-and-name',initial.type==='button'&&initial.pressed===null&&raw.aria.idle.includes('button "Copy"')&&(initial.ariaLabel||initial.text||initial.title||'').trim()==='Copy');
    add('default-icon-only',initial.visibleText===''); add('default-square',close(initial.rect.width,24)&&close(initial.rect.height,24));
    add('default-radius',close(parseFloat(initial.style.borderRadius),6)); add('default-nonshrinking',initial.style.flexShrink==='0');
    add('default-ghost',initial.style.backgroundColor==='rgba(0, 0, 0, 0)'&&initial.style.borderColor==='rgba(0, 0, 0, 0)'&&parseFloat(initial.style.borderWidth)===1);
    add('default-foreground',initial.style.color===root('idle').themeForeground);
    add('default-centered',initial.style.alignItems==='center'&&(initial.style.justifyContent==='center'||initial.style.justifyItems==='center'));
    add('pointer-affordance',initial.style.cursor==='pointer');
    const idleIcon=icon('idle','copy'); add('default-copy-icon',idleIcon&&idleIcon.hidden==='true'&&close(idleIcon.rect.width,12)&&close(idleIcon.rect.height,12));
    add('hover-tooltip',tooltip('hover','Copy')); add('focus-tooltip',tooltip('focus','Copy'));
    add('hover-treatment',button('hover').style.backgroundColor!==initial.style.backgroundColor);
    add('pressed-treatment',button('pressed').style.backgroundColor!==button('hover').style.backgroundColor);
    add('keyboard-focus',button('focus').focused&&button('focus').focusVisible&&((parseFloat(button('focus').style.outlineWidth)>0&&button('focus').style.outlineStyle!=='none')||button('focus').style.boxShadow!==initial.style.boxShadow||button('focus').style.borderColor!==initial.style.borderColor));
    checkSuccess('copied'); checkPresentation('copied'); checkAnimation('copied');
    add('safe-focus',button('copied').focused&&button('copied').token===initial.token&&button('reset').focused);
    add('restored',clean('reset')&&!!icon('reset','copy')&&tooltip('reset','Copy')&&status('reset')==='');
  } else if(spec.id.startsWith('activation-')) {
    checkSuccess('copied'); add('restored',clean('reset')&&status('reset')==='');
    const expected=spec.input==='pointer'?native('pointerdown'):native('keydown',spec.input==='enter'?'Enter':' ');
    add('intended-native-input',expected.some(e=>(e.control||e.target)===initial.token),true);
    add('no-scroll',snap('idle').scrollY===snap('copied').scrollY);
    if(spec.input!=='pointer') add('focus-retained',button('copied').focused&&button('reset').focused);
  } else if(spec.id==='cancelled-pointer') {
    add('cancelled-press-witness',native('pointerdown').some(e=>(e.control||e.target)===initial.token)&&native('pointerup').some(e=>e.target!==initial.token),true);
    add('right-button-witness',native('contextmenu').some(e=>e.button===2),true);
    add('no-write',count(last,0)); add('no-action',events(last,'ely:action').length===0);
  } else if(['exact-timing','repeat-lockout','reduced-motion'].includes(spec.id)) {
    if(snap('pending')) {add('pending-witness',count('pending',1)&&log.some(r=>r.type==='clipboard-call'&&r.mode==='pending'),true);add('pending-truth',!copied('pending')&&button('pending').busy==='true'&&events('pending','ely:action').length===0);}
    if(snap('delayed')) add('no-early-success',!copied('delayed')&&events('delayed','ely:action').length===0&&snap('delayed').time-snap('pending').time===2000);
    if(snap('repeated-pending')) {add('pending-repeat-attempt',native('keydown','Enter').length>=1&&native('keydown',' ').length>=1,true);add('pending-locked',count('repeated-pending',1));}
    checkSuccess('copied'); if(spec.id==='reduced-motion'){checkPresentation('copied');checkAnimation('copied',true);}else checkAnimation('copied');
    const resolution=settlements.find(r=>r.outcome==='resolve');
    add('success-clock-origin',resolution&&resolution.time===snap('copied').time,true);
    add('before-deadline-witness',snap('before-deadline').time-snap('copied').time===1399,true);
    add('deadline-witness',snap('deadline').time-snap('copied').time===1400,true);
    if(spec.id==='exact-timing'||spec.id==='reduced-motion'){const transform=icon('before-deadline','check')?.style.transform;add('rotation-finishes',!!transform&&['none','matrix(1, 0, 0, 1, 0, 0)','rotate(0rad)','rotate(0deg)'].includes(transform));}
    add('holds-to-1399',copied('before-deadline'));add('resets-at-1400',clean('deadline')&&status('deadline')==='');
    if(snap('repeated-copied')) {add('copied-repeat-attempt',native('keydown','Enter').length>=2&&native('keydown',' ').length>=2,true);add('copied-locked',count('repeated-copied',1)&&events('repeated-copied','ely:action').length===1);}
    if(snap('replayed')) {add('fresh-cycle',count('replayed',2)&&events('replayed','ely:action').length===2&&copied('replayed'));checkAnimation('replayed');}
  } else if(spec.id.startsWith('failure-')) {
    add('failure-mode-witness',log.some(r=>r.type==='mode'&&r.value===spec.failure),true);
    if(spec.failure!=='missing')add('failure-settlement-witness',log.some(r=>r.type==='clipboard-settle'&&r.outcome===spec.failure),true);
    add('no-false-success',!copied('failed')&&!icon('failed','check')&&events('failed','ely:action').length===0&&success('failed').length===0);
    add('failure-feedback',status('failed')==='Copy failed'&&button('failed').busy===null&&root('failed').statuses[0].live==='polite');
    const changes=events('failed','ely:change');add('one-failure-change',changes.length===1&&changes[0].detail.id===root('idle').id&&changes[0].target===root('idle').token&&changes[0].detail.component==='buttons/CopyButton'&&changes[0].detail.name==='copy'&&changes[0].detail.value===copyValue&&changes[0].detail.copied===false&&changes[0].detail.error==='clipboard-unavailable');
    add('retry-success',copied('retry')&&events('retry','ely:action').length===1&&success('retry').length===1&&calls('retry').length===(spec.failure==='missing'?1:2));
  } else if(spec.id==='empty-value') checkSuccess('copied','','#copy-empty');
  else if(spec.id==='captured-payload') {
    add('pending-mutation-witness',log.some(r=>r.type==='operation'&&r.name==='change-payload'&&r.beforeValue===copyValue&&r.afterValue==='changed'&&r.beforeAction==='copy'&&r.afterAction==='changed-action'),true);
    checkSuccess('copied');
  } else if(spec.id==='cancelled-action') {checkSuccess('copied');add('cancellation-witness',log.some(r=>r.type==='operation'&&r.name==='cancel-action'&&r.defaultPrevented),true);}
  else if(spec.id==='host-error') {checkSuccess('copied');add('host-threw',events('copied','ely:error').length===1&&log.some(r=>r.type==='host'&&r.name==='throw'),true);}
  else if(spec.id==='disabled') {
    add('disabled-root-and-item',button('idle','#copy-disabled')?.disabled&&button('idle','#copy-items',2)?.disabled);
    add('synthetic-attempt-witness',same(log.filter(r=>r.type==='input'&&r.event==='click'&&!r.trusted).map(r=>r.control).sort((a,b)=>a-b),[button('idle','#copy-disabled').token,button('idle','#copy-items',2).token].sort((a,b)=>a-b)),true);
    add('no-disabled-write',count('attempted',0)&&events('attempted','ely:action').length===0&&events('attempted','ely:change').length===0);
    add('disabled-preserved',button('reset','#copy-disabled')?.disabled&&button('reset','#copy-items',2)?.disabled);
  } else if(spec.id.endsWith('-independent')) {
    const items=spec.id==='items-independent',a=items?'#copy-items':'#copy-a',b=items?'#copy-items':'#copy-b',bi=items?1:0;
    add('both-pending',count('pending',2)&&button('pending',a).busy==='true'&&button('pending',b,bi).busy==='true',true);
    add('both-settlement-witnesses',calls('pending').every(c=>settlements.some(r=>r.call===c.sequence)),true);
    add('opposite-resolution',log.filter(r=>r.type==='clipboard-settle').map(r=>r.call).join(',')===calls(last).map(r=>r.sequence).reverse().join(','),true);
    add('b-only',copied('b-first',b,bi)&&!copied('b-first',a));add('both-copied',copied('a-second',a)&&copied('a-second',b,bi));
    add('independent-deadlines',!copied('b-reset',b,bi)&&copied('b-reset',a)&&!copied('a-reset',a));
    add('status-owner',items?status('a-second',a)==='Copied'&&status('b-reset',a)==='':status('b-reset',a)==='Copied'&&status('b-reset',b)==='');
    add('exact-independent-events',events(last,'ely:action').length===2&&success(last).length===2);
  } else if(spec.id.startsWith('callback-')) {
    add('callback-positive',log.some(r=>r.type==='host'&&r.name===spec.operation),true);
    add('same-node-binding',button('returned').token===initial.token&&root('returned').token===root('idle').token,true);
    add('no-trailing-change',success('returned').length===0&&log.filter(r=>r.type==='host'&&r.name==='new-change').length===0);
    add('no-stale-reset',same(button('returned').copied,button('deadline').copied));
  } else if(spec.id==='pending-rebind') {
    add('pending-positive',count('pending',1)&&button('pending').busy==='true',true);
    add('connected-rebind-positive',log.some(r=>r.type==='operation'&&r.name==='rebind'&&r.connected&&r.before===r.after)&&button('rebound').token===initial.token,true);
    add('old-completion-silent',events('settled','ely:action').length===0&&events('settled','ely:change').length===0&&!copied('settled'));
    add('fresh-owner-usable',calls('fresh').length===2&&events('fresh','ely:action').length===events('settled','ely:action').length+1&&copied('fresh'));
  } else if(spec.id.startsWith('child-')) {
    const op=log.find(r=>r.type==='operation'&&r.name===spec.operation);
    add('ownership-change-positive',op&&op.oldControl===initial.token&&op.beforeParent!==op.afterParent&&op.newControl>0,true);
    add('old-completion-silent',events('settled','ely:action').length===0&&events('settled','ely:change').length===0&&!copied('settled'));
    add('fresh-owner-usable',calls('fresh').length===2&&events('fresh','ely:action').length===events('settled','ely:action').length+1&&copied('fresh',spec.operation==='moved'?'#copy-b':'#copy-a',spec.operation==='moved'?1:0));
    add('fresh-target-attempt',native('click').some(e=>e.sequence>snap('settled').sequence&&(e.control||e.target)===(spec.operation==='moved'?initial.token:button('changed').token)),true);
    if(spec.operation==='moved')add('moved-child-not-marked',root('settled','#copy-b').controls.every(b=>b.copied===null));
  } else if(spec.id.startsWith('htmx-')) {
    const before=button('active'),after=button('swapped'),htmx=log.filter(r=>r.type==='event'&&r.event.startsWith('htmx:'));
    add('real-swap-positive',htmx.some(r=>r.event==='htmx:before:swap'&&r.tasks.some(t=>t.style===(spec.swap==='inner'?'innerHTML':'outerHTML')))&&htmx.some(r=>r.event==='htmx:after:swap'),true);
    add('replacement-positive',before.token!==after.token&&root('swapped').id===root('idle').id&&root('swapped').ready==='true',true);
    add('active-phase-positive',spec.phase==='pending'?before.busy==='true'&&count('active',1):copied('active')&&success('active').length===1,true);
    add('old-completion-silent',events('settled','ely:action').length===events('active','ely:action').length&&events('settled','ely:change').length===events('active','ely:change').length&&clean('settled'));
    add('replacement-usable',calls('fresh').length===2&&events('fresh','ely:action').length===events('active','ely:action').length+1&&copied('fresh'));
  } else if(spec.id==='moved-copied') {
    const moved=button('moved','#copy-b',1);add('physical-move-positive',moved?.token===initial.token&&button('moved').token!==initial.token&&log.some(r=>r.type==='operation'&&r.name==='move-copied'&&r.beforeParent!==r.afterParent&&r.connected),true);
    add('new-owner-attempt',native('click').some(e=>e.sequence>snap('moved').sequence&&(e.control||e.target)===initial.token&&e.rootID==='copy-b'),true);
    add('new-owner-write',calls('fresh').length===2&&events('fresh','ely:action').at(-1)?.detail.id==='copy-b'&&copied('fresh','#copy-b',1));
    add('old-reset-cannot-clear-new',copied('old-deadline','#copy-b',1));add('new-deadline-reset',!copied('new-deadline','#copy-b',1));
    add('deadline-witnesses',snap('old-deadline').time-snap('old-copied').time===1400&&snap('new-deadline').time-snap('fresh').time===1400,true);
  } else if(spec.id==='same-node-remount') {
    add('remount-positive',root('remounted').token===root('idle').token&&button('remounted').token===initial.token&&log.some(r=>r.type==='operation'&&r.name==='remount'),true);
    add('old-completion-silent',events('settled','ely:action').length===0&&events('settled','ely:change').length===0&&clean('settled'));
    add('fresh-mount-usable',count('fresh',2)&&events('fresh','ely:action').length===1&&copied('fresh')&&clean('reset'));
  } else if(spec.id==='repeat-initialization') {
    checkSuccess('copied');add('repeat-start-witness',log.some(r=>r.type==='operation'&&r.name==='repeat-start'),true);
    add('initialization-preserves',button('reinitialized').token===initial.token&&copied('reinitialized')&&count('reinitialized',1)&&events('reinitialized','ely:action').length===1);
    add('original-deadline',snap('deadline').time-snap('copied').time===1400&&clean('deadline'));
  } else if(spec.id==='adapter') {
    const b=button('idle','#copy-adapter'); add('adapter-rendered',b&&root('idle','#copy-adapter').ready==='true',true);
    add('caller-label',(b?.ariaLabel||b?.text)==='Copy adapter text'&&b?.text==='Copy adapter text');
    checkSuccess('copied',copyValue,'#copy-adapter');add('adapter-disabled',button('disabled','#copy-adapter-disabled')?.disabled&&count('disabled',1));
  } else if(spec.id==='tab-order') {
    add('native-tab-positive',native('keydown','Tab').length===3,true);
    add('tab-order',button('tab').focused&&button('shift-tab').focused);
    checkSuccess('copied');add('no-space-scroll',snap('shift-tab').scrollY===snap('copied').scrollY);add('focus-retained',button('copied').focused&&button('reset').focused);
  } else if(spec.id==='explicit-override') {
    const b=button('idle','#copy-override');add('explicit-caller-label',b?.ariaLabel==='Copy the override value'&&b?.text==='Copy override');
    add('explicit-caller-style',b?.variant==='outline'&&b?.size==='sm');checkSuccess('copied',copyValue,'#copy-override','custom-copy');
  } else if(spec.id==='real-clipboard') {
    checkSuccess('copied');const read=log.find(r=>r.type==='operation'&&r.name==='real-read');
    add('native-clipboard-positive',clipboardCalls.length===1&&clipboardCalls[0].mode==='real'&&read?.secure===true,true);
    add('real-roundtrip',read?.value===copyValue);
  } else if(spec.id==='real-clock') {
    checkSuccess('copied');const settled=settlements.find(r=>r.outcome==='resolve');
    add('real-clock-before-positive',settled&&snap('before-deadline').time-settled.time>=950&&snap('before-deadline').time-settled.time<1400,true);
    add('real-clock-after-positive',settled&&snap('reset').time-settled.time>=1400&&snap('reset').time-settled.time<3000,true);
    add('real-duration',copied('before-deadline')&&clean('reset'));
  } else if(spec.id==='missing-icon') {
    add('missing-icon-injection',log.some(r=>r.type==='operation'&&r.name==='icon-request-failed'&&r.path==='/assets/ely/icons/copy.svg'&&r.error==='net::ERR_FAILED'),true);
    add('fallback-accessible-name',raw.aria.idle.includes('button "Copy"')&&(initial.ariaLabel||initial.text||initial.title||'').trim()==='Copy');checkSuccess('copied');
  } else if(spec.id==='narrow-zoom') {
    checkSuccess('copied');checkPresentation('copied',2);add('zoom-positive',raw.environment.zoom===2&&raw.environment.viewport.width===320,true);
    add('no-layout-jump',close(button('reset').rect.width,initial.rect.width)&&close(button('reset').rect.height,initial.rect.height));
  } else throw new Error('No source-owned oracle for '+spec.id);
  return result;
}
export function validateCopyRaw(check) {
  keys(check,['id','raw','oracles','status'],'exact check keys');
  const spec=copyCases.find(c=>c.id===check.id);assert(spec,'known case');
  keys(check.raw,['snapshots','log','errors','environment','aria','screenshots'],'exact raw keys');
  const raw=check.raw;assert.deepEqual(raw.snapshots.map(s=>s.name),spec.checkpoints,'exact checkpoints');
  assert.deepEqual(Object.keys(raw.aria),spec.checkpoints,'exact accessibility captures');
  assert.deepEqual(Object.keys(raw.screenshots),spec.checkpoints,'exact screenshot inventory');
  assert(Array.isArray(raw.log)&&raw.log.length,'raw log required');assert.deepEqual(raw.errors,[],'unexpected browser diagnostics invalidate evidence');
  keys(raw.environment,['clock','reducedMotion','theme','zoom','viewport'],'exact environment');
  const rowFields={mode:['value'],input:['event','trusted','key','button','target','targetID','rootID','root','control','active','defaultPrevented'],event:['event','rootID','target','detail','tasks'],'clipboard-call':['value','input','control','rootID','root','active','mode'],'clipboard-settle':['call','outcome'],checkpoint:['name'],animation:['event','control','root','call','pseudo','icon','animations']};
  const operationFields={
    'change-payload':['beforeValue','beforeAction','afterValue','afterAction'],'cancel-action':['defaultPrevented'],rebind:['before','after','connected'],
    moved:['oldControl','newControl','beforeParent','afterParent','connected'],replaced:['oldControl','newControl','beforeParent','afterParent','connected'],
    'move-copied':['control','beforeParent','afterParent','connected'],remount:['token','connected'],'repeat-start':['root'],'real-read':['value','secure'],
    'icon-route-abort':['path'],'icon-request-failed':['path','error'],'fonts-ready':['status'],
  };
  for(const [i,row] of raw.log.entries()) {
    assert.equal(row.sequence,i+1,'unbroken raw sequence');assert(finite(row.time));if(i)assert(row.time>=raw.log[i-1].time,'monotonic raw observation time');
    let fields=rowFields[row.type];
    if(row.type==='operation'){assert(operationFields[row.name],'known operation');fields=['name',...operationFields[row.name]];}
    if(row.type==='host'){assert(['throw','teardown','rebind','old-action','new-action','new-change'].includes(row.name),'known host observation');fields=['name',...(['new-action','new-change'].includes(row.name)?['value']:[])];}
    assert(fields,'known raw event');keys(row,['sequence','time','type',...fields],'exact raw event fields');
    if(row.type==='animation'){assert(['animationstart','animationend'].includes(row.event));assert(finite(row.control)&&finite(row.root)&&(row.call===null||finite(row.call)));assert(typeof row.pseudo==='string'&&typeof row.icon==='string'&&Array.isArray(row.animations));for(const animation of row.animations){keys(animation,['id','currentTime','playState','timing','frames'],'animation start fields');assert(Array.isArray(animation.frames));}}
    if(row.type==='input')assert(typeof row.trusted==='boolean'&&typeof row.rootID==='string');
    if(row.type==='event'){keys(row.detail,['id','component','action','name','value','copied','error'],'event detail fields');assert(Array.isArray(row.tasks));for(const task of row.tasks)keys(task,['target','style'],'HTMX task');}
  }
  for(const s of raw.snapshots) {
    keys(s,['name','sequence','time','active','activeID','scrollY','roots'],'snapshot schema');assert(finite(s.sequence)&&finite(s.time));
    assert(raw.log.some(r=>r.type==='checkpoint'&&r.sequence===s.sequence&&r.name===s.name),'snapshot witness required');
    keys(s.roots,['#copy-a','#copy-b','#copy-empty','#copy-disabled','#copy-items','#copy-override','#copy-adapter','#copy-adapter-disabled'],'exact fixture root inventory');
    for(const r of Object.values(s.roots)) {
      assert(r,'all fixture roots observed');keys(r,['token','id','ready','connected','controls','statuses','tooltips','themeSuccess','themeForeground'],'root fields');
      assert(Array.isArray(r.controls)&&r.controls.length&&Array.isArray(r.statuses)&&Array.isArray(r.tooltips));
      for(const status of r.statuses)keys(status,['text','live','role'],'status fields');
      for(const tip of r.tooltips){keys(tip,['id','text','rect'],'tooltip fields');keys(tip.rect,['x','y','width','height'],'tooltip rect');}
      for(const b of r.controls){
        keys(b,['token','id','tag','type','variant','size','value','text','ariaLabel','title','describedBy','pressed','disabled','ariaDisabled','busy','copied','focused','focusVisible','visible','connected','rect','style','icons','visibleText'],'control fields');
        assert(finite(b.token)&&b.token>0);keys(b.rect,['x','y','width','height'],'control rect');assert(Object.values(b.rect).every(finite));
        for(const key of ['color','backgroundColor','borderColor','borderWidth','borderRadius','outlineColor','outlineWidth','outlineStyle','boxShadow','alignItems','justifyContent','justifyItems','opacity','cursor','flexShrink','display','width','height','transform','animationName','animationDuration','animationTimingFunction','transitionDuration','fontSize','maskImage','content'])assert(typeof b.style[key]==='string','required computed style '+key);
        assert(Array.isArray(b.icons));for(const icon of b.icons){keys(icon,['name','hidden','visible','rect','style','animations'],'icon fields');assert(Array.isArray(icon.animations));for(const animation of icon.animations){keys(animation,['id','currentTime','playState','timing','frames'],'animation fields');assert(Array.isArray(animation.frames));}}
      }
    }
    assert(typeof raw.aria[s.name]==='string'&&raw.aria[s.name].length>0);
    const screenshot=raw.screenshots[s.name];keys(screenshot,['path','sha256','bytes'],'screenshot receipt');assert(/^[a-f0-9]{64}$/.test(screenshot.sha256)&&screenshot.bytes>0&&screenshot.path===`screenshots/${spec.id}-${s.name}.png`);
  }
}
export function verifyCopyEvidence(report,trusted,exitCode) {
  keys(report,['schema','runToken','revision','tree','dirty','sourceFiles','assets','fixtures','toolchain','dependencyProof','caseInventory','limitations','browserVersion','checks','responses','errors','status','stage'],'report schema');
  assert.equal(report.schema,copySchema);assert.equal(report.stage,'complete','no early exit');
  assert(/^[0-9a-f-]{36}$/.test(trusted.runToken),'independent run token required');
  for(const key of ['runToken','revision','tree','dirty','sourceFiles','assets','fixtures','toolchain','dependencyProof'])assert.deepEqual(report[key],trusted[key],'current-source/run binding '+key);
  assert.equal(report.dirty,'','clean source required');assert(/^[a-f0-9]{40}$/.test(report.revision)&&/^[a-f0-9]{40}$/.test(report.tree));
  for(const path of copyRequiredSources)assert(/^[a-f0-9]{64}$/.test(trusted.sourceFiles[path]||''),'mandatory source '+path);
  assert.deepEqual(report.caseInventory,copyCaseIDs);assert.deepEqual(report.checks.map(c=>c.id),copyCaseIDs,'no missing duplicate foreign or reordered cases');
  assert.deepEqual(report.limitations,copyLimitations,'exact named limitation boundary');assert(typeof report.browserVersion==='string'&&report.browserVersion.length>0);
  assert.deepEqual(report.errors,[],'no harness errors');
  const oracles=[];for(const check of report.checks) {
    validateCopyRaw(check);const observed=copyOracles(check);assert.deepEqual(check.oracles,observed,'raw rederivation '+check.id);
    assert.equal(check.status,observed.every(o=>o.pass)?'passed':'failed','cached case status');
    for(const o of observed.filter(o=>o.prerequisite))assert(o.pass,'omitted positive witness '+o.id);
    oracles.push(...observed);
  }
  assert.equal(new Set(oracles.map(o=>o.id)).size,oracles.length,'unique assertion IDs');
  const responseKeys=new Set();for(const response of report.responses) {
    keys(response,['caseID','path','status','bytes','sha256','method','htmx'],'response schema');
    assert(copyCaseIDs.includes(response.caseID),'response known case');const metadata=report.assets[response.path]||report.fixtures[response.path];assert(metadata,'foreign response '+response.path);
    assert.equal(response.status,200);assert.equal(response.method,'GET');assert.equal(response.bytes,metadata.bytes);assert.equal(response.sha256,metadata.servedSHA256);
    const key=response.caseID+'\0'+response.path;assert(!responseKeys.has(key),'duplicate response');responseKeys.add(key);
  }
  for(const spec of copyCases) {
    for(const path of copyRequiredBrowserPaths)assert(responseKeys.has(spec.id+'\0'+path),'missing received-byte witness '+spec.id+path);
    if(spec.id!=='missing-icon')assert(responseKeys.has(spec.id+'\0/assets/ely/icons/copy.svg'),'actual copy icon response');
    if(spec.swap) {const proof=report.responses.find(r=>r.caseID===spec.id&&r.path==='/fragment/'+spec.swap);assert(proof&&proof.htmx==='true','actual HTMX response witness');}
  }
  const failed=oracles.filter(o=>!o.pass).map(o=>o.id),status=failed.length?'failed':'passed';
  assert.equal(report.status,status,'cached aggregate status');assert.equal(exitCode,status==='passed'?0:1,'raw process exit');
  return {schema:copySchema,status,failedAssertions:failed,cases:report.checks.length,assertions:oracles.length,limitations:copyLimitations};
}
// No causal acceptance path exists in this baseline. Future controls must pass
// verifyCopyEvidence first and use a fixed source-owned intended-failure list.
