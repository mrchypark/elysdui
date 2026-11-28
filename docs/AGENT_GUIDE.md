# Agent Guide: Building Apps with `elysdui`

This guide gives AI coding agents a complete, copyable reference for integrating `elysdui` (`v0.4.13+`) into Go `html/template` + HTMX applications or authoring SDUI JSON screens.

---

## 1. Module Setup & Package Boundaries

- **Go version:** Go 1.26+ (consumers do **not** need Node.js or Tailwind).
- **Module:** `github.com/mrchypark/elysdui` (pin `v0.4.13` or latest `v0.4.x` in `go.mod`; `v0.1.0` lacks SDUI and the current package layout).
- **Packages:**
  - `ui "github.com/mrchypark/elysdui/ui/gohtmx"` — standalone Go `html/template` components and embedded `/assets/*`. Independent of `sdui`.
  - `sdui "github.com/mrchypark/elysdui/sdui"` — renderer-neutral semantic core (no HTML).
  - `gohtmx "github.com/mrchypark/elysdui/adapters/gohtmx"` — renders compiled SDUI JSON screens into HTML/HTMX.

> **Rule:** Never register both `ui.BindAssets(mux)` and `gohtmx.BindAssets(mux)` on the same `http.ServeMux`. If mixing `ui` pages with SDUI fragments, call `ui.BindAssets(mux)` followed by `gohtmx.BindBridgeAssets(mux)`.

---

## 2. Bird's-Eye Layout Architecture (Start Here)

Always structure a page from the outside in before picking leaf controls. See [layout-guide.md](gohtmx/layout-guide.md) for full blueprints and CSS rules.

1. **Shell / Page Frame:** Use `.shell` + `.site-header` (`app.css`) for standard web pages, `[data-sdui-screen]` (`56rem` container) for SDUI, or `AppShell` / `ColumnShell` / `SplitPane` for app workspaces.
2. **Flow & Grid:** Use `{{template "stack" ...}}` (`.ui-stack` vertical / `Horizontal: true` wrapping row) and `{{template "grid" ...}}` (`.ui-grid`, 2 columns collapsing to 1 at `42rem`).
3. **Surfaces:** Wrap groups in `{{template "card" ...}}` (`.ui-card`), `tabs`, `accordion`, `alert`, or `dialog`.
4. **Overflow safety:** Always set `min-inline-size: 0` (`min-w-0`) on custom flex/grid parents wrapping `data-table`, `code-block`, `chart`, or `timeline`.

---

## 3. Choosing the Right Rendering Surface

| Surface | When to Use | Go Call / Syntax | Prop Casing | Reference |
| --- | --- | --- | --- | --- |
| **Basic & Pattern Templates** | Standard forms, buttons, cards, tables, tabs, dialogs, comboboxes, HTMX partials | `{{template "input" (dict "ID" "email" "Name" "email")}}` | PascalCase (`dict` or Go struct) | [basic-components.md](gohtmx/basic-components.md) |
| **Advanced `ui.Component`** | Stateful catalogue widgets (`MarkdownRenderer`, `CommandPalette`, `ChatThread`, `DataGrid`, `CronEditor`, `MapView`, etc.) | `ui.RenderComponent(tpl, w, ui.Component{Chapter, Name, ID, Props})` or `{{component (dict ...)}}` | PascalCase `map[string]any` | [COMPONENTS.md](gohtmx/COMPONENTS.md), `gohtmx/advanced-*.md` |
| **SDUI JSON** | Declarative JSON-authored screens & server-driven regions | `gohtmx.NewRegistry(tpl, ...)` + `plan.Render` | `lowerCamelCase` | [agent-sdui.md](sdui/agent-sdui.md) |

**Never mix casing or guess aliases:**
- Query a single SDUI/catalogue contract without loading the full catalogue:
  - `go run ./cmd/ely catalog -type documents/MarkdownRenderer`
  - `go run ./cmd/sdui-catalogue -describe forms/Select`
- `ui/gohtmx/components.json` is a story index, **not** a property schema.

---

## 4. Exact `<head>` Asset Recipes

### A. Standalone `ui/gohtmx` Page

```gotemplate
<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="theme-color" content="#FCFAF7">
  <link rel="stylesheet" href="/assets/app.css">
  {{template "ui-component-assets"}}
  {{/* Load all advanced families OR only the families used on initial + HTMX-swapped views: */}}
  {{template "ui-advanced-assets"}}
  {{/* Selective alternative: {{template "ui-advanced-family-assets" "forms"}} */}}
  {{/* Maps: {{template "ui-map-assets"}} */}}
  {{/* Charts: {{template "ui-chart-assets"}} (see gohtmx/charts.md for specialized helpers) */}}
  <script src="/assets/theme.js"></script>
  <script src="/assets/htmx.min.js" defer></script>
</head>
<body>
  ...
  {{/* Optional: only if client JS calls createControl() from /assets/ui-controls.js */}}
  {{template "ui-client-templates"}}
</body>
</html>
```

### B. Custom Brand CSS + `theme.js` (`data-mode-only`, `v0.4.13+`)

When your server serves its own brand stylesheet (e.g. `brand.css` / `theme.css`) defining `--color-paper`, `--color-accent`, etc., do **not** let `theme.js` overwrite your CSS variables with inline styles on `<html>`:

```html
<script src="/assets/theme.js" data-mode-only></script>
```
(Or set `<html data-theme-mode-only>`.) `theme.js` will only manage `data-theme="light"|"dark"`, `color-scheme`, `[data-theme-toggle]`, `[data-theme-select]`, `localStorage['ely-theme']`, and `<meta name="theme-color">:not([media])`.

### C. HTMX Partial Responses

- **NEVER** include `<head>`, `ui-component-assets`, or `ui-advanced-*-assets` inside an HTMX partial fragment (`HX-Request: true`).
- Preload every advanced family that a later HTMX swap might introduce in the initial full-page `<head>`.
- For `outerHTML` swaps of `ui.Component`, return the full wrapper produced by `ui.RenderComponent` / `{{component ...}}` with a valid unique `ID`.

---

## 5. Theme System (`v0.4.13`)

- **Modes:** `'light'`, `'dark'`, and `'system'` (follows OS `prefers-color-scheme` live via `matchMedia`).
- **UI Hooks:**
  - `{{template "theme-toggle"}}` (or any button with `data-theme-toggle`) toggles between `light` and `dark`.
  - `<select data-theme-select>` with options `system`, `light`, `dark` stays synced automatically.
- **JS API (`window.ElyTheme`):**
  - `apply(id, mode?)` (`mode`: `'light' | 'dark' | 'system'`), `resetMode()` (returns to `'system'`), `current()` (`{id, mode, preference}`), `register(theme)` (supports optional `radius` and `font: string | {sans?, mono?}`).
  - See [themes.md](gohtmx/themes.md) for the full 19-token palette & contrast contract.

---

## 6. Critical Go Type & Security Contracts (Avoid These Traps)

1. **`slider` and `progress` `Value` must be `*int`** (not `int`), and `slider` `Min`/`Max` are `*int`. Passing `nil` for `progress` renders an indeterminate progress bar.
2. **Never pass untrusted strings to `template.HTML`:** All string props are auto-escaped by `html/template`. Only pre-sanitized or server-owned markup may use `template.HTML`.
3. **`Attrs` allowlist:** Only `data-*`, `aria-*`, and `hx-*` keys are allowed. `hx-config`, `data-hx-config`, `hx-on*`, JavaScript URLs, and `hx-trigger` filter expressions cause rendering errors.
4. **Unique `Component.ID`:** Must match `^[A-Za-z][A-Za-z0-9_-]{0,127}$` and be unique across the entire page (including HTMX-swapped fragments).
5. **`ui.Option` for choices:** Use `ui.Option{Value, Label, Selected, Disabled, Note, Keywords, Icon, Glyph}` or matching `dict` keys for `select`, `radio-group`, `combobox`, `multi-select`, `selectable-list`.
6. **Human-readable display fields:** Never put raw DB UUIDs/PKs into `Label`, `Title`, or `Author` (use `ID`, `Value`, `Name`). Format timestamps on the server (`"16:15"`, `"YYYY-MM-DD"` for `date-picker`/`calendar`). Pass short 1–2 char initials in `Avatar` for `ChatMessage`.
7. **Flex/Grid overflow:** Add `min-inline-size: 0` (`min-w-0`) on custom flex/grid parents wrapping `data-table`, `code-block`, `chart`, or `timeline`.
8. **Button links with `Disabled` / `AriaDisabled`:** Omit `href` in HTML; re-render with both flags `false` to restore navigation.

---

## 7. Host Events & HTMX Integration

- **Advanced components** emit `ely:action` (button/workflow actions, foundation `change`) and `ely:change` (data/forms/interaction/workspace/communication value changes) with `{id, component, action, value, formData, values, ...}`.
- Handle them via `/assets/ely-api.js`:

```js
import {mount} from '/assets/ely-api.js';
const unbind = mount(document.querySelector('#app-root'), {
  actions: {
    save: async detail => submitToServer(detail.formData),
  },
  onChange: detail => syncDraft(detail),
});
```

- **Declarative HTMX helpers:**
  - `data-ely-swap-errors`: opt-in attribute to allow HTMX 4xx/5xx error fragment swapping.
  - `data-ely-stream-url`: declarative SSE messaging stream (automatically calls `htmx.process(node)` on appended/swapped nodes).

---

## 8. Verification Checklist for Agents

Before finishing any consumer or library task:
1. Run Go server tests covering full-page render, HTMX fragment response, and HTML escaping (`<script>` in untrusted input).
2. Verify all `/assets/*` routes return `200` (and no duplicate `/assets/` route registrations).
3. If modifying `ui/gohtmx/assets/theme.js` or JS hooks, run `node --check` and `node ui/gohtmx/tests/unit/theme_test.mjs` (plus `go test ./ui/gohtmx/...`).
4. Report only the exact commands run and observed results.
