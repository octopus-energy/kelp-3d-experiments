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
- A **mode toggle** at the top switches between **Solar** (survey, panels, scaffolding), **ASHP** (the building model below), and **EVC** (placeholder, coming soon)
- A **building model** (ASHP mode): turns the recognised roof faces into a regularised, watertight solid (vertices snapped to roof-plane intersections, footprint squared up, walls extruded to ground), slices it into floors with configurable storey height and slab thickness, lets you partition each floor into rooms by drawing dividing walls in plan view, and place windows (real holes with glass) and radiators on the walls. Edits persist locally and can be exported/imported as JSON — the same format a traced estate-agent floorplan will eventually feed into
- **Property images** (ASHP mode): the listing photos and floorplan in `data/images/` are described by an AI-generated manifest (`data/image-data.js` — classification, room guesses, floorplan room rectangles with printed dimensions, plus a structured read of the agent's description: window sides and radiator counts per room; suggestions only, produced offline). A photo gallery shows them in the sidebar, and **Import rooms from floorplan** fits the plan onto a floor (scale from the printed dimensions, orientation + translation from an outline fit, nudge buttons to correct), converts the plan's rooms into ordinary dividing walls, and labels/types the resulting rooms — one click from empty floor to a named, editable room layout
- **Editable, parametric model**: imported walls stay square to the building axes and every wall is directly editable — click to select, drag sideways to move (attached walls follow), delete outright — with the floorplan still visible as a toggleable underlay. The roof-derived footprint itself is editable too: drag its corner handles (edges snap square) and the change flows downstream — walls re-extrude, floors re-slice, rooms re-snap, windows rebind — with edits persisted separately so the derived model can always be reset
- Mouse controls: drag to rotate, shift+drag to pan, scroll to zoom, plus a compass for orientation and hover tooltips on roof faces/panels

The site data (property geometry, heightmap, aerial photo) is currently bundled as hardcoded JS in `data/site-data.js` — this is the eventual swap point for a real backend/API. See [solar-visualiser/CLAUDE.md](solar-visualiser/CLAUDE.md) for the module layout if you're diving into the code.
