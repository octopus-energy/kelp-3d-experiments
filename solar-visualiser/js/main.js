// =====================================================================
// Entry point: wires up data, scene, terrain, roofs/panels,
// obstructions, interactions and UI controls, then runs the render loop.
//
// Run inside a function so errors are caught and shown to the user.
// =====================================================================
(function () {
  function showError(msg) {
    document.getElementById('loader').style.display = 'none';
    const b = document.createElement('div');
    b.className = 'error-banner';
    b.textContent = msg;
    document.body.appendChild(b);
    console.error(msg);
  }

  window.addEventListener('error', (e) => showError('JS error: ' + e.message));

  try {
    if (typeof THREE === 'undefined') {
      showError('THREE.js failed to load.');
      return;
    }
    if (typeof THREE.OrbitControls === 'undefined') {
      showError('OrbitControls failed to load.');
      return;
    }
    const SITE_DATA = window.SITE_DATA;
    if (!SITE_DATA) { showError('Site data missing.'); return; }

    const setStatus = (s) => { document.getElementById('loader-status').textContent = s; };
    setStatus('Decoding DSM');

    const { coordinates } = window.SolarViz;
    const dsm = coordinates.decodeDSM(window.__DSM_B64__);
    const coords = coordinates.createCoordinateSystem(SITE_DATA, dsm);

    setStatus('Creating scene');
    const canvasWrap = document.getElementById('canvas-wrap');
    const { scene, camera, renderer, controls } = window.SolarViz.createSceneSetup(canvasWrap, coords);

    setStatus('Generating terrain');
    const { terrainMesh, matTextured, matSolid } = window.SolarViz.buildTerrain({
      siteData: SITE_DATA, dsm, coords,
      aerialDataUrl: window.__AERIAL_DATAURL__, renderer,
    });
    scene.add(terrainMesh);

    const roofGroup = new THREE.Group();
    const panelGroup = new THREE.Group();
    const obstructionGroup = new THREE.Group();
    const rejectedGroup = new THREE.Group();
    scene.add(roofGroup, panelGroup, obstructionGroup, rejectedGroup);

    setStatus('Drawing roof faces');
    // Default panel mounting lift (metres) — realistic for hooks + rails on a flush mount
    const PANEL_LIFT = 0.12;
    const hoverables = [];
    const cameraAnimator = window.SolarViz.createCameraAnimator(camera, controls);

    window.SolarViz.buildRoofFaces({
      siteData: SITE_DATA, coords,
      groups: { roofGroup, panelGroup, rejectedGroup },
      arrayListEl: document.getElementById('array-list'),
      hoverables, panelLift: PANEL_LIFT,
      animateCamera: cameraAnimator.animateCamera,
    });

    window.SolarViz.buildObstructions({ siteData: SITE_DATA, coords, group: obstructionGroup });
    obstructionGroup.visible = false;
    rejectedGroup.visible = false;

    // Property marker: a dashed vertical line up from the geocoded point
    const markerPos = new THREE.Vector3(
      coords.PROP_LOCAL_X,
      coords.sampleDSM(coords.PROP_LOCAL_X, coords.PROP_LOCAL_Y),
      coords.HEIGHT - coords.PROP_LOCAL_Y
    );
    const markerGeom = new THREE.BufferGeometry().setFromPoints([
      markerPos,
      new THREE.Vector3(coords.PROP_LOCAL_X, 50, coords.HEIGHT - coords.PROP_LOCAL_Y),
    ]);
    const markerLine = new THREE.Line(markerGeom, new THREE.LineDashedMaterial({
      color: 0xf5b942, dashSize: 0.8, gapSize: 0.4, transparent: true, opacity: 0.4,
    }));
    markerLine.computeLineDistances();
    scene.add(markerLine);

    window.SolarViz.setupHoverTooltip({
      camera, hoverables, tooltipEl: document.getElementById('tooltip'),
    });

    window.SolarViz.setupUIControls({
      terrainMesh, matTextured, matSolid,
      roofGroup, panelGroup, obstructionGroup, rejectedGroup, markerLine,
    });

    // Render loop
    const clock = new THREE.Clock();
    function animate() {
      requestAnimationFrame(animate);
      const dt = clock.getDelta();
      cameraAnimator.update(dt);
      controls.update();
      const angle = Math.atan2(camera.position.x - controls.target.x, camera.position.z - controls.target.z);
      const cr = document.getElementById('compass-rose');
      if (cr) cr.setAttribute('transform', `rotate(${(angle * 180/Math.PI).toFixed(1)})`);
      renderer.render(scene, camera);
    }

    window.addEventListener('resize', () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    });

    setStatus('Ready');
    setTimeout(() => document.getElementById('loader').classList.add('hidden'), 300);
    // Expose handles for inspection / external integrations
    window.__SOLAR_VIZ__ = { scene, camera, controls, renderer, panelGroup, roofGroup };
    animate();

  } catch (e) {
    showError('Init failed: ' + e.message + '\n' + e.stack);
  }
})();
