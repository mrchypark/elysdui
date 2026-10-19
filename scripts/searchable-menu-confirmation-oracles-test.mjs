import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {parse} from 'acorn';
import {searchableCases, searchableErrors, searchableSourcePaths} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-evidence.mjs';
const base = new URL('../', import.meta.url), read = path => readFile(new URL(path, base), 'utf8');
const runner = await read('ui/gohtmx/tests/browser/searchable-menu-confirmation-browser-test.mjs');
const wrapper = await read('scripts/searchable-menu-confirmation-run.mjs');
const workflow = await read('.github/workflows/searchable-menu-confirmation.yml');
for (const path of searchableSourcePaths.filter(path => path.endsWith('.mjs'))) parse(await read(path), {ecmaVersion: 'latest', sourceType: 'module'});
assert.equal(new Set(searchableCases('all')).size, 15);
assert(runner.includes("process.env.CI, 'true'") && wrapper.includes("process.env.CI, 'true'"));
assert(runner.includes("assert.equal(report.dirty, '', 'browser evidence requires a clean committed checkout')"));
assert(runner.includes("if (report.status !== 'passed') process.exitCode = 1;"));
assert(wrapper.includes('process.exitCode = child.status;') && wrapper.includes('randomUUID()') && wrapper.includes('loadSearchableInputs(base, surface, mutation)'));
assert(runner.includes("await page.keyboard.down(modifier)") && runner.includes("await page.keyboard.up(modifier)"));
assert(runner.includes("await page.keyboard.down(key)") && runner.includes("await page.keyboard.up(key)"));
assert(runner.includes("ctrlKey: Boolean(event.ctrlKey)") && runner.includes("metaKey: Boolean(event.metaKey)"));
assert(runner.includes("await page.goto(origin + '/')") && runner.includes('await ready(origin); await runCase(name)'));
assert(runner.includes("await htmx.ajax('GET', '/fragment'"));
assert(!/new (?:CustomEvent|Event|KeyboardEvent)\(['"](?:htmx:|key)/.test(runner));
assert(!/page\.route|dispatchEvent|\.prune\(|\.stop\(/.test(runner), 'no request substitution or synthetic key/lifecycle dispatch');
assert(workflow.includes('surface: [qualified, chapter, sdui]') && workflow.includes('group: [desired, controls, lifecycle]') && workflow.includes('fail-fast: false'));
assert(!/^\s*continue-on-error:/m.test(workflow));
const controls = await read('scripts/searchable-menu-confirmation-browser-controls.mjs');
assert(controls.includes("process.env.CI, 'true'") && controls.includes('randomUUID()'));
assert(workflow.includes('repair-causal-controls:') && workflow.includes('node scripts/searchable-menu-confirmation-browser-controls.mjs'));
assert(runner.includes('current.raw.replacementSetup') && runner.includes("await page.keyboard.type('Alpha')"));
console.log('SearchableMenu unchanged case inventory, native-input runner syntax, byte-bound controls and CI isolation checked; no browser was launched.');


// Offline control-flow checks only: execute the source-owned case loop and
// transport observers with deferred font/body promises, never a browser/server.
const runnerAST = parse(runner, {ecmaVersion: 'latest', sourceType: 'module'});
const run = runnerAST.body.find(node => node.type === 'TryStatement');
const main = run.block.body, outerDrain = run.finalizer.body[0];
const loop = main.find(node => node.type === 'ForOfStatement' && node.right.name === 'caseInventory');
const sourceOf = node => runner.slice(node.start, node.end);
const listener = type => main.find(node => node.type === 'ExpressionStatement' && node.expression.callee?.object?.name === 'page' && node.expression.callee.property.name === 'on' && node.expression.arguments[0].value === type);
const status = main.find(node => node.type === 'ExpressionStatement' && node.expression.left?.object?.name === 'report' && node.expression.left.property.name === 'status');
assert(loop && status && listener('response') && listener('requestfailed'));
assert(runner.includes('page.setDefaultTimeout(10000)'));
const caseFinally = loop.body.body.find(node => node.type === 'TryStatement').finalizer;
const capture = caseFinally.body.find(node => node.type === 'TryStatement');
const fontWait = capture.block.body[0];
assert.equal(fontWait.expression.type, 'AwaitExpression');
assert.equal(fontWait.expression.argument.callee.object.name, 'page');
assert.equal(fontWait.expression.argument.callee.property.name, 'waitForFunction');
assert.equal(fontWait.expression.argument.arguments.length, 1, 'font settlement inherits the existing default deadline without an override');
const deferred = () => { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return {promise, resolve, reject}; };
const turn = () => new Promise(resolve => setImmediate(resolve));
const fontPath = '/assets/ely/fonts/Inter-SemiBold.ttf';
const fontBytes = Buffer.from('offline font response body');
const sha = value => createHash('sha256').update(value).digest('hex');
function exercise({interactionError, waitError, pendingBody = false} = {}) {
  const events = [], listeners = {}, bodies = [], fonts = new Map(['first', 'second'].map(name => [name, deferred()]));
  const report = {checks: [], browserResponses: [], assets: {[fontPath]: {servedSHA256: sha(fontBytes), bytes: fontBytes.length}}, fixtures: {}, ...Object.fromEntries(searchableErrors.map(key => [key, []]))};
  const context = {assert, URL, sha, report, current: null, origin: 'http://127.0.0.1:4321', surface: 'qualified', caseInventory: ['first', 'second'], searchableErrors, responses: [], document: {},
    console: {log() {}, error() {}}, searchableOracles: () => [{pass: true}], searchableReplacementOracles: () => [],
    ready: async () => events.push('navigate:' + context.current.name),
    runCase: async name => {
      events.push('interact:' + name);
      context.document.fonts = {ready: fonts.get(name).promise, status: 'loading'};
      if (pendingBody) {
        const body = deferred(); bodies.push(body);
        listeners.response({url: () => context.origin + fontPath, status: () => 200, body: () => body.promise});
      }
      if (interactionError) throw interactionError;
    },
    page: {
      on: (type, callback) => { listeners[type] = callback; },
      close: async () => { events.push('close:' + context.current.name); for (const body of bodies) body.reject(new Error('Target page closed')); },
      waitForFunction: async callback => {
        const owner = context.current.name; events.push('font-wait:' + owner);
        if (waitError) throw waitError;
        assert.equal(await callback(), true, 'the source predicate must await the font readiness promise');
        events.push('font-settled:' + owner);
      },
      evaluate: async () => { events.push('capture:' + context.current.name); return {errors: []}; },
    },
  };
  const execution = runInNewContext(`(async () => { ${sourceOf(listener('response'))} ${sourceOf(listener('requestfailed'))} ${sourceOf(loop)} ${sourceOf(status)} ${sourceOf(outerDrain)} })()`, context);
  const resolveFont = name => { context.document.fonts.status = 'loaded'; fonts.get(name).resolve(); };
  return {context, events, fonts, listeners, report, execution, resolveFont};
}
const ordered = exercise();
await turn();
assert.deepEqual(ordered.events, ['navigate:first', 'interact:first', 'font-wait:first']);
assert.equal(ordered.context.current.name, 'first', 'pending fonts retain the owning case');
const body = deferred();
ordered.listeners.response({url: () => ordered.context.origin + fontPath, status: () => 200, body: () => body.promise});
ordered.resolveFont('first'); await turn();
assert.deepEqual(ordered.events, ['navigate:first', 'interact:first', 'font-wait:first', 'font-settled:first', 'capture:first']);
assert.equal(ordered.context.current.name, 'first', 'late response bodies drain before the owner or navigation advances');
body.resolve(fontBytes); await turn();
assert.equal(ordered.report.browserResponses[0].check, 'first');
assert.equal(ordered.context.current.name, 'second');
assert(ordered.events.indexOf('font-settled:first') < ordered.events.indexOf('navigate:second'));
ordered.resolveFont('second'); await ordered.execution;
assert.equal(ordered.report.status, 'passed');

for (const kind of ['requestfailed', 'transport']) {
  const failed = exercise(); await turn();
  if (kind === 'requestfailed') failed.listeners.requestfailed({url: () => failed.context.origin + fontPath, failure: () => ({errorText: 'net::ERR_ABORTED'})});
  else failed.listeners.response({url: () => failed.context.origin + fontPath, status: () => 200, body: async () => Buffer.from('wrong font bytes')});
  failed.resolveFont('first'); await turn(); failed.resolveFont('second'); await failed.execution;
  const errors = failed.report[kind === 'requestfailed' ? 'requestFailures' : 'transportErrors'];
  assert.equal(errors.length, 1); assert.equal(errors[0].check, 'first', 'late failure keeps its owning case');
  if (kind === 'requestfailed') assert.equal(errors[0].error, 'net::ERR_ABORTED');
  assert.equal(failed.report.status, 'failed', 'settled fonts cannot excuse a real ' + kind + ' failure');
}
for (const kind of ['timeout', 'rejection']) for (const preexistingFailure of [false, true]) {
  const interactionError = preexistingFailure ? new Error('original interaction failure') : undefined, settlementError = new Error(kind === 'timeout' ? 'page.waitForFunction: Timeout 10000ms exceeded.' : 'font readiness rejected');
  const failed = exercise({interactionError, pendingBody: true, ...(kind === 'timeout' ? {waitError: settlementError} : {})});
  await turn();
  if (kind === 'rejection') { assert.equal(failed.context.current.name, 'first'); failed.fonts.get('first').reject(settlementError); }
  await failed.execution;
  assert.equal(failed.report.checks.length, 1, 'unsuccessful settlement cannot advance to another case');
  assert(!failed.events.includes('navigate:second'));
  assert(failed.events.includes('close:first'), 'failed settlement closes its owned page before the outer body drain');
  assert.equal(failed.report.transportErrors.length, 1, 'closing releases the pending response and retains its failure');
  assert.equal(failed.report.transportErrors[0].check, 'first');
  assert.match(failed.report.transportErrors[0].message, /Target page closed/);
  assert.equal(failed.report.checks[0].error?.message, interactionError?.message);
  assert.equal(failed.report.checks[0].error?.stack, interactionError?.stack);
  assert.equal(failed.report.checks[0].captureError, String(settlementError));
  assert.equal(failed.report.checks[0].captureErrorStack, settlementError.stack);
  assert.equal(failed.report.checks[0].status, 'failed'); assert.equal(failed.report.status, 'failed');
}
console.log('SearchableMenu post-interaction font settlement, late body drain, owner attribution, strict failures and bounded-wait failure paths passed offline; browser behavior remains unverified.');
