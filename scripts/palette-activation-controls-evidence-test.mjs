// Invented, bounded evidence-schema controls. These do not execute a runtime
// mutant, render Go templates, start a server, or establish browser evidence.
// Unrelated desired cases remain unchanged; each reversal changes its specific
// causal cases. The source-bound replay suite separately attaches real inputs.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {buildActivationSchemaFixture} from './palette-activation-evidence-test.mjs';
import {activationOracles, activationPayload, verifyActivationEvidence} from '../ui/gohtmx/tests/browser/palette-activation-evidence.mjs';
import {activationMutations} from '../ui/gohtmx/tests/browser/palette-activation-mutants.mjs';
import {activationPolicy, activationRepairSourcePaths, activationTemplateMarkerCounts} from '../ui/gohtmx/tests/browser/palette-activation-policy.mjs';
import {verifyActivationControl} from './palette-activation-controls.mjs';

const copy = structuredClone;
const sha = value => createHash('sha256').update(value).digest('hex');
const surfaces = ['go-qualified', 'go-chapter', 'sdui'];
const final = check => check.raw.fresh || check.raw.explicit || check.raw.after;
const transactionTypes = ['direct-action', 'host', 'result', 'request-start', 'bridge-success'];
const findCase = (fixture, name) => fixture.report.checks.find(check => check.name === name);
const nodeOnly = node => Object.fromEntries(['token', 'id', 'tag', 'value', 'connected'].map(key => [key, node[key]]));

// Rebuild the independently captured arrays, including changes and bridge
// completions, instead of allowing stale successful side-channel observations.
function rebuildBase(snapshot) {
  const previous = snapshot.baseTrace;
  const base = Object.fromEntries(Object.keys(previous).map(key => [key, []]));
  const append = (kind, value) => {
    base[kind].push(copy(value));
    base.timeline.push({sequence: base.timeline.length + 1, kind, index: base[kind].length - 1});
  };
  // Setup typing is captured by the existing independent observer, not log.
  const nativeKeys = snapshot.log.filter(event => ['keydown', 'keyup'].includes(event.type));
  const setupCount = previous.inputs.length - nativeKeys.length;
  assert(setupCount >= 0);
  previous.inputs.slice(0, setupCount).forEach(value => append('inputs', value));
  for (const event of snapshot.log) {
    if (['keydown', 'keyup'].includes(event.type)) append('inputs', {
      type: event.type, key: event.key, code: event.code, trusted: event.trusted,
      targetTag: event.target.tag, field: event.target.token === event.state.query.token,
      ownerID: event.state.owner.id, value: event.target.value, connected: event.target.connected,
      ctrl: event.ctrl, alt: event.alt, shift: event.shift, meta: event.meta,
    });
    if (event.type === 'direct-action') append('actions', {...event.payload, slot: 'primary',
      state: {id: event.state.owner.id, component: event.state.component, ready: event.state.ready}});
    if (event.type === 'result') append('results', {...event.payload, slot: 'primary', result: event.result});
    if (event.type === 'change') append('changes', {...event.detail, slot: 'primary', type: null});
    if (event.type === 'bridge-success') append('bridge', {action: event.action, target: event.target,
      status: event.status, connected: true});
  }
  for (const kind of ['closes', 'lifecycle', 'errors']) previous[kind].forEach(value => append(kind, value));
  snapshot.baseTrace = base;
}
function finish(fixture) {
  const {report} = fixture;
  for (const check of report.checks) {
    for (const snapshot of Object.values(check.raw)) {
      snapshot.log.forEach((event, index) => event.sequence = index + 1);
      rebuildBase(snapshot);
    }
    check.finalTrace = copy(final(check));
    check.oracles = activationOracles(check, report.surface);
    check.status = check.oracles.every(oracle => oracle.pass) ? 'passed' : 'failed';
  }
  report.requests = report.requests.filter(record => record.path !== '/sdui-action');
  report.browserResponses = report.browserResponses.filter(record => record.path !== '/sdui-action');
  for (const check of report.checks) for (const event of final(check).log.filter(event => event.type === 'request-start')) {
    const response = report.fixtures['/sdui-response-primary'];
    const serialized = JSON.stringify(event.fields);
    report.requests.push({path: '/sdui-action', check: check.name, method: 'POST', htmx: null,
      status: 200, responseSHA256: response.servedSHA256, responseBytes: response.bytes,
      responseFixture: '/sdui-response-primary', fields: copy(event.fields),
      requestSHA256: sha(serialized), requestBytes: Buffer.byteLength(serialized),
      contentType: 'multipart/form-data; boundary=synthetic-causal-schema',
      idempotencyKey: Object.fromEntries(event.fields)._request});
    report.browserResponses.push({path: '/sdui-action', check: check.name,
      responseFixture: '/sdui-response-primary', status: 200, bytes: response.bytes,
      expectedSHA256: response.servedSHA256, receivedSHA256: response.servedSHA256});
  }
  report.status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  fixture.exit = report.status === 'passed' ? 0 : 1;
  return fixture;
}
function eventAt(seed, state, stage = seed.stage) {
  return {...copy(seed), state: copy(state), stage};
}
function requestIdentity(event, suffix) {
  if (event.type === 'direct-action') event.eventToken = 900001;
  if (event.type === 'request-start') event.fields = event.fields.map(([key, value]) => [key, key === '_request' ? value + suffix : value]);
  if (event.type === 'bridge-success') event.requestId += suffix;
  return event;
}

// Distinguish the template fallback (action before selection, change while
// open) from late close (selection committed before action, change after close).
function ordinaryReversal(fixture, mutation) {
  const check = findCase(fixture, 'pointer.activation'), snapshot = check.raw.after;
  const seed = copy(snapshot.log), first = seed.findIndex(event => event.type === 'direct-action');
  const prefix = seed.slice(0, first);
  const pick = type => seed.find(event => event.type === type && event.stage === 'activation');
  const closed = copy(pick('direct-action').state), old = copy(pick('click').state);
  const selectedOpen = {...copy(closed), open: true, focus: nodeOnly(closed.rows[1])};
  const emit = (types, state, suffix = '') => types.flatMap(type => {
    const event = pick(type); if (!event) return [];
    const result = eventAt(event, state);
    return [suffix ? requestIdentity(result, suffix) : result];
  });
  const sync = ['direct-action', 'host', 'request-start'];
  const changes = ['host-change', 'change'];
  const boundary = emit(['click-boundary'], closed);
  const settled = emit(['result', 'bridge-success'], closed);
  if (mutation === 'core-skip-removed') {
    // The second same-action host invocation invalidates the generic result.
    // SDUI's synchronous busy(source) guard admits only the first bridge
    // request while it is pending, despite the two public action events.
    snapshot.log = [...prefix, ...emit(sync, old, '-generic'),
      ...emit(['direct-action', 'host'], closed), ...emit(changes, closed),
      ...boundary, ...emit(['result'], closed), ...emit(['bridge-success'], closed, '-generic')];
  } else if (mutation === 'family-emit-omitted') {
    snapshot.log = [...prefix, ...emit(changes, closed), ...boundary];
  } else if (mutation === 'template-marker-omitted') {
    snapshot.log = [...prefix, ...emit(sync, old), ...emit(changes, selectedOpen), ...boundary, ...settled];
  } else if (mutation === 'close-after-action') {
    snapshot.log = [...prefix, ...emit(sync, selectedOpen), ...emit(changes, closed), ...boundary, ...settled];
  } else assert.fail('known ordinary reversal');
  snapshot.state = copy(closed);
}
function postCloseReversal(fixture) {
  for (const check of fixture.report.checks.filter(check => check.name.startsWith('owner.'))) {
    const seed = check.raw.fresh.log.filter(event => event.stage === 'fresh' && transactionTypes.includes(event.type));
    for (const snapshot of Object.values(check.raw)) {
      const index = snapshot.log.findIndex(event => event.type === 'close-focus-after-bind');
      if (index < 0) continue;
      const state = snapshot.log[index].state;
      const transaction = seed.map(event => requestIdentity(eventAt(event, state, 'activation'), '-post-close-owner'));
      const immediate = transaction.filter(event => ['direct-action', 'host', 'request-start'].includes(event.type));
      const settled = transaction.filter(event => ['result', 'bridge-success'].includes(event.type));
      snapshot.log.splice(index + 1, 0, ...immediate);
      const boundary = snapshot.log.findIndex(event => event.type === 'click-boundary' && event.stage === 'activation');
      assert(boundary > index);
      snapshot.log.splice(boundary + 1, 0, ...settled);
    }
  }
}
function trailingReversal(fixture) {
  const seed = findCase(fixture, 'pointer.activation').raw.after.log.filter(event => ['host-change', 'change'].includes(event.type));
  const snapshot = findCase(fixture, 'callback.reopen').raw.after;
  const index = snapshot.log.findIndex(event => event.type === 'callback-reopen');
  snapshot.log.splice(index + 1, 0, ...seed.map(event => eventAt(event, snapshot.log[index].state)));
}
function emptyReversal(fixture) {
  const red = buildActivationSchemaFixture(fixture.report.surface, true);
  for (let index = 0; index < fixture.report.checks.length; index++) {
    if (!fixture.report.checks[index].name.startsWith('empty.')) continue;
    const check = copy(red.report.checks[index]);
    // The implicit submit is a separate native event, with its own root
    // boundary, while the Enter boundary remains unprevented.
    const boundarySeed = check.raw.explicit.log.find(event => event.type === 'submit-boundary');
    for (const snapshot of Object.values(check.raw)) {
      const submit = snapshot.log.find(event => event.type === 'submit' && event.stage === 'activation');
      if (!submit) continue;
      const after = snapshot.log.findLastIndex(event => event.stage === 'activation' && ['host', 'request-start'].includes(event.type));
      const boundary = {...eventAt(boundarySeed, submit.state, 'activation'), eventToken: submit.eventToken,
        target: copy(submit.target), path: copy(submit.path), defaultPrevented: true};
      snapshot.log.splice(after + 1, 0, boundary);
    }
    fixture.report.checks[index] = check;
  }
}
function blanketReversal(fixture) {
  for (const check of fixture.report.checks.filter(check => check.name.startsWith('empty.'))) {
    for (const snapshot of Object.values(check.raw)) {
      snapshot.log = snapshot.log.filter(event => event.stage !== 'explicit' || ![...transactionTypes, 'submit-boundary'].includes(event.type));
    }
  }
}
export function buildActivationMutantSchemaFixture(surface = 'go-qualified', mutation = 'control') {
  assert(surfaces.includes(surface), 'known synthetic activation surface');
  assert(activationMutations.includes(mutation), 'known synthetic activation mutation');
  const fixture = buildActivationSchemaFixture(surface);
  if (['core-skip-removed', 'family-emit-omitted', 'template-marker-omitted', 'close-after-action'].includes(mutation)) ordinaryReversal(fixture, mutation);
  else if (mutation === 'post-close-owner-bypassed') postCloseReversal(fixture);
  else if (mutation === 'trailing-notification-guard-removed') trailingReversal(fixture);
  else if (mutation === 'empty-enter-fallthrough') emptyReversal(fixture);
  else if (mutation === 'blanket-palette-submit-prevention') blanketReversal(fixture);
  finish(fixture);
  const status = mutation === 'control' ? 'passed' : 'failed';
  assert.equal(verifyActivationEvidence(fixture.report, fixture.trusted, fixture.exit).status, status,
    'semantic reversal must pass the unchanged raw schema/transport verifier');
  return fixture;
}

// Two raw-valid substitutes must never establish the specific post-close
// reversal: a later independent delivery, or a different form action payload.
function mutatePostCloseWitness(fixture, kind) {
  assert(['after-click-boundary', 'query-run-payload'].includes(kind));
  for (const check of fixture.report.checks.filter(check => check.name.startsWith('owner.'))) {
    for (const snapshot of Object.values(check.raw)) {
      if (!snapshot.log.some(event => event.type === 'close-focus-after-bind')) continue;
      if (kind === 'after-click-boundary') {
        const transaction = snapshot.log.filter(event => event.stage === 'activation' && transactionTypes.includes(event.type));
        snapshot.log = snapshot.log.filter(event => !transaction.includes(event));
        const index = snapshot.log.findIndex(event => event.type === 'click-boundary' && event.stage === 'activation');
        snapshot.log.splice(index + 1, 0, ...transaction);
      } else {
        for (const event of snapshot.log.filter(event => event.stage === 'activation')) {
          if (event.payload) event.payload = activationPayload(fixture.report.surface, 'run', '');
          if (event.type === 'request-start') {
            const fields = Object.fromEntries(event.fields);
            fields._action = 'query-observed'; fields.commandAction = 'run';
            delete fields.commandValue; fields.cmdQuery = '';
            event.fields = Object.entries(fields);
          }
          if (event.type === 'bridge-success') event.action = 'query-observed';
        }
      }
    }
  }
  return fixture;
}
export function buildActivationPostCloseRejectionFixture(surface, kind) {
  const fixture = buildActivationMutantSchemaFixture(surface, 'post-close-owner-bypassed');
  mutatePostCloseWitness(fixture, kind); finish(fixture);
  assert.equal(verifyActivationEvidence(fixture.report, fixture.trusted, 1).status, 'failed',
    'wrong causal witness remains schema-valid semantic red');
  return fixture;
}

export function buildActivationShapeRejectionFixture(surface, mutation) {
  assert(['core-skip-removed', 'family-emit-omitted', 'blanket-palette-submit-prevention'].includes(mutation));
  let fixture;
  if (mutation === 'core-skip-removed') fixture = buildActivationMutantSchemaFixture(surface, 'family-emit-omitted');
  else if (mutation === 'family-emit-omitted') fixture = buildActivationMutantSchemaFixture(surface, 'core-skip-removed');
  else {
    fixture = buildActivationSchemaFixture(surface);
    for (const check of fixture.report.checks.filter(check => check.name.startsWith('empty.'))) {
      const snapshot = check.raw.explicit;
      const transaction = snapshot.log.filter(event => event.stage === 'explicit' && transactionTypes.includes(event.type))
        .map(event => requestIdentity(copy(event), '-extra-explicit'));
      const index = snapshot.log.findIndex(event => event.type === 'requestSubmit-return');
      snapshot.log.splice(index, 0, ...transaction);
    }
    finish(fixture);
  }
  assert.equal(verifyActivationEvidence(fixture.report, fixture.trusted, 1).status, 'failed');
  return fixture;
}

// This binding is solely for fast schema self-tests. Its non-runtime source
// digests and template output are invented; it does not claim an actual build.
// The separate repair replay replaces this with independently compiled metadata.
function bindSyntheticPolicy(fixture, mutation) {
  const policy = activationPolicy({mode: 'repaired', mutation});
  for (const side of [fixture.report, fixture.trusted]) {
    side.productionPolicy = 'activation-repair'; side.activationPolicy = copy(policy);
    side.activationRepairSourceFiles = Object.fromEntries(activationRepairSourcePaths.map(path => [path, sha('synthetic-schema:' + path)]));
    side.activationRenderMutation = {};
    for (const key of ['core', 'runtime']) {
      const file = policy.definition.files[key];
      side.assets[file.servedPath] = {...side.assets[file.servedPath], sourceSHA256: file.sourceSHA256,
        servedSHA256: file.servedSHA256, bytes: file.servedBytes};
    }
    if (mutation === 'template-marker-omitted') for (const [path, entry] of Object.entries(side.fixtures)) {
      const file = policy.definition.files.template, count = activationTemplateMarkerCounts[path];
      side.activationRenderMutation[path] = {compilePolicy: 'go-build-embed-overlay',
        templateSourceSHA256: file.sourceSHA256, templateTransformedSHA256: file.transformedSourceSHA256,
        sourceMarkers: count, servedMarkers: 0, removedMarkers: count};
      if (count) entry.servedSHA256 = sha('invented template response:' + path);
    }
  }
  const entry = record => fixture.report.assets[record.path] || fixture.report.fixtures[record.responseFixture || record.path];
  for (const record of [...fixture.report.httpAssetProof, ...fixture.report.browserResponses]) {
    const wanted = entry(record); Object.assign(record, {bytes: wanted.bytes, expectedSHA256: wanted.servedSHA256, receivedSHA256: wanted.servedSHA256});
  }
  for (const record of fixture.report.requests) {
    const wanted = entry(record); Object.assign(record, {responseSHA256: wanted.servedSHA256, responseBytes: wanted.bytes});
  }
  return fixture;
}
export function runActivationMutantSchemaTests() {
  let positives = 0, greenRejected = 0, unrelatedRejected = 0, corruptRejected = 0, witnessRejected = 0, cachedRejected = 0, shapeRejected = 0;
  for (const surface of surfaces) for (const mutation of activationMutations) {
    const selected = {mode: 'repaired', mutation};
    const fixture = bindSyntheticPolicy(buildActivationMutantSchemaFixture(surface, mutation), mutation);
    const result = verifyActivationControl(fixture.report, fixture.trusted, fixture.exit, selected);
    assert.equal(result.control, mutation === 'control' ? 'passed' : 'killed'); positives++;
    assert.deepEqual(fixture.report.checks.flatMap(check => check.oracles.filter(oracle => oracle.prerequisite && !oracle.pass)), []);
    if (mutation === 'control') continue;
    const green = bindSyntheticPolicy(buildActivationSchemaFixture(surface), mutation);
    assert.throws(() => verifyActivationControl(green.report, green.trusted, 0, selected)); greenRejected++;
    const unrelated = buildActivationSchemaFixture(surface);
    const snapshot = findCase(unrelated, 'callback.peer-focus').raw.after;
    snapshot.state.focus = copy(snapshot.state.opener); finish(unrelated); bindSyntheticPolicy(unrelated, mutation);
    assert.equal(verifyActivationEvidence(unrelated.report, unrelated.trusted, 1).status, 'failed');
    assert.throws(() => verifyActivationControl(unrelated.report, unrelated.trusted, 1, selected), /designated non-prerequisite kill/); unrelatedRejected++;
    const corrupt = copy(fixture); findCase(corrupt, 'pointer.activation').raw.after.log[0].sequence = 0;
    assert.throws(() => verifyActivationControl(corrupt.report, corrupt.trusted, 1, selected)); corruptRejected++;
    if (surface === 'sdui' && ['core-skip-removed', 'post-close-owner-bypassed'].includes(mutation)) {
      const name = mutation === 'core-skip-removed' ? 'pointer.activation' : 'owner.close-rebind';
      const missing = copy(fixture), index = missing.report.requests.findIndex(record => record.check === name && record.method === 'POST');
      assert(index >= 0); missing.report.requests.splice(index, 1);
      assert.throws(() => verifyActivationControl(missing.report, missing.trusted, 1, selected)); corruptRejected++;
    }
  }
  for (const surface of surfaces) for (const kind of ['after-click-boundary', 'query-run-payload']) {
    const mutation = 'post-close-owner-bypassed', selected = {mode: 'repaired', mutation};
    const good = bindSyntheticPolicy(buildActivationMutantSchemaFixture(surface, mutation), mutation);
    const stale = mutatePostCloseWitness(copy(good), kind);
    assert.throws(() => verifyActivationControl(stale.report, stale.trusted, 1, selected), undefined,
      'stale cached finalTrace and oracles cannot hide ' + kind); cachedRejected++;
    const bad = bindSyntheticPolicy(buildActivationPostCloseRejectionFixture(surface, kind), mutation);
    assert.equal(verifyActivationEvidence(bad.report, bad.trusted, 1).status, 'failed');
    const message = kind === 'after-click-boundary' ? /original trusted click interval/ : /fixed captured command payload/;
    assert.throws(() => verifyActivationControl(bad.report, bad.trusted, 1, selected), message); witnessRejected++;
    const oldOracles = copy(bad);
    for (let index = 0; index < oldOracles.report.checks.length; index++) {
      oldOracles.report.checks[index].oracles = copy(good.report.checks[index].oracles);
      oldOracles.report.checks[index].status = good.report.checks[index].status;
    }
    oldOracles.report.status = good.report.status;
    assert.throws(() => verifyActivationControl(oldOracles.report, oldOracles.trusted, 1, selected), undefined,
      'cached kill oracles cannot bless ' + kind); cachedRejected++;
    const forgedGreen = copy(bad); forgedGreen.report.status = 'passed';
    for (const check of forgedGreen.report.checks) { check.status = 'passed'; check.oracles.forEach(oracle => oracle.pass = true); }
    assert.throws(() => verifyActivationControl(forgedGreen.report, forgedGreen.trusted, 0, selected), undefined,
      'cached green statuses cannot bless ' + kind); cachedRejected++;
  }
  for (const surface of surfaces) for (const mutation of ['core-skip-removed', 'family-emit-omitted', 'blanket-palette-submit-prevention']) {
    const fixture = bindSyntheticPolicy(buildActivationShapeRejectionFixture(surface, mutation), mutation);
    assert.equal(verifyActivationEvidence(fixture.report, fixture.trusted, 1).status, 'failed');
    for (const {case: name, oracle: id} of fixture.trusted.activationPolicy.definition.kills) {
      const oracle = findCase(fixture, name).oracles.find(oracle => oracle.id === id);
      assert(oracle && !oracle.prerequisite && !oracle.pass, 'ambiguous shape still fails designated desired oracle');
    }
    const expected = mutation === 'core-skip-removed' ? /duplicates the command/ : mutation === 'family-emit-omitted' ? /owned emit omission/ : /blanket submit reversal suppresses/;
    assert.throws(() => verifyActivationControl(fixture.report, fixture.trusted, 1, {mode: 'repaired', mutation}), expected);
    shapeRejected++;
  }
  console.log(`Activation synthetic control evidence: ${positives} valid control/red fixtures, ${greenRejected} mutant greens, ${unrelatedRejected} nondesignated reds, ${corruptRejected} corruptions, ${witnessRejected} raw-valid wrong witnesses, ${cachedRejected} cached-field forgeries, ${shapeRejected} ambiguous shapes rejected. Invented schema observations only; no renderer, browser, or native evidence.`);
  return {positives, greenRejected, unrelatedRejected, corruptRejected, witnessRejected, cachedRejected, shapeRejected};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runActivationMutantSchemaTests();
