import assert from 'node:assert/strict';
import {paletteProductionPolicy} from './palette-query-production-policy.mjs';
import {createHash} from 'node:crypto';
// Fixed reviewed source values. Only the bytes served by the CI fixture change.
export const reentryModes = ['control', 'guard-removed'];
export const reentryRuntimePath = '/assets/ely-api-interaction.js';
export const reentryRuntimeSourcePath = 'ui/gohtmx/assets/ely-api-interaction.js';
export const reentryGuardBlock = "        // A caller focus listener may synchronously swap, dispose, or reown\n        // this controller's nodes. Never continue into a replacement row whose\n        // ID happens to match the detached option selected before focus.\n        const nextOption = options[next];\n        if (!paletteNavigationActive || !root.isConnected || root.dataset.elyReady !== 'true' ||\n            root.id !== paletteNavigationOwner.id || root.dataset.elyComponent !== paletteNavigationOwner.component ||\n            root.dataset.elyFamily !== 'interaction' || root.dataset.elyDisabled === 'true' ||\n            !dialog.isConnected || !dialog.open || dialog.closest('[data-ely-family]') !== root ||\n            dialog.querySelector('[data-interaction-filter]') !== queryField ||\n            dialog.querySelector('[data-interaction-palette-results]') !== palette ||\n            !queryField.isConnected || queryField.disabled || queryField.closest('[data-ely-family]') !== root ||\n            document.activeElement !== queryField || !nextOption.isConnected || nextOption.disabled ||\n            nextOption.closest('[data-ely-family]') !== root ||\n            nextOption.closest('[data-interaction-palette-results]') !== palette ||\n            nextOption.closest('[hidden]') || nextOption.getAttribute('aria-selected') !== 'true') return;\n";
const sha = value => createHash('sha256').update(value).digest('hex');
export const reentryRuntimePins = {
  strict: {sourceSHA256:'9aa473de4940934bebe152d88707b706479c84715090dfbf4bb7fcd1b34acc46', reversedSHA256:'567809e61193b63ade6bfc8126d4aea16f961197ce8b38c41079336c7478e685'},
  'activation-repair': {sourceSHA256:'56ff8caa36d306b55e7cf0e36db297fd36648f40edd3186844d726c7eb1048e1', reversedSHA256:'a9c15ae36995d7b061fb8dd1a18c95dcf4c94c4e836156358938cc15e27043de'},
};
export const reentryGuardKills = [
  'reentry.no-old-handler-active-write-after-disposal',
  'reentry.every-active-write-resolves-selected-live-option',
];
export function reentryMutationMetadata(mode, productionPolicy = 'strict') {
  paletteProductionPolicy(productionPolicy);
  const {sourceSHA256, reversedSHA256} = reentryRuntimePins[productionPolicy];
  assert(reentryModes.includes(mode), 'source-owned reentry mode');
  return {productionPolicy, mode, path:reentryRuntimePath, sourceSHA256,
    servedSHA256:mode === 'control' ? sourceSHA256 : reversedSHA256,
    removedBlockSHA256:mode === 'control' ? null : sha(reentryGuardBlock),
    classification:mode === 'control' ? 'unaltered guarded production' : 'served-only exact post-focus guard reversal; raw failure retained'};
}
export function reentryMutation(source, mode, productionPolicy = 'strict') {
  const expected = reentryMutationMetadata(mode, productionPolicy);
  assert.equal(sha(source), expected.sourceSHA256, 'reviewed guarded runtime source');
  assert.equal(source.split(reentryGuardBlock).length, 2, 'exactly one complete reviewed post-focus guard');
  const result = mode === 'control' ? source : source.replace(reentryGuardBlock, '');
  assert.equal(sha(result), expected.servedSHA256, 'fixed source-owned served runtime');
  return result;
}
