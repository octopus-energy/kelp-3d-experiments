# Broom Road radiator hypotheses

Reviewed 10 September 2026: all 13 interior listing photos. These are visual
estimates, not measured dimensions, identified products or a complete inventory.
Open `proposal.html#1` to compare them with room demand and inspect the boxed photo
regions, alternative sizes and manufacturer sources. The machine-readable source
is `3broomroad-data/radiator-estimates.json`.

| Visible emitter | Central hypothesis | Approximate DT50 output | Plausible DT50 range |
|---|---|---:|---:|
| Hall | 600 mm, 18 sections, 3 columns | 1,100 W | 630–2,340 W |
| Living/dining bay | 600 mm, 24 sections, 3 columns | 1,460 W | 770–2,390 W |
| Front bedroom bay | 600 mm, 28 sections, 3 columns | 1,710 W | 840–2,550 W |
| Lower-ground study, tentative room | 900 mm, 8 sections, 3 columns | 700 W | 390–1,130 W |
| Kitchen, heavily obscured | 600 × 600 mm type 11 panel proxy | 590 W | 300–1,390 W |
| Rear living, same thermal room as kitchen | 450 × 1,000 mm type 11 panel | 760 W | 530–2,080 W |
| Bathroom towel frame | Small open brass-frame analogue | 180 W | 120–300 W |
| Pink bedroom, unassigned | 600 mm, 14 sections, 3 columns | 850 W | 380–1,950 W |

The apparent radiator behind the living-room sofa remains ambiguous and has no
numeric output. Other room images do not justify additional estimates. The dining
view repeats the living bay emitter; the reverse kitchen view repeats the kitchen
position. The unassigned pink-bedroom estimate is excluded from room totals.

The ranges change height, section count and depth/type together. They describe
plausible hypotheses rather than independently measured errors. The kitchen proxy
is especially weak: the visible ribbed fragment does not distinguish panel from
column construction. Do not identify a radiator brand from these photographs.

## Manufacturer analogues

- [Zehnder Charleston technical datasheet](https://s3.us-east-1.amazonaws.com/bisque-pdf/Technical-Datasheets/Zehnder-Charleston-TDS.pdf):
  horizontal table, e.g. 3060-10 gives 609 W at DT50, so a 600 mm three-column
  section is 60.9 W. Eighteen sections give 1,096 W, with n=1.27. Column depth is
  already included in that rating. Nominal width is 46 mm per section + 26 mm.
- [Zehnder Charleston made-to-measure table](https://s3.us-east-1.amazonaws.com/bisque-pdf/Made-to-Measure-July-2023/ZehnderCharleston-MadeToMeasure-Pricing-JULY2023.pdf):
  900 mm three-column 87 W/section; 1,000 mm four-column 125 W/section. The
  table's prices are unused; n=1.3 is an explicit assumption for these rows.
- [Stelrad Compact technical specification](https://www.stelradprofessional.com/wp-content/uploads/2020/10/28092_Compact-H_Web.pdf):
  type 11 at 450/600 mm gives 756/980 W per metre, n=1.31/1.29; type 22 at
  600 mm gives 1,732 W per metre, n=1.33. Rated at 75/65/20°C (DT50).
- [Zehnder Nobis technical datasheet](https://s3.us-east-1.amazonaws.com/bisque-pdf/Technical-Datasheets/Zehnder-Nobis-TDS.pdf):
  NOB-100-050, 965 × 500 mm, 210 W at DT50, n=1.28. This supports an order-of-
  magnitude estimate for the smaller-looking brass frame, not exact identification.

All links checked 10 September 2026. Outputs are representative hydronic ratings;
material, finish, actual construction and installed performance may differ.

## From catalogue rating to heat-pump operation

Apply `Q = Q50 × ((mean water temperature − room temperature) / 50)^n` to each
alternative, then sum distinct emitters per room. At 50°C flow / 45°C return and
18°C room temperature, the hall central hypothesis gives about 560 W and the
front bedroom about 870 W. In 21°C living spaces the same water temperatures yield
less output. Do not compare DT50 watts directly with room heat loss at lower flow.

The default kitchen/rear-living sum is about 1,340 W at DT50, about 590 W at
50/45°C in a 21°C room. Its modelled demand is about 4,040 W. That discrepancy
prioritises a complete inventory and review of the large rear-room demand, rather
than approving replacements from photos alone. Estimates do not remove rooms from
the unverified budget reserve. Preserve all hypotheses and photo sources when an
on-site measurement supersedes them.
