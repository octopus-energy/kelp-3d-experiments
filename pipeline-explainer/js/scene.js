// =====================================================================
// three.js scene for the explainer: morphable terrain (flat photo ->
// DSM relief), overlay builders for detections / OS outlines / roof
// faces / panels / obstructions, an HTML label layer, and camera tweens.
//
// Scene axes match the solar-visualiser: X=east, Y=up, Z=south.
// =====================================================================
window.PE = window.PE || {};

window.PE.createScene = function (data, container) {
  const { dsm, coords, groundLevel } = data;
  const W = coords.WIDTH, H = coords.HEIGHT;

  // ---- renderer / scene / camera -----------------------------------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  if (THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;
  container.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0d10);
  scene.fog = new THREE.Fog(0x0b0d10, 220, 420);

  const camera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(W / 2, groundLevel + 78, H / 2 + 0.01);

  const controls = new THREE.OrbitControls(camera, renderer.domElement);
  controls.target.set(W / 2, groundLevel, H / 2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.update();

  scene.add(new THREE.AmbientLight(0xffffff, 0.75));
  const sun = new THREE.DirectionalLight(0xfff4e0, 1.4);
  sun.position.set(W / 2 - 60, 120, H / 2 + 40); // sun roughly in the south-west
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xbfd4ff, 0.4);
  fill.position.set(W / 2 + 50, 80, H / 2 - 60);
  scene.add(fill);

  // ---- morphable terrain -------------------------------------------
  const SEG = dsm.ncols - 1;
  const geom = new THREE.PlaneGeometry(W, H, SEG, SEG);
  geom.rotateX(-Math.PI / 2);
  geom.translate(W / 2, 0, H / 2);
  const pos = geom.attributes.position;
  const dsmHeights = new Float32Array(pos.count);
  for (let r = 0; r < dsm.nrows; r++) {
    for (let c = 0; c < dsm.ncols; c++) {
      const idx = r * dsm.ncols + c;
      const elev = dsm.grid[idx];
      dsmHeights[idx] = isFinite(elev) && elev !== dsm.nodata ? elev : groundLevel;
    }
  }
  let morphT = 0;
  function setMorph(t) {
    morphT = t;
    for (let i = 0; i < pos.count; i++) {
      pos.setY(i, groundLevel * (1 - t) + dsmHeights[i] * t);
    }
    pos.needsUpdate = true;
    geom.computeVertexNormals();
  }
  setMorph(0);

  // Drape the aerial photo using the image bounding box.
  const bbox = data.siteData.image_bounding_box;
  const [ix0, iy0] = coords.lonLatToLocal(bbox[0], bbox[1]);
  const [ix1, iy1] = coords.lonLatToLocal(bbox[2], bbox[3]);
  const uv = geom.attributes.uv;
  for (let i = 0; i < pos.count; i++) {
    const localEast = pos.getX(i);
    const localNorth = H - pos.getZ(i);
    uv.setXY(i, (localEast - ix0) / (ix1 - ix0), (localNorth - iy0) / (iy1 - iy0));
  }
  uv.needsUpdate = true;

  const aerialTex = new THREE.TextureLoader().load(window.__AERIAL_DATAURL__);
  if (THREE.SRGBColorSpace) aerialTex.colorSpace = THREE.SRGBColorSpace;
  aerialTex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  const terrainMat = new THREE.MeshStandardMaterial({ map: aerialTex, roughness: 0.95, metalness: 0 });
  const terrain = new THREE.Mesh(geom, terrainMat);
  scene.add(terrain);

  // ---- coordinate + colour helpers ---------------------------------
  const toScene = (x, y, z) => new THREE.Vector3(x, z, H - y);

  const FACE_COLOURS = { e: 0x4dabf7, s: 0xff922b, n: 0x845ef7, w: 0x20c997 };
  function faceColour(azimuth) {
    // azimuth: degrees from due south, negative = east of south
    const a = ((azimuth % 360) + 360) % 360; // 0..360, 0=S, 90=W, 180=N, 270=E
    if (a >= 315 || a < 45) return FACE_COLOURS.s;
    if (a < 135) return FACE_COLOURS.w;
    if (a < 225) return FACE_COLOURS.n;
    return FACE_COLOURS.e;
  }

  // ---- generic builders --------------------------------------------
  // Triangulated fill that respects concave outlines (dormer notches,
  // staircase CV polygons). footprint2D provides the triangulation
  // domain; vectors are the corresponding 3D vertices.
  function polyGeometry(vectors, footprint2D) {
    const tris = PE.geom.triangulate(footprint2D);
    const verts = [];
    for (const [a, b, c] of tris) verts.push(vectors[a], vectors[b], vectors[c]);
    const g = new THREE.BufferGeometry().setFromPoints(verts);
    g.computeVertexNormals();
    return g;
  }

  function lineLoop(vectors, colour, { dashed = false, opacity = 1, linewidth = 1 } = {}) {
    const pts = vectors.concat([vectors[0]]);
    const g = new THREE.BufferGeometry().setFromPoints(pts);
    const mat = dashed
      ? new THREE.LineDashedMaterial({ color: colour, dashSize: 1.2, gapSize: 0.7, transparent: true, opacity })
      : new THREE.LineBasicMaterial({ color: colour, transparent: true, opacity, linewidth });
    const line = new THREE.Line(g, mat);
    if (dashed) line.computeLineDistances();
    return line;
  }

  // Bold flat outline drawn as a ribbon of triangles — WebGL lines are
  // capped at 1px, so emphasised outlines (the OS boundaries, the CV
  // crop) are built as geometry instead. Optionally dashed.
  function outlineRibbon(footprint, colour, { width = 0.45, lift = 0.12, opacity = 0.9, dash = 0, gap = 0 } = {}) {
    const y = groundLevel + lift;
    const verts = [];
    const n = footprint.length;
    const emit = (a, b) => {
      const ex = b[0] - a[0], ey = b[1] - a[1];
      const len = Math.hypot(ex, ey) || 1;
      const nx = (-ey / len) * (width / 2), ny = (ex / len) * (width / 2);
      const q = [
        toScene(a[0] + nx, a[1] + ny, y), toScene(a[0] - nx, a[1] - ny, y),
        toScene(b[0] - nx, b[1] - ny, y), toScene(b[0] + nx, b[1] + ny, y),
      ];
      verts.push(q[0], q[1], q[2], q[0], q[2], q[3]);
    };
    for (let i = 0; i < n; i++) {
      const a = footprint[i], b = footprint[(i + 1) % n];
      if (!dash) {
        emit(a, b);
        continue;
      }
      const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const ux = (b[0] - a[0]) / len, uy = (b[1] - a[1]) / len;
      for (let t = 0; t < len; t += dash + gap) {
        const t2 = Math.min(len, t + dash);
        emit([a[0] + ux * t, a[1] + uy * t], [a[0] + ux * t2, a[1] + uy * t2]);
      }
    }
    // square pads at the vertices so solid joins don't show gaps
    if (!dash) {
      for (const [px, py] of footprint) {
        const h = width / 2;
        verts.push(
          toScene(px - h, py - h, y), toScene(px + h, py - h, y), toScene(px + h, py + h, y),
          toScene(px - h, py - h, y), toScene(px + h, py + h, y), toScene(px - h, py + h, y)
        );
      }
    }
    const g = new THREE.BufferGeometry().setFromPoints(verts);
    return new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity, side: THREE.DoubleSide, depthWrite: false }));
  }

  // Flat overlay polygon (drawn on the 2D photo before the world goes 3D)
  function flatPoly(footprint, colour, { fillOpacity = 0.22, lineOpacity = 0.95, lift = 0.1 } = {}) {
    const y = groundLevel + lift;
    const vecs = footprint.map(([px, py]) => toScene(px, py, y));
    const grp = new THREE.Group();
    const fill = new THREE.Mesh(
      polyGeometry(vecs, footprint),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: fillOpacity, side: THREE.DoubleSide, depthWrite: false })
    );
    grp.add(fill);
    grp.add(lineLoop(vecs, colour, { opacity: lineOpacity }));
    return grp;
  }

  // 3D polygon from points carrying elevations, lifted slightly along +Y
  function poly3D(points, colour, { fillOpacity = 0.4, lineOpacity = 1, lift = 0.15 } = {}) {
    const vecs = points.map((p) => toScene(p.x, p.y, p.z + lift));
    const grp = new THREE.Group();
    const fill = new THREE.Mesh(
      polyGeometry(vecs, points.map((p) => [p.x, p.y])),
      new THREE.MeshBasicMaterial({ color: colour, transparent: true, opacity: fillOpacity, side: THREE.DoubleSide, depthWrite: false })
    );
    grp.add(fill);
    grp.add(lineLoop(vecs, colour, { opacity: lineOpacity }));
    return grp;
  }

  // ---- persistent groups -------------------------------------------
  const groups = {};
  for (const name of ['detections', 'os', 'roofs3D', 'panels3D', 'obstructions3D', 'planeFit', 'layout3D', 'shading']) {
    const g = new THREE.Group();
    g.visible = false;
    scene.add(g);
    groups[name] = g;
  }

  // Remember every material's authored opacity so groups can be faded.
  function catalogueOpacity(root) {
    root.traverse((o) => {
      if (o.material && o.userData.baseOpacity === undefined) {
        o.userData.baseOpacity = o.material.opacity;
        o.material.transparent = true;
      }
    });
  }
  function setGroupFade(group, t) {
    group.traverse((o) => {
      if (o.material && o.userData.baseOpacity !== undefined) {
        o.material.opacity = o.userData.baseOpacity * t;
      }
    });
  }

  // ---- HTML labels --------------------------------------------------
  const labelLayer = document.getElementById('labels');
  const labels = []; // {el, pos, group}
  function addLabel(text, pos3, { cls = '', group = 'default' } = {}) {
    const el = document.createElement('div');
    el.className = 'viz-label' + (cls ? ' ' + cls : '');
    el.innerHTML = text;
    labelLayer.appendChild(el);
    labels.push({ el, pos: pos3, group });
    return el;
  }
  function clearLabels(group) {
    for (let i = labels.length - 1; i >= 0; i--) {
      if (!group || labels[i].group === group) {
        labels[i].el.remove();
        labels.splice(i, 1);
      }
    }
  }
  const projV = new THREE.Vector3();
  function updateLabels() {
    for (const l of labels) {
      projV.copy(l.pos).project(camera);
      const behind = projV.z > 1;
      if (behind || projV.x < -1.05 || projV.x > 1.05 || projV.y < -1.05 || projV.y > 1.05) {
        l.el.style.display = 'none';
        continue;
      }
      l.el.style.display = '';
      l.el.style.left = ((projV.x + 1) / 2) * window.innerWidth + 'px';
      l.el.style.top = ((1 - projV.y) / 2) * window.innerHeight + 'px';
    }
  }

  // ---- animation engine --------------------------------------------
  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const tweens = [];
  function tween({ duration = 1000, onUpdate, onDone, easing = ease }) {
    tweens.push({ t0: performance.now(), duration, onUpdate, onDone, easing });
  }
  function flyTo(posTarget, lookTarget, duration = 1400) {
    const p0 = camera.position.clone();
    const t0 = controls.target.clone();
    tween({
      duration,
      onUpdate: (k) => {
        camera.position.lerpVectors(p0, posTarget, k);
        controls.target.lerpVectors(t0, lookTarget, k);
      },
    });
  }
  function animateMorph(target, duration = 2200) {
    const start = morphT;
    tween({ duration, onUpdate: (k) => setMorph(start + (target - start) * k) });
  }
  function fadeGroup(group, target, duration = 700, { hideAfter = false } = {}) {
    catalogueOpacity(group);
    group.visible = true;
    const startVals = [];
    group.traverse((o) => {
      if (o.material && o.userData.baseOpacity !== undefined) {
        startVals.push({ o, from: o.material.opacity / (o.userData.baseOpacity || 1) });
      }
    });
    const from = startVals.length ? startVals[0].from : 1 - target;
    tween({
      duration,
      onUpdate: (k) => setGroupFade(group, from + (target - from) * k),
      onDone: () => { if (hideAfter && target === 0) group.visible = false; },
    });
  }

  const frameHooks = [];
  function onFrame(fn) { frameHooks.push(fn); }

  function renderLoop() {
    requestAnimationFrame(renderLoop);
    const now = performance.now();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const tw = tweens[i];
      let k = (now - tw.t0) / tw.duration;
      if (k >= 1) k = 1;
      tw.onUpdate(tw.easing(k));
      if (k === 1) {
        tweens.splice(i, 1);
        if (tw.onDone) tw.onDone();
      }
    }
    for (const fn of frameHooks) fn(now);
    controls.update();
    updateLabels();
    renderer.render(scene, camera);
  }

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return {
    scene, camera, controls, renderer, groups, terrain,
    toScene, faceColour, flatPoly, poly3D, lineLoop, polyGeometry, outlineRibbon,
    setMorph, animateMorph, flyTo, tween, fadeGroup, setGroupFade, catalogueOpacity,
    addLabel, clearLabels, onFrame, renderLoop,
    get morphT() { return morphT; },
  };
};
