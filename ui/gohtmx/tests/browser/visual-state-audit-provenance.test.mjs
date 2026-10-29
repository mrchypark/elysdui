import assert from 'node:assert/strict';
import {test} from 'node:test';
import {captureSourceProvenance} from './visual-state-audit-provenance.mjs';

test('caller-supplied base URL does not claim local source identity', () => {
  const local = {sourceRevision: 'a'.repeat(40), sourceTreeSHA256: 'b'.repeat(64)};
  const external = captureSourceProvenance({baseURL: 'https://audit.example', origin: 'https://audit.example', ...local});
  assert.equal(external.status, 'unverified');
  assert.equal(external.sourceRevision, null);
  assert.equal(external.sourceTreeSHA256, null);
  assert.deepEqual(external.localSnapshot, {...local, scope: 'runner-local-source-snapshot'});

  const owned = captureSourceProvenance({baseURL: null, origin: 'http://127.0.0.1:3210', ...local});
  assert.equal(owned.status, 'verified');
  assert.equal(owned.sourceRevision, local.sourceRevision);
  assert.equal(owned.sourceTreeSHA256, local.sourceTreeSHA256);
});
