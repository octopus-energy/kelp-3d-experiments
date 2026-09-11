# Broom Road reconstruction replay

Open `../replay.html`, or **ASHP → House → Watch reconstruction replay**.
Play/pause, step buttons, the timeline and arrow keys navigate thirteen recorded
milestones. Space toggles playback when focus is outside a control. Each step has
a stable URL fragment. Playback pauses on inspection, orbiting or a hidden tab.

The left view uses exact saved model snapshots. The optional purple wire outline
is a recorded predecessor. It does not morph vertices or invent optimiser steps.
The right view switches between the original photo, predicted normals and relative
depth; layer opacity blends the maps with the source while keeping model projections
and observations on top. Aerial/OS and plan evidence have their own introductory
steps. Detailed residuals, source paths and parameter tables remain expandable.

## What this replay claims

This is a curated, narrated explanation of saved experiments, not a recording of
agent reasoning, continuous optimisation or live inference. Step durations are
editorial. Intermediate camera/geometry proposals were not all saved, so the player
must never label its timed transitions as real computation or invent iteration
counts. The recorded rear trial rejection is explained without applying its rejected
parameters to the released model. `mono-along` remains available in detailed review;
the narrative follows the selected `mono-across` branch.

- Front photos and DSM influenced the earlier fits. Front window checks remain
  visible, including their nonzero residuals.
- The initial rear roof hypothesis was wrong. The user supplied the mono-pitch
  correction; that attribution is preserved in the replay.
- The old rear cameras failed their excluded checks and hit a field-of-view bound.
- Two raw rear normal patches were weak constraints in the final lower-extension
  experiment. The purple rectangles are the actual source regions. Hundreds of
  correlated pixels are not independent evidence.
- Predicted depth is a diagnostic display only. It did not influence the recorded
  geometry. It is affine-invariant log depth, not metric distance. The player does
  not show see-through depth as if it were an exterior surface.
- Final checks support the visible lower rear extension only. Upper wing, basement,
  hidden interfaces and metric accuracy remain unresolved. The replay never adopts
  a model or writes house/survey state.

## Reproduce

`replay-story.json` holds the editorial milestones, stable stage/source IDs and
narration. `prepare_replay.py` packages this with the exact batch PNG previews for
the four compared photos, checking source, PNG and raw NPY hashes. These views are
all 1024 × 683 with no crop. Other image transforms are rejected until supported.
The data URLs are resolved by `SolarViz.imageUrl` for HTTP and `file://` parity.
The browser shows previews; fitting used raw vectors, not colours sampled from PNGs.

```sh
python3 solar-visualiser/reconstruction/prepare_replay.py
node solar-visualiser/tests/replay.test.js
node solar-visualiser/tests/browser-review.cjs
```

After a new `reconstruction/run.py` run, execute `prepare_replay.py` to package
the new record. The historical fit and its code fingerprints stay unchanged by
this presentation-only addition. Pure data checks verify run/story fingerprints, source and
prediction bytes, stage references, encoding roles and image dimensions. Browser
checks cover every milestone, map loading, overlays, previous shape, playback,
scrubbing, deep links, narrow layout and storage isolation over both protocols.

## Later: live reconstruction for a new dataset

Requested follow-up, **not implemented**: reuse this viewer with a live event stream
emitted by the reconstruction adapter. Do not make another address replay Broom
Road's timeline or assumptions. Introduce an append-only event contract with:

- `schemaVersion`, `propertyId`, `runId`, `eventId`, sequence, actual timestamps;
- source revision/hashes, original and prepared image sizes, crop/resize/EXIF
  transforms and coordinate frames;
- event kind: intake, observation, hypothesis, camera fit, geometry proposal,
  comparison, rejection, accepted remote snapshot or requested site evidence;
- evidence roles and labelled regions, actor/method (including user corrections,
  LLM proposals, deterministic fits and survey observations);
- before/after geometry and camera snapshot references, semantic entity IDs,
  changed/frozen parameters and constraint provenance;
- per-view fitting/check residuals, camera/parameter bound hits, unresolved
  attribution, decision outcome and an explicit explanation of the action.

A live transport (SSE or WebSocket when a backend exists) and a saved JSON event
log should feed the same player. A live badge must reflect actual running status;
waiting, rejection and missing inputs need their own states. Pause inspection
without pausing the worker; allow returning to the live head or replaying earlier
snapshots. Show actual solver iterations only when the solver records them. Keep
rejected branches accessible and distinguish an accepted remote hypothesis from
survey verification. Preserve source assets and all snapshot hashes for replay.

Start with recording these events at the existing Python stage boundaries, then
add optimiser callbacks and structured LLM observation proposals. Dataset-specific
adapters and explicit validation gates remain necessary; a generic intake manifest
is not a universal reconstruction engine.

## Rear opening completeness update

The replay now includes **Complete windows** before handover (14 steps). The
`rear-openings` snapshot retains the previous exterior stage and its cameras,
adds two photo-visible recessed rear windows and narrows/lengthens the rear-wing
sash. Gold source polygons mark visible frame regions; dashed purple opening
projections expose the remaining upper-wall alignment mismatch. These new windows
are not covered by the lower glazed-frame fit residual. Full dimensions and
partly hidden extents remain inferred.

`opening-corrections.json` records the evidence and assumptions. The original
user-annotated screenshot is preserved under `reconstruction/evidence/` and is
fingerprinted in both the reconstruction and survey evidence. `run.py` now archives
the previous run in `history/<sha256>.json` before rebuilding, appends this opening
stage and packages the replay automatically. A new candidate with a stale replay
fails the replay contract. This supersedes the earlier manual packaging step.
