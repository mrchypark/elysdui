import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
// Handler-only unchanged-production baseline. This is NOT native typing proof.
const base = new URL('../../assets/', import.meta.url);
const path = name => new URL(name, base);
const source=readFileSync(path('ely-api-interaction.js'),'utf8'), core=readFileSync(path('ely-api.js'),'utf8');
const cut=(text,a,b)=>{const start=text.indexOf(a),end=text.indexOf(b,start);assert(start>=0&&end>start);return text.slice(start,end)};
const anchors=[];const extract=(a,b)=>{const value=cut(source,a,b);anchors.push({startLine:source.slice(0,source.indexOf(a)).split('\n').length,sha256:createHash('sha256').update(value).digest('hex')});return value};
const matcher=extract('const paletteFit =','const selectWizardStep =');
const filter=extract('  const filterPalette =','  const paintUpload =');
const directKeys=extract('  const keydown = event => {',"  root.querySelectorAll('[data-direct-keycaps]')");
const mainKeys=extract('  let menuConfirmKey','  let dragging, reorderPreview;');
const inputSource=extract('  const input = event =>','  const submit = event =>');
const closestSource=extract('const closest =','const formatCountdown =');
let active;const actions=[],changes=[],focuses=[],timeline=[];
class E {
 constructor(name){this.name=name;this.attrs={};this.dataset={};this.hidden=false;this.disabled=false;this.isConnected=true;this.textContent='';}
 getAttribute(k){return this.attrs[k]??null} setAttribute(k,v){this.attrs[k]=String(v)} hasAttribute(k){return k in this.attrs}
 focus(){if(!this.disabled&&!this.row?.hidden){active=this;focuses.push(this.name)}}
 closest(s){if(s==='[data-ely-family]')return root;if(s==='li')return this.row||null;if(s==='ul'||s==='[data-interaction-palette-results]'||s==='[data-interaction-roving]')return this.row?list:null;if(s==='[data-interaction-palette-option]'||s==='[data-ely-action]')return this.row?this:null;if(s==='[data-interaction-palette]'||s==='dialog'||s==='dialog[open], [data-interaction-popover]:not([hidden])')return dialog;if(s==='[data-interaction-kind]')return kind;if(s==='[data-interaction-filter]')return this===field?field:null;if(s==='[data-interaction-palette], [data-interaction-palette-results], [data-interaction-palette-option]')return this.row?this:dialog;return null}
 matches(s){return this===list&&s==='[data-interaction-palette-results]'}
}
const root=new E('root');root.id='palette-probe';root.dataset={elyComponent:'navigation/CommandPalette'};root.querySelector=s=>s==='dialog[open]'&&dialog.open?dialog:null;
root.dispatchEvent=e=>{const detail={...e.detail};if(e.type==='ely:change')changes.push(detail);if(e.type==='ely:action')actions.push(detail);timeline.push({event:e.type,open:dialog.open,active:active?.name,detail});return true};
const kind=new E('kind');kind.dataset.interactionKind='CommandPalette';
const field=new E('query');field.value='op';field.name='cmdQuery';
const list=new E('results');list.children=[];list.append=row=>{list.children=list.children.filter(x=>x!==row);list.children.push(row)};
list.querySelectorAll=s=>s==='.ely-interaction__palette-label'?[]:list.children.filter(r=>r.option).map(r=>r.option).filter(o=>!s.includes(':not(:disabled)')||!o.disabled);
const dialog=new E('dialog');dialog.open=true;dialog.querySelector=s=>s==='[data-interaction-palette-results]'?list:s==='[data-interaction-filter]'?field:null;dialog.querySelectorAll=s=>list.querySelectorAll(s);
const make=(label,value,disabled=false)=>{const option=new E(value),row=new E(value+'-row');row.option=option;option.row=row;option.textContent=label;option.value=value;option.type='button';option.disabled=disabled;option.dataset.elyAction='run-'+value;option.dataset.interactionPaletteGroup='';const text={textContent:label,replaceChildren(...children){this.textContent=children.map(c=>c.textContent).join('')}};option.querySelector=s=>s==='strong'?text:null;option.click=()=>{if(!option.disabled){const e={target:option,preventDefault(){}};genericClick(e);familyClick(option)}};list.append(row);return option};
const open=make('Open','open-file'),option=make('Option','option-file'),other=make('Other place','other-place'),blocked=make('Open disabled','disabled-open',true),secret=make('Zebra','zebra-file');
const document={get activeElement(){return active},createTextNode:text=>({textContent:text}),createElement:tag=>({tag,textContent:''})};
const sandbox={root,document,Element:E,TextEncoder,CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},closeDialog(d){d.open=false;timeline.push({event:'close',open:d.open});},close(){},holdStart(){},trapOverlayFocus(){}};
const direct=runInNewContext(directKeys+'\nkeydown',sandbox);
const h=runInNewContext(closestSource+matcher+filter+inputSource+mainKeys+'\n({keydown,input,filterPalette})',{...sandbox,sourceFamily:{keydown:direct}});
const genericClick=runInNewContext(cut(core,'    const click = event => {','    const submit = event => {')+'\nclick',{root,belongs:(_r,t)=>t.closest('[data-ely-family]')===root,emit(r,action,detail){return r.dispatchEvent({type:'ely:action',detail:{...detail,id:r.id,component:r.dataset.elyComponent,action}})}});
const familyClick=runInNewContext('(target)=>{'+cut(source,"    const paletteOption = target?.closest('[data-interaction-palette-option]');",'    if (target?.closest(\'[data-interaction-step]\'))')+'}',{...sandbox,change:(r,detail)=>r.dispatchEvent({type:'ely:change',detail:{id:r.id,component:r.dataset.elyComponent,...detail}})});
const snapshots=[];const snap=name=>snapshots.push({name,active:active?.name,query:field.value,visible:list.children.filter(r=>!r.hidden).map(r=>r.option.value),selected:list.children.filter(r=>r.option.getAttribute('aria-selected')==='true').map(r=>r.option.value),changes:changes.length,actions:actions.length});
const key=key=>{let prevented=false;h.keydown({key,target:active,preventDefault(){prevented=true},stopPropagation(){}});return prevented};
active=field;h.input({target:field});snap('input-op');assert.equal(changes.at(-1).name,'cmdQuery');
key('ArrowDown');snap('arrow-down');assert.equal(active,option);
assert.equal(key('e'),false);assert.equal(key('n'),false);snap('handler-only-e-n');assert.equal(field.value,'op');assert.equal(changes.length,1);
key('o');snap('roving-typeahead-o');assert.equal(active,open);assert.equal(option.getAttribute('aria-selected'),'true');
key('Enter');snap('enter-after-typeahead');assert.equal(actions.length,1);assert.equal(actions[0].value,'open-file');assert.deepEqual(timeline.slice(-3).map(x=>[x.event,x.open]),[['ely:action',true],['ely:change',true],['close',false]]);
active=field;dialog.open=true;field.value='open';h.input({target:field});snap('explicit-input-event-open');assert.equal(open.getAttribute('aria-selected'),'true');assert.equal(option.row.hidden,true);
key('Escape');assert.equal(dialog.open,false);snap('escape');
active=field;dialog.open=true;field.value='zzzz';h.input({target:field});const emptyEnterPrevented=key('Enter');assert.equal(emptyEnterPrevented,false);snap('empty-enter-keydown');
console.log('CommandPalette unchanged-source handler baseline passed; no native typing or implicit submission claim.');
