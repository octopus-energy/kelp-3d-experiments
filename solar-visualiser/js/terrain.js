// =====================================================================
// Terrain mesh built from the DSM heightmap, with the aerial photo
// draped over it via the site's image bounding box.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.buildTerrain = function ({ siteData, dsm, coords, aerialDataUrl, renderer }) {
  const { WIDTH, HEIGHT, lonLatToLocal } = coords;
  const SEG = dsm.ncols - 1;

  const geom = new THREE.PlaneGeometry(WIDTH, HEIGHT, SEG, SEG);
  geom.rotateX(-Math.PI / 2);
  const pos = geom.attributes.position;
  for (let r = 0; r < dsm.nrows; r++) {
    for (let c = 0; c < dsm.ncols; c++) {
      const idx = r * dsm.ncols + c;
      const elev = dsm.grid[idx];
      pos.setY(idx, isFinite(elev) && elev !== dsm.nodata ? elev : 28);
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

  return { terrainMesh, geom, matTextured, matSolid };
};
