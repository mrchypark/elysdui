import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// --- Minimal DOM & browser harness ---
class FakeEl {
  constructor(tag, attrs = {}) {
    this.tagName = tag.toUpperCase();
    this.attrs = new Map(Object.entries(attrs));
    this.id = this.attrs.get('id') || '';
    this.value = this.attrs.get('value') || '';
    this.children = [];
    this.parentElement = null;
    this.disabled = false;
    this.hidden = false;
    this.textContent = '';
    this.dataset = {};
    this.files = [];
    this.form = null;
    this.scrolled = 0;
    this.popoverHidden = 0;
    this.listeners = new Map();
    for (const [k, v] of this.attrs) {
      if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    }
  }
  append(...nodes) {
    for (const n of nodes) { n.parentElement = this; if (this.tagName === 'FORM') n.form = this; this.children.push(n); }
  }
  hasAttribute(n) { return this.attrs.has(n); }
  getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }
  setAttribute(n, v) { this.attrs.set(n, String(v)); }
  removeAttribute(n) { this.attrs.delete(n); }
  scrollIntoView() { this.scrolled += 1; }
  hidePopover() { this.popoverHidden += 1; }
  addEventListener(t, fn) { if (!this.listeners.has(t)) this.listeners.set(t, []); this.listeners.get(t).push(fn); }
  removeEventListener(t, fn) { const a = this.listeners.get(t); if (a) this.listeners.set(t, a.filter(f => f !== fn)); }
  dispatchEvent(ev) { for (const fn of this.listeners.get(ev.type) || []) fn(ev); return !ev.defaultPrevented; }
  matches(sel) {
    return sel.split(',').map(s => s.trim()).some(s => {
      if (s === 'input[type="file"]') return this.tagName === 'INPUT' && this.getAttribute('type') === 'file';
      if (s === 'input[type="file"][data-ely-auto-submit]') return this.tagName === 'INPUT' && this.getAttribute('type') === 'file' && this.hasAttribute('data-ely-auto-submit');
      if (s.startsWith('#')) return this.id === s.slice(1);
      const m = s.match(/^\[([^\]=]+)(?:="([^"]*)")?\]$/);
      if (m) return m[2] === undefined ? this.hasAttribute(m[1]) : this.getAttribute(m[1]) === m[2];
      return this.tagName === s.toUpperCase();
    });
  }
  closest(sel) {
    for (let c = this; c; c = c.parentElement) if (c.matches(sel)) return c;
    return null;
  }
  querySelectorAll(sel) {
    const out = [];
    const walk = n => { for (const ch of n.children) { if (ch.matches(sel)) out.push(ch); walk(ch); } };
    walk(this);
    return out;
  }
  querySelector(sel) { return this.querySelectorAll(sel)[0] || null; }
}

const docListeners = new Map();
const doc = {
  hidden: true,
  title: 'Chat Room',
  hasFocus: () => false,
  documentElement: new FakeEl('html'),
  addEventListener(t, fn) { if (!docListeners.has(t)) docListeners.set(t, []); docListeners.get(t).push(fn); },
  emit(t, ev) { for (const fn of docListeners.get(t) || []) fn(ev); },
  getElementById: id => elementsById.get(id) || null,
  querySelectorAll: sel => sel === '[data-ely-notify-toggle]' ? [notifyBtn] : [],
};
const elementsById = new Map();
const notifyBtn = new FakeEl('button', { 'data-ely-notify-toggle': '', 'data-ely-notify-on-label': 'Alerts On', 'data-ely-notify-off-label': 'Alerts Off' });
const notifications = [];
let permissionState = 'default';
globalThis.Notification = class {
  static get permission() { return permissionState; }
  static async requestPermission() { permissionState = 'granted'; return 'granted'; }
  constructor(title, opts) { notifications.push({ title, body: opts?.body }); }
};
globalThis.Element = FakeEl;
globalThis.document = doc;
globalThis.location = { href: 'https://example.com/', origin: 'https://example.com' };
globalThis.FormData = class { constructor(form) { this.form = form; } };
let fetched = [];
globalThis.fetch = async (url, init) => { fetched.push({ url, init }); return { ok: true, status: 200 }; };
let observerCb;
globalThis.MutationObserver = class { constructor(cb) { observerCb = cb; } observe() {} disconnect() {} };

await import('../../assets/ely-api.js');

// 1. Issue #77: data-ely-swap-errors="true"
const optInPanel = new FakeEl('div', { id: 'settings-panel', 'data-ely-swap-errors': 'true' });
const swapDetail = { xhr: { status: 422 }, target: optInPanel, shouldSwap: false, isError: true };
doc.emit('htmx:beforeSwap', { detail: swapDetail });
assert.equal(swapDetail.shouldSwap, true);
assert.equal(swapDetail.isError, false);

const normalPanel = new FakeEl('div', { id: 'other-panel' });
const noOptDetail = { xhr: { status: 422 }, target: normalPanel, shouldSwap: false, isError: true };
doc.emit('htmx:beforeSwap', { detail: noOptDetail });
assert.equal(noOptDetail.shouldSwap, false);

// 2. Issue #75: data-ely-max-bytes, auto-submit, async-form, upload-progress
const progressBar = new FakeEl('progress', { id: 'upload-prog' });
progressBar.hidden = true;
elementsById.set('upload-prog', progressBar);

const form = new FakeEl('form', {
  action: '/upload',
  'data-ely-async-form': '',
  'data-ely-upload-progress': '#upload-prog',
  'data-ely-max-bytes': '100',
});
const fileInput = new FakeEl('input', { type: 'file', 'data-ely-auto-submit': '' });
const textInput = new FakeEl('input', { type: 'text', 'data-ely-clear-on-submit': '' });
textInput.value = 'hello';
const statusOut = new FakeEl('output', { 'data-ely-status': '' });
const quote = new FakeEl('div', { 'data-ely-reply-quote': '' });
const replyTo = new FakeEl('input', { type: 'hidden', 'data-ely-reply-to': '' });
replyTo.value = 'm1';
const popover = new FakeEl('div', { popover: 'auto' });
form.append(fileInput, textInput, statusOut, quote, replyTo);
popover.append(form);

// Max-bytes guard blocks oversized file
fileInput.files = [{ size: 500 }];
doc.emit('change', { target: fileInput });
assert.match(statusOut.textContent, /maximum/i);
assert.equal(fetched.length, 0);

// htmx:xhr:progress updates <progress> and htmx:afterRequest hides it
doc.emit('htmx:xhr:progress', { detail: { elt: form, lengthComputable: true, loaded: 50, total: 100 } });
assert.equal(progressBar.hidden, false);
assert.equal(progressBar.value, 50);
assert.equal(progressBar.max, 100);
doc.emit('htmx:afterRequest', { detail: { elt: form } });
assert.equal(progressBar.hidden, true);

// Async form 2xx clears inputs, hides quote, closes popover
fileInput.files = [{ size: 50 }];
let prevented = false;
doc.emit('submit', { target: form, preventDefault() { prevented = true; } });
await new Promise(r => setTimeout(r, 0));
assert.equal(prevented, true);
assert.equal(fetched.length, 1);
assert.equal(textInput.value, '');
assert.equal(replyTo.value, '');
assert.equal(quote.hidden, true);
assert.equal(popover.popoverHidden, 1);

// 3. Issue #76: LiveNotifier toggle + unread title + Notification
assert.equal(notifyBtn.textContent, 'Alerts Off');
doc.emit('click', { target: notifyBtn });
await new Promise(r => setTimeout(r, 0));
assert.equal(permissionState, 'granted');
assert.equal(notifyBtn.textContent, 'Alerts On');

const feed = new FakeEl('div', { 'data-ely-notify-feed': '', 'data-ely-notify-title': 'Inbox' });
const msgNode = new FakeEl('div', { 'data-ely-notify': 'true' });
msgNode.textContent = 'New message from Alice';
feed.append(msgNode);
observerCb([{ target: feed, addedNodes: [msgNode] }]);
assert.equal(doc.title, '(1) Chat Room');
assert.deepEqual(notifications, [{ title: 'Inbox', body: 'New message from Alice' }]);

doc.hidden = false;
doc.emit('focus', {});
assert.equal(doc.title, 'Chat Room');

// 4. Issue #73: ely-map.html has ShowLocate / data-map-locate
const mapHtml = readFileSync(new URL('../../templates/ely-map.html', import.meta.url), 'utf8');
assert.ok(mapHtml.includes('{{if .ShowLocate}}') && mapHtml.includes('data-map-locate'));

// 5. Issue #74: ely-api-communication.html has UnpinURL / data-ely-unpin-url
const commHtml = readFileSync(new URL('../../templates/ely-api-communication.html', import.meta.url), 'utf8');
assert.ok(commHtml.includes('data-ely-unpin-url="{{.UnpinURL}}"'));

console.log('Generalized hooks (#73, #74, #75, #76, #77) tests passed.');
