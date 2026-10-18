// Diagnostic only; NOT EXECUTED in this audit. Call on a ready, freshly loaded
// standalone or catalogue context-owner production fixture page in authorized CI.
// Keep the real MutationObserver, public mount(), DOM, and family assets intact.
import assert from 'node:assert/strict';
export async function diagnoseCleanupRemount(page) {
  const observed = await page.evaluate(async () => {
    const api = await import('/assets/ely-api.js');
    const root = document.querySelector('[data-fixture-slot="manual"] [data-ely-family]');
    const parent = root.parentElement;
    const surface = root.querySelector('[data-interaction-context]');
    const panel = root.querySelector('[role="menu"]');
    const trigger = root.querySelector('[data-interaction-menu]');
    const request = (number, x=222, y=223) => root.dispatchEvent(new CustomEvent('ely:context-request', {detail:{number,x,y}}));
    const state = () => ({hidden:panel.hidden,ready:root.dataset.elyReady,expanded:trigger.getAttribute('aria-expanded'),left:panel.style.left,top:panel.style.top,connected:root.isConnected});
    request('1',111,112);
    let inside, cleanups=0;
    root.addEventListener('ely:cleanup', () => {
      cleanups++;
      parent.append(root);
      surface.dataset.elyContextNumber='2';
      surface.dataset.elyContextX='222';
      surface.dataset.elyContextY='223';
      api.mount(root,{});
      inside=state();
    }, {once:true});
    root.remove();
    await new Promise(resolve=>setTimeout(resolve,0));
    const after=state();
    request('2'); const sameNumber=state();
    request('3',333,334); const changedNumber=state();
    return {inside,after,sameNumber,changedNumber,cleanups};
  });
  assert.equal(observed.cleanups,1);
  assert.equal(observed.inside.hidden,false,'new mount opens seed during cleanup event');
  assert.equal(observed.inside.left,'222px');
  assert.equal(observed.after.hidden,true,'current-source diagnostic: old cleanup closes new presentation');
  assert.equal(observed.after.ready,'true');
  assert.equal(observed.sameNumber.hidden,true,'seed was consumed before stale close');
  assert.equal(observed.changedNumber.hidden,false,'fresh controller still accepts a changed number');
  return observed;
}
