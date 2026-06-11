// =====================================================================
// Small standalone geometry helpers shared by roof faces & obstructions.
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.geometryUtils = (function () {

  function orientationColour(azimuth) {
    const a = ((azimuth % 360) + 360) % 360;
    if (a >= 315 || a < 45) return 0x845ef7;
    if (a >= 45  && a < 135) return 0x4dabf7;
    if (a >= 135 && a < 225) return 0xff922b;
    return 0x20c997;
  }

  function buildPolygonShape(ring) {
    const shape = new THREE.Shape();
    for (let i = 0; i < ring.length; i++) {
      const [x, z] = ring[i];
      if (i === 0) shape.moveTo(x, z);
      else shape.lineTo(x, z);
    }
    return shape;
  }

  function fitPlane(points3D) {
    let cx = 0, cy = 0, cz = 0;
    for (const p of points3D) { cx += p[0]; cy += p[1]; cz += p[2]; }
    cx /= points3D.length; cy /= points3D.length; cz /= points3D.length;
    let Sxx=0, Syy=0, Sxy=0, Sxz=0, Syz=0;
    for (const p of points3D) {
      const dx = p[0]-cx, dy = p[1]-cy, dz = p[2]-cz;
      Sxx += dx*dx; Syy += dy*dy; Sxy += dx*dy; Sxz += dx*dz; Syz += dy*dz;
    }
    const det = Sxx*Syy - Sxy*Sxy;
    let a = 0, b = 0;
    if (Math.abs(det) > 1e-9) {
      a = (Syy*Sxz - Sxy*Syz) / det;
      b = (Sxx*Syz - Sxy*Sxz) / det;
    }
    const c = cz - a*cx - b*cy;
    return {
      getHeight: (x, y) => a*x + b*y + c,
      centroid: new THREE.Vector3(cx, cy, cz),
    };
  }

  return { orientationColour, buildPolygonShape, fitPlane };

})();
