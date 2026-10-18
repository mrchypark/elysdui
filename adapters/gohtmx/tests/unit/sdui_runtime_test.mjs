import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {File} from 'node:buffer';

// Run the actual adapter in an isolated DOM/fetch double. Parsing below covers
// only these controlled fixtures; real HTML parsing and Ely/HTMX integration
// are covered by the browser companion, not claimed by these unit tests.
const source = readFileSync(new URL('../../assets/sdui.js', import.meta.url), 'utf8');
const tick = () => new Promise(resolve => setImmediate(resolve));
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
};
class DOMEvent {
  constructor(type, options = {}) { Object.assign(this, {type, bubbles: true, cancelable: true, defaultPrevented: false}, options); }
  preventDefault() { if (this.cancelable) this.defaultPrevented = true; }
}
class Element {
  constructor(tag, attributes = {}, ownerDocument = null) {
    this.localName = tag.toLowerCase();
    this.tagName = tag.toUpperCase();
    this.nodeType = tag === '#fragment' ? 11 : 1;
    this.ownerDocument = ownerDocument;
    this.attrs = new Map();
    this.childNodes = [];
    this.listeners = new Map();
    this.files = [];
    for (const [name, value] of Object.entries(attributes)) this.setAttribute(name, value);
    if (tag === 'template') this.content = new Element('#fragment', {}, ownerDocument);
  }
  get attributes() { return [...this.attrs].map(([name, value]) => ({name, value})); }
  get children() { return this.childNodes.filter(node => node.nodeType === 1); }
  get isConnected() { return this.parentNode?.isConnected || false; }
  get id() { return this.getAttribute('id') || ''; }
  get name() { return this.getAttribute('name') || ''; }
  get type() { return this.getAttribute('type') || (this.localName === 'button' ? 'submit' : this.localName === 'input' ? 'text' : ''); }
  get form() { return ['input', 'button', 'textarea', 'select'].includes(this.localName) ? this.ownerDocument.getElementById(this.getAttribute('form')) || this.closest('form') : null; }
  get value() { return this._value ?? this.getAttribute('value') ?? (['checkbox', 'radio'].includes(this.type) ? 'on' : ''); }
  set value(value) { this._value = String(value); }
  get checked() { return this._checked ?? this.hasAttribute('checked'); }
  set checked(value) { this._checked = value; }
  get textContent() { return this.childNodes.map(node => node.textContent).join(''); }
  setAttribute(name, value) { this.attrs.set(name, String(value)); }
  getAttribute(name) { return this.attrs.get(name) ?? null; }
  getAttributeNames() { return [...this.attrs.keys()]; }
  hasAttribute(name) { return this.attrs.has(name); }
  removeAttribute(name) { this.attrs.delete(name); }
  append(...nodes) {
    for (const node of nodes) { node.remove?.(); node.parentNode = this; this.childNodes.push(node); }
  }
  remove() {
    if (this.parentNode) this.parentNode.childNodes.splice(this.parentNode.childNodes.indexOf(this), 1);
    this.parentNode = null;
  }
  replaceWith(node) {
    const parent = this.parentNode;
    const index = parent.childNodes.indexOf(this);
    node.remove(); parent.childNodes.splice(index, 1, node); node.parentNode = parent; this.parentNode = null;
  }
  matches(selector) {
    return selector.split(',').some(part => {
      part = part.trim();
      if (part === '*') return this.nodeType === 1;
      if (part === ':disabled') return Element.prototype.hasAttribute.call(this, 'disabled') || Boolean(Element.prototype.closest.call(this, 'fieldset[disabled]'));
      const tag = part.match(/^[a-z][\w-]*/i)?.[0];
      if (tag && this.localName !== tag.toLowerCase()) return false;
      const attributes = [...part.matchAll(/\[([\w:-]+)(?:=["']?([^\]"']*)["']?)?\]/g)];
      return !!(tag || attributes.length) && attributes.every(([, name, value]) =>
        Element.prototype.hasAttribute.call(this, name) && (value === undefined || Element.prototype.getAttribute.call(this, name) === value));
    });
  }
  closest(selector) { return Element.prototype.matches.call(this, selector) ? this : this.parentNode ? Element.prototype.closest.call(this.parentNode, selector) : null; }
  querySelectorAll(selector) {
    return this.children.flatMap(child => [...(Element.prototype.matches.call(child, selector) ? [child] : []), ...Element.prototype.querySelectorAll.call(child, selector)]);
  }
  querySelector(selector) { return Element.prototype.querySelectorAll.call(this, selector)[0] || null; }
  contains(node) { return node === this || this.children.some(child => child.contains(node)); }
  focus() { this.ownerDocument.activeElement = this; }
  addEventListener(type, callback) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(callback);
  }
  removeEventListener(type, callback) { this.listeners.get(type)?.delete(callback); }
  dispatchEvent(event) {
    event.target ||= this;
    for (const callback of [...this.listeners.get(event.type) || []]) callback(event);
    if (event.bubbles && this.parentNode) Element.prototype.dispatchEvent.call(this.parentNode, event);
    return !event.defaultPrevented;
  }
  set innerHTML(html) {
    const root = this.content || this;
    root.childNodes = [];
    const stack = [root];
    const decode = value => value.replace(/&(?:quot|apos|amp|lt|gt);/g, match => ({'&quot;': '"', '&apos;': "'", '&amp;': '&', '&lt;': '<', '&gt;': '>'}[match]));
    for (const [token] of html.matchAll(/<!--[\s\S]*?-->|<\/[\w:-]+\s*>|<[\w:-]+\b[^>]*>|[^<]+/g)) {
      if (token.startsWith('<!--')) { stack.at(-1).append({nodeType: 8, textContent: token}); continue; }
      if (token.startsWith('</')) { stack.pop(); continue; }
      if (!token.startsWith('<')) { stack.at(-1).append({nodeType: 3, textContent: decode(token)}); continue; }
      const tag = token.match(/^<([\w:-]+)/)[1];
      const attrs = {};
      for (const [, name, double, single, bare] of token.slice(tag.length + 1, -1).matchAll(/([\w:-]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g)) attrs[name] = decode(double ?? single ?? bare ?? '');
      const node = new Element(tag, attrs, this.ownerDocument);
      stack.at(-1).append(node);
      if (!['input', 'img', 'br', 'hr', 'meta', 'link', 'embed', 'base'].includes(tag) && !token.endsWith('/>')) stack.push(node.content || node);
    }
  }
}
class Document extends Element {
  constructor() { super('#document'); this.nodeType = 9; this.ownerDocument = this; }
  get isConnected() { return true; }
  getElementById(id) { return id && this.querySelectorAll('[id]').find(node => node.id === id) || null; }
  createElement(tag) { return new Element(tag, {}, this); }
}
class FormDataDouble extends FormData {
  constructor(form, submitter) {
    super();
    if (!form) return;
    if (submitter && !['submit', 'image'].includes(submitter.type)) throw new TypeError('Not a submit button');
    for (const control of form.ownerDocument.querySelectorAll('input,select,textarea,button').filter(node => node.form === form)) {
      if (!control.name || control.matches(':disabled')) continue;
      if (['checkbox', 'radio'].includes(control.type) && !control.checked) continue;
      if (['submit', 'button', 'reset', 'image'].includes(control.type) && control !== submitter) continue;
      if (control.type === 'file') for (const file of control.files) this.append(control.name, file);
      else if (control.matches('select[multiple]')) for (const option of control.selectedOptions) this.append(control.name, option.value);
      else this.append(control.name, control.value);
    }
  }
}
function harness() {
  const document = new Document();
  const window = new Element('window');
  const calls = [], processed = [], notifications = [], swaps = [];
  const element = (tag, attrs = {}, children = []) => { const node = new Element(tag, attrs, document); node.append(...children); return node; };
  const screen = element('main', {'data-sdui-screen': 'profile', 'data-sdui-endpoint': '/actions/profile', 'data-sdui-csrf': 'screen-token'});
  const input = element('input', {id: 'name', name: 'name', value: 'initial'});
  const button = element('button', {type: 'submit', name: 'commit', value: 'save'});
  const form = element('form', {'data-sdui-on': 'submit', 'data-sdui-action': 'save', 'data-sdui-target': 'region'}, [
    element('input', {type: 'hidden', name: '_csrf', value: 'form-token'}), input, button,
  ]);
  const region = element('section', {id: 'region', 'data-sdui-region': ''}, [form]);
  const outside = element('input', {id: 'outside', name: 'outside', value: 'outside'});
  screen.append(region, outside); document.append(screen); document.activeElement = outside;
  window.location = new URL('https://example.test/profile');
  let ids = 0;
  window.crypto = {randomUUID: () => `request-${++ids}`};
  window.fetch = (url, options) => {
    const result = deferred(); calls.push({url, options, ...result}); return result.promise;
  };
  window.htmx = {process: node => processed.push(node)};
  for (const type of ['sdui:success', 'sdui:error']) document.addEventListener(type, event => notifications.push(event));
  document.addEventListener('htmx:after:swap', event => swaps.push(event));
  const context = {window, document, Element, FormData: FormDataDouble, AbortController, URL, CustomEvent: DOMEvent};
  const install = () => runInNewContext(source, context);
  const fire = (node = form, type = 'submit', detail, extra = {}) => {
    const event = new DOMEvent(type, {detail, ...(type === 'submit' ? {submitter: button} : {}), ...extra});
    Element.prototype.dispatchEvent.call(node, event); return event;
  };
  const complete = async (index, html = fragment(), status = 200, type = 'text/html; charset=utf-8') => {
    calls[index].resolve({status, ok: status >= 200 && status < 300, headers: {get: () => type}, text: () => Promise.resolve(html)});
    await tick();
  };
  install();
  return {document, window, element, screen, region, form, input, button, outside, calls, processed, notifications, swaps, install, fire, complete};
}
const fragment = (value = 'server', id = 'region', inputID = 'name') => `
<section id="${id}" data-sdui-region>
  <form data-sdui-on="submit" data-sdui-action="save" data-sdui-target="${id}">
    <input type="hidden" name="_csrf" value="new-form-token">
    <input id="${inputID}" name="name" value="${value}">
    <button type="submit" name="commit" value="save">Save</button>
  </form>
</section>`;

// The mock deliberately does not honor AbortSignal: sequence guards must work
// even when a network/body read finishes after cancellation.
test('one delegated installation, multipart fields/files, CSRF and submitter are preserved', async () => {
  const h = harness();
  h.install();
  for (const type of ['submit', 'click', 'change', 'ely:action', 'ely:change']) assert.equal(h.document.listeners.get(type).size, 1);
  assert.equal(h.window.listeners.get('pagehide').size, 1);
  const file = new File(['file body'], 'report.txt', {type: 'text/plain'});
  const upload = h.element('input', {type: 'file', name: 'attachment'}); upload.files = [file];
  h.form.append(upload, h.element('input', {name: 'tag', value: 'one'}), h.element('input', {name: 'tag', value: 'two'}),
    h.element('input', {name: '_action', value: 'injected'}), h.element('input', {name: '_target', value: 'elsewhere'}),
    h.element('input', {name: 'skip', value: 'disabled', disabled: ''}));
  const event = h.fire();
  assert.equal(event.defaultPrevented, true);
  assert.equal(h.calls.length, 1);
  const {url, options} = h.calls[0];
  assert.equal(url, 'https://example.test/actions/profile');
  assert.equal(options.method, 'POST');
  assert.equal(options.credentials, 'same-origin');
  assert.equal(options.mode, 'same-origin');
  assert.equal(options.redirect, 'error');
  assert.equal(options.headers['Content-Type'], undefined, 'browser must generate multipart boundary');
  assert(options.body instanceof FormDataDouble);
  assert.deepEqual(options.body.getAll('tag'), ['one', 'two']);
  assert.equal(options.body.get('attachment').name, 'report.txt');
  assert.equal(await options.body.get('attachment').text(), 'file body');
  assert.equal(options.body.get('commit'), 'save');
  assert.equal(options.body.get('skip'), null);
  assert.deepEqual(options.body.getAll('_action'), ['save']);
  assert.equal(options.body.get('_target'), 'region');
  assert.equal(options.body.get('_csrf'), 'screen-token');
  assert.equal(options.body.get('_request'), options.headers['Idempotency-Key']);
  await h.complete(0);
  assert.equal(h.notifications.at(-1).type, 'sdui:success');
  assert.equal(h.processed.length, 1);
  assert.equal(h.swaps[0].detail.ctx.target, h.document.getElementById('region'));
  assert.equal(h.swaps[0].detail.ctx.swap, 'outerHTML');
});

test('in-flight repeat submits share one operation; a later submission has a fresh key', async () => {
  const h = harness();
  h.fire(); h.fire(); h.fire();
  assert.equal(h.calls.length, 1);
  assert.equal(h.form.getAttribute('aria-busy'), 'true');
  await h.complete(0);
  assert.equal(h.form.hasAttribute('aria-busy'), false);
  h.fire(h.document.querySelector('form'));
  assert.equal(h.calls.length, 2);
  assert.notEqual(h.calls[0].options.headers['Idempotency-Key'], h.calls[1].options.headers['Idempotency-Key']);
  await h.complete(1);
});

test('a newer same-target change aborts the old fetch and stale success cannot replace it', async () => {
  const h = harness();
  for (const [name, value] of Object.entries({'data-sdui-on': 'change', 'data-sdui-action': 'save', 'data-sdui-target': 'region'})) h.input.setAttribute(name, value);
  h.input.value = 'old'; h.fire(h.input, 'change');
  h.input.value = 'new'; h.fire(h.input, 'change');
  assert.equal(h.calls.length, 2);
  assert.equal(h.calls[0].options.signal.aborted, true);
  assert.equal(h.calls[1].options.signal.aborted, false);
  assert.equal(h.calls[1].options.body.get('name'), 'new');
  await h.complete(1, fragment('new'));
  await h.complete(0, fragment('old'));
  assert.equal(h.document.getElementById('name').value, 'new');
  assert.equal(h.notifications.length, 1);
  assert.equal(h.input.hasAttribute('aria-busy'), false);
});

test('stale response body reads and failures cannot replace DOM or clear the newer busy state', async () => {
  const h = harness();
  const slowBody = deferred();
  h.fire();
  h.calls[0].resolve({status: 200, ok: true, headers: {get: () => 'text/html'}, text: () => slowBody.promise});
  await tick();
  const second = h.element('button', {'data-sdui-on': 'click', 'data-sdui-action': 'save', 'data-sdui-target': 'region', type: 'button'});
  h.screen.append(second); h.fire(second, 'click');
  slowBody.resolve(fragment('old')); await tick();
  assert.equal(h.document.getElementById('region'), h.region);
  assert.equal(second.getAttribute('aria-busy'), 'true');
  assert.equal(h.notifications.length, 0);
  await h.complete(1, fragment('new'));
  assert.equal(h.document.getElementById('name').value, 'new');
});

test('different target regions proceed independently', async () => {
  const h = harness();
  const otherRegion = h.element('section', {id: 'second', 'data-sdui-region': ''});
  const other = h.element('button', {type: 'button', 'data-sdui-on': 'click', 'data-sdui-action': 'refresh', 'data-sdui-target': 'second'});
  h.screen.append(otherRegion, other);
  h.fire(); h.fire(other, 'click');
  assert.equal(h.calls[0].options.signal.aborted, false);
  await h.complete(1, '<section id="second" data-sdui-region>second</section>');
  await h.complete(0);
  assert.equal(h.notifications.length, 2);
  assert.equal(h.document.getElementById('second').textContent, 'second');
});

test('422 swaps the valid region, initializes controls and preserves focus without old values', async () => {
  const h = harness();
  h.input.value = 'stale local value'; h.input.focus(); h.fire();
  await h.complete(0, fragment('server validated value'), 422);
  assert.equal(h.document.activeElement, h.document.getElementById('name'));
  assert.equal(h.document.activeElement.value, 'server validated value');
  assert.equal(h.notifications.length, 1);
  assert.equal(h.notifications[0].type, 'sdui:error');
  assert.equal(h.notifications[0].detail.validation, true);
  assert.equal(h.notifications[0].detail.status, 422);
  assert.equal(h.processed.length, 1);
});

test('focus falls back to a matching name and never steals focus from outside the region', async () => {
  const h = harness();
  h.input.focus(); h.fire(); await h.complete(0, fragment('first', 'region', 'renamed'));
  assert.equal(h.document.activeElement.id, 'renamed');
  h.fire(h.document.querySelector('form')); h.outside.focus(); await h.complete(1, fragment('second'));
  assert.equal(h.document.activeElement, h.outside);
});

test('swapped forms keep working without adding handlers on each replacement', async () => {
  const h = harness();
  for (let i = 0; i < 4; i++) {
    h.fire(h.document.querySelector('form'));
    await h.complete(i, fragment(`value-${i}`));
  }
  assert.equal(h.calls.length, 4);
  assert.equal(h.notifications.length, 4);
  assert.equal(h.swaps.length, 4);
  for (const type of ['submit', 'click', 'change', 'ely:action', 'ely:change']) assert.equal(h.document.listeners.get(type).size, 1);
});

test('invalid or executable fragments are rejected without changing the live region', async () => {
  const invalid = [
    '<section id="wrong" data-sdui-region></section>',
    '<section id="region"></section>',
    '<section id="region" data-sdui-region></section><p>extra root</p>',
    'extra text<section id="region" data-sdui-region></section>',
    '<section id="region" data-sdui-region><script>throw Error("bad")</script></section>',
    '<section id="region" data-sdui-region><template><script>bad()</script></template></section>',
    '<section id="region" data-sdui-region><img onerror="bad()"></section>',
    '<section id="region" data-sdui-region><a href="javascript:bad()">Bad</a></section>',
    '<section id="region" data-sdui-region><button hx-on:click="bad()">Bad</button></section>',
    '<section id="region" data-sdui-region><button hx-vals="js:bad()">Bad</button></section>',
    '<section id="region" data-sdui-region><button hx-trigger="click[bad()]">Bad</button></section>',
    '<section id="region" data-sdui-region><iframe src="/unsafe"></iframe></section>',
    '<section id="region" data-sdui-region><iframe sandbox="allow-scripts" srcdoc="bad"></iframe></section>',
    '<section id="region" data-sdui-region><div id="region"></div></section>',
    '<section id="region" data-sdui-region><div id="dupe"></div><p id="dupe"></p></section>',
    '<section id="region" data-sdui-region><input id="outside"></section>',
  ];
  for (const html of invalid) {
    const h = harness(); h.fire(); await h.complete(0, html);
    assert.equal(h.document.getElementById('region'), h.region, html);
    assert.equal(h.notifications.length, 1, html);
    assert.equal(h.notifications[0].type, 'sdui:error', html);
    assert.equal(h.notifications[0].detail.validation, false, html);
    assert.equal(h.processed.length, 0, html);
  }
});

test('an inert sandboxed preview and surrounding comments are allowed', async () => {
  const h = harness(); h.fire();
  await h.complete(0, '<!-- fragment --> <section id="region" data-sdui-region><iframe sandbox="" srcdoc="&lt;p&gt;preview&lt;/p&gt;"></iframe></section> \n');
  assert.equal(h.notifications[0].type, 'sdui:success');
});

test('HTTP/network failures and unexpected content types do not swap and can be retried', async () => {
  for (const status of [401, 403, 409, 500]) {
    const h = harness(); h.fire(); await h.complete(0, fragment('must not appear'), status);
    assert.equal(h.document.getElementById('region'), h.region);
    assert.equal(h.notifications[0].detail.status, status);
    assert.equal(h.form.hasAttribute('aria-busy'), false);
    h.fire(); assert.equal(h.calls.length, 2); await h.complete(1);
  }
  const h = harness(); h.fire(); h.calls[0].reject(new TypeError('offline')); await tick();
  assert.equal(h.notifications[0].type, 'sdui:error');
  assert.equal(h.document.getElementById('region'), h.region);
  h.fire(); await h.complete(1, fragment(), 200, 'application/json');
  assert.equal(h.document.getElementById('region'), h.region);
});

test('CSRF falls back to the form or screen input and missing tokens block requests', async () => {
  const h = harness(); h.screen.removeAttribute('data-sdui-csrf'); h.fire();
  assert.equal(h.calls[0].options.body.get('_csrf'), 'form-token'); await h.complete(0);
  const button = h.element('button', {type: 'button', 'data-sdui-on': 'click', 'data-sdui-action': 'save', 'data-sdui-target': 'region'});
  h.screen.append(button); h.fire(button, 'click');
  assert.equal(h.calls[1].options.body.get('_csrf'), 'new-form-token'); await h.complete(1);
  h.document.querySelector('input[name="_csrf"]').remove(); h.fire(button, 'click');
  assert.equal(h.calls.length, 2);
  assert.match(h.notifications.at(-1).detail.error.message, /CSRF/);
});

test('cross-origin, protocol-relative and ambiguous endpoints are rejected', async () => {
  for (const endpoint of ['https://evil.test/save', '//evil.test/save', '/\\evil.test/save', '/save#fragment', '/save\n']) {
    const h = harness(); h.screen.setAttribute('data-sdui-endpoint', endpoint); h.fire(); await tick();
    assert.equal(h.calls.length, 0, endpoint);
    assert.equal(h.notifications[0].type, 'sdui:error', endpoint);
  }
});

test('a binding cannot target a region in another screen', async () => {
  const h = harness();
  const other = h.element('main', {'data-sdui-screen': 'other'}, [h.element('section', {id: 'other-region', 'data-sdui-region': ''})]);
  h.document.append(other); h.form.setAttribute('data-sdui-target', 'other-region'); h.fire(); await tick();
  assert.equal(h.calls.length, 0);
  assert.equal(h.notifications[0].type, 'sdui:error');
});

test('click bindings accept nested targets and type=button without invalid FormData submitters', async () => {
  const h = harness();
  h.button.setAttribute('type', 'button');
  for (const [name, value] of Object.entries({'data-sdui-on': 'click', 'data-sdui-action': 'save', 'data-sdui-target': 'region'})) h.button.setAttribute(name, value);
  const span = h.element('span'); h.button.append(span);
  h.fire(span, 'click'); h.fire(span, 'click');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.body.get('name'), 'initial');
  assert.equal(h.calls[0].options.body.get('commit'), 'save');
  await h.complete(0);
});

test('disabled bindings and modified clicks do not send requests', async () => {
  const h = harness();
  for (const [name, value] of Object.entries({'data-sdui-on': 'click', 'data-sdui-action': 'save', 'data-sdui-target': 'region'})) h.button.setAttribute(name, value);
  h.button.setAttribute('disabled', ''); h.fire(h.button, 'click');
  h.button.removeAttribute('disabled');
  const fieldset = h.element('fieldset', {disabled: ''}); h.form.append(fieldset); fieldset.append(h.button);
  h.fire(h.button, 'click'); fieldset.removeAttribute('disabled');
  h.fire(h.button, 'click', undefined, {ctrlKey: true});
  h.fire(h.button, 'click', undefined, {button: 1});
  assert.equal(h.calls.length, 0);
});

test('Ely formData payload is copied intact without mutating the component event', async () => {
  const h = harness();
  const root = h.element('div', {'data-sdui-on': 'ely:action', 'data-sdui-action': 'save', 'data-sdui-target': 'region'});
  h.screen.append(root);
  const data = new FormDataDouble(); data.append('tag', 'one'); data.append('tag', 'two');
  data.append('file', new File(['payload'], 'event.txt')); data.set('_action', 'original');
  h.fire(root, 'ely:action', {formData: data});
  assert.deepEqual(h.calls[0].options.body.getAll('tag'), ['one', 'two']);
  assert.equal(h.calls[0].options.body.get('file').name, 'event.txt');
  assert.equal(data.get('_action'), 'original');
  assert.equal(data.get('_request'), null);
  await h.complete(0);
});

test('Ely change and standalone native change preserve named values without JSON coercion', async () => {
  const h = harness();
  const root = h.element('div', {'data-sdui-on': 'ely:change', 'data-sdui-action': 'save', 'data-sdui-target': 'region'});
  h.screen.append(root);
  h.fire(root, 'ely:change', {name: 'choice', value: ['one', 'two', {not: 'serialized'}]});
  assert.deepEqual(h.calls[0].options.body.getAll('choice'), ['one', 'two']);
  await h.complete(0);
  const input = h.element('input', {name: 'search', value: 'query', 'data-sdui-on': 'change', 'data-sdui-action': 'save', 'data-sdui-target': 'region'});
  h.screen.append(input); h.fire(input, 'change');
  assert.equal(h.calls[1].options.body.get('search'), 'query');
  await h.complete(1);
});

test('an externally replaced target invalidates an otherwise successful pending response', async () => {
  const h = harness(); h.fire();
  const replacement = h.element('section', {id: 'region', 'data-sdui-region': ''}); h.region.replaceWith(replacement);
  await h.complete(0);
  assert.equal(h.document.getElementById('region'), replacement);
  assert.equal(h.notifications.length, 0);
});

test('pagehide aborts pending work; bfcache return and explicit teardown remain safe', async () => {
  const h = harness(); h.fire(); h.window.dispatchEvent(new DOMEvent('pagehide'));
  assert.equal(h.calls[0].options.signal.aborted, true);
  assert.equal(h.form.hasAttribute('aria-busy'), false);
  await h.complete(0, fragment('old'));
  assert.equal(h.document.getElementById('region'), h.region);
  h.fire(); await h.complete(1, fragment('new'));
  assert.equal(h.document.getElementById('name').value, 'new');
  const previousRuntime = h.window.__elySDUI; previousRuntime.destroy();
  for (const type of ['submit', 'click', 'change', 'ely:action', 'ely:change']) assert.equal(h.document.listeners.get(type).size, 0);
  assert.equal(h.window.listeners.get('pagehide').size, 0);
  h.fire(h.document.querySelector('form')); assert.equal(h.calls.length, 2);
  h.install(); previousRuntime.destroy(); h.install();
  assert.equal(h.document.listeners.get('submit').size, 1, 'old teardown cannot destroy a new installation');
  h.fire(h.document.querySelector('form')); assert.equal(h.calls.length, 3); await h.complete(2);
});


test('superseded network errors stay silent and existing busy accessibility state is restored', async () => {
  const h = harness();
  h.input.setAttribute('data-sdui-on', 'change'); h.input.setAttribute('data-sdui-action', 'save');
  h.input.setAttribute('data-sdui-target', 'region'); h.input.setAttribute('aria-busy', 'false');
  h.fire(h.input, 'change'); h.fire(h.input, 'change');
  h.calls[0].reject(new Error('late network failure')); await tick();
  assert.equal(h.notifications.length, 0);
  assert.equal(h.input.getAttribute('aria-busy'), 'true');
  await h.complete(1);
  assert.equal(h.input.getAttribute('aria-busy'), 'false');
});


test('standalone advanced checkbox/radio changes omit unchecked values like native forms', async () => {
  for (const type of ['checkbox', 'radio']) {
    const h = harness();
    const root = h.element('section', {
      'data-ely-family': 'forms', 'data-sdui-on': 'ely:change',
      'data-sdui-action': 'save', 'data-sdui-target': 'region',
    }, [h.element('input', {type, name: 'updates', value: 'on'})]);
    h.screen.append(root);
    h.fire(root, 'ely:change', {name: 'updates', type, value: 'on', checked: true});
    assert.equal(h.calls[0].options.body.get('updates'), 'on', `${type}: checked is included`);
    await h.complete(0);
    h.fire(root, 'ely:change', {name: 'updates', type, value: 'on', checked: false});
    assert.equal(h.calls[1].options.body.has('updates'), false, `${type}: unchecked is omitted`);
    assert.equal(h.calls[1].options.body.get('_action'), 'save');
    await h.complete(1);
  }
});


test('ordinary form field names cannot clobber adapter DOM operations', async () => {
  const h = harness();
  const names = ['form', 'closest', 'matches', 'getAttribute', 'hasAttribute', 'setAttribute',
    'removeAttribute', 'querySelector', 'querySelectorAll', 'getAttributeNames', 'dispatchEvent'];
  for (const name of names) {
    const field = h.element('input', {name, value: `value-${name}`});
    h.form.append(field);
    // Browsers expose named form controls before prototype members. Model that
    // behavior explicitly, without teaching the adapter special reserved names.
    Object.defineProperty(h.form, name, {value: field, configurable: true});
  }
  h.fire();
  assert.equal(h.calls.length, 1);
  for (const name of names) assert.equal(h.calls[0].options.body.get(name), `value-${name}`);
  assert.equal(Element.prototype.getAttribute.call(h.form, 'aria-busy'), 'true');
  await h.complete(0);
  assert.equal(h.notifications.at(-1).type, 'sdui:success');
  assert.equal(Element.prototype.hasAttribute.call(h.form, 'aria-busy'), false);
});


test('screen revision is protected and stale activation never swaps or silently reloads', async () => {
  const h = harness();
  h.screen.setAttribute('data-sdui-revision', '1-abc');
  h.form.append(h.element('input', {name: '_revision', value: 'forged'}));
  const stale = [];
  h.document.addEventListener('sdui:stale', event => stale.push(event.detail));
  h.input.value = 'unsaved draft';
  h.fire();
  assert.equal(h.calls[0].options.body.get('_revision'), '1-abc');
  h.calls[0].resolve({status:409, ok:false, headers:{get: name => ({'X-SDUI-Reload':'required','X-SDUI-Revision':'2-def'}[name] || null)}, text:async()=>fragment('must not swap')});
  await tick();
  assert.equal(h.document.getElementById('region'), h.region);
  assert.equal(h.input.value, 'unsaved draft');
  assert.equal(stale.length, 1);
  assert.equal(stale[0].revision, '2-def');
  assert.equal(h.window.location.href, 'https://example.test/profile');
  assert.equal(h.notifications.at(-1).type, 'sdui:error');
  assert.equal(h.form.getAttribute('aria-busy'), null);
});

test('multiple action mappings select exact source actions and forward only typed selected detail', async () => {
  const h = harness();
  const bindings = [
    {on:'ely:action', sourceAction:'edit', action:'edit-row', target:'region', payload:{row:{path:'/row/id', type:'integer'}, record:{path:'/row', type:'object'}}},
    {on:'ely:action', sourceAction:'remove', action:'remove-row', target:'region', payload:{row:{path:'/row/id', type:'integer'}}},
  ];
  const root = h.element('div', {'data-sdui-events':JSON.stringify(bindings)}); h.screen.append(root);
  h.fire(root,'ely:action',{action:'unknown',row:{id:7}});
  assert.equal(h.calls.length,0);
  h.fire(root,'ely:action',{action:'edit',row:{id:7,label:'hello'},unselected:'private'});
  assert.equal(h.calls[0].options.body.get('_action'),'edit-row');
  assert.equal(h.calls[0].options.body.get('row'),'7');
  assert.equal(h.calls[0].options.body.get('record'),'{"id":7,"label":"hello"}');
  assert.equal(h.calls[0].options.body.get('unselected'),null);
  await h.complete(0);
  h.fire(root,'ely:action',{action:'remove',row:{id:8}});
  assert.equal(h.calls[1].options.body.get('_action'),'remove-row');
  await h.complete(1);
});

test('typed event payload rejects missing, wrong and oversized detail without fetching', async () => {
  for (const detail of [{}, {value:'not-number'}, {value:Infinity}]) {
    const h=harness(); const root=h.element('div', {'data-sdui-events':JSON.stringify([{on:'ely:action',action:'save',target:'region',payload:{value:{path:'/value',type:'number'}}}])});h.screen.append(root);
    h.fire(root,'ely:action',detail); await tick();
    assert.equal(h.calls.length,0);assert.equal(h.notifications.at(-1).type,'sdui:error');
  }
});

test('unknown child action selector cannot fall through to an ancestor wildcard action', async () => {
 const h=harness();
 const parent=h.element('div',{'data-sdui-events':JSON.stringify([{on:'ely:action',action:'parent-mutation',target:'region'}])});
 const child=h.element('div',{'data-sdui-events':JSON.stringify([{on:'ely:action',sourceAction:'known',action:'child-mutation',target:'region'}])});
 parent.append(child);h.screen.append(parent);
 h.fire(child,'ely:action',{action:'unknown'});await tick();assert.equal(h.calls.length,0);
 h.fire(child,'ely:action',{action:'known'});assert.equal(h.calls[0].options.body.get('_action'),'child-mutation');await h.complete(0);
});

test('validated inert Lottie JSON survives swaps but executable or malformed scripts do not', async () => {
 for (const [markup, accepted] of [
  ['<script type="application/json" data-lottie-animation>{"layers":[]}</script>',true],
  [`<script type="application/json" data-lottie-animation>${JSON.stringify(JSON.stringify({layers:[]}))}</script>`,true],
  ['<script type="application/json" data-lottie-animation>{bad}</script>',false],
  ['<script type="application/json" data-lottie-animation src="/code.js">{}</script>',false],
  ['<script type="text/javascript" data-lottie-animation>{}</script>',false],
  ['<script type="application/json">{}</script>',false],
 ]) {
  const h=harness();h.fire();await h.complete(0,`<section id="region" data-sdui-region>${markup}</section>`);
  assert.equal(h.notifications.at(-1).type,accepted?'sdui:success':'sdui:error',markup);
 }
});

function nativeCompression(h, Compression = CompressionStream) {
  Object.assign(h.window, {CompressionStream: Compression, Blob, Response, URLSearchParams});
}
async function eventually(predicate) {
  const deadline = Date.now() + 2000;
  while (!predicate() && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 1));
  assert(predicate(), 'asynchronous compression did not finish');
}
async function decodedForm(call, encoding = call.options.headers['Content-Encoding']) {
  const stream = new Blob([call.options.body]).stream().pipeThrough(new DecompressionStream(encoding));
  return new URLSearchParams(await new Response(stream).text());
}

test('native gzip fallback compresses text only, preserves repeats and keeps CSRF outside compressed data', async () => {
  const h = harness();
  const formats = [];
  nativeCompression(h, class {
    constructor(format) {
      formats.push(format);
      if (format === 'zstd') throw new TypeError('unsupported');
      return new CompressionStream(format);
    }
  });
  h.input.value = '한글 & + =\n\r\r\n'.repeat(500);
  h.screen.setAttribute('data-sdui-revision', 'revision-v1');
  h.form.append(h.element('input', {name: 'tag', value: 'one'}), h.element('input', {name: 'tag', value: 'two'}));
  h.fire(); h.fire();
  await eventually(() => h.calls.length === 1);
  const call = h.calls[0];
  assert.deepEqual(formats, ['zstd', 'gzip']);
  assert.equal(call.options.headers['Content-Encoding'], 'gzip');
  assert.equal(call.options.headers['Content-Type'], 'application/x-www-form-urlencoded;charset=UTF-8');
  assert.equal(call.options.headers['X-SDUI-CSRF'], 'screen-token');
  const form = await decodedForm(call);
  assert.equal(form.has('_csrf'), false);
  assert.equal(form.get('name'), h.input.value.replace(/\r\n|\r|\n/g, '\r\n'));
  assert.deepEqual(form.getAll('tag'), ['one', 'two']);
  assert.equal(form.get('commit'), 'save');
  assert.equal(form.get('_revision'), 'revision-v1');
  assert.equal(form.get('_request'), call.options.headers['Idempotency-Key']);
  assert(call.options.body.byteLength < form.toString().length);
  await h.complete(0);
  assert.equal(h.notifications.at(-1).type, 'sdui:success');
});

test('supported native zstd is preferred without trying gzip (format-selection double)', async () => {
  const h = harness();
  const formats = [];
  // Node's native implementation may not implement zstd. Test selection with a
  // stream double; the previous test verifies real native gzip wire bytes.
  nativeCompression(h, class {
    constructor(format) { formats.push(format); return new CompressionStream('gzip'); }
  });
  h.input.value = 'repeated text '.repeat(300); h.fire();
  await eventually(() => h.calls.length === 1);
  assert.deepEqual(formats, ['zstd']);
  assert.equal(h.calls[0].options.headers['Content-Encoding'], 'zstd');
  assert.equal((await decodedForm(h.calls[0], 'gzip')).get('name'), h.input.value);
});

test('missing compression dependencies and small payloads retain multipart without new headers', () => {
  for (const missing of ['CompressionStream', 'Blob', 'Response', 'URLSearchParams', null]) {
    const h = harness(); nativeCompression(h);
    if (missing) { delete h.window[missing]; h.input.value = 'x'.repeat(4000); }
    h.fire();
    assert.equal(h.calls.length, 1);
    assert(h.calls[0].options.body instanceof FormDataDouble);
    assert.equal(h.calls[0].options.headers['Content-Encoding'], undefined);
    assert.equal(h.calls[0].options.headers['X-SDUI-CSRF'], undefined);
    assert.equal(h.calls[0].options.body.get('_csrf'), 'screen-token');
  }
});

test('compression threshold is 1024 encoded bytes and files always retain multipart', async () => {
  for (const size of [1023, 1024]) {
    const h = harness();
    let attempts = 0;
    nativeCompression(h, class { constructor() { attempts++; throw new TypeError('unsupported'); } });
    // All other form fields including request-1 contribute this exact encoding.
    const metadata = new URLSearchParams({name: '', commit: 'save', _action: 'save', _target: 'region', _request: 'request-1'}).toString();
    h.input.value = 'a'.repeat(size - metadata.length);
    h.fire(); await eventually(() => h.calls.length === 1);
    assert.equal(attempts, size < 1024 ? 0 : 2);
    assert(h.calls[0].options.body instanceof FormDataDouble);
  }
  const h = harness();
  nativeCompression(h, class { constructor() { assert.fail('files must never enter compression'); } });
  h.input.value = 'a'.repeat(4000);
  const upload = h.element('input', {type: 'file', name: 'file'});
  const file = new File(['file bytes'], 'upload.txt'); upload.files = [file]; h.form.append(upload);
  h.fire();
  assert.equal(h.calls.length, 1);
  assert(h.calls[0].options.body instanceof FormDataDouble);
  assert.equal(h.calls[0].options.body.get('file').name, 'upload.txt');
});

test('non-saving compression and broken streams fall back without a network retry', async () => {
  for (const broken of [false, true]) {
    const h = harness();
    nativeCompression(h, class {
      constructor() { return new TransformStream({transform(chunk, controller) {
        if (broken) throw new Error('compression failed');
        controller.enqueue(chunk);
      }}); }
    });
    h.input.value = 'a'.repeat(4000); h.fire();
    await eventually(() => h.calls.length === 1);
    assert(h.calls[0].options.body instanceof FormDataDouble);
    assert.equal(h.calls[0].options.headers['Content-Encoding'], undefined);
    assert.equal(h.notifications.length, 0);
  }
});

test('cancellation during compression prevents requests and restores busy state', async () => {
  for (const cancel of ['pagehide', 'destroy', 'replace']) {
    const h = harness();
    const gate = deferred(); let started = false;
    nativeCompression(h, class {
      constructor() { return new TransformStream({async transform(chunk, controller) {
        started = true; await gate.promise; controller.enqueue(new Uint8Array([1]));
      }}); }
    });
    h.input.value = 'a'.repeat(4000); h.fire();
    await eventually(() => started);
    if (cancel === 'pagehide') h.window.dispatchEvent(new DOMEvent('pagehide'));
    else if (cancel === 'destroy') h.window.__elySDUI.destroy();
    else h.region.remove();
    gate.resolve();
    await eventually(() => !h.form.hasAttribute('aria-busy'));
    assert.equal(h.calls.length, 0);
    assert.equal(h.notifications.length, 0);
  }
});

test('a newer change supersedes compression before the old request can fetch', async () => {
  const h = harness(); const gate = deferred(); let started = false;
  nativeCompression(h, class {
    constructor() { return new TransformStream({async transform(chunk, controller) {
      started = true; await gate.promise; controller.enqueue(new Uint8Array([1]));
    }}); }
  });
  for (const [name, value] of Object.entries({'data-sdui-on': 'change', 'data-sdui-action': 'save', 'data-sdui-target': 'region'})) h.input.setAttribute(name, value);
  h.input.value = 'a'.repeat(4000); h.fire(h.input, 'change');
  await eventually(() => started);
  h.input.value = 'new'; h.fire(h.input, 'change');
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].options.body.get('name'), 'new');
  gate.resolve(); await tick(); await tick();
  assert.equal(h.calls.length, 1);
  assert.equal(h.input.getAttribute('aria-busy'), 'true');
  await h.complete(0, fragment('new'));
  assert.equal(h.document.getElementById('name').value, 'new');
});

test('compressed network failure is not automatically replayed and user retry gets a new id', async () => {
  const h = harness(); nativeCompression(h);
  h.input.value = 'a'.repeat(4000); h.fire();
  await eventually(() => h.calls.length === 1);
  const first = h.calls[0].options.headers['Idempotency-Key'];
  h.calls[0].reject(new Error('network failure'));
  await eventually(() => !h.form.hasAttribute('aria-busy'));
  assert.equal(h.calls.length, 1);
  assert.equal(h.notifications.at(-1).type, 'sdui:error');
  h.fire(); await eventually(() => h.calls.length === 2);
  const second = h.calls[1].options.headers['Idempotency-Key'];
  assert.notEqual(first, second);
  assert.equal((await decodedForm(h.calls[1])).get('_request'), second);
  await h.complete(1);
  assert.equal(h.notifications.at(-1).type, 'sdui:success');
});

test('explicit request-compression opt-out on form or ancestor preserves multipart', () => {
  for (const scope of ['form', 'region', 'screen']) {
    const h = harness();
    nativeCompression(h, class { constructor() { assert.fail('opted-out data must not enter compression'); } });
    h[scope].setAttribute('data-sdui-request-compression', 'off');
    h.input.value = 'a'.repeat(4000); h.fire();
    assert.equal(h.calls.length, 1);
    assert(h.calls[0].options.body instanceof FormDataDouble);
    assert.equal(h.calls[0].options.body.get('_csrf'), 'screen-token');
    assert.equal(h.calls[0].options.headers['Content-Encoding'], undefined);
  }
});

test('password forms automatically disable request compression including external buttons and fields', () => {
  for (const external of [false, true, 'field']) {
    const h = harness();
    nativeCompression(h, class { constructor() { assert.fail('password form must not enter compression'); } });
    const password = h.element('input', {type: 'password', name: 'password', value: 'private'});
    h.form.append(password);
    h.input.value = 'a'.repeat(4000);
    if (external) {
      h.form.setAttribute('id', 'password-form');
      if (external === 'field') { password.setAttribute('form', 'password-form'); h.screen.append(password); }
      const button = h.element('button', {form: 'password-form', type: 'submit', 'data-sdui-on': 'click', 'data-sdui-action': 'save', 'data-sdui-target': 'region'});
      h.screen.append(button); h.fire(button, 'click');
    } else h.fire();
    assert.equal(h.calls.length, 1);
    assert(h.calls[0].options.body instanceof FormDataDouble);
    assert.equal(h.calls[0].options.headers['Content-Encoding'], undefined);
  }
});

test('CSRF tokens unsafe for HTTP headers retain the existing multipart flow', () => {
  for (const csrf of ['unicode-한글', 'token\nnewline', 'token\rcarriage', ' token ', 'token\ttab', 'token\0null', 'token\x7fdel']) {
    const h = harness();
    nativeCompression(h, class { constructor() { assert.fail('header-unsafe CSRF must not enter compression'); } });
    h.screen.setAttribute('data-sdui-csrf', csrf);
    h.input.value = 'a'.repeat(4000); h.fire();
    assert.equal(h.calls.length, 1);
    assert(h.calls[0].options.body instanceof FormDataDouble);
    assert.equal(h.calls[0].options.body.get('_csrf'), csrf);
    assert.equal(h.calls[0].options.headers['X-SDUI-CSRF'], undefined);
    assert.equal(h.calls[0].options.headers['Content-Encoding'], undefined);
  }
});

test('request codec policy follows host order and unsupported-only lists retain multipart', async () => {
  for (const [codecs, expected] of [['gzip,zstd', ['gzip']], ['br,unknown', []], ['', []], ['zstd,gzip', ['zstd']], ['gzip,gzip', ['gzip']]]) {
    const h = harness(); const formats = [];
    h.screen.setAttribute('data-sdui-request-codecs', codecs);
    nativeCompression(h, class { constructor(format) { formats.push(format); return new CompressionStream('gzip'); } });
    h.input.value = 'a'.repeat(4000); h.fire();
    await eventually(() => h.calls.length === 1);
    assert.deepEqual(formats, expected);
    if (!expected.length) assert(h.calls[0].options.body instanceof FormDataDouble);
    else assert.equal(h.calls[0].options.headers['Content-Encoding'], expected[0]);
  }
});

test('request compression threshold is configurable and malformed values use safe defaults', async () => {
  for (const [value, shouldCompress] of [['0', true], ['10000', false], ['-1', false], ['1e2', false], ['67108865', false], ['NaN', false], ['', false]]) {
    const h = harness(); let attempts = 0;
    h.screen.setAttribute('data-sdui-request-min-bytes', value);
    h.screen.setAttribute('data-sdui-request-codecs', 'gzip');
    nativeCompression(h, class { constructor(format) { attempts++; return new CompressionStream(format); } });
    h.input.value = 'a'.repeat(500); h.fire();
    await eventually(() => h.calls.length === 1);
    assert.equal(attempts, shouldCompress ? 1 : 0, value);
    assert.equal(h.calls[0].options.body instanceof FormDataDouble, !shouldCompress, value);
  }
});

test('minimum byte and percentage savings gate compressed requests with bounded fallback', async () => {
  for (const [name, value, compress] of [
    ['min-savings-bytes', '10000', false], ['min-savings-bytes', '0', true],
    ['min-savings-bytes', '-1', true], ['min-savings-bytes', '67108865', true],
    ['min-savings-percent', '100', false], ['min-savings-percent', '99', false],
    ['min-savings-percent', '0', true], ['min-savings-percent', '101', true],
    ['min-savings-percent', 'invalid', true],
  ]) {
    const h = harness(); nativeCompression(h);
    h.screen.setAttribute(`data-sdui-request-${name}`, value);
    h.input.value = 'a'.repeat(4000); h.fire();
    await eventually(() => h.calls.length === 1);
    assert.equal(h.calls[0].options.body instanceof FormDataDouble, !compress, `${name}=${value}`);
  }
});

test('codec fallback can meet savings when the first native codec does not', async () => {
  const h = harness(); const formats = [];
  nativeCompression(h, class { constructor(format) {
    formats.push(format);
    return format === 'zstd' ? new TransformStream({transform(chunk, controller) {controller.enqueue(chunk);}}) : new CompressionStream(format);
  }});
  h.input.value = 'a'.repeat(4000); h.fire();
  await eventually(() => h.calls.length === 1);
  assert.deepEqual(formats, ['zstd', 'gzip']);
  assert.equal(h.calls[0].options.headers['Content-Encoding'], 'gzip');
});

test('default savings gates require at least 64 bytes and 5 percent', async () => {
  for (const [size, savings, compress] of [[1024, 63, false], [1024, 64, true], [2048, 102, false], [2048, 103, true]]) {
    const h = harness();
    h.screen.setAttribute('data-sdui-request-codecs', 'gzip');
    nativeCompression(h, class { constructor() { return new TransformStream({transform() {}, flush(controller) {
      controller.enqueue(new Uint8Array(size - savings));
    }}); } });
    const metadata = new URLSearchParams({name: '', commit: 'save', _action: 'save', _target: 'region', _request: 'request-1'}).toString();
    h.input.value = 'a'.repeat(size - metadata.length); h.fire();
    await eventually(() => h.calls.length === 1);
    assert.equal(h.calls[0].options.body instanceof FormDataDouble, !compress, `${size}/${savings}`);
  }
});

test('composite editor blur does not duplicate named aggregate change actions', () => {
  const h = harness();
  const root = h.element('div', {'data-sdui-on': 'change', 'data-sdui-action': 'save', 'data-sdui-target': 'region'});
  const value = h.element('input', {type: 'hidden', name: 'tags', value: 'alpha,beta'});
  const tag = h.element('input', {'data-ui-tag-entry': ''});
  const pin = h.element('input', {'data-ui-pin-slot': ''});
  root.append(value, tag, pin); h.screen.append(root);
  let nativeChanges = 0;
  root.addEventListener('change', () => nativeChanges++);
  h.fire(value, 'change'); h.fire(tag, 'change'); h.fire(pin, 'change');
  assert.equal(h.calls.length, 1, 'only aggregate field reaches host action');
  assert.equal(h.calls[0].options.body.get('tags'), 'alpha,beta');
  assert.equal(nativeChanges, 3, 'native editor events remain available to custom consumers');
  const ordinary = h.element('input'); root.append(ordinary); h.fire(ordinary, 'change');
  assert.equal(h.calls.length, 2, 'ordinary unnamed controls retain existing behavior');
  tag.setAttribute('name', 'custom-editor'); tag.value = 'caller-owned'; h.fire(tag, 'change');
  assert.equal(h.calls.length, 3, 'explicit named custom editors remain successful controls');
  assert.equal(h.calls[2].options.body.get('custom-editor'), 'caller-owned');
});
