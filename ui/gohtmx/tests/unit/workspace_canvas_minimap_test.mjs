import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const css=readFileSync(new URL('../../assets/ely-api-workspace.css',import.meta.url),'utf8');
const rule='@container (max-width:440px){[data-scene-kind=InfiniteCanvas] [data-cs-minimap]{bottom:60px;max-width:calc(100% - 24px)}}';
assert(css.includes(rule),'narrow scene must separate minimap from zoom without hiding either');
assert(css.includes('[data-ws-canvas-scene]{container-type:inline-size}'));
const aliases=JSON.parse(readFileSync(new URL('../../components.json',import.meta.url),'utf8')).pages
  .flatMap(page=>page.stories).find(story=>story.name==='InfiniteCanvas').components;
assert.deepEqual(aliases,['InfiniteCanvas','CanvasGrid','Guides','Ruler','ArtboardFrame','ZoomControls','ZoomIndicator','MiniMap']);
// Geometry of the declared overlay boxes; browser hit testing remains a separate check.
const overlaps=(a,b)=>a.left<b.right && a.right>b.left && a.top<b.bottom && a.bottom>b.top;
const boxes=(width,bottom)=>({zoom:{left:12,right:196.53125,top:410,bottom:448},map:{left:width-12-Math.min(200,width-24),right:width-12,top:460-bottom-140,bottom:460-bottom}});
const old=boxes(308,12);
assert(overlaps(old.zoom,old.map),'negative control must reproduce the saved overlap');
for(const width of [240,308,390,440,441,620,820]){
  const {zoom,map}=boxes(width,width<=440?60:12);
  assert(!overlaps(zoom,map),`overlay separation at ${width}px`);
  assert(map.left>=0 && map.right<=width && map.top>=0,'minimap remains within scene');
  assert(zoom.left>=0 && zoom.right<=width,'zoom remains within scene');
}
console.log('canvas minimap source contract and seven-width box geometry passed; no browser');
