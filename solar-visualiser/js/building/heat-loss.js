// Transparent steady-state room scenarios. No implicit fabric values or design approval.
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./geometry.js'),require('./plan-geometry.js'));else root.SolarViz.heatLoss=factory(root.SolarViz.buildingGeometry,root.SolarViz.planGeometry);})(typeof window!=='undefined'?window:globalThis,function(G,P){
'use strict';
const area=p=>Math.abs(G.polygonArea(p)),EPS=1e-5,valid=(v,min=-Infinity)=>Number.isFinite(v)&&v>=min;
function fingerprint(value){const s=JSON.stringify(value);let h=2166136261;for(let i=0;i<s.length;i++)h=Math.imul(h^s.charCodeAt(i),16777619);return (h>>>0).toString(16);}
function ceiling(room,lv,solid){const pieces=[];for(const f of solid.faces){for(const poly of P.intersection(room.poly,f.plan)){const roof=p=>G.planeY(f.plane,...p),cap=lv.ceilingY;
 const parts=cap===null?[{poly,slope:true}]:[{poly:P.clip(poly,p=>roof(p)-cap),slope:false},{poly:P.clip(poly,p=>cap-roof(p)),slope:true}];
 for(const part of parts){if(part.slope&&cap!==null&&poly.every(p=>Math.abs(roof(p)-cap)<1e-8))continue;if(part.poly.length<3||area(part.poly)<1e-8)continue;const y=p=>part.slope?roof(p):cap;const clipped=P.clip(part.poly,p=>y(p)-lv.slabTopY);if(clipped.length<3)continue;const a=area(clipped),c=G.polygonCentroid(clipped);pieces.push({planArea:a,poly:clipped,flat:!part.slope,area:a*(part.slope?Math.hypot(1,f.plane.a,f.plane.b):1),volume:a*(y(c)-lv.slabTopY)});}
 }}return pieces;}
function derive({solid,levels,roomsByLevel,windows=[],origin={x:0,y:0,z:0}}){
 const rooms=[],surfaces=[],roomMap={};
 for(const lv of levels)for(const room of roomsByLevel[lv.idx]||[]){const id=lv.idx+':'+room.id,pieces=ceiling(room,lv,solid),r={id,localId:room.id,levelIdx:lv.idx,name:room.name||room.id,sourceRoomId:room.sourceRoomId,poly:room.poly,level:lv,pieces,floorArea:area(room.poly),volume:pieces.reduce((s,p)=>s+p.volume,0),ceilingArea:pieces.reduce((s,p)=>s+p.area,0),sharedFloor:0,sharedCeiling:0};rooms.push(r);roomMap[id]=r;}
 const add=(id,kind,a,b,gross,extra={})=>{if(gross<1e-6)return;const s={id,kind,roomA:a,roomB:b||null,grossArea:gross,openings:[],...extra};surfaces.push(s);return s;};
 // Inter-floor surfaces are shared objects, allocated once to each room pair.
 for(const lower of rooms)for(const upper of rooms){if(upper.levelIdx===lower.levelIdx||Math.abs(upper.level.baseY-lower.level.ceilingY)>.05)continue;let shared=0;for(const p of lower.pieces.filter(p=>p.flat))shared+=P.area(P.intersection(p.poly,upper.poly));if(shared<EPS)continue;add('floor:'+lower.id+':'+upper.id,'interfloor',lower.id,upper.id,shared);lower.sharedCeiling+=shared;upper.sharedFloor+=shared;}
 const segments=[];
 for(const room of rooms){const poly=room.poly,winding=Math.sign(G.polygonArea(poly)),lv=room.level;
  for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<EPS)continue;const cuts=[0,1];
   for(const other of rooms.filter(r=>r.levelIdx===room.levelIdx))for(const q of other.poly){const near=G.distPointToSegment(...q,...a,...b);if(near.d<EPS&&near.t>EPS&&near.t<1-EPS)cuts.push(near.t);}
   // Split at roof-face boundaries so linear roof heights integrate correctly.
   for(const f of solid.faces)for(let j=0;j<f.plan.length;j++){const c=f.plan[j],d=f.plan[(j+1)%f.plan.length],vx=d[0]-c[0],vz=d[1]-c[1],den=dx*vz-dz*vx;if(Math.abs(den)<1e-10)continue;const t=((c[0]-a[0])*vz-(c[1]-a[1])*vx)/den,u=((c[0]-a[0])*dz-(c[1]-a[1])*dx)/den;if(t>EPS&&t<1-EPS&&u>=0&&u<=1)cuts.push(t);}
   // Cap/roof intersections introduce height kinks even inside one roof face.
   for(const f of solid.faces)for(const h of [lv.slabTopY,lv.ceilingY].filter(h=>h!==null)){const ya=G.planeY(f.plane,...a),yb=G.planeY(f.plane,...b),t=(h-ya)/(yb-ya);if(t>EPS&&t<1-EPS)cuts.push(t);}
   const ts=[...new Set(cuts.map(t=>Math.round(t*1e8)/1e8))].sort((a,b)=>a-b);
   const point=t=>[a[0]+t*dx,a[1]+t*dz];
   for(let j=1;j<ts.length;j++){
    const aa=point(ts[j-1]),bb=point(ts[j]),mid=point((ts[j-1]+ts[j])/2),inside=[mid[0]-winding*dz/length*1e-6,mid[1]+winding*dx/length*1e-6];
    const face=solid.faces.find(f=>G.pointInPolygon(f.plan,...inside));
    const top=q=>Math.max(lv.slabTopY,Math.min(face?G.planeY(face.plane,...q):lv.ceilingY??solid.ridgeY,lv.ceilingY??Infinity));
    const t0=top(aa),t1=top(bb),len=length*(ts[j]-ts[j-1]);segments.push({room,a:aa,b:bb,length:len,topA:t0,topB:t1,bottom:lv.slabTopY,area:len*((t0+t1)/2-lv.slabTopY)});
   }
  }
 }
 const same=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1])<1e-4,used=new Set();let serial=0;
 for(let i=0;i<segments.length;i++){if(used.has(i))continue;const seg=segments[i],other=segments.findIndex((s,j)=>j!==i&&!used.has(j)&&s.room.levelIdx===seg.room.levelIdx&&same(s.a,seg.b)&&same(s.b,seg.a));used.add(i);if(other>=0)used.add(other);
  const neighbour=other>=0?segments[other]:null,gross=neighbour?Math.min(seg.area,neighbour.area):seg.area;
  const surface=add('wall:'+serial++,'wall',seg.room.id,neighbour?.room.id,gross,{edge:[seg.a,seg.b],bottom:seg.bottom,top:[seg.topA,seg.topB]});if(!surface)continue;
  const dx=(seg.b[0]-seg.a[0])/seg.length,dz=(seg.b[1]-seg.a[1])/seg.length;
  for(const o of windows){if(o.ring.some(p=>Math.abs((p[0]-seg.a[0])*(-dz)+(p[2]-seg.a[1])*dx)>.025))continue;const poly=o.ring.map(p=>[(p[0]-seg.a[0])*dx+(p[2]-seg.a[1])*dz,p[1]]),wall=[[0,seg.bottom],[seg.length,seg.bottom],[seg.length,seg.topB],[0,seg.topA]],a=P.area(P.intersection(poly,wall));if(a>1e-5)surface.openings.push({id:o.id,kind:o.kind,area:a});}
  if(neighbour&&Math.abs(seg.area-neighbour.area)>EPS){const tall=seg.area>neighbour.area?seg:neighbour;add('wall-step:'+serial++,'wall',tall.room.id,null,Math.abs(seg.area-neighbour.area),{edge:[tall.a,tall.b]});}
 }
 for(const r of rooms){add('floor:'+r.id,'floor',r.id,null,Math.max(0,r.floorArea-r.sharedFloor));add('ceiling:'+r.id,'ceiling',r.id,null,Math.max(0,r.pieces.filter(p=>p.flat).reduce((sum,p)=>sum+p.area,0)-r.sharedCeiling));add('roof:'+r.id,'roof',r.id,null,r.pieces.filter(p=>!p.flat).reduce((sum,p)=>sum+p.area,0));}
 for(const s of surfaces){s.openingArea=s.openings.reduce((a,o)=>a+o.area,0);s.netArea=s.grossArea-s.openingArea;}
 const geometry={rooms:rooms.map(r=>({id:r.id,localId:r.localId,levelIdx:r.levelIdx,name:r.name,sourceRoomId:r.sourceRoomId,floorArea:r.floorArea,volume:r.volume,geometryIssues:Math.abs(r.pieces.reduce((sum,p)=>sum+p.planArea,0)-r.floorArea)>.02?['Roof coverage overlaps or leaves gaps above this room']:[],poly:r.poly.map(p=>[p[0]-origin.x,p[1]-origin.z]),baseY:r.level.slabTopY-origin.y})),surfaces:surfaces.map(s=>({...s,...(s.edge?{edge:s.edge.map(p=>[p[0]-origin.x,p[1]-origin.z])}:{}),...(s.bottom!==undefined?{bottom:s.bottom-origin.y,top:s.top.map(y=>y-origin.y)}:{})}))};
 const rounded=x=>JSON.parse(JSON.stringify(x,(_,v)=>typeof v==='number'?Math.round(v*1e6)/1e6:v));
 geometry.surfaces=geometry.surfaces.map(s=>({...s,id:s.kind+':'+fingerprint(rounded({kind:s.kind,rooms:[s.roomA,s.roomB].filter(Boolean).sort(),edge:s.edge,bottom:s.bottom,top:s.top,area:s.grossArea}))}));
 geometry.coverageIssues=levels.filter(l=>Math.abs(l.area-geometry.rooms.filter(r=>r.levelIdx===l.idx).reduce((sum,r)=>sum+r.floorArea,0))>.1).map(l=>l.name+': room polygons do not cover the complete floor');
 geometry.signature=fingerprint(rounded({...geometry,rooms:geometry.rooms.map(({name,...r})=>r)}));return geometry;
}
function calculate(geometry,state={}){
 const inputs=state.rooms||{},surfaceInputs=state.surfaces||{},out={},issues=[...(geometry.coverageIssues||[])];
 for(const r of geometry.rooms){const input=inputs[r.id]||{},errors=[...(r.geometryIssues||[])];if(!valid(input.temperature,-30)||input.temperature>40)errors.push('Room design temperature');if(!valid(input.ach,0))errors.push('Air changes per hour');const volume=input.volume===null||input.volume===undefined?r.volume:input.volume;if(!valid(volume,.01))errors.push('Net air volume');if(input.reviewedSignature!==geometry.signature)errors.push('Review room dimensions after geometry changes');if(!['assumed','measured'].includes(input.basis))errors.push('Dimension evidence basis');if(!valid(state.outsideTemperature,-60)||state.outsideTemperature>40)errors.push('Outside design temperature');if(!valid(input.bridgeWPerK,0))errors.push('Thermal bridge allowance (W/K)');
  out[r.id]={id:r.id,name:r.name,volume,floorArea:r.floorArea,temperature:input.temperature,errors,fabricW:0,ventilationW:null,bridgeW:null,internalExchangeW:0,surfaces:[],basis:input.basis};
  if(valid(input.ach,0)&&valid(input.temperature)&&valid(state.outsideTemperature)&&valid(volume,.01))out[r.id].ventilationW=.33*input.ach*volume*(input.temperature-state.outsideTemperature);
  if(valid(input.bridgeWPerK,0)&&valid(input.temperature)&&valid(state.outsideTemperature))out[r.id].bridgeW=input.bridgeWPerK*(input.temperature-state.outsideTemperature);
 }
 for(const s of geometry.surfaces){const input=surfaceInputs[s.id]||{},a=out[s.roomA],b=s.roomB?out[s.roomB]:null,boundary=b?'room':input.boundary,gross=input.area===null||input.area===undefined?s.grossArea:input.area,extras=input.extraOpenings||[],openingArea=s.openingArea+extras.reduce((n,o)=>n+(valid(o.area,0)?o.area:0),0),net=gross-openingArea,errors=[];if(!valid(gross,0)||net<-.0001)errors.push('Opening area exceeds surface area');if(!b&&!['outside','ground','unheated','party','adiabatic'].includes(boundary))errors.push('Choose adjacent space');
  if(extras.some(o=>!valid(o.area,.0001)))errors.push('Additional opening area');
  const tb=b?b.temperature:boundary==='outside'?state.outsideTemperature:input.adjacentTemperature;
  let watts=null;if(boundary==='adiabatic')watts=0;else if(!valid(a.temperature)||!valid(tb))errors.push('Adjacent/room temperature');else if(Math.abs(a.temperature-tb)<1e-9)watts=0;else{
   if(net>EPS&&!valid(input.uValue,.001))errors.push('Surface U-value');let ua=net*(input.uValue||0);
   for(const o of [...s.openings,...extras]){const u=input.openingU?.[o.id]??o.uValue;if(!valid(o.area,.0001)||!valid(u,.001))errors.push('Opening U-value / area');else ua+=o.area*u;}
   if(!errors.length)watts=ua*(a.temperature-tb);
  }
  if(errors.length)watts=null;
  const row={id:s.id,kind:s.kind,boundary,grossArea:gross,netArea:net,openingArea,watts,errors};a.surfaces.push(row);for(const e of errors)a.errors.push(s.id+': '+e);
  if(b){b.surfaces.push({...row,watts:watts===null?null:-watts});for(const e of errors)b.errors.push(s.id+': '+e);if(watts!==null){a.internalExchangeW+=watts;b.internalExchangeW-=watts;}}
  else if(watts!==null)a.fabricW+=watts;
 }
 const rooms=Object.values(out);for(const r of rooms){r.errors=[...new Set(r.errors)];r.netLoadW=r.errors.length?null:r.fabricW+r.internalExchangeW+r.ventilationW+r.bridgeW;r.emitterLoadW=r.netLoadW===null?null:Math.max(0,r.netLoadW);}
 if(!state.coverageReviewed)issues.push('Review included-room openings and boundary assignments');if(rooms.some(r=>r.errors.length))issues.push('Some rooms have incomplete or stale inputs');if(!rooms.length)issues.push('No rooms');
 return {kind:'heat-loss-scenario',scope:'included-rooms-only',method:'UAΔT + 0.33 nVΔT + explicit thermal bridge HΔT; signed internal exchange',rooms,issues,totalW:issues.length?null:rooms.reduce((s,r)=>s+r.fabricW+r.ventilationW+r.bridgeW,0),completeRooms:rooms.filter(r=>r.netLoadW!==null).length,designApproved:false};
}
return {derive,calculate,fingerprint};
});
