import {watchChart} from '/assets/ely-chart-lifecycle.js';

// shortcut: hard limits keep SVG node count bounded; raise only with rendered profiling.
const MAX_DIMENSIONS = 8, MAX_RIBBONS = 400, MAX_CATEGORIES = 64;
const finite = value => typeof value === 'number' && Number.isFinite(value);
const name = (value, field) => { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${field} must be a non-empty string`); return value; };
const svg = (tag, attributes = {}) => { const node = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value)); return node; };
const html = (tag, attributes = {}) => { const node = document.createElement(tag); for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value); return node; };
const format = value => Number(value.toPrecision(6)).toLocaleString(undefined, {maximumFractionDigits: 4});

/** Validate categorical paths and calculate deterministic stacked bars and ribbons. */
export function parallelSetsModel(dimensions, ribbons, {width = 720, height = 360} = {}) {
  if (!Array.isArray(dimensions) || dimensions.length < 2 || dimensions.length > MAX_DIMENSIONS) throw new RangeError(`ParallelSetsChart needs 2 to ${MAX_DIMENSIONS} dimensions`);
  if (!Array.isArray(ribbons) || !ribbons.length || ribbons.length > MAX_RIBBONS) throw new RangeError(`ParallelSetsChart needs 1 to ${MAX_RIBBONS} ribbons`);
  if (!finite(width) || width < 160 || !finite(height) || height < 180) throw new RangeError('ParallelSetsChart needs a finite width of at least 160 and height of at least 180');
  const labels = dimensions.map((value, index) => name(value, `dimensions[${index}]`));
  if (new Set(labels).size !== labels.length) throw new TypeError('ParallelSetsChart dimension names must be unique');
  const paths = ribbons.map((ribbon, index) => {
    if (!ribbon || typeof ribbon !== 'object' || !Array.isArray(ribbon.path) || ribbon.path.length !== labels.length) throw new TypeError(`ribbons[${index}] needs one category per dimension`);
    if (!finite(ribbon.count) || ribbon.count <= 0) throw new TypeError(`ribbons[${index}] count must be a positive finite number`);
    return {index, path: ribbon.path.map((value, dim) => name(value, `ribbons[${index}].path[${dim}]`)), count: ribbon.count};
  });
  let total = 0; for (const ribbon of paths) { total += ribbon.count; if (!finite(total)) throw new RangeError('ParallelSetsChart total count must remain finite'); }
  const categories = labels.map(() => []), indexes = labels.map(() => new Map());
  for (const ribbon of paths) ribbon.path.forEach((category, dim) => { let item = indexes[dim].get(category); if (!item) { if (categories[dim].length >= MAX_CATEGORIES) throw new RangeError(`ParallelSetsChart supports at most ${MAX_CATEGORIES} categories per dimension`); item = {name: category, count: 0, index: categories[dim].length}; indexes[dim].set(category, item); categories[dim].push(item); } item.count += ribbon.count; if (!finite(item.count)) throw new RangeError('ParallelSetsChart category count must remain finite'); });
  const left = 36, right = 36, top = 28, bottom = height - 38, barWidth = 12, plotHeight = bottom - top;
  const maxCategories = Math.max(...categories.map(items => items.length)), gap = maxCategories > 1 ? Math.min(8, plotHeight * .42 / (maxCategories - 1)) : 0;
  const available = Math.min(...categories.map(items => Math.max(1, plotHeight - gap * (items.length - 1))));
  const x = labels.map((_, dim) => labels.length === 1 ? width / 2 : left + barWidth / 2 + (width - left - right - barWidth) * dim / (labels.length - 1));
  const bars = [], lookup = categories.map(() => []);
  categories.forEach((items, dim) => { const columnHeight = items.reduce((sum, item) => sum + item.count / total * available, 0) + gap * (items.length - 1); let y = top + (plotHeight - columnHeight) / 2; items.forEach(item => { const bar = {dim, category: item.index, name: item.name, count: item.count, x: x[dim] - barWidth / 2, y, width: barWidth, height: item.count / total * available}; bars.push(bar); lookup[dim][item.index] = bar; y += bar.height + gap; }); });
  const segments = [], ribbonSegments = paths.map(() => []);
  for (let dim = 0; dim + 1 < labels.length; dim++) {
    const fromOffset = categories[dim].map(() => 0), toOffset = categories[dim + 1].map(() => 0);
    const orderedFrom = paths.toSorted((a, b) => indexes[dim].get(a.path[dim]).index - indexes[dim].get(b.path[dim]).index || indexes[dim + 1].get(a.path[dim + 1]).index - indexes[dim + 1].get(b.path[dim + 1]).index || a.index - b.index);
    const fromY = []; for (const ribbon of orderedFrom) { const category = indexes[dim].get(ribbon.path[dim]).index, bar = lookup[dim][category]; fromY[ribbon.index] = bar.y + fromOffset[category]; fromOffset[category] += ribbon.count / total * available; }
    const orderedTo = paths.toSorted((a, b) => indexes[dim + 1].get(a.path[dim + 1]).index - indexes[dim + 1].get(b.path[dim + 1]).index || indexes[dim].get(a.path[dim]).index - indexes[dim].get(b.path[dim]).index || a.index - b.index);
    const toY = []; for (const ribbon of orderedTo) { const category = indexes[dim + 1].get(ribbon.path[dim + 1]).index, bar = lookup[dim + 1][category]; toY[ribbon.index] = bar.y + toOffset[category]; toOffset[category] += ribbon.count / total * available; }
    for (const ribbon of paths) { const from = lookup[dim][indexes[dim].get(ribbon.path[dim]).index], to = lookup[dim + 1][indexes[dim + 1].get(ribbon.path[dim + 1]).index], thickness = ribbon.count / total * available, segment = {ribbon: ribbon.index, dim, x1: from.x + barWidth, y1: fromY[ribbon.index], x2: to.x, y2: toY[ribbon.index], thickness}; segments.push(segment); ribbonSegments[ribbon.index].push(segment); }
  }
  return {dimensions: labels, ribbons: paths, categories, bars, segments, ribbonSegments, total, width, height, x, top, bottom, barWidth};
}

const ribbonPath = segment => { const middle = (segment.x1 + segment.x2) / 2, bottom1 = segment.y1 + segment.thickness, bottom2 = segment.y2 + segment.thickness; return `M${segment.x1},${segment.y1} C${middle},${segment.y1} ${middle},${segment.y2} ${segment.x2},${segment.y2} L${segment.x2},${bottom2} C${middle},${bottom2} ${middle},${bottom1} ${segment.x1},${bottom1} Z`; };
const colour = index => ['#2563eb', '#15803d', '#b45309', '#7c3aed', '#be185d', '#0891b2'][index % 6];

/** Mount a mobile-safe ParallelSetsChart. data is {dimensions:string[], ribbons:Array<{path:string[], count:number}>}. */
export function mountParallelSetsChart(root, {data, height = 360, onSelect} = {}) {
  if (!(root instanceof Element)) throw new TypeError('root must be an Element');
  if (!finite(height) || height < 180) throw new RangeError('height must be at least 180');
  if (onSelect !== undefined && typeof onSelect !== 'function') throw new TypeError('onSelect must be a function');
  const model = parallelSetsModel(data?.dimensions, data?.ribbons, {height}), wrap = html('section', {class: 'ely-parallel-sets', 'data-ely-parallel-sets': ''}), titleId = `ely-parallel-sets-${Math.random().toString(36).slice(2)}`, title = html('h3', {id: titleId}), chart = svg('svg', {viewBox: `0 0 ${model.width} ${model.height}`, role: 'group', 'aria-labelledby': titleId}), status = html('output', {class: 'ely-parallel-sets-status', 'aria-live': 'polite'}), clear = html('button', {type: 'button', class: 'ely-parallel-sets-clear', hidden: ''}), targets = [];
  title.textContent = 'Parallel sets'; clear.textContent = 'Clear selection';
  model.segments.forEach(segment => { const first = model.categories[0].find(item => item.name === model.ribbons[segment.ribbon].path[0]); chart.append(svg('path', {d: ribbonPath(segment), class: 'ely-parallel-sets-ribbon', fill: colour(first?.index ?? 0)})); });
  model.bars.forEach(bar => { chart.append(svg('rect', {x: bar.x, y: bar.y, width: bar.width, height: bar.height, rx: 2, class: 'ely-parallel-sets-bar'})); if (bar.height >= 12) { const label = svg('text', {x: bar.dim === model.dimensions.length - 1 ? bar.x - 4 : bar.x + bar.width + 4, y: bar.y + bar.height / 2 + 4, class: 'ely-parallel-sets-label', 'text-anchor': bar.dim === model.dimensions.length - 1 ? 'end' : 'start'}); label.textContent = bar.name; chart.append(label); } });
  model.dimensions.forEach((dimension, index) => { const label = svg('text', {x: model.x[index], y: model.bottom + 24, class: 'ely-parallel-sets-dimension', 'text-anchor': 'middle'}); label.textContent = dimension; chart.append(label); });
  model.ribbons.forEach(ribbon => { const hit = svg('path', {d: model.ribbonSegments[ribbon.index].map(ribbonPath).join(' '), class: 'ely-parallel-sets-hit', role: 'button', tabindex: ribbon.index ? -1 : 0, 'data-parallel-index': ribbon.index, 'aria-label': `${ribbon.path.join(', ')}: ${format(ribbon.count)}`}); hit._parallelPayload = {index: ribbon.index, path: [...ribbon.path], count: ribbon.count}; targets.push(hit); chart.append(hit); });
  const table = html('table', {class: 'ely-parallel-sets-text'}), caption = html('caption'), head = html('thead'), headRow = html('tr'), body = html('tbody'); caption.textContent = 'Parallel sets data'; model.dimensions.concat('Count').forEach(value => { const cell = html('th'); cell.textContent = value; headRow.append(cell); }); head.append(headRow); model.ribbons.forEach(ribbon => { const row = html('tr'); ribbon.path.concat(format(ribbon.count)).forEach(value => { const cell = html('td'); cell.textContent = value; row.append(cell); }); body.append(row); }); table.append(caption, head, body); wrap.append(title, clear, chart, status, table); root.replaceChildren(wrap);
  let selected = null, destroyed = false, down = null;
  const find = event => event.target.closest?.('[data-parallel-index]');
  const select = hit => { if (!hit || destroyed) return; const index = Number(hit.dataset.parallelIndex), payload = hit._parallelPayload; selected = index; targets.forEach((target, targetIndex) => { target.setAttribute('tabindex', targetIndex === index ? '0' : '-1'); target.setAttribute('aria-pressed', String(targetIndex === index)); }); clear.hidden = false; status.textContent = hit.getAttribute('aria-label'); onSelect?.(payload); root.dispatchEvent(new CustomEvent('ely:parallel-sets-select', {bubbles: true, detail: payload})); };
  const choices = html('details'), summary = html('summary'); summary.textContent = 'Choose a flow'; choices.append(summary); targets.forEach(hit => { const button = html('button', {type:'button'}); button.textContent = `Select ${hit.getAttribute('aria-label')}`; button.addEventListener('click', () => select(hit)); choices.append(button); }); wrap.append(choices);
  const reset = () => { selected = null; targets.forEach((target, index) => { target.setAttribute('tabindex', index ? '-1' : '0'); target.setAttribute('aria-pressed', 'false'); }); clear.hidden = true; status.textContent = 'Selection cleared.'; };
  const click = event => { const hit = find(event); if (!hit || !down || Math.hypot(event.clientX - down.x, event.clientY - down.y) <= 8) select(hit); down = null; };
  const pointerDown = event => { down = {x: event.clientX, y: event.clientY}; };
  const keyboard = event => { const hit = find(event); if (!hit) return; const index = targets.indexOf(hit); if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1 : Math.max(0, Math.min(targets.length - 1, index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1))); targets[next].focus(); select(targets[next]); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(hit); } else if (event.key === 'Escape') { event.preventDefault(); reset(); } };
  const cleanup = event => { if (event.target === root) destroy(); };
  chart.addEventListener('pointerdown', pointerDown); chart.addEventListener('click', click); chart.addEventListener('keydown', keyboard); clear.addEventListener('click', reset); root.addEventListener('htmx:beforeCleanupElement', cleanup);
  let unwatch = () => {}; function destroy() { if (destroyed) return; destroyed = true; unwatch(); chart.removeEventListener('pointerdown', pointerDown); chart.removeEventListener('click', click); chart.removeEventListener('keydown', keyboard); clear.removeEventListener('click', reset); root.removeEventListener('htmx:beforeCleanupElement', cleanup); if (root.firstChild === wrap) root.replaceChildren(); }
  unwatch = watchChart(root, wrap, destroy);
  return {destroy};
}
