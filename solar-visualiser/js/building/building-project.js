// A reviewed candidate becomes ordinary editable ASHP state; lower ground is a derived auxiliary volume.
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./roof-edit.js'),require('./reconstruction.js'),require('./geometry.js'));else root.SolarViz.buildingProject=factory(root.SolarViz.roofEdit,root.SolarViz.reconstruction,root.SolarViz.buildingGeometry);})(typeof window!=='undefined'?window:globalThis,function(E,R,G){
'use strict';
const clone=E.clone;
function candidate(report,propertyId){if(!report||report.propertyId!==propertyId)throw Error('Reconstruction belongs to another property');const stage=report.stages.find(s=>s.id===report.recommendedStage);if(!stage)throw Error('Recommended reconstruction is missing');const v=E.validate(stage.worldFaces);if(v.errors.length)throw Error(v.errors.join(' '));return stage;}
function adopt(state,report,base,propertyId){const stage=candidate(report,propertyId),next=clone(state),backup=clone(state);delete backup.reconstructionBackup;
 next.reconstructionBackup=backup;next.roofEdits=E.diff(base,stage.worldFaces);next.footprintOffsets=null;next.footprintDeleted=null;
 delete next.automaticRooms;next.floors={};next.windows=[];next.radiators=[];next.thermal=null;
 next.storeys={...next.storeys,lowerGround:null,count:2,storeyHeight:2.8,slabT:.2,includeAttic:false,upperFaceIds:stage.worldFaces.filter(f=>f.id!=='rear-extension').map(f=>f.id)};
 next.geometrySource={kind:'reconstruction',propertyId,stageId:stage.id,label:stage.label,revision:report.workflowRevision||stage.id,limitations:clone(report.provenance.limitations),dimensions:'inferred-unverified',adoptedAt:new Date().toISOString()};
 next.pendingCandidateOpenings=stage.model.openings.map(o=>({...clone(o),ring:R.world(o.ring,stage.model.parameters)}));
 E.invalidateMatches(next);return next;
}
function bindOpenings(openings,solid,levels,origin){const bound=[],unbound=[];
 for(const o of openings){const pts=o.ring.map(p=>[p[0]+origin.x,p[1]+origin.y,p[2]+origin.z]);let found=null;
  for(const w of solid.wallPanels){if(pts.some(p=>Math.abs((p[0]-w.a2[0])*w.normal[0]+(p[2]-w.a2[1])*w.normal[1])>.025))continue;
   const us=pts.map(p=>(p[0]-w.a2[0])*w.dir[0]+(p[2]-w.a2[1])*w.dir[1]),ys=pts.map(p=>p[1]),u0=Math.min(...us),u1=Math.max(...us),y0=Math.min(...ys),y1=Math.max(...ys);
   if(u0<-.01||u1>w.len+.01||y0<w.bottom||y1>Math.max(...w.topProfile.map(p=>p[1]))+.01||u1-u0<.05||y1-y0<.05)continue;
   const lv=[...levels].sort((a,b)=>b.slabTopY-a.slabTopY).find(l=>l.slabTopY<=y0+.05)||levels[0];
   found={id:'reconstruction:'+o.id,kind:o.kind,wallId:w.id,levelIdx:lv.idx,u:(u0+u1)/2,width:u1-u0,height:y1-y0,sill:y0-lv.slabTopY,profile:us.map((u,i)=>[(u-u0)/(u1-u0),(ys[i]-y0)/(y1-y0)]),sourceId:o.id,confidence:o.confidence};break;
  }
  if(found)bound.push(found);else unbound.push({...clone(o),reason:o.kind==='rooflight'?'Roof opening needs a roof surface assignment': 'Outside the current floor/wall model; retain for review'});
 }
 return {bound,unbound};
}
// Separate closed lower-ground volume; the above-ground roof model stays unchanged.
function lowerGround(faces,origin,config){
 if(!config?.enabled)return null;
 if(!Number.isFinite(config.depth)||config.depth<1.8||config.depth>4)throw Error('Lower-ground depth must be between 1.8 and 4 m');
 const main=E.build(faces.filter(f=>config.faceIds.includes(f.id)),origin);
 if(!main)throw Error('Lower-ground footprint source is missing');
 const caps=main.loops.map((loop,i)=>({id:'lower-cap:'+i,active:true,ring:loop.poly.map(([x,z])=>({x:x-origin.x,y:config.depth,z:z-origin.z}))}));
 const lower=E.build(caps,{...origin,y:origin.y-config.depth});
 lower.wallPanels.forEach(w=>{w.id='lower:'+w.id;w.levelBand='lower-ground';});
 return lower;
}
return {candidate,adopt,bindOpenings,lowerGround};
});
