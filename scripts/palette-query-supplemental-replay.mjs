import assert from 'node:assert/strict';
import {paletteProductionPolicy} from '../ui/gohtmx/tests/browser/palette-query-production-policy.mjs';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadSupplementalInputs} from '../ui/gohtmx/tests/browser/palette-query-supplemental-inputs.mjs';
import {verifySupplementalEvidence} from '../ui/gohtmx/tests/browser/palette-query-supplemental-evidence.mjs';
// No browser or server. Positional invocation identity must come from the
// independent run record, never by copying fields out of the target report.
const [reportPath, invocationPath, exitPath, revision, tree, runToken, productionPolicy = 'strict'] = process.argv.slice(2);
assert(reportPath && invocationPath && exitPath && revision && tree && runToken, 'usage: node scripts/palette-query-supplemental-replay.mjs REPORT INVOCATION EXIT EXPECTED_REVISION EXPECTED_TREE EXPECTED_TOKEN [EXPECTED_PRODUCTION_POLICY=strict]');
const report = JSON.parse(await readFile(reportPath, 'utf8'));
const invocation = JSON.parse(await readFile(invocationPath, 'utf8'));
const exit = JSON.parse(await readFile(exitPath, 'utf8'));
for (const source of [invocation, exit]) for (const [key, value] of Object.entries({revision, tree, runToken, productionPolicy})) assert.equal(source[key], value, 'independent invocation ' + key);
paletteProductionPolicy(productionPolicy);
const base = fileURLToPath(new URL('../', import.meta.url));
const {assetBodies, fixtureBodies, ...current} = await loadSupplementalInputs(base, invocation.surface, invocation.mode, {productionPolicy});
assert.equal(current.dirty, ''); assert.equal(current.revision, revision); assert.equal(current.tree, tree);
for (const key of ['productionPolicy', 'sourceFiles', 'assets', 'fixtures', 'fixtureManifest', 'standaloneDependencyProof', 'mutation']) assert.deepEqual(invocation[key], current[key], 'current-source replay ' + key);
// Actual CI toolchain is independently stored before browser launch. A replay
// may run on another Node/Go build; preserve that documented run provenance.
const verdict = verifySupplementalEvidence(report, {...current, ...invocation, revision, tree, runToken}, exit.exitCode);
console.log(JSON.stringify({evidenceValidation: 'valid-replay', ...verdict, rawExit: exit.exitCode}));
