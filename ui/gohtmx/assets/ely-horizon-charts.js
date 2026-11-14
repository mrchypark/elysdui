import {watchChart} from '/assets/ely-chart-lifecycle.js';

const NS = 'http://www.w3.org/2000/svg';
const MAX_SERIES = 32, MAX_SAMPLES = 2000, MAX_TOTAL = 10000;
const finite = value => typeof value === 'number' && Number.isFinite(value);

function seriesModel(data, {allowNegative = false} = {}) {
  if (!Array.isArray(data) || !data.length || data.length > MAX_SERIES) throw new RangeError(`data needs 1–${MAX_SERIES} series.`);
  let total = 0;
  const series = data.map((entry, index) => {
    if (!entry || typeof entry !== 'object' || typeof entry.label !== 'string' || !entry.label.trim() || !Array.isArray(entry.values) || !entry.values.length || entry.values.length > MAX_SAMPLES) throw new TypeError(`Series ${index} needs a label and 1–${MAX_SAMPLES} values.`);
    total += entry.values.length;
    if (total > MAX_TOTAL) throw new RangeError(`Charts are limited to ${MAX_TOTAL} total samples.`);
    const values = entry.values.map((value, sample) => {
      if (value === null) return null;
      if (!finite(value) || (!allowNegative && value < 0)) throw new TypeError(`Series ${entry.label} sample ${sample} must be ${allowNegative ? 'finite or null' : 'finite, nonnegative or null'}.`);
      return value;
    });
    return {label: entry.label.trim(), values};
  });
  return series;
}

/** Return band slices for horizon rows. Each sign and band occupies its own strip; missing values split strips into independent runs. */
export function horizonModel(data, {bands = 3, baseline = 0} = {}) {
  if (!Number.isInteger(bands) || bands < 1 || bands > 8 || !finite(baseline)) throw new RangeError('bands must be 1–8 and baseline must be finite.');
  const series = seriesModel(data, {allowNegative: true});
  const deviations = series.flatMap(item => item.values.filter(value => value !== null).map(value => Math.abs(value - baseline)));
  const maxDeviation = Math.max(0, ...deviations);
  if (!finite(maxDeviation)) throw new RangeError('Horizon deviations must remain finite.');
  const bandWidth = maxDeviation ? (maxDeviation / bands || maxDeviation) : 1;
  const layouts = series.map((item, seriesIndex) => {
    const groups = [];
    for (const sign of [1, -1]) for (let band = 0; band < bands; band++) {
      let run = [];
      const flush = () => {
        if (run.length && run.some(point => point.amplitude > 0)) groups.push({series: seriesIndex, label: item.label, sign, band, indices: run.map(point => point.index), values: run.map(point => point.value), amplitudes: run.map(point => point.amplitude)});
        run = [];
      };
      item.values.forEach((value, index) => {
        if (value === null) { flush(); return; }
        const signed = (value - baseline) * sign;
        run.push({index, value, amplitude: Math.max(0, Math.min(bandWidth, signed - band * bandWidth))});
      });
      flush();
    }
    return {label: item.label, values: item.values, groups};
  });
  return {series: layouts, bands, baseline, bandWidth, maxDeviation};
}

/** Map each non-null sample to an evenly spaced angle and data-scaled radius; nulls break line segments. */
export function radialLineModel(data, {width = 480, height = 400, radius, maxValue} = {}) {
  const series = seriesModel(data), foundMaximum = Math.max(0, ...series.flatMap(item => item.values.filter(value => value !== null))), maximum = maxValue === undefined ? (foundMaximum || 1) : maxValue;
  if (!finite(width) || !finite(height) || width < 160 || height < 160 || width > 2000 || height > 2000 || !finite(maximum) || maximum <= 0) throw new RangeError('Radial dimensions must be 160–2000 and maxValue must be positive and finite.');
  const cx = width / 2, cy = height / 2, outerRadius = radius === undefined ? Math.min(width, height) * .42 : radius;
  if (!finite(outerRadius) || outerRadius <= 0 || outerRadius > Math.min(width, height) / 2) throw new RangeError('radius must fit inside the chart.');
  return {width, height, cx, cy, radius: outerRadius, maxValue: maximum, series: series.map(item => {
    const points = item.values.map((value, index) => {
      if (value === null) return null;
      if (value > maximum) throw new RangeError(`Series ${item.label} exceeds maxValue.`);
      const angle = -Math.PI / 2 + index * Math.PI * 2 / item.values.length, r = value / maximum * outerRadius;
      return {index, value, angle, radius: r, x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r};
    });
    const segments = []; let segment = [];
    points.forEach(point => { if (point) segment.push(point); else if (segment.length) { segments.push(segment); segment = []; } });
    if (segment.length) segments.push(segment);
    return {label: item.label, points, segments};
  })};
}

const svgNode = (name, attrs = {}) => {
  const element = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  return element;
};
const htmlNode = (name, attrs = {}, text = '') => {
  const element = document.createElement(name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, value);
  element.textContent = text;
  return element;
};
const colors = ['#2563eb', '#0891b2', '#16a34a', '#ca8a04', '#ea580c', '#dc2626', '#9333ea', '#db2777'];

/** Mount HorizonChart or RadialLineChart. Data is [{label, values:[number|null]}]. Returns {destroy()}. */
export function mountHorizonChart(root, {type, data, width = 720, height, bands = 3, baseline = 0, radius, maxValue, onSelect} = {}) {
  if (!root || typeof root.replaceChildren !== 'function') throw new TypeError('root must be a DOM element.');
  if (!['HorizonChart', 'RadialLineChart'].includes(type)) throw new RangeError('type must be HorizonChart or RadialLineChart.');
  if (onSelect !== undefined && typeof onSelect !== 'function') throw new TypeError('onSelect must be a function.');
  const model = type === 'HorizonChart' ? horizonModel(data, {bands, baseline}) : radialLineModel(data, {width, height: height ?? width, radius, maxValue});
  const w = type === 'HorizonChart' ? width : model.width, rowHeight = 20, gap = 8;
  if (!finite(w) || w < 240 || w > 2000) throw new RangeError('width must be 240–2000.');
  const requiredHeight = type === 'HorizonChart' ? Math.max(160, model.series.length * (2 * rowHeight + gap) + 48) : 0;
  const h = type === 'HorizonChart' ? (height ?? requiredHeight) : model.height;
  if (!finite(h) || h < 160 || h > 2000 || (type === 'HorizonChart' && h < requiredHeight)) throw new RangeError(`height must be 160–2000 and fit all ${type === 'HorizonChart' ? 'series bands' : 'chart geometry'}.`);
  const wrap = htmlNode('section', {class: 'ely-horizon-chart', 'data-ely-horizon-chart': type}), svg = svgNode('svg', {viewBox: `0 0 ${w} ${h}`, role: 'group', 'aria-label': type}), status = htmlNode('output', {class: 'ely-horizon-status', 'aria-live': 'polite'}), text = htmlNode('ul', {class: 'ely-horizon-text', 'aria-label': 'Chart values'}), targets = [];
  const target = (shape, description, payload) => {
    shape.setAttribute('role', 'button'); shape.setAttribute('tabindex', targets.length ? '-1' : '0'); shape.setAttribute('aria-label', description);
    shape._chartPayload = payload; targets.push(shape); svg.append(shape);
  };
  if (type === 'HorizonChart') {
    const left = 84, plotWidth = w - left - 12;
    model.series.forEach((item, seriesIndex) => {
      const top = 24 + seriesIndex * (2 * rowHeight + gap), base = top + rowHeight, caption = svgNode('text', {x: 8, y: base + 4, class: 'ely-horizon-series-label'}); caption.textContent = item.label; svg.append(caption);
      item.groups.forEach(group => {
        const x = i => left + (item.values.length === 1 ? .5 : i / (item.values.length - 1)) * plotWidth;
        const geometry = [];
        group.indices.forEach((index, i) => {
          geometry.push({index, amplitude: group.amplitudes[i]});
          if (i === group.indices.length - 1) return;
          const a = (group.values[i] - baseline) * group.sign, b = (group.values[i + 1] - baseline) * group.sign;
          if (a === b) return;
          const crossings = [group.band * model.bandWidth, (group.band + 1) * model.bandWidth]
            .map(level => ({level, t: (level - a) / (b - a)})).filter(item => item.t > 0 && item.t < 1).sort((one, two) => one.t - two.t);
          crossings.forEach(crossing => geometry.push({index: index + crossing.t, amplitude: crossing.level - group.band * model.bandWidth}));
        });
        const points = geometry.map(point => `${x(point.index)},${base - group.sign * point.amplitude / model.bandWidth * rowHeight}`).join(' L');
        const d = `M${x(geometry[0].index)},${base} L${points} L${x(geometry.at(-1).index)},${base} Z`;
        const shape = svgNode('path', {d, class: `ely-horizon-band ely-horizon-${group.sign > 0 ? 'positive' : 'negative'}`, fill: colors[(group.band + seriesIndex * 2) % colors.length], 'data-series': seriesIndex, 'data-band': group.band, 'data-sign': group.sign});
        target(shape, `${item.label}, ${group.sign > 0 ? 'positive' : 'negative'} band ${group.band + 1}`, {type, series: seriesIndex, label: item.label, sign: group.sign, band: group.band, indices: group.indices, values: group.values});
      });
      item.values.forEach((value, index) => { const li = htmlNode('li', {}, `${item.label} ${index + 1}: ${value === null ? 'missing' : value}`); text.append(li); });
    });
  } else {
    const c = model;
    c.series.forEach((item, seriesIndex) => {
      item.segments.forEach(segment => {
        const d = segment.map((point, index) => `${index ? 'L' : 'M'}${point.x},${point.y}`).join(' '), line = svgNode('path', {d, class: 'ely-radial-line', fill: 'none', stroke: colors[seriesIndex % colors.length], 'data-series': seriesIndex}); svg.append(line);
      });
      item.points.forEach(point => {
        if (!point) { text.append(htmlNode('li', {}, `${item.label}: missing`)); return; }
        const dot = svgNode('circle', {cx: point.x, cy: point.y, r: 10, class: 'ely-radial-point', fill: colors[seriesIndex % colors.length], 'data-index': point.index});
        target(dot, `${item.label}, sample ${point.index + 1}: ${point.value}`, {type, series: seriesIndex, label: item.label, index: point.index, value: point.value, angle: point.angle, radius: point.radius});
        text.append(htmlNode('li', {}, `${item.label} ${point.index + 1}: ${point.value}`));
      });
    });
    svg.setAttribute('viewBox', `0 0 ${c.width} ${c.height}`);
  }
  const table = htmlNode('div', {class: 'ely-horizon-accessible'}); table.append(text); wrap.append(svg, status, table); root.replaceChildren(wrap);
  let destroyed = false, unwatch = () => {};
  const select = shape => { if (!shape || destroyed) return; targets.forEach((item, index) => { item.setAttribute('tabindex', item === shape ? '0' : '-1'); item.classList.toggle('is-selected', item === shape); }); status.textContent = shape.getAttribute('aria-label'); onSelect?.(shape._chartPayload); root.dispatchEvent(new CustomEvent('ely:horizon-select', {bubbles: true, detail: shape._chartPayload})); };
  const click = event => { const shape = event.target.closest?.('[role="button"]'); if (shape && targets.includes(shape)) select(shape); };
  const keyboard = event => { const shape = event.target.closest?.('[role="button"]'), index = targets.indexOf(shape); if (index < 0) return; if (['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const next = event.key === 'Home' ? 0 : event.key === 'End' ? targets.length - 1 : Math.max(0, Math.min(targets.length - 1, index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1))); targets[next].focus(); select(targets[next]); } else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); select(shape); } };
  const htmxCleanup = event => { if (event.target === root) destroy(); };
  svg.addEventListener('click', click); svg.addEventListener('keydown', keyboard); root.addEventListener('htmx:beforeCleanupElement', htmxCleanup);
  function destroy() { if (destroyed) return; destroyed = true; unwatch(); svg.removeEventListener('click', click); svg.removeEventListener('keydown', keyboard); root.removeEventListener('htmx:beforeCleanupElement', htmxCleanup); if (root.firstChild === wrap) root.replaceChildren(); }
  unwatch = watchChart(root, wrap, destroy);
  return {destroy};
}
