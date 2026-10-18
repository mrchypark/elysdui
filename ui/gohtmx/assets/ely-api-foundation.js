import {register, emit} from './ely-api.js';
import {mountMathML} from './ely-math.js';

const selectText = root => {
  const value = root.querySelector('[data-foundation-copy]');
  if (!value) return '';
  const selection = getSelection();
  const range = document.createRange();
  range.selectNodeContents(value);
  selection?.removeAllRanges();
  selection?.addRange(range);
  return value.textContent;
};

const formatNumber = (value, decimals = 0) => {
  const fixed = Math.abs(value).toFixed(decimals), [whole, fraction] = fixed.split('.');
  return `${value < 0 && Number(fixed) ? '−' : ''}${whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}${fraction === undefined ? '' : `.${fraction}`}`;
};

const format = node => {
  const value = node.getAttribute('datetime') || node.textContent.trim();
  const number = Number(value);
  const decimals = Number(node.dataset.foundationDecimals);
  const places = Number.isInteger(decimals) && decimals >= 0 ? decimals : 0;
  if (node.dataset.foundationFormat === 'number' && Number.isFinite(number)) node.textContent = formatNumber(number, places);
  if (node.dataset.foundationFormat === 'currency' && Number.isFinite(number)) { const code = node.dataset.foundationCurrency || 'USD'; const symbols = {USD: '$', EUR: '€', GBP: '£', JPY: '¥', CNY: '¥', KRW: '₩', INR: '₹'}; const minorUnits = {BHD: 3, JPY: 0, KRW: 0, VND: 0}; const symbol = symbols[code] || code; node.textContent = `${number < 0 && number ? '−' : ''}${symbol}${symbols[code] ? '' : ' '}${formatNumber(Math.abs(number), minorUnits[code] ?? 2)}`; }
  if (node.dataset.foundationFormat === 'percent' && Number.isFinite(number)) { const signed = node.dataset.foundationSigned === 'true'; node.textContent = `${signed && number > 0 ? '+' : ''}${formatNumber(number * 100, Number.isInteger(decimals) && decimals >= 0 ? decimals : 1)}%`; if (signed) node.dataset.foundationTone = number > 0 ? 'positive' : number < 0 ? 'negative' : ''; }
  if (node.dataset.foundationFormat === 'filesize' && Number.isFinite(number)) { const binary = node.dataset.foundationFilesizeBinary === 'true'; const base = binary ? 1024 : 1000, units = binary ? ['B', 'KiB', 'MiB', 'GiB', 'TiB', 'PiB'] : ['B', 'KB', 'MB', 'GB', 'TB', 'PB']; let unit = 0, size = number; while (size >= base && unit < units.length - 1) { size /= base; unit++; } if (!unit) node.textContent = `${number} B`; else { const digits = size < 10 ? 1 : 0; let shown = formatNumber(size, digits); if (Number(size.toFixed(digits)) >= base && unit < units.length - 1) { unit++; shown = '1.0'; } node.textContent = `${shown} ${units[unit]}`; } }
  if (node.dataset.foundationFormat === 'duration' && Number.isFinite(number)) { const seconds = Math.max(0, Math.floor(number)), hours = Math.floor(seconds / 3600), minutes = Math.floor((seconds % 3600) / 60), secs = seconds % 60; node.textContent = node.dataset.foundationDurationStyle === 'compact' ? hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${secs}s` : `${secs}s` : hours ? `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}` : `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}`; }
  if (node.dataset.foundationFormat === 'plural' && Number.isFinite(number)) { const unit = number === 1 ? node.dataset.foundationUnit || 'item' : node.dataset.foundationOtherUnit || `${node.dataset.foundationUnit || 'item'}s`; node.textContent = `${new Intl.NumberFormat().format(number)} ${unit}`; }
  const date = new Date(value);
  if (node.dataset.foundationFormat === 'datetime' && !Number.isNaN(date)) { const pattern = node.dataset.foundationDatetimePattern; const time = new Intl.DateTimeFormat('en-US', {hour: '2-digit', minute: '2-digit', hourCycle: 'h23'}).format(date); node.textContent = pattern === 'date' || pattern === '%Y-%m-%d' ? new Intl.DateTimeFormat('en-CA', {year: 'numeric', month: '2-digit', day: '2-digit'}).format(date) : pattern === 'weekday-time' || pattern === '%A %H:%M' ? `${new Intl.DateTimeFormat('en-US', {weekday: 'long'}).format(date)} ${time}` : `${new Intl.DateTimeFormat('en-US', {month: 'short', day: 'numeric', year: 'numeric'}).format(date)} · ${time}`; }
  if (node.dataset.foundationFormat === 'relative' && !Number.isNaN(date)) { const delta = Math.round((Date.now() - date) / 1000), seconds = Math.abs(delta); if (seconds < 45) node.textContent = 'just now'; else { const round = unit => Math.round(seconds / unit); const [count, unit] = seconds < 90 ? [1, 'minute'] : seconds < 2700 ? [round(60), 'minute'] : seconds < 5400 ? [1, 'hour'] : seconds < 79200 ? [round(3600), 'hour'] : seconds < 129600 ? [1, 'day'] : seconds < 2246400 ? [round(86400), 'day'] : seconds < 3888000 ? [1, 'month'] : seconds < 27648000 ? [round(2592000), 'month'] : seconds < 47347200 ? [1, 'year'] : [round(31536000), 'year']; const span = `${count} ${unit}${count === 1 ? '' : 's'}`; node.textContent = delta < 0 ? `in ${span}` : `${span} ago`; } }
};

const prefersReducedMotion = () => globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const animationDuration = node => Math.max(0, Math.min(10000, Number(node.dataset.foundationDuration) || 300));

const drawCanvas = canvas => {
  const context = canvas.getContext?.('2d');
  if (canvas.dataset.foundationCanvas === 'wave') {
    if (!context) return;
    context.strokeStyle = getComputedStyle(canvas).color || '#252525'; context.lineWidth = 1.5; context.beginPath();
    for (let step = 0; step <= 96; step++) { const t = step / 96, x = canvas.width * t, y = canvas.height * (.5 - .38 * Math.sin(t * Math.PI * 3) * (1 - t * .5)); if (step === 0) context.moveTo(x, y); else context.lineTo(x, y); }
    context.stroke(); return;
  }
  const values = (canvas.dataset.foundationCanvas.match(/-?\d+(?:\.\d+)?/g) || []).slice(0, 400).map(Number).filter(Number.isFinite);
  if (!context || values.length < 4) return;
  context.strokeStyle = getComputedStyle(canvas).color || '#252525';
  context.lineWidth = 2;
  context.beginPath();
  for (let index = 0; index + 1 < values.length; index += 2) {
    if (index === 0) context.moveTo(values[index], values[index + 1]);
    else context.lineTo(values[index], values[index + 1]);
  }
  context.stroke();
};

const drawIcon = node => {
  const revision = String((Number(node.dataset.foundationIconRevision) || 0) + 1);
  node.dataset.foundationIconRevision = revision;
  delete node.dataset.foundationIconReady;
  delete node.dataset.foundationIconFallback;
  delete node.dataset.foundationIconLiteral;
  const literal = node.dataset.foundationIconValue;
  const rawName = node.dataset.foundationIcon || '';
  const named = /^[a-z0-9-]+$/.test(rawName);
  const name = named ? rawName : 'circle';
  const selfAsset = value => {
    try { const url = new URL(value, location.origin); return url.origin === location.origin && url.pathname.startsWith('/assets/') && url.pathname.endsWith('.svg') ? url.href : ''; } catch { return ''; }
  };
  const source = node.dataset.foundationIconSrc ? selfAsset(node.dataset.foundationIconSrc) : (named ? `/assets/ely/icons/${name}.svg` : '');
  const setIcon = value => node.style.setProperty('--foundation-icon-url', `url("${value}")`);
  const current = () => node.dataset.foundationIconRevision === revision;
  const literalFallback = () => { if (!current()) return; if (literal) { node.dataset.foundationIconLiteral = 'true'; node.style.removeProperty('--foundation-icon-url'); node.textContent = literal; } else setIcon('/assets/ely/icons/circle.svg'); node.dataset.foundationIconReady = 'true'; };
  if (!source) { literalFallback(); return; }
  setIcon('/assets/ely/icons/circle.svg');
  const image = new Image();
  image.onload = () => { if (!current()) return; setIcon(source); node.dataset.foundationIconReady = 'true'; };
  image.onerror = () => { if (!current()) return; node.dataset.foundationIconFallback = 'true'; literalFallback(); };
  image.src = source;
};

const drawMiddleEllipsis = node => {
  const text = node.dataset.foundationMiddle || '';
  const start = node.querySelector('[data-foundation-middle-start]');
  const ellipsis = start?.nextElementSibling;
  const end = node.querySelector('[data-foundation-middle-end]');
  const maxChars = Number(node.dataset.foundationMiddleMaxChars);
  const render = () => {
    let keep = Math.floor(text.length / 2);
    if (Number.isFinite(maxChars) && maxChars > 0) keep = Math.max(1, Math.floor((maxChars - 1) / 2));
    else {
      const width = node.clientWidth;
      if (width > 0) {
        const context = document.createElement('canvas').getContext('2d');
        if (context) {
          const style = getComputedStyle(node); context.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
          if (context.measureText(text).width <= width) keep = text.length;
          else while (keep > 1 && context.measureText(`${text.slice(0, keep)}…${text.slice(-keep)}`).width > width) keep--;
        }
      } else keep = text.length;
    }
    const whole = text.length <= (Number.isFinite(maxChars) && maxChars > 0 ? maxChars : keep * 2);
    start.textContent = whole ? text : text.slice(0, keep);
    end.textContent = whole ? '' : text.slice(-keep);
    ellipsis.hidden = whole;
    node.dataset.foundationMiddleTruncated = String(!whole);
  };
  render();
  if (!Number.isFinite(maxChars) && globalThis.ResizeObserver) { const observer = new ResizeObserver(render); observer.observe(node); return () => observer.disconnect(); }
};

const animateNumber = (node, cleanups) => {
  const values = (node.dataset.foundationNumberValues || '').split(',').map(Number).filter(Number.isFinite);
  const end = values[0] ?? Number(node.dataset.foundationNumber), start = Number(node.dataset.foundationFrom);
  if (!Number.isFinite(end)) return;
  const from = Number.isFinite(start) ? start : 0;
  const decimals = Number(node.dataset.foundationNumberDecimals);
  const print = value => Number.isInteger(decimals) ? formatNumber(value, decimals) : String(Math.round(value));
  const reduced = node.getAttribute('aria-disabled') === 'true' || prefersReducedMotion() || animationDuration(node) === 0;
  let frame = 0, timer = 0;
  const play = (initial, target) => {
    cancelAnimationFrame(frame);
    if (reduced) { node.textContent = print(target); return; }
    const started = performance.now(), total = animationDuration(node);
    const tick = now => { const progress = Math.min(1, (now - started) / total); node.textContent = print(initial + (target - initial) * progress); if (progress < 1) frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
  };
  if (values.length > 1) {
    node.textContent = print(end);
    if (!reduced) { let index = 0; timer = setInterval(() => { const previous = values[index]; index = (index + 1) % values.length; play(previous, values[index]); }, 1600); }
  } else play(from, end);
  cleanups.push(() => { cancelAnimationFrame(frame); clearInterval(timer); });
};

const typewrite = (node, cleanups) => {
  let frame = 0;
  const play = text => {
    cancelAnimationFrame(frame);
    const graphemes = globalThis.Intl?.Segmenter ? [...new Intl.Segmenter(undefined, {granularity: 'grapheme'}).segment(text)].map(({segment}) => segment) : Array.from(text);
    node.dataset.foundationTypewriter = text;
    if (node.getAttribute('aria-disabled') === 'true' || prefersReducedMotion() || animationDuration(node) === 0) { node.textContent = text; return; }
    const started = performance.now(), total = animationDuration(node);
    const tick = now => { const progress = Math.min(1, (now - started) / total); node.textContent = graphemes.slice(0, Math.floor(graphemes.length * progress)).join(''); if (progress < 1) frame = requestAnimationFrame(tick); else node.textContent = text; };
    frame = requestAnimationFrame(tick);
  };
  const replay = event => play(event.detail || node.dataset.foundationTypewriter || '');
  node.addEventListener('foundation:typewriter', replay); cleanups.push(() => { cancelAnimationFrame(frame); node.removeEventListener('foundation:typewriter', replay); });
  play(node.dataset.foundationTypewriter || '');
};

const syncEllipsisTooltip = node => {
  const render = () => {
    const clipped = node.scrollWidth > node.clientWidth;
    if (clipped) node.title = node.dataset.foundationFullText || node.textContent;
    else node.removeAttribute('title');
    node.dataset.foundationEllipsisClipped = String(clipped);
  };
  render();
  if (!globalThis.ResizeObserver) return;
  const observer = new ResizeObserver(render); observer.observe(node);
  return () => observer.disconnect();
};

register('foundation', root => {
  const positionFloating = (panel, x, y) => {
    const left = Math.max(32 - (panel.offsetWidth || 240), Math.min(innerWidth - 32, Number(x) || 0));
    const top = Math.max(0, Math.min(innerHeight - 32, Number(y) || 0));
    panel.dataset.foundationLeft = String(left); panel.dataset.foundationTop = String(top);
    panel.style.left = `${left}px`; panel.style.top = `${top}px`;
  };
  root.querySelectorAll('[data-foundation-floating-panel]').forEach(panel => positionFloating(panel, panel.dataset.foundationOriginX, panel.dataset.foundationOriginY));

  const cleanups = [];
  root.querySelectorAll('[data-foundation-canvas]').forEach(drawCanvas);
  root.querySelectorAll('[data-foundation-image]').forEach(figure => {
    const image = figure.querySelector('img'), mark = figure.querySelector('[data-foundation-image-mark]');
    if (!image || !mark) return;
    const set = state => { figure.dataset.foundationImageState = state; mark.hidden = state !== 'error'; mark.textContent = state === 'error' ? 'Image unavailable' : ''; image.hidden = state === 'error'; };
    const load = () => set('loaded'), error = () => set('error');
    if (image.dataset.foundationImageExpectedError === 'true') error();
    else if (!image.getAttribute('src')) error(); else if (image.complete) image.naturalWidth ? load() : error(); else set('loading');
    image.addEventListener('load', load); image.addEventListener('error', error); cleanups.push(() => { image.removeEventListener('load', load); image.removeEventListener('error', error); });
  });
  root.querySelectorAll('[data-foundation-observe]').forEach(node => {
    const viewport = node.closest('[data-foundation-observe-root]');
    const output = viewport?.parentElement?.querySelector('[data-foundation-observe-output]') || node.querySelector('output');
    const update = visible => { node.dataset.foundationIntersecting = String(visible); if (output) output.textContent = visible ? 'in view' : 'out of view'; emit(root, 'intersection', {intersecting: visible}); };
    if (!globalThis.IntersectionObserver) { update(false); return; }
    const observer = new IntersectionObserver(entries => entries.forEach(entry => update(entry.isIntersecting)), {root: viewport || null});
    observer.observe(node); cleanups.push(() => observer.disconnect());
  });
  root.querySelectorAll('[data-foundation-icon],[data-foundation-icon-src]').forEach(drawIcon);
  root.querySelectorAll('[data-foundation-math]').forEach(node => cleanups.push(mountMathML(node)));
  root.querySelectorAll('[data-foundation-width]').forEach(node => { const width = Number(node.dataset.foundationWidth); if (Number.isFinite(width) && width > 0) node.style.setProperty('--foundation-fit-width', `${Math.min(960, width)}px`); });
  root.querySelectorAll('[data-foundation-clamp-lines]').forEach(node => { const lines = Number(node.dataset.foundationClampLines); if (Number.isInteger(lines) && lines > 0) node.style.setProperty('--foundation-clamp-lines', String(Math.min(12, lines))); });
  root.querySelectorAll('[data-foundation-highlight]').forEach(node => { const query = node.dataset.foundationHighlightQuery || ''; const text = node.textContent || ''; if (!query) return; const lower = text.toLocaleLowerCase(), needle = query.toLocaleLowerCase(); let index = 0, match = lower.indexOf(needle, index); if (match < 0) return; const fragment = document.createDocumentFragment(); while (match >= 0) { fragment.append(text.slice(index, match)); const mark = document.createElement('mark'); mark.textContent = text.slice(match, match + query.length); fragment.append(mark); index = match + query.length; match = lower.indexOf(needle, index); } fragment.append(text.slice(index)); node.replaceChildren(fragment); });
  root.querySelectorAll('[data-foundation-middle]').forEach(node => { const cleanup = drawMiddleEllipsis(node); if (cleanup) cleanups.push(cleanup); });
  root.querySelectorAll('[data-foundation-number]').forEach(node => animateNumber(node, cleanups));
  root.querySelectorAll('[data-foundation-typewriter]').forEach(node => {
    typewrite(node, cleanups);
    const lines = (node.dataset.foundationTypewriterLines || '').split('\n').filter(Boolean), next = node.parentElement?.querySelector('[data-foundation-typewriter-next]');
    if (!next || !lines.length) return;
    let index = 0;
    const advance = () => { index = (index + 1) % lines.length; node.dispatchEvent(new CustomEvent('foundation:typewriter', {detail: lines[index]})); };
    next.addEventListener('click', advance); cleanups.push(() => next.removeEventListener('click', advance));
  });
  root.querySelectorAll('[data-foundation-format]').forEach(node => {
    format(node);
    if (node.dataset.foundationFormat === 'relative') { const interval = setInterval(() => format(node), 30000); cleanups.push(() => clearInterval(interval)); }
  });
  root.querySelectorAll('[data-foundation-ellipsis-tooltip]').forEach(node => { const cleanup = syncEllipsisTooltip(node); if (cleanup) cleanups.push(cleanup); });
  root.querySelectorAll('[data-foundation-scroll]').forEach(scroll => {
    const well = scroll.parentElement, button = well?.querySelector('[data-foundation-scroll-top]'), thumb = well?.querySelector('[data-foundation-scrollbar]'), shadow = well?.matches('.ely-foundation__scroll-shadow') ? well : null;
    const max = () => Math.max(0, scroll.scrollHeight - scroll.clientHeight);
    const update = () => {
      const reach = max(), position = reach ? scroll.scrollTop / reach : 0;
      if (button) button.hidden = scroll.scrollTop <= scroll.clientHeight / 2;
      if (thumb) thumb.value = String(Math.round(position * 1000));
      if (shadow) shadow.dataset.foundationScrollShadow = reach === 0 ? '' : `${scroll.scrollTop > 0 ? 'top' : ''}${scroll.scrollTop > 0 && scroll.scrollTop < reach ? ' ' : ''}${scroll.scrollTop < reach ? 'bottom' : ''}`;
    };
    const onThumb = () => { scroll.scrollTop = max() * Number(thumb.value || 0) / 1000; };
    const onKey = event => { if (event.key === 'Home') { scroll.scrollTop = 0; event.preventDefault(); } if (event.key === 'End') { scroll.scrollTop = max(); event.preventDefault(); } };
    update(); scroll.addEventListener('scroll', update, {passive: true}); scroll.addEventListener('keydown', onKey); thumb?.addEventListener('input', onThumb);
    cleanups.push(() => { scroll.removeEventListener('scroll', update); scroll.removeEventListener('keydown', onKey); thumb?.removeEventListener('input', onThumb); });
  });
  root.querySelectorAll('[data-foundation-aspect]').forEach(node => {
    const ratio = Number(node.dataset.foundationAspect);
    if (Number.isFinite(ratio) && ratio > 0) node.style.setProperty('--foundation-aspect', String(ratio));
  });
  root.querySelectorAll('[data-foundation-masonry]').forEach(masonry => {
    const items = [...masonry.children].filter(node => node.matches('article'));
    if (!items.length) return;
    const columns = Array.from({length: 3}, () => Object.assign(document.createElement('div'), {className: 'ely-foundation__masonry-column'}));
    const heights = [0, 0, 0];
    items.forEach(item => {
      const requested = Number(item.dataset.foundationMasonryHeight);
      const height = Number.isFinite(requested) ? Math.max(32, Math.min(240, requested)) : 56;
      const index = heights.indexOf(Math.min(...heights));
      item.style.setProperty('--foundation-masonry-height', `${height}px`);
      columns[index].append(item);
      heights[index] += height + 10;
    });
    masonry.append(...columns);
    cleanups.push(() => {
      columns.forEach(column => {
        [...column.children].forEach(item => { item.style.removeProperty('--foundation-masonry-height'); masonry.append(item); });
        column.remove();
      });
    });
  });
  root.querySelectorAll('[data-foundation-split-value]').forEach(split => {
    const value = Number(split.dataset.foundationSplitValue);
    if (!Number.isFinite(value)) return;
    const bounded = Math.max(25, Math.min(75, Math.round(value)));
    split.style.setProperty('--foundation-split', `${bounded}%`);
    split.querySelector('input[type=range]')?.setAttribute('value', String(bounded));
    split.querySelector('[data-foundation-split-handle]')?.setAttribute('aria-valuenow', String(bounded));
  });
  root.querySelectorAll('[data-foundation-viewport-node]').forEach(node => {
    const x = Number(node.dataset.foundationX), y = Number(node.dataset.foundationY), width = Number(node.dataset.foundationWidth);
    if (Number.isFinite(x)) node.style.setProperty('--foundation-node-x', `${x}px`);
    if (Number.isFinite(y)) node.style.setProperty('--foundation-node-y', `${y}px`);
    if (Number.isFinite(width) && width > 0) node.style.setProperty('--foundation-node-width', `${Math.min(240, width)}px`);
  });
  root.querySelectorAll('[data-foundation-measure]').forEach(node => {
    const output = node.parentElement?.querySelector('[data-foundation-measure-output]');
    const draw = () => { const bounds = node.getBoundingClientRect(); const value = `${Math.round(bounds.width)} × ${Math.round(bounds.height)}`; node.dataset.foundationMeasured = value; if (output) output.textContent = value; };
    draw();
    if (!globalThis.ResizeObserver) return;
    const observer = new ResizeObserver(draw); observer.observe(node);
    cleanups.push(() => observer.disconnect());
  });
  root.querySelectorAll('[data-foundation-measure-toggle]').forEach(toggle => {
    const update = () => { const demo = toggle.closest('.ely-foundation__measure-demo'); if (!demo) return; const wide = demo.dataset.foundationMeasureWide !== 'true'; demo.dataset.foundationMeasureWide = String(wide); toggle.textContent = wide ? toggle.dataset.foundationMeasureWideLabel : toggle.dataset.foundationMeasureNarrowLabel; emit(root, 'change', {measured: wide ? 'wide' : 'narrow'}); };
    toggle.addEventListener('click', update); cleanups.push(() => toggle.removeEventListener('click', update));
  });
  const onChange = event => {
    const details = event.target.closest('details');
    if (details) {
      const accordion = details.closest('[data-foundation-accordion]');
      if (accordion && details.open) accordion.querySelectorAll('details').forEach(item => { if (item !== details) item.open = false; });
      emit(root, 'change', {open: details.open});
    }
    const range = event.target.closest('[data-foundation-split] input[type=range]');
    if (range) setSplit(range.closest('[data-foundation-split]'), range.value);
  };
  const setSplit = (split, value) => {
    const numeric = Number(value);
    const bounded = Number.isFinite(numeric) ? Math.max(25, Math.min(75, Math.round(numeric))) : 50;
    split.style.setProperty('--foundation-split', `${bounded}%`);
    const range = split.querySelector('input[type=range]');
    const handle = split.querySelector('[data-foundation-split-handle]');
    if (range) range.value = bounded;
    if (handle) handle.setAttribute('aria-valuenow', String(bounded));
    emit(root, 'change', {value: bounded});
  };
  const onClick = async event => {
    const show = event.target.closest('[data-foundation-show]');
    if (show && !show.disabled) { const target = show.parentElement.querySelector('[data-foundation-conditional]'); const open = target?.hidden; if (target) target.hidden = !open; show.setAttribute('aria-expanded', String(open)); show.textContent = open ? (show.dataset.foundationHideLabel || 'Hide') : (show.dataset.foundationShowLabel || show.dataset.foundationLabel || 'Show'); emit(root, 'change', {name: show.name, value: open}); return; }
    const portal = event.target.closest('[data-foundation-portal]');
    if (portal && !portal.disabled) { const note = portal.parentElement.querySelector('[data-foundation-portal-note]'); const open = note?.hidden; if (note) note.hidden = !open; portal.setAttribute('aria-expanded', String(open)); emit(root, 'change', {open}); return; }
    const overlay = event.target.closest('[data-foundation-overlay]');
    if (overlay && !overlay.disabled) { const panel = overlay.parentElement.querySelector('[data-foundation-overlay-panel]'); if (panel) panel.hidden = false; overlay.setAttribute('aria-expanded', 'true'); return; }
    const overlayClose = event.target.closest('[data-foundation-overlay-close]');
    if (overlayClose || event.target.matches('[data-foundation-overlay-panel]')) { const panel = event.target.closest('[data-foundation-overlay-panel]') || event.target; panel.hidden = true; root.querySelector('[data-foundation-overlay]')?.setAttribute('aria-expanded', 'false'); return; }
    const menu = event.target.closest('[data-foundation-menu]');
    if (menu && !menu.disabled) { const panel = menu.parentElement.querySelector('[data-foundation-menu-panel]'); const open = panel?.hidden; if (panel) panel.hidden = !open; menu.setAttribute('aria-expanded', String(open)); emit(root, 'change', {open}); return; }
    if (!event.target.closest('.ely-foundation__menu')) root.querySelectorAll('[data-foundation-menu-panel]').forEach(panel => { panel.hidden = true; panel.parentElement.querySelector('[data-foundation-menu]')?.setAttribute('aria-expanded', 'false'); });
    if(event.target.matches('dialog[data-foundation-sheet]')){const box=event.target.getBoundingClientRect();if(event.clientX<box.left||event.clientX>box.right||event.clientY<box.top||event.clientY>box.bottom){event.target.close();return;}}
    const dialogOpen = event.target.closest('[data-foundation-dialog-open]');
    if (dialogOpen && !dialogOpen.disabled) { root.querySelector(`#${CSS.escape(dialogOpen.dataset.foundationDialogOpen)}`)?.showModal?.(); return; }
    if (event.target.closest('[data-foundation-dialog-close]')) { event.target.closest('dialog')?.close(); return; }
    const press = event.target.closest('[data-foundation-press]');
    if (press && !press.disabled) { const output = press.parentElement?.querySelector('[data-foundation-output]'); const taps = Number(press.dataset.foundationTaps || 0) + 1, holds = Number(press.dataset.foundationHolds || 0); press.dataset.foundationTaps = String(taps); if (output) output.value = output.textContent = `taps ${taps} · holds ${holds}`; emit(root, 'press', {taps, holds}); return; }
    const paste = event.target.closest('[data-foundation-paste-button]');
    if (paste && !paste.disabled) {
      const result = await foundationClipboard('read');
      const output = root.querySelector('[data-foundation-pasted]');
      if (output) output.textContent = result.ok ? result.value || 'The clipboard holds no text.' : 'The clipboard stayed shut.';
      emit(root, 'paste', result); return;
    }
    const copy = event.target.closest('[data-foundation-copy-button]');
    if (copy && !copy.disabled) { const icon = copy.querySelector('span:not([data-foundation-icon])'); if (icon) { icon.textContent = '✓'; clearTimeout(Number(copy.dataset.foundationCopyTimer)); copy.dataset.foundationCopyTimer = String(setTimeout(() => { icon.textContent = '⧉'; }, 1200)); } const value = selectText(root); emit(root, 'copy', {value}); if (copy.closest('.ely-foundation__clipboard')) { const result = await foundationClipboard('write', value); const output = root.querySelector('[data-foundation-pasted]'); if (output && !result.ok) output.textContent = 'The clipboard stayed shut.'; } return; }
    if (event.target.closest('[data-foundation-scroll-top]')) { root.querySelector('[data-foundation-scroll]')?.scrollTo({top: 0, behavior: 'smooth'}); emit(root, 'scroll-top'); return; }
    const item = event.target.closest('[data-foundation-master] nav button');
    if (item) { const master = item.closest('[data-foundation-master]'); master.querySelectorAll('nav button').forEach(button => button.setAttribute('aria-current', String(button === item))); const detail=master.querySelector('[data-foundation-detail]'); (detail.querySelector('p') || detail).textContent = item.textContent; emit(root, 'change', {value: item.textContent}); }
    const sidebar = event.target.closest('[data-foundation-sidebar-toggle]');
    if (sidebar) { const shell = sidebar.closest('[data-foundation-sidebar]'); const collapsed = shell.dataset.collapsed !== 'true'; shell.dataset.collapsed = String(collapsed); sidebar.setAttribute('aria-expanded', String(!collapsed)); sidebar.setAttribute('aria-label', collapsed ? 'Expand sidebar' : 'Collapse sidebar'); emit(root, 'change', {collapsed}); return; }
    const pageTab = event.target.closest('[data-foundation-page-tab]');
    if (pageTab) { const page = pageTab.closest('[data-foundation-page]'); page.querySelectorAll('[data-foundation-page-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab === pageTab))); page.querySelector('[data-foundation-page-content]').textContent = pageTab.textContent; emit(root, 'change', {value: pageTab.textContent}); return; }
    const dockTab = event.target.closest('[data-foundation-dock-tab]');
    if (dockTab) { const zone = dockTab.closest('[data-foundation-dock-zone]'); zone.querySelectorAll('[data-foundation-dock-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab === dockTab))); const output=zone.querySelector('output'); if(output) output.textContent = `${dockTab.textContent.trim()} panel`; emit(root, 'change', {value: dockTab.textContent}); return; }
    const floatingToggle = event.target.closest('[data-foundation-floating-toggle]');
    if (floatingToggle) { const panel = floatingToggle.closest('[data-foundation-floating]').querySelector('[data-foundation-floating-panel]'); const open = panel.hidden; panel.hidden = !open; floatingToggle.setAttribute('aria-expanded', String(open)); floatingToggle.textContent = open ? floatingToggle.dataset.foundationFloatingHide || 'Hide panel' : floatingToggle.dataset.foundationFloatingShow || 'Show panel'; emit(root, 'change', {open}); return; }
    const paneSplit = event.target.closest('[data-foundation-pane-split]');
    if (paneSplit) { const pane = paneSplit.closest('[data-foundation-pane]'); const group = pane?.closest('[data-foundation-panes]'); const copy = pane?.cloneNode(true); if (!group || !copy) return; copy.hidden = false; pane.after(copy); syncPaneClosers(group); emit(root, 'change', {split: paneSplit.dataset.foundationPaneSplit}); return; }
    const paneClose = event.target.closest('[data-foundation-pane-close]');
    if (paneClose) { const pane = paneClose.closest('[data-foundation-pane]'); const group = pane?.closest('[data-foundation-panes]'); const visible = [...(group?.querySelectorAll('[data-foundation-pane]') || [])].filter(node => !node.hidden); if (!pane || !group || visible.length < 2) return; pane.hidden = true; syncPaneClosers(group); emit(root, 'change', {closed: true}); return; }
    const paneSelect = event.target.closest('[data-foundation-pane-select]');
    if (paneSelect) { const pane = paneSelect.closest('[data-foundation-pane]'); pane.closest('[data-foundation-panes]').querySelectorAll('[data-foundation-pane]').forEach(node => node.setAttribute('aria-selected', String(node === pane))); emit(root, 'change', {value: paneSelect.textContent}); return; }
    const workspace = event.target.closest('[data-foundation-workspace-save],[data-foundation-workspace-reset]');
    if (workspace && !workspace.disabled) { const shell = workspace.closest('[data-foundation-workspace]'); const saved = workspace.hasAttribute('data-foundation-workspace-save'); const restore = workspace.hasAttribute('data-foundation-workspace-restore'); if (saved) shell.querySelector('[data-foundation-workspace-restore]')?.removeAttribute('disabled'); shell.querySelector('output').textContent = saved ? 'Layout saved' : restore ? 'Restored.' : 'Layout reset'; emit(root, 'change', {workspace: saved ? 'saved' : restore ? 'restored' : 'reset'}); return; }
  };
  const onKeydown = event => {
    const keys = event.target.closest('[data-foundation-keys]');
    if (keys) { keys.querySelector('output').textContent = event.key; emit(root, 'key', {key: event.key}); }
    const scope = event.target.closest('[data-foundation-scope]');
    if (scope && event.key === 'Escape') {
      const focusable = [...scope.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')];
      focusable.at(-1)?.focus();
      scope.dataset.foundationScopeReleased = 'true';
      root.dispatchEvent(new CustomEvent('ely:change', {bubbles: true, detail: {
        id: root.id, component: root.dataset.elyComponent, scopeReleased: true,
      }}));
      return;
    }
    const floatingHandle = event.target.closest('[data-foundation-floating-handle]');
    if(floatingHandle && ['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key)) {event.preventDefault();const panel=floatingHandle.closest('[data-foundation-floating-panel]');positionFloating(panel,Number(panel.dataset.foundationLeft)+(event.key==='ArrowLeft'?-10:event.key==='ArrowRight'?10:0),Number(panel.dataset.foundationTop)+(event.key==='ArrowUp'?-10:event.key==='ArrowDown'?10:0));emit(root,'change',{x:Number(panel.dataset.foundationLeft),y:Number(panel.dataset.foundationTop)});return;}
    const splitHandle = event.target.closest('[data-foundation-split-handle]');
    if (splitHandle && ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) { const split = splitHandle.closest('[data-foundation-split]'); const current = Number(splitHandle.getAttribute('aria-valuenow')) || 50; const horizontal = splitHandle.getAttribute('aria-orientation') === 'horizontal'; const decrease = horizontal ? event.key === 'ArrowUp' : event.key === 'ArrowLeft'; event.preventDefault(); setSplit(split, event.key === 'Home' ? 25 : event.key === 'End' ? 75 : current + (decrease ? -5 : 5)); return; }
    const viewport = event.target.closest('[data-foundation-viewport]');
    if (viewport && ['+', '=', '-', '_', '0'].includes(event.key)) { event.preventDefault(); const current = Number(viewport.dataset.foundationViewportScale || 1); const next = event.key === '0' ? 1 : Math.max(.1, Math.min(8, current + (event.key === '+' || event.key === '=' ? .1 : -.1))); viewport.dataset.foundationViewportScale = String(next); viewport.style.setProperty('--foundation-viewport-scale', String(next)); viewport.querySelector('output').textContent = `${Math.round(next * 100)}%`; emit(root, 'change', {scale: next}); return; }
    if (scope && event.key === 'Tab' && scope.dataset.foundationScopeReleased !== 'true') {
      const focusable = [...scope.querySelectorAll('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [href]')];
      const first = focusable[0], last = focusable[focusable.length - 1];
      if (first && last && ((!event.shiftKey && event.target === last) || (event.shiftKey && event.target === first))) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    }
    if (event.key === 'Escape') {
      root.querySelectorAll('[data-foundation-menu-panel]').forEach(panel => { panel.hidden = true; panel.parentElement.querySelector('[data-foundation-menu]')?.setAttribute('aria-expanded', 'false'); });
    }
    const dropzone = event.target.closest('[data-foundation-dropzone]');
    if (dropzone && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); dropzone.dataset.active = String(dropzone.dataset.active !== 'true'); emit(root, 'dropzone-focus', {active: dropzone.dataset.active === 'true'}); }
  };
  const syncPaneClosers = group => {
    const visible = [...group.querySelectorAll('[data-foundation-pane]')].filter(node => !node.hidden);
    visible.forEach(pane => pane.querySelector('[data-foundation-pane-close]')?.toggleAttribute('disabled', visible.length < 2));
  };
  root.querySelectorAll('[data-foundation-panes]').forEach(syncPaneClosers);
  let pointer = null;
  let longPress = 0;
  let dockDrag = null;
  const cancelLongPress = () => { if (longPress) { clearTimeout(longPress); longPress = 0; } };
  const onPointerDown = event => {
    const press = event.target.closest?.('[data-foundation-press]');
    if (press && !press.disabled) { press.textContent = press.dataset.foundationHoldingLabel || 'Holding'; press.dataset.foundationPressed = 'true'; cancelLongPress(); longPress = setTimeout(() => { longPress = 0; const holds = Number(press.dataset.foundationHolds || 0) + 1, taps = Number(press.dataset.foundationTaps || 0); press.dataset.foundationHolds = String(holds); const output = press.parentElement?.querySelector('[data-foundation-output]'); if (output) output.value = output.textContent = `taps ${taps} · holds ${holds}`; emit(root, 'longpress', {taps, holds}); }, 500); }
    const handle = event.target.closest?.('[data-foundation-split-handle]');
    if (handle && handle.tabIndex >= 0) { const split = handle.closest('[data-foundation-split]'); if (!split) return; const rect = split.getBoundingClientRect(); pointer = {kind: 'split', split, rect, horizontal: handle.getAttribute('aria-orientation') === 'horizontal'}; if (event.isTrusted) handle.setPointerCapture?.(event.pointerId); event.preventDefault(); return; }
    const viewport = event.target.closest?.('[data-foundation-viewport]');
    if (viewport) { pointer = {kind: 'viewport', viewport, x: event.clientX, y: event.clientY, left: Number(viewport.dataset.foundationViewportX || 0), top: Number(viewport.dataset.foundationViewportY || 0)}; if (event.isTrusted) viewport.setPointerCapture?.(event.pointerId); return; }
    const dialogHandle = event.target.closest?.('[data-foundation-dialog-handle]');
    if (dialogHandle) { pointer = {kind: 'sheet', dialog: dialogHandle.closest('dialog'), y: event.clientY}; if (event.isTrusted) dialogHandle.setPointerCapture?.(event.pointerId); event.preventDefault(); return; }
    const floating = event.target.closest?.('[data-foundation-floating-handle]');
    if (floating) { const panel = floating.closest('[data-foundation-floating-panel]'); pointer = {kind: 'floating', panel, x: event.clientX, y: event.clientY, left: Number(panel.dataset.foundationLeft || 0), top: Number(panel.dataset.foundationTop || 0)}; if (event.isTrusted) floating.setPointerCapture?.(event.pointerId); event.preventDefault(); }
  };
  const onPointerMove = event => {
    if (!pointer) return;
    if (pointer.kind === 'split') { const size = pointer.horizontal ? pointer.rect.height || 1 : pointer.rect.width || 1; const point = pointer.horizontal ? event.clientY - pointer.rect.top : event.clientX - pointer.rect.left; setSplit(pointer.split, (point / size) * 100); return; }
    const x = pointer.left + event.clientX - pointer.x, y = pointer.top + event.clientY - pointer.y;
    if (pointer.kind === 'viewport') { pointer.viewport.dataset.foundationViewportX = String(x); pointer.viewport.dataset.foundationViewportY = String(y); pointer.viewport.style.setProperty('--foundation-viewport-x', `${x}px`); pointer.viewport.style.setProperty('--foundation-viewport-y', `${y}px`); }
    if (pointer.kind === 'sheet') {pointer.deltaY=Math.max(0,event.clientY-pointer.y);pointer.dialog.style.transform=`translateY(${pointer.deltaY}px)`;}
    if (pointer.kind === 'floating') { positionFloating(pointer.panel, x, y); emit(root,'change',{x:Number(pointer.panel.dataset.foundationLeft),y:Number(pointer.panel.dataset.foundationTop)}); }
  };
  const onPointerUp = () => { if (pointer?.kind === 'sheet') {if(pointer.deltaY>pointer.dialog.offsetHeight*.3){pointer.dialog.close();emit(root,'change',{dismissed:true});}pointer.dialog.style.transform='';} root.querySelectorAll('[data-foundation-press][data-foundation-pressed]').forEach(press => { press.textContent = press.dataset.foundationPressLabel || 'Press'; delete press.dataset.foundationPressed; }); pointer = null; cancelLongPress(); };
  const onPointerOver = event => { const area = event.target.closest?.('.ely-foundation__hover'); if (area && !area.contains(event.relatedTarget)) { area.dataset.foundationHovered = 'true'; const label = area.querySelector('[data-foundation-hover-label]'); if (label) label.textContent = area.dataset.foundationHoverInside || 'Pointer inside'; emit(root, 'hover', {hovered: true}); } };
  const onPointerOut = event => { const area = event.target.closest?.('.ely-foundation__hover'); if (area && !area.contains(event.relatedTarget)) { delete area.dataset.foundationHovered; const label = area.querySelector('[data-foundation-hover-label]'); if (label) label.textContent = area.dataset.foundationHoverOutside || 'Pointer outside'; emit(root, 'hover', {hovered: false}); } };
  const onWheel = event => { const viewport = event.target.closest?.('[data-foundation-viewport]'); if (!viewport || !event.ctrlKey) return; event.preventDefault(); const current = Number(viewport.dataset.foundationViewportScale || 1); const next = Math.max(.1, Math.min(8, current + (event.deltaY < 0 ? .1 : -.1))); viewport.dataset.foundationViewportScale = String(next); viewport.style.setProperty('--foundation-viewport-scale', String(next)); viewport.querySelector('output').textContent = `${Math.round(next * 100)}%`; emit(root, 'change', {scale: next}); };
  const onDrag = event => {
    const dockZone = event.target.closest?.('[data-foundation-dock-zone]');
    if (dockZone) {
      event.preventDefault();
      if (event.type === 'dragenter') dockZone.dataset.foundationDockActive = 'true';
      if (event.type === 'dragleave') delete dockZone.dataset.foundationDockActive;
      if (event.type === 'drop') {
        delete dockZone.dataset.foundationDockActive;
        const dock = dockZone.closest('[data-foundation-dock]');
        const label = event.dataTransfer?.getData('text/plain') || dockDrag?.textContent || 'Dock panel';
        const tab = dockDrag?.closest('[data-foundation-dock]') === dock ? dockDrag : Object.assign(document.createElement('button'), {type: 'button', textContent: label, draggable: true});
        tab.dataset.foundationDockTab = '';
        tab.setAttribute('aria-selected', 'true');
        dockZone.querySelectorAll('[data-foundation-dock-tab]').forEach(item => { if (item !== tab) item.setAttribute('aria-selected', 'false'); });
        let nav=dockZone.querySelector('nav'); if(!nav){nav=document.createElement('nav');dockZone.prepend(nav);}
        nav.append(tab);
        let output=dockZone.querySelector('output');if(!output){output=document.createElement('output');dockZone.append(output);}
        output.textContent=`${label.trim()} panel`;
        dockDrag = null;
        emit(root, 'change', {dock: dockZone.dataset.foundationDockZone, value: label});
      }
      return;
    }
    const zone = event.target.closest?.('[data-foundation-dropzone]');
    if (!zone) return;
    event.preventDefault();
    if (event.type === 'dragenter') zone.dataset.active = 'true';
    if (event.type === 'dragleave') delete zone.dataset.active;
    if (event.type === 'drop') { delete zone.dataset.active; emit(root, 'drop', {value: event.dataTransfer?.getData('text/plain') || ''}); }
  };
  const onDragStart = event => { const tab = event.target.closest?.('[data-foundation-dock-tab]'); if (!tab) return; dockDrag = tab; event.dataTransfer?.setData('text/plain', tab.textContent); if (event.dataTransfer) event.dataTransfer.effectAllowed = 'move'; };
  const onDragEnd = () => { dockDrag = null; root.querySelectorAll('[data-foundation-dock-zone]').forEach(zone => delete zone.dataset.foundationDockActive); };
  const onFocusIn = event => {
    const scope = event.target.closest?.('[data-foundation-scope]');
    if (scope?.dataset.foundationScopeReleased === 'true') delete scope.dataset.foundationScopeReleased;
  };
  root.addEventListener('change', onChange);
  root.addEventListener('click', onClick);
  root.addEventListener('keydown', onKeydown);
  root.addEventListener('dragenter', onDrag);
  root.addEventListener('dragstart', onDragStart);
  root.addEventListener('dragend', onDragEnd);
  root.addEventListener('dragleave', onDrag);
  root.addEventListener('dragover', onDrag);
  root.addEventListener('drop', onDrag);
  root.addEventListener('focusin', onFocusIn);
  root.addEventListener('pointerdown', onPointerDown);
  root.addEventListener('pointermove', onPointerMove);
  root.addEventListener('pointerup', onPointerUp);
  root.addEventListener('pointercancel', onPointerUp);
  root.addEventListener('pointerover', onPointerOver);
  root.addEventListener('pointerout', onPointerOut);
  root.addEventListener('wheel', onWheel, {passive: false});
  let stopped = false;
  const stop = () => {
    if (stopped) return;
    stopped = true;
    cancelLongPress();
    cleanups.splice(0).forEach(cleanup => cleanup());
    root.removeEventListener('ely:cleanup', stop);
    root.removeEventListener('change', onChange);
    root.removeEventListener('dragstart', onDragStart);
    root.removeEventListener('dragend', onDragEnd);
    root.removeEventListener('click', onClick);
    root.removeEventListener('keydown', onKeydown);
    root.removeEventListener('dragenter', onDrag);
    root.removeEventListener('dragleave', onDrag);
    root.removeEventListener('dragover', onDrag);
    root.removeEventListener('drop', onDrag);
    root.removeEventListener('focusin', onFocusIn);
    root.removeEventListener('pointerdown', onPointerDown);
    root.removeEventListener('pointermove', onPointerMove);
    root.removeEventListener('pointerup', onPointerUp);
    root.removeEventListener('pointercancel', onPointerUp);
    root.removeEventListener('pointerover', onPointerOver);
    root.removeEventListener('pointerout', onPointerOut);
    root.removeEventListener('wheel', onWheel);
  };
  root.addEventListener('ely:cleanup', stop, {once: true});
  return stop;
});

// Access is requested only by the caller's explicit clipboard button activation.
export async function foundationClipboard(operation, value = '', clipboard = globalThis.navigator?.clipboard) {
  try {
    if (operation === 'read') return {ok: true, value: await clipboard.readText()};
    await clipboard.writeText(value); return {ok: true, value};
  } catch { return {ok: false, value}; }
}
