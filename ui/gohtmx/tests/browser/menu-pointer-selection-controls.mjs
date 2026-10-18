import assert from 'node:assert/strict';

// These preservation controls exist before the repair. Controls for removing
// leaf selection / delaying the disabled guard must be pinned to the eventual
// repair only after the unmodified production baseline has failed in Chromium.
export const menuPointerControls = {
  'stationary-over': {
    file: '/assets/ely-api-interaction.js',
    from: "if (row?.closest('.ely-interaction--menus') && event.type !== 'pointermove') return;",
    to: '// Deliberate control: allow layout-only boundary exposure.',
    check: 'stationary.typed-boundary', oracle: 'stationary.boundary-does-not-open-child',
    prior: ['stationary.native-keydown-no-action', 'stationary.injected-boundary-is-labelled'],
    observed: false, expected: true,
  },
  'radio-scope': {
    file: '/assets/ely-api-interaction.js',
    from: 'item.closest(\'[role="menu"]\') === panel && item.dataset.interactionMenuRadio',
    to: 'item.dataset.interactionMenuRadio',
    check: 'regression.radio-scope', oracle: 'radio.nested-group-unchanged',
    prior: ['radio.keyboard-chosen-target', 'radio.own-group-committed'],
    observed: ['false', 'false'], expected: ['true', 'false'],
  },
  'cleanup-close': {
    file: '/assets/ely-api-interaction.js',
    from: 'const cleanup = () => { close(); cleanupContextRequests(); clearReorderPreview();',
    to: 'const cleanup = () => { cleanupContextRequests(); clearReorderPreview();',
    check: 'lifecycle.outerHTML', oracle: 'lifecycle.old-panel-hidden',
    prior: ['lifecycle.cleanup-once', 'lifecycle.root-identity', 'lifecycle.real-network-request', 'lifecycle.actual-swap-target-and-style'], observed: false, expected: true,
  },
};
export function mutateMenuPointerSource(source, control, name) {
  assert.equal(source.split(control.from).length - 1, 1, `${name}: exactly one production anchor required`);
  const result = source.replace(control.from, control.to);
  assert.notEqual(result, source, `${name}: source must change`);
  return result;
}
