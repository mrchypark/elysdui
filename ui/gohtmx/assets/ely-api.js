const families = new Map();
const mounted = new Map();
// Track host-only bindings too: a family may be loaded after mount().
const hostBindings = new Map();
const swapContexts = new WeakMap();
const pendingSwaps = new Map();
// A removed mounted entry can still own disposers that touch the live subtree.
const stopping = new Map();

function dispose(root, cleanup) {
  try { cleanup(); }
  catch (error) {
    root.dispatchEvent(new CustomEvent('ely:error', { bubbles: true, detail: { id: root.id, error } }));
  }
}

// Stop before HTMX mutates descendants: family cleanup may need the old DOM.
// Retained roots keep their host handlers, but never an in-flight old result.
function stop(root) {
  hostBindings.get(root)?.invalidate();
  const cleanups = mounted.get(root);
  if (!cleanups) return;
  const teardown = { starts: new Set() };
  stopping.set(root, teardown);
  mounted.delete(root);
  try {
    root.dispatchEvent(new CustomEvent('ely:cleanup'));
    cleanups.forEach(cleanup => dispose(root, cleanup));
  } finally {
    if (!mounted.has(root)) delete root.dataset.elyReady;
    // Only this teardown may release its barrier. A reentrant stop with no
    // mounted generation must not release it or run the queued starts.
    if (stopping.get(root) === teardown) {
      stopping.delete(root);
      for (const scope of teardown.starts) {
        if (scope === document || scope.isConnected) start(scope);
      }
    }
  }
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

function overlaps(a, b) {
  return a === b || a.contains(b) || b.contains(a);
}

function deferStart(root, scope) {
  let deferred = false;
  for (const [owner, teardown] of stopping) {
    if (!overlaps(owner, root)) continue;
    teardown.starts.add(scope);
    deferred = true;
  }
  return deferred;
}

function start(scope = document) {
  const roots = [...scope.querySelectorAll('[data-ely-family]')];
  if (scope instanceof Element && scope.matches('[data-ely-family]')) roots.unshift(scope);
  roots.forEach(root => {
    // Re-scan the requested scope after all overlapping old disposers finish.
    // Other roots remain synchronous; host binding in mount() is immediate.
    if (deferStart(root, scope)) return;
    if (mounted.has(root) || [...pendingSwaps.keys()].some(owner => overlaps(owner, root))) return;
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
      // The menu family commits checked state and closes before invoking hosts.
      if (button.dataset.interactionMenuAction !== undefined) return;
      // CommandPalette owns selection, native close, and owner revalidation.
      if (button.dataset.interactionPaletteAction !== undefined) return;
      // ActionSheet owns item dispatch and native dialog close.
      if (button.dataset.interactionSheetAction !== undefined) return;
      // Forms owns non-submit action buttons, including composite input values.
      if (root.dataset.elyFamily === 'forms' && button.tagName === 'BUTTON' && button.type !== 'submit') return;
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
      // Composite editors commit through their hidden value control; combobox search changes only filter locally.
      if (!event.target.name && event.target.matches('[data-ui-pin-slot],[data-ui-tag-entry],input[data-ui-combobox-input]')) return;
      // SignaturePad's unnamed textarea is an editor for its named hidden value,
      // not a second host field. Keep its native change event bubbling intact.
      const signature = event.target.closest('[data-ui-component="signature-pad"]');
      if (!event.target.name && event.target.tagName === 'TEXTAREA' && belongs(root, signature) && signature.querySelector('textarea') === event.target) return;
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
    // Keep function identity after stop too: a reentrant initializer can return
    // an already-disposed function after a newer mount has taken ownership.
    const registeredCleanups = new Set();
    const registerCleanup = cleanup => {
      if (typeof cleanup !== 'function' || registeredCleanups.has(cleanup)) return;
      registeredCleanups.add(cleanup);
      if (mounted.get(root) === cleanups) cleanups.push(cleanup);
      else dispose(root, cleanup);
    };
    // Internal family context: neither map nor a replacement host callback is
    // exposed. Captures include an absent binding and this exact initializer.
    const ownerContext = Object.freeze({captureOwner: () => {
      const binding = hostBindings.get(root);
      return () => root.isConnected && mounted.get(root) === cleanups && hostBindings.get(root) === binding;
    }});
    try {
      registerCleanup(initialize(root, registerCleanup, ownerContext));
      if (mounted.get(root) === cleanups) root.dataset.elyReady = 'true';
    } catch (error) {
      if (mounted.get(root) !== cleanups) return;
      root.dispatchEvent(new CustomEvent('ely:error', { bubbles: true, detail: { id: root.id, error } }));
      if (mounted.get(root) === cleanups) root.dataset.elyReady = 'error';
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

const depth = element => {
  let value = 0;
  for (let parent = element.parentElement; parent; parent = parent.parentElement) value++;
  return value;
};
const teardownTargets = (targets, context) => {
  const affected = new Set();
  for (const target of targets) {
    if (!(target instanceof Element)) continue;
    const owner = target.closest('[data-ely-family]');
    if (owner) affected.add(owner);
    target.querySelectorAll('[data-ely-family]').forEach(root => affected.add(root));
  }
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
  const ordered = [...affected].sort((a, b) => depth(b) - depth(a));
  ordered.forEach(stop);
};
document.addEventListener('DOMContentLoaded', () => start());
document.addEventListener('htmx:before:swap', event => {
  // Bundled HTMX exposes the actual main and OOB targets in tasks. The event
  // target is the request source, which need not be the swapped element.
  const targets = [];
  for (const task of event.detail?.tasks || []) {
    const target = typeof task.target === 'string' ? document.querySelector(task.target) : task.target;
    const style = typeof task.swapSpec === 'string' ? task.swapSpec.split(/\s+/)[0] : task.swapSpec?.style;
    if (!(target instanceof Element) || !['innerHTML', 'outerHTML', 'outerSync', 'textContent', 'delete'].includes(style)) continue;
    targets.push(target);
  }
  // A swap can be delayed or await a view transition. Unrelated startup/swap
  // notifications must not rebuild cached references until this swap completes.
  teardownTargets(targets, event?.detail?.ctx);
});
const beforeLegacySwap = event => {
  const swapStatus = event.detail?.xhr?.status ?? 0;
  const swapTarget = event.detail?.target || event.target;
  const requestElt = event.detail?.requestConfig?.elt || event.detail?.elt;
  if (
    swapStatus >= 400 &&
    (swapTarget?.closest?.('[data-ely-swap-errors="true"]') ||
      requestElt?.closest?.('[data-ely-swap-errors="true"]'))
  ) {
    event.detail.shouldSwap = true;
    if ('isError' in event.detail) event.detail.isError = false;
  }
  if (event.detail?.shouldSwap === false || event.defaultPrevented) return;
  const target = event.detail?.target || event.target;
  const context = event.detail?.xhr || target;
  teardownTargets([target], context);
  if (typeof queueMicrotask === 'function') {
    queueMicrotask(() => {
      if (event.detail?.shouldSwap === false || event.defaultPrevented) {
        releaseContext(context);
        prune();
        start();
      }
    });
  }
};
document.addEventListener('htmx:beforeSwap', beforeLegacySwap);
document.addEventListener('htmx:oobBeforeSwap', beforeLegacySwap);
const releaseContext = context => {
  if (!context || !swapContexts.has(context)) return;
  for (const root of swapContexts.get(context) || []) {
    const pending = pendingSwaps.get(root);
    pending?.delete(context);
    if (!pending?.size) pendingSwaps.delete(root);
  }
  swapContexts.delete(context);
};
const restart = event => {
  releaseContext(event?.detail?.ctx);
  releaseContext(event?.detail?.xhr);
  releaseContext(event?.detail?.target);
  releaseContext(event?.target);
  prune();
  start();
};
document.addEventListener('htmx:after:swap', restart);
// Also restore a controller if a later listener cancelled a prepared swap.
document.addEventListener('htmx:finally:swap', restart);
document.addEventListener('htmx:afterSwap', restart);
document.addEventListener('htmx:oobAfterSwap', restart);
document.addEventListener('htmx:afterSettle', restart);
document.addEventListener('htmx:swapError', restart);
document.addEventListener('htmx:sendError', restart);
document.addEventListener('htmx:afterRequest', restart);
new MutationObserver((records = []) => {
  prune();
  if (!Array.isArray(records)) return;
  for (const record of records) {
    for (const node of record.addedNodes || []) {
      if (node instanceof Element) globalThis.__elyObserveLiveNode?.(record.target, node);
    }
  }
  if (pendingSwaps.size > 0) return;
  for (const record of records) {
    for (const node of record.addedNodes || []) {
      if (node instanceof Element) start(node);
    }
  }
}).observe(document.documentElement, { childList: true, subtree: true });

if (!globalThis.__elyDialogTriggers) {
  globalThis.__elyDialogTriggers = true;
  const dialogOpeners = new WeakMap();
  const closingDialogs = new WeakMap();
  const supportsDiscreteTopLayer = () =>
    typeof CSS !== 'undefined' &&
    typeof CSS.supports === 'function' &&
    CSS.supports('overlay', 'auto') &&
    CSS.supports('transition-behavior', 'allow-discrete');
  const isControlDisabled = element =>
    !element ||
    element.disabled ||
    element.getAttribute('aria-disabled') === 'true' ||
    Boolean(element.closest?.('[data-ely-disabled="true"], fieldset:disabled'));
  const clearClosing = dialog => {
    const state = closingDialogs.get(dialog);
    if (state) {
      clearTimeout(state.timer);
      closingDialogs.delete(dialog);
    }
    dialog?.removeAttribute?.('data-ely-closing');
  };
  const openModalDialog = (dialog, opener) => {
    if (!dialog || typeof dialog.showModal !== 'function') return;
    clearClosing(dialog);
    if (opener) dialogOpeners.set(dialog, opener);
    if (!dialog.open) dialog.showModal();
    (
      dialog.querySelector('[autofocus]:not(:disabled)') ||
      dialog.querySelector('input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled)')
    )?.focus?.();
  };
  const animationTimeoutMs = animations => {
    let maxMs = 0;
    for (const animation of animations) {
      const timing = animation.effect?.getComputedTiming?.();
      if (!timing) continue;
      const delay = Number(timing.delay) || 0;
      const duration = Number(timing.activeDuration);
      if (Number.isFinite(duration)) maxMs = Math.max(maxMs, delay + duration);
    }
    return Math.min(Math.max(maxMs + 50, 350), 2000);
  };
  const closeModalDialog = dialog => {
    if (!dialog || !dialog.open || typeof dialog.close !== 'function') return;
    if (supportsDiscreteTopLayer()) {
      clearClosing(dialog);
      dialog.close();
      return;
    }
    if (closingDialogs.has(dialog)) return;
    dialog.setAttribute('data-ely-closing', '');
    const animations =
      typeof dialog.getAnimations === 'function' ? dialog.getAnimations({ subtree: true }) : [];
    if (!animations.length) {
      clearClosing(dialog);
      if (dialog.open) dialog.close();
      return;
    }
    const token = Symbol('ely-dialog-close');
    const finish = () => {
      if (closingDialogs.get(dialog)?.token !== token) return;
      clearClosing(dialog);
      if (dialog.open) dialog.close();
    };
    const timer = setTimeout(finish, animationTimeoutMs(animations));
    closingDialogs.set(dialog, { token, timer });
    Promise.allSettled(animations.map(animation => animation.finished)).then(finish);
  };
  globalThis.__elyCloseDialog = closeModalDialog;
  document.addEventListener('click', event => {
    const target = event.target instanceof Element ? event.target : null;
    if (!target) return;
    const opener = target.closest('[data-ely-dialog-open]');
    if (opener && !isControlDisabled(opener)) {
      if (opener.tagName === 'A') event.preventDefault();
      const id = opener.getAttribute('data-ely-dialog-open');
      const dialog = id ? document.getElementById(id) : null;
      if (dialog?.tagName === 'DIALOG') openModalDialog(dialog, opener);
      return;
    }
    const closer = target.closest('[data-ely-dialog-close]');
    if (closer && !isControlDisabled(closer)) {
      if (closer.tagName === 'A') event.preventDefault();
      const id = closer.getAttribute('data-ely-dialog-close');
      const dialog = id ? document.getElementById(id) : closer.closest('dialog');
      if (dialog?.tagName === 'DIALOG') closeModalDialog(dialog);
    }
  });
  document.addEventListener(
    'cancel',
    event => {
      const dialog = event.target;
      if (!(dialog instanceof Element) || dialog.tagName !== 'DIALOG' || !dialog.open) return;
      if (!supportsDiscreteTopLayer()) {
        event.preventDefault();
        closeModalDialog(dialog);
      }
    },
    true,
  );
  document.addEventListener(
    'close',
    event => {
      const dialog = event.target;
      if (!(dialog instanceof Element) || dialog.tagName !== 'DIALOG') return;
      clearClosing(dialog);
      const opener = dialogOpeners.get(dialog);
      if (opener?.isConnected && !isControlDisabled(opener)) opener.focus?.();
    },
    true,
  );
}

if (!globalThis.__elyAsyncForms) {
  globalThis.__elyAsyncForms = true;
  const sameOriginUrl = value => {
    try {
      const url = new URL(value || '', globalThis.location?.href || 'http://localhost');
      return !globalThis.location?.origin || url.origin === globalThis.location.origin ? url : null;
    } catch {
      return null;
    }
  };
  const setStatus = (scope, message) => {
    const out = scope?.querySelector?.('[data-ely-status]') || scope?.closest?.('[data-ely-family]')?.querySelector?.('[data-ely-status]');
    if (!out) return;
    out.textContent = message || '';
    if ('hidden' in out) out.hidden = !message;
  };
  const resolveProgress = source => {
    const sel = source?.closest?.('[data-ely-upload-progress]')?.getAttribute?.('data-ely-upload-progress');
    if (!sel) return null;
    return sel.startsWith('#') ? document.getElementById(sel.slice(1)) : document.querySelector?.(sel) || null;
  };
  const updateProgress = (bar, loaded, total) => {
    if (!bar) return;
    bar.hidden = false;
    if (total > 0) {
      bar.max = total;
      bar.value = loaded;
    } else {
      bar.removeAttribute?.('value');
    }
  };
  const hideProgress = bar => {
    if (!bar) return;
    bar.hidden = true;
    bar.value = 0;
  };
  const validateMaxBytes = scope => {
    const inputs = scope?.matches?.('input[type="file"]') ? [scope] : [...(scope?.querySelectorAll?.('input[type="file"]') || [])];
    for (const input of inputs) {
      const ownerForm = input.form || input.closest?.('form');
      const rawLimit =
        input.getAttribute('data-ely-max-bytes') ||
        scope?.getAttribute?.('data-ely-max-bytes') ||
        ownerForm?.getAttribute?.('data-ely-max-bytes');
      const maxBytes = Number(rawLimit);
      if (!Number.isFinite(maxBytes) || maxBytes <= 0) continue;
      for (const file of input.files || []) {
        if (file.size === 0 || file.size > maxBytes) {
          const msg =
            input.getAttribute('data-ely-max-bytes-error') ||
            scope?.getAttribute?.('data-ely-max-bytes-error') ||
            ownerForm?.getAttribute?.('data-ely-max-bytes-error') ||
            (file.size === 0 ? 'Selected file is empty.' : 'File exceeds maximum allowed size.');
          setStatus(ownerForm || scope, msg);
          return false;
        }
      }
    }
    return true;
  };
  const completeAsyncSuccess = form => {
    setStatus(form, '');
    form.querySelectorAll?.('[data-ely-clear-on-submit]').forEach(el => {
      if ('value' in el) el.value = '';
    });
    const quote = form.querySelector?.('[data-ely-reply-quote]');
    if (quote) quote.hidden = true;
    const replyTo = form.querySelector?.('[data-ely-reply-to]');
    if (replyTo) replyTo.value = '';
    if (form.dataset) delete form.dataset.hasQuote;
    const dialog = form.closest?.('dialog');
    if (dialog?.open) {
      if (typeof globalThis.__elyCloseDialog === 'function') globalThis.__elyCloseDialog(dialog);
      else dialog.close?.();
    }
    const pop = form.closest?.('[popover]');
    if (pop && typeof pop.hidePopover === 'function') {
      try { pop.hidePopover(); } catch {}
    }
  };
  document.addEventListener('change', event => {
    const input = event.target;
    if (!(input instanceof Element) || !input.matches?.('input[type="file"][data-ely-auto-submit]')) return;
    const form = input.form || input.closest?.('form');
    if (!form) return;
    if (!validateMaxBytes(input)) {
      input.value = '';
      return;
    }
    if (!input.files?.length) return;
    if (typeof form.requestSubmit === 'function') form.requestSubmit();
    else form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    input.value = '';
  });
  document.addEventListener('submit', async event => {
    const form = event.target;
    if (!(form instanceof Element) || !form.hasAttribute?.('data-ely-async-form')) return;
    if (!validateMaxBytes(form)) {
      event.preventDefault();
      return;
    }
    event.preventDefault();
    const action = form.getAttribute('action') || form.getAttribute('hx-post') || globalThis.location?.href || '';
    const url = sameOriginUrl(action);
    if (!url) return;
    const method = (form.getAttribute('method') || 'POST').toUpperCase();
    const body = new FormData(form);
    const bar = resolveProgress(form);
    const errorText = form.getAttribute('data-ely-error-message') || 'Request failed.';
    if (bar && typeof globalThis.XMLHttpRequest === 'function') {
      const xhr = new globalThis.XMLHttpRequest();
      xhr.open(method, url.toString());
      xhr.upload?.addEventListener?.('progress', e => {
        if (e.lengthComputable) updateProgress(bar, e.loaded, e.total);
      });
      xhr.addEventListener('load', () => {
        hideProgress(bar);
        if (xhr.status >= 200 && xhr.status < 300) completeAsyncSuccess(form);
        else setStatus(form, errorText);
      });
      xhr.addEventListener('error', () => {
        hideProgress(bar);
        setStatus(form, errorText);
      });
      xhr.send(body);
      return;
    }
    try {
      const response = await fetch(url.toString(), { method, body });
      if (response.ok) completeAsyncSuccess(form);
      else setStatus(form, errorText);
    } catch {
      setStatus(form, errorText);
    }
  });
  document.addEventListener('htmx:xhr:progress', event => {
    const bar = resolveProgress(event.detail?.elt || event.target);
    if (bar && event.detail?.lengthComputable) updateProgress(bar, event.detail.loaded, event.detail.total);
  });
  const finishHtmxProgress = event => {
    hideProgress(resolveProgress(event.detail?.elt || event.target));
  };
  document.addEventListener('htmx:afterRequest', finishHtmxProgress);
  document.addEventListener('htmx:after:request', finishHtmxProgress);
}

if (!globalThis.__elyLiveNotifier) {
  globalThis.__elyLiveNotifier = true;
  let unreadCount = 0;
  let baseTitle = null;
  let audioCtx = null;
  const unlockAudio = () => {
    const Ctor = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!Ctor) return;
    if (!audioCtx) {
      try { audioCtx = new Ctor(); } catch { return; }
    }
    if (audioCtx.state === 'suspended') audioCtx.resume?.().catch?.(() => {});
  };
  const playChime = () => {
    if (!audioCtx) unlockAudio();
    if (!audioCtx || audioCtx.state !== 'running') return;
    try {
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, audioCtx.currentTime);
      gain.gain.setValueAtTime(0.04, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.14);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.15);
    } catch {}
  };
  const syncToggle = button => {
    if (!button) return;
    const supported = 'Notification' in globalThis;
    if (!supported) {
      button.disabled = true;
      button.setAttribute('aria-pressed', 'false');
      return;
    }
    const granted = globalThis.Notification.permission === 'granted';
    button.setAttribute('aria-pressed', String(granted));
    const onLabel = button.getAttribute('data-ely-notify-on-label');
    const offLabel = button.getAttribute('data-ely-notify-off-label');
    if (granted && onLabel) button.textContent = onLabel;
    else if (!granted && offLabel) button.textContent = offLabel;
  };
  const syncAllToggles = () => {
    document.querySelectorAll?.('[data-ely-notify-toggle]')?.forEach?.(syncToggle);
  };
  const resetUnread = () => {
    if (unreadCount === 0) return;
    unreadCount = 0;
    if (baseTitle !== null) document.title = baseTitle;
  };
  document.addEventListener('pointerdown', unlockAudio, { once: true, capture: true });
  document.addEventListener('keydown', unlockAudio, { once: true, capture: true });
  document.addEventListener('focus', resetUnread);
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) resetUnread();
  });
  document.addEventListener('click', async event => {
    const toggle = event.target instanceof Element ? event.target.closest?.('[data-ely-notify-toggle]') : null;
    if (!toggle || toggle.disabled || !('Notification' in globalThis)) return;
    unlockAudio();
    if (globalThis.Notification.permission === 'default') {
      try { await globalThis.Notification.requestPermission(); } catch {}
    }
    syncAllToggles();
  });
  const notifyForNode = (feed, node) => {
    if (!(node instanceof Element) || node.getAttribute('data-ely-notify') !== 'true') return;
    const isBackground = Boolean(document.hidden) || (typeof document.hasFocus === 'function' && !document.hasFocus());
    if (!isBackground) return;
    if (baseTitle === null) baseTitle = document.title || '';
    unreadCount += 1;
    document.title = `(${unreadCount}) ${baseTitle}`;
    if ('Notification' in globalThis && globalThis.Notification.permission === 'granted') {
      const title = node.getAttribute('data-ely-notify-title') || feed.getAttribute('data-ely-notify-title') || baseTitle || 'New update';
      const body = node.getAttribute('data-ely-notify-body') || node.textContent?.trim().slice(0, 120) || '';
      try { new globalThis.Notification(title, { body }); } catch {}
    }
    if (feed.getAttribute('data-ely-notify-sound') === 'true' || node.getAttribute('data-ely-notify-sound') === 'true') playChime();
  };
  globalThis.__elyObserveLiveNode = (target, node) => {
    if (node.matches?.('[data-ely-notify-toggle]')) syncToggle(node);
    node.querySelectorAll?.('[data-ely-notify-toggle]')?.forEach?.(syncToggle);
    const feed = node.parentElement?.closest?.('[data-ely-notify-feed]') || target?.closest?.('[data-ely-notify-feed]');
    if (feed) notifyForNode(feed, node);
  };
  document.addEventListener('DOMContentLoaded', syncAllToggles);
  syncAllToggles();
}
