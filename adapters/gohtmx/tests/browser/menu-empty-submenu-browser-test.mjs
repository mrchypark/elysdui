import assert from 'node:assert/strict';
import {execFileSync, spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {chromium} from 'playwright';

// Independent production-renderer suite. Negative controls mutate exactly one
// production expression, never the generated DOM or the assertions below.
const mutation = process.env.MENU_EMPTY_NEGATIVE_CONTROL || '';
const interaction = '/assets/ely-api-interaction.js';
const templatePath = 'templates/ely-api-interaction.html';
const modes = ['qualified', 'chapter', 'sdui'];
const hosts = ['menu', 'checks', 'context'];
const names = [
  'fixture.production-renderers-ready',
  'empty.markup-and-role',
  'empty.focus-fallback',
  'empty.focus-return',
  'empty.panel-navigation',
  'empty.panel-confirm',
  'empty.pointer-repeat',
  'empty.disabled-and-deep-no-events',
  'legacy.leaf-check-radio',
  'hosts.checkbox-and-context',
  'empty.htmx.innerHTML',
  'empty.htmx.outerHTML',
  'fixture.no-runtime-errors',
];
const mutations = {
  'template-truthiness': {
    file: templatePath,
    from: '{{$submenu := menuHasItems .Items}}', to: '{{$submenu := .Items}}',
    check: 'empty.markup-and-role', oracle: 'markup.explicit-empty-is-submenu', prior: [], actual: false, expected: true,
  },
  'focus-fallback': {
    file: interaction,
    from: "(panel.hasAttribute('tabindex') ? panel : null)", to: 'null',
    check: 'empty.focus-fallback', oracle: 'fallback.empty-panel-owns-focus',
    prior: ['fallback.panel-visible', 'fallback.parent-expanded', 'fallback.root-visible'], actual: false, expected: true,
  },
  'focus-return': {
    file: interaction,
    from: "if (nested && ['ArrowLeft', 'Escape'].includes(event.key)) { event.preventDefault(); menu(root, nested.id, false, true); return; }",
    to: "if (nested && ['ArrowLeft', 'Escape'].includes(event.key)) { event.preventDefault(); menu(root, nested.id, false, false); return; }",
    check: 'empty.focus-return', oracle: 'return.arrowleft-focuses-parent',
    prior: ['return.child-owned-focus', 'return.child-hidden', 'return.parent-collapsed'], actual: false, expected: true,
  },
  'panel-navigation': {
    file: interaction,
    from: "if (menuPanel && event.target === menuPanel && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))",
    to: "if (false && menuPanel && event.target === menuPanel && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key))",
    check: 'empty.panel-navigation', oracle: 'navigation.arrowdown-contained', prior: [], actual: true, expected: false,
  },
  'panel-confirm': {
    file: interaction,
    from: "if ((menuControl || menuPanel && event.target === menuPanel) && ['Enter', ' '].includes(event.key))",
    to: "if (menuControl && ['Enter', ' '].includes(event.key))",
    check: 'empty.panel-confirm', oracle: 'confirm.enter-keydown-contained', prior: [], actual: true, expected: false,
  },
  cleanup: {
    file: interaction,
    from: 'const cleanup = () => { close(); cleanupContextRequests(); clearReorderPreview();', to: 'const cleanup = () => { cleanupContextRequests(); clearReorderPreview();',
    check: 'empty.htmx.innerHTML', oracle: 'cleanup.old-empty-panel-hidden',
    prior: ['cleanup.old-empty-was-visible', 'cleanup.old-root-was-visible', 'cleanup.fresh-root-ready', 'cleanup.event-once'], actual: false, expected: true,
  },
};
const sha = value => createHash('sha256').update(value).digest('hex');
const report = {
  suite: 'menu-empty-submenu', mutation, status: 'running', stage: 'startup',
  sourcePins: {implementedMenuReference: '49ed1f84056fa13347d68801b479a4a5a8e03b53', compatibilityAudit: 'da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721'},
  revision: null, dirty: null, checks: [], oracles: [], assets: {}, fixtures: {},
  reviewedBaseline: '16a178fd932f7cba9c721fd056fbd7f62104b43f',
  renderers: ['ui.RenderComponent qualified name', 'ui.RenderComponent chapter/name', 'sdui.Decode + Compile + Plan.Render'],
  requests: [], swaps: [], dismissals: [], pageErrors: [], startupErrors: [], runtimeErrors: [], serverErrors: [],
};
let browser, server, page, activeCheck = null, activeOracles = [];
const oracle = (id, actual, expected) => {
  try { assert.deepEqual(actual, expected, id); }
  catch (error) { error.contractOracle = id; throw error; }
  activeOracles.push(id);
  report.oracles.push(id);
};
const check = async (name, run) => {
  assert.equal(name, names[report.checks.length], 'every contract must execute in its declared order');
  activeCheck = name; activeOracles = []; report.stage = name;
  await run(); report.checks.push(name); console.log(name);
};
const mutate = (source, control) => {
  assert.equal(source.split(control.from).length - 1, 1, `mutation anchor must be unique: ${mutation}`);
  const result = source.replace(control.from, control.to);
  assert.notEqual(result, source, 'mutation must change production source');
  return result;
};

try {
  assert(!mutation || Object.hasOwn(mutations, mutation), 'unknown empty-submenu mutation');
  const control = mutations[mutation];
  report.revision = execFileSync('git', ['rev-parse', 'HEAD'], {encoding: 'utf8'}).trim();
  report.dirty = !!execFileSync('git', ['status', '--porcelain'], {encoding: 'utf8'}).trim();
  report.fixtureSourceSHA256 = sha(await readFile(new URL('../fixtures/menu-empty-submenu/main.go', import.meta.url)));
  report.harnessSourceSHA256 = sha(await readFile(new URL(import.meta.url)));
  const templateSource = await readFile(new URL(`../../../../ui/gohtmx/${templatePath}`, import.meta.url), 'utf8');
  const templateServed = control?.file === templatePath ? mutate(templateSource, control) : templateSource;
  report.template = {path: templatePath, sourceSHA256: sha(templateSource), servedSHA256: sha(templateServed)};
  if (control) report.control = {...control, anchorCount: 1};
  const generate = (fragment, templateMutation = '') => {
    const args = ['run', './adapters/gohtmx/tests/fixtures/menu-empty-submenu', ...(fragment ? ['-fragment'] : []), ...(templateMutation ? [`-mutation=${templateMutation}`] : [])];
    const result = spawnSync(process.env.GO || 'go', args, {encoding: 'utf8', maxBuffer: 8 * 1024 * 1024});
    assert.ifError(result.error);
    assert.equal(result.status, 0, `production Go fixture must generate successfully: ${result.stderr}`);
    const manifest = JSON.parse(result.stderr.trim());
    assert.equal(manifest.sourceSHA256, report.template.sourceSHA256, 'fixture embedded template must match checkout source');
    assert.equal(manifest.servedSHA256, templateMutation ? report.template.servedSHA256 : report.template.sourceSHA256);
    assert.equal(manifest.anchorCount, 1);
    assert.equal(manifest.mutation, templateMutation);
    assert.equal(manifest.fragment, fragment);
    assert.equal(manifest.mode, 'all');
    return {body: result.stdout, manifest, command: [process.env.GO || 'go', ...args]};
  };
  report.stage = 'render-production-fixtures';
  const fixtures = new Map();
  for (const [path, fragment] of [['/', false], ['/fragment', true]]) {
    const baseline = generate(fragment);
    const served = control?.file === templatePath ? generate(fragment, mutation) : baseline;
    report.fixtures[path] = {
      sourceKind: 'unmodified-production-renderer-output',
      sourceSHA256: sha(baseline.body), servedSHA256: sha(served.body),
      sourceBytes: Buffer.byteLength(baseline.body), servedBytes: Buffer.byteLength(served.body),
      manifest: served.manifest, command: served.command,
    };
    if (control?.file === templatePath) assert.notEqual(sha(served.body), sha(baseline.body), 'template mutant must change actual renderer output');
    fixtures.set(path, served.body);
  }
  const assets = new Map();
  for (const path of ['/assets/app.css', '/assets/ely-api.css', '/assets/ely-api-interaction.css', '/assets/htmx.min.js', '/assets/ely-api-interaction-entry.js', '/assets/ely-api.js', interaction]) {
    const source = await readFile(new URL(`../../../../ui/gohtmx${path}`, import.meta.url), 'utf8');
    const served = control?.file === path ? mutate(source, control) : source;
    assets.set(path, served);
    report.assets[path] = {sourceSHA256: sha(source), servedSHA256: sha(served), bytes: Buffer.byteLength(served)};
  }
  if (control) {
    const changed = Object.entries(report.assets).filter(([, value]) => value.sourceSHA256 !== value.servedSHA256).map(([path]) => path);
    assert.deepEqual(changed, control.file === templatePath ? [] : [control.file], 'exactly the designated runtime asset may differ');
  }
  report.stage = 'server-start';
  server = createServer((req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      if (fixtures.has(url.pathname)) {
        if (url.pathname === '/fragment') report.requests.push({method: req.method, path: url.pathname, mode: url.searchParams.get('mode'), swap: url.searchParams.get('swap')});
        return res.setHeader('content-type', 'text/html; charset=utf-8').end(fixtures.get(url.pathname));
      }
      if (!assets.has(url.pathname)) return res.writeHead(404).end();
      res.setHeader('content-type', url.pathname.endsWith('.css') ? 'text/css' : 'text/javascript');
      res.end(assets.get(url.pathname));
    } catch (error) { report.serverErrors.push(String(error)); res.writeHead(500).end(String(error)); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  report.stage = 'browser-launch';
  browser = await chromium.launch({headless: true, ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? {executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH} : {})});
  page = await browser.newPage({viewport: {width: 1440, height: 1100}});
  page.setDefaultTimeout(10000);
  page.on('pageerror', error => report.pageErrors.push(error.message));
  await page.addInitScript(() => {
    window.emptyMenuLog = {actions: [], changes: [], hostActions: [], hostChanges: [], errors: [], keys: []};
    for (const type of ['ely:action', 'ely:change', 'ely:error']) document.addEventListener(type, event => {
      const detail = event.detail || {};
      const key = type === 'ely:action' ? 'actions' : type === 'ely:change' ? 'changes' : 'errors';
      emptyMenuLog[key].push({id: detail.id, action: detail.action, value: detail.value, checked: detail.checked, message: detail.error?.message});
    });
    for (const type of ['keydown', 'keyup']) document.addEventListener(type, event => emptyMenuLog.keys.push({type, key: event.key, target: event.target.id || event.target.value}));
  });
  await page.goto(`http://127.0.0.1:${server.address().port}/`);
  const selector = (mode, host = 'menu') => mode === 'sdui' ? `#${host}-${mode} [data-ely-family="interaction"]` : `#${host}-${mode}`;
  const root = (mode, host = 'menu') => page.locator(selector(mode, host));
  const trigger = (mode, host = 'menu') => root(mode, host).locator('[data-interaction-menu]').first();
  const panel = (mode, host = 'menu') => root(mode, host).locator('[role="menu"]').first();
  const row = (mode, value = 'empty', host = 'menu') => root(mode, host).locator(`[value="${value}"]`);
  const child = async (mode, value = 'empty', host = 'menu') => root(mode, host).locator(`#${await row(mode, value, host).getAttribute('aria-controls')}`);
  const hasFocus = element => element.evaluate(node => document.activeElement === node);
  const isHidden = element => element.evaluate(node => node.hidden);
  const log = () => page.evaluate(() => emptyMenuLog);
  const reset = () => page.evaluate(() => { for (const key of ['actions', 'changes', 'hostActions', 'hostChanges', 'keys']) emptyMenuLog[key] = []; });
  const noEvents = async () => { const events = await log(); for (const key of ['actions', 'changes', 'hostActions', 'hostChanges']) assert.deepEqual(events[key], [], `${key}: submenu must not notify`); };
  const dismiss = async (mode, host = 'menu') => {
    await page.locator('#before').focus();
    await page.waitForFunction(selector => document.querySelector(selector).querySelector('[role="menu"]').hidden, selector(mode, host));
  };
  const open = async (mode, host = 'menu') => {
    if (host === 'context') { await root(mode, host).locator('[data-interaction-context]').focus(); await page.keyboard.press('Shift+F10'); }
    else { await trigger(mode, host).focus(); await page.keyboard.press('ArrowDown'); }
    assert.equal(await isHidden(panel(mode, host)), false, 'root menu must open');
    assert.equal(await hasFocus(row(mode, 'empty', host)), true, 'root opening must skip heading and disabled empty submenu');
  };
  const openChild = async (mode, value = 'empty', key = 'ArrowRight', host = 'menu') => {
    await row(mode, value, host).focus(); await page.keyboard.press(key);
    const submenu = await child(mode, value, host);
    assert.equal(await isHidden(submenu), false, 'empty child must be visible after opening');
    return submenu;
  };
  await check(names[0], async () => {
    const selectors = modes.flatMap(mode => hosts.map(host => selector(mode, host)));
    await page.waitForFunction(selectors => selectors.every(selector => ['true', 'error'].includes(document.querySelector(selector)?.dataset.elyReady)), selectors);
    assert.equal(await page.locator('[data-ely-family]').count(), 9, 'all three production renderers must mount all three hosts');
    assert.equal(await page.locator('[data-sdui-screen]').count(), 3, 'SDUI hosts must pass through real screen rendering');
    assert.deepEqual(await page.evaluate(selectors => selectors.map(selector => document.querySelector(selector).dataset.elyReady), selectors), Array(9).fill('true'));
    report.startupErrors = await page.evaluate(() => emptyMenuLog.errors);
    assert.deepEqual(report.startupErrors, []);
    assert.deepEqual(report.pageErrors, []);
    await page.evaluate(async () => {
      const {mount} = await import('/assets/ely-api.js');
      window.bindEmptyMenu = node => mount(node, {
        onAction: detail => { emptyMenuLog.hostActions.push({id: detail.id, action: detail.action, value: detail.value}); return {saved: true}; },
        onChange: detail => emptyMenuLog.hostChanges.push({id: detail.id, value: detail.value, checked: detail.checked}),
      });
      document.querySelectorAll('[data-ely-family]').forEach(bindEmptyMenu);
      // Ensure an unconsumed navigation/Space key has real room to scroll.
      document.body.style.minHeight = '2200px';
    });
  });
  await check(names[1], async () => {
    oracle('markup.explicit-empty-is-submenu', await row('qualified').evaluate(node => node.hasAttribute('data-interaction-menu')), true);
    const ids = await page.locator('[id]').evaluateAll(nodes => nodes.map(node => node.id));
    assert.equal(new Set(ids).size, ids.length, 'production full page must have unique IDs');
    for (const mode of modes) for (const host of hosts) {
      for (const value of ['disabled-empty', 'empty', 'empty-check', 'empty-radio', 'empty-grandchild']) {
        const item = row(mode, value, host), submenu = await child(mode, value, host);
        assert.equal(await item.getAttribute('role'), 'menuitem');
        assert.equal(await item.getAttribute('aria-haspopup'), 'menu');
        assert.equal(await item.getAttribute('aria-expanded'), 'false');
        for (const attribute of ['aria-checked', 'data-interaction-checkbox', 'data-interaction-menu-radio', 'data-interaction-menu-action', 'data-ely-action']) assert.equal(await item.getAttribute(attribute), null, `empty submenu must suppress ${attribute}`);
        assert.equal(await submenu.count(), 1, 'empty trigger must own exactly one panel');
        assert.equal(await submenu.getAttribute('role'), 'menu');
        assert.equal(await submenu.getAttribute('tabindex'), '-1');
        assert.equal(await submenu.getAttribute('aria-label'), await item.locator('[data-interaction-menu-label]').textContent());
        assert.equal(await submenu.locator(':scope > *').count(), 0, 'empty submenu must remain actually empty');
        assert.equal(await isHidden(submenu), true);
      }
      assert.equal(await row(mode, 'empty', host).locator('[data-interaction-menu-label]').textContent(), 'Empty <safe>');
      assert.equal(await root(mode, host).locator('safe,script').count(), 0, 'labels must stay escaped');
    }
  });
  await check(names[2], async () => {
    await open('qualified'); await reset();
    const submenu = await openChild('qualified');
    oracle('fallback.panel-visible', await isHidden(submenu), false);
    oracle('fallback.parent-expanded', await row('qualified').getAttribute('aria-expanded'), 'true');
    oracle('fallback.root-visible', await isHidden(panel('qualified')), false);
    oracle('fallback.empty-panel-owns-focus', await hasFocus(submenu), true);
    await noEvents(); await dismiss('qualified');
    for (const mode of modes) for (const key of ['ArrowRight', 'Enter', 'Space']) {
      await open(mode); await reset();
      const submenu = await openChild(mode, 'empty', key);
      assert.equal(await hasFocus(submenu), true, `${mode}: ${key} must focus the empty child panel`);
      assert.equal(await row(mode).getAttribute('aria-expanded'), 'true');
      assert.equal(await isHidden(panel(mode)), false);
      await noEvents(); await dismiss(mode);
    }
  });
  await check(names[3], async () => {
    await open('qualified'); const submenu = await openChild('qualified');
    oracle('return.child-owned-focus', await hasFocus(submenu), true);
    await page.keyboard.press('ArrowLeft');
    oracle('return.child-hidden', await isHidden(submenu), true);
    oracle('return.parent-collapsed', await row('qualified').getAttribute('aria-expanded'), 'false');
    oracle('return.arrowleft-focuses-parent', await hasFocus(row('qualified')), true);
    assert.equal(await isHidden(panel('qualified')), false, 'ArrowLeft must leave the root open');
    await dismiss('qualified');
    for (const mode of modes) for (const key of ['ArrowLeft', 'Escape']) {
      await open(mode); await reset(); const submenu = await openChild(mode);
      await page.keyboard.press(key);
      assert.equal(await hasFocus(row(mode)), true, `${mode}: ${key} must restore the empty submenu parent`);
      assert.equal(await isHidden(submenu), true); assert.equal(await isHidden(panel(mode)), false);
      await noEvents(); await dismiss(mode);
    }
    for (const mode of modes) {
      const expectDismissed = async (submenu, destination, gesture) => {
        assert.equal(await isHidden(submenu), true, `${gesture}: empty child must close`);
        assert.equal(await isHidden(panel(mode)), true, `${gesture}: whole menu must close`);
        assert.equal(await row(mode).getAttribute('aria-expanded'), 'false');
        assert.equal(await trigger(mode).getAttribute('aria-expanded'), 'false');
        assert.equal(await hasFocus(destination), true, `${gesture}: preserve the expected native focus destination`);
        await noEvents(); report.dismissals.push({mode, gesture, childHidden: true, rootHidden: true, focusPreserved: true});
      };
      await open(mode); await reset(); let submenu = await openChild(mode);
      await page.keyboard.press('Tab');
      await expectDismissed(submenu, trigger(mode, 'checks'), 'Tab from empty child');
      assert.equal(await isHidden(panel(mode, 'checks')), true, 'Tab must not open the next menu');
      await open(mode); await reset(); submenu = await openChild(mode);
      await page.keyboard.press('Shift+Tab');
      await expectDismissed(submenu, trigger(mode), 'Shift+Tab from empty child');
      await open(mode); await reset(); submenu = await openChild(mode);
      await page.locator('#before').click();
      await expectDismissed(submenu, page.locator('#before'), 'outside focusable click');
      await open(mode); await reset(); submenu = await openChild(mode);
      await page.locator('#outside').click();
      await expectDismissed(submenu, trigger(mode), 'outside blank click after native default');
    }
  });
  await check(names[4], async () => {
    for (const mode of modes) {
      await open(mode); const submenu = await openChild(mode); await reset();
      const scroll = await page.evaluate(() => ({x: scrollX, y: scrollY}));
      for (const key of ['ArrowDown', 'ArrowUp', 'Home', 'End']) {
        await page.keyboard.press(key);
        if (mode === 'qualified' && key === 'ArrowDown') oracle('navigation.arrowdown-contained', (await log()).keys.some(event => event.type === 'keydown' && event.key === key), false);
        assert.equal((await log()).keys.some(event => event.type === 'keydown' && event.key === key), false, `${key} keydown must remain inside the empty panel`);
        assert.equal(await hasFocus(submenu), true, `${key} must retain empty-panel focus`);
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.deepEqual(await page.evaluate(() => ({x: scrollX, y: scrollY})), scroll, 'empty-panel navigation must not scroll the page');
      await noEvents(); await dismiss(mode);
    }
  });
  await check(names[5], async () => {
    for (const mode of modes) {
      await open(mode); const submenu = await openChild(mode); await reset();
      const scroll = await page.evaluate(() => ({x: scrollX, y: scrollY}));
      for (const key of ['Enter', 'Space']) {
        await page.keyboard.press(key);
        if (mode === 'qualified' && key === 'Enter') oracle('confirm.enter-keydown-contained', (await log()).keys.some(event => event.type === 'keydown' && event.key === 'Enter'), false);
        assert.deepEqual((await log()).keys, [], 'both confirmation phases must stay inside the focused empty panel');
        assert.equal(await hasFocus(submenu), true); assert.equal(await isHidden(submenu), false); assert.equal(await isHidden(panel(mode)), false);
      }
      await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      assert.deepEqual(await page.evaluate(() => ({x: scrollX, y: scrollY})), scroll, 'empty-panel confirmation must not scroll the page');
      await noEvents(); await dismiss(mode);
    }
  });
  await check(names[6], async () => {
    for (const mode of modes) {
      await open(mode); await reset();
      for (let repeat = 0; repeat < 3; repeat++) {
        await row(mode).hover(); const submenu = await child(mode);
        assert.equal(await isHidden(submenu), false); assert.equal(await hasFocus(submenu), true, 'hover must focus empty child');
        await row(mode).click();
        assert.equal(await isHidden(submenu), false, 'native click must preserve the hover-open empty child');
        assert.equal(await hasFocus(submenu), true);
        await row(mode).click(); assert.equal(await hasFocus(submenu), true, 'repeated click must preserve empty-child focus');
        await page.keyboard.press('ArrowLeft'); assert.equal(await hasFocus(row(mode)), true);
        // Move to a sibling before the next hover, so each repetition generates
        // real pointer movement instead of relying on a stationary pointer.
        await row(mode, 'legacy').hover();
      }
      await noEvents(); await dismiss(mode);
    }
  });
  await check(names[7], async () => {
    for (const mode of modes) {
      await open(mode); await reset();
      await page.keyboard.press('Home'); assert.equal(await hasFocus(row(mode)), true);
      await page.keyboard.press('ArrowUp'); assert.equal(await hasFocus(row(mode, 'legacy-radio')), true);
      await page.keyboard.press('Home');
      const disabled = row(mode, 'disabled-empty'), disabledPanel = await child(mode, 'disabled-empty');
      await disabled.hover(); await disabled.dispatchEvent('click');
      for (const key of ['ArrowRight', 'Enter', ' ']) {
        await disabled.dispatchEvent('keydown', {key, bubbles: true});
        await disabled.dispatchEvent('keyup', {key, bubbles: true});
      }
      assert.equal(await isHidden(disabledPanel), true); assert.equal(await disabled.getAttribute('aria-expanded'), 'false');
      for (const value of ['empty-check', 'empty-radio']) for (const key of ['ArrowRight', 'Enter', 'Space']) {
        const submenu = await openChild(mode, value, key);
        assert.equal(await hasFocus(submenu), true); await page.keyboard.press('Escape');
        assert.equal(await hasFocus(row(mode, value)), true);
        assert.equal(await row(mode, value).getAttribute('aria-checked'), null);
      }
      await row(mode, 'branch').focus(); await page.keyboard.press('ArrowRight');
      assert.equal(await hasFocus(row(mode, 'empty-grandchild')), true, 'nested navigation must skip the disabled empty grandchild');
      const grandchild = await openChild(mode, 'empty-grandchild');
      assert.equal(await hasFocus(grandchild), true); await page.keyboard.press('Escape');
      assert.equal(await hasFocus(row(mode, 'empty-grandchild')), true);
      assert.equal(await row(mode, 'branch').getAttribute('aria-expanded'), 'true');
      await page.keyboard.press('ArrowLeft'); assert.equal(await hasFocus(row(mode, 'branch')), true);
      assert.equal(await isHidden(panel(mode)), false); await noEvents(); await dismiss(mode);
    }
  });
  await check(names[8], async () => {
    for (const mode of modes) for (const [value, action, changed] of [['legacy', 'legacy-action', false], ['legacy-check', 'legacy-check-action', true], ['legacy-radio', 'legacy-radio-action', true]]) {
      await open(mode); await reset(); await row(mode, value).focus(); await page.keyboard.press('Enter');
      const events = await log();
      assert.deepEqual(events.actions.map(({action, value}) => ({action, value})), [{action, value}], 'ordinary leaf must still dispatch exactly once');
      assert.deepEqual(events.hostActions.map(({action, value}) => ({action, value})), [{action, value}]);
      assert.equal(events.changes.length, Number(changed)); assert.equal(events.hostChanges.length, Number(changed));
      if (changed) assert.equal(await row(mode, value).getAttribute('aria-checked'), 'true');
      assert.equal(await isHidden(panel(mode)), true); assert.equal(await hasFocus(trigger(mode)), true);
    }
  });
  await check(names[9], async () => {
    for (const mode of modes) for (const host of ['checks', 'context']) {
      await open(mode, host); await reset();
      for (const value of ['empty', 'empty-check', 'empty-radio']) {
        const submenu = await openChild(mode, value, 'Enter', host);
        assert.equal(await hasFocus(submenu), true); await page.keyboard.press('Escape');
        assert.equal(await hasFocus(row(mode, value, host)), true); assert.equal(await isHidden(panel(mode, host)), false);
      }
      await noEvents(); await page.keyboard.press('Escape');
      const owner = host === 'context' ? root(mode, host).locator('[data-interaction-context]') : trigger(mode, host);
      assert.equal(await hasFocus(owner), true); assert.equal(await isHidden(panel(mode, host)), true);
      if (host === 'context') {
        const surface = root(mode, host).locator('[data-interaction-context]');
        await surface.click({button: 'right'}); assert.equal(await isHidden(panel(mode, host)), false);
        await row(mode, 'empty', host).click(); assert.equal(await hasFocus(await child(mode, 'empty', host)), true);
        await page.keyboard.press('ArrowLeft'); assert.equal(await hasFocus(row(mode, 'empty', host)), true);
        await noEvents(); await dismiss(mode, host);
      }
    }
  });
  for (const style of ['innerHTML', 'outerHTML']) await check(`empty.htmx.${style}`, async () => {
    for (const mode of modes) {
      await open(mode); await openChild(mode);
      await page.evaluate(selector => {
        const root = document.querySelector(selector), parent = root.querySelector('[value="empty"]');
        const snapshot = window.oldEmpty = {
          root, parent, child: root.querySelector(`#${parent.getAttribute('aria-controls')}`),
          panel: root.querySelector('[role="menu"]'), trigger: root.querySelector('[data-interaction-menu]'),
          leaf: root.querySelector('[value="legacy"]'), cleanups: 0, staleActions: 0, staleChanges: 0,
        };
        root.addEventListener('ely:cleanup', () => snapshot.cleanups++, {once: true});
        root.addEventListener('ely:action', () => snapshot.staleActions++);
        root.addEventListener('ely:change', () => snapshot.staleChanges++);
      }, selector(mode));
      if (style === 'innerHTML' && mode === 'qualified') {
        oracle('cleanup.old-empty-was-visible', await page.evaluate(() => oldEmpty.child.hidden), false);
        oracle('cleanup.old-root-was-visible', await page.evaluate(() => oldEmpty.panel.hidden), false);
      }
      // A genuine HTMX request and production before/after-swap lifecycle.
      // The inner path intentionally omits swap and uses a source without
      // hx-swap; the outer path requests outerHTML explicitly. SDUI fragments
      // retain real compiler output and are selected down to the family root.
      await page.evaluate(({selector, style, mode}) => htmx.ajax('GET', `/fragment?mode=${mode}&swap=${style}`, style === 'innerHTML'
        ? {source: '#before', target: selector, select: `${selector} > *`}
        : {source: '#swap-source', target: selector, select: selector, swap: 'outerHTML'}), {selector: selector(mode), style, mode});
      await page.waitForFunction(selector => {
        const fresh = document.querySelector(selector);
        return fresh?.dataset.elyReady === 'true' && fresh.querySelector('[value="empty"]') !== oldEmpty.parent;
      }, selector(mode));
      if (style === 'innerHTML' && mode === 'qualified') {
        oracle('cleanup.fresh-root-ready', await root(mode).getAttribute('data-ely-ready'), 'true');
        oracle('cleanup.event-once', await page.evaluate(() => oldEmpty.cleanups), 1);
        oracle('cleanup.old-empty-panel-hidden', await page.evaluate(() => oldEmpty.child.hidden), true);
      }
      assert.equal(await page.evaluate(() => oldEmpty.cleanups), 1, 'each real HTMX replacement must clean up once');
      assert.equal(await page.evaluate(() => oldEmpty.child.hidden), true, 'teardown must hide the old open empty panel');
      assert.equal(await page.evaluate(() => oldEmpty.panel.hidden), true, 'teardown must hide the old root panel');
      assert.equal(await page.evaluate(() => oldEmpty.parent.getAttribute('aria-expanded')), 'false');
      assert.equal(await page.evaluate(() => oldEmpty.trigger.getAttribute('aria-expanded')), 'false');
      assert.equal(await root(mode).evaluate(node => node === oldEmpty.root), style === 'innerHTML');
      if (style === 'outerHTML') await root(mode).evaluate(node => bindEmptyMenu(node));
      await reset();
      await page.evaluate(() => {
        oldEmpty.trigger.click(); oldEmpty.parent.click(); oldEmpty.leaf.click();
        oldEmpty.parent.dispatchEvent(new KeyboardEvent('keydown', {key: 'ArrowRight', bubbles: true}));
        oldEmpty.parent.dispatchEvent(new PointerEvent('pointerover', {bubbles: true}));
        oldEmpty.parent.dispatchEvent(new PointerEvent('pointermove', {bubbles: true, pointerType: 'mouse'}));
      });
      assert.deepEqual(await page.evaluate(() => ({childHidden: oldEmpty.child.hidden, rootHidden: oldEmpty.panel.hidden, expanded: oldEmpty.parent.getAttribute('aria-expanded'), actions: oldEmpty.staleActions, changes: oldEmpty.staleChanges})), {childHidden: true, rootHidden: true, expanded: 'false', actions: 0, changes: 0}, 'detached old empty-menu nodes must have no live handlers');
      await noEvents();
      await open(mode); const freshChild = await openChild(mode, 'empty', 'Space');
      assert.equal(await hasFocus(freshChild), true); await noEvents();
      await page.keyboard.press('Escape'); assert.equal(await hasFocus(row(mode)), true);
      await row(mode, 'legacy').focus(); await page.keyboard.press('Enter');
      const events = await log();
      assert.deepEqual(events.actions.map(({action, value}) => ({action, value})), [{action: 'legacy-action', value: 'legacy'}], 'HTMX-remounted leaf must dispatch exactly once');
      assert.equal(events.hostActions.length, 1); assert.deepEqual(events.changes, []); assert.deepEqual(events.hostChanges, []);
      assert.equal(await isHidden(panel(mode)), true);
      report.swaps.push({mode, style, cleanupCount: 1, oldEmptyHidden: true, staleEvents: 0, freshActionCount: 1});
    }
  });
  await check(names.at(-1), async () => {
    assert.deepEqual(report.requests, ['innerHTML', 'outerHTML'].flatMap(swap => modes.map(mode => ({method: 'GET', path: '/fragment', mode, swap}))));
    assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.serverErrors, []);
    report.runtimeErrors = (await log()).errors;
    assert.deepEqual(report.runtimeErrors, [], 'no production startup, action or lifecycle errors may be hidden');
  });
  assert.deepEqual(report.checks, names, 'all independent empty-submenu contracts must complete');
  assert.equal(mutation, '', 'negative control unexpectedly survived all intended assertions');
  report.status = 'passed';
} catch (error) {
  report.error = error.stack; report.failedCheck = activeCheck; report.failedOracle = error.contractOracle || null;
  report.completedOraclesInFailedCheck = [...activeOracles];
  const control = mutations[mutation];
  // An arbitrary failure, timeout, missing locator, bad renderer, page error or
  // assertion containing similar prose can never count as a killed mutant.
  const intended = control && error instanceof assert.AssertionError &&
    error.contractOracle === control.oracle && activeCheck === control.check &&
    Object.is(error.actual, control.actual) && Object.is(error.expected, control.expected);
  if (intended) {
    try {
      // The error collector is permanent and is never reset between actions.
      // A late action/swap error must not hide behind the intended assertion.
      report.runtimeErrors = await page.evaluate(() => emptyMenuLog.errors);
      assert.deepEqual(report.checks, names.slice(0, names.indexOf(control.check)), 'negative control must complete its exact prerequisite check prefix');
      assert.deepEqual(activeOracles, control.prior, 'negative control must complete its exact causal oracle prefix');
      assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.startupErrors, []); assert.deepEqual(report.runtimeErrors, []); assert.deepEqual(report.serverErrors, []);
      report.status = 'mutation-killed';
      report.kill = {check: activeCheck, oracle: control.oracle, actual: error.actual, expected: error.expected, verifiedCompletedPrefix: [...report.checks], verifiedOraclePrefix: [...activeOracles]};
    } catch (validationError) { report.status = 'failed'; report.killValidationError = validationError.stack; throw validationError; }
  } else { report.status = 'failed'; throw error; }
} finally {
  await mkdir('test-results/contracts', {recursive: true});
  await writeFile(`test-results/contracts/menu-empty-submenu${mutation ? '-' + mutation : ''}.json`, JSON.stringify(report, null, 2));
  await browser?.close(); if (server?.listening) await new Promise(resolve => server.close(resolve));
}
