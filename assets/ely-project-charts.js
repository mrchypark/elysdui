import {emit} from './ely-api.js';
const DAY=86400000, NS='http://www.w3.org/2000/svg';
export function chartDay(value){if(!/^\d{4}-\d{2}-\d{2}$/.test(value||''))throw Error('Dates must use YYYY-MM-DD.');const n=Date.parse(value+'T00:00:00Z');if(!Number.isFinite(n)||new Date(n).toISOString().slice(0,10)!==value)throw Error('Invalid calendar date.');return n/DAY;}
const iso=n=>new Date(n*DAY).toISOString().slice(0,10);
const number=value=>{if(value==null||String(value).trim()===''||!Number.isFinite(Number(value))||Number(value)<0||Number(value)>1e12)throw Error('Work and progress must be finite nonnegative numbers (at most 1e12).');return Number(value);};
export function ganttModel(tasks,today=''){
 if(tasks.length>1000)throw Error('At most 1000 tasks are supported.');
 const rows=tasks.map((task,i)=>{const start=chartDay(task.start),end=chartDay(task.end),progress=number(task.progress??0);if(end<start||progress>100)throw Error('Task end must follow start and progress must be 0–100.');return {...task,start,end,progress,after:[...new Set(task.after||[])].filter(n=>Number.isInteger(n)&&n>=0&&n<i)};});
 const first=rows.length?Math.min(...rows.map(r=>r.start)):0,last=rows.length?Math.max(...rows.map(r=>r.end)):0;
 if(last-first>36600)throw Error('A schedule spans at most 36600 days.');
 return {rows,first,last,count:last-first+1,today:today?chartDay(today):null};
}
export function burndownModel(start,end,scope,remaining,today=''){
 const first=chartDay(start),last=chartDay(end),count=last-first+1,total=number(scope);
 if(count<2||count>3660||!total||remaining.length>count)throw Error('A sprint needs 2–3660 days, positive scope, and no more observations than days.');
 const left=remaining.map(number),high=Math.max(total,...left),step=10**Math.max(-300,Math.floor(Math.log10(high))),top=Math.ceil(high/step)*step;
 return {first,last,count,scope:total,left,top,today:today?chartDay(today):null};
}
export function chartTicks(first,count){const ticks=[];for(let i=0;i<count;i++){const date=new Date((first+i)*DAY);if(count>62?date.getUTCDate()===1:date.getUTCDay()===1)ticks.push({offset:i,label:iso(first+i)});}return ticks;}
const node=(tag,attrs={},text)=>{const n=document.createElementNS(NS,tag);for(const [k,v]of Object.entries(attrs))n.setAttribute(k,String(v));if(text!==undefined)n.textContent=text;return n;};
export function mountProjectCharts(root,lifecycle){
 const chart=root.querySelector('[data-project-chart]');if(!chart)return;
 const drawing=chart.querySelector('[data-project-chart-drawing]'),status=chart.querySelector('[data-project-chart-status]');
 const options={signal:lifecycle.signal};
 let drawingLifecycle;
 lifecycle.signal.addEventListener('abort',()=>drawingLifecycle?.abort(),{once:true});
 const render=()=>{
  drawingLifecycle?.abort();drawingLifecycle=new AbortController();const drawingOptions={signal:drawingLifecycle.signal};
  drawing.replaceChildren();status.textContent='';delete chart.dataset.chartReady;
  try{
   const gantt=chart.dataset.projectChart==='gantt';
   const m=gantt?ganttModel([...chart.querySelectorAll('[data-project-chart-task]')].map(r=>({value:r.dataset.value,label:r.querySelector('th').textContent,start:r.dataset.start,end:r.dataset.end,progress:r.dataset.progress,after:(r.dataset.after||'').trim().split(/\s+/).filter(Boolean).map(Number)})),chart.dataset.today):burndownModel(chart.dataset.start,chart.dataset.end,chart.dataset.scope,[...chart.querySelectorAll('[data-project-chart-remaining]')].map(r=>r.dataset.remaining),chart.dataset.today);
   if(gantt){chart.querySelectorAll('[data-project-chart-task]').forEach((row,i)=>{const task=m.rows[i],cells=row.querySelectorAll('td');[iso(task.start),iso(task.end),String(task.progress),task.after.join(', ')].forEach((value,j)=>{if(cells[j])cells[j].textContent=value;});});}
   else{chart.querySelectorAll('[data-project-chart-remaining]').forEach((row,i)=>{row.querySelector('th').textContent=iso(m.first+i);row.querySelector('td').textContent=String(m.left[i]);});}
   if(gantt&&!m.rows.length){status.textContent='No scheduled tasks.';chart.dataset.chartReady='empty';return;}
   const width=800,left=gantt?190:60,right=780,top=30,bottom=gantt?30+m.rows.length*42:270,height=bottom+35;
   const svg=node('svg',{viewBox:`0 0 ${width} ${height}`,role:'group','aria-label':gantt?'Task timeline':'Sprint remaining work','data-project-chart-svg':''});drawing.append(svg);
   const x=day=>left+(day-m.first)*(right-left)/(gantt?m.count:m.count-1),y=v=>bottom-v/m.top*(bottom-top);
   for(const tick of chartTicks(m.first,m.count)){const px=x(m.first+tick.offset);svg.append(node('line',{x1:px,x2:px,y1:top,y2:bottom,class:'ely-chart-grid'}),node('text',{x:px,y:gantt?18:height-8,class:'ely-chart-label'},tick.label));}
   const targets=[];
   const inspect=(target,announce=true)=>{targets.forEach(t=>t.setAttribute('data-pointed',String(t===target)));if(announce)status.textContent=target.dataset.description;};
   const target=(shape,desc,payload)=>{shape.setAttribute('tabindex',targets.length===0?'0':'-1');shape.setAttribute('role','button');shape.setAttribute('aria-label',desc);shape.dataset.description=desc;shape.dataset.chartIndex=targets.length;shape._chartPayload=payload;targets.push(shape);svg.append(shape);};
   if(gantt){
    const bars=m.rows.map((r,i)=>({x:x(r.start),y:top+i*42+10,w:(r.end-r.start+1)*(right-left)/m.count,h:22}));
    m.rows.forEach((r,i)=>{const b=bars[i];svg.append(node('text',{x:4,y:b.y+16,class:'ely-chart-label'},r.label),node('rect',{x:b.x,y:b.y,width:b.w,height:b.h,rx:3,class:'ely-chart-task','data-chart-bar':i}),node('rect',{x:b.x,y:b.y,width:b.w*r.progress/100,height:b.h,rx:3,class:'ely-chart-done','data-chart-progress':i}));
     for(const before of r.after){const a=bars[before],sx=a.x+a.w,sy=a.y+11,ex=b.x,ey=b.y+11,mid=(sy+ey)/2;svg.append(node('path',{d:`M${sx},${sy} H${sx+6} V${mid} H${ex-6} V${ey} H${ex} l-5,-3 m5,3 l-5,3`,class:'ely-chart-dependency','data-chart-dependency':`${before}:${i}`}));}
     target(node('rect',{x:0,y:top+i*42,width,height:42,class:'ely-chart-hit'}),`${r.label}: ${iso(r.start)} to ${iso(r.end)}, ${r.end-r.start+1} days, ${r.progress}% done`,{value:r.value||String(i),index:i,start:iso(r.start),end:iso(r.end),progress:r.progress});
    });
   }else{
    for(let i=0;i<=4;i++){const value=m.top*i/4,py=y(value);svg.append(node('line',{x1:left,x2:right,y1:py,y2:py,class:'ely-chart-grid'}),node('text',{x:4,y:py+4,class:'ely-chart-label'},String(value)));}
    svg.append(node('path',{d:`M${left},${y(m.scope)} L${right},${bottom}`,class:'ely-chart-ideal','data-chart-ideal':''}));
    if(m.left.length)svg.append(node('path',{d:m.left.map((v,i)=>`${i?'L':'M'}${x(m.first+i)},${y(v)}`).join(' '),class:'ely-chart-actual','data-chart-actual':''}));
    m.left.forEach((v,i)=>svg.append(node('circle',{cx:x(m.first+i),cy:y(v),r:3,class:'ely-chart-done','data-chart-point':i})));
    for(let i=0;i<m.count;i++){const ideal=m.scope*(1-i/(m.count-1)),date=iso(m.first+i),remaining=m.left[i],px=x(m.first+i),step=(right-left)/(m.count-1);target(node('rect',{x:Math.max(left,px-step/2),y:top,width:Math.min(right,px+step/2)-Math.max(left,px-step/2),height:bottom-top,class:'ely-chart-hit'}),`${date}: ${remaining===undefined?'Not yet reported':remaining+' remaining'}, ideal ${Number(ideal.toFixed(2))}`,{value:date,index:i,date,ideal,...(remaining===undefined?{}:{remaining})});}
   }
   if(m.today!==null&&m.today>=m.first&&m.today<=m.last){const px=x(m.today)+(gantt?(right-left)/m.count/2:0);svg.append(node('line',{x1:px,x2:px,y1:top,y2:bottom,class:'ely-chart-today','data-chart-today':'','aria-label':`Today ${iso(m.today)}`}));}
   const own=e=>e.target.closest('[data-chart-index]');
   svg.addEventListener('pointerover',e=>{const t=own(e);if(t)inspect(t);},drawingOptions);
   svg.addEventListener('focusin',e=>{const t=own(e);if(t)inspect(t);},drawingOptions);
   svg.addEventListener('click',e=>{const t=own(e);if(t){inspect(t);emit(root,gantt?'select-task':'select-day',t._chartPayload);}},drawingOptions);
   svg.addEventListener('keydown',e=>{const t=own(e);if(!t)return;let i=targets.indexOf(t);if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();i=e.key==='Home'?0:e.key==='End'?targets.length-1:Math.max(0,Math.min(targets.length-1,i+(['ArrowRight','ArrowDown'].includes(e.key)?1:-1)));targets.forEach((r,j)=>r.setAttribute('tabindex',j===i?'0':'-1'));targets[i].focus();}else if(e.key==='Enter'||e.key===' '){e.preventDefault();emit(root,gantt?'select-task':'select-day',t._chartPayload);}else if(e.key==='Escape'){status.textContent='';targets.forEach(r=>r.removeAttribute('data-pointed'));}},drawingOptions);
   chart.dataset.chartReady='true';
  }catch(error){status.textContent=error.message;chart.dataset.chartReady='error';}
 };
 render();root.addEventListener('ely:chart-refresh',render,options);
}
