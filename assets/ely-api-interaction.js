import {register, emit} from './ely-api.js';

// Share one optional dependency request across current and future mounts. A
// failed download can be retried by a later mount; ordinary interaction controls
// never fetch Lottie. Keep this URL host-owned rather than accepting schema URLs.
let lottieLibraryPromise;
const loadLottieLibrary = () => {
  if (window.lottie?.loadAnimation) return Promise.resolve(window.lottie);
  if (lottieLibraryPromise) return lottieLibraryPromise;
  lottieLibraryPromise = new Promise((resolve, reject) => {
    let script = document.querySelector('script[src="/assets/lottie-light.min.js"]');
    const owned = !script;
    if (!script) {
      script = document.createElement('script');
      script.src = '/assets/lottie-light.min.js';
      script.async = true;
    }
    const finish = () => {
      script.removeEventListener('load', loaded);
      script.removeEventListener('error', failed);
    };
    const failed = () => {
      finish();
      if (owned) script.remove();
      reject(new Error('Lottie library is unavailable'));
    };
    const loaded = () => {
      if (!window.lottie?.loadAnimation) { failed(); return; }
      finish();
      resolve(window.lottie);
    };
    script.addEventListener('load', loaded);
    script.addEventListener('error', failed);
    if (owned) document.head.append(script);
  }).catch(error => {
    lottieLibraryPromise = undefined;
    throw error;
  });
  return lottieLibraryPromise;
};

const closest = (root, target, selector) => target instanceof Element && target.closest(selector)?.closest('[data-ely-family]') === root ? target.closest(selector) : null;
const change = (root, detail = {}) => root.dispatchEvent(new CustomEvent('ely:change', {bubbles: true, detail: {id: root.id, component: root.dataset.elyComponent, ...detail}}));
const itemValue = item => item.dataset.interactionValue || item.value || item.textContent.trim();
const formatCountdown = value => `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
// Match the upstream palette's first complete, tightest subsequence window.
const paletteFit = (query, text) => {
  const needle = [...query.toLocaleLowerCase()].filter(char => !/\s/u.test(char));
  if (!needle.length) return {score: 0, hits: []};
  const chars = [...text];
  let next = 0, end = -1;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i].toLocaleLowerCase() === needle[next]) next++;
    if (next === needle.length) { end = i; break; }
  }
  if (end < 0) return null;
  const hits = [];
  for (let i = end; i >= 0 && hits.length < needle.length; i--) {
    if (chars[i].toLocaleLowerCase() === needle[needle.length - 1 - hits.length]) hits.push(i);
  }
  hits.reverse();
  const score = hits.reduce((score, i, k) => {
    const start = i === 0 || !/[\p{L}\p{N}]/u.test(chars[i - 1]) || (chars[i - 1] !== chars[i - 1].toUpperCase() && chars[i] !== chars[i].toLowerCase());
    const gap = k ? i - hits[k - 1] - 1 : 0;
    return score + 16 + (start ? k ? 8 : 16 : 0) + (k ? gap === 0 ? 4 : -2 - gap : 0);
  }, 0);
  return {score, hits};
};
const paletteMark = (node, hits) => {
  if (!node) return;
  const chars = [...node.textContent];
  node.replaceChildren(...chars.map((char, index) => {
    if (!hits.includes(index)) return document.createTextNode(char);
    const mark = document.createElement('mark');
    mark.textContent = char;
    return mark;
  }));
};
const selectWizardStep = (root, wizard, index) => {
  const steps = [...(wizard?.querySelectorAll('[data-interaction-step]:not(:disabled)') || [])];
  if (!steps.length || index < 0 || index >= steps.length) return;
  steps.forEach((step, stepIndex) => {
    const current = stepIndex === index;
    const item = step.closest('li');
    item?.classList.toggle('is-current', current);
    item?.classList.toggle('is-complete', stepIndex < index);
    item?.toggleAttribute('aria-current', current);
    step.setAttribute('aria-current', current ? 'step' : 'false');
    const panel = wizard.querySelector(`[data-interaction-step-panel="${CSS.escape(step.value)}"]`);
    if (panel) panel.hidden = !current;
  });
  const current = steps[index];
  const next = wizard.querySelector('[data-interaction-step-next]');
  const back = wizard.querySelector('[data-interaction-step-back]');
  if (next) next.textContent = index === steps.length - 1 ? 'Finish' : next.dataset.interactionStepNextLabel || 'Next';
  if (back) back.disabled = index === 0;
  change(root, {name: 'step', value: current.value, index, selected: true});
};
const overlayBounds = (anchor, box, viewport, above = false) => {
  const gap = 6, margin = 8;
  const below = anchor.bottom + gap;
  const over = anchor.top - box.height - gap;
  const top = above || below + box.height > viewport.height - margin ? over : below;
  return {left: Math.max(margin, Math.min(anchor.left, viewport.width - box.width - margin)), top: Math.max(margin, Math.min(top, viewport.height - box.height - margin))};
};
const placeOverlay = (panel, anchor, above = false) => {
  const position = overlayBounds(anchor, panel.getBoundingClientRect(), {width: window.innerWidth, height: window.innerHeight}, above);
  Object.assign(panel.style, {position: 'fixed', left: `${position.left}px`, top: `${position.top}px`});
};
const trapOverlayFocus = (event, panel) => {
  const items = [...panel.querySelectorAll('a[href], button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex]:not([tabindex="-1"])')].filter(item => !item.closest('[hidden]') && item.getClientRects().length);
  const first = items[0], last = items.at(-1);
  if (!items.length) { event.preventDefault(); panel.focus(); }
  else if (event.shiftKey && (document.activeElement === first || !panel.contains(document.activeElement))) { event.preventDefault(); last.focus(); }
  else if (!event.shiftKey && (document.activeElement === last || !panel.contains(document.activeElement))) { event.preventDefault(); first.focus(); }
};
const validateOverlayForm = form => {
  const field = form.querySelector('input');
  if (!field) return true;
  const empty = form.hasAttribute('data-interaction-trim-required') && !field.value.trim();
  const disallowed = form.dataset.interactionDisallow && [...form.dataset.interactionDisallow].some(char => field.value.includes(char));
  const message = empty ? 'A name cannot be empty.' : disallowed ? form.dataset.interactionValidationMessage || 'This value contains a disallowed character.' : '';
  field.setCustomValidity(message);
  const status = form.querySelector('[data-interaction-validation-error]');
  if (status) status.textContent = message;
  return !message;
};
const menu = (root, id, open, restoreFocus = false) => {
  const panel = root.querySelector(`#${CSS.escape(id)}`);
  const trigger = root.querySelector(`[data-interaction-menu="${CSS.escape(id)}"]`);
  if (!panel || !trigger) return;
  panel.hidden = !open;
  trigger.setAttribute('aria-expanded', String(open));
  if (open && panel.hasAttribute('data-interaction-popover')) placeOverlay(panel, trigger.getBoundingClientRect());
  if (!open) panel.querySelectorAll('[data-interaction-menu]').forEach(child => menu(root, child.dataset.interactionMenu, false));
  if (open && panel.parentElement.matches('.ely-interaction__menu-row')) {
    panel.style.left = '100%'; panel.style.top = '0';
    const bounds = panel.getBoundingClientRect();
    if (bounds.right > window.innerWidth) panel.style.left = `-${bounds.width}px`;
    if (bounds.bottom > window.innerHeight) panel.style.top = `${Math.min(0, window.innerHeight - bounds.bottom)}px`;
  }
  if (open) (panel.querySelector('input:not(:disabled)') || [...panel.querySelectorAll(':is(button,a):not(:disabled)')].find(item => (panel.getAttribute('role') !== 'menu' || item.closest('[role="menu"]') === panel) && !item.closest('[hidden]')) || (panel.hasAttribute('tabindex') ? panel : null))?.focus();
  else if (restoreFocus) trigger.focus();
};

// Each mount owns its toast clocks. Stay=0 is persistent; hidden rows are reusable recipes.
const feedbackToaster = (stack, notify, clock = {now: () => performance.now(), set: (fn, ms) => setTimeout(fn, ms), clear: id => clearTimeout(id)}) => {
  const recipes = new Map([...stack.querySelectorAll('[data-interaction-toast]')].map(row => [row.dataset.interactionToast, row.cloneNode(true)]));
  const live = new Map(), leaving = new Map();
  let held = false, nextID = 0;
  const dismiss = (row, reason = 'dismissed') => {
    const state = live.get(row);
    if (!state) return;
    clock.clear(state.timer); live.delete(row);
    if (row.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const animation = row.animate([{height: `${row.offsetHeight}px`, opacity: 1}, {height: '0px', paddingTop: 0, paddingBottom: 0, opacity: 0}], {duration: 200, easing: 'ease-out', fill: 'forwards'});
      row.inert = true;
      const timer = clock.set(() => { row.remove(); animation.cancel(); leaving.delete(row); }, 200);
      leaving.set(row, {animation, timer});
    } else row.remove();
    notify({name: 'toast', value: row.dataset.value || '', toast: state.id, reason});
  };
  const run = (row, state) => {
    if (!state.remaining || held) return;
    state.since = clock.now();
    state.timer = clock.set(() => dismiss(row, 'expired'), state.remaining);
  };
  const add = row => {
    row.hidden = false; row.dataset.feedbackLive = String(++nextID);
    const stay = Number(row.dataset.feedbackStay ?? 5000);
    const state = {id: nextID, remaining: Number.isFinite(stay) && stay > 0 ? stay : 0};
    row.style.setProperty('--toast-stay', `${state.remaining}ms`);
    const countdown = row.querySelector?.('.ely-interaction__toast-countdown'); if (countdown) countdown.hidden = !state.remaining;
    live.set(row, state); stack.append(row); run(row, state);
    if (live.size > 4) dismiss(live.keys().next().value, 'overflow');
    notify({name: 'toast', value: row.dataset.value || '', toast: state.id, shown: true});
    return row;
  };
  const show = key => { const recipe = recipes.get(key); return recipe ? add(recipe.cloneNode(true)) : null; };
  const hold = value => {
    if (held === value) return;
    held = value; stack.classList.toggle('is-held', held);
    for (const [row, state] of live) {
      if (held) { clock.clear(state.timer); if (state.since != null) state.remaining = Math.max(1, state.remaining - (clock.now() - state.since)); }
      else run(row, state);
    }
  };
  stack.querySelectorAll('[data-interaction-toast]:not([hidden])').forEach(add);
  const enter = () => hold(true), leave = () => hold(false);
  stack.addEventListener('pointerenter', enter); stack.addEventListener('pointerleave', leave);
  return {show, dismiss, hold, destroy() { for (const state of live.values()) clock.clear(state.timer); live.clear(); for (const [row, state] of leaving) { clock.clear(state.timer); state.animation.cancel(); row.remove(); } leaving.clear(); stack.removeEventListener('pointerenter', enter); stack.removeEventListener('pointerleave', leave); }};
};
const feedbackNotifications = host => {
  const rows = [...host.querySelectorAll('[data-interaction-notification]')];
  const unread = rows.filter(row => row.hasAttribute('data-interaction-unread')).length;
  host.querySelector('[data-feedback-unread]').textContent = unread ? `${unread} new` : '';
  host.querySelector('[data-interaction-notification-read]').hidden = !unread;
  host.querySelector('[data-interaction-notification-clear]').hidden = !rows.length;
  host.querySelector('[data-feedback-notification-empty]').hidden = !!rows.length;
  host.querySelectorAll('[data-feedback-group]').forEach(heading => { heading.hidden = !rows.some(row => row.dataset.interactionNotificationGroup === heading.dataset.feedbackGroup); });
};
const feedbackRise = node => {
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches) node?.animate?.([{opacity: 0, transform: 'translateY(4px)'}, {opacity: 1, transform: 'translateY(0)'}], {duration: 200, easing: 'ease-out'});
};
const feedbackSaving = (host, index, animate = true) => {
  const values = [...host.querySelectorAll('[data-interaction-saving-values] i')];
  const output = host.querySelector('[data-interaction-saving-state]');
  if (!values.length || !output) return;
  index = ((index % values.length) + values.length) % values.length;
  const value = values[index];
  output.dataset.interactionSavingIndex = String(index); output.dataset.state = value.dataset.state;
  output.textContent = value.textContent;
  output.classList.toggle('is-failed', value.dataset.state === 'failed');
  const icon = document.createElement('span'); icon.setAttribute('aria-hidden', 'true');
  icon.className = 'is-icon'; icon.dataset.interactionIcon = value.dataset.icon || '';
  if (value.dataset.icon && /^[a-z0-9-]+$/.test(value.dataset.icon)) icon.style.setProperty('--ely-interaction-icon', `url("/assets/ely/icons/${value.dataset.icon}.svg")`);
  else icon.classList.add('ely-interaction__connection-dot');
  output.prepend(icon);
  const retry = host.querySelector('[data-interaction-saving-retry]');
  if (retry) retry.hidden = !value.hasAttribute('data-retry');
  if (animate) feedbackRise(output);
  return {name: host.dataset.feedbackStatus || 'saving', value: value.textContent, index, state: value.dataset.state};
};

// Source motion/direct interaction helpers. State belongs to this mount, never the page.
const directClamp = (value, min, max) => Math.max(min, Math.min(max, value));
const directResize = (start, side, dx, dy, limits) => ({width: directClamp(start.width + (side === 'bottom' ? 0 : dx), limits.minWidth, limits.maxWidth), height: directClamp(start.height + (side === 'right' ? 0 : dy), limits.minHeight, limits.maxHeight)});
const directAngle = (box, x, y, snap = false) => { const angle = (Math.atan2(x - box.left - box.width / 2, -(y - box.top - box.height / 2)) * 180 / Math.PI + 360) % 360; return snap ? Math.round(angle / 15) * 15 % 360 : angle; };
const directZoom = (view, x, y, factor, min, max) => { const scale = directClamp(view.scale * factor, min, max), ratio = scale / view.scale; return {scale, x: x - (x - view.x) * ratio, y: y - (y - view.y) * ratio}; };
const directWindow = (count, height, top, viewport) => { const start = Math.max(0, Math.floor(top / height) - 2), end = Math.min(count, Math.ceil((top + viewport) / height) + 2); return {start: Math.min(start, count), end}; };
const directHistory = initial => {
  let value = initial; const past = [], future = [];
  return {get value() { return value; }, get canUndo() { return !!past.length; }, get canRedo() { return !!future.length; }, record(next) { if (next !== value) { past.push(value); value = next; future.length = 0; } return value; }, undo() { if (past.length) { future.push(value); value = past.pop(); } return value; }, redo() { if (future.length) { past.push(value); value = future.pop(); } return value; }};
};
const directTyped = (titles, at, prefix) => { const start = prefix.length === 1 ? at + 1 : at; for (let step = 0; step < titles.length; step++) { const index = (start + step) % titles.length; if (titles[index].toLowerCase().startsWith(prefix)) return index; } return -1; };
const directKey = event => [event.metaKey && 'meta', event.ctrlKey && 'ctrl', event.altKey && 'alt', event.shiftKey && 'shift', event.key.toLowerCase()].filter(Boolean).join('+');
const directBinding = (bindings, pending, stroke) => {
  const keys = pending ? `${pending} ${stroke}` : stroke;
  const exact = bindings.find(binding => binding.keys.toLowerCase() === keys);
  if (exact) return {action: exact.action, pending: ''};
  if (bindings.some(binding => binding.keys.toLowerCase().startsWith(`${keys} `))) return {pending: keys};
  if (pending) return directBinding(bindings, '', stroke);
  return {pending: ''};
};
const bindSourceFamily = root => {
  const cleanups = [], timers = new Set(), animations = new Set();
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const after = (fn, ms) => { const timer = setTimeout(() => { timers.delete(timer); fn(); }, ms); timers.add(timer); return timer; };
  const animate = (node, frames, options = {}) => { if (!node?.animate || reduced()) return; const animation = node.animate(frames, {duration: 200, easing: 'cubic-bezier(.22,1,.36,1)', ...options}); animations.add(animation); animation.finished.then(() => animations.delete(animation), () => animations.delete(animation)); return animation; };
  const listen = (node, type, handler, options) => { node.addEventListener(type, handler, options); cleanups.push(() => node.removeEventListener(type, handler, options)); };
  const notify = detail => change(root, detail);
  const flip = (list, mutate) => { const before = new Map([...list.children].map(row => [row, row.getBoundingClientRect().top])); mutate(); for (const row of list.children) { const offset = before.has(row) ? before.get(row) - row.getBoundingClientRect().top : 0; if (offset) animate(row, [{transform: `translateY(${offset}px)`}, {transform: 'translateY(0)'}]); } };
  const replay = host => { host.querySelectorAll('.ely-interaction__motion-list > li').forEach((row, index) => animate(row, [{opacity: 0, transform: 'translateY(8px)'}, {opacity: 1, transform: 'translateY(0)'}], {delay: index * Number(host.dataset.motionStep || 60), fill: 'backwards'})); };
  root.querySelectorAll('[data-interaction-stagger]').forEach(replay);
  const historyOutput = root.querySelector('[data-interaction-undo-count]');
  const history = historyOutput ? directHistory(Number(historyOutput.textContent) || 0) : null;
  const renderHistory = () => { historyOutput.textContent = String(history.value); root.querySelector('[data-interaction-undo]').disabled = !history.canUndo; root.querySelector('[data-interaction-redo]').disabled = !history.canRedo; };
  if (history) renderHistory();
  const setSize = (box, size) => { box.dataset.width = String(size.width); box.dataset.height = String(size.height); box.style.width = `${size.width}px`; box.style.height = `${size.height}px`; box.querySelector('[data-direct-size]').textContent = `${Math.round(size.width)} × ${Math.round(size.height)}`; };
  const limits = box => ({minWidth: Number(box.dataset.minWidth), minHeight: Number(box.dataset.minHeight), maxWidth: Number(box.dataset.maxWidth), maxHeight: Number(box.dataset.maxHeight)});
  root.querySelectorAll('[data-interaction-resizable][data-width]').forEach(box => setSize(box, directResize({width: Number(box.dataset.width), height: Number(box.dataset.height)}, 'corner', 0, 0, limits(box))));
  const rotate = (node, angle) => { angle = (angle + 360) % 360; node.dataset.directRotate = String(angle); node.setAttribute('aria-valuenow', String(Math.round(angle))); node.style.setProperty('--direct-angle', `${angle}deg`); };
  root.querySelectorAll('[data-direct-rotate]').forEach(node => rotate(node, Number(node.dataset.directRotate)));
  const views = new Map();
  const transform = (node, view) => { views.set(node, view); node.querySelector('[data-direct-transform]').style.transform = `translate(${view.x}px,${view.y}px) scale(${view.scale})`; notify({name: 'viewport', ...view}); };
  root.querySelectorAll('[data-direct-panzoom]').forEach(node => { views.set(node, {x: 0, y: 0, scale: 1}); listen(node, 'wheel', event => { event.preventDefault(); const view = views.get(node), box = node.getBoundingClientRect(), unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? box.height : 1; transform(node, event.metaKey || event.ctrlKey ? directZoom(view, event.clientX - box.left, event.clientY - box.top, Math.exp(-event.deltaY * unit * .01), Number(node.dataset.minScale), Number(node.dataset.maxScale)) : {...view, x: view.x - event.deltaX * unit, y: view.y - event.deltaY * unit}); }, {passive: false}); });
  const selectTiles = (area, keys) => { area.querySelectorAll('[data-direct-tile]').forEach(tile => tile.setAttribute('aria-selected', String(keys.includes(tile.dataset.directTile)))); notify({name: 'selection', values: keys}); };
  let gesture;
  const pointerdown = event => {
    if (event.button !== 0 || event.target.closest(':disabled') || root.dataset.elyDisabled === 'true') return;
    const grip = event.target.closest('[data-direct-resize]'), turn = event.target.closest('[data-direct-rotate-knob]'), pan = event.target.closest('[data-direct-panzoom]'), area = event.target.closest('[data-direct-selection]');
    if (grip) { const node = grip.closest('[data-interaction-resizable]'); gesture = {kind: 'resize', node, side: grip.dataset.directResize, size: {width: Number(node.dataset.width), height: Number(node.dataset.height)}}; }
    else if (turn) gesture = {kind: 'rotate', node: turn.parentElement};
    else if (pan) gesture = {kind: 'pan', node: pan, view: {...views.get(pan)}};
    else if (area) {
      area.focus(); const tiles = [...area.querySelectorAll('[data-direct-tile]')], tile = event.target.closest('[data-direct-tile]'), adding = event.shiftKey || event.metaKey || event.ctrlKey;
      const selected = tiles.filter(tile => tile.getAttribute('aria-selected') === 'true').map(tile => tile.dataset.directTile);
      if (tile) { const key = tile.dataset.directTile; area.dataset.cursor = String(tiles.indexOf(tile)); selectTiles(area, adding ? selected.includes(key) ? selected.filter(value => value !== key) : [...selected, key] : [key]); return; }
      gesture = {kind: 'band', node: area, selected: adding ? selected : []}; selectTiles(area, gesture.selected);
    } else return;
    event.preventDefault(); gesture.x = event.clientX; gesture.y = event.clientY; gesture.pointer = event.pointerId;
    if (event.isTrusted) gesture.node.setPointerCapture?.(event.pointerId);
  };
  const pointermove = event => {
    if (!gesture || event.pointerId !== gesture.pointer) return;
    const {node, x, y} = gesture;
    if (gesture.kind === 'resize') { const size = directResize(gesture.size, gesture.side, event.clientX - x, event.clientY - y, limits(node)); setSize(node, size); notify({name: 'size', ...size}); }
    else if (gesture.kind === 'rotate') { const angle = directAngle(node.getBoundingClientRect(), event.clientX, event.clientY, event.shiftKey); rotate(node, angle); notify({name: 'rotation', value: angle}); }
    else if (gesture.kind === 'pan') transform(node, {...gesture.view, x: gesture.view.x + event.clientX - x, y: gesture.view.y + event.clientY - y});
    else {
      const box = node.getBoundingClientRect(), left = Math.min(x, event.clientX), top = Math.min(y, event.clientY), right = Math.max(x, event.clientX), bottom = Math.max(y, event.clientY), band = node.querySelector('[data-direct-band]');
      band.hidden = false; Object.assign(band.style, {left: `${left - box.left}px`, top: `${top - box.top}px`, width: `${right - left}px`, height: `${bottom - top}px`});
      const keys = [...node.querySelectorAll('[data-direct-tile]')].filter(tile => { const rect = tile.getBoundingClientRect(); return gesture.selected.includes(tile.dataset.directTile) || rect.left <= right && rect.right >= left && rect.top <= bottom && rect.bottom >= top; }).map(tile => tile.dataset.directTile);
      selectTiles(node, keys);
    }
  };
  const pointerup = event => { if (!gesture || event.pointerId !== gesture.pointer) return; gesture.node.querySelector('[data-direct-band]')?.setAttribute('hidden', ''); if (gesture.node.hasPointerCapture?.(event.pointerId)) gesture.node.releasePointerCapture(event.pointerId); gesture = null; };
  listen(root, 'pointerdown', pointerdown); listen(root, 'pointermove', pointermove); listen(root, 'pointerup', pointerup); listen(root, 'pointercancel', pointerup);
  root.querySelectorAll('[data-direct-press]').forEach(button => {
    let timer, down = false, held = false, presses = 0, holds = 0;
    const render = () => { button.textContent = `Pressed ${presses} · held ${holds}`; };
    const clear = () => { clearTimeout(timer); timers.delete(timer); down = false; button.classList.remove('is-confirming'); };
    listen(button, 'pointerdown', event => { if (event.button !== 0 || button.disabled) return; clear(); down = true; held = false; button.classList.add('is-confirming'); timer = after(() => { if (down) { held = true; holds++; render(); emit(root, button.dataset.interactionLongpress, {value: button.value}); notify({name: 'press', presses, held: holds}); } }, Number(button.dataset.interactionConfirmThreshold || 500)); });
    listen(button, 'pointerup', () => { if (down && !held) { presses++; render(); emit(root, button.dataset.directPressAction, {value: button.value}); notify({name: 'press', presses, held: holds}); } clear(); });
    listen(button, 'pointerleave', clear); listen(button, 'pointercancel', clear);
    listen(button, 'keydown', event => { if (['Enter', ' '].includes(event.key) && !event.repeat && !button.disabled) { event.preventDefault(); presses++; render(); emit(root, button.dataset.directPressAction, {value: button.value}); } });
    cleanups.push(clear);
  });
  root.querySelectorAll('[data-direct-double]').forEach(button => { let count = 0; listen(button, 'dblclick', () => { if (button.disabled) return; count++; button.textContent = `Opened ${count} ${count === 1 ? 'time' : 'times'}`; emit(root, button.dataset.directDoubleAction, {count}); }); });
  root.querySelectorAll('[data-direct-count]').forEach(scroller => {
    const count = Number(scroller.dataset.directCount); if (!count) return;
    const height = Math.max(1, Number(scroller.dataset.directRowHeight)), space = scroller.querySelector('[data-direct-virtual-space]'), rows = scroller.querySelector('[data-direct-virtual-rows]');
    space.style.height = `${count * height}px`;
    const render = () => { const {start, end} = directWindow(count, height, scroller.scrollTop, scroller.clientHeight || 200); rows.replaceChildren(); rows.style.top = `${start * height}px`; for (let index = start; index < end; index++) { const row = document.createElement('div'); row.textContent = `${scroller.dataset.directPrefix} ${index + 1}`; row.style.height = `${height}px`; row.dataset.index = String(index); row.setAttribute('aria-posinset', String(index + 1)); row.setAttribute('aria-setsize', String(count)); rows.append(row); } };
    listen(scroller, 'scroll', render); render();
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(render) : null; observer?.observe(scroller); cleanups.push(() => observer?.disconnect());
  });
  root.querySelectorAll('[data-direct-sync]').forEach(host => { const panes = [...host.children]; panes.forEach(pane => listen(pane, 'scroll', () => { panes.forEach(other => { if (other !== pane && Math.abs(other.scrollTop - pane.scrollTop) > .5) other.scrollTop = pane.scrollTop; }); })); });
  root.querySelectorAll('[data-motion-marquee]').forEach(host => {
    const track = host.querySelector('.ely-interaction__marquee'), original = track.firstElementChild;
    const clone = original.cloneNode(true); clone.setAttribute('aria-hidden', 'true'); track.append(clone);
    const measure = () => { const width = original.getBoundingClientRect().width; track.style.setProperty('--marquee-distance', `${-width}px`); track.style.animationDuration = `${Math.max(.28, width / Number(host.dataset.motionPace || 40))}s`; };
    measure(); const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(measure) : null; observer?.observe(original); cleanups.push(() => { observer?.disconnect(); clone.remove(); });
  });
  root.querySelectorAll('[data-motion-particles]').forEach(host => { for (let i = 0; i < 36; i++) { const mote = document.createElement('i'); mote.setAttribute('aria-hidden', 'true'); mote.style.cssText = `left:${(i * 37 + 11) % 100}%;top:${(i * 61 + 7) % 100}%;animation-delay:-${i * .67}s`; host.append(mote); cleanups.push(() => mote.remove()); } });
  root.querySelectorAll('[data-motion-flash]').forEach(output => { output.textContent = (Number(output.dataset.motionFlash) / 100).toFixed(2); });
  let presenceID = 0, addIndex = 0;
  const click = event => {
    if (root.dataset.elyDisabled === 'true') return true;
    const target = event.target;
    if (target.closest('[data-direct-resize]')) return true;
    const replayButton = target.closest('[data-interaction-stagger-replay]');
    if (replayButton) { replay(replayButton.closest('[data-interaction-stagger]')); notify({name: 'stagger', value: 'replayed'}); return true; }
    const add = target.closest('[data-interaction-presence-toggle]');
    if (add) { const host = add.closest('[data-interaction-presence]'), list = host.querySelector('[data-interaction-presence-list]'), recipes = [...host.querySelectorAll('[data-motion-recipes] i')], recipe = recipes.length ? recipes[addIndex++ % recipes.length] : null; const row = document.createElement('li'), label = document.createElement('span'), remove = document.createElement('button'); do { row.dataset.motionKey = `added-${++presenceID}`; } while ([...list.children].some(item => item.dataset.motionKey === row.dataset.motionKey)); label.textContent = recipe?.textContent || 'New item'; remove.type = 'button'; remove.dataset.motionRemove = ''; remove.textContent = '×'; remove.setAttribute('aria-label', `Remove ${label.textContent}`); row.append(label, remove); list.append(row); animate(row, [{height: '0px', opacity: 0}, {height: `${row.getBoundingClientRect().height}px`, opacity: 1}]); notify({name: 'presence', value: recipe?.dataset.value || row.dataset.motionKey, key: row.dataset.motionKey, shown: true}); return true; }
    const remove = target.closest('[data-motion-remove]');
    if (remove) { const row = remove.closest('[data-motion-key]'); if (row.inert) return true; row.inert = true; const done = () => { row.remove(); notify({name: 'presence', value: row.dataset.motionKey, shown: false, gone: true}); }; if (reduced()) done(); else { animate(row, [{height: `${row.getBoundingClientRect().height}px`, opacity: 1}, {height: '0px', paddingTop: 0, paddingBottom: 0, opacity: 0}], {fill: 'forwards'}); after(done, 200); } return true; }
    const shuffle = target.closest('[data-interaction-flip-toggle]');
    if (shuffle) { const list = shuffle.closest('[data-interaction-flip]').querySelector('ol'); flip(list, () => { const rows = [...list.children]; if (rows.length > 1) { rows.push(...rows.splice(0, Math.min(2, rows.length))); if (rows.length > 3) [rows[0], rows[3]] = [rows[3], rows[0]]; rows.forEach(row => list.append(row)); } }); notify({name: 'flip', values: [...list.children].map(row => row.dataset.motionKey)}); return true; }
    const tally = target.closest('[data-interaction-increment], [data-interaction-decrement], [data-interaction-undo], [data-interaction-redo]');
    if (tally && history) { const action = tally.hasAttribute('data-interaction-undo') ? 'undo' : tally.hasAttribute('data-interaction-redo') ? 'redo' : 'record'; if (action === 'record') history.record(history.value + (tally.hasAttribute('data-interaction-increment') ? 1 : -1)); else history[action](); renderHistory(); root.querySelector('[data-interaction-history]').textContent = action; notify({name: 'history', value: history.value, action, canUndo: history.canUndo, canRedo: history.canRedo}); return true; }
    const tool = target.closest('[data-direct-tool]');
    if (tool) { tool.parentElement.querySelectorAll('button').forEach(button => { button.setAttribute('aria-pressed', String(button === tool)); button.tabIndex = button === tool ? 0 : -1; }); notify({name: 'tool', value: tool.value}); return true; }
    const fruit = target.closest('[data-direct-fruit]');
    if (fruit) { fruit.parentElement.querySelectorAll('button').forEach(button => { button.setAttribute('aria-selected', String(button === fruit)); button.tabIndex = button === fruit ? 0 : -1; }); notify({name: 'selection', value: fruit.value}); return true; }
    const ripple = target.closest('[data-interaction-ripple]');
    if (ripple) { const box = ripple.getBoundingClientRect(), circle = document.createElement('i'), side = Math.hypot(box.width, box.height) * 2; circle.className = 'ely-interaction__ripple-wave'; circle.style.cssText = `left:${event.detail ? event.clientX - box.left : box.width / 2}px;top:${event.detail ? event.clientY - box.top : box.height / 2}px;width:${side}px;height:${side}px`; ripple.append(circle); animate(circle, [{transform: 'translate(-50%,-50%) scale(0)', opacity: .2}, {transform: 'translate(-50%,-50%) scale(1)', opacity: 0}], {duration: 560}); after(() => circle.remove(), reduced() ? 0 : 560); notify({name: 'ripple'}); return true; }
    const celebrate = target.closest('[data-motion-confetti]');
    if (celebrate) { if (!reduced()) for (let i = 0; i < 42; i++) { const paper = document.createElement('i'); paper.className = 'ely-interaction__confetti'; paper.style.setProperty('--piece-color', `var(--chart-${i % 5 + 1},#669bd3)`); celebrate.parentElement.append(paper); animate(paper, [{transform: 'translate(0,0) rotate(0)', opacity: 1}, {transform: `translate(${(i * 37 % 220) - 110}px,${-90 - (i * 13 % 80)}px) rotate(${i * 37}deg)`, opacity: 1, offset: .45}, {transform: `translate(${(i * 49 % 300) - 150}px,90px) rotate(${i * 71}deg)`, opacity: 0}], {duration: 1800, easing: 'linear'}); after(() => paper.remove(), 1800); } notify({name: 'confetti'}); return true; }
    if (target.closest('[data-motion-tick]')) { const output = root.querySelector('[data-motion-flash]'); output.dataset.motionFlash = String(Number(output.dataset.motionFlash) + Number(output.dataset.motionFlashStep)); output.textContent = (Number(output.dataset.motionFlash) / 100).toFixed(2); animate(output, [{backgroundColor: 'var(--accent-tint,#eef0f8)'}, {backgroundColor: 'transparent'}], {duration: 900}); notify({name: 'flash', value: output.textContent}); return true; }
    if (target.closest('[data-motion-shake-trigger]')) { const node = root.querySelector('[data-motion-shake]'); node.classList.add('is-failed'); root.querySelector('[data-motion-shake-error]').hidden = false; animate(node, [0,-6,5,-4,3,-2,0].map(x => ({transform: `translateX(${x}px)`})), {duration: 420, easing: 'linear'}); notify({name: 'shake'}); return true; }
    return false;
  };
  let pending = '', chordTimer, typeBuffer = '', typedAt = 0;
  const keydown = event => {
    if (root.dataset.elyDisabled === 'true') return true;
    const resize = event.target.closest('[data-direct-resize]');
    if (resize && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) { event.preventDefault(); const box = resize.closest('[data-interaction-resizable]'), step = 8; const size = directResize({width: Number(box.dataset.width), height: Number(box.dataset.height)}, 'corner', event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0, limits(box)); setSize(box, size); notify({name: 'size', ...size}); return true; }
    const turn = event.target.closest('[data-direct-rotate]');
    if (turn && ['ArrowLeft','ArrowRight'].includes(event.key)) { event.preventDefault(); const angle = (Math.round(Number(turn.dataset.directRotate) / 15) * 15 + (event.key === 'ArrowLeft' ? -15 : 15) + 360) % 360; rotate(turn, angle); notify({name: 'rotation', value: angle}); return true; }
    const area = event.target.closest('[data-direct-selection]');
    if (area) { const tiles = [...area.querySelectorAll('[data-direct-tile]')]; if (!tiles.length) return true; let cursor = Number(area.dataset.cursor || 0); const keys = tiles.filter(tile => tile.getAttribute('aria-selected') === 'true').map(tile => tile.dataset.directTile);
      if (event.key === 'Escape') selectTiles(area, []);
      else if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'a') selectTiles(area, tiles.map(tile => tile.dataset.directTile));
      else if (event.key === ' ') { const key = tiles[cursor].dataset.directTile; selectTiles(area, keys.includes(key) ? keys.filter(value => value !== key) : [...keys, key]); }
      else if (['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Home','End'].includes(event.key)) { cursor = event.key === 'Home' ? 0 : event.key === 'End' ? tiles.length - 1 : directClamp(cursor + (['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1), 0, tiles.length - 1); area.dataset.cursor = String(cursor); tiles.forEach((tile,index) => tile.classList.toggle('is-cursor', index === cursor)); }
      else return false; event.preventDefault(); return true;
    }
    const toolbar = event.target.closest('[data-direct-toolbar]'), fruits = event.target.closest('[data-direct-typeahead]');
    if ((toolbar || fruits) && !event.metaKey && !event.ctrlKey && !event.altKey) { const host = toolbar || fruits, buttons = [...host.querySelectorAll('button:not(:disabled)')], at = Math.max(0, buttons.indexOf(event.target.closest('button'))); let next;
      const back = toolbar ? 'ArrowLeft' : 'ArrowUp', forward = toolbar ? 'ArrowRight' : 'ArrowDown';
      if ([back,forward,'Home','End'].includes(event.key)) next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : directClamp(at + (event.key === back ? -1 : 1), 0, buttons.length - 1);
      else if (fruits && event.key.length === 1 && event.key !== ' ') { const now = performance.now(); typeBuffer = now - typedAt > 800 ? event.key.toLowerCase() : typeBuffer + event.key.toLowerCase(); typedAt = now; next = directTyped(buttons.map(button => button.textContent), at, typeBuffer); }
      if (next != null && next >= 0 && buttons[next]) { event.preventDefault(); buttons.forEach((button,index) => button.tabIndex = index === next ? 0 : -1); buttons[next].focus(); if (fruits) buttons[next].click(); return true; }
      if (toolbar && ['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return true;
    }
    const hotkeys = event.target.closest('[data-interaction-hotkeys]');
    if (hotkeys?.querySelector('[data-direct-binding]')) {
      if (hotkeys.getAttribute('aria-disabled') === 'true' || event.repeat || ['Meta','Control','Alt','Shift'].includes(event.key)) return true;
      const rows = [...hotkeys.querySelectorAll('[data-direct-binding]')], bindings = rows.map(row => ({keys: row.dataset.directBinding, action: row.dataset.action})), state = event.key === 'Escape' ? {pending: ''} : directBinding(bindings, pending, directKey(event));
      clearTimeout(chordTimer); timers.delete(chordTimer); pending = state.pending;
      const output = hotkeys.querySelector('[data-direct-pending]'); output.textContent = pending ? `${pending} … waiting for the second key` : 'No chord waiting.';
      if (pending) chordTimer = after(() => { pending = ''; output.textContent = 'No chord waiting.'; }, 1000);
      if (state.action) { const row = rows.find(row => row.dataset.action === state.action), tally = row.querySelector('output'); row.dataset.count = String(Number(row.dataset.count || 0) + 1); const label = tally.textContent.startsWith('saved') ? 'saved' : 'heard'; tally.textContent = `${label} ${row.dataset.count} ${row.dataset.count === '1' ? 'time' : 'times'}`; emit(root, state.action, {key: directKey(event)}); }
      if (pending || state.action || event.key === 'Escape') event.preventDefault(); return true;
    }
    return false;
  };
  root.querySelectorAll('[data-direct-keycaps]').forEach(combo => {
    const strokes = combo.dataset.directKeycaps.trim().split(/\s+/);
    combo.replaceChildren();
    strokes.forEach(stroke => {
      const group = document.createElement('span'); group.className = 'ely-interaction__key-stroke';
      stroke.split('+').forEach((key, index) => {
        if (index) group.append(document.createTextNode('+'));
        const cap = document.createElement('kbd'); cap.textContent = key.length === 1 ? key.toUpperCase() : key; group.append(cap);
      });
      combo.append(group);
    });
  });
  root.querySelectorAll('[data-interaction-hotkeys]').forEach(host => listen(host, 'blur', () => { pending = ''; clearTimeout(chordTimer); timers.delete(chordTimer); const output = host.querySelector('[data-direct-pending]'); if (output) output.textContent = 'No chord waiting.'; }));
  return {click, keydown, flip, destroy() { cleanups.forEach(fn => fn()); timers.forEach(clearTimeout); animations.forEach(animation => animation.cancel()); gesture = null; }};
};

// Source clocks use elapsed time rather than assuming each callback runs on time.
const loadingClock = (initial, mode, now) => {
  let base = Math.max(0, Number(initial) || 0), started = now(), paused = false, done = false;
  const value = () => Math.max(0, base + (paused ? 0 : (mode === 'timer' ? 1 : -1) * Math.floor((now() - started) / 1000)));
  return {value, get paused() { return paused; }, reset() { base = Math.max(0, Number(initial) || 0); started = now(); paused = false; done = false; }, toggle() { if (mode === 'timer' && paused) this.reset(); else { base = value(); started = now(); paused = !paused; } }, completed() { if (mode === 'timer' || value() > 0 || done) return false; done = true; return true; }};
};
const loadingTime = value => { const days=Math.floor(value/86400), parts=[Math.floor(value/3600)%24,Math.floor(value/60)%60,value%60];return (days?`${days}d `:'')+(value>=3600?parts:parts.slice(1)).map(v=>String(v).padStart(2,'0')).join(':'); };
const reorderLanding = (heights, from, top) => { const middle = Math.max(0, Math.min(top, heights.reduce((a,b) => a+b, 0) - heights[from])) + heights[from] / 2; let y = 0, target = 0; heights.forEach((height, i) => { if (i === from) return; if (y + height / 2 < middle) target++; y += height; }); return target; };
const bindLoadingFamily = root => {
  const cleanups = [], timers = new Set(), clocks = new Map(), motions = new Map();
  root.querySelectorAll('[data-loading-size]').forEach(node=>node.style.setProperty('--loading-size',`${Math.max(1,Number(node.dataset.loadingSize)||16)}px`));
  root.querySelectorAll('[data-loading-width]').forEach(node=>node.style.width=`${Math.max(0,Math.min(100,Number(node.dataset.loadingWidth)||0))}%`);
  root.querySelectorAll('[data-loading-rotation]').forEach(node=>node.style.transform=`rotate(${Number(node.dataset.loadingRotation)||0}deg)`);
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); fn(); }, ms); timers.add(id); return id; };
  const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
  const cancelMotion = node => { const state = motions.get(node); if (state) { clearTimeout(state.timer); timers.delete(state.timer); state.animation?.cancel(); motions.delete(node); } };
  const transition = (node, shown) => {
    cancelMotion(node); node.hidden = false; node.inert = !shown;
    const entrance = node.dataset.loadingEntrance, offset = entrance === 'rise' ? 'translateY(8px)' : entrance === 'slide' ? 'translateX(-16px)' : 'none';
    const finish = () => { node.hidden = !shown; cancelMotion(node); };
    if (reduced() || !node.animate) { finish(); return; }
    const frames = [{opacity: 0, transform: offset}, {opacity: 1, transform: 'none'}]; if (!shown) frames.reverse();
    const animation = node.animate(frames, {duration: 200, easing: 'cubic-bezier(.22,1,.36,1)', fill: 'both'});
    motions.set(node, {animation, timer: later(finish, 200)});
  };
  root.querySelectorAll('[data-loading-clock]').forEach(host => {
    const clock = loadingClock(host.dataset.clockValue, host.dataset.clockMode, () => performance.now()), output = host.querySelector('[data-interaction-countdown]'); clocks.set(host, clock);
    const render = () => { const value = clock.value(), label = loadingTime(value); if (output.textContent !== label) { output.textContent = label; if (!reduced()) output.animate?.([{transform:'translateY(3px)',opacity:.4},{transform:'none',opacity:1}],{duration:200}); } output.dataset.interactionCountdown = String(value); if (clock.completed()) { const done = root.querySelector('[data-loading-clock-done]'); if (done) done.hidden = false; change(root,{name:'countdown',value:'0',done:true}); } };
    render(); const tick = () => { render(); later(tick, 250); }; later(tick,250); clock.render = render;
  });
  const paintProgress = (node, value = Number(node.dataset.progressValue) || 0) => {
    const max = Math.max(1, Number(node.dataset.progressMax) || 100), share = Math.min(100, Math.max(0,value / max * 100)); node.dataset.progressValue = String(value);
    const track = node.querySelector('[role="progressbar"]'); if (!node.hasAttribute('data-progress-indeterminate')) track.setAttribute('aria-valuenow',String(value));
    node.style.setProperty('--loading-progress', `${share}%`); node.style.setProperty('--loading-buffer',`${Math.max(share, Math.min(100, Number(node.dataset.progressBuffer) / max * 100 || 0))}%`);
    const segments = Number(node.dataset.progressSegments); if (segments > 1) track.style.maskImage = `repeating-linear-gradient(to right,#000 0 calc(${100/segments}% - 2px),transparent calc(${100/segments}% - 2px) ${100/segments}%)`;
    const ring = node.querySelector('[data-loading-ring-fill]'); if (ring) ring.style.strokeDasharray = `${share} 100`; const output = node.querySelector('output'); if (output) output.textContent = `${Math.round(share)}%`;
  };
  root.querySelectorAll('[data-loading-progress]').forEach(node => paintProgress(node));
  root.querySelectorAll('[data-loading-entrance]').forEach(node => transition(node,true));
  const click = event => {
    const target = event.target;
    const clockControl = target.closest('[data-interaction-countdown-toggle], [data-interaction-countdown-reset]');
    if (clockControl) { const host = clockControl.closest('[data-loading-clock]'), clock = clocks.get(host); if (!clock) return false; if (clockControl.hasAttribute('data-interaction-countdown-reset')) { clock.reset(); const done=root.querySelector('[data-loading-clock-done]'); if(done)done.hidden=true; } else clock.toggle(); clock.render(); const toggle=host.querySelector('[data-interaction-countdown-toggle]'); if(toggle)toggle.textContent=host.dataset.clockMode==='timer'?(clock.paused?'Reset':'Stop'):(clock.paused?'Resume':'Pause'); change(root,{name:'countdown',value:String(clock.value()),paused:clock.paused}); return true; }
    const step = target.closest('[data-loading-progress-step]');
    if (step) { const values=[...root.querySelectorAll('[data-loading-progress-steps] i')].map(n=>Number(n.textContent)), linked=[...root.querySelectorAll('[data-progress-linked]')]; const index=values.indexOf(Number(linked[0]?.dataset.progressValue)); const next=values[(index+1)%values.length]; linked.forEach(node=>paintProgress(node,next)); change(root,{name:'progress',value:next}); return true; }
    const toggle=target.closest('[data-interaction-transition-toggle]');
    if(toggle) { const host=toggle.closest('[data-interaction-transition]'), shown=host.dataset.loadingHidden==='true'; host.dataset.loadingHidden=String(!shown); host.querySelectorAll('article').forEach(node=>transition(node,shown)); toggle.textContent=shown?'Hide':'Show'; change(root,{name:'transition',value:shown?'shown':'hidden'}); return true; }
    const shimmer=target.closest('[data-interaction-shimmer-toggle]');
    if(shimmer) { const host=shimmer.closest('[data-interaction-shimmer]'), body=host.querySelector('[data-loading-shimmer-content]'), loaded=body.hidden; body.hidden=!loaded; host.querySelector('.ely-interaction__shimmer').hidden=loaded; host.classList.toggle('is-loaded',loaded); shimmer.textContent=loaded?'Reload':'Load'; if(loaded)transition(body,true); change(root,{name:'shimmer',value:loaded?'loaded':'loading'}); return true; }
    return false;
  };
  return {click, destroy(){ timers.forEach(clearTimeout); for(const node of motions.keys())cancelMotion(node); cleanups.forEach(fn=>fn()); }};
};

// Match the source Result-view contract: log only the rendered error chain,
// once per changed error for this DOM instance, including repeated mounts.
// A new replacement node is a new instance. Recovery does not erase its last error.
const feedbackBoundaryErrors = new WeakMap();
const feedbackBoundaryLog = (boundary, id, report = (...args) => console.error(...args)) => {
  const fallback = boundary.querySelector('[data-feedback-boundary-error]');
  if (!fallback || fallback.hidden) return;
  const chain = fallback.querySelector('code')?.textContent || fallback.querySelector('p')?.textContent || '';
  if (!chain || feedbackBoundaryErrors.get(boundary) === chain) return;
  feedbackBoundaryErrors.set(boundary, chain);
  report('ErrorBoundary', id, chain.slice(0, 4096));
};

register('interaction', root => {
  const timers = new Set();
  const lottieCleanups = [];
  const sourceFamily = bindSourceFamily(root);
  const loadingFamily = bindLoadingFamily(root);
  lottieCleanups.push(() => loadingFamily.destroy());
  lottieCleanups.push(() => sourceFamily.destroy());
  const dialogOpeners = new Map();
  const restoreDialogFocus = dialog => {
    const opener = dialogOpeners.get(dialog);
    dialogOpeners.delete(dialog);
    if (opener?.isConnected) requestAnimationFrame(() => { if (opener.isConnected) opener.focus({preventScroll: true}); });
  };
  const closeDialog = dialog => {
    if (!dialog) return;
    if (dialog.open) dialog.close();
    else dialog.hidden = true;
    restoreDialogFocus(dialog);
  };
  const showTourStep = (dialog, index, notify = true) => {
    const steps = [...dialog.querySelectorAll('[data-interaction-tour-step]')];
    const step = steps[index];
    if (!step) return;
    let target;
    try { target = document.querySelector(step.dataset.interactionTourTarget); } catch { /* A removed or invalid caller target ends this tour. */ }
    if (!target) { closeDialog(dialog); return; }
    dialog.dataset.interactionTourIndex = String(index);
    const coach = dialog.dataset.interactionTourCoach === 'true';
    steps.forEach(item => item.hidden = coach || item !== step);
    const words = dialog.querySelector('[data-interaction-tour-coach-content]');
    words.hidden = !coach;
    words.querySelector('h2').textContent = step.dataset.interactionCoachTitle;
    words.querySelector('p').textContent = step.dataset.interactionCoachContent;
    const box = target.getBoundingClientRect(), ring = dialog.querySelector('[data-interaction-tour-ring]');
    Object.assign(ring.style, {left: `${box.left - 6}px`, top: `${box.top - 6}px`, width: `${box.width + 12}px`, height: `${box.height + 12}px`});
    const back = dialog.querySelector('[data-interaction-tour-back]');
    back.hidden = coach || index === 0;
    dialog.querySelector('[data-interaction-close]').hidden = coach;
    const count = dialog.querySelector('[data-interaction-tour-count]');
    count.hidden = coach; count.textContent = `${index + 1} of ${steps.length}`;
    dialog.querySelector('[data-interaction-tour-next]').textContent = coach || index === steps.length - 1 ? 'Done' : 'Next';
    placeOverlay(dialog.querySelector('[data-interaction-tour-card]'), box);
    if (notify) change(root, {name: 'tour', value: step.dataset.interactionTourTarget, index});
  };
  const uploadButton = (attribute, label) => { const control = document.createElement('button'); control.type = 'button'; control.textContent = label; control.setAttribute(attribute, ''); return control; };
  const setLightboxZoom = (dialog, next) => {
    const zoom = Math.min(3, Math.max(.5, next));
    dialog.dataset.interactionLightboxZoom = String(zoom);
    dialog.querySelector('[data-interaction-lightbox-viewport] img')?.style.setProperty('--ely-lightbox-zoom', String(zoom));
    const output = dialog.querySelector('[data-interaction-lightbox-zoom]');
    if (output) output.textContent = `${Math.round(zoom * 100)}%`;
    return zoom;
  };
  const later = (callback, delay) => { const timer = setTimeout(() => { timers.delete(timer); callback(); }, delay); timers.add(timer); return timer; };
  const pendingTimers = new Map();
  const settlePending = (button, succeeded) => {
    if (button.dataset.interactionPending !== 'true') return;
    const timer=pendingTimers.get(button); if(timer){clearTimeout(timer);timers.delete(timer);pendingTimers.delete(button);}
    delete button.dataset.interactionPending;
    button.setAttribute('aria-busy', 'false');
    button.disabled = false;
    if (succeeded && button.hasAttribute('data-interaction-more')) {
      const host = button.closest('[data-loading-more]'), output = root.querySelector('[data-interaction-more-count]');
      if (host) { const rows = [...host.querySelectorAll('[data-loading-more-row]')], shown = Math.min(rows.length, Number(host.dataset.shown) + Number(host.dataset.pageSize)); host.dataset.shown=String(shown); rows.forEach((row,i)=>row.hidden=i>=shown); output.textContent=`Showing ${shown} of ${rows.length}`; button.hidden=shown>=rows.length; change(root,{name:'count',value:String(shown)}); }
      else if(output) { output.textContent=String(Number(output.textContent||0)+1); change(root,{name:'count',value:output.textContent}); }
    }
  };
  const beginPending = button => {
    if (button.dataset.interactionPending === 'true') return;
    button.dataset.interactionPending = 'true'; button.setAttribute('aria-busy','true'); button.disabled=true;
    const delay=Number(button.dataset.loadingDelay);
    if(delay>0 || !button.dataset.interactionPendingAction) pendingTimers.set(button,later(()=>settlePending(button,true),delay>0?delay:250));
  };
  root.querySelectorAll('[data-loading-more]').forEach(host=>{ const rows=[...host.querySelectorAll('[data-loading-more-row]')], shown=Math.min(rows.length,Number(host.dataset.shown)||0); rows.forEach((row,i)=>row.hidden=i>=shown); host.querySelector('[data-interaction-more-count]').textContent=`Showing ${shown} of ${rows.length}`; if(rows.length)host.querySelector('button').hidden=shown>=rows.length; });

  const close = (restoreFocus = false) => root.querySelectorAll('[data-interaction-menu]').forEach(trigger => {
    const panel = root.querySelector(`#${CSS.escape(trigger.dataset.interactionMenu)}`);
    if (panel && !panel.hidden) menu(root, trigger.dataset.interactionMenu, false, restoreFocus && !trigger.closest('[role="menu"]'));
  });
  const selectHistory = (history, index) => {
    const items = [...history.querySelectorAll('[data-interaction-history-item]')];
    const current = items.find(item => Number(item.value) === index);
    if (!current || current.disabled) return;
    history.dataset.interactionHistoryIndex = String(index);
    history.querySelector('[data-interaction-history-current]').textContent = current.textContent.trim();
    items.forEach(item => item.setAttribute('aria-current', item === current ? 'page' : 'false'));
    history.querySelector('[data-interaction-history-back]').disabled = root.dataset.elyDisabled === 'true' || index <= 0;
    history.querySelector('[data-interaction-history-forward]').disabled = root.dataset.elyDisabled === 'true' || index >= items.length - 1;
    change(root, {name: 'history', value: current.value, index, selected: true});
  };
  const filterPalette = (palette, query) => {
    const options = [...(palette?.querySelectorAll('[data-interaction-palette-option]') || [])];
    const hasRecent = options.some(option => option.hasAttribute('data-interaction-palette-recent'));
    const kind = palette?.closest('[data-interaction-kind]')?.dataset.interactionKind;
    const scores = new Map();
    const rank = (a, b) => {
      const text = option => kind === 'QuickOpen' ? option.value : option.querySelector('strong')?.textContent || option.textContent;
      return (scores.get(b) ?? -Infinity) - (scores.get(a) ?? -Infinity) || new TextEncoder().encode(text(a)).length - new TextEncoder().encode(text(b)).length;
    };
    options.forEach((option, index) => { option.dataset.interactionPaletteOrder ??= String(index); });
    options.sort((a, b) => Number(a.dataset.interactionPaletteOrder) - Number(b.dataset.interactionPaletteOrder));
    options.forEach(option => {
      const text = kind === 'QuickOpen' ? option.value : option.querySelector('strong')?.textContent || option.textContent;
      const fit = paletteFit(query, text);
      const score = kind === 'SearchPalette' ? (option.textContent.toLocaleLowerCase().includes(query) ? 0 : null) : fit?.score ?? null;
      scores.set(option, score);
      const visible = query ? score !== null : kind !== 'QuickOpen' || !hasRecent || option.hasAttribute('data-interaction-palette-recent');
      option.closest('li').hidden = !visible;
      const label = option.querySelector('strong');
      if (kind === 'SearchPalette') {
        option.querySelectorAll('strong, small').forEach(node => {
          const hits = [];
          if (query) {
            const text = node.textContent.toLocaleLowerCase();
            for (let at = text.indexOf(query); at >= 0; at = text.indexOf(query, at + query.length)) {
              const start = [...text.slice(0, at)].length;
              hits.push(...Array.from({length: [...query].length}, (_, i) => start + i));
            }
          }
          paletteMark(node, hits);
        });
        if (!query && options.some(item => item.hasAttribute('data-interaction-palette-suggested'))) option.closest('li').hidden = !option.hasAttribute('data-interaction-palette-suggested');
      } else if (kind === 'QuickOpen') {
        const split = [...option.value].lastIndexOf('/') + 1;
        paletteMark(label, (fit?.hits || []).filter(i => i >= split).map(i => i - split));
        paletteMark(option.querySelector('small'), (fit?.hits || []).filter(i => i < split - 1));
      } else paletteMark(label, fit?.hits || []);
    });
    if (kind === 'CommandPalette' || kind === 'SearchPalette') {
      const list = palette.querySelector('[data-interaction-palette-results]');
      list.querySelectorAll('.ely-interaction__palette-label').forEach(label => label.remove());
      const groups = new Map();
      options.forEach((option, index) => {
        option.dataset.interactionPaletteOrder ??= String(index);
        const recent = !query && kind === 'CommandPalette' && option.hasAttribute('data-interaction-palette-recent');
        const title = recent ? 'Recent' : !query && kind === 'SearchPalette' && option.hasAttribute('data-interaction-palette-suggested') ? 'Suggested' : option.dataset.interactionPaletteGroup || '';
        if (!groups.has(title)) groups.set(title, []);
        groups.get(title).push(option);
      });
      const ranked = [...groups].sort(([a, rowsA], [b, rowsB]) => query && kind === 'CommandPalette' ? Math.max(...rowsB.map(row => scores.get(row) ?? -Infinity)) - Math.max(...rowsA.map(row => scores.get(row) ?? -Infinity)) : !query && kind === 'CommandPalette' ? (a === 'Recent' ? -1 : b === 'Recent' ? 1 : 0) : 0);
      ranked.forEach(([title, rows]) => {
        rows.sort((a, b) => query && kind === 'CommandPalette' ? rank(a, b) : title === 'Recent' ? Number(a.dataset.interactionPaletteRecent) - Number(b.dataset.interactionPaletteRecent) : Number(a.dataset.interactionPaletteOrder) - Number(b.dataset.interactionPaletteOrder));
        if (title) { const heading = document.createElement('li'); heading.className = 'ely-interaction__palette-label'; heading.textContent = title; heading.setAttribute('aria-hidden', 'true'); list.append(heading); }
        rows.forEach(row => list.append(row.closest('li')));
      });
    }
    if (kind === 'QuickOpen' || kind === 'QuickSwitcher') {
      options.forEach((option, index) => { option.dataset.interactionPaletteOrder ??= String(index); });
      options.sort((a, b) => query ? rank(a, b) : Number(a.dataset.interactionPaletteOrder) - Number(b.dataset.interactionPaletteOrder));
      options.forEach((option, index) => { option.closest('ul').append(option.closest('li')); if (kind === 'QuickOpen' && query && index >= 50) option.closest('li').hidden = true; });
    }
    palette?.querySelectorAll('.ely-interaction__palette-label').forEach(label => {
      const rows = [];
      for (let node = label.nextElementSibling; node && !node.matches('.ely-interaction__palette-label'); node = node.nextElementSibling) rows.push(node);
      label.hidden = rows.length > 0 && rows.every(row => row.hidden);
    });
    const first = [...(palette?.querySelectorAll('[data-interaction-palette-option]') || [])].find(option => !option.closest('li').hidden && !option.disabled);
    options.forEach(option => option.setAttribute('aria-selected', String(option === first)));
    const empty = palette?.querySelector('[data-interaction-palette-empty]');
    if (empty) empty.hidden = Boolean(first);
    return first;
  };
  const paintUpload = row => { const state=row.dataset.interactionUploadState, progress=row.querySelector('progress'), detail=row.querySelector('[data-interaction-upload-detail]'), output=row.querySelector('[data-interaction-upload-value]'), icon=row.querySelector('.ely-interaction__feedback-icon');progress.hidden=state!=='uploading';detail.textContent=state==='failed'?row.dataset.uploadError:'';output.textContent=state==='uploading'?`${Math.round(progress.value)}%`:state==='done'?row.dataset.uploadSize:'';icon.textContent=state==='done'?'✓':state==='failed'?'!':'▤';const old=row.querySelector('button'), next=uploadButton(state==='uploading'?'data-interaction-upload-cancel':state==='failed'?'data-interaction-upload-retry':'data-interaction-upload-remove',state==='failed'?'↻':'×');next.setAttribute('aria-label',`${state==='failed'?'Retry':state==='uploading'?'Cancel':'Remove'} ${row.querySelector('strong').textContent}`);old.replaceWith(next); };
  const settleOverlay = host => { const overlay=host.querySelector('.ely-interaction__loading'), article=host.querySelector('article'); const prior=Number(host.dataset.interactionOverlayTimer);if(prior){clearTimeout(prior);timers.delete(prior);} delete host.dataset.interactionOverlayTimer; overlay.inert=true;overlay.setAttribute('aria-busy','false');const done=()=>{overlay.hidden=true;article.inert=false;host.querySelector('[data-interaction-loading-overlay-toggle]').disabled=false;change(root,{name:'loading-overlay',value:'complete'});};if(overlay.animate&&!matchMedia('(prefers-reduced-motion: reduce)').matches){const animation=overlay.animate([{opacity:1},{opacity:0}],{duration:120,fill:'both'});const cleanup=()=>animation.cancel();lottieCleanups.push(cleanup);later(()=>{cleanup();const index=lottieCleanups.indexOf(cleanup);if(index>=0)lottieCleanups.splice(index,1);done();},120);}else done(); };
  const settleSuspense = (host, failure = false) => { const prior=Number(host.dataset.interactionSuspenseTimer);if(prior){clearTimeout(prior);timers.delete(prior);} host.setAttribute('aria-busy','false'); host.querySelector('[data-interaction-suspense-content]').hidden=failure; host.querySelector('[data-interaction-suspense-error]').hidden=!failure; delete host.dataset.interactionSuspenseTimer; change(root,{name:'suspense',value:failure?'error':'loaded'}); };
  const startSuspense = (host, failure = false) => { if(!host)return; const prior=Number(host.dataset.interactionSuspenseTimer); if(prior){clearTimeout(prior);timers.delete(prior);} host.setAttribute('aria-busy','true'); host.querySelector('[data-interaction-suspense-content]').hidden=true;host.querySelector('[data-interaction-suspense-error]').hidden=true; const delay=Number(host.dataset.loadingDelay); if(delay>0)host.dataset.interactionSuspenseTimer=String(later(()=>settleSuspense(host,failure),delay));else if(failure)settleSuspense(host,true); change(root,{name:'suspense',value:'loading'}); };
  root.querySelectorAll('[data-interaction-suspense][data-loading-delay]').forEach(host=>startSuspense(host));
  root.querySelectorAll('[data-interaction-icon]').forEach(icon => { if (/^[a-z0-9-]+$/.test(icon.dataset.interactionIcon || '')) { icon.classList.add('is-icon'); icon.style.setProperty('--ely-interaction-icon', `url("/assets/ely/icons/${icon.dataset.interactionIcon}.svg")`); } });
  const toastStack = root.querySelector('.ely-interaction__toast-stack');
  root.querySelectorAll('[data-interaction-upload]').forEach(paintUpload);
  const toaster = toastStack ? feedbackToaster(toastStack, detail => change(root, detail)) : null;
  if (toaster) lottieCleanups.push(() => toaster.destroy());
  root.querySelectorAll('[data-feedback-boundary]').forEach(boundary => {
    if (boundary.closest('[data-ely-family]') === root) feedbackBoundaryLog(boundary, root.id);
  });
  const notificationHost = root.querySelector('.ely-interaction__notification');
  const notificationRows = notificationHost?.querySelector('ol').cloneNode(true);
  if (notificationHost) feedbackNotifications(notificationHost);
  root.querySelectorAll('[data-feedback-status]').forEach(host => feedbackSaving(host, Number(host.querySelector('[data-interaction-saving-state]').dataset.interactionSavingIndex), false));
  const click = event => {
    const target = event.target instanceof Element ? event.target : null;
    const button = closest(root, event.target, 'button, [data-interaction-draggable]');
    if (event.target instanceof HTMLDialogElement) {
      const dialog = event.target, box = dialog.getBoundingClientRect();
      const outside = event.clientX < box.left || event.clientX > box.right || event.clientY < box.top || event.clientY > box.bottom;
      if (dialog.dataset.interactionDismissible !== 'false' && (outside || dialog.matches('[data-interaction-lightbox], [data-interaction-palette], [data-interaction-tour]'))) closeDialog(dialog);
      return;
    }
    const anchor = target?.closest('[data-interaction-anchor]');
    if (target?.matches('.ely-interaction__pie')) {
      const bounds = target.getBoundingClientRect();
      const x = event.clientX - bounds.left - 124, y = event.clientY - bounds.top - 124;
      const items = [...target.querySelectorAll('[role="menuitem"]')];
      if (Math.hypot(x, y) < 20) close(true);
      else items[Math.round((Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) / (2 * Math.PI) * items.length) % items.length]?.click();
      return;
    }
    if ((!button || button.disabled) && !anchor) return;
    if (loadingFamily.click(event) || sourceFamily.click(event)) return;
    const tourOpen = target?.closest('[data-interaction-tour-open]');
    if (tourOpen) {
      const dialog = root.querySelector('[data-interaction-tour]');
      dialogOpeners.set(dialog, tourOpen);
      dialog.dataset.interactionTourCoach = String(tourOpen.hasAttribute('data-interaction-tour-coach'));
      if (!dialog.open) dialog.showModal();
      showTourStep(dialog, Number(tourOpen.dataset.interactionTourOpen));
      dialog.querySelector('[data-interaction-tour-next]')?.focus();
      return;
    }
    const tourStep = target?.closest('[data-interaction-tour-next], [data-interaction-tour-back]');
    if (tourStep) {
      const dialog = tourStep.closest('[data-interaction-tour]');
      const index = Number(dialog.dataset.interactionTourIndex);
      const next = index + (tourStep.hasAttribute('data-interaction-tour-back') ? -1 : 1);
      if (dialog.dataset.interactionTourCoach === 'true' || next === dialog.querySelectorAll('[data-interaction-tour-step]').length) closeDialog(dialog);
      else showTourStep(dialog, next);
      return;
    }
    const peek = target?.closest('[data-interaction-peek], [data-interaction-peek-close]');
    if (peek) {
      const stage = peek.closest('.ely-interaction__peek'), trigger = stage.querySelector('[data-interaction-peek]');
      const panel = stage.querySelector('aside'), open = peek.hasAttribute('data-interaction-peek') && panel.hidden;
      panel.hidden = !open; trigger.setAttribute('aria-expanded', String(open));
      if (!open) trigger.focus();
      change(root, {name: 'peek', value: open ? 'open' : 'closed', open});
      return;
    }
    if (target?.closest('[data-interaction-pie-close]')) { close(true); return; }
    if (anchor) {
      if (anchor.getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; }
      event.preventDefault();
      const toc = anchor.closest('[data-interaction-toc]');
      const section = toc?.querySelector(`[data-interaction-anchor-section="${CSS.escape(anchor.dataset.interactionAnchor)}"]`);
      section?.scrollIntoView({block: 'start'});
      toc?.querySelectorAll('[data-interaction-anchor]').forEach(link => link.setAttribute('aria-current', String(link === anchor ? 'location' : 'false')));
      change(root, {name: 'anchor', value: anchor.dataset.interactionAnchor, selected: true});
      return;
    }
    const lightboxOpen = target?.closest('[data-interaction-lightbox-open]');
    if (lightboxOpen) {
      const dialog = root.querySelector(`#${CSS.escape(lightboxOpen.dataset.interactionDialog)}`);
      const slides = [...root.querySelectorAll('[data-interaction-lightbox-open]:not(:disabled)')];
      const index = slides.indexOf(lightboxOpen);
      dialog.dataset.interactionLightboxIndex = String(index);
      dialog.dataset.interactionLightboxOpener = String(index);
      if (!dialog.open) dialogOpeners.set(dialog, lightboxOpen);
      setLightboxZoom(dialog, 1);
      const image = dialog.querySelector('figure img');
      const caption = dialog.querySelector('figcaption');
      if (image) { image.src = lightboxOpen.dataset.lightboxSrc || ''; image.alt = lightboxOpen.dataset.lightboxAlt || ''; }
      if (caption) caption.textContent = lightboxOpen.dataset.lightboxCaption || '';
      const previous = dialog.querySelector('[data-interaction-lightbox-previous]'), next = dialog.querySelector('[data-interaction-lightbox-next]');
      if (previous) previous.disabled = index <= 0;
      if (next) next.disabled = index >= slides.length - 1;
      if (!dialog.open) { if (dialog.showModal) dialog.showModal(); else dialog.hidden = false; }
      dialog.querySelector('[data-interaction-lightbox-viewport]')?.focus();
      return;
    }
    const lightboxStep = target?.closest('[data-interaction-lightbox-previous], [data-interaction-lightbox-next]');
    if (lightboxStep) {
      const dialog = lightboxStep.closest('[data-interaction-lightbox]');
      const slides = [...root.querySelectorAll('[data-interaction-lightbox-open]:not(:disabled)')];
      if (!slides.length) return;
      const at = Number(dialog.dataset.interactionLightboxIndex || 0);
      const next = at + (lightboxStep.hasAttribute('data-interaction-lightbox-next') ? 1 : -1);
      if (!slides[next]) return;
      slides[next].click();
      change(root, {name: 'lightbox', value: slides[next].dataset.lightboxSrc || '', index: next});
      return;
    }
    const zoomControl = target?.closest('[data-interaction-lightbox-zoom-in], [data-interaction-lightbox-zoom-out], [data-interaction-lightbox-zoom-reset]');
    if (zoomControl) {
      const dialog = zoomControl.closest('[data-interaction-lightbox]');
      const current = Number(dialog.dataset.interactionLightboxZoom || 1);
      const zoom = zoomControl.hasAttribute('data-interaction-lightbox-zoom-in') ? current + .25 : zoomControl.hasAttribute('data-interaction-lightbox-zoom-out') ? current - .25 : 1;
      change(root, {name: 'lightbox-zoom', value: String(setLightboxZoom(dialog, zoom))});
      return;
    }
    const fullscreen = target?.closest('[data-interaction-lightbox-fullscreen]');
    if (fullscreen) {
      const dialog = fullscreen.closest('[data-interaction-lightbox]');
      if (document.fullscreenElement === dialog) document.exitFullscreen?.();
      else if (dialog?.requestFullscreen) dialog.requestFullscreen().catch(() => dialog.classList.toggle('is-fullscreen'));
      else dialog?.classList.toggle('is-fullscreen');
      return;
    }
    const confirmTwice = target?.closest('[data-interaction-confirm-mode="twice"]');
    if (confirmTwice) { const armed = confirmTwice.dataset.interactionConfirmArmed === 'true'; if (armed) { delete confirmTwice.dataset.interactionConfirmArmed; confirmTwice.textContent = confirmTwice.dataset.interactionConfirmLabel || confirmTwice.textContent; emit(root, confirmTwice.dataset.interactionHold || 'confirm', {value: confirmTwice.value || ''}); root.querySelector('[data-interaction-status]')?.replaceChildren(document.createTextNode('confirmed')); } else { confirmTwice.dataset.interactionConfirmArmed = 'true'; confirmTwice.dataset.interactionConfirmLabel = confirmTwice.textContent; confirmTwice.textContent = 'Click again to confirm'; later(() => { if (confirmTwice.dataset.interactionConfirmArmed === 'true') { delete confirmTwice.dataset.interactionConfirmArmed; confirmTwice.textContent = confirmTwice.dataset.interactionConfirmLabel || 'Confirm'; } }, 3000); } change(root, {name: 'confirm', value: confirmTwice.value || '', armed: !armed}); return; }
    const copy = target?.closest('[data-interaction-copy]');
    if (copy) { const value = copy.value || ''; const status = root.querySelector('[data-interaction-copy-status]'); const copied = () => { if (status) status.textContent = 'Copied'; copy.dataset.interactionCopied = 'true'; emit(root, copy.dataset.elyAction || 'copy', {value}); change(root, {name: 'copy', value, copied: true}); }; if (navigator.clipboard?.writeText) navigator.clipboard.writeText(value).then(copied, copied); else copied(); return; }
    const bulkAdd = target?.closest('[data-interaction-bulk-add]');
    if (bulkAdd) { const host = bulkAdd.closest('[data-interaction-bulk]'); const next = Number(host?.dataset.interactionBulkCount || 0) + 1; if (host) { host.dataset.interactionBulkCount = String(next); host.querySelector('[data-interaction-bulk-count]').textContent = String(next); host.querySelector('[data-interaction-bulk-summary]').textContent = `${next} selected`; host.querySelector('.ely-interaction__bar.is-bulk').hidden = false; } change(root, {name: 'bulk', value: String(next), selected: true}); return; }
    const bulkClear = target?.closest('[data-interaction-bulk-clear]');
    if (bulkClear) { const host = bulkClear.closest('[data-interaction-bulk]'); if (host) { host.dataset.interactionBulkCount = '0'; host.querySelector('[data-interaction-bulk-count]').textContent = '0'; host.querySelector('[data-interaction-bulk-summary]').textContent = '0 selected'; host.querySelector('.ely-interaction__bar.is-bulk').hidden = true; } change(root, {name: 'bulk', value: '0', selected: false}); return; }
    const sheetAction = target?.closest('[data-interaction-sheet-action]');
    if (sheetAction) { emit(root, sheetAction.dataset.elyAction || 'select', {value: sheetAction.value || ''}); closeDialog(sheetAction.closest('dialog')); return; }
    const toastShow = target?.closest('[data-interaction-toast-show]');
    if (toastShow) { toaster?.show(toastShow.dataset.interactionToastShow); return; }
    const toastControl = target?.closest('.ely-interaction__toast [data-interaction-toast-dismiss], .ely-interaction__toast [data-ely-action]');
    if (toastControl) { toaster?.dismiss(toastControl.closest('.ely-interaction__toast'), toastControl.dataset.elyAction || 'dismissed'); return; }
    const notificationControl = target?.closest('[data-interaction-notification-dismiss], [data-interaction-notification-read], [data-interaction-notification-clear], [data-interaction-notification-reset]');
    if (notificationControl && notificationHost) {
      let value;
      if (notificationControl.hasAttribute('data-interaction-notification-read')) { notificationHost.querySelectorAll('[data-interaction-notification]').forEach(item => { item.classList.add('is-read'); item.removeAttribute('data-interaction-unread'); }); value = 'read-all'; }
      else if (notificationControl.hasAttribute('data-interaction-notification-reset')) { notificationHost.querySelector('ol').replaceWith(notificationRows.cloneNode(true)); value = 'reset'; }
      else if (notificationControl.hasAttribute('data-interaction-notification-clear')) { notificationHost.querySelectorAll('[data-interaction-notification]').forEach(item => item.remove()); value = 'cleared'; }
      else { notificationControl.closest('[data-interaction-notification]').remove(); value = 'dismissed'; }
      feedbackNotifications(notificationHost);
      notificationHost.querySelector('[data-interaction-notification-status]').textContent = value === 'read-all' ? 'All notifications marked read' : value === 'cleared' ? 'Notifications cleared' : '';
      change(root, {name: 'notification', value}); return;
    }
    const alertDismiss = target?.closest('[data-interaction-alert-dismiss]');
    if (alertDismiss) { const alert = alertDismiss.closest('[data-interaction-alert]'); alert.hidden = true; const restore = alert.parentElement.querySelector('[data-interaction-alert-show]'); if (restore) restore.hidden = false; change(root, {name: 'alert', value: 'dismissed'}); return; }
    const alertShow = target?.closest('[data-interaction-alert-show]');
    if (alertShow) { alertShow.parentElement.querySelector('[data-interaction-alert]').hidden = false; alertShow.hidden = true; change(root, {name: 'alert', value: 'shown'}); return; }
    const bannerDismiss = target?.closest('[data-interaction-banner-dismiss]');
    if (bannerDismiss) {
      const stage = bannerDismiss.closest('.ely-interaction__banner-stage'), banner = stage.querySelector('[data-interaction-banner]');
      if (banner.inert) return;
      const hide = () => { banner.hidden = true; banner.inert = false; stage.querySelector('[data-interaction-banner-show]')?.removeAttribute('hidden'); change(root, {name: 'banner', value: 'dismissed'}); };
      if (banner.animate && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
        banner.inert = true;
        const animation = banner.animate([{height: `${banner.offsetHeight}px`, minHeight: 0, opacity: 1}, {height: '0px', minHeight: 0, paddingTop: 0, paddingBottom: 0, opacity: 0}], {duration: 200, easing: 'ease-out', fill: 'forwards'});
        const cleanup = () => animation.cancel(); lottieCleanups.push(cleanup);
        later(() => { cleanup(); const index = lottieCleanups.indexOf(cleanup); if (index >= 0) lottieCleanups.splice(index, 1); hide(); }, 200);
      } else hide();
      return;
    }
    const bannerShow = target?.closest('[data-interaction-banner-show]');
    if (bannerShow) { const stage = bannerShow.closest('.ely-interaction__banner-stage'); stage?.querySelector('[data-interaction-banner]')?.removeAttribute('hidden'); bannerShow.setAttribute('hidden', ''); change(root, {name: 'banner', value: 'shown'}); return; }
    const statusNext = target?.closest('[data-interaction-status-next]');
    if (statusNext) { const line = statusNext.closest('.ely-interaction__status-line'); const values = [...line.querySelectorAll('[data-interaction-status-values] i')]; const output = line.querySelector('[data-interaction-status-message]'); if (values.length && output) { const next = (Number(output.dataset.interactionStatusIndex || 0) + 1) % values.length; output.dataset.interactionStatusIndex = String(next); output.textContent = values[next].textContent; feedbackRise(output); change(root, {name: 'status', value: output.textContent, index: next}); } return; }
    const savingControl = target?.closest('[data-interaction-saving-next], [data-interaction-saving-retry]');
    if (savingControl) { const host = savingControl.closest('.ely-interaction__saving-state'); const index = savingControl.hasAttribute('data-interaction-saving-retry') ? 0 : Number(host.querySelector('[data-interaction-saving-state]').dataset.interactionSavingIndex) + 1; const detail = feedbackSaving(host, index); if (detail) change(root, detail); return; }
    const confirmation = target?.closest('.ely-interaction__confirmation [data-ely-action]');
    if (confirmation) { const status = root.querySelector('[data-interaction-confirmation-status]'); if (status) status.textContent = confirmation.dataset.feedbackMessage || confirmation.textContent.trim(); change(root, {name: 'confirmation', value: confirmation.value, action: confirmation.dataset.elyAction}); return; }
    const boundary = target?.closest('[data-feedback-boundary]');
    if (boundary && (target.closest('[data-feedback-boundary-toggle]') || target.closest('[data-ely-action]') && boundary.querySelector('[data-feedback-boundary-toggle]'))) {
      const error = boundary.querySelector('[data-feedback-boundary-error]'), content = boundary.querySelector('[data-feedback-boundary-content]'), demo = boundary.querySelector('[data-feedback-boundary-toggle]');
      const failed = target.closest('[data-feedback-boundary-toggle]') ? error.hidden : false;
      error.hidden = !failed; content.hidden = failed; demo.textContent = failed ? 'Fix it' : 'Break it';
      if (failed) { error.querySelector('p')?.remove(); const body = document.createElement('p'); body.textContent = demo.dataset.feedbackError; error.querySelector('h2').parentElement.append(body); const detail = error.querySelector('code'); if (detail) detail.textContent = demo.dataset.feedbackDetail; }
      feedbackBoundaryLog(boundary, root.id);
      change(root, {name: 'boundary', failed}); return;
    }
    const replay = target?.closest('[data-feedback-result-replay]');
    if (replay) { root.querySelectorAll('.ely-interaction__result-mark').forEach(mark => { const replacement = mark.cloneNode(true); mark.replaceWith(replacement); }); change(root, {name: 'result', value: 'replay'}); return; }
    const shimmer = target?.closest('[data-interaction-shimmer-toggle]');
    if (shimmer) { const card = shimmer.closest('[data-interaction-shimmer]'); const loaded = card?.classList.toggle('is-loaded'); shimmer.textContent = loaded ? 'Reload' : 'Load'; change(root, {name: 'shimmer', value: loaded ? 'loaded' : 'loading'}); return; }
    const overlayToggle = target?.closest('[data-interaction-loading-overlay-toggle]');
    if (overlayToggle) { const host=overlayToggle.closest('[data-interaction-loading-overlay]'), overlay=host.querySelector('.ely-interaction__loading');if(!overlay.hidden)return;overlay.hidden=false;overlay.inert=false;overlay.setAttribute('aria-busy','true');host.querySelector('article').inert=true;overlayToggle.disabled=true;const delay=Number(host.dataset.loadingDelay);if(delay>0)host.dataset.interactionOverlayTimer=String(later(()=>settleOverlay(host),delay));change(root,{name:'loading-overlay',value:'loading'});return; }
    const overlayCancel=target?.closest('[data-interaction-loading-overlay-cancel]');
    if(overlayCancel){settleOverlay(overlayCancel.closest('[data-interaction-loading-overlay]'));return;}
    const suspenseToggle = target?.closest('[data-interaction-suspense-toggle]');
    if (suspenseToggle) { startSuspense(suspenseToggle.closest('[data-interaction-suspense]')); return; }
    const suspenseFail = target?.closest('[data-interaction-suspense-fail]');
    if (suspenseFail) { startSuspense(suspenseFail.closest('[data-interaction-suspense]'), true); return; }
    const uploadControl = target?.closest('[data-interaction-upload-cancel], [data-interaction-upload-retry], [data-interaction-upload-remove]');
    if(uploadControl){const row=uploadControl.closest('[data-interaction-upload]'), retry=uploadControl.hasAttribute('data-interaction-upload-retry'), value=row.dataset.value||row.dataset.interactionUploadIndex;if(retry){row.dataset.interactionUploadState='uploading';row.querySelector('progress').value=0;paintUpload(row);}else row.remove();change(root,{name:'upload',value,action:retry?'retry':'removed'});return;}
    const uploadTick=target?.closest('[data-interaction-upload-tick]');
    if(uploadTick){root.querySelectorAll('[data-interaction-upload][data-interaction-upload-state="uploading"]').forEach(row=>{const progress=row.querySelector('progress');progress.value=Number(progress.value)>=80?100:Number(progress.value)+20;if(progress.value>=100)row.dataset.interactionUploadState='done';paintUpload(row);});change(root,{name:'upload',value:'progressed'});return;}
    const transitionToggle = target?.closest('[data-interaction-transition-toggle]');
    if (transitionToggle) { const article = transitionToggle.closest('[data-interaction-transition]')?.querySelector('article'); const hidden = article?.toggleAttribute('hidden'); transitionToggle.textContent = hidden ? 'Show' : 'Hide'; change(root, {name: 'transition', value: hidden ? 'hidden' : 'shown'}); return; }
    const staggerReplay = target?.closest('[data-interaction-stagger-replay]');
    if (staggerReplay) { const host = staggerReplay.closest('[data-interaction-stagger]'); host?.classList.remove('is-replaying'); requestAnimationFrame(() => host?.classList.add('is-replaying')); change(root, {name: 'stagger', value: 'replayed'}); return; }
    const presenceToggle = target?.closest('[data-interaction-presence-toggle]');
    if (presenceToggle) { const list = presenceToggle.closest('[data-interaction-presence]')?.querySelector('[data-interaction-presence-list]'); if (list) { const item = document.createElement('div'); item.className = 'ely-interaction__presence-item'; item.textContent = 'New workspace tag'; list.append(item); } change(root, {name: 'presence', value: 'added'}); return; }
    const flipToggle = target?.closest('[data-interaction-flip-toggle]');
    if (flipToggle) { const list = flipToggle.closest('[data-interaction-flip]')?.querySelector('.ely-interaction__items'); if (list?.firstElementChild) list.append(list.firstElementChild); change(root, {name: 'flip', value: 'shuffled'}); return; }
    const countdownControl = target?.closest('[data-interaction-countdown-toggle], [data-interaction-countdown-reset]');
    if (countdownControl) {
      const output = root.querySelector('[data-interaction-countdown]');
      if (!output) return;
      if (countdownControl.hasAttribute('data-interaction-countdown-reset')) {
        output.dataset.interactionCountdown = output.dataset.interactionCountdownInitial || '0';
        output.textContent = formatCountdown(Number(output.dataset.interactionCountdown));
        output.dataset.interactionCountdownPaused = 'false';
        root.querySelector('[data-interaction-countdown-toggle]')?.replaceChildren(document.createTextNode('Pause'));
      } else {
        const paused = output.dataset.interactionCountdownPaused !== 'true';
        output.dataset.interactionCountdownPaused = String(paused);
        countdownControl.textContent = paused ? 'Resume' : 'Pause';
      }
      change(root, {name: 'countdown', value: output.dataset.interactionCountdown, paused: output.dataset.interactionCountdownPaused === 'true'});
      return;
    }
    const editorClose = target?.closest('[data-interaction-editor-close]');
    if (editorClose) {
      const item = editorClose.closest('[data-editor-tab]');
      const wasSelected = item?.querySelector('[data-interaction-tab]')?.getAttribute('aria-selected') === 'true';
      const tabs = [...(item?.parentElement?.querySelectorAll('[data-interaction-editor-tab]') || [])];
      const index = tabs.indexOf(item);
      const fallback = tabs[index + 1] || tabs[index - 1];
      const panelID = item?.querySelector('[data-interaction-tab]')?.getAttribute('aria-controls');
      item?.remove();
      if (panelID) root.querySelector(`#${CSS.escape(panelID)}`)?.remove();
      if (wasSelected) fallback?.querySelector('[data-interaction-tab]:not(:disabled)')?.click();
      change(root, {name: 'editor-tab', value: item?.dataset.editorTab || '', closed: true});
      return;
    }
    const editorAdd = target?.closest('[data-interaction-editor-add]');
    if (editorAdd) {
      const stage = editorAdd.closest('[data-interaction-editor-stage]');
      const list = stage?.querySelector('[data-interaction-tabs]');
      const panes = stage?.querySelector('.ely-interaction__editor-panes');
      const serial = String((Number(stage?.dataset.interactionEditorSerial || list?.querySelectorAll('[data-interaction-editor-tab]').length || 0)) + 1);
      if (!stage || !list || !panes) return;
      stage.dataset.interactionEditorSerial = serial;
      const id = `${root.id || 'editor'}-new-${serial}`;
      const item = document.createElement('span');
      item.className = 'ely-interaction__editor-tab';
      item.dataset.editorTab = `untitled-${serial}`;
      item.dataset.interactionEditorTab = '';
      item.dataset.interactionValue = `untitled-${serial}`;
      item.draggable = true;
      item.innerHTML = `<button id="${id}-tab" type="button" role="tab" value="untitled-${serial}" aria-controls="${id}-panel" aria-selected="false" tabindex="-1" data-interaction-tab><span data-interaction-icon="file" aria-hidden="true"></span>untitled-${serial}.rs</button><button type="button" class="ely-interaction__editor-close" aria-label="Close untitled-${serial}.rs" data-interaction-editor-close>×</button>`;
      list.insertBefore(item, editorAdd);
      const panel = document.createElement('section');
      panel.id = `${id}-panel`;
      panel.setAttribute('role', 'tabpanel');
      panel.setAttribute('aria-labelledby', `${id}-tab`);
      panel.hidden = true;
      panel.textContent = 'A new unsaved file.';
      panes.append(panel);
      item.querySelector('[data-interaction-tab]')?.click();
      change(root, {name: 'editor-tab', value: item.dataset.editorTab, added: true});
      return;
    }
    const editorPin = target?.closest('[data-interaction-editor-pin]');
    if (editorPin) {
      const pinned = editorPin.getAttribute('aria-pressed') !== 'true';
      editorPin.setAttribute('aria-pressed', String(pinned));
      change(root, {name: 'editor-tab', value: editorPin.value, pinned});
      return;
    }
    const editorSelect = target?.closest('[data-interaction-editor-select]');
    if (editorSelect) {
      root.querySelector(`[data-editor-tab="${CSS.escape(editorSelect.dataset.interactionEditorSelect)}"] [data-interaction-tab]`)?.click();
      close(true);
      return;
    }
    const toggle = target?.closest('[data-interaction-toggle]');
    if (toggle) {
      const pressed = toggle.getAttribute('aria-pressed') !== 'true';
      const group = toggle.closest('[data-interaction-toggle-group="single"]');
      if (group && pressed) group.querySelectorAll('[data-interaction-toggle]').forEach(item => item.setAttribute('aria-pressed', String(item === toggle)));
      toggle.setAttribute('aria-pressed', String(pressed));
      change(root, {name: toggle.name || '', value: toggle.value, pressed});
      return;
    }
    const choice = target?.closest('[data-interaction-choice]');
    if (choice) {
      choice.closest('[role="radiogroup"]')?.querySelectorAll('[data-interaction-choice]').forEach(item => item.setAttribute('aria-checked', String(item === choice)));
      change(root, {name: choice.name || '', value: choice.value, selected: true});
      return;
    }
    const checkbox = target?.closest('[data-interaction-checkbox]');
    const radio = target?.closest('[data-interaction-menu-radio]');
    if (radio) {
      radio.closest('[role="menu"]').querySelectorAll('[data-interaction-menu-radio]').forEach(item => {
        if (item.dataset.interactionMenuRadio === radio.dataset.interactionMenuRadio) item.setAttribute('aria-checked', String(item === radio));
      });
      change(root, {name: radio.dataset.interactionMenuRadio, value: radio.value, checked: true});
      close(true);
      return;
    }
    if (checkbox) {
      const checked = checkbox.getAttribute('aria-checked') !== 'true';
      checkbox.setAttribute('aria-checked', String(checked));
      change(root, {name: checkbox.name || '', value: checkbox.value, checked});
      if (checkbox.closest('[role="menu"]')) close(true);
      return;
    }
    const select = target?.closest('[data-interaction-select]');
    if (select) {
      select.closest('.ely-interaction__items, [role="group"]')?.querySelectorAll('[data-interaction-select]').forEach(item => item.setAttribute('aria-current', item === select ? 'true' : 'false'));
      change(root, {name: select.name || '', value: select.value, selected: true});
      return;
    }
    const tab = target?.closest('[data-interaction-tab]');
    if (tab) {
      const tabs = [...(tab.closest('[data-interaction-tabs]')?.querySelectorAll('[data-interaction-tab]:not(:disabled)') || [])];
      tabs.forEach((item, index) => {
        const selected = item === tab;
        item.setAttribute('aria-selected', String(selected));
        item.tabIndex = selected ? 0 : -1;
        const panelID = item.getAttribute('aria-controls');
        const panel = panelID ? root.querySelector(`#${CSS.escape(panelID)}`) : null;
        if (panel) panel.hidden = !selected;
        if (selected) change(root, {name: 'tab', value: item.value || String(index), selected: true});
      });
      return;
    }
    const page = target?.closest('[data-interaction-page]');
    if (page) {
      page.closest('.ely-interaction__pagination')?.querySelectorAll('[data-interaction-page]').forEach(item => item.setAttribute('aria-current', item === page ? 'page' : 'false'));
      const status = root.querySelector('.ely-interaction__page-status');
      if (status) status.textContent = `page ${page.value} of ${page.closest('.ely-interaction')?.dataset.interactionTotal || status.textContent.split(' of ').at(-1)}`;
      change(root, {name: 'page', value: page.value, selected: true});
      return;
    }
    const trigger = target?.closest('[data-interaction-menu]');
    if (trigger) { const panel = root.querySelector(`#${CSS.escape(trigger.dataset.interactionMenu)}`); const open = Boolean(panel?.hidden); if (trigger.closest('.ely-interaction__navigation-menu, .ely-interaction__menubar') && !trigger.closest('[role="menu"]')) close(); menu(root, trigger.dataset.interactionMenu, open); return; }
    if (target?.closest('.ely-interaction__navigation-menu [role="menuitem"]')) { close(true); return; }
    const historyControl = target?.closest('[data-interaction-history-back], [data-interaction-history-forward], [data-interaction-history-item]');
    if (historyControl) {
      const history = historyControl.closest('[data-interaction-history]');
      const current = Number(history?.dataset.interactionHistoryIndex || 0);
      const next = historyControl.hasAttribute('data-interaction-history-back') ? current - 1 : historyControl.hasAttribute('data-interaction-history-forward') ? current + 1 : Number(historyControl.value);
      selectHistory(history, next);
      if (historyControl.hasAttribute('data-interaction-history-item')) close(true);
      return;
    }
    const opener = target?.closest('[data-interaction-dialog]');
    if (opener) { const dialog = root.querySelector(`#${CSS.escape(opener.dataset.interactionDialog)}`); if (dialog) dialogOpeners.set(dialog, opener); if (dialog?.showModal && !dialog.open) dialog.showModal(); else if (dialog && !dialog.open) dialog.hidden = false; (dialog?.querySelector('input:not(:disabled)') || dialog?.querySelector('[data-ely-action]:not(:disabled), [data-interaction-close]:not(:disabled)'))?.focus(); return; }
    const paletteOption = target?.closest('[data-interaction-palette-option]');
    if (paletteOption) {
      const results = paletteOption.closest('[data-interaction-palette-results]');
      results?.querySelectorAll('[data-interaction-palette-option]').forEach(option => option.setAttribute('aria-selected', String(option === paletteOption)));
      change(root, {name: 'palette', value: paletteOption.value, selected: true});
      closeDialog(paletteOption.closest('dialog'));
      return;
    }
    if (target?.closest('[data-interaction-step]')) {
      const step = target.closest('[data-interaction-step]');
      selectWizardStep(root, step.closest('[data-interaction-wizard]'), Number(step.dataset.interactionStepIndex));
      return;
    }
    const stepDirection = target?.closest('[data-interaction-step-back], [data-interaction-step-next]');
    if (stepDirection) {
      const wizard = stepDirection.closest('[data-interaction-wizard]');
      const active = [...wizard.querySelectorAll('[data-interaction-step]')].findIndex(step => step.getAttribute('aria-current') === 'step');
      selectWizardStep(root, wizard, active + (stepDirection.hasAttribute('data-interaction-step-next') ? 1 : -1));
      return;
    }
    const breadcrumbSibling = target?.closest('[data-interaction-breadcrumb-sibling]');
    if (breadcrumbSibling) {
      const choice = breadcrumbSibling.closest('.ely-interaction__breadcrumb-choice');
      root.querySelector('.ely-interaction__breadcrumb-status').textContent = `went to ${breadcrumbSibling.value}`;
      close(true);
      change(root, {name: 'breadcrumb', value: breadcrumbSibling.value, selected: true});
      return;
    }
    const navGroup = target?.closest('[data-interaction-nav-group-toggle]');
    if (navGroup) { const content = navGroup.nextElementSibling; const open = content?.hidden; if (content) content.hidden = !open; navGroup.setAttribute('aria-expanded', String(open)); return; }
    const navItem = target?.closest('[data-interaction-nav]');
    if (navItem) {
      event.preventDefault();
      const stage = navItem.closest('[data-interaction-sidebar-stage]');
      stage?.querySelectorAll('[data-interaction-nav]').forEach(item => item.setAttribute('aria-current', String(item === navItem ? 'page' : 'false')));
      stage?.querySelectorAll('[data-interaction-nav-panel]').forEach(panel => panel.hidden = panel.dataset.interactionNavPanel !== navItem.dataset.interactionNavValue);
      change(root, {name: 'sidebar', value: navItem.dataset.interactionNavValue, selected: true});
      return;
    }
    const navFold = target?.closest('[data-interaction-nav-fold]');
    if (navFold) { const nav = navFold.closest('[data-interaction-sidebar]'); const folded = nav?.classList.toggle('is-folded'); navFold.setAttribute('aria-pressed', String(folded)); navFold.textContent = folded ? 'Expand' : 'Collapse'; change(root, {name: 'sidebar', value: folded ? 'folded' : 'expanded'}); return; }
    if (target?.closest('[data-interaction-close]')) { const dialog = target.closest('dialog'); if (dialog) { if (dialog.dataset.interactionDismissible !== 'false') closeDialog(dialog); } else { const panel = target.closest('[data-interaction-popover]'); if (panel) menu(root, panel.id, false, true); } return; }
    const dismiss = target?.closest('[data-interaction-dismiss]');
    if (dismiss) { dismiss.closest('.ely-interaction')?.setAttribute('hidden', ''); change(root, {name: 'dismissed', value: 'true'}); return; }
    const menuItem = target?.closest('[role="menu"] [role="menuitem"]');
    if (menuItem) { close(true); return; }
    if (target?.closest('[data-interaction-more], [data-interaction-loading]')) { beginPending(button); return; }
    if (target?.closest('[data-interaction-refresh]')) { const host = button.closest('.ely-interaction__refresh-set'); const output = host?.querySelector('[data-interaction-refresh-live]'); button.setAttribute('aria-busy', 'true'); if (output) output.textContent = 'Refreshing'; const done = later(() => { if (output) output.textContent = 'Done'; button.setAttribute('aria-busy', 'false'); change(root, {name: 'refresh', value: 'done'}); }, 1200); host.dataset.interactionRefreshTimer = String(done); later(() => { if (output) output.textContent = 'Idle'; delete host.dataset.interactionRefreshTimer; }, 2600); change(root, {name: 'refresh', value: 'refreshing'}); return; }
    if (target?.closest('[data-interaction-ripple]')) { button.classList.add('is-rippling'); later(() => button.classList.remove('is-rippling'), 300); return; }
    if (target?.closest('[data-interaction-resize]')) { const box = target.closest('[data-interaction-resizable]'); box?.classList.toggle('is-expanded'); change(root, {name: 'size', value: box?.classList.contains('is-expanded') ? 'expanded' : 'default'}); return; }
    if (target?.closest('[data-interaction-undo], [data-interaction-redo]')) { const history = root.querySelector('[data-interaction-history]'); const direction = target.hasAttribute('data-interaction-undo') ? 'undo' : 'redo'; if (history) history.textContent = direction; change(root, {name: 'history', value: direction}); return; }
    const tally = target?.closest('[data-interaction-increment], [data-interaction-decrement]');
    if (tally) { const output = root.querySelector('[data-interaction-undo-count]'); if (output) { const value = Number(output.value || output.textContent || 0) + (tally.hasAttribute('data-interaction-increment') ? 1 : -1); output.value = String(value); output.textContent = output.value; change(root, {name: 'count', value: output.value}); } return; }
    const autofocus = target?.closest('[data-interaction-autofocus-toggle]');
    if (autofocus) { const field = autofocus.nextElementSibling; const open = field?.hidden; if (field) field.hidden = !open; autofocus.textContent = open ? 'Hide the field' : 'Show a field'; if (open) field.querySelector('input:not(:disabled)')?.focus(); return; }
  };
  const input = event => {
    const jump = closest(root, event.target, '[data-interaction-jump] input');
    if (jump) {
      const form = jump.closest('form');
      const match = jump.value.trim().match(/^(\d+)\s*(?::\s*(\d+))?$/);
      const max = Number(form.dataset.interactionJumpMax);
      const valid = Boolean(match) && Number.isSafeInteger(Number(match[1])) && Number(match[1]) >= 1 && Number(match[1]) <= max && (!match[2] || (Number.isSafeInteger(Number(match[2])) && Number(match[2]) >= 1));
      jump.setCustomValidity(jump.value.trim() && !valid ? `Enter a line from 1 to ${max}, or line:column` : '');
      form.dataset.interactionJumpState = jump.value.trim() ? valid ? 'valid' : 'invalid' : 'empty';
      form.querySelector('[data-interaction-jump-note]').textContent = valid ? `Line ${Number(match[1])}${match[2] ? `, column ${Number(match[2])}` : ''}` : `Lines 1 to ${max}`;
      return;
    }
    const field = closest(root, event.target, '[data-interaction-filter]');
    if (!field || field.disabled) return;
    const palette = field.closest('[data-interaction-palette]');
    const query = field.value.trim().toLocaleLowerCase();
    if (!palette) {
      const rows = [...field.parentElement.querySelectorAll('.ely-interaction__items > *')];
      const fits = new Map();
      rows.forEach((row, index) => {
        row.dataset.menuOrder ??= String(index);
        const label = row.querySelector?.('[data-interaction-menu-label]');
        const structural = row.matches?.('[role="separator"], .ely-interaction__menu-heading');
        const fit = query && structural ? null : paletteFit(query, label?.textContent || row.textContent);
        fits.set(row, fit);
        row.hidden = !fit;
        if (label) paletteMark(label, fit?.hits || []);
      });
      rows.sort((a, b) => (query ? (fits.get(b)?.score ?? -Infinity) - (fits.get(a)?.score ?? -Infinity) : 0) || Number(a.dataset.menuOrder) - Number(b.dataset.menuOrder));
      rows.forEach(row => row.parentElement?.append(row));
      change(root, {name: field.name || 'filter', value: field.value});
      return;
    }
    filterPalette(palette, query);
    change(root, {name: field.name || 'filter', value: field.value});
  };
  const submit = event => {
    const form = closest(root, event.target, '[data-interaction-jump]');
    if (!form) return;
    event.preventDefault();
    const field = form.querySelector('input:not(:disabled)');
    const match = field?.value.trim().match(/^(\d+)\s*(?::\s*(\d+))?$/);
    const line = Number(match?.[1]);
    const column = Number(match?.[2] || 0);
    const max = Number(form.dataset.interactionJumpMax || 0);
    const valid = Boolean(match) && Number.isSafeInteger(line) && line >= 1 && line <= max && (!match?.[2] || (Number.isSafeInteger(column) && column >= 1));
    event.stopImmediatePropagation();
    form.dataset.interactionJumpState = valid ? 'valid' : 'invalid';
    const status = form.querySelector('[data-interaction-jump-status]');
    if (status) status.textContent = valid ? `Line ${line}${column ? `, column ${column}` : ''}` : `Enter a line from 1 to ${max}${max ? ', or line:column' : ''}`;
    if (valid) {
      const formData = new FormData(form);
      emit(root, form.dataset.elySubmit || 'jump', {value: field.value, line, column: column || null, formData, values: [...formData]});
      change(root, {name: field.name || 'target', value: field.value, line, column: column || null});
    }
  };
  const result = event => {
    if (event.target !== root) return;
    root.querySelectorAll('[data-interaction-loading-overlay]').forEach(host=>{if(host.dataset.loadingAction===event.detail.action)settleOverlay(host);});
    root.querySelectorAll('[data-interaction-suspense]').forEach(host => { if (host.dataset.loadingAction === event.detail.action) settleSuspense(host, false); });
    root.querySelectorAll('[data-interaction-pending-action]').forEach(button => {
      if (button.dataset.interactionPendingAction === event.detail.action) settlePending(button, true);
    });
    root.querySelectorAll('dialog[open] [data-interaction-dialog-action]').forEach(button => {
      if (button.dataset.elyAction === event.detail.action) closeDialog(button.closest('dialog'));
    });
    root.querySelectorAll('dialog[open] [data-interaction-dialog-form]').forEach(form => {
      if (form.dataset.elySubmit === event.detail.action) closeDialog(form.closest('dialog'));
    });
  };
  const error = event => {
    if (event.target !== root) return;
    root.querySelectorAll('[data-interaction-loading-overlay]').forEach(host=>{if(host.dataset.loadingAction===event.detail.action)settleOverlay(host);});
    root.querySelectorAll('[data-interaction-suspense]').forEach(host => { if (host.dataset.loadingAction === event.detail.action) settleSuspense(host, true); });
    root.querySelectorAll('[data-interaction-pending-action]').forEach(button => {
      if (button.dataset.interactionPendingAction === event.detail.action) settlePending(button, false);
    });
  };
  const keydown = event => {
    if (sourceFamily.keydown(event)) return;
    const searchField = closest(root, event.target, '[data-interaction-search-menu] input');
    if (searchField && ['ArrowDown', 'ArrowUp', 'Enter'].includes(event.key)) {
      event.preventDefault();
      const items = [...searchField.parentElement.querySelectorAll('[role="menuitem"]:not(:disabled), [role="menuitemcheckbox"]:not(:disabled), [role="menuitemradio"]:not(:disabled)')].filter(item => !item.closest('[hidden]'));
      const item = event.key === 'ArrowUp' ? items.at(-1) : items[0];
      if (event.key === 'Enter') item?.click(); else item?.focus();
      return;
    }
    const pie = closest(root, event.target, '.ely-interaction__pie');
    if (pie && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) {
      event.preventDefault();
      const items = [...pie.querySelectorAll('[role="menuitem"]:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      items[(index + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : items.length - 1)) % items.length]?.focus();
      return;
    }
    const menuTrigger = closest(root, event.target, '.ely-interaction--menus [data-interaction-menu]');
    if (menuTrigger && !menuTrigger.disabled && (event.key === 'ArrowDown' && !menuTrigger.closest('[role="menu"]') || event.key === 'ArrowRight' && menuTrigger.closest('[role="menu"]'))) {
      event.preventDefault(); menu(root, menuTrigger.dataset.interactionMenu, true); return;
    }
    const nested = closest(root, event.target, '.ely-interaction__menu-row > [role="menu"]');
    if (nested && ['ArrowLeft', 'Escape'].includes(event.key)) { event.preventDefault(); menu(root, nested.id, false, true); return; }
    const menubar = closest(root, event.target, '.ely-interaction__menubar');
    if (menubar && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      const triggers = [...menubar.querySelectorAll(':scope > .ely-interaction__menu > button:not(:disabled)')];
      const index = triggers.findIndex(trigger => trigger.parentElement.contains(event.target));
      const next = triggers[(index + (event.key === 'ArrowRight' ? 1 : triggers.length - 1)) % triggers.length];
      const open = Boolean(menubar.querySelector('[aria-expanded="true"]'));
      close(); next?.focus();
      if (open && next) menu(root, next.dataset.interactionMenu, true);
      return;
    }
    const context = closest(root, event.target, '[data-interaction-context]');
    if (context && (event.key === 'ContextMenu' || event.shiftKey && event.key === 'F10')) { event.preventDefault(); context.querySelector('[data-interaction-menu]:not(:disabled)')?.click(); return; }
    const confirmHold = closest(root, event.target, '[data-interaction-confirm-mode="hold"]');
    if (confirmHold && !event.repeat && [' ', 'Enter'].includes(event.key)) { event.preventDefault(); holdStart(event); return; }
    const openDialog = closest(root, event.target, 'dialog[open], [data-interaction-popover]:not([hidden])');
    if (openDialog && event.key === 'Tab') {
      trapOverlayFocus(event, openDialog);
    }
    if (event.key === 'Escape') {
      const armed = root.querySelector('[data-interaction-confirm-armed="true"]');
      if (armed) { delete armed.dataset.interactionConfirmArmed; armed.textContent = armed.dataset.interactionConfirmLabel || 'Confirm'; root.querySelector('[data-interaction-status]')?.replaceChildren(document.createTextNode('cancelled')); return; }
      const dialog = root.querySelector('dialog[open]');
      if (dialog) { event.preventDefault(); if (dialog.dataset.interactionDismissible !== 'false') closeDialog(dialog); }
      else close(true);
      return;
    }
    const tour = closest(root, event.target, '[data-interaction-tour]');
    if (tour && tour.dataset.interactionTourCoach !== 'true' && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault(); showTourStep(tour, Number(tour.dataset.interactionTourIndex) + (event.key === 'ArrowRight' ? 1 : -1)); return;
    }
    const lightbox = closest(root, event.target, '[data-interaction-lightbox]');
    if (lightbox && ['+', '=', '-', '_', '0'].includes(event.key)) {
      event.preventDefault();
      const current = Number(lightbox.dataset.interactionLightboxZoom || 1);
      const zoom = ['+', '='].includes(event.key) ? current + .25 : ['-', '_'].includes(event.key) ? current - .25 : 1;
      change(root, {name: 'lightbox-zoom', value: String(setLightboxZoom(lightbox, zoom))});
      return;
    }
    if (lightbox && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      event.preventDefault();
      lightbox.querySelector(event.key === 'ArrowRight' ? '[data-interaction-lightbox-next]' : '[data-interaction-lightbox-previous]')?.click();
      return;
    }
    const tab = closest(root, event.target, '[data-interaction-tab]');
    if (tab && event.altKey && ['ArrowLeft', 'ArrowRight'].includes(event.key)) {
      const item = tab.closest('[data-interaction-editor-tab]');
      const sibling = event.key === 'ArrowLeft' ? item?.previousElementSibling : item?.nextElementSibling;
      if (item && sibling?.matches('[data-interaction-editor-tab]')) {
        event.preventDefault();
        if (event.key === 'ArrowLeft') item.parentElement.insertBefore(item, sibling); else item.parentElement.insertBefore(sibling, item);
        change(root, {name: 'editor-tab', value: item.dataset.interactionValue, direction: event.key === 'ArrowLeft' ? 'left' : 'right'});
        emit(root, 'reorder', {value: item.dataset.interactionValue, direction: event.key === 'ArrowLeft' ? 'left' : 'right'});
      }
      return;
    }
    const quickAction = closest(root, event.target, '[data-interaction-quickaction]');
    if (quickAction && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const actions = [...quickAction.closest('.ely-interaction__quick').querySelectorAll('[data-interaction-quickaction]:not(:disabled)')];
      const index = actions.indexOf(quickAction);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? actions.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : actions.length - 1)) % actions.length;
      actions.forEach((action, actionIndex) => action.tabIndex = actionIndex === next ? 0 : -1);
      actions[next]?.focus();
      return;
    }
    const navigationMenu = closest(root, event.target, '.ely-interaction__navigation-menu [data-interaction-menu]');
    if (navigationMenu && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const triggers = [...navigationMenu.closest('.ely-interaction__navigation-menu').querySelectorAll('[data-interaction-menu]:not(:disabled)')];
      const index = triggers.indexOf(navigationMenu);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? triggers.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : triggers.length - 1)) % triggers.length;
      const wasOpen = navigationMenu.getAttribute('aria-expanded') === 'true';
      close();
      const nextTrigger = triggers[next];
      nextTrigger?.focus();
      if (wasOpen && nextTrigger) {
        const panel = root.querySelector(`#${CSS.escape(nextTrigger.dataset.interactionMenu)}`);
        if (panel) { panel.hidden = false; nextTrigger.setAttribute('aria-expanded', 'true'); }
      }
      return;
    }
    const paletteHost = closest(root, event.target, '[data-interaction-palette], [data-interaction-palette-results], [data-interaction-palette-option]');
    const palette = paletteHost?.matches('[data-interaction-palette-results]') ? paletteHost : paletteHost?.closest('[data-interaction-palette]')?.querySelector('[data-interaction-palette-results]');
    if (palette && ['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(event.key)) {
      const options = [...palette.querySelectorAll('[data-interaction-palette-option]:not(:disabled):not([hidden])')].filter(option => !option.closest('li').hidden);
      if (!options.length) return;
      const selected = options.findIndex(option => option.getAttribute('aria-selected') === 'true');
      if (event.key === 'Enter') { event.preventDefault(); (document.activeElement?.closest('[data-interaction-palette-option]') || options[Math.max(selected, 0)])?.click(); return; }
      event.preventDefault();
      const focusIndex = options.indexOf(document.activeElement?.closest('[data-interaction-palette-option]'));
      const base = focusIndex >= 0 ? focusIndex : Math.max(selected, 0);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : (base + (event.key === 'ArrowDown' ? 1 : options.length - 1)) % options.length;
      options.forEach((option, optionIndex) => option.setAttribute('aria-selected', String(optionIndex === next)));
      options[next].focus();
      return;
    }
    const pageInput = closest(root, event.target, '[data-interaction-page-input]');
    if (pageInput && event.key === 'Enter') {
      event.preventDefault();
      const value = pageInput.value;
      const button = [...root.querySelectorAll('[data-interaction-page]')].find(item => item.value === value);
      if (button) button.click(); else change(root, {name: 'page', value, selected: true});
      return;
    }
    const orientation = tab?.closest('[role="tablist"]')?.getAttribute('aria-orientation');
    const previous = orientation === 'vertical' ? 'ArrowUp' : 'ArrowLeft';
    const nextKey = orientation === 'vertical' ? 'ArrowDown' : 'ArrowRight';
    if (tab && [previous, nextKey, 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const tabs = [...tab.closest('[data-interaction-tabs]').querySelectorAll('[data-interaction-tab]:not(:disabled)')];
      const index = tabs.indexOf(tab);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === nextKey ? 1 : tabs.length - 1)) % tabs.length;
      tabs[next].click(); tabs[next].focus(); return;
    }
    const hotkeys = closest(root, event.target, '[data-interaction-hotkeys]');
    if (hotkeys && hotkeys.getAttribute('aria-disabled') !== 'true') { const key = [event.ctrlKey && 'Ctrl', event.metaKey && 'Meta', event.altKey && 'Alt', event.shiftKey && 'Shift', event.key].filter(Boolean).join('+'); hotkeys.nextElementSibling.textContent = key; emit(root, hotkeys.dataset.interactionAction || 'hotkey', {key}); return; }
    const menuItem = closest(root, event.target, '[role="menu"] :is(button,a)');
    if (menuItem && ['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const panel = menuItem.closest('[role="menu"]');
      const items = [...panel.querySelectorAll(':is(button,a):not(:disabled)')].filter(item => item.closest('[role="menu"]') === panel && !item.closest('[hidden]'));
      const index = items.indexOf(menuItem);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length;
      items[next]?.focus(); return;
    }
    const reorder = closest(root, event.target, '[data-interaction-reorder] [data-interaction-draggable]');
    if (reorder && ['ArrowUp', 'ArrowDown'].includes(event.key)) {
      if (reorder.getAttribute('aria-disabled') === 'true') return;
      event.preventDefault();
      const sibling = event.key === 'ArrowUp' ? reorder.previousElementSibling : reorder.nextElementSibling;
      if (!sibling) return;
      sourceFamily.flip(reorder.parentElement, () => { if (event.key === 'ArrowUp') reorder.parentElement.insertBefore(reorder, sibling); else reorder.parentElement.insertBefore(sibling, reorder); });
      change(root, {name: 'reorder', value: itemValue(reorder)});
      emit(root, 'reorder', {value: itemValue(reorder), direction: event.key === 'ArrowUp' ? 'up' : 'down'});
      reorder.focus(); return;
    }
    const toolbarButton = closest(root, event.target, '[role="toolbar"] button');
    if (toolbarButton && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const buttons = [...toolbarButton.closest('[role="toolbar"]').querySelectorAll('button:not(:disabled)')];
      const index = buttons.indexOf(toolbarButton);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : buttons.length - 1)) % buttons.length;
      buttons.forEach((button, buttonIndex) => { button.tabIndex = buttonIndex === next ? 0 : -1; });
      buttons[next]?.focus();
      return;
    }
    const roving = closest(root, event.target, '[data-interaction-roving]');
    if (roving && event.key.length === 1) { const item = [...roving.querySelectorAll('button')].find(button => button.textContent.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())); item?.focus(); }
  };
  let dragging, reorderPreview;
  const clearReorderPreview = () => { if (!reorderPreview) return; reorderPreview.rows.forEach(row => { row.style.transform = ''; row.style.transition = ''; }); reorderPreview = undefined; };
  const previewReorder = (zone, pointer) => {
    if (!reorderPreview || reorderPreview.zone !== zone) return;
    const state = reorderPreview, top = pointer - zone.getBoundingClientRect().top - state.grab;
    state.to = reorderLanding(state.heights, state.from, top);
    const order = state.rows.filter(row => row !== dragging); order.splice(state.to, 0, dragging);
    let y = 0; const offsets = new Map(); state.rows.forEach((row,i) => { offsets.set(row,y); y += state.heights[i]; });
    y = 0; order.forEach(row => { const i=state.rows.indexOf(row); row.style.transition=matchMedia('(prefers-reduced-motion: reduce)').matches?'none':'transform 200ms cubic-bezier(.22,1,.36,1)'; row.style.transform=`translateY(${y-offsets.get(row)}px)`; y+=state.heights[i]; });
  };
  const dragstart = event => { const item = closest(root, event.target, '[data-interaction-draggable], [data-interaction-editor-tab]'); if (!item || item.getAttribute('aria-disabled') === 'true') { event.preventDefault(); return; } dragging = item; clearReorderPreview(); if(item.parentElement.matches('[data-interaction-reorder]')) { const zone=item.parentElement, rows=[...zone.children], box=item.getBoundingClientRect(); reorderPreview={zone,rows,heights:rows.map(row=>row.getBoundingClientRect().height),from:rows.indexOf(item),to:rows.indexOf(item),grab:Math.max(0,Math.min(box.height,event.clientY-box.top))}; } item.classList.add('is-dragging'); event.dataTransfer?.setData('text/plain', itemValue(item)); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; emit(root, 'drag-start', {value: itemValue(item)}); };
  const dragover = event => {
    const zone = closest(root, event.target, '[data-interaction-drop], [data-interaction-reorder], [data-interaction-editor-tab]');
    root.querySelectorAll('.is-drag-over').forEach(node => node.classList.remove('is-drag-over'));
    if (!dragging || !zone || zone.matches('[data-direct-lane]') && zone === dragging.parentElement || zone.matches('[data-interaction-reorder]') && zone !== dragging.parentElement) return;
    event.preventDefault(); if(zone.matches('[data-interaction-reorder]'))previewReorder(zone,event.clientY); zone.classList.add('is-drag-over'); if (event.dataTransfer) event.dataTransfer.dropEffect = 'move';
  };
  const dragend = () => { clearReorderPreview(); dragging?.classList.remove('is-dragging'); root.querySelectorAll('.is-drag-over').forEach(node => node.classList.remove('is-drag-over')); dragging = undefined; };
  const drop = event => {
    const zone = closest(root, event.target, '[data-interaction-drop], [data-interaction-reorder], [data-interaction-editor-tab]');
    if (!dragging || !zone || zone.matches('[data-direct-lane]') && zone === dragging.parentElement || zone.matches('[data-interaction-reorder]') && zone !== dragging.parentElement) return;
    event.preventDefault(); const value = itemValue(dragging), fromLane = dragging.parentElement.dataset.directLane, from = [...dragging.parentElement.children].indexOf(dragging);
    if (zone.matches('[data-interaction-reorder]')) {
      const item = dragging, target = reorderPreview?.to ?? from;
      const positions = new Map([...zone.children].map(row => [row,row.getBoundingClientRect().top]));
      clearReorderPreview(); const others=[...zone.children].filter(row=>row!==item); zone.insertBefore(item,others[target]||null);
      if(!matchMedia('(prefers-reduced-motion: reduce)').matches) for(const row of zone.children) { const offset=positions.get(row)-row.getBoundingClientRect().top; if(offset) { const animation=row.animate?.([{transform:`translateY(${offset}px)`},{transform:'none'}],{duration:200,easing:'ease-out'}); if(animation)lottieCleanups.push(()=>animation.cancel()); } }
      const to = [...zone.children].indexOf(item); change(root, {name: 'reorder', value, from, to, values: [...zone.children].map(itemValue)}); emit(root, 'reorder', {value, from, to});
    } else if (zone.matches('[data-interaction-editor-tab]') && dragging !== zone) zone.parentElement.insertBefore(dragging, zone);
    else if (zone.matches('[data-interaction-drop]')) { zone.append(dragging); change(root, {name: 'drag', value, from: fromLane, to: zone.dataset.directLane}); }
    emit(root, 'drop', {value, from: fromLane, to: zone.dataset.directLane}); dragend();
  };
  const holdStart = event => { const button = closest(root, event.target, '[data-interaction-hold], [data-interaction-longpress]'); if (!button || button.hasAttribute('data-direct-press') || button.dataset.interactionConfirmMode === 'twice') return; const threshold = Number(button.dataset.interactionConfirmThreshold || 700); button.classList.add('is-confirming'); button.dataset.interactionTimer = String(later(() => { button.classList.remove('is-confirming'); root.querySelector('[data-interaction-status]')?.replaceChildren(document.createTextNode('confirmed')); emit(root, button.dataset.interactionLongpress || button.dataset.interactionHold || 'confirm', {value: button.value || ''}); }, threshold)); };
  const holdEnd = event => { const button = closest(root, event.target, '[data-interaction-hold], [data-interaction-longpress]'); const timer = Number(button?.dataset.interactionTimer); if (timer) { clearTimeout(timer); timers.delete(timer); delete button.dataset.interactionTimer; button.classList.remove('is-confirming'); } };
  root.querySelectorAll('[data-interaction-popover]').forEach(panel => {
    const focusout = () => queueMicrotask(() => {
      if (!root.isConnected || panel.hidden) return;
      const trigger = root.querySelector(`[data-interaction-menu="${CSS.escape(panel.id)}"]`);
      if (!panel.contains(document.activeElement) && document.activeElement !== trigger) menu(root, panel.id, false, true);
    });
    panel.addEventListener('focusout', focusout);
    lottieCleanups.push(() => panel.removeEventListener('focusout', focusout));
  });
  root.querySelectorAll('[data-interaction-hover]').forEach(host => {
    const trigger = host.querySelector('button'), panel = host.querySelector('[data-interaction-hover-panel]');
    let timer;
    const hide = () => { clearTimeout(timer); panel.hidden = true; };
    const show = () => { if (trigger.disabled || root.dataset.elyDisabled === 'true') return; panel.hidden = false; placeOverlay(panel, trigger.getBoundingClientRect()); };
    const enter = () => { clearTimeout(timer); timer = setTimeout(show, panel.hidden ? Number(host.dataset.interactionHover) : 0); };
    const leave = () => { clearTimeout(timer); timer = setTimeout(hide, host.classList.contains('ely-interaction__hover') ? 200 : 0); };
    const focus = () => { clearTimeout(timer); show(); };
    const blur = event => { if (!host.contains(event.relatedTarget)) leave(); };
    const escape = event => { if (event.key === 'Escape') { event.preventDefault(); hide(); } };
    const press = () => { if (panel.getAttribute('role') === 'tooltip') hide(); };
    const handlers = {pointerenter: enter, pointerleave: leave, focusin: focus, focusout: blur, keydown: escape, pointerdown: press};
    Object.entries(handlers).forEach(([type, handler]) => host.addEventListener(type, handler));
    lottieCleanups.push(() => { hide(); Object.entries(handlers).forEach(([type, handler]) => host.removeEventListener(type, handler)); });
  });
  root.querySelectorAll('[data-interaction-dialog-form]').forEach(form => {
    const validate = () => validateOverlayForm(form);
    const guard = event => { if (!validate()) { event.preventDefault(); event.stopImmediatePropagation(); form.reportValidity(); } };
    form.addEventListener('input', validate); form.addEventListener('submit', guard);
    lottieCleanups.push(() => { form.removeEventListener('input', validate); form.removeEventListener('submit', guard); });
  });
  root.querySelectorAll('[data-interaction-selection-tools]').forEach(stage => {
    const field = stage.querySelector('[data-interaction-selection-field]') || (stage.dataset.interactionSelectionTarget ? document.querySelector(stage.dataset.interactionSelectionTarget) : null), toolbar = stage.querySelector('[role="toolbar"]');
    if (!field) return;
    const update = event => {
      if (event?.key === 'Escape') return;
      const focused = event?.type === 'blur' || event?.type === 'focusout' ? event.relatedTarget : document.activeElement;
      toolbar.hidden = field.disabled || (focused !== field && !toolbar.contains(focused)) || field.selectionStart === field.selectionEnd;
      if (toolbar.hidden) return;
      const box = field.getBoundingClientRect(), style = getComputedStyle(field);
      const context = document.createElement('canvas').getContext('2d');
      context.font = style.font;
      const offset = context.measureText(field.value.slice(0, field.selectionStart)).width - field.scrollLeft + parseFloat(style.paddingLeft || 0);
      placeOverlay(toolbar, {left: Math.max(box.left, Math.min(box.right, box.left + offset)), top: box.top, bottom: box.bottom}, true);
    };
    const retain = event => { if (event.target.closest('button')) event.preventDefault(); };
    const escape = event => { if (event.key === 'Escape') toolbar.hidden = true; };
    const events = ['select', 'keyup', 'pointerup', 'focus', 'blur', 'input', 'scroll'];
    events.forEach(type => field.addEventListener(type, update));
    toolbar.addEventListener('pointerdown', retain); field.addEventListener('keydown', escape);
    toolbar.addEventListener('focusin', update); toolbar.addEventListener('focusout', update);
    document.addEventListener('selectionchange', update);
    window.addEventListener('resize', update); window.addEventListener('scroll', update, true);
    update();
    lottieCleanups.push(() => { events.forEach(type => field.removeEventListener(type, update)); toolbar.removeEventListener('pointerdown', retain); toolbar.removeEventListener('focusin', update); toolbar.removeEventListener('focusout', update); field.removeEventListener('keydown', escape); document.removeEventListener('selectionchange', update); window.removeEventListener('resize', update); window.removeEventListener('scroll', update, true); });
  });
  const repositionOverlays = () => {
    root.querySelectorAll('[data-interaction-popover]:not([hidden])').forEach(panel => {
      const trigger = root.querySelector(`[data-interaction-menu="${CSS.escape(panel.id)}"]`);
      if (trigger) placeOverlay(panel, trigger.getBoundingClientRect());
    });
    root.querySelectorAll('[data-interaction-hover-panel]:not([hidden])').forEach(panel => placeOverlay(panel, panel.parentElement.querySelector('button').getBoundingClientRect()));
    root.querySelectorAll('[data-interaction-tour][open]').forEach(dialog => showTourStep(dialog, Number(dialog.dataset.interactionTourIndex), false));
  };
  window.addEventListener('resize', repositionOverlays); window.addEventListener('scroll', repositionOverlays, true);
  lottieCleanups.push(() => { window.removeEventListener('resize', repositionOverlays); window.removeEventListener('scroll', repositionOverlays, true); });
  root.querySelectorAll('dialog').forEach(dialog => {
    dialog.addEventListener('cancel', event => { if (dialog.dataset.interactionDismissible === 'false') event.preventDefault(); });
    dialog.addEventListener('close', () => restoreDialogFocus(dialog));
  });
  const lightboxPointerDown = new Map();
  const lightboxPointerDownHandler = event => { const viewport = closest(root, event.target, '[data-interaction-lightbox-viewport]'); if (viewport) lightboxPointerDown.set(viewport, {x: event.clientX, y: event.clientY}); };
  const lightboxPointerUpHandler = event => { const viewport = closest(root, event.target, '[data-interaction-lightbox-viewport]'); const down = viewport && lightboxPointerDown.get(viewport); if (!viewport || !down) return; lightboxPointerDown.delete(viewport); if (Math.hypot(event.clientX - down.x, event.clientY - down.y) < 8) { const dialog = viewport.closest('[data-interaction-lightbox]'); const current = Number(dialog.dataset.interactionLightboxZoom || 1); setLightboxZoom(dialog, current === 1 ? 1.5 : 1); change(root, {name: 'lightbox-zoom', value: String(dialog.dataset.interactionLightboxZoom)}); } };
  root.addEventListener('pointerdown', lightboxPointerDownHandler);
  root.addEventListener('pointerup', lightboxPointerUpHandler);
  root.querySelectorAll('[data-interaction-wizard]').forEach(wizard => {
    const current = [...wizard.querySelectorAll('[data-interaction-step]')].findIndex(step => step.getAttribute('aria-current') === 'step');
    const back = wizard.querySelector('[data-interaction-step-back]');
    if (back) back.disabled = current <= 0 || root.dataset.elyDisabled === 'true';
  });
  root.querySelectorAll('.ely-interaction__history[data-interaction-history]').forEach(history => {
    const menu = history.querySelector('[role="menu"]');
    [...history.querySelectorAll('[data-interaction-history-item]')].reverse().forEach(item => menu?.append(item));
    const selected = Number(history.dataset.interactionHistoryIndex || 0);
    selectHistory(history, Number.isFinite(selected) ? selected : 0);
  });
  root.querySelectorAll('[data-interaction-palette]').forEach(palette => {
    const field = palette.querySelector('[data-interaction-filter]');
    if (field) filterPalette(palette, field.value.trim().toLocaleLowerCase());
    if (root.querySelector('[data-interaction-kind="QuickSwitcher"]') && !field?.value.trim()) {
      const options = [...palette.querySelectorAll('[data-interaction-palette-option]:not(:disabled)')];
      options.forEach((option, index) => option.setAttribute('aria-selected', String(index === Math.min(1, options.length - 1))));
    }
  });
  root.addEventListener('submit', submit, true);
  lottieCleanups.push(() => root.removeEventListener('submit', submit, true));
  root.querySelectorAll('.ely-interaction__toc-document').forEach(documentPane => {
    const toc = documentPane.closest('[data-interaction-toc]');
    const track = () => {
      const sections = [...documentPane.querySelectorAll('[data-interaction-anchor-section]')];
      const top = documentPane.getBoundingClientRect().top;
      const current = sections.filter(section => section.getBoundingClientRect().top <= top + 1).at(-1) || sections[0];
      if (!current) return;
      toc.querySelectorAll('[data-interaction-anchor]').forEach(link => link.setAttribute('aria-current', link.dataset.interactionAnchor === current.dataset.interactionAnchorSection ? 'location' : 'false'));
    };
    documentPane.addEventListener('scroll', track);
    lottieCleanups.push(() => documentPane.removeEventListener('scroll', track));
  });
  root.querySelectorAll('[data-interaction-leading-icon]').forEach(button => {
    if (!button.dataset.interactionLeadingIcon || button.querySelector('[data-interaction-icon]')) return;
    const icon = document.createElement('span');
    icon.dataset.interactionIcon = button.dataset.interactionLeadingIcon;
    icon.setAttribute('aria-hidden', 'true'); button.prepend(icon);
  });
  root.querySelectorAll('[data-interaction-icon]').forEach(icon => {
    const name = icon.dataset.interactionIcon;
    if (/^[a-z0-9-]+$/.test(name || '')) { icon.classList.add('is-icon'); icon.style.setProperty('--ely-interaction-icon', `url("/assets/ely/icons/${name}.svg")`); }
  });
  root.querySelectorAll('[data-interaction-button-icon]').forEach(button => {
    const name = button.dataset.interactionButtonIcon;
    if (!/^[a-z0-9-]+$/.test(name || '')) return;
    const source = `/assets/ely/icons/${name}.svg`;
    button.style.setProperty('--ely-interaction-button-icon', `url("${source}")`);
    const icon = new Image();
    icon.addEventListener('load', () => button.classList.add('is-icon-ready'), {once: true});
    icon.src = source;
  });
  root.querySelectorAll('[data-interaction-countdown]').forEach(output => {
    let value = Number(output.dataset.interactionCountdown);
    if (output.closest('[data-loading-clock]') || !Number.isFinite(value) || value <= 0) return;
    output.dataset.interactionCountdownInitial = String(value);
    output.textContent = formatCountdown(value);
    const tick = () => {
      if (output.dataset.interactionCountdownPaused === 'true') { later(tick, 1000); return; }
      value = Number(output.dataset.interactionCountdown);
      value = Math.max(0, value - 1);
      output.dataset.interactionCountdown = String(value);
      output.value = String(value);
      output.textContent = formatCountdown(value);
      change(root, {name: 'countdown', value: String(value)});
      if (value > 0) later(tick, 1000);
    };
    later(tick, 1000);
  });
  root.querySelectorAll('[data-interaction-lottie]').forEach(host => {
    const status = host.querySelector('[data-interaction-lottie-status]');
    const progress = host.querySelector('[data-interaction-lottie-progress]');
    const seek = host.querySelector('[data-interaction-lottie-seek]');
    const canvas = host.querySelector('[data-lottie-canvas]');
    const controller = new AbortController();
    let animation, destroyed = false;
    const fail = error => { if (destroyed) return; status.textContent = 'Animation unavailable'; root.dispatchEvent(new CustomEvent('ely:error', {bubbles: true, detail: {id: root.id, error}})); };
    const data = async () => {
      const url = host.dataset.lottieUrl;
      if (url) {
        const target = new URL(url, window.location.href);
        if (target.origin !== window.location.origin) throw new Error('Lottie animation URL must be same-origin');
        const response = await fetch(target, {signal: controller.signal, credentials: 'same-origin'});
        if (!response.ok) throw new Error(`Lottie animation request failed: ${response.status}`);
        return response.json();
      }
      const source = host.querySelector('[data-lottie-animation]')?.textContent.trim();
      if (!source) throw new Error('Lottie animation data is required');
      const parsed = JSON.parse(source);
      return typeof parsed === 'string' ? JSON.parse(parsed) : parsed;
    };
    const start = async () => {
      try {
        const library = await loadLottieLibrary();
        if (destroyed) return;
        const animationData = await data();
        if (destroyed) return;
        animation = library.loadAnimation({container: canvas, renderer: 'svg', loop: host.dataset.lottieLoop === 'true', autoplay: host.dataset.lottieAutoplay === 'true', animationData});
        animation.addEventListener('DOMLoaded', () => { if (!destroyed) status.textContent = 'Animation ready'; });
        animation.addEventListener('enterFrame', event => {
          if (destroyed || !animation.totalFrames) return;
          const value = Math.round(event.currentTime / animation.totalFrames * 100);
          progress.value = String(value); progress.textContent = `${value}%`; seek.value = String(value);
          change(root, {name: 'frame', value: String(value)});
        });
      } catch (error) { if (error.name !== 'AbortError') fail(error); }
    };
    const clickLottie = event => {
      if (!animation || !(event.target instanceof Element)) return;
      if (event.target.closest('[data-interaction-lottie-play]')) { animation.play(); status.textContent = 'Animation playing'; }
      if (event.target.closest('[data-interaction-lottie-pause]')) { animation.pause(); status.textContent = 'Animation paused'; }
    };
    const seekLottie = event => {
      if (!animation || event.target !== seek) return;
      animation.goToAndStop(Number(seek.value) / 100 * animation.totalFrames, true);
      progress.value = seek.value; progress.textContent = `${seek.value}%`;
      change(root, {name: 'frame', value: seek.value});
    };
    host.addEventListener('click', clickLottie); host.addEventListener('input', seekLottie); start();
    lottieCleanups.push(() => { destroyed = true; controller.abort(); host.removeEventListener('click', clickLottie); host.removeEventListener('input', seekLottie); animation?.destroy(); });
  });
  const contextmenu = event => {
    const surface = closest(root, event.target, '[data-interaction-context]');
    if (!surface) return;
    event.preventDefault();
    const trigger = surface.querySelector('[data-interaction-menu]:not(:disabled)');
    if (trigger && root.dataset.elyDisabled !== 'true') {
      if (event.target.closest?.('.ely-interaction__pie:not([hidden])')) { close(true); return; }
      close(); menu(root, trigger.dataset.interactionMenu, true);
      const panel = root.querySelector(`#${CSS.escape(trigger.dataset.interactionMenu)}`);
      const bounds = panel.getBoundingClientRect();
      panel.style.position = 'fixed';
      const centered = panel.matches('.ely-interaction__pie');
      panel.style.left = `${Math.max(0, Math.min(event.clientX - (centered ? bounds.width / 2 : 0), window.innerWidth - bounds.width))}px`;
      panel.style.top = `${Math.max(0, Math.min(event.clientY - (centered ? bounds.height / 2 : 0), window.innerHeight - bounds.height))}px`;
    }
  };
  const pointerover = event => {
    const quick = closest(root, event.target, '[data-interaction-quickaction]');
    if (quick && !quick.disabled) quick.closest('.ely-interaction__quick').querySelectorAll('[data-interaction-quickaction]').forEach(action => { action.tabIndex = action === quick ? 0 : -1; });
    const row = closest(root, event.target, '.ely-interaction__menu-row');
    if (row) row.parentElement.querySelectorAll(':scope > .ely-interaction__menu-row > [data-interaction-menu]').forEach(trigger => {
      if (!row.contains(trigger)) menu(root, trigger.dataset.interactionMenu, false);
    });
    const sub = closest(root, event.target, '.ely-interaction__menu-row > [data-interaction-menu]');
    if (sub && !sub.disabled) { menu(root, sub.dataset.interactionMenu, true); return; }
    const bar = closest(root, event.target, '.ely-interaction__menubar > .ely-interaction__menu > [data-interaction-menu]');
    if (bar && !bar.disabled && bar.closest('nav').querySelector('[aria-expanded="true"]')) { close(); menu(root, bar.dataset.interactionMenu, true); return; }
    const trigger = closest(root, event.target, '.ely-interaction__navigation-menu [data-interaction-menu]');
    if (!trigger || trigger.disabled || trigger.getAttribute('aria-expanded') === 'true') return;
    const navigation = trigger.closest('.ely-interaction__navigation-menu');
    if (navigation?.querySelector('[data-interaction-menu][aria-expanded="true"]')) { close(); menu(root, trigger.dataset.interactionMenu, true); }
  };
  root.querySelectorAll('[data-interaction-search-menu] [data-interaction-filter]').forEach(field => input({target: field}));
  root.querySelectorAll('.ely-interaction__pie').forEach(pie => {
    const items = [...pie.querySelectorAll('[role="menuitem"]')];
    items.forEach((item, index) => {
      const angle = index * 2 * Math.PI / items.length - Math.PI / 2;
      item.style.left = `${104 + 84 * Math.cos(angle)}px`;
      item.style.top = `${104 + 84 * Math.sin(angle)}px`;
    });
    const aim = event => {
      const bounds = pie.getBoundingClientRect();
      const x = event.clientX - bounds.left - 124, y = event.clientY - bounds.top - 124;
      if (Math.hypot(x, y) < 20) { pie.querySelector('[data-interaction-pie-close]')?.focus({preventScroll: true}); return; }
      const index = Math.round((Math.atan2(y, x) + Math.PI / 2 + 2 * Math.PI) / (2 * Math.PI) * items.length) % items.length;
      if (!items[index]?.disabled) items[index]?.focus({preventScroll: true});
    };
    pie.addEventListener('pointermove', aim);
    lottieCleanups.push(() => pie.removeEventListener('pointermove', aim));
  });
  const revealLazy = list => { const bounds=list.getBoundingClientRect(); let count=0; list.querySelectorAll('[data-interaction-lazy-row]:not([data-interaction-lazy-loaded])').forEach(row=>{ const box=row.getBoundingClientRect(); if(box.bottom<=bounds.top || box.top>=bounds.bottom)return; row.setAttribute('data-interaction-lazy-loaded',''); row.querySelector('.ely-interaction__skeleton')?.setAttribute('hidden',''); row.querySelector('p').hidden=false; count++; }); if(count)change(root,{name:'lazy',value:'loaded',count}); };
  const scroll = event => { const list=closest(root,event.target,'[data-interaction-lazy]'); if(list)revealLazy(list); };
  root.querySelectorAll('[data-interaction-lazy]').forEach(list=>{ revealLazy(list); if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(()=>revealLazy(list));observer.observe(list);lottieCleanups.push(()=>observer.disconnect());} });
  root.addEventListener('click', click); root.addEventListener('scroll', scroll, true); root.addEventListener('input', input); root.addEventListener('submit', submit); root.addEventListener('keydown', keydown); root.addEventListener('ely:result', result); root.addEventListener('ely:error', error); root.addEventListener('contextmenu', contextmenu); root.addEventListener('pointerover', pointerover);
  root.addEventListener('dragend', dragend); root.addEventListener('dragstart', dragstart); root.addEventListener('dragover', dragover); root.addEventListener('drop', drop);
  const keyup = event => { if ([' ', 'Enter'].includes(event.key)) holdEnd(event); };
  root.addEventListener('pointerdown', holdStart); root.addEventListener('pointerup', holdEnd); root.addEventListener('pointercancel', holdEnd); root.addEventListener('keyup', keyup);
  root.querySelector('[autofocus]')?.focus();
  const outside = event => {
    root.querySelectorAll('[data-interaction-popover]:not([hidden])').forEach(panel => {
      const trigger = root.querySelector(`[data-interaction-menu="${CSS.escape(panel.id)}"]`);
      if (!panel.contains(event.target) && !trigger?.contains(event.target)) menu(root, panel.id, false, true);
    });
    if (!root.contains(event.target)) close();
  };
  document.addEventListener('pointerdown', outside);
  return () => { clearReorderPreview(); timers.forEach(clearTimeout); lottieCleanups.forEach(cleanup => cleanup()); root.removeEventListener('click', click); root.removeEventListener('scroll', scroll, true); root.removeEventListener('input', input); root.removeEventListener('keydown', keydown); root.removeEventListener('ely:result', result); root.removeEventListener('ely:error', error); root.removeEventListener('contextmenu', contextmenu); root.removeEventListener('pointerover', pointerover); root.removeEventListener('dragend', dragend); root.removeEventListener('dragstart', dragstart); root.removeEventListener('dragover', dragover); root.removeEventListener('drop', drop); root.removeEventListener('pointerdown', lightboxPointerDownHandler); root.removeEventListener('pointerup', lightboxPointerUpHandler); root.removeEventListener('pointerdown', holdStart); root.removeEventListener('pointerup', holdEnd); root.removeEventListener('pointercancel', holdEnd); root.removeEventListener('keyup', keyup); document.removeEventListener('pointerdown', outside); };
});
