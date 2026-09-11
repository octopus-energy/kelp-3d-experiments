# Heat-pump journey review — 11 September 2026

Reviewed the fresh Broom Road project, made real browser selections and uploads in
isolated profiles, followed the derived schedules and observation records, inspected
screenshots, and opened the exported HTML recap. All synthetic observations remain
in the test profiles; none are installed in the property evidence.

## Consequential findings and implemented responses

| Perspective | Finding and consequence | Response |
| --- | --- | --- |
| Homeowner | The opening asked for priorities and routines before explaining what the household would get. Matching and the room entry competed with the bottom Next action. | A photo-backed introduction explains the proposal and offers starting options or a room chooser before asking for work. Matching precedes comfort prompts on the start page. |
| Homeowner | Thirteen rooms each had three sequential stages. Walking past a room looked like progress despite adding no useful evidence. | A visual overview keeps all rooms accessible and suggests up to three useful contributions. Comfort, photos and heating ideas remain optional topics. Next room advances directly without asserting completion. |
| Homeowner | Comfortable, usual routine and openness to replacing radiators appeared selected on untouched rooms. | Explicit neutral-answer markers are separate from default values. They persist and replay without changing demand. Affirmative legacy preferences remain visible. |
| All roles | Regenerating the proposal changed the storage key, making earlier discussions appear lost. The fresh screen also claimed to be saved. | Same-property earlier projects are discoverable, with recorded history and an original-data download. Nothing is silently migrated. Starting assumptions are distinct from persisted answers; local-only storage and unfinished-form limits are explained. |
| Remote adviser | The combined adviser/surveyor mode could label remote capture as a site observation. | Separate workspaces default to remote assessment or site observation. A sourced remote rating can update a scenario but does not close site inventory validation; remote envelope interpretation remains a working assumption. |
| Remote adviser | New radiator photos generated a task, but that task did not display the submitted photographs or dimensions. | Related records, roles, dates, measurements and preferences sit beside the form. Source photos and floorplans can be enlarged; uploaded review copies have an actual-size inspector. A received-photo check links to the sourced room-rating form. |
| Site surveyor | Every save jumped into event replay. The recap only listed five checks, and a conversation about agreement could not be recorded. | Saving stays in the survey and gives a before/after receipt. Review together compares the starting proposal with current quantities, records participants and a conditional preferred direction or open questions, and reopens review after later changes. The recap includes all outstanding checks and embedded evidence. |
| Homeowner | The net allowance was prominent while the grant-free comparison required the technical workbench. | Each option shows its gross allowance and a guided-view grant toggle. Removing the assumed deduction changes upfront allowances only. |

## Trace of answer effects

| Answer | Actual effect | Remaining assessment |
| --- | --- | --- |
| Priority | Suggests a flow option to compare; selecting an option is separate | Product performance and installation constraints |
| Residents / bathing routine | Hot-water brief and named survey task | Cylinder duty, space, recovery and annual hot-water consumption |
| Cold room / routine / context | Room-specific survey brief, saved answer and replay | Causes, controls, draughts and design temperatures; no automatic load change |
| Keep existing radiators | Known retained capacity reduces supplementary capacity; unknown output stays unknown | Actual inventory, physical fit and pipe capacity |
| Columns / vertical / UFH | Saved design request and product/cost task | Actual products or floor system; panel allowances are unchanged |
| Photo-room correction | Moves existing emitter hypotheses by identity without duplication | Rating and inventory confidence remain separate from room identity |
| Radiator photos / dimensions | Append-only evidence linked to the room; opens assessment | No automatic numerical rating or complete-inventory claim |
| Complete sourced rating | Updates available output, proposed schedule and allowance | Remote assessment does not become a site-verified inventory |
| Glazing / adjacency category | Updates the supported thermal scenario using representative properties | Full contact must be established; partial contact still requires geometry work |
| Geometry / access measurements | Evidence and pending review, visible to the surveyor | Rebuild or engineering assessment; no invented mesh or route |
| Outdoor markers | Image-space preference and site-review task | Registration, equipment selection and feasibility; no change to the 3D route |
| Route/cylinder option | Indicative route and allowance; unresolved cylinder removes the total | Access, hydraulics, electrics, drainage, noise and siting |
| Grant toggle | Upfront deduction only | Eligibility and pricing remain unconfirmed |
| Review conversation | Participants, conditional outcome and note attached to the current snapshot | Technical approval remains false; later changes require renewed discussion |

## Verification

The browser suite exercises the running page over HTTP and file URLs, including
real mouse/input events, uploads, saved-state reloads, failed saves, matching,
replay, shared technical choices and phone layout. It also checks:

- earlier-project discovery without cross-revision application;
- unselected default answers and direct next-room navigation;
- remote/site default attribution and received evidence next to a task;
- image inspection on desktop and phone, with a visible close action;
- conditional discussion, later invalidation and embedded recap evidence;
- survey layout at 1280 × 800, desktop at 1440 × 1000 and phone at 390 × 844;
- the exported standalone recap itself, including native expandable photographs.

Screenshots are generated in the browser runner's reported temporary directory.
Useful files: `installation-0.png`, `installation-2.png`,
`installation-room-cards-phone.png`, `installation-adviser-evidence.png`,
`installation-adviser-phone.png`, `installation-surveyor-laptop.png`,
`installation-review-together.png`, and `installation-recap-phone.png`.

Run the installation, installation-store, proposal, reconstruction, survey and
geometry-prep Node tests; the proposal, evidence and exterior Python tests; and
`node tests/browser-review.cjs browser-installation.cjs browser-proposal.cjs`.
Regenerate the proposal after building-JS changes. Geometry source snapshots and
reconstruction stages are unchanged; previous proposal packages remain archived.

## Limits that still shape the experience

The choices are not yet a complete designed installation. Photo pins and indicative
route options are still separate representations. A surveyed site model and
product-specific screening are needed to connect them. Style sketches are not a
product shortlist or an in-room dimensional preview. UFH needs its own assessment.

Received-photo assessment is manual. A sourced remote rating resolves the repeat
photo request while complete site inventory remains a separate check.
General notes do not close geometry, comfort, product or access checks. A discussion
record is a conditional conversation record, not a signed contract or technical
approval. Existing numerical assumptions have not been recalibrated by this review.

Storage is local to the browser/origin. There is no invitation, shared call, account
access control or cloud sync. Unsubmitted evidence is retained during in-page
navigation and warns before leaving, but is not a durable draft. Mobile process
termination can bypass that warning. Earlier-revision projects can be recovered,
but migration still requires a reviewed comparison of evidence and identities.


## Room-led extension — 11 September 2026

The room comparison now shows working demand beside output at 45/50/55°C with
photo-output uncertainty. Existing glazing and adjoining-wall observations are
collected in their room and affect the existing adapter. The homeowner sees all
rooms affected by a shared group before saving. Extension accounts are retained
as evidence, not converted into insulation performance.

Glazing what-ifs visibly compare demand and the remaining output gap without
rewriting installed construction or the baseline radiator budget. Wall-insulation
and glazing preferences join radiator/UFH ideas in the survey handoff. Existing
boiler, cylinder, meter and consumer-unit descriptions/photos appear beside the
site access check. The adviser and joint review can read the same planning brief.
Gas fixed charges and illustrative borrowing are separate from energy estimates.
Document records distinguish receipt, review and review needed after changes.

Screenshots from HTTP and file:// walkthroughs showed the first document register
pushing actual survey work too far down the page. The register now uses compact
cards, with full-width forms only when opened. Phone room navigation avoids a
large sticky multi-row tab block. Monthly payments show pence, and exported recaps
include monthly payment, upfront payment, interest and total paid.

`browser-planning.cjs` exercises real room construction, proposed glazing, service
photo capture, gas and loan forms, review invalidation and reload. Its file:// pass
disables networking. Desktop and 390 px phone screenshots were inspected for room
heat loss, flow comparison, fabric options, existing services, payment results and
document reviews. Data are isolated synthetic fixtures, not property observations.
The established installation and technical proposal browser regressions also pass.

Remaining product boundaries: no automatic equipment choice, acoustic compliance,
service-route design, insulation specification, finance offer or certificate
verification. Glazing scenarios are useful comparisons, not adopted design packages;
UFH, fabric work and nonstandard emitters still need scoped products and prices.
