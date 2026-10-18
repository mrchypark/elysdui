import assert from 'node:assert/strict';
import {searchableSurfaces, searchableCases, searchableErrors, searchableSourcePaths, requiredBrowserPaths, searchableOracles, searchableReplacementOracles, verifySearchableEvidence} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-evidence.mjs';

import {searchableControls, searchableIntervention, searchableMutantCases} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-controls.mjs';

// Synthetic schema fixtures only. They never run a browser, produce browser
// evidence files, or claim that the unchanged implementation meets the contract.
const copy = structuredClone, hash = char => char.repeat(64);
const allRows = [
  {value: 'hidden', hidden: true, disabled: false}, {value: 'off', hidden: true, disabled: true},
  {value: 'alpha-one', hidden: true, disabled: false}, {value: 'alpha-two', hidden: true, disabled: false},
];
const peer = () => ({hidden: true, expanded: 'false', query: 'root-query', rows: copy(allRows)});
const log = () => ({inputs: [], actions: [], hosts: [], changes: [], errors: [], lifecycle: []});
const keyboard = (type, key, query, slot, modifier = '', filter = true) => ({type, key, isTrusted: true, ctrlKey: modifier === 'Control', altKey: modifier === 'Alt', metaKey: modifier === 'Meta', shiftKey: modifier === 'Shift', slot, filter, value: query, code: key === 'Enter' ? 'Enter' : key === ' ' ? 'Space' : key, targetID: null, activeID: null, focusedTarget: true, connected: true, ownerID: slot, panelID: slot + '-panel', targetTag: filter ? 'INPUT' : 'BUTTON', ownerGeneration: 'original'});
function raw(name) {
  const slot = name === 'filter.empty' ? 'empty' : name === 'filter.all-disabled' ? 'alloff' : 'primary';
  const query = name === 'filter.no-results' ? 'zzzzzz' : name === 'filter.target' ? 'Alpha two' : 'Alpha';
  const key = ['text.space', 'row.space'].includes(name) ? ' ' : 'Enter', modifier = name.startsWith('modifier.') ? name.split('.')[1] : '';
  const empty = ['filter.empty', 'filter.all-disabled', 'filter.no-results'].includes(name);
  const rows = (slot === 'empty' ? [] : slot === 'alloff' ? [copy(allRows[1])] : copy(allRows)).map(row => ({...row, hidden: name === 'filter.no-results' || row.value === 'hidden' || name === 'filter.target' && row.value !== 'alpha-two'}));
  const state = {id: slot, hidden: false, expanded: 'true', focusedFilter: true, query, rows};
  const before = {state: copy(state), peer: peer(), log: log()};
  const down = copy(before); down.log.inputs.push(keyboard('keydown', key, name === 'row.space' ? 'alpha-one' : query, slot, modifier, name !== 'row.space'));
  const after = copy(down); after.log.inputs.push(keyboard('keyup', key, query, slot, modifier, name !== 'row.space'));
  const action = (target, value, phase = 'keyup', generation = 'original') => ({slot: target, value, action: value === 'alpha-one' ? 'choose-one' : 'choose-two', closed: true, phase, generation});
  const choose = (snapshot, target = slot, value = name === 'filter.target' ? 'alpha-two' : 'alpha-one', generation = 'original') => {
    snapshot.log.actions.push(action(target, value)); snapshot.log.hosts.push(action(target, value, 'keyup', generation)); snapshot.state.hidden = true; snapshot.state.expanded = 'false'; snapshot.state.focusedFilter = false;
  };
  if (!modifier && !empty && name !== 'text.space' && !name.startsWith('swap.')) choose(after);
  if (name === 'text.space') { after.state.query = 'Alpha one'; after.log.changes.push({slot, name: 'filter', value: 'Alpha one'}); }
  const r = {ready: {readiness: Array(4).fill('true'), screens: 0, uniqueAndEscaped: true, queries: Array(4).fill('root-query'), actions: [], hosts: [], errors: []}, before, down, after,
    queryTrace: {actions: [], hosts: [], errors: [], inputs: Array.from({length: query.length + 1}, () => ({type: 'input', isTrusted: true, slot, filter: true})), changes: [{slot, name: 'filter', value: query}]}};
  if (name.startsWith('swap.')) r.swap = {lifecycle: [{type: 'htmx:before:swap', tasks: [{sameTarget: true, style: name.split('.')[1]}]}], oldID: 'primary', freshID: 'primary', oldConnected: false, oldReady: null, cleanups: 1, sameOwner: false, freshReady: 'true'};
  if (['peer.independent', 'confirm.reopen'].includes(name) || name.startsWith('swap.')) {
    const target = name === 'peer.independent' ? 'peer' : 'primary', value = name.startsWith('swap.') ? 'alpha-one' : 'alpha-two';
    r.repeat = {state: {...copy(state), query: name.startsWith('swap.') ? 'Alpha' : 'Alpha two'}, peer: peer(), log: log()};
    r.repeat.state.rows = copy(allRows).map(row => ({...row, hidden: row.value === 'hidden' || !name.startsWith('swap.') && row.value !== 'alpha-two'}));
    r.repeatSetup = {before: copy(r.repeat), queryTrace: {actions: [], hosts: [], errors: [], inputs: Array.from({length: r.repeat.state.query.length + 1}, () => ({type: 'input', isTrusted: true, slot: target, filter: true})), changes: [{slot: target, name: 'filter', value: r.repeat.state.query}]}};
    r.repeat.log.inputs = ['keydown', 'keyup'].map(type => keyboard(type, 'Enter', r.repeat.state.query, target));
    choose(r.repeat, target, value, name.startsWith('swap.') ? 'fresh' : 'original');
  }
  if (name.startsWith('swap.')) {
    const before = {state: {...copy(state), query: 'root-query', rows: copy(allRows)}, peer: peer(), log: copy(down.log)};
    before.log.changes.push({slot: 'primary', name: 'filter', value: 'root-query'});
    const after = {state: copy(state), peer: peer(), log: copy(before.log)};
    const inputEvents = [], keyEvent = (type, key, code, value, modifier = '') => ({...keyboard(type, key, value, 'primary', modifier), code, ownerGeneration: 'fresh'});
    inputEvents.push(keyEvent('keydown', 'Control', 'ControlLeft', 'root-query', 'Control'), keyEvent('keydown', 'A', 'KeyA', 'root-query', 'Control'), keyEvent('keyup', 'A', 'KeyA', 'root-query', 'Control'), keyEvent('keyup', 'Control', 'ControlLeft', 'root-query'));
    const edit = (key, code, before, value) => inputEvents.push(keyEvent('keydown', key, code, before), {...keyEvent('input', null, null, value), key: null}, keyEvent('keyup', key, code, value));
    edit('Backspace', 'Backspace', 'root-query', '');
    let value = '';
    for (const key of 'Alpha') { edit(key, 'Key' + key.toUpperCase(), value, value + key); value += key; }
    const queryTrace = {inputs: inputEvents, actions: [], hosts: [], changes: [{slot: 'primary', name: 'filter', value: 'Alpha'}], errors: []};
    for (const [key, events] of Object.entries(queryTrace)) after.log[key].push(...copy(events));
    r.replacementSetup = {before, after, queryTrace, identity: {freshOwner: true, oldConnected: false, sameTextualID: true, ownerID: 'primary', panelID: 'primary-panel', fieldID: null, generation: 'fresh', focusedTag: 'INPUT', focusedFilter: true, focusedFreshOwner: true}};
    r.after.log = copy(after.log); r.after.log.inputs.push({...keyboard('keyup', 'Enter', 'Alpha', 'primary'), ownerGeneration: 'fresh'});
  }
  return r;
}
function make(surface, group, failing = false) {
  const assets = Object.fromEntries(requiredBrowserPaths.filter(path => path.startsWith('/assets/')).map(path => [path, {sourceSHA256: hash('a'), servedSHA256: hash('a'), bytes: 10, contentType: 'fixture'}]));
  const fixtures = Object.fromEntries(['/', '/fragment'].map(path => [path, {sourceSHA256: hash('b'), servedSHA256: hash('b'), bytes: 20, html: 'searchable-menu-fixtures/' + hash('b') + '.html', renderer: 'synthetic'}]));
  const sourceFiles = Object.fromEntries(searchableSourcePaths.map(path => [path, hash('c')]));
  const report = {suite: 'searchable-menu-confirmation', stage: 'checks', surface, group, caseInventory: searchableCases(group), mutation: '', revision: '1'.repeat(40), tree: '2'.repeat(40), runToken: 'synthetic-schema-fresh-token', dirty: '',
    actualMainBaseline: '49a792722ed4704d1b6fc06d7d2ee768ffe318aa', sourcePins: {menu: '49ed1f84056fa13347d68801b479a4a5a8e03b53', compatibilityAudit: 'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721'},
    standaloneDependencyProof: {SHA256: hash('f'), forbiddenImports: []}, browserVersion: 'synthetic-schema-fixture', toolchain: {node: 'fixture', go: 'fixture', playwright: 'fixture'}, ...Object.fromEntries(searchableErrors.map(key => [key, []])), assets, fixtures, sourceFiles, checks: [], requests: [], browserResponses: []};
  const proof = path => ({path, status: 200, bytes: (assets[path] || fixtures[path]).bytes, expectedSHA256: (assets[path] || fixtures[path]).servedSHA256, receivedSHA256: (assets[path] || fixtures[path]).servedSHA256});
  report.httpAssetProof = [...Object.keys(assets), '/', '/fragment'].map(proof);
  for (const name of searchableCases(group)) {
    const check = {name, raw: raw(name)}; check.raw.ready.screens = surface === 'sdui' ? 4 : 0;
    if (failing && name === 'phase') {
      check.raw.down.log.actions = copy(check.raw.after.log.actions); check.raw.down.log.hosts = copy(check.raw.after.log.hosts); check.raw.down.state.hidden = true;
      check.raw.after.log.hosts[0].phase = 'keydown';
    }
    check.finalTrace = copy((check.raw.repeat || check.raw.after).log);
    check.oracles = searchableOracles(check, surface); check.replacementOracles = searchableReplacementOracles(check); check.status = check.oracles.every(oracle => oracle.pass) ? 'passed' : 'failed'; report.checks.push(check);
    for (const path of [...requiredBrowserPaths, ...(name.startsWith('swap.') ? ['/fragment'] : [])]) report.browserResponses.push({check: name, ...proof(path)});
    if (name.startsWith('swap.')) report.requests.push({check: name, method: 'GET', path: '/fragment', htmx: 'true', status: 200, responseSHA256: fixtures['/fragment'].servedSHA256});
  }
  report.status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  const trusted = copy({surface, group, caseInventory: searchableCases(group), mutation: '', revision: report.revision, tree: report.tree, runToken: report.runToken, sourceFiles, assets, fixtures, toolchain: report.toolchain, standaloneDependencyProof: report.standaloneDependencyProof});
  return {report, trusted, exit: report.status === 'passed' ? 0 : 1};
}
let rejected = 0;
for (const surface of searchableSurfaces) for (const group of ['desired', 'controls', 'lifecycle', 'all']) {
  const fixture = make(surface, group);
  assert.equal(verifySearchableEvidence(fixture.report, fixture.trusted, fixture.exit).status, 'passed');
  const reject = (name, mutate, exit = fixture.exit) => {
    const r = copy(fixture.report); mutate(r); assert.throws(() => verifySearchableEvidence(r, fixture.trusted, exit), undefined, name); rejected++;
  };
  const corruptions = [
    ['empty cases', r => { r.checks = []; }], ['missing case', r => r.checks.pop()],
    ['duplicate case', r => { r.checks[1] = copy(r.checks[0]); }], ['foreign case', r => { r.checks[0].name = 'foreign'; }],
    ['reordered cases', r => r.checks.reverse()], ['missing oracle', r => r.checks[0].oracles.pop()],
    ['duplicate oracle', r => { r.checks[0].oracles[1] = copy(r.checks[0].oracles[0]); }],
    ['foreign oracle', r => { r.checks[0].oracles[0].id = 'foreign'; }],
    ['stale cached pass', r => { r.checks[0].raw.ready.uniqueAndEscaped = false; }],
    ['altered observed value', r => { r.checks[0].oracles[0].observed = false; }],
    ['altered raw input provenance', r => { r.checks[0].raw.after.log.inputs[0].isTrusted = false; }],
    ['lost prerequisite', r => { r.checks[0].oracles[0].prerequisite = false; }],
    ['cached case status', r => { r.checks[0].status = 'failed'; }], ['cached report status', r => { r.status = 'failed'; }],
    ['changed source', r => { r.sourceFiles[searchableSourcePaths[0]] = hash('d'); }],
    ['missing source', r => { delete r.sourceFiles[searchableSourcePaths[0]]; }],
    ['changed asset source', r => { r.assets[Object.keys(r.assets)[0]].sourceSHA256 = hash('d'); }],
    ['changed served bytes', r => { r.assets[Object.keys(r.assets)[0]].servedSHA256 = hash('d'); }],
    ['changed fixture', r => { r.fixtures['/fragment'].servedSHA256 = hash('d'); }],
    ['missing HTTP proof', r => r.httpAssetProof.pop()], ['changed HTTP bytes', r => { r.httpAssetProof[0].receivedSHA256 = hash('d'); }],
    ['missing browser proof', r => r.browserResponses.shift()], ['changed browser bytes', r => { r.browserResponses[0].receivedSHA256 = hash('d'); }],
    ['foreign browser case', r => { r.browserResponses[0].check = 'foreign'; }],
    ['foreign mutation', r => { r.mutation = 'foreign'; }], ['untrusted intervention', r => { r.causalIntervention = {}; }],
    ['stale invocation', r => { r.runToken = 'old'; }], ['wrong revision', r => { r.revision = '3'.repeat(40); }],
    ['wrong tree', r => { r.tree = '3'.repeat(40); }], ['dirty source', r => { r.dirty = ' M runtime'; }],
    ['wrong toolchain', r => { r.toolchain.go = 'foreign'; }], ['missing toolchain', r => { delete r.toolchain; }],
    ['wrong dependency proof', r => { r.standaloneDependencyProof.SHA256 = hash('d'); }], ['missing dependency proof', r => { delete r.standaloneDependencyProof; }],
    ['forbidden import', r => { r.standaloneDependencyProof.forbiddenImports.push('sdui'); }],
    ['case infrastructure error', r => { r.checks[0].error = {}; }], ['startup error', r => { r.error = {}; }],
    ['final trace corruption', r => { r.checks[0].finalTrace.errors.push({message: 'late'}); }],
    ...searchableErrors.map(key => [key, r => r[key].push({message: 'unrelated'})]),
  ];
  for (const [name, mutate] of corruptions) reject(name, mutate);
  // Attack every expected value, including relational swap values, rather than
  // a hand-picked handful. Coordinated cached observed/expected/pass/status
  // edits cannot replace the independent raw snapshots or source-owned target.
  for (let c = 0; c < fixture.report.checks.length; c++) for (let i = 0; i < fixture.report.checks[c].oracles.length; i++) {
    reject(`coordinated target ${c}/${i}`, r => { const o = r.checks[c].oracles[i]; o.expected = o.observed = {forged: true}; o.pass = true; r.checks[c].status = r.status = 'passed'; });
  }
  for (let c = 0; c < fixture.report.checks.length; c++) for (let i = 0; i < fixture.report.checks[c].replacementOracles.length; i++) {
    reject(`coordinated replacement target ${c}/${i}`, r => { const o = r.checks[c].replacementOracles[i]; o.expected = o.observed = {forged: true}; o.pass = true; });
  }
  if (['lifecycle', 'all'].includes(group)) {
    for (const [label, damage] of [
      ['missing replacement keyboard phases', c => { c.raw.replacementSetup.queryTrace.inputs = c.raw.replacementSetup.queryTrace.inputs.filter(event => event.type === 'input'); }],
      ['lost replacement release prefix', c => { c.raw.after.log.inputs.splice(1, 1); }],
      ['wrong fresh release target', c => { c.raw.after.log.inputs.at(-1).focusedTarget = false; }],
      ['extra fresh release Enter down', c => { c.raw.after.log.inputs.push(keyboard('keydown', 'Enter', 'Alpha', 'primary')); }],
      ['reordered replacement event interleaving', c => { const events = c.raw.replacementSetup.queryTrace.inputs; [events[5], events[6]] = [events[6], events[5]]; }],
      ['lost original press prefix', c => { c.raw.replacementSetup.before.log.inputs[0].ownerGeneration = 'fresh'; }],
      ['empty replacement results', c => { c.raw.replacementSetup.after.state.rows.forEach(row => { row.hidden = true; }); }],
      ['wrong replacement physical owner', c => { c.raw.replacementSetup.identity.freshOwner = false; }],
      ['untrusted replacement edit', c => { c.raw.replacementSetup.queryTrace.inputs[0].isTrusted = false; }],
      ['replacement Enter down', c => { c.raw.replacementSetup.after.log.inputs.push(keyboard('keydown', 'Enter', 'Alpha', 'primary')); }],
      ['implicit replacement action', c => { c.raw.replacementSetup.queryTrace.actions.push({slot: 'primary', value: 'alpha-one'}); }],
    ]) reject(label, r => {
      const c = r.checks.find(c => c.name === 'swap.innerHTML'); damage(c); c.replacementOracles = searchableReplacementOracles(c);
    });
    reject('coordinated relational snapshots', r => {
      const c = r.checks.find(c => c.name === 'swap.innerHTML');
      c.raw.down.log.actions = c.raw.after.log.actions = [{slot: 'primary', value: 'wrong', action: 'foreign', closed: true, phase: 'keydown'}];
      c.oracles = searchableOracles(c, surface); c.status = r.status = 'passed'; c.finalTrace = copy(c.raw.repeat.log);
    });
  }
  if (['controls', 'all'].includes(group)) {
    reject('coordinated repeat wrong input', r => {
      const c = r.checks.find(c => c.name === 'confirm.reopen'); c.raw.repeat.log.inputs[0].filter = false;
      c.oracles = searchableOracles(c, surface); c.status = r.status = 'passed'; c.finalTrace = copy(c.raw.repeat.log);
    });
  }
  reject('coordinated missing disabled row', r => {
    const c = r.checks[0]; c.raw.before.state.rows = c.raw.before.state.rows.filter(row => row.value !== 'off');
    c.oracles = searchableOracles(c, surface); c.status = r.status = 'passed';
  });
  reject('coordinated query action before clear', r => {
    const c = r.checks[0]; c.raw.queryTrace.actions.push({slot: 'primary', value: 'foreign'}); c.raw.queryTrace.hosts.push({slot: 'primary', value: 'foreign'});
    c.oracles = searchableOracles(c, surface); c.status = r.status = 'passed';
  });
  if (['controls', 'all'].includes(group)) reject('coordinated repeat query action before clear', r => {
    const c = r.checks.find(c => c.name === 'confirm.reopen'); c.raw.repeatSetup.queryTrace.actions.push({slot: 'primary', value: 'foreign'});
    c.oracles = searchableOracles(c, surface); c.status = r.status = 'passed';
  });
  reject('raw exit mismatch', () => {}, 1);
  if (['desired', 'all'].includes(group)) {
    const red = make(surface, group, true);
    assert.equal(red.exit, 1); assert.equal(verifySearchableEvidence(red.report, red.trusted, red.exit).status, 'failed');
    assert.throws(() => verifySearchableEvidence(red.report, red.trusted, 0), /nonzero/); rejected++;
    const phase = red.report.checks.find(check => check.name === 'phase');
    assert.deepEqual(phase.oracles.filter(o => !o.pass).map(o => o.id), ['confirm.keydown-no-action', 'confirm.keydown-stays-open', 'confirm.callback-on-keyup']);
  }
}
// Each synthetic red is independently recomputed from raw observations. These
// exercise validation only and cannot establish that a browser killed a mutant.
const refresh = fixture => {
  for (const check of fixture.report.checks) {
    check.oracles = searchableOracles(check, fixture.report.surface);
    check.replacementOracles = searchableReplacementOracles(check);
    check.finalTrace = copy((check.raw.repeat || check.raw.after).log);
    check.status = check.oracles.every(oracle => oracle.pass) ? 'passed' : 'failed';
  }
  fixture.report.status = fixture.report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  fixture.exit = fixture.report.status === 'passed' ? 0 : 1;
};
function mutantFixture(surface, mutation) {
  const fixture = make(surface, 'all'), {report, trusted} = fixture, control = searchableControls[mutation];
  report.mutation = trusted.mutation = mutation;
  report.causalIntervention = searchableIntervention(mutation);
  report.assets[control.file].servedSHA256 = trusted.assets[control.file].servedSHA256 = hash('d');
  for (const proof of [...report.httpAssetProof, ...report.browserResponses]) if (proof.path === control.file) proof.receivedSHA256 = proof.expectedSHA256 = hash('d');
  const inject = (snapshot, phase = 'keyup', generation = 'original') => {
    const item = {slot: 'primary', value: 'alpha-one', action: 'choose-one', closed: true, phase, generation};
    snapshot.log.actions = [copy(item)]; snapshot.log.hosts = [copy(item)];
  };
  for (const check of report.checks) if (Object.hasOwn(control.failures, check.name)) {
    const r = check.raw;
    if (mutation === 'activate-on-keydown') {
      inject(r.down, 'keydown'); r.down.state.hidden = true;
      inject(r.after, 'keydown');
      if (check.name.startsWith('swap.')) {
        inject(r.replacementSetup.before, 'keydown'); inject(r.replacementSetup.after, 'keydown');
      }
    } else if (mutation === 'bypass-filter-modifiers' || mutation === 'confirm-filter-space') {
      inject(r.after); r.after.state.hidden = true; r.after.state.expanded = 'false'; r.after.state.focusedFilter = false;
      if (mutation === 'confirm-filter-space') { r.after.state.query = 'Alpha'; r.after.log.changes = [{slot: 'primary', name: '', value: 'Alpha'}]; }
    } else { inject(r.after, 'keyup', 'fresh'); r.after.state.hidden = true; r.after.state.expanded = 'false'; r.after.state.focusedFilter = false; r.after.log.changes.push({slot: 'primary', name: '', value: 'Alpha'}); }
  }
  report.caseInventory = searchableMutantCases(mutation);
  report.checks = report.checks.filter(check => report.caseInventory.includes(check.name));
  report.browserResponses = report.browserResponses.filter(proof => report.caseInventory.includes(proof.check));
  report.requests = report.requests.filter(proof => report.caseInventory.includes(proof.check));
  refresh(fixture); return fixture;
}
for (const surface of searchableSurfaces) for (const mutation of Object.keys(searchableControls)) {
  const fixture = mutantFixture(surface, mutation);
  assert.equal(verifySearchableEvidence(fixture.report, fixture.trusted, fixture.exit).status, 'failed');
  assert.equal(fixture.exit, 1);
  const reject = (name, edit, exit, expected) => {
    const f = copy(fixture); edit(f); refresh(f);
    assert.throws(() => verifySearchableEvidence(f.report, f.trusted, exit ?? f.exit), expected, mutation + ': ' + name); rejected++;
  };
  reject('explicit inventory altered', f => { f.report.caseInventory = ['foreign']; });
  reject('extra non-designated case', f => { f.report.checks.push(make(surface, 'all').report.checks.find(check => !f.report.caseInventory.includes(check.name))); });
  reject('duplicate designated case', f => { f.report.checks.push(copy(f.report.checks[0])); });
  reject('foreign designated case', f => { f.report.checks[0].name = 'filter.empty'; });
  if (fixture.report.checks.length > 1) reject('reordered designated cases', f => { f.report.checks.reverse(); });
  reject('raw exit hidden', () => {}, 0);
  reject('unknown causal identity', f => { f.report.mutation = 'foreign'; });
  reject('altered mutation metadata', f => { f.report.causalIntervention.anchorCounts[0] = 2; });
  reject('unchanged served runtime', f => { f.report.assets[searchableControls[mutation].file].servedSHA256 = hash('a'); });
  reject('mutated unrelated asset', f => { f.report.assets['/assets/app.css'].servedSHA256 = hash('d'); f.trusted.assets['/assets/app.css'].servedSHA256 = hash('d'); });
  reject('lost required failing case', f => { f.report.checks = f.report.checks.filter(check => check.name !== Object.keys(searchableControls[mutation].failures)[0]); });
  reject('prerequisite failure with designated failure intact', f => { f.report.checks[0].raw.ready.uniqueAndEscaped = false; });
  reject('unrelated failure with designated failure intact', f => { f.report.checks[0].raw.after.peer.query = 'foreign'; });
  reject('wrong payload cannot be a kill', f => {
    const c = f.report.checks.find(check => check.name === Object.keys(searchableControls[mutation].failures)[0]);
    c.raw.after.log.actions[0].value = 'wrong';
  });
  reject('wrong callback generation cannot be a kill', f => {
    const c = f.report.checks.find(check => check.name === Object.keys(searchableControls[mutation].failures)[0]);
    c.raw.after.log.hosts[0].generation = 'foreign';
  });
  if (mutation === 'release-without-arm') reject('callback without settled replacement dismissal', f => { f.report.checks[0].raw.after.state.expanded = 'true'; });
  if (mutation === 'release-without-arm') reject('coordinated callback before edit and release cannot be a kill', f => {
    const c = f.report.checks[0];
    for (const snapshot of [c.raw.replacementSetup.before, c.raw.replacementSetup.after]) {
      snapshot.log.actions = copy(c.raw.after.log.actions); snapshot.log.hosts = copy(c.raw.after.log.hosts);
    }
    // Keep all cached/segment observations consistent with the forged early
    // callback. The release now adds zero action or host callbacks.
    c.raw.replacementSetup.queryTrace.actions = c.raw.replacementSetup.queryTrace.hosts = [];
  }, undefined, /replacement.no-action-or-input-before-edit/);
  reject('extra callback cannot be a kill', f => {
    const c = f.report.checks.find(check => check.name === Object.keys(searchableControls[mutation].failures)[0]);
    c.raw.after.log.hosts.push(copy(c.raw.after.log.hosts[0]));
  });
  reject('green mutant cannot be a kill', f => { f.report.checks = make(surface, 'all').report.checks.filter(check => f.report.caseInventory.includes(check.name)); });
  reject('unrelated console error', f => { f.report.consoleErrors.push({message: 'failure'}); });
}
console.log(`SearchableMenu pure evidence schema tests passed; ${rejected} corruptions rejected. Synthetic records only; browser behavior unverified.`);
