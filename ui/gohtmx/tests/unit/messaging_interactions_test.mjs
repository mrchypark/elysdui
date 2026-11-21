import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';
import {join} from 'node:path';
import {chromium} from 'playwright';

const renderScenario = scenario => execFileSync('go', ['run', './ui/gohtmx/tests/fixtures/messaging-gaps', ...(scenario ? [scenario] : [])], {encoding: 'utf8'});
const pageFor = componentHTML => `<!doctype html><html><head><link rel="stylesheet" href="/assets/ely-api-communication.css"><style>#msg-root-transcript{height:180px;overflow:auto}#comp-root{margin-block:1rem}iframe{width:500px;height:320px}</style></head><body>${componentHTML}<script src="/assets/htmx.min.js"></script><script type="module" src="/assets/ely-api-communication-entry.js"></script></body></html>`;
const rendered = renderScenario(), renderedTwoTranscripts = renderScenario('two-transcripts'), renderedInvalidComposer = renderScenario('invalid-composer');
const browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
let mentionRequests = 0, raceRequests = 0, profileRequests = 0, deleteRequests = 0;
const typingRequests = [], deleteURLs = [], unsafeRequests = [];
let releaseTypingTrue = null, typingFalseStarted = false, gateTyping = false;

try {
  const page = await browser.newPage({viewport: {width: 390, height: 844}});
  page.on('request', request => {
    const url = new URL(request.url());
    if (url.hostname === 'unsafe.example') unsafeRequests.push(url.href);
  });
  await page.route('**/*', async route => {
    const request = route.request(), url = new URL(request.url());
    if (url.pathname.startsWith('/assets/')) {
      const file = join('ui/gohtmx/assets', url.pathname.slice('/assets/'.length));
      const type = file.endsWith('.css') ? 'text/css' : file.endsWith('.js') || file.endsWith('.mjs') ? 'application/javascript' : 'application/octet-stream';
      return route.fulfill({status: 200, contentType: type, body: readFileSync(file)});
    }
    if (url.pathname === '/api/mentions') {
      mentionRequests++;
      await new Promise(resolve => setTimeout(resolve, 220));
      const participants = mentionRequests === 1
        ? [{handle: '김대리', label: '김대리', role: 'Guest'}, {handle: '이과장', label: '이과장', role: 'Member'}]
        : [{handle: '전체', label: 'Everyone'}, {handle: '김대리', label: '김대리'}, {handle: '이과장', label: '이과장'}];
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({participants})});
    }
    if (url.pathname === '/api/mentions-race') {
      raceRequests++;
      await new Promise(resolve => setTimeout(resolve, 220));
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({participants: [{handle: 'stale', label: 'Stale'}]})});
    }
    if (url.pathname === '/api/profile') {
      profileRequests++;
      assert.equal(url.searchParams.get('handle'), 'lee');
      return route.fulfill({status: 200, contentType: 'application/json', body: JSON.stringify({handle: 'lee', role: '<b>Lead</b>', accountType: 'Guest', joined: '20 Nov 2026'})});
    }
    if (url.pathname === '/api/typing' && request.method() === 'POST') {
      const body = JSON.parse(request.postData() || '{}');
      typingRequests.push(body);
      if (body.typing && gateTyping) await new Promise(resolve => { releaseTypingTrue = resolve; });
      else if (!body.typing && gateTyping) typingFalseStarted = true;
      if (body.typing && gateTyping) releaseTypingTrue = null;
      return route.fulfill({status: 204, body: ''});
    }
    if (url.pathname.startsWith('/api/messages/')) {
      deleteRequests++;
      deleteURLs.push(request.url());
      await new Promise(resolve => setTimeout(resolve, 180));
      return route.fulfill({
        status: deleteRequests === 1 ? 500 : 204,
        contentType: 'text/html; charset=utf-8',
        body: deleteRequests === 1 ? '<p>Delete failed</p>' : '',
      });
    }
    if (url.pathname === '/oob' || url.pathname === '/oob-live') {
      const rows = url.pathname === '/oob'
        ? [['m3', 'OOB', 'Live @김대리'], ['m4', 'OOB', 'Live again']]
        : Array.from({length: 6}, (_, index) => [`o${index}`, `Live${index}`, `Live ${index}`]);
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: `<div hx-swap-oob="beforeend:#msg-root-transcript">${rows.map(([id, sender, text], index) => `<article class="ely-messaging-message" data-message-id="${id}" data-sender-id="${sender}" data-sender-name="${sender}"><div>${index === 0 ? `<header><strong>${sender}</strong></header>` : ''}<p data-ely-message-body>${text}</p></div></article>`).join('')}</div>`,
      });
    }
    if (url.pathname === '/scenario-two') return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: pageFor(renderedTwoTranscripts)});
    if (url.pathname === '/scenario-invalid') return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: pageFor(renderedInvalidComposer)});
    return route.fulfill({status: 200, contentType: 'text/html; charset=utf-8', body: pageFor(rendered)});
  });

  await page.goto('http://test.local/', {waitUntil: 'domcontentloaded'});
  await page.waitForSelector('#msg-root[data-ely-ready="true"]');
  assert.equal(await page.locator('#ssr-root[data-ely-ready="true"]').count(), 1);
  assert.equal(await page.locator('#escape-root[data-ely-ready="true"]').count(), 1);
  assert.equal(await page.locator('[data-ely-mention-option="kim"] strong').textContent(), 'SSR Kim');

  const twoFrame = page.frameLocator('#two-frame');
  await twoFrame.locator('#two-a[data-ely-ready="true"]').waitFor();
  await twoFrame.locator('#two-a [data-ely-reply-open]').click();
  assert.equal(await twoFrame.locator('#only-comp [data-ely-reply-quote]').evaluate(el => el.hidden), true);
  assert.equal(await twoFrame.locator('#only-comp-message').inputValue(), '');
  const invalidFrame = page.frameLocator('#invalid-frame');
  await invalidFrame.locator('#invalid-chat[data-ely-ready="true"]').waitFor();
  await invalidFrame.locator('#invalid-chat [data-ely-reply-open]').click();
  assert.equal(await invalidFrame.locator('#shared-comp [data-ely-reply-quote]').evaluate(el => el.hidden), true);
  assert.equal(await invalidFrame.locator('#shared-comp-message').inputValue(), '');

  // A direct update cancels the delayed startup request instead of losing a race.
  await page.locator('#race-root').evaluate(root => root.dispatchEvent(new CustomEvent('ely:mention-refresh', {bubbles: true, detail: {participants: [{handle: 'fresh', label: 'Fresh'}]}})));
  await page.waitForTimeout(300);
  assert.equal(raceRequests, 1);
  assert.equal(await page.locator('[data-ely-mention-option="fresh"]').getAttribute('id'), 'race-root-mentions-option-0');
  assert.equal(await page.locator('[data-ely-mention-option="stale"]').count(), 0);

  // SSR-only composers accept direct participant replacement.
  await page.locator('#ssr-root').evaluate(root => root.dispatchEvent(new CustomEvent('ely:mentions', {bubbles: true, detail: [{handle: 'direct', label: 'Direct'}]})));
  await page.waitForSelector('[data-ely-mention-option="direct"]', {state: 'attached'});
  assert.equal(await page.locator('#ssr-root-mentions [data-ely-mention-option]').count(), 1);
  assert.match(await page.locator('#ssr-root-mentions [role="option"]').first().getAttribute('id'), /-option-0$/);

  await page.waitForFunction(() => document.querySelector('#comp-root [data-ely-mention-option="김대리"]'));
  assert.equal(mentionRequests, 1);
  assert.equal(await page.locator('[data-message-id="m2"]').evaluate(el => el.classList.contains('is-cont')), true);
  assert.equal(await page.locator('#msg-root [data-message-id="m1"] .ely-mention-pill').count(), 3);
  assert.equal(await page.locator('#msg-root [data-message-id="m1"] [data-ely-mention="e\u0301"]').count(), 1);
  assert.equal(await page.locator('[data-ely-mention="lee"]').first().getAttribute('data-ely-action'), null, 'mention pills emit only mention-click');

  const input = page.locator('#comp-root-message');
  await input.fill('Hello @');
  assert.equal(await input.getAttribute('role'), 'combobox');
  assert.equal(await input.getAttribute('aria-autocomplete'), 'list');
  assert.equal(await input.getAttribute('aria-controls'), 'comp-root-mentions');
  assert.equal(await input.getAttribute('aria-expanded'), 'true');
  const firstActive = await input.getAttribute('aria-activedescendant');
  assert.ok(firstActive);
  await input.press('ArrowDown');
  const secondActive = await input.getAttribute('aria-activedescendant');
  assert.notEqual(secondActive, firstActive);
  await input.fill('Hello @이과');
  await input.press('Enter');
  assert.equal(await input.inputValue(), 'Hello @이과장 ');

  await input.fill('Compose @');
  const beforeIME = await input.inputValue();
  await input.dispatchEvent('keydown', {key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229, bubbles: true, cancelable: true});
  assert.equal(await input.inputValue(), beforeIME);
  assert.equal(await page.locator('#comp-root-mentions').evaluate(el => el.hidden), false);
  await input.press('Tab');
  assert.equal(await page.locator('#comp-root-mentions').evaluate(el => el.hidden), true);
  assert.equal(await input.evaluate(el => document.activeElement === el), false, 'Tab is not trapped by the listbox');

  const longInput = page.locator('#long-root-message');
  await longInput.fill('Hello @');
  for (let index = 0; index < 13; index++) {
    await longInput.press('ArrowDown');
    const activeBounds = await page.evaluate(() => {
      const input = document.querySelector('#long-root-message'), list = document.querySelector('#long-root-mentions'), active = document.getElementById(input.getAttribute('aria-activedescendant')), listBox = list.getBoundingClientRect(), activeBox = active.getBoundingClientRect();
      return {top: activeBox.top, bottom: activeBox.bottom, listTop: listBox.top, listBottom: listBox.bottom};
    });
    assert.ok(activeBounds.top >= activeBounds.listTop - 1 && activeBounds.bottom <= activeBounds.listBottom + 1, JSON.stringify(activeBounds));
  }
  await page.locator('#mixed-root-message').fill('Hello @');
  assert.match(await page.locator('#mixed-root-message').getAttribute('aria-activedescendant'), /option-1$/);
  assert.equal(await page.locator('#mixed-root-mentions-option-0').getAttribute('aria-selected'), 'false');
  assert.equal(await page.locator('#mixed-root-mentions-option-1').getAttribute('aria-selected'), 'true');
  await page.locator('#blocked-root-message').fill('Hello @');
  assert.equal(await page.locator('#blocked-root-mentions').evaluate(el => el.hidden), true);
  assert.equal(await page.locator('#blocked-root-message').getAttribute('aria-expanded'), 'false');
  assert.equal(await page.locator('#blocked-root-message').getAttribute('aria-activedescendant'), null);

  // Escape still closes communication disclosure panels when no profile exists.
  await page.locator('[data-ely-sources="citation-root-source"]').click();
  assert.equal(await page.locator('#citation-root-source').evaluate(el => el.hidden), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#citation-root-source').evaluate(el => el.hidden), true);
  assert.equal(await page.locator('[data-ely-sources="citation-root-source"]').evaluate(el => document.activeElement === el), true);
  await page.locator('[data-ely-model-menu]').focus();
  await page.locator('[data-ely-model-menu]').evaluate(el => el.click());
  assert.equal(await page.locator('#model-root-models').evaluate(el => el.hidden), false);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#model-root-models').evaluate(el => el.hidden), true);
  assert.equal(await page.locator('[data-ely-model-menu]').evaluate(el => document.activeElement === el), true);
  await page.evaluate(() => {
    window.__escapeDefaultPrevented = null;
    window.addEventListener('keydown', event => { if (event.key === 'Escape') window.__escapeDefaultPrevented = event.defaultPrevented; }, {once: true});
  });
  await page.locator('#escape-control').focus();
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => window.__escapeDefaultPrevented), false);

  await page.locator('#msg-root [data-message-id="m1"] [data-ely-mention="lee"]').click();
  await page.waitForFunction(() => document.querySelector('#msg-root [data-ely-profile-role]').textContent === '<b>Lead</b>');
  assert.equal(await page.locator('#msg-root [data-ely-profile-account]').textContent(), 'Guest');
  assert.equal(await page.locator('#msg-root [data-ely-profile-joined]').textContent(), '20 Nov 2026');
  assert.equal(await page.locator('#msg-root [data-ely-profile-role] b').count(), 0);
  assert.equal(await page.locator('#msg-root [data-ely-popover-name]').textContent(), 'lee');
  assert.equal(await page.locator('#msg-root [data-ely-profile-popover]').getAttribute('aria-labelledby'), 'msg-root-mention-popover-title');
  assert.equal(await page.locator('[data-ely-mention="lee"]').first().getAttribute('aria-expanded'), 'true');
  assert.equal(await page.locator('[data-ely-mention="lee"]').first().getAttribute('aria-controls'), 'msg-root-mention-popover');
  assert.equal(await page.locator('#msg-root [data-ely-profile-popover]').evaluate(el => getComputedStyle(el).position), 'fixed');
  assert.equal(await page.locator('#msg-root [data-ely-popover-close]').evaluate(el => document.activeElement === el), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#msg-root [data-ely-profile-popover]').evaluate(el => el.hidden), true);
  assert.equal(await page.locator('[data-ely-mention="lee"]').first().evaluate(el => document.activeElement === el), true);

  await page.locator('[data-ely-mention="lee"]').first().evaluate(el => { el.style.position = 'fixed'; el.style.left = '-80px'; el.style.top = '-80px'; el.click(); });
  await page.waitForFunction(() => document.querySelector('#msg-root [data-ely-profile-role]').textContent === '<b>Lead</b>');
  const clamped = await page.evaluate(() => { const r = document.querySelector('#msg-root [data-ely-profile-popover]').getBoundingClientRect(); return {left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: innerWidth, height: innerHeight}; });
  assert.ok(clamped.left >= 0 && clamped.top >= 0 && clamped.right <= clamped.width && clamped.bottom <= clamped.height, JSON.stringify(clamped));
  await page.locator('[data-ely-mention="lee"]').first().evaluate(el => { el.style.left = '380px'; el.style.top = '80px'; });
  await page.evaluate(() => window.dispatchEvent(new Event('resize')));
  const repositioned = await page.locator('#msg-root [data-ely-profile-popover]').evaluate(el => el.getBoundingClientRect().right);
  assert.ok(repositioned <= 390);
  const narrow = await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'width', {configurable: true, value: 180});
    Object.defineProperty(window.visualViewport, 'offsetLeft', {configurable: true, value: 50});
    window.visualViewport.dispatchEvent(new Event('resize'));
    const popover = document.querySelector('#msg-root [data-ely-profile-popover]'), r = popover.getBoundingClientRect();
    return {left: r.left, right: r.right, width: r.width, maxWidth: popover.style.maxWidth, minWidth: popover.style.minWidth};
  });
  assert.ok(narrow.left >= 58 && narrow.right <= 222 && narrow.width <= 164, JSON.stringify(narrow));
  assert.equal(narrow.maxWidth, '164px');
  assert.equal(narrow.minWidth, '0px');
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'width', {configurable: true, value: 390});
    Object.defineProperty(window.visualViewport, 'offsetLeft', {configurable: true, value: 0});
    window.visualViewport.dispatchEvent(new Event('resize'));
  });

  await page.locator('#msg-root [data-ely-profile-mention]').click();
  assert.equal(await page.locator('#msg-root [data-ely-profile-popover]').evaluate(el => el.hidden), true);
  assert.equal(await input.evaluate(el => document.activeElement === el), true);
  assert.match(await input.inputValue(), /@lee $/);

  await page.locator('[data-ely-mention="lee"]').first().evaluate(el => { el.style.position = ''; el.style.left = ''; el.style.top = ''; });
  await page.locator('#msg-root-transcript').evaluate(el => { el.dataset.elyProfileUrl = 'https://unsafe.example/profile'; });
  const safeProfileRequests = profileRequests, safeMentionRequests = mentionRequests;
  await page.locator('[data-ely-mention="김대리"]').click();
  await page.waitForTimeout(150);
  assert.equal(profileRequests, safeProfileRequests);
  await page.locator('#msg-root [data-ely-popover-close]').click();
  await page.locator('#comp-root .ely-chat-composer').evaluate(el => { el.dataset.elyMentionSrc = 'https://unsafe.example/mentions'; });
  await page.locator('#comp-root').evaluate(root => root.dispatchEvent(new CustomEvent('ely:mention-refresh', {bubbles: true})));
  await page.waitForTimeout(150);
  assert.equal(mentionRequests, safeMentionRequests);
  await page.waitForTimeout(400);
  typingRequests.length = 0;
  await page.locator('#comp-root .ely-chat-composer').evaluate(el => { el.dataset.elyMentionSrc = '/api/mentions'; el.dataset.elyTypingUrl = 'https://unsafe.example/typing'; });
  await input.fill('Unsafe typing');
  await page.waitForTimeout(350);
  assert.equal(typingRequests.length, 0);
  await page.locator('#comp-root .ely-chat-composer').evaluate(el => { el.dataset.elyTypingUrl = '/api/typing'; });
  await page.locator('[data-ely-delete-open="m1"]').click();
  for (const scope of ['everyone', 'me']) {
    const button = page.locator(`#msg-root [data-ely-delete-choice="${scope}"]`);
    await button.evaluate(el => { el.dataset.elyDeleteUrl = 'https://unsafe.example/delete'; delete el.dataset.elyDeleteResolved; });
    await button.click();
    assert.equal(await page.locator('#msg-root [data-message-id="m1"]').count(), 1);
    assert.equal(deleteRequests, 0);
    if (scope === 'everyone') await page.locator('[data-ely-delete-open="m1"]').click();
  }
  await page.locator('#msg-root [data-ely-delete-choice="everyone"]').evaluate(el => { el.dataset.elyDeleteUrl = '/api/messages/{id}/for-everyone'; });
  await page.locator('#msg-root [data-ely-delete-choice="me"]').evaluate(el => { el.dataset.elyDeleteUrl = '/api/messages/{id}/for-me'; });
  assert.deepEqual(unsafeRequests, []);

  await page.locator('[data-message-id="m2"]').evaluate(el => { delete el.dataset.senderName; });
  await page.locator('[data-message-id="m2"] [data-ely-reply-open]').click();
  assert.equal(await page.locator('#comp-root [data-ely-quote-author]').textContent(), 'Kim');
  assert.equal(await page.locator('#comp-root [data-ely-reply-to]').inputValue(), 'm2');
  assert.equal(await input.evaluate(el => document.activeElement === el), true);
  const mainValue = await input.inputValue(), otherValue = await page.locator('#other-comp input[name="body"]').inputValue();
  await page.locator('#other-root [data-ely-reply-open]').click();
  assert.equal(await page.locator('#other-comp [data-ely-reply-quote]').evaluate(el => el.hidden), true);
  assert.equal(await page.locator('#other-comp input[name="body"]').inputValue(), otherValue);
  assert.equal(await input.inputValue(), mainValue);

  await page.locator('[data-message-id="m2"] [data-ely-message-body]').evaluate(body => body.replaceChildren(document.createTextNode('Replaced @김대리')));
  await page.waitForSelector('[data-message-id="m2"] [data-ely-mention="김대리"]');

  await page.evaluate(() => {
    window.__deleteActions = 0;
    window.__deleteChanges = 0;
    document.getElementById('msg-root').addEventListener('ely:action', event => { if (event.detail?.action === 'delete-message') window.__deleteActions++; });
    document.getElementById('msg-root').addEventListener('ely:change', event => { if (event.detail?.name === 'delete-message') window.__deleteChanges++; });
  });
  await page.locator('[data-ely-delete-open="m1"]').click();
  const everyoneDelete = page.locator('#msg-root [data-ely-delete-choice="everyone"]');
  assert.equal(await everyoneDelete.getAttribute('data-ely-delete-resolved'), 'http://test.local/api/messages/m1/for-everyone');
  assert.equal(await everyoneDelete.getAttribute('hx-delete'), null);
  await everyoneDelete.click();
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#msg-root [data-ely-delete-dialog]').evaluate(el => el.open), true, 'pending delete cannot be canceled');
  await page.waitForFunction(() => document.querySelector('#msg-root [data-ely-delete-status]').textContent === '<p>Delete failed</p>');
  assert.equal(deleteRequests, 1);
  assert.equal(await page.locator('#msg-root [data-message-id="m1"]').count(), 1);
  assert.equal(await page.locator('#other-root [data-message-id="m1"]').count(), 1);
  assert.equal(await page.locator('#msg-root [data-ely-delete-dialog]').evaluate(el => el.open), true);
  assert.equal(await page.locator('#msg-root [data-ely-delete-status] p').count(), 0);
  assert.deepEqual(await page.evaluate(() => [window.__deleteActions, window.__deleteChanges]), [1, 1]);
  assert.equal(new URL(deleteURLs[0]).searchParams.get('message_id'), 'm1');
  await everyoneDelete.click();
  await page.waitForFunction(() => !document.querySelector('#msg-root [data-message-id="m1"]') && !document.querySelector('#msg-root [data-ely-delete-dialog]').open);
  assert.equal(await page.locator('#other-root [data-message-id="m1"]').count(), 1);
  assert.equal(deleteRequests, 2);
  assert.deepEqual(await page.evaluate(() => [window.__deleteActions, window.__deleteChanges]), [2, 2]);

  await page.locator('#msg-root-transcript').evaluate(el => { el.scrollTop = 0; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(30);
  await page.evaluate(() => window.htmx.ajax('GET', '/oob', {target: '#msg-root-transcript', swap: 'none'}));
  await page.waitForSelector('[data-message-id="m3"] [data-ely-mention="김대리"]');
  await page.waitForSelector('[data-message-id="m4"].is-cont');
  assert.equal(await page.locator('#msg-root-transcript').evaluate(el => el.scrollTop), 0);
  await page.locator('[data-message-id="m3"]').evaluate(el => el.remove());
  await page.waitForFunction(() => !document.querySelector('[data-message-id="m4"]').classList.contains('is-cont'));

  await page.locator('#msg-root-transcript').evaluate(el => { el.style.width = '180px'; el.scrollTop = 0; });
  await page.evaluate(() => { window.__swipe = null; document.getElementById('msg-root').addEventListener('ely:action', event => { if (event.detail?.action === 'reply-swipe') window.__swipe = event.detail; }); });
  const swipeRow = page.locator('[data-message-id="f0"]');
  await swipeRow.scrollIntoViewIfNeeded();
  const swipeBox = await swipeRow.boundingBox();
  await page.mouse.move(swipeBox.x + 8, swipeBox.y + 8);
  await page.mouse.down();
  await page.mouse.move(swipeBox.x + 258, swipeBox.y + 8);
  assert.notEqual(await swipeRow.evaluate(el => el.style.transform), '');
  await page.mouse.up();
  await page.waitForFunction(() => window.__swipe?.messageId === 'f0');
  assert.deepEqual(await swipeRow.evaluate(el => ({transform: el.style.transform, ready: el.dataset.swipeReady || ''})), {transform: '', ready: ''});
  await page.locator('#msg-root-transcript').evaluate(el => { el.style.width = ''; });

  await page.locator('#msg-root-transcript').evaluate(el => { el.scrollTop = el.scrollHeight; el.dispatchEvent(new Event('scroll')); });
  await page.waitForTimeout(30);
  await page.evaluate(() => window.htmx.ajax('GET', '/oob-live', {target: '#msg-root-transcript', swap: 'none'}));
  await page.waitForFunction(() => document.querySelector('[data-message-id="o5"]'));
  await page.waitForFunction(() => { const el = document.querySelector('#msg-root-transcript'); return el.scrollHeight - el.scrollTop - el.clientHeight <= 36; });

  typingRequests.length = 0;
  typingFalseStarted = false;
  gateTyping = true;
  await input.fill('Typing once');
  for (let wait = 0; wait < 30 && !typingRequests.some(item => item.typing === true); wait++) await page.waitForTimeout(20);
  await page.waitForTimeout(320);
  assert.deepEqual(typingRequests.map(item => item.typing), [true], 'one debounced true request');
  assert.equal(typingFalseStarted, false, 'false waits for the pending true response');
  releaseTypingTrue();
  for (let wait = 0; wait < 30 && !typingFalseStarted; wait++) await page.waitForTimeout(20);
  assert.deepEqual(typingRequests.map(item => item.typing), [true, false], 'one ordered terminal false request');
  gateTyping = false;

  const viewport = await page.evaluate(() => {
    Object.defineProperty(window, 'innerHeight', {configurable: true, value: 700});
    Object.defineProperty(window.visualViewport, 'height', {configurable: true, value: 400});
    Object.defineProperty(window.visualViewport, 'offsetTop', {configurable: true, value: 120});
    window.visualViewport.dispatchEvent(new Event('resize'));
    const roots = [...document.querySelectorAll('[data-ely-family="communication"]')];
    const composer = document.querySelector('#comp-root .ely-chat-composer');
    return {offsets: roots.map(root => root.style.getPropertyValue('--ely-keyboard-offset')), position: getComputedStyle(composer).position, bottom: parseFloat(getComputedStyle(composer).bottom)};
  });
  assert.ok(viewport.offsets.every(value => value === '180px'));
  assert.equal(viewport.position, 'sticky');
  assert.equal(viewport.bottom, 180);
  await page.evaluate(() => { window.__removedComp = document.getElementById('comp-root'); window.__removedComp.remove(); });
  await page.waitForTimeout(30);
  const cleanup = await page.evaluate(() => {
    Object.defineProperty(window.visualViewport, 'height', {configurable: true, value: 100});
    window.visualViewport.dispatchEvent(new Event('resize'));
    return [window.__removedComp.style.getPropertyValue('--ely-keyboard-offset'), document.getElementById('msg-root').style.getPropertyValue('--ely-keyboard-offset')];
  });
  assert.deepEqual(cleanup, ['', '480px']);
  console.log('Messaging interaction gaps (#66) browser test passed');
} finally {
  releaseTypingTrue?.();
  await browser.close();
}
