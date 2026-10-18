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
assert.throws(()=>api.apply('blue','invalid'),/Mode must be light or dark\./);
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
