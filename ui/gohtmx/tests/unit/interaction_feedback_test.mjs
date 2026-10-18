import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../../assets/ely-api-interaction.js', import.meta.url), 'utf8');
const helpers = source.slice(source.indexOf('const feedbackToaster ='), source.indexOf("register('interaction'"));
const classes = () => { const values = new Set(); return {add: (...names) => names.forEach(name => values.add(name)), toggle: (name, on) => on ? values.add(name) : values.delete(name), contains: name => values.has(name)}; };
const span = () => ({dataset: {}, style: {setProperty() {}}, classList: classes(), setAttribute() {}});
const {toaster: createToaster, notifications: refreshNotifications, saving: setSaving} = runInNewContext(`${helpers}\n({toaster: feedbackToaster, notifications: feedbackNotifications, saving: feedbackSaving})`, {document: {createElement: span}, matchMedia: () => ({matches: false})});

// A deterministic external clock exercises the production queue, including pause and cleanup.
let now = 0, serial = 0;
const timers = new Map();
const clock = {now: () => now, set(fn, ms) { timers.set(++serial, {fn, at: now + ms}); return serial; }, clear(id) { timers.delete(id); }};
const advance = ms => { const end = now + ms; while (true) { const next = [...timers].filter(([,t]) => t.at <= end).sort((a,b) => a[1].at-b[1].at)[0]; if (!next) break; now = next[1].at; timers.delete(next[0]); next[1].fn(); } now = end; };
const row = (key, stay = 5000, hidden = true) => ({
  dataset: {interactionToast: key, feedbackStay: String(stay), value: `caller-${key}`}, hidden, style: {setProperty() {}},
  cloneNode() { return row(key, stay, hidden); },
  remove() { this.parent.children = this.parent.children.filter(child => child !== this); this.isConnected = false; },
});
const recipes = [row('0'), row('1', 0), row('2', 9000)];
const events = {};
const stack = {children: [...recipes], classList: classes(),
  querySelectorAll(selector) { return this.children.filter(child => selector.includes(':not') ? !child.hidden : true); },
  append(child) { this.children = this.children.filter(item => item !== child); this.children.push(child); child.parent = this; child.isConnected = true; },
  addEventListener(type, fn) { events[type] = fn; }, removeEventListener(type) { delete events[type]; },
};
const changes = [];
const queue = createToaster(stack, detail => changes.push(detail), clock);
const first = queue.show('0'); assert.equal(first.hidden, false); assert.equal(changes.at(-1).value, 'caller-0');
advance(2000); events.pointerenter(); advance(10000); assert.equal(first.isConnected, true, 'hover pauses expiry');
events.pointerleave(); advance(2999); assert.equal(first.isConnected, true); advance(1); assert.equal(first.isConnected, false, 'resume uses only remaining time');
const relaunched = queue.show('0'); assert.notEqual(first, relaunched); queue.dismiss(relaunched, 'undo'); assert.equal(relaunched.isConnected, false); assert.equal(changes.at(-1).reason, 'undo');
const persistent = queue.show('1'); advance(100000); assert.equal(persistent.isConnected, true, 'Stay=0 is persistent');
const pushed = Array.from({length:4}, () => queue.show('0')); assert.equal(persistent.isConnected, false, 'fifth toast evicts oldest'); assert.equal(pushed.filter(item => item.isConnected).length, 4);
assert.equal(stack.children.filter(item => item.hidden).length, 3, 'recipes survive repeat pushes');
assert.equal(queue.show('missing'), null);
queue.hold(true); const whileHeld = queue.show('2'); advance(20000); assert.equal(whileHeld.isConnected, true); queue.hold(false); advance(8999); assert.equal(whileHeld.isConnected, true); advance(1); assert.equal(whileHeld.isConnected, false);
queue.show('0'); queue.destroy(); assert.equal(timers.size, 0); assert.deepEqual(Object.keys(events), []);

// Notification header and group visibility derive from the actual remaining rows.
const makeNote = (group, unread) => ({dataset: {interactionNotificationGroup: group}, hasAttribute: () => unread});
let notes = [makeNote('Today', true), makeNote('Earlier', false)];
const controls = Object.fromEntries(['[data-feedback-unread]', '[data-interaction-notification-read]', '[data-interaction-notification-clear]', '[data-feedback-notification-empty]'].map(key => [key, {}]));
const groups = ['Today', 'Earlier'].map(group => ({dataset: {feedbackGroup: group}}));
const notification = {querySelector: selector => controls[selector], querySelectorAll: selector => selector === '[data-interaction-notification]' ? notes : groups};
refreshNotifications(notification); assert.equal(controls['[data-feedback-unread]'].textContent, '1 new'); assert.equal(controls['[data-interaction-notification-read]'].hidden, false);
notes = [makeNote('Earlier', false)]; refreshNotifications(notification); assert.equal(groups[0].hidden, true); assert.equal(groups[1].hidden, false); assert.equal(controls['[data-interaction-notification-read]'].hidden, true);
notes = []; refreshNotifications(notification); assert.equal(controls['[data-feedback-notification-empty]'].hidden, false); assert.equal(controls['[data-interaction-notification-clear]'].hidden, true); assert.ok(groups.every(group => group.hidden));

const state = (label, name, retry = false, icon = '') => ({textContent: label, dataset: {state: name, icon}, hasAttribute: () => retry});
const makeStatus = (name, values, retry = null) => {
  const output = {dataset: {}, textContent: '', classList: classes(), prepend(icon) { this.icon = icon; }, animate() { this.animations = (this.animations || 0) + 1; }};
  return {dataset: {feedbackStatus: name}, output, querySelectorAll: () => values, querySelector: selector => selector === '[data-interaction-saving-state]' ? output : retry};
};
const retry = {};
const saving = makeStatus('saving', [state('Saving…', 'saving'), state('Saved', 'saved'), state("Couldn't save", 'failed', true)], retry);
const sync = makeStatus('sync', [state('Syncing 12 items', 'syncing', false, 'refresh-cw'), state('Up to date', 'synced'), state('Sync paused', 'paused'), state('Sync failed', 'failed')]);
setSaving(saving, 0, false); setSaving(sync, 0, false); assert.equal(saving.output.animations, undefined);
setSaving(saving, 2); assert.equal(retry.hidden, false); assert.equal(saving.output.classList.contains('is-failed'), true); assert.equal(sync.output.textContent, 'Syncing 12 items');
const detail = setSaving(sync, 3); assert.equal(detail.name, 'sync'); assert.equal(detail.state, 'failed'); assert.equal(saving.output.textContent, "Couldn't save");
setSaving(saving, 0); assert.equal(retry.hidden, true); assert.equal(saving.output.classList.contains('is-failed'), false);
setSaving(sync, 4); assert.equal(sync.output.dataset.interactionSavingIndex, '0'); assert.equal(sync.output.icon.dataset.interactionIcon, 'refresh-cw');
const connection = makeStatus('connection', [state('Connected', 'online'), state('Offline', 'offline')]); setSaving(connection, 1); assert.equal(connection.output.icon.classList.contains('ely-interaction__connection-dot'), true);

// Invoke the real click branch to verify caller messages and retry transitions.
const branch = source.slice(source.indexOf('    const toastShow ='), source.indexOf('    const shimmer ='));
const click = runInNewContext(`(target) => {${branch}}`, {root: {querySelector: () => status}, change(_root, detail) { changes.push(detail); }, feedbackSaving: setSaving});
const status = {};
const confirm = {value: 'caller-record', dataset: {feedbackMessage: 'Caller confirmed', elyAction: 'caller-confirm'}, textContent: 'Confirm'};
click({closest: selector => selector === '.ely-interaction__confirmation [data-ely-action]' ? confirm : null});
assert.equal(status.textContent, 'Caller confirmed'); assert.equal(changes.at(-1).value, 'caller-record'); assert.equal(changes.at(-1).action, 'caller-confirm');
const retryControl = {closest: () => saving, hasAttribute: () => true};
setSaving(saving, 2); click({closest: selector => selector === '[data-interaction-saving-next], [data-interaction-saving-retry]' ? retryControl : null});
assert.equal(saving.output.textContent, 'Saving…'); assert.equal(retry.hidden, true);
console.log('Feedback toast clocks, repeat pushes, capacity, cleanup, notification states, independent statuses and caller actions passed');

// Browser regression contract: the production launch branch creates a fresh live row,
// while the hidden recipe stays hidden. Dismissal folds, then removes only that row.
let cancels = 0;
const animatedRecipe = row('animated');
animatedRecipe.cloneNode = () => {
  const node = row('animated'); node.offsetHeight = 60;
  node.animate = (_frames, options) => { assert.equal(options.duration, 200); return {cancel() { cancels++; }}; };
  node.cloneNode = animatedRecipe.cloneNode;
  return node;
};
stack.children = [animatedRecipe];
const animatedQueue = createToaster(stack, detail => changes.push(detail), clock);
const toastClick = runInNewContext(`target => {${branch}}`, {toaster: animatedQueue});
const launcher = {dataset: {interactionToastShow: 'animated'}};
const pressLauncher = () => toastClick({closest: selector => selector === '[data-interaction-toast-show]' ? launcher : null});
pressLauncher();
const instance = stack.children.find(child => child.dataset.feedbackLive);
assert.ok(instance && !instance.hidden); assert.equal(animatedRecipe.hidden, true);
const dismissButton = {dataset: {}, closest: () => instance};
toastClick({closest: selector => selector.includes('[data-interaction-toast-dismiss]') ? dismissButton : null});
assert.equal(instance.inert, true); assert.equal(instance.isConnected, true);
advance(199); assert.equal(instance.isConnected, true); advance(1); assert.equal(instance.isConnected, false);
pressLauncher(); assert.equal(stack.children.filter(child => child.dataset.feedbackLive).length, 1);
const last = stack.children.find(child => child.dataset.feedbackLive); animatedQueue.dismiss(last); animatedQueue.destroy();
assert.equal(last.isConnected, false); assert.equal(timers.size, 0); assert.equal(cancels, 2);
console.log('Toast launch/action audit contracts and animated exit cleanup passed');

let fold, foldDelay, foldCancelled = false;
const banner = {hidden: false, inert: false, offsetHeight: 36, animate() { return {cancel() { foldCancelled = true; }}; }};
const restore = {hidden: true, removeAttribute() { this.hidden = false; }};
const stage = {querySelector: selector => selector === '[data-interaction-banner]' ? banner : restore};
const foldCleanups = [];
const foldClick = runInNewContext(`target => {${branch}}`, {root: {}, change() {}, matchMedia: () => ({matches: false}), lottieCleanups: foldCleanups, later(fn, ms) { fold = fn; foldDelay = ms; }});
foldClick({closest: selector => selector === '[data-interaction-banner-dismiss]' ? {closest: () => stage} : null});
assert.equal(banner.inert, true); assert.equal(banner.hidden, false); assert.equal(foldDelay, 200);
fold(); assert.equal(banner.hidden, true); assert.equal(banner.inert, false); assert.equal(restore.hidden, false); assert.equal(foldCancelled, true); assert.equal(foldCleanups.length, 0);
console.log('Banner source fold and restore-control lifecycle passed');

// Exercise the complete family click dispatcher, including its ownership guard.
const fullClickSource = source.slice(source.indexOf('  const click = event => {', source.indexOf("register('interaction'")), source.indexOf('  const input = event => {', source.indexOf("register('interaction'")));
const family = {dataset: {}};
class ClickTarget {
  constructor(kind, toast = null) { this.kind = kind; this.toast = toast; this.dataset = kind === 'launch' ? {interactionToastShow: 'animated'} : kind === 'undo' ? {elyAction: 'undo'} : {}; }
  matches() { return false; }
  closest(selector) {
    if (selector === '[data-ely-family]') return family;
    if (selector === 'button, [data-interaction-draggable]') return this;
    if (selector === '.ely-interaction__toast') return this.toast;
    if (selector === '[data-interaction-toast-show]' && this.kind === 'launch') return this;
    if (selector === '.ely-interaction__toast [data-interaction-toast-dismiss], .ely-interaction__toast [data-ely-action]' && this.kind !== 'launch') return this;
    return null;
  }
}
stack.children = [animatedRecipe];
const fullQueue = createToaster(stack, detail => changes.push(detail), clock);
const dispatchClick = runInNewContext(`${fullClickSource}\nclick`, {root: family, Element: ClickTarget, HTMLDialogElement: class {}, sourceFamily: {click: () => false}, loadingFamily: {click: () => false}, toaster: fullQueue, closest: (root, target, selector) => target.closest(selector)?.closest('[data-ely-family]') === root ? target.closest(selector) : null});
for (const kind of ['dismiss', 'dismiss', 'undo']) {
  dispatchClick({target: new ClickTarget('launch')});
  const live = stack.children.find(child => child.dataset.feedbackLive);
  assert.ok(live && !live.hidden);
  dispatchClick({target: new ClickTarget(kind, live)});
  assert.equal(live.inert, true, `${kind} reaches the toast exit through the full dispatcher`);
  advance(200); assert.equal(live.isConnected, false);
}
fullQueue.destroy();
console.log('Full family dispatcher: toast dismissal, relaunch and Undo exits passed');

// Window timer APIs reject a clock object as receiver. Exercise the default adapter,
// rather than only an injected clock whose methods accept arbitrary receivers.
let nativeTimer, nativeCleared = false;
const nativeContext = {document:{createElement:span}, matchMedia:()=>({matches:false}), performance:{now:()=>0},
 setTimeout:function(fn){ assert.equal(this,undefined,'timer must be called without the clock receiver');nativeTimer=fn;return 9; },
 clearTimeout:function(){ assert.equal(this,undefined,'clear must be called without the clock receiver');nativeCleared=true; }};
const nativeFactory=runInNewContext(`${helpers}\nfeedbackToaster`,nativeContext);
stack.children=[row('native')];const nativeQueue=nativeFactory(stack,()=>{});const nativeToast=nativeQueue.show('native');assert.equal(typeof nativeTimer,'function');events.pointerenter();assert.equal(nativeCleared,true);events.pointerleave();nativeQueue.dismiss(nativeToast);assert.equal(nativeToast.isConnected,false);nativeQueue.destroy();
console.log('Default browser clock adapter preserves native timer receivers');
