// Pure discussion decisions: no DOM, network, installation approval or source edits.
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory(require('./room-assessment'));else(root.SolarViz=root.SolarViz||{}).proposal=factory(root.SolarViz.roomAssessment);})(typeof window!=='undefined'?window:globalThis,function(A){
'use strict';
const clone=x=>JSON.parse(JSON.stringify(x));
const rates={equipment:4000,cylinder:1100,electrical:450,commissioning:350,routePerM:35,radiatorChange:300,radiatorLabour:125,radiatorPerW:.125,contingency:15};
function defaults(data){return {schemaVersion:1,propertyId:data.propertyId,revision:data.revision,flow:50,fabric:'central',basement:'warm',outdoor:'courtyard',cylinder:'utility',usePhotoEstimates:true,photoRooms:{},envelope:{},emitters:{},rates:{...rates},grantIncluded:true,operating:clone(data.operatingAssumptions.defaults),reserve:4,preferences:{occupants:'',hotWaterHabits:[],hotWaterNotes:'',baths:'',comfort:'',priorities:'',notes:''},events:[]};}
function validate(state,data){
 A.validateChoices(state,data);
 if(state?.propertyId!==data.propertyId||state?.revision!==data.revision||state.schemaVersion!==1)throw Error('This discussion belongs to another property or evidence revision.');
 if(![45,50,55].includes(state.flow)||!['lower','central','higher'].includes(state.fabric)||!['warm','cool'].includes(state.basement)||!['courtyard','garden'].includes(state.outdoor)||!['utility','kitchen','unresolved'].includes(state.cylinder))throw Error('Invalid discussion choice');
 for(const k of Object.keys(rates))if(!Number.isFinite(state.rates?.[k])||state.rates[k]<0||state.rates[k]>100000)throw Error('Budget allowances must be finite and non-negative');
 if(state.rates.contingency>100||!Number.isInteger(state.reserve)||state.reserve<0||state.reserve>data.geometry.geometry.rooms.length)throw Error('Invalid reserve');
 if(state.usePhotoEstimates!==undefined&&typeof state.usePhotoEstimates!=='boolean')throw Error('Invalid photo estimate choice');
 for(const [id,entry] of Object.entries(state.envelope||{})){
  const group=data.thermalEvidence?.groups.find(g=>g.id===id);
  if(!group?.options[entry.choice]||!['call-assumption','homeowner-reported','survey-observed'].includes(entry.basis)||typeof entry.note!=='string'||entry.basis!=='call-assumption'&&!entry.note.trim())throw Error('Invalid envelope choice or missing confirmation source');
 }
 const photoIds=new Set((data.interiorPhotos||[]).map(i=>i.id)),sourceIds=new Set(data.geometry.geometry.rooms.map(r=>r.sourceRoomId));
 for(const [id,room] of Object.entries(state.photoRooms||{}))if(!photoIds.has(id)||room!==null&&!sourceIds.has(room))throw Error('Invalid photo-to-room assignment');
 const prefs=state.preferences;
 if(prefs?.occupants!==undefined&&prefs.occupants!==''&&(!Number.isInteger(Number(prefs.occupants))||Number(prefs.occupants)<1||Number(prefs.occupants)>30))throw Error('Enter a whole number of residents from 1 to 30');
 if(prefs?.hotWaterHabits!==undefined&&(!Array.isArray(prefs.hotWaterHabits)||prefs.hotWaterHabits.some(v=>!['morning','evening','baths','overlap','runs-out','guests'].includes(v))))throw Error('Invalid hot-water habit');
 if(prefs?.hotWaterNotes!==undefined&&typeof prefs.hotWaterNotes!=='string')throw Error('Invalid hot-water notes');
 if(typeof state.grantIncluded!=='boolean')throw Error('Invalid grant choice');
 const op=state.operating,bounds={electricityPence:[0,200],fullLoadHours:[0,8760],hotWaterKwh:[0,100000],hotWaterSpf:[1,7],auxiliaryKwh:[0,100000],spf45:[1,7],spf50:[1,7],spf55:[1,7]};
 for(const [key,[min,max]] of Object.entries(bounds))if(!Number.isFinite(op?.[key])||op[key]<min||op[key]>max)throw Error('Invalid running-cost assumption: '+key);
 if(op.annualHeatKwh!==null&&(!Number.isFinite(op.annualHeatKwh)||op.annualHeatKwh<0||op.annualHeatKwh>200000))throw Error('Invalid annual heat estimate');
 const ids=new Set(data.geometry.geometry.rooms.map(r=>r.id));
 for(const [id,e] of Object.entries(state.emitters||{})){if(!ids.has(id)||e.output50!==null&&(!Number.isFinite(e.output50)||e.output50<0||e.output50>100000)||!Number.isFinite(e.exponent)||e.exponent<1||e.exponent>2)throw Error('Invalid room emitter output');}
 if(!Array.isArray(state.events)||!state.preferences)throw Error('Missing discussion history');
 return state;
}
function change(state,data,patch,at=new Date().toISOString()){
 const next={...clone(state),...clone(patch)};
 if(patch.envelope&&state.surfaceOverrides&&!patch.surfaceOverrides){const changed=data.thermalEvidence.groups.filter(g=>JSON.stringify(state.envelope[g.id])!==JSON.stringify(patch.envelope[g.id])).map(g=>g.id);next.surfaceOverrides=A.withoutOpeningOverrides(data,state.surfaceOverrides,changed);patch={...patch,surfaceOverrides:next.surfaceOverrides};}
 validate(next,data);
 next.events.push({at,role:'pre-survey-call',changes:clone(patch),evidenceRevision:data.revision});return next;
}
function restore(state,incoming,data,at=new Date().toISOString()){
 validate(state,data);validate(incoming,data);
 const seen=new Set(),events=[...state.events,...incoming.events].filter(e=>{const key=JSON.stringify(e);if(seen.has(key))return false;seen.add(key);return true;});
 const next={...clone(incoming),events};
 next.events.push({at,role:'pre-survey-call',action:'restore-discussion',previousChoices:clone({...state,events:[]}),evidenceRevision:data.revision});return next;
}
function route(data,state){
 const p=data.geometry.model.parameters,room=data.geometry.geometry.rooms.find(r=>r.sourceRoomId===(state.cylinder==='utility'?'lg-utility':'g-kitchen'));
 const centroid=room.localPoly.reduce((v,q)=>v.map((x,i)=>x+q[i]/room.localPoly.length),[0,0]);
 const hp=[p.width-.6,.55,state.outdoor==='garden'?p.extension_end+3: p.wing_end+1.5];
 if(state.cylinder==='unresolved')return {hp,cylinder:null,points:[],length:null,rise:null};
 const cylinder=[centroid[0],state.cylinder==='utility'?-1.6:.7,centroid[1]],side=p.wing_width+.25,entry=p.length+.1;
 const points=[hp,[side,.8,hp[2]],[side,.8,entry],[side,2.1,entry],[side,2.1,entry-.3],[side,cylinder[1],entry-.3],[cylinder[0],cylinder[1],entry-.3],cylinder];
 return {hp,cylinder,points,length:points.slice(1).reduce((n,q,i)=>n+Math.hypot(...q.map((v,k)=>v-points[i][k])),0),rise:2.1-.8};
}
// Catalogue analogues are hypotheses; each variant retains its own temperature exponent.
function photoEmitters(data,flow,temperature,roomId,photoRooms={}){
 const evidence=data.emitterEstimates;if(!evidence)return [];
 return evidence.emitters.filter(e=>(Object.hasOwn(photoRooms,e.imageId)?photoRooms[e.imageId]:e.roomId)===roomId).map(e=>({...clone(e),roomId,attribution:Object.hasOwn(photoRooms,e.imageId)?'homeowner-room-match':e.attribution,variants:e.variants.map(v=>{
  const c=evidence.catalogue[v.reference],output50=v.quantity*c.output50PerUnit;
  return {...v,...c,output50,availableW:output50*Math.pow(Math.max(0,flow-2.5-temperature)/50,c.exponent),source:clone(evidence.references[c.referenceId]),widthMm:c.unit==='section'?v.quantity*46+26:c.unit==='metre'?v.quantity*1000:null};
 })}));
}
// A photo belongs to one room at a time. Matching repeat views never creates emitters.
function photoRoom(data,state,imageId){
 if(Object.hasOwn(state.photoRooms||{},imageId))return state.photoRooms[imageId];
 return data.emitterEstimates.emitters.find(e=>e.imageId===imageId)?.roomId||data.geometry.geometry.rooms.find(r=>(r.photos||[]).includes(imageId))?.sourceRoomId||null;
}
function roomPhotos(data,state,roomId){return (data.interiorPhotos||[]).filter(i=>photoRoom(data,state,i.id)===roomId).map(i=>i.id);}
function photoTotal(emitters){
 if(!emitters.length)return null;
 const sum=(label,key)=>emitters.reduce((total,e)=>total+e.variants.find(v=>v.label===label)[key],0);
 return {output50:sum('central','output50'),range50:[sum('lower','output50'),sum('upper','output50')],availableW:sum('central','availableW'),rangeW:[sum('lower','availableW'),sum('upper','availableW')],inventoryComplete:emitters.every(e=>e.inventoryComplete)};
}
// Effects come from independent runs of the Python engine, not a second heat-loss model.
function thermalScenario(data,state,fabric=state.fabric){
 const key=fabric+'-'+state.basement,scenario=clone(data.scenarios[key]);
 for(const group of data.thermalEvidence?.groups||[]){
  const choice=state.envelope?.[group.id]?.choice||group.default;
  for(const [id,delta] of Object.entries(group.effects[choice][key])){
   const r=scenario.rooms.find(r=>r.id===id);r.fabricW+=delta.fabricW;r.bridgeRawW+=delta.bridgeRawW;
   for(const row of delta.surfaces){const index=r.surfaces.findIndex(s=>s.identifier===row.identifier);if(index<0)throw Error('Unknown thermal surface');r.surfaces[index]=clone(row);}
  }
 }
 for(const group of data.thermalEvidence?.groups||[])for(const room of scenario.rooms)for(const row of room.surfaces)if(group.surfaceIds.includes(row.identifier))row.boundaryLabel=group.options[state.envelope?.[group.id]?.choice||group.default].label;
 A.applySurfaces(scenario,state.surfaceOverrides);
 for(const r of scenario.rooms){if(r.bridgeRawW!==undefined){const floor=Math.floor(r.bridgeRawW),fraction=r.bridgeRawW-floor;r.bridgeW=Math.abs(fraction-.5)<1e-9?floor+(floor%2):Math.round(r.bridgeRawW);}r.loadW=r.included?Math.max(0,r.fabricW+r.ventilationW+r.bridgeW):null;}
 scenario.totalW=scenario.rooms.reduce((sum,r)=>sum+(r.loadW||0),0);return scenario;
}
function runningCosts(data,state,scenario){
 const op=state.operating,spaceHeat=op.annualHeatKwh===null?scenario.totalW/1000*op.fullLoadHours:op.annualHeatKwh,tariff=op.electricityPence/100;
 const rows=[45,50,55].map(flow=>{const spf=op['spf'+flow],spaceElectricity=spaceHeat/spf,hotWaterElectricity=op.hotWaterKwh/op.hotWaterSpf,electricity=spaceElectricity+hotWaterElectricity+op.auxiliaryKwh;
  const sensitivity=(heat,efficiency)=>(spaceHeat*heat/(spf*efficiency)+op.hotWaterKwh*heat/(op.hotWaterSpf*efficiency)+op.auxiliaryKwh)*tariff;
  return {flow,spf,spaceElectricity,hotWaterElectricity,auxiliaryElectricity:op.auxiliaryKwh,electricity,annualCost:electricity*tariff,range:[sensitivity(.75,1.15),sensitivity(1.25,.85)]};
 });
 return {basis:op.annualHeatKwh===null?'design-load-times-equivalent-hours':'entered-annual-useful-heat',spaceHeat,hotWaterHeat:op.hotWaterKwh,tariff,rows,selected:rows.find(r=>r.flow===state.flow),assumptions:clone(op),limitations:clone(data.operatingAssumptions.limits)};
}
function deductGrant(budget,data,state){
 const amount=state.grantIncluded?data.operatingAssumptions.grant.amount:0,net=value=>value===null?null:Math.max(0,value-amount);
 return {...budget,grantAmount:amount,grantDeduction:budget.total===null?null:Math.min(amount,budget.total),grantStatus:state.grantIncluded?'assumed-eligible':'not-included',netTotal:net(budget.total),netLow:net(budget.low),netHigh:net(budget.high)};
}
function evaluate(data,state){
 validate(state,data);const scenario=thermalScenario(data,state),routing=route(data,state);
 const rooms=scenario.rooms.map(r=>{const g=data.geometry.geometry.rooms.find(g=>g.id===r.id),e=state.emitters[r.id],dt=state.flow-2.5-r.temperature,n=e?.exponent||1.3,factor=Math.pow(dt/50,n),output=e?.output50;
  const estimates=photoEmitters(data,state.flow,r.temperature,g.sourceRoomId,state.photoRooms),photoEstimate=photoTotal(estimates),usePhoto=!e&&state.usePhotoEstimates!==false&&!!photoEstimate;
  const inventory=state.radiatorInventories?.[r.id]?A.inventoryOutput(data,state.radiatorInventories[r.id],state.flow,r.temperature):null;
  const known=output!==null&&output!==undefined&&!!e?.source?.trim(),available=known?output*factor:inventory?inventory.availableW:usePhoto?photoEstimate.availableW:null,required=r.loadW===null?null:Math.ceil(r.loadW/factor/50)*50;
  const status=!r.included?'unheated':inventory&&!known?(available===null?'unknown':available>=r.loadW?'estimated-sufficient':'estimated-shortfall'):known?(available>=r.loadW?'keep':'upgrade'):usePhoto?(photoEstimate.rangeW[1]<r.loadW?'estimated-shortfall':photoEstimate.rangeW[0]>=r.loadW?'estimated-sufficient':'estimated-borderline'):'unknown';
  return {...r,...g,photos:roomPhotos(data,state,g.sourceRoomId),required50:required,availableW:available,status,factor,output50:known?output:inventory?inventory.output50:usePhoto?photoEstimate.output50:null,inventory,source:known?e.source:inventory?inventory.source:usePhoto?'Photo estimate; catalogue analogues, unmeasured':'',basis:known?'entered':inventory?'reported-inventory':usePhoto?'photo-estimate':'unknown',estimates,photoEstimate,rangeW:!inventory&&usePhoto?photoEstimate.rangeW:null,n,allowance:required===null?0:Math.round(state.rates.radiatorLabour+state.rates.radiatorPerW*required),observations:data.emitters.filter(o=>o.roomId===g.sourceRoomId)};
 });
 const estimated=rooms.filter(r=>r.status.startsWith('estimated-')),unverified=rooms.filter(r=>r.status==='unknown'||r.status.startsWith('estimated-'));
 const unknown=rooms.filter(r=>r.status==='unknown'),upgrade=rooms.filter(r=>r.status==='upgrade'),keep=rooms.filter(r=>r.status==='keep');
 const routeAllowance=routing.length===null?null:Math.ceil(routing.length)*state.rates.routePerM;
 const base=state.rates.equipment+state.rates.cylinder+state.rates.electrical+state.rates.commissioning;
 const upgrades=upgrade.reduce((n,r)=>n+r.allowance,0),unknownCosts=unverified.map(r=>r.allowance).sort((a,b)=>b-a),reserve=unknownCosts.slice(0,state.reserve).reduce((a,b)=>a+b,0);
 const extra=1+state.rates.contingency/100;
 return {scenario,running:runningCosts(data,state,scenario),rooms,routing,unknown:unknown.length,estimated:estimated.length,unverified:unverified.length,unassigned:photoEmitters(data,state.flow,18,null,state.photoRooms),upgrade:upgrade.length,keep:keep.length,range:[thermalScenario(data,state,'lower').totalW,thermalScenario(data,state,'higher').totalW],budget:deductGrant({base,route:routeAllowance,upgrades,reserve,reservedRooms:Math.min(state.reserve,unverified.length),total:routeAllowance===null?null:(base+routeAllowance+upgrades+reserve)*extra,low:routeAllowance===null?null:(base+routeAllowance+upgrades)*extra,high:routeAllowance===null?null:(base+routeAllowance+upgrades+unknownCosts.reduce((a,b)=>a+b,0))*extra,contingency:state.rates.contingency},data,state)};
}
function snapshot(data,state){return {schemaVersion:1,kind:'pre-survey-discussion',propertyId:data.propertyId,revision:data.revision,designApproved:false,choices:clone(state),result:evaluate(data,state),epc:data.epc.latest.certificate_number,modelRevision:data.geometry.modelRevision,sourceHashes:data.sourceHashes,operatingEvidence:clone(data.operatingAssumptions),thermalEvidence:clone(data.thermalEvidence||null),emitterEvidence:clone(data.emitterEstimates||null),limitations:data.method.limits};}
return {photoRoom,roomPhotos,defaults,validate,change,restore,evaluate,route,snapshot,photoEmitters,photoTotal,thermalScenario,runningCosts};
});
