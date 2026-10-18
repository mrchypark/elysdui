import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
const source=readFileSync(new URL('../../../../internal/gallery/assets/advanced-forms-checks.js',import.meta.url),'utf8');
const code=source.slice(source.indexOf('export function checkAccountSourceLayout'),source.indexOf('// Geometry must be measured')).replace('export ','');
const check=runInNewContext(code+';checkAccountSourceLayout',{assert:(ok,message)=>assert.ok(ok,message)});
const node=(left,top,width,height)=>({getBoundingClientRect:()=>({left,top,width,height,right:left+width,bottom:top+height})});
const avatar=node(20,20,40,40),identity=node(72,20,228,40),name=node(72,20,90,20);name.textContent='Ada Lovelace';identity.querySelector=()=>name;
const card=node(0,0,320,240);card.querySelector=s=>s.includes('avatar')?avatar:identity;
const provider=node(20,20,338,100),button=node(20,20,338,28);provider.querySelectorAll=()=>[button];
const members=node(0,0,640,190),invitations=node(0,214,640,220);
const workspace=node(0,0,260,56),account=node(0,64,260,56),user=node(284,0,28,28);
const bills=node(0,0,400,252),prompt=node(424,0,360,134),wall=node(424,150,360,222);
const group=node(0,0,784,372),items={TeamMemberTable:members,InvitationList:invitations,WorkspaceSwitcher:workspace,AccountSwitcher:account,UserMenu:user,BillingHistory:bills,UpgradePrompt:prompt,Paywall:wall};
group.querySelector=s=>items[s.match(/account\/(\w+)/)?.[1]];
const scope={querySelectorAll:s=>s==='.ely-api-profile-card'?[card]:s==='.ely-suite-providers'?[provider]:s==='.component-examples'?[group]:[]};
check(scope);
// Feed the reported bad rectangles to the same checker the browser runs.
for(const [target,bad,message] of [
 [identity,node(20,76,40,120),'Profile identity'],
 [name,node(72,20,35,60),'Profile name'],
 [button,node(20,20,158,28),'OAuth button'],
 [invitations,node(400,0,640,220),'Invitations'],
 [account,node(400,0,260,56),'Account must'],
 [wall,node(0,276,360,222),'Paywall must align']
]){const original=target.getBoundingClientRect;target.getBoundingClientRect=bad.getBoundingClientRect;assert.throws(()=>check(scope),new RegExp(message));target.getBoundingClientRect=original;}
console.log('Account layout regression: valid geometry accepted; six reported bad rectangles rejected. Browser geometry still requires parent audit.');
