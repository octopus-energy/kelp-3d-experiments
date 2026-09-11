// Room/envelope hypotheses and revision-scoped survey corrections. No heat-loss calculation.
(function(root,factory){
  if(typeof module!=='undefined'&&module.exports) module.exports=factory(require('./heat-loss.js'),require('./geometry.js'));
  else root.SolarViz.geometryPrep=factory(root.SolarViz.heatLoss,root.SolarViz.buildingGeometry);
})(typeof window!=='undefined'?window:globalThis,function(H,G){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const BOUNDARIES=['unknown','external','party','ground','unheated'];
const ROOM_FIELDS=['length','width','height','area','volume','heatedStatus'];
const SURFACE_FIELDS=['boundary','grossArea','openingArea'];
const positive=n=>Number.isFinite(n)&&n>0;
function empty(propertyId,signature){return {version:1,propertyId,draftSignature:signature,rooms:{},surfaces:{},revisions:[],events:[],decisions:[]};}
function draftHash(state){const populated=map=>Object.fromEntries(Object.entries(map).filter(([,v])=>Object.keys(v).length));return H.fingerprint({rooms:populated(state.rooms),surfaces:populated(state.surfaces)});}
function activeRevision(state,geometry){
  return state.revisions.findLast(r=>r.geometrySignature===geometry.signature&&r.draftHash===draftHash(state))||null;
}
function checkpoint(state,geometry,modelInputs,id,recordedAt){
  if(state.draftSignature!==geometry.signature)throw Error('Start a new draft for the changed geometry first.');
  if(!id||state.revisions.some(r=>r.id===id)||!Number.isFinite(Date.parse(recordedAt)))throw Error('Invalid revision identity/date.');
  const next=clone(state),model=clone(modelInputs);
  delete model.geometryPrep;delete model.reconstructionBackup;delete model.thermal;
  next.revisions.push({id,recordedAt,geometrySignature:geometry.signature,draftHash:draftHash(state),inputs:clone({rooms:state.rooms,surfaces:state.surfaces}),targets:{rooms:geometry.rooms.map(r=>r.id),surfaces:geometry.surfaces.map(s=>s.id),shared:geometry.surfaces.filter(s=>s.roomB).map(s=>s.id)},modelInputs:model});
  return next;
}
function rebase(state,geometry){
  const next=clone(state);
  // Earlier checkpoints/events remain intact; old draft inputs stay available in this archive.
  (next.archivedDrafts ||= []).push({signature:state.draftSignature,rooms:next.rooms,surfaces:next.surfaces});
  next.rooms={};next.surfaces={};next.draftSignature=geometry.signature;return next;
}
function validateValue(kind,field,value){
  if(!(kind==='room'?ROOM_FIELDS:SURFACE_FIELDS).includes(field))throw Error('Unsupported geometry field.');
  if(field==='heatedStatus'){if(!['heated','unheated','unknown'].includes(value))throw Error('Choose a room use status.');}
  else if(field==='boundary'){if(!BOUNDARIES.includes(value))throw Error('Choose a boundary type.');}
  else if(!Number.isFinite(value)||value<(field==='openingArea'?0:.001)||value>10000)throw Error('Enter a valid measurement in metres, m² or m³.');
}
function append(state,geometry,event){
  const revision=activeRevision(state,geometry);
  if(!revision||event.revisionId!==revision.id||event.geometrySignature!==geometry.signature)throw Error('Save a current remote snapshot before recording survey evidence.');
  if(!['room','surface'].includes(event.targetKind))throw Error('Invalid target kind.');
  const target=(event.targetKind==='room'?geometry.rooms:geometry.surfaces).find(r=>r.id===event.targetId);
  if(!target)throw Error('Geometry target no longer exists.');
  if(event.targetKind==='surface'&&target.roomB&&event.field==='boundary')throw Error('Shared room adjacency comes from the room layout; correct that layout first.');
  for(const k of ['id','observer','method','recordedAt','evidenceRef'])if(typeof event[k]!=='string'||!event[k].trim())throw Error('Observer, method and evidence reference are required.');
  if(!Number.isFinite(Date.parse(event.recordedAt))||state.events.some(e=>e.id===event.id))throw Error('Invalid or duplicate observation.');
  if(!['measured','not-accessible'].includes(event.status))throw Error('Invalid observation status.');
  if(event.status==='measured')validateValue(event.targetKind,event.field,event.value);
  else if(typeof event.note!=='string'||!event.note.trim())throw Error('Explain what could not be checked.');
  const next=clone(state);next.events.push(clone(event));return next;
}
function decide(state,geometry,eventId,action,recordedAt){
  const event=state.events.find(e=>e.id===eventId),revision=activeRevision(state,geometry);
  if(!event||!revision||event.revisionId!==revision.id||event.geometrySignature!==geometry.signature)throw Error('This observation belongs to an earlier geometry revision. Retain it as evidence and recheck the current target.');
  if(!['accept','reject'].includes(action)||!Number.isFinite(Date.parse(recordedAt)))throw Error('Invalid review decision.');
  if(action==='accept'&&(event.status!=='measured'||event.value==='unknown'))throw Error('An inaccessible or unknown item remains unresolved.');
  const next=clone(state);next.decisions.push({eventId,action,recordedAt});return next;
}
function accepted(state,geometry){
  const revision=activeRevision(state,geometry);if(!revision)return [];
  const decisions=new Map(state.decisions.map(d=>[d.eventId,d.action]));
  return state.events.filter(e=>e.revisionId===revision.id&&e.geometrySignature===geometry.signature&&e.status==='measured'&&decisions.get(e.id)==='accept');
}
function span(poly){
  let best=[1,0],longest=0;
  poly.forEach((p,i)=>{const q=poly[(i+1)%poly.length],d=[q[0]-p[0],q[1]-p[1]],len=Math.hypot(...d);if(len>longest){longest=len;best=d.map(v=>v/len);}});
  return [best,[-best[1],best[0]]].map(axis=>{const v=poly.map(p=>p[0]*axis[0]+p[1]*axis[1]);return Math.max(...v)-Math.min(...v);});
}
function roomEstimate(room,input={}){
  const [length,width]=span(room.poly),area=positive(input.area)?input.area:room.floorArea;
  const height=positive(input.height)?input.height:room.volume/room.floorArea;
  return {length:positive(input.length)?input.length:length,width:positive(input.width)?input.width:width,area,height,
    volume:positive(input.volume)?input.volume:(positive(input.area)||positive(input.height)?area*height:room.volume),
    heatedStatus:input.heatedStatus||'unknown'};
}
function review(geometry,state){
  const stale=state.draftSignature!==geometry.signature,events=accepted(state,geometry),rooms=[],surfaces=[];
  function overlay(kind,id,remote){const current={...remote},checked=[];for(const e of events.filter(e=>e.targetKind===kind&&e.targetId===id)){current[e.field]=e.value;checked.push(e.field);}return {current,checked:[...new Set(checked)]};}
  for(const r of geometry.rooms){const input=stale?{}:state.rooms[r.id]||{},remote=roomEstimate(r,input),o=overlay('room',r.id,remote);
    if(!o.checked.includes('volume')&&(o.checked.includes('area')||o.checked.includes('height')))o.current.volume=o.current.area*o.current.height;
    rooms.push({...r,remote,...o,confidence:input.confidence||'low',uncertaintyPct:positive(input.uncertaintyPct)?input.uncertaintyPct:20,source:input.source||'Exterior shell and assumed floor spacing; net dimensions unverified',planRoomId:Object.hasOwn(input,'planRoomId')?input.planRoomId:r.sourceRoomId||null});
  }
  for(const s of geometry.surfaces){const input=stale?{}:state.surfaces[s.id]||{},remote={boundary:s.roomB?'internal':input.boundary||s.boundaryHypothesis||'unknown',grossArea:positive(input.grossArea)?input.grossArea:s.grossArea,openingArea:Number.isFinite(input.openingArea)&&input.openingArea>=0?input.openingArea:s.openingArea},o=overlay('surface',s.id,remote);
    surfaces.push({...s,remote,...o,netArea:o.current.grossArea-o.current.openingArea,confidence:input.confidence||'low',source:input.source||s.boundaryBasis||(s.roomB?'Derived room adjacency; occupancy not checked':'Unclassified')});
  }
  return {rooms,surfaces,stale,activeRevision:activeRevision(state,geometry)?.id||null,stage:events.length?'site-refined':'remote',acceptedFields:events.length,
    issues:[...(geometry.coverageIssues||[]),...rooms.flatMap(r=>(r.geometryIssues||[]).map(m=>r.name+': '+m)),...surfaces.filter(s=>s.netArea<0).map(s=>s.id+': openings exceed surface area')]};
}
// Reviewed Broom Road adjacency, in property coordinates after H.derive removes origin.
// Facing a neighbour across a courtyard is not evidence of a shared wall.
function boundaryHypotheses(geometry,parameters,propertyId){
 if(propertyId!=='3broomroad'||!parameters)return geometry;
 const p=parameters,a=p.bearing*Math.PI/180,local=([x,z])=>[(x-p.anchor_x)*Math.sin(a)-(z-p.anchor_z)*Math.cos(a),-(x-p.anchor_x)*Math.cos(a)-(z-p.anchor_z)*Math.sin(a)];
 for(const s of geometry.surfaces){
  if(s.roomB||!s.edge||s.kind!=='wall')continue;
  const e=s.edge.map(local),level=geometry.rooms.find(r=>r.id===s.roomA).levelIdx;
  s.localEdge=e;
  const left=e.every(([x])=>Math.abs(x)<.02),right=e.every(([x])=>Math.abs(x-p.width)<.02);
  if((left||right)&&e.every(([,z])=>z>=-.02&&z<=p.length+.02)){
   s.boundaryHypothesis='party';s.boundaryGroup=left?'main-left':'main-right';s.boundaryBasis='OS mid-terrace, connectivity_count=2, aerial and floorplan: main-house side shared with neighbour. Extent/temperature unverified.';
  }else if(left&&e.every(([,z])=>z>=p.length-.02&&z<=p.extension_end+.02)&&[0,1].includes(level)){
   s.boundaryHypothesis='unknown';s.boundaryGroup='rear-neighbour-'+(level===0?'ground':'upper');s.boundaryBasis='Blank rear neighbour-side wall. Aerial/rear photo show adjacent structures including glazing; contact and heated extent need confirmation. Facing a neighbour does not alone establish party adjacency.';
  }
 }
 geometry.quantitySignature ||= geometry.signature;
 geometry.signature=H.fingerprint({quantities:geometry.quantitySignature,adjacency:geometry.surfaces.filter(s=>s.boundaryHypothesis).map(s=>[s.id,s.boundaryHypothesis,s.boundaryGroup,s.boundaryBasis])});
 return geometry;
}
function suggestions(geometry,state){
  if(state.draftSignature!==geometry.signature)throw Error('Start a current geometry draft first.');
  const next=clone(state);
  for(const s of geometry.surfaces){if(s.roomB||next.surfaces[s.id]?.boundary)continue;
    const boundary=s.kind==='roof'||(s.kind==='wall'&&s.openingArea>0)?'external':null;
    if(boundary)next.surfaces[s.id]={boundary,confidence:'low',source:s.kind==='roof'?'Roof surface in exterior model; ceiling construction needs checking':'Wall with listing-derived opening; check for enclosed/unheated space beyond'};
  }return next;
}
function surfaceRuns(surfaces){
  const buckets=new Map(),result=[];
  for(const s of surfaces){
    if(!s.edge){result.push([s]);continue;}
    const [a,b]=s.edge,dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);let axis=[dx/len,dy/len];if(axis[0]<-1e-8||(Math.abs(axis[0])<1e-8&&axis[1]<0))axis=axis.map(v=>-v);
    const normal=[-axis[1],axis[0]],key=[s.roomA,s.roomB||'',s.kind,s.bottom===undefined?'step':Math.round(s.bottom*1000),...normal.map(v=>Math.round(v*1000)),Math.round((normal[0]*a[0]+normal[1]*a[1])*1000)].join(':');
    const values=[a,b].map(p=>p[0]*axis[0]+p[1]*axis[1]);if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push({s,lo:Math.min(...values),hi:Math.max(...values)});
  }
  for(const bucket of buckets.values()){
    bucket.sort((a,b)=>a.lo-b.lo);let run=[],end=-Infinity;
    for(const item of bucket){if(item.lo>end+.02){if(run.length)result.push(run);run=[];}run.push(item.s);end=Math.max(end,item.hi);}if(run.length)result.push(run);
  }
  return result;
}
function priorities(geometry,state,coverage=[]){
  const r=review(geometry,state),tasks=coverage.map((c,i)=>typeof c==='string'?{id:'coverage:'+i,rank:10000-i,priority:'critical',title:c,why:'Missing coverage or conflicting evidence can change the envelope.',method:'Confirm the affected space, its use, extent and adjacency; annotate a plan/photo before refining smaller dimensions.'}:{...c,id:'coverage:'+c.id});
  for(const room of r.rooms){
    if(room.localId==='r')tasks.push({id:'layout:'+room.id,rank:9000,priority:'critical',targetKind:'room',targetId:room.id,field:'area',title:room.name+': confirm room layout',why:'An undivided floor is not a room schedule.',method:'Check the plan against the actual layout and draw the partitions before validating room quantities.'});
    if(room.current.heatedStatus==='unknown'||!room.checked.includes('heatedStatus'))tasks.push({id:'use:'+room.id,rank:7000,priority:'high',targetKind:'room',targetId:room.id,field:'heatedStatus',title:room.name+': confirm room use',why:'Heated/unheated status changes which surfaces bound the conditioned space.',method:'Ask the homeowner how the room is used and record the intended heated status.'});
    for(const field of ['area','height'])if(!room.checked.includes(field))tasks.push({id:field+':'+room.id,rank:1000+room.current.volume*room.uncertaintyPct/100,priority:room.confidence==='high'?'normal':'high',targetKind:'room',targetId:room.id,field,title:room.name+': check '+(field==='area'?'internal floor area':'clear ceiling height'),why:`Remote estimate ${room.current[field].toFixed(2)} ${field==='area'?'m²':'m'}; ${room.uncertaintyPct}% working uncertainty.`,method:field==='area'?'Measure key internal wall runs and any bay/recess; calculate polygon area, not maximum length × width. Check one reliable dimension against the listing plan scale.':'Measure floor-to-ceiling height; for slopes record both end heights and the affected lengths. Use the area-weighted mean for volume.'});
  }
  for(const s of r.surfaces)if(!s.roomB&&!s.checked.includes('boundary'))tasks.push({id:'boundary:'+s.id,rank:(s.current.boundary==='unknown'?8500:5000)+s.current.grossArea,priority:'high',targetKind:'surface',targetId:s.id,field:'boundary',title:`${r.rooms.find(x=>x.id===s.roomA)?.name}: ${s.current.boundary==='unknown'?'classify': 'verify '+s.current.boundary} ${s.kind}`,why:`${s.current.grossArea.toFixed(1)} m²; a party/external or unheated-space error changes the envelope.`,method:'Identify the actual space beyond this surface. Mark its extent on a plan/photo; split the room boundary in the geometry editor if only part adjoins a neighbour.'});
  for(const s of r.surfaces)if(s.openingArea>0&&!s.checked.includes('openingArea'))tasks.push({id:'openings:'+s.id,rank:100+s.openingArea,priority:'normal',targetKind:'surface',targetId:s.id,field:'openingArea',title:`${r.rooms.find(x=>x.id===s.roomA)?.name}: check opening area`,why:`${s.openingArea.toFixed(1)} m² of openings on this surface.`,method:'Measure the largest glazing/door first and note unusual shapes. Record total opening area on this surface.'});
  // Treat a collinear wall run as one survey check, rather than one per roof-clipping fragment.
  const grouped=[],runs=new Map();
  for(const task of tasks){
    const surface=task.field==='boundary'?r.surfaces.find(s=>s.id===task.targetId):null;
    if(!surface?.edge){grouped.push(task);continue;}
    const [a,b]=surface.edge,dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);let normal=[-dy/length,dx/length];if(normal[0]<-1e-8||(Math.abs(normal[0])<1e-8&&normal[1]<0))normal=normal.map(v=>-v);
    const line=[...normal,normal[0]*a[0]+normal[1]*a[1]].map(v=>Math.round(v*1000)).join(':');
    const key=surface.roomA+':'+line+':'+surface.current.boundary;
    if(!runs.has(key)){task.targetIds=[task.targetId];task.area=surface.current.grossArea;runs.set(key,task);grouped.push(task);}
    else{const run=runs.get(key);run.targetIds.push(task.targetId);run.area+=surface.current.grossArea;run.rank+=surface.current.grossArea;}
  }
  for(const task of runs.values())if(task.targetIds.length>1){task.title+=' · wall run';task.why=task.area.toFixed(1)+' m² across '+task.targetIds.length+' collinear model segments; check the extent of party/external contact along the run.';}
  return grouped.sort((a,b)=>b.rank-a.rank||a.id.localeCompare(b.id));
}
// Plan-space evidence only: a scalar scale per floor, never max length × max width.
function planEstimates(workflow,height=2.6){
  const rooms=workflow?.case?.rooms||[],scales={};
  for(const r of rooms){if(!r.printedMaxDimensionsM)continue;const xs=r.planPolygon.map(p=>p[0]),ys=r.planPolygon.map(p=>p[1]);const px=[Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys)].sort((a,b)=>a-b),m=[...r.printedMaxDimensionsM].sort((a,b)=>a-b);(scales[r.level] ||= []).push(Math.sqrt(m[0]*m[1]/(px[0]*px[1])));}
  return rooms.map(r=>{const samples=(scales[r.level]||[]).sort((a,b)=>a-b),scale=samples.length?samples[Math.floor(samples.length/2)]:null;const area=scale?Math.abs(G.polygonArea(r.planPolygon))*scale*scale:null;return {...r,estimate:{area,height,volume:area===null?null:area*height,scale,confidence:'low',source:'Listing plan polygon; median scale from printed maximum dimensions on this level. Height is a 2.6 m working assumption. Not aligned to the 3D rooms.'}};});
}
function merge(state,incoming,propertyId){
  if(incoming?.version!==1||incoming.propertyId!==propertyId||state.propertyId!==propertyId||!Array.isArray(incoming.revisions)||!Array.isArray(incoming.events))throw Error('Review packet belongs to another property or format.');
  const next=clone(state);
  // Only append against an identical saved baseline; importing evidence never applies it.
  for(const rev of incoming.revisions){const local=state.revisions.find(r=>r.id===rev.id);if(!local||JSON.stringify(local)!==JSON.stringify(rev))throw Error('Remote snapshot differs. Import the matching building model first.');}
  for(const event of incoming.events){
    const old=next.events.find(e=>e.id===event.id);if(old){if(JSON.stringify(old)!==JSON.stringify(event))throw Error('Conflicting observation ID.');continue;}
    const rev=next.revisions.find(r=>r.id===event.revisionId);
    if(!rev||rev.geometrySignature!==event.geometrySignature)throw Error('Unknown observation revision.');
    if(!['room','surface'].includes(event.targetKind)||!(event.targetKind==='room'?rev.targets.rooms:rev.targets.surfaces).includes(event.targetId))throw Error('Unknown geometry target.');
    if(event.targetKind==='surface'&&rev.targets.shared.includes(event.targetId)&&event.field==='boundary')throw Error('Cannot override shared room adjacency.');
    if(!(event.targetKind==='room'?ROOM_FIELDS:SURFACE_FIELDS).includes(event.field))throw Error('Unsupported field.');
    if(event.status==='measured')validateValue(event.targetKind,event.field,event.value);
    else if(event.status!=='not-accessible'||typeof event.note!=='string'||!event.note.trim())throw Error('Invalid inaccessible observation.');
    for(const key of ['id','observer','method','evidenceRef'])if(typeof event[key]!=='string'||!event[key].trim())throw Error('Incomplete observation provenance.');
    if(!Number.isFinite(Date.parse(event.recordedAt)))throw Error('Invalid observation date.');
    next.events.push(clone(event));
  }
  return next;
}
function preserveHistory(current,incoming){
  if(!current)return incoming?clone(incoming):null;
  if(!incoming)return clone(current);
  if(current.propertyId!==incoming.propertyId)throw Error('Geometry evidence belongs to another property.');
  const next=clone(incoming);
  for(const key of ['revisions','events']){
    const map=new Map(current[key].map(r=>[r.id,r]));
    for(const r of incoming[key]){if(map.has(r.id)&&JSON.stringify(map.get(r.id))!==JSON.stringify(r))throw Error('Conflicting geometry evidence ID.');map.set(r.id,r);}
    next[key]=clone([...map.values()].sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)));
  }
  const decisions=new Map([...current.decisions,...incoming.decisions].map(d=>[JSON.stringify(d),d]));
  next.decisions=clone([...decisions.values()].sort((a,b)=>a.recordedAt.localeCompare(b.recordedAt)));
  next.archivedDrafts=clone([...(current.archivedDrafts||[]),...(incoming.archivedDrafts||[])]);
  return next;
}

return {boundaryHypotheses,empty,checkpoint,rebase,append,decide,review,suggestions,surfaceRuns,priorities,planEstimates,merge,preserveHistory,activeRevision,BOUNDARIES};
});
