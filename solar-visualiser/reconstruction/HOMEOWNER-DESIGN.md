# A homeowner-led heat-pump design

The homeowner is a collaborator with knowledge of their home, tastes and priorities.
Their job is to recognise, choose and contribute useful evidence. The system's job
is to do the interpretation, explain consequences, and ask only consequential questions.

## The experience

1. **Recognise my home.** Automatically use supported room identities. Ask about the
   uncertain photos first, in a screen-sized photo/room workspace. Saving advances;
   “not sure” defers it. All inferred and confirmed matches stay visible and editable.
   Matching must precede comfort questions so room cards become recognisable.
2. **Tell you what living here is like.** Use those room cards for comfort, routines,
   appearance and planned renovations. Don't ask whether obviously occupied rooms
   are heated. Explain what a response changes and what still needs a calculation.
3. **Let me help, in small useful steps.** Offer room-specific photo missions: front
   and side of each radiator, a close-up of a label, optional width/height, or a
   missing outdoor view. Show examples, upload progress and evidence received.
   Never require the homeowner to know a DT50 rating or identify panel types.
4. **Design something I like.** Start with keep/repair, understated panel, columns,
   vertical options or a floor-system investigation. Offer finishes and a real
   product shortlist appropriate to each room; explain output, wall space, price,
   disruption and flow-temperature implications alongside appearance.
5. **Place the equipment together.** Let me mark preferred spots and areas to keep
   clear, including both front and rear. Then compare actual site candidates with
   a reason for each outcome: feasible on current evidence, ruled out, or unresolved.
6. **Show the result before asking me to agree.** Show the proposed radiator in the
   actual room and the outdoor unit in its proposed setting. Compare alternatives,
   keep homeowner favourites, and carry the chosen option to the site visit.
7. **Use the visit to resolve the important gaps.** The surveyor checks what could
   change sizing, siting, cost or appearance. Sit down with the homeowner afterward
   and explain the differences from the remote proposal before agreeing a design.

## Working in this release

- Matching runs before comfort, in a native modal with a stable footer and separate
  image/room panes. The default queue omits room attributions marked `supported`
  in reviewed emitter evidence. This is separate from low confidence in radiator
  dimensions. Other associations still need help; merely having a suggested label
  is not sufficient. Overrides and deferrals take precedence and are replayable.
- Homeowners can add radiator images and optional dimensions in Room changes.
  Images are locally resized for review and attached to a named room. The record
  retains original pixel dimensions and identifies the processing. Originals remain
  on the homeowner's device. New images create an assessment task, not a made-up
  output rating or an automatic claim of complete inventory.
- Room appearance choices are persisted in `household.roomDesign`; nonstandard
  styles and UFH flag a product/cost review. The current schedule and £300 change
  allowance remain the standard-panel benchmark. A style preference is not a
  selected SKU, output curve, installation drawing or accepted price.
- Front/rear photo markers record `prefer` and `avoid` under household preferences.
  They are normalised image coordinates, not world coordinates. They don't move
  the 3D unit, invent a pipe run, establish ownership or mark a site as compliant.
  Current route options remain separate and explicitly indicative.

## Next engineering layer: model the site and shortlist products

Extend the canonical model around the house using source aerial imagery, DSM/DTM,
OS geometry and ground photos. Include neighbouring walls/openings, fences, paths,
steps, levels, drains, entrances, access pinch points and homeowner no-go regions.
Separate observed features, inferred extents and site measurements. Register photo
markers using calibrated cameras or plan correspondence; retain uncertainty and
source regions. Do not convert one click in an uncalibrated image into a metre value.

Run candidate screening against the chosen equipment and current applicable siting
requirements: geometry and airflow, opening separation, acoustics and neighbouring
receptors, delivery/service access, drainage, electricity and hydraulic runs.
Give every excluded/unresolved candidate a specific reason and evidence link.
A homeowner preference is an input to screening, not an engineering constraint pass.
Ownership/planning/access permissions cannot be inferred from OS site extent.

For emitters, introduce actual product dimensions, finish options and temperature
curves. Model usable wall regions, furniture and pipe connections. Compare multiple
radiators, preserving an attractive existing emitter, and mixed solutions. UFH needs
its own floor construction, usable area, finishes, build-up, disruption, controls,
output and cost assessment; it cannot inherit the generic panel-radiator allowance.

## Visual previews: grounded geometry first, generative polish second

A preview is a versioned artifact linked to the source photo, room/site candidate,
product dimensions, camera, placement transform, occlusion mask and design revision.
First render a geometrically scaled product proxy against a calibrated source image.
This is the dimensional check. Then, where useful, use image generation for materials,
lighting and finishes while preserving the supplied silhouette, placement and
surrounding architecture. Show original/render/styled preview as distinct layers.

Never let a generated image move a window, widen a passage, hide a service conflict
or silently shrink the equipment to make a design look feasible. Label uncalibrated
style studies as such. Generative output is not evidence for reconstruction or a
clearance calculation. Changed product/placement/source invalidates its preview;
keep the old artifact in the design replay.

A model-backed yard feasibility map, real product shortlist and generated in-room
previews are **not implemented in this release**. The current style sketches are
illustrations, and photo pins are homeowner preferences. These are the next layer
on top of the now-persisted choices and evidence, not simulated completed features.
