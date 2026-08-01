// =====================================================================
// Room partitioning: each floor starts as one room (its sliced outline)
// and every drawn dividing wall splits one room in two. Rooms are
// re-derived from the divider list, so undo = drop the last divider and
// replay — and room ids stay stable ('r' → 'r0'/'r1' → …) so names
// survive replays and persistence.
//
// deriveRooms() is pure (node-testable); the mesh builders need THREE.
// =====================================================================
(function (root, factory) {
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = factory(require('./geometry.js'));
  } else {
    root.SolarViz = root.SolarViz || {};
    root.SolarViz.buildingRooms = factory(root.SolarViz.buildingGeometry);
  }
})(typeof window !== 'undefined' ? window : globalThis, function (G) {

  const PALETTE = [0x4dabf7, 0x20c997, 0xff922b, 0x845ef7, 0xf06595, 0xfcc419, 0x63e6be, 0x74c0fc];

  const ROOM_TYPES = [
    { key: 'kitchen', label: 'Kitchen', color: 0xff922b },
    { key: 'living', label: 'Living room', color: 0x20c997 },
    { key: 'bedroom', label: 'Bedroom', color: 0x845ef7 },
    { key: 'bathroom', label: 'Bathroom', color: 0x4dabf7 },
    { key: 'hallway', label: 'Hallway', color: 0x9aa3ad },
    { key: 'storage', label: 'Storage', color: 0xa98c5f },
  ];
  const typeInfo = (key) => ROOM_TYPES.find((t) => t.key === key) || null;

  // outline: [[x,z],...]; dividers: [ [[x,z],...] ] in draw order.
  // Returns { rooms: [{id, poly}], applied: [divider], failed: [divider] }.
  function deriveRooms(outline, dividers) {
    let rooms = [{ id: 'r', poly: outline.map((p) => p.slice()) }];
    const applied = [], failed = [];
    (dividers || []).forEach((path) => {
      let done = false;
      for (let i = 0; i < rooms.length && !done; i++) {
        const cut = G.splitPolygonByPolyline(rooms[i].poly, path);
        if (cut) {
          const parent = rooms[i];
          rooms.splice(i, 1,
            { id: parent.id + '0', poly: cut.a },
            { id: parent.id + '1', poly: cut.b });
          done = true;
        }
      }
      (done ? applied : failed).push(path);
    });
    return { rooms, applied, failed };
  }

  function roomColor(id, typeKey) {
    const t = typeInfo(typeKey);
    if (t) return t.color;
    let h = 0;
    for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) >>> 0;
    return PALETTE[h % PALETTE.length];
  }

  function roomDisplayName(id, roomNames, roomTypes) {
    if (roomNames && roomNames[id]) return roomNames[id];
    const t = typeInfo(roomTypes && roomTypes[id]);
    return t ? t.label : defaultRoomName(id);
  }

  // Nearest point on any room boundary within `radius`, or null.
  function nearestOnBoundary(rooms, x, z, radius) {
    let best = null;
    rooms.forEach((room) => {
      const poly = room.poly;
      for (let i = 0; i < poly.length; i++) {
        const a = poly[i], b = poly[(i + 1) % poly.length];
        const s = G.distPointToSegment(x, z, a[0], a[1], b[0], b[1]);
        if (s.d <= radius && (!best || s.d < best.d)) best = { x: s.x, z: s.z, d: s.d };
      }
    });
    return best;
  }

  // Snap the step prev→p onto the building's dominant axes when within
  // snapDeg of one; otherwise leave it free.
  function axisSnap(prev, p, axisAngle, snapDeg) {
    const dx = p[0] - prev[0], dz = p[1] - prev[1];
    const len = Math.hypot(dx, dz);
    if (len < 1e-6) return p;
    const ang = Math.atan2(dz, dx);
    for (let q = 0; q < 4; q++) {
      const target = axisAngle + (q * Math.PI) / 2;
      let da = ang - target;
      while (da > Math.PI) da -= 2 * Math.PI;
      while (da < -Math.PI) da += 2 * Math.PI;
      if (Math.abs(da) <= (snapDeg * Math.PI) / 180) {
        const ax = Math.cos(target), az = Math.sin(target);
        const d = dx * ax + dz * az;
        return [prev[0] + ax * d, prev[1] + az * d];
      }
    }
    return p;
  }

  // ------------------------------------------------------------------
  // THREE meshes for one floor: divider walls, per-room floor tints,
  // room name labels. Rebuilt wholesale on every change.
  // ------------------------------------------------------------------
  const WALL_T = 0.1;

  // Ceiling height function for a level: a flat ceiling on intermediate
  // floors, clamped just under the roof planes on the top/attic floor.
  function ceilingFnFor(level, solid) {
    const base = level.slabTopY;
    const flat = level.ceilingY !== null ? level.ceilingY : solid.ridgeY;
    if (!level.isTop && level.ceilingY !== null) return () => flat;
    return (x, z) => {
      const r = solid.roofHeightAt(x, z);
      const cap = r === null ? flat : r - 0.03;
      return Math.max(base + 0.25, Math.min(flat, cap));
    };
  }

  function buildRoomMeshes({ level, rooms, dividers, solid, mats, roomNames, roomTypes }) {
    const group = new THREE.Group();
    const ceilingAt = ceilingFnFor(level, solid);

    // Divider walls — extruded profiles so the top can follow the roof
    // on the top floor.
    (dividers || []).forEach((path) => {
      for (let s = 0; s < path.length - 1; s++) {
        const a = path[s], b = path[s + 1];
        const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
        if (len < 0.05) continue;
        const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
        const base = level.slabTopY;
        const topAt = (t) => ceilingAt(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t);
        const N = 8;
        const shape = new THREE.Shape();
        shape.moveTo(0, base);
        shape.lineTo(len, base);
        for (let i = N; i >= 0; i--) shape.lineTo((i / N) * len, topAt(i / N));
        shape.closePath();
        const geom = new THREE.ExtrudeGeometry(shape, { depth: WALL_T, bevelEnabled: false });
        // basis must be right-handed (z = x×y): a left-handed basis
        // mirrors the winding and the wall faces backface-cull away
        const zdir = [-dir[1], dir[0]];
        const m = new THREE.Matrix4();
        m.makeBasis(
          new THREE.Vector3(dir[0], 0, dir[1]),
          new THREE.Vector3(0, 1, 0),
          new THREE.Vector3(zdir[0], 0, zdir[1])
        );
        m.setPosition(
          a[0] - zdir[0] * WALL_T / 2,
          0,
          a[1] - zdir[1] * WALL_T / 2
        );
        geom.applyMatrix4(m);
        geom.computeVertexNormals();
        group.add(new THREE.Mesh(geom, mats.dividerWall));
      }
    });

    // Room floor tints + labels
    rooms.forEach((room) => {
      const shape = new THREE.Shape();
      room.poly.forEach(([x, z], i) => (i === 0 ? shape.moveTo(x, z) : shape.lineTo(x, z)));
      const geom = new THREE.ShapeGeometry(shape);
      geom.rotateX(Math.PI / 2); // shape (x,z) -> plan, facing up
      geom.translate(0, level.slabTopY + 0.015, 0);
      const typeKey = roomTypes && roomTypes[room.id];
      const mat = new THREE.MeshBasicMaterial({
        color: roomColor(room.id, typeKey), transparent: true, opacity: 0.28,
        side: THREE.DoubleSide, depthWrite: false,
      });
      mat.userData.disposable = true; // per-room material: dispose with the mesh
      const mesh = new THREE.Mesh(geom, mat);
      mesh.userData = {
        type: 'room',
        name: roomDisplayName(room.id, roomNames, roomTypes),
        area: Math.abs(G.polygonArea(room.poly)).toFixed(1),
        floor: level.name,
      };
      group.add(mesh);

      const [cx, cz] = G.polygonCentroid(room.poly);
      group.add(makeLabel(
        mesh.userData.name + '\n' + mesh.userData.area + ' m²',
        cx, level.slabTopY + 0.6, cz
      ));
    });

    return group;
  }

  function defaultRoomName(id) {
    if (id === 'r') return 'Whole floor';
    return 'Room ' + id.slice(1).split('').map((c) => +c + 1).join('.');
  }

  // ------------------------------------------------------------------
  // Exterior walls with thickness for the floor being edited: a band
  // between the floor outline and a mitred inward offset, from slab top
  // to the ceiling (clamped under the roof planes on top/attic floors).
  // Corners share mitred inner vertices, so the band ring is seamless.
  // ------------------------------------------------------------------
  const EXT_WALL_T = 0.28;

  function buildExteriorWalls({ level, solid, mats }) {
    const outline = level.outline;
    const n = outline.length;
    if (n < 3) return new THREE.Group();

    // Per-edge inward unit normal (tested against the polygon interior).
    const inw = [];
    for (let i = 0; i < n; i++) {
      const a = outline[i], b = outline[(i + 1) % n];
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const dir = [(b[0] - a[0]) / len, (b[1] - a[1]) / len];
      let nrm = [dir[1], -dir[0]];
      const mx = (a[0] + b[0]) / 2 + nrm[0] * 0.05, mz = (a[1] + b[1]) / 2 + nrm[1] * 0.05;
      if (!G.pointInPolygon(outline, mx, mz)) nrm = [-nrm[0], -nrm[1]];
      inw.push(nrm);
    }

    // Mitred inner offset vertex per corner (clamped for sharp corners).
    const inner = [];
    for (let i = 0; i < n; i++) {
      const nPrev = inw[(i + n - 1) % n], nCur = inw[i];
      let mx = nPrev[0] + nCur[0], mz = nPrev[1] + nCur[1];
      const ml = Math.hypot(mx, mz);
      if (ml < 1e-6) { mx = nCur[0]; mz = nCur[1]; }
      else { mx /= ml; mz /= ml; }
      const d = Math.min(EXT_WALL_T / Math.max(0.4, mx * nCur[0] + mz * nCur[1]), EXT_WALL_T * 2.5);
      inner.push([outline[i][0] + mx * d, outline[i][1] + mz * d]);
    }

    const base = level.slabTopY;
    const topAt = ceilingFnFor(level, solid);
    const clampRoof = level.isTop || level.ceilingY === null;

    // Band ring as one non-indexed BufferGeometry: outer face, inner
    // face and top face per sample quad. Bottom sits on the slab.
    const pos = [];
    const quad = (p1, p2, p3, p4) => {
      pos.push(...p1, ...p2, ...p3, ...p1, ...p3, ...p4);
    };
    for (let i = 0; i < n; i++) {
      const a = outline[i], b = outline[(i + 1) % n];
      const ia = inner[i], ib = inner[(i + 1) % n];
      const N = clampRoof ? 8 : 1;
      for (let j = 0; j < N; j++) {
        const t0 = j / N, t1 = (j + 1) / N;
        const o0 = [a[0] + (b[0] - a[0]) * t0, a[1] + (b[1] - a[1]) * t0];
        const o1 = [a[0] + (b[0] - a[0]) * t1, a[1] + (b[1] - a[1]) * t1];
        const i0 = [ia[0] + (ib[0] - ia[0]) * t0, ia[1] + (ib[1] - ia[1]) * t0];
        const i1 = [ia[0] + (ib[0] - ia[0]) * t1, ia[1] + (ib[1] - ia[1]) * t1];
        const h0 = Math.min(topAt(o0[0], o0[1]), topAt(i0[0], i0[1]));
        const h1 = Math.min(topAt(o1[0], o1[1]), topAt(i1[0], i1[1]));
        // outer face
        quad([o0[0], base, o0[1]], [o1[0], base, o1[1]], [o1[0], h1, o1[1]], [o0[0], h0, o0[1]]);
        // inner face
        quad([i1[0], base, i1[1]], [i0[0], base, i0[1]], [i0[0], h0, i0[1]], [i1[0], h1, i1[1]]);
        // top face
        quad([o0[0], h0, o0[1]], [o1[0], h1, o1[1]], [i1[0], h1, i1[1]], [i0[0], h0, i0[1]]);
      }
    }
    const geom = new THREE.BufferGeometry();
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.computeVertexNormals();
    return new THREE.Mesh(geom, mats.extWall);
  }

  function makeLabel(text, x, y, z) {
    const lines = text.split('\n');
    const canvas = document.createElement('canvas');
    canvas.width = 256; canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(10, 12, 16, 0.65)';
    roundRect(ctx, 28, 24, 200, 80, 12);
    ctx.fill();
    ctx.fillStyle = '#f2f4f8';
    ctx.font = '600 30px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(lines[0].slice(0, 14), 128, 60);
    ctx.font = '24px JetBrains Mono, monospace';
    ctx.fillStyle = '#9fb4c8';
    if (lines[1]) ctx.fillText(lines[1], 128, 92);
    const tex = new THREE.CanvasTexture(canvas);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
    sprite.scale.set(3.4, 1.7, 1);
    sprite.position.set(x, y, z);
    sprite.renderOrder = 5;
    return sprite;
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  return {
    deriveRooms, roomColor, roomDisplayName, nearestOnBoundary, axisSnap,
    buildRoomMeshes, buildExteriorWalls, defaultRoomName,
    ROOM_TYPES, typeInfo, WALL_T, EXT_WALL_T,
  };
});
