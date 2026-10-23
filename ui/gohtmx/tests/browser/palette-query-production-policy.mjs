import assert from 'node:assert/strict';
// The default keeps the historical source boundary. A candidate is selected by
// the invocation/CLI, never inferred from observed hashes or report fields.
export const paletteProductionPolicies = ['strict', 'activation-repair', 'audit-candidate'];
export function paletteProductionPolicy(value = 'strict') {
  assert(paletteProductionPolicies.includes(value), 'source-owned production policy');
  return value;
}
export const paletteReviewedProduction = [
  'ui/gohtmx/assets/ely-api-interaction.js',
  'ui/gohtmx/templates/ely-api-interaction.html',
  'adapters/gohtmx/catalogue_manifest.json.gz',
];
export const paletteActivationRepairPins = {
  'ui/gohtmx/assets/ely/icons/check.svg': 'e4bab3ed87dca8961e94a4e72ce23c17a674bebcb72bbbbe5eff4ef41532aa83',
  'ui/gohtmx/assets/ely-api-interaction.css': 'abecc707408f8987111997910a2e50fc900c00a6b7e15bdbb0183d67eb12c94e',
  'ui/gohtmx/assets/ely-api.js': '6039000e8e983d7ebe55cd733cb4012810d2f15f949a2e1286f605966ad12116',
  'ui/gohtmx/assets/ely-api-interaction.js': '53f29f4c6232ee96c7e8fa45a61dba5a900a6bb7544f56c163c72052b2f3f5f6',
  'ui/gohtmx/templates/ely-api-interaction.html': '04bb573b7f95b8517d444722efad5aea5c7fa63fe5ece31ebc7bfb3db6b04fec',
  'adapters/gohtmx/catalogue_manifest.json.gz': 'b20ca87a4f602f3ba5519d66cf25ed20696a4b06071e5289bb6e4f75f202e96b',
};
// The audited candidate names the additional production files this change set
// carries. Their bytes are compared against the clean HEAD revision, so the
// allowance keeps working once the change is committed, and they are never
// frozen to the historical baseline.
export const paletteAuditCandidateProduction = [
  'ui/gohtmx/assets/ely-controls.js',
  'ui/gohtmx/ui.go',
  'ui/gohtmx/component.go',
];
// Loaded production assets that the audited candidate also changes. They are
// compared against clean HEAD bytes for the same reason, so the asset loop
// keeps the same source-owned boundary as the source loop.
export const paletteAuditCandidateAssets = [
  'ui/gohtmx/assets/ely-api-interaction.css',
  'ui/gohtmx/assets/ely-controls.css',
  'ui/gohtmx/assets/ely-patterns.css',
  'ui/gohtmx/assets/ely-patterns.js',
];
// The runtime and core digests the audited candidate carries. They are the
// clean HEAD bytes of the reviewed revision, so they describe the committed
// candidate rather than the historical strict baseline.
export const paletteAuditCandidatePins = {
  'ui/gohtmx/assets/ely-api.js': 'e13109c6c2555311328544600508c1dc2ac68a7dc3b6324abb83c39062907af3',
  'ui/gohtmx/assets/ely-api-interaction.js': '53f29f4c6232ee96c7e8fa45a61dba5a900a6bb7544f56c163c72052b2f3f5f6',
  'ui/gohtmx/templates/ely-api-interaction.html': '454e758440f84e866aa70acad4b07a97a98526598f5db79ff6bc0022792a3a4f',
};
// The historical strict digests of the same runtime and core. The core is the
// immutable actual-main baseline byte set; the runtime is the historical
// reviewed runtime the strict boundary was built against.
export const paletteStrictPins = {
  'ui/gohtmx/assets/ely-api.js': '76d3102718dd754ee5cc774416f5f2d891d5b744cbf7f4fdddd79cc52fefa9bc',
  'ui/gohtmx/assets/ely-api-interaction.js': '9aa473de4940934bebe152d88707b706479c84715090dfbf4bb7fcd1b34acc46',
};
// The runtime and core digest each policy requires of the current production
// source, selected by the source-owned policy and never by an observed hash.
// The strict boundary requires the historical bytes, so the audited candidate
// fails it; activation-repair and audit-candidate require the clean HEAD bytes
// of the reviewed revision.
export function paletteRuntimeCorePins(policy = 'strict') {
  paletteProductionPolicy(policy);
  if (policy === 'activation-repair') return {
    'ui/gohtmx/assets/ely-api.js': paletteActivationRepairPins['ui/gohtmx/assets/ely-api.js'],
    'ui/gohtmx/assets/ely-api-interaction.js': paletteActivationRepairPins['ui/gohtmx/assets/ely-api-interaction.js'],
  };
  if (policy === 'audit-candidate') return {
    'ui/gohtmx/assets/ely-api.js': paletteAuditCandidatePins['ui/gohtmx/assets/ely-api.js'],
    'ui/gohtmx/assets/ely-api-interaction.js': paletteAuditCandidatePins['ui/gohtmx/assets/ely-api-interaction.js'],
  };
  return {...paletteStrictPins};
}
export function paletteProductionPaths(policy = 'strict') {
  paletteProductionPolicy(policy);
  if (policy === 'activation-repair') return [...paletteReviewedProduction, 'ui/gohtmx/assets/ely-api.js', 'ui/gohtmx/assets/ely-api-interaction.css', 'ui/gohtmx/assets/ely/icons/check.svg'];
  if (policy === 'audit-candidate') return [...paletteReviewedProduction, 'ui/gohtmx/assets/ely-api.js', 'ui/gohtmx/assets/ely/icons/check.svg', ...paletteAuditCandidateProduction, ...paletteAuditCandidateAssets];
  return [...paletteReviewedProduction];
}
export function verifyPaletteProductionPolicy(report, trusted) {
  assert(Object.hasOwn(trusted, 'productionPolicy'), 'independent production policy required');
  assert(Object.hasOwn(report, 'productionPolicy'), 'reported production policy required');
  paletteProductionPolicy(trusted.productionPolicy);
  paletteProductionPolicy(report.productionPolicy);
  assert.equal(report.productionPolicy, trusted.productionPolicy, 'independent production policy');
}
