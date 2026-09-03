// =====================================================================
// Step 7: the electrical side. Panels wired in series strings onto the
// inverter's MPPT inputs, simulated through a clear June day.
//
// The model is simplified but honest where it matters for the story:
//   - each panel is a single-diode-style IV curve (explicit form),
//     photocurrent proportional to plane-of-array irradiance
//   - panels in a string share one current; each panel has a bypass
//     diode, so a starved panel costs ~0.6 V instead of blocking —
//     which is what carves multi-hump P–V curves under mismatch
//   - each MPPT input finds the global maximum of its string's curve
//   - the inverter sums its MPPTs, applies efficiency, and clips at
//     the G98 single-phase limit (3.68 kW)
// Not modelled: temperature, spectral effects, wiring resistance.
// =====================================================================
window.PE = window.PE || {};

window.PE.electricalSim = (function () {
  const rad = (d) => (d * Math.PI) / 180;

  // Trina TSM-450NEG9R.28-ish STC constants
  const PANEL = { Voc: 52.4, Vmp: 43.6, Isc: 11.0, Imp: 10.32, watts: 450 };
  const C2 = (PANEL.Vmp / PANEL.Voc - 1) / Math.log(1 - PANEL.Imp / PANEL.Isc);
  const C1 = (1 - PANEL.Imp / PANEL.Isc) * Math.exp(-PANEL.Vmp / (C2 * PANEL.Voc));
  const BYPASS_V = -0.6;
  const INVERTER = { acLimit: 3680, efficiency: 0.97, vMin: 60, vMax: 550, mppts: 3 };

  const STRING_COLOURS = [0x4dabf7, 0xf5b942, 0x20c997];
  const NSTEPS = 68;
  const T_START = 4.5, T_END = 21.5; // hours, June day

  // ---- sun + irradiance --------------------------------------------
  function sunAt(hours, latDeg) {
    const decl = rad(23.44); // June solstice
    const H = rad(15 * (hours - 12));
    const lat = rad(latDeg);
    const alt = Math.asin(Math.sin(lat) * Math.sin(decl) + Math.cos(lat) * Math.cos(decl) * Math.cos(H));
    // azimuth from due south, negative = east (matches the rest of the app)
    const az = Math.atan2(Math.sin(H), Math.cos(H) * Math.sin(lat) - Math.tan(decl) * Math.cos(lat));
    return { alt: (alt * 180) / Math.PI, az: (az * 180) / Math.PI };
  }

  function poaIrradiance(sun, faceAz, faceSlope) {
    if (sun.alt <= 0) return 0;
    const altR = rad(sun.alt), slopeR = rad(faceSlope);
    const cosInc =
      Math.cos(slopeR) * Math.sin(altR) +
      Math.sin(slopeR) * Math.cos(altR) * Math.cos(rad(sun.az - faceAz));
    const dni = 900 * Math.pow(Math.sin(altR), 0.4);
    const diffuse = 90 * (1 + Math.cos(slopeR)) / 2;
    return Math.min(1050, dni * Math.max(0, cosInc) + diffuse);
  }

  // ---- panel + string electrics ------------------------------------
  // Panel voltage at string current I, given irradiance G (W/m²).
  function panelV(I, G) {
    const IL = PANEL.Isc * (G / 1000);
    if (IL < 0.05 || I >= IL) return BYPASS_V; // starved → bypass diode conducts
    const voc = PANEL.Voc + 1.5 * Math.log(Math.max(G, 20) / 1000);
    return Math.max(BYPASS_V, C2 * voc * Math.log(1 + (IL - I) / (IL * C1)));
  }

  // String P–V by sweeping shared current; returns MPPT point + curve.
  function stringMppt(irradiances) {
    const maxIL = Math.max(...irradiances.map((G) => PANEL.Isc * (G / 1000)), 0);
    if (maxIL < 0.08) return { P: 0, V: 0, I: 0, curve: [] };
    const curve = [];
    let best = { P: 0, V: 0, I: 0 };
    const N = 140;
    for (let k = 1; k <= N; k++) {
      const I = (k / N) * maxIL;
      let V = 0;
      for (const G of irradiances) V += panelV(I, G);
      if (V <= 0) continue;
      const P = V * I;
      curve.push({ V, P });
      if (P > best.P && V >= INVERTER.vMin && V <= INVERTER.vMax) best = { P, V, I };
    }
    curve.sort((a, b) => a.V - b.V);
    // thin the curve for drawing
    const thin = curve.filter((_, i) => i % 2 === 0);
    return { P: best.P, V: best.V, I: best.I, curve: thin };
  }

  // ---- panel collection + scenarios --------------------------------
  function orientationLetter(az) {
    const a = ((az % 360) + 360) % 360;
    if (a >= 315 || a < 45) return 'S';
    if (a < 135) return 'W';
    if (a < 225) return 'N';
    return 'E';
  }

  function collectPanels(data) {
    const panels = [];
    for (const f of data.faces) {
      for (const arr of f.arrays) {
        for (const p of arr.panels) {
          const cx = p.corners.reduce((s, c) => s + c.x, 0) / p.corners.length;
          const cy = p.corners.reduce((s, c) => s + c.y, 0) / p.corners.length;
          const cz = p.corners.reduce((s, c) => s + c.z, 0) / p.corners.length;
          panels.push({
            corners: p.corners, centre: { x: cx, y: cy, z: cz },
            faceAz: f.azimuth, faceSlope: f.slope,
            letter: orientationLetter(f.azimuth),
          });
        }
      }
    }
    return panels;
  }

  let cached = null;

  function compute(data) {
    if (cached) return cached;
    const lat = data.siteData.property_details.geocoded_address.latitude;
    const panels = collectPanels(data);

    // group by orientation, keep the three biggest groups
    const byLetter = {};
    for (const p of panels) (byLetter[p.letter] = byLetter[p.letter] || []).push(p);
    const groups = Object.entries(byLetter)
      .map(([letter, ps]) => ({ letter, panels: ps }))
      .sort((a, b) => b.panels.length - a.panels.length)
      .slice(0, INVERTER.mppts);
    const usedLetters = new Set(groups.map((g) => g.letter));
    const excluded = panels.filter((p) => !usedLetters.has(p.letter));

    // the two groups whose sun profiles differ most (widest azimuth gap)
    // get merged in the "mixed" scenario
    let mixPair = [0, 1];
    let worst = -1;
    for (let i = 0; i < groups.length; i++) {
      for (let j = i + 1; j < groups.length; j++) {
        let d = Math.abs(groups[i].panels[0].faceAz - groups[j].panels[0].faceAz);
        d = Math.min(d, 360 - d);
        if (d > worst) { worst = d; mixPair = [i, j]; }
      }
    }
    const [mi, mj] = mixPair;
    const scenarios = {
      mixed: {
        label: 'mixed wiring',
        strings: [
          {
            name: `S1 · ${groups[mi].letter}+${groups[mj].letter} mixed`,
            colour: STRING_COLOURS[0],
            panels: groups[mi].panels.concat(groups[mj].panels),
          },
          ...groups
            .filter((_, gi) => gi !== mi && gi !== mj)
            .map((gr, k) => ({ name: `S2 · ${gr.letter}-facing`, colour: STRING_COLOURS[k + 1], panels: gr.panels })),
        ],
      },
      split: {
        label: 'one orientation per MPPT',
        strings: groups.map((gr, k) => ({
          name: `S${k + 1} · ${gr.letter}-facing`,
          colour: STRING_COLOURS[k],
          panels: gr.panels,
        })),
      },
    };

    // ---- simulate the day for both scenarios ----
    const times = [], sunTrack = [];
    for (let i = 0; i < NSTEPS; i++) {
      const t = T_START + (i / (NSTEPS - 1)) * (T_END - T_START);
      times.push(t);
      sunTrack.push(sunAt(t, lat));
    }
    for (const key of ['mixed', 'split']) {
      const scen = scenarios[key];
      scen.steps = [];
      let wh = 0;
      const dtH = (T_END - T_START) / (NSTEPS - 1);
      for (let i = 0; i < NSTEPS; i++) {
        const sun = sunTrack[i];
        const perString = scen.strings.map((s) => {
          const Gs = s.panels.map((p) => poaIrradiance(sun, p.faceAz, p.faceSlope));
          return { ...stringMppt(Gs), G: Gs };
        });
        const dc = perString.reduce((s, r) => s + r.P, 0);
        const ac = Math.min(INVERTER.acLimit, dc * INVERTER.efficiency);
        wh += ac * dtH;
        scen.steps.push({ perString, ac, dc });
      }
      scen.kwh = wh / 1000;
      scen.peakString = Math.max(...scen.steps.flatMap((st) => st.perString.map((r) => r.P)));
    }

    cached = { panels, groups, excluded, scenarios, times, sunTrack, lat, PANEL, INVERTER };
    return cached;
  }

  // ---- 3D wiring + irradiance tint ----------------------------------
  function buildWiring(data, viz, scenKey) {
    const sim = compute(data);
    const scen = sim.scenarios[scenKey];
    const grp = new THREE.Group();

    // inverter on the ground at the south edge of the building
    let sPt = data.buildingOutline[0];
    for (const p of data.buildingOutline) if (p[1] < sPt[1]) sPt = p;
    const invPos = viz.toScene(sPt[0] + 1.2, sPt[1] - 2.2, data.groundLevel + 0.55);
    const inv = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 1.1, 0.35),
      new THREE.MeshStandardMaterial({ color: 0xb9c2cb, roughness: 0.5, metalness: 0.4 })
    );
    inv.position.copy(invPos);
    grp.add(inv);

    const tints = [];
    scen.strings.forEach((s, si) => {
      const wirePts = [];
      s.panels.forEach((p) => {
        // panel overlay: string-coloured edge + irradiance tint fill
        const vecs = p.corners.map((c) => viz.toScene(c.x, c.y, c.z + 0.16));
        const fill = new THREE.Mesh(
          viz.polyGeometry(vecs, p.corners.map((c) => [c.x, c.y])),
          new THREE.MeshBasicMaterial({ color: 0x1a2433, transparent: true, opacity: 0.65, side: THREE.DoubleSide, depthWrite: false })
        );
        grp.add(fill);
        tints.push({ mesh: fill, panel: p });
        grp.add(viz.lineLoop(vecs, s.colour, { opacity: 0.95 }));
        wirePts.push(viz.toScene(p.centre.x, p.centre.y, p.centre.z + 0.25));
      });
      // series wire: panel → panel → down to the inverter
      wirePts.push(new THREE.Vector3(invPos.x, invPos.y + 0.6 + si * 0.18, invPos.z));
      const wireGeom = new THREE.BufferGeometry().setFromPoints(wirePts);
      grp.add(new THREE.Line(wireGeom, new THREE.LineBasicMaterial({ color: s.colour, transparent: true, opacity: 0.9 })));
    });

    const cDark = new THREE.Color(0x141c28);
    const cBright = new THREE.Color(0xffd34d);
    function setIrradiance(stepIdx) {
      const sun = sim.sunTrack[stepIdx];
      for (const t of tints) {
        const G = poaIrradiance(sun, t.panel.faceAz, t.panel.faceSlope);
        t.mesh.material.color.copy(cDark).lerp(cBright, Math.min(1, G / 1000));
      }
    }

    return { group: grp, setIrradiance, invPos };
  }

  // sun position for the scene light / sun disc
  function sunScenePos(data, viz, stepIdx, centre) {
    const sun = compute(data).sunTrack[stepIdx];
    const a = rad(sun.az), h = rad(Math.max(sun.alt, -5));
    const uE = -Math.sin(a) * Math.cos(h);
    const uN = -Math.cos(a) * Math.cos(h);
    const R = 95;
    return {
      pos: new THREE.Vector3(centre.x + uE * R, centre.y + Math.sin(h) * R, centre.z - uN * R),
      alt: sun.alt,
    };
  }

  // ---- 2D dashboard -------------------------------------------------
  function makeDashboard(canvas, data) {
    const sim = compute(data);
    const dpr = 2;
    const ctx2 = canvas.getContext('2d');
    let W = 0, H = 0;
    // size lazily on the first real draw — at construction time the inset
    // may not have had a layout pass yet and clientWidth reads 0
    function ensureSize() {
      const wCss = canvas.clientWidth || canvas.parentElement.clientWidth - 24 || 460;
      if (wCss > 10 && Math.abs(canvas.width - wCss * dpr) > 4) {
        canvas.width = wCss * dpr;
        canvas.height = Math.round(wCss * 0.52) * dpr;
        canvas.style.height = Math.round(wCss * 0.52) + 'px';
      }
      W = canvas.width; H = canvas.height;
      return W > 20;
    }
    const Pmax = Math.max(sim.scenarios.mixed.peakString, sim.scenarios.split.peakString) * 1.12;
    const fmtTime = (t) => `${String(Math.floor(t)).padStart(2, '0')}:${String(Math.round((t % 1) * 60)).padStart(2, '0')}`;
    const hex = (c) => '#' + c.toString(16).padStart(6, '0');

    function draw(scenKey, stepIdx, ghostKey) {
      if (!ensureSize()) return;
      const scen = sim.scenarios[scenKey];
      const step = scen.steps[stepIdx];
      ctx2.clearRect(0, 0, W, H);
      ctx2.font = `${10 * dpr}px "JetBrains Mono", monospace`;

      // ---- left: string P–V curves ----
      const L = { x: 34 * dpr, y: 24 * dpr, w: W * 0.44 - 44 * dpr, h: H - 46 * dpr };
      ctx2.fillStyle = 'rgba(154,163,173,0.9)';
      ctx2.fillText('string P–V curves', L.x, 14 * dpr);
      ctx2.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx2.strokeRect(L.x, L.y, L.w, L.h);
      const vMax = 340;
      const px = (V) => L.x + (V / vMax) * L.w;
      const py = (P) => L.y + L.h - (P / Pmax) * L.h;
      ctx2.fillStyle = 'rgba(154,163,173,0.55)';
      for (const v of [100, 200, 300]) ctx2.fillText(`${v}V`, px(v) - 8 * dpr, L.y + L.h + 12 * dpr);
      step.perString.forEach((r, si) => {
        const colour = hex(scen.strings[si].colour);
        if (r.curve.length > 1) {
          ctx2.strokeStyle = colour;
          ctx2.lineWidth = 1.6 * dpr;
          ctx2.beginPath();
          r.curve.forEach((pt, i) => (i ? ctx2.lineTo(px(pt.V), py(pt.P)) : ctx2.moveTo(px(pt.V), py(pt.P))));
          ctx2.stroke();
        }
        if (r.P > 0) {
          ctx2.fillStyle = colour;
          ctx2.beginPath();
          ctx2.arc(px(r.V), py(r.P), 3.2 * dpr, 0, Math.PI * 2);
          ctx2.fill();
        }
        // annotate the strongest string's operating point
        if (r.P > 0 && r.P === Math.max(...step.perString.map((q) => q.P))) {
          ctx2.fillStyle = 'rgba(230,232,235,0.85)';
          ctx2.fillText('← max power point', px(r.V) + 6 * dpr, py(r.P) - 5 * dpr);
        }
        // legend
        ctx2.fillStyle = colour;
        ctx2.fillText(`${scen.strings[si].name} · ${r.P.toFixed(0)} W`, L.x + 6 * dpr, L.y + (14 + si * 13) * dpr);
      });

      // ---- right: AC power through the day ----
      const R = { x: W * 0.46 + 30 * dpr, y: 24 * dpr, w: W * 0.54 - 44 * dpr, h: H - 46 * dpr };
      ctx2.fillStyle = 'rgba(154,163,173,0.9)';
      ctx2.fillText(`AC out · ${scen.label}`, R.x, 14 * dpr);
      ctx2.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx2.strokeRect(R.x, R.y, R.w, R.h);
      const acMax = 4300;
      const tx = (i) => R.x + (i / (NSTEPS - 1)) * R.w;
      const ty = (w) => R.y + R.h - (w / acMax) * R.h;
      ctx2.fillStyle = 'rgba(154,163,173,0.55)';
      for (const hh of [6, 12, 18]) {
        const i = ((hh - T_START) / (T_END - T_START)) * (NSTEPS - 1);
        ctx2.fillText(`${hh}:00`, tx(i) - 10 * dpr, R.y + R.h + 12 * dpr);
      }
      // inverter clip line
      ctx2.strokeStyle = 'rgba(224,92,92,0.6)';
      ctx2.setLineDash([4 * dpr, 3 * dpr]);
      ctx2.beginPath();
      ctx2.moveTo(R.x, ty(INVERTER.acLimit));
      ctx2.lineTo(R.x + R.w, ty(INVERTER.acLimit));
      ctx2.stroke();
      ctx2.setLineDash([]);
      ctx2.fillStyle = 'rgba(224,92,92,0.8)';
      ctx2.fillText('3.68 kW clip', R.x + R.w - 62 * dpr, ty(INVERTER.acLimit) - 4 * dpr);
      // ghost of the other scenario (full day, faint)
      if (ghostKey) {
        const g = sim.scenarios[ghostKey];
        ctx2.strokeStyle = 'rgba(230,232,235,0.28)';
        ctx2.lineWidth = 1.2 * dpr;
        ctx2.setLineDash([3 * dpr, 3 * dpr]);
        ctx2.beginPath();
        g.steps.forEach((st, i) => (i ? ctx2.lineTo(tx(i), ty(st.ac)) : ctx2.moveTo(tx(i), ty(st.ac))));
        ctx2.stroke();
        ctx2.setLineDash([]);
      }
      // filled AC area up to now
      const fillCol = scenKey === 'mixed' ? 'rgba(229,122,82,0.30)' : 'rgba(110,201,122,0.30)';
      const lineCol = scenKey === 'mixed' ? '#e57a52' : '#6ec97a';
      ctx2.beginPath();
      ctx2.moveTo(tx(0), ty(0));
      for (let i = 0; i <= stepIdx; i++) ctx2.lineTo(tx(i), ty(scen.steps[i].ac));
      ctx2.lineTo(tx(stepIdx), ty(0));
      ctx2.closePath();
      ctx2.fillStyle = fillCol;
      ctx2.fill();
      ctx2.strokeStyle = lineCol;
      ctx2.lineWidth = 1.8 * dpr;
      ctx2.beginPath();
      for (let i = 0; i <= stepIdx; i++) (i ? ctx2.lineTo(tx(i), ty(scen.steps[i].ac)) : ctx2.moveTo(tx(i), ty(scen.steps[i].ac)));
      ctx2.stroke();
      // time cursor
      ctx2.strokeStyle = 'rgba(245,185,66,0.8)';
      ctx2.beginPath();
      ctx2.moveTo(tx(stepIdx), R.y);
      ctx2.lineTo(tx(stepIdx), R.y + R.h);
      ctx2.stroke();
      ctx2.fillStyle = '#f5b942';
      ctx2.fillText(fmtTime(sim.times[stepIdx]), Math.min(tx(stepIdx) + 4 * dpr, R.x + R.w - 34 * dpr), R.y + 12 * dpr);
    }

    return { draw, fmtTime };
  }

  return { compute, buildWiring, sunScenePos, makeDashboard, poaIrradiance, NSTEPS, INVERTER, PANEL };
})();
