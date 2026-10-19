import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {
  paletteBaseline, paletteBaselineTree, paletteSourcePins, paletteSurfaces, paletteCases,
  paletteErrors, paletteSourcePaths, paletteRequiredBrowserPaths, paletteRawKeys,
  paletteOracles, paletteDiagnostics, verifyPaletteEvidence,
} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';

// SYNTHETIC SCHEMA FIXTURES ONLY. This script never launches a browser or server,
// emits browser evidence, or claims the unchanged runtime satisfies a contract.
// Deliberately independent fixture literals prevent an expected-value helper from
// silently changing both a validator expectation and its test's observations.
const copy = structuredClone;
const sha = value => createHash('sha256').update(value).digest('hex');
const component = 'navigation/CommandPalette';
const baseline = '0a972e071452f7bdb9bc64f6d27d50c042108885';
const baselineTree = 'c400233c889a6701682ded31429a3ce0127bacf0';
const pins = {palette: '49ed1f84056fa13347d68801b479a4a5a8e03b53', compatibilityAudit: 'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721'};
const groups = {
  focus: ['query.continue', 'cursor.coherence'],
  preserve: ['enter.preserve', 'escape.preserve', 'text.space', 'owner.replacement'],
  adjacent: ['active.relationship', 'action.close-order', 'empty.submit'],
};
const cases = group => group === 'all' ? Object.values(groups).flat() : [...groups[group]];
const owner = (surface, slot = 'primary') => surface === 'sdui' ? 'sdui-internal-' + sha(`palette-${slot}-screen\0palette-${slot}-component`) : `palette-${slot}-component`;
const rowLiterals = [
  {label: 'Open', value: 'open-file', disabled: false},
  {label: 'Option', value: 'option-file', disabled: false},
  {label: 'Other place', value: 'other-place', disabled: false},
  {label: 'Open disabled', value: 'disabled-open', disabled: true},
  {label: 'Zebra', value: 'zebra-file', disabled: false},
];
const peerValues = ['peer-open', 'peer-option', 'peer-other', 'peer-disabled', 'peer-zebra'];
function rows(query = '', selected, slot = 'primary') {
  const labels = query === '' ? rowLiterals.map(row => row.label) : query === 'op' ? ['Open', 'Option', 'Other place', 'Open disabled'] : query === 'open' ? ['Open', 'Open disabled'] : query === 'opo' ? ['Option'] : query === 'zzzzzz' ? [] : ['Other place'];
  const data = rowLiterals.map((row, i) => ({...row, value: slot === 'primary' ? row.value : peerValues[i]}));
  const chosen = selected ?? data.find(row => labels.includes(row.label) && !row.disabled)?.value;
  return data.map(row => ({...row, id: `schema-${slot}-${row.value}`, role: 'option', hidden: !labels.includes(row.label), selected: chosen === row.value}));
}
function state(surface, {query = '', selected, open = false, generation = 'original', slot = 'primary', openerFocused = false} = {}) {
  const items = rows(query, selected, slot), active = items.find(row => row.selected && !row.disabled && !row.hidden);
  return {id: owner(surface, slot), component, ready: 'true', generation,
    openerFocused, focusedInDialog: open, open, query, queryName: slot === 'primary' ? 'cmdQuery' : 'peerQuery', focusedInput: open,
    activeTag: open ? 'INPUT' : openerFocused ? 'BUTTON' : 'BODY', activeValue: open ? query : '', activeOwner: open || openerFocused ? owner(surface, slot) : null,
    selectionStart: query.length, selectionEnd: query.length, rows: items,
    relationship: {inputID: `schema-${slot}-query`, inputType: 'search', inputRole: 'searchbox', controls: `schema-${slot}-list`, activeID: active?.id ?? null,
      listID: `schema-${slot}-list`, listRole: 'listbox', controlledIsList: true, descendantInList: Boolean(active), descendantInRoot: Boolean(active),
      descendantRole: active ? 'option' : null, descendantValue: active?.value ?? null, descendantSelected: Boolean(active), descendantVisibleEnabled: Boolean(active), uniqueIDs: true}};
}
const emptyLog = () => Object.fromEntries(['inputs', 'actions', 'changes', 'hosts', 'hostChanges', 'results', 'closes', 'lifecycle', 'bridge', 'errors', 'timeline'].map(key => [key, []]));
function record(log, kind, entry) { log[kind].push(copy(entry)); log.timeline.push({sequence: log.timeline.length + 1, kind, index: log[kind].length - 1}); }
function input(surface, type, key, value, generation = 'original', options = {}) {
  const field = options.field ?? true;
  return {type, key, code: key === null ? null : key === ' ' ? 'Space' : key.length === 1 ? 'Key' + key.toUpperCase() : key === 'Control' ? 'ControlLeft' : key === 'Shift' ? 'ShiftLeft' : key,
    data: null, inputType: null, trusted: true, targetTag: field ? 'INPUT' : 'BUTTON', field, slot: 'primary', ownerID: owner(surface), generation, value, focused: true, connected: true,
    selectionStart: field ? value.length : null, selectionEnd: field ? value.length : null, ctrl: false, alt: false, shift: false, meta: false, ...options};
}
function pair(log, surface, key, value, generation = 'original', options = {}) {
  for (const type of ['keydown', 'keyup']) record(log, 'inputs', input(surface, type, key, value, generation, options));
}
function change(log, surface, value, generation = 'original', name = 'cmdQuery') {
  const item = {id: owner(surface), component, name, value, selected: name === 'palette' ? true : null, type: null, slot: 'primary'};
  record(log, 'hostChanges', {...item, generation}); record(log, 'changes', item);
}
function edit(log, surface, before, suffix, generation = 'original') {
  let value = before;
  for (const key of suffix) {
    record(log, 'inputs', input(surface, 'keydown', key, value, generation));
    record(log, 'inputs', input(surface, 'beforeinput', null, value, generation, {data: key, inputType: 'insertText'}));
    value += key;
    record(log, 'inputs', input(surface, 'input', null, value, generation, {data: key, inputType: 'insertText'}));
    change(log, surface, value, generation);
    record(log, 'inputs', input(surface, 'keyup', key, value, generation));
  }
}
function replaceQuery(log, surface, before, text, generation = 'original') {
  record(log, 'inputs', input(surface, 'keydown', 'Control', before, generation, {ctrl: true}));
  pair(log, surface, 'A', before, generation, {ctrl: true});
  record(log, 'inputs', input(surface, 'keyup', 'Control', before, generation));
  record(log, 'inputs', input(surface, 'keydown', 'Backspace', before, generation, {selectionStart: 0}));
  record(log, 'inputs', input(surface, 'beforeinput', null, before, generation, {inputType: 'deleteContentBackward', selectionStart: 0}));
  record(log, 'inputs', input(surface, 'input', null, '', generation, {inputType: 'deleteContentBackward'}));
  change(log, surface, '', generation);
  record(log, 'inputs', input(surface, 'keyup', 'Backspace', '', generation));
  edit(log, surface, '', text, generation);
}
function snapshot(surface, options = {}, log = emptyLog()) { return {state: state(surface, options), peer: state(surface, {slot: 'peer'}), log: copy(log)}; }
function actionPayload(surface, value, action) { return {id: owner(surface), component, action, value, hasValue: true, formDataKind: 'null', formData: null, valuesKind: 'array', values: [], submitter: null, slot: 'primary'}; }
function command(surface, query, value, action, generation = 'original') {
  const log = emptyLog(), closed = state(surface, {query, selected: value, generation, openerFocused: true});
  const payload = actionPayload(surface, value, action);
  record(log, 'inputs', input(surface, 'keydown', 'Enter', query, generation));
  change(log, surface, value, generation, 'palette');
  record(log, 'hosts', {...payload, phase: 'keydown', generation, state: closed});
  record(log, 'actions', {...payload, phase: 'keydown', state: closed});
  record(log, 'results', {...payload, result: {ok: true, owner: owner(surface), generation}});
  record(log, 'closes', {slot: 'primary', ownerID: owner(surface), open: false, trusted: true});
  const down = snapshot(surface, {}, log); down.state = copy(closed);
  record(log, 'inputs', input(surface, 'keyup', 'Enter', '', generation, {field: false}));
  if (surface === 'sdui') record(log, 'bridge', {action: 'command-observed', target: 'palette-primary-result', status: 200, connected: true});
  const after = snapshot(surface, {}, log); after.state = copy(closed);
  return {down, after};
}
function rawFixture(surface, name) {
  const query = ['query.continue', 'cursor.coherence', 'enter.preserve', 'escape.preserve', 'active.relationship'].includes(name) ? 'op' : name === 'text.space' ? 'Other' : name === 'empty.submit' ? 'zzzzzz' : 'open';
  const setup = emptyLog(); edit(setup, surface, '', query);
  const raw = {ready: snapshot(surface), opened: snapshot(surface, {open: true}), before: snapshot(surface, {open: true, query}, setup)};
  const arrowLog = emptyLog();
  if (query === 'op') { pair(arrowLog, surface, 'ArrowDown', query); raw.arrow = snapshot(surface, {open: true, query, selected: 'option-file'}, arrowLog); }
  if (name === 'query.continue' || name === 'cursor.coherence') {
    const suffix = name === 'query.continue' ? 'en' : 'o'; edit(arrowLog, surface, 'op', suffix);
    raw.after = snapshot(surface, {open: true, query: 'op' + suffix}, arrowLog);
  } else if (['enter.preserve', 'owner.replacement', 'action.close-order'].includes(name)) {
    Object.assign(raw, command(surface, query, name === 'enter.preserve' ? 'option-file' : 'open-file', name === 'enter.preserve' ? 'option-command' : 'open-command'));
  } else if (name === 'escape.preserve') {
    const log = emptyLog(); record(log, 'inputs', input(surface, 'keydown', 'Escape', query)); record(log, 'inputs', input(surface, 'keyup', 'Escape', '', 'original', {field: false}));
    record(log, 'closes', {slot: 'primary', ownerID: owner(surface), open: false, trusted: true});
    raw.after = snapshot(surface, {query, selected: 'option-file', openerFocused: true}, log);
  } else if (name === 'text.space') {
    const log = emptyLog(); edit(log, surface, query, ' ');
    const downLog = copy(log); downLog.inputs.pop(); downLog.timeline.pop();
    raw.down = snapshot(surface, {open: true, query: 'Other '}, downLog);
    edit(log, surface, 'Other ', 'place'); raw.after = snapshot(surface, {open: true, query: 'Other place'}, log);
  } else if (name === 'empty.submit') {
    const log = emptyLog(); record(log, 'inputs', input(surface, 'keydown', 'Enter', query)); raw.down = snapshot(surface, {open: true, query}, log);
    record(log, 'inputs', input(surface, 'keyup', 'Enter', query)); raw.after = snapshot(surface, {open: true, query}, log);
  } else if (name === 'active.relationship') {
    raw.filtered = copy(raw.arrow);
    const log = copy(arrowLog); record(log, 'inputs', input(surface, 'keydown', 'Escape', 'op')); record(log, 'inputs', input(surface, 'keyup', 'Escape', '', 'original', {field: false}));
    replaceQuery(log, surface, 'op', 'open'); raw.refined = snapshot(surface, {open: true, query: 'open'}, log);
    replaceQuery(log, surface, 'open', 'zzzzzz'); raw.after = snapshot(surface, {open: true, query: 'zzzzzz'}, log);
  }
  if (name === 'owner.replacement') {
    const log = emptyLog(); for (const type of ['htmx:before:swap', 'htmx:after:swap', 'htmx:finally:swap']) record(log, 'lifecycle', {type, tasks: [{targetID: 'palette-primary', style: 'outerHTML'}]});
    raw.swap = {oldID: owner(surface), freshID: owner(surface), sameOwner: false, oldConnected: false, oldReady: null, freshReady: 'true', cleanups: 1, lifecycle: copy(log.lifecycle)};
    raw.replaced = snapshot(surface, {generation: 'fresh'}, log);
    raw.staleProbe = {ownerID: owner(surface), connected: false, value: 'stale-detached', inputTrusted: false, changeTrusted: false, inputDispatched: true, changeDispatched: true};
    raw.stale = copy(raw.replaced);
  }
  if (['enter.preserve', 'escape.preserve', 'owner.replacement'].includes(name)) {
    const fresh = name === 'owner.replacement', generation = fresh ? 'fresh' : 'original';
    raw.reopened = snapshot(surface, {query: fresh ? '' : query, open: true, generation}, (fresh ? raw.stale : raw.after).log);
    const log = emptyLog(); if (fresh) edit(log, surface, '', 'open', generation); else replaceQuery(log, surface, query, 'open', generation);
    raw.repeatSetup = snapshot(surface, {query: 'open', open: true, generation}, log);
    if (name === 'escape.preserve') {
      pair(log, surface, 'Tab', 'open', generation); raw.tab = snapshot(surface, {query: 'open', open: true}, log); raw.tab.state.focusedInput = false;
      record(log, 'inputs', input(surface, 'keydown', 'Shift', '', generation, {shift: true, field: false}));
      pair(log, surface, 'Tab', 'open', generation, {shift: true}); record(log, 'inputs', input(surface, 'keyup', 'Shift', 'open', generation));
      raw.shiftTab = snapshot(surface, {query: 'open', open: true}, log);
      record(log, 'closes', {slot: 'primary', ownerID: owner(surface), open: false, trusted: true});
      raw.repeat = {after: snapshot(surface, {query: 'open', openerFocused: true}, log)};
    } else raw.repeat = command(surface, 'open', 'open-file', 'open-command', generation);
  }
  assert.deepEqual(Object.keys(raw).sort(), [...paletteRawKeys(name)].sort());
  return raw;
}
function refresh(fixture) {
  for (const check of fixture.report.checks) {
    check.oracles = paletteOracles(check, fixture.report.surface); check.diagnostics = paletteDiagnostics(check);
    check.finalTrace = copy((check.raw.repeat?.after || check.raw.after).log);
    check.status = check.oracles.every(oracle => oracle.pass) ? 'passed' : 'failed';
  }
  fixture.report.status = fixture.report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  fixture.exit = fixture.report.status === 'passed' ? 0 : 1; return fixture;
}

// Exported solely for other pure schema/replay tests. These invented hashes,
// revisions and traces cannot be submitted as real browser evidence.
export function buildPaletteSchemaFixture(surface = 'go-qualified', group = 'all') {
  const sourceFiles = Object.fromEntries(paletteSourcePaths.map(path => [path, sha('synthetic schema source: ' + path)]));
  const assetPaths = [...paletteRequiredBrowserPaths.filter(path => path !== '/'), ...(surface === 'sdui' ? ['/assets/sdui.js', '/assets/sdui.css'] : [])];
  const metadata = path => { const body = 'synthetic schema bytes only: ' + path; return {sourceSHA256: sha(body), servedSHA256: sha(body), bytes: Buffer.byteLength(body)}; };
  const assets = Object.fromEntries(assetPaths.map(path => [path, {...metadata(path), contentType: path.endsWith('.css') ? 'text/css; charset=utf-8' : 'text/javascript; charset=utf-8'}]));
  const fixturePaths = ['/', '/fragment', ...(surface === 'sdui' ? ['/sdui-response-primary', '/sdui-response-peer'] : [])];
  const fixtures = Object.fromEntries(fixturePaths.map(path => [path, {...metadata(path), html: 'palette-query-fixtures/' + metadata(path).servedSHA256 + '.html', renderer: 'synthetic schema fixture; no browser claim'}]));
  const fixtureManifest = {schemaVersion: 1, surface, component, baselineCommit: baseline, baselineTree, productionMutation: 'none',
    sourceFiles: Object.entries(sourceFiles).map(([path, sha256]) => ({path, sha256, bytes: Buffer.byteLength('synthetic schema source: ' + path)})),
    identities: ['primary', 'peer'].map(slot => ({ownerID: `palette-${slot}`, nodeID: `palette-${slot}-component`, familyID: owner(surface, slot), dialogID: owner(surface, slot) + '-palette', ...(surface === 'sdui' ? {screenID: `palette-${slot}-screen`, resultID: `palette-${slot}-result`} : {})})),
    label: 'Command search', placeholder: 'Type a command', group: 'Commands', rowCount: 5, initialQuery: '', observerURL: '/fixture-observer.js', hostResultID: 'palette-owner-result'};
  const report = {suite: 'palette-query', stage: 'checks', surface, group, caseInventory: cases(group),
    revision: '1'.repeat(40), tree: '2'.repeat(40), runToken: 'synthetic-schema-token-no-browser-proof', dirty: '', actualMainBaseline: baseline, sourcePins: copy(pins),
    scope: 'Synthetic schema fixture only; no browser or implementation conformance claim.',
    browserVersion: 'synthetic-schema-no-browser', toolchain: {node: 'synthetic-schema-node', go: 'synthetic-schema-go', playwright: 'synthetic-schema-playwright'},
    standaloneDependencyProof: {SHA256: sha('synthetic schema dependency proof'), forbiddenImports: []}, sourceFiles, assets, fixtures, fixtureManifest,
    ...Object.fromEntries(paletteErrors.map(key => [key, []])), checks: [], requests: [], browserResponses: [], httpAssetProof: []};
  const proof = (path, responseFixture = path) => { const entry = assets[path] || fixtures[responseFixture]; return {path, status: 200, bytes: entry.bytes, expectedSHA256: entry.servedSHA256, receivedSHA256: entry.servedSHA256, ...(path === '/sdui-action' ? {responseFixture} : {})}; };
  const request = (check, path, extra = {}) => { const entry = assets[path] || fixtures[extra.responseFixture || path]; return {check, path, method: 'GET', htmx: null, status: 200, responseSHA256: entry.servedSHA256, responseBytes: entry.bytes, ...extra}; };
  for (const path of [...Object.keys(assets), ...Object.keys(fixtures)]) { report.httpAssetProof.push(proof(path)); report.requests.push(request(null, path)); }
  for (const name of cases(group)) {
    report.checks.push({name, raw: rawFixture(surface, name)});
    for (const path of ['/', ...assetPaths]) { report.browserResponses.push({check: name, ...proof(path)}); report.requests.push(request(name, path)); }
    if (name === 'owner.replacement') { report.browserResponses.push({check: name, ...proof('/fragment')}); report.requests.push(request(name, '/fragment', {htmx: 'true'})); }
    if (surface === 'sdui') {
      const values = name === 'enter.preserve' ? ['option-file', 'open-file'] : name === 'owner.replacement' ? ['open-file', 'open-file'] : name === 'action.close-order' ? ['open-file'] : [];
      for (const [index, value] of values.entries()) {
        const fields = {_action: 'command-observed', _csrf: 'palette-query-fixture', _request: `synthetic-schema-${name}-${index}`, _target: 'palette-primary-result', commandAction: value === 'option-file' ? 'option-command' : 'open-command', commandValue: value, component, ownerID: owner(surface)};
        report.requests.push(request(name, '/sdui-action', {method: 'POST', responseFixture: '/sdui-response-primary', fields: Object.entries(fields)}));
        report.browserResponses.push({check: name, ...proof('/sdui-action', '/sdui-response-primary')});
      }
    }
  }
  const trusted = copy(Object.fromEntries(['surface', 'group', 'revision', 'tree', 'runToken', 'sourceFiles', 'assets', 'fixtures', 'fixtureManifest', 'toolchain', 'standaloneDependencyProof'].map(key => [key, report[key]])));
  return refresh({report, trusted, exit: 0});
}

export function runPaletteEvidenceSchemaTests() {
  let accepted = 0, rejected = 0, red = 0;
  assert.equal(paletteBaseline, baseline); assert.equal(paletteBaselineTree, baselineTree); assert.deepEqual(paletteSourcePins, pins);
  assert.deepEqual(paletteSurfaces, ['go-qualified', 'go-chapter', 'sdui']);
  for (const surface of ['go-qualified', 'go-chapter', 'sdui']) for (const group of ['focus', 'preserve', 'adjacent', 'all']) {
    assert.deepEqual(paletteCases(group), cases(group));
    const fixture = buildPaletteSchemaFixture(surface, group);
    for (const check of fixture.report.checks) assert.deepEqual(check.oracles.filter(oracle => !oracle.pass), [], `synthetic desired-state fixture: ${surface}/${check.name}`);
    assert.equal(verifyPaletteEvidence(fixture.report, fixture.trusted, fixture.exit).status, 'passed'); accepted++;
    const reject = (label, mutate, {recompute = false, exit = fixture.exit, alterTrusted = false} = {}) => {
      const f = {report: copy(fixture.report), trusted: alterTrusted ? copy(fixture.trusted) : fixture.trusted, exit: fixture.exit}; mutate(alterTrusted ? f : f.report);
      assert.throws(() => { if (recompute) refresh(f); verifyPaletteEvidence(f.report, f.trusted, exit); }, undefined, `${surface}/${group}: ${label}`); rejected++;
    };
    const corruptions = [
      ['empty cases', r => { r.checks = []; }], ['missing case', r => r.checks.pop()], ['duplicate case', r => { r.checks[1] = copy(r.checks[0]); }],
      ['foreign case', r => { r.checks[0].name = 'foreign'; }], ['reordered cases', r => r.checks.reverse()], ['wrong inventory', r => r.caseInventory.pop()],
      ['missing oracle', r => r.checks[0].oracles.pop()], ['duplicate oracle', r => { r.checks[0].oracles[1] = copy(r.checks[0].oracles[0]); }],
      ['foreign oracle', r => { r.checks[0].oracles[0].id = 'foreign'; }], ['reordered oracles', r => r.checks[0].oracles.reverse()],
      ['changed cached observed', r => { r.checks[0].oracles[0].observed = false; }], ['lost prerequisite', r => { r.checks[0].oracles[0].prerequisite = false; }],
      ['changed diagnostic', r => { r.checks[0].diagnostics.coverageLimits = []; }], ['missing diagnostic', r => { delete r.checks[0].diagnostics; }],
      ['case status', r => { r.checks[0].status = 'failed'; }], ['report status', r => { r.status = 'failed'; }],
      ['source hash', r => { r.sourceFiles[paletteSourcePaths[0]] = sha('wrong'); }], ['missing source', r => { delete r.sourceFiles[paletteSourcePaths[0]]; }],
      ['extra source', r => { r.sourceFiles.foreign = sha('wrong'); }], ['asset source', r => { r.assets[assetKey(r)].sourceSHA256 = sha('wrong'); }],
      ['asset served bytes', r => { r.assets[assetKey(r)].servedSHA256 = sha('wrong'); }], ['asset length', r => { r.assets[assetKey(r)].bytes++; }],
      ['fixture source', r => { r.fixtures['/fragment'].sourceSHA256 = sha('wrong'); }], ['fixture served bytes', r => { r.fixtures['/fragment'].servedSHA256 = sha('wrong'); }],
      ['fixture length', r => { r.fixtures['/'].bytes++; }], ['manifest', r => { r.fixtureManifest.component = 'foreign'; }],
      ['missing HTTP proof', r => r.httpAssetProof.pop()], ['duplicate HTTP proof', r => r.httpAssetProof.push(copy(r.httpAssetProof[0]))], ['reordered HTTP proofs', r => r.httpAssetProof.reverse()],
      ['HTTP digest', r => { r.httpAssetProof[0].receivedSHA256 = sha('wrong'); }], ['HTTP bytes', r => { r.httpAssetProof[0].bytes++; }],
      ['missing browser proof', r => r.browserResponses.shift()], ['duplicate browser proof', r => r.browserResponses.push(copy(r.browserResponses[0]))],
      ['browser digest', r => { r.browserResponses[0].receivedSHA256 = sha('wrong'); }], ['browser bytes', r => { r.browserResponses[0].bytes++; }],
      ['foreign browser case', r => { r.browserResponses[0].check = 'foreign'; }], ['foreign browser path', r => { r.browserResponses[0].path = '/foreign'; }],
      ['foreign request case', r => { r.requests[0].check = 'foreign'; }], ['foreign request path', r => { r.requests[0].path = '/foreign'; }], ['failed request', r => { r.requests[0].status = 500; }],
      ['invocation token', r => { r.runToken = 'stale-token-from-previous-run'; }], ['revision', r => { r.revision = '3'.repeat(40); }], ['tree', r => { r.tree = '3'.repeat(40); }],
      ['dirty checkout', r => { r.dirty = ' M production'; }], ['baseline', r => { r.actualMainBaseline = '3'.repeat(40); }], ['source pin', r => { r.sourcePins.palette = '3'.repeat(40); }],
      ['toolchain', r => { r.toolchain.go = 'foreign'; }], ['missing toolchain', r => { delete r.toolchain; }], ['browser version', r => { r.browserVersion = ''; }],
      ['dependency digest', r => { r.standaloneDependencyProof.SHA256 = sha('wrong'); }], ['forbidden dependency', r => { r.standaloneDependencyProof.forbiddenImports.push('sdui'); }],
      ['startup error', r => { r.error = {}; }], ['validation error', r => { r.validationError = {}; }], ['case capture error', r => { r.checks[0].captureError = 'fixture'; }],
      ['case error', r => { r.checks[0].error = {}; }], ['final trace', r => { r.checks[0].finalTrace.errors.push({message: 'late'}); }],
      ...paletteErrors.map(key => [key, r => r[key].push({message: 'synthetic unrelated infrastructure failure'})]),
    ];
    for (const [label, mutate] of corruptions) reject(label, mutate);
    reject('zero exit cannot hide red outcome', () => {}, {exit: 1});
    for (const key of ['revision', 'tree']) reject('malformed independent ' + key, f => { f.report[key] = f.trusted[key] = 'invalid'; }, {alterTrusted: true});
    reject('malformed independent token', f => { f.report.runToken = f.trusted.runToken = 'short'; }, {alterTrusted: true});
    reject('malformed source hash despite matching cache', f => { f.report.sourceFiles[paletteSourcePaths[0]] = f.trusted.sourceFiles[paletteSourcePaths[0]] = 'invalid'; }, {alterTrusted: true});
    reject('stale current source', f => { f.trusted.sourceFiles[paletteSourcePaths[0]] = sha('new current source'); }, {alterTrusted: true});
    reject('source and served bytes disagree even with matching trusted metadata', f => { f.report.assets[assetKey(f.report)].servedSHA256 = f.trusted.assets[assetKey(f.report)].servedSHA256 = sha('mutated served bytes'); }, {alterTrusted: true});
    reject('prerequisite cannot become valid red', r => { r.checks[0].raw.ready.state.ready = null; }, {recompute: true, exit: 1});
    reject('fixed owner cannot become valid red', r => { r.checks[0].raw.before.state.id = 'foreign'; }, {recompute: true, exit: 1});
    reject('fixed row cannot become valid red', r => { r.checks[0].raw.before.state.rows[0].value = 'foreign'; }, {recompute: true, exit: 1});
    reject('fixed query cannot become valid red', r => { r.checks[0].raw.before.state.query = 'foreign'; }, {recompute: true, exit: 1});
    reject('trusted setup provenance', r => { r.checks[0].raw.before.log.inputs[0].trusted = false; }, {recompute: true, exit: 1});
    reject('trusted setup input owner', r => { r.checks[0].raw.before.log.inputs.find(e => e.type === 'input').ownerID = 'foreign'; }, {recompute: true, exit: 1});
    reject('trusted setup generation', r => { r.checks[0].raw.before.log.inputs.find(e => e.type === 'input').generation = 'fresh'; }, {recompute: true, exit: 1});
    reject('timeline lost event', r => { r.checks[0].raw.before.log.timeline.pop(); }, {recompute: true});
    reject('timeline duplicate event', r => { r.checks[0].raw.before.log.timeline.push(copy(r.checks[0].raw.before.log.timeline[0])); }, {recompute: true});
    reject('timeline foreign kind', r => { r.checks[0].raw.before.log.timeline[0].kind = 'foreign'; }, {recompute: true});
    reject('timeline reordered indices', r => { r.checks[0].raw.before.log.timeline[0].index = 1; }, {recompute: true});
    for (const [ci, check] of fixture.report.checks.entries()) {
      for (const key of paletteRawKeys(check.name)) reject(`${check.name}: missing ${key}, cache recomputed`, r => { delete r.checks[ci].raw[key]; }, {recompute: true});
      reject(`${check.name}: foreign snapshot`, r => { r.checks[ci].raw.foreign = copy(r.checks[ci].raw.ready); }, {recompute: true});
      for (const [oi, oracle] of check.oracles.entries()) {
        const forged = {...check, oracles: [...check.oracles]}; forged.oracles[oi] = {...oracle, expected: {forged: true}, observed: {forged: true}, pass: true};
        const report = {...fixture.report, checks: [...fixture.report.checks]}; report.checks[ci] = forged;
        assert.throws(() => verifyPaletteEvidence(report, fixture.trusted, 0), undefined, `${surface}/${group}/${check.name}: changed expected literal ${oi}`); rejected++;
      }
    }
    for (const name of ['enter.preserve', 'owner.replacement', 'action.close-order'].filter(name => cases(group).includes(name))) {
      for (const field of ['id', 'component', 'action', 'value', 'hasValue', 'formDataKind', 'formData', 'valuesKind', 'values', 'submitter', 'slot']) {
        for (const kind of ['actions', 'hosts', 'results']) reject(`${name}: callback ${kind}/${field}`, r => { const check = r.checks.find(c => c.name === name); check.raw.after.log[kind][0][field] = {foreign: true}; }, {recompute: true});
      }
      reject(`${name}: wrong host generation`, r => { r.checks.find(c => c.name === name).raw.after.log.hosts[0].generation = 'foreign'; }, {recompute: true});
      reject(`${name}: wrong owned result`, r => { r.checks.find(c => c.name === name).raw.after.log.results[0].result.owner = 'foreign'; }, {recompute: true});
    }
    if (cases(group).includes('owner.replacement')) {
      const req = r => r.requests.findIndex(q => q.check === 'owner.replacement' && q.path === '/fragment');
      reject('missing HTMX replacement request', r => r.requests.splice(req(r), 1));
      reject('duplicate HTMX replacement request', r => r.requests.push(copy(r.requests[req(r)])));
      reject('extra malformed HTMX replacement request', r => r.requests.push({...copy(r.requests[req(r)]), htmx: null}));
      for (const [key, value] of [['htmx', null], ['method', 'POST'], ['responseSHA256', sha('wrong')], ['responseBytes', 1]]) reject('HTMX replacement ' + key, r => { r.requests[req(r)][key] = value; });
      reject('replacement physical owner identity', r => { r.checks.find(c => c.name === 'owner.replacement').raw.swap.sameOwner = true; }, {recompute: true, exit: 1});
      reject('replacement cleanup count', r => { r.checks.find(c => c.name === 'owner.replacement').raw.swap.cleanups = 0; }, {recompute: true, exit: 1});
      reject('replacement fresh input generation', r => { r.checks.find(c => c.name === 'owner.replacement').raw.repeatSetup.log.inputs.find(e => e.type === 'input').generation = 'original'; }, {recompute: true, exit: 1});
    }
    if (surface === 'sdui') {
      const requestIndex = r => r.requests.findIndex(q => q.path === '/sdui-action');
      if (requestIndex(fixture.report) !== -1) {
        reject('missing routed POST', r => r.requests.splice(requestIndex(r), 1));
        reject('duplicate routed POST', r => r.requests.push(copy(r.requests[requestIndex(r)])));
        reject('null-owned routed POST', r => r.requests.push({...copy(r.requests[requestIndex(r)]), check: null}));
        reject('foreign request path with real fixture fallback', r => r.requests.push({...copy(r.requests[requestIndex(r)]), path: '/foreign', method: 'GET'}));
        reject('foreign response path with real fixture fallback', r => r.browserResponses.push({...copy(r.browserResponses.find(p => p.path === '/sdui-action')), path: '/foreign'}));
        reject('duplicate routed response', r => r.browserResponses.push(copy(r.browserResponses.find(p => p.path === '/sdui-action'))));
        reject('missing routed response', r => r.browserResponses.splice(r.browserResponses.findIndex(p => p.path === '/sdui-action'), 1));
        for (const [key, value] of [['method', 'GET'], ['responseFixture', '/sdui-response-peer'], ['responseSHA256', sha('wrong')], ['responseBytes', 1]]) reject('routed request ' + key, r => { r.requests[requestIndex(r)][key] = value; });
        for (const key of ['_action', '_csrf', '_request', '_target', 'commandAction', 'commandValue', 'component', 'ownerID']) reject('routed field ' + key, r => { r.requests[requestIndex(r)].fields.find(pair => pair[0] === key)[1] = 'foreign'; });
        reject('duplicate routed field', r => { const fields = r.requests[requestIndex(r)].fields; fields.push(copy(fields[0])); });
        reject('extra routed field', r => r.requests[requestIndex(r)].fields.push(['foreign', 'value']));
        reject('missing routed field', r => r.requests[requestIndex(r)].fields.pop());
      }
    }
  }
  // The validator accepts complete desired-contract failures as valid evidence,
  // while preserving nonzero exit. These are invented observations, not a run.
  for (const surface of ['go-qualified', 'go-chapter', 'sdui']) for (const [name, mutate, failure] of [
    ['query.continue', c => { c.raw.arrow.state.focusedInput = false; c.raw.after.state.query = 'op'; c.raw.after.state.focusedInput = false; }, 'continue.query-text'],
    ['cursor.coherence', c => { c.raw.after.state.rows.find(row => row.value === 'option-file').selected = false; }, 'continue.filtered-selected-rows'],
    ['active.relationship', c => { c.raw.arrow.state.relationship.activeID = null; c.raw.arrow.state.relationship.descendantInList = false; }, 'relationship.arrow.owned-active-option'],
    ['action.close-order', c => { c.raw.after.log.hosts[0].state.open = true; }, 'close-order.closed-before-host-action'],
    ['empty.submit', c => { c.raw.after.state.open = false; }, 'empty.dialog-remains-open'],
    ['empty.submit', c => {
      const event = {...actionPayload(surface, null, 'submit'), formDataKind: 'FormData', formData: [['cmdQuery', 'zzzzzz']]};
      record(c.raw.after.log, 'hosts', {...event, generation: 'original', phase: 'keydown', state: copy(c.raw.after.state)});
      record(c.raw.after.log, 'actions', {...event, phase: 'keydown', state: copy(c.raw.after.state)});
      record(c.raw.after.log, 'results', {...event, result: {ok: true, owner: owner(surface), generation: 'original'}});
    }, 'empty.no-command-or-form-submit'],
  ]) {
    const f = buildPaletteSchemaFixture(surface, 'all'), check = f.report.checks.find(c => c.name === name); mutate(check); refresh(f);
    assert.equal(f.exit, 1); assert(check.oracles.some(o => o.id === failure && !o.pass));
    assert.equal(verifyPaletteEvidence(f.report, f.trusted, f.exit).status, 'failed'); red++;
    assert.throws(() => verifyPaletteEvidence(f.report, f.trusted, 0), /nonzero contract exit/); rejected++;
    check.status = f.report.status = 'passed'; assert.throws(() => verifyPaletteEvidence(f.report, f.trusted, 0)); rejected++;
  }
  console.log(`CommandPalette pure evidence schema tests passed: ${accepted} desired schema fixtures, ${red} valid-red schema fixtures, ${rejected} corruptions rejected. Synthetic records only; browser behavior unverified.`);
  return {accepted, red, rejected};
}
const assetKey = report => Object.keys(report.assets)[0];
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) runPaletteEvidenceSchemaTests();
