import assert from 'node:assert/strict';
import {auditSource} from './audit-check-sources.mjs';
assert.equal(auditSource('const actions={icon:()=>1,icon:()=>2};').length, 1);
assert.equal(auditSource('const actions={"icon":()=>1,["icon"]:()=>2};').length, 1);
assert.equal(auditSource("const checks={}; checks['forms/ColorPicker']=()=>1; checks['forms/ColorPicker']=()=>2;").length, 1);
assert.equal(auditSource('const a={icon:()=>1};const b={icon:()=>2};').length, 0);
assert.equal(auditSource('const checks={};checks[key]=()=>1;').length, 0);
assert.throws(()=>auditSource('const broken = {'), SyntaxError);
console.log('Check-source audit negative controls passed (duplicate literal/assignment and syntax rejection).');
