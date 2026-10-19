// Finite CopyButton inventory. A report cannot choose its own passing subset.
export const copyValue = '<text> & "quoted"\n한글 📋';
const entry = (id, checkpoints, contracts, options = {}) => ({id, checkpoints: checkpoints.split(' '), contracts: contracts.split(' '), ...options});
export const copyCases = [
  ...['light','dark'].map(theme => entry('appearance-'+theme, 'idle hover pressed focus copied reset', 'U2 U3 U6 U7 W1 W2 W9', {theme})),
  ...['pointer','enter','space'].map(input => entry('activation-'+input, 'idle copied reset', 'U1 U3 U5 U6 W2 W4 W6', {input})),
  entry('cancelled-pointer', 'idle cancelled right-click', 'W2'),
  entry('exact-timing', 'idle pending delayed copied before-deadline deadline replayed', 'U6 U7 U8 W4 W9'),
  entry('reduced-motion', 'idle copied before-deadline deadline', 'U6 U7 W9', {reducedMotion: 'reduce'}),
  entry('repeat-lockout', 'idle pending repeated-pending copied repeated-copied before-deadline deadline replayed', 'U8 W2 W3 W4'),
  ...['reject','throw','missing'].map(failure => entry('failure-'+failure, 'idle failed retry', 'W4 W5 W6', {failure})),
  entry('empty-value', 'idle copied', 'U1 W1 W4 W6'),
  entry('captured-payload', 'idle pending copied', 'W1 W4 W6'),
  entry('cancelled-action', 'idle copied', 'W6'),
  entry('host-error', 'idle copied', 'W4 W6'),
  entry('disabled', 'idle attempted reset', 'U4 W3'),
  entry('roots-independent', 'idle pending b-first a-second b-reset a-reset', 'U1 U9 W7'),
  entry('items-independent', 'idle pending b-first a-second b-reset a-reset', 'U1 U9 W7'),
  ...['teardown','rebind'].map(operation => entry('callback-'+operation, 'idle returned deadline', 'U9 W6 W7 W8', {operation})),
  entry('pending-rebind', 'idle pending rebound settled fresh', 'U9 W7'),
  ...['moved','replaced'].map(operation => entry('child-'+operation, 'idle pending changed settled fresh', 'U9 W7', {operation})),
  ...['root','inner','control'].flatMap(swap => ['pending','copied'].map(phase => entry('htmx-'+swap+'-'+phase, 'idle active swapped settled fresh', 'U9 W7 W8', {swap, phase}))),
  entry('htmx-root-reject', 'idle active swapped settled fresh', 'U9 W5 W7 W8', {swap: 'root', phase: 'pending', reject: true}),
  entry('moved-copied', 'idle old-copied moved fresh old-deadline new-deadline', 'U9 W7 W8'),
  entry('same-node-remount', 'idle pending remounted settled fresh reset', 'U9 W7 W8'),
  entry('repeat-initialization', 'idle copied reinitialized deadline', 'U9 W8'),
  entry('tab-order', 'idle tab shift-tab copied reset', 'U3 W2 W9'),
  entry('explicit-override', 'idle copied', 'W1 W6'),
  entry('real-clipboard', 'idle copied read', 'U1 W4'),
  entry('real-clock', 'idle copied before-deadline reset', 'U6 W4 W9'),
  entry('missing-icon', 'idle copied', 'W2 W9'),
  entry('adapter', 'idle copied disabled', 'W1 W3 W10'),
  entry('narrow-zoom', 'idle copied reset', 'U2 W9', {zoom: 2}),
];
export const copyCaseIDs = copyCases.map(c => c.id);
export const copyRequiredSources = [
  'ui/gohtmx/tests/browser/copybutton-complete-cases.mjs',
  'ui/gohtmx/tests/browser/copybutton-complete-evidence.mjs',
  'ui/gohtmx/tests/browser/copybutton-complete-inputs.mjs',
  'ui/gohtmx/tests/browser/copybutton-complete-observer.js',
  'ui/gohtmx/tests/browser/copybutton-complete-browser-test.mjs',
  'ui/gohtmx/tests/fixtures/copybutton-complete/main.go',
  'ui/gohtmx/tests/fixtures/copybutton-complete/main_test.go',
  'scripts/copybutton-complete-evidence-test.mjs',
  'scripts/copybutton-complete-run.mjs',
  '.github/workflows/copybutton-complete.yml',
  'docs/gohtmx/copybutton-complete-contract.md',
];
export const copyRequiredBrowserPaths = ['/', '/copybutton-observer.js', '/assets/app.css', '/assets/ely-api.css', '/assets/ely-api-interaction.css', '/assets/htmx.min.js', '/assets/ely-api.js', '/assets/ely-api-interaction.js', '/assets/ely-api-interaction-entry.js'];
export const copyLimitations = {
  screenReader: 'Pending: actual screen-reader/browser/OS session for name, temporary unavailability, single polite announcements, tooltip duplication and focus through reset/replacement. DOM evidence is not AT evidence.',
  density: 'Standard density only: 24px control, 12px copy, 14px check, 6px radius. Compact/comfortable and global font/radius scaling have no accepted mapping in this slice.',
  adapter: 'Caller value/label/disabled use the shared renderer. Action/Icon/IconOnly manifest discrepancy is deferred; no adapter API-completeness claim.',
  native: 'GPUI mechanisms and native Enter/Space/AT synthesis are outside this HTML contract. Fixed upstream pins have no CopyButton difference.',
  clipboard: 'Chromium origin-scoped granted clipboard roundtrip only; denied permission prompt and other browser/OS-managed clipboard policies remain unverified.',
  tooltip: 'Web policy: visible Copy/Copied on hover and keyboard focus; no 400ms native TooltipTrigger requirement. Tooltip placement is a web adaptation.',
};
