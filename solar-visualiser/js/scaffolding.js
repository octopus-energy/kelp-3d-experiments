// =====================================================================
// Scaffolding designer: click "Draw scaffold run", place vertices along
// the ground in a true-overhead orthographic plan view (toggle to the
// regular 3D view for precise placement), and a scaffold is generated
// up to the eaves — standards, ledgers, transoms, braces and boards.
//
// Corners are mitred: the outer row follows an offset polyline whose
// interior vertices sit on the miter point, and corner nodes are shared
// between segments so tubes and boards meet instead of crossing.
//
// Costing: run length × billed height × rate (£/m²). Billed height is
// whole 2m lifts (rounded up from ground-to-eaves, adjustable per run).
//
// The plan-view drawing interaction itself lives in the shared
// plan-draw.js engine (also used by the building-model wall drawing).
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.setupScaffolding = function ({ scene, terrainMesh, coords, siteData, hoverables, cameraAnimator, planDraw }) {
  const $ = (id) => document.getElementById(id);
  const drawBtn = $('scaffold-draw-btn');
  const listEl = $('scaffold-list');
  const totalEl = $('scaffold-total');
  const rateInput = $('scaffold-rate');

  // Scaffold dimensioning (metres)
  const LIFT_H = 2.0;       // height per lift; billed height = whole lifts
  const BAY_MAX = 2.0;      // max bay length (segments are subdivided to this)
  const ROW_GAP = 1.0;      // inner-to-outer standard spacing
  const TUBE_R = 0.024;     // 48mm scaffold tube
  const GUARDRAIL_H = 1.0;  // outer standards extend this far above top platform

  // Eaves elevation = lowest vertex across active roof faces.
  let eavesElev = Infinity;
  const footprint = []; // scene-XZ of all active roof vertices
  siteData.roof_faces.forEach((rf) => {
    if (!rf.solar_arrays[0].active) return;
    rf.geometry.coordinates[0].forEach((p) => {
      eavesElev = Math.min(eavesElev, p[2]);
      const [x, z] = coords.lonLatToSceneXZ(p[0], p[1]);
      footprint.push({ x, z });
    });
  });
  const bc = footprint.reduce((acc, p) => ({ x: acc.x + p.x / footprint.length, z: acc.z + p.z / footprint.length }), { x: 0, z: 0 });

  const groundAt = (x, z) => coords.sampleDSM(x, coords.HEIGHT - z);

  // Root is toggled/exaggerated as one; runsGroup holds finished runs.
  const root = new THREE.Group();
  const runsGroup = new THREE.Group();
  root.add(runsGroup);
  scene.add(root);

  const tubeMat = new THREE.MeshStandardMaterial({ color: 0xb9c2cb, metalness: 0.8, roughness: 0.35 });
  const boardMat = new THREE.MeshStandardMaterial({ color: 0xa98c5f, roughness: 0.85, metalness: 0.0, side: THREE.DoubleSide });
  const unitTube = new THREE.CylinderGeometry(1, 1, 1, 6);
  const UP = new THREE.Vector3(0, 1, 0);

  function addTube(parent, a, b) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 0.02) return;
    const m = new THREE.Mesh(unitTube, tubeMat);
    m.scale.set(TUBE_R, len, TUBE_R);
    m.position.addVectors(a, b).multiplyScalar(0.5);
    m.quaternion.setFromUnitVectors(UP, dir.divideScalar(len));
    m.castShadow = true;
    parent.add(m);
  }
  const v3 = (x, y, z) => new THREE.Vector3(x, y, z);

  // Flat board platform spanning a (possibly trapezoidal) bay quad.
  function addBoard(parent, corners, y) {
    const cx = corners.reduce((s, c) => s + c.x / 4, 0);
    const cz = corners.reduce((s, c) => s + c.z / 4, 0);
    const shape = new THREE.Shape();
    corners.forEach((c, i) => {
      // inset towards the bay centre so boards sit between the tubes
      const x = c.x + (cx - c.x) * 0.14, z = c.z + (cz - c.z) * 0.14;
      if (i === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    });
    const geom = new THREE.ExtrudeGeometry(shape, { depth: 0.045, bevelEnabled: false });
    geom.rotateX(Math.PI / 2); // shape (x,z) -> horizontal, extrusion -> -y
    const board = new THREE.Mesh(geom, boardMat);
    board.position.y = y + 0.045;
    board.castShadow = board.receiveShadow = true;
    parent.add(board);
    return board;
  }

  // Offset the drawn polyline outwards (away from the building) by
  // ROW_GAP, with mitred interior corners.
  function offsetPolyline(verts) {
    const segPerp = [];
    for (let i = 0; i < verts.length - 1; i++) {
      const a = verts[i], b = verts[i + 1];
      const len = Math.hypot(b.x - a.x, b.z - a.z) || 1;
      const dir = { x: (b.x - a.x) / len, z: (b.z - a.z) / len };
      let perp = { x: -dir.z, z: dir.x };
      const midx = (a.x + b.x) / 2, midz = (a.z + b.z) / 2;
      if (perp.x * (midx - bc.x) + perp.z * (midz - bc.z) < 0) perp = { x: -perp.x, z: -perp.z };
      segPerp.push(perp);
    }
    return verts.map((v, i) => {
      const pA = segPerp[Math.max(0, i - 1)];
      const pB = segPerp[Math.min(segPerp.length - 1, i)];
      let mx = pA.x + pB.x, mz = pA.z + pB.z;
      const mlen = Math.hypot(mx, mz);
      if (mlen < 1e-6) { mx = pB.x; mz = pB.z; }
      else { mx /= mlen; mz /= mlen; }
      // miter length, clamped for very sharp turns
      const d = Math.min(ROW_GAP / Math.max(0.4, mx * pB.x + mz * pB.z), ROW_GAP * 2.5);
      return { x: v.x + mx * d, z: v.z + mz * d };
    });
  }

  // ------------------------------------------------------------------
  // Scaffold generation from ground vertices ({x, z} scene coords).
  // liftDelta raises/lowers the whole scaffold in whole lifts relative
  // to the auto height (top platform at the eaves).
  // ------------------------------------------------------------------
  function buildRunGroup(verts, liftDelta) {
    const g = new THREE.Group();
    const boards = [];
    const outer = offsetPolyline(verts);

    let length = 0;
    let minGround = Infinity;
    verts.forEach((v) => { minGround = Math.min(minGround, groundAt(v.x, v.z)); });

    const defaultLifts = Math.max(1, Math.ceil((eavesElev - minGround) / LIFT_H - 1e-9));
    const lifts = Math.max(1, defaultLifts + liftDelta);
    const billedH = lifts * LIFT_H;
    const topPlatform = eavesElev - 0.15 + (lifts - defaultLifts) * LIFT_H;

    // Platform levels every lift below the top one, plus a base ledger.
    const platforms = [];
    for (let y = topPlatform; y > minGround + 0.8; y -= LIFT_H) platforms.push(y);
    const levels = platforms.concat([minGround + 0.3]).sort((p, q) => p - q);

    // Shared node list along the whole polyline: corner nodes belong to
    // both adjacent segments, so frames join instead of overlapping.
    const nodes = []; // { in: {x,z}, out: {x,z} }
    const bays = [];  // { a, b: node indices }
    for (let i = 0; i < verts.length - 1; i++) {
      const a = verts[i], b = verts[i + 1];
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      if (segLen < 0.3) continue;
      length += segLen;
      const oa = outer[i], ob = outer[i + 1];
      const nBays = Math.max(1, Math.ceil(segLen / BAY_MAX));
      let prev;
      if (nodes.length === 0) {
        nodes.push({ in: { x: a.x, z: a.z }, out: { x: oa.x, z: oa.z } });
      }
      prev = nodes.length - 1;
      for (let k = 1; k <= nBays; k++) {
        const t = k / nBays;
        nodes.push({
          in: { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t },
          out: { x: oa.x + (ob.x - oa.x) * t, z: oa.z + (ob.z - oa.z) * t },
        });
        bays.push({ a: prev, b: nodes.length - 1 });
        prev = nodes.length - 1;
      }

      // Ledgers along each row, full segment, at every level; double
      // guardrail above the top platform on the outer row.
      levels.forEach((y) => {
        addTube(g, v3(a.x, y - 0.07, a.z), v3(b.x, y - 0.07, b.z));
        addTube(g, v3(oa.x, y - 0.07, oa.z), v3(ob.x, y - 0.07, ob.z));
      });
      [0.5, 0.95].forEach((h) => {
        addTube(g, v3(oa.x, topPlatform + h, oa.z), v3(ob.x, topPlatform + h, ob.z));
      });
    }

    // Standards + transoms at every node (corner nodes built once).
    nodes.forEach((n) => {
      addTube(g, v3(n.in.x, groundAt(n.in.x, n.in.z) - 0.05, n.in.z), v3(n.in.x, topPlatform + 0.05, n.in.z));
      addTube(g, v3(n.out.x, groundAt(n.out.x, n.out.z) - 0.05, n.out.z), v3(n.out.x, topPlatform + GUARDRAIL_H, n.out.z));
      levels.forEach((y) => addTube(g, v3(n.in.x, y - 0.07, n.in.z), v3(n.out.x, y - 0.07, n.out.z)));
    });

    // Boards + alternating facade bracing per bay.
    bays.forEach((bay, k) => {
      const nA = nodes[bay.a], nB = nodes[bay.b];
      platforms.forEach((y) => {
        boards.push(addBoard(g, [nA.in, nB.in, nB.out, nA.out], y));
      });
      for (let j = 0; j < levels.length - 1; j++) {
        const [lo, hi] = [levels[j], levels[j + 1]];
        if ((k + j) % 2 === 0) addTube(g, v3(nA.out.x, lo, nA.out.z), v3(nB.out.x, hi, nB.out.z));
        else addTube(g, v3(nB.out.x, lo, nB.out.z), v3(nA.out.x, hi, nA.out.z));
      }
    });

    return { group: g, boards, stats: { length, lifts, defaultLifts, billedH, minGround } };
  }

  // ------------------------------------------------------------------
  // Run registry + sidebar list + costing
  // ------------------------------------------------------------------
  const runs = [];
  let runSeq = 0;

  function getRate() {
    const r = parseFloat(rateInput.value);
    return isFinite(r) && r > 0 ? r : 26;
  }
  const fmtGBP = (n) => '£' + Math.round(n).toLocaleString('en-GB');

  function refreshCosts() {
    const rate = getRate();
    let totalCost = 0;
    listEl.innerHTML = '';
    if (runs.length === 0) {
      listEl.innerHTML = '<div class="scaffold-empty">No runs yet — draw one along a wall to price it.</div>';
    }
    runs.forEach((run) => {
      const s = run.stats;
      const area = s.length * s.billedH;
      const cost = area * rate;
      totalCost += cost;
      Object.assign(run.tooltipData, {
        length: s.length.toFixed(1),
        height: s.billedH.toFixed(0) + ' m (' + s.lifts + ' lifts)',
        area: area.toFixed(1),
        cost: fmtGBP(cost),
      });
      const item = document.createElement('div');
      item.className = 'array-item scaffold-item';
      item.innerHTML = `
        <div class="name"><span>${run.name}</span><button class="scaffold-del" title="Remove run">×</button></div>
        <div class="meta">${s.length.toFixed(1)} m × ${s.billedH.toFixed(0)} m (${s.lifts} lifts) · ${area.toFixed(1)} m²</div>
        <div class="scaffold-foot">
          <div class="lift-stepper">
            <button class="h-dec" title="One lift lower">−</button>
            <span>${s.billedH.toFixed(0)} m</span>
            <button class="h-inc" title="One lift higher">+</button>
          </div>
          <div class="cost">${fmtGBP(cost)}</div>
        </div>`;
      item.querySelector('.scaffold-del').addEventListener('click', (e) => { e.stopPropagation(); removeRun(run); });
      item.querySelector('.h-dec').addEventListener('click', (e) => { e.stopPropagation(); stepHeight(run, -1); });
      item.querySelector('.h-inc').addEventListener('click', (e) => { e.stopPropagation(); stepHeight(run, +1); });
      item.addEventListener('click', () => flyToRun(run));
      listEl.appendChild(item);
    });
    totalEl.textContent = fmtGBP(totalCost);
  }
  rateInput.addEventListener('input', refreshCosts);

  function disposeRunGroup(run) {
    runsGroup.remove(run.group);
    run.group.traverse((o) => { if (o.isMesh && o.geometry !== unitTube) o.geometry.dispose(); });
    run.boards.forEach((b) => {
      const i = hoverables.indexOf(b);
      if (i >= 0) hoverables.splice(i, 1);
    });
  }

  function attachRunGroup(run, built) {
    run.group = built.group;
    run.boards = built.boards;
    run.stats = built.stats;
    run.boards.forEach((b) => { b.userData = run.tooltipData; hoverables.push(b); });
    runsGroup.add(run.group);
  }

  function stepHeight(run, dir) {
    const next = run.liftDelta + dir;
    if (run.stats.defaultLifts + next < 1) return; // keep at least one lift
    run.liftDelta = next;
    disposeRunGroup(run);
    attachRunGroup(run, buildRunGroup(run.verts, run.liftDelta));
    refreshCosts();
  }

  function removeRun(run) {
    disposeRunGroup(run);
    runs.splice(runs.indexOf(run), 1);
    refreshCosts();
  }

  function flyToRun(run) {
    if (drawing && planDraw.inPlanMode()) planDraw.setViewMode('3d');
    const c = new THREE.Vector3();
    run.verts.forEach((v) => c.add(v3(v.x, 0, v.z)));
    c.divideScalar(run.verts.length);
    c.y = (run.stats.minGround + eavesElev) / 2;
    let dx = c.x - bc.x, dz = c.z - bc.z;
    const dl = Math.hypot(dx, dz) || 1;
    cameraAnimator.animateCamera(v3(c.x + (dx / dl) * 16, eavesElev + 10, c.z + (dz / dl) * 16), c);
  }

  // ------------------------------------------------------------------
  // Draw mode via the shared plan-draw engine
  // ------------------------------------------------------------------
  let drawing = false;

  function groundPointFromEvent(e) {
    const hits = planDraw.ray(e).intersectObject(terrainMesh, false);
    if (!hits.length) return null;
    const p = hits[0].point;
    // y from the DSM (unscaled) so vertical exaggeration stays consistent
    return v3(p.x, groundAt(p.x, p.z), p.z);
  }

  const drawnLength = (verts) => {
    let L = 0;
    for (let i = 0; i < verts.length - 1; i++) L += Math.hypot(verts[i + 1].x - verts[i].x, verts[i + 1].z - verts[i].z);
    return L;
  };

  function startDraw() {
    drawing = true;
    drawBtn.textContent = 'Finish run';
    drawBtn.classList.add('active');
    planDraw.begin({
      title: 'Scaffold draw mode',
      center: bc,
      pick: groundPointFromEvent,
      status: (verts, preview) => {
        let L = drawnLength(verts);
        if (preview && verts.length) L += Math.hypot(preview.x - verts[verts.length - 1].x, preview.z - verts[verts.length - 1].z);
        return L.toFixed(1) + ' m';
      },
      onFinish: (verts3) => {
        exitDrawUI();
        const verts = verts3.map((v) => ({ x: v.x, z: v.z }));
        runSeq++;
        const run = {
          name: 'Scaffold run ' + runSeq,
          verts,
          liftDelta: 0,
          tooltipData: { type: 'scaffold', name: 'Scaffold run ' + runSeq },
        };
        attachRunGroup(run, buildRunGroup(verts, 0));
        runs.push(run);
        refreshCosts();
      },
      onCancel: exitDrawUI,
      minVerts: 2,
    });
  }

  function exitDrawUI() {
    drawing = false;
    drawBtn.textContent = '+ Draw scaffold run';
    drawBtn.classList.remove('active');
  }

  drawBtn.addEventListener('click', () => (drawing ? planDraw.finish() : startDraw()));

  refreshCosts();

  return { root, runs };
};
