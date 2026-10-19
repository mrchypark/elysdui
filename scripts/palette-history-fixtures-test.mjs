import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {loadPaletteHistory, paletteHistorySourcePaths} from '../ui/gohtmx/tests/browser/palette-history-fixtures.mjs';
import {paletteSourcePaths} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';

const base = fileURLToPath(new URL('../', import.meta.url));
const root = 'ui/gohtmx/tests/fixtures/palette-history';
const manifestBytes = readFileSync(join(base, root, 'manifest.json'));
const manifest = JSON.parse(manifestBytes);
const history = loadPaletteHistory(base);
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
assert.equal(history.tree('0a972e071452f7bdb9bc64f6d27d50c042108885'), 'c400233c889a6701682ded31429a3ce0127bacf0');
assert.equal(history.tree('ee28495c7cd6581d49d53874e831c6cea40930a4'), 'c2d6ed91c378f59070fde8d626df2748e9fd837c');
assert.equal(Object.keys(manifest.revisions).length, 4);
let entries = 0, sources = 0, sourceBytes = 0, rejected = 0;
const reject = (fn, reason) => { assert.throws(fn, reason); rejected++; };
for (const [revision, {files}] of Object.entries(manifest.revisions)) {
  for (const [path, entry] of Object.entries(files)) {
    entries++;
    assert.deepEqual(history.file(revision, path), entry);
    assert.equal(history.sha256(revision, path), entry.sha256);
    if (entry.fixture) {
      sources++; sourceBytes += entry.bytes;
      const bytes = history.source(revision, path);
      assert.equal(sha(bytes), entry.sha256);
      assert.deepEqual(bytes, readFileSync(join(base, root, entry.fixture)));
      bytes[0] ^= 1;
      assert.equal(sha(history.source(revision, path)), entry.sha256, 'returned bytes cannot change validated history');
    } else {
      reject(() => history.source(revision, path), /historical bytes intentionally not vendored/);
    }
    assert(Object.isFrozen(history.file(revision, path)));
  }
}
assert.deepEqual({entries, sources, sourceBytes}, {entries: 76, sources: 5, sourceBytes: 264037});
for (const revision of ['HEAD', 'foreign', '__proto__', '0'.repeat(40)]) reject(() => history.tree(revision), /known historical revision/);
for (const path of ['foreign', '../manifest.json', '__proto__']) reject(() => history.sha256(Object.keys(manifest.revisions)[0], path), /known historical source path/);
for (const path of paletteHistorySourcePaths) assert(paletteSourcePaths.includes(path), 'current-source inventory binds ' + path);
assert.equal(new Set(paletteHistorySourcePaths).size, 9);
assert(JSON.parse(readFileSync(join(base, 'package.json'))).scripts.test.includes('node scripts/palette-history-fixtures-test.mjs'));

// Corruption tests run on copied data without a .git directory. No historical
// Git objects, fallback, network, browser, or server can repair a bad fixture.
const temporary = mkdtempSync(join(tmpdir(), 'ely-palette-history-'));
try {
  cpSync(join(base, root), join(temporary, root), {recursive: true});
  assert.equal(loadPaletteHistory(temporary).tree(Object.keys(manifest.revisions)[0]), history.tree(Object.keys(manifest.revisions)[0]));
  const manifestPath = join(temporary, root, 'manifest.json');
  const firstRevision = Object.keys(manifest.revisions)[0];
  const firstPath = Object.keys(manifest.revisions[firstRevision].files)[0];
  for (const mutate of [
    value => { value.schemaVersion = 2; },
    value => { value.repository = 'https://example.invalid/foreign'; },
    value => { value.revisions[firstRevision].tree = '0'.repeat(40); },
    value => { delete value.revisions[firstRevision]; },
    value => { value.revisions.foreign = value.revisions[firstRevision]; },
    value => { delete value.revisions[firstRevision].files[firstPath]; },
    value => { value.revisions[firstRevision].files.foreign = value.revisions[firstRevision].files[firstPath]; },
    value => { value.revisions[firstRevision].files[firstPath].sha256 = '0'.repeat(64); },
    value => { value.revisions[firstRevision].files[firstPath].blob = '0'.repeat(40); },
    value => { value.revisions[firstRevision].files[firstPath].bytes++; },
    value => { value.revisions[firstRevision].files[firstPath].fixture = '../foreign.js'; },
  ]) {
    const value = structuredClone(manifest); mutate(value);
    writeFileSync(manifestPath, JSON.stringify(value));
    reject(() => loadPaletteHistory(temporary), /fixed historical fixture manifest bytes/);
  }
  writeFileSync(manifestPath, '{');
  reject(() => loadPaletteHistory(temporary), /fixed historical fixture manifest bytes/);
  rmSync(manifestPath);
  reject(() => loadPaletteHistory(temporary), /ENOENT/);
  writeFileSync(manifestPath, manifestBytes);
  for (const {files} of Object.values(manifest.revisions)) for (const entry of Object.values(files)) {
    if (!entry.fixture) continue;
    const path = join(temporary, root, entry.fixture), original = readFileSync(path);
    const changed = Buffer.from(original); changed[0] ^= 1;
    writeFileSync(path, changed);
    reject(() => loadPaletteHistory(temporary), /historical source SHA256/);
    writeFileSync(path, original.subarray(1));
    reject(() => loadPaletteHistory(temporary), /historical source byte length/);
    rmSync(path);
    reject(() => loadPaletteHistory(temporary), /ENOENT/);
    writeFileSync(path, original);
  }
  loadPaletteHistory(temporary);
} finally {
  rmSync(temporary, {recursive: true, force: true});
}
console.log(`Historical fixture portability: ${entries} fixed provenance entries, ${sources} exact source files (${sourceBytes} bytes), ${rejected} rejected corrupt/missing/foreign or unavailable-byte requests. No native evidence.`);
