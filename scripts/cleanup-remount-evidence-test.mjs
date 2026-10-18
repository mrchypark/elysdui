import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {cleanupRemountCases, cleanupRemountSourcePaths, cleanupRemountOracleIDs, cleanupRemountFixedExpected, verifyCleanupRemountEvidence} from '../ui/gohtmx/tests/browser/cleanup-remount-evidence.mjs';
import {cleanupRemountCoreControls} from '../ui/gohtmx/tests/browser/cleanup-remount-core-controls.mjs';

// Synthetic schema fixtures exercise only the pure report verifier. They are
// never browser evidence and are not copied into browser output directories.
const hash = letter => letter.repeat(64);
const paths = ['/assets/ely-api.js', '/assets/ely-api-interaction.js', '/assets/ely-api-interaction-entry.js', '/assets/htmx.min.js', '/assets/app.css', '/assets/ely-api.css', '/assets/ely-api-interaction.css'];
const errorKeys = ['pageErrors', 'consoleErrors', 'requestFailures', 'serverErrors', 'transportErrors', 'runtimeErrors'];
const make = (mutation = '') => {
  const assets = Object.fromEntries(paths.map(path => [path, {sourceSHA256: hash('a'), servedSHA256: mutation && path === '/assets/ely-api.js' ? hash('b') : hash('a'), bytes: 10}]));
  const sourceFiles = Object.fromEntries(cleanupRemountSourcePaths.map(path => [path, hash('c')]));
  const fixtures = Object.fromEntries(['/', '/fragment'].map(path => [path, {sourceSHA256: hash('d'), servedSHA256: hash('d'), html: `cleanup-remount-fixtures/${hash('d')}.html`}]));
  const report = {
    suite: 'cleanup-remount', runToken: 'synthetic-fresh-invocation', group: 'all', stage: 'checks', mutation, surface: 'standalone', revision: '1'.repeat(40), tree: '2'.repeat(40), dirty: '',
    browserVersion: 'synthetic-validator-fixture', toolchain: {node: 'fixture', playwright: 'fixture', go: 'fixture'}, assets, sourceFiles, fixtures,
    ...Object.fromEntries(errorKeys.map(key => [key, []])),
    httpAssetProof: paths.map(path => ({path, status: 200, expectedSHA256: assets[path].servedSHA256, receivedSHA256: assets[path].servedSHA256})),
    browserResponses: cleanupRemountCases.flatMap(check => [...paths, '/fragment'].map(path => ({check, path, status: 200, expectedSHA256: assets[path]?.servedSHA256 || hash('d'), receivedSHA256: assets[path]?.servedSHA256 || hash('d')}))),
    checks: cleanupRemountCases.map(name => ({name, status: 'passed', oracles: cleanupRemountOracleIDs(name).map((id, index) => ({id, observed: structuredClone(Object.hasOwn(cleanupRemountFixedExpected, id) ? cleanupRemountFixedExpected[id] : true), expected: structuredClone(Object.hasOwn(cleanupRemountFixedExpected, id) ? cleanupRemountFixedExpected[id] : true), pass: true, prerequisite: index < 12}))})),
    status: mutation ? 'failed' : 'passed',
  };
  const set = (check, id, observed, expected) => { const oracle = check.oracles.find(oracle => oracle.id === id); Object.assign(oracle, {observed, expected, pass: false}); check.status = 'failed'; };
  if (mutation) {
    report.causalIntervention = {name: mutation, ...cleanupRemountCoreControls[mutation], anchorCount: 1, interpretation: 'Test-only startup mutation; all old disposers remain. Raw failures retain their nonzero exit.'};
    for (const check of report.checks.slice(0, 2)) {
      if (mutation === 'disable-replay') set(check, 'readiness.fresh-owner-survives-old-cleanup', null, 'true');
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
  return {report, expected: structuredClone({mutation, surface: report.surface, revision: report.revision, tree: report.tree, assets, sourceFiles, fixtures, runToken: report.runToken, positiveChecks: mutation ? make('').report.checks : undefined}), exit: mutation ? 1 : 0};
};
let rejected = 0;
for (const mutation of ['', ...Object.keys(cleanupRemountCoreControls)]) {
  const fixture = make(mutation);
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
    ['wrong surface', r => { r.surface = 'catalogue'; }],
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
  for (const [name, corrupt] of corruptions) {
    const bad = structuredClone(fixture.report); corrupt(bad);
    assert.throws(() => verifyCleanupRemountEvidence(bad, fixture.expected, fixture.exit), undefined, `${mutation || 'clean'} rejects ${name}`); rejected++;
  }
  assert.throws(() => verifyCleanupRemountEvidence(fixture.report, fixture.expected, fixture.exit ? 0 : 1)); rejected++;
}
// Explicit regression for the independent reviewer's original false-green shape.
const malformed = make('disable-deferral'); malformed.report.checks = [];
assert.throws(() => verifyCleanupRemountEvidence(malformed.report, malformed.expected, 1));
// Parse but never import/execute the browser runner in this source-only test.
parse(readFileSync('scripts/cleanup-remount-browser-controls.mjs', 'utf8'), {ecmaVersion: 'latest', sourceType: 'module'});
console.log(`Cleanup/remount pure verifier rejects ${rejected + 1} incomplete/inconsistent synthetic reports; no browser proof claimed.`);
