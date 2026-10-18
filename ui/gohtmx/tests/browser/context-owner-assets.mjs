import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {extname, join} from 'node:path';
import {mutateContextOwnerSource} from './context-owner-controls.mjs';

const sha = value => createHash('sha256').update(value).digest('hex');
const origin = 'http://context-owner-fixture.invalid';
export const contextOwnerAssetRoots = [
 '/assets/app.css', '/assets/ely-api.css', '/assets/ely-api-interaction.css',
 '/assets/htmx.min.js', '/assets/ely-api-interaction-entry.js',
 '/assets/ely-api.js', '/assets/ely-api-interaction.js',
];
export function productionContentType(path) {
 return ({'.css':'text/css; charset=utf-8','.js':'text/javascript; charset=utf-8',
  '.svg':'image/svg+xml','.ttf':'font/ttf','.otf':'font/otf',
  '.woff':'font/woff','.woff2':'font/woff2','.png':'image/png',
  '.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp',
 })[extname(path)] || 'application/octet-stream';
}
export function productionCSSReferences(css, path) {
 const references = new Set();
 for (const match of css.matchAll(/url\(\s*(?:"([^"]*)"|'([^']*)'|([^)]*?))\s*\)/g)) {
  const value = (match[1] ?? match[2] ?? match[3]).trim();
  if (!value || value.startsWith('#') || value.startsWith('data:')) continue;
  const resolved = new URL(value, origin + path);
  if (resolved.origin !== origin || !resolved.pathname.startsWith('/assets/')) {
   throw new Error(`Production CSS reference is outside fixture assets: ${path} -> ${value}`);
  }
  references.add(resolved.pathname);
 }
 return [...references];
}

// Read exact bytes, including every local CSS-referenced font/image. Keeping
// binary font payloads as Buffers prevents accidental UTF-8 corruption. Missing
// dependencies fail before browser startup; they are never hidden by fallback
// fonts or weakened network/console error assertions.
export async function loadContextOwnerAssets(base, control, mutation = '') {
 const assets = new Map();
 const pending = contextOwnerAssetRoots.map(path => ({path, from:'document/runtime entry'}));
 for (let index=0;index<pending.length;index++) {
  const {path,from}=pending[index];
  if (assets.has(path)) { assets.get(path).referencedBy.add(from); continue; }
  const source=await readFile(join(base,'ui/gohtmx',path));
  const body=control && path==='/assets/ely-api-interaction.js'
   ? Buffer.from(mutateContextOwnerSource(source.toString('utf8'),control,mutation)) : source;
  assets.set(path,{body,contentType:productionContentType(path),sourceSHA256:sha(source),servedSHA256:sha(body),bytes:body.length,referencedBy:new Set([from])});
  if(path.endsWith('.css')) for(const reference of productionCSSReferences(source.toString('utf8'),path)) pending.push({path:reference,from:path});
 }
 return assets;
}
