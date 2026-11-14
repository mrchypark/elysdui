import {watchChart} from '/assets/ely-chart-lifecycle.js';

const TAU = Math.PI * 2, finite = value => typeof value === 'number' && Number.isFinite(value);
const label = (value, name) => { if (typeof value !== 'string' || !value.trim()) throw new TypeError(`${name} must be a non-empty string`); return value; };
const point = (cx, cy, radius, angle) => [cx + radius * Math.cos(angle), cy + radius * Math.sin(angle)];
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[char]));

/** Pack radii with deterministic contact candidates, then recenter their enclosing circle. */
export function packSiblings(radii) {
  if (!Array.isArray(radii) || !radii.length || radii.length > 64 || radii.some(r => !finite(r) || r <= 0)) throw new RangeError('packing needs 1–64 positive finite radii');
  const order = radii.map((_, index) => index).sort((a, b) => radii[b] - radii[a]), placed = [], coords = radii.map(() => [0, 0, 0]);
  order.forEach((original, step) => {
    const r = radii[original]; let x = 0, y = 0;
    if (step === 1) x = placed[0][2] + r;
    else if (step > 1) {
      let best = null, far = placed.reduce((max, [px, py, pr]) => Math.max(max, Math.hypot(px, py) + pr), 0) + r;
      for (let index = 0; index < 64; index++) { const angle = TAU * index / 64, dx = Math.cos(angle), dy = Math.sin(angle); let low = 0, high = far;
        for (let trial = 0; trial < 20; trial++) { const distance = (low + high) / 2, tx = dx * distance, ty = dy * distance, overlaps = placed.some(([px, py, pr]) => Math.hypot(tx - px, ty - py) < r + pr - 1e-7); if (overlaps) low = distance; else high = distance; }
        const score = high * high; if (!best || score < best.score) best = {x:dx * high, y:dy * high, score};
      }
      x = best.x; y = best.y;
    }
    placed.push([x, y, r]); coords[original] = [x, y, r];
  });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  coords.forEach(([x, y, r]) => { minX = Math.min(minX, x - r); maxX = Math.max(maxX, x + r); minY = Math.min(minY, y - r); maxY = Math.max(maxY, y + r); });
  const cx = (minX + maxX) / 2, cy = (minY + maxY) / 2;
  let bound = 0;
  return {coords:coords.map(([x, y, r]) => { const item = [x - cx, y - cy, r]; bound = Math.max(bound, Math.hypot(item[0], item[1]) + r); return item; }), get radius() { return bound; }};
}

/** Validate and pack a hierarchy with bounded deterministic sibling placement. */
export function circlePackingModel(data) {
  let count = 0;
  const build = (node, path = 'root', depth = 0) => {
    if (!node || typeof node !== 'object') throw new TypeError(`${path} must be an object`);
    if (++count > 1_000 || depth > 32) throw new RangeError('CirclePacking accepts at most 1000 nodes and 32 levels');
    const name = label(node.label, `${path} label`), children = node.children;
    if (children !== undefined && (!Array.isArray(children) || !children.length || children.length > 64)) throw new TypeError(`${path} children must contain 1–64 nodes`);
    if (children) {
      const packed = children.map((child, index) => build(child, `${path}.children[${index}]`, depth + 1));
      const layout = packSiblings(packed.map(child => child.r));
      packed.forEach((child, index) => { [child.x, child.y] = layout.coords[index]; });
      return { label: name, value: packed.reduce((sum, child) => sum + child.value, 0), r: layout.radius, x: 0, y: 0, children: packed };
    }
    if (!finite(node.value) || node.value <= 0) throw new TypeError(`${path} value must be a positive finite number`);
    return { label: name, value: node.value, r: Math.sqrt(node.value), x: 0, y: 0, children: [] };
  };
  return build(data);
}

/** Validate GPUI-style matrix[from][to] flows and calculate their group arcs and paired ribbons. */
export function chordModel(labels, matrix, pad = .04) {
  if (!Array.isArray(labels) || !labels.length || labels.length > 100) throw new RangeError('ChordDiagram needs 1 to 100 labels');
  if (!Array.isArray(matrix) || matrix.length !== labels.length || matrix.some(row => !Array.isArray(row) || row.length !== labels.length || row.some(value => !finite(value) || value < 0))) throw new TypeError('ChordDiagram matrix must be square with non-negative finite flows');
  if (!finite(pad) || pad < 0 || pad * labels.length >= TAU) throw new RangeError('pad must leave room for group arcs');
  const names = labels.map((value, index) => label(value, `labels[${index}]`)), total = matrix.reduce((sum, row) => sum + row.reduce((rowSum, value) => rowSum + value, 0), 0), room = TAU - pad * labels.length;
  if (!finite(total)) throw new RangeError('ChordDiagram flow total must be finite');
  let angle = -Math.PI / 2 + pad / 2;
  const groups = matrix.map((row, from) => { const start = angle, parts = row.map((value, to) => { const sweep = total ? value / total * room : 0, part = { from, to, start: angle, sweep, value }; angle += sweep; return part; }); const group = { index: from, label: names[from], start, sweep: angle - start, total: row.reduce((sum, value) => sum + value, 0), parts }; angle += pad; return group; });
  const chords = [];
  for (let from = 0; from < names.length; from++) for (let to = from; to < names.length; to++) { const forward = matrix[from][to], backward = from === to ? 0 : matrix[to][from]; if (forward + backward) chords.push({ from, to, forward, backward, source: groups[from].parts[to], target: groups[to].parts[from] }); }
  return { labels: names, matrix, groups, chords, total };
}

function node(name, attributes = {}) { const el = document.createElementNS('http://www.w3.org/2000/svg', name); for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, String(value)); return el; }
function element(name, attributes = {}) { const el = document.createElement(name); for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value); return el; }
function arc(cx, cy, inner, outer, start, sweep) { const full = sweep >= TAU - 1e-7, end = start + sweep, middle = start + sweep / 2, [ox1, oy1] = point(cx, cy, outer, start), [ox2, oy2] = point(cx, cy, outer, end), [ix2, iy2] = point(cx, cy, inner, end), [ix1, iy1] = point(cx, cy, inner, start); if (full) { const [omx, omy] = point(cx, cy, outer, middle), [imx, imy] = point(cx, cy, inner, middle); return `M${ox1},${oy1} A${outer},${outer} 0 1 1 ${omx},${omy} A${outer},${outer} 0 1 1 ${ox1},${oy1} L${ix1},${iy1} A${inner},${inner} 0 1 0 ${imx},${imy} A${inner},${inner} 0 1 0 ${ix1},${iy1} Z`; } const large = sweep > Math.PI ? 1 : 0; return `M${ox1},${oy1} A${outer},${outer} 0 ${large} 1 ${ox2},${oy2} L${ix2},${iy2} A${inner},${inner} 0 ${large} 0 ${ix1},${iy1} Z`; }
function ribbon(cx, cy, radius, source, target) { if (source === target) return arc(cx, cy, radius * .72, radius, source.start, source.sweep); const [a1, b1] = point(cx, cy, radius, source.start), [a2, b2] = point(cx, cy, radius, source.start + source.sweep), [c1, d1] = point(cx, cy, radius, target.start), [c2, d2] = point(cx, cy, radius, target.start + target.sweep); const largeA = source.sweep > Math.PI ? 1 : 0, largeB = target.sweep > Math.PI ? 1 : 0; return `M${a1},${b1} A${radius},${radius} 0 ${largeA} 1 ${a2},${b2} Q${cx},${cy} ${c1},${d1} A${radius},${radius} 0 ${largeB} 1 ${c2},${d2} Q${cx},${cy} ${a1},${b1} Z`; }
function treeRows(root, rows = [], depth = 0) { rows.push({ label: root.label, value: root.value, depth }); root.children.forEach(child => treeRows(child, rows, depth + 1)); return rows; }

/**
 * Mount an interactive relation SVG chart. CirclePacking takes {label,value} leaves and
 * {label,children} branches. ChordDiagram takes {labels:string[], matrix:number[][]}.
 * The returned function removes DOM and htmx listeners.
 */
export function mountRelationChart(root, {type, data, height = 420, onSelect} = {}) {
  if (!(root instanceof Element)) throw new TypeError('root must be an Element');
  if (!finite(height) || height < 180) throw new RangeError('height must be at least 180');
  if (onSelect !== undefined && typeof onSelect !== 'function') throw new TypeError('onSelect must be a function');
  const kind = String(type || '').toLowerCase(), chartType = {circlepacking:'CirclePacking', chorddiagram:'ChordDiagram'}[kind];
  if (!chartType) throw new RangeError('type must be CirclePacking or ChordDiagram');
  const model = chartType === 'CirclePacking' ? circlePackingModel(data) : chordModel(data?.labels, data?.matrix, data?.pad ?? .04), width = 720, cx = width / 2, cy = height / 2, radius = Math.min(width, height) / 2 - 34;
  const wrap = element('section', {class:'ely-relation-chart', 'data-ely-relation-chart':chartType}), titleId = `ely-relation-${Math.random().toString(36).slice(2)}`, title = element('h3', {id:titleId}); title.textContent = chartType;
  const status = element('output', {class:'ely-relation-status', 'aria-live':'polite'}), initialBox = `0 0 ${width} ${height}`, chart = node('svg', {viewBox:initialBox, role:'group', 'aria-labelledby':titleId}), reset = element('button', {type:'button', class:'ely-relation-reset', hidden:''}), zoomButton = element('button', {type:'button', class:'ely-relation-zoom', hidden:''}), targets = []; reset.textContent = 'Reset view'; zoomButton.textContent = 'Zoom to selected group';
  const target = (index, path, description, payload) => { const hit = node('path', {d:path, class:'ely-relation-hit', role:'button', tabindex:index ? -1 : 0, 'data-relation-index':index, 'aria-label':description}); hit._relationPayload = payload; targets.push(hit); chart.append(hit); };
  if (chartType === 'CirclePacking') {
    const scale = radius / model.r, draw = (item, x, y, depth = 0) => { const r = item.r * scale, px = cx + x * scale, py = cy + y * scale; chart.append(node('circle', {cx:px, cy:py, r, class:`ely-relation-circle ely-relation-depth-${depth % 6}`})); if (r > 18) { const caption = node('text', {x:px, y:py + 4, class:'ely-relation-label', 'text-anchor':'middle'}); caption.textContent = item.label; chart.append(caption); } target(targets.length, `M${px-r},${py} a${r},${r} 0 1,0 ${r*2},0 a${r},${r} 0 1,0 -${r*2},0`, `${item.label}: ${item.value}`, {label:item.label, value:item.value, depth, x:px, y:py, r, branch:item.children.length > 0}); item.children.forEach(child => draw(child, x + child.x, y + child.y, depth + 1)); };
    draw(model, 0, 0);
  } else {
    const inner = radius * .75, outer = radius; model.chords.forEach(chord => chart.append(node('path', {d:ribbon(cx, cy, inner, chord.source, chord.target), class:'ely-relation-ribbon'}))); model.groups.forEach(group => { chart.append(node('path', {d:arc(cx, cy, inner, outer, group.start, group.sweep), class:'ely-relation-arc'})); const [x, y] = point(cx, cy, outer + 14, group.start + group.sweep / 2), caption = node('text', {x, y:y + 4, class:'ely-relation-label', 'text-anchor':'middle'}); caption.textContent = group.label; chart.append(caption); target(targets.length, arc(cx, cy, inner, outer, group.start, Math.max(group.sweep, .001)), `${group.label}: sends ${group.total}`, {index:group.index, label:group.label, sends:group.total, receives:model.matrix.reduce((sum, row) => sum + row[group.index], 0)}); });
  }
  wrap.append(title, reset, zoomButton, chart, status, accessibleTable(chartType, model)); root.replaceChildren(wrap);
  let destroyed = false, selectedHit = null;
  const find = event => event.target.closest?.('[data-relation-index]');
  const select = hit => { if (!hit || destroyed) return; selectedHit = hit; zoomButton.hidden = !hit._relationPayload?.branch; const index = Number(hit.dataset.relationIndex); targets.forEach((item, itemIndex) => { item.setAttribute('tabindex', itemIndex === index ? '0' : '-1'); item.setAttribute('aria-pressed', String(itemIndex === index)); }); status.textContent = hit.getAttribute('aria-label'); onSelect?.(hit._relationPayload); root.dispatchEvent(new CustomEvent('ely:relation-select', {bubbles:true, detail:{type:chartType, ...hit._relationPayload}})); };
  const pointer = event => select(find(event));
  const keyboard = event => { const hit = find(event); if (!hit) return; const current = targets.indexOf(hit); if (['ArrowLeft','ArrowUp','ArrowRight','ArrowDown','Home','End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1 : Math.max(0, Math.min(targets.length - 1, current + (['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1))); targets[next].focus(); select(targets[next]); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(hit); } };
  const zoomHit = hit => { const item = hit?._relationPayload; if (!item?.branch) return; const span = item.r * 2.24; chart.setAttribute('viewBox', `${item.x - span / 2} ${item.y - span / 2} ${span} ${span}`); reset.hidden = false; status.textContent = `Zoomed to ${item.label}.`; };
  const zoom = event => zoomHit(find(event)), zoomSelected = () => zoomHit(selectedHit);
  const resetView = () => { chart.setAttribute('viewBox', initialBox); reset.hidden = true; status.textContent = 'View reset.'; };
  const htmxCleanup = event => { if (event.target === root) destroy(); };
  chart.addEventListener('click', pointer); chart.addEventListener('dblclick', zoom); chart.addEventListener('keydown', keyboard); reset.addEventListener('click', resetView); zoomButton.addEventListener('click', zoomSelected); root.addEventListener('htmx:beforeCleanupElement', htmxCleanup);
  const unwatch = watchChart(root, wrap, destroy);
  function destroy() { if (destroyed) return; destroyed = true; unwatch(); chart.removeEventListener('click', pointer); chart.removeEventListener('dblclick', zoom); chart.removeEventListener('keydown', keyboard); reset.removeEventListener('click', resetView); zoomButton.removeEventListener('click', zoomSelected); root.removeEventListener('htmx:beforeCleanupElement', htmxCleanup); if (root.firstChild === wrap) root.replaceChildren(); }
  return destroy;
}

function accessibleTable(type, model) { const table = element('table', {class:'ely-relation-text'}), caption = element('caption'); caption.textContent = `${type} data`; table.append(caption); const body = element('tbody'); const rows = type === 'CirclePacking' ? treeRows(model).map(item => `<tr><td>${'— '.repeat(item.depth)}${escape(item.label)}</td><td>${item.value}</td></tr>`).join('') : model.matrix.map((row, from) => row.map((value, to) => value ? `<tr><td>${escape(model.labels[from])}</td><td>${escape(model.labels[to])}</td><td>${value}</td></tr>` : '').join('')).join(''); body.innerHTML = type === 'CirclePacking' ? `<tr><th>Node</th><th>Value</th></tr>${rows}` : `<tr><th>From</th><th>To</th><th>Flow</th></tr>${rows}`; table.append(body); return table; }
