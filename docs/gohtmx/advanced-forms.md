# Advanced forms API

Alias components preserve their native control semantics without requiring fixture-only `Type` values. `DateTimePicker`, `TimePicker`, `WeekPicker`, `YearPicker`, and `RadioCard` render their matching native input types. `QuarterPicker` renders Q1–Q4 with an optional `Name_year` numeric field when `Year` or `YearLabel` is present. `TimezoneSelect` renders a native select. `DurationPicker` renders a non-negative numeric value and a unit select from `UnitsOptions`, falling back to `Options`.

`RangeSlider` keeps its start value at or below its end value. The client clamps an end value below the start and updates each native range bound.

`ChoiceChips` uses one caller value; its `FilterChips` alias uses comma-separated selected values and leaves disabled options unchanged. Their optional `Caption` supplies specimen text below the control. `Rating` clears when its selected star is pressed again. `Slider` accepts `Vertical`; `RangeSlider` adds `End`; `Knob` and `Dial` provide pointer and Arrow-key controls, while `Stepper` changes the same caller numeric value with its buttons. `Calendar` preserves its shared keyboard calendar and takes an ISO `Value`. `DatePicker` accepts `Width`; its range, date-time, and time aliases keep native values and the range validates its end date.


`CurrencyInput` accepts `Prefix` and `Suffix`; each is presented inside the grouped currency control. `InlineForm` lays out caller `Fields` with its submit button in one wrapping row and omits the reset control used by `Form`.

`ExpressionInput` evaluates a caller expression as it changes and reports the result. `HotkeyInput` records a focused key chord while Tab keeps focus navigation. `Checkbox` accepts optional `ParentLabel` for an indeterminate parent over caller `Options`; `Radio`, `CheckboxCard`, and `Switch` preserve each option or item’s disabled state, copy, and selected value. Input, TextArea, PasswordInput, SearchInput, NumberInput, and ScrubInput accept optional discrete `Width` or `MaxWidth` values (`160`, `200`, `220`, `240`, `260`, `320`, `360`, or `420`) for bounded specimens without changing a consumer form’s default width.

`InputGroup` accepts `Prefix`, `Suffix`, optional `SuffixIcon`, and `SuffixAction`. `MentionInput` opens matching caller options after `@` or `#`; Arrow keys and Enter select a visible match. `TagInput` takes a comma-delimited `Value`, adds an entered tag on Enter, and submits the resulting list. `KeyValueInput` supports per-item disabled rows and preserves add/remove behavior for mixed editable rows. `PathInput` emits its caller `Action` with the current typed path for the host to open a picker; it never implements a system picker itself. `RegexInput` accepts `Compact` for a single pattern field with immediate valid/invalid status; its full form also accepts `Text` and `Flags` for evaluation.

`Select`, `ListBox`, `Combobox`, `MultiSelect`, `CascadeSelect`, and `TransferList` keep caller `Options` as their submitted values. `Combobox` accepts `Free` for caller text outside its options; `MultiSelect` renders selected values as removable chips and removes the final chip with Backspace; `CascadeSelect` accepts `SelectedPath` as comma-separated option values and `PathLabel` for its trigger; `TransferList` accepts `SelectedLabel` and `Size`. `ColorPicker` uses caller `Options` as palette choices and keeps its saturation/value plane, hue rail, native color input, hexadecimal field, and RGB channels synchronized. `FontPicker` filters its caller `Options` and previews the selected family. `IconPicker` submits `ui.Option.Value` independently from optional `ui.Option.Icon` and `ui.Option.Glyph`. `Icon` must name a bundled Foundation SVG; missing or unknown icons use `Glyph`, then a text fallback.

`SettingsLayout` field entries accept `Key`, `Keywords`, and `Action`. Search matches the label, section, and keywords. Choosing a result focuses the field and emits its `Action`, or `select-setting`, with `detail.key`.

`SettingsLayout` renders each caller section as a sidebar tab and panel. The tabs use Arrow Up and Arrow Down for keyboard focus; activation selects the matching panel.

`AccountSwitcher` uses `Items` with `Value`, `Label`, and optional `Text` for an account detail line. It emits `switch-account` with `detail.value`; `AddAction` enables the optional add-account menu item and emits that action. The menu supports Arrow keys and Escape.

`MagicLinkForm` and its `ForgotPassword` alias accept their email form labels and caller actions; optional `OtherAction` and `BackAction` add the matching alternate-sign-in links. `TwoFactorInput` provides a six-slot PIN control and a caller-configurable `RecoveryAction`.

`ProfileCard` and `ProfileEditor` accept `DisplayName`, `Role`, `Presence`, `Text`, `Email`, `Location`, action `Options`, and editable `Fields`. `SessionList` accepts device rows through `Items` (`Icon`, `Label`, `Text`, `Place`, `Time`, `Current`) plus optional `OthersAction`. `SubscriptionCard` accepts plan `Plan`, `Standing`, `Price`, `Currency`, quota `Items` (`Label`, `Text`, `Value`, `Max`), and action `Options`; `PaymentMethodForm` remains its dedicated alias.

`CoordinateDisplay` renders `Value` and an optional caller-provided `DMS` value. Both have copy buttons. `DecimalLabel` and `DMSLabel` provide optional specimen captions. Copy uses the native clipboard on a user click and reports a visible failure if unavailable. Map variants retain their supplied `Points`, `Routes`, and inline `GeoJSON`.

`OnboardingWizard` disables inactive steps, announces “Step n of total,” and updates its native progress element. `SkipAction` enables Skip for now and emits the configured action with `detail.step`. It submits values from every visited step in the existing `finish` event payload. An empty wizard shows its empty text and disables its controls.

`ImportExportSettings` validates the current JSON before it emits `import-settings` or `export-settings`. Each action event contains the parsed caller data in `detail.data`; it does not claim that settings were saved.

`ApiKeyManager`, `InvitationList`, `PaymentMethodForm`, and `Paywall` have dedicated markup and emit their caller-provided actions. `ApiKeyManager` accepts `APIKeys`, `APIKeyFields`, `CreateAction`, and `CreateActionLabel` for its records and local create form. Authentication forms accept `EmailPlaceholder` when their caller needs a neutral email prompt. `WhatsNewDialog` uses a native dialog. Its instance-local trigger opens it, `Open` opens it initially, and its close button emits `dismiss`.

`Coachmark` and `Hotspot` open caller copy beside the highlighted toolbar control and return focus after dismissal. `FeatureHighlight` and `NewBadge` render a dismissible card with a local restore control. `HelpPanel` searches caller `Items`, opens an article by `Value`, restores focus to search on return, and emits caller `FooterActions` through their `Action` values. `FeedbackWidget` uses caller `Options` (`Value`, `Label`, optional `Glyph`); it submits optional `feedback` text with required `sentiment` after a face is selected.

`GradientEditor` accepts `Start`, `End`, `Angle`, and optional `Stops` entries with `At` from 0 to 1 and a six-digit hexadecimal `Color` and optional `Alpha` from 0 to 100. Click the bar to add a stop, drag or use Left/Right to move it, and Delete to remove it while retaining at least two stops. `ely:change` supplies the CSS `value` and sorted `stops` with normalized positions and alpha percentages. `Compact` displays the bar, stops, and shared color picker without the additional endpoint and angle fields. The color picker edits the selected stop. `DurationPicker` retains its `UnitsOptions`/`Unit` API; `DurationParts` entries use `Name`, `Label`, `Value`, and optional `Max` to render named number fields with unit suffixes. Each field submits as `{Name}_{part.Name}` and honors `Disabled`.

`ColorPicker` accepts `Alpha` from 0 to 100, including zero. It submits the six-digit color through `Name` and the alpha percentage through `Name_alpha`. HEX, RGB, and HSV edits stay synchronized; invalid hexadecimal text does not change the selected color. Screen sampling emits `sample-color` for the host application.

`CronEditor` accepts optional `Presets` (`Label`, `Value`) and an ISO `Now` reference. It validates five-field numeric expressions and month/weekday names, describes the rule, and shows the next three runs in UTC, searching up to five years ahead. Empty input shows the field guide. Invalid rules do not produce run dates.

`TagInput` add/remove commits and `PinInput` digit edits/pastes emit bubbling `input` and `change` events from their named hidden value field. The common host adapter forwards the change as `ely:change`. Initialization, repeated swaps, and unchanged values do not emit these commit notifications. The host adapter and SDUI action dispatcher ignore native `change` events from the unnamed implementation editors, avoiding duplicate requests on blur; those native events still bubble for custom listeners.

`SignaturePad` submits its named value as a PNG data URL after drawing, or as plain text through the keyboard fallback. Completing a stroke, typing, and clearing dispatch a change for that same field name. The keyboard fallback opens when native validation requires it. `Disabled` blocks both input paths.

`CodeInput` is a single-line code field; set `Multiline` for a textarea. `JsonInput` uses a textarea and native validity to reject invalid JSON while retaining the input for correction.

`FontPicker` uses the shared searchable combobox and previews the selected family without replacing the specimen text. `IconPicker` and `EmojiPicker` accept `Options` with `Value`, `Label`, optional `Icon` or complete `Glyph`, `Keywords`, `Group`, and `Disabled`. Arrow keys navigate visible enabled choices; Enter selects and Escape returns to search. The gallery includes all bundled icons and the upstream Unicode emoji catalogue.

Regional selectors use the shared combobox. `Options` may include `Note` and `Keywords` for searching; the selected field displays `Label` and submits `Value`. The gallery includes the pinned upstream language, country, and currency choices. Shared comboboxes open on click or ArrowDown/ArrowUp and close on selection, Escape, or an outside click.

`FileInput` and `DropZone` preserve `Name`, `Accept`, `Multiple`, `Required`, and `Disabled`. Invalid drops report a visible validity error and retain the previous selection. A single-file target rejects multiple files; folder drops are rejected when the browser supplies directory metadata. Files remain local until the host submits them.

### Form layout and reset

`Form` accepts `Description`, field `Description`, and optional `ArrayName`, `ArrayLabel`, `ArrayDescription`, `ArrayPlaceholder`, `AddLabel`, and `ResetLabel`. The action row tracks changes and native validity. Reset restores initial fields and removes newly added array rows. Ctrl/Cmd+Enter requests submission through the existing host action. Submission does not assume that the host saved successfully; rerender with the saved values after acknowledgement. `InlineForm` aligns its action with the field bottom.

`CodeInput` and `JsonInput` keep native input/textarea selection, submission, and validation. An aria-hidden text layer applies Ely's generic code/JSON token colors. Highlighting never inserts caller text as HTML. Forced-colors mode uses the native text field. `ColorSwatch` accepts a single `Value` or `Swatches`; `Options` supplies a selectable palette. `EyeDropper` emits `sample-color` for host integration.

`FormSection`, `FormField`, `FieldArray`, and `DirtyIndicator` render standalone form parts and do not create nested `<form>` elements. Sections and fields accept `Fields`; a field can also use direct input props. `FieldArray` accepts `Name` and initial `Values`, preserves repeated native field names, and emits `ely:change` with its current values when rows change. `DirtyIndicator` accepts host-controlled `Dirty` and optional `Text`.

### Account mount compatibility

`AccountSwitcher` emits one `switch-account` action with `detail.value` for a selection, including when the caller supplies only the account buttons, menu trigger, list, and hidden value. Display-name and avatar wrappers are optional. A caller-provided switch action remains supported. Cleanup removes the instance handlers; remount adds one handler.

Run `node ui/gohtmx/tests/unit/account_help_controls_test.mjs` for the minimal HostCallbacks markup regression, lifecycle checks, profile acknowledgement, confirmation behavior, and account validation. Run `node --check ui/gohtmx/assets/ely-api-forms.js` and `node --check internal/gallery/assets/advanced-forms-checks.js` for syntax checks. Browser integration remains a separate parent check.

### Source checkpoint 550–567

Fixtures and dimensions follow upstream `49ed1f84056fa13347d68801b479a4a5a8e03b53`, `examples/gallery/pages/{settings,account,onboarding}` and the saved reference images. The family root keeps the shared 13px/20px baseline. PIN slots use the shared 40px control, without account input overrides or a repeated visible heading. Separate alias fixtures preserve payment, invitation, support, and other source specimen fields in the all-name audit.

Settings search opens the matching section. Manual proxy fields validate the host and port before `apply-proxy` emits the local draft; notification channels retain all nine source cells. Settings import/export actions go to the host, and font defaults reset locally. Choice, range, checkbox, and text controls keep local values and emit `change-setting` with the field key. Font size resets locally. Shortcut rows filter by group, name, and keys. `clear-storage` is a confirmed host action: its display changes only after an `ely:result` with matching `action` and `value`, plus `result.ok: true`.

Account forms validate before emitting their caller action. Signup requires name, email, the three password rules, and optional caller terms consent. The source fixture supplies required terms. The source wizard requires only the workspace name; invitation text is optional. Wizard completion is local UI state and does not create an account or workspace.

Providers, sign-in, recovery, profile persistence, session/key revocation, billing, payment, team changes, invitations, and support remain host actions. A request does not assert success. The host can dispatch `ely:result` with `detail.action` and `detail.result`: `error` shows failure; `sent: true` shows email delivery acknowledgement; `secret` shows a one-time API-key value; `ok: true` acknowledges persistence. Record removal also uses the original `detail.value`. Profile acknowledgement saves the submitted snapshot, preserving edits made while the request was pending. Rerender authoritative records after creation or custom host operations. No credentials or account data are sent by this package.

### Maps checkpoint 591–597

Map fixtures follow the same pinned source, `examples/gallery/pages/maps/{mod,layers,world}.rs`, and saved reference images. The map implementation uses the existing bundled Natural Earth geometry, with Web Mercator projection and repeated worlds. The default uses no tile server or added dependency. [Optional host-registered raster tile providers](map-tiles.md) now add a source-pinned URL-template path without changing this default. The source screenshots sometimes captured unloaded land tiles; this renderer consistently draws the bundled land instead of reproducing that loading gap.

Existing `ID`, `Label`, `Name`, `Value`, `Disabled`, `Mode`, `Points`, `Routes`, and `GeoJSON` props remain supported. Additive props:

- `Center: {Latitude, Longitude}` and `Zoom` (0–19) set the initial viewport, including zero values. Without `Center`, a numeric `Value` supplies the center, otherwise 0°/0°. `Width` and `Height` set the map canvas box. The source picker has a 480×288 canvas plus its coordinate row inside the 480×320 specimen.
- Point entries accept optional `Key` and `Hue`; `Label` and `Value` remain intact. `Format: "dms"` formats the picker's visible coordinate. Its named hidden input remains numeric decimal latitude/longitude.
- `Attribution`, `Caption`, `HideCoordinates`, and `ShowReset` control optional presentation. Source fixtures use two corner zoom buttons; keyboard `0` restores the initial viewport.
- `PickAction`, `MarkerAction`, and `ViewportAction` override `pick-location`, `select-marker`, and `change-viewport`. Events target the enclosing family root so `Ely.mount` host callbacks receive them. Pick events include `latitude`, `longitude`, and `value`; marker events include `key`, `value`, and coordinates; viewport events include `viewport: {latitude, longitude, zoom}`. Standalone maps emit the same events on their own root.

Drag, wheel, and arrow keys pan. Plus/minus change one zoom level; Command/Ctrl-wheel zooms about the pointer. Cluster presses fit their members and return focus to the map. Marker popups show DMS coordinates and restore marker focus when closed. Heat uses the source's 4px cells and 28px quartic kernel, normalized across the visible view. Choropleths distinguish zero values from missing data and show the actual minimum/maximum with a No data key. WorldMap appears first at 720×360, then rainfall at 480×320.

Hosts can dispatch `ely:map-viewport` with `{latitude, longitude, zoom}` or return `result.viewport` from a host action. These updates redraw locally without emitting another host action. Clipboard access occurs only after a copy press. Geometry loading reads the existing same-origin bundled asset; network service integration stays with the host.

Focused checks: `node ui/gohtmx/tests/unit/account_help_controls_test.mjs`, `node ui/gohtmx/tests/unit/maps_geometry_test.mjs`, `node ui/gohtmx/tests/unit/maps_runtime_test.mjs`, `node ui/gohtmx/tests/unit/css_test.mjs`, and `go test ./ui/gohtmx ./internal/gallery -run 'TestAccountHelp|TestAccountFactor|TestMaps|TestMap|TestWorldLand|TestAdvancedForms|TestLocalFormStoriesWireValidationAndHandler'`. The map runtime test uses deterministic adapters, not a browser. In-page checks retain mount/cleanup/remount, popup focus, source zoom increments, picker payload, and alias checks for the parent's browser audit.

Account visual regression follow-up (551, 555, 556, 559, 560): source revision
49ed1f84056fa13347d68801b479a4a5a8e03b53 places workspace/account in one
260px column, billing beside a column of upgrade prompts, and invitations below
members. The family stylesheet now specifies these specimen placements, gives
OAuth buttons the provider column width, and explicitly places profile avatar
and identity beside one another (presence overlays the avatar cell).

The authorized browser audit can import `checkAccountSourceLayout` from
`/assets/advanced-forms-checks.js` and call `checkAccountSourceLayout(document)`
on each affected story after mount. Existing forms checks invoke it before
interaction. It checks actual bounding boxes for identity width/alignment and
name wrapping, provider button width, invitation separation, account stacking,
and paywall placement. `node ui/gohtmx/tests/unit/account_help_layout_test.mjs` verifies that this
same checker rejects the six reported bad geometries; it does not render CSS.
Focused rendering: `go test ./... -run 'TestAccountHelp|TestAccountFactor|TestLocalFormStoriesWireValidationAndHandler|TestEveryAdvancedAPIAndAliasRenders' -count=1`.
No browser was run for this correction; final screenshots remain a parent check.

Inline map geometry now has [a documented GeoJSON contract](map-geojson.md),
including all seven geometry kinds, nested collections, strict validation,
whole-input browser budgets, and the explicit numeric-ID normalization gap.
