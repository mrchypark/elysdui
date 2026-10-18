// Optional SDUI host adapter. Component behavior still belongs to Ely's runtimes.
(() => {
  if (window.__elySDUI) return;

  const events = ['submit', 'click', 'change', 'ely:action', 'ely:change'];
  const pending = new Map();
  const busy = new WeakMap();
  let sequence = 0;
  let destroyed = false;

  // HTMLFormElement named controls can shadow DOM methods (for example a
  // field named "closest" or "getAttribute"). Always use native methods.
  const closest = (node, selector) => Element.prototype.closest.call(node, selector);
  const matches = (node, selector) => Element.prototype.matches.call(node, selector);
  const attr = (node, name) => Element.prototype.getAttribute.call(node, name);
  const hasAttr = (node, name) => Element.prototype.hasAttribute.call(node, name);
  const setAttr = (node, name, value) => Element.prototype.setAttribute.call(node, name, value);
  const removeAttr = (node, name) => Element.prototype.removeAttribute.call(node, name);
  const query = (node, selector) => Element.prototype.querySelector.call(node, selector);
  const all = (node, selector) => [...Element.prototype.querySelectorAll.call(node, selector)];
  const contains = (node, child) => Element.prototype.contains.call(node, child);
  const dispatch = (node, event) => Element.prototype.dispatchEvent.call(node, event);

  const emit = (node, type, detail) => dispatch(node?.isConnected ? node : document,
    new CustomEvent(type, {bubbles: true, detail}));
  const failure = message => new Error(message);
  const requestID = () => window.crypto?.randomUUID?.() ||
    `sdui-${Date.now().toString(36)}-${(++sequence).toString(36)}-${Math.random().toString(36).slice(2)}`;

  function endpointFor(screen) {
    const path = attr(screen, 'data-sdui-endpoint') || '';
    // Keep form values, files and CSRF tokens on this origin, including redirects.
    if (!path.startsWith('/') || path.startsWith('//') || /[\\\x00-\x20\x7f]/.test(path)) {
      throw failure('SDUI requires a local absolute endpoint path');
    }
    const endpoint = new URL(path, window.location.href);
    if (endpoint.origin !== window.location.origin || endpoint.hash) throw failure('Invalid SDUI endpoint');
    return endpoint.href;
  }

  function appendControl(data, control) {
    if (!control?.name || matches(control, ':disabled')) return;
    if (matches(control, 'input[type="checkbox"],input[type="radio"]') && !control.checked) return;
    if (matches(control, 'input[type="file"]')) {
      for (const file of control.files) data.append(control.name, file);
    } else if (matches(control, 'select[multiple]')) {
      for (const option of control.selectedOptions) data.append(control.name, option.value);
    } else if (matches(control, 'input,select,textarea,button')) {
      data.append(control.name, control.value);
    }
  }

  function formValues(event, source, origin) {
    const form = matches(origin, 'form') ? origin : origin.form || closest(origin, 'form') || closest(source, 'form');
    if (form) {
      const button = event.type === 'submit' ? event.submitter :
        event.type === 'click' && closest(origin, 'button,input[type="submit"],input[type="image"]');
      const submitter = button?.form === form && ['submit', 'image'].includes(button.type) ? button : undefined;
      const data = new FormData(form, submitter);
      if (event.type === 'click' && button && !submitter) appendControl(data, button);
      return data;
    }
    const data = new FormData();
    if (event.detail?.formData instanceof FormData) {
      // Copy, rather than mutate, the component's payload. Preserve File entries
      // and repeated field names; JSON/object serialization would lose both.
      for (const [name, value] of event.detail.formData) data.append(name, value);
    } else if (matches(origin, 'input,select,textarea,button')) {
      appendControl(data, origin);
    } else if (typeof event.detail?.name === 'string' && event.detail.name) {
      // Ely emits change from its component root, not the native control. Match
      // successful-control semantics even when that root is outside a form.
      if (['checkbox', 'radio'].includes(event.detail.type) && !event.detail.checked) return data;
      const values = Array.isArray(event.detail.value) ? event.detail.value : [event.detail.value];
      for (const value of values) {
        if (['string', 'number', 'boolean'].includes(typeof value)) data.append(event.detail.name, String(value));
      }
    }
    return data;
  }

  function mayCompress(source, origin) {
    const form = matches(origin, 'form') ? origin : origin.form || closest(origin, 'form') || closest(source, 'form');
    const off = '[data-sdui-request-compression="off"]';
    // Applications with other secrets must opt out on the form or an ancestor.
    // Password forms opt out automatically, including external submit buttons.
    return !closest(origin, off) && !closest(source, off) && !(form && closest(form, off)) &&
      !matches(origin, 'input[type="password"]') && !query(form || source, 'input[type="password"]') &&
      !(form && [...document.querySelectorAll('input[type="password"]')].some(control => control.form === form));
  }

  function requestCompression(screen) {
    const number = (name, fallback, max) => {
      const value = attr(screen, `data-sdui-request-${name}`);
      if (value === null || !/^\d{1,10}$/.test(value)) return fallback;
      const parsed = Number(value);
      return Number.isSafeInteger(parsed) && parsed <= max ? parsed : fallback;
    };
    const configured = attr(screen, 'data-sdui-request-codecs');
    // An explicit empty or unsupported list disables compression. Never silently
    // send a codec the host did not allow, or load third-party codec code.
    const codecs = configured === null ? ['zstd', 'gzip'] :
      [...new Set(configured.slice(0, 256).split(',').map(value => value.trim()))]
        .filter(value => value === 'zstd' || value === 'gzip');
    return {codecs, minBytes: number('min-bytes', 1024, 67108864),
      minSavingsBytes: number('min-savings-bytes', 64, 67108864),
      minSavingsPercent: number('min-savings-percent', 5, 100)};
  }

  function compressedBody(data, signal, screen) {
    // Native progressive enhancement only: uploads retain browser multipart
    // boundaries, and unsupported browsers retain the original FormData.
    // Host-issued tokens need not be HTTP-header-safe. Keep those in the
    // existing multipart flow rather than changing or rejecting the token.
    const policy = requestCompression(screen);
    if (!policy.codecs.length) return null;
    const csrf = data.get('_csrf');
    if (typeof csrf !== 'string' || !/^[\x21-\x7e]+$/.test(csrf)) return null;
    if (typeof window.CompressionStream !== 'function' || typeof window.Blob !== 'function' ||
        typeof window.Response !== 'function' || typeof window.URLSearchParams !== 'function') return null;
    const values = new window.URLSearchParams();
    for (const [name, value] of data) {
      if (typeof value !== 'string') return null;
      // Never place the CSRF secret in the same compression context as input.
      // The server validates X-SDUI-CSRF and restores its internal form value.
      // Match native form submission's line ending normalization.
      if (name !== '_csrf') values.append(name.replace(/\r\n|\r|\n/g, '\r\n'), value.replace(/\r\n|\r|\n/g, '\r\n'));
    }
    const plain = new window.Blob([values.toString()]);
    if (plain.size < policy.minBytes || typeof plain.stream !== 'function') return null;
    return (async () => {
      for (const encoding of policy.codecs) {
        if (signal.aborted) return null;
        try {
          const compressor = new window.CompressionStream(encoding);
          const stream = plain.stream().pipeThrough(compressor, {signal});
          const bytes = await new window.Response(stream).arrayBuffer();
          if (signal.aborted) return null;
          const savings = plain.size - bytes.byteLength;
          if (savings <= 0 || savings < policy.minSavingsBytes ||
              savings * 100 < plain.size * policy.minSavingsPercent) continue;
          return {body: bytes, headers: {
            'Content-Encoding': encoding,
            'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'X-SDUI-CSRF': csrf,
          }};
        } catch {
          // Constructor or streaming failures may vary by browser/format.
          // No network request has happened, so falling back is safe.
        }
      }
      return null;
    })();
  }

  function safeFragment(html, targetID) {
    const template = document.createElement('template');
    template.innerHTML = html;
    const roots = [...template.content.childNodes].filter(node =>
      node.nodeType === 1 || (node.nodeType === 3 && node.textContent.trim()));
    if (roots.length !== 1 || roots[0].nodeType !== 1 ||
        attr(roots[0], 'id') !== targetID || !hasAttr(roots[0], 'data-sdui-region')) {
      throw failure('SDUI response must contain exactly the requested region root');
    }
    const root = roots[0];
    // Reject executable response markup rather than running or relocating it.
    // This is defense in depth; only trusted server renderers may produce HTML.
    function check(scope) {
      for (const node of [scope, ...all(scope, '*')]) {
        const tag = node.localName;
        let inertAnimation = false;
        if (tag === 'script' && attr(node, 'type') === 'application/json' && hasAttr(node, 'data-lottie-animation') && !hasAttr(node, 'src')) {
          if (node.textContent.length > 262144) throw failure('Animation data exceeds limit');
          try { let data = JSON.parse(node.textContent); if (typeof data === 'string') data = JSON.parse(data); inertAnimation = data !== null && typeof data === 'object' && !Array.isArray(data); } catch {}
        }
        if ((tag === 'script' && !inertAnimation) || ['object', 'embed', 'base'].includes(tag) ||
            (tag === 'meta' && hasAttr(node, 'http-equiv'))) {
          throw failure('SDUI response contains executable markup');
        }
        if (tag === 'iframe' && (!hasAttr(node, 'sandbox') ||
            /(?:^|\s)allow-scripts(?:\s|$)/i.test(attr(node, 'sandbox')))) {
          throw failure('SDUI response contains an unsandboxed frame');
        }
        for (const attributeName of Element.prototype.getAttributeNames.call(node)) {
          const name = attributeName.toLowerCase();
          const rawValue = attr(node, attributeName);
          const value = rawValue.replace(/[\x00-\x20\x7f]/g, '');
          const hx = name.replace(/^data-/, '');
          if (/^on/.test(name) || /^hx-on(?::|-|$)/.test(hx) || hx === 'hx-vars' ||
              (hx === 'hx-vals' && /^(?:js|javascript):/i.test(value)) ||
              (hx === 'hx-trigger' && rawValue.includes('[')) ||
              (['href', 'src', 'action', 'formaction', 'xlink:href'].includes(name) && /^(?:javascript|vbscript):/i.test(value))) {
            throw failure('SDUI response contains executable attributes');
          }
        }
        if (tag === 'template') {
          for (const child of node.content.children) check(child);
        }
      }
    }
    check(root);
    // getElementById must remain unambiguous after insertion.
    const ids = new Set([attr(root, 'id')]);
    for (const node of all(root, '[id]')) {
      const id = attr(node, 'id');
      if (!id) continue;
      if (ids.has(id)) throw failure('SDUI response contains duplicate IDs');
      ids.add(id);
      const existing = document.getElementById(id);
      const current = document.getElementById(targetID);
      if (existing && (!current || !contains(current, existing))) throw failure('SDUI response ID conflicts with another region');
    }
    return root;
  }

  function focusedControl(region) {
    const active = document.activeElement;
    if (!active || !contains(region, active)) return null;
    const sameName = [...all(region, '[name]')].filter(node =>
      node.name === active.name && node.tagName === active.tagName && node.type === active.type);
    return {id: active.id, name: active.name, tag: active.tagName, type: active.type, index: sameName.indexOf(active)};
  }

  function restoreFocus(region, previous) {
    if (!previous) return;
    const byID = previous.id && [region, ...all(region, '[id]')].find(node => attr(node, 'id') === previous.id);
    const byName = previous.name && [...all(region, '[name]')].filter(node =>
      node.name === previous.name && node.tagName === previous.tag && node.type === previous.type)[previous.index];
    const control = byID || byName;
    if (control && !matches(control, ':disabled')) control.focus({preventScroll: true});
    // Do not restore .value or checked state: server validation owns new values.
  }

  function release(record) {
    if (busy.get(record.source) === record) {
      busy.delete(record.source);
      if (record.previousBusy === null) removeAttr(record.source, 'aria-busy');
      else setAttr(record.source, 'aria-busy', record.previousBusy);
    }
    if (pending.get(record.targetID) === record) pending.delete(record.targetID);
  }

  function abort(record) {
    record.controller.abort();
    release(record);
  }

  async function send(event, source, origin, screen, binding) {
    const repeated = ['submit', 'click', 'ely:action'].includes(event.type);
    if (repeated && busy.has(source)) return;
    const targetID = binding.target;
    const action = binding.action;
    let record;
    let status = 0;
    try {
      const target = targetID && document.getElementById(targetID);
      if (!action || !(target && hasAttr(target, 'data-sdui-region')) || closest(target, '[data-sdui-screen]') !== screen) {
        throw failure('SDUI action requires a region in the same screen');
      }
      const endpoint = endpointFor(screen);
      const body = formValues(event, source, origin);
      for (const [name, spec] of Object.entries(binding.payload || {})) {
        let value = event.detail;
        for (const token of spec.path.slice(1).split('/')) {
          const key = token.replace(/~1/g, '/').replace(/~0/g, '~');
          if (!value || typeof value !== 'object' || !Object.hasOwn(value, key)) throw failure('Missing event payload field');
          value = value[key];
        }
        const valid = spec.type === 'string' ? typeof value === 'string' :
          spec.type === 'boolean' ? typeof value === 'boolean' :
          spec.type === 'integer' ? Number.isSafeInteger(value) :
          spec.type === 'number' ? typeof value === 'number' && Number.isFinite(value) :
          spec.type === 'array' ? Array.isArray(value) :
          spec.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value) : false;
        if (!valid) throw failure('Invalid event payload type');
        const encoded = typeof value === 'object' ? JSON.stringify(value) : String(value);
        if (encoded.length > 16384) throw failure('Event payload exceeds limit');
        body.set(name, encoded);
      }
      const csrf = attr(screen, 'data-sdui-csrf') || body.get('_csrf') || query(screen, 'input[name="_csrf"]')?.value;
      if (typeof csrf !== 'string' || !csrf) throw failure('SDUI requires a CSRF token');
      const id = requestID();
      body.set('_action', action);
      body.set('_target', targetID);
      body.set('_csrf', csrf);
      body.set('_request', id);
      const revision = attr(screen, 'data-sdui-revision');
      if (revision) body.set('_revision', revision);
      else body.delete('_revision');
      if (pending.has(targetID)) abort(pending.get(targetID));
      record = {source, targetID, id, controller: new AbortController(), previousBusy: attr(source, 'aria-busy')};
      pending.set(targetID, record);
      busy.set(source, record);
      setAttr(source, 'aria-busy', 'true');
      const current = () => !destroyed && !record.controller.signal.aborted && pending.get(targetID) === record &&
        screen.isConnected && target.isConnected && document.getElementById(targetID) === target;
      const compression = mayCompress(source, origin) && compressedBody(body, record.controller.signal, screen);
      const encoded = compression ? await compression : null;
      if (!current()) return;
      const response = await window.fetch(endpoint, {
        method: 'POST', body: encoded?.body || body, signal: record.controller.signal,
        credentials: 'same-origin', mode: 'same-origin', redirect: 'error',
        headers: {'Accept': 'text/html', 'Idempotency-Key': id, 'X-SDUI-Request': 'true', ...encoded?.headers},
      });
      if (!current()) return;
      status = response.status;
      if (status === 409 && response.headers.get('X-SDUI-Reload') === 'required') {
        emit(screen, 'sdui:stale', {action, target: targetID, requestId: id, status, revision: response.headers.get('X-SDUI-Revision')});
      }
      if (!response.ok && status !== 422) throw failure(`SDUI request failed (${status})`);
      const contentType = response.headers.get('Content-Type');
      if (contentType && !/^text\/html(?:\s*;|$)/i.test(contentType)) throw failure('SDUI response is not HTML');
      const html = await response.text();
      if (!current()) return;
      const region = safeFragment(html, targetID);
      const focus = focusedControl(target);
      // No await after the last sequence/identity check: a superseded response
      // must never replace a newer region, even if fetch ignores abort().
      Element.prototype.replaceWith.call(target, region);
      window.htmx?.process?.(region);
      dispatch(region, new CustomEvent('htmx:after:swap', {
        bubbles: true, detail: {ctx: {sourceElement: source, target: region, swap: 'outerHTML'}},
      }));
      restoreFocus(region, focus);
      emit(region, status === 422 ? 'sdui:error' : 'sdui:success', {
        action, target: targetID, requestId: id, status, validation: status === 422, region,
      });
    } catch (error) {
      if (record?.controller.signal.aborted || (record && pending.get(targetID) !== record) || destroyed) return;
      emit(screen, 'sdui:error', {action, target: targetID, requestId: record?.id, status, validation: false, error});
    } finally {
      if (record) release(record);
    }
  }

  function delegate(event) {
    const origin = event.target instanceof Element ? event.target : event.target?.parentElement;
    if (!origin || event.defaultPrevented) return;
    // Ignore implementation-editor blur changes; the composite's named hidden
    // field emits the committed aggregate value. Keep native events untouched.
    if (event.type === 'change' && !origin.name && matches(origin, '[data-ui-pin-slot],[data-ui-tag-entry]')) return;
    let source = closest(origin, `[data-sdui-events],[data-sdui-on="${event.type}"]`);
    let binding;
    while (source) {
      let bindings;
      try { bindings = hasAttr(source, 'data-sdui-events') ? JSON.parse(attr(source, 'data-sdui-events')) :
        [{on: attr(source, 'data-sdui-on'), action: attr(source, 'data-sdui-action'), target: attr(source, 'data-sdui-target')}]; }
      catch { return; }
      if (!Array.isArray(bindings)) return;
      binding = bindings.find(item => item.on === event.type && (!item.sourceAction || item.sourceAction === event.detail?.action));
      if (binding) break;
      if (bindings.some(item => item.on === event.type)) return;
      source = source.parentElement && closest(source.parentElement, `[data-sdui-events],[data-sdui-on="${event.type}"]`);
    }
    const screen = source && closest(source, '[data-sdui-screen]');
    if (!source || !screen || closest(origin, '[data-sdui-screen]') !== screen) return;
    if (event.type === 'click' && (event.button > 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    event.preventDefault();
    if (closest(origin, ':disabled,[aria-disabled="true"],[data-ely-disabled="true"]')) return;
    void send(event, source, origin, screen, binding);
  }

  const pagehide = () => { for (const record of [...pending.values()]) abort(record); };
  const destroy = () => {
    if (destroyed) return;
    destroyed = true;
    pagehide();
    for (const type of events) document.removeEventListener(type, delegate);
    window.removeEventListener('pagehide', pagehide);
    delete window.__elySDUI;
  };
  window.__elySDUI = {destroy};
  for (const type of events) document.addEventListener(type, delegate);
  window.addEventListener('pagehide', pagehide);
})();
