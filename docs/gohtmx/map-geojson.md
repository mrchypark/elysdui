# Inline GeoJSON maps

The `GeoJSON` map prop is escaped, inert JSON text in a template. The shared map
runtime validates the complete input before painting any supplied geometry.
Replace the map component (including its template) through the usual fragment
swap to update it. Editing the template in place is not an update API.

Supported shapes and structural validation follow
[`src/maps/geojson.rs` at da3fdca](https://git.zacharyzhang.com/ZacharyZhang-NY/Ely-GPUI-Components/src/commit/da3fdcaf39f2fa85ce1dd9cad07c3c81cf1dd721/src/maps/geojson.rs):

- FeatureCollection, Feature, or a bare geometry.
- Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon, and
  recursively nested GeometryCollection.
- Positions contain numeric longitude first (−180 through 180), then latitude
  (−90 through 90). Additional ordinates are ignored. All JSON numbers must be
  finite, including numbers in properties or ignored members.
- Lines contain at least two positions. Rings contain at least four positions
  and close on the first two ordinates. Empty multi-geometries, polygons, and
  geometry collections are allowed. Repeated IDs, degenerate rings, and
  self-crossing rings are not rejected by the source parser or this runtime.
- Features must have a geometry member; null is allowed. Missing/null properties
  become an empty object. Other property values must be objects. Missing/null IDs
  are allowed; present IDs must be strings or supported numbers.

## Numeric IDs and remaining parity gap

Integer literal IDs in the signed-negative/unsigned-positive 64-bit range
(−9223372036854775808 through 18446744073709551615) retain their exact decimal
text, including IDs beyond JavaScript's safe-integer range. For example,
9007199254740993 remains distinct from 9007199254740992.

Floating-point, exponent-form, negative-zero, and out-of-range numeric IDs are
explicitly rejected. Use string IDs for those values. This is a documented
browser subset: Rust serde_json's float-to-string normalization is not emulated,
so this is not full numeric-ID parity. Numbers inside properties use JavaScript
Number semantics (like JSON.parse), and may lose precision beyond its safe
integer range; use strings for application values that require exact precision.

## Safety envelope and errors

Inline JSON is limited to 1 MiB of UTF-8 text, 64 nested JSON levels, 100,000 JSON
values, 4,096 features, 4,096 geometry objects (collections count), and 20,000
positions across the entire input. Altitude and properties still count toward
byte/depth/value limits. These browser budgets are additional to the upstream
parser and account for repeated-world SVG rendering.

A malformed or over-budget input sets `data-map-ready="error"`, shows the reason
in the existing live status, and paints none of that input. It never truncates or
silently renders just the valid prefix. A corrected component replacement clears
the error. Removing a pending component cancels its mount; a late land response
cannot paint the removed component. Existing raster tiles, routes, and markers
remain independent. No URLs or executable code are read from GeoJSON properties.

Projection remains Web Mercator, so latitude values beyond its display limit
are clamped for drawing after validation. Polygon holes use SVG's even-odd fill;
polygon and line members of collections inherit their feature's choropleth value. Geometry is overlaid above
land/raster layers and below routes/markers. An explicit GeoJSON prop also takes
precedence in world/choropleth modes; without one, bundled Natural Earth geometry
continues to be used.

Checks: `node ui/gohtmx/tests/unit/maps_geojson_test.mjs`, `node ui/gohtmx/tests/unit/maps_runtime_test.mjs`, and
`node ui/gohtmx/tests/browser/maps-geojson-browser-test.mjs`. The browser check uses the real map
component and covers shape rendering, holes, invalid input, replacement, zoom,
popup dismissal, and pending removal/remount.
