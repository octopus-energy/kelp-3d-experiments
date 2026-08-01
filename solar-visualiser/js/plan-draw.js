// =====================================================================
// Shared plan-view drawing engine, extracted from the scaffold designer
// and reused by the building-model wall drawing.
//
// Owns the orthographic top-down camera, the draw banner, vertex
// markers/path/preview lines, and the pointer/keyboard handling
// (click = add vertex, Enter/dblclick = finish, Backspace = undo,
// v = plan/3d toggle, Esc = cancel). One drawing session at a time.
//
// A session configures what a click means:
//   begin({
//     title,               // banner title text
//     center: {x, z},      // ortho camera home position
//     pick(event) -> THREE.Vector3 | null,   // pointer -> world point
//     snap(p, verts) -> THREE.Vector3 | null // optional; null rejects
//     status(verts, previewPt) -> string,    // banner status text
//     onFinish(verts, {wasPlanMode}), onCancel(),
//     minVerts (default 2), markerColor,
//     keepView,            // keep the current ortho view (chained sessions)
//     startIn,             // 'plan' (default) or '3d'
//   })
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.createPlanDraw = function ({ scene, camera, view, renderer, controls }) {
  const banner = document.getElementById('draw-banner');
  const bannerTitle = document.getElementById('draw-banner-title');
  const bannerLen = document.getElementById('draw-banner-length');
  const planBtn = document.getElementById('draw-view-plan');
  const threeDBtn = document.getElementById('draw-view-3d');

  const drawGroup = new THREE.Group();
  scene.add(drawGroup);

  const pathMat = new THREE.LineBasicMaterial({ color: 0xf5b942 });
  const previewMat = new THREE.LineDashedMaterial({ color: 0xf5b942, dashSize: 0.5, gapSize: 0.3, transparent: true, opacity: 0.7 });
  const markerGeom = new THREE.SphereGeometry(0.22, 12, 8);

  // ------------------------------------------------------------------
  // Orthographic plan camera (true overhead, north up)
  // ------------------------------------------------------------------
  const orthoCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.5, 200);
  orthoCam.up.set(0, 0, -1);

  function resetOrtho(center) {
    orthoCam.position.set(center.x, 70, center.z);
    orthoCam.lookAt(center.x, 0, center.z);
    orthoCam.zoom = 1;
    orthoControls.target.set(center.x, 0, center.z);
    syncOrthoFrustum();
  }
  function syncOrthoFrustum() {
    const aspect = window.innerWidth / window.innerHeight;
    const half = 20; // metres of site visible vertically
    orthoCam.left = -half * aspect;
    orthoCam.right = half * aspect;
    orthoCam.top = half;
    orthoCam.bottom = -half;
    orthoCam.updateProjectionMatrix();
  }
  window.addEventListener('resize', () => { if (planMode) syncOrthoFrustum(); });

  const orthoControls = new THREE.OrbitControls(orthoCam, renderer.domElement);
  orthoControls.enableRotate = false;
  orthoControls.enableDamping = false;
  // left-drag pans (a no-move click still places a vertex)
  orthoControls.mouseButtons.LEFT = THREE.MOUSE.PAN;
  orthoControls.enabled = false;

  let planMode = false;
  function setViewMode(mode) {
    planMode = mode === 'plan' && !!session;
    if (planMode) {
      syncOrthoFrustum();
      view.camera = orthoCam;
      controls.enabled = false;
      orthoControls.enabled = true;
    } else {
      view.camera = camera;
      controls.enabled = true;
      orthoControls.enabled = false;
    }
    planBtn.classList.toggle('active', planMode);
    threeDBtn.classList.toggle('active', !planMode);
  }
  planBtn.addEventListener('click', () => setViewMode('plan'));
  threeDBtn.addEventListener('click', () => setViewMode('3d'));

  // ------------------------------------------------------------------
  // Session state
  // ------------------------------------------------------------------
  let session = null;
  let dverts = [];
  let pathLine = null, previewLine = null;
  let downPos = null;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  // Raycaster set from a pointer event and the active camera — sessions
  // use this inside their pick() implementations.
  function ray(e) {
    const rect = renderer.domElement.getBoundingClientRect();
    ndc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, view.camera);
    return raycaster;
  }

  const lifted = (v) => new THREE.Vector3(v.x, v.y + 0.15, v.z);

  function rebuildPathLine() {
    if (pathLine) { drawGroup.remove(pathLine); pathLine.geometry.dispose(); pathLine = null; }
    if (dverts.length >= 2) {
      pathLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(dverts.map(lifted)), pathMat);
      drawGroup.add(pathLine);
    }
  }

  function refreshStatus(previewPt) {
    if (!session) return;
    bannerLen.textContent = session.status ? session.status(dverts, previewPt || null) : '';
  }

  function addVertex(p) {
    if (session.snap) {
      p = session.snap(p, dverts);
      if (!p) return;
    }
    dverts.push(p);
    const m = new THREE.Mesh(markerGeom, session.markerMat);
    m.position.copy(lifted(p));
    m.userData.isMarker = true;
    drawGroup.add(m);
    rebuildPathLine();
    refreshStatus();
  }

  function undoVertex() {
    if (!dverts.length) return;
    dverts.pop();
    const markers = drawGroup.children.filter((c) => c.userData.isMarker);
    if (markers.length) drawGroup.remove(markers[markers.length - 1]);
    rebuildPathLine();
    refreshStatus();
  }

  function updatePreview(e) {
    if (previewLine) { drawGroup.remove(previewLine); previewLine.geometry.dispose(); previewLine = null; }
    let p = session.pick(e);
    if (p && session.snap) p = session.snap(p, dverts) || p;
    if (p && dverts.length) {
      const last = dverts[dverts.length - 1];
      previewLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints([lifted(last), lifted(p)]), previewMat);
      previewLine.computeLineDistances();
      drawGroup.add(previewLine);
    }
    refreshStatus(p);
  }

  function clearDrawGroup() {
    while (drawGroup.children.length) {
      const c = drawGroup.children[0];
      drawGroup.remove(c);
      if (c.geometry && c.geometry !== markerGeom) c.geometry.dispose();
    }
    pathLine = previewLine = null;
  }

  // opts.keepView: don't recentre the ortho camera (chained sessions);
  // opts.startIn: 'plan' (default) or '3d' — which view to open in.
  function begin(opts) {
    if (session) cancel();
    session = Object.assign({ minVerts: 2, markerColor: 0xf5b942 }, opts);
    session.markerMat = new THREE.MeshBasicMaterial({ color: session.markerColor });
    dverts = [];
    bannerTitle.textContent = session.title || 'Draw mode';
    banner.classList.add('visible');
    renderer.domElement.style.cursor = 'crosshair';
    refreshStatus();
    if (!session.keepView) resetOrtho(session.center);
    setViewMode(session.startIn || 'plan');
  }

  function teardown() {
    banner.classList.remove('visible');
    renderer.domElement.style.cursor = '';
    clearDrawGroup();
    if (session.markerMat) session.markerMat.dispose();
    session = null;
    dverts = [];
    setViewMode('3d');
  }

  function cancel() {
    if (!session) return;
    const cb = session.onCancel;
    teardown();
    if (cb) cb();
  }

  function finish() {
    if (!session) return;
    // Drop the duplicate vertex a double-click leaves behind.
    while (dverts.length >= 2 && dverts[dverts.length - 1].distanceTo(dverts[dverts.length - 2]) < 0.4) dverts.pop();
    if (dverts.length < session.minVerts) { cancel(); return; }
    const verts = dverts.slice();
    const cb = session.onFinish;
    const ctx = { wasPlanMode: planMode }; // so chained sessions can reopen the same view
    teardown();
    cb(verts, ctx);
  }

  renderer.domElement.addEventListener('pointerdown', (e) => {
    if (session && e.button === 0) downPos = { x: e.clientX, y: e.clientY };
  });
  renderer.domElement.addEventListener('pointerup', (e) => {
    if (!session || e.button !== 0 || !downPos) return;
    const moved = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
    downPos = null;
    if (moved > 6) return; // it was a drag (pan/orbit/zoom), not a click
    const p = session.pick(e);
    if (p) addVertex(p);
  });
  renderer.domElement.addEventListener('dblclick', () => { if (session) finish(); });
  renderer.domElement.addEventListener('pointermove', (e) => { if (session) updatePreview(e); });
  window.addEventListener('keydown', (e) => {
    if (!session) return;
    if (e.target && /^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName)) return;
    if (e.key === 'Escape') cancel();
    else if (e.key === 'Enter') finish();
    else if (e.key === 'Backspace') { e.preventDefault(); undoVertex(); }
    else if (e.key === 'v' || e.key === 'V') setViewMode(planMode ? '3d' : 'plan');
  });

  return {
    begin, finish, cancel, setViewMode, ray,
    isActive: () => !!session,
    inPlanMode: () => planMode,
  };
};
