# Guided installation project

`proposal.html` now starts with the household. The six steps are priorities, plan,
room changes, equipment spaces, survey, and recorded changes. The technical
workbench remains available at `proposal.html?view=technical`. Both use one
property/evidence-revision-scoped installation project. The homeowner and adviser
switch changes the presentation and default evidence role; it is not authentication
or a multi-user collaboration service.

## What this pass delivers

- Household priorities suggest a starting flow option. Preserved radiators receive
  supplementary capacity rather than replacement when their output is known.
  Excluding kitchen cylinder space disables that option and flags an existing conflict.
  Room-specific comfort and hot-water answers generate named survey checks, not
  invented changes to room temperatures or an automatic cylinder selection.
- Three explicit room schedules at 45/50/55°C. Known/estimated retained output is
  compared against room load; an unknown inventory assumes existing heating with unresolved output. It gets
  no automatic replacement or fabricated capacity. Occupied rooms remain in the
  heated scope; explicit cool-basement choices and measured absence still win.
- Proposed sizes use the already sourced 600 mm Type 22 analogue, 1,732 W/metre at
  DT50 and n=1.33, in 100 mm sizing increments, 400–2,000 mm per panel. These are
  physical sizing envelopes, NOT validated product SKUs or verified installation fit.
  Multiple panels cover larger requirements. Existing retained emitters use their
  own exponents; supplementary panels use the new-panel exponent.
- Budget = existing base/route allowances + £300 per scheduled radiator change
  or addition (supply and fitting), then contingency and the assumed grant.
  `rates.radiatorChange` is editable; per-watt supply is not added on top. The former
  four-room reserve is not added again. Both guided and technical views use this
  schedule, while the pure proposal module retains its legacy calculation for old
  consumers. Unknown outputs remain unpriced checks; later evidence can add work. Existing
  heating does not prove adequate low-temperature output. Annual-cost comparisons
  remain conditional on adequate capacity.
- Specific checks with source-photo regions, owner, method and an impact/effort
  heuristic. Emitter scores use room demand, not an estimated heat-loss reduction.
  Wall/glazing scores are whole-house scenario differences, not probability scores.
  Geometry and service checks remain required irrespective of this optional ranking.
- Complete-room radiator ratings, supported wall/glazing categories and basement
  scope observations immediately update the shared proposal choices, calculations,
  option schedules and prices. Preserve who, when, role, note and supporting images.
  Radiator capture requires a complete inventory and a source for combined DT50
  output and equivalent exponent; it does not infer a manufacturer from a photograph.
- Net-area/clear-height measurements and equipment-access observations are captured
  but do not invent a new mesh or certify a route. Geometry observations flag a
  pending rebuild. Existing `survey.html` remains the broader evidence recorder;
  its legacy packet is not silently imported into this typed decision pathway.
- Actual project events can be stepped or played, including before/after room
  schedules and quantities. Replay is read-only. No synthetic survey event is
  installed in the real property. Original geometry replay remains linked and unchanged.
- Standalone homeowner HTML recap and full JSON export, local persistence, shared
  technical workbench state, optimistic same-origin tab conflict detection. Imports
  reject mismatched property/evidence revisions, preserve earlier observations,
  reject conflicting observation IDs and archive incoming history as its own lineage.

## State and dependencies

`installation.js` is pure UMD and delegates thermal calculations to `proposal.js`
and its generated Python-engine option effects. `installation-store.js` stores the
canonical project under `kelp:installation:<property>:<evidence revision>`. A legacy
same-revision proposal may seed a project; older revisions are left intact.
`installation-ui.js` owns the guided UI; `proposal-ui.js` owns the technical view.
Both use the same store. They do not write source observations or generated bundles.

Each event retains complete before/after choices, household constraints, observation
prefix lengths, outcome metrics and the exact evidence revision. Images live with
observations (up to three 1 MB JPEG/PNG/WebP files per record). Storage failure leaves
the prior project intact. Local storage is device/browser/origin scoped, not cloud
sync; HTTP and file sessions can have separate projects. Export for transfer.

`prepare-proposal.py` fingerprints all building JS, so regenerate after changes.
Historical proposal packages remain available. A future migration needs an explicit
comparison of changed source identities and assumptions; don't force an old project
onto a new geometry revision.

## Required checks

```
python scripts/prepare-proposal.py
node tests/installation.test.js
node tests/proposal.test.js
python scripts/test_proposal.py
node tests/browser-review.cjs browser-installation.cjs
node tests/browser-review.cjs browser-proposal.cjs
```

Browser fixtures simulate a labelled test observation in an isolated Chrome profile.
They test HTTP and file, phone/DPR2, preferences, capacity updates, replay, reload and
two-way workbench state. These fixtures are not real survey measurements.

## Next releases

1. Feed validated geometry measurements into a rebuilt canonical model with room and
   surface identity reconciliation, engine rerun and geometry/evidence replay. Do not
   scale all surfaces from a floor-area ratio or silently treat gross areas as net.
2. Actual product catalogue, physical wall/access constraints, heat-pump performance,
   cylinder duty, hydraulic/electrical/drain route graphs and a company scope/rate card.
3. Rich per-emitter capture with measured dimensions and multiple distinct catalogue
   curves per room, allowing photo-to-room attribution corrections without duplication.
4. Bill-calibrated energy modelling and genuinely constraint-based design alternatives;
   current priority-to-flow suggestion is a transparent heuristic, not an optimiser.
5. Cross-device co-browsing, server-side persistence, adviser permissions and consented
   call integration. Generic dataset ingestion still needs reviewed adapters and an
   evaluation set; this Broom Road journey is not a generic reconstruction service.

## Consistency pass — 2026-09-11

The lower ground remains heated in the starting calculation, supported by its room
photo and the user's confirmation. It is an established scope statement rather than
a mandatory question; the homeowner heating-scope alternatives have now been removed (see the follow-up below).
The route panel displays services on every step and opens on the rear view. Its
caption distinguishes a proposed hydraulic connection from unresolved electrical and
drainage routes; removing the cylinder location removes the connection and price.

At the starting assumptions, 50°C and 55°C both schedule eight radiator changes at
£300 each, so the upfront allowance is the same. The comparison explains the smaller
55°C panel dimensions and higher annual running-cost scenario. Size changes are now
recorded in replay metrics even when prices and panel counts match. Regression checks
cover these cases, actual route pixels on all six steps, and both HTTP and file URLs.

## Household follow-up — 2026-09-11

The priorities page no longer asks about lower-ground heating. The optional scope
question was itself a mistake. A saved cool scenario is flagged as a conflict with
the established heated home and can be explicitly restored; history is preserved.

Cold-room checkboxes, usage and notes are stored in `household.roomFeedback` against
room IDs. They create specific comfort tasks, appear on room cards and the exported
recap, and can be replayed. Resident count and selected everyday hot-water habits
feed a dedicated cylinder/recovery survey brief. Annual DHW energy still uses the
separate editable assumption; the UI makes this limitation explicit.

`interiorPhotos` in the generated proposal identifies matchable source images.
`choices.photoRooms` uses image IDs and source room IDs (or null for unresolved).
`photo-room` observations record every confirmation/correction. The pure proposal
logic moves existing emitter hypotheses between rooms without duplicating them.
Photos with no emitter hypothesis only add room context. An existing complete
entered rating is not silently overwritten; later attribution changes reopen its
inventory review. Matching never claims that a photo estimate has become measured.

The matching interface has previous/next navigation, room suggestions, explicit
save, an unresolved choice and an offline listing-floorplan reference. The replay
includes the matched photo; imports, exports, reload and the technical workbench
share the same assignments. Regression tests cover corrections, unknown outputs,
source immutability, no double counting, and room-scoped household feedback.

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

## Focused matching and homeowner design — 2026-09-11

Matching precedes comfort. `photoMatches` distinguishes automatic (supported
source attribution), needs-help, matched and deferred. A small uncertainty queue
opens in a native modal with image/choices side by side, persistent actions and
save-and-advance; all matches can be reviewed and overridden. Explicit deferrals
stay out of the queue. Automatic room identity never increases output confidence.

Your rooms accepts `radiator-evidence` uploads with optional measured width
and height; the typed evidence is captured without requiring an output rating or
changing the calculation. Review copies are resized locally through the offline
image resolver. `household.roomDesign` captures preferred style/UFH investigations;
`household.sitePreferences` captures normalised front/rear preferred/avoid photo
markers. Both create design checks and remain separate from selected products,
engineering constraints, 3D route selection and priced scope. See
[HOMEOWNER-DESIGN.md](HOMEOWNER-DESIGN.md) for the broader design and preview plan.

The Your rooms step uses the full page for a guided room walkthrough. Listing
photos and the selected floor layout sit beside three small stages: comfort/routine,
evidence request and heating approach. Users can jump between rooms, correct photo
matches, submit radiator photos, retain existing emitters and choose a style or UFH.
Next room advances without asserting technical completion. On phones, a compact
room-photo header keeps the active room identifiable while answering questions.
`installation.roomGuide` derives prompts from evidence status; received photos do
not become verified wattages. Kitchen cylinder exclusion lives in Places & routes.
