import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {paletteHarness, paletteCoreSource, paletteRuntimeSource, ModelEvent, ModelNode} from './palette_activation_harness.mjs';
import {
  activationModes, activationMutations, activationMutants, activationSourcePins,
  activationSourcePaths, reviewedManifest, activationSHA256,
  applyActivationMutation, activationMutationMetadata, verifyActivationServedAsset,
} from '../browser/palette-activation-mutants.mjs';

// These are DOM/event doubles executing both complete production modules.
// Template projection below only imports its option marker into the model.
// It is not a Go renderer, native dialog, implicit-submit, browser, or SDUI test.
const original = Object.freeze({core: paletteCoreSource, runtime: paletteRuntimeSource,
  template: readFileSync(new URL('../../templates/ely-api-interaction.html', import.meta.url), 'utf8')});
const plain = value => JSON.parse(JSON.stringify(value));
let checks = 0;
async function test(name, fn) { await fn(); checks++; console.log('passed: ' + name); }

function model(mode = 'control', options = {}) {
  const transformed = applyActivationMutation(original, mode);
  const h = paletteHarness({...options, core: transformed.sources.core, runtime: transformed.sources.runtime});
  const branches = transformed.sources.template.split('\n').filter(line => line.startsWith('{{else if eq .Kind "CommandPalette"}}'));
  assert.equal(branches.length, 1, 'one actual CommandPalette template branch');
  const optionMarkers = branches[0].match(/ data-interaction-palette-option(?: data-interaction-palette-action)? /g);
  assert.equal(optionMarkers?.length, 1, 'one source option-marker site in template range');
  const owned = optionMarkers[0].includes(' data-interaction-palette-action');
  for (const fixture of [h.f, h.peer]) if (fixture.root.dataset.elyKind === 'CommandPalette') {
    for (const option of fixture.options) {
      if (owned) option.setAttribute('data-interaction-palette-action', '');
      else option.removeAttribute('data-interaction-palette-action');
    }
  }
  return Object.assign(h, {mutation: transformed});
}

async function pointer(mode) {
  const h = model(mode); h.f.open(); const click = h.pointer(); await h.flush();
  return {h, click};
}
const payload = detail => ({action: detail.action, value: detail.value, formData: detail.formData === null ? null : [...detail.formData], values: plain(detail.values)});
const itemPayload = {action: 'option-command', value: 'option-file', formData: null, values: []};
function once({h}) {
  assert.equal(h.actions.length, 1, 'activation.single-owned-action');
  assert.equal(h.hostCalls.length, 1, 'activation.single-host-call');
  assert.deepEqual(payload(h.actions[0]), itemPayload);
}
function closed({h}) {
  assert.deepEqual(h.timeline.filter(entry => ['direct', 'host'].includes(entry.type)).map(entry => entry.open), [false, false], 'activation.closed-at-action');
}
async function causal(mode, scenario, invariant, oracle, witness) {
  const positive = await scenario('control'); invariant(positive);
  const negative = await scenario(mode);
  assert.throws(() => invariant(negative), error => error instanceof assert.AssertionError && error.message.includes(oracle), mode + ' must fail its designated behavioral oracle');
  witness(negative);
}

await test('fixed inventory, reviewed source and independent expected metadata', () => {
  assert.equal(activationModes.length, 9);
  assert.equal(activationMutations, activationModes);
  assert.equal(reviewedManifest, activationSourcePins);
  assert.deepEqual(Object.keys(original), ['core', 'runtime', 'template']);
  for (const mode of activationModes) {
    const result = applyActivationMutation(original, mode), metadata = activationMutationMetadata(mode);
    assert.deepEqual(result.metadata, metadata);
    assert(Object.isFrozen(result) && Object.isFrozen(result.sources) && Object.isFrozen(metadata.files));
    assert.equal(metadata.mutation, mode);
    const changed = Object.keys(original).filter(key => result.sources[key] !== original[key]);
    assert.deepEqual(changed, mode === 'control' ? [] : [activationMutants[mode].source]);
    for (const [key, file] of Object.entries(metadata.files)) {
      assert.equal(file.path, activationSourcePaths[key]);
      assert.equal(file.sourceSHA256, activationSHA256(original[key]));
      assert.equal(file.sourceBytes, Buffer.byteLength(original[key]));
      assert.equal(file.transformedSourceSHA256, activationSHA256(result.sources[key]));
      assert.equal(file.transformedSourceBytes, Buffer.byteLength(result.sources[key]));
      if (key === 'template') assert.deepEqual([file.servedPath, file.servedSHA256, file.servedBytes], [null, null, null], 'template source cannot stand in for rendered HTTP bytes');
      else {
        assert.deepEqual(verifyActivationServedAsset(result, key, Buffer.from(result.sources[key])), file);
        assert.throws(() => verifyActivationServedAsset(result, key, result.sources[key] + '\n'), /served activation asset byte count/);
        const sameSizeWrongBody = '!' + result.sources[key].slice(1);
        assert.throws(() => verifyActivationServedAsset(result, key, sameSizeWrongBody), /served activation asset SHA256/);
      }
    }
    assert.throws(() => verifyActivationServedAsset(result, 'template', result.sources.template), /core or runtime/);
    if (mode === 'control') { assert.equal(metadata.definition, null); assert.deepEqual(metadata.kills, []); }
    else {
      const definition = activationMutants[mode];
      assert.equal(original[definition.source].split(definition.find).length - 1, 1);
      assert.deepEqual(metadata.definition, {path: activationSourcePaths[definition.source], findSHA256: activationSHA256(definition.find), replacementSHA256: activationSHA256(definition.replace), count: 1});
      assert(metadata.kills.length > 0);
      metadata.kills.forEach(kill => { assert.deepEqual(Object.keys(kill), ['case', 'oracle']); assert.equal(typeof kill.case, 'string'); assert.equal(typeof kill.oracle, 'string'); });
    }
  }
});

await test('unknown names, wrong sources, missing and duplicated sites are rejected', () => {
  for (const mode of ['', 'unknown', 'toString', '__proto__', null, undefined]) {
    assert.throws(() => applyActivationMutation(original, mode), /known activation mutation mode/);
    assert.throws(() => activationMutationMetadata(mode), /known activation mutation mode/);
  }
  assert.throws(() => applyActivationMutation({core: original.core}, 'control'), /exact activation source keys/);
  assert.throws(() => applyActivationMutation({...original, other: ''}, 'control'), /exact activation source keys/);
  for (const key of Object.keys(original)) {
    assert.throws(() => applyActivationMutation({...original, [key]: Buffer.from(original[key])}, 'control'), /UTF-8 source text/);
    assert.throws(() => applyActivationMutation({...original, [key]: original[key] + '\n'}, 'control'), /reviewed activation source byte count/);
    // Same-size unrelated drift retains every exact mutation anchor.
    const drift = original[key].replace('function', 'functioN');
    const sameSizeDrift = drift === original[key] ? original[key].replace('class=', 'Class=') : drift;
    assert.notEqual(sameSizeDrift, original[key]);
    assert.throws(() => applyActivationMutation({...original, [key]: sameSizeDrift}, 'control'), /reviewed activation source SHA256/);
  }
  for (const [mode, mutation] of Object.entries(activationMutants)) {
    for (const source of [original[mutation.source].replace(mutation.find, ''), original[mutation.source] + mutation.find]) {
      assert.throws(() => applyActivationMutation({...original, [mutation.source]: source}, mode), /exactly one original site/);
    }
    const alreadyChanged = applyActivationMutation(original, mode).sources;
    assert.throws(() => applyActivationMutation(alreadyChanged, mode), /exactly one original site|reviewed activation source/);
  }
  const result = applyActivationMutation(original, 'control');
  const forged = {...result, metadata: {...result.metadata, files: {...result.metadata.files,
    core: {...result.metadata.files.core, servedSHA256: activationSHA256('forged'), servedBytes: 6}}}};
  assert.throws(() => verifyActivationServedAsset(forged, 'core', 'forged'), /fixed activation mutation metadata/);
});

await test('unmutated whole runtime has one closed, committed action and change', async () => {
  const result = await pointer('control'); once(result); closed(result);
  assert.deepEqual(result.h.hostCalls[0].selected, ['option-file']);
  assert.deepEqual(result.h.timeline.map(entry => entry.type), ['direct', 'host', 'host-change', 'change']);
  assert.equal(result.h.changes.length, 1); assert.equal(result.h.f.dialog.closes, 1);
});
await test('core skip removal produces two actions, first before selection and close', () => causal('core-skip-removed', pointer, once, 'activation.single-owned-action', ({h}) => {
  assert.equal(h.actions.length, 2); assert.equal(h.hostCalls.length, 2);
  assert.deepEqual(h.actions.map(payload), [itemPayload, itemPayload]);
  assert.deepEqual(h.hostCalls.map(call => call.open), [true, false]);
  assert.deepEqual(h.hostCalls.map(call => call.selected), [['open-file'], ['option-file']]);
  assert.equal(h.f.dialog.closes, 1);
}));
await test('template-only marker omission routes the actual model through generic early action', () => causal('template-marker-omitted', pointer, closed, 'activation.closed-at-action', ({h}) => {
  once({h}); assert.equal(h.hostCalls[0].open, true); assert.equal(h.f.dialog.open, false);
  assert(h.f.options.every(option => !option.hasAttribute('data-interaction-palette-action')));
  assert.equal(h.mutation.sources.core, original.core); assert.equal(h.mutation.sources.runtime, original.runtime);
  assert.equal(h.mutation.sources.template, original.template.replace(' data-interaction-palette-action', ''));
}));
await test('family emission omission closes and selects but loses the public command', () => causal('family-emit-omitted', pointer, once, 'activation.single-owned-action', ({h}) => {
  assert.equal(h.actions.length, 0); assert.equal(h.hostCalls.length, 0); assert.equal(h.results.length, 0);
  assert.equal(h.f.dialog.open, false); assert.equal(h.f.dialog.closes, 1);
  assert.deepEqual(h.snapshot().selected, ['option-file']); assert.equal(h.changes.length, 1);
}));
await test('late close emits one committed command while the dialog is still open', () => causal('close-after-action', pointer, closed, 'activation.closed-at-action', ({h}) => {
  once({h}); assert.deepEqual(h.hostCalls[0].selected, ['option-file']); assert.equal(h.hostCalls[0].open, true);
  assert.equal(h.f.dialog.open, false); assert.equal(h.f.dialog.closes, 1); assert.equal(h.changes.length, 1);
  assert.equal(h.mutation.sources.runtime.split('!current()').length, original.runtime.split('!current()').length, 'late-close reversal retains every owner check');
}));

async function closeRebind(mode, bind = true) {
  const h = model(mode, {bind}), oldHost = [], replacementHost = [], transitions = [];
  if (bind) h.mount(detail => oldHost.push(detail));
  h.f.options[1].form = h.f.form; h.f.query.value = 'captured-query'; h.f.open();
  h.f.trigger.addEventListener('focus', () => {
    transitions.push({open: h.f.dialog.open, actions: h.actions.length});
    // Mutate live values at close focus. A stale transaction would deliver its
    // earlier payload, not these new values, into the newly installed host.
    h.f.options[1].dataset.elyAction = 'replacement-command';
    h.f.options[1].value = 'replacement-file'; h.f.query.value = 'replacement-query';
    h.mount((detail, root) => replacementHost.push({detail, root}));
  });
  const click = h.pointer(); await h.flush();
  return {h, click, oldHost, replacementHost, transitions};
}
function noReplacementCommand({h, oldHost, replacementHost}) {
  assert.equal(replacementHost.length, 0, 'activation.no-old-command-in-replacement-host');
  assert.equal(oldHost.length, 0); assert.equal(h.actions.length, 0); assert.equal(h.changes.length, 0);
}
for (const bind of [true, false]) await test('only post-close owner bypass delivers captured payload into ' + (bind ? 'replacement' : 'newly bound') + ' host', () => causal(
  'post-close-owner-bypassed', mode => closeRebind(mode, bind), noReplacementCommand,
  'activation.no-old-command-in-replacement-host', ({h, oldHost, replacementHost, transitions, click}) => {
    assert.equal(oldHost.length, 0); assert.equal(replacementHost.length, 1);
    assert.equal(h.actions.length, 1); assert.equal(h.hostCalls.length, 1);
    assert.deepEqual(transitions, [{open: false, actions: 0}]);
    assert.equal(replacementHost[0].root, h.f.root); assert.equal(replacementHost[0].detail, h.actions[0]);
    assert.deepEqual(payload(replacementHost[0].detail), {action: 'option-command', value: 'option-file', formData: [['cmdQuery', 'captured-query']], values: [['cmdQuery', 'captured-query']]});
    assert.equal(h.f.options[1].value, 'replacement-file'); assert.equal(h.f.query.value, 'replacement-query');
    assert.equal(h.hostCalls[0].open, false); assert.equal(click.defaultPrevented, false);
    assert.equal(h.changes.length, 0, 'post-emit owner guard remains effective');
  }));

await test('post-close bypass preserves initial, post-FormData and post-emission owner checks', async () => {
  const changed = applyActivationMutation(original, 'post-close-owner-bypassed').sources.runtime;
  const early = '    if (!current() || !dialog.open) { event.preventDefault(); return; }';
  assert.equal(original.runtime.split(early).length - 1, 2); assert.equal(changed.split(early).length - 1, 2);
  assert.equal(changed.split(activationMutants['trailing-notification-guard-removed'].find).length - 1, 1);
  for (const stage of ['initial', 'formdata', 'emission']) {
    const h = model('post-close-owner-bypassed'); let formDataCalls = 0;
    h.f.options[1].form = h.f.form;
    h.f.form.onFormData = () => { formDataCalls++; if (stage === 'formdata') h.mount(); };
    if (stage === 'emission') h.mount(() => h.mount());
    h.f.open(); if (stage === 'initial') h.f.root.dataset.elyReady = 'error';
    h.pointer(); await h.flush();
    assert.equal(formDataCalls, stage === 'initial' ? 0 : 1);
    assert.equal(h.actions.length, stage === 'emission' ? 1 : 0);
    assert.equal(h.changes.length, 0); assert.equal(h.f.dialog.open, stage !== 'emission');
  }
});

async function callbackReopen(mode) {
  const h = model(mode); h.mount(() => h.f.open()); h.f.open(); h.pointer(); await h.flush(); return {h};
}
function noTrailing({h}) {
  assert.equal(h.changes.length, 0, 'activation.no-stale-trailing-notification');
  assert.equal(h.hostChanges.length, 0);
}
await test('trailing guard omission notifies after callback reopens the palette', () => causal('trailing-notification-guard-removed', callbackReopen, noTrailing, 'activation.no-stale-trailing-notification', ({h}) => {
  once({h}); assert.equal(h.f.dialog.open, true); assert.equal(h.document.activeElement, h.f.query);
  assert.equal(h.changes.length, 1); assert.equal(h.hostChanges.length, 1);
  assert.deepEqual(h.timeline.filter(entry => ['host-change', 'change'].includes(entry.type)).map(entry => entry.open), [true, true]);
}));
await test('trailing guard omission can also notify a replacement host', async () => {
  for (const mode of ['control', 'trailing-notification-guard-removed']) {
    const h = model(mode); h.mount(() => { h.mount(); return 'obsolete'; }); h.f.open(); h.pointer(); await h.flush();
    assert.equal(h.actions.length, 1); assert.equal(h.results.length, 0);
    assert.equal(h.hostChanges.length, mode === 'control' ? 0 : 1);
    assert.equal(h.changes.length, mode === 'control' ? 0 : 1);
  }
});

function emptyModel(mode, variant) {
  const h = model(mode, {empty: variant === 'initial'});
  if (variant === 'disabled') h.f.options.forEach(option => option.disabled = true);
  h.f.query.value = variant === 'filtered' ? 'zzzzzz' : '';
  h.f.query.dispatchEvent(new ModelEvent('input', {bubbles: true}));
  h.f.open();
  assert.equal(h.f.options.filter(option => !option.disabled && !option.parentElement.hidden).length, 0);
  return h;
}
async function emptyEnter(mode, variant) {
  const h = emptyModel(mode, variant), key = h.key();
  assert.equal(h.actions.length, 0, 'keydown itself emits no selected command for zero options');
  // Explicitly modeled continuation. ModelEvent cannot perform the browser's
  // native implicit submission; only native CI can prove that event path.
  const modeledDefaultInvoked = !key.defaultPrevented;
  if (modeledDefaultInvoked) h.f.form.requestSubmit();
  await h.flush(); return {h, key, modeledDefaultInvoked};
}
function consumed({h, key, modeledDefaultInvoked}) {
  assert.equal(key.defaultPrevented, true, 'activation.empty-enter-consumed');
  assert.equal(modeledDefaultInvoked, false); assert.equal(h.actions.length, 0); assert.equal(h.changes.length, 0);
  assert.equal(h.f.dialog.open, true); assert.equal(h.document.activeElement, h.f.query);
}
for (const variant of ['initial', 'disabled', 'filtered']) await test('empty Enter fallthrough exposes query-submit continuation: ' + variant, () => causal(
  'empty-enter-fallthrough', mode => emptyEnter(mode, variant), consumed, 'activation.empty-enter-consumed', ({h, key, modeledDefaultInvoked}) => {
    assert.equal(key.defaultPrevented, false); assert.equal(modeledDefaultInvoked, true);
    assert.equal(h.actions.length, 1); assert.equal(h.hostCalls.length, 1);
    assert.equal(h.actions[0].action, 'run'); assert.equal(Object.hasOwn(h.actions[0], 'value'), false);
    assert.deepEqual(plain(h.actions[0].values), [['cmdQuery', variant === 'filtered' ? 'zzzzzz' : '']]);
    assert.equal(h.changes.length, 0); assert.equal(h.f.dialog.open, true);
  }));

async function explicitSubmit(mode, variant) {
  const h = emptyModel(mode, variant), submits = [];
  h.f.form.addEventListener('submit', event => submits.push(event), true);
  h.f.form.requestSubmit(); await h.flush(); return {h, submits};
}
function explicitPreserved({h, submits}) {
  assert.equal(h.actions.length, 1, 'activation.explicit-submit-preserved');
  assert.equal(h.actions[0].action, 'run'); assert.deepEqual(plain(h.actions[0].values), [['cmdQuery', h.f.query.value]]);
  assert.equal(h.hostCalls.length, 1); assert.equal(h.results.length, 1);
  assert.equal(submits.length, 1); assert.equal(submits[0].defaultPrevented, true); assert.equal(submits[0].immediate, false);
  assert.equal(h.f.dialog.open, true);
}
for (const variant of ['initial', 'disabled', 'filtered']) await test('blanket prevention loses explicit requestSubmit action: ' + variant, () => causal(
  'blanket-palette-submit-prevention', mode => explicitSubmit(mode, variant), explicitPreserved, 'activation.explicit-submit-preserved', ({h, submits}) => {
    assert.equal(submits.length, 1); assert.equal(submits[0].defaultPrevented, true); assert.equal(submits[0].immediate, true);
    assert.equal(h.actions.length, 0); assert.equal(h.hostCalls.length, 0); assert.equal(h.results.length, 0);
    assert.equal(h.f.dialog.open, true);
  }));
await test('blanket mutant remains palette-form scoped and leaves unrelated submit routing intact', async () => {
  const h = model('blanket-palette-submit-prevention');
  const form = new ModelNode('form', h.f.root); form.dataset.elySubmit = 'ordinary-submit'; form.reportValidity = () => true;
  const field = new ModelNode('input', form); field.name = 'ordinary'; field.value = 'kept';
  const submit = new ModelEvent('submit', {bubbles: true}); form.dispatchEvent(submit); await h.flush();
  assert.equal(h.actions.length, 1); assert.equal(h.actions[0].action, 'ordinary-submit');
  assert.deepEqual(plain(h.actions[0].values), [['ordinary', 'kept']]); assert.equal(submit.immediate, false);
});

console.log(`CommandPalette source-bound activation controls: ${checks} checks passed; 8 exact causal mutations killed by designated behavioral failures. Whole-runtime DOM doubles only; no browser, native, Go-renderer, or SDUI evidence.`);
