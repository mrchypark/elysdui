import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile} from 'node:fs/promises';
import {assertEventLoggerPublicState,requestedStateContract,runRequestedStateActions} from './visual-state-audit-drivers.mjs';
import {registeredOutcomesEqual} from './visual-state-audit-instrument.mjs';

function fixture(stage){
  const rawEvents=[
    {type:'pointermove',x:10,y:12,timeStamp:1000,isTrusted:false},
    {type:'pointermove',x:11,y:13,timeStamp:1004,isTrusted:false},
    {type:'keydown',key:'K',ctrlKey:true,timeStamp:1013,isTrusted:false},
    {type:'wheel',deltaX:0,deltaY:4,deltaMode:1,timeStamp:1027,isTrusted:false},
    ...Array.from({length:55},(_,index)=>({type:'keydown',key:String(index),ctrlKey:false,timeStamp:1030+index*.37,isTrusted:false})),
  ];
  const count={'coalesce-pointer':2,'capture-consumed-key':3,'wheel-units':4,'retain-fifty-keys':59}[stage];
  rawEvents.length=count;
  const row=(time,message)=>({time,message,text:time+message});
  const rows=stage==='retain-fifty-keys'
    ?Array.from({length:50},(_,index)=>row(`+${((30+(54-index)*.37)/1000).toFixed(2)}s`,`key down ${54-index}`))
    :[...(count>=4?[row('+0.03s','wheel 0, 4 lines')]:[]),...(count>=3?[row('+0.01s','key down ctrl+K')]:[]),row('+0.00s','move to 11, 13 ×2')];
  return {initialEmpty:true,rawEvents,rows,consumedKeys:count>=3?1:0,bubbledKeys:count===59?55:0};
}

test('EventLogger finite contract pins the actual first-event origin and distinct requested-state scope',async()=>{
  const contract=requestedStateContract('tooling/EventLogger');
  assert.equal(contract.kind,'EventLogger');assert.equal(contract.requestedStateOnly,true);
  assert.deepEqual(contract.steps.map(step=>step.id),['coalesce-pointer','capture-consumed-key','wheel-units','retain-fifty-keys']);
  assert(contract.steps.every(step=>step.source.provenance.includes('ely-api-native-tooling.js')));
  assert(contract.steps.every(step=>step.event==='synthetic public DOM event via Playwright'));
  assert.match(contract.scope,/not per-event pixel coverage/);
  const source=await readFile(new URL('../../assets/ely-api-native-tooling.js',import.meta.url),'utf8');
  assert.match(source,/if\(target\)\{const rows=\[\];let start=null;/);
  assert.match(source,/start\?\?=e\.timeStamp;recordInput\(rows,\{kind,message\},Math\.max\(0,e\.timeStamp-start\)\)/);
  assert.match(source,/\(row\.time\/1000\)\.toFixed\(2\)/);
  assert.match(source,/rows\.length=Math\.min\(50,rows\.length\)/);
  assert.match(runRequestedStateActions.toString(),/assertEventLoggerPublicState\(stage,observation\)/);
  assert.match(runRequestedStateActions.toString(),/await fresh\(\)/,'Exact independent twin comparison remains in the driver path');
  assert.match(runRequestedStateActions.toString(),/removeEventListener\('keydown',stop\)/,'Consumed-key listener is removed in finally');
});

test('EventLogger asserts exact rows and rounded observed timestamps without changing the raw evidence',()=>{
  for(const stage of ['coalesce-pointer','capture-consumed-key','wheel-units','retain-fifty-keys']){
    const observation=fixture(stage),before=structuredClone(observation),proof=assertEventLoggerPublicState(stage,observation);
    assert.deepEqual(observation,before);assert.deepEqual(proof.rawEvents,before.rawEvents);
    assert.equal(proof.timestampOrigin,1000);
    assert.match(proof.eventProvenance,/trusted physical input is not established/);
  }
  const reference={initial:{},finalTwin:{},result:{checkResult:{},actions:[],hostEvents:[],finalState:{text:'+0.10s key down 54'}}};
  const traced=structuredClone(reference);traced.result.finalState.text='+0.06s key down 54';
  assert.equal(registeredOutcomesEqual(reference,traced),false,'Finite timestamp semantics never normalize the global exact trace oracle');
});

test('EventLogger rejects unobservable origins, altered timing, coalescing, payloads, retention and consumed-key failures',()=>{
  for(const mutate of [
    observation=>{observation.initialEmpty=false;},
    observation=>{observation.rawEvents[0].timeStamp=NaN;},
    observation=>{observation.rawEvents[0].timeStamp=-1;},
    observation=>{observation.rawEvents[5].timeStamp=0;},
    observation=>{observation.rawEvents[3].deltaMode=0;},
    observation=>{observation.rawEvents[2].ctrlKey=false;},
    observation=>{observation.rawEvents[2].isTrusted=true;},
    observation=>{observation.rawEvents[1].x=12;},
    observation=>{observation.rawEvents.pop();},
    observation=>{observation.rows.pop();},
    observation=>{observation.rows.reverse();},
    observation=>{observation.rows[0].time='+0.06s';},
    observation=>{observation.rows[0].message='key down 53';},
    observation=>{observation.consumedKeys=0;},
    observation=>{observation.bubbledKeys=56;},
  ]){
    const observation=fixture('retain-fifty-keys');mutate(observation);
    assert.throws(()=>assertEventLoggerPublicState('retain-fifty-keys',observation));
  }
  const moves=fixture('coalesce-pointer');moves.rows[0].message='move to 11, 13';
  assert.throws(()=>assertEventLoggerPublicState('coalesce-pointer',moves),'Coalesced count cannot disappear');
});

test('EventLogger uses the exact existing twin guard, including attribute presence and field values',async()=>{
  const body=runRequestedStateActions.toString().match(/const fresh=async\(\)=>\{([\s\S]*?)\};/)?.[1];
  assert(body,'The actual driver fresh guard must remain identifiable');
  const executeGuard=new Function('twinState','initialTwin','events','cursor','assert',`return (async()=>{${body}})();`);
  const before={html:'<input name="due">',fields:[['due','2026-10-12',false]]};
  assert.deepEqual(await executeGuard(async()=>structuredClone(before),before,async()=>[],0,assert),[]);
  for(const changed of [
    {...before,html:'<input name="due" style="">'},
    {...before,fields:[['due','2026-10-13',false]]},
  ])await assert.rejects(executeGuard(async()=>changed,before,async()=>[],0,assert),/Public actions must preserve the independent twin/);
});
