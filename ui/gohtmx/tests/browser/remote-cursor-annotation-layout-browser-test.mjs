import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {access, mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {captureTargetPNG, screenshotWithoutCaretMutation} from './visual-state-audit-drivers.mjs';

const repo = resolve(fileURLToPath(new URL('../../../../', import.meta.url)));
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sourcePin = async () => {
  const revision = spawnSync('git', ['rev-parse', 'HEAD'], {cwd: repo, encoding: 'utf8'});
  assert.equal(revision.status, 0, revision.stderr);
  const status = spawnSync('git', ['status', '--porcelain', '--untracked-files=no'], {cwd: repo, encoding: 'utf8'});
  assert.equal(status.status, 0, status.stderr);
  return {sourceSHA: revision.stdout.trim(), trackedClean: status.stdout === '', testSHA256: sha256(await readFile(fileURLToPath(import.meta.url)))};
};
const sourceBefore = await sourcePin();
assert(sourceBefore.trackedClean, 'source checkout must be clean before browser capture');
const outputRoot = join(repo, 'test-results/action-camera');
await mkdir(outputRoot, {recursive: true});
const output = await mkdtemp(join(outputRoot, 'remote-cursor-layout-'));
const temp = await mkdtemp(join(tmpdir(), 'ely-remote-cursor-layout-'));
const galleryPath = join(temp, 'gallery');
const receipt = {node: process.version, runnerPID: process.pid, deviceScaleFactor: 1, sourceBefore, status: 'running', browserClosed: false, galleryExited: false, tempRemoved: false, captures: []};
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, {cwd: repo, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
};
let gallery, browser, server, failure;
try {
  run('go', ['build', '-o', galleryPath, './examples/gohtmx/gallery']);
  const reservation = createServer();
  await new Promise(resolveListen => reservation.listen(0, '127.0.0.1', resolveListen));
  const port = reservation.address().port;
  await new Promise(resolveClose => reservation.close(resolveClose));
  server = spawn(galleryPath, ['-addr', `127.0.0.1:${port}`], {stdio: 'ignore'});
  receipt.galleryPID = server.pid;
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(`${base}/components`)).ok) { ready = true; break; } } catch {}
    await new Promise(resolveDelay => setTimeout(resolveDelay, 50));
  }
  assert(ready, 'owned gallery startup');
  browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  receipt.browserVersion = browser.version();

  for (const viewport of [{width: 1440, height: 1000}, {width: 390, height: 844}]) {
    const page = await browser.newPage({viewport, deviceScaleFactor: 1});
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
    const record = page.locator('[data-audit-name="collab/RemoteSelection"]');
    const auditMain = record.locator('[data-audit-main]');
    const ownedRoot = auditMain.locator(':scope > [data-ely-family]');
    assert.equal(await record.count(), 1, 'component audit record is unique');
    assert.equal(await auditMain.count(), 1, 'component has one owned audit main');
    assert.equal(await ownedRoot.count(), 1, 'audit main has one exact component root');
    assert.equal(await ownedRoot.getAttribute('data-ely-component'), 'collab/RemoteSelection');
    assert.equal(await ownedRoot.evaluate(node => node.parentElement === node.closest('[data-audit-main]')), true, 'capture root belongs to its audit main');
    const stem = viewport.width === 1440 ? 'desktop' : 'mobile';
    const targetPath = join(output, `${stem}-target.png`);
    const target = await captureTargetPNG(page, ownedRoot, targetPath);
    const contextPath = join(output, `${stem}-viewport-context.png`);
    const context = await screenshotWithoutCaretMutation(page, {path: contextPath, animations: 'disabled', scale: 'css'});
    const pngReceipt = (path, png) => ({path, sha256: sha256(png), bytes: png.length, width: png.readUInt32BE(16), height: png.readUInt32BE(20)});
    assert.deepEqual([context.readUInt32BE(16), context.readUInt32BE(20)], [viewport.width, viewport.height], 'context PNG preserves the full viewport');
    receipt.captures.push({
      viewport,
      target: pngReceipt(targetPath, target.png),
      viewportContext: {...pngReceipt(contextPath, context), scroll: await page.evaluate(() => ({x: scrollX, y: scrollY}))},
      camera: target.bounds,
      ownership: {foreignDOMIntersections: target.foreignDOMIntersections, occludedForeignPaint: target.occludedForeignPaint},
    });
    console.log(JSON.stringify({viewport, metrics}));
    await page.close();
  }
} catch (error) {
  failure = error;
  receipt.error = error.stack || String(error);
} finally {
  if (browser) await browser.close();
  if (server && server.exitCode === null && server.signalCode === null) {
    const exited = new Promise(resolveExit => server.once('exit', resolveExit));
    server.kill('SIGTERM');
    await Promise.race([exited, new Promise(resolveTimeout => setTimeout(resolveTimeout, 3000))]);
    if (server.exitCode === null && server.signalCode === null) { server.kill('SIGKILL'); await exited; }
  }
  await rm(temp, {recursive: true, force: true});
  receipt.browserClosed = !browser || !browser.isConnected();
  receipt.galleryExited = !server || server.exitCode !== null || server.signalCode !== null;
  receipt.tempRemoved = await access(temp).then(() => false, () => true);
  receipt.sourceAfter = await sourcePin();
  receipt.sourceStable = JSON.stringify(receipt.sourceBefore) === JSON.stringify(receipt.sourceAfter);
  if (!receipt.sourceStable) failure ||= new Error('source revision or test file hash changed during capture');
  if (!receipt.browserClosed || !receipt.galleryExited || !receipt.tempRemoved) failure ||= new Error('owned browser, gallery, or temporary build directory cleanup failed');
  receipt.status = failure ? 'failed' : 'passed';
  await writeFile(join(output, 'receipt.json'), `${JSON.stringify(receipt, null, 2)}\n`);
}
if (failure) throw failure;
