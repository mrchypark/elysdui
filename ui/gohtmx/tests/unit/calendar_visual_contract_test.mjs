import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transform} from 'lightningcss';

const path='ui/gohtmx/assets/ely-api-calendar-parity.css';
const css=readFileSync(path,'utf8');
transform({filename:path,code:Buffer.from(css),errorRecovery:false});
const rules=[...css.replace(/\/\*[\s\S]*?\*\//g,'').matchAll(/([^{}]+)\{([^{}]*)\}/g)];
for(const [,selector] of rules){
  assert(selector.trim().startsWith("[data-ely-family='communication']"),`Unscoped rule: ${selector}`);
  assert(!/reminder|all-day|calendar-colors|data-ely-event/.test(selector),`Rule reaches unrelated EventEditor controls: ${selector}`);
}
const declarations=selector=>{
  const rule=rules.find(([,actual])=>actual.trim()===selector);
  assert(rule,`Missing rule ${selector}`);
  return Object.fromEntries(rule[2].split(';').filter(s=>s.trim()).map(s=>s.trim().split(/:(.*)/s).slice(0,2)));
};
const prefix="[data-ely-family='communication'] ";
const grid=declarations(prefix+'.ely-calendar-time-grid');
assert.equal(grid['grid-template-rows'],'none');
assert.equal(grid['grid-auto-rows'],'24px');
assert.equal(grid['align-content'],'start');
assert.equal(declarations(prefix+'.ely-calendar-time-grid > time')['white-space'],'nowrap');
assert.equal(declarations(prefix+"[data-ely-calendar='week'] .ely-calendar-time-grid > time > span").display,'none');
assert.equal(declarations(prefix+'.ely-calendar-day-grid > time:has(> span)')['grid-template-columns'],'56px 48px');
assert.equal(declarations(prefix+'.ely-calendar-chip').height,'20px');
assert.equal(declarations(prefix+'.ely-calendar-grid article').gap,'2px');
assert.equal(declarations(prefix+'.ely-calendar-event-card').height,'58px');
assert.equal(declarations(prefix+'.ely-calendar-year .ely-calendar-mini-month').width,'196px');
// Exercise production drag snapping with the fixed CSS half-hour pitch.
const source=readFileSync('ui/gohtmx/assets/ely-api-communication.js','utf8');
const start=source.indexOf('const calendarPointerTime='),end=source.indexOf('\nconst ',start+1);
assert(start>=0&&end>start);
const pointerTime=runInNewContext(source.slice(start,end)+'\ncalendarPointerTime');
const height=Number.parseFloat(grid['grid-auto-rows']);
const slot={dataset:{elyTime:'09:00'},getBoundingClientRect:()=>({top:100,height})};
assert.equal(pointerTime(slot,100),'09:00');
assert.equal(pointerTime(slot,100+height/2),'09:15');
assert.equal(pointerTime(slot,100+height),'09:30');
assert.equal(height*2,48,'Source hour height and local drag geometry must agree');
console.log('Calendar CSS syntax, ownership, source dimensions and production drag geometry passed');
assert.equal(declarations(prefix+'.ely-calendar-editor [data-calendar-repeat] > label').display,'flex');
assert.equal(declarations(prefix+".ely-calendar-editor [data-calendar-repeat] > label > input[type='number']")['inline-size'],'96px');
assert.equal(declarations(prefix+".ely-calendar-editor [data-calendar-repeat] > label > input[type='date']")['inline-size'],'150px');
