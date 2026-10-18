import assert from 'node:assert/strict';
import {isDeepStrictEqual as same} from 'node:util';

// Pure source-owned contract. Report-authored expected/pass/status values are
// never targets: observations are recomputed from separately retained raw data.
export const searchableSurfaces = ['qualified', 'chapter', 'sdui'];
export const searchableGroups = {
  desired: ['phase', 'modifier.Control', 'modifier.Alt', 'modifier.Meta', 'modifier.Shift'],
  controls: ['text.space', 'filter.target', 'filter.no-results', 'filter.empty', 'filter.all-disabled', 'peer.independent', 'confirm.reopen', 'row.space'],
  lifecycle: ['swap.innerHTML', 'swap.outerHTML'],
};
export const searchableCases = group => group === 'all' ? Object.values(searchableGroups).flat() : searchableGroups[group];
export const searchableErrors = ['pageErrors', 'consoleErrors', 'requestFailures', 'serverErrors', 'transportErrors', 'runtimeErrors'];
export const searchableSourcePaths = [
  'ui/gohtmx/tests/browser/searchable-menu-confirmation-browser-test.mjs',
  'ui/gohtmx/tests/browser/searchable-menu-confirmation-evidence.mjs',
  'ui/gohtmx/tests/browser/searchable-menu-confirmation-inputs.mjs',
  'scripts/searchable-menu-confirmation-run.mjs',
  'scripts/searchable-menu-confirmation-evidence-test.mjs',
  'scripts/searchable-menu-confirmation-oracles-test.mjs',
  'ui/gohtmx/tests/fixtures/searchablefixture/fixture.go',
  'ui/gohtmx/tests/fixtures/searchablefixture/verify.go',
  'ui/gohtmx/tests/fixtures/searchablefixture/fixture_test.go',
  'ui/gohtmx/tests/fixtures/searchable-menu-confirmation/main_test.go',
  'adapters/gohtmx/tests/fixtures/searchable-menu-confirmation/main_test.go',
  'ui/gohtmx/tests/fixtures/searchable-menu-confirmation/main.go',
  'adapters/gohtmx/tests/fixtures/searchable-menu-confirmation/main.go',
  'ui/gohtmx/tests/browser/context-owner-assets.mjs',
  'ui/gohtmx/tests/browser/context-owner-controls.mjs',
  'ui/gohtmx/templates/ely-api-interaction.html', 'ui/gohtmx/ui.go',
  'ui/gohtmx/component.go', 'ui/gohtmx/menu.go', 'ui/gohtmx/components.json',
  'adapters/gohtmx/catalogue_manifest.json.gz', 'adapters/gohtmx/render.go',
  'adapters/gohtmx/formats.go', 'ui/gohtmx/tests/unit/interaction_menu_test.mjs',
  'package.json', 'package-lock.json', '.github/workflows/searchable-menu-confirmation.yml',
];
export const requiredBrowserPaths = ['/', '/assets/app.css', '/assets/ely-api.css', '/assets/ely-api-interaction.css', '/assets/htmx.min.js', '/assets/ely-api-interaction-entry.js', '/assets/ely-api.js', '/assets/ely-api-interaction.js'];
const keyProjection = event => ({type: event.type, key: event.key, trusted: event.isTrusted, ctrl: event.ctrlKey, alt: event.altKey, meta: event.metaKey, shift: event.shiftKey});
const keys = (log, key) => log.inputs.filter(event => event.key === key && ['keydown', 'keyup'].includes(event.type)).map(keyProjection);
const expectedKeys = (key, modifier = '') => ['keydown', 'keyup'].map(type => ({type, key, trusted: true, ctrl: modifier === 'Control', alt: modifier === 'Alt', meta: modifier === 'Meta', shift: modifier === 'Shift'}));
const actions = log => log.actions.map(({slot, value, action}) => ({slot, value, action}));
const hosts = log => log.hosts.map(({slot, value, action, closed}) => ({slot, value, action, closed}));
const action = (slot = 'primary', value = 'alpha-one') => ({slot, value, action: value === 'alpha-one' ? 'choose-one' : 'choose-two'});
const host = (slot = 'primary', value = 'alpha-one') => ({...action(slot, value), closed: true});
const openState = state => ({hidden: state.hidden, expanded: state.expanded, focusedFilter: state.focusedFilter, query: state.query});
const peerState = state => ({hidden: state.hidden, expanded: state.expanded, query: state.query, rows: state.rows});
const peerInitial = {hidden: true, expanded: 'false', query: 'root-query', rows: [
  {value: 'hidden', hidden: true, disabled: false}, {value: 'off', hidden: true, disabled: true},
  {value: 'alpha-one', hidden: true, disabled: false}, {value: 'alpha-two', hidden: true, disabled: false},
]};
const rowProfile = rows => rows.map(row => ({value: row.value, hidden: row.hidden, disabled: row.disabled})).sort((a, b) => a.value.localeCompare(b.value));
const targetRows = (slot, query) => rowProfile(slot === 'empty' ? [] : (slot === 'alloff' ? [{value: 'off', disabled: true}] : [{value: 'hidden', disabled: false}, {value: 'off', disabled: true}, {value: 'alpha-one', disabled: false}, {value: 'alpha-two', disabled: false}]).map(row => ({...row, hidden: query === 'zzzzzz' || row.value === 'hidden' || query === 'Alpha two' && row.value !== 'alpha-two'})));
// Rows' hidden flags include their closed panel. This fixed initial peer state
// prevents coordinated before/after corruption from blessing a foreign owner.
export function searchableOracles(check, surface) {
  const {name, raw: r} = check;
  assert(searchableCases('all').includes(name), 'known source-owned case');
  assert(searchableSurfaces.includes(surface));
  const out = [];
  const add = (id, observed, expected, prerequisite = false) => out.push({id, observed, expected, pass: same(observed, expected), prerequisite});
  const empty = ['filter.empty', 'filter.all-disabled', 'filter.no-results'].includes(name);
  const slot = name === 'filter.empty' ? 'empty' : name === 'filter.all-disabled' ? 'alloff' : 'primary';
  const query = name === 'filter.no-results' ? 'zzzzzz' : name === 'filter.target' ? 'Alpha two' : 'Alpha';
  add('fixture.production-ready', r.ready.readiness, ['true', 'true', 'true', 'true'], true);
  add('fixture.real-renderer', r.ready.screens, surface === 'sdui' ? 4 : 0, true);
  add('fixture.unique-escaped-ids', r.ready.uniqueAndEscaped, true, true);
  add('fixture.no-startup-action-or-error', [r.ready.actions, r.ready.hosts, r.ready.errors], [[], [], []], true);
  add('fixture.seed-not-leaf-value', r.ready.queries, ['root-query', 'root-query', 'root-query', 'root-query'], true);
  add('setup.open-focused-query', openState(r.before.state), {hidden: false, expanded: 'true', focusedFilter: true, query}, true);
  add('setup.exact-filtered-row-profile', rowProfile(r.before.state.rows), targetRows(slot, query), true);
  add('setup.visible-enabled-targets', r.before.state.rows.filter(row => !row.hidden && !row.disabled).map(row => row.value), empty ? [] : name === 'filter.target' ? ['alpha-two'] : ['alpha-one', 'alpha-two'], true);
  add('setup.trusted-query-input', r.queryTrace.inputs.filter(event => event.type === 'input').map(event => ({trusted: event.isTrusted, slot: event.slot, filter: event.filter})), Array.from({length: query.length + 1}, () => ({trusted: true, slot, filter: true})), true);
  add('setup.raw-filter-change', r.queryTrace.changes.at(-1), {slot, name: 'filter', value: query}, true);
  add('setup.no-implicit-action', [r.queryTrace.actions, r.queryTrace.hosts, r.queryTrace.errors, r.before.log.actions, r.before.log.hosts], [[], [], [], [], []], true);
  add('setup.peer-initial', peerState(r.before.peer), peerInitial, true);
  add('input.native-key-phases', keys(r.after.log, name === 'text.space' || name === 'row.space' ? ' ' : 'Enter'), expectedKeys(name === 'text.space' || name === 'row.space' ? ' ' : 'Enter', name.startsWith('modifier.') ? name.split('.')[1] : ''), true);
  const first = r.after.log.inputs.find(event => event.type === 'keydown' && event.key === (name === 'text.space' || name === 'row.space' ? ' ' : 'Enter'));
  add('input.intended-keydown-target', {slot: first?.slot, filter: first?.filter, value: first?.value}, {slot, filter: name !== 'row.space', value: name === 'row.space' ? 'alpha-one' : query}, true);
  if (name === 'phase') {
    add('confirm.keydown-no-action', [actions(r.down.log), hosts(r.down.log)], [[], []]);
    add('confirm.keydown-stays-open', r.down.state.hidden, false);
    add('confirm.keyup-action-once', actions(r.after.log), [action()]);
    add('confirm.keyup-host-after-dismissal', hosts(r.after.log), [host()]);
    add('confirm.callback-on-keyup', r.after.log.hosts.map(item => item.phase), ['keyup']);
    add('confirm.keyup-dismissed', r.after.state.hidden, true);
  } else if (name.startsWith('modifier.')) {
    add('modifier.no-action-either-phase', [actions(r.down.log), hosts(r.down.log), actions(r.after.log), hosts(r.after.log)], [[], [], [], []]);
    add('modifier.stays-open-both-phases', [r.down.state.hidden, r.after.state.hidden], [false, false]);
    add('modifier.retains-usable-filter', r.after.state.focusedFilter, true);
  } else if (name === 'text.space') {
    add('text.space-is-query', r.after.state.query, 'Alpha one');
    add('text.space-filter-event', r.after.log.changes.at(-1), {slot, name: 'filter', value: 'Alpha one'});
    add('text.space-no-action', [actions(r.after.log), hosts(r.after.log)], [[], []]);
    add('text.space-keeps-filter', [r.after.state.hidden, r.after.state.focusedFilter], [false, true]);
  } else if (empty) {
    add('empty.no-action-either-phase', [actions(r.down.log), hosts(r.down.log), actions(r.after.log), hosts(r.after.log)], [[], [], [], []]);
    add('empty.usable-filter', [r.after.state.hidden, r.after.state.focusedFilter], [false, true]);
  } else if (name === 'filter.target' || name === 'row.space') {
    const value = name === 'filter.target' ? 'alpha-two' : 'alpha-one';
    add('target.exact-leaf-payload', actions(r.after.log), [action(slot, value)]);
    add('target.host-observes-dismissal', hosts(r.after.log), [host(slot, value)]);
    if (name === 'row.space') add('row.space-preserved-keyup', [actions(r.down.log), r.after.log.hosts.map(item => item.phase)], [[], ['keyup']]);
  } else if (name === 'peer.independent' || name === 'confirm.reopen') {
    add('first.action-once-after-dismissal', [actions(r.after.log), hosts(r.after.log)], [[action()], [host()]]);
    const target = name === 'peer.independent' ? 'peer' : 'primary';
    add('repeat.native-key-phases', keys(r.repeat.log, 'Enter'), expectedKeys('Enter'), true);
    add('repeat.independent-action-once', [actions(r.repeat.log), hosts(r.repeat.log)], [[action(target, 'alpha-two')], [host(target, 'alpha-two')]]);
    add('repeat.exact-fresh-query', r.repeat.state.query, 'Alpha two');
  } else if (name.startsWith('swap.')) {
    add('swap.real-target-and-style', r.swap.lifecycle.filter(event => event.type === 'htmx:before:swap').flatMap(event => event.tasks.map(task => ({sameTarget: task.sameTarget, style: task.style}))), [{sameTarget: true, style: name.split('.')[1]}], true);
    add('swap.keydown-no-action', [actions(r.down.log), hosts(r.down.log)], [[], []]);
    add('swap.owner-textual-identity', [r.swap.oldID === r.swap.freshID, typeof r.swap.oldID === 'string' && r.swap.oldID.length > 0], [true, true]);
    add('swap.old-controller-disposed', [r.swap.oldConnected, r.swap.oldReady, r.swap.cleanups], [false, null, 1]);
    add('swap.new-owner-ready', [r.swap.sameOwner, r.swap.freshReady], [false, 'true']);
    const downActions = r.down.log.actions.map(({slot, value, action, closed, phase}) => ({slot, value, action, closed, phase}));
    const downHosts = r.down.log.hosts.map(({slot, value, action, closed, phase, generation}) => ({slot, value, action, closed, phase, generation}));
    const boundedEarly = same([downActions, downHosts, r.down.state.hidden], [[], [], false]) || same([downActions, downHosts, r.down.state.hidden], [[{...host(), phase: 'keydown'}], [{...host(), phase: 'keydown', generation: 'original'}], true]);
    add('swap.prephase-source-bounded', boundedEarly, true, true);
    add('swap.stale-keyup-no-additional-action', [actions(r.after.log), hosts(r.after.log)], [actions(r.down.log), hosts(r.down.log)]);
    add('swap.fresh-native-key-phases', keys(r.repeat.log, 'Enter'), expectedKeys('Enter'), true);
    add('swap.fresh-gesture-once', [actions(r.repeat.log), hosts(r.repeat.log)], [[action()], [host()]]);
    add('swap.no-old-generation-callback', r.repeat.log.hosts.map(item => item.generation), ['fresh']);
  }
  if (r.repeat) {
    const target = name === 'peer.independent' ? 'peer' : 'primary';
    const query = name.startsWith('swap.') ? 'Alpha' : 'Alpha two';
    add('repeat.setup-open-focused-query', openState(r.repeatSetup.before.state), {hidden: false, expanded: 'true', focusedFilter: true, query}, true);
    add('repeat.setup-exact-filtered-row-profile', rowProfile(r.repeatSetup.before.state.rows), targetRows(target, query), true);
    add('repeat.setup-no-action', [r.repeatSetup.queryTrace.actions, r.repeatSetup.queryTrace.hosts, r.repeatSetup.queryTrace.errors, r.repeatSetup.before.log.actions, r.repeatSetup.before.log.hosts], [[], [], [], [], []], true);
    add('repeat.setup-trusted-query', r.repeatSetup.queryTrace.inputs.filter(event => event.type === 'input').map(event => ({trusted: event.isTrusted, slot: event.slot, filter: event.filter})), Array.from({length: query.length + 1}, () => ({trusted: true, slot: target, filter: true})), true);
    add('repeat.setup-raw-filter-change', r.repeatSetup.queryTrace.changes.at(-1), {slot: target, name: 'filter', value: query}, true);
    const keydown = r.repeat.log.inputs.find(event => event.type === 'keydown' && event.key === 'Enter');
    add('repeat.intended-input-target', {slot: keydown?.slot, filter: keydown?.filter, value: keydown?.value}, {slot: target, filter: true, value: query}, true);
  }
  add('isolation.peer-unchanged', peerState(r.after.peer), peerInitial);
  add('errors.none.runtime', r.after.log.errors, []);
  if (r.repeat) add('errors.none.repeat-runtime', r.repeat.log.errors, []);
  return out;
}
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function verifySearchableEvidence(report, trusted, exitCode) {
  const {surface, group, revision, tree, runToken, sourceFiles, assets, fixtures} = trusted;
  assert(searchableSurfaces.includes(surface)); assert(searchableCases(group));
  assert.equal(report.suite, 'searchable-menu-confirmation'); assert.equal(report.stage, 'checks');
  for (const [key, value] of Object.entries({surface, group, revision, tree, runToken})) assert.equal(report[key], value, 'trusted ' + key);
  assert.equal(typeof runToken, 'string'); assert(runToken.length > 10); assert.equal(report.dirty, '');
  assert.equal(report.error, undefined); assert.equal(report.validationError, undefined);
  assert.equal(report.actualMainBaseline, '49a792722ed4704d1b6fc06d7d2ee768ffe318aa');
  assert.equal(report.sourcePins.menu, '49ed1f84056fa13347d68801b479a4a5a8e03b53');
  assert.equal(report.sourcePins.compatibilityAudit, 'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721');
  assert.equal(typeof report.browserVersion, 'string'); assert(report.browserVersion.length);
  for (const key of ['node', 'go', 'playwright']) assert.equal(typeof report.toolchain[key], 'string');
  assert.deepEqual(report.toolchain, trusted.toolchain, 'independently loaded toolchain provenance');
  assert.deepEqual(report.standaloneDependencyProof, trusted.standaloneDependencyProof, 'independently loaded standalone package boundary');
  assert(hash(report.standaloneDependencyProof?.SHA256)); assert.deepEqual(report.standaloneDependencyProof.forbiddenImports, []);
  for (const key of searchableErrors) assert.deepEqual(report[key], [], key + ': infrastructure cannot masquerade as a contract result');
  assert.deepEqual(Object.keys(sourceFiles), searchableSourcePaths); assert.deepEqual(report.sourceFiles, sourceFiles);
  for (const value of Object.values(sourceFiles)) assert(hash(value));
  assert.deepEqual(report.assets, assets, 'independently loaded production assets');
  for (const asset of Object.values(assets)) { assert(hash(asset.sourceSHA256)); assert.equal(asset.sourceSHA256, asset.servedSHA256); assert(asset.bytes > 0); }
  assert.deepEqual(Object.keys(fixtures), ['/', '/fragment']); assert.deepEqual(report.fixtures, fixtures, 'independently rendered fixture bytes');
  for (const fixture of Object.values(fixtures)) { assert(hash(fixture.sourceSHA256)); assert.equal(fixture.sourceSHA256, fixture.servedSHA256); assert.equal(fixture.html, 'searchable-menu-fixtures/' + fixture.sourceSHA256 + '.html'); }
  assert.deepEqual(report.httpAssetProof.map(item => item.path), [...Object.keys(assets), '/', '/fragment']);
  const wanted = path => assets[path] || fixtures[path];
  for (const proof of [...report.httpAssetProof, ...report.browserResponses]) {
    const spec = wanted(proof.path); assert(spec, 'foreign response path'); assert.equal(proof.status, 200);
    assert.equal(proof.expectedSHA256, spec.servedSHA256); assert.equal(proof.receivedSHA256, spec.servedSHA256); assert.equal(proof.bytes, spec.bytes);
    if (Object.hasOwn(proof, 'check')) assert(searchableCases(group).includes(proof.check), 'foreign response case');
  }
  assert.deepEqual(report.checks.map(check => check.name), searchableCases(group), 'exact unique ordered case inventory');
  for (const check of report.checks) {
    assert.equal(check.error, undefined); assert.equal(check.captureError, undefined);
    assert.deepEqual(check.finalTrace, (check.raw.repeat || check.raw.after).log, 'final trace agrees with last captured snapshot');
    const computed = searchableOracles(check, surface);
    assert.deepEqual(check.oracles, computed, check.name + ': source-owned expectations and raw observation recomputation');
    for (const oracle of computed) if (oracle.prerequisite) assert(oracle.pass, check.name + '/' + oracle.id + ': failed prerequisite');
    assert.equal(check.status, computed.every(oracle => oracle.pass) ? 'passed' : 'failed');
    for (const path of [...requiredBrowserPaths, ...(check.name.startsWith('swap.') ? ['/fragment'] : [])]) assert(report.browserResponses.some(proof => proof.check === check.name && proof.path === path), check.name + ': missing browser bytes ' + path);
    if (check.name.startsWith('swap.')) assert(report.requests.some(req => req.check === check.name && req.path === '/fragment' && req.method === 'GET' && req.htmx === 'true' && req.status === 200 && req.responseSHA256 === fixtures['/fragment'].servedSHA256), check.name + ': missing real HTMX request');
  }
  const status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  assert.equal(report.status, status); assert.equal(exitCode, status === 'passed' ? 0 : 1, 'raw nonzero contract failure must survive validation');
  return {status, surface, group, revision, tree, failed: report.checks.filter(check => check.status === 'failed').map(check => check.name)};
}
