import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {workspaceMatches,replaceWorkspaceMatches,compareProcessCells,bindWorkspaceSource} from '../../assets/ely-api-workspace-source.js';
assert.deepEqual(workspaceMatches('lift Lift uplift lift_', 'lift', {word:true}), [[0,4],[5,9]]);
assert.deepEqual(workspaceMatches('lift Lift', 'lift', {caseSensitive:true}), [[0,4]]);
assert.deepEqual(workspaceMatches('aa aa', ''), []);
assert.deepEqual(workspaceMatches('a.b aXb', 'a.b'), [[0,3]]);
assert.deepEqual(workspaceMatches('λlift liftλ lift', 'lift', {word:true}), [[12,16]]);
// Lowercasing U+0130 expands one source code unit into two search code units.
// Every returned range must still address the original source string.
for (const [text,query,expected] of [
  ['İx','İ',[[0,1]]],
  ['İx','x',[[1,2]]],
  ['😀İxİx','x',[[3,4],[5,6]]],
  ['İxİX','İx',[[0,2],[2,4]]],
  ['i\u0307x','İ',[[0,2]]],
  ['İx','i\u0307',[[0,1]]],
  ['İİ','i',[[0,1],[1,2]]],
  ['İİ','\u0307',[[0,1],[1,2]]],
  ['İİİ','\u0307i',[[0,2]]],
  ['İ ΟΣ ος οσ','ΟΣ',[[2,4],[5,7]]],
  ['İ𐐀x','𐐨',[[1,3]]],
  ['İ😀x','\ud83d',[[1,2]]],
  ['İ😀x','\ude00',[[2,3]]],
  ['İ.a İxa','.a',[[1,3]]],
  ['İx','',[]],
  ['aaaa','aa',[[0,2],[2,4]]],
  ['lift Lift LIFT','lift',[[0,4],[5,9],[10,14]]],
]) assert.deepEqual(workspaceMatches(text,query),expected,`${JSON.stringify(text)} / ${JSON.stringify(query)}`);
assert.deepEqual(workspaceMatches('İx İ x','İ',{word:true}),[[3,4]]);
assert.deepEqual(workspaceMatches('İx x','x',{word:true}),[[3,4]]);
assert.deepEqual(workspaceMatches('İxİ x','x',{word:true}),[[4,5]]);
assert.deepEqual(workspaceMatches('İ i I','i',{caseSensitive:true}),[[2,3]]);
assert.deepEqual(workspaceMatches('İx İX','İx',{caseSensitive:true}),[[0,2]]);
assert.deepEqual(workspaceMatches('İx','i',{caseSensitive:true}),[]);
assert.equal(replaceWorkspaceMatches('İx',workspaceMatches('İx','İ'),'a'),'ax');
assert.equal(replaceWorkspaceMatches('İx',workspaceMatches('İx','x'),'a'),'İa');
assert.equal(replaceWorkspaceMatches('İxİx',workspaceMatches('İxİx','x'),'$&'),'İ$&İ$&');
assert.equal(replaceWorkspaceMatches('İxİx',workspaceMatches('İxİx','İ'),'a',1),'İxax');
assert.equal(replaceWorkspaceMatches('İİİ',workspaceMatches('İİİ','\u0307i'),'a'),'aİ');
assert.equal(replaceWorkspaceMatches('lift Lift',[[0,4],[5,9]],'$&'), '$& $&');
assert.equal(replaceWorkspaceMatches('lift Lift',[[0,4],[5,9]],'blend',1), 'lift blend');
assert(compareProcessCells('9.2','41.8',4)<0);
assert(compareProcessCells('1240 MB','412 MB',5)>0);
assert(compareProcessCells('1240 MB','412 MB',5,true)<0);
assert(compareProcessCells('gallery','zsh',2)<0);
// Exercise actual find highlighting and replacement handlers with a minimal DOM.
const oldDocument=globalThis.document;
const textNode=value=>({textContent:value});
const element=tag=>({tag,childNodes:[],dataset:{},
  get textContent(){return this.childNodes.map(node=>node.textContent).join('');},
  set textContent(value){this.replaceChildren(textNode(value));},
  append(...nodes){for(const node of nodes){node.parentElement=this;this.childNodes.push(node);}},
  replaceChildren(...nodes){this.childNodes=[];this.append(...nodes);},
  setAttribute(name,value){this[name]=value;}
});
globalThis.document={createTextNode:textNode,createElement:element};
try {
  const sourceCode=element('code');sourceCode.textContent='İxİx';
  const query={value:'İ'},replacement={value:'a'},count={textContent:''};
  const options={getAttribute:()=> 'false'};
  const finder={
    querySelector:selector=>selector==='input[data-workspace-find]'?query:selector==='[data-ws-replacement]'?replacement:selector==='[data-workspace-match-count]'?count:options,
    querySelectorAll:()=>[sourceCode],contains:()=>true
  };
  const sourceRoot={
    querySelector:selector=>selector==='[data-workspace-find][data-ws-source="true"]'?finder:selector==='[data-ws-source="true"]'?{querySelectorAll:()=>[]}:null,
    querySelectorAll:()=>[]
  };
  const events={},sourceChanges=[];
  bindWorkspaceSource(sourceRoot,{on:(type,fn)=>events[type]=fn,change:value=>sourceChanges.push(value),emit(){throw Error('find must stay local');}});
  const marks=()=>sourceCode.childNodes.filter(node=>node.tag==='mark').map(node=>node.textContent);
  assert.deepEqual(marks(),['İ','İ']);assert.equal(sourceCode.textContent,'İxİx');assert.equal(count.textContent,'1 of 2');
  query.value='x';events.input({target:{matches:selector=>selector==='input[data-workspace-find]'}});
  assert.deepEqual(marks(),['x','x']);assert.equal(sourceCode.textContent,'İxİx');
  const replace={dataset:{wsReplace:'all'},matches:()=>false,hasAttribute:attribute=>attribute==='data-ws-replace'};
  events.click({target:{closest:()=>replace}});
  assert.equal(sourceCode.textContent,'İaİa');assert.equal(count.textContent,'No matches');
  assert.deepEqual(sourceChanges,[{name:'source',value:'İaİa'}]);
  query.value='İ';replace.dataset.wsReplace='current';events.input({target:{matches:selector=>selector==='input[data-workspace-find]'}});
  events.click({target:{closest:()=>replace}});
  assert.equal(sourceCode.textContent,'aaİa');assert.deepEqual(marks(),['İ']);assert.equal(count.textContent,'1 of 1');
} finally {
  if(oldDocument===undefined) delete globalThis.document;
  else globalThis.document=oldDocument;
}
// Exercise the actual local tab and sort handlers without a browser.
const handlers={};const changes=[];
const root={querySelector:s=>s==='[data-ws-process-list]'?{}:null,querySelectorAll:()=>[]};
bindWorkspaceSource(root,{on:(type,fn)=>handlers[type]=fn,change:v=>changes.push(v),emit(){throw Error('local control must not execute host commands');}});
const paneA={dataset:{wsTerminalPane:'shell'},hidden:false},paneB={dataset:{wsTerminalPane:'build'},hidden:true};
const tabA={setAttribute(k,v){this[k]=v;}};
const tabB={dataset:{wsTerminalTab:'build'},setAttribute(k,v){this[k]=v;},hasAttribute:k=>k==='data-ws-terminal-tab',closest:()=>terminal};
const terminal={querySelectorAll:s=>s==='[data-ws-terminal-tab]'?[tabA,tabB]:[paneA,paneB]};
handlers.click({target:{closest:()=>tabB}});
assert.equal(paneA.hidden,true);assert.equal(paneB.hidden,false);assert.equal(tabA['aria-selected'],'false');assert.equal(tabB['aria-selected'],'true');
assert.equal(changes[0].name,'terminalTab');
const ordered=[],th={removeAttribute(){},setAttribute(k,v){this[k]=v;}};
const row=n=>({cells:[{},{},{},{},{textContent:String(n)}]});
const table={tBodies:[{rows:[row(8),row(41),row(2)],append:r=>ordered.push(r.cells[4].textContent)}],querySelectorAll:()=>[th]};
const sort={dataset:{wsProcessSort:'4'},hasAttribute:k=>k==='data-ws-process-sort',closest:s=>s==='table'?table:th};
handlers.click({target:{closest:()=>sort}});
assert.deepEqual(ordered,['41','8','2']);assert.equal(th['aria-sort'],'descending');
const css=readFileSync(new URL('../../assets/ely-api-workspace.css',import.meta.url),'utf8');
assert.match(css,/\[data-ws-revision\]\{grid-template-columns:24px minmax\(0,1fr\)/);
assert.match(css,/\.ely-workspace__code \[data-ws-code-line\]\{display:flex;align-items:baseline/);
assert.match(css,/\[data-ws-process-list\] table\{width:100%;border-collapse:collapse/);
console.log('Workspace source matching, literal replacement, table sort, local tabs, and geometry contracts passed');
