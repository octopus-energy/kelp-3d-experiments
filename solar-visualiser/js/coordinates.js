// =====================================================================
// DSM decoding + lon/lat <-> local scene coordinate conversion.
//
// Scene axes: X=east, Y=up, Z=south (so DSM row 0 = north = small Z).
// =====================================================================
window.SolarViz = window.SolarViz || {};

window.SolarViz.coordinates = (function () {

  // DSM grid headers are fixed for this site's heightmap export.
  const DSM_META = {
    ncols: 400, nrows: 400, cellsize: 0.25,
    xll: 485562, yll: 106428, nodata: -9999,
  };

  function decodeDSM(b64) {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return Object.assign({ grid: new Float32Array(bytes.buffer) }, DSM_META);
  }

  // Builds the lon/lat <-> local-metres <-> scene coordinate helpers for
  // a given site. `dsm` provides the grid + cellsize/origin, `siteData`
  // provides the reference point (the geocoded property location).
  function createCoordinateSystem(siteData, dsm) {
    const addr = siteData.property_details.geocoded_address;
    const REF_LAT = addr.latitude;
    const REF_LON = addr.longitude;
    const METRES_PER_DEG_LAT = 111132.954 - 559.822 * Math.cos(2 * REF_LAT * Math.PI/180) + 1.175 * Math.cos(4 * REF_LAT * Math.PI/180);
    const METRES_PER_DEG_LON = (Math.PI / 180) * 6378137 * Math.cos(REF_LAT * Math.PI/180);
    const PROP_LOCAL_X = addr.easting - dsm.xll;
    const PROP_LOCAL_Y = addr.northing - dsm.yll;

    const WIDTH = dsm.ncols * dsm.cellsize;
    const HEIGHT = dsm.nrows * dsm.cellsize;

    function lonLatToLocal(lon, lat) {
      const dx = (lon - REF_LON) * METRES_PER_DEG_LON;
      const dy = (lat - REF_LAT) * METRES_PER_DEG_LAT;
      return [PROP_LOCAL_X + dx, PROP_LOCAL_Y + dy];
    }

    function sampleDSM(localEast, localNorth) {
      const col = localEast / dsm.cellsize;
      const rowFromNorth = (dsm.nrows * dsm.cellsize - localNorth) / dsm.cellsize;
      const c = Math.max(0, Math.min(dsm.ncols - 1, Math.round(col)));
      const r = Math.max(0, Math.min(dsm.nrows - 1, Math.round(rowFromNorth)));
      return dsm.grid[r * dsm.ncols + c];
    }

    function lonLatZToScene(lon, lat, z) {
      const [lx, ly] = lonLatToLocal(lon, lat);
      return new THREE.Vector3(lx, z, HEIGHT - ly);
    }

    function lonLatToSceneXZ(lon, lat) {
      const [lx, ly] = lonLatToLocal(lon, lat);
      return [lx, HEIGHT - ly];
    }

    return {
      WIDTH, HEIGHT,
      PROP_LOCAL_X, PROP_LOCAL_Y,
      lonLatToLocal, sampleDSM, lonLatZToScene, lonLatToSceneXZ,
    };
  }

  return { decodeDSM, createCoordinateSystem };

})();
