export function captureSourceProvenance({baseURL, origin, sourceRevision, sourceTreeSHA256}) {
  const localSnapshot = {sourceRevision, sourceTreeSHA256, scope: 'runner-local-source-snapshot'};
  if (baseURL) return {
    status: 'unverified',
    servedOrigin: origin,
    sourceRevision: null,
    sourceTreeSHA256: null,
    localSnapshot,
    reason: 'Caller-supplied --base-url does not establish that the served page or assets came from the local source snapshot.',
  };
  return {
    status: 'verified',
    servedOrigin: origin,
    sourceRevision,
    sourceTreeSHA256,
    verification: 'runner-managed local build or export',
  };
}
