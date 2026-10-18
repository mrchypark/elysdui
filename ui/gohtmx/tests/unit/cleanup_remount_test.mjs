import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';

// Execute the entire production core, removing only its ES export declarations.
// This VM models lifecycle event delivery; it is not native observer/HTMX proof.
const source = readFileSync(process.env.CLEANUP_REMOUNT_CORE_SOURCE || new URL('../../assets/ely-api.js', import.meta.url), 'utf8');
class Element {
  constructor(id, family = null) {
    this.id = id; this.dataset = family ? {elyFamily: family} : {};
    this.parentElement = null; this.children = []; this.listeners = new Map();
  }
  get isConnected() { return !!this.documentRoot || !!this.parentElement?.isConnected; }
  matches(selector) { return selector === '[data-ely-family]' && !!this.dataset.elyFamily; }
  closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  append(child) { child.remove(); child.parentElement = this; this.children.push(child); }
  remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
  replaceChildren(...children) { for (const child of [...this.children]) child.remove(); for (const child of children) this.append(child); }
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
  const swap = (targets = roots, ctx = null) => {
    document.dispatchEvent(new CustomEvent('htmx:before:swap', {detail: {ctx, tasks: targets.map(target => ({target, swapSpec: {style: 'innerHTML'}}))}}));
    return ctx;
  };
  const resume = (ctx = {}, type = 'htmx:after:swap') => document.dispatchEvent(new CustomEvent(type, {detail: {ctx}}));
  return {...sandbox.api, root: roots[0], roots, document, swap, resume, prune: () => observer(), detach: root => { root.remove(); observer(); }};
}
const tests = [];
const check = (name, run) => tests.push({name, run});
const fire = (root, type, detail) => root.dispatchEvent(new CustomEvent(type, {detail}));
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };

check('R1.all old disposers precede fresh initialization', () => {
  const h = harness(), trace = []; let starts = 0, during;
  h.register('test', (root, register) => {
    const generation = ++starts; trace.push(`init:${generation}`); root.open = true;
    register(() => { trace.push(`dispose-first:${generation}`); root.open = false; if (generation === 1) h.mount(root); });
    register(() => { trace.push(`dispose-last:${generation}`); root.open = false; });
  });
  h.root.addEventListener('ely:cleanup', () => {
    trace.push('event'); during = {open: h.root.open, ready: h.root.dataset.elyReady};
    if (starts === 1) { h.document.append(h.root); h.mount(h.root); }
  });
  h.detach(h.root);
  assert.deepEqual(during, {open: true, ready: 'true'}, 'cleanup event still observes the old presentation');
  assert.deepEqual(trace, ['init:1', 'event', 'dispose-first:1', 'dispose-last:1', 'init:2'], 'all old disposers must finish before fresh initialization');
  assert.equal(h.root.open, true); assert.equal(h.root.dataset.elyReady, 'true');
});

check('R2.reused and replaced descendants retain fresh seeded presentation', () => {
  for (const replace of [false, true]) {
    const h = harness(); let starts = 0, ticks = 0, disposals = 0;
    h.root.panel = {open: false}; h.root.dataset.seed = '1';
    h.register('test', root => {
      starts++; root.panel.open = true; root.panel.seed = root.dataset.seed;
      const tick = () => ticks++; root.addEventListener('tick', tick);
      return () => { disposals++; root.panel.open = false; root.removeEventListener('tick', tick); };
    });
    const oldPanel = h.root.panel;
    h.root.addEventListener('ely:cleanup', () => {
      if (starts !== 1) return;
      if (replace) h.root.panel = {open: false};
      h.root.dataset.seed = '2'; h.document.append(h.root); h.mount(h.root);
    });
    h.detach(h.root);
    assert.equal(h.root.panel.open, true, 'fresh seeded presentation survives every old disposer');
    assert.equal(h.root.panel.seed, '2'); assert.equal(h.root.panel === oldPanel, !replace);
    assert.equal(starts, 2); assert.equal(disposals, 1); fire(h.root, 'tick'); assert.equal(ticks, 1);
    h.detach(h.root); h.prune(); assert.equal(disposals, 2); assert.equal(h.root.dataset.elyReady, undefined);
    assert.equal(h.root.listeners.get('tick').size, 0);
  }
});

check('R3.observer remount replays synchronously without a later event', () => {
  const h = harness(); let starts = 0;
  h.register('test', () => { starts++; });
  h.root.addEventListener('ely:cleanup', () => { h.document.append(h.root); h.mount(h.root); });
  h.detach(h.root);
  assert.equal(starts, 2, 'queued startup must replay after teardown without another lifecycle event');
  assert.equal(h.root.dataset.elyReady, 'true');
});

check('R4.repeated mounts coalesce and host rebinding remains immediate', async () => {
  const h = harness(); let starts = 0; const calls = [], seen = []; const stale = [];
  h.root.dataset.seed = '1';
  h.register('test', root => { starts++; seen.push([root.id, root.dataset.elyFamily, root.dataset.seed]); });
  stale.push(h.mount(h.root, {onAction: () => calls.push('old')}));
  let during;
  h.root.addEventListener('ely:cleanup', () => {
    h.document.append(h.root);
    stale.push(h.mount(h.root, {onAction: () => calls.push('first')}));
    stale.push(h.mount(h.root, {onAction: () => calls.push('second')}));
    h.mount(h.root, {onAction: () => calls.push('latest')});
    stale.forEach(dispose => dispose()); h.emit(h.root, 'choose');
    h.resume(); h.root.id = 'live-id'; h.root.dataset.seed = 'final';
    during = {starts, callbacks: [...calls], returned: stale.every(value => typeof value === 'function')};
  });
  h.detach(h.root); await flush();
  assert.deepEqual(during, {starts: 1, callbacks: ['latest'], returned: true});
  assert.deepEqual(seen, [['root', 'test', '1'], ['live-id', 'test', 'final']]);
  assert.equal(starts, 2); h.emit(h.root, 'choose'); await flush(); assert.deepEqual(calls, ['latest', 'latest']);
  assert.equal(h.root.listeners.get('ely:action').size, 1);
});

check('R5.cleanup errors and late registrations retain the full barrier', () => {
  const h = harness(['root', 'sibling']), trace = [], errors = []; const failure = new Error('old cleanup'); let starts = 0, oldRegister;
  h.register('test', (root, register) => {
    if (root === h.root) { const generation = ++starts; trace.push(`init:${generation}`); if (generation === 1) oldRegister = register; }
    register(() => { if (root === h.root && starts === 1) { trace.push('throw'); throw failure; } });
    register(() => trace.push(`last:${root.id}`));
  });
  h.root.addEventListener('ely:error', event => {
    errors.push(event.detail.error); h.mount(h.root); h.resume();
    const cleanup = () => { trace.push('late'); h.mount(h.root); };
    oldRegister(cleanup); oldRegister(cleanup);
  });
  h.swap();
  assert.deepEqual(errors, [failure], 'cleanup error identity is preserved exactly once');
  assert.deepEqual(trace, ['init:1', 'throw', 'late', 'last:root', 'init:2', 'last:sibling']);
  assert.equal(h.root.dataset.elyReady, 'true'); assert.equal(h.roots[1].dataset.elyReady, undefined);
  h.swap([h.root]); assert.equal(h.root.dataset.elyReady, undefined); h.mount(h.root); assert.equal(starts, 3, 'errors cannot leave a surviving barrier');
});

check('R6.reentrant no-op stop cannot release its outer teardown', () => {
  const h = harness(), trace = []; let starts = 0, events = 0, during;
  h.register('test', (root, register) => { trace.push(`init:${++starts}`); register(() => trace.push('last')); });
  h.root.addEventListener('ely:cleanup', () => {
    events++; h.document.append(h.root); h.mount(h.root); h.swap([h.root]); h.mount(h.root); during = starts;
  });
  h.detach(h.root);
  assert.equal(events, 1); assert.equal(during, 1, 'nested no-op stop must not drain the outer queue');
  assert.deepEqual(trace, ['init:1', 'last', 'init:2']);
});

check('R7.new pending context blocks queued roots and new descendants', () => {
  const h = harness(), starts = []; const ctx = {}; let child;
  h.register('test', root => starts.push(root.id));
  h.root.addEventListener('ely:cleanup', () => {
    h.document.append(h.root); h.mount(h.root); h.swap([h.root], ctx);
    child = new Element('new-child', 'test'); h.root.append(child); h.mount(h.root); h.resume({});
  });
  h.detach(h.root);
  assert.deepEqual(starts, ['root'], 'pending ancestor blocks a newly inserted descendant');
  assert.equal(h.root.dataset.elyReady, undefined); assert.equal(child.dataset.elyReady, undefined);
  h.resume({}); assert.deepEqual(starts, ['root']);
  h.resume(ctx); assert.deepEqual(starts, ['root', 'root', 'new-child']);
  h.resume(ctx, 'htmx:finally:swap'); assert.equal(starts.length, 3);
});

check('R8.retained delayed cancelled and overlapping contexts settle once', () => {
  const h = harness(); let starts = 0; const seen = [];
  h.register('test', root => { starts++; seen.push(root.value); }); h.root.value = 'old';
  const first = h.swap([h.root], {}), second = h.swap([h.root], {});
  h.mount(h.root); h.resume({}); h.resume(first); assert.equal(starts, 1);
  h.root.value = 'replacement'; h.resume(second, 'htmx:finally:swap');
  assert.equal(starts, 2); assert.equal(seen[1], 'replacement'); h.resume(second); assert.equal(starts, 2);
});

check('R9.nested startup defers while unrelated and replacement roots stay synchronous', () => {
  const h = harness(), trace = []; let child, sibling, replacement, during;
  h.register('test', (root, register) => { trace.push(`init:${root.id}`); register(() => trace.push(`last:${root.id}`)); });
  h.root.addEventListener('ely:cleanup', () => {
    h.document.append(h.root); h.mount(h.root);
    child = new Element('child', 'test'); h.root.append(child);
    h.resume(); h.mount(child);
    sibling = new Element('sibling', 'test'); h.document.append(sibling); h.mount(sibling);
    replacement = new Element('root', 'test'); h.document.append(replacement); h.mount(replacement);
    during = {child: child.dataset.elyReady, sibling: sibling.dataset.elyReady, replacement: replacement.dataset.elyReady};
  });
  h.detach(h.root);
  assert.deepEqual(during, {child: undefined, sibling: 'true', replacement: 'true'});
  assert.deepEqual(trace, ['init:root', 'init:sibling', 'init:root', 'last:root', 'init:root', 'init:child']);
});

check('R10.ancestor requests wait for nested teardown and rescan descendants', () => {
  const h = harness(), trace = []; const parent = new Element('parent', 'test'); h.document.append(parent); parent.append(h.root);
  let starts = 0, during, replacement;
  h.register('test', (root, register) => { if (root === parent) starts++; trace.push(`init:${root.id}`); register(() => trace.push(`last:${root.id}`)); });
  h.root.addEventListener('ely:cleanup', () => {
    // Stop the parent after temporarily removing this already-stopping child,
    // then reinsert it during the parent's cleanup so both records overlap.
    h.root.remove();
    const remount = () => { parent.append(h.root); h.mount(parent); parent.removeEventListener('ely:cleanup', remount); };
    parent.addEventListener('ely:cleanup', remount); h.swap([parent]);
    replacement = new Element('late-child', 'test'); parent.append(replacement); h.mount(parent); during = starts;
  });
  h.swap([h.root]);
  assert.equal(during, 1, 'ancestor initializer waits until the descendant old disposer finishes');
  assert.deepEqual(trace, ['init:parent', 'init:root', 'last:parent', 'init:late-child', 'last:root', 'init:parent', 'init:root']);
  assert.equal(replacement.dataset.elyReady, 'true');
});

check('R11.ordinary detach never resurrects and disconnected replay is discarded', () => {
  for (const request of [false, true]) {
    const h = harness(); let starts = 0, disposals = 0;
    h.register('test', root => { starts++; root.open = true; return () => { disposals++; root.open = false; }; });
    h.mount(h.root);
    if (request) h.root.addEventListener('ely:cleanup', () => { h.document.append(h.root); h.mount(h.root); h.root.remove(); });
    h.detach(h.root); h.prune();
    assert.equal(starts, 1); assert.equal(disposals, 1); assert.equal(h.root.open, false); assert.equal(h.root.dataset.elyReady, undefined);
    assert.equal(h.root.listeners.get('ely:action').size, 0);
    h.document.append(h.root); h.mount(h.root); assert.equal(starts, 2, 'discarded replay must not leave a lock');
  }
});

check('R12.replay resolves the final family and late registration stays synchronous', () => {
  const h = harness(), trace = [];
  h.register('test', () => trace.push('old-family'));
  h.root.addEventListener('ely:cleanup', () => {
    h.document.append(h.root); h.mount(h.root); h.root.dataset.elyFamily = 'new-family';
    h.register('new-family', root => trace.push(`fresh:${root.id}`));
    h.root.id = 'final-identity';
  });
  h.detach(h.root); assert.deepEqual(trace, ['old-family', 'fresh:final-identity']);
  const lazy = new Element('lazy', 'lazy'); h.document.append(lazy); let calls = 0;
  const dispose = h.mount(lazy, {onAction: () => calls++}); h.emit(lazy, 'choose'); assert.equal(calls, 1);
  assert.equal(lazy.dataset.elyReady, undefined); h.register('lazy', root => trace.push(root.id)); assert.equal(lazy.dataset.elyReady, 'true');
  dispose(); h.emit(lazy, 'choose'); assert.equal(calls, 1);
});

check('R13.old async results and errors cannot leak through a cleanup remount', async () => {
  const h = harness(), results = [], errors = []; let resolveOld, rejectOld, calls = 0;
  h.register('test', () => {}); h.mount(h.root, {onAction: ({action}) => new Promise((resolve, reject) => { if (action === 'fail') rejectOld = reject; else resolveOld = resolve; })});
  h.root.addEventListener('ely:result', event => results.push(event.detail.result)); h.root.addEventListener('ely:error', event => errors.push(event.detail.error));
  h.emit(h.root, 'save'); h.emit(h.root, 'fail');
  h.root.addEventListener('ely:cleanup', () => { h.document.append(h.root); h.mount(h.root, {onAction: () => { calls++; return 'fresh'; }}); });
  h.detach(h.root); resolveOld('stale'); rejectOld(new Error('stale')); await flush();
  assert.deepEqual(results, []); assert.deepEqual(errors, []); h.emit(h.root, 'save'); await flush(); assert.deepEqual(results, ['fresh']); assert.equal(calls, 1);
});

check('R14.child-first pending teardown preserves independent mounted children', () => {
  const h = harness(), trace = []; const child = new Element('child', 'test'); h.root.append(child);
  h.register('test', root => { trace.push(`init:${root.id}`); return () => trace.push(`dispose:${root.id}`); });
  const ctx = h.swap([h.root, child], {}); assert.deepEqual(trace, ['init:root', 'init:child', 'dispose:child', 'dispose:root']);
  h.resume(ctx); assert.deepEqual(trace.slice(4), ['init:root', 'init:child']);
  const childContext = h.swap([child], {}); h.mount(h.root); assert.equal(trace.filter(value => value === 'init:root').length, 2);
  h.resume(childContext); assert.equal(trace.filter(value => value === 'init:root').length, 2); assert.equal(trace.filter(value => value === 'init:child').length, 3);
});

check('R15.early registration survives while unregistered late returns retain their limit', () => {
  for (const early of [true, false]) {
    const h = harness(); let starts = 0, disposals = 0;
    const cleanup = () => { disposals++; h.root.open = false; };
    h.root.addEventListener('ely:cleanup', () => h.mount(h.root));
    h.register('test', (root, register) => {
      if (++starts === 1) { if (early) register(cleanup); h.swap([root]); return cleanup; }
      root.open = true;
    });
    assert.equal(starts, 2); assert.equal(disposals, 1); assert.equal(h.root.dataset.elyReady, 'true');
    assert.equal(h.root.open, early, early ? 'early registered cleanup cannot repeat after replay' : 'unregistered old late return can still mutate fresh DOM');
  }
});

check('R16.old late throwing registrar remains immediate once-only after replay', () => {
  const h = harness(), errors = []; let starts = 0, oldRegister, calls = 0;
  h.register('test', (root, register) => { if (++starts === 1) oldRegister = register; });
  h.root.addEventListener('ely:cleanup', () => h.mount(h.root)); h.swap();
  const failure = new Error('late retired cleanup'); h.root.addEventListener('ely:error', event => { errors.push(event.detail.error); h.mount(h.root); });
  const cleanup = () => { calls++; throw failure; }; oldRegister(cleanup); oldRegister(cleanup);
  assert.equal(calls, 1); assert.deepEqual(errors, [failure]); assert.equal(starts, 2); assert.equal(h.root.dataset.elyReady, 'true');
});

check('R17.pending descendant also blocks a new ancestor initializer', () => {
  const h = harness(), starts = []; h.register('test', root => starts.push(root.id));
  const ctx = h.swap([h.root], {});
  const parent = new Element('parent', 'test'), sibling = new Element('sibling', 'test');
  h.document.append(parent); parent.append(h.root); parent.append(sibling); h.mount(parent);
  assert.deepEqual(starts, ['root', 'sibling'], 'pending descendant must block its new ancestor without freezing an unrelated sibling');
  h.resume(ctx); assert.deepEqual(starts, ['root', 'sibling', 'parent', 'root']);
});

check('R18.replay rescans descendants inserted after the last startup request', () => {
  const h = harness(), starts = []; let child;
  h.register('test', root => starts.push(root.id));
  h.root.addEventListener('ely:cleanup', () => {
    h.document.append(h.root); h.mount(h.root);
    child = new Element('last-live-child', 'test'); h.root.append(child);
  });
  h.detach(h.root);
  assert.equal(child.dataset.elyReady, 'true', 'replay must discover descendants added after the queued startup request');
  assert.deepEqual(starts, ['root', 'root', 'last-live-child']);
});

check('R19.cleanup-time host disposer removes callbacks without cancelling family startup', async () => {
  const h = harness(); let starts = 0, calls = 0, during;
  h.register('test', () => { starts++; });
  h.root.addEventListener('ely:cleanup', () => {
    h.document.append(h.root); const disposeHost = h.mount(h.root, {onAction: () => calls++});
    disposeHost(); h.emit(h.root, 'choose'); during = {starts, calls};
  });
  h.detach(h.root); await flush();
  assert.deepEqual(during, {starts: 1, calls: 0});
  assert.equal(starts, 2, 'a returned host disposer does not cancel separately requested family startup');
  assert.equal(h.root.dataset.elyReady, 'true'); h.emit(h.root, 'choose'); await flush(); assert.equal(calls, 0);
  assert.equal(h.root.listeners.get('ely:action').size, 0);
});

const selected = process.env.CLEANUP_REMOUNT_CORE_CHECK;
assert(!selected || tests.some(test => test.name === selected), 'unknown cleanup/remount check');
const report = {suite: 'production-core-cleanup-remount', coreSHA256: createHash('sha256').update(source).digest('hex'), browserExecuted: false, checks: []};
for (const {name, run} of tests.filter(test => !selected || test.name === selected)) {
  try { await run(); report.checks.push({name, status: 'passed'}); console.log(`PASS ${name}`); }
  catch (error) { report.checks.push({name, status: 'failed', error: error.stack || String(error)}); console.error(`FAIL ${name}\n${error.stack || error}`); }
}
report.status = report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
mkdirSync('test-results/contracts', {recursive: true});
writeFileSync(process.env.CLEANUP_REMOUNT_CORE_REPORT || 'test-results/contracts/cleanup-remount-core.json', JSON.stringify(report, null, 2) + '\n');
if (report.status !== 'passed') process.exitCode = 1;
