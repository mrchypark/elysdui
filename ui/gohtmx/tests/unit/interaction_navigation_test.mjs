import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Isolate the pure matcher from the browser registration boundary.
const source = readFileSync(new URL('../../assets/ely-api-interaction.js', import.meta.url), 'utf8');
const matcher = source.slice(source.indexOf('const paletteFit ='), source.indexOf('const selectWizardStep ='));
const document = {createTextNode: text => ({textContent: text}), createElement: tag => ({tag, textContent: ''})};
const {fit, mark} = runInNewContext(`${matcher}\n({fit: paletteFit, mark: paletteMark})`, {document});
assert.equal(fit('', 'Anything').score, 0);
assert.equal(fit('xyz', 'main.rs'), null);
assert.notEqual(fit('snt', 'src/navigation/tabs.rs'), null);
assert.equal(fit('NT', 'NewTab').score, fit('n t', 'NewTab').score);
assert.ok(fit('op', 'Open').score > fit('op', 'Other place').score);
assert.notEqual(fit('é', 'Éditer'), null);
assert.deepEqual(Array.from(fit('nt', 'NewTab').hits), [0, 3]);
const node = {textContent: '<NewTab>', replaceChildren(...children) { this.children = children; this.textContent = children.map(child => child.textContent).join(''); }};
mark(node, [1, 4]);
assert.equal(node.textContent, '<NewTab>');
assert.equal(node.children.filter(child => child.tag === 'mark').map(child => child.textContent).join(''), 'NT');
mark(node, []);
assert.equal(node.children.some(child => child.tag === 'mark'), false);
console.log('Navigation palette matching checks passed');

// Exercise the production group sorter with a minimal DOM boundary.
const list = {children: [], append(row) { this.children = this.children.filter(child => child !== row); this.children.push(row); }, querySelectorAll() { return this.children.filter(row => row.className === 'ely-interaction__palette-label'); }};
const makeOption = (label, group, recent) => {
  const text = {textContent: label, replaceChildren(...children) { this.textContent = children.map(child => child.textContent).join(''); }};
  const row = {hidden: false};
  const option = {value: label, textContent: label, dataset: {interactionPaletteGroup: group}, querySelector: () => text, hasAttribute: name => name === 'data-interaction-palette-recent' && recent !== undefined, closest: selector => selector === 'li' ? row : list, setAttribute() {}};
  if (recent !== undefined) option.dataset.interactionPaletteRecent = String(recent);
  row.option = option;
  list.append(row);
  return option;
};
makeOption('Other place', 'First');
makeOption('Open', 'Second', 1);
makeOption('Option', 'Second');
const palette = {closest: () => ({dataset: {interactionKind: 'CommandPalette'}}), querySelector: selector => selector === '[data-interaction-palette-results]' ? list : null, querySelectorAll: selector => selector === '.ely-interaction__palette-label' ? list.querySelectorAll() : list.children.filter(row => row.option).map(row => row.option)};
document.createElement = tag => ({tag, textContent: '', setAttribute() {}, remove() { list.children = list.children.filter(child => child !== this); }, get nextElementSibling() { return list.children[list.children.indexOf(this) + 1]; }});
const filterSource = source.slice(source.indexOf('  const filterPalette ='), source.indexOf('  const startSuspense ='));
const filter = runInNewContext(`${matcher}\n${filterSource}\nfilterPalette`, {document, TextEncoder});
// The heading visibility walk only needs sibling traversal on the stub rows.
list.children.forEach(row => { row.matches = () => false; Object.defineProperty(row, 'nextElementSibling', {get() { return list.children[list.children.indexOf(this) + 1]; }}); });
const create = document.createElement;
document.createElement = tag => { const element = create(tag); element.matches = selector => selector === '.ely-interaction__palette-label'; return element; };
filter(palette, 'op');
assert.deepEqual(list.children.filter(row => row.className).map(row => row.textContent), ['Second', 'First']);
assert.deepEqual(list.children.filter(row => row.option).map(row => row.option.value), ['Open', 'Option', 'Other place']);
filter(palette, '');
assert.deepEqual(list.children.filter(row => row.className).map(row => row.textContent), ['Recent', 'First', 'Second']);

const rows = [{textContent: 'New document', hidden: false, dataset: {}}, {textContent: 'Open workspace', hidden: false, dataset: {}}];
const field = {value: 'open', name: 'query', closest: () => null, parentElement: {querySelectorAll: () => rows}};
const inputSource = source.slice(source.indexOf('  const input = event =>'), source.indexOf('  const submit = event =>'));
const input = runInNewContext(`${inputSource}\ninput`, {root: {}, paletteFit: fit, closest: (_root, _target, selector) => selector === '[data-interaction-filter]' ? field : null, change() {}, filterPalette() { throw Error('plain menus must not use palette filtering'); }});
input({target: field});
assert.equal(rows[0].hidden, true);
assert.equal(rows[1].hidden, false);
field.value = '';
input({target: field});
assert.ok(rows.every(row => !row.hidden));

const openerA = {dataset: {interactionDialog: 'viewer'}}, openerB = {dataset: {interactionDialog: 'viewer'}};
const dialog = {open: false, dataset: {}, querySelector: () => null, showModal() { this.open = true; }};
const openers = new Map();
const lightboxSource = source.slice(source.indexOf('    const lightboxOpen ='), source.indexOf('    const lightboxStep ='));
const openLightbox = runInNewContext(`(target) => {${lightboxSource}}`, {root: {querySelector: () => dialog, querySelectorAll: () => [openerA, openerB]}, CSS: {escape: value => value}, dialogOpeners: openers, setLightboxZoom() {}});
openLightbox({closest: () => openerA});
openLightbox({closest: () => openerB});
assert.equal(openers.get(dialog), openerA, 'stepping must retain the initial lightbox opener');
