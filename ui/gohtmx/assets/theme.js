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
  const modeOf = value => { if (!['light','dark'].includes(value)) throw new Error('Mode must be light or dark.'); return value; };
  function validate(theme) {
    if (!theme || typeof theme.id !== 'string' || !/^[a-z][a-z0-9-]{0,47}$/.test(theme.id) || typeof theme.name !== 'string' || !theme.name.trim() || theme.name.length > 80 || Object.keys(theme).some(key => !['id','name','light','dark'].includes(key))) throw new Error('A theme requires id, name, light, and dark.');
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
  function preview(element, value, mode) {
    const theme = typeof value === 'string' ? get(value) : validate(value), colors = theme[modeOf(mode)];
    element.dataset.theme = mode;
    element.dataset.palette = theme.id;
    element.style.colorScheme = mode;
    for (const key of tokens) element.style.setProperty('--'+key,colors[key]);
    // Resolve aliases at the same scope so nested previews do not inherit the root palette.
    for (const [key,source] of Object.entries(aliases)) element.style.setProperty('--'+key,colors[source]);
  }
  const root = document.documentElement;
  const sync = () => {
    const darkMode = root.dataset.theme === 'dark';
    document.querySelectorAll('[data-theme-toggle]').forEach(button => {
      button.setAttribute('aria-pressed', String(darkMode));
      button.setAttribute('aria-label', darkMode ? 'Switch to light mode' : 'Switch to dark mode');
    });
  };
  function register(value) {
    const theme = validate(value);
    if (builtins.has(theme.id)) throw new Error('Use a new id to customize a built-in theme.');
    if (issues(theme).length) throw new Error('Fix the text or input border contrast before applying this theme.');
    palettes.set(theme.id,theme);
    return copy(theme);
  }
  function apply(id, mode = root.dataset.theme) {
    const theme = get(id);
    if (issues(theme).length) throw new Error('Fix the text or input border contrast before applying this theme.');
    preview(root,theme,mode);
    save('ely-palette',id);
    save('ely-theme',mode);
    if (!builtins.has(id)) save('ely-custom-theme',JSON.stringify(theme));
    sync();
    document.dispatchEvent(new CustomEvent('ely:theme-change',{detail:{id,mode}}));
  }
  try { register(JSON.parse(read('ely-custom-theme'))); } catch {}
  const selected = read('ely-palette');
  const initialID = palettes.has(selected) && !issues(get(selected)).length ? selected : 'ely';
  const savedMode = read('ely-theme');
  const initialMode = ['light','dark'].includes(savedMode) ? savedMode : window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  preview(root,initialID,initialMode);
  window.ElyTheme = Object.freeze({tokens:Object.freeze([...tokens]), list:()=>[...palettes.values()].map(({id,name})=>({id,name})), get, register, apply, preview, issues, current:()=>({id:root.dataset.palette,mode:root.dataset.theme})});
  document.addEventListener('DOMContentLoaded',sync);
  document.addEventListener('htmx:after:swap',sync);
  document.addEventListener('click',event => {
    if (event.target.closest('[data-theme-toggle]')) apply(root.dataset.palette,root.dataset.theme === 'dark' ? 'light' : 'dark');
  });
})();
