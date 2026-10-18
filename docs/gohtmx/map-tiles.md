# Host-owned raster map tiles

Maps still use the bundled Natural Earth SVG geometry by default. An application
can optionally register a raster source and select it with `TileProvider` in Go
or `tileProvider` in SDUI. This web-only slice does not add native map renderers,
provider subscriptions, API keys, geolocation, or a third-party tile service.

## No-key example

Run `go run ./examples/gohtmx/map-tiles` and open `http://127.0.0.1:8096`.
The [consumer example](../../examples/gohtmx/map-tiles/main.go) shows raster and default
SVG maps together. All 85 bundled PNG tiles for zooms 0–3 are local, including in
embedded asset exports. Its [host script](../../examples/gohtmx/map-tiles/host.js) is trusted
application code, loaded after `ui-map-assets`:

```js
const unregister = ElyMap.registerTileProvider('natural-earth', {
  revision: 'ely-da3fdcaf-natural-earth-110m-v1',
  minZoom: 0,
  maxZoom: 3,
  attribution: 'Land: Natural Earth (public domain)',
  urlTemplate: '/assets/ely/tiles/{z}/{x}/{y}.png',
});
```

```gotemplate
{{template "map-view" (dict "ID" "office-map" "TileProvider" "natural-earth"
  "Center" (dict "Latitude" 37.5665 "Longitude" 126.9780)
  "Zoom" 5 "Width" 800 "Height" 400)}}
```

An SDUI component selects only the registered ID:

```json
{"id":"office-map","type":"maps/MapView","props":{"tileProvider":"natural-earth","center":{"latitude":37.5665,"longitude":126.9780},"zoom":5}}
```

This is a node, to be placed inside an ordinary v1 screen. The property is also
available on `basic/map-view` and the existing map aliases. Provider objects and
host-only URL/credential fields are rejected. The ID string is never interpreted
as a URL or executable callback. An unknown ID
shows an unavailable-provider status and requests no tile URL. Registering that
ID later updates already mounted maps. Provider attribution is plain text and
replaces the map's `Attribution` while that source is selected; it is not HTML.

## Host contract and lifecycle

The host must own and review source choice, licenses, privacy, authentication,
rate limits, CORS, and availability. Registration is not an authorization boundary
between mutually untrusted scripts running in the same document. Do not turn
untrusted configuration into registry calls. No provider is registered by the
library, and no external service is contacted by the example.

- IDs are 1–64 characters, start with an ASCII letter, and otherwise contain
  letters, digits, underscore, dot, or hyphen. At most 32 providers are registered.
- `revision` is a nonempty string of at most 128 characters. Change it when the
  source contents or addressing change. `minZoom` and `maxZoom` are integers with
  `0 <= minZoom <= maxZoom <= 19`. Nonempty attribution is required (up to 1024
  characters).
- `urlTemplate` contains `{z}`, `{x}`, and `{y}` and is at most 2048 characters.
  Relative URLs resolve against the document base at registration time. Same-origin
  HTTP and HTTPS sources are accepted; cross-origin sources require HTTPS and CORS.
  A restrictive Content Security Policy must allow the source in `connect-src`
  and `blob:` in `img-src` for the decoded image URLs.
  Embedded URL credentials, fragments, other schemes, and unknown placeholders
  are rejected. Requests use same-origin credentials and no referrer. The host
  should proxy sources needing secrets rather than putting credentials in screens
  or client URLs. Static/subpath hosts must supply their own correct asset prefix.
- Responses must be PNG, JPEG, WebP, or AVIF with the matching image Content-Type;
  SVG/HTML and unsupported types are rejected. Each encoded response is limited
  to 4 MiB and each decoded image to 1024 × 1024 pixels. The usual source tile is
  256 × 256; other accepted dimensions fill the same logical 256-pixel tile.
- Re-registering an ID creates a new generation, even if its revision string is
  unchanged. Existing requests are cancelled and object URLs released. Calling
  the returned disposer removes only that exact registration; an old disposer
  cannot remove its replacement. Maps observe `data-map-tile-provider` changes.
- Wrapped copies of the same source/revision/z/x/y share a fetch and decoded URL
  within a mounted map. The library keeps no persistent disk cache and does not
  share its retained cache between maps. Browser HTTP caching remains browser-owned.
- Loads are limited to eight concurrent requests per map and a 15-second timeout
  covering network/body reads and image decode. Per-placement states are `queued`,
  `pending`, `ready`, or `error`. Loading slots are empty; failed slots show a mark
  and an accessible summary. Errors are cached until eviction, re-registration,
  or remount; there is no automatic retry loop.
- The cache retains at most 128 inactive/settled entries when possible; visible
  entries can raise the total to the 256-placement ceiling. Retained encoded-byte
  accounting is capped at 32 MiB and decoded-pixel accounting at 16 million pixels
  (16 × 1024 × 1024). Inactive least-recently-used entries are evicted first;
  if visible entries alone exceed a budget, affected tiles fail visibly. These
  are retained-cache limits, not a hard browser-memory bound: decoder, GPU,
  transient response, and browser HTTP-cache allocations are browser-owned.
- The preflight placement ceiling rejects an excessive viewport/source combination
  before enumeration or requests. It shows a coverage-limit status instead of
  rendering a partial map. Ordinary underzoom remains supported. A zero-size or
  hidden viewport makes no tile requests. Offscreen pending requests are cancelled;
  unmount cancels and releases all owned resources. Late responses and decodes
  cannot revive removed maps or superseded provider generations.

`data-map-tiles-state` reports `pending`, `ready`, `error`, `unknown-provider`, or
`coverage-limit`. The existing `data-map-ready` continues to describe geometry
initialization. The local geometry is retained for the default SVG mode and
existing world/choropleth layers. With a provider selected, its base land layer is
hidden; GeoJSON, routes, heat, markers, popups, and controls retain their order.
Removing the provider ID restores the default land and original attribution.

## Source correspondence and limits

Geometry follows Ely GPUI revision
[`da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721`](https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Components/src/commit/da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721):
`src/maps/geo.rs::tiles`, `MapView::tiles`, `tile_zooms`, and attribution.
The nearest integer source zoom is clamped to the host range; horizontal addresses
wrap while unwrapped placement columns are preserved; rows are bounded; each
shared screen edge is independently rounded with Rust's half-away-from-zero
semantics. Fractional zoom and over/underzoom scale those tiles without seams.

This is a URL-template adaptation of the source image-resource path. GPUI also
accepts native files and in-memory rendered images through a callback; those
interfaces are not ported. Its atlas-specific one-pixel image rim is unnecessary
for independent browser image elements, which are clipped to shared rounded tile
boxes. This work does not claim parity for every layer, gesture, or native API.

The bundled tiles are copied unchanged from that revision's
`examples/gallery/assets/tiles`, generated there by `scripts/tiles.py` from Natural
Earth 110m country data. [Provenance and SHA-256 hashes](../../ui/gohtmx/assets/ely/tiles/provenance.json)
and the [upstream MIT notice](../../ui/gohtmx/assets/ely/tiles/LICENSE.txt) are retained.
Natural Earth data is public domain. See [UI notices](../../THIRD_PARTY_UI.md).

Verification includes `node ui/gohtmx/tests/unit/maps_tiles_test.mjs`, Go map/template/SDUI/asset tests,
and `node ui/gohtmx/tests/browser/maps-tiles-browser-test.mjs`. The browser check uses the real
consumer server and local PNGs, including fractional seams, marker/popup layering,
zero-size views, generation replacement, detach/remount, failures, and coverage
limits. It is included in `npm run test:browser`.
