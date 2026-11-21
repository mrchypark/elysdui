import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../../assets/ely-api-communication.js', import.meta.url), 'utf8');

class FakeClassList {
  constructor(el) { this.el = el; this.set = new Set(); }
  add(...names) { names.forEach(n => this.set.add(n)); }
  remove(...names) { names.forEach(n => this.set.delete(n)); }
  toggle(name, force) {
    if (force === undefined) force = !this.set.has(name);
    if (force) this.set.add(name); else this.set.delete(name);
  }
  contains(name) { return this.set.has(name); }
}

class FakeNode {
  constructor(tag, attrs = {}, text = '') {
    this.tagName = tag.toUpperCase();
    this.attrs = new Map(Object.entries(attrs));
    this.id = this.attrs.get('id') || '';
    this.children = [];
    this.parentElement = null;
    this.classList = new FakeClassList(this);
    for (const c of (this.attrs.get('class') || '').split(/\s+/).filter(Boolean)) this.classList.add(c);
    this.dataset = {};
    for (const [k, v] of this.attrs) {
      if (k.startsWith('data-')) this.dataset[k.slice(5).replace(/-([a-z])/g, (_, c) => c.toUpperCase())] = v;
    }
    this.textContent = text;
    this.hidden = false;
    this.isConnected = true;
    this.style = { setProperty() {}, removeProperty() {} };
    this.listeners = new Map();
    if (this.attrs.has('value')) this.value = this.attrs.get('value');
  }

  set innerHTML(html) {
    this.children = parseSimpleFragments(html, this);
  }

  append(...nodes) {
    for (const n of nodes) {
      if (typeof n === 'string') continue;
      n.parentElement = this;
      this.children.push(n);
    }
  }

  replaceChildren(...nodes) {
    this.children = [];
    for (const n of nodes) {
      if (n && n.children && n.tagName === '#FRAGMENT') this.append(...n.children);
      else this.append(n);
    }
  }

  replaceWith(node) {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx >= 0) {
      node.parentElement = this.parentElement;
      this.parentElement.children.splice(idx, 1, node);
    }
  }

  remove() {
    if (!this.parentElement) return;
    const idx = this.parentElement.children.indexOf(this);
    if (idx >= 0) this.parentElement.children.splice(idx, 1);
    this.parentElement = null;
  }

  hasAttribute(name) { return this.attrs.has(name); }
  getAttribute(name) { return this.attrs.has(name) ? this.attrs.get(name) : null; }
  setAttribute(name, val) { this.attrs.set(name, String(val)); }
  removeAttribute(name) { this.attrs.delete(name); }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const arr = this.listeners.get(type);
    if (arr) this.listeners.set(type, arr.filter(f => f !== fn));
  }
  dispatchEvent(ev) {
    for (const fn of this.listeners.get(ev.type) || []) fn(ev);
    return true;
  }

  matches(selector) {
    return selector.split(',').map(s => s.trim()).some(sel => {
      if (sel.startsWith('.')) return this.classList.contains(sel.slice(1));
      if (sel.startsWith('#')) return this.id === sel.slice(1);
      const attrMatch = sel.match(/^\[([^\]=]+)(?:="([^"]*)")?\]$/);
      if (attrMatch) return attrMatch[2] === undefined ? this.hasAttribute(attrMatch[1]) : this.getAttribute(attrMatch[1]) === attrMatch[2];
      return this.tagName === sel.toUpperCase();
    });
  }

  closest(selector) {
    for (let cur = this; cur; cur = cur.parentElement) {
      if (cur.matches(selector)) return cur;
    }
    return null;
  }

  querySelectorAll(selector) {
    const out = [];
    const walk = node => {
      for (const child of node.children) {
        if (child.matches(selector)) out.push(child);
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  getBoundingClientRect() { return { top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }; }
}

function parseSimpleFragments(html) {
  const nodes = [];
  const re = /<div\b([^>]*)>([\s\S]*?)<\/div>/g;
  let match;
  while ((match = re.exec(html))) {
    const attrs = {};
    for (const a of match[1].matchAll(/([a-zA-Z0-9_-]+)="([^"]*)"/g)) attrs[a[1]] = a[2];
    const el = new FakeNode('div', attrs);
    const btnMatch = match[2].match(/<button\b([^>]*)>([^<]*)<\/button>/);
    if (btnMatch) {
      const bAttrs = {};
      for (const a of btnMatch[1].matchAll(/([a-zA-Z0-9_-]+)="([^"]*)"/g)) bAttrs[a[1]] = a[2];
      el.append(new FakeNode('button', bAttrs, btnMatch[2]));
    } else {
      el.textContent = match[2];
    }
    nodes.push(el);
  }
  return nodes;
}

const createdSources = [];
class FakeEventSource {
  constructor(url) {
    this.url = url;
    this.closed = false;
    this.listeners = new Map();
    createdSources.push(this);
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push(fn);
  }
  removeEventListener(type, fn) {
    const arr = this.listeners.get(type);
    if (arr) this.listeners.set(type, arr.filter(f => f !== fn));
  }
  emit(type, data) {
    for (const fn of this.listeners.get(type) || []) fn({ type, data });
  }
  close() { this.closed = true; }
}

const root = new FakeNode('section', {
  id: 'room-1',
  'data-ely-family': 'communication',
  'data-ely-viewer-id': 'user-1',
});
const transcript = new FakeNode('div', {
  class: 'ely-messaging-transcript',
  'data-ely-stream-url': '/chat/stream',
  'data-ely-typing-target': '#typing-box',
  'data-ely-typing-timeout': '200',
});
const typingBox = new FakeNode('output', { id: 'typing-box' });
typingBox.hidden = true;
const mentionList = new FakeNode('div', { 'data-ely-mention-list': '' });
mentionList.append(new FakeNode('button', { 'data-ely-mention-option': 'user-1', value: 'user-1' }, 'Me'));
root.append(transcript, typingBox, mentionList);

const doc = {
  defaultView: null,
  createElement(tag) {
    const el = new FakeNode(tag);
    if (tag === 'template') {
      Object.defineProperty(el, 'content', {
        get() {
          const frag = new FakeNode('#FRAGMENT');
          frag.children = el.children;
          return frag;
        },
      });
    }
    return el;
  },
  getElementById(id) {
    if (id === 'typing-box') return typingBox;
    return root.querySelector(`#${id}`);
  },
  querySelectorAll() { return []; },
  addEventListener() {},
  removeEventListener() {},
};
const win = {
  document: doc,
  location: { href: 'https://example.com/chat', origin: 'https://example.com' },
  innerHeight: 800,
  Element: FakeNode,
  HTMLTextAreaElement: class {},
  HTMLInputElement: class {},
  EventSource: FakeEventSource,
  MutationObserver: class { observe() {} disconnect() {} },
  CSS: { escape: s => s },
  CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init?.detail; } },
  addEventListener() {},
};
doc.defaultView = win;
root.ownerDocument = doc;
transcript.ownerDocument = doc;
typingBox.ownerDocument = doc;
mentionList.ownerDocument = doc;

let initializer;
const mockRegister = (_family, fn) => { initializer = fn; };
const fnBody = source
  .replace(/^import\s+[^\n]+\n/gm, '')
  .replace(/register\('communication',/, 'mockRegister(\'communication\',');
globalThis.document = doc;
globalThis.MutationObserver = class { observe() {} disconnect() {} };
new Function(
  'mockRegister',
  'emit',
  'mountProjectCharts',
  'mountMathML',
  'document',
  'MutationObserver',
  fnBody,
)(mockRegister, () => true, () => () => {}, () => () => {}, doc, globalThis.MutationObserver);

let mentionRefreshes = [];
root.addEventListener('ely:mention-refresh', ev => mentionRefreshes.push(ev.detail));

const cleanup = initializer(root);
assert.equal(createdSources.length, 1);
assert.equal(createdSources[0].url, 'https://example.com/chat/stream');
const es = createdSources[0];

// 1. Self message gets .is-self and keeps delete button
es.emit('chat_event', '<div id="m1" class="ely-messaging-message" data-sender-id="user-1"><button data-ely-delete-open="m1">Delete</button></div>');
assert.equal(transcript.children.length, 1);
assert.equal(transcript.children[0].classList.contains('is-self'), true);
assert.ok(transcript.children[0].querySelector('[data-ely-delete-open]'));

// 2. Duplicate ID is ignored
es.emit('chat_event', '<div id="m1" class="ely-messaging-message" data-sender-id="user-1">dup</div>');
assert.equal(transcript.children.length, 1);

// 3. Other author message strips [data-ely-delete-open] and triggers ely:mention-refresh
es.emit('chat_event', '<div id="m2" class="ely-messaging-message" data-sender-id="user-2"><button data-ely-delete-open="m2">Delete</button></div>');
assert.equal(transcript.children.length, 2);
assert.equal(transcript.children[1].classList.contains('is-self'), false);
assert.equal(transcript.children[1].querySelector('[data-ely-delete-open]'), null);
assert.deepEqual(mentionRefreshes, [{ senderId: 'user-2' }]);

// 4. hx-swap-oob outerHTML:#m2 replaces existing message
es.emit('chat_event', '<div id="m2" class="ely-messaging-message" data-sender-id="user-2" hx-swap-oob="outerHTML:#m2">edited</div>');
assert.equal(transcript.children.length, 2);
assert.equal(transcript.children[1].textContent, 'edited');

// 5. Typing indicator updates and auto-clears
es.emit('typing', 'Bob is typing...');
assert.equal(typingBox.hidden, false);
assert.equal(typingBox.textContent, 'Bob is typing...');
await new Promise(r => setTimeout(r, 250));
assert.equal(typingBox.hidden, true);
assert.equal(typingBox.textContent, '');

// 6. Cleanup closes EventSource
cleanup();
assert.equal(es.closed, true);

console.log('Declarative SSE messaging stream tests passed.');
