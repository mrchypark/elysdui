---
name: elysdui
description: Build Go html/template and htmx interfaces with elysdui, author or validate elysdui JSON screens, and modify the elysdui library. Use for component selection, assets, host actions, playground exports and integration tests; not React or GPUI runtime development.
---

# elysdui

## Establish the workspace

Determine whether the task changes a consumer app or this library. Preserve the
user's framework, selected revision and unrelated edits. Read
[references/workflows.md](references/workflows.md) to locate the matching library
source/docs if this skill has been copied into a different repository. Do not
assume relative paths outside this skill exist in a consumer checkout.

Go 1.26+ is required. The v0.1.0 release has the original template/component
surface, not SDUI. v0.2.0 introduces the current module layout and SDUI; pin
`github.com/mrchypark/elysdui@v0.2.0` for new consumers, or use the local-checkout
setup for contributor work. Never silently upgrade an application.
Node/Tailwind are contributor tools, not consumer runtime
requirements. New docs and example copy are English.

## Pick the rendering surface

- **Go templates:** use `ui.NewTemplates`, parse app templates before execution,
  and bind assets once. Start from `examples/gohtmx/minimal` and `docs/gohtmx/getting-started.md`.
- **Advanced components:** inspect `ui.ComponentDefinitions`/`ResolveComponent`
  and the relevant `docs/gohtmx/advanced-*.md` guide. Use `Component{Chapter, Name, ID, Props}`
  and caller data; give each instance a unique valid ID. Go props are PascalCase.
- **SDUI:** read `docs/sdui/agent-sdui.md`, then only relevant runtime/composition
  references. Inspect `ely catalog -type <exact-name>` before authoring. JSON
  properties are lower camel case and recursively typed. Validate with the actual
  registry. CLI validation alone does not verify host callbacks or runtime data.

Do not guess component aliases, property keys, events, slots or supported host
operations. `ui/gohtmx/components.json` is an inventory, not a property schema. Prefer a
small contract query to loading the entire catalogue.

## Integrate and verify

Include base CSS and `ui-component-assets`; preload needed advanced families,
including those introduced by later swaps. Maps need `ui-map-assets`. Root
`/assets/` paths are assumed. Read `docs/gohtmx/asset-loading.md` for dependency details.

Keep untrusted strings escaped. Never cast them to `template.HTML`. Go owns
validation, authentication, authorization, CSRF, persistence and external calls.
A UI action event does not mean a business operation succeeded. SDUI browser
input and exported playground data are untrusted; demo sessions/fixtures are not
production infrastructure. Read the static/export caveats before using playground
output. Public compression is not permission to compress private responses.

Test the full-page and fragment paths, escaped input, asset delivery and the
actual changed interactions. Consumers run their Go tests; library changes follow
`docs/contributing.md`, including applicable browser/static checks. Report exact
checks and blockers. Do not claim browser or external-service behavior from a
server rendering test. Do not merge or deploy without explicit authorization.

## Package boundaries

Use `ui/gohtmx` (package `ui`) for standalone templates, `sdui` for semantic
resolution, and `adapters/gohtmx` (package `gohtmx`) for HTML/HTTP SDUI. The UI
package must not depend on SDUI. Core `NewRegistry(options...)` has no templates;
web `NewRegistry(tpl, options...)` does. Read `docs/architecture.md`.
