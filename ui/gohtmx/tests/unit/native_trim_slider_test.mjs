import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {chromium} from 'playwright';

// Exercise the real initializer and DOM propagation without a server or media source.
const browser=await chromium.launch({headless:true});
try {
 const page=await browser.newPage();
 const source=readFileSync(new URL('../../assets/ely-api-native-media.js',import.meta.url),'utf8');
 await page.setContent(`<main><fieldset><div data-native-video-player data-native-duration="90" data-native-position="34">
 <input data-native-seek><section data-native-video-strip data-native-duration="90" data-native-position="34" data-native-trim-start="12" data-native-trim-end="66" tabindex="0">
 <div data-native-strip-track style="width:900px;height:40px"><button data-native-trim-handle="start" role="slider">Start</button><button data-native-trim-handle="end" role="slider">End</button></div><output></output>
 </section></div></fieldset></main>`);
 await page.evaluate(async source=>{
  const {initNativeMedia}=await import('data:text/javascript;base64,'+source);
  window.root=document.querySelector('main');window.strip=document.querySelector('[data-native-video-strip]');
  window.changes=[];window.bubbled=0;
  window.cleanup=initNativeMedia(root,(_r,detail)=>changes.push(detail),()=>{});
  root.addEventListener('keydown',()=>bubbled++);
  window.key=(end,key)=>{const e=new KeyboardEvent('keydown',{key,bubbles:true,cancelable:true});strip.querySelector(`[data-native-trim-handle="${end}"]`).dispatchEvent(e);return e.defaultPrevented};
  window.state=()=>({trim:[strip.dataset.nativeTrimStart,strip.dataset.nativeTrimEnd],position:strip.dataset.nativePosition,player:document.querySelector('[data-native-video-player]').dataset.nativePosition,aria:[...strip.querySelectorAll('button')].map(n=>['aria-valuemin','aria-valuemax','aria-valuenow','aria-valuetext'].map(k=>n.getAttribute(k)))});
 },Buffer.from(source).toString('base64'));
 assert.deepEqual((await page.evaluate(()=>state())).aria,[['0','65','12','00:12'],['13','90','66','01:06']]);
 for(const [end,key,trim] of [
  ['start','ArrowRight',['13','66']],['start','ArrowLeft',['12','66']],
  ['end','ArrowLeft',['12','65']],['end','ArrowRight',['12','66']],
  ['start','ArrowUp',['13','66']],['start','ArrowDown',['12','66']],
  ['end','ArrowUp',['12','67']],['end','ArrowDown',['12','66']],
  ['start','Home',['0','66']],['start','End',['65','66']],['start','ArrowRight',['65','66']],
  ['end','Home',['65','66']],['end','ArrowLeft',['65','66']],['end','End',['65','90']],
  ['start','Home',['0','90']],['end','End',['0','90']],['end','ArrowRight',['0','90']],
 ]) {
  assert.equal(await page.evaluate(([end,key])=>window.key(end,key),[end,key]),true);
  const s=await page.evaluate(()=>state());assert.deepEqual(s.trim,trim,`${end} ${key}`);
  assert.equal(s.position,'34');assert.equal(s.player,'34');
  assert.deepEqual(s.aria[0].slice(0,3),['0',String(Number(trim[1])-1),trim[0]]);
  assert.deepEqual(s.aria[1].slice(0,3),[String(Number(trim[0])+1),'90',trim[1]]);
 }
 assert.equal(await page.evaluate(()=>bubbled),0,'trim keys must not reach playback ancestors');
 for(const [end,time] of [['start',20],['end',50]]) {
  await page.evaluate(([end,time])=>{
   const handle=strip.querySelector(`[data-native-trim-handle="${end}"]`),box=strip.querySelector('[data-native-strip-track]').getBoundingClientRect();
   handle.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true,clientX:box.left}));
   strip.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:box.left+box.width*time/90}));
   strip.dispatchEvent(new PointerEvent('pointerup',{bubbles:true}));
  },[end,time]);
 }
 let s=await page.evaluate(()=>state());assert.deepEqual(s.trim,['20','50']);assert.deepEqual(s.aria,[['0','49','20','00:20'],['21','90','50','00:50']]);
 assert.equal(s.position,'34');assert.equal(s.player,'34');
 await page.keyboard.press('ArrowLeft');
 s=await page.evaluate(()=>state());assert.deepEqual(s.trim,['20','49']);assert.deepEqual(s.aria,[['0','48','20','00:20'],['21','90','49','00:49']]);
 await page.locator('[data-native-trim-handle="start"]').focus();await page.keyboard.press('ArrowRight');
 s=await page.evaluate(()=>state());assert.deepEqual(s.trim,['21','49']);assert.deepEqual(s.aria,[['0','48','21','00:21'],['22','90','49','00:49']]);
 assert.equal(s.position,'34');assert.equal(s.player,'34');
 for(const mode of ['fieldset','aria']) {
  await page.evaluate(mode=>{if(mode==='fieldset')document.querySelector('fieldset').disabled=true;else root.setAttribute('aria-disabled','true')},mode);
  await page.evaluate(()=>{key('start','End');key('end','Home');const h=strip.querySelector('button');h.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,cancelable:true}));strip.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:0}))});
  assert.deepEqual(await page.evaluate(()=>state()),s,`${mode} disabled blocks trim and playback`);
  await page.evaluate(()=>{document.querySelector('fieldset').disabled=false;root.removeAttribute('aria-disabled')});
 }
 assert.equal(await page.evaluate(()=>changes.some(d=>'seek' in d)),false,'trim must emit trim changes only');
 await page.evaluate(()=>cleanup());
 const count=await page.evaluate(()=>changes.length);
 await page.evaluate(()=>{key('start','End');key('end','Home');strip.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}));strip.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:0}));root.dispatchEvent(new CustomEvent('ely:media-state',{detail:{position:0}}))});
 assert.deepEqual(await page.evaluate(()=>state()),s);assert.equal(await page.evaluate(()=>changes.length),count);
 console.log('Native trim sliders: both handles, arrows/Home/End, pointer ARIA, bounds, disabled, playback isolation, and cleanup passed.');
} finally {await browser.close()}
