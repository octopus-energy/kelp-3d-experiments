# Broom Road reconstruction experiment

Open `../reconstruction.html` directly or via the static dev server. The ASHP
sidebar also links to it for 3 Broom Road. It reads generated classic-script
bundles, uses embedded images, and does not mutate the original survey or saved
building edits. Exports are reconstruction candidates, not the existing building
state import format.

This is a first, reviewable reconstruction loop, with assistant-interpreted
observations and hypotheses followed by numerical fitting. It is not an unattended
LLM service. Rear photos now also constrain the lower rear extension and its sloping glazed
frame, with weak raw-normal constraints. The front facade and bay remain frozen;
the upper rear wing and interior geometry are still unvalidated.

## Inputs and model

- `../3broomroad-data/reconstruction-observations.json`: normalized pixel
  annotations from original images, separate vertical facade edges, printed plan
  dimensions, interpretations, and unresolved questions. These are reviewable
  assistant annotations, not automated detections or measured survey points.
- `model.py`: parameterized main volume, front bay with hipped cap, rear wing,
  two mono-pitch rear roofs, front openings, and explicitly
  unfitted secondary openings. Named landmarks survive parameter changes.
- `fit.py`: bounded robust least squares for geometry, cameras and vertical image
  shift. Uses printed internal dimensions with uncertain wall allowances; fixes
  no arbitrary photo-derived absolute scale. OS-derived position/orientation and
  dimensions are soft priors. Original DSM is sampled bilinearly at pixel centres.
  Correlated DSM samples have limited influence; the conflicting extension DSM
  has very low weight. There is no depth-model inference in this run.

The initial loop evaluates a plan hypothesis, fits two front photos, then tests
two rear roof hypotheses using photos + DSM. Those older stages incorrectly
assumed a gabled upper rear wing; they remain labelled Previous for comparison.
The corrected candidate uses one plane for each rear volume, following the user’s
interpretation of rear photo `b3c87cfb9faa2d98b3231da431fae97b`.
`revise_rear.py` fits only the four rear height/rise parameters to weak DSM and
height priors. All front parameters, footprints and photo cameras remain fixed
from `front-fit-baseline.json`. Two other front images use roof, door and
vertical-edge information for camera alignment; their window positions are
excluded from geometry optimization and their own camera solve. Check images
were inspected during development, so they are diagnostic checks, not an untouched
benchmark test set. RMSE is in the original 1024 x 683 image pixels.

The first run's large check errors triggered a camera-model revision: vertical
facade edges and vertical image shift were added for cropped/perspective-corrected
photos. Dense DSM cells were then downweighted to avoid overwhelming plan/OS
constraints. `iteration-01.json` and `iteration-02.json` retain those earlier runs.

## Reproduce

```sh
python3 -m venv /tmp/broom-reconstruction-env
/tmp/broom-reconstruction-env/bin/python -m pip install -r solar-visualiser/reconstruction/requirements.txt
/tmp/broom-reconstruction-env/bin/python solar-visualiser/reconstruction/run.py
node solar-visualiser/tests/reconstruction.test.js
```

Output goes to `../3broomroad-data/reconstruction/`: `run.json` (evidence,
parameters, per-stage results, cameras, residuals, quality flags and input hashes),
`bundle.js` (same report for file://), and `candidate.json` (semantic model).
Generated files must be regenerated rather than hand-edited. This runner needs
Python + NumPy/SciPy; the web app still needs no build step or Python runtime.
The checked-in `front-fit-baseline.json` freezes the earlier front fit. `fit.py`
recreates the initial four hypotheses only; use `run.py` to regenerate
the corrected report, rear projections and evidence/survey package from the frozen baseline.

## Review limitations

A low residual on fitting photos is not confidence in hidden geometry. The UI
shows fitting and check errors separately and warns when check images regress.
Both rear roof forms are now confirmed as mono-pitch. Their exact pitches,
heights and the lower roof’s slope direction remain approximate because the provisional rear
photo cameras fail validation. The extension DSM disagreement is recorded explicitly.

Each derived roof section forms a closed, oriented shell; construction joints
are not a fabrication-ready CSG union. The basement envelope has an assumed
2.1 m depth under the main footprint. The internal floorplan is not reconstructed
as room partitions. Window/door frame envelopes are rectangles even where the
brick arches are curved. Purple openings have inferred dimensions and are not
part of the numerical photo fit. The rooflight is a visible placeholder panel,
not a cut through the structural roof mesh.

## Marigold V2

The upstream documented environment is Linux/CUDA. Inference was not run on this
macOS ARM host; the externally supplied batch now contains all four modalities
for 22 images and passes integrity checks. Two raw normal patches enter the fit.
The default `Log-stage2` checkpoint predicts affine-invariant log depth, not metres;
its normals checkpoint produces camera-space normals.

Prepare the reviewed subset without sending any files or running inference:

```sh
python3 solar-visualiser/reconstruction/prepare_depth_job.py /tmp/broom-marigold-job
```

The resulting job has instructions and provenance requirements for a compatible
machine. The reconstruction solver consumes two raw normal patches; it does not fit depth values. Their
alignment, masks and validation must be implemented before they enter the fit.
Upstream: https://github.com/huawei-bayerlab/marigold-v2


## Evidence and survey loop

[WORKFLOW.md](WORKFLOW.md) records the reproducible procedure, acceptance gates,
known failures and the path from room geometry to heat-pump design.
`align_rear.py` adds provisional rear cameras, withheld roof checks and explicit
bound-hit failures. Both archived rear views failed validation; the new lower-extension pass is described below. The front remains
unchanged. `prepare_evidence.py` inventories OS geometry/attributes, photos, plan
and raster sources with hashes, and can inventory another dataset without
borrowing Broom Road geometry. `run.py` records runner hashes and runtime versions.

Open `../survey.html` for selectable plan-space rooms, four approximate emitter
regions, installation options and structured survey/homeowner input. It saves to
separate browser storage and supports JSON export/import including attached photos.
The exported record is evidence for designer review; it is not a building-state
import or an approved heat-pump design. Room areas and heat losses are uncalculated.

```sh
python3 solar-visualiser/reconstruction/prepare_evidence.py /path/to/new-dataset
node solar-visualiser/tests/survey.test.js
python3 solar-visualiser/reconstruction/test_evidence.py
```


Browser verification is also reproducible (Node 22+, Chrome, Python 3):

```sh
node solar-visualiser/tests/browser-review.cjs
```

The runner starts a temporary localhost server and isolated Chrome profile, tests
HTTP and file://, checks photo/OS overlays, room selection, measurements,
partial records, homeowner preferences, photo attachment, JSON download/import,
persistence and property isolation. It prints the temporary screenshot/output
folder and stops its own processes. Set `CHROME_BIN` or `PYTHON_BIN` if needed.


For collecting all raw Marigold outputs in one batch, use the self-contained
[folder notebook](notebooks/marigold-folder.ipynb). It runs depth, normals, albedo
and see-through depth and exports raw NPYs, PNGs and provenance as a ZIP.
See [notebook setup and checks](notebooks/README.md). GPU inference requires Linux/CUDA.


## Imported raw Marigold evidence

The complete external batch is audited by `inspect_predictions.py`; see
[MARIGOLD-REVIEW.md](MARIGOLD-REVIEW.md) for the command, native array conventions,
region definitions and measured findings. Its HTML/JSON report is separate from
accepted reconstruction state. Run `python3 reconstruction/test_predictions.py`
from `solar-visualiser/` after changing the audit.

## Current exterior pass

[EXTERIOR-PASS.md](EXTERIOR-PASS.md) documents the default **Exterior · rear
refinement** stage, raw-normal inputs, retired corner assignments, sloping frame,
excluded photo checks and remaining upper-wing/OS footprint uncertainty.
`run.py` includes `refine_exterior.py`; `test_exterior.py` verifies the separation
of fitting and excluded observations. Whole-exterior accuracy is not certified.
Interior geometry remains deferred.
