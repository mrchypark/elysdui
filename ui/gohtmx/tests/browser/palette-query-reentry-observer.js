// Passive test observation. No production setters, focus methods, scrolling,
// selection or ARIA are replaced. The sole induced effect is the public swap.
(() => {
  const identities = new WeakMap(); let next = 0, sequence = 0;
  const token = node => node ? (identities.has(node) || identities.set(node, ++next), identities.get(node)) : null;
  const root = () => document.querySelector('#palette-primary [data-ely-family]');
  const field = () => root().querySelector('[data-interaction-filter]');
  const row = (node, owner = root()) => ({token: token(node), id: node.id, value: node.value, role: node.getAttribute('role'), selected: node.getAttribute('aria-selected'), connected: node.isConnected, inOwner: owner.contains(node), inList: owner.querySelector('[data-interaction-palette-results]').contains(node), hidden: Boolean(node.closest('li')?.hidden), disabled: node.disabled});
  const snapshot = (name = 'primary') => {
    const owner = name === 'primary' ? root() : document.querySelector('#palette-peer [data-ely-family]'), query = owner.querySelector('[data-interaction-filter]'), list = owner.querySelector('[data-interaction-palette-results]'), activeID = query.getAttribute('aria-activedescendant');
    const opener = owner.querySelector('[data-interaction-dialog]');
    return {openerToken: token(opener), openerID: opener.id, openerValue: opener.value, ownerToken: token(owner), ownerID: owner.id, ready: owner.dataset.elyReady || null, queryToken: token(query), queryID: query.id, query: query.value, focusedToken: token(document.activeElement), focusedID: document.activeElement?.id ?? null, focusedValue: document.activeElement?.value ?? null, controls: query.getAttribute('aria-controls'), listID: list.id, activeID, activeToken: token(activeID ? document.getElementById(activeID) : null), open: owner.querySelector('dialog').open, rows: [...list.querySelectorAll('[data-interaction-palette-option]')].map(node => row(node, owner)), old: name === 'primary' && window.paletteReentryOld ? row(paletteReentryOld) : null, oldRowToken: name === 'primary' && window.paletteReentryOld ? token(paletteReentryOld.closest('li')) : null};
  };
  const log = window.paletteReentryLog = {events: [], batches: []};
  const record = (phase, details = {}) => { const event = {sequence: ++sequence, phase, ...details, state: snapshot()}; log.events.push(event); return event; };
  for (const type of ['keydown', 'keyup', 'focus']) document.addEventListener(type, event => {
    if (!root()?.contains(event.target)) return;
    record(type, {trusted: event.isTrusted, key: event.key ?? null, targetToken: token(event.target), targetID: event.target.id, targetValue: event.target.value ?? null, targetTag: event.target.tagName, targetConnected: event.target.isConnected, targetFocused: document.activeElement === event.target, ctrl: Boolean(event.ctrlKey), alt: Boolean(event.altKey), shift: Boolean(event.shiftKey), meta: Boolean(event.metaKey)});
  }, true);
  window.paletteReentrySnapshot = snapshot;
  window.paletteReentryPeerSnapshot = () => snapshot('peer');
  window.paletteReentryInstall = () => {
    const owner = root(), query = field(), oldOption = owner.querySelector('[value="option-file"]');
    window.paletteReentryOld = oldOption;
    const known = new Set([query, ...owner.querySelectorAll('[data-interaction-palette-option]')]);
    const batch = (records, reason) => {
      if (!records.length) return;
      for (const mutation of records) {
        if (mutation.target.matches?.('[data-interaction-palette-option]')) known.add(mutation.target);
        for (const node of [...mutation.addedNodes, ...mutation.removedNodes]) {
          if (node.matches?.('[data-interaction-palette-option]')) known.add(node);
          node.querySelectorAll?.('[data-interaction-palette-option]').forEach(option => known.add(option));
        }
      }
      const raw = records.map(mutation => mutation.type === 'attributes'
        ? {type: 'attributes', targetToken: token(mutation.target), attribute: mutation.attributeName, oldValue: mutation.oldValue, finalValue: mutation.target.getAttribute(mutation.attributeName)}
        : {type: 'childList', targetToken: token(mutation.target), added: [...mutation.addedNodes].map(token), removed: [...mutation.removedNodes].map(token)});
      log.batches.push({sequence: ++sequence, reason, records: raw, nodes: [...known].filter(node => node !== query).map(node => row(node)), state: snapshot()});
    };
    const observer = new MutationObserver(records => batch(records, 'observer-callback'));
    observer.observe(owner, {subtree: true, attributes: true, attributeOldValue: true, attributeFilter: ['aria-activedescendant', 'aria-selected'], childList: true});
    window.paletteReentryDrain = reason => batch(observer.takeRecords(), reason);
    window.paletteReentryContext = {sourceElement: document.getElementById('palette-swap'), target: oldOption.closest('li'), text: window.paletteReentryFragment, select: 'li:has(> [data-interaction-palette-option][value="option-file"])', swap: 'outerHTML settle:0'};
    for (const type of ['htmx:before:swap', 'htmx:after:swap', 'htmx:finally:swap']) document.addEventListener(type, event => {
      if (event.detail.ctx !== paletteReentryContext) return;
      record(type, {inFocus: Boolean(window.paletteReentryInFocus), contextTargetSame: event.detail.ctx.target === paletteReentryContext.target, tasks: (event.detail.tasks || []).map(task => ({targetSame: task.target === paletteReentryContext.target, targetToken: token(task.target), style: task.swapSpec.style}))});
    });
    owner.addEventListener('ely:cleanup', () => record('ely:cleanup'));
    document.addEventListener('keydown', event => {
      if (event.key !== 'ArrowDown' || !window.paletteReentryPromise) return;
      // Document bubble runs after the root keydown continuation, before the
      // microtask checkpoint can hide the transient through async remount.
      paletteReentryDrain('native-keydown-return');
      record('arrow-continuation-return', {trusted: event.isTrusted, targetToken: token(event.target)});
    }, {once: true});
    query.addEventListener('focus', event => {
      window.paletteReentryInFocus = true;
      record('query-focus-listener', {trusted: event.isTrusted});
      window.paletteReentryPromise = htmx.swap(paletteReentryContext);
      // Drain the passive queue at this exact native listener return boundary,
      // before the suspended keydown handler can continue its old-option write.
      paletteReentryDrain('native-focus-return');
      record('native-focus-return', {oldRowConnected: paletteReentryContext.target.isConnected, oldRowParent: Boolean(paletteReentryContext.target.parentElement)});
      window.paletteReentryInFocus = false;
    }, {once: true});
    return record('installed');
  };
})();
