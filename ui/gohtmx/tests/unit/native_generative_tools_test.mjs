import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {promptVariables,fillPrompt,diffRuns,embeddingProjection,embeddingTurn,parseEmbedding,tuneProgress,nextSort,datasetPage,initNativeGenerativeTools} from '../../assets/ely-api-native-generative-tools.js';
// Unresolved variables need paired theme roles, not pale fill with inherited dark-theme ink.
const nativeCSS=readFileSync('ui/gohtmx/assets/ely-api-native.css','utf8');
assert.match(nativeCSS,/\[data-ely-family='native'\] \[data-native-filled-prompt\] mark\{background:var\(--warning-tint,#FEF2DD\);color:var\(--foreground,#181613\)\}/);
const inputCSS=readFileSync('ui/gohtmx/assets/input.css','utf8');
assert.match(readFileSync('ui/gohtmx/assets/ely-api.css','utf8'),/--foreground:var\(--color-ink\);/);
const declarations=css=>Object.fromEntries([...css.matchAll(/(--[\w-]+)\s*:\s*([^;{}]+);/g)].map(m=>[m[1],m[2].trim()]));
const lightTokens={...declarations(inputCSS.match(/@theme\s*\{([^}]+)\}/)[1]),...declarations(inputCSS.match(/:root\s*\{([^}]+)\}/)[1])};
const darkTokens={...lightTokens,...declarations(inputCSS.match(/:root\[data-theme='dark'\]\s*\{([^}]+)\}/)[1])};
const luminance=hex=>{assert.match(hex,/^#[\da-f]{6}$/i);return [1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255).map(c=>c<=.04045?c/12.92:((c+.055)/1.055)**2.4).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0)};
for(const [name,tokens] of [['light',lightTokens],['dark',darkTokens]]){const bg=luminance(tokens['--warning-tint']),fg=luminance(tokens['--color-ink']);assert.ok((Math.max(bg,fg)+.05)/(Math.min(bg,fg)+.05)>=7,`${name} unresolved prompt mark contrast must be at least 7:1`)}
assert.deepEqual(promptVariables('{topic} {tone} {topic} {bad-name} {{nested}} {이름}'),['topic','tone','nested','이름']);
assert.deepEqual(fillPrompt('Write {topic} in {tone}.',{topic:'gardens',tone:''}),{text:'Write gardens in {tone}.',blanks:[[17,23]]});
assert.equal(fillPrompt('{constructor} {__proto__}',{}).blanks.length,2);
assert.equal(fillPrompt('{__proto__}',JSON.parse('{"__proto__":"Caller"}')).text,'Caller');
assert.equal(fillPrompt('{topic} {topic}',{topic:'$&<img>'}).text,'$&<img> $&<img>');
assert.deepEqual(diffRuns('a warm tone','a calm tone'),[{kind:'equal',text:'a '},{kind:'delete',text:'warm'},{kind:'equal',text:' '},{kind:'insert',text:'calm'},{kind:'equal',text:' tone'}]);
assert.equal(diffRuns('a very warm tone','a calm tone').map(r=>r.text).join(''),'a very warm calm tone');
for(const [oldText,newText] of [['Write short notes.','Write plain, short notes.'],['Always say sorry.','Say sorry once.'],['old',''],['','new']]){const runs=diffRuns(oldText,newText);assert.equal(runs.filter(r=>r.kind!=='insert').map(r=>r.text).join('').trim().replace(/\s+/g,' '),oldText.trim().replace(/\s+/g,' '));assert.ok(runs.every(r=>['equal','insert','delete'].includes(r.kind)));}
assert.deepEqual(embeddingProjection([1,1,.5],400,300,null),[380,14.999999999999996,.5]);
const p=embeddingProjection([1,0,0],400,300,[0,0]);assert.ok(Math.abs(p[0]-(200+300*.45*Math.sqrt(15)/4))<1e-9);assert.equal(p[1],150);
const corners=Array.from({length:8},(_,i)=>[0,1,2].map(axis=>i>>axis&1?1:-1));for(let yaw=0;yaw<6.3;yaw+=.2)for(const point of corners){const[x,y,z]=embeddingProjection(point,400,300,[yaw,.6],Math.sqrt(3));assert.ok(x>=65&&x<=335&&y>=15&&y<=285&&z>=0&&z<=1);}
assert.equal(embeddingTurn([0,1.3],[0,.5])[1],1.4);assert.ok(embeddingTurn([0,0],[-.1,0])[0]>6);
assert.deepEqual(parseEmbedding('[{"key":"a","label":"A","group":4,"at":[0,0,0]}]',4),[]);assert.throws(()=>parseEmbedding('[{"key":"a","label":"A","group":0,"at":[2,0,0]}]',4));
assert.ok(Math.abs(tuneProgress(2,3,64)-54.666666666666664)<1e-9);assert.equal(tuneProgress(0,3,0),0);assert.throws(()=>tuneProgress(2,0,50));assert.throws(()=>tuneProgress(2,3,101));
const rows=Array.from({length:12},(_,i)=>({key:String(i),prompt:'Prompt '+i,answer:'Answer '+i,split:i%2?'Held out':'Train',tokens:12-i}));
assert.deepEqual(datasetPage(rows,{page:99,size:5}).rows.map(r=>r.key),['10','11']);assert.equal(datasetPage(rows,{query:'not present'}).first,0);
let sorts=nextSort([],'tokens');assert.equal(datasetPage(rows,{sorts}).rows[0].tokens,1);sorts=nextSort(sorts,'tokens');assert.equal(datasetPage(rows,{sorts}).rows[0].tokens,12);assert.deepEqual(nextSort(sorts,'tokens'),[]);assert.deepEqual(nextSort([{key:'split',direction:1}],'tokens',true),[{key:'split',direction:1},{key:'tokens',direction:1}]);assert.equal(rows[0].key,'0','paging must not mutate caller rows');

class Element extends EventTarget {
 dataset={};nodes={};attributes={};hidden=false;disabled=false;value='';textContent='';children=[];
 style={setProperty:(key,value)=>{this.style[key]=value;}};
 querySelectorAll(selector){return this.nodes[selector]||[];}
 querySelector(selector){return this.querySelectorAll(selector)[0]||null;}
 setAttribute(key,value){this.attributes[key]=String(value);}
 getAttribute(key){return this.attributes[key];}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=nodes;}
 focus(){}
 getBoundingClientRect(){return{left:0,top:0,width:340,height:255};}
}
globalThis.document={createElement:()=>new Element(),createElementNS:()=>new Element()};
const event=(type,props={})=>Object.assign(new Event(type,{cancelable:true}),props);
const root=new Element(),changes=[],actions=[],voices=new Element(),voiceRows=Array.from({length:4},()=>new Element());voices.dataset={selected:'iris',playing:'',playAction:'caller-sample'};
for(const[row,index]of voiceRows.map((r,i)=>[r,i])){row.dataset={nativeVoice:['iris','theo','mei','ines'][index],selected:String(index===0)};const play=new Element();play.nodes['[data-native-icon]']=[new Element()];row.nodes={'[data-native-voice-select]':[new Element()],'[data-native-voice-play]':[play],'[data-native-voice-check]':[new Element()]};}
voices.nodes={'[data-native-voice]':voiceRows,'[data-native-voice-value]':[new Element()],'[data-native-voice-status]':[new Element()]};root.nodes['[data-native-voices]']=[voices];
const downloads=new Element(),job=new Element(),progress=new Element(),jobStatus=new Element(),jobButtons=['pause','resume','cancel','retry','delete'].map(kind=>{const b=new Element();b.dataset.nativeDownloadAction=kind;return b;});job.dataset={nativeDownload:'caller',state:'fetching'};progress.value=43;job.nodes={'[data-native-download-action]':jobButtons,'progress':[progress],'[data-native-download-status]':[jobStatus]};downloads.nodes['[data-native-download]']=[job];root.nodes['[data-native-downloads]']=[downloads];
const card=new Element(),use=new Element(),inUse=new Element();card.dataset.inUse='true';card.nodes={'[data-native-in-use]':[inUse],'[data-native-model-use]':[use]};root.nodes['[data-native-model-card]']=[card];
const shotsHost=new Element(),shots=[5,4,6,4].map((duration,i)=>{const e=new Element();e.dataset={nativeShot:'s'+(i+1),duration:String(duration),state:i===3?'failed':i===2?'pending':'done',prompt:'Caller shot '+i,reason:'timed out'};return e;}),track=new Element(),ruler=new Element(),caption=new Element(),playhead=new Element();shotsHost.dataset={position:'3.2',selected:'s1'};shotsHost.nodes={'[data-native-shot]':shots,'.ely-native-shot-track':[track],'[data-native-shot-ruler]':[ruler],'[data-native-shot-caption]':[caption],'[data-native-shot-playhead]':[playhead]};root.nodes['[data-native-shots]']=[shotsHost];
const cleanup=initNativeGenerativeTools(root,(_,detail)=>changes.push(detail),(_,action,detail)=>actions.push({action,...detail}));
assert.equal(voices.querySelector('[data-native-voice-value]').value,'iris');voiceRows[1].querySelector('[data-native-voice-select]').dispatchEvent(event('click'));assert.equal(voices.dataset.selected,'theo');assert.equal(voiceRows[1].querySelector('[data-native-voice-check]').hidden,false);
voiceRows[0].querySelector('[data-native-voice-play]').dispatchEvent(event('click'));assert.deepEqual(actions.at(-1),{action:'caller-sample',value:'iris',voice:'iris'});assert.equal(voices.dataset.selected,'theo');voiceRows[0].querySelector('[data-native-voice-play]').dispatchEvent(event('click'));assert.equal(actions.at(-1).voice,null);
assert.ok(jobButtons[1].hidden&&!jobButtons[0].hidden);root.dispatchEvent(event('ely:download',{detail:{key:'caller',status:'paused',progress:43,content:'Host paused'}}));assert.ok(jobButtons[0].hidden&&!jobButtons[1].hidden);assert.equal(progress.value,43);assert.equal(jobStatus.textContent,'Host paused');root.dispatchEvent(event('ely:download',{detail:{key:'caller',status:'done',progress:101}}));assert.equal(job.dataset.state,'paused','invalid update must be atomic');root.dispatchEvent(event('ely:download',{detail:{key:'caller',status:'done',progress:100}}));assert.ok(progress.hidden&&!jobButtons[4].hidden);
assert.ok(use.hidden);root.dispatchEvent(event('ely:model-use',{detail:{inUse:false}}));assert.ok(!use.hidden&&inUse.hidden);
assert.equal(shots[0].style.width,'120px');assert.equal(shots[2].style.width,'144px');assert.ok(Math.abs(parseFloat(playhead.style.left)-76.8)<1e-9);assert.equal(ruler.children.length,4);shots[3].dispatchEvent(event('click'));assert.equal(shotsHost.dataset.selected,'s4');assert.equal(caption.textContent,'Shot 4 · failed, timed out · Caller shot 3');root.dispatchEvent(event('ely:shots',{detail:{position:0}}));assert.equal(playhead.style.left,'0px');
root.dataset.elyDisabled='true';const before=changes.length;voiceRows[2].querySelector('[data-native-voice-select]').dispatchEvent(event('click'));shots[0].dispatchEvent(event('click'));assert.equal(changes.length,before);cleanup();root.dataset.elyDisabled='false';shots[0].dispatchEvent(event('click'));assert.equal(changes.length,before);
console.log('native generative tools: variables, diffs, projection, sorting/paging, epochs, voice/shot events, host states and cleanup passed');
