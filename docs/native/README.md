# Native SDUI profile vertical slice

The Go server sends a resolved JSON tree. The iOS app renders actual SwiftUI
controls; Android renders actual Jetpack Compose controls. Neither uses a
WebView. This first slice implements a profile form with local text editing,
server validation, canonical save, retries and full-region replacement.

## Run

From the repository root with Go 1.26+:

```sh
go run ./examples/native-profile
```

- Web: <http://127.0.0.1:8094/> uses the existing Ely HTML adapter.
- iOS Simulator: build and run [the SwiftUI app](../../adapters/ios/README.md).
- Android Emulator: build and run [the Compose app](../../adapters/android/README.md).
  Its configured host is `10.0.2.2:8094`, the emulator's host-loopback bridge.

All three use the same embedded authoring schema and in-memory profile store.
Sessions are separate between applications unless their cookie stores are
explicitly shared. The demo listens on loopback only. Real devices require an
application-owned HTTPS backend; do not expose this automatic-session demo on
a public network.

## What is shared

`(*sdui.Plan).ResolveNative` reuses validated bindings, conditions, reusable
parameters and stable-key repetition. It returns semantic node IDs, lower-camel
properties, children and named actions without executing templates. The renderer-neutral `github.com/mrchypark/elysdui/sdui` registry compiles
the native screen independently of the UI package. The separate web preview
uses `github.com/mrchypark/elysdui/adapters/gohtmx`. No catalogue-wide native support is
implied.

- [Exact native support inventory and limits](SUPPORT.md)
- [Protocol and reconciliation rules](../../contracts/native/profile-v1/PROTOCOL.md)
- [Machine-readable profile envelope shape](../../contracts/native/profile-v1/schema.json)
- [Server example and security boundaries](../../examples/native-profile/README.md)
- [Shared real-server fixtures](../../contracts/native/profile-v1/fixtures)

The ten supported types are region, form, stack, text, input, button, notice,
switch, checkbox and select. The renderer supports multiple declared text/boolean fields, with
ordinary text inputs, native toggles, checkboxes, single-choice pickers and form-submit buttons. Run the [expanded
controls demo](../../examples/native-profile/README.md#expanded-native-controls) with
`go run ./examples/native-profile -controls`; the default demo preserves
the legacy single-field profile.
Unknown required types/capabilities, incompatible property modes and protocol
versions show an explicit native unsupported state. Templates, expressions,
HTML, JavaScript and server-supplied network destinations never run on clients.

## Proposed extensions

[Native maps and canvas design](native-map-canvas-design.md) describes a
possible map/scene adapter and geographic editing overlay. It is not implemented
or runtime verified and does not extend the supported-type inventory.

## State and safety

A local draft is separate from its acknowledged server baseline. Every field
edit has a local revision; a successful response only replaces a draft if no
newer local edit occurred. Invalid/conflict responses retain drafts. Request,
screen-session, definition and data versions prevent unrelated or old responses
from replacing the visible screen. A failed transport retains the exact request
for an explicit retry, including its idempotency key.

The example checks authentication cookies, CSRF, Origin/Host, exact action
routing, capabilities and revisions before a mutation. Save and replay records
are atomic within a bounded in-memory session. This is not durable exactly-once
storage, production authentication or a device security boundary. Production
hosts must own authorization, persistence, transactions and rate limiting.

## Verification

Run `go test ./sdui ./examples/native-profile` and the platform-specific commands.
The [native workflow](../../.github/workflows/native.yml) builds the iOS Simulator
app and Android debug APK, runs shared-fixture/state/transport unit tests, and
exercises both native apps against Go in an iOS Simulator and Android Emulator.
The workflow retains native lifecycle screenshots and test reports as artifacts.
Existing web Go, JavaScript, browser and static checks remain in the main Test
workflow. A compile or state-model test is not simulator interaction, keyboard,
VoiceOver/TalkBack or physical-device validation. See the PR for results on its
exact commit.

Useful platform references: [SwiftUI](https://developer.apple.com/swiftui/),
[FocusState](https://developer.apple.com/documentation/swiftui/focusstate/),
[Compose state](https://developer.android.com/develop/ui/compose/state), and
[Compose text input](https://developer.android.com/develop/ui/compose/text/user-input).

## Source boundaries

The iOS client lives in `adapters/ios`. Android’s `adapters/android/renderer`
library owns controls and layout; `adapters/android/app` owns lifecycle and
ViewModel integration. Protocol, schema, support matrix and fixtures live under
`contracts/native/profile-v1`; CI helpers live under `scripts/ci/native`.
