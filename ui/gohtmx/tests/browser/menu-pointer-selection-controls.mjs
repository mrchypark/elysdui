import assert from 'node:assert/strict';

// The original preservation controls preceded the repair. The three movement
// controls were added only after corrected pre-fix Chromium run 39159744061
// reproduced both defects on qualified, chapter and SDUI renderers.
const fixtureAndOpen = [
  'fixture.browser-received-exact-runtime', 'fixture.no-transport-byte-mismatch',
  'fixture.production-roots-ready', 'fixture.production-fonts-ready',
  'fixture.unique-ids-and-escaped-label', 'fixture.real-sdui-screen-count',
  'fixture.leaf-roles', 'fixture.disabled-and-submenu-identities',
  'fixture.no-startup-errors', 'setup.root-panel-open', 'setup.first-row-focus',
];
const trustedDescendant = ['input.target-descendant-has-box', 'input.trusted-pointermove-to-intended-row', 'input.intended-label-or-icon-descendant'];
const leafSelection = "if (item.hasAttribute('data-interaction-menu-action')) item.focus({preventScroll: true});";
const rowSelection = `    if (row?.closest('.ely-interaction--menus')) {
      const item = row.querySelector(':scope > button');
      if (!root.isConnected || root.dataset.elyDisabled === 'true' || !item || item.disabled || item.closest('[hidden]')) return;
      // Transfer focus before hiding the old child, so its focusout cannot
      // dismiss the still-active parent menu. Disabled rows leave both intact.
      ${leafSelection}
      // Caller focus listeners can synchronously swap this row through HTMX.
      // A detached or reowned row must not continue the old controller's work.
      if (!row.isConnected || row.closest('[data-ely-family]') !== root) return;
    }`;
const siblingClosure = `    if (row) row.parentElement.querySelectorAll(':scope > .ely-interaction__menu-row > [data-interaction-menu]').forEach(trigger => {
      if (!row.contains(trigger)) menu(root, trigger.dataset.interactionMenu, false);
    });`;
export const menuPointerControls = {
  'leaf-transfer': {
    file: '/assets/ely-api-interaction.js', from: leafSelection,
    to: '// Deliberate control: leave keyboard selection on the previous leaf.',
    check: 'move.plain.Enter.label', oracle: 'move.enabled-leaf-owns-keyboard-selection',
    prior: [...fixtureAndOpen, ...trustedDescendant], observed: false, expected: true,
  },
  'disabled-late-guard': {
    file: '/assets/ely-api-interaction.js', from: `${rowSelection}\n${siblingClosure}`,
    to: `${siblingClosure}\n${rowSelection}`,
    check: 'disabled.off.label', oracle: 'disabled.movement-preserves-valid-child',
    prior: [...fixtureAndOpen, 'disabled.valid-child-open-before-movement', 'disabled.intended-control-disabled', ...trustedDescendant],
    observed: true, expected: false,
  },
  'fractional-delta-filter': {
    file: '/assets/ely-api-interaction.js', from: leafSelection,
    to: "if ((event.movementX || event.movementY) && item.hasAttribute('data-interaction-menu-action')) item.focus({preventScroll: true});",
    check: 'move.fractional-zero-delta', oracle: 'fractional.real-movement-retakes-selection',
    prior: [...fixtureAndOpen, 'fractional.target-box', 'fractional.keyboard-retakes-first', 'fractional.trusted-subpixel-input-with-zero-reported-delta'],
    observed: false, expected: true,
  },
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
    from: 'const cleanup = () => { paletteNavigationActive = false; close(); cleanupContextRequests(); clearReorderPreview();',
    to: 'const cleanup = () => { paletteNavigationActive = false; cleanupContextRequests(); clearReorderPreview();',
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
