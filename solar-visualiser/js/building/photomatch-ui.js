// =====================================================================
// Photo matching UI: the human half of pose recovery.
//
// The AI ingest (IMAGE_DATA .match) suggests landmark dots on each
// exterior photo; this panel lets the user drag them, watching the
// model's wireframe re-projected live over the photo — the pose is
// trusted when the wireframe visibly locks onto the building. Accepted
// matches persist (landmark ids + normalised pixels, frame-independent)
// in buildingState and appear in the scene as camera frustums with the
// photo as a thumbnail; clicking one flies the camera to the
// photographer's position and cross-fades the photo over the model at
// the solved focal length.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.setupPhotoMatch = function ({ camera, view, renderer, controls, cameraAnimator, planDraw, building, imageData }) {
  const PM = window.SolarViz.buildingPhotoMatch;
  const $ = (id) => document.getElementById(id);
  const state = building.state;
  if (!state.photoMatches) state.photoMatches = {};
  const IMG = imageData || null;
  const base = (IMG && IMG.basePath) || '';

  const photos = ((IMG && IMG.images) || []).filter((im) => im.kind === 'exterior');
  if (!photos.length) return { setActive: () => {} };

  let landmarks = [];
  let landmarkById = new Map();
  let edges = [];
  function refreshModelData() {
    if (!building.solid) return;
    landmarks = PM.buildLandmarks(building.solid);
    landmarkById = new Map(landmarks.map((l) => [l.id, l]));
    edges = PM.wireEdges(building.solid);
  }
  refreshModelData();

  // ------------------------------------------------------------------
  // Solving helpers (all px stored normalised 0..1)
  // ------------------------------------------------------------------
  function toPoints(match) {
    const [W, H] = match.imageSize;
    return match.landmarks
      .map((lm) => {
        const l = landmarkById.get(lm.id);
        return l ? { id: lm.id, p: l.p, px: [lm.px[0] * W, lm.px[1] * H] } : null;
      })
      .filter(Boolean);
  }
  function solveMatch(match) {
    const G = window.SolarViz.buildingGeometry;
    const points = toPoints(match);
    if (points.length < 4) return null;
    return PM.solvePose({
      points, imageSize: match.imageSize,
      groundY: building.solid.groundY,
      centroid: G.polygonCentroid(building.solid.footprint),
    });
  }

  // ------------------------------------------------------------------
  // Camera frustums for accepted matches
  // ------------------------------------------------------------------
  const frustumGroup = new THREE.Group();
  building.root.add(frustumGroup);
  const frustumMat = new THREE.LineBasicMaterial({ color: 0xf5b942 });
  const texLoader = new THREE.TextureLoader();

  function disposeFrustums() {
    frustumGroup.traverse((o) => {
      if (o.geometry) o.geometry.dispose();
      if (o.material && o.material.isSpriteMaterial) {
        if (o.material.map) o.material.map.dispose();
        o.material.dispose();
      }
    });
    while (frustumGroup.children.length) frustumGroup.remove(frustumGroup.children[0]);
  }

  function rebuildFrustums() {
    disposeFrustums();
    photos.forEach((im) => {
      const m = state.photoMatches[im.id];
      if (!m || !m.pose || m.roofNeedsReview) return;
      const pose = m.pose;
      const g = new THREE.Group();
      const fwd = new THREE.Vector3(...PM.poseForward(pose));
      const pos = new THREE.Vector3(...pose.pos);
      // pyramid: apex at the camera, base 1.5 m out, photo aspect
      const d = 1.5;
      const hh = d * Math.tan((pose.fovV * Math.PI) / 360);
      const hw = hh * (m.imageSize ? m.imageSize[0] / m.imageSize[1] : 1.5);
      const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(pose.pitch, pose.yaw, pose.roll, 'YXZ'));
      const corners = [
        new THREE.Vector3(-hw, -hh, -d), new THREE.Vector3(hw, -hh, -d),
        new THREE.Vector3(hw, hh, -d), new THREE.Vector3(-hw, hh, -d),
      ].map((c) => c.applyQuaternion(q).add(pos));
      const lp = [];
      corners.forEach((c, i) => {
        lp.push(pos.x, pos.y, pos.z, c.x, c.y, c.z);
        const n = corners[(i + 1) % 4];
        lp.push(c.x, c.y, c.z, n.x, n.y, n.z);
      });
      const lg = new THREE.BufferGeometry();
      lg.setAttribute('position', new THREE.Float32BufferAttribute(lp, 3));
      g.add(new THREE.LineSegments(lg, frustumMat));

      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, opacity: 0.95 }));
      texLoader.load(window.SolarViz.imageUrl(im), (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        sprite.material.map = tex;
        sprite.material.needsUpdate = true;
      });
      sprite.scale.set(2 * hw, 2 * hh, 1);
      sprite.position.copy(pos.clone().add(fwd.clone().multiplyScalar(d)));
      sprite.userData = { type: 'photo-camera', imageId: im.id };
      g.add(sprite);
      frustumGroup.add(g);
    });
  }

  // ------------------------------------------------------------------
  // Sidebar list
  // ------------------------------------------------------------------
  function refreshList() {
    const list = $('bm-photo-list');
    list.innerHTML = '';
    photos.forEach((im) => {
      const saved = state.photoMatches[im.id];
      const suggested = state.roofRevision ? null : im.match;
      const status = saved && saved.roofNeedsReview ? 'roof changed — rematch' : saved && saved.pose
        ? (isFinite(saved.pose.rmse) ? `matched · ${saved.pose.rmse.toFixed(0)} px` : 'matched by eye')
        : suggested
          ? (suggested.needsReview ? 'suggested — needs review' : 'suggested')
          : 'no landmarks yet';
      const item = document.createElement('div');
      item.className = 'array-item bm-photo-item' + (saved && saved.pose ? ' matched' : '');
      item.innerHTML = `
        <img src="${window.SolarViz.imageUrl(im)}" alt="">
        <div class="bm-photo-meta">
          <div class="name">${im.side || 'exterior'} photo</div>
          <div class="meta">${status}</div>
          <div class="bm-photo-actions">
            <button class="pm-open">Match…</button>
            ${saved && saved.pose ? '<button class="pm-fly">Stand here</button>' : ''}
          </div>
        </div>`;
      item.querySelector('.pm-open').addEventListener('click', () => openPanel(im));
      const fly = item.querySelector('.pm-fly');
      if (fly) fly.addEventListener('click', () => flyToPhoto(im.id));
      list.appendChild(item);
    });
  }

  // ------------------------------------------------------------------
  // Match panel
  // ------------------------------------------------------------------
  let panel = null;   // { el, im, working: [{id, px:[u,v]}], pose, img, canvas, selected, dragging }
  const highlightMesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.3, 14, 10),
    new THREE.MeshBasicMaterial({ color: 0x4dabf7 }));
  highlightMesh.visible = false;
  building.root.add(highlightMesh);

  function closePanel() {
    if (alignEl) finishAlign(false);
    if (!panel) return;
    panel.el.remove();
    panel = null;
    highlightMesh.visible = false;
  }

  function flashWarn(msg) {
    const el = document.createElement('div');
    el.className = 'bm-flash';
    el.textContent = msg;
    document.body.appendChild(el);
    setTimeout(() => el.classList.add('gone'), 2600);
    setTimeout(() => el.remove(), 3100);
  }

  function openPanel(im) {
    closePanel();
    const saved = state.photoMatches[im.id];
    const src = saved && !saved.roofNeedsReview ? saved : (state.roofRevision ? null : im.match);
    const working = (src && src.landmarks ? src.landmarks : []).map((lm) => ({ id: lm.id, px: lm.px.slice() }));
    const el = document.createElement('div');
    el.className = 'pm-panel';
    el.innerHTML = `
      <div class="pm-head">
        <span class="pm-title">${im.side || ''} photo — drag the dots onto their corners</span>
        <span class="pm-stats">—</span>
        <button class="pm-accept">Accept match</button>
        <button class="pm-x" title="Close">×</button>
      </div>
      <div class="pm-body">
        <img src="${window.SolarViz.imageUrl(im)}" alt="">
        <canvas></canvas>
      </div>
      <div class="pm-foot">
        <button class="pm-align-btn" title="Orbit the 3D view until the model lines up behind the photo">Align view…</button>
        <select class="pm-add"><option value="">+ Add landmark…</option></select>
        <span class="pm-sel"></span>
        <span class="pm-hint">green &lt; 8 px · orange &lt; 25 px · red worse — the wireframe should lock onto the building</span>
      </div>`;
    document.body.appendChild(el);
    panel = {
      el, im, working, pose: null,
      imageSize: (src && src.imageSize) || im.imageSize || [800, 533],
      img: el.querySelector('img'), canvas: el.querySelector('canvas'),
      selected: null, dragging: false,
    };
    el.querySelector('.pm-x').addEventListener('click', closePanel);
    el.querySelector('.pm-accept').addEventListener('click', acceptMatch);
    el.querySelector('.pm-align-btn').addEventListener('click', startAlign);
    const add = el.querySelector('.pm-add');
    landmarks.forEach((l) => {
      const o = document.createElement('option');
      o.value = l.id;
      o.textContent = l.label + '  (' + l.id + ')';
      add.appendChild(o);
    });
    add.addEventListener('change', () => {
      if (!add.value) return;
      if (!panel.working.some((w) => w.id === add.value)) {
        panel.working.push({ id: add.value, px: [0.5, 0.5] });
        panel.selected = add.value;
        solveWorking(true);
      }
      add.value = '';
    });
    panel.img.addEventListener('load', () => { sizeCanvas(); solveWorking(true); });
    if (panel.img.complete) { sizeCanvas(); solveWorking(true); }
    panel.canvas.addEventListener('pointerdown', onDotDown);
    panel.canvas.addEventListener('pointermove', onDotMove);
    window.addEventListener('pointerup', onDotUp);
  }

  function sizeCanvas() {
    const r = panel.img.getBoundingClientRect();
    panel.canvas.width = r.width;
    panel.canvas.height = r.height;
  }

  // With an existing pose (solved or set by orbit-aligning) always
  // warm-refine: a full reseeded solve could jump to a different pose
  // family than the one the user just established visually. Full solves
  // happen only when there is no pose yet.
  function solveWorking(full) {
    const match = { imageSize: panel.imageSize, landmarks: panel.working };
    const points = toPoints(match);
    if (points.length >= 4) {
      panel.pose = panel.pose
        ? PM.refinePose(panel.pose, {
          points, imageSize: panel.imageSize, groundY: building.solid.groundY,
        })
        : (full ? solveMatch(match) : null);
    } else if (!panel.manualPose) {
      panel.pose = null;
    }
    drawPanel();
  }

  function drawPanel() {
    const c = panel.canvas, ctx = c.getContext('2d');
    ctx.clearRect(0, 0, c.width, c.height);
    const [W, H] = panel.imageSize;
    const sx = c.width / W, sy = c.height / H;
    const pose = panel.pose;
    if (pose) {
      ctx.strokeStyle = 'rgba(0,220,255,0.85)';
      ctx.lineWidth = 1.4;
      PM.projectEdges(pose, panel.imageSize, edges).forEach(([a, b]) => {
        ctx.beginPath();
        ctx.moveTo(a[0] * sx, a[1] * sy);
        ctx.lineTo(b[0] * sx, b[1] * sy);
        ctx.stroke();
      });
    }
    const points = toPoints({ imageSize: panel.imageSize, landmarks: panel.working });
    const errById = new Map();
    if (pose) {
      points.forEach((pt) => {
        const uv = PM.projectPoint(pose, panel.imageSize, pt.p);
        errById.set(pt.id, uv ? Math.hypot(uv[0] - pt.px[0], uv[1] - pt.px[1]) : Infinity);
      });
    }
    panel.working.forEach((w) => {
      const x = w.px[0] * W * sx, y = w.px[1] * H * sy;
      const err = errById.get(w.id);
      ctx.fillStyle = err === undefined ? '#9aa3ad' : err < 8 ? '#37b24d' : err < 25 ? '#f59f00' : '#f03e3e';
      ctx.beginPath();
      ctx.arc(x, y, w.id === panel.selected ? 7 : 5, 0, 7);
      ctx.fill();
      if (w.id === panel.selected) {
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    });
    const stats = panel.el.querySelector('.pm-stats');
    const errs = [...errById.values()].filter((e) => isFinite(e));
    const rmse = errs.length ? Math.sqrt(errs.reduce((s, e) => s + e * e, 0) / errs.length) : null;
    stats.textContent = pose
      ? `rmse ${rmse === null ? '—' : rmse.toFixed(0) + ' px'} · fov ${pose.fovV.toFixed(0)}°` +
        (rmse !== null && rmse > 30 ? ' — try Align view' : '')
      : `${panel.working.length}/4 points — try Align view`;
    const sel = panel.el.querySelector('.pm-sel');
    if (panel.selected) {
      const l = landmarkById.get(panel.selected);
      const err = errById.get(panel.selected);
      sel.innerHTML = `${l ? l.label : panel.selected}${err !== undefined ? ' · ' + err.toFixed(0) + ' px' : ''} <button class="pm-del">remove</button>`;
      sel.querySelector('.pm-del').addEventListener('click', () => {
        panel.working = panel.working.filter((w) => w.id !== panel.selected);
        panel.selected = null;
        highlightMesh.visible = false;
        solveWorking(true);
      });
      if (l) {
        highlightMesh.position.set(l.p[0], l.p[1], l.p[2]);
        highlightMesh.visible = true;
      }
    } else {
      sel.textContent = '';
      highlightMesh.visible = false;
    }
  }

  function dotAt(e) {
    const r = panel.canvas.getBoundingClientRect();
    const x = e.clientX - r.left, y = e.clientY - r.top;
    const [W, H] = panel.imageSize;
    const sx = panel.canvas.width / W, sy = panel.canvas.height / H;
    let best = null, bd = 14;
    panel.working.forEach((w) => {
      const d = Math.hypot(w.px[0] * W * sx - x, w.px[1] * H * sy - y);
      if (d < bd) { bd = d; best = w; }
    });
    return best;
  }

  function onDotDown(e) {
    const hit = dotAt(e);
    panel.selected = hit ? hit.id : null;
    panel.dragging = !!hit;
    drawPanel();
    if (hit) e.preventDefault();
  }
  function onDotMove(e) {
    if (!panel || !panel.dragging || !panel.selected) return;
    const r = panel.canvas.getBoundingClientRect();
    const w = panel.working.find((x) => x.id === panel.selected);
    if (!w) return;
    w.px = [
      Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)),
      Math.max(0, Math.min(1, (e.clientY - r.top) / r.height)),
    ];
    solveWorking(false);   // warm-start refine while dragging
  }
  function onDotUp() {
    if (panel && panel.dragging) {
      panel.dragging = false;
      solveWorking(true);  // full reseeded solve once the drag settles
    }
  }

  // ------------------------------------------------------------------
  // Align by orbiting: overlay the photo semi-transparently on the 3D
  // view and let the user orbit until the model lines up behind it; the
  // camera then *is* the pose. Ideal when suggested dots are bad — the
  // wireframe drawn from the aligned pose makes fixing dots easy, and
  // subsequent drags warm-refine from this pose family.
  // ------------------------------------------------------------------
  let alignEl = null;
  let alignSavedFov = null;

  function startAlign() {
    if (!panel) return;
    if (building.selectFloor) building.selectFloor(null);
    closeOverlay();
    panel.el.style.display = 'none';
    alignSavedFov = camera.fov;
    camera.fov = panel.pose ? panel.pose.fovV : 65;
    camera.updateProjectionMatrix();
    frustumGroup.visible = false;
    alignEl = document.createElement('div');
    alignEl.className = 'pm-overlay';
    alignEl.innerHTML = `
      <img src="${window.SolarViz.imageUrl(panel.im)}" alt="">
      <div class="pm-overlay-bar">
        <span>orbit until the model lines up behind the photo</span>
        <input type="range" min="5" max="95" value="45">
        <button class="pm-align-use">Use this view</button>
        <button class="pm-align-cancel">Cancel</button>
      </div>`;
    const img = alignEl.querySelector('img');
    img.style.opacity = 0.45;
    alignEl.querySelector('input').addEventListener('input', (e) => {
      img.style.opacity = e.target.value / 100;
    });
    alignEl.querySelector('.pm-align-use').addEventListener('click', () => finishAlign(true));
    alignEl.querySelector('.pm-align-cancel').addEventListener('click', () => finishAlign(false));
    document.body.appendChild(alignEl);
  }

  function finishAlign(use) {
    if (!alignEl) return;
    alignEl.remove();
    alignEl = null;
    frustumGroup.visible = true;
    if (use && panel) {
      // the current camera is the pose estimate
      const e = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      const H = panel.imageSize[1];
      panel.pose = {
        pos: camera.position.toArray(),
        yaw: e.y, pitch: e.x, roll: e.z,
        f: H / 2 / Math.tan((camera.fov * Math.PI) / 360),
        fovV: camera.fov,
        rmse: NaN, perPoint: [],
      };
      panel.manualPose = true;
      // deliberately no refine here: the existing dots may be the very
      // thing that's wrong, and refining against them would yank the
      // pose straight back to the bad optimum. The wireframe drawn from
      // this pose shows the user where the dots SHOULD be; refinement
      // resumes as they drag them.
    }
    if (alignSavedFov !== null) {
      camera.fov = alignSavedFov;
      camera.updateProjectionMatrix();
      alignSavedFov = null;
    }
    if (panel) {
      panel.el.style.display = '';
      sizeCanvas();
      drawPanel();
    }
  }

  function acceptMatch() {
    if (!panel || !panel.pose) return;
    // physically implausible cameras usually mean a wrong dot, not a
    // wrong solver — warn, don't block
    const G = window.SolarViz.buildingGeometry;
    const p = panel.pose;
    const h = p.pos[1] - building.solid.groundY;
    if (G.pointInPolygon(building.solid.footprint, p.pos[0], p.pos[2]) || h < -2 || h > 8) {
      flashWarn('This camera position looks implausible — check the dots or try Align view');
    }
    state.photoMatches[panel.im.id] = {
      imageSize: panel.imageSize,
      points: panel.working.map((w) => ({ id: w.id, px: w.px.slice() })),
      landmarks: panel.working.map((w) => ({ id: w.id, px: w.px.slice() })),
      pose: panel.pose,
    };
    building.save();
    rebuildFrustums();
    refreshList();
    closePanel();
  }

  // ------------------------------------------------------------------
  // Fly to a photo: camera to the solved pose + fov-matched cross-fade
  // ------------------------------------------------------------------
  let overlayEl = null;
  let savedFov = null;
  function closeOverlay() {
    if (overlayEl) { overlayEl.remove(); overlayEl = null; }
    if (savedFov !== null) {
      camera.fov = savedFov;
      camera.updateProjectionMatrix();
      savedFov = null;
    }
    frustumGroup.visible = true;
  }

  function flyToPhoto(imageId) {
    const m = state.photoMatches[imageId];
    const im = photos.find((p) => p.id === imageId);
    if (!m || !m.pose || !im) return;
    closeOverlay();
    // standing at the photographer's position: the frustum's thumbnail
    // sprite sits 1.5 m ahead and would exactly fill the view (untextured
    // it renders solid white) — hide frustums, and drop any floor
    // isolation so the whole model is comparable behind the photo
    if (building.selectFloor) building.selectFloor(null);
    frustumGroup.visible = false;
    const pose = m.pose;
    const pos = new THREE.Vector3(...pose.pos);
    const fwd = new THREE.Vector3(...PM.poseForward(pose));
    cameraAnimator.animateCamera(pos, pos.clone().add(fwd.multiplyScalar(12)));
    setTimeout(() => {
      savedFov = camera.fov;
      camera.fov = pose.fovV;
      camera.updateProjectionMatrix();
      overlayEl = document.createElement('div');
      overlayEl.className = 'pm-overlay';
      overlayEl.innerHTML = `
        <img src="${window.SolarViz.imageUrl(im)}" alt="">
        <div class="pm-overlay-bar">
          <span>photo over model — drag to compare</span>
          <input type="range" min="0" max="100" value="55">
          <button>Close</button>
        </div>`;
      const img = overlayEl.querySelector('img');
      img.style.opacity = 0.55;
      overlayEl.querySelector('input').addEventListener('input', (e) => {
        img.style.opacity = e.target.value / 100;
      });
      overlayEl.querySelector('button').addEventListener('click', closeOverlay);
      document.body.appendChild(overlayEl);
    }, 1200);
  }

  // frustum sprite clicks
  let downPos = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button === 0) downPos = { x: e.clientX, y: e.clientY };
  });
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (e.button !== 0 || !downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved > 6 || !frustumGroup.visible || planDraw.isActive()) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, view.camera);
    const sprites = [];
    frustumGroup.traverse((o) => { if (o.isSprite) sprites.push(o); });
    const hits = raycaster.intersectObjects(sprites, false);
    if (hits.length) flyToPhoto(hits[0].object.userData.imageId);
  });

  // solid rebuilt (footprint edit, settings change): landmarks moved —
  // re-solve accepted matches from their stored points
  building.addRebuildListener(() => {
    if (Object.values(state.photoMatches || {}).some(m=>m.roofNeedsReview)) { closePanel(); closeOverlay(); }
    refreshModelData();
    Object.keys(state.photoMatches).forEach((id) => {
      const m = state.photoMatches[id];
      if (m && m.landmarks && !m.roofNeedsReview) m.pose = solveMatch(m) || m.pose;
    });
    rebuildFrustums();
    refreshList();
    if (panel) solveWorking(true);
  });

  // solve stored/suggested matches once at startup so frustums appear
  photos.forEach((im) => {
    const saved = state.photoMatches[im.id];
    if (saved && saved.landmarks && !saved.pose && !saved.roofNeedsReview) saved.pose = solveMatch(saved);
  });
  rebuildFrustums();
  refreshList();

  function setActive(on) {
    if (!on) { closePanel(); closeOverlay(); }
  }

  return { setActive, flyToPhoto };
};
