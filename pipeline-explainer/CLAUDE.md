# Solar Pipeline Explainer

Static site, no build step — same conventions as `../solar-visualiser` (classic `<script>` tags, shared globals, no bundler). Serve the **repo root** (so `../solar-visualiser/...` resolves) or open `index.html` via `file://`.

A step-through explainer of the backend's `solar_potential_from_address()` pipeline (kuppa-backend), using this property's real data: the bundled aerial photo + DSM + production design from `../solar-visualiser/data/site-data.js`, real Roboflow CV output in `data/detections.js`, and real OS MasterMap outlines in `data/os-data.js`.

## The steps

0. flat aerial tile + geocoded point → 1. CV detections (real, 50 m crop, raw→regularised) → 2. OS site/building filter → 3. DSM point cloud, photo morphs up to meet it → 4. live OLS plane fit on real DSM points (animated regression + azimuth candidate arbitrage) → 5. live panel-layout search (flatten → strips → offsets/alignments → validate against the exact face shape) → 6. horizon scan from the MCS point (first-person sweep east→west, MCS sky segments, shading factor + generation) → 7–9. the MPPT mini-game, one concept per step: (7) drag the string voltage, find the sweet spot; (8) play a whole day and score against a perfect tracker; (9) N+S mixed on one tracker — two humps, the local-max trap, one-orientation-per-tracker rule.

Steps 4–6 are faithful mini-reimplementations of the backend algorithms running live in JS on the real DSM — not canned animations. The step-5 panel count and step-6 shading factor land within rounding of the production values. Steps 7–9 use an illustrative electrical model (single-diode + bypass IV curves, per-string global MPPT, 3.68 kW clip) — that layer isn't in the backend pipeline.

## Files

- `data/detections.js` — real Roboflow workflow output, SAHI run (compacted from `detections.json`, which is the raw export).
- `data/os-data.js` — real OS MasterMap site + building outlines (compacted from `os_data.json`).
- `data/mcs-segments.js` — the MCS sky-segment polygons, from kuppa-backend `shading/data/pointlist.json`.
- `js/geometry2d.js` — 2D polygon toolkit (hull, inset, triangulation, simplify, distances).
- `js/data-prep.js` — converts site data, detections and OS outlines to local metres.
- `js/scene.js` — three.js scene, morphable terrain, overlay builders, HTML labels, camera tweens.
- `js/plane-fit.js` — step 4: DSM sampling, OLS fit, animatable plane, azimuth candidates.
- `js/layout-sim.js` — step 5: flatten/strip/offset/alignment search + inset-canvas renderer.
- `js/shading-sim.js` — step 6: horizon scan, MCS segment intersection, 3D fan + chart.
- `js/electrical-sim.js` — panel/string IV model, simulated June day, 3D wiring visuals.
- `js/mppt-game.js` — steps 7–9: the interactive be-the-tracker game (staged controls, scoring).
- `js/steps.js` — narrative text + per-step scene choreography.
- `js/main.js` — boot + navigation. Exposes `window.PE_DEBUG = { ctx, goTo, viz, data }` for tooling.

## Gotchas

- Load order matters (`index.html` script tags are dependency order).
- Every step's `enter()` sets the full scene state, so steps can be visited in any order.
- Long animations must be **time-indexed** (not frame-counted) — hidden/backgrounded tabs throttle rAF.
