import assert from 'node:assert/strict';
import {isDeepStrictEqual as same} from 'node:util';
import {cleanupRemountCoreControls} from './cleanup-remount-core-controls.mjs';

// Exact inventories and raw-verdict recomputation follow the existing pointer
// control validator. This module is pure: no browser, process, or file reads.
export const cleanupRemountCases = [
  'observer.same-root', 'observer.same-root-new-descendants',
  'observer.different-root', 'observer.sequential', 'observer.normal-detach',
  'htmx.retained', 'htmx.delayed', 'htmx.cancelled',
  'serialization.disposer-order', 'serialization.pending-delayed', 'serialization.pending-cancelled',
];
export const cleanupRemountSourcePaths = [
  'ui/gohtmx/tests/browser/cleanup-remount-browser-test.mjs', 'ui/gohtmx/tests/browser/cleanup-remount-control.mjs',
  'ui/gohtmx/tests/browser/cleanup-remount-core-controls.mjs', 'ui/gohtmx/tests/browser/cleanup-remount-evidence.mjs',
  'scripts/cleanup-remount-browser-controls.mjs', 'scripts/cleanup-remount-evidence-test.mjs',
  'ui/gohtmx/tests/browser/context-owner-assets.mjs', 'ui/gohtmx/tests/fixtures/context-owner-requests/main.go',
  'adapters/gohtmx/tests/fixtures/context-owner-requests/main.go', 'ui/gohtmx/tests/fixtures/contextfixture/fixture.go',
  'ui/gohtmx/tests/fixtures/contextfixture/verify.go', 'ui/gohtmx/templates/ely-api-interaction.html', 'ui/gohtmx/menu.go',
  'ui/gohtmx/ui.go', 'ui/gohtmx/component.go', 'adapters/gohtmx/catalogue_manifest.json.gz', 'adapters/gohtmx/render.go',
  'adapters/gohtmx/formats.go', 'package-lock.json', '.github/workflows/cleanup-remount.yml',
  'scripts/cleanup-remount-oracles-test.mjs', 'ui/gohtmx/tests/browser/diagnostics/cleanup-remount-original.mjs',
];
const receivedPaths = ['/assets/ely-api.js', '/assets/ely-api-interaction.js', '/assets/ely-api-interaction-entry.js', '/assets/htmx.min.js', '/assets/app.css', '/assets/ely-api.css', '/assets/ely-api-interaction.css', '/fragment'];
const setup = ['fixture.renderer-screen-count', 'fixture.unique-production-ids', 'setup.old-presentation-open', 'setup.old-owner-request-listener-once', ...receivedPaths.map(path => 'fixture.browser-exact-bytes.' + path)];
const errorKeys = ['pageErrors', 'consoleErrors', 'requestFailures', 'serverErrors', 'transportErrors', 'runtimeErrors'];
const errors = errorKeys.map(key => 'errors.none.' + key);
const observer = ['cleanup.native-observer-not-inline-remove', 'cleanup.old-owner-once', 'cleanup.event-before-old-close'];
const presentation = ['identity.physical-root', 'identity.textual-owner-unchanged', 'identity.descendants-replaced-or-reused', 'readiness.fresh-owner-survives-old-cleanup', 'presentation.seed-survives-old-disposers', 'presentation.expanded-survives-old-disposers', 'presentation.request-point-survives', 'presentation.seed-focus-on-enabled-row'];
const fresh = ['ownership.listener-cardinality', 'ownership.old-listener-identities-gone', 'seed.duplicate-does-not-restart-or-reposition', 'seed.dismissed-duplicate-stays-closed', 'fresh.changed-number-opens', 'fresh.changed-number-focus-first-enabled', 'input.owner-request-provenance', 'fresh.native-navigation-skips-disabled', 'fresh.keydown-no-business-callback', 'fresh.keyup-fresh-callback-once-after-dismissal', 'fresh.one-action-event', 'fresh.check-committed', 'input.native-keyboard-provenance', 'fresh.escape-returns-caller-focus', 'fresh.escape-closes', 'fresh.cleanup-once', 'fresh.listeners-removed-after-final-detach', 'fresh.readiness-cleared-after-final-detach'];
const htmx = ['htmx.actual-context-and-retained-target', 'htmx.pending-context-present', 'htmx.cleanup-mount-does-not-initialize-seed', 'htmx.cleanup-mount-keeps-only-old-request-listener', 'htmx.stopped-after-core-before-mutation', 'htmx.old-owner-cleanup-once', 'htmx.retained-physical-root', 'htmx.cancel-or-replace-descendants', 'htmx.finally-resumes-same-context'];
const afterHTMX = ['readiness.fresh-owner-after-real-htmx', 'presentation.seed-open-after-real-htmx', 'presentation.seed-point-after-real-htmx', 'presentation.seed-focus-after-real-htmx', 'htmx.real-network-request'];
const ordering = ['serialization.native-observer-is-not-inline', 'serialization.all-old-disposers-before-new-init', 'serialization.fresh-ready', 'serialization.final-controller-disposed-once', 'serialization.final-ready-cleared'];
export function cleanupRemountOracleIDs(name) {
  assert(cleanupRemountCases.includes(name));
  let body;
  if (name === 'serialization.disposer-order') body = ordering;
  else if (name.startsWith('serialization.pending-')) body = ['pending-descendant.deferred-inside-cleanup', 'pending-descendant.real-owning-context-before-mutation', ...(name.endsWith('delayed') ? ['pending-descendant.real-delay-does-not-start-new-child', 'pending-descendant.replaced-child-never-starts'] : ['pending-descendant.cancelled-context-resumes-child-once', 'pending-descendant.fresh-child-cleanup-once']), 'pending-descendant.real-network-request'];
  else if (name.startsWith('htmx.')) body = [...htmx, ...(name === 'htmx.delayed' ? ['htmx.real-delay-stays-stopped-with-old-dom'] : []), ...afterHTMX, ...fresh];
  else if (name === 'observer.normal-detach') body = [...observer, 'normal-detach.old-presentation-closed', 'normal-detach.readiness-cleared', 'normal-detach.listeners-removed', 'normal-detach.old-owner-request-inert'];
  else body = [...(name === 'observer.sequential' ? ['sequential.old-controller-finished-first'] : []), ...observer, ...presentation, ...(name === 'observer.different-root' ? ['replacement.old-presentation-closed', 'replacement.old-listeners-removed'] : []), ...fresh];
  return [...setup, ...body, ...errors];
}
const desired = cleanupRemountCases.slice(0, 2);
const lateCloseFailures = ['presentation.seed-survives-old-disposers', 'presentation.expanded-survives-old-disposers', 'presentation.seed-focus-on-enabled-row'];
const absentStartupFailures = ['readiness.fresh-owner-survives-old-cleanup', ...lateCloseFailures, 'presentation.request-point-survives', 'ownership.listener-cardinality', 'fresh.changed-number-opens', 'fresh.changed-number-focus-first-enabled', 'fresh.native-navigation-skips-disabled', 'fresh.keyup-fresh-callback-once-after-dismissal', 'fresh.one-action-event', 'fresh.check-committed', 'fresh.cleanup-once'];
const orderTrace = ['init:1', 'event', 'first:1', 'last:1', 'init:2'];
export const cleanupRemountFixedExpected = {
  'readiness.fresh-owner-survives-old-cleanup': 'true',
  'presentation.seed-survives-old-disposers': false,
  'presentation.expanded-survives-old-disposers': 'true',
  'presentation.request-point-survives': ['222px', '223px'],
  'presentation.seed-focus-on-enabled-row': 'open',
  'serialization.all-old-disposers-before-new-init': orderTrace,
  'serialization.fresh-ready': 'true',
  'serialization.final-controller-disposed-once': 1,
  'serialization.final-ready-cleared': null,
};
const mutatedTrace = {
  'disable-deferral': ['init:1', 'event', 'init:2', 'first:1', 'last:1'],
  'disable-replay': ['init:1', 'event', 'first:1', 'last:1'],
  'replay-before-last-disposer': ['init:1', 'event', 'first:1', 'init:2', 'last:1'],
};
const hash = value => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export function verifyCleanupRemountEvidence(report, expected, exit) {
  const {mutation, surface, revision, tree, assets, sourceFiles, fixtures, runToken, positiveChecks} = expected;
  const control = cleanupRemountCoreControls[mutation];
  assert(!mutation || control, 'unknown expected mutation');
  assert.equal(typeof runToken, 'string'); assert(runToken.length); assert.equal(report.runToken, runToken, 'fresh invocation identity');
  assert.equal(report.suite, 'cleanup-remount'); assert.equal(report.group, 'all'); assert.equal(report.stage, 'checks');
  assert.equal(report.mutation, mutation); assert.equal(report.surface, surface); assert.equal(report.revision, revision); assert.equal(report.tree, tree); assert.equal(report.dirty, '');
  assert.equal(report.error, undefined); assert.equal(typeof report.browserVersion, 'string'); assert(report.browserVersion.length);
  assert.equal(typeof report.toolchain?.node, 'string'); assert.equal(typeof report.toolchain?.playwright, 'string'); assert.equal(typeof report.toolchain?.go, 'string');
  for (const key of errorKeys) assert.deepEqual(report[key], [], `${key}: incidental errors cannot count as a kill`);
  assert.deepEqual(Object.keys(sourceFiles), cleanupRemountSourcePaths, 'trusted source inventory');
  assert.deepEqual(report.sourceFiles, sourceFiles, 'exact candidate source hashes');
  for (const value of Object.values(sourceFiles)) assert(hash(value));
  assert.deepEqual(Object.keys(report.assets), Object.keys(assets), 'exact production asset inventory');
  for (const [path, asset] of Object.entries(assets)) {
    assert(hash(asset.sourceSHA256) && hash(asset.servedSHA256));
    assert.equal(report.assets[path].sourceSHA256, asset.sourceSHA256, `${path}: exact source hash`);
    assert.equal(report.assets[path].servedSHA256, asset.servedSHA256, `${path}: exact served hash`);
    assert.equal(report.assets[path].bytes, asset.bytes, `${path}: exact served size`);
  }
  if (mutation) {
    assert.deepEqual(report.causalIntervention, {name: mutation, ...control, anchorCount: 1, interpretation: 'Test-only startup mutation; all old disposers remain. Raw failures retain their nonzero exit.'});
    assert.deepEqual(Object.entries(report.assets).filter(([, asset]) => asset.sourceSHA256 !== asset.servedSHA256).map(([path]) => path), [control.file]);
  } else { assert.equal(report.causalIntervention, undefined); assert(Object.values(report.assets).every(asset => asset.sourceSHA256 === asset.servedSHA256)); }
  assert.deepEqual(Object.keys(report.fixtures), ['/', '/fragment']);
  for (const fixture of Object.values(report.fixtures)) { assert(hash(fixture.sourceSHA256)); assert.equal(fixture.servedSHA256, fixture.sourceSHA256); assert.equal(fixture.html, `cleanup-remount-fixtures/${fixture.sourceSHA256}.html`); }
  if (fixtures) assert.deepEqual(report.fixtures, fixtures, 'mutants must retain the exact clean production fixtures');
  assert.deepEqual(report.httpAssetProof.map(proof => proof.path), Object.keys(assets), 'complete exact HTTP asset proof');
  for (const proof of [...report.httpAssetProof, ...report.browserResponses]) {
    const wanted = assets[proof.path]?.servedSHA256 || report.fixtures[proof.path]?.servedSHA256;
    assert(wanted, 'unknown response path'); assert.equal(proof.status, 200); assert.equal(proof.expectedSHA256, wanted); assert.equal(proof.receivedSHA256, wanted);
    if (Object.hasOwn(proof, 'check')) assert(cleanupRemountCases.includes(proof.check), 'unknown browser-response case');
  }
  assert.deepEqual(report.checks.map(check => check.name), cleanupRemountCases, 'exact unique ordered case inventory');
  if (mutation) {
    assert.deepEqual(positiveChecks?.map(check => check.name), cleanupRemountCases, 'exact verified clean reference inventory');
    for (const check of positiveChecks) {
      assert.equal(check.status, 'passed'); assert.deepEqual(check.oracles.map(oracle => oracle.id), cleanupRemountOracleIDs(check.name));
      assert(check.oracles.every(oracle => oracle.pass === true && same(oracle.observed, oracle.expected)), 'clean reference must agree with raw observations');
    }
  }
  for (const check of report.checks) {
    assert.equal(check.error, undefined); assert.equal(check.captureError, undefined);
    assert.deepEqual(check.oracles.map(oracle => oracle.id), cleanupRemountOracleIDs(check.name), `${check.name}: exact unique ordered oracle inventory`);
    const failed = [];
    for (const oracle of check.oracles) {
      assert(Object.hasOwn(oracle, 'observed') && Object.hasOwn(oracle, 'expected'), `${oracle.id}: missing raw observation`);
      if (Object.hasOwn(cleanupRemountFixedExpected, oracle.id)) assert.deepEqual(oracle.expected, cleanupRemountFixedExpected[oracle.id], `${oracle.id}: fixed contract target`);
      const pass = same(oracle.observed, oracle.expected);
      assert.equal(oracle.pass, pass, `${oracle.id}: cached verdict disagrees with raw observation`);
      assert.equal(oracle.prerequisite, setup.includes(oracle.id), `${oracle.id}: prerequisite classification`);
      if (oracle.prerequisite) assert(pass, `${oracle.id}: prerequisite must pass`);
      if (!pass) failed.push(oracle);
    }
    const status = failed.length ? 'failed' : 'passed'; assert.equal(check.status, status, `${check.name}: recomputed case status`);
    for (const path of receivedPaths) assert(report.browserResponses.some(proof => proof.check === check.name && proof.path === path), `${check.name}: missing browser-received ${path}`);
    if (mutation) {
      const positive = positiveChecks.find(item => item.name === check.name);
      for (let i = 0; i < check.oracles.length; i++) {
        const oracle = check.oracles[i], original = positive.oracles[i];
        // This oracle intentionally uses the current pre-request snapshot;
        // deferred/missing presentation can legitimately change that value.
        if (oracle.id !== 'seed.duplicate-does-not-restart-or-reposition') assert.deepEqual(oracle.expected, original.expected, `${oracle.id}: clean contract target must not change`);
        if (!desired.includes(check.name) && check.name !== 'serialization.disposer-order') assert.deepEqual(oracle.observed, original.observed, `${check.name}/${oracle.id}: unaffected safe observation`);
      }
    }
    if (!mutation) assert.equal(status, 'passed');
    else if (desired.includes(check.name)) {
      assert.equal(status, 'failed');
      assert.equal(failed[0]?.id, control.browserOracle, `${check.name}: first failure must be the designated oracle`);
      const designated = check.oracles.find(oracle => oracle.id === control.browserOracle);
      assert.deepEqual([designated.observed, designated.expected], mutation === 'disable-replay' ? [null, 'true'] : [true, false], 'exact designated actual/expected values');
      const allowed = mutation === 'disable-replay' ? absentStartupFailures : lateCloseFailures;
      assert(failed.every(oracle => allowed.includes(oracle.id)), `${check.name}: unrelated failure cannot count as a kill`);
      if (mutation !== 'disable-replay') assert.deepEqual(failed.map(oracle => oracle.id), lateCloseFailures);
    } else if (check.name === 'serialization.disposer-order') {
      const trace = check.oracles.find(oracle => oracle.id === ordering[1]);
      assert.deepEqual(trace.expected, orderTrace); assert.deepEqual(trace.observed, mutatedTrace[mutation]);
      assert.deepEqual(failed.map(oracle => oracle.id), mutation === 'disable-replay' ? ordering.slice(1, 4) : [ordering[1]], 'exact ordering-probe failure set');
    } else assert.equal(status, 'passed', `${check.name}: unrelated safe control must pass`);
  }
  const status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  assert.equal(report.status, status, 'recomputed report status'); assert.equal(exit, status === 'passed' ? 0 : 1, 'raw runner exit');
  assert.equal(status, mutation ? 'failed' : 'passed');
  return {status: mutation ? 'killed' : 'passed', revision, tree, surface, mutation};
}
