# GPUI mobile catalogue verification

Status: in progress. A rendered fixture or a generic click does not establish that
its interactions, payload, disabled behavior, and state restoration work.

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

## Known gaps

- Generic fixture probes have no per-component behavioral oracle. They are not
  evidence that all 1,361 contracts work on mobile. Full iOS and Android
  component-by-component verification remains outstanding.
- Source review identified missing selection for VirtualList and InfiniteList;
  incomplete grouped/paged DataTable behavior; and generic dialog behavior
  that does not yet match its full catalogue contract. These require targeted
  implementations and behavior tests.
- Android emulator rapid chapter switching produced an input timeout and GPU
  fence hang, including a system-process ANR. Restarting the emulator and
  switching more slowly allowed the forms check. The underlying cause remains
  unconfirmed; this is not a device performance result.
- The disabled prompt's event guard is tested, but the upstream SendButton can
  still appear enabled for a nonempty disabled field. File drop and attachment
  removal were not exercised on a device.
