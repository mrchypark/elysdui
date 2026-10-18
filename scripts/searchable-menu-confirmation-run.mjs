import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadSearchableInputs} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-inputs.mjs';
import {verifySearchableEvidence} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-evidence.mjs';

// A fresh process and independently rendered byte expectations are mandatory.
// This is not a cached-report acceptance tool. It preserves the child's real
// nonzero exit even when the report is a structurally valid failing baseline.
const base = fileURLToPath(new URL('../', import.meta.url));
const surface = process.env.SEARCHABLE_MENU_SURFACE || 'qualified';
const group = process.env.SEARCHABLE_MENU_GROUP || 'all';
assert.equal(process.env.CI, 'true', 'browser execution is restricted to CI');
const runToken = randomUUID();
const {assetBodies, fixtureBodies, ...trusted} = await loadSearchableInputs(base, surface);
assert.equal(trusted.dirty, '', 'browser evidence requires a clean committed checkout');
const child = spawnSync(process.execPath, ['ui/gohtmx/tests/browser/searchable-menu-confirmation-browser-test.mjs'], {cwd: base, env: {...process.env, SEARCHABLE_MENU_RUN_TOKEN: runToken}, stdio: 'inherit'});
assert.equal(child.error, undefined); assert.equal(child.signal, null);
const report = JSON.parse(await readFile(new URL(`../test-results/contracts/searchable-menu-confirmation-${surface}-${group}.json`, import.meta.url), 'utf8'));
const verdict = verifySearchableEvidence(report, {...trusted, surface, group, runToken}, child.status);
console.log(JSON.stringify({evidenceValidation: 'valid', ...verdict, rawExit: child.status}));
process.exitCode = child.status;
