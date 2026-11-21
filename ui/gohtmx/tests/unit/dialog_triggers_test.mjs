import assert from 'node:assert/strict';

class FakeElement {
  constructor(tagName, id = '', attrs = {}) {
    this.tagName = tagName.toUpperCase();
    this.id = id;
    this.attrs = new Map(Object.entries(attrs));
    this.children = [];
    this.parentElement = null;
    this.isConnected = true;
    this.disabled = false;
    this.open = false;
    this.showModalCount = 0;
    this.closeCount = 0;
    this.focusCount = 0;
    this.animations = [];
    this.dataset = {};
    for (const [k, v] of this.attrs) {
      if (k.startsWith('data-')) {
        const camel = k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
        this.dataset[camel] = v;
      }
    }
  }

  append(...nodes) {
    for (const node of nodes) {
      node.parentElement = this;
      this.children.push(node);
    }
  }

  hasAttribute(name) { return this.attrs.has(name); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  removeAttribute(name) { this.attrs.delete(name); }
  focus() { this.focusCount += 1; }
  getAnimations() { return this.animations; }

  showModal() {
    this.open = true;
    this.showModalCount += 1;
  }

  close() {
    if (!this.open) return;
    this.open = false;
    this.closeCount += 1;
    docListeners.emit('close', { target: this });
  }

  closest(selector) {
    const parts = selector.split(',').map(s => s.trim());
    for (let cur = this; cur; cur = cur.parentElement) {
      if (parts.some(p => matchesSelector(cur, p))) return cur;
    }
    return null;
  }

  querySelector(selector) {
    const parts = selector.split(',').map(s => s.trim());
    const walk = node => {
      for (const child of node.children) {
        if (parts.some(p => matchesSelector(child, p))) return child;
        const found = walk(child);
        if (found) return found;
      }
      return null;
    };
    return walk(this);
  }

  querySelectorAll(selector) {
    const out = [];
    const parts = selector.split(',').map(s => s.trim());
    const walk = node => {
      for (const child of node.children) {
        if (parts.some(p => matchesSelector(child, p))) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }
}

function matchesSelector(el, sel) {
  if (sel === 'dialog') return el.tagName === 'DIALOG';
  if (sel === '[autofocus]' || sel === '[autofocus]:not(:disabled)') {
    return el.hasAttribute('autofocus') && !el.disabled;
  }
  if (sel === '[data-ely-dialog-open]') return el.hasAttribute('data-ely-dialog-open');
  if (sel === '[data-ely-dialog-close]') return el.hasAttribute('data-ely-dialog-close');
  if (sel === '[data-ely-disabled="true"]') return el.getAttribute('data-ely-disabled') === 'true';
  if (sel === 'fieldset:disabled') return el.tagName === 'FIELDSET' && el.disabled;
  if (sel === 'input:not([type="hidden"]):not(:disabled)') {
    return el.tagName === 'INPUT' && el.getAttribute('type') !== 'hidden' && !el.disabled;
  }
  const tagNotDisabled = sel.match(/^(input|select|textarea|button):not\(:disabled\)$/);
  if (tagNotDisabled) return el.tagName === tagNotDisabled[1].toUpperCase() && !el.disabled;
  return false;
}

const docListeners = {
  map: new Map(),
  add(type, fn) {
    if (!this.map.has(type)) this.map.set(type, []);
    this.map.get(type).push(fn);
  },
  emit(type, event) {
    for (const fn of this.map.get(type) || []) fn(event);
  },
};

const byId = new Map();
let discreteSupported = false;

globalThis.Element = FakeElement;
globalThis.CSS = {
  supports(prop, val) {
    return discreteSupported && ((prop === 'overlay' && val === 'auto') || (prop === 'transition-behavior' && val === 'allow-discrete'));
  },
};
globalThis.MutationObserver = class { observe() {} };
globalThis.document = {
  documentElement: new FakeElement('html'),
  addEventListener(type, fn) { docListeners.add(type, fn); },
  getElementById(id) { return byId.get(id) || null; },
  querySelectorAll() { return []; },
};

await import('../../assets/ely-api.js');

const opener = new FakeElement('button', 'open-btn', { 'data-ely-dialog-open': 'task-dialog' });
const dialog = new FakeElement('dialog', 'task-dialog');
const hiddenInput = new FakeElement('input', 'task-id', { type: 'hidden' });
const closeBtn = new FakeElement('button', 'close-btn', { 'data-ely-dialog-close': '' });
const input = new FakeElement('input', 'task-title', { autofocus: '' });
const externalCloseBtn = new FakeElement('button', 'ext-close-btn', { 'data-ely-dialog-close': 'task-dialog' });
dialog.append(hiddenInput, closeBtn, input);
byId.set('task-dialog', dialog);

// 1. Open dialog, skip hidden input and earlier button, and focus [autofocus]
docListeners.emit('click', { target: opener });
assert.equal(dialog.open, true);
assert.equal(dialog.showModalCount, 1);
assert.equal(hiddenInput.focusCount, 0);
assert.equal(closeBtn.focusCount, 0);
assert.equal(input.focusCount, 1);

// 1b. Anchor opener prevents default navigation
const anchorOpener = new FakeElement('a', 'open-link', { 'data-ely-dialog-open': 'task-dialog', href: '#task-dialog' });
let anchorPrevented = false;
docListeners.emit('click', { target: anchorOpener, preventDefault() { anchorPrevented = true; } });
assert.equal(anchorPrevented, true);
docListeners.emit('click', { target: opener });

// 2. Fallback exit animation wait via getAnimations + data-ely-closing
let resolveAnim;
dialog.animations = [{ finished: new Promise(r => { resolveAnim = r; }) }];
docListeners.emit('click', { target: closeBtn });
assert.equal(dialog.hasAttribute('data-ely-closing'), true);
assert.equal(dialog.open, true);
resolveAnim();
await new Promise(r => setTimeout(r, 0));
assert.equal(dialog.open, false);
assert.equal(dialog.hasAttribute('data-ely-closing'), false);
assert.equal(opener.focusCount, 1);

// 3. Re-opening mid-exit cancels pending close and clears data-ely-closing
docListeners.emit('click', { target: opener });
let resolveStaleAnim;
dialog.animations = [{ finished: new Promise(r => { resolveStaleAnim = r; }) }];
docListeners.emit('click', { target: externalCloseBtn });
assert.equal(dialog.hasAttribute('data-ely-closing'), true);
docListeners.emit('click', { target: opener });
assert.equal(dialog.hasAttribute('data-ely-closing'), false);
resolveStaleAnim();
await new Promise(r => setTimeout(r, 0));
assert.equal(dialog.open, true);

// 4. Cancel (Escape) prevents immediate snap-close when fallback is needed
let cancelPrevented = false;
dialog.animations = [];
docListeners.emit('cancel', { target: dialog, preventDefault() { cancelPrevented = true; } });
assert.equal(cancelPrevented, true);
assert.equal(dialog.open, false);

// 5. Discrete top-layer native path closes directly without data-ely-closing
discreteSupported = true;
docListeners.emit('click', { target: opener });
assert.equal(dialog.open, true);
docListeners.emit('click', { target: closeBtn });
assert.equal(dialog.hasAttribute('data-ely-closing'), false);
assert.equal(dialog.open, false);

console.log('Declarative modal <dialog> open/close triggers and fallback animation tests passed.');
