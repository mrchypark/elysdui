import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the complete production core and interaction family. This small DOM
// models event propagation and ownership, not browser layout or trusted input.
// Trusted keyboard and real HTMX evidence belong to the CI runner. Modifier
// transitions/repeat pairing are bounded web-gesture safeguards, not a claim
// that upstream specifies every transition while Enter is held.
const core = readFileSync(new URL('../../assets/ely-api.js', import.meta.url), 'utf8');
const source = readFileSync(process.env.SEARCHABLE_MENU_RUNTIME_SOURCE || new URL('../../assets/ely-api-interaction.js', import.meta.url), 'utf8');
class Event {
  constructor(type, options = {}) { Object.assign(this, {type, bubbles: false, defaultPrevented: false, stopped: false, immediate: false}, options); }
  preventDefault() { this.defaultPrevented = true; }
  stopPropagation() { this.stopped = true; }
  stopImmediatePropagation() { this.stopped = this.immediate = true; }
}
class Node {
  constructor(kind, parent = null) {
    this.kind = kind; this.parentElement = null; this.children = []; this.dataset = {}; this.attrs = {}; this.style = {};
    this.handlers = new Map(); this.disabled = false; this.hidden = kind === 'panel'; this.value = ''; this.textContent = '';
    this.scrollLeft = this.scrollTop = this.clientLeft = this.clientTop = 0; parent?.append(this);
  }
  get doc() { return this.kind === 'document' ? this : this.parentElement?.doc; }
  get isConnected() { return Boolean(this.doc); }
  append(node) { node.remove(); this.children.push(node); node.parentElement = this; }
  remove() { if (this.parentElement) this.parentElement.children.splice(this.parentElement.children.indexOf(this), 1); this.parentElement = null; }
  contains(node) { for (; node; node = node.parentElement) if (node === this) return true; return false; }
  all() { return this.children.flatMap(node => [node, ...node.all()]); }
  matches(selector) {
    if (selector === '[data-ely-family]') return this.kind === 'root';
    if (selector === '.ely-interaction--menus') return this.kind === 'host';
    if (selector === '.ely-interaction__menu-row') return this.kind === 'row';
    if (selector === '[hidden]') return this.hidden;
    if (selector === '[role="menu"]') return this.kind === 'panel';
    if (selector === '.ely-interaction--menus [role="menu"]') return this.kind === 'panel' && !!this.parentElement?.closest('.ely-interaction--menus');
    if (selector === '.ely-interaction--menus [role="menu"]:not([hidden])') return this.matches('.ely-interaction--menus [role="menu"]') && !this.hidden;
    if (selector === '.ely-interaction--menus [role="menu"] button') return this.kind === 'item' && !!this.closest('[role="menu"]');
    if (selector === '[data-interaction-search-menu] input' || selector === '[data-interaction-search-menu] [data-interaction-filter]' || selector === '[data-interaction-filter]') return this.kind === 'input';
    if (selector === '[data-interaction-menu]') return this.kind === 'trigger';
    if (selector === '[data-ely-action]') return this.kind === 'item';
    if (selector === '[role="menu"] [role="menuitem"]') return this.kind === 'item' && !!this.parentElement?.closest('[role="menu"]');
    if (selector === 'input:not(:disabled)') return this.kind === 'input' && !this.disabled;
    if (selector === ':is(button,a):not(:disabled)') return ['item', 'trigger'].includes(this.kind) && !this.disabled;
    if (selector === 'button, [data-interaction-draggable]') return ['item', 'trigger'].includes(this.kind);
    if (selector === 'button, [role="button"], input, select, textarea') return ['item', 'trigger', 'input'].includes(this.kind);
    if (selector === '[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled), [role="menuitemradio"]:not(:disabled)') return this.kind === 'item' && !this.disabled;
    if (selector === '.ely-interaction__items > *') return this.kind === 'row';
    if (selector === '[data-interaction-menu-label]') return this.kind === 'label';
    return false;
  }
  closest(selector) { for (let node = this; node; node = node.parentElement) if (node.matches(selector)) return node; return null; }
  querySelectorAll(selector) { return this.all().filter(node => node.matches(selector)); }
  querySelector(selector) {
    if (selector.startsWith('#')) return this.all().find(node => node.id === selector.slice(1)) || null;
    if (selector.startsWith('[data-interaction-menu="')) return this.all().find(node => node.dataset.interactionMenu === selector.split('"')[1]) || null;
    return this.querySelectorAll(selector)[0] || null;
  }
  hasAttribute(key) { return Object.hasOwn(this.attrs, key) || key === 'data-interaction-menu-action' && this.kind === 'item'; }
  getAttribute(key) { return key === 'role' && this.kind === 'panel' ? 'menu' : this.attrs[key] ?? null; }
  setAttribute(key, value) { this.attrs[key] = value; }
  removeAttribute(key) { delete this.attrs[key]; }
  getBoundingClientRect() { return {left: 0, top: 0, right: 200, bottom: 100, width: 200, height: 100}; }
  focus() { this.doc.activeElement = this; }
  replaceChildren(...children) { this.textContent = children.map(child => child.textContent).join(''); }
  addEventListener(type, fn, capture = false) { if (!this.handlers.has(type)) this.handlers.set(type, []); this.handlers.get(type).push({fn, capture}); }
  removeEventListener(type, fn, capture = false) { this.handlers.set(type, (this.handlers.get(type) || []).filter(entry => entry.fn !== fn || entry.capture !== capture)); }
  dispatchEvent(event) {
    event.target ||= this; const path = []; for (let node = this; node; node = node.parentElement) path.push(node);
    const deliver = (node, capture) => { for (const entry of [...node.handlers.get(event.type) || []]) if (entry.capture === capture && !event.immediate) entry.fn(event); };
    for (const node of [...path].reverse()) { deliver(node, true); if (event.stopped) break; }
    if (!event.stopped) for (const node of path) { deliver(node, false); if (event.stopped || !event.bubbles) break; }
    return !event.defaultPrevented;
  }
  click() { if (!this.disabled) this.dispatchEvent(new Event('click', {bubbles: true})); }
}
function fixture(parent, id) {
  const root = new Node('root', parent); root.id = id; root.dataset = {elyFamily: 'interaction', elyComponent: 'menus/SearchableMenu'};
  const host = new Node('host', root), trigger = new Node('trigger', host), panel = new Node('panel', host);
  trigger.dataset.interactionMenu = panel.id = `${id}-menu`; panel.attrs.tabindex = '-1';
  const field = new Node('input', panel); field.value = 'Alpha';
  const list = new Node('list', panel), items = [];
  for (const [value, label, disabled] of [['hidden', 'Other', false], ['off', 'Alpha disabled', true], ['alpha-one', 'Alpha one', false], ['alpha-two', 'Alpha two', false]]) {
    const row = new Node('row', list), item = new Node('item', row), text = new Node('label', item);
    text.textContent = row.textContent = item.textContent = label; item.value = value; item.disabled = disabled;
    item.dataset = {interactionMenuAction: '', elyAction: 'choose-' + value}; items.push(item);
  }
  return {root, host, trigger, panel, field, list, items, open() { trigger.click(); field.focus(); }};
}
function harness() {
  const document = new Node('document'); document.documentElement = document; document.body = new Node('body', document); document.activeElement = document.body;
  document.createTextNode = textContent => ({textContent}); document.createElement = () => ({textContent: ''});
  const f = fixture(document.body, 'primary'), peer = fixture(document.body, 'peer'), errors = [], actions = [], queued = [];
  document.addEventListener('ely:error', event => errors.push(event.detail.error));
  const window = new Node('window'); window.innerWidth = 800; window.innerHeight = 600;
  let prune; const sandbox = {document, window, Element: Node, HTMLDialogElement: class {}, CustomEvent: Event, CSS: {escape: value => value},
    MutationObserver: class {constructor(fn) { prune = fn; } observe() {}}, queueMicrotask: fn => queued.push(fn), requestAnimationFrame: () => 0, cancelAnimationFrame() {}, setTimeout, clearTimeout, matchMedia: () => ({matches: true})};
  runInNewContext(core.replaceAll('export function ', 'function ') + '\n' + source.replace(/^import[^\n]*\n/, '') + '\nglobalThis.api = {mount};', sandbox);
  const bind = f => sandbox.api.mount(f.root, {onAction(detail, owner) { actions.push({id: owner.id, value: detail.value, closed: f.panel.hidden}); return {ok: true}; }});
  bind(f); bind(peer); assert.deepEqual(errors, []); assert.equal(f.root.dataset.elyReady, 'true'); f.open();
  const key = (type, key = 'Enter', extra = {}, target = f.field) => {
    const event = new Event(type, {key, bubbles: true, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, repeat: false, ...extra}); target.dispatchEvent(event); return event;
  };
  return {f, peer, document, actions, errors, key, bind, prune, flush() { queued.splice(0).forEach(fn => fn()); },
    swap(target, style, replace) { const ctx = {}; document.dispatchEvent(new Event('htmx:before:swap', {detail: {ctx, tasks: [{target, swapSpec: {style}}]}})); replace(); document.dispatchEvent(new Event('htmx:after:swap', {detail: {ctx}})); }};
}
let checks = 0;
const test = (name, run) => { run(); checks++; console.log('passed: ' + name); };
test('filter Enter waits for release, dispatches once and closes before callback', () => {
  const h = harness(); h.key('keyup'); h.key('keydown', 'Enter', {repeat: true}); h.key('keyup'); assert.deepEqual(h.actions, []);
  assert(h.key('keydown').defaultPrevented); assert.deepEqual(h.actions, []); assert.equal(h.f.panel.hidden, false);
  h.key('keydown', 'Enter', {repeat: true}); h.key('keyup'); h.key('keyup');
  assert.deepEqual(h.actions, [{id: 'primary', value: 'alpha-one', closed: true}]); assert.deepEqual(h.errors, []);
});
for (const modifier of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey']) test(modifier + ' cannot confirm at either phase or re-arm through repeat', () => {
  for (const releaseModifier of [false, true]) {
    const h = harness(); h.key('keydown', 'Enter', {[modifier]: true}); h.key('keydown', 'Enter', {repeat: true, [modifier]: !releaseModifier});
    h.key('keyup', 'Enter', {[modifier]: !releaseModifier}); assert.deepEqual(h.actions, []); assert.equal(h.f.panel.hidden, false);
    h.key('keydown'); h.key('keyup'); assert.equal(h.actions.length, 1);
  }
  const h = harness(); h.key('keydown'); h.key('keyup', 'Enter', {[modifier]: true}); h.key('keyup'); assert.deepEqual(h.actions, []);
});
test('mismatched release and a modified repeat cannot manufacture confirmation', () => {
  const h = harness(); h.key('keydown'); h.key('keyup', ' '); assert.deepEqual(h.actions, []); h.key('keyup'); assert.equal(h.actions.length, 1);
  const g = harness(); g.key('keydown'); g.key('keydown', 'Enter', {repeat: true, ctrlKey: true}); g.key('keydown', 'Enter', {repeat: true}); g.key('keyup'); assert.deepEqual(g.actions, []);
});
test('text Space stays native while ordinary row Space and Enter still confirm on release', () => {
  const h = harness(); assert.equal(h.key('keydown', ' ').defaultPrevented, false); assert.equal(h.key('keyup', ' ').defaultPrevented, false); assert.deepEqual(h.actions, []);
  h.f.field.value = 'Alpha one'; h.f.field.dispatchEvent(new Event('input', {bubbles: true})); assert.equal(h.f.field.value, 'Alpha one'); assert.deepEqual(h.actions, []);
  for (const key of [' ', 'Enter']) { if (h.f.panel.hidden) h.f.open(); const row = h.f.items[2]; row.focus(); const before = h.actions.length; h.key('keydown', key, {}, row); assert.equal(h.actions.length, before); h.key('keyup', key, {}, row); assert.equal(h.actions.length, before + 1); }
});
test('release resolves the current visible enabled result instead of caching a row', () => {
  const h = harness(); h.key('keydown'); h.f.field.value = 'Alpha two'; h.f.field.dispatchEvent(new Event('input', {bubbles: true})); h.key('keyup'); assert.equal(h.actions[0].value, 'alpha-two');
  const g = harness(); g.key('keydown'); g.f.items[2].disabled = true; g.key('keyup'); assert.equal(g.actions[0].value, 'alpha-two');
});
for (const reason of ['empty', 'all-disabled', 'no-results', 'disabled-field', 'disabled-root', 'hidden-panel', 'wrong-target', 'focus-moved', 'foreign-owner', 'closed-reopened']) test(reason + ' suppresses an invalid release', () => {
  const h = harness(); h.key('keydown');
  if (reason === 'empty') h.f.items.forEach(item => item.parentElement.remove());
  if (reason === 'all-disabled') h.f.items.forEach(item => item.disabled = true);
  if (reason === 'no-results') { h.f.field.value = 'zzzzz'; h.f.field.dispatchEvent(new Event('input', {bubbles: true})); }
  if (reason === 'disabled-field') h.f.field.disabled = true;
  if (reason === 'disabled-root') h.f.root.dataset.elyDisabled = 'true';
  if (reason === 'hidden-panel') h.f.panel.hidden = true;
  if (reason === 'focus-moved') h.f.items[2].focus();
  if (reason === 'foreign-owner') h.peer.panel.append(h.f.field);
  if (reason === 'closed-reopened') { h.f.trigger.click(); h.f.open(); }
  h.key('keyup', 'Enter', {}, reason === 'wrong-target' ? h.f.items[2] : h.f.field); assert.deepEqual(h.actions, []);
});
test('other root and nested family results cannot consume the armed query', () => {
  const h = harness(); const nested = fixture(h.f.panel, 'nested'); h.bind(nested); nested.open(); h.f.field.focus();
  h.f.items.forEach(item => item.disabled = true); h.key('keydown'); h.key('keyup'); assert.deepEqual(h.actions, []);
  h.f.items[2].disabled = false; h.key('keydown'); h.peer.open(); h.key('keyup', 'Enter', {}, h.peer.field); assert.deepEqual(h.actions, []);
  h.peer.field.focus(); h.key('keydown', 'Enter', {}, h.peer.field); h.key('keyup', 'Enter', {}, h.peer.field); assert.equal(h.actions[0].id, 'peer');
});
for (const style of ['innerHTML', 'outerHTML']) test(style + ' cleanup removes old confirmation; fresh owner requires a full gesture', () => {
  const h = harness(); h.key('keydown'); const old = h.f; let fresh;
  const oldKeyup = old.root.handlers.get('keyup')[0].fn;
  h.swap(style === 'innerHTML' ? old.root.parentElement : old.root, style, () => { const parent = old.root.parentElement; old.root.remove(); fresh = fixture(parent, 'primary'); });
  h.bind(fresh); fresh.open(); h.key('keyup', 'Enter', {}, fresh.field); oldKeyup(new Event('keyup', {key: 'Enter', target: old.field})); assert.deepEqual(h.actions, []);
  h.key('keydown', 'Enter', {}, fresh.field); h.key('keyup', 'Enter', {}, fresh.field); assert.deepEqual(h.actions, [{id: 'primary', value: 'alpha-one', closed: true}]); assert.deepEqual(h.errors, []);
});
test('cleanup on a retained root also discards its old gesture before remount', () => {
  const h = harness(); h.key('keydown'); h.swap(h.f.root, 'innerHTML', () => {}); h.f.open(); h.key('keyup'); assert.deepEqual(h.actions, []); h.key('keydown'); h.key('keyup'); assert.equal(h.actions.length, 1);
});
test('pointer selection and normal reopen retain one settled callback', () => {
  const h = harness(); h.f.items[3].click(); assert.deepEqual(h.actions, [{id: 'primary', value: 'alpha-two', closed: true}]);
  h.f.open(); h.key('keydown'); h.key('keyup'); assert.equal(h.actions.length, 2); assert.equal(h.actions[1].value, 'alpha-one');
});
console.log(`SearchableMenu whole-runtime event model: ${checks} checks passed; browser behavior reserved for CI.`);
