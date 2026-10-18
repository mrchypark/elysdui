import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {expectedInventory} from './gallery-inventory.mjs';
import {auditSource} from './audit-check-sources.mjs';

// Execute the registered gallery checks against bounded production selection
// handlers. DOM/focus/event adapters are modeled here; real browsers run in CI.
const runtime = readFileSync('ui/gohtmx/assets/ely-api-interaction.js', 'utf8');
const registry = readFileSync('internal/gallery/assets/advanced-checks.js', 'utf8').replace(/^import .*\n/gm, '').replace(/export /g, '');
const gallery = readFileSync('internal/gallery/assets/advanced-interaction-checks.js', 'utf8').replace(/^import .*\n/gm, '');
const slice = (start, end) => {
  const a = runtime.indexOf(start), b = runtime.indexOf(end, a);
  assert(a >= 0 && b > a, `missing production boundary ${start}`);
  return runtime.slice(a, b);
};
const selection = slice('    const checkbox = target?.closest', '    const select = target?.closest');
const menuAction = slice('const menuAction =', '// Each mount owns its toast clocks.');
const inventory = expectedInventory('live');
const radioKey = inventory.cases.find(row => row.name === 'menus/RadioMenuItem').key;
const checkboxKey = inventory.cases.find(row => row.name === 'menus/CheckboxMenuItem').key;
assert.equal(radioKey, 'menus/RadioMenuItem');
assert.equal(checkboxKey, 'menus/CheckboxMenuItem');
assert.deepEqual(auditSource(gallery), []);

class Node {
  constructor(attrs = {}) {
    this.attrs = {...attrs}; this.dataset = {}; this.handlers = new Map(); this.disabled = false;
    for (const [key, value] of Object.entries(attrs)) if (key.startsWith('data-')) this.dataset[key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase())] = value;
    this.id = attrs.id; this.value = attrs.value;
  }
  getAttribute(key) { return this.attrs[key] ?? null; }
  setAttribute(key, value) { this.attrs[key] = String(value); }
  hasAttribute(key) { return Object.hasOwn(this.attrs, key); }
  addEventListener(type, fn) { const list = this.handlers.get(type) || []; list.push(fn); this.handlers.set(type, list); }
  removeEventListener(type, fn) { this.handlers.set(type, (this.handlers.get(type) || []).filter(item => item !== fn)); }
  dispatchEvent(event) { event.target = this; for (const fn of this.handlers.get(event.type) || []) fn(event); this.onEvent?.(event); }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
  querySelectorAll() { return []; }
}

function setup({component = 'menus/RadioMenuItem', mutation = '', checkSource = gallery} = {}) {
  const document = {activeElement:null, querySelector:() => null};
  const context = {document, CSS:{escape:s => s}, KeyboardEvent:class {constructor(type, data) {this.type=type; Object.assign(this,data);}}};
  runInNewContext(registry + '\nglobalThis.runCheck = executeRegisteredCheck;', context);
  runInNewContext('(() => {' + checkSource + '\n})();', context);
  const build = id => {
    const root = new Node({id, 'data-ely-component':component, 'data-ely-ready':'true'});
    const trigger = new Node({'data-interaction-menu':`${id}-menu`, 'aria-expanded':'false'});
    const panel = new Node({id:`${id}-menu`, role:'menu'}); panel.hidden = true;
    const rows = ['sidebar','minimap','status-bar','compact','standard','comfortable'].map((value, i) => {
      const radio = i >= 3 || component === 'menus/RadioMenuItem';
      const row = new Node({value, role:radio ? 'menuitemradio' : 'menuitemcheckbox', 'aria-checked':String([0,2,4].includes(i)), 'data-interaction-menu-action':'', 'data-ely-action':`select-${value}`, ...(radio ? {'data-interaction-menu-radio':i < 3 ? 'default' : 'density'} : {'data-interaction-checkbox':''})});
      row.closest = selector => selector === '[role="menu"]' ? panel : selector === '[data-interaction-menu-radio]' && radio || selector === '[data-interaction-checkbox]' && !radio ? row : null;
      row.focus = () => { document.activeElement = row; };
      row.onEvent = event => { if (event.key === 'ArrowDown') rows[(rows.indexOf(row) + 1) % rows.length].focus(); };
      return row;
    });
    const matches = (row, selector) => {
      if (selector === '[aria-checked]' || selector === '[data-interaction-menu-action]') return true;
      if (selector === '[role="menuitemcheckbox"]') return row.getAttribute('role') === 'menuitemcheckbox';
      if (selector === '[data-interaction-checkbox]') return row.hasAttribute('data-interaction-checkbox');
      if (selector.startsWith('[data-interaction-menu-radio]')) return row.hasAttribute('data-interaction-menu-radio') && (!selector.includes('aria-checked') || row.getAttribute('aria-checked') === (selector.includes('"false"') ? 'false' : 'true'));
      if (selector.startsWith('[data-ely-action]:')) return true;
      return false;
    };
    panel.querySelectorAll = selector => rows.filter(row => matches(row, selector));
    panel.contains = node => rows.includes(node);
    root.querySelectorAll = selector => selector === '[data-interaction-menu]' ? [trigger] : selector === `#${panel.id}` || selector === '[role=menu]' ? [panel] : selector === '[role=menu] button:not(:disabled)' ? rows : rows.filter(row => matches(row, selector));
    trigger.focus = () => { document.activeElement = trigger; };
    const close = restore => { panel.hidden = true; trigger.setAttribute('aria-expanded','false'); if (restore) trigger.focus(); };
    trigger.click = () => { panel.hidden = !panel.hidden; trigger.setAttribute('aria-expanded',String(!panel.hidden)); if (!panel.hidden) rows[0].focus(); };
    trigger.onEvent = event => { if (event.key === 'Escape') close(true); };
    const dispatch = (target, type, detail) => target.dispatchEvent({type, detail});
    const handlerContext = {root, close, change:(target, detail) => dispatch(target, 'ely:change', detail), emit:(target, action, detail) => { dispatch(target, 'ely:action', {id:target.id, component:target.dataset.elyComponent, action, ...detail}); return true; }};
    let source = selection;
    const mutate = (from, to) => { assert(source.includes(from), `missing mutation anchor ${mutation}`); source = source.replace(from, to); };
    if (mutation === 'checkbox-reselection') mutate('String(item === radio)', "String(item === radio && radio.getAttribute('aria-checked') !== 'true')");
    if (mutation === 'cross-group') mutate(' && item.dataset.interactionMenuRadio === radio.dataset.interactionMenuRadio', '');
    if (mutation === 'action-before-change') mutate('      change(root, {name: radio.dataset.interactionMenuRadio, value: radio.value, checked: true});\n      menuAction(root, event, radio);', '      menuAction(root, event, radio);\n      change(root, {name: radio.dataset.interactionMenuRadio, value: radio.value, checked: true});');
    if (mutation === 'checkbox-no-toggle') mutate("checkbox.getAttribute('aria-checked') !== 'true'", "checkbox.getAttribute('aria-checked') === 'true'");
    const click = runInNewContext(menuAction + '\n(target,event)=>{' + source + '}', handlerContext);
    for (const row of rows) row.click = () => click(row, {preventDefault(){}});
    if (mutation === 'wrong-role') rows[0].setAttribute('role','menuitem');
    return {root, trigger, panel, rows};
  };
  const main = build('main'), twin = build('twin');
  return {...main, twin:twin.root, run:(key = component === 'menus/RadioMenuItem' ? radioKey : checkboxKey) => context.runCheck(key, {root:main.root, twin:twin.root})};
}

const radio = setup();
const result = await radio.run();
assert.equal(result.claimId, 'gallery-check:menus/RadioMenuItem');
assert.equal(result.assertions, 36);
assert.equal(radio.panel.hidden, true);
assert.equal(radio.root.handlers.get('ely:change').length, 0, 'checker must clean up change observation');
assert.equal(radio.root.handlers.get('ely:action').length, 0, 'checker must clean up action observation');
const canonical = setup({component:'menus/CheckboxMenuItem'});
const canonicalResult = await canonical.run();
assert.equal(canonicalResult.claimId, 'gallery-check:menus/CheckboxMenuItem');
assert(canonicalResult.assertions > 0);

// The historic canonical route must fail for the exact radio fixture. Replacing
// the exact registration with that route reproduces the same designated failure.
await assert.rejects(setup().run(checkboxKey), /menus\/RadioMenuItem is missing interaction contract \[role="menuitemcheckbox"\]/);
const routeAnchor = "checks['menus/RadioMenuItem'] = radioMenuItemCheck;";
assert(gallery.includes(routeAnchor));
const wrongRoute = gallery.replace(routeAnchor, "checks['menus/RadioMenuItem'] = checks['menus/CheckboxMenuItem'];");
await assert.rejects(setup({checkSource:wrongRoute}).run(), /menus\/RadioMenuItem is missing interaction contract \[role="menuitemcheckbox"\]/);
for (const [mutation, error] of [
  ['wrong-role', /fixture leaves must expose radio semantics/],
  ['checkbox-reselection', /reselection must stay selected/],
  ['cross-group', /selection must preserve the other group/],
  ['action-before-change', /exactly one settled change then action/],
]) await assert.rejects(setup({mutation}).run(), error);
await assert.rejects(setup({component:'menus/CheckboxMenuItem',mutation:'checkbox-no-toggle'}).run(), /menu checkbox state did not change/);
console.log('Menu alias gallery: exact inventory/registry identity and production selection branches pass; 7 causal wrong-route/role/selection/order/checkbox controls rejected. VM adapters do not establish browser behavior.');
