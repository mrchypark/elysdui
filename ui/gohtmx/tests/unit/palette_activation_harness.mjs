import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
export const paletteCoreSource=readFileSync(new URL('../../assets/ely-api.js',import.meta.url),'utf8');
export const paletteRuntimeSource=readFileSync(new URL('../../assets/ely-api-interaction.js',import.meta.url),'utf8');
// Bounded event/DOM model executing both whole production modules. It models
// synchronous focus reentry and queued close/rAF, never native browser evidence.
export class ModelEvent {
 constructor(type,options={}){Object.assign(this,{type,bubbles:false,cancelable:true,defaultPrevented:false,stopped:false,immediate:false},options);}
 preventDefault(){if(this.cancelable)this.defaultPrevented=true;}stopPropagation(){this.stopped=true;}stopImmediatePropagation(){this.stopped=this.immediate=true;}
}
const dataKey=name=>name.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
export class ModelNode {
 constructor(tag='div',parent=null){this.tagName=tag.toUpperCase();this.parentElement=null;this.children=[];this.dataset={};this.attrs={};this.style={};this.handlers=new Map();this.disabled=false;this.hidden=false;this.value='';this.type=tag==='button'?'button':'';this._text='';this.className='';parent?.append(this);}
 get doc(){return this.documentRoot?this:this.parentElement?.doc;}get isConnected(){return Boolean(this.doc);}get textContent(){return this._text+this.children.map(n=>n.textContent).join('');}set textContent(v){this._text=String(v);this.children.forEach(n=>n.parentElement=null);this.children=[];}
 get nextElementSibling(){const siblings=this.parentElement?.children||[];return siblings[siblings.indexOf(this)+1]||null;}
 append(...nodes){for(const n of nodes){n.remove();this.children.push(n);n.parentElement=this;}}appendChild(n){this.append(n);return n;}
 remove(){if(this.parentElement)this.parentElement.children.splice(this.parentElement.children.indexOf(this),1);this.parentElement=null;}
 contains(n){for(;n;n=n.parentElement)if(n===this)return true;return false;}all(){return this.children.flatMap(n=>[n,...n.all()]);}
 getAttribute(name){if(name==='id')return this.id??null;if(name==='class')return this.className||null;if(name==='hidden')return this.hidden?'':null;if(name==='open')return this.open?'':null;if(name==='disabled')return this.disabled?'':null;if(name==='type')return this.type||null;if(name.startsWith('data-'))return this.dataset[dataKey(name)]??null;return this.attrs[name]??null;}
 hasAttribute(name){return this.getAttribute(name)!==null;}setAttribute(name,value){if(name.startsWith('data-'))this.dataset[dataKey(name)]=String(value);else if(name==='id')this.id=String(value);else if(name==='class')this.className=String(value);else this.attrs[name]=String(value);}
 removeAttribute(name){if(name.startsWith('data-'))delete this.dataset[dataKey(name)];else delete this.attrs[name];}
 matches(selector){
  if(selector.includes(','))return selector.split(',').some(s=>this.matches(s.trim()));
  if(selector.includes(' > ')){const i=selector.lastIndexOf(' > ');return this.matches(selector.slice(i+3))&&!!this.parentElement?.matches(selector.slice(0,i));}
  if(selector.includes(' ')){const i=selector.lastIndexOf(' ');return this.matches(selector.slice(i+1))&&!!this.parentElement?.closest(selector.slice(0,i));}
  let rejected=false;selector=selector.replace(/:not\(([^)]+)\)/g,(_,s)=>{if(this.matches(s))rejected=true;return '';});if(rejected)return false;
  if(selector===':disabled')return this.disabled;if(selector===':scope')return true;
  const tag=selector.match(/^[a-zA-Z][\w-]*/);if(tag&&this.tagName!==tag[0].toUpperCase())return false;if(tag)selector=selector.slice(tag[0].length);
  const id=selector.match(/^#([\w-]+)/);if(id){if(this.id!==id[1])return false;selector=selector.slice(id[0].length);}
  let ok=true;selector=selector.replace(/\.([\w-]+)/g,(_,c)=>{if(!this.className.split(/\s+/).includes(c))ok=false;return '';});
  selector=selector.replace(/\[([^\]=]+)(?:="([^"]*)")?\]/g,(_,a,v)=>{if(v===undefined?!this.hasAttribute(a):this.getAttribute(a)!==v)ok=false;return '';});
  return ok&&(selector===''||selector==='*');
 }
 closest(s){for(let n=this;n;n=n.parentElement)if(n.matches(s))return n;return null;}querySelectorAll(s){return this.all().filter(n=>n.matches(s));}querySelector(s){return this.querySelectorAll(s)[0]||null;}
 replaceChildren(...nodes){this.textContent='';this.append(...nodes);}scrollIntoView(){this.scrolls=(this.scrolls||0)+1;}getBoundingClientRect(){return {left:0,top:0,right:200,bottom:100,width:200,height:100};}
 addEventListener(type,fn,options=false){const capture=typeof options==='boolean'?options:!!options.capture;if(!this.handlers.has(type))this.handlers.set(type,[]);this.handlers.get(type).push({fn,capture});}
 removeEventListener(type,fn,options=false){const capture=typeof options==='boolean'?options:!!options.capture;this.handlers.set(type,(this.handlers.get(type)||[]).filter(x=>x.fn!==fn||x.capture!==capture));}
 dispatchEvent(event){event.target||=this;const path=[];for(let n=this;n;n=n.parentElement)path.push(n);const deliver=(n,capture)=>{for(const e of [...n.handlers.get(event.type)||[]])if(e.capture===capture&&!event.immediate&&n.handlers.get(event.type)?.includes(e))e.fn(event);};for(const n of [...path].reverse()){deliver(n,true);if(event.stopped)break;}if(!event.stopped)for(const n of path){deliver(n,false);if(event.stopped||!event.bubbles)break;}return !event.defaultPrevented;}
 focus(){const d=this.doc;if(!d||this.disabled)return;const modal=d.querySelector('dialog[open]');if(modal&&!modal.contains(this))return;if(d.activeElement===this)return;d.activeElement=this;this.dispatchEvent(new ModelEvent('focus'));this.dispatchEvent(new ModelEvent('focusin',{bubbles:true}));}
 click(){const e=new ModelEvent('click',{bubbles:true,button:0});if(!this.disabled)this.dispatchEvent(e);return e;}
}
class Dialog extends ModelNode{constructor(parent){super('dialog',parent);this.open=false;}showModal(){this.returnFocus=this.doc.activeElement;this.open=true;}close(){if(!this.open)return;const d=this.doc;this.open=false;this.closes=(this.closes||0)+1;this.returnFocus?.focus();d.tasks.push(()=>this.dispatchEvent(new ModelEvent('close')));}}
function fixture(parent,id,kind='CommandPalette',empty=false){
 const root=new ModelNode('section',parent);root.id=id;root.dataset={elyFamily:'interaction',elyComponent:'navigation/'+kind,elyKind:kind};
 const host=new ModelNode('div',root);host.dataset.interactionKind=kind;
 const trigger=new ModelNode('button',host);trigger.dataset.interactionDialog=id+'-palette';
 const dialog=new Dialog(host);dialog.id=id+'-palette';dialog.dataset.interactionPalette='';const form=new ModelNode('form',dialog);form.dataset.elySubmit='run';form.reportValidity=()=>true;
 const query=new ModelNode('input',form);query.type='search';query.name='cmdQuery';query.dataset.interactionFilter='';query.id=id+'-query';
 const list=new ModelNode('ul',dialog);list.dataset.interactionPaletteResults='';list.dataset.interactionRoving='';list.className='ely-interaction__items';
 const options=[];if(!empty)for(const [index,value]of ['open-file','option-file','disabled-file'].entries()){const row=new ModelNode('li',list),option=new ModelNode('button',row);option.id=id+'-option-'+index;option.value=value;option.dataset={interactionPaletteOption:'',interactionPaletteGroup:'Commands',elyAction:index===1?'option-command':'open-command'};if(kind==='CommandPalette')option.dataset.interactionPaletteAction='';option.attrs['aria-selected']='false';option.disabled=index===2;const label=new ModelNode('strong',option);label.textContent=index===1?'Option':'Open';options.push(option);}
 const notice=new ModelNode('p',dialog);notice.dataset.interactionPaletteEmpty='';notice.hidden=true;
 form.requestSubmit=()=>form.dispatchEvent(new ModelEvent('submit',{bubbles:true}));
 return {root,host,trigger,dialog,form,query,list,options,open(){trigger.focus();trigger.click();}};
}
export function paletteHarness({core=paletteCoreSource,runtime=paletteRuntimeSource,kind='CommandPalette',empty=false,bind=true}={}){
 const document=new ModelNode('document');document.documentRoot=true;document.documentElement=document;document.tasks=[];document.body=new ModelNode('body',document);document.activeElement=document.body;document.createTextNode=text=>{const n=new ModelNode('#text');n.textContent=text;return n;};document.createElement=tag=>new ModelNode(tag);
 const f=fixture(document.body,'primary',kind,empty),peer=fixture(document.body,'peer'),outside=new ModelNode('input',document.body),actions=[],changes=[],results=[],errors=[],timeline=[],contexts=[];outside.id='outside';
 const selected=()=>f.options.filter(n=>n.getAttribute('aria-selected')==='true').map(n=>n.value),snapshot=()=>({open:f.dialog.open,selected:selected(),focus:document.activeElement?.id});
 document.addEventListener('ely:action',e=>{if(e.target===f.root){actions.push(e.detail);timeline.push({type:'direct',...snapshot()});}},true);document.addEventListener('ely:change',e=>{if(e.target===f.root&&e.detail.name==='palette'){changes.push(e.detail);timeline.push({type:'change',...snapshot()});}});document.addEventListener('ely:result',e=>{if(e.target===f.root)results.push(e.detail);});document.addEventListener('ely:error',e=>errors.push(e.detail));
 let observer;let nextFrame=0;const frames=new Map(),window=new ModelNode('window');window.innerWidth=800;window.innerHeight=600;
 const sandbox={document,window,TextEncoder,Element:ModelNode,HTMLDialogElement:Dialog,CustomEvent:ModelEvent,CSS:{escape:s=>s},MutationObserver:class{constructor(fn){observer=fn;}observe(){}},requestAnimationFrame:fn=>{frames.set(++nextFrame,fn);return nextFrame;},cancelAnimationFrame:id=>frames.delete(id),queueMicrotask,clearTimeout,setTimeout,matchMedia:()=>({matches:true}),FormData:class{constructor(form){this.fields=form.querySelectorAll('input').map(n=>[n.name,n.value]);form.onFormData?.();}*[Symbol.iterator](){yield*this.fields;}}};
 runInNewContext(core.replaceAll('export function ','function ')+'\n'+runtime.replace(/^import[^\n]*\n/,'')+'\nglobalThis.api={register,mount,emit};',sandbox,{filename:'whole-palette-runtime.js'});
 const hostCalls=[],hostChanges=[];const mount=(fn=()=>({ok:true}))=>sandbox.api.mount(f.root,{onAction(detail,root){hostCalls.push({detail,root,...snapshot()});timeline.push({type:'host',...snapshot()});return fn(detail,root);},onChange(detail){if(detail.name==='palette'){hostChanges.push({detail,...snapshot()});timeline.push({type:'host-change',...snapshot()});}}});
 if(bind)mount();assert.deepEqual(errors,[],'whole interaction initialization');assert.equal(f.root.dataset.elyReady,'true');
 return {f,peer,outside,document,api:sandbox.api,mount,hostCalls,hostChanges,actions,changes,results,errors,timeline,snapshot,prune:()=>observer(),
  pointer(option=f.options[1]){option.focus();return option.click();},
  key(key='Enter',extra={}){const e=new ModelEvent('keydown',{bubbles:true,key,code:key,keyCode:key==='Enter'?13:0,ctrlKey:false,altKey:false,metaKey:false,shiftKey:false,isComposing:false,...extra});document.activeElement.dispatchEvent(e);return e;},
  async flush(){await Promise.resolve();while(document.tasks.length)document.tasks.shift()();for(const [id,fn]of [...frames]){frames.delete(id);fn();}await Promise.resolve();},
  swap(replace=()=>{}){const ctx={};document.dispatchEvent(new ModelEvent('htmx:before:swap',{detail:{ctx,tasks:[{target:f.root,swapSpec:{style:'innerHTML'}}]}}));replace();document.dispatchEvent(new ModelEvent('htmx:after:swap',{detail:{ctx}}));},
 };
}
