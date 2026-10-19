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
  'ui/gohtmx/assets/ely-api.js': '6039000e8e983d7ebe55cd733cb4012810d2f15f949a2e1286f605966ad12116',
  'ui/gohtmx/assets/ely-api-interaction.js': '56ff8caa36d306b55e7cf0e36db297fd36648f40edd3186844d726c7eb1048e1',
  'ui/gohtmx/templates/ely-api-interaction.html': '9d24e3421c90615f702a1416b5b8819bc93e0947e18dd370eb22c99c18614e12',
  'adapters/gohtmx/catalogue_manifest.json.gz': 'bfad96d831edde876dd2daab0e9b4c8b4fb9287ab6d02ff7ad49ad2ae57393a8',
};
export function paletteProductionPaths(policy = 'strict') {
  paletteProductionPolicy(policy);
  return [...paletteReviewedProduction, ...(policy === 'activation-repair' ? ['ui/gohtmx/assets/ely-api.js'] : [])];
}
export function verifyPaletteProductionPolicy(report, trusted) {
  assert(Object.hasOwn(trusted, 'productionPolicy'), 'independent production policy required');
  assert(Object.hasOwn(report, 'productionPolicy'), 'reported production policy required');
  paletteProductionPolicy(trusted.productionPolicy);
  paletteProductionPolicy(report.productionPolicy);
  assert.equal(report.productionPolicy, trusted.productionPolicy, 'independent production policy');
}
