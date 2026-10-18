import {bindWorkspaceSource} from './ely-api-workspace-source.js';
import {mountDevtools} from './ely-api-workspace-devtools.js';
import {mountCanvasScene} from './ely-api-workspace-canvas.js';
import {register, emit} from './ely-api.js';
import {fileIconName, fileGridStep, compareFileEntries, acceptsFile, bindWorkspaceFileDetails} from './ely-api-workspace-files.js';

register('workspace', root => {
  const devtoolsCleanup = mountDevtools(root);
  if (devtoolsCleanup) return devtoolsCleanup;
  const sceneCleanup = mountCanvasScene(root);
  if (sceneCleanup) return sceneCleanup;
  const lifecycle = new AbortController();
  const onRoot = (type, listener, options = {}) => root.addEventListener(type, listener, typeof options === 'boolean' ? {capture: options, signal: lifecycle.signal} : {...options, signal: lifecycle.signal});
  const change = detail => root.dispatchEvent(new CustomEvent('ely:change', {bubbles: true, detail: {id: root.id, component: root.dataset.elyComponent, ...detail}}));
  const paintFileIcons = (scope = root) => scope.querySelectorAll('[data-ws-file-icon]').forEach(icon => {
    if(icon.dataset.customIcon)return;
    const name = fileIconName(icon.dataset.name || ('file.'+(icon.dataset.extension||'')), icon.dataset.folder === 'true', icon.dataset.open === 'true');
    icon.style.setProperty('--ws-file-icon', 'url("/assets/ely/icons/' + name + '.svg")');
    icon.dataset.iconName = name;
  });
  paintFileIcons();
  bindWorkspaceFileDetails(root, {onRoot, emit: (action, detail) => emit(root, action, detail), paintFileIcons});
  const previewLines = (pre, text) => {
    pre.replaceChildren();text.split('\n').slice(0,12).forEach((line,index)=>{
      if(index)pre.append('\n');const span=document.createElement('span');span.dataset.wsPreviewLine='';span.textContent=line||' ';pre.append(span);
    });
  };
  root.querySelectorAll('[data-ws-preview-lines]').forEach(pre => previewLines(pre,pre.textContent));
  root.querySelectorAll('[data-ws-preview-picture]').forEach(image => { const ratio = Number(image.dataset.ratio); image.style.aspectRatio = Number.isFinite(ratio) && ratio > 0 ? ratio : 1.5; });
  const directory = root.querySelector('[data-ws-directory]');
  const fileEntry = node => ({name:node.dataset.name, folder:node.dataset.folder==='true', size:node.dataset.size, modified:node.dataset.modified});
  const sortDirectory = (key = 'name', ascending = true) => {
    if (!directory) return;
    const table = directory.querySelector('[data-ws-directory-table]'), body = table.tBodies[0];
    [...body.rows].sort((a,b)=>compareFileEntries(fileEntry(a),fileEntry(b),key,ascending)).forEach(row=>body.append(row));
    table.querySelectorAll('th').forEach(th=>th.setAttribute('aria-sort', th.querySelector('button').dataset.wsFileSort===key ? (ascending?'ascending':'descending') : 'none'));
  };
  const levels = () => [...root.querySelectorAll('template[data-ws-directory-level]')];
  const directoryColumns = () => {
    if (!directory) return;
    const pane = directory.querySelector('[data-ws-file-pane="columns"]'); pane.replaceChildren();
    levels().filter(level=>directory.dataset.path===level.dataset.wsDirectoryLevel||directory.dataset.path.startsWith(level.dataset.wsDirectoryLevel+'/')).forEach(level=>{
      const column = document.createElement('section');column.setAttribute('aria-label',level.dataset.name);column.dataset.wsColumnPath=level.dataset.wsDirectoryLevel;
      const entries = [...level.content.querySelectorAll('[data-ws-directory-table] [data-ws-entry]')].sort((a,b)=>compareFileEntries(fileEntry(a),fileEntry(b)));
      entries.forEach(entry=>{
        const button=document.createElement('button');button.type='button';button.dataset.wsEntry='';button.dataset.path=entry.dataset.path;button.dataset.name=entry.dataset.name;button.dataset.folder=entry.dataset.folder;button.disabled=root.dataset.elyDisabled==='true';
        button.append(...[...entry.cells[0].childNodes].map(node=>node.cloneNode(true)));button.setAttribute('aria-pressed',String(directory.dataset.path===entry.dataset.path||directory.dataset.path.startsWith(entry.dataset.path+'/')));
        column.append(button);
      });pane.append(column);
    });
    paintFileIcons(pane);
  };
  const navigateDirectory = path => {
    if (!directory) return;
    const level = levels().find(node=>node.dataset.wsDirectoryLevel===path);
    emit(root,'navigate-file-path',{path});
    if (!level) { directory.querySelector('[data-ws-directory-status]').textContent='Requested folder from host'; return; }
    directory.dataset.path=path;
    directory.querySelector('[data-ws-directory-name]').textContent=level.dataset.name;
    directory.querySelector('[data-ws-file-pane="list"]').replaceChildren(level.content.querySelector('table').cloneNode(true));
    directory.querySelector('[data-ws-file-pane="icons"]').replaceChildren(level.content.querySelector('[role="listbox"]').cloneNode(true));
    directory.querySelector('[data-ws-directory-count]').textContent=level.content.querySelectorAll('tbody tr').length+' items';
    const crumbs=directory.querySelector('[data-ws-directory-breadcrumbs]');crumbs.replaceChildren();
    levels().filter(node=>path===node.dataset.wsDirectoryLevel||path.startsWith(node.dataset.wsDirectoryLevel+'/')).forEach(node=>{
      const button=document.createElement('button');button.type='button';button.dataset.wsFileBreadcrumb=node.dataset.wsDirectoryLevel;button.textContent=node.dataset.name;crumbs.append(button);
    });
    directory.querySelector('[data-ws-directory-status]').textContent='';sortDirectory();directoryColumns();paintFileIcons(directory);
    const pane=directory.querySelector('[data-ws-file-pane]:not([hidden])'),entries=[...pane.querySelectorAll('[data-ws-entry]')];(entries.find(entry=>entry.dataset.path===path)||entries[0])?.focus();
  };
  if(directory){sortDirectory();directoryColumns();}
  const selectEntry = entry => {
    directory.querySelectorAll('[data-ws-entry]').forEach(node=>node.setAttribute('aria-selected',String(node.dataset.path===entry.dataset.path)));
    emit(root,'select-file',{path:entry.dataset.path});
  };
  const openEntry = entry => entry.dataset.folder==='true' ? navigateDirectory(entry.dataset.path) : emit(root,'open-file',{path:entry.dataset.path});
  const rename = root.querySelector('[data-ws-rename]');
  const finishRename = (cancel = false) => {
    if (!rename) return;
    const input=rename.querySelector('[data-ws-rename-value]'),start=rename.querySelector('[data-ws-rename-start]');
    if(cancel) input.value=start.textContent;
    else {start.textContent=input.value;input.defaultValue=input.value;rename.querySelector('[data-ws-file-icon]').dataset.name=input.value;paintFileIcons(rename);}
    rename.querySelector('fieldset').hidden=true;start.hidden=false;
    rename.querySelector('[data-ws-status]').textContent=cancel?'Edit canceled':'Rename requested';
    start.focus();
  };
  onRoot('submit',event=>{
    if(event.target!==rename)return;
    const input=rename.querySelector('[data-ws-rename-value]');input.value=input.value.trim();
    input.setCustomValidity(!input.value||/[\\/\u0000]/.test(input.value)||['.','..'].includes(input.value)?'Enter a file name without path separators.':'');
    if(!rename.reportValidity()){event.preventDefault();event.stopImmediatePropagation();}
  },true);
  onRoot('submit',event=>{if(event.target===rename)finishRename();});
  onRoot('focusout',event=>{
    if(event.target.matches('[data-ws-rename-value]')&&!rename.contains(event.relatedTarget)&&!rename.querySelector('fieldset').hidden)rename.requestSubmit();
  });
  const dropForm=root.querySelector('[data-ws-file-drop-form]'),dropped=new Map();
  const takeFiles = files => {
    if(!dropForm)return;
    const input=dropForm.querySelector('input[type="file"]');if(input.disabled)return;
    let rejected=0;
    [...files].forEach(file=>{if(acceptsFile(file,input.accept)){if(!dropped.has(file.name))dropped.set(file.name,file);}else rejected++;});
    const transfer=new DataTransfer();dropped.forEach(file=>transfer.items.add(file));input.files=transfer.files;
    const list=dropForm.querySelector('[data-ws-dropped-files]');list.replaceChildren();
    dropped.forEach(file=>{const li=document.createElement('li'),button=document.createElement('button'),label=document.createElement('span');label.textContent=file.name+' · '+file.size+' bytes';button.type='button';button.dataset.wsDropRemove=file.name;button.textContent='Remove';button.setAttribute('aria-label','Remove '+file.name);li.append(label,button);list.append(li);});
    dropForm.querySelector('[data-workspace-file-count]').textContent=dropped.size+' file(s) selected'+(rejected?' · '+rejected+' unsupported file(s) ignored':'');
    change({name:input.name,files:[...dropped.values()].map(file=>({name:file.name,size:file.size,type:file.type}))});
  };
  onRoot('dragover',event=>{const zone=event.target.closest('[data-ws-file-drop]');if(zone){event.preventDefault();zone.dataset.dragging='true';event.dataTransfer.dropEffect='copy';}});
  onRoot('dragleave',event=>{const zone=event.target.closest('[data-ws-file-drop]');if(zone&&!zone.contains(event.relatedTarget))delete zone.dataset.dragging;});
  onRoot('drop',event=>{const zone=event.target.closest('[data-ws-file-drop]');if(zone){event.preventDefault();delete zone.dataset.dragging;takeFiles(event.dataTransfer.files);}});
  onRoot('change',event=>{if(event.target.matches('[data-ws-file-drop-form] input[type="file"]')){event.stopImmediatePropagation();takeFiles(event.target.files);}},true);
  const fileMenu=root.querySelector('[data-ws-file-context]');let menuTarget;
  const closeFileMenu=()=>{if(fileMenu){fileMenu.hidden=true;root.querySelector('[data-ws-file-menu-trigger]').setAttribute('aria-expanded','false');}};
  const openFileMenu=(target,x,y)=>{
    if(!fileMenu||root.dataset.elyDisabled==='true')return;
    menuTarget=target;fileMenu.querySelectorAll('[data-ely-action]').forEach(button=>{if(target?.dataset.path)button.value=target.dataset.path;});
    fileMenu.hidden=false;fileMenu.style.left=Math.max(0,Math.min(x,innerWidth-fileMenu.offsetWidth))+'px';fileMenu.style.top=Math.max(0,Math.min(y,innerHeight-fileMenu.offsetHeight))+'px';
    root.querySelector('[data-ws-file-menu-trigger]').setAttribute('aria-expanded','true');fileMenu.querySelector('button:not(:disabled)')?.focus();
  };
  onRoot('contextmenu',event=>{if(!fileMenu)return;event.preventDefault();openFileMenu(event.target.closest('[data-path]'),event.clientX,event.clientY);});
  onRoot('click',event=>{
    const button=event.target.closest('button');if(button?.disabled)return;
    if(button?.matches('[data-ws-rename-start]')){button.hidden=true;rename.querySelector('fieldset').hidden=false;const input=rename.querySelector('[data-ws-rename-value]');input.setCustomValidity('');input.focus();input.select();}
    if(button?.matches('[data-ws-drop-remove]')){dropped.delete(button.dataset.wsDropRemove);takeFiles([]);}
    if(button?.matches('[data-ws-file-menu-trigger]')){const box=button.getBoundingClientRect();openFileMenu(root.querySelector('[data-ws-file-grid-item][aria-selected="true"]'),box.left,box.bottom);}
    if(button?.closest('[data-ws-file-context]')){closeFileMenu();(menuTarget||root.querySelector('[data-ws-file-menu-trigger]'))?.focus();}
    if(button?.matches('[data-ws-file-sort]')){const ascending=button.closest('th').getAttribute('aria-sort')!=='ascending';sortDirectory(button.dataset.wsFileSort,ascending);}
    const entry=event.target.closest('[data-ws-entry]');if(entry&&directory){selectEntry(entry);if(entry.closest('[data-ws-file-pane="columns"]')&&entry.dataset.folder==='true')openEntry(entry);}
  });
  onRoot('click',event=>{
    const crumb=event.target.closest('[data-ws-directory] [data-ws-file-breadcrumb]');
    if(crumb&&!crumb.disabled){event.stopImmediatePropagation();navigateDirectory(crumb.dataset.wsFileBreadcrumb);}
    if(event.target.closest('[data-ws-rename-cancel]')){event.preventDefault();event.stopImmediatePropagation();finishRename(true);}
  },true);
  onRoot('dblclick',event=>{
    if(root.dataset.elyDisabled==='true')return;
    const entry=event.target.closest('[data-ws-entry]');if(entry&&directory){openEntry(entry);return;}
    const item=event.target.closest('[data-ws-file-grid-item]');if(item)emit(root,'open-file',{path:item.dataset.path});
    const tree=root.dataset.elyComponent.startsWith('files/')&&event.target.closest('[data-workspace-tree][data-folder="false"]');if(tree)emit(root,'open-file',{path:tree.dataset.value});
  });
  onRoot('keydown',event=>{
    if(event.key==='Escape'&&rename?.contains(event.target)){event.preventDefault();event.stopImmediatePropagation();finishRename(true);return;}
    if(fileMenu&&((event.key==='F10'&&event.shiftKey)||event.key==='ContextMenu')){event.preventDefault();const target=event.target.closest('[data-path]'),box=event.target.getBoundingClientRect();openFileMenu(target,box.left,box.bottom);}
    if(fileMenu&&!fileMenu.hidden){
      const buttons=[...fileMenu.querySelectorAll('button:not(:disabled)')];let index=buttons.indexOf(document.activeElement);
      if(event.key==='Escape'){event.preventDefault();closeFileMenu();(menuTarget||root.querySelector('[data-ws-file-menu-trigger]')).focus();}
      if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();index=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[index]?.focus();}
    }
    const entry=event.target.closest('[data-ws-entry]');
    if(entry&&directory&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&['Enter','ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End',' '].includes(event.key)){
      event.preventDefault();if(event.key==='Enter'){openEntry(entry);return;}
      if(entry.closest('[data-ws-file-pane="columns"]')){
        if(event.key==='ArrowRight'){if(entry.dataset.folder==='true')openEntry(entry);return;}
        if(event.key==='ArrowLeft'){navigateDirectory(entry.parentElement.dataset.wsColumnPath);return;}
      }
      const pane=entry.closest('[data-ws-file-pane]'),scope=pane.dataset.wsFilePane==='columns'?entry.parentElement:pane,items=[...scope.querySelectorAll('[data-ws-entry]')];const columns=pane.dataset.wsFilePane==='icons'?Math.max(1,Math.floor((pane.clientWidth+8)/104)):1;
      const next=items[fileGridStep(items.indexOf(entry),items.length,columns,event.key)];if(next){selectEntry(next);next.focus();}
    }
    const tree=root.dataset.elyComponent.startsWith('files/')&&event.target.closest('[data-workspace-tree]');
    if(tree&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&['ArrowDown','ArrowUp','ArrowLeft','ArrowRight','Home','End','Enter'].includes(event.key)){
      event.preventDefault();const child=tree.parentElement.querySelector(':scope > ul');
      if(event.key==='Enter'){if(child)tree.click();else emit(root,tree.dataset.folder==='true'?'navigate-file-path':'open-file',{path:tree.dataset.value});return;}
      if(event.key==='ArrowRight'){if(child){if(child.hidden)tree.click();else child.querySelector('button')?.focus();}return;}
      if(event.key==='ArrowLeft'){if(child&&!child.hidden)tree.click();else tree.parentElement.parentElement.closest('li')?.querySelector('button')?.focus();return;}
      const items=[...root.querySelectorAll('[data-workspace-tree]')].filter(node=>!node.closest('[hidden]'));items[fileGridStep(items.indexOf(tree),items.length,1,event.key)]?.focus();
    }
  },true);
  document.addEventListener('click',event=>{if(fileMenu&&!fileMenu.hidden&&!event.target.closest('[data-ws-file-context],[data-ws-file-menu-trigger]'))closeFileMenu();},{signal:lifecycle.signal});
  onRoot('input',event=>{
    if(event.target.matches('[data-ws-rename-value]'))event.target.setCustomValidity('');
    if(!event.target.matches('[data-workspace-filter]'))return;
    const tree=root.querySelector('.ely-workspace__tree');if(!tree)return;
    const term=event.target.value.toLowerCase();
    tree.querySelectorAll('li').forEach(li=>{
      const button=li.querySelector(':scope > button'),children=li.querySelector(':scope > ul');
      li.hidden=Boolean(term)&&!li.textContent.toLowerCase().includes(term);
      if(children){
        if(term){if(!('beforeFilter' in children.dataset))children.dataset.beforeFilter=String(children.hidden);children.hidden=false;button.setAttribute('aria-expanded','true');}
        else if('beforeFilter' in children.dataset){children.hidden=children.dataset.beforeFilter==='true';button.setAttribute('aria-expanded',String(!children.hidden));delete children.dataset.beforeFilter;}
      }
    });
    event.stopImmediatePropagation();change({name:event.target.name,value:event.target.value});
  },true);
  const presence = root.querySelector('[data-ws-presence]');
  const follow = value => {
    if (!presence) return;
    const peers = [...presence.querySelectorAll('[data-ws-follow]')];
    const peer = peers.find(button => button.value === value);
    presence.dataset.following = peer?.value || '';
    peers.forEach(button => button.setAttribute('aria-pressed', String(button === peer)));
    presence.querySelector('[data-ws-follow-banner]').hidden = !peer;
    presence.querySelector('[data-ws-follow-label]').textContent = peer ? 'Following ' + peer.dataset.name : '';
  };
  if (presence) {
    const peers = [...presence.querySelectorAll('[data-ws-follow]')];
    const max = Math.max(1, Number(presence.dataset.maxVisible) || 4);
    presence.querySelector('[data-ws-live]').textContent = peers.length ? '● Live · ' + (peers.length + 1) + ' here' : 'Only you';
    peers.forEach((peer, index) => { peer.hidden = index >= max; });
    const overflow = presence.querySelector('[data-ws-peer-overflow]');
    overflow.hidden = peers.length <= max;
    overflow.textContent = '+' + Math.max(0, peers.length - max);
    overflow.title = peers.slice(max).map(peer => peer.dataset.name).join(', ');
    follow(presence.dataset.following);
  }
  onRoot('click', event => {
    const button = event.target.closest('[data-ws-follow]');
    if (!button || button.disabled) return;
    event.preventDefault(); event.stopImmediatePropagation();
    const following = presence.dataset.following === button.value ? '' : button.value;
    follow(following); emit(root, 'follow-user', {value: button.value, following});
  }, true);
  const sidebar = root.querySelector('[data-ws-comment-sidebar]');
  const refreshThreads = () => {
    if (!sidebar) return;
    const resolved = sidebar.querySelector('[data-ws-comment-filter="resolved"]').getAttribute('aria-pressed') === 'true';
    const threads = [...sidebar.querySelectorAll('[data-ws-thread]')];
    sidebar.querySelectorAll('[data-ws-comment-filter]').forEach(button => {
      button.querySelector('span').textContent = threads.filter(thread => (thread.dataset.resolved === 'true') === (button.dataset.wsCommentFilter === 'resolved')).length;
    });
    threads.forEach(thread => {
      const active = thread.dataset.wsThread === sidebar.dataset.activeThread;
      thread.hidden = (thread.dataset.resolved === 'true') !== resolved;
      thread.setAttribute('aria-current', String(active));
      const reply = thread.querySelector('[data-ws-thread-reply]');
      if (reply) reply.hidden = !active;
    });
    sidebar.querySelector('[data-ws-comments-empty]').hidden = threads.some(thread => !thread.hidden);
  };
  refreshThreads();
  const refreshReply = form => {
    const input = form.elements.reply;
    form.querySelector('button[type="submit"]').disabled = input.disabled || !input.value.trim();
  };
  root.querySelectorAll('[data-ws-thread-reply]').forEach(form => {
    refreshReply(form);
    form.addEventListener('formdata', event => event.formData.set('reply', form.elements.reply.value.trim()), {signal: lifecycle.signal});
  });
  const suggestion = root.querySelector('[data-ws-suggestions]');
  const setSuggestionMode = mode => {
    if (!suggestion) return;
    suggestion.dataset.mode = mode;
    suggestion.querySelectorAll('[data-ws-suggestion-mode]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.wsSuggestionMode === mode)));
    suggestion.querySelector('[data-ws-suggestion-draft]').readOnly = mode === 'viewing';
    suggestion.querySelector('[data-ws-suggestion-review]').hidden = mode === 'editing';
    suggestion.querySelectorAll('[data-ws-decisions]').forEach(node => { node.hidden = mode !== 'suggesting'; });
  };
  if (suggestion) setSuggestionMode(suggestion.dataset.mode);
  const inviteForm = root.querySelector('[data-ws-invite-form]');
  const refreshInvite = () => {
    if (!inviteForm) return;
    const draft = inviteForm.querySelector('input[name="invitee"]');
    draft.required = !inviteForm.querySelector('[data-ws-invite-chip]');
  };
  refreshInvite();
  inviteForm?.addEventListener('formdata', event => {
    const emails = event.formData.getAll('invitee').map(value => value.trim()).filter(Boolean);
    event.formData.delete('invitee'); emails.forEach(email => event.formData.append('invitee', email));
  }, {signal: lifecycle.signal});
  const react = (container, emoji) => {
    if (!emoji) return;
    const thread = container.closest('[data-ws-thread]'), comment = container.closest('[data-ws-thread-comment]');
    let button = [...container.querySelectorAll('[data-ws-reaction]')].find(node => node.dataset.wsReaction === emoji);
    if (!button) {
      button = document.createElement('button'); button.type = 'button'; button.dataset.wsReaction = emoji;
      button.setAttribute('aria-pressed', 'false');
      const label = document.createElement('span'), count = document.createElement('span');
      label.textContent = emoji; count.dataset.wsReactionCount = ''; count.textContent = '0';
      button.append(label, ' ', count); container.prepend(button);
    }
    const mine = button.getAttribute('aria-pressed') !== 'true';
    const count = Math.max(0, Number(button.querySelector('[data-ws-reaction-count]').textContent) + (mine ? 1 : -1));
    button.setAttribute('aria-pressed', String(mine)); button.querySelector('[data-ws-reaction-count]').textContent = count;
    if (!count) { button.remove(); container.querySelector('summary')?.focus(); }
    container.querySelector('details').open = false;
    emit(root, 'toggle-reaction', {thread: thread.dataset.wsThread, comment: comment.dataset.wsThreadComment, emoji, mine, count});
  };
  onRoot('click', event => {
    const button = event.target.closest('button');
    if (button?.disabled) return;
    if (button?.matches('[data-ws-follow-stop]')) { follow(''); emit(root, 'stop-following', {}); }
    if (button?.matches('[data-ws-comment-marker]')) {
      const bubble = button.nextElementSibling;
      bubble.hidden = !bubble.hidden; button.setAttribute('aria-expanded', String(!bubble.hidden));
    }
    if (button?.matches('[data-ws-comment-filter]')) {
      sidebar.querySelectorAll('[data-ws-comment-filter]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
      refreshThreads();
    }
    const thread = event.target.closest('[data-ws-comment-sidebar] [data-ws-thread]');
    if (thread && !event.target.closest('button,input,summary,form')) {
      sidebar.dataset.activeThread = thread.dataset.wsThread; refreshThreads();
      emit(root, 'select-comment-thread', {thread: thread.dataset.wsThread});
    }
    if (button?.matches('[data-ws-reaction],[data-ws-pick-reaction]')) react(button.closest('[data-ws-reactions]'), button.dataset.wsReaction || button.dataset.wsPickReaction);
    if (button?.matches('[data-ws-annotation]')) {
      root.querySelectorAll('[data-ws-annotation]').forEach(node => node.setAttribute('aria-pressed', String(node === button)));
      emit(root, 'select-annotation', {annotation: button.dataset.wsAnnotation});
    }
    if (button?.matches('[data-ws-suggestion-mode]')) { setSuggestionMode(button.dataset.wsSuggestionMode); emit(root, 'set-suggestion-mode', {mode: button.dataset.wsSuggestionMode}); }
    if (button?.matches('[data-ws-invite-remove]')) { button.closest('[data-ws-invite-chip]').remove(); refreshInvite(); }
    if (button?.matches('[data-ws-invite-add]')) {
      const draft = inviteForm.querySelector('input[name="invitee"]');
      if (!draft.value.trim() || !draft.reportValidity()) return;
      const chip = document.createElement('li'), input = document.createElement('input'), remove = document.createElement('button');
      chip.dataset.wsInviteChip = ''; input.type = 'email'; input.name = 'invitee'; input.required = true; input.value = draft.value.trim(); input.setAttribute('aria-label', 'Pending email');
      remove.type = 'button'; remove.dataset.wsInviteRemove = ''; remove.setAttribute('aria-label', 'Remove ' + input.value); remove.textContent = '×';
      chip.append(input, remove); inviteForm.querySelector('[aria-label="Pending invitations"]').append(chip); draft.value = ''; refreshInvite(); draft.focus();
    }
    if (button?.matches('[data-ws-copy-share]')) {
      const field = root.querySelector('[data-ws-share-url]'), status = root.querySelector('[data-ws-copy-status]');
      if (navigator.clipboard?.writeText) navigator.clipboard.writeText(field.value).then(() => { status.textContent = 'Link copied'; }, () => { field.select(); status.textContent = 'Select and copy the link'; });
      else { field.select(); status.textContent = 'Select and copy the link'; }
    }
  });
  onRoot('submit', event => {
    const form = event.target;
    if (form.matches('[data-ws-custom-reaction]')) {
      event.preventDefault(); event.stopImmediatePropagation();
      react(form.closest('[data-ws-reactions]'), form.elements.emoji.value.trim()); form.reset();
    }
    if (form.matches('[data-ws-thread-reply]') && !form.elements.reply.value.trim()) {
      event.preventDefault(); event.stopImmediatePropagation(); form.elements.reply.focus();
    }
  }, true);
  onRoot('input', event => {
    const reply = event.target.closest('[data-ws-thread-reply]');
    if (reply) refreshReply(reply);
    if (event.target.matches('[data-ws-suggestion-draft]')) emit(root, 'edit-suggestion-draft', {mode: suggestion.dataset.mode, value: event.target.value});
    if (event.target.matches('[data-ws-presence-text]')) {
      const draft = event.target.cloneNode(true);
      draft.querySelectorAll('[data-ws-remote-cursor]').forEach(cursor => cursor.remove());
      emit(root, 'edit-presence-draft', {value: codeText(draft)});
    }
  });
  onRoot('keydown', event => {
    if (event.target.matches('[data-ws-comment-sidebar] [data-ws-thread]') && ['Enter', ' '].includes(event.key)) { event.preventDefault(); event.target.click(); }
    if (event.key === 'Escape') {
      root.querySelectorAll('[data-ws-comment-bubble]:not([hidden])').forEach(bubble => { bubble.hidden = true; bubble.previousElementSibling.setAttribute('aria-expanded', 'false'); bubble.previousElementSibling.focus(); });
      root.querySelectorAll('[data-ws-reaction-picker][open]').forEach(picker => { picker.open = false; picker.querySelector('summary').focus(); });
      if (presence?.dataset.following) { follow(''); emit(root, 'stop-following', {}); }
    }
  });
  document.addEventListener('click', event => {
    root.querySelectorAll('[data-ws-comment-bubble]:not([hidden])').forEach(bubble => {
      if (!event.composedPath().includes(bubble.parentElement)) { bubble.hidden = true; bubble.previousElementSibling.setAttribute('aria-expanded', 'false'); }
    });
  }, {signal: lifecycle.signal});
  let drag;
  let draggedFavorite;
  const favoriteOrder = () => [...root.querySelectorAll('[data-ws-favorite]')].map(row=>row.dataset.wsFavorite);
  const moveFavorite = (row, target, after = false) => {
    if(!row||!target||row===target||row.parentElement!==target.parentElement)return;
    const from=favoriteOrder().indexOf(row.dataset.wsFavorite);
    target.parentElement.insertBefore(row,after?target.nextSibling:target);
    const order=favoriteOrder();
    emit(root,'reorder-favorites',{value:row.dataset.wsFavorite,from,to:order.indexOf(row.dataset.wsFavorite),order});
    change({name:'favorites',value:order});
  };
  onRoot('click', event => {
    const button=event.target.closest('[data-ws-favorite-unpin],[data-ws-favorite-up],[data-ws-favorite-down]');
    if(!button||button.disabled)return;
    const row=button.closest('[data-ws-favorite]');
    if(button.hasAttribute('data-ws-favorite-unpin')){
      const next=row.nextElementSibling||row.previousElementSibling,value=row.dataset.wsFavorite;
      row.remove();next?.querySelector('button')?.focus();
      emit(root,'unpin-favorite',{value,order:favoriteOrder()});change({name:'favorites',value:favoriteOrder()});
    }else moveFavorite(row,button.hasAttribute('data-ws-favorite-up')?row.previousElementSibling:row.nextElementSibling,button.hasAttribute('data-ws-favorite-down'));
  });
  onRoot('dragstart', event => {draggedFavorite=event.target.closest('[data-ws-favorite]');if(draggedFavorite)event.dataTransfer?.setData('text/plain',draggedFavorite.dataset.wsFavorite);});
  onRoot('dragover', event => {if(draggedFavorite&&event.target.closest('[data-ws-favorite]'))event.preventDefault();});
  onRoot('drop', event => {const target=event.target.closest('[data-ws-favorite]');if(draggedFavorite&&target){event.preventDefault();moveFavorite(draggedFavorite,target);}draggedFavorite=undefined;});
  onRoot('dragend', () => {draggedFavorite=undefined;});
  onRoot('change', event => {const field=event.target;if(field.matches('[data-ws-page-property]')&&!field.disabled)emit(root,'update-page-property',{name:field.name,value:field.type==='checkbox'?field.checked:field.value});});
  const canvasDisabled = () => root.querySelector('[data-workspace-canvas]')?.dataset.wsDisabled === 'true';
  const chapter = root.dataset.elyComponent.split('/')[0];
  let canvasMode = 'pan', pan = {x:0,y:0}, drawing, panning, selectedRange, resize, connectFrom;
  const canvasUndo = [];
  const stage = root.querySelector('[data-workspace-stage]');
  const fileGrid = root.querySelector('[data-ws-file-grid-list]');
  const filePreview = root.querySelector('[data-ws-file-preview-dialog]');
  const colorSpectrum = root.querySelector('[data-ws-color-spectrum]');
  if (colorSpectrum?.dataset.wsColorValue) colorSpectrum.style.setProperty('--ws-color', colorSpectrum.dataset.wsColorValue);
  const fileItems = () => [...root.querySelectorAll('[data-ws-file-grid-item]')];
  let consoleHistoryIndex = -1;
  const completionItems = () => [...root.querySelectorAll('[data-ws-candidate]:not([hidden])')];
  const selectCompletion = item => { root.querySelectorAll('[data-ws-candidate]').forEach(node => node.setAttribute('aria-selected', String(node === item))); const list=root.querySelector('[data-ws-completion-list]'); if (list) list.setAttribute('aria-activedescendant', item.id); change({name:'completion',value:item.querySelector('[data-ws-complete]')?.dataset.wsComplete}); };
  const selectTemplate = item => { root.querySelectorAll('[data-ws-template]').forEach(node => node.setAttribute('aria-selected', String(node === item))); const preview=root.querySelector('[data-ws-template-preview]'); if (!preview) return; preview.querySelector('[data-ws-template-preview-name]').textContent=item?.querySelector('h3')?.textContent||''; const content=preview.querySelector('[data-ws-template-preview-content]'),rendered=item?.querySelector('[data-ws-template-markdown]');content.replaceChildren(rendered?rendered.content.cloneNode(true):document.createTextNode('No templates')); preview.querySelector('[data-ws-template-use]').disabled=!item||root.dataset.elyDisabled==='true'; if(item)change({name:'template',value:item.dataset.templateId}); };
  const filterTemplates = () => { const input=root.querySelector('[data-ws-template-search]'); const active=root.querySelector('[data-ws-template-category][aria-pressed="true"]')?.dataset.wsTemplateCategory; const term=input?.value.trim().toLocaleLowerCase()||''; root.querySelectorAll('[data-ws-template]').forEach(item=>{const text=[...item.querySelectorAll('h3,p')].map(node=>node.textContent).join(' ').toLocaleLowerCase();item.hidden=Boolean(active&&item.dataset.category!==active)||Boolean(term)&&!text.includes(term);}); selectTemplate(root.querySelector('[data-ws-template][aria-selected="true"]:not([hidden])')||root.querySelector('[data-ws-template]:not([hidden])')); };
  onRoot('click', event => {
    const button=event.target.closest('[data-ws-trash-confirm]');
    if(!button||button.disabled)return;
    if(button.dataset.confirming!=='true'){event.preventDefault();event.stopImmediatePropagation();button.dataset.confirming='true';button.dataset.confirmLabel=button.textContent;button.textContent='Confirm '+button.textContent.toLowerCase();}
    else {button.dataset.confirming='false';button.textContent=button.dataset.confirmLabel;}
  }, true);
  onRoot('focusout', event => {const button=event.target.closest('[data-ws-trash-confirm]');if(button?.dataset.confirming==='true'){button.dataset.confirming='false';button.textContent=button.dataset.confirmLabel;}});
  onRoot('click', event => {
    const cover=event.target.closest('[data-ws-cover-change]');if(cover&&!cover.disabled){const choices=root.querySelector('[data-ws-cover-choices]');choices.hidden=!choices.hidden;cover.setAttribute('aria-expanded',String(!choices.hidden));}
    if(event.target.closest('[data-ws-template-use]'))root.querySelector('[data-ws-template][aria-selected="true"]:not([hidden]) [data-ely-action="select-template"]')?.click();
    const revision=event.target.closest('[data-ws-revision]');if(revision&&!revision.disabled)root.querySelectorAll('[data-ws-history-restore]').forEach(button=>{button.hidden=button.dataset.wsHistoryRestore!==revision.dataset.wsRevision;});
  });
  onRoot('keydown', event => {
    const item=event.target.closest('[data-ws-template]');if(!item||event.target!==item||!['ArrowDown','ArrowUp','Home','End','Enter'].includes(event.key))return;
    event.preventDefault();const items=[...root.querySelectorAll('[data-ws-template]:not([hidden])')];let index=items.indexOf(item);
    if(event.key==='Enter'){item.querySelector('[data-ely-action="select-template"]')?.click();return;}
    if(event.key==='Home')index=0;else if(event.key==='End')index=items.length-1;else index=Math.max(0,Math.min(items.length-1,index+(event.key==='ArrowDown'?1:-1)));
    selectTemplate(items[index]);items[index]?.focus();
  });
  const selectFile = item => { fileItems().forEach(node => node.setAttribute('aria-selected', String(node === item))); change({name:'file',value:item.dataset.path}); emit(root,'select-file',{path:item.dataset.path}); };
  const previewFile = item => {
    if (!filePreview) return;
    filePreview.querySelector('[data-ws-file-preview-name]').textContent=item.dataset.name;
    const image=filePreview.querySelector('[data-ws-file-preview-image]'),content=filePreview.querySelector('[data-ws-file-preview-content]'),icon=filePreview.querySelector('[data-ws-file-preview-icon]');
    image.hidden=!item.dataset.imageUrl;if(item.dataset.imageUrl)image.src=item.dataset.imageUrl;else image.removeAttribute('src');image.alt=item.dataset.alt||item.dataset.name;
    content.hidden=Boolean(item.dataset.imageUrl)||!item.dataset.preview;previewLines(content,item.dataset.preview||'');
    icon.hidden=Boolean(item.dataset.imageUrl||item.dataset.preview);icon.replaceChildren(item.querySelector('[data-ws-file-icon]').cloneNode(true));
    filePreview.querySelector('[data-ws-file-preview-meta]').textContent=[item.dataset.size,item.dataset.modified].filter(Boolean).join(' · ');
    filePreview.showModal?.();if(!filePreview.open)filePreview.setAttribute('open','');filePreview.querySelector('button').focus();emit(root,'preview-file',{path:item.dataset.path});
  };
  const updateMiniMap = () => { const viewport=root.querySelector('[data-ws-canvas-minimap-viewport]'); if(!viewport)return;viewport.setAttribute('x',String(Math.max(3,Math.min(115,18-pan.x/12))));viewport.setAttribute('y',String(Math.max(3,Math.min(39,18-pan.y/12)))); };
  const transformStage = () => { if (stage) { const scale = Number.parseInt(root.querySelector('output[data-workspace-zoom]').textContent,10) / 100; stage.style.transform = 'translate(' + pan.x + 'px,' + pan.y + 'px) scale(' + scale + ')'; stage.style.transformOrigin = '0 0'; updateMiniMap(); } };
  const setGraphZoom = amount => { const output=root.querySelector('[data-ws-graph-zoom]'); const graph=root.querySelector('.ely-workspace__graph'); if(!output||!graph)return; const current=Number.parseInt(output.textContent,10); const next=Math.max(50,Math.min(200,(Number.isFinite(current)?current:100)+amount)); output.textContent=next+'%'; root.dataset.wsGraphZoom=String(next); graph.style.transform='scale('+next/100+')'; graph.style.transformOrigin='0 0'; emit(root,'set-graph-zoom',{zoom:next}); };
  const filePanes = view => root.querySelectorAll('[data-ws-file-pane]').forEach(pane => { pane.hidden = pane.dataset.wsFilePane !== view; });
  const queryRows = () => [...root.querySelectorAll('[data-ws-query-row]')];
  const updateProcessSelection = () => { const selected=[...root.querySelectorAll('[data-ws-process-select]:checked')];root.querySelectorAll('[data-ws-process]').forEach(row=>row.setAttribute('aria-selected',String(Boolean(row.querySelector('[data-ws-process-select]:checked')))));const count=root.querySelector('[data-ws-process-count]');if(count)count.textContent=selected.length+' selected';const all=root.querySelector('[data-ws-process-all]');if(all)all.checked=selected.length>0&&selected.length===[...root.querySelectorAll('[data-ws-process-select]')].length; };
  const filterProcesses = input => { const term=input.value.toLocaleLowerCase();root.querySelectorAll('[data-ws-process]').forEach(row=>row.hidden=Boolean(term)&&!row.textContent.toLocaleLowerCase().includes(term)); };
  const filterLogs = () => { const selected=root.querySelector('[data-ws-log-level]')?.value||'debug', term=root.querySelector('[data-ws-log-viewer] input[data-ws-search]')?.value.toLocaleLowerCase()||''; const order=['trace','debug','info','warning','error']; const minimum=order.indexOf(selected); root.querySelectorAll('[data-ws-log-lines] [data-ws-search-row]').forEach(row=>row.hidden=order.indexOf(row.dataset.level)<minimum||(Boolean(term)&&!row.textContent.toLocaleLowerCase().includes(term))); };
  const filterBranches = () => { const term=root.querySelector('[data-ws-branch-filter]')?.value.toLocaleLowerCase()||'';root.querySelectorAll('[data-ws-branch-row]').forEach(row=>row.hidden=Boolean(term)&&!row.textContent.toLocaleLowerCase().includes(term)); };
  const updateCommitCount = () => { const output=root.querySelector('[data-ws-commit-count]');if(output)output.textContent=root.querySelectorAll('[data-ws-change][data-staged="true"]').length+' staged files'; };
  const filterQueryRows = input => { const term=input.value.toLocaleLowerCase(); queryRows().forEach(row => { row.hidden=Boolean(term)&&!row.textContent.toLocaleLowerCase().includes(term); }); };
  const shapeGeometry = shape => shape.querySelector('[data-ws-shape-geometry]');
  const syncShapeGeometry = (shape,width,height) => { const geometry=shapeGeometry(shape);if(!geometry)return;geometry.setAttribute('width',width);geometry.setAttribute('height',height);const rect=shape.querySelector('rect[data-ws-shape-visible]');if(rect){rect.setAttribute('width',width);rect.setAttribute('height',height);}const ellipse=shape.querySelector('ellipse[data-ws-shape-visible]');if(ellipse){ellipse.setAttribute('cx',width/2);ellipse.setAttribute('cy',height/2);ellipse.setAttribute('rx',width/2);ellipse.setAttribute('ry',height/2);}const diamond=shape.querySelector('polygon[data-ws-shape-visible]');if(diamond)diamond.setAttribute('points',(width/2)+',0 '+width+','+(height/2)+' '+(width/2)+','+height+' 0,'+(height/2));const handle=shape.querySelector('[data-ws-resize-handle]');if(handle){handle.setAttribute('x',width-8);handle.setAttribute('y',height-8);} };
  const snapshotShape = shape => ({shape, transform:shape.getAttribute('transform'), width:shapeGeometry(shape)?.getAttribute('width'), height:shapeGeometry(shape)?.getAttribute('height')});
  const rememberShape = shape => { canvasUndo.push(snapshotShape(shape)); if(canvasUndo.length>30)canvasUndo.shift(); };
  const restoreShape = () => { const prior=canvasUndo.pop(); if(!prior)return; prior.shape.setAttribute('transform',prior.transform);syncShapeGeometry(prior.shape,prior.width,prior.height); emit(root,'undo-shape',{shape:prior.shape.dataset.value}); };
  const stagePoint = event => { const matrix = stage.getScreenCTM(); if (!matrix) return null; const point = new DOMPoint(event.clientX,event.clientY).matrixTransform(matrix.inverse()); return {x:Math.round(point.x*100)/100,y:Math.round(point.y*100)/100}; };
  const whitespace = root.querySelector('[data-ws-whitespace]');
  if (whitespace) whitespace.textContent = whitespace.textContent.replace(/ /g,'·').replace(/\t/g,'→').replace(/\n/g,'↵\n');
  const graphNodes = [...root.querySelectorAll('[data-workspace-graph] g[data-parents]')];
  const graphByID = new Map(graphNodes.map(node => [node.dataset.value,node]));
  graphNodes.forEach(node => node.dataset.parents.trim().split(/\s+/).filter(Boolean).forEach(id => {
    const parent = graphByID.get(id);
    if (!parent) return;
    const values = [node.dataset.x,node.dataset.y,parent.dataset.x,parent.dataset.y].map(Number);
    if (!values.every(Number.isFinite)) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg','path');path.dataset.wsParentEdge=id;path.setAttribute('d','M'+values[0]+' '+values[1]+' L'+values[2]+' '+values[3]);node.closest('svg').prepend(path);
  }));
  const markdown = root.querySelector('[data-workspace-markdown-renderer] .ely-workspace__markdown');
  if (markdown) {
    const nav = root.querySelector('[data-ws-markdown-nav]');
    markdown.querySelectorAll('h1,h2,h3,h4,h5,h6').forEach((heading,index) => {
      heading.id = root.id + '-heading-' + (index+1);
      if (nav) {
        const link = document.createElement('a');
        link.href = '#' + heading.id;
        link.textContent = heading.textContent;
        link.dataset.level = heading.tagName.slice(1);
        nav.append(link);
      }
    });
  }
  const reading = root.querySelector('[data-ws-reading]');
  const readingProgress = () => {
    const extent = reading.scrollHeight - reading.clientHeight;
    root.querySelector('[data-ws-reading-progress]').value = extent > 0 ? Math.min(100,Math.max(0,reading.scrollTop / extent * 100)) : 100;
  };
  if (reading) { reading.addEventListener('scroll',readingProgress,{signal:lifecycle.signal}); readingProgress(); }
  // Build a fresh tree: formatting survives, caller attributes and active content do not.
  const safeRich = node => {
    const result = document.createElement('div');
    const allowed = new Set(['P','DIV','BR','STRONG','EM','B','I','U','S','UL','OL','LI','H1','H2','H3','H4','H5','H6','BLOCKQUOTE','CODE','PRE','A']);
    let count = 0;
    const copy = (source, destination, depth = 0) => {
      if (depth > 100) throw new Error('Content nesting exceeds 100 levels.');
      for (const child of source.childNodes) {
        if (++count > 10000) throw new Error('Content exceeds 10000 nodes.');
        if (child.nodeType === Node.TEXT_NODE) destination.append(document.createTextNode(child.textContent));
        else if (child.nodeType === Node.ELEMENT_NODE && !['SCRIPT','STYLE','IFRAME','OBJECT','EMBED'].includes(child.tagName)) {
          if (allowed.has(child.tagName)) { const clean = document.createElement(child.tagName.toLowerCase()); if(child.tagName==='A'){const href=child.getAttribute('href')||'';if(/^#|^https?:/i.test(href))clean.setAttribute('href',href);} copy(child,clean,depth+1); destination.append(clean); }
          else copy(child,destination,depth+1);
        }
      }
    };
    copy(node,result);
    return result.innerHTML;
  };
  const codeText = editor => {
    let count = 0;
    const read = (node, depth = 0) => {
      if (++count > 10000 || depth > 100) throw new Error('Code content exceeds the supported DOM size.');
      if (node.nodeType === Node.TEXT_NODE) return node.textContent;
      if (node.nodeType === Node.ELEMENT_NODE && node.getAttribute('contenteditable') === 'false') return '';
      if (node.nodeName === 'BR') return '\n';
      const text = [...node.childNodes].map(child => read(child,depth+1)).join('');
      return ['DIV','P','LI'].includes(node.nodeName) && !text.endsWith('\n') ? text+'\n' : text;
    };
    const nodes = [...editor.childNodes], value = nodes.map(node => read(node)).join('');
    return ['DIV','P','LI'].includes(nodes.at(-1)?.nodeName) ? value.replace(/\n$/,'') : value;
  };
  const syncEditor = editor => {
    const form = editor.closest('form[data-ws-edit-form]');
    if (!form) return editor.textContent;
    const code = form.hasAttribute('data-workspace-code');
    const value = code ? codeText(editor) : safeRich(editor);
    form.querySelector('input[data-ws-content-value]').value = value;
    return value;
  };
  root.querySelectorAll('[data-workspace-rich]').forEach(syncEditor);
  const editError = (editor,message) => { const error=editor.closest('form[data-ws-edit-form]')?.querySelector('[data-ws-edit-error]');if(error)error.textContent=message;editor.setAttribute('aria-invalid','true'); };
  const validateEditor = event => {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || !form.matches('[data-ws-edit-form]')) return;
    const editor = form.querySelector('[data-workspace-rich]');
    const field=form.querySelector('[data-ws-content-value]');
    if (!editor) { const current=syncBlockForm(form); if(form.dataset.wsRequired==='true'&&!current.trim()){event.preventDefault();event.stopImmediatePropagation();const error=form.querySelector('[data-ws-edit-error]');if(error)error.textContent='Enter content before submitting.';} return; }
    try { syncEditor(editor); } catch (error) { event.preventDefault(); event.stopImmediatePropagation(); editError(editor,error.message); editor.focus(); return; }
    const current = form.hasAttribute('data-workspace-code') ? field.value : editor.textContent;
    const missing = form.dataset.wsRequired === 'true' && !current.trim();
    if (missing || editor.contentEditable === 'false') {
      event.preventDefault(); event.stopImmediatePropagation();
      if (missing) { editError(editor,'Enter content before submitting.'); editor.focus(); }
    }
  };
  // Capture runs before the base form dispatcher reads FormData.
  onRoot('submit',validateEditor,true);
  const refreshWords = node => { const output = node.parentElement.querySelector('[data-workspace-word-count]'); if (output) output.textContent = node.textContent.trim().split(/\s+/).filter(Boolean).length + ' words'; };
  root.querySelectorAll('[data-workspace-rich]').forEach(refreshWords);
  const selectedTemplate=root.querySelector('[data-ws-template][aria-selected="true"]'); if (selectedTemplate) selectTemplate(selectedTemplate);
  filterTemplates();
  const trackSelection = () => {
    const selection = document.getSelection();
    if (!selection?.rangeCount) return;
    const range = selection.getRangeAt(0), editor = root.querySelector('[data-workspace-rich]');
    if (!editor || !editor.contains(range.commonAncestorContainer)) return;
    selectedRange = range.cloneRange();
    if (chapter === 'editor') {
      const before = document.createRange();before.selectNodeContents(editor);before.setEnd(range.endContainer,range.endOffset);
      const fragment = before.cloneContents();fragment.querySelectorAll('[aria-hidden="true"]').forEach(node=>node.remove());
      const prefix = codeText(fragment), parts = prefix.split('\n'), position = {line:parts.length,column:parts.at(-1).length+1};
      const output=root.querySelector('[data-workspace-cursor]');if(output)output.textContent='Ln '+position.line+', Col '+position.column;
      change({name:'cursor',value:position});
    }
  };
  document.addEventListener('selectionchange',trackSelection,{signal:lifecycle.signal});
  onRoot('pointerdown',event=>{if(event.target.closest('[data-ws-format]'))event.preventDefault();});
  const search = input => {
    const rows = [...root.querySelectorAll('[data-ws-search-row]')];
    const term = input.value.toLocaleLowerCase();
    rows.forEach(row => { row.hidden = !row.textContent.toLocaleLowerCase().includes(term); });
    root.querySelector('[data-ws-search-count]').textContent = rows.filter(row => !row.hidden).length + ' results';
  };
  root.querySelectorAll('input[data-ws-search]').forEach(search);
  root.querySelectorAll('[data-ws-process-list]').forEach(updateProcessSelection);
  if(root.querySelector('[data-ws-log-viewer]'))filterLogs();
  root.querySelectorAll('[data-ws-log-viewer]').forEach(filterLogs);
  updateCommitCount();
  const filterConsole = () => {
    const term = root.querySelector('[data-ws-console-filter]')?.value.toLocaleLowerCase() || '';
    const level = root.querySelector('[data-ws-console-level][aria-pressed="true"]')?.dataset.wsConsoleLevel || 'all';
    root.querySelectorAll('[data-ws-console-entry]').forEach(entry => { entry.hidden = (level !== 'all' && entry.dataset.severity !== level) || (Boolean(term) && !entry.textContent.toLocaleLowerCase().includes(term)); });
  };
  const appendConsoleCommand = expression => {
    const history = root.querySelector('[data-ws-console-history]'); if (!history || !expression.trim()) return;
    const item = document.createElement('li'); item.dataset.wsConsoleEntry = ''; item.dataset.severity = 'input'; item.dataset.wsConsoleCommand = expression;
    const kind = document.createElement('strong'); kind.textContent = 'input'; const code = document.createElement('code'); code.textContent = expression;
    item.append(kind, code); history.append(item); root.querySelector('[data-ws-console-status]').textContent = 'Sent to host.';
  };
  const todoCount = () => { const boxes = [...root.querySelectorAll('input[data-ws-todo]')],done=boxes.filter(box => box.checked).length; const output = root.querySelector('[data-ws-todo-count]'),progress=root.querySelector('[data-ws-todo-progress]'); if (output) output.textContent = done + ' / ' + boxes.length + ' completed';if(progress)progress.value=done;boxes.forEach(box=>box.closest('[data-ws-todo-row]')?.toggleAttribute('data-ws-todo-done',box.checked)); };
  const layoutProfile = () => { const frames=[...root.querySelectorAll('[data-ws-flame-frame]')],total=Math.max(1,...frames.map(frame=>Number(frame.dataset.samples)||0));frames.forEach(frame=>{const start=Number(frame.dataset.start)||0,end=Number(frame.dataset.end)||Number(frame.dataset.samples)||0;frame.style.setProperty('--ws-top',((Number(frame.dataset.depth)||0)*20)+'px');frame.style.setProperty('--ws-start',(start/total*100)+'%');frame.style.setProperty('--ws-width',(Math.max(4,(end-start)/total*100))+'%');});const spans=[...root.querySelectorAll('[data-ws-timeline-span]')],extent=Math.max(1,...spans.map(span=>Number(span.dataset.end)||0));spans.forEach(span=>{span.style.setProperty('--ws-start',(Number(span.dataset.start)/extent*100)+'%');span.style.setProperty('--ws-width',(Math.max(3,(Number(span.dataset.end)-Number(span.dataset.start))/extent*100))+'%');});const falls=[...root.querySelectorAll('[data-ws-waterfall]')],waterfall=Math.max(1,...falls.map(node=>(Number(node.dataset.start)||0)+(Number(node.dataset.duration)||0)));falls.forEach(node=>{node.style.setProperty('--ws-start',(Number(node.dataset.start)/waterfall*100)+'%');node.style.setProperty('--ws-width',(Math.max(4,Number(node.dataset.duration)/waterfall*100))+'%');}); };
  layoutProfile();
  const syncBlockForm = form => { const field=form?.querySelector('[data-ws-content-value]');if(field)field.value=[...form.querySelectorAll('[data-ws-block-content]')].map(node=>node.textContent).join('\n');return field?.value||''; };
  root.querySelectorAll('[data-ws-block-form]').forEach(syncBlockForm);
  let draggedTodo;
  todoCount();
  const redisSearch = input => {
    const term = input.value.toLocaleLowerCase();
    root.querySelectorAll('[data-ws-redis-entry]').forEach(entry => { entry.hidden = Boolean(term) && !entry.dataset.key.toLocaleLowerCase().includes(term); });
  };
  root.querySelectorAll('input[data-ws-redis-search]').forEach(redisSearch);
  const hostOutput = event => {
    const form = root.querySelector('form[data-ws-graphql],form[data-ws-regex]');
    const output = form?.querySelector('[data-ws-host-result]');
    if (!form || !output || event.detail?.action !== form.dataset.elySubmit) return;
    let text;
    if (event.type === 'ely:error') text = event.detail.error?.message || String(event.detail.error || 'Host operation failed.');
    else {
      if (!Object.hasOwn(event.detail, 'result')) return;
      try { text = typeof event.detail.result === 'string' ? event.detail.result : JSON.stringify(event.detail.result); } catch { text = 'Host result could not be displayed.'; }
    }
    output.textContent = String(text).slice(0, 10000);
    output.dataset.wsResultState = event.type === 'ely:error' ? 'error' : 'result';
    output.hidden = false;
  };
  onRoot('ely:result',hostOutput);
  onRoot('ely:error',hostOutput);
  onRoot('dragstart', event => { const row=event.target.closest('[data-ws-todo-row]');if(row&&!root.querySelector('[data-ws-checklist]')?.hasAttribute('data-ws-disabled'))draggedTodo=row; });
  onRoot('dragover', event => { if(draggedTodo&&event.target.closest('[data-ws-todo-row]'))event.preventDefault(); });
  onRoot('drop', event => { const target=event.target.closest('[data-ws-todo-row]');if(!draggedTodo||!target||target===draggedTodo)return;event.preventDefault();target.parentElement.insertBefore(draggedTodo,target);change({name:'todoOrder',value:[...target.parentElement.querySelectorAll('[data-ws-todo]')].map(box=>box.value)});draggedTodo=undefined; });
  onRoot('click', event => {
    const format = event.target.closest('[data-ws-format]');
    if (format && !format.disabled) {
      const editor=root.querySelector('[data-workspace-rich]'), range=selectedRange, formatName=format.dataset.wsFormat;
      if (!range || range.collapsed || !editor?.contains(range.commonAncestorContainer)) { if (editor) editError(editor,'Select text before formatting.'); }
      else {
        const tagByFormat={strong:'strong',em:'em',code:'code',heading:'h2',quote:'blockquote',link:'a'};
        const tag=tagByFormat[formatName];
        if (formatName==='bullet-list') { const list=document.createElement('ul'),item=document.createElement('li');item.append(range.extractContents());list.append(item);range.insertNode(list);selectedRange=document.createRange();selectedRange.selectNodeContents(item); }
        else if (tag) { const node=document.createElement(tag);if(tag==='a')node.setAttribute('href','#');node.append(range.extractContents());range.insertNode(node);selectedRange=document.createRange();selectedRange.selectNodeContents(node); }
        if (selectedRange) { const selection=document.getSelection();selection.removeAllRanges();selection.addRange(selectedRange);editor.dispatchEvent(new Event('input',{bubbles:true}));change({name:'format',value:formatName}); }
      }
    }
    const block = event.target.closest('[data-ws-insert-block]');
    if (block && !block.disabled) {
      const blockEditor=root.querySelector('[data-ws-block-editor]');
      if (blockEditor) { const list=blockEditor.querySelector('[data-ws-block-list]');const article=document.createElement('article'),handle=document.createElement('button'),menu=document.createElement('button'),content=document.createElement('div');article.dataset.wsBlock='';article.dataset.blockKind=block.dataset.wsInsertBlock||'paragraph';handle.type='button';handle.dataset.wsBlockHandle='';handle.setAttribute('aria-label','Move '+article.dataset.blockKind);handle.textContent='⠿';menu.type='button';menu.dataset.wsBlockMenu='';menu.setAttribute('aria-haspopup','menu');menu.textContent='•••';content.contentEditable='true';content.dataset.wsBlockContent='';content.textContent=block.dataset.blockText||'New block';article.append(handle,menu,content);list.append(article);syncBlockForm(blockEditor);blockEditor.querySelector('[data-ws-slash-menu]').hidden=true;content.focus();change({name:'block',value:{type:article.dataset.blockKind,text:content.textContent}}); }
      else { const editor=root.querySelector('[data-workspace-rich]');if(editor){const tag=['p','h2','blockquote','pre'].includes(block.dataset.wsInsertBlock)?block.dataset.wsInsertBlock:'p';const node=document.createElement(tag);node.textContent=block.dataset.blockText;editor.append(node);editor.dispatchEvent(new Event('input',{bubbles:true}));change({name:'block',value:{id:block.dataset.blockId,type:tag,text:node.textContent}});}}
    }
    const templateCategory=event.target.closest('[data-ws-template-category]');
    if(templateCategory&&!templateCategory.disabled){root.querySelectorAll('[data-ws-template-category]').forEach(node=>node.setAttribute('aria-pressed',String(node===templateCategory)));filterTemplates();change({name:'templateCategory',value:templateCategory.dataset.wsTemplateCategory});}
    const template=event.target.closest('[data-ws-template]');
    if(template && root.contains(template) && !template.hidden) selectTemplate(template);
    const completion=event.target.closest('[data-ws-complete]');
    if(completion && !completion.disabled){selectCompletion(completion.closest('[data-ws-candidate]'));const source=root.querySelector('textarea[data-ws-completion-source]');source.setRangeText(completion.dataset.insert,source.selectionStart,source.selectionEnd,'end');root.querySelector('[data-ws-completion-status]').textContent='Inserted '+completion.textContent;emit(root,'select-completion',{candidate:completion.dataset.wsComplete,insertText:completion.dataset.insert,source:source.value});change({name:'source',value:source.value});}
    const actionToggle=event.target.closest('[data-ws-code-action-toggle]');
    if(actionToggle && !actionToggle.disabled){const menu=root.querySelector('#'+CSS.escape(actionToggle.getAttribute('aria-controls'))),open=actionToggle.getAttribute('aria-expanded')!=='true';actionToggle.setAttribute('aria-expanded',String(open));menu.hidden=!open;change({name:'codeActionsOpen',value:open});}
    const diffLayout=event.target.closest('[data-ws-diff-layout-option]');
    if(diffLayout && !diffLayout.disabled){root.querySelectorAll('[data-ws-diff-layout-option]').forEach(node=>node.setAttribute('aria-pressed',String(node===diffLayout)));emit(root,'set-diff-layout',{layout:diffLayout.dataset.wsDiffLayoutOption});change({name:'diffLayout',value:diffLayout.dataset.wsDiffLayoutOption});}
    const whitespaceMode=event.target.closest('[data-ws-whitespace-mode]');
    if(whitespaceMode && !whitespaceMode.disabled){root.querySelectorAll('[data-ws-whitespace-mode]').forEach(node=>node.setAttribute('aria-pressed',String(node===whitespaceMode)));root.querySelector('[data-ws-whitespace-renderer]')?.setAttribute('data-ws-whitespace-mode',whitespaceMode.dataset.wsWhitespaceMode);change({name:'whitespaceMode',value:whitespaceMode.dataset.wsWhitespaceMode});}
    const branchOpen=event.target.closest('[data-ws-branch-open]');
    if(branchOpen&&!branchOpen.disabled){const dialog=root.querySelector('[data-ws-branch-dialog]');dialog.showModal?.();if(!dialog.open)dialog.setAttribute('open','');dialog.querySelector('[data-ws-branch-filter]')?.focus();}
    const branchClose=event.target.closest('[data-ws-branch-close]');
    if(branchClose){const dialog=branchClose.closest('[data-ws-branch-dialog]');dialog.close?.();dialog.removeAttribute('open');root.querySelector('[data-ws-branch-open]')?.focus();}
    const branchPick=event.target.closest('[data-ws-branch-pick]');
    if(branchPick&&!branchPick.disabled){root.querySelectorAll('[data-ws-branch-pick]').forEach(node=>node.setAttribute('aria-selected',String(node===branchPick)));root.querySelector('[data-ws-branch-label]').textContent=branchPick.dataset.wsBranchPick;emit(root,'switch-branch',{branch:branchPick.dataset.wsBranchPick});change({name:'branch',value:branchPick.dataset.wsBranchPick});const dialog=branchPick.closest('dialog');dialog?.close?.();dialog?.removeAttribute('open');}
    const blameRow=event.target.closest('[data-ws-blame-row]');
    if(blameRow&&!blameRow.disabled){root.querySelectorAll('[data-ws-blame-row]').forEach(row=>row.setAttribute('aria-selected',String(row===blameRow)));root.querySelector('[data-ws-blame-status]').textContent='Selected '+blameRow.dataset.commit;emit(root,'select-blame-commit',{commit:blameRow.dataset.commit});change({name:'blame',value:blameRow.dataset.commit});}
    const debugAction=event.target.closest('[data-ws-debug-toolbar] [data-ely-action]');
    if(debugAction&&!debugAction.disabled){root.querySelector('[data-ws-debug-request]').textContent='Requested '+debugAction.textContent+'.';change({name:'debugCommand',value:debugAction.dataset.elyAction});}
    const stackFrame=event.target.closest('[data-ws-stack-select]');
    if(stackFrame&&!stackFrame.disabled)emit(root,'select-stack-frame',{frame:stackFrame.dataset.value});
    const commandFold=event.target.closest('[data-ws-command-fold]');
    if(commandFold&&!commandFold.disabled){const output=root.querySelector('[data-ws-command-output]'),expanded=commandFold.getAttribute('aria-expanded')!=='true';commandFold.setAttribute('aria-expanded',String(expanded));commandFold.textContent=expanded?'Hide output':'Show output';output.hidden=!expanded;change({name:'commandOutput',value:expanded});}
    const diffUnfold=event.target.closest('[data-ws-diff-unfold]');
    if(diffUnfold&&!diffUnfold.disabled){const hunk=diffUnfold.closest('[data-ws-diff-hunk]');hunk.querySelector('.ely-workspace__diff').hidden=false;diffUnfold.setAttribute('aria-expanded','true');diffUnfold.hidden=true;change({name:'diffHunk',value:diffUnfold.dataset.wsDiffUnfold});}
    const changeAction=event.target.closest('[data-ws-change-action]');
    if(changeAction&&!changeAction.disabled){const row=changeAction.closest('[data-ws-change]'),operation=changeAction.dataset.wsChangeAction,path=row.dataset.path;if(operation==='stage'||operation==='unstage'){const staged=operation==='stage';row.dataset.staged=String(staged);row.querySelector('[data-ws-change-action="'+operation+'"]').textContent=staged?'Unstage':'Stage';row.querySelector('[data-ws-change-action="'+operation+'"]').dataset.wsChangeAction=staged?'unstage':'stage';const destination=root.querySelector('[data-ws-change-list="'+(staged?'staged':'unstaged')+'"]');destination.append(row);updateCommitCount();emit(root,staged?'stage-change':'unstage-change',{path});}else if(operation==='discard'){row.dataset.wsDiscarded='true';row.hidden=true;emit(root,'discard-change',{path});}else emit(root,'open-change',{path});change({name:'change',value:{path,operation}});}
    const stageAll=event.target.closest('[data-ws-stage-all]');
    if(stageAll&&!stageAll.disabled){const staged=stageAll.dataset.wsStageAll==='true';root.querySelectorAll('[data-ws-change][data-staged="'+(!staged)+'"]').forEach(row=>{row.dataset.staged=String(staged);const button=row.querySelector('[data-ws-change-action="'+(staged?'stage':'unstage')+'"]');if(button){button.dataset.wsChangeAction=staged?'unstage':'stage';button.textContent=staged?'Unstage':'Stage';}root.querySelector('[data-ws-change-list="'+(staged?'staged':'unstaged')+'"]').append(row);});updateCommitCount();emit(root,staged?'stage-all-changes':'unstage-all-changes',{});}
    const consoleLevel=event.target.closest('[data-ws-console-level]');
    if(consoleLevel&&!consoleLevel.disabled){root.querySelectorAll('[data-ws-console-level]').forEach(node=>node.setAttribute('aria-pressed',String(node===consoleLevel)));filterConsole();change({name:'consoleLevel',value:consoleLevel.dataset.wsConsoleLevel});}
    const settingsGroup=event.target.closest('[data-ws-settings-group]');
    if(settingsGroup&&!settingsGroup.disabled){root.querySelectorAll('[data-ws-settings-group]').forEach(node=>node.setAttribute('aria-pressed',String(node===settingsGroup)));root.querySelectorAll('[data-ws-settings-section]').forEach(section=>{section.hidden=section.dataset.wsSettingsSection!==settingsGroup.dataset.wsSettingsGroup;});change({name:'settingsSection',value:settingsGroup.dataset.wsSettingsGroup});}
    const problemFilter=event.target.closest('[data-ws-problem-filter]');
    if(problemFilter&&!problemFilter.disabled){const severity=problemFilter.dataset.wsProblemFilter;root.querySelectorAll('[data-ws-problem-filter]').forEach(node=>node.setAttribute('aria-pressed',String(node===problemFilter)));root.querySelectorAll('[data-ws-problem]').forEach(row=>row.hidden=severity!=='all'&&row.dataset.severity!==severity);change({name:'problemFilter',value:severity});}
    const findOption=event.target.closest('[data-ws-find-option]');
    if(findOption&&!findOption.disabled){const active=findOption.getAttribute('aria-pressed')!=='true';findOption.setAttribute('aria-pressed',String(active));change({name:'findOption',value:findOption.dataset.wsFindOption,active});}
    const findStep=event.target.closest('[data-ws-find-prev],[data-ws-find-next]');
    if(findStep&&!findStep.disabled){emit(root,'step-find',{forward:findStep.matches('[data-ws-find-next]')});}
    const focus=event.target.closest('[data-ws-focus-toggle]');
    if(focus && !focus.disabled){const active=focus.getAttribute('aria-pressed')!=='true';focus.setAttribute('aria-pressed',String(active));root.querySelector('[data-ws-focus]').dataset.focused=String(active);root.querySelectorAll('[data-ws-focus-chrome]').forEach(node=>node.hidden=active);if(active)root.querySelector('[data-ws-focus-content]').focus();change({name:'focus',value:active});}
    const mode=event.target.closest('[data-ws-canvas-mode]');
    if(mode && !mode.disabled){canvasMode=mode.dataset.wsCanvasMode;root.querySelectorAll('[data-ws-canvas-mode]').forEach(button=>button.setAttribute('aria-pressed',String(button===mode)));change({name:'canvasMode',value:canvasMode});}
    const tool=event.target.closest('button[data-ws-tool]');
    if(tool&&!tool.disabled){root.querySelectorAll('button[data-ws-tool]').forEach(button=>button.setAttribute('aria-pressed',String(button===tool)));root.querySelector('[data-ws-tool-label]').textContent=tool.dataset.wsTool;root.dataset.workspaceTool=tool.dataset.wsTool;emit(root,'select-canvas-tool',{tool:tool.dataset.wsTool});change({name:'tool',value:tool.dataset.wsTool});}
    const canvasMap=event.target.closest('[data-ws-canvas-minimap]');
    if(canvasMap&&!canvasMap.disabled){pan={x:0,y:0};transformStage();emit(root,'navigate-canvas-minimap',{x:0,y:0});change({name:'pan',value:{...pan}});}
    const cancel = event.target.closest('[data-ws-rename-cancel]');
    if (cancel && !cancel.disabled) { cancel.form.reset(); root.querySelector('[data-ws-status]').textContent = 'Edit canceled'; }
    const selectDocumentPage = index => { const pages=[...root.querySelectorAll('[data-ws-page]')],next=Math.max(0,Math.min(pages.length-1,index));pages.forEach((node,i)=>node.setAttribute('aria-selected',String(i===next)));root.querySelectorAll('[data-ws-page-content]').forEach(node=>node.hidden=Number(node.dataset.wsPageContent)!==next);const count=root.querySelector('[data-ws-viewer-count]');if(count)count.textContent=(next+1)+' of '+pages.length;emit(root,'select-document-page',{page:next}); };
    const page = event.target.closest('[data-ws-page]');
    if (page && !page.disabled) selectDocumentPage(Number(page.dataset.wsPage));
    const previous=event.target.closest('[data-ws-viewer-prev]'),next=event.target.closest('[data-ws-viewer-next]');if(previous||next){const active=[...root.querySelectorAll('[data-ws-page]')].findIndex(node=>node.getAttribute('aria-selected')==='true');selectDocumentPage(active+(next?1:-1));}
    const viewerZoom=event.target.closest('[data-ws-viewer-zoom]'),fit=event.target.closest('[data-ws-viewer-fit]');if(viewerZoom||fit){const output=root.querySelector('[data-ws-viewer-zoom-output]'),stage=root.querySelector('[data-ws-page-stage]');const current=Number.parseInt(output?.textContent)||100,value=fit?100:Math.max(50,Math.min(200,current+(viewerZoom.dataset.wsViewerZoom==='in'?10:-10)));if(output)output.textContent=value+'%';if(stage)stage.style.setProperty('--ws-viewer-zoom',String(value/100));change({name:'zoom',value});}
    const contents=event.target.closest('[data-ws-epub-contents]');if(contents){const nav=root.querySelector('[data-ws-epub-nav]'),open=contents.getAttribute('aria-pressed')!=='true';contents.setAttribute('aria-pressed',String(open));nav.hidden=!open;}
    const selectChapter=index=>{const chapters=[...root.querySelectorAll('[data-ws-epub-chapter]')],next=Math.max(0,Math.min(chapters.length-1,index));chapters.forEach((node,i)=>node.setAttribute('aria-selected',String(i===next)));root.querySelectorAll('[data-ws-epub-content]').forEach(node=>node.hidden=Number(node.dataset.wsEpubContent)!==next);root.querySelector('[data-ws-epub-position]').textContent=(next+1)+' of '+chapters.length;change({name:'chapter',value:next});};
    const chapter=event.target.closest('[data-ws-epub-chapter]');if(chapter)selectChapter(Number(chapter.dataset.wsEpubChapter));const epubNext=event.target.closest('[data-ws-epub-next]'),epubPrev=event.target.closest('[data-ws-epub-prev]');if(epubNext||epubPrev){const active=[...root.querySelectorAll('[data-ws-epub-chapter]')].findIndex(node=>node.getAttribute('aria-selected')==='true');selectChapter(active+(epubNext?1:-1));}
    const type=event.target.closest('[data-ws-epub-size]');if(type){const reading=root.querySelector('[data-ws-epub-reading]'),size=Number(reading.dataset.wsEpubSize||1)+(type.dataset.wsEpubSize==='up'?.1:-.1);reading.dataset.wsEpubSize=String(Math.max(.8,Math.min(1.4,size)));reading.style.fontSize=reading.dataset.wsEpubSize+'em';}
    const printThumb=event.target.closest('[data-ws-print-thumb]');if(printThumb){root.querySelectorAll('[data-ws-print-thumb]').forEach(node=>node.setAttribute('aria-selected',String(node===printThumb)));root.querySelectorAll('[data-ws-print-page-content]').forEach(node=>node.hidden=node.dataset.wsPrintPageContent!==printThumb.dataset.wsPrintThumb);}
    const editorTool=event.target.closest('[data-ws-editor-tool]');
    if(editorTool&&!editorTool.disabled){const pressed=editorTool.getAttribute('aria-pressed')==='true';editorTool.setAttribute('aria-pressed',String(!pressed));emit(root,'editor-tool',{tool:editorTool.dataset.wsEditorTool,pressed:!pressed});}
    const editorBreadcrumb=event.target.closest('[data-ws-editor-breadcrumb]');
    if(editorBreadcrumb&&!editorBreadcrumb.disabled)emit(root,'open-code-location',{location:editorBreadcrumb.dataset.wsEditorBreadcrumb});
    const fileView=event.target.closest('[data-ws-file-view]');
    if(fileView&&!fileView.disabled){root.querySelectorAll('[data-ws-file-view]').forEach(node=>node.setAttribute('aria-pressed',String(node===fileView)));filePanes(fileView.dataset.wsFileView);emit(root,'set-file-view',{view:fileView.dataset.wsFileView});change({name:'fileView',value:fileView.dataset.wsFileView});}
    const fileBreadcrumb=event.target.closest('[data-ws-file-breadcrumb]');
    if(fileBreadcrumb&&!fileBreadcrumb.disabled)emit(root,'navigate-file-path',{path:fileBreadcrumb.dataset.wsFileBreadcrumb});
    const graphLayout=event.target.closest('[data-ws-graph-layout]');
    if(graphLayout&&!graphLayout.disabled){root.querySelectorAll('[data-ws-graph-layout]').forEach(node=>node.setAttribute('aria-pressed',String(node===graphLayout)));emit(root,'set-graph-layout',{layout:graphLayout.dataset.wsGraphLayout});}
    const graphZoom=event.target.closest('[data-ws-graph-zoom]');
    if(graphZoom&&!graphZoom.disabled)setGraphZoom(graphZoom.dataset.wsGraphZoom==='in'?10:-10);
    const schemaField=event.target.closest('[data-ws-schema-field]');
    if(schemaField&&!schemaField.disabled)emit(root,'insert-graphql-field',{field:schemaField.dataset.wsSchemaField});
    const queryHistory=event.target.closest('[data-ws-query-history]');
    if(queryHistory&&!queryHistory.disabled){const editor=root.querySelector('[data-workspace-code] [data-workspace-rich]'),query=queryHistory.dataset.query||'';if(editor){editor.replaceChildren(document.createTextNode(query));syncEditor(editor);editor.dispatchEvent(new Event('input',{bubbles:true}));const field=editor.closest('[data-workspace-code]')?.querySelector('[data-ws-content-value]');if(field)field.value=query;editor.focus();}emit(root,'rerun-query',{historyId:queryHistory.dataset.wsQueryHistory,query});}
    const planStep=event.target.closest('[data-ws-plan-step]');
    if(planStep&&!planStep.disabled)emit(root,'select-query-plan-step',{step:planStep.dataset.wsPlanStep});
    const fold=event.target.closest('[data-ws-fold]');
    if(fold&&!fold.disabled){const line=fold.closest('[data-ws-code-line]'),folded=fold.getAttribute('aria-expanded')==='true';fold.setAttribute('aria-expanded',String(!folded));fold.textContent=folded?'+':'−';line.dataset.wsFolded=String(folded);emit(root,'toggle-code-fold',{line:line.dataset.wsCodeLine,folded});}
    const lens=event.target.closest('[data-ws-code-lens]');
    if(lens&&!lens.disabled)emit(root,'run-code-lens',{lens:lens.dataset.wsCodeLens});
    const autoLayout=event.target.closest('[data-ws-canvas-autolayout]');
    if(autoLayout&&!autoLayout.disabled)emit(root,'request-canvas-layout',{});
    const undo=event.target.closest('[data-ws-canvas-undo]');
    if(undo&&!undo.disabled)restoreShape();
    const revision = event.target.closest('[data-ws-revision]');
    if (revision && !revision.disabled) { root.querySelectorAll('[data-ws-revision]').forEach(node=>node.setAttribute('aria-selected',String(node===revision))); root.querySelectorAll('[data-ws-revision-content]').forEach(node => { node.hidden = node.dataset.wsRevisionContent !== revision.dataset.wsRevision; }); change({name: 'revision', value: revision.textContent.trim()}); }
    const historyTab = event.target.closest('[data-ws-history-tab]');
    if (historyTab && !historyTab.disabled) { root.querySelectorAll('[data-ws-history-tab]').forEach(node=>node.setAttribute('aria-selected',String(node===historyTab))); root.querySelectorAll('[data-ws-history-panel]').forEach(node=>{node.hidden=node.dataset.wsHistoryPanel!==historyTab.dataset.wsHistoryTab;}); change({name:'historyView',value:historyTab.dataset.wsHistoryTab}); }
    const select = event.target.closest('[data-workspace-select]');
    if (select && root.contains(select)) { root.querySelectorAll('[data-workspace-select]').forEach(node => node.setAttribute(node.matches('tr') ? 'aria-selected' : 'aria-pressed', String(node === select))); change({name: 'selection', value: select.dataset.value || select.textContent.trim()}); }
    const history = event.target.closest('[data-workspace-history]');
    if (history && root.contains(history)) { const command = root.querySelector('[data-workspace-terminal] input[name="command"]'); if (command) { command.value = history.value; command.focus(); change({name: 'command', value: command.value}); } }
    const tree = event.target.closest('[data-workspace-tree]');
    if (tree && root.contains(tree)) { if(root.dataset.elyComponent.startsWith('files/'))root.querySelectorAll('[data-workspace-tree]').forEach(node=>node.setAttribute('aria-current',String(node===tree))); const child = tree.parentElement.querySelector(':scope > ul'); if (child) { const expanded = tree.getAttribute('aria-expanded') !== 'true'; tree.setAttribute('aria-expanded', String(expanded)); child.hidden = !expanded; const icon=tree.querySelector('[data-ws-file-icon]');if(icon){icon.dataset.open=String(expanded);paintFileIcons(tree);} } emit(root,'navigate-workspace-tree',{value:tree.dataset.value});change({name: 'file', value: tree.dataset.value}); }
    const redisKey = event.target.closest('[data-ws-redis-key]');
    if (redisKey && !redisKey.disabled && root.contains(redisKey)) { root.querySelectorAll('[data-ws-redis-key]').forEach(node => node.setAttribute('aria-pressed', String(node === redisKey))); const preview = root.querySelector('[data-ws-redis-preview]'); if (preview) preview.textContent = redisKey.dataset.preview || ''; emit(root, 'select-redis-key', {key: redisKey.dataset.key, preview: redisKey.dataset.preview || ''}); change({name: 'redis-key', value: redisKey.dataset.key}); }
    const zoom = event.target.closest('button[data-workspace-zoom]');
    if (zoom && !zoom.disabled && root.contains(zoom)) { const output = zoom.parentElement.querySelector('output[data-workspace-zoom]'); const value = Math.max(50, Math.min(200, Number.parseInt(output.textContent, 10) + (zoom.dataset.workspaceZoom === 'in' ? 10 : -10))); output.textContent = value + '%'; transformStage(); change({name: 'zoom', value}); }
    const shareOpen = event.target.closest('[data-ws-share-open]');
    if (shareOpen && !shareOpen.disabled) { const dialog = root.querySelector('[data-ws-share-dialog]'); dialog.showModal?.(); if (!dialog.open) dialog.setAttribute('open', ''); dialog.querySelector('button').focus(); }
    const shareClose = event.target.closest('[data-ws-share-close]');
    if (shareClose) { const dialog = shareClose.closest('dialog'); dialog.close?.(); dialog.removeAttribute('open'); root.querySelector('[data-ws-share-open]')?.focus(); }
    const shareDialog = event.target.closest('[data-ws-share-dialog]');
    if (shareDialog && event.target === shareDialog) { shareDialog.close?.(); shareDialog.removeAttribute('open'); root.querySelector('[data-ws-share-open]')?.focus(); }
    const fileItem = event.target.closest('[data-ws-file-grid-item]');
    if (fileItem && root.contains(fileItem) && fileGrid?.getAttribute('aria-disabled') !== 'true') { selectFile(fileItem); fileItem.focus(); }
    const filePreviewClose = event.target.closest('[data-ws-file-preview-close]');
    if (filePreviewClose) { const dialog=filePreviewClose.closest('dialog');dialog.close?.();dialog.removeAttribute('open');fileGrid?.focus(); }
    if (filePreview && event.target === filePreview) { filePreview.close?.();filePreview.removeAttribute('open');fileGrid?.focus(); }
    const shareRemove=event.target.closest('[data-ws-share-remove]');
    if(shareRemove&&!shareRemove.disabled)emit(root,'remove-share-member',{member:shareRemove.value});
  });
  const selectNetworkRequest = row => {
    root.querySelectorAll('[data-ws-network-row]').forEach(node => node.setAttribute('aria-selected', String(node === row)));
    root.querySelectorAll('[data-ws-network-detail-panel]').forEach(panel => { panel.hidden = panel.dataset.wsNetworkDetailPanel !== row.dataset.requestIndex; });
    emit(root, 'select-network-request', {request: Number(row.dataset.requestIndex), url: row.dataset.url});
    change({name: 'networkRequest', value: row.dataset.url});
  };
  onRoot('click', event => {
    const byte = event.target.closest('[data-ws-hex-byte]');
    if (byte && !byte.disabled) {
      root.querySelectorAll('[data-ws-hex-byte]').forEach(node => node.setAttribute('aria-pressed', String(node === byte)));
      const reading = root.querySelector('[data-ws-hex-reading]'); if (reading) reading.textContent = byte.dataset.reading || '';
      emit(root, 'select-memory-byte', {index: Number(byte.dataset.index), reading: byte.dataset.reading || ''});
      change({name: 'memoryByte', value: Number(byte.dataset.index)});
    }
    const network = event.target.closest('[data-ws-network-select], [data-ws-network-row]');
    if (network && !network.disabled) { const row = network.closest('[data-ws-network-row]'); if (row) selectNetworkRequest(row); }
    const frame = event.target.closest('[data-ws-flame-frame]');
    if (frame && !frame.disabled) {
      root.querySelectorAll('[data-ws-flame-frame]').forEach(node => node.setAttribute('aria-pressed', String(node === frame)));
      const reading = root.querySelector('[data-ws-profile-reading]'); if (reading) reading.textContent = frame.querySelector('strong')?.textContent + ' · ' + frame.dataset.samples + ' samples';
      emit(root, 'select-profile-frame', {frame: frame.dataset.frame, samples: Number(frame.dataset.samples)});
      change({name: 'profileFrame', value: frame.dataset.frame});
    }
    const span = event.target.closest('[data-ws-timeline-span]');
    if (span && !span.disabled) {
      root.querySelectorAll('[data-ws-timeline-span]').forEach(node => node.setAttribute('aria-pressed', String(node === span)));
      emit(root, 'select-timeline-span', {span: span.dataset.span, start: Number(span.dataset.start), end: Number(span.dataset.end)});
      change({name: 'timelineSpan', value: span.dataset.span});
    }
    const reset = event.target.closest('[data-ws-profile-reset]');
    if (reset && !reset.disabled) { root.querySelectorAll('[data-ws-flame-frame],[data-ws-timeline-span]').forEach(node => node.setAttribute('aria-pressed', 'false')); const reading=root.querySelector('[data-ws-profile-reading]'); if(reading)reading.textContent='All samples'; change({name:'profileFrame',value:''}); }
    const removeWatch = event.target.closest('[data-ws-watch-remove]');
    if (removeWatch && !removeWatch.disabled) { removeWatch.closest('[data-ws-watch]')?.remove(); emit(root, 'remove-watch', {expression: removeWatch.value}); change({name: 'watch', value: removeWatch.value, removed: true}); }
  });
  onRoot('toggle', event => { const branch=event.target.closest('[data-ws-variable-branch], [data-ws-variable-scope]'); if(branch) change({name:'variableOpen', value: branch.open, scope: branch.querySelector('summary')?.textContent.trim()}); });
  onRoot('wheel', event => { const timeline=event.target.closest('[data-ws-timeline]'); if(!timeline)return; event.preventDefault(); const output=timeline.querySelector('[data-ws-timeline-range]'); if(output) output.textContent=event.deltaY < 0 ? 'Timeline zoomed in' : 'Timeline zoomed out'; change({name:'timelineZoom',value:event.deltaY < 0 ? 'in' : 'out'}); }, {passive:false});
  onRoot('click', event => {
    const mode=event.target.closest('[data-ws-markdown-mode]');
    if(mode&&!mode.disabled){root.querySelectorAll('[data-ws-markdown-mode]').forEach(node=>node.setAttribute('aria-selected',String(node===mode)));const layout=root.querySelector('[data-ws-markdown-layout]');if(layout)layout.dataset.wsMarkdownLayout=mode.dataset.wsMarkdownMode;change({name:'markdownMode',value:mode.dataset.wsMarkdownMode});}
    const menu=event.target.closest('[data-ws-block-menu]');if(menu&&!menu.disabled){const slash=root.querySelector('[data-ws-slash-menu]');if(slash)slash.hidden=!slash.hidden;}
    const handle=event.target.closest('[data-ws-block-handle]');if(handle&&!handle.disabled){const block=handle.closest('[data-ws-block]');root.querySelectorAll('[data-ws-block]').forEach(node=>node.setAttribute('aria-selected',String(node===block)));change({name:'block',value:block?.dataset.blockId});}
    const move=event.target.closest('[data-ws-todo-move]');if(move&&!move.disabled){const row=move.closest('[data-ws-todo-row]'),list=row?.parentElement;if(row&&list?.firstElementChild!==row){list.prepend(row);change({name:'todoOrder',value:[...list.querySelectorAll('[data-ws-todo]')].map(box=>box.value)});}}
  });
  onRoot('input', event => {
    const target = event.target;
    if(target.matches('input[data-ws-candidate-filter]'))root.querySelectorAll('[data-ws-candidate]').forEach(row=>{row.hidden=!row.textContent.toLocaleLowerCase().includes(target.value.toLocaleLowerCase());});
    if(target.matches('input[data-ws-template-search]'))filterTemplates();
    if(target.matches('input[data-ws-query-filter]'))filterQueryRows(target);
    if(target.matches('input[data-ws-branch-filter]')){filterBranches();change({name:'branchFilter',value:target.value});}
    if(target.matches('input[data-ws-blame-filter]')){const term=target.value.toLocaleLowerCase();root.querySelectorAll('[data-ws-blame-row]').forEach(row=>row.hidden=Boolean(term)&&!row.textContent.toLocaleLowerCase().includes(term));change({name:'blameFilter',value:target.value});}
    if(target.matches('input[data-ws-breakpoint-filter]')){const term=target.value.toLocaleLowerCase();root.querySelectorAll('[data-ws-breakpoint-row]').forEach(row=>row.hidden=Boolean(term)&&!row.textContent.toLocaleLowerCase().includes(term));change({name:'breakpointFilter',value:target.value});}
    if(target.matches('input[data-ws-network-filter]')){const term=target.value.toLocaleLowerCase();root.querySelectorAll('[data-ws-network-row]').forEach(row=>row.hidden=Boolean(term)&&!row.dataset.url.toLocaleLowerCase().includes(term));change({name:'networkFilter',value:target.value});}
    if(target.matches('input[data-ws-process-filter]')){filterProcesses(target);change({name:'processFilter',value:target.value});}
    if (target.matches('input[data-ws-search]')) search(target);
    if(target.matches('input[data-ws-console-filter]')){filterConsole();change({name:'consoleFilter',value:target.value});}
    if(target.matches('input[data-ws-search]')&&root.querySelector('[data-ws-log-viewer]'))filterLogs();
    if(target.matches('input[data-ws-settings-filter]')){const term=target.value.toLowerCase();root.querySelectorAll('[data-ws-setting]').forEach(setting=>setting.hidden=Boolean(term)&&!setting.textContent.toLowerCase().includes(term));root.querySelectorAll('[data-ws-settings-section]').forEach(section=>section.hidden=Boolean(term)&&!section.querySelector('[data-ws-setting]:not([hidden])'));change({name:'settingsFilter',value:target.value});}
    if(target.matches('input[data-ws-setting-input],select[data-ws-setting-input]')){target.closest('[data-ws-setting]').dataset.wsSettingValue=target.value;root.querySelector('[data-ws-settings-status]').textContent='Modified '+target.name;change({name:target.name,value:target.type==='checkbox'?target.checked:target.value});}
    if (target.matches('input[data-ws-redis-search]')) { redisSearch(target); change({name: target.name, value: target.value}); }
    if (target.matches('input[data-ws-color]')) { root.querySelector('[data-ws-color-preview]').setAttribute('fill', target.value); root.querySelector('[data-ws-color-label]').textContent = target.value; colorSpectrum?.style.setProperty('--ws-color', target.value); }
    const editor = target.closest('[data-workspace-rich]');
    if (editor) { try { const value = syncEditor(editor),form=editor.closest('form[data-ws-edit-form]'); refreshWords(editor); editor.removeAttribute('aria-invalid'); form?.querySelector('[data-ws-edit-error]') && (form.querySelector('[data-ws-edit-error]').textContent = ''); change({name: editor.dataset.name, value}); } catch (error) { if(editor.closest('form[data-ws-edit-form]'))editError(editor,error.message); } }
    if(target.matches('[data-ws-document-find]')){const term=target.value.toLocaleLowerCase();root.querySelectorAll('[data-ws-page]').forEach(page=>page.hidden=Boolean(term)&&!root.querySelector('[data-ws-page-content="'+page.dataset.wsPage+'"]').textContent.toLocaleLowerCase().includes(term));change({name:'documentFind',value:target.value});}
    const blockContent=target.closest('[data-ws-block-content]');
    if(blockContent) { const form=blockContent.closest('[data-ws-block-form]');syncBlockForm(form);change({name:'block',value:{id:blockContent.dataset.blockId||'',text:blockContent.textContent}}); }
    if (target.matches('textarea[data-workspace-markdown]')) { const preview=root.querySelector('[data-workspace-markdown-preview]');if(preview)preview.textContent=target.value;const count=root.querySelector('[data-ws-markdown-count]');if(count)count.textContent=target.value.trim().split(/\s+/).filter(Boolean).length+' words'; emit(root, 'preview-markdown', {source: target.value}); change({name: target.name, value: target.value}); }
    if (target.matches('input[data-workspace-find],input[data-workspace-filter]')) { const term = target.value.toLowerCase(); root.querySelectorAll('.ely-workspace__items li,.ely-workspace__tree li').forEach(item => { item.hidden = Boolean(term) && !item.textContent.toLowerCase().includes(term); }); const matches = [...root.querySelectorAll('.ely-workspace__code code')].filter(node => node.textContent.toLowerCase().includes(term)).length; const output = root.querySelector('[data-workspace-match-count]'); if (output) output.textContent = term ? matches + ' matches' : ''; change({name: target.name, value: target.value}); }
    if (target.matches('input[type="file"]')) { const output = root.querySelector('[data-workspace-file-count]'); if (output) output.textContent = target.files.length + ' file(s) selected'; change({name: target.name, files: [...target.files].map(file => ({name: file.name, size: file.size, type: file.type}))}); }
  });
  onRoot('submit', event => { const form=event.target.closest('form[data-ws-console-form]'); if(form && form.checkValidity()){const input=form.querySelector('[data-ws-console-input]');appendConsoleCommand(input.value);consoleHistoryIndex=-1;change({name:'expression',value:input.value});} }, true);
  onRoot('change', event => {
    const target = event.target;
    if (target.disabled) return;
    if(target.matches('[data-ws-library-frames]')){root.querySelectorAll('[data-ws-stack-frame][data-library="true"]').forEach(frame=>frame.hidden=!target.checked);change({name:'libraryFrames',value:target.checked});}
    if(target.matches('[data-ws-process-select]')){updateProcessSelection();change({name:'processes',value:[...root.querySelectorAll('[data-ws-process-select]:checked')].map(node=>node.value)});}
    if(target.matches('[data-ws-process-all]')){root.querySelectorAll('[data-ws-process-select]').forEach(node=>node.checked=target.checked);updateProcessSelection();}
    if(target.matches('[data-ws-log-level]')){filterLogs();change({name:'logLevel',value:target.value});}
    if(target.matches('[data-ws-log-follow]')){root.dataset.wsLogFollow=String(target.checked);change({name:'followLogs',value:target.checked});}
    if(target.matches('[data-ws-commit-amend]')){root.dataset.wsCommitAmend=String(target.checked);change({name:'amend',value:target.checked});}
    if(target.matches('[data-ws-welcome-show]')){root.dataset.wsWelcomeShow=String(target.checked);root.querySelector('[data-ws-welcome-status]').textContent=target.checked?'Welcome page will show at startup.':'Welcome page will stay hidden at startup.';change({name:'showAtStart',value:target.checked});}
    if (chapter==='git' && target.matches('input[name="resolution"]')) { const ours=root.querySelector('[data-ws-merge-side="ours"] pre')?.textContent||'', theirs=root.querySelector('[data-ws-merge-side="theirs"] pre')?.textContent||'', merged=root.querySelector('textarea[name="merged"]'); merged.value=target.value==='theirs'?theirs:target.value==='both'?ours+'\n'+theirs:ours;const status=root.querySelector('[data-ws-merge-status]');if(status)status.textContent='Selected '+target.value+'.';change({name:'merged',value:merged.value}); }
    if (target.matches('input[data-ws-breakpoint]')) emit(root, 'toggle-breakpoint', {breakpoint: target.value, file: target.dataset.file, line: Number(target.dataset.line), enabled: target.checked});
    if (target.matches('input[data-ws-todo]')) todoCount();
    if (target.matches('select[data-ws-branch]')) { root.querySelector('[data-ws-branch-label]').textContent = target.selectedOptions[0]?.textContent || ''; emit(root, 'switch-branch', {branch: target.value}); }
    if (target.matches('select[data-ws-tool]')) { root.querySelector('[data-ws-tool-label]').textContent = target.value; root.dataset.workspaceTool = target.value; }
    if (target.matches('input[data-ws-layer]')) { root.querySelectorAll('[data-workspace-shape]').forEach(shape => { if (shape.dataset.value === target.value) shape.style.display = target.checked ? '' : 'none'; }); change({name: 'layer', value: target.value, visible: target.checked}); }
    if(target.matches('select[data-ws-member-role]'))emit(root,'set-share-role',{member:target.dataset.member,role:target.value});
    if(target.matches('select[data-ws-link-access]'))emit(root,'set-link-access',{role:target.value});
    if (target.matches('input[type="file"]')) { const output = root.querySelector('[data-workspace-file-count]'); if (output) output.textContent = target.files.length + ' file(s) selected'; }
  });
  onRoot('click',event=>{const sort=event.target.closest('[data-ws-query-sort]');if(!sort||sort.disabled)return;const table=sort.closest('table'),column=Number(sort.dataset.wsQuerySort),descending=sort.getAttribute('aria-sort')==='ascending';table.querySelectorAll('[data-ws-query-sort]').forEach(node=>node.setAttribute('aria-sort','none'));sort.setAttribute('aria-sort',descending?'descending':'ascending');const rows=queryRows().sort((a,b)=>a.cells[column].textContent.localeCompare(b.cells[column].textContent,undefined,{numeric:true})*(descending?-1:1));rows.forEach(row=>row.parentElement.append(row));emit(root,'sort-query-results',{column,direction:descending?'descending':'ascending'});});
  onRoot('pointerdown', event => { const shape = event.target.closest('[data-workspace-shape]'); if (!shape || canvasMode==='draw' || canvasDisabled() || !root.contains(shape) || event.button !== 0) return; root.querySelectorAll('[data-workspace-shape]').forEach(node => node.setAttribute('aria-pressed', String(node === shape))); if(canvasMode==='connect'){const port=event.target.closest('[data-ws-port]'),endpoint=port?shape.dataset.value+':'+port.dataset.wsPort:shape.dataset.value;if(connectFrom&&connectFrom!==endpoint){emit(root,'connect-shapes',{from:connectFrom,to:endpoint});connectFrom=undefined;}else connectFrom=endpoint;return;} rememberShape(shape);const point = shape.getAttribute('transform').match(/-?\d+(?:\.\d+)?/g) || [0, 0]; if(event.target.matches('[data-ws-resize-handle]')){const geometry=shapeGeometry(shape);resize={shape,x:event.clientX,y:event.clientY,width:Number(geometry.getAttribute('width')),height:Number(geometry.getAttribute('height'))};}else drag = {shape, x: event.clientX, y: event.clientY, left: Number(point[0]), top: Number(point[1])}; if (event.isTrusted) { try { shape.setPointerCapture?.(event.pointerId); } catch { drag = undefined; resize=undefined; return; } } change({name: 'selection', value: shape.dataset.value}); });
  onRoot('pointermove', event => { if (drag) { const x=Math.round((drag.left+event.clientX-drag.x)/10)*10,y=Math.round((drag.top+event.clientY-drag.y)/10)*10;drag.shape.setAttribute('transform','translate('+x+' '+y+')');change({name:'position',value:{id:drag.shape.dataset.value,x,y}}); } if(resize){const width=Math.max(40,Math.round((resize.width+event.clientX-resize.x)/10)*10),height=Math.max(24,Math.round((resize.height+event.clientY-resize.y)/10)*10);syncShapeGeometry(resize.shape,width,height);change({name:'size',value:{id:resize.shape.dataset.value,width,height}});}});
  onRoot('pointerup', () => { drag = undefined; resize=undefined; });
  onRoot('pointerdown',event=>{
    if(!stage || !stage.contains(event.target) || canvasDisabled() || event.button!==0) return;
    if(canvasMode==='draw') { const point=stagePoint(event);if(!point)return;const line=document.createElementNS('http://www.w3.org/2000/svg','polyline');line.setAttribute('fill','none');line.setAttribute('stroke','currentColor');line.setAttribute('stroke-width','2');root.querySelector('[data-ws-strokes]').append(line);drawing={line,points:[point]};line.setAttribute('points',point.x+','+point.y); }
    else if(!event.target.closest('[data-workspace-shape]'))panning={x:event.clientX,y:event.clientY,left:pan.x,top:pan.y};
    if((drawing || panning) && event.isTrusted){try{stage.setPointerCapture(event.pointerId);}catch{/* A canceled native pointer may no longer be capturable. */}}
  });
  onRoot('pointermove',event=>{
    if(panning){pan={x:panning.left+event.clientX-panning.x,y:panning.top+event.clientY-panning.y};transformStage();change({name:'pan',value:{...pan}});}
    if(drawing && drawing.points.length<5000){const point=stagePoint(event);if(point){drawing.points.push(point);drawing.line.setAttribute('points',drawing.points.map(p=>p.x+','+p.y).join(' '));}}
  });
  onRoot('pointerup',()=>{
    if(drawing){emit(root,'draw-stroke',{points:drawing.points,color:'currentColor',width:2});drawing=undefined;}panning=undefined;
  });
  onRoot('keydown', event => { const input=event.target.closest('[data-ws-console-input]'); if(input&&['ArrowUp','ArrowDown'].includes(event.key)){const commands=[...root.querySelectorAll('[data-ws-console-entry][data-ws-console-command]')].map(node=>node.dataset.wsConsoleCommand).filter(Boolean);if(commands.length){event.preventDefault();consoleHistoryIndex=event.key==='ArrowUp'?Math.min(commands.length-1,consoleHistoryIndex+1):Math.max(-1,consoleHistoryIndex-1);input.value=consoleHistoryIndex<0?'':commands[commands.length-1-consoleHistoryIndex];input.dispatchEvent(new Event('input',{bubbles:true}));}} });
  onRoot('keydown', event => { const list=event.target.closest('[data-ws-completion-list]'); if(!list)return; const rows=completionItems(); if(!rows.length)return; const current=Math.max(0,rows.findIndex(row=>row.getAttribute('aria-selected')==='true')); if(event.key==='Escape'){event.preventDefault();list.closest('[data-ws-completion-popup]')?.setAttribute('hidden','');emit(root,'dismiss-completion',{});return;} if(['ArrowDown','ArrowUp'].includes(event.key)){event.preventDefault();selectCompletion(rows[(current+(event.key==='ArrowDown'?1:rows.length-1))%rows.length]);return;} if(event.key==='Enter'){event.preventDefault();rows[current].querySelector('[data-ws-complete]')?.click();} });
  onRoot('pointercancel',()=>{drag=undefined;resize=undefined;panning=undefined;if(drawing)drawing.line.remove();drawing=undefined;});
  onRoot('keydown', event => { const shape = event.target.closest('[data-workspace-shape]'); if (!shape || canvasDisabled()) return; if(event.key==='Enter'||event.key===' '){event.preventDefault();root.querySelectorAll('[data-workspace-shape]').forEach(node=>node.setAttribute('aria-pressed',String(node===shape)));emit(root,'select-shape',{shape:shape.dataset.value});return;}if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return;event.preventDefault();rememberShape(shape);const delta=event.shiftKey?10:1,axis=['ArrowLeft','ArrowRight'].includes(event.key)?'x':'y',sign=['ArrowLeft','ArrowUp'].includes(event.key)?-1:1;if(event.altKey){const geometry=shapeGeometry(shape),key=axis==='x'?'width':'height',next=Math.max(axis==='x'?40:24,Number(geometry.getAttribute(key))+sign*delta);syncShapeGeometry(shape,axis==='x'?next:Number(geometry.getAttribute('width')),axis==='y'?next:Number(geometry.getAttribute('height')));emit(root,'resize-shape',{shape:shape.dataset.value,[key]:next});}else{const values=shape.getAttribute('transform').match(/-?\d+(?:\.\d+)?/g).map(Number),next=values[axis==='x'?0:1]+sign*delta;values[axis==='x'?0:1]=next;shape.setAttribute('transform','translate('+values[0]+' '+values[1]+')');emit(root,'move-shape',{shape:shape.dataset.value,x:values[0],y:values[1]});} });
  onRoot('keydown',event=>{const list=event.target.closest('[data-ws-completion-list]');if(!list||!['ArrowDown','ArrowUp','Home','End','Enter'].includes(event.key))return;const items=completionItems();if(!items.length)return;event.preventDefault();let item=items.find(node=>node.getAttribute('aria-selected')==='true')||items[0];if(event.key==='ArrowDown')item=items[Math.min(items.length-1,items.indexOf(item)+1)];if(event.key==='ArrowUp')item=items[Math.max(0,items.indexOf(item)-1)];if(event.key==='Home')item=items[0];if(event.key==='End')item=items.at(-1);if(event.key==='Enter')item.querySelector('[data-ws-complete]')?.click();else selectCompletion(item);});
  onRoot('keydown',event=>{if(event.target.matches('[data-workspace-graph] g[data-workspace-select],tr[data-workspace-select]') && ['Enter',' '].includes(event.key)){event.preventDefault();event.target.dispatchEvent(new MouseEvent('click',{bubbles:true}));}const gridItem=event.target.closest('[data-ws-file-grid-item]');if((gridItem||event.target===fileGrid)&&!event.ctrlKey&&!event.metaKey&&!event.altKey&&fileGrid?.getAttribute('aria-disabled')!=='true'&&['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End','Enter',' '].includes(event.key)){const items=fileItems();if(!items.length)return;event.preventDefault();let item=gridItem||items.find(node=>node.getAttribute('aria-selected')==='true');if(!item&&['Enter',' '].includes(event.key))return;item=item||items[0];if(['ArrowRight','ArrowDown','ArrowLeft','ArrowUp','Home','End'].includes(event.key)){const columns=fileGrid.classList.contains('ely-workspace__file-rows')?1:Math.max(1,Math.floor((fileGrid.clientWidth+8)/104));const selected=gridItem||items.find(node=>node.getAttribute('aria-selected')==='true');item=items[fileGridStep(items.indexOf(selected),items.length,columns,event.key)];}if(event.key==='Enter')emit(root,'open-file',{path:item.dataset.path});else if(event.key===' ')previewFile(item);else{selectFile(item);item.focus();}}if(event.key==='Escape'){if(filePreview?.open){event.preventDefault();filePreview.close?.();filePreview.removeAttribute('open');fileGrid?.focus();}else{const dialog=root.querySelector('[data-ws-share-dialog][open]');if(dialog){event.preventDefault();dialog.close?.();dialog.removeAttribute('open');root.querySelector('[data-ws-share-open]')?.focus();}else{const focus=root.querySelector('[data-ws-focus][data-focused="true"]');if(focus){event.preventDefault();focus.querySelector('[data-ws-focus-toggle]')?.click();}else{const rename=event.target.closest('form[data-ws-rename]');if(rename){event.preventDefault();rename.reset();rename.querySelector('[data-ws-status]').textContent='Edit canceled';}}}}}});
  bindWorkspaceSource(root, {on:onRoot, change, emit});
  return () => { lifecycle.abort(); document.removeEventListener('selectionchange',trackSelection); root.removeEventListener('submit',validateEditor,true); root.removeEventListener('ely:result',hostOutput); root.removeEventListener('ely:error',hostOutput); if (reading) reading.removeEventListener('scroll',readingProgress); };
});
