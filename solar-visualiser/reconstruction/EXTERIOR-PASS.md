# Exterior refinement — 10 September 2026

Open `../reconstruction.html` and select **Exterior · rear refinement**. This is
now the default review candidate. The previous stages remain selectable; no
saved building edits are changed. Interior geometry is explicitly deferred.

## What changed

The lower rear roof and glazed frame are fitted jointly across the two rear
photos. The frame has a sloping head following the roof, rather than the earlier
rectangular envelope. Its wall cut-out follows the actual polygon. The main roof,
front bay, front openings, all four front cameras and upper rear wing stay frozen.
An unfitted extension side-window envelope is limited to 0.15 m below the new roof;
that allowance is a construction assumption, not a photo-measured window height.

| Parameter | Previous | New candidate |
| --- | ---: | ---: |
| Lower roof low edge above model datum | 2.50 m | 2.21 m |
| Across-width roof rise | 0.50 m | 0.90 m |
| Across-width pitch | 8.6° | 15.1° |
| Rear frame width | 1.94 m assumed | 1.60 m fitted with priors |

These are candidate dimensions, not survey measurements. The recorded 0.15 m
fascia depth, 0.08 m frame-head allowance and 2.05 ± 0.20 m nominal low-side door
height influence scale. Roof points use the roof-top datum; source edge pixels
refer to the underside of the fascia. Conflating these edges biases roof height.

## Evidence and checks

`exterior-observations.json` retains pixel coordinates, selected brick patches,
assumptions, evidence roles and retired correspondences. The two old upper-wing
junctions do not establish full-width wing corners in these occluded views. They
are excluded without assigning them a new identity. Upper-wing dimensions remain
unvalidated. A visible main eave segment constrains a line, not its hidden ends;
its attribution remains provisional.

Each raw normal patch contributes one weak vector constraint with a 15° angular
scale. Hundreds of correlated pixels do not become hundreds of independent votes.
The complete imported package is integrity-checked before fitting. Relative and
see-through depth are not used as metric constraints.

| Photo | Fitting points RMSE | Excluded checks | Fascia line distance | Normal disagreement |
| --- | ---: | ---: | ---: | ---: |
| Near rear `b3c87c…` | 2.1 px | None: this view supplies fitting evidence | 1.2 px, fitted | 5.7° |
| Far rear `d234ec…` | 3.2 px | 4.9 px combined RMSE | 1.6 px, excluded | 3.6° |

The far checks are the upper-right frame corner (4.1 px) and lower fascia corner
(5.6 px). Camera vertical fields of view are approximately 68.5° and 64.4°; neither
camera nor the fitted geometry hits its bounds. Nine initial camera seeds are
tried. A control without normals is recorded separately: the far orientation
moves about 39° from the normal prediction and the candidate fails a diagnostic
check. This supports using weak normals in this case, not trusting them generally.

The checks were inspected during development. They are diagnostic comparisons,
not an untouched benchmark. A regression test perturbs only excluded evidence:
parameters and cameras stay identical, while the acceptance diagnostic fails.

## What is still unresolved

- The upper rear wing is occluded and retains its earlier geometry. The dashed
  grey overlay shows unvalidated/occluded context; it is not a claimed silhouette match.
- OS and the listing plan narrow the far rear footprint on different sides. The
  OS outline is about 1.9 m wide at its end; the plan-based candidate is about
  2.6 m wide. Retain the source/date conflict rather than stretching geometry to
  satisfy both. OS site coverage does not determine legal ownership.
- Front check-image residuals remain unchanged (about 19.7 px mean window RMSE).
  A good fit to the two fitting photos does not establish millimetric front geometry.
- Upper roof/side openings, hidden junctions, the lower roof's obscured high edge,
  basement exposure and ground levels are not surveyed.

Before claiming the **whole exterior** is good, obtain an attributable upper-wing
roof view and check the rear width/setback against a measured sketch. A low/high
fascia height pair on a common datum, rear frame width/height and one horizontal
setback would resolve much of the remaining metric ambiguity. Keep interior
reconstruction as the next step rather than treating these residuals as approval.

## Replay and verification

```sh
/tmp/broom-reconstruction-env/bin/python solar-visualiser/reconstruction/run.py
/tmp/broom-reconstruction-env/bin/python solar-visualiser/reconstruction/test_exterior.py
node solar-visualiser/tests/reconstruction.test.js
node solar-visualiser/tests/browser-review.cjs
```

`run.py` writes the candidate and classic-script offline bundle, archives the old
rear camera review in `previousRearReview`, and records `exterior-pass.json` with
the control fit, assumptions and diagnostics. Changed candidate/evidence hashes
produce a new survey revision; existing survey history is not silently migrated.
