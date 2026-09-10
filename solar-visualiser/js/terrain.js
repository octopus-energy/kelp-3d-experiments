// =====================================================================
// Terrain mesh built from the DSM heightmap, with the aerial photo
// draped over it via the site's image bounding box.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.buildTerrain = function ({ siteData, dsm, coords, aerialDataUrl, renderer }) {
  const { WIDTH, HEIGHT, lonLatToLocal } = coords;
  // Where the export supplied only 2D roofs, the prepared planes estimate
  // their heights from noisy DSM samples. Cap those terrain pixels at the
  // inferred roof surface so noise cannot bury the proposed solar panels.
  const inferredRoofs = siteData.roof_faces.filter(f => f.height_source).map(f => {
    const points = f.geometry.coordinates[0].map(p => {
      const [x, z] = coords.lonLatToSceneXZ(p[0], p[1]);
      return [x, z, p[2]];
    });
    return { ring: points.map(p => [p[0], p[1]]), plane: window.SolarViz.geometryUtils.fitPlane(points) };
  });

  const geom = new THREE.PlaneGeometry(WIDTH, HEIGHT, dsm.ncols - 1, dsm.nrows - 1);
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position;
  for (let r = 0; r < dsm.nrows; r++) {
    for (let c = 0; c < dsm.ncols; c++) {
      const idx = r * dsm.ncols + c;
      const elev = dsm.grid[idx];
      let height = isFinite(elev) && elev !== dsm.nodata ? elev : siteData.property_details.altitude;
      const x = (c + 0.5) * dsm.cellsize;
      const z = (r + 0.5) * dsm.cellsize;
      pos.setX(idx, x - WIDTH / 2);
      pos.setZ(idx, z - HEIGHT / 2);
      inferredRoofs.forEach(roof => {
        if (window.SolarViz.buildingGeometry.pointInPolygon(roof.ring, x, z)) {
          height = Math.min(height, roof.plane.getHeight(x, z));
        }
      });
      pos.setY(idx, height);
    }
  }
  geom.computeVertexNormals();
  geom.translate(WIDTH / 2, 0, HEIGHT / 2);

  // Map the aerial image onto the terrain via the site's bounding box.
  const bbox = siteData.image_bounding_box;
  const [imgMinLocalX, imgMinLocalY] = lonLatToLocal(bbox[0], bbox[1]);
  const [imgMaxLocalX, imgMaxLocalY] = lonLatToLocal(bbox[2], bbox[3]);

  const aerialTex = new THREE.TextureLoader().load(aerialDataUrl);
  if (THREE.SRGBColorSpace) aerialTex.colorSpace = THREE.SRGBColorSpace;
  aerialTex.anisotropy = renderer.capabilities.getMaxAnisotropy();

  const uvAttr = geom.attributes.uv;
  for (let r = 0; r < dsm.nrows; r++) {
    for (let c = 0; c < dsm.ncols; c++) {
      const idx = r * dsm.ncols + c;
      const sceneX = pos.getX(idx);
      const sceneZ = pos.getZ(idx);
      const localEast = sceneX;
      const localNorth = HEIGHT - sceneZ;
      const u = (localEast - imgMinLocalX) / (imgMaxLocalX - imgMinLocalX);
      const v = (localNorth - imgMinLocalY) / (imgMaxLocalY - imgMinLocalY);
      uvAttr.setXY(idx, u, v);
    }
  }
  uvAttr.needsUpdate = true;

  const matTextured = new THREE.MeshStandardMaterial({
    map: aerialTex, roughness: 0.95, metalness: 0.0,
  });
  const matSolid = new THREE.MeshStandardMaterial({
    color: 0x3a4048, roughness: 0.9, metalness: 0.0,
  });

  const terrainMesh = new THREE.Mesh(geom, matTextured);
  terrainMesh.receiveShadow = true;
  // ASHP context uses the original DSM, without the solar-panel roof caps.
  const rawGeometry=geom.clone(),rawPosition=rawGeometry.attributes.position;
  for(let i=0;i<rawPosition.count;i++){const h=dsm.grid[i];rawPosition.setY(i,Number.isFinite(h)&&h!==dsm.nodata?h:siteData.property_details.altitude);}
  rawPosition.needsUpdate=true;rawGeometry.computeVertexNormals();
  terrainMesh.userData.rawDSMGeometry=rawGeometry;

  return { terrainMesh, geom, matTextured, matSolid };
};
