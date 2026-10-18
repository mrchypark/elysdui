import {codeSpans} from './ely-code.js';

// Literal matching deliberately avoids executing caller regular expressions on the UI thread.
export function workspaceMatches(text, query, {caseSensitive = false, word = false} = {}) {
  if (!query) return [];
  const haystack = caseSensitive ? text : text.toLowerCase(), needle = caseSensitive ? query : query.toLowerCase();
  const starts = [], ends = [];
  if (haystack.length !== text.length) {
    let offset = 0;
    // Keep whole-string lowercasing above for contextual mappings such as final
    // sigma. Individual mappings supply only lengths for original UTF-16 spans.
    for (const character of text) {
      const length = character.toLowerCase().length;
      for (let unit = 0; unit < length; unit++) {
        starts.push(offset + Math.min(unit, character.length - 1));
        ends.push(offset + Math.min(unit + 1, character.length));
      }
      offset += character.length;
    }
  }
  const found = [], isWord = character => Boolean(character && /[\p{L}\p{N}_]/u.test(character));
  for (let at = 0; (at = haystack.indexOf(needle, at)) >= 0; at += needle.length) {
    const start = starts.length ? starts[at] : at, end = ends.length ? ends[at + needle.length - 1] : at + needle.length;
    // Different folded matches can cover the same expanded source character.
    // Return disjoint source ranges so highlighting and replacement stay safe.
    if (found.length && start < found[found.length - 1][1]) continue;
    if (!word || (!isWord(text[start - 1]) && !isWord(text[end]))) found.push([start, end]);
  }
  return found;
}

export function replaceWorkspaceMatches(text, matches, replacement, index = null) {
  const chosen = index === null ? matches : matches.slice(index, index + 1);
  for (const [start, end] of [...chosen].reverse()) text = text.slice(0, start) + replacement + text.slice(end);
  return text;
}

export function compareProcessCells(a, b, column, descending = false) {
  const numeric = [1, 4, 5].includes(column);
  const result = numeric ? (Number.parseFloat(a) || 0) - (Number.parseFloat(b) || 0) : a.localeCompare(b, undefined, {numeric: true});
  return descending ? -result : result;
}

export function bindWorkspaceSource(root, {on, change, emit}) {
  const source = root.querySelector('[data-ws-source="true"]');
  root.querySelectorAll('[data-ws-ansi-color]').forEach(span => { if (/^#[0-9a-f]{6}$/i.test(span.dataset.wsAnsiColor)) span.style.color = span.dataset.wsAnsiColor; });
  if (!source && !root.querySelector('[data-ws-process-list]')) return;
  source?.querySelectorAll('[data-ws-source-code]').forEach(code => {
    if (code.children.length) return;
    const text = code.textContent, fragment = document.createDocumentFragment(); let cursor = 0;
    for (const span of codeSpans(text)) {
      fragment.append(document.createTextNode(text.slice(cursor, span.start)));
      const token = document.createElement('span'); token.dataset.wsSyntax = span.kind; token.textContent = span.text; fragment.append(token); cursor = span.end;
    }
    fragment.append(document.createTextNode(text.slice(cursor))); code.replaceChildren(fragment);
  });
  const finder = root.querySelector('[data-workspace-find][data-ws-source="true"]');
  let current = 0;
  const find = () => {
    if (!finder) return [];
    const query = finder.querySelector('input[data-workspace-find]').value;
    const opts = {caseSensitive: finder.querySelector('[data-ws-find-option="case"]').getAttribute('aria-pressed') === 'true', word: finder.querySelector('[data-ws-find-option="word"]').getAttribute('aria-pressed') === 'true'};
    const matches = [];
    finder.querySelectorAll('pre>code').forEach(code => {
      const text = code.textContent; code.replaceChildren(); let cursor = 0;
      for (const [start, end] of workspaceMatches(text, query, opts)) {
        code.append(document.createTextNode(text.slice(cursor, start)));
        const mark = document.createElement('mark'); mark.textContent = text.slice(start, end); code.append(mark); matches.push(mark); cursor = end;
      }
      code.append(document.createTextNode(text.slice(cursor)));
    });
    current = matches.length ? (current + matches.length) % matches.length : 0;
    matches[current]?.setAttribute('data-current', 'true');
    finder.querySelector('[data-workspace-match-count]').textContent = matches.length ? `${current + 1} of ${matches.length}` : 'No matches';
    return matches;
  };
  find();
  const search = root.querySelector('[data-ws-search-panel][data-ws-source="true"]');
  const filterSearch = () => {
    if (!search) return;
    const term = search.querySelector('[data-ws-search]').value.toLowerCase(), include = search.querySelector('[data-ws-search-include]').value;
    let count = 0;
    // Gallery source uses prefix globs. Full filesystem glob expansion belongs to the host.
    const prefix = include.split('*')[0];
    search.querySelectorAll('[data-ws-search-file]').forEach(file => {
      const inPath = !prefix || file.dataset.path.startsWith(prefix);
      file.querySelectorAll('[data-ws-search-row]').forEach(row => { row.hidden = !inPath || Boolean(term && !row.textContent.toLowerCase().includes(term)); if (!row.hidden) count++; });
      file.hidden = !file.querySelector('[data-ws-search-row]:not([hidden])');
    });
    search.querySelector('[data-ws-search-count]').textContent = `${count} matches`;
  };
  filterSearch();
  on('input', event => {
    if (event.target.matches('input[data-workspace-find]')) { current = 0; find(); }
    if (event.target.matches('[data-ws-search],[data-ws-search-include]')) filterSearch();
  });
  on('click', event => {
    const target = event.target.closest('button'); if (!target || target.disabled) return;
    if (finder?.contains(target) && target.matches('[data-ws-find-option],[data-ws-find-next],[data-ws-find-prev]')) {
      if (target.hasAttribute('data-ws-find-next')) current++;
      if (target.hasAttribute('data-ws-find-prev')) current--;
      find();
    }
    if (finder?.contains(target) && target.hasAttribute('data-ws-replace')) {
      const marks = find(), replacement = finder.querySelector('[data-ws-replacement]').value;
      const chosen = target.dataset.wsReplace === 'all' ? marks : marks.slice(current, current + 1);
      for (const code of new Set(chosen.map(mark => mark.parentElement))) {
        const ranges = []; let offset = 0;
        for (const node of code.childNodes) { if (chosen.includes(node)) ranges.push([offset, offset + node.textContent.length]); offset += node.textContent.length; }
        code.textContent = replaceWorkspaceMatches(code.textContent, ranges, replacement);
      }
      current = 0; find(); change({name: 'source', value: [...finder.querySelectorAll('pre>code')].map(code => code.textContent).join('\n')});
    }
    if (target.hasAttribute('data-ws-terminal-tab')) {
      const terminal = target.closest('[data-workspace-terminal]');
      terminal.querySelectorAll('[data-ws-terminal-tab]').forEach(tab => tab.setAttribute('aria-selected', String(tab === target)));
      terminal.querySelectorAll('[data-ws-terminal-pane]').forEach(pane => pane.hidden = pane.dataset.wsTerminalPane !== target.dataset.wsTerminalTab);
      change({name:'terminalTab', value:target.dataset.wsTerminalTab});
    }
    if (target.hasAttribute('data-ws-process-sort')) {
      const table = target.closest('table'), column = Number(target.dataset.wsProcessSort), descending = target.dataset.direction !== 'descending';
      [...table.tBodies[0].rows].sort((a,b) => compareProcessCells(a.cells[column].textContent, b.cells[column].textContent, column, descending)).forEach(row => table.tBodies[0].append(row));
      table.querySelectorAll('th').forEach(cell => cell.removeAttribute('aria-sort'));
      target.dataset.direction = descending ? 'descending' : 'ascending'; target.closest('th').setAttribute('aria-sort', target.dataset.direction);
      change({name:'processSort', value:{column, descending}});
    }
  });
}
