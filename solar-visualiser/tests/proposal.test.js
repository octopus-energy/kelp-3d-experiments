const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),vm=require('node:vm');
const D=require('../3broomroad-data/proposal/proposal.json'),P=require('../js/building/proposal');
assert.equal(D.epc.latest.certificate_number,'8536-5427-1600-0864-0226');assert.equal(D.epc.latest.address1,'3 Broom Road');assert(D.epc.recommendations.every(r=>r.certificate_number===D.epc.latest.certificate_number));assert.equal(D.epc.older.length,1);
assert.equal(D.geometry.geometry.rooms.length,13);assert(D.geometry.openingCoverage.every(o=>o.areaAssigned>0));assert(D.geometry.geometry.surfaces.some(s=>s.boundary==='party'));assert(D.geometry.geometry.surfaces.some(s=>s.boundary==='basement-mixed'));
for(const [name,s] of Object.entries(D.scenarios)){assert(s.totalW>0);assert.equal(s.totalW,s.rooms.reduce((n,r)=>n+(r.loadW||0),0));assert.equal(s.rooms.length,13);assert(s.rooms.every(r=>r.included||r.loadW===null));}
let state={...P.defaults(D),usePhotoEstimates:false},result=P.evaluate(D,state);assert.equal(result.unknown,13);assert.equal(result.upgrade,0);assert.equal(result.keep,0);assert(result.rooms.every(r=>r.availableW===null));
const room=result.rooms.find(r=>r.sourceRoomId==='g-living'),low=P.evaluate(D,{...state,flow:45}),high=P.evaluate(D,{...state,flow:55});assert(low.rooms.find(r=>r.id===room.id).required50>high.rooms.find(r=>r.id===room.id).required50);assert.equal(low.scenario.totalW,high.scenario.totalW,'Flow temperature does not change building demand');
const before=JSON.stringify(state);state=P.change(state,D,{emitters:{[room.id]:{output50:0,exponent:1.3,source:'Confirmed no radiator'}}});assert.equal(P.evaluate(D,state).upgrade,1);assert.equal(P.defaults(D).events.length,0);assert.notEqual(JSON.stringify(state),before);assert.equal(state.events.length,1);
const ambiguous=P.evaluate(D,{...state,emitters:{[room.id]:{output50:0,exponent:1.3,source:''}}});assert.equal(ambiguous.unknown,13,'Zero without evidence is still unknown');
const large={...state,emitters:{[room.id]:{output50:100000,exponent:1.3,source:'Fixture catalogue'}}};assert.equal(P.evaluate(D,large).keep,1);
const cool=P.evaluate(D,{...state,basement:'cool'});assert.equal(cool.rooms.filter(r=>r.status==='unheated').length,5);assert.equal(cool.rooms.filter(r=>r.status==='unheated').some(r=>r.required50!==null),false);
const far=P.evaluate(D,{...state,outdoor:'garden'});assert(far.routing.length>result.routing.length);assert(far.budget.route>result.budget.route);assert.equal(P.evaluate(D,{...state,cylinder:'unresolved'}).budget.total,null);assert(P.evaluate(D,{...state,reserve:0}).budget.total<P.evaluate(D,{...state,reserve:13}).budget.total);
assert.throws(()=>P.validate({...state,propertyId:'original'},D),/another property/);assert.throws(()=>P.validate({...state,revision:'old'},D),/revision/);assert.throws(()=>P.validate({...state,flow:0},D),/Invalid/);assert.throws(()=>P.validate({...state,rates:{...state.rates,equipment:-100}},D),/non-negative/);
assert.equal(P.snapshot(D,state).designApproved,false);assert.equal(P.snapshot(D,state).result.rooms.length,13);
const restored=P.restore(state,P.defaults(D),D);assert.equal(restored.events.length,state.events.length+1);assert.deepEqual(restored.emitters,{});assert.equal(restored.events.at(-1).action,'restore-discussion');assert.equal(restored.events.at(-1).previousChoices.emitters[room.id].output50,0,'Restoring a call retains the prior decision trail');

// Real photo evidence: seven assigned physical emitters in six rooms, one unassigned.
const photos=P.evaluate(D,P.defaults(D));assert.equal(photos.estimated,6);assert.equal(photos.unknown,7);assert.equal(photos.unverified,13);assert.equal(photos.upgrade,0);assert.equal(photos.keep,0);
assert.equal(photos.unassigned.length,1);assert.equal(photos.unassigned[0].roomId,null);
assert.equal(new Set(D.emitterEstimates.emitters.map(e=>e.id)).size,8,'One record per physical emitter');
for(const e of D.emitterEstimates.emitters){assert.equal(e.inventoryComplete,false);assert(D.emitterEstimates.reviewedImages.includes(e.imageId));assert(e.roomId===null||D.geometry.geometry.rooms.some(r=>r.sourceRoomId===e.roomId));assert.deepEqual(e.variants.map(v=>v.label),['lower','central','upper']);for(const v of e.variants)assert(D.emitterEstimates.references[D.emitterEstimates.catalogue[v.reference].referenceId]);}
const kitchen=photos.rooms.find(r=>r.sourceRoomId==='g-kitchen');assert.equal(kitchen.estimates.length,2);assert.equal(kitchen.output50,588+756,'Distinct kitchen and rear-living radiators counted once');assert.equal(kitchen.status,'estimated-shortfall');assert.equal(kitchen.source.includes('unmeasured'),true);
const hall=photos.rooms.find(r=>r.sourceRoomId==='g-hall');assert.equal(hall.output50,18*60.9,'Sections times catalogue watts; do not multiply by column depth again');assert(Math.abs(hall.availableW-1096.2*((50-2.5-18)/50)**1.27)<1e-8,'Manufacturer exponent, not generic n');
assert.equal(photos.rooms.find(r=>r.sourceRoomId==='f-bed2').availableW,null);assert.equal(photos.rooms.find(r=>r.sourceRoomId==='f-bed3').availableW,null,'Unassigned bedroom never enters a room total');
assert.deepEqual(photos.budget,result.budget,'Photo hypotheses preserve unverified budget reserves');
const disabled=P.evaluate(D,{...P.defaults(D),usePhotoEstimates:false});assert.equal(disabled.unknown,13);assert.equal(disabled.estimated,0);
const manual=P.evaluate(D,{...P.defaults(D),emitters:{[hall.id]:{output50:2000,source:'Label',exponent:1.3}}}).rooms.find(r=>r.id===hall.id);assert.equal(manual.basis,'entered');assert.equal(manual.output50,2000);assert.equal(manual.rangeW,null,'Manual rating replaces the hypothesis');
const blank=P.evaluate(D,{...P.defaults(D),emitters:{[hall.id]:{output50:null,source:'',exponent:1.3}}}).rooms.find(r=>r.id===hall.id);assert.equal(blank.status,'unknown','Explicit blank suppresses photo assumption until reset');
assert.equal(P.evaluate(D,{...P.defaults(D),basement:'cool'}).estimated,5);
assert(P.evaluate(D,{...P.defaults(D),flow:55}).rooms.find(r=>r.id===hall.id).availableW>hall.availableW);
assert.deepEqual(P.snapshot(D,P.defaults(D)).emitterEvidence,D.emitterEstimates,'Export retains variants, sources and observations');


// Neighbour adjacency is already part of the baseline, not a hoped-for reduction.
assert(D.thermalEvidence.audit.partyArea>110&&D.thermalEvidence.audit.partyArea<120);
assert(D.thermalEvidence.audit.mainWallsOutside['central-warm']-D.scenarios['central-warm'].totalW>4900);
const base=P.defaults(D),choice=(id,value)=>({...base,envelope:{[id]:{choice:value,basis:'call-assumption',note:''}}});
const single=P.evaluate(D,choice('bay-lower','single')),double=P.evaluate(D,choice('bay-lower','double'));
assert(single.scenario.totalW>double.scenario.totalW);assert(single.rooms.find(r=>r.sourceRoomId==='g-living').loadW>double.rooms.find(r=>r.sourceRoomId==='g-living').loadW);
assert.equal(single.rooms.find(r=>r.sourceRoomId==='g-kitchen').loadW,double.rooms.find(r=>r.sourceRoomId==='g-kitchen').loadW,'Glazing only changes assigned rooms');
assert(double.rooms.find(r=>r.sourceRoomId==='g-living').required50<single.rooms.find(r=>r.sourceRoomId==='g-living').required50);
assert(P.evaluate(D,choice('rear-neighbour-ground','heated')).scenario.totalW<photos.scenario.totalW);
const noTransfer=P.evaluate(D,choice('main-left','same'));const leftIds=new Set(D.thermalEvidence.groups.find(g=>g.id==='main-left').surfaceIds);assert(noTransfer.scenario.rooms.flatMap(r=>r.surfaces).filter(s=>leftIds.has(s.identifier)).every(s=>s.heatloss===0),'Matching room temperature removes both losses and gains');
assert.throws(()=>P.validate({...base,envelope:{'bay-lower':{choice:'double',basis:'homeowner-reported',note:''}}},D),/missing confirmation/);
assert.throws(()=>P.validate(choice('invented','double'),D),/Invalid envelope/);
for(const scenario of [single.scenario,double.scenario]){assert.equal(scenario.totalW,scenario.rooms.reduce((n,r)=>n+(r.loadW||0),0));for(const r of scenario.rooms)assert.equal(r.fabricW,r.surfaces.reduce((n,s)=>n+s.heatloss,0),'Surface evidence updated with room total');}
const combined={...base,envelope:{'bay-lower':{choice:'double',basis:'homeowner-reported',note:'Homeowner: replacement paperwork'},'rear-neighbour-ground':{choice:'heated',basis:'call-assumption',note:''}}};
const cp=P.evaluate(D,combined);assert(cp.range[0]===P.thermalScenario(D,combined,'lower').totalW&&cp.range[1]===P.thermalScenario(D,combined,'higher').totalW,'Sensitivity uses current choices');
assert.deepEqual(P.snapshot(D,combined).choices.envelope,combined.envelope);

// Upfront cash cost and recurring electricity are separate calculations.
const costState=P.defaults(D),cost=P.evaluate(D,costState);
assert(Math.abs(cost.budget.total-21386.55/2)<3,'User-requested approximate 50% gross budget');
assert.equal(cost.budget.netTotal,cost.budget.total-7500,'Subtract BUS once after contingency');assert.equal(cost.budget.grantStatus,'assumed-eligible');
const noGrant=P.evaluate(D,{...costState,grantIncluded:false});assert.equal(noGrant.budget.netTotal,cost.budget.total);assert.deepEqual(noGrant.running,cost.running,'Grant is not an annual saving');
const noRoute=P.evaluate(D,{...costState,cylinder:'unresolved'});assert.equal(noRoute.budget.netTotal,null);assert.equal(noRoute.budget.grantDeduction,null);
const free=P.evaluate(D,{...costState,rates:Object.fromEntries(Object.keys(costState.rates).map(k=>[k,0]))});assert.equal(free.budget.netTotal,0);assert.equal(free.budget.grantDeduction,0,'Never show a grant cash windfall');
assert.equal(cost.running.spaceHeat,cost.scenario.totalW/1000*1600);
const rows=cost.running.rows;assert(rows[0].annualCost<rows[1].annualCost&&rows[1].annualCost<rows[2].annualCost);
assert(Math.abs(rows[0].annualCost-((cost.running.spaceHeat/3.6)+(3000/2.5)+150)*.27)<1e-9,'Separate space, water and auxiliary electricity');
assert(rows.every(row=>row.hotWaterElectricity===1200));assert.equal(cost.running.selected.flow,50);
const tariff=P.evaluate(D,{...costState,operating:{...costState.operating,electricityPence:54}});assert.equal(tariff.running.selected.annualCost,2*cost.running.selected.annualCost);assert.equal(tariff.scenario.totalW,cost.scenario.totalW);
const entered={...costState,operating:{...costState.operating,annualHeatKwh:10000}};assert.equal(P.evaluate(D,{...entered,basement:'cool'}).running.spaceHeat,10000,'Entered annual demand is held fixed and labelled');
assert(P.evaluate(D,{...costState,basement:'cool'}).running.spaceHeat<cost.running.spaceHeat,'Model proxy follows heated scope');
assert.equal(P.evaluate(D,{...costState,flow:45}).running.spaceHeat,P.evaluate(D,{...costState,flow:55}).running.spaceHeat,'Flow does not change the useful heat requirement');
for(const invalid of [{spf50:0},{electricityPence:-1},{annualHeatKwh:-1},{hotWaterSpf:Infinity}])assert.throws(()=>P.validate({...costState,operating:{...costState.operating,...invalid}},D),/Invalid/);
assert.equal(P.snapshot(D,costState).operatingEvidence.grant.amount,7500);assert(rows.every(row=>row.range[0]<row.annualCost&&row.range[1]>row.annualCost));
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../3broomroad-data/proposal/bundle.js'),'utf8'),context);assert.deepEqual(JSON.parse(JSON.stringify(context.window.BROOM_PROPOSAL)),D);
for(const [file,hash] of Object.entries(D.sourceHashes))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(__dirname,'..',file))).digest('hex'),hash,'Proposal is stale: '+file);
console.log('Proposal: EPC selection, complete geometry, scope, unknown emitters, flow/cost coupling, routing, provenance and revision isolation passed');
