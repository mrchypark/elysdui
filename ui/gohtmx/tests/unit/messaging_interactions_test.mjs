import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';

const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
let mentionRequests = 0, profileRequests = 0, deleteRequests = 0;
const typingRequests = [];

try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  await page.route('http://test.local/**', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/assets/')) {
      const file = join('ui/gohtmx/assets', url.pathname.slice('/assets/'.length));
      return route.fulfill({status: 200, contentType: file.endsWith('.css') ? 'text/css' : 'application/javascript', body: readFileSync(file)});
    }
    if (url.pathname === '/api/mentions') {
      mentionRequests++;
      await new Promise(resolve => setTimeout(resolve, 300));
      const participants = mentionRequests === 1
        ? [{handle: '김대리', label: '김대리', role: 'Guest'}, {handle: '이과장', label: '이과장', role: 'Member'}]
        : [{handle: '전체', label: 'Everyone'}, {handle: '김대리', label: '김대리'}, {handle: '이과장', label: '이과장'}];
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({participants})});
    }
    if (url.pathname === '/api/profile') {
      profileRequests++;
      assert.equal(url.searchParams.get('handle'), 'lee');
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({handle: 'lee', role: '<b>Lead</b>', accountType: 'Guest', joined: '20 Nov 2026'})});
    }
    if (url.pathname === '/api/typing' && request.method() === 'POST') {
      typingRequests.push(JSON.parse(request.postData() || '{}'));
      return route.fulfill({status: 204, body: ''});
    }
    if (url.pathname.startsWith('/api/messages/')) {
      deleteRequests++;
      return route.fulfill({status: deleteRequests === 1 ? 500 : 200, contentType: 'text/html', body: deleteRequests === 1 ? '<p>Delete failed</p>' : ''});
    }
    return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head>
      <link rel="stylesheet" href="/assets/ely-api-communication.css">
      <style>#msg-root .ely-messaging-transcript{height:180px;overflow:auto}.ely-mention-popover{position:fixed;right:1rem;top:1rem;z-index:10}</style></head><body>
      <section id="msg-root" data-ely-family="communication" data-ely-component="messaging/ChatMessage"><section class="ely-messaging-transcript" data-ely-profile-url="/api/profile">
        <article class="ely-messaging-message" data-message-id="m1" data-sender-id="u1" data-sender-name="Kim"><span class="ely-communication-avatar">K</span><div><header><strong>Kim</strong><time>10:00</time></header><p data-ely-message-body>Hi @lee and @김대리 and @e\u0301</p><button type="button" data-ely-reply-open="m1">Reply to message</button><button type="button" data-ely-delete-open="m1">Delete</button></div></article>
        <article class="ely-messaging-message is-cont" data-message-id="m2" data-sender-id="u1" data-sender-name="Kim"><time class="ely-messaging-run-time">10:01</time><div><p data-ely-message-body>Second line</p><button type="button" data-ely-reply-open="m2">Reply to message</button></div></article>
        ${Array.from({length: 6}, (_, index) => `<article class="ely-messaging-message" data-message-id="f${index}" data-sender-id="fill${index}"><div><header><strong>Fill</strong></header><p data-ely-message-body>Filler ${index}</p></div></article>`).join('')}
        <dialog class="ely-messaging-delete-dialog" data-ely-delete-dialog><button type="button" data-ely-delete-choice="me" data-ely-delete-url="/api/messages/%7bid%7d/for-me">Delete for me</button><button type="button" data-ely-delete-choice="everyone" data-ely-delete-url="/api/messages/%7bid%7d/for-everyone">Delete for everyone</button><button type="button" data-ely-delete-cancel>Cancel</button></dialog>
        <aside class="ely-mention-popover" data-ely-profile-popover hidden><header><strong data-ely-popover-name></strong><button type="button" data-ely-popover-close>Close</button></header><dl><div><dt>Role</dt><dd data-ely-profile-role></dd></div><div><dt>Account</dt><dd data-ely-profile-account></dd></div><div><dt>Joined</dt><dd data-ely-profile-joined></dd></div></dl><output data-ely-profile-state aria-live="polite"></output><button type="button" data-ely-profile-mention>Mention</button></aside>
      </section></section>
      <section id="comp-root" data-ely-family="communication" data-ely-component="chat/PromptInput" data-ely-typing-delay="40" data-ely-typing-expiry="250"><section class="ely-chat-composer" data-ely-prompt-editor data-ely-mention-src="/api/mentions"><form>
        <div class="ely-mention-listbox" role="listbox" data-ely-mention-list hidden><button type="button" role="option" class="ely-mention-option" data-ely-mention-option="kim" value="kim"><strong>SSR Kim</strong></button></div>
        <aside class="ely-chat-quote" data-ely-reply-quote hidden><div><strong data-ely-quote-author></strong><p data-ely-quote-text></p></div><input type="hidden" name="reply_to" value="" data-ely-reply-to><button type="button" data-ely-quote-clear>Clear</button></aside>
        <input name="body" data-ely-prompt-editor aria-label="Message">
      </form></section></section>
      <script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-communication-entry.js"></script>
      </body></html>`});
  });

  await page.goto('http://test.local/', {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#msg-root[data-ely-ready="true"]');
  assert.equal(await page.locator('[data-ely-mention-option="kim"] strong').textContent(), 'SSR Kim');
  await page.waitForFunction(() => document.querySelector('[data-ely-mention-option="김대리"]'));
  assert.equal(mentionRequests, 1);
  assert.equal(await page.locator('[data-message-id="m2"]').evaluate(el => el.classList.contains('is-cont')), true);
  assert.equal(await page.locator('[data-message-id="m1"] .ely-mention-pill').count(), 3);
  assert.equal(await page.locator('[data-message-id="m1"] [data-ely-mention="e\u0301"]').count(), 1);

  await page.locator('#comp-root').evaluate(root => root.dispatchEvent(new CustomEvent('ely:mention-refresh', {bubbles: true})));
  await page.waitForFunction(() => document.querySelector('[data-ely-mention-option="전체"]'));
  assert.equal(mentionRequests, 2);
  const input = page.locator('#comp-root input[name="body"]');
  await input.fill('Hello @이과');
  assert.equal(await page.locator('[data-ely-mention-list]').evaluate(el => !el.hidden), true);
  await input.press('Enter');
  assert.equal(await input.inputValue(), 'Hello @이과장 ');

  await page.locator('[data-message-id="m1"] [data-ely-mention="lee"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ely-profile-role]').textContent === '<b>Lead</b>');
  assert.equal(await page.locator('[data-ely-profile-account]').textContent(), 'Guest');
  assert.equal(await page.locator('[data-ely-profile-joined]').textContent(), '20 Nov 2026');
  assert.equal(await page.locator('[data-ely-profile-role] b').count(), 0);
  assert.equal(await page.locator('[data-ely-popover-close]').evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('[data-ely-profile-popover]').evaluate(el => el.hidden), true);
  assert.equal(await page.locator('[data-message-id="m1"] [data-ely-mention="lee"]').evaluate(el => document.activeElement === el), true);
  await page.locator('[data-message-id="m1"] [data-ely-mention="lee"]').click();
  await page.waitForFunction(() => document.querySelector('[data-ely-profile-role]').textContent === '<b>Lead</b>');
  await page.locator('[data-ely-profile-mention]').click();
  assert.equal(await page.locator('[data-ely-profile-popover]').evaluate(el => el.hidden), true);
  assert.equal(await input.evaluate(el => document.activeElement === el), true);
  assert.match(await input.inputValue(), /@lee $/);

  await page.locator('.ely-messaging-transcript').evaluate(el => { el.dataset.elyProfileUrl = 'https://unsafe.example/profile'; });
  assert.equal(await page.locator('[data-message-id="m1"] [data-ely-mention="김대리"]').count(), 1, 'unsafe profile test target remains mounted');
  await page.locator('[data-message-id="m1"] [data-ely-mention="김대리"]').click();
  await page.waitForTimeout(100);
  assert.equal(profileRequests, 2);
  await page.locator('[data-ely-popover-close]').click();

  await page.locator('[data-message-id="m2"]').evaluate(el => { delete el.dataset.senderName; });
  await page.locator('[data-message-id="m2"] [data-ely-reply-open]').click();
  assert.equal(await page.locator('[data-ely-quote-author]').textContent(), 'Kim');
  assert.equal(await page.locator('[data-ely-reply-to]').inputValue(), 'm2');
  await page.locator('[data-message-id="m2"] [data-ely-message-body]').evaluate(body => { body.firstChild.nodeValue = 'Updated @박과장'; });
  await page.waitForSelector('[data-message-id="m2"] [data-ely-mention="박과장"]');

  await page.evaluate(() => { window.__deleted = null; document.getElementById('msg-root').addEventListener('ely:action', event => { if (event.detail?.action === 'delete-message') window.__deleted = event.detail; }); });
  await page.locator('[data-ely-delete-open="m1"]').click();
  const everyoneDelete = page.locator('[data-ely-delete-choice="everyone"]');
  assert.equal(await everyoneDelete.getAttribute('data-ely-delete-resolved'), 'http://test.local/api/messages/m1/for-everyone');
  assert.equal(await everyoneDelete.getAttribute('hx-delete'), null);
  await everyoneDelete.click();
  await page.waitForFunction(() => document.querySelector('[data-ely-delete-dialog]').dataset.elyDeletePending === undefined && document.querySelector('[data-ely-delete-dialog]').open);
  assert.equal(deleteRequests, 1);
  assert.equal(await page.locator('[data-message-id="m1"]').count(), 1);
  assert.equal(await page.evaluate(() => window.__deleted), null, 'declarative delete does not duplicate a host callback');
  await everyoneDelete.click();
  await page.waitForFunction(() => !document.querySelector('[data-message-id="m1"]'));
  assert.equal(deleteRequests, 2);

  await page.locator('.ely-messaging-transcript').evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(30);
  await page.evaluate(() => { document.querySelector('.ely-messaging-transcript').insertAdjacentHTML('beforeend', '<article class="ely-messaging-message" data-message-id="m3" data-sender-id="u7" data-sender-name="OOB"><div><header><strong>OOB</strong></header><p data-ely-message-body>Live @김대리</p></div></article><article class="ely-messaging-message" data-message-id="m4" data-sender-id="u7" data-sender-name="OOB"><div><p data-ely-message-body>Live again</p></div></article>'); });
  await page.waitForSelector('[data-message-id="m4"].is-cont');
  assert.equal(await page.locator('[data-message-id="m3"] .ely-mention-pill').count(), 1);
  assert.equal(await page.locator('.ely-messaging-transcript').evaluate(el => el.scrollTop), 0);
  await page.evaluate(() => { const content = document.querySelector('.ely-messaging-transcript'); content.append(content.querySelector('[data-message-id="m4"]')); });
  await page.waitForTimeout(30);
  assert.equal(await page.locator('[data-message-id="m3"] .ely-mention-pill').count(), 1);

  await page.locator('.ely-messaging-transcript').evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(30);
  await page.evaluate(() => { const transcript = document.querySelector('.ely-messaging-transcript'); for (let index = 0; index < 6; index++) transcript.insertAdjacentHTML('beforeend', `<article class="ely-messaging-message" data-message-id="o${index}" data-sender-id="u${index}"><div><header><strong>Live</strong></header><p data-ely-message-body>Live ${index}</p></div></article>`); });
  await page.waitForTimeout(100);
  assert.equal(await page.locator('.ely-messaging-transcript').evaluate(el => el.scrollHeight - el.scrollTop - el.clientHeight <= 36), true);

  await page.locator('#comp-root').evaluate(root => { root.dataset.elyTypingUrl = '/api/typing'; });
  await input.fill('Typing now');
  await input.dispatchEvent('input');
  for (let wait = 0; wait < 30 && !typingRequests.some(item => item.typing === true); wait++) await page.waitForTimeout(20);
  assert.equal(typingRequests[0]?.typing, true);
  for (let wait = 0; wait < 40 && !typingRequests.some(item => item.typing === false); wait++) await page.waitForTimeout(20);
  assert.equal(typingRequests.some(item => item.typing === false), true);

  const viewportValues = await page.evaluate(() => {
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 700});
    Object.defineProperty(window.visualViewport, 'height', {configurable: true, value: 400});
    Object.defineProperty(window.visualViewport, 'offsetTop', {configurable: true, value: 0});
    window.visualViewport.dispatchEvent(new Event('resize'));
    return [...document.querySelectorAll('[data-ely-family="communication"]')].map(root => root.style.getPropertyValue('--ely-keyboard-offset'));
  });
  assert.deepEqual(viewportValues, ['300px', '300px']);
  await page.evaluate(() => { window.__removedComp = document.getElementById('comp-root'); window.__removedComp.remove(); });
  await page.waitForTimeout(30);
  const cleanup = await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', {configurable: true, value: 100});
    window.visualViewport.dispatchEvent(new Event('resize'));
    return [window.__removedComp.style.getPropertyValue('--ely-keyboard-offset'), document.getElementById('msg-root').style.getPropertyValue('--ely-keyboard-offset')];
  });
  assert.deepEqual(cleanup, ['', '600px']);
  console.log('Messaging interaction gaps (#66) browser test passed');
} finally {
  await browser.close();
}
