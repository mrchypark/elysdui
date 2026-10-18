# Native maps, canvas, and geographic editing

**Status: proposed, not implemented or runtime verified.** This document is an
implementation plan, not a supported API or a new native capability declaration.
No map provider is selected; no subscription, API key, credential, or external
service is configured by this proposal.

## Current baseline

At the reviewed baseline (`9541c62`), the [native support inventory](SUPPORT.md)
contains ten semantic types. Native map and canvas renderers are absent.
The [native protocol](../../contracts/native/profile-v1/PROTOCOL.md) and
[machine-readable inventory](../../contracts/native/profile-v1/support-matrix.json) remain authoritative.
Web catalogue names do not imply native support. Independently developed control
extensions must be evaluated on their own revision, not assumed merged here.

The [web map adapter](../gohtmx/map-tiles.md) renders SVG geography and optional host-owned
raster tiles. Its JavaScript/SVG implementation does not run inside a native view.
The existing [CanvasScene contract](../gohtmx/advanced-workspace.md#canvasdesign-source-scenes-526534)
provides drawing and editing data for InfiniteCanvas, ToolPalette, LayerPanel,
ColorPanel, ConstraintsEditor, NodeEditor, FlowChart, MindMap, and Whiteboard.
This proposal preserves that model's useful semantics rather than replacing it
with an unrelated scene language.

## Recommended composition

A native map with a canvas overlay is feasible at the SDK/API level. Prefer a
hybrid renderer for a site plan such as solar-panel footprints and wiring:

| Layer | Responsibility |
| --- | --- |
| Native map | Basemap, camera, geographic projection, attribution, SDK lifecycle |
| SDK geographic shapes | Ground-anchored panel footprints, site boundaries, wiring polygons/polylines |
| Native canvas overlay | Selection outline, marquee, drag preview, editing handles |
| Native controls | Tool palette, layer list, properties, accessible editing actions |

A screen-fixed overlay is straightforward: use a SwiftUI stack or Compose box
around the map. A geographically anchored overlay additionally requires projection
and camera synchronization. Simply stacking the existing InfiniteCanvas over a
map does not establish geographic registration.

Use SDK shapes for committed geographic geometry so the map engine owns its
projection. Use a screen overlay for temporary feedback and screen-sized handles.
A georeferenced raster image/ground overlay can display a plan, but does not
provide per-panel objects, selection, or vector editing by itself.

This is a **2D ground-plane** design. It does not model tilted solar panels,
roof elevation, terrain attachment, building occlusion, or a 3D engineering scene.
A separate screen canvas cannot automatically be hidden behind map buildings.
Aerial imagery, GPS, and this UI do not establish survey-grade measurement accuracy.

## SDK options and verified integration points

No provider choice is prescribed. Evaluate coverage, required basemap appearance,
licensing, attribution, service availability, operating cost, offline rights,
privacy, platform minimums, and host constraints before implementation.

- **iOS MapKit:** SwiftUI Map supports markers, annotations and geographic shapes.
  MapReader/MapProxy provides coordinate-to-point and point-to-coordinate conversion.
  More specialized geographic drawing can use an MKMapView wrapper and
  MKOverlayRenderer/Core Graphics. Overlay renderers must respect invalidated map
  rectangles and background/concurrent drawing requirements. These are platform
  APIs, not elysdui APIs. See [Map](https://developer.apple.com/documentation/mapkit/map),
  [MapProxy](https://developer.apple.com/documentation/mapkit/mapproxy), and
  [overlay drawing](https://developer.apple.com/documentation/mapkit/mkoverlayrenderer/draw(_:zoomscale:in:)).
- **Android Google Maps Compose:** CameraPositionState exposes camera state and
  the current Projection. Use toScreenLocation/fromScreenLocation for conversion.
  Screen coordinates are physical pixels relative to the map's top-left corner,
  not Compose dp or whole-screen coordinates. Inverse projection can fail when a
  strongly tilted view ray misses the ground. Google Maps requires host-managed
  project/billing and API authentication setup; this document performs none.
  See [Maps Compose](https://developers.google.com/maps/documentation/android-sdk/maps-compose),
  [CameraPositionState](https://googlemaps.github.io/android-maps-compose/maps-compose/com.google.maps.android.compose/-camera-position-state/index.html),
  [Projection](https://developers.google.com/android/reference/com/google/android/gms/maps/Projection),
  [polygon examples](https://developers.google.com/maps/documentation/android-sdk/examples/polygon),
  [ground overlays](https://developers.google.com/maps/documentation/android-sdk/groundoverlay),
  and [usage requirements](https://developers.google.com/maps/documentation/android-sdk/usage-and-billing).
- **MapLibre Native:** an option when consistent source/style control across
  platforms matters. Android and iOS are core platforms, and the engine has a
  BSD-2-Clause license. Tile/data-provider terms remain separate. Android exposes
  Projection conversions; standard geographic source/style layers are the preferred
  starting point. Do not assume cross-platform custom GPU-layer parity: the
  Android API documentation examined on 2026-10-17, in the 13.6.1 documentation set,
  labels CustomLayer **"Experimental feature. Do not use."** The iOS documentation
  separately provides a Metal custom-style-layer example. Pin and recheck the
  chosen SDK version/backend before considering such an extension.
  See [platforms](https://maplibre.org/maplibre-native/docs/book/platforms/index.html),
  [license](https://github.com/maplibre/maplibre-native/blob/main/LICENSE.md),
  [Android Projection](https://maplibre.org/maplibre-native/android/api/-map-libre%20-native%20-android/org.maplibre.android.maps/-projection/index.html),
  [Android CustomLayer](https://maplibre.org/maplibre-native/android/api/-map-libre%20-native%20-android/org.maplibre.android.style.layers/-custom-layer/index.html),
  and [iOS Metal custom layer](https://maplibre.org/maplibre-native/ios/latest/documentation/maplibre-native-for-ios/customstylelayerexample/).

The links above include moving/latest documentation. Record exact dependency
versions and platform availability in the implementation change; this review is
not a compatibility guarantee for every OS version or renderer backend.

## Proposed contract evolution

The following names and fields are design sketches only. They are not accepted
wire fields, registered component names, executable examples, or shipped APIs.
Any implementation must change the Go resolver, both native clients, fixtures,
capability lists, validation and tests together.

### Reuse the existing scene

Retain stable shape IDs, names, types, selection, hidden/locked state, styles,
relative points, tool intent and edit/undo/commit semantics where supported.
Existing shape kinds include rect, ellipse, polygon, diamond, line, arrow, path,
text and note. Reuse their data and behavior contract, not browser DOM/SVG code.
The existing lower-case CanvasScene map needs a strict, versioned native projection
with explicit supported variants and limits. Reject unknown required modes;
do not silently discard an unsupported shape or change its meaning.

Graph structures need separate handling: NodeEditor ports/links, FlowChart edges,
and MindMap parent/child relationships are semantic graphs. They are not geographic
coordinates or interchangeable drawing primitives. Automatic graph layout,
pressure/tilt input, font discovery, export and collaborative persistence are not
newly supported by this proposal.

### Coordinate spaces and registration

Proposed design vocabulary:

- `coordinateSpace`: distinguish a logical drawing document, geographic WGS84
  coordinates, and a local metric site scene. Never infer space from numeric values.
- `anchor`: a WGS84 site origin plus an explicitly defined local frame, orientation,
  axis direction and units. Store dimensions in meters for metric site editing.
- `schemaVersion` and scene revision: separate schema compatibility from content
  updates; preserve stable IDs through edits and rendering changes.
- Camera state: center/bounds and supported orientation; do not assume different
  providers' numeric zoom values have identical meaning.

For a small site, a defined local metric frame anchored to WGS84 allows panel
size and layout to remain stable. Convert local vertices through an explicit,
reviewed geodetic transform, then use the SDK projection to obtain screen points.
Convert pointer positions back through the inverse transforms when editing.
Specify local-frame extent/error limits; select a suitable projected CRS or
geodetic implementation if the site/accuracy requirement needs it. Do not treat
Mercator projected meters as universally equal to ground distances.

Existing x/y coordinates require registration/calibration: origin, scale, units,
orientation and possibly control points. Existing drawings must not silently
become latitude/longitude. Keep the independent canvas's `view:{x,y,zoom}` for
standalone mode; in geographic mode the map camera is the sole viewport owner.
There must not be two independent pan/zoom transforms competing over one scene.

### MVP camera limits

Start with north-up, zero pitch and a local ground-plane scene. Disable unsupported
rotation/tilt explicitly. Extending to bearing/pitch requires projecting every
vertex and defining text, image, stroke and handle behavior. A single affine
translate/scale of the whole canvas is insufficient for perspective views.
Complex paths/images may require subdivision or projective rendering. Prefer SDK
geographic layers over constructing a parallel map engine.

Update local overlay projection while the camera moves, including animations and
inertia; updating only at camera idle produces visible drift. Verify timing on
actual platforms rather than assuming callbacks and canvas repaint are frame-locked.
Send bounded completion/state events to the server instead of routing each frame
through a round trip. Preserve the native map instance across ordinary scene diffs.

## Editing, gesture ownership, and accessibility

Separate navigation and editing modes. On pointer-down, choose an owner using
visible unlocked shapes and screen-space hit regions; retain that owner through
move/up/cancel. Empty-space navigation belongs to the map. An active edit handle
belongs to the editor and must not also pan the map. Define multi-touch policy,
scroll-container interaction, pointer cancellation, app backgrounding, and mode
switch behavior. Keep handle hit targets in platform-appropriate screen units,
independent of panel dimensions or map zoom.

Apply inverse projection before editing model geometry. Handle non-invertible or
out-of-ground points as cancelled/invalid edits, not fabricated coordinates.
Bound hit-testing cost and rendered geometry with culling/spatial indexing as
needed. Respect hidden/locked objects and deterministic selection order.

Maintain a draft distinct from the acknowledged server scene. Commit completed
commands with revision/conflict handling and idempotent retry semantics consistent
with the native protocol. Late responses must not replace newer edits. Undo/redo
should operate on model changes, not transient camera projection.

Canvas drawing does not automatically expose interactive shapes to assistive
technology. Generate accessible elements or an equivalent native object list and
actions with stable labels, selection state and move/resize alternatives. A root
label alone is insufficient. Test VoiceOver and TalkBack, focus after changes,
large text, contrast, and switch/keyboard navigation where applicable.
See [SwiftUI Canvas](https://developer.apple.com/documentation/swiftui/canvas),
[SwiftUI accessibility](https://developer.apple.com/documentation/swiftui/accessibility-fundamentals),
[Compose drawing](https://developer.android.com/develop/ui/compose/graphics/draw/overview),
and [Compose semantics](https://developer.android.com/develop/ui/compose/accessibility/semantics).

## Host and capability boundaries

- Negotiate map, drawing, geographic editing and advanced modes separately using
  the existing versioned native protocol. Capability identifiers are still to be
  designed; this document does not add them to the inventory.
- An older client must show the explicit unsupported state, or receive a deliberately
  authored supported fallback such as a text/object list or read-only view. A fallback
  cannot pretend to support editing or silently lose geographic meaning.
- The trusted host chooses and registers providers/resources. Untrusted screens
  select reviewed IDs, never arbitrary network destinations, executable callbacks,
  shader code, API keys or provider configuration.
- The host owns authentication, authorization, provider terms, attribution,
  privacy, quotas, cache/offline rights, resource budgets, and persistence. Retain
  required attribution even when placing controls above the map.
- GPS is optional and independent from viewing supplied coordinates. Ask for location
  permission only in context of a location-dependent feature; denial must leave
  ordinary map and site editing usable. No automatic background tracking or location
  upload is implied. See [Android permissions](https://developer.android.com/training/permissions/requesting)
  and [Apple location authorization](https://developer.apple.com/documentation/corelocation/requesting-authorization-to-use-location-services).
- Bound shape/point counts, numeric ranges, image dimensions, decoded bytes and
  request concurrency. Cancel stale work on removal/provider changes. Preserve
  visible error/unavailable states rather than reporting a successful blank map.

## Implementation and acceptance plan

1. **Contract review:** select an SDK per platform and supported OS versions; define
   strict scene variants, registration, action semantics, limits and capabilities.
   Add shared positive/negative fixtures before declaring support.
2. **Read-only prototype:** render the same anchored panel polygons and wiring on
   both platforms; verify map movement, resize, screen density, padding/insets and
   relaunch round trips. No provider setup is authorized by this document.
3. **Editing prototype:** add selection and one drag/resize path, local preview,
   explicit commit/cancel, undo/redo, stale-response protection and retry tests.
4. **Accessibility and lifecycle:** verify native object alternatives, gesture
   ownership, permission denial, background/resume, offline/error states, and
   provider/resource teardown on simulators/emulators and representative devices.
5. **Scale and extended cameras:** establish target scene sizes and frame-time,
   memory and positional-error budgets before testing. Add bearing/pitch only after
   projection and touch round-trip tests satisfy those documented budgets.

Acceptance evidence must separate schema/unit tests, native compilation, real
simulator/emulator interaction, manual accessibility and physical-device checks.
Include geographic-to-screen-to-geographic round trips, registration fixtures,
locked/hidden hit tests, overlay alignment during motion, degenerate geometry,
latitude/longitude boundaries, and projection failure cases. Verify that saved
model coordinates do not change merely because the map moved.

No implementation, native execution, device performance result, provider-service
validation, or engineering-accuracy certification is supplied by this design note.
