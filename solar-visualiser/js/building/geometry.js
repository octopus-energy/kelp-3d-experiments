// =====================================================================
// Pure geometry helpers for the building-model pipeline. No THREE, no
// DOM — usable from node for tests (see tests/building-geometry.test.js).
//
// Conventions: 3D points are {x, y, z} with y up; plan (2D) points are
// [x, z] arrays. Planes are {a, b, c} meaning y = a*x + b*z + c (roof
// faces are never vertical, so this form is always valid here).
// =====================================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) module.exports = factory();
  else {
    root.SolarViz = root.SolarViz || {};
    root.SolarViz.buildingGeometry = factory();
  }
})(typeof window !== 'undefined' ? window : globalThis, function () {

  // ------------------------------------------------------------------
  // Planes
  // ------------------------------------------------------------------

  // Least-squares fit of y = a*x + b*z + c to {x,y,z} points.
  function fitPlane(pts) {
    let cx = 0, cy = 0, cz = 0;
    for (const p of pts) { cx += p.x; cy += p.y; cz += p.z; }
    const n = pts.length;
    cx /= n; cy /= n; cz /= n;
    let Sxx = 0, Szz = 0, Sxz = 0, Sxy = 0, Szy = 0;
    for (const p of pts) {
      const dx = p.x - cx, dy = p.y - cy, dz = p.z - cz;
      Sxx += dx * dx; Szz += dz * dz; Sxz += dx * dz; Sxy += dx * dy; Szy += dz * dy;
    }
    const det = Sxx * Szz - Sxz * Sxz;
    let a = 0, b = 0;
    if (Math.abs(det) > 1e-9) {
      a = (Szz * Sxy - Sxz * Szy) / det;
      b = (Sxx * Szy - Sxz * Sxy) / det;
    }
    return { a, b, c: cy - a * cx - b * cz };
  }

  const planeY = (pl, x, z) => pl.a * x + pl.b * z + pl.c;

  // Intersection point of 3+ planes, least squares over rows
  // [a, b, -1]·[x, z, y]ᵀ = -c. Returns {x,y,z} or null if degenerate.
  function intersectPlanes(planes) {
    // Normal equations AᵀA s = Aᵀr for s = [x, z, y]
    let M = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], r = [0, 0, 0];
    for (const p of planes) {
      const row = [p.a, p.b, -1], rhs = -p.c;
      for (let i = 0; i < 3; i++) {
        for (let j = 0; j < 3; j++) M[i][j] += row[i] * row[j];
        r[i] += row[i] * rhs;
      }
    }
    const s = solve3(M, r);
    return s && { x: s[0], z: s[1], y: s[2] };
  }

  function solve3(M, r) {
    const [[m00, m01, m02], [m10, m11, m12], [m20, m21, m22]] = M;
    const det =
      m00 * (m11 * m22 - m12 * m21) -
      m01 * (m10 * m22 - m12 * m20) +
      m02 * (m10 * m21 - m11 * m20);
    if (Math.abs(det) < 1e-9) return null;
    const inv = 1 / det;
    return [
      inv * ((m11 * m22 - m12 * m21) * r[0] + (m02 * m21 - m01 * m22) * r[1] + (m01 * m12 - m02 * m11) * r[2]),
      inv * ((m12 * m20 - m10 * m22) * r[0] + (m00 * m22 - m02 * m20) * r[1] + (m02 * m10 - m00 * m12) * r[2]),
      inv * ((m10 * m21 - m11 * m20) * r[0] + (m01 * m20 - m00 * m21) * r[1] + (m00 * m11 - m01 * m10) * r[2]),
    ];
  }

  // The plan-view line where two planes meet: (a1-a2)x + (b1-b2)z +
  // (c1-c2) = 0. Returns null when planes are near-parallel.
  function planePlaneLine2D(p1, p2) {
    const na = p1.a - p2.a, nb = p1.b - p2.b, nc = p1.c - p2.c;
    const len = Math.hypot(na, nb);
    if (len < 1e-6) return null;
    return { nx: na / len, nz: nb / len, d: nc / len }; // nx*x + nz*z + d = 0
  }

  const projectOntoLine2D = (line, x, z) => {
    const t = line.nx * x + line.nz * z + line.d;
    return [x - line.nx * t, z - line.nz * t];
  };

  // ------------------------------------------------------------------
  // Union-find
  // ------------------------------------------------------------------
  function createDSU(n) {
    const parent = Array.from({ length: n }, (_, i) => i);
    function find(i) {
      while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; }
      return i;
    }
    return { find, union: (i, j) => { parent[find(i)] = find(j); } };
  }

  // ------------------------------------------------------------------
  // 2D polygon basics (poly = [[x,z],...], open ring, no repeated last)
  // ------------------------------------------------------------------
  function polygonArea(poly) { // signed
    let s = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
      s += x1 * z2 - x2 * z1;
    }
    return s / 2;
  }

  function polygonCentroid(poly) {
    let a = 0, cx = 0, cz = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, z1] = poly[i], [x2, z2] = poly[(i + 1) % poly.length];
      const w = x1 * z2 - x2 * z1;
      a += w; cx += (x1 + x2) * w; cz += (z1 + z2) * w;
    }
    if (Math.abs(a) < 1e-12) return poly[0].slice();
    return [cx / (3 * a), cz / (3 * a)];
  }

  function pointInPolygon(poly, x, z) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, zi] = poly[i], [xj, zj] = poly[j];
      if ((zi > z) !== (zj > z) && x < ((xj - xi) * (z - zi)) / (zj - zi) + xi) inside = !inside;
    }
    return inside;
  }

  function distPointToSegment(px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az;
    const l2 = dx * dx + dz * dz;
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / l2));
    return { d: Math.hypot(px - (ax + t * dx), pz - (az + t * dz)), t, x: ax + t * dx, z: az + t * dz };
  }

  // ------------------------------------------------------------------
  // Edge-loop chaining: edges = [[idA, idB], ...] → ordered id loops.
  // Assumes each id has exactly 2 incident edges (2-regular graph);
  // returns { loops: [[id,...]], leftovers: n } for anything unchained.
  // ------------------------------------------------------------------
  function chainEdgesToLoops(edges) {
    const adj = new Map();
    const addAdj = (a, b) => {
      if (!adj.has(a)) adj.set(a, []);
      adj.get(a).push(b);
    };
    edges.forEach(([a, b]) => { addAdj(a, b); addAdj(b, a); });
    const used = new Set();
    const key = (a, b) => (a < b ? a + '|' + b : b + '|' + a);
    const loops = [];
    let leftovers = 0;
    edges.forEach(([a0, b0]) => {
      if (used.has(key(a0, b0))) return;
      const loop = [a0];
      let prev = a0, cur = b0;
      used.add(key(a0, b0));
      let guard = edges.length + 2;
      while (cur !== a0 && guard-- > 0) {
        loop.push(cur);
        const nexts = (adj.get(cur) || []).filter((n) => n !== prev && !used.has(key(cur, n)));
        if (!nexts.length) { leftovers += loop.length; return; }
        used.add(key(cur, nexts[0]));
        prev = cur; cur = nexts[0];
      }
      if (cur === a0) loops.push(loop);
      else leftovers += loop.length;
    });
    return { loops, leftovers };
  }

  // ------------------------------------------------------------------
  // Loop regularisation. Vertices are never added or removed (walls and
  // roof share them — removal would create T-vertices); they only move.
  // ------------------------------------------------------------------

  // Straighten near-collinear vertices: project any vertex whose turn
  // angle is below angTolDeg onto the chord of its neighbours.
  function straightenCollinear(loop, angTolDeg) {
    const out = loop.map((p) => p.slice());
    const n = loop.length;
    for (let i = 0; i < n; i++) {
      const a = out[(i + n - 1) % n], p = out[i], b = out[(i + 1) % n];
      const v1x = p[0] - a[0], v1z = p[1] - a[1];
      const v2x = b[0] - p[0], v2z = b[1] - p[1];
      const l1 = Math.hypot(v1x, v1z), l2 = Math.hypot(v2x, v2z);
      if (l1 < 1e-9 || l2 < 1e-9) continue;
      const cross = v1x * v2z - v1z * v2x;
      const dot = v1x * v2x + v1z * v2z;
      const turn = Math.abs(Math.atan2(cross, dot)) * 180 / Math.PI;
      if (turn < angTolDeg) {
        const s = distPointToSegment(p[0], p[1], a[0], a[1], b[0], b[1]);
        out[i] = [s.x, s.z];
      }
    }
    return out;
  }

  // Snap loop edges to the building's dominant axis pair. Edges within
  // angleSnapDeg of the dominant direction (mod 90°) get exactly that
  // direction; short edges (wall jogs where a wing steps back from the
  // main block) snap to the nearest axis regardless, since their
  // endpoints barely move. Consecutive same-direction edges share one
  // line (weighted average offset); vertices are re-derived by
  // intersecting neighbouring edge lines. Falls back to the input on
  // large area change/displacement.
  function orthogonalizeLoop(loop, opts) {
    const angleSnapDeg = (opts && opts.angleSnapDeg) || 10;
    const shortEdge = (opts && opts.shortEdge) || 1.3;      // metres
    const shortSnapDeg = (opts && opts.shortSnapDeg) || 44.9;
    const maxShift = (opts && opts.maxShift) || 1.0;
    const n = loop.length;
    if (n < 3) return loop;

    // Edge angles mod 90°, length-weighted circular mean around the
    // strongest 1°-histogram bin.
    const edges = [];
    for (let i = 0; i < n; i++) {
      const a = loop[i], b = loop[(i + 1) % n];
      const dx = b[0] - a[0], dz = b[1] - a[1];
      const len = Math.hypot(dx, dz);
      const ang = ((Math.atan2(dz, dx) * 180 / Math.PI) % 90 + 90) % 90;
      edges.push({ a, b, len, ang, dir: [dx / (len || 1), dz / (len || 1)] });
    }
    const hist = new Array(90).fill(0);
    edges.forEach((e) => {
      for (let d = -2; d <= 2; d++) hist[(Math.round(e.ang) + d + 90) % 90] += e.len;
    });
    let best = 0;
    for (let i = 1; i < 90; i++) if (hist[i] > hist[best]) best = i;
    let wSum = 0, aSum = 0;
    edges.forEach((e) => {
      let da = e.ang - best;
      if (da > 45) da -= 90; if (da < -45) da += 90;
      if (Math.abs(da) <= angleSnapDeg) { wSum += e.len; aSum += da * e.len; }
    });
    const theta0 = ((best + (wSum ? aSum / wSum : 0)) * Math.PI) / 180;

    // Assign each edge a line: snapped direction if close to an axis,
    // else its own direction; offset through its length-weighted midpoint.
    const lines = edges.map((e) => {
      const eAng = Math.atan2(e.dir[1], e.dir[0]);
      const snapDeg = e.len < shortEdge ? shortSnapDeg : angleSnapDeg;
      let dir = e.dir, snapped = false;
      for (let q = 0; q < 4; q++) {
        const target = theta0 + (q * Math.PI) / 2;
        let da = eAng - target;
        while (da > Math.PI) da -= 2 * Math.PI;
        while (da < -Math.PI) da += 2 * Math.PI;
        if (Math.abs(da) <= (snapDeg * Math.PI) / 180) {
          dir = [Math.cos(target), Math.sin(target)];
          snapped = true;
          break;
        }
      }
      const mid = [(e.a[0] + e.b[0]) / 2, (e.a[1] + e.b[1]) / 2];
      // line: point `mid`, direction `dir`; offset = perp component
      return { dir, snapped, off: -dir[1] * mid[0] + dir[0] * mid[1], len: e.len };
    });

    // Merge consecutive edges that snapped to the same axis direction
    // into one shared line (length-weighted offset).
    for (let pass = 0; pass < n; pass++) {
      let merged = false;
      for (let i = 0; i < n; i++) {
        const l1 = lines[i], l2 = lines[(i + 1) % n];
        if (l1 === l2 || !l1.snapped || !l2.snapped) continue;
        const cross = l1.dir[0] * l2.dir[1] - l1.dir[1] * l2.dir[0];
        if (Math.abs(cross) > 1e-6) continue;
        // near-parallel neighbours: unify (also flips anti-parallel offset)
        const sameSense = l1.dir[0] * l2.dir[0] + l1.dir[1] * l2.dir[1] > 0;
        const off2 = sameSense ? l2.off : -l2.off;
        const off = (l1.off * l1.len + off2 * l2.len) / (l1.len + l2.len);
        const uni = { dir: l1.dir, snapped: true, off, len: l1.len + l2.len };
        for (let j = 0; j < n; j++) if (lines[j] === l1 || lines[j] === l2) lines[j] = uni;
        merged = true;
      }
      if (!merged) break;
    }

    // New vertex i = intersection of line[i-1] and line[i].
    const out = [];
    for (let i = 0; i < n; i++) {
      const lPrev = lines[(i + n - 1) % n], lCur = lines[i];
      if (lPrev === lCur) {
        // interior vertex of a merged straight run: project onto the line
        const p = loop[i];
        const t = lCur.dir[0] * p[0] + lCur.dir[1] * p[1];
        out.push([
          lCur.dir[0] * t - lCur.dir[1] * lCur.off,
          lCur.dir[1] * t + lCur.dir[0] * lCur.off,
        ]);
        continue;
      }
      const cross = lPrev.dir[0] * lCur.dir[1] - lPrev.dir[1] * lCur.dir[0];
      if (Math.abs(cross) < 1e-6) { out.push(loop[i].slice()); continue; }
      // solve p = intersection: -d1y*x + d1x*z = off1 ; -d2y*x + d2x*z = off2
      const [d1x, d1y] = lPrev.dir, [d2x, d2y] = lCur.dir;
      const det = -d1y * d2x + d1x * d2y;
      out.push([
        (lPrev.off * d2x - lCur.off * d1x) / det,
        (lPrev.off * d2y - lCur.off * d1y) / det,
      ]);
    }

    // Sanity: reject if any vertex moved too far or area changed a lot.
    let maxD = 0;
    for (let i = 0; i < n; i++) maxD = Math.max(maxD, Math.hypot(out[i][0] - loop[i][0], out[i][1] - loop[i][1]));
    const a0 = Math.abs(polygonArea(loop)), a1 = Math.abs(polygonArea(out));
    if (maxD > maxShift || a0 < 1e-6 || Math.abs(a1 - a0) / a0 > 0.15) return loop;
    return out;
  }

  // ------------------------------------------------------------------
  // Ear-clipping triangulation of a simple polygon (no holes).
  // Returns index triples into the input array, wound like the input.
  // ------------------------------------------------------------------
  function triangulatePolygon(poly) {
    const n = poly.length;
    if (n < 3) return [];
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    const ccw = polygonArea(poly) > 0;
    const tris = [];
    let guard = n * n + 10;
    while (idx.length > 3 && guard-- > 0) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const ia = idx[(i + idx.length - 1) % idx.length], ib = idx[i], ic = idx[(i + 1) % idx.length];
        const [ax, az] = poly[ia], [bx, bz] = poly[ib], [cx, cz] = poly[ic];
        const cross = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
        if (ccw ? cross <= 1e-12 : cross >= -1e-12) continue; // reflex or degenerate
        let contains = false;
        for (const j of idx) {
          if (j === ia || j === ib || j === ic) continue;
          if (pointInTri(poly[j], poly[ia], poly[ib], poly[ic])) { contains = true; break; }
        }
        if (contains) continue;
        tris.push([ia, ib, ic]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) break; // degenerate input; emit what we have
    }
    if (idx.length === 3) tris.push([idx[0], idx[1], idx[2]]);
    return tris;
  }

  function pointInTri(p, a, b, c) {
    const s1 = (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]);
    const s2 = (c[0] - b[0]) * (p[1] - b[1]) - (c[1] - b[1]) * (p[0] - b[0]);
    const s3 = (a[0] - c[0]) * (p[1] - c[1]) - (a[1] - c[1]) * (p[0] - c[0]);
    const hasNeg = s1 < 0 || s2 < 0 || s3 < 0;
    const hasPos = s1 > 0 || s2 > 0 || s3 > 0;
    return !(hasNeg && hasPos);
  }

  // ------------------------------------------------------------------
  // Horizontal cross-section of an indexed triangle mesh.
  // verts: [{x,y,z}], faces: [[i,j,k]]. Returns closed plan loops.
  // ------------------------------------------------------------------
  function sliceMesh(verts, faces, y) {
    // Nudge the slice height off any vertex to avoid degenerate hits.
    for (let tries = 0; tries < 8; tries++) {
      const clash = verts.some((v) => Math.abs(v.y - y) < 1e-6);
      if (!clash) break;
      y += 3.7e-5;
    }
    const segs = [];
    for (const [i, j, k] of faces) {
      const tri = [verts[i], verts[j], verts[k]];
      const d = tri.map((v) => v.y - y);
      const pts = [];
      for (let e = 0; e < 3; e++) {
        const p = tri[e], q = tri[(e + 1) % 3];
        if (d[e] * d[(e + 1) % 3] < 0) {
          const t = d[e] / (d[e] - d[(e + 1) % 3]);
          pts.push([p.x + (q.x - p.x) * t, p.z + (q.z - p.z) * t]);
        }
      }
      if (pts.length === 2) segs.push(pts);
    }
    // Stitch segments into loops by welding endpoints on a fine grid.
    const keyOf = (p) => Math.round(p[0] * 1000) + '|' + Math.round(p[1] * 1000);
    const adj = new Map();
    segs.forEach((s, si) => {
      [keyOf(s[0]), keyOf(s[1])].forEach((k) => {
        if (!adj.has(k)) adj.set(k, []);
        adj.get(k).push(si);
      });
    });
    const usedSeg = new Set();
    const loops = [], open = [];
    segs.forEach((s0, si0) => {
      if (usedSeg.has(si0)) return;
      usedSeg.add(si0);
      const loop = [s0[0], s0[1]];
      let curKey = keyOf(s0[1]);
      const startKey = keyOf(s0[0]);
      let guard = segs.length + 2;
      while (curKey !== startKey && guard-- > 0) {
        const nextSi = (adj.get(curKey) || []).find((si) => !usedSeg.has(si));
        if (nextSi === undefined) break;
        usedSeg.add(nextSi);
        const s = segs[nextSi];
        const nxt = keyOf(s[0]) === curKey ? s[1] : s[0];
        loop.push(nxt);
        curKey = keyOf(nxt);
      }
      if (curKey === startKey) {
        loop.pop(); // drop duplicated closing point
        if (loop.length >= 3) loops.push(loop);
      } else open.push(loop);
    });
    loops.sort((a, b) => Math.abs(polygonArea(b)) - Math.abs(polygonArea(a)));
    return { loops, open, y };
  }

  // ------------------------------------------------------------------
  // Split a simple polygon by a polyline whose endpoints lie on (or
  // near) the boundary. Returns { a, b } (two plan rings) or null.
  // ------------------------------------------------------------------
  function splitPolygonByPolyline(poly, path, eps) {
    eps = eps || 1e-6;
    if (path.length < 2) return null;

    // Locate an endpoint on the boundary: {edge index, t along edge}.
    function locate(pt) {
      let bestI = -1, bestT = 0, bestD = Infinity;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const s = distPointToSegment(pt[0], pt[1], a[0], a[1], b[0], b[1]);
        if (s.d < bestD) { bestD = s.d; bestI = i; bestT = s.t; }
      }
      return { i: bestI, t: bestT, d: bestD };
    }
    const locA = locate(path[0]);
    const locB = locate(path[path.length - 1]);
    if (locA.i === locB.i && Math.abs(locA.t - locB.t) < 1e-9) return null;

    // The path interior must stay inside the polygon — check both the
    // interior vertices and the segment midpoints (midpoints alone miss
    // excursions that leave and re-enter).
    for (let i = 1; i < path.length - 1; i++) {
      if (!pointInPolygon(poly, path[i][0], path[i][1])) return null;
    }
    for (let i = 0; i < path.length - 1; i++) {
      const mx = (path[i][0] + path[i + 1][0]) / 2, mz = (path[i][1] + path[i + 1][1]) / 2;
      const onEdge = locate([mx, mz]).d < 1e-4;
      if (!pointInPolygon(poly, mx, mz) && !onEdge) return null;
    }

    // Build boundary ring with both endpoints inserted as vertices.
    // Entries: { p, isA, isB }
    const ring = [];
    for (let i = 0; i < poly.length; i++) {
      ring.push({ p: poly[i].slice() });
      const inserts = [];
      if (locA.i === i) inserts.push({ t: locA.t, isA: true, p: pointOnEdge(poly, i, locA.t) });
      if (locB.i === i) inserts.push({ t: locB.t, isB: true, p: pointOnEdge(poly, i, locB.t) });
      inserts.sort((u, v) => u.t - v.t);
      inserts.forEach((ins) => {
        // reuse the existing vertex if the endpoint sits on it
        if (ins.t < eps) Object.assign(ring[ring.length - 1], ins);
        else ring.push(ins);
      });
    }
    const iA = ring.findIndex((r) => r.isA);
    const iB = ring.findIndex((r) => r.isB);
    if (iA < 0 || iB < 0 || iA === iB) return null;

    const interior = path.slice(1, -1);
    const walk = (from, to) => {
      const out = [];
      for (let i = from; ; i = (i + 1) % ring.length) {
        out.push(ring[i].p.slice());
        if (i === to) break;
      }
      return out;
    };
    // Side A: boundary A→B, then back along the path (B→A, interior only).
    const ringA = walk(iA, iB).concat(interior.slice().reverse().map((p) => p.slice()));
    // Side B: boundary B→A, then along the path (A→B, interior only).
    const ringB = walk(iB, iA).concat(interior.map((p) => p.slice()));

    const clean = (rg) => {
      const out = [];
      for (const p of rg) {
        const prev = out[out.length - 1];
        if (!prev || Math.hypot(p[0] - prev[0], p[1] - prev[1]) > 1e-6) out.push(p);
      }
      while (out.length > 1 && Math.hypot(out[0][0] - out[out.length - 1][0], out[0][1] - out[out.length - 1][1]) < 1e-6) out.pop();
      return out;
    };
    const a = clean(ringA), b = clean(ringB);
    if (a.length < 3 || b.length < 3) return null;
    const aA = Math.abs(polygonArea(a)), aB = Math.abs(polygonArea(b));
    if (Math.min(aA, aB) < 0.05) return null; // degenerate sliver
    const total = Math.abs(polygonArea(poly));
    if (total > 1e-9 && Math.abs(aA + aB - total) / total > 0.02) return null;
    return { a, b };
  }

  function pointOnEdge(poly, i, t) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  }

  // ------------------------------------------------------------------
  // Watertightness: with shared vertex indices, a closed 2-manifold has
  // every undirected edge in exactly 2 faces; consistent orientation
  // additionally means each directed edge appears exactly once.
  // ------------------------------------------------------------------
  function watertightCheck(faces) {
    const und = new Map(), dir = new Map();
    for (const f of faces) {
      for (let e = 0; e < f.length; e++) {
        const a = f[e], b = f[(e + 1) % f.length];
        const ku = a < b ? a + '|' + b : b + '|' + a;
        und.set(ku, (und.get(ku) || 0) + 1);
        const kd = a + '>' + b;
        dir.set(kd, (dir.get(kd) || 0) + 1);
      }
    }
    const badEdges = [];
    und.forEach((count, k) => { if (count !== 2) badEdges.push({ edge: k, count }); });
    let orientationOK = true;
    dir.forEach((count) => { if (count !== 1) orientationOK = false; });
    return { closed: badEdges.length === 0, oriented: orientationOK, badEdges };
  }

  return {
    fitPlane, planeY, intersectPlanes, planePlaneLine2D, projectOntoLine2D,
    createDSU,
    polygonArea, polygonCentroid, pointInPolygon, distPointToSegment,
    chainEdgesToLoops, straightenCollinear, orthogonalizeLoop,
    triangulatePolygon, sliceMesh, splitPolygonByPolyline, watertightCheck,
  };
});
