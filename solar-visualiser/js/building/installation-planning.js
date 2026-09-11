// Room comparisons and household planning records; no DOM or derived geometry is persisted.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory(require('./proposal'));else(root.SolarViz=root.SolarViz||{}).installationPlanning=factory(root.SolarViz.proposal);})(typeof window==='undefined'?globalThis:window,function(P){
'use strict';
const copy=x=>JSON.parse(JSON.stringify(x));
const serviceLabels={boiler:'Existing boiler',cylinder:'Existing hot-water cylinder',meter:'Electricity meter',consumer:'Consumer unit'};
const improvementLabels={insulation:'Insulate a wall',glazing:'Improve the glazing',none:'Keep the room as it is for now'};
const checkDefinitions=[
 {id:'room-design',title:'Room heat loss & emitter design',phase:'Design',need:'Confirm dimensions, glazing, boundaries, room temperatures and every emitter; assess the chosen flow temperature.'},
 {id:'siting',title:'Equipment fit, access & garden paths',phase:'Design',need:'Record heat-pump and cylinder models, manufacturer clearances, service access, delivery route and the paths to keep usable.'},
 {id:'noise',title:'Noise & planning assessment',phase:'Design',need:'Record the selected model, assessment positions, reflections and the applicable planning route. A photo pin cannot establish compliance.'},
 {id:'services',title:'Pipework, electricity & drainage',phase:'Design',need:'Trace existing and proposed runs, pipe sizes, supply capacity, isolation and discharge routes with the relevant specialists.'},
 {id:'gas',title:'Gas appliances & end of supply',phase:'Before work',need:'Account for cooking, fires and all other gas uses; confirm replacement work, meter/supply arrangements, charges and dates with the supplier.'},
 {id:'quote',title:'Written scope, grant & payment terms',phase:'Before work',need:'Review priced work, exclusions, eligibility, deposit, payment milestones and any lender offer.'},
 {id:'commissioning',title:'Commissioning & handover certificates',phase:'After installation',need:'Record the actual installation documents, electrical/building compliance as applicable, commissioning results, controls guidance and warranty.'}
];
function validate(h,data){
 const p=h.planning;if(p===undefined)return;
 const record=v=>v&&typeof v==='object'&&!Array.isArray(v),text=v=>typeof v==='string'&&v.length<=5000;
 if(!record(p)||p.rooms!==undefined&&!record(p.rooms)||Object.keys(p).some(k=>!['rooms','gas','finance'].includes(k)))throw Error('Invalid household planning record');
 for(const [id,r] of Object.entries(p.rooms||{})){
  if(!data.geometry.geometry.rooms.some(r=>r.id===id)||!record(r)||!Array.isArray(r.improvements)||r.improvements.some(v=>!Object.hasOwn(improvementLabels,v))||new Set(r.improvements).size!==r.improvements.length||r.improvements.includes('none')&&r.improvements.length>1)throw Error('Invalid room improvement preference');
  for(const [group,value] of Object.entries(r.glazing||{}))if(!data.thermalEvidence.groups.some(g=>g.id===group&&g.kind==='opening'&&g.roomIds.includes(id)&&Number.isFinite(g.options[value]?.u)))throw Error('Invalid glazing comparison');
 }
 if(p.gas){const g=p.gas;if(!record(g)||!['unknown','keep','explore'].includes(g.intent)||!text(g.appliances)||!text(g.source)||g.standingPence!==null&&(!Number.isFinite(g.standingPence)||g.standingPence<0||g.standingPence>1000))throw Error('Enter a valid gas bill standing charge or leave it unknown');}
 if(p.finance){const f=p.finance;if(!record(f)||!text(f.source)||!['cash','loan'].includes(f.method)||!['deposit','apr','months','extra'].every(k=>f[k]===null||Number.isFinite(f[k])&&f[k]>=0)||f.deposit>1000000||f.extra>1000000||f.apr>100||f.months!==null&&(!Number.isInteger(f.months)||f.months<1||f.months>360))throw Error('Enter valid payment assumptions; leave unknown amounts blank');}
}
function validateObservation(o,data){
 if(o.kind==='room-context'&&(!data.geometry.geometry.rooms.some(r=>r.id===o.target)||!['unknown','original','extension','mixed'].includes(o.extension)))throw Error('Choose a room and its reported construction context');
 if(o.kind==='service'&&(!Object.hasOwn(serviceLabels,o.target)||!['unknown','present','absent'].includes(o.presence)||typeof o.location!=='string'||o.location.length>5000||o.presence==='present'&&!o.location.trim()))throw Error('Describe where the existing equipment is, or leave its presence unknown');
 if(o.kind==='planning-check'&&(!checkDefinitions.some(c=>c.id===o.target)||!['needs-review','document-received','reviewed'].includes(o.status)||typeof o.reference!=='string'||!o.reference.trim()||o.reference.length>5000||typeof o.scope!=='string'||!o.scope.trim()||o.scope.length>5000||o.status==='reviewed'&&o.role==='homeowner'||typeof o.signature!=='string'))throw Error('Record the document reference, its scope and an adviser or surveyor for a completed review');
}
function roomGroups(data,id){return data.thermalEvidence.groups.filter(g=>g.roomIds.includes(id));}
function roomComparison(data,project,id,glazing={}){
 const envelope=copy(project.choices.envelope);
 for(const [group,choice] of Object.entries(glazing)){
  if(!roomGroups(data,id).some(g=>g.id===group&&g.kind==='opening'&&Number.isFinite(g.options[choice]?.u)))throw Error('Unsupported room glazing scenario');
  envelope[group]={choice,basis:'call-assumption',note:'Proposed glazing comparison only'};
 }
 return [45,50,55].map(flow=>{const current=P.evaluate(data,{...project.choices,flow}).rooms.find(r=>r.id===id),proposed=P.evaluate(data,{...project.choices,flow,envelope}).rooms.find(r=>r.id===id);return {flow,current,proposed};});
}
function finance(net,f){
 if(!f||net===null||f.extra===null)return {ready:false,reason:'Add any extra work allowance (including zero), and resolve the installation scope.'};
 const total=net+f.extra;
 if(f.method==='cash')return {ready:true,total,upfront:total,monthly:0,interest:0,repay:0,borrowed:0};
 if([f.deposit,f.apr,f.months].some(v=>v===null))return {ready:false,reason:'Enter a deposit, annual rate and term to compare monthly payments.'};
 if(f.deposit>total)return {ready:false,reason:'The deposit exceeds this scenario’s total cost.'};
 const borrowed=total-f.deposit,rate=f.apr/1200,monthly=borrowed===0?0:rate===0?borrowed/f.months:borrowed*rate/(1-Math.pow(1+rate,-f.months)),repay=monthly*f.months;
 return {ready:true,total,upfront:f.deposit,borrowed,monthly,repay,interest:repay-borrowed,totalPaid:f.deposit+repay};
}
// Conservative scope fingerprint: any evidence or design change requires renewed document review.
// Payment-only edits do not invalidate physical checks; earlier signatures remain in the observations.
function signature(project,target){
 const choices=copy(project.choices),household=copy(project.household);delete choices.events;
 if(target!=='quote'){delete choices.rates;delete choices.grantIncluded;delete choices.operating;if(household.planning)delete household.planning.finance;}
 const observations=project.observations.filter(o=>!['planning-check','discussion'].includes(o.kind));
 const text=JSON.stringify({revision:project.revision,choices,household,observations});
 let a=2166136261,b=2246822519;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917);}
 return 'scope-v1:'+text.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
}
function checks(project){return checkDefinitions.map(c=>{const evidence=project.observations.filter(o=>o.kind==='planning-check'&&o.target===c.id).at(-1),stale=!!evidence&&evidence.signature!==signature(project,c.id);return {...c,evidence,stale,status:stale?'needs-review':evidence?.status||'not-recorded'};});}
function latestService(project,key){return project.observations.filter(o=>o.kind==='service'&&o.target===key).at(-1)||null;}
function pending(data,project){
 const out=[];
 for(const [id,r] of Object.entries(project.household.planning?.rooms||{}))if(r.improvements.some(v=>v!=='none')||Object.keys(r.glazing||{}).length)out.push({id:'improve-'+id,kind:'comfort',target:id,title:'Compare fabric improvements in '+data.geometry.geometry.rooms.find(r=>r.id===id).name,owner:'Adviser / surveyor',impactW:0,effort:5,why:'The homeowner wants to compare improvements before choosing emitter work.',method:'Check the affected surfaces, construction, moisture implications, disruption and price. Saved glazing comparisons have not changed the existing-home calculation.'});
 for(const o of project.observations.filter(o=>o.kind==='room-context'))if(!out.some(t=>t.id==='context-'+o.target))out.push({id:'context-'+o.target,kind:'comfort',target:o.target,title:'Review construction in '+data.geometry.geometry.rooms.find(r=>r.id===o.target).name,owner:'Surveyor',impactW:0,effort:5,why:'Room construction or boundaries have been described.',method:'Use the latest room account and confirm the affected construction. Notes alone do not change geometry or U-values.'});
 return out;
}
return {validate,validateObservation,roomGroups,roomComparison,finance,signature,checks,latestService,pending,serviceLabels,improvementLabels,checkDefinitions};
});
