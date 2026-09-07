# kelp-3d-experiments

A collection of standalone 3D visualisation experiments.

## Projects

### [solar-visualiser](solar-visualiser/)

A browser-based 3D viewer for solar panel site surveys, built with [three.js](https://threejs.org/). Point it at a property and it renders the terrain, roof, and a proposed panel layout so you can sanity-check a survey without visiting the site.

**Running it:** it's a static site with no build step — just open `solar-visualiser/index.html` in a browser (`file://` works fine), or serve the folder with any static file server.

**What you see:**
- A 3D scene of the property: terrain from a digital surface model, draped with the actual aerial photo, plus the roof faces, solar panels, and any obstructions (chimneys, vents, etc.)
- A sidebar with site summary stats — suitability outcome, confidence, storeys, ridge height, panel count, estimated annual output — and a legend colour-coding roof faces by orientation (N/S/E/W)
- Toggles to show/hide each layer (terrain, aerial image, roofs, panels, obstructions, rejected roof faces, wireframe terrain), plus sliders for vertical exaggeration, image/roof opacity, and panel mounting height
- A **scaffolding designer**: draw a scaffold run around the building in plan or 3D view, and it auto-generates the scaffold geometry and estimates cost from length × height × a configurable £/m² rate
- Mouse controls: drag to rotate, shift+drag to pan, scroll to zoom, plus a compass for orientation and hover tooltips on roof faces/panels

The site data (property geometry, heightmap, aerial photo) is currently bundled as hardcoded JS in `data/site-data.js` — this is the eventual swap point for a real backend/API. See [solar-visualiser/CLAUDE.md](solar-visualiser/CLAUDE.md) for the module layout if you're diving into the code.

### [pipeline-explainer](pipeline-explainer/)

A step-through 3D explainer of how the solar analysis pipeline works — from a flat aerial photo to a costed panel design. Steps 1–6 mirror the backend's `solar_potential_from_address()`: CV roof detection (real Roboflow output for this tile), OS site/building filtering, DSM → 3D, plane fitting for slope/azimuth (animated live regression), the brute-force panel layout search, and the MCS horizon-scan shading assessment seen from the panel's own point of view. It ends with a three-step MPPT mini-game: drag a string's operating voltage to find the maximum power point, then track it by hand through a simulated June day against a perfect tracker, then feel the two-hump trap of wiring mixed orientations onto one tracker — the physics case for one-orientation-per-string.

Steps 4–6 run faithful mini-reimplementations of the real algorithms live in the browser against the bundled DSM — the simulated panel count and shading factor match the production run.

**Running it:** serve the repo root with any static server (the page references `../solar-visualiser` for vendor libs and site data), or open `pipeline-explainer/index.html` directly via `file://`.
