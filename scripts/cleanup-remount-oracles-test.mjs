import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parse} from 'acorn';
import vm from 'node:vm';
import {cleanupRemountControl, elideCleanupClose} from '../ui/gohtmx/tests/browser/cleanup-remount-control.mjs';
const base = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, base), 'utf8');
const source = await read('ui/gohtmx/assets/ely-api-interaction.js');
const runner = await read('ui/gohtmx/tests/browser/cleanup-remount-browser-test.mjs');
const workflow = await read('.github/workflows/cleanup-remount.yml');
const original = await read('ui/gohtmx/tests/browser/diagnostics/cleanup-remount-original.mjs');
const runnerAST = parse(runner, {ecmaVersion: 'latest', sourceType: 'module'});
parse(original, {ecmaVersion: 'latest', sourceType: 'module'});
assert.equal(createHash('sha256').update(original).digest('hex'), 'c1db68807008de835a5b2f97fea6736bfece37837e2c9da4d3e5e65da6da4e0d', 'original audit diagnosis must remain unchanged and separate');
assert.equal(source.split(cleanupRemountControl.anchor).length - 1, 1);
const mutated = elideCleanupClose(source);
parse(mutated, {ecmaVersion: 'latest', sourceType: 'module'});
assert.equal(mutated, source.replace(cleanupRemountControl.anchor, cleanupRemountControl.replacement));
assert.equal(source.length - mutated.length, 'close(); '.length);
assert.throws(() => elideCleanupClose(source.replace(cleanupRemountControl.anchor, 'missing')), /exactly one/);
assert.throws(() => elideCleanupClose(source + cleanupRemountControl.anchor), /exactly one/);
for (const oracle of ['presentation.seed-survives-old-disposers', 'presentation.expanded-survives-old-disposers', 'readiness.fresh-owner-survives-old-cleanup', 'cleanup.old-owner-once', 'ownership.listener-cardinality', 'ownership.old-listener-identities-gone', 'seed.duplicate-does-not-restart-or-reposition', 'fresh.keyup-fresh-callback-once-after-dismissal', 'normal-detach.old-presentation-closed', 'htmx.actual-context-and-retained-target', 'htmx.real-delay-stays-stopped-with-old-dom']) assert(runner.includes(`'${oracle}'`), `missing independent oracle ${oracle}`);
assert(!runner.includes('diagnoseCleanupRemount'), 'historical diagnostic is not a desired acceptance oracle');
assert(runner.includes("if (report.status !== 'passed') process.exitCode = 1;"));
assert(!runner.includes('mutation-killed') && !runner.includes('expected-red-pass'), 'known failures cannot become successful desired acceptance');
assert(runner.includes("group === 'all', 'causal intervention must include normal teardown"));
assert(runner.includes("assert.equal(report.dirty, '', 'browser evidence requires a clean committed checkout')"));
assert(runner.includes("old.remove()") && runner.includes('await settle()') && runner.includes('htmx.ajax('));
assert(!/new (?:CustomEvent|Event)\(['"]htmx:/.test(runner), 'no fabricated HTMX event');
assert(!/new MutationObserver|\.prune\(|\.stop\(|htmx\.timeout\s*=/.test(runner), 'no substitute lifecycle implementation or timer');
assert(workflow.includes('group: [desired, controls]') && workflow.includes('surface: [standalone, catalogue]') && workflow.includes('fail-fast: false'));
assert(!/^\s*continue-on-error:/m.test(workflow), 'desired failures may not be suppressed');
console.log('Cleanup/remount syntax, oracle inventory and exact one-anchor intervention audit passed. Browser behavior unverified.');

// Unit-check only the error observer with Node EventTargets. This does not
// simulate DOM pruning, HTMX, focus or browser behavior. In particular, direct
// delivery of one event twice tests logger deduplication, not native bubbling.
class ObserverTarget extends EventTarget {}
class ObserverElement extends ObserverTarget {}
const window = new ObserverTarget();
Object.assign(window, {window, document: new ObserverElement(), EventTarget: ObserverTarget, Element: ObserverElement, WeakMap, WeakSet, Set});
const context = vm.createContext(window);
const observe = runnerAST.body.find(node => node.type === 'FunctionDeclaration' && node.id?.name === 'observeBrowser');
vm.runInContext(`(${runner.slice(observe.start, observe.end)})()`, context);
const detached = new ObserverElement(); detached.id = 'detached-owner'; detached.isConnected = false;
window.remountObserveErrors(detached); window.remountObserveErrors(detached);
const failure = new Error('exact detached disposer failure');
const event = new CustomEvent('ely:error', {detail: {id: detached.id, error: failure}});
detached.dispatchEvent(event);
assert.equal(window.remountLog.errors.length, 1, 'disconnected error must be captured exactly once');
assert.equal(window.remountLog.errors[0].message, failure.message);
assert.equal(window.remountLog.errors[0].stack, failure.stack);
assert.equal(window.remountLog.errors[0].connected, false);
window.document.dispatchEvent(event);
assert.equal(window.remountLog.errors.length, 1, 'the same event observed at root and document is not duplicated');
const fresh = new ObserverElement(); fresh.id = 'fresh-owner'; fresh.isConnected = true;
window.remountObserveErrors(fresh);
fresh.dispatchEvent(new CustomEvent('ely:error', {detail: {id: fresh.id, action: 'fresh-action', error: new Error('fresh failure')}}));
assert.equal(window.remountLog.errors.length, 2);
assert.equal(window.remountLog.errors[1].action, 'fresh-action');
assert.equal(window.remountLog.errors[1].connected, true);
console.log('Detached/connected root error telemetry and event-identity deduplication unit checks passed; no browser proof claimed.');
