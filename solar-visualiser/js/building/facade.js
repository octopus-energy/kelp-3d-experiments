// =====================================================================
// Facade projection: bake accepted photo poses onto the wall panels and
// let the user draw window/door rectangles on the rectified result.
//
// Baking is an offline CPU pass per wall: every texel is a point on the
// wall plane, projected through each photo's pose into photo pixels,
// with a ray-cast against the solid's own triangles so walls don't
// receive pixels that belong to the wall in front of them. Because the
// bake lives in wall (u, v) space it drapes straight onto the existing
// wall geometry (ShapeGeometry uvs are shape coords), and survives
// window holes being punched later.
//
// The wall editor shows the baked texture flat with a metre grid — the
// photo does the measuring: a dragged rectangle IS the window in wall
// coordinates.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.setupFacade = function ({ renderer, view, building, photoMatch, imageData }) {
  const PM = window.SolarViz.buildingPhotoMatch;
  const $ = (id) => document.getElementById(id);
  const state = building.state;
  const base = (imageData && imageData.basePath) || '';
  const photosById = new Map(((imageData && imageData.images) || []).map((im) => [im.id, im]));

  const RES = 40;          // texels per metre
  const texToggle = $('bm-facade-tex');
  const drawBtn = $('bm-facade-draw');

  // ------------------------------------------------------------------
  // Photo pixel access (one ImageData per matched photo, lazy)
  // ------------------------------------------------------------------
  const photoData = new Map(); // imageId -> { data, W, H } | 'loading'
  function ensurePhoto(imageId, onReady) {
    const cur = photoData.get(imageId);
    if (cur && cur !== 'loading') { onReady(); return; }
    if (cur === 'loading') return;
    const im = photosById.get(imageId);
    if (!im) return;
    photoData.set(imageId, 'loading');
    const img = new Image();
    img.onload = () => {
      const c = document.createElement('canvas');
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const ctx = c.getContext('2d');
      ctx.drawImage(img, 0, 0);
      photoData.set(imageId, {
        data: ctx.getImageData(0, 0, c.width, c.height),
        W: c.width, H: c.height,
      });
      onReady();
    };
    img.src = window.SolarViz.imageUrl(im);
  }

  // ------------------------------------------------------------------
  // Occlusion: Möller–Trumbore against the solid's triangle soup
  // ------------------------------------------------------------------
  function rayBlocked(solid, ox, oy, oz, dx, dy, dz, maxT) {
    const V = solid.verts, T = solid.tris;
    for (let i = 0; i < T.length; i++) {
      const a = V[T[i][0]], b = V[T[i][1]], c = V[T[i][2]];
      const e1x = b.x - a.x, e1y = b.y - a.y, e1z = b.z - a.z;
      const e2x = c.x - a.x, e2y = c.y - a.y, e2z = c.z - a.z;
      const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
      const det = e1x * px + e1y * py + e1z * pz;
      if (Math.abs(det) < 1e-9) continue;
      const inv = 1 / det;
      const tx = ox - a.x, ty = oy - a.y, tz = oz - a.z;
      const u = (tx * px + ty * py + tz * pz) * inv;
      if (u < -1e-4 || u > 1.0001) continue;
      const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
      const v = (dx * qx + dy * qy + dz * qz) * inv;
      if (v < -1e-4 || u + v > 1.0001) continue;
      const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
      if (t > 0.08 && t < maxT - 0.08) return true;
    }
    return false;
  }

  // ------------------------------------------------------------------
  // Bake one wall from every accepted match (best rmse first)
  // ------------------------------------------------------------------
  function bakeWall(solid, w, matches) {
    // cover the full stepped/gable top profile, not just the end heights
    const top = Math.max(...(w.topProfile ? w.topProfile.map((p) => p[1]) : [w.topA, w.topB]));
    // per-wall vertical sampling nudge: when pose and geometry disagree
    // by a few centimetres the eave band samples roof pixels — shifting
    // the sampling height moves the photo up/down on this wall only
    const dv = (state.facadeAdjust && state.facadeAdjust[w.id]) || 0;
    const cw = Math.max(4, Math.min(768, Math.round(w.len * RES)));
    const ch = Math.max(4, Math.min(768, Math.round((top - w.bottom) * RES)));
    const canvas = document.createElement('canvas');
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d');
    const out = ctx.createImageData(cw, ch);
    const od = out.data;

    matches.forEach(({ pose, imageId }) => {
      const ph = photoData.get(imageId);
      if (!ph || ph === 'loading') return;
      // whole-wall facing check: skip photos looking at the back
      const mx = (w.a2[0] + w.b2[0]) / 2, mz = (w.a2[1] + w.b2[1]) / 2;
      const toCam = [pose.pos[0] - mx, pose.pos[2] - mz];
      if (toCam[0] * w.normal[0] + toCam[1] * w.normal[1] <= 0) return;

      for (let cy = 0; cy < ch; cy++) {
        const v = top - ((cy + 0.5) / ch) * (top - w.bottom);
        for (let cx = 0; cx < cw; cx++) {
          const oi = (cy * cw + cx) * 4;
          if (od[oi + 3] > 0) continue;   // already filled by a better photo
          const u = ((cx + 0.5) / cw) * w.len;
          const px3 = w.a2[0] + w.dir[0] * u + w.normal[0] * 0.03;
          const pz3 = w.a2[1] + w.dir[1] * u + w.normal[1] * 0.03;
          const uv = PM.projectPoint(pose, [ph.W, ph.H], [px3, v + dv, pz3]);
          if (!uv || uv[0] < 0 || uv[1] < 0 || uv[0] >= ph.W || uv[1] >= ph.H) continue;
          const ddx = pose.pos[0] - px3, ddy = pose.pos[1] - v, ddz = pose.pos[2] - pz3;
          const dist = Math.hypot(ddx, ddy, ddz);
          if (rayBlocked(solid, px3, v, pz3, ddx / dist, ddy / dist, ddz / dist, dist)) continue;
          const si = ((uv[1] | 0) * ph.W + (uv[0] | 0)) * 4;
          od[oi] = ph.data.data[si];
          od[oi + 1] = ph.data.data[si + 1];
          od[oi + 2] = ph.data.data[si + 2];
          od[oi + 3] = 255;
        }
      }
    });
    ctx.putImageData(out, 0, 0);
    return { canvas, len: w.len, bottom: w.bottom, top };
  }

  // ------------------------------------------------------------------
  // Apply / remove baked textures on the shell wall meshes
  // ------------------------------------------------------------------
  let bakes = new Map();        // wallId -> bake
  let facadeMats = new Map();   // wallId -> material
  let active = false;

  function acceptedMatches() {
    return Object.entries(state.photoMatches || {})
      .filter(([, m]) => m && m.pose && !m.roofNeedsReview)
      .map(([imageId, m]) => ({ imageId, pose: m.pose }))
      .sort((a, b) => (a.pose.rmse || 1e9) - (b.pose.rmse || 1e9));
  }

  function applyTextures() {
    const solid = building.solid;
    const shell = building.shell;
    if (!solid || !shell) return;
    const matches = acceptedMatches();
    bakes = new Map();
    clearMats();
    shell.wallMeshes.forEach((mesh) => {
      const w = solid.wallPanels.find((p) => p.id === mesh.userData.wallId);
      if (!w) return;
      const bake = bakeWall(solid, w, matches);
      bakes.set(w.id, bake);
      const tex = new THREE.CanvasTexture(bake.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      // ShapeGeometry uvs are wall metres — map them onto [0,1]
      tex.repeat.set(1 / bake.len, 1 / (bake.top - bake.bottom));
      tex.offset.set(0, -bake.bottom / (bake.top - bake.bottom));
      const mat = new THREE.MeshStandardMaterial({
        map: tex, color: 0xffffff, roughness: 0.9, metalness: 0,
        side: THREE.DoubleSide,
      });
      facadeMats.set(w.id, mat);
      mesh.material = mat;
    });
  }

  function clearMats() {
    const shell = building.shell;
    if (shell) {
      shell.wallMeshes.forEach((mesh) => {
        if (facadeMats.has(mesh.userData.wallId)) mesh.material = building.mats.wall;
      });
    }
    facadeMats.forEach((m) => {
      if (m.map) m.map.dispose();
      m.dispose();
    });
    facadeMats = new Map();
  }

  function setTextured(on) {
    active = on;
    if (!on) { clearMats(); return; }
    const matches = acceptedMatches();
    if (!matches.length) { clearMats(); texToggle.checked = false; active = false; return; }
    let pending = matches.length;
    matches.forEach((m) => ensurePhoto(m.imageId, () => {
      pending--;
      if (pending === 0) applyTextures();
    }));
    // ensurePhoto calls back synchronously for already-loaded photos
    if (matches.every((m) => photoData.get(m.imageId) && photoData.get(m.imageId) !== 'loading')) {
      applyTextures();
    }
  }
  texToggle.addEventListener('change', (e) => setTextured(e.target.checked));

  building.addRebuildListener(() => { if (active) setTextured(true); });

  // Re-bake one wall (after a texture nudge) and swap its live texture.
  function rebakeWall(wallId) {
    const solid = building.solid;
    const w = solid && solid.wallPanels.find((p) => p.id === wallId);
    if (!w) return null;
    const bake = bakeWall(solid, w, acceptedMatches());
    bakes.set(wallId, bake);
    const mat = facadeMats.get(wallId);
    if (mat) {
      if (mat.map) mat.map.dispose();
      const tex = new THREE.CanvasTexture(bake.canvas);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.repeat.set(1 / bake.len, 1 / (bake.top - bake.bottom));
      tex.offset.set(0, -bake.bottom / (bake.top - bake.bottom));
      mat.map = tex;
      mat.needsUpdate = true;
    }
    return bake;
  }

  // ------------------------------------------------------------------
  // Wall editor: draw window/door rectangles on the rectified facade
  // ------------------------------------------------------------------
  let picking = false;
  let editor = null;  // { el, wallId, bake, scale, drag, rect }

  drawBtn.addEventListener('click', () => {
    picking = !picking;
    drawBtn.classList.toggle('active', picking);
    drawBtn.textContent = picking ? 'Now click a wall in the 3D view…' : 'Draw windows on a wall…';
    renderer.domElement.style.cursor = picking ? 'crosshair' : '';
  });

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  let downPos = null;
  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (e.button === 0) downPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!picking || e.button !== 0 || !downPos) return;
    if (Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y) > 6) return;
    const shell = building.shell;
    if (!shell) return;
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, view.camera);
    const hits = raycaster.intersectObjects(shell.wallMeshes, false);
    if (!hits.length) return;
    picking = false;
    drawBtn.classList.remove('active');
    drawBtn.textContent = 'Draw windows on a wall…';
    renderer.domElement.style.cursor = '';
    openEditor(hits[0].object.userData.wallId);
  });

  function closeEditor() {
    if (editor) { editor.el.remove(); editor = null; }
  }

  function openEditor(wallId) {
    closeEditor();
    const solid = building.solid;
    const w = solid.wallPanels.find((p) => p.id === wallId);
    if (!w) return;
    let bake = bakes.get(wallId);
    if (!bake) {
      const matches = acceptedMatches();
      bake = bakeWall(solid, w, matches);
      bakes.set(wallId, bake);
      // photo pixels load lazily — if they weren't in yet (texture
      // toggle never used), re-bake once they arrive
      matches.forEach((m) => ensurePhoto(m.imageId, () => {
        if (!editor || editor.wallId !== wallId) return;
        const fresh = rebakeWall(wallId);
        if (fresh) { editor.bake = fresh; drawEditor(); }
      }));
    }
    const scale = Math.min(640 / bake.len, 300 / (bake.top - bake.bottom));
    const cw = Math.round(bake.len * scale), ch = Math.round((bake.top - bake.bottom) * scale);
    const el = document.createElement('div');
    el.className = 'pm-panel';
    el.innerHTML = `
      <div class="pm-head">
        <span class="pm-title">Wall — drag a rectangle over a window or door</span>
        <span class="pm-stats">${w.len.toFixed(1)} m wide</span>
        <button class="pm-x" title="Close">×</button>
      </div>
      <div class="pm-body">
        <canvas class="fc-canvas" width="${cw}" height="${ch}"></canvas>
        <span class="fc-confirm" style="display:none">
          <button class="fc-win">Window</button>
          <button class="fc-door">Door</button>
          <button class="fc-cancel">✕</button>
        </span>
      </div>
      <div class="pm-foot">
        <button class="fc-nudge fc-up" title="Shift this wall's photo up 5 cm">photo ▲</button>
        <button class="fc-nudge fc-down" title="Shift this wall's photo down 5 cm">photo ▼</button>
        <span class="pm-hint">drag a rectangle over a window or door — the grid is 1 m</span>
      </div>`;
    document.body.appendChild(el);
    editor = { el, wallId, bake, scale, drag: null, rect: null };
    el.querySelector('.pm-x').addEventListener('click', closeEditor);
    el.querySelector('.fc-cancel').addEventListener('click', () => {
      editor.rect = null;
      el.querySelector('.fc-confirm').style.display = 'none';
      drawEditor();
    });
    el.querySelector('.fc-win').addEventListener('click', () => commitRect('window'));
    el.querySelector('.fc-door').addEventListener('click', () => commitRect('door'));
    el.querySelector('.fc-up').addEventListener('click', () => nudgeTexture(0.05));
    el.querySelector('.fc-down').addEventListener('click', () => nudgeTexture(-0.05));
    const canvas = el.querySelector('canvas');
    canvas.addEventListener('pointerdown', (e) => {
      const r = canvas.getBoundingClientRect();
      editor.drag = [e.clientX - r.left, e.clientY - r.top];
      editor.rect = null;
    });
    canvas.addEventListener('pointermove', (e) => {
      if (!editor || !editor.drag) return;
      const r = canvas.getBoundingClientRect();
      editor.rect = [...editor.drag, e.clientX - r.left, e.clientY - r.top];
      drawEditor();
    });
    window.addEventListener('pointerup', onEditorUp);
    drawEditor();
  }

  function onEditorUp() {
    if (!editor || !editor.drag) return;
    editor.drag = null;
    const r = editor.rect;
    // metric threshold: an opening smaller than 25 cm is a slip, whatever
    // the on-screen scale of this wall
    const big = r && Math.abs(r[2] - r[0]) / editor.scale > 0.25 &&
      Math.abs(r[3] - r[1]) / editor.scale > 0.25;
    const conf = editor.el.querySelector('.fc-confirm');
    if (big) {
      // the chooser floats right next to the rectangle just drawn
      const canvas = editor.el.querySelector('canvas');
      conf.style.display = '';
      conf.style.left = (canvas.offsetLeft + Math.min(Math.max(r[0], r[2]) + 8, canvas.width - 140)) + 'px';
      conf.style.top = (canvas.offsetTop + Math.max(4, Math.min(r[1], r[3]))) + 'px';
    } else {
      conf.style.display = 'none';
      editor.rect = null;
    }
    drawEditor();
  }

  // per-wall vertical photo adjustment, persisted with the model
  function nudgeTexture(dm) {
    if (!editor) return;
    if (!state.facadeAdjust) state.facadeAdjust = {};
    state.facadeAdjust[editor.wallId] = (state.facadeAdjust[editor.wallId] || 0) + dm;
    building.save();
    const bake = rebakeWall(editor.wallId);
    if (bake) editor.bake = bake;
    drawEditor();
  }

  function rectToWall() {
    const { rect, scale, bake } = editor;
    const x0 = Math.min(rect[0], rect[2]) / scale, x1 = Math.max(rect[0], rect[2]) / scale;
    const yTop = Math.min(rect[1], rect[3]) / scale, yBot = Math.max(rect[1], rect[3]) / scale;
    return {
      u: (x0 + x1) / 2,
      width: x1 - x0,
      sill: (bake.top - yBot) - bake.bottom,
      height: yBot - yTop,
    };
  }

  function commitRect(kind) {
    if (!editor || !editor.rect) return;
    const r = rectToWall();
    if (kind === 'door') r.sill = 0;
    const added = building.addWindow(Object.assign({ wallId: editor.wallId, kind }, r));
    editor.rect = null;
    editor.el.querySelector('.fc-confirm').style.display = 'none';
    drawEditor();
    if (!added) {
      const f = document.createElement('div');
      f.className = 'bm-flash';
      f.textContent = 'Could not place it there (overlaps another opening?)';
      document.body.appendChild(f);
      setTimeout(() => f.remove(), 2500);
    }
  }

  function drawEditor() {
    const { el, bake, scale, wallId } = editor;
    const canvas = el.querySelector('canvas');
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = '#20242c';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bake.canvas, 0, 0, canvas.width, canvas.height);
    // metre grid
    ctx.strokeStyle = 'rgba(255,255,255,0.13)';
    ctx.lineWidth = 1;
    for (let m = 1; m < bake.len; m++) {
      ctx.beginPath(); ctx.moveTo(m * scale, 0); ctx.lineTo(m * scale, canvas.height); ctx.stroke();
    }
    for (let m = 1; m < bake.top - bake.bottom; m++) {
      const y = canvas.height - m * scale;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); ctx.stroke();
    }
    // grey out the sky above the wall's top profile — the canvas is
    // rectangular, a gable wall isn't
    const wp = building.solid && building.solid.wallPanels.find((p) => p.id === wallId);
    if (wp && wp.topProfile) {
      ctx.fillStyle = 'rgba(10, 12, 16, 0.75)';
      ctx.beginPath();
      ctx.moveTo(0, 0);
      wp.topProfile.forEach(([u, y]) => {
        ctx.lineTo(u * scale, canvas.height - (y - bake.bottom) * scale);
      });
      ctx.lineTo(canvas.width, 0);
      ctx.closePath();
      ctx.fill();
    }
    // existing openings on this wall (sill is level-relative)
    ctx.strokeStyle = '#37b24d';
    ctx.lineWidth = 2;
    (state.windows || []).filter((win) => win.wallId === wallId).forEach((win) => {
      const lv = building.levels[Math.min(win.levelIdx, building.levels.length - 1)];
      const v0 = (lv ? lv.slabTopY : bake.bottom) + win.sill - bake.bottom;
      const x = (win.u - win.width / 2) * scale;
      ctx.strokeRect(x, canvas.height - (v0 + win.height) * scale,
        win.width * scale, win.height * scale);
    });
    // rectangle being drawn (with live dimensions)
    if (editor.rect) {
      const r = editor.rect;
      ctx.strokeStyle = '#f5b942';
      ctx.setLineDash([5, 3]);
      ctx.strokeRect(Math.min(r[0], r[2]), Math.min(r[1], r[3]),
        Math.abs(r[2] - r[0]), Math.abs(r[3] - r[1]));
      ctx.setLineDash([]);
      const wm = (Math.abs(r[2] - r[0]) / scale).toFixed(2);
      const hm = (Math.abs(r[3] - r[1]) / scale).toFixed(2);
      ctx.fillStyle = '#f5b942';
      ctx.font = '12px monospace';
      ctx.fillText(`${wm} × ${hm} m`, Math.min(r[0], r[2]) + 4, Math.min(r[1], r[3]) - 5);
    }
  }

  return {
    setActive: (on) => {
      if (!on) { closeEditor(); if (active) { texToggle.checked = false; setTextured(false); } }
    },
  };
};
