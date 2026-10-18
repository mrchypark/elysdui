import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
const valid=['/','/elysdui/','/releases/v1.2/','/org.github.io/project/','/a_b/c-d/'];
const invalid=['','relative/','/missing-trailing','//','/a//b/','/./','/../','/a/./b/','/a/../b/','/a/?q=1','/a/#hash','/a b/','/a%2fb/'];
for(const [values,expected] of [[valid,0],[invalid,1]]) for(const base of values) {
 const result=spawnSync('bash',['-c','source scripts/pages-base.sh; valid_pages_base "$1"','validator',base]);
 assert.equal(result.status,expected,JSON.stringify(base));
}
console.log('Pages base validator accepts dotted segments and rejects traversal/malformed paths.');

// A directory link must preserve its slash before any server redirect. Static
// hosts and offline preview servers must resolve the same document and assets.
const hub=readFileSync(new URL('../site/index.html',import.meta.url),'utf8');
const links=[...hub.matchAll(/href="([^"]+)"/g)].map(match=>match[1]);
for (const destination of ['go-htmx/','go-htmx/playground/']) {
 assert.equal(links.filter(link=>link===destination).length,2,`hub directory link ${destination}`);
 assert(!links.includes(destination.slice(0,-1)),`hub must not depend on directory redirect for ${destination}`);
 for(const base of ['/','/elysdui/']) assert.equal(new URL(destination,'https://example.test'+base).pathname,base+destination);
}
assert(links.includes('./'),'home link preserves the directory form');
console.log('Project hub directory links preserve canonical slash routes.');
