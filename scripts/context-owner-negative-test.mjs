import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,mkdirSync,rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {contextOwnerControls,mutateContextOwnerSource} from '../ui/gohtmx/tests/browser/context-owner-controls.mjs';

// Local causal evidence executes extracted and full production JS in a VM.
// The separate browser runner must still kill every control on both real DOMs.
const source=readFileSync('ui/gohtmx/assets/ely-api-interaction.js','utf8');
const designated={
 'context-request-dedupe':'C3.last-only equality preserves focus, geometry and descendants; null never clears',
 'context-request-precision':'C2.full-range strings and adjacent >2^53 numbers remain distinct',
 'context-request-mode':'C4.manual pointer and context-key paths return before default prevention',
 'context-request-keyboard':'C4.hidden root fallback click and ArrowDown cannot bypass manual ownership',
 'context-request-coordinates':'C5.malformed values are atomic and unconsumed; finite extremes clamp',
 'context-request-disabled':'C6.disabled requests do not consume; explicit retry works; empty root focuses panel',
 'context-request-owner':'C8.exact local target, component and owned descendants keep requests separate',
 'context-request-retained':'C9.compatible innerHTML remount preserves watermark; new seed opens',
 'context-request-cleanup':'production family + core lifecycle retains ownership across stopped, cancelled and replaced roots',
 'context-request-identity':'C12.manual/automatic/manual retains memory; observed ID change resets; live mismatch fails',
 'context-request-focus':'C7.re-request preserves first outside focus owner and existing disconnected fallback',
 'context-request-host-focusout':'production family + core lifecycle retains ownership across stopped, cancelled and replaced roots',
 'context-request-nested-menu-owner':'nested ordinary Menu keeps its own trigger placement and focus owner',
 'context-request-seed-cleanup-registration':'seed focus can synchronously stop before initialize returns without accepting stopped requests',
};
const sha=s=>createHash('sha256').update(s).digest('hex');
const supplementalControls={
 'context-request-right-host-focus':{from:'if (event.button === 2) contextPointerFocus = manual;',to:'/* Negative control: right-host focus boundary omitted. */',oracle:'manual right-host pointer focus keeps the presentation open'},
 'context-request-right-host-dismissal':{from:'contextPointerFocus?.contains(event.relatedTarget)',to:'Boolean(contextPointerFocus)',oracle:'manual right-host boundary still dismisses when focus genuinely leaves'},
};
for(const name of Object.keys(supplementalControls))designated[name]='production family + core lifecycle retains ownership across stopped, cancelled and replaced roots';
const temp=mkdtempSync(join(tmpdir(),'context-owner-controls-'));
const report={suite:'context-owner-causal-vm-controls',sourceSHA256:sha(source),controls:[],browserExecuted:false};
try{
 for(const [name,control]of Object.entries({...contextOwnerControls,...supplementalControls})){
  const mutated=mutateContextOwnerSource(source,control,name),path=join(temp,name+'.js'),resultPath=join(temp,name+'.json');writeFileSync(path,mutated);
  const result=spawnSync(process.execPath,['ui/gohtmx/tests/unit/context_owner_requests_test.mjs'],{env:{...process.env,CONTEXT_REQUEST_SOURCE:path,CONTEXT_REQUEST_REPORT:resultPath},encoding:'utf8'});
  assert.equal(result.error,undefined,`${name}: runner error`);assert.notEqual(result.status,0,`${name}: control survived`);
  const evidence=JSON.parse(readFileSync(resultPath,'utf8')),index=evidence.checks.findIndex(check=>check.status==='failed'),failed=evidence.checks[index];
  assert.equal(failed?.name,designated[name],`${name}: wrong first failing oracle`);assert.match(failed.error,/AssertionError/,`${name}: unrelated error cannot count as a kill`);
  if(supplementalControls[name])assert(failed.error.includes(control.oracle),`${name}: wrong production event-sequence assertion`);
  if(name==='context-request-cleanup')assert(failed.error.includes('stopped request must remain inert'),`${name}: wrong lifecycle phase`);
  const reviewOracle={
   'context-request-host-focusout':'manual right-host boundary still dismisses when focus genuinely leaves',
   'context-request-nested-menu-owner':'nested ordinary Menu must anchor to its own trigger',
   'context-request-seed-cleanup-registration':'seed stop must synchronously close the old panel',
  }[name];
  if(reviewOracle)assert(failed.error.includes(reviewOracle),`${name}: wrong review-regression assertion`);
  report.controls.push({name,anchorCount:1,sourceSHA256:sha(source),servedMutationSHA256:sha(mutated),designatedVMOracle:designated[name],browserOracle:control.oracle,passedPrefix:evidence.checks.slice(0,index).map(check=>check.name),firstFailure:failed,exit:result.status,status:'killed'});
  console.log(`${name}: killed by ${designated[name]}`);
 }
 report.status='passed';
}finally{mkdirSync('test-results/contracts',{recursive:true});writeFileSync('test-results/contracts/context-owner-vm-controls.json',JSON.stringify(report,null,2)+'\n');rmSync(temp,{recursive:true,force:true});}
