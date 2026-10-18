import assert from 'node:assert/strict';
import {test} from 'node:test';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';

const source = readFileSync(new URL('../../assets/ely-api-interaction.js', import.meta.url), 'utf8');
const helper = source.slice(source.indexOf('let lottieLibraryPromise;'), source.indexOf('const closest ='));
function fixture(existing = false) {
  const scripts = [], window = {};
  const create = () => ({
    events: new Map(),
    addEventListener(type, fn) { this.events.set(type, fn); },
    removeEventListener(type) { this.events.delete(type); },
    dispatch(type) { this.events.get(type)?.(); },
    remove() { scripts.splice(scripts.indexOf(this), 1); },
  });
  if (existing) scripts.push(create());
  const document = {querySelector: () => scripts[0], createElement: create, head: {append: script => scripts.push(script)}};
  const load = runInNewContext(`${helper}\nloadLottieLibrary`, {window, document});
  return {load, window, scripts};
}

test('Lottie is absent until requested, shared across mounts, and reused after loading', async () => {
  const {load, window, scripts} = fixture();
  assert.equal(scripts.length, 0);
  const first = load(), second = load();
  assert.equal(first, second);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].src, '/assets/lottie-light.min.js');
  window.lottie = {loadAnimation() {}};
  scripts[0].dispatch('load');
  assert.equal(await first, window.lottie);
  assert.equal(await load(), window.lottie);
  assert.equal(scripts.length, 1);
  assert.equal(scripts[0].events.size, 0);
});

test('Lottie reuses a pending host script and does not download when already loaded', async () => {
  const {load, window, scripts} = fixture(true);
  const pending = load();
  assert.equal(scripts.length, 1);
  window.lottie = {loadAnimation() {}};
  scripts[0].dispatch('load');
  assert.equal(await pending, window.lottie);
  assert.equal(await load(), window.lottie);
  assert.equal(scripts.length, 1);
});

test('failed or invalid Lottie download is removed and a later mount can retry', async () => {
  for (const event of ['error', 'load']) {
    const {load, window, scripts} = fixture();
    const pending = load();
    const script = scripts[0];
    script.dispatch(event);
    await assert.rejects(pending, /Lottie library is unavailable/);
    assert.equal(script.events.size, 0);
    assert.equal(scripts.length, 0);
    const retry = load();
    assert.equal(scripts.length, 1);
    window.lottie = {loadAnimation() {}};
    scripts[0].dispatch('load');
    assert.equal(await retry, window.lottie);
  }
});

test('unmounted player does not fetch animation data after library resolves', async () => {
  const startCode = source.slice(source.indexOf('    const start = async () => {', source.indexOf("root.querySelectorAll('[data-interaction-lottie]')")), source.indexOf('    const clickLottie ='));
  let resolve, fetched = 0;
  const library = new Promise(done => { resolve = done; });
  const start = runInNewContext(`${startCode}\nstart`, {
    loadLottieLibrary: () => library, destroyed: true,
    data: () => { fetched++; }, fail: error => { throw error; },
  });
  const pending = start();
  resolve({loadAnimation() { throw new Error('must not mount a destroyed player'); }});
  await pending;
  assert.equal(fetched, 0);
});
