// =====================================================================
// Obstruction outlines + ground-hugging fills (chimneys, dormers, etc.)
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.buildObstructions = function ({ siteData, coords, group }) {
  const { lonLatToSceneXZ, sampleDSM, HEIGHT } = coords;
  const { buildPolygonShape } = window.SolarViz.geometryUtils;

  siteData.obstructions.forEach(obs => {
    const ring = obs.geometry.coordinates[0];
    const sceneXZ = ring.map(p => lonLatToSceneXZ(p[0], p[1]));
    const points = sceneXZ.map(([x, z]) => new THREE.Vector3(x, sampleDSM(x, HEIGHT - z) + 0.15, z));
    const obsGeom = new THREE.BufferGeometry().setFromPoints(points);
    group.add(new THREE.LineLoop(obsGeom, new THREE.LineBasicMaterial({ color: 0xe57a52 })));

    const shape = buildPolygonShape(sceneXZ);
    const fillGeom = new THREE.ShapeGeometry(shape);
    fillGeom.rotateX(-Math.PI / 2);
    const fp = fillGeom.attributes.position;
    for (let i = 0; i < fp.count; i++) {
      fp.setY(i, sampleDSM(fp.getX(i), HEIGHT - fp.getZ(i)) + 0.1);
    }
    fillGeom.computeVertexNormals();
    group.add(new THREE.Mesh(fillGeom, new THREE.MeshBasicMaterial({
      color: 0xe57a52, transparent: true, opacity: 0.3,
      side: THREE.DoubleSide, depthWrite: false,
    })));
  });
};
