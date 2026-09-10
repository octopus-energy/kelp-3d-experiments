// =====================================================================
// Floorplan import: aligns an estate-agent floorplan (IMAGE_DATA, in
// image-pixel coords) to a floor outline (world metres) and converts the
// plan's rooms into divider polylines that replay through
// rooms.deriveRooms — so imported rooms use the exact same
// representation, persistence and undo as hand-drawn ones.
//
// All compute here is pure (no THREE/DOM) and node-testable. The
// alignment is a similarity transform: scale comes from the plan's own
// printed room dimensions, rotation is searched over the four axis
// alignments (x mirror included), translation from centroid match plus a
// local refinement, scored by outline overlap.
// =====================================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./geometry.js'));
  } else {
    root.SolarViz = root.SolarViz || {};
    root.SolarViz.buildingFloorplan = factory(root.SolarViz.buildingGeometry);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (G) {

  // ------------------------------------------------------------------
  // Transform: plan px -> world (x, z).
  //   [x,z] = R(angle) · M(mirrored) · p · scale + [tx, tz]
  // where M flips the plan's x axis when mirrored.
  // ------------------------------------------------------------------
  function applyToPoint(T, p) {
    const px = (T.mirrored ? -p[0] : p[0]) * T.scale;
    const py = p[1] * T.scale;
    const c = Math.cos(T.angle), s = Math.sin(T.angle);
    return [px * c - py * s + T.tx, px * s + py * c + T.tz];
  }
  const applyToPoly = (T, poly) => poly.map((p) => applyToPoint(T, p));

  // Metres per plan pixel, from the printed room dimensions: each room
  // rectangle contributes long-side/long-dim and short-side/short-dim
  // estimates; the median is robust to one mislabelled room.
  function planScale(rooms) {
    const est = [];
    (rooms || []).forEach((r) => {
      if (!r.dims || !r.rect) return;
      const w = Math.abs(r.rect[2] - r.rect[0]), h = Math.abs(r.rect[3] - r.rect[1]);
      const lo = Math.min(w, h), hi = Math.max(w, h);
      const dlo = Math.min(r.dims[0], r.dims[1]), dhi = Math.max(r.dims[0], r.dims[1]);
      if (hi > 0 && dhi > 0) est.push(dhi / hi);
      if (lo > 0 && dlo > 0) est.push(dlo / lo);
    });
    if (!est.length) return null;
    est.sort((a, b) => a - b);
    return est[(est.length / 2) | 0];
  }

  // Translation-refinement objective: the world outline is the ROOF
  // footprint while the plan outline is wall centrelines, so a perfect
  // fit leaves a roughly uniform overhang rim between them. Score the
  // deviation of each plan vertex/edge-midpoint's boundary distance from
  // that expected rim.
  const EXPECTED_RIM = 0.4; // metres: half wall + typical eaves overhang
  function boundaryCost(polyA, polyB) {
    let sum = 0, n = 0;
    const distToB = (x, z) => {
      let d = Infinity;
      for (let i = 0; i < polyB.length; i++) {
        const a = polyB[i], b = polyB[(i + 1) % polyB.length];
        d = Math.min(d, G.distPointToSegment(x, z, a[0], a[1], b[0], b[1]).d);
      }
      return d;
    };
    for (let i = 0; i < polyA.length; i++) {
      const a = polyA[i], b = polyA[(i + 1) % polyA.length];
      sum += Math.abs(distToB(a[0], a[1]) - EXPECTED_RIM) +
        Math.abs(distToB((a[0] + b[0]) / 2, (a[1] + b[1]) / 2) - EXPECTED_RIM);
      n += 2;
    }
    return n ? sum / n : Infinity;
  }

  // Fraction of sample points of polygon A inside polygon B and vice
  // versa (grid-free Monte-Carlo-ish overlap proxy; deterministic grid).
  function overlapScore(polyA, polyB) {
    let insideA = 0, totalA = 0, insideB = 0, totalB = 0;
    const grid = (poly, cb) => {
      let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
      poly.forEach(([x, z]) => {
        minX = Math.min(minX, x); maxX = Math.max(maxX, x);
        minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z);
      });
      const N = 24;
      for (let i = 0; i <= N; i++) {
        for (let j = 0; j <= N; j++) {
          const x = minX + ((maxX - minX) * i) / N;
          const z = minZ + ((maxZ - minZ) * j) / N;
          if (G.pointInPolygon(poly, x, z)) cb(x, z);
        }
      }
    };
    grid(polyA, (x, z) => { totalA++; if (G.pointInPolygon(polyB, x, z)) insideA++; });
    grid(polyB, (x, z) => { totalB++; if (G.pointInPolygon(polyA, x, z)) insideB++; });
    if (!totalA || !totalB) return 0;
    return Math.min(insideA / totalA, insideB / totalB);
  }

  // Fit plan outline -> world outline. Scale is fixed (from planScale);
  // tries 4 axis rotations × mirror, then refines translation on a small
  // hill-climb. opts.force = { mirrored, q } restricts the search (used
  // by the UI's rotate/mirror nudge buttons to re-fit deliberately).
  // Returns { angle, scale, tx, tz, mirrored, score }.
  function fitTransform({ planOutline, scale, worldOutline, axisAngle, force }) {
    const [pcx, pcy] = G.polygonCentroid(planOutline);
    const [wcx, wcz] = G.polygonCentroid(worldOutline);
    let best = null;
    for (let mirror = 0; mirror < 2; mirror++) {
      if (force && force.mirrored !== undefined && !!force.mirrored !== !!mirror) continue;
      for (let q = 0; q < 4; q++) {
        if (force && force.q !== undefined && force.q !== q) continue;
        const T = {
          angle: axisAngle + (q * Math.PI) / 2, q,
          scale, mirrored: !!mirror, tx: 0, tz: 0,
        };
        // translate so plan centroid lands on world centroid
        const [cx, cz] = applyToPoint(T, [pcx, pcy]);
        T.tx = wcx - cx;
        T.tz = wcz - cz;
        // refine translation on mean boundary distance, not overlap: once
        // the (smaller, wall-centreline) plan sits wholly inside the roof
        // outline the overlap score is flat over ~a metre of translation,
        // while boundary distance has a crisp minimum at the centred fit
        let cost = boundaryCost(applyToPoly(T, planOutline), worldOutline);
        for (let step = 1.0; step > 0.05; step *= 0.5) {
          let moved = true;
          while (moved) {
            moved = false;
            for (const [dx, dz] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
              const T2 = Object.assign({}, T, { tx: T.tx + dx, tz: T.tz + dz });
              const c2 = boundaryCost(applyToPoly(T2, planOutline), worldOutline);
              if (c2 < cost - 1e-4) { T.tx = T2.tx; T.tz = T2.tz; cost = c2; moved = true; }
            }
          }
        }
        const score = overlapScore(applyToPoly(T, planOutline), worldOutline);
        if (!best || score > best.score) best = Object.assign({}, T, { score });
      }
    }
    return best;
  }

  // ------------------------------------------------------------------
  // Dividers from room rectangles (plan px space), one polyline per room
  // in manifest order — the same carve-a-room-at-a-time model the manual
  // wall drawing uses, which is what lets T-junction walls work: each
  // room's wall ends land on the outline or on a wall carved earlier.
  //
  // For each room, walk its rectangle boundary and keep the portion that
  // runs through the floor interior — i.e. not along the plan outline
  // (exterior wall) and not along an already-carved wall (shared wall,
  // the neighbour drew it first). The longest kept run becomes the
  // room's carving polyline (I/L/U-shaped). Rooms without a rect (e.g.
  // the leftover hallway) carve nothing.
  // ------------------------------------------------------------------
  function deriveDividers({ rooms, planOutline, wallTol = 8, step = 3, minRun = 12 }) {
    const accepted = [];

    const distToChain = (pts, closed, x, y) => {
      let d = Infinity;
      const n = closed ? pts.length : pts.length - 1;
      for (let i = 0; i < n; i++) {
        const a = pts[i], b = pts[(i + 1) % pts.length];
        d = Math.min(d, G.distPointToSegment(x, y, a[0], a[1], b[0], b[1]).d);
      }
      return d;
    };

    const results = [];
    (rooms || []).forEach((r) => {
      if (!r.rect) return;
      const [x0, y0, x1, y1] = r.rect;
      const corners = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

      // sample the ring; a sample is wall-worthy if it's interior
      const samples = [];
      for (let e = 0; e < 4; e++) {
        const a = corners[e], b = corners[(e + 1) % 4];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        const n = Math.max(1, Math.ceil(len / step));
        for (let i = 0; i < n; i++) {
          const t = i / n;
          const x = a[0] + (b[0] - a[0]) * t, y = a[1] + (b[1] - a[1]) * t;
          const keep = distToChain(planOutline, true, x, y) > wallTol * 1.5 &&
            !accepted.some((c) => distToChain(c, false, x, y) <= wallTol);
          samples.push({ x, y, keep });
        }
      }

      // longest circular run of kept samples
      const N = samples.length;
      let best = null;
      let i = 0;
      while (i < N && samples[i].keep) i++;      // start at a gap (if any)
      if (i === N) {
        best = { start: 0, len: N };             // fully interior ring — take it all
      } else {
        for (let k = 0; k < N; k++) {
          const idx = (i + k) % N;
          if (!samples[idx].keep) continue;
          let len = 0;
          while (len < N && samples[(idx + len) % N].keep) len++;
          if (!best || len > best.len) best = { start: idx, len };
          k += len;
        }
      }
      if (!best || best.len * step < minRun) return;

      // run samples -> polyline, collapsing collinear middles
      const chain = [];
      for (let k = 0; k < best.len; k++) {
        const s = samples[(best.start + k) % N];
        chain.push([s.x, s.y]);
      }
      const poly = [chain[0]];
      for (let k = 1; k < chain.length - 1; k++) {
        const a = poly[poly.length - 1], p = chain[k], b = chain[k + 1];
        const cross = (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]);
        if (Math.abs(cross) > 1e-6) poly.push(p);
      }
      poly.push(chain[chain.length - 1]);

      accepted.push(poly);
      results.push(poly);
    });
    return results;
  }

  // ------------------------------------------------------------------
  // Snap a (world-space) divider polyline onto the boundary of the room
  // polygon that will be split: each END point is moved along its end
  // segment's direction to the nearest polygon-edge crossing, within
  // maxExtend metres of where it started (walls in the plan stop at wall
  // centrelines, so ends sit a wall-thickness-plus-overhang short of our
  // roof-footprint outline). Interior vertices are left alone. Returns
  // the snapped polyline, or null if an end finds no crossing.
  // ------------------------------------------------------------------
  function snapDividerToRoom(divider, poly, maxExtend = 1.2) {
    if (!divider || divider.length < 2) return null;
    const pts = divider.map((p) => p.slice());

    // move pts[endIdx] along the direction prev->end to the crossing
    // nearest it (s = signed distance from the current end point)
    function fixEnd(endIdx, prevIdx) {
      const e = pts[endIdx], pr = pts[prevIdx];
      const dx = e[0] - pr[0], dz = e[1] - pr[1];
      const len = Math.hypot(dx, dz);
      if (len < 1e-9) return false;
      const ux = dx / len, uz = dz / len;
      // Prefer true edge crossings; accept crossings slightly beyond an
      // edge's end too (the wall meets the boundary right at a corner,
      // where fit residual pushes the crossing just past the segment) —
      // that keeps the wall on its axis instead of bending to the corner.
      let best = null, bestLoose = null;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const ex = b[0] - a[0], ez = b[1] - a[1];
        const den = ux * ez - uz * ex;
        if (Math.abs(den) < 1e-9) continue;
        const t = ((a[0] - pr[0]) * ez - (a[1] - pr[1]) * ex) / den;
        const u = ((a[1] - pr[1]) * ux - (a[0] - pr[0]) * uz) / -den;
        const s = t - len; // distance past the end point
        // never trim back past the segment midpoint
        if (s < -Math.min(len * 0.5, maxExtend) || s > maxExtend) continue;
        const offSeg = (u < 0 ? -u : u > 1 ? u - 1 : 0) * Math.hypot(ex, ez);
        if (offSeg <= 1e-4) {
          if (best === null || Math.abs(s) < Math.abs(best)) best = s;
        } else if (offSeg <= 0.45) {
          if (bestLoose === null || Math.abs(s) < Math.abs(bestLoose)) bestLoose = s;
        }
      }
      if (best === null) best = bestLoose;
      if (best !== null) {
        pts[endIdx] = [e[0] + ux * best, e[1] + uz * best];
        return true;
      }
      // No crossing along the wall direction — the wall ends at an
      // outline corner, where the extension runs collinear with one
      // outline edge and grazes the other at its very endpoint. Nearest
      // boundary point handles that: distPointToSegment clamps to the
      // corner vertex.
      let np = null;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const s = G.distPointToSegment(e[0], e[1], a[0], a[1], b[0], b[1]);
        if (s.d <= maxExtend && (!np || s.d < np.d)) np = s;
      }
      if (!np) return false;
      // The corner is slightly off the wall's axis line. Keep the run
      // orthogonal by adding a hinge just before the end, so only a
      // short tail bends sideways to reach the corner. Beyond ~a metre
      // of sideways reach the wall would look broken — fail instead so
      // the mismatch is reported (usually a footprint edit fixes it).
      const off = Math.hypot(np.x - e[0], np.z - e[1]);
      const along = (np.x - e[0]) * ux + (np.z - e[1]) * uz;
      const sideways = Math.sqrt(Math.max(0, off * off - along * along));
      if (sideways > 1.2) return false;
      const tail = 0.5;
      if (sideways > 0.03 && len > tail * 2) {
        const hinge = [e[0] + ux * (along - tail), e[1] + uz * (along - tail)];
        if (endIdx === 0) {
          pts[0] = [np.x, np.z];
          pts.splice(1, 0, hinge);
        } else {
          pts[endIdx] = [np.x, np.z];
          pts.splice(endIdx, 0, hinge);
        }
      } else {
        pts[endIdx] = [np.x, np.z];
      }
      return true;
    }

    if (!fixEnd(0, 1)) return null;
    if (!fixEnd(pts.length - 1, pts.length - 2)) return null;
    const total = pts.reduce((s, p, i) => (i ? s + Math.hypot(
      p[0] - pts[i - 1][0], p[1] - pts[i - 1][1]) : 0), 0);
    return total >= 0.3 ? pts : null;
  }

  // ------------------------------------------------------------------
  // Map an already-fitted transform to concrete floor edits: carve
  // polylines snapped + replayed through deriveRooms in manifest order
  // (each room's walls may end on walls carved before it), and room
  // names/types matched by which derived room contains each plan-room's
  // label point.
  //
  // planFloor: { outline, rooms: [{label, type, dims, rect, labelAt}] }
  // (px). deriveRooms: injected from rooms.js (avoids a module cycle).
  // Kept separate from the fit so the UI can re-run it after nudging the
  // transform. Returns { dividers, roomNames, roomTypes, failed }.
  // ------------------------------------------------------------------
  function mapPlan({ planFloor, transform, worldOutline, deriveRooms }) {
    const planDividers = planFloor.dividers || deriveDividers({ rooms: planFloor.rooms, planOutline: planFloor.outline });
    const world = planDividers.map((d) => applyToPoly(transform, d));

    // incremental replay: snap each polyline to the room containing its
    // arc-length middle, applying successful splits before the next
    const dividers = [], failed = [];
    let rooms = [{ id: 'r', poly: worldOutline.map((p) => p.slice()) }];
    world.forEach((d) => {
      const mid = polylineMidpoint(d);
      const host = rooms.find((r) => G.pointInPolygon(r.poly, mid[0], mid[1]));
      // generous reach: sample trimming + overhang rim + fit residual can
      // leave a wall end ~1.5 m short of the boundary it belongs on
      const snapped = host && snapDividerToRoom(d, host.poly, 2.0);
      if (snapped) {
        const next = deriveRooms(worldOutline, dividers.concat([snapped]));
        if (next.failed.length === 0) {
          dividers.push(snapped);
          rooms = next.rooms;
          return;
        }
      }
      failed.push(d);
    });

    // name/type the derived rooms from the plan-room label points (rect
    // centre, or labelAt for rect-less leftover rooms like a hallway)
    const roomNames = {}, roomTypes = {}, roomSources = {}, unassigned = [];
    (planFloor.rooms || []).forEach((pr) => {
      const at = pr.labelAt || (pr.rect
        ? [(pr.rect[0] + pr.rect[2]) / 2, (pr.rect[1] + pr.rect[3]) / 2]
        : pr.labelAt);
      if (!at) return;
      const c = applyToPoint(transform, at);
      const hit = rooms.find((r) => G.pointInPolygon(r.poly, c[0], c[1]));
      if (hit && !roomNames[hit.id]) {
        roomSources[hit.id] = pr.id || pr.label;
        if (pr.label) roomNames[hit.id] = pr.label;
        if (pr.type) roomTypes[hit.id] = pr.type;
      } else unassigned.push(pr.id || pr.label);
    });

    return { dividers, roomNames, roomTypes, roomSources, unassigned, rooms, failed };
  }

  // ------------------------------------------------------------------
  // Re-fit existing dividers after the floor outline changed (parametric
  // footprint edits) or a wall was moved: replay incrementally, and when
  // a divider no longer splits cleanly, re-snap its ends to the room
  // that contains it before giving up. Returns { dividers, failed }.
  // ------------------------------------------------------------------
  function refitDividers({ worldOutline, dividers, deriveRooms, maxExtend = 1.0 }) {
    const out = [], failed = [];
    let rooms = [{ id: 'r', poly: worldOutline.map((p) => p.slice()) }];
    (dividers || []).forEach((d) => {
      let ok = null;
      if (deriveRooms(worldOutline, out.concat([d])).failed.length === 0) {
        ok = d;
      } else {
        const mid = polylineMidpoint(d);
        const host = rooms.find((r) => G.pointInPolygon(r.poly, mid[0], mid[1]));
        const snapped = host && snapDividerToRoom(d, host.poly, maxExtend);
        if (snapped && deriveRooms(worldOutline, out.concat([snapped])).failed.length === 0) {
          ok = snapped;
        }
      }
      if (ok) {
        out.push(ok);
        rooms = deriveRooms(worldOutline, out).rooms;
      } else {
        failed.push(d);
      }
    });
    return { dividers: out, failed };
  }

  // point halfway along a polyline's arc length
  function polylineMidpoint(pts) {
    let total = 0;
    for (let i = 1; i < pts.length; i++) {
      total += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    }
    let want = total / 2;
    for (let i = 1; i < pts.length; i++) {
      const seg = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
      if (want <= seg) {
        const t = seg > 0 ? want / seg : 0;
        return [
          pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
          pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t,
        ];
      }
      want -= seg;
    }
    return pts[0].slice();
  }

  // Convenience: fit + map in one call.
  function importFloorplan({ planFloor, worldOutline, axisAngle, deriveRooms }) {
    const scale = planScale(planFloor.rooms);
    if (!scale) return { error: 'no printed dimensions to derive scale from' };
    const transform = fitTransform({
      planOutline: planFloor.outline, scale, worldOutline, axisAngle,
    });
    const mapped = mapPlan({ planFloor, transform, worldOutline, deriveRooms });
    return Object.assign({ transform, score: transform.score }, mapped);
  }

  return {
    applyToPoint, applyToPoly, planScale, overlapScore, fitTransform,
    deriveDividers, snapDividerToRoom, mapPlan, importFloorplan,
    refitDividers, polylineMidpoint,
  };
});
