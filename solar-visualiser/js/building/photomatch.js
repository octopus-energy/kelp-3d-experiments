// =====================================================================
// Photo matching: recover the camera pose a listing photo was taken
// from, using 2D↔3D correspondences between photo pixels and named
// landmarks on the building solid (eave/ground corners, gable apexes,
// ridge ends). One pose maps every visible facade at once — better than
// per-facade homographies when a photo shows two elevations — and gives
// the "stand where the photographer stood" view for free.
//
// Camera model: pinhole, principal point at the image centre, unknown
// focal length. Parameters [x, y, z, yaw, pitch, roll, f] solved by
// Levenberg–Marquardt from multiple seeded starts, with soft priors for
// a level camera (roll ≈ 0) and eye height (~1.6 m above ground) that
// real correspondences can override.
//
// Pure data in/out — no THREE/DOM — so it runs in node for tests.
// =====================================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./geometry.js'));
  } else {
    root.SolarViz = root.SolarViz || {};
    root.SolarViz.buildingPhotoMatch = factory(root.SolarViz.buildingGeometry);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (G) {

  const COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

  // ------------------------------------------------------------------
  // Named landmarks from the solid. Ids are keyed on cluster indices,
  // which are stable for a given site + regularisation settings (a
  // snap-tolerance change invalidates stored matches — the UI then
  // shows large errors and the user re-drags the points).
  // ------------------------------------------------------------------
  function buildLandmarks(solid) {
    const [ccx, ccz] = G.polygonCentroid(solid.footprint);
    const compass = (x, z) => {
      const brg = ((Math.atan2(x - ccx, -(z - ccz)) * 180 / Math.PI) + 360) % 360;
      return COMPASS[Math.round(brg / 45) % 8];
    };
    const out = [];
    const onLoop = new Set();
    solid.loops.forEach((loop) => {
      loop.ids.forEach((id) => {
        onLoop.add(id);
        const c = solid.clusters[id];
        const apex = c.y > solid.eaveY + 0.6;
        out.push({
          id: (apex ? 'apex_' : 'eave_') + id,
          kind: apex ? 'apex' : 'eave',
          label: (apex ? 'Gable apex' : 'Eave corner') + ' (' + compass(c.x, c.z) + ')',
          p: [c.x, c.y, c.z],
        });
        out.push({
          id: 'ground_' + id, kind: 'ground',
          label: 'Ground corner (' + compass(c.x, c.z) + ')',
          p: [c.x, solid.groundY, c.z],
        });
      });
    });
    const seen = new Set();
    solid.faces.forEach((f) => f.ids.forEach((id) => {
      if (onLoop.has(id) || seen.has(id)) return;
      seen.add(id);
      const c = solid.clusters[id];
      out.push({
        id: 'ridge_' + id, kind: 'ridge',
        label: 'Ridge end (' + compass(c.x, c.z) + ')',
        p: [c.x, c.y, c.z],
      });
    }));
    return out;
  }

  // ------------------------------------------------------------------
  // Projection. Rotation R = Ry(yaw)·Rx(pitch)·Rz(roll); the camera
  // looks down its −Z (three.js convention), yaw 0 = facing north (−z).
  // ------------------------------------------------------------------
  function rotation(yaw, pitch, roll) {
    const cy = Math.cos(yaw), sy = Math.sin(yaw);
    const cp = Math.cos(pitch), sp = Math.sin(pitch);
    const cr = Math.cos(roll), sr = Math.sin(roll);
    // columns are the world directions of the camera's x/y/z axes
    return [
      [cy * cr + sy * sp * sr, -cy * sr + sy * sp * cr, sy * cp],
      [cp * sr, cp * cr, -sp],
      [-sy * cr + cy * sp * sr, sy * sr + cy * sp * cr, cy * cp],
    ];
  }

  function projectWith(prm, imageSize, p) {
    const [X, Y, Z, yaw, pitch, roll, f] = prm;
    const M = rotation(yaw, pitch, roll);
    const dx = p[0] - X, dy = p[1] - Y, dz = p[2] - Z;
    const camX = M[0][0] * dx + M[1][0] * dy + M[2][0] * dz;
    const camY = M[0][1] * dx + M[1][1] * dy + M[2][1] * dz;
    const camZ = M[0][2] * dx + M[1][2] * dy + M[2][2] * dz;
    if (camZ > -0.05) return null; // behind the camera
    return [
      imageSize[0] / 2 + (f * camX) / -camZ,
      imageSize[1] / 2 - (f * camY) / -camZ,
    ];
  }

  const poseParams = (pose) => [
    pose.pos[0], pose.pos[1], pose.pos[2], pose.yaw, pose.pitch, pose.roll, pose.f];

  function projectPoint(pose, imageSize, p) {
    return projectWith(poseParams(pose), imageSize, p);
  }

  function poseForward(pose) {
    const M = rotation(pose.yaw, pose.pitch, pose.roll);
    return [-M[0][2], -M[1][2], -M[2][2]]; // −(back column)
  }

  // ------------------------------------------------------------------
  // Levenberg–Marquardt on reprojection error (px), numeric Jacobian.
  // ------------------------------------------------------------------
  // Soft priors encode how listing photos are actually taken: a level
  // camera at person/pole height with a normal-to-wide lens. They are
  // DEADBAND priors — zero cost inside the plausible band, growing
  // outside it — so they never bias a well-constrained solve, but they
  // do keep sparse near-coplanar point sets out of the classic PnP
  // ambiguity (the same points fit from a distant telephoto or a nearby
  // wide angle; the priors pick the physically plausible family).
  const outside = (v, lo, hi, w) => (v < lo ? (lo - v) * w : v > hi ? (v - hi) * w : 0);

  function residuals(prm, points, imageSize, groundY) {
    const r = [];
    points.forEach((pt) => {
      const uv = projectWith(prm, imageSize, pt.p);
      if (!uv) { r.push(5e3, 5e3); return; }
      r.push(uv[0] - pt.px[0], uv[1] - pt.px[1]);
    });
    const fovV = (2 * Math.atan(imageSize[1] / 2 / prm[6]) * 180) / Math.PI;
    r.push(prm[5] * 500);                              // level camera (roll ≈ 0)
    r.push(outside(prm[1] - groundY, 0.3, 4.5, 12));   // camera height band (m)
    r.push(outside(fovV, 35, 95, 1.5));                // vertical fov band (deg)
    return r;
  }

  function solveLinear(A, b) {
    // Gaussian elimination with partial pivoting; A is n×n, mutated.
    const n = b.length;
    for (let col = 0; col < n; col++) {
      let piv = col;
      for (let row = col + 1; row < n; row++) {
        if (Math.abs(A[row][col]) > Math.abs(A[piv][col])) piv = row;
      }
      if (Math.abs(A[piv][col]) < 1e-12) return null;
      [A[col], A[piv]] = [A[piv], A[col]];
      [b[col], b[piv]] = [b[piv], b[col]];
      for (let row = col + 1; row < n; row++) {
        const k = A[row][col] / A[col][col];
        for (let c2 = col; c2 < n; c2++) A[row][c2] -= k * A[col][c2];
        b[row] -= k * b[col];
      }
    }
    const x = new Array(n).fill(0);
    for (let row = n - 1; row >= 0; row--) {
      let s = b[row];
      for (let c2 = row + 1; c2 < n; c2++) s -= A[row][c2] * x[c2];
      x[row] = s / A[row][row];
    }
    return x;
  }

  const STEPS = [0.02, 0.02, 0.02, 2e-4, 2e-4, 2e-4, 0.5];

  function refine(prm, points, imageSize, groundY, iters) {
    prm = prm.slice();
    let lambda = 1e-2;
    let r = residuals(prm, points, imageSize, groundY);
    let cost = r.reduce((s, v) => s + v * v, 0);
    for (let it = 0; it < (iters || 60); it++) {
      // numeric Jacobian (central differences)
      const J = r.map(() => new Array(7));
      for (let k = 0; k < 7; k++) {
        const h = STEPS[k];
        const pa = prm.slice(); pa[k] += h;
        const pb = prm.slice(); pb[k] -= h;
        const ra = residuals(pa, points, imageSize, groundY);
        const rb = residuals(pb, points, imageSize, groundY);
        for (let i = 0; i < r.length; i++) J[i][k] = (ra[i] - rb[i]) / (2 * h);
      }
      const JtJ = [], Jtr = new Array(7).fill(0);
      for (let a = 0; a < 7; a++) {
        JtJ.push(new Array(7).fill(0));
        for (let b2 = 0; b2 < 7; b2++) {
          let s = 0;
          for (let i = 0; i < r.length; i++) s += J[i][a] * J[i][b2];
          JtJ[a][b2] = s;
        }
        for (let i = 0; i < r.length; i++) Jtr[a] += J[i][a] * r[i];
      }
      let improved = false;
      for (let attempt = 0; attempt < 6 && !improved; attempt++) {
        const A = JtJ.map((row, i) => row.map((v, j) => v + (i === j ? lambda * (v || 1) : 0)));
        const delta = solveLinear(A, Jtr.map((v) => -v));
        if (delta) {
          const cand = prm.map((v, k) => v + delta[k]);
          cand[6] = Math.max(imageSize[0] * 0.25, Math.min(imageSize[0] * 4, cand[6]));
          const rc = residuals(cand, points, imageSize, groundY);
          const cc = rc.reduce((s, v) => s + v * v, 0);
          if (cc < cost) {
            prm = cand; r = rc; cost = cc;
            lambda = Math.max(1e-6, lambda * 0.4);
            improved = true;
            break;
          }
        }
        lambda *= 4;
      }
      if (!improved && lambda > 1e6) break;
    }
    return { prm, cost };
  }

  // points: [{ p: [x,y,z], px: [u,v] }]; hint (optional): { pos, yaw }.
  function solvePose({ points, imageSize, groundY = 0, centroid, hint }) {
    if (!points || points.length < 4) return null;
    const [ccx, ccz] = centroid || [
      points.reduce((s, p) => s + p.p[0], 0) / points.length,
      points.reduce((s, p) => s + p.p[2], 0) / points.length,
    ];
    const cyT = points.reduce((s, p) => s + p.p[1], 0) / points.length;

    const seeds = [];
    for (let b = 0; b < 8; b++) {
      const brg = (b * Math.PI) / 4;
      for (const dist of [7, 12, 20]) {
        const X = ccx + Math.sin(brg) * dist;
        const Z = ccz - Math.cos(brg) * dist;
        const Y = groundY + 1.6;
        const fwd = [ccx - X, cyT - Y, ccz - Z];
        const fl = Math.hypot(fwd[0], fwd[1], fwd[2]);
        const yaw = Math.atan2(-fwd[0] / fl, -fwd[2] / fl);
        const pitch = Math.asin(fwd[1] / fl);
        seeds.push([X, Y, Z, yaw, pitch, 0, imageSize[0] * 0.85]);
      }
    }
    if (hint && hint.pos) {
      const fwd = [ccx - hint.pos[0], cyT - hint.pos[1], ccz - hint.pos[2]];
      const fl = Math.hypot(fwd[0], fwd[1], fwd[2]);
      seeds.unshift([
        hint.pos[0], hint.pos[1], hint.pos[2],
        hint.yaw !== undefined ? hint.yaw : Math.atan2(-fwd[0] / fl, -fwd[2] / fl),
        Math.asin(fwd[1] / fl), 0, hint.f || imageSize[0] * 0.85,
      ]);
    }

    let best = null;
    seeds.forEach((seed) => {
      const res = refine(seed, points, imageSize, groundY, 60);
      if (!best || res.cost < best.cost) best = res;
    });
    if (!best) return null;

    const prm = best.prm;
    const perPoint = points.map((pt) => {
      const uv = projectWith(prm, imageSize, pt.p);
      return uv ? Math.hypot(uv[0] - pt.px[0], uv[1] - pt.px[1]) : Infinity;
    });
    const rmse = Math.sqrt(perPoint.reduce((s, e) => s + e * e, 0) / perPoint.length);
    return {
      pos: [prm[0], prm[1], prm[2]],
      yaw: prm[3], pitch: prm[4], roll: prm[5], f: prm[6],
      fovV: (2 * Math.atan(imageSize[1] / 2 / prm[6]) * 180) / Math.PI,
      rmse, perPoint,
    };
  }

  // Warm-start refinement for live dot dragging (no reseeding).
  function refinePose(pose, { points, imageSize, groundY = 0 }) {
    const res = refine(poseParams(pose), points, imageSize, groundY, 25);
    const prm = res.prm;
    const perPoint = points.map((pt) => {
      const uv = projectWith(prm, imageSize, pt.p);
      return uv ? Math.hypot(uv[0] - pt.px[0], uv[1] - pt.px[1]) : Infinity;
    });
    return {
      pos: [prm[0], prm[1], prm[2]],
      yaw: prm[3], pitch: prm[4], roll: prm[5], f: prm[6],
      fovV: (2 * Math.atan(imageSize[1] / 2 / prm[6]) * 180) / Math.PI,
      rmse: Math.sqrt(perPoint.reduce((s, e) => s + e * e, 0) / perPoint.length),
      perPoint,
    };
  }

  // ------------------------------------------------------------------
  // Wireframe edges of the solid (3D segment list) + their projection —
  // the live overlay the human validates the pose against.
  // ------------------------------------------------------------------
  function wireEdges(solid) {
    const edges = [];
    const seen = new Set();
    const cl = solid.clusters;
    solid.faces.forEach((f) => {
      for (let i = 0; i < f.ids.length; i++) {
        const a = f.ids[i], b = f.ids[(i + 1) % f.ids.length];
        const k = a < b ? a + '|' + b : b + '|' + a;
        if (seen.has(k)) continue;
        seen.add(k);
        edges.push([[cl[a].x, cl[a].y, cl[a].z], [cl[b].x, cl[b].y, cl[b].z]]);
      }
    });
    solid.loops.forEach((loop) => {
      loop.ids.forEach((id, i) => {
        const c = cl[id];
        edges.push([[c.x, c.y, c.z], [c.x, solid.groundY, c.z]]);
        const n = cl[loop.ids[(i + 1) % loop.ids.length]];
        edges.push([[c.x, solid.groundY, c.z], [n.x, solid.groundY, n.z]]);
      });
    });
    return edges;
  }

  function projectEdges(pose, imageSize, edges) {
    const out = [];
    edges.forEach(([a, b]) => {
      const pa = projectPoint(pose, imageSize, a);
      const pb = projectPoint(pose, imageSize, b);
      if (pa && pb) out.push([pa, pb]);
    });
    return out;
  }

  return {
    buildLandmarks, solvePose, refinePose,
    projectPoint, poseForward, wireEdges, projectEdges,
  };
});
