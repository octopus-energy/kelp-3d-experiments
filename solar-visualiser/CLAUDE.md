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
- `js/interactions.js` — hover tooltips + camera fly-to animation.
- `js/ui-controls.js` — sidebar toggle/slider bindings.
- `js/main.js` — entry point, wires everything together, render loop.

## Gotcha

`vendor/three.min.js` must define global `window.THREE` (UMD build, r160). If `THREE` is undefined at startup, the page shows "THREE.js failed to load." — check this file wasn't swapped for an ES-module build.
