import assert from 'node:assert/strict';

// Each intervention changes only the served interaction runtime. Original
// production bytes, fixtures, raw failures, and source-owned oracles are retained.
// The pairing control deliberately permits a release without an earlier arm;
// it is not evidence that removing cleanup's reset alone would cause a callback.
const file = '/assets/ely-api-interaction.js';
const arm = "else if (!event.repeat) menuSearchConfirm = {field: searchField, panel: menuPanel, generation: menuGeneration.get(menuPanel)};";
const release = "if (event.key === 'Enter' && menuSearchConfirm) {";
const modified = "if (event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) menuSearchConfirm = undefined;";
export const searchableControls = Object.freeze({
  'activate-on-keydown': {
    file, description: 'Move unmodified filter activation from release to press, retaining modifier and repeat gating.',
    patches: [{anchor: arm, replacement: `else if (!event.repeat) {
          const item = [...menuPanel.querySelectorAll('[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled), [role="menuitemradio"]:not(:disabled)')]
            .find(item => item.closest('[data-ely-family]') === root && item.closest('[role="menu"]') === menuPanel && !item.closest('[hidden]'));
          item?.click();
        }`}],
    failures: {
      phase: ['confirm.keydown-no-action', 'confirm.keydown-stays-open', 'confirm.callback-on-keyup'],
      'swap.innerHTML': ['swap.keydown-no-action'], 'swap.outerHTML': ['swap.keydown-no-action'],
    },
  },
  'bypass-filter-modifiers': {
    file, description: 'Bypass only filter-input modifier checks on press and release.',
    patches: [
      {anchor: modified, replacement: 'if (false) menuSearchConfirm = undefined;'},
      {anchor: "field.closest('[role=\"menu\"]') === panel && menuGeneration.get(panel) === generation &&\n          !event.ctrlKey && !event.metaKey && !event.altKey && !event.shiftKey)", replacement: "field.closest('[role=\"menu\"]') === panel && menuGeneration.get(panel) === generation)"},
    ],
    failures: Object.fromEntries(['Control', 'Alt', 'Meta', 'Shift'].map(key => ['modifier.' + key, ['modifier.no-action-either-phase', 'modifier.stays-open-both-phases', 'modifier.retains-usable-filter']])),
  },
  'confirm-filter-space': {
    file, description: 'Treat ordinary filter text Space as a confirmation gesture.',
    patches: [
      {anchor: "if (searchField && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key))", replacement: "if (searchField && ['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key))"},
      {anchor: "if (event.key === 'Enter') {\n        event.stopPropagation();", replacement: "if (['Enter', ' '].includes(event.key)) {\n        event.stopPropagation();"},
      {anchor: release, replacement: "if (['Enter', ' '].includes(event.key) && menuSearchConfirm) {"},
    ],
    failures: {'text.space': ['text.space-is-query', 'text.space-filter-event', 'text.space-no-action', 'text.space-keeps-filter']},
  },
  'release-without-arm': {
    file, description: 'Reconstruct confirmation from the current filter on an unarmed release, including after supported replacement.',
    patches: [{anchor: release, replacement: `if (event.key === 'Enter' && !menuSearchConfirm) {
      const field = closest(root, event.target, '[data-interaction-search-menu] input');
      const panel = field?.closest('[role="menu"]');
      if (field && panel) menuSearchConfirm = {field, panel, generation: menuGeneration.get(panel)};
    }
    ${release}`}],
    failures: {'swap.innerHTML': ['swap.stale-keyup-no-additional-action'], 'swap.outerHTML': ['swap.stale-keyup-no-additional-action']},
  },
});
export function mutateSearchableSource(source, name) {
  const control = searchableControls[name];
  assert(control, 'known SearchableMenu causal control');
  for (const {anchor, replacement} of control.patches) {
    assert.equal(source.split(anchor).length - 1, 1, name + ': exactly one unchanged source anchor');
    source = source.replace(anchor, replacement);
  }
  return source;
}
export const searchableIntervention = name => name ? {name, ...searchableControls[name], anchorCounts: searchableControls[name].patches.map(() => 1), interpretation: 'Test-only served-source mutation; raw contract failures retain exit 1.'} : undefined;
export const searchableReportName = (surface, group, mutation = '') => `searchable-menu-confirmation-${surface}-${group}${mutation ? '-' + mutation : ''}.json`;

// Clean runs retain the baseline group inventory. Mutants use only their exact
// designated cases so a mutation cannot corrupt another case's query setup.
export const searchableMutantCases = name => Object.keys(searchableControls[name].failures);
