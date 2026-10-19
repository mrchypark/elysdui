import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {createHash} from 'node:crypto';
// Production handler regressions. These DOM doubles are NOT native typing proof.
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
 getAttribute(k){return this.attrs[k]??null} setAttribute(k,v){this.attrs[k]=String(v)} removeAttribute(k){delete this.attrs[k]} hasAttribute(k){return k in this.attrs}
 scrollIntoView(options){this.scrolled=(this.scrolled||0)+1;assert.equal(options.block,'nearest');assert.equal(options.inline,'nearest')}
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
const make=(label,value,disabled=false)=>{const option=new E(value),row=new E(value+'-row');row.option=option;option.row=row;option.id='palette-probe-option-'+list.children.length;option.textContent=label;option.value=value;option.type='button';option.disabled=disabled;option.dataset.elyAction='run-'+value;option.dataset.interactionPaletteGroup='';const text={textContent:label,replaceChildren(...children){this.textContent=children.map(c=>c.textContent).join('')}};option.querySelector=s=>s==='strong'?text:null;option.click=()=>{if(!option.disabled){const e={target:option,preventDefault(){}};genericClick(e);familyClick(option)}};list.append(row);return option};
const open=make('Open','open-file'),option=make('Option','option-file'),other=make('Other place','other-place'),blocked=make('Open disabled','disabled-open',true),secret=make('Zebra','zebra-file');
const document={get activeElement(){return active},createTextNode:text=>({textContent:text}),createElement:tag=>({tag,textContent:''})};
const sandbox={root,document,Element:E,TextEncoder,CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},closeDialog(d){d.open=false;timeline.push({event:'close',open:d.open});},close(){},holdStart(){},trapOverlayFocus(){}};
const direct=runInNewContext(directKeys+'\nkeydown',sandbox);
const h=runInNewContext(closestSource+matcher+filter+inputSource+mainKeys+'\n({keydown,input,filterPalette,syncCommandPalette})',{...sandbox,sourceFamily:{keydown:direct}});
const genericClick=runInNewContext(cut(core,'    const click = event => {','    const submit = event => {')+'\nclick',{root,belongs:(_r,t)=>t.closest('[data-ely-family]')===root,emit(r,action,detail){return r.dispatchEvent({type:'ely:action',detail:{...detail,id:r.id,component:r.dataset.elyComponent,action}})}});
const familyClick=runInNewContext('(target)=>{'+cut(source,"    const paletteOption = target?.closest('[data-interaction-palette-option]');",'    if (target?.closest(\'[data-interaction-step]\'))')+'}',{...sandbox,syncCommandPalette:h.syncCommandPalette,change:(r,detail)=>r.dispatchEvent({type:'ely:change',detail:{id:r.id,component:r.dataset.elyComponent,...detail}})});
const snapshots=[];const snap=name=>snapshots.push({name,active:active?.name,query:field.value,visible:list.children.filter(r=>!r.hidden).map(r=>r.option.value),selected:list.children.filter(r=>r.option.getAttribute('aria-selected')==='true').map(r=>r.option.value),changes:changes.length,actions:actions.length});
const key=key=>{let prevented=false;h.keydown({key,target:active,preventDefault(){prevented=true},stopPropagation(){}});return prevented};
active=field;h.input({target:field});snap('input-op');assert.equal(changes.at(-1).name,'cmdQuery');
assert.equal(field.getAttribute('aria-activedescendant'),open.id);
const originalIDs = [open,option,other,blocked,secret].map(o=>o.id);
key('ArrowDown');snap('arrow-down');assert.equal(active,field);assert.equal(option.getAttribute('aria-selected'),'true');
assert.equal(field.getAttribute('aria-activedescendant'),option.id);assert.equal(option.scrolled,1);
// Printable keys must leave native editing to the query field, never generic
// label-prefix roving. VM dispatch does not insert text; browser CI must do so.
for (const char of ['e','n','o',' ']) assert.equal(key(char),false);
assert.equal(active,field);assert.equal(field.value,'op');assert.equal(changes.length,1);
key('Enter');snap('enter-after-arrow');assert.equal(actions.length,1);assert.equal(actions[0].value,'option-file');
// Separate known close-order mismatch is deliberately preserved in this unit.
assert.deepEqual(timeline.slice(-3).map(x=>[x.event,x.open]),[['ely:action',true],['ely:change',true],['close',false]]);
active=field;dialog.open=true;field.value='open';h.input({target:field});snap('explicit-input-event-open');assert.equal(open.getAttribute('aria-selected'),'true');assert.equal(option.row.hidden,true);
assert.equal(field.getAttribute('aria-activedescendant'),open.id);
key('ArrowDown');assert.equal(active,field);assert.equal(field.getAttribute('aria-activedescendant'),open.id);assert.equal(blocked.getAttribute('aria-selected'),'false');
field.value='op';h.input({target:field});key('ArrowUp');assert.equal(field.getAttribute('aria-activedescendant'),other.id);key('ArrowDown');assert.equal(field.getAttribute('aria-activedescendant'),open.id);
// Preserve existing Home/End command navigation, without a new editing policy.
key('End');assert.equal(field.getAttribute('aria-activedescendant'),other.id);assert.equal(active,field);key('Home');assert.equal(field.getAttribute('aria-activedescendant'),open.id);
assert.deepEqual([open,option,other,blocked,secret].map(o=>o.id),originalIDs,'filter/ranking must not replace option identity');
// Pointer activation also keeps the active reference in sync with selection.
option.click();assert.equal(field.getAttribute('aria-activedescendant'),option.id);assert.equal(actions.at(-1).value,'option-file');
active=field;dialog.open=true;key('Escape');assert.equal(dialog.open,false);snap('escape');
active=field;dialog.open=true;field.value='zzzz';h.input({target:field});assert.equal(field.getAttribute('aria-activedescendant'),null);
const emptyEnterPrevented=key('Enter');assert.equal(emptyEnterPrevented,false);snap('empty-enter-keydown');
// Separate known empty-Enter default remains recorded; no native submission
// claim comes from this VM. No SearchableMenu keyup gate is imported.
for (const otherKind of ['QuickOpen','QuickSwitcher','SearchPalette']) {
  kind.dataset.interactionKind='CommandPalette';field.value='op';h.input({target:field});field.removeAttribute('aria-activedescendant');
  kind.dataset.interactionKind=otherKind;active=field;dialog.open=true;
  field.setAttribute('aria-activedescendant','caller-owned-shared-sentinel');
  const scrolled=option.scrolled;
  h.syncCommandPalette(dialog,option,true);
  assert.equal(field.getAttribute('aria-activedescendant'),'caller-owned-shared-sentinel',otherKind+' helper must not create/change a CommandPalette relation');
  assert.equal(option.scrolled,scrolled,otherKind+' helper must not scroll');
  h.syncCommandPalette(dialog,null);
  assert.equal(field.getAttribute('aria-activedescendant'),'caller-owned-shared-sentinel',otherKind+' helper must not clear caller state');
  field.removeAttribute('aria-activedescendant');
  key('ArrowDown');assert.equal(active,option,otherKind+' retains its existing result focus');assert.equal(field.getAttribute('aria-activedescendant'),null);
  key('Home');assert.equal(active,open);key('End');assert.equal(active,other);
  const before=actions.length;key('Enter');assert.equal(actions.length,before+1);assert.equal(actions.at(-1).value,'other-place');
  assert.equal(field.getAttribute('aria-activedescendant'),null,otherKind+' activation must not install a CommandPalette relation');
}
console.log('CommandPalette query-focus/active-option handler regressions passed; shared palette primaries retain their existing focus behavior. Native typing, layout and HTMX require browser CI.');
