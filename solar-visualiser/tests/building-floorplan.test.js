// =====================================================================
// Node test for the floorplan import pipeline. No framework — run with:
//   node tests/building-floorplan.test.js
// Uses the real bundled site data + image manifest as fixtures: fits the
// Metropix plan onto the derived building floors and checks the rooms
// that come out.
// =====================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('../js/building/geometry.js');
const S = require('../js/building/solid.js');
const F = require('../js/building/floors.js');
const R = require('../js/building/rooms.js');
const FP = require('../js/building/floorplan.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.error('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- fixtures --------------------------------------------------------
const src = fs.readFileSync(path.join(__dirname, '../data/site-data.js'), 'utf8');
const SITE = JSON.parse(src.match(/window\.SITE_DATA = (.*?);\s*window\.__DSM_B64__/s)[1]);

const sandbox = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../data/image-data.js'), 'utf8'), sandbox);
const IMG = sandbox.window.IMAGE_DATA;

const addr = SITE.property_details.geocoded_address;
const REF_LAT = addr.latitude, REF_LON = addr.longitude;
const MLAT = 111132.954 - 559.822 * Math.cos(2 * REF_LAT * Math.PI / 180) + 1.175 * Math.cos(4 * REF_LAT * Math.PI / 180);
const MLON = (Math.PI / 180) * 6378137 * Math.cos(REF_LAT * Math.PI / 180);
const inputFaces = SITE.roof_faces.map((rf) => ({
  id: rf.id,
  active: rf.solar_arrays[0].active,
  ring: rf.geometry.coordinates[0].map((p) => ({
    x: (p[0] - REF_LON) * MLON, y: p[2], z: -(p[1] - REF_LAT) * MLAT,
  })),
}));
const solid = S.buildSolid(inputFaces, { groundY: SITE.property_details.altitude });
const levels = F.computeFloors(solid, {
  count: 2,
  storeyHeight: (solid.eaveY - solid.groundY) / 2,
  slabT: 0.3,
  includeAttic: true,
});

// ---- unit: scale + divider derivation --------------------------------
console.log('\n== units ==');
const groundPlan = IMG.floorplan.floors.find((f) => f.level === 0);
const firstPlan = IMG.floorplan.floors.find((f) => f.level === 1);
const scale = FP.planScale(groundPlan.rooms);
check('plan scale ≈ 36 px/m', scale > 1 / 40 && scale < 1 / 31,
  scale && (1 / scale).toFixed(1) + ' px/m');

// two abutting rectangles share one wall -> exactly one merged divider
const dd = FP.deriveDividers({
  rooms: [{ rect: [0, 0, 50, 100] }, { rect: [52, 0, 120, 100] }],
  planOutline: [[0, 0], [120, 0], [120, 100], [0, 100]],
});
check('shared edge merges to a single divider', dd.length === 1, dd.length + ' dividers');
check('merged divider is the wall centreline', dd.length === 1 && Math.abs(dd[0][0][0] - 51) <= 1,
  dd.length ? JSON.stringify(dd[0]) : '');

// snap: an interior segment extends to the polygon boundary
const sq = [[0, 0], [10, 0], [10, 8], [0, 8]];
const snapped = FP.snapDividerToRoom([[4, 0.5], [4, 7.2]], sq);
check('divider snaps out to the boundary', !!snapped &&
  Math.abs(snapped[0][1] - 0) < 1e-6 && Math.abs(snapped[1][1] - 8) < 1e-6,
  JSON.stringify(snapped));
check('unreachable divider rejected', FP.snapDividerToRoom([[4, 3], [4, 4]], sq, 0.5) === null);

// ---- ground floor import ---------------------------------------------
console.log('\n== ground floor ==');
const g = FP.importFloorplan({
  planFloor: groundPlan, worldOutline: levels[0].outline,
  axisAngle: solid.axisAngle, deriveRooms: R.deriveRooms,
});
check('import returns a transform', !!g.transform);
console.log('  fit score:', (g.score * 100).toFixed(0) + '%',
  '| mirrored:', g.transform.mirrored, '| q:', g.transform.q,
  '| dividers:', g.dividers.length, '| failed:', g.failed.length);
check('outline fit is strong', g.score > 0.7, (g.score * 100).toFixed(0) + '%');
check('most plan walls import', g.dividers.length >= 4 && g.failed.length <= 2,
  `${g.dividers.length} ok, ${g.failed.length} failed`);

const gRooms = R.deriveRooms(levels[0].outline, g.dividers);
check('replay from stored dividers is clean', gRooms.failed.length === 0);
check('several rooms derived', gRooms.rooms.length === g.dividers.length + 1,
  `${gRooms.rooms.length} rooms from ${g.dividers.length} dividers`);
const gArea = gRooms.rooms.reduce((s, r) => s + Math.abs(G.polygonArea(r.poly)), 0);
check('rooms tile the floor', Math.abs(gArea - levels[0].area) / levels[0].area < 0.02,
  `${gArea.toFixed(1)} vs ${levels[0].area.toFixed(1)}`);

const gNames = Object.values(g.roomNames);
check('kitchen + sitting room labelled', gNames.includes('Kitchen/Dining Room') && gNames.includes('Sitting Room'),
  JSON.stringify(gNames));
check('a room is typed kitchen', Object.values(g.roomTypes).includes('kitchen'));

// imported walls stay square to the building axes; only short corner
// tails (the hinged connectors snapping adds where the roof outline and
// the plan disagree at a corner) are allowed to bend
let offAxis = 0;
g.dividers.forEach((d) => {
  for (let i = 0; i < d.length - 1; i++) {
    const len = Math.hypot(d[i + 1][0] - d[i][0], d[i + 1][1] - d[i][1]);
    if (len < 1.2) continue;
    const ang = Math.atan2(d[i + 1][1] - d[i][1], d[i + 1][0] - d[i][0]);
    let da = (ang - solid.axisAngle) % (Math.PI / 2);
    if (da > Math.PI / 4) da -= Math.PI / 2;
    if (da < -Math.PI / 4) da += Math.PI / 2;
    if (Math.abs(da) > (1.5 * Math.PI) / 180) offAxis++;
  }
});
check('imported wall runs are orthogonal to the building axes', offAxis === 0,
  offAxis + ' off-axis segment(s)');

// refit: nudge the outline outward (as a footprint edit would) and the
// stored dividers re-snap rather than drop
const grown = levels[0].outline.map(([x, z]) => {
  const [cx, cz] = [0, 0];
  return [x * 1.02, z * 1.02];
});
const refit = FP.refitDividers({
  worldOutline: grown, dividers: g.dividers, deriveRooms: R.deriveRooms,
});
check('dividers survive an outline nudge via refit', refit.failed.length === 0,
  refit.failed.length + ' failed');

// ---- first floor import ----------------------------------------------
console.log('\n== first floor ==');
// our first-floor outline is the full roof footprint while the plan's
// first floor excludes the single-storey wing — the fit is looser but
// must still land the main block
const f = FP.importFloorplan({
  planFloor: firstPlan, worldOutline: levels[1].outline,
  axisAngle: solid.axisAngle, deriveRooms: R.deriveRooms,
});
console.log('  fit score:', (f.score * 100).toFixed(0) + '%',
  '| dividers:', f.dividers.length, '| failed:', f.failed.length);
check('first-floor fit is usable', f.score > 0.45, (f.score * 100).toFixed(0) + '%');
check('bedroom walls import', f.dividers.length >= 4,
  `${f.dividers.length} ok, ${f.failed.length} failed`);
check('a room is typed bedroom', Object.values(f.roomTypes).includes('bedroom'));

// same orientation must win on both floors — one physical building
check('both floors agree on orientation',
  g.transform.q === f.transform.q && g.transform.mirrored === f.transform.mirrored,
  `ground q${g.transform.q}/m${g.transform.mirrored} vs first q${f.transform.q}/m${f.transform.mirrored}`);

console.log('\n' + (failures ? `${failures} FAILURE(S)` : 'all checks passed'));
process.exit(failures ? 1 : 0);
