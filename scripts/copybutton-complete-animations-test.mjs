import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {pathToFileURL} from 'node:url';

// Execute the actual read-side helper against synthetic Web Animation objects.
// This verifies API selection and ownership, not rendered browser animation.
export function testCopyPseudoAnimations() {
  const source=readFileSync(new URL('../ui/gohtmx/tests/browser/copybutton-complete-observer.js',import.meta.url),'utf8');
  const start=source.indexOf('function sampleCopyPseudoAnimations('),end=source.indexOf('// End pure pseudo-animation observation.');
  assert(start>=0&&end>start,'exact production observer helper is present');
  class CSSAnimation {}
  class CSSTransition {}
  const sample=runInNewContext(source.slice(start,end)+';sampleCopyPseudoAnimations',{CSSAnimation});
  const queried=[],node={getAnimations(options){queried.push(options);return options?.subtree?animations:animations.filter(a=>a.effect.target===node&&!a.effect.pseudoElement);}},child={};
  let timingReads=0,frameReads=0;
  const timing={duration:120,easing:'linear'},frames=[{offset:0,transform:'rotate(-0.6rad)',easing:'cubic-bezier(0.333333, 1, 0.666667, 1)'},{offset:1,transform:'rotate(0rad)',easing:'linear'}];
  const animation=(Type,id,target,pseudo)=>Object.defineProperty(Object.assign(new Type(),{id,currentTime:12,playState:'running',effect:{target,pseudoElement:pseudo,getTiming(){timingReads++;return timing;},getKeyframes(){frameReads++;return frames;}}}),'finished',{get(){throw new Error('Sampling must never await or finish animations');}});
  const own=animation(CSSAnimation,'own-before',node,'::before');
  const animations=[animation(CSSTransition,'own-width-transition',node,'::before'),animation(CSSAnimation,'child-before',child,'::before'),animation(CSSAnimation,'own-after',node,'::after'),animation(CSSAnimation,'own-element',node,null),own];
  assert(!node.getAnimations().includes(own),'default Element query omits pseudo animations');
  const observed=sample(node,'::before');
  assert.deepEqual(Array.from(observed,a=>a.id),['own-before'],'only exact-node, exact-pseudo CSSAnimation is sampled');
  assert.equal(queried.at(-1).subtree,true,'actual observer requests pseudo-inclusive discovery');
  assert.equal(timingReads,1);assert.equal(frameReads,1,'foreign animations and transitions are not even inspected');
  assert.equal(observed[0].timing,timing,'unmodified native timing object retained');
  assert.equal(observed[0].currentTime,12);assert.equal(observed[0].playState,'running');
  assert.deepEqual(JSON.parse(JSON.stringify(observed[0].frames)),frames,'raw rotation/easing keyframes retained');
  assert.deepEqual(Array.from(sample(node,'::after'),a=>a.id),['own-after']);
  animations.splice(animations.indexOf(own),1);
  assert.equal(sample(node,'::before').length,0,'completed fill:none is not invented or replaced by a foreign animation');
  assert.equal((source.match(/sampleCopyPseudoAnimations\(node,which\)/g)||[]).length,1,'shared pseudo reader uses this helper');
  assert(source.includes('event.pseudoElement?pseudo(node,event.pseudoElement):icon(node)'),'live and animationstart/end paths share the pseudo reader');
  return {sourceOnly:true,classification:'synthetic exact observer API and ownership checks; no browser',pseudoAnimationProbes:9};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(testCopyPseudoAnimations()));
