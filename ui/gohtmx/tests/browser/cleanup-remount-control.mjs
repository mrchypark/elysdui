// Diagnostic causal intervention only. Removing normal teardown is NOT a fix.
// The same desired oracles run, including the normal-detach close assertion.
// A mutant run retains its real nonzero exit; there is no expected-red success.
export const cleanupRemountControl = Object.freeze({
  name: 'elide-close',
  file: '/assets/ely-api-interaction.js',
  anchor: 'const cleanup = () => { paletteNavigationActive = false; close(); cleanupContextRequests();',
  replacement: 'const cleanup = () => { paletteNavigationActive = false; cleanupContextRequests();',
});
export function elideCleanupClose(source) {
  const {anchor, replacement} = cleanupRemountControl;
  if (source.split(anchor).length !== 2) throw new Error('Cleanup close control requires exactly one unchanged anchor');
  return source.replace(anchor, replacement);
}
