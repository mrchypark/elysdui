// Host boundaries: capture emits Action, then consumes ely:result/error; a custom
// surface emits {requestId,width,height,revision}, and accepts result.frame or
// ely:surface-frame {requestId,width,height,pixels} (RGBA). Stale replies are ignored.
// Hosts notify actual renders with ely:render {key}; ely:surface-revision {revision}
// invalidates a custom surface. After attaching a handler to an already mounted
// surface, dispatch ely:surface-request on its family root to request its first
// frame (or retry). Remount through the existing htmx lifecycle for new props.
// Host preview knobs emit {key,values}; callers replace/remount their preview via
// existing htmx integration. No command runner, screenshot service, or GPU device
// is fabricated here. Inspector inspects this component's DOM, not GPUI state.
// Count seeds are incremented on mount; hosts send ely:render {key} only when the
// corresponding view renders. Animation frames do not imply application renders.
// Color rows accept CSS token names with pinned light/dark fallbacks. Measures
// accept Value in pixels and optional Token overrides. Theme changes are observed
// on the family root/ancestors or requested explicitly with ely:theme on the root.
export const toolingKinds = new Set(['InspectorOverlay','FPSMeter','RenderCounter','EventLogger','DesignTokenViewer','IconBrowser','A11yChecker','ScreenshotTest Harness','ComponentGallery','PlaygroundPanel','RenderSurface']);
const clamp = (n,a,b) => Math.min(b,Math.max(a,n));
export function frameStats(stamps, now) {
  stamps.push(now);
  while (stamps.length > 2 && now-stamps[1] >= 1000) stamps.shift();
  const intervals = stamps.slice(1).map((t,i)=>t-stamps[i]);
  const span=now-stamps[0];
  return {fps:span>0?(stamps.length-1)*1000/span:0,worst:Math.max(0,...intervals),intervals:intervals.slice(-60)};
}
export const missedFrames = ms => Math.floor(Math.max(0,ms/(1000/60)-.5));
export function recordInput(rows, event, time) {
  const previous=rows[0];
  if(event.kind==='move' && previous?.kind==='move') rows[0]={...event,time,count:previous.count+1};
  else rows.unshift({...event,time,count:1});
  rows.length=Math.min(50,rows.length);
  return rows;
}
export function rgba(value) {
  const hex=String(value).trim().match(/^#([\da-f]{3,8})$/i);
  if(hex){let h=hex[1];if(h.length===3||h.length===4)h=[...h].map(c=>c+c).join('');if(h.length!==6&&h.length!==8)return null;return [0,2,4].map(i=>parseInt(h.slice(i,i+2),16)).concat(h.length===8?parseInt(h.slice(6),16)/255:1);}
  const match=String(value).match(/^rgba?\(\s*([\d.]+)[, ]+([\d.]+)[, ]+([\d.]+)(?:\s*[,/]\s*([\d.]+))?\s*\)$/);
  return match?[+match[1],+match[2],+match[3],match[4]===undefined?1:+match[4]]:null;
}
export function composite(front,back) {return front.slice(0,3).map((v,i)=>Math.round(v*front[3]+back[i]*(1-front[3])));}
export function contrastResult(front,back,need,contrast) {
  const f=rgba(front),b=rgba(back);
  if(!f||!b||b[3]!==1||typeof contrast!=='function')return {ratio:null,grade:'Invalid',pass:false};
  const opaque=composite(f,b),ratio=contrast(`rgb(${opaque.join(',')})`,`rgb(${b.slice(0,3).join(',')})`);
  if(!Number.isFinite(ratio)||ratio<1)return {ratio:null,grade:'Invalid',pass:false};
  return {ratio,pass:ratio>=need,grade:ratio<need?'Fail':need===4.5&&ratio>=7?'AAA':'AA'};
}
export function contourPixels(width,height,at,ground,ink) {
  const pixels=new Uint8ClampedArray(width*height*4),reach=height*.22;
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    let heat=0;for(const [sx,sy] of [[at,.5],[.62,.3],[.78,.74]]){const dx=(x-sx*width)/reach,dy=(y-sy*height)/reach;heat+=1/(1+dx*dx+dy*dy);}
    const band=Math.floor(Math.min(heat,1)*8)/8,i=(y*width+x)*4;
    for(let c=0;c<3;c++)pixels[i+c]=Math.round(ground[c]+(ink[c]-ground[c])*band);
    pixels[i+3]=255;
  }return pixels;
}
export function validSurfaceFrame(frame,width,height) {
  return frame?.width===width&&frame?.height===height&&(Array.isArray(frame.pixels)||ArrayBuffer.isView(frame.pixels))&&frame.pixels.length===width*height*4&&Array.from(frame.pixels).every(v=>Number.isInteger(v)&&v>=0&&v<=255);
}
export function initNativeTooling(root,change,emit,{contrast}={}) {
  const doc=root.ownerDocument,win=doc.defaultView,q=s=>root.querySelector(s),all=s=>[...root.querySelectorAll(s)],cleanups=[];
  const on=(el,type,fn,options)=>{el?.addEventListener(type,fn,options);cleanups.push(()=>el?.removeEventListener(type,fn,options));};
  const blocked=el=>!!el?.closest('fieldset[disabled], [inert]')||el?.disabled;
  const owns=e=>!e.target.closest||e.target.closest('[data-ely-family]')===root;
  const send=(action,detail)=>emit(root,action,detail);
  const text=(s,value)=>{const el=q(s);if(el)el.textContent=value;};
  const dark=()=>win.getComputedStyle(root).colorScheme==='dark'||!!root.closest('[data-theme="dark"],.dark');
  const color=(token,light,night)=>token&&win.getComputedStyle(root).getPropertyValue(token).trim()||(dark()&&night?night:light);
  const themeListeners=[];
  const themeChanged=()=>themeListeners.forEach(fn=>fn());
  on(root,'ely:theme',themeChanged);on(doc,'ely:theme-change',themeChanged);
  if(win.MutationObserver){const observer=new win.MutationObserver(themeChanged);for(let el=root;el;el=el.parentElement)observer.observe(el,{attributes:true,attributeFilter:['class','style','data-theme','data-mode']});cleanups.push(()=>observer.disconnect());}
  const icon=el=>{if(/^[a-z0-9-]+$/.test(el.dataset.toolIcon))el.style.maskImage=`url("/assets/ely/icons/${el.dataset.toolIcon}.svg")`;};all('[data-tool-icon]').forEach(icon);
  // Measurement is opt-in and uses real animation-frame timestamps, never a preset FPS.
  const measure=q('[data-tool-measure]');
  if(measure){let raf=0,stamps=[];const stop=()=>{win.cancelAnimationFrame(raf);raf=0;};const tick=now=>{if(!measure.checked||blocked(measure))return;const stats=frameStats(stamps,now);text('[data-tool-fps-value]',stats.fps?stats.fps.toFixed(0):'—');text('[data-tool-fps-worst]',stats.worst.toFixed(1));const bars=q('[data-tool-fps-bars]');bars.replaceChildren(...stats.intervals.map(ms=>{const bar=doc.createElement('i');bar.style.height=`${Math.min(1,ms/50)*100}%`;bar.dataset.missed=Math.min(2,missedFrames(ms));bar.title=`${ms.toFixed(2)} ms`;return bar;}));raf=win.requestAnimationFrame(tick);};const toggle=()=>{stop();stamps=[];q('[data-tool-fps-panel]').hidden=!measure.checked;if(measure.checked&&!blocked(measure))raf=win.requestAnimationFrame(tick);};on(measure,'change',()=>{toggle();change(root,{measuring:measure.checked});});toggle();cleanups.push(stop);}
  const counters=all('[data-tool-render-count]');
  const count=key=>counters.filter(el=>!key||el.dataset.toolRenderCount===key).forEach(el=>{el.dataset.count=String((Number(el.dataset.count)||0)+1);el.textContent=el.dataset.count;});
  if(counters.length){count();on(root,'ely:render',e=>{if(owns(e))count(e.detail?.key);});all('[data-tool-redraw]').forEach(button=>on(button,'click',()=>{if(blocked(button))return;count(button.dataset.toolRedraw);change(root,{key:button.dataset.toolRedraw,renders:Number(counters.find(el=>el.dataset.toolRenderCount===button.dataset.toolRedraw)?.dataset.count)});}));}
  const target=q('[data-tool-event-target]');
  if(target){const rows=[];let start=null;const receive=e=>{if(blocked(target))return;const rect=target.getBoundingClientRect(),xy=`${Math.round(e.clientX-rect.left)}, ${Math.round(e.clientY-rect.top)}`,kind=e.type==='pointermove'?'move':e.type;let message;
    if(kind==='move')message=`move to ${xy}`;
    else if(e.type==='pointerdown'||e.type==='pointerup')message=`${e.type==='pointerdown'?'press':'release'} ${['left','middle','right'][e.button]||e.button} at ${xy}${e.detail>1?` ×${e.detail}`:''}`;
    else if(e.type==='wheel')message=`wheel ${e.deltaX}, ${e.deltaY} ${e.deltaMode===1?'lines':e.deltaMode===2?'pages':'px'}`;
    else {const mods=['ctrl','alt','shift','meta'].filter(k=>e[`${k}Key`]);message=['Shift','Control','Alt','Meta'].includes(e.key)?`modifiers ${mods.join(' ')||'none'}`:`${e.type==='keydown'?'key down':'key up'} ${[...mods,e.key].join('+')}`;}
    start??=e.timeStamp;recordInput(rows,{kind,message},Math.max(0,e.timeStamp-start));q('[data-tool-event-log]').replaceChildren(...rows.map(row=>{const li=doc.createElement('li'),time=doc.createElement('time');time.textContent=`+${(row.time/1000).toFixed(2)}s`;li.append(time,doc.createTextNode(row.message+(row.count>1?` ×${row.count}`:'')));return li;}));};for(const type of ['pointermove','pointerdown','pointerup','wheel','keydown','keyup'])on(target,type,receive,{capture:true,passive:true});}
  const tokens=all('[data-tool-token]');
  if(tokens.length){const update=()=>tokens.forEach(el=>{const d=el.dataset,sample=el.querySelector('i'),out=el.querySelector('output');if(d.kind==='color'){const value=color(d.token,d.light,d.dark);sample.style.backgroundColor=value;out.textContent=value;}else{const value=color(d.token,d.value,d.value),n=parseFloat(value);out.textContent=Number.isFinite(n)?`${n} px`:'';if(d.kind==='type'){sample.textContent='Sphinx of black quartz';sample.style.fontSize=`${n}px`;}else if(d.kind==='radius')sample.style.borderRadius=`${n}px`;else if(d.kind==='elevation')sample.dataset.elevation=d.sample;else if(Number.isFinite(n)){sample.style.width=d.kind==='container'?`${n/1200*100}%`:d.kind==='control'?'200px':`${n}px`;sample.style.height=`${['spacing','container'].includes(d.kind)?8:Math.min(n,56)}px`;if(d.kind==='icon'){sample.classList.add('ely-tooling-icon');sample.dataset.toolIcon='star';icon(sample);}}}});themeListeners.push(update);update();}
  const icons=q('[data-tool-icons]');
  if(icons){const options=all('[data-tool-icon-option]'),filter=q('[data-tool-icon-filter]');let selected=icons.dataset.selected;
    const select=(value,publish=false)=>{const option=options.find(el=>el.dataset.toolIconOption===value);if(!option)return;selected=value;icons.dataset.selected=value;for(const el of options){el.setAttribute('aria-selected',String(el===option));el.tabIndex=el===option?0:-1;}const mark=doc.createElement('i');mark.className='ely-tooling-icon';mark.dataset.toolIcon=value;icon(mark);q('[data-tool-icon-preview]').replaceChildren(mark);text('[data-tool-icon-name]',`IconName::${value.split('-').map(v=>v[0].toUpperCase()+v.slice(1)).join('')}`);if(publish){change(root,{value});send(icons.dataset.action,{value});}};
    select(selected);if(!options.some(el=>el.tabIndex===0)&&options[0])select(options[0].dataset.toolIconOption);
    on(filter,'input',()=>{const term=filter.value.trim().toLowerCase();options.forEach(el=>el.hidden=!el.dataset.toolIconOption.replaceAll('-',' ').includes(term.replaceAll('-',' ')));const visible=options.filter(el=>!el.hidden);options.forEach(el=>el.tabIndex=-1);const active=visible.find(el=>el.dataset.toolIconOption===selected)||visible[0];if(active)active.tabIndex=0;q('[data-tool-icon-empty]').hidden=visible.length>0;});
    on(icons,'click',e=>{const option=e.target.closest('[data-tool-icon-option]');if(option&&!blocked(option))select(option.dataset.toolIconOption,true);});
    on(icons,'keydown',e=>{const visible=options.filter(el=>!el.hidden&&!blocked(el)),current=e.target.closest('[data-tool-icon-option]');let index=visible.indexOf(current);if(e.target===filter&&e.key==='ArrowDown')index=-1;else if(!current)return;const delta={ArrowRight:1,ArrowLeft:-1,ArrowDown:8,ArrowUp:-8}[e.key];if(delta!==undefined||e.key==='Home'||e.key==='End'){e.preventDefault();index=e.target===filter?0:e.key==='Home'?0:e.key==='End'?visible.length-1:clamp(index+delta,0,visible.length-1);visible.forEach(el=>el.tabIndex=-1);if(visible[index]){visible[index].tabIndex=0;visible[index].focus();}}});
  }
  const pairs=all('[data-tool-a11y-row]');
  if(pairs.length){const update=()=>{let fails=0;for(const row of pairs){const d=row.dataset,front=color(d.frontToken,d.front,d.darkFront),back=color(d.backToken,d.back,d.darkBack),result=contrastResult(front,back,Number(d.need),contrast);row.dataset.pass=String(result.pass);if(!result.pass)fails++;row.querySelector('[data-tool-a11y-sample]').style.color=front;row.querySelector('[data-tool-a11y-sample]').style.backgroundColor=back;row.querySelector('[data-tool-a11y-ratio]').textContent=result.ratio===null?'Invalid':result.ratio.toFixed(2)+':1';row.querySelector('[data-tool-a11y-grade]').textContent=result.grade;}q('[data-tool-a11y-rows]').append(...pairs.filter(el=>el.dataset.pass==='false'),...pairs.filter(el=>el.dataset.pass==='true'));text('[data-tool-a11y-summary]',fails?`${fails} of ${pairs.length} fail`:`All ${pairs.length} pass`);};themeListeners.push(update);update();}
  let captureRequest=0,captureAction='';
  all('[data-tool-host-action]').forEach(button=>on(button,'click',()=>{if(blocked(button))return;const requestId=++captureRequest;captureAction=button.dataset.toolHostAction;text('[data-tool-host-status]','Waiting for host');send(button.dataset.toolHostAction,{value:button.dataset.value,requestId});}));
  on(root,'ely:result',e=>{if(!owns(e)||!q('[data-tool-host-status]')||e.detail?.requestId!==captureRequest||e.detail?.action!==captureAction)return;text('[data-tool-host-status]',e.detail.result?.message||'Host completed capture');});
  on(root,'ely:error',e=>{if(owns(e)&&e.detail?.action===captureAction)text('[data-tool-host-status]',e.detail.error?.message||String(e.detail.error||'Host capture failed'));});
  all('[data-tool-playground]').forEach(panel=>{const form=panel.querySelector('form'),knobs=[...panel.querySelectorAll('[data-tool-knob]')];const update=(publish=false)=>{const values={};for(const knob of knobs){values[knob.name]=knob.type==='checkbox'?knob.checked:knob.type==='range'?Number(knob.value):knob.value;if(knob.type==='range')knob.nextElementSibling.textContent=knob.value;}const button=panel.querySelector('[data-tool-preview-button]');if(button){button.dataset.variant=String(values.variant||'primary').toLowerCase();button.dataset.size=String(values.size||'md').toLowerCase();button.disabled=!!values.disabled||!!values.loading;button.dataset.loading=String(!!values.loading);button.setAttribute('aria-busy',String(!!values.loading));}const ring=panel.querySelector('[data-tool-ring-fill]');if(ring){const value=clamp(Number(values.value)||0,0,1);ring.style.strokeDasharray=`${value*100} 100`;const progress=panel.querySelector('[role="progressbar"]');progress.setAttribute('aria-valuenow',String(Math.round(value*100)));progress.querySelector('output').textContent=values.percent?`${Math.round(value*100)}%`:'';}if(publish){change(root,{key:panel.dataset.toolPlayground,values});if(panel.dataset.action)send(panel.dataset.action,{key:panel.dataset.toolPlayground,values});}};on(form,'submit',e=>e.preventDefault());on(form,'input',e=>{if(!blocked(e.target))update(true);});const button=panel.querySelector('[data-tool-preview-button]');on(button,'click',()=>{if(!blocked(button))send(panel.dataset.action||'preview',{key:panel.dataset.toolPlayground,value:button.dataset.label});});update();});
  const surface=q('[data-tool-surface]');
  if(surface){const canvas=q('[data-tool-canvas]'),status=q('[data-tool-surface-status]'),d=surface.dataset,context=canvas.getContext('2d');let revision=d.revision||'',request=0,cache='',pending=null,disposed=false;
    const ratio=Number.isFinite(Number(d.ratio))&&Number(d.ratio)>0?Number(d.ratio):2;surface.style.width=`${Math.max(1,Number(d.width)||720)}px`;canvas.style.aspectRatio=String(ratio);
    const draw=()=>{if(disposed||!context)return;const width=Math.round(canvas.getBoundingClientRect().width*(win.devicePixelRatio||1)),height=Math.round(width/ratio);if(width<1||height<1)return;const ground=d.ground||color('--sunken','#f6f4f1','#202020'),ink=d.ink||color('--accent','#181613','#f3f1f0'),key=JSON.stringify([width,height,revision,d.place,ground,ink]);if(cache===key)return;cache=key;canvas.width=width;canvas.height=height;
      if(d.field==='true'){const g=rgba(ground),i=rgba(ink);if(!g||!i){status.textContent='Invalid field colors';return;}const frame=context.createImageData(width,height);frame.data.set(contourPixels(width,height,clamp(Number(d.place)||0,0,1),g,i));context.putImageData(frame,0,0);status.textContent='';}
      else{pending={requestId:++request,width,height};status.textContent='Waiting for host frame';send(d.action,{...pending,revision});}};
    const accept=frame=>{if(!pending||frame?.requestId!==pending.requestId||disposed)return;if(!validSurfaceFrame(frame,pending.width,pending.height)){status.textContent='Host frame dimensions or RGBA pixels are invalid';return;}const image=context.createImageData(frame.width,frame.height);image.data.set(frame.pixels);context.putImageData(image,0,0);pending=null;status.textContent='';};
    on(root,'ely:surface-frame',e=>{if(owns(e))accept(e.detail);});on(root,'ely:result',e=>{if(owns(e)&&e.detail?.result?.frame)accept({...e.detail.result.frame,requestId:e.detail.requestId});});on(root,'ely:error',e=>{if(owns(e)&&pending&&e.detail?.action===d.action)status.textContent=e.detail.error?.message||'Host rendering failed';});
    on(root,'ely:surface-request',e=>{if(owns(e)){cache='';draw();}});
    on(root,'ely:surface-revision',e=>{if(!owns(e))return;revision=e.detail?.revision;draw();});const position=q('[data-tool-source-position]');if(position){position.value=String(Number(d.place)*100);on(position,'input',()=>{if(blocked(position))return;d.place=String(Number(position.value)/100);draw();change(root,{position:Number(d.place)});});}on(win,'resize',draw);if(win.ResizeObserver){const observer=new win.ResizeObserver(draw);observer.observe(canvas);cleanups.push(()=>observer.disconnect());}themeListeners.push(draw);draw();cleanups.push(()=>{disposed=true;pending=null;});
  }
  const inspect=q('[data-tool-inspect-toggle]');
  if(inspect){const scope=q('[data-tool-inspect-scope]'),panel=q('[data-tool-inspect-panel]'),highlight=q('[data-tool-inspect-highlight]');let active=false,held=false,picked=null;const paint=el=>{if(!el||el===scope||!scope.contains(el)||el===inspect)return;picked=el;const rect=el.getBoundingClientRect(),css=win.getComputedStyle(el);text('[data-tool-inspect-title]',el.tagName.toLowerCase()+(el.id?'#'+el.id:''));const facts={bounds:`${Math.round(rect.width)} × ${Math.round(rect.height)} at ${Math.round(rect.x)}, ${Math.round(rect.y)}`,margin:css.margin,border:css.borderWidth,padding:css.padding,display:css.display};q('[data-tool-inspect-facts]').replaceChildren(...Object.entries(facts).flatMap(([key,value])=>{const dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=key;dd.textContent=value;return [dt,dd];}));highlight.hidden=false;const box=(name,x,y,w,h)=>{const layer=highlight.querySelector(`[data-tool-layer="${name}"]`);Object.assign(layer.style,{left:`${x}px`,top:`${y}px`,width:`${Math.max(0,w)}px`,height:`${Math.max(0,h)}px`});};const sides=prefix=>['Top','Right','Bottom','Left'].map(side=>parseFloat(css[prefix+side+(prefix==='border'?'Width':'')])||0),m=sides('margin'),b=sides('border'),p=sides('padding');box('margin',rect.left-m[3],rect.top-m[0],rect.width+m[1]+m[3],rect.height+m[0]+m[2]);box('border',rect.left,rect.top,rect.width,rect.height);box('padding',rect.left+b[3],rect.top+b[0],rect.width-b[1]-b[3],rect.height-b[0]-b[2]);box('content',rect.left+b[3]+p[3],rect.top+b[0]+p[0],rect.width-b[1]-b[3]-p[1]-p[3],rect.height-b[0]-b[2]-p[0]-p[2]);};const picking=()=>{held=false;q('[data-tool-inspect-release]').hidden=true;text('[data-tool-inspect-hint]','Hover picks a box, the wheel steps out to the boxes around it, and a press holds it.');};const toggle=value=>{active=value;picking();panel.hidden=!value;highlight.hidden=true;inspect.setAttribute('aria-expanded',String(value));if(value)q('[data-tool-inspect-close]').focus();else inspect.focus();};on(inspect,'click',()=>{if(!blocked(inspect))toggle(!active);});on(q('[data-tool-inspect-close]'),'click',()=>toggle(false));on(q('[data-tool-inspect-release]'),'click',picking);on(scope,'pointermove',e=>{if(active&&!held)paint(e.target);});on(scope,'click',e=>{if(active&&e.target!==inspect){e.preventDefault();e.stopPropagation();paint(e.target);held=true;q('[data-tool-inspect-release]').hidden=false;text('[data-tool-inspect-hint]','Held. Pick chooses another box.');}},true);on(scope,'wheel',e=>{if(active&&picked){e.preventDefault();paint(picked.parentElement);}},{passive:false});on(panel,'keydown',e=>{if(e.key==='Tab'){const buttons=[...panel.querySelectorAll('button')].filter(el=>!el.hidden&&!el.disabled);const i=buttons.indexOf(doc.activeElement);if(buttons.length){e.preventDefault();buttons[(i+(e.shiftKey?-1:1)+buttons.length)%buttons.length].focus();}}});on(doc,'keydown',e=>{if(active&&e.key==='Escape'){e.preventDefault();toggle(false);}});on(win,'resize',()=>{if(active&&picked)paint(picked);});on(doc,'scroll',()=>{if(active&&picked)paint(picked);},true);cleanups.push(()=>{highlight.hidden=true;});}
  return ()=>{cleanups.reverse().forEach(fn=>fn());};
}
