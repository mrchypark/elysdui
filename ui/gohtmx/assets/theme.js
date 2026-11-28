(() => {
  const light = {'color-paper':'#FCFAF7', 'color-ink':'#14213A', 'color-muted':'#6F6B66', 'color-line':'#E6E1DA', 'color-accent':'#335CFF', surface:'#FFFFFF', border:'#8C8781', 'accent-hover':'#2449DF', 'accent-tint':'#EEF2FF', 'on-accent':'#FFFFFF', focus:'#335CFF', draft:'#68625C', 'draft-tint':'#F1ECE6', approved:'#36654F', 'approved-tint':'#EDF4EF', warning:'#8A5B18', 'warning-tint':'#FBF1DA', error:'#A13F3F', 'error-tint':'#F9ECE9'};
  const dark = {'color-paper':'#171615', 'color-ink':'#F2EFEA', 'color-muted':'#BBB4AC', 'color-line':'#37332F', 'color-accent':'#6B8AFF', surface:'#211F1D', border:'#817970', 'accent-hover':'#8CA4FF', 'accent-tint':'#202840', 'on-accent':'#14213A', focus:'#6B8AFF', draft:'#C4BEB5', 'draft-tint':'#302C28', approved:'#A5C7B0', 'approved-tint':'#25362B', warning:'#E2BE7A', 'warning-tint':'#3B3020', error:'#E4A29B', 'error-tint':'#3F2927'};
  // Ely GPUI palette; input boundaries use its high-contrast border_strong values.
  const elyLight = {'color-paper':'#FCFAF7', 'color-ink':'#181613', 'color-muted':'#605D5A', 'color-line':'#E1DFDD', 'color-accent':'#181613', surface:'#FFFFFF', border:'#82807D', 'accent-hover':'#302D2B', 'accent-tint':'#F2F0ED', 'on-accent':'#FCFAF7', focus:'#3772BB', draft:'#605D5A', 'draft-tint':'#F6F4F1', approved:'#267B4C', 'approved-tint':'#E7F9EC', warning:'#A25F12', 'warning-tint':'#FEF2DD', error:'#BA3E38', 'error-tint':'#FFEFEC'};
  const elyDark = {'color-paper':'#252525', 'color-ink':'#F3F1F0', 'color-muted':'#C4C2C0', 'color-line':'#3F3F3F', 'color-accent':'#F3F1F0', surface:'#2C2C2C', border:'#858380', 'accent-hover':'#D9D7D5', 'accent-tint':'#383838', 'on-accent':'#252525', focus:'#69A1E8', draft:'#C4C2C0', 'draft-tint':'#202020', approved:'#6BBC89', 'approved-tint':'#182C1F', warning:'#E8B45E', 'warning-tint':'#342611', error:'#E5756E', 'error-tint':'#3A1D1B'};
  const tokens = Object.keys(light);
  const aliases = {'color-background':'color-paper', 'color-foreground':'color-ink', 'color-primary':'color-accent', 'color-primary-foreground':'on-accent', 'color-secondary':'accent-tint', 'color-secondary-foreground':'color-ink', 'color-card':'surface', 'color-card-foreground':'color-ink', 'color-muted-foreground':'color-muted', 'color-accent-foreground':'on-accent', 'color-border':'color-line', 'color-input':'border', 'color-ring':'focus', 'color-destructive':'error'};
  const palettes = new Map([
    ['ely', {id:'ely', name:'Ely Neutral', light:elyLight, dark:elyDark}],
    ['blue', {id:'blue', name:'Blue', light, dark}],
    ['violet', {id:'violet', name:'Dusty Violet', light:{...light, 'color-accent':'#67547F', 'accent-hover':'#514063', 'accent-tint':'#F1ECF6', focus:'#67547F'}, dark:{...dark, 'color-accent':'#C0A5DF', 'accent-hover':'#D4BDEC', 'accent-tint':'#2D2537', focus:'#C0A5DF'}}],
    ['terracotta', {id:'terracotta', name:'Oxide Terracotta', light:{...light, 'color-accent':'#96523E', 'accent-hover':'#793F2F', 'accent-tint':'#F8EDE7', focus:'#96523E'}, dark:{...dark, 'color-accent':'#E7A38B', 'accent-hover':'#F1BAA7', 'accent-tint':'#3C2B26', focus:'#E7A38B'}}],
  ]);
  const builtins = new Set(palettes.keys());
  const copy = value => JSON.parse(JSON.stringify(value));
  const read = key => { try { return localStorage.getItem(key); } catch { return null; } };
  const save = (key, value) => { try { localStorage.setItem(key, value); } catch {} };
  const systemQuery = typeof window.matchMedia === 'function' ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  const modeOf = value => {
    if (!['light','dark','system'].includes(value)) throw new Error('Mode must be light, dark, or system.');
    return value;
  };
  const resolveMode = value => modeOf(value) === 'system' ? (systemQuery && systemQuery.matches ? 'dark' : 'light') : value;
  const validateFont = (value, path) => {
    const trimmed = typeof value === 'string' ? value.trim() : '';
    const doubleQuotes = (trimmed.match(/"/g) || []).length;
    const singleQuotes = (trimmed.match(/'/g) || []).length;
    if (!trimmed || trimmed.length > 200 || /[\r\n\0\\{};<>]|\/\*|\*\//.test(trimmed) || /url\s*\(|expression\s*\(|var\s*\(/i.test(trimmed) || doubleQuotes % 2 !== 0 || singleQuotes % 2 !== 0) {
      throw new Error(`${path}: enter a valid font-family list.`);
    }
    return trimmed;
  };
  function validate(theme) {
    if (!theme || typeof theme.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(theme.id) || typeof theme.name !== 'string' || !theme.name.trim() || theme.name.length > 80 || Object.keys(theme).some(key => !['id','name','light','dark','radius','font'].includes(key))) throw new Error('A theme requires id, name, light, and dark.');
    const result = {id:theme.id, name:theme.name.trim()};
    for (const mode of ['light','dark']) {
      const values = theme[mode];
      if (!values || Object.keys(values).length !== tokens.length || Object.keys(values).some(key => !tokens.includes(key))) throw new Error(`${mode} requires all 19 supported color tokens.`);
      result[mode] = {};
      for (const key of tokens) {
        if (typeof values[key] !== 'string' || !/^#[0-9a-f]{6}$/i.test(values[key])) throw new Error(`${mode}.${key}: enter a color in #RRGGBB format.`);
        result[mode][key] = values[key].toUpperCase();
      }
    }
    if (theme.radius !== undefined) {
      if (typeof theme.radius !== 'string' || !/^(0|\d+(\.\d+)?(px|rem|em))$/.test(theme.radius.trim())) throw new Error('radius: enter a CSS length in px, rem, em, or 0.');
      result.radius = theme.radius.trim();
    }
    if (theme.font !== undefined) {
      if (typeof theme.font === 'string') {
        result.font = validateFont(theme.font, 'font');
      } else if (theme.font && typeof theme.font === 'object' && !Array.isArray(theme.font) && Object.keys(theme.font).every(key => ['sans','mono'].includes(key)) && (theme.font.sans !== undefined || theme.font.mono !== undefined)) {
        result.font = {};
        if (theme.font.sans !== undefined) result.font.sans = validateFont(theme.font.sans, 'font.sans');
        if (theme.font.mono !== undefined) result.font.mono = validateFont(theme.font.mono, 'font.mono');
      } else {
        throw new Error('font: enter a font-family string or {sans, mono}.');
      }
    }
    return result;
  }
  const luminance = color => {
    const channels = color.slice(1).match(/../g).map(hex => parseInt(hex,16)/255).map(value => value <= .04045 ? value/12.92 : ((value+.055)/1.055)**2.4);
    return channels[0]*.2126 + channels[1]*.7152 + channels[2]*.0722;
  };
  const contrast = (a,b) => { const first=luminance(a),second=luminance(b); return (Math.max(first,second)+.05)/(Math.min(first,second)+.05); };
  function issues(value) {
    const theme = validate(value), problems = [];
    const pairs = [['color-ink','color-paper'],['color-ink','surface'],['color-muted','color-paper'],['color-muted','surface'],['on-accent','color-accent'],['on-accent','accent-hover'],['on-accent','error'],['color-ink','accent-tint'],['draft','draft-tint'],['approved','approved-tint'],['warning','warning-tint'],['error','error-tint'],['border','surface',3],['focus','surface',3],['focus','color-paper',3]];
    for (const mode of ['light','dark']) for (const [foreground,background,minimum=4.5] of pairs) {
      const ratio = contrast(theme[mode][foreground],theme[mode][background]);
      if (ratio < minimum) problems.push({mode,foreground,background,ratio,minimum});
    }
    return problems;
  }
  const get = id => { if (!palettes.has(id)) throw new Error('This theme is not registered.'); return copy(palettes.get(id)); };
  const root = document.documentElement;
  const modeOnly = Boolean(root.hasAttribute?.('data-theme-mode-only') || document.currentScript?.hasAttribute?.('data-mode-only'));
  const syncThemeColor = paperColor => {
    const meta = typeof document.querySelector === 'function' ? document.querySelector('meta[name="theme-color"]:not([media])') : null;
    if (!meta) return;
    const fallback = modeOnly
      ? (typeof window.getComputedStyle === 'function' ? window.getComputedStyle(root)?.getPropertyValue('--color-paper')?.trim() : '')
      : get(activeId)[root.dataset.theme || 'light']?.['color-paper'];
    const color = paperColor || fallback;
    if (color) meta.setAttribute('content', color);
  };
  const setOrRemove = (style, prop, value) => {
    if (value !== undefined) style.setProperty(prop, value);
    else if (typeof style.removeProperty === 'function') style.removeProperty(prop);
  };
  function preview(element, value, mode) {
    const theme = typeof value === 'string' ? get(value) : validate(value), resolved = resolveMode(mode), colors = theme[resolved];
    element.dataset.theme = resolved;
    element.dataset.palette = theme.id;
    element.style.colorScheme = resolved;
    for (const key of tokens) element.style.setProperty('--'+key,colors[key]);
    // Resolve aliases at the same scope so nested previews do not inherit the root palette.
    for (const [key,source] of Object.entries(aliases)) element.style.setProperty('--'+key,colors[source]);
    setOrRemove(element.style, '--ely-control-radius', theme.radius);
    const sans = typeof theme.font === 'string' ? theme.font : theme.font?.sans;
    const mono = typeof theme.font === 'object' ? theme.font?.mono : undefined;
    setOrRemove(element.style, '--font-sans', sans);
    setOrRemove(element.style, '--font-mono', mono);
    if (element === root) syncThemeColor(colors['color-paper']);
  }
  let activeId = 'ely';
  let activeMode = 'system';
  const sync = () => {
    const darkMode = root.dataset.theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', String(darkMode));
      button.setAttribute('aria-label', darkMode ? 'Switch to light mode' : 'Switch to dark mode');
    });
    document.querySelectorAll('[data-theme-select]').forEach(select => {
      if ('value' in select) select.value = activeMode;
    });
    syncThemeColor();
  };
  function register(value) {
    const theme = validate(value);
    if (builtins.has(theme.id)) throw new Error('Use a new id to customize a built-in theme.');
    if (issues(theme).length) throw new Error('Fix the text or input border contrast before applying this theme.');
    palettes.set(theme.id,theme);
    return copy(theme);
  }
  function apply(id, mode = activeMode) {
    const targetMode = modeOf(mode), resolved = resolveMode(targetMode);
    if (modeOnly) {
      activeMode = targetMode;
      root.dataset.theme = resolved;
      root.style.colorScheme = resolved;
      syncThemeColor();
      save('ely-theme', activeMode);
      sync();
      document.dispatchEvent(new CustomEvent('ely:theme-change', {detail:{id:root.dataset.palette || activeId, mode:resolved, preference:activeMode}}));
      return;
    }
    const targetId = id == null ? activeId : id;
    const theme = get(targetId);
    if (issues(theme).length) throw new Error('Fix the text or input border contrast before applying this theme.');
    activeId = targetId;
    activeMode = targetMode;
    preview(root,theme,resolved);
    save('ely-palette',activeId);
    save('ely-theme',activeMode);
    if (!builtins.has(activeId)) save('ely-custom-theme',JSON.stringify(theme));
    sync();
    document.dispatchEvent(new CustomEvent('ely:theme-change',{detail:{id:activeId, mode:resolved, preference:activeMode}}));
  }
  const resetMode = () => apply(activeId, 'system');
  if (modeOnly) {
    activeMode = ['light','dark','system'].includes(read('ely-theme')) ? read('ely-theme') : 'system';
    const initialResolved = resolveMode(activeMode);
    root.dataset.theme = initialResolved;
    root.style.colorScheme = initialResolved;
    syncThemeColor();
    if (typeof window.addEventListener === 'function') window.addEventListener('load', () => syncThemeColor());
  } else {
    try { register(JSON.parse(read('ely-custom-theme'))); } catch {}
    const selected = read('ely-palette');
    activeId = palettes.has(selected) && !issues(get(selected)).length ? selected : 'ely';
    const savedMode = read('ely-theme');
    activeMode = ['light','dark','system'].includes(savedMode) ? savedMode : 'system';
    preview(root,activeId,resolveMode(activeMode));
  }
  if (systemQuery) {
    const onSystemChange = () => {
      if (activeMode === 'system') apply(activeId, 'system');
    };
    if (typeof systemQuery.addEventListener === 'function') systemQuery.addEventListener('change', onSystemChange);
    else if (typeof systemQuery.addListener === 'function') systemQuery.addListener(onSystemChange);
  }
  window.ElyTheme = Object.freeze({
    tokens:Object.freeze([...tokens]),
    list:()=>[...palettes.values()].map(({id,name})=>({id,name})),
    get, register, apply, resetMode, preview, issues,
    current:()=>({id: modeOnly ? (root.dataset.palette || activeId) : root.dataset.palette, mode:root.dataset.theme, preference:activeMode}),
  });
  document.addEventListener('DOMContentLoaded',sync);
  document.addEventListener('htmx:after:swap',sync);
  document.addEventListener('htmx:afterSwap',sync);
  document.addEventListener('click',event => {
    if (event.target.closest?.('[data-theme-toggle]')) apply(activeId, root.dataset.theme === 'dark' ? 'light' : 'dark');
  });
  document.addEventListener('change',event => {
    const select = event.target.closest?.('[data-theme-select]');
    if (select && ['light','dark','system'].includes(select.value)) apply(activeId, select.value);
  });
})();
