# Native profile SDUI demo

One [screen.json](screen.json) is decoded and compiled by Go's existing
`sdui.DefaultRegistry`. The same compiled plan renders:

- Ely HTML and htmx at `http://127.0.0.1:8094/` through `sdui.NewHandler`.
- Resolved JSON at `http://127.0.0.1:8094/native/profile` for real SwiftUI and
  Jetpack Compose controls, without HTML, JavaScript or a WebView.

Both paths use the same in-memory profile, session cookie, CSRF token and Go
validation. The existing `examples/sdui` example is unchanged. The native
transport is opt-in; it does not replace Ely's HTML renderer or broad catalogue.

## Run

From the repository root, with Go 1.26+:

```sh
go run ./examples/native-profile
```

The listener is fixed to `127.0.0.1:8094`. Open `/` for the browser version, or
follow the setup instructions under [native profile contract](../../docs/native/README.md) for the native
clients. iOS Simulator can use `http://127.0.0.1:8094`. Android Emulator uses
`http://10.0.2.2:8094` to reach the host loopback service. Physical devices require
an explicitly configured development tunnel; this example does not expose a
LAN listener. Its allowed Host values are `127.0.0.1`, `localhost`, `::1` and
`10.0.2.2`, with an optional port.

A first valid GET creates a temporary profile with display name `Ada`. Native
clients must retain the HttpOnly cookie and include it on subsequent requests.
`sessionID` is a public response-correlation ID, not an authentication token.
It is deliberately different from both the bearer cookie and `csrfToken`.

## Native request cycle

See [the shared protocol](../../contracts/native/profile-v1/PROTOCOL.md) for the exact JSON contract.

1. GET `/native/profile?protocolVersion=1&requestID=<UUID>&capabilities=region,form,stack,text,input,button,notice`.
2. Keep the returned cookie, `sessionID`, `csrfToken`, `screenRevision` and
   `dataVersion`. Maintain local draft values and edit revisions separately.
3. POST `/native/profile` as UTF-8 `application/json`, with `X-CSRF-Token` and the
   cookie. The only allowed tuple is `profile-form` / `submit` / `save-profile` /
   `profile-region`; the only field is `displayName`.
4. A successful save trims surrounding Unicode whitespace, requires 2–60
   Unicode code points, increments `dataVersion`, and returns canonical fields
   with a complete replacement region. Invalid input returns 422; stale schema
   or data versions return 409. Both preserve authoritative persisted fields and
   echo the request's field edit revisions, so clients can retain newer drafts.
5. After a network failure, resend the exact pending request with the same
   `requestID`. A semantic duplicate returns the original response bytes and
   version. Reusing that ID with different request content is rejected. A new
   explicit save must use a new UUID and current revisions.

The native surface is deliberately limited to region, form, stack, text,
ordinary text input, submit button and notice. The server resolves bindings,
conditions, template parameters and stable-key repetition. Native clients never
interpret authoring expressions or fetch action URLs from a schema. Missing
required capabilities fail visibly rather than silently removing controls.
The shared schema contains conditional validation and status nodes for HTML.
Both resolve out of the native tree: native errors/status are delivered only in
envelope fields, so clients can suppress stale messages after newer local edits
and announce each status once. Library resolution tests also exercise
templates/repetition.

## Security and persistence boundaries

This is **local demonstration infrastructure**, not durable authentication,
account storage, authorization or multi-process idempotency:

- Any local client can bootstrap a new isolated demo profile. The random
  HttpOnly, SameSite=Strict cookie is an ephemeral bearer secret. `Secure` is set
  when served over TLS; the default loopback HTTP server does not provide TLS.
- Sessions expire after one hour and are capped at 256. Expired sessions are
  removed when a new one is created. Restarting the process loses everything.
- Each session accepts at most 256 distinct action outcomes across native and
  web. At capacity, new native actions fail with a non-retryable 403; existing native retries
  still work. Recovery requires session expiry or a server restart, then explicit
  reload. Reloading a still-valid full session does not reset its limit.
  Committed replay keys are never evicted during the session.
- Native authentication/CSRF, exact action permission, request fingerprint,
  revision checks, rendering, mutation and replay insertion are coordinated
  under one mutex. Invalid/conflicting actions are also replayed. Production
  needs durable transactional mutation and replay storage, not a process mutex.
- Native schema and data revision checks protect against stale writes. The
  existing HTML handler retains its browser form semantics; a web save updates
  the same profile/version and therefore causes a stale native save to conflict.
- Requests are limited to 64 KiB. Unknown or duplicate JSON keys, trailing JSON,
  wrong member types, invalid UTF-8 and unsafe integer revisions are rejected.
  No compressed action bodies or uploads are accepted by this demo.
- Cross-origin browser requests and unapproved Host headers are rejected. There
  is no CORS policy. Native requests may omit Origin. Responses use `no-store`
  and `nosniff`; private JSON and HTML response compression is disabled.
- Ordinary text remains text. The HTML path escapes it; native controls receive
  resolved semantic properties. No input is converted to trusted HTML.

## Tests and shared fixtures

```sh
go test ./examples/native-profile
go test -race ./examples/native-profile
go vet ./examples/native-profile
```

Integration tests cover the real HTTP handler: initial loading and assets,
Unicode validation, canonical values, full request fingerprints, concurrent
retry atomicity, concurrent write conflicts, stale revisions, session isolation,
CSRF/origin/Host checks, capability negotiation, strict JSON/body limits,
expiry/capacity, and shared HTML/native business state.

The [ready](../../contracts/native/profile-v1/fixtures/profile-ready.json),
[invalid](../../contracts/native/profile-v1/fixtures/profile-invalid.json), and
[saved](../../contracts/native/profile-v1/fixtures/profile-saved.json) fixtures are generated from
actual server responses, with only session, CSRF and schema revision tokens
normalized. The normal test compares the files byte-for-byte. To intentionally
refresh after a reviewed contract change:

```sh
UPDATE_NATIVE_FIXTURES=1 go test ./examples/native-profile -run TestNativeFixtures
```

These tests verify Go transport/business behavior. They do not claim that an
Xcode Simulator or Android Emulator UI was built or exercised; those checks
belong to the individual native sample projects.

## Expanded native controls

Run `go run ./examples/native-profile -controls` for a multi-field native screen
(display name, company, a notification toggle, a digest checkbox and a color-theme
picker). `-port 8095` runs it beside
the default demo. Both modes bind only to loopback. The optional controls screen
requires switch, checkbox and select capabilities, validates all five submitted fields and their
revisions, and preserves the same CSRF/session/action/idempotency boundaries.
The HTML screen remains the original display-name form.
