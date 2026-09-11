# Heat-pump homeowner journey: review brief

This is the current product brief for a fresh review of the Broom Road journey.
Use the running application and source evidence to assess the experience independently.
Existing screens, step names and layouts are implementation choices, not requirements.

## Implemented review and current verification

Read [JOURNEY-REVIEW.md](JOURNEY-REVIEW.md) for the independent three-role findings,
implemented changes, answer-effect trace and remaining limits. The current
room-led extension is documented in [ROOM-LED-PLANNING.md](ROOM-LED-PLANNING.md).
Navigation follows Your home, Your rooms, Equipment & routes, Costs & payments,
Checks & survey, Review together. Each room keeps its photos and plan beside five
optional topics: Room & heat loss, My radiators, Flow & output, Options and Comfort.
Existing construction and proposed improvements have distinct consequences.
Service evidence, gas discussion, illustrative payments and a scoped document
register feed the adviser brief, site check and joint review. Earlier saved projects
remain recoverable without automatic migration; no form or review issues approval.

## Purpose and intended relationship

Before the site survey, a customer-operations colleague calls the homeowner with an
informed, visual proposal: what we understand about the home, its likely heating
needs, possible radiator changes, equipment locations, routes, installation budget
and running costs. The homeowner helps correct the evidence and shape the design.
The survey resolves the uncertainties that matter most. At the visit, the surveyor
and homeowner sit down together, explain what changed, and agree the approach.

The experience should feel like designing an installation together, not filling in
an engineering questionnaire or approving an opaque AI result. The system should do
as much interpretation as it can, state its assumptions and ask focused questions
only where the homeowner's answer has a useful consequence.

The homeowner may happily walk around, photograph missing radiators or take a few
measurements. They care about attractive radiators, may consider underfloor heating,
and want substantial say over the outdoor unit, cylinder and visible pipework.
Appearance, disruption, available space, installation cost and running cost belong
in the same conversation. Do not reduce preference to choosing a flow temperature.

## Product principles

- Recognise the house first. Use listing photos and the floorplan throughout.
  Establish uncertain photo-to-room matches before asking about room comfort.
- Don't ask for repeated confirmation of supported identities. Make every match
  inspectable and overrideable. Room identity confidence is separate from output,
  dimension, geometry and installation-feasibility confidence.
- A room is the unit of conversation: what we think, how it feels, what evidence
  would help, what the homeowner likes, possible solutions and their implications.
  Avoid detached, house-wide preservation checklists.
- Prefer image-backed choices and short visual tasks. Text fields are for useful
  exceptions and context. Keep the evidence, question and next action together.
- Saving should be clear and reliable. Advancing should not require repeated clicks
  or scrolling back to find the next control. Navigation does not approve a design.
- Show what an answer changes: calculation, survey task, preference, or pending
  assessment. Do not pretend all answers immediately recalculate engineering.
- Unknown means unknown. It does not mean zero output, absent heating, no heat loss,
  no price risk, or a reason to replace equipment automatically.
- Keep source observations, inferred geometry, homeowner preferences, survey
  measurements and approved design decisions distinct and traceable.
- Record geometry reconstruction and subsequent design/evidence changes so they
  can be replayed alongside the evidence. Do not fabricate a reconstruction log.
- Product copy and comments should explain what a homeowner or surveyor needs to
  know. Avoid development history, references to this conversation or claims that
  something has just been fixed. Keep detailed implementation history in Git.

## Established Broom Road assumptions and evidence

- The lower ground is regular, occupied, heated living space. It must not be a
  homeowner question asking whether to heat it. Most occupied rooms are assumed
  to have heating even when their emitters are not visible in the photographs.
- Main neighbour-facing party-wall assumptions are in the thermal model. Partial
  contact and rear extension adjacency remain distinct questions; don't label
  every side wall fully party simply because another building is nearby.
- Glazing can vary by opening. Use photos where informative and targeted homeowner
  or survey confirmation otherwise. The EPC alone does not prove every pane type.
- The latest exact-address EPC for number 3 is extracted from the postcode records.
  EPC area and inferred geometry coverage differ; do not scale the house to force
  agreement. Room dimensions, boundaries and volumes remain provisional.
- The exterior reconstruction combines aerial imagery, DSM, raw OS building/site
  data, listing photos, floorplan, and Marigold depth/normal evidence. Both rear
  extensions are mono-pitch. Keep per-elevation validation visible; a good front
  fit does not establish a good rear fit. Read the reconstruction workflow for
  retained camera/check failures before changing geometry.
- Monocular depth and normals are supporting evidence, not reliable metric survey
  dimensions by themselves. OS site extent is not legal ownership; roof outlines
  are not internal room boundaries.
- The current emitter benchmark is £300 per radiator change/addition, including
  supply and fitting, with editable allowances. Do not reintroduce a large blanket
  radiator reserve. The £7,500 BUS grant is an assumed, unconfirmed deduction.
- Attractive products and UFH require their own output, fit, disruption and cost
  assessment. Current standard-panel estimates are not prices for designer products.

## What the application actually does

Entry points, relative to the served `solar-visualiser/` directory:

- `proposal.html`: homeowner/adviser journey.
- `proposal.html?view=technical`: detailed assumptions and calculation workbench.
- `index.html?property=3broomroad&mode=ashp`: house geometry workbench.
- `replay.html`: geometry reconstruction with source evidence.
- `survey.html`: broader survey evidence recorder; its legacy packet is not silently
  merged into the installation project's typed observation pathway.

The current sequence and calculation boundaries are described in
[ROOM-LED-PLANNING.md](ROOM-LED-PLANNING.md). Matching starts in Your home and remains
available in each room. Five optional room topics connect evidence, heat loss,
existing output, improvements and comfort. Existing screens are still open to
review; their presence does not make them a product requirement.

Implemented capabilities:

- Supported photo identities skip the help queue. Uncertain images use a modal
  with room choices, explicit save-and-next, deferral, and an all-matches view.
  Correcting a room's photo opens the image currently being discussed.
- Room photos, inferred floor layout and original floorplan reference accompany
  comfort, routine, evidence and heating preferences. On phones a compact header
  identifies the active room. Next room starts the next room's discussion.
- Cold-room reports create named survey checks. Household size and everyday
  bathing habits form a hot-water brief. Neither automatically changes thermal
  demand, selects a cylinder or recalculates annual hot-water consumption.
- Users can retain existing radiators and choose panel, column, vertical, UFH or
  open preferences. Known retained output reduces proposed supplementary capacity.
  Unknown output stays an unresolved inventory with no automatic replacement budget.
- One radiator evidence record groups up to three photos and optional dimensions.
  Front and side photos can describe the same physical emitter. Homeowner uploads
  accept JPEG/PNG/WebP up to 15 MB each and save a resized review copy locally;
  these are not automatically converted into numerical output ratings.
- Unsubmitted evidence forms retain photos and values while navigating within the
  loaded page, scoped to their room/task. They are not durable drafts across reload.
  A successful submission clears its draft. Failed saves do not advance matching.
- A complete, sourced survey inventory can update the calculated rating. New
  radiator evidence or changed room attribution reopens its review. An unchanged
  attribution confirmation does not. Later inventory assessment resolves the photos'
  pending output check. Earlier evidence and state remain replayable.
- Front/rear photo markers express preferred and keep-clear spots. These are image
  coordinates, not validated physical locations; they do not reposition the 3D unit
  or change its route. Existing courtyard/garden and utility/kitchen route options
  are separate, indicative choices. Excluding a kitchen cylinder flags conflicts.
- The model can display the indicative hydraulic route. Electrical and drainage
  routes, access and siting remain to check. An unresolved cylinder means no invented
  hydraulic connection or installation total.
- The guided and technical views share one installation project. Measurements of
  room geometry flag a rebuild; entering them does not itself create new geometry.
- Actual changes, observations and household preferences can be replayed. There
  are an HTML homeowner recap and a full JSON export/import path.

## Numerical baseline: diagnostic reference, not a target

At the unedited proposal revision `f87b713034eec618`:

| Flow | Model heat demand | Proposed changes/additions | Unknown inventories | Net allowance | Annual cost scenario |
| --- | --- | --- | --- | --- | --- |
| 45°C | 12.192 kW | 10 | 7 | £3,379 | about £1,828 |
| 50°C | 12.192 kW | 8 | 7 | £2,689 | about £1,961 |
| 55°C | 12.192 kW | 8 | 7 | £2,689 | about £2,120 |

50°C and 55°C have equal upfront allowances because both price eight changes at
one flat rate. The 55°C sizing envelopes are smaller and its assumed running cost
is higher. Do not invent a price difference to make the cards look different.
Demand and prices are provisional; uncertainty can add scope. Annual costs use an
editable useful-heat/SPF/tariff model and assume sufficient emitter capacity after
survey. These are not selected-equipment performance predictions or quotations.

## Important limits and next product layers

Not implemented: an actual product shortlist; dimensionally grounded in-room AI
previews; validated front/back yard geometry and siting zones; complete service
route graphs; automatic engineering interpretation of newly uploaded photos;
cloud storage, homeowner invitations, adviser access control or shared calls.
The role switch changes presentation/default attribution, not authentication.

The intended next layers are:

1. A spatial site model around the house: openings, boundaries, neighbours, paths,
   levels, access, drains and services. Register homeowner preferences to it, then
   screen equipment candidates with explicit evidence and reasons for exclusions.
2. Real emitter/product options with finish, dimensions, output curves, wall fit,
   pipe constraints and installed cost. Evaluate UFH as its own system.
3. Previews anchored to source photos, calibrated cameras, actual product dimensions
   and placement. Render the dimensional geometry first; use image generation for
   appearance if useful. Generated images must not invent clearance or alter the
   house to make equipment fit. Preserve original/render/styled versions separately.
4. Prioritised survey capture feeding reviewed model revisions and recalculation,
   followed by a clear remote-to-surveyed comparison and homeowner agreement.
5. Generic dataset intake plus reviewed reconstruction adapters and evaluations.
   Broom Road is a working example, not proof that any address reconstructs reliably.

Read `HOMEOWNER-DESIGN.md` for the site/product/preview direction and `WORKFLOW.md`
for evidence and reconstruction contracts.

## Fresh review priorities

Start as a homeowner with a fresh project, then as an adviser preparing the call,
then as a surveyor resolving the remaining gaps. Check the actual screens and effects.

- Does the journey explain the proposition before asking for work? Is there a clear
  next action? Does the homeowner see the benefit of answering each question?
- Are six top-level steps plus three stages for every room too laborious? Can the
  system focus on consequential gaps while leaving all rooms accessible?
- Are defaults visibly assumptions, rather than implied homeowner confirmations?
  Does every important preference change the brief, scenario or visible next step?
- Are photos and plans large/useful enough? Can users inspect evidence and compare
  choices without losing context, especially on a phone or a small laptop?
- Are equipment pins, route options and style sketches sufficiently connected to
  the decisions, without implying that an unimplemented feasibility check occurred?
- Are budget uncertainty, grant assumptions, unknown outputs and running-cost
  trade-offs clear without overwhelming the homeowner with repeated caveats?
- Can a homeowner contribute useful evidence without technical knowledge? Can the
  surveyor assess it efficiently and avoid asking for the same information twice?
- Can someone resume after reload or a release? Projects are currently keyed by
  property and evidence revision; all building JS participates in that revision.
  A code update can therefore open a new project while the old one remains stored.
  Cross-revision import requires review and is rejected today. Assess recovery and
  continuity explicitly; don't silently relabel an old project as a new revision.
- Browser/origin/device storage is local and can fill up. Assess whether saving,
  export, unfinished drafts and the distinction from cloud collaboration are clear.
- Are the homeowner recap and survey handoff sufficient to continue the real job?
  Is the difference between a preference, an unresolved check and agreement clear?

Treat these as review questions, not already diagnosed failures. Inspect, reproduce,
prioritise and fix worthwhile issues. Don't defend the current design merely because
it exists, and don't manufacture new engineering certainty to improve the presentation.

## Working map and verification

Read `AGENTS.md`, `solar-visualiser/CLAUDE.md` and `WORKFLOW.md` before implementation.
Key files under `solar-visualiser/`:

- `js/building/installation.js`: pure project, evidence, schedules, guidance, replay.
- `js/building/installation-ui.js`: guided screens, matching and capture.
- `js/building/installation-store.js`: scoped storage and stale-tab protection.
- `js/building/proposal.js`, `proposal-ui.js`, `proposal-view.js`: calculation choices,
  technical view and 3D scene/route.
- `css/installation.css`, `proposal.html`: presentation and script order.
- `scripts/prepare-proposal.py`: generated bundle, provenance and revision archive.
- `3broomroad-data/`: source evidence and generated proposal/reconstruction artifacts.

Keep classic scripts and `window.SolarViz`; no build step or ES modules. Keep pure
modules free of DOM/THREE. Use `SolarViz.imageUrl` for offline imagery and pixel
consumers. Persist edits/preferences, not derived geometry. Source manifests remain
suggestions; user assignments and evidence are separate append-only records.

Run commands from the repository root:

```sh
/tmp/broom-reconstruction-env/bin/python solar-visualiser/scripts/prepare-proposal.py
node solar-visualiser/tests/installation.test.js
node solar-visualiser/tests/proposal.test.js
/tmp/broom-reconstruction-env/bin/python solar-visualiser/scripts/test_proposal.py
node solar-visualiser/tests/browser-review.cjs browser-installation.cjs browser-proposal.cjs
```

The Python environment path is machine-specific; verify it exists. Regenerate after
building-JS changes; never hand-edit bundles. Browser suites use isolated profiles
and check HTTP/file URLs, real input/click handling, mobile layout, drafts, uploads,
matching errors, replay and shared workbench state. Inspect screenshots as well as
assertions. For reconstruction/survey changes also run the suites listed in AGENTS.

Recent commits: `b128895` (guided room design), `859efbf` (Vercel static output),
`08d3256` (draft/evidence consistency review). Read current Git state before editing.
Make incremental commits after meaningful, verified changes; preserve unrelated edits.

Vercel: root `vercel.json` serves `solar-visualiser/`, with no install/build command.
The project Root Directory should remain empty/default. Commit/push/redeploy is needed
to update hosting; a successful local check does not verify a live deployment.
