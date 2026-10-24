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
const nativeCSS = readFileSync('ui/gohtmx/assets/ely-api-native.css', 'utf8');
assert(nativeCSS.includes("[data-ely-family='native'] .ely-misc-cookies{max-width:100%}"), 'Cookie panels must retain their preferred width without exceeding their containing block');
const desktopPromptGrid = nativeCSS.match(/\.ely-native-prompt-workbench\{([^}]*)\}/);
assert(desktopPromptGrid?.[1].includes('grid-template-columns:minmax(0,2fr) minmax(10rem,1fr)'), 'PromptPlayground keeps its desktop two-column layout');
assert(nativeCSS.includes("@media(max-width:34rem){[data-ely-family='native'] .ely-native-prompt-workbench{width:100%;max-width:100%;box-sizing:border-box;grid-template-columns:minmax(0,1fr);min-width:0}[data-ely-family='native'] .ely-native-prompt-workbench form{min-width:0}[data-ely-family='native'] .ely-native-prompt-workbench textarea{box-sizing:border-box;min-width:0;width:100%}}"), 'PromptPlayground must override its 520px desktop width and fit the narrow-screen grid, form, and textarea at 520px and below');
const agentTreeSummaryRule = communicationCSS.match(/\[data-ely-family='communication'\] \.ely-agent-tree summary\{([^}]*)\}/);
const agentTreeButtonRule = communicationCSS.match(/\[data-ely-family='communication'\] \.ely-agent-tree summary button\{([^}]*)\}/);
const agentTreeStatusRule = communicationCSS.match(/\[data-ely-family='communication'\] \.ely-agent-tree summary small\{([^}]*)\}/);
const agentTreeProgressRule = communicationCSS.match(/\[data-ely-family='communication'\] \.ely-agent-tree summary progress\{([^}]*)\}/);
assert(agentTreeSummaryRule?.[1].includes('flex-wrap:wrap'), 'SubAgentTree summaries must wrap rows when narrow');
assert(agentTreeButtonRule?.[1].includes('flex:1 1 auto') && agentTreeButtonRule[1].includes('min-width:0') && agentTreeButtonRule[1].includes('overflow-wrap:anywhere'), 'SubAgentTree labels must shrink and wrap without overflow');
assert(agentTreeStatusRule?.[1].includes('flex:0 1 auto') && agentTreeStatusRule[1].includes('min-width:0') && agentTreeStatusRule[1].includes('white-space:normal') && agentTreeStatusRule[1].includes('overflow-wrap:anywhere'), 'SubAgentTree status must wrap normally and break long tokens only as needed');
assert(agentTreeProgressRule?.[1].includes('flex:0 0 4rem') && agentTreeProgressRule[1].includes('min-width:4rem'), 'SubAgentTree progress must retain its usable width and wrap to another row');
assert(communicationCSS.includes("[data-ely-family='communication'] .ely-agent-tree details:not([open])>ul{display:none}"), 'SubAgentTree must hide child lists when native details closes, despite the shared ul grid rule');


for (const directory of ['ui/gohtmx/assets', 'internal/gallery/assets']) {
  for (const file of readdirSync(directory).filter(name => name.endsWith('.css'))) {
    const filename = `${directory}/${file}`;
    transform({filename, code: readFileSync(filename), errorRecovery: false});
  }
}
console.log('CSS syntax checks passed');
