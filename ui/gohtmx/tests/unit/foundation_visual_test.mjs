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
const css=readFileSync('ui/gohtmx/assets/ely-api-foundation.css','utf8');
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
