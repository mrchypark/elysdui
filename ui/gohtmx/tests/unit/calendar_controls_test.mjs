import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../assets/ely-api-communication.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const calendarDate='),source.indexOf('const mountCalendar='));
const api=runInNewContext(code+'\n({calendarDate,calendarAdd,calendarShift,calendarMonthDays,calendarFault,calendarRepeats,calendarPack,calendarPointerTime,calendarMonthRows})',{Date});
assert.equal(api.calendarDate('2026-02-30'),null);
assert.equal(api.calendarAdd('2028-02-28',1),'2028-02-29');
assert.equal(api.calendarShift('2026-01-31',1),'2026-02-28');
assert.equal(api.calendarShift('2028-02-29',12),'2029-02-28');
const october=Array.from(api.calendarMonthDays('2026-10-13'));
assert.equal(october.length,35);assert.equal(october[0],'2026-09-28');assert.equal(october.at(-1),'2026-11-01');
assert.equal(api.calendarMonthDays('2026-10-13',true).length,42);
assert.equal(api.calendarFault('Launch','2026-10-31','2026-10-31',true),'','All-day ranges include their final day');
assert.notEqual(api.calendarFault('Review','2026-10-31T11:00','2026-10-31T11:00',false),'');
assert.notEqual(api.calendarFault(' ','2026-10-31','2026-11-01',true),'');
assert.deepEqual(Array.from(api.calendarRepeats('2026-10-13','Weekly',1,[0,3],'',Infinity)),['2026-10-15','2026-10-19','2026-10-22','2026-10-26']);
assert.deepEqual(Array.from(api.calendarRepeats('2027-01-31','Monthly',1,[],'',Infinity,3)),['2027-01-31','2027-03-31','2027-05-31']);
assert.deepEqual(Array.from(api.calendarRepeats('2028-02-29','Yearly',1,[],'',Infinity,2)),['2028-02-29','2032-02-29']);
assert.deepEqual(Array.from(api.calendarRepeats('2026-10-13','Daily',2,[],'2026-10-16',Infinity)),['2026-10-13','2026-10-15']);
assert.deepEqual(Array.from(api.calendarRepeats('2026-10-13','Daily',1,[],'',2)),['2026-10-13','2026-10-14']);
console.log('Calendar controls: civil navigation, Monday grid, leap years, inclusive all-day validation and recurrence limits passed');
// Invoke the production pointer handler without a browser; services remain events.
const pointerStart=source.indexOf('  const onPointerUp=event=>'),pointerEnd=source.indexOf('\n  const ',pointerStart+5);
const pointerEvents=[];
const slot=(date,time)=>({dataset:{elyDate:date,elyTime:time},append(node){this.output=node}});
const startSlot=slot('2026-10-13','11:00'),endSlot=slot('2026-10-14','12:00');
const eventBlock={value:'caller-event',dataset:{eventStart:'2026-10-13T11:00'},style:{setProperty(key,value){this[key]=value}}};
const invoke=runInNewContext('let calendarPointer;'+source.slice(pointerStart,pointerEnd)+'\n(pending,event)=>{calendarPointer=pending;onPointerUp(event)}',{Date,calendarPointerTime:api.calendarPointerTime,root:{contains:()=>true,querySelector:()=>null},document:{createElement:()=>({dataset:{}})},changed(){},emit:(_root,action,detail)=>pointerEvents.push({action,...detail})});
invoke({slot:startSlot,startY:0},{clientY:24,target:{closest:()=>endSlot}});
assert.equal(pointerEvents.at(-1).start,'2026-10-13T11:00');assert.equal(pointerEvents.at(-1).end,'2026-10-13T12:00','Drag stays in the starting day');assert.match(startSlot.output.textContent,/New event/);
invoke({slot:startSlot,startY:0,calendarEvent:eventBlock},{clientY:24,target:{closest:()=>endSlot}});
assert.equal(eventBlock.dataset.eventEnd,'2026-10-13T12:00');assert.equal(eventBlock.style['--calendar-minutes'],'60');assert.equal(pointerEvents.at(-1).value,'caller-event');
const before=pointerEvents.length;invoke({slot:startSlot,startY:0,calendarEvent:eventBlock},{clientY:24,target:{closest:()=>slot('2026-10-13','10:00')}});assert.equal(pointerEvents.length,before,'Resize cannot end before the event starts');
console.log('Calendar pointer controls: local draft, resize geometry, same-day range and host identity passed');

const packed=Array.from(api.calendarPack([{start:0,end:60},{start:15,end:30},{start:30,end:45},{start:60,end:90}]));
assert.deepEqual(packed.map(e=>[e.lane,e.columns]),[[0,2],[1,2],[1,2],[0,1]],'Overlapping events share lanes; adjacent events reuse lanes');
const quarter={dataset:{elyTime:'11:00'},getBoundingClientRect:()=>({top:100,height:24})};
assert.equal(api.calendarPointerTime(quarter,112),'11:15');assert.equal(api.calendarPointerTime(quarter,124),'11:30');
console.log('Calendar geometry: overlap lane reuse and quarter-hour pointer snapping passed');

// Month layout shares span lanes across every day in a week, as source weeks.rs.
const timed=key=>({key,timed:true}),bar=(key,span)=>({key,span});
let month=api.calendarMonthRows([[timed('a'),timed('b'),timed('c'),timed('d')],[],[],[],[],[],[]]);
assert.deepEqual(Array.from(month.days[0].visible,e=>e.key),['a','b']);
assert.deepEqual(Array.from(month.days[0].more,e=>e.key),['c','d']);
month=api.calendarMonthRows([[],[timed('a'),timed('b'),timed('c'),timed('d'),timed('e')],[],[bar('offsite',3)],[],[timed('photos')],[bar('night',1)]]);
assert.equal(month.lanes,1);
assert.equal(month.days[1].visible.length,1);
assert.equal(month.days[1].more.length,4);
assert.equal(month.days[5].visible[0].key,'photos','Timed event remains below the reserved span lane');
month=api.calendarMonthRows([[bar('long',7),bar('short',3),bar('hidden',4)],[],[],[],[],[],[bar('clipped',4)]]);
assert.equal(month.lanes,2);
assert.equal(month.bars.find(b=>b.event.key==='clipped').span,1);
assert.equal(month.days[1].more.length,1,'Hidden spans remain reachable on covered days');
console.log('Calendar month layout: overflow counts, shared span lanes, hidden bars and week clipping passed');
// Actual calendar key handler: activation, month-end clamping and popover focus.
const keyStart=source.indexOf("  root.addEventListener('keydown',event=>{const day="),keyEnd=source.indexOf("  root.addEventListener('input'",keyStart);
assert(keyStart>=0&&keyEnd>keyStart);
let calendarKey;const notices=[],navigation=[],selection=[];
const panel={hidden:false},trigger={focus(){this.focused=true;},setAttribute(name,value){this[name]=value;}};
const nextDay={value:'2027-02-28',focus(){this.focused=true;}};
const calendarRoot={addEventListener:(_name,handler)=>calendarKey=handler,querySelector:selector=>selector==='[data-calendar-popover]'?panel:trigger,querySelectorAll:()=>[]};
runInNewContext(source.slice(keyStart,keyEnd),{root:calendarRoot,view:{dataset:{elyCalendar:'year'},querySelectorAll:()=>[nextDay]},shown:'2027-01-31',options:{},calendarShift:api.calendarShift,calendarAdd:api.calendarAdd,selectDay:date=>selection.push(date),navigate:(direction,date)=>navigation.push({direction,date}),emit:(_root,action,detail)=>notices.push({action,...detail})});
const keyEvent=(key,day=null)=>({key,target:{closest:selector=>selector==='[data-ely-calendar-day]'?day:null},preventDefault(){},stopImmediatePropagation(){}});
calendarKey(keyEvent('PageDown',{value:'2027-01-31'}));
assert.deepEqual(navigation[0],{direction:'next',date:'2027-02-28'});
assert.equal(selection.at(-1),'2027-02-28');assert(nextDay.focused);
calendarKey(keyEvent('Enter',{value:'2027-02-28'}));assert.equal(notices.at(-1).action,'open-day');
const count=notices.length;calendarKey(keyEvent('Enter',{value:'2027-02-28',disabled:true}));assert.equal(notices.length,count);
calendarKey(keyEvent('Escape'));assert(panel.hidden&&trigger.focused);assert.equal(trigger['aria-expanded'],'false');
console.log('Calendar key handler: month-clamped PageDown, Enter, disabled guard and Escape focus passed');

// The first cell of October is September 28. Paging that focused date reaches
// October 28 and correctly leaves the visible October range unchanged.
calendarKey(keyEvent('PageDown',{value:'2026-09-28'}));
assert.deepEqual(navigation.at(-1),{direction:'next',date:'2026-10-28'});
assert.equal(api.calendarMonthDays('2026-09-28')[0],'2026-08-31');
assert.equal(api.calendarMonthDays('2026-10-28')[0],'2026-09-28');
console.log('Calendar outside-month PageDown uses the focused date, not the displayed month');
