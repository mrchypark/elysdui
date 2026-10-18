import assert from 'node:assert/strict';

export const ariaControlsOracle = 'tab aria-controls must resolve exactly one owned tabpanel';
export const ariaLabelledbyOracle = 'tabpanel aria-labelledby must reference its controlling tab';
export const stickyHeadingOracle = 'virtual table heading must stay pinned inside its scrolled viewport';

// Corrupt one relationship in the production renderer's response, including
// /fragment. A real ID from the peer instance tests ownership, not just existence.
export const navigationMarkupMutations = {
  'aria-controls': ['aria-controls="tabs-a-panel-0"', 'aria-controls="tabs-b-panel-0"', ariaControlsOracle],
  'aria-labelledby': ['aria-labelledby="tabs-a-tab-0"', 'aria-labelledby="tabs-b-tab-0"', ariaLabelledbyOracle],
};

export function replaceExactlyOnce(source, from, to) {
  assert.equal(source.split(from).length - 1, 1, 'mutation anchor must occur exactly once');
  return source.replace(from, to);
}

export function mutateNavigationMarkup(markup, mutation) {
  const replacement = navigationMarkupMutations[mutation];
  return replacement ? replaceExactlyOnce(markup, replacement[0], replacement[1]) : markup;
}

export function mutateStickyHeading(css) {
  return replaceExactlyOnce(css, '.ely-data__virtual-table thead{position:sticky;', '.ely-data__virtual-table thead{position:static;');
}

// Passed directly to Locator.evaluate: no closures or test-side DOM substitutes.
export function readTabRelations(root) {
  const ids = [...root.ownerDocument.querySelectorAll('[id]')];
  const panels = [...root.querySelectorAll('[role="tabpanel"]')];
  return {
    panelCount: panels.length,
    tabs: [...root.querySelectorAll('[role="tab"]')].map(tab => {
      const controls = tab.getAttribute('aria-controls');
      const targets = ids.filter(node => node.id === controls);
      return {
        id: tab.id,
        idCount: ids.filter(node => node.id === tab.id).length,
        controls,
        targetCount: targets.length,
        ownedPanel: targets.length === 1 && panels.includes(targets[0]),
        labelledby: targets[0]?.getAttribute('aria-labelledby'),
      };
    }),
  };
}

export function assertTabRelations(snapshot, expectedCount, phase) {
  assert.equal(snapshot.tabs.length, expectedCount, `${phase}: expected rendered tab count`);
  assert.equal(snapshot.panelCount, expectedCount, `${phase}: one panel per rendered tab`);
  const controls = new Set();
  for (const tab of snapshot.tabs) {
    assert(tab.id && !/\s/.test(tab.id), `${phase}: tab IDs must be nonempty ID tokens`);
    assert.equal(tab.idCount, 1, `${phase}: tab IDs must be unique in the document`);
    assert(tab.controls && !/\s/.test(tab.controls) && tab.targetCount === 1 && tab.ownedPanel && !controls.has(tab.controls), `${phase}: ${ariaControlsOracle}`);
    controls.add(tab.controls);
    assert.equal(tab.labelledby, tab.id, `${phase}: ${ariaLabelledbyOracle}`);
  }
}

export function readVirtualHeading(viewport) {
  const heading = viewport.querySelector('thead');
  const rect = viewport.getBoundingClientRect();
  const headingRect = heading.getBoundingClientRect();
  const style = getComputedStyle(heading);
  return {
    scrollTop: viewport.scrollTop,
    innerTop: rect.top + viewport.clientTop,
    innerBottom: rect.top + viewport.clientTop + viewport.clientHeight,
    headingTop: headingRect.top,
    headingBottom: headingRect.bottom,
    headingHeight: headingRect.height,
    position: style.position,
    top: style.top,
  };
}

export function assertStickyHeading(snapshot, phase) {
  assert(snapshot.scrollTop > snapshot.headingHeight, `${phase}: sticky oracle must run after scrolling past the heading`);
  // Geometry runs first so the CSS-only mutant is killed by visible behavior,
  // rather than merely discovering that its position declaration changed.
  assert(snapshot.headingHeight > 0 && Math.abs(snapshot.headingTop - snapshot.innerTop) <= 1 && snapshot.headingBottom > snapshot.innerTop && snapshot.headingBottom <= snapshot.innerBottom + 1, `${phase}: ${stickyHeadingOracle}`);
  assert.equal(snapshot.position, 'sticky', `${phase}: heading computed position must be sticky`);
  assert.equal(snapshot.top, '0px', `${phase}: heading computed sticky inset must be zero`);
}

export function assertPeerHeadingUnchanged(before, after, phase) {
  assert.equal(after.scrollTop, before.scrollTop, `${phase}: scrolling one virtual table must not scroll its peer`);
  assert.equal(after.headingHeight, before.headingHeight, `${phase}: peer heading height must stay unchanged`);
  // Page focus may scroll the document; compare viewport-relative positions.
  assert(Math.abs((after.headingTop - after.innerTop) - (before.headingTop - before.innerTop)) <= 1, `${phase}: peer heading viewport position must stay unchanged`);
}
