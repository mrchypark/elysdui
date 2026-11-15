import {watchChart} from '/assets/ely-chart-lifecycle.js';

const finite = value => typeof value === 'number' && Number.isFinite(value);
const number = (value, name) => { if (!finite(value)) throw new TypeError(`${name} must be a finite number`); return value; };
const text = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`); return value; };
const round = value => Number(value.toPrecision(6));
const MAX_BINS = 10_000;
const bounds = (values, zero = false) => {
  let low = zero ? 0 : Infinity, high = zero ? 0 : -Infinity;
  for (const value of values) { if (value < low) low = value; if (value > high) high = value; }
  return [low, high];
};
const range = (values, zero = false) => {
  const [low, high] = bounds(values, zero);
  return low === high ? [low - 1, high + 1] : [low, high];
};

export function histogramModel(values, count = 10) {
  if (!Array.isArray(values) || !values.every(finite)) throw new TypeError('Histogram data must be an array of finite numbers');
  if (!Number.isInteger(count) || count < 1 || count > MAX_BINS) throw new RangeError(`bins must be an integer from 1 to ${MAX_BINS}`);
  if (!values.length) return [];
  const [low, high] = bounds(values), raw = (high - low) / count, power = 10 ** Math.floor(Math.log10(raw || 1)), fraction = raw / power, width = high === low ? 1 : (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * power, start = Math.floor(low / width) * width, many = Math.max(1, Math.ceil((high - start) / width));
  if (many > MAX_BINS) throw new RangeError(`histogram has more than ${MAX_BINS} bins`);
  const bins = Array.from({ length: many }, (_, index) => ({ start: start + width * index, end: start + width * (index + 1), count: 0 }));
  values.forEach(value => bins[Math.min(bins.length - 1, Math.floor((value - start) / width))].count++);
  return bins;
}

export function spread(values) {
  if (!Array.isArray(values) || values.length < 2 || !values.every(finite)) throw new TypeError('Each group needs at least two finite numbers');
  const sorted = [...values].sort((a, b) => a - b), quantile = share => { const at = share * (sorted.length - 1), low = Math.floor(at), high = Math.ceil(at); return sorted[low] + (sorted[high] - sorted[low]) * (at - low); };
  const q1 = quantile(.25), median = quantile(.5), q3 = quantile(.75), reach = (q3 - q1) * 1.5;
  const inside = sorted.filter(value => value >= q1 - reach && value <= q3 + reach);
  return { low: inside[0], q1, median, q3, high: inside.at(-1), outliers: sorted.filter(value => value < inside[0] || value > inside.at(-1)) };
}

export function density(values, samples = 40) {
  if (!Array.isArray(values) || values.length < 2 || !values.every(finite)) throw new TypeError('Density data needs at least two finite numbers');
  if (!Number.isInteger(samples) || samples < 2) throw new RangeError('samples must be at least 2');
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
  const deviation = Math.sqrt(values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / (values.length - 1));
  const [low, high] = bounds(values), rawBandwidth = 1.06 * deviation * values.length ** -.2, bandwidth = rawBandwidth > Number.EPSILON ? rawBandwidth : Math.max(Math.abs(mean) * .01, .01), from = low - bandwidth, to = high + bandwidth, normal = 1 / (values.length * bandwidth * Math.sqrt(2 * Math.PI));
  return Array.from({ length: samples }, (_, index) => { const value = from + (to - from) * index / (samples - 1); return [value, values.reduce((sum, item) => sum + Math.exp(-.5 * ((value - item) / bandwidth) ** 2), 0) * normal]; });
}

export function waterfallModel(steps) {
  if (!Array.isArray(steps) || !steps.length) throw new TypeError('Waterfall data must be a non-empty array');
  let running = 0;
  return steps.map((step, index) => {
    if (!step || typeof step !== 'object') throw new TypeError(`Waterfall step ${index + 1} must be an object`);
    const label = text(step.label, `Waterfall step ${index + 1} label`), total = step.total === true, value = total ? 0 : number(step.value, `Waterfall step ${index + 1} value`), from = running;
    if (!total) running += value;
    return { label, value, total, start: total ? Math.min(0, running) : Math.min(from, running), end: total ? Math.max(0, running) : Math.max(from, running), kind: total ? 'total' : value >= 0 ? 'up' : 'down', running };
  });
}

function groups(data) {
  if (!Array.isArray(data) || !data.length) throw new TypeError('BoxPlot and ViolinPlot data must be a non-empty group array');
  return data.map((group, index) => ({ label: text(group?.label, `Group ${index + 1} label`), values: group.values })).map(group => ({ ...group, stats: spread(group.values) }));
}
function* chartValues(type, model, densities) {
  if (type === 'Histogram') for (const item of model) yield item.count;
  else if (type === 'WaterfallChart') for (const item of model) { yield item.start; yield item.end; }
  else if (type === 'ViolinPlot') for (const shape of densities) for (const [value] of shape) yield value;
  else for (const group of model) yield* group.values;
}
function svg(name, attributes = {}) { const element = document.createElementNS('http://www.w3.org/2000/svg', name); Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value))); return element; }
function html(name, attributes = {}) { const element = document.createElement(name); Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, value)); return element; }
function fmt(value) { return Number.isInteger(value) ? String(value) : round(value).toLocaleString(undefined, { maximumFractionDigits: 4 }); }

/**
 * Mount an Ely GPUI-compatible statistical SVG chart.
 * type: Histogram (number[]), BoxPlot/ViolinPlot ({label,values[]}[]), or
 * WaterfallChart ({label,value,total?}[]). options: bins, height, onSelect.
 * Returns an idempotent destroy function. The root receives SVG and a screen-reader table.
 */
export function mountStatChart(root, { type, data, bins = 10, height = 320, onSelect } = {}) {
  if (!(root instanceof Element)) throw new TypeError('root must be an Element');
  if (!finite(height) || height < 160) throw new RangeError('height must be at least 160');
  if (typeof onSelect !== 'undefined' && typeof onSelect !== 'function') throw new TypeError('onSelect must be a function');
  const kind = String(type || '').toLowerCase(), chartType = { histogram: 'Histogram', boxplot: 'BoxPlot', violinplot: 'ViolinPlot', waterfallchart: 'WaterfallChart' }[kind];
  if (!chartType) throw new RangeError('type must be Histogram, BoxPlot, ViolinPlot, or WaterfallChart');
  const model = chartType === 'Histogram' ? histogramModel(data, bins) : chartType === 'WaterfallChart' ? waterfallModel(data) : groups(data), densities = chartType === 'ViolinPlot' ? model.map(item => density(item.values)) : null;
  const width = 720, left = 58, right = 20, top = 20, bottom = height - 46, plotWidth = width - left - right;
  const labels = chartType === 'Histogram' ? model.map(bin => `${fmt(bin.start)}–${fmt(bin.end)}`) : model.map(item => item.label);
  const [low, high] = range(chartValues(chartType, model, densities), chartType === 'Histogram' || chartType === 'WaterfallChart'), y = value => bottom - (value - low) / (high - low) * (bottom - top), band = index => ({ x: left + index * plotWidth / Math.max(1, labels.length), width: plotWidth / Math.max(1, labels.length) });
  const wrap = html('section', { class: 'ely-stat-chart', 'data-ely-stat-chart': chartType });
  const titleId = `ely-stat-title-${Math.random().toString(36).slice(2)}`, title = html('h3', { id: titleId }); title.textContent = chartType;
  const status = html('output', { class: 'ely-stat-chart-status', 'aria-live': 'polite' });
  const chart = svg('svg', { viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-labelledby': titleId, 'data-stat-svg': '' });
  const targetLayer = svg('g', { class: 'ely-stat-chart-targets' }), targets = [];
  for (let tick = 0; tick <= 4; tick++) { const value = low + (high - low) * tick / 4, py = y(value); chart.append(svg('line', { x1: left, x2: width - right, y1: py, y2: py, class: 'ely-stat-grid' }), svg('text', { x: left - 8, y: py + 4, class: 'ely-stat-axis', 'text-anchor': 'end' })); chart.lastChild.textContent = fmt(value); }
  const addTarget = (index, x, itemWidth, description, payload) => { const target = svg('rect', { x, y: top, width: itemWidth, height: bottom - top, class: 'ely-stat-hit', role: 'button', tabindex: index ? -1 : 0, 'data-stat-index': index, 'aria-label': description }); target._statPayload = payload; targets.push(target); targetLayer.append(target); };
  if (chartType === 'Histogram') model.forEach((item, index) => { const slot = band(index), x = slot.x + slot.width * .06, barWidth = slot.width * .88, py = y(item.count); chart.append(svg('rect', { x, y: py, width: barWidth, height: bottom - py, class: 'ely-stat-bar' })); addTarget(index, slot.x, slot.width, `${labels[index]}: ${item.count}`, { index, ...item }); });
  if (chartType === 'WaterfallChart') model.forEach((item, index) => { const slot = band(index), x = slot.x + slot.width * .18, barWidth = slot.width * .64, py = y(Math.max(item.start, item.end)), barBottom = y(Math.min(item.start, item.end)); chart.append(svg('rect', { x, y: py, width: barWidth, height: Math.max(1, barBottom - py), class: `ely-stat-bar ely-stat-${item.kind}` })); if (index + 1 < model.length) chart.append(svg('line', { x1: x + barWidth, x2: band(index + 1).x + band(index + 1).width * .18, y1: y(item.running), y2: y(item.running), class: 'ely-stat-connector' })); addTarget(index, slot.x, slot.width, `${item.label}: ${item.total ? 'total' : 'change'} ${fmt(item.total ? item.running : item.value)}`, { index, ...item }); });
  if (chartType === 'BoxPlot') model.forEach((item, index) => { const slot = band(index), x = slot.x + slot.width * .28, boxWidth = slot.width * .44, middle = x + boxWidth / 2, stats = item.stats; chart.append(svg('line', { x1: middle, x2: middle, y1: y(stats.high), y2: y(stats.low), class: 'ely-stat-whisker' }), svg('line', { x1: x + boxWidth * .25, x2: x + boxWidth * .75, y1: y(stats.high), y2: y(stats.high), class: 'ely-stat-whisker' }), svg('line', { x1: x + boxWidth * .25, x2: x + boxWidth * .75, y1: y(stats.low), y2: y(stats.low), class: 'ely-stat-whisker' }), svg('rect', { x, y: y(stats.q3), width: boxWidth, height: Math.max(1, y(stats.q1) - y(stats.q3)), class: 'ely-stat-box' }), svg('line', { x1: x, x2: x + boxWidth, y1: y(stats.median), y2: y(stats.median), class: 'ely-stat-median' })); stats.outliers.forEach(value => chart.append(svg('circle', { cx: middle, cy: y(value), r: 3, class: 'ely-stat-outlier' }))); addTarget(index, slot.x, slot.width, `${item.label}: low ${fmt(stats.low)}, first quartile ${fmt(stats.q1)}, median ${fmt(stats.median)}, third quartile ${fmt(stats.q3)}, high ${fmt(stats.high)}`, { index, ...item }); });
  if (chartType === 'ViolinPlot') { let maximum = 0; for (const shape of densities) for (const [, value] of shape) maximum = Math.max(maximum, value); model.forEach((item, index) => { const slot = band(index), middle = slot.x + slot.width / 2, half = slot.width * .38, shape = densities[index], points = [...shape.map(([value, amount]) => `${middle + half * amount / maximum},${y(value)}`), ...shape.slice().reverse().map(([value, amount]) => `${middle - half * amount / maximum},${y(value)}`)].join(' '); chart.append(svg('polygon', { points, class: 'ely-stat-violin' }), svg('line', { x1: middle - slot.width / 7, x2: middle + slot.width / 7, y1: y(item.stats.median), y2: y(item.stats.median), class: 'ely-stat-median' })); addTarget(index, slot.x, slot.width, `${item.label}: low ${fmt(item.stats.low)}, first quartile ${fmt(item.stats.q1)}, median ${fmt(item.stats.median)}, third quartile ${fmt(item.stats.q3)}, high ${fmt(item.stats.high)}`, { index, ...item }); }); }
  labels.forEach((label, index) => { const slot = band(index), node = svg('text', { x: slot.x + slot.width / 2, y: height - 18, class: 'ely-stat-axis', 'text-anchor': 'middle' }); node.textContent = label; chart.append(node); });
  chart.append(targetLayer); wrap.append(title, chart, status, accessibleTable(chartType, model)); root.replaceChildren(wrap);
  let selected = -1, destroyed = false;
  const select = target => { if (!target || destroyed) return; selected = Number(target.dataset.statIndex); targets.forEach((item, index) => { item.setAttribute('aria-pressed', String(index === selected)); item.setAttribute('tabindex', index === selected ? '0' : '-1'); }); status.textContent = target.getAttribute('aria-label'); onSelect?.(target._statPayload); root.dispatchEvent(new CustomEvent('ely:stat-select', { bubbles: true, detail: { type: chartType, ...target._statPayload } })); };
  const targetFor = event => event.target.closest?.('[data-stat-index]');
  const pointer = event => { const target = targetFor(event); if (target) select(target); };
  const keyboard = event => { const target = targetFor(event); if (!target) return; const current = targets.indexOf(target); let index = current; if (['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); index = event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1 : Math.max(0, Math.min(targets.length - 1, current + (['ArrowRight', 'ArrowDown'].includes(event.key) ? 1 : -1))); targets[index].focus(); select(targets[index]); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(target); } };
  chart.addEventListener('click', pointer); chart.addEventListener('keydown', keyboard);
  const cleanup = event => { if (event.target === root) destroy(); };
  root.addEventListener('htmx:beforeCleanupElement', cleanup);
  const unwatch = watchChart(root, wrap, destroy);
  function destroy() { if (destroyed) return; destroyed = true; unwatch(); root.removeEventListener('htmx:beforeCleanupElement', cleanup); chart.removeEventListener('click', pointer); chart.removeEventListener('keydown', keyboard); if (root.firstChild === wrap) root.replaceChildren(); }
  return destroy;
}

function accessibleTable(type, model) {
  const table = html('table', { class: 'ely-stat-chart-text' }), caption = html('caption'); caption.textContent = `${type} data`; table.append(caption);
  const headers = type === 'Histogram' ? ['Range', 'Count'] : type === 'WaterfallChart' ? ['Label', 'Change or total'] : ['Group', 'Low', 'Q1', 'Median', 'Q3', 'High'];
  const head = html('thead'), row = html('tr'); headers.forEach(value => { const cell = html('th', { scope: 'col' }); cell.textContent = value; row.append(cell); }); head.append(row); table.append(head);
  const body = html('tbody'); model.forEach(item => { const record = type === 'Histogram' ? [`${fmt(item.start)}–${fmt(item.end)}`, item.count] : type === 'WaterfallChart' ? [item.label, fmt(item.total ? item.running : item.value)] : [item.label, ...[item.stats.low, item.stats.q1, item.stats.median, item.stats.q3, item.stats.high].map(fmt)]; const line = html('tr'); record.forEach(value => { const cell = html('td'); cell.textContent = String(value); line.append(cell); }); body.append(line); }); table.append(body); return table;
}
