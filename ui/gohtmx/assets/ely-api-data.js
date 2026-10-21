import { register, emit } from './ely-api.js';
import './ely-patterns.js';

const visibleRows = root => [...root.querySelectorAll('tbody tr, .ely-data__list > li')];
// Tree and file nodes carry an icon glyph and a status badge around the label.
const nodeLabel = node => node.querySelector(':scope > span:not(.ely-data__node-icon)')?.textContent.trim() || node.textContent.trim();
// Directory columns render human sizes and relative times, not sortable values.
const sizeInBytes = text => {
  const match = /([\d.]+)\s*(KB|MB|GB|B)?/i.exec(text || '');
  if (!match) return -1;
  const unit = (match[2] || 'B').toUpperCase();
  const scale = unit === 'GB' ? 1073741824 : unit === 'MB' ? 1048576 : unit === 'KB' ? 1024 : 1;
  return Number(match[1]) * scale;
};
const ageInSeconds = text => {
  const match = /(\d+)\s*(second|minute|hour|day|week|month|year)/i.exec(text || '');
  if (!match) return Number.POSITIVE_INFINITY;
  const scales = { second: 1, minute: 60, hour: 3600, day: 86400, week: 604800, month: 2592000, year: 31536000 };
  return Number(match[1]) * (scales[match[2].toLowerCase()] || 1);
};
const selectionAnchors = new WeakMap();
const typeAheadStates = new WeakMap();
const directoryOrders = new WeakMap();
const directorySorts = new WeakMap();
const changed = (root, detail = {}) => root.dispatchEvent(new CustomEvent('ely:change', {
  bubbles: true, detail: { id: root.id, component: root.dataset.elyComponent, ...detail },
}));

register('data', root => {
  const abort = new AbortController();
  const listen = (target, type, handler, options = {}) => target.addEventListener(type, handler, { ...options, signal: abort.signal });
  const virtualCleanups = [];
  root.querySelectorAll('[data-ely-virtual-table]').forEach(container => {
    if (container.closest('[data-ely-family]') !== root) return;
    const viewport = container.querySelector('[data-ely-virtual-viewport]');
    const table = viewport?.querySelector('table');
    const body = table?.tBodies[0];
    if (!body) return; // A caller error is displayed without a scroll controller.
    const rows = [...body.rows];
    const rowHeight = 32, overscan = 4;
    const status = container.querySelector('[data-ely-virtual-status]');
    const declared = Number(container.dataset.elyTotal);
    table.setAttribute('aria-rowcount', String(rows.length + 1));
    rows.forEach((row, index) => row.setAttribute('aria-rowindex', String(index + 2)));
    const spacer = () => {
      const row = document.createElement('tr');
      row.dataset.elyVirtualSpacer = '';
      row.setAttribute('aria-hidden', 'true');
      const cell = document.createElement('td');
      cell.colSpan = Math.max(1, table.tHead?.rows[0]?.cells.length || 1);
      row.append(cell);
      return row;
    };
    const top = spacer(), bottom = spacer();
    let start = -1, end = -1;
    const render = () => {
      const headerHeight = table.tHead?.getBoundingClientRect().height || rowHeight;
      const capacity = Math.max(1, Math.ceil((viewport.clientHeight - headerHeight) / rowHeight));
      const first = Math.max(0, Math.min(rows.length - 1, Math.floor(viewport.scrollTop / rowHeight)));
      const nextStart = Math.max(0, first - overscan);
      const nextEnd = Math.min(rows.length, first + capacity + overscan);
      if (nextStart === start && nextEnd === end) return;
      start = nextStart; end = nextEnd;
      top.firstElementChild.style.height = `${start * rowHeight}px`;
      bottom.firstElementChild.style.height = `${(rows.length - end) * rowHeight}px`;
      body.replaceChildren(top, ...rows.slice(start, end), bottom);
      status.textContent = rows.length ? `Rows ${start + 1}–${end} of ${rows.length} supplied` : '0 supplied rows';
      if (Number.isFinite(declared) && declared > rows.length) status.textContent += ` (${declared} declared; remaining rows not supplied)`;
    };
    listen(viewport, 'scroll', render, { passive: true });
    listen(viewport, 'keydown', event => {
      if (event.target !== viewport || root.dataset.elyDisabled === 'true') return;
      const page = Math.max(rowHeight, viewport.clientHeight - rowHeight);
      const offsets = { ArrowDown: rowHeight, ArrowUp: -rowHeight, PageDown: page, PageUp: -page, ' ': event.shiftKey ? -page : page };
      if (!(event.key in offsets) && !['Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      viewport.scrollTop = event.key === 'Home' ? 0 : event.key === 'End' ? viewport.scrollHeight : viewport.scrollTop + offsets[event.key];
      render();
    });
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(render) : null;
    observer?.observe(viewport);
    render();
    virtualCleanups.push(() => { observer?.disconnect(); body.replaceChildren(); rows.forEach(row => body.append(row)); });
  });
  const updateConverter = form => {
    const amount = Number(form.elements.amount?.value);
    const from = form.elements.from?.selectedOptions[0];
    const to = form.elements.to?.selectedOptions[0];
    const fromRate = Number(from?.dataset.elyRate), toRate = Number(to?.dataset.elyRate);
    const output = form.querySelector('[data-ely-converter-output]');
    if (!output || !Number.isFinite(amount) || amount < 0 || !(fromRate > 0) || !(toRate > 0)) return;
    const value = amount * fromRate / toRate;
    try { output.textContent = new Intl.NumberFormat(undefined, { style: 'currency', currency: to.value }).format(value); }
    catch { output.textContent = `${value.toFixed(2)} ${to.value}`; }
    changed(root, { action: 'convert-preview', value, from: from.value, to: to.value });
  };
  root.querySelectorAll('[data-ely-gauge]').forEach(element => {
    const percent = Math.max(0, Math.min(100, Number(element.dataset.elyGauge) || 0));
    element.style.setProperty('--ely-gauge', `${percent}%`);
  });
  root.querySelectorAll('[data-ely-usage]').forEach(element => {
    element.style.flexGrow = String(Math.max(0, Number(element.dataset.elyUsage) || 0));
  });
  root.querySelectorAll('[data-ely-book-share]').forEach(element => {
    element.style.flexGrow = String(Math.max(0, Number(element.dataset.elyBookShare) || 0));
  });
  root.querySelectorAll('[data-ely-left], [data-ely-width]').forEach(element => {
    const percent = value => Math.max(0, Math.min(100, Number(value) || 0)) + '%';
    if (element.dataset.elyLeft != null) element.style.marginLeft = percent(element.dataset.elyLeft);
    if (element.dataset.elyWidth != null) element.style.width = percent(element.dataset.elyWidth);
  });
  root.querySelectorAll('[data-ely-star-fill]').forEach(star => {
    const fill = Math.max(0, Math.min(100, Number(star.dataset.elyStarFill) || 0));
    star.style.setProperty('--ely-star-fill', `${fill}%`);
  });
  const comparison = root.querySelector('[data-ely-before-after]');
  if (comparison) {
    const range = comparison.querySelector('[data-ely-range]');
    let dragging = false;
    const setComparison = value => {
      if (!range) return;
      const next = Math.max(0, Math.min(100, Math.round(value)));
      range.value = String(next);
      range.dispatchEvent(new Event('input', { bubbles: true }));
    };
    const setFromPointer = event => {
      const box = comparison.getBoundingClientRect();
      if (box.width) setComparison((event.clientX - box.left) / box.width * 100);
    };
    listen(comparison, 'pointerdown', event => {
      if (event.target.matches('input')) return;
      dragging = true;
      comparison.setPointerCapture?.(event.pointerId);
      setFromPointer(event);
    });
    listen(comparison, 'pointermove', event => { if (dragging) setFromPointer(event); });
    listen(comparison, 'pointerup', event => {
      dragging = false;
      comparison.releasePointerCapture?.(event.pointerId);
    });
    listen(comparison, 'keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      setComparison(Number(range?.value || 50) + (event.key === 'ArrowRight' ? 5 : -5));
    });
    range?.dispatchEvent(new Event('input', { bubbles: true }));
  }
  root.querySelectorAll('[data-ely-watermark-toggle]').forEach(control => listen(control, 'click', () => {
    const read = control.getAttribute('aria-pressed') !== 'true';
    control.setAttribute('aria-pressed', String(read));
    control.textContent = read ? 'Unmark as read' : 'Mark as read';
    const status = control.closest('.ely-data__watermark')?.querySelector('[data-ely-watermark-status]');
    if (status) status.value = read ? 'Read.' : 'Unread.';
    emit(root, 'watermark-read', { read });
  }));
  root.querySelectorAll('[data-ely-tag-remove]').forEach(control => listen(control, 'click', () => {
    const tag = control.closest('.ely-data__tag');
    const value = control.value;
    tag?.remove();
    emit(root, 'tag-remove', { value });
  }));
  const carousel = root.querySelector('[data-ely-carousel]');
  if (carousel) {
    const items = [...carousel.querySelectorAll('[data-ely-carousel-item]')];
    const dots = [...carousel.querySelectorAll('[data-ely-carousel-dot]')];
    const position = carousel.querySelector('[data-ely-carousel-position]');
    let current = Math.max(0, items.findIndex(item => item.hasAttribute('data-ely-current'))), pointerStart;
    const show = index => {
      current = (index + items.length) % items.length;
      items.forEach((item, itemIndex) => { item.hidden = itemIndex !== current; item.toggleAttribute('data-ely-current', itemIndex === current); });
      dots.forEach((dot, dotIndex) => { if (dotIndex === current) dot.setAttribute('aria-current', 'true'); else dot.removeAttribute('aria-current'); });
      if (position) position.value = String(current + 1);
    };
    const move = delta => { show(current + delta); emit(root, 'navigate', { position: position?.value, value: String(current) }); };
    if (items.length) show(current);
    listen(carousel, 'keydown', event => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      event.preventDefault(); move(event.key === 'ArrowRight' ? 1 : -1);
    });
    listen(carousel, 'click', event => {
      if (event.target.closest('[data-ely-carousel-next]')) move(1);
      else if (event.target.closest('[data-ely-carousel-prev]')) move(-1);
      else { const dot = event.target.closest('[data-ely-carousel-dot]'); if (dot) { show(Number(dot.value)); emit(root, 'navigate', { position: position?.value, value: dot.value }); } }
    });
    listen(carousel, 'pointerdown', event => { pointerStart = event.clientX; });
    listen(carousel, 'pointerup', event => { if (pointerStart == null) return; const delta = event.clientX - pointerStart; pointerStart = undefined; if (Math.abs(delta) >= 40) move(delta < 0 ? 1 : -1); });
  }
  root.querySelectorAll('[data-ely-properties]').forEach(form => {
    const preview = form.querySelector('[data-ely-property-preview]'), frame = form.querySelector('[data-ely-property-frame]');
    const update = () => {
      if (!preview || !frame) return;
      const width = Number(form.elements.width?.value), height = Number(form.elements.height?.value), opacity = Number(form.elements.opacity?.value);
      if (Number.isFinite(width)) frame.style.width = `${width}px`;
      if (Number.isFinite(height)) frame.style.height = `${height}px`;
      if (Number.isFinite(opacity)) frame.style.opacity = String(opacity);
      frame.style.flexDirection = form.elements.direction?.value === 'column' ? 'column' : 'row';
      preview.hidden = form.elements.visible?.checked === false;
    };
    update();
    listen(form, 'input', update); listen(form, 'change', update);
  });
  const gallery = root.querySelector('[data-ely-gallery]');
  if (gallery) {
    const dialog = gallery.querySelector('[data-ely-gallery-dialog]');
    const items = [...gallery.querySelectorAll('[data-ely-gallery-open]')];
    let current = 0;
    const show = index => {
      if (!dialog || !items.length) return;
      current = (index + items.length) % items.length;
      const image = items[current].querySelector('img');
      const preview = dialog.querySelector('[data-ely-gallery-image]');
      if (image && preview) { preview.src = image.currentSrc || image.src; preview.alt = image.alt; }
      const caption = dialog.querySelector('[data-ely-gallery-caption]');
      if (caption) caption.textContent = image?.alt || items[current].getAttribute('aria-label') || '';
      if (!dialog.open) dialog.showModal();
    };
    listen(gallery, 'click', event => {
      const open = event.target.closest('[data-ely-gallery-open]');
      if (open) show(Number(open.dataset.elyGalleryIndex));
      if (event.target.closest('[data-ely-gallery-prev]')) show(current - 1);
      if (event.target.closest('[data-ely-gallery-next]')) show(current + 1);
    });
    dialog && listen(dialog, 'keydown', event => {
      if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        show(current + (event.key === 'ArrowRight' ? 1 : -1));
      }
    });
  }
  root.querySelectorAll('[data-ely-table-filter-column]').forEach(control => listen(control, 'change', () => {
    if (control.closest('[data-ely-paged-table]')) return;
    const table = control.closest('.ui-data-table')?.querySelector('table');
    const column = Number(control.dataset.elyTableFilterColumn);
    const value = control.value.trim().toLocaleLowerCase();
    if (!table || !Number.isInteger(column)) return;
    [...table.tBodies[0].rows].forEach(row => { row.hidden = Boolean(value) && !row.cells[column]?.textContent.toLocaleLowerCase().includes(value); });
    changed(root, { action: 'filter', column, value: control.value });
  }));
  root.querySelectorAll('[data-ely-paged-table]').forEach(tableRoot => {
    const table = tableRoot.querySelector('table'), body = table?.tBodies[0], search = tableRoot.querySelector('[data-ui-table-filter]');
    const status = tableRoot.querySelector('[data-ely-table-filter-column]'), size = tableRoot.querySelector('[data-ely-table-page-size]');
    const pageStatus = tableRoot.querySelector('[data-ely-table-page-status]'), summary = tableRoot.querySelector('[data-ui-table-summary]');
    const originalRows = body ? [...body.rows] : [];
    const selectAll = tableRoot.querySelector('[data-ely-table-select-all]');
    const syncSelection = () => {
      if (!selectAll) return;
      const controls = [...tableRoot.querySelectorAll('[data-ely-table-select]')].filter(control => !control.disabled && !control.closest('tr')?.hidden);
      const selected = controls.filter(control => control.checked).length;
      selectAll.checked = controls.length > 0 && selected === controls.length;
      selectAll.indeterminate = selected > 0 && selected < controls.length;
      selectAll.disabled = controls.length === 0;
    };
    let page = 0;
    const apply = () => {
      if (!body) return;
      const query = search?.value.trim().toLocaleLowerCase() || '', statusValue = status?.value.trim().toLocaleLowerCase() || '';
      const rows = [...body.rows], matches = rows.filter(row => row.textContent.toLocaleLowerCase().includes(query) && (!statusValue || row.cells[Number(status?.dataset.elyTableFilterColumn)]?.textContent.toLocaleLowerCase().includes(statusValue)));
      const pageSize = Math.max(1, Number(size?.value) || 8), pages = Math.max(1, Math.ceil(matches.length / pageSize));
      page = Math.max(0, Math.min(page, pages - 1));
      const start = page * pageSize;
      rows.forEach(row => { row.hidden = !matches.includes(row) || matches.indexOf(row) < start || matches.indexOf(row) >= start + pageSize; });
      if (pageStatus) pageStatus.textContent = matches.length ? `${start + 1}–${Math.min(start + pageSize, matches.length)} of ${matches.length}` : '0 rows';
      if (summary) summary.textContent = `${matches.length} / ${rows.length} rows`;
      tableRoot.querySelector('[data-ely-table-page="previous"]')?.toggleAttribute('disabled', page === 0);
      tableRoot.querySelector('[data-ely-table-page="next"]')?.toggleAttribute('disabled', page + 1 >= pages);
      syncSelection();
    };
    const reset = () => { page = 0; apply(); };
    listen(search, 'input', reset);
    listen(status, 'change', () => { reset(); changed(root, { action: 'filter', column: Number(status.dataset.elyTableFilterColumn), value: status.value }); });
    listen(size, 'change', reset);
    tableRoot.querySelectorAll('[data-ely-table-page]').forEach(button => listen(button, 'click', () => { if (button.disabled) return; page += button.dataset.elyTablePage === 'next' ? 1 : -1; apply(); changed(root, { action: 'page', page: page + 1, pageSize: Number(size?.value) || 8 }); }));
    tableRoot.querySelectorAll('[data-ui-table-column]').forEach(control => listen(control, 'change', () => { const column = Number(control.dataset.uiTableColumn) + 1; tableRoot.querySelectorAll('tr').forEach(row => { if (row.cells[column]) row.cells[column].hidden = !control.checked; }); }));
    tableRoot.querySelectorAll('[data-ui-table-sort]').forEach(button => listen(button, 'click', () => {
      if (button.disabled || !body) return;
      const column = Number(button.dataset.uiTableSort) + 1, heading = button.closest('th');
      const previous = heading?.getAttribute('aria-sort');
      const direction = previous === 'ascending' ? 'descending' : previous === 'descending' ? 'none' : 'ascending';
      tableRoot.querySelectorAll('th[aria-sort]').forEach(cell => cell.setAttribute('aria-sort', 'none'));
      heading?.setAttribute('aria-sort', direction);
      const rows = direction === 'none' ? originalRows : [...originalRows].sort((left, right) => (left.cells[column]?.textContent || '').localeCompare(right.cells[column]?.textContent || '', undefined, { numeric: true }) * (direction === 'ascending' ? 1 : -1));
      body.append(...rows);
      reset();
    }));
    listen(tableRoot.querySelector('[data-ui-table-density]'), 'click', () => { tableRoot.dataset.density = tableRoot.dataset.density === 'compact' ? 'default' : 'compact'; });
    listen(selectAll, 'change', () => {
      if (selectAll.disabled) return;
      tableRoot.querySelectorAll('[data-ely-table-select]').forEach(control => { if (!control.disabled && !control.closest('tr')?.hidden) control.checked = selectAll.checked; });
      syncSelection();
      changed(root, { action: 'select-rows', count: tableRoot.querySelectorAll('[data-ely-table-select]:checked').length });
    });
    tableRoot.querySelectorAll('[data-ely-table-select]').forEach(control => listen(control, 'change', () => {
      if (control.disabled) return;
      syncSelection();
      changed(root, { action: 'select-rows', count: tableRoot.querySelectorAll('[data-ely-table-select]:checked').length });
    }));
    apply();
  });
  root.querySelectorAll('[data-ely-group-toggle]').forEach(control => listen(control, 'click', () => {
    const expanded = control.getAttribute('aria-expanded') !== 'true';
    control.setAttribute('aria-expanded', String(expanded));
    const group = control.dataset.elyGroup;
    root.querySelectorAll(`[data-ely-group-member="${CSS.escape(group)}"]`).forEach(row => { row.hidden = !expanded; });
    changed(root, { action: 'toggle-group', value: group, expanded });
  }));
  const eventStream = root.querySelector('.ely-data__events');
  if (eventStream) {
    const stream = eventStream.querySelector('.ely-data__stream');
    const pause = eventStream.querySelector('[data-ely-event-pause]');
    const pending = eventStream.querySelector('[data-ely-pending-count]');
    const cap = 500;
    const visibleForActiveKinds = kind => {
      const selected = [...eventStream.querySelectorAll('[data-ely-event-kind][aria-pressed="true"]')].map(button => button.dataset.elyEventKind);
      return selected.length === 0 || selected.includes(kind);
    };
    const appendEvent = detail => {
      if (!stream || !detail?.label) return;
      const item = document.createElement('li');
      const kind = detail.kind || 'event';
      item.dataset.elyEventKindRow = kind;
      item.hidden = !visibleForActiveKinds(kind);
      item.innerHTML = `<span class="ely-data__event-kind"></span><span></span><time></time>`;
      item.firstElementChild.textContent = kind;
      item.children[1].textContent = detail.label;
      item.lastElementChild.textContent = detail.time || 'now';
      stream.prepend(item);
      while (stream.children.length > cap) stream.lastElementChild.remove();
    };
    let queued = [];
    listen(root, 'ely:event', event => {
      if (root.dataset.elyDisabled === 'true') return;
      const detail = event.detail || {};
      if (pause?.getAttribute('aria-pressed') === 'true') {
        queued.push(detail);
        if (queued.length > cap) queued = queued.slice(-cap);
        if (pending) pending.value = `${queued.length} new`;
        return;
      }
      appendEvent(detail);
    });
    listen(eventStream, 'eventstream-resume', () => {
      queued.splice(0).forEach(appendEvent);
      if (pending) pending.value = '';
    });
  }
  root.querySelectorAll('[data-ely-directory-open]').forEach(control => listen(control, 'click', () => {
    const folder = control.value || control.dataset.value || control.textContent.trim();
    emit(root, 'directory-open', { value: folder, folder });
  }));
  root.querySelectorAll('[data-ely-directory-path]').forEach(control => listen(control, 'click', () => emit(root, 'directory-path', { value: control.value })));
  // Opening a file records it in the specimen output; folders stay closed.
  const openFile = node => {
    const tree = node.closest('.ely-data__file-tree');
    if (!tree || node.closest('li')?.dataset.elyNodeKind === 'folder') return;
    const status = tree.querySelector('[data-ely-file-opened]');
    const label = nodeLabel(node);
    if (status) status.value = `Opened ${label}.`;
    changed(root, { action: 'file-open', value: label });
  };
  root.querySelectorAll('[data-ely-directory-sort]').forEach(control => listen(control, 'click', () => {
    const table = control.closest('table');
    const body = table?.tBodies[0];
    if (!body) return;
    const column = control.value;
    const headers = [...table.tHead.rows[0].cells];
    const index = headers.findIndex(cell => cell.contains(control));
    const original = directoryOrders.get(body) || [...body.rows];
    if (!directoryOrders.has(body)) directoryOrders.set(body, original);
    const previous = directorySorts.get(body);
    const direction = previous?.column === column ? (previous.direction === 'ascending' ? 'descending' : 'none') : 'ascending';
    const compare = {
      name: (a, b) => a.cells[0].textContent.trim().localeCompare(b.cells[0].textContent.trim(), undefined, { numeric: true }),
      size: (a, b) => sizeInBytes(a.cells[index]?.textContent) - sizeInBytes(b.cells[index]?.textContent),
      modified: (a, b) => ageInSeconds(a.cells[index]?.textContent) - ageInSeconds(b.cells[index]?.textContent),
    }[column];
    if (!compare) return;
    const rows = direction === 'none' ? original : [...original].sort((a, b) => {
      const foldersFirst = Number(b.hasAttribute('data-ely-directory-folder')) - Number(a.hasAttribute('data-ely-directory-folder'));
      return foldersFirst || compare(a, b) * (direction === 'ascending' ? 1 : -1);
    });
    rows.forEach(row => body.append(row));
    headers.forEach(cell => {
      const sortControl = cell.querySelector('[data-ely-directory-sort]');
      if (!sortControl) return;
      cell.setAttribute('aria-sort', sortControl.value === column ? direction : 'none');
    });
    if (direction === 'none') directorySorts.delete(body); else directorySorts.set(body, { column, direction });
    changed(root, { action: 'directory-sort', value: column, direction });
  }));
  root.querySelectorAll('[data-ely-market-tile], [data-ely-calendar-event]').forEach(control => {
    listen(control, 'click', () => { const detail = { value: control.dataset.value || control.textContent.trim() }; if (control.matches('[data-ely-calendar-event]')) emit(root, 'calendar-event', detail); else changed(root, { action: 'market-tile', ...detail }); });
  });
  root.querySelectorAll('.ely-data__forecast table').forEach(table => {
    let dragged;
    const disabled = () => table.closest('[aria-disabled="true"], [data-ely-disabled="true"]') != null;
    const columns = () => [...table.tHead.rows[0].cells];
    const move = (from, to) => {
      const heads = columns(); if (disabled() || from === to || from <= 0 || to <= 0 || from >= heads.length || to >= heads.length) return;
      [...table.rows].forEach(row => { const cell = row.cells[from]; const target = row.cells[to]; if (cell && target) row.insertBefore(cell, from < to ? target.nextSibling : target); });
      changed(root, { action: 'reorder-column', from, to });
    };
    columns().forEach(header => {
      listen(header, 'dragstart', event => { if (disabled() || columns().indexOf(header) === 0) { event.preventDefault(); return; } dragged = columns().indexOf(header); event.dataTransfer?.setData('text/plain', String(dragged)); });
      listen(header, 'dragover', event => { if (!disabled() && columns().indexOf(header) > 0) event.preventDefault(); });
      listen(header, 'drop', event => { event.preventDefault(); move(dragged, columns().indexOf(header)); dragged = undefined; });
      listen(header, 'keydown', event => { if (disabled() || !event.altKey || !['ArrowLeft','ArrowRight'].includes(event.key)) return; event.preventDefault(); const from = columns().indexOf(header), to = from + (event.key === 'ArrowRight' ? 1 : -1); move(from, to); columns()[to]?.focus(); });
      const handle = header.querySelector('[data-ely-forecast-resize]');
      listen(handle, 'pointerdown', event => { if (disabled()) return; event.preventDefault(); const start = event.clientX, width = header.getBoundingClientRect().width; const resize = moveEvent => { header.style.width = `${Math.max(48, width + moveEvent.clientX - start)}px`; }; const stop = event => { document.removeEventListener('pointermove', resize); document.removeEventListener('pointerup', stop); document.removeEventListener('pointercancel', stop); if (event.type !== 'pointercancel') changed(root, { action: 'resize-column', column: columns().indexOf(header), width: header.getBoundingClientRect().width }); }; document.addEventListener('pointermove', resize); document.addEventListener('pointerup', stop, { once: true }); document.addEventListener('pointercancel', stop, { once: true }); abort.signal.addEventListener('abort', () => stop(new Event('pointercancel')), { once: true }); });
    });
  });
  root.querySelectorAll('[data-ely-tree-table-toggle]').forEach(toggle => {
    listen(toggle, 'click', () => {
      const row = toggle.closest('tr');
      const depth = Number(row?.dataset.elyDepth || 0);
      const expanded = toggle.getAttribute('aria-expanded') !== 'false';
      toggle.setAttribute('aria-expanded', String(!expanded));
      toggle.textContent = expanded ? '▸' : '▾';
      let next = row?.nextElementSibling;
      while (next && Number(next.dataset.elyDepth || 0) > depth) {
        if (Number(next.dataset.elyDepth || 0) === depth + 1) next.hidden = expanded;
        next = next.nextElementSibling;
      }
      changed(root, { action: 'tree-disclosure', value: row?.firstElementChild?.textContent.trim(), expanded: !expanded });
    });
  });
  const dashboard = root.querySelector('[data-ely-dashboard]');
  if (dashboard) {
    const tiles = [...dashboard.querySelectorAll('[data-ely-dashboard-tile]')];
    tiles.forEach(tile => {
      const x = Number(tile.dataset.elyX), y = Number(tile.dataset.elyY), w = Number(tile.dataset.elyW), h = Number(tile.dataset.elyH);
      if ([x, y, w, h].every(Number.isFinite) && w > 0 && h > 0) {
        tile.style.gridColumn = `${x + 1} / span ${w}`;
        tile.style.gridRow = `${y + 1} / span ${h}`;
      }
    });
    const layout = () => emit(root, 'dashboard-layout', { tiles: tiles.map(item => ({ key: item.dataset.elyKey, x: Number(item.dataset.elyX), y: Number(item.dataset.elyY), w: Number(item.dataset.elyW), h: Number(item.dataset.elyH) })) });
    let drag;
    listen(dashboard, 'pointerdown', event => {
      const tile = event.target.closest('[data-ely-dashboard-tile]');
      if (!tile || event.target.closest('button,input,select')) return;
      drag = { tile, x: event.clientX, y: event.clientY };
      tile.setPointerCapture?.(event.pointerId);
    });
    listen(dashboard, 'pointerup', event => {
      if (!drag) return;
      const { tile, x, y } = drag;
      const dx = event.clientX - x, dy = event.clientY - y;
      if (Math.abs(dx) + Math.abs(dy) >= 16) {
        tile.dataset.elyX = String(Math.max(0, Number(tile.dataset.elyX) + (Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 1 : -1) : 0)));
        tile.dataset.elyY = String(Math.max(0, Number(tile.dataset.elyY) + (Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? 1 : -1) : 0)));
        tile.style.gridColumn = `${Number(tile.dataset.elyX) + 1} / span ${tile.dataset.elyW}`;
        tile.style.gridRow = `${Number(tile.dataset.elyY) + 1} / span ${tile.dataset.elyH}`;
        layout();
      }
      drag = undefined;
    });
    listen(dashboard, 'click', event => {
      const resize = event.target.closest('[data-ely-dashboard-resize]');
      if (!resize) return;
      const tile = resize.closest('[data-ely-dashboard-tile]');
      tile.dataset.elyW = String(Math.min(12, Number(tile.dataset.elyW) + 1));
      tile.style.gridColumn = `${Number(tile.dataset.elyX) + 1} / span ${tile.dataset.elyW}`;
      layout();
    });
    listen(dashboard, 'keydown', event => {
      const tile = event.target.closest('[data-ely-dashboard-tile]');
      if (!tile || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
      if (Number(tile.dataset.elyW) <= 0 || Number(tile.dataset.elyH) <= 0) return;
      const axis = event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'elyX' : 'elyY';
      const next = Math.max(0, Number(tile.dataset[axis]) + (event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1));
      event.preventDefault();
      tile.dataset[axis] = String(next);
      tile.style[event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'gridColumn' : 'gridRow'] = `${next + 1} / span ${tile.dataset[event.key === 'ArrowLeft' || event.key === 'ArrowRight' ? 'elyW' : 'elyH']}`;
      emit(root, 'dashboard-layout', { tiles: tiles.map(item => ({ key: item.dataset.elyKey, x: Number(item.dataset.elyX), y: Number(item.dataset.elyY), w: Number(item.dataset.elyW), h: Number(item.dataset.elyH) })) });
    });
  }
  root.querySelectorAll('[data-ely-swipe]').forEach(swipe => {
    const content = swipe.querySelector('[data-ely-swipe-content]');
    const close = () => { swipe.setAttribute('aria-expanded', 'false'); content?.style.removeProperty('translate'); };
    const open = () => { swipe.setAttribute('aria-expanded', 'true'); content?.style.setProperty('translate', '-9rem 0'); };
    let start;
    listen(swipe, 'pointerdown', event => { start = event.clientX; swipe.setPointerCapture?.(event.pointerId); });
    listen(swipe, 'pointermove', event => {
      if (start == null || !content) return;
      content.style.translate = `${Math.max(-144, Math.min(0, event.clientX - start))}px 0`;
    });
    listen(swipe, 'pointerup', event => {
      if (start == null) return;
      const distance = event.clientX - start;
      start = undefined;
      if (distance < -72) open(); else close();
      swipe.releasePointerCapture?.(event.pointerId);
    });
    listen(content, 'click', () => {
      if (swipe.getAttribute('aria-expanded') === 'true') close();
      else changed(root, { action: 'activate-item', value: swipe.dataset.value });
    });
    swipe.querySelectorAll('[data-ely-swipe-action]').forEach(action => listen(action, 'click', () => {
      const value = action.dataset.action;
      close();
      const status = root.querySelector('[data-ely-swipe-status]');
      if (status) status.value = `${action.textContent.trim()}d ${swipe.querySelector('strong')?.textContent.trim() || ''}`.trim();
      changed(root, { action: 'swipe-action', value: swipe.dataset.value, swipeAction: value });
    }));
  });
  root.querySelectorAll('[data-ely-virtual]').forEach(viewport => listen(viewport, 'scroll', () => {
    const total = Number(viewport.dataset.elyTotal);
    const rowHeight = 28;
    const start = Math.max(1, Math.floor(viewport.scrollTop / rowHeight) + 1);
    const end = Math.min(total, start + viewport.querySelectorAll('li').length - 1);
    const output = viewport.querySelector('[data-ely-virtual-range]');
    if (output) output.value = `${start}–${end} of ${total}`;
    emit(root, 'virtual-range', { start, end, total });
  }));
  root.querySelectorAll('[data-ely-load-more]').forEach(control => listen(control, 'click', () => {
    const container = control.closest('[data-ely-infinite]');
    if (!container || control.disabled) return;
    container.setAttribute('aria-busy', 'true');
    control.disabled = true;
    control.textContent = 'Loading more…';
    const status = container.querySelector('[data-ely-infinite-status]');
    if (status) status.value = 'Loading more…';
    emit(root, 'load-more', { value: control.value, cursor: control.value });
  }));
  const sortable = root.querySelector('[data-ely-sortable]');
  if (sortable) {
    let dragged;
    listen(sortable, 'dragstart', event => {
      dragged = event.target.closest('[data-ely-sort-item]');
      if (!dragged) return;
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', dragged.textContent);
    });
    listen(sortable, 'dragover', event => {
      const target = event.target.closest('[data-ely-sort-item]');
      if (!dragged || !target || target === dragged) return;
      event.preventDefault();
      const after = event.clientY > target.getBoundingClientRect().top + target.offsetHeight / 2;
      sortable.insertBefore(dragged, after ? target.nextElementSibling : target);
    });
    listen(sortable, 'drop', event => {
      if (!dragged) return;
      event.preventDefault();
      changed(root, { action: 'reorder', values: [...sortable.children].map(item => item.textContent.trim()) });
      dragged = undefined;
    });
    listen(sortable, 'dragend', () => { dragged = undefined; });
  }
  listen(root, 'click', event => {
    const select = event.target.closest('[data-ely-select]');
    if (select && !select.disabled) {
      const list = select.closest('[data-ely-selectable]');
      // A tree node keeps its selection state on the role="treeitem" element,
      // because the button inside it only carries the button role.
      const treeRoot = select.closest('[role="tree"]');
      const scope = treeRoot || list;
      const candidates = scope ? [...scope.querySelectorAll('[data-ely-select]:not(:disabled)')] : [select];
      const owners = candidates.map(item => treeRoot ? item.closest('[role="treeitem"]') || item : item);
      const owner = treeRoot ? select.closest('[role="treeitem"]') || select : select;
      const selected = owners.filter(item => item.getAttribute('aria-selected') === 'true');
      if (list?.getAttribute('aria-multiselectable') === 'true' && event.shiftKey) {
        const state = selectionAnchors.get(list) || { anchor: selected.at(-1) || owner, base: new Set(selected) };
        const from = owners.indexOf(state.anchor), to = owners.indexOf(owner);
        const range = new Set(owners.slice(Math.min(from, to), Math.max(from, to) + 1));
        owners.forEach(item => item.setAttribute('aria-selected', String(state.base.has(item) || range.has(item))));
      } else if (list?.getAttribute('aria-multiselectable') === 'true' && (event.metaKey || event.ctrlKey)) {
        owner.setAttribute('aria-selected', String(owner.getAttribute('aria-selected') !== 'true'));
        selectionAnchors.set(list, { anchor: owner, base: new Set(owners.filter(item => item.getAttribute('aria-selected') === 'true')) });
      } else {
        owners.forEach(item => item.setAttribute('aria-selected', String(item === owner)));
        if (list) selectionAnchors.set(list, { anchor: owner, base: new Set() });
      }
      const value = select.dataset.value || select.value;
      changed(root, { value, values: candidates.filter((item, index) => owners[index].getAttribute('aria-selected') === 'true').map(item => item.dataset.value || item.value) });
      if (select.matches('.ely-data__outline button')) emit(root, 'select-heading', { headingId: select.dataset.elyHeadingId || value });
      // The tree specimen reports the picked node in its status output.
      const tree = select.closest('.ely-data__tree-wrap');
      const treeStatus = tree?.querySelector('[data-ely-tree-selected]');
      if (treeStatus) treeStatus.value = nodeLabel(select);
    }
    const listItem = event.target.closest('[data-ely-list-item]');
    if (listItem && !listItem.matches('[data-ely-select]') && !listItem.disabled) changed(root, { action: 'activate-item', value: listItem.dataset.value });
    const move = event.target.closest('[data-ely-move]');
    if (move && !move.disabled) {
      const item = move.closest('[data-ely-sort-item]');
      const next = item?.nextElementSibling;
      if (item && next) item.parentElement.insertBefore(next, item);
      changed(root, { action: 'reorder' });
    }
    const pin = event.target.closest('[data-ely-pin]');
    if (pin) {
      const cells = [...root.querySelectorAll('[data-ely-pinning] tr > :first-child')];
      const active = pin.getAttribute('aria-pressed') !== 'true';
      cells.forEach(cell => { cell.style.position = active ? 'sticky' : ''; cell.style.left = active ? '0' : ''; });
      pin.setAttribute('aria-pressed', String(active));
      changed(root, { action: 'pin-column', pinned: active });
    }
    const dismiss = event.target.closest('[data-ely-dismiss]');
    if (dismiss && !dismiss.disabled) {
      const alert = dismiss.closest('[data-ely-alert]');
      if (alert) {
        alert.dataset.elyAlertState = 'acknowledged';
        alert.querySelector('[data-ely-alert-status]').textContent = 'Acknowledged';
        dismiss.remove();
        emit(root, 'acknowledge', { value: alert.dataset.elyAlertKey });
      }
    }
    const drawing = event.target.closest('[data-ely-drawing]');
    if (drawing) {
      root.querySelectorAll('[data-ely-drawing]').forEach(tool => tool.setAttribute('aria-pressed', String(tool === drawing)));
      changed(root, { action: 'drawing-tool', value: drawing.value });
    }
    const range = event.target.closest('[data-ely-range-select]');
    if (range) emit(root, 'range', { value: range.value });
    const kind = event.target.closest('[data-ely-event-kind]');
    if (kind) {
      kind.setAttribute('aria-pressed', String(kind.getAttribute('aria-pressed') !== 'true'));
      const visible = new Set([...root.querySelectorAll('[data-ely-event-kind][aria-pressed="true"]')].map(button => button.dataset.elyEventKind));
      root.querySelectorAll('[data-ely-event-kind-row]').forEach(row => { row.hidden = visible.size > 0 && !visible.has(row.dataset.elyEventKindRow); });
      changed(root, { action: 'event-filter', kinds: [...visible] });
    }
    const pause = event.target.closest('[data-ely-event-pause]');
    if (pause) {
      const paused = pause.getAttribute('aria-pressed') !== 'true';
      pause.setAttribute('aria-pressed', String(paused));
      pause.textContent = paused ? 'Resume' : 'Pause';
      changed(root, { action: 'event-pause', paused });
      if (!paused) pause.closest('.ely-data__events')?.dispatchEvent(new Event('eventstream-resume'));
    }
    const edit = event.target.closest('[data-ely-row-edit]');
    if (edit) {
      const row = edit.closest('tr'), form = row?.nextElementSibling;
      if (form) { form.hidden = false; form.querySelector('input[name="value"]')?.focus(); }
    }
    const cancel = event.target.closest('[data-ely-row-cancel]');
    if (cancel) cancel.closest('[data-ely-row-form]').hidden = true;
    if (event.target.closest('[data-ely-realtime]')) {
      emit(root, 'sample-request', { samples: Number(root.querySelector('[data-ely-samples]')?.value || 0) });
    }
    if (event.target.closest('[data-ely-sort]')) {
      const body = root.querySelector('tbody');
      if (body) [...body.rows].sort((a, b) => a.textContent.localeCompare(b.textContent)).forEach(row => body.append(row));
      changed(root, { action: 'sort' });
    }
  });
  listen(root, 'dblclick', event => {
    const row = event.target.closest('[data-ely-row-key]');
    const form = row?.nextElementSibling;
    if (form?.matches('[data-ely-row-form]')) { form.hidden = false; form.querySelector('input[name="value"]')?.focus(); }
    const node = event.target.closest('.ely-data__file-tree [data-ely-tree-node]');
    if (node) openFile(node);
  });
  listen(root, 'input', event => {
    const converter = event.target.closest('[data-ely-converter]');
    if (converter) updateConverter(converter);
    const fileFilter = event.target.closest('[data-ely-file-filter]');
    if (fileFilter) {
      const query = fileFilter.value.trim().toLocaleLowerCase();
      root.querySelectorAll('.ely-data__file-tree li').forEach(item => {
        item.hidden = Boolean(query) && !item.textContent.toLocaleLowerCase().includes(query);
      });
      changed(root, { action: 'file-filter', value: fileFilter.value });
    }
    if (event.target.matches('[data-ely-grid-cell]')) changed(root, { action: 'grid-edit', value: event.target.textContent });
    if (event.target.matches('[data-ely-range]')) {
      const out = root.querySelector('[data-ely-range-value]');
      if (out) out.value = event.target.value;
      const comparison = root.querySelector('[data-ely-before-after]');
      const pane = comparison?.querySelector('[data-ely-before-pane]');
      const divider = comparison?.querySelector('[data-ely-before-divider]');
      if (pane && divider) {
        pane.style.width = `${event.target.value}%`;
        const image = pane.querySelector('img');
        if (image && comparison.clientWidth) image.style.width = `${comparison.clientWidth}px`;
        divider.style.left = `${event.target.value}%`;
        divider.setAttribute('aria-valuenow', event.target.value);
      } else {
        const after = root.querySelector('[data-ely-after-image]');
        if (after) after.style.clipPath = `inset(0 0 0 ${event.target.value}%)`;
      }
      emit(root, 'compare', { value: event.target.value });
    }
    if (event.target.matches('[data-ely-filter]')) {
      const query = event.target.value.trim().toLocaleLowerCase();
      visibleRows(root).forEach(row => { row.hidden = Boolean(query) && !row.textContent.toLocaleLowerCase().includes(query); });
      changed(root, { value: event.target.value });
    }
    if (event.target.matches('[data-ely-symbol-search]')) {
      const query = event.target.value.trim().toLocaleLowerCase();
      const panel = event.target.closest('.ely-data__symbol-controls');
      panel?.querySelectorAll('[data-ely-symbol-add]').forEach(button => {
        button.hidden = Boolean(query) && !button.textContent.toLocaleLowerCase().includes(query);
      });
      changed(root, { action: 'symbol-search', value: event.target.value });
    }
    if (event.target.matches('[data-ely-column]')) {
      const column = [...root.querySelectorAll('.ely-data__table th')].findIndex(cell => cell.textContent.trim() === event.target.value);
      if (column >= 0) root.querySelectorAll('.ely-data__table tr').forEach(row => row.cells[column].hidden = !event.target.checked);
      changed(root, { action: 'column', value: event.target.value, checked: event.target.checked });
    }
    if (event.target.matches('[data-ely-pivot-measure]')) {
      root.querySelectorAll('[data-ely-pivot-rows]').forEach(panel => { panel.hidden = panel.dataset.elyPivotRows !== event.target.value; });
      changed(root, { action: 'pivot-measure', measure: event.target.value });
    }
  });
  listen(root, 'change', event => {
    const converter = event.target.closest('[data-ely-converter]');
    if (converter) updateConverter(converter);
    const checkbox = event.target.closest('[data-ely-checkbox-node]');
    if (checkbox) {
      const node = checkbox.closest('li');
      node?.querySelectorAll('ul input[type="checkbox"]:not(:disabled)').forEach(child => { child.checked = checkbox.checked; child.indeterminate = false; });
      let parent = node?.parentElement.closest('li');
      while (parent) {
        const own = parent.querySelector(':scope > label input[type="checkbox"], :scope > details > summary > label input[type="checkbox"]');
        const descendants = [...parent.querySelectorAll('ul input[type="checkbox"]:not(:disabled)')];
        if (own && descendants.length) {
          own.checked = descendants.every(child => child.checked);
          own.indeterminate = !own.checked && descendants.some(child => child.checked || child.indeterminate);
        }
        parent = parent.parentElement.closest('li');
      }
      changed(root, { action: 'tree-check', value: checkbox.value, checked: checkbox.checked });
    }
    const filter = event.target.closest('[data-ely-dashboard-filter], [data-ely-dashboard-refresh]');
    if (filter) emit(root, 'dashboard-filter', { name: filter.name, value: filter.value });
  });
  listen(root, 'keydown', event => {
    if (event.target.matches('.ely-data__outline button')) {
      const nodes = [...event.target.closest('.ely-data__outline').querySelectorAll('button:not(:disabled)')];
      const at = nodes.indexOf(event.target);
      const next = event.key === 'Home' ? nodes[0] : event.key === 'End' ? nodes[nodes.length - 1] : ['ArrowUp', 'ArrowDown'].includes(event.key) ? nodes[at + (event.key === 'ArrowDown' ? 1 : -1)] : event.key.length === 1 ? nodes.find(node => node.textContent.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())) : null;
      if (next) { event.preventDefault(); next.focus(); return; }
      if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault();
        event.target.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        return;
      }
    }
    if (event.target.matches('[data-ely-tree-node]')) {
      const nodes = [...root.querySelectorAll('[data-ely-tree-node]')];
      const at = nodes.indexOf(event.target);
      const details = event.target.closest('details');
      // Enter opens a file in the file-tree specimen.
      if (event.key === 'Enter' && event.target.closest('.ely-data__file-tree')) { openFile(event.target); return; }
      if (event.key === 'ArrowRight' && details && !details.open) { event.preventDefault(); details.open = true; return; }
      if (event.key === 'ArrowLeft' && details?.open) { event.preventDefault(); details.open = false; return; }
      const next = event.key === 'Home' ? nodes[0] : event.key === 'End' ? nodes.at(-1) : ['ArrowUp', 'ArrowDown'].includes(event.key) ? nodes[at + (event.key === 'ArrowDown' ? 1 : -1)] : event.key.length === 1 ? nodes.find(node => node.textContent.trim().toLocaleLowerCase().startsWith(event.key.toLocaleLowerCase())) : null;
      if (next) { event.preventDefault(); next.focus(); }
    }
    if (event.target.matches('[role="option"]')) {
      const options = [...event.target.closest('[role="listbox"]').querySelectorAll('[role="option"]:not(:disabled)')];
      if ((event.metaKey || event.ctrlKey) && event.key.toLocaleLowerCase() === 'a') {
        event.preventDefault();
        options.forEach(option => option.setAttribute('aria-selected', 'true'));
        changed(root, { values: options.map(option => option.dataset.value || option.value) });
        return;
      }
      if (['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
        const current = options.indexOf(event.target);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? options.length - 1 : current + (event.key === 'ArrowDown' ? 1 : -1);
        if (options[next]) {
          event.preventDefault();
          options[next].focus();
          options[next].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey }));
        }
      } else if (event.key === ' ' || event.key === 'Enter') {
        event.preventDefault(); event.target.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, metaKey: event.metaKey }));
      } else if (event.key.length === 1 && !event.altKey && !event.ctrlKey && !event.metaKey) {
        const list = event.target.closest('[role="listbox"]');
        const previous = typeAheadStates.get(list);
        const now = Date.now();
        const key = event.key.toLocaleLowerCase();
        const query = previous && now - previous.at < 700 ? previous.query + key : key;
        const typeahead = item => (item.dataset.elyTypeahead || item.textContent).trim().toLocaleLowerCase();
        const matches = options.filter(item => typeahead(item).startsWith(query));
        const candidates = matches.length ? matches : options.filter(item => typeahead(item).startsWith(key));
        if (candidates.length) {
          event.preventDefault();
          const at = candidates.indexOf(event.target);
          const match = candidates[(at + 1) % candidates.length];
          typeAheadStates.set(list, { query: matches.length ? query : key, at: now });
          match.focus();
          match.dispatchEvent(new MouseEvent('click', { bubbles: true }));
        }
      }
    }
    if (event.target.matches('[data-ely-grid-cell]')) {
      const cells = [...root.querySelectorAll('[data-ely-grid-cell]')], at = cells.indexOf(event.target);
      const next = event.key === 'ArrowLeft' ? cells[at - 1] : event.key === 'ArrowRight' ? cells[at + 1] : null;
      if (next) { event.preventDefault(); next.focus(); return; }
      if (event.key === 'Delete') { event.preventDefault(); event.target.textContent = ''; changed(root, { action: 'grid-edit', value: '' }); return; }
    }
    if (event.key === 'Escape' && event.target.matches('[data-ely-row-form] input[name="value"]')) { event.preventDefault(); event.target.closest('[data-ely-row-form]').hidden = true; return; }
    if (event.key === 'Enter' && event.target.matches('[data-ely-row-form] input[name="value"]')) { event.preventDefault(); event.target.closest('form').requestSubmit(); return; }
    if (!event.altKey || !event.target.closest('[data-ely-sort-item]') || !['ArrowUp', 'ArrowDown'].includes(event.key)) return;
    const item = event.target.closest('[data-ely-sort-item]');
    const sibling = event.key === 'ArrowUp' ? item.previousElementSibling : item.nextElementSibling;
    if (!sibling) return;
    event.preventDefault();
    item.parentElement.insertBefore(item, event.key === 'ArrowUp' ? sibling : sibling.nextElementSibling);
    changed(root, { action: 'reorder' });
  });
  const applySamples = event => {
    if (event.target !== root) return;
    const detail = event.detail || {};
    const line = root.querySelector('[data-ely-chart] .ely-data__line, .ely-data__chart .ely-data__line');
    const samples = root.querySelector('[data-ely-samples]');
    if (typeof detail.points === 'string' && line) line.setAttribute('points', detail.points);
    if (detail.samples != null && samples) samples.value = String(detail.samples);
    changed(root, { action: 'samples', points: detail.points, samples: detail.samples });
  };
  listen(root, 'ely:data', applySamples);
  listen(root, 'ely:samples', applySamples);
  listen(root, 'ely:data', event => {
    if (event.target !== root || !event.detail?.measure) return;
    root.querySelectorAll('[data-ely-pivot-rows]').forEach(panel => { panel.hidden = panel.dataset.elyPivotRows !== event.detail.measure; });
  });
  const drawing = root.querySelector('svg[data-ely-drawing-surface]');
  if (drawing) {
    let points = [];
    const toPoint = event => {
      const box = drawing.getBoundingClientRect();
      return [Math.round((event.clientX - box.left) * 320 / box.width), Math.round((event.clientY - box.top) * 120 / box.height)];
    };
    const finish = () => {
      if (points.length < 2) return;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
      line.classList.add('ely-data__drawing-path');
      line.setAttribute('points', points.map(point => point.join(',')).join(' '));
      drawing.append(line);
      changed(root, { action: 'draw', paths: [...drawing.querySelectorAll('.ely-data__drawing-path')].map(path => path.getAttribute('points')) });
      points = [];
    };
    listen(drawing, 'pointerdown', event => { if (root.querySelector('[data-ely-drawing][aria-pressed="true"]')?.value === 'erase') { drawing.querySelector('.ely-data__drawing-path:last-of-type')?.remove(); changed(root, { action: 'erase' }); return; } points = [toPoint(event)]; if(event.isTrusted)drawing.setPointerCapture(event.pointerId); });
    listen(drawing, 'pointermove', event => { if (points.length) points.push(toPoint(event)); });
    listen(drawing, 'pointerup', finish);
  }
  root.querySelectorAll('[data-ely-leverage]').forEach(panel => {
    const range = panel.querySelector('[data-ely-range]');
    const margin = panel.querySelector('[data-ely-margin-value]');
    const meter = panel.querySelector('[data-ely-margin-meter]');
    const risk = panel.querySelector('[data-ely-risk-value]');
    const update = () => {
      const leverage = Math.max(1, Number(range?.value) || 1);
      const used = Math.min(96000, Math.round(21500 * leverage / 5));
      const score = Math.min(100, Math.round(leverage * .9 + 8));
      if (margin) margin.textContent = `$${used.toLocaleString('en-US')} of $96,000`;
      if (meter) meter.value = used / 960;
      if (risk) risk.value = String(score);
      changed(root, { action: 'leverage', value: leverage, risk: score });
    };
    listen(range, 'input', update); update();
  });
  listen(root, 'click', event => {
    const item = event.target.closest('[data-ely-news-open]');
    if (!item || !root.contains(item)) return;
    const stories = [...root.querySelectorAll('[data-ely-news-open]')];
    stories.forEach(button => button.removeAttribute('aria-current'));
    item.setAttribute('aria-current', 'true');
    const value = item.dataset.value || String(stories.indexOf(item));
    changed(root, { action: 'news-open', value });
    emit(root, 'news-open', { value });
  });
  root.querySelectorAll('[data-ely-order-entry]').forEach(panel => {
    const form = panel.querySelector('form');
    const sideButtons = [...panel.querySelectorAll('[data-ely-order-side]')];
    const kindButtons = [...panel.querySelectorAll('[data-ely-order-kind]')];
    const submit = panel.querySelector('[data-ely-order-submit]');
    const quantity = form?.elements.quantity;
    const symbol = form?.elements.symbol;
    const price = form?.elements.price;
    const value = panel.querySelector('[data-ely-order-value]');
    let side = sideButtons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.elyOrderSide || 'buy';
    let kind = kindButtons.find(button => button.getAttribute('aria-pressed') === 'true')?.dataset.elyOrderKind || 'limit';
    const sync = () => {
      const amount = Number(quantity?.value) * Number(price?.value);
      if (value && Number.isFinite(amount)) value.textContent = `Value $${amount.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      if (submit) submit.textContent = `${side[0].toUpperCase() + side.slice(1)} ${quantity?.value || 0} ${symbol?.value || ''} ${kind === 'market' ? 'at market' : `at $${price?.value || '0'}`}`;
    };
    sideButtons.forEach(button => listen(button, 'click', () => { side = button.dataset.elyOrderSide || side; sideButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button))); sync(); changed(root, { action: 'order-side', value: side }); }));
    kindButtons.forEach(button => listen(button, 'click', () => { kind = button.dataset.elyOrderKind || kind; kindButtons.forEach(item => item.setAttribute('aria-pressed', String(item === button))); if (price) price.disabled = kind === 'market'; sync(); changed(root, { action: 'order-kind', value: kind }); }));
    listen(form, 'input', sync); sync();
  });
  root.querySelectorAll('[data-ely-symbol-add]').forEach(button => listen(button, 'click', () => {
    const watchlist = button.closest('.ely-data__watchlist');
    const status = watchlist?.querySelector('[data-ely-watching]');
    if (status) status.value = `Watching ${button.value}.`;
    changed(root, { action: 'watch-symbol', value: button.value });
  }));
  return () => {
    abort.abort();
    virtualCleanups.forEach(cleanup => cleanup());
    root.querySelectorAll('[data-ely-selectable]').forEach(list => { selectionAnchors.delete(list); typeAheadStates.delete(list); });
  };
});
