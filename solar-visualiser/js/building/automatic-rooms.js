// Reviewed plan adapters become remote room hypotheses automatically.
// Existing layouts are never replaced. Measurements and source evidence stay separate.
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./roof-edit'),require('./building-project'),require('./floors'),require('./rooms'),require('./floorplan'),require('./plan-intake'),require('./heat-loss'),require('./geometry'));else root.SolarViz.automaticRooms=factory(root.SolarViz.roofEdit,root.SolarViz.buildingProject,root.SolarViz.buildingFloors,root.SolarViz.buildingRooms,root.SolarViz.buildingFloorplan,root.SolarViz.planIntake,root.SolarViz.heatLoss,root.SolarViz.buildingGeometry);})(typeof window!=='undefined'?window:globalThis,function(E,B,F,R,FP,I,H,G){
'use strict';
const VERSION=1;
const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
const sourceKey=(state,base)=>H.fingerprint(canonical({faces:E.resolve(base,state.roofEdits),storeys:state.storeys}));
function prepare(state,report,workflow,base,origin){
 if(state.geometrySource?.propertyId!=='3broomroad'||report?.propertyId!==state.geometrySource.propertyId||workflow?.propertyId!==report.propertyId)return {state,changed:false};
 if(state.automaticRooms?.version===VERSION)return {state,changed:false};
 const next=E.clone(state),faces=E.resolve(base,next.roofEdits),stage=report.stages.find(s=>s.id===next.geometrySource.stageId);
 if(!stage)return {state,changed:false};
 const solid=E.build(faces,origin);if(!solid)return {state,changed:false};
 next.storeys.lowerGround ||= {enabled:true,depth:2.6,faceIds:faces.filter(f=>f.id.startsWith('main-')||f.id.startsWith('bay-')).map(f=>f.id),source:'Listing plan; provisional main-house extent and 2.6 m depth.'};
 const lower=B.lowerGround(faces,origin,next.storeys.lowerGround),levelSolids={};
 if(next.storeys.upperFaceIds)levelSolids[1]=E.build(faces.filter(f=>next.storeys.upperFaceIds.includes(f.id)),origin);
 const levels=F.computeFloors(solid,{...next.storeys,storeyHeight:next.storeys.storeyHeight||Math.max(2,(solid.eaveY-solid.groundY)/next.storeys.count),levelSolids});
 if(lower)levels.push(F.makeLevel(lower,{idx:levels.length,kind:'lower-ground',name:'Lower ground',baseY:lower.groundY,slabTopY:lower.groundY+next.storeys.slabT,ceilingY:solid.groundY}));
 const records=[];next.floors ||= {};
 for(const level of levels){const current=next.floors[level.idx];
  if(current&&(current.dividers?.length||Object.keys(current.roomNames||{}).length||current.floorplan)){records.push({level:level.idx,status:'preserved',reason:'Existing room layout retained'});continue;}
  const plan=I.forLevel(workflow,level);if(!plan){records.push({level:level.idx,status:'needs-review',reason:'No reviewed plan adapter for this floor'});continue;}
  const transform=I.transform(plan,stage.model.parameters,origin),mapped=FP.mapPlan({planFloor:plan,transform,worldOutline:level.outline,deriveRooms:R.deriveRooms});
  const area=mapped.rooms.reduce((sum,r)=>sum+Math.abs(G.polygonArea(r.poly)),0);
  if(mapped.failed.length||mapped.unassigned.length||mapped.rooms.length!==plan.rooms.length||Math.abs(area-level.area)>.01){records.push({level:level.idx,status:'needs-review',reason:'Room boundaries or labels could not be mapped reliably',failedWalls:mapped.failed.length,unassigned:mapped.unassigned});continue;}
  const maxOffset=Math.max(...FP.applyToPoly(transform,plan.outline).map(([x,z])=>Math.min(...level.outline.map((a,i)=>G.distPointToSegment(x,z,...a,...level.outline[(i+1)%level.outline.length]).d))));
  next.floors[level.idx]={dividers:mapped.dividers,roomNames:mapped.roomNames,roomTypes:mapped.roomTypes,roomSources:mapped.roomSources,floorplan:{transform,source:plan.source,automatic:true}};
  records.push({level:level.idx,status:'mapped',rooms:mapped.rooms.length,maxOutlineOffsetM:maxOffset,confidence:'low',source:plan.source});
 }
 next.automaticRooms={version:VERSION,propertyId:report.propertyId,stageId:stage.id,status:records.some(r=>r.status==='needs-review')?'needs-review':'mapped',records,sourceGeometry:sourceKey(next,base),basis:'Remote hypothesis; wall thickness, stair voids, heated status and dimensions unverified'};
 return {state:next,changed:true};
}
return {prepare,sourceKey,VERSION};
});
