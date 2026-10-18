import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {menuPointerControls, mutateMenuPointerSource} from '../ui/gohtmx/tests/browser/menu-pointer-selection-controls.mjs';
import {focusSwapControl, focusSwapExpectedError, evaluateFocusSwapControl} from '../ui/gohtmx/tests/browser/menu-pointer-focus-swap-control.mjs';

// Source-only fixture/oracle hygiene. This neither launches Chromium nor proves
// that a negative control was killed. Browser reports are the evidence gate.
const runtime = readFileSync('ui/gohtmx/assets/ely-api-interaction.js', 'utf8');
const path = 'ui/gohtmx/tests/browser/menu-pointer-selection-browser-test.mjs';
const harness = readFileSync(path, 'utf8');
parse(harness, {ecmaVersion: 'latest', sourceType: 'module'});
for (const [name, control] of Object.entries(menuPointerControls)) {
  const result = mutateMenuPointerSource(runtime, control, name);
  parse(result, {ecmaVersion: 'latest', sourceType: 'module'});
  assert(!result.includes(control.from), `${name}: old anchor must be absent`);
  assert(harness.includes(`'${control.oracle}'`), `${name}: exact intended oracle must exist`);
  for (const id of control.prior) assert(harness.includes(`'${id}'`), `${name}: prerequisite oracle must exist`);
  assert.throws(() => mutateMenuPointerSource(runtime + '\n' + control.from, control, name), /exactly one/);
  assert.throws(() => mutateMenuPointerSource(runtime.replace(control.from, ''), control, name), /exactly one/);
  console.log(`${name}: one parseable production mutation → ${control.oracle} (browser kill unverified)`);
}
for (const oracle of ['move.enabled-leaf-owns-keyboard-selection', 'confirm.keyup-dispatches-moved-leaf-once', 'disabled.movement-preserves-valid-child', 'disabled.movement-preserves-valid-selection', 'child.visible-sibling-owns-keyboard', 'fractional.real-movement-retakes-selection', 'ownership.ancestor-state-unchanged', 'lifecycle.disposed-movement-keeps-branch-closed']) assert(harness.includes(`'${oracle}'`), `missing explicit intended behavior: ${oracle}`);
assert(harness.includes("['qualified', 'chapter', 'sdui']"));
assert(harness.includes("['SubMenu', 'DropdownMenu', 'OverflowMenu', 'CheckboxMenuItem', 'RadioMenuItem', 'ContextMenu']"));
assert(harness.includes('await page.mouse.move') && harness.includes('await page.keyboard.down') && harness.includes('await page.keyboard.up'));
assert(harness.includes("input.isTrusted && input.value === value && input.root === slot"), 'trusted input must reach the intended owner/row');
assert(harness.includes('received.movementX === 0 && received.movementY === 0'), 'fractional case must prove native zero-rounded-delta input');
assert(harness.includes('received.x > start.x && received.y > start.y'), 'fractional case must prove actual coordinates changed');
assert(harness.includes("htmx.ajax('GET'"), 'disposal requires real network HTMX');
assert(harness.includes("target: 'button#swap-source'") && harness.includes("'lifecycle.actual-swap-target-and-style'") && harness.includes("[{target: targetID, swap: style}]"), 'request-source header and actual before:swap target must be distinguished');
assert(!/new CustomEvent\(['"]htmx:/.test(harness), 'never fabricate HTMX lifecycle events');
assert(harness.includes("if (report.status === 'failed') process.exitCode = 1;"), 'intended-behavior failure must fail CI');
assert(harness.includes("report.status = !incidental && report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';"));
assert(!/expectedFailure|expectFailure|baselinePass|expected-red/.test(harness), 'missing support cannot be accepted as success');
assert(harness.includes("trial.oracles.slice(0, trial.oracles.indexOf(designated)).every(oracle => oracle.pass)"), 'mutant prerequisites must all pass');
assert(harness.includes('same(prefix, control.prior)') && harness.includes('same(designated.observed, control.observed)') && harness.includes('same(designated.expected, control.expected)'), 'causal controls must match exact prefix, observed and intended values');
assert(harness.includes("node.id === expected.id && d.id === expected.id && d.action === expected.action && d.error?.message === expected.message"));
assert(harness.includes('if (matches) window.expectedPointerRejection = null'), 'expected rejection allowance must be exact and once');
assert(harness.includes('report.fixtureBodies?.values()') && harness.includes('sourceSHA256: sha(body), servedSHA256: sha(body)'), 'retain exact renderer HTML alongside source/served hashes');
assert(harness.includes('response.arrayBuffer()') && harness.includes('response.body()') && harness.includes('fixture.browser-received-exact-runtime'), 'actual HTTP and browser response bytes must independently match expected asset hashes');
assert(harness.includes('report.browserVersion = browser.version()') && harness.includes('report.toolchain ='), 'browser and toolchain identities must be recorded');
assert(harness.includes('check.change-host-action-observer-order') && harness.includes("pointerLog.timeline.push({kind: 'hosts'"), 'chronological order needs a shared timeline');
assert(harness.includes("['go', 'list', '-deps'"), 'standalone dependency proof must be recorded');
const workflow = readFileSync('.github/workflows/menu-pointer-selection.yml', 'utf8');
const focusSwap = readFileSync('ui/gohtmx/tests/browser/menu-pointer-focus-swap-browser-test.mjs', 'utf8');
parse(focusSwap, {ecmaVersion: 'latest', sourceType: 'module'});
assert(focusSwap.includes('htmx.swap(focusSwapContext)') && focusSwap.includes("['root-innerHTML', 'row-outerHTML']"));
assert(focusSwap.includes("'swap.pointer-continuation-has-no-runtime-error'") && focusSwap.includes("if (report.status !== 'passed' && report.status !== 'mutation-killed') process.exitCode = 1;") && focusSwap.includes("report.status = report.causalControl.kill ? 'mutation-killed' : 'failed';"), 'focus-swap errors must fail except for the separately verified exact mutation kill');
assert(!/new CustomEvent\(['"]htmx:/.test(focusSwap), 'focus supplement must use real HTMX lifecycle');
assert(workflow.includes('node ui/gohtmx/tests/browser/menu-pointer-focus-swap-browser-test.mjs') && workflow.includes('test-results/contracts/menu-pointer-focus-swap-*.json'));
assert(workflow.includes('MENU_POINTER_FOCUS_MUTATION=continuation-guard node ui/gohtmx/tests/browser/menu-pointer-focus-swap-browser-test.mjs'));
const focusMutation = mutateMenuPointerSource(runtime, focusSwapControl, focusSwapControl.name);
parse(focusMutation, {ecmaVersion: 'latest', sourceType: 'module'});
assert(!focusMutation.includes(focusSwapControl.from));
const expectedError = focusSwapExpectedError(focusMutation, 'http://127.0.0.1:1');
const ids = [...focusSwapControl.prior, focusSwapControl.oracle, ...focusSwapControl.after];
const validatorFixture = {mutation: focusSwapControl.name, pageErrors: [expectedError], transportErrors: [], serverErrors: [], consoleErrors: [], requestFailures: [], runtimeErrors: [], checks: ['root-innerHTML', 'row-outerHTML'].map(name => ({name, status: name === 'root-innerHTML' ? 'passed' : 'failed', oracles: ids.map(id => ({id, observed: id === focusSwapControl.oracle ? name === 'root-innerHTML' ? [] : [expectedError] : true, expected: id === focusSwapControl.oracle ? [] : true, pass: name === 'root-innerHTML' || id !== focusSwapControl.oracle, prerequisite: false}))}))};
assert(evaluateFocusSwapControl(validatorFixture, expectedError).kill, 'synthetic validator fixture must match exact signature; not browser evidence');
for (const corrupt of [
  report => { report.pageErrors[0].message = 'unrelated error'; },
  report => { report.pageErrors[0].stack += '\n    at unrelated'; },
  report => { report.pageErrors.push({...report.pageErrors[0]}); },
  report => { report.runtimeErrors.push({message: 'cleanup failed'}); },
  report => { report.checks[1].oracles[0].pass = false; },
  report => { report.checks[1].oracles[0].id = 'wrong prerequisite'; },
  report => { report.checks[1].oracles.at(-1).pass = false; },
  report => { report.checks[0].status = 'failed'; },
]) { const report = structuredClone(validatorFixture); corrupt(report); assert(!evaluateFocusSwapControl(report, expectedError).kill, 'unrelated or incomplete failure must not count as a guard-removal kill'); }
console.log('continuation-guard: exact error/prefix/postcondition validator rejects 8 corrupt records; browser kill unverified');
for (const name of Object.keys(menuPointerControls)) assert(workflow.includes(`MENU_POINTER_MUTATION=${name} node ui/gohtmx/tests/browser/menu-pointer-selection-browser-test.mjs`), `${name}: focused CI must run the exact control`);
assert(workflow.includes('fail-fast: false') && workflow.includes('surface: [qualified, chapter, sdui]'));
assert(!/^\s*continue-on-error:/.test(workflow), 'baseline workflow may not suppress failure');
console.log('Menu pointer test-source audit passed; no browser or behavior proof claimed.');
