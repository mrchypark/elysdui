import assert from 'node:assert/strict';
import {test} from 'node:test';
import {transform,staticCoverageManifest,registrationInventory,resolveCaseActionSites,actionModuleNames,prepareActionModule,synchronousTrace,compareActionTrace,synchronousTraceInit,registeredOutcomesEqual,registeredOutcomeDifferences,firstDifference,traceContractStatus} from './visual-state-audit-instrument.mjs';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from 'playwright';
import {compileFunction} from 'node:vm';
import {parse} from 'acorn';
import {caseActionContract,requestedStateContract,runRequestedStateActions,runRegisteredCanvasActions,assertRegisteredCanvasTransition,clickVisibleControl,ownedOverlayInventory,captureTargetPNG,inventoryReceipt,inventoryDrift,unhandledBrowserErrors} from './visual-state-audit-drivers.mjs';

test('basic menu placement pure: non-origin bottom right and above collisions',async()=>{
  const source=await readFile(new URL('../../assets/ely-patterns.js',import.meta.url),'utf8');
  const body=source.slice(source.indexOf('  const menuPosition ='),source.indexOf('  const positionMenu ='));
  const position=compileFunction(`${body};return menuPosition;`)();
  const viewport={width:390,height:844},box={width:192,height:74};
  assert.deepEqual(position({left:16,top:424,bottom:452},box,viewport),{left:16,top:458});
  assert.deepEqual(position({left:350,top:800,bottom:828},box,viewport),{left:190,top:720});
  assert.deepEqual(position({left:-20,top:2,bottom:30},box,viewport),{left:8,top:36});
  assert.deepEqual(position({left:100,top:300,bottom:328},{width:192,height:828},viewport),{left:100,top:8});
});

test('basic menu placement pure: beforetoggle precedes focus and shared listeners do not retain roots',async()=>{
  const source=await readFile(new URL('../../assets/ely-patterns.js',import.meta.url),'utf8');
  const events=[],listeners=new Map(),windowListeners=new Map();
  const roots=[0,1].map(index=>{
    const values=new Map([['display',['inline-flex','']],['visibility',['visible','important']]]);
    const style={setProperty:(name,value,priority='')=>values.set(name,[value,priority]),getPropertyValue:name=>values.get(name)?.[0]||'',getPropertyPriority:name=>values.get(name)?.[1]||'',removeProperty:name=>values.delete(name)};
    const popup={style,offsetWidth:192,offsetHeight:74,open:false,matches(){return this.open;},handlers:new Map(),addEventListener(type,fn){this.handlers.set(type,fn);},querySelectorAll:()=>[{focus:()=>events.push({focus:index,left:style.left,top:style.top})}],hidePopover(){this.open=false;},parentElement:null};
    const trigger={rect:{left:16+index*200,top:424,bottom:452},getBoundingClientRect(){return this.rect;},setAttribute(){},focus:()=>events.push({triggerFocus:index})};
    const root={dataset:{},popup,trigger,querySelector:selector=>selector==='[popover]'?popup:trigger};popup.parentElement=root;return root;
  });
  const document={documentElement:{clientWidth:390,clientHeight:844},querySelectorAll:selector=>selector==='[data-ui-component="menu"]'?roots:selector.includes(':popover-open')?roots.filter(root=>root.popup.open).map(root=>root.popup):[],addEventListener:(type,fn)=>listeners.set(type,fn)};
  const window={addEventListener:(type,fn,capture)=>{assert(!windowListeners.has(type),'Exactly one shared listener per event');windowListeners.set(type,{fn,capture});}};
  compileFunction(source,['document','window'])(document,window);
  listeners.get('htmx:after:swap')();
  assert.equal(windowListeners.size,2);assert.equal(windowListeners.get('scroll').capture,true);
  for(const root of roots){
    root.popup.handlers.get('beforetoggle')({newState:'open'});
    assert.equal(events.length,0,'Opening placement must not focus anything');
    assert.equal(root.popup.style.top,'458px');
    assert.equal(root.popup.style.getPropertyValue('display'),'inline-flex');assert.equal(root.popup.style.getPropertyPriority('visibility'),'important');
    root.popup.open=true;
  }
  roots[0].popup.handlers.get('toggle')({newState:'open'});
  assert.deepEqual(events,[{focus:0,left:'16px',top:'458px'}]);
  events.length=0;roots[0].trigger.rect={left:40,top:100,bottom:128};
  windowListeners.get('scroll').fn();assert.equal(roots[0].popup.style.top,'134px');assert.equal(roots[1].popup.style.left,'190px');assert.deepEqual(events,[]);
  document.documentElement.clientWidth=360;windowListeners.get('resize').fn();assert.equal(roots[1].popup.style.left,'160px');assert.deepEqual(events,[]);
  roots[0].popup.open=false;roots[0].trigger.rect={left:70,top:200,bottom:228};windowListeners.get('scroll').fn();assert.equal(roots[0].popup.style.top,'134px','Closed menus are not repositioned');
  roots[0].trigger.getBoundingClientRect=()=>{throw new Error('measurement failed');};
  assert.throws(()=>roots[0].popup.handlers.get('beforetoggle')({newState:'open'}),/measurement failed/);
  assert.equal(roots[0].popup.style.getPropertyValue('display'),'inline-flex');assert.equal(roots[0].popup.style.getPropertyValue('visibility'),'visible');assert.equal(roots[0].popup.style.getPropertyPriority('visibility'),'important');
  roots.splice(0);windowListeners.get('resize').fn();assert.deepEqual(events,[],'No removed-root registry remains');
});

test('basic menu placement pure: actual keyboard handler transitions skip disabled items',async()=>{
  const source=await readFile(new URL('../../assets/ely-patterns.js',import.meta.url),'utf8'),nodes=[];
  const visit=node=>{if(!node||typeof node!=='object')return;if(node.type)nodes.push(node);for(const child of Object.values(node))if(Array.isArray(child))child.forEach(visit);else if(child&&typeof child==='object')visit(child);};
  visit(parse(source,{ecmaVersion:'latest',sourceType:'script'}));
  const declarations=nodes.filter(node=>node.type==='VariableDeclarator'&&node.id.name==='items');
  const handlers=nodes.filter(node=>node.type==='CallExpression'&&node.callee.type==='MemberExpression'&&node.callee.object.name==='popup'&&node.callee.property.name==='addEventListener'&&node.arguments[0]?.value==='keydown');
  assert.equal(declarations.length,1);assert.equal(handlers.length,1);
  const declaration=`const ${source.slice(declarations[0].start,declarations[0].end)};`,callback=source.slice(handlers[0].arguments[1].start,handlers[0].arguments[1].end);
  const run=(itemsSource,handlerSource)=>{
    const document={activeElement:null},focus=[];
    const items=['first','disabled','last'].map((name,index)=>({name,disabled:index===1,focus(){if(!this.disabled){document.activeElement=this;focus.push(name);}}}));
    document.activeElement=items[0];
    const handler=compileFunction(`${itemsSource};return (${handlerSource});`,['popup','document'])({querySelectorAll:()=>items},document);
    for(const [key,expected]of [['ArrowDown',items[2]],['ArrowUp',items[0]]]){
      let prevented=false;handler({key,preventDefault(){prevented=true;}});
      assert(prevented);assert.equal(document.activeElement,expected,'Navigation must make the actual first/last focus transition');
    }
    assert.deepEqual(focus,['last','first']);
  };
  run(declaration,callback);
  const unfiltered=declaration.replace('.filter(item => !item.disabled)','');assert.notEqual(unfiltered,declaration);
  assert.throws(()=>run(unfiltered,callback),'Dropping disabled filtering cannot pass by keeping old focus');
  assert.throws(()=>run(declaration,'()=>{}'),'A no-op keyboard handler cannot pass a one-item wrap');
});

test('basic menu positioning browser: native opening precedes focus and follows nested scroll without isolation',async()=>{
  const names=['ely-patterns.js','ely-patterns.css','app.css'];
  const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
  const sources=Object.fromEntries(await Promise.all(names.map(async name=>[name,await readFile(new URL('../../assets/'+name,import.meta.url),'utf8')])));
  const sourceHashes=Object.fromEntries(names.map(name=>[name,hash(sources[name])]));
  const parent=process.env.BASIC_MENU_OUTPUT_DIR||new URL('../../../../test-results/basic-menu-placement/',import.meta.url).pathname;
  await mkdir(parent,{recursive:true});const output=await mkdtemp(join(parent,'run-'));
  const receipt={kind:'controlled-native-browser-regression-not-gallery-render-proof',sourceHashes,cases:[],browserClosed:false,status:'running'};
  let browser;
  try{
    browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
    for(const width of [1440,390])for(const theme of ['light','dark'])for(const old of [false,true]){
      const context=await browser.newContext({viewport:{width,height:1000},colorScheme:theme}),page=await context.newPage();page.setDefaultTimeout(10000);
      try{
        const instance=id=>`<div class="ui-menu" data-ui-component="menu" id="${id}"><button type="button" popovertarget="${id}-popup" data-ui-menu-trigger aria-expanded="false" aria-controls="${id}-popup">Caller menu</button><div class="ui-menu-panel" id="${id}-popup" popover role="menu" aria-label="Caller menu"><a role="menuitem" href="#caller-first">Caller first link</a><button role="menuitem" disabled>Disabled</button><a role="menuitem" href="#caller-last">Caller last link</a></div></div>`;
        const scoped='[data-ui-component="menu"]>.ui-menu-panel';
        const css=old?sources['ely-patterns.css'].split('\n').filter(line=>!line.startsWith(scoped)).join('\n'):sources['ely-patterns.css'];
        const js=old?sources['ely-patterns.js'].replace("if (event.newState === 'open') positionMenu(popup, trigger);","if (event.newState === 'open') void 0;"):sources['ely-patterns.js'];
        if(old){assert.notEqual(css,sources['ely-patterns.css']);assert.notEqual(js,sources['ely-patterns.js']);}
        await page.setContent(`<!doctype html><html data-theme="${theme}"><head><style>${sources['app.css']}\n${css}\nbody{margin:0}.scrollhost{height:700px;overflow:auto;margin-top:32px}.spacer{height:160px}.menus{margin-left:32px}.tail{height:1600px}</style></head><body><div class="scrollhost"><div class="spacer"></div><div class="menus">${instance('main')}${instance('twin')}</div><div class="tail"></div></div></body></html>`);
        await page.addScriptTag({content:js});
        const root=page.locator('#main'),trigger=root.locator('[data-ui-menu-trigger]'),popup=root.locator('[popover]');
        const twin=await page.locator('#twin').evaluate(node=>node.outerHTML);
        await page.evaluate(()=>{window.menuFocus=[];window.menuSelect=[];document.addEventListener('focusin',e=>{if(e.target.closest('#main-popup')){const r=document.getElementById('main-popup').getBoundingClientRect();menuFocus.push({left:r.left,top:r.top});}});document.getElementById('main').addEventListener('ui:select',e=>menuSelect.push({trusted:e.isTrusted,detail:e.detail}));});
        await trigger.click();await page.waitForFunction(()=>document.getElementById('main-popup').matches(':popover-open'));
        const geometry=()=>root.evaluate(node=>{const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};return {trigger:rect(node.querySelector('[data-ui-menu-trigger]')),panel:rect(node.querySelector('[popover]')),viewport:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight},active:document.activeElement.closest('[role=menuitem]')!==null};});
        const check=g=>{const left=Math.max(8,Math.min(g.trigger.left,g.viewport.width-g.panel.width-8)),below=g.trigger.bottom+6,above=g.trigger.top-g.panel.height-6;const top=Math.max(8,Math.min(below+g.panel.height>g.viewport.height-8?above:below,g.viewport.height-g.panel.height-8));assert(Math.abs(g.panel.left-left)<=1);assert(Math.abs(g.panel.top-top)<=1);assert(g.panel.top>=8&&g.panel.left>=8);assert(g.panel.left+g.panel.width<=g.viewport.width-7);};
        const initial=await geometry();const row={width,theme,negativeControl:old,initial,captures:[]};receipt.cases.push(row);
        if(old){assert.equal(initial.panel.left,0);assert.equal(initial.panel.top,0);assert.throws(()=>check(initial),'Old source must fail actual adjacency');continue;}
        check(initial);
        const focus=await page.evaluate(()=>menuFocus);assert(focus.length);for(const f of focus){assert(Math.abs(f.left-initial.panel.left)<=1&&Math.abs(f.top-initial.panel.top)<=1,'First item cannot focus at stale origin');}
        const capture=async label=>{const path=join(output,`${width}-${theme}-${label}.png`);const png=await page.screenshot({path,caret:'initial',animations:'disabled'});row.captures.push({label,path,sha256:hash(png),geometry:await geometry()});};
        await capture('opened');
        await page.evaluate(()=>{window.menuActive=document.activeElement;document.querySelector('.scrollhost').scrollTop=80;});
        await page.waitForFunction(()=>Math.abs(document.getElementById('main-popup').getBoundingClientRect().top-document.querySelector('#main [data-ui-menu-trigger]').getBoundingClientRect().bottom-6)<1);
        check(await geometry());assert(await page.evaluate(()=>document.activeElement===menuActive));
        await page.setViewportSize({width:width===390?360:1000,height:900});check(await geometry());assert(await page.evaluate(()=>document.activeElement===menuActive));
        await root.evaluate(node=>{Object.assign(node.style,{position:'fixed',right:'8px',bottom:'8px'});window.dispatchEvent(new Event('resize'));});
        const edge=await geometry();check(edge);assert(edge.panel.bottom<=edge.trigger.top-5,'Bottom edge flips above');assert(await page.evaluate(()=>document.activeElement===menuActive));await capture('edge');
        await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('main-popup').matches(':popover-open'));
        await trigger.click();await page.waitForFunction(()=>document.getElementById('main-popup').matches(':popover-open'));await page.mouse.click(4,4);
        await page.waitForFunction(()=>!document.getElementById('main-popup').matches(':popover-open')&&document.activeElement===document.querySelector('#main [data-ui-menu-trigger]'));
        const focusCursor=await page.evaluate(()=>menuFocus.length);
        await page.keyboard.press('Enter');
        await page.waitForFunction(()=>document.getElementById('main-popup').matches(':popover-open')&&document.activeElement===document.querySelector('#main-popup [href="#caller-first"]'));
        const reopened=await geometry();check(reopened);
        const reopenedFocus=await page.evaluate(cursor=>menuFocus.slice(cursor),focusCursor);assert(reopenedFocus.length,'Keyboard reopen requires a fresh first-item focus observation');
        for(const f of reopenedFocus)assert(Math.abs(f.left-reopened.panel.left)<=1&&Math.abs(f.top-reopened.panel.top)<=1,'Keyboard first focus must already be anchored');
        row.keyboardReopen={geometry:reopened,focus:reopenedFocus};
        await page.keyboard.press('ArrowDown');assert(await popup.locator('[href="#caller-last"]').evaluate(node=>node===document.activeElement),'ArrowDown must skip disabled and move first to last');
        await page.keyboard.press('ArrowUp');assert(await popup.locator('[href="#caller-first"]').evaluate(node=>node===document.activeElement),'ArrowUp must skip disabled and move last to first');
        await page.keyboard.press('Enter');
        await page.waitForFunction(()=>!document.getElementById('main-popup').matches(':popover-open')&&document.activeElement===document.querySelector('#main [data-ui-menu-trigger]'));assert.deepEqual(await page.evaluate(()=>menuSelect),[{trusted:false,detail:{value:'#caller-first'}}]);
        assert.equal(await page.locator('#twin').evaluate(node=>node.outerHTML),twin);
      }finally{await context.close();}
    }
    for(const name of names)assert.equal(hash(await readFile(new URL('../../assets/'+name,import.meta.url))),sourceHashes[name],'Source drift: '+name);
    receipt.status='passed';
  }catch(error){receipt.status='failed';receipt.error=String(error);throw error;}
  finally{try{await browser?.close();receipt.browserClosed=!browser?.isConnected();}catch(error){receipt.status='failed';receipt.cleanupError=String(error);throw error;}finally{await writeFile(join(output,'receipt.json'),JSON.stringify(receipt,null,2)+'\n',{flag:'wx'});}}
});

for(const id of ['zoom-in','fit-canvas','navigate-minimap']){
  test(`canvas supplemental payload pure: ${id} accepts view and rejects malformed contracts`,async()=>{
    // Read actual callbacks without importing an action runner or starting a browser.
    const source=await readFile(new URL('./visual-state-audit-drivers.mjs',import.meta.url),'utf8');
    const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),nodes=[];
    const visit=node=>{
      if(!node||typeof node!=='object')return;
      if(node.type)nodes.push(node);
      for(const value of Object.values(node))if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);
    };
    visit(ast);
    const oracle=nodes.find(node=>node.type==='FunctionDeclaration'&&node.id?.name==='assertMinimapViewport');
    assert(oracle);
    const assertMinimapViewport=compileFunction(`return (${source.slice(oracle.start,oracle.end)});`,['assert'])(assert);
    const stage={width:820,height:460},bounds={x:0,y:0,w:860,h:640},point={x:110,y:80},ratio=.2;
    const beforeZoom={stage,view:{x:-60,y:-60,zoom:.7}};
    const zoom={zoom:.75,x:-60+410/.7-410/.75,y:-60+230/.7-230/.75};
    const afterZoom={stage,view:zoom,artboards:[{...bounds}]};
    const fitZoom=Math.min((820-96)/860,(460-96)/640);
    const fit={zoom:fitZoom,x:430-410/fitZoom,y:320-230/fitZoom};
    const beforeMinimap={stage,view:fit,mapBounds:{bounds,ratio}};
    const pointerView={zoom:fitZoom,x:500-410/fitZoom,y:350-230/fitZoom};

    const view={'zoom-in':zoom,'fit-canvas':fit,'navigate-minimap':pointerView}[id];
    const calls=nodes.filter(node=>node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='runStep'&&node.arguments[0]?.value===id);
    assert.equal(calls.length,1,'Exactly one actual supplemental callback must be selected');
    const callback=calls[0].arguments[2],body=source.slice(callback.start,callback.end);
    const invoke=async({detail={view},events,clicks,rendered=view,oldShape=false}={})=>{
      const world=[];
      const payload={id:'canvas-main',component:'canvas/InfiniteCanvas',action:'change-viewport',...detail};
      const bindings={
        assert,id:'canvas-main',identity:'canvas/InfiniteCanvas',beforeZoom,afterZoom,beforeMinimap,
        fresh:async()=>events??[{type:'ely:action',detail:payload}],
        union:()=>bounds,
        close:(actual,expected,message)=>assert(Math.abs(actual-expected)<=1e-6,message),
        assertWorld:async actual=>{for(const key of ['x','y','zoom'])assert.equal(actual[key],rendered[key]);world.push(actual);},
        assertMinimapViewport,
        root:{evaluate:async()=>clicks??[{trusted:true,x:110,y:80}],locator:()=>({evaluate:async()=>point})},
      };
      const verify=compileFunction(`return (${oldShape?body.replaceAll('detail.view','detail.scene.view'):body});`,Object.keys(bindings))(...Object.values(bindings));
      const result=await verify();assert.equal(world.length,1,'Rendered-world assertion remains mandatory');return result;
    };
    const result=await invoke();
    for(const key of ['x','y','zoom'])assert.equal(result.view[key],view[key]);
    await assert.rejects(()=>invoke({detail:{scene:{view}}}));
    await assert.rejects(()=>invoke({detail:{}}));
    for(const key of ['x','y','zoom'])await assert.rejects(()=>invoke({detail:{view:{...view,[key]:view[key]+1}}}));
    await assert.rejects(()=>invoke({detail:{view,id:'foreign'}}));
    await assert.rejects(()=>invoke({detail:{view,component:'canvas/Unknown'}}));
    await assert.rejects(()=>invoke({detail:{view,action:'wrong'}}));
    await assert.rejects(()=>invoke({events:[]}));
    await assert.rejects(()=>invoke({events:[{type:'change'},{type:'ely:action'}]}));
    await assert.rejects(()=>invoke({rendered:{...view,x:view.x+1}}));
    await assert.rejects(()=>invoke({oldShape:true}),'Old scene.view reads must reject the documented public payload');
    if(id==='navigate-minimap'){
      await assert.rejects(()=>invoke({clicks:[{trusted:false,x:110,y:80}]}));
      await assert.rejects(()=>invoke({clicks:[]}));
    }
  });
}

const returnFlowSites=body=>resolveCaseActionSites(`function entry(){${body}}`,'return-flow.js',{entry:'entry',facts:{selected:true}});
const returnFlowControls=result=>result.sites.map(site=>site.control);
test('resolver return flow pure: selected return excludes unreachable suffix',()=>{
  const result=returnFlowSites('if(selected){first.click();return 7;}later.click();');
  assert.deepEqual(returnFlowControls(result),['first']);assert.deepEqual(result.mappingGaps,[]);
});
test('resolver return flow pure: selected else and false no-else preserve reachability',()=>{
  assert.deepEqual(returnFlowControls(returnFlowSites('if(!selected){wrong.click();}else{right.click();return;}later.click();')),['right']);
  assert.deepEqual(returnFlowControls(returnFlowSites('if(!selected)return;later.click();')),['later']);
});
test('resolver return flow pure: return expression visited before termination',()=>{
  const result=returnFlowSites('return first.click();later.click();');
  assert.deepEqual(returnFlowControls(result),['first']);assert.deepEqual(result.mappingGaps,[]);
});
test('resolver return flow pure: helper-local return does not terminate caller',()=>{
  const result=returnFlowSites('function helper(){first.click();return 9;wrong.click();}helper();later.click();');
  assert.deepEqual(returnFlowControls(result),['first','later']);
  assert.deepEqual(result.sites.map(site=>site.owner),['helper','entry']);
});
test('resolver return flow pure: reachable extra action cannot match two-site contract',()=>{
  const original='first.click();if(selected){second.click();return;}wrong.click();';
  assert.equal(returnFlowSites(original).sites.length,2);
  const changed=returnFlowSites(original.replace('second.click();','extra.click();second.click();'));
  assert.deepEqual(returnFlowControls(changed),['first','extra','second']);
  assert.notEqual(changed.sites.length,2);
});
test('resolver return flow pure: unknown action-free return persists blocking gap',()=>{
  for(const body of ['if(unknown)return;target.click();','if(unknown){left.click();return;}else{right.click();return;}target.click();']){
    const result=returnFlowSites(body);
    assert(returnFlowControls(result).includes('target'));
    assert(result.mappingGaps.some(gap=>gap.reason==='unresolved-control-flow-guard'&&gap.guard==='unknown'));
  }
  const branches=returnFlowSites('if(unknown){left.click();return;}else{right.click();return;}target.click();');
  assert.deepEqual(returnFlowControls(branches),['left','right','target']);
  assert.equal(branches.mappingGaps.filter(gap=>gap.reason==='unresolved-action-guard').length,2);
});
test('resolver return flow pure: loop switch try and label boundaries stay conservative',()=>{
  for(const boundary of ['for(;;){first.click();return;second.click();}','while(selected){first.click();return;second.click();}','do{first.click();return;second.click();}while(selected);','for(const item of items){first.click();return;second.click();}','for(const key in object){first.click();return;second.click();}','switch(selected){case true:{first.click();return;second.click();}}','try{first.click();return;second.click();}catch(error){caught.click();}finally{finalizer.click();}','label:{first.click();return;second.click();}']){
    const result=returnFlowSites(boundary+'later.click();');
    assert(returnFlowControls(result).includes('second'),boundary);
    assert(returnFlowControls(result).includes('later'),boundary);
    assert(result.mappingGaps.some(gap=>gap.reason==='conservative-control-flow-boundary'),boundary);
    if(boundary.startsWith('try'))assert(returnFlowControls(result).includes('finalizer'));
  }
});
test('resolver return flow pure: action-free boundaries block exact one-site matching',()=>{
  const boundaries=[
    ['while(unknown){return;}','WhileStatement'],
    ['for(;unknown;){return;}','ForStatement'],
    ['for(const item of items){return;}','ForOfStatement'],
    ['for(const key in object){return;}','ForInStatement'],
    ['do{return;}while(unknown);','DoWhileStatement'],
    ['switch(selected){case true:return;}','SwitchStatement'],
    ['try{return;}finally{}','TryStatement'],
    ['label:{return;}','LabeledStatement'],
  ];
  for(const [boundary,type]of boundaries){
    for(const body of [boundary+'target.click();',`function helper(){${boundary}}helper();target.click();`]){
      const result=returnFlowSites(body);
      assert.deepEqual(returnFlowControls(result),['target'],body);
      assert(result.mappingGaps.some(gap=>gap.reason==='conservative-control-flow-boundary'&&gap.boundary===type),body);
      assert.equal(result.sites.length===1&&result.mappingGaps.length===0,false,'Matching the sole action must not discharge an unresolved boundary');
    }
  }
});

test('non-workspace normalization pure: source bindings and atomic boundaries',async()=>{
  const sources={};
  for(const name of ['foundation','interaction','communication','native','forms'])sources[name]=await readFile(new URL(`../../../../internal/gallery/assets/advanced-${name}-checks.js`,import.meta.url),'utf8');
  assert(sources.foundation.includes('for (const button of closingPanes) { button.click(); }'));
  for(const name of ['suspenseReload','suspenseFail','dialogClose','bulkClear'])assert(sources.interaction.includes(`if (${name} !== null && ${name} !== undefined) { ${name}.click(); }`));
  assert(sources.interaction.includes('return await lottieCheck({root});'));
  assert(sources.communication.includes(`pick=name=>{ must(view,'[data-project-layout][value="'+name+'"]','layout '+name).click(); };`));
  assert(sources.native.includes('return await comparison(context);'));
  assert(sources.native.includes('for (const [index,field] of fields.entries())'));
  assert(sources.native.includes("for (const value of ['2','+','3','×','4','=']) { key(value); }"));
  assert(sources.forms.includes("checks['forms/CheckboxCard']=async({root})=>{ return await checkChoiceCardState(root); };"));
  assert(sources.forms.includes('export function checkChoiceCardState(root){'));
  assert(!sources.forms.includes('export async function checkChoiceCardState'));
  assert(sources.forms.includes("const input=(node,value)=>{node.value=value;node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));};"));
  assert(sources.forms.includes("const suiteResult=(root,action,result,extra={})=>root.dispatchEvent(new CustomEvent('ely:result',{bubbles:true,detail:{action,result,...extra}}));"));
  assert(sources.communication.includes('const event=action(root,actions,selector,name)'));
  assert(sources.native.includes("send=form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}))"));
});

test('non-workspace normalization pure: nullish receivers and causal failures',async()=>{
  const oldBody="root?.querySelector('close')?.click();";
  const body="const close=root?.querySelector('close');if(close !== null && close !== undefined){close.click();}";
  const oldShape=transform(`async function check(){${oldBody}}await check();`,'normalization-old-optional.js');
  assert(oldShape.unsupported.some(site=>site.siteId),'Complex old optional receiver must stay a red control');
  for(const receiver of ['null','undefined','false','0',"''",'{}',
    "{tag:7,get click(){events.push('method');return function(){assert(this.tag===7);events.push('clicked');};}}",
    "{get click(){throw failure;}}","{click(){throw failure;}}"]){
    const prefix=`const failure=new Error('sentinel');const receiver=${receiver};const root={querySelector(){events.push('query');return receiver;}};`;
    const suffix="}try{await check();}catch(error){events.push(error===failure?'sentinel':error.name);}";
    const original=await execute(prefix+'async function check(){'+oldBody+suffix);
    const normalized=prefix+'async function check(){'+body+suffix;
    assert.deepEqual(await execute(normalized),original);
    const transformed=transform(normalized,'normalization-optional.js');
    assert.equal(transformed.unsupported.length,0);
    const captured=await execute(transformed.source);
    assert.deepEqual(captured.filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
    if(original.includes('sentinel')||original.includes('TypeError'))assert(!captured.includes('checkpoint:click'));
    if(['false','0',"''"].includes(receiver)){
      const truthy=normalized.replace('close !== null && close !== undefined','close');
      assert.notDeepEqual(await execute(truthy),original,'Truthy guard would silently drop a non-nullish receiver');
    }
  }
  for(const root of ['null','undefined',"{querySelector(){throw failure;}}"]){
    const prefix=`const failure=new Error('sentinel');const root=${root};`;
    const suffix="}try{await check();}catch(error){events.push(error===failure?'sentinel':error.name);}";
    const original=await execute(prefix+'async function check(){'+oldBody+suffix);
    assert.deepEqual(await execute(transform(prefix+'async function check(){'+body+suffix,'normalization-null-root.js').source),original);
  }
});

test('non-workspace normalization pure: finite snapshot and checkpoint order',async()=>{
  const oldBody='nodes.filter(button=>!button.hidden).slice(0,2).forEach(button=>button.click());';
  const body='const closing=nodes.filter(button=>!button.hidden).slice(0,2);for(const button of closing){button.click();}';
  assert(transform(`async function check(){${oldBody}}await check();`,'normalization-old-loop.js').unsupported.some(site=>site.siteId));
  for(const size of [0,1,3])for(const failAt of [-1,0,1]){
    const prefix=`const failure=new Error('sentinel');const nodes=Array.from({length:${size}},(_,index)=>({hidden:false,click(){events.push('click:'+index);if(index===${failAt})throw failure;if(index===0&&nodes[1])nodes[1].hidden=true;}}));`;
    const suffix="}try{await check();}catch(error){assert(error===failure);events.push('sentinel');}";
    const original=await execute(prefix+'async function check(){'+oldBody+suffix);
    const normalized=prefix+'async function check(){'+body+suffix;
    assert.deepEqual(await execute(normalized),original);
    const transformed=transform(normalized,'normalization-loop.js');
    assert.equal(transformed.unsupported.length,0);
    const captured=await execute(transformed.source);
    assert.deepEqual(captured.filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
    const expected=[];
    for(const event of original){if(event.startsWith('click:'))expected.push('before:click',event);else expected.push(event);if(event.startsWith('click:')&&Number(event.slice(6))!==failAt)expected.push('checkpoint:click');}
    assert.deepEqual(captured,expected,'Only completed calls receive after checkpoints, in original occurrence order');
    if(size===3&&failAt===-1){
      const reevaluated=normalized.replace('for(const button of closing){button.click();}','for(const button of closing){if(!button.hidden)button.click();}');
      assert.notDeepEqual(await execute(reevaluated),original,'Refiltering after the first close loses the snapshotted second control');
      assert.notDeepEqual(captured.filter(value=>value!=='checkpoint:click'),expected,'Missing checkpoints must not satisfy occurrence ordering');
    }
  }
});

test('non-workspace normalization pure: void helpers indexed fields and awaited tails',async()=>{
  const oldBody="const key=value=>controls[value].click();['2','+','3','×','4','='].forEach(key);";
  const body="const key=value=>{controls[value].click();};for(const value of ['2','+','3','×','4','=']){key(value);}";
  assert(transform(`async function check(){${oldBody}}await check();`,'normalization-old-keys.js').unsupported.some(site=>site.siteId));
  for(const fail of ['none','3']){
    const prefix=`const failure=new Error('sentinel');const controls=Object.fromEntries(['2','+','3','×','4','='].map(value=>[value,{click(){events.push(value);if(value==='${fail}')throw failure;}}]));`;
    const suffix="}try{await check();}catch(error){assert(error===failure);events.push('sentinel');}";
    const original=await execute(prefix+'async function check(){'+oldBody+suffix);
    const normalized=prefix+'async function check(){'+body+suffix;
    assert.deepEqual(await execute(normalized),original);
    const transformed=transform(normalized,'normalization-keys.js');
    assert.equal(transformed.unsupported.length,0);
    assert.deepEqual((await execute(transformed.source)).filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
  }
  const oldFields="fields.forEach((field,index)=>{field.value=index?'calm':'gardens';field.dispatchEvent(new Event('input',{bubbles:true}));});";
  const fields="for(const [index,field] of fields.entries()){field.value=index?'calm':'gardens';field.dispatchEvent(new Event('input',{bubbles:true}));}";
  assert(transform(`async function check(){${oldFields}}await check();`,'normalization-old-fields.js').unsupported.some(site=>site.siteId));
  const prefix="const fields=[0,1].map(index=>({value:'',dispatchEvent(event){events.push(index+':'+this.value+':'+event.type+':'+event.bubbles);return true;}}));";
  const original=await execute(prefix+'async function check(){'+oldFields+'}await check();');
  assert.deepEqual(original,['0:gardens:input:true','1:calm:input:true']);
  assert.deepEqual((await execute(transform(prefix+'async function check(){'+fields+'}await check();','normalization-fields.js').source)).filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
  for(const keyword of ['', 'async '])for(const failure of [false,true]){
    const prefix=`const failure=new Error('sentinel');${keyword}function delegate(){target.click();${failure?'throw failure;':'return 37;'}}`;
    const suffix="}try{events.push('return:'+await check());}catch(error){assert(error===failure);events.push('sentinel');}";
    const old=prefix+'async function check(){return delegate();'+suffix;
    const normalized=prefix+'async function check(){return await delegate();'+suffix;
    assert(transform(old,'normalization-old-tail.js').unsupported.some(site=>site.siteId));
    const original=await execute(old);
    assert.deepEqual(await execute(normalized),original);
    const transformed=transform(normalized,'normalization-tail.js');
    assert.equal(transformed.unsupported.length,0);
    assert.deepEqual((await execute(transformed.source)).filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
  }
  assert.deepEqual(await execute("const control={click(){events.push('click');}};const pick=()=>control.click();events.push('return:'+pick());"),await execute("const control={click(){events.push('click');}};const pick=()=>{control.click();};events.push('return:'+pick());"));
});

async function execute(source,unsupportedHook=()=>{}){
  const events=[];
  globalThis.events=events;
  globalThis.target={click(){events.push('click');return 19;}};
  globalThis.items=[1];
  globalThis.assert=value=>{if(!value)throw new Error('fixture assertion failed');};
  globalThis.registerChecks=()=>{};
  globalThis.__visualBeforeAction=site=>events.push(`before:${site.method}`);
  globalThis.__visualCheckpoint=site=>events.push(`checkpoint:${site.method}`);
  globalThis.__visualUnsupportedAction=site=>unsupportedHook(site,events);
  try{await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}#${Math.random()}`);}
  finally{for(const key of ['events','target','items','assert','registerChecks','__visualBeforeAction','__visualCheckpoint','__visualUnsupportedAction'])delete globalThis[key];}
  return events;
}

test('static coverage preserves alias IDs and unknown mappings without claiming unexecuted actions failed',()=>{
  const source=`const asset='/assets/example.js'; registerChecks('forms',{'forms/Field':()=>{button.click();}});`;
  const inventory={cases:[{name:'forms/Field',key:'forms/Field',family:'forms'},{name:'forms/Alias',key:'forms/Field',family:'forms'}]};
  const sources=[{name:'forms',filename:'forms.js',source}];
  const result=staticCoverageManifest(inventory,sources);
  assert.equal(result.counts.cases,2);
  assert.equal(result.counts.distinctCheckKeys,1);
  assert.equal(result.counts.checkpointed,1);
  assert.notEqual(result.modules.forms.sourceSHA256,result.modules.forms.staticAudit.sourceSHA256);
  assert.notEqual(result.modules.forms.sites[0].siteId,result.modules.forms.staticAudit.sites[0].siteId,'Static rewritten columns must be recomputed, not relabelled');
  assert.equal(result.counts.unresolvedRegistrations,0);
  assert.equal(result.counts.blockingCases,2);
  assert.equal(result.safeForFullActionClaim,false);
  assert.deepEqual(result.blockingCaseIds,['gallery:forms/Field','gallery:forms/Alias']);
  assert.deepEqual(result.cases[0].candidateSafeSiteIds,result.cases[1].candidateSafeSiteIds);
  assert.throws(()=>staticCoverageManifest({cases:[inventory.cases[0],inventory.cases[0]]},sources),/duplicate/);
  assert.throws(()=>staticCoverageManifest(inventory,[{...sources[0],source:'not javascript {'}]),/cannot parse/);
  assert.throws(()=>staticCoverageManifest(inventory,[]),/invalid inventory/);
});

test('static coverage separates unsupported diagnostics and routed tooling from exact contract proof',()=>{
  const sources=[{name:'native',filename:'native.js',source:`registerChecks('native',{'shell/A':()=>{return button.click();}});`},
    {name:'native-tooling',filename:'tooling.js',source:`registerChecks('native',{'tooling/B':()=>{button.click();}});`}];
  const inventory={cases:[{name:'shell/A',key:'shell/A',family:'native'},{name:'tooling/B',key:'tooling/B',family:'native'}]};
  const report=staticCoverageManifest(inventory,sources,identity=>identity==='shell/A'?{steps:[{source:{siteId:'native.js:1:47:click'}}],mappingGaps:[]}:null);
  assert.equal(report.counts.unsupportedActionSites,1);
  assert.equal(report.counts.casesWithCandidateUnsupportedSites,1);
  assert.equal(report.counts.exactContracts,1);
  assert.deepEqual(report.cases[1].registeredModules,['native-tooling']);
  assert(!report.cases[1].blockers.some(gap=>gap.reason==='registered-module-not-transformed-by-action-runner'));
  assert.equal(report.safeForFullActionClaim,false);
});

test('bounded registration mapping handles table factories, assignments and add/set writers without executing checks',()=>{
  const fixtures=[
    `const names={layout:{Stack:['selector','action'],Flex:['selector']}}; registerChecks('foundation',Object.fromEntries([...Object.entries(names.layout).map(([name,[selector,action]])=>[\`layout/\${name}\`,check(selector,action)])]));`,
    `const stories={menus:['Menu','MenuAlias']}; const checks=Object.fromEntries(Object.entries(stories).flatMap(([chapter,names])=>names.map(name=>[\`\${chapter}/\${name}\`,ctx=>check(ctx)]))); registerChecks('interaction',checks);`,
    `const names={lists:['List','Tree']}; const checks={}; for(const [chapter,names] of Object.entries(names))for(const name of names)checks[chapter+'/'+name]=()=>{throw new Error('never execute')}; registerChecks('data',checks);`,
    `const checks={};const groups={fields:['Input','Password']};const set=(chapter,names,check)=>names.forEach(name=>checks[\`\${chapter}/\${name}\`]=check);set('forms',groups.fields,field);checks['forms/Input']=override;registerChecks('forms',checks);`,
  ];
  assert.deepEqual(fixtures.map(source=>registrationInventory(source).entries.map(item=>item.key)),[['layout/Stack','layout/Flex'],['menus/Menu','menus/MenuAlias'],['lists/List','lists/Tree'],['forms/Input','forms/Password']]);
  assert(registrationInventory(`registerChecks('data',unknownFactory());`).unresolved.length);
  assert.deepEqual(registrationInventory(`const checks={};if(flag)checks['lists/A']=check;registerChecks('data',checks);checks['lists/Late']=check;`).entries,[],'Unknown conditional and post-registration writes cannot establish registered IDs');
  assert(registrationInventory(`const a=b,b=a;registerChecks('data',a);`).unresolved.some(item=>item.reason==='cyclic-registration-binding'));
  assert.throws(()=>registrationInventory(`registerChecks('data',{'lists/A':check});registerChecks('data',{'lists/A':check});`),/duplicate registered/);
});

test('native tooling route and source/AST hash guards fail closed before browser startup',()=>{
  assert.deepEqual(actionModuleNames('native'),['native','native-tooling']);
  const source=`const asset='/assets/a.js';registerChecks('native',{'tooling/A':()=>{button.click();}});`;
  const manifest=staticCoverageManifest({cases:[{name:'tooling/A',key:'tooling/A',family:'native'}]},[{name:'native',filename:'internal/gallery/assets/advanced-native-checks.js',source}]);
  for(const surface of ['live-audit','static-audit'])assert.equal(prepareActionModule('native',source,manifest,surface).name,'native');
  assert.throws(()=>prepareActionModule('native',source+' ',manifest,'live-audit'),/source hash mismatch/);
  assert.throws(()=>prepareActionModule('native-tooling',source,manifest,'live-audit'),/source hash mismatch/);
  const tampered=structuredClone(manifest);tampered.modules.native.staticAudit.sites=[];
  assert.throws(()=>prepareActionModule('native',source,tampered,'static-audit'),/AST\/hash mismatch/);
  const wrongRegistration=structuredClone(manifest);wrongRegistration.modules.native.registeredChecks=[];
  assert.throws(()=>prepareActionModule('native',source,wrongRegistration,'live-audit'),/registration mismatch/);
});

test('existing sync telemetry is not an independent complete original-action denominator',async()=>{
  const safe=`function check(){target.click();target.click();}check();`;
  const transformed=transform(safe,'safe-trace.js');
  assert.equal(transformed.interactionSites.length,2);
  assert.equal(transformed.syncUnsupportedSites.length,0,'Safe sites are not part of existing unsupported telemetry');
  const unsafe=`function check(){true&&target.click();}check();`;
  const blocked=transform(unsafe,'unsafe-trace.js');
  assert.equal(blocked.source,unsafe);
  assert.equal(blocked.syncUnsupportedSites.length,0,'Reached non-statement actions currently have no probe');
  assert.deepEqual(await execute(unsafe),['click']);
  const outcome=count=>{let checked=false;for(let i=0;i<count;i++)checked=!checked;return {checked,hostEvents:[]};};
  assert.deepEqual(outcome(2),outcome(0),'Equal final semantics and host events cannot prove all intermediate actions ran');
});

test('optional click caches receivers once, preserves this and emits no nullish hooks',async()=>{
  const traces=[];globalThis.__visualSyncTrace=(site,phase)=>traces.push({siteId:site.siteId,phase});
  try{
    for(const value of ['null','undefined',`{name:'receiver',get click(){events.push('method-get');return function(){assert(this.name==='receiver');events.push('clicked');};}}`]){
      const source=`let reads=0;Object.defineProperty(globalThis,'optionalReceiver',{configurable:true,get(){reads++;return ${value};}});async function check(){optionalReceiver?.click();assert(reads===1);}try{await check();}finally{delete globalThis.optionalReceiver;}`;
      const original=await execute(source),transformed=transform(source,'optional.js'),trace=synchronousTrace(source,'optional.js');
      assert.equal(transformed.interactionSites.length,1);assert.equal(transformed.unsupported.length,0);
      assert.equal(trace.sites[0].traceKind,'statement');
      assert.equal(transformed.interactionSites[0].siteId,trace.sites[0].siteId);
      assert.equal(transformed.interactionSites[0].sourceAnchor.text,'optionalReceiver?.click()');
      const captured=await execute(transformed.source);
      assert.deepEqual(captured.filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
      traces.length=0;assert.deepEqual(await execute(trace.source),original);
      if(value==='null'||value==='undefined'){assert.deepEqual(captured,[]);assert.deepEqual(traces,[]);}
      else {assert.deepEqual(captured,['before:click','method-get','clicked','checkpoint:click']);assert.deepEqual(traces.map(event=>event.phase),['enter','exit']);}
    }
    for(const receiver of [`Object.defineProperty(globalThis,'optionalReceiver',{configurable:true,get(){throw new Error('receiver failed');}});`,`globalThis.optionalReceiver={get click(){throw new Error('method failed');}};`,`globalThis.optionalReceiver={};`]){
      const source=`${receiver}async function check(){optionalReceiver?.click();}try{await check();}catch(error){events.push(error.name+':'+error.message);}finally{delete globalThis.optionalReceiver;}`;
      const original=await execute(source),captured=await execute(transform(source,'throw.js').source);
      assert.deepEqual(captured.filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
      assert(!captured.includes('checkpoint:click'),'Throwing actions have no completed after hook');
      traces.length=0;assert.deepEqual(await execute(synchronousTrace(source,'throw.js').source),original);
      assert(!traces.some(event=>event.phase==='exit'));
      if(receiver.includes('receiver failed'))assert.deepEqual(traces,[],'Receiver exceptions occur before all hooks');
    }
  }finally{delete globalThis.__visualSyncTrace;delete globalThis.optionalReceiver;}
});

test('optional click keeps complex, optional-method, argument and callback sites unsupported',()=>{
  for(const source of [
    `async function check(){box.node?.click();}await check();`,
    `async function check(){lookup()?.click();}await check();`,
    `async function check(){node.click?.();}await check();`,
    `async function check(){node?.click('argument');}await check();`,
    `async function check(){node?.['click']();}await check();`,
    `async function check(){globalThis?.click();}await check();`,
    `button.addEventListener('click',()=>{node?.click();});`,
    `items.forEach(()=>{node?.click();});`,
    `const tap=()=>node?.click();tap();`,
    `function* check(){node?.click();}check().next();`,
  ]){
    const transformed=transform(source,'unsupported-optional.js');
    assert.equal(transformed.interactionSites.length,0);
    assert(transformed.unsupported.some(site=>site.siteId));
    assert(synchronousTrace(source,'unsupported-optional.js').sites.every(site=>site.traceKind==='unsafe-region'));
  }
});

test('optional click preserves collision-free block scope, loops, dangling else and ordered occurrences',async()=>{
  const source=`let count=0;const node={click(){events.push('click'+(++count));}};async function check(){const __visualOptionalTarget_0='caller';if(true)for(const value of [1,2])if(value)node?.click();else events.push('wrong');else events.push('outer-wrong');node?.click();assert(__visualOptionalTarget_0==='caller');}await check();`;
  const at=source.indexOf('node?.click()'),withCollision=source+`const __visualOptionalTarget_${at}=7;`;
  const traces=[];globalThis.__visualSyncTrace=(site,phase)=>traces.push({siteId:site.siteId,phase});
  try{
    const original=await execute(source),captured=await execute(transform(source,'scope.js').source);
    assert.deepEqual(original,['click1','click2','click3']);
    assert.deepEqual(captured,['before:click','click1','checkpoint:click','before:click','click2','checkpoint:click','before:click','click3','checkpoint:click']);
    assert.deepEqual(await execute(synchronousTrace(source,'scope.js').source),original);
    assert.equal(traces.length,6);
    const shadowed=`async function check(undefined){undefined?.click();}await check({click(){events.push('shadowed');}});`;
    assert.deepEqual((await execute(transform(shadowed,'shadow.js').source)).filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),await execute(shadowed));
    assert.deepEqual(await execute(synchronousTrace(shadowed,'shadow.js').source),await execute(shadowed));
    assert(transform(withCollision,'collision.js').source.includes(`const __visualOptionalTarget_${at}_=node`));
    assert(synchronousTrace(withCollision,'collision.js').source.includes(`const __visualOptionalTarget_${at}_=node`));
    assert.deepEqual((await execute(transform(withCollision,'collision.js').source)).filter(value=>!value.startsWith('before:')&&!value.startsWith('checkpoint:')),original);
  }finally{delete globalThis.__visualSyncTrace;}
});

test('optional click promotes only seven real gallery sites and preserves original anchors',async()=>{
  const filename='internal/gallery/assets/advanced-interaction-checks.js';
  const source=await readFile(new URL('../../../../'+filename,import.meta.url),'utf8');
  const transformed=transform(source,filename,{registeredCheckEntriesAwaited:true}),trace=synchronousTrace(source,filename);
  const promoted=transformed.interactionSites.filter(site=>/^[A-Za-z_$][\w$]*\?\.click\(\)$/.test(site.sourceAnchor.text));
  assert.deepEqual(promoted.map(site=>site.line),[123,133,135,137,140,230,277]);
  assert.equal(transformed.originalSHA,'fc2fc05b122ac680bc89b8f4da892dc89886f79b14c75041cdfc054812a22427');
  const additions=[
    ['265:166:click','265:18:click','check','suspenseReload.click()',"suspense.querySelector('[data-interaction-suspense-toggle]')?.click()"],
    ['265:531:click','265:288:click','check','suspenseFail.click()',"suspense.querySelector('[data-interaction-suspense-fail]')?.click()"],
    ['329:336:click','329:208:click','check','dialogClose.click()',"target?.querySelector('[data-interaction-close]')?.click()"],
    ['440:430:click','440:306:click','check','bulkClear.click()',"host.querySelector('[data-interaction-bulk-clear]')?.click()"],
    ['552:21:dispatchEvent','552:21:dispatchEvent','lottieCheck',"seek.dispatchEvent(new Event('input', {bubbles: true}))", "seek.dispatchEvent(new Event('input', {bubbles: true}))"],
    ['554:2:click','554:2:click','lottieCheck','pause.click()','pause.click()'],
    ['555:2:click','555:2:click','lottieCheck','play.click()','play.click()'],
  ];
  assert.equal(transformed.interactionSites.length,175);
  assert.deepEqual(transformed.unsupported.filter(site=>site.siteId),[]);
  const addedIds=new Set(additions.map(([id])=>`${filename}:${id}`));
  assert.equal(addedIds.size,7);
  for(const [id,,owner,anchor]of additions){
    const matches=transformed.interactionSites.filter(site=>site.siteId===`${filename}:${id}`);
    assert.equal(matches.length,1,'Each newly eligible source site occurs exactly once');
    const site=matches[0];assert.equal(site.method,id.split(':')[2]);assert.equal(site.containingFunction,owner);
    assert.equal(site.sourceAnchor.text,anchor);assert.equal(source.slice(site.sourceAnchor.start,site.sourceAnchor.end),anchor);
  }
  // Lottie input is programmatic dispatch, not trusted/native user input.
  assert.equal(transformed.interactionSites.find(site=>site.siteId===`${filename}:552:21:dispatchEvent`).event,"new Event('input', {bubbles: true})");

  let historical=source;
  const reversals=[
    ['return await lottieCheck({root});','return lottieCheck({root});'],
    ["const suspenseReload = suspense.querySelector('[data-interaction-suspense-toggle]'); if (suspenseReload !== null && suspenseReload !== undefined) { suspenseReload.click(); }","suspense.querySelector('[data-interaction-suspense-toggle]')?.click();"],
    ["const suspenseFail = suspense.querySelector('[data-interaction-suspense-fail]'); if (suspenseFail !== null && suspenseFail !== undefined) { suspenseFail.click(); }","suspense.querySelector('[data-interaction-suspense-fail]')?.click();"],
    ["const dialogClose = target?.querySelector('[data-interaction-close]'); if (dialogClose !== null && dialogClose !== undefined) { dialogClose.click(); }","target?.querySelector('[data-interaction-close]')?.click();"],
    ["const bulkClear = host.querySelector('[data-interaction-bulk-clear]'); if (bulkClear !== null && bulkClear !== undefined) { bulkClear.click(); }","host.querySelector('[data-interaction-bulk-clear]')?.click();"],
  ];
  for(const [current,old]of reversals){assert.equal(historical.split(current).length,2);historical=historical.replace(current,old);}
  const old=transform(historical,filename,{registeredCheckEntriesAwaited:true});
  assert.equal(old.originalSHA,'ad9ea3d5afec8ab9149b39270863b829cd2ca375d6b2efc6f396a3310860e0b8','Reconstructed input must equal the exact 168-site historical fixture');
  assert.equal(old.interactionSites.length,168);
  const blocked=old.unsupported.filter(site=>site.siteId);
  assert.deepEqual(blocked.map(site=>site.siteId).sort(),additions.map(([,id])=>`${filename}:${id}`).sort());
  for(const [,id,owner,,anchor]of additions){
    const site=blocked.find(site=>site.siteId===`${filename}:${id}`);
    assert.equal(site.method,id.split(':')[2]);assert.equal(site.containingFunction,owner);assert.equal(site.sourceAnchor.text,anchor);
    assert.equal(historical.slice(site.sourceAnchor.start,site.sourceAnchor.end),anchor);
  }
  // Preserve exact ordered anchor occurrences across column shifts on rewritten lines.
  const occurrences=(sites,input)=>{
    const seen=new Map();
    return sites.map(site=>{
      assert.equal(input.slice(site.sourceAnchor.start,site.sourceAnchor.end),site.sourceAnchor.text);
      const identity=JSON.stringify([site.containingFunction,site.method,site.sourceAnchor.text]);
      const ordinal=(seen.get(identity)||0)+1;seen.set(identity,ordinal);
      return [identity,ordinal];
    });
  };
  assert.deepEqual(occurrences(transformed.interactionSites.filter(site=>!addedIds.has(site.siteId)),source),occurrences(old.interactionSites,historical),'All 168 retained safe action occurrences must be unchanged');
  for(const site of promoted){
    assert.equal(source.slice(site.sourceAnchor.start,site.sourceAnchor.end),site.sourceAnchor.text);
    assert.equal(trace.sites.find(other=>other.siteId===site.siteId)?.traceKind,'statement');
  }
});

test('sync trace preserves repeats, loop scoping, return values and synchronous callback scheduling',async()=>{
  const traces=[];globalThis.__visualSyncTrace=(site,phase)=>traces.push({siteId:site.siteId,phase});
  try{
    const source=`function check(){for(const item of items)target.click();target.click();}check();`;
    const traced=synchronousTrace(source,'trace.js');
    assert(!traced.source.includes('await '));assert(!traced.source.includes('async '));
    assert.deepEqual(await execute(traced.source),await execute(source));
    assert.deepEqual(traces.map(event=>event.phase),['enter','exit','enter','exit']);
    traces.length=0;
    const expression=`const tap=()=>\n(target.click());assert(tap()===19);items.forEach(()=>{target.click();});`;
    assert.deepEqual(await execute(synchronousTrace(expression,'expression.js').source),await execute(expression));
    assert(traces.every(event=>event.phase==='unsafe'),'Expression-return and collection callbacks remain explicit unsafe regions');
    traces.length=0;
    const nested=`const tap=()=>target.click(target.click());tap();`;
    assert.deepEqual(await execute(synchronousTrace(nested,'nested.js').source),await execute(nested));
    assert.equal(traces.length,2);assert(traces.every(event=>event.phase==='unsafe'));
    const skipped=`function check(){false&&target.click();}check();`;
    assert.deepEqual(await execute(synchronousTrace(skipped,'skip.js').source),[]);
    assert(traces.some(event=>event.phase==='unsafe'),'Conservative reach is not proof a short-circuit call ran');
  }finally{delete globalThis.__visualSyncTrace;}
});

test('trace comparator requires exact ordered occurrences, verified semantics and owned before/after images',()=>{
  const events=[{siteId:'a',phase:'enter'},{siteId:'a',phase:'exit'},{siteId:'a',phase:'enter'},{siteId:'a',phase:'exit'}];
  const receipt={siteId:'a',captureStatus:'captured',beforeCaptureStatus:'captured',afterCaptureStatus:'captured',beforeCaptureOwnership:{ownedStateEvidence:true},afterCaptureOwnership:{ownedStateEvidence:true}};
  const proof={originalEvents:events,capturedEvents:events,receipts:[receipt,receipt],originalEquivalent:true,unprobed:[],knownSiteIds:['a'],lateEvents:[]};
  assert.equal(compareActionTrace(proof).status,'passed');
  assert.equal(compareActionTrace(proof).independentContractCoverage,'not-established-by-trace');
  assert.equal(compareActionTrace({...proof,receipts:[receipt]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,capturedEvents:events.slice(0,2)}).status,'blocked');
  assert.equal(compareActionTrace({...proof,originalEquivalent:false}).status,'blocked');
  assert.equal(compareActionTrace({...proof,unprobed:['unknown']}).status,'blocked');
  assert.equal(compareActionTrace({...proof,knownSiteIds:[]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,lateEvents:[{siteId:'a',phase:'enter'}]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,receipts:[{...receipt,afterCaptureOwnership:{ownedStateEvidence:false}},receipt]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,originalEvents:[{siteId:'x',phase:'unsafe'}]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,originalEvents:[],capturedEvents:[],receipts:[]}).status,'blocked');
  assert.equal(compareActionTrace({...proof,originalEvents:events.slice(0,3)}).status,'blocked');
});

test('sync trace keeps microtask/handler ordering and fails visibly on action or probe exceptions',async()=>{
  const traces=[];globalThis.__visualSyncTrace=(site,phase)=>traces.push({siteId:site.siteId,phase});
  try{
    for(const source of [
      `function check(){Promise.resolve().then(()=>events.push('micro'));target.click();events.push('assert');}check();`,
      `const handlers=[];const button={addEventListener(_,handler){handlers.push(handler)}};button.addEventListener('click',()=>{target.click();});handlers[0]();`,
      `function check(){label:for(const item of items){target.click();break label;}}check();`,
    ])assert.deepEqual(await execute(synchronousTrace(source,'timing.js').source),await execute(source));
    traces.length=0;
    const receiver=`const box={get control(){target.click();return target}};function check(){box.control.click();}check();`;
    assert.deepEqual(await execute(synchronousTrace(receiver,'receiver.js').source),await execute(receiver));
    assert(traces.some(event=>event.phase==='unsafe'),'Receiver/getter evaluation cannot be mistaken for method invocation order');
    const throwing=`const node={click(){throw new Error('action failed')}};function check(){node.click();}check();`;
    await assert.rejects(execute(throwing),/action failed/);
    await assert.rejects(execute(synchronousTrace(throwing,'throws.js').source),/action failed/);
    globalThis.__visualSyncTrace=()=>{throw new Error('probe failed')};
    await assert.rejects(execute(synchronousTrace(`function check(){target.click();}check();`,'probe.js').source),/probe failed/);
  }finally{delete globalThis.__visualSyncTrace;}
});

test('page-local sync collector pins source hashes, case ordinals, errors and sealed late events',()=>{
  synchronousTraceInit();
  try{
    const site={siteId:'a',sourceSHA256:'source'};
    globalThis.__visualSyncTrace(site,'enter');
    assert.equal(globalThis.__visualSyncTraceState.events.length,0,'Module-load events are not attributed to a case');
    Object.assign(globalThis.__visualSyncTraceState,{caseId:'fixture',known:{a:'source'}});
    globalThis.__visualSyncTrace(site,'enter');globalThis.__visualSyncTrace(site,'exit');
    assert.deepEqual(globalThis.__visualSyncTraceState.events.map(event=>[event.caseId,event.ordinal,event.phase]),[['fixture',1,'enter'],['fixture',2,'exit']]);
    assert.throws(()=>globalThis.__visualSyncTrace({...site,sourceSHA256:'changed'},'enter'),/Invalid synchronous trace/);
    assert.equal(globalThis.__visualSyncTraceState.errors.length,1);
    globalThis.__visualSyncTraceState.events.length=16384;
    assert.throws(()=>globalThis.__visualSyncTrace(site,'enter'),/trace event budget exceeded/);
    assert(globalThis.__visualSyncTraceState.errors.includes('trace event budget exceeded'));
    Object.assign(globalThis.__visualSyncTraceState,{caseId:null,sealed:true});
    globalThis.__visualSyncTrace(site,'enter');
    assert.equal(globalThis.__visualSyncTraceState.lateEvents.length,1);
  }finally{delete globalThis.__visualSyncTrace;delete globalThis.__visualSyncTraceState;}
});

test('untouched calibration compares every existing semantic, result, payload and twin field',()=>{
  const reference={initial:{text:'initial'},finalTwin:{text:'twin'},result:{checkResult:{passed:true},actions:[{entries:[['content','first\nsecond']]}],hostEvents:[{value:'caller'}],finalState:{caret:4}}};
  assert(registeredOutcomesEqual(reference,structuredClone(reference)));
  for(const field of ['initial','finalTwin']){const changed=structuredClone(reference);changed[field]={text:'changed'};assert(!registeredOutcomesEqual(reference,changed));}
  for(const field of ['checkResult','actions','hostEvents','finalState']){const changed=structuredClone(reference);changed.result[field]=null;assert(!registeredOutcomesEqual(reference,changed));}
  assert(!registeredOutcomesEqual(reference,null));
});

test('calibration diagnoses EventLogger time and twin changes without normalizing either',()=>{
  const reference={initial:{text:'Type here'},finalTwin:{text:'Empty',controls:[{value:''}]},result:{checkResult:{assertions:9},actions:[],hostEvents:[],finalState:{text:'+0.00s key down 54'}}};
  assert.deepEqual(registeredOutcomeDifferences(reference,structuredClone(reference)),[]);
  const traced=structuredClone(reference);
  traced.result.finalState.text='+0.01s key down 54';
  assert(!registeredOutcomesEqual(reference,traced));
  assert.deepEqual(registeredOutcomeDifferences(reference,traced),[{path:'$.result.finalState.text',original:'"+0.00s key down 54"',instrumented:'"+0.01s key down 54"'}]);
  traced.finalTwin.controls[0].value='changed';
  assert.deepEqual(registeredOutcomeDifferences(reference,traced).map(item=>item.path),['$.finalTwin.controls[0].value','$.result.finalState.text']);
  assert.equal(registeredOutcomeDifferences(reference,null)[0].reason,'missing-registered-outcome');
  for(const field of ['checkResult','actions','hostEvents','finalState'])traced.result[field]={changed:'x'.repeat(1000)};
  traced.initial={changed:true};
  const differences=registeredOutcomeDifferences(reference,traced);
  assert.equal(differences.length,6,'At most one bounded first difference per exact calibration field');
  assert(differences.every(item=>item.original.length<=180&&item.instrumented.length<=180));
  assert.equal(firstDifference({items:[1,2]},{items:[1,3]}).path,'$.items[1]');
});

test('passing reached traces never close independent contracts or relax the three existing exact drivers',()=>{
  const events=[{siteId:'a',phase:'enter'},{siteId:'a',phase:'exit'},{siteId:'b',phase:'unsafe'}];
  const contract={mappingGaps:[],steps:[{source:{siteId:'a'}},{source:{siteId:'b'}}]};
  assert.deepEqual(traceContractStatus(null,events,true,[]),{independentContractGap:true,traceCalibrationValid:false});
  assert.deepEqual(traceContractStatus(contract,events,true,[]),{independentContractGap:false,traceCalibrationValid:true});
  for(const changed of [events.slice(0,2),[...events,events[2]],events.toReversed(),[]])assert.equal(traceContractStatus(contract,changed,true,[]).traceCalibrationValid,false);
  assert.equal(traceContractStatus(contract,events,false,[]).traceCalibrationValid,false);
  assert.equal(traceContractStatus(contract,[events[0],events[2]],true,[]).traceCalibrationValid,false,'An exact contract never excuses a missing synchronous exit');
  assert.equal(traceContractStatus(contract,events,true,[{siteId:'late'}]).traceCalibrationValid,false);
  assert.equal(traceContractStatus({...contract,mappingGaps:[{reason:'unknown-guard'}]},events,true,[]).traceCalibrationValid,false);
});

test('propagates async through declaration and arrow helper calls without moving assertions',async()=>{
  const source=`
const events=[];
const button={click(){events.push('click');}};
function tap(){button.click();events.push('assert:helper');}
const check=()=>{tap();events.push('assert:check');};
check();
globalThis.result=events;
`;
  const result=transform(source,'fixture.js');
  assert.equal(result.interactionSites.length,1);
  assert.equal(result.unsupported.length,0);
  assert.equal(result.interactionSites[0].control,'button');
  assert.equal(result.interactionSites[0].event,'click');
  assert.equal(result.interactionSites[0].action,'button.click()');
  assert.equal(result.interactionSites[0].sourceAnchor.text,'button.click()');
  assert.match(result.source,/async function tap/);
  assert.match(result.source,/const check=async\s*\(\)=>\{await tap\(\)/);
  const original=await execute(source),expected=globalThis.result;
  const instrumented=await execute(result.source),actual=globalThis.result;
  assert.deepEqual(expected,['click','assert:helper','assert:check']);
  assert.deepEqual(actual,['click','assert:helper','assert:check']);
  assert.deepEqual(instrumented,['before:click','checkpoint:click']);
  assert.notEqual(result.originalSHA,result.transformedSHA);
  delete globalThis.result;
});

test('supports async arrow check callbacks and checkpoints direct dispatched events in order',async()=>{
  const source=`
const events=[];
const target={dispatchEvent(){events.push('dispatch');}};
const check={run:async()=>{target.dispatchEvent('input');events.push('assert:after-dispatch');}};
await check.run();
globalThis.result=events;
`;
  const result=transform(source,'callback.js');
  assert.equal(result.interactionSites.length,1);
  assert.equal(result.unsupported.length,0);
  const expected=await execute(source),original=globalThis.result;
  const captured=await execute(result.source),instrumented=globalThis.result;
  assert.deepEqual(original,['dispatch','assert:after-dispatch']);
  assert.deepEqual(instrumented,['dispatch','assert:after-dispatch']);
  assert.deepEqual(captured,['before:dispatchEvent','checkpoint:dispatchEvent']);
  delete globalThis.result;
});

test('retains exact interaction anchors and maps helper sites to registered checks',()=>{
  const source=`
const press=()=>{document.querySelector('[data-action="save"]').click();};
const check=()=>{press();};
registerChecks('workspace',{'workspace/Editor':check,'workspace/Alias':check});
`;
  const result=transform(source,'mapped.js');
  assert.equal(result.interactionSites.length,1);
  const [site]=result.interactionSites;
  assert.deepEqual(site.mappedChecks,['workspace/Alias','workspace/Editor']);
  assert.equal(site.checkIdentity,'workspace/Alias');
  assert.equal(site.control,"document.querySelector('[data-action=\"save\"]')");
  assert.equal(site.event,'click');
  assert.equal(site.action,"document.querySelector('[data-action=\"save\"]').click()");
  assert.equal(site.sourceAnchor.text,"document.querySelector('[data-action=\"save\"]').click()");
  assert.equal(site.sourceAnchor.start,source.indexOf(site.sourceAnchor.text));
});

test('reports event-handler and non-statement interactions as unsupported',()=>{
  const source=`
button.addEventListener('click',()=>target.click());
function check(){const changed=target.focus();assert(changed);}
`;
  const result=transform(source,'unsupported.js');
  assert.equal(result.interactionSites.length,0);
  assert.deepEqual(result.unsupported.map(item=>item.reason),['dom-event-handler-callback','interaction-not-a-standalone-statement']);
  assert.equal(result.source,source);
  assert.equal(result.originalSHA,result.transformedSHA);
});

test('keeps blocked nested helpers synchronous and reports only their reached action',async()=>{
  const source=`
const target={click(){return 19;}};
const tap=()=>{target.click();return true;};
function check(){const completed=tap();assert(completed);}
check();
`;
  const result=transform(source,'nested-helper.js');
  assert.notEqual(result.source,source);
  assert.equal(result.interactionSites.length,0);
  assert.equal(result.syncUnsupportedSites.length,1);
  assert(result.unsupported.some(item=>item.reason.startsWith('async-propagation-unsupported')));
  assert(result.unsupported.some(item=>item.reason==='unsupported-containing-helper'));
  const got=await execute(result.source,(site,events)=>events.push(`unsupported:${site.siteId}`));
  assert.deepEqual(got,[`unsupported:${result.syncUnsupportedSites[0].siteId}`]);
  assert.match(result.source,/const tap=\(\)=>/);
});

test('does not propagate async instrumentation into a DOM handler through a helper',()=>{
  const source=`
const run=()=>{target.click();};
button.addEventListener('click',()=>run());
`;
  const result=transform(source,'handler-helper.js');
  assert.equal(result.source,source);
  assert.equal(result.interactionSites.length,0);
  assert(result.unsupported.some(item=>item.reason.includes('called from a DOM event-handler callback')));
  assert(result.unsupported.some(item=>item.reason==='unsupported-containing-helper'));
});

test('marks collection callback actions unsupported with sync-only reach telemetry',async()=>{
  const source=`items.forEach(item=>{target.click();});`;
  const result=transform(source,'iteration.js');
  assert.notEqual(result.source,source);
  assert.equal(result.interactionSites.length,0);
  assert.equal(result.syncUnsupportedSites.length,1);
  assert(result.unsupported.some(item=>item.reason.includes('inside forEach callback')));
  assert(result.unsupported.some(item=>item.reason==='unsupported-containing-helper'));
  assert.deepEqual(await execute(result.source,(site,events)=>events.push(`unsupported:${site.method}`)),['unsupported:click','click']);
});

test('keeps helpers synchronous when a later caller is blocked by a DOM handler',()=>{
  const source=`
const tap=()=>{target.click();};
function check(){tap();}
button.addEventListener('click',()=>check());
`;
  const result=transform(source,'late-blocked-caller.js');
  assert.equal(result.source,source);
  assert.equal(result.interactionSites.length,0);
  assert(result.unsupported.some(item=>item.reason.includes('DOM event-handler callback')));
  assert(result.unsupported.some(item=>item.reason.includes('caller check is blocked')));
  assert.equal(result.originalSHA,result.transformedSHA);
});

test('blocks return helper calls but preserves explicitly awaited helpers',()=>{
  const returned=`const tap=()=>{target.click();}; function check(){return tap();}`;
  const rejected=transform(returned,'return-helper.js');
  assert.match(rejected.source,/try\{globalThis\.__visualUnsupportedAction/);
  assert.match(rejected.source,/function check\(\)\{return tap\(\);\}/);
  assert(rejected.unsupported.some(item=>item.reason.includes('nested or passed as a callback')));
  const awaited=`const tap=()=>{target.click();}; async function check(){await tap();}`;
  const accepted=transform(awaited,'await-helper.js');
  assert.equal(accepted.unsupported.length,0);
  assert.equal(accepted.interactionSites.length,1);
  assert.match(accepted.source,/const tap=async/);
  assert.match(accepted.source,/async function check\(\)\{await tap\(\);\}/);
});

test('allows a registered entry to return an async helper only under the awaited-executor contract',async()=>{
  const source=`const tap=()=>{target.click();events.push('after');return 7;};const check=()=>tap();registerChecks('x',{'x/check':check});`;
  const result=transform(source,'registered-return.js',{registeredCheckEntriesAwaited:true});
  assert.equal(result.unsupported.length,0);
  assert.equal(result.interactionSites.length,1);
  const originalEvents=await execute(`${source};globalThis.value=await check();`),expected=globalThis.value;
  const actualEvents=await execute(`${result.source};globalThis.value=await check();`),actual=globalThis.value;
  assert.deepEqual(actualEvents.filter(event=>!event.startsWith('checkpoint:')&&!event.startsWith('before:')),originalEvents);
  assert.deepEqual(actualEvents.filter(event=>event.startsWith('before:')),['before:click']);
  assert.deepEqual(actualEvents.filter(event=>event.startsWith('checkpoint:')),['checkpoint:click']);
  assert.equal(expected,7);assert.equal(actual,7);
  delete globalThis.value;
  const alsoCalled=`const tap=()=>{target.click();};const check=()=>tap();check();registerChecks('x',{'x/check':check});`;
  const external=transform(alsoCalled,'external-consumer.js',{registeredCheckEntriesAwaited:true});
  assert.equal(external.interactionSites.length,0);
  assert(external.unsupported.length>0);
});

test('instruments registered dialog and tab actions under the gallery awaited-executor contract',()=>{
  const source=`
const dialog=({root})=>{root.querySelector('[data-open]').click();root.querySelector('[data-close]').click();};
const tabs=({root})=>{root.querySelector('[role=tab]').click();};
registerChecks('interaction',{'overlays/Dialog':dialog,'navigation/Tabs':tabs});
`;
  const result=transform(source,'registered-interactions.js',{registeredCheckEntriesAwaited:true});
  assert.equal(result.unsupported.length,0);
  assert.deepEqual(result.interactionSites.map(site=>site.mappedChecks),[['overlays/Dialog'],['overlays/Dialog'],['navigation/Tabs']]);
});

test('sync telemetry cannot change original action return or exception behavior',async()=>{
  const source=`const target={click(){return 19;}};const tap=()=>{target.click();return 23;};function check(){const result=tap();globalThis.value=result;}check();`;
  const result=transform(source,'return-value.js');
  assert.equal(result.syncUnsupportedSites.length,1);
  const instrumented=await execute(result.source,()=>{throw new Error('telemetry failure');});
  assert.equal(globalThis.value,23);assert.deepEqual(instrumented,[]);
  delete globalThis.value;
});

test('pairs hooks in order across adjacent statements and unbraced else branches',async()=>{
  for(const condition of ['true','false']){
    const source=`async function check(){if(${condition}){target.click();}else target.click();target.click();}await check();`;
    const result=transform(source,'adjacent.js');
    assert.equal(result.unsupported.length,0);
    assert.deepEqual(await execute(result.source),['before:click','click','checkpoint:click','before:click','click','checkpoint:click']);
  }
});

test('awaits a curried action helper through its final checkpoint and assertions',async()=>{
  const source=`const form=name=>()=>{target.click();events.push('submitted:'+name);assert(true);};const check=()=>{form('update-task')();};registerChecks('x',{'x/StatusSelect':check});`;
  const result=transform(source,'curried.js',{registeredCheckEntriesAwaited:true});
  assert.equal(result.unsupported.length,0);
  assert.equal(result.interactionSites.length,1);
  const got=await execute(`${result.source};await check();events.push('returned');`);
  assert.deepEqual(got,['before:click','click','checkpoint:click','submitted:update-task','returned']);
});

test('explicit async domain tail awaits seal capture before helper return or rejection',async()=>{
  for(const branch of ['devtoolsSource','canvasScene'])for(const rejects of [false,true]){
    const source=`
      globalThis.__visualCheckpoint=async()=>{events.push('capture-start');await Promise.resolve();events.push('capture-end');};
      const failure=new Error('helper rejected');
      const devtoolsSource=async()=>{target.click();events.push('helper-complete');${rejects?"throw failure;":"return 23;"}};
      const canvasScene=async()=>{target.click();events.push('helper-complete');${rejects?"throw failure;":"return 29;"}};
      const domain=async({root,actions})=>{
        if(root.querySelector('[data-ws-devtools-source]'))return await devtoolsSource({root,actions});
        if(root.querySelector('[data-ws-canvas-scene]'))return await canvasScene({root,actions});
        throw new Error('wrong branch');
      };
      const root={querySelector:selector=>selector==='[data-ws-${branch==='devtoolsSource'?'devtools-source':'canvas-scene'}]'};
      try{const value=await domain({root,actions:[]});events.push('returned:'+value);}
      catch(error){assert(error===failure);events.push('rejected:'+error.message);}
    `;
    const original=await execute(source),result=transform(source,'domain-tail.js');
    assert.equal(result.unsupported.length,0);
    assert.equal(result.interactionSites.length,2);
    const expected=rejects?'rejected:helper rejected':`returned:${branch==='devtoolsSource'?23:29}`;
    assert.deepEqual(original,['click','helper-complete',expected]);
    const observed=await execute(result.source);
    assert.deepEqual(observed,['before:click','click','capture-start','capture-end','helper-complete',expected]);
    assert.deepEqual(observed.filter(event=>!event.startsWith('before:')&&!event.startsWith('capture-')),original);

    const old=transform(source.replaceAll('return await ','return '),'domain-tail-negative.js');
    assert.equal(old.interactionSites.length,0);
    assert(old.unsupported.some(site=>site.reason.includes('nested or passed as a callback')));
    assert.deepEqual(await execute(old.source),original,'Old tail shape must remain fail-closed, preserving return/rejection behavior');
  }
});

test('devtools normalization pure: actual code tail waits and preserves returned identity or rejection',async()=>{
  const source=await fixtureSource('workspace'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const declaration=ast.body.find(node=>node.type==='VariableDeclaration'&&node.declarations[0].id.name==='code').declarations[0].init;
  const body=source.slice(declaration.start,declaration.end);
  for(const rejects of [false,true]){
    const sentinel={node:true},failure=new Error('controlled rejection'),events=[];
    let release;
    const pending=new Promise((resolve,reject)=>{release=()=>rejects?reject(failure):resolve(sentinel);});
    const code=compileFunction(`return (${body});`,['devtoolsSource'])(()=>{events.push('helper');return pending;});
    const result=code({root:{querySelector:()=>true},actions:[]}).then(value=>{events.push('returned');assert.equal(value,sentinel);},error=>{events.push('rejected');assert.equal(error,failure);});
    assert.deepEqual(events,['helper']);await Promise.resolve();assert.deepEqual(events,['helper']);
    release();await result;assert.deepEqual(events,['helper',rejects?'rejected':'returned']);
  }
});
test('devtools normalization pure: actual WebSocket branch awaits same node before Enter and rejects before key',async()=>{
  const source=await fixtureSource('workspace'),start=source.indexOf("    case 'WebSocketConsole': {"),end=source.indexOf("    case 'GraphQLExplorer':",start);
  assert(start>=0&&end>start);
  const branch=source.slice(start,end),body=branch.slice(branch.indexOf('{')+1,branch.lastIndexOf('break;'));
  assert(body.includes("const draft=await input('[data-dt-socket-draft]','ping')"));
  for(const rejects of [false,true]){
    const events=[],actions=[],node={value:'ping'},log={children:[1,2]},failure=new Error('input rejected');let release;
    const pending=new Promise((resolve,reject)=>{release=()=>rejects?reject(failure):resolve(node);});
    const input=(selector,value)=>{assert.equal(selector,'[data-dt-socket-draft]');assert.equal(value,'ping');events.push('input');return pending;};
    const key=(actual,value)=>{assert.equal(actual,node);assert.equal(value,'Enter');events.push('key');actual.value='';actions.push({action:'send-socket',text:'ping'});return false;};
    const one=(_root,selector)=>selector==='[data-dt-socket-log]'?log:selector==='[data-dt-socket-toggle]'?{click(){events.push('toggle');actions.push({action:'toggle-socket',state:'open'});}}:assert.fail(selector);
    const run=compileFunction(`return (async()=>{${body}})();`,['one','root','actions','input','key','assert']);
    const result=run(one,{},actions,input,key,assert);
    assert.deepEqual(events,['input']);await Promise.resolve();assert.deepEqual(events,['input']);
    release();
    if(rejects){await assert.rejects(result,error=>error===failure);assert.deepEqual(events,['input']);assert.deepEqual(actions,[]);}
    else{await result;assert.deepEqual(events,['input','key','toggle']);assert.equal(node.value,'');assert.equal(log.children.length,2);}
  }
});
test('devtools normalization pure: transformed capture completes before returned node is used and old shapes block',async()=>{
  for(const rejects of [false,true]){
    const source=`
      const failure=new Error('capture rejected');
      globalThis.__visualCheckpoint=async()=>{events.push('capture-start');await Promise.resolve();events.push('capture-end');${rejects?'throw failure;':''}};
      const node={dispatchEvent(){events.push('input');return false;}};
      const input=()=>{node.dispatchEvent(new Event('input'));return node;};
      const key=(actual,value)=>{assert(actual===node&&value==='Enter');events.push('key-same-node');return false;};
      const devtoolsSource=async()=>{const draft=await input();events.push('node-returned');key(draft,'Enter');return draft;};
      const code=async()=>{return await devtoolsSource();};
      try{const result=await code();assert(result===node);events.push('complete');}catch(error){assert(error===failure);events.push('rejected');}
    `;
    const transformed=transform(source,'devtools-normalization.js');assert.equal(transformed.unsupported.length,0);assert.equal(transformed.interactionSites.length,1);
    const actual=await execute(transformed.source);
    assert.deepEqual(actual,rejects?['before:dispatchEvent','input','capture-start','capture-end','rejected']:['before:dispatchEvent','input','capture-start','capture-end','node-returned','key-same-node','complete']);
    for(const old of [source.replace('const draft=await input()','const draft=input()'),source.replace('return await devtoolsSource()','return devtoolsSource()')])assert(transform(old,'devtools-old.js').unsupported.some(site=>site.siteId),'Old nested shapes remain fail-closed');
  }
});
test('devtools remaining tails pure: exact four callers and six awaited tails retain all other source bytes',async()=>{
  const source=await fixtureSource('workspace'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),nodes=[],parents=new Map();
  const visit=(node,parent)=>{
    if(!node||typeof node!=='object')return;
    if(node.type){nodes.push(node);parents.set(node,parent);}
    for(const value of Object.values(node)){
      if(Array.isArray(value)){for(const child of value)visit(child,node);}
      else if(value&&typeof value==='object')visit(value,node);
    }
  };
  visit(ast,null);
  const declarations=ast.body.filter(node=>node.type==='VariableDeclaration').flatMap(node=>node.declarations);
  const calls=nodes.filter(node=>node.type==='CallExpression'&&node.callee.type==='Identifier'&&node.callee.name==='devtoolsSource');
  assert.equal(calls.length,4);
  assert.deepEqual(calls.map(call=>declarations.find(declaration=>declaration.init?.start<call.start&&declaration.init?.end>call.end)?.id.name),['code','filesDevtools','request','domain']);
  for(const call of calls){assert.equal(parents.get(call).type,'AwaitExpression');assert.equal(parents.get(parents.get(call)).type,'ReturnStatement');assert.equal(source.slice(call.start,call.end),'devtoolsSource({root,actions})');}
  assert.equal((source.match(/return await (?:devtoolsSource|canvasScene)\(/g)||[]).length,6);
  let previous=source;
  for(const name of ['request','filesDevtools']){
    const fn=declarations.find(declaration=>declaration.id.name===name).init,first=fn.body.body[0];
    assert.equal(fn.async,true);assert.equal(first.type,'IfStatement');assert.equal(first.consequent.type,'ReturnStatement');assert.equal(first.consequent.argument.type,'AwaitExpression');
    const at=first.consequent.argument.start;assert.equal(source.slice(at,at+6),'await ');
    previous=previous.slice(0,at)+previous.slice(at+6);
  }
  assert.equal(transform(previous,'workspace-prior.js').originalSHA,'5ac03d6f62b8d99373d0a214cf739a3eb4b60121ca6bc3fe2cfdad7dd55d5942','Reversing only two awaits must restore the exact prior module, including every legacy branch byte');
});
test('devtools remaining tails pure: actual routes preserve delayed result and rejection identity',async()=>{
  const source=await fixtureSource('workspace'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  for(const name of ['filesDevtools','request'])for(const rejects of [false,true]){
    const fn=ast.body.find(node=>node.type==='VariableDeclaration'&&node.declarations[0].id.name===name).declarations[0].init;
    const sentinel={name},failure=new Error(name),events=[],root={querySelector:selector=>{assert.equal(selector,'[data-ws-devtools-source]');return true;}},actions=[];let release;
    const pending=new Promise((resolve,reject)=>{release=()=>rejects?reject(failure):resolve(sentinel);});
    const route=compileFunction(`return (${source.slice(fn.start,fn.end)});`,['devtoolsSource'])(context=>{assert.equal(context.root,root);assert.equal(context.actions,actions);events.push('helper');return pending;});
    const result=route({root,actions}).then(value=>{assert.equal(value,sentinel);events.push('returned');},error=>{assert.equal(error,failure);events.push('rejected');});
    await Promise.resolve();assert.deepEqual(events,['helper']);release();await result;
    assert.deepEqual(events,['helper',rejects?'rejected':'returned']);
  }
});
test('devtools remaining tails pure: absent host keeps actual legacy branch and error identity',async()=>{
  const source=await fixtureSource('workspace'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  for(const name of ['filesDevtools','request']){
    const fn=ast.body.find(node=>node.type==='VariableDeclaration'&&node.declarations[0].id.name===name).declarations[0].init;
    const current=source.slice(fn.start,fn.end),old=current.replace('return await devtoolsSource({root,actions});','return devtoolsSource({root,actions});');
    const events=[],failure=new Error('legacy '+name),dataset={};Object.defineProperty(dataset,'elyKind',{get(){events.push('legacy');throw failure;}});
    const root={dataset,querySelector:selector=>{assert.equal(selector,'[data-ws-devtools-source]');events.push('absent-host');return false;}};
    for(const body of [old,current]){
      events.length=0;
      const route=compileFunction(`return (${body});`,['devtoolsSource'])(()=>assert.fail('Absent source host must not delegate'));
      await assert.rejects(()=>route({root,actions:[]}),error=>error===failure);
      assert.deepEqual(events,['absent-host','legacy']);
    }
  }
});
test('devtools remaining tails pure: each awaited route seals capture and each old tail stays unsupported',async()=>{
  for(const name of ['filesDevtools','request'])for(const rejects of [false,true]){
    const source=`
      const sentinel={},failure=new Error('helper rejected');
      globalThis.__visualCheckpoint=async()=>{events.push('capture-start');await Promise.resolve();events.push('capture-end');};
      const devtoolsSource=async()=>{target.click();events.push('helper-complete');${rejects?'throw failure;':'return sentinel;'}};
      const ${name}=async({root,actions})=>{if(root.querySelector('[data-ws-devtools-source]'))return await devtoolsSource({root,actions});};
      const root={querySelector:()=>true};
      try{const result=await ${name}({root,actions:[]});assert(result===sentinel);events.push('returned');}catch(error){assert(error===failure);events.push('rejected');}
    `;
    const original=await execute(source),result=transform(source,name+'-awaited.js');
    assert.equal(result.unsupported.length,0);assert.equal(result.interactionSites.length,1);
    assert.deepEqual(await execute(result.source),['before:click','click','capture-start','capture-end','helper-complete',rejects?'rejected':'returned']);
    const old=transform(source.replace('return await devtoolsSource','return devtoolsSource'),name+'-old.js');
    assert.equal(old.interactionSites.length,0);assert(old.unsupported.some(site=>site.siteId));assert.deepEqual(await execute(old.source),original);
  }
});
test('workspace all four devtools callers and canvas keep exactly six explicit async source tail awaits',async()=>{
  const source=await readFile(new URL('../../../../internal/gallery/assets/advanced-workspace-checks.js',import.meta.url),'utf8');
  const domain=source.slice(source.indexOf('const domain = async '),source.indexOf('const domain = async ')+350);
  assert.match(domain,/return await devtoolsSource\(\{root,actions\}\);/);
  assert.match(domain,/return await canvasScene\(\{root,actions\}\);/);
  assert.equal((source.match(/return await (?:devtoolsSource|canvasScene)\(/g)||[]).length,6);
  assert.match(source,/const canvas = async [\s\S]*?return await canvasScene\(\{root,actions\}\);/);
  assert.match(source,/const code = async [\s\S]*?return await devtoolsSource\(\{root,actions\}\);/);
});

test('braces eligible unbraced for, for-of, for-in, while and do loops without moving actions',async()=>{
  for(const loop of ['for(let i=0;i<2;i++)target.click();','for(const item of [1,2])target.click();','for(const key in {a:1,b:2})target.click();','let n=0;while(n++<2)target.click();','let n=0;do target.click();while(++n<2);']){
    const source=`function check(){${loop}events.push('after');}check();`;
    const result=transform(source,'loop.js');
    assert.equal(result.unsupported.length,0);
    assert.deepEqual(await execute(result.source),['before:click','click','checkpoint:click','before:click','click','checkpoint:click','after']);
    assert.deepEqual(await execute(source),['click','click','after']);
  }
});
test('loop bracing preserves lexical loop variables and dangling else scopes',async()=>{
  for(const body of ["for(const target of [globalThis.target,globalThis.target])target.click();","if(false)for(const target of [globalThis.target])target.click();else target.click();","if(true)for(const target of [globalThis.target])if(false)target.click();else target.click();else assert(false);"]){
    const source=`function check(){${body}events.push('after');}check();`;
    const transformed=transform(source,'dangling.js');assert.equal(transformed.unsupported.length,0);
    const original=await execute(source),actual=await execute(transformed.source);
    assert.deepEqual(actual.filter(event=>!event.startsWith('before:')&&!event.startsWith('checkpoint:')),original);
  }
  const blocked=`const tap=()=>{for(const target of [globalThis.target,globalThis.target])target.click();return 7;};const value=tap();assert(value===7);`;
  const transformed=transform(blocked,'blocked-loop.js');assert.equal(transformed.interactionSites.length,0);
  assert.deepEqual(await execute(transformed.source),['click','click']);
});
test('connected native mask and forms checklist loop sites remain checkpointable',async()=>{
  for(const family of ['native','forms']){
    const source=await fixtureSource(family),result=transform(source,`${family}.js`,{registeredCheckEntriesAwaited:true});
    const line=family==='native'?39:125;
    assert(result.interactionSites.some(site=>site.line===line),`${family} actual loop interaction must be safe`);
    assert(!result.unsupported.some(site=>site.line===line&&site.reason==='unbraced-loop-body-preserved'));
  }
});

const fixtureSource=family=>readFile(new URL(`../../../../internal/gallery/assets/advanced-${family}-checks.js`,import.meta.url),'utf8');
test('websocket direct pure: only canonical source-backed identity has twelve separate direct steps',()=>{
  const contract=requestedStateContract('devtools/WebSocketConsole');
  assert.equal(contract.identity,'devtools/WebSocketConsole');assert.equal(contract.kind,'WebSocketConsole');assert.equal(contract.requestedStateOnly,true);
  assert.equal(contract.focusedSequence,'websocket-public-host-boundary');
  assert.deepEqual(contract.steps.map(step=>step.id),['empty-enter','type-ping','send-enter','type-pong','send-button','request-disconnect','host-ack-closed','type-closed-draft','closed-enter','clear-closed-draft','request-connect','host-ack-open']);
  assert(contract.steps.filter(step=>step.id.startsWith('host-ack-')).every(step=>step.event.startsWith('synthetic controlled host acknowledgement')));
  assert(contract.steps.every(step=>step.source.sourceAnchor===null&&step.source.provenance.includes('no registered-site or networking approval')));
  for(const identity of ['devtools/WebSocket','devtools/WebSocketConsoleExtra','devtools/SocketConsole','devtools/ConnectionManager','devtools/ResponseViewer'])assert.equal(requestedStateContract(identity),null);
});
test('websocket direct pure: actual sequence preserves drafts messages native ordering and rerender ownership',async()=>{
  const full=runRequestedStateActions.toString(),start=full.indexOf("    if(contract.focusedSequence==='websocket-public-host-boundary'){"),end=full.indexOf("    if(['sheet-native-actions'",start);
  assert(start>=0&&end>start);const branch=full.slice(start,end);
  const labels=['empty-enter','type-ping','send-enter','type-pong','send-button','request-disconnect','host-ack-closed','type-closed-draft','closed-enter','clear-closed-draft','request-connect','host-ack-open'];
  const run=async defect=>{
    const url='wss://stream.example.com/orders',identity='devtools/WebSocketConsole',id='socket-main';
    const rows=[['ⓘ',`Connected to ${url}`,'10m'],['↗',JSON.stringify({type:'subscribe',channel:'orders'},null,2),'10m'],['↙',JSON.stringify({type:'order',id:1011,total:42.5},null,2),'2m']];
    const state={state:'open',draft:'',rows,revision:0},timeline=[],actions=[],receipts=[];let cursor=0,cleaned=false,initialized=false;
    const snapshot=()=>({state:state.state,url,draft:state.draft,sendDisabled:defect==='enabled-closed'&&state.state==='closed'?false:state.state!=='open'||!state.draft.trim(),toggleDisabled:false,toggle:state.state==='open'?'Disconnect':'Connect',rows:structuredClone(state.rows),model:defect==='model-drift'&&actions.length?'changed model':'original fixture model'});
    const native=(type,key=null,control='draft')=>timeline.push({type,key,control,value:state.draft,trusted:defect!=='untrusted'});
    const emit=detail=>{
      detail={...detail,id,component:identity};
      if(defect==='wrong-url')detail.url='wss://foreign.example';
      if(defect==='wrong-id')detail.id='foreign';
      if(defect==='wrong-component')detail.component='devtools/Other';
      if(defect==='wrong-text'&&detail.action==='send-socket')detail.text='wrong';
      if(defect==='wrong-state'&&detail.action==='toggle-socket')detail.state='opening';
      const event={type:'ely:action',detail};actions.push(event);
      if(defect==='reordered')timeline.unshift(event);else timeline.push(event);
      if(defect==='duplicate'){actions.push(event);timeline.push(event);}
    };
    const send=()=>{if(state.state==='open'&&state.draft.trim()){emit({action:'send-socket',text:state.draft,url});if(defect!=='uncleared')state.draft='';if(defect==='fabricated')state.rows.push(['↗','new','now']);if(defect==='reordered-messages')state.rows.reverse();if(defect==='altered-message')state.rows[0][1]='changed';}};
    const root={evaluate:async(fn,arg)=>{
      const text=fn.toString();
      if(text.includes('const host=node.querySelector'))return snapshot();
      if(text.includes('node.__visualSocketNative=[]')){initialized=true;return;}
      if(text.includes('node.removeEventListener')){cleaned=true;return;}
      if(text.includes("node.dispatchEvent(new CustomEvent('ely:result'")){
        timeline.push({type:'ely:result',trusted:false,root:defect!=='foreign-host-root',action:'toggle-socket',state:arg});
        if(defect!=='ignored-host'){state.state=arg;state.revision++;}return true;
      }
      if(text.includes('node.__visualSocketTwinEvents'))return defect==='twin-event'&&state.revision?['ely:result']:[];
      if(text.includes('node.__visualSocketNative'))return timeline;
      assert.fail('Unmodelled root evaluation: '+text);
    },locator:selector=>{
      const revision=state.revision;
      const current=()=>assert.equal(revision,state.revision,'A stale control survived host rerender');
      return {pressSequentially:async value=>{current();for(const character of value){native('keydown',character);state.draft+=character;native('input');native('keyup',character);}},
        press:async key=>{current();native('keydown',key);if(key==='Enter'){send();if(defect==='cleared-closed'&&state.state==='closed')state.draft='';}else if(key==='Backspace'){state.draft='';native('input');}native('keyup',key);},
        click:async()=>{current();const control=selector.includes('socket-send')?'send':'toggle';native('click',null,control);if(control==='send')send();else{emit({action:'toggle-socket',state:state.state,url});if(defect==='optimistic')state.state=state.state==='open'?'closed':'open';}},
      };
    }};
    const begin=async()=>{cursor=actions.length;};
    const fresh=async()=>{assert.notEqual(defect==='twin-html'&&state.revision>0,true,'Independent twin drift');return actions.slice(cursor);};
    const runStep=async(label,action,verify)=>{assert.equal(label,labels[receipts.length]);const before=snapshot();await action();const result=await verify();receipts.push({label,before,after:snapshot(),result});};
    const executeBranch=compileFunction(`return (async()=>{${branch}})();`,['contract','root','runStep','begin','fresh','id','identity','assert','clickVisibleControl']);
    try{await executeBranch(requestedStateContract(identity),root,runStep,begin,fresh,id,identity,assert,async control=>control.click());}
    finally{if(initialized)assert.equal(cleaned,true,'Observers must be removed on success or rejection');}
    assert.deepEqual(receipts.map(receipt=>receipt.label),labels);assert.equal(state.revision,2);
    assert.equal(receipts[8].after.draft,'queued');assert.equal(receipts[6].after.state,'closed');assert.equal(receipts[11].after.state,'open');
    assert.deepEqual(actions.map(event=>event.detail.action),['send-socket','send-socket','toggle-socket','toggle-socket']);
  };
  await run(null);
  for(const defect of ['wrong-url','wrong-id','wrong-component','wrong-text','wrong-state','duplicate','reordered','untrusted','uncleared','fabricated','reordered-messages','altered-message','model-drift','enabled-closed','optimistic','foreign-host-root','ignored-host','cleared-closed','twin-event','twin-html'])await assert.rejects(()=>run(defect),defect);
});
test('registered canvas pure: exact eight identities map only two ordered scene sites',async()=>{
  const source=await fixtureSource('workspace');
  const identities=['InfiniteCanvas','CanvasGrid','Guides','Ruler','ArtboardFrame','ZoomControls','ZoomIndicator','MiniMap'].map(name=>`canvas/${name}`);
  for(const identity of identities){
    const contract=caseActionContract(identity,source,'workspace.js');
    assert.equal(contract.identity,identity);assert.equal(contract.kind,'InfiniteCanvas');assert.equal(contract.entry,'canvas');
    assert.equal(contract.registeredCanvas,true);assert.deepEqual(contract.mappingGaps,[]);
    assert.deepEqual(contract.steps.map(step=>[step.id,step.source.owner,step.source.controlSelector,step.source.method,step.source.event]),[
      ['zoom-in','canvasScene','[data-cs-zoom-in]','click','click'],['minimap-arrow-right','canvasScene','[data-cs-minimap]','dispatchEvent','keydown'],
    ]);
    assert(contract.steps.every(step=>step.source.sourceAnchor.text&&step.source.unknownGuards.length===0));
    assert.equal(new Set(contract.steps.map(step=>step.source.siteId)).size,2);
    assert.deepEqual(requestedStateContract(identity).steps.map(step=>step.id),['zoom-in','fit-canvas','navigate-minimap']);
    assert.equal(requestedStateContract(identity).requestedStateOnly,true);
  }
  for(const identity of ['canvas/Unknown','editor/MiniMap','canvas/InfiniteCanvasExtra','canvas/FlowChart'])assert.equal(caseActionContract(identity,source,'workspace.js'),null);
});
test('registered canvas pure: extra missing reordered and unknown actions remain blocked',async()=>{
  const source=await fixtureSource('workspace'),start=source.indexOf("  if(kind==='InfiniteCanvas'){"),end=source.indexOf("  if(kind==='MindMap'){",start);
  const prefix=source.slice(0,start),branch=source.slice(start,end),suffix=source.slice(end);
  const zoom="one(root,'[data-cs-zoom-in]').click();",arrow="one(root,'[data-cs-minimap]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));";
  assert(branch.includes(zoom)&&branch.includes(arrow));
  for(const changed of [branch.replace(zoom,zoom+zoom),branch.replace(arrow,''),branch.replace(zoom,'').replace(arrow,arrow+zoom),branch.replace(zoom,'if(unknown)return;'+zoom),branch.replace(zoom,'if(unknown){'+zoom+'}')]){
    const contract=caseActionContract('canvas/InfiniteCanvas',prefix+changed+suffix,'workspace.js');
    assert(contract.mappingGaps.length>0,'Reachable extra/missing/reordered/unknown sites cannot be promoted');
  }
  const untouched=caseActionContract('canvas/InfiniteCanvas',source.replace("if(kind==='MindMap'){","if(kind==='MindMap'){extra.click();"),'workspace.js');
  assert.deepEqual(untouched.mappingGaps,[],'A proven unreachable sibling must not add sites');
});
test('registered canvas pure: viewport oracle rejects wrong direction zoom payload and clipping basis',()=>{
  const before={stage:{width:820,height:460},view:{x:-60,y:-60,zoom:.7}};
  const zoom={x:-60+410/.7-410/.75,y:-60+230/.7-230/.75,zoom:.75};
  const after={stage:before.stage,view:zoom},detail={action:'change-viewport',view:zoom};
  assert.deepEqual(assertRegisteredCanvasTransition('zoom-in',before,after,detail),zoom);
  const right={...zoom,x:zoom.x+40/.75};
  assert.deepEqual(assertRegisteredCanvasTransition('minimap-arrow-right',after,{stage:before.stage,view:right},{action:'change-viewport',view:right}),right);
  for(const wrong of [{...right,x:zoom.x-40/.75},{...right,zoom:1},{...right,y:right.y+1}])assert.throws(()=>assertRegisteredCanvasTransition('minimap-arrow-right',after,{stage:before.stage,view:wrong},{action:'change-viewport',view:wrong}));
  assert.throws(()=>assertRegisteredCanvasTransition('zoom-in',before,after,{action:'change-viewport',scene:{view:zoom}}),'The public payload is view, not an invented scene wrapper');
  assert.throws(()=>assertRegisteredCanvasTransition('zoom-in',before,{stage:{width:390,height:460},view:zoom},detail));
  assert.throws(()=>assertRegisteredCanvasTransition('fit-canvas',before,after,detail));
});
test('registered canvas pure: direct dispatch remains fresh native and separate from supplement',async()=>{
  const driver=runRegisteredCanvasActions.toString(),runner=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url),'utf8');
  assert(driver.includes("view:{zoom:.7,x:-60,y:-60}"));
  assert(driver.includes("['zoom-in','minimap-arrow-right']"));
  assert(driver.includes("await map.focus();await map.press('ArrowRight')"));
  assert(driver.includes("clickVisibleControl(root.locator('[data-cs-zoom-in]'))"));
  assert(driver.includes('trusted:true'));assert(driver.includes('assert.equal(events.length,1)'));
  assert(!driver.includes("runStep('fit-canvas'"));assert(!driver.includes('dispatchEvent('));
  assert(runner.includes('await runRegisteredCanvasActions(contract,root,step)'));
  for(const veto of ['unknownReached.length>0','unexpectedRuntimeOccurrences.length>0','missingRuntimeOccurrences.length>0','directFallback?.status'])assert(runner.includes(veto));
});
test('registered canvas pure: awaited entry preserves return rejection and capture order',async()=>{
  for(const rejects of [false,true]){
    const source=`
      globalThis.__visualCheckpoint=async()=>{events.push('capture-start');await Promise.resolve();events.push('capture-end');};
      const failure=new Error('canvas failed');
      const canvasScene=async()=>{target.click();events.push('helper-complete');${rejects?'throw failure;':'return 29;'}};
      const canvas=async({root,actions})=>{if(root.querySelector('[data-ws-canvas-scene]'))return await canvasScene({root,actions});};
      const root={querySelector:()=>true};
      try{events.push('returned:'+await canvas({root,actions:[]}));}catch(error){assert(error===failure);events.push('rejected');}
    `;
    const original=await execute(source),result=transform(source,'canvas-tail.js');
    assert.equal(result.unsupported.length,0);assert.equal(result.interactionSites.length,1);
    assert.deepEqual(await execute(result.source),['before:click','click','capture-start','capture-end','helper-complete',rejects?'rejected':'returned:29']);
    assert.deepEqual(original,['click','helper-complete',rejects?'rejected':'returned:29']);
    const old=transform(source.replace('return await canvasScene','return canvasScene'),'canvas-tail-old.js');
    assert.equal(old.interactionSites.length,0);assert(old.unsupported.length>0);
    assert.deepEqual(await execute(old.source),original);
  }
});
test('switch literal flow pure: selected unique literal break preserves after-switch action',()=>{
  for(const body of ["first.click();break;","{first.click();break;}"]){
    const result=returnFlowSites(`switch(selected){case 'true':wrong.click();break;case true:${body}default:other.click();}later.click();`);
    assert.deepEqual(returnFlowControls(result),['first','later']);assert.deepEqual(result.mappingGaps,[]);
  }
});
test('switch literal flow pure: unknown dynamic duplicate and fallthrough stay blocked',()=>{
  for(const body of [
    'switch(unknown){case true:return;}target.click();',
    'switch(selected){case dynamic:break;case true:first.click();break;}target.click();',
    'switch(selected){case true:first.click();break;case true:second.click();break;}target.click();',
    'switch(selected){case true:first.click();case false:second.click();break;}target.click();',
    'switch(selected){case true:first.click();if(selected)break;}target.click();',
    'outer:{switch(selected){case true:first.click();break outer;}}target.click();',
  ]){
    const result=returnFlowSites(body);
    assert(result.mappingGaps.some(gap=>gap.reason==='conservative-control-flow-boundary'&&gap.boundary==='SwitchStatement'),body);
    assert(returnFlowControls(result).includes('target'),body);
  }
});
test('switch literal flow pure: terminal break cannot hide prefix abrupt completion',()=>{
  for(const prefix of ['return;','throw failure;','if(unknown)return;','while(unknown){break;}']){
    for(const body of [`switch(selected){case true:${prefix}break;}target.click();`,`switch(selected){case true:{${prefix}break;}}target.click();`]){
      const result=returnFlowSites(body);
      assert(result.mappingGaps.some(gap=>gap.reason==='conservative-control-flow-boundary'&&gap.boundary==='SwitchStatement'),body);
      assert(returnFlowControls(result).includes('target'),'Conservative suffix enumeration is not reachability proof');
    }
  }
  for(const prefix of ['while(unknown){}','try{}finally{}','label:{}']){
    const result=returnFlowSites(`switch(selected){case true:${prefix}break;}target.click();`);
    assert(result.mappingGaps.some(gap=>gap.reason==='conservative-control-flow-boundary'),'Selected case cannot waive a nested boundary gap');
  }
});
test('switch literal flow pure: ArchiveViewer exact sites reject unknown kind extra and missing actions',async t=>{
  const source=await fixtureSource('workspace'),contract=caseActionContract('files/ArchiveViewer',source,'workspace.js');
  assert.deepEqual(contract.mappingGaps,[]);
  assert.deepEqual(contract.steps.map(step=>[step.source.owner,step.source.method,step.source.event]),[['domain','click','click'],['domain','dispatchEvent','keydown']]);
  const oldMutation=caseActionContract('files/ArchiveViewer',source.replace('switch(kind)','switch(unreviewedKind)'),'workspace.js');
  assert.deepEqual(oldMutation.mappingGaps,[],'The previous mutation changed the unreachable devtoolsSource switch, not the ArchiveViewer domain switch');
  const domainStart=source.indexOf('const domain = async ');assert(domainStart>=0);
  const domain=source.slice(domainStart);assert.equal(domain.split('switch(kind)').length,2);
  const changedDomain=domain.replace('switch(kind)','switch(unreviewedKind)');
  const changedSource=source.slice(0,domainStart)+changedDomain;
  assert.equal(changedSource.replace('switch(unreviewedKind)','switch(kind)'),source,'Only the selected domain discriminant may change');
  const unknown=caseActionContract('files/ArchiveViewer',changedSource,'workspace.js');
  t.diagnostic(JSON.stringify({previousUnreachableMutationGaps:oldMutation.mappingGaps,selectedDomainMutationGaps:unknown.mappingGaps}));
  assert(unknown.mappingGaps.some(gap=>gap.reason==='conservative-control-flow-boundary'&&gap.boundary==='SwitchStatement'&&gap.line===418),JSON.stringify(unknown.mappingGaps));
  for(const changed of [source.replace('folder.click();','folder.click();folder.click();'),source.replace('folder.click();','')])assert(caseActionContract('files/ArchiveViewer',changed,'workspace.js').mappingGaps.length>0);
});
test('maps only ArchiveViewer branch and called helpers; rejects new or missing exact actions',async()=>{
  const source=await fixtureSource('workspace');
  const contract=caseActionContract('files/ArchiveViewer',source,'workspace.js');
  assert.deepEqual(contract.mappingGaps,[]);
  assert.equal(contract.steps.length,2);
  assert(contract.steps.every(step=>step.source.owner==='domain'));
  const extra=caseActionContract('files/ArchiveViewer',source.replace('folder.click();','folder.click();folder.click();'),'workspace.js');
  assert(extra.mappingGaps.some(gap=>gap.reason==='exact-action-count-changed'));
  const other=caseActionContract('files/ArchiveViewer',source.replace('start.click();','start.click();start.click();'),'workspace.js');
  assert.deepEqual(other.mappingGaps,[],'Unselected RenameInline branch cannot add ArchiveViewer actions');
});
test('CodeEditor alias contracts preserve exact branches, invocation order and public identity',async()=>{
  const source=await fixtureSource('workspace');
  const catalogue=JSON.parse(await readFile(new URL('../../components.json',import.meta.url),'utf8'));
  const story=catalogue.pages.find(page=>page.slug==='editor').stories.find(story=>story.name==='CodeEditor');
  const names=[...new Set([story.name,...story.components])];assert.equal(names.length,16);
  const canonical=caseActionContract('editor/CodeEditor',source,'workspace.js');
  for(const name of names){
    const identity=`editor/${name}`,contract=caseActionContract(identity,source,'workspace.js');
    if(name==='MiniMap'){assert.equal(contract,null,'Distinct read-only MiniMap is not an editable CodeEditor contract');continue;}
    assert.equal(contract.identity,identity);assert.equal(contract.fixtureGuards.component,identity);
    assert.equal(contract.fixtureGuards.requiredEditor,true);assert.equal(contract.kind,'CodeEditor');
    assert.deepEqual(contract.mappingGaps,[]);assert.deepEqual(contract.steps,canonical.steps);
    const changed=caseActionContract(identity,source.replace("root.dataset.elyKind==='CodeEditor'","root.dataset.unreviewedKind==='CodeEditor'"),'workspace.js');
    assert(changed.mappingGaps.length,'Unknown guard cannot inherit equivalence');
  }
  assert.equal(caseActionContract('editor/NotAnAlias',source,'workspace.js'),null);
  assert.match(source,/make\(\['editor\/CodeEditor','devtools\/QueryEditor'\], code\)/);
  const runtime=await readFile(new URL('../../assets/ely-api.js',import.meta.url),'utf8');
  assert.match(runtime,/detail: \{ \.\.\.detail, id: root.id, component: root.dataset.elyComponent, action \}/);
  const actions=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url),'utf8');
  assert.match(actions,/assert.equal\(event.component,contract.identity,/);
  assert.match(actions,/assert.equal\(event.id,await root.getAttribute\('id'\),/);
});
test('password fixture fact pure: name resolves only the documented field branch',async()=>{
  const source=await fixtureSource('forms'),contract=caseActionContract('forms/PasswordInput',source,'forms.js');
  assert.deepEqual(contract.mappingGaps,[]);assert.equal(contract.fixtureGuards.passwordInputName,'caller_value');
  assert.deepEqual(contract.steps.map(step=>step.source.event),['input','change','click']);
  const facts={node:{tagName:'INPUT',type:'password'},root:{dataset:{elyComponent:'forms/PasswordInput'}}};
  const missing=resolveCaseActionSites(source,'forms.js',{entry:'forms/PasswordInput',facts});
  assert(missing.mappingGaps.some(gap=>gap.reason==='unresolved-control-flow-guard'&&gap.guard==='node.name'));
  const empty=resolveCaseActionSites(source,'forms.js',{entry:'forms/PasswordInput',facts:{...facts,node:{...facts.node,name:''}}});
  assert.deepEqual(empty.mappingGaps,[],'Explicit empty name selects the no-FormData branch, unlike unknown name');
  assert.equal(caseActionContract('editor/CodeEditor',await fixtureSource('workspace'),'workspace.js').fixtureGuards.passwordInputName,undefined);
  const changed=caseActionContract('forms/PasswordInput',source.replace("node.dispatchEvent(new Event('change',{bubbles:true}));};","};"),'forms.js');
  assert(changed.mappingGaps.length>0);
  const extra=caseActionContract('forms/PasswordInput',source.replace("node.dispatchEvent(new Event('change',{bubbles:true}));};","node.dispatchEvent(new Event('change',{bubbles:true}));node.click();};"),'forms.js');
  assert(extra.mappingGaps.length>0);
  const reordered=caseActionContract('forms/PasswordInput',source.replace("node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));","node.dispatchEvent(new Event('change',{bubbles:true}));node.dispatchEvent(new Event('input',{bubbles:true}));"),'forms.js');
  assert(reordered.mappingGaps.length>0);
});
test('password fixture fact pure: actual DOM name guard rejects mismatch before dispatch',async()=>{
  const source=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url),'utf8');
  const guard=source.split('\n').find(line=>line.includes("if(contract.fixtureGuards.passwordInputName)"));assert(guard);
  assert(source.indexOf(guard)<source.indexOf("globalThis.__visualDirectActions = []"));
  const contract={fixtureGuards:{passwordInputName:'caller_value'}};
  for(const name of ['caller_value','wrong','',null]){
    let dispatched=false;
    const root={locator:selector=>{assert.equal(selector,'input:not([type=hidden])');return {getAttribute:async key=>{assert.equal(key,'name');return name;}};}};
    const run=compileFunction(`return (async()=>{${guard}\ndispatch();})();`,['assert','contract','root','dispatch']);
    const pending=()=>run(assert,contract,root,()=>{dispatched=true;});
    if(name==='caller_value'){await pending();assert.equal(dispatched,true);}else{await assert.rejects(pending);assert.equal(dispatched,false);}
  }
});
test('maps both synchronous editor submissions and both password helper events exactly',async()=>{
  const editor=caseActionContract('editor/CodeEditor',await fixtureSource('workspace'),'workspace.js');
  const password=caseActionContract('forms/PasswordInput',await fixtureSource('forms'),'forms.js');
  assert.deepEqual(editor.mappingGaps,[]);assert.equal(editor.steps.length,11);
  assert.equal(editor.steps.filter(step=>step.source.owner==='submitData').length,2);
  assert.equal(editor.steps[5].source.siteId,editor.steps[8].source.siteId,'One helper site has two expected invocations');
  assert.deepEqual(password.mappingGaps,[]);assert.deepEqual(password.steps.map(step=>step.source.event),['input','change','click']);
  const changed=caseActionContract('forms/PasswordInput',(await fixtureSource('forms')).replace("node.dispatchEvent(new Event('change',{bubbles:true}));};","};"),'forms.js');
  assert(changed.mappingGaps.length>0,'Removing a helper event must leave a mapping gap');
});
test('unknown guards are mapping gaps; target aliases require their actual panel/toggle contracts',async()=>{
  const source=(await fixtureSource('workspace')).replace("root.dataset.elyKind==='CodeEditor'","root.dataset.unreviewedKind==='CodeEditor'");
  assert(caseActionContract('editor/CodeEditor',source,'workspace.js').mappingGaps.some(gap=>gap.reason==='unresolved-action-guard'));
  for(const [name,index] of [['KeyboardShortcutsList',1],['ProxySettings',2],['PrivacySettings',3],['NotificationSettings',4],['StartupSettings',5],['StorageSettings',6],['ResetToDefault',6],['AdvancedSettings',7],['DeveloperMode Toggle',7]]){
    const contract=requestedStateContract(`settings/${name}`);assert.equal(contract.target[0],index);assert.equal(contract.requestedStateOnly,true);
    assert(contract.steps.some(step=>step.id==='open-target-section'));
    if(contract.target[2])assert(contract.steps.some(step=>step.id==='toggle-target'));
  }
  assert.equal(requestedStateContract('maps/MapPopup').steps[0].id,'open-popup');
  assert.equal(requestedStateContract('settings/UnreviewedAlias'),null);
});
test('inventory hashes describe consumed initial bytes and detect later matrix/coverage drift',async()=>{
  const dir=await mkdtemp(join(tmpdir(),'elysdui-inventory-'));
  try{for(const name of ['matrix.json','coverage.json']){
    const path=join(dir,name);await writeFile(path,'{"value":1}');
    const initial=await inventoryReceipt(path);assert.equal(initial.data.value,1);
    assert.equal((await inventoryDrift(initial)).stable,true);
    await writeFile(path,'{"value":2}');const drift=await inventoryDrift(initial);
    assert.equal(initial.data.value,1);assert.equal(drift.initialSHA256,initial.sha256);assert.equal(drift.stable,false);assert.notEqual(drift.endingSHA256,initial.sha256);
  }}finally{await rm(dir,{recursive:true,force:true});}
});
test('real browser excludes twin/foreign portals, captures painted overflow, and retains unhandled errors',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:600,height:400},deviceScaleFactor:1});
    await page.setContent(`<style>body{margin:0}[role=menu]{width:30px;height:20px}#paint{position:absolute;left:10px;top:10px;width:120px;height:30px}#paint>span{display:block;width:195px;height:58px;background:red}</style>
      <article data-audit-name="fixture"><div id="main" data-ely-family="workspace"><button aria-controls="own foreign">Open</button></div><div id="twin" data-ely-family="workspace"><button aria-controls="twin-portal">Twin</button><div id="twin-panel" role="menu">Twin menu</div></div></article>
      <div id="own" role="menu" data-ely-owner="main">Own</div><div id="foreign" role="menu" data-ely-owner="twin">Foreign</div><div id="twin-portal" role="menu">Twin portal</div><div id="unrelated" data-ely-portal data-ely-owner="elsewhere">Unrelated</div><div id="paint"><span>Painted beyond root</span></div>`);
    const inventory=await page.locator('#main').evaluate(ownedOverlayInventory);
    assert.deepEqual(inventory.filter(item=>item.owned).map(item=>item.id),['own']);
    assert(inventory.filter(item=>['foreign','twin-panel','twin-portal','unrelated'].includes(item.id)).every(item=>!item.owned));
    const captured=await captureTargetPNG(page,page.locator('#paint'));
    assert.equal(captured.bounds.root.right-captured.bounds.root.left,120);
    assert.equal(captured.bounds.extendsRoot,true);assert.equal(captured.png.readUInt32BE(16),195);assert.equal(captured.png.readUInt32BE(20),58);
    await page.locator('#paint').evaluate(node=>{node.style.overflow='hidden';});
    const clipped=await captureTargetPNG(page,page.locator('#paint'));assert.equal(clipped.png.readUInt32BE(16),120);assert.equal(clipped.png.readUInt32BE(20),30);
    await page.setContent('<div data-audit-main><div id="primary" data-ely-family="forms" style="position:absolute;left:10px;top:10px;width:120px;height:30px"><span style="display:block;width:195px;height:58px">Owned overflow</span></div></div><div data-audit-twin><div id="peer" data-ely-family="forms" style="position:absolute;left:160px;top:10px;width:100px;height:58px">Foreign twin</div></div>');
    const mixed=await captureTargetPNG(page,page.locator('#primary'));assert.deepEqual(mixed.foreignDOMIntersections.map(peer=>peer.id),['peer'],'Mixed target/twin crop must be context evidence, not owned proof');
    const errors=[];page.on('pageerror',error=>errors.push({type:'pageerror',text:String(error)}));
    const happened=page.waitForEvent('pageerror');await page.evaluate(()=>setTimeout(()=>{throw new Error('unhandled audit regression');},0));await happened;
    assert.equal(unhandledBrowserErrors(errors).length,1,'An unhandled page error must enter the blocking gate input');
    assert.deepEqual(unhandledBrowserErrors([{type:'warning',text:'known CSS warning'}]),[]);
  }finally{await browser.close();}
});
test('persistent real-browser driver regression opens the requested settings panel then toggles its own control',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage();
    const labels=['Appearance','Keyboard','Network','Privacy','Notifications','Startup','Storage','Advanced'];
    await page.setContent(`<div id="selected">${labels.map((label,index)=>`<button data-ely-settings-tab="${index}">${label}</button><section data-ely-settings-panel="${index}" ${index?'hidden':''}>${label}${index===7?'<input type="checkbox" name="developer">':''}</section>`).join('')}</div>`);
    await page.evaluate(()=>document.querySelectorAll('[data-ely-settings-tab]').forEach(tab=>tab.addEventListener('click',()=>document.querySelectorAll('[data-ely-settings-panel]').forEach(panel=>{panel.hidden=panel.dataset.elySettingsPanel!==tab.dataset.elySettingsTab;}))));
    const root=page.locator('#selected'),observed=[];
    await runRequestedStateActions(requestedStateContract('settings/DeveloperMode Toggle'),root,async(label,action,verify)=>{
      await action();const state=await verify({actions:[]});const capture=await captureTargetPNG(page,root);assert(capture.png.length>0);observed.push({label,state});
    });
    assert.deepEqual(observed.map(item=>item.label),['open-target-section','toggle-target']);
    assert.equal(observed[0].state.panel,7);assert.equal(observed[1].state.before,false);assert.equal(observed[1].state.checked,true);
    assert.equal(await root.locator('[data-ely-settings-panel="0"]').isVisible(),false);
    await page.setContent('<button id="target" style="position:absolute;left:10px;top:10px;width:195px;height:58px">Reset</button><div style="position:absolute;left:80px;top:0;width:200px;height:100px">Foreign twin</div>');
    await page.locator('#target').evaluate(node=>node.addEventListener('click',()=>{node.dataset.activated='true';}));
    const activation=await clickVisibleControl(page.locator('#target'));
    assert(activation.position.x<70,'Actual click must use the unoccluded owned portion');assert.equal(await page.locator('#target').getAttribute('data-activated'),'true');
    await page.locator('#target').evaluate(node=>{delete node.dataset.activated;});
    await page.locator('div').evaluate(node=>{node.style.left='0';node.style.width='300px';});
    await assert.rejects(clickVisibleControl(page.locator('#target')),/no reachable owned pixel/);
    const keyboard=await clickVisibleControl(page.locator('#target'),{allowKeyboard:true});assert(keyboard.pointerActionabilityGap);assert.equal(await page.locator('#target').getAttribute('data-activated'),'true');
  }finally{await browser.close();}
});

test('action cameras distinguish covered foreign paint, exposed corners and empty clips without DOM isolation',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:600,height:400}});
    await page.setContent(`<style>body{margin:0}#main{width:500px;height:30px}#panel{position:absolute;left:0;top:35px;width:200px;height:120px;background:white;border:1px solid black;border-radius:8px;z-index:2}#peer{position:absolute;top:60px;width:500px;height:30px}#peer button{margin-left:20px}#outside{position:absolute;top:250px}</style>
      <div data-audit-main><div id="main" data-ely-family="interaction"><span id="nested"><button aria-controls="panel">Open</button></span><aside id="panel" role="region"><strong>Owned source content</strong></aside></div></div>
      <div data-audit-twin><div id="peer" data-ely-family="interaction"><button>Twin content</button></div></div>
      <div data-audit-twin><div id="outside" data-ely-family="interaction"><div role="menu">Unrelated outside camera</div></div></div>
      <aside id="nested-portal" role="region" data-ely-owner="nested" style="position:absolute;top:300px">Nested owner portal</aside>`);
    const originalHTML=await page.content(),inventory=await page.locator('#main').evaluate(ownedOverlayInventory);
    assert.deepEqual(inventory.filter(item=>item.owned).map(item=>item.id),['panel','nested-portal']);
    assert.equal(inventory.find(item=>item.id==='panel').openerReferences[0].ariaControls,'panel');
    const context=await captureTargetPNG(page,page.locator('#main'));
    assert(context.foreignDOMIntersections.some(item=>item.id==='peer'),'Broad root image retains exposed twin paint as context');
    const panel=await captureTargetPNG(page,page.locator('#panel'));
    assert.deepEqual(panel.foreignDOMIntersections,[],'Opaque higher-stacked panel covers the twin paint, not merely its layout box');
    assert(panel.occludedForeignPaint.some(item=>item.id==='peer'));
    assert.equal(await page.content(),originalHTML,'Camera must not hide, resize, detach or mutate either instance');
    for(const position of ['sticky','fixed']){
      await page.locator('#main').evaluate((node,position)=>{node.style.position=position;},position);
      assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Unmodelled auto-z ancestor stacking contexts cannot clear foreign paint');
      await page.locator('#main').evaluate(node=>{node.style.position='';});
    }
    for(const [selector,property,value] of [['#main','isolation',['iso','late'].join('')],['#main','overflow','hidden'],['#main','overflow','clip'],['#main','maskImage','linear-gradient(black,transparent)'],['body','overflow','hidden'],['body','clipPath','inset(10px round 8px)']]){
      await page.locator(selector).evaluate((node,{property,value})=>{node.style[property]=value;},{property,value});
      assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Owned ancestor stacking contexts or ancestor clipping/masks must disable subtraction');
      await page.locator(selector).evaluate((node,property)=>{node.style[property]='';},property);
    }
    await page.locator('#panel').evaluate(node=>{node.style.background='transparent';});
    assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Transparent panel cannot hide foreign paint');
    await page.locator('#panel').evaluate(node=>{node.style.background='white';});
    await page.evaluate(()=>{const portal=document.createElement('aside');portal.id='foreign-portal';portal.dataset.elyPortal='';portal.dataset.elyOwner='peer';portal.style.cssText='position:absolute;left:30px;top:65px;width:40px;height:20px;background:red;z-index:3';document.body.append(portal);});
    assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='foreign-portal'),'A detached foreign portal inside the pixels must block ownership');
    await page.locator('#foreign-portal').evaluate(node=>node.remove());
    for(const topLayer of ['dialog','popover']){
      await page.evaluate(kind=>{const foreign=document.createElement(kind==='dialog'?'dialog':'aside');foreign.id='foreign-top-layer';foreign.dataset.elyPortal='';foreign.dataset.elyOwner='peer';foreign.textContent='Foreign top layer';foreign.style.cssText='position:fixed;left:30px;top:65px;width:40px;height:20px;margin:0;background:red;z-index:auto';document.body.append(foreign);if(kind==='dialog')foreign.showModal();else{foreign.popover='auto';foreign.showPopover();}},topLayer);
      assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='foreign-top-layer'),'A foreign top layer with auto z-index is never below a normal owned panel');
      await page.locator('#foreign-top-layer').evaluate(node=>node.remove());
    }
    await page.locator('#peer').evaluate(node=>{node.style.zIndex='3';});
    assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Foreign stacking above panel must block ownership');
    await page.locator('#peer').evaluate(node=>{node.style.zIndex='';node.style.top='150px';node.style.background='red';});
    assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Paint exposed through a rounded corner remains blocking');
    await page.setContent(`<style>body{margin:0}#main{height:40px;width:200px}#submit{position:absolute;top:40px;left:0;width:2px;height:28px;clip-path:inset(50%);overflow:hidden}</style><div data-audit-main><div id="main" data-ely-family="communication"><select><option>Done</option></select><button id="submit">Update</button></div></div><div data-audit-twin><div id="peer" data-ely-family="communication" style="position:absolute;top:60px">Twin</div></div>`);
    const clipped=await captureTargetPNG(page,page.locator('#main'));
    assert.equal(clipped.bounds.clip.height,40);assert.deepEqual(clipped.foreignDOMIntersections,[]);
    await page.locator('#submit').evaluate(node=>{node.style.clipPath='none';});
    const visible=await captureTargetPNG(page,page.locator('#main'));
    assert(visible.bounds.clip.height>=68,'Unclipped submit pixels must remain in the camera');
    assert(visible.foreignDOMIntersections.some(item=>item.id==='peer'));
    await page.setContent('<style>body{margin:0;height:2400px}#radio{position:absolute;top:1200px;width:200px;height:32px}</style><div data-audit-main><div id="radio" data-ely-family="interaction" data-ely-component="menus/RadioMenuItem"><button>View</button></div></div>');
    const radioHTML=await page.content();
    await captureTargetPNG(page,page.locator('#radio'));
    assert(await page.locator('#radio').evaluate(node=>Math.abs(node.getBoundingClientRect().bottom-innerHeight)<1),'Finite Radio camera must leave room for the production menu upward collision placement');
    assert.equal(await page.content(),radioHTML,'Radio camera uses scrolling only, never instance isolation or DOM mutation');
  }finally{await browser.close();}
});
