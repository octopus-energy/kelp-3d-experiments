# Reproducible property reconstruction and heat-pump survey workflow

This is the operating procedure for progressing from an incomplete dataset to a
reviewed installation design. Geometry, evidence and design decisions have separate
records. A plausible mesh is not sufficient evidence for a heat-loss calculation.

## What runs now

`python reconstruction/run.py` (from `solar-visualiser/`, with the documented
NumPy/SciPy environment) replays the **Broom Road adapter**: frozen front fit,
rear roof correction, archived provisional rear camera alignment, normal-guided lower rear extension refinement and evidence inventory.
`reconstruction.html` shows photo projections, withheld checks, DSM and OS outlines.
`node tests/browser-review.cjs` runs the isolated HTTP/offline interaction checks.
`survey.html` shows plan-space room interpretations, observed emitters, installation
hypotheses and a survey recorder. It runs offline and exports/imports JSON with
embedded photographs. Survey observations do not automatically modify geometry.

`python reconstruction/prepare_evidence.py /path/to/dataset` inventories other
folders, fingerprints inputs and reports missing evidence. It does **not** run a
universal house reconstruction. A new property needs a reviewed manifest, semantic
model adapter, annotations and validation. Broom Road parameter defaults must never
be silently reused for another property. Generalizing these adapters is future work.

The main ASHP viewer now accepts an explicitly adopted reconstruction and supports
manually divided rooms with geometry estimates, envelope classifications and site refinement. Read [the workbench guide](ASHP-WORKBENCH.md).
Automatic metric interior reconstruction, radiator-output calculation, equipment
selection and designed service routes remain unimplemented.

## Evidence contract

Preserve immutable source files. Each observation must link a stable entity ID
(room, roof face, wall, opening, emitter or service node) to its source, source
region, units, frame, capture date if known, method and uncertainty. Store unknown
values as null. Capture date, upload date and dataset generation date differ.
Keep individual attributes' provenance: OS basement attribution in this example
comes from older third-party imagery interpretation, not a recent site visit.

| Evidence | Appropriate use | Limits to carry forward |
| --- | --- | --- |
| OS building geometry and IDs | Footprint, orientation, property attribution, connectivity hypotheses | Roof overhang, internal wall positions and legal boundaries are separate questions |
| OS site polygon and attributes | Site context; age, basement and floor-count clues | Auto-defined extent and historic attributes need checking; floor count does not establish heated zones |
| Original aerial and DSM | Roof topology, scale/frame alignment, broad heights | Nodata, edge mixtures, vegetation, acquisition date and correlated pixels |
| Listing exterior photos | Visible roof/wall junctions, openings and neighbouring context | Cropping, perspective correction, unknown lens, occlusion and mistaken property attribution |
| Floorplans | Room names, adjacency, levels, printed dimensions | Marketing plans can be schematic; maximum dimensions are not net area |
| Interior photos | Room attribution, ceiling shape, emitters, services and finishes | Hidden components are unknown; appearance does not establish insulation or radiator output |
| Site measurements | Metric anchors and observations with stated method | Instrument uncertainty, datum, inaccessible areas and transcription errors |
| Homeowner input | Comfort, room use, hot-water demand, layout preferences and constraints | Preferences do not substitute for a technical design check |

Validate coordinate reference systems and horizontal/vertical datums before
combining evidence. The current OS adapter assumes the supplied metre coordinates
are EPSG:27700 and labels that assumption. House-local axes differ from the app
frame; persist semantic IDs, normalized pixels and explicit metric frames. Reject
out-of-coverage DSM samples; never create observations by clamping to edge cells.
The original DSM reader currently assumes the Broom Road sample region is inside
its raster: extending it to arbitrary rasters requires coverage/nodata validation.

## Reconstruction loop and acceptance gates

1. **Intake and attribution.** Inventory sources, dates and missing categories.
   Establish the target property, neighbours and visible building volumes. Draw
   source regions before assigning features. Do not infer ownership from a fence
   or auto-defined site polygon. Record conflicting sources rather than choosing
   whichever fits the current model.
2. **Structural hypotheses.** Enumerate roof forms and slopes for each volume;
   levels, party-wall adjacency and room connectivity are also hypotheses. Require
   a source region or an explicit prior for each. LLM proposals are reviewable
   structured observations, not accepted geometry. Unsupported forms remain open.
3. **Metric constraints.** Use OS dimensions, printed plan lengths and reliable DSM
   interiors as uncertainty-weighted constraints. Separate roof footprint from wall
   footprint and internal dimensions. Correlated observations must not count as
   independent repeated evidence. Survey anchors supersede assumptions through a
   recorded review, not an unexplained replacement of source values.
4. **Camera fit.** Use identifiable corners and verticals spanning depth and image
   area. Record camera bounds and the prior assumptions. Multiple initial poses
   must be tried. A lens/height bound hit or incompatible pose is a failed check.
   Four approximate points with freely varying focal length and crop shift can
   remain ambiguous even with a low residual.
5. **Project and compare.** Overlay labelled observations and model edges for each
   elevation. Show occluded model edges distinctly or explain their inclusion.
   Hold out some edges/corners from fitting. Report errors by photo and component,
   camera plausibility and visibility coverage. A line residual from a short visible
   segment does not establish the location of an occluded endpoint.
6. **Revise or request evidence.** Inspect failed correspondences before changing
   geometry. Test a new structural hypothesis when required; retain the previous
   version, changed parameters and evidence supporting the change. Reject changes
   that damage already supported elevations. Do not tune to a check repeatedly
   and continue calling it an independent test.
7. **Release by purpose.** Track geometric validity, photographic agreement,
   dimensional confidence and thermal-model readiness separately. A closed shell
   can still be wrong. An elevation passing a pixel threshold is not surveyed
   metric accuracy. Design release requires the relevant downstream checks.

Archived first-pass rear annotations are in `rear-observations.json`. `align_rear.py` freezes
geometry, fits four approximate pose points plus a vertical direction in each
photo, and excludes the lower extension corner and visible eave segment. Its
10 px threshold is a prototype diagnostic. Both archived Broom Road rear fits
hit the FOV bound and fail the withheld check; they **must not** be accepted as
calibrated photo evidence. Next: verify the annotated wing junctions and door
sill attribution, add more independent features or a measured anchor, then test
rear dimensions/slope hypotheses. The front cameras and geometry remain frozen.

`trial_rear.py` attempts a subsequent rear-only geometry refinement. It promotes
near-photo roof checks to fitting evidence explicitly, while retaining the far
photo's lower roof corner as a diagnostic check. The trial is currently rejected:
the far corner remains about 26 px out, camera/height bounds are hit, and a rear
opening protrudes above the proposed low roof. `rear-trial.json` preserves the
parameters, observations, revised evidence roles and rejection reasons. It does
not replace `candidate.json`. This is an experiment to diagnose the mismatch;
resolve attribution/scale before accepting more free parameters.

Optional monocular depth/normals can suggest relative surface orientation and
occlusion. Record model/checkpoint, input transforms, confidence and output frame.
Align any scale/shift to trusted geometry, mask vegetation/glass and compare
against held-out observations. Marigold V2's default log-depth output is not a
metric tape measure. The reconstruction runner has not run depth inference. A complete externally supplied batch now provides 88 raw arrays for 22 photos,
with hashes, checkpoints and run metadata. These have passed the integrity audit;
two exterior normal patches now enter the lower rear extension fit as weak constraints; depth is not fitted. See
[the supplied-output review](MARIGOLD-REVIEW.md).

## Internal geometry and thermal representation

Build a room/space graph before furnishing a detailed interior. Include landings,
stairs, voids, cupboards and unheated spaces. Assign stable room IDs across plan,
photos and survey. Broom Road already has selectable plan-space room regions and
explicit tentative connections; these are not metric partitions.

Fit each floorplan with a constrained transform using several printed or measured
lengths. Infer wall thicknesses separately and preserve residuals rather than
stretching each room independently to match every printed maximum. Check vertical
alignment of stairs, party walls and service shafts between floors. Extrude rooms
only after floor elevations and ceiling profiles have explicit assumptions or
measurements. Basement ground contact and sloping extension ceilings need their
own surfaces; do not apply one nominal storey height everywhere.

Use shared surface objects with two adjacent-space references. Split a wall where
its neighbour changes (outdoor air, adjacent dwelling, internal room, unheated
space or ground). Openings belong to a surface and room; subtract their areas once.
Room surfaces should close without double-counting internal partitions or ignoring
circulation. Distinguish the thermal envelope from the roof's overhang and from
cosmetic features. Link construction assemblies, insulation evidence, glazing,
ventilation assumptions and design temperatures to the surfaces/spaces.

For subsequent implementation, derive a versioned room schedule with net floor
area, volume, envelope areas by boundary condition, opening areas and evidence
coverage. Unknown construction/ventilation values should produce labelled design
scenarios or a blocked calculation, not default zero heat loss. Rank survey work
by whether plausible alternatives change heat-pump size, emitter suitability or
layout; high-impact unknowns take precedence over small cosmetic roof details.

## Survey workflow

A surveyor receives a property-specific worklist containing the hypothesis,
source image/plan region, why it matters, requested measurements and affected
results. The current `survey.html` implements this worklist and input loop.

- **Geometry:** confirm attribution and room arrangement; measure room outlines,
  ceiling slopes/heights, openings, wall thickness and floor/ground level changes.
  For the rear roof, obtain a common height datum and a horizontal distance visible
  across photo views. Keep original images and identify measured endpoints.
- **Thermal envelope:** inspect construction and insulation where accessible;
  classify party walls, exposed basement walls, ground floors, roof/loft boundaries,
  glazing and ventilation. Record inaccessible components explicitly.
- **Emitters:** locate every radiator/towel rail or other emitter by room; take
  front/side/label photos, dimensions, panel/convector or column count, valve/pipe
  details and obstruction/access notes. Photo-observed is not output-verified.
- **Services:** locate the meter, consumer unit, existing heating/DHW equipment and
  candidate cylinder spaces. Electrical suitability is assessed at the supply and
  consumer unit, not inferred merely from the meter location. Record who assessed it.
- **Outdoor siting:** measure candidate envelopes, access, drainage, neighbour
  receptors and obstacles. Retain options pending model-specific airflow, sound,
  service and applicable siting checks.
- **Routes:** separate hydraulic, electrical and condensate networks. Each segment
  needs endpoints, length, height change, penetrations, fittings/diameter where
  relevant and access/uncertainty. A drawn connection is a route hypothesis until
  the concealed sections are checked.
- **Homeowner discussion:** record household hot-water use, comfort expectations,
  refurbishment plans, retained outdoor/storage space, radiator appearance,
  disruption tolerance and preferred named options. Preserve unresolved choices.

The form accepts typed values in declared units, method, observer, timestamp,
notes, evidence references and up to three attached photos per observation.
Partial measurements retain unknown fields and keep the task open; uncheckable tasks retain a reason. Homeowner preferences have a separate role.
Records append to history; import is idempotent and refuses conflicting IDs,
other properties and stale evidence/model revisions. Storage is separate from
building edits. Export JSON for handover and backup; this prototype has no server,
account authentication, synchronization or verified electronic signatures.

New evidence lists affected geometry/design results for review. The prototype
never marks a design approved merely because all forms are filled. A future
reviewer action should accept/reject an observation, select a hypothesis, rerun
only affected calculations and preserve the earlier decision and result version.

## Heat-pump design handover

The intended dependency chain is:

`evidence → room/surface geometry + fabric → room heat losses → emitter options`

`household demand + available space → cylinder options`

`site + services + equipment constraints → unit locations + viable routes`

`technical alternatives + homeowner choices → reviewed installation design`

Emitter replacement needs the room demand and verified emitter performance at the
chosen operating conditions. The smallest-looking radiator is not automatically
inadequate. Likewise, a short route is not automatically hydraulically suitable.
Compare alternatives together: flow temperature, emitter upgrades, heat-pump
performance, cylinder space, routes, sound, cost/disruption and homeowner choices.

The eventual design engine and professional review should use the applicable
current design standard and manufacturer data. MCS MIS 3005-D:2025 Issue 2.0
covers heat-load calculations, emitter/design temperatures and the design
information handed to the installer. It is a reference for the future design
module; this prototype neither implements it nor claims compliance.
[Official MCS design standard](https://mcscertified.com/wp-content/uploads/2025/12/MIS-3005-D-2025-V2.0-Final.pdf).

[Energy Saving Trust's system overview](https://energysavingtrust.org.uk/advice/air-source-heat-pumps)
provides context for outdoor units and hot-water storage.
[OS Building feature documentation](https://docs.os.uk/more-than-maps/data-demonstrators/topography-demonstrators/os-ngd-buildings/building-feature-type)
explains the distinction between buildings, building parts and their attribution.
Sources checked 2026-09-10; recheck current requirements at design release.

## Lessons and regression cases

- **Rear gable mistake:** correct candidate absent from the hypothesis set. Add
  per-volume topology review before fitting and require rear render comparisons.
- **Front residual overreach:** report per-elevation status. Good front alignment
  cannot validate rear surfaces or interior rooms.
- **Low-resolution DSM:** do not force small roofs to noisy edge cells. Retain
  sparse/contradictory evidence and request measurements that resolve ambiguity.
- **Basement / terrace context:** floor counts, visible roofs and gross shell area
  cannot determine heat-transfer boundaries. OS and plan evidence must both appear.
- **Unmeasured radiators:** preserve visible evidence and unknown dimensions/output;
  never decide replacement from a photo alone.
- **Site extent:** an auto-defined polygon and a garden photo are different
  evidence. Confirm scope/access before accepting an equipment location.

When a reconstruction fails, add the observed failure, source IDs, invalid
assumption, changed gate and a regression check here. Never record an unverified
interpretation as a general rule about how all houses are built.

- **Imported monocular outputs:** distinguish raw arrays from colour previews and
  ordinary from see-through depth. Derived maps share the source photo's evidence;
  agreement must not be counted as independent confirmation. Use the front camera
  as a normal/frame compatibility check before attempting rear optimisation.


## Batch monocular inference notebook

`notebooks/marigold-folder.ipynb` is a portable, self-contained Jupyter workflow
for a Linux CUDA kernel. It collects raw NPYs and PNG previews for depth, normals,
albedo and separate see-through depth. Input hashes, EXIF transforms, aspect-ratio
preserving resize, stable source/alias IDs, model weights, pinned code and runtime
versions travel with the results. The final ZIP excludes model weights but includes
their fingerprints. Integrity checks and resumable batches prevent incomplete or
mismatched predictions from being presented as a complete evidence package.

Two source-code details matter: fixed width/height inference does not necessarily
resize outputs back to the original image, and the pinned CLI gamma-converts its
albedo output to sRGB. This notebook instead prepares aspect-preserving inputs,
uses native-input inference and records actual dimensions/encoding. Verify these
contracts again when upgrading upstream. CPU tests and Broom Road preparation
passed. A subsequently imported A100 CUDA run now supplies all 22 images and four
modalities; `inspect_predictions.py` verifies its raw outputs. See `notebooks/README.md`.

**Model-download disk exhaustion (2026-09-10):** the original notebook's broad
`--skip-datasets` download still fetched unused Qwen text-encoder weights and
unused Marigold depth variants. The user reported nearly full Colab disk and a
downloader failure before inference; the supplied exception alone did not prove
ENOSPC. Photo batching cannot fix model storage. The notebook now selects the
pinned inference dependencies explicitly, estimates missing bytes before any
weight transfer, and offers opt-in cleanup of unused components/partial transfers
in its dedicated asset directory. Required weights, sources and final outputs
are preserved. Successful temporary CLI images are removed only after outputs
are validated and recorded; logs/configs and failed attempts are retained.
Regression tests cover selection, no downloads on insufficient space, cleanup
scope and preserved resumability. These CPU checks and a metadata-only plan do
not establish successful GPU execution; confirm that on the user's CUDA machine.

**Missing inference dependency (2026-09-10):** the Broom Road Colab log showed
`ModuleNotFoundError: No module named 'bitsandbytes'` during component-loader
registration, before model loading. The old notebook hid that exception in logs,
ran all four modalities and surfaced only missing NPY files. Dependency checks
now import the inference configuration's modules in the actual CLI interpreter
before weight downloads. Failed passes print their log tail; a pass with no
validated predictions stops further modalities. The reviewed package requirement
is `bitsandbytes==0.49.2`. After installing a missing package, refresh provenance
and use a new results folder; keep the shared weights. Do not clear or silently
rewrite a recorded environment to bypass the resume guard. Import checks do not
prove CUDA compatibility or model execution. Regression tests cover surfaced
import errors, stopping empty passes and retaining the environment guard.

**Diffusers call-signature mismatch (2026-09-10):** the subsequent Broom Road log
loaded the VAE, transformer shards and task checkpoint, then rejected
`txt_seq_lens` in `QwenImageTransformer2DModel.forward` on the first photo.
The installed Diffusers version was not printed, so its exact version is unknown.
The reviewed Marigold dependency pin is `diffusers==0.38.0`; that release's
transformer signature accepts this argument. Import success alone was insufficient.
The preflight now checks the version and binds Marigold's call arguments against
the installed forward signature without loading weights. Pin the dependency and
run the check in a fresh subprocess, then record a new run environment. Do not
blindly remove unsupported arguments or replace model code without checking their
meaning. Signature checks still do not establish successful image inference.
[Diffusers 0.38.0 transformer source](https://github.com/huggingface/diffusers/blob/v0.38.0/src/diffusers/models/transformers/transformer_qwenimage.py).


**Raw normal consistency check (2026-09-10):** the complete batch passed source,
input, output and shape checks. Explicit front-wall patches agree with the frozen
candidate orientation within about 5°, while the sampled rear walls disagree by
about 38° under the same provisional camera convention. Revisit rear pose and wall
attribution before changing roof heights. Interior ceiling/floor pairs depart
from parallel by 8–10° even in apparently level rooms; the rear living-area pair
is about 20°. Patch coherence is not angular accuracy, and the latter value must
not become a measured roof pitch. Save regions and provenance, retain image check
failures and require independent scale/geometry evidence. Details and replay:
[raw Marigold review](MARIGOLD-REVIEW.md#raw-batch-received-and-audited--2026-09-10).

## Exterior pass with raw normals — 2026-09-10

See [EXTERIOR-PASS.md](EXTERIOR-PASS.md) for the new default candidate, exact
changes, residuals and remaining exterior checks. `refine_exterior.py` follows
the archived rejected rear trial in the complete replay. The front and upper
wing remain frozen; only the lower rear roof and glazed frame are refined.
Interior geometry is deferred at the user's request.

New supported lessons:

- Retire unverified corner assignments explicitly. A roof/wall junction behind
  neighbouring volumes is not automatically a full-width wing corner. Preserve
  its original annotation and uncertainty; do not relabel it just to lower error.
- Trace the outer opening frame consistently. The rear glazed head slopes with
  the roof; a rectangular frame prior was wrong. Preserve polygonal cut-outs,
  and distinguish roof top, fascia underside and glazing head in the metric model.
- Normal predictions can constrain an ambiguous camera, but use one weak vector
  per surface patch, retain a no-normal control, and record multi-start results.
- Prove that excluded evidence is excluded: perturbing check pixels must leave
  fitted parameters unchanged while changing the validation outcome.
- Report coverage by volume. A 4.9 px rear-extension check does not validate the
  occluded upper wing. Explicitly retain OS/plan conflicts and unmeasured scale.
- Imported prediction previews and prepared copies are derived evidence. Inventory
  their package manifest rather than counting every output as another photo.

Run `reconstruction/test_exterior.py` in addition to the reconstruction, survey,
evidence and HTTP/file:// suites for changes to this pass.


## Working ASHP geometry and thermal scenarios — 2026-09-10

The user's next step connects the exterior to the main geometry tool and begins
room scenarios; automatic interior reconstruction remains subsequent work. Follow
[ASHP-WORKBENCH.md](ASHP-WORKBENCH.md). Adoption is explicit, reversible and property
scoped. The source candidate, measured evidence, working edits and thermal assumptions
remain distinct. The initial two above-ground floors exclude the basement.

New failure cases and supported rules:

- Connected solid volumes can slice into multiple touching loops. Union those loops
  before room partitioning, otherwise an extension can silently disappear from rooms.
- A concave footprint can reject a divider even when both endpoints and its midpoint
  look plausible. Test every interval between edge crossings; conserve room/roof
  area and reject incomplete or overlapping coverage before showing a complete load.
- Preserve sloping opening polygons through binding, wall cut-outs, editing and export.
  A rectangle around a trapezoid changes both visible geometry and glazing area.
- Count shared partitions and inter-floor surfaces once, with opposite signed room
  transfers. Subtract each opening once; split its area geometrically at room boundaries.
- Roof footprints are gross envelopes. Require explicit dimension review and allow
  net volume/gross surface overrides; do not call the result surveyed interior geometry.
- Geometry edits invalidate reviewed quantities. New surface shapes require renewed
  fabric inputs. Missing U-values, ACH, temperatures or boundary types remain null.
- A partial included-room total is not whole-house heat loss. Keep missing basement,
  rooflight and unverified exterior evidence visible; a scenario never approves sizing.


## Scope correction: geometry before calculations — 2026-09-10

The user wants geometry prepared for future heat loss, not a heat-loss calculator
at this stage. [ASHP-WORKBENCH.md](ASHP-WORKBENCH.md) is the current operating guide.
The main UI now estimates dimensions, areas and volumes, classifies boundaries and
supports remote snapshots followed by targeted, field-specific site observations.

- Keep a remote baseline rather than overwriting hypotheses with measurements.
  Preserve the observer, method, evidence reference and explicit acceptance decision.
- Uncertainty guides survey effort. Missing rooms/levels and party/external extent
  take precedence over polishing small windows or forcing all fields to be measured.
  Group collinear model fragments into meaningful wall-run checks.
- Site-refined is incremental. One measured height does not verify room shape or
  boundary classification. Inaccessible items and untouched fields remain uncertain.
- Listing-plan polygons can provide labelled rough room-area estimates using an
  explicit scale/height hypothesis. They are not automatically metric 3D partitions.
  Preserve lower-ground rooms in the evidence inventory even if the mesh lacks them.
- Accepted quantity corrections and the 3D mesh can differ: reconcile the geometry
  explicitly instead of silently stretching rooms from a maximum dimension pair.
- Geometry changes invalidate incompatible application of old evidence. Retain the
  records through restore/import, and reuse a measurement only after confirming its
  new target. Importing observations alone does not apply their corrections.

## Terrain context, lower ground and plan assignment — 2026-09-10

Do not use the rendered DSM/model gap as a registration measurement. The ASHP
viewer previously flattened vertices up to 0.8 m outside the model and forced
lower points up to one datum. It therefore erased neighbouring geometry and
could cover a basement. The terrain mesh also placed samples at raster edges
rather than cell centres. These are display/coordinate errors, not evidence that
all source imagery should be shifted.

ASHP now clips triangles at the exact model footprint, interpolating original
heights, UVs and normals at the cut. Outside DSM heights remain unchanged. Solar
roof caps stay separate from the raw ASHP context and from fitting evidence.
Turning off the cutout restores the original DSM geometry. The optional frontage
cutaway is a display section, **not an inferred or measured lightwell**. A DSM is
an upper surface, so it cannot reliably describe undercuts/basement exposure.
The front candidate corner is about 0.025 m from the OS mapped corner; frontage
is 5.181 m versus 4.996 m in OS. This checks a local anchor, not independent
registration of all elevations or party-wall extents.

The lower-ground model is explicitly added by the user, with a default 2.6 m
floor-to-floor depth and the current main-house/bay footprint. Both its extent
and depth remain hypotheses. It is a separate closed volume sharing the
above-ground datum, not a globally lowered roof/terrain model. The fitted
basement opening can bind to its walls. Changing the assumed floor depth keeps
that opening at its existing absolute elevation. Ground/first indices stay
stable; the lower-ground level is appended. Inter-floor adjacency follows
physical elevations, not numeric index order. Storey count/attic controls are
locked while this appended level is present to avoid silently retargeting edits.

`js/building/plan-intake.js` is the reviewed Broom Road plan adapter. It records
wall-centre traces, label points, floor identity and provenance against the
1040 × 1080 source `floorplan.png`. Ground has three spaces; first has five;
lower ground has four named spaces plus explicitly included stair circulation.
Door thresholds are closed by provisional room boundaries. Open-plan kitchen
and rear living area remain one space. Stair voids, wall thicknesses and net
heated volumes have **not** been reconstructed.

Workflow: adopt the exterior → add provisional lower ground → select each floor
→ Import rooms from floorplan → inspect overhead underlay, source labels and
largest outline offset → adjust scale/orientation/translation → Apply. Initial
alignment uses the candidate frontage bearing, width and front corner; it does
not stretch rooms independently to fit their printed maximum dimensions.
Failed cuts, missing labels or multiple labels landing in one partition block
this adapter's Apply. Applied rooms are ordinary editable dividers with source
room IDs, included in model exports and geometry review. Geometry changes retain
survey history but invalidate incompatible reviewed quantities.

For another property, supply reviewed floor outlines, ordered divider paths,
label points/stable IDs, printed dimensions and a defensible alignment anchor.
Do not borrow Broom Road's tracing or claim generic automatic intake. Preserve
plan/shell disagreement and competing extents instead of moving annotated walls
until a test passes. Endpoint samples may stop inside a room and snap to a known
boundary; retain the original wall line and report closure failures.

New regression: collinear vertices can produce a zero-area triangle during
polygon triangulation. Using its zero winding in a clipping routine admitted an
entire unrelated room and inflated inter-floor areas in one coordinate frame.
Discard degenerate triangles before intersections; test quantity conservation
and identical property-relative signatures in translated frames.

Run `tests/plan-intake.test.js` and `tests/terrain-cutout.test.js`, existing
geometry/floorplan/geometry-prep/quantity suites, and `tests/browser-review.cjs`.
The browser suite now previews/applies all three plans, binds the basement
window, changes depth, checks reload and exercises HTTP and file:// imagery.

Visual QA also showed a high DSM fringe just outside the fitted front facade.
The exact cutout deliberately preserves it in the raw-context view. It must not
be silently reclassified as a real wall or used to move the house. Use the explicit
frontage cutaway to inspect the basement; resolve exterior ground exposure with
photo/level evidence. OS identifies two terrace connections, so add a targeted
party-wall extent check rather than interpreting the rendered gaps as outdoor air.

## Automatic rooms and a focused workspace — 2026-09-10

The user explicitly requested room mapping without a human import/approval loop.
That supersedes the earlier per-floor preview requirement for reviewed plan
adapters. `automatic-rooms.js` maps empty floors when an existing reconstructed
model loads or a new exterior is adopted. It adds the provisional Broom Road
basement, derives all three floor outlines and validates each partition/label
assignment before committing that floor. Successful mappings remain low-confidence
remote hypotheses; source data and survey observations are not rewritten.

Keep existing room layouts, names and plan imports. Persist a mapping version so
reload does not undo a deliberate deletion. Record failed cuts, unassigned labels,
initial outline residuals and a geometry fingerprint. Changed exterior/floor
geometry requires alignment review, without automatic replacement of edited rooms.
Automatic means no repetitive approvals for valid hypotheses; it does not mean
accepting invalid geometry or turning inferred dimensions into measurements.

The main page now has **House / Rooms / Survey**. Common tasks stay visible;
manual alignment, roof editing, photo matching, floor parameters and file exchange
are progressively disclosed. Room partitions and the editable 3D model remain the
same state used by geometry preparation. The existing detailed survey review is
opened directly from Survey. Arbitrary new floorplan-image interpretation remains
an evidence-intake task: this implementation uses the reviewed Broom Road tracing,
not a generic image-to-rooms model.

Regression checks: `automatic-rooms.test.js` covers complete mapping, preservation,
idempotence, property isolation and invalid-fit refusal. The browser workflow
checks one-action construction, automatic rooms, three focused panels, retained
rebuild review, manual correction controls, persistence and HTTP/file:// imagery.

## Residual DSM facade after exact clipping — 2026-09-10

The user supplied a further default-view screenshot showing tall DSM spikes in
front of the ground/first-floor windows. The footprint-only cutout was insufficient:
DSM edge interpolation extends the old facade outside the fitted wall outline.
The earlier optional basement cutaway hid this in some QA views, so testing only
that view incorrectly suggested the clash was addressed.

Default ASHP replacement now also clips elevated DSM triangles in a frontage-only
region: the main-house/bay width, from 1.5 m in front of the bay to the main front
wall. It removes portions above the ground-floor datum, or 0.1 m below the lowest
modelled front opening when that is lower. The latter avoids leaving a stump
across basement glazing. This threshold is for display, not a measured ground
level. Triangle intersections
interpolate heights, UVs and normals; lower original surface samples stay intact.
There is no lateral or rear neighbour buffer and no newly flattened ground plane.
The explicit basement cutaway removes the full-height frontage section when needed.
This is display cleanup, not a lightwell reconstruction or a DSM registration fit.
Raw DSM evidence, roof geometry, room layouts and stored measurements are unchanged.

`terrain-cutout.test.js` checks the height-limited subtraction area, surviving low
ground and high neighbouring terrain. The HTTP/file:// browser workflow now counts
remaining elevated triangles inside the frontage region with the basement cutaway
**off**, then captures the default context view. Require that check when changing
DSM replacement; an attractive optional cutaway screenshot is insufficient.
