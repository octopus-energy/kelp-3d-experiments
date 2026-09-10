# 3 Broom Road · WA15 9AR

Open `../index.html` and choose **3 Broom Road** in the Property selector.
A direct link is `../index.html?property=3broomroad` (HTTP or `file://`).
The original PO19 5DZ property remains the default. Saved building edits are
isolated by postcode and coordinates. New JSON model exports identify their
property, and importing one into a different property is rejected. Legacy
exports without an address identifier remain supported.

## Files and regeneration

- `solarpotential.json`, `osdata.json`, `photos/`, `floorplan.png`: supplied source files.
- `dsm.asc`, `aerial.png`: cached copies of `dsm_url` and `image_without_panels_url`
  in the solar export. These make the app work offline.
- `image-manifest.json`: visual photo labels and the floorplan reference. Labels
  are suggestions. No room geometry or landmark correspondences are inferred.
- `property-bundle.js`: generated classic JavaScript containing the solar data,
  OS data, DSM metadata/grid, image manifest and embedded images. Do not edit it.

From the repository root, regenerate after changing source data or annotations:

```sh
python3 solar-visualiser/scripts/prepare-property.py solar-visualiser/3broomroad-data
node solar-visualiser/tests/properties.test.js
```

The preparation script requires Python and Pillow. Running the app needs neither;
there is no application build step, fetch dependency or backend. The script reads
local files only and leaves the supplied source files unchanged.

## What the model represents

The survey contains three 2D roof polygons, 12 proposed panels and 3,476 kWh/year.
For each polygon the generator uses its supplied slope and solar azimuth
(south = 0, west = 90), then estimates the plane's height offset from the median
of DSM samples at least 0.4 m inside the polygon. Median absolute residuals are
0.07–0.12 m. Generated faces retain `height_source` provenance. Existing 3D
polygons, if supplied, retain their elevations. Terrain rendering caps noisy
samples within inferred roof polygons at their estimated plane to keep the
panels visible; the cached source DSM is unchanged.

These roof outlines do not cover the full rear extension shown in the listing
floorplan. The lower ground floor is not represented by the two-storey solar
model. The detected roof sections touch at a point; they are kept as separate
closed shells rather than filling the missing roof with invented geometry.
Floor heights remain estimates and can be adjusted with the ASHP controls.
Use **ASHP → Roof Geometry → Edit roof geometry** to correct the front dormer
and draw the missing extension. These are saved user corrections, separate
from the generated bundle. Add separate faces for each planar roof surface;
use the numeric height/pitch controls and enlarged photo/floorplan references
to check them. Roof changes require photo matches to be reviewed again.
OS building/site outlines are retained in `SITE_DATA.os_data` for inspection;
the current geometry pipeline still derives its model from the solar roof faces.

The floorplan is available under **ASHP → Property Photos → Floorplan**, including
the lower ground floor. Automatic room import is disabled for this property
because room boundaries have not been annotated. Exterior photos can be aligned
manually; no photo poses or facade textures are accepted automatically.

To prepare another property, create a folder with the same source files and an
`image-manifest.json`, run the generator, then register the resulting bundle in
`js/properties.js`. The selector loads only that property's scripts before app
initialisation; it does not load or overwrite the original property's data.

In the roof editor, **Refit selected to DSM** fits the selected face and any
joined faces; **Refit all to DSM** also fits separate roof sections. This adjusts
height and pitch while keeping your outlines. Inspect the cyan sample points
and fit report, then Apply (or Undo/Cancel). Use a separate face for each slope.
A poor ridge position or insufficient dormer samples can prevent a reliable fit;
correct the outline or enter measured heights in those cases.

Sparse dormers no longer block a supported main roof from refitting. Their
previous slopes guide a connected planar shape, shown in purple as **Guided
shape**. Shared joins can change these slopes; review the reported height/pitch
changes against photos. This is inferred geometry, not additional DSM detail.
A roof section with no reliable DSM-supported face stays unchanged.
