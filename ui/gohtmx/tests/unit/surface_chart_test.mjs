import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

class Element {
  constructor(tag) { this.tagName = tag; this.attributes = {}; this.children = []; this.listeners = {}; this.style = {}; this.classList = {values: new Set(), add: value => this.classList.values.add(value), remove: value => this.classList.values.delete(value), toggle: (value, on) => on ? this.classList.values.add(value) : this.classList.values.delete(value)}; }
  setAttribute(name, value) { this.attributes[name] = String(value); } getAttribute(name) { return this.attributes[name]; }
  append(...items) { this.children.push(...items); } replaceChildren(...items) { this.children = items; this.firstChild = items[0]; }
  addEventListener(name, listener) { this.listeners[name] = listener; } removeEventListener(name) { delete this.listeners[name]; }
  dispatchEvent(event) { this.lastEvent = event; return true; } focus() { this.focused = true; } setPointerCapture() {}
  closest(selector) { return selector === '[data-surface-cell]' && this.getAttribute('data-surface-cell') ? this : null; }
}
const document = {createElementNS: (_namespace, tag) => new Element(tag), createElement: tag => new Element(tag)};
const source = readFileSync(new URL('../../assets/ely-surface-chart.js', import.meta.url), 'utf8').replace("import {watchChart} from '/assets/ely-chart-lifecycle.js';", 'let watchCalls=0;const watchChart=()=>{watchCalls++;return ()=>{};};').replaceAll('export function ', 'function ') + '\n({surfaceModel,mountSurfaceChart,getWatchCalls:()=>watchCalls})';
const frames = [], cancelled = [];
const {surfaceModel, mountSurfaceChart, getWatchCalls} = runInNewContext(source, {document, Array, Math, Number, String, TypeError, RangeError, Object, setTimeout, clearTimeout, requestAnimationFrame: callback => { frames.push(callback); return frames.length - 1; }, cancelAnimationFrame: id => cancelled.push(id), CustomEvent: class { constructor(type, init) { this.type = type; Object.assign(this, init); } }});

const grid = [[0, 1, 2], [2, 3, 4], [4, 5, 6]], model = surfaceModel(grid, {width: 320, height: 200, padding: 20, xRange: [-1, 1], yRange: [10, 20]});
assert.equal(model.cells.length, 4); assert.equal(model.min, 0); assert.equal(model.max, 6); assert.deepEqual(JSON.parse(JSON.stringify(model.cells.map(cell => [cell.col, cell.row, cell.x, cell.y, cell.z]).sort((a, b) => a[1] - b[1] || a[0] - b[0]))), [[0, 0, -.5, 12.5, 1.5], [1, 0, .5, 12.5, 2.5], [0, 1, -.5, 17.5, 3.5], [1, 1, .5, 17.5, 4.5]]);
assert.ok(model.cells.flatMap(cell => cell.points).every(([x, y]) => x >= 0 && x <= 320 && y >= 0 && y <= 200), 'bounding cube keeps every cell inside the view box');
assert.throws(() => surfaceModel([[1, 2], [3, Infinity]])); assert.throws(() => surfaceModel([[Number.MAX_VALUE, -Number.MAX_VALUE], [0, 1]])); assert.throws(() => surfaceModel(grid, {xRange: [-Number.MAX_VALUE, Number.MAX_VALUE]})); assert.throws(() => surfaceModel(Array.from({length: 101}, () => [1, 2])));

const root = new Element('root'), selected = [], chart = mountSurfaceChart(root, {grid, width: 320, height: 200, onSelect: cell => selected.push(cell)}), wrap = root.firstChild, svg = wrap.children[0], mesh = svg.children[1], cells = mesh.children;
assert.equal(cells.length, 4); assert.equal(svg.getAttribute('role'), 'group'); assert.equal(cells[0].getAttribute('role'), 'button'); assert.equal(cells[0].getAttribute('tabindex'), '0');
svg.listeners.click({target: cells[0]}); assert.equal(selected.length, 1); assert.equal(root.lastEvent.type, 'ely:surface-select'); assert.equal(cells[0].getAttribute('aria-pressed'), 'true');
svg.listeners.keydown({target: cells[0], key: 'End', preventDefault() {}}); assert.equal(selected.length, 2); assert.equal(cells.at(-1).focused, true);
svg.listeners.pointerdown({pointerId: 1, clientX: 20, clientY: 20, button: 0, target: cells[0]}); svg.listeners.pointerup({pointerId: 1, target: svg}); assert.equal(selected.length, 3, 'a captured touch tap selects its pointer-down cell when click targets svg'); svg.listeners.click({target: svg}); assert.equal(selected.length, 3, 'the retargeted click does not select twice');
svg.listeners.pointerdown({pointerId: 9, clientX: 20, clientY: 20, button: 0, target: cells[0]}); svg.listeners.pointercancel({type:'pointercancel', pointerId: 9}); assert.equal(selected.length, 3, 'canceled touches do not select a cell');
const old = cells[0].getAttribute('points'); svg.listeners.pointerdown({pointerId: 2, clientX: 20, clientY: 20, button: 0, target: cells[0]}); svg.listeners.pointermove({pointerId: 2, clientX: 60, clientY: 30, preventDefault() {}}); svg.listeners.pointermove({pointerId: 2, clientX: 80, clientY: 35, preventDefault() {}}); assert.equal(svg.children[1].children[0].getAttribute('points'), old, 'rotation waits for animation frame'); assert.equal(frames.length, 1, 'pointer moves coalesce into one animation frame'); frames.shift()(); svg.listeners.pointerup({pointerId: 2}); assert.notEqual(svg.children[1].children[0].getAttribute('points'), old, 'animation frame rotates the projection');
wrap.children[2].children[6].listeners.click(); assert.equal(selected.length, 4, 'native cell controls select a cell');
wrap.children[2].children[0].listeners.click(); assert.ok(wrap.children[1].textContent.includes('azimuth'), 'keyboard-accessible rotation controls update the live status');
root.listeners['htmx:beforeCleanupElement']({target: root}); assert.equal(root.children.length, 0); chart.destroy(); assert.equal(root.classList.values.has('ely-surface'), false); assert.equal(getWatchCalls(), 1);
const pendingRoot = new Element('root'), pending = mountSurfaceChart(pendingRoot, {grid}), pendingSvg = pendingRoot.firstChild.children[0], pendingCell = pendingSvg.children[1].children[0]; pendingSvg.listeners.pointerdown({pointerId: 3, clientX: 0, clientY: 0, button: 0, target: pendingCell}); pendingSvg.listeners.pointermove({pointerId: 3, clientX: 10, clientY: 0, preventDefault() {}}); assert.equal(frames.length, 1); pending.destroy(); assert.deepEqual(cancelled, [0], 'destroy cancels a queued rotation frame');
const reused = new Element('root'), previous = mountSurfaceChart(reused, {grid}), replacement = mountSurfaceChart(reused, {grid}); previous.destroy(); assert.equal(reused.classList.values.has('ely-surface'), true, 'old cleanup preserves the new chart class'); replacement.destroy();
console.log('Surface chart: bounded projection, numerical grid, pointer rotation, keyboard selection, controls, and cleanup passed');
