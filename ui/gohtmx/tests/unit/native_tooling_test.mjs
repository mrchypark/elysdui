import assert from 'node:assert/strict';
import test from 'node:test';
import {frameStats,missedFrames,recordInput,rgba,contrastResult,contourPixels,validSurfaceFrame,initNativeTooling} from '../../assets/ely-api-native-tooling.js';

test('ComponentGallery check follows fixture destinations on live and static sites and rejects stale or foreign links',async()=>{
 const {readFile}=await import('node:fs/promises');
 const read=path=>readFile(new URL(path,import.meta.url),'utf8');
 const checks=await read('../../../../internal/gallery/assets/advanced-native-tooling-checks.js');
 const fixture=await read('../../../../internal/gallery/advanced_native_tooling_fixtures.go');
 const section=fixture.slice(fixture.indexOf('case "ComponentGallery":'),fixture.indexOf('case "PlaygroundPanel":'));
 const destinations=[...section.matchAll(/"Label": "([^"]+)"[^\n]+"URL": "([^"]+)"/g)].map(([,label,path])=>({label,path}));
 assert.equal(destinations.length,3,'Exercise all actual fixture links, not a copied old fixture');
 const body=checks.slice(checks.indexOf('const gallery=async'),checks.indexOf('const playground=async'));
 for(const moduleURL of ['http://127.0.0.1:19874/assets/advanced-native-tooling-checks.js','https://example.test/elysdui/go-htmx/assets/advanced-native-tooling-checks.js']){
  const document={activeElement:null},base=new URL('../',moduleURL),isStatic=base.pathname!=='/';
  const makeLinks=transform=>destinations.map(({label,path},index)=>({textContent:label,href:transform(new URL(path.slice(1)+(isStatic?'/':''),base).href,index),focus(){document.activeElement=this;}}));
  const run=links=>{
   const root={querySelector:selector=>selector==='[data-native-kind="ComponentGallery"]'?{}:null,querySelectorAll:()=>links};
   const need=(node,selector)=>{const result=node.querySelector(selector);assert(result);return result;};
   // Only supply the module URL environment; run the actual exported-page check body.
   return new Function('need','assert','document','moduleURL',body.replaceAll('import.meta.url','moduleURL')+';return gallery;')(need,assert,document,moduleURL)({root});
  };
  await run(makeLinks(href=>href));
  for(let index=0;index<3;index++){
   await assert.rejects(run(makeLinks((href,i)=>i===index?new URL(['/gallery/foundation','/gallery/media','/gallery/tooling'][i],base).href:href)),/caller link/);
   await assert.rejects(run(makeLinks((href,i)=>i===index?href.replace(new URL(href).origin,'https://foreign.test'):href)),/caller link/);
  }
  if(isStatic)await assert.rejects(run(makeLinks(href=>href.replace('/elysdui/go-htmx/','/wrong-base/'))),/caller link/);
 }
});
// A deterministic DOM/clock boundary; exercises the real initializer, not copied dispatch logic.
class Node {
 constructor(tag='div',attrs={}){this.tagName=tag.toUpperCase();this.attrs={};this.dataset={};this.children=[];this.listeners=new Map();this.style={};this.hidden=false;this.textContent='';this.value='';this.classList={add:()=>{}};for(const[k,v]of Object.entries(attrs))this.setAttribute(k,v);}
 setAttribute(k,v){this.attrs[k]=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=String(v);if(k==='type')this.type=v;if(k==='name')this.name=v;}
 matches(s){if(s==='[data-ely-family]')return 'elyFamily'in this.dataset;if(s.includes(','))return s.split(',').some(v=>this.matches(v.trim()));const m=s.match(/^(\w+)?(?:\[([^=\]]+)(?:="([^"]*)")?\])?$/);return !!m&&(!m[1]||m[1].toUpperCase()===this.tagName)&&(!m[2]||(m[2]in this.attrs&&(m[3]===undefined||this.attrs[m[2]]===m[3])));}
 closest(s){for(let el=this;el;el=el.parentElement)if(el.matches(s))return el;return null;}
 querySelectorAll(s){return this.children.flatMap(el=>[...(el.matches?.(s)?[el]:[]),...(el.querySelectorAll?.(s)||[])]);}
 querySelector(s){return this.querySelectorAll(s)[0]||null;}
 append(...nodes){for(const node of nodes){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(n=>n!==node);node.parentElement=this;node.ownerDocument=this.ownerDocument;this.children.push(node);}}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
 addEventListener(type,fn){const fns=this.listeners.get(type)||[];fns.push(fn);this.listeners.set(type,fns);}
 removeEventListener(type,fn){this.listeners.set(type,(this.listeners.get(type)||[]).filter(f=>f!==fn));}
 fire(type,fields={}){const event={type,target:this,detail:{},preventDefault(){this.prevented=true;},stopPropagation(){},...fields};for(const fn of this.listeners.get(type)||[])fn(event);return event;}
 focus(){this.ownerDocument.activeElement=this;}
 getBoundingClientRect(){return {width:this.widthCSS||100,height:50,left:0,top:0,x:0,y:0};}
 contains(el){return el===this||this.children.some(child=>child.contains?.(el));}
 get nextElementSibling(){return this.parentElement.children[this.parentElement.children.indexOf(this)+1];}
}
function harness(){
 const doc=new Node('document'),root=new Node('section',{'data-ely-family':'native'}),win=new Node('window'),frames=new Map();let next=0;root.ownerDocument=doc;doc.defaultView=win;win.devicePixelRatio=1;win.getComputedStyle=()=>({colorScheme:'light',getPropertyValue:()=>''});win.requestAnimationFrame=function(fn){assert.equal(this,win);frames.set(++next,fn);return next;};win.cancelAnimationFrame=function(id){assert.equal(this,win);frames.delete(id);};
 doc.createElement=tag=>{const el=new Node(tag);el.ownerDocument=doc;return el;};doc.createTextNode=text=>{const el=new Node('#text');el.textContent=text;return el;};
 const add=(parent,tag,attrs={})=>{const el=doc.createElement(tag);for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);parent.append(el);return el;};const actions=[],changes=[];const start=(helpers={})=>initNativeTooling(root,(_,d)=>changes.push(d),(_,a,d)=>actions.push({action:a,...d}),helpers);
 return {root,doc,win,frames,add,actions,changes,start};
}
const stamps=[];let stats;for(let i=0;i<=120;i++)stats=frameStats(stamps,i*1000/60);assert.ok(Math.abs(stats.fps-60)<1e-8);assert.equal(stats.intervals.length,60);assert.deepEqual([16.9,33.3,50].map(missedFrames),[0,1,2]);
const rows=[];recordInput(rows,{kind:'move',message:'a'},0);recordInput(rows,{kind:'move',message:'b'},2);assert.equal(rows[0].count,2);recordInput(rows,{kind:'keydown'},3);recordInput(rows,{kind:'move'},4);assert.equal(rows[0].count,1);for(let i=0;i<60;i++)recordInput(rows,{kind:'keydown'},i);assert.equal(rows.length,50);
assert.deepEqual(rgba('#1234'),[17,34,51,68/255]);assert.equal(rgba('invalid'),null);
let seen;const contrast=(a,b)=>{seen=[a,b];return 5;};assert.deepEqual(contrastResult('#0008','#fff',4.5,contrast),{ratio:5,pass:true,grade:'AA'});assert.deepEqual(seen,['rgb(119,119,119)','rgb(255,255,255)']);assert.equal(contrastResult('#000','#fff8',3,contrast).grade,'Invalid');assert.equal(contrastResult('#000','#fff',3,()=>3).grade,'AA');assert.equal(contrastResult('#000','#fff',4.5,()=>7).grade,'AAA');assert.equal(contrastResult('#000','#fff',4.5,()=>4.49).pass,false);
const pixels=contourPixels(20,10,.2,[255,255,255],[0,0,0]);assert.equal(pixels.length,800);assert.equal(pixels[(5*20+4)*4],0);assert.equal(pixels[3],255);assert.notDeepEqual(pixels,contourPixels(20,10,.8,[255,255,255],[0,0,0]));assert.ok(validSurfaceFrame({width:20,height:10,pixels},20,10));assert.ok(!validSurfaceFrame({width:20,height:10,pixels:pixels.slice(1)},20,10));assert.ok(!validSurfaceFrame({width:1,height:1,pixels:[0,0,NaN,255]},1,1));
{
 const h=harness(),m=h.add(h.root,'input',{'data-tool-measure':'','type':'checkbox'}),panel=h.add(h.root,'div',{'data-tool-fps-panel':''});for(const key of ['value','worst','bars'])h.add(panel,'div',{['data-tool-fps-'+key]:''});const cleanup=h.start();assert.equal(h.frames.size,0);m.checked=true;m.fire('change');assert.equal(panel.hidden,false);for(const time of [0,16.667,33.334]){const [id,fn]=h.frames.entries().next().value;h.frames.delete(id);fn(time);}assert.equal(h.root.querySelector('[data-tool-fps-value]').textContent,'60');m.checked=false;m.fire('change');assert.equal(h.frames.size,0);cleanup();assert.equal(m.listeners.get('change').length,0);
}
{
 const h=harness(),page=h.add(h.root,'output',{'data-tool-render-count':'page','data-count':0}),view=h.add(h.root,'output',{'data-tool-render-count':'view','data-count':4}),redraw=h.add(h.root,'button',{'data-tool-redraw':'view'});const cleanup=h.start();assert.equal(page.textContent,'1');assert.equal(view.textContent,'5');redraw.fire('click');assert.equal(page.textContent,'1');assert.equal(view.textContent,'6');h.root.fire('ely:render',{detail:{key:'page'}});assert.equal(page.textContent,'2');cleanup();h.root.fire('ely:render');assert.equal(page.textContent,'2');
}
{
 const h=harness(),target=h.add(h.root,'div',{'data-tool-event-target':''}),log=h.add(h.root,'ol',{'data-tool-event-log':''});h.start();target.fire('pointermove',{clientX:5,clientY:6,timeStamp:100});target.fire('pointermove',{clientX:6,clientY:7,timeStamp:110});assert.equal(log.children.length,1);assert.equal(log.children[0].children[1].textContent,'move to 6, 7 ×2');target.fire('keydown',{key:'Shift',shiftKey:true,timeStamp:120});assert.equal(log.children[0].children[1].textContent,'modifiers shift');assert.equal(log.children[0].children[0].textContent,'+0.02s');
}
{
 const h=harness(),icons=h.add(h.root,'div',{'data-tool-icons':'','data-selected':'search','data-action':'pick'}),filter=h.add(icons,'input',{'data-tool-icon-filter':''}),search=h.add(icons,'button',{'data-tool-icon-option':'search'}),star=h.add(icons,'button',{'data-tool-icon-option':'star'}),arrow=h.add(icons,'button',{'data-tool-icon-option':'arrow-left'});h.add(icons,'span',{'data-tool-icon-preview':''});h.add(icons,'code',{'data-tool-icon-name':''});const empty=h.add(icons,'p',{'data-tool-icon-empty':''});h.start();assert.equal(search.attrs['aria-selected'],'true');filter.value='arrow left';filter.fire('input');assert.equal(arrow.hidden,false);assert.equal(search.hidden,true);icons.fire('keydown',{target:filter,key:'ArrowDown'});assert.equal(h.doc.activeElement,arrow);icons.fire('click',{target:arrow});assert.equal(h.actions[0].value,'arrow-left');assert.equal(arrow.attrs['aria-selected'],'true');filter.value='absent';filter.fire('input');assert.equal(empty.hidden,false);filter.value='';filter.fire('input');icons.fire('keydown',{target:search,key:'ArrowRight'});assert.equal(h.doc.activeElement,star);
}
{
 const h=harness(),button=h.add(h.root,'button',{'data-tool-host-action':'capture','data-value':'page'}),status=h.add(h.root,'output',{'data-tool-host-status':''});h.start();button.fire('click');assert.equal(status.textContent,'Waiting for host');assert.equal(h.actions[0].action,'capture');h.root.fire('ely:result',{detail:{action:'capture',requestId:0,result:{message:'stale'}}});assert.equal(status.textContent,'Waiting for host');h.root.fire('ely:error',{detail:{action:'capture',error:new Error('Denied')}});assert.equal(status.textContent,'Denied');button.fire('click');h.root.fire('ely:result',{detail:{action:'capture',requestId:2,result:{message:'Saved by host'}}});assert.equal(status.textContent,'Saved by host');
}
{
 const h=harness(),panel=h.add(h.root,'section',{'data-tool-playground':'ring','data-action':'preview'}),form=h.add(panel,'form'),range=h.add(form,'input',{'data-tool-knob':'number','type':'range','name':'value'});range.value='.62';h.add(form,'output');const percent=h.add(form,'input',{'data-tool-knob':'toggle','type':'checkbox','name':'percent'});percent.checked=true;const progress=h.add(panel,'div',{'role':'progressbar'}),fill=h.add(progress,'circle',{'data-tool-ring-fill':''});h.add(progress,'output');h.start();assert.equal(fill.style.strokeDasharray,'62 100');range.value='.25';form.fire('input',{target:range});assert.equal(progress.attrs['aria-valuenow'],'25');assert.deepEqual(h.actions[0].values,{value:.25,percent:true});
}
for(const field of [true,false]){
 const h=harness(),surface=h.add(h.root,'section',{'data-tool-surface':'','data-field':String(field),'data-ratio':'2','data-width':'720','data-place':'.2','data-action':'draw'}),canvas=h.add(surface,'canvas',{'data-tool-canvas':''}),status=h.add(surface,'output',{'data-tool-surface-status':''});canvas.widthCSS=20;let paints=0;canvas.getContext=()=>({createImageData:(w,v)=>({data:new Uint8ClampedArray(w*v*4)}),putImageData:()=>paints++});const cleanup=h.start();assert.equal(canvas.width,20);assert.equal(canvas.height,10);if(field){assert.equal(paints,1);h.win.fire('resize');assert.equal(paints,1);h.root.fire('ely:surface-revision',{detail:{revision:1}});assert.equal(paints,2);}else{assert.equal(paints,0);assert.equal(h.actions.length,1);h.win.fire('resize');assert.equal(h.actions.length,1);h.root.fire('ely:surface-frame',{detail:{requestId:0,width:20,height:10,pixels}});assert.equal(paints,0);h.root.fire('ely:surface-frame',{detail:{requestId:1,width:19,height:10,pixels}});assert.match(status.textContent,/invalid/);h.root.fire('ely:result',{detail:{requestId:1,result:{frame:{width:20,height:10,pixels}}}});assert.equal(paints,1);h.root.fire('ely:surface-request');assert.equal(h.actions.length,2);h.root.fire('ely:error',{detail:{action:'draw',error:new Error('Unavailable')}});assert.equal(status.textContent,'Unavailable');}cleanup();h.root.fire('ely:surface-revision',{detail:{revision:2}});assert.equal(paints,field?2:1);
}
console.log('native tooling: measurement, events, palette math, icons, counters, playground, host capture and cached surfaces passed');
{
 const h=harness(),summary=h.add(h.root,'output',{'data-tool-a11y-summary':''}),list=h.add(h.root,'div',{'data-tool-a11y-rows':''});
 const make=(front,need)=>{const row=h.add(list,'div',{'data-tool-a11y-row':'','data-front':front,'data-back':'#fff','data-need':need});for(const key of ['sample','ratio','grade'])h.add(row,'span',{['data-tool-a11y-'+key]:''});return row;};const pass=make('#000',4.5),fail=make('#777',4.5),invalid=make('not-color',3);const cleanup=h.start({contrast:(f)=>f==='rgb(0,0,0)'?21:4.4});assert.equal(summary.textContent,'2 of 3 fail');assert.deepEqual(list.children,[fail,invalid,pass]);assert.equal(pass.querySelector('[data-tool-a11y-grade]').textContent,'AAA');fail.dataset.front='#000';h.root.fire('ely:theme');assert.equal(summary.textContent,'1 of 3 fail');assert.deepEqual(list.children,[invalid,pass,fail]);cleanup();
}
{
 const h=harness(),scope=h.add(h.root,'div',{'data-tool-inspect-scope':''}),toggle=h.add(scope,'button',{'data-tool-inspect-toggle':''}),box=h.add(scope,'div',{'id':'caller'}),panel=h.add(h.root,'aside',{'data-tool-inspect-panel':''}),close=h.add(panel,'button',{'data-tool-inspect-close':''}),pick=h.add(panel,'button',{'data-tool-inspect-release':''});h.add(panel,'p',{'data-tool-inspect-hint':''});h.add(panel,'output',{'data-tool-inspect-title':''});h.add(panel,'dl',{'data-tool-inspect-facts':''});const highlight=h.add(h.root,'div',{'data-tool-inspect-highlight':''});for(const layer of ['margin','border','padding','content'])h.add(highlight,'i',{'data-tool-layer':layer});
 h.win.getComputedStyle=()=>({getPropertyValue:()=>'',margin:'12px',padding:'16px',borderWidth:'2px',display:'block',marginTop:'12px',marginRight:'12px',marginBottom:'12px',marginLeft:'12px',borderTopWidth:'2px',borderRightWidth:'2px',borderBottomWidth:'2px',borderLeftWidth:'2px',paddingTop:'16px',paddingRight:'16px',paddingBottom:'16px',paddingLeft:'16px'});const cleanup=h.start();toggle.fire('click');assert.equal(panel.hidden,false);assert.equal(h.doc.activeElement,close);scope.fire('pointermove',{target:box});assert.equal(highlight.hidden,false);assert.equal(highlight.querySelector('[data-tool-layer="content"]').style.width,'64px');scope.fire('click',{target:box});assert.equal(pick.hidden,false);assert.match(h.root.querySelector('[data-tool-inspect-hint]').textContent,/Held/);panel.fire('keydown',{key:'Tab'});assert.equal(h.doc.activeElement,pick);pick.fire('click');assert.equal(pick.hidden,true);h.doc.fire('keydown',{key:'Escape'});assert.equal(panel.hidden,true);assert.equal(highlight.hidden,true);assert.equal(h.doc.activeElement,toggle);cleanup();assert.equal(h.doc.listeners.get('keydown').length,0);
}
console.log('native tooling: contrast ordering/theme refresh and inspector hold/focus/Escape passed');

// Surface status text must not set an implicit minimum grid-track width. The
// real browser audit also verifies a 16px surface and unchanged-revision cache.
{
 const css=await (await import('node:fs/promises')).readFile(new URL('../../assets/ely-api-native-tooling.css',import.meta.url),'utf8');
 assert.match(css,/\.ely-tooling-surface\{[^}]*grid-template-columns:minmax\(0,1fr\)/);
 assert.match(css,/\.ely-tooling-surface canvas\{[^}]*min-width:0/);
}

// Source-derived defaults and real tooling resolution; CSS cascade/rendering is
// deliberately left to the browser checks, not simulated by this DOM boundary.
{
 const {readFile}=await import('node:fs/promises');
 const read=path=>readFile(new URL(path,import.meta.url),'utf8');
 const [api,native,interaction,theme,fixture]=await Promise.all([
  read('../../assets/ely-api.css'),read('../../assets/ely-api-native.css'),read('../../assets/ely-api-interaction.css'),read('../../assets/theme.js'),read('../../../../internal/gallery/advanced_native_tooling_fixtures.go')
 ]);
 assert.doesNotMatch(api,/(?:^|[;{])--info(?:-subtle)?:/,'No component or theme-boundary defaults may shadow inherited caller tokens');
 assert.match(api,/--color-info:var\(--focus\);--color-info-subtle:color-mix\(in srgb,var\(--focus\) 10%,var\(--color-paper\)\)/);
 assert.match(api,/--ring:var\(--focus\)/);assert.match(api,/--color-focus:var\(--focus\)/);
 const pairs=[...native.matchAll(/background:var\(--info-subtle,light-dark\((#[\da-f]{6}),(#[\da-f]{6})\)\);color:var\(--info,light-dark\((#[\da-f]{6}),(#[\da-f]{6})\)\)/gi)];
 assert.equal(pairs.length,2,'Both actual native badge declarations must retain mode-aware caller fallbacks');
 const info=fixture.match(/"info":\s*\{"(#[\da-f]{6})", "(#[\da-f]{6})"\}/i).slice(1);
 const subtle=fixture.match(/"info_subtle":\s*\{"(#[\da-f]{6})", "(#[\da-f]{6})"\}/i).slice(1);
 const feedback=interaction.match(/--feedback-tone:var\(--info,light-dark\((#[\da-f]{6}),(#[\da-f]{6})\)\)/i);
 assert(feedback);assert.deepEqual(feedback.slice(1),info);
 for(const pair of pairs){assert.deepEqual(pair.slice(1,3),subtle);assert.deepEqual(pair.slice(3,5),info);}
 const ratio=(front,back)=>{
  const luminance=color=>{const channels=rgba(color).slice(0,3).map(v=>{v/=255;return v<=.04045?v/12.92:((v+.055)/1.055)**2.4;});return channels[0]*.2126+channels[1]*.7152+channels[2]*.0722;};
  const a=luminance(front),b=luminance(back);return (Math.max(a,b)+.05)/(Math.min(a,b)+.05);
 };
 // Retained 919 historical negative: focus alias + the old native badge fill.
 const oldFocus=theme.match(/const elyLight = .*?focus:'(#[\da-f]{6})'/i)[1];
 assert(Math.abs(ratio(oldFocus,'#e8eef6')-4.196870539976671)<1e-10);
 assert.equal(contrastResult(oldFocus,'#e8eef6',4.5,ratio).pass,false);
 assert(Math.abs(ratio(oldFocus,subtle[0])-4.412634491394382)<1e-10);
 assert.equal(contrastResult(oldFocus,subtle[0],4.5,ratio).pass,false);
 for(const [index,mode] of ['light','dark'].entries())for(const custom of [false,true]){
  const h=harness(),summary=h.add(h.root,'output',{'data-tool-a11y-summary':''}),list=h.add(h.root,'div',{'data-tool-a11y-rows':''});
  const row=h.add(list,'div',{'data-tool-a11y-row':'','data-front':info[0],'data-dark-front':info[1],'data-back':subtle[0],'data-dark-back':subtle[1],'data-front-token':'--info','data-back-token':'--info-subtle','data-need':4.5});
  for(const key of ['sample','ratio','grade'])h.add(row,'span',{['data-tool-a11y-'+key]:''});
  const token=h.add(h.root,'div',{'data-tool-token':'','data-token':'--info','data-kind':'color','data-light':info[0],'data-dark':info[1]});h.add(token,'i');const out=h.add(token,'output');
  const overrides=custom?{'--info':'#777777','--info-subtle':'#ffffff'}:{};
  h.win.getComputedStyle=()=>({colorScheme:mode,getPropertyValue:key=>overrides[key]||''});
  const cleanup=h.start({contrast:ratio});
  const front=custom?overrides['--info']:pairs[0][index+3],back=custom?overrides['--info-subtle']:pairs[0][index+1];
  assert.equal(row.querySelector('[data-tool-a11y-sample]').style.color,front);
  assert.equal(row.querySelector('[data-tool-a11y-sample]').style.backgroundColor,back);
  assert.equal(out.textContent,front);assert.equal(token.querySelector('i').style.backgroundColor,front);
  assert.equal(row.dataset.pass,String(!custom));assert.equal(summary.textContent,custom?'1 of 1 fail':'All 1 pass');
  assert.equal(row.querySelector('[data-tool-a11y-ratio]').textContent,ratio(front,back).toFixed(2)+':1');
  assert.equal(contrastResult(front,back,4.5,ratio).pass,!custom);
  cleanup();
 }
 console.log('native tooling: source-derived semantic info defaults, retained red contrast, color-scheme-only modes and caller-token resolution passed; CSS cascade/browser support unverified');
}
