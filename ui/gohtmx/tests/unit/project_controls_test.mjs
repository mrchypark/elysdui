import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../assets/ely-api-communication.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('const projectStatuses='),source.indexOf("\nregister('communication'"));
const calendar=source.slice(source.indexOf('const calendarDate='),source.indexOf('const mountCalendar='));
const api=runInNewContext(calendar+code+'\n({projectSpent,projectClock,projectSeconds,projectLabelFault,projectStep,projectStanding,projectTimer,projectMove,mountProject})',{Date,Intl});
assert.equal(api.projectSpent(5700),'1h 35m');assert.equal(api.projectSpent(2459),'40m');assert.equal(api.projectSpent(59),'0m');
assert.equal(api.projectClock(61.1),'01:02');assert.equal(api.projectSeconds('01:02:03'),3723);
assert.equal(api.projectLabelFault('  ',[]),'A label needs a name.');
assert.equal(api.projectLabelFault(' CLIENT ',[{key:'a',name:'Client'}]),'That name is taken.');
assert.equal(api.projectLabelFault('client',[{key:'a',name:'Client'}],'a'),'');
assert.deepEqual(Array.from(api.projectStep([3,0,2],0,2,'ArrowRight')),[1,0]);
assert.deepEqual(Array.from(api.projectStep([3,2],0,1,'ArrowRight')),[1,1]);
assert.deepEqual(Array.from(api.projectStep([3,2],0,1,'ArrowDown')),[0,2]);
assert.equal(api.projectStep([3,2],0,0,'ArrowUp'),null);
assert.equal(api.projectStanding('2026-09-01','2026-09-21','2026-09-11',5,10),'On track');
assert.equal(api.projectStanding('2026-09-01','2026-09-21','2026-09-11',3,10),'At risk');
assert.equal(api.projectStanding('2026-09-01','2026-09-21','2026-09-22',9,10),'Late');
assert.equal(api.projectStanding('2026-09-01','2026-09-21','2026-09-22',11,10),'Done');
const lengths={Focus:1500,'Short break':300,'Long break':900,rounds:2},timer=api.projectTimer(lengths);
timer.toggle(1000);assert.equal(timer.snapshot(31000).left,1470);timer.toggle(31000);assert.equal(timer.snapshot(90000).left,1470,'Pause banks elapsed time');timer.toggle(90000);assert.equal(timer.tick(1560000),true);assert.equal(timer.snapshot(1560000).phase,'Short break');assert.equal(timer.snapshot(1560000).running,false,'Completed phase waits for Start');assert.equal(timer.tick(2000000),false,'No duplicate phase notifications');timer.next();assert.equal(timer.snapshot(0).round,2);timer.next();assert.equal(timer.snapshot(0).phase,'Long break');timer.next();assert.equal(timer.snapshot(0).round,1);timer.reset();assert.equal(timer.snapshot(0).left,1500);
console.log('Project logic: unique labels, movement positions, milestone pace, elapsed clocks and Pomodoro phase boundaries passed');

// Real projectMove with deterministic DOM collaborators, including same-lane reorder.
const events=[],changes=[];
const lane=(id,cards)=>({dataset:{laneId:id},cards,output:{},empty:{},querySelectorAll(){return this.cards},querySelector(selector){return selector.includes('output')?this.output:this.empty},insertBefore(card,before){lanes.forEach(l=>l.cards=l.cards.filter(c=>c!==card));const index=this.cards.indexOf(before);this.cards.splice(index<0?this.cards.length:index,0,card)}});
const cards=['a','b','c'].map(id=>({dataset:{cardId:id},querySelector:()=>null,focus(){this.focused=true}})),lanes=[lane('todo',[...cards]),lane('doing',[])];
const root={contains:()=>true,querySelectorAll:()=>lanes};
const move=runInNewContext(code+'\nprojectMove',{changed:(_r,name,value,detail)=>changes.push({name,value,...detail}),emit:(_r,action,detail)=>events.push({action,...detail})});
move(root,cards[1],lanes[0],2);assert.deepEqual(lanes[0].cards.map(c=>c.dataset.cardId),['a','c','b']);
move(root,cards[1],lanes[1],0);assert.equal(lanes[0].output.textContent,'2');assert.equal(lanes[1].output.textContent,'1');assert.equal(lanes[1].empty.hidden,true);assert.deepEqual(JSON.parse(JSON.stringify(events.at(-1))),{action:'move-task',taskId:'b',laneId:'doing',index:0});assert.equal(cards[1].focused,true);
console.log('Project move: local order, lane counts, focus and exact host payload passed');

// Exercise the actual tracker submit and interval handlers with a controlled clock.
const listeners={},ticks=[],cleanups=[];let now=0;
const node=tag=>({tag,dataset:{},children:[],append(...children){this.children.push(...children)},prepend(child){this.children.unshift(child)},setAttribute(key,value){this[key]=value}});
const input={value:'',setCustomValidity(message){this.error=message},reportValidity(){return !this.error},focus(){this.focused=true}},control=node('button'),clock={textContent:'00:00'},total={},entries=node('ul');
const entry=node('li');entry.dataset.seconds='5700';entries.append(entry);
const form={elements:{task:input},querySelector:()=>control,matches:selector=>selector==='[data-project-track-form]'};
const tracker={querySelector:selector=>({'form':form,'ul':entries,'[data-ely-timer]':clock,'[data-project-time-total]':total}[selector]),querySelectorAll:()=>entries.children};
const trackerRoot={dataset:{},querySelector:selector=>selector==='[data-project-tracker]'?tracker:null,querySelectorAll:()=>[],addEventListener(type,handler){(listeners[type]??=[]).push(handler)}};
const mount=runInNewContext(calendar+code+'\nmountProject',{Date,Intl,performance:{now:()=>now},document:{createElement:node},setInterval:fn=>{ticks.push(fn);return ticks.length},clearInterval:id=>cleanups.push(id),changed(){},emit:(_root,action,detail)=>events.push({action,...detail})});
const aborts=[];mount(trackerRoot,{signal:{addEventListener(_name,handler){aborts.push(handler)}}});assert.equal(total.textContent,'1h 35m');
const submit=()=>listeners.submit[0]({target:form,preventDefault(){},stopImmediatePropagation(){}});
const before=events.length;submit();assert.equal(events.length,before,'Blank task must not start');assert.equal(input.error,'Name the task to time.');
input.value='  Caller task  ';submit();assert.equal(control.textContent,'Stop');assert.equal(control['aria-pressed'],'true');assert.equal(events.at(-1).task,'Caller task');now=65000;ticks[0]();assert.equal(clock.textContent,'01:05');submit();assert.equal(control.textContent,'Start');assert.equal(entries.children[0].dataset.seconds,'65');assert.equal(total.textContent,'1h 36m');assert.equal(events.at(-1).action,'log-time');assert.equal(events.at(-1).seconds,65);assert.equal(input.value,'');assert.equal(input.focused,true);aborts.forEach(fn=>fn());assert.equal(cleanups.length,1);
console.log('Project tracker callbacks: blank guard, live elapsed time, stop entry, totals, host payload and lifecycle cleanup passed');
