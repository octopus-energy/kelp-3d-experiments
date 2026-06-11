// =====================================================================
// Roof face meshes/outlines, their panel arrays, and the "Solar Arrays"
// sidebar list.
// =====================================================================
window.SolarViz = window.SolarViz || {};

// Builds a mesh + outline for every roof face, the panels for its active
// array (via buildPanelsForArray), and a clickable sidebar entry per
// active array. Returns the roof-face meshes pushed onto `hoverables`.
window.SolarViz.buildRoofFaces = function ({ siteData, coords, groups, arrayListEl, hoverables, panelLift, animateCamera }) {
  const { lonLatZToScene, lonLatToSceneXZ, WIDTH, HEIGHT } = coords;
  const { orientationColour, buildPolygonShape, fitPlane } = window.SolarViz.geometryUtils;
  const { roofGroup, panelGroup, rejectedGroup } = groups;

  siteData.roof_faces.forEach((rf) => {
    const ring3D = rf.geometry.coordinates[0];
    const scenePoints = ring3D.map(p => lonLatZToScene(p[0], p[1], p[2]));
    // Plane fit in (sceneX, sceneZ, sceneY)
    const fitPts = scenePoints.map(v => [v.x, v.z, v.y]);
    const plane = fitPlane(fitPts);

    const ring2D = scenePoints.map(v => [v.x, v.z]);
    const shape = buildPolygonShape(ring2D);
    const shapeGeom = new THREE.ShapeGeometry(shape, 12);
    shapeGeom.rotateX(-Math.PI / 2);
    const sp = shapeGeom.attributes.position;
    for (let i = 0; i < sp.count; i++) {
      sp.setY(i, plane.getHeight(sp.getX(i), sp.getZ(i)));
    }
    shapeGeom.computeVertexNormals();

    const arrayInfo = rf.solar_arrays[0];
    const isActive = arrayInfo.active;
    const colour = orientationColour(rf.azimuth);

    const mat = new THREE.MeshStandardMaterial({
      color: colour, transparent: true, opacity: 0.35,
      side: THREE.DoubleSide, roughness: 0.6, metalness: 0.1,
      depthWrite: false,
    });
    const roofMesh = new THREE.Mesh(shapeGeom, mat);
    roofMesh.userData = {
      type: 'roof',
      description: arrayInfo.description,
      azimuth: rf.azimuth.toFixed(1),
      tilt: rf.slope.toFixed(1),
      area: rf.area.toFixed(1),
      panels: arrayInfo.number_of_panels,
      annualOutput: arrayInfo.output.annual_output,
      shading: (arrayInfo.shading.shading_factor * 100).toFixed(0),
    };
    hoverables.push(roofMesh);

    if (isActive) {
      roofGroup.add(roofMesh);
    } else {
      mat.color.setHex(0x666666);
      mat.opacity = 0.2;
      rejectedGroup.add(roofMesh);
    }

    // Outline
    const outlinePts = [];
    for (const [x, z] of ring2D) {
      outlinePts.push(new THREE.Vector3(x, plane.getHeight(x, z) + 0.02, z));
    }
    outlinePts.push(outlinePts[0].clone());
    const outlineGeom = new THREE.BufferGeometry().setFromPoints(outlinePts);
    const outlineMat = new THREE.LineBasicMaterial({
      color: isActive ? colour : 0x777777, transparent: true, opacity: 0.8,
    });
    const outline = new THREE.Line(outlineGeom, outlineMat);
    outline.renderOrder = 2;
    (isActive ? roofGroup : rejectedGroup).add(outline);

    if (arrayInfo.panels && arrayInfo.panels.length > 0) {
      window.SolarViz.buildPanelsForArray({
        panels: arrayInfo.panels, plane, lonLatToSceneXZ, panelLift, panelGroup, hoverables,
      });
    }

    if (isActive && arrayInfo.number_of_panels > 0) {
      const item = document.createElement('div');
      item.className = 'array-item';
      item.style.borderLeftColor = '#' + colour.toString(16).padStart(6, '0');
      item.innerHTML = `
        <div class="name">${arrayInfo.description}</div>
        <div class="meta">${arrayInfo.output.annual_output} kWh/yr · ${(arrayInfo.shading.shading_factor*100).toFixed(0)}% shading · tilt ${rf.slope.toFixed(0)}°</div>
      `;
      item.addEventListener('click', () => {
        const c = plane.centroid;
        const dx = c.x - WIDTH / 2, dz = c.z - HEIGHT / 2;
        const r = 25;
        const ang = Math.atan2(dz, dx);
        const newPos = new THREE.Vector3(
          c.x + Math.cos(ang + Math.PI/2) * r,
          c.y + 18,
          c.z + Math.sin(ang + Math.PI/2) * r
        );
        animateCamera(newPos, c);
      });
      arrayListEl.appendChild(item);
    }
  });
};
