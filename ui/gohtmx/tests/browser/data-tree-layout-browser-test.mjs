import assert from 'node:assert/strict';
import {spawn, spawnSync} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdir, mkdtemp, readFile, writeFile, rm, access} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';

const repo = fileURLToPath(new URL('../../../../', import.meta.url));
const phase = process.env.DATA_TREE_PHASE || 'after';
assert(['before', 'after'].includes(phase));
const env = {...process.env, GOTOOLCHAIN: 'go1.26.9'};
const outputRoot = resolve(process.env.DATA_TREE_OUTPUT || join(repo, 'test-results/data-tree-layout'));
await mkdir(outputRoot, {recursive: true});
const output = await mkdtemp(join(outputRoot, `${phase}-`));
const temp = await mkdtemp(join(tmpdir(), 'ely-data-tree-'));
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const paths = ['ui/gohtmx/assets/ely-api-data.css', 'ui/gohtmx/templates/ely-api-data.html', 'internal/gallery/advanced_data_fixtures.go'];
const snapshot = async () => Object.fromEntries(await Promise.all(paths.map(async path => [path, hash(await readFile(join(repo, path)))])));
const run = (cmd, args) => {
  const result = spawnSync(cmd, args, {cwd: repo, env, encoding: 'utf8'});
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
};
const report = {phase, checks: [], cleanup: false};
let child, browser;
try {
  report.revision = run('git', ['rev-parse', 'HEAD']);
  report.go = run('go', ['version']);
  report.node = process.version;
  report.sourceHashes = await snapshot();
  run('go', ['build', '-o', join(temp, 'gallery'), './examples/gohtmx/gallery']);
  assert.deepEqual(await snapshot(), report.sourceHashes, 'source changed while building');
  const reservation = createServer();
  await new Promise(r => reservation.listen(0, '127.0.0.1', r));
  const port = reservation.address().port;
  await new Promise(r => reservation.close(r));
  const base = `http://127.0.0.1:${port}`;
  child = spawn(join(temp, 'gallery'), ['-addr', `127.0.0.1:${port}`], {stdio: 'ignore'});
  report.serverPID = child.pid;
  let ready = false;
  for (let i = 0; i < 200; i++) {
    try { if ((await fetch(base + '/components')).ok) { ready = true; break; } } catch {}
    await new Promise(r => setTimeout(r, 50));
  }
  assert(ready, 'owned gallery startup');
  browser = await chromium.launch({headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || undefined});
  for (const width of [1440, 390]) {
    const page = await browser.newPage({viewport: {width, height: 1000}});
    await page.goto(base + '/components/audit?family=data&aliases=1');
    await page.evaluate(() => document.fonts.ready);
    for (const name of ['Tree', 'TreeView', 'VirtualTree', 'FileTree']) {
      const card = page.locator(`[data-audit-name="lists/${name}"]`);
      const root = card.locator('[data-audit-main] > [data-ely-family]');
      const rows = await root.locator('[data-ely-tree-node]').evaluateAll(nodes => nodes.filter(node => node.getBoundingClientRect().height > 0).map(node => {
        const rect = n => { const r = n.getBoundingClientRect(); return {left: r.left, right: r.right, top: r.top, bottom: r.bottom}; };
        const text = node.children[1], icon = node.children[0], range = document.createRange();
        range.selectNodeContents(icon);
        const glyph = rect(range), label = rect(text), button = rect(node), status = node.querySelector('small');
        return {text: text.textContent, icon: icon.textContent, glyph, label, button, status: status ? rect(status) : null,
          ok: glyph.right + 2 <= label.left && label.right <= button.right + 1 && (!status || label.right <= status.getBoundingClientRect().left)};
      }));
      assert(rows.some(row => row.icon === 'rust'), `${name}: actual file-type text must be present`);
      const png = `${width}-${name}.png`;
      await root.screenshot({path: join(output, png)});
      report.checks.push({componentIdentity: `lists/${name}`, width, rows, png, sha256: hash(await readFile(join(output, png))), ok: rows.every(row => row.ok)});
      const branch = root.locator('details').first();
      await branch.locator(':scope > summary').evaluate(node => node.click());
      assert.equal(await branch.getAttribute('open'), null, `${name}: collapse`);
      await branch.locator(':scope > summary').evaluate(node => node.click());
      assert.notEqual(await branch.getAttribute('open'), null, `${name}: expand`);
      if (name === 'FileTree') {
        const file = root.locator('[data-ely-tree-node][data-value="sidebar"]');
        await file.focus();
        await file.press('Enter');
        assert.match(await root.locator('[data-ely-file-opened]').textContent(), /Opened sidebar\.rs/);
        await root.locator('[data-ely-file-filter]').fill('sidebar');
        assert(await root.locator('li[hidden]').count() > 0, 'filter still hides unrelated rows');
      }
    }
    await page.close();
  }
  assert.deepEqual(await snapshot(), report.sourceHashes, 'source changed during focused verification');
  const failed = report.checks.filter(check => !check.ok);
  report.failureCount = failed.length;
  if (phase === 'before') assert.equal(failed.length, 8, 'all four names must reproduce at both widths');
  else assert.equal(failed.length, 0, 'filename text must not overlap file-type text');
  report.status = 'passed';
} catch (error) { report.status = 'failed'; report.error = String(error); process.exitCode = 1; }
finally {
  if (browser) await browser.close();
  if (child && child.exitCode === null && child.signalCode === null) {
    const done = new Promise(r => child.once('exit', r));
    child.kill('SIGTERM');
    await Promise.race([done, new Promise(r => setTimeout(r, 3000))]);
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGKILL'); await done; }
  }
  await rm(temp, {recursive: true, force: true});
  let removed = false;
  try { await access(temp); } catch (error) { if (error.code === 'ENOENT') removed = true; else throw error; }
  report.cleanup = removed && (!child || child.exitCode !== null || child.signalCode !== null);
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
  console.log(JSON.stringify({status: report.status, error: report.error, failures: report.failureCount, output, cleanup: report.cleanup, node: process.version}));
}
