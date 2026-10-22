import {registerChecks, assert, waitFor} from './advanced-checks.js';

const action = (actions, name) => assert(actions.some(entry => entry.action === name), 'missing ' + name + ' action');
const one = (root, selector) => { const node = root.querySelector(selector); assert(Boolean(node), 'missing expected control: ' + selector); return node; };
const checkRequiredEditor = (root, actions, editor) => {
  const form = one(root,'form[data-ws-edit-form]');
  if (form.dataset.wsRequired !== 'true') return;
  editor.textContent = ''; editor.dispatchEvent(new Event('input',{bubbles:true}));
  const count = actions.length;
  one(form,'button[type="submit"]').click();
  assert(actions.length === count, 'empty required editor emitted a host action');
  assert(editor.getAttribute('aria-invalid') === 'true' && one(form,'[data-ws-edit-error]').textContent === 'Enter content before submitting.', 'required editor error is absent');
};
const devtoolsSource = async ({root,actions}) => {
  const kind=one(root,'[data-ws-devtools-source]').dataset.kind;
  const input=(selector,value)=>{const n=one(root,selector);n.value=value;n.dispatchEvent(new Event('input',{bubbles:true}));return n;};
  const choose=(selector,value)=>{const n=one(root,selector);n.value=value;n.dispatchEvent(new Event('change',{bubbles:true}));};
  const key=(n,value)=>n.dispatchEvent(new KeyboardEvent('keydown',{key:value,bubbles:true}));
  switch(kind){
    case 'ConnectionManager': {
      assert(root.querySelectorAll('[data-dt-connection]').length===4,'source connections missing');
      one(root,'[data-dt-test-connection]').click();const request=actions.findLast(a=>a.action==='test-connection');assert(request?.connection.name==='Shop'&&request.connection.port===5432,'connection test lost caller fields');
      input('[name="port"]','0');assert(one(root,'[data-dt-test-connection]').disabled&&one(root,'[data-dt-save-connection]').disabled,'invalid port accepted');
      one(root,'[data-dt-edit-connection="notes"]').click();assert(one(root,'[aria-label="File"]').value==='~/notes.db'&&!root.querySelector('[aria-label="Port"]'),'SQLite form not file-only');
      one(root,'[data-dt-save-connection]').click();assert(actions.findLast(a=>a.action==='save-connection')?.connection.engine==='SQLite','connection save contract wrong');break;
    }
    case 'SchemaTree': {
      assert(root.querySelectorAll('[data-dt-table-node]').length===4&&root.querySelectorAll('[data-dt-relation]').length===2,'ER fields or links missing');
      one(root,'[data-dt-key="public.orders.user_id"]').click();assert(actions.findLast(a=>a.action==='select-schema')?.paths[0]==='public.orders.user_id','schema selection path lost');
      key(one(root,'[data-dt-table-node="orders"]'),'ArrowRight');assert(actions.findLast(a=>a.action==='move-schema-table')?.places.orders.x===301,'ER local move wrong');break;
    }
    case 'QueryEditor': {
      assert(root.querySelectorAll('[data-dt-query-results] tbody tr').length===5,'source result rows missing');input('[data-dt-history-search]','order_item');assert(root.querySelectorAll('[data-dt-history]').length===1,'query history search wrong');key(one(root,'[data-dt-history]'),'Enter');assert(actions.findLast(a=>a.action==='rerun-query')?.sql==='SELECT * FROM order_item','history replay lost SQL');input('[data-dt-sql]','SELECT 42');one(root,'[data-dt-run-query]').click();assert(actions.findLast(a=>a.action==='run-query')?.sql==='SELECT 42','query uses stale text');assert(root.querySelectorAll('[data-dt-query-results] tbody tr').length===5,'query fabricated results');break;
    }
    case 'TableStructureEditor': {
      input('[aria-label="Field name 0"]','order_id');assert(actions.findLast(a=>a.action==='edit-table-structure')?.fields[0].name==='order_id','field draft lost edit');one(root,'[data-dt-add-field]').click();assert(actions.findLast(a=>a.action==='edit-table-structure')?.fields.length===5,'field add failed');input('[aria-label="Index name"]','caller_index');one(root,'[data-dt-panel="indexes"] [aria-label="order_id"]').click();one(root,'[data-dt-create-index]').click();assert(actions.findLast(a=>a.action==='create-index')?.index.fields[0]==='order_id','index create payload wrong');break;
    }
    case 'RedisKeyBrowser': {
      input('[data-dt-key-pattern]','user:*');assert(root.querySelectorAll('[data-dt-redis-key]').length===2,'Redis glob not applied');input('[data-dt-key-pattern]','user:?');assert(root.querySelectorAll('[data-dt-redis-key]').length===0,'Redis ? is not one character');input('[data-dt-key-pattern]','');one(root,'[data-dt-redis-key="queue:mail"]').click();assert(one(root,'[data-dt-panel="value"]').textContent.includes('welcome:42')&&actions.findLast(a=>a.action==='select-redis-key')?.key==='queue:mail','typed Redis value not selected');break;
    }
    case 'DocumentViewer': {
      input('[data-dt-json-editor]','{"hello":[1,2]}');one(root,'[data-dt-json-format]').click();assert(one(root,'[data-dt-json-editor]').value.includes('\n'),'JSON format failed');one(root,'[data-dt-json-minify]').click();assert(one(root,'[data-dt-json-editor]').value==='{"hello":[1,2]}','JSON minify failed');input('[data-dt-json-editor]','{');assert(one(root,'[data-dt-json-format]').disabled&&one(root,'[data-dt-json-minify]').disabled,'invalid JSON accepted');input('[data-dt-document-search]','Ada');assert(one(root,'[data-dt-key="$.customer.name"]').textContent.includes('Ada Lovelace'),'document search did not reveal matching path');assert(one(root,'[data-dt-panel="xml"]').textContent.includes('Faster queries'),'XML tree missing');break;
    }
    case 'ApiRequestBuilder': {
      assert(one(root,'[data-dt-resolved-url]').textContent==='https://staging.api.example.com/v1/orders?status=open&limit=20','resolved address wrong');one(root,'[aria-label="Show token"]').click();choose('[aria-label="Environment"]','production');assert(one(root,'[aria-label="Show token"]')&&!one(root,'[data-dt-panel="collections"]').textContent.includes('sk_live_91c07e'),'environment switch leaked secret');one(root,'[data-dt-send-request]').click();const sent=actions.findLast(a=>a.action==='send-request');assert(sent?.request.params.length===2&&sent.address.startsWith('https://api.example.com/'),'request payload lost pairs or environment');one(root,'[data-dt-response-tab="Headers"]').click();assert(one(root,'[data-dt-panel="response"]').textContent.includes('x-request-id'),'response headers missing');break;
    }
    case 'WebSocketConsole': {
      const before=one(root,'[data-dt-socket-log]').children.length;const draft=input('[data-dt-socket-draft]','ping');key(draft,'Enter');assert(actions.findLast(a=>a.action==='send-socket')?.text==='ping'&&draft.value==='','socket send/clear failed');assert(one(root,'[data-dt-socket-log]').children.length===before,'socket fabricated a sent message');one(root,'[data-dt-socket-toggle]').click();assert(actions.findLast(a=>a.action==='toggle-socket')?.state==='open','socket host toggle missing');break;
    }
    case 'GraphQLExplorer': {
      input('[data-dt-graphql-variables]','{');assert(one(root,'[data-dt-graphql-run]').disabled,'GraphQL accepted invalid variables');input('[data-dt-graphql-variables]','{"id":"42"}');one(root,'[data-dt-graphql-run]').click();assert(actions.findLast(a=>a.action==='run-graphql')?.variables==='{"id":"42"}','GraphQL lost current variables');key(one(root,'[data-dt-key="Order"]'),'ArrowRight');key(one(root,'[data-dt-key="Order.id"]'),'Enter');assert(actions.findLast(a=>a.action==='pick-graphql-field')?.path==='Order.id','schema field callback lost path');break;
    }
    case 'RegexTester': {
      await waitFor(()=>one(root,'[data-dt-regex-matches]').textContent!=='Evaluating…',6000);assert(one(root,'[data-dt-regex-matches]').textContent.startsWith('2 matches'),'regex evaluation failed: '+one(root,'[data-dt-regex-matches]').textContent);assert(one(root,'[data-dt-regex-matches]').textContent.includes('user: ada'),'regex captures absent');input('[data-dt-encoder-input]','aGk=');choose('[aria-label="Direction"]','Decode');assert(one(root,'[data-dt-encoder-output]').textContent==='hi','UTF-8 Base64 decode failed');input('[aria-label="Foreground"]','#000000');input('[aria-label="Background"]','#ffffff');assert(one(root,'[data-dt-contrast-ratio]').textContent==='21.00 : 1','contrast calculation wrong');break;
    }
    case 'ContainerList': {
      const first=one(root,'[data-dt-container="web"]');one(first,'[data-dt-container-toggle]').click();assert(actions.findLast(a=>a.action==='toggle-container')?.key==='web'&&first.textContent.includes('running'),'container toggle changed state without host');choose('[aria-label="Namespace"]','kube-system');assert(root.querySelectorAll('[data-dt-pods] tbody tr').length===1&&one(root,'[data-dt-pods]').textContent.includes('coredns'),'namespace filter wrong');assert(root.querySelectorAll('[data-dt-reading]').length===4&&root.querySelectorAll('[data-dt-reading] meter').length===3,'source resource readings missing');break;
    }
    default:throw Error('No source devtools check for '+kind);
  }
};
const code = async ({root,actions,twin}) => {
  if(root.querySelector("[data-ws-devtools-source]"))return devtoolsSource({root,actions});
  if(root.dataset.elyComponent==='editor/MiniMap'){const minimap=one(root,'[data-ws-minimap]');assert(!minimap.querySelector('[contenteditable]')&&minimap.textContent.includes('func'),'MiniMap must be a standalone read-only control');return;}
  const editor = one(root, '[data-workspace-rich]');
  if(root.dataset.elyKind==='CodeEditor'){const minimap=one(root,'[data-ws-minimap]');assert(!minimap.querySelector('[contenteditable]')&&minimap.textContent.includes('func'),'CodeEditor minimap must be a standalone read-only control');const fold=one(root,'[data-ws-code-line="2"] [data-ws-fold]');fold.click();assert(fold.getAttribute('aria-expanded')==='true'&&actions.findLast(a=>a.action==='toggle-code-fold')?.line==='2','code fold did not toggle');assert(one(root,'[data-ws-syntax="keyword"]').textContent==='func'&&one(root,'[data-ws-diagnostic="warning"]').textContent==='Caller warning','caller code decorations missing');one(root,'[data-ws-code-lens="references"]').click();assert(actions.findLast(a=>a.action==='run-code-lens')?.lens==='references','code lens did not emit');one(root,'[data-ws-editor-tool="toggle-minimap"]').click();assert(actions.findLast(a=>a.action==='editor-tool')?.tool==='toggle-minimap','editor toolbar did not emit its caller action');one(root,'[data-ws-editor-breadcrumb="src/worker.go"]').click();assert(actions.findLast(a=>a.action==='open-code-location')?.location==='src/worker.go','editor breadcrumb did not emit its caller location');}
  if(root.dataset.elyKind==='QueryEditor'){assert(one(root,'tbody').textContent.includes('ada@example.test')&&one(root,'[aria-label="Query plan"]').textContent.includes('Seq Scan users'),'query result or plan missing');const filter=one(root,'[data-ws-query-filter]');filter.value='grace';filter.dispatchEvent(new Event('input',{bubbles:true}));assert(one(root,'[data-ws-query-row="0"]').hidden&&!one(root,'[data-ws-query-row="1"]').hidden,'query filter did not hide rows');one(root,'[data-ws-query-sort="0"]').click();assert(actions.findLast(a=>a.action==='sort-query-results')?.column===0,'query sort did not emit');one(root,'[data-ws-query-history="run-1"]').click();assert(editor.textContent.trim()==='SELECT email FROM users'&&one(root,'input[data-ws-content-value]').value==='SELECT email FROM users'&&actions.findLast(a=>a.action==='rerun-query')?.historyId==='run-1'&&actions.findLast(a=>a.action==='rerun-query')?.id===root.id,'query history did not restore caller query');one(root,'[data-ws-plan-step="scan-users"]').click();assert(actions.findLast(a=>a.action==='select-query-plan-step')?.step==='scan-users','query plan selection did not emit');}
  const twinBefore = twin?.querySelector('[data-workspace-rich]')?.textContent;
  const line=document.createElement('div'),gutter=document.createElement('span'),source=document.createElement('code');gutter.contentEditable='false';gutter.textContent='1';source.textContent='first line';line.append(gutter,source);
  const added=document.createElement('div');added.textContent='new browser line';editor.replaceChildren(line,added);editor.dispatchEvent(new Event('input',{bubbles:true}));submitData(root,actions,editor.dataset.name,'first line\nnew browser line');
  if(editor.closest('form').dataset.wsRequired==='true'){source.textContent='';editor.replaceChildren(line);const count=actions.length;one(root,'button[type="submit"]').click();assert(actions.length===count,'line numbers satisfied required code input');}
  editor.textContent = 'changed caller code'; editor.dispatchEvent(new Event('input', {bubbles: true}));
  submitData(root,actions,editor.dataset.name,'changed caller code');
  if(twin)assert(one(twin,'[data-workspace-rich]').textContent === twinBefore,'code edit changed twin');
  checkRequiredEditor(root,actions,editor);
};
const find = async ({root}) => {
  const input = one(root, 'input[data-workspace-find]'); input.value = 'caller'; input.dispatchEvent(new Event('input', {bubbles: true}));
  assert(one(root, '[data-workspace-match-count]').textContent==='2 matches', 'find did not count caller lines');
};
const diff = async ({root, actions}) => {
  assert(root.querySelector('.ely-workspace__diff-add') && root.querySelector('.ely-workspace__diff-remove'), 'diff hunks are absent');
  const unfold=one(root,'[data-ws-diff-unfold]');unfold.click();assert(!one(root,'[data-ws-diff-hunk] .ely-workspace__diff').hidden&&unfold.hidden,'folded diff hunk did not open');
  const layouts=[...root.querySelectorAll('[data-ws-diff-layout-option]')];assert(layouts.length===2&&layouts[0].getAttribute('aria-pressed')==='true','caller diff layout options are absent');layouts[1].click();assert(layouts[1].getAttribute('aria-pressed')==='true'&&actions.findLast(a=>a.action==='set-diff-layout')?.layout==='split','diff layout did not emit host action');
  const button = one(root, '[data-ely-action]'); button.click(); action(actions, button.dataset.elyAction);
};
const conflict = async ({root, actions}) => {
  assert(root.querySelectorAll('[data-ws-merge-side]').length===3,'three-way merge panes missing');const theirs = one(root, 'input[value="theirs"]'); theirs.click(); assert(theirs.checked, 'conflict choice did not change');
  const merged = one(root, 'textarea[name="merged"]');assert(merged.value==='return callerNew'&&one(root,'[data-ws-merge-status]').textContent==='Selected theirs.','conflict choice did not populate merged result');merged.value = 'resolved caller value';
  assert(submitData(root,actions,'merged','resolved caller value').get('resolution')==='theirs','conflict lost resolution');
};
const graph = async ({root}) => {
  assert(one(root,'[data-ws-parent-edge="commit-parent"]').getAttribute('d')==='M260 120 L80 80','commit parents did not render edges');
  const node = one(root, 'svg g[data-workspace-select]'); node.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  assert(node.getAttribute('role') === 'button' && node.getAttribute('aria-pressed') === 'true', 'graph node was not selected');
  const layout=one(root,'[data-ws-graph-layout="lanes"]');layout.click();assert(layout.getAttribute('aria-pressed')==='true','graph layout was not selected');one(root,'[data-ws-graph-zoom="in"]').click();assert(one(root,'[data-ws-graph-zoom]').textContent==='110%'&&root.dataset.wsGraphZoom==='110','graph zoom did not update locally');
};
const blame = async ({root,actions}) => {
  const filter=one(root,'[data-ws-blame-filter]');filter.value='Reviewer';filter.dispatchEvent(new Event('input',{bubbles:true}));const rows=[...root.querySelectorAll('[data-ws-blame-row]')];assert(rows[0].hidden&&!rows[1].hidden,'blame filter failed');rows[1].click();assert(rows[1].getAttribute('aria-selected')==='true'&&one(root,'[data-ws-blame-status]').textContent==='Selected d4e5f6a'&&actions.findLast(a=>a.action==='select-blame-commit')?.commit==='d4e5f6a','blame commit selection failed');
};
const terminal = async ({root, actions}) => {
  if(root.dataset.elyKind==='CommandBlock'){assert(one(root,'[data-ws-command-block]').textContent.includes('~/Caller/workspace'),'command block context missing');const fold=one(root,'[data-ws-command-fold]');fold.click();assert(one(root,'[data-ws-command-output]').hidden&&fold.getAttribute('aria-expanded')==='false','command output did not fold');hostButton(root,actions,'rerun-command','cargo test --lib');return;}
  assert(one(root,'[data-ws-terminal-output]').textContent.includes('test caller::works'),'terminal output missing');const history = one(root, '[data-workspace-history]'); history.click();
  const command = one(root, 'input[name="command"]'); assert(command.value === history.value, 'history did not populate command');
  const form = one(root, 'form'); form.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true})); action(actions, form.dataset.elySubmit);
};
const rich = async ({root,actions,twin}) => {
  if (root.querySelector('[data-ws-threads]')) { checkThread(root,actions); return; }
  const editor = one(root, '[data-workspace-rich]'); editor.textContent = 'one two three'; editor.dispatchEvent(new Event('input', {bubbles: true}));
  assert(one(root, '[data-workspace-word-count]').textContent === '3 words', 'word count did not reflect edit');
  submitData(root,actions,editor.dataset.name,'one two three');
  const range=document.createRange();range.selectNodeContents(editor);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));
  one(root,'[data-ws-format="code"]').click();
  assert(one(editor,'code').textContent==='one two three','native range formatting failed');
  submitData(root,actions,editor.dataset.name,'<code>one two three</code>');
  const twinBefore=twin?.querySelector('[data-workspace-rich]')?.textContent;
  editor.replaceChildren();
  const bold=document.createElement('strong');bold.textContent='Caller format';bold.setAttribute('onclick','hostile');
  const link=document.createElement('a');link.href='javascript:hostile';link.textContent=' link';
  editor.append(bold,link);editor.dispatchEvent(new Event('input',{bubbles:true}));
  submitData(root,actions,editor.dataset.name,'<strong>Caller format</strong><a> link</a>');
  if(twin)assert(one(twin,'[data-workspace-rich]').textContent===twinBefore,'rich edit changed twin');
  checkRequiredEditor(root,actions,editor);
  if(root.dataset.elyKind==='CommentThread')checkComment(root,actions);
};
const markdown = async ({root, actions}) => {
  const modes=[...root.querySelectorAll('[data-ws-markdown-mode]')];assert(modes.length===3&&root.querySelector('[data-ws-markdown-layout]').dataset.wsMarkdownLayout==='split','markdown mode controls missing');
  one(root,'[data-ws-markdown-mode="source"]').click();assert(root.querySelector('[data-ws-markdown-layout]').dataset.wsMarkdownLayout==='source'&&one(root,'[data-ws-markdown-mode="source"]').getAttribute('aria-selected')==='true','markdown mode did not change locally');
  const source = one(root, 'textarea[data-workspace-markdown]'); source.value = '# caller'; source.dispatchEvent(new Event('input', {bubbles: true}));
  action(actions, 'preview-markdown');
  await waitFor(() => root.querySelector('[data-workspace-markdown-preview] h1')?.textContent === 'caller' || root.querySelector('[data-static-markdown-preview]')?.textContent === '# caller');
  const staticPreview = root.querySelector('[data-static-markdown-preview]');
  if (staticPreview) {
    assert(staticPreview.textContent === '# caller' && root.querySelector('[data-workspace-markdown-preview]').textContent.includes('full Markdown rendering requires the Go backend.'), 'static adapter must show source and explain the unavailable Go renderer');
    assert(!root.querySelector('[data-workspace-markdown-preview] h1'), 'static adapter must not claim full Markdown rendering');
  } else assert(one(root, '[data-workspace-markdown-preview] h1').textContent === 'caller', 'host preview did not render caller heading');
};
const blockEditor = async ({root,actions}) => {
  const blocks=[...root.querySelectorAll('[data-ws-block]')];assert(blocks.length===3&&blocks.every(block=>block.querySelector('[data-ws-block-handle]')),'block editor caller blocks or handles missing');
  const field=one(root,'[data-ws-content-value]'), serialized=()=>[...root.querySelectorAll('[data-ws-block-content]')].map(node=>node.textContent).join('\n');
  assert(field.value===serialized(),'initial block content did not serialize');
  one(blocks[0],'[data-ws-block-content]').textContent='Caller edit before input event';
  submitData(root,actions,field.name,serialized());
  one(blocks[1],'[data-ws-block-menu]').click();const menu=one(root,'[data-ws-slash-menu]');assert(!menu.hidden&&menu.querySelectorAll('[data-ws-insert-block]').length===3,'block menu did not open');
  one(menu,'[data-ws-insert-block="todo"]').click();assert(root.querySelectorAll('[data-ws-block]').length===4&&menu.hidden,'block insertion did not update local document');
  const content=one(root,'[data-ws-block-content]');content.textContent='Caller changed block';content.dispatchEvent(new Event('input',{bubbles:true}));assert(one(root,'[data-ws-content-value]').value.includes('Caller changed block'),'block changes did not serialize to host field');submitData(root,actions,one(root,'[data-ws-content-value]').name,one(root,'[data-ws-content-value]').value);
};
const markdownRenderer = async ({root,twin}) => {
  assert(!root.querySelector('textarea,[contenteditable="true"]'), 'renderer must be read-only');
  const markdown=one(root,'.ely-workspace__markdown'), heading=one(markdown,'h1');
  assert(heading.textContent==='Lift','caller markdown heading missing');
  const headings=[...markdown.querySelectorAll('h1,h2,h3,h4,h5,h6')];
  assert(headings.every(h=>h.id.startsWith(root.id+'-heading-')),'heading IDs must be local');
  if(twin)assert(headings.every(h=>!twin.querySelector('[id="'+h.id+'"]')),'heading IDs overlap twin');
  const variant=root.dataset.elyComponent.split('/')[1];
  if(variant==='TableOfContents' || variant==='DocumentOutline') {
    const links=[...one(root,'[data-ws-markdown-nav]').querySelectorAll('a')];
    assert(links.length===3 && links.length===headings.length,'heading navigation incomplete');
    assert(links.every((link,i)=>link.hash==='#'+headings[i].id && link.textContent===headings[i].textContent),'heading navigation targets wrong');
    links[1].click(); await waitFor(()=>location.hash==='#'+headings[1].id);
    assert(location.hash===links[1].hash,'heading link failed to navigate');
  }
  if(variant==='ReadingProgress') {
    const area=one(root,'[data-ws-reading]'), progress=one(root,'progress[data-ws-reading-progress]');
    assert(area.scrollHeight>area.clientHeight && progress.value<100,'reading fixture must overflow');
    area.scrollTop=area.scrollHeight; area.dispatchEvent(new Event('scroll'));
    assert(progress.value===100 && area.scrollTop>0,'reading progress did not reach end');
    area.scrollTop=0;area.dispatchEvent(new Event('scroll'));assert(progress.value===0,'reading progress did not return to start');
  }
};
const files = async ({root,actions}) => {
  const directory=root.querySelector('[data-ws-directory]');
  if(directory){
    if(root.dataset.elyKind==='FileExplorer')one(root,'[data-ws-file-view="list"]').click();
    const rows=()=>[...one(root,'[data-ws-directory-table]').tBodies[0].rows];
    assert(rows().length===9&&rows()[0].dataset.name==='Design'&&rows()[2].dataset.name==='Archive.zip','directory initial folder-first ordering missing');
    one(root,'[data-ws-file-sort="size"]').click();assert(rows()[2].dataset.name==='Brief.md','size did not sort numerically');one(root,'[data-ws-file-sort="size"]').click();assert(rows()[2].dataset.name==='Walkthrough.mov'&&rows()[0].dataset.folder==='true','reverse size sort lost folders-first');
    const brief=rows().find(row=>row.dataset.name==='Brief.md');brief.click();brief.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(actions.findLast(a=>a.action==='open-file')?.path==='Home/Projects/Atrium/Brief.md','file open payload lost path');
    rows().find(row=>row.dataset.name==='Design').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));assert(directory.dataset.path==='Home/Projects/Atrium/Design'&&rows().length===3&&rows().some(row=>row.dataset.name==='Moodboard.png'),'preloaded folder did not open locally');
    one(root,'[data-ws-file-breadcrumb="Home/Projects"]').click();assert(directory.dataset.path==='Home/Projects'&&rows().some(row=>row.dataset.name==='Dunes'),'breadcrumb did not climb');
    if(root.dataset.elyKind==='FileExplorer'){one(root,'[data-ws-file-view="icons"]').click();assert(!one(root,'[data-ws-file-pane="icons"]').hidden,'icon view missing');one(root,'[data-ws-file-view="columns"]').click();assert(one(root,'[data-ws-file-pane="columns"]').children.length===2,'columns do not follow current path');}
    return;
  }
  const toggle=[...root.querySelectorAll('[data-workspace-tree]')].find(node=>node.parentElement.querySelector(':scope > ul')),branch=one(toggle.parentElement,':scope > ul');toggle.click();assert(branch.hidden&&toggle.getAttribute('aria-expanded')==='false','tree collapse failed');toggle.click();assert(!branch.hidden,'tree expansion failed');
  const filter=one(root,'[data-workspace-filter]');filter.value='Budget';filter.dispatchEvent(new Event('input',{bubbles:true}));const budget=one(root,'[data-workspace-tree][data-value="Projects/Atrium/Budget.csv"]');assert(!budget.closest('[hidden]'),'filter left matching child collapsed');budget.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(actions.findLast(a=>a.action==='open-file')?.path==='Projects/Atrium/Budget.csv','tree Enter did not emit caller path');filter.value='';filter.dispatchEvent(new Event('input',{bubbles:true}));assert(one(root,'[data-workspace-tree][data-value="Projects/Atrium"]').getAttribute('aria-expanded')==='false','filter did not restore caller collapse');
};
const data = async ({root}) => {
  const row = one(root, 'tr[data-workspace-select]');
  row.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true})); assert(row.tabIndex === 0 && row.getAttribute('aria-selected') === 'true', 'data row did not select');
};
const filesDevtools = async ({root,actions,expectError}) => {
  if(root.querySelector("[data-ws-devtools-source]"))return devtoolsSource({root,actions});
  const kind=root.dataset.elyKind;
  switch(kind) {
    case 'FileIcon': { const icons=[...root.querySelectorAll('[data-ws-file-icon]')];assert(icons.length===14&&icons[0].dataset.iconName==='folder'&&icons[1].dataset.iconName==='folder-open'&&icons.find(icon=>icon.dataset.name==='Budget.csv')?.dataset.iconName==='file-spreadsheet','source icon samples missing');break; }
    case 'FileItem': { const cards=[...root.querySelectorAll('[data-ws-file-card]')];assert(cards.length===5&&cards[2].getAttribute('aria-selected')==='true'&&cards[2].textContent.includes('4.8 KB'),'caller file rows missing');cards[0].click();assert(cards[0].getAttribute('aria-selected')==='true'&&cards[2].getAttribute('aria-selected')==='false','file row selection failed');break; }
    case 'FileGrid': { const cards=[...root.querySelectorAll('[data-ws-file-grid-item]')],grid=one(root,'[data-ws-file-grid-list]');assert(cards.length===9,'file grid entries missing');cards[0].click();const nextRow=cards.find(card=>card.offsetTop>cards[0].offsetTop);if(nextRow){cards[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert(nextRow.getAttribute('aria-selected')==='true','Down did not move by a grid row');}cards[2].click();cards[2].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert(cards[3].getAttribute('aria-selected')==='true','Right did not select next tile');cards[3].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(actions.findLast(a=>a.action==='open-file')?.path==='Home/Projects/Atrium/Budget.csv','grid open path missing');cards[3].dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));const preview=one(root,'[data-ws-file-preview-dialog]');assert(preview.open&&one(preview,'[data-ws-file-preview-content]').textContent==='Caller budget preview','quick look content missing');preview.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!preview.open&&document.activeElement===grid,'quick look Escape failed');break; }
    case 'FileContextMenu': {const card=one(root,'[data-ws-file-grid-item][data-name="Brief.md"]'),menu=one(root,'[data-ws-file-context]');assert(menu.hidden,'context menu began open');card.dispatchEvent(new MouseEvent('contextmenu',{bubbles:true,clientX:100,clientY:100}));assert(!menu.hidden&&document.activeElement===one(menu,'button'),'context menu did not focus');hostButton(menu,actions,'rename-file','Home/Projects/Atrium/Brief.md');assert(menu.hidden,'context menu did not close');card.dispatchEvent(new KeyboardEvent('keydown',{key:'F10',shiftKey:true,bubbles:true}));menu.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(menu.hidden&&document.activeElement===card,'context keyboard dismissal failed');break;}
    case 'RecentFiles': { const recent=one(root,'[data-ws-recent-files]'),groups=[...recent.querySelectorAll(':scope > section')];assert(groups.length===3&&groups[0].querySelector('h3').textContent==='Today'&&groups[1].querySelector('h3').textContent==='Yesterday','recent day groups missing');const rows=[...recent.querySelectorAll('[data-ws-file-result]')];assert(rows.length===5&&rows[0].dataset.path==='Projects/Atrium/Brief.md'&&one(rows[0],'time').textContent==='06:34','recent sort/time missing');rows[0].click();rows[0].dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert(rows[1].getAttribute('aria-selected')==='true','recent day navigation failed');rows[1].dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(actions.findLast(a=>a.action==='open-file')?.path==='Projects/Atrium/Budget.csv','recent open path missing');break; }
    case 'Favorites': {const list=one(root,'[data-ws-pins]');assert(list.querySelectorAll('[data-ws-favorite]').length===3,'source pins missing');hostButton(root,actions,'open-favorite','atrium');one(list,'[data-ws-favorite-down]').click();assert(one(list,'[data-ws-favorite]').dataset.wsFavorite==='roadmap'&&actions.findLast(a=>a.action==='reorder-favorites')?.order.join('|')==='roadmap|atrium|music','favorite reorder failed');one(list,'[data-ws-favorite-unpin]').click();assert(actions.findLast(a=>a.action==='unpin-favorite')?.value==='roadmap'&&list.querySelectorAll('[data-ws-favorite]').length===2,'favorite unpin failed');break;}
    case 'DuplicateFinder': {const group=one(root,'[data-ws-duplicate-set]'),boxes=[...group.querySelectorAll('input')];assert(boxes.length===3&&boxes[0].disabled&&!boxes[0].checked&&boxes[1].checked&&boxes[2].checked,'last kept copy must be locked');assert(one(root,'[data-ws-duplicate-freed]').textContent==='188 MB to free','duplicate total wrong');boxes[1].click();assert(!boxes[0].disabled&&actions.findLast(a=>a.action==='mark-duplicate')?.marked===false,'unmark did not unlock last copy');boxes[0].click();assert(boxes[1].disabled,'new last copy not protected');one(root,'[data-ws-remove-marked]').click();const paths=actions.findLast(a=>a.action==='remove-duplicates')?.paths;assert(paths?.includes('Projects/Atrium/Atrium.jpg')&&!paths.includes('Downloads/Atrium.jpg')&&group.isConnected,'remove request wrong or claimed host deletion');break;}
    case 'SchemaTree': { const parent=one(root,'[data-schema-path="public"] details'); assert(!parent.open,'schema starts collapsed'); one(parent,'summary').click(); const leaf=one(parent,'[data-schema-path="public.projects.id"]'); assert(parent.open && leaf.textContent.includes('uuid'),'recursive schema child missing'); break; }
    case 'TableStructureEditor': { const name=one(root,'input[name="columns[0][name]"]'); name.value='project_uuid'; const nullable=one(root,'input[name="columns[0][nullable]"]'); nullable.click(); const fd=submitData(root,actions,'columns[0][name]','project_uuid'); assert(fd.get('columns[0][type]')==='uuid' && fd.has('columns[0][nullable]')===nullable.checked,'table structure payload is wrong');nullable.click();const unchecked=submitData(root,actions,'columns[0][name]','project_uuid');assert(!nullable.checked&&!unchecked.has('columns[0][nullable]'),'unchecked nullable remained in submitted fields'); break; }
    case 'RedisKeyBrowser': { const input=one(root,'input[data-ws-redis-search]'), entries=[...root.querySelectorAll('[data-ws-redis-entry]')]; input.value='project'; input.dispatchEvent(new Event('input',{bubbles:true})); assert(entries[0].hidden && !entries[1].hidden,'redis key search did not filter'); const key=one(entries[1],'[data-ws-redis-key]'); key.click(); assert(one(root,'[data-ws-redis-preview]').textContent==='{"name":"Caller project"}' && actions.findLast(a=>a.action==='select-redis-key')?.key==='project:7','redis selection payload or preview wrong'); hostButton(root,actions,'delete-redis-key','project:7'); assert(!entries[1].hidden && entries[1].isConnected,'redis key was deleted without host'); break; }
    case 'DocumentViewer': { const doc=one(root,'[data-ws-devtools-document]'); assert(!doc.querySelector('textarea,[contenteditable="true"]') && one(doc,'[data-ws-document-json]').textContent==='{"_id":"project-7","active":true}' && doc.textContent.includes('project-7'),'document viewer is not caller-driven read-only JSON'); break; }
    case 'ContainerList': { const row=one(root,'tr[data-ws-container]'); assert(row.dataset.containerId==='a1b2c3d4' && row.textContent.includes('caller/api:1.2') && row.textContent.includes('8080:8080'),'container metadata missing'); hostButton(root,actions,'stop-container','a1b2c3d4'); assert(row.textContent.includes('running'),'container status changed without host'); break; }
    case 'GraphQLExplorer': { const query=one(root,'textarea[name="query"]'), variables=one(root,'textarea[name="variables"]'); assert(one(root,'[data-ws-graphql-response]').textContent.includes('Caller project'),'GraphQL caller response missing');one(root,'[data-ws-schema-field="project"]').click();assert(actions.findLast(a=>a.action==='insert-graphql-field')?.field==='project','GraphQL schema field did not emit');query.value='query { project { id } }'; variables.value='{"id":"changed"}'; const fd=submitData(root,actions,'query','query { project { id } }'); assert(fd.get('variables')==='{"id":"changed"}','GraphQL variables missing from host payload'); root.dispatchEvent(new CustomEvent('ely:result',{bubbles:true,detail:{action:one(root,'form').dataset.elySubmit,result:{data:{project:{id:'changed'}}}}})); const output=one(root,'[data-ws-host-result]'); assert(!output.hidden && output.dataset.wsResultState==='result' && output.textContent==='{"data":{"project":{"id":"changed"}}}','GraphQL host result did not render safely'); break; }
    case 'RegexTester': { const pattern=one(root,'input[name="pattern"]'), text=one(root,'textarea[name="text"]'); pattern.value='caller-[0-9]+'; text.value='caller-77'; const fd=submitData(root,actions,'pattern','caller-[0-9]+'); assert(fd.get('text')==='caller-77' && !root.querySelector('[data-workspace-rich]'),'regex host payload is incomplete or became generic code'); expectError('Pattern rejected by host');root.dispatchEvent(new CustomEvent('ely:error',{bubbles:true,detail:{action:one(root,'form').dataset.elySubmit,error:new Error('Pattern rejected by host')}})); const output=one(root,'[data-ws-host-result]'); assert(!output.hidden && output.dataset.wsResultState==='error' && output.textContent==='Pattern rejected by host','regex host error did not render'); break; }
    default: throw new Error('No files/devtools assertion for '+kind);
  }
};
// Source-scene assertions retain the legacy checks below for legacy callers.
const canvasScene = async ({root,actions}) => {
  const kind=one(root,'[data-ws-canvas-scene]').dataset.sceneKind;
  const change=(selector,value)=>{const input=one(root,selector);input.value=value;input.dispatchEvent(new Event('change',{bubbles:true}));};
  if(kind==='LayerPanel'){
    assert(root.querySelectorAll('[data-cs-layer]').length===3,'source layer count wrong');
    one(root,'[data-cs-layer="card"] input').click();assert(actions.findLast(a=>a.action==='show-layers')?.scene.shapes.find(s=>s.id==='card').hidden,'visibility did not update scene');
    change('[aria-label="X"]','75');assert(actions.findLast(a=>a.action==='edit-shape')?.scene.shapes.find(s=>s.id==='card').x===75,'inspector frame not applied');
    one(root,'[data-cs-asset]').click();assert(actions.findLast(a=>a.action==='place-asset')?.scene.shapes.length===4,'asset not added');return;
  }
  if(kind==='ColorPanel'){
    assert(one(root,'[data-ws-scene-color] [data-ely-color]').value==='#f4efe6','caller color missing');
    assert([...root.querySelectorAll('[data-cs-swatches] button,[data-cs-places] button')].every(b=>b.getBoundingClientRect().height===20),'compact canvas buttons stretched past 20px');change('[aria-label="Width"]','3');assert(one(root,'[data-cs-style-preview]').style.borderWidth==='3px','border preview wrong');
    one(root,'[data-cs-shadow-add]').click();assert(root.querySelectorAll('[data-cs-shadow]').length===2,'shadow addition failed');
    change('[aria-label="Size"]','24');assert(one(root,'[data-cs-type-preview]').style.fontSize==='24px','type preview wrong');return;
  }
  if(kind==='ConstraintsEditor'){
    change('[aria-label="Horizontal"]','end');const preview=one(root,'[data-cs-pins] [data-cs-layout-preview]');assert(preview.lastElementChild.getAttribute('x')==='136','pin math wrong');
    change('[aria-label="Gap"]','20');assert(actions.findLast(a=>a.action==='update-canvas-rules')?.rules.gap===20,'layout change not emitted');
    assert(one(root,'[data-cs-export-names]').textContent==='Card.pngCard@2x.pngCard.svg','export file names wrong');one(root,'[data-cs-export]').click();assert(actions.findLast(a=>a.action==='export-selection')?.files.length===3,'export request missing');return;
  }
  const stage=one(root,'[data-cs-stage]');assert(stage.getAttribute('viewBox')===(kind==='InfiniteCanvas'?'0 0 820 460':kind==='ToolPalette'?'0 0 560 360':kind==='Whiteboard'?'0 0 620 340':'0 0 620 300'),'source viewport geometry wrong');
  if(kind==='InfiniteCanvas'){
    assert(root.querySelectorAll('[data-cs-artboard]').length===2&&root.querySelectorAll('[data-cs-shape]').length===8,'source canvas content missing');one(root,'[data-cs-zoom-in]').click();assert(actions.findLast(a=>a.action==='change-viewport')?.view.zoom===.75,'source zoom stop wrong');one(root,'[data-cs-minimap]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert(Number.isFinite(actions.findLast(a=>a.action==='change-viewport')?.view.x),'minimap navigation invalid');return;
  }
  if(kind==='MindMap'){
    assert(root.querySelectorAll('[data-cs-shape]').length===9,'source topics missing');stage.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert(actions.findLast(a=>a.action==='select-shapes')?.ids[0]==='copy','mind navigation wrong');stage.dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true}));const editor=one(root,'[data-cs-text-editor]');editor.value='Caller topic';editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(actions.findLast(a=>a.action==='edit-canvas-text')?.scene.topics.some(t=>t.text==='Caller topic'),'topic creation or editing failed');return;
  }
  if(kind==='NodeEditor'){assert(root.querySelectorAll('[data-cs-shape]').length===4&&root.querySelectorAll('[data-cs-port]').length===7&&root.querySelectorAll('[data-cs-link]').length===2,'typed graph geometry missing');}
  if(kind==='FlowChart')assert(root.querySelectorAll('[data-cs-link]').length===5&&one(root,'[data-cs-shape="check"]').textContent==='Reviewed?','source flow graph missing');
  if(kind==='Whiteboard')assert(one(root,'[data-cs-shape="why"]').textContent==='Why do people leave in week two?','source note missing');
  const shape=one(root,'[data-cs-shape]'),id=shape.dataset.csShape;shape.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));const before=one(root,`[data-cs-shape="${id}"]`).getAttribute('transform');stage.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert(one(root,`[data-cs-shape="${id}"]`).getAttribute('transform')!==before,'shape nudge failed');stage.dispatchEvent(new KeyboardEvent('keydown',{key:'z',ctrlKey:true,bubbles:true}));assert(one(root,`[data-cs-shape="${id}"]`).getAttribute('transform')===before,'undo did not restore source geometry');
  if(kind==='ToolPalette'){one(root,'[data-cs-tool="rect"]').click();assert(actions.findLast(a=>a.action==='select-canvas-tool')?.tool==='rect','tool selection missing');assert(root.querySelectorAll('[data-cs-tool]').length===12,'tool palette incomplete');}
};
const canvas = async ({root,actions}) => {
  if(root.querySelector("[data-ws-canvas-scene]"))return await canvasScene({root,actions});
  const zoom = one(root, '[data-workspace-zoom="in"]'); zoom.click(); assert(one(root, 'output[data-workspace-zoom]').textContent === '110%', 'canvas zoom did not change');
  assert(Math.abs(new DOMMatrix(getComputedStyle(one(root,'[data-workspace-stage]')).transform).a - 1.1) < 0.001, 'visible canvas scale did not change');
  const shape = one(root, '[data-workspace-shape]'); shape.dispatchEvent(new KeyboardEvent('keydown', {key: 'Enter', bubbles: true}));
  const shapeId=shape.dataset.value,geometry=one(shape,'[data-ws-shape-geometry]'),originalWidth=geometry.getAttribute('width');
  assert(shape.getAttribute('role')==='button' && shape.getAttribute('aria-pressed')==='true' && actions.findLast(a=>a.action==='select-shape')?.shape===shapeId,'canvas selection lost shape');
  shape.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert(shape.getAttribute('transform').includes('translate('),'canvas keyboard move failed');
  shape.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true}));assert(Number(geometry.getAttribute('width'))>Number(originalWidth)&&actions.findLast(a=>a.action==='resize-shape')?.shape===shapeId,'canvas geometry resize failed');
  one(root,'[data-ws-canvas-undo]').click();assert(geometry.getAttribute('width')===originalWidth,'canvas undo did not restore geometry');
  const stage=one(root,'[data-workspace-stage]');
  const pointer=(type,x,y)=>stage.dispatchEvent(new PointerEvent(type,{button:0,clientX:x,clientY:y,bubbles:true,pointerId:9}));
  let rect=stage.getBoundingClientRect();
  one(root,'[data-ws-canvas-mode="pan"]').click();pointer('pointerdown',rect.left+20,rect.top+20);pointer('pointermove',rect.left+50,rect.top+40);pointer('pointerup',rect.left+50,rect.top+40);
  const matrix=new DOMMatrix(getComputedStyle(stage).transform);assert(matrix.e===30 && matrix.f===20,'visible pan failed');
  const minimap=root.querySelector('[data-ws-canvas-minimap]');if(minimap){const viewport=one(minimap,'[data-ws-canvas-minimap-viewport]');assert(viewport.getAttribute('x')!=='18','minimap did not follow pan');minimap.click();assert(viewport.getAttribute('x')==='18'&&actions.findLast(a=>a.action==='navigate-canvas-minimap')?.x===0,'minimap did not reset the viewport');}
  if(root.dataset.elyKind==='NodeEditor'){one(root,'[data-ws-canvas-mode="connect"]').click();const source=one(root,'[data-value="node-source"] [data-ws-port="output"]'),target=one(root,'[data-value="node-target"] [data-ws-port="input"]');source.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));target.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true}));const connection=actions.findLast(a=>a.action==='connect-shapes');assert(connection?.from==='node-source:output'&&connection?.to==='node-target:input','node port connection payload is wrong');}
  if(root.dataset.elyKind==='Whiteboard'){
    const matrix=stage.getScreenCTM(),start=new DOMPoint(100,100).matrixTransform(matrix),end=new DOMPoint(180,180).matrixTransform(matrix);
    one(root,'[data-ws-canvas-mode="draw"]').click();pointer('pointerdown',start.x,start.y);pointer('pointermove',end.x,end.y);pointer('pointerup',end.x,end.y);
    const stroke=one(root,'[data-ws-strokes] polyline'),entry=actions.findLast(a=>a.action==='draw-stroke');
    assert(stroke.getAttribute('points').split(' ').length===2 && entry?.points.length===2 && entry.points[0].x!==entry.points[1].x && entry.points.every(point=>point.x>0&&point.x<800&&point.y>0&&point.y<420),'visible freehand geometry or payload absent');
  }
};
const request = async ({root, actions}) => {
  if(root.querySelector("[data-ws-devtools-source]"))return devtoolsSource({root,actions});
  if(root.dataset.elyKind==='ShareDialog'){
    const open=one(root,'[data-ws-share-open]'),dialog=one(root,'[data-ws-share-dialog]');open.click();assert(dialog.open,'share dialog did not open');
    const pending=one(dialog,'[data-ws-invite-chip] input'),before=actions.length;pending.value='invalid';one(dialog,'[data-ws-invite-form] button[type="submit"]').click();assert(actions.length===before,'invalid invite emitted a host action');pending.value='pending@example.test';
    const email=one(dialog,'input[name="invitee"]');email.value='extra@example.test';one(dialog,'[data-ws-invite-add]').click();const chips=[...dialog.querySelectorAll('[data-ws-invite-chip]')];assert(chips.length===2&&one(chips[1],'input').value==='extra@example.test','email chip not added');one(chips[1],'[data-ws-invite-remove]').click();assert(dialog.querySelectorAll('[data-ws-invite-chip]').length===1,'email chip not removed');
    assert(one(dialog,'li[data-ws-share-member]').textContent.includes('Caller owner')&&one(dialog,'[data-ws-invite-chip] input').value==='pending@example.test','share caller data missing');const invite=one(dialog,'input[name="invitee"]');invite.value='new@example.test';const inviteData=submitData(dialog,actions,'invitee','new@example.test');assert(inviteData.get('inviteRole')==='edit'&&inviteData.getAll('invitee').includes('pending@example.test'),'share invite role or pending email missing');const member=one(dialog,'select[data-ws-member-role][data-member="member-2"]');member.value='view';member.dispatchEvent(new Event('change',{bubbles:true}));assert(actions.findLast(a=>a.action==='set-share-role')?.member==='member-2'&&actions.findLast(a=>a.action==='set-share-role')?.role==='view','share role did not emit');const link=one(dialog,'select[data-ws-link-access]');link.value='comment';link.dispatchEvent(new Event('change',{bubbles:true}));assert(actions.findLast(a=>a.action==='set-link-access')?.role==='comment','link access did not emit');one(dialog,'[data-ws-share-remove]').click();assert(actions.findLast(a=>a.action==='remove-share-member')?.member==='member-2','member removal did not emit');dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!dialog.open&&document.activeElement===open,'share dialog did not dismiss with Escape');open.click();dialog.dispatchEvent(new MouseEvent('click',{bubbles:true}));assert(!dialog.open,'share dialog did not dismiss from its backdrop');return;
  }
  const method=one(root,'select[name="method"]');
  assert(method.value==='POST' && [...method.options].some(option=>option.value==='GET'),'caller method not selected');
  method.value='GET';method.dispatchEvent(new Event('change',{bubbles:true}));
  const endpoint = one(root, 'input[name="endpoint"]'); endpoint.value = '/caller/changed';
  const body=one(root,'textarea[name="body"]');body.value='{"caller":"changed"}';
  const fd=submitData(root,actions,'endpoint','/caller/changed');
  assert(fd.get('method')==='GET' && fd.get('body')==='{"caller":"changed"}','request payload is stale or incomplete');
};
const fileInput = async ({root,actions}) => {
  const input=one(root,'input[type="file"]');assert(input.multiple&&input.name==='files','file payload contract missing');
  const transfer=new DataTransfer();transfer.items.add(new File(['one'],'first.txt',{type:'text/plain'}));transfer.items.add(new File(['two'],'second.txt',{type:'text/plain'}));
  one(root,'[data-ws-file-drop]').dispatchEvent(new DragEvent('drop',{bubbles:true,cancelable:true,dataTransfer:transfer}));assert(input.files.length===2&&root.querySelectorAll('[data-ws-dropped-files] li').length===2,'drop did not populate file draft');
  one(root,'[data-ws-drop-remove="first.txt"]').click();assert(input.files.length===1&&input.files[0].name==='second.txt','drop removal lost native FileList');one(root,'button[type="submit"]').click();const sent=actions.findLast(a=>a.action==='upload');assert(sent.formData.getAll('files').length===1&&sent.formData.get('files').name==='second.txt','upload did not carry actual File');
};
const submitData = (root, actions, name, expected) => {
  const forms=root.matches('form')?[root]:[...root.querySelectorAll('form')];
  const form=forms.find(form=>form.elements.namedItem(name));assert(form,'missing form field '+name);
  const count=actions.length;
  one(form,'button[type="submit"]').click();
  const entry=actions.slice(count).findLast(a=>a.action===form.dataset.elySubmit);
  assert(entry?.formData instanceof FormData && entry.formData.get(name)===expected,'wrong submitted '+name);
  return entry.formData;
};
const hostButton = (root,actions,name,value) => {
  const button=[...root.querySelectorAll('[data-ely-action="'+name+'"]')].find(button=>button.value===value);assert(button,'missing '+name+' for '+value);button.click();
  assert(actions.findLast(a=>a.action===name)?.value===value,'wrong '+name+' payload');
};
const checkComment = (root,actions) => {
  const comment=one(root,'[data-ws-comment]');
  assert(comment.textContent.includes('Caller reviewer') && comment.textContent.includes('Explain caller change'),'caller comment metadata missing');
  hostButton(comment,actions,'resolve-comment','comment-8');
  const resolved=actions.findLast(a=>a.action==='resolve-comment');
  assert(resolved.formData.get('comment')==='comment-8' && one(comment,'[data-ws-comment-status]').textContent==='Open','resolve lost payload or invented success');
  one(comment,'input[name="reply"]').value='Caller reply';
  assert(submitData(comment,actions,'reply','Caller reply').get('comment')==='comment-8','reply lost parent comment');
};
const checkThread = (root,actions) => {
  const thread=[...root.querySelectorAll('[data-ws-thread]')].find(node=>!node.hidden&&node.dataset.resolved!=='true');
  assert(thread,'missing open thread');
  const id=thread.dataset.wsThread;
  hostButton(thread,actions,'resolve-comment',id);
  const resolve=actions.findLast(entry=>entry.action==='resolve-comment');
  assert(resolve.formData.get('comment')===id&&resolve.formData.get('resolved')==='true'&&thread.dataset.resolved==='false','resolve lost identity or claimed persisted state');
  const reply=one(thread,'input[name="reply"]');
  reply.value='   ';reply.dispatchEvent(new Event('input',{bubbles:true}));assert(one(thread,'[data-ws-thread-reply] button[type="submit"]').disabled,'blank reply remained enabled');
  reply.value='Caller reply';reply.dispatchEvent(new Event('input',{bubbles:true}));
  assert(submitData(thread,actions,'reply','Caller reply').get('comment')===id,'reply lost thread identity');
  const picker=one(thread,'[data-ws-reaction-picker]');picker.open=true;
  one(picker,'[data-ws-pick-reaction="🎉"]').click();
  const reaction=one(thread,'[data-ws-reaction="🎉"]');
  assert(reaction.getAttribute('aria-pressed')==='true'&&one(reaction,'[data-ws-reaction-count]').textContent==='1'&&!picker.open&&actions.findLast(a=>a.action==='toggle-reaction')?.thread===id,'reaction add failed');
  reaction.click();assert(!thread.querySelector('[data-ws-reaction="🎉"]')&&actions.findLast(a=>a.action==='toggle-reaction')?.count===0,'reaction removal failed');
};
const semantic = async ({root,actions,twin}) => {
  const kind=root.dataset.elyKind,variant=root.dataset.elyComponent.split('/')[1];
  switch(kind){
    case 'CompletionMenu':{
      const filter=one(root,'input[data-ws-candidate-filter]'),rows=[...root.querySelectorAll('[data-ws-candidate]')];assert(rows.length===2,'caller completion candidates absent');
      filter.value='readCaller';filter.dispatchEvent(new Event('input',{bubbles:true}));assert(rows[0].hidden&&!rows[1].hidden,'completion filtering failed');
      filter.value='';filter.dispatchEvent(new Event('input',{bubbles:true}));
      const list=one(root,'[data-ws-completion-list]');list.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowDown',bubbles:true}));assert(rows[1].getAttribute('aria-selected')==='true'&&list.getAttribute('aria-activedescendant')===rows[1].id,'completion keyboard selection failed');
      const source=one(root,'textarea[data-ws-completion-source]');source.setSelectionRange(0,3);one(root,'[data-ws-complete="complete-print"]').click();
      const a=actions.findLast(a=>a.action==='select-completion');assert(source.value==='printCaller()' && a?.source===source.value && a?.candidate==='complete-print','completion insertion/payload failed');break;
    }
    case 'CodeActionMenu':
      hostButton(root,actions,'apply-code-action','action-extract');{const fd=actions.findLast(a=>a.action==='apply-code-action').formData;assert(fd.get('path')==='src/worker.go'&&fd.get('source')==='callerSource'&&fd.get('command')==='refactor.extract','code action payload incomplete');}break;
    case 'ProblemsPanel':
      assert(root.textContent.includes('warning')&&root.textContent.includes('Caller value is unused'),'diagnostic missing');hostButton(root,actions,'open-location','diag-1');{const fd=actions.findLast(a=>a.action==='open-location').formData;assert(fd.get('file')==='src/worker.go'&&fd.get('line')==='27'&&fd.get('column')==='8','diagnostic location incomplete');}break;
    case 'WhitespaceRenderer':
      assert(one(root,'pre[data-ws-whitespace]').textContent==='a·b→c↵\n'&&!root.querySelector('textarea,[contenteditable="true"]'),'whitespace markers or readonly semantics missing');break;
    case 'DebugConsole':{
      const entries=[...root.querySelectorAll('[data-ws-console-entry]')];assert(entries.length===3&&entries.some(entry=>entry.dataset.severity==='error'),'caller console history or severity missing');
      one(root,'[data-ws-console-level="error"]').click();assert(!entries.find(entry=>entry.dataset.severity==='error').hidden&&entries.find(entry=>entry.dataset.severity==='output').hidden,'console severity filter failed');
      const filter=one(root,'[data-ws-console-filter]');filter.value='expired';filter.dispatchEvent(new Event('input',{bubbles:true}));assert(!entries.find(entry=>entry.dataset.severity==='error').hidden,'console text filter hid its match');filter.value='';filter.dispatchEvent(new Event('input',{bubbles:true}));one(root,'[data-ws-console-level="all"]').click();
      const expression=one(root,'input[name="expression"]');expression.value='request.count';assert(submitData(root,actions,'expression','request.count').get('session')==='session-12','console lost session');assert(root.querySelector('[data-ws-console-history]').textContent.includes('request.count')&&one(root,'[data-ws-console-status]').textContent==='Sent to host.','console did not retain typed host command');expression.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowUp',bubbles:true}));assert(expression.value==='request.count','console history did not recall command');assert(one(root,'[data-ws-console-output]').textContent==='Caller debugger output','console invented result');break;
    }
    case 'SettingsEditor':{
      const size=one(root,'input[name="fontSize"]'),files=one(root,'[data-ws-settings-group="1"]');assert(!one(root,'[data-ws-settings-section="0"]').hidden&&one(root,'[data-ws-settings-section="1"]').hidden,'settings group initial state missing');files.click();assert(!one(root,'[data-ws-settings-section="1"]').hidden&&one(root,'[data-ws-settings-section="0"]').hidden,'settings group selection failed');const filter=one(root,'[data-ws-settings-filter]');filter.value='tab size';filter.dispatchEvent(new Event('input',{bubbles:true}));assert(!one(root,'[data-ws-setting-key="tabSize"]').hidden,'settings search hid matching setting');filter.value='';filter.dispatchEvent(new Event('input',{bubbles:true}));one(root,'[data-ws-settings-group="0"]').click();size.value='2';const count=actions.length;one(root,'button[type="submit"]').click();assert(actions.length===count&&!size.validity.valid,'setting bounds not enforced');size.value='18';size.dispatchEvent(new Event('input',{bubbles:true}));assert(one(root,'[data-ws-settings-status]').textContent==='Modified fontSize','setting local edit state missing');assert(submitData(root,actions,'fontSize','18').get('language')==='go','setting payload incomplete');break;
    }
    case 'WelcomePage':{
      const project=one(root,'[data-ws-project][value="~/Caller/workspace"]');assert(project.textContent.includes('main')&&project.textContent.includes('now')&&one(root,'nav[aria-labelledby$="-welcome-help-heading"] a').getAttribute('href')==='#caller-docs','caller welcome values missing');hostButton(root,actions,'open-project','~/Caller/workspace');hostButton(root,actions,'run-task','task-check');const show=one(root,'[data-ws-welcome-show]');show.checked=false;show.dispatchEvent(new Event('change',{bubbles:true}));assert(root.dataset.wsWelcomeShow==='false'&&one(root,'[data-ws-welcome-status]').textContent.includes('hidden'),'welcome startup preference did not update locally');one(root,'[data-ely-action="new-file"]').click();action(actions,'new-file');break;
    }
    case 'CursorPosition':{
      const editor=one(root,'[data-workspace-rich]');assert(editor.textContent==='first\nsecond','cursor caller content missing');const range=document.createRange();range.setStart(editor.firstChild,8);range.collapse(true);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));assert(one(root,'[data-workspace-cursor]').textContent==='Ln 2, Col 3','cursor selection was not tracked');await code({root,actions,twin});break;
    }
    case 'PullRequestCard':
      assert(root.textContent.includes('#42 Caller review')&&root.textContent.includes('feature/worker')&&root.textContent.includes('Reviewer one')&&one(root,'[data-ws-pr-checks]').textContent.includes('caller tests'),'PR metadata incomplete');hostButton(root,actions,'open-pull-request','pr-42');hostButton(root,actions,'request-review','pr-42');assert(actions.findLast(a=>a.action==='request-review').formData.get('pullRequest')==='pr-42'&&one(root,'[data-ws-pr-state]').textContent.includes('Open'),'PR payload missing or fictional status');if(variant==='ReviewComment')checkComment(root,actions);break;
    case 'Block types':{
      one(root,'[data-ws-insert-block="h2"]').click();assert(one(root,'[data-workspace-rich] h2').textContent==='Caller inserted heading','block was not inserted');const editor=one(root,'[data-workspace-rich]');submitData(root,actions,editor.dataset.name,'Caller body<h2>Caller inserted heading</h2>');checkRequiredEditor(root,actions,editor);break;
    }
    case 'Footnote':
      if(variant==='Footnote'){const link=one(root,'[data-ws-footnote-link]');assert(link.hash==='#'+root.id+'-note-0'&&one(root,'[id="'+root.id+'-note-0"]').textContent.includes('small step')&&root.querySelectorAll('[data-ws-footnote-definitions] li').length===4,'footnote target wrong');link.click();await waitFor(()=>location.hash===link.hash);}
      else{const details=one(root,'details[data-ws-glossary]');one(details,'summary').click();assert(details.open&&one(details,'p').textContent==='Caller footnote definition','glossary definition disclosure failed');}break;
    case 'FocusMode':
      const focusContent=one(root,'[data-ws-focus-content]');one(root,'[data-ws-focus-toggle]').click();assert(one(root,'[data-ws-focus-chrome]').hidden&&one(root,'[data-ws-focus-toggle]').getAttribute('aria-pressed')==='true'&&document.activeElement===focusContent,'focus failed');const editor=one(root,'[data-workspace-rich]'),range=document.createRange();range.selectNodeContents(editor);const selection=document.getSelection();selection.removeAllRanges();selection.addRange(range);document.dispatchEvent(new Event('selectionchange'));one(root,'[data-ws-format="strong"]').click();assert(one(editor,'strong').textContent.includes('Caller focused paragraph'),'focus rich formatting failed');focusContent.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!one(root,'[data-ws-focus-chrome]').hidden&&one(root,'[data-ws-focus-toggle]').getAttribute('aria-pressed')==='false','focus did not exit with Escape');break;
    case 'PrintPreview':{
      const pages=[...root.querySelectorAll('[data-ws-print-page]')];assert(pages.length===2&&pages[1].textContent.includes('Caller page two')&&!root.querySelector('[contenteditable="true"]'),'readonly print pages missing');one(root,'[data-ws-print-thumb="1"]').click();assert(!pages[1].hidden&&pages[0].hidden,'print thumbnail selection failed');const copies=one(root,'input[name="copies"]');assert(copies.value==='2','print copies setting missing');const fd=submitData(root,actions,'document','doc-21');assert(fd.get('paper')==='A4'&&fd.get('orientation')==='portrait'&&fd.get('copies')==='2'&&fd.getAll('page').join('|')==='Caller page one|Caller page two','print payload incomplete');break;
    }
    case 'PageTree':
      {const tree=one(root,'nav[aria-label="Page tree"]');const toggle=one(tree,'[data-ws-page-tree-pages] [data-workspace-tree]'),branch=one(toggle.parentElement,':scope > ul');toggle.click();assert(branch.hidden&&toggle.getAttribute('aria-expanded')==='false','page collapse failed');toggle.click();assert(!branch.hidden&&toggle.getAttribute('aria-expanded')==='true','page expansion failed');assert(actions.findLast(a=>a.action==='navigate-workspace-tree')?.value==='lift','page navigation lost caller identity');const before=actions.length;toggle.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));toggle.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}));assert(!actions.slice(before).some(a=>['open-file','navigate-file-path'].includes(a.action)),'file handlers intercepted document tree');assert(tree.textContent.includes('Lift')&&tree.textContent.includes('Decisions')&&tree.textContent.includes('Research')&&tree.querySelectorAll('ul ul').length>=2,'recursive caller pages absent');one(root,'[data-ws-favorite-down]').click();assert(one(root,'[data-ws-favorite]').dataset.wsFavorite==='lift/design'&&actions.findLast(a=>a.action==='reorder-favorites')?.order.join('|')==='lift/design|lift','favorite reorder failed');one(root,'[data-ws-favorite-unpin]').click();assert(root.querySelectorAll('[data-ws-favorite]').length===1&&actions.findLast(a=>a.action==='unpin-favorite')?.value==='lift/design','favorite unpin failed');}break;
    case 'PageCover':{
      const status=one(root,'[data-ws-page-property][name="Status"]');status.value='Review';status.dispatchEvent(new Event('change',{bubbles:true}));assert(actions.findLast(a=>a.action==='update-page-property')?.value==='Review','property edit payload failed');const published=one(root,'[data-ws-page-property][name="Published"]');published.click();assert(actions.findLast(a=>a.action==='update-page-property')?.value===false,'property checkbox payload failed');
      const image=one(root,'img[data-ws-cover-image]');assert(image.getAttribute('src')==='/assets/sample.svg'&&image.alt==='Project cover'&&one(root,'[data-ws-page-icon]').textContent==='🚀'&&one(root,'[data-ws-page-cover-body] h3').textContent==='Lift'&&root.textContent.includes('Grace Lin'),'cover data missing');await waitFor(()=>image.complete);assert(image.naturalWidth>0,'cover image failed to display');break;
    }
    case 'Backlinks':
      assert(one(root,'nav[aria-label="Backlinks"] a').getAttribute('href')==='#caller-source'&&one(root,'[data-ws-backlink]').textContent.includes('explains the caller change'),'backlink source context missing');{const node=root.querySelector('svg g[data-workspace-select]');if(node){node.dispatchEvent(new MouseEvent('click',{bubbles:true}));assert(node.getAttribute('aria-pressed')==='true','backlink graph selection failed');}}break;
    case 'TemplatePicker':
      assert(one(root,'[data-ws-template-preview-name]').textContent==='Project brief','template initial preview missing');const category=one(root,'[data-ws-template-category="planning"]');category.click();assert(one(root,'[data-ws-template="tpl-brief"]').hidden&&!one(root,'[data-ws-template="tpl-plan"]').hidden,'template category filter failed');const plan=one(root,'[data-ws-template="tpl-plan"]');plan.click();assert(one(root,'[data-ws-template-preview-content]').textContent.includes('Launch plan'),'template preview selection failed');hostButton(plan,actions,'select-template','tpl-plan');assert(actions.findLast(a=>a.action==='select-template').formData.get('content').includes('Launch plan'),'template content payload missing');break;
    case 'PresenceAvatars': {
      const presence=one(root,'[data-ws-presence]');assert(root.querySelectorAll('[data-ws-follow]:not([hidden])').length===4&&one(root,'[data-ws-peer-overflow]').textContent==='+2'&&one(root,'mark').textContent==='a full lift','presence source geometry missing');
      hostButton(root,actions,'follow-user','ada');assert(presence.dataset.following==='ada'&&!one(root,'[data-ws-follow-banner]').hidden,'follow state missing');
      one(root,'[data-ws-follow][value="ada"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(presence.dataset.following===''&&one(root,'[data-ws-follow-banner]').hidden&&actions.findLast(a=>a.action==='stop-following'),'Escape did not stop following');break;
    }
    case 'CommentBubble': {
      const marker=one(root,'[data-ws-comment-marker]'),bubble=one(root,'[data-ws-comment-bubble]');assert(bubble.hidden,'bubble must begin closed');marker.click();assert(!bubble.hidden&&marker.getAttribute('aria-expanded')==='true','bubble did not open');checkThread(root,actions);assert(!bubble.hidden&&marker.getAttribute('aria-expanded')==='true','reaction removal incorrectly dismissed bubble');marker.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(bubble.hidden&&document.activeElement===marker,'bubble Escape did not restore focus');break;
    }
    case 'CommentSidebar': {
      checkThread(root,actions);one(root,'[data-ws-comment-filter="resolved"]').click();assert(!one(root,'[data-ws-thread="title"]').hidden&&one(root,'[data-ws-thread="gamma"]').hidden&&!one(root,'[data-ws-thread="title"]').querySelector('[data-ws-thread-reply]'),'resolved filter failed');
      one(root,'[data-ws-comment-filter="open"]').click();const weight=one(root,'[data-ws-thread="weight"]');weight.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(weight.getAttribute('aria-current')==='true'&&!one(weight,'[data-ws-thread-reply]').hidden&&one(root,'[data-ws-thread="gamma"] [data-ws-thread-reply]').hidden&&actions.findLast(a=>a.action==='select-comment-thread')?.thread==='weight','thread keyboard selection failed');break;
    }
    case 'Annotation': {
      const annotations=[...root.querySelectorAll('[data-ws-annotation]')];assert(annotations.length===3&&annotations[0].title.includes('The one idea to remember.'),'annotation note missing');annotations[1].click();assert(annotations[1].getAttribute('aria-pressed')==='true'&&annotations[0].getAttribute('aria-pressed')==='false'&&actions.findLast(a=>a.action==='select-annotation')?.annotation==='loud','annotation selection failed');break;
    }
    case 'SuggestionMode': {
      assert(one(root,'[data-ws-change-preview]').textContent.includes('lift')&&root.querySelectorAll('[data-ws-suggestion-status]').length===3,'suggestion preview missing');
      for(const name of ['accept-suggestion','reject-suggestion']){hostButton(root,actions,name,'replace-lift');const fd=actions.findLast(a=>a.action===name).formData;assert(fd.get('original')==='lift'&&fd.get('replacement')==='tint','suggestion payload incomplete');}
      assert(one(root,'[data-ws-suggestion-status]').textContent==='Pending','suggestion invented provider result');
      one(root,'[data-ws-suggestion-mode="viewing"]').click();assert(one(root,'[data-ws-suggestion-draft]').readOnly&&[...root.querySelectorAll('[data-ws-decisions]')].every(node=>node.hidden),'viewing mode remains editable');
      one(root,'[data-ws-suggestion-mode="editing"]').click();assert(!one(root,'[data-ws-suggestion-draft]').readOnly&&one(root,'[data-ws-suggestion-review]').hidden,'editing mode failed');
      one(root,'[data-ws-suggestion-mode="suggesting"]').click();const draft=one(root,'[data-ws-suggestion-draft]');draft.value='Caller revision';draft.dispatchEvent(new Event('input',{bubbles:true}));assert(actions.findLast(a=>a.action==='edit-suggestion-draft')?.value==='Caller revision','draft payload missing');break;
    }
    case 'ActivityLog':
      {const entries=[...root.querySelectorAll('[data-ws-activity-entry]')];assert(entries.length===4&&entries[0].querySelector('time').dateTime==='2026-10-11T10:40:00+09:00'&&entries[0].querySelector('a').getAttribute('href')==='#gamma-space'&&entries[0].textContent.includes('Alan Reyes')&&entries[3].textContent.includes('Yesterday')&&entries.every(entry=>entry.querySelector('[data-ws-activity-avatar],img')),'caller timeline semantics missing');}break;
    default:throw new Error('Missing semantic test for '+kind);
  }
};
const domain = async ({root,actions}) => {
  if(root.querySelector("[data-ws-devtools-source]"))return await devtoolsSource({root,actions});
  if(root.querySelector("[data-ws-canvas-scene]"))return await canvasScene({root,actions});
  const kind=root.dataset.elyKind, variant=root.dataset.elyComponent.split('/')[1];
  switch(kind) {
    case 'RenameInline': {
      const input=one(root,'input[data-ws-rename-value]'),start=one(root,'[data-ws-rename-start]');assert(one(root,'fieldset').hidden&&start.textContent==='brief.md','rename did not start as text');start.click();input.value='changed.md';one(root,'[data-ws-rename-cancel]').click();assert(input.value==='brief.md'&&one(root,'fieldset').hidden,'cancel did not restore name');start.click();input.value='escape.md';input.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(input.value==='brief.md'&&document.activeElement===start,'Escape did not discard name');start.click();input.value='revised.md';assert(submitData(root,actions,'name','revised.md').get('path')==='docs/brief.md','rename lost original path');assert(start.textContent==='revised.md'&&one(root,'[data-ws-status]').textContent==='Rename requested','rename did not show provisional draft');break;
    }
    case 'FileSearch': {const field=one(root,'[data-ws-file-query]'),note=one(root,'[data-ws-file-search-note]');assert(note.textContent==='Type a name to search.'&&!root.querySelector('[data-ws-search-include]'),'file search inherited editor controls');field.value='Brief';field.dispatchEvent(new Event('input',{bubbles:true}));assert(actions.findLast(a=>a.action==='search-files')?.query==='Brief'&&note.textContent==='Searching…','host search request missing');assert(root.querySelectorAll('[data-ws-file-result]').length===0,'search invented remote results');break;}
    case 'SearchPanel': {
      const input=one(root,'input[data-ws-search]'), rows=[...root.querySelectorAll('[data-ws-search-row]')];
      assert(rows.length===2,'caller search rows missing'); input.value='worker'; input.dispatchEvent(new Event('input',{bubbles:true}));
      assert(!rows[0].hidden && rows[1].hidden && one(root,'[data-ws-search-count]').textContent==='1 results','path filter failed');
      input.value='no-such-file'; input.dispatchEvent(new Event('input',{bubbles:true})); assert(rows.every(r=>r.hidden),'empty filter failed'); break;
    }
    case 'FilePreview': {
      const previews=[...root.querySelectorAll('.ely-workspace__previews [data-ws-preview]')];assert(previews.length===3&&one(previews[0],'img').getAttribute('src')==='/assets/ely/workspace-atrium.jpg'&&one(previews[1],'pre').textContent.startsWith('# Atrium')&&previews[2].querySelector('[data-ws-preview-icon]'),'picture/text/icon previews missing');assert(!root.querySelector('[contenteditable="true"],textarea'),'preview is editable');const tile=one(root,'[data-ws-file-grid-item][data-name="Brief.md"]');tile.click();tile.dispatchEvent(new KeyboardEvent('keydown',{key:' ',bubbles:true}));const dialog=one(root,'[data-ws-file-preview-dialog]');assert(dialog.open&&one(dialog,'pre').textContent.startsWith('# Atrium'),'preview alias quick look failed');dialog.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));assert(!dialog.open,'preview alias Escape failed');break;
    }
    case 'HexViewer': {const rows=[...root.querySelectorAll('[data-ws-hex-row]')],bytes=[...root.querySelectorAll('[data-ws-hex-byte]')];assert(bytes.every(b=>b.getBoundingClientRect().height<=20),'hex byte buttons stretched source rows');assert(rows.length===32&&bytes.length===512&&rows[0].cells[0].textContent==='00000000','hex rows/offset wrong');assert(bytes.slice(0,4).map(b=>b.textContent).join(' ')==='FF D8 FF E0','source JPEG bytes missing');const text=one(root,'[data-ws-hex-mirror="1"]');text.click();assert(bytes[1].getAttribute('aria-pressed')==='true'&&text.getAttribute('aria-pressed')==='true'&&one(root,'[data-ws-hex-reading]').textContent.includes('i8 -40')&&actions.findLast(a=>a.action==='select-memory-byte')?.index===1,'hex text selection failed');assert(!root.querySelector('[contenteditable="true"],textarea'),'hex must be read-only');break;}
    case 'MemoryViewer': {
      if(variant==='Disassembly'){const instruction=one(root,'[data-ws-instruction][aria-current="true"]');assert(instruction.textContent.includes('push')&&instruction.textContent.includes('fn caller()'),'disassembly instruction missing');hostButton(root,actions,'toggle-breakpoint','0x1000');break;}
      const bytes=[...root.querySelectorAll('[data-ws-hex-byte]')]; assert(bytes.length===128 && root.querySelectorAll('[data-ws-hex-row]').length===8 && one(root,'[data-ws-hex-row] th').textContent==='00007ffd5a201000','memory row missing');
      bytes[1].click(); assert(bytes[1].getAttribute('aria-pressed')==='true' && one(root,'[data-ws-hex-reading]').textContent.includes('65') && actions.findLast(a=>a.action==='select-memory-byte')?.index===1,'memory selection failed'); assert(!root.querySelector('[contenteditable="true"],textarea'),'memory must be read-only'); break;
    }
    case 'FileOperationProgress': {const rows=[...root.querySelectorAll('[data-ws-operation]')],p=one(rows[0],'progress');assert(rows.length===3&&p.value===46000000&&p.max===184000000&&rows[0].textContent.includes('3s left')&&rows[1].textContent.includes('Backup is full.'),'operation source state wrong');hostButton(root,actions,'pause-operation','copy');assert(rows[0].dataset.state==='moving'&&!rows[1].querySelector('button,progress')&&!rows[2].querySelector('button,progress'),'operation invented host state/actions');break;}
    case 'TransferQueue': {assert(one(root,'[data-ws-transfer-tally]').textContent==='1 moving · 2 waiting','queue tally wrong');hostButton(root,actions,'pause-transfer','walkthrough');hostButton(root,actions,'resume-transfer','moodboard');hostButton(root,actions,'retry-transfer','survey');hostButton(root,actions,'cancel-transfer','budget');assert(one(root,'[data-ws-transfer="walkthrough"]').dataset.state==='moving'&&!one(root,'[data-ws-transfer="brief"]').querySelector('button,progress'),'queue state changed without host');break;}
    case 'DownloadManager': {assert(root.querySelectorAll('[data-ws-transfers-active]>li').length===2&&root.querySelectorAll('[data-ws-transfers-done]>li').length===2,'downloads were not partitioned');hostButton(root,actions,'open-download','atrium');hostButton(root,actions,'show-download','notes');one(root,'[data-ws-clear-downloads]').click();assert(actions.findLast(a=>a.action==='clear-downloads')?.ids.join('|')==='atrium|notes'&&root.querySelectorAll('[data-ws-transfer]').length===4,'clear must ask host for completed IDs only');break;}
    case 'StorageUsage': {const bar=one(root,'[data-ws-storage-bar]');assert(bar.getAttribute('aria-valuenow')==='337000000000'&&bar.getAttribute('aria-valuemax')==='512000000000'&&bar.getAttribute('aria-valuetext').includes('175 GB free'),'storage totals wrong');assert(bar.children.length===5&&one(root,'[data-ws-file-size]').textContent==='38 GB'&&Math.abs(Number(one(root,'[data-ws-storage-free]').style.flexGrow)-175/512)<1e-6,'storage parts/free track wrong');break;}
    case 'DebugToolbar': {for(const a of ['debug-run','debug-pause','debug-step-over','debug-step-into','debug-step-out','debug-restart','debug-stop'])hostButton(root,actions,a,'session-12');assert(one(root,'[data-ws-debug-request]').textContent==='Requested Stop.'&&one(root,'[data-ws-debug-state]').textContent==='Paused','debug toolbar local request or provider status wrong');break;}
    case 'BreakpointList': {
      const box=one(root,'input[data-ws-breakpoint]'); box.click(); const a=actions.findLast(a=>a.action==='toggle-breakpoint');
      assert(!box.checked && a?.enabled===false && a?.file==='src/worker.go' && a?.line===27 && a?.breakpoint==='bp-4','breakpoint payload wrong');const filter=one(root,'[data-ws-breakpoint-filter]');filter.value='api';filter.dispatchEvent(new Event('input',{bubbles:true}));assert(one(root,'[data-ws-breakpoint-row]').hidden,'breakpoint filter failed');const libraries=one(root,'[data-ws-library-frames]');libraries.checked=true;libraries.dispatchEvent(new Event('change',{bubbles:true}));assert(!one(root,'[data-ws-stack-frame][data-library="true"]').hidden,'library frame toggle failed');
      const frame=one(root,'ol[aria-label="Call stack"] button'); frame.click(); assert(frame.getAttribute('aria-pressed')==='true' && frame.textContent.includes('HandleRequest')&&actions.findLast(a=>a.action==='select-stack-frame')?.frame==='frame-2','stack selection failed');hostButton(root,actions,'remove-breakpoint','bp-4'); break;
    }
    case 'VariablesPanel': {
      const scopes=[...root.querySelectorAll('[data-ws-variable-scope]')]; const branch=one(root,'[data-ws-variable-branch]'); assert(scopes.length===2 && root.querySelectorAll('[data-ws-watch]').length===2 && root.textContent.includes('attempts') && one(root,'[data-ws-variable][data-changed="true"] code').textContent==='4','scoped variable tree missing');
      one(branch,'summary').click(); assert(!branch.open,'variable disclosure failed'); const watch=one(root,'[data-ws-watch-remove][value="request.token"]');watch.click();assert(!root.querySelector('[data-ws-watch][data-watch="request.token"]')&&actions.findLast(a=>a.action==='remove-watch')?.expression==='request.token','watch removal failed');
      if(variant==='ConsoleREPL'){const form=one(root,'form[data-ely-submit="evaluate-watch"]');one(form,'input[name="expression"]').value='request.attempts';submitData(form,actions,'expression','request.attempts');} break;
    }
    case 'PerformanceProfiler': {
      const frames=[...root.querySelectorAll('[data-ws-flame-frame]')],spans=[...root.querySelectorAll('[data-ws-timeline-span]')];assert(frames.length===4&&spans.length===3&&frames.every(frame=>frame.style.getPropertyValue('--ws-width'))&&spans.every(span=>span.style.getPropertyValue('--ws-start'))&&root.textContent.includes('ParseRequest'),'profile frame or timeline geometry missing');frames[1].click();assert(frames[1].getAttribute('aria-pressed')==='true'&&actions.findLast(a=>a.action==='select-profile-frame')?.frame==='parse','profile frame selection failed');spans[1].click();assert(spans[1].getAttribute('aria-pressed')==='true'&&actions.findLast(a=>a.action==='select-timeline-span')?.span==='span-render','timeline selection failed');break;
    }
    case 'NetworkInspector': {
      const rows=[...root.querySelectorAll('[data-ws-network-row]')];assert(rows.length===3&&rows[0].textContent.includes('notes')&&rows[0].textContent.includes('202')&&rows[0].textContent.includes('18 ms')&&[...root.querySelectorAll('[data-ws-waterfall]')].every(bar=>bar.style.getPropertyValue('--ws-width')),'network metadata or waterfall geometry missing');const filter=one(root,'[data-ws-network-filter]');filter.value='assets';filter.dispatchEvent(new Event('input',{bubbles:true}));assert(rows[0].hidden&&!rows[1].hidden&&rows[2].hidden,'network filter failed');rows[1].querySelector('[data-ws-network-select]').click();assert(rows[1].getAttribute('aria-selected')==='true'&&!one(root,'[data-ws-network-detail-panel="1"]').hidden&&actions.findLast(a=>a.action==='select-network-request')?.url==='/caller/assets.js','network selection failed');break;
    }
    case 'ProcessList': {
      const cells=one(root,'tbody tr').cells; assert(cells[1].textContent==='4242' && cells[4].textContent==='12.5' && cells[5].textContent==='48 MB','process data missing');const check=one(root,'[data-ws-process-select][value="4242"]');check.click();assert(one(root,'[data-ws-process][data-pid="4242"]').getAttribute('aria-selected')==='true'&&one(root,'[data-ws-process-count]').textContent==='1 selected','process selection missing');const filter=one(root,'[data-ws-process-filter]');filter.value='indexer';filter.dispatchEvent(new Event('input',{bubbles:true}));assert(one(root,'[data-ws-process][data-pid="4242"]').hidden,'process filter failed');one(root,'[data-ely-action="terminate-processes"]').click();action(actions,'terminate-processes'); break;
    }
    case 'AnsiText': assert(one(root,'[data-ws-ansi]').textContent.includes('FAIL')&&one(root,'[data-ws-ansi-tone="red"]').textContent==='FAIL ','ANSI caller spans missing');break;
    case 'LogViewer': {
      const rows=[...root.querySelectorAll('[data-ws-search-row]')]; assert(rows.length===3 && rows[0].textContent.includes('10:32'),'caller log missing');const level=one(root,'[data-ws-log-level]');level.value='warning';level.dispatchEvent(new Event('change',{bubbles:true}));assert(rows[0].hidden&&!rows[1].hidden&&!rows[2].hidden,'log severity filter failed');const input=one(root,'input[data-ws-search]'); input.value='error'; input.dispatchEvent(new Event('input',{bubbles:true})); assert(rows[0].hidden && !rows[1].hidden && rows[1].textContent.includes('caller retry'),'log filter failed');const follow=one(root,'[data-ws-log-follow]');follow.checked=false;follow.dispatchEvent(new Event('change',{bubbles:true}));assert(root.dataset.wsLogFollow==='false','log follow state failed'); assert(!root.querySelector('[contenteditable="true"]'),'logs must be read-only'); break;
    }
    case 'BranchSelector': {
      const open=one(root,'[data-ws-branch-open]'),dialog=one(root,'[data-ws-branch-dialog]');open.click();assert(dialog.open,'branch selector did not open');const filter=one(root,'[data-ws-branch-filter]');filter.value='worker';filter.dispatchEvent(new Event('input',{bubbles:true}));assert(one(root,'[data-ws-branch-row]:first-child').hidden,'branch filter failed');one(root,'[data-ws-branch-pick="feature/worker"]').click();assert(!dialog.open&&one(root,'[data-ws-branch-label]').textContent==='feature/worker'&&actions.findLast(a=>a.action==='switch-branch')?.branch==='feature/worker','branch payload wrong');break;
    }
    case 'ChangesList': {
      assert(root.textContent.includes('Modified') && root.textContent.includes('docs/brief.md')&&root.textContent.includes('Staged changes'),'caller changes missing');const row=one(root,'[data-ws-change][data-path="src/worker.go"]');one(row,'[data-ws-change-action="stage"]').click();assert(row.dataset.staged==='true'&&one(root,'[data-ws-change-list="staged"]').contains(row)&&actions.findLast(a=>a.action==='stage-change')?.path==='src/worker.go','stage mark did not update locally');
      if(variant==='CommitInput'){const amend=one(root,'[data-ws-commit-amend]');amend.checked=true;amend.dispatchEvent(new Event('change',{bubbles:true}));assert(root.dataset.wsCommitAmend==='true','commit amend state missing');one(root,'textarea[name="message"]').value='Update worker';submitData(root,actions,'message','Update worker');} break;
    }
    case 'TodoItem': {
      const box=one(root,'input[data-ws-todo]'),progress=one(root,'[data-ws-todo-progress]');assert(box.checked&&progress.value===2&&one(root,'[data-ws-todo-count]').textContent==='2 / 4 completed'&&box.closest('[data-ws-todo-row]').hasAttribute('data-ws-todo-done'),'todo initial progress missing');box.click(); assert(!box.checked && one(root,'[data-ws-todo-count]').textContent==='1 / 4 completed'&&progress.value===1&&!box.closest('[data-ws-todo-row]').hasAttribute('data-ws-todo-done'),'todo count or completion state wrong');const rows=[...root.querySelectorAll('[data-ws-todo-row]')];one(rows[2],'[data-ws-todo-move]').click();assert(root.querySelector('[data-ws-todo-row] input').value==='todo-3','todo reorder control failed'); break;
    }
    case 'DocumentViewer': case 'OfficePreview': case 'EpubReader': {
      assert(!root.querySelector('[contenteditable="true"],textarea'),'document editable');
      if(kind==='EpubReader'){one(root,'[data-ws-epub-contents]').click();assert(!one(root,'[data-ws-epub-nav]').hidden,'epub chapter rail did not open');one(root,'[data-ws-epub-chapter="1"]').click();assert(!one(root,'[data-ws-epub-content="1"]').hidden&&one(root,'[data-ws-epub-position]').textContent==='2 of 3','epub chapter navigation failed');one(root,'[data-ws-epub-size="up"]').click();assert(Number(one(root,'[data-ws-epub-reading]').dataset.wsEpubSize)>1,'epub type sizing failed');break;}
      one(root,'button[data-ws-page="1"]').click(); const page=one(root,'[data-ws-page-content="1"]');
      assert(!page.hidden && one(page,'pre').textContent==='Caller document details' && one(root,'[data-ws-page-content="0"]').hidden && one(root,'button[data-ws-page="1"]').getAttribute('aria-selected')==='true' && actions.findLast(a=>a.action==='select-document-page')?.page===1,'viewer page navigation failed');one(root,'[data-ws-viewer-zoom="in"]').click();assert(one(root,'[data-ws-viewer-zoom-output]').textContent==='110%','viewer zoom failed');if(kind==='DocumentViewer'){const find=one(root,'[data-ws-document-find]');find.value='notes';find.dispatchEvent(new Event('input',{bubbles:true}));assert(one(root,'[data-ws-page="0"]').hidden&&!one(root,'[data-ws-page="2"]').hidden,'viewer find failed');}
      if(kind==='OfficePreview')assert(root.querySelectorAll('[data-ws-page-content]').length===3&&one(page,'h2').textContent==='Tokens'&&root.textContent.includes('caller-release.pptx'),'office slide contract wrong'); break;
    }
    case 'VersionHistory': {one(root,'button[data-ws-revision="1"]').click();const revision=one(root,'[data-ws-revision-content="1"]');assert(!revision.hidden && one(revision,'[data-ws-history-panel="read"]').textContent==='Original project revision' && one(root,'button[data-ws-revision="1"]').getAttribute('aria-selected')==='true','revision navigation failed');one(root,'[data-ws-history-tab="changes"]').click();assert(!one(revision,'[data-ws-history-panel="changes"]').hidden&&one(revision,'[data-ws-history-panel="read"]').hidden,'revision changes tab failed');hostButton(root,actions,'restore-revision','rev-1');break;}
    case 'TrashBin': {hostButton(root,actions,'restore-file','deleted-8'); assert(root.textContent.includes('docs/retired.md'),'restore claimed success without provider');const button=one(root,'[data-ely-action="delete-file-permanently"]'),before=actions.filter(a=>a.action==='delete-file-permanently').length;button.click();assert(actions.filter(a=>a.action==='delete-file-permanently').length===before,'trash deleted without confirmation');button.click();assert(actions.filter(a=>a.action==='delete-file-permanently').length===before+1&&root.querySelector('[data-ws-trash-item]'),'trash confirmation or caller ownership failed');break;}
    case 'ToolPalette': {
      const tool=one(root,'button[data-ws-tool="rectangle"]');tool.click(); assert(root.dataset.workspaceTool==='rectangle' && tool.getAttribute('aria-pressed')==='true' && one(root,'[data-ws-tool-label]').textContent==='rectangle' && actions.findLast(a=>a.action==='select-canvas-tool')?.tool==='rectangle','tool selection failed'); break;
    }
    case 'LayerPanel': {
      const input=one(root,'input[data-ws-layer]');input.click();assert(!input.checked && one(root,'[data-workspace-shape][data-value="shape-a"]').style.display==='none','visibility failed'); break;
    }
    case 'ColorPanel': {
      const input=one(root,'input[type="color"][data-ws-color]');input.value='#ff9900';input.dispatchEvent(new Event('input',{bubbles:true}));assert(one(root,'[data-ws-color-preview]').getAttribute('fill')==='#ff9900' && one(root,'[data-ws-color-label]').textContent==='#ff9900','color preview failed');break;
    }
    case 'ConstraintsEditor': {
      one(root,'input[name="width"]').value='640';const fd=submitData(root,actions,'width','640');assert(fd.get('height')==='180' && fd.get('gap')==='16' && fd.has('autoLayout'),'constraints payload incomplete');if(variant==='ExportPanel')hostButton(root,actions,'export-selection','');break;
    }
    case 'NodeEditor': {
      const node=one(root,'[data-workspace-shape][data-value="node-source"]');assert(node.getAttribute('transform')==='translate(40 70)' && one(node,'rect').getAttribute('width')==='130' && one(root,'[data-workspace-edge]').getAttribute('d')==='M170 100 L300 100','node geometry wrong');node.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(actions.findLast(a=>a.action==='select-shape')?.shape==='node-source','node selection missing');
      node.dispatchEvent(new PointerEvent('pointerdown',{button:0,clientX:40,clientY:70,bubbles:true,pointerId:7}));
      node.dispatchEvent(new PointerEvent('pointermove',{clientX:60,clientY:90,bubbles:true,pointerId:7}));
      node.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerId:7}));
      assert(node.getAttribute('transform')==='translate(60 90)','node movement failed');node.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true}));assert(actions.findLast(a=>a.action==='move-shape')?.x===61,'node keyboard movement failed');node.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true}));assert(actions.findLast(a=>a.action==='resize-shape')?.width===131,'node keyboard resize failed');one(root,'[data-ws-canvas-undo]').click();assert(actions.findLast(a=>a.action==='undo-shape')?.shape==='node-source','canvas undo failed');one(root,'[data-ws-canvas-mode="connect"]').click();node.dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,pointerId:8}));one(root,'[data-workspace-shape][data-value="node-target"]').dispatchEvent(new PointerEvent('pointerdown',{button:0,bubbles:true,pointerId:8}));assert(actions.findLast(a=>a.action==='connect-shapes')?.to==='node-target','node connector request missing');one(root,'[data-ws-canvas-autolayout]').click();assert(actions.findLast(a=>a.action==='request-canvas-layout'),'canvas auto layout request missing');break;
    }
    case 'ArchiveViewer': {const summary=one(root,'[data-ws-archive-summary]');assert(summary.textContent==='6 files · 3.2 MB · 5% smaller','archive summary wrong');const folder=one(root,'[data-ws-archive-node="Atrium/Design"]');assert(folder.getAttribute('aria-expanded')==='false','inner archive folder must start collapsed');folder.click();assert(folder.getAttribute('aria-expanded')==='true'&&!folder.nextElementSibling.hidden,'archive folder did not expand');one(root,'[data-ws-archive-node="Atrium/Design/Palette.json"]').dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true}));assert(actions.findLast(a=>a.action==='open-archive-entry')?.path==='Atrium/Design/Palette.json','archive host entry missing');break;}
    default: throw new Error('No domain assertion for '+kind);
  }
};
const domainChecks=Object.fromEntries([
  'files/RenameInline','files/FileSearch','editor/SearchPanel','files/FilePreview','files/HexViewer','debug/MemoryViewer',
  'files/FileOperationProgress','files/TransferQueue','files/DownloadManager','files/StorageUsage','debug/DebugToolbar','debug/BreakpointList','debug/VariablesPanel','debug/PerformanceProfiler','debug/NetworkInspector','terminal/ProcessList','terminal/AnsiText','terminal/LogViewer','git/BranchSelector','git/ChangesList','documents/TodoItem','documents/DocumentViewer','documents/OfficePreview','documents/EpubReader','documents/VersionHistory','documents/TrashBin','canvas/ToolPalette','canvas/LayerPanel','canvas/ColorPanel','canvas/ConstraintsEditor','canvas/NodeEditor','files/ArchiveViewer'
].map(key=>[key,domain]));
const make = (names, check) => Object.fromEntries(names.map(name => [name, check]));
registerChecks('workspace', {
  ...make(["editor/CompletionMenu","editor/CodeActionMenu","editor/ProblemsPanel","editor/WhitespaceRenderer","editor/DebugConsole","editor/SettingsEditor","editor/WelcomePage","editor/CursorPosition","git/PullRequestCard","documents/Block types","documents/Footnote","documents/FocusMode","documents/PrintPreview","documents/PageTree","documents/PageCover","documents/Backlinks","documents/TemplatePicker","collab/PresenceAvatars","collab/CommentBubble","collab/CommentSidebar","collab/Annotation","collab/SuggestionMode","collab/ActivityLog"], semantic),
  ...make(['editor/CodeEditor','devtools/QueryEditor'], code),
  ...make(['editor/InlineDiff'], diff),
  ...make(['editor/FindWidget'], find), ...make(['git/DiffViewer'], diff), ...make(['git/ThreeWayMerge'], conflict), ...make(['git/CommitGraph'], graph), ...make(['git/BlameView'], blame),
  ...make(['terminal/Terminal','terminal/CommandBlock'], terminal), ...make(['documents/RichTextEditor','collab/CommentThread'], rich), ...make(['documents/BlockEditor'], blockEditor), ...make(['documents/MarkdownEditor'], markdown), ...make(['documents/MarkdownRenderer'], markdownRenderer),
  ...make(['files/FileExplorer','files/FolderTree','files/FileList'], files), ...make(['files/DragDropFiles'], fileInput), ...make(['canvas/InfiniteCanvas','canvas/FlowChart','canvas/MindMap','canvas/Whiteboard'], canvas),
  ...make(['collab/ShareDialog','devtools/ConnectionManager','devtools/ApiRequestBuilder','devtools/WebSocketConsole'], request),
  ...make(['files/FileIcon','files/FileItem','files/FileGrid','files/FileContextMenu','files/RecentFiles','files/Favorites','files/DuplicateFinder','devtools/SchemaTree','devtools/TableStructureEditor','devtools/RedisKeyBrowser','devtools/DocumentViewer','devtools/ContainerList','devtools/GraphQLExplorer','devtools/RegexTester'], filesDevtools)
  ,...domainChecks
});
