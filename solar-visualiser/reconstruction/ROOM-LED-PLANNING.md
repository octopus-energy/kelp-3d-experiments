# Room-led heat-pump planning

The guided journey follows Your home → Your rooms → Equipment & routes → Costs &
payments → Checks & survey → Review together. The listing photo and source plan
stay beside a room's discussion. Topics remain optional; moving on is not approval.

## Conversation and effects

| Contribution | Consequence | What remains open |
| --- | --- | --- |
| Match a listing photo | Moves its attributed emitter evidence; appends a sourced match | Output, inventory completeness and dimensions |
| Record existing glazing or adjoining wall | Uses the existing thermal adapter, updates every room in the displayed group, logs before/after demand and price | Representative U-values, mixed construction, partial contact and physical checks |
| Describe an extension or another boundary | Appends a room account and creates a construction review task | Geometry/thermal inputs are unchanged until supported incorporation |
| Choose 45/50/55°C | Compares existing output with the same room demand; changes the whole-home emitter schedule and annual scenario | Actual products, hydraulic capacity, return temperature and performance |
| Keep/add/replace radiators; prefer UFH or a style | Existing supported keep/supplement/replacement schedule or design preference | UFH and non-panel products need their own assessment and price |
| Request wall insulation / better glazing | Saves a room preference and adds a survey task | Wall construction, moisture design, disruption and cost |
| Preview specific glazing | Compares room demand and existing-output gap using mapped opening effects | It never changes the observed glazing, baseline schedule or baseline budget |
| Describe boiler/cylinder/meter/consumer unit | Appends presence, location, observer, notes and optional embedded photographs | Does not establish equipment suitability or alter the indicative 3D route |
| Discuss leaving gas | Records remaining appliances, preference, bill source and annualised daily charge | Supplier arrangements, removal costs and actual cessation of charges |
| Enter payment assumptions | Calculates extra-work total, borrowing, monthly payment, interest and total paid | Written scope, milestones and any lender offer; this is not APR underwriting |
| Record an assessment/certificate reference | Separates received documents from named adviser/surveyor reviews and retains scope | Does not issue or independently authenticate certification |

## Evidence and replay

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
introduce a second heat-loss implementation. Return is assumed 5°C below flow.
Unknown output stays null. Photo ranges remain visible and do not establish a
complete inventory. Glazing previews use only supported mapped options.

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

Run `tests/installation-planning.test.js`, installation/store/proposal suites and
`tests/browser-review.cjs browser-planning.cjs browser-installation.cjs browser-proposal.cjs`.
The browser harness uses isolated profiles with synthetic inputs, desktop/390 px
phone viewports, HTTP and `file://`; it saves screenshots for visual inspection.
The room-led checks exercise actual forms and persistence, not only pure functions.


Final reviewed revision: `8b27a5966ce18dd9`. HTTP and offline-with-network-disabled
planning forms, service-image capture, uncertainty reopening, desktop/phone layout,
local reload and replay passed. The guided installation and technical proposal
browser regressions also passed. Final screenshots are produced by the reproducible
browser command above; inspect them after any UI changes.

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
