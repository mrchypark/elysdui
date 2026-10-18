import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawnSync} from 'node:child_process';
const source=readFileSync('ui/gohtmx/assets/ely-controls.js','utf8'),dir=mkdtempSync(join(tmpdir(),'combo-negative-'));
try{
 for(const [name,from,to] of [
  ['capture',"  }, true);\n\n  document.addEventListener('input'","  });\n\n  document.addEventListener('input'"],
  ['restore',"if (restore && !component.hasAttribute('data-ui-combobox-free'))",'if (false)'],
  ['readonly','input.disabled || input.readOnly || !hidden','input.disabled || !hidden'],
  ['disabled-row',`visibleOptions(component).find(option=>option.getAttribute('aria-selected')==='true')`,`component.querySelector('[data-ui-option][aria-selected="true"]')`],
  ['committed-value',"if (component.hasAttribute('data-ui-combobox-free')) {","if (true) {"],
 ]){assert.ok(source.includes(from),name+' mutation target');const path=join(dir,name+'.js');writeFileSync(path,source.replace(from,to));const result=spawnSync(process.execPath,['ui/gohtmx/tests/unit/form_selection_test.mjs'],{env:{...process.env,FORM_SELECTION_SOURCE:path},encoding:'utf8'});assert.notEqual(result.status,0,name+' mutation must fail');assert.match(result.stderr,/AssertionError/,name+' must fail behavioral assertion');console.log(name+': causal mutant rejected');}
}finally{rmSync(dir,{recursive:true,force:true});}
