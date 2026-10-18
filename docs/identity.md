# elysdui identity

## Name and mark

- Write the project name **elysdui**, lowercase. Uppercase section labels may use
  `ELYSDUI / GO + HTMX` to identify the web renderer.
- Use the single canonical [SVG mark](../ui/gohtmx/assets/elysdui-mark.svg), with the
  wordmark beside it when space permits. The original flat overlapping frames
  represent one definition shared across screens. Do not redraw the geometry or
  create separate renderer logos.
- Ely GPUI's isometric E is the upstream project's identity. Do not substitute it
  for this mark or imply that elysdui is the official Ely project.

## Shared appearance

Use the existing **Ely Neutral** palette, with Inter for web UI and JetBrains Mono
for code. The shared implementation is in `ui/gohtmx/assets/site-chrome.css` and
`ui/gohtmx/assets/theme.js`; component defaults are in `ui/gohtmx/assets/input.css`.

| Role | Light | Dark |
| --- | --- | --- |
| Paper | `#FCFAF7` | `#252525` |
| Surface | `#FFFFFF` | `#2C2C2C` |
| Ink / neutral accent | `#181613` | `#F3F1F0` |
| Muted | `#605D5A` | `#C4C2C0` |
| Border line | `#E1DFDD` | `#3F3F3F` |
| Focus | `#3772BB` | `#69A1E8` |

Page marks inherit the current ink color through the shared CSS mask. The same
SVG is the favicon and follows the system color scheme when used standalone.
The hub, gallery and playground share persisted theme/palette preferences. The
playground passes only a validated mode and 19 hex color roles to its inert
preview. Theme changes preserve drafts and selection; the opaque iframe keeps
network/font loads disabled and uses the declared sans-serif stack with a local
system fallback when the bundled web font cannot load. Color
has a functional role; do not introduce a decorative renderer-specific palette.

## Attribution

Display this wording prominently on project-owned web surfaces, linking
**Ely GPUI** to <https://elygpui.com/>:

“Independent project inspired by Ely GPUI. Not affiliated with or endorsed by
Ely GPUI.”

Keep the fuller [third-party notices](../THIRD_PARTY_UI.md), licenses and upstream
source references. The new mark does not replace credit for the component design.

## Native demos

Reuse the elysdui name and canonical mark for project chrome, launch/about screens
and future app-icon assets. If a platform requires raster assets, generate them
from this SVG rather than inventing new geometry. Use the neutral role values
above for project-owned decoration and adapt light/dark rendering to the platform.
Retain native SwiftUI/Compose controls, system typography, dynamic type, focus,
contrast and accessibility behavior. Do not recolor controls just to match web
screens or suggest that a platform capability is already implemented. Include
the upstream link and independence statement in the app's about/credits surface.
This guideline does not claim that all native demo assets have already migrated.
