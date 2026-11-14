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
- Android: an upward touch swipe on the supplied VirtualList fixture brought
  rows 7 and 8 into view. On iOS the initial rows render but automated
  Simulator drag and scroll did not move the list; the input path and actual
  touch behavior need further investigation.

## Known gaps

- Generic fixture probes have no per-component behavioral oracle. They are not
  evidence that all 1,361 contracts work on mobile. Full iOS and Android
  component-by-component verification remains outstanding.
- DataTable grouping and paging are not combined, and paging does not emit a
  page action. For dialogs, held generic forms can still be dismissed, HTML
  pattern validation fails closed, and native input-type validation and the
  host's result-driven close behavior are not implemented. Other dialog
  presentations and validation paths still need device interaction checks.
- Android emulator rapid chapter switching produced an input timeout and GPU
  fence hang, including a system-process ANR. Restarting the emulator and
  switching more slowly allowed the forms check. The underlying cause remains
  unconfirmed; this is not a device performance result.
- The same emulator with host GPU exposed OpenGL ES 3.0 and could not create
  the GPUI renderer: the reported compute workgroup limit was zero. It was
  restored to SwiftShader, which can launch the app but had the fence hang above.
- The disabled prompt's event guard is tested, but the upstream SendButton can
  still appear enabled for a nonempty disabled field. File drop and attachment
  removal were not exercised on a device.
