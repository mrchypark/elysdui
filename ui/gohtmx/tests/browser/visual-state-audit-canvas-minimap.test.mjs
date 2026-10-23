import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {assertMinimapViewport,requestedStateContract,runRequestedStateActions} from './visual-state-audit-drivers.mjs';

const read=path=>readFile(new URL(`../../../../${path}`,import.meta.url),'utf8');

test('minimap viewport oracle rejects zoom changes against the pre-click state',()=>{
  const before={stage:{width:820,height:460},view:{x:20,y:30,zoom:.5}};
  const geometry={bounds:{x:0,y:0},ratio:.5,point:{x:110,y:80}};
  const expected=assertMinimapViewport(before,{zoom:.5,x:-620,y:-320},geometry);
  assert.deepEqual(expected,{zoom:.5,x:-620,y:-320});
  assert.throws(
    ()=>assertMinimapViewport(before,{...expected,zoom:.75},geometry),
    /pre-click viewport semantics/,
    'An unintended zoom change after the minimap click must fail against the saved pre-click zoom',
  );
});

test('source-only: eight separate canvas minimap contracts; 32 case/profile runtime runs remain mandatory',async()=>{
  const contract=requestedStateContract('canvas/InfiniteCanvas');
  assert.equal(contract?.kind,'InfiniteCanvas');
  assert.equal(contract.focusedSequence,'canvas-minimap-zoom-fit-hit-test');
  assert.equal(contract.requestedStateOnly,true);
  assert.deepEqual(contract.mappingGaps,[]);
  assert.match(contract.scope,/Only the separate gallery:canvas\/InfiniteCanvas three-action focused sequence/);
  assert.deepEqual(contract.steps.map(({id})=>id),['zoom-in','fit-canvas','navigate-minimap']);
  assert(contract.steps.every(step=>step.source.siteId.startsWith('focused-state:canvas/InfiniteCanvas:')&&step.source.provenance.includes('each alias and profile requires its own runtime evidence')));

  const [components,fixture,runtime,instrument]=await Promise.all([
    read('ui/gohtmx/components.json'),read('internal/gallery/advanced_workspace_canvas.go'),read('ui/gohtmx/assets/ely-api-workspace-canvas.js'),read('ui/gohtmx/tests/browser/visual-state-audit-instrument.mjs'),
  ]);
  const story=JSON.parse(components).pages.flatMap(page=>page.stories).find(item=>item.name==='InfiniteCanvas');
  assert(story,'Canonical InfiniteCanvas story must exist');
  assert.deepEqual(story.components,['InfiniteCanvas','CanvasGrid','Guides','Ruler','ArtboardFrame','ZoomControls','ZoomIndicator','MiniMap']);
  const inventoryCaseIDs=story.components.map(component=>`gallery:canvas/${component}`);
  assert.deepEqual(inventoryCaseIDs,['gallery:canvas/InfiniteCanvas','gallery:canvas/CanvasGrid','gallery:canvas/Guides','gallery:canvas/Ruler','gallery:canvas/ArtboardFrame','gallery:canvas/ZoomControls','gallery:canvas/ZoomIndicator','gallery:canvas/MiniMap']);
  assert.match(instrument,/caseId:`gallery:\$\{item\.name\}`/,'Inventory case IDs are anchored to each component identity, not collapsed by shared fixture');
  for(const alias of story.components){
    const identity=`canvas/${alias}`,actual=requestedStateContract(identity);
    assert(actual,`${identity} must have its own explicit contract lookup`);
    assert.equal(actual.identity,identity);
    assert.equal(actual.variant,alias);
    assert.equal(actual.kind,'InfiniteCanvas');
    assert.equal(actual.focusedSequence,contract.focusedSequence);
    assert.equal(actual.requestedStateOnly,true);
    assert.deepEqual(actual.fixtureGuards,{component:identity,kind:'InfiniteCanvas'});
    assert.deepEqual(actual.mappingGaps,[]);
    assert.deepEqual(actual.steps.map(({id,control,expectedState,event})=>({id,control,expectedState,event})),contract.steps.map(({id,control,expectedState,event})=>({id,control,expectedState,event})));
    assert(actual.steps.every(step=>step.source.siteId===`focused-state:${identity}:${step.id}`));
    assert(actual.scope.includes(`Only the separate gallery:${identity} three-action focused sequence`));
    assert.match(actual.scope,/not runtime approval; all eight IDs across four profiles require 32 separate case\/profile runs/);
  }
  for(const identity of ['editor/MiniMap','canvas/Unknown','canvas/InfiniteCanvasExtra','editor/Guides'])assert.equal(requestedStateContract(identity),null,`${identity} must not inherit the canvas contract`);
  assert.match(fixture,/case "InfiniteCanvas"/);
  assert.match(fixture,/"width"\], s\["height"\], s\["view"\], s\["rulers"\], s\["minimap"\] = 820, 460/);
  assert.match(fixture,/M\{"x": -60, "y": -60, "zoom": \.7\}/);
  assert.match(fixture,/"id": "home".*"x": 0, "y": 0, "w": 390, "h": 640/);
  assert.match(fixture,/"id": "detail".*"x": 470, "y": 0, "w": 390, "h": 640/);
  assert.match(runtime,/fitView\(union\(state\.artboards\?\.length\?state\.artboards:all\),size\.w,size\.h,kind==='InfiniteCanvas'\?48:16\)/);
  assert.match(runtime,/zoomStops = \[\.1,\.25,\.5,\.75,1,1\.5,2,3,4,6,8\]/);
  assert.match(runtime,/on\(map,'click',e=>\{if\(disabled\)return;.*setView\(\{\.\.\.state\.view,x:bounds\.x\+/);

  const driver=runRequestedStateActions.toString();
  for(const id of ['zoom-in','fit-canvas','navigate-minimap'])assert.match(driver,new RegExp(`runStep\\('${id}'`));
  assert.match(driver,/clickVisibleControl\(root\.locator\('\[data-cs-minimap\]'\)\)/,'Minimap interaction must be native and point-hit-tested');
  assert.match(driver,/getScreenCTM\(\)\.inverse\(\)/,'Minimap expectation must use the actual SVG pointer coordinate transform');
  assert.match(driver,/event\.isTrusted/,'A synthetic dispatch cannot satisfy the native minimap pointer contract');
  assert.match(driver,/const bounds=union\(afterZoom\.artboards\),margin=48/,'Fit expectation uses the actual artboard union and InfiniteCanvas fit margin');
  assert.match(driver,/beforeZoom=await scene\(\);return clickVisibleControl/,'Zoom oracle must snapshot the state before activating the zoom target');
  assert.match(driver,/beforeMinimap=await scene\(\);return clickVisibleControl/,'Minimap oracle must snapshot state before the native minimap pointer action');
  assert.match(driver,/assertMinimapViewport\(beforeMinimap,detail\.view/,'Minimap post-state must be validated against its pre-click viewport');
  assert.match(driver,/assertWorld\(detail\.view\)/,'Each public viewport action must match the rendered SVG transform');
  assert.match(driver,/fresh\(\)/,'Actions must retain the existing public-event and independent-twin guards');
  assert.match(driver,/assert\.equal\(identity,contract\.identity,'Exact alias identity is required'\)/);
  assert.match(driver,/initialTwin=await twinState\(\),id=await root\.getAttribute\('id'\)/);
  assert.match(driver,/assert\.deepEqual\(await twinState\(\),initialTwin,'Public actions must preserve the independent twin'\)/);
  const canvasDriver=driver.slice(driver.indexOf("if(contract.focusedSequence==='canvas-minimap-zoom-fit-hit-test')"),driver.indexOf("if(['button-public-boundary','textarea-public-multiline'].includes(contract.focusedSequence))"));
  const centerChecks=canvasDriver.slice(canvasDriver.indexOf('for(const selector of controls)'),canvasDriver.indexOf('await root.evaluate(node=>{node.__visualCanvasClicks=[]'));
  assert.match(centerChecks,/await target\.scrollIntoViewIfNeeded\(\);\s*await target\.evaluate\(node=>new Promise\(resolve=>requestAnimationFrame\(\(\)=>requestAnimationFrame\(resolve\)\)\)\);\s*const hit=await target\.evaluate/,'Each zoom control must scroll natively and settle before its center ownership check');
  assert.match(centerChecks,/assert\.equal\(hit\.reachable,true,`\$\{selector\} center must be an owned hit target`\)/,'A visible foreign hit target must still fail the exact center assertion');
  assert.match(centerChecks,/await mapTarget\.scrollIntoViewIfNeeded\(\);\s*await mapTarget\.evaluate\(node=>new Promise\(resolve=>requestAnimationFrame\(\(\)=>requestAnimationFrame\(resolve\)\)\)\);\s*const mapHit=await mapTarget\.evaluate/,'Minimap ownership must also be checked after native scrolling and settling');
  assert.match(centerChecks,/assert\.equal\(mapHit,true,'Minimap center must be an owned hit target'\)/,'A visible foreign minimap hit target must still fail');
  assert.equal((canvasDriver.match(/assert\.equal\(detail\.id,id\);assert\.equal\(detail\.component,identity\)/g)||[]).length,3,'Every canvas action must assert the actual instance ID and alias payload');
  assert.match(driver,/overlap\(initial\.zoomRect,initial\.mapRect\)/,'Initial zoom and minimap targets must not overlap');
});
