# Native component coverage

[The machine-readable inventory](../../contracts/native/profile-v1/support-matrix.json) is an exact allowlist of
implemented semantic node types for SwiftUI and Compose. All unlisted types are
unsupported, including qualified web catalogue component names. The Go resolver
and both clients reject unsupported required components; there is no WebView or
placeholder success fallback. The inventory is checked against all three
capability lists by the Go tests.

Ten types are currently implemented: region, form, stack, text, input,
button, notice, switch, checkbox and select. Each inventory entry identifies its real platform control and
supported modes. The renderer supports up to 64 distinct declared text/boolean/single-choice fields with per-field
revision reconciliation; action routing remains the registered profile form.
A shell-level scroll view or loading indicator does not count as support for a
server-driven scroll or progress node. A web catalogue entry does not count as a
native renderer implementation. GPUI coverage is not established by this inventory.

Further coverage candidates include lists, images, dividers, progress and adaptive
containers. Multiline input is outside this increment.
These are planned, not implemented. Adding a capability requires the Go resolver,
wire contract, both native decoders/renderers, fixtures and tests to agree.

## Verification boundaries

The Native profile workflow runs Go protocol tests, Swift model/transport tests,
iOS app compilation and simulator interaction, plus Kotlin model/transport tests,
Compose app compilation and Android emulator interaction. A green run proves only
its exercised behaviors on that exact commit. It does not certify every property,
manual accessibility, every IME, or physical devices. Consult the PR checks for
current results; this inventory deliberately contains no historical pass badge.

## Multi-field controls demo

Run `go run ./examples/native-profile -controls` to serve display name, company, notification preference, digest consent and
color theme fields on the normal loopback endpoint. With `-port 8095`,
it can run alongside the legacy profile server. SwiftUI uses a real Toggle;
Compose uses a real Switch. Checkbox uses a styled SwiftUI Toggle and Compose
Checkbox; single selection uses a SwiftUI Picker and Compose dropdown menu. Values remain local until explicit submit, and
boolean fields use canonical `"true"`/`"false"` strings in the envelope and action.
The old profile server still advertises only its original seven required
capabilities, so older native clients can continue to load it. An older client
cannot load the controls screen without declaring switch, checkbox and select capabilities.

Both screens retain the host-owned `profile-form` / `submit` / `save-profile` /
`profile-region` allowlist. This does not enable arbitrary server-supplied URLs
or action routes. The demo's HTML profile form continues to edit only the name.
