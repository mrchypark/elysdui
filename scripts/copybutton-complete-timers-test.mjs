import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';

export function testCopyTimerObserver() {
  const source = readFileSync(new URL('../ui/gohtmx/tests/browser/copybutton-complete-observer.js', import.meta.url), 'utf8');
  const code = source.slice(0, source.indexOf('// End pure timer observation wrapper.'));
  const install = runInNewContext(code + ';installCopyTimerTrace');
  const rows = [], pending = new Map(), calls = [], receiver = {}, nativeReturn = {};
  let next = 0, copied = 'true', described = 0, scheduled = 0;
  const host = {setTimeout(callback, delay, ...args) { const handle = {id: ++next}; calls.push({op: 'set', receiver: this, callback, delay, args, handle}); pending.set(handle, {callback, args}); return handle; },
    clearTimeout(handle, ...args) { calls.push({op: 'clear', receiver: this, handle, args}); pending.delete(handle); return nativeReturn; }};
  const describe = () => { described++; return {binding: {call: 5, control: 2, root: 1}, state: () => ({currentRoot: 1, copied}), scheduled: () => { scheduled++; }}; };
  install(host, describe, (type, row) => rows.push({type, ...row}));
  const argument = {}, result = {}, callbackReceiver = {};
  const handle = host.setTimeout.call(receiver, function(arg, value) { assert.equal(this, callbackReceiver); assert.equal(arg, argument); assert.equal(value, 7); copied = null; return result; }, 1400, argument, 7);
  assert.equal(handle, calls[0].handle); assert.equal(calls[0].receiver, receiver); assert.equal(calls[0].delay, 1400);
  assert.equal(described, 1); assert.equal(scheduled, 1); assert.deepEqual(rows.map(row => row.event), ['scheduled']);
  const pendingTimer = pending.get(handle);
  assert.equal(pendingTimer.callback.apply(callbackReceiver, pendingTimer.args), result);
  assert.deepEqual(rows.map(row => row.event), ['scheduled','fired','completed']); assert.equal(rows[1].copied, 'true'); assert.equal(rows[2].copied, null);
  assert.equal(host.clearTimeout.call(receiver, handle, 'extra'), nativeReturn); assert.equal(calls.at(-1).receiver, receiver); assert.deepEqual(calls.at(-1).args, ['extra']);
  assert.equal(rows.length, 3, 'fired callback is not relabeled cancelled');
  const cancel = host.setTimeout(() => assert.fail('cancelled callback ran'), 1400);
  assert.equal(host.clearTimeout(cancel), nativeReturn); assert(!pending.has(cancel)); host.clearTimeout(cancel);
  assert.deepEqual(rows.slice(3).map(row => row.event), ['scheduled','cancelled']);
  const error = new Error('exact callback failure');
  const throwing = host.setTimeout(() => { throw error; }, 1400);
  assert.throws(() => pending.get(throwing).callback(), failure => failure === error);
  assert.deepEqual(rows.slice(-2).map(row => row.event), ['fired','completed'], 'throw preserved after completion observation');
  const nonCopyCallback = () => 42, ordinary = host.setTimeout(nonCopyCallback, 25, argument);
  assert.equal(pending.get(ordinary).callback, nonCopyCallback, 'unrelated timer callback unwrapped');
  const string = host.setTimeout('source text', 1400); assert.equal(pending.get(string).callback, 'source text');
  let unchanged;
  const untouched = {setTimeout(callback) { unchanged = callback; return result; }, clearTimeout() { return result; }};
  install(untouched, () => null, () => assert.fail('unowned timer observed'));
  assert.equal(untouched.setTimeout(nonCopyCallback, 1400), result); assert.equal(unchanged, nonCopyCallback);
  return {sourceOnly: true, classification: 'synthetic timer semantics; no browser evidence', nativeHandles: true, receiverAndArguments: true, callbackReturnAndThrow: true, cancellation: true, unrelatedTimers: true};
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) console.log(JSON.stringify(testCopyTimerObserver()));
