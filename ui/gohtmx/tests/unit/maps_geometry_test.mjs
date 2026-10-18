import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../assets/ely-map.js',import.meta.url),'utf8');
const api=runInNewContext(source.slice(source.indexOf('  const MAX_LAT'),source.indexOf('  // DOM starts here'))+'\n({project,unproject,written,parseCoordinate,clusterKey,panCenter,zoomAbout,heatDensity,linePath})');
const near=(a,b)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
for(const [lat,lon] of [[48.8566,2.3522],[-33.9249,18.4241],[0,179.999],[85,0]]){const [x,y]=api.project(lat,lon),back=api.unproject(x,y);near(back[0],lat);near(back[1],lon);}
near(api.project(0,0)[1],.5);assert.ok(api.project(85,0)[1]<.002,'Mercator must compress the polar edge');near(api.unproject(1.25,.5)[1],-90);
assert.equal(api.written(-33.9249,18.4241),'33.9249° S, 18.4241° E');assert.equal(api.written(-33.9249,18.4241,'dms'),'33°55′30″ S, 18°25′27″ E');assert.equal(api.written(10.9999999,20.5,'dms'),'11°00′00″ N, 20°30′00″ E');assert.equal(api.written(-.00001,-.00001),'0.0000° N, 0.0000° E');assert.equal(api.parseCoordinate('91,0'),null);assert.equal(api.parseCoordinate('48,2 garbage'),null);
const center=[48.8566,2.3522],moved=api.panCenter(center,3,-80,0,288);assert.ok(moved[1]>center[1]);near(moved[0],center[0]);const zoomed=api.zoomAbout(center,3,4,120,80,480,288);const anchor=(c,z)=>{const p=api.project(...c);return [p[0]+(120-240)/(256*2**z),p[1]+(80-144)/(256*2**z)];};const before=anchor(center,3),after=anchor(zoomed,4);near(before[0],after[0]);near(before[1],after[1]);
const route=api.linePath([[179,10],[-179,10]]),xs=[...route.matchAll(/[ML]([^ ]+)/g)].map(match=>Number(match[1]));assert.ok(Math.abs(xs[1]-xs[0])<1,'Date-line route must cross the short way');
assert.equal(api.clusterKey(48.85,2.35,3),api.clusterKey(48.851,2.351,3));assert.notEqual(api.clusterKey(48.85,2.35,3),api.clusterKey(48.85,2.35,5));
const heat=api.heatDensity([[25,25,2]],100,60,10,20);assert.equal(heat.values[2*heat.columns+2],1);assert.equal(heat.values[2*heat.columns+3],.5625);assert.equal(heat.values[2*heat.columns+6],0);const weighted=api.heatDensity([[15,15,1],[85,15,3]],100,30,10,15);assert.ok(weighted.values[18]>weighted.values[11]*2.5);
console.log('Maps: Mercator round trips, latitude clamp, longitude wrap, source coordinate formats, pointer-anchored zoom, picker pan, dateline routes, cluster buckets, and normalized weighted heat passed');
