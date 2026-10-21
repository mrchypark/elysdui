import assert from 'node:assert/strict';
import {activationMutationMetadata, activationMutants, activationSHA256} from './palette-activation-mutants.mjs';

// Separate candidate pins; the historical activation-repair definition stays exact.
const templatePin = {
  sourceSHA256: '373d8126b8a07864eb8e5a805f6999e4d853e1f7259b54172c663b5deba41c7d', sourceBytes: 97734,
};
export function activationAuditCandidateMetadata(mode) {
  const metadata = structuredClone(activationMutationMetadata(mode));
  const template = metadata.files.template;
  Object.assign(template, templatePin, {
    transformedSourceSHA256: template.mutated ? '6e13d8fa99122dc805fdb26a16504b25de51993557266f948954bdcbf94dba55' : templatePin.sourceSHA256,
    transformedSourceBytes: template.mutated ? 97702 : templatePin.sourceBytes,
  });
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
