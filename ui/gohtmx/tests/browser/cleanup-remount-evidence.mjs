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
// Source-owned targets: do not infer contracts from a report's expected fields.
// The source-only test independently checks every target against the runner AST.
export const cleanupRemountFixedExpected = {
  "fixture.unique-production-ids": true,
  "setup.old-presentation-open": false,
  "setup.old-owner-request-listener-once": 1,
  "fixture.browser-exact-bytes./assets/ely-api.js": true,
  "fixture.browser-exact-bytes./assets/ely-api-interaction.js": true,
  "fixture.browser-exact-bytes./assets/ely-api-interaction-entry.js": true,
  "fixture.browser-exact-bytes./assets/htmx.min.js": true,
  "fixture.browser-exact-bytes./assets/app.css": true,
  "fixture.browser-exact-bytes./assets/ely-api.css": true,
  "fixture.browser-exact-bytes./assets/ely-api-interaction.css": true,
  "fixture.browser-exact-bytes./fragment": true,
  "cleanup.native-observer-not-inline-remove": 0,
  "cleanup.old-owner-once": 1,
  "cleanup.event-before-old-close": false,
  "identity.textual-owner-unchanged": true,
  "readiness.fresh-owner-survives-old-cleanup": "true",
  "presentation.seed-survives-old-disposers": false,
  "presentation.expanded-survives-old-disposers": "true",
  "presentation.request-point-survives": [
    "222px",
    "223px"
  ],
  "presentation.seed-focus-on-enabled-row": "open",
  "ownership.old-listener-identities-gone": false,
  "seed.dismissed-duplicate-stays-closed": true,
  "fresh.changed-number-opens": false,
  "fresh.changed-number-focus-first-enabled": "open",
  "input.owner-request-provenance": [
    {
      "constructor": "CustomEvent",
      "isTrusted": false,
      "detail": {
        "number": "3",
        "x": 222,
        "y": 223
      },
      "sameOwner": true
    }
  ],
  "fresh.native-navigation-skips-disabled": "check",
  "fresh.keydown-no-business-callback": [],
  "fresh.keyup-fresh-callback-once-after-dismissal": [
    {
      "generation": "fresh",
      "value": "check",
      "closed": true,
      "values": [
        [
          "scope",
          "caller-value"
        ]
      ]
    }
  ],
  "fresh.one-action-event": [
    "check"
  ],
  "fresh.check-committed": "true",
  "input.native-keyboard-provenance": [
    {
      "type": "keydown",
      "key": "ArrowDown",
      "isTrusted": true
    },
    {
      "type": "keyup",
      "key": "ArrowDown",
      "isTrusted": true
    },
    {
      "type": "keydown",
      "key": " ",
      "isTrusted": true
    },
    {
      "type": "keyup",
      "key": " ",
      "isTrusted": true
    }
  ],
  "fresh.escape-returns-caller-focus": true,
  "fresh.escape-closes": true,
  "fresh.cleanup-once": 1,
  "fresh.listeners-removed-after-final-detach": [],
  "fresh.readiness-cleared-after-final-detach": null,
  "errors.none.pageErrors": [],
  "errors.none.consoleErrors": [],
  "errors.none.requestFailures": [],
  "errors.none.serverErrors": [],
  "errors.none.transportErrors": [],
  "errors.none.runtimeErrors": [],
  "replacement.old-presentation-closed": true,
  "replacement.old-listeners-removed": [],
  "sequential.old-controller-finished-first": [
    1,
    null,
    true,
    0
  ],
  "normal-detach.old-presentation-closed": true,
  "normal-detach.readiness-cleared": null,
  "normal-detach.listeners-removed": [],
  "htmx.actual-context-and-retained-target": [
    {
      "sameTarget": true,
      "style": "innerHTML"
    }
  ],
  "htmx.pending-context-present": true,
  "htmx.cleanup-mount-does-not-initialize-seed": "111px",
  "htmx.cleanup-mount-keeps-only-old-request-listener": 1,
  "htmx.stopped-after-core-before-mutation": [
    true,
    true,
    null,
    true
  ],
  "htmx.old-owner-cleanup-once": 1,
  "htmx.retained-physical-root": true,
  "htmx.finally-resumes-same-context": [
    [
      true,
      "true"
    ]
  ],
  "readiness.fresh-owner-after-real-htmx": "true",
  "presentation.seed-open-after-real-htmx": false,
  "presentation.seed-point-after-real-htmx": [
    "222px",
    "223px"
  ],
  "presentation.seed-focus-after-real-htmx": "open",
  "htmx.real-network-request": true,
  "htmx.real-delay-stays-stopped-with-old-dom": {
    "ready": null,
    "hidden": true,
    "samePanel": true
  },
  "serialization.native-observer-is-not-inline": 1,
  "serialization.all-old-disposers-before-new-init": [
    "init:1",
    "event",
    "first:1",
    "last:1",
    "init:2"
  ],
  "serialization.fresh-ready": "true",
  "serialization.final-controller-disposed-once": 1,
  "serialization.final-ready-cleared": null,
  "pending-descendant.deferred-inside-cleanup": {
    "starts": 0,
    "ready": null,
    "connected": true
  },
  "pending-descendant.real-owning-context-before-mutation": {
    "starts": 0,
    "ready": null,
    "connected": true,
    "contextSame": true,
    "tasks": [
      {
        "sameTarget": true,
        "style": "innerHTML"
      }
    ]
  },
  "pending-descendant.real-delay-does-not-start-new-child": {
    "starts": 0,
    "ready": null,
    "connected": true
  },
  "pending-descendant.replaced-child-never-starts": {
    "starts": 0,
    "ready": null,
    "connected": false
  },
  "pending-descendant.real-network-request": true,
  "pending-descendant.cancelled-context-resumes-child-once": {
    "starts": 1,
    "ready": "true",
    "connected": true
  },
  "pending-descendant.fresh-child-cleanup-once": 1
};
export function cleanupRemountExpected(check, surface, id) {
  assert(['standalone', 'catalogue'].includes(surface), 'known renderer surface');
  assert(cleanupRemountOracleIDs(check.name).includes(id), 'known case oracle');
  if (Object.hasOwn(cleanupRemountFixedExpected, id)) return cleanupRemountFixedExpected[id];
  switch (id) {
    case 'fixture.renderer-screen-count': return surface === 'catalogue' ? 10 : 0;
    case 'identity.physical-root': return check.name !== 'observer.different-root';
    case 'identity.descendants-replaced-or-reused': return !['observer.different-root', 'observer.same-root-new-descendants'].includes(check.name);
    case 'htmx.cancel-or-replace-descendants': return check.name === 'htmx.cancelled';
    case 'ownership.listener-cardinality': return listenerCounts(check.afterTeardown.initialListeners);
    case 'seed.duplicate-does-not-restart-or-reposition': return check.afterTeardown.state;
    case 'normal-detach.old-owner-request-inert': return check.afterTeardown.old;
    default: assert.fail(id + ': no source-owned contract target');
  }
}
const listenerTypes = ['ely:context-request', 'ely:action', 'ely:change', 'keydown', 'keyup'];
const listenerCounts = list => Object.fromEntries(listenerTypes.map(type => [type, list.filter(item => item.type === type).length]));
const listenerProfile = ['ely:action:false', 'ely:change:false', 'ely:context-request:false', 'keydown:false', 'keydown:true', 'keyup:false'];
const stoppedState = {hidden: true, expanded: 'false', ready: null, connected: false, left: '111px', top: '112px', focus: null};
const freshState = {hidden: false, expanded: 'true', ready: 'true', connected: true, left: '222px', top: '223px', focus: 'open'};
function verifyRelationalSnapshots(check, mutation) {
  if (check.name.startsWith('serialization.')) return;
  const snapshot = check.afterTeardown;
  assert(snapshot && typeof snapshot === 'object', 'separately captured teardown snapshot');
  for (const key of ['initialListeners', 'listeners']) {
    const list = snapshot[key]; assert(Array.isArray(list), key + ': raw listener list');
    for (const item of list) {
      assert.deepEqual(Object.keys(item).sort(), ['capture', 'id', 'type']);
      assert(listenerTypes.includes(item.type)); assert(Number.isSafeInteger(item.id) && item.id > 0); assert.equal(typeof item.capture, 'boolean');
    }
    assert.equal(new Set(list.map(item => item.id)).size, list.length, key + ': unique listener identities');
  }
  assert.deepEqual(snapshot.initialListeners.map(item => item.type + ':' + item.capture).sort(), listenerProfile, 'source-owned initial listener profile');
  const currentProfile = check.name === 'observer.normal-detach' ? [] : mutation === 'disable-replay' && desired.includes(check.name) ? ['ely:action:false', 'ely:change:false'] : listenerProfile;
  assert.deepEqual(snapshot.listeners.map(item => item.type + ':' + item.capture).sort(), currentProfile, 'case/mode-constrained current listener profile');
  if (check.name === 'observer.normal-detach') {
    assert.deepEqual(snapshot.old, stoppedState, 'stopped old owner snapshot');
    assert.deepEqual(snapshot.state, snapshot.old); assert.deepEqual(snapshot.listeners, []); assert.deepEqual(snapshot.oldListeners, []);
  } else {
    let state = freshState;
    if (mutation && desired.includes(check.name)) {
      state = {...freshState, hidden: true, expanded: 'false', focus: null};
      if (mutation === 'disable-replay') Object.assign(state, {ready: null, left: check.name === 'observer.same-root' ? '111px' : '', top: check.name === 'observer.same-root' ? '112px' : ''});
    }
    assert.deepEqual(snapshot.state, state, 'case/mode-constrained pre-request snapshot');
    const cardinality = check.oracles.find(oracle => oracle.id === 'ownership.listener-cardinality');
    assert.deepEqual(cardinality.observed, listenerCounts(snapshot.listeners), 'listener observation agrees with separate raw list');
    const oldIdentity = check.oracles.find(oracle => oracle.id === 'ownership.old-listener-identities-gone');
    assert.equal(oldIdentity.observed, snapshot.listeners.some(item => snapshot.initialListeners.some(old => old.id === item.id)), 'listener identity observation agrees with raw lists');
  }
}
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
  assert(['standalone', 'catalogue'].includes(surface), 'known expected surface');
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
      verifyRelationalSnapshots(check, '');
      for (const oracle of check.oracles) assert.deepEqual(oracle.expected, cleanupRemountExpected(check, surface, oracle.id), oracle.id + ': clean reference source-owned target');
      assert(check.oracles.every(oracle => oracle.pass === true && same(oracle.observed, oracle.expected)), 'clean reference must agree with raw observations');
    }
  }
  for (const check of report.checks) {
    assert.equal(check.error, undefined); assert.equal(check.captureError, undefined);
    assert.deepEqual(check.oracles.map(oracle => oracle.id), cleanupRemountOracleIDs(check.name), `${check.name}: exact unique ordered oracle inventory`);
    verifyRelationalSnapshots(check, mutation);
    const failed = [];
    for (const oracle of check.oracles) {
      assert(Object.hasOwn(oracle, 'observed') && Object.hasOwn(oracle, 'expected'), `${oracle.id}: missing raw observation`);
      assert.deepEqual(oracle.expected, cleanupRemountExpected(check, surface, oracle.id), `${oracle.id}: source-owned contract target`);
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
