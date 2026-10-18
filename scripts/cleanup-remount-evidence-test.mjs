import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {runInNewContext} from 'node:vm';
import {cleanupRemountCases, cleanupRemountSourcePaths, cleanupRemountOracleIDs, cleanupRemountExpected, verifyCleanupRemountEvidence} from '../ui/gohtmx/tests/browser/cleanup-remount-evidence.mjs';
import {cleanupRemountCoreControls} from '../ui/gohtmx/tests/browser/cleanup-remount-core-controls.mjs';

// Synthetic schema fixtures exercise only the pure report verifier. They are
// never browser evidence and are not copied into browser output directories.
const hash = letter => letter.repeat(64);
const paths = ['/assets/ely-api.js', '/assets/ely-api-interaction.js', '/assets/ely-api-interaction-entry.js', '/assets/htmx.min.js', '/assets/app.css', '/assets/ely-api.css', '/assets/ely-api-interaction.css'];
const errorKeys = ['pageErrors', 'consoleErrors', 'requestFailures', 'serverErrors', 'transportErrors', 'runtimeErrors'];
const make = (mutation = '', surface = 'standalone') => {
  const assets = Object.fromEntries(paths.map(path => [path, {sourceSHA256: hash('a'), servedSHA256: mutation && path === '/assets/ely-api.js' ? hash('b') : hash('a'), bytes: 10}]));
  const sourceFiles = Object.fromEntries(cleanupRemountSourcePaths.map(path => [path, hash('c')]));
  const fixtures = Object.fromEntries(['/', '/fragment'].map(path => [path, {sourceSHA256: hash('d'), servedSHA256: hash('d'), html: `cleanup-remount-fixtures/${hash('d')}.html`}]));
  const report = {
    suite: 'cleanup-remount', runToken: 'synthetic-fresh-invocation', group: 'all', stage: 'checks', mutation, surface, revision: '1'.repeat(40), tree: '2'.repeat(40), dirty: '',
    browserVersion: 'synthetic-validator-fixture', toolchain: {node: 'fixture', playwright: 'fixture', go: 'fixture'}, assets, sourceFiles, fixtures,
    ...Object.fromEntries(errorKeys.map(key => [key, []])),
    httpAssetProof: paths.map(path => ({path, status: 200, expectedSHA256: assets[path].servedSHA256, receivedSHA256: assets[path].servedSHA256})),
    browserResponses: cleanupRemountCases.flatMap(check => [...paths, '/fragment'].map(path => ({check, path, status: 200, expectedSHA256: assets[path]?.servedSHA256 || hash('d'), receivedSHA256: assets[path]?.servedSHA256 || hash('d')}))),
    checks: cleanupRemountCases.map(name => {
      const initialListeners = [['keydown', true], ['keydown', false], ['keyup', false], ['ely:context-request', false], ['ely:action', false], ['ely:change', false]].map(([type, capture], i) => ({type, capture, id: i + 1}));
      const detached = name === 'observer.normal-detach', desired = name.startsWith('observer.same-root');
      const stopped = {hidden: true, expanded: 'false', ready: null, connected: false, left: '111px', top: '112px', focus: null};
      const state = detached ? {...stopped} : {hidden: false, expanded: 'true', ready: 'true', connected: true, left: '222px', top: '223px', focus: 'open'};
      let listeners = initialListeners.map(item => ({...item, id: item.id + 10}));
      if (detached) listeners = [];
      if (desired && mutation) {
        Object.assign(state, {hidden: true, expanded: 'false', focus: null});
        if (mutation === 'disable-replay') {
          Object.assign(state, {ready: null, left: name === 'observer.same-root' ? '111px' : '', top: name === 'observer.same-root' ? '112px' : ''});
          listeners = listeners.filter(item => ['ely:action', 'ely:change'].includes(item.type));
        }
      }
      const check = {name, status: 'passed', afterTeardown: {initialListeners, listeners, oldListeners: [], state, old: stopped}};
      check.oracles = cleanupRemountOracleIDs(name).map((id, index) => {
        const expected = structuredClone(cleanupRemountExpected(check, surface, id));
        return {id, observed: structuredClone(expected), expected, pass: true, prerequisite: index < 12};
      });
      return check;
    }),
    status: mutation ? 'failed' : 'passed',
  };
  const set = (check, id, observed, expected) => { const oracle = check.oracles.find(oracle => oracle.id === id); Object.assign(oracle, {observed, expected, pass: false}); check.status = 'failed'; };
  if (mutation) {
    report.causalIntervention = {name: mutation, ...cleanupRemountCoreControls[mutation], anchorCount: 1, interpretation: 'Test-only startup mutation; all old disposers remain. Raw failures retain their nonzero exit.'};
    for (const check of report.checks.slice(0, 2)) {
      if (mutation === 'disable-replay') {
        set(check, 'readiness.fresh-owner-survives-old-cleanup', null, 'true');
        set(check, 'ownership.listener-cardinality', {'ely:context-request': 0, 'ely:action': 1, 'ely:change': 1, keydown: 0, keyup: 0}, {'ely:context-request': 1, 'ely:action': 1, 'ely:change': 1, keydown: 2, keyup: 1});
      }
      else {
        set(check, 'presentation.seed-survives-old-disposers', true, false);
        set(check, 'presentation.expanded-survives-old-disposers', 'false', 'true');
        set(check, 'presentation.seed-focus-on-enabled-row', null, 'open');
      }
    }
    const check = report.checks.find(check => check.name === 'serialization.disposer-order');
    const expected = ['init:1', 'event', 'first:1', 'last:1', 'init:2'];
    const actual = mutation === 'disable-deferral' ? ['init:1', 'event', 'init:2', 'first:1', 'last:1'] : mutation === 'disable-replay' ? ['init:1', 'event', 'first:1', 'last:1'] : ['init:1', 'event', 'first:1', 'init:2', 'last:1'];
    set(check, 'serialization.all-old-disposers-before-new-init', actual, expected);
    if (mutation === 'disable-replay') { set(check, 'serialization.fresh-ready', null, 'true'); set(check, 'serialization.final-controller-disposed-once', 0, 1); }
  }
  return {report, expected: structuredClone({mutation, surface: report.surface, revision: report.revision, tree: report.tree, assets, sourceFiles, fixtures, runToken: report.runToken, positiveChecks: mutation ? make('', surface).report.checks : undefined}), exit: mutation ? 1 : 0};
};
let rejected = 0;
for (const surface of ['standalone', 'catalogue']) for (const mutation of ['', ...Object.keys(cleanupRemountCoreControls)]) {
  const fixture = make(mutation, surface);
  assert.equal(verifyCleanupRemountEvidence(fixture.report, fixture.expected, fixture.exit).status, mutation ? 'killed' : 'passed');
  const corruptions = [
    ['empty cases', r => { r.checks = []; }],
    ['missing case', r => { r.checks.pop(); }],
    ['duplicate case', r => { r.checks[1] = structuredClone(r.checks[0]); }],
    ['foreign case', r => { r.checks[1].name = 'foreign'; }],
    ['reordered cases', r => { [r.checks[0], r.checks[1]] = [r.checks[1], r.checks[0]]; }],
    ['missing oracle', r => { r.checks[0].oracles.pop(); }],
    ['duplicate oracle', r => { r.checks[0].oracles[1] = structuredClone(r.checks[0].oracles[0]); }],
    ['renamed oracle', r => { r.checks[0].oracles[0].id = 'foreign'; }],
    ['reordered oracles', r => { [r.checks[0].oracles[0], r.checks[0].oracles[1]] = [r.checks[0].oracles[1], r.checks[0].oracles[0]]; }],
    ['stale pass on changed observation', r => { r.checks[0].oracles[0].observed = false; }],
    ['stale pass on changed expectation', r => { r.checks[0].oracles[0].expected = false; }],
    ['cached case status', r => { r.checks[0].status = r.checks[0].status === 'failed' ? 'passed' : 'failed'; }],
    ['cached report status', r => { r.status = r.status === 'failed' ? 'passed' : 'failed'; }],
    ['lost prerequisite flag', r => { r.checks[0].oracles[0].prerequisite = false; }],
    ['failed prerequisite', r => { Object.assign(r.checks[0].oracles[0], {observed: false, pass: false}); r.checks[0].status = r.status = 'failed'; }],
    ['case infrastructure error', r => { r.checks[0].error = {message: 'unrelated'}; }],
    ['report infrastructure error', r => { r.error = {message: 'unrelated'}; }],
    ['wrong source hash', r => { r.assets['/assets/ely-api.js'].sourceSHA256 = hash('e'); }],
    ['wrong served hash', r => { r.assets['/assets/ely-api.js'].servedSHA256 = hash('e'); }],
    ['wrong source-file hash', r => { r.sourceFiles[cleanupRemountSourcePaths[0]] = hash('e'); }],
    ['missing source file', r => { delete r.sourceFiles[cleanupRemountSourcePaths[0]]; }],
    ['stale invocation', r => { r.runToken = 'stale'; }],
    ['wrong tree', r => { r.tree = 'e'.repeat(40); }],
    ['wrong surface', r => { r.surface = surface === 'standalone' ? 'catalogue' : 'standalone'; }],
    ['dirty source', r => { r.dirty = ' M runtime'; }],
    ['missing asset', r => { delete r.assets['/assets/app.css']; }],
    ['foreign asset', r => { r.assets['/foreign'] = r.assets['/assets/app.css']; }],
    ['missing HTTP proof', r => { r.httpAssetProof.pop(); }],
    ['wrong HTTP bytes', r => { r.httpAssetProof[0].receivedSHA256 = hash('e'); }],
    ['missing browser response', r => { r.browserResponses.shift(); }],
    ['wrong browser bytes', r => { r.browserResponses[0].receivedSHA256 = hash('e'); }],
    ['wrong fixture bytes', r => { r.fixtures['/fragment'].sourceSHA256 = hash('e'); }],
    ...errorKeys.map(key => [key, r => { r[key].push({message: 'unrelated'}); }]),
  ];
  if (mutation) corruptions.push(
    ['missing designated failure', r => { const o = r.checks[0].oracles.find(o => o.id === cleanupRemountCoreControls[mutation].browserOracle); o.observed = o.expected; o.pass = true; }],
    ['wrong designated actual', r => { r.checks[0].oracles.find(o => o.id === cleanupRemountCoreControls[mutation].browserOracle).observed = 'unrelated'; }],
    ['wrong designated expected', r => { r.checks[0].oracles.find(o => o.id === cleanupRemountCoreControls[mutation].browserOracle).expected = 'unrelated'; }],
    ['coordinated safe observation and expectation', r => { Object.assign(r.checks[2].oracles[12], {observed: false, expected: false, pass: true}); }],
    ['coordinated fixed observation and expectation', r => { Object.assign(r.checks[0].oracles.find(o => o.id === 'presentation.expanded-survives-old-disposers'), {observed: 'wrong', expected: 'wrong', pass: true}); }],
    ['unrelated failure', r => { Object.assign(r.checks[0].oracles.at(-1), {observed: false, pass: false}); }],
    ['safe control failure', r => { const c = r.checks[2]; Object.assign(c.oracles[12], {observed: false, pass: false}); c.status = 'failed'; }],
    ['wrong mutation', r => { r.causalIntervention.name = 'other'; }],
    ['wrong mutation count', r => { r.causalIntervention.anchorCount = 2; }],
    ['wrong order trace', r => { r.checks.find(c => c.name === 'serialization.disposer-order').oracles.find(o => o.id === 'serialization.all-old-disposers-before-new-init').observed = []; }],
  );
  // Every oracle, including setup and safe controls, must reject coordinated
  // raw observation + target tampering. Cached verdicts remain internally valid.
  for (const check of fixture.report.checks) for (const oracle of check.oracles) corruptions.push([
    `coordinated target ${check.name}/${oracle.id}`, report => {
      const target = report.checks.find(item => item.name === check.name).oracles.find(item => item.id === oracle.id);
      const changed = typeof oracle.expected === 'boolean' ? !oracle.expected : typeof oracle.expected === 'number' ? oracle.expected + 100 : {corrupted: oracle.expected};
      Object.assign(target, {observed: changed, expected: structuredClone(changed), pass: true});
      const owner = report.checks.find(item => item.name === check.name);
      owner.status = owner.oracles.every(item => item.pass) ? 'passed' : 'failed';
      report.status = report.checks.every(item => item.status === 'passed') ? 'passed' : 'failed';
    },
  ]);
  corruptions.push(
    ['missing relational snapshot', r => { delete r.checks[0].afterTeardown; }],
    ['missing initial listener list', r => { delete r.checks[0].afterTeardown.initialListeners; }],
    ['invalid listener identity', r => { r.checks[0].afterTeardown.initialListeners[0].id = 0; }],
    ['duplicate listener identity', r => { r.checks[0].afterTeardown.initialListeners[1].id = r.checks[0].afterTeardown.initialListeners[0].id; }],
    ['wrong listener capture', r => { r.checks[0].afterTeardown.initialListeners[0].capture = false; }],
    ['current capture drift with unchanged cardinality', r => { const item = r.checks[0].afterTeardown.listeners[0]; item.capture = !item.capture; }],
    ['snapshot and duplicate target drift together', r => {
      const c = r.checks[0], o = c.oracles.find(o => o.id === 'seed.duplicate-does-not-restart-or-reposition');
      c.afterTeardown.state.left = '999px'; o.expected.left = o.observed.left = '999px';
    }],
    ['snapshot and detached target drift together', r => {
      const c = r.checks.find(c => c.name === 'observer.normal-detach'), o = c.oracles.find(o => o.id === 'normal-detach.old-owner-request-inert');
      c.afterTeardown.old.hidden = false; c.afterTeardown.state.hidden = false; o.expected.hidden = o.observed.hidden = false;
    }],
    ['listener list and cardinality targets drift together', r => {
      const c = r.checks[0], o = c.oracles.find(o => o.id === 'ownership.listener-cardinality');
      c.afterTeardown.initialListeners = []; c.afterTeardown.listeners = [];
      for (const type of Object.keys(o.expected)) o.expected[type] = o.observed[type] = 0;
    }],
  );
  for (const [name, corrupt] of corruptions) {
    const bad = structuredClone(fixture.report); corrupt(bad);
    assert.throws(() => verifyCleanupRemountEvidence(bad, fixture.expected, fixture.exit), undefined, `${mutation || 'clean'} rejects ${name}`); rejected++;
  }
  assert.throws(() => verifyCleanupRemountEvidence(fixture.report, fixture.expected, fixture.exit ? 0 : 1)); rejected++;
}
// Independently compare the full target inventory with the runner source, not
// with synthetic report fields or captured browser verdicts. Never execute the
// browser runner: only its literal/case expressions enter this isolated VM.
const source = readFileSync('ui/gohtmx/tests/browser/cleanup-remount-browser-test.mjs', 'utf8');
const calls = new Map();
const walk = node => {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'CallExpression' && ['expect', 'must'].includes(node.callee?.name)) {
    const id = node.arguments[0], expression = source.slice(node.arguments[2].start, node.arguments[2].end);
    const key = id.type === 'Literal' ? id.value : source.slice(id.start, id.end);
    assert(!calls.has(key), 'one source definition per oracle'); calls.set(key, expression);
  }
  for (const value of Object.values(node)) {
    if (Array.isArray(value)) value.forEach(walk);
    else if (value && typeof value === 'object' && value.type) walk(value);
  }
};
walk(parse(source, {ecmaVersion: 'latest', sourceType: 'module'}));
const relations = {'ownership.listener-cardinality': 'counts(result.initialListeners)', 'seed.duplicate-does-not-restart-or-reposition': 'before', 'normal-detach.old-owner-request-inert': 'result.old'};
const used = new Set(); let contracts = 0;
for (const surface of ['standalone', 'catalogue']) for (const check of make('', surface).report.checks) for (const oracle of check.oracles) {
  const key = oracle.id.startsWith('fixture.browser-exact-bytes.') ? "'fixture.browser-exact-bytes.' + path" : oracle.id.startsWith('errors.none.') ? "'errors.none.' + key" : oracle.id;
  const expression = calls.get(key); assert(expression, oracle.id + ': source target exists'); used.add(key);
  if (Object.hasOwn(relations, oracle.id)) {
    assert.equal(expression, relations[oracle.id]);
    const snapshot = check.afterTeardown;
    const target = oracle.id === 'ownership.listener-cardinality' ? Object.fromEntries(['ely:context-request', 'ely:action', 'ely:change', 'keydown', 'keyup'].map(type => [type, snapshot.initialListeners.filter(item => item.type === type).length])) : oracle.id === 'normal-detach.old-owner-request-inert' ? snapshot.old : snapshot.state;
    assert.deepEqual(cleanupRemountExpected(check, surface, oracle.id), target, oracle.id + ': independently derived snapshot relation');
  } else {
    const target = JSON.parse(JSON.stringify(runInNewContext(`(${expression})`, {name: check.name, surface}, {timeout: 100})));
    assert.deepEqual(cleanupRemountExpected(check, surface, oracle.id), target, `${surface}/${check.name}/${oracle.id}: exact source contract`);
  }
  contracts++;
}
assert.deepEqual([...used].sort(), [...calls.keys()].sort(), 'no source oracle left without target validation');
// Explicit regression for the independent reviewer's original false-green shape.
const malformed = make('disable-deferral'); malformed.report.checks = [];
assert.throws(() => verifyCleanupRemountEvidence(malformed.report, malformed.expected, 1));
// Parse but never import/execute the browser runner in this source-only test.
parse(readFileSync('scripts/cleanup-remount-browser-controls.mjs', 'utf8'), {ecmaVersion: 'latest', sourceType: 'module'});
console.log(`Cleanup/remount pure verifier rejects ${rejected + 1} incomplete/inconsistent synthetic reports and matches ${contracts} source-owned targets; no browser proof claimed.`);
