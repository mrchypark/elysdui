import {readFileSync, readdirSync} from 'node:fs';
import {transform} from 'lightningcss';
import assert from 'node:assert/strict';

const styles = readdirSync('ui/gohtmx/assets').filter(name => name.endsWith('.css') && name !== 'app.css').map(name => readFileSync(`ui/gohtmx/assets/${name}`, 'utf8')).join('\n');
const tokens = new Set([...styles.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
// A missing semantic token silently picks a light fallback in dark themes.
for (const [, token] of styles.matchAll(/var\((--(?:color-[\w-]+|background|muted|success|success-subtle|destructive|danger-subtle|info|fg|fg-muted|active|sunken|on-accent|on-media|accent|danger))(?=[,)])/g)) {
  assert(tokens.has(token), `Undefined semantic color token: ${token}`);
}


for (const directory of ['ui/gohtmx/assets', 'internal/gallery/assets']) {
  for (const file of readdirSync(directory).filter(name => name.endsWith('.css'))) {
    const filename = `${directory}/${file}`;
    transform({filename, code: readFileSync(filename), errorRecovery: false});
  }
}
console.log('CSS syntax checks passed');
