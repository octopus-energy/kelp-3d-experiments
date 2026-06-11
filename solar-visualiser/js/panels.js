// =====================================================================
// Solar panel meshes (+ edge outlines) for a single roof face's array,
// and the live "panel mounting lift" update used by the UI slider.
// =====================================================================
window.SolarViz = window.SolarViz || {};

// Builds a mesh + edge outline for each panel in `panels`, sitting on
// the roof face's fitted `plane` and lifted off the roof by `panelLift`
// metres. Adds everything to `panelGroup` and pushes panel meshes onto
// `hoverables` for tooltip raycasting.
window.SolarViz.buildPanelsForArray = function ({ panels, plane, lonLatToSceneXZ, panelLift, panelGroup, hoverables }) {
  panels.forEach((panel) => {
    const panelRing = panel.geometry.coordinates[0];
    const panelXZ = panelRing.map(p => lonLatToSceneXZ(p[0], p[1]));

    // Store the base (un-lifted) corner positions on the fitted plane.
    // We add the lift along the plane's normal at render time via a helper.
    const baseCorners = [];
    for (let i = 0; i < 4; i++) {
      const [x, z] = panelXZ[i];
      baseCorners.push({ x, z, baseY: plane.getHeight(x, z) });
    }

    const panelGeom = new THREE.BufferGeometry();
    const verts = new Float32Array(12);
    for (let i = 0; i < 4; i++) {
      const bc = baseCorners[i];
      verts[i*3]   = bc.x;
      verts[i*3+1] = bc.baseY + panelLift;
      verts[i*3+2] = bc.z;
    }
    panelGeom.setAttribute('position', new THREE.BufferAttribute(verts, 3));
    panelGeom.setIndex([0, 1, 2, 0, 2, 3]);
    panelGeom.computeVertexNormals();

    const sf = panel.shading_factor;
    const col = new THREE.Color().setHSL(0.58, 0.5, 0.15 + (sf - 0.7) * 0.35);
    const panelMat = new THREE.MeshStandardMaterial({
      color: col, metalness: 0.75, roughness: 0.22,
      side: THREE.DoubleSide,
      emissive: col.clone().multiplyScalar(0.18),
      // Polygon offset pulls fragments forward so we win the depth
      // test against the noisy DSM beneath, regardless of camera angle
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    });
    const panelMesh = new THREE.Mesh(panelGeom, panelMat);
    panelMesh.castShadow = true;
    panelMesh.renderOrder = 3;
    panelMesh.userData = {
      type: 'panel',
      baseCorners,
      manufacturer: panel.panel.manufacturer,
      model: panel.panel.model,
      ratedPower: panel.panel.rated_power_watts,
      annualOutput: panel.annual_output,
      shadingFactor: panel.shading_factor,
      orientation: panel.orientation,
      scaffold: panel.scaffoldability,
    };
    hoverables.push(panelMesh);
    panelGroup.add(panelMesh);

    // Edge lines around the panel, also lifted and depth-biased
    const edgeGeom = new THREE.BufferGeometry();
    const ev = new Float32Array(15);
    for (let i = 0; i < 4; i++) {
      const bc = baseCorners[i];
      ev[i*3]   = bc.x;
      ev[i*3+1] = bc.baseY + panelLift + 0.005;
      ev[i*3+2] = bc.z;
    }
    // close the loop
    ev[12] = ev[0]; ev[13] = ev[1]; ev[14] = ev[2];
    edgeGeom.setAttribute('position', new THREE.BufferAttribute(ev, 3));
    const edgeMat = new THREE.LineBasicMaterial({
      color: 0x5ec8ca, transparent: true, opacity: 0.7,
    });
    const edgeLine = new THREE.Line(edgeGeom, edgeMat);
    edgeLine.userData = { type: 'panel-edge', baseCorners };
    edgeLine.renderOrder = 4;
    panelGroup.add(edgeLine);
  });
};

// Re-positions every panel + edge outline in `panelGroup` to sit
// `liftMetres` above the roof plane. Called when the "panel mounting
// lift" slider changes.
window.SolarViz.updatePanelLift = function (panelGroup, liftMetres) {
  panelGroup.children.forEach(c => {
    const bc = c.userData && c.userData.baseCorners;
    if (!bc) return;
    const p = c.geometry.attributes.position;
    if (c.userData.type === 'panel') {
      for (let i = 0; i < 4; i++) {
        p.setY(i, bc[i].baseY + liftMetres);
      }
    } else if (c.userData.type === 'panel-edge') {
      for (let i = 0; i < 4; i++) {
        p.setY(i, bc[i].baseY + liftMetres + 0.005);
      }
      // closing vertex mirrors first corner
      p.setY(4, bc[0].baseY + liftMetres + 0.005);
    }
    p.needsUpdate = true;
  });
};
