import assert from 'node:assert/strict';
import {readFileSync, writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';

// Execute the whole production core. Only ES export declarations are removed;
// no lifecycle functions, guards, or initializer behavior are copied into tests.
const source = readFileSync(process.env.INITIALIZER_CORE_SOURCE || new URL('../../assets/ely-api.js', import.meta.url), 'utf8');
class Element {
  constructor(id, family = null) {
    this.id = id; this.dataset = family ? {elyFamily: family} : {};
    this.parentElement = null; this.children = []; this.listeners = new Map();
  }
  get isConnected() { return this.documentRoot || !!this.parentElement?.isConnected; }
  matches(selector) { return selector === '[data-ely-family]' && !!this.dataset.elyFamily; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  append(child) { child.parentElement = this; this.children.push(child); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) {
    event.target ||= this;
    for (const fn of [...this.listeners.get(event.type) || []]) if (this.listeners.get(event.type)?.has(fn)) fn(event);
    if (event.bubbles) this.parentElement?.dispatchEvent(event);
    return !event.defaultPrevented;
  }
}
class CustomEvent {
  constructor(type, options = {}) { Object.assign(this, {type, bubbles: false, defaultPrevented: false}, options); }
  preventDefault() { this.defaultPrevented = true; }
  stopImmediatePropagation() {}
}
function harness(ids = ['root']) {
  const document = new Element('document'); document.documentRoot = true; document.documentElement = document;
  const roots = ids.map(id => { const root = new Element(id, 'test'); document.append(root); return root; });
  let observer;
  const sandbox = {document, Element, CustomEvent, MutationObserver: class {constructor(fn) { observer = fn; } observe() {}}};
  runInNewContext(source.replaceAll('export function ', 'function ') + '\nglobalThis.api = {register,mount,emit};', sandbox, {filename: 'ely-api.js'});
  const swap = (targets = roots, ctx = {}) => {
    document.dispatchEvent(new CustomEvent('htmx:before:swap', {detail: {ctx, tasks: targets.map(target => ({target, swapSpec: {style: 'innerHTML'}}))}}));
    return ctx;
  };
  const resume = ctx => document.dispatchEvent(new CustomEvent('htmx:after:swap', {detail: {ctx}}));
  return {...sandbox.api, root: roots[0], roots, document, swap, resume, prune: () => observer()};
}
const tests = [];
const check = (name, run) => tests.push({name, run});
const listenErrors = root => { const errors = []; root.addEventListener('ely:error', event => errors.push(event.detail.error)); return errors; };

check('I1.one-argument initializers retain returned-cleanup compatibility', () => {
  const h = harness(); let starts = 0, disposals = 0, observed;
  h.register('test', root => { starts++; observed = root; return () => disposals++; });
  assert.equal(observed, h.root, 'legacy initializer receives the root');
  assert.equal(h.root.dataset.elyReady, 'true'); h.resume({}); assert.equal(starts, 1);
  const ctx = h.swap(); assert.equal(disposals, 1, 'legacy returned cleanup runs on stop');
  assert.equal(h.root.dataset.elyReady, undefined); h.resume(ctx);
  assert.equal(starts, 2); h.swap(); assert.equal(disposals, 2);
});

check('I2.registered and returned functions dispose once, including after stop', () => {
  const h = harness(); let registerCleanup, disposals = 0;
  const cleanup = () => disposals++;
  h.register('test', (root, register) => { registerCleanup = register; register(cleanup); register(cleanup); return cleanup; });
  assert.equal(typeof registerCleanup, 'function', 'initializer receives registerCleanup');
  assert.equal(h.root.dataset.elyReady, 'true');
  h.swap(); assert.equal(disposals, 1, 'registered and returned cleanup runs exactly once');
  registerCleanup(cleanup); registerCleanup(cleanup); h.swap();
  assert.equal(disposals, 1, 'the once-only set survives stop');
});

check('I3.late registration after stop disposes immediately once', () => {
  const h = harness(); let registerCleanup, disposals = 0;
  h.register('test', (root, register) => { registerCleanup = register; });
  h.swap(); assert.equal(h.root.dataset.elyReady, undefined);
  const cleanup = () => disposals++;
  registerCleanup(cleanup); assert.equal(disposals, 1, 'late cleanup runs immediately after stop');
  registerCleanup(cleanup); assert.equal(disposals, 1);
  registerCleanup(null); registerCleanup({}); assert.equal(disposals, 1);
});

check('I4.late old registration cannot join a replacement mount', () => {
  const h = harness(); const registers = []; let starts = 0, oldLate = 0, fresh = 0;
  h.register('test', (root, register) => { registers.push(register); if (++starts === 2) register(() => fresh++); });
  const ctx = h.swap(); h.resume(ctx);
  const cleanup = () => oldLate++;
  registers[0](cleanup); registers[0](cleanup);
  assert.equal(oldLate, 1, 'old registrar checks the captured cleanup-array identity');
  assert.equal(fresh, 0); assert.equal(h.root.dataset.elyReady, 'true');
  h.swap(); assert.equal(oldLate, 1); assert.equal(fresh, 1);
});

check('I5.stop during initialization disposes early cleanup before return', () => {
  const h = harness(); let starts = 0, disposed = 0, disposedInside = 0, ctx;
  const cleanup = () => disposed++;
  h.register('test', (root, registerCleanup) => {
    if (++starts !== 1) return () => {};
    registerCleanup(cleanup); ctx = h.swap(); disposedInside = disposed; return cleanup;
  });
  assert.equal(disposedInside, 1, 'registered cleanup is available to a synchronous stop');
  assert.equal(disposed, 1); assert.equal(h.root.dataset.elyReady, undefined, 'stopped initialization cannot publish ready');
  h.resume(ctx); assert.equal(starts, 2); assert.equal(h.root.dataset.elyReady, 'true');
});

check('I6.legacy return after synchronous stop is disposed immediately', () => {
  const h = harness(); let disposals = 0;
  h.register('test', root => { h.swap(); return () => disposals++; });
  assert.equal(disposals, 1, 'legacy late return routes through registration');
  assert.equal(h.root.dataset.elyReady, undefined);
});

check('I7.old registered return cannot destroy a fresh mount', () => {
  const h = harness(); let starts = 0, oldDisposals = 0, freshDisposals = 0;
  const oldCleanup = () => { oldDisposals++; h.root.live = false; };
  h.register('test', (root, registerCleanup) => {
    if (++starts === 1) {
      registerCleanup(oldCleanup); const ctx = h.swap(); h.resume(ctx); return oldCleanup;
    }
    root.live = true; registerCleanup(() => freshDisposals++);
  });
  assert.equal(starts, 2); assert.equal(oldDisposals, 1, 'old registered return must not dispose again after remount');
  assert.equal(h.root.live, true, 'fresh mount survives the old initializer return');
  assert.equal(freshDisposals, 0); h.swap(); assert.equal(freshDisposals, 1);
});

check('I8.old successful return cannot overwrite a fresh initialization error', () => {
  const h = harness(); const errors = listenErrors(h.root); const freshError = new Error('fresh initialization');
  let starts = 0, oldDisposals = 0, freshDisposals = 0;
  h.register('test', (root, registerCleanup) => {
    if (++starts === 1) { const ctx = h.swap(); h.resume(ctx); return () => oldDisposals++; }
    registerCleanup(() => freshDisposals++); throw freshError;
  });
  assert.equal(oldDisposals, 1); assert.deepEqual(errors, [freshError]);
  assert.equal(h.root.dataset.elyReady, 'error', 'old success cannot overwrite the newer mount error state');
  assert.equal(freshDisposals, 0, 'owned failed initialization retains cleanup until stop');
  h.resume({}); assert.equal(starts, 2); h.swap(); assert.equal(freshDisposals, 1);
});

check('I9.old initialization error cannot publish into a fresh mount', () => {
  const h = harness(); const errors = listenErrors(h.root); let starts = 0;
  h.register('test', () => { if (++starts === 1) { const ctx = h.swap(); h.resume(ctx); throw new Error('old initialization'); } });
  assert.equal(starts, 2); assert.deepEqual(errors, [], 'stale initialization errors are not published');
  assert.equal(h.root.dataset.elyReady, 'true', 'old error cannot overwrite fresh readiness');
});

check('I10.owned initialization errors preserve existing failed-mount behavior', () => {
  const h = harness(); const errors = listenErrors(h.root); const failure = new Error('owned initialization');
  let starts = 0, disposed = 0;
  h.register('test', (root, registerCleanup) => { starts++; registerCleanup(() => disposed++); throw failure; });
  assert.deepEqual(errors, [failure], 'owned initialization still emits its exact error');
  assert.equal(h.root.dataset.elyReady, 'error'); assert.equal(disposed, 0);
  h.resume({}); assert.equal(starts, 1, 'failed owned initializer remains mounted until teardown');
  h.swap(); assert.equal(disposed, 1); assert.equal(h.root.dataset.elyReady, undefined);
});

check('I11.error-event remount owns subsequent readiness writes', () => {
  const h = harness(); const errors = listenErrors(h.root); const failure = new Error('reentrant error'); let starts = 0;
  h.root.addEventListener('ely:error', () => { const ctx = h.swap(); h.resume(ctx); });
  h.register('test', () => { if (++starts === 1) throw failure; });
  assert.deepEqual(errors, [failure]); assert.equal(starts, 2);
  assert.equal(h.root.dataset.elyReady, 'true', 'error handler remount cannot receive the old error state');
});

check('I12.cleanup-event remount keeps fresh readiness and callbacks', () => {
  const h = harness(); let starts = 0, oldDisposals = 0, freshDisposals = 0, ticks = 0;
  h.register('test', root => {
    const generation = ++starts, tick = () => ticks++;
    root.addEventListener('tick', tick);
    return () => { root.removeEventListener('tick', tick); if (generation === 1) oldDisposals++; else freshDisposals++; };
  });
  h.root.addEventListener('ely:cleanup', () => { if (starts === 1) h.resume({}); });
  h.swap([h.root], null);
  assert.equal(starts, 2); assert.equal(oldDisposals, 1); assert.equal(freshDisposals, 0);
  assert.equal(h.root.dataset.elyReady, 'true', 'old stop cannot erase the replacement ready state');
  h.root.dispatchEvent(new CustomEvent('tick')); assert.equal(ticks, 1);
});

check('I13.throwing cleanup cannot strand later cleanup or sibling roots', () => {
  const h = harness(['first', 'sibling']); const errors = h.roots.map(listenErrors);
  const failure = new Error('cleanup failure'); const disposed = [];
  h.register('test', (root, registerCleanup) => {
    if (root.id === 'first') registerCleanup(() => { disposed.push('throws'); throw failure; });
    registerCleanup(() => disposed.push(root.id));
    return () => disposed.push(`${root.id}:returned`);
  });
  assert.doesNotThrow(() => h.swap(), 'cleanup exception must not escape teardown');
  assert.deepEqual(disposed, ['throws', 'first', 'first:returned', 'sibling', 'sibling:returned'], 'cleanup failure does not strand later cleanup or sibling roots');
  assert.deepEqual(errors[0], [failure]); assert.deepEqual(errors[1], []);
  for (const root of h.roots) {
    assert.equal(root.dataset.elyReady, undefined);
    assert.equal(root.listeners.get('click').size, 0, 'core callbacks are removed');
  }
  h.swap(); assert.equal(disposed.length, 5);
});

check('I14.throwing late cleanup is isolated and remains once-only', () => {
  const h = harness(); const errors = listenErrors(h.root); const failure = new Error('late cleanup failure');
  let registerCleanup, attempts = 0, later = 0;
  h.register('test', (root, register) => { registerCleanup = register; }); h.swap();
  const cleanup = () => { attempts++; throw failure; };
  assert.doesNotThrow(() => registerCleanup(cleanup), 'late cleanup exception must not escape registration');
  registerCleanup(cleanup); registerCleanup(() => later++);
  assert.equal(attempts, 1); assert.equal(later, 1); assert.deepEqual(errors, [failure]);
  assert.equal(h.root.dataset.elyReady, undefined);
});

check('I15.cleanup-error remount survives the old initializer return', () => {
  const h = harness(); const errors = listenErrors(h.root); const failure = new Error('cleanup reentrancy');
  let starts = 0, attempts = 0, freshDisposals = 0;
  const oldCleanup = () => { attempts++; throw failure; };
  h.root.addEventListener('ely:error', () => { if (starts === 1) h.resume({}); });
  h.register('test', (root, registerCleanup) => {
    if (++starts === 1) {
      registerCleanup(oldCleanup); h.swap([root], null); return oldCleanup;
    }
    registerCleanup(() => freshDisposals++);
  });
  assert.equal(starts, 2); assert.equal(attempts, 1, 'throwing cleanup returned after remount remains once-only');
  assert.deepEqual(errors, [failure]); assert.equal(freshDisposals, 0);
  assert.equal(h.root.dataset.elyReady, 'true', 'cleanup-error remount retains fresh readiness');
  h.swap(); assert.equal(freshDisposals, 1);
});

const selected = process.env.INITIALIZER_CORE_CHECK;
assert(!selected || tests.some(test => test.name === selected), 'unknown initializer check');
const report = {suite: 'production-core-initializer-cleanup', coreSHA256: createHash('sha256').update(source).digest('hex'), browserExecuted: false, checks: []};
for (const {name, run} of tests.filter(test => !selected || test.name === selected)) {
  try { run(); report.checks.push({name, status: 'passed'}); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({name, status: 'failed', error: error.stack || String(error)}); console.error(`FAIL ${name}\n${error.stack || error}`); }
}
report.status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
if (process.env.INITIALIZER_CORE_REPORT) writeFileSync(process.env.INITIALIZER_CORE_REPORT, JSON.stringify(report, null, 2) + '\n');
if (report.status !== 'passed') process.exitCode = 1;
