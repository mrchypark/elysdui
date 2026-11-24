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
      await route.fulfill({
        status: 200,
        contentType: file.endsWith('.css') ? 'text/css' : 'application/javascript',
        body: readFileSync(file),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><meta charset="utf-8">
        <link rel="stylesheet" href="/assets/ely-controls.css">
        <link rel="stylesheet" href="/assets/ely-patterns.css">
        <link rel="stylesheet" href="/assets/ely-api-interaction.css">
      </head><body style="margin:0;padding:16px;min-height:844px;box-sizing:border-box">
        <div style="display:flex;justify-content:flex-end">
          <section id="drop-root" data-ely-family="interaction" data-ely-kind="DropdownMenu" data-ely-component="menus/DropdownMenu">
            <div class="ely-interaction__split" data-interaction-host="dropdown">
              <button type="button" aria-haspopup="menu" aria-controls="drop1-menu" aria-expanded="false" data-interaction-menu="drop1-menu">Actions <span class="ely-interaction__chevron" aria-hidden="true">⌄</span></button>
              <div id="drop1-menu" role="menu" tabindex="-1" aria-label="Actions" hidden>
                <div class="ely-interaction__menu-row"><button type="button" role="menuitem" data-ely-action="edit"><span data-interaction-menu-label>Very Long Action Label Here</span></button></div>
              </div>
            </div>
          </section>
        </div>

        <div style="position:fixed;right:12px;bottom:140px">
          <div class="ui-menu" data-ui-component="menu" id="pat-menu">
            <button type="button" popovertarget="pat-menu-popup" data-ui-menu-trigger aria-expanded="false" aria-controls="pat-menu-popup">Menu</button>
            <div class="ui-menu-panel" id="pat-menu-popup" popover role="menu" aria-label="Menu">
              <button type="button" role="menuitem">First option</button>
              <button type="button" role="menuitem">Second option</button>
              <button type="button" role="menuitem">Third option</button>
            </div>
          </div>
        </div>

        <div style="position:fixed;left:16px;right:16px;bottom:16px">
          <div id="combo1" data-ui-component="combobox">
            <input id="combo1-value" type="hidden" name="country" value="">
            <input id="combo1-input" type="text" role="combobox" data-ui-combobox-input="true" aria-autocomplete="list" aria-haspopup="listbox" aria-expanded="false" aria-controls="combo1-listbox">
            <ul id="combo1-listbox" role="listbox" data-ui-combobox-list hidden>
              <li id="combo1-opt-0" role="option" data-ui-option data-ui-label="Korea" data-value="kr"><span>Korea</span></li>
              <li id="combo1-opt-1" role="option" data-ui-option data-ui-label="Japan" data-value="jp"><span>Japan</span></li>
            </ul>
          </div>
        </div>

        <script src="/assets/ely-controls.js"></script>
        <script src="/assets/ely-patterns.js"></script>
        <script type="module" src="/assets/ely-api-interaction-entry.js"></script>
      </body></html>`,
    });
  });

  await page.goto('http://test.local/', {waitUntil: 'networkidle'});
  await page.waitForSelector('#drop-root[data-ely-ready="true"]');

  // 1. Standalone DropdownMenu: hidden by default, clamps inside right edge when opened, z-index >= 40
  assert.equal(await page.$eval('#drop1-menu', el => getComputedStyle(el).display), 'none');
  assert.ok(Number(await page.$eval('#drop1-menu', el => getComputedStyle(el).zIndex)) >= 40);
  await page.click('[data-interaction-menu="drop1-menu"]');
  const dropRect = await page.$eval('#drop1-menu', el => el.getBoundingClientRect().toJSON());
  assert.ok(dropRect.right <= 390 && dropRect.left >= 0, `DropdownMenu overflowed viewport: ${JSON.stringify(dropRect)}`);

  // 2. Pattern menu popover: stays inside viewport near bottom-right corner
  await page.click('[data-ui-menu-trigger]');
  const patRect = await page.$eval('#pat-menu-popup', el => el.getBoundingClientRect().toJSON());
  assert.ok(patRect.right <= 390 && patRect.bottom <= 844 && patRect.left >= 0 && patRect.top >= 0, `Pattern menu overflowed viewport: ${JSON.stringify(patRect)}`);
  await page.keyboard.press('Escape');

  // 3. Combobox near bottom edge flips upward
  await page.click('#combo1-input');
  assert.equal(await page.isVisible('#combo1-listbox'), true);
  assert.equal(await page.getAttribute('#combo1-listbox', 'data-placement'), 'top');
  const [inputRect, listRect] = await page.evaluate(() => [
    document.getElementById('combo1-input').getBoundingClientRect().toJSON(),
    document.getElementById('combo1-listbox').getBoundingClientRect().toJSON(),
  ]);
  assert.ok(listRect.bottom <= inputRect.top + 1 && listRect.top >= 0, `Combobox did not flip cleanly: input=${JSON.stringify(inputRect)} list=${JSON.stringify(listRect)}`);

  console.log('Dropdown stability browser test passed');
} finally {
  await browser.close();
}
