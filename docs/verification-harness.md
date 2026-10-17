# Scoped browser evidence and test-quality controls

The gallery is a fixture suite, not a full-support certification. A check can
establish a caller-facing static rendering contract, an interaction, a host
callback, or merely a displayed limitation. An assertion count does not establish
complete upstream parity. The completion ledger separately tracks contract
obligations; registration must never be counted as execution.

## Repaired false-positive paths

The source audit of revision `163f1c5112f642a7e13cd2dcec8a7dd89bb2b8c5`
found four silent overwrites:

- `advanced-foundation-checks.js`: duplicate `actions.icon` discarded the
  bundled-mask URL assertion. One check now requires a nonempty icon set, bundled
  URLs, size variants and tone specimens.
- `advanced-communication-checks.js`: duplicate `chat/ChatContainer` discarded
  message/structured-point checks. The single check now checks the current
  transcript markup, user and grouped messages, a caller-supplied structured point
  and the scroll callback. The fixture supplies that point; obsolete selectors
  are not retained as dead test code.
- `advanced-forms-checks.js`: duplicate `forms/ColorPicker` assignment discarded
  plane, hue, palette and hex checks. These run before the format/channel/alpha
  checks in one function.
- The same file assigned `account/TwoFactorInput` twice, discarding the recovery
  action. The single test checks aggregate PIN, exactly-once verification, host
  rejection clearing, and recovery action.

`npm test` parses all gallery check-source files with Acorn and rejects duplicate
object keys and repeated literal `checks[...]` assignments. Tests intentionally
supply both defects and a syntax error to prove detection. Computed expressions
are not statically resolved; the runtime registry independently rejects duplicate
registered keys and nonfunctions. Registration remains discovery only.

## Known narrow checks

- The SystemNotification, QuickLauncher, NativeMenu and WindowResizeBorder
  default shell fixtures test notes/declared platform limitations, not OS work or
  alternate non-note branches. Results identify these as `source-note-only`.
- A selector's presence or a progress/meter element does not establish a chart,
  transition, keyboard flow or complete property contract. Such checks must be
  interpreted by their assertions, not the component name. Project charts have
  separate geometry/interaction tests.
- Synthetic host responses cannot prove external persistence, authentication,
  payment, AI, device, or collaboration services.
- Aliases reuse canonical checks; passing aliases does not establish every
  alias-specific schema difference.

## Execution and evidence gates

Commit source changes first: browser evidence refuses a dirty source tree to avoid
labelling uncommitted tests with a different HEAD. Run `npm run test:browser` for live browser tests. After building Pages, run
`GALLERY_STATIC=1 node scripts/gallery-browser-test.mjs` followed by
`node scripts/verify-gallery-evidence.mjs static`.

Each complete report records its Git revision, `evidenceKind: browser-execution`,
scoped case IDs (`gallery:<qualified-name>`), check IDs
(`gallery-check:<canonical-key>`), actual component assertion counts, and
`fullContractVerified: false`. The validator requires all 646 pages, seven
families and 1,313 distinct named cases, with exact name/key/family identity
equality against `go run ./cmd/gallery-check-inventory` (the current public
registry and catalogue). It also checks exact page paths and mutation error/check
identities, with no skips, missing assertions, failed
runtime checks or stale revision. These denominators describe this fixture suite,
not all possible component features.

Three negative controls run in fresh real Chromium pages against the exact
registered Foundation checks. Each first passes its unchanged baseline, then
removes a bundled icon URL, removes the 32px icon specimen, or suppresses Portal
click handling. The check must fail with its specific expected error. A surviving
mutation, missing control, setup error, or zero-assertion baseline fails the run.
Console lines identify each detected mutation. JSON retains the observed failure.
These controls establish sensitivity of those three assertions only; they do not
mutation-test every registered check.

`gallery-evidence-test.mjs` feeds deliberately corrupt synthetic reports to the
validator. Those unit-test fixtures are not browser execution evidence. CI must
run Chromium and validate the produced report; merely committing tests or
passing the unit suite is insufficient. Failed launches are failures, never skips.
