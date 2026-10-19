import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadPaletteHistory} from '../ui/gohtmx/tests/browser/palette-history-fixtures.mjs';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {
  paletteBaseline, paletteBaselineTree, paletteSourcePins, paletteSurfaces, paletteCases,
  paletteErrors, paletteSourcePaths, paletteRequiredBrowserPaths, paletteOptionalBrowserPaths, paletteRawKeys,
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
  const report = {productionPolicy: 'strict', suite: 'palette-query', stage: 'checks', surface, group, caseInventory: cases(group),
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
  const trusted = copy(Object.fromEntries(['productionPolicy', 'surface', 'group', 'revision', 'tree', 'runToken', 'sourceFiles', 'assets', 'fixtures', 'fixtureManifest', 'toolchain', 'standaloneDependencyProof'].map(key => [key, report[key]])));
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

// These tests exercise transport accounting only. No desired behavioral oracle
// or captured observation is rewritten to satisfy a transport expectation.
function exercisePaletteTransport(fixture, verifier = verifyPaletteEvidence) {
  const {report, trusted, exit} = fixture, name = report.checks[0].name;
  const runtime = '/assets/ely-api-interaction.js', font = '/assets/ely/fonts/Inter-Regular.ttf';
  const matches = (entry, path) => entry.check === name && entry.path === path;
  const baseline = verifier(report, trusted, exit);
  assert(report.requests.some(entry => matches(entry, font)), 'transport test has an observed optional font');
  const corruptions = [
    ['mandatory runtime request omitted', r => { r.requests = r.requests.filter(entry => !matches(entry, runtime)); }],
    ['mandatory runtime pair omitted', r => { r.requests = r.requests.filter(entry => !matches(entry, runtime)); r.browserResponses = r.browserResponses.filter(entry => !matches(entry, runtime)); }],
    ['preflight runtime request omitted', r => { r.requests = r.requests.filter(entry => !(entry.check === null && entry.path === runtime)); }],
    ['preflight request branch omitted', r => { r.requests = r.requests.filter(entry => entry.check !== null); }],
    ['duplicate mandatory runtime request', r => r.requests.push(copy(r.requests.find(entry => matches(entry, runtime))))],
    ['mandatory request moved to another case', r => { r.requests.find(entry => matches(entry, runtime)).check = report.checks[1].name; }],
    ['known fixture cannot invent a case fetch', r => {
      const entry = r.fixtures['/fragment'];
      r.requests.push({check: name, path: '/fragment', method: 'GET', htmx: 'true', status: 200, responseSHA256: entry.servedSHA256, responseBytes: entry.bytes});
      r.browserResponses.push({check: name, path: '/fragment', status: 200, expectedSHA256: entry.servedSHA256, receivedSHA256: entry.servedSHA256, bytes: entry.bytes});
    }],
    ['runtime request forged HTMX flag', r => { r.requests.find(entry => matches(entry, runtime)).htmx = 'true'; }],
    ['browser proof lost case ownership', r => { delete r.browserResponses.find(entry => matches(entry, runtime)).check; }],
    ['preflight proof acquired browser ownership', r => { r.httpAssetProof[0].check = name; }],
    ['optional font request omitted alone', r => { r.requests = r.requests.filter(entry => !matches(entry, font)); }],
    ['optional font response omitted alone', r => { r.browserResponses = r.browserResponses.filter(entry => !matches(entry, font)); }],
    ['optional font coordinated wrong hashes', r => {
      r.requests.find(entry => matches(entry, font)).responseSHA256 = sha('foreign transport bytes');
      const proof = r.browserResponses.find(entry => matches(entry, font)); proof.expectedSHA256 = proof.receivedSHA256 = sha('foreign transport bytes');
    }],
    ['duplicate optional font pair', r => { r.requests.push(copy(r.requests.find(entry => matches(entry, font)))); r.browserResponses.push(copy(r.browserResponses.find(entry => matches(entry, font)))); }],
    ['unexpected static request fields', r => { r.requests.find(entry => matches(entry, runtime)).fields = []; }],
  ];
  for (const [label, mutate] of corruptions) {
    const altered = copy(report); mutate(altered);
    assert.throws(() => verifier(altered, trusted, exit), undefined, report.surface + '/' + report.group + ': ' + label);
  }
  // Font usage is optional, not a mandatory behavior. A missing pair must not
  // cause the test to invent a fetch. A one-sided or inconsistent pair is bad.
  const absent = copy(report);
  absent.requests = absent.requests.filter(entry => !matches(entry, font));
  absent.browserResponses = absent.browserResponses.filter(entry => !matches(entry, font));
  assert.deepEqual(verifier(absent, trusted, exit), baseline, 'optional absent pair preserves raw behavioral verdict');
  return {rejected: corruptions.map(([name]) => name), optionalAbsentStatus: baseline.status};
}
function runPaletteTransportSchemaTests() {
  assert.deepEqual(paletteOptionalBrowserPaths, ['/assets/ely/fonts/Inter-Regular.ttf', '/assets/ely/fonts/Inter-SemiBold.ttf']);
  let rejected = 0;
  for (const surface of ['go-qualified', 'go-chapter', 'sdui']) for (const group of ['focus', 'preserve', 'adjacent', 'all']) {
    const f = buildPaletteSchemaFixture(surface, group), path = '/assets/ely/fonts/Inter-Regular.ttf';
    // Original synthetic fixtures contain no optional font use and pass above.
    // Add one explicitly synthetic observed pair and its preflight source bytes.
    const bytes = Buffer.from('synthetic optional font bytes; no browser claim');
    const entry = {sourceSHA256: sha(bytes), servedSHA256: sha(bytes), bytes: bytes.length, contentType: 'font/ttf'};
    f.report.assets[path] = copy(entry); f.trusted.assets[path] = copy(entry);
    const proof = {path, status: 200, expectedSHA256: entry.servedSHA256, receivedSHA256: entry.servedSHA256, bytes: entry.bytes};
    const request = {check: null, path, method: 'GET', htmx: null, status: 200, responseSHA256: entry.servedSHA256, responseBytes: entry.bytes};
    f.report.httpAssetProof.splice(Object.keys(f.report.assets).length - 1, 0, copy(proof));
    f.report.requests.push(copy(request));
    f.report.browserResponses.push({check: f.report.checks[0].name, ...proof});
    f.report.requests.push({...request, check: f.report.checks[0].name});
    rejected += exercisePaletteTransport(f).rejected.length;
  }
  console.log(`CommandPalette transport schema regression passed: ${rejected} rejected corruptions, 12 optional-absence controls. Synthetic records only.`);
}

// Immutable report/invocation/exit byte hashes copied from the independently
// API/ZIP-verified 80560c72 push and de94a891 PR artifact manifest. These are
// archived-report validator regressions, not native evidence at this new HEAD.
const actualTransportReceipts = [
  [
    "push",
    "palette-query-go-qualified-adjacent",
    "6fa1743c7398ba5dba61d0ebc8c3292a30ce6b9cecadcaf739ca3f35d45cf8c4",
    "79a82bd632a593632bfe20eff9666082912ade4c0fac43d5fca8c693965872b0",
    "3c8378396c3477afb2210d91613bea020c122203c0c4e1842be7efb47451d861"
  ],
  [
    "push",
    "palette-query-go-chapter-adjacent",
    "8f4a21209c77cf2987867c69a7e5c52152c2fe3996185de88e7cb3b07c018567",
    "81e74d00a1edeecf71a0defd2869a7609c449436f67d57df860f7febdfb929a2",
    "7eee90650adcd775c0361e6cdeb9044ab471fe054f44f95074cbb6c226b9d73d"
  ],
  [
    "push",
    "palette-query-go-qualified-focus",
    "423ac2af3a69e68b5f800d39330d1ecacd43b8375b6d2a37f8fcb50b02061fc5",
    "b05ada7df56cf29717d410b91f5276c001152579a913a92609e4e8d416e3c7ff",
    "a2db98cb66ea991c4d43630905ba5d7490c7b89c0ad453b4ab33c1e11024e3a6"
  ],
  [
    "push",
    "palette-query-sdui-preserve",
    "eb3ca41eaf1866cbc6c91a99165459b7d84fa8b33662ec32a83f887b9515c22a",
    "e5865c527d29a422113f77bdb1d95aeae2a82cecc155ed6eb5273d82e93c58b2",
    "b080d5158acd69e73832010bff2dbc5534993e0a2598e902cf1ad2caac871430"
  ],
  [
    "push",
    "palette-query-go-chapter-focus",
    "280df169a346ce951777e24f7382208892de82e01dda2710fda6610e4a79dc52",
    "4dafe3ec5014c7d01cdea26aad319f89f813969418444c7958206a4c9c9da938",
    "0a9d7a0479ec999619b3d77c2829ec9f0e9b4c8a5d348b0d807fd42ade67fb1f"
  ],
  [
    "push",
    "palette-query-go-chapter-preserve",
    "8b0dca9deae910a50fc75c7e4f44f59042e9916b7ff8bedae41cf5863dd5d8af",
    "e42d2c15aef2f5cfad8318fffcfaef592f4f3a7dfeefd132deb56878365a0e7f",
    "961fbf8a0abc4e84678e76bae6982b9e774ce683fd3bda4741f6d29ad99ede49"
  ],
  [
    "push",
    "palette-query-sdui-focus",
    "c97acf78841986096adbaecaa99f48bed55e1641ba9626953a498ea4a8089254",
    "5b4d7c68e8bfe6018bce1ff63bca79c377983c585329d9f026f9d3ced28d26c9",
    "88951e5b8917cfc86e4b285a8efe93aed6dacbb5a30ccecb949b095bba773d9d"
  ],
  [
    "push",
    "palette-query-sdui-adjacent",
    "6a0ee533dabab5659f8feaf25d6f3ab25ab2bd18b88e97b788d669dc6bcb2124",
    "02bcef0495e681c231d8f4d13ec1394b43dabecabae40e8a73f69ed2940666cb",
    "e709956dc2f5086e4bb50555d60124dd33409680d9ba9ea04a88b9e19bfde644"
  ],
  [
    "push",
    "palette-query-go-qualified-preserve",
    "51656a6f72e30b12eb2255c9a2555ce68a11eff70b7fda9a74052185b312051f",
    "cdb74c869bd7d9736a8c6d42e5e4d91d7a02a472db4abf5b24f3311032eb5575",
    "365989f0e75011203d5ceae0c8830d6fc53c6e7040a5efeca08f886c8ec5b0e6"
  ],
  [
    "pr",
    "palette-query-go-qualified-preserve",
    "5f54fb35924954256d2c698176b7f777333d0458708307559f9fdba0172e8c0b",
    "bb1a8479b63ce59e44c791f2ed08be1d7ef193711ce954d13e5ed48502c7723a",
    "b39092c5d52fa437db308d3de329750a3aa70604dd480c21bbdec15aaf0941cc"
  ],
  [
    "pr",
    "palette-query-go-qualified-adjacent",
    "7326261e16676cd0aa5a3efbcc9f0c274cb4a2b30aec2ac04eba1e1ae5246f2e",
    "c11af2402c3a3aa7784b968534144cc90e9799f1a2e17f8c747c8728123a9b60",
    "e32d97037528a2dca4b814d046f05925d4e5b81ee57addebd0d49e3856a0a6b3"
  ],
  [
    "pr",
    "palette-query-go-chapter-focus",
    "758e5b4b41d2bfae5878bec313d6b09fffcea8502b50bc90e94ee80d29fe5641",
    "f900bd4ad8dbd8298aa6e7b7687c21d3675c073a2eb3bf068943b980f1c082e1",
    "924250eb5b07d799d0e4c509e0cab28982df4f49394eee6da4cfdce584e0cf5d"
  ],
  [
    "pr",
    "palette-query-go-chapter-adjacent",
    "3d09f349c90e0edfa2ef2310af40ca55e83d00d8ad9af0f37b86998a77a9a27f",
    "608e7874311de5ab4482e93d3532b45ab66f85234b8b184cdbc0413e04f45816",
    "4f1b5099d71445a1d1a467683523763f1df974c834412c3407afdd4b09d2d0ae"
  ],
  [
    "pr",
    "palette-query-sdui-preserve",
    "bd319aecc63871d93cff49d4ba773b33bc9ab1f165d72fd66ac68e2fd2536f52",
    "cf52b6f209842fbcaac507f0c5705221a9fbfe68f22a65ab3ef3bb3ff7171904",
    "2dab0d02e7902c631bb3cd5dd403d4b72b1f802f4f3e63d5f4bc3202aa6f5d2f"
  ],
  [
    "pr",
    "palette-query-sdui-focus",
    "741ace84f67e1c8730b9bd3480e50f9a7cfc6eb6af87878877cf335c72ef7645",
    "57ef01894f50fb8b19f03ebbff55cb6992b984dc43f3f8b8ab35077711473a9d",
    "a021d3b9a324e27be3efe7267894d0bc932e63c8f39fcd844be49651fb86760e"
  ],
  [
    "pr",
    "palette-query-sdui-adjacent",
    "2e2052146a3cf6d523446e28bfbd3f186947bae72b557d430ccc10f5ede26fb2",
    "0fc9cc1046300e9fc455ea21ad76f58e0eb74a5f9198013eae620696ecbc3b04",
    "080b1f76390d87a3a9f3c61421ec2598e5af01471238e16c59cfde1d2a117b5f"
  ],
  [
    "pr",
    "palette-query-go-qualified-focus",
    "a646d4db1693179d728fd2b658f1850be760d8b6af5ceae650ed9a4f13a8068f",
    "ef02311dfb2a1739b23d92c7d7b36d6d3bd7d82656d30bce9e23263a96468536",
    "ab4875f9660a53806a0ccfa23d032ac07b8ce33f464a33ffc376d6c8e592b62c"
  ],
  [
    "pr",
    "palette-query-go-chapter-preserve",
    "9073d340fc288b3f3f46816534e4ee43058014ccd00a9672ff4fcc5ee5e3eac6",
    "9993264d47dff310fc386d2d22dd9dbb76aef33bb473ce4528aad030436d915f",
    "3c556bbe6c1f1484014a5a29b85adef49e9fd726b21124ae3e49903ec6d7ce71"
  ]
];
// This immutable ancestor already contains the transport hardening, but predates
// the explicit production-policy schema. Loading its exact hash avoids inventing
// current policy/source metadata for old records. The default/current verifier
// above continues to require the independently selected current policy.
const historicalTransportValidator = Object.freeze({
  revision: '4ba625b64cd991cf3874639aace590eae70f279d',
  path: 'ui/gohtmx/tests/browser/palette-query-evidence.mjs',
  sha256: '914e91e84c580153573237eae8e1a131c4942bd4a9825b029d8344d0f698057b',
});
export async function runPaletteTransportActualReportRegression(root) {
  const source = loadPaletteHistory(fileURLToPath(new URL('../', import.meta.url)))
    .source(historicalTransportValidator.revision, historicalTransportValidator.path);
  assert.equal(sha(source), historicalTransportValidator.sha256, 'fixed historical transport validator bytes');
  const historical = await import('data:text/javascript;base64,' + source.toString('base64'));
  const results = [];
  for (const [event, name, reportSHA256, invocationSHA256, exitSHA256] of actualTransportReceipts) {
    const path = join(root, event, 'original', name, name + '.json');
    const bytes = await Promise.all([path, path + '.invocation.json', path + '.exit.json'].map(path => readFile(path)));
    assert.deepEqual(bytes.map(sha), [reportSHA256, invocationSHA256, exitSHA256], 'independent immutable archived receipt bytes: ' + event + '/' + name);
    const [report, trusted, exit] = bytes.map(bytes => JSON.parse(bytes));
    for (const key of ['revision', 'tree', 'runToken', 'surface', 'group']) {
      assert.equal(report[key], trusted[key]);
      if (['revision', 'tree', 'runToken'].includes(key)) assert.equal(exit[key], trusted[key]);
    }
    assert.equal(report.revision, event === 'push' ? '80560c7218b171f72dabe91bd513d19e12a1d80e' : 'de94a891f72737953f803efee2edae0ecb445ab1');
    assert.equal(report.tree, 'f775624923f634fce976178c8612d7fc3563dd9d');
    results.push({event, name, ...exercisePaletteTransport({report, trusted, exit: exit.exitCode}, historical.verifyPaletteEvidence)});
  }
  console.log(JSON.stringify({kind: 'immutable archived-report compatibility with fixed historical validator; no candidate or new native certification', historicalTransportValidator, archivedReports: results.length,
    rejected: results.reduce((sum, r) => sum + r.rejected.length, 0), optionalAbsentStatuses: results.map(r => r.optionalAbsentStatus), results}));
  return results;
}

const assetKey = report => Object.keys(report.assets)[0];
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv[2] === '--actual-transport-root') {
    assert.equal(process.argv.length, 4, 'one immutable artifact root required');
    await runPaletteTransportActualReportRegression(process.argv[3]);
  } else {
    assert.equal(process.argv.length, 2, 'unknown schema-test argument');
    runPaletteEvidenceSchemaTests(); runPaletteTransportSchemaTests();
  }
}
