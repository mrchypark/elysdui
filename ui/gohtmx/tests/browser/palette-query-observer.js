// Test-only observation. No production DOM values, focus, events or ARIA are repaired here.
(() => {
  const clone = value => structuredClone(value);
  const owner = node => node?.closest?.('[data-ely-family]');
  const slot = node => node?.closest?.('#palette-peer') ? 'peer' : node?.closest?.('#palette-primary') ? 'primary' : null;
  window.paletteRoot = (name = 'primary') => document.querySelector(`#palette-${name} [data-ely-family]`);
  window.paletteGeneration = new WeakMap();
  window.paletteLog = {inputs: [], actions: [], changes: [], hosts: [], hostChanges: [], results: [], closes: [], lifecycle: [], bridge: [], errors: [], timeline: []};
  window.palettePhase = null;
  let sequence = 0;
  const record = (key, entry) => { paletteLog[key].push(entry); paletteLog.timeline.push({sequence: ++sequence, kind: key, index: paletteLog[key].length - 1}); };
  window.paletteClear = () => { for (const key of Object.keys(paletteLog)) paletteLog[key] = []; sequence = 0; palettePhase = null; };
  window.paletteState = root => {
    const input = root.querySelector('[data-interaction-palette] input'), list = root.querySelector('[data-interaction-palette-results]'), dialog = root.querySelector('dialog');
    const active = document.activeElement;
    const rows = [...root.querySelectorAll('[data-interaction-palette-option]')].map(row => ({id: row.id || null, role: row.getAttribute('role'), value: row.value, label: row.querySelector('strong').textContent, hidden: row.closest('li').hidden, disabled: row.disabled, selected: row.getAttribute('aria-selected') === 'true'}));
    const controls = input.getAttribute('aria-controls'), activeID = input.getAttribute('aria-activedescendant');
    const controlled = controls && document.getElementById(controls), descendant = activeID && document.getElementById(activeID);
    return {id: root.id, component: root.dataset.elyComponent, ready: root.dataset.elyReady || null, generation: paletteGeneration.get(root) || null,
      openerFocused: active === root.querySelector('[data-interaction-dialog]'), focusedInDialog: Boolean(active && dialog.contains(active)), open: dialog.open, query: input.value, queryName: input.name, focusedInput: active === input, activeTag: active?.tagName || null, activeValue: active?.value ?? null, activeOwner: owner(active)?.id || null,
      selectionStart: input.selectionStart, selectionEnd: input.selectionEnd, rows,
      relationship: {inputID: input.id || null, inputType: input.type, inputRole: input.getAttribute('role') || 'searchbox', controls, activeID, listID: list.id || null, listRole: list.getAttribute('role'), controlledIsList: controlled === list, descendantInList: Boolean(descendant && list.contains(descendant)), descendantInRoot: Boolean(descendant && root.contains(descendant)), descendantRole: descendant?.getAttribute('role') || null, descendantValue: descendant?.value || null, descendantSelected: descendant?.getAttribute('aria-selected') === 'true', descendantVisibleEnabled: Boolean(descendant && !descendant.disabled && !descendant.closest('li')?.hidden), uniqueIDs: new Set([...document.querySelectorAll('[id]')].map(node => node.id)).size === document.querySelectorAll('[id]').length}};
  };
  window.paletteSnapshot = () => ({state: paletteState(paletteRoot()), peer: paletteState(paletteRoot('peer')), log: clone(paletteLog)});
  const payload = detail => ({id: detail.id, component: detail.component, action: detail.action ?? null, value: detail.value ?? null, hasValue: Object.hasOwn(detail, 'value'), formDataKind: detail.formData === null ? 'null' : detail.formData instanceof FormData ? 'FormData' : typeof detail.formData, formData: detail.formData instanceof FormData ? [...detail.formData] : detail.formData ?? null, valuesKind: Array.isArray(detail.values) ? 'array' : typeof detail.values, values: detail.values ?? null, submitter: detail.submitter ?? null});
  const change = detail => ({id: detail.id, component: detail.component, name: detail.name, value: detail.value, selected: detail.selected ?? null, type: detail.type ?? null});
  const fault = event => record('errors', {type: event.type, message: event.message || event.reason?.message || event.detail?.error?.message || String(event.detail?.error || event.reason || '')});
  for (const type of ['error', 'unhandledrejection']) window.addEventListener(type, fault);
  for (const type of ['ely:error', 'htmx:error', 'sdui:error']) document.addEventListener(type, fault);
  for (const type of ['keydown', 'keyup', 'beforeinput', 'input']) document.addEventListener(type, event => {
    if (type === 'keydown' || type === 'keyup') palettePhase = type;
    const root = owner(event.target), field = Boolean(event.target.matches?.('[data-interaction-palette] input'));
    record('inputs', {type, key: event.key ?? null, code: event.code ?? null, data: event.data ?? null, inputType: event.inputType ?? null, trusted: event.isTrusted, targetTag: event.target.tagName, field, slot: slot(event.target), ownerID: root?.id || null, generation: paletteGeneration.get(root) || null, value: event.target.value ?? null, focused: event.target === document.activeElement, connected: event.target.isConnected, selectionStart: field ? event.target.selectionStart : null, selectionEnd: field ? event.target.selectionEnd : null, ctrl: Boolean(event.ctrlKey), alt: Boolean(event.altKey), shift: Boolean(event.shiftKey), meta: Boolean(event.metaKey)});
  }, true);
  document.addEventListener('ely:action', event => record('actions', {...payload(event.detail), slot: slot(event.target), phase: palettePhase, state: paletteState(event.target)}));
  document.addEventListener('ely:change', event => record('changes', {...change(event.detail), slot: slot(event.target)}));
  document.addEventListener('ely:result', event => record('results', {...payload(event.detail), slot: slot(event.target), result: event.detail.result}));
  document.addEventListener('close', event => { const root = owner(event.target); if (root) record('closes', {slot: slot(root), ownerID: root.id, open: event.target.open, trusted: event.isTrusted}); }, true);
  document.addEventListener('sdui:success', event => record('bridge', {action: event.detail.action, target: event.detail.target, status: event.detail.status, connected: event.target.isConnected}));
  for (const type of ['htmx:before:swap', 'htmx:after:swap', 'htmx:finally:swap']) document.addEventListener(type, event => record('lifecycle', {type, tasks: (event.detail?.tasks || []).map(task => ({targetID: task.target?.id || null, style: typeof task.swapSpec === 'string' ? task.swapSpec : task.swapSpec?.style}))}));
  window.paletteBind = async (root, generation = 'original') => {
    const {mount} = await import('/assets/ely-api.js');
    paletteGeneration.set(root, generation);
    mount(root, {
      onAction(detail, node) { record('hosts', {...payload(detail), slot: slot(node), phase: palettePhase, generation, state: paletteState(node)}); return {ok: true, owner: node.id, generation}; },
      onChange(detail, node) { record('hostChanges', {...change(detail), slot: slot(node), generation}); },
    });
  };
})();
