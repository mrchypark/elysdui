import assert from 'node:assert/strict';
import {fileIconName, fileGridStep, compareFileEntries, acceptsFile} from '../../assets/ely-api-workspace-files.js';

assert.equal(fileGridStep(2, 7, 3, 'ArrowRight'), 3);
assert.equal(fileGridStep(1, 7, 3, 'ArrowDown'), 4);
assert.equal(fileGridStep(4, 7, 3, 'ArrowDown'), 6);
assert.equal(fileGridStep(6, 7, 3, 'ArrowDown'), 6);
assert.equal(fileGridStep(1, 7, 3, 'ArrowUp'), 1);
assert.equal(fileGridStep(5, 7, 3, 'ArrowUp'), 2);
assert.equal(fileGridStep(-1, 7, 3, 'ArrowRight'), 0);
assert.equal(fileGridStep(-1, 7, 3, 'End'), 6);
assert.equal(fileGridStep(0, 0, 3, 'Home'), -1);

const entries = [{name:'z',folder:true},{name:'a',folder:false,size:100},{name:'b',folder:false,size:9}];
assert.deepEqual([...entries].sort((a,b)=>compareFileEntries(a,b,'size')).map(x=>x.name), ['z','b','a']);
assert.deepEqual([...entries].sort((a,b)=>compareFileEntries(a,b,'size',false)).map(x=>x.name), ['z','a','b']);
assert(compareFileEntries({name:'b',folder:false,size:9},{name:'a',folder:false,size:9},'size',false)>0);

for (const [name, icon] of [['Brief.md','file-text'],['main.rs','file-code'],['build.sh','file-terminal'],['config.toml','file-cog'],['data.json','file-json'],['Atrium.JPG','file-image'],['Theme.mp3','file-audio'],['Clip.mov','file-video-camera'],['Archive.zip','file-archive'],['Budget.csv','file-spreadsheet'],['Inter.ttf','file-type'],['Makefile','file']]) assert.equal(fileIconName(name),icon);
assert.equal(fileIconName('folder',true,true),'folder-open');
assert(acceptsFile({name:'PHOTO.PNG',type:'image/png'},'.png,.jpg'));
assert(acceptsFile({name:'x.bin',type:'image/png'},'image/*'));
assert(acceptsFile({name:'x.txt',type:'text/plain'},'text/plain'));
assert(!acceptsFile({name:'x.exe',type:''},'.png,image/*'));
assert(acceptsFile({name:'x.exe',type:''},''));
console.log('workspace file rules passed');

// Source contracts for examples 466–475, including boundary values.
const {fileSize, archiveSaving, archiveTree, recentGroups, duplicateMarks, transferText, operationHeadline, hexReading, bindWorkspaceFileDetails} = await import('../../assets/ely-api-workspace-files.js');
assert.equal(fileSize(2140000), '2.1 MB');
assert.equal(fileSize(184000000), '184 MB');
assert.equal(fileSize(999999), '1.0 MB');
assert.equal(fileSize(0), '0 B');
assert.equal(archiveSaving(0, 10), 0);
assert.equal(archiveSaving(10, 20), 0);
const archive = archiveTree([{path:'z.txt',size:100,packed:120},{path:'Atrium/b.txt',size:4800,packed:1900},{path:'Atrium/Design/a.txt',size:200,packed:100}]);
assert.deepEqual(archive.children.map(n=>n.name), ['Atrium','z.txt']);
assert.deepEqual(archive.children[0].children.map(n=>n.name), ['Design','b.txt']);
assert.equal(archive.size, 5100); assert.equal(archive.packed, 2120);
assert.equal(archive.children[0].size, 5000);
assert.equal(archiveSaving(4800,1900), 60);
const groups = recentGroups([{opened:'2026-03-08T06:00:00Z'},{opened:'2026-03-09T04:10:00Z'},{opened:'2026-03-09T01:00:00Z'}], new Date('2026-03-09T04:20:00Z'), 'America/New_York');
assert.deepEqual(groups.map(g=>g.label), ['Today','Yesterday']);
assert.equal(groups[0].files[0].time, '00:10');
assert.equal(groups[1].files.length, 2, 'yesterday uses calendar days across DST, not 24-hour subtraction');
assert.equal(recentGroups([{opened:'bad date'}]).length, 0);
assert.equal(recentGroups([{opened:'2026-10-13T00:00:00Z'}],new Date('2026-10-13T01:00:00Z'),'invalid/zone').length, 1);
const copies = duplicateMarks([{paths:[{marked:false},{marked:true},{marked:true}]},{paths:[{marked:true},{marked:true}]},{paths:[{marked:false}]}]);
assert(copies[0].paths[0].locked); assert(!copies[0].paths[1].locked);
assert(copies[1].paths.every(p=>!p.marked&&!p.locked), 'all-marked input clears the group, as upstream does');
assert(copies[2].paths[0].locked, 'one-copy input cannot lose its only copy');
assert.equal(transferText({state:'moving',moved:61000000,total:184000000,rate:4200000}), '61 MB of 184 MB · 4.2 MB/s · 29s left');
assert.equal(transferText({state:'moving',moved:46000000,total:184000000,rate:38000000},true), '46 MB of 184 MB · 3s left');
assert.equal(transferText({state:'moving',moved:2,total:1,rate:9}), '2 B of 1 B · 9 B/s · 1s left');
assert.equal(transferText({state:'moving',moved:0,total:0,rate:0}), '0 B of 0 B');
assert.equal(transferText({state:'queued',total:18300}), 'Waiting · 18 KB');
assert.equal(transferText({state:'paused',moved:1100000,total:3200000}), 'Paused at 1.1 MB of 3.2 MB');
assert.equal(transferText({state:'failed',error:'Caller failure'}), 'Failed: Caller failure');
assert.equal(transferText({state:'failed',error:'Caller failure'},true), 'Caller failure');
assert.equal(transferText({state:'done',total:4800}), '4.8 KB');
assert.equal(operationHeadline({operation:'move',state:'done',count:1,to:'Documents'}),'Moved 1 item to Documents');
assert.equal(operationHeadline({operation:'copy',state:'queued',count:2,to:'Backup'}),'Copying 2 items to Backup next');
assert.equal(hexReading([42,1,0,0,255],0),'0x2A · 42 · i8 42 · 0b00101010 · u16 298 · u32 298');
assert.equal(hexReading([42,1,0,0,255],4),'0xFF · 255 · i8 -1 · 0b11111111');
assert.equal(hexReading([],0),'');
for (const name of ['documents/PageTree','documents/Favorites','debug/MemoryViewer','editor/SearchPanel']) {
  bindWorkspaceFileDetails({dataset:{elyComponent:name},querySelector(){throw Error('file binding leaked to '+name);}}, {});
}
for (const disabled of [false,true]) {
  const handlers = {}, requests = [], field = {value:'Brief',matches:()=>true}, list = {children:[{}],hidden:false}, note = {};
  const search = {querySelector: s=>s==='input'?field:s==='ul'?list:note};
  const root = {dataset:{elyComponent:'files/FileSearch',elyDisabled:String(disabled)},querySelectorAll:()=>[],querySelector:s=>s==='[data-ws-file-search]'?search:null};
  bindWorkspaceFileDetails(root,{onRoot:(type,fn)=>(handlers[type]??=[]).push(fn),emit:(action,detail)=>requests.push({action,...detail}),paintFileIcons(){}});
  assert.equal(note.textContent,'1 file');
  field.value='  changed query  ';
  handlers.input.forEach(fn=>fn({target:field}));
  assert.equal(requests.length,disabled?0:1);
  if(!disabled){assert.equal(requests[0].query,'  changed query  ');assert.equal(note.textContent,'Searching…');assert.equal(list.hidden,true,'old host results must be hidden while a new search is pending');}
}
console.log('workspace source file contracts passed');
const {hexRows} = await import('../../assets/ely-api-workspace-files.js');
const {readFileSync} = await import('node:fs');
const sourceBytes = [...readFileSync(new URL('../../assets/ely/workspace-atrium.jpg', import.meta.url)).subarray(0,512)];
const dump = hexRows(sourceBytes);
assert.equal(dump.length,32); assert(dump.every(row=>row.cells.length===16));
assert.equal(dump[0].address,'00000000'); assert.equal(dump[31].address,'000001F0');
assert.equal(dump[0].cells.slice(0,4).map(cell=>cell.hex).join(' '),'FF D8 FF E0');
assert.equal(dump[0].cells[1].index,1); assert(dump[0].cells[1].reading.includes('i8 -40'));
assert.equal(hexRows([0,65,32,255],16)[0].cells.map(cell=>cell.glyph).join(''),'·A ·');
assert.equal(hexRows([0,65],0xffffffffn)[0].address,'0FFFFFFFF');
assert.equal(hexRows(Array(17).fill(0))[1].cells.length,1);
assert.deepEqual(hexRows([]),[]);
console.log('workspace 512-byte source hex fixture produces 32 complete rows');

// Storage weights are dimensionless; CSS may serialize large numbers in exponent
// form or round them. Verify the actual production binder, not attribute spelling.
const savedDocument=globalThis.document;
globalThis.document={createElement:()=>({dataset:{},style:{},setAttribute(){}})};
try {
  for(const bytes of [[38000000000,84000000000,195000000000,20000000000],[600000000000],[]]){
    const parts=bytes.map(bytes=>({dataset:{bytes:String(bytes)},firstElementChild:{style:{}},textContent:'Part'}));
    const bar={children:[],attrs:{},setAttribute(k,v){this.attrs[k]=v},append(n){this.children.push(n)}};
    const storage={dataset:{capacity:'512000000000'},querySelector:()=>bar,querySelectorAll:()=>parts};
    const root={dataset:{elyComponent:'files/StorageUsage'},querySelectorAll:()=>[],querySelector:s=>s==='[data-ws-storage-parts]'?storage:null};
    bindWorkspaceFileDetails(root,{onRoot(){},emit(){},paintFileIcons(){}});
    assert(Math.abs(bar.children.reduce((n,p)=>n+Number(p.style.flexGrow),0)-1)<1e-12);
    if(bytes.length===4){assert.equal(bar.children.length,5);assert.equal(bar.children.at(-1).style.flexGrow,175/512);assert.equal(bar.attrs['aria-valuenow'],'337000000000');}
  }
} finally {globalThis.document=savedDocument;}
console.log('workspace storage normalized tracks and over-capacity/empty boundaries passed');
