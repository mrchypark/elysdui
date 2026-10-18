import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../../assets/ely-api-interaction.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('const overlayBounds ='), source.indexOf('const menu ='));
const document = {activeElement: null};
const {bounds, trap, validate} = runInNewContext(`${helpers}\n({bounds: overlayBounds, trap: trapOverlayFocus, validate: validateOverlayForm})`, {document});
const anchor = {left: 250, top: 150, bottom: 180}, box = {width: 120, height: 100}, viewport = {width: 320, height: 240};
assert.equal(bounds(anchor, box, viewport).left, 192, 'panel clamps at right edge');
assert.equal(bounds(anchor, box, viewport).top, 44, 'panel flips above when below has no room');
assert.equal(bounds({left: 20, top: 20, bottom: 40}, box, viewport).top, 46);
assert.equal(bounds(anchor, {width: 900, height: 900}, viewport).top, 8);
assert.equal(bounds(anchor, {width: 900, height: 900}, viewport).left, 8);

let prevented = false;
const first = {closest: () => null, getClientRects: () => [1], focus() { document.activeElement = this; }};
const hidden = {closest: () => ({}), getClientRects: () => [1], focus() { throw Error('hidden item focused'); }};
const last = {...first};
const panel = {querySelectorAll: () => [first, hidden, last], contains: item => [first, hidden, last].includes(item), focus() { document.activeElement = this; }};
document.activeElement = last;
trap({shiftKey: false, preventDefault() { prevented = true; }}, panel);
assert.ok(prevented); assert.equal(document.activeElement, first);
trap({shiftKey: true, preventDefault() {}}, panel); assert.equal(document.activeElement, last);
panel.querySelectorAll = () => [];
trap({preventDefault() {}}, panel); assert.equal(document.activeElement, panel);

const field = {value: '   ', setCustomValidity(message) { this.message = message; }};
const error = {};
const form = {dataset: {interactionDisallow: '/', interactionValidationMessage: 'Names cannot hold a slash.'}, hasAttribute: () => true, querySelector: selector => selector === 'input' ? field : error};
assert.equal(validate(form), false); assert.equal(field.message, 'A name cannot be empty.');
field.value = 'Road/map'; assert.equal(validate(form), false); assert.equal(error.textContent, 'Names cannot hold a slash.');
field.value = 'Roadmap'; assert.equal(validate(form), true); assert.equal(field.message, '');

// Native close() returns focus synchronously but queues its close event. Drive
// both that task and animation frames explicitly; elapsed time is not an oracle.
const dialogFocusSource = source.slice(source.indexOf('  const dialogOpeners ='), source.indexOf('  const showTourStep ='));
const focusHarness = () => {
  const frames = new Map(), closeEvents = [], cleanups = [];
  let frameID = 0;
  const focusDocument = {body: {}, activeElement: null};
  const root = {isConnected: true};
  const opener = {isConnected: true, disabled: false, calls: 0, focus() { this.calls++; focusDocument.activeElement = this; }};
  const field = {};
  const dialog = {open: true, hidden: false, nativeRestore: true, contains: node => node === field, close() {
    this.open = false;
    focusDocument.activeElement = this.nativeRestore && opener.isConnected && !opener.disabled ? this.nativeTarget || opener : focusDocument.body;
    closeEvents.push(() => api.restoreDialogFocus(this));
  }};
  const api = runInNewContext(`${dialogFocusSource}\n({dialogOpeners, restoreDialogFocus, closeDialog})`, {
    root, document: focusDocument, lottieCleanups: cleanups,
    requestAnimationFrame(fn) { frames.set(++frameID, fn); return frameID; },
    cancelAnimationFrame(id) { frames.delete(id); },
  });
  api.dialogOpeners.set(dialog, opener);
  focusDocument.activeElement = field;
  return {...api, root, opener, field, dialog, document: focusDocument, frames,
    flushFrames() { const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); },
    flushCloseEvents() { closeEvents.splice(0).forEach(fn => fn()); },
    cleanup() { cleanups.splice(0).forEach(fn => fn()); },
  };
};
for (const phase of ['trigger', 'switch']) {
  const h = focusHarness(), nextControl = {};
  h.closeDialog(h.dialog);
  assert.equal(h.document.activeElement, h.opener, 'native close restores the opener synchronously');
  h.document.activeElement = nextControl;
  h.flushCloseEvents(); h.flushFrames();
  assert.equal(h.document.activeElement, nextControl, `a closed dialog must not steal the next popover ${phase} focus`);
}
{
  const h = focusHarness(); h.dialog.nativeRestore = false;
  h.closeDialog(h.dialog); h.flushCloseEvents(); h.flushFrames();
  assert.equal(h.document.activeElement, h.opener, 'fallback close still returns keyboard focus to the opener');
  assert.equal(h.opener.calls, 1, 'duplicate close notifications restore focus at most once');
}
{
  const h = focusHarness(), priorFocus = {};
  h.dialog.nativeTarget = priorFocus;
  h.closeDialog(h.dialog);
  assert.equal(h.document.activeElement, priorFocus, 'native close can restore an earlier target after programmatic opening');
  h.flushCloseEvents(); h.flushFrames();
  assert.equal(h.document.activeElement, h.opener, 'an owned close still restores the explicitly activated opener');
}
{
  const h = focusHarness(); h.dialog.nativeRestore = false;
  const newerOpener = {isConnected: true, disabled: false, calls: 0, focus() { this.calls++; h.document.activeElement = this; }};
  h.closeDialog(h.dialog);
  h.dialog.open = true; h.dialogOpeners.set(h.dialog, newerOpener); h.document.activeElement = h.field;
  h.closeDialog(h.dialog); h.flushCloseEvents(); h.flushFrames();
  assert.equal(h.document.activeElement, newerOpener, 'rapid close/reopen/reclose restores only the newest opener');
  assert.equal(h.opener.calls, 0, 'the older generation never restores focus');
  assert.equal(newerOpener.calls, 1, 'the newest generation restores focus once');
}
for (const interrupt of ['move-focus', 'disconnect-root', 'disconnect-opener', 'disable-opener', 'reopen', 'cleanup']) {
  const h = focusHarness(), next = {}; h.dialog.nativeRestore = false;
  h.closeDialog(h.dialog);
  if (interrupt === 'move-focus') h.document.activeElement = next;
  if (interrupt === 'disconnect-root') h.root.isConnected = false;
  if (interrupt === 'disconnect-opener') h.opener.isConnected = false;
  if (interrupt === 'disable-opener') h.opener.disabled = true;
  if (interrupt === 'reopen') { h.dialog.open = true; h.dialogOpeners.set(h.dialog, next); h.document.activeElement = h.field; }
  if (interrupt === 'cleanup') { h.cleanup(); h.root.isConnected = false; h.root.isConnected = true; }
  const expected = h.document.activeElement;
  h.flushCloseEvents(); h.flushFrames();
  assert.equal(h.document.activeElement, expected, `${interrupt} cancels stale focus restoration`);
  assert.equal(h.opener.calls, 0, `${interrupt} must not refocus the old opener`);
  if (interrupt === 'reopen') assert.equal(h.dialogOpeners.get(h.dialog), next, 'queued close must retain the reopened dialog opener');
  if (interrupt === 'cleanup') assert.equal(h.dialogOpeners.size, 0, 'cleanup releases opener references');
}
{
  const h = focusHarness(), next = {};
  h.dialog.close(); h.document.activeElement = next; h.flushCloseEvents(); h.flushFrames();
  assert.equal(h.document.activeElement, next, 'a queued native close event must respect focus already moved elsewhere');
}
console.log('Overlay dialog focus ownership, queued close, interruption, and cleanup checks passed');

// Run the production hover binding against a deterministic clock.
const events = {}, pending = new Map(), cleanups = [];
let serial = 0, delay, positions = 0;
const trigger = {disabled: false, getBoundingClientRect: () => anchor};
const card = {hidden: true, getAttribute: () => 'region'};
const host = {dataset: {interactionHover: '500'}, classList: {contains: () => true}, querySelector: selector => selector === 'button' ? trigger : card, addEventListener(type, handler) { events[type] = handler; }, removeEventListener(type) { delete events[type]; }, contains: () => false};
const hover = source.slice(source.indexOf("  root.querySelectorAll('[data-interaction-hover]')"), source.indexOf("  root.querySelectorAll('[data-interaction-dialog-form]')"));
runInNewContext(hover, {root: {dataset: {}, querySelectorAll: () => [host]}, lottieCleanups: cleanups, placeOverlay() { positions++; }, setTimeout(fn, ms) { delay = ms; pending.set(++serial, fn); return serial; }, clearTimeout(id) { pending.delete(id); }});
const tick = () => { const callbacks = [...pending.values()]; pending.clear(); callbacks.forEach(fn => fn()); };
events.pointerenter(); assert.equal(delay, 500); assert.ok(card.hidden);
events.pointerleave(); assert.equal(delay, 200); tick(); assert.ok(card.hidden, 'leaving before delay must cancel opening');
events.pointerenter(); tick(); assert.equal(card.hidden, false); assert.equal(positions, 1);
events.pointerleave(); events.pointerenter(); tick(); assert.equal(card.hidden, false, 'crossing the gap retains the card');
events.keydown({key: 'Escape', preventDefault() {}}); assert.ok(card.hidden);
trigger.disabled = true; events.pointerenter(); tick(); assert.ok(card.hidden);
cleanups.forEach(fn => fn()); assert.equal(pending.size, 0); assert.equal(Object.keys(events).length, 0);

// Lightbox arrows stop at the boundaries instead of wrapping.
let selected = -1;
const slides = [0, 1].map(index => ({dataset: {lightboxSrc: String(index)}, click() { selected = index; }}));
const viewer = {dataset: {interactionLightboxIndex: '0'}};
let forward = false;
const stepControl = {closest: () => viewer, hasAttribute: () => forward};
const stepping = source.slice(source.indexOf('    const lightboxStep ='), source.indexOf('    const zoomControl ='));
const step = runInNewContext(`() => {${stepping}}`, {target: {closest: () => stepControl}, root: {querySelectorAll: () => slides}, change() {}});
step(); assert.equal(selected, -1);
forward = true; step(); assert.equal(selected, 1);
viewer.dataset.interactionLightboxIndex = '1'; selected = -1; step(); assert.equal(selected, -1);
console.log('Overlay bounds, focus trap, validation, hover timing, and lightbox checks passed');

// Tour transitions retain caller targets and switch coach text without mutating steps.
const parts = new Map();
for (const name of ['ring', 'back', 'count', 'next', 'card', 'coach-content']) parts.set(name, {style: {}, hidden: false});
const coachTitle = {}, coachBody = {};
parts.get('coach-content').querySelector = selector => selector === 'h2' ? coachTitle : coachBody;
const skip = {};
const stops = [0, 1, 2].map(index => ({dataset: {interactionTourTarget: '#stop-' + index, interactionCoachTitle: 'Coach ' + index, interactionCoachContent: 'Body ' + index}}));
const tour = {dataset: {}, querySelectorAll: () => stops, querySelector: selector => selector === '[data-interaction-close]' ? skip : parts.get(selector.slice('[data-interaction-tour-'.length, -1))};
let tourClosed = false, targetExists = true, change;
const tourSource = source.slice(source.indexOf('  const showTourStep ='), source.indexOf('  const uploadButton ='));
const show = runInNewContext(`${tourSource}\nshowTourStep`, {root: {}, document: {querySelector: () => targetExists ? {getBoundingClientRect: () => ({...anchor, width: 40, height: 30})} : null}, closeDialog() { tourClosed = true; }, placeOverlay() {}, change(_root, payload) { change = payload; }});
show(tour, 0); assert.equal(tour.dataset.interactionTourIndex, '0'); assert.ok(parts.get('back').hidden); assert.equal(parts.get('count').textContent, '1 of 3');
show(tour, 1); assert.equal(change.index, 1); assert.equal(stops[1].hidden, false); assert.ok(stops[0].hidden);
show(tour, 2); assert.equal(parts.get('next').textContent, 'Done');
show(tour, 3); assert.equal(tour.dataset.interactionTourIndex, '2', 'arrows cannot run past last stop');
tour.dataset.interactionTourCoach = 'true'; show(tour, 1);
assert.ok(stops.every(stop => stop.hidden)); assert.equal(coachTitle.textContent, 'Coach 1'); assert.equal(coachBody.textContent, 'Body 1'); assert.ok(skip.hidden);
targetExists = false; show(tour, 0); assert.ok(tourClosed, 'a removed target must close the tour');
console.log('Overlay tour and coachmark transition checks passed');

// Exercise production selection-toolbar binding through field blur and toolbar focus.
const fieldEvents = {}, barEvents = {}, selectionCleanups = [];
const selectionField = {
  disabled: false, selectionStart: 0, selectionEnd: 6, value: 'Select these words', scrollLeft: 0,
  getBoundingClientRect: () => ({left: 20, right: 404, top: 100, bottom: 132}),
  addEventListener(type, fn) { fieldEvents[type] = fn; }, removeEventListener(type) { delete fieldEvents[type]; },
};
const toolButtons = [0, 1, 2].map(index => ({index, tabIndex: 0}));
const bar = {
  hidden: true, contains: item => toolButtons.includes(item), querySelectorAll: () => toolButtons,
  addEventListener(type, fn) { barEvents[type] = fn; }, removeEventListener(type) { delete barEvents[type]; },
};
const selectionDocument = {
  activeElement: selectionField,
  createElement: () => ({getContext: () => ({measureText: () => ({width: 0})})}),
  addEventListener() {}, removeEventListener() {},
};
const stage = {querySelector: selector => selector === '[data-interaction-selection-field]' ? selectionField : bar};
const binding = source.slice(source.indexOf("  root.querySelectorAll('[data-interaction-selection-tools]')"), source.indexOf('  const repositionOverlays ='));
runInNewContext(binding, {
  root: {querySelectorAll: () => [stage]}, document: selectionDocument,
  window: {addEventListener() {}, removeEventListener() {}}, lottieCleanups: selectionCleanups,
  getComputedStyle: () => ({font: '14px sans-serif', paddingLeft: '12px'}), placeOverlay() {},
});
assert.equal(bar.hidden, false, 'selected focused field reveals the toolbar');
selectionDocument.activeElement = null; // Browsers can expose body during field blur.
fieldEvents.blur({type: 'blur', relatedTarget: toolButtons[0]});
assert.equal(bar.hidden, false, 'blur toward a tool must not hide it');
toolButtons.forEach(button => {
  button.closest = () => bar;
  button.focus = () => { selectionDocument.activeElement = button; barEvents.focusin({type: 'focusin'}); };
});
toolButtons[0].focus();
const rovingSource = source.slice(source.indexOf('    const toolbarButton ='), source.indexOf('    const roving ='));
const rove = runInNewContext(`event => {${rovingSource}}`, {root: {}, closest: (_root, target) => target});
rove({target: toolButtons[0], key: 'ArrowRight', preventDefault() {}});
assert.equal(selectionDocument.activeElement, toolButtons[1]);
assert.equal(bar.hidden, false);
assert.deepEqual(toolButtons.map(button => button.tabIndex), [-1, 0, -1]);
rove({target: toolButtons[2], key: 'ArrowRight', preventDefault() {}});
assert.equal(selectionDocument.activeElement, toolButtons[0]);
barEvents.focusout({type: 'focusout', relatedTarget: {}});
assert.ok(bar.hidden, 'leaving field and tools hides the toolbar');
selectionDocument.activeElement = selectionField; selectionField.selectionEnd = 0;
fieldEvents.select({type: 'select'}); assert.ok(bar.hidden, 'a collapsed selection hides tools');
selectionCleanups.forEach(fn => fn());
assert.equal(Object.keys(fieldEvents).length, 0); assert.equal(Object.keys(barEvents).length, 0);
console.log('Floating toolbar keyboard focus and selection lifecycle checks passed');
