import assert from 'node:assert/strict';
import {goBackTo} from '../browser/static-page-history.mjs';

const from='http://local/elysdui/go-htmx/';
const target='http://local/elysdui/';
const calls=[];
let url=from, settleNavigation;
const page={
 url:()=>url,
 waitForURL:async(expected,options)=>{
  calls.push(['waitForURL',expected,options.waitUntil]);
  await new Promise((resolve,reject)=>{settleNavigation=()=>url===expected?resolve():reject(new Error(`unexpected URL ${url}`));});
 },
 goBack:async(options)=>{
  calls.push(['goBack',options.waitUntil]);
  url=target;settleNavigation();
 },
};
await goBackTo(page,target,'gallery-to-hub');
assert.deepEqual(calls,[['waitForURL',target,'domcontentloaded'],['goBack','domcontentloaded']]);
assert.equal(url,target);

url=from;settleNavigation=undefined;
page.goBack=async()=>{url='http://local/elsewhere/';settleNavigation();};
await assert.rejects(goBackTo(page,target,'gallery-to-hub'),error=>{
 assert.match(error.message,/Back from http:\/\/local\/elysdui\/go-htmx\//);
 assert.match(error.message,/did not reach http:\/\/local\/elysdui\//);
 assert.match(error.message,/current URL is http:\/\/local\/elsewhere\//);
 assert.match(error.cause.message,/unexpected URL/);
 return true;
});
console.log('Static history helper waits for the expected Back destination and reports mismatches.');
