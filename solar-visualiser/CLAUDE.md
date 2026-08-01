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
  - `openings.js` — windows (real holes in wall panels + glass + frame) and radiators, in wall-local (u, v) coords.
  - `building-ui.js` — sidebar section, edit modes, localStorage persistence + JSON export/import. All 3D state is derived; only settings + edits persist.
- `js/interactions.js` — hover tooltips + camera fly-to animation.
- `js/ui-controls.js` — sidebar toggle/slider bindings.
- `js/mode-switcher.js` — top mode toggle (Solar / ASHP / EVC): swaps sidebar panels (`#panel-solar` / `#panel-ashp` / `#panel-evc`) and 3D layers. Solar layers are hidden in ASHP mode and re-applied from the View Layers checkboxes on return; ASHP gates the building model via `building.setActive()`. Last mode persists in localStorage (`viz-mode`).
- `js/main.js` — entry point, wires everything together, render loop.

## Tests

`node tests/building-geometry.test.js` — checks the solid is watertight on the real site data, slices are closed loops, polygon splitting conserves area. Run after touching anything in `js/building/geometry.js`, `solid.js` or `floors.js`.

## Gotcha

`vendor/three.min.js` must define global `window.THREE` (UMD build, r160). If `THREE` is undefined at startup, the page shows "THREE.js failed to load." — check this file wasn't swapped for an ES-module build.
