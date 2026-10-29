# elysdui names and package paths

The product and reusable agent skill are **elysdui**, all lowercase. The module
is `github.com/mrchypark/elysdui`. This is a breaking monorepo layout, with no
legacy import facade or old documentation-path stubs.

- Standalone Go/htmx UI: `github.com/mrchypark/elysdui/ui/gohtmx`, package `ui`.
- Semantic SDUI core: `github.com/mrchypark/elysdui/sdui`, package `sdui`.
- Web SDUI adapter: `github.com/mrchypark/elysdui/adapters/gohtmx`, package `gohtmx`.
- Native clients: `adapters/ios` and `adapters/android`.
- Native wire contract: `contracts/native/profile-v1`.
- Agent skill: `.agents/skills/elysdui/`.
- CLI: `ely`; the other existing `cmd/` executable names are retained.
- GitHub Pages: `/elysdui/` hub and `/elysdui/go-htmx/` gallery/playground.

Go package directories are source boundaries; the existing browser `/assets/`
URLs, JavaScript hooks, CSS classes and wire identifiers are separate contracts.
A source-directory move does not itself rename native application IDs or protocol
fields. See [architecture](architecture.md) for dependency direction.

## Release history

v0.2.0 introduces the monorepo layout under `github.com/mrchypark/elysdui`.
Use the [pinned release or local contributor setup](gohtmx/getting-started.md).
The historical v0.1.0 release
used the former module identity and had no SDUI. It does not acquire new paths
or APIs retroactively. Historical verification, published revisions and copyright
notices remain evidence about their original revisions.

## Upstream attribution

[Ely GPUI Component](https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Components)
is the upstream visual/component reference, not a former name for this project.
Keep its name, source-reference fixtures and MIT notices. See
[third-party notices](../THIRD_PARTY_UI.md) and [shared identity](identity.md).
There is no implemented GPUI runtime adapter or full native catalogue claim.
