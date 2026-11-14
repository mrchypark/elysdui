import uPlot from '/assets/uPlot.esm.js';
import {watchChart} from '/assets/ely-chart-lifecycle.js';

const finite = value => Number.isFinite(value);

// A compact quadtree keeps both aggregate nodes and the original point indexes.
export function createScatterIndex(x, y, {leafSize = 64} = {}) {
  if (!(x instanceof Float64Array) || !(y instanceof Float64Array) || x.length !== y.length) throw new TypeError('x and y must be aligned Float64Array values');
  if (!Number.isInteger(leafSize) || leafSize < 4) throw new RangeError('leafSize is invalid');
  const points = [];
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (let i = 0; i < x.length; i++) if (finite(x[i]) && finite(y[i])) { points.push(i); minX = Math.min(minX, x[i]); maxX = Math.max(maxX, x[i]); minY = Math.min(minY, y[i]); maxY = Math.max(maxY, y[i]); }
  if (!points.length) throw new RangeError('scatter needs one finite point');
  if (!finite(maxX - minX) || !finite(maxY - minY)) throw new RangeError('scatter domain span must be finite');
  const padX = Math.max((maxX - minX || 1) * 1e-9, Math.abs(minX) * Number.EPSILON * 2), padY = Math.max((maxY - minY || 1) * 1e-9, Math.abs(minY) * Number.EPSILON * 2);
  minX -= padX; maxX += padX; minY -= padY; maxY += padY;
  if (![minX,maxX,minY,maxY,maxX-minX,maxY-minY].every(finite) || minX >= maxX || minY >= maxY) throw new RangeError('scatter bounds must be finite and distinct');
  const nodes = [];
  const build = (ids, left, top, right, bottom, depth) => {
    const node = {left, top, right, bottom, count: ids.length, meanX: 0, meanY: 0, children: null, ids: null};
    for (let j = 0; j < ids.length; j++) { const i = ids[j]; node.meanX += (x[i] - node.meanX) / (j + 1); node.meanY += (y[i] - node.meanY) / (j + 1); }
    const at = nodes.push(node) - 1;
    if (ids.length <= leafSize) { node.ids = Uint32Array.from(ids); return at; }
    const midX = left + (right - left) / 2, midY = top + (bottom - top) / 2, buckets = [[], [], [], []];
    for (const i of ids) buckets[(x[i] >= midX ? 1 : 0) | (y[i] >= midY ? 2 : 0)].push(i);
    if (buckets.some(bucket => bucket.length === ids.length)) {
      const first = ids[0];
      if (ids.every(i => x[i] === x[first] && y[i] === y[first])) { node.identical = first; return at; }
      const axis = right - left >= bottom - top ? 'x' : 'y', ordered = [...ids].sort((a, b) => axis === 'x' ? x[a] - x[b] || y[a] - y[b] : y[a] - y[b] || x[a] - x[b]), middle = ordered.length >>> 1;
      node.children = new Int32Array(4); node.children.fill(-1);
      for (const [slot, part] of [[0, ordered.slice(0, middle)], [1, ordered.slice(middle)]]) {
        let childLeft = Infinity, childTop = Infinity, childRight = -Infinity, childBottom = -Infinity;
        for (const i of part) { childLeft = Math.min(childLeft, x[i]); childTop = Math.min(childTop, y[i]); childRight = Math.max(childRight, x[i]); childBottom = Math.max(childBottom, y[i]); }
        node.children[slot] = build(part, childLeft, childTop, childRight, childBottom, depth + 1);
      }
      return at;
    }
    node.children = new Int32Array(4); node.children.fill(-1);
    for (let q = 0; q < 4; q++) if (buckets[q].length) node.children[q] = build(buckets[q], q & 1 ? midX : left, q & 2 ? midY : top, q & 1 ? right : midX, q & 2 ? bottom : midY, depth + 1);
    return at;
  };
  build(points, minX, minY, maxX, maxY, 0);
  const intersects = (node, view) => node.right >= view.minX && node.left <= view.maxX && node.bottom >= view.minY && node.top <= view.maxY;
  return {x, y, nodes, bounds: {minX, minY, maxX, maxY}, query(view, pixelsX, pixelsY, {radius = 2} = {}) {
    const result = [], stack = [0];
    while (stack.length) {
      const node = nodes[stack.pop()]; if (!intersects(node, view)) continue;
      const width = (node.right - node.left) * pixelsX, height = (node.bottom - node.top) * pixelsY, contained = node.left >= view.minX && node.right <= view.maxX && node.top >= view.minY && node.bottom <= view.maxY;
      if (!node.children || (contained && width <= radius * 2 && height <= radius * 2)) {
        if (node.identical != null) {
          if (x[node.identical] >= view.minX && x[node.identical] <= view.maxX && y[node.identical] >= view.minY && y[node.identical] <= view.maxY) result.push({index: node.identical, x: x[node.identical], y: y[node.identical], count: node.count});
        } else if (node.ids && (!contained || node.ids.length === 1 || width > radius * 4 || height > radius * 4)) {
          for (const i of node.ids) {
            if (x[i] >= view.minX && x[i] <= view.maxX && y[i] >= view.minY && y[i] <= view.maxY) result.push({index: i, x: x[i], y: y[i]});
          }
        } else {
          result.push({count: node.count, x: node.meanX, y: node.meanY, left: node.left, right: node.right, top: node.top, bottom: node.bottom});
        }
      } else for (const child of node.children) if (child >= 0) stack.push(child);
    }
    return result;
  }, nearest(point, radiusX, radiusY) {
    let best = -1, bestDistance = 1;
    const stack = [0], limitX = Math.max(Number.EPSILON, radiusX || 0), limitY = Math.max(Number.EPSILON, radiusY || 0);
    while (stack.length) {
      const node = nodes[stack.pop()], dx = point.x < node.left ? node.left - point.x : point.x > node.right ? point.x - node.right : 0, dy = point.y < node.top ? node.top - point.y : point.y > node.bottom ? point.y - node.bottom : 0;
      if ((dx / limitX) ** 2 + (dy / limitY) ** 2 > bestDistance) continue;
      if (node.identical != null) { const i = node.identical, distance = ((x[i] - point.x) / limitX) ** 2 + ((y[i] - point.y) / limitY) ** 2; if (distance <= bestDistance) { bestDistance = distance; best = i; } }
      else if (node.ids) for (const i of node.ids) { const distance = ((x[i] - point.x) / limitX) ** 2 + ((y[i] - point.y) / limitY) ** 2; if (distance <= bestDistance) { bestDistance = distance; best = i; } }
      else for (const child of node.children) if (child >= 0) stack.push(child);
    }
    return best < 0 ? null : {index: best, x: x[best], y: y[best], distance: Math.sqrt(bestDistance)};
  }};
}

export function mountScatter(root, options) {
  if (!(root instanceof Element)) throw new TypeError('root must be an Element');
  const index = options.index || createScatterIndex(options.x, options.y, options);
  const {minX, maxX, minY, maxY} = index.bounds, color = options.color || '#2563eb', radius = options.radius || 2;
  const wrap = document.createElement('div'), controls = document.createElement('div'), status = document.createElement('output');
  wrap.className = 'ely-scatter'; controls.className = 'ely-scatter-controls'; status.className = 'ely-scatter-status'; status.setAttribute('aria-live', 'polite'); root.replaceChildren(controls, wrap, status);
  let dead = false, frame = 0, hover = null, drag = null, gesture = new Map(), multitouch = false, unwatch = () => {};
  const plot = new uPlot({width: root.clientWidth || 640, height: options.height || 360, series: [{}, {show: false}], axes: options.axes === false ? [] : undefined, cursor: {show: false}, scales: {x: {time: false, auto: false, min: minX, max: maxX, range: (_, min, max) => [min, max]}, y: {auto: false, min: minY, max: maxY, range: (_, min, max) => [min, max]}}, hooks: {setScale: [schedule], setSize: [schedule]}}, [[minX, maxX], [minY, maxY]], wrap);
  const canvas = document.createElement('canvas'); canvas.className = 'ely-scatter-canvas'; canvas.tabIndex = 0; canvas.setAttribute('role', 'application'); canvas.setAttribute('aria-label', options.label || `Scatter plot with ${index.x.length.toLocaleString()} points`); plot.over.append(canvas);
  const view = () => ({minX: plot.scales.x.min, maxX: plot.scales.x.max, minY: plot.scales.y.min, maxY: plot.scales.y.max});
  const render = () => {
    frame = 0; if (dead) return;
    const rect = plot.over.getBoundingClientRect(), scale = devicePixelRatio || 1, width = Math.max(1, Math.round(rect.width)), height = Math.max(1, Math.round(rect.height));
    if (canvas.width !== width * scale || canvas.height !== height * scale) { canvas.width = width * scale; canvas.height = height * scale; canvas.style.width = `${width}px`; canvas.style.height = `${height}px`; }
    const ctx = canvas.getContext('2d'); ctx.setTransform(scale, 0, 0, scale, 0, 0); ctx.clearRect(0, 0, width, height);
    const visible = index.query(view(), width / (plot.scales.x.max - plot.scales.x.min), height / (plot.scales.y.max - plot.scales.y.min), {radius});
    ctx.fillStyle = color;
    for (const item of visible) { const px = plot.valToPos(item.x, 'x'), py = plot.valToPos(item.y, 'y'); if (item.index != null) { ctx.globalAlpha = item.index === hover?.index ? 1 : .8; ctx.beginPath(); ctx.arc(px, py, item.index === hover?.index ? radius + 2 : radius, 0, Math.PI * 2); ctx.fill(); } else { ctx.globalAlpha = Math.min(.85, .12 + Math.log2(item.count + 1) / 16); ctx.fillRect(px - radius, py - radius, radius * 2, radius * 2); } }
    ctx.globalAlpha = 1; if (!hover) status.textContent = `${visible.length.toLocaleString()} visible spatial summaries`;
  };
  function schedule() { if (!frame && !dead) frame = requestAnimationFrame(render); }
  const point = event => { const box = canvas.getBoundingClientRect(); return {x: plot.posToVal(event.clientX - box.left, 'x'), y: plot.posToVal(event.clientY - box.top, 'y')}; };
  const pick = event => { const box = canvas.getBoundingClientRect(), found = index.nearest(point(event), 10 / Math.max(1, box.width) * (plot.scales.x.max - plot.scales.x.min), 10 / Math.max(1, box.height) * (plot.scales.y.max - plot.scales.y.min)); hover = found; if (found) status.textContent = `Point ${found.index + 1}: x ${found.x}, y ${found.y}`; schedule(); return found; };
  const fit = (low, high, min, max) => { const total = max - min, minimum = Math.min(total, Math.max(total * 1e-12, Math.max(Math.abs(min), Math.abs(max)) * Number.EPSILON * 2)), span = Math.min(total, Math.max(minimum, high - low)), start = Math.max(min, Math.min(max - span, low)); return [start, start + span]; };
  const applyView = (x0, x1, y0, y1) => { const x = fit(x0, x1, minX, maxX), y = fit(y0, y1, minY, maxY); plot.batch(() => { plot.setScale('x', {min: x[0], max: x[1]}); plot.setScale('y', {min: y[0], max: y[1]}); }); options.onViewport?.({minX: x[0], maxX: x[1], minY: y[0], maxY: y[1]}); };
  const zoom = factor => { const x = plot.scales.x, y = plot.scales.y, cx = x.min + (x.max - x.min) / 2, cy = y.min + (y.max - y.min) / 2; applyView(cx - (x.max - x.min) * factor / 2, cx + (x.max - x.min) * factor / 2, cy - (y.max - y.min) * factor / 2, cy + (y.max - y.min) * factor / 2); };
  const selectCenter = () => { const x = plot.scales.x, y = plot.scales.y, found = index.nearest({x: (x.min + x.max) / 2, y: (y.min + y.max) / 2}, x.max - x.min, y.max - y.min); if (found) { hover = found; status.textContent = `Point ${found.index + 1}: x ${found.x}, y ${found.y}`; options.onSelect?.(found); schedule(); } };
  for (const [label, action] of [['Zoom in', () => zoom(.5)], ['Zoom out', () => zoom(2)], ['Reset', () => applyView(minX, maxX, minY, maxY)], ['Select center point', selectCenter]]) { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.addEventListener('click', action); controls.append(button); }
  const snapshot = () => ({x: {min: plot.scales.x.min, max: plot.scales.x.max}, y: {min: plot.scales.y.min, max: plot.scales.y.max}});
  const down = event => { event.preventDefault(); canvas.setPointerCapture?.(event.pointerId); gesture.set(event.pointerId, {x: event.clientX, y: event.clientY}); const points = [...gesture.values()]; if (points.length === 1) drag = {x: event.clientX, y: event.clientY, scale: snapshot()}; else if (points.length === 2) { multitouch = true; drag = {scale: snapshot(), distance: Math.max(1, Math.hypot(points[0].x - points[1].x, points[0].y - points[1].y))}; } };
  const move = event => { if (!gesture.has(event.pointerId)) { pick(event); return; } gesture.set(event.pointerId, {x: event.clientX, y: event.clientY}); const points = [...gesture.values()]; if (points.length === 1) { const dx = (event.clientX - drag.x) / Math.max(1, canvas.clientWidth) * (drag.scale.x.max - drag.scale.x.min), dy = (event.clientY - drag.y) / Math.max(1, canvas.clientHeight) * (drag.scale.y.max - drag.scale.y.min); applyView(drag.scale.x.min - dx, drag.scale.x.max - dx, drag.scale.y.min + dy, drag.scale.y.max + dy); } else { const [a, b] = points, distance = Math.hypot(a.x - b.x, a.y - b.y), factor = drag.distance / Math.max(1, distance), cx = drag.scale.x.min + (drag.scale.x.max - drag.scale.x.min) / 2, cy = drag.scale.y.min + (drag.scale.y.max - drag.scale.y.min) / 2, sx = (drag.scale.x.max - drag.scale.x.min) * factor / 2, sy = (drag.scale.y.max - drag.scale.y.min) * factor / 2; applyView(cx - sx, cx + sx, cy - sy, cy + sy); } };
  const finish = (event, cancelled = false) => { const was = gesture.get(event.pointerId); gesture.delete(event.pointerId); if (!cancelled && was && !multitouch && Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6 && !gesture.size) { const found = pick(event); if (found) options.onSelect?.(found); } if (!gesture.size) { drag = null; multitouch = false; } else { const remaining = [...gesture.values()][0]; drag = {x: remaining.x, y: remaining.y, scale: snapshot()}; } };
  const up = event => finish(event); const cancel = event => finish(event, true);
  const wheel = event => { if (!(event.ctrlKey || event.metaKey)) return; event.preventDefault(); zoom(Math.exp(Math.max(-500, Math.min(500, event.deltaY)) * .0015)); };
  const key = event => { if (event.key === 'Enter' && hover) options.onSelect?.(hover); if (event.key === 'Escape') { applyView(minX, maxX, minY, maxY); } };
  for (const [name, fn] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', cancel], ['keydown', key]]) canvas.addEventListener(name, fn);
  canvas.addEventListener('wheel', wheel, {passive: false});
  const resize = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => { const width = Math.floor(entries[0].contentRect.width); if (width) plot.setSize({width, height: options.height || 360}); }) : null; resize?.observe(wrap); canvas.style.touchAction = 'none';
  const chart = {plot, index, destroy() { if (dead) return; dead = true; if (frame) cancelAnimationFrame(frame); resize?.disconnect(); unwatch(); canvas.removeEventListener('wheel', wheel); for (const [name, fn] of [['pointerdown', down], ['pointermove', move], ['pointerup', up], ['pointercancel', cancel], ['keydown', key]]) canvas.removeEventListener(name, fn); plot.destroy(); if (wrap.parentNode === root) root.replaceChildren(); }};
  unwatch = watchChart(root, wrap, chart.destroy); schedule(); return chart;
}
