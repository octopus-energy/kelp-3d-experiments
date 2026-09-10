# Review of supplied Marigold V2 visualisations — 2026-09-10

Seven outputs were supplied in `3broomroad-data/photos/`: front/rear depth,
front/rear normals, front/rear albedo, and rear see-through depth. All are
1024 × 683, RGB, lossy VP8 WebP. No raw prediction arrays or checkpoint/run
metadata were found with them. They have been visually inspected, not consumed
by the reconstruction solver. This is externally supplied inference; previous
reconstruction runs correctly recorded that they had not run/use depth themselves.

Decoded-pixel comparison establishes source identity:

- `front.jpeg` matches `655c2e755834a41b23f260899a2fe835.jpeg` exactly.
- `rear.jpeg` matches `b3c87cfb9faa2d98b3231da431fae97b.jpeg` exactly.

The outputs share source resolution and appear spatially aligned on inspection;
this is not a measured registration or prediction-accuracy result.

## Useful information visible in these outputs

- **Front normals:** broad facade faces and the bay's angled returns have distinct,
  fairly coherent colours. This suggests a useful orientation constraint for camera
  rotation and bay geometry, once vector encoding/frame are known. It does not
  determine bay depth or roof heights by itself.
- **Rear normals:** side-facing wall returns differ clearly from rear-facing walls;
  patio/step surfaces are also distinguishable. These regions could help challenge
  incorrect wall correspondences in the failed rear camera fit. Thin roof surfaces
  remain partly hidden; their appearance does not validate complete roof topology.
- **Rear depth:** broad depth layering separates the foreground courtyard, nearer
  lower extension and more recessed building regions. Useful for ordering and
  occlusion constraints. The target-property boundary is still a semantic question;
  the model has no evidence of ownership.
- **Front depth:** broad facade/foreground separation is clear, while small details
  and recesses are much smoother. Do not derive precise dimensions from colours.
- **See-through depth:** glazed door/window regions differ markedly from ordinary
  depth. Predictions through glazing describe a different surface hypothesis and
  must not be fitted as the exterior window/door plane. Keep this modality separate.
- **Albedo:** reduced lighting variation may help identify openings/material regions.
  It provides no direct metric geometry or construction/U-value measurement.

Vegetation, sky, reflective glazing, thin railings, gutters and mixed boundary
pixels need exclusion or much lower weight. All predictions derive from the same
photographs: agreement between RGB, normals and depth is correlated evidence, not
three independent confirmations. No quantitative accuracy or improvement in the
Broom Road reconstruction has yet been demonstrated using these outputs.

## Next integration experiment

1. Preserve original inputs and outputs; record hashes, source photo IDs,
   checkpoint, repository revision, seed and all resizing/cropping/normalisation.
2. Obtain raw depth `[H,W]` and normals `[3,H,W]` arrays. Confirm the actual depth
   parameterisation and normal axes/sign convention. Do not invert a lossy colour
   preview and present it as the original floating-point prediction.
3. Mark opaque, sufficiently large wall regions on the already fitted front photo.
   Compare robust normal directions with the model rendered into that camera.
   Use this as a compatibility check before touching the failed rear pose.
4. For the rear, test whether reliable wall normals constrain camera rotation and
   distinguish wall assignments. Use relative depth ordering to reject impossible
   overlap/occlusion. Preserve metric footprint/scale anchors from OS/plan/survey.
5. Test fitting with and without these weak constraints. Report held-out corner/edge
   errors, camera bounds, geometry validity and changes to supported front geometry.
   Retain conflicting evidence; do not certify the model using predictions aligned
   against that same model.
6. Interior normals/depth would be a useful next dataset for room planes, ceiling
   slopes and furniture occlusion. None of the supplied seven maps covers an interior.
   Room dimensions, emitter dimensions and outputs still need appropriate anchors.

The official repository documents raw `.npy` outputs under
`images/predictions_npy/`. Its default `depth/Log-stage2` predicts affine-invariant
log depth; its normals model predicts camera-space unit vectors. The supplied
files do not establish which checkpoints/settings were used. Log-depth alignment
must respect its representation; a single arbitrary metres-per-colour multiplier
is not sufficient.

Source: [official Marigold V2 documentation](https://github.com/huawei-bayerlab/marigold-v2#inference),
checked 2026-09-10.


## Raw batch received and audited — 2026-09-10

The earlier preview-only limitations above are now superseded by the imported
`broom-road-run-03-evidence-217598ab` package. It contains all 22 listing photos
(13 interior, 7 exterior, 2 garden views) and all four modalities: 88 float32 NPY
arrays plus PNG previews. Source-file, prepared-input, decoded-pixel and output
hashes verify against the manifest. Native heights range from 682 to 684 pixels;
use recorded image dimensions, not a blanket 1024 × 683 assumption.

Checkpoint/runtime metadata and the asset-lock fingerprint are present. Actual
model weights are not in the package and have not been independently checked
locally. Normals are CHW camera-space vectors, median lengths approximately
0.999–1.0005 across images; numerical use renormalizes each vector. The recorded
albedo export is gamma-converted sRGB, not linear RGB. Both depth variants are
relative log depth and remain separate modalities.

`inspect_predictions.py` audits every array, then computes robust normal directions
inside the explicit patches in `monocular-regions.json`. The report displays those
rectangles on both original RGB and normal previews; patch selections are assistant
interpretations and can be challenged. Within-patch dispersion is not a calibrated
confidence interval. Thousands of correlated pixels are not thousands of independent
measurements.

Findings with the frozen reconstruction candidate:

| Check | Result | Interpretation |
| --- | --- | --- |
| Front main wall / bay-front brick band | 4.5° / 4.9° difference from candidate orientation | Promising compatibility check for image-right/image-up/toward-camera convention; not independent calibration |
| Rear extension front / upper wing end wall | 38.6° / 38.3° difference | Strong disagreement with provisional rear camera or assigned surfaces; do not treat normals as truth |
| Rear living-area ceiling vs opposite floor normal | 20.2° departure from parallel | Supports investigating a sloping ceiling; not a measured roof pitch |
| Kitchen, front living room, lower ground controls | 10.3°, 9.9°, 8.1° departures | Coherent-looking predictions can still disagree on apparently parallel surfaces |

The rear comparison changes the next experiment: recheck which walls are being
matched and constrain camera orientation using several well-supported plane
hypotheses before loosening dimensions. Keep the previous failed image checks;
normal agreement must not replace held-out photo validation. For interiors, use
wall/ceiling planes as weak constraints tied to the floorplan and measured scale.
No heights, roof pitches, room volumes, heat losses or accepted geometry were
changed by this audit.

Reproduce from the repository root (NumPy + Pillow):

```sh
python3 solar-visualiser/reconstruction/inspect_predictions.py \
  solar-visualiser/3broomroad-data/broom-road-run-03-evidence-217598ab \
  --photos solar-visualiser/3broomroad-data/photos \
  --regions solar-visualiser/reconstruction/monocular-regions.json \
  --candidate solar-visualiser/3broomroad-data/reconstruction/run.json \
  --output solar-visualiser/3broomroad-data/reconstruction/monocular-audit
python3 solar-visualiser/reconstruction/test_predictions.py
```

Outputs: `monocular-audit.json` and a self-contained `monocular-audit.html` beside
it. Package files are immutable. This audit is separate from fitting and does not
mark `depthUsed` true in historical reconstruction runs.
