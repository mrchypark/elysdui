const families = new Map();
const mounted = new Map();
// Track host-only bindings too: a family may be loaded after mount().
const hostBindings = new Map();
const swapContexts = new WeakMap();
const pendingSwaps = new Map();

// Stop before HTMX mutates descendants: family cleanup may need the old DOM.
// Retained roots keep their host handlers, but never an in-flight old result.
function stop(root) {
  hostBindings.get(root)?.invalidate();
  const cleanups = mounted.get(root);
  if (!cleanups) return;
  mounted.delete(root);
  root.dispatchEvent(new CustomEvent('ely:cleanup'));
  cleanups.forEach(cleanup => cleanup());
  delete root.dataset.elyReady;
}

function prune() {
  for (const root of mounted.keys()) if (!root.isConnected) stop(root);
  for (const [root, cleanup] of hostBindings) if (!root.isConnected) cleanup();
}

export function emit(root, action, detail = {}) {
  if (root.dataset.elyDisabled === 'true') return false;
  return root.dispatchEvent(new CustomEvent('ely:action', {
    bubbles: true, cancelable: true,
    detail: { ...detail, id: root.id, component: root.dataset.elyComponent, action },
  }));
}

function belongs(root, target) {
  return target instanceof Element && target.closest('[data-ely-family]') === root;
}

function start(scope = document) {
  const roots = [...scope.querySelectorAll('[data-ely-family]')];
  if (scope instanceof Element && scope.matches('[data-ely-family]')) roots.unshift(scope);
  roots.forEach(root => {
    if (mounted.has(root) || pendingSwaps.has(root)) return;
    const initialize = families.get(root.dataset.elyFamily);
    if (!initialize) return;
    const cleanups = [];
    const blockDisabled = event => {
      if (root.dataset.elyDisabled !== 'true' || !belongs(root, event.target)) return;
      if (event.type !== 'keydown' || event.key !== 'Tab') event.preventDefault();
      event.stopImmediatePropagation();
    };
    const disabledEvents = ['click', 'pointerdown', 'keydown', 'input', 'change', 'submit'];
    disabledEvents.forEach(type => root.addEventListener(type, blockDisabled, true));
    cleanups.push(() => disabledEvents.forEach(type => root.removeEventListener(type, blockDisabled, true)));
    const click = event => {
      if (!belongs(root, event.target)) return;
      const button = event.target.closest('[data-ely-action]');
      if (!button || button.disabled || button.getAttribute('aria-disabled') === 'true') return;
      // Clipboard controls emit once, only after the browser confirms the write.
      if (button.dataset.interactionCopy !== undefined) return;
      if (button.type === 'submit' && button.form?.matches('[data-ely-submit]')) return;
      const formData = button.form ? new FormData(button.form) : null;
      const accepted = emit(root, button.dataset.elyAction, { value: button.value || button.dataset.value || '', formData, values: formData ? [...formData] : [] });
      if (!accepted) event.preventDefault();
    };
    const submit = event => {
      const form = event.target;
      if (!belongs(root, form) || !form.matches('[data-ely-submit]')) return;
      event.preventDefault();
      if (!form.reportValidity()) return;
      const formData = new FormData(form);
      emit(root, form.dataset.elySubmit, { formData, values: [...formData], submitter: event.submitter?.value || '' });
    };
    const change = event => {
      if (!belongs(root, event.target) || !event.target.matches('input,textarea,select')) return;
      // Composite editors commit through their named hidden value control.
      if (!event.target.name && event.target.matches('[data-ui-pin-slot],[data-ui-tag-entry]')) return;
      root.dispatchEvent(new CustomEvent('ely:change', { bubbles: true, detail: {
        id: root.id, component: root.dataset.elyComponent, name: event.target.name,
        value: event.target.value, checked: event.target.checked, type: event.target.type,
      } }));
    };
    root.addEventListener('click', click);
    root.addEventListener('submit', submit);
    root.addEventListener('change', change);
    cleanups.push(() => { root.removeEventListener('click', click); root.removeEventListener('submit', submit); root.removeEventListener('change', change); });
    mounted.set(root, cleanups);
    try {
      const cleanup = initialize(root);
      if (typeof cleanup === 'function') cleanups.push(cleanup);
      root.dataset.elyReady = 'true';
    } catch (error) {
      root.dispatchEvent(new CustomEvent('ely:error', { bubbles: true, detail: { id: root.id, error } }));
      root.dataset.elyReady = 'error';
    }
  });
}

export function register(family, initialize) {
  if (families.has(family)) throw new Error(`Duplicate Ely family: ${family}`);
  families.set(family, initialize);
  start();
}

// Return a cleanup function when a host binds provider operations to an instance.
export function mount(root, handlers = {}) {
  if (!root?.matches('[data-ely-family]')) throw new Error('Ely mount requires a component root');
  hostBindings.get(root)?.();
  const pending = new Map();
  const action = async event => {
    if (event.target !== root) return;
    const callback = handlers.actions?.[event.detail.action] || handlers.onAction;
    if (!callback) return;
    const operation = event.detail.action;
    const revision = Symbol(operation);
    pending.set(operation, revision);
    try {
      const result = await callback(event.detail, root);
      if (pending.get(operation) !== revision || !root.isConnected) return;
      root.dispatchEvent(new CustomEvent('ely:result', { bubbles: true, detail: { ...event.detail, result } }));
    } catch (error) {
      if (pending.get(operation) !== revision || !root.isConnected) return;
      root.dispatchEvent(new CustomEvent('ely:error', { bubbles: true, detail: { id: root.id, action: operation, error } }));
    }
  };
  const change = event => { if (event.target === root) handlers.onChange?.(event.detail, root); };
  root.addEventListener('ely:action', action);
  root.addEventListener('ely:change', change);
  const cleanup = () => { pending.clear(); root.removeEventListener('ely:action', action); root.removeEventListener('ely:change', change); if (hostBindings.get(root) === cleanup) hostBindings.delete(root); };
  cleanup.invalidate = () => pending.clear();
  hostBindings.set(root, cleanup);
  start(root);
  return cleanup;
}

document.addEventListener('DOMContentLoaded', () => start());
document.addEventListener('htmx:before:swap', event => {
  // Bundled HTMX exposes the actual main and OOB targets in tasks. The event
  // target is the request source, which need not be the swapped element.
  const affected = new Set();
  for (const task of event.detail?.tasks || []) {
    const target = typeof task.target === 'string' ? document.querySelector(task.target) : task.target;
    const style = typeof task.swapSpec === 'string' ? task.swapSpec.split(/\s+/)[0] : task.swapSpec?.style;
    if (!(target instanceof Element) || !['innerHTML', 'outerHTML', 'outerSync', 'textContent', 'delete'].includes(style)) continue;
    const owner = target.closest('[data-ely-family]');
    if (owner) affected.add(owner);
    target.querySelectorAll('[data-ely-family]').forEach(root => affected.add(root));
  }
  // A swap can be delayed or await a view transition. Unrelated startup/swap
  // notifications must not rebuild cached references until this swap completes.
  const context = event?.detail?.ctx;
  if (context) {
    const roots = swapContexts.get(context) || new Set();
    affected.forEach(root => {
      roots.add(root);
      if (!pendingSwaps.has(root)) pendingSwaps.set(root, new Set());
      pendingSwaps.get(root).add(context);
    });
    swapContexts.set(context, roots);
  }
  // Children first even when OOB tasks list a nested target before its parent.
  const depth = element => {
    let value = 0;
    for (let parent = element.parentElement; parent; parent = parent.parentElement) value++;
    return value;
  };
  const ordered = [...affected].sort((a, b) => depth(b) - depth(a));
  ordered.forEach(stop);
});
const restart = event => {
  const context = event?.detail?.ctx;
  if (context) {
    for (const root of swapContexts.get(context) || []) {
      const pending = pendingSwaps.get(root);
      pending?.delete(context);
      if (!pending?.size) pendingSwaps.delete(root);
    }
    swapContexts.delete(context);
  }
  prune();
  start();
};
document.addEventListener('htmx:after:swap', restart);
// Also restore a controller if a later listener cancelled a prepared swap.
document.addEventListener('htmx:finally:swap', restart);
new MutationObserver(prune).observe(document.documentElement, { childList: true, subtree: true });
