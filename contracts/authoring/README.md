# SDUI authoring contract

The authoring format has its own version (`"version": "1"`), independent of the
native profile transport's `protocolVersion`. Its authoritative Go definitions,
strict decoder and resource limits are in [`sdui/schema.go`](../../sdui/schema.go).
The [semantic core guide](../../docs/sdui/core.md) explains compilation and resolution.

A screen contains data, bindings, composition and references to host-registered
component and action names. It cannot choose HTML templates, load code, or grant
authentication, authorization or persistence capabilities.

There is no universal complete component JSON Schema: `sdui.JSONSchema(registry)`
generates an editor schema for that host's semantic registry. A web host can use
the Go/HTMX adapter's schema export for its reviewed renderer-backed registry.
Generated editor schemas are assistance; compilation and resolved runtime data
remain authoritative for references, limits and capability checks.

Do not merge this authoring version with the
[native profile v1 wire contract](../native/profile-v1/PROTOCOL.md). Native clients
receive server-resolved nodes rather than executing authoring documents.
