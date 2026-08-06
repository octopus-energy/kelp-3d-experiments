// =====================================================================
// Turns the bundled solar-visualiser site data into the shapes the
// explainer needs, in local metres (east, north) with elevations.
//
// CV detections come from a real Roboflow inference run over this tile
// (data/detections.js). The OS site + building outlines are synthesised
// (the real pipeline gets exact MasterMap geometry).
// =====================================================================
window.PE = window.PE || {};

window.PE.prepareData = function () {
  const G = PE.geom;
  const siteData = window.SITE_DATA;
  const dsm = SolarViz.coordinates.decodeDSM(window.__DSM_B64__);
  const coords = SolarViz.coordinates.createCoordinateSystem(siteData, dsm);

  const groundLevel = siteData.property_details.altitude;             // 29 m ODN
  const ridgeElev = groundLevel + siteData.property_details.ridge_height;

  // ---- helpers ------------------------------------------------------
  function ringToLocal(ring) {
    // ring: [[lon, lat, z?], ...] (closed) -> open list of {x, y, z}
    const out = [];
    for (let i = 0; i < ring.length - 1; i++) {
      const [lon, lat, z] = ring[i];
      const [x, y] = coords.lonLatToLocal(lon, lat);
      out.push({ x, y, z: z !== undefined ? z : null });
    }
    return out;
  }

  // Least-squares plane z = a + b·x + c·y through a small set of points.
  function fitPlane(pts) {
    let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
    for (const p of pts) {
      if (p.z === null || !isFinite(p.z)) continue;
      n++; sx += p.x; sy += p.y; sz += p.z;
      sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y;
      sxz += p.x * p.z; syz += p.y * p.z;
    }
    if (n < 3) return { a: groundLevel, b: 0, c: 0 };
    // Solve the 3x3 normal equations with Cramer's rule.
    const A = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]];
    const B = [sz, sxz, syz];
    const det = (m) =>
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const d0 = det(A);
    if (Math.abs(d0) < 1e-9) return { a: groundLevel, b: 0, c: 0 };
    const sub = (col) => A.map((row, i) => row.map((v, j) => (j === col ? B[i] : v)));
    return { a: det(sub(0)) / d0, b: det(sub(1)) / d0, c: det(sub(2)) / d0 };
  }

  const planeZ = (plane, x, y) => plane.a + plane.b * x + plane.c * y;

  // ---- roof faces + panels -----------------------------------------
  const faces = siteData.roof_faces.map((rf, fi) => {
    const pts = ringToLocal(rf.geometry.coordinates[0]);
    const footprint = pts.map((p) => [p.x, p.y]);
    const plane = fitPlane(pts);
    const arrays = (rf.solar_arrays || []).map((arr) => ({
      description: arr.description,
      number_of_panels: arr.number_of_panels,
      annual_output: arr.output ? arr.output.annual_output : 0,
      shading_factor: arr.shading ? arr.shading.shading_factor : null,
      panels: (arr.panels || []).map((p) => {
        const ring = p.geometry.coordinates[0];
        const corners = [];
        for (let i = 0; i < ring.length - 1; i++) {
          const [x, y] = coords.lonLatToLocal(ring[i][0], ring[i][1]);
          corners.push({ x, y, z: planeZ(plane, x, y) });
        }
        return {
          corners,
          shading_factor: p.shading_factor,
          annual_output: p.annual_output,
          orientation: p.orientation,
          watts: p.panel ? p.panel.rated_power_watts : 450,
        };
      }),
    }));
    return {
      index: fi,
      id: rf.id,
      azimuth: rf.azimuth,   // degrees from due south, negative = east
      slope: rf.slope,       // degrees from horizontal
      area: rf.area,
      points: pts,
      footprint,
      plane,
      arrays,
    };
  });

  // ---- obstructions -------------------------------------------------
  const obstructions = siteData.obstructions.map((ob, i) => {
    const ring = ob.geometry.coordinates[0];
    const footprint = [];
    for (let j = 0; j < ring.length - 1; j++) {
      footprint.push(coords.lonLatToLocal(ring[j][0], ring[j][1]));
    }
    const [cx, cy] = G.centroid(footprint);
    return { index: i, footprint, topZ: coords.sampleDSM(cx, cy) };
  });

  // ---- real OS MasterMap outlines (data/os-data.js) ----------------
  // BNG easting/northing → local metres relative to the DSM origin,
  // dropping the repeated closing vertex.
  const bngRingToLocal = (ring) => {
    const pts = ring.map(([e, n]) => [e - dsm.xll, n - dsm.yll]);
    const [x0, y0] = pts[0], [xn, yn] = pts[pts.length - 1];
    if (Math.hypot(x0 - xn, y0 - yn) < 1e-6) pts.pop();
    return pts;
  };
  const buildingOutline = bngRingToLocal(window.OS_DATA.building);
  const siteOutline = bngRingToLocal(window.OS_DATA.site);

  // ---- real CV detections ------------------------------------------
  // Inference runs on a 50 m crop centred on the geocoded point;
  // CV_DETECTIONS.region gives the crop's BNG corner + size.
  const cv = window.CV_DETECTIONS;
  const region = cv.region;
  const regionOrigin = [region.west - dsm.xll, region.south - dsm.yll];
  const imgW = cv.roof_faces.image.width, imgH = cv.roof_faces.image.height;
  const pxToLocal = ([px, py]) => [
    regionOrigin[0] + (px / imgW) * region.size,
    regionOrigin[1] + region.size - (py / imgH) * region.size,
  ];
  const cvRegionLocal = [
    regionOrigin,
    [regionOrigin[0] + region.size, regionOrigin[1]],
    [regionOrigin[0] + region.size, regionOrigin[1] + region.size],
    [regionOrigin[0], regionOrigin[1] + region.size],
  ];

  const cvDetections = [];
  // The pipeline regularises detections with simplification_pixels=2 —
  // exactly 2 px at this crop's scale, Douglas–Peucker, no more.
  const simplifyEps = 2 * (region.size / imgW);
  const addPreds = (preds, kind) => {
    for (const p of preds) {
      if (p.points.length < 3) continue;
      const footprintRaw = p.points.map(pxToLocal);
      const footprint = G.simplifyClosed(footprintRaw, simplifyEps);
      if (footprint.length < 3) continue;
      cvDetections.push({
        footprint,          // regularised — used everywhere
        footprintRaw,       // pixel staircase — step 1 shows the before/after
        confidence: p.confidence,
        cls: p.class,       // 'roof face' | 'conservatory' | 'obstruction'
        kind,
      });
    }
  };
  addPreds(cv.roof_faces.predictions, 'roof');
  addPreds(cv.obstructions.predictions, 'obstruction');
  addPreds(cv.obstructions_dormer.predictions, 'obstruction');

  // Confidences for the production faces, matched from the nearest raw
  // roof-face detection (for the step-4 label).
  faces.forEach((f) => {
    const [fx, fy] = G.centroid(f.footprint);
    let best = null;
    for (const d of cvDetections) {
      if (d.cls !== 'roof face') continue;
      const [dx, dy] = G.centroid(d.footprint);
      const dist = Math.hypot(dx - fx, dy - fy);
      if (!best || dist < best.dist) best = { dist, conf: d.confidence };
    }
    f.confidence = best && best.dist < 6 ? best.conf : 0.85;
  });

  // Flag which raw detections survive the OS site filter (step 2).
  for (const d of cvDetections) {
    const [dx, dy] = G.centroid(d.footprint);
    d.insideSite = G.pointInPolygon([dx, dy], siteOutline);
  }

  // ---- hero face: the most south-facing of the big faces ------------
  // (it has real shading to show in step 6, unlike the shade-free N face)
  const heroFace = faces
    .filter((f) => f.area > 8)
    .reduce((best, f) => (!best || Math.abs(f.azimuth) < Math.abs(best.azimuth) ? f : best), null);

  return {
    siteData, dsm, coords, faces, obstructions,
    buildingOutline, siteOutline, cvDetections, cvRegionLocal,
    heroFace, groundLevel, ridgeElev,
  };
};
