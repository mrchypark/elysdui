/* elysdui Studio: a data-only editor. The server owns validation, rendering and codecs. */
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
  const clone = value => JSON.parse(JSON.stringify(value));
  const pretty = value => JSON.stringify(value, null, 2);
  const bytes = value => new TextEncoder().encode(value).length;
  const storageKey = 'ely-studio-draft-v1';
  const maxBytes = 1048576;
  const state = {
    screenText: '', dataText: '{}', screen: null, data: {}, screenError: '', dataError: '',
    visualSafe: true, selection: ['root'], definitions: new Map(), chosen: null,
    examples: [], undo: [], redo: [], baseline: null, initialized: false,
    searchVersion: 0, detailVersion: 0, inspectorVersion: 0, previewVersion: 0,
    previewController: null, searchController: null, previewTimer: null,
    hasPreview: false, group: '', groupTime: 0, saved: false, storageAvailable: true,
  };
  const element = (tag, className, text) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  };
  const option = (value, text) => {
    const node = element('option', '', text);
    node.value = value;
    return node;
  };
  function notice(message, error = false) {
    $('notice').textContent = message;
    $('notice').classList.toggle('error', error);
    $('notice').hidden = !message;
  }
  function setValidation(message, invalid = false) {
    $('validation-message').textContent = message;
    $('validation-message').closest('.editor-status').classList.toggle('invalid', invalid);
  }
  function previewState(message, kind = '') {
    $('preview-state').textContent = message;
    $('preview-state').className = 'state-pill' + (kind ? ' ' + kind : '');
  }
  function atPath(path, source = state.screen) {
    let current = source;
    for (const key of path) {
      if (current === null || typeof current !== 'object' || !own(current, key)) return undefined;
      current = current[key];
    }
    return current;
  }
  const selectedNode = () => atPath(state.selection);
  const samePath = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const snapshot = () => ({screenText: state.screenText, dataText: state.dataText, selection: [...state.selection]});
  const dirty = () => !state.baseline || state.baseline.screenText !== state.screenText || state.baseline.dataText !== state.dataText;
  const editable = () => !state.screenError && !state.dataError && state.visualSafe && object(state.screen?.root);

  // JSON.parse alone silently accepts duplicate keys and rounds large integers.
  // Check tokens too, so visual edits can never erase duplicate keys or round an
  // authored integer. Raw preview/export always uses the original source bytes.
  function canonicalNumber(token) {
    const match = /^(-?)(\d+)(?:\.(\d+))?(?:[eE]([+-]?\d+))?$/.exec(token);
    if (!match) return token;
    let digits = (match[2] + (match[3] || '')).replace(/^0+/, '');
    if (!digits) return '0';
    const trimmed = digits.replace(/0+$/, '');
    const exponent = Number(match[4] || 0) - (match[3] || '').length + digits.length - trimmed.length;
    return `${match[1]}${trimmed}e${exponent}`;
  }
  function parseSource(text, label, requireObject = true) {
    if (bytes(text) > maxBytes) throw new Error(`${label} exceeds the 1 MiB editor limit`);
    const value = JSON.parse(text);
    if (requireObject && !object(value)) throw new Error(`${label} must be a JSON object`);
    const tokens = text.match(/"(?:[^"\\]|\\[\s\S])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?|true|false|null|[{}\[\]:,]/g) || [];
    let index = 0, precise = true;
    function scan(depth) {
      if (depth > 96) throw new Error(`${label} JSON nesting exceeds the editor limit`);
      const token = tokens[index++];
      if (token === '{') {
        const keys = new Set();
        while (tokens[index] !== '}') {
          const key = JSON.parse(tokens[index++]).toLowerCase();
          if (keys.has(key)) throw new Error(`${label} contains a duplicate key: ${key}`);
          keys.add(key);
          index++; // colon; JSON.parse has already checked the grammar
          scan(depth + 1);
          if (tokens[index] !== ',') break;
          index++;
        }
        index++;
      } else if (token === '[') {
        while (tokens[index] !== ']') {
          scan(depth + 1);
          if (tokens[index] !== ',') break;
          index++;
        }
        index++;
      } else if (/^-?\d/.test(token || '')) {
        const number = Number(token);
        if (!Number.isFinite(number) || (Number.isInteger(number) && !Number.isSafeInteger(number)) || canonicalNumber(token) !== canonicalNumber(JSON.stringify(number))) precise = false;
      }
    }
    scan(0);
    return {value, precise};
  }
  function parseDraft() {
    state.screenError = ''; state.dataError = ''; state.visualSafe = true;
    try {
      const parsed = parseSource(state.screenText, 'Screen');
      state.screen = parsed.value;
      state.visualSafe = parsed.precise;
      if (!object(state.screen.root)) throw new Error('Screen must contain a root node object');
    } catch (error) { state.screenError = error.message; }
    try {
      const parsed = parseSource(state.dataText, 'Data');
      state.data = parsed.value;
      state.visualSafe = state.visualSafe && parsed.precise;
    } catch (error) { state.dataError = error.message; }
    $('document-size').textContent = `${bytes(state.screenText).toLocaleString()} B`;
    if (state.screenError || state.dataError) {
      setValidation(state.screenError || state.dataError, true);
    } else if (!state.visualSafe) {
      setValidation('Large numbers are preserved in JSON. Visual editing is disabled to avoid rounding; raw preview and export still work.');
    } else {
      setValidation('JSON parsed · checking the component contracts…');
    }
  }
  function persist() {
    try {
      localStorage.setItem(storageKey, JSON.stringify({version: 1, ...snapshot(), baseline: state.baseline, settings: compressionSettings(false)}));
      state.saved = true;
      state.storageAvailable = true;
      $('save-status').textContent = 'Draft saved in this browser';
    } catch (error) {
      state.saved = false;
      state.storageAvailable = false;
      $('save-status').textContent = 'Browser storage unavailable · export to keep your draft';
    }
  }
  function historyBefore(group = '') {
    const now = Date.now();
    if (!group || group !== state.group || now - state.groupTime > 750) {
      state.undo.push(snapshot());
      if (state.undo.length > 80) state.undo.shift();
    }
    state.group = group;
    state.groupTime = now;
    state.redo = [];
  }
  function updateHistoryButtons() {
    $('undo').disabled = state.undo.length === 0;
    $('redo').disabled = state.redo.length === 0;
  }
  function historyStep(direction) {
    const from = state[direction], to = state[direction === 'undo' ? 'redo' : 'undo'];
    if (!from.length) return;
    to.push(snapshot());
    const previous = from.pop();
    state.screenText = previous.screenText;
    state.dataText = previous.dataText;
    state.selection = previous.selection;
    state.group = '';
    refresh(true);
  }
  function refresh(syncEditors = false, redrawInspector = true) {
    if (syncEditors) {
      $('screen-editor').value = state.screenText;
      $('data-editor').value = state.dataText;
    }
    parseDraft();
    if (!state.screenError && !object(selectedNode())) state.selection = ['root'];
    renderTree();
    if (redrawInspector) renderInspector();
    else updateLayerActions();
    updateInsertionTargets();
    updateHistoryButtons();
    persist();
    schedulePreview();
  }
  function mutate(change, redrawInspector = true) {
    if (!editable()) return false;
    const next = clone(state.screen);
    let nextSelection;
    try { nextSelection = change(next); }
    catch (error) { notice(error.message, true); return false; }
    const text = pretty(next);
    if (text === state.screenText) return true;
    historyBefore();
    state.screenText = text;
    if (Array.isArray(nextSelection)) state.selection = nextSelection;
    refresh(true, redrawInspector);
    return true;
  }

  async function api(path, options = {}) {
    if (globalThis.elyStaticAPI) return globalThis.elyStaticAPI(path, options);
    const response = await fetch(path, {credentials: 'same-origin', ...options});
    let data;
    try { data = await response.json(); }
    catch { throw new Error(`Server returned an unreadable response (${response.status})`); }
    if (!response.ok) throw new Error(data.error || `Request failed (${response.status})`);
    return data;
  }
  function definition(name) {
    if (!state.definitions.has(name)) {
      const pending = api(`/api/component?name=${encodeURIComponent(name)}`).catch(error => {
        state.definitions.delete(name);
        throw error;
      });
      state.definitions.set(name, pending);
    }
    return state.definitions.get(name);
  }
  async function searchCatalogue(query = '') {
    const version = ++state.searchVersion;
    state.searchController?.abort();
    state.searchController = new AbortController();
    $('catalogue-status').textContent = 'Searching component names…';
    try {
      const result = await api(`/api/catalogue?q=${encodeURIComponent(query)}`, {signal: state.searchController.signal});
      if (version !== state.searchVersion) return;
      $('catalogue-count').textContent = result.total.toLocaleString();
      $('catalogue-status').textContent = `${result.matches.toLocaleString()} matches${result.matches > result.items.length ? ` · first ${result.items.length} shown` : ''}`;
      $('catalogue-results').replaceChildren();
      $('component-suggestions').replaceChildren();
      for (const item of result.items) {
        const button = element('button', 'catalogue-item');
        button.type = 'button';
        button.dataset.componentName = item.name;
        button.classList.toggle('selected', state.chosen?.name === item.name);
        button.setAttribute('aria-pressed', String(state.chosen?.name === item.name));
        button.append(element('span', 'component-symbol', item.name.includes('/') ? '◇' : '▧'));
        const label = element('span');
        label.append(element('span', 'catalogue-name', item.name), element('div', 'catalogue-family', item.family || 'Core component'));
        button.append(label);
        button.addEventListener('click', () => chooseComponent(item.name));
        $('catalogue-results').append(button);
        $('component-suggestions').append(option(item.name, item.name));
      }
      if (!result.items.length) $('catalogue-results').append(element('p', 'micro', 'No matching components. Try a shorter name or family.'));
    } catch (error) {
      if (version !== state.searchVersion || error.name === 'AbortError') return;
      $('catalogue-status').textContent = error.message;
    }
  }
  function defaultValue(property, name = '') {
    if (own(property, 'default')) return clone(property.default);
    if (property.enum?.length) return property.enum[0];
    if (property.oneOf?.length) return defaultValue(property.oneOf[0], name);
    switch (property.type) {
      case 'string': return property.format ? '' : (name === 'text' ? 'Your text here' : name === 'label' ? 'New component' : name === 'title' ? 'New title' : '');
      case 'boolean': return false;
      case 'integer': return Math.ceil(property.min ?? 0);
      case 'number': return property.min ?? 0;
      case 'array': return [];
      case 'object': {
        const result = {};
        for (const [key, child] of Object.entries(property.properties || {})) {
          if (child.required || own(child, 'default')) result[key] = defaultValue(child, key);
        }
        return result;
      }
      default: return null;
    }
  }
  function templateFor(contract, id = 'new-component') {
    const node = {id, type: contract.name};
    const props = {};
    for (const [name, property] of Object.entries(contract.properties || {})) {
      if (property.required || own(property, 'default')) props[name] = defaultValue(property, name);
    }
    if (Object.keys(props).length) node.props = props;
    if (contract.container) node.children = [];
    return node;
  }
  async function chooseComponent(name) {
    const version = ++state.detailVersion;
    state.chosen = null;
    $('component-detail').hidden = false;
    $('component-name').textContent = name;
    $('component-help').textContent = 'Loading the typed contract…';
    $('component-snippet').textContent = '';
    $('component-contract').textContent = '';
    $('add-component').disabled = true;
    $('copy-component').disabled = true;
    document.querySelectorAll('[data-component-name]').forEach(button => {
      const active = button.dataset.componentName === name;
      button.classList.toggle('selected', active);
      button.setAttribute('aria-pressed', String(active));
    });
    try {
      const contract = await definition(name);
      if (version !== state.detailVersion) return;
      state.chosen = contract;
      $('component-family').textContent = contract.family || 'core';
      $('component-help').textContent = `${Object.keys(contract.properties || {}).length} typed properties${contract.container ? ' · accepts children' : ''}${Object.keys(contract.slots || {}).length ? ' · named slots' : ''}. Required values are seeded for editing; the server validates the result.`;
      $('component-snippet').textContent = pretty(templateFor(contract));
      $('component-contract').textContent = pretty(contract);
      $('copy-component').disabled = false;
      updateInsertionTargets();
    } catch (error) {
      if (version === state.detailVersion) $('component-help').textContent = error.message;
    }
  }
  let insertionVersion = 0;
  async function updateInsertionTargets(preferred) {
    const version = ++insertionVersion;
    const target = $('insert-target');
    const previous = preferred ?? target.value;
    target.replaceChildren(option('', 'Select a container'));
    target.disabled = true;
    $('add-component').disabled = true;
    const node = selectedNode();
    if (!editable() || !object(node) || !node.type || node.use || !state.chosen) return;
    try {
      const contract = await definition(node.type);
      if (version !== insertionVersion || !editable()) return;
      const choices = [];
      if (contract.container) choices.push(option('children', 'Children'));
      for (const [name, slot] of Object.entries(contract.slots || {})) {
        const count = Array.isArray(node.slots?.[name]) ? node.slots[name].length : 0;
        const item = option(`slot:${name}`, `Slot: ${name}${slot.maxNodes ? ` (${count}/${slot.maxNodes})` : ''}`);
        item.disabled = !!((slot.allowedTypes?.length && !slot.allowedTypes.includes(state.chosen.name)) || (slot.maxNodes && count >= slot.maxNodes));
        if (item.disabled) item.textContent += ' · unavailable for this component';
        choices.push(item);
      }
      target.replaceChildren(...(choices.length ? choices : [option('', 'This layer has no child slots')]));
      if (choices.some(item => item.value === previous && !item.disabled)) target.value = previous;
      else target.value = choices.find(item => !item.disabled)?.value || '';
      target.disabled = !choices.some(item => !item.disabled);
      $('add-component').disabled = target.disabled || !target.value;
    } catch (error) {
      if (version === insertionVersion) target.replaceChildren(option('', 'Cannot load the selected layer contract'));
    }
  }
  function walkNodes(screen, visit) {
    let count = 0;
    function walk(node, path, depth) {
      if (!object(node) || depth > 64 || ++count > 2000) return;
      visit(node, path);
      if (Array.isArray(node.children)) node.children.forEach((child, i) => walk(child, [...path, 'children', i], depth + 1));
      if (object(node.slots)) for (const [name, children] of Object.entries(node.slots)) {
        if (Array.isArray(children)) children.forEach((child, i) => walk(child, [...path, 'slots', name, i], depth + 1));
      }
    }
    walk(screen?.root, ['root'], 0);
    if (object(screen?.templates)) for (const [name, template] of Object.entries(screen.templates)) walk(template?.root, ['templates', name, 'root'], 0);
  }
  function uniqueID(screen, type) {
    const ids = new Set([screen.id]);
    walkNodes(screen, node => ids.add(node.id));
    const stem = (type.split('/').pop() || 'node').replace(/[^a-zA-Z0-9_-]/g, '-').replace(/^[^a-zA-Z]+/, '').slice(0, 90) || 'node';
    let i = 1;
    while (ids.has(`${stem}-${i}`)) i++;
    return `${stem}-${i}`;
  }
  function addComponent() {
    const chosen = state.chosen, target = $('insert-target').value;
    if (!chosen || !target || $('add-component').disabled) return;
    mutate(screen => {
      const parent = atPath(state.selection, screen);
      const node = templateFor(chosen, uniqueID(screen, chosen.name));
      let children, path;
      if (target === 'children') {
        if (!Array.isArray(parent.children)) parent.children = [];
        children = parent.children;
        path = [...state.selection, 'children'];
      } else {
        const name = target.slice(5);
        if (!object(parent.slots)) parent.slots = {};
        if (!Array.isArray(parent.slots[name])) parent.slots[name] = [];
        children = parent.slots[name];
        path = [...state.selection, 'slots', name];
      }
      children.push(node);
      return [...path, children.length - 1];
    });
  }
  function siblingContext(screen = state.screen) {
    const path = state.selection;
    const index = path.at(-1);
    const siblings = atPath(path.slice(0, -1), screen);
    return Number.isInteger(index) && Array.isArray(siblings) ? {siblings, index, parentPath: path.slice(0, -1)} : null;
  }
  let layerActionsVersion = 0;
  function updateLayerActions() {
    const version = ++layerActionsVersion;
    const context = siblingContext();
    const enabled = editable() && context !== null;
    $('node-up').disabled = !enabled || context.index === 0;
    $('node-down').disabled = !enabled || context.index === context.siblings.length - 1;
    $('node-delete').disabled = !enabled;
    $('node-duplicate').disabled = !enabled;
    if (enabled && context.parentPath.at(-2) === 'slots') {
      const owner = atPath(context.parentPath.slice(0, -2));
      const slotName = context.parentPath.at(-1);
      $('node-duplicate').disabled = true;
      if (owner?.type) definition(owner.type).then(contract => {
        if (version !== layerActionsVersion || !editable()) return;
        const slot = contract.slots?.[slotName];
        $('node-duplicate').disabled = !slot || !!(slot.maxNodes && context.siblings.length >= slot.maxNodes);
      }).catch(() => {});
    }
  }
  function moveNode(offset) {
    mutate(screen => {
      const context = siblingContext(screen);
      if (!context || !context.siblings[context.index + offset]) return;
      const [node] = context.siblings.splice(context.index, 1);
      context.siblings.splice(context.index + offset, 0, node);
      return [...context.parentPath, context.index + offset];
    });
  }
  async function duplicateNode() {
    if (!editable()) return;
    const current = siblingContext();
    if (current?.parentPath.at(-2) === 'slots') {
      const source = state.screenText, selection = JSON.stringify(state.selection);
      const owner = atPath(current.parentPath.slice(0, -2));
      try {
        const contract = await definition(owner.type);
        if (source !== state.screenText || selection !== JSON.stringify(state.selection)) return;
        const slot = contract.slots?.[current.parentPath.at(-1)];
        if (!slot || (slot.maxNodes && current.siblings.length >= slot.maxNodes)) {
          notice('This slot has reached its node limit. Remove a layer before duplicating.', true);
          return;
        }
      } catch (error) { notice(`Cannot check the slot contract: ${error.message}`, true); return; }
    }
    mutate(screen => {
      const context = siblingContext(screen);
      if (!context) return;
      const copy = clone(context.siblings[context.index]);
      const used = new Set([screen.id]), renamed = new Map();
      walkNodes(screen, node => used.add(node.id));
      walkNodes({root: copy}, node => {
        const original = node.id;
        const stem = String(original || 'node').slice(0, 110);
        let i = 1, id;
        do { id = `${stem}-copy-${i++}`; } while (used.has(id));
        used.add(id); renamed.set(original, id); node.id = id;
      });
      walkNodes({root: copy}, node => {
        for (const event of [node.event, ...(Array.isArray(node.events) ? node.events : [])]) {
          if (object(event) && renamed.has(event.target)) event.target = renamed.get(event.target);
        }
      });
      context.siblings.splice(context.index + 1, 0, copy);
      return [...context.parentPath, context.index + 1];
    });
  }
  function deleteNode() {
    mutate(screen => {
      const context = siblingContext(screen);
      if (!context) return;
      context.siblings.splice(context.index, 1);
      if (context.siblings.length) return [...context.parentPath, Math.min(context.index, context.siblings.length - 1)];
      return context.parentPath.at(-2) === 'slots' ? context.parentPath.slice(0, -2) : context.parentPath.slice(0, -1);
    });
  }
  function selectNode(path, slot) {
    state.selection = path;
    state.group = '';
    renderTree();
    renderInspector();
    updateInsertionTargets(slot);
  }
  function renderTree() {
    const root = $('node-tree');
    root.replaceChildren();
    let count = 0;
    const disabled = !editable();
    function appendNode(node, path, list, depth) {
      if (!object(node) || depth > 64 || count >= 2000) return;
      count++;
      const item = element('li');
      const button = element('button', 'tree-button');
      button.type = 'button';
      button.dataset.nodePath = JSON.stringify(path);
      const active = samePath(path, state.selection);
      button.classList.toggle('selected', active);
      button.setAttribute('aria-current', active ? 'true' : 'false');
      const label = element('span', 'tree-label', node.use ? `Use: ${node.use}` : node.type || 'Unnamed component');
      label.append(element('small', '', typeof node.id === 'string' ? node.id : '(missing id)'));
      button.append(element('span', 'tree-glyph', node.children?.length || Object.keys(node.slots || {}).length ? '▾' : '◇'), label);
      if (node.repeat) button.append(element('span', 'tree-badge', 'repeat'));
      else if (node.when) button.append(element('span', 'tree-badge', 'when'));
      button.addEventListener('click', () => selectNode(path));
      item.append(button);
      if (Array.isArray(node.children) && node.children.length) {
        const nested = element('ul', 'tree-group');
        node.children.forEach((child, i) => appendNode(child, [...path, 'children', i], nested, depth + 1));
        item.append(nested);
      }
      if (object(node.slots)) for (const [name, children] of Object.entries(node.slots)) {
        const heading = element('button', 'slot-heading', `Slot / ${name}`);
        heading.type = 'button';
        heading.addEventListener('click', () => selectNode(path, `slot:${name}`));
        item.append(heading);
        const nested = element('ul', 'tree-group');
        if (Array.isArray(children)) children.forEach((child, i) => appendNode(child, [...path, 'slots', name, i], nested, depth + 1));
        item.append(nested);
      }
      list.append(item);
    }
    const main = element('ul', 'tree-group');
    appendNode(state.screen?.root, ['root'], main, 0);
    root.append(main);
    if (object(state.screen?.templates)) for (const [name, template] of Object.entries(state.screen.templates)) {
      root.append(element('div', 'tree-section-heading', `Template / ${name}`));
      const list = element('ul', 'tree-group');
      appendNode(template?.root, ['templates', name, 'root'], list, 0);
      root.append(list);
    }
    $('node-count').textContent = `${count} node${count === 1 ? '' : 's'}`;
    $('tree-status').textContent = disabled ? 'Visual edits paused. Your JSON draft is preserved.' : 'Select a layer to edit its properties.';
    updateLayerActions();
  }
  $('node-tree').addEventListener('keydown', event => {
    const buttons = [...$('node-tree').querySelectorAll('[data-node-path]')];
    const index = buttons.indexOf(document.activeElement);
    if (index < 0) return;
    let next;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = buttons.length - 1;
    if (event.key === 'ArrowDown') next = Math.min(index + 1, buttons.length - 1);
    if (event.key === 'ArrowUp') next = Math.max(index - 1, 0);
    if (event.key === 'ArrowLeft') {
      const path = JSON.parse(buttons[index].dataset.nodePath);
      const parent = path.at(-3) === 'slots' ? path.slice(0, -3) : path.slice(0, -2);
      next = buttons.findIndex(button => button.dataset.nodePath === JSON.stringify(parent));
      if (next < 0) next = index;
    }
    if (event.key === 'ArrowRight') next = Math.min(index + 1, buttons.length - 1);
    if (next !== undefined) { event.preventDefault(); buttons[next].focus(); }
  });

  function typeDescription(property) {
    return (property.oneOf ? property.oneOf.map(item => item.type).join(' | ') : property.type || 'value') + (property.nullable ? ' | null' : '');
  }
  function validateValue(value, property, path = 'Value') {
    if (value === null) {
      if (property.nullable) return;
      throw new Error(`${path} cannot be null`);
    }
    if (property.oneOf) {
      const matches = property.oneOf.filter(item => { try { validateValue(value, item, path); return true; } catch { return false; } });
      if (matches.length !== 1) throw new Error(`${path} must match exactly one declared type`);
      return;
    }
    const type = property.type;
    if ((type === 'object' && !object(value)) || (type === 'array' && !Array.isArray(value)) ||
      (type === 'integer' && !Number.isSafeInteger(value)) || (type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) ||
      (['string', 'boolean'].includes(type) && typeof value !== type)) throw new Error(`${path} must be ${type}`);
    if (property.enum && !property.enum.includes(value)) throw new Error(`${path} must be one of: ${property.enum.join(', ')}`);
    if (property.min !== undefined && value < property.min) throw new Error(`${path} must be at least ${property.min}`);
    if (property.max !== undefined && value > property.max) throw new Error(`${path} must be at most ${property.max}`);
    if (type === 'string' && property.maxLength && bytes(value) > property.maxLength) throw new Error(`${path} exceeds ${property.maxLength} bytes`);
    if (type === 'array') {
      if (property.format === 'empty-array' && value.length !== 0) throw new Error(`${path} must be an empty array`);
      if (property.maxItems && value.length > property.maxItems) throw new Error(`${path} exceeds ${property.maxItems} items`);
      if (property.items) value.forEach((item, index) => validateValue(item, property.items, `${path}[${index}]`));
    }
    if (type === 'object') {
      if (property.maxProperties && Object.keys(value).length > property.maxProperties) throw new Error(`${path} has too many properties`);
      for (const [key, child] of Object.entries(property.properties || {})) {
        if (child.required && !own(value, key) && !own(child, 'default')) throw new Error(`${path}.${key} is required`);
      }
      for (const [key, child] of Object.entries(value)) {
        const contract = own(property.properties || {}, key) ? property.properties[key] : property.additionalProperties;
        if (!contract) throw new Error(`${path}.${key} is not a declared property`);
        validateValue(child, contract, `${path}.${key}`);
      }
    }
  }
  function propertyField(name, property, node, path, group = 'props') {
    const wrap = element('div', 'property-field');
    const heading = element('div', 'property-heading');
    const id = `property-${group}-${name}`;
    const label = element('label', '', name);
    label.htmlFor = id;
    heading.append(label, element('span', 'property-type', typeDescription(property)));
    if (property.required) heading.append(element('span', 'required-mark', 'required'));
    wrap.append(heading);
    const bindingGroup = group === 'params' ? 'paramBindings' : 'bindings';
    if (own(node[bindingGroup] || {}, name)) {
      wrap.append(element('div', 'binding-label', `Bound to ${node[bindingGroup][name]}`), element('p', 'micro', 'Edit this binding in Screen JSON; it is preserved during visual changes.'));
      return wrap;
    }
    const exists = own(node[group] || {}, name), value = exists ? node[group][name] : undefined;
    const complex = property.oneOf || ['array', 'object'].includes(property.type) || property.nullable;
    let input;
    if (!complex && (property.enum || property.type === 'boolean')) {
      input = element('select');
      input.append(option('', own(property, 'default') ? `Default: ${String(property.default)}` : 'Not set'));
      const choices = property.enum || [true, false];
      for (const choice of choices) input.append(option(String(choice), String(choice)));
      if (exists && !choices.includes(value)) input.append(option(String(value), `${String(value)} (invalid)`));
      input.value = exists ? String(value) : '';
    } else if (complex) {
      input = element('textarea');
      input.value = exists ? pretty(value) : '';
      input.placeholder = pretty(defaultValue(property, name));
      input.spellcheck = false;
    } else {
      input = element('input');
      input.type = ['number', 'integer'].includes(property.type) ? 'number' : 'text';
      if (input.type === 'number') {
        input.step = property.type === 'integer' ? '1' : 'any';
        if (property.min !== undefined) input.min = property.min;
        if (property.max !== undefined) input.max = property.max;
      }
      input.value = exists ? String(value) : '';
      input.placeholder = own(property, 'default') ? `Default: ${String(property.default)}` : 'Not set';
    }
    input.id = id;
    input.dataset.property = name;
    input.disabled = !editable();
    const error = element('p', 'property-error');
    error.id = `${id}-error`;
    error.hidden = true;
    input.setAttribute('aria-describedby', error.id);
    const footer = element('div', 'property-footer');
    const details = element('details');
    details.append(element('summary', '', property.format ? `Type contract · ${property.format}` : 'Type contract'), element('pre', '', pretty(property)));
    footer.append(details);
    const remove = element('button', 'remove-property', 'Unset');
    remove.type = 'button';
    remove.disabled = !editable() || !exists;
    remove.setAttribute('aria-label', `Unset ${name}`);
    remove.addEventListener('click', () => mutate(screen => {
      const selected = atPath(path, screen);
      if (object(selected[group])) delete selected[group][name];
    }));
    footer.append(remove);
    function commit() {
      if (!editable() || !samePath(path, state.selection)) return;
      try {
        let next;
        const unset = input.tagName === 'SELECT' && input.value === '';
        if (!unset) {
          if (complex) {
            const parsed = parseSource(input.value, name, false);
            if (!parsed.precise) throw new Error('Use Screen JSON to preserve large numbers exactly');
            next = parsed.value;
          } else if (property.type === 'boolean') next = input.value === 'true';
          else if (['number', 'integer'].includes(property.type)) {
            if (!input.value.trim()) throw new Error('Enter a number, or use Unset');
            next = Number(input.value);
          } else next = input.value;
          validateValue(next, property, name);
        }
        input.removeAttribute('aria-invalid');
        error.hidden = true;
        const current = atPath(path);
        if (unset ? !own(current[group] || {}, name) : own(current[group] || {}, name) && JSON.stringify(current[group][name]) === JSON.stringify(next)) return;
        mutate(screen => {
          const selected = atPath(path, screen);
          if (!object(selected[group])) selected[group] = {};
          if (unset) delete selected[group][name]; else selected[group][name] = next;
        }, false);
        remove.disabled = unset;
      } catch (problem) {
        input.setAttribute('aria-invalid', 'true');
        error.textContent = problem.message;
        error.hidden = false;
      }
    }
    input.addEventListener('change', commit);
    wrap.append(input, error, footer);
    return wrap;
  }
  async function renderInspector() {
    const version = ++state.inspectorVersion;
    const node = selectedNode(), path = [...state.selection];
    $('property-fields').replaceChildren();
    $('advanced-note').hidden = true;
    updateLayerActions();
    if (!object(node)) {
      $('selected-type').textContent = 'Choose a layer';
      $('selected-path').textContent = '';
      return;
    }
    $('selected-type').textContent = node.use ? `Template: ${node.use}` : node.type || 'Unknown component';
    $('selected-path').textContent = path.map(key => typeof key === 'number' ? `[${key}]` : key).join(' / ');
    const idField = element('div', 'property-field');
    const label = element('label', 'field-label', 'Layer ID');
    label.htmlFor = 'selected-node-id';
    const idInput = element('input');
    idInput.id = 'selected-node-id';
    idInput.value = typeof node.id === 'string' ? node.id : '';
    idInput.disabled = !editable();
    idInput.addEventListener('change', () => {
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/.test(idInput.value)) {
        idInput.setCustomValidity('Use a letter followed by letters, digits, underscores or hyphens (128 characters maximum).');
        idInput.reportValidity(); return;
      }
      let collision = state.screen.id === idInput.value;
      walkNodes(state.screen, (candidate, candidatePath) => {
        if (!samePath(candidatePath, path) && candidate.id === idInput.value) collision = true;
      });
      if (collision) {
        idInput.setCustomValidity('This ID is already used by the screen or another layer. Choose a unique ID.');
        idInput.reportValidity(); return;
      }
      idInput.setCustomValidity('');
      mutate(screen => {
        const selected = atPath(path, screen), previous = selected.id;
        selected.id = idInput.value;
        const scope = path[0] === 'templates' ? atPath(path.slice(0, 3), screen) : screen.root;
        walkNodes({root: scope}, current => {
          for (const event of [current.event, ...(Array.isArray(current.events) ? current.events : [])]) {
            if (object(event) && event.target === previous) event.target = idInput.value;
          }
        });
      }, false);
    });
    idInput.addEventListener('input', () => idInput.setCustomValidity(''));
    idField.append(label, idInput, element('p', 'micro', 'Stable, unique identity. Renaming also updates matching event targets in this tree.'));
    $('property-fields').append(idField);
    let properties, group = 'props';
    try {
      if (node.use) {
        properties = state.screen.templates?.[node.use]?.params || {};
        group = 'params';
      } else if (node.type) properties = (await definition(node.type)).properties || {};
      else throw new Error('Set a registered component type in Screen JSON.');
      if (version !== state.inspectorVersion) return;
      for (const [name, property] of Object.entries(properties).sort(([a, p], [b, q]) => Number(!!q.required) - Number(!!p.required) || a.localeCompare(b))) {
        $('property-fields').append(propertyField(name, property, node, path, group));
      }
      const retained = Object.keys(node).filter(key => !['id', 'type', 'props', 'children', 'slots'].includes(key));
      const unknown = Object.keys(node.props || {}).filter(name => !own(properties, name));
      const messages = [];
      if (retained.length) messages.push(`Preserved in Screen JSON: ${retained.join(', ')}.`);
      if (unknown.length) messages.push(`Additional properties are preserved: ${unknown.join(', ')}. The server checks whether they are allowed.`);
      if (node.use) messages.push('Template instances keep their parameter bindings, conditions and repeat settings. Edit the reusable definition in Layers.');
      if (messages.length) {
        $('advanced-note').textContent = messages.join(' ');
        $('advanced-note').hidden = false;
      }
    } catch (error) {
      if (version !== state.inspectorVersion) return;
      $('property-fields').append(element('p', 'property-error', error.message));
    }
  }

  function compressionSettings(validate = true) {
    const settings = {profile: $('compression-profile').value, strategy: $('compression-strategy').value};
    for (const [id, key, max] of [['min-bytes', 'minBytes', 2097152], ['min-savings-bytes', 'minSavingsBytes', 2097152], ['min-savings-percent', 'minSavingsPercent', 100]]) {
      const input = $(id), number = Number(input.value);
      if (validate && (!input.value.trim() || !Number.isInteger(number) || number < 0 || number > max)) throw new Error(`Compression setting must be an integer from 0 to ${max}: ${input.closest('label').firstChild.textContent.trim()}`);
      settings[key] = number;
    }
    return settings;
  }
  function schedulePreview(immediate = false) {
    clearTimeout(state.previewTimer);
    const version = ++state.previewVersion;
    state.previewController?.abort();
    if (state.screenError || state.dataError) {
      previewState(state.hasPreview ? 'Stale preview · fix JSON' : 'Fix JSON to preview', 'stale');
      return;
    }
    previewState(state.hasPreview ? 'Updating · previous preview' : 'Rendering…', 'stale');
    state.previewTimer = setTimeout(() => renderPreview(version), immediate ? 0 : 280);
  }
  async function renderPreview(version) {
    if (version !== state.previewVersion || state.screenError || state.dataError) return;
    const controller = new AbortController();
    state.previewController = controller;
    const timeout = setTimeout(() => controller.abort(), 30000);
    try {
      const settings = compressionSettings();
      const currentTheme = window.ElyTheme?.current();
      if (currentTheme) settings.theme = {mode: currentTheme.mode, colors: window.ElyTheme.get(currentTheme.id)[currentTheme.mode]};
      // Keep raw JSON numbers intact; never stringify the JS-parsed screen/data.
      const body = `{"screen":${state.screenText},"data":${state.dataText},${JSON.stringify(settings).slice(1)}`;
      const result = await api('/api/preview', {method: 'POST', headers: {'Content-Type': 'application/json', 'X-CSRF-Token': document.querySelector('meta[name="csrf-token"]').content}, body, signal: controller.signal});
      if (version !== state.previewVersion || controller.signal.aborted) return;
      if (typeof result.html !== 'string' || !object(result.sizes)) throw new Error('Preview response is missing the rendered document or byte measurements');
      // No runtime, script bridge, allow-scripts or allow-same-origin is granted.
      // Go supplies sanitized real renderer markup plus hash-authorized fixed CSS.
      $('preview-frame').setAttribute('sandbox', '');
      $('preview-frame').srcdoc = result.html;
      $('preview-frame').hidden = false;
      $('preview-placeholder').hidden = true;
      state.hasPreview = true;
      renderSizes(result);
      previewState('Live · validated');
      setValidation(state.visualSafe ? 'Valid screen · rendered by Go' : 'Valid screen · large numbers preserved; visual edits paused');
    } catch (error) {
      if (version !== state.previewVersion) return;
      const message = error.name === 'AbortError' ? 'Preview timed out. Press Ctrl/⌘ + Enter to retry.' : error.message;
      setValidation(message, true);
      previewState(state.hasPreview ? 'Stale preview · fix error' : 'Preview error', 'error');
    } finally { clearTimeout(timeout); }
  }
  function renderSizes(result) {
    const table = element('table', 'size-table');
    table.setAttribute('aria-label', 'Actual encoded payload bytes');
    const head = element('thead'), labels = element('tr');
    for (const title of ['Payload', 'Identity', 'gzip', 'Brotli', 'Zstd']) labels.append(element('th', '', title));
    head.append(labels); table.append(head);
    const body = element('tbody');
    for (const [name, label] of [['json', 'JSON'], ['html', 'HTML']]) {
      const row = element('tr'), heading = element('th', '', label);
      heading.scope = 'row'; row.append(heading);
      for (const coding of ['identity', 'gzip', 'br', 'zstd']) {
        const size = result.sizes[name]?.[coding];
        const cell = element('td', result.sizes[name]?.selected === coding ? 'chosen' : '', Number.isInteger(size) ? `${size.toLocaleString()} B` : '—');
        if (result.sizes[name]?.selected === coding) cell.title = 'Selected by the server under the current thresholds';
        row.append(cell);
      }
      body.append(row);
    }
    table.append(body);
    const caption = element('div', 'selected-caption');
    for (const [key, label] of [['json', 'JSON'], ['html', 'HTML']]) {
      const span = element('span', '', `${label} selected: `);
      span.append(element('strong', '', result.sizes[key]?.selected || 'unknown'));
      caption.append(span);
    }
    $('size-comparison').replaceChildren(table, caption);
    const events = Array.isArray(result.events) ? result.events.length : 0;
    const assets = Array.isArray(result.assets) ? result.assets : [];
    $('delivery-details').textContent = `${events} event contract${events === 1 ? '' : 's'} · ${assets.length} renderer stylesheet dependenc${assets.length === 1 ? 'y' : 'ies'} (excluded from measurements)${assets.length ? `: ${assets.join(', ')}` : ''}. Preview behavior is intentionally inert.`;
  }
  function showTab(name, focus = false) {
    for (const tab of ['properties', 'screen', 'data']) {
      const active = name === tab;
      $(`tab-${tab}`).classList.toggle('active', active);
      $(`tab-${tab}`).setAttribute('aria-selected', String(active));
      $(`tab-${tab}`).tabIndex = active ? 0 : -1;
      $(`${tab}-panel`).hidden = !active;
    }
    if (focus) $(name === 'screen' ? 'screen-editor' : name === 'data' ? 'data-editor' : 'tab-properties').focus();
  }
  function confirmReplace() {
    return !dirty() || window.confirm('Replace the current screen and sample data? Your existing draft will remain available with Undo. Export first if you want a separate copy.');
  }
  function loadDocument(screenText, dataText, resetBaseline = true) {
    if (state.initialized) historyBefore();
    state.screenText = screenText;
    state.dataText = dataText;
    state.selection = ['root'];
    state.initialized = true;
    if (resetBaseline) state.baseline = {screenText, dataText};
    notice('');
    refresh(true);
  }
  async function loadExamples() {
    try {
      state.examples = await api('/api/examples');
      $('example-select').replaceChildren(...state.examples.map(example => option(example.id, example.title)));
      $('example-select').disabled = false;
      $('load-example').disabled = false;
      if (!state.initialized && !state.screenText) {
        const example = state.examples.find(item => item.id === 'basic') || state.examples[0];
        if (example) loadDocument(pretty(example.screen), pretty(example.data || {}));
      }
    } catch (error) {
      notice(`Examples could not load: ${error.message}. You can still import or enter a screen.`, true);
      $('example-select').replaceChildren(option('', 'Examples unavailable'));
    }
  }
  let importVersion = 0;
  async function importFile(file) {
    const version = ++importVersion;
    if (!file) return;
    if (file.size > maxBytes) { notice('Import exceeds the 1 MiB screen limit.', true); return; }
    try {
      const text = await file.text();
      if (version !== importVersion) return;
      const parsed = parseSource(text, 'Imported screen');
      if (!object(parsed.value.root)) throw new Error('Imported screen must contain a root node object');
      // Validate before asking to replace a document. A broken import must not
      // destroy the existing draft; unfinished edits remain supported in-source.
      if (!confirmReplace()) return;
      loadDocument(text, state.dataText);
      showTab('screen');
      notice('Screen imported. Existing sample data is retained.');
    } catch (error) { if (version === importVersion) notice(`Could not import the file: ${error.message}`, true); }
    finally { if (version === importVersion) $('import-file').value = ''; }
  }
  function exportScreen() {
    if (!state.screenText) return;
    const blob = new Blob([state.screenText], {type: 'application/json;charset=utf-8'});
    const url = URL.createObjectURL(blob);
    const link = element('a');
    const name = typeof state.screen?.id === 'string' ? state.screen.id.replace(/[^A-Za-z0-9_.-]/g, '-').slice(0, 100) : 'screen';
    link.href = url;
    link.download = `${name || 'screen'}.json`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notice(state.screenError ? 'Exported the exact JSON draft, including its current errors.' : 'Exported screen JSON. Sample data stays in the browser workspace.');
  }
  function formatJSON(kind) {
    const field = kind === 'screen' ? 'screenText' : 'dataText';
    try {
      const parsed = parseSource(state[field], kind === 'screen' ? 'Screen' : 'Data');
      if (!parsed.precise) throw new Error('Formatting is disabled for large numbers to avoid rounding; the original source is preserved.');
      const formatted = pretty(parsed.value);
      if (formatted === state[field]) return;
      historyBefore(); state[field] = formatted; refresh(true);
    } catch (error) { notice(error.message, true); }
  }
  function restore() {
    try {
      const text = localStorage.getItem(storageKey);
      if (!text) return false;
      const saved = JSON.parse(text);
      if (saved.version !== 1 || typeof saved.screenText !== 'string' || typeof saved.dataText !== 'string') throw new Error('Unrecognized draft format');
      if (bytes(saved.screenText) > maxBytes || bytes(saved.dataText) > maxBytes) throw new Error('Saved draft exceeds the editor limit');
      state.screenText = saved.screenText;
      state.dataText = saved.dataText;
      state.selection = Array.isArray(saved.selection) && saved.selection.every(key => typeof key === 'string' || Number.isInteger(key)) ? saved.selection : ['root'];
      state.baseline = object(saved.baseline) && typeof saved.baseline.screenText === 'string' && typeof saved.baseline.dataText === 'string' ? saved.baseline : {screenText: '', dataText: ''};
      state.initialized = true;
      if (object(saved.settings)) {
        const settings = saved.settings;
        if (['dynamic', 'static'].includes(settings.profile)) $('compression-profile').value = settings.profile;
        if (['smallest', 'preference'].includes(settings.strategy)) $('compression-strategy').value = settings.strategy;
        for (const [id, key, max] of [['min-bytes', 'minBytes', 2097152], ['min-savings-bytes', 'minSavingsBytes', 2097152], ['min-savings-percent', 'minSavingsPercent', 100]]) {
          if (Number.isInteger(settings[key]) && settings[key] >= 0 && settings[key] <= max) $(id).value = settings[key];
        }
      }
      notice('Restored your browser draft, including any unfinished JSON edits.');
      refresh(true);
      if (state.screenError || state.dataError) showTab(state.screenError ? 'screen' : 'data');
      return true;
    } catch (error) {
      notice(`The saved browser draft could not be restored: ${error.message}. This session can still be edited and exported.`, true);
      return false;
    }
  }

  function refreshPreviewTheme() { if (state.initialized) schedulePreview(true); }

  let searchTimer;
  document.addEventListener('ely:theme-change', refreshPreviewTheme);
  $('component-search').addEventListener('input', () => {
    clearTimeout(searchTimer);
    ++state.searchVersion;
    state.searchController?.abort();
    searchTimer = setTimeout(() => searchCatalogue($('component-search').value.trim()), 160);
  });
  $('insert-target').addEventListener('change', () => { $('add-component').disabled = !editable() || !$('insert-target').value || !state.chosen; });
  $('add-component').addEventListener('click', addComponent);
  $('copy-component').addEventListener('click', async () => {
    if (!state.chosen) return;
    try { await navigator.clipboard.writeText(pretty(templateFor(state.chosen))); notice('Component JSON copied.'); }
    catch { notice('Clipboard access is unavailable. Select and copy the insertion template below.'); $('component-snippet').closest('details').open = true; }
  });
  $('node-up').addEventListener('click', () => moveNode(-1));
  $('node-down').addEventListener('click', () => moveNode(1));
  $('node-duplicate').addEventListener('click', duplicateNode);
  $('node-delete').addEventListener('click', deleteNode);
  $('undo').addEventListener('click', () => historyStep('undo'));
  $('redo').addEventListener('click', () => historyStep('redo'));
  for (const name of ['properties', 'screen', 'data']) {
    $(`tab-${name}`).addEventListener('click', () => showTab(name));
    $(`tab-${name}`).addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const names = ['properties', 'screen', 'data'];
      const index = event.key === 'Home' ? 0 : event.key === 'End' ? 2 : (names.indexOf(name) + (event.key === 'ArrowRight' ? 1 : 2)) % 3;
      showTab(names[index]); $(`tab-${names[index]}`).focus();
    });
  }
  $('edit-node-json').addEventListener('click', () => showTab('screen', true));
  for (const kind of ['screen', 'data']) {
    $(`${kind}-editor`).addEventListener('input', event => {
      const field = kind === 'screen' ? 'screenText' : 'dataText';
      if (state[field] === event.target.value) return;
      historyBefore(kind);
      state[field] = event.target.value;
      state.initialized = true;
      refresh();
    });
    $(`${kind}-editor`).addEventListener('keydown', event => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') { event.preventDefault(); schedulePreview(true); }
    });
  }
  $('format-json').addEventListener('click', () => formatJSON('screen'));
  $('format-data').addEventListener('click', () => formatJSON('data'));
  $('load-example').addEventListener('click', () => {
    const example = state.examples.find(item => item.id === $('example-select').value);
    if (example && confirmReplace()) loadDocument(pretty(example.screen), pretty(example.data || {}));
  });
  $('import-screen').addEventListener('click', () => $('import-file').click());
  $('import-file').addEventListener('change', event => importFile(event.target.files[0]));
  $('export-screen').addEventListener('click', exportScreen);
  for (const id of ['compression-profile', 'compression-strategy', 'min-bytes', 'min-savings-bytes', 'min-savings-percent']) $(id).addEventListener('change', () => { persist(); schedulePreview(); });
  for (const width of ['desktop', 'mobile']) $(`viewport-${width}`).addEventListener('click', () => {
    const mobile = width === 'mobile';
    $('preview-stage').classList.toggle('mobile', mobile);
    $('viewport-label').textContent = mobile ? '390 px mobile' : 'Responsive';
    for (const name of ['desktop', 'mobile']) {
      $(`viewport-${name}`).classList.toggle('active', width === name);
      $(`viewport-${name}`).setAttribute('aria-pressed', String(width === name));
    }
  });
  document.addEventListener('keydown', event => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.target.isContentEditable;
    if (!typing && event.key === '/' && !event.ctrlKey && !event.metaKey && !event.altKey) { event.preventDefault(); $('component-search').focus(); }
    if (!typing && (event.ctrlKey || event.metaKey) && !event.altKey && ['z', 'y'].includes(event.key.toLowerCase())) {
      event.preventDefault();
      historyStep(event.shiftKey || event.key.toLowerCase() === 'y' ? 'redo' : 'undo');
    }
  });
  window.addEventListener('beforeunload', event => {
    if (state.initialized && dirty() && !state.saved) { event.preventDefault(); event.returnValue = ''; }
  });
  restore();
  searchCatalogue();
  chooseComponent('text');
  loadExamples();
})();
