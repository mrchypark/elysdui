// Test-only mutations of the production core. Every mode retains all disposers.
// The browser runner keeps its real failure exit; the separate control verifier
// requires the designated behavioral failure plus passing unrelated safe cases.
export const cleanupRemountCoreControls = Object.freeze({
  'disable-deferral': {
    file: '/assets/ely-api.js',
    anchor: 'if (deferStart(root, scope)) return;',
    replacement: '/* Test-only mutation: start during old teardown. */',
    check: 'R2.reused and replaced descendants retain fresh seeded presentation',
    oracle: 'fresh seeded presentation survives every old disposer',
    browserOracle: 'presentation.seed-survives-old-disposers',
  },
  'disable-replay': {
    file: '/assets/ely-api.js',
    anchor: 'if (scope === document || scope.isConnected) start(scope);',
    replacement: '/* Test-only mutation: abandon the requested startup. */',
    check: 'R3.observer remount replays synchronously without a later event',
    oracle: 'queued startup must replay after teardown without another lifecycle event',
    browserOracle: 'readiness.fresh-owner-survives-old-cleanup',
  },
  'replay-before-last-disposer': {
    file: '/assets/ely-api.js',
    anchor: 'cleanups.forEach(cleanup => dispose(root, cleanup));',
    replacement: `cleanups.forEach((cleanup, index) => {
      if (index === cleanups.length - 1) {
        stopping.delete(root);
        for (const scope of teardown.starts) if (scope === document || scope.isConnected) start(scope);
      }
      dispose(root, cleanup);
    });`,
    check: 'R1.all old disposers precede fresh initialization',
    oracle: 'all old disposers must finish before fresh initialization',
    browserOracle: 'presentation.seed-survives-old-disposers',
  },
});
export function mutateCleanupRemountCore(source, name) {
  const control = cleanupRemountCoreControls[name];
  if (!control) throw new Error('Unknown cleanup/remount core control');
  if (source.split(control.anchor).length !== 2) throw new Error('Cleanup/remount core control requires exactly one unchanged anchor');
  return source.replace(control.anchor, control.replacement);
}
