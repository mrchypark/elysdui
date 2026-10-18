import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('./assets/ely-api-interaction.js', import.meta.url), 'utf8');
const matcher = source.slice(source.indexOf('const paletteFit ='), source.indexOf('const selectWizardStep ='));
const document = {createTextNode: text => ({textContent: text}), createElement: tag => ({tag, textContent: ''} )};
const list = {children: [], append(row) { this.children = this.children.filter(child => child !== row); this.children.push(row); }};
for (const [text, structural] of [['Other place', false], ['Section', true], ['Open', false], ['Option', false], ['Open', false]]) {
  const label = {textContent: text, replaceChildren(...children) { this.children = children; this.textContent = children.map(child => child.textContent).join(''); }};
  list.children.push({textContent: text, dataset: {}, hidden: false, parentElement: list, matches: () => structural, querySelector: () => structural ? null : label, label});
}
const original = [...list.children];
const field = {value: 'op', name: 'query', closest: () => null, parentElement: {querySelectorAll: () => list.children}};
const inputSource = source.slice(source.indexOf('  const input = event =>'), source.indexOf('  const submit = event =>'));
const changes = [];
const input = runInNewContext(`${matcher}\n${inputSource}\ninput`, {document, root: {}, closest: (_root, _target, selector) => selector === '[data-interaction-filter]' ? field : null, change: (_root, payload) => changes.push(payload)});
input({target: field});
assert.deepEqual(list.children.filter(row => !row.hidden).map(row => row.textContent), ['Open', 'Option', 'Open', 'Other place']);
assert.equal(original[1].hidden, true, 'queries suppress headings');
assert.equal(original[2].label.children.filter(child => child.tag === 'mark').map(child => child.textContent).join(''), 'Op');
field.value = 'zzz'; input({target: field});
assert.ok(list.children.every(row => row.hidden));
field.value = 'op'; input({target: field});
assert.equal(list.children[0], original[2], 'equal scores retain source order across queries');
assert.equal(list.children[1], original[3]);
assert.equal(list.children[2], original[4]);
field.value = ''; input({target: field});
assert.deepEqual(list.children, original, 'clearing restores headings and source order');
assert.ok(list.children.every(row => !row.hidden));
assert.equal(changes.at(-1).value, '');

// Exercise the production radio branch, including independent groups and close.
let closed = false;
const radios = ['density', 'density', 'color'].map(group => ({dataset: {interactionMenuRadio: group}, setAttribute(_name, value) { this.checked = value; }, checked: 'true'}));
radios[1].value = 'compact';
const radioPanel = {querySelectorAll: () => radios};
radios.forEach(radio => radio.closest = () => radioPanel);
const radioSource = source.slice(source.indexOf('    if (radio) {'), source.indexOf('    if (checkbox) {'));
runInNewContext(`(() => {${radioSource}})()`, {radio: radios[1], root: {}, change() {}, menuAction() {}, event: {}, close(restore) { closed = restore; }});
assert.deepEqual(radios.map(item => item.checked), ['false', 'true', 'true']);
assert.ok(closed, 'radio selection closes and restores focus');

// Search input arrows and Enter operate on enabled, visible results only.
let focused, picked;
const options = [true, false, false].map((hidden, index) => ({closest: () => hidden, focus() { focused = index; }, click() { picked = index; }}));
const searchField = {parentElement: {querySelectorAll: () => options}};
const keys = source.slice(source.indexOf('    const searchField ='), source.indexOf('    const pie = closest(root, event.target'));
const key = runInNewContext(`event => {${keys}}`, {root: {}, closest: () => searchField});
key({key: 'ArrowDown', preventDefault() {}}); assert.equal(focused, 1);
key({key: 'ArrowUp', preventDefault() {}}); assert.equal(focused, 2);
key({key: 'Enter', preventDefault() {}}); assert.equal(picked, 1);
console.log('Menu filtering, radio state, and keyboard checks passed');
