// Real-property regression: offline assets, coordinate frames and closed shells.
// Run: node solar-visualiser/tests/properties.test.js
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const G = require('../js/building/geometry.js');
const S = require('../js/building/solid.js');
const root = path.resolve(__dirname, '..');

function fixture(files) {
  const context = vm.createContext({ window: {}, atob });
  for (const file of files) vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(root, 'js/coordinates.js'), 'utf8'), context);
  return context.window;
}
const original = fixture(['data/site-data.js', 'data/image-data.js', 'data/image-blobs.js']);
original.__DSM_META__ = { ncols: 400, nrows: 400, cellsize: .25, xll: 485562, yll: 106428, nodata: -9999 };
const broom = fixture(['3broomroad-data/property-bundle.js']);
assert.equal(broom.SITE_DATA.total_number_of_panels, 12);
assert.equal(broom.SITE_DATA.total_annual_generation_kwh, 3476);
assert.equal(broom.IMAGE_DATA.images.length, 22);
assert.equal(broom.IMAGE_DATA.floorplan.floors.length, 0, 'Unannotated floorplan must not import old rooms');
assert.equal(broom.SITE_DATA.os_data.building_outline.properties.description, 'Mid-Terrace House');
assert.notEqual(original.__DSM_META__.xll, broom.__DSM_META__.xll);
assert.notEqual(original.__AERIAL_DATAURL__, broom.__AERIAL_DATAURL__);
const originalIds = new Set(original.IMAGE_DATA.images.map(im => im.id));
assert(broom.IMAGE_DATA.images.every(im => !originalIds.has(im.id) && !im.match));

for (const [name, data] of [['original', original], ['3broomroad', broom]]) {
  const site = data.SITE_DATA;
  const addr = site.property_details.geocoded_address;
  const coord = data.SolarViz.coordinates;
  const dsm = coord.decodeDSM(data.__DSM_B64__, data.__DSM_META__);
  const coords = coord.createCoordinateSystem(site, dsm);
  assert.equal(coords.PROP_LOCAL_X, 50);
  assert.equal(coords.PROP_LOCAL_Y, 50);
  assert.deepEqual(Array.from(coords.lonLatToSceneXZ(addr.longitude, addr.latitude)), [50, 50]);
  assert(Number.isFinite(coords.sampleDSM(50, 50)));
  assert(data.__AERIAL_DATAURL__.startsWith('data:image/'));
  for (const image of [...data.IMAGE_DATA.images, data.IMAGE_DATA.floorplan]) {
    assert(data.__IMAGE_DATAURLS__[image.id].startsWith('data:image/'), image.id+' must work offline');
  }
  const faces = site.roof_faces.map(face => ({
    id: face.id,
    ring: face.geometry.coordinates[0].map(p => {
      assert.equal(p.length, 3);
      assert(p.every(Number.isFinite));
      const [x, z] = coords.lonLatToSceneXZ(p[0], p[1]);
      return { x, z, y: p[2] };
    }),
  }));
  for (const orthogonalize of [true, false]) {
    const solid = S.buildSolid(faces, { groundY: site.property_details.altitude, orthogonalize });
    assert(solid.watertight.closed, name+' must be watertight');
    assert(solid.watertight.oriented, name+' must be consistently oriented');
    assert(Math.abs(solid.ridgeY-solid.groundY-site.property_details.ridge_height) < 1);
    const counts = new Map();
    for (const w of solid.wallPanels) for (let i=1;i<w.ids.length;i++) {
      const key = [w.ids[i-1],w.ids[i]].sort((a,b)=>a-b).join('|');
      counts.set(key,(counts.get(key)||0)+1);
    }
    assert([...counts.values()].every(n=>n===1), 'Wall runs must not wrap and duplicate edges');
    for (const height of [1, 2.5]) {
      const slice = G.sliceMesh(solid.verts, solid.tris, solid.groundY+height);
      assert.equal(slice.open.length, 0);
      assert(slice.loops.length);
    }
    if (name === '3broomroad') {
      assert.equal(solid.loops.length, 2, 'Point-touching sections remain separate shells');
      assert(solid.warnings.some(w=>w.includes('Point-touching')));
      const offsets = Array.from({length: solid.footprintOrigCount},()=>null);
      offsets[0] = [.15,0];
      const edited = S.buildSolid(faces, {groundY:43,orthogonalize,footprintOffsets:offsets});
      assert(edited.watertight.closed && edited.watertight.oriented, 'New property footprint edits remain closed');
    }
  }
  console.log('  ok  '+name+' assets, coordinates, solid and floor slices');
}
const decode = broom.SolarViz.coordinates.decodeDSM;
assert.throws(()=>decode(broom.__DSM_B64__), /metadata/);
assert.throws(()=>decode('AAAA',broom.__DSM_META__), /size/);
const rectangular = decode(Buffer.alloc(2*3*4).toString('base64'), {ncols:2,nrows:3,cellsize:.5,xll:0,yll:0,nodata:-9999});
assert.equal(rectangular.grid.length,6);
console.log('all checks passed');
