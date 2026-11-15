import {watchChart} from '/assets/ely-chart-lifecycle.js';

const NS='http://www.w3.org/2000/svg',MAX_POINTS=100000,MAX_CELLS=10000,MAX_BINS=10000;
const finite=n=>typeof n==='number'&&Number.isFinite(n);

/** Validate and bound the shared [{x,y}] input format. */
export function densityPoints(data){
 if(!Array.isArray(data)||!data.length||data.length>MAX_POINTS)throw new RangeError(`data must contain 1–${MAX_POINTS} points.`);
 let x0=Infinity,x1=-Infinity,y0=Infinity,y1=-Infinity;
 const points=data.map((p,i)=>{if(!p||!finite(p.x)||!finite(p.y))throw new TypeError(`Point ${i} needs finite x and y values.`);x0=Math.min(x0,p.x);x1=Math.max(x1,p.x);y0=Math.min(y0,p.y);y1=Math.max(y1,p.y);return {x:p.x,y:p.y};});
 if(x0===x1){const d=Math.max(.5,Math.abs(x0)*1e-9);x0-=d;x1+=d;}if(y0===y1){const d=Math.max(.5,Math.abs(y0)*1e-9);y0-=d;y1+=d;}
 if(!finite(x1-x0)||!finite(y1-y0)||x0===x1||y0===y1)throw new RangeError('Point ranges must be finite.');return {points,bounds:{x0,x1,y0,y1}};
}
/** Apply a separable Gaussian in grid-cell units. Bandwidth is sigma; the kernel is truncated at 3σ and edge weights are renormalized. */
export function gaussianSmooth(grid,bandwidth=1.5){
 if(!Array.isArray(grid)||grid.length<2||grid.length>100||!grid.every(r=>Array.isArray(r)&&r.length===grid[0].length&&r.length>=2&&r.length<=100&&r.every(finite))||!finite(bandwidth)||bandwidth<0||bandwidth>8)throw new RangeError('Gaussian smoothing needs a finite 2–100 grid and bandwidth from 0 to 8 cells.');
 if(!bandwidth)return grid.map(r=>r.slice());const radius=Math.ceil(3*bandwidth),weights=Array.from({length:radius*2+1},(_,i)=>Math.exp(-((i-radius)**2)/(2*bandwidth**2))),rows=grid.length,cols=grid[0].length,horizontal=Array.from({length:rows},()=>Array(cols).fill(0)),out=Array.from({length:rows},()=>Array(cols).fill(0));
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){let s=0,w=0;for(let k=-radius;k<=radius;k++){const xx=x+k;if(xx>=0&&xx<cols){const weight=weights[k+radius];s+=grid[y][xx]*weight;w+=weight;}}horizontal[y][x]=s/w;}
 for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){let s=0,w=0;for(let k=-radius;k<=radius;k++){const yy=y+k;if(yy>=0&&yy<rows){const weight=weights[k+radius];s+=horizontal[yy][x]*weight;w+=weight;}}out[y][x]=s/w;}
 return out;
}
/** Rasterize points, smooth counts with a 3σ-truncated separable Gaussian, then extract isolines. */
export function contourGrid(data,{columns=40,rows=40,levels,bandwidth=1.5}={}){
 const {points,bounds}=densityPoints(data);if(!Number.isInteger(columns)||!Number.isInteger(rows)||columns<2||rows<2||columns>100||rows>100||columns*rows>MAX_CELLS)throw new RangeError('Grid dimensions must be integers from 2 to 100 with at most 10000 cells.');
 const grid=Array.from({length:rows},()=>Array(columns).fill(0));
 for(const p of points){const x=Math.min(columns-1,Math.floor((p.x-bounds.x0)/(bounds.x1-bounds.x0)*columns)),y=Math.min(rows-1,Math.floor((bounds.y1-p.y)/(bounds.y1-bounds.y0)*rows));grid[y][x]++;}
 const rawGrid=grid,smooth=gaussianSmooth(rawGrid,bandwidth),peak=Math.max(...smooth.flat()),cuts=levels===undefined?[.25,.5,.75].map(q=>peak*q):levels;
 if(!Array.isArray(cuts)||cuts.length>12||cuts.some(v=>!finite(v)||v<=0))throw new RangeError('levels must contain up to 12 finite positive thresholds.');
 return {grid:smooth,rawGrid,bounds,bandwidth,levels:cuts.map(level=>({level,segments:marchingSquares(smooth,level)}))};
}
/** Marching-squares line segments in grid coordinates. Ambiguous saddle cells use the center average. */
export function marchingSquares(grid,threshold){
 if(!Array.isArray(grid)||grid.length<2||grid.length>100||!grid.every(r=>Array.isArray(r)&&r.length===grid[0].length&&r.length>=2&&r.length<=100&&r.every(finite))||!finite(threshold))throw new TypeError('grid must be a rectangular finite 2D array (2–100 per side).');
 const out=[],edges=[[0,1],[1,2],[2,3],[3,0]];
 for(let y=0;y<grid.length-1;y++)for(let x=0;x<grid[0].length-1;x++){
  const v=[grid[y][x],grid[y][x+1],grid[y+1][x+1],grid[y+1][x]],p=[[x,y],[x+1,y],[x+1,y+1],[x,y+1]],cross=[];
  for(const [a,b]of edges)if((v[a]<threshold)!==(v[b]<threshold)){const t=(threshold-v[a])/(v[b]-v[a]);cross.push([p[a][0]+(p[b][0]-p[a][0])*t,p[a][1]+(p[b][1]-p[a][1])*t]);}
  if(cross.length===2)out.push(cross);else if(cross.length===4){const high=v.reduce((s,n)=>s+n,0)/4>=threshold;if((v[0]>=threshold)===high)out.push([cross[0],cross[1]],[cross[2],cross[3]]);else out.push([cross[0],cross[3]],[cross[1],cross[2]]);}
 }
 return out;
}
/** Bin points on a pointy-top hexagonal grid; each bin contains its data-space center and point indices. */
export function hexbinModel(data,{radius=16,width=640,height=400,padding=24}={}){
 const {points,bounds}=densityPoints(data);if(!finite(radius)||radius<4||radius>80||!finite(width)||!finite(height)||width<100||height<100||width>2000||height>2000||padding*2>=Math.min(width,height))throw new RangeError('Hexbin size, radius, or padding is outside supported limits.');
 const pad=Math.max(padding,radius*2);if(pad*2>=Math.min(width,height))throw new RangeError('Hexagon radius leaves no plotting area.');
 const sx=(width-2*pad)/(bounds.x1-bounds.x0),sy=(height-2*pad)/(bounds.y1-bounds.y0),scale=Math.min(sx,sy),cx=width/2,cy=height/2,project=p=>[cx+(p.x-(bounds.x0+bounds.x1)/2)*scale,cy-(p.y-(bounds.y0+bounds.y1)/2)*scale],bins=new Map();
 for(let i=0;i<points.length;i++){
  const [px,py]=project(points[i]),q=(Math.sqrt(3)/3*(px-cx)-1/3*(py-cy))/radius,r=(2/3*(py-cy))/radius,s=-q-r,rx=Math.round(q),ry=Math.round(r),rz=Math.round(s),dq=Math.abs(rx-q),dr=Math.abs(ry-r),ds=Math.abs(rz-s);let aq=rx,ar=ry;if(dq>dr&&dq>ds)aq=-ry-rz;else if(dr>ds)ar=-rx-rz;
  const key=`${aq}:${ar}`;if(!bins.has(key)){if(bins.size>=MAX_BINS)throw new RangeError(`Hexbin count exceeds ${MAX_BINS}.`);bins.set(key,{q:aq,r:ar,indices:[],sx:0,sy:0});}const b=bins.get(key);b.indices.push(i);b.sx+=points[i].x;b.sy+=points[i].y;
 }
 return {bounds,bins:[...bins.values()].map(b=>{const px=cx+radius*(Math.sqrt(3)*b.q+Math.sqrt(3)/2*b.r),py=cy+radius*1.5*b.r;return {x:px,y:py,radius,count:b.indices.length,indices:b.indices,center:{x:b.sx/b.indices.length,y:b.sy/b.indices.length}};})};
}
const el=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;};
const hexPoints=(x,y,r)=>Array.from({length:6},(_,i)=>`${x+r*Math.cos(-Math.PI/2+Math.PI/3*i)},${y+r*Math.sin(-Math.PI/2+Math.PI/3*i)}`).join(' ');
/** Mount ContourChart or HexbinChart. Input is [{x,y}]. Options: width, height, padding, gridSize, levels, bandwidth (Gaussian σ in grid cells), radius, onSelect. Wheel zoom and pointer/touch pan/pinch are supported; reset returns to the initial view. */
export function mountDensityChart(root,{type,data,width=640,height=400,padding=32,gridSize=40,levels,bandwidth=1.5,radius=16,onSelect,onViewport}={}){
 if(!root||typeof root.replaceChildren!=='function')throw new TypeError('root must be a DOM element.');if(!['ContourChart','HexbinChart'].includes(type))throw new TypeError('type must be ContourChart or HexbinChart.');
 if((onSelect!=null&&typeof onSelect!=='function')||(onViewport!=null&&typeof onViewport!=='function'))throw new TypeError('Chart callbacks must be functions.');
 const w=Number(width),h=Number(height);if(!finite(w)||!finite(h)||w<100||h<100||w>2000||h>2000||!finite(padding)||padding<0||padding*2>=Math.min(w,h))throw new RangeError('Chart dimensions and padding are outside supported limits.');const pts=densityPoints(data),svg=el('svg',{viewBox:`0 0 ${w} ${h}`,role:'group','aria-label':type,class:'ely-density-chart'}),plot=el('g'),status=document.createElement('div'),list=document.createElement('ul'),controls=document.createElement('div'),reset=document.createElement('button'),targets=[];
 status.className='ely-density-status';status.setAttribute('aria-live','polite');list.className='ely-density-text';list.setAttribute('aria-label','Chart data');
 const add=(shape,label,value)=>{shape.setAttribute('role','button');shape.setAttribute('tabindex',targets.length?'-1':'0');shape.setAttribute('aria-label',label);targets.push({shape,label,value});};
 if(type==='ContourChart'){
  const c=contourGrid(data,{columns:gridSize,rows:gridSize,levels,bandwidth}),xstep=(w-2*padding)/(gridSize-1),ystep=(h-2*padding)/(gridSize-1);
  c.levels.forEach(({level,segments},i)=>{const path=segments.map(s=>`M${padding+s[0][0]*xstep},${padding+s[0][1]*ystep}L${padding+s[1][0]*xstep},${padding+s[1][1]*ystep}`).join('');if(!path)return;const shape=el('path',{d:path,fill:'none',class:'ely-density-contour',stroke:`hsl(${220-i*35} 70% 45%)`,'data-level':level});add(shape,`Density contour level ${level}`,{type,level,segments:segments.length});plot.append(shape);list.append(Object.assign(document.createElement('li'),{textContent:`Contour level ${level}: ${segments.length} line segments`}));});
 }else{
  const m=hexbinModel(data,{radius,width:w,height:h,padding}),max=Math.max(...m.bins.map(b=>b.count));m.bins.forEach(bin=>{const shape=el('polygon',{points:hexPoints(bin.x,bin.y,radius*.96),fill:`hsl(${220-180*bin.count/max} 70% 52%)`,class:'ely-density-hex','data-count':bin.count});add(shape,`Hexagon with ${bin.count} points`,{type,count:bin.count,indices:bin.indices,center:bin.center});plot.append(shape);list.append(Object.assign(document.createElement('li'),{textContent:`Hexagon: ${bin.count} points`}));});
 }
 const select=t=>{targets.forEach(a=>{a.shape.classList.toggle('is-selected',a===t);a.shape.setAttribute('aria-pressed',String(a===t));});status.textContent=t.label;onSelect?.(t.value);root.dispatchEvent(new CustomEvent('ely:density-select',{detail:t.value,bubbles:true}));};
 const click=e=>{if(suppressClick){suppressClick=false;return;}const t=targets.find(a=>a.shape===e.target);if(t)select(t);},key=e=>{const i=targets.findIndex(a=>a.shape===e.target);if(i<0)return;if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();const n=e.key==='Home'?0:e.key==='End'?targets.length-1:Math.max(0,Math.min(targets.length-1,i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)));targets.forEach((a,j)=>a.shape.setAttribute('tabindex',j===n?'0':'-1'));targets[n].shape.focus();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();select(targets[i]);}};
 const pointers=new Map(),view={scale:1,x:0,y:0};let moved=false,suppressClick=false;
 const local=e=>{const rect=svg.getBoundingClientRect?.()||{left:0,top:0,width:w,height:h};return {x:((e.clientX??rect.left+(e.offsetX??0))-rect.left)*w/(rect.width||w),y:((e.clientY??rect.top+(e.offsetY??0))-rect.top)*h/(rect.height||h)};};
 const apply=()=>{plot.setAttribute('transform',`translate(${view.x} ${view.y}) scale(${view.scale})`);status.textContent=`View scale ${view.scale.toFixed(2)}, offset ${Math.round(view.x)}, ${Math.round(view.y)}`;const detail={...view};onViewport?.(detail);root.dispatchEvent(new CustomEvent('ely:density-viewport',{detail,bubbles:true}));},resetView=()=>{view.scale=1;view.x=0;view.y=0;moved=false;suppressClick=false;apply();};
 const down=e=>{if(e.button!==undefined&&e.button!==0)return;if(!pointers.size){suppressClick=false;moved=false;}else moved=true;const p=local(e);pointers.set(e.pointerId,{...p,startX:p.x,startY:p.y});(e.target?.setPointerCapture?e.target:svg).setPointerCapture?.(e.pointerId);};
 const move=e=>{const old=pointers.get(e.pointerId);if(!old)return;const prev=[...pointers.values()],p=local(e);pointers.set(e.pointerId,{...p,startX:old.startX,startY:old.startY});const now=[...pointers.values()];if(Math.hypot(p.x-old.startX,p.y-old.startY)>4)moved=true;
  if(now.length===1){view.x+=p.x-old.x;view.y+=p.y-old.y;}else if(now.length>=2){const distance=a=>Math.hypot(a[0].x-a[1].x,a[0].y-a[1].y),center=a=>({x:(a[0].x+a[1].x)/2,y:(a[0].y+a[1].y)/2}),p=prev.slice(0,2),n=now.slice(0,2),ratio=distance(p)?distance(n)/distance(p):1,from=center(p),to=center(n),scale=Math.max(.5,Math.min(8,view.scale*ratio));view.x=to.x-(from.x-view.x)*scale/view.scale;view.y=to.y-(from.y-view.y)*scale/view.scale;view.scale=scale;}
  apply();e.preventDefault?.();};
 const up=e=>{pointers.delete(e.pointerId);if(moved)suppressClick=true;if(!pointers.size)moved=false;};
 const zoomAt=(x,y,factor)=>{const scale=Math.max(.5,Math.min(8,view.scale*factor)),ratio=scale/view.scale;view.x=x-(x-view.x)*ratio;view.y=y-(y-view.y)*ratio;view.scale=scale;apply();};
 const wheel=e=>{e.preventDefault();const p=local(e);zoomAt(p.x,p.y,Math.exp(-e.deltaY*.001));};
 const zoomIn=document.createElement('button'),zoomOut=document.createElement('button');zoomIn.type=zoomOut.type='button';zoomIn.textContent='Zoom in';zoomOut.textContent='Zoom out';const doIn=()=>zoomAt(w/2,h/2,1.5),doOut=()=>zoomAt(w/2,h/2,1/1.5);
 reset.type='button';reset.className='ely-density-reset';reset.textContent='Reset';reset.setAttribute('aria-label','Reset chart zoom and pan');controls.className='ely-density-controls';controls.append(reset,zoomIn,zoomOut);svg.style.touchAction='pan-y';svg.append(plot);
 svg.addEventListener('click',click);svg.addEventListener('keydown',key);svg.addEventListener('pointerdown',down);svg.addEventListener('pointermove',move);svg.addEventListener('pointerup',up);svg.addEventListener('pointercancel',up);svg.addEventListener('wheel',wheel,{passive:false});reset.addEventListener('click',resetView);zoomIn.addEventListener('click',doIn);zoomOut.addEventListener('click',doOut);root.classList.add('ely-density');root.replaceChildren(svg,status,controls,list);let dead=false;
 let unwatch=()=>{};const destroy=()=>{if(dead)return;dead=true;unwatch();root.removeEventListener('htmx:beforeCleanupElement',cleanup);for(const [event,fn]of [['click',click],['keydown',key],['pointerdown',down],['pointermove',move],['pointerup',up],['pointercancel',up],['wheel',wheel]])svg.removeEventListener(event,fn);reset.removeEventListener('click',resetView);zoomIn.removeEventListener('click',doIn);zoomOut.removeEventListener('click',doOut);if(root.firstChild===svg){root.replaceChildren();root.classList.remove('ely-density');}};const cleanup=e=>{if(e.target===root)destroy();};root.addEventListener('htmx:beforeCleanupElement',cleanup);unwatch=watchChart(root,svg,destroy);
 return {destroy};
}
