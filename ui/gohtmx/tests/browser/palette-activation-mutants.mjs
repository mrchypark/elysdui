import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Finite, source-bound controls for a future browser fixture. This module does
// not start a server, write production files, or establish browser evidence.
// The template control changes renderer input, never a post-render DOM patch.
export const activationSourceRevision = 'bde72c5f272105344da55b7b675076de269444c0';
export const activationSourcePins = Object.freeze({
  core: Object.freeze({sourcePath: 'ui/gohtmx/assets/ely-api.js', servedPath: '/assets/ely-api.js', sourceSHA256: '6039000e8e983d7ebe55cd733cb4012810d2f15f949a2e1286f605966ad12116', sourceBytes: 11271}),
  runtime: Object.freeze({sourcePath: 'ui/gohtmx/assets/ely-api-interaction.js', servedPath: '/assets/ely-api-interaction.js', sourceSHA256: '56ff8caa36d306b55e7cf0e36db297fd36648f40edd3186844d726c7eb1048e1', sourceBytes: 176783}),
  template: Object.freeze({sourcePath: 'ui/gohtmx/templates/ely-api-interaction.html', servedPath: null, sourceSHA256: '9d24e3421c90615f702a1416b5b8819bc93e0947e18dd370eb22c99c18614e12', sourceBytes: 96792}),
});
export const reviewedManifest = activationSourcePins;
export const activationSourcePaths = Object.freeze(Object.fromEntries(Object.entries(activationSourcePins).map(([key, pin]) => [key, pin.sourcePath])));

const closeTransaction = `    closeDialog(dialog);
    // Native close may synchronously focus a host control that rebinds/remounts
    // this same physical root. Never deliver the old command to its new owner.
    if (!current() || dialog.open || option.getAttribute('aria-selected') !== 'true') { event.preventDefault(); return; }
    if (!emit(root, action, detail)) event.preventDefault();
`;
const emptyConfirmation = `      // Plain query confirmation is consumed even when filtering leaves no row.
      // Explicit form submission and modified/composing Enter keep their paths.
      const confirmationDialog = palette.closest('dialog[data-interaction-palette]');
      if (root.dataset.elyKind === 'CommandPalette' && event.key === 'Enter' &&
          !event.ctrlKey && !event.altKey && !event.metaKey && !event.shiftKey && !event.isComposing && event.keyCode !== 229 &&
          confirmationDialog?.open && confirmationDialog.querySelector('[data-interaction-filter]') === event.target) event.preventDefault();
`;
const submitOpening = `    const submit = event => {
      const form = event.target;
      if (!belongs(root, form) || !form.matches('[data-ely-submit]')) return;
`;
const kill = (name, oracle) => Object.freeze({case: name, oracle});
const rule = (source, find, replace, kills) => Object.freeze({source, find, replace, originalCount: 1, kills: Object.freeze(kills)});
export const activationMutants = Object.freeze({
  'core-skip-removed': rule('core',
    '      if (button.dataset.interactionPaletteAction !== undefined) return;\n', '',
    [kill('pointer.activation', 'activation.direct-payload')]),
  'template-marker-omitted': rule('template',
    ' data-interaction-palette-action', '',
    [kill('pointer.activation', 'activation.closed-before-direct-and-host')]),
  'family-emit-omitted': rule('runtime',
    '    if (!emit(root, action, detail)) event.preventDefault();\n', '',
    [kill('pointer.activation', 'activation.direct-payload')]),
  'close-after-action': rule('runtime', closeTransaction,
    `    // Causal reversal: retain owner validation but emit before closing.
    if (!current() || !dialog.open || option.getAttribute('aria-selected') !== 'true') { event.preventDefault(); return; }
    if (!emit(root, action, detail)) event.preventDefault();
    closeDialog(dialog);
`, [kill('pointer.activation', 'activation.closed-before-direct-and-host')]),
  'post-close-owner-bypassed': rule('runtime',
    "    if (!current() || dialog.open || option.getAttribute('aria-selected') !== 'true') { event.preventDefault(); return; }\n",
    "    if (dialog.open || option.getAttribute('aria-selected') !== 'true') { event.preventDefault(); return; }\n",
    [kill('owner.close-rebind', 'owner.cancel-old-command'), kill('owner.close-bind-absent', 'owner.cancel-old-command')]),
  'trailing-notification-guard-removed': rule('runtime',
    "    if (!current() || dialog.open || option.getAttribute('aria-selected') !== 'true') return;\n", '',
    [kill('callback.reopen', 'callback.no-stale-selection')]),
  'empty-enter-fallthrough': rule('runtime', emptyConfirmation, '',
    ['empty.initial', 'empty.disabled', 'empty.filtered'].map(name => kill(name, 'empty.consumed-at-handler-boundary'))),
  'blanket-palette-submit-prevention': rule('core', submitOpening,
    submitOpening + "      if (root.dataset.elyKind === 'CommandPalette' && form.closest('[data-interaction-palette]')) { event.preventDefault(); event.stopImmediatePropagation(); return; }\n",
    ['empty.initial', 'empty.disabled', 'empty.filtered'].map(name => kill(name, 'explicit.exact-query-payload'))),
});
export const activationModes = Object.freeze(['control', ...Object.keys(activationMutants)]);
export const activationMutations = activationModes;
const outputPins = Object.freeze(Object.fromEntries(Object.entries({
  'core-skip-removed': ['dabdc174a0f0e490b2a03ff0136c95b5bc3c122f07f374cb1326870e269e3e45', 11198],
  'template-marker-omitted': ['debb8168cf96a6ca3f1f37c9958ab0dc34e75970b0054d8e4d6d0c5c52b92e9d', 96760],
  'family-emit-omitted': ['42b570034e936b743bcb7d8b2ea6e6ddf7903988a5b08b0d6cd601064e5e1ec1', 176722],
  'close-after-action': ['c64d99c3c733aa21c1dd47a49274d9d8ea5b1eeb7c5cd7d2c0316185926591e0', 176696],
  'post-close-owner-bypassed': ['0c6101d15ec4655e94ba2e8d91a7ee95ca52b00c7cf459a6be00e5ee663b05ab', 176769],
  'trailing-notification-guard-removed': ['54f7d0e79a0156b36647903c2263c34b6aa8e2b22955874322fbbfdaab880780', 176689],
  'empty-enter-fallthrough': ['98b894345baba0cbb8e0aa9dc487e9a01d8920329648ed7a84ae231cc5c6bd26', 176184],
  'blanket-palette-submit-prevention': ['b9a11c2f91717b7851d9e1202134e813cf56d8bada7f204d81e9f55ab2ca0670', 11440],
}).map(([mode, pin]) => [mode, Object.freeze(pin)])));
export const activationSHA256 = value => createHash('sha256').update(value).digest('hex');
const bytes = value => Buffer.byteLength(value, 'utf8');
const occurrences = (source, find) => source.split(find).length - 1;

function verifySources(sources) {
  assert(sources && typeof sources === 'object' && !Array.isArray(sources), 'activation source bundle is required');
  assert.deepEqual(Object.keys(sources).sort(), Object.keys(activationSourcePins).sort(), 'exact activation source keys');
  for (const key of Object.keys(activationSourcePins)) assert.equal(typeof sources[key], 'string', key + ' is UTF-8 source text');
  // Count checks are independent of the full-file pins. Missing/duplicate
  // anchors cannot silently pass, including in an unmutated control run.
  for (const [name, mutation] of Object.entries(activationMutants)) {
    assert.equal(occurrences(sources[mutation.source], mutation.find), mutation.originalCount, 'exactly one original site: ' + name);
  }
  for (const [key, pin] of Object.entries(activationSourcePins)) {
    assert.equal(bytes(sources[key]), pin.sourceBytes, 'reviewed activation source byte count: ' + key);
    assert.equal(activationSHA256(sources[key]), pin.sourceSHA256, 'reviewed activation source SHA256: ' + key);
  }
}

export function activationMutationMetadata(mode) {
  assert(activationModes.includes(mode), 'known activation mutation mode');
  const mutation = mode === 'control' ? null : activationMutants[mode];
  const files = Object.fromEntries(Object.entries(activationSourcePins).map(([key, pin]) => {
    const mutated = mutation?.source === key;
    const [transformedSourceSHA256, transformedSourceBytes] = mutated ? outputPins[mode] : [pin.sourceSHA256, pin.sourceBytes];
    return [key, Object.freeze({...pin, path: pin.sourcePath, transformedSourceSHA256, transformedSourceBytes,
      // A Go template is renderer input, not an HTTP body. A future fixture
      // must separately join its rendered response to this template digest.
      servedSHA256: pin.servedPath ? transformedSourceSHA256 : null,
      servedBytes: pin.servedPath ? transformedSourceBytes : null,
      mutated})];
  }));
  return Object.freeze({mode, mutation: mode, sourceRevision: activationSourceRevision,
    originalCount: mutation?.originalCount ?? 0,
    mutationSource: mutation?.source ?? null,
    originalBlockSHA256: mutation ? activationSHA256(mutation.find) : null,
    replacementBlockSHA256: mutation ? activationSHA256(mutation.replace) : null,
    originalBlockBytes: mutation ? bytes(mutation.find) : 0,
    replacementBlockBytes: mutation ? bytes(mutation.replace) : 0,
    definitionSHA256: mutation ? activationSHA256(JSON.stringify(mutation)) : null,
    definition: mutation ? Object.freeze({path: activationSourcePins[mutation.source].sourcePath,
      findSHA256: activationSHA256(mutation.find), replacementSHA256: activationSHA256(mutation.replace), count: mutation.originalCount}) : null,
    kills: mutation?.kills ?? Object.freeze([]), files: Object.freeze(files),
    classification: 'source transform only; no browser or native evidence'});
}

export function applyActivationMutation(sources, mode) {
  const metadata = activationMutationMetadata(mode);
  verifySources(sources);
  const mutation = mode === 'control' ? null : activationMutants[mode];
  const output = {...sources};
  if (mutation) {
    output[mutation.source] = output[mutation.source].replace(mutation.find, mutation.replace);
    assert.notEqual(output[mutation.source], sources[mutation.source], 'mutation changes exact source bytes');
  }
  for (const [key, expected] of Object.entries(metadata.files)) {
    assert.equal(bytes(output[key]), expected.transformedSourceBytes, 'fixed transformed byte count: ' + key);
    assert.equal(activationSHA256(output[key]), expected.transformedSourceSHA256, 'fixed transformed SHA256: ' + key);
  }
  return Object.freeze({sources: Object.freeze(output), metadata});
}

// Verify the exact bytes a future loader is about to serve. This intentionally
// refuses templates: hashing template source is not hashing a rendered page.
export function verifyActivationServedAsset(result, key, body) {
  assert(key === 'core' || key === 'runtime', 'activation served asset must be core or runtime');
  assert(typeof body === 'string' || Buffer.isBuffer(body), 'served asset bytes are required');
  const metadata = activationMutationMetadata(result?.metadata?.mutation);
  assert.deepEqual(result.metadata, metadata, 'fixed activation mutation metadata');
  const expected = metadata.files[key];
  assert.equal(Buffer.byteLength(body), expected.servedBytes, 'served activation asset byte count: ' + key);
  assert.equal(activationSHA256(body), expected.servedSHA256, 'served activation asset SHA256: ' + key);
  return expected;
}
