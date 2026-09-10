# Room geometry and envelope preparation

The current goal is geometry ready for a later heat-loss calculation. The ASHP
workbench has no temperature, U-value, ventilation or heat-demand controls.
Open `index.html?property=3broomroad&mode=ashp`. The sidebar has three tasks: **House**, **Rooms** and **Survey**. Specialist editors are inside expandable sections.

## Remote → site-refined

1. **Build the working model.** In **House**, choose **Build house & rooms** if
   the reconstructed exterior is not already loaded. This creates the exterior,
   provisional lower ground and mapped rooms together. Existing reconstructed
   models acquire missing room layouts automatically on load. Manual layouts are
   preserved. Replacing an edited model remains an explicit rebuild action.
2. **Review the remote rooms.** In **Rooms**, select a floor. Broom Road maps
   thirteen spaces across three floors without individual imports or approvals.
   Choose **Review room boundaries…** to check internal area, maximum spans,
   mean clear height and air volume, and record heated/unheated/unknown use.
   Record the source, remote confidence and a working uncertainty allowance.
3. **Classify the envelope.** Identify external, party, ground-contact and unheated
   boundaries. Shared room adjacency is derived from partitions and floors.
   Colour-coded room outlines locate wall segments; click one to edit it. Keep
   missing classifications unknown. A party wall is not automatically adiabatic.
   **Use geometry-based boundary guesses** explicitly applies low-confidence
   outside hypotheses to roof surfaces and walls with openings. It does not infer
   party walls from an absence of windows, or assume a floor is ground-contact.
4. **Save a remote snapshot for survey.** The snapshot retains the working model
   inputs, room/boundary estimates and geometry signature. Observations reference
   this snapshot; subsequent remote edits require a new snapshot. No 3D mesh is
   stored as authoritative state.
5. **Inspect Priority site checks.** The first six checks emphasise missing levels,
   uncertain rear extent, undivided floors and unknown party/external boundaries.
   Smaller dimension checks follow, ranked using size × declared uncertainty.
   Collinear wall fragments are grouped into one run. Remaining checks are available
   below; this is geometry triage, not a numerical heat-loss sensitivity analysis.
6. **Record, compare, then accept.** Record one dimension or boundary observation
   with observer, date, method and a photo/sketch/reference. Recording alone does
   not replace the remote estimate. Review remote → observed values and explicitly
   accept or reject the correction. A whole collinear wall run can share one boundary
   observation only when the surveyor checks the corresponding box. Inaccessible
   items remain unresolved. Both observations and review decisions are append-only.
7. **Refine as evidence arrives.** The quantity schedule becomes **site-refined**
   when corrections are accepted. Only the observed fields are site-checked: checking
   one ceiling does not validate a room's area, boundaries or the rest of the house.
   Area/mean-height corrections update volume unless an explicit volume observation
   is accepted. Measured maximum length/width are not multiplied into area for an
   irregular room. Accepted numeric corrections update the schedule, not the mesh;
   use the room/roof editor to reconcile the actual 3D shape where necessary.

Geometry edits invalidate incompatible assignments and survey application. Earlier
snapshots and observations remain available; start a new draft and confirm the
relevant evidence against the new target. Reuse existing survey references when
appropriate rather than asking for a redundant site visit. Model restore/import
retains geometry survey history. No action promotes the whole property to surveyed.

## Reasonable initial guesses and their limits

Working-room quantities start from the exterior shell and floor settings. Those
are **gross geometry estimates**, including construction thickness and potentially
roof overhang. Maximum spans come from the room polygon's principal edge direction;
area comes from the polygon, and volume from the roof/floor geometry. Use the room
fields for explicit internal-area and clear-height estimates. The default 20%
uncertainty is an editable planning allowance, not a measured confidence interval.

**Listing-plan estimates** contains all twelve Broom Road plan rooms, including
four lower-ground rooms. Polygon area uses a median scale from the printed maximum
dimensions on each level. Volume uses an explicit initial 2.6 m clear-height
assumption. This gives a starting schedule for remote review without turning the
printed maximum dimensions into rectangular room areas. Confidence stays low.
Choose a plan room in an already divided model room, then explicitly apply its
estimate. These independently scaled estimates remain separate from the automatically mapped 3D partitions.
Plan scale, irregular corners, stairs and heights need checking.

The adopted exterior still has inferred scale, upper-wing ambiguity and an OS/plan
footprint disagreement. The basement volume and window now participate in the model, with an assumed
depth and main-house extent. The extension rooflight remains unassigned. Failed
automatic mappings remain explicit coverage checks; they are not silently turned
into complete room schedules.
Neighbour heating conditions and fabric properties are for a later stage.

## Survey effort: check what changes the model

Check envelope topology before minor dimensions: whether the basement is heated,
which wall extent actually adjoins a neighbour, whether a ceiling bounds loft or
roof, and where rear extensions meet. Confirm a reliable plan scale and representative
ceiling heights. Measure unusual slopes, recesses and large glazing before small
opening details. A site check should capture a specific value and evidence reference;
"house checked" is not a useful observation.

The broader `survey.html` retains OS/source provenance, room/emitter observations,
service hypotheses and homeowner preferences. Its evidence is separate from this
geometry-specific review packet and is not automatically applied. Use its photo or
survey record IDs as references when confirming a geometry correction. Coverage
issues close only when the model/evidence actually resolves them, not when a generic
survey form is completed.

## Save and exchange

Inputs save locally per property. **Export geometry review** contains the derived
current geometry, remote/current quantity comparison, coverage, priority checks and
review packet. **Import observations** merges new events against identical saved
remote snapshots, leaves model inputs unchanged, and requires local acceptance.
Wrong-property, conflicting-ID and unknown-baseline packets are rejected. To work
on another computer, first transfer the normal **building model JSON**, then use
geometry-review packets for new observations. Full model restore/import retains
existing survey history; source files and reconstruction stages remain unchanged.

The earlier experimental heat-loss arithmetic remains an unused pure-module API
for compatibility with its tests and existing exports. It is not called by the
current workbench; existing `thermal` inputs are not used for geometry review.

## Verification

Run `tests/geometry-prep.test.js` for immutable snapshots, explicit corrections,
field-specific verification, stale geometry, history-preserving restores, import
conflicts and plan estimates. `tests/heat-loss.test.js` also checks the reused
geometry quantities, opening allocation and conservation. Run the existing Node
suites, `reconstruction/test_evidence.py` and `tests/browser-review.cjs` for HTTP and
file:// adoption, room/boundary editing, plan references, site observations,
acceptance, export/import, reload, restoration and property isolation.

## Automatic room mapping and optional corrections

The reviewed Broom Road plan adapter now maps empty floors automatically, including
lower ground. No per-floor preview or confirmation is required. Source labels,
transforms, outline offsets and assumptions travel with the persisted model.
Existing room edits are retained; a versioned mapping marker prevents reload from
replacing a manually cleared or modified layout. Invalid cuts or ambiguous/missing
label assignments leave that floor unassigned and produce a visible review issue.

For corrections, use **Rooms → Adjust room layout**. The former import preview,
scale/orientation/translation controls, wall drawing and undo remain there. Floor
heights and basement depth are in **Floor heights & basement**. **Mapping details**
shows the initial alignment residuals. A geometry change retains rooms and flags
that their alignment needs checking; it does not silently map them again.

**Survey → Review priority checks** opens the survey worklist. Save a remote
snapshot before recording site measurements. Automatic mapping does not accept
measurements or classify the whole property as surveyed.

The proposed layout includes 13 spaces across three levels, counting lower-ground
stair circulation. Wall thickness, stair voids and heated status need review; these
are gross room envelopes, not surveyed internal air volumes. The independently
scaled plan inventory remains available as a comparison, not an automatic override.

**Replace DSM house surface** removes the old house footprint and the elevated
fringe directly in front of its facade, while retaining lower ground samples and
leaving the side neighbours alone. **Reveal lower ground (display cutaway)** opens a
frontage section so the basement/window can be inspected. Switch it off for the
normal context. This opening is not a claim about the actual lightwell or ground
profile. Disable both cutouts to inspect the original DSM. The reconstruction's
front geometry and source evidence have not been shifted to make the display fit.
