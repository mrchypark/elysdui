import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../../assets/ely-stat-charts.js', import.meta.url), 'utf8').replace("import {watchChart} from '/assets/ely-chart-lifecycle.js';", '').replaceAll('export function ', 'function ');
const {histogramModel, spread, density, waterfallModel} = runInNewContext(`${source}\n({histogramModel,spread,density,waterfallModel})`, {Array, Math, Number, TypeError, RangeError, String, Object, console});

const bins = histogramModel([1, 2, 2.5, 9, 10], 5);
assert.deepEqual(bins.map(bin => bin.count), [1, 2, 0, 0, 2]);
assert.equal(bins.at(-1).end, 10);
assert.deepEqual(histogramModel([4, 4], 10).map(bin => bin.count), [2]);
assert.throws(() => histogramModel([1, NaN]));
assert.throws(() => histogramModel([1], 0));
assert.throws(() => histogramModel([1], 10_001));
const large = Array.from({length: 200_000}, (_, index) => index % 100);
assert.equal(histogramModel(large, 10).reduce((sum, bin) => sum + bin.count, 0), large.length, 'large input uses bounded bin allocation');

const stats = spread([1, 2, 3, 4, 5, 6, 7, 8, 100]);
assert.equal(JSON.stringify([stats.q1, stats.median, stats.q3, stats.low, stats.high, stats.outliers]), '[3,5,7,1,8,[100]]');
assert.throws(() => spread([1]));
const shape = density([0, .1, .2, 5], 40), peak = shape.reduce((best, point) => point[1] > best[1] ? point : best);
assert.ok(peak[0] < 1, 'density peak remains near the clustered values');
assert.ok(shape[0][0] < 0 && shape.at(-1)[0] > 5, 'density range includes its KDE tails');

const constant = density([7, 7, 7]);
assert.ok(constant.at(-1)[0] > constant[0][0] && constant.every(point => point.every(Number.isFinite)), 'constant groups have a finite visible density span');

const steps = waterfallModel([{label: 'Start', value: 100}, {label: 'Loss', value: -30}, {label: 'Total', total: true}, {label: 'Gain', value: 20}]);
assert.deepEqual(steps.map(step => [step.start, step.end, step.kind]), [[0, 100, 'up'], [70, 100, 'down'], [0, 70, 'total'], [70, 90, 'up']]);
assert.throws(() => waterfallModel([{label: 'bad', value: Infinity}]));
assert.ok(!source.includes("addEventListener('focusin', pointer)"), 'focus does not emit a second selection event');
assert.ok(source.includes("role: 'group'") && source.includes("role: 'button'"), 'the SVG exposes keyboard targets as accessible controls');
console.log('Stat charts: large histogram inputs, bounded bins, spreads, density, waterfall geometry, and accessibility wiring passed');
