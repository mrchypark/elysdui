import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {reentryMutation, reentryMutationMetadata, reentryRuntimePath} from './palette-query-reentry-mutants.mjs';
import {loadPaletteInputs, paletteSHA} from './palette-query-inputs.mjs';
export const reentrySourcePaths = [
  'ui/gohtmx/tests/browser/palette-query-reentry-browser-test.mjs',
  'ui/gohtmx/tests/browser/palette-query-reentry-observer.js',
  'ui/gohtmx/tests/browser/palette-query-reentry-inputs.mjs',
  'ui/gohtmx/tests/browser/palette-query-reentry-evidence.mjs',
  'ui/gohtmx/tests/browser/palette-query-reentry-mutants.mjs',
  'ui/gohtmx/tests/browser/diagnostics/palette-query-reentry-guard-causal.md',
  'scripts/palette-query-reentry-guard-evidence-test.mjs',
  'scripts/palette-query-reentry-replay-test.mjs',
  'scripts/palette-query-reentry-run.mjs', 'scripts/palette-query-reentry-replay.mjs',
  'scripts/palette-query-reentry-evidence-test.mjs', '.github/workflows/palette-query-reentry.yml',
];
export async function loadReentryInputs(base, surface, mode = 'control', options = {}) {
  const inputs = await loadPaletteInputs(base, surface, options);
  inputs.reentrySourceFiles = {};
  for (const path of reentrySourcePaths) inputs.reentrySourceFiles[path] = paletteSHA(await readFile(join(base, path)));
  const body = await readFile(join(base, 'ui/gohtmx/tests/browser/palette-query-reentry-observer.js'));
  const metadata = {sourceSHA256: paletteSHA(body), servedSHA256: paletteSHA(body), bytes: body.length, contentType: 'text/javascript; charset=utf-8'};
  inputs.assetBodies.set('/reentry-observer.js', {body, ...metadata}); inputs.assets['/reentry-observer.js'] = metadata;
  const runtime = inputs.assetBodies.get(reentryRuntimePath);
  const served = Buffer.from(reentryMutation(runtime.body.toString('utf8'), mode, inputs.productionPolicy));
  runtime.body = served; runtime.servedSHA256 = paletteSHA(served); runtime.bytes = served.length;
  // assetBodies may contain non-JSON internal metadata (for example Sets).
  // Preserve the original serialized asset schema and change only served bytes.
  inputs.assets[reentryRuntimePath] = {...inputs.assets[reentryRuntimePath],
    servedSHA256:runtime.servedSHA256, bytes:runtime.bytes};
  inputs.mode = mode; inputs.mutation = reentryMutationMetadata(mode, inputs.productionPolicy);
  return inputs;
}
