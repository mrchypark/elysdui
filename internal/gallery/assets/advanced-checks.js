import {mount} from '/assets/ely-api.js';
import {previewMarkdown,bindMarkdownPreview} from './advanced-markdown.js';
import {checkRuntime} from './advanced-runtime-checks.js';
const checks = new Map();
let assertionCount=0;
export function assert(condition,message='Component assertion failed'){assertionCount++;if(!condition)throw new Error(message);}
export function registerChecks(family,definitions){for(const [key,check] of Object.entries(definitions)){if(checks.has(key))throw new Error(`Duplicate behavioral check: ${key}`);if(typeof check!=='function')throw new Error(`Invalid behavioral check: ${key}`);checks.set(key,{family,check});}}
// A named check executes only its scoped assertions; registration is never evidence.
export async function executeRegisteredCheck(key, context){
 const test=checks.get(key);if(!test)throw new Error(`No behavior check for ${key}`);
 assertionCount=0;await test.check(context);
 if(assertionCount===0)throw new Error(`No component-specific assertions for ${key}`);
 return {claimId:`gallery-check:${key}`,assertions:assertionCount};
}
export async function waitFor(predicate,timeout=3000){const deadline=performance.now()+timeout;while(!predicate()){if(performance.now()>deadline)throw new Error('Timed out waiting for observable component state.');await new Promise(resolve=>setTimeout(resolve,10));}}
function state(root){return JSON.stringify([...root.querySelectorAll('input,textarea,select,[aria-selected],[aria-pressed],dialog')].map(node=>[node.tagName,node.type,node.value,node.checked,node.open,node.getAttribute('aria-selected'),node.getAttribute('aria-pressed')]));}
function identifiers(root){return [root.id,...Array.from(root.querySelectorAll('[id]'),node=>node.id)];}

document.querySelector('[data-audit-run]')?.addEventListener('click',async event=>{
  event.currentTarget.disabled=true;
  const results=[];let passed=0,failed=0;
  for(const record of document.querySelectorAll('[data-audit-case]')){
    const root=record.querySelector('[data-audit-main] > [data-ely-family]'),twin=record.querySelector('[data-audit-twin] > [data-ely-family]');
    const test=checks.get(record.dataset.auditKey),actions=[],errors=[],expectedErrors=[];
    const capture=action=>{if(action.target===root)actions.push(action.detail);};
    const captureError=error=>{const message=error.detail?.error?.message||'Component error',index=expectedErrors.indexOf(message);if(index>=0)expectedErrors.splice(index,1);else errors.push(message);};
    const captureRuntimeError=event=>errors.push(event.message||event.reason?.message||'Uncaught component error');
    const started=performance.now();let result,hostCleanup;
    try{
      if(!root||!twin)throw new Error('Missing API instance.');
      await waitFor(()=>root.dataset.elyReady==='true'&&twin.dataset.elyReady==='true');
      if(!test)throw new Error(`No behavior check for ${record.dataset.auditKey}`);
      const before=state(twin),ids=identifiers(root),otherIds=new Set(identifiers(twin));
      assert(new Set(ids).size===ids.length,'Duplicate IDs in a component.');
      assert(!ids.some(id=>otherIds.has(id)),'Instances share inner IDs.');
      if(root.dataset.elyKind==='MarkdownEditor'){const unbind=bindMarkdownPreview(root),unmount=mount(root,{actions:{'preview-markdown':previewMarkdown}});hostCleanup=()=>{unbind();unmount();};}
      root.addEventListener('ely:action',capture);root.addEventListener('ely:error',captureError);
      window.addEventListener('error',captureRuntimeError);window.addEventListener('unhandledrejection',captureRuntimeError);
      assertionCount=0;
      const componentStyle=getComputedStyle(root);assert(componentStyle.fontSize==='13px'&&componentStyle.lineHeight==='20px','Components must retain the 13px/20px baseline in a host page');
      assert(componentStyle.getPropertyValue('--surface-muted').trim()===componentStyle.getPropertyValue('--color-paper').trim(),'Muted surfaces must follow their current theme');
      assert(componentStyle.getPropertyValue('--muted-foreground').trim()===componentStyle.getPropertyValue('--color-muted').trim(),'Secondary text must follow its current theme');
      if(!matchMedia('(forced-colors: active)').matches)root.querySelectorAll('select:not([multiple]):not([size])').forEach(node=>{const style=getComputedStyle(node);assert(style.appearance==='none'&&parseFloat(style.paddingInlineEnd)>=36&&style.backgroundPositionY==='50%, 50%','Dropdown arrow must be centered with reserved space after the text');});
      root.querySelectorAll('.ely-tag-field').forEach(node=>{const children=[...node.children].map(child=>child.getBoundingClientRect()).filter(rect=>rect.height);if(children.every(rect=>rect.height<=24&&rect.top===children[0].top))assert(node.getBoundingClientRect().height===28,'Single-row tag fields must use the 28px default height');});
      root.querySelectorAll('[data-ui-multi-option]').forEach(node=>{const height=node.getBoundingClientRect().height;if(height)assert(height===28,'Multiple-choice fixtures must use the 28px default height');});
      root.querySelectorAll('[data-ui-pin-slot]').forEach(input=>{const style=getComputedStyle(input),width=input.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight),rect=input.getBoundingClientRect();assert(width>=parseFloat(style.fontSize)&&rect.width===40&&rect.height===40,'PIN must show an unclipped digit in its 40px square');});
      root.querySelectorAll('.ui-calendar-days button').forEach(button=>{const style=getComputedStyle(button);assert(style.paddingLeft==='0px'&&style.paddingRight==='0px'&&style.whiteSpace==='nowrap','Calendar dates must fit narrow columns without wrapping');});
      root.querySelectorAll('[data-ui-tab][aria-selected="true"]').forEach(button=>assert(getComputedStyle(button).color===getComputedStyle(root).color,'Selected tab must keep a visible text color'));
      root.querySelectorAll('button[data-slot="button"][data-variant="default"]').forEach(button=>{const style=getComputedStyle(button);assert(style.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.color!==style.backgroundColor,'Shared primary button lost its visible foreground/background');});
      const sharedAssertions=assertionCount;
      await test.check({root,twin,actions,assert,waitFor,expectError:message=>expectedErrors.push(message)});
      const componentAssertions=assertionCount-sharedAssertions;
      assert(componentAssertions>0,'No component-specific observable behavior assertions.');
      assert(state(twin)===before,'An action changed the other instance.');
      assert(!errors.length,errors.join('; '));
      assert(!expectedErrors.length,'Expected host error was not emitted');
      result={caseId:`gallery:${record.dataset.auditName}`,claimId:`gallery-check:${record.dataset.auditKey}`,coverageLevel:['shell/SystemNotification','shell/QuickLauncher','shell/NativeMenu','shell/WindowResizeBorder'].includes(record.dataset.auditKey)?'source-note-only':'scoped-fixture-assertions',fullContractVerified:false,name:record.dataset.auditName,key:record.dataset.auditKey,status:'passed',assertions:assertionCount,componentAssertions,actions:actions.map(action=>({action:action.action,value:action.value,values:action.values?.map(([name,value])=>[name,value instanceof File?value.name:String(value).slice(0,200)])})),milliseconds:Math.round(performance.now()-started)};passed++;
    }catch(error){result={caseId:`gallery:${record.dataset.auditName}`,claimId:`gallery-check:${record.dataset.auditKey}`,fullContractVerified:false,name:record.dataset.auditName,key:record.dataset.auditKey,status:'failed',error:error.message,milliseconds:Math.round(performance.now()-started)};failed++;}
    finally{hostCleanup?.();root?.removeEventListener('ely:action',capture);root?.removeEventListener('ely:error',captureError);window.removeEventListener('error',captureRuntimeError);window.removeEventListener('unhandledrejection',captureRuntimeError);}
    results.push(result);record.dataset.auditState=result.status;record.querySelector('[data-audit-result]').value=result.status==='passed'?'Scoped assertions passed':`Failed: ${result.error}`;
    document.querySelector('[data-audit-status]').value=`${results.length} checks · ${passed} passed · ${failed} failed`;
    await new Promise(resolve=>setTimeout(resolve,0));
  }
  let runtime;try{runtime=await checkRuntime();}catch(error){runtime={name:'runtime/HostCallbacks',status:'failed',error:error.message};}
  document.querySelector('[data-audit-results]').textContent=JSON.stringify({schemaVersion:2,evidenceKind:'executed-scoped-fixture-checks',fullContractVerified:false,limitations:['Passing a fixture does not establish every property, state, event or alias contract.','Source-note fixtures verify only the displayed limitation, not alternate UI or OS integration.'],date:new Date().toISOString(),passed,failed,runtime,results},null,2);
  document.querySelector('[data-audit-status]').value+=` · Host API ${runtime.status==='passed'?'passed':'failed'}`;
  document.querySelector('[data-audit-run]').disabled=false;
});
