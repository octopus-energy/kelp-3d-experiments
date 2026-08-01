# Solar 3D Visualiser

Static site, no build step. Open `index.html` directly (`file://` works) or serve with any static server. Classic `<script>` tags only — no ES modules, no bundler.

## Module pattern

Every JS file (except `vendor/` and `data/`) attaches to a shared global namespace:

```js
window.SolarViz = window.SolarViz || {};
window.SolarViz.xyz = ...
```

Load order is dependency order — see `<script>` tags in `index.html`. Don't reorder without checking what each module reads off `window.SolarViz`.

## Files

- `vendor/three.min.js`, `vendor/OrbitControls.js` — three.js r160 (UMD/global build) + OrbitControls.
- `data/site-data.js` — `window.SITE_DATA` (property/roof/panel data), `window.__DSM_B64__` (base64 heightmap), `window.__AERIAL_DATAURL__` (aerial photo). **This is the future API swap point** — currently hardcoded, will eventually be fetched from a backend instead.
- `data/image-data.js` — `window.IMAGE_DATA`: manifest over `data/images/` (listing photos + floorplan), produced by an offline AI ingest pass (currently hand-authored by Claude reading the images; same backend swap point as site-data). Photo entries carry kind/room guesses and feature bboxes; the floorplan entry carries per-floor room rectangles, labels and printed dimensions in image px. **Suggestions only** — the app never applies any of it without user confirmation, and never writes back to it.
- `data/images/` — the raw listing images (webp) + `floorplan.webp`.
- `js/geometry-utils.js` — shape/plane-fitting helpers.
- `js/coordinates.js` — DSM decoding + lon/lat ↔ scene-coordinate conversion.
- `js/scene-setup.js` — scene/camera/renderer/controls/lights.
- `js/terrain.js` — terrain mesh + aerial texture.
- `js/panels.js` — solar panel meshes.
- `js/roof-faces.js` — roof face meshes + array list sidebar.
- `js/obstructions.js` — obstruction meshes.
- `js/plan-draw.js` — shared top-down drawing engine (ortho plan camera, click-to-place vertices, banner, Enter/Esc/Backspace keys). One session at a time; used by scaffolding and the building-model wall drawing.
- `js/scaffolding.js` — scaffold designer: draw vertices on the ground (top-down), auto-generates tube/board scaffold to the eaves, costs it at length × billed height (whole 2m lifts) × £/m² rate.
- `js/building/` — building model derived from the roof faces:
  - `geometry.js` — pure geometry helpers (plane fits/intersections, polygon ops, ear clipping, mesh slicing, polygon splitting, watertight check). **No THREE/DOM** — also loaded by the node tests via `module.exports`.
  - `solid.js` — regularisation pipeline: cluster roof vertices, snap them to plane intersections, level eaves, chain + square-up the footprint, extrude walls to ground → watertight indexed mesh. Compute half is pure; mesh builders need THREE.
  - `floors.js` — slices the solid into storeys (slab outlines from horizontal mesh cross-sections) + slab meshes.
  - `rooms.js` — room partitioning: floors start as one room, each drawn divider wall splits one room in two (rooms re-derived from the divider list, so undo = pop + replay). Wall-draw mode stays active after each split (Esc or the button exits) and pops a room-type prompt for the newly carved room. Also room types (kitchen/living/bedroom/bathroom/hallway/storage → tint + label) and the thick exterior-wall band shown while a floor is being edited (selecting a floor isolates it: shell + other floors hidden, openings filtered to that floor). Gotcha: transforms that place things on walls must be proper rotations — a makeBasis(dir, up, normal) basis is left-handed (a reflection) on half the walls; use `setFromUnitVectors(+Z, normal)` or an explicit right-handed z = x×y.
  - `floorplan.js` — floorplan import (pure, node-testable): fits a similarity transform from plan-pixel space onto a floor outline (scale from the plan's printed room dimensions, orientation searched over 4 rotations × mirror, translation minimising deviation from the expected roof-overhang rim), converts the plan's rooms into one carve polyline per room (manifest order — T-junction walls land on walls carved earlier), and replays them through `deriveRooms` — so imported rooms are ordinary dividers: editable, persisted and undoable like hand-drawn ones. Walls stay exactly on the building axes; where the roof outline and the plan disagree at a corner, only a short hinged tail bends to close the room (beyond ~1.2 m sideways the wall fails loudly instead). `refitDividers` re-snaps stored walls after the outline changes (footprint edits, storey changes) or a wall is moved. Note the floor outline is the **roof** footprint (~0.4 m proud of the plan's walls all round); the fit expects that rim.
  - `openings.js` — windows (real holes in wall panels + glass + frame) and radiators, in wall-local (u, v) coords.
  - `gallery.js` — property-photo gallery (thumbnail grid + lightbox) for the ASHP sidebar; reads IMAGE_DATA only.
  - `photomatch.js` — camera-pose recovery for exterior photos (pure, node-testable): named landmarks derived from the solid (eave/ground corners keyed on cluster ids, gable apexes, ridge ends), a pinhole solver (Levenberg–Marquardt over position/rotation/focal from multiple seeds) and wireframe projection. Deadband priors (level camera, person/pole height, normal-to-wide lens) keep sparse near-coplanar point sets out of the telephoto-vs-wide PnP ambiguity without biasing well-constrained solves. Matches are stored as landmark ids + normalised pixels — frame-independent, so the same data solves in node tests (property-centred frame) and the app (DSM-centred frame).
  - `photomatch-ui.js` — the human half: per-photo match panel with AI-suggested draggable dots, the model wireframe re-projected live over the photo (trust = the wireframe visibly locking on), per-dot error colours, add/remove landmarks. Accepted matches persist in buildingState, render as camera frustums with photo thumbnails, and "Stand here" flies the camera to the photographer's position and cross-fades the photo at the solved focal length. Re-solves automatically when the solid rebuilds (footprint edits).
  - `building-ui.js` — sidebar section, edit modes, localStorage persistence + JSON export/import. All 3D state is derived; only settings + edits persist. Editing: click a divider wall to select it (drag sideways to move — attached walls re-snap; delete via the button; room names/types survive id churn via centroid remapping in `remapRoomMeta`). "Edit footprint" shows draggable handles on the main loop's vertices; committed drags persist as `state.footprintOffsets` (per-vertex [dx, dz], invalidated if the regularised vertex count changes) and rebuild the whole chain — solid → floors → rooms (refit) → openings (rebind). Neighbour edges axis-snap during the drag so the footprint stays square.
- `js/interactions.js` — hover tooltips + camera fly-to animation.
- `js/ui-controls.js` — sidebar toggle/slider bindings.
- `js/mode-switcher.js` — top mode toggle (Solar / ASHP / EVC): swaps sidebar panels (`#panel-solar` / `#panel-ashp` / `#panel-evc`) and 3D layers. Solar layers are hidden in ASHP mode and re-applied from the View Layers checkboxes on return; ASHP gates the building model via `building.setActive()`. Last mode persists in localStorage (`viz-mode`).
- `js/main.js` — entry point, wires everything together, render loop.

## Tests

`node tests/building-geometry.test.js` — checks the solid is watertight on the real site data, slices are closed loops, polygon splitting conserves area. Run after touching anything in `js/building/geometry.js`, `solid.js` or `floors.js`.

`node tests/building-floorplan.test.js` — fits the bundled floorplan onto the derived floors and checks the imported rooms (scale, fit score, divider replay, labels/types). Run after touching `js/building/floorplan.js` or the floorplan section of `data/image-data.js`.

`node tests/building-photomatch.test.js` — synthetic pose round-trips plus the manifest's real photo correspondences (rmse, camera position sanity; `needsReview` matches only have to solve). Run after touching `js/building/photomatch.js` or the match blocks in `data/image-data.js`.

## Gotcha

`vendor/three.min.js` must define global `window.THREE` (UMD build, r160). If `THREE` is undefined at startup, the page shows "THREE.js failed to load." — check this file wasn't swapped for an ES-module build.
