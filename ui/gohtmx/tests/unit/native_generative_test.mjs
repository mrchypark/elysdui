import assert from 'node:assert/strict';
import {seedEdit,addedRanges,readMask,rasterMask,brushKey,comparisonHeading,initNativeGenerative} from '../../assets/ely-api-native-generative.js';

assert.equal(seedEdit('2710',''), '');
assert.equal(seedEdit('2710','4a2'), '42');
assert.equal(seedEdit('2710','4294967295'), '4294967295');
assert.equal(seedEdit('2710','4294967296'), '2710');
assert.equal(seedEdit('0','00042'), '00042');
assert.deepEqual(addedRanges('a stair','a pale stair'), [[2,6]]);
assert.deepEqual(addedRanges('a stair','a stair, morning light'), [[9,22]]);
assert.deepEqual(addedRanges('a stair','a stair'), []);
assert.deepEqual(addedRanges('old words',''), []);
assert.deepEqual(addedRanges('계단','밝은 계단'), [[0,2]]);
assert.equal(comparisonHeading(0,'Orchid 3',true,''),'Model A');
assert.equal(comparisonHeading(1,'Juniper 2',true,'0'),'Juniper 2');
assert.equal(comparisonHeading(0,'Caller',false,''),'Caller');
assert.deepEqual(brushKey(.05,false,']'),{radius:.0625,erase:false});
assert.deepEqual(brushKey(.0625,false,'['),{radius:.05,erase:false});
assert.deepEqual(brushKey(.2,false,']'),{radius:.2,erase:false});
assert.deepEqual(brushKey(.01,true,'['),{radius:.01,erase:true});
assert.deepEqual(brushKey(.05,false,'X'),{radius:.05,erase:true});
const stroke={points:[[.5,.5]],radius:.1,erase:false};
assert.deepEqual(readMask(JSON.stringify([stroke])),[stroke]);
for(const bad of ['{}','null','[{}]',JSON.stringify([{...stroke,radius:0}]),JSON.stringify([{...stroke,points:[[1.1,.5]]}]),JSON.stringify([{...stroke,erase:'false'}])])assert.throws(()=>readMask(bad));
const painted=rasterMask([stroke],100,50,2),count=painted.reduce((a,b)=>a+b,0);
assert.ok(count>300&&count<330,'source mask radius must be measured in picture widths');
assert.equal(painted[25*100+50],1);
assert.equal(painted[25*100+61],0);
assert.equal(painted[36*100+50],0);
assert.equal(rasterMask([stroke,{...stroke,erase:true}],100,50,2).reduce((a,b)=>a+b,0),0);
assert.equal(rasterMask([{...stroke,erase:true},stroke],100,50,2).reduce((a,b)=>a+b,0),count,'later paint must win');
assert.equal(rasterMask([{...stroke,points:[[.2,.5],[.8,.5]]}],100,50,2)[25*100+50],1,'continuous segment must fill gaps');

// Exercise real events against minimal DOM boundaries, without a browser or dependencies.
class Element extends EventTarget {
  dataset={};nodes={};attributes={};hidden=false;disabled=false;value='';textContent='';
  style={setProperty:(key,value)=>{this.style[key]=value;}};
  classList={toggle:(key,value)=>{this.attributes[key]=value;}};
  querySelectorAll(selector){return this.nodes[selector]||[];}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  setAttribute(key,value){this.attributes[key]=value;}
  getAttribute(key){return this.attributes[key];}
  getBoundingClientRect(){return {left:10,top:20,width:300,height:200};}
  focus(){}
}
const event=(type,props={})=>Object.assign(new Event(type,{cancelable:true}),props);
const root=new Element(),changes=[],actions=[];
const compare=new Element(),slider=new Element(),after=new Element();slider.value='0';
compare.nodes={'[data-native-compare]':[slider],'[data-native-compare-after]':[after]};
root.nodes['.ely-native-compare']=[compare];
const ab=new Element(),sides=[new Element(),new Element()],buttons=[new Element(),new Element(),new Element()],nav=new Element(),verdict=new Element();
ab.dataset={blind:'true',verdict:''};
sides.forEach((side,i)=>{side.dataset.model=['Orchid 3','Juniper 2'][i];side.nodes={'strong':[new Element()],'small':[new Element()]};buttons[i].dataset.nativeVerdict=String(i);});buttons[2].dataset.nativeVerdict='tie';
ab.nodes={'[data-native-ab-side]':sides,'[data-native-verdict]':buttons,'nav':[nav],'[data-native-verdict-status]':[verdict]};root.nodes['[data-native-ab]']=[ab];
const mask=new Element(),canvas=new Element(),brush=new Element(),ring=new Element(),maskError=new Element(),size=new Element(),undo=new Element(),clear=new Element(),paintMode=new Element(),eraseMode=new Element();
let fills=0;canvas.width=960;canvas.height=640;canvas.getContext=()=>({clearRect(){},fillRect(){fills++;}});
mask.dataset={strokes:JSON.stringify([stroke]),brushRadius:'.05',erase:'false'};paintMode.dataset.nativeMaskMode='paint';eraseMode.dataset.nativeMaskMode='erase';
mask.nodes={'canvas':[canvas],'[data-native-brush]':[brush],'[data-native-brush-ring]':[ring],'[data-native-mask-error]':[maskError],'[data-native-brush-size]':[size],'[data-native-mask-undo]':[undo],'[data-native-mask-clear]':[clear],'[data-native-mask-mode]':[paintMode,eraseMode]};
root.nodes['[data-native-inpaint]']=[mask];globalThis.getComputedStyle=()=>({getPropertyValue:()=> '#181613'});
const audio=new Element(),wave=new Element(),play=new Element(),glyph=new Element(),status=new Element(),duration=new Element(),time=new Element(),ready=new Element(),making=new Element(),progress=new Element(),makingLabel=new Element(),regenerate=new Element(),download=new Element();
audio.dataset={duration:'32',position:'12',playing:'false',making:''};play.nodes['[data-native-icon]']=[glyph];wave.nodes.rect=Array.from({length:56},()=>new Element());making.nodes={'progress':[progress],'small':[makingLabel]};
audio.nodes={'[data-native-generated-wave]':[wave],'[data-native-generated-play]':[play],'[data-native-audio-status]':[status],'[data-native-generated-duration]':[duration],'[data-native-generated-time]':[time],'.ely-native-generated-player':[ready],'[data-native-audio-making]':[making],'header button':[regenerate,download]};root.nodes['[data-native-generated-audio]']=[audio];
const cleanup=initNativeGenerative(root,(_,value)=>changes.push(value),(_,name,value)=>actions.push({name,...value}));
assert.equal(after.style.clipPath,'inset(0 0 0 0%)','explicit caller zero must survive');
compare.dispatchEvent(event('keydown',{key:'ArrowRight'}));assert.equal(slider.value,'5');
compare.dispatchEvent(event('keydown',{key:'End'}));assert.equal(slider.value,'100');
compare.dispatchEvent(event('pointerdown',{button:0,clientX:85,pointerId:1}));assert.equal(slider.value,'25');
compare.dispatchEvent(event('pointerup'));compare.dispatchEvent(event('pointermove',{clientX:200}));assert.equal(slider.value,'25');
assert.equal(sides[0].querySelector('strong').textContent,'Model A');buttons[0].dispatchEvent(event('click'));assert.equal(sides[0].querySelector('strong').textContent,'Orchid 3');assert.equal(sides[0].dataset.preferred,'true');assert.ok(nav.hidden);buttons[1].dispatchEvent(event('click'));assert.equal(ab.dataset.verdict,'0','verdict is final until host rerender');
assert.ok(fills>0,'initial normalized mask must draw');
canvas.dispatchEvent(event('keydown',{key:']'}));assert.equal(brush.value,'.0625'.replace(/^\./,'0.'));canvas.dispatchEvent(event('keydown',{key:'x'}));assert.equal(canvas.dataset.mode,'erase');
for(const type of ['pointerdown','pointermove','pointerup'])canvas.dispatchEvent(event(type,{button:0,pointerId:1,clientX:160,clientY:120}));
let strokes=JSON.parse(canvas.dataset.geometry);assert.equal(strokes.length,2);assert.deepEqual(strokes[1].points[0],[.5,.5]);assert.equal(strokes[1].erase,true);
undo.dispatchEvent(event('click'));assert.deepEqual(JSON.parse(canvas.dataset.geometry),[stroke]);
root.dispatchEvent(event('ely:mask',{detail:{strokes:[{...stroke,radius:4}]}}));assert.deepEqual(JSON.parse(canvas.dataset.geometry),[stroke]);assert.ok(maskError.textContent.includes('Invalid'));
root.dispatchEvent(event('ely:mask',{detail:{}}));assert.deepEqual(JSON.parse(canvas.dataset.geometry),[stroke],'missing host strokes must not clear caller geometry');
clear.dispatchEvent(event('click'));assert.deepEqual(JSON.parse(canvas.dataset.geometry),[]);assert.ok(undo.disabled);
root.dispatchEvent(event('ely:mask',{detail:{strokes:[stroke]}}));assert.deepEqual(JSON.parse(canvas.dataset.geometry),[stroke]);assert.equal(maskError.textContent,'');
assert.equal(time.textContent,'00:12 / 00:32');play.dispatchEvent(event('click'));assert.deepEqual(actions.at(-1),{name:'play',playing:true});assert.equal(audio.dataset.position,'12');assert.equal(status.textContent,'Playback requested');
wave.dispatchEvent(event('keydown',{key:'ArrowRight'}));assert.equal(audio.dataset.position,'13.6');
root.dispatchEvent(event('ely:generated-audio',{detail:{making:0,position:0,playing:false}}));assert.equal(progress.value,0);assert.equal(making.hidden,false);assert.ok(regenerate.disabled&&ready.hidden);play.dispatchEvent(event('click'));assert.equal(audio.dataset.playing,'false');
root.dispatchEvent(event('ely:generated-audio',{detail:{making:null}}));assert.ok(making.hidden&&!regenerate.disabled&&!ready.hidden);
root.dataset.elyDisabled='true';const before=changes.length;compare.dispatchEvent(event('keydown',{key:'ArrowLeft'}));play.dispatchEvent(event('click'));clear.dispatchEvent(event('click'));assert.equal(changes.length,before);
cleanup();root.dataset.elyDisabled='false';play.dispatchEvent(event('click'));assert.equal(changes.length,before,'cleanup must remove event listeners');
console.log('native generative: seeds, prompt diffs, source mask raster, comparison, verdicts, host audio and cleanup passed');
