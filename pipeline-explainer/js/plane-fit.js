// =====================================================================
// Step 4 demo: fit a plane to the real DSM points inside the hero roof
// face, live in the browser — the same shape as the backend's
// find_best_fit_statsmodels (OLS on z = a + b·x + c·y), plus the three
// competing azimuth candidates it arbitrates between.
// =====================================================================
window.PE = window.PE || {};

window.PE.planeFit = (function () {
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  let cached = null;

  // Sample every DSM cell whose centre falls inside the face footprint.
  function samplePoints(data, face) {
    const { dsm } = data;
    const G = PE.geom;
    const b = G.bounds(face.footprint);
    const cell = dsm.cellsize;
    const pts = [];
    const c0 = Math.max(0, Math.floor(b.minX / cell) - 1);
    const c1 = Math.min(dsm.ncols - 1, Math.ceil(b.maxX / cell) + 1);
    const rowOfNorth = (y) => dsm.nrows - y / cell; // row index grows southward
    const r0 = Math.max(0, Math.floor(rowOfNorth(b.maxY)) - 1);
    const r1 = Math.min(dsm.nrows - 1, Math.ceil(rowOfNorth(b.minY)) + 1);
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const x = (c + 0.5) * cell;
        const y = (dsm.nrows - r - 0.5) * cell;
        if (!G.pointInPolygon([x, y], face.footprint)) continue;
        const z = dsm.grid[r * dsm.ncols + c];
        if (!isFinite(z) || z === dsm.nodata) continue;
        pts.push({ x, y, z });
      }
    }
    return pts;
  }

  function fitOLS(pts) {
    let n = 0, sx = 0, sy = 0, sz = 0, sxx = 0, sxy = 0, syy = 0, sxz = 0, syz = 0;
    for (const p of pts) {
      n++; sx += p.x; sy += p.y; sz += p.z;
      sxx += p.x * p.x; sxy += p.x * p.y; syy += p.y * p.y;
      sxz += p.x * p.z; syz += p.y * p.z;
    }
    const A = [[n, sx, sy], [sx, sxx, sxy], [sy, sxy, syy]];
    const B = [sz, sxz, syz];
    const det = (m) =>
      m[0][0] * (m[1][1] * m[2][2] - m[1][2] * m[2][1]) -
      m[0][1] * (m[1][0] * m[2][2] - m[1][2] * m[2][0]) +
      m[0][2] * (m[1][0] * m[2][1] - m[1][1] * m[2][0]);
    const d0 = det(A);
    const sub = (col) => A.map((row, i) => row.map((v, j) => (j === col ? B[i] : v)));
    const a = det(sub(0)) / d0, b = det(sub(1)) / d0, c = det(sub(2)) / d0;

    let sse = 0, good = 0;
    const residuals = pts.map((p) => {
      const e = p.z - (a + b * p.x + c * p.y);
      sse += e * e;
      if (Math.abs(e) <= 1.0) good++;
      return e;
    });
    const rmse = Math.sqrt(sse / n);
    const slope = deg(Math.atan(Math.hypot(b, c)));
    // downslope unit vector = -gradient
    const gl = Math.hypot(b, c) || 1;
    const down = [-b / gl, -c / gl];
    const azimuth = deg(Math.atan2(-down[0], -down[1])); // S=0, E=-90, W=+90
    return { a, b, c, rmse, pctGood: good / n, slope, azimuth, down, residuals, n };
  }

  // Confidence calibration curve from roof/processing.py
  function confidenceFromRmse(rmse) {
    return 0.25 + 0.75 * Math.exp(-0.715 * rmse);
  }

  // Azimuth of the eave (lowest edge) of the face — "orientation from shape"
  function shapeAzimuth(face) {
    let best = null;
    const pts = face.points;
    for (let i = 0; i < pts.length; i++) {
      const p1 = pts[i], p2 = pts[(i + 1) % pts.length];
      const meanZ = ((p1.z || 0) + (p2.z || 0)) / 2;
      const len = Math.hypot(p2.x - p1.x, p2.y - p1.y);
      if (len < 1.5) continue;
      if (!best || meanZ < best.meanZ) best = { p1, p2, meanZ };
    }
    if (!best) return null;
    // perpendicular to the eave, pointing away from the face centroid
    const [cx, cy] = PE.geom.centroid(face.footprint);
    const ex = best.p2.x - best.p1.x, ey = best.p2.y - best.p1.y;
    const el = Math.hypot(ex, ey);
    let nx = -ey / el, ny = ex / el;
    const mx = (best.p1.x + best.p2.x) / 2, my = (best.p1.y + best.p2.y) / 2;
    if ((mx - cx) * nx + (my - cy) * ny < 0) { nx = -nx; ny = -ny; }
    return { azimuth: deg(Math.atan2(-nx, -ny)), edge: best };
  }

  // Azimuth from the nearest building-outline edge — "orientation from outline"
  function outlineAzimuth(data, face, planeDown) {
    const outline = data.buildingOutline;
    const [fcx, fcy] = PE.geom.centroid(face.footprint);
    let best = null;
    for (let i = 0; i < outline.length; i++) {
      const [x1, y1] = outline[i], [x2, y2] = outline[(i + 1) % outline.length];
      const len = Math.hypot(x2 - x1, y2 - y1);
      if (len < 2) continue;
      // perpendicular candidates
      const ex = (x2 - x1) / len, ey = (y2 - y1) / len;
      for (const s of [1, -1]) {
        const nx = -ey * s, ny = ex * s;
        // keep the perpendicular closest to the plane-fit downslope
        const dot = nx * planeDown[0] + ny * planeDown[1];
        if (!best || dot > best.dot) best = { nx, ny, dot };
      }
    }
    if (!best) return null;
    return { azimuth: deg(Math.atan2(-best.nx, -best.ny)) };
  }

  function compute(data) {
    if (cached) return cached;
    const face = data.heroFace;
    const points = samplePoints(data, face);
    const fit = fitOLS(points);
    const shape = shapeAzimuth(face);
    const outline = outlineAzimuth(data, face, fit.down);
    cached = { face, points, fit, shape, outline };
    return cached;
  }

  // ---- 3D visuals ---------------------------------------------------
  // Builds the point cloud + a plane surface clipped to the EXACT face
  // polygon, both updateable so the regression can be animated: call
  // setParams({a,b,c}) each frame to move the plane and re-colour the
  // residuals. Returns { setParams, addFitArrows, startParams }.
  function build(data, viz) {
    const { face, points, fit } = compute(data);
    const grp = viz.groups.planeFit;
    grp.clear();
    const H = data.coords.HEIGHT;

    // -- point cloud --
    const positions = new Float32Array(points.length * 3);
    const colors = new Float32Array(points.length * 3);
    points.forEach((p, i) => {
      positions[i * 3] = p.x;
      positions[i * 3 + 1] = p.z + 0.06;
      positions[i * 3 + 2] = H - p.y;
    });
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    pg.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    const cloud = new THREE.Points(pg, new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.95 }));
    grp.add(cloud);

    // -- plane surface, clipped to the actual face outline --
    const footprint = face.footprint;
    const tris = PE.geom.triangulate(footprint);
    const fillGeom = new THREE.BufferGeometry();
    const fillPos = new Float32Array(tris.length * 9);
    fillGeom.setAttribute('position', new THREE.BufferAttribute(fillPos, 3));
    const fillMesh = new THREE.Mesh(
      fillGeom,
      new THREE.MeshBasicMaterial({ color: 0x5ec8ca, transparent: true, opacity: 0.22, side: THREE.DoubleSide, depthWrite: false })
    );
    grp.add(fillMesh);
    const linePts = footprint.concat([footprint[0]]);
    const lineGeom = new THREE.BufferGeometry();
    const linePos = new Float32Array(linePts.length * 3);
    lineGeom.setAttribute('position', new THREE.BufferAttribute(linePos, 3));
    const line = new THREE.Line(lineGeom, new THREE.LineBasicMaterial({ color: 0x5ec8ca, transparent: true, opacity: 0.95 }));
    grp.add(line);

    const cGood = new THREE.Color(0x6ec97a);
    const cMid = new THREE.Color(0xf5b942);
    const cBad = new THREE.Color(0xe05c5c);

    function setParams(p) {
      const zAt = (x, y) => p.a + p.b * x + p.c * y;
      // plane fill + outline follow the face polygon exactly
      let vi = 0;
      for (const tri of tris) {
        for (const ti of tri) {
          const [x, y] = footprint[ti];
          fillPos[vi++] = x; fillPos[vi++] = zAt(x, y) + 0.04; fillPos[vi++] = H - y;
        }
      }
      fillGeom.attributes.position.needsUpdate = true;
      linePts.forEach(([x, y], i) => {
        linePos[i * 3] = x; linePos[i * 3 + 1] = zAt(x, y) + 0.05; linePos[i * 3 + 2] = H - y;
      });
      lineGeom.attributes.position.needsUpdate = true;

      // residual colouring + live rmse
      let sse = 0;
      points.forEach((pt, i) => {
        const e = pt.z - zAt(pt.x, pt.y);
        sse += e * e;
        const ae = Math.abs(e);
        const col = ae < 0.18 ? cGood : ae < 0.5 ? cMid : cBad;
        colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
      });
      pg.attributes.color.needsUpdate = true;
      const slope = (Math.atan(Math.hypot(p.b, p.c)) * 180) / Math.PI;
      return { rmse: Math.sqrt(sse / points.length), slope };
    }

    // arrows appear once the fit has converged
    function addFitArrows() {
      const [cx, cy] = PE.geom.centroid(footprint);
      const cz = fit.a + fit.b * cx + fit.c * cy;
      const centre = viz.toScene(cx, cy, cz);
      // Plane z = a + b·x + c·y has normal ∝ (-b, -c, 1) in (E, N, up);
      // scene axes are X=east, Y=up, Z=south so north flips sign.
      const normal = new THREE.Vector3(-fit.b, 1, fit.c).normalize();
      grp.add(new THREE.ArrowHelper(normal, centre, 3.2, 0x5ec8ca, 0.7, 0.35));
      const downOnPlane = new THREE.Vector3(
        fit.down[0],
        fit.b * fit.down[0] + fit.c * fit.down[1],
        -fit.down[1]
      ).normalize();
      grp.add(new THREE.ArrowHelper(downOnPlane, centre, 3.0, 0xf5b942, 0.7, 0.35));
      viz.catalogueOpacity(grp);
    }

    const meanZ = points.reduce((s, p) => s + p.z, 0) / points.length;
    const startParams = { a: meanZ, b: 0, c: 0 };
    setParams(startParams);
    viz.catalogueOpacity(grp);
    return { setParams, addFitArrows, startParams, finalParams: { a: fit.a, b: fit.b, c: fit.c } };
  }

  function addCandidateArrows(data, viz) {
    const { face, fit, shape, outline } = compute(data);
    const grp = viz.groups.planeFit;
    const [cx, cy] = PE.geom.centroid(face.footprint);
    const cz = fit.a + fit.b * cx + fit.c * cy + 1.1;

    const candidates = [
      { az: fit.azimuth, colour: 0x5ec8ca, name: 'plane fit', off: 0 },
      shape ? { az: shape.azimuth, colour: 0xff922b, name: 'shape edge', off: 0.55 } : null,
      outline ? { az: outline.azimuth, colour: 0xff4dc4, name: 'OS outline', off: 1.1 } : null,
    ].filter(Boolean);

    const made = [];
    for (const c of candidates) {
      const a = rad(c.az);
      const dir = new THREE.Vector3(-Math.sin(a), 0, Math.cos(a)); // az→scene: E=-90 → +X
      const origin = viz.toScene(cx, cy, cz + c.off);
      const arrow = new THREE.ArrowHelper(dir, origin, 4.2, c.colour, 0.8, 0.4);
      grp.add(arrow);
      const tip = origin.clone().addScaledVector(dir, 4.9);
      made.push({ ...c, tip });
    }
    viz.catalogueOpacity(grp);
    return made;
  }

  return { compute, build, addCandidateArrows, confidenceFromRmse };
})();
