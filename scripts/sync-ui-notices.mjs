import {readFile, writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const check = process.argv.includes('--check');
for (const name of ['LICENSE', 'THIRD_PARTY_UI.md']) {
 const source = await readFile(new URL(`../${name}`, import.meta.url));
 const destination = new URL(`../ui/gohtmx/${name}`, import.meta.url);
 if (check) assert.deepEqual(await readFile(destination), source, `${name} embed copy is stale; run node scripts/sync-ui-notices.mjs`);
 else await writeFile(destination, source);
}
