import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
// Browser registration boundary only; clipboard operations themselves are real module code.
globalThis.Element=class {};
globalThis.document={addEventListener(){},querySelectorAll(){return []},documentElement:{}};
globalThis.MutationObserver=class {observe(){}};
const {foundationClipboard}=await import('../../assets/ely-api-foundation.js');
let stored='caller input';
const clipboard={async readText(){return stored},async writeText(value){stored=value}};
assert.deepEqual(await foundationClipboard('read','',clipboard),{ok:true,value:'caller input'});
assert.deepEqual(await foundationClipboard('write','1234567.8900',clipboard),{ok:true,value:'1234567.8900'});
assert.equal(stored,'1234567.8900');
assert.equal((await foundationClipboard('read','',{readText(){throw Error('denied')}})).ok,false);
assert.equal((await foundationClipboard('write','kept',undefined)).value,'kept');
// Native details emits non-bubbling toggle, not change; exercise the actual handler.
const foundationSource=readFileSync('ui/gohtmx/assets/ely-api-foundation.js','utf8');
assert.match(foundationSource,/root\.addEventListener\('toggle', onToggle, true\)/);
assert.match(foundationSource,/root\.removeEventListener\('toggle', onToggle, true\)/);
const toggleBody=foundationSource.slice(foundationSource.indexOf('  const onToggle = event => {'),foundationSource.indexOf('  const onChange = event => {'));
assert(toggleBody.startsWith('  const onToggle ='));
const disclosureRoot={},events=[];
const onToggle=new Function('root','emit',`${toggleBody};return onToggle;`)(disclosureRoot,(_root,action,detail)=>events.push({action,...detail}));
const disclosure=(open,owner=disclosureRoot)=>({open,matches:selector=>selector==='details',closest:selector=>selector==='[data-ely-family]'?owner:null});
const plain=disclosure(true);onToggle({target:plain});plain.open=false;onToggle({target:plain});
assert.deepEqual(events,[{action:'change',open:true},{action:'change',open:false}]);events.length=0;
const first=disclosure(true),second=disclosure(true),accordion={querySelectorAll:()=>[first,second]};
second.closest=selector=>selector==='[data-ely-family]'?disclosureRoot:accordion;
onToggle({target:second});assert.equal(first.open,false);assert.equal(second.open,true);
assert.deepEqual(events,[{action:'change',open:true}]);events.length=0;
onToggle({target:disclosure(true,{})});onToggle({target:{matches:()=>false}});
assert.deepEqual(events,[],'nested family and non-details toggle must be ignored');
assert.doesNotMatch(foundationSource.slice(foundationSource.indexOf('  const onChange ='),foundationSource.indexOf('  const setSplit =')),/closest\('details'\)/,'native disclosure must not rely on synthetic change');
const css=readFileSync('ui/gohtmx/assets/ely-api-foundation.css','utf8');
assert.match(css,/\.ely-foundation__scrollbar \[data-foundation-scrollbar\][^}]*inset-inline:\.125rem;inset-block-end:\.125rem;inline-size:calc\(100% - \.25rem\);block-size:\.5rem[^}]*writing-mode:vertical-lr;direction:ltr;/,'native range scrollbar occupies the right edge with top-to-bottom range direction');
assert.match(css,/\.ely-foundation__scroll-well \[data-foundation-scrollbar\]\{min-inline-size:0;max-block-size:8px;/,'native vertical range caps its physical width on the block axis');
assert.doesNotMatch(css,/appearance:slider-vertical/,'non-standard vertical slider appearance must not emit browser console warnings');
assert.match(css,/\[data-ely-family='foundation'\] \.ely-foundation__section-items span,\[data-ely-family='foundation'\] fieldset span\{padding:\.4rem \.5rem;border:1px solid var\(--border,#777\);border-radius:\.25rem\}/);
assert.doesNotMatch(css,/,fieldset span\{/,'foundation chip styling must not leak into other families');
// Guard the explicit resets required to beat the older element/nth-child selectors.
assert.match(css,/\.ely-foundation__layers \[data-foundation-layer\]:nth-child\(n\)\{[^}]*translate:none/);
assert.match(css,/\.ely-foundation__scroll-well>\.ely-foundation__scroll\{max-block-size:none;padding:0;border:0\}/);
assert.match(css,/\.ely-foundation__icons \.ely-foundation__icon\{[^}]*mask-size:16px/);
const shell=readFileSync('ui/gohtmx/assets/ely-api-native.css','utf8');
assert.match(shell,/button:is\(\[data-shell-download\],\[data-shell-restart\],\[data-shell-send-report\]\)\{background:var\(--color-primary,var\(--primary\)\);color:var\(--color-primary-foreground,var\(--on-accent\)\)/);
// Actual source theme values: paired primary roles must contrast in both modes.
const theme=readFileSync('ui/gohtmx/assets/input.css','utf8');
const pairs=[...theme.matchAll(/--color-accent:\s*(#[\da-f]{6});/gi)].map(m=>m[1]);
const inks=[...theme.matchAll(/--on-accent:\s*(#[\da-f]{6});/gi)].map(m=>m[1]);
const luminance=hex=>hex.slice(1).match(/../g).map(x=>parseInt(x,16)/255).map(x=>x<=.04045?x/12.92:((x+.055)/1.055)**2.4).reduce((sum,x,i)=>sum+x*[.2126,.7152,.0722][i],0);
assert(pairs.length>=2&&inks.length>=2);
for(let i=0;i<2;i++){const a=luminance(pairs[i]),b=luminance(inks[i]);assert((Math.max(a,b)+.05)/(Math.min(a,b)+.05)>=7,'shell primary contrast');}
console.log('foundation visual/clipboard and shell contrast contracts passed');
