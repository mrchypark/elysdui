import assert from 'node:assert/strict';
import {readFileSync, writeFileSync, mkdtempSync, mkdirSync, rmSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {runInNewContext} from 'node:vm';
import {
  ariaControlsOracle, ariaLabelledbyOracle, stickyHeadingOracle,
  navigationMarkupMutations, mutateNavigationMarkup, mutateStickyHeading,
  readTabRelations, assertTabRelations, readVirtualHeading, assertStickyHeading,
  assertPeerHeadingUnchanged,
} from './navigation-virtual-oracles.mjs';

const failsAt = (run, message) => assert.throws(run, error => error instanceof assert.AssertionError && error.message.includes(message));
const element = (id, attrs = {}) => ({id, attrs, getAttribute(name) { return this.attrs[name] ?? null; }});
const tabs = [element('tabs-a-tab-0', {'aria-controls': 'tabs-a-panel-0'}), element('tabs-a-tab-1', {'aria-controls': 'tabs-a-panel-1'})];
const panels = [element('tabs-a-panel-0', {'aria-labelledby': tabs[0].id}), element('tabs-a-panel-1', {'aria-labelledby': tabs[1].id})];
const peer = element('tabs-b-panel-0', {'aria-labelledby': 'tabs-b-tab-0'});
const ids = [...tabs, ...panels, peer];
const root = {ownerDocument: {querySelectorAll: () => ids}, querySelectorAll: selector => selector === '[role="tab"]' ? tabs : panels};
// Playwright serializes these functions. Verify neither needs module closures.
const collectTabs = runInNewContext(`(${readTabRelations.toString()})`);
const checkTabs = () => assertTabRelations(collectTabs(root), 2, 'deterministic harness');
checkTabs();
for (const value of [peer.id, 'missing-panel', 'tabs-a-panel-0 tabs-b-panel-0', panels[1].id]) {
  tabs[0].attrs['aria-controls'] = value;
  if (value === panels[1].id) panels[1].attrs['aria-labelledby'] = tabs[0].id;
  failsAt(checkTabs, ariaControlsOracle);
  panels[1].attrs['aria-labelledby'] = tabs[1].id;
}
tabs[0].attrs['aria-controls'] = panels[0].id;
ids.push(element(panels[0].id));failsAt(checkTabs, ariaControlsOracle);ids.pop();
panels[0].attrs['aria-labelledby'] = 'tabs-b-tab-0';failsAt(checkTabs, ariaLabelledbyOracle);
panels[0].attrs['aria-labelledby'] = tabs[0].id;
ids.push(element(tabs[0].id));failsAt(checkTabs, 'tab IDs must be unique');ids.pop();
tabs[0].id = '';failsAt(checkTabs, 'tab IDs must be nonempty');tabs[0].id = 'tabs-a-tab-0';
checkTabs();

for (const [name, [from, to]] of Object.entries(navigationMarkupMutations)) {
  const source = `<button ${from}></button><section role="tabpanel"></section>`;
  assert.equal(mutateNavigationMarkup(source, name), source.replace(from, to));
  failsAt(() => mutateNavigationMarkup('', name), 'mutation anchor must occur exactly once');
  failsAt(() => mutateNavigationMarkup(source + source, name), 'mutation anchor must occur exactly once');
}
const css = readFileSync(new URL('../ui/gohtmx/assets/ely-api-data.css', import.meta.url), 'utf8');
assert.equal(mutateStickyHeading(css).replace('.ely-data__virtual-table thead{position:static;', '.ely-data__virtual-table thead{position:sticky;'), css);

const heading = {getBoundingClientRect: () => ({top: 101, bottom: 133, height: 32})};
const viewport = {scrollTop: 16000, clientTop: 1, clientHeight: 298, getBoundingClientRect: () => ({top: 100}), querySelector: () => heading};
const collectHeading = runInNewContext(`(${readVirtualHeading.toString()})`, {getComputedStyle: () => ({position: 'sticky', top: '0px'})});
const pinned = collectHeading(viewport);
assert.equal(pinned.innerTop, 101, 'measurement includes the viewport border');
assert.equal(pinned.innerBottom, 399);
assertStickyHeading(pinned, 'mid');assertStickyHeading({...pinned, scrollTop: 31734}, 'end');
failsAt(() => assertStickyHeading({...pinned, position: 'static', headingTop: -15899, headingBottom: -15867}, 'mutant'), stickyHeadingOracle);
failsAt(() => assertStickyHeading({...pinned, headingTop: 0, headingBottom: 32}, 'wrong ancestor'), stickyHeadingOracle);
failsAt(() => assertStickyHeading({...pinned, headingBottom: 400.1}, 'clipped'), stickyHeadingOracle);
failsAt(() => assertStickyHeading({...pinned, scrollTop: 0}, 'unscrolled'), 'after scrolling past the heading');
failsAt(() => assertStickyHeading({...pinned, position: 'static'}, 'style'), 'computed position must be sticky');
failsAt(() => assertStickyHeading({...pinned, top: '1px'}, 'inset'), 'computed sticky inset must be zero');
assertPeerHeadingUnchanged(pinned, {...pinned, innerTop: 1, headingTop: 1}, 'page scroll');
failsAt(() => assertPeerHeadingUnchanged(pinned, {...pinned, scrollTop: 16032}, 'peer'), 'must not scroll its peer');
failsAt(() => assertPeerHeadingUnchanged(pinned, {...pinned, headingTop: 99}, 'peer'), 'peer heading viewport position');
console.log('Deterministic ARIA and sticky-heading oracle harness passed; real layout and HTMX execution require browser CI.');

// Fail before server startup/browser launch, including the new SDUI compilation
// path. A renderer failure must leave useful evidence, not an absent report.
const directory = mkdtempSync(join(tmpdir(), 'navigation-oracle-harness-'));
try {
  const bin = join(directory, 'bin');mkdirSync(bin);
  writeFileSync(join(bin, 'git'), '#!/bin/sh\nprintf fixture-revision\n', {mode: 0o755});
  for (const stage of ['render-fixture', 'render-grouped-fragment']) {
    const body = stage === 'render-fixture'
      ? 'echo intentional-render-failure >&2\nexit 17'
      : 'if [ "$3" = "grouped-fragment" ]; then echo intentional-render-failure >&2; exit 17; fi\nprintf "<section>fixture</section>"';
    writeFileSync(join(bin, 'go'), `#!/bin/sh\n${body}\n`, {mode: 0o755});
    const result = spawnSync(process.execPath, [fileURLToPath(new URL('../ui/gohtmx/tests/browser/navigation-contracts-browser-test.mjs', import.meta.url))], {
      cwd: directory, env: {...process.env, PATH: `${bin}:${process.env.PATH}`, NAVIGATION_NEGATIVE_CONTROL: ''}, encoding: 'utf8', timeout: 15000,
    });
    assert.equal(result.status, 1, `${stage}: rendering must fail before browser startup`);
    const report = JSON.parse(readFileSync(join(directory, 'test-results/contracts/navigation.json'), 'utf8'));
    assert.equal(report.status, 'failed');assert.equal(report.stage, stage);assert.equal(report.revision, 'fixture-revision');
    assert.match(report.error, /intentional-render-failure/);assert.deepEqual(report.checks, []);
  }
  console.log('Navigation fixture and grouped SDUI render failures retain reports before browser launch.');
} finally {
  rmSync(directory, {recursive: true, force: true});
}
