import assert from 'node:assert/strict';
import {readFile, readdir, mkdir, writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {parse} from 'acorn';

// Parsing, never executing, check registration source. This is NOT runtime proof.
export function auditSource(source, filename = '<fixture>') {
  const tree = parse(source, {ecmaVersion: 'latest', sourceType: 'module', locations: true});
  const issues = [], assignments = new Map();
  const issue = (node, message) => issues.push(`${filename}:${node.loc.start.line}: ${message}`);
  function walk(node) {
    if (!node || typeof node !== 'object') return;
    if (node.type === 'ObjectExpression') {
      const keys = new Set();
      for (const prop of node.properties) {
        if (prop.type !== 'Property') continue;
        const key = prop.computed ? (prop.key.type === 'Literal' ? String(prop.key.value) : null) : String(prop.key.name ?? prop.key.value);
        if (key === null) continue;
        if (keys.has(key)) issue(prop, `duplicate object key ${key} silently overwrites an assertion`);
        keys.add(key);
      }
    }
    if (node.type === 'AssignmentExpression' && node.left.type === 'MemberExpression' && node.left.object.name === 'checks' && node.left.computed && node.left.property.type === 'Literal') {
      const key = node.left.property.value;
      if (assignments.has(key)) issue(node, `duplicate checks[${JSON.stringify(key)}] assignment (first at line ${assignments.get(key)})`);
      assignments.set(key, node.loc.start.line);
    }
    for (const [key, child] of Object.entries(node)) {
      if (key === 'loc') continue;
      if (Array.isArray(child)) child.forEach(walk); else if (child && typeof child === 'object') walk(child);
    }
  }
  walk(tree);
  return issues;
}

export async function auditCheckSources() {
  const directory = new URL('../internal/gallery/assets/', import.meta.url);
  const files = (await readdir(directory)).filter(name => /^advanced-.*checks.*\.js$/.test(name)).sort();
  assert(files.length >= 10, 'check source discovery must not silently become empty');
  const issues = [];
  for (const file of files) issues.push(...auditSource(await readFile(new URL(file, directory), 'utf8'), file));
  return {kind: 'source-audit-only', runtimeExecuted: false, files, issues};
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const report = await auditCheckSources();
  await mkdir(new URL('../test-results/gallery/', import.meta.url), {recursive:true});
  await writeFile(new URL('../test-results/gallery/check-source-audit.json', import.meta.url), JSON.stringify(report, null, 2));
  assert.deepEqual(report.issues, [], 'check source quality violations');
  console.log(`Audited ${report.files.length} check source files; runtime execution remains unverified.`);
}
