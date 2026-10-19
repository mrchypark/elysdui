import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {parse} from 'acorn';
import {loadContextOwnerAssets, productionCSSReferences} from '../ui/gohtmx/tests/browser/context-owner-assets.mjs';
import {contextOwnerControls, mutateContextOwnerSource} from '../ui/gohtmx/tests/browser/context-owner-controls.mjs';

// Source-only audit. It proves exact mutation anchors and independent designated
// oracles exist; it never substitutes for a browser run or claims a causal kill.
const source = readFileSync('ui/gohtmx/assets/ely-api-interaction.js', 'utf8');
const harness = readFileSync('ui/gohtmx/tests/browser/context-owner-requests-browser-test.mjs', 'utf8');
const runner = readFileSync('scripts/context-owner-browser-controls.mjs', 'utf8');
assert.equal(Object.keys(contextOwnerControls).length, 14);
for (const [name, control] of Object.entries(contextOwnerControls)) {
 const mutated = mutateContextOwnerSource(source, control, name);
 parse(mutated, {ecmaVersion: 'latest', sourceType: 'module'});
 assert.notEqual(mutated, source);
 assert.equal(mutated.includes(control.from), false, name + ': exact old anchor must be absent');
 assert(harness.includes(`'${control.check}'`), name + ': named matrix case must exist');
 assert(harness.includes(`oracle('${control.oracle}'`), name + ': designated explicit assertion must exist');
 for(const prior of control.prior || []) assert(harness.includes(`oracle('${prior}'`),name+': prerequisite evidence must have an explicit assertion');
 assert.throws(() => mutateContextOwnerSource(source + '\n' + control.from, control, name), /exactly one/);
 assert.throws(() => mutateContextOwnerSource(source.replace(control.from, ''), control, name), /exactly one/);
 console.log(`${name}: one precise parseable mutation → ${control.oracle}`);
}
// For controls with a within-case contract, derive the assertion order from
// the parsed case body rather than merely finding the IDs somewhere in text.
const harnessAST=parse(harness,{ecmaVersion:'latest',sourceType:'module'});
const matrix=harnessAST.body.filter(node=>node.type==='VariableDeclaration').flatMap(node=>node.declarations).find(node=>node.id.name==='cases').init.elements.map(node=>node.value);
const caseBodies=new Map();
const visit=node=>{
 if(!node||typeof node!=='object')return;
 if(node.type==='AssignmentExpression'&&node.left.type==='MemberExpression'&&node.left.object.name==='tests'&&node.left.property.type==='MemberExpression'&&node.left.property.object.name==='cases')caseBodies.set(matrix[node.left.property.property.value],node.right.body.body);
 for(const value of Object.values(node)){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
};
visit(harnessAST);
for(const [name,control]of Object.entries(contextOwnerControls))if(control.prior){
 const assertions=caseBodies.get(control.check)?.filter(node=>node.type==='ExpressionStatement'&&node.expression.type==='CallExpression'&&node.expression.callee.name==='oracle').map(node=>node.expression.arguments[0].value);
 assert(assertions?.includes(control.oracle),name+': designated assertion must be in its assigned case');
 assert.deepEqual(assertions.slice(0,assertions.indexOf(control.oracle)),control.prior,name+': exact in-case assertion prefix must match the control');
}
for (let n = 1; n <= 16; n++) assert(harness.includes(`'C${n}.`), 'missing behavioral case C' + n);
assert(runner.includes("['standalone', 'catalogue']"));
assert(harness.includes("['standalone', 'catalogue']"));
assert(harness.includes("['go', 'list', '-deps'"), 'standalone dependency proof must be recorded');
assert(harness.includes("'synthetic root-local CustomEvent'"), 'owner event provenance must be explicit');
assert(harness.includes("htmx.ajax('GET'"), 'must exercise network HTMX');
assert(harness.includes('Number.MAX_VALUE') && harness.includes('-Number.MAX_VALUE'));
assert(harness.includes("positive-infinity':Infinity") && harness.includes('nan:NaN'));
assert(harness.includes('error.contractOracle===control.oracle'), 'unrelated failures must never count as kills');
assert(harness.includes('JSON.stringify(actualPrefix)===JSON.stringify(prefix)'), 'all preceding cases must pass');
assert(harness.includes("page.on('pageerror'") && harness.includes("['error', 'unhandledrejection']"));
assert(harness.includes('event.target===expected.root') && harness.includes('d.action===expected.action') && harness.includes('d.error?.message===expected.message'), 'expected rejection must match exact root/action/message');
assert(harness.includes('if(matches) window.expectedOwnerError=null'), 'expected rejection allowance must be consumed once');
assert(harness.includes("oracle('C7.exact-rejection-once'") && harness.includes("oracle('C8.empty-parent-panel-owns-focus'"));
assert(harness.includes("oracle('C14.right-pointerdown-focuses-real-host'") && harness.includes("oracle('C14.tab-focusout-origin-is-host-not-panel'"), 'right-host dismissal requires actual surface focus and its own focusout');
assert(harness.includes("await page.mouse.down({button:'right'})") && harness.includes("await page.mouse.up({button:'right'})") && harness.includes("oracle('C14.trusted-input-sequence'"), 'right-host coverage requires separately observed trusted down/up and Tab');
assert(harness.includes("JSON.stringify(caseOraclePrefix)===JSON.stringify(control.prior)"), 'right-host control requires its exact within-case evidence prefix');
assert(harness.includes("oracle('C15.ordinary-placement-owned-by-trigger'") && harness.includes("oracle('C15.ordinary-menu-returns-to-own-trigger'"), 'nested ordinary Menu must prove independent placement and focus ownership');
assert(harness.includes('htmx.swap(reentrantContext)') && harness.includes("oracle('C16.real-swap-prepared-during-seed-focus'"), 'reentrant seed case must prepare a real bundled HTMX swap inside focus');
assert(!/new CustomEvent\(['"]htmx:/.test(harness), 'browser harness must not synthesize HTMX lifecycle events');
// Parse control declarations as data. Never import either browser executable
// from this source-only audit. Their selected anchors must track cleanup and
// the panel half of focusout without dropping the independent host exemption.
const readBrowserControl=(path,name)=>{
 const text=readFileSync(path,'utf8'),ast=parse(text,{ecmaVersion:'latest',sourceType:'module'});
 const declaration=ast.body.filter(node=>node.type==='VariableDeclaration').flatMap(node=>node.declarations).find(node=>node.id.name==='mutations');
 const control=declaration?.init.properties.find(property=>(property.key.name??property.key.value)===name)?.value;
 assert(control?.type==='ObjectExpression',path+': missing control '+name);
 const get=key=>control.properties.find(property=>(property.key.name??property.key.value)===key)?.value.value;
 return {from:get('from'),to:get('to'),oracle:get('oracle')};
};
for(const [path,name,from,to,oracle] of [
 ['ui/gohtmx/tests/browser/menu-contracts-browser-test.mjs','cleanup','const cleanup = () => { paletteNavigationActive = false; close(); cleanupContextRequests(); clearReorderPreview();','const cleanup = () => { paletteNavigationActive = false; cleanupContextRequests(); clearReorderPreview();','teardown must close the old open menu'],
 ['adapters/gohtmx/tests/browser/menu-empty-submenu-browser-test.mjs','cleanup','const cleanup = () => { paletteNavigationActive = false; close(); cleanupContextRequests(); clearReorderPreview();','const cleanup = () => { paletteNavigationActive = false; cleanupContextRequests(); clearReorderPreview();','cleanup.old-empty-panel-hidden'],
 ['ui/gohtmx/tests/browser/menu-contracts-browser-test.mjs','native-focus','if (panel.contains(event.relatedTarget) || contextPointerFocus?.contains(event.relatedTarget)) return;','if (contextPointerFocus?.contains(event.relatedTarget)) return;','clicking a hover-open submenu keeps it open'],
]){
 const control=readBrowserControl(path,name);
 assert.equal(control.from,from,path+': exact current production anchor');
 assert.equal(control.to,to,path+': bounded causal change');
 assert.equal(control.oracle,oracle,path+': original designated assertion must remain unchanged');
 parse(mutateContextOwnerSource(source,control,path+'/'+name),{ecmaVersion:'latest',sourceType:'module'});
 console.log(`${path}/${name}: current single-anchor mutation remains parseable`);
}
const assets=await loadContextOwnerAssets(process.cwd());
for(const [path,asset] of assets){
 assert(Buffer.isBuffer(asset.body),path+': production bytes must remain binary-safe');
 assert.deepEqual(asset.body,readFileSync('ui/gohtmx'+path),path+': served asset must exactly match production bytes');
 assert.equal(asset.sourceSHA256,asset.servedSHA256);
 if(path.endsWith('.css'))for(const reference of productionCSSReferences(asset.body.toString('utf8'),path))assert(assets.has(reference),path+': missing referenced production asset '+reference);
 if(/\.(ttf|woff2)$/.test(path))assert(asset.contentType.startsWith('font/'),path+': font MIME type required');
}
assert(assets.has('/assets/ely/fonts/Inter-Regular.ttf')&&assets.has('/assets/ely/fonts/JetBrainsMono-Regular.ttf'));
assert(harness.includes('send(asset.body,asset.contentType)'), 'HTTP serving must preserve binary payload and MIME');
console.log(`${assets.size} exact production assets loaded, including every CSS font/image reference.`);
parse(harness, {ecmaVersion: 'latest', sourceType: 'module'});
console.log('Owner request source/oracle audit passed; no browser was launched.');
