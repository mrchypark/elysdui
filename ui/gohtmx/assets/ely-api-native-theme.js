const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const hex = value => typeof value === 'string' && /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value);
const colorKeys = {
  bg:['editor.background'], surface:['sideBar.background','editorWidget.background'], sunken:['input.background','editorGroupHeader.tabsBackground'],
  overlay:['editorWidget.background','quickInput.background'], hover:['list.hoverBackground','toolbar.hoverBackground'], active:['list.activeSelectionBackground','list.inactiveSelectionBackground'],
  border:['panel.border','sideBar.border','editorGroup.border'], border_strong:['input.border','contrastBorder'], fg:['editor.foreground','foreground'],
  fg_muted:['descriptionForeground'], fg_subtle:['editorLineNumber.foreground'], fg_disabled:['disabledForeground'], accent:['button.background'],
  accent_hover:['button.hoverBackground'], on_accent:['button.foreground'], focus:['focusBorder'], link:['textLink.foreground'], selection:['editor.selectionBackground'],
  success:['gitDecoration.addedResourceForeground','terminal.ansiGreen'], warning:['editorWarning.foreground','list.warningForeground'], danger:['errorForeground','editorError.foreground'],
  info:['editorInfo.foreground'], tooltip_bg:['editorHoverWidget.background'], tooltip_fg:['editorHoverWidget.foreground'], shadow:['widget.shadow'],
};
const scopeKeys = {keyword:['keyword','storage.type','storage'],string:['string'],number:['constant.numeric'],comment:['comment'],function:['entity.name.function','support.function'],type_name:['entity.name.type','support.type','entity.name.class'],constant:['constant.language','constant'],property:['variable.other.property','support.type.property-name'],tag:['entity.name.tag'],attribute:['entity.other.attribute-name'],operator:['keyword.operator'],punctuation:['punctuation'],variable:['variable']};

export function updateThemeToken(text, token, value) {
  if (!/^--[a-zA-Z][\w-]*$/.test(token) || !hex(value)) throw Error('Invalid color token.');
  const pattern = new RegExp('(^|;)(' + '\\s*' + token + '\\s*:\\s*)([^;]*)', 'g');
  let found = false;
  const next = text.replace(pattern, (_, prefix, key) => { found = true; return prefix + key + value; });
  return found ? next : text + (text.trim() && !text.trimEnd().endsWith(';') ? ';' : '') + (text ? '\n' : '') + token + ': ' + value + ';';
}

// Keep quoted strings intact while accepting VS Code's comments and trailing commas.
export function readTheme(text, baseTokens = '') {
  if (text.length > 1048576) throw Error('Theme exceeds 1 MiB.');
  const plain = text.replace(/"(?:\\.|[^"\\])*"|\/\/[^\r\n]*|\/\*[\s\S]*?\*\//g, part => part.startsWith('"') ? part : ' ')
    .replace(/"(?:\\.|[^"\\])*"|,(\s*[}\]])/g, (part, close) => close || part);
  const theme = JSON.parse(plain);
  if (!object(theme) || !['light','dark','hc-light','hc-black'].includes(theme.type)) throw Error('Theme type must be light, dark, hc-light, or hc-black.');
  if (!object(theme.colors)) throw Error('Theme colors must be an object.');
  for (const [key, value] of Object.entries(theme.colors)) if (!hex(value)) throw Error('Invalid color: ' + key);
  const rules = theme.tokenColors ?? [];
  if (!Array.isArray(rules)) throw Error('Theme tokenColors must be a list.');
  for (const rule of rules) {
    if (!object(rule) || !object(rule.settings)) throw Error('Invalid syntax rule.');
    if (rule.scope != null && typeof rule.scope !== 'string' && !(Array.isArray(rule.scope) && rule.scope.every(scope => typeof scope === 'string'))) throw Error('Invalid syntax scope.');
    for (const key of ['foreground','background']) if (rule.settings[key] != null && !hex(rule.settings[key])) throw Error('Invalid syntax color: ' + key);
  }
  const colors = {}, syntax = {}, ansi = {}, named = [], kept = [];
  for (const [token, keys] of Object.entries(colorKeys)) {
    const key = keys.find(key => Object.hasOwn(theme.colors, key));
    if (key) { colors[token] = theme.colors[key]; named.push(token); } else kept.push(token);
  }
  for (const [token, scopes] of Object.entries(scopeKeys)) {
    const rule = scopes.map(scope => rules.find(rule => {
      const names = typeof rule.scope === 'string' ? rule.scope.split(',').map(name => name.trim()) : rule.scope || [];
      return names.includes(scope) && rule.settings.foreground != null;
    })).find(Boolean);
    if (rule) { syntax[token] = rule.settings.foreground; named.push(token); } else kept.push(token);
  }
  const names = ['Black','Red','Green','Yellow','Blue','Magenta','Cyan','White'];
  [...names,...names.map(name => 'Bright'+name)].forEach((name,index) => {
    const value = theme.colors['terminal.ansi'+name];
    if (value) ansi[index] = value;
  });
  let tokens = baseTokens;
  for (const [token,value] of Object.entries(colors)) tokens = updateThemeToken(tokens, '--'+token.replaceAll('_','-'), value);
  for (const [token,value] of Object.entries(syntax)) tokens = updateThemeToken(tokens, '--syntax-'+token.replaceAll('_','-'), value);
  for (const [index,value] of Object.entries(ansi)) tokens = updateThemeToken(tokens, '--ansi-'+index, value);
  return {name:typeof theme.name === 'string' ? theme.name : '',mode:['dark','hc-black'].includes(theme.type)?'dark':'light',colors,syntax,ansi,named,kept,tokens};
}

export function motionPosition(curve, t) {
  if (curve === 'spring' || curve === 'Spring') {
    if (t >= 1) return 1;
    const damping=.75, omega=6.91/damping, damped=omega*Math.sqrt(1-damping*damping);
    return 1-Math.exp(-damping*omega*t)*(Math.cos(damped*t)+damping*omega/damped*Math.sin(damped*t));
  }
  if (curve === 'ease-in-out' || curve === 'Ease in out') return t < .5 ? 4*t*t*t : 1-Math.pow(-2*t+2,3)/2;
  return 1-Math.pow(1-t,3);
}

export function localizedMessages(catalogs, locale, messages) {
  if (!object(catalogs) || !object(catalogs[locale])) throw Error('No catalog for '+locale);
  const first = Object.values(catalogs)[0], keys = Object.keys(first);
  for (const catalog of Object.values(catalogs)) {
    if (!object(catalog) || Object.keys(catalog).length !== keys.length || keys.some(key => !Object.hasOwn(catalog,key) || typeof catalog[key] !== 'string')) throw Error('Catalogs must contain the same message keys.');
  }
  return messages.map(({key,args}) => {
    if (!Object.hasOwn(catalogs[locale],key)) throw Error('Missing message: '+key);
    const text = catalogs[locale][key];
    if (/\{[^}]*$/.test(text)) throw Error('Unclosed message argument.');
    return text.replace(/\{([^}]*)\}/g, (_, name) => {
      if (!object(args) || !Object.hasOwn(args,name)) throw Error('Missing argument: '+name);
      const value = args[name];
      if (object(value) && Object.hasOwn(value,'number')) {
        if (!Number.isFinite(value.number)) throw Error('Invalid numeric argument: '+name);
        return new Intl.NumberFormat(locale,{minimumFractionDigits:value.decimals??0,maximumFractionDigits:value.decimals??0}).format(value.number);
      }
      if (object(value) && Object.hasOwn(value,'date')) return new Intl.DateTimeFormat(locale,{dateStyle:'short',timeZone:value.timeZone||'UTC'}).format(new Date(value.date));
      if (!['string','number','boolean'].includes(typeof value)) throw Error('Invalid argument: '+name);
      return String(value);
    });
  });
}

// The nearest explicit theme wins; a nested light preview must not inherit dark
// from the document. Colors without a supplied dark variant remain caller-owned.
export function nativeThemeMode(root) {
  for(let node=root;node;node=node.parentElement)if(['light','dark'].includes(node.dataset?.theme))return node.dataset.theme;
  return root.ownerDocument?.defaultView?.getComputedStyle(root).colorScheme==='dark'?'dark':'light';
}
export function nativeModeColor(root,light,dark) { return nativeThemeMode(root)==='dark'&&dark?dark:light; }

export function initNativeTheme(root, change, emit) {
  const cleanups = [], listen = (node,type,fn,capture=false) => { node?.addEventListener(type,fn,capture); cleanups.push(()=>node?.removeEventListener(type,fn,capture)); };
  const themeUpdates=[];
  const colorNodes=[...root.querySelectorAll('[data-native-color-dark]')];
  if(colorNodes.length){const sync=()=>colorNodes.forEach(node=>{const d=node.dataset,value=nativeModeColor(root,d.nativeColorLight,d.nativeColorDark);if('nativeSignalStrong' in d){d.nativeSignalStrong=value;d.nativeSignalQuiet=nativeModeColor(root,d.nativeQuietLight,d.nativeQuietDark);node.style.setProperty('--native-signal-strong',value);node.style.setProperty('--native-signal-quiet',d.nativeSignalQuiet);}else if('nativeSyntaxColor' in d){d.nativeSyntaxColor=value;node.style.color=value;}else{d.nativeSwatch=value;node.style.setProperty('--native-swatch',value);}});themeUpdates.push(sync);sync();}
  root.querySelectorAll('[data-native-radius]').forEach(node => {
    if (/^\d+(?:\.\d+)?(?:px|rem|em|%)$/.test(node.dataset.nativeRadius)) node.style.borderRadius=node.dataset.nativeRadius;
  });
  root.querySelectorAll('.ely-native-motion').forEach(motion => {
    const dots=[...motion.querySelectorAll('[data-native-motion-dot]')], reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let animations=[];
    const play = (replay=false) => {
      animations.forEach(animation=>animation.cancel()); animations=[];
      const still=reduced.matches || motion.dataset.nativeReducedMotion==='true';
      for (const dot of dots) {
        const travel=Math.max(0,dot.parentElement.clientWidth-12);
        dot.style.left=(still?travel:0)+'px';
        if (!still && dot.animate) {
          const frames=Array.from({length:241},(_,index)=>{
            const t=index/240,curve=dot.dataset.nativeMotionKind;
            const offset=t<.42?motionPosition(curve,t/.42):t<.5?1:t<.92?1-motionPosition(curve,(t-.5)/.42):0;
            return {left:offset*travel+'px',offset:t};
          });
          animations.push(dot.animate(frames,{duration:2400,iterations:Infinity}));
        }
      }
      root.dataset.nativeMotionRunning=String(!still);
      motion.querySelectorAll('[data-native-motion-track]').forEach(track=>track.value=still?'100':'0');
      if(replay){motion.querySelector('[data-native-motion-status]').textContent=still?'Reduced motion: end position':'Motion replayed';change(root,{motion:'replayed',reducedMotion:still});}
    };
    listen(motion.querySelector('[data-native-motion-replay]'),'click',()=>play(true));
    listen(reduced,'change',()=>play());
    const resize=new ResizeObserver(()=>play());resize.observe(motion);play();
    cleanups.push(()=>{resize.disconnect();animations.forEach(animation=>animation.cancel());});
  });
  root.querySelectorAll('.ely-native-theme-editor').forEach(form => {
    const tokens=form.elements.tokens, error=form.querySelector('[data-native-theme-error]'),dirty=new Set();let tokensEdited=false;
    const sync = event => {
      try {
        if(event?.target===tokens)tokensEdited=true;
        if(event?.target.matches('[data-native-theme-color]'))dirty.add(event.target.dataset.nativeThemeColor);
        if (event?.target.matches('[data-native-theme-color]')) tokens.value=updateThemeToken(tokens.value,event.target.dataset.nativeThemeColor,event.target.value);
        form.querySelectorAll('[data-native-theme-color]').forEach(input=>{
          const token=input.dataset.nativeThemeColor;
          if(!/^--[a-zA-Z][\w-]*$/.test(token))throw Error('Invalid color token.');
          const match=tokens.value.match(new RegExp('(?:^|;)\\s*'+token+'\\s*:\\s*([^;]+)'));
          if(match && /^#[\da-f]{6}$/i.test(match[1].trim()))input.value=match[1].trim();
          input.previousElementSibling.textContent=match?match[1].trim():input.value;
        });
        const draft={density:form.elements.density.value,radius:Number(form.elements.radius.value),fontScale:Number(form.elements.fontScale.value),highContrast:form.elements.highContrast.checked,reducedMotion:form.elements.reducedMotion.checked,tokens:tokens.value};
        form.querySelectorAll('[data-native-density]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.nativeDensity===draft.density)));
        root.dataset.nativeHighContrast=String(draft.highContrast);root.dataset.nativeReducedMotion=String(draft.reducedMotion);
        const preview=form.querySelector('[data-native-theme-preview]');
        preview.style.borderRadius=(8*draft.radius)+'px';preview.style.fontSize=(13*draft.fontScale)+'px';preview.style.padding={compact:'8px',standard:'12px',comfortable:'16px'}[draft.density];
        for(const [property,names] of Object.entries({backgroundColor:['--bg','--surface-canvas'],color:['--fg','--ink-primary']})){
          const value=names.map(name=>tokens.value.match(new RegExp('(?:^|;)\\s*'+name+'\\s*:\\s*([^;]+)'))?.[1].trim()).find(Boolean);
          preview.style[property]=value && CSS.supports('color',value)?value:'';
        }
        preview.style.outline=draft.highContrast?'2px solid currentColor':'';
        error.textContent='';if(event)change(root,{draft});
      }catch(cause){error.textContent=cause.message;}
    };
    listen(form,'input',sync);listen(form,'change',sync);
    form.querySelectorAll('[data-native-density]').forEach(button=>listen(button,'click',()=>{if(button.disabled||button.closest('fieldset[disabled]'))return;form.elements.density.value=button.dataset.nativeDensity;form.elements.density.dispatchEvent(new Event('change',{bubbles:true}));}));
    const modeSync=()=>{if(!tokensEdited)form.querySelectorAll('[data-native-theme-dark]').forEach(input=>{if(!dirty.has(input.dataset.nativeThemeColor))tokens.value=updateThemeToken(tokens.value,input.dataset.nativeThemeColor,nativeModeColor(root,input.dataset.nativeThemeLight,input.dataset.nativeThemeDark));});sync();};
    themeUpdates.push(modeSync);modeSync();
  });
  root.querySelectorAll('.ely-native-theme-import').forEach(importer => {
    const form=importer.querySelector('form'),field=form.elements.tokens,error=form.querySelector('[data-native-theme-error]'),summary=form.querySelector('[data-native-theme-summary]');
    let revision=0, pending=false, alive=true, fileName='';
    const validate = () => {
      try { const theme=readTheme(field.value,importer.dataset.nativeBaseTokens||'');error.textContent='';summary.textContent=(theme.name||fileName||'Theme')+' · '+theme.mode+' · Names '+theme.named.length+' of '+(theme.named.length+theme.kept.length)+' colors';return theme; }
      catch(cause){error.textContent=cause.message;summary.textContent='';return null;}
    };
    const readFile = async file => {
      if(!file)return;const current=++revision;pending=true;
      try {if(file.size>1048576)throw Error('Theme exceeds 1 MiB.');const text=await file.text();if(!alive||current!==revision)return;field.value=text;fileName=file.name;validate();}
      catch(cause){if(alive&&current===revision){field.value='';error.textContent=cause.message;summary.textContent='';}}
      finally{if(current===revision)pending=false;}
    };
    listen(form.elements['theme-file'],'change',event=>readFile(event.target.files[0]));
    listen(field,'input',()=>{revision++;pending=false;validate();});
    const drop=importer.querySelector('[data-native-theme-drop]');
    listen(drop,'dragover',event=>event.preventDefault());
    listen(drop,'drop',event=>{event.preventDefault();if(root.dataset.elyDisabled!=='true')readFile(event.dataTransfer.files[0]);});
    listen(form,'submit',event=>{
      event.preventDefault();event.stopImmediatePropagation();
      if(pending){error.textContent='Wait for the theme file to finish reading.';return;}
      const theme=validate();if(!theme)return;
      const formData=new FormData(form);emit(root,form.dataset.elySubmit,{theme,formData,values:[...formData],submitter:event.submitter?.value||''});
    },true);
    listen(importer,'change',event=>{
      const choice=event.target;if(!choice.matches('[data-native-syntax-choice]'))return;
      try {const theme=choice.dataset.nativeSyntaxTokens?readTheme(choice.dataset.nativeSyntaxTokens,importer.dataset.nativeBaseTokens||''):null;
        const preview=importer.querySelector('[data-native-syntax-preview]');preview.dataset.selected=choice.value;
        preview.style.color=theme?.syntax.keyword||'';error.textContent='';change(root,{syntaxTheme:choice.value,theme});
      }catch(cause){error.textContent=cause.message;}
    });
    importer.querySelectorAll('[data-native-syntax-choice]').forEach(choice=>{
      if(!choice.dataset.nativeSyntaxTokens)return;
      try {const theme=readTheme(choice.dataset.nativeSyntaxTokens);
        choice.closest('label').querySelectorAll('[data-native-code-token]').forEach(token=>token.style.color=theme.syntax[token.dataset.nativeCodeToken]||'');
      }catch(cause){error.textContent=cause.message;}
    });
    if(field.value.trim())validate();
    cleanups.push(()=>{alive=false;revision++;});
  });
  root.querySelectorAll('.ely-native-platform').forEach(platform=>{
    const sync=event=>{
      const value=platform.querySelector('input[name$="-platform"]:checked')?.value||'macOS',owned=platform.querySelector('[data-native-icon-theme]').checked;
      platform.dataset.platform=value;root.dataset.nativeIconTheme=String(owned);
      platform.querySelector('[data-native-platform-save]').textContent=value==='macOS'?'⌘ S':'Ctrl S';
      platform.querySelector('[data-native-platform-combo]').textContent=value==='macOS'?'⌘ K ⌘ S':'Ctrl K Ctrl S';
      platform.querySelectorAll('[data-native-platform-icon]').forEach(icon=>{const name=owned?icon.dataset.ownerIcon:icon.dataset.defaultIcon;if(/^[a-z0-9-]+$/.test(name))icon.style.setProperty('--native-icon-url','url("/assets/ely/icons/'+name+'.svg")');});
      if(event)change(root,{platform:value,iconTheme:owned});
    };listen(platform,'change',sync);sync();
  });
  root.querySelectorAll('[data-native-locale-scope]').forEach(scope=>{
    const select=scope.querySelector('select[data-native-locale]'),error=scope.querySelector('[data-native-locale-error]');
    let previous=select?.value||scope.dataset.locale||'en-US';
    const sync=event=>{
      try {
        const locale=select?.value||scope.dataset.locale||'en-US',output=scope.querySelector('[data-native-formatted]'),date=scope.querySelector('[data-native-formatted-date]');
        const number=output?formatLocaleNumber(output.dataset.value,locale,Number(output.dataset.decimals)):'';
        const formattedDate=date?formatLocaleDate(date.dateTime,locale,date.dataset.timeZone||'UTC'):'';
        const nodes=[...scope.querySelectorAll('[data-native-message]')];
        const messages=nodes.length?localizedMessages(JSON.parse(scope.dataset.catalogs),locale,nodes.map(node=>({key:node.dataset.nativeMessage,args:JSON.parse(node.dataset.args||'{}')}))):[];
        if(output)output.textContent=number;if(date)date.textContent=formattedDate;nodes.forEach((node,index)=>node.textContent=messages[index]);
        const info=new Intl.Locale(locale),direction=info.getTextInfo?.().direction||info.textInfo?.direction||(/^(ar|he|fa|ur)(-|$)/i.test(locale)?'rtl':'ltr');
        scope.dir=scope.classList.contains('ely-native-format-row')?'ltr':scope.dataset.nativeForceRtl==='true'?'rtl':direction;scope.lang=locale;scope.dataset.locale=locale;previous=locale;error.textContent='';
        if(event)change(root,{locale,direction:scope.dir,messages});
      }catch(cause){if(select)select.value=previous;scope.dataset.locale=previous;error.textContent=cause.message;}
    };if(select)listen(select,'change',sync);sync();
    if(!scope.classList.contains('ely-native-format-row'))listen(root,'ely:locale',event=>{
      if(typeof event.detail?.locale!=='string')return;
      scope.dataset.locale=event.detail.locale;if(select)select.value=event.detail.locale;sync(event);
    });
  });
  root.querySelectorAll('.ely-native-skip-link').forEach(link=>listen(link,'click',event=>{
    const target=link.closest('.ely-native-skip-demo')?.querySelector('[data-native-skip-target]');
    if(target){event.preventDefault();target.focus();}
  }));
  root.querySelectorAll('.ely-native-color-safe').forEach(palette=>{
    const toggle=palette.querySelector('[data-native-color-safe]');
    const sync=()=>{
      palette.querySelectorAll('[data-native-standard-color]').forEach(swatch=>{
        const d=swatch.dataset;if(d.nativeStandardDark){d.nativeStandardColor=nativeModeColor(root,d.nativeStandardLight,d.nativeStandardDark);d.nativeSafeColor=nativeModeColor(root,d.nativeSafeLight,d.nativeSafeDark);}
        const value=toggle.checked?d.nativeSafeColor:d.nativeStandardColor;
        if(hex(value)){swatch.dataset.nativeSwatch=value;swatch.style.setProperty('--native-swatch',value);}
      });
      root.dataset.nativeColorSafe=String(toggle.checked);
    };
    listen(toggle,'change',sync);themeUpdates.push(sync);sync();
  });
  if(themeUpdates.length){const refresh=()=>themeUpdates.forEach(update=>update()),doc=root.ownerDocument;listen(root,'ely:theme',refresh);listen(doc,'ely:theme-change',refresh);const Observer=doc?.defaultView?.MutationObserver;if(Observer){const observer=new Observer(refresh);for(let node=root;node;node=node.parentElement)observer.observe(node,{attributes:true,attributeFilter:['data-theme','class','style']});cleanups.push(()=>observer.disconnect());}}
  return ()=>cleanups.forEach(cleanup=>cleanup());
}

export function formatLocaleNumber(value, locale, decimals = 2) {
  const number=Number(value);
  if(value===''||!Number.isFinite(number)||!Number.isInteger(decimals)||decimals<0||decimals>20)throw Error('Invalid number or decimal count.');
  return new Intl.NumberFormat(locale,{minimumFractionDigits:decimals,maximumFractionDigits:decimals}).format(number).replace('-', '\u2212');
}

export function formatLocaleDate(value, locale, timeZone = 'UTC') {
  // These seven source locales have explicit CLDR short-date patterns.
  const fields=Object.fromEntries(new Intl.DateTimeFormat('en-US',{year:'numeric',month:'numeric',day:'numeric',timeZone}).formatToParts(new Date(value)).map(part=>[part.type,part.value]));
  const {year:y,month:m,day:d}=fields,mm=m.padStart(2,'0'),dd=d.padStart(2,'0');
  const formats={'en-US':`${m}/${d}/${y.slice(-2)}`,'en-GB':`${dd}/${mm}/${y}`,'de-DE':`${dd}.${mm}.${y.slice(-2)}`,'fr-FR':`${dd}/${mm}/${y}`,'ja-JP':`${y}/${mm}/${dd}`,'zh-CN':`${y}/${m}/${d}`,'he-IL':`${d}.${m}.${y}`};
  return formats[locale]||new Intl.DateTimeFormat(locale,{dateStyle:'short',timeZone}).format(new Date(value));
}
