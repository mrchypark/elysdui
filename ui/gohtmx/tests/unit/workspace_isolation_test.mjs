import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

// Exercise production event handlers without a browser or new DOM dependency.
const source = readFileSync(new URL('../../assets/ely-api-workspace.js', import.meta.url), 'utf8');
const fileHandlers = source.slice(source.indexOf("  onRoot('dblclick',event=>{"), source.indexOf("  document.addEventListener('click',event=>{if(fileMenu"));
for (const component of ['documents/PageTree', 'documents/Favorites', 'documents/Pinned', 'files/FolderTree', 'files/FileExplorer']) {
  const handlers = {}, actions = [];
  const leaf = {dataset: {value: 'caller/leaf', folder: 'false'}, parentElement: {querySelector: () => null}};
  const target = {closest: selector => selector.startsWith('[data-workspace-tree]') ? leaf : null};
  const root = {dataset: {elyComponent: component}};
  runInNewContext(fileHandlers, {root, rename: null, fileMenu: null, directory: null, onRoot: (type, handler) => { handlers[type] = handler; }, emit: (_, action, detail) => actions.push({action, ...detail})});
  let prevented = false;
  handlers.keydown({target, key: 'Enter', preventDefault() { prevented = true; }});
  handlers.dblclick({target});
  if (component.startsWith('files/')) {
    assert.equal(prevented, true);
    assert.equal(actions.length, 2);
    actions.forEach(action => { assert.equal(action.action, 'open-file'); assert.equal(action.path, 'caller/leaf'); });
  } else {
    assert.equal(prevented, false, component + ' must retain native button keyboard behavior');
    assert.equal(actions.length, 0, component + ' must not emit filesystem actions');
  }
}

const begin = source.indexOf("  onRoot('keydown', event => {\n    if (event.target.matches('[data-ws-comment-sidebar]");
const bubbleHandlers = source.slice(begin, source.indexOf('  let drag;', begin));
for (const component of ['collab/CommentBubble', 'collab/CommentMarker']) {
  let keydown, click, focused;
  const marker = {setAttribute(name, value) { this[name] = value; }, focus() { focused = this; }};
  const wrapper = {};
  const bubble = {hidden: false, parentElement: wrapper, previousElementSibling: marker};
  const root = {dataset: {elyComponent: component}, querySelectorAll: selector => selector.includes('comment-bubble') && !bubble.hidden ? [bubble] : []};
  runInNewContext(bubbleHandlers, {root, presence: null, lifecycle: {signal: undefined}, onRoot: (_, handler) => { keydown = handler; }, document: {addEventListener(_, handler) { click = handler; }}});
  // Removing the clicked reaction detaches target; its dispatch path still contains the wrapper.
  click({target: {}, composedPath: () => [{}, wrapper, root]});
  assert.equal(bubble.hidden, false, component + ' must stay open after reaction removal');
  keydown({key: 'Escape', target: {matches: () => false}});
  assert.equal(bubble.hidden, true);
  assert.equal(marker['aria-expanded'], 'false');
  assert.equal(focused, marker, component + ' must restore marker focus');
  bubble.hidden = false;
  click({target: {}, composedPath: () => [{}]});
  assert.equal(bubble.hidden, true, 'outside click must still dismiss');
}
console.log('Workspace file/document isolation and comment dismissal checks passed');
