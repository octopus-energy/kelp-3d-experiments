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
  const FP = window.SolarViz.buildingFloorplan;
  const IMG = window.IMAGE_DATA || null;
  const $ = (id) => document.getElementById(id);

  // ------------------------------------------------------------------
  // Persistent state (everything else is derived)
  // ------------------------------------------------------------------
  const addr = siteData.property_details.geocoded_address;
  const STORE_KEY = 'buildingState:' + addr.postcode + ':' + addr.easting + ':' + addr.northing;

  let state = {
    version: 1,
    settings: { includeRejected: true, snapTol: 0.7, orthogonalize: true },
    footprintOffsets: null,    // per-vertex [dx, dz] edits to the main loop
    storeys: {
      count: siteData.number_of_storeys || 2,
      storeyHeight: null,      // null = auto: (eaves − ground) / count
      slabT: 0.3,
      includeAttic: true,
    },
    floors: {},                // levelIdx -> { dividers, roomNames, roomTypes }
    windows: [],
    radiators: [],
    photoMatches: {},          // imageId -> { landmarks, pose } (photomatch-ui)
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
    dividerSel: new THREE.MeshStandardMaterial({ color: 0xf5b942, roughness: 0.8, metalness: 0.0, emissive: 0x332200 }),
    handle: new THREE.MeshBasicMaterial({ color: 0xf5b942 }),
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
      footprintOffsets: state.footprintOffsets,
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
    refreshFootprintHandles();
    syncFootprintButtons();
    rebuildListeners.forEach((fn) => { try { fn(); } catch (e) { console.error(e); } });
  }

  // other modules (photo matching) react to the solid being re-derived
  const rebuildListeners = [];

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
      const lg = {
        group: g, roomsGroup: new THREE.Group(),
        extGroup: new THREE.Group(), fpGroup: new THREE.Group(),
      };
      // thick exterior walls, shown only while this floor is being edited
      lg.extGroup.add(R.buildExteriorWalls({ level: levels[i], solid, mats }));
      lg.extGroup.visible = false;
      // floorplan underlay for floors with an applied import
      const fs = state.floors[i];
      const pf = planFloorFor(i);
      if (fs && fs.floorplan && pf) {
        lg.fpGroup.add(buildUnderlayQuad(pf, fs.floorplan.transform, levels[i].slabTopY + 0.03));
      }
      g.add(lg.roomsGroup, lg.extGroup, lg.fpGroup);
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
    let res = R.deriveRooms(lv.outline, fs.dividers);
    if (res.failed.length && FP) {
      // the outline moved under the walls (footprint edit, storey
      // change): re-snap wall ends to the new boundary before giving up
      const oldRooms = derivedRooms[idx];
      const refit = FP.refitDividers({
        worldOutline: lv.outline, dividers: fs.dividers, deriveRooms: R.deriveRooms,
      });
      fs.dividers = refit.dividers;
      res = R.deriveRooms(lv.outline, fs.dividers);
      if (oldRooms) remapRoomMeta(fs, oldRooms, res.rooms);
      if (refit.failed.length) {
        console.warn(`[building] ${refit.failed.length} divider(s) no longer fit floor ${idx}, dropped`);
      }
    } else if (res.failed.length) {
      fs.dividers = res.applied;
    }
    derivedRooms[idx] = res.rooms;
    if (idx === selectedFloorIdx && selectedWall !== null && selectedWall >= fs.dividers.length) {
      selectedWall = null;
    }

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
    if (idx === selectedFloorIdx) refreshWallSelection();
    if (!(opts && opts.skipLists)) {
      refreshFloorList();
      refreshRoomList();
      saveState();
    }
  }

  // Carry room names/types across a re-derivation that changed the room
  // ids (wall deleted or dropped, outline edited): match old rooms to
  // new ones by centroid containment.
  function remapRoomMeta(fs, oldRooms, newRooms) {
    const names = {}, types = {};
    oldRooms.forEach((r) => {
      const name = fs.roomNames[r.id], type = fs.roomTypes[r.id];
      if (!name && !type) return;
      const [cx, cz] = G.polygonCentroid(r.poly);
      const hit = newRooms.find((nr) => G.pointInPolygon(nr.poly, cx, cz));
      if (hit && !names[hit.id] && !types[hit.id]) {
        if (name) names[hit.id] = name;
        if (type) types[hit.id] = type;
      }
    });
    fs.roomNames = names;
    fs.roomTypes = types;
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
      // floorplan underlay: only on the isolated floor, hidden while a
      // fresh import preview (which draws its own quad) is showing
      lg.fpGroup.visible = sel === i && !!(state.floors[i] && state.floors[i].floorplan) &&
        $('bm-fp-underlay').checked && !(fpPreview && fpPreview.levelIdx === i);
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
  // Floorplan import: fit the plan floor from IMAGE_DATA onto the
  // selected floor, preview the underlay + derived walls, let the user
  // nudge (rotate / mirror / shift), then Apply — which stores ordinary
  // dividers + names/types, so the result is editable like hand-drawn
  // rooms. IMAGE_DATA is suggestion-only: nothing lands in state until
  // Apply.
  // ------------------------------------------------------------------
  const fpBtn = $('bm-fp-import');
  const underlayMat = new THREE.MeshBasicMaterial({
    color: 0xffffff, transparent: true, opacity: 0.5,
    side: THREE.DoubleSide, depthWrite: false,
  });
  if (IMG && IMG.floorplan) {
    new THREE.TextureLoader().load(IMG.basePath + IMG.floorplan.file, (tex) => {
      tex.colorSpace = THREE.SRGBColorSpace;
      underlayMat.map = tex;
      underlayMat.needsUpdate = true;
    });
  }

  function planFloorFor(idx) {
    if (!IMG || !IMG.floorplan || !FP) return null;
    return IMG.floorplan.floors.find((f) => f.level === idx) || null;
  }

  // Textured quad covering the plan floor's bbox (plus margin so wall
  // linework isn't clipped), with corners run through the transform so
  // rotation/mirror come out right.
  function buildUnderlayQuad(pf, T, y) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    pf.outline.forEach(([px, py]) => {
      x0 = Math.min(x0, px); x1 = Math.max(x1, px);
      y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    });
    const M = 14;
    x0 -= M; y0 -= M; x1 += M; y1 += M;
    const [W, H] = IMG.floorplan.imageSize;
    const pos = [], uv = [];
    [[x0, y0], [x1, y0], [x1, y1], [x0, y1]].forEach(([px, py]) => {
      const [wx, wz] = FP.applyToPoint(T, [px, py]);
      pos.push(wx, y, wz);
      uv.push(px / W, 1 - py / H);
    });
    const geom = new THREE.BufferGeometry();
    geom.setIndex([0, 2, 1, 0, 3, 2]);
    geom.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    geom.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    return new THREE.Mesh(geom, underlayMat);
  }

  let fpPreview = null;   // { levelIdx, planFloor, transform, mapped, group }
  const fpLineOk = new THREE.LineBasicMaterial({ color: 0x4dabf7 });
  const fpLineBad = new THREE.LineBasicMaterial({ color: 0xff6b6b });

  function fpRefreshPreview() {
    const p = fpPreview;
    if (!p) return;
    disposeGroup(p.group);
    const lv = levels[p.levelIdx];
    p.mapped = FP.mapPlan({
      planFloor: p.planFloor, transform: p.transform,
      worldOutline: lv.outline, deriveRooms: R.deriveRooms,
    });
    p.group.add(buildUnderlayQuad(p.planFloor, p.transform, lv.slabTopY + 0.03));
    const mkLine = (path, mat) => new THREE.Line(
      new THREE.BufferGeometry().setFromPoints(
        path.map(([x, z]) => new THREE.Vector3(x, lv.slabTopY + 0.12, z))), mat);
    p.mapped.dividers.forEach((d) => p.group.add(mkLine(d, fpLineOk)));
    p.mapped.failed.forEach((d) => p.group.add(mkLine(d, fpLineBad)));
    $('bm-fp-apply').textContent = `Apply ${p.mapped.dividers.length + 1} rooms`;
    $('bm-fp-score').textContent =
      'fit ' + Math.round((p.transform.score || 0) * 100) + '%' +
      (p.mapped.failed.length ? ` · ${p.mapped.failed.length} wall(s) failed` : '');
  }

  function fpStartPreview() {
    if (selectedFloorIdx === null || !solid) return;
    const planFloor = planFloorFor(selectedFloorIdx);
    if (!planFloor) return;
    fpCancelPreview();
    const lv = levels[selectedFloorIdx];
    const scale = FP.planScale(planFloor.rooms);
    if (!scale) { flash('Floorplan has no printed dimensions to scale from'); return; }
    const transform = FP.fitTransform({
      planOutline: planFloor.outline, scale,
      worldOutline: lv.outline, axisAngle: solid.axisAngle,
    });
    fpPreview = {
      levelIdx: selectedFloorIdx, planFloor, transform,
      mapped: null, group: new THREE.Group(),
    };
    buildingRoot.add(fpPreview.group);
    $('bm-fp-preview').style.display = '';
    fpBtn.style.display = 'none';
    fpRefreshPreview();
    updateVisibility();
  }

  function fpCancelPreview() {
    if (!fpPreview) return;
    disposeGroup(fpPreview.group);
    buildingRoot.remove(fpPreview.group);
    fpPreview = null;
    $('bm-fp-preview').style.display = 'none';
    fpBtn.style.display = '';
    updateVisibility();
  }

  function fpApply() {
    const p = fpPreview;
    if (!p || !p.mapped) return;
    const fs = floorState(p.levelIdx);
    if (fs.dividers.length &&
        !confirm('Replace the existing walls on this floor with the floorplan layout?')) return;
    fs.dividers = p.mapped.dividers;
    fs.roomNames = p.mapped.roomNames;
    fs.roomTypes = p.mapped.roomTypes;
    fs.floorplan = { transform: p.transform };
    const failed = p.mapped.failed.length;
    fpCancelPreview();
    rebuildFloors();       // also rebuilds the persistent underlay quad
    $('bm-fp-underlay-row').style.display = '';
    flash(failed
      ? `Rooms imported — ${failed} wall(s) could not be placed, draw them by hand`
      : 'Rooms imported from floorplan');
  }

  // Re-fit with a forced orientation (rotate/mirror nudges re-run the
  // translation search so the plan stays centred on the outline).
  function fpRefit(force) {
    const p = fpPreview;
    if (!p) return;
    const lv = levels[p.levelIdx];
    p.transform = FP.fitTransform({
      planOutline: p.planFloor.outline, scale: p.transform.scale,
      worldOutline: lv.outline, axisAngle: solid.axisAngle, force,
    });
    fpRefreshPreview();
  }

  fpBtn.addEventListener('click', fpStartPreview);
  $('bm-fp-apply').addEventListener('click', fpApply);
  $('bm-fp-cancel').addEventListener('click', fpCancelPreview);
  $('bm-fp-rot').addEventListener('click', () => fpPreview && fpRefit({
    q: (fpPreview.transform.q + 1) % 4, mirrored: fpPreview.transform.mirrored,
  }));
  $('bm-fp-mirror').addEventListener('click', () => fpPreview && fpRefit({
    q: fpPreview.transform.q, mirrored: !fpPreview.transform.mirrored,
  }));
  // plan view is north-up: ↑ = −z (north), → = +x (east)
  [['bm-fp-up', 0, -0.25], ['bm-fp-down', 0, 0.25], ['bm-fp-left', -0.25, 0], ['bm-fp-right', 0.25, 0]]
    .forEach(([id, dx, dz]) => $(id).addEventListener('click', () => {
      if (!fpPreview) return;
      fpPreview.transform.tx += dx;
      fpPreview.transform.tz += dz;
      fpRefreshPreview();
    }));
  $('bm-fp-underlay').addEventListener('change', updateVisibility);

  // ------------------------------------------------------------------
  // Wall editing: click a divider wall to select it, drag it sideways
  // to move (attached T-junction walls re-snap onto its new position),
  // delete via the button. Room names survive via centroid remapping.
  // ------------------------------------------------------------------
  let selectedWall = null;   // divider index on the selected floor

  function dividerMeshesFor(idx) {
    const out = [];
    if (idx === null || !levelGroups[idx]) return out;
    levelGroups[idx].roomsGroup.traverse((o) => {
      if (o.userData && o.userData.type === 'divider') out.push(o);
    });
    return out;
  }

  function refreshWallSelection() {
    dividerMeshesFor(selectedFloorIdx).forEach((m) => {
      m.material = m.userData.dividerIdx === selectedWall ? mats.dividerSel : mats.dividerWall;
    });
    $('bm-wall-edit').style.display = selectedWall === null ? 'none' : '';
  }

  function selectWall(idx) {
    selectedWall = idx;
    refreshWallSelection();
  }

  $('bm-wall-delete').addEventListener('click', () => {
    if (selectedWall === null || selectedFloorIdx === null) return;
    const fs = floorState(selectedFloorIdx);
    const lv = levels[selectedFloorIdx];
    const oldRooms = derivedRooms[selectedFloorIdx] || [];
    const trial = fs.dividers.slice();
    trial.splice(selectedWall, 1);
    // walls that ended on the deleted one re-snap where they can
    const refit = FP.refitDividers({
      worldOutline: lv.outline, dividers: trial, deriveRooms: R.deriveRooms,
    });
    fs.dividers = refit.dividers;
    remapRoomMeta(fs, oldRooms, R.deriveRooms(lv.outline, fs.dividers).rooms);
    selectedWall = null;
    rebuildRoomsForLevel(selectedFloorIdx);
    if (refit.failed.length) flash(`${refit.failed.length} attached wall(s) removed too`);
  });

  // ------------------------------------------------------------------
  // Parametric footprint editing: draggable handles on the main loop's
  // vertices. Committed drags persist as per-vertex offsets and rebuild
  // the whole chain — solid, floors, rooms (re-snapped), openings.
  // ------------------------------------------------------------------
  const fpEditBtn = $('bm-footprint-btn');
  const fpResetBtn = $('bm-footprint-reset');
  let editingFootprint = false;
  let fpHandles = [];
  const fpEditGroup = new THREE.Group();
  buildingRoot.add(fpEditGroup);
  const handleGeom = new THREE.SphereGeometry(0.26, 14, 10);

  function clearFootprintHandles() {
    while (fpEditGroup.children.length) {
      const c = fpEditGroup.children[0];
      fpEditGroup.remove(c);
      if (c.geometry && c.geometry !== handleGeom) c.geometry.dispose();
    }
    fpHandles = [];
  }

  function refreshFootprintHandles() {
    clearFootprintHandles();
    if (!editingFootprint || !solid) return;
    solid.loops[0].ids.forEach((id, i) => {
      const c = solid.clusters[id];
      const m = new THREE.Mesh(handleGeom, mats.handle);
      m.position.set(c.x, c.y + 0.35, c.z);
      m.userData = { type: 'fp-handle', fpIdx: i };
      fpEditGroup.add(m);
      fpHandles.push(m);
    });
    rebuildFootprintOutlineLine();
  }

  function rebuildFootprintOutlineLine() {
    const old = fpEditGroup.children.find((c) => c.userData.isFpOutline);
    if (old) { fpEditGroup.remove(old); old.geometry.dispose(); }
    if (!fpHandles.length) return;
    const pts = fpHandles.map((h) => h.position.clone());
    pts.push(pts[0].clone());
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mats.outline);
    line.userData.isFpOutline = true;
    fpEditGroup.add(line);
  }

  function setFootprintEdit(on) {
    editingFootprint = on;
    fpEditBtn.classList.toggle('active', on);
    fpEditBtn.textContent = on ? 'Done editing footprint' : 'Edit footprint';
    if (on) {
      if (selectedFloorIdx !== null) selectFloor(null);
      setPlacing(null);
      fpCancelPreview();
    }
    refreshFootprintHandles();
  }
  fpEditBtn.addEventListener('click', () => setFootprintEdit(!editingFootprint));
  fpResetBtn.addEventListener('click', () => {
    state.footprintOffsets = null;
    saveState();
    rebuildSolid();
  });
  function syncFootprintButtons() {
    const edited = state.footprintOffsets && state.footprintOffsets.some((o) => o && (o[0] || o[1]));
    fpResetBtn.style.display = edited ? '' : 'none';
  }

  // ------------------------------------------------------------------
  // Shared drag machinery (wall move + footprint handle move)
  // ------------------------------------------------------------------
  let drag = null;
  const dragPlane = new THREE.Plane();
  const dragPt = new THREE.Vector3();
  function pointOnPlane(e, y) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, view.camera);
    dragPlane.set(new THREE.Vector3(0, 1, 0), -y);
    return raycaster.ray.intersectPlane(dragPlane, dragPt) ? dragPt : null;
  }

  function beginWallDrag(startPoint) {
    const fs = floorState(selectedFloorIdx);
    const path = fs.dividers[selectedWall];
    // move axis = perpendicular of the longest segment
    let ax = 0, az = 0, bestLen = 0;
    for (let i = 0; i < path.length - 1; i++) {
      const dx = path[i + 1][0] - path[i][0], dz = path[i + 1][1] - path[i][1];
      const l = Math.hypot(dx, dz);
      if (l > bestLen) { bestLen = l; ax = -dz / l; az = dx / l; }
    }
    if (!bestLen) return;
    drag = {
      kind: 'wall', axis: [ax, az], delta: 0,
      start: [startPoint.x, startPoint.z],
      path: path.map((p) => p.slice()),
      planeY: levels[selectedFloorIdx].slabTopY,
      meshes: dividerMeshesFor(selectedFloorIdx).filter((m) => m.userData.dividerIdx === selectedWall),
    };
    controls.enabled = false;
  }

  function beginFootprintDrag(handle) {
    drag = {
      kind: 'fp', idx: handle.userData.fpIdx, handle,
      planeY: handle.position.y,
      base: [handle.position.x, handle.position.z],
      cur: [handle.position.x, handle.position.z],
      grab: null,   // pointer offset from the handle, set on first move
    };
    controls.enabled = false;
  }

  function commitDrag() {
    const d = drag;
    drag = null;
    controls.enabled = true;
    if (d.kind === 'wall') {
      d.meshes.forEach((m) => m.position.set(0, 0, 0));
      if (Math.abs(d.delta) < 0.02 || selectedFloorIdx === null) return;
      const fs = floorState(selectedFloorIdx);
      const lv = levels[selectedFloorIdx];
      const moved = d.path.map(([x, z]) => [x + d.axis[0] * d.delta, z + d.axis[1] * d.delta]);
      const trial = fs.dividers.slice();
      trial[selectedWall] = moved;
      const refit = FP.refitDividers({
        worldOutline: lv.outline, dividers: trial, deriveRooms: R.deriveRooms,
      });
      if (refit.failed.includes(moved)) {
        flash('Wall cannot move there');
        rebuildRoomsForLevel(selectedFloorIdx);
        return;
      }
      const oldRooms = derivedRooms[selectedFloorIdx] || [];
      fs.dividers = refit.dividers;
      remapRoomMeta(fs, oldRooms, R.deriveRooms(lv.outline, fs.dividers).rooms);
      // keep the moved wall selected: nearest stored divider by midpoint
      const mid = FP.polylineMidpoint(moved);
      let bi = null, bd = Infinity;
      fs.dividers.forEach((p, i) => {
        const m = FP.polylineMidpoint(p);
        const dd = Math.hypot(m[0] - mid[0], m[1] - mid[1]);
        if (dd < bd) { bd = dd; bi = i; }
      });
      selectedWall = bi;
      rebuildRoomsForLevel(selectedFloorIdx);
      if (refit.failed.length) flash(`${refit.failed.length} attached wall(s) dropped`);
    } else {
      const dx = d.cur[0] - d.base[0], dz = d.cur[1] - d.base[1];
      if (Math.hypot(dx, dz) < 0.03 || !solid) return;
      const n = solid.loops[0].ids.length;
      if (!state.footprintOffsets || state.footprintOffsets.length !== n) {
        state.footprintOffsets = new Array(n).fill(null);
      }
      const o = state.footprintOffsets[d.idx] || [0, 0];
      state.footprintOffsets[d.idx] = [o[0] + dx, o[1] + dz];
      saveState();
      rebuildSolid();   // floors, rooms and openings all re-derive
    }
  }

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
    if (e.button !== 0) return;
    downPos = { x: e.clientX, y: e.clientY };
    if (!modeActive || planDraw.isActive() || !solid) return;
    // begin a drag when the press lands on a footprint handle or on the
    // already-selected wall — otherwise leave the press to OrbitControls
    if (editingFootprint) {
      const hits = raycastFromEvent(e, fpHandles);
      if (hits.length) beginFootprintDrag(hits[0].object);
      return;
    }
    if (selectedWall !== null && selectedFloorIdx !== null && !placing) {
      const own = dividerMeshesFor(selectedFloorIdx)
        .filter((m) => m.userData.dividerIdx === selectedWall);
      const hits = raycastFromEvent(e, own);
      if (hits.length) beginWallDrag(hits[0].point);
    }
  });
  renderer.domElement.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const p = pointOnPlane(e, drag.planeY);
    if (!p) return;
    if (drag.kind === 'wall') {
      drag.delta = (p.x - drag.start[0]) * drag.axis[0] + (p.z - drag.start[1]) * drag.axis[1];
      drag.meshes.forEach((m) => m.position.set(drag.axis[0] * drag.delta, 0, drag.axis[1] * drag.delta));
    } else {
      if (!drag.grab) drag.grab = [p.x - drag.base[0], p.z - drag.base[1]];
      let x = p.x - drag.grab[0], z = p.z - drag.grab[1];
      // keep footprint edges square: snap onto the axis line through
      // either neighbour when the edge is nearly axis-aligned
      const n = fpHandles.length;
      [fpHandles[(drag.idx + n - 1) % n], fpHandles[(drag.idx + 1) % n]].forEach((nb) => {
        [x, z] = R.axisSnap([nb.position.x, nb.position.z], [x, z], solid.axisAngle, 8);
      });
      drag.cur = [x, z];
      drag.handle.position.set(x, drag.planeY, z);
      rebuildFootprintOutlineLine();
    }
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button !== 0) return;
    if (drag) { commitDrag(); downPos = null; return; }
    if (!downPos) return;
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

    // click on a divider wall: select it for move/delete
    if (selectedFloorIdx !== null && !fpPreview) {
      const hits = raycastFromEvent(e, dividerMeshesFor(selectedFloorIdx));
      if (hits.length) {
        selectWall(hits[0].object.userData.dividerIdx);
        return;
      }
      if (selectedWall !== null) selectWall(null);
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
    fpCancelPreview();
    if (idx !== null && editingFootprint) setFootprintEdit(false);
    selectedWall = null;
    selectedFloorIdx = idx;
    refreshWallSelection();
    wallBtn.disabled = idx === null;
    $('bm-undo-wall').disabled = idx === null;
    fpBtn.disabled = idx === null || !planFloorFor(idx);
    $('bm-fp-underlay-row').style.display =
      (idx !== null && state.floors[idx] && state.floors[idx].floorplan) ? '' : 'none';
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
    if (!on) {
      setPlacing(null);
      fpCancelPreview();
      if (editingFootprint) setFootprintEdit(false);
    }
    applyTerrainFlatten();
  }

  return {
    root: buildingRoot,
    setActive,
    save: saveState,
    addRebuildListener: (fn) => rebuildListeners.push(fn),
    get solid() { return solid; },
    get levels() { return levels; },
    get state() { return state; },
  };
};
