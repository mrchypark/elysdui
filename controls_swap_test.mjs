import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the entire production runtime against a small, deterministic DOM.
// The browser companion exercises these same swaps using bundled HTMX itself.
const source = readFileSync(new URL('./assets/ely-controls.js', import.meta.url), 'utf8');
const dataKey = name => name.slice(5).replace(/-([a-z])/g, (_, letter) => letter.toUpperCase());
class DOMEvent {
  constructor(type, options = {}) { Object.assign(this, {type, bubbles: false, detail: undefined}, options); }
  preventDefault() { this.defaultPrevented = true; }
}
class Element {
  constructor(tagName = 'div', attributes = {}) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.dataset = {};
    this.children = [];
    this.listeners = new Map();
    this.value = '';
    this.hidden = this.disabled = this.required = false;
    for (const [name, value] of Object.entries(attributes)) this.setAttribute(name, value);
  }
  get isConnected() { return this.parentNode?.isConnected || false; }
  get firstElementChild() { return this.children[0] || null; }
  get textContent() { return this._text || this.children.map(child => child.textContent).join(''); }
  set textContent(value) { this._text = value; }
  setAttribute(name, value) {
    this.attributes.set(name, String(value));
    if (name.startsWith('data-')) this.dataset[dataKey(name)] = String(value);
    if (['id', 'name', 'type'].includes(name)) this[name] = String(value);
    if (['disabled', 'required', 'hidden'].includes(name)) this[name] = true;
  }
  hasAttribute(name) { return this.attributes.has(name); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  removeAttribute(name) {
    this.attributes.delete(name);
    if (name.startsWith('data-')) delete this.dataset[dataKey(name)];
    if (['name', 'id', 'type'].includes(name)) delete this[name];
    if (['disabled', 'required', 'hidden'].includes(name)) this[name] = false;
  }
  matches(selector) {
    return selector.split(',').some(part => {
      part = part.trim();
      if (part === ':disabled') return this.disabled;
      if (part.startsWith('.')) return (this.getAttribute('class') || '').split(' ').includes(part.slice(1));
      const tag = part.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.tagName !== tag.toUpperCase()) return false;
      const attributes = [...part.matchAll(/\[([\w-]+)(?:=["']?([^\]"']+)["']?)?\]/g)];
      return !!(tag || attributes.length) && attributes.every(([, name, value]) =>
        this.hasAttribute(name) && (value === undefined || this.getAttribute(name) === value));
    });
  }
  closest(selector) { return this.matches(selector) ? this : this.parentNode?.closest?.(selector) || null; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]);
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentNode = this; this.children.push(node); } }
  prepend(...nodes) { for (const node of nodes.reverse()) { node.remove(); node.parentNode = this; this.children.unshift(node); } }
  replaceChildren(...nodes) { for (const child of this.children) child.parentNode = null; this.children = []; this.append(...nodes); }
  remove() { if (this.parentNode) this.parentNode.children.splice(this.parentNode.children.indexOf(this), 1); this.parentNode = null; }
  insertAdjacent(position, ...nodes) {
    const parent = this.parentNode;
    const index = parent.children.indexOf(this) + (position === 'after' ? 1 : 0);
    for (const node of nodes) { node.remove(); node.parentNode = parent; }
    parent.children.splice(index, 0, ...nodes);
  }
  cloneNode(deep) {
    const clone = new Element(this.tagName, Object.fromEntries(this.attributes));
    clone.value = this.value; clone.textContent = this._text;
    if (deep) clone.append(...this.children.map(child => child.cloneNode(true)));
    return clone;
  }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(callback);
  }
  dispatchEvent(event) {
    event.target ||= this;
    for (const callback of this.listeners.get(event.type) || []) callback(event);
    if (event.bubbles) this.parentNode?.dispatchEvent(event);
    return !event.defaultPrevented;
  }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  setCustomValidity(message) { this.validationMessage = message; }
  focus() { document.activeElement = this; }
  scrollIntoView() {}
  getBoundingClientRect() { return {width: 200, height: 100, left: 0, top: 0}; }
  getContext() { return {setTransform() {}, clearRect() {}, drawImage() {}, beginPath() {}, moveTo() {}, lineTo() {}, stroke() {}}; }
  setPointerCapture() {}
  toDataURL() { return 'data:image/png;base64,drawn'; }
}
class Document extends Element {
  get isConnected() { return true; }
  getElementById(id) { return this.querySelectorAll('[id]').find(node => node.id === id) || null; }
  createElement(tag) { return new Element(tag); }
}
class ResizeObserver {
  static instances = [];
  constructor(callback) { this.callback = callback; ResizeObserver.instances.push(this); }
  observe(canvas) { this.canvas = canvas; }
  disconnect() {}
}
const document = new Document();
const body = new Element('body');
document.append(body);
const window = {devicePixelRatio: 1};
const context = {window, document, Element, ResizeObserver, Event: DOMEvent, getComputedStyle: () => ({color: 'black'})};
runInNewContext(source, context);
const element = (tag, attributes = {}, children = []) => {
  const node = new Element(tag, attributes); node.append(...children); return node;
};
const marked = (marker, tag = 'input', attributes = {}) => element(tag, {[marker]: '', ...attributes});
const valueInput = (value, attributes = {}) => {
  const input = element('input', {type: 'hidden', ...attributes}); input.value = value; return input;
};
function controls(prefix, disabled = false) {
  const component = (type, children) => element('div', {id: `${prefix}-${type}`, 'data-ui-component': type}, children);
  const pinValue = valueInput('1234', {name: `${prefix}-pin`});
  const slots = Array.from({length: 4}, () => marked('data-ui-pin-slot', 'input', {required: ''}));
  const pin = component('pin-input', [pinValue, ...slots]);
  const tagValue = valueInput('alpha,beta');
  const tagHost = marked('data-ui-tags', 'span');
  const tagEntry = marked('data-ui-tag-entry');
  const tagTemplate = marked('data-ui-tag-template', 'template');
  tagTemplate.content = element('fragment', {}, [element('span', {}, [marked('data-ui-tag-text', 'span'), element('button', {'data-ui-action': 'remove-tag'})])]);
  const tags = component('tag-input', [tagValue, tagHost, tagEntry, tagTemplate]);
  tags.setAttribute('data-ui-required', '');
  const comboValue = valueInput('b', {disabled: '', name: `${prefix}-choice`});
  if (disabled) comboValue.setAttribute('data-ui-permanently-disabled', '');
  const comboInput = marked('data-ui-combobox-input', 'input', {required: '', ...(disabled ? {disabled: ''} : {})});
  const options = ['a', 'b'].map((value, index) => {
    const option = element('button', {'data-ui-option': '', 'data-value': value, 'aria-selected': String(index === 1), id: `${prefix}-option-${value}`});
    option.textContent = index ? 'Beta' : 'Alpha'; return option;
  });
  const comboList = marked('data-ui-combobox-list', 'div'); comboList.hidden = true; comboList.append(...options);
  const combo = component('combobox', [comboValue, comboInput, comboList]);
  const tabButtons = [false, true].map(selected => marked('data-ui-tab', 'button', {'aria-selected': String(selected)}));
  const panels = [marked('data-ui-tab-panel', 'section'), marked('data-ui-tab-panel', 'section')];
  const tabs = component('tabs', [...tabButtons, ...panels]);
  const canvas = marked('data-ui-signature', 'canvas');
  const fallback = element('textarea', {name: `${prefix}-signature`, required: '', ...(disabled ? {disabled: ''} : {})}); fallback.value = 'Ada';
  const signatureValue = valueInput('Ada', {'data-ui-signature-value': '', name: `${prefix}-signature`, disabled: ''});
  const clear = marked('data-ui-signature-clear', 'button', disabled ? {disabled: ''} : {});
  const signature = component('signature-pad', [canvas, fallback, signatureValue, clear]);
  const dialog = element('dialog', {'data-ui-component': 'dialog', id: `${prefix}-dialog`});
  return {nodes: [pin, tags, combo, tabs, signature, dialog], slots, pinValue, tagHost, tagValue, tagEntry, comboValue, comboInput, comboList, options, tabButtons, panels, canvas, fallback, signatureValue, clear, dialog, disabled};
}
function assertInitialized(fixture, label) {
  assert.equal(fixture.slots.map(slot => slot.value).join(''), '1234', `${label}: initial PIN digits`);
  assert.equal(fixture.slots[0].validationMessage, '', `${label}: PIN validity`);
  assert.deepEqual(fixture.tagHost.children.map(tag => tag.querySelector('[data-ui-tag-text]').textContent), ['alpha', 'beta'], `${label}: initial tags`);
  assert.equal(fixture.tagEntry.required, false, `${label}: populated tags satisfy required`);
  assert.equal(fixture.comboValue.disabled, fixture.disabled, `${label}: combobox submission and disabled state`);
  assert.equal(fixture.comboInput.value, 'Beta', `${label}: selected combobox label`);
  assert.equal(fixture.comboInput.getAttribute('aria-activedescendant'), null, `${label}: collapsed popup has no active descendant`);
  assert.deepEqual(fixture.panels.map(panel => panel.hidden), [true, false], `${label}: selected tab`);
  assert.deepEqual(fixture.tabButtons.map(tab => tab.tabIndex), [-1, 0], `${label}: tab stops`);
  assert.equal(fixture.fallback.hasAttribute('name'), false, `${label}: signature fallback stops duplicate submission`);
  assert.equal(fixture.signatureValue.disabled, fixture.disabled, `${label}: signature submitted value disabled state`);
  assert.equal(fixture.canvas.listeners.get('pointerdown').length, 1, `${label}: one canvas listener`);
  assert.equal(fixture.dialog.listeners.get('close').length, 1, `${label}: one dialog listener`);
}
// Match HTMX 4: payload is {ctx}; dispatch from the source when connected,
// otherwise from document. ctx.target is not updated after outerHTML.
function afterSwap(sourceElement, target, swap) {
  (sourceElement.isConnected ? sourceElement : document).dispatchEvent(new DOMEvent('htmx:after:swap', {
    bubbles: true, detail: {ctx: {sourceElement, target, swap}},
  }));
}
const form = element('form');
const host = element('main');
body.append(form, host);
for (const style of ['innerHTML', 'outerHTML', 'beforeend', 'afterbegin', 'beforebegin', 'afterend']) {
  const target = element('section'); host.replaceChildren(target);
  const fixture = controls(style);
  const wrapper = element('article', {}, [fixture.nodes[0]]);
  const inserted = [wrapper, ...fixture.nodes.slice(1)]; // Nested and top-level component roots.
  if (style === 'innerHTML') target.replaceChildren(...inserted);
  if (style === 'outerHTML') { target.insertAdjacent('before', ...inserted); target.remove(); }
  if (style === 'beforeend') target.append(...inserted);
  if (style === 'afterbegin') target.prepend(...inserted);
  if (style === 'beforebegin') target.insertAdjacent('before', ...inserted);
  if (style === 'afterend') target.insertAdjacent('after', ...inserted);
  assert.equal(fixture.slots[0].value, '', 'Controls are not initialized before the swap event');
  const observersBefore = ResizeObserver.instances.length;
  afterSwap(form, target, style);
  assertInitialized(fixture, style);
  assert.equal(ResizeObserver.instances.length, observersBefore + 1, `${style}: one observer`);
  // Neither repeated notifications nor another swap may reset client edits,
  // regenerate tags, or install duplicate direct/delegated listeners.
  fixture.slots[0].value = '9';
  fixture.comboInput.value = 'Edited';
  const renderedTag = fixture.tagHost.children[0];
  afterSwap(form, target, style); afterSwap(form, target, style);
  assert.equal(fixture.slots[0].value, '9', `${style}: existing PIN edit survives`);
  assert.equal(fixture.comboInput.value, 'Edited', `${style}: existing combo edit survives`);
  assert.equal(fixture.tagHost.children[0], renderedTag, `${style}: tags not recreated`);
  assert.equal(ResizeObserver.instances.length, observersBefore + 1, `${style}: no duplicate observer`);
  assert.equal(fixture.canvas.listeners.get('pointerdown').length, 1);
  assert.equal(fixture.dialog.listeners.get('close').length, 1);
  let changes = 0; fixture.signatureValue.addEventListener('change', () => changes++);
  fixture.fallback.value = 'Grace';
  fixture.fallback.dispatchEvent(new DOMEvent('input', {bubbles: true}));
  assert.equal(fixture.signatureValue.value, 'Grace');
  assert.equal(changes, 1, `${style}: exactly one signature change notification`);
  // Delegated behavior works on newly inserted controls.
  fixture.options[0].dispatchEvent(new DOMEvent('click', {bubbles: true}));
  assert.equal(fixture.comboValue.value, 'a', `${style}: combobox selection`);
}
// When the request source is replaced, HTMX dispatches on the live main
// replacement while ctx.target still refers to the detached original target.
const replacedForm = element('form'); host.replaceChildren(replacedForm);
const replacement = controls('source-replacement');
replacedForm.insertAdjacent('before', ...replacement.nodes); replacedForm.remove();
afterSwap(replacement.nodes[0], replacedForm, 'outerHTML');
assertInitialized(replacement, 'source replacement');

// If no connected source/replacement remains (for example an OOB-only swap),
// HTMX dispatches on document. Detached context nodes must not become the scope.
const detachedSource = element('form');
const detachedTarget = element('section');
const documentFallback = controls('document-fallback');
host.replaceChildren(...documentFallback.nodes);
afterSwap(detachedSource, detachedTarget, 'none');
assertInitialized(documentFallback, 'document fallback');

// OOB content can be outside both source and main target. Disabled controls
// must still initialize without becoming successful form controls.
const mainTarget = element('section'); host.replaceChildren(mainTarget);
const oob = controls('oob-disabled', true); body.append(...oob.nodes);
afterSwap(form, mainTarget, 'innerHTML');
assertInitialized(oob, 'disabled OOB content');
oob.comboInput.dispatchEvent(new DOMEvent('click', {bubbles: true}));
assert.equal(oob.comboList.hidden, true, 'Disabled combobox cannot open');
oob.options[0].dispatchEvent(new DOMEvent('click', {bubbles: true}));
assert.equal(oob.comboValue.value, 'b', 'Disabled combobox cannot change');
oob.canvas.dispatchEvent(new DOMEvent('pointerdown', {button: 0, pointerId: 1, clientX: 10, clientY: 10}));
oob.canvas.dispatchEvent(new DOMEvent('pointerup'));
assert.equal(oob.signatureValue.value, 'Ada', 'Disabled signature cannot draw');

// Loading the script again must not add document handlers or observers.
const listenerCounts = [...document.listeners].map(([type, listeners]) => [type, listeners.length]);
const observerCount = ResizeObserver.instances.length;
runInNewContext(source, context);
assert.deepEqual([...document.listeners].map(([type, listeners]) => [type, listeners.length]), listenerCounts);
assert.equal(ResizeObserver.instances.length, observerCount);
console.log('Shared controls: HTMX 4 sibling, outerHTML, prepend/append, adjacent, source-replacement and OOB initialization; disabled state and repeated-swap idempotence passed');

// Composite commits notify the named successful control, not its unnamed editor.
// Exercise the real common host adapter too: one commit must reach onChange once.
const apiSource = readFileSync(new URL('./assets/ely-api.js', import.meta.url), 'utf8');
runInNewContext(apiSource.replaceAll('export ', '') + '\nregister("audit", () => {}); window.auditMount = mount;', {
  ...context, CustomEvent: DOMEvent, MutationObserver: class { observe() {} },
});
const changes = [], inputEvents = [];
const fixture = controls('commit-events');
fixture.tagValue.name = 'tags';
const family = element('section', {'data-ely-family': 'audit', 'data-ely-component': 'forms/Test'}, fixture.nodes);
host.replaceChildren(family);
window.auditMount(family, {onChange: detail => changes.push({name: detail.name, value: detail.value})});
family.addEventListener('input', event => { if (event.target.type === 'hidden') inputEvents.push(event.target.name); });
afterSwap(form, host, 'innerHTML');
assert.deepEqual(changes, [], 'initialization does not notify host changes');
const key = value => { fixture.tagEntry.value = value; const event = new DOMEvent('keydown', {bubbles: true, key: 'Enter'}); fixture.tagEntry.dispatchEvent(event); assert.equal(event.defaultPrevented, true, 'committing a tag does not submit the form'); };
key('gamma');
assert.deepEqual(changes, [{name: 'tags', value: 'alpha,beta,gamma'}]);
key('gamma'); key('  ');
assert.equal(changes.length, 1, 'duplicate and empty tags are no-ops');
fixture.tagHost.children[0].querySelector('button').dispatchEvent(new DOMEvent('click', {bubbles: true}));
assert.deepEqual(changes[1], {name: 'tags', value: 'beta,gamma'});
fixture.slots[0].value = '9';
fixture.slots[0].dispatchEvent(new DOMEvent('input', {bubbles: true}));
assert.deepEqual(changes[2], {name: 'commit-events-pin', value: '9234'});
let editorChanges = 0;
fixture.slots[0].addEventListener('change', () => editorChanges++);
fixture.slots[0].dispatchEvent(new DOMEvent('change', {bubbles: true}));
fixture.tagEntry.dispatchEvent(new DOMEvent('change', {bubbles: true}));
assert.equal(editorChanges, 1, 'native editor listeners remain available');
assert.equal(changes.length, 3, 'editor blur does not duplicate aggregate host notifications');
fixture.slots[0].dispatchEvent(new DOMEvent('input', {bubbles: true}));
assert.equal(changes.length, 3, 'unchanged PIN input is a no-op');
const paste = value => { const event = new DOMEvent('paste', {bubbles: true, clipboardData: {getData: () => value}}); fixture.slots[0].dispatchEvent(event); return event; };
assert.equal(paste('8765').defaultPrevented, true);
assert.deepEqual(changes[3], {name: 'commit-events-pin', value: '8765'});
paste('8765'); paste('no digits');
assert.equal(changes.length, 4, 'unchanged or non-digit paste is a no-op');
fixture.slots[0].value = '';
fixture.slots[0].dispatchEvent(new DOMEvent('input', {bubbles: true}));
assert.deepEqual(changes[4], {name: 'commit-events-pin', value: '765'});
assert.equal(fixture.slots[0].validationMessage, 'Enter every PIN digit.');
afterSwap(form, host, 'innerHTML'); afterSwap(form, host, 'innerHTML');
assert.equal(changes.length, 5, 'repeat swaps do not replay committed values');
key('delta');
assert.equal(changes.length, 6, 'repeat swaps do not duplicate host callbacks');
assert.deepEqual(inputEvents, ['tags', 'tags', 'commit-events-pin', 'commit-events-pin', 'commit-events-pin', 'tags']);
fixture.tagEntry.disabled = true; fixture.slots[0].disabled = true;
fixture.tagEntry.value = 'blocked'; fixture.tagEntry.dispatchEvent(new DOMEvent('keydown', {bubbles: true, key: 'Enter'})); paste('1111');
assert.equal(changes.length, 6, 'disabled editors do not notify changes');
console.log('Composite tag/PIN named input/change events and host callbacks passed');
