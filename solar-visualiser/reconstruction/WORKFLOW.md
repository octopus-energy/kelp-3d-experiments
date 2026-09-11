# Reproducible property reconstruction and heat-pump survey workflow

## Room-led planning — 11 September 2026

The guided installation journey now starts with rooms and their source photos,
then existing services, equipment routes, costs/payments and a document-review
register. See [ROOM-LED-PLANNING.md](ROOM-LED-PLANNING.md) for the answer-effect trace,
persistence, scope invalidation and verification contract.

Keep existing construction separate from proposed improvements. A saved glazing
what-if must not rewrite the home's observed windows or silently reduce radiator
sizing. An extension label cannot supply an insulation value. A service location
in a note cannot become a surveyed route. Unknown costs must remain unknown in
payment illustrations, and zero gas consumption cannot imply zero standing charge.
Named document reviews need renewed review after relevant proposal changes; they
must not close independent evidence tasks or imply authenticated certification.

## Pre-survey discussion release — 10 September 2026

The user has expanded the scope from geometry preparation to conditional heat-loss
and installation-budget scenarios. `proposal.html` now provides the guided call
experience; [its reproducible contract](PRE-SURVEY-PROPOSAL.md) supersedes earlier
statements below that no heat-loss or emitter comparison is implemented. Design
release, complete survey verification and actual equipment selection remain open.

Latest exact-address EPC evidence is selected by lodgement datetime, not CSV order.
Preserve contradictions between certificates and differences from reconstructed
floor area. Never convert an EPC annual metric straight into design kW. Unknown
emitters stay unknown; a planning cost reserve is not a replacement decision.

Engine integration revealed two regression risks: fixed party-wall ΔT and clipping
negative room-to-room transfer. The explicit surface adapter corrects those
policies and tests conservation. Keep baseline engine provenance and distinguish
the adapter from upstream engine behaviour. Derive sloping volume from the room
model, not the first wall height. Do not infer annual running costs from unaudited
engine outputs or infer product suitability from a room heat-demand total.

Every proposal records evidence/model/code revision, assumptions and call choices.
Changed evidence starts a new draft; previous discussions stay archived. Survey
measurements and homeowner preferences remain separate. The current proposal is
an offline recorded-model snapshot; saved workbench edits are not yet live inputs.

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

## Visible reconstruction replay — 2026-09-10

`replay.html` presents thirteen curated Broom Road milestones, exact recorded model
snapshots, photo projections, original aerial/OS and plan evidence, and hash-checked
normal/depth previews. Read [REPLAY.md](REPLAY.md) for regeneration and the future
live event contract requested by the user. Run `prepare_replay.py` after a new fit.

Do not fabricate intermediate solver states or imply that displayed depth drove
geometry. Preserve the user-attributed rear roof correction, failed camera checks,
rejected trial and partially validated final outcome in any narrative. Playback
pacing is editorial, not measured solver time. The future per-property event stream
is documented only; it does not yet reconstruct or replay arbitrary datasets.

### Blank replay on Retina displays — 2026-09-10

The first replay could show an empty model pane because the canvas's intrinsic
DPR-scaled buffer dimensions contributed to its flex parent's minimum size.
ResizeObserver then doubled the host height on each render at DPR 2; reproduction
reached a 33-million-pixel pane. DPR-1 screenshots of later steps missed this.
The shared reconstruction renderer now positions the canvas absolutely inside its
explicitly sized host, with CSS width/height independent of buffer resolution.
Zero-sized hidden hosts are skipped. Regression checks load the first aerial step
at DPR 2, assert bounded host/canvas dimensions, read rendered pixels to verify
model surfaces exist, and capture the initial view over HTTP and file://.

### Photo-visible rear windows omitted — 2026-09-10

User feedback identified two missing recessed main-wall openings and a too-wide
rear-wing sash. An initial response treated occlusion too broadly and relied on
user marks for presence. On magnified source review, frame/glazing segments are
visible: partial occlusion does not mean the opening is unknowable. Record visible
segments, then distinguish hidden extents and metric scale from observed presence.

`opening-corrections.json` now retains traced near/far source regions, observation
roles and frame proportions alongside the original user-annotated screenshot.
The `rear-openings` stage adds two windows and changes the rear-bedroom rectangle
from the previous broad estimate to a narrower/taller envelope. Storey positions,
full widths and scale remain inferred. Shell, front, lower glazed frame and cameras
are unchanged. The current upper-wall projection does not line up with these new
observations: display that disagreement. In particular, do not assign the large
window on the neighbouring gable to the target rear wing just because the current
projection lands there. The lower-frame diagnostic pass is not an upper-window pass.

Every geometry change must now ship with its evidence-linked replay stage. The
complete `run.py` archives the previous run by content hash, reruns the reconstruction,
appends `revise_openings.py`, regenerates evidence, then regenerates the replay.
`prepare_replay.py` and `tests/replay.test.js` reject a replay that ends on a different
stage from the recommended candidate. Previous stages, user marks, observed source
regions and provisional dimensions remain available for subsequent correction.


## Photo-based radiator output hypotheses — 2026-09-10

With the user's explicit authorisation, estimate outputs where visible proportions
support a useful hypothesis. Keep the original observations intact and record the
new interpretation in `3broomroad-data/radiator-estimates.json`; regenerate the
proposal with `scripts/prepare-proposal.py`. Source photo hashes, rating tables,
assumptions and the earlier proposal revision remain available for replay/review.
This is a proposal evidence revision; it does not change the geometry replay.

Lessons from reviewing every Broom Road interior photograph:

- Search all views for emitters, including bays and behind furniture. The original
  four observations missed hall and bedroom columns and the living bay radiator.
  A dining-room view repeats that bay radiator; do not create a second emitter.
- A possible radiator behind the sofa could be upholstery. Preserve the ambiguity
  and leave output unknown. Partial visibility can support an estimate when actual
  radiator sections are discernible; vague white shapes alone do not establish one.
- Count sections horizontally separately from columns front-to-back. Output tables
  quote watts per section for a specified height/depth; multiplying by columns again
  overstates output. Label section count, dimensions, material and finish as inferred
  when no measurement or model label exists. Cropping increases the range.
- Use primary manufacturer water-side DT50 tables, not electrical-element wattage.
  Record source URL/date, row and unit. Brand resemblance is not identification.
  Exponent n belongs to the selected analogue; carry each alternative through the
  water-temperature correction before adding emitter outputs within a room.
- A towel frame needs its own small-output analogue, not a panel or column rating.
  Furniture, covers, towels and poor flow can reduce actual delivered heat; these
  estimates assume unobstructed nominal emission and do not bound hydraulic faults.
- Separate radiator identity from room attribution. Do not add the pink bedroom's
  estimated radiator to both possible rooms. Mark lower-ground attribution tentative.
  Unknown inventory is not absence. Catalogue/type ranges are scenario bounds, not
  statistical confidence intervals, and missing emitters may lie outside them.
- Keep photo-derived comparisons distinct from entered catalogue ratings, site
  measurements and approved replacements. Both unknown and photo-estimated rooms
  remain eligible for the budget reserve until the inventory is validated.

Survey capture should record every emitter's room, width/height, section count and
front-to-back column count (or panel/convector count), manufacturer/model where
available, obstructions, valve/pipe sizes, and a front plus side/end photo. Prioritise
large apparent deficits, uncertain assignments and incomplete inventories. Reconcile
room demand assumptions at the same time; avoid solving a geometry error with an
oversized radiator. No new generic image-to-radiator automation is implied by this
reviewed Broom Road adapter.

Regression: `tests/proposal.test.js` checks per-section units, per-variant exponents,
room totals, exclusion of unassigned emitters, overrides and reserve preservation.
`tests/browser-review.cjs browser-proposal.cjs` checks toggle/outputs, evidence image
loading, readable export and phone layout over HTTP and file://.


## Party-wall display mismatch and unresolved glazing — 2026-09-10

The homeowner questioned missing party-wall treatment. Audit the actual surface
schedule before promising a reduction: the proposal already treated 113.8 m² as
party and its 12.192 kW baseline would have been 17.216 kW if those walls were outside.
The separate ASHP geometry review displayed some of those same walls as unclassified.
It now shares `geometryPrep.boundaryHypotheses` with the proposal; explicit edits and
accepted survey evidence retain precedence. Tests cover property isolation and both
browser coordinate frames. A rendered DSM gap is not evidence of air exposure.

A neighbour-facing wall is not necessarily party: distinguish a shared heated wall,
an air gap, an unheated conservatory and partial-height/length contact. OS confirms
mid-terrace connections but does not classify every rear wall. Keep rear contact
uncertain and compare scenarios until contact extent is established. Split partial
contact for the surveyed model instead of assigning the entire run to its warmest
neighbour. Main-party temperature assumptions can create heat gains in cooler rooms;
matching room temperature removes gains as well as losses.

Do not infer single/double glazing from white frames, sash style or distant reflections.
Record observed frame/opening geometry separately from pane count and thermal performance.
Broom Road photos do not resolve spacer/edge details enough for confirmation. EPC
'some double glazing' cannot assign types by room. The call UI now records opening/bay
choices, explicit assumed U-values, who confirmed them and a source note. Homeowner
reports remain separate from survey observations and a product-specific whole-window
rating. Window type changes conduction only; draught assumptions require their own evidence.

`thermal-evidence.json` is the reviewed property adapter; `prepare-proposal.py` regenerates
all option effects through heatloss_engine, archives the prior proposal and fingerprints
OS, aerial, floorplan, photos and thermal evidence. Effects update room/surface results,
radiator needs and budget together. Geometry snapshots are unchanged, and call histories
preserve the new thermal choices. Read PRE-SURVEY-PROPOSAL.md for current audit quantities
and the confirmation workflow. Test joint changes against the engine, not just individual
option deltas. Verify coloured party boundaries and confirmation persistence over HTTP
and file://; generic boundary inference must not leak into other properties.


## Upfront price, BUS and running-cost trade-offs — 2026-09-10

The user directed a roughly 50% reduction in installation allowances and subtraction
of the £7,500 BUS grant. Apply that to gross monetary allowances first; keep the
contingency percentage unchanged, then deduct BUS once. Show gross / assumed grant /
net contribution separately, preserve unknown totals, cap the deduction at cost and
provide a no-grant comparison. This is a user-directed budget, not researched supplier
pricing. Check current official grant values; do not mark eligibility or award as
confirmed. Previous discussion revisions remain archived.

Separate design heat loss (kW), annual useful heat (kWh), purchased electricity (kWh)
and money (£). Until bills and product performance are available, the proposal uses
an explicit editable equivalent-hours proxy plus editable seasonal SPF assumptions.
Do not use a single cold-day COP as annual efficiency or imply that design flow is
maintained year-round. Compare equal heat/comfort across flow settings and require
adequate emitter capacity. Separate hot-water demand/efficiency and auxiliary loads;
avoid counting auxiliaries twice if an actual SPF already includes them. Changing
BUS changes the upfront contribution only, never annual savings.

`operating-assumptions.json` and PRE-SURVEY-PROPOSAL.md define initial values, scope,
sensitivity and reproducible arithmetic. The UI contrasts upfront allowances with
annual electricity cost at 45/50/55°C, keeps assumptions behind details and exports
the full basis. Entered annual useful heat is explicitly independent of subsequent
geometry/scope changes; blank restores the model proxy. EPC primary energy and historic
costs are not converted to design heat or current bills. Refine consumption using
homeowner bills, occupancy, chosen equipment and commissioning evidence.

The survey promise is now part of the page: first check the important uncertainties,
then sit down with the homeowner to agree the approach, options and scope. Agreement
is distinct from technical approval and from the evidence measurements themselves.

## Guided installation, explicit scope and evidence replay — 2026-09-10

The default proposal now leads with household priorities and retains source photos
next to the proposed room changes. `INSTALLATION-JOURNEY.md` describes the shared
project and six-step journey. The technical workbench and guided view must use the
same current choices and room capacity schedule; independent visible budgets are a
regression even when each calculation is internally consistent.

A fixed reserve for four unverified rooms is not a physical installation package.
Name each proposed panel and separate unknown-inventory provisions from observed
absence. Price that exact schedule once. Keeping a radiator means supplementary
capacity if needed, with each new emitter's own exponent. A higher design flow may
reduce panel sizes without reducing the number of changed rooms; do not label the
option “fewer changes” when its schedule does not support that claim.

Record actual survey evidence only. Regression fixtures must stay in isolated
browser profiles and be explicitly labelled synthetic. Complete inventory ratings,
supported adjacency/glazing categories and heating scope can update the current
engine-backed scenarios immediately. Raw area/height measurements need geometry
reconciliation, not proportional scaling of every wall or fictitious recalculation.
Capture those measurements, keep the previous model, and flag the downstream review.

Replay before/after decisions against the exact evidence revision. Imports preserve
incoming history separately, never rewrite an earlier observation under the same ID,
and reject mismatched revisions. A filled survey form, observed construction category,
or selected customer preference does not approve equipment or physical installation.

## Typical radiator change price and existing heating — 2026-09-10

User clarified a typical £300 per radiator change and that most rooms should be
assumed already heated. Use an editable flat supply-and-fitting allowance per
scheduled radiator, before contingency. Do not add the earlier per-watt supply
allowance or separate labour again. Larger sizes may cost the same in this budget;
only a change in scheduled count changes the default emitter price.

Separate heated scope, heating presence and usable output. All 13 spaces remain
in the default heated model; an explicitly cool basement remains outside scope.
Missing radiator imagery means assumed existing heating with unknown output, not
zero output, confirmed adequacy, or a full-room replacement provision. Exclude
unknown inventories from scheduled work until evidence supports a change; retain
them as survey checks and state that additional work may follow. Explicit measured
absence (complete inventory at zero output) still introduces required capacity.

At the unchanged central warm geometry, the current schedules carry 10 / 8 / 8
radiators at 45 / 50 / 55°C, costing £3,000 / £2,400 / £2,400 before contingency.
They concern evidence-indicated changes; the seven unknown room outputs remain
to check. This assumption change does not lower calculated heat loss or validate
low-temperature comfort. Previous project packages and evidence remain preserved.

### Customer-journey consistency checks (2026-09-11)

- Established facts must not reappear as unanswered priority questions merely because
  their counterfactual has a large heat-loss effect. The lower-ground photo
  `35f17817024aeb5a833ac4f0ed4d592a` shows a finished room with a radiator; the user
  confirms regular heating. Keep it in the heated scope. An explicitly selected
  cool scenario needs review, while unknown radiator output remains a separate check.
- A panel promising an installation route must render the route wherever the panel
  appears. Test actual coloured route pixels and route geometry across all journey
  steps, not just that the house renders. Unknown cylinder endpoints must remove the
  connection and explain what is missing. These are indicative hydraulic routes;
  electrical and drainage routes remain unresolved.
- Flat per-radiator allowances can produce identical upfront prices with different
  panel dimensions. Explain the count, rate, size change and running-cost difference;
  do not invent a discount to distinguish options.
- Replay must capture panel dimensions, even when counts and prices are unchanged.
  Keep technical and homeowner survey priorities derived from the same task source.

### Household knowledge must have an explicit downstream use (2026-09-11)

- Do not ask whether the Broom Road lower ground is heated, even as an optional
  homeowner question. It is established living space. Preserve old cool scenarios
  as history; show their conflict and an explicit restore action if one is loaded.
- Store comfort feedback against stable room IDs: cold flag, usage and free-text
  details. These create room-specific comfort checks and appear in room views,
  replay and the recap. They are not measured heat loss, nor permission to exclude
  occasionally used rooms. Check controls, draughts, balancing and emitter output.
- Ask how many people live in the home and about everyday bathing routines. Make
  the answers visible in the hot-water survey brief. They do not currently select
  a cylinder or recalculate annual DHW energy; those require a supported model.
- A homeowner can confirm or correct a listing photo's room attribution. Persist
  this as an append-only, revision-scoped observation; never overwrite the source
  manifest. Apply the assignment to existing identified radiator records once per
  emitter ID, removing it from the previous room. Explicitly unresolved matches
  take precedence over source suggestions. A photo without a numeric estimate
  contributes context only. Repeat photographs do not create additional emitters.
- Room matching does not validate radiator size, manufacturer, output or inventory
  completeness. Entered totals retain precedence; later changes to their photo
  attribution flag inventory review. Replays must show the source photo and the
  matching state before and after correction. Browser checks must actually save
  and correct matches, reload them, and exercise the offline floorplan reference.

### Visual household interaction — 2026-09-11

Prefer visual selection to form filling in the homeowner journey. Use resident
count buttons, illustrated habit cards, photo-backed room cards (label suggested
versus matched imagery), and floor-layout silhouettes where photos are missing.
Photo matching uses a thumbnail strip and room-plan tiles, with a separate save
action so a suggestion is never treated as confirmation. Preserve unresolved
choices, keyboard operation, visible selected states and the evidence history.

Keep optional text for exceptional routines and specific context; reveal it only
when requested. Explain the direct effect in a short caption. Detailed method and
source information can remain in expandable sections and the technical workspace.
These presentation changes must preserve the underlying household and assignment
records, and must not introduce new thermal assumptions.

### Co-design instead of repeated confirmation — 2026-09-11

Match uncertain photos before room-comfort questions. Room-identity confidence is
independent of radiator-size confidence. Supported attributions can skip the help
queue; all remain reviewable. Save advances only after persistence succeeds. A
native modal keeps the image, room choices and save action together; check actual
viewport positions on desktop and phone, not just document overflow.

Capture homeowner radiator photos as append-only room evidence, not complete rated
inventories. Keep appearance and UFH requests separate from the panel benchmark.
Record preferred/avoid outdoor spots as image-space preferences until registered
to a site model and screened. Never present photo markers as feasible siting zones.
See [Homeowner-led design](HOMEOWNER-DESIGN.md) for the intended yard modelling,
product-shortlist and geometry-grounded generative-preview workflow and its limits.

### A room is the unit of homeowner discussion — 2026-09-11

Do not detach preservation, comfort or style preferences from their room evidence.
Use a guided room workspace with the photo, matched/suggested identity, selected
floor-plan region, specific evidence gap and proposed response together. Separate
how the room feels, what evidence would help and the homeowner's preferred approach.
Keep navigation and technical approval distinct: Next room records no observation
and does not close a survey task. Choices persist in the existing replay history.

Derive evidence prompts from current state: unknown output calls for clear radiator
photos; submitted photos await assessment; a valid rated inventory avoids requesting
the same evidence again. Attribution changes that reopen inventory review must also
reopen the guidance. Unknown output must never imply an absent radiator or an
automatic replacement. Keep cylinder/storage exclusions with equipment locations.
Verify next-room/reset behaviour, photo changes, saved room preferences and uploads,
as well as desktop and phone context, over HTTP and file URLs.

### Inventory status and evidence capture

A survey inventory remains current only while its rating matches the recorded
survey and no subsequent radiator evidence or changed room attribution requires
review. Confirming an unchanged room identity does not invalidate that inventory.
A complete survey inventory recorded after submitted photos resolves their output
assessment; preserve the original photos and earlier status in the evidence history.
Use distinct wording for photo estimates, homeowner-reported ratings, recorded
survey inventories and confirmed absence of emitters.

Keep unsaved photo selections and measurements attached to their room while moving
through the walkthrough. Save errors must appear beside the active capture or
matching controls, and must not advance the queue. A successful photo save clears
that draft. Radiator records group photos and optional dimensions for one physical
radiator; a complete room rating still requires accounting for every emitter.

### Saved discussions and revision recovery

A newly generated proposal must not hide earlier discussions. The installation
store lists earlier projects for the same property, exposes their recorded event
and observation summaries, and downloads the original data without changing its
revision or applying it to the current model. A changed room identity, assumption
or source still needs review before migration; downloading is recovery, not migration.
Unreadable records remain downloadable and unrelated properties stay out of the list.

Distinguish starting assumptions from successfully persisted answers. Storage is
browser/device/origin scoped; the interface must explain export for handoff and
backup. Evidence forms keep their selections during in-page navigation, but warn
before leaving with unfinished entries. This warning is a safeguard, not durable
draft storage. Mobile browsers can terminate pages without a beforeunload event.

Verify same-property archive discovery over HTTP and file URLs, exact raw recovery,
rejection of cross-revision application, and stale-tab protection. Run
`tests/installation-store.test.js` alongside the installation and browser suites.

### Selective room conversations and explicit answers

The homeowner entry must explain the proposed collaboration before asking for
household data. Offer the starting options and a visual room chooser. Focus prompts
on comfort concerns, missing output evidence and estimates that could change a
replacement decision; stop asking for the same photos while assessment is pending.
All rooms and all topics stay accessible. Moving to another room neither records
an answer nor completes a survey check.

Default false/neutral values must not appear as homeowner confirmations. Optional
answer markers distinguish an explicit comfortable/usual/open-to-change response
from an untouched default and travel with household snapshots in the existing
replay. Legacy affirmative preferences remain visible; do not infer a neutral
answer from old default values. These markers do not alter heating scope or demand.

### Remote assessment, site evidence and the joint review

Keep remote advisers and site surveyors distinct in presentation and attribution.
The role switch is not authentication. `adviser` observations retain remote
provenance; complete sourced ratings can update scenarios, but only current site
inventories close site validation. Remote wall/glazing assessments remain working
assumptions. An explicit homeowner report remains a separate evidence type.

Display existing records next to the relevant task, including grouped radiator
photos, optional dimensions, source role/date and homeowner preferences. General
geometry and service checks must expose measurements recorded for their component
rooms/locations. Inspect the source image at a useful size before asking for repeat
capture. Uploaded review copies are not original images or automatically rated
emitters. Evidence notes do not close a technical check merely because they exist.

Saving a finding should keep the surveyor in their work and explain the calculation
effect. Raw geometry/access evidence can leave quantities unchanged. The review
conversation compares current metrics with the remote starting point, records
participants and a preferred direction or open questions, and retains the exact
choices and evidence position in append-only history. Later changes require another
conversation. No discussion outcome sets technical approval or confirms a quotation.

The portable recap includes all outstanding checks and embedded evidence, with
native expandable photographs that work without app scripts. Inspect the exported
HTML as well as the live page. See [the journey review](JOURNEY-REVIEW.md) for the
three-role findings, answer-effect trace, browser coverage and remaining limits.

Remote photo assessment and site inventory verification are separate completion
states. A complete, sourced remote rating resolves the received-photo assessment
request while retaining the site-inventory check. Later photos or changed room
attribution reopen assessment. Replaying the earlier state must recover both the
rating and its then-current review status.


### Visible room assumptions and independent improvement scenarios — 2026-09-11

Break the room result into walls, windows, doors, floors, ceilings/roof, air changes
and junction allowance. Retain signed transfers between differently heated rooms;
an internal floor is the lower room's ceiling and the upper room's floor. The
parts reconcile with the unclamped room result. A shared-surface U correction
must affect both sides with equal and opposite transfer, preserving whole-home
conservation. Null/excluded outputs remain distinct from zero.

Separate current construction corrections from future improvements. Corrections
retain attribution, append observations and update demand. A homeowner’s selected
answer is itself a homeowner report; a typed explanation is optional. Professional
assessments still require their supporting source. Improvement
targets belong to household scenarios; they show demand and emitter-capacity gaps
without silently changing the existing-home schedule or price. Newer opening-group
answers supersede older per-opening U values, with both retained in replay. Geometry,
adjacent-space temperatures and junction allowances are not changed by a U override.
Unverified U entries must reach the relevant room's survey task and evidence view.

Select assumptions through recorded geometry, not an approximate screen region.
Internal and external walls use different stored coordinate representations; apply
the model's anchor/bearing conversion only where local edges are absent. Verify
all rooms and a real projected browser click. Transparent walls must not intercept
a visibly selectable opening. Label schematic floor/ceiling highlighting; never
present its display polygon as a new measured area or adjacency determination.

Radiator identity is independent of photo count. Show source hypotheses, allow
correction or addition with dimensions/type, and attach multiple photographs to
one item or leave them as unresolved room evidence. Unsupported catalogue sizes
or types keep unknown output. A partly checked list cannot supply a complete room
total; an explicitly complete empty list can report absence. Individual corrections
reopen previous aggregate ratings while retaining immutable observations. Reported
completeness is distinct from a verified site inventory.

Inspect desktop and phone screenshots of the selected assumption, radiator editor,
photo upload, improvement result and role handoff. Long lists can push the
consequence out of sight even when the page fits horizontally; keep selectors
compact and the active form visible. Active journey topics use no accordions.
Run the room-assessment, planning, installation/store/proposal and HTTP/file browser
suites documented in ROOM-LED-PLANNING.md. Regenerate the proposal after JS changes,
preserve earlier proposal archives, and verify source hashes before committing.


### Homeowner answers must not require a justification — 2026-09-11

Do not block an ordinary homeowner answer with a required evidence/source text
field. For room boundaries and current glazing/U-value corrections, optional notes
supplement the selected answer. Record role, time, target and the actual response
automatically; explicitly retain “supporting source not supplied” for an unsourced
U entry. Never describe this as measured or site verified. “Not sure” must save
without an explanation and reopen review. Use everyday boundary labels for the
homeowner; assumed adjoining temperatures and geometry-split instructions belong
to the professional assessment. Keep drafts role-scoped so professional evidence
requirements cannot be replaced by a cached homeowner form. Verify blank-note
submission, uncertainty reopening, role switching and phone/HTTP/offline behaviour.

### Shared spatial journey (11 September 2026)

Equipment descriptions alone do not locate an installation. The guided journey now
uses the model floor plan for existing boiler/cylinder/electrical positions,
proposed heat-pump/cylinder positions, radiator identities and paths to keep clear.
`spatial.js` validates property-local positions against stable floor and room IDs;
renderers derive scene positions from those records. Lower ground retains floor ID 2.
A plan click is a reported/preferred approximate position, not a measured mounting
height or approval. Unknown height stays null; 3D uses a stated display height.
Existing text-only observations and photo-space preferences remain evidence without
being silently converted to model coordinates. Service corrections and placements
are append-only; walking-path revisions retain earlier snapshots.

Custom proposed locations update a simple orthogonal connection sketch and its
indicative length allowance. This is not an obstacle-aware pipe design, clearance,
noise assessment or electrical route. Existing boiler/meter markers identify
connections to investigate, not proven usable routes. Surroundings are a planning
canvas with unresolved boundaries and garden levels. Room plans and cutaways share
surface IDs and radiator positions; survey/review and exported recaps retain the plan.

Verified with `spatial.test.js`, proposal/installation/room-assessment tests and
`browser-review.cjs browser-room-assessment.cjs browser-spatial.cjs`. The browser
checks use actual projected plan clicks, assert plan/3D coordinate parity, move
between floors, check changing route length, preserve replay and reload, and run
under HTTP and network-disabled file URLs at desktop and phone sizes. Screenshot
review remains necessary: tests do not establish legibility or a useful sequence.
