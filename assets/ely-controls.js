(() => {
  if (window.__elyControls) return;
  window.__elyControls = true;

  const initialized = new WeakSet();
  const dialogOpeners = new WeakMap();
  const initializedNative = new WeakSet();
  const root = (target) => target instanceof Element ? target.closest('[data-ui-component]') : null;
  const hiddenValue = (component) => component.querySelector('input[type="hidden"]');
  const text = (value) => String(value || '').trim();
  const isDisabled = (target) => target.closest(':disabled') !== null;

  const notifyValue = (input) => {
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
  };

  const syncPin = (component, initial = false) => {
    const slots = [...component.querySelectorAll('[data-ui-pin-slot]')];
    const hidden = hiddenValue(component);
    if (!slots.length || !hidden) return;
    const previous = hidden.value;
    if (initial) [...hidden.value.replace(/\D/g, '')].forEach((digit, index) => { if (slots[index]) slots[index].value = digit; });
    hidden.value = slots.map((slot) => slot.value).join('');
    const message = slots[0].required && slots.some((slot) => !slot.value) ? 'Enter every PIN digit.' : '';
    slots.forEach((slot, index) => slot.setCustomValidity(index === 0 ? message : ''));
    if (!initial && hidden.value !== previous) notifyValue(hidden);
  };

  const syncTags = (component) => {
    const hidden = hiddenValue(component);
    const host = component.querySelector('[data-ui-tags]');
    const entry = component.querySelector('[data-ui-tag-entry]');
    const template = component.querySelector('[data-ui-tag-template]');
    if (!hidden || !host || !entry || !template) return;
    const values = hidden.value.split(',').map(text).filter(Boolean);
    entry.required = component.hasAttribute('data-ui-required') && values.length === 0;
    entry.setCustomValidity(values.length || !entry.required ? '' : 'Add at least one tag.');
    host.replaceChildren(...values.map((value) => {
      const tag = template.content.firstElementChild.cloneNode(true);
      tag.querySelector('[data-ui-tag-text]').textContent = value;
      const remove = tag.querySelector('[data-ui-action="remove-tag"]');
      remove.value = value;
      remove.setAttribute('aria-label', `Remove ${value}`);
      return tag;
    }));
  };

  const syncMultiSelect = (component) => {
    if (!component.hasAttribute('data-ui-required')) return;
    const inputs = [...component.querySelectorAll('[data-slot="checkbox"]')];
    if (!inputs.length) return;
    const message = inputs.some((input) => input.checked) ? '' : 'Select at least one option.';
    inputs.forEach((input, index) => input.setCustomValidity(index === 0 ? message : ''));
  };

  const visibleOptions = (component) => [...component.querySelectorAll('[data-ui-option]')].filter((option) => !option.hidden && option.getAttribute("aria-disabled") !== "true");
  const setComboActive = (component, option) => {
    const input = component.querySelector('[data-ui-combobox-input]');
    if (!input) return;
    component.querySelectorAll('[data-ui-option]').forEach((item) => item.dataset.uiActive = String(item === option));
    if (option) input.setAttribute('aria-activedescendant', option.id);
    else input.removeAttribute('aria-activedescendant');
  };
  const validateCombo = (component) => {
    const input = component.querySelector('[data-ui-combobox-input]');
    const hidden = hiddenValue(component);
    if (input && hidden) input.setCustomValidity(input.required && !hidden.value ? 'Select an option.' : '');
  };
  const openCombo = component => {
    const input=component.querySelector('[data-ui-combobox-input]'),list=component.querySelector('[data-ui-combobox-list]');
    if(!input||input.disabled||!list||!list.hidden)return false;
    component.querySelectorAll('[data-ui-option]').forEach(option=>option.hidden=false);
    list.hidden=false;input.setAttribute('aria-expanded','true');
    setComboActive(component,component.querySelector('[data-ui-option][aria-selected="true"]')||visibleOptions(component)[0]);
    return true;
  };
  const selectCombo = (component, option) => {
    const input = component.querySelector('[data-ui-combobox-input]');
    const hidden = hiddenValue(component);
    const list = component.querySelector('[data-ui-combobox-list]');
    if (!input || !hidden || !option || option.getAttribute("aria-disabled") === "true") return;
    hidden.value = option.dataset.value || '';
    input.value = option.dataset.uiLabel ?? option.textContent.trim();
    component.querySelectorAll('[data-ui-option]').forEach((item) => item.setAttribute('aria-selected', String(item === option)));
    setComboActive(component, option);
    list.hidden = true;
    input.setAttribute('aria-expanded', 'false');
    validateCombo(component);
    hidden.dispatchEvent(new Event('input', { bubbles: true }));
    hidden.dispatchEvent(new Event('change', { bubbles: true }));
    input.focus();
  };

  const addKeyValue = (component) => {
    const host = component.querySelector('[data-ui-key-values]');
    const template = component.querySelector('[data-ui-key-value-template]');
    if (!host || !template) return;
    const row = template.content.firstElementChild.cloneNode(true);
    const index = Number(component.dataset.uiKeyValueNext || host.children.length);
    component.dataset.uiKeyValueNext = String(index + 1);
    row.querySelectorAll('input').forEach((input, inputIndex) => {
      input.value = '';
      input.id = `${component.id}-${inputIndex ? 'value' : 'key'}-${index}`;
    });
    host.append(row);
    row.querySelector('input').focus();
  };

  const acceptFile = (input, file) => {
    const rules = input.accept.split(',').map(text).filter(Boolean);
    return !rules.length || rules.some((rule) => rule.startsWith('.') ? file.name.toLowerCase().endsWith(rule.toLowerCase()) : rule.endsWith('/*') ? file.type.startsWith(rule.slice(0, -1)) : file.type === rule);
  };
  const fileError = (input, files) => !input.multiple && files.length > 1 ? 'Choose one file only.' : [...files].some(file=>!acceptFile(input,file)) ? 'This file type is not accepted.' : '';
  const showFileError = (component, message) => {
    const input=component.querySelector('[data-ui-file-input]'); input.setCustomValidity(message);input.setAttribute('aria-invalid',String(!!message));
    const output=component.querySelector('[data-ui-file-error]');if(output)output.textContent=message;
  };
  const setFiles = (component, files) => {
    const input=component.querySelector('[data-ui-file-input]');if(!input||input.disabled)return;
    const error=fileError(input,files);showFileError(component,error);if(error)return;
    const transfer=new DataTransfer();[...files].forEach(file=>transfer.items.add(file));input.files=transfer.files;
    input.dispatchEvent(new Event('change',{bubbles:true}));
  };
  const normalizeFiles = input => showFileError(root(input),fileError(input,input.files));

  const activateTab = (component, tab) => {
    const tabs = [...component.querySelectorAll('[data-ui-tab]')];
    const panels = [...component.querySelectorAll('[data-ui-tab-panel]')];
    tabs.forEach((item, index) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      panels[index].hidden = !selected;
    });
  };

  const initSignature = (component) => {
    const canvas = component.querySelector('[data-ui-signature]');
    const fallback = component.querySelector('textarea');
    const value = component.querySelector('[data-ui-signature-value]');
    if (!canvas || !fallback || !value) return;
    const required = fallback.required;
    let strokes = 0;
    const notify = () => {
      const count = component.querySelector('[data-ui-signature-count]');
      if (count) count.textContent = `${strokes} ${strokes === 1 ? 'stroke' : 'strokes'}`;
      const guide = component.querySelector('.ui-signature-guide');
      if (guide) guide.hidden = !!value.value;
      value.dispatchEvent(new Event('change', {bubbles:true}));
    };
    fallback.addEventListener('invalid', () => { const details=fallback.closest('details'); if(details) details.open=true; });
    value.disabled = fallback.disabled;
    fallback.removeAttribute('name');
    fallback.required = false;
    const validate = () => fallback.setCustomValidity(required && !value.value ? 'Draw or type a signature.' : '');
    validate();
    const guide = component.querySelector('.ui-signature-guide');
    if (guide) guide.hidden = !!value.value;
    const rect = canvas.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * scale));
    canvas.height = Math.max(1, Math.round(rect.height * scale));
    const context = canvas.getContext('2d');
    context.setTransform(scale, 0, 0, scale, 0, 0);
    if (value.value.startsWith('data:image/png;base64,')) {
      fallback.value = '';
      const image = new Image();
      image.onload = () => context.drawImage(image, 0, 0, rect.width, rect.height);
      image.src = value.value;
    }
    fallback.addEventListener('input', () => {
      value.value = fallback.value;
      strokes = 0; notify();
      context.clearRect(0, 0, canvas.width, canvas.height);
      validate();
    });
    component.querySelector('[data-ui-signature-clear]').addEventListener('click', () => {
      value.value = ''; fallback.value = '';
      strokes = 0; notify();
      context.clearRect(0, 0, canvas.width, canvas.height);
      validate(); component.querySelector('[data-ui-signature-clear]').focus();
    });
    const resizeObserver = new ResizeObserver(() => {
      const bounds = canvas.getBoundingClientRect();
      const ratio = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(bounds.width * ratio));
      const height = Math.max(1, Math.round(bounds.height * ratio));
      if (canvas.width === width && canvas.height === height) return;
      const copy = document.createElement('canvas');
      copy.width = canvas.width; copy.height = canvas.height;
      copy.getContext('2d').drawImage(canvas, 0, 0);
      canvas.width = width; canvas.height = height;
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
      context.drawImage(copy, 0, 0, copy.width, copy.height, 0, 0, bounds.width, bounds.height);
    });
    resizeObserver.observe(canvas);
    component.closest("[data-ely-family]")?.addEventListener("ely:cleanup", () => resizeObserver.disconnect(), {once:true});
    let drawing = false;
    const point = (event) => { const box = canvas.getBoundingClientRect(); return [event.clientX - box.left, event.clientY - box.top]; };
    canvas.addEventListener('pointerdown', (event) => {
      if (fallback.disabled || drawing || event.button !== 0) return;
      context.strokeStyle = getComputedStyle(canvas).color;
      context.lineWidth = 2; context.lineCap = 'round'; context.lineJoin = 'round';
      drawing = true;
      canvas.setPointerCapture(event.pointerId);
      const [x, y] = point(event);
      context.beginPath();
      context.moveTo(x, y);
    });
    canvas.addEventListener('pointermove', (event) => {
      if (!drawing) return;
      const [x, y] = point(event);
      context.lineTo(x, y);
      context.stroke();
      value.value = canvas.toDataURL();
      fallback.value = '';
      validate();
    });
    const finish = () => {
      if (!drawing) return;
      drawing = false; strokes += 1;
      value.value = canvas.toDataURL(); fallback.value = '';
      validate(); notify();
    };
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach(type => canvas.addEventListener(type, finish));
  };

  const initComponent = (component) => {
    if (initialized.has(component)) return;
    initialized.add(component);
    switch (component.dataset.uiComponent) {
      case 'pin-input': syncPin(component, true); break;
      case 'tag-input': syncTags(component); break;
      case 'multi-select': syncMultiSelect(component); break;
      case 'combobox': {
        const hidden = hiddenValue(component);
        const input = component.querySelector('[data-ui-combobox-input]');
        if (!hidden || !input) break;
        if (!hidden.hasAttribute('data-ui-permanently-disabled')) hidden.disabled = false;
        const selected = component.querySelector('[data-ui-option][aria-selected="true"]');
        if (selected) input.value = selected.dataset.uiLabel ?? selected.textContent.trim();
        setComboActive(component, selected || visibleOptions(component)[0]);
        validateCombo(component);
        break;
      }
      case 'key-value-input': component.dataset.uiKeyValueNext = String(component.querySelectorAll('[data-ui-key-value]').length); break;
      case 'tabs': {
        const selected = component.querySelector('[data-ui-tab][aria-selected="true"]') || component.querySelector('[data-ui-tab]');
        if (selected) activateTab(component, selected);
        break;
      }
      case 'signature-pad': initSignature(component); break;
      case 'dialog': component.addEventListener('close', () => dialogOpeners.get(component)?.focus()); break;
    }
  };
  const initNative = (input) => {
    if (initializedNative.has(input)) return;
    initializedNative.add(input);
    input.indeterminate = true;
  };
  const init = (scope = document) => {
    if (scope instanceof Element && scope.matches('[data-initial-indeterminate="true"]')) initNative(scope);
    scope.querySelectorAll?.('[data-initial-indeterminate="true"]').forEach(initNative);
    if (scope instanceof Element && scope.matches('[data-ui-component]')) initComponent(scope);
    scope.querySelectorAll?.('[data-ui-component]').forEach(initComponent);
  };

  // ARIA disabled and readonly checkboxes need activation suppression: neither
  // aria-disabled nor the HTML readonly attribute disables native activation.
  // Capture prevents native submission/navigation and descendant HTMX handlers.
  const preventUnavailableActivation = (event) => {
    const blocked = event.target.closest?.('[data-slot="button"][aria-disabled="true"], input[data-ui-readonly="true"]');
    if (!blocked) return;
    event.preventDefault();
    event.stopImmediatePropagation();
  };
  document.addEventListener('click', preventUnavailableActivation, true);
  document.addEventListener('auxclick', preventUnavailableActivation, true);

  document.addEventListener('click', (event) => {
    document.querySelectorAll('[data-ui-component=combobox]').forEach(combo=>{if(!combo.contains(event.target)){combo.querySelector('[data-ui-combobox-list]').hidden=true;combo.querySelector('[data-ui-combobox-input]').setAttribute('aria-expanded','false');}});
    const trigger = event.target.closest?.('[data-ui-dialog-open]');
    if (trigger && !isDisabled(trigger)) {
      const dialog = document.getElementById(trigger.dataset.uiDialogOpen);
      if (dialog?.showModal) { dialogOpeners.set(dialog, trigger); dialog.showModal(); dialog.querySelector('[autofocus], button, input, select, textarea')?.focus(); }
      return;
    }
    const component = root(event.target);
    if (!component || isDisabled(event.target)) return;
    const action = event.target.closest('[data-ui-action]')?.dataset.uiAction;
    if (action === 'clear') { const input = component.querySelector('[data-slot="input"]'); input.value = ''; input.dispatchEvent(new Event('input', { bubbles: true })); input.dispatchEvent(new Event('change', { bubbles: true })); input.focus(); }
    if (action === 'password-toggle') { const input = component.querySelector('[data-slot="input"]'); const shown = input.type === 'text'; input.type = shown ? 'password' : 'text'; event.target.textContent = shown ? 'Show' : 'Hide'; event.target.setAttribute('aria-label', shown ? 'Show password' : 'Hide password'); }
    if (action === 'remove-tag') { const hidden = hiddenValue(component); const previous = hidden.value; hidden.value = hidden.value.split(',').map(text).filter((value) => value && value !== event.target.value).join(','); syncTags(component); if (hidden.value !== previous) notifyValue(hidden); component.querySelector('[data-ui-tag-entry]').focus(); }
    if (action === 'add-pair') addKeyValue(component);
    if (action === 'remove-pair') event.target.closest('[data-ui-key-value]')?.remove();
    if(event.target.closest('[data-ui-file-browse]'))component.querySelector('[data-ui-file-input]')?.click();
    if(event.target.matches('[data-ui-combobox-input]'))openCombo(component);
    const option = event.target.closest('[data-ui-option]'); if (option && !component.querySelector('[data-ui-combobox-input]')?.disabled) selectCombo(component, option);
    const tab = event.target.closest('[data-ui-tab]'); if (tab) activateTab(component, tab);
  });

  document.addEventListener('input', (event) => {
    const component = root(event.target);
    if (!component || isDisabled(event.target)) return;
    if (event.target.matches('[data-ui-pin-slot]')) {
      const slots = [...component.querySelectorAll('[data-ui-pin-slot]')];
      const index = slots.indexOf(event.target);
      event.target.value = event.target.value.replace(/\D/g, '').slice(-1);
      syncPin(component);
      if (event.target.value) slots[index + 1]?.focus();
    }
    if (event.target.matches('[data-ui-combobox-input]')) {
      const query = event.target.value.toLowerCase();
      const list = component.querySelector('[data-ui-combobox-list]');
      component.querySelectorAll('[data-ui-option]').forEach((option) => { option.hidden = ![option.textContent,option.dataset.value,option.dataset.uiSearch].join(' ').toLowerCase().includes(query); });
      list.hidden = false;
      event.target.setAttribute('aria-expanded', 'true');
      setComboActive(component, visibleOptions(component)[0]);
      hiddenValue(component).value = component.hasAttribute('data-ui-combobox-free') ? event.target.value : '';
      validateCombo(component);
    }
  });

  document.addEventListener('keydown', (event) => {
    const component = root(event.target);
    if (!component || isDisabled(event.target)) return;
    if (event.target.matches('[data-ui-hotkey]')) {
      if (event.key === 'Tab') return;
      event.preventDefault();
      if (['Control', 'Alt', 'Shift', 'Meta'].includes(event.key)) return;
      if (event.key === 'Escape') { event.target.value = event.target.dataset.uiHotkeyPrevious || ''; return; }
      if (event.key === 'Backspace' || event.key === 'Delete') { event.target.value = ''; return; }
      const key = event.key.length === 1 ? event.key.toUpperCase() : event.key;
      event.target.value = [event.ctrlKey && 'Ctrl', event.altKey && 'Alt', event.shiftKey && 'Shift', event.metaKey && 'Meta', key].filter(Boolean).join('+');
      return;
    }
    if (event.target.matches('[data-ui-tag-entry]') && (event.key === 'Enter' || event.key === ',')) {
      event.preventDefault();
      const value = text(event.target.value);
      const hidden = hiddenValue(component);
      const previous = hidden.value;
      if (value && !hidden.value.split(',').map(text).includes(value)) hidden.value = [hidden.value, value].filter(Boolean).join(',');
      event.target.value = '';
      syncTags(component);
      if (hidden.value !== previous) notifyValue(hidden);
    }
    if (event.target.matches('[data-ui-pin-slot]')) {
      const slots = [...component.querySelectorAll('[data-ui-pin-slot]')];
      const index = slots.indexOf(event.target);
      if (event.key === 'Backspace' && !event.target.value && index) slots[index - 1].focus();
    }
    if (event.target.matches('[data-ui-combobox-input]')) {
      if(['ArrowDown','ArrowUp'].includes(event.key)&&openCombo(component)){event.preventDefault();return;}
      if(component.querySelector('[data-ui-combobox-list]').hidden)return;
      const options = visibleOptions(component);
      const active = options.findIndex((option) => option.dataset.uiActive === 'true');
      if ((event.key === 'ArrowDown' || event.key === 'ArrowUp') && options.length) {
        event.preventDefault();
        const next = (active + (event.key === 'ArrowDown' ? 1 : options.length - 1) + options.length) % options.length;
        setComboActive(component, options[next]);
        options[next].scrollIntoView({block:'nearest'});
      }
      if (event.key === 'Enter' && options.length) { event.preventDefault(); selectCombo(component, options[Math.max(0, active)] || options[0]); }
      else if (event.key === 'Enter' && component.hasAttribute('data-ui-combobox-free')) { event.preventDefault(); component.querySelector('[data-ui-combobox-list]').hidden = true; event.target.setAttribute('aria-expanded', 'false'); hiddenValue(component).dispatchEvent(new Event('change', {bubbles:true})); }
      if (event.key === 'Escape') { component.querySelector('[data-ui-combobox-list]').hidden = true; event.target.setAttribute('aria-expanded', 'false'); }
    }
    if (event.target.matches('[data-ui-tab]') && ['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const tabs = [...component.querySelectorAll('[data-ui-tab]')];
      const index = tabs.indexOf(event.target);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length;
      activateTab(component, tabs[next]);
      tabs[next].focus();
    }
  });

  document.addEventListener('paste', (event) => {
    const component = root(event.target);
    if (!component || !event.target.matches('[data-ui-pin-slot]') || isDisabled(event.target)) return;
    const digits = event.clipboardData.getData('text').replace(/\D/g, '');
    if (!digits) return;
    event.preventDefault();
    const slots = [...component.querySelectorAll('[data-ui-pin-slot]')];
    let index = slots.indexOf(event.target);
    for (const digit of digits) { if (!slots[index]) break; slots[index++].value = digit; }
    syncPin(component);
    slots[Math.min(index, slots.length - 1)]?.focus();
  });

  document.addEventListener('focusin', (event) => {
    if (event.target.matches?.('[data-ui-hotkey]')) event.target.dataset.uiHotkeyPrevious = event.target.value;
  });

  document.addEventListener('change', (event) => {
    const component = root(event.target);
    if (!component) return;
    if (event.target.matches('[data-ui-file-input]')) { normalizeFiles(event.target); component.querySelector('[data-ui-file-names]').textContent = [...event.target.files].map((file) => file.name).join(', '); }
    if (event.target.matches('[data-slot="checkbox"]')) { syncMultiSelect(component); }
  });
  document.addEventListener('dragover', (event) => { const component = root(event.target); if (component?.dataset.uiComponent === 'file-dropzone' && !component.querySelector('[data-ui-file-input]')?.disabled) event.preventDefault(); });
  document.addEventListener('drop', (event) => { const component = root(event.target); if (component?.dataset.uiComponent === 'file-dropzone' && !component.querySelector('[data-ui-file-input]')?.disabled) { event.preventDefault(); const directory=[...(event.dataTransfer?.items||[])].some(item=>item.webkitGetAsEntry?.()?.isDirectory);if(directory)showFileError(component,'Choose files, not folders.');else setFiles(component,event.dataTransfer.files); } });

  // HTMX 4 emits this event from the request source with {ctx}, not the swap
  // target. ctx.target can also be detached after outerHTML. Scan the live
  // document so sibling/OOB inserts are included; the WeakSet keeps this safe
  // for existing controls and repeated swaps.
  document.addEventListener('htmx:after:swap', () => init());
  init();
})();
