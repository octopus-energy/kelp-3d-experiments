// Element-level assumptions and stable radiator inventories, independent of rendering.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else(root.SolarViz=root.SolarViz||{}).roomAssessment=factory();})(typeof window==='undefined'?globalThis:window,function(){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x)),record=x=>x&&typeof x==='object'&&!Array.isArray(x);
const types={unknown:'Type to check',panel11:'Single panel + fins (Type 11)',panel22:'Double panel + fins (Type 22)',column2:'2-column',column3:'3-column',column4:'4-column',towel:'Towel rail',other:'Other / underfloor heating'};
function surfaceInfo(data,id,roomId){
 const surface=data.geometry.geometry.surfaces.find(s=>s.id===id||s.openings.some(o=>s.id+':'+o.id===id));if(!surface)return null;
 const opening=surface.openings.find(o=>surface.id+':'+o.id===id),other=surface.roomA===roomId?surface.roomB:surface.roomA,room=data.geometry.geometry.rooms.find(r=>r.id===roomId),adjacent=data.geometry.geometry.rooms.find(r=>r.id===other);
 const category=opening?(opening.kind==='door'?'doors':'windows'):surface.kind==='wall'?'walls':surface.kind==='floor'?'floors':surface.kind==='interfloor'?(adjacent&&adjacent.baseY<room.baseY?'floors':'ceilings'):'ceilings';
 return {surface,opening,other,category,group:data.thermalEvidence.groups.find(g=>g.surfaceIds.includes(surface.id)&&!opening||opening&&g.openingIds?.includes(opening.id))};
}
function validateSurfaceOverrides(values,data){
 if(values===undefined)return;if(!record(values))throw Error('Invalid surface assumptions');
 for(const [id,v] of Object.entries(values))if(!surfaceInfo(data,id,data.geometry.geometry.rooms[0].id)||!record(v)||!Number.isFinite(v.u)||v.u<=0||v.u>10||typeof v.source!=='string'||!v.source.trim()||!['homeowner-reported','call-assumption','survey-observed','comparison'].includes(v.basis))throw Error('Each surface needs a valid U-value (above 0, up to 10) and an assumption source');
}
function validateInventory(inv,data){
 if(!record(inv)||!Array.isArray(inv.items)||inv.items.length>40||typeof inv.complete!=='boolean'||typeof inv.source!=='string'||!inv.source.trim()||new Set(inv.items.map(i=>i.id)).size!==inv.items.length)throw Error('Invalid radiator inventory');
 for(const r of inv.items){
  if(!record(r)||typeof r.id!=='string'||!r.id||typeof r.label!=='string'||!r.label.trim()||!Object.hasOwn(types,r.type)||!['widthMm','heightMm'].every(k=>r[k]===null||Number.isFinite(r[k])&&r[k]>0&&r[k]<=10000)||r.sections!==null&&(!Number.isInteger(r.sections)||r.sections<1||r.sections>200)||typeof r.note!=='string'||!['photo-hypothesis','homeowner-reported','adviser-reported','surveyor-reported'].includes(r.basis))throw Error('Check the radiator type and dimensions; leave unknown dimensions blank');
 }
 return inv;
}
function validateChoices(state,data){
 validateSurfaceOverrides(state.surfaceOverrides,data);
 if(state.radiatorInventories!==undefined&&!record(state.radiatorInventories))throw Error('Invalid radiator inventories');
 for(const [id,v] of Object.entries(state.radiatorInventories||{})){if(!data.geometry.geometry.rooms.some(r=>r.id===id))throw Error('Unknown inventory room');validateInventory(v,data);}
}
// The engine truncates signed element losses towards zero; matching that policy preserves replay parity.
function applySurfaces(scenario,overrides){
 for(const r of scenario.rooms)for(const row of r.surfaces){const v=overrides?.[row.identifier];if(!v)continue;const heatloss=Math.trunc(row.area*v.u*row.temperature_difference);r.fabricW+=heatloss-row.heatloss;row.heatloss=heatloss;row.u_value=v.u;row.overrideSource=v.source;row.overrideBasis=v.basis;}
 return scenario;
}
function elements(data,resultRoom){return resultRoom.surfaces.map((row,index)=>{
 const info=surfaceInfo(data,row.identifier,resultRoom.id);if(!info)throw Error('Unmapped thermal surface '+row.identifier);
 const {surface:s,opening:o,category,other,group}=info,room=data.geometry.geometry.rooms.find(r=>r.id===other),same=resultRoom.surfaces.filter(q=>surfaceInfo(data,q.identifier,resultRoom.id)?.category===category);
 return {...row,...info,id:row.identifier,label:o?(data.thermalEvidence.groups.find(g=>g.openingIds?.includes(o.id))?.title||o.id):category==='walls'?'Wall '+(same.findIndex(x=>x.identifier===row.identifier)+1):category==='floors'?'Floor '+(same.findIndex(x=>x.identifier===row.identifier)+1):'Ceiling / roof '+(same.findIndex(x=>x.identifier===row.identifier)+1),adjacent:room?room.name:s.boundary==='ground'?'Ground':s.boundary==='party'?'Neighbouring home':s.boundary==='unheated'?'Unheated space':'Outside',basis:row.overrideSource||s.basis,groupId:group?.id};
 });}
function breakdown(data,room){const rows=elements(data,room),labels={walls:'Walls',windows:'Windows & rooflights',doors:'Doors',floors:'Floors',ceilings:'Ceilings & roof'};return [...Object.entries(labels).map(([id,label])=>({id,label,watts:rows.filter(r=>r.category===id).reduce((n,r)=>n+r.heatloss,0),count:rows.filter(r=>r.category===id).length})),{id:'air',label:'Air changes',watts:room.ventilationW,count:1},{id:'bridges',label:'Junctions',watts:room.bridgeW,count:1}];}
function family(c){return c.type.startsWith('K1')?'panel11':c.type.startsWith('K2')?'panel22':c.type==='2-column'?'column2':c.type==='3-column'?'column3':c.type==='4-column'?'column4':'towel';}
function seedInventory(data,state,room){
 const saved=state.radiatorInventories?.[room.id];if(saved)return copy(saved);
 const items=data.emitterEstimates.emitters.filter(e=>(Object.hasOwn(state.photoRooms||{},e.imageId)?state.photoRooms[e.imageId]:e.roomId)===room.sourceRoomId).map(e=>{const v=e.variants.find(v=>v.label==='central'),c=data.emitterEstimates.catalogue[v.reference];return {id:'source:'+e.id,label:e.title,type:family(c),widthMm:c.unit==='metre'?v.quantity*1000:c.unit==='section'?v.quantity*46+26:null,heightMm:c.heightMm,sections:c.unit==='section'?v.quantity:null,note:e.assumptions||e.observation,basis:'photo-hypothesis',imageId:e.imageId,sourceId:e.id};});
 return {items,complete:false,source:'Listing-photo hypotheses; dimensions and inventory to check'};
}
function itemOutput(data,item,flow,temperature){
 const match=Object.entries(data.emitterEstimates.catalogue).find(([,c])=>family(c)===item.type&&c.heightMm===item.heightMm&&['metre','section'].includes(c.unit));
 if(!match)return {output50:null,availableW:null,reason:'Output needs a product rating for this type and height.'};
 const [reference,c]=match,quantity=c.unit==='metre'?item.widthMm===null?null:item.widthMm/1000:item.sections;
 if(quantity===null)return {output50:null,availableW:null,reason:c.unit==='section'?'Count the sections to estimate this column radiator.':'Add the width to compare this panel radiator.'};
 const output50=quantity*c.output50PerUnit;return {output50,availableW:output50*Math.pow(Math.max(0,flow-2.5-temperature)/50,c.exponent),reference,exponent:c.exponent,source:data.emitterEstimates.references[c.referenceId],reason:'Catalogue analogue; exact product and dimensions need checking.'};
}
function inventoryOutput(data,inv,flow,temperature){const items=inv.items.map(item=>({...item,...itemOutput(data,item,flow,temperature)})),known=items.reduce((n,r)=>n+(r.availableW||0),0),unknown=items.filter(r=>r.availableW===null).length;return {items,knownW:known,unknown,availableW:inv.complete&&!unknown?known:null,output50:inv.complete&&!unknown?items.reduce((n,r)=>n+r.output50,0):null,complete:inv.complete,source:inv.source};}
return {types,surfaceInfo,validateSurfaceOverrides,validateInventory,validateChoices,applySurfaces,elements,breakdown,seedInventory,itemOutput,inventoryOutput};
});
