# Working with elysdui

Read [.agents/skills/elysdui/SKILL.md](.agents/skills/elysdui/SKILL.md) for tasks
that consume or modify this library. Use [docs/README.md](docs/README.md) to find
focused references; do not load the full catalogue by default.

- Consumer work: [docs/gohtmx/getting-started.md](docs/gohtmx/getting-started.md).
- Library changes: [docs/contributing.md](docs/contributing.md).
- JSON screens: [docs/sdui/agent-sdui.md](docs/sdui/agent-sdui.md).

Keep new documentation and user-facing example copy in English. Retain third-party notices and use the current monorepo documentation paths. Do not overwrite unrelated working-tree
changes. Verify APIs against the selected module revision; v0.1.0 does not include
SDUI. Use exact component names and case-sensitive property keys.

Shared component behavior belongs in `ui/gohtmx/templates/` and `ui/gohtmx/assets/`, not gallery
fixtures. Host authentication, authorization, persistence and external services
are application responsibilities. Never turn untrusted input into `template.HTML`.
Run the applicable checks in the contributor guide and state exactly what passed,
failed or could not run. Publishing changes does not authorize merging or deploying.

Read [architecture](docs/architecture.md) before crossing package boundaries.
`ui/gohtmx` is independent of SDUI. `sdui` is semantic and contains no HTML.
`adapters/gohtmx` imports both. Native clients use the versioned contract under
`contracts/native/profile-v1`. The module layout is unreleased; use local checkout
setup rather than claiming v0.1.0 contains these imports.
