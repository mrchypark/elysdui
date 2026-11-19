import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';

const exe = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
const browser = await chromium.launch({headless: true, executablePath: exe || undefined});
try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  await page.route('http://test.local/**', async route => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/assets/')) {
      const file = join('ui/gohtmx/assets', url.pathname.slice('/assets/'.length));
      const body = readFileSync(file);
      const ct = file.endsWith('.css') ? 'text/css' : 'application/javascript';
      await route.fulfill({status: 200, contentType: ct, body});
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/html',
      body: `<!doctype html><html><head><link rel="stylesheet" href="/assets/ely-api-communication.css"></head><body>
    <section id="msg-root" data-ely-family="communication" data-ely-component="messaging/ChatMessage">
      <section class="ely-messaging-transcript">
        <article class="ely-messaging-message" data-message-id="m1" data-sender-id="u1">
          <span class="ely-communication-avatar">K</span>
          <div><header><strong>Kim</strong><time>10:00</time></header><p data-ely-message-body>Hi @lee check this</p><button type="button" data-ely-delete-open="m1">Delete</button></div>
        </article>
        <article class="ely-messaging-message" data-message-id="m2" data-sender-id="u1">
          <span class="ely-communication-avatar">K</span>
          <div><header><strong>Kim</strong><time>10:01</time></header><p data-ely-message-body>Second line</p></div>
        </article>
        <dialog class="ely-messaging-delete-dialog" data-ely-delete-dialog>
          <button type="button" data-ely-delete-choice="me">Delete for me</button>
          <button type="button" data-ely-delete-choice="everyone">Delete for everyone</button>
          <button type="button" data-ely-delete-cancel>Cancel</button>
        </dialog>
        <aside class="ely-mention-popover" data-ely-profile-popover hidden><strong data-ely-popover-name></strong><button type="button" data-ely-popover-close>×</button></aside>
      </section>
    </section>
    <section id="comp-root" data-ely-family="communication" data-ely-component="chat/PromptInput">
      <section class="ely-chat-composer" data-ely-prompt-editor>
        <form data-ely-submit="send-message">
          <div class="ely-mention-listbox" role="listbox" data-ely-mention-list hidden>
            <button type="button" role="option" class="ely-mention-option" data-ely-mention-option="lee" value="lee" aria-selected="false"><strong>Lee</strong></button>
            <button type="button" role="option" class="ely-mention-option" data-ely-mention-option="kim" value="kim" aria-selected="false"><strong>Kim</strong></button>
          </div>
          <div class="ely-chat-composer-above">
            <aside class="ely-chat-quote" data-ely-reply-quote hidden><div><strong data-ely-quote-author></strong><p data-ely-quote-text></p></div><input type="hidden" name="reply_to" value="" data-ely-reply-to><button type="button" data-ely-quote-clear>×</button></aside>
          </div>
          <textarea name="message"></textarea>
        </form>
      </section>
    </section>
    <script type="module" src="/assets/ely-api-communication-entry.js"></script>
  </body></html>`,
    });
  });
  await page.goto('http://test.local/', {waitUntil: 'networkidle'});
  await page.waitForSelector('#msg-root[data-ely-ready="true"]');

  // 1. Speaker auto-grouping (is-cont) & @mention pill stripping '@'
  const grouped = await page.locator('[data-message-id="m2"]').evaluate(el => el.classList.contains('is-cont'));
  assert.equal(grouped, true, 'consecutive same-sender message gets is-cont');

  const pillText = await page.locator('.ely-mention-pill').textContent();
  assert.equal(pillText, 'lee', '@mention pill strips leading @');

  // 2. Click mention pill opens profile popover & emits event
  await page.locator('.ely-mention-pill').click();
  const popOpen = await page.locator('[data-ely-profile-popover]').evaluate(el => !el.hidden && el.querySelector('[data-ely-popover-name]').textContent === 'lee');
  assert.equal(popOpen, true, 'mention pill click opens profile popover');

  // 3. @mention autocomplete above Composer (Enter selects mention without submitting form)
  await page.evaluate(() => {
    window.__submitted = 0;
    document.querySelector('#comp-root form').addEventListener('submit', e => { e.preventDefault(); window.__submitted++; });
  });
  const ta = page.locator('#comp-root textarea[name="message"]');
  await ta.fill('Hello @le');
  await ta.dispatchEvent('input');
  const listVisible = await page.locator('[data-ely-mention-list]').evaluate(el => !el.hidden);
  assert.equal(listVisible, true, 'mention listbox opens on @le');
  await ta.press('Enter');
  assert.equal(await ta.inputValue(), 'Hello @lee ', 'Enter inserts @lee ');
  assert.equal(await page.evaluate(() => window.__submitted), 0, 'Enter on open mention list must not submit form');

  // 4. Two-tier delete dialog
  await page.evaluate(() => {
    window.__deleted = null;
    document.getElementById('msg-root').addEventListener('ely:action', e => {
      if (e.detail?.action === 'delete-message') window.__deleted = e.detail;
    });
  });
  await page.locator('[data-ely-delete-open="m1"]').click();
  await page.locator('[data-ely-delete-choice="everyone"]').click();
  const deleted = await page.evaluate(() => window.__deleted);
  assert.equal(deleted?.messageId, 'm1');
  assert.equal(deleted?.scope, 'everyone');

  // 5. Swipe-to-reply attaches quote & triggers Floating Island Morphing (data-has-quote="true")
  const box = await page.locator('[data-message-id="m2"]').boundingBox();
  await page.mouse.move(box.x + 20, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 85, box.y + 10, {steps: 5});
  await page.mouse.up();
  const hasQuote = await page.locator('#comp-root form').getAttribute('data-has-quote');
  assert.equal(hasQuote, 'true', 'swipe-to-reply attaches quote and sets data-has-quote=true');
  assert.equal(await page.locator('[data-ely-reply-to]').inputValue(), 'm2');

  console.log('Native messaging (#64) interactions test passed');
} finally {
  await browser.close();
}
