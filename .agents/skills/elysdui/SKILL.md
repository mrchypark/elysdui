---
name: elysdui
description: Build Go html/template and htmx interfaces with elysdui, author or validate elysdui JSON screens, and modify the elysdui library. Use for component selection, assets, themes, host actions, playground exports and integration tests; not React or GPUI runtime development.
---

# elysdui

## Establish the workspace

Determine whether the task changes a consumer app or this library. Preserve the user's framework, selected revision and unrelated edits. Read [docs/AGENT_GUIDE.md](../../docs/AGENT_GUIDE.md) for the full agent integration playbook, and [references/workflows.md](references/workflows.md) to locate the matching library source/docs if this skill has been copied into a different repository. Do not assume relative paths outside this skill exist in a consumer checkout.

Go 1.26+ is required. Pin `github.com/mrchypark/elysdui@v0.4.13` (or the app's selected `v0.4.x` / `v0.2.0+` revision) for consumers; `v0.1.0` lacks SDUI and the current package layout. Never silently upgrade an application. Node/Tailwind are contributor tools, not consumer runtime requirements. New docs and example copy are English.

## Pick the rendering surface

- **Basic & Pattern Go templates:** `{{template "input" (dict ...)}}`, `{{template "button" (dict ...)}}`, `{{template "combobox" (dict ...)}}`, etc. See `docs/gohtmx/basic-components.md` for exact template names, Go types (`*int` for `slider`/`progress`, `ui.Option` for choices), and copyable snippets.
- **Advanced components:** inspect `ui.ComponentDefinitions`/`ResolveComponent`, `docs/gohtmx/COMPONENTS.md`, and the relevant `docs/gohtmx/advanced-*.md` guide. Use `Component{Chapter, Name, ID, Props}` and caller data; give each instance a unique valid `ID` (`^[A-Za-z][A-Za-z0-9_-]{0,127}$`). Go props are PascalCase.
- **SDUI:** read `docs/sdui/agent-sdui.md`, then only relevant runtime/composition references. Inspect `go run ./cmd/ely catalog -type <exact-name>` before authoring. JSON properties are `lowerCamelCase` and recursively typed. Validate with the actual registry.

Do not guess component aliases, property keys, events, slots or supported host operations. `ui/gohtmx/components.json` is an inventory, not a property schema. Prefer a small contract query to loading the entire catalogue.

## Integrate and verify

- Include `/assets/app.css` and `{{template "ui-component-assets"}}`; preload needed advanced families (`ui-advanced-assets` or `ui-advanced-family-assets`), including those introduced by later HTMX swaps. Maps need `ui-map-assets`. Never emit `ui-*-assets` inside HTMX partial responses.
- For theming, load `/assets/theme.js` in `<head>`. When the host app serves its own brand stylesheet, use `<script src="/assets/theme.js" data-mode-only></script>` (or `<html data-theme-mode-only>`) so `theme.js` manages `data-theme`, `color-scheme`, `system` mode, and `<meta name="theme-color">` without injecting inline CSS variables. See `docs/gohtmx/themes.md`.
- Keep untrusted strings escaped. Never cast them to `template.HTML`. Go owns validation, authentication, authorization, CSRF, persistence and external calls. A UI action event (`ely:action` / `ely:change`) does not mean a business operation succeeded.
- Test the full-page and fragment paths, escaped input, asset delivery and the actual changed interactions. Consumers run their Go tests; library changes follow `docs/contributing.md`. Report exact checks and blockers. Do not claim browser or external-service behavior from a server rendering test.

## Package boundaries

Use `ui/gohtmx` (package `ui`) for standalone templates, `sdui` for semantic resolution, and `adapters/gohtmx` (package `gohtmx`) for HTML/HTTP SDUI. The UI package must not depend on SDUI. Core `NewRegistry(options...)` has no templates; web `NewRegistry(tpl, options...)` does. Read `docs/architecture.md`.
