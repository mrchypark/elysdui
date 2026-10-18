const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));
export const START_ORBIT=Object.freeze({yaw:.6,pitch:.35,distance:1});
export function orbitNext(orbit, command, x=0, y=0) {
  let {yaw,pitch,distance}=orbit;
  const step=Math.PI/12;
  if(command==='reset')return {...START_ORBIT};
  if(command==='ArrowLeft')yaw-=step;
  if(command==='ArrowRight')yaw+=step;
  if(command==='ArrowUp')pitch-=step;
  if(command==='ArrowDown')pitch+=step;
  if(command==='drag'){yaw+=x*.01;pitch+=y*.01;}
  if(command==='nearer')distance/=1.25;
  if(command==='farther')distance*=1.25;
  if(command==='wheel')distance*=Math.exp(y*.01);
  return {yaw:(yaw%(2*Math.PI)+2*Math.PI)%(2*Math.PI),pitch:clamp(pitch,-1.4,1.4),distance:clamp(distance,.4,4)};
}
export function recorderElapsed(recording,now){return recording.elapsed+(recording.state==='running'?Math.max(0,now-recording.started)/1000:0);}
export function recorderNext(recording,command,now){
  const elapsed=recorderElapsed(recording,now);
  if(command==='record'&&recording.state==='idle')return {state:'running',elapsed:0,started:now};
  if(command==='pause'&&recording.state==='running')return {state:'paused',elapsed,started:now};
  if(command==='resume'&&recording.state==='paused')return {state:'running',elapsed,started:now};
  if(command==='stop')return {state:'idle',elapsed:0,started:now};
  return recording;
}
export function micSegments(level){
  if(!Number.isFinite(level)||level<0||level>1)throw Error('Microphone level must be from 0 to 1.');
  return Array.from({length:24},(_,index)=>index>=Math.round(level*24)?'off':(index+1)/24>=.95?'danger':(index+1)/24>=.8?'warning':'normal');
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((sum,v,i)=>sum+v*b[i],0);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=a=>{const length=Math.hypot(...a);return a.map(v=>v/length);};
export function modelFaces(vertices,faces,orbit,width,height,perspective=true){
  if(!Array.isArray(vertices)||!vertices.length||vertices.length>100000||!vertices.every(v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite))||!Array.isArray(faces)||!faces.length||faces.length>100000||!faces.every(f=>Array.isArray(f)&&f.length>=3&&f.every(i=>Number.isInteger(i)&&i>=0&&i<vertices.length)))throw Error('Invalid model geometry.');
  const away=1.55/.35*orbit.distance,eye=[away*Math.cos(orbit.pitch)*Math.sin(orbit.yaw),away*Math.sin(orbit.pitch),away*Math.cos(orbit.pitch)*Math.cos(orbit.yaw)],ahead=unit(eye.map(v=>-v)),right=unit(cross(ahead,[0,1,0])),up=cross(right,ahead),light=unit(right.map((v,i)=>-v+1.6*up[i]-ahead[i])),focal=height/2/Math.tan(.35);
  const project=p=>{const seen=sub(p,eye),depth=dot(seen,ahead);return perspective?[width/2+dot(seen,right)/depth*focal,height/2-dot(seen,up)/depth*focal,depth]:[width/2+dot(p,right)/orbit.distance,height/2-dot(p,up)/orbit.distance,depth];};
  return faces.flatMap(face=>{
    const corners=face.map(index=>vertices[index]),normal=unit(cross(sub(corners.at(-1),corners[0]),sub(corners[1],corners[0]))),points=corners.map(project);
    if(perspective&&(dot(normal,sub(eye,corners[0]))<=0||points.some(p=>p[2]<=0)))return [];
    return [{points,depth:points.reduce((sum,p)=>sum+p[2],0),light:perspective?.42+.58*Math.max(0,dot(normal,light)):.8}];
  }).sort((a,b)=>b.depth-a.depth);
}
function drawModel(canvas,orbit){
  delete canvas.dataset.nativeModelError;
  if(!canvas.dataset.vertices||!canvas.dataset.faces)return false;
  try{
    const faces=modelFaces(JSON.parse(canvas.dataset.vertices||'[]'),JSON.parse(canvas.dataset.faces||'[]'),orbit,canvas.width,canvas.height,canvas.dataset.projection==='perspective');
    const context=canvas.getContext('2d');if(!context)throw Error('Model canvas is unavailable; provide a host-rendered frame.');
    context.clearRect(0,0,canvas.width,canvas.height);
    const mesh=canvas.dataset.meshColor||'#c4baac',hex=/^#[\da-f]{3}$/i.test(mesh)?'#'+[...mesh.slice(1)].map(v=>v+v).join(''):mesh;
    const color=/^#[\da-f]{6}$/i.test(hex)?[1,3,5].map(start=>parseInt(hex.slice(start,start+2),16)):null;
    for(const face of faces){context.beginPath();face.points.forEach(([x,y],index)=>index?context.lineTo(x,y):context.moveTo(x,y));context.closePath();context.fillStyle=color?'rgb('+color.map(v=>Math.floor(v*face.light)).join(',')+')':mesh;if(canvas.dataset.wireframe==='true'){context.strokeStyle=mesh;context.stroke();}else context.fill();}
    return true;
  }catch(error){canvas.dataset.nativeModelError=error.message;return false;}
}
export function initNativeDevices(root,change){
  const cleanups=[],listen=(node,type,fn,options)=>{node.addEventListener(type,fn,options);cleanups.push(()=>node.removeEventListener(type,fn,options));};
  const icon=(node,name)=>{if(!node)return;node.dataset.nativeIcon=name;node.style.setProperty('--native-icon-url','url("/assets/ely/icons/'+name+'.svg")');};
  root.querySelectorAll('[data-native-recorder]').forEach(control=>{
    const callerTime=control.querySelector('[data-native-recording-time]').textContent.trim().split(':').reduce((total,part)=>total*60+Number(part),0);
    let recording={state:['idle','running','paused'].includes(control.dataset.recording)?control.dataset.recording:'idle',elapsed:Math.max(0,(control.dataset.elapsed!==''?Number(control.dataset.elapsed):callerTime)||0),started:performance.now()};
    const render=()=>{
      control.dataset.recording=recording.state;
      const elapsed=recorderElapsed(recording,performance.now()),seconds=Math.floor(elapsed);
      control.querySelector('[data-native-recording-time]').textContent=Math.floor(seconds/60)+':'+String(seconds%60).padStart(2,'0');
      control.querySelector('[data-native-recording-state]').hidden=recording.state==='idle';
      control.querySelectorAll('[data-native-record]').forEach(button=>button.hidden=!({record:recording.state==='idle',pause:recording.state==='running',resume:recording.state==='paused',stop:recording.state!=='idle'}[button.dataset.nativeRecord]));
      control.querySelectorAll('[data-native-record-toggle]').forEach(button=>{const on=button.getAttribute('aria-pressed')==='true',mic=button.dataset.nativeRecordToggle==='microphone';icon(button.querySelector('[data-native-icon]'),mic?(on?'mic':'mic-off'):(on?'video':'video-off'));});
    };
    listen(control,'click',event=>{
      const button=event.target.closest('button');if(!button||button.matches(':disabled'))return;
      if(button.dataset.nativeRecord)recording=recorderNext(recording,button.dataset.nativeRecord,performance.now());
      if(button.dataset.nativeRecordToggle)button.setAttribute('aria-pressed',String(button.getAttribute('aria-pressed')!=='true'));
      render();change(root,{recording:recording.state,elapsed:recorderElapsed(recording,performance.now()),microphone:control.querySelector('[data-native-record-toggle="microphone"]').getAttribute('aria-pressed')==='true',camera:control.querySelector('[data-native-record-toggle="camera"]').getAttribute('aria-pressed')==='true'});
    });
    listen(root,'ely:recording',event=>{const next=event.detail;if(!next||!['idle','running','paused'].includes(next.state)||!Number.isFinite(next.elapsed)||next.elapsed<0)return;recording={state:next.state,elapsed:next.elapsed,started:performance.now()};render();});
    render();const timer=setInterval(render,250);cleanups.push(()=>clearInterval(timer));
  });
  root.querySelectorAll('[data-native-camera]').forEach(camera=>{
    const ratio=Number(camera.dataset.ratio);if(ratio>0&&Number.isFinite(ratio))camera.style.aspectRatio=String(ratio);
    listen(root,'ely:camera-frame',event=>{
      const frame=camera.querySelector('img'),off=camera.querySelector('.ely-native-camera-off'),caption=camera.querySelector('figcaption'),detail=event.detail;
      if(!detail||typeof detail.url!=='string')return;
      if(detail.url)frame.src=detail.url;else frame.removeAttribute('src');frame.hidden=!detail.url;off.hidden=!!detail.url;
      if(typeof detail.alt==='string')frame.alt=detail.alt;
      if(typeof detail.name==='string'){caption.textContent=detail.name;caption.hidden=!detail.name;}
    });
  });
  const meters=[...root.querySelectorAll('[data-native-meter]')];
  const meter=(node,level)=>{const values=micSegments(level),track=node.parentElement.querySelector('[data-native-mic-segments]');node.value=level;track.replaceChildren(...values.map(tone=>{const segment=document.createElement('i');segment.dataset.tone=tone;return segment;}));};
  meters.forEach(node=>meter(node,Number(node.value)));
  if(meters.length)listen(root,'ely:mic-levels',event=>{const levels=event.detail?.levels;if(!Array.isArray(levels)||levels.length!==meters.length||!levels.every(v=>Number.isFinite(v)&&v>=0&&v<=1))return;meters.forEach((node,index)=>meter(node,levels[index]));});
  root.querySelectorAll('.ely-native-device-selectors [data-native-icon]').forEach(node=>{if(!/^[a-z0-9-]+$/.test(node.dataset.nativeIcon)){node.dataset.nativeDeviceGlyph='';node.textContent=node.dataset.nativeIcon;}});
  root.querySelectorAll('[data-native-device]').forEach(select=>listen(select,'change',()=>{if(!select.matches(':disabled'))change(root,{device:select.dataset.nativeDevice,value:select.value});}));
  root.querySelectorAll('[data-native-model-viewer]').forEach(viewer=>{
    let orbit={yaw:Number(viewer.dataset.yaw),pitch:Number(viewer.dataset.pitch),distance:Number(viewer.dataset.distance)},held=null;
    if(!Object.values(orbit).every(Number.isFinite)||orbit.distance<.4||orbit.distance>4)orbit={...START_ORBIT};
    const canvas=viewer.querySelector('canvas'),frame=viewer.querySelector('[data-native-model-frame]'),slider=viewer.querySelector('[data-native-model-zoom]'),loading=viewer.querySelector('[data-native-model-loading]');
    const ratio=Number(viewer.dataset.ratio);if(ratio>0&&Number.isFinite(ratio))viewer.style.aspectRatio=String(ratio);
    const render=()=>{
      viewer.dataset.yaw=String(orbit.yaw);viewer.dataset.pitch=String(orbit.pitch);viewer.dataset.distance=String(orbit.distance);slider.value=String(1/orbit.distance);
      const drawn=drawModel(canvas,orbit);canvas.dataset.nativeModelReady=drawn||!frame.hidden?'true':canvas.dataset.nativeModelError?'error':'loading';loading.hidden=drawn||!frame.hidden;loading.textContent=canvas.dataset.nativeModelError||'Loading model…';loading.dataset.error=String(!!canvas.dataset.nativeModelError);
      viewer.querySelector('[data-native-model-step="farther"]').disabled=orbit.distance===4;
      viewer.querySelector('[data-native-model-step="nearer"]').disabled=orbit.distance===.4;
      viewer.querySelector('[data-native-model-reset]').disabled=Object.keys(START_ORBIT).every(key=>Math.abs(orbit[key]-START_ORBIT[key])<1e-10);
    };
    const move=(command,x,y)=>{orbit=orbitNext(orbit,command,x,y);render();change(root,{orbit:{...orbit},zoom:1/orbit.distance});};
    listen(canvas,'pointerdown',event=>{if(event.button!==0||root.querySelector('fieldset[disabled]'))return;held={x:event.clientX,y:event.clientY,id:event.pointerId};canvas.focus();if(event.isTrusted)canvas.setPointerCapture?.(event.pointerId);});
    listen(canvas,'pointermove',event=>{if(!held||held.id!==event.pointerId)return;move('drag',event.clientX-held.x,event.clientY-held.y);held={x:event.clientX,y:event.clientY,id:event.pointerId};});
    for(const type of ['pointerup','pointercancel','lostpointercapture'])listen(canvas,type,()=>{held=null;});
    listen(canvas,'keydown',event=>{if(event.ctrlKey||event.metaKey||root.querySelector('fieldset[disabled]'))return;const command=({'+':'nearer','=':'nearer','-':'farther','0':'reset'})[event.key]||event.key;if(!['nearer','farther','reset','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(command))return;event.preventDefault();move(command);});
    listen(canvas,'wheel',event=>{if(!(event.metaKey||event.ctrlKey)||root.querySelector('fieldset[disabled]'))return;event.preventDefault();move('wheel',0,event.deltaY*(event.deltaMode===1?20:event.deltaMode===2?canvas.clientHeight:1));},{passive:false});
    listen(viewer,'click',event=>{const button=event.target.closest('button');if(!button||button.matches(':disabled'))return;if(button.hasAttribute('data-native-model-reset'))move('reset');else if(button.dataset.nativeModelStep)move(button.dataset.nativeModelStep);});
    listen(slider,'input',()=>{orbit.distance=clamp(1/Number(slider.value),.4,4);render();change(root,{orbit:{...orbit},zoom:1/orbit.distance});});
    listen(root,'ely:model-frame',event=>{if(typeof event.detail?.url!=='string')return;if(event.detail.url)frame.src=event.detail.url;else frame.removeAttribute('src');frame.hidden=!event.detail.url;render();});
    render();
  });
  return ()=>cleanups.forEach(cleanup=>cleanup());
}
