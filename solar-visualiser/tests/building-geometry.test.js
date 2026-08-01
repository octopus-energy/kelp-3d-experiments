// =====================================================================
// Node test for the building-model geometry. No framework — run with:
//   node tests/building-geometry.test.js
// Uses the real bundled site data as fixture.
// =====================================================================
const fs = require('fs');
const path = require('path');
const G = require('../js/building/geometry.js');
const S = require('../js/building/solid.js');
const R = require('../js/building/rooms.js');

let failures = 0;
function check(name, cond, detail) {
  if (cond) console.log('  ok  ' + name);
  else { failures++; console.error('FAIL  ' + name + (detail ? ' — ' + detail : '')); }
}

// ---- fixture: parse SITE_DATA out of data/site-data.js ----------------
const src = fs.readFileSync(path.join(__dirname, '../data/site-data.js'), 'utf8');
const m = src.match(/window\.SITE_DATA = (.*?);\s*window\.__DSM_B64__/s);
const SITE = JSON.parse(m[1]);

const addr = SITE.property_details.geocoded_address;
const REF_LAT = addr.latitude, REF_LON = addr.longitude;
const MLAT = 111132.954 - 559.822 * Math.cos(2 * REF_LAT * Math.PI / 180) + 1.175 * Math.cos(4 * REF_LAT * Math.PI / 180);
const MLON = (Math.PI / 180) * 6378137 * Math.cos(REF_LAT * Math.PI / 180);
// scene-like frame: x = east, y = elevation, z = south
const toScene = (lon, lat, elev) => ({
  x: (lon - REF_LON) * MLON,
  y: elev,
  z: -(lat - REF_LAT) * MLAT,
});

const inputFaces = SITE.roof_faces.map((rf) => ({
  id: rf.id,
  active: rf.solar_arrays[0].active,
  ring: rf.geometry.coordinates[0].map((p) => toScene(p[0], p[1], p[2])),
}));
const groundY = SITE.property_details.altitude;

// ---- Phase A: watertight solid ---------------------------------------
console.log('\n== solid ==');
const solid = S.buildSolid(inputFaces, { groundY });
check('solid built', !!solid);
if (solid.warnings.length) console.log('  warnings:', solid.warnings);

check('watertight (closed)', solid.watertight.closed,
  JSON.stringify(solid.watertight.badEdges.slice(0, 5)));
check('consistently oriented', solid.watertight.oriented);
check('single footprint loop', solid.loops.length === 1, `got ${solid.loops.length}`);
check('footprint area sane', solid.footprintArea > 30 && solid.footprintArea < 250,
  solid.footprintArea.toFixed(1) + ' m²');
check('ridge above eaves above ground',
  solid.ridgeY > solid.eaveY && solid.eaveY > solid.groundY,
  `g=${solid.groundY} e=${solid.eaveY.toFixed(2)} r=${solid.ridgeY.toFixed(2)}`);
check('ridge height ≈ site ridge_height', Math.abs((solid.ridgeY - solid.groundY) - SITE.property_details.ridge_height) < 1.0,
  (solid.ridgeY - solid.groundY).toFixed(2) + ' vs ' + SITE.property_details.ridge_height);

const eaveHeights = [...new Set(
  solid.loops[0].ids.map((id) => Math.round(solid.clusters[id].y * 100) / 100))];
console.log('  footprint verts:', solid.footprint.length,
  '| area:', solid.footprintArea.toFixed(1) + ' m²',
  '| eave heights:', eaveHeights.join(', '),
  '| ridge:', solid.ridgeY.toFixed(2));
check('eave heights levelled into few groups', eaveHeights.length <= 3, eaveHeights.join(','));

// footprint corner angles after orthogonalisation
const fp = solid.footprint;
let rightish = 0;
for (let i = 0; i < fp.length; i++) {
  const a = fp[(i + fp.length - 1) % fp.length], p = fp[i], b = fp[(i + 1) % fp.length];
  const a1 = Math.atan2(p[1] - a[1], p[0] - a[0]);
  const a2 = Math.atan2(b[1] - p[1], b[0] - p[0]);
  let turn = Math.abs((a2 - a1) * 180 / Math.PI) % 360;
  if (turn > 180) turn = 360 - turn;
  if (Math.abs(turn - 90) < 1 || turn < 1) rightish++;
}
check('footprint corners mostly right angles or straight',
  rightish >= fp.length - 2, `${rightish}/${fp.length}`);

// ---- parametric footprint offsets ------------------------------------
console.log('\n== footprint offsets ==');
const nFp = solid.loops[0].ids.length;
const offsets = new Array(nFp).fill(null);
offsets[0] = [0.5, 0.5];
const edited = S.buildSolid(inputFaces, { groundY, footprintOffsets: offsets });
check('edited solid still watertight', edited.watertight.closed && edited.watertight.oriented);
check('edited footprint area differs', Math.abs(edited.footprintArea - solid.footprintArea) > 0.05,
  `${solid.footprintArea.toFixed(1)} -> ${edited.footprintArea.toFixed(1)}`);
const stale = S.buildSolid(inputFaces, { groundY, footprintOffsets: [[1, 1]] });
check('length-mismatched offsets are ignored with a warning',
  Math.abs(stale.footprintArea - solid.footprintArea) < 1e-6 &&
  stale.warnings.some((w) => /footprint edits ignored/.test(w)));

// ---- Phase B probe: mesh slicing -------------------------------------
console.log('\n== slicing ==');
const heights = [
  solid.groundY + 1,
  solid.groundY + 2.5,
  (solid.eaveY + solid.ridgeY) / 2,
  solid.ridgeY - 0.3,
];
heights.forEach((y) => {
  const s = G.sliceMesh(solid.verts, solid.tris, y);
  const rel = (y - solid.groundY).toFixed(2);
  check(`slice @ +${rel} closed loops only`, s.loops.length >= 1 && s.open.length === 0,
    `${s.loops.length} loops, ${s.open.length} open`);
  const area = Math.abs(G.polygonArea(s.loops[0] || []));
  console.log(`     +${rel}m: ${s.loops.length} loop(s), primary area ${area.toFixed(1)} m²`);
  if (y < solid.eaveY) {
    check(`slice @ +${rel} matches footprint area`,
      Math.abs(area - solid.footprintArea) / solid.footprintArea < 0.02,
      `${area.toFixed(1)} vs ${solid.footprintArea.toFixed(1)}`);
  } else {
    check(`slice @ +${rel} smaller than footprint`, area < solid.footprintArea);
  }
});

// ---- Phase C probe: polygon splitting --------------------------------
console.log('\n== splitting ==');
const square = [[0, 0], [10, 0], [10, 8], [0, 8]];
const cut = G.splitPolygonByPolyline(square, [[3, 0], [3, 8]]);
check('straight split works', !!cut);
if (cut) {
  const aA = Math.abs(G.polygonArea(cut.a)), aB = Math.abs(G.polygonArea(cut.b));
  check('split conserves area', Math.abs(aA + aB - 80) < 1e-6, `${aA} + ${aB}`);
  check('split ratio correct', Math.abs(Math.min(aA, aB) - 24) < 1e-6, `${Math.min(aA, aB)}`);
}
const dogleg = G.splitPolygonByPolyline(square, [[5, 0], [5, 4], [10, 4]]);
check('polyline (dog-leg) split works', !!dogleg);
if (dogleg) {
  const aA = Math.abs(G.polygonArea(dogleg.a)), aB = Math.abs(G.polygonArea(dogleg.b));
  check('dog-leg conserves area', Math.abs(aA + aB - 80) < 1e-6, `${aA} + ${aB}`);
  check('dog-leg areas correct', Math.abs(Math.min(aA, aB) - 20) < 1e-6, `${Math.min(aA, aB)}`);
}
const outside = G.splitPolygonByPolyline(square, [[3, 0], [-2, 4], [3, 8]]);
check('path leaving polygon rejected', outside === null);

// split the real footprint down its middle
const c = G.polygonCentroid(fp);
const cutReal = G.splitPolygonByPolyline(fp, [
  [c[0], c[1] - 30], [c[0], c[1] + 30],
].map((p) => {
  // clamp endpoints onto the boundary: nearest boundary point
  let best = null, bd = Infinity;
  for (let i = 0; i < fp.length; i++) {
    const a = fp[i], b = fp[(i + 1) % fp.length];
    const s = G.distPointToSegment(p[0], p[1], a[0], a[1], b[0], b[1]);
    if (s.d < bd) { bd = s.d; best = [s.x, s.z]; }
  }
  return best;
}));
check('real footprint splits', !!cutReal);
if (cutReal) {
  const sum = Math.abs(G.polygonArea(cutReal.a)) + Math.abs(G.polygonArea(cutReal.b));
  check('real split conserves area', Math.abs(sum - solid.footprintArea) / solid.footprintArea < 0.02,
    `${sum.toFixed(1)} vs ${solid.footprintArea.toFixed(1)}`);
}

// ---- room derivation (pure part of rooms.js) -------------------------
console.log('\n== rooms ==');
const sq = [[0, 0], [10, 0], [10, 8], [0, 8]];
const wall1 = [[4, 0], [4, 8]];
const wall2 = [[4, 3], [10, 3]]; // spans only the right-hand room
const one = R.deriveRooms(sq, [wall1]);
check('one divider → two rooms', one.rooms.length === 2,
  JSON.stringify(one.rooms.map((r) => r.id)));
const two = R.deriveRooms(sq, [wall1, wall2]);
check('second divider splits only its containing room',
  JSON.stringify(two.rooms.map((r) => r.id)) === '["r00","r01","r1"]',
  JSON.stringify(two.rooms.map((r) => r.id)));
check('derived areas sum to the outline', Math.abs(
  two.rooms.reduce((s, r) => s + Math.abs(G.polygonArea(r.poly)), 0) - 80) < 1e-6);
check('replay is deterministic (ids stable for persistence)',
  JSON.stringify(R.deriveRooms(sq, [wall1, wall2]).rooms.map((r) => r.id)) ===
  JSON.stringify(two.rooms.map((r) => r.id)));
const bogus = R.deriveRooms(sq, [[[20, 20], [30, 30]]]);
check('divider outside the floor reported as failed',
  bogus.rooms.length === 1 && bogus.failed.length === 1);

// ---- orthogonalisation sanity ----------------------------------------
console.log('\n== orthogonalise ==');
const wonky = [[0, 0], [10.2, 0.4], [9.9, 8.1], [-0.2, 7.8]];
const ortho = G.orthogonalizeLoop(wonky, { angleSnapDeg: 10 });
let ok90 = true;
for (let i = 0; i < ortho.length; i++) {
  const a = ortho[(i + ortho.length - 1) % ortho.length], p = ortho[i], b = ortho[(i + 1) % ortho.length];
  const dot = (p[0] - a[0]) * (b[0] - p[0]) + (p[1] - a[1]) * (b[1] - p[1]);
  if (Math.abs(dot) > 1e-6) ok90 = false;
}
check('wonky rectangle becomes right-angled', ok90);

console.log('\n' + (failures ? `${failures} FAILURE(S)` : 'all checks passed'));
process.exit(failures ? 1 : 0);
