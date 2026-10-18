// Pure file-view rules shared by the workspace UI and its focused checks.
export function fileIconName(name, folder = false, open = false) {
  if (folder) return open ? 'folder-open' : 'folder';
  const extension = name.toLowerCase().split('.').slice(1).pop() || '';
  const groups = {
    'file-code': ['rs','go','js','ts','tsx','jsx','py','rb','c','h','cpp','java','swift','html','css','sql'],
    'file-text': ['md','txt','pdf','doc','docx','rtf'], 'file-terminal': ['sh','bash','zsh','bat','ps1'],
    'file-cog': ['toml','yaml','yml','ini','conf'], 'file-json': ['json','jsonc'],
    'file-image': ['png','jpg','jpeg','gif','webp','svg','avif'], 'file-audio': ['mp3','wav','m4a','flac','ogg'],
    'file-video-camera': ['mov','mp4','webm','mkv'], 'file-archive': ['zip','tar','gz','7z','rar'],
    'file-spreadsheet': ['csv','xls','xlsx','tsv'], 'file-type': ['ttf','otf','woff','woff2'],
  };
  return Object.keys(groups).find(icon => groups[icon].includes(extension)) || 'file';
}

export function fileGridStep(at, count, columns, key) {
  if (!count) return -1;
  if (at < 0) return key === 'End' ? count - 1 : 0;
  const last = count - 1;
  if (key === 'Home') return 0;
  if (key === 'End') return last;
  if (key === 'ArrowLeft') return Math.max(0, at - 1);
  if (key === 'ArrowRight') return Math.min(last, at + 1);
  if (key === 'ArrowUp') return at >= columns ? at - columns : at;
  if (key === 'ArrowDown') return Math.floor(at / columns) < Math.floor(last / columns) ? Math.min(last, at + columns) : at;
  return at;
}

export function compareFileEntries(a, b, key = 'name', ascending = true) {
  const folders = Number(b.folder) - Number(a.folder);
  const byName = a.name.toLowerCase().localeCompare(b.name.toLowerCase());
  const chosen = key === 'name' ? byName : Number(a[key] || 0) - Number(b[key] || 0);
  return folders || (ascending ? chosen : -chosen) || byName;
}

export function acceptsFile(file, accept) {
  const rules = accept.toLowerCase().split(',').map(rule => rule.trim()).filter(Boolean);
  return !rules.length || rules.some(rule => rule.startsWith('.') ? file.name.toLowerCase().endsWith(rule) : rule.endsWith('/*') ? file.type.toLowerCase().startsWith(rule.slice(0, -1)) : file.type.toLowerCase() === rule);
}

const amount = value => Number.isFinite(Number(value)) ? Math.max(0, Number(value)) : 0;
export function fileSize(bytes) {
  let value = amount(bytes), unit = 0;
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  while (value >= 1000 && unit < units.length - 1) { value /= 1000; unit++; }
  if (!unit) return value + ' B';
  const shown = value.toFixed(value < 10 ? 1 : 0);
  return Number(shown) >= 1000 && unit < units.length - 1 ? '1.0 ' + units[unit + 1] : shown + ' ' + units[unit];
}
export const archiveSaving = (size, packed) => amount(size) ? Math.round((1 - Math.min(amount(packed), amount(size)) / amount(size)) * 100) : 0;
export function archiveTree(entries) {
  const tree = {children: [], size: 0, packed: 0};
  for (const entry of entries) {
    const parts = entry.path.split('/').filter(Boolean);
    if (!parts.length) continue;
    let parent = tree, path = '';
    parts.forEach((name, index) => {
      path += (path ? '/' : '') + name;
      let node = parent.children.find(child => child.name === name);
      if (!node) { node = {name, path, folder: index < parts.length - 1, children: [], size: 0, packed: 0}; parent.children.push(node); }
      parent = node;
    });
    parent.size = amount(entry.size); parent.packed = amount(entry.packed);
  }
  const sum = node => {
    if (node.children.length) {
      node.children.sort((a, b) => compareFileEntries(a, b)); node.children.forEach(sum);
      node.size = node.children.reduce((total, child) => total + child.size, 0);
      node.packed = node.children.reduce((total, child) => total + child.packed, 0);
    }
  };
  sum(tree); return tree;
}
export function recentGroups(files, now = new Date(), zone) {
  let date, clock, label;
  try {
    const options = zone ? {timeZone: zone} : {};
    date = new Intl.DateTimeFormat('en-CA', {...options, year: 'numeric', month: '2-digit', day: '2-digit'});
    clock = new Intl.DateTimeFormat('en-GB', {...options, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'});
    label = new Intl.DateTimeFormat('en-US', {...options, weekday: 'long', month: 'long', day: 'numeric'});
  } catch { return recentGroups(files, now); }
  const day = value => Object.fromEntries(date.formatToParts(value).map(part => [part.type, part.value]));
  const key = value => { const d = day(value); return `${d.year}-${d.month}-${d.day}`; };
  const today = key(now), d = day(now), yesterday = new Date(Date.UTC(Number(d.year), Number(d.month) - 1, Number(d.day) - 1)).toISOString().slice(0, 10);
  const groups = [];
  [...files].sort((a, b) => Date.parse(b.opened) - Date.parse(a.opened)).forEach(file => {
    const opened = new Date(file.opened); if (!Number.isFinite(opened.getTime())) return;
    const stamp = key(opened);
    let group = groups.find(group => group.key === stamp);
    if (!group) { group = {key: stamp, label: stamp === today ? 'Today' : stamp === yesterday ? 'Yesterday' : label.format(opened), files: []}; groups.push(group); }
    group.files.push({...file, time: clock.format(opened)});
  });
  return groups;
}
export function duplicateMarks(groups) {
  return groups.map(group => {
    const all = group.paths.every(path => path.marked);
    const paths = group.paths.map(path => ({...path, marked: all ? false : Boolean(path.marked)}));
    const left = paths.filter(path => !path.marked).length;
    return {...group, paths: paths.map(path => ({...path, locked: !path.marked && left <= 1}))};
  });
}
const duration = seconds => {
  const n = Math.max(1, Math.floor(seconds)), days = Math.floor(n / 86400), hours = Math.floor(n / 3600) % 24, minutes = Math.floor(n / 60) % 60;
  return days ? `${days}d ${hours}h` : hours ? `${hours}h ${minutes}m` : minutes ? `${minutes}m ${n % 60}s` : `${n}s`;
};
export function transferText(t, operation = false) {
  const moved = fileSize(t.moved), total = fileSize(t.total), rate = amount(t.rate), left = duration(Math.max(0, amount(t.total) - amount(t.moved)) / (rate || 1));
  if (t.state === 'failed') return (operation ? '' : 'Failed: ') + (t.error || 'Unknown error');
  if (t.state === 'done') return total;
  if (t.state === 'moving' && rate) return `${moved} of ${total} · ${operation ? '' : fileSize(rate) + '/s · '}${left} left`;
  if (operation) return `${moved} of ${total}`;
  if (t.state === 'queued') return `Waiting · ${total}`;
  return `${t.state === 'paused' ? 'Paused at ' : ''}${moved} of ${total}`;
}
export function operationHeadline(o) {
  const move = o.operation?.toLowerCase() === 'move', verb = o.state === 'done' ? (move ? 'Moved' : 'Copied') : (move ? 'Moving' : 'Copying');
  return `${verb} ${o.count} ${Number(o.count) === 1 ? 'item' : 'items'} to ${o.to}${o.state === 'queued' ? ' next' : o.state === 'paused' ? ', paused' : o.state === 'failed' ? ' stopped' : ''}`;
}
export function hexReading(bytes, at) {
  const byte = bytes[at]; if (byte === undefined) return '';
  const parts = ['0x' + byte.toString(16).toUpperCase().padStart(2, '0'), String(byte), 'i8 ' + (byte < 128 ? byte : byte - 256), '0b' + byte.toString(2).padStart(8, '0')];
  if (at + 2 <= bytes.length) parts.push('u16 ' + (byte + bytes[at + 1] * 256));
  if (at + 4 <= bytes.length) parts.push('u32 ' + bytes.slice(at, at + 4).reduce((sum, value, i) => sum + value * 256 ** i, 0));
  return parts.join(' · ');
}

export function hexRows(bytes, base = 0) {
  const start = BigInt(base), digits = Math.max(8, (start + BigInt(Math.max(0, bytes.length - 1))).toString(16).length), rows = [];
  for (let at = 0; at < bytes.length; at += 16) rows.push({address: (start + BigInt(at)).toString(16).toUpperCase().padStart(digits, '0'), cells: bytes.slice(at, at + 16).map((byte, offset) => ({index: at + offset, hex: byte.toString(16).toUpperCase().padStart(2, '0'), glyph: byte >= 32 && byte <= 126 ? String.fromCharCode(byte) : '·', reading: hexReading(bytes, at + offset)}))});
  return rows;
}

// Bind only opt-in file contracts. Legacy document, editor and debug views retain their handlers.
export function bindWorkspaceFileDetails(root, {onRoot, emit, paintFileIcons}) {
  if (!root.dataset.elyComponent.startsWith('files/')) return;
  const disabled = root.dataset.elyDisabled === 'true';
  const node = (tag, text) => { const el = document.createElement(tag); if (text !== undefined) el.textContent = text; return el; };
  root.querySelectorAll('[data-ws-file-size]').forEach(el => { el.textContent = fileSize(el.dataset.wsFileSize); });
  const recent = root.querySelector('[data-ws-recent-files]');
  if (recent) {
    const entries = [...recent.querySelectorAll('[data-ws-recent-file]')].filter(el => Number.isFinite(Date.parse(el.dataset.opened)));
    if (entries.length) {
      const now = recent.dataset.now && Number.isFinite(Date.parse(recent.dataset.now)) ? new Date(recent.dataset.now) : new Date();
      const groups = recentGroups(entries.map(el => ({el, opened: el.dataset.opened})), now, recent.dataset.zone);
      const legacy = recent.querySelector('ol');
      groups.forEach(group => { const section = node('section'), title = node('h3', group.label), list = node('ol'); list.setAttribute('role', 'listbox'); list.setAttribute('aria-label', group.label); section.append(title, list); group.files.forEach(file => { file.el.querySelector('time').textContent = file.time; list.append(file.el); }); recent.insertBefore(section, legacy); });
      if (!legacy.children.length) legacy.remove();
    }
  }
  const search = root.querySelector('[data-ws-file-search]');
  const refreshSearch = (pending = false) => {
    if (!search) return;
    const query = search.querySelector('input').value.trim(), list = search.querySelector('ul'), count = list.children.length;
    list.hidden = !query || pending;
    search.querySelector('output').textContent = !query ? 'Type a name to search.' : pending ? 'Searching…' : count ? `${count} ${count === 1 ? 'file' : 'files'}` : `No files match “${query}”.`;
  };
  refreshSearch();
  onRoot('input', event => { if (event.target.matches('[data-ws-file-query]') && !disabled) { refreshSearch(true); emit('search-files', {query: event.target.value}); } });
  root.querySelectorAll('[data-ws-recent-files] ol,[data-ws-file-results]').forEach(list => list.querySelectorAll('[data-ws-file-result]').forEach((button, i) => { button.tabIndex = disabled || i ? -1 : 0; }));
  const selected = button => {
    const list = button.closest('ol,ul'); list.querySelectorAll('[data-ws-file-result]').forEach(row => { row.setAttribute('aria-selected', String(row === button)); row.tabIndex = row === button ? 0 : -1; });
  };
  onRoot('click', event => { const button = event.target.closest('[data-ws-file-result]'); if (button && !button.disabled) selected(button); });
  onRoot('dblclick', event => { const button = event.target.closest('[data-ws-file-result]'); if (button && !button.disabled) emit('open-file', {path: button.dataset.path}); });
  onRoot('keydown', event => {
    const button = event.target.closest('[data-ws-file-result]'); if (!button || button.disabled) return;
    if (event.key === 'Enter') { event.preventDefault(); emit('open-file', {path: button.dataset.path}); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const rows = [...button.closest('ol,ul').querySelectorAll('[data-ws-file-result]')], next = rows[fileGridStep(rows.indexOf(button), rows.length, 1, event.key)]; selected(next); next.focus(); }
  });
  const duplicates = root.querySelector('[data-ws-duplicate-sets]');
  const refreshDuplicates = () => {
    if (!duplicates) return;
    let freed = 0, count = 0;
    const groups = [...duplicates.querySelectorAll('[data-ws-duplicate-set]')].map(el => ({el, paths: [...el.querySelectorAll('input')].map(input => ({input, marked: input.checked}))}));
    duplicateMarks(groups).forEach(group => group.paths.forEach(path => { path.input.checked = path.marked; path.input.disabled = disabled || path.locked; if (path.marked) { count++; freed += amount(group.el.dataset.bytes); } }));
    duplicates.querySelector('output').textContent = fileSize(freed) + ' to free'; duplicates.querySelector('[data-ws-remove-marked]').disabled = disabled || !count;
  };
  refreshDuplicates();
  onRoot('change', event => { if (event.target.matches('[data-ws-duplicate-mark]') && !disabled) { refreshDuplicates(); emit('mark-duplicate', {path: event.target.value, marked: event.target.checked}); } });
  onRoot('click', event => { const button = event.target.closest('[data-ws-remove-marked]'); if (button && !button.disabled) emit('remove-duplicates', {paths: [...duplicates.querySelectorAll('input:checked')].map(input => input.value)}); });
  const archive = root.querySelector('[data-ws-archive]');
  if (archive) {
    const entries = [...archive.querySelectorAll('[data-ws-archive-entry]')].map(el => ({...el.dataset, path: el.dataset.path})), tree = archiveTree(entries), list = archive.querySelector('[data-ws-archive-tree]');
    list.replaceChildren(); list.setAttribute('role', 'tree'); list.setAttribute('aria-label', 'Archive entries');
    archive.querySelector('output').textContent = `${entries.length} ${entries.length === 1 ? 'file' : 'files'} · ${fileSize(tree.size)} · ${archiveSaving(tree.size, tree.packed)}% smaller`;
    const render = (items, ul, depth) => items.forEach(item => {
      const li = node('li'), button = node('button'), icon = node('span'), name = node('span', item.name), note = node('small', fileSize(item.size) + (item.folder ? '' : ` · ${archiveSaving(item.size, item.packed)}%`));
      button.type = 'button'; button.disabled = disabled; button.tabIndex = -1; button.setAttribute('role', 'treeitem'); button.setAttribute('aria-level', String(depth + 1)); li.setAttribute('role', 'none'); button.dataset.wsArchiveNode = item.path; button.dataset.folder = String(item.folder); button.setAttribute('aria-selected', 'false');
      icon.className = 'ely-workspace__file-icon'; icon.dataset.wsFileIcon = ''; icon.dataset.name = item.name; icon.dataset.folder = String(item.folder);
      button.append(icon, name, note); li.append(button); ul.append(li);
      if (item.folder) { button.setAttribute('aria-expanded', String(depth === 0)); const children = node('ul'); children.setAttribute('role', 'group'); children.hidden = depth > 0; li.append(children); render(item.children, children, depth + 1); }
    });
    render(tree.children, list, 0); paintFileIcons(archive); const first = list.querySelector('button'); if (first && !disabled) first.tabIndex = 0;
  }
  onRoot('focusin', event => { const button = event.target.closest('[data-ws-archive-node]'); if (button && !button.disabled) archive.querySelectorAll('button').forEach(row => { row.tabIndex = row === button ? 0 : -1; row.setAttribute('aria-selected', String(row === button)); }); });
  const activateArchive = button => {
    if (button.dataset.folder === 'true') { const list = button.nextElementSibling; list.hidden = !list.hidden; button.setAttribute('aria-expanded', String(!list.hidden)); }
    else emit('open-archive-entry', {path: button.dataset.wsArchiveNode});
  };
  onRoot('click', event => { const button = event.target.closest('[data-ws-archive-node]'); if (!button || button.disabled) return; archive.querySelectorAll('button').forEach(row => { row.tabIndex = row === button ? 0 : -1; row.setAttribute('aria-selected', String(row === button)); }); if (button.dataset.folder === 'true') activateArchive(button); });
  onRoot('dblclick', event => { const button = event.target.closest('[data-ws-archive-node][data-folder="false"]'); if (button && !button.disabled) activateArchive(button); });
  onRoot('keydown', event => {
    const button = event.target.closest('[data-ws-archive-node]'); if (!button || button.disabled) return;
    if (event.key === 'Enter') { event.preventDefault(); activateArchive(button); }
    if (event.key === 'ArrowRight' && button.dataset.folder === 'true') { event.preventDefault(); if (button.nextElementSibling.hidden) activateArchive(button); else button.nextElementSibling.querySelector('button')?.focus(); }
    if (event.key === 'ArrowLeft') { event.preventDefault(); if (button.getAttribute('aria-expanded') === 'true') activateArchive(button); else button.parentElement.parentElement.closest('li')?.querySelector('button')?.focus(); }
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) { event.preventDefault(); const rows = [...archive.querySelectorAll('button')].filter(el => !el.closest('[hidden]')); rows[fileGridStep(rows.indexOf(button), rows.length, 1, event.key)]?.focus(); }
  });
  root.querySelectorAll('[data-ws-transfer]').forEach(row => { row.querySelector('[data-ws-transfer-status]').textContent = transferText(row.dataset); });
  root.querySelectorAll('[data-ws-operation]').forEach(row => { row.querySelector('[data-ws-operation-title]').textContent = operationHeadline(row.dataset); row.querySelector('[data-ws-operation-detail]').textContent = transferText(row.dataset, true); });
  const transfers = root.querySelector('[data-ws-transfers]');
  if (transfers) {
    const rows = [...transfers.querySelectorAll('[data-ws-transfer]')], tally = transfers.querySelector('[data-ws-transfer-tally]'), finished = transfers.querySelector('[data-ws-downloads-finished]');
    if (tally) tally.textContent = `${rows.filter(row => row.dataset.state === 'moving').length} moving · ${rows.filter(row => ['queued', 'paused'].includes(row.dataset.state)).length} waiting`;
    if (finished) finished.hidden = !rows.some(row => row.dataset.state === 'done');
    onRoot('click', event => { const button = event.target.closest('[data-ws-clear-downloads]'); if (button && !button.disabled) emit('clear-downloads', {ids: rows.filter(row => row.dataset.state === 'done').map(row => row.dataset.wsTransfer)}); });
  }
  const hex = root.querySelector('[data-ws-hex]');
  if (hex && hex.querySelector('[data-ws-byte]')) {
    const bytes = [...hex.querySelectorAll('[data-ws-byte]')].map(el => parseInt(el.textContent, 16)), table = hex.querySelector('table'), body = table.tBodies[0];
    const base = BigInt('0x' + body.rows[0].cells[0].textContent);
    const begin = Number(hex.dataset.selectedStart), end = Number(hex.dataset.selectedEnd), hasSelection = hex.dataset.selectedStart !== '' && Number.isInteger(begin) && begin >= 0 && begin < end && end <= bytes.length;
    body.replaceChildren(); table.setAttribute('aria-label', 'Hex dump'); table.tHead.hidden = true;
    for (const data of hexRows(bytes, base)) {
      const row = node('tr'), offset = node('th', data.address), text = node('td');
      row.dataset.wsHexRow = ''; offset.scope = 'row'; row.append(offset); text.dataset.wsHexAscii = '';
      for (const value of data.cells) {
        const i = value.index, cell = node('td'), button = node('button'), code = node('code', value.hex), glyph = node('button', value.glyph);
        code.dataset.wsByte = ''; button.type = glyph.type = 'button'; button.disabled = glyph.disabled = disabled;
        button.dataset.wsHexByte = ''; button.dataset.index = String(i); button.dataset.reading = value.reading; button.setAttribute('aria-label', 'Byte ' + (base + BigInt(i)).toString(16).toUpperCase());
        button.setAttribute('aria-pressed', String(hasSelection && i >= begin && i < end)); glyph.dataset.wsHexMirror = String(i); glyph.setAttribute('aria-label', button.getAttribute('aria-label') + ' as text'); glyph.setAttribute('aria-pressed', button.getAttribute('aria-pressed'));
        button.append(code); cell.append(button); row.append(cell); text.append(glyph);
      }
      row.append(text); body.append(row);
    }
    const reading = node('output', hasSelection ? hexReading(bytes, begin) : ''); reading.dataset.wsHexReading = ''; reading.setAttribute('aria-live', 'polite'); hex.append(reading);
    onRoot('click', event => {
      const mirror = event.target.closest('[data-ws-hex-mirror]');
      if (mirror && !mirror.disabled) hex.querySelectorAll('[data-ws-hex-byte]')[Number(mirror.dataset.wsHexMirror)]?.click();
      const byte = event.target.closest('[data-ws-hex-byte]');
      if (byte && !byte.disabled) hex.querySelectorAll('[data-ws-hex-mirror]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.wsHexMirror === byte.dataset.index)));
    });
    const hover = (event, on) => {
      const target = event.target.closest('[data-ws-hex-byte],[data-ws-hex-mirror]'); if (!target) return;
      const index = target.dataset.index ?? target.dataset.wsHexMirror;
      hex.querySelectorAll('[data-ws-hex-byte],[data-ws-hex-mirror]').forEach(el => el.classList.toggle('is-hovered', on && (el.dataset.index ?? el.dataset.wsHexMirror) === index));
    };
    onRoot('pointerover', event => hover(event, true)); onRoot('pointerout', event => hover(event, false));
  }
  const storage = root.querySelector('[data-ws-storage-parts]');
  if (storage) {
    const capacity = amount(storage.dataset.capacity), bar = storage.querySelector('[data-ws-storage-bar]'), parts = [...storage.querySelectorAll('[data-ws-storage-part]')], used = parts.reduce((sum, part) => sum + amount(part.dataset.bytes), 0);
    bar.setAttribute('aria-valuenow', String(Math.min(used, capacity))); bar.setAttribute('aria-valuetext', `${fileSize(used)} used, ${fileSize(Math.max(0, capacity - used))} free of ${fileSize(capacity)}`);
    const colors = ['#80a7e4','#50b6a8','#d8b078','#d88093','#ac8ddd'];
    parts.forEach((part, i) => { const segment = node('span'); segment.style.flexGrow = amount(part.dataset.bytes) / Math.max(1, capacity, used); segment.style.backgroundColor = colors[i % colors.length]; part.firstElementChild.style.backgroundColor = colors[i % colors.length]; segment.title = part.textContent.trim(); bar.append(segment); });
    if (used < capacity || !parts.length) { const free = node('span'); free.dataset.wsStorageFree = ''; free.style.flexGrow = Math.max(0, capacity - used) / Math.max(1, capacity, used); free.title = fileSize(Math.max(0, capacity - used)) + ' free'; bar.append(free); }
  }
}
