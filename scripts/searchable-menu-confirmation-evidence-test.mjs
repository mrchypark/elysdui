import assert from 'node:assert/strict';
import {searchableSurfaces, searchableCases, searchableErrors, searchableSourcePaths, requiredBrowserPaths, searchableOracles, verifySearchableEvidence} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-evidence.mjs';

// Synthetic schema fixtures only. They never run a browser, produce browser
// evidence files, or claim that the unchanged implementation meets the contract.
const copy = structuredClone, hash = char => char.repeat(64);
const allRows = [
  {value: 'hidden', hidden: true, disabled: false}, {value: 'off', hidden: true, disabled: true},
  {value: 'alpha-one', hidden: true, disabled: false}, {value: 'alpha-two', hidden: true, disabled: false},
];
const peer = () => ({hidden: true, expanded: 'false', query: 'root-query', rows: copy(allRows)});
const log = () => ({inputs: [], actions: [], hosts: [], changes: [], errors: [], lifecycle: []});
const keyboard = (type, key, query, slot, modifier = '', filter = true) => ({type, key, isTrusted: true, ctrlKey: modifier === 'Control', altKey: modifier === 'Alt', metaKey: modifier === 'Meta', shiftKey: modifier === 'Shift', slot, filter, value: query});
function raw(name) {
  const slot = name === 'filter.empty' ? 'empty' : name === 'filter.all-disabled' ? 'alloff' : 'primary';
  const query = name === 'filter.no-results' ? 'zzzzzz' : name === 'filter.target' ? 'Alpha two' : 'Alpha';
  const key = ['text.space', 'row.space'].includes(name) ? ' ' : 'Enter', modifier = name.startsWith('modifier.') ? name.split('.')[1] : '';
  const empty = ['filter.empty', 'filter.all-disabled', 'filter.no-results'].includes(name);
  const rows = (slot === 'empty' ? [] : slot === 'alloff' ? [copy(allRows[1])] : copy(allRows)).map(row => ({...row, hidden: name === 'filter.no-results' || row.value === 'hidden' || name === 'filter.target' && row.value !== 'alpha-two'}));
  const state = {hidden: false, expanded: 'true', focusedFilter: true, query, rows};
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
  return r;
}
function make(surface, group, failing = false) {
  const assets = Object.fromEntries(requiredBrowserPaths.filter(path => path.startsWith('/assets/')).map(path => [path, {sourceSHA256: hash('a'), servedSHA256: hash('a'), bytes: 10, contentType: 'fixture'}]));
  const fixtures = Object.fromEntries(['/', '/fragment'].map(path => [path, {sourceSHA256: hash('b'), servedSHA256: hash('b'), bytes: 20, html: 'searchable-menu-fixtures/' + hash('b') + '.html', renderer: 'synthetic'}]));
  const sourceFiles = Object.fromEntries(searchableSourcePaths.map(path => [path, hash('c')]));
  const report = {suite: 'searchable-menu-confirmation', stage: 'checks', surface, group, revision: '1'.repeat(40), tree: '2'.repeat(40), runToken: 'synthetic-schema-fresh-token', dirty: '',
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
    check.oracles = searchableOracles(check, surface); check.status = check.oracles.every(oracle => oracle.pass) ? 'passed' : 'failed'; report.checks.push(check);
    for (const path of [...requiredBrowserPaths, ...(name.startsWith('swap.') ? ['/fragment'] : [])]) report.browserResponses.push({check: name, ...proof(path)});
    if (name.startsWith('swap.')) report.requests.push({check: name, method: 'GET', path: '/fragment', htmx: 'true', status: 200, responseSHA256: fixtures['/fragment'].servedSHA256});
  }
  report.status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  const trusted = copy({surface, group, revision: report.revision, tree: report.tree, runToken: report.runToken, sourceFiles, assets, fixtures, toolchain: report.toolchain, standaloneDependencyProof: report.standaloneDependencyProof});
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
  if (['lifecycle', 'all'].includes(group)) {
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
console.log(`SearchableMenu pure evidence schema tests passed; ${rejected} corruptions rejected. Synthetic records only; browser behavior unverified.`);
