# Overlay browser contracts

Run from the repository root with Go 1.26+, Node 24, and Playwright Chromium:

```sh
node ui/gohtmx/tests/browser/overlay-contracts-browser-test.mjs
```

For an installed browser, set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`.
The suite renders its full page and fragment with `ui.RenderComponent`, serves
production CSS/JavaScript, and makes real HTTP requests through the bundled HTMX.
It writes `test-results/overlay-contracts.json`, including revision, assertions,
negative controls, and failure details. A launch failure is a failed run, never
browser evidence.

Source contracts were inspected at Ely revision
`da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721`:

- `src/overlays/dialog.rs`: accessible title/detail, initial focus, trapped Tab,
  Escape/scrim close and return focus. HTMX additionally supports a deliberately
  nondismissible alert/explicit `Dismissible=false` contract and async host results.
- `src/overlays/popover.rs`: button toggle, focus ownership, trapped Tab, Escape
  and outside dismissal, independent state.
- `src/layout/sheet.rs`: Drawer grip, snap-back below the dismissal threshold,
  dismissal above it, content and title/close options.

The executable checks generic and prompt Dialog, alert and explicitly
nondismissible Dialog, disabled instances, Popover toggles and exact action counts,
Drawer drag thresholds, repeated open/close, and three replacements of open
Popover roots via actual HTMX HTTP requests. Replacement asserts cleanup and
independent fresh Dialog/Popover/Drawer behavior. Two deliberate mutations remove
the generic dialog's accessible naming and interrupt the Popover focus trap;
their corresponding assertions must reject those mutations. Unexpected browser
errors or timeouts do not count as successful negative controls.

The Go test `TestGenericDialogAccessibleDismissalContract` separately checks
production markup, escaping, and generic dialog dismissal wiring. It cannot prove
browser keyboard/focus behavior. Browser launch was blocked in the authoring
sandbox by Chromium's `socket() failed: Operation not permitted`; CI execution is
required before claiming the new browser assertions pass. This bounded suite does
not claim exhaustive coverage of every overlay presentation or unrelated families.
