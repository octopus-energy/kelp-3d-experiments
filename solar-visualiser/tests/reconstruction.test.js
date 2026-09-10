// Regression checks for the real Broom Road reconstruction artifact.
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),dataRoot=path.join(root,'3broomroad-data');
const report=require('../3broomroad-data/reconstruction/run.json');
const R=require('../js/building/reconstruction.js'),E=require('../js/building/roof-edit.js'),G=require('../js/building/geometry.js');
assert.equal(report.propertyId,'3broomroad');assert.equal(report.quality.depthUsed,false);assert.equal(report.evidence.depth.status,'not-run');
assert.equal(report.stages.length,6);assert(report.stages.some(s=>s.id==='mono-across'));assert(report.stages.some(s=>s.id==='mono-along'));
for(const [file,hash] of Object.entries(report.provenance.inputs))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(dataRoot,file))).digest('hex'),hash,file+' input changed: rerun reconstruction');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(dataRoot,'reconstruction/bundle.js'),'utf8'),ctx);assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.BROOM_RECONSTRUCTION)),report,'Offline bundle and JSON agree');
let identities;
for(const stage of report.stages){
 const before=JSON.stringify(stage),validation=E.validate(stage.worldFaces);
 assert.deepEqual(validation.errors,[],stage.id+' geometry valid');assert(validation.solid.watertight.closed&&validation.solid.watertight.oriented);
 for(const f of stage.worldFaces){const plane=G.fitPlane(f.ring);for(const p of f.ring)assert(Math.abs(p.y-G.planeY(plane,p.x,p.z))<1e-6,'Roof faces stay planar');}
 const ids=Object.keys(stage.model.landmarks).sort();if(identities)assert.deepEqual(ids,identities,'Landmark identities survive parameter changes');identities=ids;
 for(const photo of stage.photos){
  assert(Math.abs(R.evaluate(stage,photo)-photo.rmsePx)<1e-6,'Browser projection reproduces Python fit residuals');
  const points=R.project(Object.values(stage.model.landmarks),photo.camera);assert(points.every(p=>p.every(Number.isFinite)&&p[2]>0),'Front landmarks remain in front of camera');
  const expected=photo.role==='check'?'check':'fit';assert(photo.observations.filter(o=>o.kind==='window').every(o=>o.use===expected),'Check windows must remain separate from fitting evidence');
  for(const o of photo.observations)assert(o.px.every(v=>v>=0&&v<=1));
 }
 for(let i=0;i<stage.model.faces.length;i++){
  const local=stage.model.faces[i].ring,world=R.world(local.map(p=>[p.x,p.y,p.z]),stage.model.parameters);
  for(let j=0;j<world.length;j++)assert(Math.hypot(world[j][0]-stage.worldFaces[i].ring[j].x,world[j][1]-stage.worldFaces[i].ring[j].y,world[j][2]-stage.worldFaces[i].ring[j].z)<1e-8,'Property-frame conversion agrees');
 }
 assert(stage.model.openings.some(o=>o.kind==='door'));assert(stage.model.openings.some(o=>o.kind==='rooflight'));
 for(const o of stage.model.openings){assert(o.confidence,'Inferred openings retain provenance');assert.equal(o.ring.length,4);assert(o.ring.flat().every(Number.isFinite));}
 assert.equal(JSON.stringify(stage),before,'Derived validation never changes the candidate');
 console.log('  ok  '+stage.id+' closed planar geometry, stable landmarks, offline projection');
}
const best=report.stages.find(s=>s.id==='rear-corrected'),base=report.stages[0];
for(const ph of best.photos){const old=base.photos.find(p=>p.imageId===ph.imageId);assert(ph.rmsePx<old.rmsePx,'Both fitting and check views must improve over plan hypothesis');}
assert.equal(best.id,'rear-corrected');assert.equal(best.model.roofType,'both-mono');
assert(report.quality.rearRoofFormConfirmed);assert(report.quality.rearPitchApproximate);
assert.equal(report.quality.rearRoofAmbiguous,false);
const baseline=require('../3broomroad-data/reconstruction/front-fit-baseline.json');
const previous=baseline.stages.find(s=>s.id===baseline.recommendedStage),rearParams=new Set(['wing_eave','wing_rise','extension_low','extension_rise']);
for(const [key,value] of Object.entries(previous.model.parameters))if(!rearParams.has(key))assert.equal(best.model.parameters[key],value,'Preserve front geometry and rear footprint: '+key);
assert.deepEqual(best.photos,previous.photos,'Front cameras, observations and residuals stay unchanged');
assert.deepEqual(best.worldFaces.slice(0,6),previous.worldFaces.slice(0,6),'Front roofs stay unchanged');
for(const opening of previous.model.openings.filter(o=>!['rear-bedroom','bathroom-side-window','extension-rooflight'].includes(o.id)))assert.deepEqual(best.model.openings.find(o=>o.id===opening.id),opening,'Unrelated openings stay unchanged');
assert.equal(best.model.faces.length,8);assert(!best.model.faces.some(f=>['wing-left','wing-right'].includes(f.id)),'Remove the rear gable');
for(const id of ['wing-mono','rear-extension']){
 const faces=best.model.faces.filter(f=>f.id===id);assert.equal(faces.length,1,'One plane per rear volume');
 const f=faces[0],p=best.model.parameters,low=id==='wing-mono'?p.wing_eave:p.extension_low,rise=id==='wing-mono'?p.wing_rise:p.extension_rise;
 for(const v of f.ring)assert(Math.abs(v.y-(low+rise*(1-v.x/p.wing_width)))<1e-8,'Continuous single slope without a central ridge');
}
for(const id of ['rear-bedroom','bathroom-side-window']){
 const opening=best.model.openings.find(o=>o.id===id),p=best.model.parameters;
 assert(Math.max(...opening.ring.map(v=>v[1]))>Math.min(...opening.ring.map(v=>v[1])),'Rear opening has positive height');
 for(const v of opening.ring)assert(v[1]<p.wing_eave+p.wing_rise*(1-v[0]/p.wing_width),'Rear windows fit below the new roof');
}
assert(report.quality.extensionDSMConflict,'Conflicting extension DSM remains explicit');
console.log('all checks passed');
assert.equal(report.previousRearReview.stageId,best.id);assert.equal(report.previousRearReview.geometryChanged,false);
assert.equal(report.previousRearReview.photos.length,2);
for(const ph of report.previousRearReview.photos){
 const source=require('../3broomroad-data/rear-observations.json').photos.find(s=>s.imageId===ph.imageId);
 assert(ph.points.some(o=>o.use==='pose'));assert(ph.points.some(o=>o.use==='check'));
 for(const o of ph.points){const q=R.project([ph.landmarks[o.landmark]],ph.camera)[0];assert(q[2]>0);assert(Math.hypot(q[0]-o.projectedPx[0],q[1]-o.projectedPx[1])<1e-6);assert.equal(o.use,source.points.find(s=>s.landmark===o.landmark).use);}
 if(ph.boundHits.length||ph.checkRmsePx>ph.checkThresholdPx)assert.equal(ph.status,'failed-check','Bad rear alignment cannot pass because the front is good');
}
console.log('all rear camera checks passed: projection parity and explicit failed validation');

const trial=report.rearGeometryTrial;assert.equal(trial.geometryApplied,false);assert.equal(trial.status,'rejected');assert(trial.reasons.length>0);
assert(trial.photos[0].points.every(o=>o.use==='fit'),'Near-photo checks explicitly promoted to training for trial');
assert(trial.photos[1].points.some(o=>o.use==='check'),'Far-photo corner remains withheld');
for(const [name,hash] of Object.entries(report.provenance.codeHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'reconstruction',name))).digest('hex'),hash,'Replay code changed: '+name);

const refined=report.stages.find(s=>s.id===report.recommendedStage),pass=report.exteriorPass;
assert.equal(refined.id,'exterior-refined');assert.equal(pass.candidateSelected,true);assert.equal(pass.accuracyValidated,false);
assert.equal(report.quality.wholeExteriorValidated,false);assert.equal(report.quality.normalConstraintsUsed,true);
assert.deepEqual(refined.photos,best.photos,'Front camera residuals unchanged');
assert.deepEqual(refined.worldFaces.slice(0,7),best.worldFaces.slice(0,7),'Main, bay and upper wing unchanged');
for(const [key,value] of Object.entries(best.model.parameters))if(!['extension_low','extension_rise'].includes(key))assert.equal(refined.model.parameters[key],value,key+' frozen');
assert.equal(pass.geometryApplied,false,'Candidate does not apply itself to saved app edits');
assert(pass.observations.retiredCorrespondences.landmarks.includes('wing-low'));
for(const ph of report.rearReview.photos){
 assert.equal(ph.status,'diagnostic-pass');assert.deepEqual(ph.boundHits,[]);assert(ph.normalErrorDeg<10);
 const source=pass.observations.photos.find(p=>p.imageId===ph.imageId);
 for(const o of ph.points){
  assert.equal(o.use,source.points.find(p=>p.landmark===o.landmark).use);
  const q=R.project([ph.landmarks[o.landmark]],ph.camera)[0];assert(q[2]>0);
  assert(Math.hypot(q[0]-o.projectedPx[0],q[1]-o.projectedPx[1])<1e-6);
 }
 if(ph.checkRmsePx!==null)assert(ph.checkRmsePx<10);
 assert(ph.normal.box.length===4);assert(ph.normal.arraySha256.length===64);
}
assert(report.rearReview.photos[1].points.filter(p=>p.use==='check').length===2,'Retain far frame and fascia-corner checks');
for(const [file,hash] of Object.entries(report.provenance.annotationHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'reconstruction',file))).digest('hex'),hash);
const door=refined.model.openings.find(o=>o.id==='rear-door');assert(Math.abs(door.ring[0][1]-door.ring[1][1])>.2,'Frame follows the visible slope');
assert(refined.model.openings.every(o=>o.ring.flat().every(Number.isFinite)));
// A sloped polygon opening must remove its polygon area, not its bounding box.
global.THREE=require('../vendor/three.min.js');const S=require('../js/building/solid.js');
const panel={bottom:0,len:5,topA:5,topB:5,a2:[0,0],dir:[1,0],normal:[0,1]};
function meshArea(g){const p=g.attributes.position,idx=g.index;let area=0;for(let i=0;i<idx.count;i+=3){const v=[0,1,2].map(j=>new THREE.Vector3().fromBufferAttribute(p,idx.getX(i+j)));area+=v[1].sub(v[0]).cross(v[2].sub(v[0])).length()/2;}return area;}
assert(Math.abs(meshArea(S.wallGeometry(panel,[{ring:[[1,1],[3,1],[3,3],[1,2]]}]))-22)<1e-6);
assert(Math.abs(meshArea(S.wallGeometry(panel,[{u0:1,u1:3,v0:1,v1:3}]))-21)<1e-6);
console.log('all exterior refinement checks passed: preserved front, raw normals, diagnostic separation, sloped frame holes');
