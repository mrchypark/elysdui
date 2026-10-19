import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadPaletteInputs} from '../ui/gohtmx/tests/browser/palette-query-inputs.mjs';
import {verifyPaletteEvidence} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';
// No browser or server. Positional invocation identity must come from the
// independent run record, never by copying fields out of the target report.
const [reportPath, invocationPath, exitPath, revision, tree, runToken] = process.argv.slice(2);
assert(reportPath && invocationPath && exitPath && revision && tree && runToken, 'usage: node scripts/palette-query-replay.mjs REPORT INVOCATION EXIT EXPECTED_REVISION EXPECTED_TREE EXPECTED_TOKEN');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const invocation = JSON.parse(await readFile(invocationPath, 'utf8'));
const exit = JSON.parse(await readFile(exitPath, 'utf8'));
for (const source of [invocation, exit]) for (const [key, value] of Object.entries({revision, tree, runToken})) assert.equal(source[key], value, 'independent invocation ' + key);
const base = fileURLToPath(new URL('../', import.meta.url));
const {assetBodies, fixtureBodies, ...current} = await loadPaletteInputs(base, invocation.surface);
assert.equal(current.dirty, ''); assert.equal(current.revision, revision); assert.equal(current.tree, tree);
for (const key of ['sourceFiles', 'assets', 'fixtures', 'fixtureManifest', 'standaloneDependencyProof']) assert.deepEqual(invocation[key], current[key], 'current-source replay ' + key);
// Actual CI toolchain is independently stored before browser launch. A replay
// may run on another Node/Go build; preserve that documented run provenance.
const verdict = verifyPaletteEvidence(report, {...current, ...invocation, revision, tree, runToken}, exit.exitCode);
console.log(JSON.stringify({evidenceValidation: 'valid-replay', ...verdict, rawExit: exit.exitCode}));
