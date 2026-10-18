import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {menuPointerControls, mutateMenuPointerSource} from '../ui/gohtmx/tests/browser/menu-pointer-selection-controls.mjs';

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
assert(workflow.includes('fail-fast: false') && workflow.includes('surface: [qualified, chapter, sdui]'));
assert(!/^\s*continue-on-error:/.test(workflow), 'baseline workflow may not suppress failure');
console.log('Menu pointer test-source audit passed; no browser or behavior proof claimed.');
