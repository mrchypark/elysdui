import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {loadContextOwnerAssets} from './context-owner-assets.mjs';
import {cleanupRemountControl, elideCleanupClose} from './cleanup-remount-control.mjs';
import {cleanupRemountCoreControls, mutateCleanupRemountCore} from './cleanup-remount-core-controls.mjs';
import {cleanupRemountSourcePaths} from './cleanup-remount-evidence.mjs';

// Desired-oracle baseline. No known-bug/expected-red mode. Real MutationObserver
// pruning and actual bundled HTMX are mandatory; no lifecycle is manufactured.
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const surface = process.env.CLEANUP_REMOUNT_SURFACE || 'standalone';
const group = process.env.CLEANUP_REMOUNT_GROUP || 'all';
const mutation = process.env.CLEANUP_REMOUNT_MUTATION || '';
const groups = {
  desired: ['observer.same-root', 'observer.same-root-new-descendants'],
  controls: ['observer.different-root', 'observer.sequential', 'observer.normal-detach', 'htmx.retained', 'htmx.delayed', 'htmx.cancelled'],
  serialization: ['serialization.disposer-order', 'serialization.pending-delayed', 'serialization.pending-cancelled'],
};
const report = {
  suite: 'cleanup-remount', runToken: process.env.CLEANUP_REMOUNT_RUN_TOKEN || null, surface, group, mutation, status: 'running', stage: 'startup',
  scope: 'Desired strengthened support: explicit same-physical-root mount from ely:cleanup settles with fresh presentation intact after old disposers. Existing documented readiness guarantee is asserted separately.',
  settlement: 'Next task plus two animation frames after real observer cleanup; inside-listener initialization is recorded, not required.',
  inputLabels: {owner: 'synthetic root-local ely:context-request CustomEvent', keyboard: 'trusted Playwright keyboard', detach: 'caller DOM remove followed by native MutationObserver scheduling', htmx: 'public bundled htmx.ajax with actual HTTP response/context', listeners: 'transparent add/removeEventListener identity observation, no callback wrapping'},
  checks: [], assets: {}, fixtures: {}, sourceFiles: {}, requests: [], httpAssetProof: [], browserResponses: [],
  pageErrors: [], consoleErrors: [], requestFailures: [], serverErrors: [], transportErrors: [], runtimeErrors: [],
};
let browser, server, page, temp, current;
const responses = [];
const output = join(base, 'test-results/contracts');
const record = (id, observed, expected, prerequisite = false) => {
  let pass = true; try { assert.deepEqual(observed, expected); } catch { pass = false; }
  current.oracles.push({id, observed, expected, pass, prerequisite});
  if (!pass && prerequisite) throw new Error(`Prerequisite ${id}: ${JSON.stringify(observed)} != ${JSON.stringify(expected)}`);
};
const expect = (id, observed, expected) => record(id, observed, expected);
const must = (id, observed, expected) => record(id, observed, expected, true);
const root = () => page.locator('[data-fixture-slot="manual"] [data-ely-family]').first();
const state = () => page.evaluate(() => remountState(remountOwner));
const request = (number, x = 222, y = 223) => page.evaluate(({number, x, y}) => remountOwner.dispatchEvent(new CustomEvent('ely:context-request', {detail: {number, x, y}})), {number, x, y});
const settle = () => page.evaluate(() => new Promise(resolve => setTimeout(() => requestAnimationFrame(() => requestAnimationFrame(resolve)), 0)));
const snapshot = () => page.evaluate(() => ({state: remountState(remountOwner), old: remountState(remountOld), trace: remountLog.trace, callbacks: remountLog.callbacks, actions: remountLog.actions, errors: remountLog.errors, inputs: remountLog.inputs, ownerRequests: remountLog.ownerRequests, cleanups: remountLog.cleanups, listeners: remountListeners(remountOwner), oldListeners: remountListeners(remountOld), initialListeners: remountInitialListeners}));

// Registration observer calls the native methods with the original listener,
// options and receiver. We track only non-once production root listener types;
// no listener callback or MutationObserver implementation is replaced.
function observeBrowser() {
  window.remountLog = {trace: [], callbacks: [], actions: [], errors: [], inputs: [], ownerRequests: [], cleanups: 0};
  const tracked = new Set(['ely:context-request', 'ely:action', 'ely:change', 'keydown', 'keyup']);
  const records = new WeakMap(), identities = new WeakMap(); let next = 0;
  const add = EventTarget.prototype.addEventListener, remove = EventTarget.prototype.removeEventListener;
  const capture = options => typeof options === 'boolean' ? options : Boolean(options?.capture);
  const entries = target => { if (!records.has(target)) records.set(target, []); return records.get(target); };
  EventTarget.prototype.addEventListener = function(type, listener, options) {
    const result = add.call(this, type, listener, options);
    if (tracked.has(type) && listener && this instanceof Element) {
      if (!identities.has(listener)) identities.set(listener, ++next);
      const id = identities.get(listener), list = entries(this), c = capture(options);
      if (!list.some(item => item.type === type && item.id === id && item.capture === c)) list.push({type, id, capture: c});
    }
    return result;
  };
  EventTarget.prototype.removeEventListener = function(type, listener, options) {
    const result = remove.call(this, type, listener, options), list = records.get(this);
    if (list) { const index = list.findIndex(item => item.type === type && item.id === identities.get(listener) && item.capture === capture(options)); if (index >= 0) list.splice(index, 1); }
    return result;
  };
  window.remountListeners = node => (records.get(node) || []).map(item => ({...item}));
  window.remountState = node => {
    const panel = node.querySelector('[role="menu"]'), trigger = node.querySelector('[data-interaction-menu]');
    return {hidden: panel.hidden, expanded: trigger.getAttribute('aria-expanded'), ready: node.dataset.elyReady || null, connected: node.isConnected, left: panel.style.left, top: panel.style.top, focus: node.contains(document.activeElement) ? document.activeElement.value || document.activeElement.id : document.activeElement?.id || null};
  };
  for (const type of ['error', 'unhandledrejection']) window.addEventListener(type, event => remountLog.errors.push({type, message: event.message || String(event.reason)}));
  const observedErrors = new WeakSet(), observedRoots = new WeakSet();
  const runtimeError = event => {
    if (observedErrors.has(event)) return;
    observedErrors.add(event);
    const error = event.detail?.error;
    remountLog.errors.push({type: event.type, id: event.detail?.id || null, action: event.detail?.action || null, target: event.target?.id || null, connected: Boolean(event.target?.isConnected), name: error?.name || null, message: error?.message ?? String(error), stack: error?.stack || null, raw: String(error)});
  };
  for (const type of ['ely:error', 'htmx:error']) document.addEventListener(type, runtimeError);
  // Detached-root cleanup errors do not bubble to document and are caught by
  // core, so neither document telemetry nor pageerror would observe them.
  window.remountObserveErrors = node => {
    if (observedRoots.has(node)) return;
    observedRoots.add(node); node.addEventListener('ely:error', runtimeError);
  };
  document.addEventListener('ely:context-request', event => remountLog.ownerRequests.push({target: event.target.id, constructor: event.constructor.name, isTrusted: event.isTrusted, detail: event.detail}), true);
  document.addEventListener('ely:action', event => remountLog.actions.push({id: event.target.id, value: event.detail.value}));
  for (const type of ['keydown', 'keyup']) document.addEventListener(type, event => remountLog.inputs.push({type, key: event.key, isTrusted: event.isTrusted, value: event.target.value}), true);
}

async function ready(origin) {
  await page.goto(origin + '/');
  await page.waitForFunction(() => document.querySelectorAll('[data-ely-family]').length === 10 && [...document.querySelectorAll('[data-ely-family]')].every(node => node.dataset.elyReady === 'true'));
  await page.evaluate(() => document.fonts.ready);
  must('fixture.renderer-screen-count', await page.locator('[data-sdui-screen]').count(), surface === 'catalogue' ? 10 : 0);
  must('fixture.unique-production-ids', await page.locator('[id]').evaluateAll(nodes => new Set(nodes.map(node => node.id)).size === nodes.length), true);
  await page.evaluate(async () => {
    const api = await import('/assets/ely-api.js'); window.remountAPI = api;
    window.remountOwner = document.querySelector('[data-fixture-slot="manual"] [data-ely-family]');
    window.remountOld = remountOwner; window.remountSlot = remountOwner.parentElement;
    window.remountInitialPanel = remountOld.querySelector('[role="menu"]');
    remountObserveErrors(remountOld);
    window.remountBind = (node, generation) => api.mount(node, {onAction(detail, current) {
      remountLog.callbacks.push({generation, value: detail.value, closed: current.querySelector('[role="menu"]').hidden, values: detail.values});
      return {generation};
    }});
    remountBind(remountOwner, 'old');
    window.remountInitialListeners = remountListeners(remountOwner);
    document.getElementById('before').focus();
    remountOwner.dispatchEvent(new CustomEvent('ely:context-request', {detail: {number: '1', x: 111, y: 112}}));
    const response = await fetch('/fragment'); if (!response.ok) throw new Error('Production fragment fetch failed');
    const template = document.createElement('template'); template.innerHTML = await response.text();
    window.remountFragment = template.content.querySelector('[data-ely-family]');
    remountOld.addEventListener('ely:cleanup', () => { remountLog.cleanups++; remountLog.trace.push({phase: 'cleanup-enter', state: remountState(remountOld)}); });
  });
  must('setup.old-presentation-open', (await state()).hidden, false);
  must('setup.old-owner-request-listener-once', await page.evaluate(() => remountInitialListeners.filter(item => item.type === 'ely:context-request').length), 1);
  await Promise.all(responses);
  for (const path of ['/assets/ely-api.js', '/assets/ely-api-interaction.js', '/assets/ely-api-interaction-entry.js', '/assets/htmx.min.js', '/assets/app.css', '/assets/ely-api.css', '/assets/ely-api-interaction.css', '/fragment']) {
    must('fixture.browser-exact-bytes.' + path, report.browserResponses.some(proof => proof.check === current.name && proof.path === path && proof.status === 200 && proof.expectedSHA256 === proof.receivedSHA256), true);
  }
}

async function observerCase(name) {
  await page.evaluate(name => {
    const old = remountOld;
    const mountFresh = () => {
      if (name === 'observer.different-root') {
        window.remountOwner = remountFragment;
        remountOwner.querySelector('[data-interaction-context]').dataset.elyContextNumber = '1';
      } else if (name === 'observer.same-root-new-descendants') {
        old.replaceChildren(...remountFragment.childNodes);
      }
      if (name !== 'observer.different-root') {
        const surface = remountOwner.querySelector('[data-interaction-context]');
        surface.dataset.elyContextNumber = '2'; surface.dataset.elyContextX = '222'; surface.dataset.elyContextY = '223';
      }
      remountObserveErrors(remountOwner);
      remountSlot.append(remountOwner);
      remountBind(remountOwner, 'fresh');
      remountLog.trace.push({phase: 'mount-return', state: remountState(remountOwner), samePhysicalRoot: remountOwner === old});
    };
    window.remountFresh = mountFresh;
    if (!['observer.sequential', 'observer.normal-detach'].includes(name)) old.addEventListener('ely:cleanup', mountFresh, {once: true});
    old.remove();
    remountLog.trace.push({phase: 'remove-return', cleanups: remountLog.cleanups});
  }, name);
  // A task boundary is deliberate: this must be the native observer, not a
  // synthetic HTMX event or a direct/private call into prune()/stop().
  await settle();
  if (name === 'observer.sequential') {
    const before = await snapshot(); current.beforeSequentialMount = before;
    expect('sequential.old-controller-finished-first', [before.cleanups, before.old.ready, before.old.hidden, before.oldListeners.length], [1, null, true, 0]);
    await page.evaluate(() => remountFresh()); await settle();
  }
  const result = await snapshot(); current.afterTeardown = result;
  expect('cleanup.native-observer-not-inline-remove', result.trace.find(event => event.phase === 'remove-return')?.cleanups, 0);
  expect('cleanup.old-owner-once', result.cleanups, 1);
  expect('cleanup.event-before-old-close', result.trace.find(event => event.phase === 'cleanup-enter')?.state.hidden, false);
  if (name === 'observer.normal-detach') {
    expect('normal-detach.old-presentation-closed', result.old.hidden, true);
    expect('normal-detach.readiness-cleared', result.old.ready, null);
    expect('normal-detach.listeners-removed', result.oldListeners, []);
    await request('2');
    expect('normal-detach.old-owner-request-inert', await state(), result.old);
    return;
  }
  expect('identity.physical-root', await page.evaluate(() => remountOwner === remountOld), name !== 'observer.different-root');
  expect('identity.textual-owner-unchanged', await page.evaluate(() => remountOwner.id === remountOld.id), true);
  expect('identity.descendants-replaced-or-reused', await page.evaluate(() => remountOwner.querySelector('[role="menu"]') === remountInitialPanel), !['observer.different-root', 'observer.same-root-new-descendants'].includes(name));
  expect('readiness.fresh-owner-survives-old-cleanup', result.state.ready, 'true');
  expect('presentation.seed-survives-old-disposers', result.state.hidden, false);
  expect('presentation.expanded-survives-old-disposers', result.state.expanded, 'true');
  expect('presentation.request-point-survives', [result.state.left, result.state.top], ['222px', '223px']);
  expect('presentation.seed-focus-on-enabled-row', result.state.focus, 'open');
  if (name === 'observer.different-root') {
    expect('replacement.old-presentation-closed', result.old.hidden, true);
    expect('replacement.old-listeners-removed', result.oldListeners, []);
  }
  await verifyFreshOwner(name === 'observer.different-root' ? '1' : '2');
}

async function verifyFreshOwner(seed) {
  const result = await snapshot();
  const counts = list => Object.fromEntries(['ely:context-request', 'ely:action', 'ely:change', 'keydown', 'keyup'].map(type => [type, list.filter(item => item.type === type).length]));
  expect('ownership.listener-cardinality', counts(result.listeners), counts(result.initialListeners));
  expect('ownership.old-listener-identities-gone', result.listeners.some(item => result.initialListeners.some(old => old.id === item.id)), false);
  const before = await state(); await request(seed, 444, 445);
  expect('seed.duplicate-does-not-restart-or-reposition', await state(), before);
  await page.locator('#before').focus(); await request(seed);
  expect('seed.dismissed-duplicate-stays-closed', (await state()).hidden, true);
  await request('3');
  expect('fresh.changed-number-opens', (await state()).hidden, false);
  expect('fresh.changed-number-focus-first-enabled', (await state()).focus, 'open');
  expect('input.owner-request-provenance', await page.evaluate(() => remountLog.ownerRequests.filter(event => event.detail?.number === '3').map(({constructor, isTrusted, detail, target}) => ({constructor, isTrusted, detail, sameOwner: target === remountOwner.id}))), [{constructor: 'CustomEvent', isTrusted: false, detail: {number: '3', x: 222, y: 223}, sameOwner: true}]);
  await page.keyboard.press('ArrowDown');
  expect('fresh.native-navigation-skips-disabled', (await state()).focus, 'check');
  await page.keyboard.down('Space');
  expect('fresh.keydown-no-business-callback', await page.evaluate(() => remountLog.callbacks), []);
  await page.keyboard.up('Space'); await settle();
  expect('fresh.keyup-fresh-callback-once-after-dismissal', await page.evaluate(() => remountLog.callbacks), [{generation: 'fresh', value: 'check', closed: true, values: [['scope', 'caller-value']]}]);
  expect('fresh.one-action-event', await page.evaluate(() => remountLog.actions.map(event => event.value)), ['check']);
  expect('fresh.check-committed', await root().locator('[value="check"]').getAttribute('aria-checked'), 'true');
  expect('input.native-keyboard-provenance', await page.evaluate(() => remountLog.inputs.map(({type, key, isTrusted}) => ({type, key, isTrusted}))), [
    {type: 'keydown', key: 'ArrowDown', isTrusted: true}, {type: 'keyup', key: 'ArrowDown', isTrusted: true},
    {type: 'keydown', key: ' ', isTrusted: true}, {type: 'keyup', key: ' ', isTrusted: true},
  ]);
  await page.locator('#before').focus(); await request('4'); await page.keyboard.press('Escape');
  expect('fresh.escape-returns-caller-focus', await page.locator('#before').evaluate(node => node === document.activeElement), true);
  expect('fresh.escape-closes', (await state()).hidden, true);
  // Dispose the new controller independently; a lingering old owner must not
  // take over and cleanup must not run twice for a single controller.
  await page.evaluate(() => {
    window.freshCleanupCount = 0;
    remountOwner.addEventListener('ely:cleanup', () => freshCleanupCount++);
    remountOwner.remove();
  });
  await settle();
  expect('fresh.cleanup-once', await page.evaluate(() => freshCleanupCount), 1);
  expect('fresh.listeners-removed-after-final-detach', await page.evaluate(() => remountListeners(remountOwner)), []);
  expect('fresh.readiness-cleared-after-final-detach', (await state()).ready, null);
}

async function htmxCase(name) {
  await page.evaluate(name => {
    window.remountHTMXContext = null; window.remountPending = null;
    // This capture listener observes the actual context before core teardown;
    // it neither fabricates nor suppresses any lifecycle event.
    document.addEventListener('htmx:before:swap', event => { window.remountHTMXContext = event.detail?.ctx; }, {capture: true, once: true});
    remountOld.addEventListener('ely:cleanup', () => {
      const surface = remountOld.querySelector('[data-interaction-context]');
      surface.dataset.elyContextNumber = '2'; surface.dataset.elyContextX = '222'; surface.dataset.elyContextY = '223';
      remountBind(remountOld, 'fresh');
      remountLog.trace.push({phase: 'pending-mount-return', contextPresent: Boolean(remountHTMXContext), state: remountState(remountOld), listeners: remountListeners(remountOld)});
    }, {once: true});
    document.addEventListener('htmx:before:swap', event => {
      const ctx = event.detail?.ctx;
      remountLog.trace.push({phase: 'before-swap-after-core', contextSame: ctx === remountHTMXContext, contextPresent: Boolean(ctx), state: remountState(remountOld), tasks: (event.detail?.tasks || []).map(task => ({sameTarget: task.target === remountOld, style: task.swapSpec?.style}))});
      // A real delayed swap yields after this event. Record the unchanged old
      // DOM and stopped readiness in a microtask without replacing HTMX timers.
      if (name === 'htmx.delayed') queueMicrotask(() => { window.remountPending = {state: remountState(remountOld), samePanel: remountOld.querySelector('[role="menu"]') === remountOldPanel}; });
      if (name === 'htmx.cancelled') event.preventDefault();
    }, {once: true});
    for (const type of ['htmx:after:swap', 'htmx:finally:swap']) document.addEventListener(type, event => remountLog.trace.push({phase: type, contextSame: event.detail?.ctx === remountHTMXContext, state: remountState(remountOld)}), {once: true});
    window.remountOldPanel = remountOld.querySelector('[role="menu"]');
    window.remountSwap = htmx.ajax('GET', '/fragment', {source: '#swap-source', target: remountOld, select: '[data-ely-family] > *', swap: name === 'htmx.delayed' ? 'innerHTML swap:120 settle:0' : 'innerHTML settle:0'});
    return remountSwap;
  }, name);
  await settle();
  const result = await snapshot(); current.afterTeardown = result;
  expect('htmx.actual-context-and-retained-target', result.trace.find(event => event.phase === 'before-swap-after-core')?.tasks, [{sameTarget: true, style: 'innerHTML'}]);
  expect('htmx.pending-context-present', result.trace.find(event => event.phase === 'pending-mount-return')?.contextPresent, true);
  // The old visible presentation is still observed during cleanup; no fresh
  // seed is initialized inside the event because context suspension preceded it.
  const pending = result.trace.find(event => event.phase === 'pending-mount-return');
  expect('htmx.cleanup-mount-does-not-initialize-seed', pending?.state.left, '111px');
  expect('htmx.cleanup-mount-keeps-only-old-request-listener', pending?.listeners.filter(item => item.type === 'ely:context-request').length, 1);
  const before = result.trace.find(event => event.phase === 'before-swap-after-core');
  expect('htmx.stopped-after-core-before-mutation', [before?.contextPresent, before?.contextSame, before?.state.ready, before?.state.hidden], [true, true, null, true]);
  expect('htmx.old-owner-cleanup-once', result.cleanups, 1);
  expect('htmx.retained-physical-root', await root().evaluate(node => node === remountOld), true);
  expect('htmx.cancel-or-replace-descendants', await page.evaluate(() => remountOld.querySelector('[role="menu"]') === remountOldPanel), name === 'htmx.cancelled');
  expect('htmx.finally-resumes-same-context', result.trace.filter(event => event.phase === 'htmx:finally:swap').map(event => [event.contextSame, event.state.ready]), [[true, 'true']]);
  if (name === 'htmx.delayed') expect('htmx.real-delay-stays-stopped-with-old-dom', await page.evaluate(() => ({ready: remountPending?.state.ready, hidden: remountPending?.state.hidden, samePanel: remountPending?.samePanel})), {ready: null, hidden: true, samePanel: true});
  expect('readiness.fresh-owner-after-real-htmx', result.state.ready, 'true');
  expect('presentation.seed-open-after-real-htmx', result.state.hidden, false);
  expect('presentation.seed-point-after-real-htmx', [result.state.left, result.state.top], ['222px', '223px']);
  expect('presentation.seed-focus-after-real-htmx', result.state.focus, 'open');
  expect('htmx.real-network-request', report.requests.some(entry => entry.check === current.name && entry.path === '/fragment' && entry.htmx === 'true'), true);
  await verifyFreshOwner('2');
}

// Supplement the unchanged production-renderer desired cases with a core-family
// extension probe: two real registered disposers and native observer delivery.
async function serializationCase() {
  await page.evaluate(() => {
    window.serializationTrace = []; window.serializationStarts = 0;
    const probe = document.createElement('div');
    probe.id = 'serialization-probe'; probe.dataset.elyFamily = 'serialization-probe';
    document.body.append(probe); window.serializationProbe = probe; remountObserveErrors(probe);
    remountAPI.register('serialization-probe', (root, registerCleanup) => {
      const generation = ++serializationStarts;
      serializationTrace.push('init:' + generation);
      registerCleanup(() => serializationTrace.push('first:' + generation));
      registerCleanup(() => serializationTrace.push('last:' + generation));
    });
    probe.addEventListener('ely:cleanup', () => {
      serializationTrace.push('event'); document.body.append(probe); remountAPI.mount(probe);
    }, {once: true});
    probe.remove();
    window.serializationInlineStarts = serializationStarts;
  });
  await settle();
  expect('serialization.native-observer-is-not-inline', await page.evaluate(() => serializationInlineStarts), 1);
  expect('serialization.all-old-disposers-before-new-init', await page.evaluate(() => serializationTrace), ['init:1', 'event', 'first:1', 'last:1', 'init:2']);
  expect('serialization.fresh-ready', await page.evaluate(() => serializationProbe.dataset.elyReady || null), 'true');
  await page.evaluate(() => serializationProbe.remove()); await settle();
  expect('serialization.final-controller-disposed-once', await page.evaluate(() => serializationTrace.filter(item => item === 'last:2').length), 1);
  expect('serialization.final-ready-cleared', await page.evaluate(() => serializationProbe.dataset.elyReady || null), null);
}

async function pendingDescendantCase(name) {
  await page.evaluate(async name => {
    window.pendingChildStarts = 0; window.pendingChildDisposals = 0;
    window.pendingChildContext = null; window.pendingChildInside = null; window.pendingChildBefore = null; window.pendingChildDelayed = null;
    remountAPI.register('pending-child-probe', () => { pendingChildStarts++; return () => pendingChildDisposals++; });
    document.addEventListener('htmx:before:swap', event => { window.pendingChildContext = event.detail?.ctx; }, {capture: true, once: true});
    remountOld.addEventListener('ely:cleanup', () => {
      const child = document.createElement('div'); child.id = 'pending-child-probe'; child.dataset.elyFamily = 'pending-child-probe';
      remountOld.append(child); window.pendingChild = child; remountObserveErrors(child);
      remountAPI.mount(remountOld); remountAPI.mount(child);
      window.pendingChildInside = {starts: pendingChildStarts, ready: child.dataset.elyReady || null, connected: child.isConnected};
    }, {once: true});
    document.addEventListener('htmx:before:swap', event => {
      window.pendingChildBefore = {starts: pendingChildStarts, ready: pendingChild.dataset.elyReady || null, connected: pendingChild.isConnected, contextSame: event.detail?.ctx === pendingChildContext, tasks: event.detail?.tasks.map(task => ({sameTarget: task.target === remountOld, style: task.swapSpec?.style}))};
      if (name === 'serialization.pending-cancelled') event.preventDefault();
      else queueMicrotask(() => { window.pendingChildDelayed = {starts: pendingChildStarts, ready: pendingChild.dataset.elyReady || null, connected: pendingChild.isConnected}; });
    }, {once: true});
    await htmx.ajax('GET', '/fragment', {source: '#swap-source', target: remountOld, select: '[data-ely-family] > *', swap: 'innerHTML swap:120 settle:0'});
  }, name);
  await settle();
  expect('pending-descendant.deferred-inside-cleanup', await page.evaluate(() => pendingChildInside), {starts: 0, ready: null, connected: true});
  expect('pending-descendant.real-owning-context-before-mutation', await page.evaluate(() => pendingChildBefore), {starts: 0, ready: null, connected: true, contextSame: true, tasks: [{sameTarget: true, style: 'innerHTML'}]});
  if (name === 'serialization.pending-delayed') {
    expect('pending-descendant.real-delay-does-not-start-new-child', await page.evaluate(() => pendingChildDelayed), {starts: 0, ready: null, connected: true});
    expect('pending-descendant.replaced-child-never-starts', await page.evaluate(() => ({starts: pendingChildStarts, ready: pendingChild.dataset.elyReady || null, connected: pendingChild.isConnected})), {starts: 0, ready: null, connected: false});
  } else {
    expect('pending-descendant.cancelled-context-resumes-child-once', await page.evaluate(() => ({starts: pendingChildStarts, ready: pendingChild.dataset.elyReady || null, connected: pendingChild.isConnected})), {starts: 1, ready: 'true', connected: true});
    await page.evaluate(() => pendingChild.remove()); await settle();
    expect('pending-descendant.fresh-child-cleanup-once', await page.evaluate(() => pendingChildDisposals), 1);
  }
  expect('pending-descendant.real-network-request', report.requests.some(entry => entry.check === current.name && entry.path === '/fragment' && entry.htmx === 'true'), true);
}

try {
  assert(['standalone', 'catalogue'].includes(surface), 'unknown renderer surface');
  assert(['all', 'desired', 'controls', 'serialization'].includes(group), 'unknown case group');
  assert(!mutation || mutation === cleanupRemountControl.name || Object.hasOwn(cleanupRemountCoreControls, mutation), 'unknown causal intervention');
  assert(!mutation || group === 'all', 'causal intervention must include normal teardown, safe controls and desired cases');
  report.revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: base, encoding: 'utf8'}).trim();
  report.tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: base, encoding: 'utf8'}).trim();
  report.dirty = execFileSync('git', ['status', '--porcelain'], {cwd: base, encoding: 'utf8'}).trim();
  assert.equal(report.dirty, '', 'browser evidence requires a clean committed checkout');
  report.toolchain = {node: process.version, playwright: JSON.parse(await readFile(join(base, 'node_modules/playwright/package.json'), 'utf8')).version, go: execFileSync(process.env.GO || 'go', ['version'], {encoding: 'utf8'}).trim()};
  const fixturePath = surface === 'standalone' ? './ui/gohtmx/tests/fixtures/context-owner-requests' : './adapters/gohtmx/tests/fixtures/context-owner-requests';
  const sourcePaths = cleanupRemountSourcePaths;
  for (const path of sourcePaths) report.sourceFiles[path] = sha(await readFile(join(base, path)));
  const deps = execFileSync(process.env.GO || 'go', ['list', '-deps', './ui/gohtmx/tests/fixtures/context-owner-requests'], {cwd: base, encoding: 'utf8'}).trim().split('\n');
  assert(!deps.some(dep => /github\.com\/mrchypark\/elysdui\/(sdui|adapters)(\/|$)/.test(dep)), 'standalone fixture may not depend on SDUI/adapter');
  report.standaloneDependencyProof = {SHA256: sha(deps.join('\n')), forbiddenImports: []};
  temp = await mkdtemp(join(tmpdir(), 'ely-cleanup-remount-'));
  const binary = join(temp, 'fixture');
  execFileSync(process.env.GO || 'go', ['build', '-o', binary, fixturePath], {cwd: base, stdio: 'pipe'});
  report.fixtureBuild = {path: fixturePath, binarySHA256: sha(await readFile(binary)), buildInfo: execFileSync(process.env.GO || 'go', ['version', '-m', binary], {cwd: base, encoding: 'utf8'}).trim()};
  const fragmentArgs = ['-id=manual', '-mode=manual', '-number=2', '-x=222', '-y=223'];
  const bodies = new Map([['/', execFileSync(binary, ['-full'], {cwd: base})], ['/fragment', execFileSync(binary, fragmentArgs, {cwd: base})]]);
  await mkdir(join(output, 'cleanup-remount-fixtures'), {recursive: true});
  for (const [path, body] of bodies) {
    const html = `cleanup-remount-fixtures/${sha(body)}.html`;
    await writeFile(join(output, html), body);
    report.fixtures[path] = {html, sourceSHA256: sha(body), servedSHA256: sha(body), bytes: body.length, command: [fixturePath, ...(path === '/' ? ['-full'] : fragmentArgs)], productionRenderer: surface === 'standalone' ? 'ui.RenderComponent' : 'CatalogueRegistry + Decode + Compile + Plan.Render'};
  }
  const assets = await loadContextOwnerAssets(base);
  if (mutation === cleanupRemountControl.name) {
    const asset = assets.get(cleanupRemountControl.file);
    asset.body = Buffer.from(elideCleanupClose(asset.body.toString('utf8')));
    asset.servedSHA256 = sha(asset.body); asset.bytes = asset.body.length;
    report.causalIntervention = {...cleanupRemountControl, anchorCount: 1, interpretation: 'Diagnostic only. Normal-detach close must fail; removing disposal is not a fix. No failures are converted to success.'};
  }
  if (Object.hasOwn(cleanupRemountCoreControls, mutation)) {
    const control = cleanupRemountCoreControls[mutation], asset = assets.get(control.file);
    asset.body = Buffer.from(mutateCleanupRemountCore(asset.body.toString('utf8'), mutation));
    asset.servedSHA256 = sha(asset.body); asset.bytes = asset.body.length;
    report.causalIntervention = {name: mutation, ...control, anchorCount: 1, interpretation: 'Test-only startup mutation; all old disposers remain. Raw failures retain their nonzero exit.'};
  }
  for (const [path, {body, referencedBy, ...metadata}] of assets) report.assets[path] = {...metadata, referencedBy: [...referencedBy]};
  assert.deepEqual(Object.entries(report.assets).filter(([, asset]) => asset.sourceSHA256 !== asset.servedSHA256).map(([path]) => path), mutation ? [report.causalIntervention.file] : [], 'only declared causal bytes may differ');
  server = createServer((request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    const entry = {check: current?.name, path, method: request.method, htmx: request.headers['hx-request'] || null}; report.requests.push(entry);
    try {
      const asset = assets.get(path), body = bodies.get(path) || asset?.body;
      if (!body) { entry.status = 404; return response.writeHead(404).end(); }
      entry.status = 200; entry.responseSHA256 = sha(body); entry.bytes = body.length;
      response.setHeader('content-type', bodies.has(path) ? 'text/html; charset=utf-8' : asset.contentType).end(body);
    } catch (error) { report.serverErrors.push(String(error)); response.writeHead(500).end(); }
  });
  report.stage = 'server-start';
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const [path, asset] of assets) {
    const response = await fetch(origin + path), body = Buffer.from(await response.arrayBuffer());
    const proof = {path, status: response.status, expectedSHA256: asset.servedSHA256, receivedSHA256: sha(body)};
    report.httpAssetProof.push(proof); assert.equal(proof.status, 200); assert.equal(proof.receivedSHA256, proof.expectedSHA256);
  }
  report.stage = 'browser-launch'; browser = await chromium.launch({headless: true}); report.browserVersion = browser.version();
  page = await browser.newPage({viewport: {width: 1440, height: 1100}}); page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.pageErrors.push({check: current?.name, message: error.message, stack: error.stack}));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({check: current?.name, message: message.text()}); });
  page.on('requestfailed', request => report.requestFailures.push({check: current?.name, url: request.url(), error: request.failure()?.errorText}));
  page.on('response', response => {
    const check = current?.name, path = new URL(response.url()).pathname;
    responses.push((async () => {
      try {
        const body = await response.body(), expected = report.assets[path]?.servedSHA256 || report.fixtures[path]?.servedSHA256;
        const proof = {check, path, status: response.status(), expectedSHA256: expected, receivedSHA256: sha(body)}; report.browserResponses.push(proof);
        if (!expected || proof.status !== 200 || proof.receivedSHA256 !== expected) report.transportErrors.push(proof);
      } catch (error) { report.transportErrors.push({check, path, error: String(error)}); }
    })());
  });
  await page.addInitScript(observeBrowser);
  const cases = group === 'all' ? [...groups.desired, ...groups.controls, ...groups.serialization] : groups[group];
  report.stage = 'checks';
  for (const name of cases) {
    current = {name, status: 'running', oracles: []}; report.checks.push(current);
    try { await ready(origin); await (name.startsWith('serialization.pending-') ? pendingDescendantCase(name) : name.startsWith('serialization.') ? serializationCase() : name.startsWith('htmx.') ? htmxCase(name) : observerCase(name)); }
    catch (error) { current.error = {message: error.message, stack: error.stack}; }
    try { current.final = await snapshot(); report.runtimeErrors.push(...current.final.errors.map(error => ({check: name, ...error}))); }
    catch (error) { current.captureError = String(error); }
    await Promise.all(responses);
    for (const key of ['pageErrors', 'consoleErrors', 'requestFailures', 'serverErrors', 'transportErrors', 'runtimeErrors']) expect('errors.none.' + key, report[key].filter(error => !error.check || error.check === name), []);
    current.status = current.error || current.captureError || current.oracles.some(oracle => !oracle.pass) ? 'failed' : 'passed';
    console.log(`${surface}/${name}: ${current.status}`);
    for (const oracle of current.oracles.filter(oracle => !oracle.pass)) console.error(`${oracle.id}: observed=${JSON.stringify(oracle.observed)} expected=${JSON.stringify(oracle.expected)}`);
  }
  report.status = report.checks.length === cases.length && report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
} catch (error) { report.status = 'failed'; report.error = {message: error.message, stack: error.stack}; }
finally {
  if (page) await page.close(); if (browser) await browser.close();
  if (server) await new Promise(resolve => server.close(resolve));
  if (temp) await rm(temp, {recursive: true, force: true});
  report.completedAt = new Date().toISOString();
  await mkdir(output, {recursive: true});
  const path = join(output, `cleanup-remount-${surface}-${group}-${mutation || 'clean'}.json`);
  await writeFile(path, JSON.stringify(report, null, 2) + '\n'); console.log(path);
}
if (report.status !== 'passed') process.exitCode = 1;
