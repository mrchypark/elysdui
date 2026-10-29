import assert from 'node:assert/strict';
import {mock} from 'node:test';
import {readFileSync} from 'node:fs';
import {zoomStep,zoomSteps,resizeEdge,moveTab,validShellItems,initNativeShell} from '../../assets/ely-api-native-shell.js';
const nativeCSS=readFileSync(new URL('../../assets/ely-api-native.css',import.meta.url),'utf8');
assert.match(nativeCSS,/\.ely-native-app-mark\{[^}]*background:var\(--surface-sunken,#f5f3f0\);color:inherit;/,'large shell app marks must inherit their theme foreground after setting a sunken surface');
assert.deepEqual(zoomSteps,[50,67,75,80,90,100,110,125,150,175,200]);
assert.equal(zoomStep(67,-1),50);assert.equal(zoomStep(83.125,1),90);assert.equal(zoomStep(83.125,-1),80);assert.equal(zoomStep(200,1),200);assert.equal(zoomStep(50,-1),50);assert.equal(zoomStep(150,0),100);
for(const [point,edge] of [[[0,0],'nw'],[[50,0],'n'],[[99,0],'ne'],[[99,50],'e'],[[99,99],'se'],[[50,99],'s'],[[0,99],'sw'],[[0,50],'w'],[[50,50],''],[[-1,0],'']])assert.equal(resizeEdge(...point,100,100),edge);
assert.equal(resizeEdge(0,0,100,100,0),'');
const items=[{Value:'caller-a',Label:'A'},{Value:'caller-b',Label:'B'},{Value:'caller-c',Label:'C'}];
assert.deepEqual(moveTab(items,0,2).map(x=>x.Value),['caller-b','caller-c','caller-a']);assert.deepEqual(items.map(x=>x.Value),['caller-a','caller-b','caller-c']);assert.deepEqual(moveTab(items,-1,2),items);
assert.equal(validShellItems(items),true);assert.equal(validShellItems([items[0],items[0]]),false);assert.equal(validShellItems([{Value:1,Label:'Do not coerce identity'}]),false);

// Real EventTarget listeners; a small DOM boundary and deterministic clock.
class Element extends EventTarget{
 dataset={};nodes={};attributes={};style={setProperty(k,v){this[k]=v}};textContent='';hidden=false;disabled=false;
 querySelectorAll(s){return this.nodes[s]||[]} querySelector(s){return this.querySelectorAll(s)[0]||null}
 getAttribute(k){return this.attributes[k]??null} setAttribute(k,v){this.attributes[k]=String(v)} hasAttribute(k){return Object.hasOwn(this.attributes,k)} removeAttribute(k){delete this.attributes[k]}
 closest(){return null}
}
const actions=[],changes=[],change=(_r,d)=>changes.push(d),emit=(_r,action,d)=>actions.push({action,...d});
const dispatch=(node,type,detail)=>{const event=new Event(type,{cancelable:true});event.detail=detail;node.dispatchEvent(event)};
const root=new Element(),zoom=new Element(),minus=new Element(),plus=new Element(),reset=new Element(),output=new Element();
zoom.dataset={percent:'83.125',owned:'false',action:'caller-zoom'};minus.dataset.nativeZoom='-1';plus.dataset.nativeZoom='1';reset.dataset.nativeZoom='0';
zoom.nodes={'[data-native-zoom]':[minus,reset,plus]};root.nodes={'[data-shell-zoom]':[zoom],'[data-native-zoom="-1"]':[minus],'[data-native-zoom="1"]':[plus],'[data-native-zoom-value]':[output]};
let cleanup=initNativeShell(root,change,emit);
assert.equal(output.textContent,'83.125%','caller fractional zoom must survive initialization');plus.dispatchEvent(new Event('click'));assert.equal(output.textContent,'90%');assert.deepEqual(actions.at(-1),{action:'caller-zoom',percent:90});
zoom.dataset.owned='true';minus.dispatchEvent(new Event('click'));assert.equal(output.textContent,'90%','owned zoom must await host state');assert.equal(actions.at(-1).percent,80);
dispatch(root,'ely:shell-state',{percent:50});assert.equal(output.textContent,'50%');assert.equal(minus.disabled,true);dispatch(root,'ely:shell-state',{percent:Infinity});assert.equal(output.textContent,'50%');cleanup();dispatch(root,'ely:shell-state',{percent:100});assert.equal(output.textContent,'50%','cleanup must unsubscribe host state');

mock.timers.enable({apis:['setTimeout']});
const networkRoot=new Element(),connectivity=new Element(),pill=new Element(),status=new Element(),glyph=new Element();
connectivity.dataset.state='online';pill.nodes={'[data-native-icon]':[glyph]};networkRoot.nodes={'[data-shell-connectivity]':[connectivity],'.ely-native-connectivity':[pill],'[data-shell-connectivity-text]':[status]};
cleanup=initNativeShell(networkRoot,change,emit);assert.equal(pill.hidden,true);
dispatch(networkRoot,'ely:shell-state',{connectivity:'offline'});assert.equal(status.textContent,'Offline · changes stay on this device');assert.equal(pill.hidden,false);
dispatch(networkRoot,'ely:shell-state',{connectivity:'online'});assert.equal(status.textContent,'Back online');mock.timers.tick(2399);assert.equal(pill.hidden,false);mock.timers.tick(1);assert.equal(pill.hidden,true);
dispatch(networkRoot,'ely:shell-state',{connectivity:'offline'});dispatch(networkRoot,'ely:shell-state',{connectivity:'online'});dispatch(networkRoot,'ely:shell-state',{connectivity:'reconnecting'});mock.timers.tick(3000);assert.equal(pill.hidden,false,'old online timer must not hide reconnecting');assert.equal(glyph.dataset.nativeIcon,'wifi');
dispatch(networkRoot,'ely:shell-state',{connectivity:'online'});cleanup();mock.timers.tick(3000);assert.equal(pill.hidden,false,'cleanup must cancel transition timer');mock.timers.reset();

const hostRoot=new Element(),tray=new Element(),toggle=new Element(),pick=new Element(),last=new Element(),dock=new Element(),dockStatus=new Element(),badge=new Element(),progress=new Element();
tray.dataset={shown:'false',symbol:'caller.symbol'};toggle.dataset.action='caller-tray';toggle.attributes['data-shell-tray-toggle']='';toggle.closest=()=>toggle;
dock.dataset.value='';badge.dataset={action:'caller-badge',shellBadge:'99+'};badge.attributes['data-shell-badge']='99+';badge.closest=()=>badge;
hostRoot.nodes={'[data-shell-tray]':[tray],'[data-shell-tray-toggle]':[toggle],'[data-shell-tray-pick]':[pick],'[data-shell-last-pick]':[last],'[data-shell-dock]':[dock],'[data-shell-dock-status]':[dockStatus],'[data-shell-progress]':[progress]};
cleanup=initNativeShell(hostRoot,change,emit);
const click=target=>{const event=new Event('click');Object.defineProperty(event,'target',{value:target});hostRoot.dispatchEvent(event)};
click(toggle);assert.equal(tray.dataset.shown,'false');assert.equal(actions.at(-1).shown,true);assert.equal(actions.at(-1).symbol,'caller.symbol');
click(badge);assert.equal(dock.dataset.value,'');assert.deepEqual(actions.at(-1),{action:'caller-badge',badge:'99+'});
dispatch(hostRoot,'ely:shell-state',{shown:true,lastPick:'Caller item',badge:'0',progress:0});assert.equal(pick.disabled,false);assert.equal(last.textContent,'Caller item');assert.equal(dockStatus.textContent,'The Dock shows “0”.');assert.equal(progress.value,0);
progress.attributes.value='0';dispatch(hostRoot,'ely:shell-state',{progress:null});assert.equal(progress.hasAttribute('value'),false);cleanup();
console.log('Native shell: source zoom steps, resize edges, stable tab identities, owned/host state, connectivity lifecycle, and cleanup passed.');
