import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtemp, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const temp = await mkdtemp(join(tmpdir(), 'ely-remote-cursor-layout-'));
const galleryPath = join(temp, 'gallery');
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, {cwd: repo, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
};
let gallery, browser, server;
try {
  run('go', ['build', '-o', galleryPath, './examples/gohtmx/gallery']);
  const reservation = createServer();
  await new Promise(resolveListen => reservation.listen(0, '127.0.0.1', resolveListen));
  const port = reservation.address().port;
  await new Promise(resolveClose => reservation.close(resolveClose));
  server = spawn(galleryPath, ['-addr', `127.0.0.1:${port}`], {stdio: 'ignore'});
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(`${base}/components`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  assert(ready, 'owned gallery startup');
  browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});

  for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
    const page = await browser.newPage({viewport});
    await page.goto(`${base}/components/audit?family=workspace&aliases=1`);
    await page.evaluate(() => document.fonts.ready);
    const root = page.locator('[data-audit-name="collab/RemoteSelection"] [data-audit-main]');
    const metrics = await root.evaluate(rootNode => {
      const editor = rootNode.querySelector('[data-ws-presence-text]');
      const cursor = editor.querySelector('[data-ws-remote-cursor]');
      const label = cursor.querySelector('small');
      const textRects = node => {
        const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT);
        const rects = [];
        for (let textNode = walker.nextNode(); textNode; textNode = walker.nextNode()) {
          if (!textNode.nodeValue.trim() || textNode.parentElement.closest('[data-ws-remote-cursor]')) continue;
          const range = document.createRange();
          range.selectNodeContents(textNode);
          for (const rect of range.getClientRects()) {
            if (rect.width && rect.height) rects.push({text: textNode.nodeValue, left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom});
          }
        }
        return rects;
      };
      const targetNode = [...editor.childNodes].flatMap(function walk(node) {
        if (node.nodeType === Node.TEXT_NODE) return [node];
        return [...node.childNodes].flatMap(walk);
      }).find(node => node.nodeValue?.includes('accents'));
      const labelRect = label.getBoundingClientRect();
      const cursorRect = cursor.getBoundingClientRect();
      const editorRect = editor.getBoundingClientRect();
      const editorStyle = getComputedStyle(editor);
      const labelStyle = getComputedStyle(label);
      const borderTop = parseFloat(getComputedStyle(editor).borderTopWidth);
      const originalInline = {lineHeight: editor.style.lineHeight, paddingTop: editor.style.paddingTop, bottom: label.style.bottom};
      const actualTextRects = textRects(editor);
      editor.style.lineHeight = 'normal';
      editor.style.paddingTop = '.4rem';
      label.style.bottom = '1em';
      const baselineHorizontal = textRects(editor).map(rect => ({left: rect.left, right: rect.right, text: rect.text}));
      editor.style.lineHeight = originalInline.lineHeight;
      editor.style.paddingTop = originalInline.paddingTop;
      label.style.bottom = originalInline.bottom;
      const contentClone = editor.cloneNode(true);
      contentClone.querySelectorAll('[data-ws-remote-cursor]').forEach(node => node.remove());

      const firstLine = editor.cloneNode(false);
      firstLine.replaceChildren();
      const firstCursor = document.createElement('span');
      firstCursor.setAttribute('data-ws-remote-cursor', '');
      firstCursor.contentEditable = 'false';
      const firstLabel = document.createElement('small');
      firstLabel.textContent = 'Grace Lin';
      firstCursor.append(firstLabel);
      firstLine.append(firstCursor, document.createTextNode('First-line cursor target'));
      editor.parentElement.append(firstLine);
      const firstRange = document.createRange();
      firstRange.selectNodeContents(firstLine.lastChild);
      const firstTextRects = [...firstRange.getClientRects()].map(rect => ({left: rect.left, top: rect.top, right: rect.right, bottom: rect.bottom}));
      const firstLabelRect = firstLabel.getBoundingClientRect();
      const firstEditorRect = firstLine.getBoundingClientRect();
      const firstBorderTop = parseFloat(getComputedStyle(firstLine).borderTopWidth);
      firstLine.remove();

      return {
        editable: editor.getAttribute('contenteditable'),
        text: contentClone.textContent,
        targetWord: targetNode?.nodeValue,
        cursorBeforeTarget: Boolean(targetNode && (cursor.compareDocumentPosition(targetNode) & Node.DOCUMENT_POSITION_FOLLOWING)),
        label: {left: labelRect.left, top: labelRect.top, right: labelRect.right, bottom: labelRect.bottom},
        cursorContainingBlock: {left: cursorRect.left, top: cursorRect.top, right: cursorRect.right, bottom: cursorRect.bottom},
        computed: {lineHeight: editorStyle.lineHeight, paddingTop: editorStyle.paddingTop, badgeBottom: labelStyle.bottom, badgeLineHeight: labelStyle.lineHeight},
        textRects: actualTextRects,
        baselineHorizontal,
        firstLine: {
          label: {left: firstLabelRect.left, top: firstLabelRect.top, right: firstLabelRect.right, bottom: firstLabelRect.bottom},
          contentTop: firstEditorRect.top + firstBorderTop,
          textRects: firstTextRects,
        },
      };
    });

    assert.equal(metrics.editable, 'true', 'shared passage remains editable');
    assert.equal(metrics.text, 'A lift blends a color toward white.\nHalf a lift sits midway; a full lift is white itself.\nIn dark, accents lift further so they read with the same weight.');
    assert.match(metrics.targetWord, /^accents/);
    assert(metrics.cursorBeforeTarget, 'cursor marker stays before its caller-supplied word');
    assert(metrics.textRects.length >= 3, 'all three passage lines are measured');
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    assert(metrics.textRects.every(rect => !overlaps(metrics.label, rect)), 'badge must not intersect any paragraph line Range rect');
    assert.equal(metrics.baselineHorizontal.length, metrics.textRects.length, 'annotation spacing must not change text line wrapping');
    for (let i = 0; i < metrics.textRects.length; i++) {
      assert(Math.abs(metrics.baselineHorizontal[i].left - metrics.textRects[i].left) < 0.5, 'annotation spacing must preserve each text fragment x position');
      assert(Math.abs(metrics.baselineHorizontal[i].right - metrics.textRects[i].right) < 0.5, 'annotation spacing must preserve each text fragment width');
    }
    assert(metrics.firstLine.label.top >= metrics.firstLine.contentTop - 1, 'first-line badge remains inside the presence editor top gutter');
    assert(metrics.firstLine.textRects.every(rect => !overlaps(metrics.firstLine.label, rect)), 'first-line badge must clear its text');
    console.log(JSON.stringify({viewport, metrics}));
    await page.close();
  }
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise(resolveExit => server.once('exit', resolveExit));
    server.kill('SIGTERM');
    await Promise.race([exited, new Promise(resolveTimeout => setTimeout(resolveTimeout, 3000))]);
    if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await exited; }
  }
  await rm(temp, {recursive: true, force: true});
}
