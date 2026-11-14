import uPlot from '/assets/uPlot.esm.js';
import {watchChart} from '/assets/ely-chart-lifecycle.js';

export function createRangeIndex(values) {
  let size = 1; while (size < values.length) size *= 2;
  const min = new Uint32Array(size * 2), max = new Uint32Array(size * 2);
  min.fill(0xffffffff); max.fill(0xffffffff);
  const pick = (a, b, lower) => a === 0xffffffff ? b : b === 0xffffffff ? a : (lower ? values[a] <= values[b] : values[a] >= values[b]) ? a : b;
  for (let i = 0; i < values.length; i++) if (Number.isFinite(values[i])) min[size + i] = max[size + i] = i;
  for (let i = size - 1; i; i--) { min[i] = pick(min[i * 2], min[i * 2 + 1], true); max[i] = pick(max[i * 2], max[i * 2 + 1], false); }
  const gaps = [];
  for (let i = 1; i < values.length; i++) if (Number.isFinite(values[i]) !== Number.isFinite(values[i - 1])) gaps.push(i - 1, i);
  return { values, min, max, size, gaps };
}

// Existing leaves stay valid; update only the newly appended paths.
export function appendRangeIndex(index, values, from) {
  if (values.length > index.size || from !== index.values.length || from > values.length) throw new RangeError('invalid index append');
  index.values = values;
  const pick = (left, right, lower) => left === 0xffffffff ? right : right === 0xffffffff ? left : (lower ? values[left] <= values[right] : values[left] >= values[right]) ? left : right;
  for (let i = from; i < values.length; i++) {
    if (i && Number.isFinite(values[i]) !== Number.isFinite(values[i - 1])) index.gaps.push(i - 1, i);
    let p = index.size + i;
    index.min[p] = index.max[p] = Number.isFinite(values[i]) ? i : 0xffffffff;
    while ((p = Math.floor(p / 2)) > 0) {
      const a = p * 2, b = a + 1;
      index.min[p] = pick(index.min[a], index.min[b], true);
      index.max[p] = pick(index.max[a], index.max[b], false);
    }
  }
  return index;
}

function extrema(index, from, to) {
  const { values, min, max, size } = index;
  let lo = -1, hi = -1;
  const take = i => {
    if (i < 0 || i >= values.length || !Number.isFinite(values[i])) return;
    if (lo < 0 || values[i] < values[lo]) lo = i;
    if (hi < 0 || values[i] > values[hi]) hi = i;
  };
  let left = from + size, right = to + 1 + size;
  while (left < right) {
    if (left & 1) { take(min[left]); take(max[left++]); }
    if (right & 1) { --right; take(min[right]); take(max[right]); }
    left >>= 1; right >>= 1;
  }
  return lo < 0 ? [] : lo === hi ? [lo] : lo < hi ? [lo, hi] : [hi, lo];
}

// Return aligned uPlot data reduced to viewport pixel buckets. Missing samples
// are retained as breaks; each bucket keeps both extrema in original time order.
export function reduceTimeSeries(x, series, indexes, minX, maxX, pixelWidth) {
  const start = lowerBound(x, minX), end = upperBound(x, maxX);
  if (start >= end || pixelWidth <= 0) return [[], ...series.map(() => [])];
  const width = Math.max(1, Math.floor(pixelWidth));
  const outX = [], outY = series.map(() => []);
  let lastIndex = -1;
  for (let bucket = 0; bucket < width; bucket++) {
    const a = lowerBound(x, minX + (maxX - minX) * bucket / width);
    const b = bucket === width - 1 ? end - 1 : Math.min(end - 1, lowerBound(x, minX + (maxX - minX) * (bucket + 1) / width) - 1);
    if (b < a) continue;
    const chosen = new Set([a, b]);
    for (let s = 0; s < series.length; s++) {
      const row = series[s], gaps = indexes[s].gaps;
      let runStart = Number.isFinite(row[a]) ? a : -1;
      let g = lowerBound(gaps, a);
      while (g < gaps.length && gaps[g] <= b) {
        const i = gaps[g++]; chosen.add(i);
        if (i === 0 || Number.isFinite(row[i]) === Number.isFinite(row[i - 1])) continue;
        if (Number.isFinite(row[i])) runStart = i;
        else if (runStart >= 0) {
          for (const point of extrema(indexes[s], runStart, i - 1)) chosen.add(point);
          runStart = -1;
        }
      }
      if (runStart >= 0) for (const point of extrema(indexes[s], runStart, b)) chosen.add(point);
    }
    const ordered = [...chosen].sort((p, q) => p - q);
    for (const i of ordered) {
      if (i <= lastIndex) continue;
      outX.push(x[i]);
      for (let s = 0; s < series.length; s++) outY[s].push(Number.isFinite(series[s][i]) ? series[s][i] : null);
      lastIndex = i;
    }
  }
  return [outX, ...outY];
}

function lowerBound(a, v) { let l = 0, r = a.length; while (l < r) { const m = (l + r) >>> 1; if (a[m] < v) l = m + 1; else r = m; } return l; }
function upperBound(a, v) { let l = 0, r = a.length; while (l < r) { const m = (l + r) >>> 1; if (a[m] <= v) l = m + 1; else r = m; } return l; }

export function createYScale(config = {}) {
  if (!config || typeof config !== 'object' || Array.isArray(config)) throw new TypeError('yScale must be an object');
  const {type = 'linear', base = 10, constant = 1} = config;
  if (type === 'linear') return {};
  if (type === 'log') {
    if (!Number.isFinite(base) || base <= 1) throw new RangeError('log base must be greater than 1');
    return {distr: 3, log: base};
  }
  if (type === 'symlog') {
    if (!Number.isFinite(constant) || constant <= 0) throw new RangeError('symlog constant must be positive');
    return {distr: 100, fwd: value => Math.sign(value) * Math.log1p(Math.abs(value) / constant), bwd: value => Math.sign(value) * constant * Math.expm1(Math.abs(value))};
  }
  throw new RangeError('yScale type must be linear, log, or symlog');
}

// A link retains the latest state so charts mounted later join at the same view.
export function createTimeSeriesLink() {
  let viewport = null, selectedX = undefined;
  const members = new Set();
  const publish = (source, update) => {
    for (const member of members) if (member.source !== source) member.callback(update);
  };
  return {
    subscribe(source, callback) {
      if (typeof callback !== 'function') throw new TypeError('link member must be a function');
      const member = {source, callback}; members.add(member);
      if (viewport || selectedX !== undefined) callback({viewport, selectedX});
      return () => members.delete(member);
    },
    setViewport(source, next) {
      if (!next || !Number.isFinite(next.min) || !Number.isFinite(next.max) || next.min > next.max) throw new TypeError('viewport must have finite ordered bounds');
      if (viewport?.min === next.min && viewport.max === next.max) return;
      viewport = {min: next.min, max: next.max}; publish(source, {viewport});
    },
    setSelectedX(source, next) {
      if (next != null && !Number.isFinite(next)) throw new TypeError('selected X must be finite or null');
      if (selectedX === next) return;
      selectedX = next; publish(source, {selectedX});
    },
  };
}

export function mountTimeSeries(root, options) {
  if (!(root instanceof Element)) throw new TypeError('root must be an Element');
  let { x, series } = options;
  const { labels = [], colors = [], link = null, onCursor, onCursorX, onSelect, onSelectX, onViewport, yScale = {}, timeZone } = options;
  if (link != null && (typeof link.subscribe !== 'function' || typeof link.setViewport !== 'function' || typeof link.setSelectedX !== 'function')) throw new TypeError('link must be created by createTimeSeriesLink');
  const yScaleOptions = createYScale(yScale);
  if (timeZone != null) new Intl.DateTimeFormat('en-US', {timeZone});
  if (!(x instanceof Float64Array) || !x.length || !Array.isArray(series) || !series.length || series.some(row => !row || row.length !== x.length)) throw new TypeError('x must be a non-empty Float64Array aligned with every series');
  for (let i = 0; i < x.length; i++) if (!Number.isFinite(x[i]) || (i && x[i] <= x[i - 1])) throw new RangeError('x timestamps must be finite and strictly increasing');
  if (yScale.type === 'log') for (const row of series) for (const value of row) if (Number.isFinite(value) && value <= 0) throw new RangeError('log scale needs positive Y values');
  let indexes = series.map(createRangeIndex), storage = null;
  const wrap = document.createElement('div'), controls = document.createElement('div');
  wrap.className = 'ely-timeseries'; controls.className = 'ely-timeseries-controls';
  root.replaceChildren(controls, wrap);
  let plot, destroyed = false, frame = 0, refreshing = false, syncing = false, domain = [x[0], x[x.length - 1]], gesture = null, selectedX = null;
  const selectionLine = document.createElement('div'); selectionLine.className = 'ely-timeseries-selection'; selectionLine.hidden = true;
  const positionSelection = () => {
    if (!plot) return;
    const visible = selectedX != null && selectedX >= plot.scales.x.min && selectedX <= plot.scales.x.max;
    selectionLine.hidden = !visible;
    if (visible) selectionLine.style.left = `${plot.valToPos(selectedX, 'x')}px`;
  };
  const reduce = () => {
    frame = 0; if (destroyed || !plot) return;
    const scale = plot.scales.x, next = reduceTimeSeries(x, series, indexes, scale.min, scale.max, plot.bbox.width);
    plot._elyRawIndex = next[0].map(v => lowerBound(x, v));
    // setData(false) alone leaves uPlot's visible indices and paths stale.
    refreshing = true;
    try { plot.batch(() => { plot.setData(next, false); plot.redraw(); }); }
    finally { refreshing = false; }
  };
  const schedule = () => { if (!frame) frame = requestAnimationFrame(reduce); };
  const hooks = {
    setScale: [(_plot, key) => { if (key !== 'x' || refreshing) return; schedule(); positionSelection(); const viewport = { min: _plot.scales.x.min, max: _plot.scales.x.max }; if (!syncing) link?.setViewport(chart, viewport); onViewport?.(viewport); }],
    setCursor: [(_plot) => { const i = _plot.cursor.idx == null ? null : _plot._elyRawIndex?.[_plot.cursor.idx]; onCursor?.(i == null ? null : { index: i, x: x[i], values: series.map(row => row[i]) }); onCursorX?.(_plot.cursor.left >= 0 ? _plot.posToVal(_plot.cursor.left, 'x') : null); }],
    setSelect: [(_plot) => { const { left, width } = _plot.select; if (width > 0) onSelect?.({ min: _plot.posToVal(left, 'x'), max: _plot.posToVal(left + width, 'x') }); }],
  };
  const chartSeries = [{}, ...series.map((_, i) => ({ label: labels[i] || `Series ${i + 1}`, stroke: colors[i], width: 1.5 }))];
  const initial = reduceTimeSeries(x, series, indexes, domain[0], domain[1], root.clientWidth || 640);
  plot = new uPlot({ width: root.clientWidth || 640, height: options.height || 320, series: chartSeries, hooks, ...(timeZone == null ? {} : {tzDate: ts => uPlot.tzDate(new Date(ts * 1000), timeZone)}), cursor: { drag: { setScale: false, x: true, y: false } }, select: { show: true }, legend: { show: options.legend !== false }, scales: { x: { time: options.time !== false }, y: yScaleOptions } }, initial, wrap);
  plot.over.append(selectionLine);
  plot._elyRawIndex = initial[0].map(v => lowerBound(x, v));
  const setSelectedX = (value, publish = true) => {
    if (value != null && !Number.isFinite(value)) throw new TypeError('selected X must be finite or null');
    selectedX = value; positionSelection(); if (publish) link?.setSelectedX(chart, value);
  };
  let clickStart = null;
  const selectDown = e => { if (e.isPrimary && e.button === 0) clickStart = {id: e.pointerId, x: e.clientX, y: e.clientY}; };
  const selectUp = e => {
    if (clickStart?.id === e.pointerId && Math.hypot(e.clientX - clickStart.x, e.clientY - clickStart.y) < 6) {
      const rect = plot.over.getBoundingClientRect();
      const value = plot.posToVal(Math.max(0, Math.min(rect.width, e.clientX - rect.left)), 'x');
      setSelectedX(value); onSelectX?.(value);
    }
    clickStart = null;
  };
  const selectCancel = () => { clickStart = null; };
  plot.over.addEventListener('pointerdown', selectDown); wrap.addEventListener('pointerup', selectUp); wrap.addEventListener('pointercancel', selectCancel);
  const zoomAt = (anchor, factor) => {
    const scale = plot.scales.x, span = Math.min(domain[1] - domain[0], (scale.max - scale.min) * factor);
    if (!(span > 0)) return;
    const fraction = (anchor - scale.min) / (scale.max - scale.min);
    const min = Math.max(domain[0], Math.min(domain[1] - span, anchor - fraction * span));
    plot.setScale('x', {min, max: min + span});
  };
  for (const [label, action] of [['Zoom in', () => zoomAt((plot.scales.x.min + plot.scales.x.max) / 2, .5)], ['Zoom out', () => zoomAt((plot.scales.x.min + plot.scales.x.max) / 2, 2)], ['Reset', () => plot.setScale('x', {min: domain[0], max: domain[1]})]]) {
    const button = document.createElement('button'); button.type = 'button'; button.textContent = label;
    button.addEventListener('click', action); controls.append(button);
  }
  const zoom = e => {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    const rect = plot.over.getBoundingClientRect();
    zoomAt(plot.posToVal(e.clientX - rect.left, 'x'), Math.exp(e.deltaY * 0.0015));
  };
  wrap.addEventListener('wheel', zoom, { passive: false });
  const pointDown = e => {
    if (e.pointerType !== 'touch') return;
    wrap.setPointerCapture?.(e.pointerId);
    if (!gesture) gesture = { points: new Map(), min: plot.scales.x.min, max: plot.scales.x.max };
    gesture.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (gesture.points.size > 1) selectCancel();
    gesture.start = [...gesture.points.values()]; gesture.min = plot.scales.x.min; gesture.max = plot.scales.x.max;
  };
  const pointMove = e => {
    if (!gesture?.points.has(e.pointerId)) return;
    gesture.points.set(e.pointerId, { x: e.clientX, y: e.clientY });
    const pts = [...gesture.points.values()], span = gesture.max - gesture.min;
    if (pts.length >= 2 && gesture.start.length >= 2) {
      const d0 = Math.abs(gesture.start[0].x - gesture.start[1].x), d1 = Math.abs(pts[0].x - pts[1].x);
      const anchor = (gesture.start[0].x + gesture.start[1].x) / 2;
      const ratio = d0 > 0 ? d0 / Math.max(1, d1) : 1;
      const rect = plot.over.getBoundingClientRect();
      const center = gesture.min + ((anchor - rect.left) / Math.max(1, rect.width)) * span;
      const nextSpan = Math.min(domain[1] - domain[0], span * ratio);
      const min = Math.max(domain[0], center - (center - gesture.min) * ratio), max = Math.min(domain[1], min + nextSpan);
      plot.setScale('x', { min: Math.max(domain[0], max - nextSpan), max });
    } else if (pts.length === 1 && gesture.start.length === 1) {
      const dx = pts[0].x - gesture.start[0].x, shift = -dx / Math.max(1, plot.over.clientWidth) * span;
      const min = Math.max(domain[0], Math.min(domain[1] - span, gesture.min + shift));
      plot.setScale('x', { min, max: min + span });
    }
  };
  const pointUp = e => { if (!gesture) return; gesture.points.delete(e.pointerId); if (!gesture.points.size) gesture = null; else { gesture.start = [...gesture.points.values()]; gesture.min = plot.scales.x.min; gesture.max = plot.scales.x.max; } };
  wrap.addEventListener('pointerdown', pointDown); wrap.addEventListener('pointermove', pointMove); wrap.addEventListener('pointerup', pointUp); wrap.addEventListener('pointercancel', pointUp);
  wrap.style.touchAction = 'pan-y';
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => { const width = Math.floor(entries[0].contentRect.width); if (width > 0 && plot) { plot.setSize({ width, height: options.height || 320 }); schedule(); positionSelection(); } }) : null;
  observer?.observe(wrap);
  let unwatch = () => {}, unlink = () => {};
  const chart = { plot, setSelectedX, append(newX, newSeries, {follow = false} = {}) {
    if (destroyed) throw new Error('chart has been destroyed');
    if (!newX || !Number.isSafeInteger(newX.length) || !Array.isArray(newSeries) || newSeries.length !== series.length || newSeries.some(row => !row || row.length !== newX.length)) throw new TypeError('appended series must align with X');
    const oldLength = x.length, count = newX.length;
    if (!count) return;
    let last = x[oldLength - 1];
    for (const value of newX) { if (!Number.isFinite(value) || value <= last) throw new RangeError('appended X must be finite and strictly increasing'); last = value; }
    if (yScale.type === 'log') for (const row of newSeries) for (const value of row) if (Number.isFinite(value) && value <= 0) throw new RangeError('log scale needs positive Y values');
    const total = oldLength + count, oldMax = domain[1], scale = plot.scales.x;
    if (!storage || total > storage.x.length) {
      let capacity = indexes[0]?.size || 1;
      while (capacity < total) capacity *= 2;
      const next = {x: new Float64Array(capacity), series: series.map(() => new Float64Array(capacity))};
      next.x.set(x);
      for (let s = 0; s < series.length; s++) for (let i = 0; i < oldLength; i++) next.series[s][i] = Number.isFinite(series[s][i]) ? series[s][i] : NaN;
      storage = next;
    }
    for (let i = 0; i < count; i++) {
      storage.x[oldLength + i] = newX[i];
      for (let s = 0; s < series.length; s++) storage.series[s][oldLength + i] = Number.isFinite(newSeries[s][i]) ? newSeries[s][i] : NaN;
    }
    const nextX = storage.x.subarray(0, total), nextSeries = storage.series.map(row => row.subarray(0, total));
    indexes = indexes.map((index, i) => total > index.size ? createRangeIndex(nextSeries[i]) : appendRangeIndex(index, nextSeries[i], oldLength));
    x = nextX; series = nextSeries; domain = [x[0], x[total - 1]];
    if (follow && scale.max >= oldMax) {
      const span = scale.max - scale.min;
      plot.setScale('x', {min: Math.max(domain[0], domain[1] - span), max: domain[1]});
    } else schedule();
  }, destroy() { if (destroyed) return; destroyed = true; unlink(); unwatch(); if (frame) cancelAnimationFrame(frame); observer?.disconnect(); root.removeEventListener('htmx:beforeCleanupElement', cleanup); wrap.removeEventListener('wheel', zoom); wrap.removeEventListener('pointerdown', pointDown); wrap.removeEventListener('pointermove', pointMove); wrap.removeEventListener('pointerup', pointUp); wrap.removeEventListener('pointercancel', pointUp); plot.over.removeEventListener('pointerdown', selectDown); wrap.removeEventListener('pointerup', selectUp); wrap.removeEventListener('pointercancel', selectCancel); plot.destroy(); if (controls.parentNode === root) controls.remove(); if (wrap.parentNode === root) wrap.remove(); } };
  const cleanup = event => { if (event.target === root) chart.destroy(); };
  root.addEventListener('htmx:beforeCleanupElement', cleanup);
  unwatch = watchChart(root, wrap, chart.destroy);
  if (link) unlink = link.subscribe(chart, update => {
    if (destroyed) return;
    if (update.viewport) {
      const min = Math.max(domain[0], update.viewport.min), max = Math.min(domain[1], update.viewport.max);
      if (min <= max) { syncing = true; try { plot.setScale('x', {min, max}); } finally { syncing = false; } }
    }
    if (Object.hasOwn(update, 'selectedX')) setSelectedX(update.selectedX, false);
  });
  return chart;
}
