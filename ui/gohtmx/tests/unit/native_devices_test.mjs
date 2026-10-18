import assert from 'node:assert/strict';
import {START_ORBIT,orbitNext,recorderNext,recorderElapsed,micSegments,modelFaces,initNativeDevices} from '../../assets/ely-api-native-devices.js';

let recording={state:'idle',elapsed:0,started:0};
recording=recorderNext(recording,'record',1000);
assert.equal(recorderElapsed(recording,5000),4);
recording=recorderNext(recording,'pause',6000);
assert.equal(recorderElapsed(recording,50000),5);
recording=recorderNext(recording,'resume',51000);
assert.equal(recorderElapsed(recording,53000),7);
assert.deepEqual(recorderNext(recording,'stop',54000),{state:'idle',elapsed:0,started:54000});
assert.equal(recorderNext(recording,'record',55000),recording,'invalid transition must not restart');
for(const [level,lit] of [[0,0],[.02,0],[.03,1],[.3,7],[.5,12],[.84,20],[.98,24],[1,24]]){
  const segments=micSegments(level);assert.equal(segments.length,24);assert.equal(segments.filter(tone=>tone!=='off').length,lit);
}
assert.deepEqual(micSegments(1).slice(18),['normal','warning','warning','warning','danger','danger']);
for(const bad of [-.1,1.1,NaN,Infinity,'0.5'])assert.throws(()=>micSegments(bad));
const up=orbitNext(START_ORBIT,'ArrowUp');
assert.equal(up.distance,1);assert.ok(Math.abs(up.pitch-(.35-Math.PI/12))<1e-12);
assert.equal(orbitNext(START_ORBIT,'nearer').distance,.8);
assert.equal(orbitNext(START_ORBIT,'farther').distance,1.25);
assert.equal(orbitNext(START_ORBIT,'wheel',0,10000).distance,4);
assert.equal(orbitNext(START_ORBIT,'wheel',0,-10000).distance,.4);
assert.equal(orbitNext(START_ORBIT,'drag',-10000,10000).pitch,1.4);
assert.ok(orbitNext(START_ORBIT,'drag',-10000,0).yaw>=0);
assert.deepEqual(orbitNext(up,'reset'),START_ORBIT);
const vertices=[],faces=[];
for(let i=0;i<56;i++)for(let j=0;j<24;j++){const u=i/56*2*Math.PI,v=j/24*2*Math.PI,r=1+.38*Math.cos(v);vertices.push([r*Math.cos(u),.38*Math.sin(v),r*Math.sin(u)]);faces.push([i*24+j,(i+1)%56*24+j,(i+1)%56*24+(j+1)%24,i*24+(j+1)%24]);}
const projected=modelFaces(vertices,faces,START_ORBIT,960,640);
assert.ok(projected.length>400&&projected.length<1344,'source back faces must be culled');
assert.ok(projected.every(face=>face.light>=.42&&face.light<=1&&face.points.every(p=>p.every(Number.isFinite))));
assert.ok(projected.every((face,index)=>!index||projected[index-1].depth>=face.depth));
const points=projected.flatMap(face=>face.points),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
// Upstream screenshot: torus spans about 285×150 points within its 480×320 viewport.
assert.ok(Math.max(...xs)-Math.min(...xs)>560&&Math.max(...xs)-Math.min(...xs)<580);
assert.ok(Math.max(...ys)-Math.min(...ys)>290&&Math.max(...ys)-Math.min(...ys)<320);
assert.throws(()=>modelFaces([[0,0,0]],[[0,1,2]],START_ORBIT,960,640));
assert.throws(()=>modelFaces([[0,NaN,0]],[[0,0,0]],START_ORBIT,960,640));
assert.throws(()=>modelFaces([],[],START_ORBIT,960,640));

// Real event dispatch at a minimal DOM boundary; no browser or device APIs.
class Element extends EventTarget {
  dataset={};nodes={};attributes={};style={};hidden=false;
  querySelectorAll(selector){return this.nodes[selector]||[];}
  querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
  removeAttribute(name){delete this.attributes[name];}
  matches(){return false;}
}
const root=new Element(),camera=new Element(),frame=new Element(),off=new Element(),caption=new Element(),select=new Element(),changes=[];
camera.dataset.ratio='1.5';camera.nodes={'img':[frame],'.ely-native-camera-off':[off],'figcaption':[caption]};
select.dataset.nativeDevice='microphone';select.value='caller-key';
root.nodes={'[data-native-camera]':[camera],'[data-native-device]':[select]};
const cleanup=initNativeDevices(root,(_root,detail)=>changes.push(detail));
const dispatch=detail=>{const event=new Event('ely:camera-frame');event.detail=detail;root.dispatchEvent(event);};
dispatch({url:'/caller.jpg',alt:'Caller frame',name:'Caller camera'});
assert.equal(frame.src,'/caller.jpg');assert.equal(frame.alt,'Caller frame');assert.equal(caption.textContent,'Caller camera');assert.equal(off.hidden,true);
dispatch({url:''});assert.equal(frame.hidden,true);assert.equal(off.hidden,false);
select.dispatchEvent(new Event('change'));assert.deepEqual(changes,[{device:'microphone',value:'caller-key'}]);
cleanup();dispatch({url:'/after-cleanup.jpg'});select.dispatchEvent(new Event('change'));assert.equal(frame.hidden,true);assert.equal(changes.length,1);
const modelRoot=new Element(),viewer=new Element(),canvas=new Element(),modelFrame=new Element(),slider=new Element(),loading=new Element(),farther=new Element(),nearer=new Element(),reset=new Element();
viewer.dataset={yaw:'.6',pitch:'.35',distance:'1',ratio:'1.5'};
canvas.dataset={vertices:JSON.stringify(vertices),faces:JSON.stringify(faces),projection:'perspective',meshColor:'#c4baac'};
canvas.width=960;canvas.height=640;canvas.focus=()=>{};
let fills=0;const context={clearRect(){},beginPath(){},moveTo(){},lineTo(){},closePath(){},fill(){fills++;}};
canvas.getContext=()=>context;modelFrame.hidden=true;
viewer.nodes={'canvas':[canvas],'[data-native-model-frame]':[modelFrame],'[data-native-model-zoom]':[slider],'[data-native-model-loading]':[loading],'[data-native-model-step="farther"]':[farther],'[data-native-model-step="nearer"]':[nearer],'[data-native-model-reset]':[reset]};
modelRoot.nodes={'[data-native-model-viewer]':[viewer]};
const modelCleanup=initNativeDevices(modelRoot,(_root,detail)=>changes.push(detail));
assert.equal(canvas.dataset.nativeModelReady,'true');assert.equal(fills,projected.length);assert.equal(reset.disabled,true);
const key=(key,metaKey=false)=>{const event=new Event('keydown',{cancelable:true});Object.assign(event,{key,metaKey});canvas.dispatchEvent(event);return event;};
assert.equal(key('ArrowUp').defaultPrevented,true);assert.ok(Number(viewer.dataset.pitch)<.35);assert.equal(Number(viewer.dataset.distance),1);
key('+');assert.equal(Number(viewer.dataset.distance),.8);
key('0');assert.equal(viewer.dataset.pitch,'0.35');assert.equal(viewer.dataset.distance,'1');
key('+',true);assert.equal(viewer.dataset.distance,'1','modified keyboard shortcuts must pass through');
canvas.getContext=()=>null;key('ArrowLeft');assert.equal(canvas.dataset.nativeModelReady,'error');assert.match(loading.textContent,/unavailable/);
canvas.getContext=()=>context;key('0');assert.equal(canvas.dataset.nativeModelReady,'true');
modelCleanup();const count=changes.length;key('ArrowRight');assert.equal(changes.length,count);
console.log('Native devices: recorder timing, 24-segment levels, bounded source orbit/projection, host frames, selection, and cleanup passed.');
