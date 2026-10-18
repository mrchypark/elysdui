# Native component API

All native components use `ui.Component` with the protected `ID`, `Chapter`, `Kind`, `Variant`, and `ComponentName` values supplied by `RenderComponent`.

Common caller properties are `Title`, `Description`, `Label`, `Name`, `Value`, `Placeholder`, `Action`, `ActionLabel`, `Required`, `Disabled`, `Checked`, `RTL`, `Min`, `Max`, `Options`, and `Items`. `Options` accepts objects with `Value`, `Label`, `Selected`, and `Disabled`; `Items` accepts `Value`, `Label`, and `Content`. Strings are escaped.

Buttons and forms emit `ely:action` through the shared API. Local selections, text/range changes, media controls, crop/mask geometry, model orbit/zoom, and stopwatch state emit `ely:change`. The detail contains the component ID, component path, action, and native form data when applicable. File import/export, generation, capture, print/share, system notifications, model downloads, and host operations remain host actions; the renderer never claims that they completed.

`URL`, `Alt`, `Caption`, and `Volume` configure media. A failed or source-less playback remains an error state. `Vertices` and `Faces` are JSON arrays for `3DModelViewer`; optional `MeshColor` fills depth-sorted faces and `Wireframe` preserves line-only rendering; the focusable canvas supports arrow orbit, `+`/`-` zoom, and `0` reset; `Rates` is a JSON unit-to-base-rate map for `UnitConverter`, whose local swap button exchanges caller-selected units; `TimeZone` is an IANA zone for `Clock`; `Token` and `Tokens` configure theme editors. `Items` for media and generation grids may add `URL`, `Alt`, and `Progress`.

Theme specimens accept caller `Items`. `Type` reads `Label`, `Content`, `Value`, and `Size` (`display`, `heading`, `body`, or `code`). `Shape` reads `Label`, radius `Value` (CSS length), and `Size` (`sm`, `md`, `lg`, or `xl`). Its 64px squares use source radii 4/6/8/12px; `Elevations` rows (`Label`, `Value`: `raised`, `floating`, `modal`) render 120×72px shadow specimens. `Motion` reads track `Label`, `Value`, and `Curve` (`ease-out`, `ease-in-out`, `spring`). The 360×24px lanes run the source 2400ms outward/hold/return cycle with 12px dots. Replay emits caller `Action`; `ReducedMotion` or the system preference holds the end position. Animation handles stop on cleanup. `ColorBlindSafe Palette` reads swatch `Label` and `Color` values.

`ScreenRecorderControls` accepts `Recording` (`idle`, `running`, `paused`), `Elapsed` seconds, legacy `Content` time, `Microphone` (falling back to `Checked`), and `Camera`. Record/pause/resume/stop update local control state and elapsed time; pausing excludes held time. Caller actions remain `Action`/`ActionLabel`, `PauseAction`, `ResumeAction`, `StopAction`, `MicAction`, and `CameraAction`. The host can supply authoritative state with `ely:recording` detail `{state, elapsed}`. The pill uses 24px controls, a live dot, and state-specific buttons. This control does not capture or save media; the host owns recording and errors.

`CameraPreview` accepts `URL`, `Alt`, optional `CameraName`, and numeric `AspectRatio` (default 1.5). A host can send `ely:camera-frame` detail `{url, alt, name}`; an empty URL shows Camera off. The source preview is 300×200, with the exact bundled upstream olive image, plus a separate off specimen. The name chip stays in the lower left. There is no camera permission request or frame polling.

`MicLevelMeter` reads caller `Items` with `Label`, `Progress` (0–1), and optional `Content`. Each track has 24 segments, a 6px height and 2px segment gaps; source levels .3/.84/.98 light 7/20/24 segments. Segments at .8 turn amber and .95 turn red. `ely:mic-levels` with `{levels: [...]}` updates each row; an invalid or incomplete array leaves all rows unchanged. The gallery has no invented dB labels. `DeviceSelector` reads caller `Items` with `Label`, `Value`, `Icon`, `Chosen`, `Placeholder`, `Disabled`, and nested `Options`. Existing option `Selected` is retained when `Chosen` is absent. Selects use the shared control and emit `{device, value}` on `ely:change`; empty option sets disable the selector. Source device keys are mic-desk, mic-headset, and cam-studio. Device discovery and permissions remain host operations.

`3DModelViewer` preserves JSON `Vertices`/`Faces`, `MeshColor`, `Wireframe`, and backing `Width`/`Height`. `Projection: "perspective"` enables the source camera and matte lighting; the existing pixel-coordinate geometry path remains available without it. `Yaw`, `Pitch`, `Distance`, and numeric `AspectRatio` set the initial view. Default orbit is .6/.35/1; distance stays between .4 and 4 and pitch between -1.4 and 1.4. Arrows orbit both axes, drag uses .01 radians per pixel, +/− scale distance by 1.25, Command/Ctrl-scroll zooms, and 0/reset restores the source start. Changes emit `{orbit: {yaw, pitch, distance}, zoom}`. The source fixture uses 56×24 torus vertices and quads, radii 1/.38, a 960×640 backing frame, and a 480×320 viewport. Host `URL` or `ely:model-frame` detail `{url}` can provide a rendered frame. Missing geometry/frame shows loading; invalid geometry or unavailable Canvas shows an error. No 3D service is called.

Focused checks for 451–455: `go test ./ui/gohtmx ./internal/gallery -run TestNative -count=1`, `node ui/gohtmx/tests/unit/native_devices_test.mjs`, `node ui/gohtmx/tests/unit/native_theme_test.mjs`, and JS syntax checks. The device test covers timer transitions, mic thresholds, projection bounds, canvas initialization/failure, keyboard orbit, host events, and cleanup. Parent owns package.json integration and browser verification. Compare a fresh build: earlier frozen checks expected the obsolete 180-vertex torus and #c9beb0 color.

`ExportDialog` opens with its labelled native opener, uses `showModal`, closes after submit or dismissal, and returns focus to that opener. Its `ImportDialog` and `CSVImporter` aliases read `Fields` (`Label`, `Value`), `Headers`, preview `Rows`, and optional `Error`; CSV input emits `import-csv` and file parsing remains a host operation.

Shell panels read `Label`, `Content`, `Items`, `Progress`, and their caller action. Model views use `Label`, `Content`, `Status`, `Hardware`, `Progress`, and item rows; download and status rows add per-item `Progress`. `DatasetViewer` renders caller items as filterable table rows. `SubtitleEditor` reads item `Start`, `End`, and `Content`. `IconBrowser` accepts `Icons` from `ui.FoundationIconNames()`, filters them locally, updates its selected output, and emits `select-icon` with the selected name as `value`; icons load only from bundled same-origin `/assets/ely/icons/` SVG files. `A11yChecker` reads contrast rows from `Items` (`Label`, `Foreground`, `Background`) and calculates the WCAG ratio and grade locally. `ScreenshotTest Harness` reads a caller command from `Value`. `ComponentGallery` reads linked `Items` (`Label`, `Content`, `URL`). `PlaygroundPanel` reads variant `Options`, `PreviewLabel`, and `Action`; variant, size, disabled, and loading controls update the local preview and the submit sends the caller action. `RenderSurface` renders a host callback fallback from `Content`. Tooling views do not generate telemetry.

`ImageGenerationPanel` emits `generate`; `Calculator` emits `calculate`; `UnitConverter` emits `convert`; editable prompt, subtitle, and theme controls emit their named save actions. Player controls emit `play`; timers emit `toggle` and `reset`; crop, mask, and annotations emit structured geometry actions. The host can cancel an action event or bind an operation with `mount` from `/assets/ely-api.js`.

Generation queues read item `URL`, `Alt`, `Content`, `Progress`, `Action`, and `ActionLabel` to show completed, running, queued, and failed jobs. Result grids add `Status`; variations use option `URL` and `Selected`. Voice rows use item `Content` and optional `Tags`; video frame items use `Time`, `Duration`, `Label`, `URL`, `Alt`, and `Selected`. `DatasetViewer` uses item `Label`, `Content`, and `Status` for prompt, completion, and split. `PromptPlayground` accepts `Temperature` or `Progress`; `PromptDiff` displays caller version rows. Playlist rows accept `Artist` and `Selected`. Native media uses one source element with a local compact player; it supports play/pause, seek, speed, volume including explicit `Volume: 0`, thumbnail seeks, and media-ready state. It does not duplicate browser controls.

Theme callers may supply token `Items` for every palette level. `Series` has eight hues and `Syntax` has thirteen code-token hues. Color-blind-safe palettes use eight source hue names and a local toggle.

`ThemeEditor` and its aliases read `Tokens` (CSS declarations), `Density`, `Radius` (0–2, including zero), `FontScale` (0.85–1.3), `HighContrast`, and `ReducedMotion`. `Colors` supplies rows with `Label`, `Token` (a CSS custom property), and six-digit hex `Color`. The source fixture has 12 rows. Current declarations take precedence over row defaults. Each color edit replaces only that token and preserves unrelated caller declarations. Control changes emit an instance-local `ely:change` with `draft`, including the complete current `tokens`. Submission uses caller `Action`/`ActionLabel` or `apply-theme`; `RestoreAction` defaults to `restore-theme`. Applying or restoring the application theme remains a host operation.

`ThemeImporter` and `SyntaxThemes` accept `Tokens` as VS Code JSON/JSONC, file input, or file drop, up to 1 MiB. They validate the mode, color object, hex colors, and syntax rules before action dispatch. Errors remain visible and block submission. The source mapping covers palette roles, TextMate scopes, and ANSI colors. Caller `BaseTokens` supplies declarations retained for omitted roles. Valid submissions emit caller `Action` (default `import-theme`) with `theme` (`name`, `mode`, `colors`, `syntax`, `ansi`, `named`, `kept`, `tokens`) and native form data. No document-wide styles change. Syntax `Options` accept `Value`, `Label`, `Selected`, optional `Content`, and optional VS Code `Tokens`; selection emits `ely:change` with `syntaxTheme` and the validated `theme`. The fixture shows the source Ely, Quiet, and Paper light palettes. Hosts supply dark palettes when required.

`Platform Style` and its aliases read initial `Platform` (`macOS`, `Windows`, `Linux`), `IconTheme`, and file `Items` (`Label`, `Icon`, `OwnerIcon`). Platform changes update local window-button shapes and keycaps. The icon switch applies caller icon rules to those rows. Changes emit `platform` and `iconTheme`; caller `Action` defaults to `open-vibrancy`. Native windows and backdrop effects remain host operations.

`I18nProvider` and aliases read `Locale`, `Options`, numeric or numeric-string `Value`, `Decimals` (default 2), ISO `Date`, `TimeZone` (default UTC), and `RTL`. Numeric input retains its precision in HTML. `Messages` accepts already-localized strings. For live translation, provide `Catalogs` as JSON `{locale: {key: message}}` and `MessageItems` with `Key`, JSON `Args`, and optional initial `Content`. Arguments can be scalars, `{number, decimals}`, or `{date, timeZone}`. All catalogs must contain the same keys; missing catalogs, keys, or arguments show an error and retain the previous preview. Locale changes update messages, numbers, dates, language, and direction only inside the instance. `Items` supplies file rows with `Label`, `Content`, and optional `Icon`. Browser `Intl` supplies locale formatting, so exact CLDR date spelling can differ from GPUI's pinned formatter.

Focused checks for indices 581–590: `go test ./ui/gohtmx ./internal/gallery -run TestNative -count=1`, `node ui/gohtmx/tests/unit/native_theme_test.mjs`, and `node --check` for `ui/gohtmx/assets/ely-api-native.js`, `ui/gohtmx/assets/ely-api-native-theme.js`, and `internal/gallery/assets/advanced-native-checks.js`. The gallery checks cover invalid import blocking, preserved tokens, translated messages, RTL, source shape counts, replay, and platform changes. Run those checks in the parent's browser integration pass.

`LocaleNumber` / `LocaleDate` render one caller `Locale`, or one row per `Options` entry (`Value` locale tag, `Label`). Every row retains the original numeric or numeric-string `Value` in `data-value`; `Decimals` changes display only. `Date` and `TimeZone` control the date. The seven gallery locales use the upstream short-date patterns; other tags use browser Intl. The source fixture contains seven rows, -1234567.891 with two displayed decimals, and 2026-09-01 UTC. Row geometry is 96px label, 120px number, 16px column gap, and 4px row gap.

`RTL layout` renders caller file `Items` in a 320px box. `Locale` determines local direction; `RTL` can force it. Dispatch `ely:locale` with `{locale: 'he-IL'}` on an RTL or provider instance to change that instance. Hosts can forward a provider's locale change to sibling layouts. There is no document-wide direction mutation. Format comparison rows retain their source column order.

`SkipLink` / `KeyboardNavigationHelper` accept `SkipLabel`, navigation `Items` (`Label`, `Action`), main `Content`, and `Action` / `ActionLabel`. The hidden link appears on focus and native Enter/click activation focuses its instance's main target. The target has tabindex -1; subsequent Tab reaches its first control. The gallery source card is 480px maximum with five navigation buttons. Arrow-key roving groups remain the interaction family's responsibility.

`ColorBlindSafe Palette` accepts initial `ColorBlindSafe` and `Items` with `Label`, original `Color`, and `SafeColor`. The shared switch changes only local 40px swatches and emits `colorBlindSafe`; switching off restores exact caller colors. Hosts supply colors for their theme mode, including dark mode. Missing `SafeColor` keeps the original color. The gallery uses upstream light chart and safe chart datasets. Parent test integration command: `node ui/gohtmx/tests/unit/native_theme_test.mjs`; package.json remains parent-owned. Browser verification of arrow placement, switch geometry, RTL layout, and real keyboard focus order remains with the parent.

`VideoPlayer` uses `URL`, `Title` or `Label`, optional `Artist`, and an optional `CaptionTrack` JSON array of `{start, end, text}` cues. It keeps one native video element and local compact controls. With focus, Space/K toggles playback, J/L seek ten seconds with duration bounds, arrows seek five seconds, C toggles captions, and F requests fullscreen. While video plays, pointer movement reveals the controls and they fade after two seconds at rest. `toggle-captions` and `fullscreen` remain caller actions; fullscreen depends on the browser's trusted-gesture policy.

`AudioPlayer` accepts optional `CoverURL`, `CoverAlt`, `Title`, `Artist`, `PreviousAction`, and `NextAction`. It renders caller artwork, metadata, elapsed and remaining time, one native audio element, seek/speed/volume controls, and previous/next transport actions. Missing artwork has an accessible local music fallback.

Standalone audio controls do not create a media element. `AudioWaveform` reads `Samples` (`X`, `Y`, `Width`, `Height`), `Duration`, and `Position`; pointer presses and Arrow/Page/Home/End keys seek locally and emit a change. `AudioSpectrum` reads the same `Samples` shape as host levels and accepts an `ely:samples` event. `VolumeControl` reads `Volume`, `Muted`, and `MuteAction`; its speaker mutes and moving the slider unmutes. `PlaybackSpeedControl` reads `Speed`, `SpeedOptions` (`Value`, `Label`, `Selected`, optional `Action`) and emits its caller speed action. `MediaControls` reads `Playing`, `Shuffle`, `Repeat` (`off`, `all`, `one`) plus the five caller action names for shuffle, previous, play/pause, next, and repeat.

Generative indices 419–424 use upstream `49ed1f84056fa13347d68801b479a4a5a8e03b53` (`src/generative/{prompt,style,ratio,seed,queue,grid,variation,compare,mask,brush,audio}.rs` and `examples/gallery/pages/generative/{panel,results,canvas,sound}.rs`). The nine files in `ui/gohtmx/assets/ely/native-generative/` are unchanged upstream gallery JPEGs; the olive image reuses `ui/gohtmx/assets/ely/native-camera.jpg`. Saved reference images are `audit-results/ely-reference/419-*.png` through `424-*.png`. The panel is 400px, queue 480px, results/comparison/variations 420px, blind comparison/mask 460px, and generated audio 440px, each constrained by the available width.

`ImageGenerationPanel` and its aliases accept caller `Value`, `Name`, `NegativePrompt` (comma-separated), `Style`, `Options` (`Value`, `Label`, `URL`, `Selected`, `Disabled`), `AspectRatio`, `Ratios` (`Value`, `Label`), `Seed`, `Suggestion`, and `Enhancing`. Style and shape choices update hidden form values. Negative tags support Enter/comma, removal, and Backspace. Seed editing keeps digits up to uint32 max; blank requests a fresh host seed. Roll uses browser randomness. Generate uses `Action`/`ActionLabel`; Ctrl/Cmd-Enter submits the same form. Invalid caller seed values block submission instead of being silently replaced. `EnhanceAction` defaults to `enhance-prompt` and carries current form values. It enters a pending state; the host responds on the instance with `ely:prompt-suggestion`, containing `{suggestion: text}` or `{error: text}`. Use this accepts the host text, Keep mine retains the caller prompt. Inserted words receive a local highlight. No enhancement text or generated result is fabricated.

Queue items also accept `Status`, stable `Value`, and optional `RemoveAction`. Grid items use `OpenAction` (default `open-generation`). These actions carry the caller item key; cancel, retry, remove, generation, and opening results remain host operations. `ImageCompare` preserves explicit `Compare: 0`; the divider supports dragging, Left/Right (5%), Home, and End. `VariationPicker` updates its hero from selected options and supports `SubtleAction`, `StrongAction`, and `UpscaleAction`. Its `ABCompareView` alias uses `Sides` (`Label`, `Content`), `Blind`, and optional `Verdict` (zero-based side or `tie`); a local verdict reveals model names, marks the winner, and emits `verdict`.

`InpaintCanvas` / `MaskBrush` accept `Strokes` JSON containing `{points: [[x,y],...], radius, erase}`. Coordinates are normalized to 0–1; radius is 0.01–0.2 of picture width. `BrushRadius`, `Erase`, and optional canvas `Width`/`Height` set caller state. Legacy `BrushSize` remains a pixel-diameter fallback. The source 320-column raster makes later erasing strokes clear earlier paint. Pointer strokes, Paint/Erase, Undo/Clear, brackets (×0.8/×1.25), and X work locally and emit normalized geometry. `ely:mask` with `{strokes: [...]}` replaces valid host state; invalid input reports an error and preserves the current mask. `MaskAction` defaults to `apply-mask`; `HideApply` hides that host action in the source gallery, which has only local brush controls.

`AudioGenerationPlayer` accepts `Label`, `Artist`, `Samples` (`X`, `Y`, `Width`, `Height`), optional `WaveViewBox`, `Duration`, `Position`, `Playing`, and optional `Making` (0–1, including zero). With no `URL`, play/pause requests change local control state but never advance time. The host updates the instance with `ely:generated-audio` containing `position`, `playing`, or `making` (`null` means ready). Pointer presses and Left/Right seek by waveform share; keyboard steps are 5% of duration. Regenerate/download actions are disabled while making. Caller `URL` optionally supplies a real native audio source. Generation, external playback, downloads, and job lifecycle remain host operations. The gallery uses the exact 56 source peaks, ready 12/32 seconds, and making 45% of a 45-second sound, with no substitute audio file.

Focused generative integration command: `node ui/gohtmx/tests/unit/native_generative_test.mjs` (parent owns package.json). It covers seed limits, prompt word diffs, normalized mask raster/erasure, real event dispatch at DOM boundaries, blind verdicts, comparison controls, disabled state, host audio updates, and cleanup. Render/fixture checks: `go test ./ui/gohtmx ./internal/gallery -run TestNative -count=1`. Syntax checks cover `ui/gohtmx/assets/ely-api-native.js`, `ui/gohtmx/assets/ely-api-native-generative.js`, and `internal/gallery/assets/advanced-native-checks.js`. Parent must rebuild its frozen server before the 163-case browser rerun; this work does not run a browser or verify final browser geometry.

Generative indices 425–434 use the same pinned upstream revision and saved `425-*.png` through `434-*.png` references. Source inputs come from `examples/gallery/pages/generative/{sound,models,data}.rs`; reusable behavior follows `src/generative/{voice,video,models,downloads,hardware,tuning,embed,lens,playground,versions}.rs` and the dataset table's sorting/paging rules. The gallery now has four voices, four shots (5/4/6/4 seconds), two model cards, five download states, three model statuses plus three hardware readings, two tuning jobs, twelve samples paged by five, 64 points in four topics in both flat and turned views, template variables, and four prompt versions. The embedding fixture reproduces the upstream uint32 noise and float32 calculations.

`TTSVoicePicker` keeps caller `Items` (`Value`, `Label`, `Content`, `Tags` or `TagItems`, `Selected`), and accepts instance `Selected`, `Playing`, and `PlayAction`. Selecting a row updates the check and hidden `voice` form value. Sample play/stop emits the caller action with `{voice: key|null, value: key|''}` without selecting another voice or inventing audio. `ely:voice` accepts `selected` and `playing` (`null` stops). The existing script form remains available with caller `Action`/`ActionLabel`; `HideScript` removes it for the exact source gallery.

`VideoGenerationTimeline` is a shot timeline, not a generated-media playback service. `Frames` retain `Time`, `Duration`, `Label`, `URL`, `Alt`, and `Selected`, and add stable `Value`, `Status` (`done`, `pending`, `failed`), `Progress` (percent), and failure `Content`. Each second occupies 24px; shots are 56px high. `Position` sets the playhead, including zero. Selection updates the caption and emits `shot`. `ExtendAction` defaults to `extend-video`; the host supplies new shots by rerendering. `ely:shots` updates `position` or `selected`. A caller `URL` still renders an optional native video with controls, but the source fixture has no substitute video. The specific timeline assertion in `internal/gallery/behavior_test.go` now checks ruler, playhead, selected caption, failed-shot identity, and Extend instead of obsolete player hooks.

`ModelCard` accepts `Maker`, `InUse`, fact `Items` (`Label`, `Content`), `Tags`, and existing `Value`, `Label`, `Content`, `Action`/`ActionLabel`. Use carries the caller model key; `ely:model-use` with `{inUse: boolean}` confirms host selection. Model activation remains a host operation. `ModelDownloadManager` uses item `Status` (`fetching`, `paused`, `queued`, `failed`, `done`), `Progress` (0–100), `Bytes`, `Rate`, and caller status `Content`. State-specific actions use `PauseAction`, `ResumeAction`, `CancelAction`, `RetryAction`, and `DeleteAction`, or explicit `Actions` (`Kind`, `Action`, `Value`, `Label`, `Icon`). `ely:download` updates one `key` with valid `status`, `progress`, and/or `content`; invalid updates preserve existing state. Requests never fabricate downloaded bytes or delete a local model.

`ModelStatus` uses item `Status`, `Progress`, `MemoryUsed`, `MemoryTotal`, `MemoryLabel`, and failure `Error`. Byte values remain intact. Its `HardwareMonitor` alias accepts `Readings` (or legacy `Items`) with `Label`, `Content`, percent `Progress`, and `History` JSON arrays. The meters use 75%/90% thresholds and 64×24 history sparklines. No machine telemetry is requested. `FineTuneJobCard` accepts `Dataset`, `Status`, `Epoch`, `Epochs`, percent `Progress`, `TrainLoss`/`HeldLoss` JSON arrays, and caller `Action`/`ActionLabel`. The progress bar counts completed epochs plus the current share; paired loss curves are 140px high and their legend toggles visibility. Legacy step/loss `Items` still render a table when no loss arrays are supplied. Cancel/Open remain host operations.

`DatasetViewer` retains caller sample `Items` (`Value`, `Label` prompt, `Content` answer, `Status` split) and adds numeric `Tokens`, `PageSize`, and `HideFilter`. Header presses cycle ascending, descending, and original order; Shift joins sort keys. Sorting and filtering precede paging, and details retain full untruncated prompt/answer text. Changes expose page, sort, and opened sample identity. Its source width is 680px. `EmbeddingVisualizer` accepts `Points` JSON (`key`, `label`, zero-based `group`, normalized `at: [x,y,z]`), `Groups`, `ThreeDimensions`, and `AspectRatio`. Invalid coordinates report an error; unknown group indices are omitted as upstream does. Its source width is 340px, ratio 4:3, starting turn 0.6/0.35 radians, drag scale 0.01 radians/pixel, and keyboard step π/12. Legend toggles hide topics, hover names points, and 3D drag/arrows rotate locally. Without `Points`, legacy caller `Items` keep the previous filterable-list rendering.

`PromptPlayground` discovers unique Unicode letter/number/underscore `{names}` from caller `Value`; `Variables` JSON supplies initial string values. Empty slots are highlighted and block Run. Values survive template edits. Submission emits caller `Action` (legacy default `save-prompt`; source fixture `run-prompt`) with filled `prompt`, original `template`, `variables`, and native form data, then waits. The host dispatches `ely:prompt-output` with `output`, optional `tokens` and `milliseconds`, or `error`/`running`. Output is inserted as text; no timed sample answer is fabricated. `Running`, `Output`, and `Stats` seed caller state. Explicit `Temperature`, or legacy `Progress`, and prior run `Items` remain available; `HideTemperature`/`HideRuns` remove those non-source extras from the gallery.

`PromptDiff` / `PromptVersionHistory` use newest-first `Items` with `Value`, `Content`, `Note` (or `Label`), `Author`, and caller-formatted `When`. `Chosen` preserves explicit zero. Selection compares against the next older version, using deleted-word strike-through and inserted-word wash. The newest has no Restore action; older versions emit `RestoreAction` (default `restore-prompt`) with index, stable key, and text. Persisting or inserting a restored version remains the host's responsibility.

Focused remainder command for parent package integration: `node ui/gohtmx/tests/unit/native_generative_tools_test.mjs`. Run it alongside `node ui/gohtmx/tests/unit/native_generative_test.mjs`, `node ui/gohtmx/tests/unit/native_theme_test.mjs`, and `node ui/gohtmx/tests/unit/native_devices_test.mjs`. Render/fixture check: `go test ./ui/gohtmx ./internal/gallery -run 'TestNative|TestInteractiveStoryTargetsAreRendered/generative/videogenerationtimeline' -count=1`. Syntax-check `ui/gohtmx/assets/ely-api-native-generative-tools.js`, `ui/gohtmx/assets/ely-api-native.js`, and `internal/gallery/assets/advanced-native-checks.js`. The native gallery checks now exercise the exact datasets, sorting/paging/details, host-state updates, template substitution, shot selection, topic toggles, and version identity. Parent browser validation remains outstanding for 425–434; package.json and browser/server state are not changed here.

### Media 435–450 source parity

This batch follows `examples/gallery/pages/media/{images,edit,video,audio}.rs` and
`src/media` at upstream `49ed1f84056fa13347d68801b479a4a5a8e03b53`.
The local saved references 435–450 were inspected. Reference 438 has no usable
component capture; ImageUpload follows the Rust implementation. No browser was
run for this batch.

- ImageViewer is a 640×440 fit/actual-size viewer, with bounded pan, source zoom
  steps, pointer-centered Cmd/Ctrl-wheel zoom, double-click fit/actual-size,
  arrow panning, and clockwise/counterclockwise turns. Five source thumbnails
  open a local keyboard-accessible lightbox and restore focus on close.
- Crop coordinates are normalized `{x,y,width,height}` JSON in `Crop`. Eight
  handles resize a free crop; shaped crops resize from corners. Arrow keys move
  by .01 (Shift: .1). `Ratio` and `AspectRatio` determine fitting. Upload retains
  caller crop values, accepts local PNG/JPEG/GIF/WebP files, revokes object URLs,
  and emits `pick-image` / `remove-image`; no upload service is simulated.
- `Marks` is JSON containing rectangle/arrow `{tool,from,to,color}`, pen
  `{tool,points,color}`, or pin `{tool,at,color}` entries. Coordinates are 0–1;
  color is a source series index 0–3. Select/Delete, undo/redo, and Cmd/Ctrl-Z
  edit local marks. `ely:change` returns the full marks and geometry. Optional
  explicit crop/annotation apply buttons keep caller `Action` values.
- Video and audio players preserve caller `URL` for real HTML media playback.
  Without a URL, `FrameURL`, `Duration`, `Position`, `Playing`, and `Speed` are
  host-driven. `ely:media-state` accepts lowercase `position`, `duration`,
  `playing`, `speed`, `captions`, and video `frameURL`. Controls emit changes;
  no timer pretends that a host media source is playing. Video keyboard controls
  are Space/K, J/L (10 seconds), arrows (5 seconds), C, and F. Captions use the
  caller `CaptionTrack` JSON array of `{start,end,text}` in seconds.
- Waveform `Peaks` JSON is resampled by maximum into 3px bars with 2px gaps.
  Existing SVG `Samples` remain supported. `ely:samples` accepts normalized
  `peaks` or `levels`; legacy geometry `samples` remains supported. Spectrum
  values stay still until the host updates them.
- Trim edits retain at least one second. Subtitle edits parse `mm:ss.mmm` or
  `h:mm:ss.mmm`, reject invalid/backward times without replacing stored timing,
  sort committed cues, and add a two-second cue at the current playhead even
  when the list is empty. Playlist Enter/double-click emits `play-track` with
  the caller key. Muting preserves the caller level, including explicit zero.

Focused integration commands (parent owns package.json):

```sh
go test ./ui/gohtmx ./internal/gallery -run TestNative -count=1
node ui/gohtmx/tests/unit/native_media_test.mjs
node ui/gohtmx/tests/unit/native_theme_test.mjs
node ui/gohtmx/tests/unit/native_devices_test.mjs
node ui/gohtmx/tests/unit/native_generative_test.mjs
node ui/gohtmx/tests/unit/native_generative_tools_test.mjs
node --check ui/gohtmx/assets/ely-api-native.js
node --check ui/gohtmx/assets/ely-api-native-media.js
node --check internal/gallery/assets/advanced-native-checks.js
```

The native gallery checks now exercise source host-frame playback, crop aspect,
lightbox focus/stepping, mark undo/redo, source datasets, and cue validation.
Real decoding, browser layout, fullscreen/PiP capability, and file-picker behavior
remain parent browser checks. Upload persistence, media playback engines when no
URL is supplied, and annotation/crop raster export remain explicit host work.

Media follow-up: the thumbnail/lightbox harness waits for the native dialog
`close` event before checking focus. `ui/gohtmx/tests/unit/native_media_test.mjs` covers queued close,
arrow navigation preserving the opener, reopening from another thumbnail, and
listener cleanup. Crop ratio selection and the play button pair accent fills
with `--on-accent` (`--color-primary-foreground` fallback); transport toggles and
selected playlist rows pair themed surfaces with foreground ink. This removes
light-fill/inherited-light-ink combinations in dark mode. Browser visual checks
remain with the parent.

## Window & Shell 99–122

Compared with upstream `49ed1f84056fa13347d68801b479a4a5a8e03b53`,
`src/shell`, `examples/gallery/pages/shell`, and saved reference PNGs 099–122.
Native templates, fixture previews, and the gallery harness now use the source
Mac/Windows/Linux chrome, 38px title bars, 12px lights, 46px Windows caption
buttons, 240px sidebar, 48px activity rail, and source window specimen sizes.
The source preview datasets include both column shells, all three update states,
Roadmap selection, 62% splash progress, and the expanded crash report.

`ui/gohtmx/assets/ely-api-native-shell.js` owns these components, before generic native
handlers. Caller properties and callbacks remain independent of gallery fixtures:

- Chrome accepts `Platform`, `Active`, `Maximized`, `CanMinimize`, `CanMaximize`,
  `Leading`, `Actions`, and caller close/minimize/maximize action names. Drag and
  resize send pointer coordinates; `ClientDecorated` and `Inset` control edge
  hit testing. Resize edges are `n`, `ne`, `e`, `se`, `s`, `sw`, `w`, `nw`.
- `Columns` carry `Width`, `Title`, `Leading`, `Actions`, `Items`, `Rows`, and
  `Content`. Toolbars accept `Groups` and trailing `Actions`; status bars accept
  `Items` and `RightItems`. Menus accept caller `Menus[].Items` or flat `Items`.
- Activity selection and tab selection are local. Tab close selects the first
  remaining tab; add is host-driven unless `LocalAdd` is true. Local draft keys
  avoid collisions. Tabs support arrows/Home/End, Delete, and scoped drag reorder.
  `Owned` keeps tab/zoom changes as requests until the host confirms state.
- Zoom preserves caller fractions, steps through
  50/67/75/80/90/100/110/125/150/175/200, and resets via its percentage button.
  It emits a percent request; the host controls the scope of actual zoom.
- `ely:shell-state` accepts `tabs`/`windows` as arrays of caller `{Value,Label,Icon?,Action?}`
  objects, plus `selected`, `active`, `shown`, `lastPick`, `badge`, `percent`,
  `connectivity`, `progress`, and `status`. Duplicate or non-string item keys
  are rejected. Splash progress uses the existing 0–100 HTML API; zero is
  determinate and null removes the value for indeterminate progress.
- Update banners accept optional `DownloadAction`, `RestartAction`, and
  `LaterAction`. Host `updates:[{value,state,version?,progress?}]` confirms each
  banner state. Download/restart clicks never invent progress or completion.
- Tray, Dock badge, notifications, window creation/focus, mini-window opening,
  report sending, and copy operations emit host requests only. Mini opening
  carries caller width/height/corner. Inline mini content accepts caller media,
  text, and optional `PlayAction`; no timer or external playback is fabricated.
- WindowSwitcher uses a native HTML dialog with keyboard selection, backdrop
  dismissal, and focus return on `close`. QuickLauncher filters caller rows and
  emits their stable keys. OfflineIndicator starts hidden online, shows the
  source offline/reconnecting copy, and holds “Back online” for 2400ms.

The gallery's NativeMenu, QuickLauncher, and SystemNotification note-only
previews match the source; their public caller APIs still render actionable
caller content. Saved PNGs 102/103/111/112 are native-capture placeholders, so
geometry and behavior there are checked against Rust rather than an image of
an OS surface. OS rendering/permissions, actual window management, clipboard,
and update installation remain explicit host boundaries. Browser layout and
focus checks remain with the parent; this worker used no browser.

Focused commands (parent owns package.json):

```sh
go test ./ui/gohtmx ./internal/gallery -run 'TestNativeShell|TestNativeMedia' -count=1
node ui/gohtmx/tests/unit/native_shell_test.mjs
node ui/gohtmx/tests/unit/native_media_test.mjs
node ui/gohtmx/tests/unit/native_theme_test.mjs
node --check ui/gohtmx/assets/ely-api-native-shell.js
node --check ui/gohtmx/assets/ely-api-native.js
node --check internal/gallery/assets/advanced-native-checks.js
```

Subtitle follow-up for source 443: cue 2 is active initially at 34 seconds;
rows use two 26px lines, a 2px gap, and 4px padding (62px total without error
text). Active fill uses the active theme token; text has no resize grip, and
Add a cue includes the source plus icon. Stored timing and caller text remain
unchanged by invalid edits.

### Misc 598–613 source parity

The misc fixtures now come from `internal/gallery/assets/native-misc-fixtures.json`, transcribed from upstream `49ed1f84056fa13347d68801b479a4a5a8e03b53` (`examples/gallery/pages/misc` and `src/misc`). The helper clears generic gallery properties before applying these source examples. PreviewExamples include Clock/WorldClock, Poll/Survey, Quiz/Flashcard, and all three transfer dialogs. Captcha images are copied from `examples/gallery/assets/captcha`; full package license texts are included in the gallery fixture. Source-only notices remain notices for BarcodeDisplay/Signature/Rating, Changelog, web-provider availability, and PrintButton/ShareSheet. Reusable caller APIs remain available independently of those fixtures.

`ui/gohtmx/assets/ely-api-native-misc.js` initializes this bounded family before the legacy native handler. It needs no dependencies and is imported by the existing native entry point. Its styles are in the existing `ui/gohtmx/assets/ely-api-native.css`; no extra stylesheet or package integration is needed.

| Component | Caller contract and behavior |
|---|---|
| Clock / WorldClock | `Moment` is an optional ISO timestamp; otherwise the clock ticks. `TimeZone` controls home; `Items` supply `Label` and IANA `TimeZone`. `World` hides the large local face. Faces have 12 marks and three hands; world rows show relative day and offset. Cleanup stops the timer. |
| Stopwatch | `Elapsed` is milliseconds. Start/pause preserves elapsed time; Lap records cumulative time and delta; Reset clears laps. `ToggleAction`/`Action`, `LapAction`, and `ResetAction` customize emitted requests. No service or OS timer is claimed. |
| Calculator | `Value` supplies the initial expression. Local arithmetic uses the bounded expression parser, precedence, sign, clear, backspace, keyboard input and full-precision continued answers. `Action` defaults to `calculate`; its `value` is the numeric answer, while the display uses 12 significant digits. |
| UnitConverter | `Value` remains the unrounded caller string. Seven source categories use affine scale/offset conversion and six significant display digits. Optional JSON `Categories` contain `Value`, `Label`, `From`, `To`, and `Units` (`Value`, `Label`, `Symbol`, `Scale`, `Offset`). `Category`, `From`, and `To` choose initial units. Legacy JSON `Rates` and option labels still work. `ely:change` includes full `value`, original `input`, and selected unit keys. Shared selects provide arrows and keyboard behavior. |
| QRCodeScanner | `URL` supplies a frame; `Value` can render a local code, and `Result` is a caller-confirmed decode. `ely:scan` with `{value}` displays and emits each changed result through `Action` (default `scan`). Camera access and decoding are host boundaries; no permissions are requested. Optional `Manual` exposes the legacy host-submit field. |
| Captcha | `URL`/`Challenge`, `Ratio`, `Name`, `Action`, `RefreshAction` and `State` remain caller-owned. Submit sends trimmed text once, then waits. `ely:misc-state` accepts `asking`, `checking`, `wrong`, `passed`, and optional `url`. Refresh only requests another challenge. No answer is embedded in runtime code. |
| Poll / Survey | Poll options use stable `Value`, `Label`, `Count`; `Voted` and host `{voted,votes}` state control results. Default submission does not change counts. Only the source gallery explicitly sets `LocalVotes`. Survey `Questions` have `Value`, `Label`, `Type` (`choice`, `several`, `text`) and `Options`. Every question must be answered before `Action` receives structured answers. |
| Quiz / Flashcard | Quiz `Questions` contain `Label`, `Options` and `CorrectValue`; legacy single-question props remain supported. Answers lock after checking; Next, final score, and restart are local. `Action` receives `right` and `total` on completion. Flashcard `Items` use `Label`/`Content`; native buttons turn cards and wrap the deck. |
| LicenseViewer / Changelog | Packages use `Items` with `Label`, `Version`, `License`, `Content`. Selection and arrow/Home/End navigation preserve plain license text. Legacy `Label`/`Value` document content and changelog `Items` remain caller-supplied. |
| Terms / Consent / CookieBanner | Terms use `Label`, `Value`, `Agreement`, `Action`, `DeclineAction`. Accept requires agreement. Escape/backdrop/Decline return the decline callback once; close restores opener focus. `CookieKinds` use `Value`, `Label`, `Content`; `CookieAction` receives selected `values` and `necessary:true`. Nothing writes cookies or storage. |
| Export / Import / CSV | Export `Options` are radio cards; `Action` receives `format`. Import `Fields` use `Value`, optional `Label`, `Required`; `Headers` and `Rows` are caller data. Column matching ignores case and punctuation; unmatched required columns remain empty. Import receives `mapping` in field order, with null for empty optional fields. CSV `CSV` text or a local file is parsed strictly (BOM, quoted commas/newlines, doubled quotes, row width validation); the header toggle rebuilds mapping. CSV emits mapped `records` as original strings. Native file access occurs only after user selection. Dialogs restore focus after the actual close event. |
| WebView / HTMLPreview / IframeEmbed | Caller `URL` or `HTML` renders in an empty-sandbox iframe. The source fixtures use the upstream unavailable-provider message and do not load external example pages. Embed header actions return the URL to the host. The host remains responsible for embedding policy and provider support. |
| PrintButton / ShareSheet | Caller `Action` and label produce a host request; defaults are `print` and `share`. No OS print/share UI is invoked. |

Focused checks: `go test ./ui/gohtmx ./internal/gallery -run TestNative -count=1`, `node ui/gohtmx/tests/unit/native_misc_test.mjs`, and syntax checks for the native entry, misc module and native browser harness. The existing native theme integration command remains **`node ui/gohtmx/tests/unit/native_theme_test.mjs`**. Parent owns package.json and browser runs; this batch does not run a browser or restart a server. Saved reference PNGs 598–613 and Rust source informed geometry, but final live screenshot comparison remains with the parent.

Misc visual follow-up (visual5): LicenseViewer now pairs `--surface-sunken` with `--foreground`, matching upstream `colors.sunken`/`colors.fg`. Node coverage resolves the actual light/dark theme tokens and requires at least 7:1 contrast; the parent browser harness also checks computed contrast. Native-scoped gallery selectors place clock specimens at their source widths with aligned lower edges and 24px spacing, and transfer openers in one wrapping row with 8px spacing. Barcode's description-only specimen is hidden in the gallery; PrintButton renders only the source warning and warning dot. These changes do not alter caller interactions or shared gallery styles.

Visual7 shell repairs (99–120) preserve existing host actions and keyboard paths.
TitleBar/ColumnShell previews use the existing `PreviewStack` contract; caller
`SpecimenCaption`/`SpecimenNote` render outside window geometry. Window controls
compose in a compact row. Launch buttons are content-sized, update/crash primary
actions use paired theme roles, and CrashReporter keeps Copy above its full-width
160px report. No loader or global stylesheet change is required. Run
`node ui/gohtmx/tests/unit/native_shell_test.mjs` and `node ui/gohtmx/tests/unit/foundation_visual_test.mjs`; the parent owns
browser geometry/contrast confirmation and adding the latter to package.json.
