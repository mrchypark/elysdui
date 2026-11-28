# Bird's-Eye Layout Guide (`elysdui`)

Before picking individual form controls or widgets, lay out the page from outside in using `elysdui`'s four layout tiers.

```
┌─────────────────────────────────────────────────────────────────┐
│ Level 1: Document & Shell                                       │
│   .shell / .site-header / [data-sdui-screen] / AppShell /       │
│   ColumnShell / SplitPane / Dock                                │
│ ┌───────────────────────┬─────────────────────────────────────┐ │
│ │ Sidebar / Nav         │ Level 2: Page Flow & Grids          │ │
│ │ (AppShell / custom    │   stack (.ui-stack / --row)         │ │
│ │  <aside>)             │   grid  (.ui-grid: 2-col -> 1-col)  │ │
│ │                       │   foundation: SimpleGrid, Masonry   │ │
│ │                       │ ┌─────────────────────────────────┐ │ │
│ │                       │ │ Level 3: Surface Containers     │ │ │
│ │                       │ │   card (.ui-card), tabs,        │ │ │
│ │                       │ │   accordion, alert, empty-state │ │ │
│ │                       │ │ ┌─────────────────────────────┐ │ │ │
│ │                       │ │ │ Level 4: Controls & Data    │ │ │ │
│ │                       │ │ │   input, select, data-table │ │ │ │
│ │                       │ │ │   code-block, chart, map    │ │ │ │
│ │                       │ │ └─────────────────────────────┘ │ │ │
│ │                       │ └─────────────────────────────────┘ │ │
│ └───────────────────────┴─────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

---

## 1. Choosing the Right Layout Building Block

| Need | Use | Source / Assets | Behavior |
| --- | --- | --- | --- |
| **Responsive page margins** | `.shell` (HTML class) | `app.css` | `width: calc(100% - 8rem)` centered; narrows to `calc(100% - 4rem)` at `≤64rem` and `calc(100% - 2.5rem)` at `≤42rem`. |
| **Top header bar** | `.site-header` + `.site-header__inner` | `app.css` | `4rem` height, bottom border `--color-line`, flex row (`space-between`, `gap: 2rem`). |
| **App frame (header + sidebar + main + footer)** | `ui.Component{Chapter:"layout", Name:"AppShell"}` or custom `<aside>` + `<main>` | `foundation` family | Renders `<header>`, `<nav>` (`SidebarItems` with icons or `Items`), `<main>`, `<footer>` (`Status`). |
| **Multi-column desktop/app columns** | `ui.Component{Chapter:"shell", Name:"ColumnShell"}` | `native` family | Side-by-side columns with optional `Sidebar: true` and per-column widths. |
| **Resizable split workspace** | `ui.Component{Chapter:"layout", Name:"SplitPane"}` | `foundation` family | Draggable/keyboard-accessible divider (`25%–75%`, supports nested inner split). |
| **Vertical / horizontal spacing** | `{{template "stack" ...}}` (`.ui-stack`, `.ui-stack--row`) | `ui-component-assets` | `flex-direction: column; gap: 1rem` (add `Horizontal: true` for wrapping row). |
| **2-column responsive grid** | `{{template "grid" ...}}` (`.ui-grid`) | `ui-component-assets` | `repeat(2, minmax(0, 1fr))` with `gap: 1rem`; auto-collapses to `1fr` at `max-width: 42rem`. |
| **Auto-fit card tiles (≥140px)** | `ui.Component{Chapter:"layout", Name:"SimpleGrid"}` | `foundation` family | Equal tiles with 140px minimum width. |
| **Surface card / panel** | `{{template "card" ...}}` (`.ui-card`) | `ui-component-assets` | `1px solid var(--color-line)`, `border-radius: .65rem`, `background: var(--surface)`, `padding: 1.25rem`. |
| **Modal / slide-over** | `{{template "dialog" ...}}`, `Drawer`, `Sheet` | `ui-component-assets` / `foundation` | Native `<dialog closedby="any">` or pull-to-dismiss `Drawer`/`Sheet`. |

---

## 2. Responsive & Overflow Rules (Verified)

1. **Minimum viewport:** `body` enforces `min-width: 320px`. Test narrow mobile layouts at `320px` and `390px`.
2. **Breakpoints (`input.css` & `ely-patterns.css`):**
   - `64rem` (`1024px`): `.shell` outer margin tightens from `8rem` to `4rem`.
   - `42rem` (`672px`): `.shell` margin tightens to `2.5rem`, and `.ui-grid` switches from 2 columns to 1 column.
3. **Prevent horizontal blowout (`min-inline-size: 0`):**
   - `.ui-grid > *` sets `min-inline-size: 0; max-inline-size: 100%` automatically.
   - If you build a **custom** CSS Grid or Flexbox shell (e.g., sidebar + `<main>`), always put `min-inline-size: 0` (`min-w-0`) on `<main>` or any flex/grid child containing `data-table`, `code-block`, `chart`, or `timeline`.
4. **Stable scrollbars:** `html { scrollbar-gutter: stable }` is enabled by default so opening a `<dialog>` does not shift page width.

---

## 3. Copyable Layout Blueprints

### Blueprint A: Centered Form / Auth Page

```gotemplate
<body>
  <header class="site-header">
    <div class="shell site-header__inner">
      <a class="wordmark" href="/">MyApp</a>
      {{template "theme-toggle" .}}
    </div>
  </header>
  <main class="shell" style="max-width: 28rem; padding-block: 3rem;">
    {{template "card" (dict
      "Title" "Sign in"
      "Description" "Enter your account credentials."
      "Content" .FormHTML)}}
  </main>
</body>
```

### Blueprint B: App Shell with Sidebar + HTMX Main Region

```gotemplate
<body style="display: grid; grid-template-rows: 4rem 1fr; min-height: 100dvh;">
  <header class="site-header">
    <div class="shell site-header__inner">
      <a class="wordmark" href="/">Workspace</a>
      {{template "theme-toggle" .}}
    </div>
  </header>
  <div class="shell" style="display: grid; grid-template-columns: 15rem minmax(0, 1fr); gap: 2rem; padding-block: 2rem;">
    <aside aria-label="Primary navigation">
      {{template "stack" (dict "Content" .NavHTML)}}
    </aside>
    <main id="main-content" style="min-inline-size: 0;">
      {{template "stack" (dict "Content" .BodyHTML)}}
    </main>
  </div>
</body>
```
*(In HTMX responses targeting `#main-content`, return **only** the inner fragment—never `<html>`, `<head>`, or `ui-*-assets`.)*

### Blueprint C: 2-Column Dashboard Grid

```gotemplate
{{template "stack" (dict "Content" (print
  (render "grid" (dict "Content" (print
    (render "card" (dict "Title" "Traffic" "Content" .ChartHTML))
    (render "card" (dict "Title" "Recent Activity" "Content" .TimelineHTML)))))
  (render "card" (dict "Title" "Users" "Content" .DataTableHTML))))}}
```
*(Or compose `ui.Component{Chapter: "dashboard", Name: "Dashboard Grid", ...}` when using the `data` family.)*

### Blueprint D: Resizable Split Workspace

```go
ui.RenderComponent(tpl, w, ui.Component{
    Chapter: "layout",
    Name:    "SplitPane",
    ID:      "editor-split",
    Props: map[string]any{
        "Label":  "Editor and preview split",
        "Split":  45,
        "Before": editorMarkup,
        "After":  previewMarkup,
    },
})
```
