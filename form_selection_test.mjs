import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Execute the entire production runtime against a small, deterministic DOM.
// The browser companion exercises these same swaps using bundled HTMX itself.
const source = readFileSync(process.env.FORM_SELECTION_SOURCE || new URL('./assets/ely-controls.js', import.meta.url), 'utf8');
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
  addEventListener(type, callback, capture = false) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type).push({callback,capture});
  }
  dispatchEvent(event) {
    event.target ||= this;
    const path=[this];for(let n=this.parentNode;n;n=n.parentNode)path.push(n);
    for(const n of [...path].reverse())for(const entry of n.listeners.get(event.type)||[])if(entry.capture)entry.callback(event);
    for(const n of event.bubbles ? path : [this])for(const entry of n.listeners.get(event.type)||[])if(!entry.capture)entry.callback(event);
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
function combo(id, {free=false, readonly=false, disabled=false}={}) {
 const hidden=valueInput('a',{name:'choice',disabled:''});
 if(disabled)hidden.setAttribute('data-ui-permanently-disabled','');
 const input=marked('data-ui-combobox-input');input.readOnly=readonly;input.disabled=disabled;
 const options=['a','b','c'].map((value,i)=>{const o=element('li',{'data-ui-option':'','data-value':value,'data-ui-label':['Alpha','Beta','Gamma'][i],id:id+'-'+value,'aria-selected':String(i===0),...(i===0?{'aria-disabled':'true'}:{})});o.textContent=o.dataset.uiLabel;return o;});
 const list=marked('data-ui-combobox-list','ul');list.hidden=true;list.append(...options);
 const root=element('div',{'data-ui-component':'combobox',...(free?{'data-ui-combobox-free':''}:{})},[hidden,input,list]);body.append(root);
 document.dispatchEvent(new DOMEvent('htmx:after:swap'));
 return {root,hidden,input,list,options};
}
const key=(c,key)=>c.input.dispatchEvent(new DOMEvent('keydown',{key,bubbles:true}));
const fire=(n,type,extra={})=>n.dispatchEvent(new DOMEvent(type,{bubbles:true,...extra}));
const c=combo('caller');assert.equal(c.input.value,'Alpha');assert.equal(c.hidden.disabled,false);assert.equal(c.input.getAttribute('aria-activedescendant'),null);
fire(c.input,'focusin');assert.equal(c.input.getAttribute('aria-activedescendant'),'caller-b','disabled selected option skipped');
let events=[];for(const type of ['input','change'])c.hidden.addEventListener(type,()=>{assert.equal(c.list.hidden,true,'observers see committed collapsed state');assert.equal(c.input.getAttribute('aria-activedescendant'),null);events.push([type,c.hidden.value,c.input.value]);});
key(c,'Enter');assert.equal(c.hidden.value,'b');assert.deepEqual(events,[['input','b','Beta'],['change','b','Beta']]);assert.equal(c.input.getAttribute('aria-activedescendant'),null);
c.input.value='unknown';fire(c.input,'input');assert.equal(c.hidden.value,'b','typing does not destroy committed selection');fire(c.input,'focusout',{relatedTarget:null});assert.equal(c.input.value,'Beta','strict blur restores selected label');assert.equal(c.list.hidden,true);
c.input.value='  GAM  ';fire(c.input,'input');assert.equal(c.options[2].hidden,false,'query trims and ignores case');key(c,'Escape');assert.equal(c.input.value,'Beta');assert.equal(c.list.hidden,true);
key(c,'ArrowDown');key(c,'ArrowUp');assert.equal(c.input.getAttribute('aria-activedescendant'),'caller-c','arrows wrap across enabled rows');key(c,'Tab');assert.equal(c.list.hidden,true);
for(const mode of [{readonly:true},{disabled:true}]){const c=combo('locked',mode);fire(c.input,'click');key(c,'ArrowDown');fire(c.options[2],'click');assert.equal(c.hidden.value,'a');assert.equal(c.list.hidden,true);}
const free=combo('free',{free:true});free.input.value='custom';fire(free.input,'input');fire(free.input,'focusout',{relatedTarget:null});assert.equal(free.input.value,'custom');assert.equal(free.hidden.value,'custom');
const swap=combo('swap');fire(swap.input,'focusin');key(swap,'Enter');document.dispatchEvent(new DOMEvent('htmx:after:swap'));document.dispatchEvent(new DOMEvent('htmx:after:swap'));assert.equal(swap.hidden.value,'b','repeated lifecycle does not reset selection');
// Causal controls are executed by running this file with mutated production source.
console.log('Production combobox: caller values, disabled-row keyboard navigation, atomic events, strict blur/Escape restoration, readonly guards, free text, filtering and repeated HTMX lifecycle passed');

assert.equal(free.options.some(o=>o.getAttribute('aria-selected')==='true'),false,'free typing clears stale option selection');
const children=combo('replaced');children.hidden.disabled=true;children.input.value='a';swap.root.replaceChildren(...children.root.children);children.root.remove();
document.dispatchEvent(new DOMEvent('htmx:after:swap'));assert.equal(children.hidden.disabled,false,'retained-root child replacement enables fresh submission');assert.equal(children.input.value,'Alpha','retained-root child replacement resolves fresh selected label');

const observed=combo('observed',{free:true}),seen=[];observed.root.addEventListener('input',()=>seen.push(observed.hidden.value));observed.input.value='new caller text';fire(observed.input,'input');assert.deepEqual(seen,['new caller text'],'ancestor input listener sees committed free value once');
