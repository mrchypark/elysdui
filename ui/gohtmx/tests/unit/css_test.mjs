import {readFileSync, readdirSync} from 'node:fs';
import {transform} from 'lightningcss';
import assert from 'node:assert/strict';

const styles = readdirSync('ui/gohtmx/assets').filter(name => name.endsWith('.css') && name !== 'app.css').map(name => readFileSync(`ui/gohtmx/assets/${name}`, 'utf8')).join('\n');
const tokens = new Set([...styles.matchAll(/(--[\w-]+)\s*:/g)].map(match => match[1]));
// Semantic references without their own fallback must resolve from the theme.
const assertDefinedSemanticColors = css => {
  for (const [, token] of css.matchAll(/var\((--(?:color-[\w-]+|background|muted|success|success-subtle|destructive|danger-subtle|info|fg|fg-muted|active|sunken|on-accent|on-media|accent|danger))\s*\)/g)) {
    assert(tokens.has(token), `Undefined semantic color token: ${token}`);
  }
};
assert.throws(() => assertDefinedSemanticColors('var(--info)'), /Undefined semantic color token: --info/);
assert.doesNotThrow(() => assertDefinedSemanticColors('var(--info, light-dark(#2e69b2, #77abec))'));
assert.throws(() => assertDefinedSemanticColors('var(--color-info, var(--info))'), /Undefined semantic color token: --info/);
assert.throws(() => assertDefinedSemanticColors('var(--info \t )'), /Undefined semantic color token: --info/);
assertDefinedSemanticColors(styles);

const communicationCSS = readFileSync('ui/gohtmx/assets/ely-api-communication.css', 'utf8');
const agentTreeStatusRules = [...communicationCSS.matchAll(/\.ely-agent-tree summary small\{([^}]*)\}/g)];
assert(agentTreeStatusRules.some(([, declarations]) => /(?:^|;)white-space:nowrap(?:;|$)/.test(declarations) && /(?:^|;)overflow-wrap:normal(?:;|$)/.test(declarations)), 'SubAgentTree status must stay on one line without arbitrary word breaks');


for (const directory of ['ui/gohtmx/assets', 'internal/gallery/assets']) {
  for (const file of readdirSync(directory).filter(name => name.endsWith('.css'))) {
    const filename = `${directory}/${file}`;
    transform({filename, code: readFileSync(filename), errorRecovery: false});
  }
}
console.log('CSS syntax checks passed');
