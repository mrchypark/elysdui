import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class Element {
  constructor(tag) { this.tagName = tag; this.attributes = {}; this.children = []; this.listeners = {}; this.textContent = ''; this.classList = {values: new Set(), add: x => this.classList.values.add(x), remove: x => this.classList.values.delete(x), toggle: (x, on) => on ? this.classList.values.add(x) : this.classList.values.delete(x)}; }
  setAttribute(key, value) { this.attributes[key] = String(value); }
  getAttribute(key) { return this.attributes[key]; }
  append(...items) { this.children.push(...items); }
  replaceChildren(...items) { this.children = items; this.firstChild = items[0]; }
  addEventListener(key, fn) { this.listeners[key] = fn; }
  removeEventListener(key) { delete this.listeners[key]; }
  dispatchEvent(event) { this.lastEvent = event; return true; }
  focus() { this.focused = true; }
  closest(selector) { return selector === '[role="button"]' && this.getAttribute('role') === 'button' ? this : null; }
}
const document = {createElementNS: (_ns, tag) => new Element(tag), createElement: tag => new Element(tag)};
const source = readFileSync(new URL('../../assets/ely-horizon-charts.js', import.meta.url), 'utf8')
  .replace("import {watchChart} from '/assets/ely-chart-lifecycle.js';", 'let watchCalls=0; const watchChart=()=>{watchCalls++;return ()=>{};};')
  .replaceAll('export function ', 'function ') + '\n({horizonModel,radialLineModel,mountHorizonChart,getWatchCalls:()=>watchCalls})';
const {horizonModel,radialLineModel,mountHorizonChart,getWatchCalls} = runInNewContext(source, {document, Array, Math, Number, String, TypeError, RangeError, Object, Set, CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } } });

const horizon = horizonModel([{label: 'wave', values: [2, 4, null, -2, -4]}], {bands: 2});
assert.equal(horizon.bandWidth, 2);
assert.deepEqual(JSON.parse(JSON.stringify(horizon.series[0].groups.map(g => [g.sign, g.band, g.indices, g.amplitudes]))), [
  [1, 0, [0, 1], [2, 2]], [1, 1, [0, 1], [0, 2]], [-1, 0, [3, 4], [2, 2]], [-1, 1, [3, 4], [0, 2]],
]);
assert.throws(() => horizonModel([{label:'bad', values:[1, Infinity]}]));
assert.throws(() => horizonModel([{label:'bad', values:[1]}], {bands: 9}));
assert.throws(() => horizonModel(Array.from({length: 33}, (_, i) => ({label: String(i), values:[1]}))));
const allMissing = horizonModel([{label:'none', values:[null, null]}]);assert.equal(allMissing.series[0].groups.length, 0);

const radial = radialLineModel([{label:'spoke', values:[0, 2, null, 1]}], {width:200, height:200, radius:80});
assert.deepEqual(JSON.parse(JSON.stringify(radial.series[0].segments.map(s => s.map(p => p.index)))), [[0, 1], [3]]);
const p = radial.series[0].points[1];assert.equal(p.angle, 0);assert.equal(p.radius, 80);assert.equal(p.x, 180);assert.equal(p.y, 100);
assert.equal(radial.series[0].points[3].x, 60);assert.ok(Math.abs(radial.series[0].points[3].y-100)<1e-12);
assert.throws(() => radialLineModel([{label:'bad', values:[-1]}]));
assert.throws(() => radialLineModel([{label:'bad', values:[3]}], {maxValue:2}));
assert.equal(radialLineModel([{label:'zero', values:[0,0]}]).maxValue, 1, 'all-zero series has a finite radial scale');

for (const type of ['HorizonChart', 'RadialLineChart']) {
  const values = type === 'HorizonChart' ? [1, 3, null, -2] : [1, 3, null, 2];
  const root = new Element('root'), selected = [], chart = mountHorizonChart(root, {type, data:[{label:'series', values}], width:320, onSelect: item => selected.push(item)}), wrap = root.firstChild, svg = wrap.children.find(item => item.tagName === 'svg'), targets = [];
  const scan = node => { if (node.getAttribute('role') === 'button') targets.push(node); node.children.forEach(scan); };scan(svg);assert.ok(targets.length > 0);assert.equal(svg.getAttribute('role'), 'group');
  if (type === 'HorizonChart') {
    assert.ok(targets.every(target => target.getAttribute('d').endsWith('Z')), 'bands render filled areas'); assert.ok(new Set(targets.map(target => target.getAttribute('data-band'))).size >= 2);
    const baselines = targets.map(target => Number(target.getAttribute('d').match(/^M[^,]+,([\d.]+)/)[1]));
    assert.equal(new Set(baselines).size, 1, 'positive and negative color bands fold around one shared baseline');
    assert.ok(targets.some(target => target.getAttribute('data-band') === '1' && target.getAttribute('d').includes('121.33333333333333,24')), 'band threshold crossing is interpolated between data samples');
    const ys = targets.flatMap(target => [...target.getAttribute('d').matchAll(/[ML][^,]+,([\d.]+)/g)].map(match => Number(match[1])));
    assert.ok(Math.max(...ys) - Math.min(...ys) <= 40, 'all bands fit the compact two-sided row rather than separate band strips');
  }
  else { assert.ok(targets.every(target => Number(target.getAttribute('r')) === 10), 'radial samples have touch sized hit targets'); assert.ok(svg.children.filter(child => child.getAttribute('class') === 'ely-radial-line').length >= 2, 'missing samples create separate radial paths'); }
  svg.listeners.click({target:targets[0]});assert.equal(selected.length, 1);
  svg.listeners.keydown({target:targets[0], key:'End', preventDefault(){}});assert.equal(targets.at(-1).focused, true);
  root.listeners['htmx:beforeCleanupElement']({target:root});assert.equal(root.children.length, 0);chart.destroy();
}
assert.equal(getWatchCalls(), 2, 'each mount registers with watchChart for detached DOM cleanup');
assert.throws(() => mountHorizonChart(new Element('root'), {type:'Other', data:[{label:'x', values:[1]}]}));
console.log('Horizon/radial charts: exact signed band slices, missing-value segment breaks, polar coordinates, finite validation, keyboard selection, and cleanup passed');
