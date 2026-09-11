# Room-led heat-pump planning

The guided journey follows Your home → Your rooms → Equipment & routes → Costs &
payments → Checks & survey → Review together. The listing photo and source plan
stay beside a room's discussion. The room sequence is Room & heat loss → Comfort →
My radiators → Flow & output → Options. Topics remain optional; moving on is not
approval. Questions, assumptions and comparisons are visible within the selected
topic, without accordions. Compact selectors choose a room, building element,
service or review item; they do not hide the active item's form.

## Conversation and effects

| Contribution | Consequence | What remains open |
| --- | --- | --- |
| Match a listing photo | Moves its attributed emitter evidence; appends a sourced match | Output, inventory completeness and dimensions |
| Record existing glazing or adjoining wall | Uses the existing thermal adapter, updates every room in the displayed group, logs before/after demand and price | Representative U-values, mixed construction, partial contact and physical checks |
| Describe an extension or another boundary | Appends a room account and creates a construction review task | Geometry/thermal inputs are unchanged until supported incorporation |
| Choose 45/50/55°C | Compares existing output with the same room demand; changes the whole-home emitter schedule and annual scenario | Actual products, hydraulic capacity, return temperature and performance |
| Keep/add/replace radiators; prefer UFH or a style | Existing supported keep/supplement/replacement schedule or design preference | UFH and non-panel products need their own assessment and price |
| Correct a selected element’s U-value | Previews and then applies signed area × U × temperature difference, with a source and replay event | Dimensions, boundary temperatures, construction suitability and junction allowance |
| Correct / add an individual radiator | Saves its identity, type and dimensions; supported catalogue analogues update output once the list is reported complete | Product identification, unsupported sizes/types and site verification |
| Attach several radiator photos | One evidence record can reference a listed radiator; images never add inventory items | Interpretation and any resulting rating require assessment |
| Compare wall/floor/roof insulation or replacement glazing | Shows room demand and capacity gaps at 45/50/55°C; saves element targets for discussion and a survey task | Existing-home record, baseline schedule and budget remain unchanged; construction, moisture, disruption and cost need review |
| Describe boiler/cylinder/meter/consumer unit | Appends presence, location, observer, notes and optional embedded photographs | Does not establish equipment suitability or alter the indicative 3D route |
| Discuss leaving gas | Records remaining appliances, preference, bill source and annualised daily charge | Supplier arrangements, removal costs and actual cessation of charges |
| Enter payment assumptions | Calculates extra-work total, borrowing, monthly payment, interest and total paid | Written scope, milestones and any lender offer; this is not APR underwriting |
| Record an assessment/certificate reference | Separates received documents from named adviser/surveyor reviews and retains scope | Does not issue or independently authenticate certification |

## Evidence and replay

Pure `room-assessment.js` handles surface classification, U overrides and radiator
inventories. `room-view.js` renders the selectable cutaway and
`room-assessment-ui.js` presents the element and inventory editors.
Pure `installation-planning.js` derives room comparisons, finance and review state.
`installation-planning-ui.js` renders the conversations through the installation
store. Load both as classic scripts in the documented order in `proposal.html`.

Preferences and payment/gas scenarios live in `household.planning`, included in
every existing installation event snapshot. Existing services, construction
accounts and document reviews are append-only `observations`; corrections append.
A homeowner can reopen a construction answer as uncertain: the previous observation
remains immutable, the model returns to its labelled working assumption, and the
survey task stays open. Old same-revision projects without these optional fields
remain valid. Export,
import, local saves, stale-tab protection and read-only event replay retain them.

A document record stores the current scope fingerprint. Evidence, geometry revision,
locations, flow or household design changes require renewed review. Physical checks
exclude payment-only changes from this fingerprint. Check records and discussion
notes do not invalidate one another merely by being recorded. The fingerprint is
for change detection, not a cryptographic signature or authentication. No completion
counter grants design approval, and source evidence tasks remain independently open.

## Calculation boundaries

The room comparison calls the same proposal adapter at 45/50/55°C; it does not
re-run geometry or infer new construction. Surface U overrides extend the generated
scenarios using the existing engine’s signed heat-transfer arithmetic. Return is
assumed 5°C below flow.
Unknown output stays null. Photo ranges remain visible and do not establish a
complete inventory. Individual element comparisons accept explicit illustrative
U targets; these are neither selected products nor insulation specifications.

Payment scenarios use a user-entered fixed annual interest rate divided by 12,
equal monthly repayments, no fees and an explicit term. Zero interest and fully
funded upfront cases are supported. Unknown installation scope, extra work,
deposit, rate or term does not become zero. The additional work allowance belongs
to the payment scenario and does not silently reprice the engineering schedule.
Gas fixed charges are shown separately from annual heating and hot-water energy.

## Sources and limits

- [MCS noise mitigation guidance](https://mcscertified.com/wp-content/uploads/2025/11/MCS-Noise-Mitigation-Guidance-V5.pdf): selected-product siting, noise assessment and manufacturer requirements. No automatic acoustic or clearance pass is implemented.
- [Ofgem standing charges](https://www.ofgem.gov.uk/information-consumers/energy-advice-households/energy-price-cap-and-standing-charges-explained): daily fixed charge can apply even on days without usage. Use the actual bill and confirm supplier arrangements.
- [MoneyHelper borrowing comparison](https://www.moneyhelper.org.uk/en/everyday-money/credit/do-you-need-to-borrow-money): consider borrowing cost and full repayment terms. Illustrations are not finance offers.

Sources checked 11 September 2026. Regulatory and finance details require a current,
case-specific assessment. Document references are recorded text, not uploaded or
validated PDF certificates. Service photos are embedded and work offline; linked
external guidance requires connectivity.

## Verification

Run `tests/room-assessment.test.js`, `tests/installation-planning.test.js`,
installation/store/proposal suites and
`tests/browser-review.cjs browser-room-assessment.cjs browser-planning.cjs browser-installation.cjs browser-proposal.cjs`.
The browser harness uses isolated profiles with synthetic inputs, desktop/390 px
phone viewports, HTTP and `file://`; it saves screenshots for visual inspection.
The room-led checks exercise actual forms and persistence, not only pure functions.


## Individual elements and radiator inventory

`room-assessment.js` classifies every engine surface row into walls, openings,
floors or ceilings for the room being viewed; internal floors are ceilings for the
room below. Signed heat transfer is retained. The breakdown plus ventilation and
junction allowance reconciles with the engine's unclamped room result.

Explicit surface U-value overrides run after generated boundary/glazing effects,
using the same area × U × signed temperature difference and truncation as the
Python adapter. Shared surfaces have a single identity and affect both rooms.
Geometry, boundary temperatures and the junction allowance are unchanged by a
U-only override. This is an explicit extension to the precomputed scenarios,
not a new inferred construction or a geometry correction.

`choices.radiatorInventories` keeps stable individual identities, type, dimensions,
section count and whether the list is complete. Photo hypotheses can seed the
editable list, but source dimensions stay labelled. A supported catalogue analogue
requires an exact represented type and height; unsupported dimensions/types keep
output unknown. Each radiator is derated with its own exponent. An incomplete
list or unknown item never becomes a complete room rating. Complete empty lists
explicitly report no emitters. Corrections append inventory observations and replay
restores each prior list. A new inventory supersedes a prior aggregate rating until
that rating is assessed again. `tests/room-assessment.test.js` covers these contracts.

## Visual and handoff checks

The room cutaway uses recorded wall edges and opening rings. Internal wall edges
need the model's bearing/anchor conversion into local coordinates; exterior edges
already supply that frame. A projected browser click must select the corresponding
thermal assumption. Visible opening planes take precedence over their transparent
wall planes. Floor/ceiling highlights are explicitly schematic because one room
polygon can cover several adjacency patches; quantities remain the engine patches.

Element selection highlights all relevant collinear wall segments or opening
fragments. Area, U-value, signed temperature difference, watts and provenance remain
visible. U-only corrections append a sourced observation; restoring the source
assumption also appends. A newer group glazing answer replaces older per-opening
U overrides, including in the technical workbench. Prior values remain in replay.
Unverified per-element assumptions create room-level site tasks and are included
with that room and construction group's evidence.

Improvement controls keep the selected element, target and before/after demand
near one another. The model stays beside the desktop editor. Phone users can
return to model/photo context and navigate directly to the visible photo form.
The radiator drawing is a dimension/type diagram, not a product or placement
preview. A complete homeowner list still does not close the site inventory check.
The adviser brief and HTML recap retain element labels, saved targets, resulting
room-demand comparison, radiator dimensions and the original supporting records.

Browser checks cover a real projected 3D click, current-window correction/reset,
adding and correcting an emitter without photos, two photos for one inventory
item, completeness, a separate insulation scenario, all room topics on a 390 px
phone, role handoffs, stale reviews, reload and read-only replay. Screenshots must
be inspected: assertions on totals or page width alone do not prove useful layout.

## Verified review — 11 September 2026

Reviewed proposal revision: `56197106257800ba`.

| Perspective | Consequential issue addressed | Checked consequence |
| --- | --- | --- |
| Homeowner | Combined fabric loss obscured which assumption mattered; radiator capture centred on uploads | Signed element totals, selectable 3D wall/window, visible current assumptions, dimensions/type correction, add without photos, multiple photos without duplicate radiators |
| Remote adviser | Improvement choices and their result required too much scrolling; reported dimensions could be confused with rated output | Compact element selector beside immediate demand/capacity comparison; source-labelled inventories and explicit unknown output; saved targets and evidence in the brief |
| Site surveyor | Per-element corrections needed a clear destination in the outstanding checks | Room/group evidence links, unresolved U-value tasks, source-preserving corrections and supersession, prior inventory/rating history and read-only replay |

All nine relevant Node suites passed (room assessment, installation, planning,
store, proposal, reconstruction, survey, geometry preparation and building geometry).
Python proposal, evidence and exterior suites passed (14 tests). All four browser
suites passed for HTTP and file URLs; room/planning checks disable networking for
the file pass. Desktop and 390 px phone screenshots were inspected, including the
selected window and cutaway, proportional radiator diagrams, photo capture, live
improvement results, adviser evidence and review handoff. The final harness output
was `broom-review-aeWxGg` in the system temporary directory; rerun the documented
command to reproduce screenshots and synthetic exports.

Remaining limits: U targets are illustrative; fabric work is not automatically
priced or applied to the agreed design. Unsupported radiator products/sizes retain
unknown output. Geometry/area changes still require reviewed reconstruction. Site
clearances, hydraulics, noise and product selection remain separate checks. Local
storage and the role switch do not provide remote collaboration or authentication.
