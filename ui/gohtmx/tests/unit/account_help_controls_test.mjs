import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../assets/ely-api-forms.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const suitePasswordRules='),source.indexOf("\nregister('forms'"));
const actions=[],changes=[];
const api=runInNewContext(code+'\n({suitePasswordRules,suiteMatches,suiteInitials,suitePayment,mountAccountHelp})',{Date,Map,AbortController,queueMicrotask,emit:(_root,name,detail)=>actions.push({name,...detail}),changed:(_root,detail)=>changes.push(detail),FormData:class{constructor(form){this.values=(form.fields||[]).filter(f=>!f.disabled&&(!['checkbox','radio'].includes(f.type)||f.checked)).map(f=>[f.name,f.value]);}*[Symbol.iterator](){yield* this.values;}},document:{createElement:()=>element()},navigator:{clipboard:{writeText:async()=>{}}}});
assert.deepEqual(Array.from(api.suitePasswordRules('短い文字列123')), [true,true,true]);
assert.deepEqual(Array.from(api.suitePasswordRules('abcdefgh')), [true,true,false]);
assert.deepEqual(Array.from(api.suitePasswordRules('😀😀😀😀123')), [false,false,true]);
assert.equal(api.suiteInitials('  Ada  Lovelace '),'AL');assert.equal(api.suiteInitials(''),'');assert.equal(api.suiteInitials('李 明'),'李明');
assert.equal(api.suiteMatches('Theme Appearance dark light mode','DARK appearance'),true);assert.equal(api.suiteMatches('Theme Appearance dark','dark storage'),false);
const now=new Date(2026,9,13),card={card_number:'4242 4242 4242 4242',expiry:'10/26',cvc:'123',name:'Ada'};
assert.ok(Object.values(api.suitePayment(card,now)).every(error=>!error));
assert.ok(api.suitePayment({...card,card_number:'4242424242424241'},now).card_number);
assert.ok(api.suitePayment({...card,expiry:'09/26'},now).expiry);
assert.ok(api.suitePayment({...card,expiry:'13/30'},now).expiry);
assert.ok(api.suitePayment({...card,expiry:'10/2026'},now).expiry);
assert.ok(api.suitePayment({...card,name:'   '},now).name);
assert.ok(Object.values(api.suitePayment({...card,card_number:'378282246310005',expiry:'12/40',cvc:'1234'},now)).every(error=>!error));
assert.ok(api.suitePayment({...card,card_number:'378282246310005',cvc:'123'},now).cvc);
function element(){return {dataset:{},classList:{add(){}},listeners:{},children:[],textContent:'',hidden:false,style:{},setAttribute(k,v){this[k]=v;},getAttribute(k){return this[k];},removeAttribute(k){delete this[k];},append(node){this.children.push(node);},focus(){this.focused=true;},addEventListener(type,fn,{signal}={}){this.listeners[type]=fn;signal?.addEventListener('abort',()=>delete this.listeners[type],{once:true});},querySelector(){return null;},querySelectorAll(){return [];},matches(){return false;}};}
const root=element(),form=element(),save=element(),reset=element(),output=element(),field=element();
root.dataset={elyComponent:'account/ProfileEditor'};form.dataset={suiteValidate:'profile',elySubmit:'save-profile'};field.name='name';field.value=field.defaultValue='Ada';field.type='text';field.required=true;field.setCustomValidity=message=>field.error=message;field.checkValidity=()=>!field.error;field.closest=selector=>selector==='[data-ely-family]'?root:selector==='[data-suite-validate]'?form:null;
form.fields=[field];form.elements=[field];form.elements.namedItem=name=>form.fields.find(item=>item.name===name);form.checkValidity=()=>form.fields.every(item=>item.checkValidity());form.reportValidity=form.checkValidity;form.matches=selector=>selector==='[data-suite-validate]'||selector==='[data-ely-submit]';form.closest=()=>root;form.querySelectorAll=selector=>selector==='[required]'?[field]:[];form.querySelector=selector=>({'button[type=submit]':save,'button[type=reset]':reset,'[data-suite-status]':output}[selector]||null);
root.querySelectorAll=selector=>['form[data-suite-validate="profile"]','[data-suite-validate]','[data-suite-validate="profile"]'].includes(selector)?[form]:[];root.querySelector=selector=>selector==='[data-suite-status]'?output:null;
const cleanup=api.mountAccountHelp(root);assert.equal(save.disabled,true,'Unchanged profile must not save');
field.value='  ';root.listeners.input({target:field,type:'input'});assert.equal(save.disabled,true,'Whitespace-only required name is invalid');
field.value='Grace';root.listeners.input({target:field,type:'input'});assert.equal(save.disabled,false);assert.equal(reset.disabled,false);
let stopped=0;root.listeners.submit({target:form,preventDefault(){},stopImmediatePropagation(){stopped++;}});assert.equal(stopped,1);assert.equal(actions.at(-1).name,'save-profile');assert.deepEqual(Array.from(actions.at(-1).values,entry=>Array.from(entry)),[['name','Grace']]);assert.equal(save.disabled,false,'Request alone must not claim persistence');
root.listeners['ely:result']({target:root,detail:{action:'save-profile',result:{ok:true}}});assert.equal(save.disabled,true,'Only host acknowledgement saves the baseline');assert.equal(field.defaultValue,'Grace');
field.value='Submitted name';root.listeners.input({target:field,type:'input'});root.listeners.submit({target:form,preventDefault(){},stopImmediatePropagation(){}});field.value='Newer draft';root.listeners.input({target:field,type:'input'});root.listeners['ely:result']({target:root,detail:{action:'save-profile',result:{ok:true}}});assert.equal(save.disabled,false,'An acknowledgement must not save edits made after the request');assert.equal(field.defaultValue,'Submitted name');
const button=element();button.textContent='Remove';button.value='caller-member';button.dataset={elyAction:'remove-member',suiteConfirm:'Remove member?'};button.closest=selector=>selector==='button'?button:selector==='[data-ely-family]'?root:null;const click={target:button,preventDefault(){},stopImmediatePropagation(){}};
let count=actions.length;root.listeners.click(click);assert.equal(actions.length,count,'First press only arms confirmation');assert.equal(button.textContent,'Remove member?');root.listeners.click(click);assert.equal(actions.length,count+1);assert.equal(actions.at(-1).name,'remove-member');assert.equal(actions.at(-1).value,'caller-member');assert.equal(button.textContent,'Remove');
root.dataset.elyDisabled='true';root.listeners.click(click);assert.equal(actions.length,count+1);cleanup();assert.equal(root.listeners.click,undefined);assert.equal(root.listeners['ely:result'],undefined);
console.log('550–567: Unicode password rules/initials, payment validation and expiry, search matching, profile draft/host acknowledgement, two-press confirmations, disabled and lifecycle checks passed');
// Exact minimal markup contract used by the shared HostCallbacks remount check:
// account item + menu trigger + empty list + hidden value, without presentation wrappers.
const minimal=element(),item=element(),trigger=element(),list=element(),hidden=element();minimal.dataset={elyComponent:'account/AccountSwitcher'};item.value='first';item.textContent='First';item.matches=selector=>selector==='[data-ely-account]';item.closest=selector=>selector==='button'?item:selector==='[data-ely-family]'?minimal:null;minimal.querySelectorAll=selector=>selector==='[data-ely-account]'?[item]:[];minimal.querySelector=selector=>({'[data-ely-account-value]':hidden,'[data-ely-account-menu]':trigger,'[data-ely-account-list]':list}[selector]||null);
let stop=api.mountAccountHelp(minimal);const press={target:item,preventDefault(){},stopImmediatePropagation(){}};let actionCount=actions.length;minimal.listeners.click(press);assert.equal(actions.length,actionCount+1);assert.equal(actions.at(-1).name,'switch-account');assert.equal(actions.at(-1).value,'first');assert.equal(hidden.value,'first');stop();assert.equal(minimal.listeners.click,undefined);stop=api.mountAccountHelp(minimal);actionCount=actions.length;minimal.listeners.click(press);assert.equal(actions.length,actionCount+1);assert.equal(actions.at(-1).name,'switch-account');assert.equal(actions.at(-1).value,'first');stop();assert.equal(minimal.listeners.click,undefined);assert.equal(minimal.listeners['ely:result'],undefined);
console.log('Shared HostCallbacks minimal AccountSwitcher contract: one action on initial mount/remount and no retained handler after cleanup passed');

const accountCSS=readFileSync(new URL('../../assets/ely-api-forms.css',import.meta.url),'utf8');
const accountRootRule=accountCSS.match(/\[data-ely-family='forms'\]\.ely-account-help\{([^}]+)\}/)?.[1];
assert.ok(accountRootRule?.includes('font-size:13px')&&accountRootRule.includes('line-height:20px'),'Account/help family root must retain the host 13px/20px baseline');
console.log('Account/help root typography contract: 13px/20px passed');

assert.ok(accountCSS.includes(".ely-account-help input:not([data-ui-pin-slot]):not([type=checkbox])"),'Generic account input dimensions must exclude shared PIN slots');
assert.ok(!accountCSS.includes('.ely-account-help .ely-pin-slots input{'),'Account styles must not override the shared 40px PIN contract');
console.log('Account PIN styling: generic input rule excludes shared 40px slots passed');
// Manual network configuration is a local draft until its explicit host action.
const settings=element(),proxy=element(),mode=element(),proxyHost=element(),port=element(),bypass=element(),manualFields=element(),applyProxy=element();settings.dataset={elyComponent:'settings/SettingsLayout'};mode.value='system';proxyHost.value='';port.value='';bypass.value=' localhost, *.internal, ';
const proxyNodes={'[data-suite-proxy-mode]':mode,'[data-suite-proxy-host]':proxyHost,'[data-suite-proxy-port]':port,'[data-suite-proxy-bypass]':bypass,'[data-suite-proxy-fields]':manualFields,'[data-suite-proxy-apply]':applyProxy};proxy.querySelector=selector=>proxyNodes[selector]||null;settings.querySelectorAll=selector=>selector==='[data-suite-proxy]'?[proxy]:[];
for(const field of [mode,proxyHost,port,bypass])field.closest=selector=>selector==='[data-ely-family]'?settings:selector==='[data-suite-proxy]'?proxy:null;
applyProxy.matches=selector=>selector==='[data-suite-proxy-apply]';applyProxy.closest=selector=>selector==='button'?applyProxy:selector==='[data-ely-family]'?settings:selector==='[data-suite-proxy]'?proxy:null;
const settingsCleanup=api.mountAccountHelp(settings);assert.equal(manualFields.hidden,true);mode.value='manual';settings.listeners.input({target:mode,type:'input'});assert.equal(manualFields.hidden,false);assert.equal(applyProxy.disabled,true);proxyHost.value=' proxy.example.test ';port.value='65536';settings.listeners.input({target:port,type:'input'});assert.equal(applyProxy.disabled,true);port.value='8080';settings.listeners.input({target:port,type:'input'});assert.equal(applyProxy.disabled,false);const prior=actions.length;settings.listeners.click({target:applyProxy,preventDefault(){},stopImmediatePropagation(){}});assert.equal(actions.length,prior+1);assert.equal(actions.at(-1).name,'apply-proxy');assert.equal(actions.at(-1).proxy.host,'proxy.example.test');assert.equal(actions.at(-1).proxy.port,8080);assert.deepEqual(Array.from(actions.at(-1).proxy.bypass),['localhost','*.internal']);settingsCleanup();
console.log('Settings manual proxy: local draft, valid host/port, explicit callback and normalized bypass passed');
