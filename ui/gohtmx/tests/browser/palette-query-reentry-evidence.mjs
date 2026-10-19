import assert from 'node:assert/strict';
import {isDeepStrictEqual as same} from 'node:util';
import {paletteSurfaces, paletteOwner, paletteRows, paletteSourcePaths, paletteRequiredBrowserPaths, paletteErrors} from './palette-query-evidence.mjs';
import {reentrySourcePaths} from './palette-query-reentry-inputs.mjs';
export const reentryCase = 'proposed-repair.native-focus-reentry';
export const reentryClassification = 'new proposed-repair reentry risk; neither original-nine baseline nor sequential replacement credit';
export const reentryReportName = surface => `palette-query-reentry-${surface}.json`;
const keys = (object, wanted) => assert.deepEqual(Object.keys(object).sort(), [...wanted].sort(), 'exact raw keys');
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const token = value => Number.isInteger(value) && value > 0;
const stateKeys = ['openerToken','openerID','openerValue','ownerToken', 'ownerID', 'ready', 'queryToken', 'queryID', 'query', 'focusedToken', 'focusedID', 'focusedValue', 'controls', 'listID', 'activeID', 'activeToken', 'open', 'rows', 'old', 'oldRowToken'];
const rowKeys = ['token', 'id', 'value', 'role', 'selected', 'connected', 'inOwner', 'inList', 'hidden', 'disabled'];
function assertRow(row) {
  keys(row, rowKeys); assert(token(row.token));
  for (const key of ['id', 'value', 'role']) assert.equal(typeof row[key], 'string');
  assert(['true', 'false'].includes(row.selected));
  for (const key of ['connected', 'inOwner', 'inList', 'hidden', 'disabled']) assert.equal(typeof row[key], 'boolean');
}
function assertState(state, surface, slot = 'primary') {
  keys(state, stateKeys); for (const key of ['openerToken', 'ownerToken', 'queryToken', 'focusedToken']) assert(token(state[key]));
  assert.equal(state.openerID,''); assert.equal(state.openerValue,''); assert.equal(state.ownerID, paletteOwner(surface,slot)); assert.equal(state.queryID, state.ownerID + '-palette-query');
  assert.equal(state.listID, state.ownerID + '-palette-results'); assert.equal(state.controls, state.listID);
  assert([null, 'true'].includes(state.ready)); assert.equal(typeof state.query, 'string'); assert.equal(typeof state.open, 'boolean');
  assert(state.activeID === null || typeof state.activeID === 'string'); assert(state.activeToken === null || token(state.activeToken));
  assert.equal(state.rows.length, 5); state.rows.forEach(assertRow);
  assert.equal(new Set(state.rows.map(row => row.token)).size, 5); assert.equal(new Set(state.rows.map(row => row.id)).size, 5);
  assert.deepEqual([...state.rows].sort((a,b) => a.id.localeCompare(b.id)).map(({id, value, role, disabled}) => ({id, value, role, disabled})), paletteRows(slot).map((row, i) => ({id: state.ownerID + '-palette-option-' + i, value: row.value, role: 'option', disabled: row.disabled})));
  if (state.old !== null) { assertRow(state.old); assert(token(state.oldRowToken)); } else assert.equal(state.oldRowToken,null);
  for(const row of state.rows) assert.deepEqual([row.connected,row.inOwner,row.inList],[true,true,true],'list-enumerated live nodes');
  const active = state.rows.find(row => row.id === state.activeID);
  assert.equal(state.activeToken, active?.token || null, 'raw ID/token resolution agrees');
}
export function assertReentryRaw(raw, surface) {
  keys(raw, ['before', 'tab', 'fragment', 'log', 'final', 'baseTrace', 'peerBefore', 'peerAfter']);
  [raw.before, raw.tab, raw.final].forEach(state => assertState(state, surface));
  [raw.peerBefore,raw.peerAfter].forEach(state=>assertState(state,surface,'peer'));
  keys(raw.fragment, ['path', 'status', 'bytes', 'sha256', 'ownerCount', 'peerCount', 'optionCount', 'optionID', 'optionSelected']);
  keys(raw.log, ['events', 'batches']); assert(Array.isArray(raw.log.events) && Array.isArray(raw.log.batches));
  const nativeKeys = ['trusted', 'key', 'targetToken', 'targetID', 'targetValue', 'targetTag', 'targetConnected', 'targetFocused', 'ctrl', 'alt', 'shift', 'meta'];
  const lifecycle = ['htmx:before:swap', 'htmx:after:swap', 'htmx:finally:swap'];
  for (const event of raw.log.events) {
    const extra = ['keydown', 'keyup', 'focus'].includes(event.phase) ? nativeKeys : lifecycle.includes(event.phase) ? ['inFocus', 'contextTargetSame', 'tasks'] : event.phase === 'pre-swap-microtask-scheduled' ? ['sourceArrowSequence','sourceFocusSequence','queryToken'] : event.phase === 'arrow-continuation-return' ? ['trusted','targetToken','scheduleSequence','sourceArrowSequence','sourceFocusSequence','queryToken','inFocus'] : event.phase === 'document-arrow-bubble' ? ['trusted','targetToken'] : event.phase === 'query-focus-listener' ? ['trusted'] : event.phase === 'native-focus-return' ? ['oldRowConnected', 'oldRowParent'] : [];
    assert(['keydown', 'keyup', 'focus', ...lifecycle, 'query-focus-listener', 'native-focus-return', 'installed', 'ely:cleanup', 'arrow-continuation-return', 'pre-swap-microtask-scheduled', 'document-arrow-bubble'].includes(event.phase));
    keys(event, ['sequence', 'phase', 'state', ...extra]); assertState(event.state, surface);
    if(['keydown','keyup','focus'].includes(event.phase)) {
      assert.deepEqual([event.targetToken,event.targetID,event.targetValue],[event.state.focusedToken,event.state.focusedID,event.state.focusedValue],'raw native target matches active element tuple');
      const query=event.targetID===event.state.queryID, opener=event.phase==='focus' && event.targetToken===event.state.openerToken, node=query||opener?null:event.state.rows.find(row=>row.id===event.targetID);
      assert(query || opener || node,'native target is a specific owned query, option or opening trigger');
      assert.deepEqual([event.targetToken,event.targetTag,event.targetValue],[query?event.state.queryToken:opener?event.state.openerToken:node.token,query?'INPUT':'BUTTON',query?event.state.query:opener?event.state.openerValue:node.value],'raw native target identity/role/value');
      assert.deepEqual([event.trusted,event.targetFocused,event.targetConnected],[true,true,true],'trusted connected native focus/input evidence');
    }
  }
  for (const batch of raw.log.batches) {
    keys(batch, ['sequence', 'reason', 'records', 'nodes', 'state']); assert(['observer-callback', 'native-focus-return', 'native-keydown-return', 'pre-swap-microtask', 'final'].includes(batch.reason));
    assert(batch.records.length); assertState(batch.state, surface); batch.nodes.forEach(assertRow);
    assert.equal(new Set(batch.nodes.map(row => row.token)).size, batch.nodes.length);
    for (const record of batch.records) {
      assert(token(record.targetToken));
      if (record.type === 'attributes') {
        keys(record, ['type', 'targetToken', 'attribute', 'oldValue', 'finalValue']);
        assert(['aria-activedescendant', 'aria-selected'].includes(record.attribute));
        for (const key of ['oldValue', 'finalValue']) assert(record[key] === null || typeof record[key] === 'string');
        if (record.attribute === 'aria-activedescendant') {
          assert.equal(record.targetToken, raw.before.queryToken); assert.equal(record.finalValue,batch.state.activeID,'query mutation final attribute agrees with batch snapshot');
        } else { const node=batch.nodes.find(row => row.token === record.targetToken); assert(node); assert.equal(record.finalValue,node.selected,'selection final attribute agrees with node snapshot'); }
      } else { assert.equal(record.type, 'childList'); keys(record, ['type', 'targetToken', 'added', 'removed']); for (const value of [...record.added, ...record.removed]) assert(token(value)); }
    }
  }
  const installed=raw.log.events.filter(event=>event.phase==='installed'); assert.equal(installed.length,1);
  let active=installed[0].state.activeID;
  for(const batch of raw.log.batches) {
    const records=batch.records.filter(record=>record.type==='attributes' && record.attribute==='aria-activedescendant');
    for(let index=0;index<records.length;index++) { const record=records[index]; assert.equal(record.oldValue,active,'contiguous raw query write history'); active=index+1<records.length?records[index+1].oldValue:record.finalValue; }
    assert.equal(active,batch.state.activeID,'every query transition has a mutation record');
  }
  assert.equal(active,raw.final.activeID,'mutation history reaches final active attribute');
  const timeline = [...raw.log.events, ...raw.log.batches].map(event => event.sequence).sort((a,b) => a-b);
  assert.deepEqual(timeline, Array.from({length: timeline.length}, (_,i) => i + 1), 'every native/lifecycle/batch boundary retained exactly once');
  for (const events of [raw.log.events, raw.log.batches]) assert.deepEqual(events.map(e => e.sequence), events.map(e => e.sequence).sort((a,b) => a-b));
}
// MutationObserver supplies oldValue, not newValue. Reconstruct every write in
// delivery order from the next matching record.oldValue, or the final attribute.
// For selected state at a write, use the next selection record's oldValue. This
// prevents asynchronous reinit's final selected state from erasing a stale write.
export function reconstructReentryWrites(raw) {
  return raw.log.batches.flatMap(batch => batch.records.flatMap((record, index) => {
    if (record.type !== 'attributes' || record.attribute !== 'aria-activedescendant') return [];
    const later = batch.records.slice(index + 1);
    const next = later.find(candidate => candidate.type === 'attributes' && candidate.targetToken === record.targetToken && candidate.attribute === record.attribute);
    const value = next ? next.oldValue : record.finalValue;
    const rows = batch.nodes.filter(row => row.connected && row.inOwner && row.inList && row.id === value).map(row => {
      const nextSelection = later.find(candidate => candidate.type === 'attributes' && candidate.targetToken === row.token && candidate.attribute === 'aria-selected');
      return {...row, selected: nextSelection ? nextSelection.oldValue : row.selected};
    });
    return [{batchSequence: batch.sequence, recordIndex: index, oldValue: record.oldValue, value, queryToken: record.targetToken, rows}];
  }));
}
export function reentryOracles(raw, surface) {
  assertReentryRaw(raw, surface);
  const out = [], add = (id, observed, expected, prerequisite = false) => out.push({id, observed, expected, prerequisite, pass: same(observed, expected)});
  const events = phase => raw.log.events.filter(event => event.phase === phase);
  const id = paletteOwner(surface), openID = id + '-palette-option-0', optionID = id + '-palette-option-1';
  add('setup.normal-open-query', [raw.before.query, raw.before.open, raw.before.focusedToken, raw.before.ready], ['op', true, raw.before.queryToken, 'true'], true);
  add('setup.open-selection', raw.before.rows.filter(row => row.selected === 'true').map(row => row.value), ['open-file'], true);
  add('setup.native-tab-identity',raw.tab.focusedToken,raw.tab.rows.find(row=>row.value==='open-file').token,true);
  add('setup.native-tab-focus', [raw.tab.focusedID, raw.tab.focusedValue, raw.tab.query, raw.tab.open], [openID, 'open-file', 'op', true], true);
  const keyEvents = raw.log.events.filter(e => ['keydown', 'keyup'].includes(e.phase));
  add('input.exact-trusted-keys', keyEvents.map(e => [e.phase, e.key, e.trusted, e.targetFocused, e.targetConnected, e.ctrl, e.alt, e.shift, e.meta]), ['o','p','Tab','ArrowDown'].flatMap(key => ['keydown','keyup'].map(phase => [phase,key,true,true,true,false,false,false,false])), true);
  add('input.tab-to-option-then-arrow', keyEvents.filter(e => e.key === 'Tab' || e.key === 'ArrowDown').map(e => [e.phase,e.key,e.targetID]), [['keydown','Tab',raw.before.queryID],['keyup','Tab',openID],['keydown','ArrowDown',openID],['keyup','ArrowDown',raw.before.queryID]], true);
  add('input.native-option-focus', events('focus').filter(e => e.targetID === openID).map(e => [e.trusted,e.targetValue,e.targetFocused]), [[true,'open-file',true]], true);
  add('fragment.actual-primary-template-selection', [raw.fragment.path, raw.fragment.status, raw.fragment.ownerCount, raw.fragment.peerCount, raw.fragment.optionCount, raw.fragment.optionID, raw.fragment.optionSelected], ['/fragment',200,1,0,1,optionID,'false'], true);
  const install = events('installed'), start = events('query-focus-listener'), returned = events('native-focus-return');
  add('focus.exact-listener-boundaries', [install.length,start.length,returned.length], [1,1,1], true);
  const first = start[0], last = returned[0], continuation=events('arrow-continuation-return');
  add('focus.trusted-existing-query', first && [first.trusted,first.state.queryToken,first.state.focusedToken,first.state.old?.id,first.state.old?.selected,first.state.old?.connected], [true,raw.before.queryToken,raw.before.queryToken,optionID,'true',true], true);
  add('swap.old-detached-before-focus-returns', last && [last.oldRowConnected,last.oldRowParent,last.state.old?.connected,last.state.old?.inOwner,last.state.old?.selected], [false,false,false,false,'true'], true);
  const fresh = last?.state.rows.find(row => row.id === optionID);
  add('swap.same-id-distinct-unselected-replacement', fresh && [fresh.id,fresh.selected,fresh.connected,fresh.token !== last.state.old?.token], [optionID,'false',true,true], true);
  add('swap.owner-and-query-retained', [raw.tab,first?.state,last?.state,raw.final].map(state => state && [state.ownerToken,state.queryToken]), Array.from({length:4},()=>[raw.before.ownerToken,raw.before.queryToken]), true);
  const phases = ['htmx:before:swap','htmx:after:swap','htmx:finally:swap'];
  add('swap.public-lifecycle-order', raw.log.events.filter(e=>phases.includes(e.phase)).map(e=>[e.phase,e.inFocus,e.contextTargetSame]), phases.map((phase,i)=>[phase,i===0,true]), true);
  const before = events('htmx:before:swap')[0], after = events('htmx:after:swap')[0], finallyEvent = events('htmx:finally:swap')[0];
  add('swap.boundary-order', Boolean(first && before && last && after && finallyEvent && first.sequence < before.sequence && before.sequence < last.sequence && last.sequence < after.sequence && after.sequence < finallyEvent.sequence), true, true);
  add('swap.exact-target-task', before?.tasks.map(task=>[task.targetSame,task.targetToken,task.style]), [[true,first?.state.oldRowToken,'outerHTML']], true);
  add('swap.cleanup-once', events('ely:cleanup').length, 1, true);
  add('observer.focus-return-drain-retained', raw.log.batches.filter(batch=>batch.reason==='native-focus-return').length, 1, true);
  add('input.exact-native-continuation-checkpoint', continuation.map(event=>[event.trusted,event.targetToken]), [[true,raw.tab.focusedToken]], true);
  const checkpoint=continuation[0], scheduled=events('pre-swap-microtask-scheduled'), schedule=scheduled[0], documentEvents=events('document-arrow-bubble');
  const arrowDown=keyEvents.find(event=>event.phase==='keydown' && event.key==='ArrowDown');
  add('input.exact-pre-swap-microtask-schedule',scheduled.length,1,true);
  add('input.microtask-scheduled-by-native-arrow-and-focus',schedule && [schedule.sourceArrowSequence,schedule.sourceFocusSequence,schedule.queryToken,schedule.state],[arrowDown?.sequence,first?.sequence,raw.before.queryToken,first?.state],true);
  add('input.microtask-callback-matches-schedule',checkpoint && [checkpoint.scheduleSequence,checkpoint.sourceArrowSequence,checkpoint.sourceFocusSequence,checkpoint.queryToken,checkpoint.inFocus],[schedule?.sequence,arrowDown?.sequence,first?.sequence,raw.before.queryToken,false],true);
  add('input.microtask-source-arrow-identity',arrowDown && [arrowDown.trusted,arrowDown.targetToken,arrowDown.targetID,arrowDown.targetValue,arrowDown.targetTag],[true,raw.tab.focusedToken,openID,'open-file','BUTTON'],true);
  add('input.microtask-scheduled-before-swap',Boolean(arrowDown && first && schedule && before && arrowDown.sequence < first.sequence && first.sequence < schedule.sequence && schedule.sequence < before.sequence),true,true);
  add('input.continuation-before-async-lifecycle', Boolean(checkpoint && last && after && last.sequence < checkpoint.sequence && checkpoint.sequence < after.sequence),true,true);
  add('input.microtask-retains-disposed-owner-and-query',checkpoint && [checkpoint.state.ownerToken,checkpoint.state.queryToken,checkpoint.state.focusedToken,checkpoint.state.ready,checkpoint.state.query,checkpoint.state.old?.token,checkpoint.state.old?.connected],[raw.before.ownerToken,raw.before.queryToken,raw.before.queryToken,null,'op',last?.state.old?.token,false],true);
  const callbackOption=checkpoint?.state.rows.find(row=>row.id===optionID);
  add('input.microtask-retains-replacement-identity',callbackOption && [callbackOption.token,callbackOption.id,callbackOption.connected],[fresh?.token,optionID,true],true);
  // Document bubbling remains a required trusted diagnostic; its position
  // relative to async remount is no longer the transient-state premise.
  const documentCheckpoint=documentEvents[0], arrowUp=keyEvents.find(event=>event.phase==='keyup' && event.key==='ArrowDown');
  add('input.exact-document-arrow-diagnostic',documentEvents.map(event=>[event.trusted,event.targetToken]),[[true,raw.tab.focusedToken]],true);
  add('input.document-checkpoint-within-native-arrow',Boolean(last && documentCheckpoint && arrowUp && last.sequence < documentCheckpoint.sequence && documentCheckpoint.sequence < arrowUp.sequence),true,true);
  add('reentry.no-old-handler-active-write-after-disposal', checkpoint && [checkpoint.state.activeID,checkpoint.state.activeToken], last && [last.state.activeID,last.state.activeToken]);
  const writes = reconstructReentryWrites(raw);
  add('observer.active-write-captured', writes.length > 0, true, true);
  add('reentry.every-active-write-resolves-selected-live-option', writes.map(write=>({value:write.value,rows:write.rows.map(({role,selected,hidden,disabled})=>({role,selected,hidden,disabled}))})), writes.map(write=>({value:write.value,rows:write.value===null?[]:[{role:'option',selected:'true',hidden:false,disabled:false}]})));
  const active = raw.final.rows.find(row=>row.id===raw.final.activeID);
  add('final.query-focus-preserved', [raw.final.query,raw.final.focusedToken,raw.final.open,raw.final.ready], ['op',raw.final.queryToken,true,'true']);
  add('final.selected-active-relation', active && [active.role,active.selected,active.connected,active.hidden,active.disabled], ['option','true',true,false,false]);
  add('isolation.peer-exact-state-unchanged',raw.peerAfter,raw.peerBefore,true);
  const peerID=paletteOwner(surface,'peer');
  add('isolation.peer-fixed-closed-state',[raw.peerBefore.ownerID,raw.peerBefore.query,raw.peerBefore.open,raw.peerBefore.ready,raw.peerBefore.activeID,raw.peerBefore.rows.filter(row=>row.selected==='true').map(row=>row.value),raw.peerBefore.rows.some(row=>row.hidden)],[peerID,'',false,'true',peerID+'-palette-option-0',['peer-open'],false],true);
  const ids=[raw.final.ownerID,raw.final.queryID,raw.final.listID,...raw.final.rows.map(row=>row.id),raw.peerAfter.ownerID,raw.peerAfter.queryID,raw.peerAfter.listID,...raw.peerAfter.rows.map(row=>row.id)];
  const tokens=[raw.final.openerToken,raw.final.ownerToken,raw.final.queryToken,...raw.final.rows.map(row=>row.token),raw.peerAfter.openerToken,raw.peerAfter.ownerToken,raw.peerAfter.queryToken,...raw.peerAfter.rows.map(row=>row.token)];
  add('isolation.distinct-primary-peer-identities',[new Set(ids).size,new Set(tokens).size],[ids.length,tokens.length],true);
  add('events.no-command-or-runtime-error', ['actions','hosts','results','errors'].map(key=>raw.baseTrace[key]), [[],[],[],[]]);
  return out;
}
export function verifyReentryEvidence(report, trusted, exitCode) {
  assert.equal(report.suite,'palette-query-reentry'); assert.equal(report.classification,reentryClassification); assert.equal(report.stage,'checks');
  assert(paletteSurfaces.includes(trusted.surface));
  for (const key of ['surface','revision','tree','runToken']) assert.equal(report[key],trusted[key],'independent '+key);
  for(const key of ['revision','tree']) assert(/^[a-f0-9]{40}$/.test(trusted[key])); assert(typeof trusted.runToken==='string' && trusted.runToken.length>10);
  assert.equal(report.dirty,''); assert.equal(report.error,undefined); assert.equal(report.captureError,undefined); assert.equal(report.validationError,undefined);
  assert.deepEqual(Object.keys(trusted.sourceFiles),paletteSourcePaths); assert.deepEqual(Object.keys(trusted.reentrySourceFiles),reentrySourcePaths);
  for(const key of ['sourceFiles','reentrySourceFiles','assets','fixtures','fixtureManifest','standaloneDependencyProof','toolchain']) assert.deepEqual(report[key],trusted[key],'independent '+key);
  for(const value of [...Object.values(trusted.sourceFiles),...Object.values(trusted.reentrySourceFiles)]) assert(hash(value));
  for(const value of Object.values({...trusted.assets,...trusted.fixtures})) { assert(hash(value.sourceSHA256)); assert.equal(value.sourceSHA256,value.servedSHA256); assert(value.bytes>0); }
  assert(hash(report.standaloneDependencyProof.SHA256)); assert.deepEqual(report.standaloneDependencyProof.forbiddenImports,[]);
  for(const key of ['node','go','playwright']) assert(typeof report.toolchain[key]==='string' && report.toolchain[key]);
  assert(typeof report.browserVersion==='string' && report.browserVersion);
  for(const key of paletteErrors) assert.deepEqual(report[key],[],key+' cannot masquerade as contract evidence');
  assert.deepEqual(report.caseInventory,[reentryCase]); assert.deepEqual(report.checks.map(check=>check.name),[reentryCase]);
  const paths=[...Object.keys(trusted.assets),...Object.keys(trusted.fixtures)];
  assert.deepEqual(report.httpAssetProof.map(proof=>proof.path),paths);
  for(const proof of [...report.httpAssetProof,...report.browserResponses]) {
    const entry=trusted.assets[proof.path]||trusted.fixtures[proof.path]; assert(entry,'known response path');
    assert.deepEqual([proof.status,proof.bytes,proof.expectedSHA256,proof.receivedSHA256],[200,entry.bytes,entry.servedSHA256,entry.servedSHA256]);
  }
  const browserPaths=report.browserResponses.map(proof=>proof.path); assert.equal(new Set(browserPaths).size,browserPaths.length);
  const expectedBrowserPaths=[...paletteRequiredBrowserPaths,'/reentry-observer.js','/fragment','/assets/ely/fonts/Inter-Regular.ttf','/assets/ely/fonts/Inter-SemiBold.ttf',...(trusted.surface==='sdui'?['/assets/sdui.js','/assets/sdui.css']:[])];
  assert.deepEqual([...browserPaths].sort(),[...expectedBrowserPaths].sort(),'exact source-owned browser response inventory');
  assert.equal(new Set(report.requests.map(request=>request.phase+':'+request.path)).size,report.requests.length);
  for(const request of report.requests) {
    assert(['preflight','browser'].includes(request.phase)); const entry=trusted.assets[request.path]||trusted.fixtures[request.path]; assert(entry);
    assert.deepEqual([request.method,request.status,request.responseSHA256,request.responseBytes],['GET',200,entry.servedSHA256,entry.bytes]);
  }
  assert.deepEqual(report.requests.filter(request=>request.phase==='preflight').map(request=>request.path),paths);
  assert.deepEqual(report.requests.filter(request=>request.phase==='browser').map(request=>request.path).sort(),[...browserPaths].sort());
  assert.equal(report.requests.filter(request=>request.phase==='browser' && request.path==='/fragment').length,1,'exact actual fragment prefetch');
  const check=report.checks[0]; assert.deepEqual(check.finalCapture,{log:check.raw.log,baseTrace:check.raw.baseTrace},'final capture remains complete'); assert.equal(check.error,undefined); assert.equal(check.captureError,undefined); assert.equal(check.finalCapture?.baseTrace?.errors?.length,0);
  const fragment=check.raw.fragment, metadata=trusted.fixtures['/fragment']; assert.deepEqual([fragment.sha256,fragment.bytes],[metadata.servedSHA256,metadata.bytes]);
  const oracles=reentryOracles(check.raw,trusted.surface); assert.deepEqual(check.oracles,oracles,'source-owned raw oracle replay');
  assert.deepEqual(check.writes,reconstructReentryWrites(check.raw),'passive mutation reconstruction replay');
  for(const oracle of oracles) if(oracle.prerequisite) assert(oracle.pass,oracle.id+': prerequisite failure');
  const status=oracles.every(oracle=>oracle.pass)?'passed':'failed'; assert.equal(check.status,status); assert.equal(report.status,status); assert.equal(exitCode,status==='passed'?0:1,'nonzero contract exit preserved');
  return {status,surface:trusted.surface,revision:trusted.revision,failed:oracles.filter(oracle=>!oracle.pass).map(oracle=>oracle.id)};
}
