// Pure observation wrapper. Native handles, receivers, callback arguments,
// callback results/errors and cancellation calls retain their original semantics.
function installCopyTimerTrace(host, describe, record) {
  const originalSet = host.setTimeout, originalClear = host.clearTimeout;
  const timers = new Map(); let nextTimer = 0;
  host.setTimeout = function(callback, delay, ...args) {
    const owner = typeof callback === 'function' && delay === 1400 ? describe() : null;
    if (!owner) return Reflect.apply(originalSet, this, [callback, delay, ...args]);
    const timer = ++nextTimer;
    let handle;
    const observe = event => record('timer', {event, timer, delay, ...owner.binding, ...owner.state()});
    const wrapped = function(...callbackArgs) {
      timers.delete(handle); observe('fired');
      try { return Reflect.apply(callback, this, callbackArgs); }
      finally { observe('completed'); }
    };
    handle = Reflect.apply(originalSet, this, [wrapped, delay, ...args]);
    timers.set(handle, observe); owner.scheduled(); observe('scheduled');
    return handle;
  };
  host.clearTimeout = function(handle, ...args) {
    const result = Reflect.apply(originalClear, this, [handle, ...args]);
    const observe = timers.get(handle);
    if (observe) { timers.delete(handle); observe('cancelled'); }
    return result;
  };
}
// End pure timer observation wrapper.
// Observes production behavior only. No presentation, state or owner repairs.
(() => {
  const nodes = new WeakMap(), observedNodes = new Map(); let nextNode = 0, sequence = 0;
  const token = node => node ? (nodes.has(node) ? nodes.get(node) : (nodes.set(node, ++nextNode), observedNodes.set(nextNode, node), nextNode)) : null;
  const log = [], pending = [], errors = [];
  const record = (type, data = {}) => { const row = {sequence: ++sequence, time: performance.now(), type, ...data}; log.push(row); return row; };
  let mode = 'success', lastInput = null;
  for (const type of ['pointerdown','pointerup','pointercancel','click','contextmenu','keydown','keyup','focusin','focusout','submit']) {
    document.addEventListener(type, event => {
      const row = record('input', {event: type, trusted: event.isTrusted, key: event.key ?? null, button: event.button ?? null, target: token(event.target), targetID: event.target.id || '', rootID: event.target.closest?.('[data-ely-family]')?.id || '', root:token(event.target.closest?.('[data-ely-family]')),control:token(event.target.closest?.('[data-interaction-copy]')), active: token(document.activeElement), defaultPrevented: event.defaultPrevented});
      if (type === 'click' || type === 'keydown' || type === 'keyup') lastInput = {...row, control: token(event.target.closest?.('[data-interaction-copy]'))};
      if (type === 'submit') event.preventDefault();
    }, true);
  }
  for (const type of ['ely:action','ely:change','ely:result','ely:error','ely:cleanup','htmx:before:swap','htmx:after:swap','htmx:finally:swap']) document.addEventListener(type, event => {
    const detail = event.detail || {};
    record('event', {event: type, rootID: event.target.id || '', target: token(event.target), detail: {id: detail.id ?? null, component: detail.component ?? null, action: detail.action ?? null, name: detail.name ?? null, value: detail.value ?? null, copied: detail.copied ?? null, error: detail.error ? String(detail.error.message || detail.error) : null}, tasks: (detail.tasks || []).map(task => ({target: token(typeof task.target === 'string' ? document.querySelector(task.target) : task.target), style: typeof task.swapSpec === 'string' ? task.swapSpec.split(/\s+/)[0] : task.swapSpec?.style ?? null}))});
  }, true);
  const mock = {writeText(value) {
    const call = record('clipboard-call', {value, input: lastInput?.sequence??null, control:lastInput?.control??null, rootID:lastInput?.rootID??'',root:lastInput?.root??null, active: token(document.activeElement), mode});
    if (mode === 'real') return realClipboard.writeText(value).then(()=>record('clipboard-settle',{call:call.sequence,outcome:'resolve'}),error=>{record('clipboard-settle',{call:call.sequence,outcome:'reject'});throw error;});
    if (mode === 'throw') { record('clipboard-settle', {call: call.sequence, outcome: 'throw'}); throw new Error('Clipboard unavailable'); }
    const settle = outcome => { record('clipboard-settle', {call: call.sequence, outcome}); if (outcome === 'reject') throw new Error('Clipboard denied'); };
    if (mode === 'pending') return new Promise((resolve, reject) => pending.push({call: call.sequence, resolve() {record('clipboard-settle', {call: call.sequence, outcome: 'resolve'}); resolve();}, reject() {record('clipboard-settle', {call: call.sequence, outcome: 'reject'}); reject(new Error('Clipboard denied'));}}));
    return Promise.resolve().then(() => settle(mode === 'reject' ? 'reject' : 'resolve'));
  },readText(){return realClipboard.readText();}};
  const realClipboard = navigator.clipboard;
  const setMode = value => { mode = value; Object.defineProperty(navigator, 'clipboard', {configurable: true, value: value === 'missing' ? undefined : mock}); record('mode', {value}); };
  setMode('success');
  const scheduledCalls = new Set();
  installCopyTimerTrace(window, () => {
    // Join a unique resolved write to its actual copied physical control and
    // live root. Never attribute a timer to an arbitrary nearest settlement.
    const candidates = log.filter(call => {
      if (call.type !== 'clipboard-call' || scheduledCalls.has(call.sequence)) return false;
      const node = observedNodes.get(call.control);
      return node?.isConnected && node.dataset.interactionCopied === 'true' &&
        token(node.closest('[data-ely-family]')) === call.root &&
        log.some(row => row.type === 'clipboard-settle' && row.call === call.sequence && row.outcome === 'resolve');
    });
    if (candidates.length !== 1) return null;
    const call = candidates[0], node = observedNodes.get(call.control);
    return {binding: {call: call.sequence, control: call.control, root: call.root},
      state: () => ({currentRoot: token(node.closest('[data-ely-family]')), copied: node.dataset.interactionCopied ?? null}),
      scheduled: () => scheduledCalls.add(call.sequence)};
  }, record);
  const visible = node => !!node && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden' && getComputedStyle(node).display !== 'none';
  const rect = node => { const r = node.getBoundingClientRect(); return {x:r.x,y:r.y,width:r.width,height:r.height}; };
  const style = node => { const s = getComputedStyle(node); return Object.fromEntries(['color','backgroundColor','borderColor','borderWidth','borderRadius','outlineColor','outlineWidth','outlineStyle','opacity','cursor','flexShrink','display','width','height','transform','animationName','animationDuration','animationTimingFunction','transitionDuration','boxShadow','alignItems','justifyContent','justifyItems','fontSize','maskImage','content'].map(key => [key, s[key]])); };
  const icon = node => ({name: node.getAttribute('data-interaction-icon') || node.getAttribute('data-lucide') || node.getAttribute('data-icon') || '', hidden: node.getAttribute('aria-hidden'), visible: visible(node), rect:rect(node), style:style(node), animations:node.getAnimations().map(a=>({id:a.id, currentTime:a.currentTime,playState:a.playState, timing:a.effect?.getTiming(), frames:a.effect?.getKeyframes().map(f=>({offset:f.offset,transform:f.transform??null,easing:f.easing}))}))});
  const pseudo = (node, which) => { const s=getComputedStyle(node, which), name=s.maskImage.match(/\/(copy|check)\.svg/)?.[1]||'', zoom=node.getBoundingClientRect().width/parseFloat(getComputedStyle(node).width)||1; return {name,hidden:'true',visible:visible(node)&&s.display!=='none'&&s.content!=='none'&&s.maskImage!=='none',rect:{x:0,y:0,width:parseFloat(s.width)*zoom||0,height:parseFloat(s.height)*zoom||0},style:Object.fromEntries(['color','backgroundColor','maskImage','content','transform','animationName','animationDuration','animationTimingFunction'].map(k=>[k,s[k]])),animations:node.getAnimations().filter(a=>a.effect?.pseudoElement===which).map(a=>({id:a.id,currentTime:a.currentTime,playState:a.playState,timing:a.effect.getTiming(),frames:a.effect.getKeyframes().map(f=>({offset:f.offset,transform:f.transform??null,easing:f.easing}))}))}; };
  const renderedText = node => { const range=document.createRange(); return [...node.childNodes].filter(n=>{ if(n.nodeType===3){range.selectNodeContents(n);return getComputedStyle(node).fontSize!=='0px'&&range.getBoundingClientRect().width>0&&!!n.textContent.trim();} return n.nodeType===1&&visible(n)&&!n.matches('[aria-hidden=true]')&&!n.classList.contains('sr-only')&&getComputedStyle(n).fontSize!=='0px';}).map(n=>n.textContent.trim()).join(' '); };
  const control = node => ({token:token(node),id:node.id,tag:node.tagName,type:node.getAttribute('type'),variant:node.getAttribute('data-variant'),size:node.getAttribute('data-size'),value:node.value, text:node.textContent.trim(), ariaLabel:node.getAttribute('aria-label'),title:node.getAttribute('title'), describedBy:node.getAttribute('aria-describedby'),pressed:node.getAttribute('aria-pressed'),disabled:node.disabled,ariaDisabled:node.getAttribute('aria-disabled'),busy:node.getAttribute('aria-busy'),copied:node.dataset.interactionCopied??null,focused:document.activeElement===node,focusVisible:node.matches(':focus-visible'),visible:visible(node),connected:node.isConnected,rect:rect(node),style:style(node),icons:[...node.querySelectorAll('[data-interaction-icon], [data-lucide], [data-icon]')].map(icon).concat([pseudo(node,'::before'),pseudo(node,'::after')]),visibleText:renderedText(node)});
  const root = selector => {
    const candidate=document.querySelector(selector); const node=candidate?.matches('[data-ely-family]')?candidate:candidate?.querySelector('[data-ely-family]'); if (!node) return null;
    const success = document.createElement('span'); success.style.color='var(--color-success)'; node.append(success); const themeSuccess=getComputedStyle(success).color; success.remove();
    return {token:token(node),id:node.id,ready:node.dataset.elyReady??null,connected:node.isConnected,controls:[...node.querySelectorAll('[data-interaction-copy]')].map(control),statuses:[...node.querySelectorAll('[data-interaction-copy-status]')].map(n=>({text:n.textContent,live:n.getAttribute('aria-live'),role:n.getAttribute('role')})),tooltips:[...document.querySelectorAll('[role=tooltip]')].filter(t=>visible(t)&&(node.contains(t)||[...node.querySelectorAll('[aria-describedby]')].some(c=>c.getAttribute('aria-describedby').split(/\s+/).includes(t.id)))).map(n=>({id:n.id,text:n.textContent.trim(),rect:rect(n)})),themeSuccess,themeForeground:getComputedStyle(node).color};
  };
  // CSS animation events retain a real start sample even when a short,
  // fill:none animation finishes while the capture waits for fonts.
  for (const eventName of ['animationstart','animationend']) document.addEventListener(eventName, event => {
    const node=event.target, control=node.closest?.('[data-interaction-copy]'), root=control?.closest('[data-ely-family]'); if(!control||!root)return;
    const call=[...log].reverse().find(r=>r.type==='clipboard-call'&&r.control===token(control)&&r.root===token(root)&&log.some(s=>s.type==='clipboard-settle'&&s.call===r.sequence&&s.outcome==='resolve'));
    const sample=event.pseudoElement?pseudo(node,event.pseudoElement):icon(node);
    record('animation',{event:eventName,control:token(control),root:token(root),call:call?.sequence??null,pseudo:event.pseudoElement||'',icon:sample.name,animations:sample.animations});
  },true);
  window.copyProbe = {
    log, errors, pending, token, setMode, record,
    settle(index = 0, outcome = 'resolve') { const item = pending[index]; if (!item) throw new Error('No pending clipboard call'); pending.splice(index,1); item[outcome](); },
    capture(name) { const checkpoint=record('checkpoint',{name}); return {name,sequence:checkpoint.sequence,time:checkpoint.time,active:token(document.activeElement),activeID:document.activeElement?.id||'',scrollY,roots:Object.fromEntries(['#copy-a','#copy-b','#copy-empty','#copy-disabled','#copy-items','#copy-override','#copy-adapter','#copy-adapter-disabled'].map(selector=>[selector,root(selector)]))}; },
  };
})();
