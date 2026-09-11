# The pre-survey homeowner conversation

**Updated entry point:** `proposal.html` now opens the guided installation journey.
The five-chapter detailed experience described below is at `?view=technical`.
Both views share a versioned project and explicit room capacity schedules; the
four-room reserve described in the historical baseline below is no longer the
displayed installation budget. See [INSTALLATION-JOURNEY.md](INSTALLATION-JOURNEY.md)
for live typed survey updates, pricing, history and remaining geometry limits.


Open `proposal.html`, or **Your installation · pre-survey discussion** in the
Broom Road ASHP House panel. The dedicated page keeps technical evidence behind
details and gives the call five chapters: home, rooms, equipment/routes, budget,
and next steps. It works on a phone, over HTTP, and from `file://`.

## Reproduce this address

From `solar-visualiser/`:

```sh
# First replay any geometry changes, following reconstruction/README.md.
python reconstruction/run.py
# Python 3.12+; engine dependencies: attrs and pydantic.
python scripts/prepare-proposal.py
node tests/proposal.test.js
python scripts/test_proposal.py
node tests/browser-review.cjs browser-proposal.cjs
```

The tested environment is Python 3.14, attrs 26.1.0, pydantic 2.13.3, Node 26.
The generator calls `scripts/proposal-geometry.cjs`, which uses the same adoption,
automatic room mapping, floor slicing and surface derivation as the ASHP app.
It assigns the rooflight omitted by the wall-only opening binder. Every current
opening has some assigned area; this does not validate each opening's dimensions
or guarantee that a clipped part is physically correct.

`3broomroad-data/proposal/proposal.json` and `bundle.js` are generated artifacts.
Previous packages are archived by revision in `proposal/history/`. Sources and
engine/geometry code are fingerprinted, and tests fail if they change without
regeneration. Geometry replay remains in `replay.html`; the proposal does not
modify its snapshots or the saved working model.

This first version uses the **recorded reconstruction**. Browser workbench edits
and accepted survey measurements are not yet live calculation inputs. The
workbench link explicitly identifies this limitation. Regenerate after a reviewed
geometry/evidence release; do not present the old proposal as a revised design.

## EPC selection and evidence

The postcode CSV is filtered by exact normalized address (`3 Broom Road`) and
postcode (`WA15 9AR`), then ordered by lodgement datetime. Punctuation in `3, Broom
Road` is tolerated; `13` and `3A` are excluded. The latest record is certificate
**8536-5427-1600-0864-0226**, inspected 24 March and lodged 26 March 2026.
Recommendations are joined using only that certificate number. The older exact
address record and all raw fields are preserved in the property package.

The EPC says 146 m², C70, solid brick without assumed insulation, suspended floor
without assumed insulation, 250 mm loft insulation and some double glazing.
The 2015 EPC assumes an insulated floor. Raw `multi_glaze_proportion=2` is not
converted into a confident glazing inventory. The current gross room coverage is
about 167 m² and is not rescaled to the EPC. Different scope, wall thickness,
stairs, basement and geometry errors remain competing explanations.

EPC annual energy, cost and emissions fields are evidence, not design kW,
current tariff estimates or a prediction of heat-pump running costs.

## Calculation contract

The local `heatloss_engine.calculator.HeatLossCalculator` computes six offline
scenarios: three fabric/ventilation assumptions, each with heated or cool lower
ground. The initial working result is about 12.2 kW with the lower ground heated;
the fabric sensitivity spans about 6.8–16.0 kW. These are conditional scenarios,
not a statistical confidence interval, a certified calculation or a selected
heat-pump rating.

The explicit `SurfaceCalculator` adapter:

- Preserves polygon surface areas, sloping-room volume and shared adjacency.
- Uses the engine's WA weather mapping (−2.1°C outdoors, 10°C ground), room
  temperatures and ventilation categories. Kitchen/rear living uses FAMILY at
  21°C because it is one living zone. All thermal circulation spaces are included;
  the engine's `is_habitable` flag must not silently remove halls and stairs.
- Replaces the upstream fixed party-wall temperature difference with the actual
  room-to-assumed-neighbour difference. Main side runs are party hypotheses at
  18°C; exposed rear wings are not automatically party walls.
- Preserves signed internal heat transfer, including transfers between floors.
  Upstream clipping of negative room transfers otherwise inflates house demand.
- Keeps openings separate and subtracts them once. Basement opaque exterior wall
  area uses a 70% ground / 30% air hypothesis; windows remain outside-facing.
- Adds a separate explicit thermal-bridge area allowance. Each preset, U-value,
  ventilation category and boundary assumption is inspectable.
- Preserves the cool basement as a thermal boundary at an imposed 11°C. Its rooms
  are excluded from emitter/house demand but their adjacency remains. This is not
  an equilibrium basement-temperature calculation.
- Exports no engine annual-energy result. Its annual-energy paths need a separate
  audit, including the ventilation ACH term. The separate running-cost scenario
  below uses an explicit useful-heat proxy instead.

The engine code supplied by the user is unchanged. Adapter tests check signed
internal exchange, party ΔT, volume and one-time opening subtraction independently
of the generated Broom Road fixtures.

## Party walls and glazing confirmations

`geometryPrep.boundaryHypotheses` now supplies the same property-frame main-house
party-wall classification to the ASHP geometry review and the proposal generator.
Explicit geometry-review edits and accepted observations take precedence within their revision. The adjacency evidence participates in the review signature; older snapshots remain archived and require a new draft rather than silently acquiring the new defaults. The earlier
review could show these walls unclassified even though the proposal already excluded
them from outside losses. Blue room-plan edges now make party runs visible in the
proposal; amber edges identify unresolved rear neighbour-side contact.

The original central heated-basement baseline is still 12,192 W: about 113.8 m²
of main-house wall is party, saving about 5,024 W versus an all-outside counterfactual.
This is a diagnostic comparison, not a new saving to subtract from the baseline.
Ventilation contributes 3,551 W and remains independently uncertain. Rear x=0 wall
runs contribute possible reductions of about 844 W (ground) and 535 W (upper) if
the entire respective run actually adjoins an 18°C heated room. Outside air across
a gap, contact with unheated conservatory space and partial-height contact are
separate hypotheses. Do not automatically call any neighbour-facing wall party.

`3broomroad-data/thermal-evidence.json` records OS/photo provenance, boundary groups,
opening identities and selectable assumptions. No listing photo establishes pane
count confidently. White replacement-looking frames suggest double glazing in some
places, but shutters and limited edge resolution prevent confirmation. The EPC says
some double glazing without locating each type. Raw `multi_glaze_proportion=2` remains
uninterpreted. Bays are grouped explicitly; ask whether their three faces match.

In **Your home**, expand neighbouring walls to compare adjacent temperatures/contact.
In **Warm rooms**, select a room and expand **Check glazing for this room**. Selections
are discussion assumptions until the adviser records a named homeowner/source note
and presses **Record homeowner confirmation**. A report remains distinct from an
on-site measurement. Reports and subsequent changes are revision-scoped, persist,
and appear in both readable and full project exports. A changed choice resets its
confirmation status. Unknown choices preserve the working assumption, not zero loss.

The U-value examples are whole-opening assumptions: single 4.8, ordinary double 2.8,
low-E double 1.8 W/m²K, or solid timber entrance door 3.0. These are specific representative
examples from BRE/SAP Table 6e, not universal values for each category. Product ratings,
frame/gap details and rooflight installation should supersede them. A glazing choice
does not change ACH automatically. Ask for a spacer/edge close-up or installation
paperwork; do not infer glazing layers from sash style or count mirrored windows twice.

The generator runs each independent group option through the same Python engine for
all six fabric/basement scenarios. It stores per-room fabric changes, unrounded bridge
changes and changed surface rows. The browser combines these disjoint effects, rounds
bridges once and applies the final room clamp. Room loads, radiator requirements,
budgets, sensitivity bounds and exported surface evidence therefore remain consistent.
A test compares combined changes with a fresh joint engine run. Group validation rejects
missing or overlapping targets. Main-house matching-temperature choices remove both
losses and gains; a cooler store can lose an assumed heat gain from its neighbour.

Geometry-review changes are still not live proposal inputs: regenerate after reviewed
geometry changes. These call controls change thermal assumptions on the recorded model,
not wall geometry or the reconstruction replay. Prior proposal packages remain archived.

## Emitters and budget

Changing 45/50/55°C flow changes required radiator ratings, not building heat
demand. Return is explicitly assumed 5°C lower. The comparison uses
`Q = Q50 × ((mean water − room) / 50)^n`, with a generic editable `n=1.3` and a
link to manufacturer correction-factor guidance. Actual model-specific output,
exponent, installation effects and hydraulics need checking.

Unknown radiator output stays null. User-authorised visual hypotheses now cover
seven radiators in six rooms, plus one unassigned bedroom radiator. The immutable
`3broomroad-data/radiator-estimates.json` records photo regions, observations,
size/type alternatives and representative manufacturer ratings. Those are estimates,
not measurements or product identifications. Each alternative uses its own published
exponent where available, otherwise an explicit generic 1.3. See
[RADIATOR-ESTIMATES.md](RADIATOR-ESTIMATES.md) for the inventory and references.

The default comparison uses those hypotheses, with central output and a plausible
range at the selected water/room temperature. Its statuses are distinct from entered
ratings: estimated shortfall, possible sufficiency, or a range crossing demand.
All inventories are partial; even an apparent shortfall is not a final replacement
decision. Unassigned emitters never enter room totals. The pink bedroom remains
unassigned; the lower-ground study assignment is explicitly tentative.

The user can disable estimates or override a room with combined ΔT50 output **and
its source**. An explicit blank leaves the room unknown until the override is reset;
a zero with a source means reported absence of an emitter. Entered ratings get the
existing provisional retain/upgrade comparison. Required output can be shared across
multiple emitters. No photo estimate is written as a survey measurement.

Budget values are intentionally editable prototype allowances, as authorized by
the user. They are not market research, a rate card, a quote or a grant award.
Each line has an inclusion boundary: equipment/primary install, cylinder,
hydraulic route, electrical, commissioning, indicated emitter upgrades and a
reserve for unverified emitters (photo estimates and unknown outputs). The reserve counts rooms, not assumed existing
radiators, and takes the largest unmeasured room costs first. Its supply allowance
scales with required catalogue watts, so flow changes alter the budget honestly.
The displayed range varies unverified emitter scope, not every possible project
cost. Contingency is explicit. Following the user's pricing direction, all monetary
default allowances are halved (including per-metre and per-watt rates); contingency
remains 15%. The central example is about £10,692 gross versus the earlier £21,387.
The £7,500 BUS grant is shown as an assumed deduction after contingency, giving
about £3,192 net. Eligibility/voucher remain unconfirmed. The grant can be switched
off; unresolved installation totals stay null, and deductions are capped at the
installation amount so the UI never displays a cash windfall. Gross, grant and net
figures appear separately in the budget, sidebar and export. The underlying `total`,
`low`, `high` budget fields retain their gross meaning; `netTotal`, `netLow`, `netHigh`
and `grantDeduction` are explicit. Allowances are customer-payable amounts with tax
treatment awaiting pricing review.

## Running costs versus design flow

`3broomroad-data/operating-assumptions.json` records the starting assumptions, sources
and limits; the generator fingerprints and bundles it with the property. `proposal.js`
calculates this separate discussion scenario without invoking the engine's unaudited
annual-energy calculation or converting the EPC's primary energy / historic bills.

Defaults: annual useful space heat = current design kW × 1,600 equivalent full-load
hours; 27 p/kWh flat electricity; space-heating SPF 3.6 / 3.3 / 3.0 at design flow
45 / 50 / 55°C. Weather compensation is assumed, not constant design flow all year.
These particular SPF values are modelling assumptions, not manufacturer data or
numbers attributed to the reference article. Hot water is separate: 3,000 kWh/year
of useful heat including assumed cylinder losses at SPF 2.5, plus 150 kWh/year extra
auxiliary/backup electricity outside the SPF accounting. Avoid double counting if
a supplied system SPF already includes the auxiliary consumption.

`electricity = spaceHeat / heatingSPF + hotWaterHeat / hotWaterSPF + auxiliaries`.
Multiply by the flat tariff. At the original 12.192 kW central heat loss, this gives
19,507 kWh of space heat and approximately £1,828 / £1,961 / £2,120 a year. Heating
demand is held equal across flows; appropriate emitter capacity is required to
maintain comfort. The comparison displays installation contribution alongside
annual cost, without inventing a precise payback from provisional radiator reserves.

All inputs are editable. An entered annual useful-space-heat value overrides the
proxy, including explicit zero. It remains fixed across fabric/basement changes and
is labelled accordingly; blank restores the model-linked estimate. Gas-meter kWh
are fuel input, not useful space heat: account for boiler efficiency, hot water and
other gas use before using bills to set this input. The scenario range varies useful
heat ±25% and heating/hot-water SPFs ±15%, keeping auxiliaries fixed. It is not a
confidence interval or a whole-project uncertainty bound. Standing charges, other
household electricity, servicing, finance, solar/time-of-use savings and future
tariff changes are excluded. Actual bills and the selected product's seasonal data
should refine this comparison at survey/design review.

The unit tests check formula/units, tariff scaling, separate DHW, model-linked versus
entered heat, flow invariance of demand, invalid efficiencies, net/gross accounting,
unknown-price propagation and grant caps. Browser tests exercise tariff edits and
grant toggles, then persistence/export and HTTP/file:// layouts.

## Locations, household choices and survey

Outdoor courtyard/garden and utility/kitchen cylinder spaces are hypotheses.
The cylinder in the kitchen is a proposed allocation of space, not a detected
empty cupboard. Model markers are placeholder equipment. Dashed hydraulic
routes carry model-derived indicative lengths, an illustrative riser and access
uncertainty. No meter, consumer-unit or condensate route is invented. Leaving the
cylinder unlocated suppresses the route length and complete budget.

The visit is explicitly presented as checking uncertain details, then sitting down
with the homeowner to agree locations, radiators, running-cost trade-offs and scope.
Outstanding technical checks remain visible before final approval. Preferences
include comfort, storage/garden/radiator constraints and hot-water use. Occupant count alone does not select a cylinder. Call changes are saved in
a property/revision-scoped event history, separate from measurements and design
approval. Save call summary downloads a readable standalone HTML document. The separate
project JSON export contains source hashes, room results, chosen options and
five survey priorities. Print creates a readable homeowner summary. Import
rejects another property or evidence revision; earlier browser drafts remain
stored after regeneration and are not silently applied.

The current priorities use fabric-scenario spread, rear room demand, basement
scope difference, emitter evidence coverage and service location uncertainty.
This is a first triage, not a full value-of-information optimiser. A call does
not mark the existing survey forms complete; the surveyor records measurements
through `survey.html`, and a designer reviews them before the next release.

## Next product steps

1. A canonical property project shared by evidence, geometry, heat-loss engine,
   proposal and survey, with dependency invalidation and a visible revision diff.
   Accepting a measurement reruns affected room loads, emitter choices and prices.
2. Invite the homeowner into the same guided view as the adviser, with live
   selection/focus, an optional concise call script and a saved decision recap.
3. Manufacturer performance and emitter catalogues: compare actual products at
   the design outdoor/flow temperatures, constrained by space, sound and hydraulics.
4. Route graphs with separately measured hydraulic, electrical and drain segments;
   photo/3D placement, access, penetrations and clearances; annotated survey capture.
5. Company rate cards, labour/resource scope, itemized customer quotations and
   confirmed grant eligibility and annual cost scenarios calibrated to bills and
   manufacturer performance rather than the current editable SPF assumptions.
6. Replay reconstruction and proposal changes as versioned evidence events for
   every future address. New datasets need reviewed adapters and evaluation cases;
   do not copy Broom Road geometry, EPC assumptions or equipment positions blindly.

References checked 10 September 2026:
[Stelrad correction factors](https://www.stelradprofessional.com/stelrad-correction-factor/),
[Energy Saving Trust: efficient operation](https://energysavingtrust.org.uk/how-to-ensure-a-heat-pump-runs-efficiently/).
