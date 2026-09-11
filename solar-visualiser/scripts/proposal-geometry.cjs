// Reproduce the ASHP room model in the property frame without browser state.
const E=require('../js/building/roof-edit'),B=require('../js/building/building-project'),A=require('../js/building/automatic-rooms'),F=require('../js/building/floors'),R=require('../js/building/rooms'),H=require('../js/building/heat-loss'),X=require('../js/building/reconstruction'),P=require('../js/building/plan-geometry'),G=require('../js/building/geometry');
const report=require('../3broomroad-data/reconstruction/run.json'),workflow=require('../3broomroad-data/reconstruction/workflow.json'),site=require('../3broomroad-data/solarpotential.json');
const GP=require('../js/building/geometry-prep');
function derive(){
 const origin={x:0,y:0,z:0},base=E.baseFaces(site),stage=B.candidate(report,'3broomroad');
 let state=B.adopt({version:1,settings:{},storeys:{},windows:[],radiators:[],photoMatches:{},floors:{}},report,base,'3broomroad');
 state=A.prepare(state,report,workflow,base,origin).state;
 const faces=E.resolve(base,state.roofEdits),solid=E.build(faces,origin),lower=B.lowerGround(faces,origin,state.storeys.lowerGround);
 const levels=F.computeFloors(solid,{...state.storeys,levelSolids:{1:E.build(faces.filter(f=>state.storeys.upperFaceIds.includes(f.id)),origin)}});
 levels.push(F.makeLevel(lower,{idx:levels.length,kind:'lower-ground',name:'Lower ground',baseY:lower.groundY,slabTopY:lower.groundY+state.storeys.slabT,ceilingY:solid.groundY}));
 const roomsByLevel=Object.fromEntries(levels.map(l=>[l.idx,R.deriveRooms(l.outline,state.floors[l.idx].dividers).rooms.map(r=>({...r,name:state.floors[l.idx].roomNames[r.id],sourceRoomId:state.floors[l.idx].roomSources[r.id]}))]));
 const openings=stage.model.openings.map(o=>({...o,ring:X.world(o.ring,stage.model.parameters)})),geometry=H.derive({solid,levels,roomsByLevel,windows:openings,origin});
 // Rooflights are absent from the wall-only opening binder. Allocate their true
 // sloping areas by plan overlap to the exposed room roofs, exactly once.
 for(const o of openings.filter(o=>o.kind==='rooflight')){
  const poly=o.ring.map(p=>[p[0],p[2]]),face=G.fitPlane(o.ring.map(([x,y,z])=>({x,y,z}))),factor=Math.hypot(1,face.a,face.b);
  for(const r of geometry.rooms){const s=geometry.surfaces.find(s=>s.roomA===r.id&&s.kind==='roof');if(!s)continue;
   const a=P.area(P.intersection(poly,r.poly))*factor;if(a<1e-5)continue;
   s.openings.push({id:o.id,kind:o.kind,area:a});s.openingArea+=a;s.netArea-=a;
  }
 }
 const p=stage.model.parameters,a=p.bearing*Math.PI/180;
 const local=([x,z])=>[(x-p.anchor_x)*Math.sin(a)-(z-p.anchor_z)*Math.cos(a),-(x-p.anchor_x)*Math.cos(a)-(z-p.anchor_z)*Math.sin(a)];
 for(const r of geometry.rooms){r.localPoly=r.poly.map(local);r.levelName=levels[r.levelIdx].name;r.photos=workflow.case.rooms.find(q=>q.id===r.sourceRoomId)?.photos||[];}
 GP.boundaryHypotheses(geometry,p,'3broomroad');
 for(const s of geometry.surfaces){
  s.boundary=s.roomB?'room':s.kind==='floor'?'ground':'outside';
  if(!s.roomB&&s.edge){const e=s.edge.map(local);s.localEdge=e;
   // OS mid-terrace + plan: only the main-house side runs are party hypotheses.
   if(s.boundaryHypothesis==='party')s.boundary='party';
   else if(geometry.rooms.find(r=>r.id===s.roomA).levelIdx===2)s.boundary='basement-mixed';
  }
  s.basis=s.boundaryBasis||'Remote boundary hypothesis; confirm extent on site';
 }
 return {geometry,model:stage.model,stageId:stage.id,modelRevision:report.workflowRevision,levelNames:levels.map(l=>l.name),openingCoverage:openings.map(o=>({id:o.id,areaAssigned:geometry.surfaces.flatMap(s=>s.openings).filter(x=>x.id===o.id).reduce((n,x)=>n+x.area,0)}))};
}
module.exports=derive;
if(require.main===module)process.stdout.write(JSON.stringify(derive()));
