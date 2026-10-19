// Test-only passive identity/event observation, plus explicitly requested host
// callbacks. No production event, DOM setter, focus API, or cache is replaced.
// The fetch tap records the unmodified transport call before forwarding it.
(() => {
  const identities = new WeakMap(), bindings = new WeakMap(); let next = 0;
  const token = object => object ? (identities.has(object) || identities.set(object, ++next), identities.get(object)) : null;
  const binding = owner => { const value=bindings.get(owner); return value ? {handlers:token(value.handlers),action:token(value.handlers.onAction),change:token(value.handlers.onChange),dispose:token(value.dispose)} : null; };
  const root = () => paletteRoot(), query = () => root().querySelector('[data-interaction-filter]');
  const node = element => element ? {token:token(element),id:element.id||'',tag:element.tagName,value:element.value??null,connected:element.isConnected} : null;
  const rows = owner => [...owner.querySelectorAll('[data-interaction-palette-option]')].map(row=>({...node(row),label:row.querySelector('strong').textContent,action:row.dataset.elyAction,disabled:row.disabled,hidden:row.closest('li').hidden,selected:row.getAttribute('aria-selected'),role:row.getAttribute('role')}));
  const state = () => {
    const owner=root(), input=query(), dialog=owner.querySelector('dialog'), list=owner.querySelector('[data-interaction-palette-results]');
    return {owner:node(owner),component:owner.dataset.elyComponent,ready:owner.dataset.elyReady||null,binding:binding(owner),query:node(input),form:node(input.form),formAction:input.form.dataset.elySubmit,queryName:input.name,caret:[input.selectionStart,input.selectionEnd],dialog:node(dialog),open:dialog.open,opener:node(owner.querySelector('[data-interaction-dialog]')),list:node(list),activeID:input.getAttribute('aria-activedescendant'),controls:input.getAttribute('aria-controls'),focus:node(document.activeElement),rows:rows(owner),peer:{owner:node(paletteRoot('peer')),open:paletteRoot('peer').querySelector('dialog').open,query:paletteRoot('peer').querySelector('input').value,rows:rows(paletteRoot('peer'))},outside:node(document.getElementById('palette-peer-field'))};
  };
  const log=window.activationLog=[];
  let stage='setup',mode='normal',armed=false,mount;
  const record=(type,detail={})=>{const entry={sequence:log.length+1,type,stage,...detail,state:state()};log.push(entry);return entry;};
  const payload=detail=>({id:detail.id,component:detail.component,action:detail.action??null,value:detail.value??null,hasValue:Object.hasOwn(detail,'value'),formDataKind:detail.formData===null?'null':detail.formData instanceof FormData?'FormData':typeof detail.formData,formData:detail.formData instanceof FormData?[...detail.formData]:detail.formData??null,valuesKind:Array.isArray(detail.values)?'array':typeof detail.values,values:detail.values??null,submitter:detail.submitter??null});
  const eventData=event=>({eventToken:token(event),trusted:event.isTrusted,target:node(event.target),path:event.composedPath().filter(value=>value instanceof Element).map(token),defaultPrevented:event.defaultPrevented,key:event.key??null,code:event.code??null,keyCode:event.keyCode??null,button:event.button??null,pointerType:event.pointerType??null,ctrl:Boolean(event.ctrlKey),alt:Boolean(event.altKey),shift:Boolean(event.shiftKey),meta:Boolean(event.metaKey),composing:Boolean(event.isComposing)});
  function bind(label) {
    const owner=root(),previous=binding(owner),handlers={
      onAction(detail){record('host',{label,handlerToken:token(handlers.onAction),payload:payload(detail)});
        if(armed && stage==='activation' && detail.action==='option-command') {
          if(mode==='reopen'){owner.querySelector('[data-interaction-dialog]').click();record('callback-reopen');}
          if(mode==='peer-focus'){document.getElementById('palette-peer-field').focus();record('callback-peer-focus');}
        }
        return {binding:label,owner:owner.id};
      },
      onChange(detail){record('host-change',{label,handlerToken:token(handlers.onChange),detail:{id:detail.id,component:detail.component,name:detail.name,value:detail.value,selected:detail.selected??null}});},
    };
    const dispose=mount(owner,handlers);bindings.set(owner,{handlers,dispose});record('binding-installed',{label,previous,current:binding(owner)});
  }
  window.activationInitialize=async name=>{
    ({mount}=await import('/assets/ely-api.js'));mode=name;
    record('initial-unbound');
    if(name!=='close-bind-absent')bind('original');
    root().addEventListener('ely:action',event=>record('direct-action',{eventToken:token(event),target:node(event.target),payload:payload(event.detail)}),true);
    root().addEventListener('keydown',event=>record('key-boundary',eventData(event)));
    root().addEventListener('click',event=>record('click-boundary',eventData(event)));
    root().addEventListener('submit',event=>record('submit-boundary',{...eventData(event),formAction:event.target.dataset.elySubmit,formToken:token(event.target),fields:[...new FormData(event.target)]}));
    root().querySelector('[data-interaction-dialog]').addEventListener('focus',event=>{
      if(!armed||stage!=='activation'||!['close-rebind','close-bind-absent'].includes(mode))return;
      armed=false;record('close-focus-before-bind',eventData(event));bind('replacement');record('close-focus-after-bind',eventData(event));
    });
  };
  window.activationArm=()=>{stage='activation';armed=true;record('armed');};
  window.activationStage=value=>{stage=value;record('stage');};
  window.activationSnapshot=()=>({state:state(),log:structuredClone(log),baseTrace:structuredClone(paletteLog)});
  window.activationRequestSubmit=()=>{stage='explicit';record('requestSubmit-call',{api:'HTMLFormElement.requestSubmit'});query().form.requestSubmit();record('requestSubmit-return',{api:'HTMLFormElement.requestSubmit'});};
  for(const type of ['pointerdown','pointerup','click','keydown','keyup','focus','submit']) document.addEventListener(type,event=>{
    if(!root()||!event.target.closest?.('#palette-primary,#palette-peer,#palette-peer-field'))return;
    record(type,eventData(event));
  },true);
  document.addEventListener('ely:change',event=>{if(event.target===root())record('change',{detail:{id:event.detail.id,component:event.detail.component,name:event.detail.name,value:event.detail.value,selected:event.detail.selected??null}});});
  document.addEventListener('ely:result',event=>{if(event.target===root())record('result',{payload:payload(event.detail),result:event.detail.result});});
  document.addEventListener('close',event=>{if(event.target===root()?.querySelector('dialog'))record('close',{trusted:event.isTrusted,target:node(event.target)});},true);
  document.addEventListener('sdui:success',event=>record('bridge-success',{action:event.detail.action,target:event.detail.target,status:event.detail.status,requestId:event.detail.requestId}));
  const originalFetch=window.fetch;
  window.fetch=function(input,init){
    const url=new URL(typeof input==='string'?input:input.url,location.href);
    if(url.pathname==='/sdui-action')record('request-start',{path:url.pathname,method:init?.method??'GET',fields:init?.body instanceof FormData?[...init.body].map(([key,value])=>[key,String(value)]):null});
    return Reflect.apply(originalFetch,this,arguments);
  };
})();
