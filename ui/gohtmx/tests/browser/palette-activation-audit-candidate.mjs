import assert from 'node:assert/strict';
import {activationMutationMetadata, activationMutants, activationSHA256} from './palette-activation-mutants.mjs';

// Separate candidate pins; the historical activation-repair definition stays exact.
const candidatePins = {
  core: {sourceSHA256: '8fbd3e85ad2074d47133ecd1d4df4be8c0fc6a9d0dad77f58e50e457228afa3b', sourceBytes: 12051},
  template: {sourceSHA256: '454e758440f84e866aa70acad4b07a97a98526598f5db79ff6bc0022792a3a4f', sourceBytes: 97761},
};
const candidateOutputs = {
  'core-skip-removed': ['470d2746a53e720c9c78452ff9dba6d4a41165e03ac0d7760691e5557c8399ce', 11978],
  'blanket-palette-submit-prevention': ['a21dd13cc2c23710260ea75462adaecece08ce341cce9bd6c9c92c1ce8f0754a', 12220],
  'template-marker-omitted': ['ec55e28c983397fc5b6f5413bc28af0d41ff875ad7efc754c11eaa1785105bec', 97729],
};
export function activationAuditCandidateMetadata(mode) {
  const metadata = structuredClone(activationMutationMetadata(mode));
  for (const [key, pin] of Object.entries(candidatePins)) {
    const file = metadata.files[key];
    const [transformedSourceSHA256, transformedSourceBytes] = file.mutated ? candidateOutputs[mode] : [pin.sourceSHA256, pin.sourceBytes];
    Object.assign(file, pin, {transformedSourceSHA256, transformedSourceBytes,
      servedSHA256: file.servedPath ? transformedSourceSHA256 : null,
      servedBytes: file.servedPath ? transformedSourceBytes : null});
  }
  // Candidate provenance is the independently checked clean tree, not the historical revision.
  metadata.sourceRevision = null;
  metadata.productionPolicy = 'audit-candidate';
  return metadata;
}
export function applyActivationAuditCandidateMutation(sources, mode) {
  const metadata = activationAuditCandidateMetadata(mode);
  assert.deepEqual(Object.keys(sources).sort(), Object.keys(metadata.files).sort());
  for (const [name, rule] of Object.entries(activationMutants))
    assert.equal(sources[rule.source].split(rule.find).length - 1, rule.originalCount, 'exactly one original site: ' + name);
  for (const [key, pin] of Object.entries(metadata.files)) {
    assert.equal(Buffer.byteLength(sources[key]), pin.sourceBytes, 'candidate source bytes: ' + key);
    assert.equal(activationSHA256(sources[key]), pin.sourceSHA256, 'candidate source SHA256: ' + key);
  }
  const output = {...sources}, rule = activationMutants[mode];
  if (rule) output[rule.source] = output[rule.source].replace(rule.find, rule.replace);
  for (const [key, pin] of Object.entries(metadata.files)) {
    assert.equal(Buffer.byteLength(output[key]), pin.transformedSourceBytes, 'candidate transformed bytes: ' + key);
    assert.equal(activationSHA256(output[key]), pin.transformedSourceSHA256, 'candidate transformed SHA256: ' + key);
  }
  return {sources: output, metadata};
}
