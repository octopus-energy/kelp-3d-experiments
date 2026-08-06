// =====================================================================
// Step 5 demo: a live, simplified re-implementation of the backend's
// find_optimal_solar_panel_layout — flatten the roof face into its own
// plane, inset by the MCS margin, then brute-force row splits × offsets
// × alignments and keep the layout with the most panels.
//
// Panel dimensions and margins here are illustrative defaults; the
// production search also tie-breaks on mounting-material cost.
// =====================================================================
window.PE = window.PE || {};

window.PE.layoutSim = (function () {
  const G = () => PE.geom;
  const rad = (d) => (d * Math.PI) / 180;

  const PANEL = { h: 1.762, w: 1.134 };   // portrait metres (Trina 450 W)
  const MCS_MARGIN = 0.3;                 // roof edge clearance
  const OBS_MARGIN = 0.15;                // obstruction install clearance

  let cached = null;

  // ---- flatten the face into its own plane -------------------------
  function flatten(data) {
    const face = data.heroFace;
    const fit = PE.planeFit.compute(data).fit;
    const [cx, cy] = G().centroid(face.footprint);
    const phi = -Math.PI / 2 - Math.atan2(fit.down[1], fit.down[0]); // downslope -> (0,-1)
    const cosS = Math.cos(rad(face.slope));

    const fwd = ([x, y]) => {
      const dx = x - cx, dy = y - cy;
      const rx = dx * Math.cos(phi) - dy * Math.sin(phi);
      const ry = dx * Math.sin(phi) + dy * Math.cos(phi);
      return [rx, ry / cosS]; // stretch upslope axis to true length
    };
    const inv = ([X, Y]) => {
      const rx = X, ry = Y * cosS;
      const dx = rx * Math.cos(-phi) - ry * Math.sin(-phi);
      const dy = rx * Math.sin(-phi) + ry * Math.cos(-phi);
      return [dx + cx, dy + cy];
    };

    // The EXACT face outline (dormer notch included) — panels validate
    // against this. The convex hull is only used to lay out the strips,
    // matching the real algorithm (mcs_roof_convex_hull).
    const truePoly = face.footprint.map(fwd);
    const hull = G().convexHull(truePoly);

    // Obstructions touching this face, flattened + buffered
    const obstructions = data.obstructions
      .filter((ob) => G().polyIntersectsPoly(ob.footprint, face.footprint))
      .map((ob) => G().expandFromCentroid(ob.footprint.map(fwd), OBS_MARGIN));

    return { face, fit, truePoly, hull, obstructions, fwd, inv };
  }

  // Panel must sit fully inside the true outline with the MCS margin to
  // spare: corners and edge midpoints inside, and clear of the boundary.
  function panelFitsTrueShape(poly, truePoly) {
    const G2 = G();
    const testPts = [];
    for (let i = 0; i < 4; i++) {
      testPts.push({ pt: poly[i], clearance: MCS_MARGIN - 0.02 });
      const nxt = poly[(i + 1) % 4];
      testPts.push({ pt: [(poly[i][0] + nxt[0]) / 2, (poly[i][1] + nxt[1]) / 2], clearance: MCS_MARGIN * 0.6 });
    }
    for (const { pt, clearance } of testPts) {
      if (!G2.pointInPolygon(pt, truePoly)) return false;
      if (G2.distPointToBoundary(pt, truePoly) < clearance) return false;
    }
    return true;
  }

  // ---- the search ----------------------------------------------------
  function enumerateCandidates(fl) {
    const { hull, truePoly, obstructions } = fl;
    const b = G().bounds(hull);
    const candidates = [];

    const methods = [
      { name: 'portrait ↓', dir: 'TB', orients: ['P'] },
      { name: 'portrait ↑', dir: 'BT', orients: ['P'] },
      { name: 'landscape ↓', dir: 'TB', orients: ['L'] },
      { name: 'landscape ↑', dir: 'BT', orients: ['L'] },
      { name: 'mixed ↓', dir: 'TB', orients: ['P', 'L'] },
      { name: 'mixed ↑', dir: 'BT', orients: ['P', 'L'] },
    ];
    const offsets = [];
    for (let i = 0; i < 8; i++) offsets.push((PANEL.h * i) / 8);
    const alignments = ['center', 'left', 'right'];

    const rowH = (o) => (o === 'P' ? PANEL.h : PANEL.w);
    const panelW = (o) => (o === 'P' ? PANEL.w : PANEL.h);

    for (const method of methods) {
      for (const offset of offsets) {
        // --- split into strips of panel height ---
        const strips = [];
        if (method.dir === 'TB') {
          let top = b.maxY - offset;
          while (true) {
            let placed = false;
            for (const o of method.orients) {
              if (top - rowH(o) >= b.minY) { strips.push({ y0: top - rowH(o), y1: top, o }); top -= rowH(o); placed = true; break; }
            }
            if (!placed) break;
          }
        } else {
          let bot = b.minY + offset;
          while (true) {
            let placed = false;
            for (const o of method.orients) {
              if (bot + rowH(o) <= b.maxY) { strips.push({ y0: bot, y1: bot + rowH(o), o }); bot += rowH(o); placed = true; break; }
            }
            if (!placed) break;
          }
        }
        if (!strips.length) continue;

        // skip "sandwich" layouts (more than one orientation change)
        let swaps = 0;
        for (let i = 1; i < strips.length; i++) if (strips[i].o !== strips[i - 1].o) swaps++;
        if (swaps > 1) continue;

        // --- largest inscribed rectangle per strip (min-width scan) ---
        const rects = strips.map((s) => {
          let best = null;
          for (let y = s.y0 + 0.02; y <= s.y1 - 0.02 + 1e-9; y += Math.max(0.1, (s.y1 - s.y0) / 8)) {
            const slice = G().horizontalSlice(hull, y);
            if (!slice) continue;
            const wdt = slice[1] - slice[0];
            if (!best || wdt < best.w) best = { w: wdt, xL: slice[0], xR: slice[1] };
          }
          return best ? { ...s, xL: best.xL, xR: best.xR, w: best.w } : null;
        }).filter(Boolean);

        for (const align of alignments) {
          // --- fill rows, aligning to the previous row where possible ---
          const panels = [];
          let prevRow = null, prevO = null;
          for (const rect of rects) {
            const pw = panelW(rect.o);
            const nFit = Math.floor(rect.w / pw);
            if (nFit <= 0) { prevRow = null; prevO = null; continue; }

            let starts;
            if (prevRow && prevRow.length && prevO === rect.o) {
              const lefts = prevRow.map((p) => p.x0).sort((a, b2) => a - b2);
              starts = lefts.slice();
              for (let i = 0; i < lefts.length - 1; i++) starts.push((lefts[i] + lefts[i + 1]) / 2);
            } else {
              const total = nFit * pw;
              const leftover = rect.w - total;
              starts = [align === 'center' ? rect.xL + leftover / 2 : align === 'left' ? rect.xL : rect.xR - total];
            }

            let bestRow = [];
            for (const sx of starts) {
              let i0 = 0, i1 = nFit;
              if (sx < rect.xL - 0.01) i0 = 1;
              else if (sx + nFit * pw > rect.xR + 0.01) i1 = nFit - 1;
              const row = [];
              for (let i = i0; i < i1; i++) {
                row.push({ x0: sx + i * pw, x1: sx + (i + 1) * pw, y0: rect.y0, y1: rect.y1, o: rect.o });
              }
              if (row.length > bestRow.length) bestRow = row;
            }
            panels.push(...bestRow.map((p) => ({ ...p })));
            prevRow = bestRow;
            prevO = rect.o;
          }

          // --- validate against the true face outline + obstructions ---
          let count = 0;
          for (const p of panels) {
            const poly = [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]];
            const inRoof = panelFitsTrueShape(poly, truePoly);
            const hitsObs = obstructions.some((ob) => G().polyIntersectsPoly(poly, ob));
            p.ok = inRoof && !hitsObs;
            p.reason = !inRoof ? 'off roof' : hitsObs ? 'obstruction' : null;
            if (p.ok) count++;
          }

          candidates.push({ method: method.name, offset, align, strips: rects, panels, count });
        }
      }
    }
    return candidates;
  }

  function compute(data) {
    if (cached) return cached;
    const fl = flatten(data);
    const candidates = enumerateCandidates(fl);
    let best = null;
    for (const c of candidates) if (!best || c.count > best.count) best = c;
    cached = { fl, candidates, best };
    return cached;
  }

  // ---- inset-canvas rendering ---------------------------------------
  function makeRenderer(canvas, fl) {
    const ctx = canvas.getContext('2d');
    const b = G().bounds(fl.truePoly);
    const pad = 0.7;
    const spanX = b.maxX - b.minX + pad * 2;
    const spanY = b.maxY - b.minY + pad * 2;

    function fitCanvas() {
      const cssW = canvas.clientWidth || 460;
      const cssH = Math.round((cssW * spanY) / spanX);
      canvas.style.height = cssH + 'px';
      canvas.width = cssW * 2;
      canvas.height = cssH * 2;
    }
    fitCanvas();

    const S = () => Math.min(canvas.width / spanX, canvas.height / spanY);
    const px = ([x, y]) => [(x - b.minX + pad) * S(), canvas.height - (y - b.minY + pad) * S()];

    function path(poly) {
      ctx.beginPath();
      poly.forEach((p, i) => {
        const [X, Y] = px(p);
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.closePath();
    }

    function draw(candidate, { final = false } = {}) {
      fitCanvas();
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.lineWidth = 2;

      // the actual roof face outline (flattened, true plane metres) —
      // dormer notch and all
      path(fl.truePoly);
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fill();
      ctx.strokeStyle = '#f5b942';
      ctx.stroke();

      if (candidate) {
        // strips
        ctx.strokeStyle = 'rgba(94,200,202,0.25)';
        ctx.lineWidth = 1.5;
        for (const s of candidate.strips) {
          path([[s.xL, s.y0], [s.xR, s.y0], [s.xR, s.y1], [s.xL, s.y1]]);
          ctx.stroke();
        }
        // panels
        for (const p of candidate.panels) {
          path([[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]]);
          if (p.ok) {
            ctx.fillStyle = final ? 'rgba(110,201,122,0.5)' : 'rgba(110,201,122,0.32)';
            ctx.strokeStyle = '#6ec97a';
          } else {
            ctx.fillStyle = 'rgba(224,92,92,0.25)';
            ctx.strokeStyle = 'rgba(224,92,92,0.8)';
          }
          ctx.fill();
          ctx.lineWidth = final && p.ok ? 2.5 : 1.5;
          ctx.stroke();
        }
      }

      // obstructions on top
      for (const ob of fl.obstructions) {
        path(ob);
        ctx.fillStyle = 'rgba(229,122,82,0.55)';
        ctx.fill();
        ctx.strokeStyle = '#e57a52';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }

      // MCS point on the final frame
      if (final && candidate) {
        const okP = candidate.panels.filter((p) => p.ok);
        if (okP.length) {
          const minY = Math.min(...okP.map((p) => p.y0));
          const bottom = okP.filter((p) => Math.abs(p.y0 - minY) < 0.05);
          const x0 = Math.min(...bottom.map((p) => p.x0));
          const x1 = Math.max(...bottom.map((p) => p.x1));
          const [X, Y] = px([(x0 + x1) / 2, minY]);
          ctx.beginPath();
          ctx.arc(X, Y, 7, 0, Math.PI * 2);
          ctx.fillStyle = '#ff4dc4';
          ctx.fill();
          ctx.font = '600 20px "JetBrains Mono", monospace';
          ctx.fillStyle = '#ff4dc4';
          ctx.textAlign = 'center';
          ctx.fillText('MCS point', X, Y + 30);
        }
      }
    }

    return { draw };
  }

  // The best layout's MCS shading point (bottom-row midpoint) in local metres.
  function mcsPointLocal(data) {
    const { fl, best } = compute(data);
    const okP = best.panels.filter((p) => p.ok);
    if (!okP.length) return null;
    const minY = Math.min(...okP.map((p) => p.y0));
    const bottom = okP.filter((p) => Math.abs(p.y0 - minY) < 0.05);
    const x0 = Math.min(...bottom.map((p) => p.x0));
    const x1 = Math.max(...bottom.map((p) => p.x1));
    return fl.inv([(x0 + x1) / 2, minY]);
  }

  // Best layout's accepted panels mapped back onto the 3D roof plane.
  function bestPanels3D(data, viz) {
    const { fl, best } = compute(data);
    const fit = fl.fit;
    const grp = new THREE.Group();
    for (const p of best.panels) {
      if (!p.ok) continue;
      const cornersFlat = [[p.x0, p.y0], [p.x1, p.y0], [p.x1, p.y1], [p.x0, p.y1]];
      const pts = cornersFlat.map((c) => {
        const [x, y] = fl.inv(c);
        return { x, y, z: fit.a + fit.b * x + fit.c * y };
      });
      const mesh = viz.poly3D(pts, 0x14181d, { fillOpacity: 0.92, lineOpacity: 1, lift: 0.2 });
      mesh.children[1].material.color.set(0x5ec8ca);
      grp.add(mesh);
    }
    return grp;
  }

  return { compute, makeRenderer, mcsPointLocal, bestPanels3D, PANEL, MCS_MARGIN };
})();
