import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';

const families = ['foundation', 'interaction', 'data', 'workspace', 'communication', 'native', 'forms'];
const assets = new URL('./assets/', import.meta.url);
const common = 'ely-api.js';
const expected = {
  foundation: [common, 'ely-api-foundation.js', 'ely-math.js'],
  interaction: [common, 'ely-api-interaction.js'],
  data: [common, 'ely-api-data.js', 'ely-patterns.js'],
  workspace: [common, 'ely-api-workspace.js', 'ely-api-workspace-source.js', 'ely-api-workspace-devtools.js', 'ely-api-workspace-canvas.js', 'ely-api-workspace-files.js', 'ely-api-forms.js', 'ely-code.js', 'ely-expressions.js'],
  communication: [common, 'ely-api-communication.js', 'ely-math.js', 'ely-project-charts.js'],
  native: [common, 'ely-api-native.js', 'ely-api-native-tooling.js', 'ely-api-native-shell.js', 'ely-api-native-media.js', 'ely-api-native-theme.js', 'ely-api-native-devices.js', 'ely-api-native-generative.js', 'ely-api-native-generative-tools.js', 'ely-api-native-misc.js', 'ely-expressions.js'],
  forms: [common, 'ely-api-forms.js', 'ely-code.js', 'ely-expressions.js'],
};

function moduleGraph(entry, seen = new Map()) {
  if (seen.has(entry)) return seen;
  const source = readFileSync(new URL(entry, assets), 'utf8');
  seen.set(entry, Buffer.byteLength(source));
  // Follow static imports only. Lazy KaTeX, workers, classic scripts, CSS,
  // and media are deliberately excluded from this module-graph estimate.
  for (const match of source.matchAll(/^import\s+(?:[^'"\n]*?\s+from\s+)?['"]([^'"]+)['"];?/gm)) {
    assert.match(match[1], /^\.\/[^?#]+\.js$/, `canonical local module URL in ${entry}`);
    moduleGraph(match[1].slice(2), seen);
  }
  return seen;
}

if (process.argv.includes('--runtime')) {
  // Execute the real ESM graph in a tiny DOM double. This proves module caching,
  // registration, lifecycle and event counts, not layout or browser networking.
  const listeners = new Map();
  const roots = [];
  let observer;
  let observers = 0;
  class ElementDouble {
    constructor(id, family) {
      this.id = id;
      this.dataset = {elyFamily: family, elyComponent: 'primitives/Test'};
      this.handlers = new Map();
      this.isConnected = true;
      this.events = [];
    }
    querySelectorAll() { return []; }
    querySelector() { return null; }
    matches(selector) { return selector === '[data-ely-family]'; }
    closest(selector) { return selector === '[data-ely-family]' ? this : null; }
    addEventListener(type, callback) {
      if (!this.handlers.has(type)) this.handlers.set(type, new Set());
      this.handlers.get(type).add(callback);
    }
    removeEventListener(type, callback) { this.handlers.get(type)?.delete(callback); }
    dispatchEvent(event) {
      this.events.push(event);
      for (const callback of this.handlers.get(event.type) || []) callback(event);
      return true;
    }
  }
  globalThis.Element = ElementDouble;
  globalThis.document = {
    documentElement: {},
    querySelectorAll: selector => selector === '[data-ely-family]' ? roots : [],
    addEventListener(type, callback) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(callback);
    },
  };
  globalThis.MutationObserver = class {
    constructor(callback) { observer = callback; observers++; }
    observe() {}
  };
  const initial = new ElementDouble('initial', 'foundation');
  roots.push(initial);
  if (process.argv.includes('--all-first')) await import('./assets/ely-api-all.js');
  await import('./assets/ely-api-foundation-entry.js');
  assert.equal(initial.dataset.elyReady, 'true', 'selected family mounts existing roots');
  const count = initial.handlers.get('click').size;
  const api = await import('./assets/ely-api.js');
  for (const family of families) {
    const entry = new URL(`ely-api-${family}-entry.js`, assets);
    await Promise.all([import(entry.href), import(entry.href)]);
    assert.throws(() => api.register(family, () => {}), /Duplicate Ely family/, `${family} was registered`);
  }
  await import('./assets/ely-api-all.js');
  assert.equal(observers, 1, 'all entrypoints share a single cleanup observer');
  assert.equal(listeners.get('DOMContentLoaded').size, 1, 'one common startup listener');
  // Common lifecycle plus the pre-existing shared-patterns initializer.
  assert.equal(listeners.get('htmx:after:swap').size, 2, 'one lifecycle listener and one patterns listener');
  for (const callback of listeners.get('DOMContentLoaded')) callback();
  assert.equal(initial.handlers.get('click').size, count, 'repeated imports/start do not add handlers');
  const swapped = new ElementDouble('swapped', 'foundation');
  roots.push(swapped);
  for (const callback of listeners.get('htmx:after:swap')) callback();
  for (const callback of listeners.get('htmx:after:swap')) callback();
  assert.equal(swapped.dataset.elyReady, 'true', 'preloaded family mounts on HTMX swap');
  assert.equal(swapped.handlers.get('click').size, count, 'swap initialization is idempotent');
  const button = new ElementDouble('action', 'foundation');
  button.dataset.elyAction = 'test';
  button.getAttribute = () => null;
  button.closest = selector => selector === '[data-ely-family]' ? swapped : selector === '[data-ely-action]' ? button : null;
  for (const callback of swapped.handlers.get('click')) callback({target: button});
  assert.equal(swapped.events.filter(event => event.type === 'ely:action').length, 1, 'one action for one click');
  swapped.isConnected = false;
  observer();
  assert.equal(swapped.handlers.get('click').size, 0, 'removed component handlers are cleaned up');
  // A returned disposer can outlive replacement bindings (for example an
  // effect cleanup). It must not erase the current owner's cleanup registration.
  const rebound = new ElementDouble('rebound', 'foundation');
  let oldCalls = 0, currentCalls = 0, newCalls = 0;
  const oldCleanup = api.mount(rebound, {onAction: () => { oldCalls++; }});
  const currentCleanup = api.mount(rebound, {onAction: () => { currentCalls++; }});
  const actionEvent = () => ({type: 'ely:action', target: rebound, detail: {action: 'save'}});
  oldCleanup(); oldCleanup();
  rebound.dispatchEvent(actionEvent());
  assert.equal(oldCalls, 0, 'replacing bindings removes old callbacks');
  assert.equal(currentCalls, 1, 'stale disposer leaves current callback active');
  rebound.isConnected = false;
  observer();
  assert.equal(rebound.handlers.get('ely:action').size, 0, 'detach cleans the current binding after stale disposal');
  rebound.isConnected = true;
  const newCleanup = api.mount(rebound, {onAction: () => { newCalls++; }});
  currentCleanup(); currentCleanup();
  rebound.dispatchEvent(actionEvent());
  assert.equal(currentCalls, 1, 'detach/remount does not retain previous callback');
  assert.equal(newCalls, 1, 'one host callback after remount');
  newCleanup(); newCleanup();
  rebound.dispatchEvent(actionEvent());
  assert.equal(newCalls, 1, 'current cleanup is idempotent');
  console.log('Actual ESM caching, initial mount, HTMX lifecycle, action and cleanup checks passed');
} else {
  const all = moduleGraph('ely-api-all.js');
  const allBytes = [...all.values()].reduce((a, b) => a + b, 0);
  const rows = [];
  for (const family of families) {
    const entry = `ely-api-${family}-entry.js`;
    const graph = moduleGraph(entry);
    assert.deepEqual([...graph.keys()].sort(), [entry, ...expected[family]].sort(), `${family} includes only its complete dependency graph`);
    assert(!graph.has('ely-api-all.js'), `${family} must not import all families`);
    for (const file of expected[family]) assert(all.has(file), `all-loader retains ${file}`);
    const bytes = [...graph.values()].reduce((a, b) => a + b, 0);
    assert(bytes < allBytes, `${family} must be smaller than all-loader`);
    rows.push({family, beforeModules: all.size, afterModules: graph.size, beforeSourceBytes: allBytes, afterSourceBytes: bytes});
  }
  if (process.argv.includes('--report')) {
    console.log('STATIC MODULE GRAPH ESTIMATE, NOT measured browser performance.');
    console.log('Same current assets; before = all-loader, after = family entry. Unique static module URLs and uncompressed source bytes only.');
    console.log(JSON.stringify(rows, null, 2));
  }
  for (const order of [[], ['--all-first']]) {
    const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), '--runtime', ...order], {encoding: 'utf8'});
    assert.equal(result.status, 0, result.stderr || result.stdout);
  }
  console.log('Selective family import graphs and shared-runtime regression checks passed');
}
