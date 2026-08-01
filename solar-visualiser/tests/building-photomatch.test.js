// =====================================================================
// Node test for photo matching. No framework — run with:
//   node tests/building-photomatch.test.js
// Synthetic round-trips (project landmarks from a known camera, recover
// it) plus the real manifest correspondences against the real solid.
// =====================================================================
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const G = require('../js/building/geometry.js');
const S = require('../js/building/solid.js');
const PM = require('../js/building/photomatch.js');

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
const MLAT = 111132.954 - 559.822 * Math.cos(2 * addr.latitude * Math.PI / 180) + 1.175 * Math.cos(4 * addr.latitude * Math.PI / 180);
const MLON = (Math.PI / 180) * 6378137 * Math.cos(addr.latitude * Math.PI / 180);
const inputFaces = SITE.roof_faces.map((rf) => ({
  id: rf.id,
  active: rf.solar_arrays[0].active,
  ring: rf.geometry.coordinates[0].map((p) => ({
    x: (p[0] - addr.longitude) * MLON, y: p[2], z: -(p[1] - addr.latitude) * MLAT,
  })),
}));
const solid = S.buildSolid(inputFaces, { groundY: SITE.property_details.altitude });
const landmarks = PM.buildLandmarks(solid);
const byId = new Map(landmarks.map((l) => [l.id, l]));

// ---- landmarks -------------------------------------------------------
console.log('\n== landmarks ==');
check('registry has eave, ground, apex and ridge points',
  ['eave', 'ground', 'apex', 'ridge'].every((k) => landmarks.some((l) => l.kind === k)),
  JSON.stringify([...new Set(landmarks.map((l) => l.kind))]));
check('every landmark has a compass label', landmarks.every((l) => /\((N|NE|E|SE|S|SW|W|NW)\)/.test(l.label)));

// ---- synthetic round-trip --------------------------------------------
console.log('\n== synthetic pose recovery ==');
const SIZE = [800, 533];
const truth = {
  pos: [solid.footprint[0][0] + 9, solid.groundY + 1.7, solid.footprint[0][1] + 11],
  yaw: 0, pitch: 0, roll: 0, f: 760,
};
{
  // aim at the building centre
  const [ccx, ccz] = G.polygonCentroid(solid.footprint);
  const fwd = [ccx - truth.pos[0], (solid.eaveY - truth.pos[1] - 1), ccz - truth.pos[2]];
  const fl = Math.hypot(fwd[0], fwd[1], fwd[2]);
  truth.yaw = Math.atan2(-fwd[0] / fl, -fwd[2] / fl);
  truth.pitch = Math.asin(fwd[1] / fl);
}
const visible = landmarks
  .map((l) => ({ id: l.id, p: l.p, px: PM.projectPoint(truth, SIZE, l.p) }))
  .filter((c) => c.px && c.px[0] > 20 && c.px[0] < 780 && c.px[1] > 20 && c.px[1] < 513);
check('enough synthetic correspondences', visible.length >= 6, visible.length + ' visible');

const exact = PM.solvePose({
  points: visible.slice(0, 7), imageSize: SIZE, groundY: solid.groundY,
  centroid: G.polygonCentroid(solid.footprint),
});
check('noise-free solve recovers position',
  exact && Math.hypot(...exact.pos.map((v, i) => v - truth.pos[i])) < 0.25,
  exact && Math.hypot(...exact.pos.map((v, i) => v - truth.pos[i])).toFixed(2) + ' m off');
check('noise-free solve recovers focal length',
  exact && Math.abs(exact.f - truth.f) / truth.f < 0.03,
  exact && exact.f.toFixed(0) + ' vs ' + truth.f);
check('noise-free rmse is tiny', exact && exact.rmse < 1.5, exact && exact.rmse.toFixed(2) + ' px');

// deterministic pseudo-noise (no Math.random: reproducible failures)
const noisy = visible.slice(0, 8).map((c, i) => ({
  p: c.p,
  px: [c.px[0] + 1.5 * Math.sin(i * 12.9898), c.px[1] + 1.5 * Math.cos(i * 78.233)],
}));
const rough = PM.solvePose({
  points: noisy, imageSize: SIZE, groundY: solid.groundY,
  centroid: G.polygonCentroid(solid.footprint),
});
check('noisy solve stays close',
  rough && Math.hypot(...rough.pos.map((v, i) => v - truth.pos[i])) < 0.8,
  rough && Math.hypot(...rough.pos.map((v, i) => v - truth.pos[i])).toFixed(2) + ' m off');
check('too few points refused', PM.solvePose({ points: visible.slice(0, 3), imageSize: SIZE }) === null);

// ---- real photos from the manifest -----------------------------------
console.log('\n== real photo matches ==');
const matched = (IMG.images || []).filter((im) => im.match && im.match.landmarks);
check('manifest has matched photos', matched.length >= 2, matched.length + ' photos');
check('a match is flagged for human review', matched.some((im) => im.match.needsReview));
matched.forEach((im) => {
  const size = im.match.imageSize;
  const points = im.match.landmarks
    .map((lm) => {
      const l = byId.get(lm.id);
      return l ? { p: l.p, px: [lm.px[0] * size[0], lm.px[1] * size[1]] } : null;
    })
    .filter(Boolean);
  check(`${im.id.slice(0, 8)}: all landmark ids resolve`, points.length === im.match.landmarks.length,
    `${points.length}/${im.match.landmarks.length}`);
  const pose = PM.solvePose({
    points, imageSize: size, groundY: solid.groundY,
    centroid: G.polygonCentroid(solid.footprint),
  });
  if (!pose) { check(`${im.id.slice(0, 8)}: pose solves`, false); return; }
  console.log(`  ${im.id.slice(0, 8)}: rmse ${pose.rmse.toFixed(1)}px | fov ${pose.fovV.toFixed(0)}° | ` +
    `pos [${pose.pos.map((v) => v.toFixed(1)).join(', ')}] | height ${(pose.pos[1] - solid.groundY).toFixed(1)}m` +
    (im.match.needsReview ? ' | needs review' : ''));
  // needsReview matches only have to solve — their quality is exactly
  // what the human drag loop is for
  if (im.match.needsReview) return;
  check(`${im.id.slice(0, 8)}: rmse acceptable`, pose.rmse < size[0] * 0.02, pose.rmse.toFixed(1) + ' px');
  check(`${im.id.slice(0, 8)}: camera outside the footprint`,
    !G.pointInPolygon(solid.footprint, pose.pos[0], pose.pos[2]));
  const h = pose.pos[1] - solid.groundY;
  // the plot slopes: a camera on the drive can sit below the house's
  // ground level
  check(`${im.id.slice(0, 8)}: camera at plausible height`, h > -1 && h < 4.5, h.toFixed(1) + ' m');
  const [ccx, ccz] = G.polygonCentroid(solid.footprint);
  const dist = Math.hypot(pose.pos[0] - ccx, pose.pos[2] - ccz);
  check(`${im.id.slice(0, 8)}: camera at plausible distance`, dist > 4 && dist < 40, dist.toFixed(1) + ' m');
  const fwd = PM.poseForward(pose);
  const to = [(ccx - pose.pos[0]) / dist, (ccz - pose.pos[2]) / dist];
  const dot = fwd[0] * to[0] + fwd[2] * to[1];
  check(`${im.id.slice(0, 8)}: camera faces the building`, dot > 0.6, dot.toFixed(2));
});

console.log('\n' + (failures ? `${failures} FAILURE(S)` : 'all checks passed'));
process.exit(failures ? 1 : 0);
