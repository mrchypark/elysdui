import assert from 'node:assert/strict';

export const focusSwapControl = {
  name: 'continuation-guard', file: '/assets/ely-api-interaction.js',
  from: "if (!row.isConnected || row.closest('[data-ely-family]') !== root) return;",
  to: '// Deliberate control: continue after caller focus removes the row.',
  check: 'row-outerHTML', oracle: 'swap.pointer-continuation-has-no-runtime-error',
  message: "Cannot read properties of null (reading 'querySelectorAll')",
  prior: ['fixture.exact-browser-runtime', 'fixture.clean-transport', 'fixture.prefetched-exact-production-fragment', 'setup.valid-open-child-selection', 'input.label-has-box', 'input.trusted-movement-to-intended-label', 'focus.pointer-induced-focus-started-real-swap', 'swap.before-target-and-synchronous-disposal', 'swap.mutated-before-focus-return', 'swap.after-and-finally-target-owner', 'swap.cleanup-once', 'swap.old-child-remains-closed', 'swap.fresh-row-replaces-old-identity', 'swap.no-family-runtime-error'],
  after: ['swap.no-spurious-host-action', 'fresh.first-row-focus', 'fresh.pointer-selects-new-leaf', 'fresh.keydown-emits-nothing', 'fresh.keyup-callback-once-after-dismissal'],
};

// Derive the exact two production source sites from the bytes actually served,
// rather than accepting any page error, stack substring, or nonzero exit.
export function focusSwapExpectedError(servedSource, origin) {
  const lines = servedSource.split('\n');
  const site = (prefix, token, name) => {
    const indexes = lines.flatMap((line, index) => line.startsWith(prefix) ? [index] : []);
    assert.equal(indexes.length, 1, 'exactly one production error-site anchor');
    const index = indexes[0], column = lines[index].indexOf(token) + 1;
    assert(column > 0); return `    at ${name} (${origin}${focusSwapControl.file}:${index + 1}:${column})`;
  };
  return {check: focusSwapControl.check, message: focusSwapControl.message, stack: [
    'TypeError: ' + focusSwapControl.message,
    site('    if (row) row.parentElement.querySelectorAll(', 'querySelectorAll', 'pointerover'),
    site("    if (closest(root, event.target, '.ely-interaction--menus .ely-interaction__menu-row')) pointerover(event);", 'pointerover(event)', 'HTMLElement.menuPointerMove'),
  ].join('\n')};
}
const same = (a, b) => { try { assert.deepEqual(a, b); return true; } catch { return false; } };
export function evaluateFocusSwapControl(report, expectedError) {
  const control = focusSwapControl, trial = report.checks.find(check => check.name === control.check);
  const designated = trial?.oracles.find(oracle => oracle.id === control.oracle);
  const prefix = trial?.oracles.slice(0, trial.oracles.indexOf(designated)).map(oracle => oracle.id);
  const expectedIDs = [...control.prior, control.oracle, ...control.after];
  const unrelated = ['transportErrors', 'serverErrors', 'consoleErrors', 'requestFailures', 'runtimeErrors'].some(key => !Array.isArray(report[key]) || report[key].length > 0);
  const kill = report.mutation === control.name && !unrelated &&
    same(report.checks.map(check => check.name), ['root-innerHTML', control.check]) &&
    report.checks[0].status === 'passed' && trial?.status === 'failed' &&
    report.checks.every(check => !check.error && !check.traceError && same(check.oracles.map(oracle => oracle.id), expectedIDs)) &&
    same(prefix, control.prior) && designated?.pass === false &&
    same(designated.observed, [expectedError]) && same(designated.expected, []) &&
    same(report.pageErrors, [expectedError]) &&
    report.checks.every(check => check.oracles.every(oracle => oracle === designated || oracle.pass));
  return {kill, designated, observedPrefix: prefix, requiredPrefix: control.prior, expectedError};
}
