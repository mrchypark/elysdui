import assert from 'node:assert/strict';
import {test} from 'node:test';
import {assertNoOwnedLicenseViewerOverlays} from './visual-state-audit-drivers.mjs';

test('LicenseViewer overlay guard ignores foreign visible overlays but rejects any owned one',()=>{
  const foreign=['menu-a','menu-b','dialog-c','listbox-d'].map(id=>({id,owned:false,ownershipScope:'foreign-component'}));
  assert.deepEqual(assertNoOwnedLicenseViewerOverlays(foreign),[]);
  assert.deepEqual(assertNoOwnedLicenseViewerOverlays([]),[]);
  assert.throws(
    ()=>assertNoOwnedLicenseViewerOverlays([...foreign,{id:'license-panel',owned:true,ownershipScope:'trigger-reference'}]),
    /Unexpected owned LicenseViewer overlay: license-panel/,
  );
});
