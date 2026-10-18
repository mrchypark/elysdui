# Native tooling and rendering, 614–624

Source: Ely GPUI `49ed1f84056fa13347d68801b479a4a5a8e03b53`, `src/tooling`, `src/rendering`, and `examples/gallery/pages/tooling` / `rendering`. The HTML implementation uses the existing native family, action callbacks, and htmx remount lifecycle. It does not execute the displayed capture command or provide a GPU or screenshot service.

## Validation

The gallery audit loads `advanced-native-tooling-checks.js` with the native family. Its checks cover FPS start/stop, keyed renders, captured events, token overrides, icon filtering and keyboard selection, contrast ordering, playground settings, inspector focus and Escape, host capture replies, render frame validation, and independent instances. They use synthetic input and do not contact external services.

## Caller contracts

Use the existing `ui.Component` API with chapter `tooling` or `rendering`, the canonical component name, a unique ID, and `Props`. The template retains optional `Title`, `Description`, `HideHeader`, and `Disabled`. Gallery fixture defaults do not replace reusable caller props.

| Component | Props and local behavior |
| --- | --- |
| InspectorOverlay | `Content` supplies the sample text; `Items` adds labeled boxes. `ReleaseOnly` hides the Inspect trigger. The web inspector reads boxes within this component, highlights their margin/border/padding/content, holds a clicked box, resumes with Pick, and closes with Escape. It does not inspect GPUI entities or native source locations. |
| FPSMeter / PerfOverlay | Optional `Label`, `Measuring`. Measures actual animation-frame intervals while enabled: one-second FPS, worst interval, and up to 60 bars against the 60 Hz budget. Stop/unmount cancels measurement. |
| RenderCounter | `Items` contains `Label`, stable `Value`, initial `Count`, and optional `Redraw` / `ActionLabel`. Without Items, use `Label`, `Value`, `Count`. Mount increments each seed once; redraw increments only its keyed counter. Hosts notify actual application renders as described below. |
| EventLogger | `Content`, `Label`, `Value`, `Placeholder` configure the watched box/input. Captures local input, including events consumed by children; keeps the newest 50 entries and coalesces consecutive pointer moves. |
| DesignTokenViewer | `Groups` contains `Label` and `Items`. Color items use `Label`, optional CSS variable `Token`, and `Light` / `Dark` or `Color` fallbacks. Measure items use `Kind` (`type`, `radius`, `control`, `icon`, `avatar`, `container`, `spacing`), pixel `Value`, and optional `Token`. Elevation items use `Kind: elevation` and `Sample: raised/floating/modal`. The source fixture includes all 12 groups. |
| IconBrowser | Full or caller-filtered `Icons` name list, selected `Value`, optional `Placeholder` and `Action` (default `select-icon`). Search accepts spaced icon names; arrows/Home/End move focus. Selection publishes `{value}`. |
| A11yChecker | `Items`: `Label`, `Foreground`, `Background`, optional `ForegroundToken`, `BackgroundToken`, `DarkForeground`, `DarkBackground`, and `Need` (default 4.5). Calculates contrast using the existing native helper, composites alpha foregrounds onto opaque backgrounds, marks invalid colors, and sorts failures first. The source fixture has 81 pairs. |
| ScreenshotTest Harness | `Command` (or `Value`) is displayed as text. Optional `Content`. Only an explicit `Action` renders a host request button; `ActionLabel` names it and `Value` is passed to the host. |
| ComponentGallery / Storybook | Optional `Content` and `Items` (`Label`, `URL`) render explanatory text and ordinary links. The upstream example has a descriptive section with no child component; its source fixture intentionally has no catalogue controls. |
| PlaygroundPanel | `Playgrounds` supplies multiple panels, or configure one with `Value` (key), `Preview` (`button`, `ring`, `host`), `PreviewLabel`, `Content`, `Action`, and `Knobs`. Knobs have `Name`, `Type` (`choice`, `number`, `toggle`), and respectively `Options` (`Value`, `Label`, `Selected`), `Min` / `Max` / `Step` / `Value`, or boolean `Value`. Built-in button knobs are `variant`, `size`, `disabled`, `loading`; ring knobs are `value` and `percent`. |
| RenderSurface | `Width` (default 720 CSS pixels), positive `Ratio` (default 2), `Revision`, optional `Label`, and `Action` (default `render`). `Field: true` draws the source contour field locally; `Position` is 0–1, with optional `Ground` and `Ink` colors. Otherwise a host supplies RGBA frames. |

Theme colors are read from the component root's inherited CSS variables, with pinned light/dark fallback values. Root/ancestor theme attribute changes are observed; dispatch `ely:theme` on the component root to refresh explicitly. Measure overrides use their supplied CSS variable; absent an override they show the source base pixel value.

## Host events

Bind through `mount` from `/assets/ely-api.js`. The host owns actual operations. Each action also carries the existing component ID/name/action metadata.

- Render counter: dispatch `ely:render` with `{key}` on the family root. Omit key to increment all its counters. Animation-frame ticks are not application render notifications.
- Playground: a configured `Action` receives `{key, values}`, where toggle values are booleans and number values are numbers. For `Preview: host`, the host updates its preview through its existing htmx replacement/remount path. Returned strings are not inserted as HTML.
- Capture: the configured action receives `{value, requestId}`. Its pending status remains until the host callback resolves or rejects. Return `{message}` to display a result. Older results do not replace the latest capture.
- Custom render surface: its action receives `{requestId, width, height, revision}`. Dimensions are device pixels. Return `{frame: {width, height, pixels}}`; `pixels` must be an RGBA byte array or typed array of exactly `width * height * 4` bytes. Alternatively dispatch `ely:surface-frame` with `{requestId, width, height, pixels}` on that same root. Stale request IDs and invalid frames do not paint.
- Dispatch `ely:surface-revision` with `{revision}` to request changed content. An unchanged revision and size do not request another frame. Dispatch `ely:surface-request` to retry, or to request the first frame after attaching a handler to an already initialized instance.

For example, with an existing custom RenderSurface root:

```js
import {mount} from '/assets/ely-api.js';
const unbind = mount(root, {
  actions: {
    render: async ({width, height, revision}) => ({
      frame: await applicationRenderer.draw({width, height, revision}),
    }),
  },
});
root.dispatchEvent(new CustomEvent('ely:surface-request'));
// applicationRenderer is the caller's renderer, not a library-provided service.
```

The upstream ComponentGallery description (`examples/gallery/pages/tooling/mod.rs:72`) is:

> This app is the gallery: a page per chapter of the library, light and dark, each with scripted states. The --page flag opens one page, and --capture photographs every page and state.

It belongs to the upstream section header. A host can supply it as `Content` when that header is not already shown. Tests should assert the semantic component hook and absence of fabricated controls, then test caller links separately.

## Verification commands

```sh
node --check internal/gallery/assets/advanced-native-tooling-checks.js
node ui/gohtmx/tests/unit/native_tooling_test.mjs
go test ./... -run '^TestNativeTooling' -count=1
```

The browser audit must run after the registration integration above. Syntax and Node tests do not establish browser geometry or whole-application success.
