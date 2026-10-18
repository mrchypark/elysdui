import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {parse} from 'acorn';
import {searchableControls, mutateSearchableSource, searchableIntervention} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-controls.mjs';
import {searchableOracles, searchableCases} from '../ui/gohtmx/tests/browser/searchable-menu-confirmation-evidence.mjs';
const source = await readFile(new URL('../ui/gohtmx/assets/ely-api-interaction.js', import.meta.url), 'utf8');
const sha = text => createHash('sha256').update(text).digest('hex');
assert.equal(sha(searchableOracles.toString()), '7c1bef5436f97ab9efd132bf531bb80a6f8f8350447919140e5599ebd2f94d03', 'baseline source-owned contract remains byte-identical');
assert.deepEqual(Object.keys(searchableControls), ['activate-on-keydown', 'bypass-filter-modifiers', 'confirm-filter-space', 'release-without-arm']);
const ordinaryPress = source.slice(source.indexOf("    if ((menuControl || menuPanel"), source.indexOf('    if (sourceFamily.keydown(event)) return;'));
const ordinaryRelease = source.slice(source.indexOf('    if (menuConfirmKey === event.key)'), source.indexOf("    if ([' ', 'Enter'].includes(event.key)) holdEnd(event);"));
for (const [name, control] of Object.entries(searchableControls)) {
  const mutant = mutateSearchableSource(source, name);
  assert.notEqual(sha(mutant), sha(source));
  parse(mutant, {ecmaVersion: 'latest', sourceType: 'module'});
  assert(mutant.includes(ordinaryPress) && mutant.includes(ordinaryRelease), name + ': ordinary row confirmation unchanged');
  assert(control.patches.every(({anchor}) => source.split(anchor).length === 2));
  assert.deepEqual(searchableIntervention(name).anchorCounts, control.patches.map(() => 1));
  assert(Object.keys(control.failures).every(check => searchableCases('all').includes(check)));
  assert(Object.values(control.failures).every(ids => ids.length && new Set(ids).size === ids.length));
  for (const {anchor} of control.patches) {
    assert.throws(() => mutateSearchableSource(source.replace(anchor, ''), name), /unchanged source anchor/, name + ': missing anchor rejected');
    assert.throws(() => mutateSearchableSource(source + '\n' + anchor, name), /unchanged source anchor/, name + ': duplicate anchor rejected');
  }
}
assert.throws(() => mutateSearchableSource(source, 'foreign'), /known SearchableMenu/);
console.log('SearchableMenu exact-source mutation anchors, syntax, unchanged baseline oracles and ordinary-row handlers passed; no browser launched.');
