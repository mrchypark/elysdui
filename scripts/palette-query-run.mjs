import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {readFile, writeFile, mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {loadPaletteInputs} from '../ui/gohtmx/tests/browser/palette-query-inputs.mjs';
import {paletteReportName, verifyPaletteEvidence} from '../ui/gohtmx/tests/browser/palette-query-evidence.mjs';
const base = fileURLToPath(new URL('../', import.meta.url));
const surface = process.env.PALETTE_QUERY_SURFACE || 'go-qualified', group = process.env.PALETTE_QUERY_GROUP || 'all';
assert.equal(process.env.CI, 'true', 'browser execution is restricted to CI');
const runToken = randomUUID();
const {assetBodies, fixtureBodies, ...trusted} = await loadPaletteInputs(base, surface);
assert.equal(trusted.dirty, '', 'committed clean source required');
await mkdir(new URL('../test-results/contracts/', import.meta.url), {recursive: true});
// Written before the child starts, for independent replay with a separately
// supplied invocation identity. Report-authored provenance is never trusted.
const invocation = {...trusted, surface, group, runToken};
await writeFile(new URL(`../test-results/contracts/${paletteReportName(surface, group)}.invocation.json`, import.meta.url), JSON.stringify(invocation, null, 2));
const child = spawnSync(process.execPath, ['ui/gohtmx/tests/browser/palette-query-browser-test.mjs'], {cwd: base, env: {...process.env, PALETTE_QUERY_RUN_TOKEN: runToken}, stdio: 'inherit'});
assert.equal(child.error, undefined); assert.equal(child.signal, null);
await writeFile(new URL(`../test-results/contracts/${paletteReportName(surface, group)}.exit.json`, import.meta.url), JSON.stringify({revision: trusted.revision, tree: trusted.tree, runToken, exitCode: child.status}));
const report = JSON.parse(await readFile(new URL(`../test-results/contracts/${paletteReportName(surface, group)}`, import.meta.url), 'utf8'));
const verdict = verifyPaletteEvidence(report, invocation, child.status);
console.log(JSON.stringify({evidenceValidation: 'valid', ...verdict, rawExit: child.status}));
process.exitCode = child.status;
