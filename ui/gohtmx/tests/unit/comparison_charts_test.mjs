import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../../assets/ely-comparison-charts.js', import.meta.url), 'utf8').replace("import {watchChart} from '/assets/ely-chart-lifecycle.js';\n", '').replaceAll('export function ', 'function ');
const {differenceModel, ridgeDensity, ridgelineModel} = runInNewContext(`${source}\n({differenceModel,ridgeDensity,ridgelineModel})`, {Math, Number, Array, Object, TypeError, RangeError, String, Infinity});

const difference = differenceModel([{x:0,y:4},{x:10,y:0},{x:20,y:null},{x:30,y:2}], [{x:0,y:0},{x:10,y:4},{x:20,y:null},{x:30,y:1}]);
assert.equal(difference.regions.length, 2, 'a crossing produces two fills');
assert.equal(difference.regions[0].points[1].x, 5, 'crossing uses interpolation');
assert.equal(difference.regions[1].points[0].x, 5, 'both fills meet at the crossing');
assert.ok(difference.regions.every(region => region.points.every(point => point.x < 20)), 'gaps do not create fills');
assert.throws(() => differenceModel([{x:1,y:1},{x:0,y:2}], [{x:1,y:0},{x:0,y:0}]));

const density = ridgeDensity([0,.1,.2,5], 32), peak = density.reduce((best, point) => point.density > best.density ? point : best);
assert.equal(density.length, 32); assert.ok(peak.x < 1); assert.throws(() => ridgeDensity([1,2], 129));
const constant = ridgeDensity([7,7,7], 16);
assert.ok(constant.every(point => Number.isFinite(point.x) && Number.isFinite(point.density)), 'constant groups create finite density points');
assert.ok(constant.at(-1).x > constant[0].x && constant.some(point => point.density > 0), 'constant groups create a visible density span');
const ridges = ridgelineModel([{label:'A',values:[1,2,3]},{label:'B',values:[4,5,6]}], 16);
assert.equal(ridges.length, 2); assert.equal(ridges[0].density.length, 16); assert.throws(() => ridgelineModel([{label:'bad',values:[1]}]));
assert.ok(!source.includes("addEventListener('pointerup'"), 'native click is the only pointer activation path');
console.log('Comparison charts: interpolated difference crossings, gap preservation, bounded KDE, and validation passed');
