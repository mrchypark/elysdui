# Interaction API

Navigation palettes rank fuzzy matches for commands, files, and switcher labels. Command groups rank by their best row, with stable ties. Numeric `Items[].Recent` orders recent commands before other groups while the query is empty. QuickOpen uses `Items[].Recent` to select its initial files. SearchPalette uses `Items[].Suggested` for initial suggestions and preserves caller group order. Matched letters use escaped text nodes and accent marks.

`navigation/CommandPalette` keeps keyboard focus in its search field during
ArrowUp/ArrowDown navigation so typing can refine the query without refocusing.
The field controls a local `listbox` and its `aria-activedescendant` identifies
the visible, enabled selected option. Filtering selects the first enabled match
and clears the reference when none remains. IDs belong to the instance and
original row, so ranking and repeated item values do not change their identity.
The active row is scrolled into view. This uses the existing native searchbox
and listbox roles; no new combobox property or alias is introduced.

A caller focus listener may synchronously replace a row or dispose the palette
while keyboard navigation returns focus to the query. Before updating the active
reference or scrolling, that continuation checks its controller, owner, current
field/list and selected row. Invalidated work stops without writing through a
reused row ID; normal HTMX remounting initializes the current instance. This
bounded check does not promise coherence while an owner is between mounts or
certify other lifecycle, action-callback or asynchronous host flows.

This bounded behavior change is specific to CommandPalette. QuickOpen,
QuickSwitcher and SearchPalette retain their existing keyboard focus behavior.
Home/End retain CommandPalette's existing first/last-result navigation; Enter
retains its existing keydown activation. Native text editing, Tab containment,
Escape, pointer activation and host ownership are checked separately. There is
no assistive-technology, IME, modifier-key or native-platform verification claim.
The independently recorded close-before-action and empty-result Enter-submit
mismatches remain open; this focus repair does not redefine either contract.

For host search, bind `onChange` through `ui.mount` and use the query field's `name` and `value`. The host owns fetching and rendering new `Items`. Replace the component root through an htmx swap, then bind the new root with `ui.mount`; the htmx lifecycle initializes its interaction behavior. Preserve `Value` in the new props if the query should remain. An `ely:result` callback does not automatically insert palette rows or reopen the dialog. Host-ranked results should already match the query because local SearchPalette filtering still applies. No remote search endpoint is built into this component.

Render an interaction component with `ui.Component{Chapter, Name, ID, Props}`. `ID` is required, starts with a letter, and is the instance boundary for behavior and events. `Name` accepts a catalogue alias; the renderer receives its primary story as `Kind` and the requested alias as `Variant` and `ComponentName`.

All text props are escaped. `Items` is caller data: each item may have `Value`, `Label`, `Title`, `Content`, `Selected`, and `Href`. Button items may also set `ButtonVariant` (`primary`, `outline`, `ghost`, `danger`, or `link`), and shortcut items may set `Shortcut` (for example, `Ctrl+S`). Every story accepts `Title`, `Label`, `Content`, `Value`, `Name`, `ActionLabel`, `Action`, `Disabled`, and `Items` where applicable. `Disabled` blocks local behavior and generic host actions. `Required` is used on rendered native form controls. The event root is the parent section, with `data-ely-family="interaction"` and `data-ely-component="<chapter>/<alias>"`; its child renderer retains both primary `data-interaction-kind` and requested alias `data-interaction-variant`.

`ely:action` is a bubbling, cancelable event. Base handling sends `id`, `component`, `action`, button `value`, and native `formData` plus `values` for a `data-ely-submit` form. The family module emits `ely:change` for its local selections and state. Host provider work belongs in `ui.mount`; local controls never claim provider completion.

## CopyButton

The minimal `buttons/CopyButton` takes an instance `ID` and exact `Value`,
including an empty string. It renders a 24px ghost icon-only button with a 12px
copy glyph and the accessible name “Copy”. `ActionLabel`, `Label` and `Title`
remain visible-label overrides, in that precedence order; `AriaLabel` can provide
an explicit accessible name. `IconOnly: true` intentionally hides a supplied
visible label once its icon loads. Omitted size follows label presence: a supplied
label keeps the shared default size even with `IconOnly`, unless `Size` is set.
Explicit `Size` and `ButtonVariant` retain the
shared button sizing and tone. Items use the same defaults and independent,
deterministic control and tooltip IDs. Root and item `Disabled` stay native.

An activation captures its exact value and action, writes to the Clipboard API,
and waits for the write to succeed before emitting one `ely:action`, followed by
one `ely:change` with `name: "copy"` and `copied: true`. The action is a post-copy
notification; cancellation or a host callback error cannot undo the write.
Failure leaves an accessible “Copy failed” status, emits only a copied-false
change, and permits retry. No fallback clipboard technique is attempted.

Pending and copied controls retain the same native button, stable name and tab
stop, with temporary `aria-disabled` and JavaScript activation suppression.
Pending additionally sets `aria-busy`. The success-colored 14px check lasts
1400ms after resolution; additional activation cannot restart that deadline.
Its -0.6rad-to-zero rotation takes 120ms with cubic ease-out, or 1ms with reduced
motion. Hover and focus show a Copy/Copied tooltip, and one visually hidden
polite status announces the result. If the copy icon fails to load, its text
fallback remains available. Reset never changes caller `disabled` or moves focus.

Each operation belongs to its physical control, controller and captured host.
Rebinding, moving, replacing or remounting invalidates stale callbacks; current
owner input can release stale temporary lockout. Old promises, cleanup and
reset timers cannot clear a newer operation. Reinitializing the same live
instance preserves its state. New DOM instances start fresh.

These defaults use standard CSS density. The adapter shares the value, label
and disabled path; standalone `Action`, `Icon` and `IconOnly` are not currently
adapter schema properties. Native global density/font/radius scaling and the
expanded standalone extension API are outside this mapping. See the
[finite CopyButton contract](copybutton-complete-contract.md) for automated
Chromium evidence requirements and the still-required real assistive-technology
session; DOM/ARIA tests alone do not establish screen-reader announcements.

| Chapter / primary | Props used beyond the common props | Host actions |
| --- | --- | --- |
| buttons/Button | `ButtonVariant`, `Action` | `Action` or `press` |
| buttons/Sizes | `Items[].Size`, `Items[].ButtonVariant` | `press` |
| buttons/With icons | `Icon` | `press` |
| buttons/Icon button | `Icon` | `press` |
| buttons/ShortcutHint | `Items[].Label`, `Items[].Shortcut` (or the single-value fallback) | item `Action` or `press` |
| buttons/ButtonGroup | `Items` | local `ely:change` |
| buttons/SplitButton | `Items` | `Action`, item `Action` or `select` |
| buttons/ToggleButton | `Pressed` | local `ely:change` |
| buttons/ToggleGroup | `Multiple`, `Items[].Selected` | local `ely:change` |
| buttons/SegmentedControl | `Value`, `Name`, `Items[].Selected`, `Items[].Disabled` | local `ely:change` |
| buttons/FloatingActionButton | `Icon` | `Action` or `create` |
| buttons/ConfirmButton | `Action`, `Value` | `Action` or `confirm` after hold |
| buttons/CopyButton | `Value`, `Action` | `copy` or `Action` |
| buttons/ActionBar | `Items` | item `Action` or `action` |
| buttons/BulkActionBar | `Items`, `Value` | item `Action` or `bulk` |
| buttons/ActionSheet | `Items` | item `Action` or `select` |
| buttons/QuickActions | `Items` | item `Action` or `action` |
| navigation/Tabs | `Placement` (`top`, `left`, or `bottom`), `Items[].Content`, `Items[].Note`, `Items[].Selected`, `Value`, optional `ContextAction` | local `ely:change`; optional context action with `value`, `x`, `y` |
| navigation/EditorTabs | `Items[].Selected`, `Items[].Pinned`, `Items[].Pinnable`, `Items[].Dirty`, `Items[].Preview`, `Items[].Closable`, `Items[].Icon`, `Items[].PinAction` | `toggle-pin`, `reorder`; local `ely:change` |
| navigation/Breadcrumb | `Items[].Href` | browser navigation |
| navigation/Pagination | `Page`, `Total`, `PreviousPage`, `NextPage`, `Jump`, `Items[].Gap`, `Items[].Selected` | local `ely:change` |
| navigation/Steps | `Items[].Content`, `Items[].Selected` | none |
| navigation/Sidebar Navigation | `Items[].Href`, `Items[].Selected` | browser navigation |
| navigation/NavigationMenu | `Items[].Items`, `Items[].Icon`, `Items[].Content` | item `Action` or `select`; local panel open/close |
| navigation/BackForwardNavigation | `BackLabel`, `ForwardLabel`, `Items[].Selected` | `back`, `forward`; local current place |
| navigation/Anchor | `Items[].Value`, `Items[].Content`, `Items[].Selected` | local section scroll |
| navigation/JumpTo | `Name`, `Value`, `Max`, `Required` | `jump`; local line and optional column validation |
| navigation/CommandPalette | `Name`, `Value`, `Items[].Group`, `Items[].Shortcut` | item `Action` or `run` |
| navigation/QuickOpen | `Name`, `Value`, `Placeholder`, `Required`, `Items[].Recent` | item `Action` or `open`; recent files show before a query |
| navigation/QuickSwitcher | `Items[].Content`, `Items[].Selected` | item `Action` or `switch` |
| navigation/SearchPalette | `Name`, `Value`, `Placeholder`, `Items[].Group` | item `Action` or `open` |
| menus/Menu | `Items` | item `Action` or `select` |
| menus/CheckboxMenuItem | `Items[].Selected`, `Radio`, `Group` | `ely:change` with value/checked; item action |
| menus/DropdownMenu | `Host` (`dropdown`, `split`, `overflow`), `Items` | `Action`, item `Action` or `select`; omitted Host preserves the split host |
| menus/ContextMenu | `Content`, `Items` | item `Action` or `select`; secondary-pointer opens the local menu |
| menus/MenuBar Menu | `Items[].Items`, legacy `Items[].Content` | nested item action; hover and arrow switching |
| menus/MegaMenu | `Items[].Items` with Label/Content/Icon/Action | NavigationMenu item action |
| menus/SearchableMenu | `Value`, `Placeholder`, `Items` | fuzzy local filter, matching-letter marks, item action, `ely:change` |
| menus/PieMenu | `Items` | item `Action` or `select` |
| overlays/Popover | `Content`, `Items[].Toggle/Selected/Action`, `Icon`, `ButtonVariant` (including `link`), `Before/After`, optional `CloseLabel` | toggle, bounded placement, trapped Tab, Escape/outside close and focus restoration |
| overlays/HoverCard | `Content`, `Title/Subtitle/Initials`, `Items[].Action` | 500ms hover opening, 200ms leave delay, no automatic focus transfer |
| overlays/Dialog | `Items` or single `Presentation`, `Fields`, `Name/Value`, `Required`, `TrimRequired/Disallow/ValidationMessage`, `Dismissible`, `Action` | `Action` or `submit`; successful host result closes, errors retain the form |
| overlays/Lightbox | `Src`, `Alt`, `Content` | local open and close |
| overlays/Spotlight | `Steps[].Target/Title/Content`, `CoachLabel/CoachIndex`, step `CoachTitle/CoachContent` | measured target ring; Back/Next/Done/Skip, arrows, Escape and restored opener focus |
| overlays/FloatingToolbar | `Selection: true` with `Value/Name`, or `Target` pointing to a text input/textarea; `Items[].Selected/Action` | selection visibility and bounded placement; pointer actions retain field focus and selection |
| overlays/Callout | `Toggle/Open`, `Before/After`, `Title/Content` | in-flow Peek toggle and close; omitted Toggle preserves the legacy callout |
| overlays/Tooltip | `Content`, `Shortcut`, `Delay` (default 400ms, zero allowed) | delayed hover, keyboard focus display, Escape dismissal |
| feedback/Toast | `Triggers`, `Items`: title/label, content, severity, value, action(s), `Hidden`, `Stay` milliseconds (default 5000, zero persistent), `Undo` countdown | caller action; `ely:change` for push/dismiss/expiry |
| feedback/Notification | `Title`, grouped `Items` (`GroupHeading`, `Group`, `Unread`, `Icon`, `Time`, `Actions`, optional `Dismissible`), optional `Reset` | caller row actions; read/clear/reset changes |
| feedback/Alert | single props or `Items`: severity, title, content, actions, `Dismissible`, optional `RestoreLabel` | caller actions; dismiss/restore changes |
| feedback/Banner | `Severity`, `Title`, `Content`, actions, `Dismissible`, `Hidden`, optional `StageContent` and `RestoreLabel` | caller action; dismiss/restore changes |
| feedback/Callout | single props or `Items`: severity, optional title/label, content | none; defaults Note/Tip/Warning/Danger |
| feedback/InlineMessage | single props or `Items`: severity, label/content, icon; optional `Statuses`, `StatusIcon` | local status-cycle changes |
| feedback/EmptyState | single props or `Items`: title/label, icon, content, actions | caller actions |
| feedback/ErrorView | single props or `Items`: title/label, code or icon, content, detail, actions | caller actions |
| feedback/ErrorBoundary | `Content`, `Error`, `Detail`, retry action/label; optional gallery `DemoError`, `DemoDetail` | caller retry; demo toggle is opt-in |
| feedback/Result | single props or `Items`: title/label, severity (success/error), content, actions; optional `Replay` | caller actions; local replay change |
| feedback/ConfirmationCard | single props or `Items`: title, content, command/detail, value, action/cancel action, labels, `Destructive`, optional result messages | caller actions plus local confirmation change |
| feedback/SavingIndicator | `Items` or single status row: `Name`, `States` (state, label, icon, retry), initial `Index`, optional `RetryAction`; explicit `State` + `Value`/`Label` for a static host-owned row | caller retry; independent status changes |
| feedback/Countdown | numeric `Value`, or `Clocks[].Value`, `Mode`, `Restart`, `Label` | monotonic countdown/timer; completion once per restart |
| motion/Spinner | `Items[].Style`, `Size`, `Label`, `Sizes` | six source motions; reduced-motion rest |
| motion/Skeleton | `Label`, `Rows[].Cells[].Width` | card, avatar, text, table and block placeholders |
| motion/Shimmer | `Content`, `Value` | none |
| motion/LoadingButton | `Loading`, optional `Action`, `Value` | configured `Action`; pending clears on matching `ely:result` or `ely:error` |
| motion/LoadMore | `Items`, `Shown`, `PageSize`, optional `Action` | matching host result reveals one page; errors preserve the count |
| motion/ProgressBar | `Items`, `Rings`, `Value`, `Max`, `Buffer`, `Segments`, `Indeterminate`, `Linked`, `Steps` | determinate/buffered/segmented/sweeping tracks and rings |
| motion/LoadingOverlay | `Content` | none |
| motion/LazyLoad | `Content` | none |
| motion/Suspense | `Content`, `Error`, `Action` | loading, resolved, failed and retry states; matching host result/error |
| motion/RefreshIndicator | `Action` | `Action` or `refresh` |
| motion/UploadList | `Items` | none |
| motion/Transition | `Content` | none |
| motion/Stagger | `Items`, `Step` | replay; staggered entrance |
| motion/AnimatePresence | `Items`, `AddItems` | stable-key add and 200 ms exit; `gone` |
| motion/Flip | `Items` | source shuffle with FLIP animation |
| motion/Reorder | `Items` | drag/drop and keyboard reorder |
| motion/Marquee | `Items`, `Content`, `Pace` | measured seamless loop |
| motion/Ripple | `Label`, `CelebrateLabel` | pointer ripple and confetti |
| motion/Glow | `Content`, `Label` | glow and pulse |
| motion/Blink | `Content`, `Value`, `Step` | blink, flash tick, failed sign-in shake |
| motion/ParticleBackground | `Content`, `GradientLabel` | particles and tonal gradient |
| interaction/Draggable | `Lanes[].Items`, legacy `Items` | cross-lane move with source/target payload |
| interaction/Resizable | `Width`, `Height`, `MinWidth`, `MaxWidth`, `MinHeight`, `MaxHeight`, `Shapes`, `SortItems` | bounded resize, rotation, selection and sorting |
| interaction/LongPress | `Threshold`, `PressAction`, `Action`, `Gestures` | separate press/hold, double-click, pan/zoom |
| interaction/Hotkeys | `Bindings[].Keys`, `Bindings[].Action` | scoped shortcuts and two-stroke chords |
| interaction/Undo | `Value`, `UndoLabel`, `RedoLabel` | snapshot undo/redo; new edits clear redo |
| interaction/VirtualScroller | `Count`, `RowHeight`, `RowPrefix`, `Panes` | bounded rendered window and bidirectional scroll sync |
| interaction/Autofocus | `Items`, `Options`, `Name`, `Placeholder` | reveal/focus, clamped roving tools, typeahead |

Gallery fixtures use unique `audit-<chapter>-<index>` IDs, caller names and values, and disabled or required cases. Navigation 195–202 and menus 203–210 use the complete upstream example datasets. Gallery checks verify mounting plus meaningful state changes for tabs, menus, dialogs, selection controls, filters, hotkeys, resize, undo, and native form submission.

Menu parity uses upstream revision `49ed1f84056fa13347d68801b479a4a5a8e03b53`, `src/menus/{model,menu,draw,hosts,pie}.rs`, `src/theme/tokens.rs`, and `examples/gallery/pages/menus/{rows,more}.rs`. Menu rows accept `Label`, `Value`, `Action`, `Icon`, `Shortcut`, `Disabled`, nested `Items`, `Separator`, and `Heading`. `Checkbox` marks a check row; `Radio` plus `Group` selects one row in that group. State changes emit `ely:change`; leaf actions retain the host callback contract. The host owns persisted state and can return replacement HTML through the existing htmx remount contract. SearchableMenu filters caller-supplied rows locally; it does not fetch remote results.

The exact `menus/RadioMenuItem` alias defaults its direct leaves to radio rows when `Radio` is omitted and `Checkbox` is not true. Explicit `Radio: true` takes precedence; `Radio: false` retains checkbox semantics. The exact `menus/OverflowMenu` alias defaults omitted or empty `Host` to an ellipsis-only overflow trigger. Explicit hosts still win; canonical `menus/DropdownMenu` and `menus/SplitButton` keep their legacy split default. See [menu alias contracts](menu-alias-contracts.md) for Go/SDUI compatibility, overrides, and verification boundaries.

An explicitly allocated empty row `Items` slice (SDUI `items: []`) opens an empty submenu; omitted or nil Go child items remain leaf actions. See the [empty submenu contract](menu-empty-submenu-contracts.md) for precedence, keyboard/focus behavior, and the bounded SDUI cutoff correction.

The [bounded menu interaction contracts](menu-interaction-contracts.md) document the Menu/DropdownMenu/ContextMenu behavior checks, event ordering, real HTMX replacement evidence, and the explicit API gaps when comparing with the newer `da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721` source. This does not change the menu source pin above.

The source geometry is a 200px minimum menu width, 32px rows, 16px leading icons, and 4px panel padding. Context and radial surfaces are 420×140px and 420×260px. The radial ring uses an 84px radius and 40px buttons in a 248px area. Context menus clamp to the viewport; submenu arrows enter and leave nested panels; menu-bar arrows and hover switch panels. The source MegaMenu example refers callers to NavigationMenu, which the nested API reuses; legacy `Items[].Content` sections remain supported. Native application menu actions remain caller callbacks on the web.

Focused checks: `go test ./... -run 'TestInteraction|TestInteractiveStoryTargetsAreRendered' -count=1`, `node ui/gohtmx/tests/unit/interaction_navigation_test.mjs`, `node ui/gohtmx/tests/unit/interaction_menu_test.mjs`, and syntax checks for both interaction JavaScript files. The menu test covers score ordering, stable ties, highlight letters, heading suppression/restoration, radio isolation, and search keyboard selection without a browser. The menu pass did not inspect indexed screenshots; the subsequent overlay pass used `audit-results/ely-reference`. Rendered browser comparison remains a separate integration check.

Overlays 211–218 were compared with the same pinned revision's `src/overlays`, `src/primitives/tooltip.rs`, `src/theme/tokens.rs`, gallery overlay examples, and all eight indexed PNGs in `audit-results/ely-reference`. These PNGs show the initial closed state; open-state behavior and dimensions come from source. The popover content is 288px wide with 12px padding, the hover profile is 256px with 16px padding, dialog cards are 440px, lightbox thumbnails are 192×128px, the selection field is 384px, and Peek is 512px. Source photos are copied unchanged from `examples/gallery/assets/{dunes,atrium}.jpg` into the two `ui/gohtmx/assets/ely-api-interaction.*.jpg` files.

The dialog fixture contains the five source variants: profile, acknowledgment-required alert, destructive confirmation, validated rename, and fullscreen notes. Drawer and sheet caller presentations remain supported. Use `Items[].Presentation` for several launchers or `Presentation` for one. Alerts default to non-dismissible; an explicit `Dismissible` overrides that behavior. Dialog actions and forms use the existing host callback contract: `ely:result` for the matching action closes and restores focus, while `ely:error` leaves the dialog open. Prompt validation runs before action dispatch. Callers retain control of server validation and persisted state.

Tour steps can reference caller elements with `Target` CSS selectors. Without a Target, a step renders its own labeled target button. Coachmarks use the same measured target and the step's coach text. Missing targets end the tour. Selection tools support text input and textarea selections; their horizontal anchor uses the field font and selection start, clamped to the field and viewport. Legacy always-visible toolbars and static Spotlight/Callout content remain available when the new opt-in props are omitted.

The source's overlay Tooltip page is explanatory navigation to other chapters. Its gallery preview uses `ReferenceOnly`; the reusable Tooltip API still renders the delayed tooltip. Run `node ui/gohtmx/tests/unit/interaction_overlay_test.mjs` for deterministic bounds, focus, validation, hover-delay, cleanup, and lightbox-boundary coverage. Browser regressions and rendered pixel comparison remain separate parent integration checks.

Toggle groups use `aria-pressed` per item and include the whole current selection as `values` in each change event. Set `Multiple: true` for independent marks; omit it for one selected item after activation. Initial toggle `Selected`/`Pressed` flags are caller-owned; provide at most one in a single-select group. Segmented controls use `role="radiogroup"` and one `role="radio"` choice. For tabs and segmented controls, a nonempty `Value` takes precedence over item `Selected` flags; only the first matching item is selected. An unknown value selects nothing. Reselecting the active choice does not emit a change. Segmented controls use roving focus with arrow keys, Home and End, skipping disabled choices. Tabs use roving tab focus; `left` placement uses Up and Down, while `top` and `bottom` use Left and Right. Escape closes an open menu or popover and returns focus to its trigger. Each local change emits bubbling `ely:change` with the selected `value` and its state (`selected`, `pressed`, or `checked`) where applicable.

Editor tabs support pointer drag reorder and Alt+Left or Alt+Right keyboard reorder. `Pinnable` renders a pin control; it emits `PinAction` or `toggle-pin` and updates `aria-pressed`. For `Items[].Icon`, a lowercase, hyphenated name maps to `/assets/ely/icons/<name>.svg` as a `currentColor` mask; an unavailable or invalid name leaves the text label visible.

`ParticleBackground` and `AnimatedGradient` use local CSS motion. `Lottie Player` uses the bundled `lottie-light` renderer. Supply either `Animation` as inline Lottie JSON or `AnimationURL` as a same-origin JSON URL; `Autoplay` and `Loop` control playback. The renderer provides local play, pause, and seek controls, emits `ely:change` with `name: "frame"`, and destroys the animation when its component unmounts. An unavailable library, invalid JSON, failed request, or cross-origin URL dispatches `ely:error`; it never reports host operation success.

### Feedback source parity (219–230)

Compared with `49ed1f84056fa13347d68801b479a4a5a8e03b53`, `src/feedback/{toast,notification,messages,states,result,confirm,status}.rs`, the two feedback gallery page files, and reference PNGs 219–230. The gallery retains all six toast recipes, five notifications, four severities, three empty states, four error views, two results, two confirmation cards, and independent save/sync/connection rows. Geometry follows the source: 360px toast viewport, 384×448 notification frame, 512px alert/callout/confirmation columns, 512×160 banner frame, 320px state frames, 48px state discs and 64px result marks.

Toast launchers create fresh instances from hidden recipe rows. At most four remain active; the oldest exits when another is pushed. Hovering the viewport pauses all expiry clocks, including subsequently pushed toasts. Undo and other caller actions dismiss only their own instance; recipes remain reusable. Every mount owns and cancels its timers and listeners. `Stay: 0` means persistent, corresponding to upstream `stay(None)`. Reduced motion settles entrance/exit and result drawing; expiry and undo time remain real time.

Host application operations use the existing `data-ely-action` / `onAction` contract. Persist changed data in the host and return updated props through the existing htmx replacement/remount path. Local notification/read state and status/demo controls do not perform network work. `ErrorBoundary` matches the upstream caller-`Result` contract: it displays `Content` when `Error` is empty and an error fallback otherwise. The [pinned upstream implementation](https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Components/src/commit/da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721/src/feedback/states.rs) explicitly never catches panics; the HTMX mapping likewise does not catch global JavaScript exceptions or retry requests itself. This is shared source behavior, not a missing exception catcher. `Detail` supplies the visible error chain and defaults to `Error`. Supplying `Action` enables a retry button whose label defaults to “Try again”; `ActionLabel` overrides it. The retry emits the existing `ely:action` event exactly like other host actions. Neither a retry click nor a resolved host callback clears the fallback: the host must supply a new successful result by replacing the component with empty `Error` and updated `Content`. Failed callbacks retain the current fallback. No host network or persistence outcome is inferred.

The browser logs the visible error text once per changed error on each boundary DOM instance, matching the source's keyed error state. Logging is limited to 4,096 characters and never serializes callback errors or other hidden objects. Rebinding or removing/reinserting the same DOM node does not duplicate the same error log; replacement with a new node creates a new instance. Explicit demo recovery keeps the last logged error, as the source does. Only the gallery's explicit `DemoError` enables simulated failure/recovery. `ConfirmMessage` and `CancelMessage` are optional caller-selected local messages; omission retains button-label feedback. Source notification fixtures set `Dismissible: false`; existing callers retain dismiss buttons unless they opt out.

Focused checks: `go test ./... -run 'TestInteractionFeedback|TestInteractionRendersOverlayFeedbackAndMotionStructures' -count=1`; `node ui/gohtmx/tests/unit/interaction_feedback_test.mjs`; `node --check ui/gohtmx/assets/ely-api-interaction.js`; `node --check internal/gallery/assets/advanced-interaction-checks.js`. Add `node ui/gohtmx/tests/unit/interaction_feedback_test.mjs` to the parent-owned npm test script. Browser and pixel comparison remain parent verification; no browser was used for this pass.


Catalogue 244–252 and 568–574 use upstream revision `49ed1f84056fa13347d68801b479a4a5a8e03b53`, motion and interaction source, the corresponding gallery examples, and all sixteen indexed reference PNGs. Fixtures contain the full source lists, twelve selection tiles, 10,000 virtual rows, two forty-line synchronized panes, shortcuts and fruit choices. Motion uses source durations: 60 ms stagger, 200 ms presence, 560 ms ripple, 1800 ms confetti, 2400 ms glow, 1600 ms pulse, 1060 ms blink, 900 ms flash and 420 ms shake. The marquee runs at 40 px/s; backdrops are 320×160 px.

Resize handles clamp to caller bounds and use 8 px keyboard increments. Rotation uses 15-degree keyboard increments and Shift snapping. Selection supports additive modifiers, arrows, Space, Escape and Meta+A. Pan/zoom clamps scale and preserves the zoom anchor. Toolbar endpoints clamp; fruit typeahead retains the source 800 ms prefix. Chords reset after 1000 ms or Escape/blur. These controls emit local `ely:change` and caller actions; hosts retain persistence and can replace HTML through the existing htmx remount contract. No remote search or provider infrastructure is added.

Run `node ui/gohtmx/tests/unit/interaction_motion_test.mjs` for deterministic runtime regression coverage and `go test ./... -run 'TestInteraction|TestInteractiveStoryTargetsAreRendered' -count=1` for render/fixture coverage. Add the Node command to the parent-owned npm test script. Run syntax checks on both interaction JavaScript files. Native drag previews and browser animation interpolation differ from GPUI; Reorder uses measured row heights and the source landing calculation to displace neighboring rows during hover, restores transforms on cancellation, and commits caller order only on drop. The upstream Lottie example is unavailable; the existing caller-owned HTML Lottie renderer remains supported. Rendered browser and visual verification belong to the parent checkpoint.


Catalogue 231–243 was checked against the pinned feedback clock, spinner, skeleton, progress, overlay, transition and upload sources, the matching gallery examples, and all thirteen indexed reference images. It now includes three independent clocks; six spinner styles and five sizes; complete skeleton card/table shapes; two independent loading buttons; all eighteen LoadMore people; four bar variants and three rings; the source overlay/lazy/report/refresh/upload examples; and three simultaneous transition entrances. Templates use data attributes instead of inline style markup.

`DemoDelay` is an explicit local fixture simulation in milliseconds. Source fixtures use 1600/2400 ms for Save/Export, 900 ms for paging, 1400 ms for the overlay, and 1500 ms for the report. Production callers with `Action` and no `DemoDelay` wait for their matching `ely:result`/`ely:error` or host replacement HTML. Completion cancels prior timers; errors do not advance paging. The overlay blocks its covered content while active and fades over the source 120 ms. Transition exit retains content for 200 ms, and a rapid reversal cancels stale exit work. Lazy rows reveal only when their bounds intersect the viewport and remain loaded afterward. Countdown restart re-arms its completion event after zero; Timer Stop/Reset preserves elapsed time and starts a fresh clock.

Toast native timer calls use wrappers so the browser never receives the clock object as the native API receiver. `node ui/gohtmx/tests/unit/interaction_feedback_test.mjs` includes a receiver-sensitive regression for the production default clock. `node ui/gohtmx/tests/unit/interaction_motion_test.mjs` now also covers loading clocks, expiry/restart, reversible transitions, finite paging, independent pending actions, report retry, stale timer cancellation, and measured Reorder hover/cancel/drop. The loading render/fixture tests are `TestInteractionLoadingCallerContracts` and `TestInteractionLoadingSourceFixtures`. Browser execution remains the parent integration check.

### Owner-driven ContextMenu requests

Only `menus/ContextMenu` accepts `ContextMode` and `ContextRequest`. Omitted
`ContextMode` means `automatic`, preserving right-click, ContextMenu/Shift+F10,
and the existing fallback button. Explicit modes are `automatic` and `manual`;
empty or null modes are invalid. A valid request in automatic mode is inert and
unconsumed. The standalone renderer still validates its shape.

```go
ui.Component{
    Chapter: "menus", Name: "ContextMenu", ID: "canvas-menu",
    Props: map[string]any{
        "ContextMode": "manual",
        "ContextRequest": map[string]any{
            "Number": strconv.FormatUint(requestNumber, 10),
            "X": 120.5, "Y": 80.25,
        },
        "Label": "Canvas commands",
        "Items": []map[string]any{{"Label": "Copy", "Value": "copy"}},
    },
}
```

`ContextRequest` may be omitted or nil. Otherwise it is a closed
`map[string]any` containing exactly `Number`, `X` and `Y`. `Number` is a canonical
decimal u64 string from `"0"` through `"18446744073709551615"`; signs, leading
zeros, whitespace, decimal/exponent spellings, numeric values and overflow are
rejected. Use `strconv.FormatUint` in Go and a string or `BigInt.toString()` in
JavaScript. Never convert an arbitrary u64 through a JavaScript Number.
`X`/`Y` are finite numeric viewport/client coordinates in CSS pixels. Zero,
negative, fractional and very large finite values are accepted; existing
fixed-point placement clamps the measured menu to the viewport. NaN, infinity,
booleans and numeric strings are invalid. Labels/content remain escaped.

After the family is ready, the owner can synchronously request a presentation on
the connected component root, independently of SDUI:

```html
<button type="button" id="canvas-menu-open">Open canvas commands</button>
<script type="module">
const button = document.getElementById('canvas-menu-open');
let requestNumber = 0n;
button.addEventListener('click', () => {
  const root = document.getElementById('canvas-menu');
  const box = button.getBoundingClientRect();
  root.dispatchEvent(new CustomEvent('ely:context-request', {
    detail: {number: (++requestNumber).toString(), x: box.left, y: box.bottom},
  }));
});
</script>
```

The button must be a labeled, keyboard-accessible owner control. Keep request
numbers within u64 and choose the owner's numbering policy. Manual mode owns
all opening: the built-in root trigger is hidden and removed from tab order,
including when `ActionLabel` is supplied. Synthetic trigger clicks, ArrowDown,
right-click and ContextMenu/Shift+F10 cannot open or reposition it. Right-click
and host context-key handlers return without preventing the native browser
menu; preventing that menu is the owner's decision. Keyboard navigation,
confirmation and Escape inside an already open menu continue working. Left
pointer interaction on the host dismisses; right pointer on the host leaves an
open manual menu unchanged. Outside interactions retain their normal defaults.
This owner-only keyboard policy is a web adaptation, not a native parity claim.

Event detail must be null or the exact lowercase three-field object shown.
Values are not coerced. Malformed/accessor objects, disabled roots/triggers,
wrong-mode events and events targeting a descendant or another root are atomic
no-ops. They do not consume a number or emit action/change/error events. There
is no replay queue: reissue a request after readiness or after enabling.
Opening focuses the first enabled direct row, or the named root panel when it
has no enabled rows. A repeated number changes nothing, including after close.
Null/omission changes nothing and does not close an open menu or erase the last
number. Only the last accepted number is remembered: A → B → A opens three
times. A changed request restarts this root's presentation, clears its old
submenu selection, and preserves the original outside focus owner. Existing
focus return, leaf/check/radio callback ordering and payloads are unchanged.

Deduplication belongs to the physical root plus its ID, family and exact
component name. Compatible default `innerHTML` HTMX remounts close old panels
before mutation but retain the last number. An unchanged seed stays closed;
a changed seed opens once. Manual → automatic → manual retains the number.
A new outerHTML root, or an ID change observed at ContextMenu remount, starts a
new owner. Removing/reinserting the same node keeps its number, but requires
normal startup and a fresh host binding. Changing component families requires
replacement rather than retained-element conversion.

Cleanup removes request listeners and invalidates pending runtime focus/key
work. Requests while an HTMX swap is stopped are not queued. The request path
owns no fetch, promise or deferred opening. Owners must cancel/filter their own
stale asynchronous work, for example on `ely:cleanup`; a changed-number event
explicitly dispatched to the current live root is accepted regardless of when
host work started. Last-number equality cannot establish request age.

This bounded API does not add programmatic close, open/close callbacks, live
row reconciliation, continuous point tracking, native adapter support, visual
host variants, hover aim, arbitrary content slots, or oversized/RTL/touch
geometry. Go and VM checks do not establish native-browser focus or HTMX
network behavior; the companion browser matrix runs on both standalone and
adapter fixtures in CI.
