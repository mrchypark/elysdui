import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {loadContextOwnerAssets} from './context-owner-assets.mjs';
import {menuPointerControls, mutateMenuPointerSource} from './menu-pointer-selection-controls.mjs';

// Real Chromium only, through authorized CI. This executable never treats a
// known defect as success. Every isolated case records all intended-behavior
// mismatches, then the suite exits nonzero. Pointer/keyboard provenance is kept
// separate from deliberately synthetic boundary and disposed-node injections.
const base = fileURLToPath(new URL('../../../../', import.meta.url));
const sha = value => createHash('sha256').update(value).digest('hex');
const mutation = process.env.MENU_POINTER_MUTATION || '';
const selectedSurface = process.env.MENU_POINTER_SURFACE || 'all';
const surfaces = selectedSurface === 'all' ? ['qualified', 'chapter', 'sdui'] : [selectedSurface];
const selectedCase = process.env.MENU_POINTER_CASE || '';
const fixturePaths = {
  standalone: './ui/gohtmx/tests/fixtures/menu-pointer-selection',
  sdui: './adapters/gohtmx/tests/fixtures/menu-pointer-selection',
};
const aliases = ['SubMenu', 'DropdownMenu', 'OverflowMenu', 'CheckboxMenuItem', 'RadioMenuItem', 'ContextMenu'];
const report = {
  suite: 'menu-pointer-selection', status: 'running', stage: 'startup', mutation, surfaces,
  sourcePins: {menu: '49ed1f84056fa13347d68801b479a4a5a8e03b53', compatibilityAudit: 'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721'},
  actualMainBaseline: 'bc6993ecbc69f0b36489ecc0a98f9d1c8f1ae01f',
  reviewedBaseline: {revision: '0950b0e8738e8d00e2a7e4bbf1531778dbe20fca', tree: 'd424949fe224a5464f2483062aaaa1c7ae591222'},
  scope: 'Existing ordinary menu leaf selection and disabled-row inertness; no new row API, hover timing, native/GPUI, touch, RTL, screen-reader or all-host parity claim.',
  inputLabels: {pointer: 'trusted Playwright mouse', keyboard: 'trusted Playwright keyboard', boundary: 'explicit synthetic PointerEvent', owner: 'synthetic root-local ely:context-request CustomEvent', disposed: 'explicit synthetic retained-node events'},
  checks: [], requests: [], assets: {}, fixtures: {}, fixtureSources: {},
  pageErrors: [], consoleErrors: [], requestFailures: [], serverErrors: [], runtimeErrors: [], transportErrors: [], browserResponses: [], httpAssetProof: [],
};
let browser, server, page, temp, current, currentSurface, currentAlias;
const responseTasks = [];
const same = (a, b) => { try { assert.deepEqual(a, b); return true; } catch { return false; } };
const record = (id, observed, expected, prerequisite = false) => {
  const entry = {id, observed, expected, pass: same(observed, expected), prerequisite};
  current.oracles.push(entry);
  if (prerequisite && !entry.pass) { const error = new Error(`Prerequisite ${id}: ${JSON.stringify(observed)} != ${JSON.stringify(expected)}`); error.prerequisite = id; throw error; }
  return entry.pass;
};
const expect = (id, observed, expected) => record(id, observed, expected);
const must = (id, observed, expected) => record(id, observed, expected, true);
const root = (slot = 'primary') => page.locator(`[data-fixture-slot="${slot}"] [data-ely-family]`).first();
const panel = (slot = 'primary') => root(slot).locator('[role="menu"]').first();
const trigger = (slot = 'primary') => root(slot).locator('[data-interaction-menu]').first();
const row = (value, slot = 'primary') => root(slot).locator(`[value="${value}"]`).first();
const hidden = target => target.evaluate(node => node.hidden);
const active = target => target.evaluate(node => document.activeElement === node);
const branchPanel = async (value = 'branch', slot = 'primary') => page.locator('#' + await row(value, slot).getAttribute('aria-controls'));
const logs = () => page.evaluate(() => pointerLog);
const clear = () => page.evaluate(() => { pointerLog.actions = []; pointerLog.changes = []; pointerLog.hosts = []; pointerLog.inputs = []; pointerLog.results = []; pointerLog.timeline = []; });
const settle = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
const open = async (slot = 'primary') => {
  await page.mouse.move(2, 2);
  if (slot === 'manual') {
    await root(slot).evaluate(node => node.dispatchEvent(new CustomEvent('ely:context-request', {detail: {number: '101', x: 140.25, y: 100.25}})));
  } else {
    await trigger(slot).focus(); await page.keyboard.press('ArrowDown');
  }
  must('setup.root-panel-open', await hidden(panel(slot)), false);
  must('setup.first-row-focus', await active(row('first', slot)), true);
  await clear();
};
const moveTo = async (value, slot = 'primary', part = 'label') => {
  const target = row(value, slot).locator(part === 'icon' ? '.ely-interaction__menu-icon' : '[data-interaction-menu-label]');
  const box = await target.boundingBox();
  must('input.target-descendant-has-box', Boolean(box && box.width > 0 && box.height > 0), true);
  const point = {x: box.x + box.width / 2, y: box.y + box.height / 2};
  await page.evaluate(() => { pointerLog.inputs = []; });
  // A single segment ends inside the target. Child-exit tests deliberately use
  // the left edge, away from the right-hand submenu's aim corridor.
  await page.mouse.move(point.x, point.y);
  await settle();
  const input = (await logs()).inputs.filter(event => event.type === 'pointermove').at(-1);
  must('input.trusted-pointermove-to-intended-row', Boolean(input && input.isTrusted && input.value === value && input.root === slot && Math.abs(input.x - point.x) < 1 && Math.abs(input.y - point.y) < 1), true);
  must('input.intended-label-or-icon-descendant', part === 'icon' ? input.icon : input.label, true);
  current.pointerTrials ||= [];
  current.pointerTrials.push({value, slot, part, requested: point, observed: input});
  return input;
};
const confirm = async (key, value, slot = 'primary') => {
  await page.keyboard.down(key);
  expect('confirm.keydown-does-not-dispatch', (await logs()).actions, []);
  await page.keyboard.up(key);
  await settle();
  const log = await logs();
  expect('confirm.keyup-dispatches-moved-leaf-once', log.actions.map(event => ({slot: event.slot, value: event.value})), [{slot, value}]);
  expect('confirm.host-receives-moved-leaf-once', log.hosts.map(event => ({slot: event.slot, value: event.value})), [{slot, value}]);
  expect('confirm.native-key-phases-observed', log.inputs.filter(event => ['keydown', 'keyup'].includes(event.type) && event.key === (key === 'Space' ? ' ' : key)).map(event => ({type: event.type, trusted: event.isTrusted})), [{type: 'keydown', trusted: true}, {type: 'keyup', trusted: true}]);
  expect('confirm.root-dismissed', await hidden(panel(slot)), true);
};
const cases = new Map();
const add = (name, run, alias = 'Menu') => cases.set(name, {run, alias});

for (const [value, key, part] of [['plain', 'Enter', 'label'], ['plain', 'Space', 'icon'], ['check', 'Space', 'label'], ['radio-b', 'Enter', 'icon']]) {
  add(`move.${value}.${key}.${part}`, async () => {
    await open();
    const checked = await root().locator('[aria-checked]').evaluateAll(nodes => nodes.map(node => [node.value, node.getAttribute('aria-checked')]));
    await moveTo(value, 'primary', part);
    expect('move.enabled-leaf-owns-keyboard-selection', await active(row(value)), true);
    expect('move.hover-alone-emits-no-action-or-change', [(await logs()).actions, (await logs()).changes, (await logs()).hosts], [[], [], []]);
    expect('move.hover-alone-preserves-check-state', await root().locator('[aria-checked]').evaluateAll(nodes => nodes.map(node => [node.value, node.getAttribute('aria-checked')])), checked);
    await confirm(key, value);
    const log = await logs();
    expect('move.host-observes-dismissal-and-form-values', log.hosts.map(event => ({closed: event.closed, values: event.values, formValues: event.formValues})), [{closed: true, values: [['scope', 'caller-value']], formValues: [['scope', 'caller-value']]}]);
    if (value === 'check') {
      expect('check.moved-leaf-committed', await row('check').getAttribute('aria-checked'), 'true');
      expect('check.commit-before-observer-and-host', [...log.changes, ...log.actions, ...log.hosts].map(event => [event.value, event.checkedState, event.closed]), Array.from({length: 3}, () => ['check', 'true', true]));
      expect('check.change-host-action-observer-order', log.timeline.filter(event => ['changes', 'hosts', 'actions'].includes(event.kind)).map(event => ({kind: event.kind, value: event.value, checked: event.checkedState, closed: event.closed})), ['changes', 'hosts', 'actions'].map(kind => ({kind, value: 'check', checked: 'true', closed: true})));
    }
    if (value === 'radio-b') {
      expect('radio.moved-own-group-selected', await Promise.all(['radio-a', 'radio-b'].map(value => row(value).getAttribute('aria-checked'))), ['false', 'true']);
      expect('radio.movement-preserves-nested-and-peer-groups', await Promise.all([row('child-radio-a'), row('child-radio-b'), row('radio-a', 'peer'), row('radio-b', 'peer')].map(target => target.getAttribute('aria-checked'))), ['true', 'false', 'true', 'false']);
    }
  });
}
add('move.check.host-rejection', async () => {
  await open();
  await page.evaluate(() => { window.rejectPointerAction = true; window.expectedPointerRejection = {id: document.querySelector('[data-fixture-slot="primary"] [data-ely-family]').id, action: 'check-action', message: 'Expected pointer fixture rejection'}; });
  await moveTo('check');
  expect('rejection.moved-check-owns-selection', await active(row('check')), true);
  await confirm('Space', 'check');
  // A failure to reach the intended check is a contract mismatch, never a
  // blanket allowance for another action's error or an unhandled rejection.
  const log = await logs();
  expect('rejection.exact-known-error-once', log.errors.filter(error => error.expected).map(error => ({slot: error.slot, action: error.action, message: error.message})), [{slot: 'primary', action: 'check-action', message: 'Expected pointer fixture rejection'}]);
  expect('rejection.local-check-remains-committed', await row('check').getAttribute('aria-checked'), 'true');
  expect('rejection.menu-remains-dismissed', await hidden(panel()), true);
});
add('move.child-exit', async () => {
  await open(); await row('branch').focus(); await page.keyboard.press('ArrowRight');
  must('child.open-with-valid-selection', [await hidden(await branchPanel()), await active(row('child-first'))], [false, true]);
  // Move first to the far left of the parent panel, then vertically to the
  // sibling. This does not enter the right-hand child's deferred aim corridor.
  const box = await panel().boundingBox(), leaf = await row('plain').boundingBox();
  await page.mouse.move(Math.max(1, box.x - 4), leaf.y + leaf.height / 2);
  await moveTo('plain', 'primary', 'icon');
  expect('child.exit-closes-only-prior-child', [await hidden(await branchPanel()), await hidden(panel())], [true, false]);
  expect('child.visible-sibling-owns-keyboard', await row('plain').evaluate(node => node === document.activeElement && !node.closest('[hidden]')), true);
  await confirm('Enter', 'plain');
});
for (const value of ['off', 'off-branch']) for (const part of ['label', 'icon']) {
  add(`disabled.${value}.${part}`, async () => {
    await open(); await row('branch').focus(); await page.keyboard.press('ArrowRight');
    must('disabled.valid-child-open-before-movement', [await hidden(await branchPanel()), await active(row('child-first'))], [false, true]);
    must('disabled.intended-control-disabled', await row(value).isDisabled(), true);
    await moveTo(value, 'primary', part);
    expect('disabled.movement-preserves-valid-child', await hidden(await branchPanel()), false);
    expect('disabled.movement-preserves-valid-selection', await active(row('child-first')), true);
    expect('disabled.root-stays-open', await hidden(panel()), false);
    expect('disabled.no-callback-or-state-change', [(await logs()).actions, (await logs()).changes, (await logs()).hosts], [[], [], []]);
    expect('disabled.submenu-stays-collapsed', await row('off-branch').getAttribute('aria-expanded'), 'false');
    await confirm('Enter', 'child-first');
  });
}
add('move.child-depth', async () => {
  await open(); await row('branch').focus(); await page.keyboard.press('ArrowRight');
  await moveTo('child-plain');
  expect('depth.child-leaf-owns-selection', await active(row('child-plain')), true);
  expect('depth.parent-and-child-stay-open', [await hidden(panel()), await hidden(await branchPanel())], [false, false]);
  await confirm('Enter', 'child-plain');
});
add('move.fractional-zero-delta', async () => {
  await open();
  const box = await row('plain').locator('[data-interaction-menu-label]').boundingBox();
  must('fractional.target-box', Boolean(box && box.width > 4 && box.height > 4), true);
  const start = {x: Math.floor(box.x + box.width / 2) + 0.125, y: Math.floor(box.y + box.height / 2) + 0.125};
  await page.mouse.move(start.x, start.y); await page.keyboard.press('Home');
  must('fractional.keyboard-retakes-first', await active(row('first')), true);
  await page.evaluate(() => { pointerLog.inputs = []; });
  await page.mouse.move(start.x + 0.125, start.y + 0.125); await settle();
  const received = (await logs()).inputs.filter(event => event.type === 'pointermove').at(-1);
  current.fractionalTrial = {start, requested: {x: start.x + 0.125, y: start.y + 0.125}, received};
  must('fractional.trusted-subpixel-input-with-zero-reported-delta', Boolean(received && received.isTrusted && received.value === 'plain' && received.x > start.x && received.y > start.y && received.movementX === 0 && received.movementY === 0), true);
  expect('fractional.real-movement-retakes-selection', await active(row('plain')), true);
  await confirm('Enter', 'plain');
});
add('stationary.typed-boundary', async () => {
  await open(); await row('check').focus(); await page.keyboard.down('Space');
  // Start the exact causal prefix after the common fixture/open prerequisites.
  current.controlPrefixStart = current.oracles.length;
  expect('stationary.native-keydown-no-action', (await logs()).actions, []);
  const received = await row('branch').evaluate(node => {
    let observed;
    const listener = event => { observed = {constructor: event.constructor.name, isTrusted: event.isTrusted, type: event.type, movementX: event.movementX, movementY: event.movementY}; };
    node.addEventListener('pointerover', listener, {capture: true, once: true});
    node.querySelector('[data-interaction-menu-label]').dispatchEvent(new PointerEvent('pointerover', {bubbles: true, composed: true, cancelable: true, pointerType: 'mouse', pointerId: 1, isPrimary: true, clientX: 2, clientY: 2, movementX: 0, movementY: 0, buttons: 0}));
    return observed;
  });
  expect('stationary.injected-boundary-is-labelled', received, {constructor: 'PointerEvent', isTrusted: false, type: 'pointerover', movementX: 0, movementY: 0});
  expect('stationary.boundary-does-not-open-child', await hidden(await branchPanel()), true);
  expect('stationary.boundary-preserves-check-selection', await active(row('check')), true);
  await page.keyboard.up('Space'); await settle();
  expect('stationary.native-keyup-toggles-check-once', [(await logs()).actions.map(event => event.value), await row('check').getAttribute('aria-checked')], [['check'], 'true']);
});
add('stationary.native-held-key', async () => {
  for (let trial = 0; trial < 4; trial++) {
    await open();
    const box = await row('branch').locator('[data-interaction-menu-label]').boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await settle();
    must('stationary.native-hover-opens-child', await hidden(await branchPanel()), false);
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
    await trigger().focus(); await page.keyboard.press('ArrowDown'); await row('check').focus(); await clear();
    await page.keyboard.down('Space'); await settle();
    expect('stationary.held-key-keeps-check-focus', await active(row('check')), true);
    expect('stationary.held-key-does-not-reopen-child', await hidden(await branchPanel()), true);
    await page.keyboard.up('Space'); await settle();
    expect('stationary.native-held-key-once', (await logs()).actions.map(event => event.value), ['check']);
    current.nativeStationaryTrials ||= []; current.nativeStationaryTrials.push({trial, inputs: (await logs()).inputs});
  }
});
add('ownership.nested-family', async () => {
  await open();
  // Caller composition moves an intact independently production-rendered root.
  // No control markup, runtime handler, role or menu state is fabricated.
  await panel().evaluate(node => node.append(document.getElementById('fixture-slot-nested')));
  await trigger('nested').focus(); await page.keyboard.press('ArrowDown'); await clear();
  const parentBefore = await root().evaluate(node => ({open: !node.querySelector('[role="menu"]').hidden, expanded: [...node.querySelectorAll('[data-interaction-menu]')].filter(n => n.closest('[data-ely-family]') === node).map(n => n.getAttribute('aria-expanded')), checked: [...node.querySelectorAll('[aria-checked]')].filter(n => n.closest('[data-ely-family]') === node).map(n => n.getAttribute('aria-checked'))}));
  await moveTo('plain', 'nested');
  expect('ownership.inner-leaf-owns-selection', await active(row('plain', 'nested')), true);
  expect('ownership.ancestor-state-unchanged', await root().evaluate(node => ({open: !node.querySelector('[role="menu"]').hidden, expanded: [...node.querySelectorAll('[data-interaction-menu]')].filter(n => n.closest('[data-ely-family]') === node).map(n => n.getAttribute('aria-expanded')), checked: [...node.querySelectorAll('[aria-checked]')].filter(n => n.closest('[data-ely-family]') === node).map(n => n.getAttribute('aria-checked'))})), parentBefore);
  expect('ownership.peer-unchanged', [await hidden(panel('peer')), await row('check', 'peer').getAttribute('aria-checked')], [true, 'false']);
  await confirm('Enter', 'plain', 'nested');
  expect('ownership.no-parent-host-callback', (await logs()).hosts.map(event => event.slot), ['nested']);
});
for (const slot of ['empty', 'alloff']) add(`inert.${slot}-panel`, async () => {
  await page.mouse.move(2, 2); await trigger(slot).focus(); await page.keyboard.press('ArrowDown'); await clear();
  must('inert.panel-open-and-focused', [await hidden(panel(slot)), await active(panel(slot))], [false, true]);
  if (slot === 'alloff') await moveTo('off', slot);
  else { const box = await panel(slot).boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); }
  expect('inert.empty-or-disabled-panel-keeps-focus', await active(panel(slot)), true);
  for (const key of ['ArrowDown', 'Home', 'Enter', 'Space']) await page.keyboard.press(key);
  expect('inert.panel-movement-and-keys-emit-nothing', [(await logs()).actions, (await logs()).changes, (await logs()).hosts], [[], [], []]);
  expect('inert.panel-remains-open', await hidden(panel(slot)), false);
});
for (const value of ['empty-child', 'alloff-child']) add(`inert.${value}-panel`, async () => {
  await open(); await row(value).focus(); await page.keyboard.press('ArrowRight');
  const child = await branchPanel(value);
  must('inert.child-panel-open-and-focused', [await hidden(child), await active(child)], [false, true]);
  if (value === 'alloff-child') await moveTo('alloff-child-off');
  else { const box = await child.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); }
  expect('inert.child-panel-keeps-fallback-focus', await active(child), true);
  for (const key of ['ArrowDown', 'Home', 'Enter', 'Space']) await page.keyboard.press(key);
  expect('inert.child-panel-emits-nothing', [(await logs()).actions, (await logs()).changes, (await logs()).hosts], [[], [], []]);
  await page.keyboard.press('ArrowLeft');
  expect('inert.child-panel-returns-to-parent-trigger', [await hidden(child), await active(row(value)), await hidden(panel())], [true, true, false]);
});
add('inert.hidden-disabled-detached-leaves', async () => {
  await page.locator('#before').focus(); await clear();
  const before = await page.evaluate(() => document.activeElement.id);
  current.syntheticInertTrial = await page.evaluate(() => {
    const targets = ['primary', 'disabled', 'peer'].map(id => document.querySelector(`[data-fixture-slot="${id}"] [value="plain"]`));
    document.querySelector('[data-fixture-slot="peer"] [data-ely-family]').remove();
    return targets.map(node => { node.querySelector('[data-interaction-menu-label]').dispatchEvent(new PointerEvent('pointermove', {bubbles: true, clientX: 20.25, clientY: 20.25})); return {connected: node.isConnected, hidden: Boolean(node.closest('[hidden]')), disabled: node.disabled}; });
  });
  expect('inert.hidden-disabled-detached-movement-no-focus', await page.evaluate(() => document.activeElement.id), before);
  expect('inert.hidden-disabled-detached-movement-no-events', [(await logs()).actions, (await logs()).changes, (await logs()).hosts], [[], [], []]);
  expect('inert.disabled-root-stays-closed', await hidden(panel('disabled')), true);
});
add('regression.radio-scope', async () => {
  await open(); await row('radio-b').focus(); await page.keyboard.press('Enter'); await settle();
  current.controlPrefixStart = current.oracles.length;
  expect('radio.keyboard-chosen-target', (await logs()).actions.map(event => event.value), ['radio-b']);
  expect('radio.own-group-committed', await Promise.all(['radio-a', 'radio-b'].map(value => row(value).getAttribute('aria-checked'))), ['false', 'true']);
  expect('radio.nested-group-unchanged', await Promise.all(['child-radio-a', 'child-radio-b'].map(value => row(value).getAttribute('aria-checked'))), ['true', 'false']);
  expect('radio.peer-group-unchanged', await Promise.all(['radio-a', 'radio-b'].map(value => row(value, 'peer').getAttribute('aria-checked'))), ['true', 'false']);
});
for (const slot of ['automatic', 'manual']) add(`owners.${slot}`, async () => {
  await open(slot); await moveTo('plain', slot);
  expect('owners.moved-leaf-selection', await active(row('plain', slot)), true);
  await confirm('Enter', 'plain', slot);
  await clear();
  if (slot === 'manual') await root(slot).evaluate(node => node.dispatchEvent(new CustomEvent('ely:context-request', {detail: {number: '102', x: 180.25, y: 120.25}})));
  else { await trigger(slot).focus(); await page.keyboard.press('ArrowDown'); }
  expect('owners.reopen-resets-valid-selection', [await hidden(panel(slot)), await active(row('first', slot))], [false, true]);
});
for (const style of ['innerHTML', 'outerHTML']) add(`lifecycle.${style}`, async () => {
  await open(); await row('branch').focus(); await page.keyboard.press('ArrowRight');
  must('lifecycle.valid-old-child-open-before-swap', [await hidden(await branchPanel()), await active(row('child-first'))], [false, true]);
  await root().evaluate(node => {
    window.retainedPointer = {root: node, panel: node.querySelector('[role="menu"]'), branch: node.querySelector('[value="branch"]'), check: node.querySelector('[value="check"]'), checked: node.querySelector('[value="check"]').getAttribute('aria-checked'), cleanups: 0};
    node.addEventListener('ely:cleanup', () => retainedPointer.cleanups++, {once: true});
  });
  const requestStart = report.requests.length, targetID = await root().getAttribute('id');
  await root().evaluate(async (node, {style, surface}) => htmx.ajax('GET', '/fragment?' + new URLSearchParams({surface, alias: 'Menu'}), {source: '#swap-source', target: node, select: style === 'innerHTML' ? '[data-ely-family] > *' : '[data-ely-family]', ...(style === 'outerHTML' ? {swap: style} : {})}), {style, surface: currentSurface});
  await page.waitForFunction(() => document.querySelector('[data-fixture-slot="primary"] [data-ely-family]')?.dataset.elyReady === 'true');
  current.controlPrefixStart = current.oracles.length;
  expect('lifecycle.cleanup-once', await page.evaluate(() => retainedPointer.cleanups), 1);
  expect('lifecycle.root-identity', await page.evaluate(() => retainedPointer.root === document.querySelector('[data-fixture-slot="primary"] [data-ely-family]')), style === 'innerHTML');
  expect('lifecycle.real-network-request', report.requests.slice(requestStart).filter(request => request.path === '/fragment').map(request => ({method: request.method, htmx: request.htmx, target: request.target, status: request.status})), [{method: 'GET', htmx: 'true', target: targetID, status: 200}]);
  expect('lifecycle.old-panel-hidden', await page.evaluate(() => retainedPointer.panel.hidden), true);
  await root().evaluate(node => bindPointerRoot(node)); await clear();
  await page.evaluate(() => {
    retainedPointer.check.click();
    retainedPointer.check.dispatchEvent(new KeyboardEvent('keydown', {key: ' ', bubbles: true}));
    retainedPointer.check.dispatchEvent(new KeyboardEvent('keyup', {key: ' ', bubbles: true}));
  });
  expect('lifecycle.old-key-click-inert', [(await logs()).actions, (await logs()).changes, await page.evaluate(() => retainedPointer.check.getAttribute('aria-checked'))], [[], [], 'false']);
  await page.evaluate(() => retainedPointer.branch.querySelector('[data-interaction-menu-label]').dispatchEvent(new PointerEvent('pointermove', {bubbles: true, clientX: 100.25, clientY: 100.25})));
  expect('lifecycle.disposed-movement-keeps-branch-closed', await page.evaluate(() => retainedPointer.branch.getAttribute('aria-expanded')), 'false');
  expect('lifecycle.disposed-movement-emits-nothing', [(await logs()).actions, (await logs()).changes], [[], []]);
  await open(); await moveTo('plain');
  expect('lifecycle.fresh-movement-owns-selection', await active(row('plain')), true);
  await confirm('Enter', 'plain');
});
for (const alias of aliases) add(`alias.${alias}.move-and-confirm`, async () => {
  await open();
  const value = alias === 'CheckboxMenuItem' ? 'check' : alias === 'RadioMenuItem' ? 'radio-b' : 'plain';
  await moveTo(value);
  expect('alias.enabled-leaf-owns-selection', await active(row(value)), true);
  expect('alias.hover-does-not-notify', [(await logs()).actions, (await logs()).changes], [[], []]);
  await confirm(value === 'check' ? 'Space' : 'Enter', value);
}, alias);

try {
  assert(surfaces.every(surface => ['qualified', 'chapter', 'sdui'].includes(surface)), 'unknown renderer surface');
  assert(!selectedCase || cases.has(selectedCase), 'unknown selected case');
  assert(!mutation || Object.hasOwn(menuPointerControls, mutation), 'unknown mutation');
  const control = menuPointerControls[mutation];
  assert(!control || selectedSurface !== 'all' && (!selectedCase || selectedCase === control.check), 'mutants require one explicit renderer and their exact designated case');
  report.toolchain = {node: process.version, playwright: JSON.parse(await readFile(join(base, 'node_modules/playwright/package.json'), 'utf8')).version, go: execFileSync(process.env.GO || 'go', ['version'], {cwd: base, encoding: 'utf8'}).trim()};
  report.revision = execFileSync('git', ['rev-parse', 'HEAD'], {cwd: base, encoding: 'utf8'}).trim();
  report.tree = execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {cwd: base, encoding: 'utf8'}).trim();
  report.dirty = execFileSync('git', ['status', '--porcelain'], {cwd: base, encoding: 'utf8'}).trim();
  report.workingTreePatchSHA256 = sha(execFileSync('git', ['diff', '--binary', 'HEAD'], {cwd: base}));
  for (const path of ['./ui/gohtmx/tests/browser/menu-pointer-selection-browser-test.mjs', './ui/gohtmx/tests/browser/menu-pointer-selection-controls.mjs', './ui/gohtmx/tests/browser/context-owner-assets.mjs', ...Object.values(fixturePaths).map(path => path + '/main.go'), './ui/gohtmx/tests/fixtures/pointerfixture/fixture.go', './ui/gohtmx/tests/fixtures/pointerfixture/verify.go', './ui/gohtmx/templates/ely-api-interaction.html', './ui/gohtmx/component.go', './ui/gohtmx/menu.go', './adapters/gohtmx/catalogue_manifest.json.gz', './adapters/gohtmx/render.go']) report.fixtureSources[path] = sha(await readFile(join(base, path)));
  const deps = execFileSync(process.env.GO || 'go', ['list', '-deps', fixturePaths.standalone], {cwd: base, encoding: 'utf8'}).trim().split('\n');
  assert(!deps.some(dep => /github\.com\/mrchypark\/elysdui\/(sdui|adapters)(\/|$)/.test(dep)), 'standalone fixture must have no SDUI/adapter dependency');
  report.standaloneDependencyProof = {command: ['go', 'list', '-deps', fixturePaths.standalone], SHA256: sha(deps.join('\n')), forbiddenImports: []};
  temp = await mkdtemp(join(tmpdir(), 'ely-menu-pointer-'));
  const binaries = {};
  for (const kind of ['standalone', 'sdui']) { binaries[kind] = join(temp, kind); execFileSync(process.env.GO || 'go', ['build', '-o', binaries[kind], fixturePaths[kind]], {cwd: base, stdio: 'pipe'}); }
  const fixtureCache = new Map();
  const generate = (surface, alias, full) => {
    const kind = surface === 'sdui' ? 'sdui' : 'standalone', args = [...(full ? ['-full'] : []), '-id=primary', '-alias=' + alias, ...(kind === 'standalone' ? ['-mode=' + surface] : [])];
    const key = surface + ':' + alias + ':' + (full ? 'document' : 'fragment');
    if (!fixtureCache.has(key)) {
      const body = execFileSync(binaries[kind], args, {cwd: base, encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
      fixtureCache.set(key, body);
      report.fixtures[key] = {html: `menu-pointer-fixtures/${sha(body)}.html`, command: [binaries[kind], ...args], sourceSHA256: sha(body), servedSHA256: sha(body), bytes: Buffer.byteLength(body), productionRenderer: kind === 'standalone' ? 'ui.RenderComponent ' + surface : 'CatalogueRegistry + Decode + Compile + Plan.Render'};
    }
    return fixtureCache.get(key);
  };
  report.fixtureBodies = fixtureCache;
  const assets = await loadContextOwnerAssets(base);
  // Icons are selected by production runtime CSS variables, not literal CSS
  // url() declarations. Serve the fixture's exact bundled icon bytes too.
  const iconPath = '/assets/ely/icons/circle.svg', iconBody = await readFile(join(base, 'ui/gohtmx', iconPath));
  assets.set(iconPath, {body: iconBody, contentType: 'image/svg+xml', sourceSHA256: sha(iconBody), servedSHA256: sha(iconBody), bytes: iconBody.length, referencedBy: new Set(['production-rendered data-interaction-icon=circle'])});
  if (control) {
    const asset = assets.get(control.file);
    asset.body = Buffer.from(mutateMenuPointerSource(asset.body.toString('utf8'), control, mutation));
    asset.servedSHA256 = sha(asset.body); asset.bytes = asset.body.length;
    report.control = {...control, anchorCount: 1};
  }
  for (const [path, {body, referencedBy, ...metadata}] of assets) report.assets[path] = {...metadata, referencedBy: [...referencedBy]};
  assert.deepEqual(Object.entries(report.assets).filter(([, asset]) => asset.sourceSHA256 !== asset.servedSHA256).map(([path]) => path), control ? [control.file] : [], 'only one designated production asset may differ');
  report.stage = 'server-start';
  server = createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost'), surface = url.searchParams.get('surface') || surfaces[0], alias = url.searchParams.get('alias') || 'Menu';
      const entry = {method: req.method, path: url.pathname, url: req.url, htmx: req.headers['hx-request'] || null, target: req.headers['hx-target'] || null}; report.requests.push(entry);
      const send = (body, type) => { entry.status = 200; entry.responseSHA256 = sha(body); entry.responseBytes = Buffer.byteLength(body); res.setHeader('content-type', type).end(body); };
      if (url.pathname === '/' || url.pathname === '/fragment') return send(generate(surface, alias, url.pathname === '/'), 'text/html; charset=utf-8');
      if (!assets.has(url.pathname)) { entry.status = 404; return res.writeHead(404).end(); }
      const asset = assets.get(url.pathname); send(asset.body, asset.contentType);
    } catch (error) { report.serverErrors.push(String(error)); res.writeHead(500).end(String(error)); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  // Verify the HTTP transport independently of the server's in-memory hashes.
  for (const [path, asset] of assets) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}${path}`);
    const received = Buffer.from(await response.arrayBuffer());
    const proof = {path, status: response.status, expectedSHA256: asset.servedSHA256, receivedSHA256: sha(received), bytes: received.length};
    report.httpAssetProof.push(proof);
    assert.equal(response.status, 200, path + ': HTTP asset request must succeed');
    assert.equal(proof.receivedSHA256, proof.expectedSHA256, path + ': actual HTTP bytes must match designated production asset');
  }
  report.stage = 'browser-launch';
  browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  report.browserVersion = browser.version();
  page = await browser.newPage({viewport: {width: 1440, height: 1100}}); page.setDefaultTimeout(10000);
  page.on('response', response => {
    const surface = currentSurface, check = current?.name, url = new URL(response.url());
    if (url.origin !== `http://127.0.0.1:${server.address().port}`) return;
    const task = (async () => {
      try {
        const expected = assets.get(url.pathname)?.servedSHA256 || report.fixtures[`${url.searchParams.get('surface')}:${url.searchParams.get('alias')}:${url.pathname === '/' ? 'document' : 'fragment'}`]?.servedSHA256;
        if (!expected) throw new Error('Unexpected browser response: ' + response.url());
        const received = await response.body();
        const proof = {surface, check, path: url.pathname, url: response.url(), status: response.status(), expectedSHA256: expected, receivedSHA256: sha(received), bytes: received.length};
        report.browserResponses.push(proof);
        if (proof.status !== 200 || proof.receivedSHA256 !== proof.expectedSHA256) report.transportErrors.push(proof);
      } catch (error) { report.transportErrors.push({surface, check, url: response.url(), error: String(error)}); }
    })();
    responseTasks.push(task);
  });
  page.on('pageerror', error => report.pageErrors.push({surface: currentSurface, check: current?.name, message: error.message}));
  page.on('console', message => { if (message.type() === 'error') report.consoleErrors.push({surface: currentSurface, check: current?.name, message: message.text()}); });
  page.on('requestfailed', request => report.requestFailures.push({surface: currentSurface, check: current?.name, url: request.url(), error: request.failure()?.errorText}));
  await page.addInitScript(() => {
    window.pointerLog = {actions: [], changes: [], hosts: [], errors: [], inputs: [], results: [], lifecycle: [], timeline: []};
    window.rejectPointerAction = false; window.expectedPointerRejection = null;
    window.pointerSlot = node => node?.closest?.('[data-fixture-slot]')?.dataset.fixtureSlot;
    window.pointerSnapshot = (node, value) => {
      const owned = selector => [...node.querySelectorAll(selector)].filter(item => item.closest('[data-ely-family]') === node);
      return {closed: owned('[role="menu"]').every(panel => panel.hidden), checkedState: owned('[value]').find(item => item.value === value)?.getAttribute('aria-checked') || null, focus: document.activeElement?.value || document.activeElement?.id};
    };
    for (const type of ['error', 'unhandledrejection']) window.addEventListener(type, event => pointerLog.errors.push({type, message: event.message || String(event.reason), expected: false}));
    for (const type of ['ely:action', 'ely:change', 'ely:error', 'ely:result']) document.addEventListener(type, event => {
      const d = event.detail || {}, node = event.target;
      if (type === 'ely:error') {
        const expected = window.expectedPointerRejection;
        const matches = Boolean(expected && node.id === expected.id && d.id === expected.id && d.action === expected.action && d.error?.message === expected.message);
        if (matches) window.expectedPointerRejection = null;
        pointerLog.errors.push({type, id: d.id, slot: pointerSlot(node), action: d.action, message: d.error?.message, expected: matches});
      } else {
        const key = type === 'ely:action' ? 'actions' : type === 'ely:change' ? 'changes' : 'results';
        const entry = {id: d.id, slot: pointerSlot(node), value: d.value, action: d.action, checked: d.checked, ...pointerSnapshot(node, d.value)};
        pointerLog[key].push(entry); pointerLog.timeline.push({kind: key, ...entry});
      }
    });
    for (const type of ['pointermove', 'pointerover', 'pointerdown', 'pointerup', 'keydown', 'keyup', 'focusin', 'focusout']) document.addEventListener(type, event => {
      const button = event.target.closest?.('button'), owner = event.target.closest?.('[data-ely-family]');
      pointerLog.inputs.push({type, isTrusted: event.isTrusted, constructor: event.constructor.name, key: event.key, root: pointerSlot(owner), ownerID: owner?.id, value: button?.value, targetTag: event.target.tagName, label: event.target.hasAttribute?.('data-interaction-menu-label'), icon: Boolean(event.target.closest?.('.ely-interaction__menu-icon')), x: event.clientX, y: event.clientY, movementX: event.movementX, movementY: event.movementY, active: document.activeElement?.value || document.activeElement?.id});
    }, true);
    for (const type of ['htmx:before:swap', 'htmx:after:swap', 'htmx:finally:swap']) document.addEventListener(type, event => pointerLog.lifecycle.push({type, tasks: (event.detail?.tasks || []).map(task => ({target: typeof task.target === 'string' ? task.target : task.target?.id, swap: task.swapSpec?.style || task.swapSpec}))}));
  });
  const ready = async alias => {
    await page.goto(`http://127.0.0.1:${server.address().port}/?` + new URLSearchParams({surface: currentSurface, alias}));
    await page.waitForFunction(() => document.querySelectorAll('[data-ely-family]').length === 8 && [...document.querySelectorAll('[data-ely-family]')].every(node => ['true', 'error'].includes(node.dataset.elyReady)));
    await page.evaluate(() => document.fonts.ready);
    await Promise.all(responseTasks);
    must('fixture.browser-received-exact-runtime', report.browserResponses.some(proof => proof.surface === currentSurface && proof.check === current.name && proof.path === '/assets/ely-api-interaction.js' && proof.status === 200 && proof.receivedSHA256 === report.assets['/assets/ely-api-interaction.js'].servedSHA256), true);
    must('fixture.no-transport-byte-mismatch', report.transportErrors, []);
    must('fixture.production-roots-ready', await page.locator('[data-ely-family]').evaluateAll(nodes => nodes.map(node => node.dataset.elyReady)), Array(8).fill('true'));
    must('fixture.production-fonts-ready', await page.evaluate(() => document.fonts.status), 'loaded');
    must('fixture.unique-ids-and-escaped-label', await page.evaluate(() => { const ids = [...document.querySelectorAll('[id]')].map(node => node.id); return {unique: new Set(ids).size === ids.length, unsafe: document.querySelectorAll('safe').length}; }), {unique: true, unsafe: 0});
    must('fixture.real-sdui-screen-count', await page.locator('[data-sdui-screen]').count(), currentSurface === 'sdui' ? 8 : 0);
    must('fixture.leaf-roles', await Promise.all(['plain', 'check', 'radio-b'].map(value => row(value).getAttribute('role'))), [['CheckboxMenuItem', 'RadioMenuItem'].includes(alias) ? 'menuitemcheckbox' : 'menuitem', 'menuitemcheckbox', 'menuitemradio']);
    must('fixture.disabled-and-submenu-identities', await Promise.all(['off', 'off-branch', 'branch', 'empty-child', 'alloff-child'].map(value => row(value).evaluate(node => ({value: node.value, disabled: node.disabled, submenu: node.hasAttribute('data-interaction-menu')})))), [{value: 'off', disabled: true, submenu: false}, {value: 'off-branch', disabled: true, submenu: true}, {value: 'branch', disabled: false, submenu: true}, {value: 'empty-child', disabled: false, submenu: true}, {value: 'alloff-child', disabled: false, submenu: true}]);
    await page.evaluate(async () => {
      const {mount} = await import('/assets/ely-api.js');
      window.bindPointerRoot = node => mount(node, {onAction(detail, current) {
        const entry = {id: detail.id, slot: pointerSlot(current), value: detail.value, action: detail.action, values: detail.values, formValues: detail.formData ? [...detail.formData] : null, ...pointerSnapshot(current, detail.value)};
        pointerLog.hosts.push(entry); pointerLog.timeline.push({kind: 'hosts', ...entry});
        if (window.rejectPointerAction && pointerSlot(current) === 'primary' && detail.action === 'check-action') return Promise.reject(new Error('Expected pointer fixture rejection'));
        return {ok: true};
      }});
      document.querySelectorAll('[data-ely-family]').forEach(bindPointerRoot);
    });
    must('fixture.no-startup-errors', (await logs()).errors, []);
  };
  const requestedCases = control ? [control.check] : selectedCase ? [selectedCase] : [...cases.keys()];
  report.expectedChecks = surfaces.flatMap(surface => requestedCases.map(name => ({surface, name, alias: cases.get(name).alias})));
  for (currentSurface of surfaces) for (const name of requestedCases) {
    const spec = cases.get(name); currentAlias = spec.alias;
    current = {surface: currentSurface, name, alias: currentAlias, status: 'running', oracles: []}; report.checks.push(current); report.stage = name;
    try {
      await ready(currentAlias); await spec.run();
    } catch (error) {
      current.error = {message: error.message, stack: error.stack, prerequisite: error.prerequisite || null};
    } finally {
      if (page && !page.isClosed()) {
        try {
          current.trace = await page.evaluate(() => ({...pointerLog, active: {id: document.activeElement?.id, value: document.activeElement?.value, hidden: Boolean(document.activeElement?.closest('[hidden]'))}, openPanels: [...document.querySelectorAll('[role="menu"]')].filter(node => !node.hidden).map(node => ({id: node.id, root: node.closest('[data-ely-family]')?.id}))}));
          report.runtimeErrors.push(...current.trace.errors.filter(error => !error.expected).map(error => ({surface: currentSurface, check: name, ...error})));
        } catch (error) { current.traceError = String(error); }
      }
      current.status = current.error || current.traceError || current.oracles.some(oracle => !oracle.pass) || current.trace?.errors.some(error => !error.expected) ? 'failed' : 'passed';
      console.log(`${currentSurface}/${name}: ${current.status}`);
      for (const failure of current.oracles.filter(oracle => !oracle.pass)) console.error(`${failure.id}: observed=${JSON.stringify(failure.observed)} expected=${JSON.stringify(failure.expected)}`);
    }
  }
  assert.deepEqual(report.checks.map(({surface, name, alias}) => ({surface, name, alias})), report.expectedChecks, 'every intended isolated case must execute');
  await Promise.all(responseTasks);
  const incidental = ['pageErrors', 'consoleErrors', 'requestFailures', 'serverErrors', 'runtimeErrors', 'transportErrors'].some(key => report[key].length > 0);
  if (control) {
    const trial = report.checks[0], failures = trial.oracles.filter(oracle => !oracle.pass), designated = failures[0];
    const prefix = trial.oracles.slice(trial.controlPrefixStart, trial.oracles.indexOf(designated)).map(oracle => oracle.id);
    const kill = !incidental && !trial.error && !trial.traceError && designated?.id === control.oracle && same(designated.observed, control.observed) && same(designated.expected, control.expected) && same(prefix, control.prior) && trial.oracles.slice(0, trial.oracles.indexOf(designated)).every(oracle => oracle.pass);
    report.status = kill ? 'mutation-killed' : 'failed';
    report.causalControl = {kill, designated, observedPrefix: prefix, requiredPrefix: control.prior};
  } else report.status = !incidental && report.checks.every(check => check.status === 'passed') ? 'passed' : 'failed';
  if (report.status === 'failed') process.exitCode = 1;
} catch (error) {
  report.status = 'failed'; report.startupError = {message: error.message, stack: error.stack}; process.exitCode = 1;
} finally {
  await Promise.all(responseTasks);
  const directory = join(base, 'test-results/contracts'); await mkdir(directory, {recursive: true});
  const suffix = [selectedSurface, selectedCase, mutation].filter(Boolean).join('-').replaceAll(/[^A-Za-z0-9_.-]/g, '_');
  report.evidenceFile = `menu-pointer-selection-${suffix}.json`;
  await mkdir(join(directory, 'menu-pointer-fixtures'), {recursive: true});
  for (const body of report.fixtureBodies?.values() || []) await writeFile(join(directory, `menu-pointer-fixtures/${sha(body)}.html`), body);
  delete report.fixtureBodies;
  await writeFile(join(directory, report.evidenceFile), JSON.stringify(report, null, 2));
  await browser?.close(); if (server?.listening) await new Promise(resolve => server.close(resolve)); if (temp) await rm(temp, {recursive: true, force: true});
  console.log(`${report.suite}: ${report.status}; ${report.evidenceFile}`);
}
