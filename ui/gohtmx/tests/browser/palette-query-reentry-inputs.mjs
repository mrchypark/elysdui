import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {loadPaletteInputs, paletteSHA} from './palette-query-inputs.mjs';
export const reentrySourcePaths = [
  'ui/gohtmx/tests/browser/palette-query-reentry-browser-test.mjs',
  'ui/gohtmx/tests/browser/palette-query-reentry-observer.js',
  'ui/gohtmx/tests/browser/palette-query-reentry-inputs.mjs',
  'ui/gohtmx/tests/browser/palette-query-reentry-evidence.mjs',
  'scripts/palette-query-reentry-run.mjs', 'scripts/palette-query-reentry-replay.mjs',
  'scripts/palette-query-reentry-evidence-test.mjs', '.github/workflows/palette-query-reentry.yml',
];
export async function loadReentryInputs(base, surface) {
  const inputs = await loadPaletteInputs(base, surface);
  inputs.reentrySourceFiles = {};
  for (const path of reentrySourcePaths) inputs.reentrySourceFiles[path] = paletteSHA(await readFile(join(base, path)));
  const body = await readFile(join(base, 'ui/gohtmx/tests/browser/palette-query-reentry-observer.js'));
  const metadata = {sourceSHA256: paletteSHA(body), servedSHA256: paletteSHA(body), bytes: body.length, contentType: 'text/javascript; charset=utf-8'};
  inputs.assetBodies.set('/reentry-observer.js', {body, ...metadata}); inputs.assets['/reentry-observer.js'] = metadata;
  return inputs;
}
