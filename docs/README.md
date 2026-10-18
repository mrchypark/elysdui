# Documentation map

Start with [Using elysdui](gohtmx/getting-started.md) to build an application, or
[Contributing](contributing.md) to change this repository. AI coding agents should
read [AGENTS.md](../AGENTS.md) and the [elysdui skill](../.agents/skills/elysdui/SKILL.md).

## Choose a workflow

- **Go templates + htmx:** [minimal integration](gohtmx/getting-started.md), [runnable form](../examples/gohtmx/form), [component API](gohtmx/COMPONENTS.md).
- **Renderer-neutral core:** [semantic compilation and resolution](sdui/core.md).
- **Web JSON-defined screens:** [agent SDUI workflow](sdui/agent-sdui.md), [complete SDUI contract](sdui/sdui.md), [composition](sdui/sdui-composition.md), [typed catalogue](sdui/sdui-catalogue-contracts.md).
- **Native mobile:** [SwiftUI + Compose profile slice](native/README.md), [supported types and limits](native/SUPPORT.md), [versioned native protocol](../contracts/native/profile-v1/PROTOCOL.md), [multi-field/switch extension](../contracts/native/profile-v1/PROTOCOL.md#multi-field-and-switch-extension), [run the controls demo](../examples/native-profile/README.md#expanded-native-controls).
- **Visual authoring:** [playground](sdui/sdui-playground.md), [static GitHub Pages limits](github-pages.md).
- **Assets and performance:** [family loading](gohtmx/asset-loading.md), [transport/compression](sdui/sdui-transport.md), [measured benchmarks](sdui/sdui-transport-benchmarks.md).
- **Themes:** [theme API](gohtmx/themes.md).
- **Coverage:** [SDUI implemented/limited behavior](sdui/sdui-roadmap.md), [v0.1.0 historical verification](verification.md).

## Component references

Component references live together under `docs/gohtmx/`; existing Korean
reference material is retained. New onboarding and agent instructions are English.
Use exact API names and typed contracts rather than translating identifiers.

- [Foundation](gohtmx/advanced-foundation.md)
- [Interaction](gohtmx/advanced-interaction.md)
- [Data](gohtmx/advanced-data.md)
- [Workspace](gohtmx/advanced-workspace.md)
- [Communication](gohtmx/advanced-communication.md)
- [Native/media](gohtmx/advanced-native.md)
- [Forms](gohtmx/advanced-forms.md)
- [Native tooling](gohtmx/native-tooling.md)

See [component discovery](gohtmx/getting-started.md#discover-components-and-props) before
choosing an alias or assuming a component integrates an external service.

- [Architecture](architecture.md): standalone UI, semantic core and platform adapter boundaries.
- [Names and package paths](naming.md): current module layout and release history.

- [Host-owned raster map tiles](gohtmx/map-tiles.md): trusted provider IDs, local fixture, resource limits, and source correspondence.

- [Native maps and canvas design](native/native-map-canvas-design.md): proposed geographic editing architecture, SDK boundaries, compatibility and acceptance plan; not implemented.
