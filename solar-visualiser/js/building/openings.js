// =====================================================================
// Windows & radiators on building walls.
//
// Windows live on exterior wall panels in wall-local coords (u along
// the wall, sill height above their floor level). Wall meshes are
// rebuilt with real rectangular holes (see solid.js wallGeometry), plus
// a glass pane and a simple frame. Radiators are boxes on the interior
// side of a wall at floor level.
// =====================================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./geometry.js'));
  } else {
    root.SolarViz = root.SolarViz || {};
    root.SolarViz.buildingOpenings = factory(root.SolarViz.buildingGeometry);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (G) {

  const WIN_DEFAULT = { width: 1.2, height: 1.2, sill: 0.9 };
  const RAD_DEFAULT = { width: 1.0, height: 0.6, depth: 0.09 };
  const EDGE_MARGIN = 0.15; // keep openings off panel edges

  // ------------------------------------------------------------------
  // Placement / validation (pure)
  // ------------------------------------------------------------------

  const wallById = (solid, id) => solid.wallPanels.find((w) => w.id === id);

  function levelOfY(levels, y) {
    for (let i = levels.length - 1; i >= 0; i--) {
      if (y >= levels[i].baseY) return levels[i];
    }
    return levels[0];
  }

  // Absolute opening rectangle in wall-local (u, v) coords.
  function windowRect(win, solid, levels) {
    const w = wallById(solid, win.wallId);
    const lv = levels[Math.min(win.levelIdx, levels.length - 1)];
    if (!w || !lv) return null;
    const v0 = lv.slabTopY + win.sill;
    const v1 = v0 + win.height;
    const u0 = win.u - win.width / 2;
    const u1 = win.u + win.width / 2;
    return { u0, u1, v0, v1, wall: w, level: lv };
  }

  // Clamp a window inside its panel and below the wall top.
  function clampWindow(win, solid, levels) {
    const w = wallById(solid, win.wallId);
    const lv = levels[Math.min(win.levelIdx, levels.length - 1)];
    if (!w || !lv) return null;
    if (w.len < 0.4 + 2 * EDGE_MARGIN) return null; // wall too short
    win.levelIdx = lv.idx;
    const wallTop = Math.min(w.topA, w.topB);
    win.width = Math.max(0.4, Math.min(win.width, w.len - 2 * EDGE_MARGIN));
    win.u = Math.max(EDGE_MARGIN + win.width / 2, Math.min(w.len - EDGE_MARGIN - win.width / 2, win.u));
    const maxHeight = wallTop - EDGE_MARGIN - (lv.slabTopY + 0.2);
    if (maxHeight < 0.4) return null; // wall too short at this level
    win.height = Math.max(0.4, Math.min(win.height, maxHeight));
    // doors sit on the slab; windows keep a minimum sill
    const minSill = win.kind === 'door' ? 0 : 0.2;
    win.sill = Math.max(minSill, Math.min(win.sill, wallTop - EDGE_MARGIN - win.height - lv.slabTopY));
    return win;
  }

  function overlapsExisting(win, windows, solid, levels) {
    const r = windowRect(win, solid, levels);
    if (!r) return true;
    return windows.some((o) => {
      if (o === win || o.wallId !== win.wallId) return false;
      const q = windowRect(o, solid, levels);
      return q && r.u0 < q.u1 + 0.1 && q.u0 < r.u1 + 0.1 && r.v0 < q.v1 && q.v0 < r.v1;
    });
  }

  let seq = 0;
  const newId = (prefix) => prefix + (++seq) + '-' + (Date.now() % 100000);
  const wallU = (w, hitPoint) =>
    (hitPoint.x - w.a2[0]) * w.dir[0] + (hitPoint.z - w.a2[1]) * w.dir[1];

  function makeWindowAt(hitPoint, wallId, solid, levels) {
    const w = wallById(solid, wallId);
    if (!w) return null;
    const lv = levelOfY(levels, hitPoint.y);
    const win = Object.assign(
      { id: newId('win'), wallId, levelIdx: lv.idx, u: wallU(w, hitPoint) },
      WIN_DEFAULT
    );
    return clampWindow(win, solid, levels);
  }

  function makeRadiatorAt(hitPoint, wallId, solid, levels) {
    const w = wallById(solid, wallId);
    if (!w || w.len < 1.2) return null; // no room for margins on tiny jog walls
    const lv = levelOfY(levels, hitPoint.y);
    const u = Math.max(0.6, Math.min(w.len - 0.6, wallU(w, hitPoint)));
    return Object.assign({ id: newId('rad'), wallId, levelIdx: lv.idx, u }, RAD_DEFAULT);
  }

  function radiatorUnderWindow(win, solid) {
    const w = wallById(solid, win.wallId);
    if (!w) return null;
    return Object.assign(
      { id: newId('rad'), wallId: win.wallId, levelIdx: win.levelIdx, u: win.u },
      RAD_DEFAULT,
      { width: Math.min(RAD_DEFAULT.width, win.width) }
    );
  }

  // When the solid is rebuilt (tolerance change etc.), wall ids may
  // shuffle — rebind each opening to the nearest similar wall.
  function rebindOpenings(items, oldSolid, newSolid) {
    if (!oldSolid) return items;
    return items.filter((item) => {
      const ow = wallById(oldSolid, item.wallId);
      if (!ow) return false;
      const om = [(ow.a2[0] + ow.b2[0]) / 2, (ow.a2[1] + ow.b2[1]) / 2];
      let best = null, bd = Infinity;
      newSolid.wallPanels.forEach((nw) => {
        const nm = [(nw.a2[0] + nw.b2[0]) / 2, (nw.a2[1] + nw.b2[1]) / 2];
        const d = Math.hypot(nm[0] - om[0], nm[1] - om[1]);
        const align = Math.abs(nw.dir[0] * ow.dir[0] + nw.dir[1] * ow.dir[1]);
        if (d < bd && align > 0.9) { bd = d; best = nw; }
      });
      if (!best || bd > 1.5) return false;
      // keep the same world position along the wall
      const worldU = [ow.a2[0] + ow.dir[0] * item.u, ow.a2[1] + ow.dir[1] * item.u];
      item.wallId = best.id;
      item.u = (worldU[0] - best.a2[0]) * best.dir[0] + (worldU[1] - best.a2[1]) * best.dir[1];
      return true;
    });
  }

  // ------------------------------------------------------------------
  // THREE meshes (browser only)
  // ------------------------------------------------------------------

  // Rebuild every wall mesh's geometry with its window holes.
  // `wallGeometry` is buildingSolid.wallGeometry, injected to keep this
  // module free of a direct dependency on solid.js.
  function refreshWallHoles({ solid, levels, windows, wallMeshes, wallGeometry }) {
    const holesByWall = new Map();
    windows.forEach((win) => {
      const r = windowRect(win, solid, levels);
      if (!r) return;
      if (!holesByWall.has(win.wallId)) holesByWall.set(win.wallId, []);
      holesByWall.get(win.wallId).push(r);
    });
    wallMeshes.forEach((mesh) => {
      const panel = wallById(solid, mesh.userData.wallId);
      if (!panel) return;
      mesh.geometry.dispose();
      mesh.geometry = wallGeometry(panel, holesByWall.get(panel.id) || []);
    });
  }

  // Proper rotation facing local +Z along the wall's outward normal.
  // Never build this from makeBasis(dir, up, normal): that basis is
  // left-handed (a reflection) on half the walls, and quaternions can't
  // represent reflections, so the resulting rotations are silently wrong.
  function wallQuat(w) {
    return new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      new THREE.Vector3(w.normal[0], 0, w.normal[1]).normalize()
    );
  }

  function buildOpeningMeshes({ solid, levels, windows, radiators, mats }) {
    const group = new THREE.Group();
    const selectables = [];

    windows.forEach((win) => {
      const r = windowRect(win, solid, levels);
      if (!r) return;
      const w = r.wall;
      const q = wallQuat(w);
      const centreAt = (off) => new THREE.Vector3(
        w.a2[0] + w.dir[0] * win.u + w.normal[0] * off,
        (r.v0 + r.v1) / 2,
        w.a2[1] + w.dir[1] * win.u + w.normal[1] * off
      );

      const glass = new THREE.Mesh(new THREE.PlaneGeometry(win.width, win.height), mats.glass);
      glass.quaternion.copy(q);
      glass.position.copy(centreAt(-0.04));
      glass.userData = { type: 'building-window', windowId: win.id, levelIdx: win.levelIdx };
      group.add(glass);
      selectables.push(glass);

      // frame: four slim boxes around the opening
      const t = 0.07, d = 0.1;
      const frame = new THREE.Group();
      [
        [0, win.height / 2 - t / 2, win.width, t],
        [0, -win.height / 2 + t / 2, win.width, t],
        [-win.width / 2 + t / 2, 0, t, win.height - 2 * t],
        [win.width / 2 - t / 2, 0, t, win.height - 2 * t],
      ].forEach(([lu, lv, lw, lh]) => {
        const bar = new THREE.Mesh(new THREE.BoxGeometry(lw, lh, d), mats.frame);
        bar.position.set(lu, lv, 0);
        frame.add(bar);
      });
      frame.quaternion.copy(q);
      frame.position.copy(centreAt(-0.02));
      frame.userData = { windowId: win.id, levelIdx: win.levelIdx };
      group.add(frame);
    });

    radiators.forEach((rad) => {
      const w = wallById(solid, rad.wallId);
      const lv = levels[Math.min(rad.levelIdx, levels.length - 1)];
      if (!w || !lv) return;
      const q = wallQuat(w);
      const radGroup = new THREE.Group();
      radGroup.userData = { radiatorId: rad.id, levelIdx: rad.levelIdx };

      const body = new THREE.Mesh(new THREE.BoxGeometry(rad.width, rad.height, rad.depth), mats.radiator);
      // interior side of the wall, resting just above the slab
      const off = -(rad.depth / 2 + 0.04);
      body.quaternion.copy(q);
      body.position.set(
        w.a2[0] + w.dir[0] * rad.u + w.normal[0] * off,
        lv.slabTopY + 0.12 + rad.height / 2,
        w.a2[1] + w.dir[1] * rad.u + w.normal[1] * off
      );
      body.userData = { type: 'building-radiator', radiatorId: rad.id, levelIdx: rad.levelIdx };
      radGroup.add(body);
      selectables.push(body);

      // a hint of panel ribs
      for (let i = -1; i <= 1; i++) {
        const rib = new THREE.Mesh(new THREE.BoxGeometry(rad.width * 0.92, rad.height * 0.82, 0.012), mats.radiator);
        rib.quaternion.copy(q);
        rib.position.copy(body.position).addScaledVector(new THREE.Vector3(w.normal[0], 0, w.normal[1]), -rad.depth / 2 - 0.012 + i * 0.001);
        radGroup.add(rib);
      }
      group.add(radGroup);
    });

    return { group, selectables };
  }

  return {
    WIN_DEFAULT, RAD_DEFAULT,
    wallById, levelOfY, windowRect, clampWindow, overlapsExisting,
    makeWindowAt, makeRadiatorAt, radiatorUnderWindow, rebindOpenings,
    refreshWallHoles, buildOpeningMeshes,
  };
});
