# GPUI mobile catalogue verification

Status: in progress. A rendered fixture or a generic click does not establish that
its interactions, payload, disabled behavior, and state restoration work.
`MOBILE_CATALOGUE.csv` tracks all catalogue names separately. Its smoke column
only records the earlier generic fixture probe; `partial-*` records only the
specific device interactions named there, not full contract coverage.

## Verified behavior

- GPUI test windows: 390×844 mobile and 1280×800 desktop. All 2,166 fixture
  instances load and receive generic click, drag and key probes without a test
  error. These probes do not assert each fixture's expected behavior.
- Focused GPUI tests cover selected tabs and caller content; duplicate unbound
  input names; disabled prompt send with an enabled positive control; map marker
  and viewport events; select, slider, stepper, switch, table selection, and
  selected dialogs. See `tests/contract_tests.rs` and `tests/disabled_composer_test.rs`.
- Android emulator: in the forms chapter, selecting 2026-09-24 updates the
  selected date and emits a change event without the earlier ambiguous-source
  error. iOS simulator: map zoom, marker selection, stepper and switch were
  exercised in the preceding validation run. On the current build, the iOS
  navigation Tabs fixture initially showed Activity and its supplied content;
  tapping Overview changed both content and the recorded event.
- In 390×844 GPUI windows, VirtualList and InfiniteList preserve initial and
  multiple selection and emit caller values; DataTable filtering, grouping,
  row selection and paging have focused tests. On Android and iOS the first
  table fixture filtered to Live and emitted the filter payload; iOS also
  changed from page 1 to page 2. The Android check required an emulator restart.
- Focused 390×844 GPUI tests cover dialog open, cancel, confirm and required
  form validation; the catalogue dispatch is also tested. MailList tests cover
  star events, retained row selection, and state reset on screen reload.
- Android and iOS: the first AlertDialog fixture opened its profile form,
  submitted the caller-provided values as `ely:action`, and closed with Cancel.
  This covers that form scenario, not every dialog presentation or validation.
- Android: the MailItem fixture's star changed appearance and emitted a
  `star-mail` action containing the caller's item value.
- Android and iOS: MultiSelect retained Alpha, added Beta, and emitted both
  values. A nearby MonthPicker with the same name remained unchanged. On iOS,
  tapping a disabled option preserved the selection and event count. GPUI tests
  additionally cover disabled selections and duplicate-name isolation.
- Android and iOS: the TimePicker opened hour and minute choices and changed
  12:30 to 12:45 with the expected event. Focused GPUI tests cover time bounds,
  midnight wrapping, stable step bases, disabled state, and field isolation.
- iOS: the forms/Input fixture showed its initial `alpha` value. Typing `z`
  through the simulator's hardware input changed it to `alphaz` and emitted
  the corresponding change event. Switching away and reloading the fixture
  restored the caller's initial value. Software keyboard and other input
  contract variants remain unverified by this check.
- Android: the forms/Input fixture showed `alpha`; tapping `z` on the software
  keyboard changed it to `alphaz` and emitted the change event. The keyboard
  obscured the focused field. After Back hid it, tapping that still-focused
  field did not reopen it; `dumpsys input_method` reported `mInputShown=false`.
- Android: the forms/InputAddon fixture displayed its `@` prefix and initial
  value. The software keyboard changed `alpha` to `alphaz` and emitted the
  corresponding event. Its other variants and iOS remain unverified.
- iOS: account/AccountSwitcher opened its menu, switched from `work` to `home`
  with the displayed account and change event updated, and emitted an add event
  for the fixture's `add-account` action. Custom actions and disabled state
  need separate verification.
- Android: an upward touch swipe on the supplied VirtualList fixture brought
  rows 7 and 8 into view. On iOS the initial rows render but automated
  Simulator drag and scroll did not move the list; the input path and actual
  touch behavior need further investigation. A 390×844 GPUI test dispatching
  a touch-sourced scroll event moved the last row into view; it does not test
  UIKit touch delivery or the simulator automation path.

## Known gaps

- Generic fixture probes have no per-component behavioral oracle. They are not
  evidence that all 1,361 contracts work on mobile. Full iOS and Android
  component-by-component verification remains outstanding.
- Mobile touch mode is now the default. iPad and Android mouse/trackpad
  activation, touch scrollbar dragging, and narrow-screen overlay placement
  still need device checks. Source review found Playlist may activate twice on
  a mouse double-click and iOS scrollbar thumb dragging may not receive a drag.
- DataTable grouping and paging are not combined, and paging does not emit a
  page action. For dialogs, held generic forms can still be dismissed, prompt
  patterns use Rust rather than JavaScript regex syntax, unsupported patterns
  fail closed, and input types other than email lack browser-equivalent
  validation. The host's result-driven close behavior is not implemented.
  Other dialog presentations and validation paths still need device checks.
- Android emulator rapid chapter switching produced an input timeout and GPU
  fence hang, including a system-process ANR. Restarting the emulator and
  switching more slowly allowed the forms check. The underlying cause remains
  unconfirmed; this is not a device performance result.
  The SwiftShader emulator also later reported an app ANR with a stuck GPU
  fence while testing TagInput, preventing Android Add verification.
- The same emulator with host GPU exposed OpenGL ES 3.0 and could not create
  the GPUI renderer: the reported compute workgroup limit was zero. It was
  restored to SwiftShader, which can launch the app but had the fence hang above.
- The disabled prompt's event guard is tested, but the upstream SendButton can
  still appear enabled for a nonempty disabled field. File drop and attachment
  removal were not exercised on a device.
- Playlist single-touch activation and WebSocketConsole whitespace retention
  have GPUI tests; these fixes still need Android and iOS interaction checks.
- Android: removing the TableStructureEditor's fixed-height wrapper stopped it
  overlapping the following WebSocketConsole in the same fixture. Its toggle
  emitted the expected `toggle-socket` event. The layout regression test passes;
  other fixed-size wrappers still need an individual overflow audit.
- Source comparison found incomplete form contracts: NumberInput lacks
  a disabled/read-only presentation; checkbox option groups and switch item
  groups render as single controls; and Slider ignores vertical orientation.
  These findings need focused tests and implementation before device sign-off.
- TimePicker range limits and non-quarter-hour step bases have GPUI tests but
  need device checks. Seconds remain in the value but are not shown in option
  labels; unavailable choices lack a native disabled accessibility attribute.
- InlineForm has focused tests for form-scoped text values, repeated names,
  disabled and readonly fields. The Newsletter fixture displayed a full-width
  input on narrow Android and iOS screens; iOS showed a field-level required
  error on empty submission, cleared it while editing, and submitted a valid
  email with the expected event payload. Android also showed and cleared the
  required error, then submitted an email entered with the software keyboard
  with the expected event payload; the keyboard obscured the input while open.
  Other field types, multiple email addresses,
  and length or pattern constraints still need work; generic forms also need
  their own contract checks.
- TagInput initial values appeared on Android and iOS. On iOS typing a comma
  added a tag and removing it emitted the expected updated value. GPUI tests
  cover addition and removal too. The iOS simulator's software Return key did
  not commit a typed draft; its delivery path needs tracing. Android keyboard automation
  remains unconfirmed.
  With touch mode enabled by default, Add appeared on Android and iOS; iOS Add
  committed the draft and emitted the expected value. On Android, typing beta
  with the software keyboard, tapping Add and then removing beta emitted
  `alpha,beta` followed by `alpha`.
  InlineForm `dirname` submission remains unsupported; caller-provided error
  and description rendering has focused GPUI tests.
- Form submission still needs contract verification for repeated names,
  multi-value fields, disabled fields, and form ownership. The current generic
  submit snapshots internal state rather than browser-style form entries. A
  duplicate field name also changes lookups to node IDs; callers must use IDs
  for those fields until state identity and name lookup are separated.
- GraphQLExplorer and JSON/YAML/XML viewers contain content that may exceed
  their fixed-height wrappers. Their actual bounds and post-interaction layout
  remain unmeasured. SchemaTree intentionally uses a bounded scrollable tree.
