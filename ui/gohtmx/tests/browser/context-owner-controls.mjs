// Every control replaces one unique production anchor. This registry is shared
// by the real-browser harness and the source-only causal-control audit.
export const contextOwnerControls = {
 'context-request-dedupe': {
  from: 'if (owner.lastNumber === request.number) return;', to: 'if (false && owner.lastNumber === request.number) return;',
  check: 'C3.equality-watermark', oracle: 'C3.repeat-preserves-focus-position-descendants',
 },
 'context-request-precision': {
  from: 'if (owner.lastNumber === request.number) return;', to: 'if (Number(owner.lastNumber) === Number(request.number)) return;',
  check: 'C2.number-precision-and-point', oracle: 'C2.adjacent-u64-distinct-presentation',
 },
 'context-request-mode': {
  from: "if (surface.dataset.elyContextMode === 'manual') return;", to: "if (false && surface.dataset.elyContextMode === 'manual') return;",
  check: 'C4.manual-owner-only-input', oracle: 'C4.manual-right-click-stays-closed',
 },
 'context-request-keyboard': {
  from: `if (menuTrigger.closest('[role="menu"]')?.closest('[data-ely-family]') !== root && menuTrigger.closest('[data-interaction-context]')?.closest('[data-ely-family]') === root && menuTrigger.closest('[data-interaction-context]').dataset.elyContextMode === 'manual') return;`, to: `if (false && menuTrigger.closest('[role="menu"]')?.closest('[data-ely-family]') !== root && menuTrigger.closest('[data-interaction-context]')?.closest('[data-ely-family]') === root && menuTrigger.closest('[data-interaction-context]').dataset.elyContextMode === 'manual') return;`,
  check: 'C4.manual-owner-only-input', oracle: 'C4.hidden-synthetic-fallback-inert',
 },
 'context-request-coordinates': {
  from: "if (typeof request.x !== 'number' || !Number.isFinite(request.x) || typeof request.y !== 'number' || !Number.isFinite(request.y)) return false;", to: '// Negative control: finite numeric coordinate validation omitted.',
  check: 'C5.validation-and-clamp', oracle: 'C5.invalid-coordinate-atomic-noop',
 },
 'context-request-disabled': {
  from: "if (root.dataset.elyDisabled === 'true' || trigger.disabled) return;", to: '// Negative control: owner request enabled guard omitted.',
  check: 'C6.disabled-and-empty', oracle: 'C6.disabled-number-unconsumed',
 },
 'context-request-owner': {
  from: "if (target !== root || root.dataset.elyComponent !== 'menus/ContextMenu') return;", to: '// Negative control: exact request target/component guard omitted.',
  check: 'C8.root-ownership', oracle: 'C8.descendant-event-cannot-open-parent',
 },
 'context-request-retained': {
  from: '// Keep owner watermark across compatible controller cleanup.', to: 'contextRequestOwners.delete(root);',
  check: 'C9.retained-innerHTML', oracle: 'C9.retained-same-seed-stays-closed',
 },
 'context-request-cleanup': {
  from: 'cleanupContextRequests();', to: '/* Negative control: owner request cleanup omitted. */',
  check: 'C10.replacement-and-reinsertion', oracle: 'C10.reinsertion-needs-normal-startup',
 },
 'context-request-identity': {
  from: 'if (!owner || !matchesIdentity(owner))', to: 'if (!owner)',
  check: 'C12.mode-and-owner-identity', oracle: 'C12.changed-id-accepts-same-number',
 },
 'context-request-host-focusout': {
  from: "manualSurface?.addEventListener('focusout', hostFocusout);", to: '/* Negative control: manual host focusout listener omitted. */',
  check: 'C14.right-host-tab-away', oracle: 'C14.host-tab-away-dismisses-menu',
  prior: ['C14.initial-focus-is-menu-row', 'C14.right-pointer-hit-is-owned-host', 'C14.right-pointerdown-focuses-real-host', 'C14.right-pointerdown-keeps-menu-open', 'C14.row-to-host-focusout-is-real', 'C14.right-pointerup-keeps-real-host-focused', 'C14.right-pointerup-keeps-menu-open', 'C14.trusted-tab-reaches-peer-surface', 'C14.tab-focusout-origin-is-host-not-panel', 'C14.trusted-input-sequence'],
  actual: false, expected: true,
 },
 'context-request-nested-menu-owner': {
  from: `const context = trigger.closest('[role="menu"]')?.closest('[data-ely-family]') !== root && surface?.closest('[data-ely-family]') === root && surface;`,
  to: `const context = trigger.closest('[role="menu"]')?.closest('[data-ely-family]') !== root && surface;`,
  check: 'C15.nested-ordinary-menu', oracle: 'C15.ordinary-placement-owned-by-trigger',
  prior: ['C15.independent-production-menu-roots', 'C15.parent-row-is-original-focus', 'C15.child-first-row-focused'],
 },
 'context-request-seed-cleanup-registration': {
  from: 'registerCleanup?.(cleanup);', to: '/* Negative control: full cleanup is only returned after synchronous seed focus. */',
  check: 'C16.seed-focus-reentrant-swap', oracle: 'C16.seed-stop-closes-panel-synchronously',
  prior: ['C16.real-swap-prepared-during-seed-focus'], actual: false, expected: true,
 },
 'context-request-focus': {
  from: 'const previousOwner = menuReturnFocus.get(panel);', to: 'const previousOwner = document.activeElement;',
  check: 'C7.focus-and-callback-order', oracle: 'C7.rerequest-preserves-original-focus-owner',
 },
};
export function mutateContextOwnerSource(source, control, name) {
 const count = source.split(control.from).length - 1;
 if (count !== 1) throw new Error(`${name}: expected exactly one production anchor, found ${count}`);
 const changed = source.replace(control.from, control.to);
 if (changed === source) throw new Error(`${name}: mutation did not change production source`);
 return changed;
}
