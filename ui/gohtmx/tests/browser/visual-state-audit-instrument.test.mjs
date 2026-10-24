import assert from 'node:assert/strict';
import {test} from 'node:test';
import {transform,staticCoverageManifest,registrationInventory,resolveCaseActionSites,actionModuleNames,prepareActionModule,synchronousTrace,compareActionTrace,synchronousTraceInit,registeredOutcomesEqual,registeredOutcomeDifferences,firstDifference,traceContractStatus} from './visual-state-audit-instrument.mjs';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {tmpdir} from 'node:os';
import {join,resolve,sep} from 'node:path';
import {chromium} from 'playwright';
import {compileFunction,runInNewContext} from 'node:vm';
import {parse} from 'acorn';
import {caseActionContract,requestedStateContract,runRequestedStateActions,runRegisteredCanvasActions,assertRegisteredCanvasTransition,assertCanvasRulerPan,deliverDirectActionVerification,assertVerticalRangeSnapshot,clickVisibleControl,ownedOverlayInventory,captureTargetPNG,inventoryReceipt,inventoryDrift,unhandledBrowserErrors,assertThreewayState,threewaySourcePins,threewayCleanup,activeOutlineBounds,lastPaintedLicenseFragment,persistDirectCaseFailure,retainFailurePayload,cleanupPreservingPrimary,probeFailureStateAndPayload} from './visual-state-audit-drivers.mjs';

test('initial paint camera diagnostic pure: exact scope, clipping, movement and failure persistence',async()=>{
  const source=await readFile(new URL('./visual-state-audit-baseline.mjs',import.meta.url),'utf8');
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});
  const load=name=>{const fn=ast.body.find(n=>n.type==='FunctionDeclaration'&&n.id.name===name);assert.ok(fn);return compileFunction(`return (${source.slice(fn.start,fn.end)});`)();};
  const snapshot=load('initialPaintSnapshot'),failures=load('initialPaintFailures');
  assert.equal(snapshot(null,'gallery:devtools/QueryEditor'),null,'unrelated fixtures stay untouched');
  const emptyRoot={getBoundingClientRect:()=>({left:0,top:0,right:100,bottom:100}),querySelector:()=>null};
  for(const [caseId,names] of [['gallery:devtools/ColorContrastChecker',['pattern','flag-i','flag-m','flag-s','flag-x']],['gallery:devtools/Encoder',['pattern','flag-i','flag-m','flag-s','flag-x']],['gallery:devtools/Base64',['pattern','flag-i','flag-m','flag-s','flag-x']],['gallery:collab/ActivityLog',['first-avatar','first-text']]]){
    const result=runInNewContext(`(${snapshot.toString()})(root,caseId)`,{root:emptyRoot,caseId,scrollX:0,scrollY:0});
    assert.deepEqual(Array.from(result.required,x=>x.name),names);assert.ok(result.required.every(x=>x.missing),'missing required caller nodes must not pass');
  }
  const bounds={left:10,top:10,right:30,bottom:30},clip={x:0,y:0,width:100,height:100};
  const item={name:'flag-x',bounds,ranges:[{left:25,top:12,right:29,bottom:25}],ancestors:[{bounds:{left:0,top:0,right:100,bottom:100},overflowX:'hidden',overflowY:'auto',clip:'auto',clipPath:'none',display:'block',visibility:'visible',opacity:'1',scrollLeft:0,scrollTop:0}]};
  const before={root:{left:0,top:0,right:100,bottom:100},scroll:{x:0,y:0},required:[item]};
  assert.deepEqual(failures(before,structuredClone(before),clip),[]);
  for(const name of ['flag-x','first-text']){
    const clipped=structuredClone(before);clipped.required[0].name=name;clipped.required[0].ranges[0].top=-1;
    assert.ok(failures(clipped,clipped,clip).some(x=>x.includes('outside capture')));
    const ancestor=structuredClone(before);ancestor.required[0].ancestors[0].bounds.right=28;
    assert.ok(failures(ancestor,ancestor,clip).some(x=>x.includes('ancestor clip')));
  }
  for(const change of [x=>x.scroll.y++,x=>x.root.top++,x=>x.required[0].ranges[0].left++,x=>x.required[0].ancestors[0].scrollTop++]){
    const after=structuredClone(before);change(after);assert.ok(failures(before,after,clip).some(x=>x.includes('movement')));
  }
  for(const required of [[{name:'pattern',missing:true}],[{...item,rangesTruncated:true}],[{...item,ancestorsTruncated:true}]])assert.ok(failures({...before,required},{...before,required},clip).length);
  assert.deepEqual(failures(null,null,clip),[]);
  const failBlock=source.slice(source.indexOf('if (paintFailures.length)'),source.indexOf('const overlayVisible'));
  assert.ok(failBlock.indexOf('result.png = png')<failBlock.indexOf('assert.fail'),'failed PNG retained before assertion');
  const retained=source.indexOf('initialPaintDiagnostic,{after:paintAfter,failures:paintFailures}');
  assert.ok(retained>=0&&retained<source.indexOf('if (paintFailures.length)'),'metrics retained before assertion');
});

test('hidden action shim style exits before outline color parsing',()=>{
  const bounds={clip:{x:0,y:0,width:10,height:10}},active={},node={contains:candidate=>candidate===active};
  const result=runInNewContext(`(${activeOutlineBounds.toString()})(node,bounds)`,{
    document:{activeElement:active},getComputedStyle:()=>({display:'none'}),node,bounds,
  });
  assert.equal(result,bounds);
});

test('canvas focus gap diagnostic pure: preserves exact gap and serializes computed SVG evidence',async()=>{
  const family={},rect={left:12,top:18,right:212,bottom:158,width:200,height:140};
  const element=(tag,id,parent=null)=>({localName:tag,namespaceURI:tag==='svg'?'http://www.w3.org/2000/svg':'http://www.w3.org/1999/xhtml',id,parentElement:parent,hasAttribute:name=>name==='data-cs-minimap'&&id==='minimap',getBoundingClientRect:()=>rect});
  const html=element('div','root'),view=element('div','canvas-view',html),active=element('svg','minimap',view);
  active.matches=selector=>selector===':focus-visible';active.closest=()=>family;active.getClientRects=()=>[rect];active.offsetParent=null;
  html.parentElement=null;html.closest=()=>family;
  const baseStyle={position:'relative',overflowX:'hidden',overflowY:'hidden',overflowClipMargin:'0px',clip:'auto',clipPath:'none',transform:'none',translate:'none',rotate:'none',scale:'none',perspective:'none',filter:'none',contain:'none'};
  const styles=new Map([[active,{...baseStyle,display:'block',outlineStyle:'auto',outlineWidth:'auto',outlineOffset:'0px',outlineColor:'rgb(0, 0, 255)'}],[view,baseStyle],[html,{...baseStyle,position:'static'}]]);
  const bounds={clip:{x:1,y:2,width:300,height:200},root:{left:4,top:5,right:304,bottom:205},extendsRoot:false,viewportTruncated:false,marker:'unchanged'};
  const result=JSON.parse(JSON.stringify(runInNewContext(`(${activeOutlineBounds.toString()})(node,bounds)`,{
    document:{activeElement:active},getComputedStyle:element=>styles.get(element),node:{contains:element=>element===active,closest:()=>family},bounds,scrollX:0,scrollY:0,innerWidth:400,innerHeight:300,
  })));
  assert.deepEqual(result.clip,bounds.clip);assert.deepEqual(result.root,bounds.root);assert.equal(result.marker,'unchanged');
  assert.equal(result.focusOutline.status,'unsupported');assert.equal(result.focusOutline.reason,'unbounded outline style');
  assert.deepEqual(result.focusOutline.diagnostic.active,{tag:'svg',namespace:'http://www.w3.org/2000/svg',id:'minimap',dataCsMinimap:true,rect,matchesFocusVisible:true,outlineStyle:'auto',outlineWidth:'auto',outlineOffset:'0px',outlineColor:'rgb(0, 0, 255)',clientRects:[rect]});
  assert.equal(result.focusOutline.diagnostic.offsetParent,null);assert.deepEqual(result.focusOutline.diagnostic.ancestors.map(item=>[item.tag,item.id,item.position,item.overflowX,item.overflowY,item.clip,item.clipPath,item.transform,item.contain]),[['svg','minimap','relative','hidden','hidden','auto','none','none','none'],['div','canvas-view','relative','hidden','hidden','auto','none','none','none'],['div','root','static','hidden','hidden','auto','none','none','none']]);
  const captureSource=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url),'utf8');
  assert(captureSource.includes('focusOutlineGap,bounds,foreignDOMIntersections,occludedForeignPaint'),'The existing report capture receipt retains the expanded bounds object');
});

test('canvas SVG outline proof pure: nullish offsetParent only with direct positioned clipping parent',()=>{
  const rect={left:70,top:70,right:80,bottom:80,width:10,height:10},clipRect={left:10,top:10,right:90,bottom:90,width:80,height:80},family={};
  const make=(tag,parent,namespace='http://www.w3.org/1999/xhtml')=>({localName:tag,namespaceURI:namespace,id:'',parentElement:parent,hasAttribute:()=>false,getBoundingClientRect:()=>tag==='svg'?rect:clipRect});
  const evaluate=({offsetParent,parentPosition='relative',wrapper=false}={})=>{
    const clip=make('div',null);let parent=clip;
    if(wrapper){parent=make('div',clip);parent.contains=node=>node===parent;}
    clip.contains=node=>node===clip||(wrapper&&node===parent);
    const active=make('svg',parent,'http://www.w3.org/2000/svg');active.offsetParent=offsetParent;active.matches=()=>false;active.closest=()=>family;active.getClientRects=()=>[rect];
    const node={contains:item=>item===active,closest:()=>family};
    const base={display:'block',opacity:'1',contentVisibility:'visible',visibility:'visible',overflowClipMargin:'0px',clip:'auto',clipPath:'none',transform:'none',translate:'none',rotate:'none',scale:'none',perspective:'none',filter:'none',maskImage:'none',contain:'none',zoom:'normal'};
    const styles=new Map([[active,{...base,position:'absolute',overflowX:'hidden',overflowY:'hidden',outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'-2px',outlineColor:'rgb(55, 114, 187)'}],
      [clip,{...base,position:wrapper?'static':parentPosition,overflowX:'hidden',overflowY:'hidden'}],...(wrapper?[[parent,{...base,position:'relative',overflowX:'visible',overflowY:'visible'}]]:[])]);
    const bounds={clip:{x:10,y:10,width:80,height:80},root:{left:10,top:10,right:90,bottom:90},extendsRoot:false,viewportTruncated:false};
    return JSON.parse(JSON.stringify(runInNewContext(`(${activeOutlineBounds.toString()})(node,bounds)`,{document:{activeElement:active},getComputedStyle:item=>styles.get(item),node,bounds,scrollX:0,scrollY:0,innerWidth:100,innerHeight:100})));
  };
  for(const offsetParent of [null,undefined]){
    const result=evaluate({offsetParent});assert.equal(result.focusOutline.status,'bounded');
  }
  const nonnull=evaluate({offsetParent:make('div',null)}).focusOutline.diagnostic.rejectedClipRelationships[0];
  assert.equal(nonnull.containingBlockState,'element');assert.equal(nonnull.directSVGChild,true);assert.equal(nonnull.directSVGParentNonStatic,true);assert.equal(nonnull.directSVGParentFallback,false);
  const wrapped=evaluate({offsetParent:undefined,wrapper:true}).focusOutline.diagnostic.rejectedClipRelationships[0];
  assert.equal(wrapped.containingBlockState,'undefined');assert.equal(wrapped.directSVGChild,false);assert.equal(wrapped.proven,false);
  const nullStaticParent=evaluate({offsetParent:null,parentPosition:'static'}).focusOutline.diagnostic.rejectedClipRelationships[0];
  assert.equal(nullStaticParent.containingBlockState,'null');assert.equal(nullStaticParent.directSVGParentNonStatic,false);assert.equal(nullStaticParent.proven,false);
  const staticParent=evaluate({offsetParent:undefined,parentPosition:'static'}).focusOutline.diagnostic.rejectedClipRelationships[0];
  assert.equal(staticParent.containingBlockState,'undefined');assert.equal(staticParent.directSVGChild,true);assert.equal(staticParent.directSVGParentNonStatic,false);assert.equal(staticParent.proven,false);
});

test('presence sequence kind pure: action labels stay separate from component kind',async()=>{
  const source=await readFile(new URL('./visual-state-audit-drivers.mjs',import.meta.url),'utf8');
  const start=source.indexOf("if(contract.focusedSequence==='workspace-native-presence-follow')"),end=source.indexOf("if(contract.focusedSequence==='native-embed-open-host')",start),presence=source.slice(start,end);
  assert(presence.includes('for(const [id,actionKind]of sequences)'));
  assert(presence.includes('assert.equal(after.kind,initial.kind)'));
  const initial={kind:'PresenceAvatars'},after={kind:'PresenceAvatars'},actionKind='follow';
  assert.equal(after.kind,initial.kind,'The component-kind invariant survives a follow action');
  assert.notEqual(after.kind,actionKind,'An action-sequence label is not the component kind');
  assert.throws(()=>assert.equal(after.kind,actionKind),assert.AssertionError,'The former follow-vs-PresenceAvatars comparison must fail');
});

test('popover overlay inventory requires exact identity, root, unique open reference and visible article',()=>{
  const make=(id,visible=true)=>({id,tagName:'ARTICLE',innerText:'Details',checkVisibility:()=>visible,getBoundingClientRect:()=>({x:0,y:0,width:200,height:120}),getAttribute:()=>null,matches:()=>false,closest:()=>null});
  const panel=make('owned-panel'),foreign=make('foreign-panel'),triggerFor=({expanded='true',controls='owned-panel'}={})=>({id:'open',getAttribute:name=>name==='aria-expanded'?expanded:name==='aria-controls'?controls:null});
  const run=({identity='calendar/EventPopover',kind='EventPopover',trigger=triggerFor(),triggers=[trigger],panels=[panel],resolved=panel,extraIDs=[]}={})=>{
    const root={id:'owned-root',dataset:{elyComponent:identity,elyKind:kind},getAttribute:()=>null,contains:element=>panels.includes(element),querySelectorAll:selector=>{
      if(selector==='[id]')return [];
      if(selector==='[aria-controls],[popovertarget],[data-foundation-dialog-open],[data-interaction-dialog],[data-ely-dialog-open]'||selector==='[aria-controls]')return [trigger];
      if(selector==='[data-calendar-popover-open]')return triggers;
      if(selector==='article[data-calendar-popover]')return panels;
      return [];
    }};
    const idElements=[...extraIDs,root,...panels,...(panels.includes(resolved)?[]:[resolved])];
    const document={querySelectorAll:selector=>selector==='[id]'?idElements:[]};
    return JSON.parse(JSON.stringify(runInNewContext(`(${ownedOverlayInventory.toString()})(node)`,{node:root,document})));
  };
  const accepted=run();assert.equal(accepted.length,1);assert.equal(accepted[0].id,'owned-panel');assert.equal(accepted[0].owned,true);assert.equal(accepted[0].checkedRootID,'owned-root');assert.equal(accepted[0].ownershipScope,'trigger-reference');
  assert.equal(run({extraIDs:[{id:'owned-root'}]}).length,0,'A duplicate root ID before the checked root cannot produce a custom overlay');
  assert.equal(run({identity:'calendar/Other'}).length,0,'Unrelated component identities cannot add custom articles');
  assert.equal(run({kind:'CalendarWeekView'}).length,0,'Only exact EventPopover kind is eligible');
  assert.equal(run({trigger:triggerFor({expanded:'false'})}).length,0,'Closed popovers stay outside the overlay inventory');
  assert.equal(run({trigger:triggerFor({controls:'foreign-panel'}),resolved:foreign}).length,0,'A foreign panel reference cannot grant ownership');
  assert.equal(run({resolved:{...foreign,id:'owned-panel'}}).length,0,'An owned article listed before a duplicate ID cannot pass');
  assert.equal(run({resolved:{...foreign,id:'owned-panel'},panels:[{...panel}]}).length,0,'A duplicate ID resolving after the owned article cannot pass');
  assert.equal(run({triggers:[triggerFor(),triggerFor()]}).length,0,'Multiple open triggers remain ambiguous');
  assert.equal(run({panels:[panel,make('hidden-panel',false)]}).length,1,'Hidden extra articles do not make the visible target ambiguous');
  assert.equal(run({panels:[panel,foreign]}).length,0,'Multiple visible in-root articles remain ambiguous');
});

test('threeway direct pure: primary identity survives cleanup and diagnostic attachment failures',async()=>{
  const primary=Object.freeze(new Error('before-first-capture')),cleanup=new Error('listener cleanup failed');
  const run=async diagnostics=>{let failed=false;try{throw primary;}catch(error){failed=true;throw error;}finally{await threewayCleanup(async()=>{throw cleanup;},failed,diagnostics);}};
  const diagnostics={threewayCleanupFailures:[]};
  await assert.rejects(run(diagnostics),error=>error===primary);
  assert.deepEqual(diagnostics.threewayCleanupFailures,[{phase:'threeway-listener-cleanup',error:'Error: listener cleanup failed',primaryFailed:true}]);
  await assert.rejects(run(Object.freeze({threewayCleanupFailures:Object.freeze([])})),error=>error===primary);
  await assert.rejects(run(new Proxy({}, {get(){throw Error('metadata access failed');}})),error=>error===primary);
  const unprintable={toString(){throw Error('format failed');}},fallback={threewayCleanupFailures:[]};
  await threewayCleanup(async()=>{throw unprintable;},true,fallback);
  assert.equal(fallback.threewayCleanupFailures[0].error,'[unprintable cleanup error]');
});

test('vertical range direct pure: exact canonical identities and finite native sequence',async()=>{
  const registry=JSON.parse(await readFile(new URL('../../components.json',import.meta.url),'utf8'));
  const layout=registry.pages.find(page=>page.slug==='layout');
  const fixtures=await readFile(new URL('../../../../internal/gallery/advanced_foundation_fixtures.go',import.meta.url),'utf8');
  const checks=await readFile(new URL('../../../../internal/gallery/assets/advanced-foundation-checks.js',import.meta.url),'utf8');
  const behavior=await readFile(new URL('../../assets/ely-api-foundation.js',import.meta.url),'utf8');
  const core=await readFile(new URL('../../assets/ely-api.js',import.meta.url),'utf8');
  const css=await readFile(new URL('../../assets/ely-api-foundation.css',import.meta.url),'utf8');
  const identities=['layout/Scrollbar','layout/StickyHeader'],steps=['range-center-pointer','range-top-min-pointer','range-bottom-max-pointer','range-home-min','range-end-max','content-wheel-up','scroll-home-min','scroll-end-max'];
  for(const identity of identities){
    const name=identity.split('/')[1],story=layout.stories.find(item=>item.name===name);
    assert(story,`${identity} must exist in the canonical registry`);assert.deepEqual(story.components,[name]);
    const contract=requestedStateContract(identity);
    assert.equal(contract.identity,identity);assert.equal(contract.kind,name);assert.equal(contract.family,'foundation');
    assert.equal(contract.requestedStateOnly,true);assert.equal(contract.focusedSequence,'vertical-range-native-scroll');assert.deepEqual(contract.mappingGaps,[]);
    assert.deepEqual(contract.steps.map(step=>step.id),steps);assert(contract.steps.every(step=>step.source.siteId.startsWith(`vertical-range-state:${identity}:`)));
    assert(contract.steps.every(step=>step.control===(step.id.startsWith('range-')?'input[type="range"][data-foundation-scrollbar]':'[data-foundation-scroll]')&&step.event.includes('trusted native')));
  }
  assert.equal(requestedStateContract('layout/ScrollBar'),null);assert.equal(requestedStateContract('layout/StickyHeaderAlias'),null);
  assert(fixtures.includes('"layout":     {')&&fixtures.includes('"Scrollbar"')&&fixtures.includes('"StickyHeader"'));
  assert(fixtures.includes('props["Items"], props["Value"], props["Label"] = lines(30), "Scrollbar", "Scroll position"'));
  assert(fixtures.includes('case "StickyHeader":')&&fixtures.includes('{"Label": "Today", "Items": lines(8)}'));
  assert(checks.includes("Scrollbar:['.ely-foundation__scrollbar','scrollAids']")&&checks.includes("StickyHeader:['.ely-foundation__sticky','scrollAids']"));
  assert(checks.includes("thumb.value = '0'; thumb.dispatchEvent(new Event('input'));"),'The registered Scrollbar check remains explicitly synthetic');
  assert(behavior.includes('const onThumb = () => { scroll.scrollTop = max() * Number(thumb.value || 0) / 1000; };'));
  assert(behavior.includes('thumb?.addEventListener(\'input\', onThumb)'));
  assert(css.includes('inset-inline:.125rem;inset-block-end:.125rem;inline-size:calc(100% - .25rem);block-size:.5rem;margin:0;writing-mode:vertical-lr;direction:ltr;'));
  assert(css.includes('min-inline-size:0;max-block-size:8px;'));
  assert(behavior.includes('const update = () => {')&&behavior.includes('thumb.value = String(Math.round(position * 1000));'));
  assert(behavior.includes("if (event.key === 'Home') { scroll.scrollTop = 0; event.preventDefault(); }")&&behavior.includes("if (event.key === 'End') { scroll.scrollTop = max(); event.preventDefault(); }"));
  assert.match(core,/detail:\s*\{\s*id: root\.id,\s*component: root\.dataset\.elyComponent,\s*name: event\.target\.name,\s*value: event\.target\.value,\s*checked: event\.target\.checked,\s*type: event\.target\.type,/);
  assert(core.includes("root.addEventListener('change', change)"));
  const runner=runRequestedStateActions.toString();
  assert(runner.includes("const y=stage==='range-top-min-pointer'?2:stage==='range-bottom-max-pointer'?box.height-2:box.height/2"));
  assert(runner.includes("range.press(stage==='range-home-min'?'Home':'End')"));
  assert(runner.includes('root.page().mouse.wheel(0,-Math.min(120,before.scrollMax/2))'));
  assert(runner.includes('return region.scrollTop>0&&region.scrollTop<max&&Math.abs(region.scrollTop-max*Number(input.value)/1000)<=1;'),'Wheel must leave a measurable interior position and synchronize the native range before region Home');
  assert(runner.includes("scroll.press(stage==='scroll-home-min'?'Home':'End')"));
  assert(runner.includes('for(const {id:stage}of contract.steps)'));
  assert(runner.includes('assertVerticalRangeSnapshot(identity,stage,')&&runner.includes('finally{await threewayCleanup'));
  assert(!runner.includes("thumb.value = '0'")&&!runner.includes("dispatchEvent(new Event('input'"));
});

test('vertical range direct pure: finite geometry, eight native source states, core change payload, and twin invariants',()=>{
  const base={id:'range-fixture',component:'layout/Scrollbar',direction:'ltr',writingMode:'vertical-lr',rect:{width:8,height:120},scrollTop:250,scrollLeft:0,scrollHeight:600,clientHeight:100,scrollMax:500,documentScrollTop:17,previousDocumentScrollTop:17,value:500,nativeEvents:[{type:'input',trusted:true}],regionEvents:[],publicEvents:[],twinHTML:'same twin',twinEvents:[]};
  const sample=(stage,component=base.component)=>{
    const patch={};let nativeEvents=[...base.nativeEvents],regionEvents=[],publicEvents=[];
    if(stage==='range-top-min-pointer'||stage==='range-home-min'||stage==='scroll-home-min')Object.assign(patch,{value:0,scrollTop:0});
    if(stage==='range-bottom-max-pointer'||stage==='range-end-max'||stage==='scroll-end-max')Object.assign(patch,{value:1000,scrollTop:500});
    if(stage==='content-wheel-up'){Object.assign(patch,{value:760,scrollTop:380});nativeEvents=[];regionEvents=[{type:'wheel',target:'content',deltaY:-120,trusted:true}];}
    if(stage==='scroll-home-min'||stage==='scroll-end-max'){nativeEvents=[];regionEvents=[{type:'keydown',target:'region',key:stage==='scroll-home-min'?'Home':'End',trusted:true}];}
    if(stage.endsWith('-pointer'))nativeEvents.push({type:'pointerdown',trusted:true},{type:'click',trusted:true});
    else if(stage==='range-home-min'||stage==='range-end-max')nativeEvents.push({type:'keydown',key:stage==='range-home-min'?'Home':'End',trusted:true});
    if(stage.startsWith('range-')){
      const value=String(patch.value??base.value),nativeChange={type:'change',trusted:true,value,name:'',checked:false,controlType:'range'};
      nativeEvents.push(nativeChange);publicEvents=[{type:'ely:change',detail:{id:base.id,component,name:'',value,checked:false,type:'range'}}];
    }
    return {...base,...patch,nativeEvents,regionEvents,publicEvents};
  };
  for(const identity of ['layout/Scrollbar','layout/StickyHeader'])for(const {id:stage}of requestedStateContract(identity).steps)
    assert.doesNotThrow(()=>assertVerticalRangeSnapshot(identity,stage,{...sample(stage,identity),component:identity},'same twin'),`${identity} ${stage} must satisfy its native-state contract`);
  assert.deepEqual(requestedStateContract('layout/Scrollbar').steps.slice(0,3).map(step=>step.id),['range-center-pointer','range-top-min-pointer','range-bottom-max-pointer']);
  assert(sample('content-wheel-up').scrollTop>0&&sample('content-wheel-up').scrollTop<sample('content-wheel-up').scrollMax&&sample('content-wheel-up').scrollTop<sample('range-end-max').scrollTop,'Wheel must move from max to a synchronized interior state before region Home');
  const rangeCenter=sample('range-center-pointer');
  for(const detailPatch of [{id:'wrong-id'},{component:'layout/StickyHeader'},{name:'scroll'},{value:'499'},{type:'text'},{checked:true}]){
    const bad=structuredClone(rangeCenter);Object.assign(bad.publicEvents[0].detail,detailPatch);assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','range-center-pointer',bad,'same twin'));
  }
  const missingPayload=structuredClone(rangeCenter);delete missingPayload.publicEvents[0].detail.name;assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','range-center-pointer',missingPayload,'same twin'));
  const missingChange=structuredClone(rangeCenter);missingChange.publicEvents=[];assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','range-center-pointer',missingChange,'same twin'));
  const duplicateChange=structuredClone(rangeCenter);duplicateChange.publicEvents.push(structuredClone(duplicateChange.publicEvents[0]));assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','range-center-pointer',duplicateChange,'same twin'));
  const untrustedInput=structuredClone(rangeCenter);untrustedInput.nativeEvents.find(event=>event.type==='input').trusted=false;assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','range-center-pointer',untrustedInput,'same twin'));
  const untrustedChange=structuredClone(rangeCenter);untrustedChange.nativeEvents.find(event=>event.type==='change').trusted=false;assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','range-center-pointer',untrustedChange,'same twin'));
  for(const patch of [{direction:'rtl'},{writingMode:'horizontal-tb'},{rect:{width:120,height:8}},{scrollLeft:1},{scrollMax:499},{value:500,scrollTop:0},{nativeEvents:[]},{nativeEvents:[{type:'input',trusted:false},{type:'change',trusted:true,value:'500',name:'',checked:false,controlType:'range'}]},{publicEvents:[{type:'ely:action'}]},{documentScrollTop:18},{twinHTML:'changed twin'},{twinEvents:['input']}])assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','range-center-pointer',{...rangeCenter,...patch},'same twin'));
  for(const stage of ['content-wheel-up','scroll-home-min','scroll-end-max'])assert.deepEqual(sample(stage).publicEvents,[],`${stage} must stay silent at the public host boundary`);
  assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','content-wheel-up',{...sample('content-wheel-up'),publicEvents:[{type:'ely:change',detail:{}}]},'same twin'));
  assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','scroll-home-min',{...sample('scroll-home-min'),publicEvents:[{type:'ely:change',detail:{}}]},'same twin'));
  assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','content-wheel-up',{...sample('content-wheel-up'),regionEvents:[{type:'wheel',target:'content',deltaY:600,trusted:true}]},'same twin'));
  assert.throws(()=>assertVerticalRangeSnapshot('layout/Scrollbar','scroll-home-min',{...sample('scroll-home-min'),regionEvents:[]},'same twin'));
  assert.throws(()=>assertVerticalRangeSnapshot('layout/ScrollbarAlias','range-center-pointer',base,'same twin'));
});

test('foreign paint clip source: only proven overflow clips may trim measured paint',async()=>{
  const source=await readFile(new URL('./visual-state-audit-drivers.mjs',import.meta.url),'utf8');
  const start=source.indexOf('  const clippedPaintRect='),end=source.indexOf('\n  const rootSelector=',start),guard=source.slice(start,end);
  const compact=guard.replace(/\s+/g,'');
  assert(start>=0&&end>start,'Foreign paint clipping must stay local to the camera classifier');
  assert(guard.includes('for(let p=element;p;p=p.parentElement)')&&guard.includes('if(p===element&&!text)continue'),'Positioned painted elements must remain conservative without clipping their own border box');
  assert(guard.includes("!['static','relative','absolute'].includes(position)"),'Fixed, sticky and other unmodeled positions keep raw paint bounds');
  assert(guard.includes("s.zIndex !== 'auto'&&position!=='absolute'"),'Local absolute stacking is allowed only for clipping; other z-index cases remain conservative');
  assert(guard.includes("if(position==='absolute')positioned.push({node:p,containingBlock:p.offsetParent})"),'Absolute descendants must retain their measured containing block for clip proof');
  assert(guard.includes('!p.contains(containingBlock)'),'An absolute descendant is clipped only when its containing block is inside the clipping ancestor');
  assert(guard.includes("item.node.localName==='svg'&&item.node.parentElement===p&&position!=='static'"),'An absolute SVG without offsetParent is clip-eligible only under its direct positioned HTML parent');
  assert(guard.includes("p.matches(':modal,:popover-open')"),'Top-layer ancestors keep raw paint bounds');
  for(const unsupported of ['s.transform!==\'none\'','s.filter' + '!==\'none\'','s.maskImage!==\'none\'','s.clipPath!==\'none\'','s.overflowClipMargin!==\'0px\''])assert(compact.includes(unsupported),`${unsupported} must remain conservative`);
  for(const longhand of ['s.translate!==\'none\'','s.rotate!==\'none\'','s.scale!==\'none\''])assert(compact.includes(longhand),`${longhand} must keep raw paint bounds`);
  assert(guard.includes('r.right+scrollX')&&guard.includes('r.bottom+scrollY')&&!guard.includes('clientLeft')&&!guard.includes('clientTop')&&!guard.includes('clientWidth')&&!guard.includes('clientHeight'),'Fractional clips use conservative border-box bounds, not rounded client metrics');
  assert(!guard.includes('borderTopLeftRadius'),'Rounded overflow clips use their rectangular padding-box over-approximation');
  assert(source.includes('clippedPaintRect(e,rect,text)'),'Both measured text and element paint must pass through the bounded clip check');
});

test('foreign paint clip pure: proven z-indexed absolute ancestors clip nested text; escapes stay raw',async()=>{
  const source=await readFile(new URL('./visual-state-audit-drivers.mjs',import.meta.url),'utf8');
  const start=source.indexOf('const clippedPaintRect='),end=source.indexOf('\n  const rootSelector=',start);
  assert(start>=0&&end>start,'Clipping predicate must remain extractable within the classifier');
  const declaration=source.slice(start,end).trim().replace(/;$/,'');
  const clip=new Function('getComputedStyle','scrollX','scrollY',`return (${declaration.slice('const clippedPaintRect='.length)})`)(node=>node.style,0,0);
  const style=(values={})=>({position:'static',zIndex:'auto',opacity:'1',transform:'none',translate:'none',rotate:'none',scale:'none',filter:'none',perspective:'none',maskImage:'none',backdropFilter:'none',containerType:'normal',isolation:'auto',mixBlendMode:'normal',contain:'none',willChange:'auto',clipPath:'none',clip:'auto',zoom:'normal',contentVisibility:'visible',overflowX:'visible',overflowY:'visible',overflowClipMargin:'0px',...values});
  const box=(top,bottom)=>({x:0,y:top,width:100,height:bottom-top});
  const node=(name,css,rect,parent=null,offsetParent=null,namespaceURI='http://www.w3.org/1999/xhtml')=>({localName:name,namespaceURI,style:style(css),rect,parentElement:parent,offsetParent,matches:()=>false,contains(other){for(let current=other;current;current=current.parentElement)if(current===this)return true;return false;},getBoundingClientRect(){return {left:rect.x,top:rect.y,right:rect.x+rect.width,bottom:rect.y+rect.height};}});

  const scroller=node('div',{overflowY:'auto',position:'relative'},box(0,60));
  const slot=node('div',{position:'relative'},box(0,140),scroller);const button=node('button',{position:'absolute',zIndex:'2'},box(50,80),slot,slot);
  const small=node('small',{display:'block'},box(52,72),button);
  assert.deepEqual(clip(button,button.rect,false),box(50,60),'Calendar button z-index must not escape its proven scrollport clip');
  assert.deepEqual(clip(small,small.rect,true),box(52,60),'Nested small text must retain the absolute button containing-block proof');

  const outer=node('div',{position:'relative'},box(0,60));const overflow=node('div',{overflowY:'hidden'},box(0,60),outer);const escaped=node('button',{position:'absolute',zIndex:'2'},box(70,100),overflow,outer);
  assert.deepEqual(clip(escaped,escaped.rect,false),escaped.rect,'Absolute paint whose containing block is outside the clip remains raw');
  const fixed=node('button',{position:'fixed',zIndex:'2'},box(70,100));
  assert.deepEqual(clip(fixed,fixed.rect,false),fixed.rect,'Fixed paint remains raw even when z-indexed');

  const svgClip=node('div',{position:'relative',overflowY:'hidden'},box(0,60));const svg=node('svg',{position:'absolute',zIndex:'2'},box(50,80),svgClip,null,'http://www.w3.org/2000/svg');
  assert.deepEqual(clip(svg,svg.rect,false),box(50,60),'Direct positioned-parent proof trims an absolute SVG viewport to its clip');
});

test('vertical range direct pure: listener cleanup preserves action failures',async()=>{
  const primary=new Error('range action failed'),cleanup=new Error('range listener cleanup failed'),diagnostics={threewayCleanupFailures:[]};
  const run=async()=>{let failed=false;try{throw primary;}catch(error){failed=true;throw error;}finally{await threewayCleanup(async()=>{throw cleanup;},failed,diagnostics);}};
  await assert.rejects(run(),error=>error===primary);
  assert.deepEqual(diagnostics.threewayCleanupFailures,[{phase:'threeway-listener-cleanup',error:'Error: range listener cleanup failed',primaryFailed:true}]);
  await assert.rejects(threewayCleanup(async()=>{throw cleanup;},false,diagnostics),error=>error===cleanup);
});
test('threeway direct pure: cleanup-only failure remains exact failure and clean cleanup adds nothing',async()=>{
  const cleanup=Object.freeze(new Error('sole cleanup failure')),diagnostics={threewayCleanupFailures:[]};
  await assert.rejects(threewayCleanup(async()=>{throw cleanup;},false,diagnostics),error=>error===cleanup);
  assert.equal(diagnostics.threewayCleanupFailures[0].primaryFailed,false);
  await assert.rejects(threewayCleanup(async()=>{throw cleanup;},false,new Proxy({}, {get(){throw Error('attachment failed');}})),error=>error===cleanup);
  const clean={threewayCleanupFailures:[]};await threewayCleanup(async()=>{},false,clean);assert.deepEqual(clean.threewayCleanupFailures,[]);
});
test('direct-case failure receipt pure: persists original stack and available state/payload before aggregate report',async()=>{
  const source=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url),'utf8');
  const drivers=await readFile(new URL('./visual-state-audit-drivers.mjs',import.meta.url),'utf8');
  const start=source.indexOf('async function directCaseDriver('),end=source.indexOf('\ntry {',start),branch=source.slice(start,end);
  assert(branch.indexOf('const failureDiagnostics={threewayCleanupFailures:[]};')<branch.indexOf('await page.addInitScript'));
  assert(branch.includes('runRequestedStateActions(contract,root,step,failureDiagnostics)'));
  assert(branch.includes('await persistDirectCaseFailure('));assert(branch.includes('errorStack:error?.stack??null'));
  assert(branch.includes('failureReceiptWriteError'));assert(branch.includes('probeFailureStateAndPayload('));
  const presenceStart=drivers.indexOf("if(contract.focusedSequence==='workspace-native-presence-follow')"),presenceEnd=drivers.indexOf("if(contract.focusedSequence==='native-embed-open-host')",presenceStart),presence=drivers.slice(presenceStart,presenceEnd);
  assert(presence.indexOf("catch(error){primaryError=error;await retainFailurePayload(failureDiagnostics,'presenceNativeEvents',native);throw error;}")<presence.indexOf('finally{await cleanupPreservingPrimary'));
  const primary=new Error('native action failed'),receipts=[{action:'presence-follow-ada'}],currentState={following:'ada'},nativePayload=[{type:'click',trusted:true,control:'ada'}];
  let written;
  const result=await persistDirectCaseFailure({caseId:'presence-ada',error:primary,receipts,currentState,nativePayload},async receipt=>{written=receipt;});
  assert.equal(written,result,'The per-case receipt is handed to persistence immediately');
  assert.deepEqual(result,{caseId:'presence-ada',error:{name:'Error',message:'native action failed',stack:primary.stack},receipts,currentState,nativePayload});
  assert.equal(result.error.stack,primary.stack);assert.equal(result.nativePayload[0].control,'ada');
  assert(!('expected' in result)&&!('observed' in result),'Failure evidence must not be rewritten as an expected/observed assertion');
  const diagnostics={};let liveEvents=[...nativePayload];const cleanupFailure=new Error('native listener cleanup failed'),stateFailure=new Error('current state unavailable');
  const failBeforeCleanup=async()=>{let primaryError;try{try{throw primary;}catch(error){primaryError=error;await retainFailurePayload(diagnostics,'presenceNativeEvents',async()=>liveEvents.slice());throw error;}}finally{await cleanupPreservingPrimary(async()=>{liveEvents=null;throw cleanupFailure;},primaryError,diagnostics);}};
  await assert.rejects(failBeforeCleanup(),error=>error===primary,'Cleanup must not replace the exact original assertion error');
  assert.deepEqual(diagnostics.presenceNativeEvents,nativePayload,'Native events are retained before cleanup removes them');
  assert.equal(liveEvents,null);
  const failedProbe=await probeFailureStateAndPayload(diagnostics,async()=>{throw stateFailure;},async()=>liveEvents);
  assert.equal(failedProbe.currentState,null);assert.deepEqual(failedProbe.nativePayload,nativePayload,'Rejecting state probe must not erase or suppress the pre-cleanup native payload');
  assert.deepEqual(failedProbe.diagnosticError.map(({phase})=>phase),['cleanup','current-state']);
  assert.equal(failedProbe.diagnosticError[0].message,cleanupFailure.message);assert.equal(failedProbe.diagnosticError[1].message,stateFailure.message);
  const writeFailure=new Error('receipt disk failure');
  await assert.rejects(persistDirectCaseFailure({caseId:'presence-ada',error:primary,receipts,currentState,nativePayload},async()=>{throw writeFailure;}),error=>error===writeFailure);
});

test('threeway direct pure: canonical three steps preserve registered unsupported boundary',()=>{
  const contract=requestedStateContract('git/ThreeWayMerge');
  assert.deepEqual(contract.steps.map(step=>step.id),['choose-theirs','edit-merged','submit-merged']);
  assert.equal(contract.requestedStateOnly,true);assert.equal(contract.fixtureGuards.action,'operate');
  for(const identity of ['git/ConflictResolver','git/ThreeWayMergeExtra','editor/ThreeWayMerge'])assert.equal(requestedStateContract(identity),null);
  assert(contract.steps.every(step=>step.source.siteId.startsWith('threeway-state:')));
  assert(contract.scope.includes('registered submitData site remain unapproved'));
});

test('threeway direct pure: independent source pins and behavioral fixture differ from preview',async()=>{
  for(const [path,expected]of Object.entries(threewaySourcePins)){
    const bytes=await readFile(new URL('../../../../'+path,import.meta.url));
    assert.equal(createHash('sha256').update(bytes).digest('hex'),expected,path);
    const changed=Buffer.from(bytes);changed[0]^=1;
    assert.notEqual(createHash('sha256').update(changed).digest('hex'),expected);
  }
  const fixture=await readFile(new URL('../../../../internal/gallery/advanced_workspace_fixtures.go',import.meta.url),'utf8');
  assert(fixture.includes('"return callerOld", "return callerBase", "return callerNew", "return callerOld", true'));
  assert(fixture.includes('props["PreviewExamples"] = []map[string]any{source}'));
  const source=runRequestedStateActions.toString(),start=source.indexOf("if(contract.focusedSequence==='threeway-native-submit')"),end=source.indexOf("if(contract.focusedSequence==='license-native-selection-scroll')",start),branch=source.slice(start,end);
  assert(branch.includes("node.parentElement===record.querySelector('[data-audit-main]')"));
  assert(branch.includes("root.locator(':scope > form[data-ws-merge]')"));
  assert(branch.includes(".press('Tab')"));assert(!branch.includes('.focus('));assert(!branch.includes('force:'));
  assert(branch.indexOf('contract.threewayEvidence.push({stage,state})')<branch.indexOf('assertThreewayState(state'));
});

function threewayPureFixture(stage){
  const id='merge-primary',component='git/ThreeWayMerge',twin={html:'independent twin',fields:[['merged','return callerOld',undefined]]},edited=['edit-merged','submit-merged'].includes(stage),initial=stage==='initial';
  const events=initial?[]:[{type:'ely:change',detail:{id,component,name:'resolution',value:'theirs',checked:true,type:'radio'}},{type:'ely:change',detail:{id,component,name:'merged',value:'return callerNew'}}];
  const native=initial?[]:[['click','resolution','theirs'],['input','resolution','theirs'],['change','resolution','theirs']];
  if(edited){events.push({type:'ely:change',detail:{id,component,name:'merged',value:'resolved caller value',checked:undefined,type:'textarea'}});native.push(['input','merged','resolved caller value'],['change','merged','resolved caller value']);}
  if(stage==='submit-merged'){events.push({type:'ely:action',detail:{id,component,action:'operate',submitter:'',formData:[['resolution','theirs'],['merged','resolved caller value']],values:[['resolution','theirs'],['merged','resolved caller value']]},actualFormData:true});native.push(['click','',''],['submit',null,null]);}
  const timeline=initial?[]:['click','input','change','ely:change:resolution','ely:change:merged'];
  if(edited)timeline.push('input','change','ely:change:merged');
  if(stage==='submit-merged')timeline.push('click','submit','ely:action:operate');
  return {id,stage,twin,state:{primary:true,id,component,kind:'ThreeWayMerge',panes:[['ours','main','return callerOld'],['base','base','return callerBase'],['theirs','feature/caller','return callerNew']],action:'operate',required:true,disabled:false,checked:[initial?'ours':'theirs'],value:initial?'return callerOld':edited?'resolved caller value':'return callerNew',status:initial?'':'Selected theirs.',twin:structuredClone(twin),twinEvents:[],events,timeline,native:native.map(([type,name,value])=>({type,name,value,trusted:true}))}};
}
test('threeway direct pure: exact state event FormData and native order positives',()=>{
  for(const stage of ['initial','choose-theirs','edit-merged','submit-merged']){const fixture=threewayPureFixture(stage);assertThreewayState(fixture.state,fixture);}
});
test('threeway direct pure: causal identity payload order trust twin and preview negatives',()=>{
  const defects=[
    state=>state.primary=false,state=>state.component='git/ConflictResolver',state=>state.id='foreign',state=>state.panes[2][2]='wrong source',state=>state.required=false,state=>state.disabled=true,state=>state.checked=['ours'],state=>state.value='wrong draft',state=>state.status='Saved',state=>state.twin.fields[0][1]='mutated',state=>state.twinEvents.push('change'),
    state=>state.events.pop(),state=>state.events.push(state.events.at(-1)),state=>state.events.reverse(),state=>state.events.at(-1).detail.action='resolve-conflict',state=>state.events.at(-1).detail.id='twin',state=>state.events.at(-1).actualFormData=false,state=>state.events.at(-1).detail.formData.reverse(),state=>state.events.at(-1).detail.values[1][1]='stale',state=>state.events.at(-1).detail.formData.push(['extra','value']),state=>state.native[0].trusted=false,state=>state.native.splice(3,1),state=>state.native.reverse(),state=>state.timeline.reverse(),
  ];
  for(const defect of defects){const fixture=threewayPureFixture('submit-merged');defect(fixture.state);assert.throws(()=>assertThreewayState(fixture.state,fixture));}
});

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
      const row={width,theme,negativeControl:old,captures:[]};receipt.cases.push(row);
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
        await page.evaluate(()=>{
          window.menuFocus=[];window.menuSelect=[];window.menuTimeline=[];
          const panel=document.getElementById('main-popup'),trigger=document.querySelector('#main [data-ui-menu-trigger]');
          const identity=node=>node?.id||node?.getAttribute('href')||node?.tagName||null;
          const rect=node=>{const r=node.getBoundingClientRect();return {left:r.left,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};
          window.menuSnapshot=(checkpoint,event)=>{const entry={sequence:menuTimeline.length,time:performance.now(),checkpoint,target:identity(event?.target),active:identity(document.activeElement),open:panel.matches(':popover-open'),expanded:trigger.getAttribute('aria-expanded'),panel:rect(panel),trigger:rect(trigger)};if(event){entry.oldState=event.oldState;entry.newState=event.newState;}menuTimeline.push(entry);return entry;};
          for(const type of ['beforetoggle','toggle'])panel.addEventListener(type,event=>menuSnapshot(type,event),true);
          document.addEventListener('focusin',event=>{const entry=menuSnapshot('focusin',event);if(panel.contains(event.target))menuFocus.push({left:entry.panel.left,top:entry.panel.top,target:entry.target,trigger:entry.trigger});});
          document.getElementById('main').addEventListener('ui:select',e=>menuSelect.push({trusted:e.isTrusted,detail:e.detail}));
          menuSnapshot('before-click');
        });
        await trigger.click();await page.evaluate(()=>menuSnapshot('after-click'));
        await page.waitForFunction(()=>document.getElementById('main-popup').matches(':popover-open'));await page.evaluate(()=>menuSnapshot('after-open-predicate'));
        const geometry=()=>root.evaluate(node=>{const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,top:r.top,bottom:r.bottom,width:r.width,height:r.height};};return {trigger:rect(node.querySelector('[data-ui-menu-trigger]')),panel:rect(node.querySelector('[popover]')),viewport:{width:document.documentElement.clientWidth,height:document.documentElement.clientHeight},active:document.activeElement.closest('[role=menuitem]')!==null};});
        const check=g=>{const left=Math.max(8,Math.min(g.trigger.left,g.viewport.width-g.panel.width-8)),below=g.trigger.bottom+6,above=g.trigger.top-g.panel.height-6;const top=Math.max(8,Math.min(below+g.panel.height>g.viewport.height-8?above:below,g.viewport.height-g.panel.height-8));assert(Math.abs(g.panel.left-left)<=1);assert(Math.abs(g.panel.top-top)<=1);assert(g.panel.top>=8&&g.panel.left>=8);assert(g.panel.left+g.panel.width<=g.viewport.width-7);};
        const initial=await geometry();row.initial=initial;
        if(old){assert.equal(initial.panel.left,0);assert.equal(initial.panel.top,0);assert.throws(()=>check(initial),'Old source must fail actual adjacency');continue;}
        check(initial);
        await page.waitForFunction(()=>document.activeElement===document.querySelector('#main-popup [href="#caller-first"]')&&menuFocus.some(entry=>entry.target==='#caller-first'));
        await page.evaluate(()=>menuSnapshot('after-initial-focus-wait'));row.initialFocused=await geometry();check(row.initialFocused);
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
      }finally{
        try{row.focusDiagnostics=await page.evaluate(()=>typeof menuSnapshot==='function'?{final:menuSnapshot('case-final'),timeline:menuTimeline,focus:menuFocus}:null);}catch(error){row.diagnosticError=String(error);}
        await context.close();
      }
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

test('direct action runner keeps private scratch under OS temp while evidence stays in output',async()=>{
  const source=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url),'utf8');
  assert.match(source,/import \{[^}]*\btmpdir\b[^}]*\} from 'node:os'/);
  assert.match(source,/runDir = await mkdtemp\(resolve\(tmpdir\(\), 'elysdui-visual-action-'\)\)/);
  assert.doesNotMatch(source,/mkdtemp\(resolve\(options\.output/,'Private scratch must not consume the evidence-output filesystem');
  assert.match(source,/const captures = resolve\(options\.output, 'captures'\)/,'Captures remain in the requested evidence directory');
  assert.match(source,/resolve\(options\.output, 'resources\.json'\)/,'Resource receipts remain in the requested evidence directory');
  assert.match(source,/await rm\(runDir, \{recursive: true, force: true\}\)/,'The exact owned scratch directory is still removed in finally');
  assert.match(source,/temporaryDirectoryRemoved: true/,'Cleanup continues to be recorded in the resource receipt');
  const output=await mkdtemp(join(tmpdir(),'elysdui-audit-output-')),runDir=await mkdtemp(resolve(tmpdir(),'elysdui-visual-action-'));
  try{assert(!runDir.startsWith(output+sep),'The private run directory is not nested in this evidence output directory');}
  finally{await rm(runDir,{recursive:true,force:true});await rm(output,{recursive:true,force:true});}
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
test('license direct pure: exact identity ten bounded steps and capture cap',()=>{
  const contract=requestedStateContract('misc/LicenseViewer');
  assert.equal(contract.requestedStateOnly,true);assert.equal(contract.kind,'LicenseViewer');
  assert.deepEqual(contract.steps.map(step=>step.id),['inspect-license','pick-inter','next-jetbrains','wrap-first','wrap-last','home-first','next-lucide','end-last','scroll-license-horizontal','scroll-license-text']);
  assert.equal(contract.steps.length*2*contract.captureLimits.totalRows,100);assert.equal(contract.captureLimits.totalPNGs,200);assert.equal(contract.captureLimits.wheelAttemptsPerAxis,6);
  for(const identity of ['misc/LicenseViewerExtra','misc/Licenses','misc/Changelog'])assert.equal(requestedStateContract(identity),null);
});
test('license endpoint pure: skip only zero-area trailing fragments and keep the last painted line fully clipped',()=>{
  const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top}),clip={left:0,top:0,right:100,bottom:100};
  const painted=rect(80,90,96,98),terminalNewline=rect(96,98,96,98);
  assert.deepEqual(lastPaintedLicenseFragment([painted,terminalNewline],clip),{rect:painted,visible:true});
  const clippedLastLine=rect(96,90,104,98);
  assert.deepEqual(lastPaintedLicenseFragment([painted,clippedLastLine,terminalNewline],clip),{rect:clippedLastLine,visible:false},'A clipped last painted fragment cannot fall back to an earlier visible fragment');
  assert.deepEqual(lastPaintedLicenseFragment([terminalNewline,rect(10,10,10,20)],clip),{rect:null,visible:false},'No positive-area painted range fragment is a failure');
  assert.deepEqual(lastPaintedLicenseFragment([rect(10,10,10,20)],clip),{rect:null,visible:false},'Whitespace-only zero-width lines are not painted evidence');
  assert.deepEqual(lastPaintedLicenseFragment([],clip),{rect:null,visible:false},'Empty/all-whitespace content cannot silently pass');
  assert.deepEqual(lastPaintedLicenseFragment([painted],clip,false),{rect:null,visible:false},'Whitespace-only content cannot pass merely because layout reports a positive-area box');
  assert.deepEqual(lastPaintedLicenseFragment([rect(-2,20,8,30)],clip),{rect:rect(-2,20,8,30),visible:false},'Positive-area fragments must retain full-width viewport containment');
});
test('license direct pure: independent complete fixture and event-shaped state negatives',async()=>{
  const items=JSON.parse(await readFile(new URL('../../../../internal/gallery/assets/native-misc-fixtures.json',import.meta.url),'utf8')).LicenseViewer.Items;
  const initial={twin:'independent twin'},source=runRequestedStateActions.toString();
  const block=source.match(/const verifyLicenseSelection = \(state,index\) => \{[\s\S]*?\n    \};/)[0];
  const verify=compileFunction(`${block}\nreturn verifyLicenseSelection`,['assert','items','initial'])(assert,items,initial);
  const state={buttons:items.map((item,i)=>({label:item.Label,version:item.Version,license:item.License,content:item.Content,pressed:String(i===2)})),title:'Inter 4.1',license:'OFL-1.1',content:items[2].Content,twin:initial.twin,twinEvents:[]};
  verify(state,2);
  for(const mutate of [s=>s.content+='x',s=>s.title='Inter',s=>s.buttons[0].pressed='true',s=>s.buttons[2].content='DOM-derived fake',s=>s.twin='changed',s=>s.twinEvents.push('ely:change')]){const broken=structuredClone(state);mutate(broken);assert.throws(()=>verify(broken,2));}
  assert(source.includes("state.events.slice(before.events.length),[{type:'ely:change',detail:{id,component:contract.identity,package:items[index].Label}}]"));
  assert(source.includes("assert.deepEqual(state.events,before.events)"));
  assert(source.includes("assert.equal(ending.sha256,fixture.sha256"));
  assert(!source.includes('scrollTo('));
});
test('license direct pure: actual production key receiver index wrap focus and disabled guard',async()=>{
  const source=await readFile(new URL('../../assets/ely-api-native-misc.js',import.meta.url),'utf8');
  const branch=source.slice(source.indexOf("const licenses=q('[data-misc-licenses]');"),source.indexOf("all('[data-native-dialog]')"));
  const events=[],handlers=new Map();let disabledValue=false,focused=-1;
  const buttons=Array.from({length:4},(_,i)=>({dataset:{title:String(i),version:'v',license:'l',content:'plain'+i},setAttribute(_name,value){this.pressed=value;},focus(){focused=i;}}));
  const title={},name={},pre={},section={querySelectorAll:()=>buttons,querySelector:selector=>selector==='pre'?pre:selector==='[data-license-title]'?title:name};
  compileFunction(branch,['q','root','change','disabled','on'])(()=>section,{},(_root,detail)=>events.push(detail.package),()=>disabledValue,(button,type,fn)=>{handlers.set(`${buttons.indexOf(button)}:${type}`,fn);});
  assert.deepEqual(events,['0'],'Initializer selection emits before action baseline');
  for(const [receiver,key,want]of [[2,'ArrowDown',3],[3,'ArrowDown',0],[0,'ArrowUp',3],[3,'Home',0],[0,'ArrowDown',1],[1,'End',3]]){let prevented=false;handlers.get(`${receiver}:keydown`)({key,preventDefault(){prevented=true;}});assert(prevented);assert.equal(focused,want);assert.equal(events.at(-1),String(want));assert.equal(pre.textContent,'plain'+want);}
  const count=events.length;handlers.get('0:keydown')({key:'ArrowRight',preventDefault(){throw Error('Unsupported key prevented');}});assert.equal(events.length,count);
  disabledValue=true;handlers.get('2:click')();handlers.get('2:keydown')({key:'Home',preventDefault(){throw Error('Disabled key prevented');}});assert.equal(events.length,count);assert.equal(focused,3);
});
test('websocket direct pure: canonical source-backed identity preserves twelve socket steps plus one history-reveal checkpoint',()=>{
  const contract=requestedStateContract('devtools/WebSocketConsole');
  assert.equal(contract.identity,'devtools/WebSocketConsole');assert.equal(contract.kind,'WebSocketConsole');assert.equal(contract.requestedStateOnly,true);
  assert.equal(contract.focusedSequence,'websocket-public-host-boundary');
  assert.deepEqual(contract.steps.map(step=>step.id),['empty-enter','type-ping','send-enter','type-pong','send-button','request-disconnect','host-ack-closed','type-closed-draft','closed-enter','clear-closed-draft','request-connect','host-ack-open','history-wheel-reveal']);
  assert(contract.steps[12].expectedState.includes('complete first history row'));
  assert(contract.steps[12].event.includes('native'));
  assert(contract.steps.filter(step=>step.id.startsWith('host-ack-')).every(step=>step.event.startsWith('synthetic controlled host acknowledgement')));
  assert(contract.steps.every(step=>step.source.sourceAnchor===null&&step.source.provenance.includes('no registered-site or networking approval')));
  for(const identity of ['devtools/WebSocket','devtools/WebSocketConsoleExtra','devtools/SocketConsole','devtools/ConnectionManager','devtools/ResponseViewer'])assert.equal(requestedStateContract(identity),null);
});
test('websocket direct pure: actual sequence preserves drafts messages native ordering and rerender ownership',async()=>{
  const full=runRequestedStateActions.toString(),start=full.indexOf("    if(contract.focusedSequence==='websocket-public-host-boundary'){"),end=full.indexOf("    if(['sheet-native-actions'",start);
  assert(start>=0&&end>start);const branch=full.slice(start,end);
  const core=await readFile(new URL('../../assets/ely-api.js',import.meta.url),'utf8'),devtools=await readFile(new URL('../../assets/ely-api-workspace-devtools.js',import.meta.url),'utf8');
  assert(core.includes("root.addEventListener('change', change)")&&core.includes("name: event.target.name,")&&core.includes("value: event.target.value, checked: event.target.checked, type: event.target.type"),'Named native changes must produce the public detail from the changed control');
  assert(devtools.includes("field('A message to send',state.draft||'',v=>{state.draft=v;send.disabled=disabled||!connected||!v.trim();},'text',{'data-dt-socket-draft':''})"),'WebSocketConsole keeps its named draft input as the event source');
  const labels=['empty-enter','type-ping','send-enter','type-pong','send-button','request-disconnect','host-ack-closed','type-closed-draft','closed-enter','clear-closed-draft','request-connect','host-ack-open','history-wheel-reveal'];
  const run=async defect=>{
    const url='wss://stream.example.com/orders',identity='devtools/WebSocketConsole',id='socket-main';
    const rows=[['ⓘ',`Connected to ${url}`,'10m'],['↗',JSON.stringify({type:'subscribe',channel:'orders'},null,2),'10m'],['↙',JSON.stringify({type:'order',id:1011,total:42.5},null,2),'2m']];
    const state={state:'open',draft:'',rows,revision:0},timeline=[],actions=[],publicEvents=[],receipts=[];let cursor=0,dirty=false,committedDraft='',cleaned=false,initialized=false,historyScrollTop=180;
    const snapshot=()=>({state:state.state,url,draft:state.draft,sendDisabled:defect==='enabled-closed'&&state.state==='closed'?false:state.state!=='open'||!state.draft.trim(),toggleDisabled:false,toggle:state.state==='open'?'Disconnect':'Connect',rows:structuredClone(state.rows),model:defect==='model-drift'&&actions.length?'changed model':'original fixture model'});
    const native=(type,key=null,control='draft')=>timeline.push({type,key,control,value:state.draft,trusted:defect!=='untrusted',name:'A message to send',checked:false,inputType:'text'});
    const change=()=>{
      const detail={id,component:identity,name:'A message to send',value:state.draft,checked:false,type:'text'};
      if(defect==='wrong-change')detail.value='incorrect';
      const event={type:'ely:change',detail};
      if(defect==='reordered-change')pendingChanges.push(event);else if(defect!=='missing-change')publicEvents.push(event);
      if(defect==='duplicate-change')publicEvents.push(event);
    };
    let pendingChanges=[];
    const commitDraft=()=>{if(!dirty)return;if(state.draft!==committedDraft){native('change');change();}committedDraft=state.draft;dirty=false;};
    const emit=detail=>{
      detail={...detail,id,component:identity};
      if(defect==='wrong-url')detail.url='wss://foreign.example';
      if(defect==='wrong-id')detail.id='foreign';
      if(defect==='wrong-component')detail.component='devtools/Other';
      if(defect==='wrong-text'&&detail.action==='send-socket')detail.text='wrong';
      if(defect==='wrong-state'&&detail.action==='toggle-socket')detail.state='opening';
      const event={type:'ely:action',detail};actions.push(event);
      publicEvents.push(event);
      if(defect==='reordered')timeline.unshift(event);else timeline.push(event);
      if(defect==='duplicate'){actions.push(event);timeline.push(event);}
      if(pendingChanges.length){publicEvents.push(...pendingChanges);pendingChanges=[];}
    };
    const send=()=>{if(state.state==='open'&&state.draft.trim()){emit({action:'send-socket',text:state.draft,url});if(defect!=='uncleared')state.draft='';if(defect==='fabricated')state.rows.push(['↗','new','now']);if(defect==='reordered-messages')state.rows.reverse();if(defect==='altered-message')state.rows[0][1]='changed';}};
    const root={evaluate:async(fn,arg)=>{
      const text=fn.toString();
      if(text.includes('const host=node.querySelector'))return snapshot();
      if(text.includes("const log=node.querySelector('[data-dt-socket-log]')"))return {scrollTop:historyScrollTop,scrollHeight:460,clientHeight:280,scrollMax:180,firstRowText:rows[0].join(''),firstRowFullyVisible:historyScrollTop===0,rowRect:{top:0,bottom:40,left:0,right:320},clip:{top:0,bottom:280,left:0,right:320}};
      if(text.includes('node.__visualSocketNative=[]')){initialized=true;return;}
      if(text.includes('node.removeEventListener')){cleaned=true;return;}
      if(text.includes("node.dispatchEvent(new CustomEvent('ely:result'")){
        timeline.push({type:'ely:result',trusted:false,root:defect!=='foreign-host-root',action:'toggle-socket',state:arg});
        if(defect!=='ignored-host'){state.state=arg;state.revision++;dirty=false;committedDraft=state.draft;}return true;
      }
      if(text.includes('node.__visualSocketTwinEvents'))return defect==='twin-event'&&state.revision?['ely:result']:[];
      if(text.includes('node.__visualSocketNative'))return timeline;
      assert.fail('Unmodelled root evaluation: '+text);
    },locator:selector=>{
      const revision=state.revision;
      const current=()=>assert.equal(revision,state.revision,'A stale control survived host rerender');
      return {hover:async()=>{},boundingBox:async()=>({height:280}),pressSequentially:async value=>{current();for(const character of value){native('keydown',character);state.draft+=character;dirty=true;native('input');native('keyup',character);}},
        press:async key=>{current();native('keydown',key);if(key==='Enter'){if(defect==='unexpected-change'&&!state.draft)publicEvents.push({type:'ely:change',detail:{id,component:identity,name:'unexpected',value:'',checked:false,type:'text'}});send();if(defect==='cleared-closed'&&state.state==='closed')state.draft='';}else if(key==='Backspace'){state.draft='';dirty=true;native('input');}native('keyup',key);},
        click:async()=>{current();const control=selector.includes('socket-send')?'send':'toggle';commitDraft();native('click',null,control);if(control==='send')send();else{emit({action:'toggle-socket',state:state.state,url});if(defect==='optimistic')state.state=state.state==='open'?'closed':'open';}},
      };
    },page:()=>({mouse:{wheel:async(_x,deltaY)=>{historyScrollTop=deltaY<0?0:Math.min(180,historyScrollTop+deltaY);timeline.push({type:'wheel',trusted:true,deltaY,control:'history-log'});}},evaluate:async()=>{}})};
    const begin=async()=>{cursor=publicEvents.length;};
    const fresh=async()=>{assert.notEqual(defect==='twin-html'&&state.revision>0,true,'Independent twin drift');return publicEvents.slice(cursor);};
    const runStep=async(label,action,verify)=>{assert.equal(label,labels[receipts.length]);const before=snapshot();await action();const result=await verify();receipts.push({label,before,after:snapshot(),result});};
    const executeBranch=compileFunction(`return (async()=>{${branch}})();`,['contract','root','runStep','begin','fresh','id','identity','assert','clickVisibleControl']);
    try{await executeBranch(requestedStateContract(identity),root,runStep,begin,fresh,id,identity,assert,async control=>control.click());}
    finally{if(initialized)assert.equal(cleaned,true,'Observers must be removed on success or rejection');}
    assert.deepEqual(receipts.map(receipt=>receipt.label),labels);assert.equal(state.revision,2);
    assert.equal(receipts[8].after.draft,'queued');assert.equal(receipts[6].after.state,'closed');assert.equal(receipts[11].after.state,'open');
    assert.deepEqual(actions.map(event=>event.detail.action),['send-socket','send-socket','toggle-socket','toggle-socket']);
    assert.deepEqual(receipts[4].result.events.map(event=>[event.type,event.detail]),[{type:'ely:change',detail:{id,component:identity,name:'A message to send',value:'pong',checked:false,type:'text'}},{type:'ely:action',detail:{id,component:identity,action:'send-socket',text:'pong',url}}].map(event=>[event.type,event.detail]));
    assert.deepEqual(receipts[10].result.events.map(event=>[event.type,event.detail]),[['ely:action',{id,component:identity,action:'toggle-socket',state:'closed',url}]],'Clearing back to the committed empty draft must not fabricate a change notification');
  };
  await run(null);
  for(const defect of ['wrong-url','wrong-id','wrong-component','wrong-text','wrong-state','duplicate','reordered','untrusted','uncleared','fabricated','reordered-messages','altered-message','model-drift','enabled-closed','optimistic','foreign-host-root','ignored-host','cleared-closed','twin-event','twin-html','wrong-change','missing-change','duplicate-change','reordered-change','unexpected-change'])await assert.rejects(()=>run(defect),defect);
});
test('direct action verification: delivers the owned receipt before a failing canvas oracle',async()=>{
  const before={stage:{width:308,height:461},view:{x:-20,y:-30,zoom:.75},grid:{count:312,configuration:{spacing:100}},rulers:{count:12,configuration:{spacing:100}}};
  const after={stage:{width:308,height:460},view:{x:44,y:-30,zoom:.75},grid:{count:299,configuration:{spacing:100}},rulers:{count:12,configuration:{spacing:100}}};
  const detail={action:'change-viewport',view:after.view},inputs=[{type:'wheel',trusted:true,targetStage:true,deltaX:48,deltaY:0,defaultPrevented:true}];
  const beforePaint={count:1,text:'1100',rect:{left:300,top:20,right:320,bottom:30},clip:{left:0,top:0,right:308,bottom:461}};
  const afterPaint={count:1,text:'1100',rect:{left:250,top:20,right:270,bottom:30},clip:{left:0,top:0,right:308,bottom:461}};
  const receipt={beforeState:{geometry:before},afterState:{geometry:after}},evidence={before,after,detail,nativeEvents:[{type:'ely:action',detail}],nativeInputs:inputs,beforeTick:beforePaint,afterTick:afterPaint,pageScroll:{before:{x:0,y:0},after:{x:0,y:0}}};
  let oracleFailure;
  await assert.rejects(deliverDirectActionVerification(receipt,async(afterState,beforeState,delivered)=>{
    assert.strictEqual(delivered,receipt,'The shared action-step verifier must deliver its exact receipt');
    assert.strictEqual(afterState,receipt.afterState);assert.strictEqual(beforeState,receipt.beforeState);
    delivered.canvasRulerPanEvidence=evidence;
    try{assertCanvasRulerPan(before,after,detail,{inputs,beforePaint,afterPaint});}catch(error){oracleFailure=error;throw error;}
  }),error=>error===oracleFailure);
  assert(oracleFailure instanceof assert.AssertionError);
  assert.match(oracleFailure.message,/must not change the stage/);
  assert.deepEqual(receipt.canvasRulerPanEvidence,evidence,'Captured before/after geometry remains on the receipt even when the oracle throws');
  assert.equal(receipt.assertionsPassed,undefined,'A failed oracle cannot mark the action passed');
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
    const steps=requestedStateContract(identity).steps.map(step=>step.id);
    assert.deepEqual(steps,['canvas/CanvasGrid','canvas/Guides'].includes(identity)?['pan-ruler-1100','zoom-in','fit-canvas','navigate-minimap']:['zoom-in','fit-canvas','navigate-minimap']);
    assert.equal(requestedStateContract(identity).requestedStateOnly,true);
  }
  assert.equal(identities.reduce((count,identity)=>count+requestedStateContract(identity).steps.length,0),26,'The eight aliases declare 26 focused actions per profile: three for six IDs and four for CanvasGrid/Guides');
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
    await page.setContent(`<style>body{margin:0}#main{width:500px;height:30px}#panel{position:absolute;left:0;top:35px;width:200px;height:120px;background:white;border:1px solid black;border-radius:8px;z-index:2}#peer{position:absolute;top:60px;width:500px;height:30px}#peer button{position:relative;z-index:1;margin-left:20px}#outside{position:absolute;top:250px}</style>
      <div data-audit-main><div id="main" data-ely-family="interaction"><span id="nested"><button aria-controls="panel">Open</button></span><aside id="panel" role="region"><strong>Owned source content</strong></aside></div></div>
      <div data-audit-twin><div id="peer" data-ely-family="interaction"><button>Twin content</button></div></div>
      <div data-audit-twin><div id="outside" data-ely-family="interaction"><div role="menu">Unrelated outside camera</div></div></div>
      <aside id="nested-portal" role="region" data-ely-owner="nested" style="position:absolute;top:300px">Nested owner portal</aside>`);
    const originalHTML=await page.content(),inventory=await page.locator('#main').evaluate(ownedOverlayInventory);
    const peerButton=page.locator('#peer button'),originalPeerButtonStyle=await peerButton.getAttribute('style');
    assert.deepEqual(inventory.filter(item=>item.owned).map(item=>item.id),['panel','nested-portal']);
    assert.equal(inventory.find(item=>item.id==='panel').openerReferences[0].ariaControls,'panel');
    const context=await captureTargetPNG(page,page.locator('#main'));
    assert(context.foreignDOMIntersections.some(item=>item.id==='peer'),'Broad root image retains exposed twin paint as context');
    const panel=await captureTargetPNG(page,page.locator('#panel'));
    assert.deepEqual(panel.foreignDOMIntersections,[],'Opaque higher-stacked panel covers the twin paint, not merely its layout box');
    assert(panel.occludedForeignPaint.some(item=>item.id==='peer'));
    await peerButton.evaluate(node=>{node.style.zIndex='3';});
    assert((await captureTargetPNG(page,page.locator('#panel'))).foreignDOMIntersections.some(item=>item.id==='peer'),'Higher local foreign z-index remains blocking');
    await peerButton.evaluate((node,style)=>{if(style===null)node.removeAttribute('style');else node.setAttribute('style',style);},originalPeerButtonStyle);
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

test('action camera clips scroll-well text through rounded overflow and keeps visible corner and escaping paint foreign',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:600,height:400}});
    await page.setContent(`<style>body{margin:0;height:400px}#target{position:absolute;left:30px;top:120px;width:220px;height:40px;background:white}.scroll-well{position:relative;box-sizing:border-box;width:220px;height:40px;margin-top:70px;overflow:hidden;border:1px solid #888;border-radius:.5rem;background:white}.scroll-well>.scroll{width:100%;height:100%;overflow-y:auto}.scroll-copy{margin:55px 0 0;line-height:18px}#visible-peer{width:220px;height:30px;margin-top:15px}#visible-peer span{background:red}</style>
      <div data-audit-main><div id="target" data-ely-family="workspace">Target</div></div>
      <div data-audit-twin><div id="clipped-peer" class="scroll-well" data-ely-family="workspace"><div class="scroll"><p id="clipped-copy" class="scroll-copy">Clipped foreign text</p></div></div></div>
      <div data-audit-twin><div id="visible-peer" data-ely-family="workspace"><span>Visible foreign text</span></div></div>`);
    const geometry=await page.evaluate(()=>{const r=document.createRange(),text=document.querySelector('#clipped-copy').firstChild;r.selectNodeContents(text);const raw=r.getBoundingClientRect(),peer=document.querySelector('#clipped-peer').getBoundingClientRect(),target=document.querySelector('#target').getBoundingClientRect();return {raw:{top:raw.top,bottom:raw.bottom},peer:{top:peer.top,bottom:peer.bottom},target:{top:target.top,bottom:target.bottom}};});
    assert(geometry.peer.bottom<=geometry.target.top,'The clipped scroll root must stay outside the target camera');
    assert(geometry.raw.top<geometry.target.bottom&&geometry.raw.bottom>geometry.target.top,'Its raw text range must cross into the target camera');
    const clipped=await captureTargetPNG(page,page.locator('#target'));
    assert.deepEqual(clipped.foreignDOMIntersections.map(peer=>peer.id),['visible-peer'],'Invisible overflow text is excluded while visible paint inside the camera stays foreign');
    await page.locator('#clipped-peer>.scroll').evaluate(node=>{node.style.overflow='visible';node.parentElement.style.overflow='visible';});
    const visibleGeometry=await page.evaluate(()=>{const peer=document.querySelector('#clipped-peer'),inner=peer.firstElementChild,text=document.querySelector('#clipped-copy').firstChild,range=document.createRange();range.selectNodeContents(text);const paint=range.getBoundingClientRect(),target=document.querySelector('#target').getBoundingClientRect();return {outerOverflow:getComputedStyle(peer).overflow,innerOverflow:getComputedStyle(inner).overflow,paint:{top:paint.top,bottom:paint.bottom},target:{top:target.top,bottom:target.bottom}};});
    assert(visibleGeometry.outerOverflow==='visible'&&visibleGeometry.innerOverflow==='visible'&&visibleGeometry.paint.top<visibleGeometry.target.bottom&&visibleGeometry.paint.bottom>visibleGeometry.target.top,'Both overflow ancestors are visible and the text paint overlaps the camera');
    assert((await captureTargetPNG(page,page.locator('#target'))).foreignDOMIntersections.some(peer=>peer.id==='clipped-peer'),'Visible overflow text crossing the camera remains foreign');
    await page.locator('#clipped-peer>.scroll').evaluate(node=>{node.style.overflow='auto';node.style.transform='translateZ(0)';});
    assert((await captureTargetPNG(page,page.locator('#target'))).foreignDOMIntersections.some(peer=>peer.id==='clipped-peer'),'A transformed clipping chain remains conservative');
    for(const [property,value] of [['translate','1px 0'],['rotate','1deg'],['scale','1.01']]){
      const computed=await page.locator('#clipped-peer>.scroll').evaluate((node,[name,next])=>{node.style.transform='none';node.style.translate='none';node.style.rotate='none';node.style.scale='none';node.style[name]=next;const style=getComputedStyle(node);return {transform:style.transform,longhand:style[name]};},[property,value]);
      assert.equal(computed.transform,'none',`The ${property} case must not be masked by transform`);
      assert.notEqual(computed.longhand,'none',`Only the ${property} longhand is active`);
      assert((await captureTargetPNG(page,page.locator('#target'))).foreignDOMIntersections.some(peer=>peer.id==='clipped-peer'),`Individual ${property} keeps the raw overflowing paint foreign`);
    }
    await page.locator('#clipped-peer>.scroll').evaluate(node=>{node.style.transform='none';node.style.translate='none';node.style.rotate='none';node.style.scale='none';node.style.overflow='clip';node.style.overflowClipMargin='8px';});
    assert.equal(await page.locator('#clipped-peer>.scroll').evaluate(node=>getComputedStyle(node).overflowClipMargin),'8px');
    assert((await captureTargetPNG(page,page.locator('#target'))).foreignDOMIntersections.some(peer=>peer.id==='clipped-peer'),'Nonzero overflow clip margin remains conservative');
    await page.locator('#clipped-peer>.scroll').evaluate(node=>{node.style.overflow='auto';node.style.overflowClipMargin='0px';node.style.translate='none';node.style.rotate='none';node.style.scale='none';const text=node.querySelector('#clipped-copy');Object.assign(text.style,{position:'absolute',left:'30px',top:'55px',margin:'0'});});
    const escapedGeometry=await page.evaluate(()=>{const peer=document.querySelector('#clipped-peer'),inner=peer.firstElementChild,text=document.querySelector('#clipped-copy'),range=document.createRange();range.selectNodeContents(text.firstChild);const paint=range.getBoundingClientRect(),scroll=inner.getBoundingClientRect(),target=document.querySelector('#target').getBoundingClientRect();return {position:getComputedStyle(text).position,outerOverflow:getComputedStyle(peer).overflow,innerOverflow:getComputedStyle(inner).overflow,paint:{top:paint.top,bottom:paint.bottom},scroll:{top:scroll.top,bottom:scroll.bottom},target:{top:target.top,bottom:target.bottom}};});
    assert(escapedGeometry.position==='absolute'&&escapedGeometry.outerOverflow==='visible'&&escapedGeometry.innerOverflow==='auto'&&escapedGeometry.paint.top>=escapedGeometry.scroll.bottom&&escapedGeometry.paint.top<escapedGeometry.target.bottom&&escapedGeometry.paint.bottom>escapedGeometry.target.top,'Absolute paint escapes the inner scrollport and overlaps the camera');
    assert((await captureTargetPNG(page,page.locator('#target'))).foreignDOMIntersections.some(peer=>peer.id==='clipped-peer'),'An absolute descendant that escapes its overflow containing block remains foreign');
    await page.setContent(`<style>body{margin:0}#target{position:absolute;left:0;top:0;width:.1px;height:.1px;background:white}#fractional-peer{position:relative;width:40.4px;height:40.4px;margin:120.25px 0 0 30.25px}.fractional-clip{width:100%;height:100%;overflow:hidden;border:1.75px solid transparent;box-sizing:border-box}.fractional-paint{display:block;width:100%;height:100%;background:red}</style><div data-audit-main><div id="target" data-ely-family="workspace">Target</div></div><div data-audit-twin><div id="fractional-peer" data-ely-family="workspace"><div class="fractional-clip"><span id="fractional-paint" class="fractional-paint"></span></div></div></div>`);
    const fractional=await page.evaluate(()=>{const node=document.querySelector('.fractional-clip'),clip=node.getBoundingClientRect(),paint=document.querySelector('#fractional-paint').getBoundingClientRect(),targetNode=document.querySelector('#target'),legacy={left:clip.left+node.clientLeft,top:clip.top+node.clientTop,right:clip.left+node.clientLeft+node.clientWidth,bottom:clip.top+node.clientTop+node.clientHeight},gapRight=paint.right-legacy.right,gapBottom=paint.bottom-legacy.bottom,axis=gapRight>0?'x':gapBottom>0?'y':null;if(axis==='x')Object.assign(targetNode.style,{left:`${legacy.right+gapRight/2}px`,top:`${paint.top+paint.height/2}px`,width:`${gapRight/2}px`,height:'0.1px'});else if(axis==='y')Object.assign(targetNode.style,{left:`${paint.left+paint.width/2}px`,top:`${legacy.bottom+gapBottom/2}px`,width:'0.1px',height:`${gapBottom/2}px`});const target=targetNode.getBoundingClientRect(),intersects=(a,b)=>a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top;return {clip:{left:clip.left,right:clip.right,top:clip.top,bottom:clip.bottom},paint:{left:paint.left,right:paint.right,top:paint.top,bottom:paint.bottom},legacy,target:{left:target.left,right:target.right,top:target.top,bottom:target.bottom},axis,clientTop:node.clientTop,clientLeft:node.clientLeft,clientWidth:node.clientWidth,clientHeight:node.clientHeight,legacyIntersection:intersects(legacy,target),actualIntersection:intersects(paint,target)};});
    assert(fractional.clip.top%1!==0&&fractional.clientTop>0,'Fractional ancestor geometry and border are present');
    assert(fractional.axis&&fractional.actualIntersection&&!fractional.legacyIntersection,`Actual paint-camera intersection is nonempty while legacy integer-client intersection is empty: ${JSON.stringify(fractional)}`);
    assert((await captureTargetPNG(page,page.locator('#target'))).foreignDOMIntersections.find(peer=>peer.id==='fractional-peer')?.witnesses.some(witness=>witness.id==='fractional-paint'),'Conservative fractional clip bounds retain the visible edge witness');
    await page.setContent(`<style>body{margin:0}#target{position:absolute;left:30px;top:120px;width:220px;height:40px;background:white}.scroll-well{position:relative;width:220px;height:40px;margin:120px 0 0 30px;overflow:hidden;border-radius:.5rem}.corner-paint{position:absolute;left:0;top:0;width:1px;height:1px;background:red}</style><div data-audit-main><div id="target" data-ely-family="workspace">Target</div></div><div data-audit-twin><div id="rounded-corner-peer" class="scroll-well" data-ely-family="workspace"><span class="corner-paint"></span></div></div>`);
    const corner=await page.evaluate(()=>{const paint=document.querySelector('.corner-paint').getBoundingClientRect(),target=document.querySelector('#target').getBoundingClientRect(),root=getComputedStyle(document.querySelector('#rounded-corner-peer'));return {paint:{left:paint.left,right:paint.right,top:paint.top,bottom:paint.bottom},target:{left:target.left,right:target.right,top:target.top,bottom:target.bottom},radius:root.borderTopLeftRadius};});
    assert(corner.paint.left<corner.target.right&&corner.paint.right>corner.target.left&&corner.paint.top<corner.target.bottom&&corner.paint.bottom>corner.target.top&&corner.radius!=='0px',`The corner-only clipped paint lies within the target and rounded clip: ${JSON.stringify(corner)}`);
    assert((await captureTargetPNG(page,page.locator('#target'))).foreignDOMIntersections.some(peer=>peer.id==='rounded-corner-peer'),'Paint in the rounded-corner bounding-box over-approximation remains conservatively foreign');
  }finally{await browser.close();}
});

test('focus outline keeps a conservative fractional box through rounded overflow clipping',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:320,height:240}});
    await page.setContent(`<style>body{margin:0;width:800px;height:800px}#target{position:relative;left:100px;top:100px;width:120px;height:100px}.clip{position:absolute;left:20.25px;top:12.25px;width:50.5px;height:40.5px;border:1.5px solid transparent;border-radius:20px;overflow:hidden}#focus{position:absolute;left:-4px;top:-4px;width:8px;height:8px;margin:0;padding:0;border:0;outline:4px solid red;outline-offset:3px}</style><div data-audit-main><div id="target" data-ely-family="forms"><div class="clip"><button id="focus" type="button" tabindex="0"></button></div></div></div>`);
    await page.evaluate(()=>window.scrollTo(37,41));
    const expected=await page.locator('#focus').evaluate(node=>{node.focus();const clip=node.parentElement.getBoundingClientRect(),r=node.getBoundingClientRect(),style=getComputedStyle(node),margin=parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset);return {scroll:{x:scrollX,y:scrollY},paint:{left:Math.max(r.left-margin,clip.left),top:Math.max(r.top-margin,clip.top),right:Math.min(r.right+margin,clip.right),bottom:Math.min(r.bottom+margin,clip.bottom)},documentPaint:{left:Math.max(r.left-margin,clip.left)+scrollX,top:Math.max(r.top-margin,clip.top)+scrollY,right:Math.min(r.right+margin,clip.right)+scrollX,bottom:Math.min(r.bottom+margin,clip.bottom)+scrollY},clip:{left:clip.left,top:clip.top,right:clip.right,bottom:clip.bottom},radius:parseFloat(getComputedStyle(node.parentElement).borderTopLeftRadius)};});
    assert(expected.scroll.x>0&&expected.scroll.y>0,`The regression requires nonzero scroll on both axes: ${JSON.stringify(expected.scroll)}`);
    const captured=await captureTargetPNG(page,page.locator('#target'));
    assert.equal(captured.bounds.focusOutline.status,'bounded');
    assert.deepEqual(captured.bounds.focusOutline.paint,expected.paint);
    assert.equal(captured.bounds.focusOutline.paint.left,expected.clip.left,'The rectangular over-approximation retains corner pixels; it does not claim rounded-edge visibility');
    assert.equal(captured.bounds.focusOutline.paint.top,expected.clip.top);
    const camera=captured.bounds.clip;
    assert(camera.x<=expected.documentPaint.left&&camera.y<=expected.documentPaint.top&&camera.x+camera.width>=expected.documentPaint.right&&camera.y+camera.height>=expected.documentPaint.bottom,'The document-space screenshot camera contains the full conservative focus-paint envelope');
    assert(expected.radius>0&&expected.clip.left%1!==0&&expected.clip.top%1!==0,'The clipping ancestor is measurably rounded and fractional');
  }finally{await browser.close();}
});

test('focus outline keeps unsupported overflow margins and transformed clips as gaps',async()=>{
  const browser=await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH||undefined});
  try{
    const page=await browser.newPage({viewport:{width:320,height:240}});
    const fixture=clip=>`<style>body{margin:0;width:800px;height:800px}#target{position:relative;left:40px;top:40px;width:120px;height:100px}.clip{position:absolute;left:20px;top:12px;width:50px;height:40px;border-radius:20px;overflow:hidden;${clip}}#focus{position:absolute;left:4px;top:4px;width:8px;height:8px;margin:0;padding:0;border:0;outline:4px solid red;outline-offset:3px}</style><div data-audit-main><div id="target" data-ely-family="forms"><div class="clip"><button id="focus" type="button" tabindex="0"></button></div></div></div>`;
    await page.setContent(fixture('overflow:clip;overflow-clip-margin:4px'));
    await page.locator('#focus').focus();
    let captured=await captureTargetPNG(page,page.locator('#target'));
    assert.equal(captured.bounds.focusOutline.status,'unsupported');
    assert.equal(captured.bounds.focusOutline.reason,'nonzero overflow clip margin');
    await page.setContent(fixture('overflow:hidden;transform:translateZ(0)'));
    await page.locator('#focus').focus();
    captured=await captureTargetPNG(page,page.locator('#target'));
    assert.equal(captured.bounds.focusOutline.status,'unsupported');
    assert.equal(captured.bounds.focusOutline.reason,'complex outline geometry or clipping');
    await page.setContent(fixture('overflow:hidden;clip-path:inset(1px)'));
    await page.locator('#focus').focus();
    captured=await captureTargetPNG(page,page.locator('#target'));
    assert.equal(captured.bounds.focusOutline.status,'unsupported');
    assert.equal(captured.bounds.focusOutline.reason,'complex outline geometry or clipping');
    for(const [property,value] of [['translate','1px 0'],['rotate','1deg'],['scale','2']]){
      await page.setContent(fixture(`overflow:hidden;${property}:${value}`));
      await page.locator('#focus').focus();
      const styles=await page.locator('.clip').evaluate(node=>({transform:getComputedStyle(node).transform,translate:getComputedStyle(node).translate,rotate:getComputedStyle(node).rotate,scale:getComputedStyle(node).scale}));
      assert.equal(styles.transform,'none',`${property} regression must not be masked by the transform shorthand`);
      assert.notEqual(styles[property],'none',`${property} must be the isolated active transform`);
      captured=await captureTargetPNG(page,page.locator('#target'));
      assert.equal(captured.bounds.focusOutline.status,'unsupported');
      assert.equal(captured.bounds.focusOutline.reason,'complex outline geometry or clipping');
    }
    for(const position of ['absolute','fixed']){
      const left=position==='absolute'?95:135;
      await page.setContent(`<style>body{margin:0;width:800px;height:800px}#target{position:relative;left:40px;top:40px;width:260px;height:200px}.cb{position:relative;width:220px;height:120px}.clip{width:100px;height:70px;overflow:hidden}#focus{position:${position};left:${left}px;top:55px;width:10px;height:10px;margin:0;padding:0;border:0;outline:4px solid red;outline-offset:3px}</style><div data-audit-main><div id="target" data-ely-family="forms"><div class="cb"><div class="clip"><button id="focus" type="button" tabindex="0"></button></div></div></div></div>`);
      await page.locator('#focus').focus();
      const geometry=await page.locator('#focus').evaluate(node=>{const clip=node.parentElement.getBoundingClientRect(),root=node.closest('[data-ely-family]').getBoundingClientRect(),r=node.getBoundingClientRect(),style=getComputedStyle(node),margin=parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset);return {position:style.position,containingBlock:node.offsetParent?.className??null,clip:{left:clip.left,right:clip.right,top:clip.top,bottom:clip.bottom},root:{left:root.left,right:root.right,top:root.top,bottom:root.bottom},paint:{left:r.left-margin,right:r.right+margin,top:r.top-margin,bottom:r.bottom+margin}};});
      assert.equal(geometry.position,position);
      if(position==='absolute')assert.equal(geometry.containingBlock,'cb','Absolute control must be positioned by a containing block outside the overflow clip');
      assert(geometry.paint.right>geometry.clip.right&&geometry.paint.left<geometry.clip.right&&geometry.paint.bottom>geometry.clip.top&&geometry.paint.top<geometry.clip.bottom&&geometry.paint.left<geometry.root.right&&geometry.paint.bottom<geometry.root.bottom,`The ${position} outline crosses the overflow clip edge but stays within the capture root: ${JSON.stringify(geometry)}`);
      captured=await captureTargetPNG(page,page.locator('#target'));
      assert.equal(captured.bounds.focusOutline.status,'unsupported');
      assert.equal(captured.bounds.focusOutline.reason,'unproven positioned outline overflow clip relationship');

      const wrapperLeft=position==='absolute'?95:135;
      await page.setContent(`<style>body{margin:0;width:800px;height:800px}#target{position:relative;left:40px;top:40px;width:260px;height:200px}.cb{position:relative;width:220px;height:120px}.clip{width:100px;height:70px;overflow:hidden}.wrapper{position:${position};left:${wrapperLeft}px;top:55px;width:10px;height:10px}#focus{display:block;width:10px;height:10px;margin:0;padding:0;border:0;outline:4px solid red;outline-offset:3px}</style><div data-audit-main><div id="target" data-ely-family="forms"><div class="cb"><div class="clip"><div class="wrapper"><button id="focus" type="button" tabindex="0"></button></div></div></div></div></div>`);
      await page.locator('#focus').focus();
      const wrapperGeometry=await page.locator('#focus').evaluate(node=>{const wrapper=node.parentElement,clip=wrapper.parentElement.getBoundingClientRect(),root=node.closest('[data-ely-family]').getBoundingClientRect(),r=node.getBoundingClientRect(),style=getComputedStyle(node),margin=parseFloat(style.outlineWidth)+parseFloat(style.outlineOffset);return {activePosition:style.position,wrapperPosition:getComputedStyle(wrapper).position,containingBlock:wrapper.offsetParent?.className??null,clip:{left:clip.left,right:clip.right,top:clip.top,bottom:clip.bottom},root:{left:root.left,right:root.right,top:root.top,bottom:root.bottom},paint:{left:r.left-margin,right:r.right+margin,top:r.top-margin,bottom:r.bottom+margin}};});
      assert.equal(wrapperGeometry.activePosition,'static');
      assert.equal(wrapperGeometry.wrapperPosition,position);
      if(position==='absolute')assert.equal(wrapperGeometry.containingBlock,'cb','Escaping absolute wrapper must be positioned outside the overflow clip');
      assert(wrapperGeometry.paint.right>wrapperGeometry.clip.right&&wrapperGeometry.paint.left<wrapperGeometry.clip.right&&wrapperGeometry.paint.bottom>wrapperGeometry.clip.top&&wrapperGeometry.paint.top<wrapperGeometry.clip.bottom&&wrapperGeometry.paint.left<wrapperGeometry.root.right&&wrapperGeometry.paint.bottom<wrapperGeometry.root.bottom,`Static focus outline crosses its ${position} wrapper clip but stays within the capture root: ${JSON.stringify(wrapperGeometry)}`);
      captured=await captureTargetPNG(page,page.locator('#target'));
      assert.equal(captured.bounds.focusOutline.status,'unsupported');
      assert.equal(captured.bounds.focusOutline.reason,'unproven positioned outline overflow clip relationship');
    }
  }finally{await browser.close();}
});
