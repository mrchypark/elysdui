# Bounded menu interaction contracts

This increment verifies the existing `menus/Menu`, `menus/DropdownMenu`,
`menus/ContextMenu`, and shared nested/check/radio row path. It is **not** a claim
that every menu API in upstream Ely is available on the web.

## Source versions and compatibility

The existing [interaction guide](advanced-interaction.md) describes menu
parity against `49ed1f84056fa13347d68801b479a4a5a8e03b53`. That provenance remains
unchanged. This increment additionally compares those contracts with upstream
`da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721`:

- `src/menus/model.rs`: `MenuItem::{new,check,radio,submenu,icon,keys,disabled,on_click}`,
  `Menu::{item,separator,group,step}` and newer `buttons`/`across`
- `src/menus/menu.rs`: `Open::{show,close}`, `mark`, `choose`, `keys`, and `hang`
- `src/menus/hosts.rs`: dropdown, overflow, split, and context hosts; this file is
  unchanged between those two source pins
- `src/menus/tests/mod.rs`: `submenus_open_right_and_close_left`,
  `closing_from_the_trigger_hands_focus_back`, `confirm_keys_stay_inside_the_menu`,
  `modified_confirm_keys_do_not_pick`, and `an_open_dropdown_follows_its_host`

The shared contracts are enabled-row traversal, separators/headings that do not
activate, nested menu entry/exit, dismissal before caller execution, and returning
focus. Native check/radio state belongs to the caller. The existing web adapter
adds local `aria-checked` state and `ely:change`; that local state is not a promise
that the host persisted the choice.

## Public web surface in this increment

- Roots: `ID`, `Label`/`Title`, `Icon`, `Disabled`, and `Items`
- Dropdown: `Host` is `dropdown`, `split`, or `overflow`; omitted `Host` retains
  the established split default for `menus/DropdownMenu` and `menus/SplitButton`.
  The exact OverflowMenu alias has an [overflow default](menu-alias-contracts.md).
  `Action`, `ActionLabel`, and `Value` describe
  the split primary action
- Context: `Content` and optional `ActionLabel`; right pointer, ContextMenu key,
  and Shift+F10 open the menu
- Rows: `Label`, `Value`, `Action`, `Icon`, `Shortcut`, `Disabled`, `Items`,
  `Separator`, `Heading`, `Checkbox`, `Radio`, `Group`, and `Selected`
- `Shortcut` is a displayed hint, not a global shortcut binding. Submenu rows
  are triggers even inside `CheckboxMenuItem`; they do not toggle a checkbox
- A radio group is local to its nearest menu panel. Re-selecting a selected
  radio still invokes its caller action, as upstream `choose` does

Leaf activation commits local state, closes the menu, emits a check/radio
`ely:change` where applicable, then emits exactly one `ely:action` with the usual
`value`, `formData`, and `values`. Form-associated menu actions retain their
caller's successful form controls. A rejected callback produces `ely:error`,
not `ely:result`; the menu remains dismissed and local selection remains until
another choice or host-rendered replacement. Caller authorization, persistence,
error presentation, and reconciliation are host responsibilities.

## Requirement-level evidence

The deterministic [VM suite](../../ui/gohtmx/tests/unit/menu_contracts_test.mjs) executes extracted
production functions. The [Go tests](../../ui/gohtmx/menu_contracts_test.go) inspect actual
renderer output. Neither proves native browser input or layout.

The [browser fixture](../../ui/gohtmx/tests/fixtures/menu-contracts/main.go) uses `NewTemplates` and
`RenderComponent`, production CSS, production family entrypoints, and bundled
HTMX. The [browser suite](../../ui/gohtmx/tests/browser/menu-contracts-browser-test.mjs) observes:

| Requirement | Behavioral oracle |
| --- | --- |
| Open and traverse | Native focus after ArrowDown, wrapping, Home/End; disabled and structural rows skipped |
| Leaf/check/radio | Exact action value/name, checked state, and closed-panel snapshots in caller callbacks |
| Callback failure | One rejected operation, error event, no success event, then a successful retry |
| Nested menus | Two levels, ArrowRight/Left/Escape, hover then click, and stale child dismissal on traversal |
| Checkbox host nesting | A nested trigger opens its child instead of toggling/closing |
| Host variants | Dropdown/overflow actions and split-primary close before callback |
| Empty/all-disabled | Focusable named panel receives focus and Escape restores the trigger |
| Dismissal | Tab leaves rows, Shift+Tab returns to trigger, outside click preserves its destination; blank pointer release restores the owner without overriding new focus/reopen/teardown or blocking text selection |
| Context | Pointer clamp, keyboard reanchor, original focus return, and nested trigger return |
| Disabled/modifiers | Synthetic disabled activation and modified Enter/Space do not notify |
| Geometry | Root edge collision correction and left-opening nested panel, using measured boxes |
| Caller form | `FormData` and `values` preserve successful named controls |
| HTMX lifecycle | Real GET with default innerHTML and outerHTML, old open panel cleanup, inert detached controls, one new callback |

JSON evidence is always written to `test-results/contracts/menu*.json`, including
failures. It records the exact commit, dirty state, fixture and served-source
hashes, both source pins, requests, passed requirements, and the failing assertion.
The eight source-level causal mutants are `radio-scope`, `action-order`,
`context-focus`, `placement`, `cleanup`, `native-focus`, `outside-focus`, and `stationary-hover`. A mutant counts as killed only when
its designated assertion fails; an unrelated exception or timeout is a failed
run. The coordinator runs actual browser proof in CI. Local VM/Go success does
not imply browser success.

Hover/click evidence additionally retains bounded native pointer/focus event
snapshots, including `focusout.relatedTarget`, `document.activeElement` at the
handler and microtask boundary, and trigger/panel geometry. The `native-focus`
mutant restores dismissal based only on transient active focus. It must fail the
unchanged hover-open submenu click assertion, not an unrelated earlier check.
Outside-blank dismissal also retains native event/focus snapshots. Its
`outside-focus` mutant removes only the matching-gesture pointerup focus return
and must fail the named blank-dismissal oracle. The fallback never prevents
pointer defaults and is invalidated by newer input, focus, menu generations,
disconnect, or teardown.

```sh
node ui/gohtmx/tests/unit/menu_contracts_test.mjs
node ui/gohtmx/tests/browser/menu-contracts-browser-test.mjs
for mutant in radio-scope action-order context-focus placement cleanup native-focus outside-focus stationary-hover; do
  MENU_NEGATIVE_CONTROL="$mutant" node ui/gohtmx/tests/browser/menu-contracts-browser-test.mjs
done
```

## Stationary-pointer keyboard recovery

Both source pins select submenu rows on mouse movement (`src/menus/draw.rs`,
line 122 at `49ed1f8`, line 223 at `da3fdca`). A boundary event caused by showing
new content beneath a stationary pointer must not take keyboard selection.
Only menu rows now use `pointermove`; quick-action, menubar-host and navigation
pointer-over paths remain unchanged. This does not implement delayed hover/aim.

The post-merge main test at `ffd821872611bea858336e3b683bb980d5562063`
(run `39131907308`, artifact `12138705427`) failed before the context-focus
mutant's intended oracle. That report remains a failed run, not a mutant kill.
Diagnostic run `39132730679` at test merge
`0d30595f095c24ade4dea8fe611c8f3670457f95` reproduced the same failure on positive
trial 7. Its untruncated trace records native Space keydown on Ruler, a trusted
zero-movement `pointerover`, submenu-child focus, then Space keyup on that child.
The checkbox stayed checked. The artifact SHA-256 is
`35dcaa20d54d384abc530760d2c8182f122d34020f152f9af185aa71ae3386e8`.
Run `39133061769` (artifact `12138611749`, tree
`797de680d8c1b5b49718af1a24f1b806d8e7a2e1`) independently repeated the positive
failure on instant trial 3; artifact SHA-256 is
`ca416148d8a7e6533e7f5b792a76624f3c229ed6db5a670a6e600ad9a8ae390d`.

The VM replays that event order against extracted production handlers, and checks
that boundary events neither open a child nor close a keyboard-owned sibling.
Actual movement still opens enabled children and closes an old sibling; disabled
rows stay inert. The browser keeps twenty instant and twenty 80 ms held-Space
trials, with unchanged state assertions, bounded per-check/per-mode traces and
failure retention. These native trials are timing-dependent: the post-merge
full run `39134664652` at `8cc945921a5ef766e2c67df986a93fc46cc45dc3`
passed all forty even with the boundary guard removed. Its artifact SHA-256 is
`a7c1fa154b8016b2f9087742c6dd60bd9effe2547e09ac3267b8431e12505562`;
that surviving control remains a failed run, not evidence that the guard is unnecessary.

A separate edge replay runs before the unchanged forty native trials. Only this
isolated case moves the real pointer onto the measured outside button before
opening the menu, and requires ruler focus before and after native keydown. It
then injects an explicitly synthetic `PointerEvent("pointerover")` at measured submenu-row
coordinates between native Space keydown and keyup. The report requires
`isTrusted: false`, zero movement, the received constructor/coordinates, native
key phases, focus snapshots, and the exact checkbox/action/change outcome. The
injection fixes event order for the causal control; it is not described as native
pointer evidence. Native key release and event-listener cleanup run even on error.
The `stationary-hover` mutant removes only the menu-row boundary guard and must
fail the named checkbox-confirmation oracle in this separately labelled edge
replay, before any timing-dependent trial can end the control early. The positive
then runs all forty native trials. Actual fixed-head browser success and the
eighth kill require CI evidence; VM success alone is not proof of native scheduling.

The [explicit empty-submenu addition](menu-empty-submenu-contracts.md) separately
covers child-array presence, empty child focus/key behavior, and its exact-source
controls. Its local Go/VM checks do not add browser credit to this earlier suite.

## Explicitly remaining contracts

These are implementation requirements, not evidence supplied by this increment:

1. `ContextMenu::manual` numbered owner requests exist at **both** source pins in
   `src/menus/hosts.rs`; the current web props do not expose this API.
2. The newer `Menu::buttons` horizontal icon-button row and `across` traversal in
   `src/menus/model.rs` have no web row representation in this increment.
3. Newer delayed hover/aim behavior in `src/menus/aim.rs`, `draw.rs`, and `menu.rs`
   is not implemented by immediate web pointer-movement opening.
4. Native `settle` preserves row identity during live owner updates. This suite
   verifies complete HTMX replacement, not in-place row mutation while open.
5. Root menus remain host-relative and recheck collisions on scroll/resize.
   Arbitrary layout movement that creates a new viewport collision without either
   event, oversized panel scrolling, nested collision changes while already open,
   RTL layout, and mobile/touch behavior need additional browser requirements.
6. MenuBar, MegaMenu, SearchableMenu, PieMenu, and native application menus share
   some helpers but are not granted whole-component parity by these tests.
7. Browser accessible names/focus/keyboard behavior is tested; screen-reader
   announcements and a full assistive-technology matrix remain unverified.
