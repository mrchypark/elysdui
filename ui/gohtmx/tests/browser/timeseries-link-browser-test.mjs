import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from 'playwright';

const reserve=createServer();
await new Promise(resolve=>reserve.listen(0,'127.0.0.1',resolve));
const port=reserve.address().port;
await new Promise(resolve=>reserve.close(resolve));
const url=`http://127.0.0.1:${port}`;
const server=spawn('go',['run','./examples/gohtmx/timeseries','-addr',`127.0.0.1:${port}`],{detached:true,stdio:'ignore'});
let browser;
try {
  for(let i=0;i<300;i++){try{if((await fetch(url)).ok)break;}catch{} await delay(100); if(i===299)assert.fail('example server did not start');}
  browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH}:{})});
  const page=await browser.newPage({viewport:{width:1200,height:800}});
  await page.goto(url);
  const result=await page.evaluate(async()=>{
    const {createTimeSeriesLink,mountTimeSeries}=await import('/assets/ely-timeseries.js');
    const link=createTimeSeriesLink(), x=Float64Array.from({length:101},(_,i)=>i), y=Float64Array.from(x,i=>i), narrowX=Float64Array.from({length:61},(_,i)=>i+20), narrowY=Float64Array.from(narrowX,i=>i);
    const make=id=>{const root=document.createElement('div');root.id=id;root.style.width='600px';document.querySelector('main').append(root);return root;};
    let firstChanges=0,secondChanges=0;
    const first=mountTimeSeries(make('linked-first'),{x,series:[y],time:false,link,onViewport:()=>firstChanges++});
    first.plot.setScale('x',{min:0,max:100});
    const second=mountTimeSeries(make('linked-second'),{x:narrowX,series:[narrowY],time:false,link,onViewport:()=>secondChanges++});
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const joined={min:second.plot.scales.x.min,max:second.plot.scales.x.max}, sourceAfterJoin={min:first.plot.scales.x.min,max:first.plot.scales.x.max};
    second.plot.setScale('x',{min:30,max:50});
    first.setSelectedX(35);
    await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));
    const result={joined,sourceAfterJoin,first:{min:first.plot.scales.x.min,max:first.plot.scales.x.max},changes:{first:firstChanges,second:secondChanges},selected:!document.querySelector('#linked-second .ely-timeseries-selection').hidden};
    first.destroy();second.destroy();return result;
  });
  assert.deepEqual(result.joined,{min:20,max:80},'a late chart clamps the linked viewport to its domain');
  assert.deepEqual(result.sourceAfterJoin,{min:0,max:100},'a clamped peer viewport does not feed back into the source');
  assert.deepEqual(result.first,{min:30,max:50},'an explicit peer viewport update synchronizes back once');
  assert.deepEqual(result.changes,{first:2,second:2},'linked updates do not feed back into their source');
  assert.equal(result.selected,true,'selection marker synchronizes to the peer');
  console.log('Time series link: viewport and selection synchronization passed');
} finally {await browser?.close();try{process.kill(-server.pid,'SIGTERM');}catch{}}
