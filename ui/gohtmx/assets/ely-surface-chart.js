import {watchChart} from '/assets/ely-chart-lifecycle.js';

const NS = 'http://www.w3.org/2000/svg';
const finite = value => Number.isFinite(value);
const frame = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : callback => setTimeout(callback, 0);
const cancelFrame = typeof cancelAnimationFrame === 'function' ? cancelAnimationFrame : clearTimeout;
const element = (tag, attributes = {}) => {
  const node = document.createElementNS(NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value));
  return node;
};
const pointString = points => points.map(point => point.join(',')).join(' ');

/** Project a finite, rectangular scalar grid as a bounded 2D surface mesh. */
export function surfaceModel(grid, {width = 640, height = 400, padding = 32, azimuth = -38, elevation = 28, xRange, yRange} = {}) {
  if (!Array.isArray(grid) || grid.length < 2 || grid.length > 100 || !grid.every(row => Array.isArray(row) && row.length === grid[0]?.length && row.length >= 2 && row.length <= 100 && row.every(finite))) throw new TypeError('Surface grid must be a finite rectangular 2–100 by 2–100 array.');
  const rows = grid.length, cols = grid[0].length;
  if (rows * cols > 10000) throw new RangeError('Surface grid cannot exceed 10000 values.');
  if (![width, height, padding, azimuth, elevation].every(finite) || width < 100 || height < 100 || width > 2000 || height > 2000 || padding < 0 || padding * 2 >= Math.min(width, height)) throw new RangeError('Surface dimensions, padding, and angles are outside supported bounds.');
  const xr = xRange ?? [0, cols - 1], yr = yRange ?? [0, rows - 1];
  if (!Array.isArray(xr) || !Array.isArray(yr) || xr.length !== 2 || yr.length !== 2 || !xr.concat(yr).every(finite)) throw new TypeError('xRange and yRange must each contain two finite numbers.');
  const xSpan = xr[1] - xr[0], ySpan = yr[1] - yr[0];
  if (!finite(xSpan) || !finite(ySpan)) throw new RangeError('xRange and yRange spans must be finite.');
  const values = grid.flat(), min = Math.min(...values), max = Math.max(...values), span = max - min;
  if (!finite(span)) throw new RangeError('Surface grid range must be finite.');
  const range = span || 1, average = points => points.reduce((sum, point) => sum + point / points.length, 0);
  const az = (azimuth % 360) * Math.PI / 180, el = Math.max(-80, Math.min(80, elevation)) * Math.PI / 180;
  const raw = (x, y, z) => {
    const rx = x * Math.cos(az) - y * Math.sin(az), ry = x * Math.sin(az) + y * Math.cos(az);
    const depth = ry * Math.cos(el) - z * Math.sin(el), up = ry * Math.sin(el) + z * Math.cos(el), perspective = 3.6 / (3.6 + depth);
    return [rx * perspective, -up * perspective, depth];
  };
  const box = [-.5, .5].flatMap(x => [-.5, .5].flatMap(y => [-.5, .5].map(z => raw(x, y, z))));
  const minX = Math.min(...box.map(point => point[0])), maxX = Math.max(...box.map(point => point[0])), minY = Math.min(...box.map(point => point[1])), maxY = Math.max(...box.map(point => point[1]));
  const scale = Math.min((width - padding * 2) / Math.max(maxX - minX, .0001), (height - padding * 2) / Math.max(maxY - minY, .0001)) * .82;
  const offsetX = width / 2 - (minX + maxX) * scale / 2, offsetY = height / 2 - (minY + maxY) * scale / 2;
  const project = (x, y, z) => { const point = raw(x, y, z); return [[offsetX + point[0] * scale, offsetY + point[1] * scale], point[2]]; };
  const vertex = (col, row) => { const z = (grid[row][col] - min) / range - .5; return project(col / (cols - 1) - .5, row / (rows - 1) - .5, z); };
  const cells = [];
  for (let row = 0; row < rows - 1; row++) for (let col = 0; col < cols - 1; col++) {
    const vertices = [vertex(col, row), vertex(col + 1, row), vertex(col + 1, row + 1), vertex(col, row + 1)];
    const z = average([grid[row][col], grid[row][col + 1], grid[row + 1][col + 1], grid[row + 1][col]]);
    const x = xr[0] + xSpan * (col + .5) / (cols - 1), y = yr[0] + ySpan * (row + .5) / (rows - 1), t = (z - min) / range;
    if (![x, y, z, t].every(finite)) throw new RangeError('Surface grid projection must be finite.');
    cells.push({col, row, points: vertices.map(point => point[0]), depth: average(vertices.map(point => point[1])), t, z, x, y});
  }
  cells.sort((a, b) => b.depth - a.depth || a.row - b.row || a.col - b.col);
  const base = [[-.5, -.5], [.5, -.5], [.5, .5], [-.5, .5]].map(([x, y]) => project(x, y, -.5)[0]);
  return {width, height, rows, cols, cells, axes: [[base[0], base[1]], [base[1], base[2]], [base[2], base[3]], [base[3], base[0]]], min, max};
}

/** Mount a GPUI-compatible interactive SurfaceChart. Grid rows map to y; columns map to x. */
export function mountSurfaceChart(root, {grid, width = 640, height = 400, padding = 32, azimuth = -38, elevation = 28, xRange, yRange, onSelect} = {}) {
  if (!root || typeof root.replaceChildren !== 'function') throw new TypeError('root must be a DOM element.');
  if (onSelect != null && typeof onSelect !== 'function') throw new TypeError('onSelect must be a function.');
  const view = {azimuth, elevation, selected: null}, wrap = document.createElement('div'), svg = element('svg', {viewBox: `0 0 ${width} ${height}`, role: 'group', 'aria-label': 'Interactive surface chart', class: 'ely-surface-chart'}), status = document.createElement('div'), controls = document.createElement('div'), targets = [];
  wrap.className = 'ely-surface'; status.className = 'ely-surface-status'; status.setAttribute('aria-live', 'polite'); controls.className = 'ely-surface-controls'; svg.style.touchAction = 'none';
  const announce = cell => `Cell ${cell.col}, ${cell.row}. X ${cell.x}. Y ${cell.y}. Z ${cell.z}.`;
  const select = cell => {
    if (!cell || dead) return;
    view.selected = `${cell.col}:${cell.row}`;
    for (const target of targets) { const active = target.cell === cell; target.node.classList.toggle('is-selected', active); target.node.setAttribute('aria-pressed', String(active)); target.node.setAttribute('tabindex', active ? '0' : '-1'); }
    status.textContent = announce(cell); onSelect?.({col: cell.col, row: cell.row, x: cell.x, y: cell.y, z: cell.z}); root.dispatchEvent(new CustomEvent('ely:surface-select', {bubbles: true, detail: {col: cell.col, row: cell.row, x: cell.x, y: cell.y, z: cell.z}}));
  };
  const render = () => {
    const model = surfaceModel(grid, {width, height, padding, azimuth: view.azimuth, elevation: view.elevation, xRange, yRange}), axes = element('g', {class: 'ely-surface-axes'}), mesh = element('g', {class: 'ely-surface-mesh'});
    for (const [from, to] of model.axes) axes.append(element('line', {x1: from[0], y1: from[1], x2: to[0], y2: to[1]}));
    targets.length = 0;
    for (const cell of model.cells) {
      const active = view.selected === `${cell.col}:${cell.row}`, node = element('polygon', {points: pointString(cell.points), class: 'ely-surface-cell', fill: `hsl(${220 - cell.t * 180} 68% ${38 + cell.t * 18}%)`, role: 'button', tabindex: active || !view.selected && !targets.length ? '0' : '-1', 'aria-pressed': active, 'aria-label': announce(cell), 'data-surface-cell': `${cell.col}:${cell.row}`});
      node.cell = cell; targets.push({node, cell}); mesh.append(node);
    }
    svg.replaceChildren(axes, mesh);
    return model;
  };
  let model = render(), pointers = new Map(), moved = false, suppressClick = false, dead = false, unwatch = () => {}, frameId = null;
  const cellFor = target => target?.closest?.('[data-surface-cell]')?.cell;
  const click = event => { if (suppressClick) { suppressClick = false; return; } select(cellFor(event.target)); };
  const key = event => {
    const target = cellFor(event.target), index = targets.findIndex(item => item.cell === target); if (index < 0) return;
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(target); return; }
    const delta = {ArrowLeft: -1, ArrowRight: 1, ArrowUp: -model.cols + 1, ArrowDown: model.cols - 1}[event.key];
    if (event.key === 'Home' || event.key === 'End' || delta !== undefined) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1 : Math.max(0, Math.min(targets.length - 1, index + delta)); targets[next].node.focus(); select(targets[next].cell); }
  };
  const queueRotation = () => { if (frameId !== null) return; frameId = frame(() => { frameId = null; if (dead) return; model = render(); status.textContent = `View azimuth ${Math.round(view.azimuth)} degrees, elevation ${Math.round(view.elevation)} degrees.`; }); };
  const down = event => { if (event.button !== undefined && event.button !== 0) return; pointers.set(event.pointerId, {x: event.clientX, y: event.clientY, cell: cellFor(event.target)}); moved = false; svg.setPointerCapture?.(event.pointerId); };
  const move = event => { const previous = pointers.get(event.pointerId); if (!previous) return; const dx = event.clientX - previous.x, dy = event.clientY - previous.y; pointers.set(event.pointerId, {...previous, x: event.clientX, y: event.clientY}); if (Math.hypot(dx, dy) > 1) { moved = true; view.azimuth += dx * .45; view.elevation = Math.max(-80, Math.min(80, view.elevation - dy * .45)); queueRotation(); } event.preventDefault?.(); };
  const up = event => { const pointer = pointers.get(event.pointerId); pointers.delete(event.pointerId); if (event.type === 'pointercancel') { suppressClick = false; return; } if (moved) suppressClick = true; else if (pointer?.cell) { select(pointer.cell); suppressClick = true; } };
  const control = (label, action) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.setAttribute('aria-label', label); button.addEventListener('click', () => { action(); model = render(); status.textContent = `View azimuth ${Math.round(view.azimuth)} degrees, elevation ${Math.round(view.elevation)} degrees.`; }); controls.append(button); };
  control('Rotate left', () => { view.azimuth -= 15; }); control('Rotate right', () => { view.azimuth += 15; }); control('Rotate up', () => { view.elevation = Math.min(80, view.elevation + 10); }); control('Rotate down', () => { view.elevation = Math.max(-80, view.elevation - 10); }); control('Reset view', () => { view.azimuth = azimuth; view.elevation = elevation; });
  for (const [label, step] of [['Previous cell', -1], ['Next cell', 1]]) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', () => { const current = targets.findIndex(target => `${target.cell.col}:${target.cell.row}` === view.selected); const next = current < 0 ? (step > 0 ? 0 : targets.length - 1) : Math.max(0, Math.min(targets.length - 1, current + step)); select(targets[next]?.cell); }); controls.append(button); }
  svg.addEventListener('click', click); svg.addEventListener('keydown', key); svg.addEventListener('pointerdown', down); svg.addEventListener('pointermove', move); svg.addEventListener('pointerup', up); svg.addEventListener('pointercancel', up);
  wrap.append(svg, status, controls); root.classList.add('ely-surface'); root.replaceChildren(wrap);
  const cleanup = event => { if (event.target === root) destroy(); }; const destroy = () => { if (dead) return; dead = true; if (frameId !== null) cancelFrame(frameId); unwatch(); root.removeEventListener('htmx:beforeCleanupElement', cleanup); for (const [name, listener] of [['click', click], ['keydown', key], ['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', up]]) svg.removeEventListener(name, listener); if (root.firstChild === wrap) { root.replaceChildren(); root.classList.remove('ely-surface'); } };
  root.addEventListener('htmx:beforeCleanupElement', cleanup); unwatch = watchChart(root, wrap, destroy);
  return {destroy};
}
