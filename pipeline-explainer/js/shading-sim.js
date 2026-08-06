// =====================================================================
// Step 6 demo: the backend's calculate_shading, live on the real DSM.
// From the array's MCS point every DSM pixel becomes an (azimuth,
// altitude) pair; the max altitude per azimuth bin builds a horizon
// profile which is intersected with the MCS sky segments.
//
// Azimuth convention throughout: degrees from due south, negative=east.
// =====================================================================
window.PE = window.PE || {};

window.PE.shadingSim = (function () {
  const rad = (d) => (d * Math.PI) / 180;
  const deg = (r) => (r * 180) / Math.PI;

  const BIN = 5;             // degrees per horizon bin
  const MAX_AZ = 135;        // scan window, matches the backend
  const COVER_THRESHOLD = 0.10;

  let cached = null;

  function angDiff(a, b) {
    let d = Math.abs(a - b) % 360;
    return d > 180 ? 360 - d : d;
  }

  function compute(data) {
    if (cached) return cached;
    const { dsm } = data;
    const roofAz = PE.planeFit.compute(data).fit.azimuth;

    const mcs = PE.layoutSim.mcsPointLocal(data);
    const [mx, my] = mcs;
    const zRef = data.coords.sampleDSM(mx, my) + 0.1; // +10cm for the array

    const nBins = (2 * MAX_AZ) / BIN;
    const maxAlt = new Float32Array(nBins);       // horizon in front of the array
    const roofAlt = new Float32Array(nBins);      // "behind the roof" profile (discounted)

    const cell = dsm.cellsize;
    for (let r = 0; r < dsm.nrows; r++) {
      const y = (dsm.nrows - r - 0.5) * cell;
      for (let c = 0; c < dsm.ncols; c++) {
        const x = (c + 0.5) * cell;
        const dE = x - mx, dN = y - my;
        const dist = Math.hypot(dE, dN);
        if (dist < 0.6) continue;
        const z = dsm.grid[r * dsm.ncols + c];
        if (!isFinite(z) || z === dsm.nodata || z <= zRef) continue;
        const az = deg(Math.atan2(-dE / dist, -dN / dist));
        if (Math.abs(az) >= MAX_AZ) continue;
        const alt = deg(Math.atan2(z - zRef, dist));
        const bin = Math.min(nBins - 1, Math.floor((az + MAX_AZ) / BIN));
        // pixels behind the array (>90° from the roof azimuth) are the roof
        // itself / the ridge — tracked separately and NOT counted as shade
        if (angDiff(az, roofAz) < 90) {
          if (alt > maxAlt[bin]) maxAlt[bin] = alt;
        } else {
          if (alt > roofAlt[bin]) roofAlt[bin] = alt;
        }
      }
    }

    const horizonAt = (az) => {
      if (Math.abs(az) >= MAX_AZ) return 0;
      return maxAlt[Math.min(nBins - 1, Math.floor((az + MAX_AZ) / BIN))];
    };

    // --- MCS segments: blocked if >10% of the segment sits under the horizon
    const segments = window.MCS_SEGMENTS.map((poly, i) => {
      const b = PE.geom.bounds(poly);
      let inside = 0, covered = 0;
      const N = 14;
      for (let ix = 0; ix < N; ix++) {
        for (let iy = 0; iy < N; iy++) {
          const px = b.minX + ((ix + 0.5) / N) * (b.maxX - b.minX);
          const py = b.minY + ((iy + 0.5) / N) * (b.maxY - b.minY);
          if (!PE.geom.pointInPolygon([px, py], poly)) continue;
          inside++;
          if (py <= horizonAt(px)) covered++;
        }
      }
      const frac = inside ? covered / inside : 0;
      return { poly, index: i, coveredFraction: frac, blocked: frac > COVER_THRESHOLD };
    });

    const blockedCount = segments.filter((s) => s.blocked).length;
    // matches the backend: factor is 1 - count/100 regardless of segment count
    const shadingFactor = Math.round((1 - blockedCount / 100) * 100) / 100;

    cached = { mcs, zRef, roofAz, nBins, maxAlt, roofAlt, horizonAt, segments, blockedCount, shadingFactor };
    return cached;
  }

  // ---- alt/az chart on the inset canvas ------------------------------
  function makeChartRenderer(canvas, data) {
    const S = compute(data);
    const ctx = canvas.getContext('2d');

    const ALT_MAX = 45;
    function fitCanvas() {
      const cssW = canvas.clientWidth || 460;
      const cssH = Math.round(cssW * 0.52);
      canvas.style.height = cssH + 'px';
      canvas.width = cssW * 2;
      canvas.height = cssH * 2;
    }

    const M = { l: 56, r: 16, t: 14, b: 40 };
    const px = (az, alt) => [
      M.l + ((az + MAX_AZ) / (2 * MAX_AZ)) * (canvas.width - M.l - M.r),
      canvas.height - M.b - (alt / ALT_MAX) * (canvas.height - M.t - M.b),
    ];

    function poly(p) {
      ctx.beginPath();
      p.forEach(([a, h], i) => {
        const [X, Y] = px(a, Math.min(h, ALT_MAX));
        i ? ctx.lineTo(X, Y) : ctx.moveTo(X, Y);
      });
      ctx.closePath();
    }

    // progress: 0..1 sweeps the horizon in from the left for a little drama
    function draw(progress = 1, { showSegments = true, showBlocked = true } = {}) {
      fitCanvas();
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // axes
      ctx.strokeStyle = 'rgba(255,255,255,0.25)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(...px(-MAX_AZ, 0)); ctx.lineTo(...px(MAX_AZ, 0));
      ctx.stroke();
      ctx.font = '400 17px "JetBrains Mono", monospace';
      ctx.fillStyle = 'rgba(154,163,173,0.9)';
      ctx.textAlign = 'center';
      for (const a of [-90, 0, 90]) {
        const lbl = a === 0 ? 'S' : a === -90 ? 'E' : 'W';
        ctx.fillText(lbl, px(a, 0)[0], canvas.height - 12);
      }
      ctx.save();
      ctx.translate(16, canvas.height / 2);
      ctx.rotate(-Math.PI / 2);
      ctx.fillText('altitude °', 0, 0);
      ctx.restore();

      // MCS segments
      if (showSegments) {
        for (const seg of S.segments) {
          poly(seg.poly);
          if (showBlocked && seg.blocked && progress >= 1) {
            ctx.fillStyle = 'rgba(224,92,92,0.4)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(224,92,92,0.9)';
          } else {
            ctx.strokeStyle = 'rgba(255,255,255,0.16)';
          }
          ctx.lineWidth = 1;
          ctx.stroke();
        }
      }

      // roof-behind profile (discounted) — light grey fill
      const nShow = Math.floor(S.nBins * progress);
      ctx.beginPath();
      ctx.moveTo(...px(-MAX_AZ, 0));
      for (let i = 0; i < nShow; i++) {
        const az0 = -MAX_AZ + i * BIN, az1 = az0 + BIN;
        const h = Math.min(S.roofAlt[i], ALT_MAX);
        ctx.lineTo(...px(az0, h));
        ctx.lineTo(...px(az1, h));
      }
      ctx.lineTo(...px(-MAX_AZ + nShow * BIN, 0));
      ctx.closePath();
      ctx.fillStyle = 'rgba(154,163,173,0.16)';
      ctx.fill();

      // shading horizon — orange
      ctx.beginPath();
      ctx.moveTo(...px(-MAX_AZ, 0));
      for (let i = 0; i < nShow; i++) {
        const az0 = -MAX_AZ + i * BIN, az1 = az0 + BIN;
        const h = Math.min(S.maxAlt[i], ALT_MAX);
        ctx.lineTo(...px(az0, h));
        ctx.lineTo(...px(az1, h));
      }
      ctx.lineTo(...px(-MAX_AZ + nShow * BIN, 0));
      ctx.closePath();
      ctx.fillStyle = 'rgba(245,185,66,0.35)';
      ctx.fill();
      ctx.strokeStyle = '#f5b942';
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    return { draw };
  }

  // ---- 3D horizon fan around the MCS point ---------------------------
  // Each 5° bin is its own mesh (initially hidden) so the sweep in step 6
  // can reveal them east-to-west in sync with the chart. Also returns a
  // scan "ray" line the sweep animates.
  function buildHorizonFan(data, viz) {
    const S = compute(data);
    const [mx, my] = S.mcs;
    const R = 26;
    const grp = new THREE.Group();
    const bins = [];

    const mkMat = (colour, opacity) =>
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false });

    for (let i = 0; i < S.nBins; i++) {
      const az0 = -MAX_AZ + i * BIN, az1 = az0 + BIN;
      const isFront = angDiff(az0 + BIN / 2, S.roofAz) < 90;
      const alt = isFront ? S.maxAlt[i] : S.roofAlt[i];
      if (alt <= 0.3) continue;
      const verts = [];
      for (const az of [az0, az1]) {
        const uE = -Math.sin(rad(az));
        const uN = -Math.cos(rad(az));
        verts.push({ base: viz.toScene(mx + R * uE, my + R * uN, S.zRef), top: viz.toScene(mx + R * uE, my + R * uN, S.zRef + R * Math.tan(rad(Math.min(alt, 45)))) });
      }
      const g = new THREE.BufferGeometry().setFromPoints([
        verts[0].base, verts[1].base, verts[1].top,
        verts[0].base, verts[1].top, verts[0].top,
      ]);
      const mesh = new THREE.Mesh(g, mkMat(isFront ? 0xf5b942 : 0x9aa3ad, isFront ? 0.35 : 0.12));
      mesh.visible = false;
      grp.add(mesh);
      bins.push({ mesh, az0 });
    }

    // MCS point marker
    const marker = new THREE.Mesh(
      new THREE.SphereGeometry(0.28, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff4dc4 })
    );
    marker.position.copy(viz.toScene(mx, my, S.zRef + 0.15));
    grp.add(marker);

    // scan ray for the sweep animation
    const rayGeom = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
    const ray = new THREE.Line(rayGeom, new THREE.LineBasicMaterial({ color: 0xff4dc4, transparent: true, opacity: 0.9 }));
    ray.visible = false;
    grp.add(ray);

    function setSweep(progress) {
      // progress 0..1 sweeps azimuth -135° (east) → +135° (west).
      // Returns aim points for the camera: `ray` follows the true horizon
      // altitude (jumpy — trees then gaps), while `aim` sits at a fixed
      // altitude so the camera pans level instead of pitching up and down.
      const azNow = -MAX_AZ + progress * 2 * MAX_AZ;
      for (const b of bins) b.mesh.visible = b.az0 + BIN <= azNow;
      const bin = Math.max(0, Math.min(S.nBins - 1, Math.floor((azNow + MAX_AZ) / BIN)));
      const isFront = angDiff(azNow, S.roofAz) < 90;
      const alt = Math.max(2, Math.min(45, isFront ? S.maxAlt[bin] : S.roofAlt[bin]));
      const uE = -Math.sin(rad(azNow)), uN = -Math.cos(rad(azNow));
      const to = viz.toScene(mx + R * uE, my + R * uN, S.zRef + R * Math.tan(rad(alt)));
      if (progress > 0 && progress < 1) {
        ray.visible = true;
        ray.geometry.setFromPoints([viz.toScene(mx, my, S.zRef + 0.15), to]);
      } else {
        ray.visible = false;
      }
      const AIM_ALT = 12; // degrees — steady eye level for the pan
      const aim = viz.toScene(mx + R * uE, my + R * uN, S.zRef + R * Math.tan(rad(AIM_ALT)));
      return { ray: to, aim };
    }

    const eyePos = viz.toScene(mx, my, S.zRef + 1.5);
    return { group: grp, setSweep, eyePos };
  }

  return { compute, makeChartRenderer, buildHorizonFan, MAX_AZ, BIN };
})();
