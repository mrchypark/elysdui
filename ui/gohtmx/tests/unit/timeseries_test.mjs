import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../assets/ely-timeseries.js',import.meta.url),'utf8')
 .replace("import uPlot from '/assets/uPlot.esm.js';",'const uPlot = {};')
 .replace("import {watchChart} from '/assets/ely-chart-lifecycle.js';",'')
 .replaceAll('export function ','function ')
 .concat('\n({createRangeIndex,appendRangeIndex,reduceTimeSeries,createYScale,createTimeSeriesLink});');
const {createRangeIndex,appendRangeIndex,reduceTimeSeries,createYScale,createTimeSeriesLink}=runInNewContext(source,{Float64Array,Uint32Array,Math,Number,Set,RangeError,TypeError,Object});

// Compare multilevel query extrema with a brute-force oracle over varied ranges.
const values=Float64Array.from({length:4099},(_,i)=>i%197===0?NaN:Math.sin(i*.17)*100+(i%23));
const index=createRangeIndex(values),x=new Float64Array(values.length);
for(let i=1;i<x.length;i++)x[i]=x[i-1]+1+(i%7);
for(const [start,end] of [[0,4098],[1,4097],[127,129],[130,3999],[500,3000],[4090,4098]]){
 const reduced=reduceTimeSeries(x,[values],[index],x[start],x[end],13),got=new Set(reduced[0].map(v=>x.indexOf(v)));
 for(let bucket=0;bucket<13;bucket++){
  const lo=x[start]+(x[end]-x[start])*bucket/13,hi=x[start]+(x[end]-x[start])*(bucket+1)/13;
  const a=Math.max(start,[...x].findIndex(v=>v>=lo)),b=bucket===12?end-1:Math.min(end-1,[...x].findIndex(v=>v>=hi)-1);if(b<a)continue;
  const finite=[];for(let i=a;i<=b;i++)if(Number.isFinite(values[i]))finite.push(i);
  if(finite.length){assert.ok(got.has(finite.reduce((p,q)=>values[q]<values[p]?q:p)),`bucket minimum retained ${start}:${end}:${bucket}:${a}:${b}`);assert.ok(got.has(finite.reduce((p,q)=>values[q]>values[p]?q:p)),`bucket maximum retained ${start}:${end}:${bucket}:${a}:${b}`);}
 }
}
const gaps=Float64Array.from([1,2,NaN,NaN,5,6,7,NaN,9,10]),gx=Float64Array.from([0,1,2,3,4,5,6,7,8,9]);
const gapOut=reduceTimeSeries(gx,[gaps],[createRangeIndex(gaps)],0,9,1);
for(const i of [1,2,3,4,6,7,8])assert.ok(gapOut[0].includes(gx[i]),`gap boundary ${i} retained in one wide bucket`);
const runs=Float64Array.from([0,50,0,NaN,0,20,0]),runX=Float64Array.from([0,1,2,3,4,5,6]);
const runOut=reduceTimeSeries(runX,[runs],[createRangeIndex(runs)],0,6,1);
assert.ok(runOut[0].includes(1) && runOut[0].includes(5),'each disconnected run retains its own extrema');
const independent=[Float64Array.from([1,NaN,8,3]),Float64Array.from([1,7,NaN,3])],independentX=Float64Array.from([0,1,2,3]);
const independentOut=reduceTimeSeries(independentX,independent,independent.map(createRangeIndex),0,3,1);
for(let s=0;s<independent.length;s++) for(let i=0;i<independentX.length;i++) {
 const pos=independentOut[0].indexOf(independentX[i]);
 assert.ok(pos>=0);
 assert.equal(independentOut[s+1][pos],Number.isFinite(independent[s][i])?independent[s][i]:null);
}
const irregularX=Float64Array.from([0,1,5,6,20,21,80,81,200]);
const irregularY=Float64Array.from([0,1,5,6,20,21,80,81,200]);
const bucketed=reduceTimeSeries(irregularX,[irregularY],[createRangeIndex(irregularY)],0,200,4);
assert.deepEqual([...bucketed[0]],[0,21,80,81,200]);
assert.equal(bucketed[0].at(-1),200,'the final maxX sample belongs to the last pixel bucket');
const viewportX=Float64Array.from([0,100]),viewportY=Float64Array.from([0,100]);
assert.deepEqual(JSON.parse(JSON.stringify(reduceTimeSeries(viewportX,[viewportY],[createRangeIndex(viewportY)],25,75,64))),[[0,100],[0,100]],'viewport reduction retains both boundary neighbors when it contains no samples');
const viewportGapX=Float64Array.from([0,50,100]),viewportGapY=Float64Array.from([1,NaN,2]);
assert.deepEqual(JSON.parse(JSON.stringify(reduceTimeSeries(viewportGapX,[viewportGapY],[createRangeIndex(viewportGapY)],25,75,64))),[[0,50,100],[1,null,2]],'boundary neighbors retain missing-value breaks');
const appended=Float64Array.from([3,NaN,8,1,NaN,12,2]);
const incremental=createRangeIndex(appended.subarray(0,5));
appendRangeIndex(incremental,appended,5);
const rebuilt=createRangeIndex(appended);
const appendedX=Float64Array.from([0,1,2,3,4,5,6]);
assert.deepEqual(JSON.stringify(reduceTimeSeries(appendedX,[appended],[incremental],0,6,2)),JSON.stringify(reduceTimeSeries(appendedX,[appended],[rebuilt],0,6,2)),'incremental index matches rebuild including gaps');
assert.throws(()=>appendRangeIndex(incremental,appended,5),/invalid index append/);
const symlog=createYScale({type:'symlog',constant:3});
for(const value of [-100,-1,0,1,100]) assert.ok(Math.abs(symlog.bwd(symlog.fwd(value))-value)<1e-10,'symlog round trip');
assert.equal(createYScale({type:'log',base:2}).distr,3);
assert.throws(()=>createYScale({type:'log',base:1}),/base/);
assert.throws(()=>createYScale({type:'symlog',constant:0}),/constant/);
const link=createTimeSeriesLink(), first={}, updates=[];
const stopFirst=link.subscribe(first,update=>updates.push(['first',update]));
link.setViewport(first,{min:2,max:8});
link.setViewport(first,{min:2,max:8});
link.setSelectedX(first,5);
const stopSecond=link.subscribe({},update=>updates.push(['second',update]));
link.setSelectedX(first,5);
link.setSelectedX(first,null);
assert.deepEqual(JSON.parse(JSON.stringify(updates)),[
 ['second',{viewport:{min:2,max:8},selectedX:5}],
 ['second',{selectedX:null}],
],'link retains the latest viewport and selection, skips its source, and deduplicates updates');
stopFirst(); stopSecond();
assert.throws(()=>link.setViewport(first,{min:8,max:2}),/viewport/);
console.log('Time series decimation: extrema hierarchy, NaN boundaries, and irregular timestamp pixel buckets passed');
