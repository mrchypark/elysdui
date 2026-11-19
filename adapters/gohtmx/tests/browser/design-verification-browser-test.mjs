import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir, rm} from 'node:fs/promises';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const reservation = createServer();
await new Promise((resolve, reject) => {
  reservation.once('error', reject);
  reservation.listen(0, '127.0.0.1', resolve);
});
const port = reservation.address().port;
await new Promise(resolve => reservation.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const screenshotRoot = await mkdir(join(tmpdir(), 'ely-design-audit'), {recursive: true}).then(() => join(tmpdir(), 'ely-design-audit'));

const child = spawn('go', ['run', './adapters/gohtmx/tests/fixtures/design-audit'], {
  cwd: repo,
  env: {...process.env, PORT: String(port)},
  detached: process.platform !== 'win32',
  stdio: ['ignore', 'pipe', 'pipe'],
});

let output = '';
let startupError;
let browser;
const pageErrors = [];
const assetFailures = [];

child.stdout.on('data', chunk => { output += chunk; });
child.stderr.on('data', chunk => { output += chunk; });
child.once('error', err => { startupError = err; });

async function eventually(check, message, timeout = 30_000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (await check()) return;
    await delay(25);
  }
  throw new Error(message);
}

async function waitForReady(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  });
  await page.waitForFunction(() => {
    const families = [...document.querySelectorAll('[data-ely-family]')];
    return families.every(el => el.getAttribute('data-ely-ready') === 'true' || !el.hasAttribute('data-ely-error'));
  });
}

async function assertLayoutInvariants(page, route, viewportName) {
  const report = await page.evaluate(() => {
    const html = document.body.innerHTML;
    const hasTemplateLeak = html.includes('ZgotmplZ') || html.includes('<no value>');
    const docOverflow = document.documentElement.scrollWidth > document.documentElement.clientWidth + 1;

    const missingFamily = [...document.querySelectorAll('[data-ely-component]')].filter(
      el => !el.closest('[data-ely-family]')
    ).length;

    const sduiScreen = document.querySelector('[data-sdui-screen]');
    const orphanSduiNodes = sduiScreen
      ? [...document.querySelectorAll('[data-sdui-node]')].filter(el => !el.closest('[data-sdui-screen]')).length
      : 0;

    const collapsedControls = [...document.querySelectorAll('button, a, input:not([type="hidden"]), select, textarea')].filter(el => {
      if (el.closest('[hidden]') || el.closest('dialog:not([open])')) return false;
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = el.getBoundingClientRect();
      return rect.width <= 0 || rect.height <= 0;
    }).map(el => el.outerHTML.slice(0, 80));

    const pins = [...document.querySelectorAll('.ely-messaging-pins')].map(pin => {
      const header = pin.querySelector('header');
      const h2 = pin.querySelector('header h2');
      const row = pin.querySelector('li');
      const unpin = pin.querySelector('[data-ely-unpin]');
      const titleBtn = pin.querySelector('li > button:first-child');
      return {
        headerDisplay: header ? getComputedStyle(header).display : null,
        h2FontSize: h2 ? parseFloat(getComputedStyle(h2).fontSize) : null,
        rowDisplay: row ? getComputedStyle(row).display : null,
        unpinHeight: unpin ? unpin.getBoundingClientRect().height : null,
        titleOverflow: titleBtn ? titleBtn.scrollWidth > titleBtn.clientWidth + 2 : false,
      };
    });

    const avatarOverflow = [...document.querySelectorAll('.ely-communication-avatar')].filter(
      el => el.scrollWidth > el.clientWidth + 1
    ).length;

    const screenPaddingLeft = sduiScreen ? parseFloat(getComputedStyle(sduiScreen).paddingLeft) : null;

    return {
      hasTemplateLeak,
      docOverflow,
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
      missingFamily,
      orphanSduiNodes,
      collapsedControls,
      pins,
      avatarOverflow,
      screenPaddingLeft,
    };
  });

  assert.equal(report.hasTemplateLeak, false, `${route} (${viewportName}): template leak detected`);
  assert.equal(
    report.docOverflow,
    false,
    `${route} (${viewportName}): horizontal overflow (${report.scrollWidth} > ${report.clientWidth})`
  );
  assert.equal(report.missingFamily, 0, `${route} (${viewportName}): component missing [data-ely-family]`);
  assert.equal(report.orphanSduiNodes, 0, `${route} (${viewportName}): [data-sdui-node] outside [data-sdui-screen]`);
  assert.deepEqual(report.collapsedControls, [], `${route} (${viewportName}): collapsed controls found`);
  assert.equal(report.avatarOverflow, 0, `${route} (${viewportName}): avatar text overflow`);
  if (report.screenPaddingLeft !== null) {
    assert.ok(report.screenPaddingLeft >= 12, `${route} (${viewportName}): outer screen padding too small (${report.screenPaddingLeft}px)`);
  }
  for (const pin of report.pins) {
    assert.equal(pin.headerDisplay, 'flex', `${route} (${viewportName}): PinnedMessages header must be flex`);
    assert.ok(pin.h2FontSize !== null && pin.h2FontSize <= 18, `${route} (${viewportName}): PinnedMessages h2 too large (${pin.h2FontSize}px)`);
    assert.equal(pin.rowDisplay, 'flex', `${route} (${viewportName}): PinnedMessages row must be flex`);
    assert.ok(pin.unpinHeight !== null && pin.unpinHeight <= 40, `${route} (${viewportName}): Unpin button too tall (${pin.unpinHeight}px)`);
    assert.equal(pin.titleOverflow, false, `${route} (${viewportName}): PinnedMessages title overflowed`);
  }
}

async function launchBrowser() {
  const executablePath = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH;
  if (executablePath) {
    return chromium.launch({headless: true, executablePath});
  }
  try {
    return await chromium.launch({headless: true});
  } catch (err) {
    if (!String(err?.message || err).includes('Executable doesn\'t exist')) throw err;
    const {existsSync, readdirSync} = await import('node:fs');
    const {homedir} = await import('node:os');
    const cacheDir = join(homedir(), 'Library', 'Caches', 'ms-playwright');
    if (existsSync(cacheDir)) {
      for (const entry of readdirSync(cacheDir).sort().reverse()) {
        if (entry.startsWith('chromium_headless_shell-')) {
          const candidate = join(cacheDir, entry, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell');
          if (existsSync(candidate)) {
            return chromium.launch({headless: true, executablePath: candidate});
          }
        }
      }
    }
    return chromium.launch({headless: true, channel: 'chrome'});
  }
}

try {
  await eventually(async () => {
    if (startupError) throw startupError;
    if (child.exitCode !== null) throw new Error(`Go fixture exited (${child.exitCode}): ${output}`);
    try {
      return (await fetch(origin)).ok;
    } catch {
      return false;
    }
  }, `Go fixture server did not start: ${output}`, 60_000);

  browser = await launchBrowser();
  const viewports = [
    {name: 'mobile', width: 390, height: 844},
    {name: 'desktop', width: 1280, height: 800},
  ];
  const routes = ['/communication', '/sdui', '/families'];

  for (const vp of viewports) {
    const context = await browser.newContext({viewport: {width: vp.width, height: vp.height}, serviceWorkers: 'block'});
    await context.route('**/*', route => {
      if (route.request().url().startsWith(origin)) return route.continue();
      return route.abort();
    });
    const page = await context.newPage();
    page.on('pageerror', err => pageErrors.push(`${vp.name}: ${err}`));
    page.on('response', res => {
      if (new URL(res.url()).pathname.startsWith('/assets/') && res.status() >= 400) {
        assetFailures.push(`${res.status()} ${res.url()}`);
      }
    });

    for (const routePath of routes) {
      await page.goto(`${origin}${routePath}`, {waitUntil: 'networkidle'});
      await waitForReady(page);
      await assertLayoutInvariants(page, routePath, vp.name);

      const dir = join(screenshotRoot, vp.name);
      await mkdir(dir, {recursive: true});
      await page.screenshot({
        path: join(dir, `${routePath.slice(1)}.png`),
        fullPage: true,
        animations: 'disabled',
      });

      if (routePath === '/communication') {
        await page.click('#load-fragment');
        await page.waitForSelector('#swapped-pins');
        await waitForReady(page);
        await assertLayoutInvariants(page, `${routePath} (post-htmx-swap)`, vp.name);
      }
    }

    await context.close();
  }

  assert.deepEqual(pageErrors, [], `Page errors observed: ${pageErrors.join('; ')}`);
  assert.deepEqual(assetFailures, [], `Asset HTTP failures: ${assetFailures.join('; ')}`);
  console.log(`[design-verification] All mobile (390x844) & desktop (1280x800) checks passed. Screenshots: ${screenshotRoot}`);
} finally {
  if (browser) await browser.close();
  if (child.exitCode === null) {
    try {
      process.kill(process.platform === 'win32' ? child.pid : -child.pid, 'SIGTERM');
    } catch {}
  }
}
