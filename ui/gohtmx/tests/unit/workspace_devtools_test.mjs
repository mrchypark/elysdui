import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../../assets/ely-api-workspace-devtools.js',import.meta.url),'utf8');
const pure=source.slice(0,source.indexOf('export function mountDevtools')).replace(/^import .*\n/gm,'').replace(/export /g,'');
const rules=vm.runInNewContext(pure+';({connectionReady,requestAddress,resolveVariables,glob,moveCollection,encodeText,contrastRatio,jsonPath,documentNodes})',{structuredClone,TextEncoder,TextDecoder,btoa,atob});
const plain=x=>JSON.parse(JSON.stringify(x));
const {connectionReady,requestAddress,resolveVariables,glob,moveCollection,encodeText,contrastRatio,jsonPath,documentNodes}=rules;
assert(connectionReady({name:'Shop',engine:'PostgreSQL',host:'localhost',port:5432}));
for(const port of [0,65536,'http','2.5','1e3'])assert(!connectionReady({name:'Shop',engine:'PostgreSQL',host:'localhost',port}));
assert(connectionReady({name:'Notes',engine:'SQLite',database:'~/notes.db'}));assert(!connectionReady({name:' ',engine:'SQLite',database:'x'}));
assert.equal(requestAddress({url:'https://{{host}}/items',params:[{key:' q ',value:"red shoes!*"},{key:' ',value:'ignored'}]}),'https://{{host}}/items?q=red%20shoes%21%2A');
assert.deepEqual(plain(resolveVariables('{{ a }} {{missing}} {{open',[{key:'a',value:'value'}])),{text:'value {{missing}} {{open',missing:['missing']});
for(const [pattern,key,want] of [['user:*','user:42',true],['user:?','user:42',false],['?','界',true],['a*b*c','axbyc',true],['a*b','axby',false],['','',true],['*','',true],['foo','FOO',false]])assert.equal(glob(pattern,key),want);
const collection=[{key:'folder',items:[{key:'a'},{key:'b'}]},{key:'other',items:[]}];
const moved=moveCollection(collection,'a','other');assert.equal(moved[1].items[0].key,'a');assert.equal(collection[0].items.length,2);assert.equal(moveCollection(collection,'folder','a'),null);assert.equal(moveCollection(collection,'a','b'),null);assert.equal(moveCollection(collection,'gone','other'),null);assert.deepEqual(plain(moveCollection(collection,'a','b','after'))[0].items.map(x=>x.key),['b','a']);
for(const mode of ['Base64','URL','Hex']){const text='Hello, 世界';assert.equal(encodeText(encodeText(text,mode),mode,true),text);}
assert.equal(encodeText('a+b%20c','URL',true),'a b c');for(const input of ['a','a===','====','aGk=x'])assert.throws(()=>encodeText(input,'Base64',true));assert.throws(()=>encodeText('ff','Hex',true));assert.throws(()=>encodeText('%G1','URL',true));
assert.equal(contrastRatio('#000000','#ffffff'),21);assert.equal(contrastRatio('#00000000','#ffffff'),1);assert(Math.abs(contrastRatio('#6b6b6b','#f4efe6')-4.65)<.01);
assert.equal(jsonPath('$','a.b'),'$["a.b"]');assert.equal(jsonPath('$','a"b'),'$["a\\"b"]');const tree=documentNodes({customer:{name:'Ada'},items:[1,2]},'ada');assert.equal(tree.items.length,1);assert.equal(tree.items[0].items[0].key,'$.customer.name');
let result;const worker=readFileSync(new URL('../../assets/ely-api-workspace-regex-worker.js',import.meta.url),'utf8');const context={TextEncoder,self:{postMessage:r=>result=r}};vm.runInNewContext(worker,context);
context.self.onmessage({data:{pattern:'(?P<user>[\\w.]+)@(?P<host>[\\w.]+)',flags:'',text:'Ada ada@example.com'}});assert.equal(result.matches[0].groups.user,'ada');assert.equal(result.matches[0].start,4);
context.self.onmessage({data:{pattern:'a',flags:'i',text:'Aa'}});assert.equal(result.matches.length,2);
context.self.onmessage({data:{pattern:'a # ignored\n b',flags:'x',text:'ab'}});assert.equal(result.matches[0].text,'ab');
context.self.onmessage({data:{pattern:'.',flags:'',text:'界a'}});assert.equal(result.matches[0].end,3);assert.equal(result.matches[1].start,3);
context.self.onmessage({data:{pattern:'[',flags:'',text:'x'}});assert(result.error);
console.log('workspace devtools connection, URL, glob, collection, codec, contrast, document and regex rules passed');
assert.equal(documentNodes({customer:{name:'Ada',email:'ada@example.com'}},'customer').items[0].items.length,2,'a matching parent retains its full subtree');
assert(!/\bfetch\s*\(|new\s+(?:WebSocket|XMLHttpRequest)\s*\(/.test(source),'devtools must not perform provider calls');
// Run the production SchemaTree initializer with the real gallery model. The SVG
// sink records output; no browser or database service is needed for these paths.
const fixtureSource=readFileSync(new URL('../../../../internal/gallery/advanced_workspace_devtools.go',import.meta.url),'utf8');
const schemaFixture=JSON.parse(fixtureSource.match(/"SchemaTree":\s*`([^`]+)`/)[1]);
const schemaStart=source.indexOf(' function schema(){'),schemaEnd=source.indexOf('\n function ',schemaStart+1);
assert(schemaStart>=0&&schemaEnd>schemaStart);
const schemaCode=source.slice(schemaStart,schemaEnd)+'\nschema();';
function renderSchema(model){
  const output=[];
  const element=(tag,attrs={})=>({tag,attrs,children:[],append(...nodes){this.children.push(...nodes);},replaceChildren(...nodes){this.children=nodes;}});
  vm.runInNewContext(schemaCode,{state:structuredClone(model),disabled:false,el:element,panel:element,
    svg:(tag,attrs)=>{const node=element(tag,attrs);output.push(node);return node;},
    ui:element('ui'),tree:()=>element('tree'),on(){},change(){},say(){},clone:structuredClone});
  return output;
}
const schemaOutput=renderSchema(schemaFixture);
assert.equal(schemaOutput.filter(n=>'data-dt-table-node' in n.attrs).length,4,'All source tables initialize');
const relations=schemaOutput.filter(n=>'data-dt-relation' in n.attrs);
assert.equal(relations.length,2,'Foreign keys resolve against ordinary primary-key fields');
assert.equal(relations[0].attrs.d,'M500 94 C560 94 520 106 580 106');
for(const reference of [{table:'absent',field:'id'},{table:'users',field:'absent'}]){
  const model=structuredClone(schemaFixture);
  model.schemas[0].tables[1].fields[1].ref=reference;
  const output=renderSchema(model);
  assert.equal(output.filter(n=>'data-dt-table-node' in n.attrs).length,4);
  assert.equal(output.filter(n=>'data-dt-relation' in n.attrs).length,1,'Unresolved reference skips only that edge');
}
console.log('SchemaTree production initialization: four tables, two foreign keys, missing reference targets passed');
const regexFixture=JSON.parse(fixtureSource.match(/"RegexTester":\s*`([^`]+)`/)[1]);
context.self.onmessage({data:{flags:'',...regexFixture}});
assert.equal(result.matches.length,2,'Actual gallery sample has two matches');
assert.equal(result.matches[0].groups.user,'ada');
// Execute the actual evaluation lifecycle with controlled worker/timer boundaries.
const evaluateStart=source.indexOf('  const evaluate=()=>'),evaluateEnd=source.indexOf(';evaluate();',evaluateStart);
assert(evaluateStart>=0&&evaluateEnd>evaluateStart);
const evaluateCode=source.slice(evaluateStart,evaluateEnd).replace('import.meta.url',"'https://example.test/assets/ely-api-workspace-devtools.js'");
function regexInstance(){
  const workers=[],timers=new Map();let nextTimer=0;
  class Worker {constructor(){workers.push(this);}terminate(){this.terminated=true;}postMessage(value){this.request=value;}}
  const sink=()=>({children:[],textContent:'',append(...nodes){this.children.push(...nodes);},replaceChildren(){this.children=[];}});
  const matches=sink(),highlight=sink();
  const evaluate=vm.runInNewContext('let worker,timer;'+evaluateCode+';evaluate',{
    Worker,URL,pattern:{value:regexFixture.pattern},sample:{value:regexFixture.text},flags:'',matches,highlight,
    document:{createTextNode:value=>value},el:(_tag,_attrs,text)=>Object.assign(sink(),{textContent:text}),
    setTimeout:(fn,ms)=>{const id=++nextTimer;timers.set(id,{fn,ms});return id;},clearTimeout:id=>timers.delete(id)});
  return {evaluate,workers,timers,matches};
}
const first=regexInstance(),second=regexInstance();first.evaluate();second.evaluate();
assert.equal([...first.timers.values()][0].ms,5000,'Startup has its own bounded timeout');
assert.equal(first.workers[0].request,undefined,'Do not run until worker is ready');
first.workers[0].onmessage({data:{ready:true}});
assert.equal([...first.timers.values()][0].ms,250,'Execution limit begins after readiness');
assert.deepEqual(plain(first.workers[0].request),{pattern:regexFixture.pattern,flags:'',text:regexFixture.text});
first.evaluate();first.workers[0].onmessage({data:{error:'obsolete'}});
assert.equal(first.matches.textContent,'Evaluating…','Stale worker cannot overwrite a new evaluation');
first.workers[1].onmessage({data:{ready:true}});first.workers[1].onmessage({data:result});
assert.equal(first.matches.children[0].textContent,'2 matches');assert.equal(first.timers.size,0);
assert.equal(second.matches.textContent,'Evaluating…','A second instance remains independent');
second.workers[0].onmessage({data:{ready:true}});[...second.timers.values()][0].fn();
assert.equal(second.matches.textContent,'Pattern exceeded the 250 ms limit');
assert(second.workers[0].terminated);
console.log('Regex worker lifecycle: ready handshake, execution limit, stale replies and instance isolation passed');
