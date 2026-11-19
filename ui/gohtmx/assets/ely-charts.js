import * as echarts from '/assets/echarts.esm.min.js';
import {watchChart} from '/assets/ely-chart-lifecycle.js';

// The host supplies ECharts options as JavaScript, not untrusted executable code.
export function mountElyChart(root, {option, label, height = 320, onSelect, onViewport} = {}) {
  if (!(root instanceof Element)) throw new TypeError('root must be an Element');
  if (!option || typeof option !== 'object' || !Array.isArray(option.series) || !option.series.length || option.series.some(series => !series || typeof series !== 'object')) throw new TypeError('option.series must be a non-empty array of objects');
  if (typeof label !== 'string' || !label.trim()) throw new TypeError('a chart label is required');
  if (!Number.isFinite(height) || height < 120) throw new RangeError('height must be at least 120');
  if (onSelect != null && typeof onSelect !== 'function') throw new TypeError('onSelect must be a function');
  if (onViewport != null && typeof onViewport !== 'function') throw new TypeError('onViewport must be a function');
  const shell = document.createElement('section'), surface = document.createElement('div'), details = document.createElement('details'), summary = document.createElement('summary'), list = document.createElement('ul');
  shell.className = 'ely-web-chart'; surface.className = 'ely-web-chart-surface'; surface.style.height = `${height}px`;
  surface.setAttribute('role', 'img'); surface.setAttribute('aria-label', label);
  summary.textContent = 'Chart values'; details.append(summary, list); shell.append(surface, details); root.replaceChildren(shell);
  let instance, destroyed = false;
  const select = value => {
    onSelect?.(value);
    root.dispatchEvent(new CustomEvent('ely:chart-select', {detail: value, bubbles: true}));
  };
  try {
    instance = echarts.init(surface, null, {renderer: 'canvas'});
    const config = {...option, aria: {...option.aria, enabled: true, label: {...option.aria?.label, description: label}}};
    if (option.tooltip && !Array.isArray(option.tooltip)) config.tooltip = {...option.tooltip, renderMode: 'richText'};
    instance.setOption(config);
    instance.on('click', params => { if (params.componentType === 'series') select({seriesIndex: params.seriesIndex, dataIndex: params.dataIndex, name: params.name, value: params.value, data: params.data}); });
    instance.on('datazoom', () => {
      const ranges = (instance.getOption().dataZoom || []).map(({start, end}) => ({start, end}));
      onViewport?.(ranges); root.dispatchEvent(new CustomEvent('ely:chart-viewport', {detail: ranges, bubbles: true}));
    });
    let count = 0, truncated = false;
    option.series.forEach((series, seriesIndex) => {
      if (!Array.isArray(series.data)) return;
      const seen = new WeakSet();
      const visit = (items, depth = 0) => { for (let dataIndex = 0; dataIndex < items.length; dataIndex++) {
        if (count >= 100) { truncated = true; return; }
        const data = items[dataIndex], object = data && typeof data === 'object' && !Array.isArray(data);
        const value = object ? data.value : data, name = object ? data.name : '';
        const item = document.createElement('li'), button = document.createElement('button');
        const display = Array.isArray(value) ? value.join(', ') : value;
        button.type = 'button'; button.textContent = `${series.name || `Series ${seriesIndex + 1}`}: ${'  '.repeat(depth)}${name || dataIndex + 1}${display == null ? '' : ` — ${display}`}`;
        button.addEventListener('click', () => { instance.dispatchAction({type: 'highlight', seriesIndex, ...(depth && name ? {name} : {dataIndex})}); select({seriesIndex, dataIndex, name, value, data}); });
        item.append(button); list.append(item); count++;
        if (object && Array.isArray(data.children)) {
          if (depth >= 32 || seen.has(data)) truncated = true;
          else { seen.add(data); visit(data.children, depth + 1); }
        }
      }};
      visit(series.data);
    });
    if (truncated) { const note = document.createElement('p'); note.textContent = `Showing the first ${count} values.`; details.append(note); }
  } catch (error) { instance?.dispose(); root.replaceChildren(); throw error; }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(() => instance.resize()) : null;
  observer?.observe(surface);
  const cleanup = event => { if (event.target === root) destroy(); };
  root.addEventListener('htmx:beforeCleanupElement', cleanup);
  root.addEventListener('htmx:before:cleanup', cleanup);
  const unwatch = watchChart(root, shell, destroy);
  function destroy() {
    if (destroyed) return; destroyed = true; unwatch(); observer?.disconnect(); root.removeEventListener('htmx:beforeCleanupElement', cleanup); root.removeEventListener('htmx:before:cleanup', cleanup);
    instance.dispose(); if (root.contains(shell)) shell.remove();
  }
  return {chart: instance, destroy};
}
