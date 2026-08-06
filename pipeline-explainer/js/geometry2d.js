// =====================================================================
// Small 2D polygon toolkit used by the explainer's live algorithm demos.
// Points are [x, y] arrays; polygons are arrays of points (open — no
// repeated last vertex).
// =====================================================================
window.PE = window.PE || {};

window.PE.geom = (function () {

  function area(poly) {
    let a = 0;
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % poly.length];
      a += x1 * y2 - x2 * y1;
    }
    return a / 2;
  }

  function centroid(poly) {
    let cx = 0, cy = 0;
    for (const [x, y] of poly) { cx += x; cy += y; }
    return [cx / poly.length, cy / poly.length];
  }

  function bounds(poly) {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [x, y] of poly) {
      minX = Math.min(minX, x); maxX = Math.max(maxX, x);
      minY = Math.min(minY, y); maxY = Math.max(maxY, y);
    }
    return { minX, minY, maxX, maxY };
  }

  function pointInPolygon(pt, poly) {
    const [x, y] = pt;
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
        inside = !inside;
      }
    }
    return inside;
  }

  function convexHull(points) {
    const pts = points.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    if (pts.length < 3) return pts;
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    const lower = [];
    for (const p of pts) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    const upper = [];
    for (let i = pts.length - 1; i >= 0; i--) {
      const p = pts[i];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) upper.pop();
      upper.push(p);
    }
    lower.pop(); upper.pop();
    return lower.concat(upper); // counter-clockwise
  }

  // Inset a CONVEX counter-clockwise polygon by `d` metres via half-plane
  // intersection (clip against each edge shifted inward). Returns null if
  // the polygon vanishes.
  function insetConvex(poly, d) {
    if (area(poly) < 0) poly = poly.slice().reverse();
    let clipped = poly.slice();
    const n = poly.length;
    for (let i = 0; i < n; i++) {
      const [x1, y1] = poly[i];
      const [x2, y2] = poly[(i + 1) % n];
      // inward normal for CCW polygon is left of edge direction
      const ex = x2 - x1, ey = y2 - y1;
      const len = Math.hypot(ex, ey) || 1;
      const nx = -ey / len, ny = ex / len;
      // half-plane: (p - (edge point + n*d)) . n >= 0
      const px = x1 + nx * d, py = y1 + ny * d;
      clipped = clipHalfPlane(clipped, px, py, nx, ny);
      if (!clipped || clipped.length < 3) return null;
    }
    return clipped;
  }

  function clipHalfPlane(poly, px, py, nx, ny) {
    const out = [];
    const side = (p) => (p[0] - px) * nx + (p[1] - py) * ny;
    for (let i = 0; i < poly.length; i++) {
      const cur = poly[i], nxt = poly[(i + 1) % poly.length];
      const sc = side(cur), sn = side(nxt);
      if (sc >= 0) out.push(cur);
      if ((sc >= 0) !== (sn >= 0)) {
        const t = sc / (sc - sn);
        out.push([cur[0] + t * (nxt[0] - cur[0]), cur[1] + t * (nxt[1] - cur[1])]);
      }
    }
    return out;
  }

  // Expand a polygon outward by d (used for obstruction install margins).
  // Cheap version: offset every vertex away from the centroid.
  function expandFromCentroid(poly, d) {
    const [cx, cy] = centroid(poly);
    return poly.map(([x, y]) => {
      const dx = x - cx, dy = y - cy;
      const len = Math.hypot(dx, dy) || 1;
      return [x + (dx / len) * d, y + (dy / len) * d];
    });
  }

  function segIntersects(a, b, c, d) {
    const ccw = (p, q, r) => (r[1] - p[1]) * (q[0] - p[0]) - (q[1] - p[1]) * (r[0] - p[0]);
    return (ccw(a, c, d) * ccw(b, c, d) < 0) && (ccw(c, a, b) * ccw(d, a, b) < 0);
  }

  function polyIntersectsPoly(p1, p2) {
    for (const pt of p1) if (pointInPolygon(pt, p2)) return true;
    for (const pt of p2) if (pointInPolygon(pt, p1)) return true;
    for (let i = 0; i < p1.length; i++) {
      for (let j = 0; j < p2.length; j++) {
        if (segIntersects(p1[i], p1[(i + 1) % p1.length], p2[j], p2[(j + 1) % p2.length])) return true;
      }
    }
    return false;
  }

  // Intersect a horizontal line y=Y with a convex polygon -> [xLeft, xRight] or null.
  function horizontalSlice(poly, Y) {
    const xs = [];
    for (let i = 0; i < poly.length; i++) {
      const [x1, y1] = poly[i], [x2, y2] = poly[(i + 1) % poly.length];
      if ((y1 <= Y && y2 > Y) || (y2 <= Y && y1 > Y)) {
        const t = (Y - y1) / (y2 - y1);
        xs.push(x1 + t * (x2 - x1));
      }
    }
    if (xs.length < 2) return null;
    xs.sort((a, b) => a - b);
    return [xs[0], xs[xs.length - 1]];
  }

  // Douglas–Peucker on an open chain: max deviation from the ORIGINAL
  // line stays within eps (matches shapely .simplify()).
  function rdp(points, eps) {
    if (points.length < 3) return points.slice();
    const first = points[0], last = points[points.length - 1];
    let maxD = -1, maxI = 0;
    for (let i = 1; i < points.length - 1; i++) {
      const d = distPointToSegment(points[i], first, last);
      if (d > maxD) { maxD = d; maxI = i; }
    }
    if (maxD <= eps) return [first, last];
    const a = rdp(points.slice(0, maxI + 1), eps);
    const b = rdp(points.slice(maxI), eps);
    return a.slice(0, -1).concat(b);
  }

  // Simplify a closed ring with Douglas–Peucker: split at the two most
  // distant vertices so both chains have stable anchors, simplify each.
  function simplifyClosed(poly, eps) {
    if (poly.length < 5) return poly.slice();
    let k = 0, maxD = -1;
    for (let i = 1; i < poly.length; i++) {
      const d = Math.hypot(poly[i][0] - poly[0][0], poly[i][1] - poly[0][1]);
      if (d > maxD) { maxD = d; k = i; }
    }
    const chainA = poly.slice(0, k + 1);
    const chainB = poly.slice(k).concat([poly[0]]);
    const a = rdp(chainA, eps);
    const b = rdp(chainB, eps);
    return a.slice(0, -1).concat(b.slice(0, -1));
  }

  function distPointToSegment([px, py], [ax, ay], [bx, by]) {
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    let t = len2 ? ((px - ax) * dx + (py - ay) * dy) / len2 : 0;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function distPointToBoundary(pt, poly) {
    let d = Infinity;
    for (let i = 0; i < poly.length; i++) {
      d = Math.min(d, distPointToSegment(pt, poly[i], poly[(i + 1) % poly.length]));
    }
    return d;
  }

  // Ear-clipping triangulation for simple (possibly concave) polygons.
  // Returns a list of index triples into the input array.
  function triangulate(poly) {
    const n = poly.length;
    if (n < 3) return [];
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    if (area(poly) < 0) idx.reverse(); // ensure CCW

    const cross = (a, b, c) =>
      (poly[b][0] - poly[a][0]) * (poly[c][1] - poly[a][1]) -
      (poly[b][1] - poly[a][1]) * (poly[c][0] - poly[a][0]);
    const inTri = (p, a, b, c) => {
      const s = (poly[a][0] - poly[c][0]) * (poly[p][1] - poly[c][1]) - (poly[a][1] - poly[c][1]) * (poly[p][0] - poly[c][0]);
      const t = (poly[b][0] - poly[a][0]) * (poly[p][1] - poly[a][1]) - (poly[b][1] - poly[a][1]) * (poly[p][0] - poly[a][0]);
      const u = (poly[c][0] - poly[b][0]) * (poly[p][1] - poly[b][1]) - (poly[c][1] - poly[b][1]) * (poly[p][0] - poly[b][0]);
      return (s >= -1e-9 && t >= -1e-9 && u >= -1e-9);
    };

    const tris = [];
    let guard = 0;
    while (idx.length > 3 && guard++ < 10000) {
      let clipped = false;
      for (let i = 0; i < idx.length; i++) {
        const a = idx[(i - 1 + idx.length) % idx.length], b = idx[i], c = idx[(i + 1) % idx.length];
        if (cross(a, b, c) < 1e-9) continue; // reflex or degenerate
        let hasInside = false;
        for (const p of idx) {
          if (p === a || p === b || p === c) continue;
          if (inTri(p, a, b, c)) { hasInside = true; break; }
        }
        if (hasInside) continue;
        tris.push([a, b, c]);
        idx.splice(i, 1);
        clipped = true;
        break;
      }
      if (!clipped) break; // numerical trouble — fan out the rest
    }
    if (idx.length >= 3) {
      for (let i = 1; i < idx.length - 1; i++) tris.push([idx[0], idx[i], idx[i + 1]]);
    }
    return tris;
  }

  function rotate(poly, angleRad) {
    const c = Math.cos(angleRad), s = Math.sin(angleRad);
    return poly.map(([x, y]) => [x * c - y * s, x * s + y * c]);
  }

  function translate(poly, dx, dy) {
    return poly.map(([x, y]) => [x + dx, y + dy]);
  }

  return {
    area, centroid, bounds, pointInPolygon, convexHull, insetConvex,
    expandFromCentroid, polyIntersectsPoly, horizontalSlice, rotate, translate,
    distPointToSegment, distPointToBoundary, triangulate, simplifyClosed,
  };

})();
