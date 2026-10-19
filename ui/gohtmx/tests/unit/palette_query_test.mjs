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
const controllerInit=extract('  const paletteNavigationOwner =','  const dialogOpeners =');
const activationSource=extract('  const activateCommandPalette =','  const showTourStep =');
const cleanupSource=extract('  const cleanup = () => { paletteNavigationActive','  registerCleanup?.(cleanup);');
const inputSource=extract('  const input = event =>','  const submit = event =>');
const closestSource=extract('const closest =','const formatCountdown =');
let active, closeEffect;const actions=[],changes=[],focuses=[],timeline=[];
class E {
 constructor(name){this.name=name;this.attrs={};this.dataset={};this.hidden=false;this.disabled=false;this.isConnected=true;this.textContent='';}
 getAttribute(k){return this.attrs[k]??null} setAttribute(k,v){this.attrs[k]=String(v)} removeAttribute(k){delete this.attrs[k]} hasAttribute(k){return k in this.attrs}
 scrollIntoView(options){this.scrolled=(this.scrolled||0)+1;assert.equal(options.block,'nearest');assert.equal(options.inline,'nearest')}
 focus(){if(!this.disabled&&!this.row?.hidden){const changed=active!==this;active=this;focuses.push(this.name);if(changed)this.onFocus?.()}}
 closest(s){if(s==='[data-ely-family]')return this.ownerRoot||root;if(s==='[hidden]')return this.hidden?this:this.row?.hidden?this.row:null;if(s==='li')return this.row||null;if(s==='ul'||s==='[data-interaction-palette-results]'||s==='[data-interaction-roving]')return this.row?this.ownerList||list:null;if(s==='[data-interaction-palette-option]'||s==='[data-ely-action]')return this.row?this:null;if(s==='[data-interaction-palette-action]')return this.dataset.interactionPaletteAction!==undefined?this:null;if(s==='dialog[data-interaction-palette]'||s==='[data-interaction-palette]'||s==='dialog'||s==='dialog[open], [data-interaction-popover]:not([hidden])')return dialog;if(s==='[data-interaction-kind]')return kind;if(s==='[data-interaction-filter]')return this===field?field:null;if(s==='[data-interaction-palette], [data-interaction-palette-results], [data-interaction-palette-option]')return this.row?this:dialog;return null}
 matches(s){return this===list&&s==='[data-interaction-palette-results]'}
}
const root=new E('root');root.id='palette-probe';root.dataset={elyComponent:'navigation/CommandPalette',elyKind:'CommandPalette',elyFamily:'interaction',elyReady:'true'};root.removeEventListener=()=>{};root.querySelector=s=>s==='dialog[open]'&&dialog.open?dialog:null;
root.dispatchEvent=e=>{const detail={...e.detail};if(e.type==='ely:change')changes.push(detail);if(e.type==='ely:action')actions.push(detail);timeline.push({event:e.type,open:dialog.open,active:active?.name,detail});return true};
const kind=new E('kind');kind.dataset.interactionKind='CommandPalette';
const field=new E('query');field.value='op';field.name='cmdQuery';
const list=new E('results');list.children=[];list.append=row=>{list.children=list.children.filter(x=>x!==row);list.children.push(row)};
list.querySelectorAll=s=>s==='.ely-interaction__palette-label'?[]:list.children.filter(r=>r.option).map(r=>r.option).filter(o=>!s.includes(':not(:disabled)')||!o.disabled);
const dialog=new E('dialog');dialog.open=true;dialog.querySelector=s=>s==='[data-interaction-palette-results]'?list:s==='[data-interaction-filter]'?field:null;dialog.querySelectorAll=s=>list.querySelectorAll(s);
const make=(label,value,disabled=false)=>{const option=new E(value),row=new E(value+'-row');row.option=option;option.row=row;option.id='palette-probe-option-'+list.children.length;option.textContent=label;option.value=value;option.type='button';option.disabled=disabled;option.dataset.elyAction='run-'+value;option.dataset.interactionPaletteAction='';option.dataset.interactionPaletteGroup='';const text={textContent:label,replaceChildren(...children){this.textContent=children.map(c=>c.textContent).join('')}};option.querySelector=s=>s==='strong'?text:null;option.click=()=>{if(!option.disabled){const e={target:option,preventDefault(){}};genericClick(e);familyClick(e,option)}};list.append(row);return option};
const open=make('Open','open-file'),option=make('Option','option-file'),other=make('Other place','other-place'),blocked=make('Open disabled','disabled-open',true),secret=make('Zebra','zebra-file');
const document={removeEventListener(){},get activeElement(){return active},createTextNode:text=>({textContent:text}),createElement:tag=>({tag,textContent:''})};
const sandbox={root,document,Element:E,TextEncoder,CustomEvent:class{constructor(type,init){this.type=type;Object.assign(this,init)}},closeDialog(d){d.open=false;timeline.push({event:'close',open:d.open});closeEffect?.();},close(){},holdStart(){},trapOverlayFocus(){}};
// Execute the real core owner-capture closure with model generation/binding maps.
const mounted=new Map(),hostBindings=new Map(),cleanups=[];mounted.set(root,cleanups);
sandbox.ownerContext=runInNewContext(cut(core,'    const ownerContext = Object.freeze','    try {')+'\nownerContext',{root,mounted,hostBindings,cleanups});
sandbox.emit=runInNewContext(cut(core,'export function emit(','function belongs(').replace('export function','function')+'\nemit',sandbox);
const direct=runInNewContext(directKeys+'\nkeydown',sandbox);
const cleanupStubs=Object.fromEntries(['cleanupContextRequests','clearReorderPreview','click','scroll','result','error','contextmenu','pointerover','menuPointerMove','dragend','dragstart','dragover','drop','lightboxPointerDownHandler','lightboxPointerUpHandler','holdEnd','keyup','outside'].map(name=>[name,()=>{}]));
const makeHandlers=(runtime=source)=>runInNewContext(controllerInit+closestSource+matcher+filter+activationSource+inputSource+cut(runtime,'  let menuConfirmKey','  let dragging, reorderPreview;')+cleanupSource+'\n({keydown,input,filterPalette,syncCommandPalette,activateCommandPalette,cleanup})',{...sandbox,...cleanupStubs,clearTimeout,timers:new Set(),lottieCleanups:[],sourceFamily:{keydown:direct}});
let h=makeHandlers();
const genericClick=runInNewContext(cut(core,'    const click = event => {','    const submit = event => {')+'\nclick',{root,belongs:(_r,t)=>t.closest('[data-ely-family]')===root,emit:sandbox.emit});
const familyClick=runInNewContext(closestSource+'\n(event,target)=>{'+cut(source,"    const ownedPaletteOption = closest(root, event.target, '[data-interaction-palette-action]');",'    if (target?.closest(\'[data-interaction-step]\'))')+'}',{...sandbox,activateCommandPalette:(...args)=>h.activateCommandPalette(...args),syncCommandPalette:(...args)=>h.syncCommandPalette(...args)});
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
// The marked family path commits close before either caller event.
assert.deepEqual(timeline.slice(-3).map(x=>[x.event,x.open]),[['close',false],['ely:action',false],['ely:change',false]]);
assert.equal(actions[0].formData,null);assert.equal(actions[0].values.length,0);
const actionCount=actions.length;genericClick({target:option,preventDefault(){}});assert.equal(actions.length,actionCount,'core must suppress marked option action');
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
const emptyEnterPrevented=key('Enter');assert.equal(emptyEnterPrevented,true);snap('empty-enter-keydown');
// This VM proves default cancellation, not native implicit submission.
// No SearchableMenu keyup gate is imported.
for (const otherKind of ['QuickOpen','QuickSwitcher','SearchPalette']) {
  kind.dataset.interactionKind='CommandPalette';field.value='op';h.input({target:field});field.removeAttribute('aria-activedescendant');
  kind.dataset.interactionKind=otherKind;root.dataset.elyKind=otherKind;for(const row of [open,option,other,blocked,secret])delete row.dataset.interactionPaletteAction;active=field;dialog.open=true;
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
// Handler-only focus reentry regressions. The production cleanup is executed,
// but these DOM doubles do not establish native focus or HTMX timing.
const originalRows=[open,option,other,blocked,secret].map(row=>row.row);
const dialogQuery=dialog.querySelector;
function resetReentry(runtime=source) {
  field.onFocus=undefined;
  root.id='palette-probe';root.dataset={elyComponent:'navigation/CommandPalette',elyKind:'CommandPalette',elyFamily:'interaction',elyReady:'true'};root.isConnected=true;
  kind.dataset.interactionKind='CommandPalette';for(const row of [open,option,other,blocked,secret])row.dataset.interactionPaletteAction='';dialog.open=true;dialog.querySelector=dialogQuery;list.children=[...originalRows];
  for(const node of [field,list,dialog,open,option,other,blocked,secret,...originalRows]){node.isConnected=true;node.hidden=false;delete node.ownerRoot;delete node.ownerList;}
  field.disabled=false;for(const row of [open,option,other,blocked,secret])row.disabled=row===blocked;
  field.value='op';h=makeHandlers(runtime);h.filterPalette(dialog,'op');active=open;
}
// A marked activation cannot fall back to generic dispatch when close-time
// caller code replaces its host binding. This uses the actual core capture.
resetReentry();active=field;const priorActions=actions.length,priorChanges=changes.length;
closeEffect=()=>hostBindings.set(root,{});option.click();closeEffect=undefined;
assert.equal(actions.length,priorActions);assert.equal(changes.length,priorChanges);
dialog.open=true;option.click();assert.equal(actions.length,priorActions+1);assert.equal(changes.length,priorChanges+1);
const reentryCases=[
  ['same-ID replacement row',()=>{list.children=list.children.filter(row=>row!==option.row);option.isConnected=false;option.row.isConnected=false;const fresh=make('Option','option-file');fresh.id=option.id;fresh.setAttribute('aria-selected','false');}],
  ['disposed controller with retained live nodes',()=>h.cleanup()],
  ['owner not ready during swap',()=>{delete root.dataset.elyReady;}],
  ['detached owner',()=>{root.isConnected=false;}],
  ['changed owner ID',()=>{root.id='replacement-owner';}],
  ['changed owner component',()=>{root.dataset.elyComponent='navigation/QuickOpen';}],
  ['changed owner family',()=>{root.dataset.elyFamily='replacement';}],
  ['disabled owner',()=>{root.dataset.elyDisabled='true';}],
  ['closed dialog',()=>{dialog.open=false;}],
  ['detached dialog',()=>{dialog.isConnected=false;}],
  ['reowned dialog',()=>{dialog.ownerRoot=new E('peer');}],
  ['replacement query field',()=>{dialog.querySelector=s=>s==='[data-interaction-filter]'?new E('fresh-query'):dialogQuery(s);}],
  ['replacement result list',()=>{dialog.querySelector=s=>s==='[data-interaction-palette-results]'?new E('fresh-list'):dialogQuery(s);}],
  ['detached query field',()=>{field.isConnected=false;}],
  ['disabled query field',()=>{field.disabled=true;}],
  ['reowned query field',()=>{field.ownerRoot=new E('peer');}],
  ['caller redirects focus',()=>{active=other;}],
  ['disabled selected row',()=>{option.disabled=true;}],
  ['reowned selected row',()=>{option.ownerRoot=new E('peer');}],
  ['selected row moved to another list',()=>{option.ownerList=new E('peer-list');}],
  ['hidden selected row',()=>{option.row.hidden=true;}],
  ['caller changed selection',()=>{option.setAttribute('aria-selected','false');open.setAttribute('aria-selected','true');}],
];
for(const [name,reenter] of reentryCases){
  resetReentry();const oldReference=field.getAttribute('aria-activedescendant'),oldScroll=option.scrolled||0,beforeActions=actions.length,beforeChanges=changes.length;
  field.onFocus=reenter;assert.equal(key('ArrowDown'),true);
  assert.equal(field.getAttribute('aria-activedescendant'),oldReference,name+': stale continuation must not write an active reference');
  assert.equal(option.scrolled||0,oldScroll,name+': stale continuation must not scroll its old target');
  assert.equal(actions.length,beforeActions);assert.equal(changes.length,beforeChanges);
}
// Fresh controller initialization remains able to navigate after disposal.
resetReentry();h.cleanup();h=makeHandlers();active=open;key('ArrowDown');assert.equal(field.getAttribute('aria-activedescendant'),option.id);assert.equal(active,field);
// A legitimate focus callback can refine the query. Preserve the callback's
// freshly selected row instead of reviving the pre-focus cursor.
resetReentry();field.onFocus=()=>{field.value='open';h.filterPalette(dialog,'open');};key('ArrowDown');assert.equal(field.getAttribute('aria-activedescendant'),open.id);assert.equal(option.row.hidden,true);
// Causal reversal uses the exact unchanged focus->sync path. It must reproduce
// a stale same-ID reference and scroll of the detached option in this VM.
const guard=cut(source,'        // A caller focus listener may synchronously swap, dispose, or reown','        syncCommandPalette(dialog, options[next], true);');
const unguarded=source.replace(guard,'');assert(unguarded.includes('queryField.focus({preventScroll: true});\n        syncCommandPalette(dialog, options[next], true);'));
resetReentry(unguarded);let fresh;const priorScroll=option.scrolled||0;
field.onFocus=()=>{list.children=list.children.filter(row=>row!==option.row);option.isConnected=false;option.row.isConnected=false;fresh=make('Option','option-file');fresh.id=option.id;fresh.setAttribute('aria-selected','false');};
key('ArrowDown');assert.equal(field.getAttribute('aria-activedescendant'),fresh.id);assert.equal(fresh.getAttribute('aria-selected'),'false');assert.equal(option.isConnected,false);assert.equal(option.scrolled,priorScroll+1);
console.log('CommandPalette query-focus and bounded post-focus reentry handler regressions passed, including exact unguarded causal reversal. Shared palette primaries retain their existing behavior. Native typing, geometry and HTMX timing require browser CI.');
