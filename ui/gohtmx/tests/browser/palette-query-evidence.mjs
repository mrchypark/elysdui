import assert from 'node:assert/strict';
import {paletteHistorySourcePaths} from './palette-history-fixtures.mjs';
import {verifyPaletteProductionPolicy} from './palette-query-production-policy.mjs';
import {createHash} from 'node:crypto';
import {isDeepStrictEqual as same} from 'node:util';
export const paletteBaseline = '0a972e071452f7bdb9bc64f6d27d50c042108885';
export const paletteBaselineTree = 'c400233c889a6701682ded31429a3ce0127bacf0';
export const paletteSourcePins = {palette: '49ed1f84056fa13347d68801b479a4a5a8e03b53', compatibilityAudit: 'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721'};
export const paletteSurfaces = ['go-qualified', 'go-chapter', 'sdui'];
export async function recordPaletteBrowserOutcome(request, check, origin, report) {
  const responseURL = request.url(), method = request.method(); let path, status = null;
  try {
    const url = new URL(responseURL); path = url.pathname;
    assert.equal(url.origin, origin, 'no remote browser assets');
    const response = await request.response();
    if (!response) {
      report.transportErrors.push({check, responseURL, path, method, status, message: request.failure()?.errorText || 'browser request ended without a response'});
      return;
    }
    status = response.status();
    const responseFixture = path === '/sdui-action' ? '/sdui-response-primary' : path;
    const wanted = report.assets[path] || report.fixtures[responseFixture]; assert(wanted, 'unexpected browser response');
    const bytes = await response.body(), receivedSHA256 = createHash('sha256').update(bytes).digest('hex');
    const proof = {check, path, ...(path === '/sdui-action' ? {responseFixture} : {}), status, expectedSHA256: wanted.servedSHA256, receivedSHA256, bytes: bytes.length};
    report.browserResponses.push(proof);
    if (status !== 200 || receivedSHA256 !== wanted.servedSHA256 || bytes.length !== wanted.bytes) report.transportErrors.push(proof);
  } catch (error) {
    report.transportErrors.push({check, responseURL, path: path ?? null, method, status, message: String(error)});
  }
}
const groups = {focus: ['query.continue', 'cursor.coherence'], preserve: ['enter.preserve', 'escape.preserve', 'text.space', 'owner.replacement'], adjacent: ['active.relationship', 'action.close-order', 'empty.submit']};
export function paletteCases(group = 'all') { assert(group === 'all' || Object.hasOwn(groups, group), 'known palette case group'); return group === 'all' ? Object.values(groups).flat() : [...groups[group]]; }
export const paletteErrors = ['pageErrors', 'consoleErrors', 'requestFailures', 'serverErrors', 'transportErrors', 'runtimeErrors'];
export const paletteSourcePaths = [
  ...paletteHistorySourcePaths,
  'ui/gohtmx/tests/browser/palette-query-positive-witnesses.mjs',
  'scripts/palette-query-supplemental-schema-fixture.mjs',
  'scripts/palette-query-positive-witnesses-test.mjs',
  'scripts/palette-query-causal-controls.mjs', 'scripts/palette-query-causal-controls-test.mjs',
  'scripts/palette-query-causal-replay.mjs', 'scripts/palette-query-causal-replay-test.mjs', 'ui/gohtmx/tests/browser/diagnostics/palette-query-causal-aggregation.md',
  'ui/gohtmx/tests/browser/diagnostics/palette-query-baseline.md',
  'ui/gohtmx/tests/browser/palette-query-production-policy.mjs',
  'scripts/palette-query-production-policy-test.mjs',
  'ui/gohtmx/tests/browser/diagnostics/palette-query-production-policy.md',
  'ui/gohtmx/tests/browser/palette-query-browser-test.mjs', 'ui/gohtmx/tests/browser/palette-query-observer.js',
  'ui/gohtmx/tests/browser/palette-query-evidence.mjs', 'ui/gohtmx/tests/browser/palette-query-inputs.mjs',
  'scripts/palette-query-run.mjs', 'scripts/palette-query-replay.mjs', 'scripts/palette-query-evidence-test.mjs', 'scripts/palette-query-oracles-test.mjs',
  'ui/gohtmx/tests/unit/palette_query_test.mjs',
  'ui/gohtmx/tests/fixtures/palettefixture/fixture.go', 'ui/gohtmx/tests/fixtures/palettefixture/verify.go', 'ui/gohtmx/tests/fixtures/palettefixture/fixture_test.go',
  'ui/gohtmx/tests/fixtures/palette-query/main.go', 'ui/gohtmx/tests/fixtures/palette-query/main_test.go',
  'adapters/gohtmx/tests/fixtures/palette-query/main.go', 'adapters/gohtmx/tests/fixtures/palette-query/main_test.go',
  'ui/gohtmx/tests/browser/context-owner-assets.mjs', 'ui/gohtmx/tests/browser/context-owner-controls.mjs',
  'ui/gohtmx/assets/ely-api.js', 'ui/gohtmx/assets/ely-api-interaction.js', 'ui/gohtmx/assets/ely-api-interaction-entry.js',
  'ui/gohtmx/assets/ely-controls.js', 'ui/gohtmx/assets/ely-patterns.js', 'ui/gohtmx/assets/htmx.min.js',
  'ui/gohtmx/assets/ely-api-interaction.css', 'ui/gohtmx/assets/ely/icons/check.svg',
  'ui/gohtmx/templates/ely-api-interaction.html', 'ui/gohtmx/templates/ely-api.html', 'ui/gohtmx/templates/ui-client.html',
  'ui/gohtmx/ui.go', 'ui/gohtmx/component.go', 'ui/gohtmx/components.json',
  'adapters/gohtmx/catalogue_manifest.json.gz', 'adapters/gohtmx/catalogue.go', 'adapters/gohtmx/render.go', 'adapters/gohtmx/registry.go',
  'adapters/gohtmx/assets/sdui.js', 'sdui/schema.go', 'sdui/compile.go', 'sdui/resolve.go',
  'package.json', 'package-lock.json', '.github/workflows/palette-query.yml',
];
export const paletteRequiredBrowserPaths = ['/', '/fixture-observer.js', '/assets/app.css', '/assets/ely-api.css', '/assets/ely-api-interaction.css', '/assets/ely-controls.css', '/assets/ely-patterns.css', '/assets/ely-controls.js', '/assets/ely-patterns.js', '/assets/htmx.min.js', '/assets/ely-api-interaction-entry.js', '/assets/ely-api.js', '/assets/ely-api-interaction.js'];
// Font loading is optional; when observed, its request and response must agree.
// This bounded fixture uses only these two faces. Other preflight assets are
// not permission to invent a browser fetch in a case.
export const paletteOptionalBrowserPaths = ['/assets/ely/fonts/Inter-Regular.ttf', '/assets/ely/fonts/Inter-SemiBold.ttf'];
export const paletteReportName = (surface, group) => `palette-query-${surface}-${group}.json`;
export const paletteOwner = (surface, slot = 'primary') => surface === 'sdui' ? 'sdui-internal-' + createHash('sha256').update(`palette-${slot}-screen\0palette-${slot}-component`).digest('hex') : `palette-${slot}-component`;
const component = 'navigation/CommandPalette';
export const paletteRows = (slot = 'primary') => [
  ['Open', slot === 'primary' ? 'open-file' : 'peer-open', false],
  ['Option', slot === 'primary' ? 'option-file' : 'peer-option', false],
  ['Other place', slot === 'primary' ? 'other-place' : 'peer-other', false],
  ['Open disabled', slot === 'primary' ? 'disabled-open' : 'peer-disabled', true],
  ['Zebra', slot === 'primary' ? 'zebra-file' : 'peer-zebra', false],
].map(([label, value, disabled]) => ({label, value, disabled}));
const rowProfile = rows => rows.map(({label, value, disabled, hidden, selected, role}) => ({label, value, disabled, hidden, selected, role})).sort((a, b) => a.value.localeCompare(b.value));
export function paletteExpectedRows(query, selected = null, slot = 'primary') {
  const visibleLabels = query === '' ? ['Open', 'Option', 'Other place', 'Open disabled', 'Zebra'] : query === 'op' ? ['Open', 'Option', 'Other place', 'Open disabled'] : query === 'open' ? ['Open', 'Open disabled'] : query === 'opo' ? ['Option'] : query === 'zzzzzz' ? [] : ['Other place'];
  const first = paletteRows(slot).find(row => visibleLabels.includes(row.label) && !row.disabled)?.value;
  return rowProfile(paletteRows(slot).map(row => ({...row, role: 'option', hidden: !visibleLabels.includes(row.label), selected: row.value === (selected ?? first)})));
}
const identity = state => ({id: state.id, component: state.component, ready: state.ready, generation: state.generation, queryName: state.queryName});
const expectedIdentity = (surface, slot = 'primary', generation = 'original') => ({id: paletteOwner(surface, slot), component, ready: 'true', generation, queryName: slot === 'primary' ? 'cmdQuery' : 'peerQuery'});
const peer = state => ({...identity(state), open: state.open, query: state.query, rows: rowProfile(state.rows)});
const noActions = log => [log.actions, log.hosts, log.results];
const selected = state => state.rows.filter(row => row.selected).map(row => row.value);
const visible = state => state.rows.filter(row => !row.hidden && !row.disabled).map(row => row.value);
const payload = row => Object.fromEntries(['id', 'component', 'action', 'value', 'hasValue', 'formDataKind', 'formData', 'valuesKind', 'values', 'submitter', 'slot'].map(key => [key, row[key]]));
export const paletteExpectedAction = (surface, value, action, slot = 'primary') => ({id: paletteOwner(surface, slot), component, action, value, hasValue: true, formDataKind: 'null', formData: null, valuesKind: 'array', values: [], submitter: null, slot});
const keyTrace = log => log.inputs.filter(e => ['keydown', 'keyup'].includes(e.type)).map(e => ({type: e.type, key: e.key, trusted: e.trusted, ctrl: e.ctrl, alt: e.alt, shift: e.shift, meta: e.meta}));
const keys = key => ['keydown', 'keyup'].map(type => ({type, key, trusted: true, ctrl: false, alt: false, shift: false, meta: false}));
const queryChanges = log => log.changes.filter(e => e.name === 'cmdQuery').map(({id, component, name, value}) => ({id, component, name, value}));
const hostQueries = log => log.hostChanges.filter(e => e.name === 'cmdQuery').map(({id, component, name, value}) => ({id, component, name, value}));
const queryEvent = (surface, value) => ({id: paletteOwner(surface), component, name: 'cmdQuery', value});
const logs = raw => Object.values(raw).flatMap(value => value?.log ? [value.log] : value?.after?.log ? [value.down?.log, value.after.log].filter(Boolean) : []);
export const paletteRawKeys = name => ({
  'query.continue': ['ready', 'opened', 'before', 'arrow', 'after'],
  'cursor.coherence': ['ready', 'opened', 'before', 'arrow', 'after'],
  'enter.preserve': ['ready', 'opened', 'before', 'arrow', 'down', 'after', 'reopened', 'repeatSetup', 'repeat'],
  'escape.preserve': ['ready', 'opened', 'before', 'arrow', 'after', 'reopened', 'repeatSetup', 'tab', 'shiftTab', 'repeat'],
  'text.space': ['ready', 'opened', 'before', 'down', 'after'],
  'owner.replacement': ['ready', 'opened', 'before', 'down', 'after', 'swap', 'replaced', 'staleProbe', 'stale', 'reopened', 'repeatSetup', 'repeat'],
  'active.relationship': ['ready', 'opened', 'before', 'arrow', 'filtered', 'refined', 'after'],
  'action.close-order': ['ready', 'opened', 'before', 'down', 'after'],
  'empty.submit': ['ready', 'opened', 'before', 'down', 'after'],
})[name];
const logKeys = ['inputs', 'actions', 'changes', 'hosts', 'hostChanges', 'results', 'closes', 'lifecycle', 'bridge', 'errors', 'timeline'];
export function assertPaletteRawShape(check) {
  assert.deepEqual(Object.keys(check.raw).sort(), [...paletteRawKeys(check.name)].sort(), 'exact source-owned raw snapshot inventory');
  for (const [key, value] of Object.entries(check.raw)) {
    if (key === 'swap' || key === 'staleProbe') continue;
    const snapshots = key === 'repeat' ? (assert.deepEqual(Object.keys(value).sort(), check.name === 'escape.preserve' ? ['after'] : ['after', 'down']), Object.values(value)) : [value];
    for (const snapshot of snapshots) {
      assert.deepEqual(Object.keys(snapshot).sort(), ['log', 'peer', 'state']);
      assert.deepEqual(Object.keys(snapshot.log).sort(), [...logKeys].sort());
      for (const events of Object.values(snapshot.log)) assert(Array.isArray(events));
      const indexes = Object.fromEntries(logKeys.filter(key => key !== 'timeline').map(key => [key, 0]));
      snapshot.log.timeline.forEach((event, index) => { assert.equal(event.sequence, index + 1); assert(Object.hasOwn(indexes, event.kind)); assert.equal(event.index, indexes[event.kind]++); });
      for (const [kind, count] of Object.entries(indexes)) assert.equal(snapshot.log[kind].length, count, 'timeline retains every raw event');
    }
  }
}
const editProjection = event => ({type: event.type, key: event.key, data: event.data, inputType: event.inputType, value: event.value, start: event.selectionStart, end: event.selectionEnd, field: event.field, targetTag: event.targetTag});
export function paletteTyping(text, seed = '') {
  const events = []; let value = seed;
  for (const char of text) {
    for (const type of ['keydown', 'beforeinput', 'input', 'keyup']) {
      if (type === 'input') value += char;
      const editing = ['beforeinput', 'input'].includes(type);
      events.push({type, key: editing ? null : char, data: editing ? char : null, inputType: editing ? 'insertText' : null, value, start: value.length, end: value.length, field: true, targetTag: 'INPUT'});
    }
  }
  return events;
}
export function paletteOracles(check, surface) {
  assert(paletteSurfaces.includes(surface)); assert(paletteCases().includes(check.name));
  assertPaletteRawShape(check);
  const {name, raw: r} = check, out = [];
  const add = (id, observed, expected, prerequisite = false) => out.push({id, observed, expected, pass: same(observed, expected), prerequisite});
  const expectationClass = name === 'active.relationship' ? 'future-repair-prerequisite' : ['action.close-order', 'empty.submit'].includes(name) ? 'separate-adjacent-gap' : 'existing-contract';
  add('scope.requirement-class', expectationClass, expectationClass, true);
  add('fixture.primary-identity', identity(r.ready.state), expectedIdentity(surface), true);
  add('fixture.primary-initial-state', {open: r.ready.state.open, query: r.ready.state.query, rows: rowProfile(r.ready.state.rows)}, {open: false, query: '', rows: paletteExpectedRows('')}, true);
  const peerExpected = {...expectedIdentity(surface, 'peer'), open: false, query: '', rows: paletteExpectedRows('', null, 'peer')};
  add('fixture.peer-fixed-state', peer(r.ready.peer), peerExpected, true);
  add('fixture.unique-ids', r.ready.state.relationship.uniqueIDs, true, true);
  add('fixture.no-startup-actions-or-errors', [noActions(r.ready.log), r.ready.log.errors], [[[], [], []], []], true);
  add('setup.normal-opener-focus', {open: r.opened.state.open, focusedInput: r.opened.state.focusedInput, query: r.opened.state.query}, {open: true, focusedInput: true, query: ''}, true);
  const query = ['query.continue', 'cursor.coherence', 'enter.preserve', 'escape.preserve', 'active.relationship'].includes(name) ? 'op' : name === 'text.space' ? 'Other' : name === 'empty.submit' ? 'zzzzzz' : 'open';
  add('setup.fixed-query-state', {query: r.before.state.query, focusedInput: r.before.state.focusedInput, open: r.before.state.open, rows: rowProfile(r.before.state.rows)}, {query, focusedInput: true, open: true, rows: paletteExpectedRows(query)}, true);
  add('setup.native-edit-interleaving-and-caret', r.before.log.inputs.map(editProjection), paletteTyping(query), true);
  add('setup.exact-trusted-typing-keys', keyTrace(r.before.log), [...query].flatMap(keys), true);
  add('setup.trusted-native-input-values', r.before.log.inputs.filter(e => e.type === 'input').map(e => ({trusted: e.trusted, field: e.field, ownerID: e.ownerID, generation: e.generation, value: e.value, data: e.data, inputType: e.inputType})), [...query].map((data, i) => ({trusted: true, field: true, ownerID: paletteOwner(surface), generation: 'original', value: query.slice(0, i + 1), data, inputType: 'insertText'})), true);
  add('setup.local-query-payload', queryChanges(r.before.log).at(-1), queryEvent(surface, query), true);
  add('setup.host-query-payload', hostQueries(r.before.log).at(-1), queryEvent(surface, query), true);
  add('setup.no-command-action', noActions(r.before.log), [[], [], []], true);
  if (r.arrow) {
    add('arrow.native-key-pair', keyTrace(r.arrow.log), keys('ArrowDown'), true);
    add('arrow.query-unchanged', r.arrow.state.query, 'op', true);
    add('arrow.visible-enabled-cursor', {selected: selected(r.arrow.state), rows: rowProfile(r.arrow.state.rows)}, {selected: ['option-file'], rows: paletteExpectedRows('op', 'option-file')}, true);
    add('arrow.no-action', noActions(r.arrow.log), [[], [], []], true);
    if (['query.continue', 'cursor.coherence', 'active.relationship'].includes(name)) add('arrow.input-retains-dom-focus', r.arrow.state.focusedInput, true);
  }
  if (name === 'query.continue' || name === 'cursor.coherence') {
    const suffix = name === 'query.continue' ? 'en' : 'o', refined = 'op' + suffix;
    add('continue.native-key-sequence', keyTrace(r.after.log), [...keys('ArrowDown'), ...[...suffix].flatMap(keys)], true);
    add('continue.native-edit-interleaving-and-caret', r.after.log.inputs.slice(2).map(editProjection), paletteTyping(suffix, 'op'));
    add('continue.query-text', r.after.state.query, refined);
    add('continue.input-focus-and-caret', {focusedInput: r.after.state.focusedInput, start: r.after.state.selectionStart, end: r.after.state.selectionEnd}, {focusedInput: true, start: refined.length, end: refined.length});
    add('continue.native-text-insertion', r.after.log.inputs.filter(e => e.type === 'input').map(e => ({trusted: e.trusted, field: e.field, value: e.value, data: e.data, ownerID: e.ownerID})), [...suffix].map((data, i) => ({trusted: true, field: true, value: 'op' + suffix.slice(0, i + 1), data, ownerID: paletteOwner(surface)})));
    add('continue.filtered-selected-rows', rowProfile(r.after.state.rows), paletteExpectedRows(refined));
    add('continue.exact-enabled-results', visible(r.after.state), name === 'query.continue' ? ['open-file'] : ['option-file']);
    add('continue.local-query-payload', queryChanges(r.after.log).at(-1), queryEvent(surface, refined));
    add('continue.host-query-payload', hostQueries(r.after.log).at(-1), queryEvent(surface, refined));
    add('continue.no-command-action', noActions(r.after.log), [[], [], []]);
  }
  const command = (prefix, down, after, value, action, generation = 'original') => {
    const wanted = paletteExpectedAction(surface, value, action);
    add(prefix + '.native-enter-pair', keyTrace(after.log), keys('Enter'), true);
    add(prefix + '.keydown-activates-once', down.log.actions.map(payload), [wanted]);
    add(prefix + '.completed-gesture-once', after.log.actions.map(payload), [wanted]);
    add(prefix + '.host-exact-payload', after.log.hosts.map(payload), [wanted]);
    add(prefix + '.host-generation', after.log.hosts.map(e => e.generation), [generation]);
    add(prefix + '.selection-change', after.log.changes.filter(e => e.name === 'palette').map(({id, component, name, value, selected}) => ({id, component, name, value, selected})), [{id: paletteOwner(surface), component, name: 'palette', value, selected: true}]);
    add(prefix + '.host-selection-change', after.log.hostChanges.filter(e => e.name === 'palette').map(({id, component, name, value, selected, generation}) => ({id, component, name, value, selected, generation})), [{id: paletteOwner(surface), component, name: 'palette', value, selected: true, generation}]);
    add(prefix + '.host-result-owned', after.log.results.map(e => ({...payload(e), result: e.result})), [{...wanted, result: {ok: true, owner: paletteOwner(surface), generation}}]);
    add(prefix + '.native-dialog-close', after.log.closes, [{slot: 'primary', ownerID: paletteOwner(surface), open: false, trusted: true}]);
    add(prefix + '.closed-after-down-and-release', [down.state.open, after.state.open, after.state.openerFocused], [false, false, true]);
    add(prefix + '.one-keydown-action-phase', after.log.hosts.map(e => e.phase), ['keydown']);
    add(prefix + '.bridge-owner', after.log.bridge, surface === 'sdui' ? [{action: 'command-observed', target: 'palette-primary-result', status: 200, connected: true}] : []);
  };
  if (['enter.preserve', 'owner.replacement', 'action.close-order'].includes(name)) {
    command('enter', r.down, r.after, name === 'enter.preserve' ? 'option-file' : 'open-file', name === 'enter.preserve' ? 'option-command' : 'open-command');
    if (name === 'action.close-order') add('close-order.closed-before-host-action', r.after.log.hosts.map(e => e.state.open), [false]);
  }
  if (name === 'empty.submit') {
    add('empty.native-enter-pair', keyTrace(r.after.log), keys('Enter'), true);
    add('empty.zero-enabled-results', visible(r.before.state), [], true);
    add('empty.no-command-or-form-submit', noActions(r.after.log), [[], [], []]);
    add('empty.no-selection-change', r.after.log.changes.filter(e => e.name === 'palette'), []);
    add('empty.dialog-remains-open', r.after.state.open, true);
  }
  if (name === 'text.space') {
    add('space.native-key-sequence', keyTrace(r.after.log), [...keys(' '), ...[...'place'].flatMap(keys)], true);
    add('space.native-edit-interleaving-and-caret', r.after.log.inputs.map(editProjection), paletteTyping(' place', 'Other'));
    add('space.is-query-text', {query: r.after.state.query, focusedInput: r.after.state.focusedInput, open: r.after.state.open, rows: rowProfile(r.after.state.rows)}, {query: 'Other place', focusedInput: true, open: true, rows: paletteExpectedRows('Other place')});
    add('space.no-command-action', noActions(r.after.log), [[], [], []]);
    add('space.local-query-payload', queryChanges(r.after.log).at(-1), queryEvent(surface, 'Other place'));
    add('space.host-query-payload', hostQueries(r.after.log).at(-1), queryEvent(surface, 'Other place'));
  }
  if (name === 'escape.preserve') {
    add('escape.native-key-pair', keyTrace(r.after.log), keys('Escape'), true);
    add('escape.closed-opener-restored', [r.after.state.open, r.after.state.openerFocused], [false, true]);
    add('escape.native-dialog-close', r.after.log.closes, [{slot: 'primary', ownerID: paletteOwner(surface), open: false, trusted: true}]);
    add('escape.no-command-action', noActions(r.after.log), [[], [], []]);
    add('escape.tab-contained', [r.tab.state.focusedInDialog, r.shiftTab.state.focusedInDialog], [true, true]);
    add('escape.explicit-close', [r.repeat.after.state.open, r.repeat.after.state.openerFocused], [false, true]);
    add('escape.no-reopen-or-close-action', [noActions(r.repeatSetup.log), noActions(r.repeat.after.log)], [[[], [], []], [[], [], []]]);
  }
  if (['enter.preserve', 'escape.preserve', 'owner.replacement'].includes(name)) {
    add('reopen.normal-input-focus', [r.reopened.state.open, r.reopened.state.focusedInput], [true, true]);
    add('reopen.keyboard-refinement', {query: r.repeatSetup.state.query, focusedInput: r.repeatSetup.state.focusedInput, rows: rowProfile(r.repeatSetup.state.rows)}, {query: 'open', focusedInput: true, rows: paletteExpectedRows('open')});
    add('reopen.trusted-current-owner-input', r.repeatSetup.log.inputs.filter(e => e.type === 'input').map(e => ({trusted: e.trusted, field: e.field, ownerID: e.ownerID, generation: e.generation, value: e.value})), (name === 'owner.replacement' ? ['o', 'op', 'ope', 'open'] : ['', 'o', 'op', 'ope', 'open']).map(value => ({trusted: true, field: true, ownerID: paletteOwner(surface), generation: name === 'owner.replacement' ? 'fresh' : 'original', value})), true);
    const repeatInputs = r.repeatSetup.log.inputs;
    if (name === 'owner.replacement') add('reopen.native-edit-interleaving-and-caret', repeatInputs.map(editProjection), paletteTyping('open'), true);
    else {
      add('reopen.keyboard-clear-sequence', repeatInputs.slice(0, 8).map(e => [e.type, e.key, e.inputType]), [['keydown', 'Control', null], ['keydown', 'A', null], ['keyup', 'A', null], ['keyup', 'Control', null], ['keydown', 'Backspace', null], ['beforeinput', null, 'deleteContentBackward'], ['input', null, 'deleteContentBackward'], ['keyup', 'Backspace', null]], true);
      add('reopen.keyboard-cleared-value', repeatInputs.slice(6, 8).map(e => [e.value, e.selectionStart, e.selectionEnd]), [['', 0, 0], ['', 0, 0]], true);
      add('reopen.native-edit-interleaving-and-caret', repeatInputs.slice(8).map(editProjection), paletteTyping('open'), true);
    }
    add('reopen.host-query-payload', hostQueries(r.repeatSetup.log).at(-1), queryEvent(surface, 'open'));
    if (name !== 'escape.preserve') command('repeat', r.repeat.down, r.repeat.after, 'open-file', 'open-command', name === 'owner.replacement' ? 'fresh' : 'original');
  }
  if (name === 'owner.replacement') {
    add('replacement.actual-owner-generation', r.swap, {oldID: paletteOwner(surface), freshID: paletteOwner(surface), sameOwner: false, oldConnected: false, oldReady: null, freshReady: 'true', cleanups: 1, lifecycle: r.swap.lifecycle}, true);
    add('replacement.real-htmx-lifecycle', r.swap.lifecycle.some(e => e.type === 'htmx:before:swap' && e.tasks.some(t => t.targetID === 'palette-primary' && t.style === 'outerHTML')), true, true);
    add('replacement.fresh-fixed-state', identity(r.replaced.state), expectedIdentity(surface, 'primary', 'fresh'), true);
    add('replacement.initial-query-and-rows', {open: r.replaced.state.open, query: r.replaced.state.query, rows: rowProfile(r.replaced.state.rows)}, {open: false, query: '', rows: paletteExpectedRows('')}, true);
    add('replacement.explicit-synthetic-detached-probe', r.staleProbe, {ownerID: paletteOwner(surface), connected: false, value: 'stale-detached', inputTrusted: false, changeTrusted: false, inputDispatched: true, changeDispatched: true}, true);
    add('replacement.detached-old-cannot-update-current', r.stale, r.replaced);
  }
  if (name === 'active.relationship') {
    for (const [key, state] of [['arrow', r.arrow.state], ['refined', r.refined.state]]) {
      const rel = state.relationship;
      add('relationship.' + key + '.native-searchbox-and-listbox', [rel.inputType, rel.inputRole, rel.listRole], ['search', 'searchbox', 'listbox']);
      add('relationship.' + key + '.owned-active-option', [Boolean(rel.inputID), Boolean(rel.listID), rel.controlledIsList, rel.descendantInList, rel.descendantInRoot, rel.descendantRole, rel.descendantSelected, rel.descendantVisibleEnabled, rel.uniqueIDs], [true, true, true, true, true, 'option', true, true, true]);
      const local = state.rows.filter(row => row.id && row.id === rel.activeID);
      add('relationship.' + key + '.raw-controlled-list', Boolean(rel.controls) && rel.controls === rel.listID, true);
      add('relationship.' + key + '.raw-local-active-row', local.map(({value, role, hidden, disabled, selected}) => ({value, role, hidden, disabled, selected})), [{value: key === 'arrow' ? 'option-file' : 'open-file', role: 'option', hidden: false, disabled: false, selected: true}]);
      add('relationship.' + key + '.raw-descendant-consistency', local.map(row => ({value: row.value, role: row.role})), [{value: rel.descendantValue, role: rel.descendantRole}]);
      const ids = [rel.inputID, rel.listID, ...state.rows.map(row => row.id), r.refined.peer.relationship.inputID, r.refined.peer.relationship.listID, ...r.refined.peer.rows.map(row => row.id)];
      add('relationship.' + key + '.raw-unique-local-peer-ids', ids.every(id => typeof id === 'string' && id.length > 0) && new Set(ids).size === ids.length, true);
      add('relationship.' + key + '.active-matches-cursor', rel.descendantValue, key === 'arrow' ? 'option-file' : 'open-file');
    }
    add('relationship.filtering-preserves-row-ids', r.refined.state.rows.map(row => ({value: row.value, id: row.id})).sort((a,b) => a.value.localeCompare(b.value)), r.arrow.state.rows.map(row => ({value: row.value, id: row.id})).sort((a,b) => a.value.localeCompare(b.value)));
    add('relationship.empty-clears-active-reference', [visible(r.after.state), r.after.state.relationship.activeID], [[], null]);
    add('relationship.peer-distinct-option-ids', r.refined.state.rows.every(row => row.id && !r.refined.peer.rows.some(peer => peer.id === row.id)), true);
  }
  for (const [key, value] of Object.entries(r)) {
    const snapshots = value?.log ? [[key, value]] : value?.after?.log ? [[key + '.down', value.down], [key + '.after', value.after]].filter(([, s]) => s) : [];
    for (const [label, snapshot] of snapshots) {
      const generation = name === 'owner.replacement' && ['replaced', 'stale', 'reopened', 'repeatSetup', 'repeat.down', 'repeat.after'].includes(label) ? 'fresh' : 'original';
      add('input.' + label + '.native-owner-provenance', snapshot.log.inputs.map(e => ({trusted: e.trusted, slot: e.slot, ownerID: e.ownerID, generation: e.generation, connected: e.connected, focused: e.focused, tagAllowed: ['INPUT', 'BUTTON'].includes(e.targetTag), fieldMatchesTag: e.field === (e.targetTag === 'INPUT')})), snapshot.log.inputs.map(() => ({trusted: true, slot: 'primary', ownerID: paletteOwner(surface), generation, connected: true, focused: true, tagAllowed: true, fieldMatchesTag: true})), true);
      add('isolation.' + label + '.primary-identity', identity(snapshot.state), expectedIdentity(surface, 'primary', name === 'owner.replacement' && ['replaced', 'stale', 'reopened', 'repeatSetup', 'repeat.down', 'repeat.after'].includes(label) ? 'fresh' : 'original'), true);
      add('isolation.' + label + '.fixed-row-identities', snapshot.state.rows.map(({label, value, disabled}) => ({label, value, disabled})).sort((a,b) => a.value.localeCompare(b.value)), paletteRows().sort((a,b) => a.value.localeCompare(b.value)), true);
      add('isolation.' + label + '.peer-fixed-state', peer(snapshot.peer), peerExpected, true);
      add('isolation.' + label + '.no-peer-host-callback', [...snapshot.log.hosts, ...snapshot.log.hostChanges, ...snapshot.log.results].filter(e => e.slot !== 'primary'), [], true);
    }
  }
  add('errors.none', logs(r).flatMap(log => log.errors), [], true);
  return out;
}
export function paletteDiagnostics(check) {
  const r = check.raw, state = r.arrow?.state || r.before.state;
  return {relationshipClassification: 'future-repair-prerequisite; no historical DOM or AT promise', relationship: state.relationship,
    callbackOrderClassification: 'separate-adjacent-gap; not query-focus acceptance', callbacks: (r.after.log.hosts || []).map(e => ({phase: e.phase, open: e.state.open, query: e.state.query, focusedInput: e.state.focusedInput, selected: selected(e.state), value: e.value, action: e.action})),
    emptySubmitClassification: check.name === 'empty.submit' ? 'separate-native-browser-candidate; any callback fails no-action oracle' : 'not this case',
    coverageLimits: ['No long-list scrolling', 'No assistive-technology verification', 'No IME/composition', 'No aliases or other palette primaries']};
}
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function assertPaletteTransportInventory(report, surface, assets, fixtures, inventory) {
  const preflightPaths = [...Object.keys(assets), ...Object.keys(fixtures)].sort();
  const preflight = report.requests.filter(request => request.check === null);
  assert.deepEqual(preflight.map(request => request.path).sort(), preflightPaths, 'exact preflight request inventory');
  for (const proof of report.httpAssetProof) assert(!Object.hasOwn(proof, 'check'), 'preflight response has no browser case');
  for (const proof of report.browserResponses) assert(inventory.includes(proof.check), 'browser response belongs to an exact case');
  for (const request of report.requests.filter(request => request.path !== '/sdui-action')) {
    assert.deepEqual(Object.keys(request).sort(), ['check', 'path', 'method', 'htmx', 'status', 'responseSHA256', 'responseBytes'].sort(), 'exact static request fields');
    assert.equal(request.htmx, request.check !== null && request.path === '/fragment' ? 'true' : null, 'static versus HTMX request provenance');
  }
  for (const name of inventory) {
    const required = [...paletteRequiredBrowserPaths, ...(surface === 'sdui' ? ['/assets/sdui.js', '/assets/sdui.css'] : []), ...(name === 'owner.replacement' ? ['/fragment'] : [])];
    const allowed = new Set([...required, ...paletteOptionalBrowserPaths]);
    const requests = report.requests.filter(request => request.check === name && request.path !== '/sdui-action');
    const responses = report.browserResponses.filter(proof => proof.check === name && proof.path !== '/sdui-action');
    for (const entry of [...requests, ...responses]) assert(allowed.has(entry.path), name + ': source-owned browser path inventory');
    assert.deepEqual(requests.map(request => request.path).sort(), responses.map(proof => proof.path).sort(), name + ': exact static request/response join');
    for (const path of required) assert.equal(requests.filter(request => request.path === path).length, 1, name + ': mandatory browser request ' + path);
    for (const request of requests) {
      const proof = responses.find(proof => proof.path === request.path);
      assert.equal(request.status, proof.status); assert.equal(request.responseSHA256, proof.receivedSHA256); assert.equal(request.responseBytes, proof.bytes);
    }
  }
}
export function verifyPaletteEvidence(report, trusted, exitCode) {
  verifyPaletteProductionPolicy(report, trusted);
  const {surface, group, revision, tree, runToken, sourceFiles, assets, fixtures} = trusted;
  assert(paletteSurfaces.includes(surface));
  assert.equal(report.suite, 'palette-query'); assert.equal(report.stage, 'checks');
  for (const [key, value] of Object.entries({surface, group, revision, tree, runToken})) assert.equal(report[key], value, 'independent ' + key);
  assert(/^[a-f0-9]{40}$/.test(revision)); assert(/^[a-f0-9]{40}$/.test(tree)); assert(typeof runToken === 'string' && runToken.length > 10);
  assert.equal(report.dirty, ''); assert.equal(report.error, undefined); assert.equal(report.validationError, undefined);
  assert.equal(report.actualMainBaseline, paletteBaseline); assert.deepEqual(report.sourcePins, paletteSourcePins);
  assert.deepEqual(Object.keys(sourceFiles), paletteSourcePaths); assert.deepEqual(report.sourceFiles, sourceFiles);
  for (const value of Object.values(sourceFiles)) assert(hash(value));
  assert.deepEqual(report.assets, assets); assert.deepEqual(report.fixtures, fixtures); assert.deepEqual(report.fixtureManifest, trusted.fixtureManifest);
  for (const entry of Object.values({...assets, ...fixtures})) { assert(hash(entry.sourceSHA256)); assert.equal(entry.sourceSHA256, entry.servedSHA256, 'unchanged production/fixture bytes'); assert(entry.bytes > 0); }
  assert.deepEqual(report.standaloneDependencyProof, trusted.standaloneDependencyProof); assert(hash(report.standaloneDependencyProof.SHA256)); assert.deepEqual(report.standaloneDependencyProof.forbiddenImports, []);
  assert.deepEqual(report.toolchain, trusted.toolchain); for (const key of ['node', 'go', 'playwright']) assert(typeof report.toolchain[key] === 'string' && report.toolchain[key]);
  assert(typeof report.browserVersion === 'string' && report.browserVersion);
  for (const key of paletteErrors) assert.deepEqual(report[key], [], key + ' cannot masquerade as contract evidence');
  const inventory = paletteCases(group); assert.deepEqual(report.caseInventory, inventory); assert.deepEqual(report.checks.map(c => c.name), inventory, 'exact unique ordered inventory');
  const responseKeys = report.browserResponses.filter(p => p.path !== '/sdui-action').map(p => p.check + ':' + p.path);
  assert.equal(new Set(responseKeys).size, responseKeys.length, 'no duplicate browser proof');
  const requestKeys = report.requests.filter(req => req.path !== '/sdui-action').map(req => req.check + ':' + req.path);
  assert.equal(new Set(requestKeys).size, requestKeys.length, 'no duplicate static/HTMX requests');
  for (const req of report.requests) {
    assert(req.check === null || inventory.includes(req.check), 'known request case');
    assert(Object.hasOwn(assets, req.path) || Object.hasOwn(fixtures, req.path) || surface === 'sdui' && req.path === '/sdui-action', 'explicit request path whitelist');
    assert.equal(Object.hasOwn(req, 'responseFixture'), req.path === '/sdui-action', 'response fixture only for routed POST');
    const entry = assets[req.path] || fixtures[req.responseFixture || req.path];
    assert(entry, 'known request path'); assert.equal(req.status, 200); assert.equal(req.responseSHA256, entry.servedSHA256); assert.equal(req.responseBytes, entry.bytes);
    if (req.path === '/sdui-action') { assert(inventory.includes(req.check), 'routed request belongs to an exact case'); assert.equal(surface, 'sdui'); assert.equal(req.method, 'POST'); assert.equal(req.responseFixture, '/sdui-response-primary'); }
    else assert.equal(req.method, 'GET');
    if (req.path === '/fragment' && req.check !== null) assert.equal(req.check, 'owner.replacement');
  }
  const paths = [...Object.keys(assets), ...Object.keys(fixtures)]; assert.deepEqual(report.httpAssetProof.map(p => p.path), paths);
  for (const proof of [...report.httpAssetProof, ...report.browserResponses]) {
    assert(Object.hasOwn(assets, proof.path) || Object.hasOwn(fixtures, proof.path) || surface === 'sdui' && proof.path === '/sdui-action', 'explicit response path whitelist');
    assert.equal(Object.hasOwn(proof, 'responseFixture'), proof.path === '/sdui-action', 'response fixture only for routed POST');
    const entry = assets[proof.path] || fixtures[proof.responseFixture || proof.path]; assert(entry, 'known response path');
    assert.equal(proof.status, 200); assert.equal(proof.expectedSHA256, entry.servedSHA256); assert.equal(proof.receivedSHA256, entry.servedSHA256); assert.equal(proof.bytes, entry.bytes);
    if (Object.hasOwn(proof, 'check')) assert(inventory.includes(proof.check));
    if (proof.path === '/sdui-action') assert.equal(proof.responseFixture, '/sdui-response-primary');
  }
  assertPaletteTransportInventory(report, surface, assets, fixtures, inventory);
  for (const check of report.checks) {
    assert.equal(check.error, undefined); assert.equal(check.captureError, undefined);
    assert.deepEqual(check.finalTrace, (check.raw.repeat?.after || check.raw.after).log, 'final trace raw consistency');
    const computed = paletteOracles(check, surface);
    assert.deepEqual(check.oracles, computed, 'fixed expectations/raw observations recomputed independently');
    assert.deepEqual(check.diagnostics, paletteDiagnostics(check));
    for (const oracle of computed) if (oracle.prerequisite) assert(oracle.pass, check.name + '/' + oracle.id + ': prerequisite failure');
    assert.equal(check.status, computed.every(oracle => oracle.pass) ? 'passed' : 'failed');
    const required = [...paletteRequiredBrowserPaths, ...(surface === 'sdui' ? ['/assets/sdui.js', '/assets/sdui.css'] : []), ...(check.name === 'owner.replacement' ? ['/fragment'] : [])];
    for (const path of required) assert.equal(report.browserResponses.filter(p => p.check === check.name && p.path === path).length, 1, check.name + ': missing browser bytes ' + path);
    assert.equal(report.requests.filter(req => req.check === check.name && req.path === '/fragment').length, check.name === 'owner.replacement' ? 1 : 0, 'exact total HTMX request inventory');
    if (check.name === 'owner.replacement') assert.equal(report.requests.filter(req => req.check === check.name && req.path === '/fragment' && req.method === 'GET' && req.htmx === 'true' && req.status === 200 && req.responseSHA256 === fixtures['/fragment'].servedSHA256 && req.responseBytes === fixtures['/fragment'].bytes).length, 1, 'one real HTMX request and exact response');
    if (surface === 'sdui') {
      const expectedValues = check.name === 'enter.preserve' ? ['option-file', 'open-file'] : check.name === 'owner.replacement' ? ['open-file', 'open-file'] : check.name === 'action.close-order' ? ['open-file'] : [];
      const requests = report.requests.filter(req => req.check === check.name && req.path === '/sdui-action');
      assert.equal(requests.length, expectedValues.length, 'exact routed command request count');
      requests.forEach((req, i) => {
        assert.equal(req.method, 'POST'); assert.equal(req.status, 200); assert.equal(req.responseFixture, '/sdui-response-primary'); assert.equal(req.responseSHA256, fixtures[req.responseFixture].servedSHA256); assert.equal(req.responseBytes, fixtures[req.responseFixture].bytes);
        const fields = Object.fromEntries(req.fields); assert.equal(req.fields.length, Object.keys(fields).length, 'no duplicate fields');
        assert.deepEqual(Object.keys(fields).sort(), ['_action', '_csrf', '_request', '_target', 'commandAction', 'commandValue', 'component', 'ownerID'].sort());
        assert.deepEqual({...fields, _request: '<fresh>'}, {_action: 'command-observed', _csrf: 'palette-query-fixture', _request: '<fresh>', _target: 'palette-primary-result', commandAction: expectedValues[i] === 'option-file' ? 'option-command' : 'open-command', commandValue: expectedValues[i], component, ownerID: paletteOwner(surface)});
        assert(typeof fields._request === 'string' && fields._request.length > 10);
      });
      assert.equal(report.browserResponses.filter(p => p.check === check.name && p.path === '/sdui-action').length, expectedValues.length);
    }
  }
  const status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  assert.equal(report.status, status); assert.equal(exitCode, status === 'passed' ? 0 : 1, 'nonzero contract exit preserved');
  return {productionPolicy:trusted.productionPolicy,status, surface, group, revision, tree, failed: report.checks.filter(c => c.status === 'failed').map(c => c.name)};
}
