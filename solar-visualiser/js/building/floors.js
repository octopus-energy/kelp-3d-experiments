// =====================================================================
// Floor slicing: cut the watertight solid into storeys, each with a
// slab of configurable thickness whose outline comes from a horizontal
// cross-section of the mesh (so attic floors shrink under the roof).
//
// computeFloors() is pure (node-testable); buildFloorMeshes() needs
// THREE and only runs in the browser.
// =====================================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./geometry.js'), require('./plan-geometry.js'));
  } else {
    root.SolarViz = root.SolarViz || {};
    root.SolarViz.buildingFloors = factory(root.SolarViz.buildingGeometry, root.SolarViz.planGeometry);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (G, P) {

  const ORDINALS = ['Ground floor', 'First floor', 'Second floor', 'Third floor', 'Fourth floor'];
  const MIN_ATTIC_HEADROOM = 1.5;

  // cfg: { count, storeyHeight, slabT, includeAttic }
  function computeFloors(solid, cfg) {
    const count = Math.max(1, Math.round(cfg.count));
    const h = cfg.storeyHeight;
    const slabT = cfg.slabT;
    const levels = [];

    for (let i = 0; i < count; i++) {
      const baseY = solid.groundY + i * h;
      levels.push(makeLevel(cfg.levelSolids?.[i] || solid, {
        idx: i,
        name: ORDINALS[i] || `Floor ${i}`,
        baseY,
        slabTopY: baseY + slabT,
        ceilingY: baseY + h,
        isAttic: false,
      }));
    }

    const atticBase = solid.groundY + count * h;
    if (cfg.includeAttic && solid.ridgeY - atticBase >= MIN_ATTIC_HEADROOM) {
      levels.push(makeLevel(solid, {
        idx: count,
        name: 'Attic',
        baseY: atticBase,
        slabTopY: atticBase + slabT,
        ceilingY: null, // the roof is the ceiling
        isAttic: true,
      }));
    }

    levels.forEach((lv, i) => { lv.isTop = i === levels.length - 1; });
    return levels;
  }

  function makeLevel(solid, lv) {
    const slice = G.sliceMesh(solid.verts, solid.tris, lv.slabTopY + 0.002);
    lv.loops = P.unionLoops(slice.loops);
    lv.outline = lv.loops[0] || solid.footprint;
    lv.area = Math.abs(lv.loops.reduce((s, l) => s + G.polygonArea(l), 0));
    return lv;
  }

  // ------------------------------------------------------------------
  // THREE meshes: slab (top, bottom, side band) per outline loop, plus
  // a crisp outline at the slab top. One group per level.
  // ------------------------------------------------------------------
  function buildFloorMeshes(levels, mats) {
    const root = new THREE.Group();
    const levelGroups = levels.map((lv) => {
      const g = new THREE.Group();
      g.userData = { levelIdx: lv.idx, baseY: lv.baseY };
      lv.loops.forEach((loop) => {
        const pos = [];
        const push = (p, y) => pos.push(p[0], y, p[1]);
        const tris = G.triangulatePolygon(loop);
        const windUp = (tri, y, up) => {
          const pts = tri.map((i) => loop[i]);
          const ny = (pts[2][0] - pts[0][0]) * (pts[1][1] - pts[0][1]) - (pts[2][1] - pts[0][1]) * (pts[1][0] - pts[0][0]);
          const order = (ny >= 0) === up ? [0, 1, 2] : [0, 2, 1];
          order.forEach((o) => push(pts[o], y));
        };
        tris.forEach((t) => windUp(t, lv.slabTopY, true));
        tris.forEach((t) => windUp(t, lv.baseY, false));
        for (let i = 0; i < loop.length; i++) {
          const a = loop[i], b = loop[(i + 1) % loop.length];
          push(a, lv.baseY); push(b, lv.baseY); push(b, lv.slabTopY);
          push(a, lv.baseY); push(b, lv.slabTopY); push(a, lv.slabTopY);
        }
        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geom.computeVertexNormals();
        const mesh = new THREE.Mesh(geom, mats.slab);
        mesh.userData = { type: 'floor-slab', levelIdx: lv.idx, name: lv.name, area: lv.area };
        g.add(mesh);

        // Outline sits on the wall plane, so it z-fights through a closed
        // shell — callers gate its visibility to ghost/isolated views.
        const linePts = loop.map((p) => new THREE.Vector3(p[0], lv.slabTopY + 0.01, p[1]));
        linePts.push(linePts[0].clone());
        const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(linePts), mats.outline);
        outline.userData.isOutline = true;
        g.add(outline);
      });
      root.add(g);
      return g;
    });
    return { root, levelGroups };
  }

  return { computeFloors, makeLevel, buildFloorMeshes, MIN_ATTIC_HEADROOM };
});
