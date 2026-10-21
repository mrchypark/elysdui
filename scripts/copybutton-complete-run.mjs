import assert from 'node:assert/strict';
import {spawn, execFileSync} from 'node:child_process';
import {randomUUID} from 'node:crypto';
import {closeSync, openSync, writeSync} from 'node:fs';
import {mkdir, readFile, rm, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {loadCopyInputs, copySHA} from '../ui/gohtmx/tests/browser/copybutton-complete-inputs.mjs';
import {verifyCopyEvidence} from '../ui/gohtmx/tests/browser/copybutton-complete-evidence.mjs';
import {copyMode, copyOutputPath, verifyCopyMutation} from '../ui/gohtmx/tests/browser/copybutton-complete-mutants.mjs';
import {copyCases} from '../ui/gohtmx/tests/browser/copybutton-complete-cases.mjs';

const captureLimit = 16 * 1024 * 1024;
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
const exactKeys = (value, expected, label) => assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), label);
const textBytes = (value, label) => {
  assert(typeof value === 'string' || Buffer.isBuffer(value), label + ' must retain exact bytes');
  const bytes = Buffer.isBuffer(value) ? value : Buffer.from(value);
  const text = bytes.toString('utf8');
  assert(bytes.equals(Buffer.from(text)), label + ' must be valid UTF-8 without lossy decoding');
  return {bytes, text};
};

// Safe to import in offline synthetic tamper tests. An exit receipt alone is
// insufficient: the actual stdout must contain exactly one final completion,
// emitted after the browser has written these exact report bytes.
export function verifyProcessEvidence({reportBytes, stdout, stderr, exit}, invocation) {
  assert(uuid(invocation.runToken), 'independently generated invocation UUID required');
  const reportData = textBytes(reportBytes, 'report');
  const out = textBytes(stdout, 'stdout'), err = textBytes(stderr, 'stderr');
  assert(out.bytes.length + err.bytes.length <= captureLimit, 'complete process output within capture bound');
  assert.equal(err.text, '', 'unexpected process diagnostics remain red');
  exactKeys(exit, ['schema', 'runToken', 'revision', 'tree', 'status', 'signal', 'error', 'truncated'], 'process exit receipt schema');
  assert.equal(exit.schema, 'copybutton-process-exit-v1');
  for (const key of ['runToken', 'revision', 'tree']) assert.equal(exit[key], invocation[key], 'exit binding ' + key);
  assert.equal(exit.error, null, 'browser child spawn error');
  assert.equal(exit.signal, null, 'browser child terminated by signal');
  assert.equal(exit.truncated, false, 'browser child capture must be complete');
  assert([0, 1].includes(exit.status), 'browser child must exit normally with raw contract status');
  const report = JSON.parse(reportData.text);
  assert.equal(report.mode, invocation.mode, 'process externally selected mode');
  for (const key of ['runToken', 'revision', 'tree']) assert.equal(report[key], invocation[key], 'report process binding ' + key);
  assert.equal(report.stage, 'complete', 'completion requires a complete saved report');
  assert(['passed', 'failed'].includes(report.status), 'raw desired-contract report status');
  assert.equal(exit.status, report.status === 'passed' ? 0 : 1, 'report and actual process status agree');
  const expected = {copybuttonCompletion: 1, runToken: invocation.runToken, reportSHA256: copySHA(reportData.bytes), status: report.status};
  const completions = [];
  for (const line of out.text.split('\n')) {
    if (!line) continue;
    let value;
    try { value = JSON.parse(line); }
    catch {
      assert(!line.includes('copybuttonCompletion'), 'malformed completion is not an ordinary diagnostic');
      continue;
    }
    if (value && typeof value === 'object' && Object.hasOwn(value, 'copybuttonCompletion')) completions.push(value);
  }
  assert.deepEqual(completions, [expected], 'exactly one actual child completion bound to token, report bytes and status');
  assert(out.text.endsWith(JSON.stringify(expected) + '\n'), 'completion must be the final exact stdout line');
  return {schema: 'copybutton-process-validation-v1', runToken: invocation.runToken, status: report.status, rawExit: exit.status, reportSHA256: expected.reportSHA256, stdoutSHA256: copySHA(out.bytes), stderrSHA256: copySHA(err.bytes)};
}

// The report cannot select arbitrary paths, omit checkpoints, or attest to a
// screenshot that was never saved. Only tests inject the reader; the runner
// below reads source-owned relative paths under its fixed artifact directory.
export async function verifyCopyScreenshots(report, readScreenshot) {
  assert.equal(typeof readScreenshot, 'function', 'screenshot byte reader required');
  assert.deepEqual(report.checks.map(check => check.id), copyCases.map(spec => spec.id), 'source-owned screenshot case inventory');
  const entries = [];
  for (const [index, spec] of copyCases.entries()) {
    const screenshots = report.checks[index].raw.screenshots;
    exactKeys(screenshots, spec.checkpoints, 'exact screenshot checkpoint inventory: ' + spec.id);
    for (const checkpoint of spec.checkpoints) {
      const record = screenshots[checkpoint];
      exactKeys(record, ['path', 'sha256', 'bytes'], 'screenshot record schema');
      const path = `screenshots/${spec.id}-${checkpoint}.png`;
      assert.equal(record.path, path, 'exact source-owned screenshot path');
      const bytes = await readScreenshot(path);
      assert(Buffer.isBuffer(bytes), 'screenshot reader must preserve exact binary bytes');
      assert(bytes.length > 24 && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) && bytes.toString('ascii', 12, 16) === 'IHDR', 'saved screenshot must be a PNG');
      assert(bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(20) > 0, 'PNG screenshot dimensions must be positive');
      assert.equal(record.bytes, bytes.length, 'actual screenshot byte length: ' + path);
      assert.equal(record.sha256, copySHA(bytes), 'actual screenshot SHA256: ' + path);
      entries.push({path, bytes: bytes.length, sha256: copySHA(bytes)});
    }
  }
  return {screenshots: entries.length, digestSHA256: copySHA(JSON.stringify(entries))};
}

async function loadTrusted(base, mode) {
  const {assetBodies, fixtureBodies, ...trusted} = await loadCopyInputs(base, mode);
  verifyCopyMutation(trusted, mode);
  assert.equal(trusted.dirty, '', 'committed clean source required for browser evidence');
  return trusted;
}

// Tee exact raw chunks to artifact files and the workflow log. Retain the exit
// even on spawn errors, signals, excess output or ordinary desired failures.
async function captureBrowser(base, environment, output) {
  const descriptors = {};
  const captured = {stdout: [], stderr: []};
  let error = null, truncated = false, size = 0;
  try {
    descriptors.stdout = openSync(join(output, 'stdout.log'), 'w');
    descriptors.stderr = openSync(join(output, 'stderr.log'), 'w');
    return await new Promise(resolve => {
      const child = spawn(process.execPath, ['ui/gohtmx/tests/browser/copybutton-complete-browser-test.mjs'], {cwd: base, env: environment, stdio: ['ignore', 'pipe', 'pipe']});
      for (const kind of ['stdout', 'stderr']) child[kind].on('data', chunk => {
        size += chunk.length;
        if (size <= captureLimit) captured[kind].push(Buffer.from(chunk));
        try {
          writeSync(descriptors[kind], chunk);
          process[kind].write(chunk);
        } catch (failure) {
          error ??= String(failure);
          child.kill('SIGTERM');
        }
        if (size > captureLimit && !truncated) {
          truncated = true;
          error ??= 'browser process output exceeds 16 MiB';
          child.kill('SIGTERM');
        }
      });
      child.on('error', failure => { error ??= String(failure); });
      child.on('close', (status, signal) => resolve({status, signal, error, truncated, stdout: Buffer.concat(captured.stdout), stderr: Buffer.concat(captured.stderr)}));
    });
  } finally {
    for (const descriptor of Object.values(descriptors)) closeSync(descriptor);
  }
}

export async function runCopyEvidence(base, externalMode = 'control') {
  const mode = copyMode(externalMode);
  // This guard runs before schema execution, Go builds, output replacement and
  // any browser/server spawn. Importing this module never runs the workflow.
  assert.equal(process.env.CI, 'true', 'browser execution is restricted to CI');
  execFileSync(process.execPath, ['scripts/copybutton-complete-evidence-test.mjs'], {cwd: base, env: process.env, stdio: 'inherit'});
  const trusted = await loadTrusted(base, mode);
  const runToken = randomUUID(), invocation = {...trusted, runToken};
  const output = join(base, copyOutputPath(mode));
  await mkdir(output, {recursive: true});
  for (const file of ['report.json', 'exit.json', 'validation.json']) await rm(join(output, file), {force: true});
  const invocationBytes = JSON.stringify(invocation, null, 2) + '\n';
  await writeFile(join(output, 'invocation.json'), invocationBytes);
  const child = await captureBrowser(base, {...process.env, COPYBUTTON_COMPLETE_MODE: mode, COPYBUTTON_RUN_TOKEN: runToken, COPYBUTTON_INVOCATION_PATH: join(output, 'invocation.json')}, output);
  const exit = {schema: 'copybutton-process-exit-v1', runToken, revision: trusted.revision, tree: trusted.tree, status: child.status, signal: child.signal, error: child.error, truncated: child.truncated};
  const exitBytes = JSON.stringify(exit, null, 2) + '\n';
  await writeFile(join(output, 'exit.json'), exitBytes);

  const hashes = {invocation: copySHA(invocationBytes), report: null, exit: copySHA(exitBytes), stdout: copySHA(child.stdout), stderr: copySHA(child.stderr)};
  try {
    let reportBytes, reportReadFailure;
    try {
      reportBytes = await readFile(join(output, 'report.json'));
      hashes.report = copySHA(reportBytes);
    } catch (failure) { reportReadFailure = failure; }
    // No report, receipt or child-authored metadata supplies this second source
    // snapshot. The actual current checkout and compiler rebuild it afresh.
    const current = await loadTrusted(base, mode);
    assert.deepEqual(current, trusted, 'current source, generated fixtures, assets and toolchain unchanged after child');
    if (reportReadFailure) throw reportReadFailure;
    assert.equal(await readFile(join(output, 'invocation.json'), 'utf8'), invocationBytes, 'pre-spawn invocation cannot be rewritten by child');
    assert.equal(await readFile(join(output, 'exit.json'), 'utf8'), exitBytes, 'actual exit receipt bytes');
    const [stdout, stderr] = await Promise.all(['stdout.log', 'stderr.log'].map(file => readFile(join(output, file))));
    assert(stdout.equals(child.stdout), 'stdout artifact equals actual independently captured process bytes');
    assert(stderr.equals(child.stderr), 'stderr artifact equals actual independently captured process bytes');
    const report = JSON.parse(reportBytes.toString('utf8'));
    const evidence = verifyCopyEvidence(report, invocation, child.status);
    const processEvidence = verifyProcessEvidence({reportBytes, stdout: child.stdout, stderr: child.stderr, exit}, invocation);
    const screenshotEvidence = await verifyCopyScreenshots(report, path => readFile(join(output, path)));
    const receipt = {schema: 'copybutton-validation-v1', valid: true, revision: trusted.revision, tree: trusted.tree, runToken, status: report.status, rawExit: child.status, hashes, evidence, processEvidence, screenshotEvidence};
    receipt.digestSHA256 = copySHA(JSON.stringify(receipt));
    await writeFile(join(output, 'validation.json'), JSON.stringify(receipt, null, 2) + '\n');
    console.log(JSON.stringify({copybuttonEvidenceValidation: 'valid', runToken, status: report.status, rawExit: child.status, digestSHA256: receipt.digestSHA256}));
    // A structurally valid red desired baseline is still red CI. No broad
    // expected-failure conversion, skipped assertion, or mutant aggregation.
    return {status: child.status, receipt, report, invocation};
  } catch (failure) {
    const receipt = {schema: 'copybutton-validation-v1', valid: false, revision: trusted.revision, tree: trusted.tree, runToken, rawExit: child.status, hashes, error: String(failure.stack || failure)};
    receipt.digestSHA256 = copySHA(JSON.stringify(receipt));
    await writeFile(join(output, 'validation.json'), JSON.stringify(receipt, null, 2) + '\n');
    throw failure;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = await runCopyEvidence(fileURLToPath(new URL('../', import.meta.url)), copyMode(process.env.COPYBUTTON_COMPLETE_MODE || 'control'));
    process.exitCode = result.status;
  } catch (failure) {
    console.error(failure.stack || failure);
    process.exitCode = 1;
  }
}
