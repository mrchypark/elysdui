import assert from 'node:assert/strict';
import {pathToFileURL} from 'node:url';
import {copyRotationFramesMatch} from '../ui/gohtmx/tests/browser/copybutton-complete-evidence.mjs';

// Exact keyframe values captured by Chromium 143.0.7499.4. The original report
// remains failed and immutable; this is a focused oracle regression specimen.
export const capturedRotation = Object.freeze({
  run: '39252312255', revision: '3fc0ea81f342f4fd63f1de977291796a35b8a294',
  tree: '40b9b17c3306ffefb83b59b6d78ec6c4430eadbe',
  reportSHA256: '0ab609d001c4bb9d35c61af799d634cb8d253d656ccf1f63f4eb960674aa4a03',
  caseID: 'appearance-light', checkpoint: 'copied', sequence: 47,
  frames: [
    {offset:0,transform:'rotate(-34.3775deg)',easing:'cubic-bezier(0.333333, 1, 0.666667, 1)'},
    {offset:1,transform:'rotate(0deg)',easing:'cubic-bezier(0.333333, 1, 0.666667, 1)'},
  ],
});
const frames=(from,to='rotate(0rad)')=>[{offset:0,transform:from,easing:'linear'},{offset:1,transform:to,easing:'linear'}];
export function testCopyRotationFrames() {
  let accepted=0,rejected=0;
  const yes=(label,value)=>{assert.equal(copyRotationFramesMatch(value),true,label);accepted++;};
  const no=(label,value)=>{assert.equal(copyRotationFramesMatch(value),false,label);rejected++;};
  yes('unaltered actual captured degree frames',capturedRotation.frames);
  for(const from of ['rotate(-0.6rad)','rotate(-.6rad)','rotate(-6e-1rad)',' rotate( -0.6rad ) ',`rotate(${-0.6*180/Math.PI}deg)`,`rotate(${-0.6*200/Math.PI}grad)`,`rotate(${-0.6/(2*Math.PI)}turn)`,'rotate(-0.6000009999rad)','rotate(-0.5999990001rad)'])yes(from,frames(from));
  for(const to of ['rotate(0)','rotate(-0deg)','rotate(0grad)','rotate(0turn)'])yes('exact zero '+to,frames('rotate(-0.6rad)',to));
  for(const from of ['rotate(-0.6000010001rad)','rotate(-0.5999989999rad)','rotate(-0.61rad)','rotate(-0.59rad)','rotate(0.6rad)','rotate(0deg)',`rotate(${2*Math.PI-.6}rad)`,`rotate(${-2*Math.PI-.6}rad)`,'rotate(-.6)','rotate(1e-999)','rotate(1e-999rad)','rotate(-.6rad)junk','\u00a0rotate(-.6rad)','rotate(\u00a0-.6rad)','rotate(-34.3775px)','rotate(-.6 rad)','rotate(NaNrad)','rotate(Infinityrad)','rotate(1e309rad)','rotate(1e-999rad)','rotate()','rotate(-.6rad) scale(1)','translateX(0px) rotate(-.6rad)','rotateZ(-.6rad)','matrix(0.825336,-0.564642,0.564642,0.825336,0,0)','none','garbage',null])no('bad initial angle '+from,frames(from));
  for(const to of ['rotate(0.0000001rad)','rotate(-0.0000001deg)','rotate(1e-999rad)','rotate(360deg)','rotate(-1turn)','rotate(NaNdeg)','none',null])no('nonzero or invalid endpoint '+to,frames('rotate(-.6rad)',to));
  for(const value of [undefined,null,[],[frames('rotate(-.6rad)')[0]],...[[.1,1],[0,.9],[1,0],['0',1],[null,1]].map(offsets=>frames('rotate(-.6rad)').map((frame,i)=>({...frame,offset:offsets[i]}))),[...frames('rotate(-.6rad)'),{offset:1,transform:'rotate(0rad)'}]])no('missing, extra or incorrectly offset frames',value);
  const unchanged=JSON.stringify(capturedRotation.frames);copyRotationFramesMatch(capturedRotation.frames);assert.equal(JSON.stringify(capturedRotation.frames),unchanged,'oracle never normalizes or rewrites raw captured bytes');
  return {sourceOnly:true,classification:'strict angle parser and captured-keyframe regression; no new browser execution or historical admission',accepted,rejected,capturedRun:capturedRotation.run,capturedReportSHA256:capturedRotation.reportSHA256};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)console.log(JSON.stringify(testCopyRotationFrames()));
