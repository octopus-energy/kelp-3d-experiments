// =====================================================================
// Building Model UI: owns the sidebar section, the derived model
// (solid → floors → rooms → openings), edit modes (wall drawing via the
// shared plan-draw engine, click-to-place windows/radiators), and
// persistence (localStorage + JSON export/import).
//
// Everything 3D is derived: buildSolid() etc. recompute from SITE_DATA
// + settings; only settings and user edits are stored.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.setupBuilding = function ({ scene, siteData, coords, terrainMesh, planDraw, camera, view, renderer, controls, cameraAnimator, hoverables }) {
  const G = window.SolarViz.buildingGeometry;
  const S = window.SolarViz.buildingSolid;
  const F = window.SolarViz.buildingFloors;
  const R = window.SolarViz.buildingRooms;
  const O = window.SolarViz.buildingOpenings;
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------
  // Persistent state (everything else is derived)
  // ------------------------------------------------------------------
  const addr = siteData.property_details.geocoded_address;
  const STORE_KEY = 'buildingState:' + addr.postcode + ':' + addr.easting + ':' + addr.northing;

  let state = {
    version: 1,
    settings: { includeRejected: true, snapTol: 0.7, orthogonalize: true },
    storeys: {
      count: siteData.number_of_storeys || 2,
      storeyHeight: null,      // null = auto: (eaves − ground) / count
      slabT: 0.3,
      includeAttic: true,
    },
    floors: {},                // levelIdx -> { dividers, roomNames, roomTypes }
    windows: [],
    radiators: [],
  };
  try {
    const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
    if (saved && saved.version === 1) {
      // merge over the defaults so settings added later get their default
      state = Object.assign({}, state, saved, {
        settings: Object.assign({}, state.settings, saved.settings),
        storeys: Object.assign({}, state.storeys, saved.storeys),
      });
    }
  } catch (e) { /* corrupted state — start fresh */ }

  let saveTimer = null;
  function saveState() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch (e) { /* quota */ }
    }, 300);
  }

  const floorState = (idx) => {
    if (!state.floors[idx]) state.floors[idx] = { dividers: [], roomNames: {}, roomTypes: {} };
    if (!state.floors[idx].roomTypes) state.floors[idx].roomTypes = {}; // migrate older saves
    return state.floors[idx];
  };

  // ------------------------------------------------------------------
  // Materials + scene groups
  // ------------------------------------------------------------------
  const mats = {
    roof: new THREE.MeshStandardMaterial({ color: 0x9c8f7c, roughness: 0.8, metalness: 0.05 }),
    wall: new THREE.MeshStandardMaterial({ color: 0xd8d1c3, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
    edge: new THREE.LineBasicMaterial({ color: 0x23272e, transparent: true, opacity: 0.85 }),
    slab: new THREE.MeshStandardMaterial({ color: 0xc7cdd6, roughness: 0.9, metalness: 0.0 }),
    outline: new THREE.LineBasicMaterial({ color: 0xf5b942, transparent: true, opacity: 0.9 }),
    dividerWall: new THREE.MeshStandardMaterial({ color: 0xe9e5db, roughness: 0.92, metalness: 0.0 }),
    extWall: new THREE.MeshStandardMaterial({ color: 0xded7c9, roughness: 0.9, metalness: 0.0, side: THREE.DoubleSide }),
    glass: new THREE.MeshStandardMaterial({ color: 0x9fc8e8, transparent: true, opacity: 0.38, roughness: 0.12, metalness: 0.4, side: THREE.DoubleSide }),
    glassSel: new THREE.MeshStandardMaterial({ color: 0xf5b942, transparent: true, opacity: 0.55, roughness: 0.12, metalness: 0.4, side: THREE.DoubleSide }),
    frame: new THREE.MeshStandardMaterial({ color: 0xfafaf6, roughness: 0.6, metalness: 0.0 }),
    radiator: new THREE.MeshStandardMaterial({ color: 0xf2f2f0, roughness: 0.5, metalness: 0.1 }),
  };

  const buildingRoot = new THREE.Group();
  const shellGroup = new THREE.Group();
  const openingsGroup = new THREE.Group();
  const levelsRoot = new THREE.Group();
  buildingRoot.add(shellGroup, openingsGroup, levelsRoot);
  scene.add(buildingRoot);

  // ASHP-mode gate (set via setActive from the mode switcher): the
  // building and terrain flattening only apply while the mode is active.
  let modeActive = false;
  buildingRoot.visible = false;

  // ------------------------------------------------------------------
  // Derived model
  // ------------------------------------------------------------------
  let solid = null;
  let levels = [];
  let derivedRooms = {};       // levelIdx -> [{id, poly}]
  let shell = null;            // { group, roofMesh, wallMeshes, edgeLines }
  let levelGroups = [];        // per level: { group, roomsGroup, extGroup }
  let openingMeshes = null;    // { group, selectables }
  let selectedFloorIdx = null;
  let selectedWindowId = null;
  let placing = null;          // 'window' | 'radiator'

  function inputFaces() {
    return siteData.roof_faces
      .filter((rf) => state.settings.includeRejected || rf.solar_arrays[0].active)
      .map((rf) => ({
        id: rf.id,
        active: rf.solar_arrays[0].active,
        ring: rf.geometry.coordinates[0].map((p) => {
          const v = coords.lonLatZToScene(p[0], p[1], p[2]);
          return { x: v.x, y: v.y, z: v.z };
        }),
      }));
  }

  function storeyHeight() {
    if (state.storeys.storeyHeight) return state.storeys.storeyHeight;
    if (!solid) return 2.5;
    return Math.max(2.0, (solid.eaveY - solid.groundY) / state.storeys.count);
  }

  // Dispose geometries plus any material owned by the object itself
  // (sprite labels, per-room tints) — shared `mats` entries are kept.
  function disposeGroup(g) {
    g.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      const m = o.material;
      if (m && (m.isSpriteMaterial || (m.userData && m.userData.disposable))) {
        if (m.map) m.map.dispose();
        m.dispose();
      }
    });
    while (g.children.length) g.remove(g.children[0]);
  }

  // -- full pipeline --------------------------------------------------
  function rebuildSolid() {
    const oldSolid = solid;
    solid = S.buildSolid(inputFaces(), {
      snapTol: state.settings.snapTol,
      orthogonalize: state.settings.orthogonalize,
      groundY: siteData.property_details.altitude,
    });
    if (!solid) {
      $('bm-status').textContent = 'failed';
      $('bm-status').style.color = 'var(--warn)';
      return;
    }
    solid.warnings.forEach((w) => console.warn('[building]', w));
    const wt = solid.watertight;
    $('bm-status').textContent = wt.closed ? 'watertight ✓' : `open (${wt.badEdges.length} edges)`;
    $('bm-status').style.color = wt.closed ? 'var(--good)' : 'var(--warn)';

    state.windows = O.rebindOpenings(state.windows, oldSolid, solid);
    state.radiators = O.rebindOpenings(state.radiators, oldSolid, solid);

    disposeGroup(shellGroup);
    shell = S.buildSolidMeshes(solid, mats);
    shellGroup.add(shell.group);

    rebuildFloors();
    applyTerrainFlatten();
  }

  function unregisterHoverables(group) {
    group.traverse((c) => {
      const i = hoverables.indexOf(c);
      if (i >= 0) hoverables.splice(i, 1);
    });
  }

  function rebuildFloors() {
    if (!solid) return;
    levels = F.computeFloors(solid, {
      count: state.storeys.count,
      storeyHeight: storeyHeight(),
      slabT: state.storeys.slabT,
      includeAttic: state.storeys.includeAttic,
    });
    if (selectedFloorIdx !== null && selectedFloorIdx >= levels.length) {
      selectedFloorIdx = null;
      wallBtn.disabled = true;
      $('bm-undo-wall').disabled = true;
    }
    state.windows.forEach((w) => { w.levelIdx = Math.min(w.levelIdx, levels.length - 1); });
    state.radiators.forEach((r) => { r.levelIdx = Math.min(r.levelIdx, levels.length - 1); });

    unregisterHoverables(levelsRoot);
    disposeGroup(levelsRoot);
    const floorMeshes = F.buildFloorMeshes(levels, mats);
    levelGroups = floorMeshes.levelGroups.map((g, i) => {
      const lg = { group: g, roomsGroup: new THREE.Group(), extGroup: new THREE.Group() };
      // thick exterior walls, shown only while this floor is being edited
      lg.extGroup.add(R.buildExteriorWalls({ level: levels[i], solid, mats }));
      lg.extGroup.visible = false;
      g.add(lg.roomsGroup, lg.extGroup);
      return lg;
    });
    levelsRoot.add(floorMeshes.root);

    levels.forEach((lv) => rebuildRoomsForLevel(lv.idx, { skipLists: true }));
    rebuildOpenings({ skipLists: true });
    updateVisibility();
    refreshFloorList();
    refreshRoomList();
    refreshOpeningList();
    refreshWindowEditor();
    saveState();
  }

  function rebuildRoomsForLevel(idx, opts) {
    const lv = levels[idx];
    const fs = floorState(idx);
    const res = R.deriveRooms(lv.outline, fs.dividers);
    if (res.failed.length) {
      console.warn(`[building] ${res.failed.length} divider(s) no longer fit floor ${idx}, dropped`);
      fs.dividers = res.applied;
    }
    derivedRooms[idx] = res.rooms;

    const lg = levelGroups[idx];
    // room tints registered as hoverables must be unregistered first
    unregisterHoverables(lg.roomsGroup);
    disposeGroup(lg.roomsGroup);
    if (fs.dividers.length || res.rooms.length > 1) {
      const g = R.buildRoomMeshes({
        level: lv, rooms: res.rooms, dividers: fs.dividers, solid, mats,
        roomNames: fs.roomNames, roomTypes: fs.roomTypes,
      });
      lg.roomsGroup.add(g);
      g.traverse((o) => { if (o.userData && o.userData.type === 'room') hoverables.push(o); });
    }
    if (!(opts && opts.skipLists)) {
      refreshFloorList();
      refreshRoomList();
      saveState();
    }
  }

  function rebuildOpenings(opts) {
    if (!solid) return;
    // sanitize: drop openings whose wall vanished; clamp the rest
    state.windows = state.windows.filter((w) => O.clampWindow(w, solid, levels));
    state.radiators = state.radiators.filter((r) => O.wallById(solid, r.wallId));
    if (selectedWindowId && !state.windows.some((w) => w.id === selectedWindowId)) selectedWindowId = null;

    O.refreshWallHoles({
      solid, levels, windows: state.windows,
      wallMeshes: shell.wallMeshes, wallGeometry: S.wallGeometry,
    });
    disposeGroup(openingsGroup);
    openingMeshes = O.buildOpeningMeshes({
      solid, levels, windows: state.windows, radiators: state.radiators, mats,
    });
    // highlight the selected window's glass
    openingMeshes.group.traverse((o) => {
      if (o.userData && o.userData.windowId === selectedWindowId && o.userData.type === 'building-window') o.material = mats.glassSel;
    });
    openingsGroup.add(openingMeshes.group);
    updateVisibility(); // openings were recreated — re-apply the floor filter
    if (!(opts && opts.skipLists)) {
      refreshOpeningList();
      refreshWindowEditor();
      saveState();
    }
  }

  // ------------------------------------------------------------------
  // Appearance: ghost shell, exploded floors, visibility
  // ------------------------------------------------------------------
  function explodeGap() { return parseFloat($('bm-explode').value) / 10; }

  // One visibility model: with a floor selected, isolate it — hide the
  // shell and every other level, show the thick exterior walls for the
  // working floor, and filter openings down to that floor. With nothing
  // selected, show the whole building (ghosted if requested/exploded).
  // The explode offset is zeroed during isolation: wall drawing picks
  // against the true slab height, so a lifted floor would put the
  // drawing below the visible slab.
  function updateVisibility() {
    const sel = selectedFloorIdx;
    const gap = explodeGap();
    const ghost = $('bm-ghost').checked || gap > 0;

    shellGroup.visible = sel === null;
    // fully opaque unless ghosted: any translucency lets interior
    // geometry (radiators, slab outlines) bleed through the shell
    [mats.roof, mats.wall].forEach((m) => {
      m.transparent = ghost;
      m.opacity = ghost ? 0.13 : 1.0;
      m.depthWrite = !ghost;
      m.needsUpdate = true;
    });
    mats.edge.opacity = ghost ? 0.35 : 0.85;

    levelGroups.forEach((lg, i) => {
      lg.group.position.y = sel === null ? gap * i : 0;
      lg.group.visible = sel === null || i === sel;
      lg.extGroup.visible = sel === i;
      // rooms (tints/labels/dividers): only on the floor being worked on
      // or in see-through views — labels would poke through a closed shell
      lg.roomsGroup.visible = sel === i || (sel === null && ghost);
      // slab-top outlines sit on the wall plane and z-fight a closed shell
      lg.group.children.forEach((c) => {
        if (c.userData && c.userData.isOutline) c.visible = sel === i || ghost;
      });
    });

    openingsGroup.visible = sel !== null || !ghost;
    if (openingMeshes) {
      openingMeshes.group.children.forEach((c) => {
        if (c.userData && c.userData.levelIdx !== undefined) {
          c.visible = sel === null || c.userData.levelIdx === sel;
        }
      });
    }
  }


  // ------------------------------------------------------------------
  // Terrain flattening (the DSM contains the house — flatten it away
  // under the footprint so the solid isn't buried in the terrain lump)
  // ------------------------------------------------------------------
  let terrainOriginalY = null;
  function applyTerrainFlatten() {
    const on = modeActive && $('bm-flatten').checked && $('bm-show').checked && !!solid;
    const pos = terrainMesh.geometry.attributes.position;
    if (!terrainOriginalY) {
      terrainOriginalY = new Float32Array(pos.count);
      for (let i = 0; i < pos.count; i++) terrainOriginalY[i] = pos.getY(i);
    }
    const MARGIN = 0.8;
    let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
    if (solid) {
      solid.footprint.forEach(([x, z]) => {
        minX = Math.min(minX, x - MARGIN); maxX = Math.max(maxX, x + MARGIN);
        minZ = Math.min(minZ, z - MARGIN); maxZ = Math.max(maxZ, z + MARGIN);
      });
    }
    for (let i = 0; i < pos.count; i++) {
      let y = terrainOriginalY[i];
      if (on) {
        const x = pos.getX(i), z = pos.getZ(i);
        if (x >= minX && x <= maxX && z >= minZ && z <= maxZ) {
          let near = G.pointInPolygon(solid.footprint, x, z);
          if (!near) {
            for (let e = 0; e < solid.footprint.length && !near; e++) {
              const a = solid.footprint[e], b = solid.footprint[(e + 1) % solid.footprint.length];
              if (G.distPointToSegment(x, z, a[0], a[1], b[0], b[1]).d < MARGIN) near = true;
            }
          }
          if (near) y = solid.groundY;
        }
      }
      pos.setY(i, y);
    }
    pos.needsUpdate = true;
    terrainMesh.geometry.computeVertexNormals();
  }

  // ------------------------------------------------------------------
  // Wall drawing (room partitioning)
  // ------------------------------------------------------------------
  const wallBtn = $('bm-wall-btn');
  let drawingWall = false;

  // After each wall the mode restarts (draw the whole floorplan in one
  // go); the button or Esc leaves it. Each split prompts a room type
  // for the newly carved-off room.
  function beginWallDraw(opts) {
    if (selectedFloorIdx === null || !solid) return;
    const lv = levels[selectedFloorIdx];
    const rooms = derivedRooms[selectedFloorIdx] || [{ id: 'r', poly: lv.outline }];
    const [cx, cz] = G.polygonCentroid(lv.outline);
    const pickPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -lv.slabTopY);
    const tmp = new THREE.Vector3();

    drawingWall = true;
    wallBtn.textContent = 'Done drawing walls';
    wallBtn.classList.add('active');

    planDraw.begin({
      title: 'Draw dividing walls — ' + lv.name,
      center: { x: cx, z: cz },
      keepView: !!(opts && opts.keepView),
      startIn: (opts && opts.startIn) || 'plan',
      minVerts: 2,
      markerColor: 0x4dabf7,
      pick: (e) => (planDraw.ray(e).ray.intersectPlane(pickPlane, tmp) ? tmp.clone() : null),
      snap: (p, verts) => {
        if (verts.length === 0) {
          const s = R.nearestOnBoundary(rooms, p.x, p.z, 1.2);
          return s ? new THREE.Vector3(s.x, lv.slabTopY, s.z) : null;
        }
        const prev = verts[verts.length - 1];
        let pt = R.axisSnap([prev.x, prev.z], [p.x, p.z], solid.axisAngle, 12);
        const s = R.nearestOnBoundary(rooms, pt[0], pt[1], 0.45);
        if (s) pt = [s.x, s.z];
        return new THREE.Vector3(pt[0], lv.slabTopY, pt[1]);
      },
      status: (verts) => (verts.length === 0
        ? 'click a wall to start'
        : verts.length === 1 ? 'draw across the room, end on a wall' : '⏎ to split the room'),
      onFinish: (verts, ctx) => {
        const restart = () => {
          if (drawingWall) beginWallDraw({ keepView: true, startIn: ctx.wasPlanMode ? 'plan' : '3d' });
        };
        const path = verts.map((v) => [v.x, v.z]);
        const end = R.nearestOnBoundary(rooms, path[path.length - 1][0], path[path.length - 1][1], 1.2);
        if (!end) { flash('End the wall on a room boundary'); restart(); return; }
        path[path.length - 1] = [end.x, end.z];
        const splits = rooms.some((room) => G.splitPolygonByPolyline(room.poly, path));
        if (!splits) { flash('Wall must cut across a single room'); restart(); return; }

        const before = new Set((derivedRooms[selectedFloorIdx] || []).map((r) => r.id));
        floorState(selectedFloorIdx).dividers.push(path);
        rebuildRoomsForLevel(selectedFloorIdx);
        const created = (derivedRooms[selectedFloorIdx] || []).filter((r) => !before.has(r.id));
        if (created.length) {
          const smallest = created.slice().sort((p, q) =>
            Math.abs(G.polygonArea(p.poly)) - Math.abs(G.polygonArea(q.poly)))[0];
          showTypePrompt(smallest);
        }
        restart();
      },
      onCancel: () => { exitWallUI(); },
    });
  }

  function exitWallUI() {
    drawingWall = false;
    hideTypePrompt();
    wallBtn.textContent = '+ Draw dividing wall';
    wallBtn.classList.remove('active');
  }

  wallBtn.addEventListener('click', () => {
    if (drawingWall) {
      drawingWall = false;   // stop the restart chain, then leave the mode
      planDraw.cancel();
    } else {
      beginWallDraw();
    }
  });

  // ------------------------------------------------------------------
  // Room-type prompt shown right after a wall carves off a new room
  // ------------------------------------------------------------------
  let typePromptEl = null;
  function hideTypePrompt() {
    if (typePromptEl) { typePromptEl.remove(); typePromptEl = null; }
  }
  function showTypePrompt(room) {
    hideTypePrompt();
    if (selectedFloorIdx === null) return;
    const fs = floorState(selectedFloorIdx);
    const area = Math.abs(G.polygonArea(room.poly)).toFixed(1);
    typePromptEl = document.createElement('div');
    typePromptEl.className = 'bm-type-prompt';
    typePromptEl.innerHTML =
      `<span class="bm-type-prompt-label">New room · ${area} m²</span>` +
      R.ROOM_TYPES.map((t) =>
        `<button data-type="${t.key}" style="border-color:#${t.color.toString(16).padStart(6, '0')}">${t.label}</button>`
      ).join('') +
      '<button data-type="" class="bm-type-skip">Skip</button>';
    typePromptEl.addEventListener('pointerdown', (e) => e.stopPropagation());
    typePromptEl.querySelectorAll('button').forEach((btn) => {
      btn.addEventListener('click', () => {
        if (btn.dataset.type) {
          fs.roomTypes[room.id] = btn.dataset.type;
          rebuildRoomsForLevel(selectedFloorIdx);
        }
        hideTypePrompt();
      });
    });
    document.body.appendChild(typePromptEl);
  }

  $('bm-undo-wall').addEventListener('click', () => {
    if (selectedFloorIdx === null) return;
    const fs = floorState(selectedFloorIdx);
    if (!fs.dividers.length) return;
    fs.dividers.pop();
    rebuildRoomsForLevel(selectedFloorIdx);
  });

  // ------------------------------------------------------------------
  // Window / radiator placement + selection
  // ------------------------------------------------------------------
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  function raycastFromEvent(e, objects) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, view.camera);
    return raycaster.intersectObjects(objects, false);
  }

  const windowBtn = $('bm-window-btn');
  const radBtn = $('bm-rad-wall-btn');

  function setPlacing(mode) {
    placing = mode;
    windowBtn.classList.toggle('active', placing === 'window');
    radBtn.classList.toggle('active', placing === 'radiator');
    renderer.domElement.style.cursor = placing ? 'crosshair' : '';
  }
  windowBtn.addEventListener('click', () => setPlacing(placing === 'window' ? null : 'window'));
  radBtn.addEventListener('click', () => setPlacing(placing === 'radiator' ? null : 'radiator'));

  $('bm-rad-under-btn').addEventListener('click', () => {
    const win = state.windows.find((w) => w.id === selectedWindowId);
    if (!win) return;
    const rad = O.radiatorUnderWindow(win, solid);
    if (rad) { state.radiators.push(rad); rebuildOpenings(); }
  });

  let downPos = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button === 0) downPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved > 6 || !modeActive || planDraw.isActive() || !solid || !shell) return;

    if (placing) {
      // shell walls stay raycastable even when the shell is hidden in
      // floor-isolation mode — they coincide with the thick walls shown
      const hits = raycastFromEvent(e, shell.wallMeshes);
      if (!hits.length) return;
      const wallId = hits[0].object.userData.wallId;
      if (placing === 'window') {
        const win = O.makeWindowAt(hits[0].point, wallId, solid, levels);
        if (!win || O.overlapsExisting(win, state.windows, solid, levels)) { flash('No room for a window there'); return; }
        state.windows.push(win);
        selectedWindowId = win.id;
      } else {
        const rad = O.makeRadiatorAt(hits[0].point, wallId, solid, levels);
        if (rad) state.radiators.push(rad);
      }
      setPlacing(null);
      rebuildOpenings();
      return;
    }

    // plain click: select/deselect a window
    if (openingMeshes) {
      const hits = raycastFromEvent(e, openingMeshes.selectables.filter((m) => m.visible));
      const winHit = hits.find((h) => h.object.userData.type === 'building-window');
      const next = winHit ? winHit.object.userData.windowId : null;
      if (next !== selectedWindowId) {
        selectedWindowId = next;
        rebuildOpenings();
      }
    }
  });

  // ------------------------------------------------------------------
  // Sidebar lists + editors
  // ------------------------------------------------------------------
  function refreshFloorList() {
    const list = $('bm-floor-list');
    list.innerHTML = '';
    levels.forEach((lv) => {
      const rooms = derivedRooms[lv.idx] || [];
      const item = document.createElement('div');
      item.className = 'array-item bm-floor-item' + (selectedFloorIdx === lv.idx ? ' selected' : '');
      item.innerHTML = `
        <div class="name">${lv.name}</div>
        <div class="meta">${lv.area.toFixed(1)} m² · ${rooms.length} room${rooms.length === 1 ? '' : 's'} · ${(lv.ceilingY === null ? 'roof above' : ((lv.ceilingY - lv.slabTopY).toFixed(2) + ' m ceiling'))}</div>`;
      item.addEventListener('click', () => selectFloor(selectedFloorIdx === lv.idx ? null : lv.idx));
      list.appendChild(item);
    });
  }

  function selectFloor(idx) {
    if (drawingWall) { drawingWall = false; planDraw.cancel(); }
    selectedFloorIdx = idx;
    wallBtn.disabled = idx === null;
    $('bm-undo-wall').disabled = idx === null;
    updateVisibility();
    refreshFloorList();
    refreshRoomList();
    if (idx !== null && solid) {
      // isolation zeroes the explode offset, so aim at the true height
      const [cx, cz] = G.polygonCentroid(levels[idx].outline);
      const y = levels[idx].slabTopY;
      cameraAnimator.animateCamera(
        new THREE.Vector3(cx + 10, y + 16, cz + 10),
        new THREE.Vector3(cx, y, cz)
      );
    }
  }

  function refreshRoomList() {
    const list = $('bm-room-list');
    list.innerHTML = '';
    if (selectedFloorIdx === null) {
      list.innerHTML = '<div class="scaffold-empty">Select a floor to partition it into rooms.</div>';
      return;
    }
    const fs = floorState(selectedFloorIdx);
    const rooms = derivedRooms[selectedFloorIdx] || [];
    rooms.forEach((room) => {
      const typeKey = fs.roomTypes[room.id] || '';
      const name = R.roomDisplayName(room.id, fs.roomNames, fs.roomTypes);
      const area = Math.abs(G.polygonArea(room.poly));
      const item = document.createElement('div');
      item.className = 'array-item bm-room-item';
      item.style.borderLeftColor = '#' + R.roomColor(room.id, typeKey).toString(16).padStart(6, '0');
      const options = ['<option value="">— type —</option>']
        .concat(R.ROOM_TYPES.map((t) =>
          `<option value="${t.key}"${t.key === typeKey ? ' selected' : ''}>${t.label}</option>`))
        .join('');
      item.innerHTML = `
        <div class="name"><span>${name}</span><button class="scaffold-del bm-rename" title="Rename">✎</button></div>
        <div class="bm-room-foot">
          <select class="bm-type-select">${options}</select>
          <span class="meta">${area.toFixed(1)} m²</span>
        </div>`;
      item.querySelector('.bm-rename').addEventListener('click', (e) => {
        e.stopPropagation();
        const next = prompt('Room name', name);
        if (next) {
          fs.roomNames[room.id] = next.trim();
          rebuildRoomsForLevel(selectedFloorIdx);
        }
      });
      const select = item.querySelector('.bm-type-select');
      select.addEventListener('click', (e) => e.stopPropagation());
      select.addEventListener('change', (e) => {
        if (e.target.value) fs.roomTypes[room.id] = e.target.value;
        else delete fs.roomTypes[room.id];
        rebuildRoomsForLevel(selectedFloorIdx);
      });
      list.appendChild(item);
    });
  }

  function wallDirName(wall) {
    // scene: x = east, z = south → bearing of the outward normal
    const brg = ((Math.atan2(wall.normal[0], -wall.normal[1]) * 180 / Math.PI) + 360) % 360;
    const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
    return names[Math.round(brg / 45) % 8];
  }

  function refreshOpeningList() {
    const list = $('bm-opening-list');
    list.innerHTML = '';
    if (!state.windows.length && !state.radiators.length) {
      list.innerHTML = '<div class="scaffold-empty">No windows or radiators yet.</div>';
      return;
    }
    state.windows.forEach((win) => {
      const w = O.wallById(solid, win.wallId);
      const lv = levels[Math.min(win.levelIdx, levels.length - 1)];
      const item = document.createElement('div');
      item.className = 'array-item bm-opening-item' + (selectedWindowId === win.id ? ' selected' : '');
      item.innerHTML = `
        <div class="name"><span>Window · ${w ? wallDirName(w) : '?'} wall</span><button class="scaffold-del" title="Remove">×</button></div>
        <div class="meta">${lv ? lv.name : ''} · ${win.width.toFixed(1)} × ${win.height.toFixed(1)} m · sill ${win.sill.toFixed(2)} m</div>`;
      item.addEventListener('click', () => {
        selectedWindowId = selectedWindowId === win.id ? null : win.id;
        rebuildOpenings();
      });
      item.querySelector('.scaffold-del').addEventListener('click', (e) => {
        e.stopPropagation();
        state.windows = state.windows.filter((x) => x.id !== win.id);
        if (selectedWindowId === win.id) selectedWindowId = null;
        rebuildOpenings();
      });
      list.appendChild(item);
    });
    state.radiators.forEach((rad) => {
      const w = O.wallById(solid, rad.wallId);
      const lv = levels[Math.min(rad.levelIdx, levels.length - 1)];
      const item = document.createElement('div');
      item.className = 'array-item bm-opening-item';
      item.innerHTML = `
        <div class="name"><span>Radiator · ${w ? wallDirName(w) : '?'} wall</span><button class="scaffold-del" title="Remove">×</button></div>
        <div class="meta">${lv ? lv.name : ''} · ${rad.width.toFixed(1)} m wide</div>`;
      item.querySelector('.scaffold-del').addEventListener('click', (e) => {
        e.stopPropagation();
        state.radiators = state.radiators.filter((x) => x.id !== rad.id);
        rebuildOpenings();
      });
      list.appendChild(item);
    });
  }

  function refreshWindowEditor() {
    const panel = $('bm-window-edit');
    const win = state.windows.find((w) => w.id === selectedWindowId);
    panel.style.display = win ? '' : 'none';
    $('bm-rad-under-btn').disabled = !win;
    if (!win) return;
    const wall = O.wallById(solid, win.wallId);
    $('bm-win-pos').value = Math.round((win.u / wall.len) * 100);
    $('bm-win-width').value = Math.round(win.width * 100);
    $('bm-win-height').value = Math.round(win.height * 100);
    $('bm-win-sill').value = Math.round(win.sill * 100);
    $('v-bm-win-pos').textContent = (win.u).toFixed(1) + ' m';
    $('v-bm-win-width').textContent = win.width.toFixed(2) + ' m';
    $('v-bm-win-height').textContent = win.height.toFixed(2) + ' m';
    $('v-bm-win-sill').textContent = win.sill.toFixed(2) + ' m';
  }

  [['bm-win-pos', (win, wall, v) => { win.u = (v / 100) * wall.len; }],
   ['bm-win-width', (win, wall, v) => { win.width = v / 100; }],
   ['bm-win-height', (win, wall, v) => { win.height = v / 100; }],
   ['bm-win-sill', (win, wall, v) => { win.sill = v / 100; }],
  ].forEach(([id, apply]) => {
    $(id).addEventListener('input', (e) => {
      const win = state.windows.find((w) => w.id === selectedWindowId);
      if (!win) return;
      apply(win, O.wallById(solid, win.wallId), parseFloat(e.target.value));
      O.clampWindow(win, solid, levels);
      rebuildOpenings();
    });
  });

  $('bm-win-delete').addEventListener('click', () => {
    state.windows = state.windows.filter((w) => w.id !== selectedWindowId);
    selectedWindowId = null;
    rebuildOpenings();
  });

  // ------------------------------------------------------------------
  // Settings bindings
  // ------------------------------------------------------------------
  $('bm-show').addEventListener('change', (e) => {
    buildingRoot.visible = modeActive && e.target.checked;
    applyTerrainFlatten();
  });
  $('bm-ghost').addEventListener('change', updateVisibility);
  $('bm-edges').addEventListener('change', (e) => { if (shell) shell.edgeLines.visible = e.target.checked; });
  $('bm-rejected').addEventListener('change', (e) => {
    state.settings.includeRejected = e.target.checked;
    rebuildSolid();
  });
  $('bm-ortho').addEventListener('change', (e) => {
    state.settings.orthogonalize = e.target.checked;
    rebuildSolid();
  });
  $('bm-flatten').addEventListener('change', applyTerrainFlatten);
  $('bm-tol').addEventListener('change', (e) => {
    state.settings.snapTol = parseFloat(e.target.value) / 100;
    $('v-bm-tol').textContent = state.settings.snapTol.toFixed(2) + ' m';
    rebuildSolid();
  });
  $('bm-tol').addEventListener('input', (e) => {
    $('v-bm-tol').textContent = (parseFloat(e.target.value) / 100).toFixed(2) + ' m';
  });

  $('bm-storeys').addEventListener('change', (e) => {
    state.storeys.count = Math.max(1, Math.min(5, parseInt(e.target.value, 10) || 2));
    e.target.value = state.storeys.count;
    rebuildFloors();
  });
  $('bm-fh').addEventListener('change', (e) => {
    state.storeys.storeyHeight = parseFloat(e.target.value) / 100;
    rebuildFloors();
  });
  $('bm-fh').addEventListener('input', (e) => {
    $('v-bm-fh').textContent = (parseFloat(e.target.value) / 100).toFixed(2) + ' m';
  });
  $('bm-slab').addEventListener('change', (e) => {
    state.storeys.slabT = parseFloat(e.target.value) / 100;
    rebuildFloors();
  });
  $('bm-slab').addEventListener('input', (e) => {
    $('v-bm-slab').textContent = (parseFloat(e.target.value) / 100).toFixed(2) + ' m';
  });
  $('bm-attic').addEventListener('change', (e) => {
    state.storeys.includeAttic = e.target.checked;
    rebuildFloors();
  });
  $('bm-explode').addEventListener('input', (e) => {
    $('v-bm-explode').textContent = (parseFloat(e.target.value) / 10).toFixed(1) + ' m';
    updateVisibility();
  });

  // ------------------------------------------------------------------
  // Export / import
  // ------------------------------------------------------------------
  $('bm-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'building-model-' + addr.postcode.replace(/\s+/g, '') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });
  $('bm-import').addEventListener('click', () => $('bm-import-file').click());
  $('bm-import-file').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result);
        if (data.version !== 1) throw new Error('unsupported version');
        state = data;
        saveState();
        syncControlsFromState();
        rebuildSolid();
        flash('Model imported');
      } catch (err) {
        flash('Import failed: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  function syncControlsFromState() {
    $('bm-rejected').checked = state.settings.includeRejected;
    $('bm-ortho').checked = state.settings.orthogonalize;
    $('bm-tol').value = Math.round(state.settings.snapTol * 100);
    $('v-bm-tol').textContent = state.settings.snapTol.toFixed(2) + ' m';
    $('bm-storeys').value = state.storeys.count;
    if (state.storeys.storeyHeight) {
      $('bm-fh').value = Math.round(state.storeys.storeyHeight * 100);
      $('v-bm-fh').textContent = state.storeys.storeyHeight.toFixed(2) + ' m';
    }
    $('bm-slab').value = Math.round(state.storeys.slabT * 100);
    $('v-bm-slab').textContent = state.storeys.slabT.toFixed(2) + ' m';
    $('bm-attic').checked = state.storeys.includeAttic;
  }

  function flash(msg) {
    const el = document.createElement('div');
    el.className = 'bm-flash';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('gone'), 2200);
    setTimeout(() => el.remove(), 2700);
  }

  // ------------------------------------------------------------------
  // Init
  // ------------------------------------------------------------------
  syncControlsFromState();
  rebuildSolid();
  if (solid) {
    const fh = storeyHeight();
    $('bm-fh').value = Math.round(fh * 100);
    $('v-bm-fh').textContent = fh.toFixed(2) + ' m';
  }

  function setActive(on) {
    modeActive = on;
    buildingRoot.visible = on && $('bm-show').checked;
    if (!on) setPlacing(null);
    applyTerrainFlatten();
  }

  return {
    root: buildingRoot,
    setActive,
    get solid() { return solid; },
    get levels() { return levels; },
    get state() { return state; },
  };
};
