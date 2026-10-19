import assert from 'node:assert/strict';
// The default keeps the historical source boundary. A candidate is selected by
// the invocation/CLI, never inferred from observed hashes or report fields.
export const paletteProductionPolicies = ['strict', 'activation-repair'];
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
export function paletteProductionPaths(policy = 'strict') {
  paletteProductionPolicy(policy);
  return [...paletteReviewedProduction, ...(policy === 'activation-repair' ? ['ui/gohtmx/assets/ely-api.js', 'ui/gohtmx/assets/ely-api-interaction.css', 'ui/gohtmx/assets/ely/icons/check.svg'] : [])];
}
export function verifyPaletteProductionPolicy(report, trusted) {
  assert(Object.hasOwn(trusted, 'productionPolicy'), 'independent production policy required');
  assert(Object.hasOwn(report, 'productionPolicy'), 'reported production policy required');
  paletteProductionPolicy(trusted.productionPolicy);
  paletteProductionPolicy(report.productionPolicy);
  assert.equal(report.productionPolicy, trusted.productionPolicy, 'independent production policy');
}
