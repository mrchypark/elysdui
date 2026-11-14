import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../../assets/ely-parallel-sets.js', import.meta.url), 'utf8')
  .replace("import {watchChart} from '/assets/ely-chart-lifecycle.js';", '')
  .replaceAll('export function ', 'function ');
const {parallelSetsModel, ribbonPath} = runInNewContext(`${source}\n({parallelSetsModel,ribbonPath})`, {Array, Math, Number, String, Object, Set, Map, TypeError, RangeError});

const model = parallelSetsModel(['Channel', 'Plan', 'Retained'], [
  {path: ['Web', 'Pro', 'Yes'], count: 30},
  {path: ['Web', 'Free', 'No'], count: 10},
  {path: ['Store', 'Pro', 'Yes'], count: 20},
]);
assert.equal(model.total, 60); assert.equal(model.bars.length, 6); assert.equal(model.segments.length, 6);
for (const segment of model.segments) { assert.ok(segment.thickness > 0); assert.ok(segment.x2 > segment.x1); assert.match(ribbonPath(segment), / C/); }
for (const dim of [0, 1, 2]) { const bars = model.bars.filter(bar => bar.dim === dim).sort((a, b) => a.y - b.y); for (let index = 1; index < bars.length; index++) assert.ok(bars[index].y >= bars[index - 1].y + bars[index - 1].height, 'category bars do not overlap'); assert.ok(Math.abs(bars.reduce((sum, bar) => sum + bar.count, 0) - model.total) < 1e-9, 'each dimension preserves the flow total'); }
assert.throws(() => parallelSetsModel(['A'], [{path: ['x'], count: 1}]), /2 to 8 dimensions/);
assert.throws(() => parallelSetsModel(['A', 'B'], [{path: ['x', 'y'], count: 0}]));
assert.throws(() => parallelSetsModel(['A', 'B'], [{path: ['x'], count: 1}]));
assert.throws(() => parallelSetsModel(['A', 'B'], Array.from({length: 401}, () => ({path: ['x', 'y'], count: 1}))));
assert.throws(() => parallelSetsModel(['A', 'B'], Array.from({length: 65}, (_, index) => ({path: [String(index), 'y'], count: 1}))));
assert.throws(() => parallelSetsModel(['A', 'B'], [{path: ['x', 'y'], count: Number.MAX_VALUE}, {path: ['x', 'y'], count: Number.MAX_VALUE}]), /total count must remain finite/);
assert.ok(!source.includes('innerHTML'), 'the chart creates safe text nodes instead of HTML strings');
assert.match(source, /watchChart\(root, wrap, destroy\)/, 'mounting registers lifecycle cleanup');
const css = readFileSync(new URL('../../assets/ely-parallel-sets.css', import.meta.url), 'utf8');
assert.match(css, /touch-action:manipulation/, 'mobile touch interaction has a browser-level bound');
console.log('Parallel sets: deterministic stacked flow layout, bounded input, safe text, and lifecycle wiring passed');
