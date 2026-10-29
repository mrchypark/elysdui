(() => {
  const menuPosition = (anchor, box, viewport) => {
    const margin = 8, gap = 6, below = anchor.bottom + gap, above = anchor.top - box.height - gap;
    const top = below + box.height > viewport.height - margin ? above : below;
    return {left: Math.max(margin, Math.min(anchor.left, viewport.width - box.width - margin)), top: Math.max(margin, Math.min(top, viewport.height - box.height - margin))};
  };
  const positionMenu = (popup, trigger) => {
    const viewport = {width: document.documentElement.clientWidth, height: document.documentElement.clientHeight};
    popup.style.maxWidth = `${Math.max(0, viewport.width - 16)}px`;
    popup.style.maxHeight = `${Math.max(0, viewport.height - 16)}px`;
    const saved = popup.matches(':popover-open') ? [] : ['display', 'visibility'].map(name => [name, popup.style.getPropertyValue(name), popup.style.getPropertyPriority(name)]);
    try {
      // Measure closed popovers in this same synchronous beforetoggle task, before native focus/paint.
      if (saved.length) {
        popup.style.setProperty('visibility', 'hidden', 'important');
        popup.style.setProperty('display', 'flex', 'important');
      }
      const position = menuPosition(trigger.getBoundingClientRect(), {width: popup.offsetWidth, height: popup.offsetHeight}, viewport);
      popup.style.left = `${position.left}px`; popup.style.top = `${position.top}px`;
    } finally {
      for (const [name, value, priority] of saved) {
        if (value) popup.style.setProperty(name, value, priority); else popup.style.removeProperty(name);
      }
    }
  };
  let menuEventsReady = false;
  const repositionMenus = () => document.querySelectorAll('[data-ui-component="menu"] > .ui-menu-panel:popover-open').forEach(popup => {
    const trigger = popup.parentElement.querySelector('[data-ui-menu-trigger]');
    if (trigger) positionMenu(popup, trigger);
  });
  const initialize = () => {
    document.querySelectorAll('[data-ui-component="data-table"]').forEach(root => {
      if (root.dataset.uiPatternsReady) return;
      const body = root.querySelector('tbody'), filter = root.querySelector('[data-ui-table-filter]');
      if (!body) return;
      root.dataset.uiPatternsReady = 'true';
      const update = () => {
        const query = (filter?.value || '').trim().toLocaleLowerCase();
        let count = 0;
        for (const row of body.rows) { row.hidden = !row.textContent.toLocaleLowerCase().includes(query); if (!row.hidden) count++; }
        const summary = root.querySelector('[data-ui-table-summary]');
        if (summary) summary.textContent = `${count} / ${body.rows.length} rows`;
      };
      filter?.addEventListener('input', update);
      root.addEventListener('click', event => {
        const button = event.target.closest('button'); if (!button) return;
        if (button.hasAttribute('data-ui-table-density')) root.dataset.density = root.dataset.density === 'compact' ? 'default' : 'compact';
        if (button.hasAttribute('data-ui-table-sort')) {
          const column = Number(button.dataset.uiTableSort), heading = button.closest('th');
          const ascending = heading.getAttribute('aria-sort') !== 'ascending';
          root.querySelectorAll('th').forEach(th => th.setAttribute('aria-sort', 'none'));
          heading.setAttribute('aria-sort', ascending ? 'ascending' : 'descending');
          const rows = [...body.rows].sort((a,b) => (a.cells[column]?.textContent || '').localeCompare(b.cells[column]?.textContent || '', undefined, {numeric:true}) * (ascending ? 1 : -1));
          body.append(...rows);
        }
      });
      root.addEventListener('change', event => {
        if (!event.target.hasAttribute('data-ui-table-column')) return;
        const column = Number(event.target.dataset.uiTableColumn);
        root.querySelectorAll('tr').forEach(row => { if (row.cells[column]) row.cells[column].hidden = !event.target.checked; });
      });
      update();
    });
    document.querySelectorAll('[data-ui-component="menu"]').forEach(root => {
      if (root.dataset.uiPatternsReady) return;
      root.dataset.uiPatternsReady = 'true';
      const popup = root.querySelector('[popover]'), trigger = root.querySelector('[data-ui-menu-trigger]');
      if (!menuEventsReady) {
        window.addEventListener('scroll', repositionMenus, true);
        window.addEventListener('resize', repositionMenus);
        menuEventsReady = true;
      }
      popup.addEventListener('beforetoggle', event => {
        if (event.newState === 'open') positionMenu(popup, trigger);
      });
      const items = () => [...popup.querySelectorAll('[role="menuitem"]')].filter(item => !item.disabled);
      popup.addEventListener('toggle', event => {
        trigger.setAttribute('aria-expanded', String(event.newState === 'open'));
        if (event.newState === 'open') items()[0]?.focus(); else trigger.focus();
      });
      popup.addEventListener('keydown', event => {
        const options = items(), current = options.indexOf(document.activeElement); let next;
        if (event.key === 'ArrowDown') next = (current + 1) % options.length;
        if (event.key === 'ArrowUp') next = (current - 1 + options.length) % options.length;
        if (event.key === 'Home') next = 0;
        if (event.key === 'End') next = options.length - 1;
        if (next !== undefined) { event.preventDefault(); options[next]?.focus(); }
      });
      popup.addEventListener('click', event => {
        const item = event.target.closest('[role="menuitem"]'); if (!item || item.disabled) return;
        root.dispatchEvent(new CustomEvent('ui:select', {bubbles:true, detail:{value:item.value || item.getAttribute('href')}}));
        popup.hidePopover();
      });
    });
    document.querySelectorAll('[data-ui-component="calendar"]').forEach(root => {
      if (root.dataset.uiPatternsReady) return;
      root.dataset.uiPatternsReady = 'true';
      const input = root.querySelector('[data-ui-calendar-input]'), grid = root.querySelector('.ui-calendar-days');
      const parse = value => { const [y,m,d] = value.split('-').map(Number); return y && m && d ? new Date(y,m-1,d) : new Date(); };
      let month = parse(input.value);
      const iso = date => `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
      const draw = focusDate => {
        root.querySelector('[data-ui-calendar-title]').textContent = month.toLocaleDateString(document.documentElement.lang || undefined, {year:'numeric',month:'long'});
        grid.replaceChildren();
        const first = new Date(month.getFullYear(), month.getMonth(), 1), start = new Date(first); start.setDate(1-first.getDay());
        for (let index=0;index<42;index++) {
          const day = new Date(start); day.setDate(start.getDate()+index);
          const value = iso(day), button = root.querySelector('[data-ui-calendar-day]').content.firstElementChild.cloneNode(true);
          button.textContent = day.getDate(); button.dataset.date = value;
          button.setAttribute('aria-label', day.toLocaleDateString(document.documentElement.lang || undefined, {year:'numeric',month:'long',day:'numeric'}));
          button.setAttribute('aria-pressed', String(value === input.value));
          if (day.getMonth() !== month.getMonth()) button.dataset.outsideMonth = 'true';
          button.disabled = input.disabled || (input.min && value < input.min) || (input.max && value > input.max);
          button.tabIndex = value === (focusDate || input.value || iso(first)) ? 0 : -1;
          grid.append(button);
        }
        if (focusDate) grid.querySelector(`[data-date="${focusDate}"]`)?.focus();
      };
      root.addEventListener('click', event => {
        const button = event.target.closest('button'); if (!button || button.disabled) return;
        if (button.hasAttribute('data-ui-calendar-month')) { month = new Date(month.getFullYear(),month.getMonth()+Number(button.dataset.uiCalendarMonth),1); draw(); }
        if (button.dataset.date) { input.value = button.dataset.date; input.dispatchEvent(new Event('input',{bubbles:true})); input.dispatchEvent(new Event('change',{bubbles:true})); draw(input.value); }
      });
      grid.addEventListener('keydown', event => {
        const button = event.target.closest('[data-date]'); if (!button) return;
        const offsets = {ArrowRight:1,ArrowLeft:-1,ArrowDown:7,ArrowUp:-7}; if (!(event.key in offsets)) return;
        event.preventDefault(); const date=parse(button.dataset.date); date.setDate(date.getDate()+offsets[event.key]);
        const value=iso(date); if ((input.min && value<input.min) || (input.max && value>input.max)) return;
        month=date; draw(value);
      });
      input.addEventListener('change', () => { month=parse(input.value); draw(); });
      draw();
    });
  };
  initialize(); document.addEventListener('htmx:after:swap', initialize);
})();
