import assert from 'node:assert/strict';
import {activationMutationMetadata, activationMutants, activationSHA256} from './palette-activation-mutants.mjs';

// Separate candidate pins; the historical activation-repair definition stays exact.
const candidatePins = {
  core: {sourceSHA256: '840abb51ce1984c927e93b798377a81591415101570cb0a45d2c34c02ee6e14c', sourceBytes: 11601},
  template: {sourceSHA256: '454e758440f84e866aa70acad4b07a97a98526598f5db79ff6bc0022792a3a4f', sourceBytes: 97761},
};
const candidateOutputs = {
  'core-skip-removed': ['3b84fa6a349781d2d6d7489988ecc6f253f964ba56aa55793186b704f073a3f7', 11528],
  'blanket-palette-submit-prevention': ['c556df5082be90e16f3e53db6a992a35773f59c01abc3b9f80d53e86ac642f2c', 11770],
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
