import assert from 'node:assert/strict';
import {readFileSync, mkdirSync, writeFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {runInNewContext} from 'node:vm';
import {parse} from 'acorn';

// No Playwright import, browser launch, network listener, or rendered-DOM
// substitution. Read the browser harness as source so the executable controls
// cannot drift into separate test-only mutation definitions.
const harness = readFileSync(new URL('../browser/menu-empty-submenu-browser-test.mjs', import.meta.url), 'utf8');
const runtime = readFileSync(new URL('../../../../ui/gohtmx/assets/ely-api-interaction.js', import.meta.url), 'utf8');
const template = readFileSync(new URL('../../../../ui/gohtmx/templates/ely-api-interaction.html', import.meta.url), 'utf8');
const tree = parse(harness, {ecmaVersion: 'latest', sourceType: 'module'});
const declarations = new Map();
const walkAST = node => {
  if (!node || typeof node !== 'object') return;
  if (node.type === 'VariableDeclarator' && node.id.type === 'Identifier') declarations.set(node.id.name, node.init);
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(walkAST); else if (value && typeof value === 'object') walkAST(value);
};
walkAST(tree);
const expression = name => {
  const node = declarations.get(name); assert(node, `browser declaration ${name} must exist`);
  return harness.slice(node.start, node.end);
};
const controls = JSON.parse(JSON.stringify(runInNewContext(`(${expression('mutations')})`, {interaction: '/assets/ely-api-interaction.js', templatePath: 'templates/ely-api-interaction.html'})));
const names = JSON.parse(JSON.stringify(runInNewContext(`(${expression('names')})`)));
const sha = source => createHash('sha256').update(source).digest('hex');
const report = {suite: 'menu-empty-submenu-oracles', revision: execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim(), dirty: !!execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim(), status: 'running', checks: [], controls: {}, runtimeSHA256: sha(runtime), templateSHA256: sha(template), harnessSHA256: sha(harness)};
const slice = (source, start, end) => {
  assert.equal(source.split(start).length - 1, 1, `production start boundary must be unique: ${start}`);
  const a = source.indexOf(start), b = source.indexOf(end, a);
  assert(b > a, `production end boundary must exist: ${end}`);
  return source.slice(a, b);
};

function fixture(source) {
  const document = {activeElement: null, body: {}, removeEventListener() {}};
  const panels = new Map(), triggers = new Map(), removals = [];
  const root = {
    dataset: {}, isConnected: true, contains: node => !!node?.isConnected,
    querySelector: selector => selector.startsWith('#') ? panels.get(selector.slice(1)) : triggers.get(selector.match(/="([^"]+)"/)[1]),
    querySelectorAll: () => [...triggers.values()],
    removeEventListener: (type, listener) => removals.push({type, listener}),
  };
  const add = (id, parent) => {
    const button = {
      isConnected: true, disabled: false, value: id, dataset: {interactionMenu: id}, attributes: {},
      setAttribute(name, value) { this.attributes[name] = value; },
      getAttribute(name) { return this.attributes[name] ?? null; },
      closest(selector) { if (selector === '[role="menu"]') return parent || null; return null; },
      focus() { document.activeElement = this; },
    };
    const panel = {
      id, isConnected: true, hidden: true, children: [], style: {},
      parentElement: {matches: () => !!parent},
      hasAttribute: name => name === 'tabindex', getAttribute: name => name === 'role' ? 'menu' : null,
      closest: () => null, matches: () => false, querySelector: () => null,
      querySelectorAll(selector) { return selector === '[data-interaction-menu]' ? this.children : this.children.filter(node => !node.disabled); },
      contains(node) { return this === node || this.children.includes(node); },
      focus() { document.activeElement = this; },
      getBoundingClientRect: () => ({width: 200, height: 8, right: 220, bottom: 48}),
    };
    panels.set(id, panel); triggers.set(id, button); if (parent) parent.children.push(button);
    return {button, panel};
  };
  const parent = add('root'), child = add('empty', parent.panel);
  const context = {document, root, window: {innerWidth: 1000, innerHeight: 800}, CSS: {escape: value => value}, placeMenu() { throw Error('unexpected top-level placement'); }, placeOverlay() { throw Error('unexpected overlay placement'); }};
  const menu = runInNewContext(slice(source, 'const menuReturnFocus =', '// Menu state and dismissal') + '\nmenu;', context);
  menu(root, 'root', true); menu(root, 'empty', true);
  return {document, root, parent, child, menu, context, removals};
}

function exercise(source, name) {
  const f = fixture(source);
  assert.equal(f.parent.panel.hidden, false, 'prerequisite root must be open');
  assert.equal(f.child.panel.hidden, false, 'prerequisite empty child must be open');
  assert.equal(f.child.button.attributes['aria-expanded'], 'true');
  if (name === 'focus-fallback') return f.document.activeElement === f.child.panel;
  assert.equal(f.document.activeElement, f.child.panel, 'unrelated fallback must work before each designated mutation');
  if (name === 'focus-return') {
    const handler = runInNewContext('(event) => {' + slice(source, '    const menuTrigger = closest(root, event.target,', '    const menubar = closest(root, event.target,') + '}', {
      root: f.root, menu: f.menu,
      closest: (_root, target, selector) => selector.includes('> [role="menu"]') ? target : null,
    });
    let prevented = false;
    handler({key: 'ArrowLeft', target: f.child.panel, preventDefault() { prevented = true; }});
    assert.equal(prevented, true); assert.equal(f.child.panel.hidden, true); assert.equal(f.child.button.attributes['aria-expanded'], 'false');
    assert.equal(f.parent.panel.hidden, false);
    return f.document.activeElement === f.child.button;
  }
  if (name === 'panel-navigation' || name === 'panel-confirm') {
    const handlers = runInNewContext(slice(source, '  let menuConfirmKey, menuConfirmTarget;', '    if (sourceFamily.keydown(event)) return;') + '};\n' + slice(source, '  const keyup = event => {', "  root.addEventListener('pointerdown', holdStart);") + '\n({keydown, keyup});', {
      root: f.root, closest: (_root, target, selector) => selector.endsWith('button') ? null : target, holdEnd() {},
    });
    const events = [];
    const event = {key: name === 'panel-navigation' ? 'ArrowDown' : 'Enter', target: f.child.panel, preventDefault() { events.push('prevent'); }, stopPropagation() { events.push('stop'); }};
    handlers.keydown(event);
    const leakedKeydown = !events.includes('stop');
    if (!leakedKeydown) assert.deepEqual(events, ['stop', 'prevent']);
    if (name === 'panel-confirm') {
      const keydownEvents = events.length;
      handlers.keyup(event);
      assert.equal(events.length - keydownEvents, leakedKeydown ? 0 : 2, 'direct-panel confirmation must contain both phases or reproduce their shared regression');
    }
    assert.equal(f.document.activeElement, f.child.panel); assert.equal(f.child.panel.hidden, false);
    return leakedKeydown;
  }
  assert.equal(name, 'cleanup');
  const close = runInNewContext(slice(source, '  const close = (restoreFocus = false) =>', '  const selectHistory =') + '\nclose;', {...f.context, menu: f.menu});
  const line = source.split('\n').filter(line => line.startsWith('  return () => {') && line.includes('clearReorderPreview();'));
  assert.equal(line.length, 1, 'actual cleanup callback must be unique');
  const empty = () => {};
  const cleanupContext = {...f.context, close, clearReorderPreview: empty, timers: new Set(), clearTimeout: empty, lottieCleanups: [empty]};
  for (const name of ['click', 'scroll', 'input', 'keydown', 'result', 'error', 'contextmenu', 'pointerover', 'menuPointerMove', 'dragend', 'dragstart', 'dragover', 'drop', 'lightboxPointerDownHandler', 'lightboxPointerUpHandler', 'holdStart', 'holdEnd', 'keyup', 'outside']) cleanupContext[name] = empty;
  const cleanup = runInNewContext(`(${line[0].trim().replace(/^return /, '').replace(/;$/, '')})`, cleanupContext);
  cleanup();
  assert(f.removals.some(({type}) => type === 'click'), 'both cleanup variants must still remove click listeners');
  assert(f.removals.some(({type}) => type === 'keydown'), 'both cleanup variants must still remove keyboard listeners');
  assert(f.removals.some(({type}) => type === 'pointermove'), 'both cleanup variants must remove the current menu movement listener');
  assert.equal(f.parent.panel.hidden, f.child.panel.hidden, 'cleanup mutation must affect the open root and empty child together');
  return f.child.panel.hidden;
}

try {
  assert.deepEqual(Object.keys(controls), ['template-truthiness', 'focus-fallback', 'focus-return', 'panel-navigation', 'panel-confirm', 'cleanup']);
  assert.equal(new Set(names).size, names.length);
  for (const [name, control] of Object.entries(controls)) {
    const source = control.file.endsWith('.html') ? template : runtime;
    const mutate = runInNewContext(`(${expression('mutate')})`, {assert, mutation: name});
    const changed = mutate(source, control);
    assert.equal(source.split(control.from).length - 1, 1, `${name}: exact source anchor`);
    assert.equal(changed, source.replace(control.from, control.to), `${name}: only the selected production expression may change`);
    assert.throws(() => mutate(source + control.from, control), assert.AssertionError, `${name}: duplicate anchors must fail closed`);
    assert.throws(() => mutate(source.replace(control.from, ''), control), assert.AssertionError, `${name}: missing anchors must fail closed`);
    assert(names.includes(control.check));
    if (control.file.endsWith('.js')) {
      parse(changed, {ecmaVersion: 'latest', sourceType: 'module'});
      const positive = exercise(source, name), negative = exercise(changed, name);
      assert.equal(positive, control.expected, `${name}: production must satisfy designated oracle ${control.oracle}`);
      assert.equal(negative, control.actual, `${name}: mutant must reproduce the designated failure ${control.oracle}`);
      assert.notEqual(positive, negative, `${name}: causal oracle must distinguish production and mutant`);
      report.controls[name] = {oracle: control.oracle, positive, negative, sourceSHA256: sha(source), servedSHA256: sha(changed)};
    } else report.controls[name] = {oracle: control.oracle, sourceSHA256: sha(source), servedSHA256: sha(changed), verification: 'actual Go fixture tests below'};
    report.checks.push(`${name}: unique anchor and precise source mutation${control.file.endsWith('.js') ? ', positive and negative production VM oracle' : ''}`);
  }
  // Exercise the exact browser catch predicate without loading the browser
  // module. Assertion IDs, check names and actual/expected values are all
  // required; a similarly worded exception or unrelated assertion cannot kill.
  const intendedSource = expression('intended');
  for (const control of Object.values(controls)) {
    const error = new assert.AssertionError({message: control.oracle, actual: control.actual, expected: control.expected});
    error.contractOracle = control.oracle;
    const accepts = (replacement = {}) => runInNewContext(intendedSource, {assert, control, error, activeCheck: control.check, ...replacement});
    assert.equal(accepts(), true);
    assert.equal(accepts({error: new Error(control.oracle)}), false);
    assert.equal(accepts({activeCheck: 'unrelated.check'}), false);
    const wrongOracle = new assert.AssertionError({message: control.oracle, actual: control.actual, expected: control.expected}); wrongOracle.contractOracle = 'unrelated.oracle';
    assert.equal(accepts({error: wrongOracle}), false);
    const wrongActual = new assert.AssertionError({message: control.oracle, actual: control.expected, expected: control.expected}); wrongActual.contractOracle = control.oracle;
    assert.equal(accepts({error: wrongActual}), false);
  }
  report.checks.push('browser kill predicate rejects non-assertions, unrelated checks/oracles and wrong observations');
  const fixtureTest = execFileSync(process.env.GO || 'go', ['test', './adapters/gohtmx/tests/fixtures/menu-empty-submenu', '-count=1', '-v'], {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
  assert.match(fixtureTest, /--- PASS: TestProductionRendererFixtures/);
  assert.match(fixtureTest, /--- PASS: TestUnknownTemplateMutationFailsClosed/);
  report.fixtureOutput = fixtureTest;
  report.checks.push('16 actual Go/SDUI fixture combinations: 4 modes × page/fragment × production/exact-template mutant');
  report.status = 'passed';
  for (const check of report.checks) console.log(`passed: ${check}`);
} catch (error) { report.status = 'failed'; report.error = error.stack; throw error; }
finally {
  mkdirSync('test-results/contracts', {recursive: true});
  writeFileSync('test-results/contracts/menu-empty-submenu-oracles.json', JSON.stringify(report, null, 2) + '\n');
}
