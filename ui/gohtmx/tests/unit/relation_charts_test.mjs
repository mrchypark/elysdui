import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../../assets/ely-relation-charts.js', import.meta.url), 'utf8').replace("import {watchChart} from '/assets/ely-chart-lifecycle.js';",'').replaceAll('export function ', 'function ');
const {circlePackingModel, chordModel, arc, ribbon} = runInNewContext(`${source}\n({circlePackingModel,chordModel,arc,ribbon})`, {Math, Number, Array, Object, TypeError, RangeError, String});

const packed = circlePackingModel({label:'All', children:[{label:'A', value:9},{label:'B', value:4},{label:'C', children:[{label:'C1', value:1},{label:'C2', value:16}]}]});
const check = node => { for (let i = 0; i < node.children.length; i++) for (let j = i + 1; j < node.children.length; j++) { const a = node.children[i], b = node.children[j], distance = Math.hypot(a.x - b.x, a.y - b.y); assert.ok(distance + 1e-9 >= a.r + b.r, `${a.label} and ${b.label} overlap`); } node.children.forEach(child => { assert.ok(Math.hypot(child.x, child.y) + child.r <= node.r + 1e-9, `${child.label} escapes ${node.label}`); check(child); }); };
check(packed);
const utilization = packed.children.reduce((sum, child) => sum + child.r ** 2, 0) / packed.r ** 2;
assert.ok(utilization > .2, `sibling packing is compact enough (${utilization})`);
assert.throws(() => circlePackingModel({label:'bad', value:0}));

const chord = chordModel(['A','B','C'], [[0,5,2],[3,0,0],[7,1,0]], .1);
assert.equal(chord.groups.reduce((sum, group) => sum + group.sweep, 0), Math.PI * 2 - .3);
assert.equal(chord.chords.find(item => item.from === 0 && item.to === 1).forward, 5);
assert.equal(chord.chords.find(item => item.from === 0 && item.to === 1).backward, 3);
assert.equal(chord.chords.reduce((sum, item) => sum + item.forward + item.backward, 0), chord.total);
assert.throws(() => chordModel(['A'], [[-1]]));
const full = arc(0, 0, 5, 10, 0, Math.PI * 2);
assert.equal((full.match(/ A/g) || []).length, 4, 'a full annulus uses two arcs per edge');
const self = {start:0, sweep:Math.PI / 2};
assert.ok(ribbon(0, 0, 10, self, self).includes(' A'), 'self chord draws a non-degenerate ring segment');
console.log('Relation charts: compact packing, enclosure/non-overlap, and symmetric chord flows passed');
