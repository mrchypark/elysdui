import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
// Deliberately fail Go rendering before the browser stage. No browser is launched.
const dir=mkdtempSync(join(tmpdir(),'virtual-harness-'));
try {
 const bin=join(dir,'bin');mkdirSync(bin);
 writeFileSync(join(bin,'go'),'#!/bin/sh\necho intentional-render-failure >&2\nexit 17\n',{mode:0o755});
 writeFileSync(join(bin,'git'),'#!/bin/sh\nprintf fixture-revision\n',{mode:0o755});
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./scripts/virtual-table-browser-test.mjs',import.meta.url))],{cwd:dir,env:{...process.env,PATH:`${bin}:${process.env.PATH}`,VIRTUAL_TABLE_NEGATIVE_CONTROL:''},encoding:'utf8',timeout:15000});
 assert.equal(result.status,1);
 const report=JSON.parse(readFileSync(join(dir,'test-results/contracts/virtual-table.json'),'utf8'));
 assert.equal(report.status,'failed');assert.equal(report.stage,'render-fixture');assert.equal(report.revision,'fixture-revision');assert.match(report.error,/intentional-render-failure/);assert.deepEqual(report.checks,[]);
 console.log('VirtualTable harness reports renderer failure before browser launch');
} finally {rmSync(dir,{recursive:true,force:true});}
