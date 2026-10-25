import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFile,mkdtemp,rm} from 'node:fs/promises';
import {runInNewContext} from 'node:vm';
import {createRequire} from 'node:module';
import {dirname,resolve,join} from 'node:path';
import {tmpdir} from 'node:os';
import {captureTargetPNG,captureForeignPaint,screenshotWithoutCaretMutation,activeOutlineBounds,visualCaptureGap,proveMultiSelectShadowRaster,multiSelectShadowFrame} from './visual-state-audit-drivers.mjs';
import {captureBounds} from './visual-state-audit-bounds.mjs';

// Synthetic bytes exercise the fail-closed oracle, not actual browser paint evidence.
function shadowRasterFixture(){
  const width=12,height=12,data=Buffer.alloc(width*height*4,255);
  const pixel=(x,y,value)=>{const at=(y*width+x)*4;data[at]=data[at+1]=data[at+2]=value;};
  pixel(5,5,0);pixel(5,8,240);
  const sample={eligible:true,ownerID:'primary',panelID:'panel',frame:{x:0,y:0,width,height},documentFrame:{x:0,y:100,width,height},background:[255,255,255,255],rects:[{left:4,top:4,right:8,bottom:8}],shadows:[{id:'panel',css:'rgba(0, 0, 0, 0.133) 0px 1px 2px 0px',left:4,top:4,right:8,bottom:8}],focused:{id:'checkbox',outlineStyle:'none',matchesFocusVisible:false}};
  return {png:{width,height,data},sample,pixel};
}

test('MultiSelect shadow sampler validates intervening main and grid clips and backdrop paint',()=>{
  const style={opacity:'1',transform:'none',translate:'none',rotate:'none',scale:'none',perspective:'none',filter:'none',backdropFilter:'none',clipPath:'none',clip:'auto',contain:'none',maskImage:'none',mixBlendMode:'normal',overflowX:'visible',overflowY:'visible',backgroundColor:'rgba(0, 0, 0, 0)',backgroundImage:'none',boxShadow:'none',outlineStyle:'none',outlineWidth:'0px',position:'static',borderTopWidth:'0px',borderRightWidth:'0px',borderBottomWidth:'0px',borderLeftWidth:'0px'};
  const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
  const make=(id,parent,box)=>{const node={id,localName:'div',children:[],parentElement:parent,style:{...style},pseudos:{},clientLeft:0,dataset:{},getBoundingClientRect:()=>box,checkVisibility:()=>true,matches:()=>false};parent?.children.push(node);return node;};
  const record=make('record',null,rect(0,0,100,120));record.style.backgroundColor='rgb(255, 255, 255)';
  const grid=make('grid',record,rect(0,0,100,120)),host=make('host',grid,rect(0,10,100,90)),root=make('root',host,rect(10,10,70,40));root.dataset.elyComponent='forms/MultiSelect';
  const twin=make('twin',grid,rect(0,100,100,120)),panel=make('panel',root,rect(10,40,70,60)),entry=make('entry',root,rect(10,10,70,30)),focused=make('checkbox',panel,rect(20,45,30,55));
  panel.style.boxShadow='rgba(0, 0, 0, 0.133) 0px 8px 16px 0px';
  root.closest=selector=>selector==='[data-audit-main]'?host:selector==='[data-audit-case]'?record:root;
  root.querySelector=()=>panel;root.querySelectorAll=selector=>selector==='*'?[panel,entry,focused]:[entry];root.contains=node=>node===focused;
  entry.getAttribute=name=>name==='aria-expanded'?'true':panel.id;
  record.querySelector=()=>twin;
  const document={activeElement:focused,querySelectorAll:selector=>selector==='[data-audit-case]'?[record]:[panel]};
  const sample=()=>JSON.parse(JSON.stringify(runInNewContext(`(${multiSelectShadowFrame.toString()})(node)`,{node:root,document,URL,location:{href:'http://127.0.0.1/components/audit?family=forms&case=forms%2FMultiSelect'},getComputedStyle:(node,pseudo)=>pseudo?{content:node.pseudos[pseudo]??'none'}:node.style,innerWidth:100,innerHeight:100,scrollX:0,scrollY:0})));
  assert.equal(sample().eligible,true,'Transparent untransformed wrappers permit the finite sampler');
  for(const wrapper of [host,grid]){
    for(const change of [{overflowX:'hidden'},{overflowY:'auto'},{transform:'matrix(1, 0, 0, 1, 1, 0)'},{clipPath:'inset(1px)'},{contain:'paint'},{backgroundColor:'rgb(255, 255, 255)'},{backgroundColor:'rgba(0, 0, 0, 0.5)'},{backgroundImage:'linear-gradient(white, black)'},{boxShadow:'rgb(0, 0, 0) 0px 1px 2px 0px'},{borderLeftWidth:'1px'}]){
      wrapper.style={...style,...change};const result=sample();assert.equal(result.eligible,false,`${wrapper.id}: ${JSON.stringify(change)}`);assert.match(result.reason,/backdrop\/clip|backdrop paint/);
    }
    wrapper.style={...style};
    for(const pseudo of ['::before','::after']){wrapper.pseudos[pseudo]='""';assert.equal(sample().eligible,false,`${wrapper.id} ${pseudo}`);assert.match(sample().reason,/generated audit backdrop paint/);delete wrapper.pseudos[pseudo];}
    assert.equal(sample().eligible,true,'Removing the ambiguity restores the valid neighboring case');
  }
  for(const [property,value] of Object.entries({transform:'matrix(2, 0, 0, 2, 0, 0)',translate:'1px',rotate:'1deg',scale:'2',perspective:'10px',filter:'blur(1px)',backdropFilter:'blur(1px)',clipPath:'inset(1px)',maskImage:'linear-gradient(white, black)',mixBlendMode:'multiply',opacity:'0.5',position:'fixed'})){
    focused.style={...style,[property]:value};const result=sample();
    assert.equal(result.eligible,false);assert.equal(result.reason,'complex owned shadow-frame paint');
    assert.equal(result.rejectionWitness.selector,'[id="checkbox"]');
    assert.equal(result.rejectionWitness.ownerID,'root');assert.equal(result.rejectionWitness.panelID,'panel');
    assert.deepEqual(result.rejectionWitness.styleRejections,[{property,value}]);
    assert.deepEqual(result.rejectionWitness.ancestorPath.map(a=>a.id),['checkbox','panel','root','host','grid','record']);
    assert.equal(result.rejectionWitness.ancestorPath[0].style[property],value);
  }
  focused.style={...style,outlineStyle:'solid',outlineWidth:'3px'};focused.id='';
  const outlined=sample();assert.equal(outlined.eligible,false);
  assert.equal(outlined.rejectionWitness.selector,'[id="panel"] > div:nth-child(1)');
  assert.deepEqual(outlined.rejectionWitness.styleRejections,[{property:'outlineStyle',value:'solid'},{property:'outlineWidth',value:'3px'}]);
  focused.style={...style};focused.id='checkbox';assert.equal(sample().eligible,true,'Diagnostics do not relax or expand eligibility');
});

test('MultiSelect shadow rejection witness survives capture diagnostic fallback unchanged',async()=>{
  const rejectionWitness={selector:'[id="option"]',ownerID:'primary',ownerComponent:'forms/MultiSelect',panelID:'panel',styleRejections:[{property:'outlineStyle',value:'solid'},{property:'outlineWidth',value:'3px'}],ancestorPath:[{selector:'[id="option"]',id:'option',style:{outlineStyle:'solid',outlineWidth:'3px'}}]};
  const sample={eligible:false,reason:'complex owned shadow-frame paint',rejectionWitness};
  const root={async scrollIntoViewIfNeeded(){},async evaluate(fn){if(fn===multiSelectShadowFrame)return sample;if(fn===captureForeignPaint)return {foreignDOMIntersections:[],occludedForeignPaint:[]};return {clip:{x:0,y:0,width:12,height:12}};}};
  const page={async evaluate(){return {scroll:{x:0,y:0},viewport:{width:100,height:100}};},async screenshot(){const png=Buffer.alloc(24);png.writeUInt32BE(12,16);png.writeUInt32BE(12,20);return png;}};
  const result=await captureTargetPNG(page,root);
  assert.equal(result.bounds.focusOutline.status,'unsupported');
  assert.deepEqual(result.bounds.focusOutline.diagnostic.shadowSample.rejectionWitness,rejectionWitness);
  assert.equal(result.bounds.decorativeShadowProof,undefined);
});

test('MultiSelect shadow raster retains actual halo only inside a clear uniform boundary',()=>{
  const {png,sample}=shadowRasterFixture(),proof=proveMultiSelectShadowRaster(png,sample);
  assert.equal(proof.shadowPixels,1);assert.equal(proof.inkPixels,2);assert.equal(proof.status,'bounded-native-raster');
  for(const css of ['rgba(0, 0, 0, 0.1) 0px 1px 2px 0px inset','rgb(1, 0, 0) 0px 1px 2px 0px','rgba(0, 0, 0, 0.1) 0px 1px 2px 1px','rgba(0, 0, 0, 0.1) 20px 1px 2px 0px',sample.shadows[0].css+', '+sample.shadows[0].css]){
    assert.throws(()=>proveMultiSelectShadowRaster(png,{...sample,shadows:[{...sample.shadows[0],css}]}));
  }
  assert.throws(()=>proveMultiSelectShadowRaster(png,{...sample,panelID:'foreign'}),/panel shadow/);
  assert.throws(()=>proveMultiSelectShadowRaster(png,{...sample,rects:[{left:-1,top:4,right:8,bottom:8}]}),/escape/);
  const noHalo=shadowRasterFixture();noHalo.pixel(5,8,255);assert.throws(()=>proveMultiSelectShadowRaster(noHalo.png,noHalo.sample),/shadow pixels/);
  for(const [x,y] of [[0,5],[11,5],[5,0],[5,11]]){const edge=shadowRasterFixture();edge.pixel(x,y,254);assert.throws(()=>proveMultiSelectShadowRaster(edge.png,edge.sample),/boundary/);}
});

test('MultiSelect shadow capture rejects foreign paint before screenshot and retains unrelated gaps',async()=>{
  const {sample}=shadowRasterFixture();let screenshots=0;
  const root={async scrollIntoViewIfNeeded(){},async evaluate(fn){if(fn===multiSelectShadowFrame)return sample;if(fn===captureForeignPaint)return {foreignDOMIntersections:[{id:'twin'}],occludedForeignPaint:[]};return {clip:{x:0,y:0,width:12,height:12},focusOutline:{status:'unsupported',reason:'unbounded focus-within shadow'}};}};
  const page={async evaluate(){return {scroll:{x:0,y:0},viewport:{width:100,height:100}};},async screenshot(){screenshots++;const png=Buffer.alloc(24);png.writeUInt32BE(12,16);png.writeUInt32BE(12,20);return png;}};
  const result=await captureTargetPNG(page,root);
  assert.equal(screenshots,1,'Only diagnostic fallback may capture foreign paint');
  assert.equal(result.bounds.focusOutline.status,'unsupported');assert.match(result.bounds.focusOutline.diagnostic.error,/Foreign paint/);
  assert.equal(result.foreignDOMIntersections[0].id,'twin');
});

test('MultiSelect shadow capture decodes native bytes and cannot clear unrelated focus or changed foreign paint',async()=>{
  const require=createRequire(import.meta.url),{PNG}=require(resolve(dirname(require.resolve('playwright-core/package.json')),'lib/utilsBundle.js'));
  const {png,sample}=shadowRasterFixture(),bytes=PNG.sync.write(png);
  for(const mode of ['valid','unrelated','changed-owner','changed-geometry','boundary']){
    let ownerReads=0,sampleReads=0;
    const root={async scrollIntoViewIfNeeded(){},async evaluate(fn){
      if(fn===multiSelectShadowFrame){sampleReads++;return mode==='changed-geometry'&&sampleReads>1?{...sample,ownerID:'different'}:sample;}
      if(fn===captureForeignPaint){ownerReads++;return {foreignDOMIntersections:mode==='changed-owner'&&ownerReads>1?[{id:'twin'}]:[],occludedForeignPaint:[]};}
      return {clip:{x:0,y:0,width:12,height:12},focusOutline:{status:'unsupported',reason:mode==='unrelated'?'unknown transform':'unbounded focus-within shadow',diagnostic:{active:{id:'panel'}}}};
    }};
    const frame=shadowRasterFixture();if(mode==='boundary')frame.pixel(0,5,254);
    const actualBytes=mode==='boundary'?PNG.sync.write(frame.png):bytes;
    const page={async evaluate(){return {scroll:{x:0,y:0},viewport:{width:100,height:100}};},async screenshot(){return actualBytes;}};
    const result=await captureTargetPNG(page,root);
    assert.deepEqual(result.png,actualBytes);
    if(mode==='valid'){assert.equal(result.bounds.decorativeShadowProof.shadowPixels,1);assert.equal(result.bounds.focusOutline.status,'not-painted');}
    else {assert.equal(result.bounds.focusOutline.status,'unsupported');assert.equal(result.bounds.decorativeShadowProof,undefined);}
  }
});

test('MultiSelect shadow audit route remains canonical exact-case with strict sampler guards',async()=>{
  const actions=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url),'utf8');
  assert.match(actions,/contract.identity==='forms\/MultiSelect'&&contract.focusedSequence==='forms-seven-native-local'/);
  assert.match(actions,/scopedURL.searchParams.set\('case',contract.identity\)/);
  const sampler=multiSelectShadowFrame.toString();
  // Adjacent negation must not become an important utility during automatic CSS scanning.
  assert(!sampler.includes('st.filter'+'!'));
  assert.equal(sampler.split("st.filter !== 'none'").length-1,2);
  for(const required of ["searchParams.get('case')!=='forms/MultiSelect'","document.querySelectorAll('[data-audit-case]').length!==1","getAttribute('aria-controls')!==panel.id","st.transform!=='none'","st.overflowX!=='visible'","'generated owned shadow-frame paint'","'visible focused outline requires separate proof'"])assert(sampler.includes(required),required);
});

test('MultiSelect shadow failure preserves candidate PNG without overwriting fallback evidence',async()=>{
  const require=createRequire(import.meta.url),{PNG}=require(resolve(dirname(require.resolve('playwright-core/package.json')),'lib/utilsBundle.js'));
  const fixture=shadowRasterFixture();fixture.pixel(0,5,254);const candidate=PNG.sync.write(fixture.png),fallback=Buffer.from(candidate);
  const scratch=await mkdtemp(join(tmpdir(),'elysdui-shadow-pure-')),path=join(scratch,'component.png');
  try{
    const root={async scrollIntoViewIfNeeded(){},async evaluate(fn){if(fn===multiSelectShadowFrame)return fixture.sample;if(fn===captureForeignPaint)return {foreignDOMIntersections:[],occludedForeignPaint:[]};return {clip:{x:0,y:0,width:12,height:12}};}};
    let captures=0;
    const page={async evaluate(){return {scroll:{x:0,y:0},viewport:{width:100,height:100}};},async screenshot(options){captures++;assert.equal(options.path,captures===1?undefined:path);return captures===1?candidate:fallback;}};
    const result=await captureTargetPNG(page,root,path);
    assert.equal(result.bounds.focusOutline.status,'unsupported');assert.equal(captures,2);
    assert.equal(result.bounds.focusOutline.diagnostic.retainedPath,path+'.shadow-proof.png');
    assert.deepEqual(await readFile(path+'.shadow-proof.png'),candidate);
  }finally{await rm(scratch,{recursive:true,force:true});}
});

// No Playwright import or browser launch: exercise the real capture function
// with explicit geometry and a synthetic PNG header, not pixel evidence.
async function capture(clip,scroll,viewport){
  const bounds={clip,negativePageOverflow:false},ownership={foreignDOMIntersections:[{id:'foreign'}],occludedForeignPaint:[]};
  let options,ownershipArgs,scrolled=false;
  const root={
    async scrollIntoViewIfNeeded(){scrolled=true;},
    async evaluate(fn,arg){
      if(fn===captureForeignPaint){ownershipArgs=arg;return ownership;}
      return scrolled?bounds:false;
    },
  };
  let evaluations=0;
  const page={
    async evaluate(){return ++evaluations===1?undefined:{scroll,viewport};},
    async screenshot(value){options=value;const png=Buffer.alloc(24);png.writeUInt32BE(clip.width,16);png.writeUInt32BE(clip.height,20);return png;},
  };
  const receipt=await captureTargetPNG(page,root,undefined,{checkedRootID:'primary'});
  assert.deepEqual(ownershipArgs,{clip,checkedRootID:'primary'},'Ownership always uses the original document clip');
  assert.deepEqual(receipt.foreignDOMIntersections,ownership.foreignDOMIntersections,'Camera selection cannot clear foreign ownership');
  assert.deepEqual(receipt.bounds.camera,{fullPage:options.fullPage,clip:options.clip});
  assert.deepEqual(receipt.bounds.clip,clip);assert.deepEqual(receipt.bounds.scroll,scroll);assert.deepEqual(receipt.bounds.viewport,viewport);
  assert.equal(options.animations,'disabled');assert.equal(options.scale,'css');
  assert.equal(options.caret,'initial');
  return receipt.bounds.camera;
}

test('action camera converts visible document bounds and preserves exact receipt coordinates',async()=>{
  const clip={x:85,y:64419,width:1270,height:340},scroll={x:0,y:64072},viewport={width:1440,height:1000};
  assert.deepEqual(await capture(clip,scroll,viewport),{fullPage:false,clip:{...clip,y:347}});
  assert.deepEqual(await capture({...clip,x:105},{x:20,y:64072.25},viewport),{fullPage:false,clip:{...clip,y:346.75}});
});

test('action camera retains document fallback for every partially offscreen painted edge',async()=>{
  const clip={x:85,y:64419,width:1270,height:340},viewport={width:1440,height:1000};
  for(const [candidate,scroll]of [
    [{...clip,width:1500},{x:0,y:64072}],
    [clip,{x:86,y:64072}],
    [clip,{x:0,y:64420}],
    [clip,{x:0,y:63000}],
  ])assert.deepEqual(await capture(candidate,scroll,viewport),{fullPage:true,clip:candidate});
  assert.deepEqual(await capture({x:0,y:64072,width:1440,height:1000},{x:0,y:64072},viewport),{fullPage:false,clip:{x:0,y:0,width:1440,height:1000}});
});

test('SVG canvas clips only when its absolute viewport parent proves containment',async()=>{
  const rect=(left,top,right,bottom)=>({left,top,right,bottom});
  const make=(name,box,parent,style={},options={})=>({localName:name,namespaceURI:options.svg?'http://www.w3.org/2000/svg':'http://www.w3.org/1999/xhtml',parentElement:parent,childNodes:[],offsetParent:options.offsetParent||null,style:{display:'block',visibility:'visible',opacity:'1',contentVisibility:'visible',overflowX:'visible',overflowY:'visible',overflowClipMargin:'0px',position:'static',...style},getBoundingClientRect:()=>box,contains(candidate){for(let node=candidate;node;node=node.parentElement)if(node===this)return true;return false;},querySelectorAll(){return options.descendants||[];}});
  const evaluate=root=>{
    return JSON.parse(JSON.stringify(runInNewContext(`(${captureBounds.toString()})(element)`,{element:root,getComputedStyle:node=>node.style,Node:{TEXT_NODE:3},document:{},scrollX:0,scrollY:0,innerWidth:1440,innerHeight:1000})));
  };
  const rootBox=rect(0,0,100,80),canvasBox=rect(0,0,100,80),svgBox=rect(0,0,100,80),shapeBox=rect(-200,-20,400,100);
  const clippedRoot=make('section',rootBox,null,{},{}),canvas=make('div',canvasBox,clippedRoot,{position:'relative',overflowX:'hidden',overflowY:'hidden'}),svg=make('svg',svgBox,canvas,{position:'absolute'}, {svg:true}),shape=make('rect',shapeBox,svg,{},{svg:true});
  clippedRoot.querySelectorAll=()=>[canvas,svg,shape];
  const clipped=evaluate(clippedRoot);
  assert.deepEqual(clipped.clip,{x:0,y:0,width:100,height:80},'Map-like SVG geometry is clipped by its direct positioned canvas, even when SVG offsetParent is absent');
  assert(clipped.clippedCount>0);
  svg.offsetParent=clippedRoot;
  assert.deepEqual(evaluate(clippedRoot).clip,clipped.clip,'A misleading SVG offsetParent cannot override its direct positioned CSS containing block');

  const visibleRoot=make('section',rootBox,null),visibleCanvas=make('div',canvasBox,visibleRoot,{position:'relative'}),visibleSVG=make('svg',svgBox,visibleCanvas,{position:'absolute',overflowX:'visible',overflowY:'visible'},{svg:true}),visibleShape=make('rect',rect(150,10,400,60),visibleSVG,{}, {svg:true});
  visibleRoot.querySelectorAll=()=>[visibleCanvas,visibleSVG,visibleShape];
  const visible=evaluate(visibleRoot);
  assert.equal(visible.clip.width,400,'Visible SVG overflow remains part of the camera union');
  assert.equal(visible.extendsRoot,true);

  const htmlRoot=make('section',rootBox,null),htmlOverflow=make('div',rect(0,0,100,80),htmlRoot),htmlChild=make('div',rect(150,10,220,60),htmlOverflow);
  htmlRoot.querySelectorAll=()=>[htmlOverflow,htmlChild];
  assert.equal(evaluate(htmlRoot).clip.width,220,'Visible normal-flow HTML overflow remains part of the camera union');

  const escapeRoot=make('section',rootBox,null,{position:'relative'}),clip=make('div',rect(0,0,80,80),escapeRoot,{overflowX:'hidden',overflowY:'hidden'}),escapedSVG=make('svg',rect(0,0,100,80),clip,{position:'absolute'},{svg:true,offsetParent:escapeRoot}),escapedShape=make('rect',rect(150,10,220,60),escapedSVG,{}, {svg:true});
  escapeRoot.querySelectorAll=()=>[clip,escapedSVG,escapedShape];
  const escaped=evaluate(escapeRoot);
  assert.equal(escaped.clip.width,220,'An SVG positioned from outside the overflow ancestor retains legitimate escaped paint');

  const fixedRoot=make('section',rootBox,null,{position:'relative'}),fixedClip=make('div',rect(0,0,80,80),fixedRoot,{position:'relative',overflowX:'hidden',overflowY:'hidden'}),fixedSVG=make('svg',rect(150,120,250,200),fixedClip,{position:'fixed',overflowX:'visible',overflowY:'visible'},{svg:true}),fixedShape=make('rect',rect(150,120,250,200),fixedSVG,{}, {svg:true});
  fixedRoot.querySelectorAll=()=>[fixedClip,fixedSVG,fixedShape];
  const fixedEscape=evaluate(fixedRoot);
  assert.equal(fixedEscape.clip.width,250,'Fixed SVG outside a relative overflow clip retains viewport-positioned paint');
  assert.equal(fixedEscape.extendsRoot,true);
});

test('action camera matches the frozen baseline rule without importing its executable runner',async()=>{
  const source=await readFile(new URL('./visual-state-audit-baseline.mjs',import.meta.url),'utf8');
  const definition=source.match(/function captureCamera\(clip, scroll, viewport\) \{[\s\S]*?\n\}/)?.[0];
  assert(definition,'Pinned baseline camera rule must remain identifiable');
  const baseline=runInNewContext(`(${definition})`),clip={x:85,y:64419,width:1270,height:340},viewport={width:1440,height:1000};
  for(const scroll of [{x:0,y:64072},{x:86,y:64072},{x:0,y:63000}]){
    assert.deepEqual(await capture(clip,scroll,viewport),JSON.parse(JSON.stringify(baseline(clip,scroll,viewport))));
  }
});

test('source-only active owned outline union respects axis clips and fails closed for complex paint',async()=>{
  const box={left:85,top:100,right:285,bottom:140},bounds={clip:{x:85,y:1100,width:200,height:40},root:box,extendsRoot:false,viewportTruncated:false};
  const plain={outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'4px',outlineColor:'rgb(0,0,255)',display:'block',visibility:'visible',opacity:'1',contentVisibility:'visible',transform:'none',translate:'none',rotate:'none',scale:'none',perspective:'none',filter:'none',clipPath:'none',clip:'auto',maskImage:'none',contain:'none',zoom:'1',overflowX:'visible',overflowY:'visible',borderTopLeftRadius:'0px',borderTopRightRadius:'0px',borderBottomLeftRadius:'0px',borderBottomRightRadius:'0px'};
  const owner={},foreign={},parent={style:{...plain},parentElement:null,clientLeft:0,clientTop:0,clientWidth:200,clientHeight:40,getBoundingClientRect:()=>box};
  const active={style:{...plain},parentElement:parent,closest:()=>owner,getBoundingClientRect:()=>box,getClientRects:()=>[box]};
  const node={contains:value=>value===active,closest:()=>owner};
  const context={document:{activeElement:active},getComputedStyle:value=>value.style,scrollX:0,scrollY:1000,innerWidth:1440,innerHeight:1000,node,bounds};
  const run=()=>JSON.parse(JSON.stringify(runInNewContext(`(${activeOutlineBounds.toString()})(node,bounds)`,context)));
  assert.deepEqual(run().clip,{x:79,y:1094,width:212,height:52});
  assert.equal(run().focusOutline.status,'bounded');assert.equal(run().extendsRoot,true);
  parent.style.overflowX='hidden';assert.deepEqual(run().clip,{x:85,y:1094,width:200,height:52},'Horizontal clip must not incorrectly clip the vertical outline');
  parent.style.overflowY='hidden';assert.deepEqual(run().clip,bounds.clip);
  for(const [key,value]of [['transform','matrix(1,0,0,1,0,0)'],['clipPath','inset(1px)'],['maskImage','url(mask)'],['contain','paint']]){
    parent.style={...plain,overflowX:'hidden',[key]:value};assert.equal(run().focusOutline.status,'unsupported',key);assert.deepEqual(run().clip,bounds.clip);
  }
  parent.style={...plain,overflowX:'hidden',borderTopLeftRadius:'5px'};
  const rounded=run();
  assert.equal(rounded.focusOutline.status,'bounded','Rounded overflow uses its enclosing border-box AABB conservatively');
  assert.deepEqual(rounded.focusOutline.paint,{left:85,top:94,right:285,bottom:146},'The rounded corner may be over-included, but the enclosing paint envelope is not under-captured');
  assert.deepEqual(rounded.clip,{x:85,y:1094,width:200,height:52},'The document camera contains the full conservative rounded-clip AABB');
  parent.style={...plain};active.closest=()=>foreign;assert.equal(run().focusOutline.status,'unsupported');active.closest=()=>owner;
  active.getClientRects=()=>[box,box];assert.equal(run().focusOutline.status,'unsupported');active.getClientRects=()=>[box];
  parent.style={...plain,overflowX:'clip',overflowClipMargin:'3px'};assert.equal(run().focusOutline.status,'unsupported');parent.style={...plain};
  parent.style.visibility='hidden';assert.equal(run().focusOutline.status,'unsupported','A visible focused child can override its hidden ancestor');assert.deepEqual(run().clip,bounds.clip);parent.style={...plain};
  for(const outlineColor of ['rgb(255, 0, 0)','rgb(0, 0, 0)','rgba(255, 0, 0, 1)','rgb(255 0 0 / 100%)']){active.style={...plain,outlineColor};assert.equal(run().focusOutline.status,'bounded',outlineColor);assert.deepEqual(run().clip,{x:79,y:1094,width:212,height:52});}
  for(const outlineColor of ['transparent','rgba(255, 0, 0, 0)','rgb(255 0 0 / 0)','rgb(0 0 0 / 0%)']){active.style={...plain,outlineColor};assert.deepEqual(run(),bounds,outlineColor);}
  for(const change of [{outlineWidth:'0px'},{outlineStyle:'none'},{outlineColor:'rgba(0, 0, 255, 0)'},{visibility:'hidden'}]){active.style={...plain,...change};assert.deepEqual(run(),bounds);}
  active.style={...plain,outlineStyle:'auto'};assert.equal(run().focusOutline.status,'unsupported');
  context.document.activeElement={};assert.deepEqual(run(),bounds,'Non-target twin focus must not expand this camera');
  const source=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url),'utf8');
  assert.match(source,/countsAsOwnedEvidence:!foreignDOMIntersections\.length&&!focusOutlineGap/);
  assert.match(source,/if \(overlays\.length \|\| component\.focusOutlineGap/,'Unsupported outline requests existing viewport context');
  assert.match(source,/ownedStateEvidence:!component\.focusOutlineGap&&/,'Context cannot silently approve unsupported outline paint');
  const driver=await readFile(new URL('./visual-state-audit-drivers.mjs',import.meta.url),'utf8');
  assert.match(driver,/captureForeignPaint,\{clip:bounds\.clip,checkedRootID\}/,'Foreign ownership must use the expanded clip');
});

test('fragmented native inline anchor outline measures every fragment and retains clipping and foreign ownership gates',async()=>{
  const family={},base={display:'block',position:'static',visibility:'visible',opacity:'1',contentVisibility:'visible',outlineStyle:'none',outlineWidth:'0px',outlineOffset:'0px',outlineColor:'rgb(0,95,204)',boxShadow:'none',transform:'none',translate:'none',rotate:'none',scale:'none',perspective:'none',filter:'none',clipPath:'none',clip:'auto',maskImage:'none',contain:'none',zoom:'1',overflowX:'visible',overflowY:'visible',overflowClipMargin:'0px'};
  const rect=(left,top,right,bottom)=>({left,top,right,bottom,width:right-left,height:bottom-top});
  let fragments=[rect(120,100,200,116),rect(100,120,150,136)];
  const parent={style:{...base},parentElement:null,getBoundingClientRect:()=>rect(95,95,205,140)};
  const active={localName:'a',namespaceURI:'http://www.w3.org/1999/xhtml',style:{...base,display:'inline',outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'2px'},parentElement:parent,closest:()=>family,hasAttribute:name=>name==='href',getClientRects:()=>fragments,getBoundingClientRect:()=>rect(100,100,200,136)};
  const node={contains:value=>value===active,closest:()=>family},bounds={clip:{x:100,y:1100,width:100,height:36},root:rect(100,100,200,136),extendsRoot:false,viewportTruncated:false};
  const context={document:{activeElement:active},getComputedStyle:element=>element.style,node,bounds,scrollX:0,scrollY:1000,innerWidth:1440,innerHeight:1000};
  const run=()=>JSON.parse(JSON.stringify(runInNewContext(`(${activeOutlineBounds.toString()})(node,bounds)`,context)));
  const measured=run();assert.equal(measured.focusOutline.status,'bounded');
  assert.deepEqual(measured.focusOutline.fragments,[{left:116,top:96,right:204,bottom:120},{left:96,top:116,right:154,bottom:140}]);
  assert.deepEqual(measured.focusOutline.paint,{left:96,top:96,right:204,bottom:140});assert.deepEqual(measured.clip,{x:96,y:1096,width:108,height:44});assert.equal(measured.extendsRoot,true);
  parent.style.overflowX='hidden';parent.style.overflowY='hidden';
  assert.deepEqual(run().focusOutline.clippedFragments,[{left:116,top:96,right:204,bottom:120},{left:96,top:116,right:154,bottom:140}]);
  parent.getBoundingClientRect=()=>rect(110,95,195,140);
  assert.deepEqual(run().focusOutline.clippedFragments,[{left:116,top:96,right:195,bottom:120},{left:110,top:116,right:154,bottom:140}],'Each fragment is clipped separately before the envelope is united');
  parent.getBoundingClientRect=()=>rect(155,95,205,140);
  assert.equal(run().focusOutline.reason,'inline outline fragment fully clipped','One visible fragment cannot approve a missing second fragment');
  parent.style={...base};
  for(const bad of [[...fragments,rect(0,0,0,0)],[...fragments,rect(NaN,0,10,10)]]){const old=fragments;fragments=bad;assert.equal(run().focusOutline.reason,'invalid inline outline fragment');fragments=old;}
  // Keep this computed-style negative out of Tailwind's automatic utility scan.
  for(const change of [{display:'inline'+'-block'},{position:'absolute'},{outlineStyle:'auto'},{transform:'matrix(2,0,0,1,0,0)'},{clipPath:'inset(1px)'},{maskImage:'url(mask)'},{rotate:'1deg'}]){const old=active.style;active.style={...old,...change};assert.equal(run().focusOutline.status,'unsupported');active.style=old;}
  active.closest=()=>({});assert.equal(run().focusOutline.reason,'nested component focus ownership');active.closest=()=>family;
  active.hasAttribute=()=>false;assert.equal(run().focusOutline.reason,'fragmented focus outline');active.hasAttribute=name=>name==='href';
  active.style.boxShadow='0px 0px 4px blue';assert.equal(run().focusOutline.reason,'unbounded inline focus shadow');active.style.boxShadow='none';
  active.style.outlineColor='transparent';assert.deepEqual(run(),bounds,'Invisible outline paint cannot establish a fragment envelope');active.style.outlineColor=base.outlineColor;
  context.innerWidth=190;assert.equal(run().viewportTruncated,true,'Measured offscreen outline cannot silently become full-viewport evidence');context.innerWidth=1440;
  // The normal capture path still checks foreign paint against this expanded document clip.
  await capture(measured.clip,{x:0,y:1000},{width:1440,height:1000});
});

test('currency focus-within ancestor outline expands the camera beyond its own overflow clip without waiving ownership',async()=>{
  const family={},base={display:'block',visibility:'visible',opacity:'1',contentVisibility:'visible',outlineStyle:'none',outlineWidth:'0px',outlineOffset:'0px',outlineColor:'rgb(55,114,187)',boxShadow:'none',transform:'none',translate:'none',rotate:'none',scale:'none',perspective:'none',filter:'none',clipPath:'none',clip:'auto',maskImage:'none',contain:'none',zoom:'1',overflowX:'visible',overflowY:'visible',overflowClipMargin:'0px',position:'static'};
  const contains=function(candidate){for(let current=candidate;current;current=current.parentElement)if(current===this)return true;return false;};
  const make=(tag,rect,style,parent=null)=>({localName:tag,namespaceURI:'http://www.w3.org/1999/xhtml',parentElement:parent,style:{...base,...style},closest:()=>family,matches:()=>false,getBoundingClientRect:()=>rect,getClientRects:()=>[rect],contains});
  const root=make('div',{left:98,top:98,right:302,bottom:130,width:204,height:32},{});
  const currency=make('span',{left:100,top:100,right:300,bottom:128,width:200,height:28},{outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'2px',overflowX:'hidden',overflowY:'hidden'},root);currency.matches=selector=>selector===':focus-within';
  const input=make('input',{left:101,top:101,right:299,bottom:127,width:198,height:26},{outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'4px'},currency);
  const bounds={clip:{x:100,y:1100,width:200,height:28},root:{left:100,top:100,right:300,bottom:128},extendsRoot:false,viewportTruncated:false};
  const context={document:{activeElement:input},getComputedStyle:element=>element.style,node:root,bounds,scrollX:0,scrollY:1000,innerWidth:1440,innerHeight:1000};
  const run=()=>JSON.parse(JSON.stringify(runInNewContext(`(${activeOutlineBounds.toString()})(node,bounds)`,context)));
  assert.deepEqual(run().clip,{x:96,y:1096,width:208,height:36},'Measured parent outline extends four pixels beyond its border box; self overflow must not cut its own ring');
  assert.deepEqual(run().focusWithinOutlines[0].outline.paint,{left:96,top:96,right:304,bottom:132});assert.equal(run().extendsRoot,true);
  input.style={...base};assert.deepEqual(run().clip,{x:96,y:1096,width:208,height:36},'Ancestor ring must be captured even when the active input has no outline');
  root.style.overflowX='hidden';root.style.overflowY='hidden';assert.deepEqual(run().focusOutline.paint,{left:98,top:98,right:302,bottom:130},'External ancestor clipping remains effective');assert.deepEqual(run().clip,{x:98,y:1098,width:204,height:32});root.style={...base};
  for(const change of [{transform:'matrix(1,0,0,1,0,-12)'},{transform:'matrix(2,0,0,1,0,0)'},{rotate:'10deg'},{perspective:'100px'},{clipPath:'inset(1px)'},{filter:'blur(1px)'},{outlineStyle:'auto'}]){currency.style={...base,outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'2px',...change};assert.equal(run().focusOutline.status,'unsupported');}
  currency.style={...base,outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'2px',boxShadow:'0px 0px 0px 4px rgb(55,114,187)'};assert.equal(run().focusOutline.reason,'unbounded focus-within shadow','Unknown focus-within shadows must fail closed, not receive generic padding');
  currency.style={...base,outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'2px'};currency.closest=()=>({});assert.equal(run().focusOutline.reason,'nested component focus ownership');currency.closest=()=>family;
  currency.getClientRects=()=>[currency.getBoundingClientRect(),currency.getBoundingClientRect()];assert.equal(run().focusOutline.reason,'fragmented focus outline');currency.getClientRects=()=>[currency.getBoundingClientRect()];
  currency.matches=()=>false;assert.deepEqual(run(),bounds,'Non-focus-within ancestors cannot add an envelope');currency.matches=selector=>selector===':focus-within';
  context.document.activeElement={};assert.deepEqual(run(),bounds,'Focus in a different audit instance cannot expand this target');
  const css=await readFile(new URL('../../assets/ely-api-forms.css',import.meta.url),'utf8');
  assert.match(css,/\.ely-api-currency:focus-within\{outline:2px solid var\(--focus\);outline-offset:2px\}/);
  const actions=await readFile(new URL('./visual-state-audit-actions.mjs',import.meta.url),'utf8');assert.match(actions,/countsAsOwnedEvidence:!foreignDOMIntersections\.length&&!focusOutlineGap/,'Expanded ring still requires foreign paint and outline ownership gates');
});

test('blurred focus-within panel shadow stays unresolved while actual focused checkbox paint is retained',()=>{
  const family={},rect={left:85,top:586,right:445,bottom:624,width:360,height:38},base={display:'block',position:'static',visibility:'visible',opacity:'1',contentVisibility:'visible',outlineStyle:'none',outlineWidth:'0px',outlineOffset:'0px',outlineColor:'rgb(24,22,19)',boxShadow:'none',transform:'none',translate:'none',rotate:'none',scale:'none',perspective:'none',filter:'none',clipPath:'none',clip:'auto',maskImage:'none',contain:'none',zoom:'1',overflowX:'visible',overflowY:'visible'};
  const panel={localName:'div',id:'options',style:{...base,position:'absolute',overflowX:'auto',overflowY:'auto',boxShadow:'rgba(0, 0, 0, 0.133) 0px 8px 16px 0px'},parentElement:null,matches:selector=>selector===':focus-within',closest:()=>family,getBoundingClientRect:()=>rect,getClientRects:()=>[rect]};
  const checkbox={localName:'input',type:'checkbox',id:'beta',style:{...base,outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'4px',boxShadow:'rgb(55,114,187) 0px 0px 0px 3px'},parentElement:panel,matches:selector=>selector===':focus-visible',closest:()=>family,getBoundingClientRect:()=>({left:95,top:595,right:111,bottom:611,width:16,height:16}),getClientRects(){return [this.getBoundingClientRect()];}};
  const node={contains:element=>element===panel||element===checkbox,closest:()=>family},bounds={clip:{x:85,y:586,width:360,height:38},root:rect};
  const result=JSON.parse(JSON.stringify(runInNewContext(`(${activeOutlineBounds.toString()})(node,bounds)`,{node,bounds,document:{activeElement:checkbox},getComputedStyle:element=>element.style,scrollX:0,scrollY:0,innerWidth:1440,innerHeight:1000})));
  const gap=result.focusOutline;assert.equal(gap.status,'unsupported');assert.equal(gap.reason,'unbounded focus-within shadow');
  assert.equal(gap.diagnostic.active.id,'options');assert.equal(gap.diagnostic.active.matchesFocusVisible,false);assert.equal(gap.diagnostic.active.outlineStyle,'none');assert.equal(gap.diagnostic.active.boxShadow,panel.style.boxShadow);
  assert.equal(gap.diagnostic.focused.id,'beta');assert.equal(gap.diagnostic.focused.type,'checkbox');assert.equal(gap.diagnostic.focused.matchesFocusVisible,true);assert.equal(gap.diagnostic.focused.boxShadow,checkbox.style.boxShadow);assert.equal(gap.diagnostic.focused.outlineWidth,'2px');assert.equal(gap.diagnostic.focused.clientRects.length,1);
  assert.equal(gap.diagnostic.focusedOutline.status,'bounded','Retain the previously measured child outline separately; this does not bound either shadow');
  assert.deepEqual(result.clip,bounds.clip,'Unresolved blur cannot gain arbitrary capture padding or approval');
});

test('ClearableInput self-only pure translation retains measured outline bounds and strict ownership guards',()=>{
  const family={},rect={left:1329,top:545.609375,right:1353,bottom:569.609375,width:24,height:24},rowRect={left:85,top:543.609375,right:1355,bottom:571.609375,width:1270,height:28};
  const base={display:'block',visibility:'visible',opacity:'1',contentVisibility:'visible',outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'4px',outlineColor:'rgb(55, 114, 187)',transform:'none',translate:'none',rotate:'none',scale:'none',perspective:'none',filter:'none',clipPath:'none',clip:'auto',maskImage:'none',contain:'none',zoom:'1',overflowX:'visible',overflowY:'visible',overflowClipMargin:'0px',position:'static'};
  const parent={style:{...base,position:'relative'},parentElement:null,getBoundingClientRect:()=>rowRect,contains:node=>node===parent||node===active};
  const active={style:{...base,position:'absolute',transform:'matrix(1, 0, 0, 1, 0, -12)'},localName:'button',namespaceURI:'http://www.w3.org/1999/xhtml',parentElement:parent,offsetParent:parent,closest:()=>family,getBoundingClientRect:()=>rect,getClientRects:()=>[rect]};
  const node={contains:value=>value===active,closest:()=>family},bounds={clip:{x:85,y:1262,width:1270,height:112},root:{left:85,top:460.609375,right:1355,bottom:571.609375},extendsRoot:false,viewportTruncated:false};
  const run=()=>JSON.parse(JSON.stringify(runInNewContext(`(${activeOutlineBounds.toString()})(node,bounds)`,{document:{activeElement:active},getComputedStyle:element=>element.style,node,bounds,scrollX:0,scrollY:802,innerWidth:1440,innerHeight:1000})));
  assert.deepEqual(run().focusOutline.paint,{left:1323,top:539.609375,right:1359,bottom:575.609375},'Use the already-translated browser rect exactly once, expanded by six CSS pixels');
  assert.deepEqual(run().clip,{x:85,y:1262,width:1274,height:116});
  for(const transform of ['matrix(1,0,0,1,0,0)','matrix(1,0,0,1,10.5,-12)']){active.style.transform=transform;assert.equal(run().focusOutline.status,'bounded');assert.deepEqual(run().clip,{x:85,y:1262,width:1274,height:116});}
  active.style.transform='matrix(1, 0, 0, 1, 0, -12)';
  parent.style.overflowX='hidden';parent.style.overflowY='hidden';
  assert.deepEqual(run().focusOutline.paint,{left:1323,top:543.609375,right:1355,bottom:571.609375},'Proven containing-block overflow clipping is still applied');assert.deepEqual(run().clip,bounds.clip);
  active.offsetParent=null;assert.equal(run().focusOutline.status,'unsupported','Unknown positioned clip relationship must not be waived');active.offsetParent=parent;
  parent.style={...base,position:'relative'};
  for(const transform of ['matrix(2,0,0,1,0,-12)','matrix(0,1,-1,0,0,-12)','matrix(1,.1,0,1,0,-12)','matrix(1,0,.1,1,0,-12)','matrix(1,0,0,-1,0,-12)','matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0,-12,0,1)','matrix(1,0,0,1,NaN,-12)','matrix(1,0,0,1,Infinity,0)','matrix(1,0,0,1,,0)']){
    active.style.transform=transform;assert.equal(run().focusOutline.status,'unsupported',transform);assert.deepEqual(run().clip,bounds.clip);
  }
  active.style.transform='matrix(1,0,0,1,0,-12)';
  for(const change of [{rotate:'10deg'},{scale:'2'},{translate:'0px -12px'},{perspective:'200px'},{clipPath:'inset(1px)'},{maskImage:'url(mask)'},{filter:'blur(1px)'}]){active.style={...base,position:'absolute',transform:'matrix(1,0,0,1,0,-12)',...change};assert.equal(run().focusOutline.status,'unsupported');}
  active.style={...base,position:'absolute',transform:'matrix(1,0,0,1,0,-12)'};parent.style.transform='matrix(1,0,0,1,0,-12)';assert.equal(run().focusOutline.status,'unsupported','Ancestor transforms remain unsupported');parent.style={...base,position:'relative'};
  active.closest=()=>({});assert.equal(run().focusOutline.status,'unsupported','Foreign component focus remains unsupported');active.closest=()=>family;
  active.getClientRects=()=>[rect,rect];assert.equal(run().focusOutline.status,'unsupported','Fragmented outline remains unsupported');
});

test('focused minimap SVG outline reproduces sealed geometry and reports rejected clip relations',async()=>{
  const rect={left:20,top:30,right:220,bottom:170,width:200,height:140},family={},base={display:'block',visibility:'visible',opacity:'1',contentVisibility:'visible',outlineStyle:'solid',outlineWidth:'2px',outlineOffset:'-2px',outlineColor:'rgb(0, 95, 204)',transform:'none',translate:'none',rotate:'none',scale:'none',perspective:'none',filter:'none',clipPath:'none',clip:'auto',maskImage:'none',contain:'none',zoom:'1',overflowX:'visible',overflowY:'visible',overflowClipMargin:'0px',position:'static'};
  const make=(tag,parent,style,box=rect)=>({localName:tag,namespaceURI:tag==='svg'?'http://www.w3.org/2000/svg':'http://www.w3.org/1999/xhtml',parentElement:parent,style:{...base,...style},offsetParent:null,closest:()=>family,getBoundingClientRect:()=>box,getClientRects:()=>[box],hasAttribute:name=>name==='data-cs-minimap'&&tag==='svg',matches:()=>false,contains(candidate){for(let current=candidate;current;current=current.parentElement)if(current===this)return true;return false;}});
  const evaluate=svg=>{
    const node={contains:candidate=>svg.contains(candidate),closest:()=>family},bounds={clip:{x:85,y:153168,width:1270,height:461},root:{left:85,top:88.140625,right:1355,bottom:548.140625,width:1270,height:460},extendsRoot:false,viewportTruncated:false};
    return JSON.parse(JSON.stringify(runInNewContext(`(${activeOutlineBounds.toString()})(node,bounds)`,{document:{activeElement:svg},getComputedStyle:element=>element.style,node,bounds,scrollX:0,scrollY:153080,innerWidth:1440,innerHeight:1000})));
  };
  const positioned=make('div',null,{position:'relative'}),directView=make('div',positioned,{position:'relative',overflowX:'hidden',overflowY:'hidden'},{left:85,top:88.140625,right:905,bottom:548.140625,width:820,height:460}),minimapRect={left:692,top:395.140625,right:892,bottom:535.140625,width:200,height:140},directSVG=make('svg',directView,{position:'absolute',overflowX:'hidden',overflowY:'hidden'},minimapRect);
  const sealedGeometry=evaluate(directSVG);
  assert.equal(sealedGeometry.focusOutline.status,'bounded','The pinned direct-SVG fallback accepts the exact sealed relative-clipping-parent geometry');
  assert.deepEqual(sealedGeometry.clip,{x:85,y:153168,width:1270,height:461},'The -2px inset outline adds no pixels outside the minimap box');
  const staticView=make('div',positioned,{position:'static',overflowX:'hidden',overflowY:'hidden'}),staticSVG=make('svg',staticView,{position:'absolute'}),staticResult=evaluate(staticSVG);
  assert.equal(staticResult.focusOutline.status,'unsupported','A static parent cannot establish the SVG containing block');
  assert.equal(staticResult.focusOutline.reason,'unproven positioned outline overflow clip relationship');
  const staticRelation=staticResult.focusOutline.diagnostic.rejectedClipRelationships[0];
  assert.equal(staticRelation.directSVGChild,true);assert.equal(staticRelation.directSVGParentNonStatic,false);assert.equal(staticRelation.proven,false,'The diagnostic names the exact failed containing-block predicate');
  const interveningView=make('div',positioned,{position:'relative',overflowX:'hidden',overflowY:'hidden'}),wrapper=make('div',interveningView,{}),nestedSVG=make('svg',wrapper,{position:'absolute'}),nestedResult=evaluate(nestedSVG);
  assert.equal(nestedResult.focusOutline.status,'unsupported','An intervening wrapper cannot use the direct-parent fallback');
  assert.equal(nestedResult.focusOutline.reason,'unproven positioned outline overflow clip relationship');
  const nestedRelation=nestedResult.focusOutline.diagnostic.rejectedClipRelationships[0];
  assert.equal(nestedRelation.clippingAncestor.tag,'div');assert.equal(nestedRelation.directParent.tag,'div');assert.equal(nestedRelation.directSVGChild,false);assert.equal(nestedRelation.proven,false,'The diagnostic records both sides of the failed direct-parent relationship');
  const css=await readFile(new URL('../../assets/ely-api-workspace.css',import.meta.url),'utf8');
  assert.match(css,/\[data-ely-family='workspace'\] \[data-cs-minimap\]:focus\{outline:2px solid var\(--focus\);outline-offset:-2px\}/,'The minimap keeps a visible theme-color focus ring inset within its clip');
});

test('visual capture gap names only recorded foreign witnesses or focus-outline uncertainty',()=>{
  const clean={ownedStateEvidence:true,component:{foreignDOMIntersections:[],focusOutlineGap:null},ownedOverlays:[]};
  const outline={ownedStateEvidence:false,component:{foreignDOMIntersections:[],focusOutlineGap:'unproven positioned outline overflow clip relationship'},ownedOverlays:[]};
  const outlineMessage=visualCaptureGap(clean,outline);
  assert.match(outlineMessage,/after component focus-outline ownership is unproven/);
  assert.doesNotMatch(outlineMessage,/foreign-painted witness|intersects another audit instance/);
  const foreign={ownedStateEvidence:false,component:{foreignDOMIntersections:[{id:'audit-twin'}],focusOutlineGap:null},ownedOverlays:[]};
  assert.match(visualCaptureGap(clean,foreign),/after component has foreign-painted witness: audit-twin/);
  assert.match(visualCaptureGap(clean,{...outline,component:{foreignDOMIntersections:[],focusOutlineGap:null}}),/without a recorded foreign-paint witness or focus-outline gap/);
});

test('caret preparation preserves exact style presence and bytes on all controls and twins, even on throw',async()=>{
  // Model the pinned Playwright preparation/cleanup contract, not a DOM engine.
  const controls=[{id:'primary',style:null},{id:'empty',style:''},{id:'styled',style:' color: red;  caret-color: blue !important; '},{id:'non-target-twin',style:null}];
  const original=structuredClone(controls);let touched=0,finalized=0;
  const surface={async screenshot(options){
    const saved=[];
    try{
      if(options.caret!=='initial')for(const node of controls){saved.push([node,node.style]);node.style='caret-color: transparent !important;';touched++;}
      if(options.fail)throw new Error('capture failed');
      return Buffer.from('synthetic source-test receipt');
    }finally{
      // The real default cleanup restores the property, not attribute presence.
      for(const [node,style]of saved)node.style=style??'';
      finalized++;
    }
  }};
  for(let index=0;index<3;index++){
    await screenshotWithoutCaretMutation(surface,{caret:'hide'});
    assert.deepEqual(controls,original,'Absent, empty and existing attributes must remain byte-for-byte unchanged');
    await assert.rejects(screenshotWithoutCaretMutation(surface,{fail:true}),/capture failed/);
    assert.deepEqual(controls,original,'Throw/finally cannot mutate even a non-target twin');
  }
  assert.equal(finalized,6);assert.equal(touched,0,'No preparation writes or restoration that could mask application changes');
  await surface.screenshot({});
  assert.equal(controls[0].style,'');assert.equal(controls[3].style,'','Negative control reproduces default cleanup adding style to a twin');
});

test('caret-safe screenshot does not restore over genuine runtime changes and all action cameras use it',async()=>{
  const twin={style:null};
  const surface={async screenshot(options){assert.equal(options.caret,'initial');twin.style='color: green;';throw new Error('runtime failure');}};
  await assert.rejects(screenshotWithoutCaretMutation(surface,{}),/runtime failure/);
  assert.equal(twin.style,'color: green;','A real mutation remains visible to exact twin gates');
  for(const name of ['visual-state-audit-actions.mjs','visual-state-audit-drivers.mjs','visual-state-audit-camera.browser.test.mjs']){
    const source=await readFile(new URL(name,import.meta.url),'utf8');
    const directCalls=source.match(/\b(?:page|root)\.screenshot\(/g)||[];
    assert.deepEqual(directCalls,[],`${name} cannot bypass caret-safe preparation`);
    assert(source.includes('screenshotWithoutCaretMutation('));
  }
});
