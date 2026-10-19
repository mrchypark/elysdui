import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';

const root = 'ui/gohtmx/tests/fixtures/palette-history';
const manifestPath = root + '/manifest.json';
// Reviewed public-source provenance, independent of report/invocation metadata.
// This pins the complete revision/tree/path/blob/length/SHA256 inventory, not
// just whichever entry a caller happens to request. Never fall back to Git.
const manifestSHA256 = '80b6186efffc5b259b299143dd755b7832259758dc3844d44a374be0444cfbb0';
const sourceFixtures = [
  'ac28651be2869bab709bc617a3f7c50bf68d50f5/ui/gohtmx/assets/ely-api-interaction.js',
  'ac28651be2869bab709bc617a3f7c50bf68d50f5/ui/gohtmx/tests/browser/palette-activation-browser-test.mjs',
  'ac28651be2869bab709bc617a3f7c50bf68d50f5/ui/gohtmx/tests/browser/palette-activation-evidence.mjs',
  'ac28651be2869bab709bc617a3f7c50bf68d50f5/ui/gohtmx/tests/browser/palette-activation-observer.js',
  '4ba625b64cd991cf3874639aace590eae70f279d/ui/gohtmx/tests/browser/palette-query-evidence.mjs',
].map(path => 'sources/' + path);
export const paletteHistorySourcePaths = Object.freeze([
  'ui/gohtmx/tests/browser/palette-history-fixtures.mjs',
  'scripts/palette-history-fixtures-test.mjs',
  manifestPath, root + '/README.md',
  ...sourceFixtures.map(path => root + '/' + path),
]);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const blob = bytes => createHash('sha1').update('blob ' + bytes.length + '\0').update(bytes).digest('hex');

export function loadPaletteHistory(base) {
  const bytes = readFileSync(join(base, manifestPath));
  assert.equal(sha(bytes), manifestSHA256, 'fixed historical fixture manifest bytes');
  const manifest = JSON.parse(bytes);
  const sources = new Map();
  for (const [revision, {files}] of Object.entries(manifest.revisions)) {
    for (const [path, entry] of Object.entries(files)) {
      if (!Object.hasOwn(entry, 'fixture')) continue;
      assert(sourceFixtures.includes(entry.fixture), 'known historical source fixture');
      assert.equal(entry.fixture, 'sources/' + revision + '/' + path, 'historical source path binding');
      const source = readFileSync(join(base, root, entry.fixture));
      assert.equal(source.length, entry.bytes, 'historical source byte length: ' + path);
      assert.equal(sha(source), entry.sha256, 'historical source SHA256: ' + path);
      assert.equal(blob(source), entry.blob, 'historical source Git blob: ' + path);
      sources.set(entry.fixture, source);
    }
  }
  assert.deepEqual([...sources.keys()].sort(), [...sourceFixtures].sort(), 'complete historical source fixture inventory');
  const revisionEntry = revision => {
    assert(Object.hasOwn(manifest.revisions, revision), 'known historical revision: ' + revision);
    return manifest.revisions[revision];
  };
  const file = (revision, path) => {
    const {files} = revisionEntry(revision);
    assert(Object.hasOwn(files, path), 'known historical source path: ' + path);
    return files[path];
  };
  return Object.freeze({
    tree: revision => revisionEntry(revision).tree,
    file: (revision, path) => Object.freeze({...file(revision, path)}),
    sha256: (revision, path) => file(revision, path).sha256,
    source: (revision, path) => {
      const entry = file(revision, path);
      assert(Object.hasOwn(entry, 'fixture'), 'historical bytes intentionally not vendored: ' + path);
      return Buffer.from(sources.get(entry.fixture));
    },
  });
}
