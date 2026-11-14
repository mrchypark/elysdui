import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
class Element{
 constructor(tag){this.tagName=tag;this.attributes={};this.children=[];this.listeners={};this.style={};this.classList={values:new Set(),add:x=>this.classList.values.add(x),remove:x=>this.classList.values.delete(x),toggle:(x,on)=>on?this.classList.values.add(x):this.classList.values.delete(x)};}
 setAttribute(k,v){this.attributes[k]=String(v)}getAttribute(k){return this.attributes[k]}append(...n){this.children.push(...n)}replaceChildren(...n){this.children=n;this.firstChild=n[0]}addEventListener(k,f){this.listeners[k]=f}removeEventListener(k){delete this.listeners[k]}dispatchEvent(e){this.event=e;return true}focus(){this.focused=true}contains(n){return this.children.includes(n)}
}
const document={createElementNS:(_,t)=>new Element(t),createElement:t=>new Element(t)};
const source=readFileSync(new URL('../../assets/ely-density-charts.js',import.meta.url),'utf8').replace("import {watchChart} from '/assets/ely-chart-lifecycle.js';",'const watchChart=()=>()=>{};').replaceAll('export function ','function ')+'\n({densityPoints,gaussianSmooth,contourGrid,marchingSquares,hexbinModel,mountDensityChart})';
const {densityPoints,gaussianSmooth,contourGrid,marchingSquares,hexbinModel,mountDensityChart}=runInNewContext(source,{document,Array,Math,Number,String,TypeError,RangeError,Map,Set,CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}}});

const diamond=marchingSquares([[0,0,0],[0,2,0],[0,0,0]],1);
assert.equal(diamond.length,4);assert.deepEqual(JSON.parse(JSON.stringify(diamond)),[[[1,.5],[.5,1]],[[1.5,1],[1,.5]],[[.5,1],[1,1.5]],[[1.5,1],[1,1.5]]]);
const contour=contourGrid([{x:0,y:0},{x:0,y:0},{x:2,y:0},{x:0,y:2},{x:2,y:2}],{columns:3,rows:3,levels:[.5]});
assert.deepEqual(JSON.parse(JSON.stringify(contour.rawGrid)),[[1,0,1],[0,0,0],[2,0,1]]);assert.ok(contour.grid[1][1]>0);assert.equal(contour.levels[0].level,.5);assert.ok(contour.levels[0].segments.length>0);
assert.throws(()=>densityPoints([{x:0,y:Infinity}]));assert.throws(()=>contourGrid([{x:0,y:0}],{columns:101,rows:101}));assert.throws(()=>marchingSquares([[0,1],[1]],.5));
const spike=Array.from({length:15},(_,y)=>Array.from({length:15},(_,x)=>x===7&&y===7?20:0)),smooth=gaussianSmooth(spike,1);
assert.ok(smooth[7][7]>smooth[7][8]&&smooth[7][8]>smooth[7][9]&&smooth[7][9]>0,'Gaussian smoothing creates decreasing neighboring bands');assert.ok(Math.abs(smooth[6][7]-smooth[8][7])<1e-12,'smoothed peak is symmetric');
assert.deepEqual(JSON.parse(JSON.stringify(gaussianSmooth(Array.from({length:3},()=>[5,5,5]),1))),[[5,5,5],[5,5,5],[5,5,5]],'edge renormalization preserves finite constants');assert.throws(()=>gaussianSmooth([[0,Infinity],[1,0]],1));assert.throws(()=>gaussianSmooth([[0,1],[1,0]],NaN));
const cluster=Array.from({length:30},(_,i)=>({x:i<20?0:(i%2?1:-1),y:i<20?0:(i%3-1)})),banded=contourGrid(cluster,{columns:31,rows:31,bandwidth:1.25});
assert.equal(banded.bandwidth,1.25);assert.ok(banded.grid[15][15]>banded.rawGrid[15][15]*.1);assert.ok(banded.levels.every(level=>level.segments.length>0));assert.ok(banded.grid.flat().every(Number.isFinite),'smoothed density has no nonfinite edge values');
assert.throws(()=>contourGrid(cluster,{bandwidth:Infinity}));

const points=[{x:0,y:0},{x:0,y:0},{x:10,y:0}],hex=hexbinModel(points,{radius:16,width:300,height:200,padding:24});
assert.equal(hex.bins.reduce((s,b)=>s+b.count,0),3);assert.deepEqual(JSON.parse(JSON.stringify(hex.bins.map(b=>b.count))),[2,1]);assert.ok(hex.bins.every(b=>b.indices.length===b.count&&b.radius===16));
assert.ok(hex.bins.every(b=>b.x>=16&&b.x<=300-16&&b.y>=16&&b.y<=200-16),'hex centers remain inside the drawable bounds');assert.ok(Math.abs(hex.bins[0].x-39.14874831559186)<1e-9,'known axial coordinate maps to a deterministic hex center');
assert.throws(()=>hexbinModel([{x:0,y:0}],{radius:2}));

for(const type of ['ContourChart','HexbinChart']){
 const root=new Element('root'),picked=[],chart=mountDensityChart(root,{type,data:points,width:300,height:200,gridSize:3,onSelect:v=>picked.push(v)}),svg=root.firstChild,shapes=[];
 const scan=n=>{if(n.getAttribute('role')==='button')shapes.push(n);for(const c of n.children)scan(c)};scan(svg);assert.ok(shapes.length>0);assert.equal(root.children[3].getAttribute('aria-label'),'Chart data');
 if(type==='HexbinChart')for(const token of shapes[0].getAttribute('points').split(' ')){const [x,y]=token.split(',').map(Number);assert.ok(x>=0&&x<=300&&y>=0&&y<=200,'hex polygon stays inside the SVG');}
 if(type==='ContourChart')for(const [,x,y]of shapes[0].getAttribute('d').matchAll(/[ML]([\d.]+),([\d.]+)/g)){assert.ok(Number(x)>=0&&Number(x)<=300&&Number(y)>=0&&Number(y)<=200,'contour segment stays inside the SVG');}
 svg.listeners.pointerdown({pointerId:1,clientX:10,clientY:20,button:0,preventDefault(){}});svg.listeners.pointermove({pointerId:1,clientX:30,clientY:40,preventDefault(){}});svg.listeners.pointerup({pointerId:1});
 assert.equal(svg.children[0].getAttribute('transform'),'translate(20 20) scale(1)');svg.listeners.click({target:shapes[0]});assert.equal(picked.length,0,'drag does not activate the underlying chart target');
 svg.listeners.pointerdown({pointerId:1,clientX:100,clientY:100,button:0,preventDefault(){}});svg.listeners.pointerdown({pointerId:2,clientX:200,clientY:100,button:0,preventDefault(){}});svg.listeners.pointermove({pointerId:1,clientX:80,clientY:100,preventDefault(){}});assert.equal(Number(svg.children[0].getAttribute('transform').match(/scale\(([^)]+)/)[1]),1.2,'pinch deterministically zooms');svg.listeners.pointerup({pointerId:1});svg.listeners.pointerup({pointerId:2});
 root.children[2].children[0].listeners.click();assert.equal(svg.children[0].getAttribute('transform'),'translate(0 0) scale(1)','reset restores the original view');
 svg.listeners.wheel({deltaY:-100,offsetX:150,offsetY:100,preventDefault(){}});assert.ok(Number(svg.children[0].getAttribute('transform').match(/scale\(([^)]+)/)[1])>1,'wheel zoom works');root.children[2].children[0].listeners.click();
 svg.listeners.click({target:shapes[0]});assert.equal(picked.length,1);svg.listeners.keydown({target:shapes[0],key:'End',preventDefault(){}});assert.equal(shapes.at(-1).focused,true);
 root.listeners['htmx:beforeCleanupElement']({target:root});assert.equal(root.children.length,0);chart.destroy();assert.equal(root.classList.values.has('ely-density'),false);
}
assert.throws(()=>mountDensityChart(new Element('root'),{type:'Other',data:points}));
console.log('Density charts: exact marching-squares diamond, grid counts, finite bounds, hexbin counts, interaction, accessibility, cleanup passed');
