// Versioned installation decisions. Pure UMD; calculations use the proposal engine adapter.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./proposal'));else(root.SolarViz=root.SolarViz||{}).installation=factory(root.SolarViz.proposal);})(typeof window==='undefined'?globalThis:window,function(P){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
function create(data,choices=P.defaults(data)){return {schemaVersion:1,kind:'installation-project',propertyId:data.propertyId,revision:data.revision,choices:copy(choices),household:{priority:'balanced',preserve:[],noKitchenCylinder:false,coldRooms:'',roomFeedback:{},notes:''},observations:[],events:[],selectedFlow:choices.flow};}
function validate(project,data){
 if(project?.kind!=='installation-project'||project.schemaVersion!==1||project.propertyId!==data.propertyId||project.revision!==data.revision)throw Error('This project belongs to another property or evidence revision. Earlier projects must be reviewed before migration.');
 P.validate(project.choices,data);const h=project.household,ids=new Set(data.geometry.geometry.rooms.map(r=>r.id));
 if(!h||!['balanced','running','changes'].includes(h.priority)||!Array.isArray(h.preserve)||h.preserve.some(id=>!ids.has(id))||typeof h.noKitchenCylinder!=='boolean'||typeof h.coldRooms!=='string'||typeof h.notes!=='string')throw Error('Invalid household priorities');
 validateFeedback(h,data);
 if(!Array.isArray(project.events)||!Array.isArray(project.observations)||![45,50,55].includes(project.selectedFlow))throw Error('Invalid project history');
 for(const o of project.observations)validateObservation(o,data);
 if(new Set(project.observations.map(o=>o.id)).size!==project.observations.length)throw Error('Duplicate observation identities');
 for(const event of project.events){
  if(typeof event.label!=='string'||typeof event.at!=='string'||event.evidenceRevision!==data.revision||!event.before||!event.after)throw Error('Invalid revision event');
  for(const point of [event.beforeState,event.afterState]){
   if(!point||!Number.isInteger(point.observationCount)||point.observationCount<0||point.observationCount>project.observations.length)throw Error('Invalid replay evidence position');
   P.validate(point.choices,data);validateFeedback(point.household,data);
   if(!point.household||!['balanced','running','changes'].includes(point.household.priority)||!Array.isArray(point.household.preserve)||point.household.preserve.some(id=>!ids.has(id))||![45,50,55].includes(point.selectedFlow))throw Error('Invalid replay choices');
  }
 }
 return project;
}
function validateFeedback(h,data){
 const ids=new Set(data.geometry.geometry.rooms.map(r=>r.id));
 for(const [id,d] of Object.entries(h?.roomDesign||{}))if(!ids.has(id)||!['open','panel','columns','vertical','ufh'].includes(d.style))throw Error('Invalid room design preference');
 for(const q of h?.sitePreferences||[])if(!['front','rear'].includes(q.side)||!['prefer','avoid'].includes(q.kind)||![q.u,q.v].every(n=>Number.isFinite(n)&&n>=0&&n<=1)||typeof q.id!=='string')throw Error('Invalid outdoor preference');
 for(const [id,f] of Object.entries(h?.roomFeedback||{}))if(!ids.has(id)||typeof f.cold!=='boolean'||!['usual','daytime','occasional','other'].includes(f.use)||typeof f.note!=='string')throw Error('Invalid room comfort feedback');
}
const habitLabels={morning:'Showers mostly in the morning',evening:'Showers mostly in the evening',baths:'Regular baths',overlap:'Showers or baths close together / at the same time','runs-out':'Hot water sometimes runs out',guests:'Regular guests or changing household size'};
function householdBrief(project){const p=project.choices.preferences;return [(p.occupants?`${p.occupants} people live here`:'Residents not yet discussed'),...(p.hotWaterHabits||[]).map(k=>habitLabels[k]),p.hotWaterNotes||''].filter(Boolean).join(' · ');}
// Confidence is about room identity, independent of uncertain radiator output.
function photoMatches(data,project){return (data.interiorPhotos||[]).map((im,index)=>{
 const manual=Object.hasOwn(project.choices.photoRooms||{},im.id),roomId=P.photoRoom(data,project.choices,im.id);
 const records=data.emitterEstimates.emitters.filter(e=>e.imageId===im.id);
 const confident=!!roomId&&records.length>0&&records.every(e=>e.attribution==='supported'&&e.roomId===roomId);
 return {...im,index,roomId,status:manual?(roomId?'matched':'deferred'):confident?'automatic':'needs-help',basis:manual?'Recorded room assignment':confident?'Existing evidence supports this room identity':'Room identity needs your help'};
});}
function matchingQueue(data,project){return photoMatches(data,project).filter(i=>i.status==='needs-help');}
function assignPhoto(project,data,imageId,roomId,role='homeowner'){
 const name=data.geometry.geometry.rooms.find(r=>r.sourceRoomId===roomId)?.name||'Not sure / room not listed';
 return observe(project,data,{id:'photo-room-'+(project.events.length+1)+'-'+Date.now(),at:new Date().toISOString(),kind:'photo-room',target:imageId,roomId,role:role==='surveyor'?'surveyor':'homeowner',observer:role==='surveyor'?'Surveyor in room-matching workspace':'Homeowner in room-matching workspace',note:'Matched listing photo to: '+name});
}
function validateObservation(o,data){
 if(!o||!['emitter','envelope','basement','geometry','access','photo-room','comfort','hot-water','radiator-evidence'].includes(o.kind)||!['surveyor','homeowner'].includes(o.role)||!o.observer?.trim()||!o.note?.trim()||!o.at||!o.id)throw Error('Record who checked it and the evidence / measurement source.');
 if(o.kind==='photo-room'&&(!(data.interiorPhotos||[]).some(i=>i.id===o.target)||o.roomId!==null&&!data.geometry.geometry.rooms.some(r=>r.sourceRoomId===o.roomId)))throw Error('Choose a valid photo and room');
 if(o.kind==='hot-water'&&o.target!=='household')throw Error('Invalid household review');
 const room=data.geometry.geometry.rooms.find(r=>r.id===o.target);
 if(o.kind==='radiator-evidence'&&(!room||!o.attachments?.length||[o.widthMm,o.heightMm].some(n=>n!==null&&(!Number.isFinite(n)||n<=0||n>10000))))throw Error('Add a radiator photo and valid optional dimensions');
 if(o.kind==='comfort'&&!room)throw Error('Choose a valid room for comfort feedback');
 if(o.kind==='emitter'&&(!room||!Number.isFinite(o.output50)||o.output50<0||o.output50>100000||!Number.isFinite(o.exponent)||o.exponent<1||o.exponent>2||o.complete!==true))throw Error('A room total needs a complete emitter inventory, a valid DT50 rating and exponent.');
 if(o.kind==='envelope'&&!data.thermalEvidence.groups.find(g=>g.id===o.target&&g.options[o.value]&&o.value!=='unknown'))throw Error('Choose a supported wall or glazing observation.');
 if(o.kind==='basement'&&!['warm','cool'].includes(o.value))throw Error('Choose the basement heating scope.');
 if(o.kind==='geometry'&&(!room||![o.heightM,o.areaM2].every(n=>Number.isFinite(n)&&n>0)||o.heightM>10||o.areaM2>500))throw Error('Enter measured clear height and net floor area for this room.');
 if(o.kind==='access'&&!['courtyard','garden','utility','kitchen'].includes(o.target))throw Error('Choose an equipment space.');
 if(o.attachments!==undefined&&(!Array.isArray(o.attachments)||o.attachments.length>3||o.attachments.some(a=>typeof a.name!=='string'||a.name.length>300||typeof a.dataUrl!=='string'||a.dataUrl.length>1450000||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(a.dataUrl))))throw Error('Invalid evidence image attachment');
 return o;
}
// Physical sizing envelopes, not selected SKUs: source analogue has W per metre and n.
function sizePanels(required,data,maxWidth=2000){
 if(required<=0)return [];
 const c=data.emitterEstimates.catalogue['p2-600'],panels=[];let remaining=required;
 while(remaining>.00001&&panels.length<12){const width=Math.max(400,Math.min(maxWidth,Math.ceil(remaining/c.output50PerUnit*10)*100));const watts=width/1000*c.output50PerUnit;panels.push({widthMm:width,heightMm:600,type:'Type 22',output50:watts,exponent:c.exponent,referenceId:c.referenceId});remaining-=watts;}
 if(remaining>0)throw Error('Emitter sizing exceeds the supported envelope');return panels;
}
function packageFor(data,project,flow){
 const state={...project.choices,flow},r=P.evaluate(data,state),c=data.emitterEstimates.catalogue['p2-600'];
 const rooms=r.rooms.map(room=>{
  const preserve=project.household.preserve.includes(room.id),observed=project.observations.filter(o=>o.kind==='emitter'&&o.target===room.id).at(-1);
  const laterMatch=project.observations.slice(project.observations.indexOf(observed)+1).some(o=>o.kind==='photo-room'&&(o.roomId===room.sourceRoomId||P.photoRoom(data,project.events.find(e=>e.afterState.observationCount===project.observations.indexOf(o)+1)?.beforeState.choices||state,o.target)===room.sourceRoomId));
  const surveyCurrent=!laterMatch&&state.emitters[room.id]?.basis==='site-inventory'&&observed&&observed.role==='surveyor'&&state.emitters[room.id]?.output50===observed.output50&&state.emitters[room.id]?.exponent===observed.exponent;
  const known=room.availableW!==null,existing=room.availableW||0,shortfall=room.included?Math.max(0,room.loadW-existing):0;
  const action=!room.included?'outside-scope':known&&shortfall===0?'retain':preserve&&known?'supplement':known?'replace':'inventory';
  const needed=!room.included||action==='retain'||action==='inventory'?0:action==='supplement'?shortfall:room.loadW;
  const factor=Math.pow((flow-2.5-room.temperature)/50,c.exponent),panels=sizePanels(needed/factor,data),supply50=panels.reduce((n,p)=>n+p.output50,0);
  const supplied=action==='inventory'?null:action==='retain'?existing:action==='supplement'?existing+supply50*factor:supply50*factor;
  const allowance=panels.length*state.rates.radiatorChange;
  const alternatives=room.rangeW,fragile=!!alternatives&&alternatives[0]<room.loadW&&alternatives[1]>=room.loadW;
  return {id:room.id,name:room.name,sourceRoomId:room.sourceRoomId,levelIdx:room.levelIdx,action,preserve,loadW:room.loadW,existingW:room.availableW,heatingPresence:!room.included?'outside-scope':known?(room.availableW>0?'evidenced-present':'reported-absent'):'assumed-present',capacityResolved:known,panels,proposedW:supplied,allowance,inventoryVerified:!!surveyCurrent,fragile,photos:room.photos||[],design:copy(project.household.roomDesign?.[room.id]||{style:'open'}),homeownerEvidence:project.observations.filter(o=>o.kind==='radiator-evidence'&&o.target===room.id),comfort:copy(project.household.roomFeedback?.[room.id]||{cold:false,use:'usual',note:''}),sourceEvidence:room.estimates.map(e=>({id:e.id,imageId:e.imageId,bbox:e.bbox})),basis:room.basis};
 });
 const emitterCost=rooms.reduce((n,r)=>n+r.allowance,0),gross=r.routing.length===null?null:(r.budget.base+r.budget.route+emitterCost)*(1+state.rates.contingency/100),grant=gross===null?null:Math.min(gross,state.grantIncluded?data.operatingAssumptions.grant.amount:0);
 const blocked=project.household.noKitchenCylinder&&state.cylinder==='kitchen';
 return {flow,title:flow===45?(state.operating.spf45>=Math.max(state.operating.spf50,state.operating.spf55)?'Lower running costs':'Lower design flow'):flow===55?'Smaller new radiators':'Balanced starting point',rooms,emitterCost,gross,grant,net:gross===null?null:gross-grant,annual:r.running.selected.annualCost,annualRange:r.running.selected.range,loadW:r.scenario.totalW,changedRooms:rooms.filter(r=>['replace','supplement'].includes(r.action)).length,unknownRooms:rooms.filter(r=>r.action==='inventory').length,panelCount:rooms.reduce((n,r)=>n+r.panels.length,0),fragileRooms:rooms.filter(r=>r.fragile).length,blocked,geometryPending:project.observations.some(o=>o.kind==='geometry'),designPending:rooms.some(r=>['columns','vertical','ufh'].includes(r.design.style)),routing:r.routing,status:blocked?'conflicts-with-preference':'provisional',result:r};
}
function packages(data,project){return [45,50,55].map(flow=>packageFor(data,project,flow));}
function compareOptions(a,b){
 const width=p=>p.rooms.reduce((n,r)=>n+r.panels.reduce((m,x)=>m+x.widthMm,0),0);
 return {from:a.flow,to:b.flow,sameGross:a.gross!==null&&b.gross!==null&&Math.abs(a.gross-b.gross)<.005,sameNet:a.net!==null&&b.net!==null&&Math.abs(a.net-b.net)<.005,samePanelCount:a.panelCount===b.panelCount,panelCount:a.panelCount,emitterCost:a.emitterCost,annualDelta:b.annual-a.annual,widthDeltaMm:width(b)-width(a),rooms:a.rooms.flatMap(r=>{const other=b.rooms.find(x=>x.id===r.id);if(!other||r.action===other.action&&JSON.stringify(r.panels)===JSON.stringify(other.panels))return [];return [{id:r.id,name:r.name,from:r.panels,to:other.panels,fromAction:r.action,toAction:other.action}];})};
}
function brief(data,project){const all=packages(data,project),preferred=project.household.priority==='running'?[...all].sort((a,b)=>a.annual-b.annual)[0].flow:project.household.priority==='changes'?55:50;return {packages:all,selected:all.find(p=>p.flow===project.selectedFlow),suggested:all.find(p=>p.flow===preferred),designApproved:false};}
function metrics(data,project){const p=packageFor(data,project,project.selectedFlow);return {flow:p.flow,loadW:p.loadW,net:p.net,annual:p.annual,rooms:p.rooms.map(r=>({id:r.id,name:r.name,loadW:r.loadW,action:r.action,panelCount:r.panels.length,panels:copy(r.panels),allowance:r.allowance})),geometryPending:p.geometryPending};}
function revise(project,data,patch,label,role='homeowner',at=new Date().toISOString()){
 validate(project,data);const next={...copy(project),...copy(patch)};validate(next,data);
 if(next.observations.length<project.observations.length||project.observations.some((o,i)=>JSON.stringify(o)!==JSON.stringify(next.observations[i])))throw Error('Earlier observations cannot be removed or rewritten. Add a correction instead.');
 const previous=metrics(data,project),after=metrics(data,next);
 next.events=copy(project.events);next.events.push({id:'revision-'+(project.events.length+1),at,role,label,evidenceRevision:data.revision,before:previous,after,beforeState:{choices:copy(project.choices),household:copy(project.household),selectedFlow:project.selectedFlow,observationCount:project.observations.length},afterState:{choices:copy(next.choices),household:copy(next.household),selectedFlow:next.selectedFlow,observationCount:next.observations.length}});
 return next;
}
function observe(project,data,observation){
 const o=copy(observation);validateObservation(o,data);if(project.observations.some(x=>x.id===o.id))throw Error('Observation already recorded');
 let choices=copy(project.choices);
 if(o.kind==='emitter')choices.emitters[o.target]={output50:o.output50,exponent:o.exponent,source:o.observer+': '+o.note,basis:o.role==='surveyor'?'site-inventory':'homeowner-reported'};
 if(o.kind==='envelope')choices.envelope[o.target]={choice:o.value,basis:o.role==='surveyor'?'survey-observed':'homeowner-reported',note:o.observer+': '+o.note};
 if(o.kind==='basement')choices.basement=o.value;
 if(o.kind==='photo-room')choices.photoRooms={...choices.photoRooms,[o.target]:o.roomId};
 const patch=Object.fromEntries(Object.entries(choices).filter(([k,v])=>k!=='events'&&JSON.stringify(v)!==JSON.stringify(project.choices[k])));
 if(Object.keys(patch).length)choices=P.change(project.choices,data,patch,o.at);
 return revise(project,data,{choices,observations:[...project.observations,o]},o.kind==='geometry'?'Room measurement recorded — geometry rebuild needed':o.kind==='access'?'Equipment-space evidence recorded — technical review needed':o.kind==='photo-room'?o.note:o.kind==='radiator-evidence'?'Radiator photos received — output assessment needed':'Evidence applied: '+o.kind,o.role,o.at);
}
function replay(project,data,index){
 validate(project,data);if(index<0||index>project.events.length)throw Error('Invalid replay position');
 if(!project.events.length)return copy(project);
 const state=index===0?project.events[0].beforeState:project.events[index-1].afterState;
 return validate({...copy(project),choices:copy(state.choices),household:copy(state.household),selectedFlow:state.selectedFlow,observations:copy(project.observations.slice(0,state.observationCount)),events:copy(project.events.slice(0,index))},data);
}
function tasks(data,project){
 const current=packageFor(data,project,project.selectedFlow),out=[];
 for(const g of data.thermalEvidence.groups){
  const entry=project.choices.envelope[g.id];if(entry?.basis==='survey-observed')continue;
  const values=Object.keys(g.options).map(choice=>P.thermalScenario(data,{...project.choices,envelope:{...project.choices.envelope,[g.id]:{choice,basis:'call-assumption',note:''}}}).totalW);
  const span=Math.max(...values)-Math.min(...values);
  out.push({id:'envelope-'+g.id,kind:'envelope',target:g.id,title:g.title,owner:entry?.basis==='homeowner-reported'?'Surveyor':'Homeowner / surveyor',impactW:span,effort:g.kind==='boundary'?8:3,why:g.observation,method:g.kind==='boundary'?'Identify the actual adjoining space and contact extent. Partial contact needs a geometry split; do not select full contact.':'Inspect the glass edge / spacer and record the source. The selected category still uses a representative U-value.',imageId:g.imageId,bbox:g.bbox});
 }
 for(const r of current.rooms.filter(r=>r.action!=='outside-scope'&&!r.inventoryVerified))out.push({id:'emitter-'+r.id,kind:'emitter',target:r.id,title:'Check every radiator in '+r.name,owner:'Surveyor',impactW:r.loadW,effort:6,why:r.action==='inventory'?'Existing heating is assumed. Identify its type and output; missing photos do not trigger replacement allowances.':r.fragile?'The photo range crosses demand: this check may avoid a replacement.':'Verify total output before confirming the room schedule.',method:'Record every emitter, width/height, sections and column depth or panel type. Add front and side photos; use catalogue DT50 ratings for the complete room total.',imageId:r.sourceEvidence[0]?.imageId,bbox:r.sourceEvidence[0]?.bbox});
 out.sort((a,b)=>(b.impactW/b.effort)-(a.impactW/a.effort));
 const feedback=Object.entries(project.household.roomFeedback||{}).filter(([,f])=>f.cold||f.use!=='usual'||f.note.trim());
 out.unshift(...feedback.map(([id,f])=>({id:'comfort-'+id,kind:'comfort',target:id,title:(f.cold?'Investigate why ':'Review how ')+current.rooms.find(r=>r.id===id).name+(f.cold?' feels cold':' is used'),owner:'Surveyor',impactW:null,why:'Homeowner report: '+(f.cold?'feels cold. ':'')+'Use: '+f.use+'. '+f.note,method:'Discuss when the problem occurs; check draughts, insulation, controls, balancing and radiator output. Agree comfort needs before changing design temperatures. This report does not itself increase calculated heat loss.'})));
 for(const r of current.rooms){
 if(r.homeownerEvidence.length)out.push({id:'review-photos-'+r.id,kind:'comfort',target:r.id,title:'Assess new radiator evidence in '+r.name,owner:'Remote surveyor',impactW:null,why:r.homeownerEvidence.length+' homeowner photo records received. No new output has been assumed.',method:'Identify each physical radiator once, inspect its type and dimensions, resolve duplicate views and derive sourced output ranges before updating the room inventory.'});
 if(r.design.style!=='open')out.push({id:'design-'+r.id,kind:'comfort',target:r.id,title:'Explore '+r.design.style+' heating in '+r.name,owner:'Designer / homeowner',impactW:null,why:'Homeowner style preference. Current sizes and allowances remain the standard-panel reference.',method:r.design.style==='ufh'?'Check usable floor area, floor construction, insulation, finishes, available build-up, disruption and room demand. Compare a supported floor system before substituting output or price.':'Shortlist actual products and finishes; compare output at the selected flow, available wall space and installed cost. Show an in-room preview before agreeing the appearance.'});
 }
 if((project.household.sitePreferences||[]).length)out.push({id:'site-preferences',kind:'access',target:'courtyard',title:'Review your preferred and avoid locations',owner:'Designer / homeowner',impactW:null,why:project.household.sitePreferences.length+' photo markers recorded. These are preferences, not approved siting zones or new pipe routes.',method:'Register the markers to a surveyed site plan. Model the front and rear near-house areas, access, openings, boundaries and services; explain which candidate locations pass, fail or need evidence, then agree the choice.'});
 const prefs=project.choices.preferences;
 if(prefs.occupants||(prefs.hotWaterHabits||[]).length||prefs.hotWaterNotes)out.push({id:'hot-water',kind:'hot-water',target:'household',title:'Plan hot water around your household',owner:'Surveyor / homeowner',impactW:null,why:householdBrief(project),method:'Check shower flow, bathing patterns, simultaneous use, recovery and available cylinder space. Agree capacity and timing with the household. These answers have not changed the annual hot-water energy assumption or selected a cylinder.'});
 out.push({id:'geometry',kind:'geometry',target:data.geometry.geometry.rooms.find(r=>r.sourceRoomId==='f-bed3')?.id||current.rooms[0].id,title:'Resolve the plan, rear heights and basement extent',owner:'Surveyor / modeller',impactW:null,why:'EPC 146 m² and model gross coverage 167 m² have different or unresolved scope. Roof and room shapes remain provisional.',method:'Measure net room area and clear height, record sloping ceilings and party contact. Measurements trigger model review; they do not scale every surface automatically.'});
 out.push({id:'access',kind:'access',target:project.choices.cylinder==='unresolved'?'utility':project.choices.cylinder,title:'Validate equipment, access and all three service routes',owner:'Technical surveyor',impactW:null,why:'Location markers and route lengths are hypotheses. Access evidence alone cannot approve a location.',method:'Measure delivery access, space and clearances. Check hydraulics, electricity supply/cable route, drainage and siting. Record inaccessible items explicitly.'});
 return out;
}
function importProject(project,data,incoming,at=new Date().toISOString()){
 validate(incoming,data);
 for(const o of incoming.observations){const prior=project.observations.find(x=>x.id===o.id);if(prior&&JSON.stringify(prior)!==JSON.stringify(o))throw Error('An observation ID conflicts with existing evidence. Preserve both records under distinct IDs.');}
 const next=revise(project,data,{choices:incoming.choices,household:incoming.household,selectedFlow:incoming.selectedFlow,observations:[...project.observations,...incoming.observations.filter(o=>!project.observations.some(x=>x.id===o.id))]},'Imported project choices; original history archived','adviser',at);
 next.imports=[...(project.imports||[]),{at,source:copy(incoming)}];return next;
}
function technicalResult(data,project,choices=project.choices){
 const r=P.evaluate(data,choices),p=packageFor(data,{...project,choices},choices.flow);
 const verified=p.rooms.filter(x=>x.inventoryVerified).reduce((n,x)=>n+x.allowance,0),unverified=p.emitterCost-verified;
 return {...r,budget:{...r.budget,total:p.gross,netTotal:p.net,grantDeduction:p.grant,upgrades:verified,reserve:unverified,reservedRooms:p.rooms.filter(x=>!x.inventoryVerified&&x.panels.length).length,low:p.gross,high:p.gross,netLow:p.net,netHigh:p.net},installationPackage:p};
}
// Guide from actual room evidence, never from the absence of a photo alone.
function roomGuide(r){
 const received=r.homeownerEvidence.length>0,verified=r.inventoryVerified;
 return {
 status:verified?'Inventory recorded':received?'Photos received · assessment pending':r.existingW===null?'Output still unknown':'Photo estimate · to verify',
 request:verified?'We have a rated inventory for this room':received?'Thank you — we’ll assess these photos':r.existingW===null?'Help us see the heating in this room':'Help us check the radiator type and size',
 evidence:verified?'No need to photograph the same inventory again unless it has changed. We still need to check physical fit and room assumptions.':received?'Your photos are attached to this room. Add more only if something is missing; they have not yet changed the output estimate.':r.existingW===null?'We assume this room is heated, but cannot size its radiators from the current evidence. A clear front and side photo of each radiator will help.':'The listing photo gives us a starting estimate, not a complete measured inventory. A front and side photo, plus width and height if practical, would help verify it.',
 approach:r.action==='outside-scope'?'Review the heated scope first':r.existingW===null?'Keep your options open while we check output':r.action==='retain'?'The current estimate suggests these could stay':'We may need more heat-emitting capacity here',
 implication:r.action==='outside-scope'?'This technical scenario excludes the room. Review the scope in the technical workbench before planning its heating.':r.existingW===null?'No replacement is budgeted just because output is unknown. Tell us what you like; we’ll assess capacity before choosing equipment.':r.action==='retain'?'Keeping them appears possible at this flow setting. Dimensions, room assumptions and on-site performance still need checking.':r.preserve?'We will investigate extra capacity alongside the radiators you want to keep. That still needs space and a product check.':'You can replace the existing radiators, or keep them and explore supplementary capacity. Choose the appearance you would like below.'
 };
}
return {roomGuide,photoMatches,matchingQueue,assignPhoto,habitLabels,householdBrief,compareOptions,importProject,technicalResult,create,validate,revise,observe,replay,packages,packageFor,brief,tasks,metrics,sizePanels};
});
