// Load after advanced-native-checks.js. Remove its two legacy tooling/rendering
// add(...) calls first: registerChecks deliberately rejects duplicate keys.
import {registerChecks, assert, waitFor} from './advanced-checks.js';
import {mount} from '/assets/ely-api.js';

const need=(root,selector)=>{const node=root.querySelector(selector);assert(node,`Tooling: missing ${selector}`);return node;};
const input=(node,value)=>{if(node.type==='checkbox')node.checked=value;else node.value=String(value);node.dispatchEvent(new Event('input',{bubbles:true}));};
const notify=(root,type,detail={})=>root.dispatchEvent(new CustomEvent(type,{detail}));
const key=(node,value,extra={})=>node.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true,cancelable:true,...extra}));
const pixel=canvas=>Array.from(canvas.getContext('2d').getImageData(0,0,1,1).data).join(',');
const visibleSwitch=node=>{const rail=node.nextElementSibling,style=getComputedStyle(rail),thumb=getComputedStyle(rail,'::after'),rect=rail.getBoundingClientRect();assert(rect.width===32&&rect.height===18,'Switch lost source 32×18 track');assert(style.backgroundColor!=='rgba(0, 0, 0, 0)'&&thumb.backgroundColor!=='rgba(0, 0, 0, 0)'&&style.backgroundColor!==thumb.backgroundColor,'Switch track/thumb are invisible or have identical colors');};
const signature=root=>JSON.stringify({text:root.textContent,fields:[...root.querySelectorAll('input,select,button,output,canvas,[data-tool-token]')].map(el=>[el.value,el.checked,el.hidden,el.disabled,el.getAttribute('aria-selected'),el.getAttribute('aria-valuenow'),el.getAttribute('style'),el.tagName==='CANVAS'?pixel(el):null])});
let callerID=0;
// Exercise caller markup through the real native registration and host mount API.
// No copied initializer, external provider, command execution, or global theme mutation.
async function caller(source,prepare,handlers,check){
 const root=source.cloneNode(true);root.id=`tooling-check-caller-${++callerID}`;delete root.dataset.elyReady;root.dataset.elyDisabled='false';
 for(const el of root.querySelectorAll('[id]'))el.removeAttribute('id');
 prepare(root);document.body.append(root);let cleanup;
 try{cleanup=mount(root,handlers);await waitFor(()=>root.dataset.elyReady==='true');await check(root);}finally{cleanup?.();root.remove();await Promise.resolve();}
}
const inspector=async({root})=>{
 assert(root.textContent.includes("Release builds leave gpui's inspector out."),'Inspector release explanation differs from source');
 assert(!root.querySelector('[data-tool-inspect-toggle]'),'Release fixture fabricated a native inspector trigger');need(root,'[data-tool-inspect-sample]');
 await caller(root,r=>{const scope=need(r,'[data-tool-inspect-scope]'),button=document.createElement('button');button.type='button';button.dataset.toolInspectToggle='';button.textContent='Inspect caller';scope.prepend(button);}, {},async r=>{
  const toggle=need(r,'[data-tool-inspect-toggle]'),panel=need(r,'[data-tool-inspect-panel]'),sample=need(r,'[data-tool-inspect-sample]'),highlight=need(r,'[data-tool-inspect-highlight]');toggle.click();assert(!panel.hidden&&toggle.getAttribute('aria-expanded')==='true','Inspector did not open');
  sample.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:10,clientY:10}));assert(!highlight.hidden&&need(r,'[data-tool-inspect-facts]').children.length===10,'Inspector did not read box geometry');
  sample.click();assert(need(r,'[data-tool-inspect-hint]').textContent.startsWith('Held.'),'Inspector did not hold selection');const pick=need(r,'[data-tool-inspect-release]');assert(!pick.hidden,'Held inspector has no Pick control');pick.click();assert(pick.hidden,'Pick did not resume hover');
  const close=need(r,'[data-tool-inspect-close]');close.focus();key(close,'Tab');assert(panel.contains(document.activeElement),'Inspector Tab left its focus scope');key(close,'Escape');assert(panel.hidden&&highlight.hidden&&document.activeElement===toggle,'Inspector Escape did not hide layers and restore focus');
 });
};
const fps=async({root})=>{
 const measure=need(root,'[data-tool-measure]'),panel=need(root,'[data-tool-fps-panel]');assert(!measure.checked&&panel.hidden,'Source meter must start stopped');visibleSwitch(measure);
 try{measure.click();assert(measure.checked&&!panel.hidden,'Measure did not reveal meter');visibleSwitch(measure);await waitFor(()=>Number(need(root,'[data-tool-fps-value]').textContent)>0);assert(need(root,'[data-tool-fps-bars]').children.length>0,'Measured frames did not produce bars');assert(Number.isFinite(Number(need(root,'[data-tool-fps-worst]').textContent)),'Worst interval is not numeric');}
 finally{if(measure.checked)measure.click();}
 assert(panel.hidden,'Stopping measurement left panel visible');const stopped=panel.textContent;await new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)));assert(panel.textContent===stopped,'Stopped meter continued updating');
};
const counters=({root})=>{
 const page=need(root,'[data-tool-render-count="page"]'),view=need(root,'[data-tool-render-count="view"]'),p=Number(page.textContent),v=Number(view.textContent);need(root,'[data-tool-redraw="view"]').click();assert(Number(view.textContent)===v+1&&Number(page.textContent)===p,'Local redraw changed wrong render counter');notify(root,'ely:render',{key:'page'});assert(Number(page.textContent)===p+1&&Number(view.textContent)===v+1,'Host render notification lost its key');
};
const events=({root})=>{
 const box=need(root,'[data-tool-event-target]'),log=need(root,'[data-tool-event-log]'),rect=box.getBoundingClientRect();
 box.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.left+10,clientY:rect.top+12}));box.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,clientX:rect.left+11,clientY:rect.top+13}));assert(log.firstElementChild.textContent.includes('move to 11, 13 ×2'),'Consecutive moves did not coalesce in local coordinates');
 const field=need(box,'input'),stop=e=>e.stopPropagation();field.addEventListener('keydown',stop);try{key(field,'K',{ctrlKey:true});}finally{field.removeEventListener('keydown',stop);}assert(log.firstElementChild.textContent.includes('key down ctrl+K'),'Capture logger lost child-consumed key');
 box.dispatchEvent(new WheelEvent('wheel',{bubbles:true,deltaX:0,deltaY:4,deltaMode:1}));assert(log.firstElementChild.textContent.includes('wheel 0, 4 lines'),'Wheel units were lost');for(let i=0;i<55;i++)key(field,String(i));assert(log.children.length===50,'Event retention is not bounded at 50');assert(!log.querySelector('[data-tool-event-empty]'),'Empty hint remained after actual input');
};
const tokens=async({root})=>{
 const groups=[...root.querySelectorAll('[data-tool-token-group]')],counts=[36,13,8,16,8,4,3,6,5,3,3,6];assert(groups.length===counts.length&&groups.every((g,i)=>g.children.length===counts[i]),'Token catalogue lost source groups or entries');
 const token=need(root,'[data-tool-token][data-token="--bg"]'),swatch=need(token,'i'),before=swatch.style.backgroundColor,old=root.style.getPropertyValue('--bg'),priority=root.style.getPropertyPriority('--bg');
 try{root.style.setProperty('--bg','#123456');notify(root,'ely:theme');assert(swatch.style.backgroundColor==='rgb(18, 52, 86)'&&need(token,'output').textContent==='#123456','Token viewer ignored instance theme variable');}
 finally{if(old)root.style.setProperty('--bg',old,priority);else root.style.removeProperty('--bg');notify(root,'ely:theme');}
 assert(swatch.style.backgroundColor===before,'Token viewer did not restore inherited palette');
};
const icons=({root,actions})=>{
 const filter=need(root,'[data-tool-icon-filter]'),options=[...root.querySelectorAll('[data-tool-icon-option]')];assert(options.length>100,'Icon catalogue was truncated');input(filter,'arrow left');const visible=options.filter(el=>!el.hidden);assert(visible.length>0&&visible.length<options.length&&visible.every(el=>el.dataset.toolIconOption.replaceAll('-',' ').includes('arrow left')),'Icon filter lost spaced-name matching');filter.focus();key(filter,'ArrowDown');assert(document.activeElement===visible[0],'Search ArrowDown did not enter visible grid');key(visible[0],'End');assert(document.activeElement===visible.at(-1),'Icon End did not focus final filtered option');visible.at(-1).click();assert(visible.at(-1).getAttribute('aria-selected')==='true','Icon selection did not persist');assert(actions.some(a=>a.action==='select-icon'&&a.value===visible.at(-1).dataset.toolIconOption),'Icon selection lost host value');assert(need(root,'[data-tool-icon-name]').textContent.startsWith('IconName::'),'Selected icon omitted source enum name');input(filter,'no-such-tooling-icon');assert(!need(root,'[data-tool-icon-empty]').hidden&&options.every(el=>el.hidden),'Unmatched icon query did not show empty state');
};
const a11y=({root})=>{
 const rows=[...root.querySelectorAll('[data-tool-a11y-row]')],summary=need(root,'[data-tool-a11y-summary]');assert(rows.length===81,'Contrast checker lost source 81 pairs');assert(rows.every(row=>/^(\d+\.\d+:1|Invalid)$/.test(need(row,'[data-tool-a11y-ratio]').textContent)),'Contrast checker did not calculate each row');
 const fg=root.style.getPropertyValue('--fg'),bg=root.style.getPropertyValue('--bg');try{root.style.setProperty('--fg','#ffffff');root.style.setProperty('--bg','#ffffff');notify(root,'ely:theme');const failed=rows.find(row=>row.dataset.frontToken==='--fg'&&row.dataset.backToken==='--bg');assert(failed.dataset.pass==='false'&&need(failed,'[data-tool-a11y-grade]').textContent==='Fail'&&need(failed,'[data-tool-a11y-ratio]').textContent==='1.00:1','Equal foreground/background did not fail contrast');assert(need(root,'[data-tool-a11y-rows]').firstElementChild.dataset.pass==='false'&&summary.textContent.includes('fail'),'Failed pairs were not sorted first');}
 finally{for(const[name,value]of [['--fg',fg],['--bg',bg]])if(value)root.style.setProperty(name,value);else root.style.removeProperty(name);notify(root,'ely:theme');}
};
const capture=async({root})=>{
 assert(need(root,'.ely-tooling-harness code').textContent==='cargo run --example gallery -- --page tooling --capture shots','Screenshot harness lost source command');assert(!root.querySelector('[data-tool-host-action]'),'Source harness fabricated executable command');const pending=[];
 await caller(root,r=>{const host=need(r,'.ely-tooling-harness');host.insertAdjacentHTML('beforeend','<button type="button" data-tool-host-action="caller-capture" data-value="caller-page">Capture</button><output data-tool-host-status></output>');}, {actions:{'caller-capture':detail=>new Promise(resolve=>pending.push({detail,resolve}))}},async r=>{
  const button=need(r,'[data-tool-host-action]'),status=need(r,'[data-tool-host-status]');button.click();assert(pending.length===1&&pending[0].detail.value==='caller-page'&&status.textContent==='Waiting for host','Capture skipped host callback or fabricated success');button.click();assert(pending.length===2,'Second capture did not reach host');pending[1].resolve({message:'Caller captured'});await waitFor(()=>status.textContent==='Caller captured');pending[0].resolve({message:'Stale capture'});await Promise.resolve();await Promise.resolve();assert(status.textContent==='Caller captured','Stale host capture replaced latest result');
 });
};
const gallery=async({root})=>{
 need(root,'[data-native-kind="ComponentGallery"]');assert(!root.querySelector('button,input,select,canvas'),'Descriptive source gallery fabricated operations');
 const links=[...root.querySelectorAll('.ely-tooling-catalog a')],base=new URL('../',import.meta.url);assert(links.length===3,'Caller catalogue fixture was hidden or lost');
 for(const [label,path] of [['Foundation','components/primitives/box-view'],['Media','components/media/imageviewer'],['Tooling','components/tooling/inspectoroverlay']]){const live=new URL(path,base).href,staticURL=new URL(path+'/',base).href;assert(links.some(link=>link.textContent===label&&(link.href===live||link.href===staticURL)),`${label} caller link has the wrong route, origin or base`);}
 links[0].focus();assert(document.activeElement===links[0],'Caller catalogue link is not focusable');
};
const playground=async({root})=>{
 const panels=root.querySelectorAll('[data-tool-playground]');assert(panels.length===2,'Playground lost button or ring specimen');const buttonPanel=need(root,'[data-preview="button"]'),button=need(buttonPanel,'[data-tool-preview-button]');const paint=getComputedStyle(button);assert(paint.backgroundColor!=='rgba(0, 0, 0, 0)'&&paint.color!==paint.backgroundColor,'Primary playground button lost paired foreground/background');visibleSwitch(need(buttonPanel,'[name="disabled"]'));visibleSwitch(need(buttonPanel,'[name="loading"]'));input(need(buttonPanel,'[name="variant"]'),'danger');input(need(buttonPanel,'[name="size"]'),'lg');assert(button.dataset.variant==='danger'&&button.dataset.size==='lg','Choice knobs did not update button');input(need(buttonPanel,'[name="disabled"]'),true);assert(button.disabled,'Disabled knob did not disable preview');input(need(buttonPanel,'[name="disabled"]'),false);input(need(buttonPanel,'[name="loading"]'),true);assert(button.disabled&&button.getAttribute('aria-busy')==='true','Loading knob did not expose busy state');
 const ring=need(root,'[data-preview="ring"]');input(need(ring,'[name="value"]'),.25);assert(need(ring,'[role="progressbar"]').getAttribute('aria-valuenow')==='25'&&need(ring,'output').textContent==='25%','Ring number knob did not update preview');input(need(ring,'[name="percent"]'),false);assert(need(ring,'[role="progressbar"] output').textContent==='','Percent toggle did not hide label');
 const calls=[];await caller(root,r=>{need(r,'[data-preview="button"]').dataset.action='caller-preview';}, {actions:{'caller-preview':detail=>{calls.push(detail);}}},async r=>{input(need(r,'[data-preview="button"] [name="size"]'),'sm');assert(calls.length===1&&calls[0].key==='button'&&calls[0].values.size==='sm'&&calls[0].values.loading===true,'Playground host callback lost typed caller settings');});
};
const surface=async({root})=>{
 const canvas=need(root,'[data-tool-canvas]'),slider=need(root,'[data-tool-source-position]');await waitFor(()=>canvas.width>0&&canvas.height>0);assert(Math.abs(canvas.width/canvas.height-2)<.02,'Render surface lost source aspect ratio');const before=canvas.toDataURL();input(slider,80);assert(canvas.toDataURL()!==before,'Moving source did not redraw contour pixels');const stable=canvas.toDataURL();notify(root,'ely:surface-revision',{revision:'caller-revision'});assert(canvas.toDataURL()===stable,'Unchanged field inputs produced different pixels');
 const calls=[];await caller(root,r=>{const s=need(r,'[data-tool-surface]');s.dataset.field='false';s.dataset.width='16';s.dataset.ratio='2';s.dataset.action='caller-frame';need(r,'[data-tool-source-position]').remove();}, {actions:{'caller-frame':detail=>{calls.push(detail);return undefined;}}},async r=>{
  const c=need(r,'canvas'),status=need(r,'[data-tool-surface-status]');await waitFor(()=>calls.length===1);assert(status.textContent==='Waiting for host frame','Custom surface fabricated a host frame');const request=calls[0];assert(request.width===Math.round(16*devicePixelRatio),'Host status text changed the requested surface width');const pixels=new Uint8ClampedArray(request.width*request.height*4);for(let i=0;i<pixels.length;i+=4)pixels.set([17,34,51,255],i);
  notify(r,'ely:surface-frame',{...request,requestId:request.requestId-1,pixels});assert(pixel(c)==='0,0,0,0','Stale host frame was painted');notify(r,'ely:surface-frame',{...request,width:request.width+1,pixels});assert(status.textContent.includes('invalid')&&pixel(c)==='0,0,0,0','Invalid frame dimensions were accepted');notify(r,'ely:surface-frame',{...request,pixels});assert(pixel(c)==='17,34,51,255'&&status.textContent==='','Valid host RGBA frame was not painted');notify(r,'ely:surface-revision',{revision:'next'});assert(calls.length===2&&calls[1].revision==='next','Host revision did not request a new frame');notify(r,'ely:surface-revision',{revision:'next'});assert(calls.length===2,'Unchanged revision requested duplicate host frame');
 });
};
const isolated=check=>async context=>{const before=signature(context.twin);await check(context);assert(signature(context.twin)===before,'Tooling operation changed sibling output, style, fields, or canvas');};
export const toolingChecks={
 'tooling/InspectorOverlay':isolated(inspector),'tooling/FPSMeter':isolated(fps),'tooling/PerfOverlay':isolated(fps),
 'tooling/RenderCounter':isolated(counters),'tooling/EventLogger':isolated(events),'tooling/DesignTokenViewer':isolated(tokens),
 'tooling/IconBrowser':isolated(icons),'tooling/A11yChecker':isolated(a11y),'tooling/ScreenshotTest Harness':isolated(capture),
 'tooling/ComponentGallery':isolated(gallery),'tooling/Storybook':isolated(gallery),'tooling/PlaygroundPanel':isolated(playground),
 'rendering/RenderSurface':isolated(surface),
};
registerChecks('native',toolingChecks);
