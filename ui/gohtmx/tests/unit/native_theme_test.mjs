import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {readTheme, updateThemeToken, motionPosition, localizedMessages, formatLocaleNumber, formatLocaleDate, initNativeTheme} from '../../assets/ely-api-native-theme.js';

const caller = '--caller-space: 7px;\n--bg: #010203;\n--surface: #334455;\n--fg: #abcdef;';
assert.equal(updateThemeToken(caller, '--bg', '#fafafa'), caller.replace('#010203','#fafafa'));
assert.equal(updateThemeToken('--fg: #abc', '--bg', '#fff'), '--fg: #abc;\n--bg: #fff;');
assert.equal(updateThemeToken('--bg: #000; --bg: #111;', '--bg', '#fff'), '--bg: #fff; --bg: #fff;');
assert.throws(()=>updateThemeToken(caller,'--bg;bad','#fff'));
assert.throws(()=>updateThemeToken(caller,'--bg','url(https://example.test)'));

const theme = readTheme(`{
  // VS Code JSONC
  "name":"https://example.test/a,}", "type":"dark",
  "colors":{"editor.background":"#101820","focusBorder":"#4a90e2aa","widget.shadow":"#0008","terminal.ansiRed":"#ff5555",},
  "tokenColors":[
    {"scope":"storage","settings":{"foreground":"#111111"}},
    {"scope":"keyword","settings":{"foreground":"#222222"}},
    {"scope":["string","string.quoted"],"settings":{"foreground":"#9ece6a"}},
  ],
}`,caller);
assert.equal(theme.name,'https://example.test/a,}');
assert.equal(theme.mode,'dark');
assert.equal(theme.colors.bg,'#101820');
assert.equal(theme.colors.shadow,'#0008');
assert.equal(theme.syntax.keyword,'#222222');
assert.equal(theme.syntax.string,'#9ece6a');
assert.equal(theme.ansi[1],'#ff5555');
assert.ok(theme.tokens.includes('--caller-space: 7px;'));
assert.ok(theme.tokens.includes('--surface: #334455;'));
assert.ok(theme.tokens.includes('--fg: #abcdef;'));
assert.ok(theme.tokens.includes('--syntax-keyword: #222222;'));
assert.ok(theme.kept.includes('surface') && !theme.named.includes('surface'));
assert.equal(caller,'--caller-space: 7px;\n--bg: #010203;\n--surface: #334455;\n--fg: #abcdef;');
for (const bad of ['', 'null','[]','{}','{"type":"sepia","colors":{}}','{"type":"dark"}',
  '{"type":"dark","colors":{"editor.background":"blue"}}',
  '{"type":"dark","colors":[],"tokenColors":[]}',
  '{"type":"dark","colors":{},"tokenColors":{}}',
  '{"type":"dark","colors":{},"tokenColors":[{"scope":"keyword","settings":{"foreground":"bad"}}]}',
  '{"type":"dark","colors":{"__proto__":{}}}',
  '{"type":"dark","colors":{},/*', ' '.repeat(1048577)]) assert.throws(()=>readTheme(bad,caller),bad.slice(0,100));
assert.equal(readTheme('{"type":"hc-light","colors":{}}').mode,'light');
assert.equal(readTheme('{"type":"hc-black","colors":{}}').mode,'dark');
assert.equal(readTheme('{"type":"light","colors":{}}',caller).tokens,caller);

for(const curve of ['ease-out','ease-in-out','spring']){
  assert.equal(motionPosition(curve,0),0);
  assert.equal(motionPosition(curve,1),1);
}
assert.equal(motionPosition('ease-out',.5),.875);
assert.equal(motionPosition('ease-in-out',.5),.5);
const peak=Math.max(...Array.from({length:101},(_,i)=>motionPosition('spring',i/100)));
assert.ok(peak>1.01 && peak<1.05);
assert.ok(Math.abs(motionPosition('spring',.95)-1)<.01);

const catalogs={'en-US':{hello:'Welcome {name}',files:'{count} files'},'de-DE':{hello:'Willkommen {name}',files:'{count} Dateien'}};
const messages=[{key:'hello',args:{name:'<Ada>'}},{key:'files',args:{count:{number:1204,decimals:0}}}];
assert.deepEqual(localizedMessages(catalogs,'de-DE',messages),['Willkommen <Ada>','1.204 Dateien']);
assert.deepEqual(localizedMessages(catalogs,'en-US',messages),['Welcome <Ada>','1,204 files']);
assert.throws(()=>localizedMessages(catalogs,'ja-JP',messages));
assert.throws(()=>localizedMessages(catalogs,'en-US',[{key:'missing',args:{}}]));
assert.throws(()=>localizedMessages(catalogs,'en-US',[{key:'hello',args:{}}]));
assert.throws(()=>localizedMessages({'en-US':{hello:'{name'},'de-DE':{hello:'{name'}},'en-US',messages));
assert.throws(()=>localizedMessages({...catalogs,'fr-FR':{hello:'Salut'}},'en-US',messages));
assert.throws(()=>localizedMessages(catalogs,'en-US',[{key:'files',args:{count:{number:Infinity}}}]));
const tags=['en-US','en-GB','de-DE','fr-FR','ja-JP','zh-CN','he-IL'];
const dates=['9/1/26','01/09/2026','01.09.26','01/09/2026','2026/09/01','2026/9/1','1.9.2026'];
tags.forEach((locale,index)=>{
  assert.equal(formatLocaleDate('2026-09-01T00:00:00Z',locale),dates[index]);
  assert.equal(formatLocaleNumber('-1234567.891',locale),new Intl.NumberFormat(locale,{minimumFractionDigits:2,maximumFractionDigits:2}).format(-1234567.891).replace('-', '\u2212'));
});
assert.equal(formatLocaleNumber('0','en-US',0),'0');
assert.equal(formatLocaleNumber('1234.00001','en-US',5),'1,234.00001');
assert.equal(formatLocaleDate('2026-09-01T00:00:00Z','en-US','America/Los_Angeles'),'8/31/26');
assert.throws(()=>formatLocaleNumber('NaN','en-US'));
assert.throws(()=>formatLocaleNumber(1,'en-US',-1));
assert.throws(()=>formatLocaleDate('invalid','en-US'));

// DOM boundary with real EventTarget: exercise initialization, repeated changes, and cleanup.
class Element extends EventTarget {
  dataset={}; nodes={}; classList={contains:()=>false};
  style={setProperty:(name,value)=>{this[name]=value;},getPropertyValue:name=>this[name]||''};
  querySelectorAll(selector){return this.nodes[selector]||[];}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
}
const root=new Element(),palette=new Element(),toggle=new Element(),swatch=new Element(),rtl=new Element(),error=new Element();
swatch.dataset={nativeStandardColor:'#112233',nativeSafeColor:'#abcdef'};
palette.nodes={'[data-native-color-safe]':[toggle],'[data-native-standard-color]':[swatch]};
rtl.dataset.locale='en-US';rtl.nodes={'[data-native-locale-error]':[error]};
root.nodes={'.ely-native-color-safe':[palette],'[data-native-locale-scope]':[rtl]};
const skip=new Element(),target=new Element();
skip.closest=()=>({querySelector:()=>target});target.focus=()=>{target.focused=true;};
root.nodes['.ely-native-skip-link']=[skip];
toggle.checked=true;
const cleanup=initNativeTheme(root,()=>{},()=>{});
const click=new Event('click',{cancelable:true});skip.dispatchEvent(click);assert.ok(target.focused);assert.ok(click.defaultPrevented);
assert.equal(swatch.dataset.nativeSwatch,'#abcdef');
toggle.checked=false;toggle.dispatchEvent(new Event('change'));
assert.equal(swatch.dataset.nativeSwatch,'#112233');
assert.equal(swatch['--native-swatch'],'#112233');
const localeEvent=locale=>{const event=new Event('ely:locale');event.detail={locale};root.dispatchEvent(event);};
localeEvent('he-IL');assert.equal(rtl.dir,'rtl');
localeEvent('en-US');assert.equal(rtl.dir,'ltr');
localeEvent('!invalid');assert.equal(rtl.dataset.locale,'en-US');assert.ok(error.textContent);
cleanup();toggle.checked=true;toggle.dispatchEvent(new Event('change'));assert.equal(swatch.dataset.nativeSwatch,'#112233');
console.log('Native theme/i18n: tokens, imports, curves, catalogs, source formats, palette restoration, RTL, and cleanup passed.');

// Run the registered gallery checks against DOM boundaries without Array-only NodeList methods.
const galleryChecks=new Map();
const gallerySource=readFileSync(new URL('../../../../internal/gallery/assets/advanced-native-checks.js',import.meta.url),'utf8');
runInNewContext(gallerySource.replace(/^import[^\n]*\n/,''),{
  Event,
  registerChecks:(_family,checks)=>Object.entries(checks).forEach(([key,check])=>galleryChecks.set(key,check)),
  assert:(condition,message)=>assert.ok(condition,message),
});
const sourceRoles={Surfaces:['bg','surface','sunken','hover','active','border','border strong'],Ink:['fg','muted','subtle','disabled','focus','link']};
const sourceColors={Surfaces:{light:['#FCFAF7','#FFFFFF','#F6F4F1','#F2F0ED','#E9E7E5','#E1DFDD','#CCCAC8'],dark:['#252525','#2C2C2C','#202020','#383838','#3F3F3F','#3F3F3F','#555555']},Ink:{light:['#181613','#605D5A','#696764','#ACAAA8','#3772BB','#2863AB'],dark:['#F3F1F0','#C4C2C0','#ACAAA8','#5C5A58','#69A1E8','#7EB1F3']}};
for(const kind of ['Surfaces','Ink'])for(const mode of ['light','dark']){
 const page=new Element(),r=new Element(),swatches=new Element();page.dataset.theme=mode;r.parentElement=page;r.dataset={elyComponent:kind==='Surfaces'?'theme/ColorTokens':'theme/Ink',elyKind:kind};
 const chips=sourceColors[kind][mode].map(color=>{const chip=new Element();chip.dataset.nativeSwatch=color;chip.style.setProperty('--native-swatch',color);return chip;});
 swatches.nodes={'figure':chips,'[data-native-swatch]':chips,figcaption:sourceRoles[kind].map(textContent=>({textContent}))};r.nodes={'.ely-native-theme-swatches':[swatches]};
 const check=galleryChecks.get('theme/'+kind);await check({root:r});
 chips[0].dataset.nativeSwatch=sourceColors[kind][mode==='dark'?'light':'dark'][0];await assert.rejects(async()=>check({root:r}),/current source palette/);chips[0].dataset.nativeSwatch=sourceColors[kind][mode][0];
 swatches.nodes.figcaption[0].textContent='wrong';await assert.rejects(async()=>check({root:r}),/source order/);swatches.nodes.figcaption[0].textContent=sourceRoles[kind][0];
 chips.pop();await assert.rejects(async()=>check({root:r}),/canonical roles/);
}
const sizes=['display','heading','title','subtitle','body-lg','body','small','caption'];
const typeRows=sizes.map(size=>({dataset:{nativeTypeSize:size}}));
const typeRoot={dataset:{elyComponent:'theme/Type',elyKind:'Type'},querySelector:()=>null,querySelectorAll:()=>Object.assign({length:typeRows.length},typeRows)};
await galleryChecks.get('theme/Type')({root:typeRoot});
typeRows.splice(6,1);
await assert.rejects(()=>galleryChecks.get('theme/Type')({root:typeRoot}),/eight ordered source specimens/);
typeRows.splice(6,0,{dataset:{nativeTypeSize:'caption'}});
await assert.rejects(()=>galleryChecks.get('theme/Type')({root:typeRoot}),/eight ordered source specimens/);
console.log('Native gallery: ColorTokens alias, NodeList type rows, and malformed-fixture rejection passed.');

// Active/local theme changes affect only rows with explicit mode variants.
{
 const page=new Element(),local=new Element(),other=new Element();page.dataset.theme='dark';local.parentElement=page;other.parentElement=page;other.dataset.theme='light';
 const source=new Element(),fixed=new Element(),nested=new Element(),signal=new Element(),syntax=new Element();
 source.dataset={nativeColorLight:'#FCFAF7',nativeColorDark:'#252525',nativeSwatch:'#FCFAF7'};nested.dataset={...source.dataset};fixed.dataset={nativeSwatch:'#123456'};
 signal.dataset={nativeColorLight:'#267B4C',nativeColorDark:'#6BBC89',nativeQuietLight:'#E7F9EC',nativeQuietDark:'#182C1F',nativeSignalStrong:'#267B4C'};syntax.dataset={nativeColorLight:'#714CA6',nativeColorDark:'#BBA3E8',nativeSyntaxColor:'#714CA6'};
 local.nodes={'[data-native-color-dark]':[source,signal,syntax],'[data-native-swatch]':[source,fixed]};other.nodes={'[data-native-color-dark]':[nested]};
 const doc=new Element(),observers=[];doc.defaultView={MutationObserver:class {constructor(fn){this.fn=fn;observers.push(this);}observe(){}disconnect(){this.closed=true;}}};local.ownerDocument=doc;other.ownerDocument=doc;
 const end=initNativeTheme(local,()=>{},()=>{}),endOther=initNativeTheme(other,()=>{},()=>{});
 assert.equal(source.dataset.nativeSwatch,'#252525');assert.equal(nested.dataset.nativeSwatch,'#FCFAF7');assert.equal(fixed.dataset.nativeSwatch,'#123456');assert.equal(signal['--native-signal-quiet'],'#182C1F');assert.equal(syntax.style.color,'#BBA3E8');
 page.dataset.theme='light';doc.dispatchEvent(new Event('ely:theme-change'));assert.equal(source.dataset.nativeSwatch,'#FCFAF7');assert.equal(signal.dataset.nativeSignalStrong,'#267B4C');
 local.dataset.theme='dark';observers[0].fn();assert.equal(source.dataset.nativeSwatch,'#252525');assert.equal(nested.dataset.nativeSwatch,'#FCFAF7');assert.equal(page.dataset.theme,'light');
 end();endOther();assert.ok(observers.every(o=>o.closed));local.dataset.theme='light';local.dispatchEvent(new Event('ely:theme'));assert.equal(source.dataset.nativeSwatch,'#252525');
}
{
 const page=new Element();page.dataset.theme='dark';const r=new Element();r.parentElement=page;
 const pal=new Element(),toggle=new Element(),chip=new Element();chip.dataset={nativeStandardLight:'#5182C1',nativeStandardDark:'#79A7E2',nativeSafeLight:'#0240B1',nativeSafeDark:'#3471E3',nativeStandardColor:'#5182C1',nativeSafeColor:'#0240B1'};pal.nodes={'[data-native-color-safe]':[toggle],'[data-native-standard-color]':[chip]};r.nodes={'.ely-native-color-safe':[pal]};const stop=initNativeTheme(r,()=>{},()=>{});assert.equal(chip.dataset.nativeSwatch,'#79A7E2');toggle.checked=true;toggle.dispatchEvent(new Event('change'));assert.equal(chip.dataset.nativeSwatch,'#3471E3');page.dataset.theme='light';r.dispatchEvent(new Event('ely:theme'));assert.equal(chip.dataset.nativeSwatch,'#0240B1');stop();
}
{
 const oldCSS=globalThis.CSS;globalThis.CSS={supports:()=>true};
 try{
 const page=new Element();page.dataset.theme='dark';const r=new Element();r.parentElement=page;const form=new Element(),preview=new Element(),error=new Element(),tokens=new Element(),color=new Element(),callerColor=new Element();
 tokens.value='--bg: #FCFAF7;\n--caller-ink: #123456;';tokens.matches=()=>false;color.dataset={nativeThemeColor:'--bg',nativeThemeLight:'#FCFAF7',nativeThemeDark:'#252525'};color.matches=s=>s==='[data-native-theme-color]';color.previousElementSibling=new Element();callerColor.dataset={nativeThemeColor:'--caller-ink'};callerColor.previousElementSibling=new Element();
 form.elements={tokens,density:{value:'standard'},radius:{value:'1'},fontScale:{value:'1'},highContrast:{checked:false},reducedMotion:{checked:false}};
 form.nodes={'[data-native-theme-error]':[error],'[data-native-theme-preview]':[preview],'[data-native-theme-color]':[color,callerColor],'[data-native-theme-dark]':[color]};r.nodes={'.ely-native-theme-editor':[form]};const changes=[],stop=initNativeTheme(r,(_,detail)=>changes.push(detail),()=>{});
 assert.equal(color.value,'#252525');assert.equal(callerColor.value,'#123456');assert.equal(preview.style.backgroundColor,'#252525');assert.equal(page.dataset.theme,'dark');assert.equal(page['--bg'],undefined);
 color.value='#abcdef';const event=new Event('input');Object.defineProperty(event,'target',{value:color});form.dispatchEvent(event);assert.ok(tokens.value.includes('--bg: #abcdef'));assert.equal(changes.at(-1).draft.tokens,tokens.value);
 page.dataset.theme='light';r.dispatchEvent(new Event('ely:theme'));assert.equal(color.value,'#abcdef','Mode change overwrote local draft edit');assert.equal(callerColor.value,'#123456');assert.equal(page['--bg'],undefined);stop();
 }finally{globalThis.CSS=oldCSS;}
}
console.log('Native theme: dark/page/local palette updates, explicit caller colors, editor draft isolation, and cleanup passed.');

// Execute the same browser palette contract against the real module in both page modes.
{
 const normal={light:['#5182C1','#009589','#AA732B','#B8636B','#8572BB','#539156','#B66946','#138DB1'],dark:['#79A7E2','#4EB9AD','#CD995C','#DC8A90','#A998DD','#7CB57D','#D9906F','#56B2D4']};
 const safe={light:['#0240B1','#08A399','#CD8017','#844954','#A276E3','#184606','#B84F10','#20789D'],dark:['#3471E3','#57B6B2','#F6A537','#DE545A','#9D8DEC','#C4ECB7','#FFD93D','#52DAFE']};
 for(const mode of ['light','dark'])for(const checked of [false,true]){
  const page=new Element();page.dataset.theme=mode;
  const make=()=>{const r=new Element(),pal=new Element(),toggle=new Element();r.parentElement=page;toggle.checked=checked;
   const chips=normal.light.map((color,i)=>{const chip=new Element();chip.dataset={nativeStandardColor:color,nativeSafeColor:safe.light[i],nativeStandardLight:color,nativeStandardDark:normal.dark[i],nativeSafeLight:safe.light[i],nativeSafeDark:safe.dark[i]};chip.getBoundingClientRect=()=>({width:40});return chip;});
   pal.nodes={'[data-native-color-safe]':[toggle],'[data-native-standard-color]':chips};r.nodes={'.ely-native-color-safe':[pal],'[data-native-color-safe]':[toggle],'[data-native-swatch]':chips};return {r,toggle,chips,stop:initNativeTheme(r,()=>{},()=>{})};};
  const first=make(),second=make(),check=galleryChecks.get('i18n/ColorBlindSafe Palette');
  await check({root:first.r,twin:second.r});assert.equal(first.r.dataset.theme,undefined);assert.equal(first.toggle.checked,checked);assert.equal(page.dataset.theme,mode);
  assert.deepEqual(first.chips.map(chip=>chip.dataset.nativeSwatch),(checked?safe:normal)[mode]);
  first.chips[7].dataset.nativeSwatch='#000000';await assert.rejects(async()=>check({root:first.r,twin:second.r}),/Initial chart colors/);
  first.stop();second.stop();
 }
}
console.log('Native gallery theme checks: exact active palettes, all safe hues, mode/toggle restoration, and sibling isolation passed.');
