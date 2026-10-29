import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const mutation = process.env.LIFECYCLE_NEGATIVE_CONTROL || '';
assert(['', 'stale-refs', 'stale-results'].includes(mutation));
let source = readFileSync(new URL('../../assets/ely-api.js', import.meta.url), 'utf8');
if (mutation === 'stale-refs') source = source.replace('ordered.forEach(stop);', '// disabled teardown');
if (mutation === 'stale-results') source = source.replace('hostBindings.get(root)?.invalidate();', '// disabled invalidation');
class Element {
  constructor(id, parent = null) { this.id = id; this.parent = parent; this.dataset = {elyFamily: 'test'}; this.listeners = new Map(); this.isConnected = true; this.descendants = []; this.control = {value: 0}; }
  get parentElement() { return this.parent; }
  matches() { return true; }
  closest() { return this; }
  contains(node) { return node === this || this.descendants.some(child => child.contains(node)); }
  querySelectorAll() { return this.descendants; }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) { event.target ||= this; for (const fn of [...this.listeners.get(event.type) || []]) fn(event); if (event.bubbles) this.parent?.dispatchEvent(event); return true; }
}
const document = new Element('document'); document.documentElement = document;
const outer = new Element('outer', document), nested = new Element('nested', outer), sibling = new Element('sibling', document);
outer.descendants = [nested]; document.descendants = [outer, nested, sibling];
let observer;
const sandbox = {document, Element, CustomEvent: class {constructor(type, options = {}) { Object.assign(this, {type}, options); }}, MutationObserver: class { constructor(fn) { observer = fn; } observe() {} }};
runInNewContext(source.replaceAll('export function ', 'function ') + '\nglobalThis.api = {register,mount,emit};', sandbox);
const {register, mount, emit} = sandbox.api;
const initialized = new Map(), disposed = new Map(), disposalOrder = [];
register('test', root => {
  initialized.set(root, (initialized.get(root) || 0) + 1);
  const cached = root.control;
  const click = () => cached.value++;
  root.addEventListener('test-click', click);
  return () => { disposalOrder.push(root.id); disposed.set(root, (disposed.get(root) || 0) + 1); root.removeEventListener('test-click', click); };
});
let context;
const swap = target => { context = {}; document.dispatchEvent({type: 'htmx:before:swap', detail: {ctx: context, tasks: [{target, swapSpec: {style: 'innerHTML'}}]}}); return context; };
const restart = (ctx = context) => document.dispatchEvent({type: 'htmx:after:swap', detail: {ctx}});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); };
try {
  let changes = 0, calls = 0, resolveOld, rejectOld, resolveNew;
  const results = [], errors = [];
  mount(outer, {onAction: ({action}) => { calls++; return new Promise((resolve, reject) => { if (action === 'reject') rejectOld = reject; else if (!resolveOld) resolveOld = resolve; else resolveNew = resolve; }); }, onChange: () => changes++});
  outer.addEventListener('ely:result', e => results.push(e.detail.result));
  outer.addEventListener('ely:error', e => errors.push(e.detail.error));
  emit(outer, 'save'); emit(outer, 'reject');
  const old = outer.control;
  swap(outer); outer.control = {value: 0}; restart(); restart();
  outer.dispatchEvent({type: 'test-click'});
  assert.equal(outer.control.value, 1, 'fresh cached refs must be rebound');
  assert.equal(old.value, 0, 'detached cached refs must stay inert');
  assert.equal(disposed.get(outer), 1); assert.equal(disposed.get(nested), 1);
  assert.equal(initialized.get(outer), 2); assert.equal(initialized.get(nested), 2); assert.equal(initialized.get(sibling), 1);
  resolveOld('obsolete'); rejectOld(new Error('obsolete')); await flush();
  assert.deepEqual(results, [], 'stale callback effects must be suppressed'); assert.deepEqual(errors, [], 'stale callback errors must be suppressed');
  emit(outer, 'save'); resolveNew('current'); await flush(); assert.deepEqual(results, ['current']); assert.equal(calls, 3);
  outer.dispatchEvent({type: 'ely:change', detail: {}}); assert.equal(changes, 1);
  nested.dispatchEvent({type: 'ely:change', bubbles: true, detail: {}}); assert.equal(changes, 1, 'nested host ownership');
  swap(nested); restart(); assert.equal(disposed.get(outer), 1, 'nested swap leaves parent controller intact');
  // Cancelled preparation is recovered by finally, with no duplicate cleanup.
  swap(outer); document.dispatchEvent({type: 'htmx:finally:swap', detail: {ctx: context}}); restart();
  // Unrelated notifications and host rebinding during delayed/overlapping swaps
  // cannot remount old refs. Only the last owning context may resume the root.
  const delayed = swap(outer), overlapping = swap(outer);
  const startsBefore = initialized.get(outer);
  restart({}); mount(outer, {}); restart(delayed);
  assert.equal(initialized.get(outer), startsBefore, 'pending swap must block unrelated remount');
  outer.control = {value: 0}; restart(overlapping);
  assert.equal(initialized.get(outer), startsBefore + 1);
  outer.dispatchEvent({type: 'test-click'}); assert.equal(outer.control.value, 1);
  const before = disposed.get(outer); outer.isConnected = false; observer(); observer(); assert.equal(disposed.get(outer), before + 1);
  outer.isConnected = true; restart(); emit(outer, 'save'); assert.equal(calls, 3, 'detached host bindings must be explicitly rebound');
  let current = 0; const stale = mount(outer, {onAction: () => calls++}); mount(outer, {onAction: () => current++}); stale(); emit(outer, 'save'); await flush(); assert.equal(current, 1); assert.equal(calls, 3);
  const partial = new Element('partial', outer); partial.closest = () => outer;
  disposalOrder.length = 0; context = {};
  document.dispatchEvent({type: 'htmx:before:swap', detail: {ctx: context, tasks: [partial, sibling, nested].map(target => ({target, swapSpec: {style: 'innerHTML'}}))}});
  assert(disposalOrder.indexOf('nested') < disposalOrder.indexOf('outer'), 'child cleanup precedes ancestor across interleaved OOB tasks'); restart();
  const lazy = new Element('lazy', document); lazy.dataset.elyFamily = 'not-loaded'; document.descendants.push(lazy);
  const lazyResults = []; let resolveLazy;
  mount(lazy, {onAction: () => new Promise(resolve => { resolveLazy = resolve; })});
  lazy.addEventListener('ely:result', e => lazyResults.push(e.detail.result));
  emit(lazy, 'save'); swap(lazy); restart(); resolveLazy('obsolete'); await flush();
  assert.deepEqual(lazyResults, [], 'host-only binding also invalidates obsolete operations');
  emit(lazy, 'save'); const priorResolve = resolveLazy; swap(lazy); restart(); emit(lazy, 'save');
  priorResolve('old-same-action'); resolveLazy('new-same-action'); await flush();
  assert.deepEqual(lazyResults, ['new-same-action'], 'old token cannot collide with same action after invalidation');
  lazy.isConnected = false; observer(); assert.equal(lazy.listeners.get('ely:action').size, 0, 'host-only binding is disposed on detach');
  assert.equal(mutation, '', 'negative control survived');
  console.log('Family lifecycle retained refs, ownership, teardown and async binding tests passed');
} catch (error) {
  const expected = mutation === 'stale-refs' ? 'fresh cached refs must be rebound' : 'stale callback effects must be suppressed';
  if (mutation && error instanceof assert.AssertionError && error.message.includes(expected)) console.log(`Negative control killed: ${mutation}: ${expected}`);
  else throw error;
}

// The bridge suppresses only SignaturePad's unnamed first textarea. Native
// change still bubbles, while its named hidden value and ordinary fields stay
// on the generic host notification path.
class BridgeElement {
  constructor(tagName = 'div', attrs = {}, parent = null) {
    this.tagName = tagName.toUpperCase(); this.parentElement = parent; this.children = [];
    this.attributes = new Map(Object.entries(attrs)); this.dataset = {};
    for (const [name, value] of this.attributes) if (name.startsWith('data-')) this.dataset[name.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = value;
    this.id = attrs.id || ''; this.name = attrs.name || ''; this.type = attrs.type || '';
    this.value = attrs.value || ''; this.checked = false; this.listeners = new Map(); this.isConnected = true;
    if (parent) parent.children.push(this);
  }
  matches(selector) {
    return selector.split(',').some(raw => {
      const part = raw.trim();
      if (part === '[data-ely-family]') return !!this.dataset.elyFamily;
      if (part === '[data-ui-component="signature-pad"]') return this.dataset.uiComponent === 'signature-pad';
      if (['input', 'textarea', 'select'].includes(part)) return this.tagName === part.toUpperCase();
      return false;
    });
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll(selector) {
    const found = [];
    const visit = node => node.children.forEach(child => { if (child.matches(selector)) found.push(child); visit(child); });
    visit(this); return found;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  addEventListener(type, fn) { if (!this.listeners.has(type)) this.listeners.set(type, new Set()); this.listeners.get(type).add(fn); }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  dispatchEvent(event) {
    event.target ||= this;
    for (const fn of [...this.listeners.get(event.type) || []]) fn(event);
    if (event.bubbles) this.parentElement?.dispatchEvent(event);
    return true;
  }
}
const bridgeDocument = new BridgeElement('document');
bridgeDocument.documentElement = bridgeDocument;
bridgeDocument.addEventListener = () => {};
const bridgeRoot = new BridgeElement('section', {id: 'signature-host', 'data-ely-family': 'forms', 'data-ely-component': 'forms/SignaturePad'}, bridgeDocument);
const signature = new BridgeElement('div', {'data-ui-component': 'signature-pad'}, bridgeRoot);
const fallback = new BridgeElement('textarea', {}, signature);
const secondSignatureTextarea = new BridgeElement('textarea', {}, signature);
const hidden = new BridgeElement('input', {type: 'hidden', name: 'signature_value', value: 'typed'}, signature);
const outerSignature = new BridgeElement('div', {'data-ui-component': 'signature-pad'}, bridgeRoot);
const nestedRoot = new BridgeElement('section', {id: 'nested-host', 'data-ely-family': 'forms', 'data-ely-component': 'forms/Nested'}, outerSignature);
const nestedOrdinary = new BridgeElement('textarea', {}, nestedRoot);
const ordinary = new BridgeElement('textarea', {}, bridgeRoot);
let bridgeObserver;
const bridgeSandbox = {
  document: bridgeDocument, Element: BridgeElement,
  CustomEvent: class { constructor(type, options = {}) { Object.assign(this, {type}, options); } },
  MutationObserver: class { constructor(fn) { bridgeObserver = fn; } observe() {} },
};
runInNewContext(source.replaceAll('export function ', 'function ') + '\nglobalThis.api = {register,mount};', bridgeSandbox);
const bridgeChanges = [], nestedChanges = [], nativeChanges = [];
bridgeSandbox.api.register('forms', () => {});
bridgeSandbox.api.mount(bridgeRoot, {onChange: detail => bridgeChanges.push(detail)});
bridgeSandbox.api.mount(nestedRoot, {onChange: detail => nestedChanges.push(detail)});
bridgeRoot.addEventListener('change', event => nativeChanges.push(event.target));
fallback.dispatchEvent({type: 'change', bubbles: true});
assert.deepEqual(nativeChanges, [fallback], 'unnamed SignaturePad fallback change remains a native bubbling event');
assert.deepEqual(bridgeChanges, [], 'unnamed SignaturePad fallback does not create a duplicate host change');
secondSignatureTextarea.dispatchEvent({type: 'change', bubbles: true});
assert.deepEqual(bridgeChanges.map(({name, value, type}) => ({name, value, type})), [{name: '', value: '', type: ''}], 'only the owned first textarea is excluded');
hidden.dispatchEvent({type: 'change', bubbles: true});
ordinary.dispatchEvent({type: 'change', bubbles: true});
assert.deepEqual(nestedChanges, [], 'nested host changes do not bind to the outer family');
assert.deepEqual(bridgeChanges.map(({name, value, type}) => ({name, value, type})), [
  {name: '', value: '', type: ''},
  {name: 'signature_value', value: 'typed', type: 'hidden'},
  {name: '', value: '', type: ''},
], 'named hidden commits and ordinary unnamed fields retain generic notifications');
nestedOrdinary.dispatchEvent({type: 'change', bubbles: true});
assert.deepEqual(nestedChanges.map(({name, value, type}) => ({name, value, type})), [{name: '', value: '', type: ''}], 'an ordinary unnamed textarea in a nested family is not suppressed by an outer SignaturePad');
console.log('SignaturePad fallback bridge selector regression passed');
