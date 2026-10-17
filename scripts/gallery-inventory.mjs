import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
export const families = ['foundation','interaction','data','workspace','communication','native','forms'];
export function currentRevision() {
  assert.equal(execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim(),'','Browser evidence requires a clean committed source tree');
  return execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
}
export function expectedInventory(mode) {
  assert(['live','static'].includes(mode),'unknown gallery mode');
  const inventory=JSON.parse(execFileSync('go',['run','./cmd/gallery-check-inventory'],{encoding:'utf8',maxBuffer:4*1024*1024}));
  assert.equal(inventory.cases.length,1313);
  assert.equal(inventory.stories.length,624);
  const ordinary=[...inventory.stories,'','components','components/usage','components/themes','components/api','components/demo'];
  const pages=mode==='live'
    ? [...ordinary.map(path=>'/'+path),...['',...families].flatMap(family=>[false,true].map(aliases=>'/components/audit?'+new URLSearchParams({...family&&{family},...aliases&&{aliases:'1'}})))]
    : [...ordinary,...['',...families].flatMap(family=>[false,true].map(aliases=>'components/audit/'+(family?family+'/':'')+(aliases?'aliases/':'')))].map(path=>'/elysdui/go-htmx/'+path);
  return {...inventory,pages};
}
export function pageIdentity(url) {
  const parsed=new URL(url,'http://inventory.local');
  return parsed.pathname.replace(/\/index\.html$/,'/').replace(/\/$/,'')+parsed.search;
}
