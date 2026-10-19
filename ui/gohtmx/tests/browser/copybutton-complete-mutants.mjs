import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

const runtime = '/assets/ely-api-interaction.js';
const css = '/assets/ely-api-interaction.css';
const sha = value => createHash('sha256').update(value).digest('hex');
const mutation = (asset, before, after, description) => Object.freeze({asset, before, after, description});
// Seven finite repairs, not a Cartesian matrix. Each replacement must match
// once in the committed production source and changes only in-memory served
// bytes. These are intentional regressions, never production feature flags.
export const copyMutants = Object.freeze({
  'copied-lockout': mutation(runtime,
    "if (previous?.current() && previous.phase !== 'failed') return;",
    "if (previous?.current() && previous.phase === 'pending') return;",
    'Allow copied-phase activation while retaining pending deduplication.'),
  'captured-action': mutation(runtime,
    'try { action(actionName, {value}); }',
    "try { action(button.dataset.elyAction || 'copy', {value}); }",
    'Read the action at resolution instead of capturing it with the payload.'),
  'completion-owner': mutation(runtime,
    'if (!record.current()) { retire(record); return; }',
    'if (false) { retire(record); return; }',
    'Permit a stale pending completion through the current-owner gate.'),
  'stale-timer-defenses': mutation(runtime,
    'record.reset = setTimeout(() => retire(record), 1400);',
    'setTimeout(() => { delete button.dataset.interactionCopied; retire(record); }, 1400);',
    'Combined stale-timer defense reversal: lose cancellation handle and clear before record ownership. Does not certify either defense independently.'),
  'default-radius': mutation(css,
    'min-height:24px;padding:0;border-radius:6px}',
    'min-height:24px;padding:0;border-radius:7px}',
    'Change only the minimal control radius; no icon-only sensitivity claim.'),
  'check-color': mutation(css,
    'flex-basis:14px;color:var(--color-success,var(--success,#4d9d70));mask-image:',
    'flex-basis:14px;color:var(--color-ink);mask-image:',
    'Use foreground instead of success color; no glyph sensitivity claim.'),
  'motion-duration': mutation(css,
    'animation:ely-copy-check 120ms cubic-bezier(.333333,1,.666667,1)',
    'animation:ely-copy-check 121ms cubic-bezier(.333333,1,.666667,1)',
    'Change only normal-motion duration; preserve rotation, easing and reduced motion.'),
});
export const copyModes = Object.freeze(['control', ...Object.keys(copyMutants)]);
export function copyMode(mode = 'control') {
  assert(copyModes.includes(mode), 'known external CopyButton mode');
  return mode;
}
export function copyOutputPath(mode = 'control') {
  copyMode(mode);
  return mode === 'control' ? 'test-results/copybutton-complete' : 'test-results/copybutton-complete-controls/' + mode;
}
export function transformCopySource(source, mode) {
  copyMode(mode);
  assert(Buffer.isBuffer(source), 'mutation source must retain exact bytes');
  if (mode === 'control') return {body: Buffer.from(source), mutation: null};
  const spec = copyMutants[mode], text = source.toString('utf8');
  assert(source.equals(Buffer.from(text)), 'mutation source must be lossless UTF-8');
  assert.equal(text.split(spec.before).length - 1, 1, 'exactly one current-source mutation anchor: ' + mode);
  assert.equal(text.includes(spec.after), false, 'source cannot already contain this mutant: ' + mode);
  const body = Buffer.from(text.replace(spec.before, spec.after));
  assert.notEqual(sha(source), sha(body), 'mutation must change actual served bytes');
  return {body, mutation: {mode, asset: spec.asset, source: 'ui/gohtmx' + spec.asset, sourceSHA256: sha(source), servedSHA256: sha(body), beforeSHA256: sha(spec.before), afterSHA256: sha(spec.after), replacements: 1}};
}
export function verifyCopyMutation(trusted, externalMode) {
  copyMode(externalMode);
  assert.equal(trusted.mode, externalMode, 'source-run mode is externally selected');
  const changed = Object.entries(trusted.assets).filter(([, value]) => value.sourceSHA256 !== value.servedSHA256).map(([path]) => path);
  if (externalMode === 'control') {
    assert.equal(trusted.mutation, null, 'clean control has no mutation');
    assert.deepEqual(changed, [], 'clean control serves exact production bytes');
    return;
  }
  const spec = copyMutants[externalMode], m = trusted.mutation;
  assert(m && typeof m === 'object', 'independent mutation receipt required');
  assert.deepEqual(Object.keys(m).sort(), ['mode','asset','source','sourceSHA256','servedSHA256','beforeSHA256','afterSHA256','replacements'].sort(), 'exact mutation metadata');
  assert.equal(m.mode, externalMode); assert.equal(m.asset, spec.asset); assert.equal(m.source, 'ui/gohtmx' + spec.asset);
  assert.equal(m.beforeSHA256, sha(spec.before)); assert.equal(m.afterSHA256, sha(spec.after)); assert.equal(m.replacements, 1);
  assert.equal(m.sourceSHA256, trusted.sourceFiles[m.source], 'mutant source joined to committed source');
  assert.equal(m.sourceSHA256, trusted.assets[spec.asset]?.sourceSHA256);
  assert.equal(m.servedSHA256, trusted.assets[spec.asset]?.servedSHA256);
  assert.notEqual(m.sourceSHA256, m.servedSHA256);
  assert.deepEqual(changed, [spec.asset], 'exactly one designated asset changes');
}
