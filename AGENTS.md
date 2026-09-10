# Agent guide — kelp-3d-experiments

Two halves live in this repo:

1. **`solar-visualiser/`** — a static three.js web app (solar survey + ASHP building model). Module-by-module reference: [solar-visualiser/CLAUDE.md](solar-visualiser/CLAUDE.md). Read that before touching the JS.
2. **Repo root** — a Blender + Bonsai (BlenderBIM) pipeline (`rebuild_house_geometry.py`, `sync_ifc_geometry.py`, `render_views.py`) that rebuilds the same house in `model.blend`/`model.ifc` and regenerates the SVG drawing set in `drawings/`. These scripts run *inside* Blender (they import `bpy`/`bonsai.tool`); a `blender-mcp` server is configured in `opencode.json` for interactive driving.

## Hard contracts (do not break)

- **No build step, no ES modules.** Classic `<script>` tags; `<script>` order in `index.html` *is* the dependency order. Everything attaches to `window.SolarViz`.
- **file:// must keep working.** Under `file://`, tainted-canvas rules block WebGL uploads and `getImageData` on plain file images — failures are silent (white sprites, bare "Script error"). All imagery is therefore embedded as data URLs (`data/image-blobs.js`, the aerial photo in `site-data.js`) and resolved through `window.SolarViz.imageUrl(im)`. Any new texture/pixel consumer must use that resolver. `data/image-blobs.js` is generated from `data/images/` — regenerate, never hand-edit.
- **Pure modules stay pure.** `geometry.js`, `solid.js` (compute half), `floors.js`, `rooms.js` (derive half), `floorplan.js`, `photomatch.js` have no THREE/DOM and export via a UMD foot (`module.exports`) so the node tests can load them.
- **The manifest is suggestions, not state.** `data/image-data.js` is an offline AI-ingest artifact (the future backend swap point, like `site-data.js`). The app never writes to it. The user has authorised reviewed floorplan adapters to seed remote room hypotheses automatically; preserve existing layouts and reject invalid mappings. Other suggestions and acceptance of survey measurements still require explicit user action.
- **All 3D state is derived; only settings + user edits persist** (localStorage / JSON export). Parametric edits are stored against *pre-edit* identities so they replay after rebuilds: footprint drags/deletions keyed to pre-edit loop indices (`solid.footprintOrigIdx`), photo matches as landmark ids + normalised pixels, facade nudges per wall id.
- **Watertightness is the solid's invariant** — the wall-merge is presentational (panels merge, the triangle soup keeps per-edge vertices), and corner deletion removes the vertex from the loop *and* the roof-face rings. The geometry test asserts it; keep it green.

## Coordinate frames

Scene axes: **X = east, Y = up, Z = south**. The app's frame is DSM-centred; the node tests build the solid in a property-centred frame. Anything persisted must be frame-independent (that's why photo matches store landmark ids + normalised px, not 3D points). Yaw 0 = facing north; cameras look down −Z.

## Running & testing

```bash
node solar-visualiser/tests/building-geometry.test.js
```

```bash
node solar-visualiser/tests/building-floorplan.test.js
```

```bash
node solar-visualiser/tests/building-photomatch.test.js
```

No framework — each prints `all checks passed` or fails with exit 1. Which suite covers which files is listed in [solar-visualiser/CLAUDE.md](solar-visualiser/CLAUDE.md#tests).

Dev server: `.claude/launch.json` defines **`solar-visualiser`** (`python3 -m http.server 8743`). In Claude Code, start it via the Browser preview (`preview_start`), not Bash. The server occasionally dies between sessions — restart it the same way. Also test `file://` after touching anything image-related.

## Browser-level verification (what has worked)

UI/rendering changes can't be proven by the node tests. The pattern that works: headless Chrome driven over CDP (`--remote-debugging-port=0`, parse the ws URL from stderr; add `--allow-file-access-from-files` when testing `file://`), then `Runtime.evaluate` against `window.__SOLAR_VIZ__` (scene, camera, building, coords are all exposed there) plus screenshots. Useful sub-patterns learnt on this codebase:

- **Don't eyeball, measure.** Coordinate-grid overlays on photos, a pixel wall-segment detector for the floorplan, and top-view schematics caught misreads that squinting at images repeatedly did not.
- **Render-compare is the pose-quality oracle**: project the model's wireframe over the photo and look for lock-on; solver sanity checks (camera underground, implausible fov/height) catch landmark misidentification.
- Simulate drags with `Input.dispatchMouseEvent` sequences; click UI targets at *projected* positions (e.g. a wall's midpoint through the camera) rather than hardcoded pixels.
- Flakes seen before: stale Chrome profile dir → no DevTools banner (delete the profile dir); HTTP 000 → the dev server died.

## Machine/environment notes

- macOS, zsh. `zsh` has no `timeout` builtin; shell state/cwd resets between tool calls — use absolute paths.
- `sips --cropOffset` is broken here (it centre-crops regardless); crop images another way.
- Blender scripts must run inside Blender (Bonsai add-on required for IFC/drawings); plain `python3` will fail on `import bpy`.

## Domain notes (original survey, not Broom Road)

- The solved solid has **6 merged wall panels**; gables are single planar panels with stepped `topProfile`s.
- Real photo poses land at rmse ≈ 11–13 px; the plot slopes, so a camera on the drive legitimately sits below the house's ground level (tests allow height −1..4.5 m). The rear photo's match is deliberately `needsReview`.
- Sparse, near-coplanar landmark sets hit a telephoto-vs-wide PnP ambiguity — the solver's deadband priors (level camera, human/pole height, normal lens) exist for that; don't remove them because synthetic tests pass without them.
- The floor outline is the **roof** footprint, ~0.4 m proud of the plan's walls — the floorplan fit expects that rim.


## Reproducible reconstruction and heat-pump evidence

For reconstruction, interior interpretation, survey or heat-pump planning work,
read [the reconstruction workflow](solar-visualiser/reconstruction/WORKFLOW.md).
Update that document with new failure cases and supported lessons as work progresses.

- Validate each volume's roof form against labelled source regions before fitting
  dimensions. Keep competing hypotheses where evidence is ambiguous.
- Include raw OS building/site geometry and attribute provenance alongside aerial,
  DSM, plans and photos. Do not equate a roof outline with internal room dimensions,
  an OS site extent with legal ownership, or a mapped floor count with heated spaces.
- Require projected comparisons and separate confidence for every elevation.
  Camera bounds, check residual failures and uncertain attribution must remain visible.
  Preserve the front fit. The archived rear cameras fail their checks; the new
  lower-extension pass uses raw normals and passes visible-feature diagnostics.
  The occluded upper rear wing and the OS/plan footprint conflict remain unverified.
  Read `reconstruction/EXTERIOR-PASS.md`; do not generalise the partial rear pass
  into whole-exterior accuracy. Interior geometry is deferred.
- Keep observations, inferred geometry, survey measurements and homeowner preferences
  separate. Null means unknown, not zero heat loss or absence of equipment.
- Use `reconstruction/run.py` for the complete Broom Road replay; older individual
  runners are intermediate stages. `prepare_evidence.py` supports generic intake,
  but a new dataset needs its own reviewed reconstruction adapter.
- Survey evidence is append-only and property/revision scoped. Changed evidence
  requires downstream review; filling a form does not approve an installation.
- Test `tests/reconstruction.test.js`, `tests/survey.test.js`, and
  `reconstruction/test_evidence.py` and `reconstruction/test_exterior.py` for these
  workflows, plus HTTP/file:// UI checks.


## Current scope: geometry preparation, not heat-loss calculation

Use **Prepare rooms & envelope** for remote estimates and party/external/internal/
ground/unheated classifications. Do not require thermal inputs or revive the heat-loss
UI. Remote snapshots and append-only site observations/decisions live in
`geometryPrep`; only explicitly accepted fields become site-refined. Preserve their
history through model restore/import. Prioritise missing levels, boundary ambiguity
and high-uncertainty dimensions for survey. Plan-space room guesses remain distinct
from fitted 3D partitions. Run `tests/geometry-prep.test.js` and browser checks.

- DSM cutouts are presentation only: clip the footprint and, where needed, a bounded elevated frontage fringe; preserve samples outside the display mask and never flatten a neighbour buffer or infer basement ground levels
  from the upper surface. Raster vertices and samplers use cell centres.
- Floorplan intake must retain source-room IDs and alignment diagnostics; reviewed adapters may map rooms automatically under the user-authorised workflow. Manual alignment remains available;
  failed walls or ambiguous label-to-room assignments block strict imports.
  Include circulation; do not call gross envelope partitions net heated volumes.
- Lower-ground floor IDs must not renumber existing rooms. Test physical vertical
  adjacency and translated-frame quantity conservation, including degenerate
  triangle rejection (`plan-intake.test.js`, `terrain-cutout.test.js`).
