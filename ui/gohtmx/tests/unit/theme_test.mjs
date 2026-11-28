import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../../assets/theme.js',import.meta.url),'utf8');
function boot(saved={}, denied=false) {
  const values=new Map(Object.entries(saved)), properties=new Map(), listeners=new Map(), events=[], toggleAttributes=new Map();
  const toggle={setAttribute:(key,value)=>toggleAttributes.set(key,value)};
  const root={dataset:{},style:{setProperty:(key,value)=>properties.set(key,value)}};
  const document={documentElement:root,querySelectorAll:()=>[toggle],addEventListener:(name,callback)=>listeners.set(name,callback),dispatchEvent:event=>events.push(event)};
  const storage={getItem:key=>{if(denied)throw new Error('storage disabled');return values.get(key)||null;},setItem:(key,value)=>{if(denied)throw new Error('storage disabled');values.set(key,value);}};
  const window={matchMedia:()=>({matches:false})};
  vm.runInNewContext(source,{document,window,localStorage:storage,CustomEvent:class{constructor(type,options){this.type=type;this.detail=options.detail;}}});
  return {api:window.ElyTheme,root,properties,values,events,listeners,toggleAttributes};
}
const runtime=boot(), {api}=runtime;
runtime.listeners.get('DOMContentLoaded')();
assert.equal(runtime.toggleAttributes.get('aria-label'),'Switch to dark mode');
assert.equal(runtime.toggleAttributes.get('aria-pressed'),'false');
assert.equal(api.tokens.length,19);
assert.equal(api.list().length,4);
assert.equal(api.current().id,'ely');
assert.equal(boot({'ely-palette':'blue'}).api.current().id,'blue','saved choices must survive the new default');
for(const {id} of api.list())assert.equal(api.issues(api.get(id)).length,0,id+' contrast');
api.apply('violet','dark');
assert.equal(runtime.toggleAttributes.get('aria-label'),'Switch to light mode');
assert.equal(runtime.toggleAttributes.get('aria-pressed'),'true');
assert.equal(runtime.root.dataset.palette,'violet');
assert.equal(runtime.properties.get('--color-primary'),'#C0A5DF');
assert.equal(runtime.properties.get('--color-ring'),'#C0A5DF');
assert.equal(runtime.properties.get('--color-primary-foreground'),'#14213A');
assert.equal(runtime.values.get('ely-theme'),'dark');
assert.equal(runtime.events.at(-1).type,'ely:theme-change');
runtime.listeners.get('click')({target:{closest:()=>true}});
assert.equal(api.current().mode,'light');
assert.equal(api.current().id,'violet');
assert.equal(runtime.toggleAttributes.get('aria-label'),'Switch to dark mode');
runtime.toggleAttributes.clear();
runtime.listeners.get('htmx:after:swap')();
assert.equal(runtime.toggleAttributes.get('aria-label'),'Switch to dark mode','swapped controls must keep English accessibility labels');

const preview={dataset:{},style:{setProperty:(key,value)=>preview[key]=value}};
api.preview(preview,'terracotta','dark');
assert.equal(preview['--color-primary'],'#E7A38B');
assert.equal(api.current().id,'violet','preview must not change the applied theme');
const custom=api.get('terracotta');custom.id='custom';custom.name='Caller proposal';
api.register(custom);custom.light['color-accent']='#FFFFFF';
api.apply('custom','dark');
assert.equal(api.get('custom').light['color-accent'],'#96523E','registration must not retain caller mutations');
const restored=boot(Object.fromEntries(runtime.values));
assert.equal(restored.api.current().id,'custom');
assert.equal(restored.properties.get('--color-primary'),'#E7A38B');
assert.equal(restored.api.get('custom').name,'Caller proposal');
const snapshot=api.get('blue');snapshot.light.surface='#000000';
assert.equal(api.get('blue').light.surface,'#FFFFFF');

for(const mutate of [t=>delete t.light.focus,t=>t.dark.extra='#FFFFFF',t=>t.light.surface='url(https://example.test)',t=>t.id='__proto__',t=>t.name='',t=>t.light=null,t=>t.extra='unexpected']){
  const value=api.get('blue');value.id='invalid';mutate(value);assert.throws(()=>api.register(value));
}
assert.throws(()=>api.register(api.get('blue')),/Use a new id to customize a built-in theme\./,'builtins must not be overwritten');
assert.throws(()=>api.apply('unknown'),/This theme is not registered\./);
assert.throws(()=>api.apply('blue','invalid'),/Mode must be light, dark, or system\./);
assert.throws(()=>api.register({}),/A theme requires id, name, light, and dark\./);
const missingToken=api.get('blue');missingToken.id='missing-token';delete missingToken.light.focus;
assert.throws(()=>api.register(missingToken),/light requires all 19 supported color tokens\./);
const invalidColor=api.get('blue');invalidColor.id='invalid-color';invalidColor.dark.focus='red';
assert.throws(()=>api.register(invalidColor),/dark.focus: enter a color in #RRGGBB format\./);
const unreadable=api.get('blue');unreadable.id='unreadable';unreadable.light['color-ink']=unreadable.light['color-paper'];
assert.ok(api.issues(unreadable).length);assert.throws(()=>api.register(unreadable),/Fix the text or input border contrast before applying this theme\./);assert.throws(()=>api.apply('unreadable'));
assert.equal(api.current().id,'custom','failed apply must leave the current palette intact');
unreadable.id='custom';assert.throws(()=>api.register(unreadable));assert.equal(api.get('custom').light['color-accent'],'#96523E','failed replacement must preserve the registered theme');
assert.equal(boot({'ely-palette':'unreadable','ely-custom-theme':JSON.stringify(unreadable)}).api.current().id,'ely');
assert.equal(boot({'ely-palette':'missing','ely-custom-theme':'{bad json'}).api.current().id,'ely');
assert.equal(boot({},true).api.current().id,'ely');
const unreadableDanger=api.get('ely');unreadableDanger.id='unreadable-danger';
unreadableDanger.light.error=unreadableDanger.light['on-accent'];
unreadableDanger.light['error-tint']=unreadableDanger.light['color-ink'];
assert.ok(api.issues(unreadableDanger).some(issue=>issue.foreground==='on-accent'&&issue.background==='error'));
assert.throws(()=>api.register(unreadableDanger),'danger buttons must keep readable labels');

// The CSS fallback preserves the default palette when JavaScript is unavailable.
const css=readFileSync(new URL('../../assets/input.css',import.meta.url),'utf8');
const lightCSS=css.match(/@theme\s*\{([\s\S]*?)\n\}/)[1]+css.match(/:root\s*\{([\s\S]*?)\n\s*\}/)[1];
const darkCSS=css.match(/:root\[data-theme='dark'\]\s*\{([\s\S]*?)\n\s*\}/)[1];
for(const [mode,text] of [['light',lightCSS],['dark',darkCSS]])for(const key of api.tokens){
  const value=text.match(new RegExp('--'+key+':\\s*(#[0-9a-f]{6})','i'))?.[1].toUpperCase();
  assert.equal(value,api.get('ely')[mode][key],mode+' CSS fallback '+key);
}
console.log('Theme presets, contrast, aliases, scope, storage, validation, and CSS fallback passed.');

// #81: system mode, live prefers-color-scheme tracking, resetMode, and [data-theme-select]
{
  const values = new Map();
  const properties = new Map();
  const listeners = new Map();
  const events = [];
  const mediaListeners = [];
  let matchesDark = true;
  const select = { value: 'light' };
  const root = {
    dataset: {},
    hasAttribute: () => false,
    style: { setProperty: (k, v) => properties.set(k, v), removeProperty: k => properties.delete(k) },
  };
  const meta = { content: '', setAttribute: (k, v) => { if (k === 'content') meta.content = v; } };
  const document = {
    documentElement: root,
    querySelector: sel => (sel === 'meta[name="theme-color"]:not([media])' ? meta : null),
    querySelectorAll: sel => (sel === '[data-theme-select]' ? [select] : []),
    addEventListener: (name, cb) => listeners.set(name, cb),
    dispatchEvent: ev => events.push(ev),
  };
  const storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v) };
  const mql = {
    get matches() { return matchesDark; },
    addEventListener: (name, cb) => { if (name === 'change') mediaListeners.push(cb); },
  };
  const window = { matchMedia: () => mql };
  vm.runInNewContext(source, { document, window, localStorage: storage, CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts.detail; } } });

  assert.equal(window.ElyTheme.current().mode, 'dark');
  assert.equal(window.ElyTheme.current().preference, 'system');
  assert.equal(meta.content, '#252525', '#82: theme-color meta synced on boot');

  listeners.get('DOMContentLoaded')();
  assert.equal(select.value, 'system');

  // apply('blue') without 2nd arg preserves system preference
  window.ElyTheme.apply('blue');
  assert.equal(window.ElyTheme.current().id, 'blue');
  assert.equal(window.ElyTheme.current().preference, 'system');
  assert.equal(window.ElyTheme.current().mode, 'dark');
  assert.equal(events.at(-1).detail.preference, 'system');

  // OS switches to light while preference is system
  matchesDark = false;
  mediaListeners.forEach(fn => fn({ matches: false }));
  assert.equal(window.ElyTheme.current().mode, 'light');
  assert.equal(window.ElyTheme.current().preference, 'system');
  assert.equal(meta.content, '#FCFAF7', '#82: theme-color meta synced on live system change');

  // [data-theme-toggle] click from system pins explicit light/dark and syncs [data-theme-select]
  listeners.get('click')({ target: { closest: sel => sel === '[data-theme-toggle]' } });
  assert.equal(window.ElyTheme.current().mode, 'dark');
  assert.equal(window.ElyTheme.current().preference, 'dark');
  assert.equal(select.value, 'dark');
  assert.equal(events.at(-1).detail.preference, 'dark');

  // Explicit override via [data-theme-select] ignores OS change
  select.value = 'light';
  listeners.get('change')({ target: { closest: sel => (sel === '[data-theme-select]' ? select : null) } });
  assert.equal(window.ElyTheme.current().mode, 'light');
  assert.equal(window.ElyTheme.current().preference, 'light');
  matchesDark = true;
  mediaListeners.forEach(fn => fn({ matches: true }));
  assert.equal(window.ElyTheme.current().mode, 'light', 'explicit light preference must not track OS changes');

  // resetMode restores system tracking
  window.ElyTheme.resetMode();
  assert.equal(window.ElyTheme.current().preference, 'system');
  assert.equal(window.ElyTheme.current().mode, 'dark');
  assert.equal(select.value, 'system');
}

// #83: optional non-color tokens (radius, font) and cleanup when switching back
{
  const values = new Map();
  const properties = new Map();
  const listeners = new Map();
  const root = {
    dataset: {},
    hasAttribute: () => false,
    style: { setProperty: (k, v) => properties.set(k, v), removeProperty: k => properties.delete(k) },
  };
  const document = {
    documentElement: root,
    querySelector: () => null,
    querySelectorAll: () => [],
    addEventListener: (name, cb) => listeners.set(name, cb),
    dispatchEvent: () => {},
  };
  const storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v) };
  const window = { matchMedia: () => ({ matches: false }) };
  vm.runInNewContext(source, { document, window, localStorage: storage, CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts.detail; } } });

  const customWithTokens = window.ElyTheme.get('blue');
  customWithTokens.id = 'branded';
  customWithTokens.radius = '0.5rem';
  customWithTokens.font = { sans: "'Pretendard', sans-serif", mono: "'JetBrains Mono', monospace" };
  window.ElyTheme.register(customWithTokens);
  window.ElyTheme.apply('branded', 'light');
  assert.equal(properties.get('--ely-control-radius'), '0.5rem');
  assert.equal(properties.get('--font-sans'), "'Pretendard', sans-serif");
  assert.equal(properties.get('--font-mono'), "'JetBrains Mono', monospace");

  // Switching back to theme without non-color tokens cleans up inline properties
  window.ElyTheme.apply('blue', 'light');
  assert.equal(properties.has('--ely-control-radius'), false);
  assert.equal(properties.has('--font-sans'), false);
  assert.equal(properties.has('--font-mono'), false);

  // String font and radius: '0'
  const stringFont = window.ElyTheme.get('blue');
  stringFont.id = 'string-font';
  stringFont.radius = '0';
  stringFont.font = 'Inter, sans-serif';
  window.ElyTheme.register(stringFont);
  window.ElyTheme.apply('string-font', 'light');
  assert.equal(properties.get('--ely-control-radius'), '0');
  assert.equal(properties.get('--font-sans'), 'Inter, sans-serif');
  assert.equal(properties.has('--font-mono'), false);

  for (const badRadius of ['12px; color: red', '-4px', '50%']) {
    const t = window.ElyTheme.get('blue'); t.id = 'bad-rad'; t.radius = badRadius;
    assert.throws(() => window.ElyTheme.register(t), /radius:/);
  }
  for (const badFont of ['Inter; url(https://evil.test)', 'u/**/rl(https://evil.test)', '\\75rl(x)', 'var(--font-sans)', '"unbalanced', 'Inter\nbody{}', {}]) {
    const t = window.ElyTheme.get('blue'); t.id = 'bad-font'; t.font = badFont;
    assert.throws(() => window.ElyTheme.register(t), /font:/);
  }
}

// #84: CSS-first / mode-only mode (currentScript data-mode-only, load-time meta sync, no palette leak)
{
  const values = new Map([['ely-palette', 'violet']]);
  const properties = new Map();
  const listeners = new Map();
  const winListeners = new Map();
  const events = [];
  let stylesheetLoaded = false;
  const root = {
    dataset: {},
    hasAttribute: () => false,
    style: { setProperty: (k, v) => properties.set(k, v), removeProperty: k => properties.delete(k) },
  };
  const meta = { content: '', setAttribute: (k, v) => { if (k === 'content') meta.content = v; } };
  const document = {
    documentElement: root,
    currentScript: { hasAttribute: attr => attr === 'data-mode-only' },
    querySelector: sel => (sel === 'meta[name="theme-color"]:not([media])' ? meta : null),
    querySelectorAll: () => [],
    addEventListener: (name, cb) => listeners.set(name, cb),
    dispatchEvent: ev => events.push(ev),
  };
  const storage = { getItem: k => values.get(k) || null, setItem: (k, v) => values.set(k, v) };
  const window = {
    matchMedia: () => ({ matches: false }),
    addEventListener: (name, cb) => winListeners.set(name, cb),
    getComputedStyle: () => ({ getPropertyValue: prop => (stylesheetLoaded && prop === '--color-paper' ? (root.dataset.theme === 'dark' ? '#112233' : '#FAFBFD') : '') }),
  };
  vm.runInNewContext(source, { document, window, localStorage: storage, CustomEvent: class { constructor(type, opts) { this.type = type; this.detail = opts.detail; } } });

  assert.equal(root.dataset.theme, 'light');
  assert.equal(root.dataset.palette, undefined, 'mode-only must not set data-palette');
  assert.equal(window.ElyTheme.current().id, 'ely', 'mode-only must not leak stored ely-palette');
  assert.equal(properties.size, 0, 'mode-only must not inject inline CSS variables');
  assert.equal(meta.content, '', 'before stylesheet loads, computed --color-paper is empty');

  stylesheetLoaded = true;
  winListeners.get('load')();
  assert.equal(meta.content, '#FAFBFD', 'window load syncs --color-paper from external stylesheet');

  window.ElyTheme.apply('ely', 'dark');
  assert.equal(root.dataset.theme, 'dark');
  assert.equal(properties.size, 0, 'mode-only apply must not inject inline CSS variables');
  assert.equal(meta.content, '#112233');
}
console.log('Theme #81-#84 enhancements passed.');
