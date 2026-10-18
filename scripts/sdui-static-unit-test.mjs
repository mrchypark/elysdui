import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
const code = await readFile(new URL('../internal/playground/web/static-provider.js',import.meta.url),'utf8');
const requests=[];
const assets={
  'catalogue.json':[{name:'text',family:'core',file:'contracts/0000.json'},{name:'forms/Switch',family:'forms',file:'contracts/0001.json'}],
  'contracts/0000.json':{name:'text',properties:{text:{type:'string'}}},
  'examples.json':[{id:'basic'}],
};
class Worker {
  constructor(url){requests.push(String(url));queueMicrotask(()=>this.onmessage({data:{ready:true}}));}
  postMessage(data){assert.equal(data.body,'{"screen":{"number":9007199254740993}}');queueMicrotask(()=>this.onmessage({data:{id:data.id,value:{html:'real bridge placeholder'}}}));}
  terminate(){}
}
const context=vm.createContext({URL,Promise,Map,Error,DOMException,Worker,WebAssembly,queueMicrotask,setTimeout,clearTimeout,
 document:{currentScript:{src:'https://example.org/elysdui/playground/static-provider.js'},getElementById:()=>({})},
 location:{origin:'https://example.org'},fetch:async url=>{requests.push(String(url));const key=String(url).split('/playground/')[1];return{ok:Object.hasOwn(assets,key),status:404,json:async()=>assets[key]};}});
vm.runInContext(code,context);
const api=context.elyStaticAPI;
assert.equal((await api('/api/catalogue?q=TEXT')).items[0].name,'text');
assert.equal((await api('/api/component?name=text')).name,'text');
assert.equal((await api('/api/examples'))[0].id,'basic');
assert(!requests.some(url=>url.endsWith('renderer-worker.js')),'names and contracts must not load renderer');
await assert.rejects(api('/api/component?name=unknown'),/Unknown component/);
await assert.rejects(api('/api/catalogue?q='+('x'.repeat(193))),/too long/);
await assert.rejects(api('/api/other'),/Unsupported/);
const controller=new AbortController();controller.abort();await assert.rejects(api('/api/catalogue',{signal:controller.signal}),{name:'AbortError'});
assert.equal((await api('/api/preview',{body:'{"screen":{"number":9007199254740993}}'})).html,'real bridge placeholder');
assert(requests.every(url=>url.startsWith('https://example.org/elysdui/playground/')),'all asset URLs preserve project subpath');
assert(!requests.some(url=>url.includes('/api/')),'no backend API network calls');
console.log('Static provider checks passed: lazy worker/contracts, subpaths, bounded search, raw JSON precision, cancellation, and no backend calls.');
