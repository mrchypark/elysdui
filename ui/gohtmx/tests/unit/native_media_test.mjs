import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parseTime,stamp,fitImage,holdImage,zoomAbout,fitCrop,dragCrop,validCrop,trimEnd,resample,speaker,validMarks,markDistance,initNativeMedia} from '../../assets/ely-api-native-media.js';
for(const [value,n] of [['00:02.000',2],['1:02:03.004',3723.004],['90:03.1',5403.1],['00:34',34]])assert.equal(parseTime(value),n);
for(const value of ['00:60','1:60:00','-1:00','1:x','00:01.1234','Infinity','1'])assert.equal(parseTime(value),null);
assert.equal(stamp(3723.004),'1:02:03.004');assert.equal(stamp(34),'00:34.000');
assert.equal(fitImage([960,640],[640,406]),406/640);assert.equal(fitImage([10,10],[640,400]),1);
assert.deepEqual(holdImage([100,-200],[800,600],[640,400]),[80,-100]);assert.deepEqual(zoomAbout([0,0],[10,20],1,2),[-10,-20]);
const source={x:.12,y:.1,width:.7,height:.75},square=fitCrop(source,1,1.5);
assert.ok(Math.abs(square.width/square.height-2/3)<1e-12);assert.ok(validCrop(square));assert.equal(square.y,.1);
const moved=dragCrop(source,'',10,-10);assert.ok(Math.abs(moved.x-.3)<1e-12);assert.equal(moved.y,0);assert.equal(moved.width,.7);
const half={x:.25,y:.25,width:.5,height:.5};assert.deepEqual(dragCrop(half,'n',0,-.1,1),half);
const bigger=dragCrop(half,'se',0,.2,1);assert.ok(Math.abs(bigger.width-.7)<1e-12);assert.ok(Math.abs(bigger.height-.7)<1e-12);
for(const grip of ['nw','n','ne','e','se','s','sw','w',''])for(const delta of [-10,-.1,0,.1,10])assert.ok(validCrop(dragCrop(half,grip,delta,delta)));
assert.deepEqual(trimEnd([12,66],'start',89,90),[65,66]);assert.deepEqual(trimEnd([45,66],'end',45,90),[45,46]);assert.deepEqual(trimEnd([12,66],'end',100,90),[12,90]);
assert.deepEqual(resample([.1,.9,.3,.2],2),[.9,.3]);assert.deepEqual(resample([.4,.8],4),[.4,.4,.8,.8]);
assert.deepEqual([0,.1,.5,.9].map(v=>speaker(v,false)),['volume-x','volume','volume-1','volume-2']);assert.equal(speaker(.7,true),'volume-x');
const marks=[{tool:'rectangle',from:[.52,.18],to:[.9,.86],color:0},{tool:'arrow',from:[.2,.3],to:[.36,.52],color:2},{tool:'pin',at:[.3,.72],color:1}];assert.ok(validMarks(marks));assert.equal(validMarks([{...marks[0],color:4}]),false);assert.equal(validMarks([{...marks[0],from:[-1,0]}]),false);assert.equal(markDistance(marks[0],[.52,.3],[560,373]),0);assert.equal(markDistance(marks[2],[.3,.72],[560,373]),0);

// Real EventTarget dispatch, with only the DOM/media boundary supplied locally.
class Element extends EventTarget {
 dataset={};nodes={};attributes={};style={setProperty(k,v){this[k]=v}};value='';textContent='';hidden=false;
 querySelectorAll(s){return this.nodes[s]||[]} querySelector(s){return this.querySelectorAll(s)[0]||null}
 getAttribute(k){return this.attributes[k]??null} setAttribute(k,v){this.attributes[k]=v} hasAttribute(k){return k in this.attributes}
 closest(){return null} focus(){} removeAttribute(k){delete this.attributes[k]}
}
const root=new Element(),player=new Element(),play=new Element(),glyph=new Element(),seek=new Element(),now=new Element(),remaining=new Element(),status=new Element(),changes=[];
root.nodes={'[data-native-video-player],[data-native-audio-player]':[player]};player.dataset={nativeDuration:'222',nativePosition:'64',playing:'false',speed:'1'};player.nodes={'[data-native-play],[data-native-transport-action="play"]':[play],'[data-native-seek]':[seek],'[data-native-current-time]':[now],'[data-native-remaining-time]':[remaining],'[data-native-status]':[status]};play.nodes={'[data-native-icon]':[glyph]};
let cleanup=initNativeMedia(root,(_r,d)=>changes.push(d),()=>{});
const host=detail=>{const e=new Event('ely:media-state');e.detail=detail;root.dispatchEvent(e)};
assert.equal(now.textContent,'01:04');assert.equal(remaining.textContent,'−02:38');seek.value='500';seek.dispatchEvent(new Event('input'));assert.equal(player.dataset.nativePosition,'111');assert.deepEqual(changes.at(-1),{seek:111});
host({position:34.125,playing:true});assert.equal(player.dataset.nativePosition,'34.125');assert.equal(play.getAttribute('aria-label'),'Pause');host({position:999,playing:false});assert.equal(player.dataset.nativePosition,'222');cleanup();host({position:0});assert.equal(player.dataset.nativePosition,'222','cleanup must remove host subscription');
const volumeRoot=new Element(),volume=new Element(),range=new Element(),mute=new Element(),volumeGlyph=new Element();volumeRoot.nodes={'[data-native-volume-control]':[volume]};volume.dataset={nativeLevel:'.7',nativeMuted:'true'};volume.nodes={'[data-native-volume]':[range],'[data-native-volume-mute]':[mute]};mute.nodes={'[data-native-volume-glyph]':[volumeGlyph]};cleanup=initNativeMedia(volumeRoot,(_r,d)=>changes.push(d),()=>{});assert.equal(range.value,'0');mute.dispatchEvent(new Event('click'));assert.equal(range.value,'0.7','initial muted value must survive unmute');range.value='0';range.dispatchEvent(new Event('input'));assert.equal(volume.dataset.nativeMuted,'false','zero volume is distinct from muted');mute.dispatchEvent(new Event('click'));mute.dispatchEvent(new Event('click'));assert.equal(range.value,'0','explicit zero must survive mute cycle');cleanup();
// An actual URL delegates playback to the media boundary; metadata does not erase caller position.
const media=new Element();media.attributes.src='/caller.wav';media.duration=222;media.currentTime=0;media.paused=true;media.playbackRate=1;media.readyState=1;media.play=async()=>{media.paused=false;media.dispatchEvent(new Event('play'))};media.pause=()=>{media.paused=true;media.dispatchEvent(new Event('pause'))};root.nodes['[data-native-media]']=[media];player.dataset.nativePosition='64.125';cleanup=initNativeMedia(root,(_r,d)=>changes.push(d),()=>{});media.dispatchEvent(new Event('loadedmetadata'));assert.equal(media.currentTime,64.125);seek.value='250';seek.dispatchEvent(new Event('change'));assert.equal(media.currentTime,55.5);media.currentTime=222;media.dispatchEvent(new Event('ended'));assert.equal(play.getAttribute('aria-label'),'Play');assert.equal(seek.value,'1000');cleanup();
console.log('Native media: source crop/trim geometry, time validation, resampling, marks, mute preservation, host state, URL seek, and cleanup passed.');

// HTMLDialogElement.close queues its close event. Focus returns to the opener,
// not the image selected by arrow navigation, after that lifecycle event.
const thumbnailRoot=new Element(),box=new Element(),boxImage=new Element(),caption=new Element();
const thumbs=[0,1].map(i=>{const node=new Element(),img=new Element();node.dataset={ratio:'1.5',nativeThumbnail:String(i),caption:'Picture '+i};img.src='/picture-'+i+'.jpg';img.alt='Picture '+i;node.nodes={img:[img]};return node});
let focused=null;
thumbs.forEach(node=>node.focus=()=>focused=node);
thumbnailRoot.nodes={'[data-native-thumbnail]':thumbs,'[data-native-lightbox]':[box]};box.nodes={img:[boxImage],figcaption:[caption]};
box.open=false;box.showModal=()=>{box.open=true;focused=box};
box.close=()=>{box.open=false;setTimeout(()=>box.dispatchEvent(new Event('close')),0)};
cleanup=initNativeMedia(thumbnailRoot,()=>{},()=>{});
thumbs[0].dispatchEvent(new Event('click'));
const arrow=new Event('keydown',{cancelable:true});arrow.key='ArrowRight';box.dispatchEvent(arrow);
assert.equal(caption.textContent,'Picture 1');
const closed=new Promise(resolve=>box.addEventListener('close',resolve,{once:true}));
box.dispatchEvent(new Event('click'));
assert.equal(box.open,false);assert.equal(focused,box,'focus restoration must follow the queued close event');
await closed;assert.equal(focused,thumbs[0],'navigation must not replace the original focus-return target');
thumbs[1].dispatchEvent(new Event('click'));
const cancelled=new Promise(resolve=>box.addEventListener('close',resolve,{once:true}));box.close();await cancelled;
assert.equal(focused,thumbs[1],'native dismissal must restore the latest opener');
cleanup();focused=null;box.dispatchEvent(new Event('close'));assert.equal(focused,null,'cleanup must remove focus restoration');
console.log('Native lightbox: queued close, original/latest opener focus, and cleanup passed.');

// Keep paired theme colors: a literal light fill plus inherited dark-theme ink
// made the selected crop ratio, transport toggles, and playlist row unreadable.
const mediaCSS=readFileSync(new URL('../../assets/ely-api-native.css',import.meta.url),'utf8');
for(const selector of [".ely-native-crop-aspects [aria-pressed='true']", ".ely-native-transport [data-native-transport-action='play']"]){
 const body=mediaCSS.slice(mediaCSS.lastIndexOf(selector+'{')).split('}')[0];
 assert.ok(body.includes('background:var(--primary,var(--color-accent,'),selector+' lost accent fill');
 assert.ok(body.includes('color:var(--on-accent,var(--color-primary-foreground,'),selector+' lost paired foreground');
}
for(const selector of [".ely-native-transport [aria-pressed='true']", ".ely-native-playlist li button[aria-current='true']"]){
 const body=mediaCSS.slice(mediaCSS.lastIndexOf(selector+'{')).split('}')[0];
 assert.ok(body.includes('background:var(--surface-muted,'),selector+' lost themed surface');
 assert.ok(body.includes('color:var(--foreground,'),selector+' lost themed ink');
}
console.log('Native media selected controls: paired accent and surface token regressions passed.');

assert.ok(mediaCSS.includes(".ely-native-subtitles textarea{min-block-size:26px;block-size:26px;resize:none;"),'subtitle row sizing/resize grip regressed');
assert.ok(mediaCSS.includes("li[data-native-cue][data-native-active='true']{background:var(--color-active,var(--accent-tint,"),'active cue lost source active fill');
assert.ok(mediaCSS.includes('[data-native-subtitle-error]:empty{display:none}'),'empty subtitle errors must not add a row gap');
