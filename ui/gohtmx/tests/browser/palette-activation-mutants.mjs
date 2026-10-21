import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

// Finite, source-bound controls for a future browser fixture. This module does
// not start a server, write production files, or establish browser evidence.
// The template control changes renderer input, never a post-render DOM patch.
// Original activation-definition provenance, not the current candidate revision.
// Current source identity is independently joined to exact file pins and run HEAD/tree.
export const activationSourceRevision = '41d7f50f3072b065445899dcf615de5378013977';
export const activationSourcePins = Object.freeze({
  core: Object.freeze({sourcePath: 'ui/gohtmx/assets/ely-api.js', servedPath: '/assets/ely-api.js', sourceSHA256: '6039000e8e983d7ebe55cd733cb4012810d2f15f949a2e1286f605966ad12116', sourceBytes: 11271}),
  runtime: Object.freeze({sourcePath: 'ui/gohtmx/assets/ely-api-interaction.js', servedPath: '/assets/ely-api-interaction.js', sourceSHA256: '53f29f4c6232ee96c7e8fa45a61dba5a900a6bb7544f56c163c72052b2f3f5f6', sourceBytes: 179192}),
  template: Object.freeze({sourcePath: 'ui/gohtmx/templates/ely-api-interaction.html', servedPath: null, sourceSHA256: '04bb573b7f95b8517d444722efad5aea5c7fa63fe5ece31ebc7bfb3db6b04fec', sourceBytes: 97605}),
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
  'template-marker-omitted': ['0d505907085ba684e6776f446cc2b6145097a53114293cd4545f34cec201a03a', 97573],
  'family-emit-omitted': ['a943754a72f3cc791d8c5e36efc746321166df43c758b56b7a1282594ca84cae', 179131],
  'close-after-action': ['d053526d6a5e2641bb35280ef45672730e732f8826a48d97d728215e983e48c3', 179105],
  'post-close-owner-bypassed': ['6c2d94559e5b82a8dcc2f7b800d53b7aba6dbdf2198e180394aed646e0939c9d', 179178],
  'trailing-notification-guard-removed': ['1286a66a66c9ac8f86932e480db208c3a1b4ef8e1c85255a994c698686569495', 179098],
  'empty-enter-fallthrough': ['2a2995510d3e12bfae69cb4dbcc242ba84a8466129c3900144a490cf4b0b87fb', 178593],
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
