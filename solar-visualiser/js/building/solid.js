// =====================================================================
// Watertight building solid from recognised roof faces.
//
// Pipeline: fit a plane per face → cluster nearby vertices across faces
// (union-find) → re-derive each cluster position from the planes that
// meet there (3-plane point / 2-plane ridge line / 1-plane eave) →
// level eave heights → chain boundary edges into the footprint loop →
// straighten + orthogonalise the footprint → extrude wall panels down
// to ground → ground cap → indexed triangle soup + watertight check.
//
// The compute half (buildSolid) is pure data in/out and runs in node
// for tests; the mesh builders at the bottom need THREE and only run
// in the browser.
// =====================================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./geometry.js'));
  } else {
    root.SolarViz = root.SolarViz || {};
    root.SolarViz.buildingSolid = factory(root.SolarViz.buildingGeometry);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (G) {

  const DEFAULTS = {
    snapTol: 0.7,        // vertex clustering distance (m)
    eaveTol: 0.35,       // eave-height grouping tolerance (m)
    straightenDeg: 6,    // collapse footprint kinks below this turn angle
    orthogonalize: true,
    angleSnapDeg: 10,    // snap footprint edges within this of the dominant axes
    groundY: 0,
  };

  // inputFaces: [{ id, active, ring: [{x,y,z}, ...] }] (open rings, scene coords)
  function buildSolid(inputFaces, opts) {
    const cfg = Object.assign({}, DEFAULTS, opts);
    const warnings = [];

    // -- 1. rings + fitted planes ------------------------------------
    const faces = inputFaces
      .map((f) => {
        const ring = f.ring.slice();
        while (ring.length > 1 && dist3(ring[0], ring[ring.length - 1]) < 1e-9) ring.pop();
        return { id: f.id, active: f.active !== false, ring, plane: G.fitPlane(ring) };
      })
      .filter((f) => f.ring.length >= 3);
    if (!faces.length) return null;

    // -- 2. cluster vertices across (and within) rings ---------------
    const verts = [];
    faces.forEach((f, fi) => f.ring.forEach((p, vi) => verts.push({ fi, vi, x: p.x, y: p.y, z: p.z })));
    const dsu = G.createDSU(verts.length);
    for (let i = 0; i < verts.length; i++) {
      for (let j = i + 1; j < verts.length; j++) {
        if (dist3(verts[i], verts[j]) < cfg.snapTol) dsu.union(i, j);
      }
    }
    const clusterOf = new Map();  // dsu root -> cluster index
    const clusters = [];          // { x, y, z, faceIds:Set }
    const ringClusters = faces.map(() => []); // per face: ring position -> cluster index
    verts.forEach((v, i) => {
      const rootI = dsu.find(i);
      if (!clusterOf.has(rootI)) {
        clusterOf.set(rootI, clusters.length);
        clusters.push({ x: 0, y: 0, z: 0, n: 0, faceIds: new Set() });
      }
      const ci = clusterOf.get(rootI);
      const c = clusters[ci];
      c.x += v.x; c.y += v.y; c.z += v.z; c.n++;
      c.faceIds.add(v.fi);
      ringClusters[v.fi][v.vi] = ci;
    });
    clusters.forEach((c) => { c.x /= c.n; c.y /= c.n; c.z /= c.n; });

    // -- 3. re-derive cluster positions from incident planes ---------
    clusters.forEach((c) => {
      const planes = distinctPlanes([...c.faceIds].map((fi) => faces[fi].plane), c);
      if (planes.length >= 3) {
        const p = G.intersectPlanes(planes);
        if (p && dist3(p, c) < cfg.snapTol * 2.5) { c.x = p.x; c.y = p.y; c.z = p.z; return; }
      }
      if (planes.length >= 2) {
        // most-divergent pair gives the stablest ridge/valley line
        let pa = planes[0], pb = planes[1], bestD = -1;
        for (let i = 0; i < planes.length; i++) {
          for (let j = i + 1; j < planes.length; j++) {
            const d = Math.abs(planes[i].a - planes[j].a) + Math.abs(planes[i].b - planes[j].b);
            if (d > bestD) { bestD = d; pa = planes[i]; pb = planes[j]; }
          }
        }
        const line = G.planePlaneLine2D(pa, pb);
        if (line) {
          const [x, z] = G.projectOntoLine2D(line, c.x, c.z);
          if (Math.hypot(x - c.x, z - c.z) < cfg.snapTol * 2.5) {
            c.x = x; c.z = z; c.y = G.planeY(pa, x, z);
            return;
          }
        }
      }
      c.y = G.planeY(faces[[...c.faceIds][0]].plane, c.x, c.z);
    });

    // -- 4. rebuild rings on cluster ids -----------------------------
    faces.forEach((f, fi) => {
      const ids = [];
      ringClusters[fi].forEach((cid) => {
        if (ids.length && ids[ids.length - 1] === cid) return; // collapsed edge
        ids.push(cid);
      });
      while (ids.length > 1 && ids[0] === ids[ids.length - 1]) ids.pop();
      // non-consecutive repeats pinch the ring; drop later occurrences
      const seen = new Set();
      f.ids = ids.filter((id) => {
        if (seen.has(id)) { warnings.push(`face ${f.id}: pinched ring, dropped repeat vertex`); return false; }
        seen.add(id);
        return true;
      });
    });
    const keptFaces = faces.filter((f) => {
      if (f.ids.length < 3) { warnings.push(`face ${f.id}: degenerate after clustering, dropped`); return false; }
      return true;
    });

    // -- 5. edge classification --------------------------------------
    const edgeFaces = new Map(); // "a|b" (a<b) -> [faceIdx]
    keptFaces.forEach((f, ki) => {
      for (let i = 0; i < f.ids.length; i++) {
        const a = f.ids[i], b = f.ids[(i + 1) % f.ids.length];
        const k = a < b ? a + '|' + b : b + '|' + a;
        if (!edgeFaces.has(k)) edgeFaces.set(k, []);
        edgeFaces.get(k).push(ki);
      }
    });
    const boundaryEdges = [];
    edgeFaces.forEach((fs, k) => {
      if (fs.length === 1) boundaryEdges.push(k.split('|').map(Number));
      else if (fs.length > 2) warnings.push(`non-manifold roof edge ${k} (${fs.length} faces)`);
    });

    // -- 6. eave levelling -------------------------------------------
    const boundaryIds = [...new Set(boundaryEdges.flat())];
    const sorted = boundaryIds.map((id) => ({ id, y: clusters[id].y })).sort((p, q) => p.y - q.y);
    let group = [];
    const flushGroup = () => {
      if (!group.length) return;
      const mean = group.reduce((s, g) => s + g.y, 0) / group.length;
      group.forEach((g) => { clusters[g.id].y = mean; });
      group = [];
    };
    sorted.forEach((g) => {
      if (group.length && g.y - group[group.length - 1].y > cfg.eaveTol) flushGroup();
      group.push(g);
    });
    flushGroup();

    // -- 7. footprint loops + regularisation -------------------------
    const chained = G.chainEdgesToLoops(boundaryEdges);
    if (chained.leftovers) warnings.push(`${chained.leftovers} boundary edges did not chain into loops`);
    if (!chained.loops.length) return null;

    chained.loops.forEach((loop) => {
      if (loop.length < 4) return;
      let poly = loop.map((id) => [clusters[id].x, clusters[id].z]);
      poly = G.straightenCollinear(poly, cfg.straightenDeg);
      if (cfg.orthogonalize) poly = G.orthogonalizeLoop(poly, { angleSnapDeg: cfg.angleSnapDeg });
      loop.forEach((id, i) => { clusters[id].x = poly[i][0]; clusters[id].z = poly[i][1]; });
    });
    const loops = chained.loops
      .map((ids) => ({ ids, poly: ids.map((id) => [clusters[id].x, clusters[id].z]) }))
      .sort((a, b) => Math.abs(G.polygonArea(b.poly)) - Math.abs(G.polygonArea(a.poly)));
    const footprint = loops[0].poly;

    // Dominant axis angle (for axis-snapped room drawing later).
    let axisAngle = 0, bestLen = 0;
    for (let i = 0; i < footprint.length; i++) {
      const a = footprint[i], b = footprint[(i + 1) % footprint.length];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      if (len > bestLen) { bestLen = len; axisAngle = Math.atan2(b[1] - a[1], b[0] - a[0]); }
    }

    // Plan-view polygon per face (positions are final from here on).
    keptFaces.forEach((f) => {
      f.plan = f.ids.map((id) => [clusters[id].x, clusters[id].z]);
    });

    // -- 8. wall panels ----------------------------------------------
    const groundY = cfg.groundY;
    const wallPanels = [];
    loops.forEach((loop, li) => {
      const n = loop.ids.length;
      for (let i = 0; i < n; i++) {
        const aId = loop.ids[i], bId = loop.ids[(i + 1) % n];
        const a = clusters[aId], b = clusters[bId];
        const len = Math.hypot(b.x - a.x, b.z - a.z);
        if (len < 1e-6) continue;
        const dir = [(b.x - a.x) / len, (b.z - a.z) / len];
        let nrm = [dir[1], -dir[0]];
        const mx = (a.x + b.x) / 2 + nrm[0] * 0.05, mz = (a.z + b.z) / 2 + nrm[1] * 0.05;
        if (G.pointInPolygon(loop.poly, mx, mz)) nrm = [-nrm[0], -nrm[1]];
        wallPanels.push({
          id: 'w' + wallPanels.length, loop: li, aId, bId,
          a2: [a.x, a.z], b2: [b.x, b.z], dir, normal: nrm,
          len, bottom: groundY, topA: a.y, topB: b.y,
        });
      }
    });

    // -- 9. indexed triangle soup ------------------------------------
    const usedClusters = new Set();
    keptFaces.forEach((f) => f.ids.forEach((id) => usedClusters.add(id)));
    const meshVerts = [];
    const topIndex = new Map(), bottomIndex = new Map();
    usedClusters.forEach((id) => {
      topIndex.set(id, meshVerts.length);
      meshVerts.push({ x: clusters[id].x, y: clusters[id].y, z: clusters[id].z });
    });
    boundaryIds.forEach((id) => {
      bottomIndex.set(id, meshVerts.length);
      meshVerts.push({ x: clusters[id].x, y: groundY, z: clusters[id].z });
    });

    const tris = [];
    const pushTri = (i, j, k, upSign) => {
      // orient so the normal's y-component matches upSign (+1 up, -1 down)
      const a = meshVerts[i], b = meshVerts[j], c = meshVerts[k];
      const ny = (c.x - a.x) * (b.z - a.z) - (c.z - a.z) * (b.x - a.x);
      if (ny * upSign >= 0) tris.push([i, j, k]);
      else tris.push([i, k, j]);
    };

    keptFaces.forEach((f) => {
      G.triangulatePolygon(f.plan).forEach(([p, q, r]) => {
        pushTri(topIndex.get(f.ids[p]), topIndex.get(f.ids[q]), topIndex.get(f.ids[r]), +1);
      });
    });
    wallPanels.forEach((w) => {
      const at = topIndex.get(w.aId), bt = topIndex.get(w.bId);
      const ab = bottomIndex.get(w.aId), bb = bottomIndex.get(w.bId);
      // outward-facing quad: bottom a -> bottom b -> top b -> top a
      pushWallTri(tris, meshVerts, ab, bb, bt, w.normal);
      pushWallTri(tris, meshVerts, ab, bt, at, w.normal);
    });
    loops.forEach((loop) => {
      G.triangulatePolygon(loop.poly).forEach(([p, q, r]) => {
        pushTri(bottomIndex.get(loop.ids[p]), bottomIndex.get(loop.ids[q]), bottomIndex.get(loop.ids[r]), -1);
      });
    });

    const watertight = G.watertightCheck(tris);

    // -- 10. derived stats + helpers ---------------------------------
    let ridgeY = -Infinity, eaveY = Infinity;
    usedClusters.forEach((id) => { ridgeY = Math.max(ridgeY, clusters[id].y); });
    boundaryIds.forEach((id) => { eaveY = Math.min(eaveY, clusters[id].y); });

    const solid = {
      clusters, faces: keptFaces, loops, footprint, wallPanels,
      verts: meshVerts, tris, watertight, warnings,
      groundY, eaveY, ridgeY, axisAngle,
      footprintArea: Math.abs(G.polygonArea(footprint)),
    };
    solid.roofHeightAt = (x, z) => {
      let best = null;
      keptFaces.forEach((f) => {
        if (G.pointInPolygon(f.plan, x, z)) {
          const y = G.planeY(f.plane, x, z);
          if (best === null || y < best) best = y;
        }
      });
      return best;
    };
    return solid;
  }

  function pushWallTri(tris, meshVerts, i, j, k, outward2) {
    const a = meshVerts[i], b = meshVerts[j], c = meshVerts[k];
    // wall triangle normal (only x/z matter for a vertical wall)
    const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
    const vx = c.x - a.x, vy = c.y - a.y, vz = c.z - a.z;
    const nx = uy * vz - uz * vy, nz = ux * vy - uy * vx;
    if (nx * outward2[0] + nz * outward2[1] >= 0) tris.push([i, j, k]);
    else tris.push([i, k, j]);
  }

  function dist3(p, q) { return Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z); }

  // Deduplicate near-identical planes (parallel faces meeting at a
  // shared ridge look like one plane for intersection purposes).
  function distinctPlanes(planes, at) {
    const out = [];
    planes.forEach((p) => {
      const dup = out.some((q) => {
        const na = normalOf(p), nb = normalOf(q);
        const dot = na[0] * nb[0] + na[1] * nb[1] + na[2] * nb[2];
        if (dot < Math.cos((3 * Math.PI) / 180)) return false;
        return Math.abs(G.planeY(p, at.x, at.z) - G.planeY(q, at.x, at.z)) < 0.15;
      });
      if (!dup) out.push(p);
    });
    return out;
  }
  function normalOf(p) {
    const l = Math.hypot(p.a, 1, p.b);
    return [-p.a / l, 1 / l, -p.b / l];
  }

  // ==================================================================
  // THREE mesh builders (browser only)
  // ==================================================================

  // Geometry for one wall panel in wall-local (u = along wall, v = world
  // y) space, with optional rectangular holes, transformed into place.
  // Used both here and by openings.js when windows punch holes.
  function wallGeometry(panel, holes) {
    const shape = new THREE.Shape();
    shape.moveTo(0, panel.bottom);
    shape.lineTo(panel.len, panel.bottom);
    shape.lineTo(panel.len, panel.topB);
    shape.lineTo(0, panel.topA);
    shape.closePath();
    (holes || []).forEach((h) => {
      const path = new THREE.Path();
      path.moveTo(h.u0, h.v0);
      path.lineTo(h.u1, h.v0);
      path.lineTo(h.u1, h.v1);
      path.lineTo(h.u0, h.v1);
      path.closePath();
      shape.holes.push(path);
    });
    const geom = new THREE.ShapeGeometry(shape);
    geom.applyMatrix4(wallMatrix(panel));
    geom.computeVertexNormals();
    return geom;
  }

  // Basis: X = along-wall dir, Y = up, Z = outward normal. Shape-space
  // (u, v, 0) lands on the wall plane through panel.a2. This basis is
  // left-handed on half the walls, which is fine for baking vertex
  // positions (each column maps its axis directly) — but never derive a
  // quaternion from it; reflections silently corrupt rotations.
  function wallMatrix(panel) {
    const m = new THREE.Matrix4();
    m.makeBasis(
      new THREE.Vector3(panel.dir[0], 0, panel.dir[1]),
      new THREE.Vector3(0, 1, 0),
      new THREE.Vector3(panel.normal[0], 0, panel.normal[1])
    );
    m.setPosition(panel.a2[0], 0, panel.a2[1]);
    return m;
  }

  function buildSolidMeshes(solid, mats) {
    const group = new THREE.Group();

    // Roof: non-indexed for crisp flat shading
    const roofPos = [];
    solid.faces.forEach((f) => {
      G.triangulatePolygon(f.plan).forEach((tri) => {
        // wind for upward normals
        const pts = tri.map((i) => solid.clusters[f.ids[i]]);
        const ny = (pts[2].x - pts[0].x) * (pts[1].z - pts[0].z) - (pts[2].z - pts[0].z) * (pts[1].x - pts[0].x);
        const order = ny >= 0 ? [0, 1, 2] : [0, 2, 1];
        order.forEach((o) => roofPos.push(pts[o].x, pts[o].y, pts[o].z));
      });
    });
    const roofGeom = new THREE.BufferGeometry();
    roofGeom.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
    roofGeom.computeVertexNormals();
    const roofMesh = new THREE.Mesh(roofGeom, mats.roof);
    group.add(roofMesh);

    // Walls: one mesh per panel so openings can rebuild individually
    const wallMeshes = [];
    solid.wallPanels.forEach((w) => {
      const mesh = new THREE.Mesh(wallGeometry(w, []), mats.wall);
      mesh.userData = { type: 'building-wall', wallId: w.id };
      group.add(mesh);
      wallMeshes.push(mesh);
    });

    // Ground cap
    const groundPos = [];
    solid.loops.forEach((loop) => {
      G.triangulatePolygon(loop.poly).forEach((tri) => {
        const pts = tri.map((i) => loop.poly[i]);
        const ny = (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]) - (pts[2][1] - pts[0][1]) * (pts[1][0] - pts[0][0]);
        const order = ny <= 0 ? [0, 1, 2] : [0, 2, 1]; // face down
        order.forEach((o) => groundPos.push(pts[o][0], solid.groundY, pts[o][1]));
      });
    });
    const groundGeom = new THREE.BufferGeometry();
    groundGeom.setAttribute('position', new THREE.Float32BufferAttribute(groundPos, 3));
    groundGeom.computeVertexNormals();
    group.add(new THREE.Mesh(groundGeom, mats.wall));

    // Feature edges: roof edges + wall verticals + base loop
    const edgePos = [];
    const pushEdge = (p, q) => edgePos.push(p.x, p.y, p.z, q.x, q.y, q.z);
    const seen = new Set();
    solid.faces.forEach((f) => {
      for (let i = 0; i < f.ids.length; i++) {
        const a = f.ids[i], b = f.ids[(i + 1) % f.ids.length];
        const k = a < b ? a + '|' + b : b + '|' + a;
        if (seen.has(k)) continue;
        seen.add(k);
        pushEdge(solid.clusters[a], solid.clusters[b]);
      }
    });
    solid.loops.forEach((loop) => {
      loop.ids.forEach((id, i) => {
        const c = solid.clusters[id];
        const g = { x: c.x, y: solid.groundY, z: c.z };
        pushEdge(c, g);
        const nId = loop.ids[(i + 1) % loop.ids.length];
        const nc = solid.clusters[nId];
        pushEdge(g, { x: nc.x, y: solid.groundY, z: nc.z });
      });
    });
    const edgeGeom = new THREE.BufferGeometry();
    edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePos, 3));
    const edgeLines = new THREE.LineSegments(edgeGeom, mats.edge);
    edgeLines.renderOrder = 3;
    group.add(edgeLines);

    return { group, roofMesh, wallMeshes, edgeLines };
  }

  return { buildSolid, wallGeometry, wallMatrix, buildSolidMeshes, DEFAULTS };
});
