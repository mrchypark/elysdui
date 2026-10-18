import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source=readFileSync(new URL('../../assets/ely-api-communication.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const mailAddresses='),source.indexOf('const mountMail='));
const events=[],changes=[];
const api=runInNewContext(code+'\n({mailAddresses,mailReady,mailPresets,mailInstant,mailSelection,selectMailRow})',{Date,emit:(_root,action,detail)=>events.push({action,...detail}),changed:(_root,name,value,detail)=>changes.push({name,value,...detail})});
assert.equal(api.mailReady(['','','']),false);
assert.equal(api.mailReady(['','ana@atrium.studio','']),true,'Cc-only draft can send');
assert.equal(api.mailReady(['ana@atrium.studio, ben@atrium.studio','','']),true);
assert.equal(api.mailReady(['ana@atrium.studio','not an address','']),false);
assert.equal(api.mailReady(['<script>@atrium.studio','','']),true,'Addresses are text, never HTML');
assert.deepEqual(Array.from(api.mailSelection(6,4,1,[1],true,false)),[1,2,3,4]);
assert.deepEqual(Array.from(api.mailSelection(6,1,4,[4],true,false)),[1,2,3,4]);
assert.deepEqual(Array.from(api.mailSelection(6,2,0,[0,2],false,true)),[0]);
assert.deepEqual(Array.from(api.mailSelection(6,4,0,[0,2],false,false)),[4]);

const savedZone=process.env.TZ;
process.env.TZ='UTC';
let presets=api.mailPresets('snooze',new Date('2026-10-09T09:00:00Z'));
assert.equal(presets.length,3,'Friday merges tomorrow and weekend');
assert.deepEqual(Array.from(presets,p=>p.value),['2026-10-09T18:00','2026-10-10T08:00','2026-10-12T08:00']);
assert.equal(api.mailPresets('snooze',new Date('2026-10-11T18:00Z')).length,1,'Sunday merges tomorrow and next week and omits later today');
assert.deepEqual(Array.from(api.mailPresets('schedule-send',new Date('2026-10-11T09:00Z')),p=>p.value),['2026-10-12T08:00','2026-10-12T13:00']);
assert.equal(api.mailPresets('schedule-send',new Date('2026-10-12T09:00Z')).at(-1).value,'2026-10-19T08:00','Monday means next Monday');
const now=new Date('2026-10-13T09:00Z');
assert.equal(api.mailInstant('2026-10-13T09:00',now),null);
assert.equal(api.mailInstant('2026-10-13T08:59',now),null);
assert.equal(api.mailInstant('not a date',now),null);
assert.equal(api.mailInstant('2026-02-30T12:00',new Date('2026-01-01T00:00Z')),null);
assert.equal(api.mailInstant('2026-10-13T09:01',now),'2026-10-13T09:01:00.000Z');
assert.equal(api.mailInstant('2026-10-13T19:00+09:00',now),'2026-10-13T10:00:00.000Z');
process.env.TZ='America/New_York';
assert.equal(api.mailInstant('2026-03-08T02:30',new Date('2026-03-07T00:00Z')),null,'DST gap must not silently normalize');
assert.equal(api.mailPresets('schedule-send',new Date('2026-03-07T12:00:00-05:00'))[0].value,'2026-03-08T08:00','Presets keep local wall-clock hour across DST');
if(savedZone===undefined)delete process.env.TZ;else process.env.TZ=savedZone;

const rows=['review','samples','brief','invoice'].map((value,i)=>({value,dataset:{elyValue:value},selected:i===0,hidden:false,getAttribute(){return String(this.selected)},setAttribute(_key,value){this.selected=value==='true'},closest(){return this}}));
const root={dataset:{},querySelectorAll:()=>rows};
api.selectMailRow(root,rows[2],{shiftKey:true});
assert.deepEqual(rows.map(row=>row.selected),[true,true,true,false]);
assert.deepEqual(Array.from(events.at(-1).selected),['review','samples','brief']);
api.selectMailRow(root,rows[1],{ctrlKey:true});assert.equal(rows[1].selected,false);
rows[2].hidden=true;api.selectMailRow(root,rows[3],{});
assert.equal(rows[2].selected,false,'Exclusive selection clears previously selected hidden mail');
assert.deepEqual(Array.from(events.at(-1).selected),['invoice']);
assert.equal(events.at(-1).value,'invoice');
assert.equal(changes.at(-1).name,'mail-selection');
console.log('Mail controls: recipients, selection ranges, future validation, deduplicated presets and DST checks passed');

// Run the production draft and scheduling handlers at a minimal DOM boundary.
const listeners={};
const node=()=>({dataset:{},children:[],setAttribute(key,value){this[key]=value},append(...items){this.children.push(...items)},replaceChildren(...items){this.children=items}});
const field=(name,value='')=>({...node(),name,value,matches:selector=>selector==='[data-ely-mail-address]'&&['to','cc','bcc'].includes(name)});
const fields={to:field('to'),cc:field('cc'),bcc:field('bcc'),subject:field('subject','Review'),message:field('message','Keep this draft')};
const chips={to:node(),cc:node(),bcc:node()},send={},schedule={},status={textContent:''},copies={hidden:false},copyButton=node();
const composer={elements:fields,querySelectorAll:selector=>selector==='[data-ely-mail-address]'?[fields.to,fields.cc,fields.bcc]:selector==='input:not([type=hidden]),textarea'?Object.values(fields):[],querySelector:selector=>({'[data-ely-mail-send]':send,'[data-ely-mail-compose-schedule]':schedule,'[data-ely-status]':status,'[data-ely-mail-copy-fields]':copies,'[data-ely-mail-copies]':copyButton,'[data-ely-mail-chips="to"]':chips.to,'[data-ely-mail-chips="cc"]':chips.cc,'[data-ely-mail-chips="bcc"]':chips.bcc}[selector]),matches:selector=>selector==='[data-ely-mail-compose]',reportValidity:()=>true};
const menu={hidden:false},trigger=node(),dialog={open:true,close(){this.open=false}},result={};
const owner={dataset:{elyMailTime:'schedule-send',referenceNow:'2026-10-13T00:00:00Z'},querySelector:selector=>({'[data-ely-mail-time-options]':menu,'[data-ely-mail-time-menu]':trigger,'dialog':dialog,'[data-ely-mail-time-result]':result}[selector])};
const when={value:'2027-10-13T12:00',setCustomValidity(message){this.error=message},reportValidity(){return !this.error}};
const timeForm={elements:{send_at:when,instant:{value:''},time_zone:{value:''},value:{value:'caller-id'}},matches:selector=>selector==='[data-ely-mail-time-form]',closest:()=>owner,querySelector:()=>when};
const boundary={dataset:{},querySelectorAll:()=>[],querySelector:selector=>selector==='[data-ely-mail-compose]'?composer:null,addEventListener(type,handler){(listeners[type]??=[]).push(handler)},contains:()=>true};
class FormValues{
 constructor(form){this.values=new Map(Object.entries(form?.elements||{}).map(([key,field])=>[key,field.value]));}
 set(key,value){this.values.set(key,value)}
 [Symbol.iterator](){return this.values[Symbol.iterator]()}
}
const mountSource=source.slice(source.indexOf('const mountMail='),source.indexOf("\nregister('communication'"));
const mount=runInNewContext(code+mountSource+'\nmountMail',{Date,Intl,FormData:FormValues,document:{createElement:node,addEventListener(){}},emit:(_root,action,detail)=>events.push({action,...detail}),changed(){}});
mount(boundary,{signal:{}});
assert.equal(send.disabled,true);
fields.to.value='ana@atrium.studio';
listeners.input[0]({target:fields.to});assert.equal(send.disabled,false);assert.equal(chips.to.children[0].value,fields.to.value);
fields.cc.value='bad';listeners.input[0]({target:fields.cc});assert.equal(send.disabled,true);
let blocked=false;listeners.submit[0]({target:composer,preventDefault(){blocked=true},stopImmediatePropagation(){}});
assert.equal(blocked,true);assert.equal(status.textContent,'');
fields.cc.value='ben@atrium.studio';listeners.input[0]({target:fields.cc});
listeners.submit[0]({target:composer});assert.equal(status.textContent,'Send requested.');assert.equal(fields.message.value,'Keep this draft');
const eventCount=events.length;
when.value='2000-01-01T12:00';listeners.submit[0]({target:timeForm,preventDefault(){},stopImmediatePropagation(){}});
assert.equal(events.length,eventCount,'Past schedules must not reach the host');assert.equal(dialog.open,true);
when.value='2027-10-13T12:00';listeners.submit[0]({target:timeForm,preventDefault(){},stopImmediatePropagation(){}});
assert.equal(events.at(-1).action,'schedule-send');assert.equal(dialog.open,false);
assert.ok(events.at(-1).values.some(([key,value])=>key==='message'&&value==='Keep this draft'));
assert.ok(events.at(-1).values.some(([key,value])=>key==='instant'&&Number.isFinite(Date.parse(value))));
assert.equal(fields.to.value,'ana@atrium.studio','Scheduling does not clear the draft');
const discard={disabled:false,matches:selector=>selector==='[data-ely-mail-discard]',closest:()=>null};
listeners.click[0]({target:{closest:()=>discard}});
assert.equal(fields.message.value,'');assert.equal(fields.cc.value,'');assert.equal(send.disabled,true);assert.equal(copies.hidden,true);
console.log('Mail callbacks: invalid drafts/times blocked, current draft scheduled, discard local only');

// LabelPicker can itself be inside a visible gallery <li>. Descendant selectors
// must not use that ancestor to select an internally hidden label.
const labelListeners={},labelActions=[],labelChanges=[];
const labelNode=(tag)=>({tag,dataset:{},children:[],hidden:false,disabled:false,value:'',attrs:{},setAttribute(k,v){this.attrs[k]=v},getAttribute(k){return this.attrs[k]},append(...nodes){nodes.forEach(n=>{n.parent=this;this.children.push(n)})},closest(selector){if(selector==='button')return this.tag==='button'?this:this.parent?.closest(selector);if(selector==='li')return this.tag==='li'?this:this.parent?.closest(selector);if(selector==='.ely-mail-labels')return labelPanel;return null},querySelector(selector){if(selector==='[data-ely-mail-label-name]')return this.children.find(n=>'elyMailLabelName' in n.dataset);return null},matches(selector){return selector==='[data-ely-mail-label]'?'elyMailLabel' in this.dataset:selector==='[data-ely-mail-label-create]'?'elyMailLabelCreate' in this.dataset:false},click(){labelListeners.click({target:this})}});
const labelList=labelNode('ul'),labelQuery={value:'',matches:s=>s==='[data-ely-mail-label-query]',closest:()=>labelPanel},labelCreate=labelNode('button'),labelSummary={};
labelCreate.dataset.elyMailLabelCreate='';
const existing=labelNode('button'),existingRow=labelNode('li'),existingName=labelNode('span');
existing.dataset.elyMailLabel='';existing.value='studio';existing.setAttribute('aria-pressed','true');existingName.dataset.elyMailLabelName='';existingName.textContent='Studio';existing.append(existingName);existingRow.append(existing);labelList.append(existingRow);
const labelButtons=()=>labelList.children.flatMap(row=>row.children);
const labelPanel={querySelectorAll:()=>labelButtons(),querySelector(selector){return ({'input':labelQuery,'[data-ely-mail-label-query]':labelQuery,'[data-ely-mail-label-create]':labelCreate,'[data-ely-mail-label-summary]':labelSummary,'ul':labelList,'li:not([hidden]) button':existing})[selector]||null}};
const labelRoot={id:'caller-labels',dataset:{},contains:()=>true,querySelector:s=>s==='.ely-mail-labels'?labelPanel:null,querySelectorAll:()=>[],addEventListener(type,handler){labelListeners[type]=handler}};
const mountLabels=runInNewContext(code+mountSource+'\nmountMail',{Date,Intl,document:{createElement:labelNode,addEventListener(){}},emit:(_root,action,detail)=>labelActions.push({action,...detail}),changed:(_root,name,value)=>labelChanges.push({name,value})});
mountLabels(labelRoot,{signal:{}});
labelQuery.value=' Suppliers ';labelListeners.input({target:labelQuery});
assert.equal(existingRow.hidden,true);assert.equal(labelCreate.hidden,false);
let enterPrevented=false;labelListeners.keydown({target:labelQuery,key:'Enter',preventDefault(){enterPrevented=true}});
assert.equal(enterPrevented,true);
const created=labelButtons().find(button=>button!==existing);
assert.ok(created,'Enter creates a label rather than toggling a hidden match');
assert.equal(created.getAttribute('aria-pressed'),'true');
assert.equal(created.querySelector('[data-ely-mail-label-name]').textContent,'Suppliers');
assert.equal(existing.getAttribute('aria-pressed'),'true','Existing selected labels are preserved');
assert.deepEqual(JSON.parse(JSON.stringify(labelActions.at(-1))),{action:'create-label',name:'Suppliers',value:'caller-labels-local-1',selected:['studio','caller-labels-local-1']});
assert.equal(labelQuery.value,'');assert.equal(labelCreate.hidden,true);
created.click();assert.equal(created.getAttribute('aria-pressed'),'false');
assert.deepEqual(Array.from(labelActions.at(-1).selected),['studio']);
assert.equal(labelActions.at(-1).action,'set-labels');
console.log('Mail labels: nested-list Enter creation, selected state, host payload and deselection passed');
