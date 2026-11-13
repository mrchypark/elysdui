# GPUI adapter (`elysdui-gpui`)

`adapters/gpui` is a standalone Rust crate implementing:

1. **Native `profile-v1` decoder, reconciliation state machine, and GPUI renderer** (`elysdui_gpui::profile`):
   - Validates `contracts/native/profile-v1` envelopes (`protocolVersion == "1"`, 1 MiB / 1,000 nodes / depth 32 bounds, duplicate-key preflight, closed `checkbox`/`select` props, and the 10 allowlisted capabilities).
   - Maintains `ProfileState` (`baseline` vs. `drafts`, per-field `editRevisions`, single in-flight save, exact retry payload retention, and stale `requestID`/`sessionID`/`dataVersion` guards).
   - Renders resolved nodes via `ely-gpui-component` (`Form`, `FormField`, `Input`, `Switch`, `Checkbox`, `Select`, `Button`, `Alert`), showing native errors instead of a WebView fallback.
2. **`elysdui` v1 Screen & extensible `DashboardGrid` renderer** (`elysdui_gpui::dashboard`):
   - Validates `sdui` v1 `Screen` documents and Perses-aligned `DashboardSpec` layouts.
   - Provides `WidgetPlugin` and `WidgetRegistry` (`data/StatSummary`, `dashboard/FilterSidebar`, `charts/TimeSeriesChart` by default) so host applications can register domain widgets such as custom map panels without adding domain dependencies to `elysdui`.

## Running contract tests

From `adapters/gpui`:

```sh
cargo +1.99.0 test
```
