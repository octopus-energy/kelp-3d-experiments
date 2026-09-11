const assert=require('node:assert/strict'),J=require('../js/building/installation'),P=require('../js/building/proposal'),D=require('../3broomroad-data/proposal/proposal.json');
let project=J.create(D),before=JSON.stringify(project);const options=J.packages(D,project);
assert.equal(options.length,3);for(const p of options){assert.equal(p.unknownRooms,7);assert.equal(p.rooms.length,13);assert.equal(p.gross,(p.result.budget.base+p.result.budget.route+p.emitterCost)*1.15);assert.equal(p.net,p.gross-7500);assert.equal(p.panelCount,p.rooms.reduce((n,r)=>n+r.panels.length,0));for(const r of p.rooms.filter(r=>!['outside-scope','inventory'].includes(r.action)))assert(r.proposedW+.00001>=r.loadW,'Scheduled capacity meets room demand using actual analogue exponent');}
assert.equal(JSON.stringify(project),before,'Derivation immutable');
const living=options[1].rooms.find(r=>r.sourceRoomId==='g-living');project=J.revise(project,D,{household:{...project.household,preserve:[living.id]}},'Keep living radiator');const preserved=J.packageFor(D,project,50).rooms.find(r=>r.id===living.id);assert.equal(preserved.action,'supplement');assert(preserved.proposedW>=preserved.loadW);assert(preserved.panels.reduce((n,p)=>n+p.output50,0)<living.panels.reduce((n,p)=>n+p.output50,0),'Retained output reduces additional capacity');assert(preserved.allowance<=living.allowance,'Flat pricing only falls if fewer radiators are needed');
const baseline=J.create(D),o={id:'test-emitter-1',at:'2026-09-10T17:00:00Z',kind:'emitter',target:living.id,role:'surveyor',observer:'Test fixture',note:'Synthetic test catalogue rating; no actual survey',output50:9000,exponent:1.3,complete:true};
const revised=J.observe(baseline,D,o);assert.equal(revised.observations.length,1);assert.equal(J.packageFor(D,revised,50).rooms.find(r=>r.id===living.id).action,'retain');assert(J.packageFor(D,revised,50).net<J.packageFor(D,baseline,50).net);assert.equal(revised.events.at(-1).before.loadW,revised.events.at(-1).after.loadW,'Emitter measurement does not change heat loss');assert.equal(J.replay(revised,D,0).choices.emitters[living.id],undefined);assert.equal(J.replay(revised,D,1).choices.emitters[living.id].output50,9000);assert(!J.tasks(D,revised).some(t=>t.id==='emitter-'+living.id));
assert.throws(()=>J.observe(baseline,D,{...o,complete:false}),/complete/);assert.throws(()=>J.observe(baseline,D,{...o,output50:-1}),/valid/);assert.throws(()=>J.observe(baseline,D,{...o,note:''}),/source/);assert.throws(()=>J.observe(revised,D,o),/already/);
const shared=J.observe(revised,D,{id:'test-wall',at:o.at,kind:'envelope',target:'rear-neighbour-ground',value:'heated',role:'surveyor',observer:'Test fixture',note:'Synthetic full-height contact observation'});assert(J.metrics(D,shared).loadW<J.metrics(D,revised).loadW);assert.equal(shared.choices.envelope['rear-neighbour-ground'].basis,'survey-observed');assert.equal(J.replay(shared,D,1).choices.envelope['rear-neighbour-ground'],undefined);
const measurement=J.observe(shared,D,{id:'test-geometry',at:o.at,kind:'geometry',target:living.id,heightM:2.7,areaM2:22,role:'surveyor',observer:'Fixture',note:'Synthetic dimensions'});assert(J.metrics(D,measurement).geometryPending);assert.equal(J.metrics(D,measurement).loadW,J.metrics(D,shared).loadW,'No false recomputation from unprocessed geometry');
const noGrant=J.revise(baseline,D,{choices:{...baseline.choices,grantIncluded:false}},'No grant');assert.equal(J.metrics(D,noGrant).net,options[1].gross);assert.equal(J.packageFor(D,noGrant,50).annual,options[1].annual);
const noRoute=J.revise(baseline,D,{choices:{...baseline.choices,cylinder:'unresolved'}},'Unresolved space');assert.equal(J.metrics(D,noRoute).net,null);
const conflict=J.revise(baseline,D,{household:{...baseline.household,noKitchenCylinder:true},choices:{...baseline.choices,cylinder:'kitchen'}},'Storage constraint');assert(J.packageFor(D,conflict,50).blocked);
assert.throws(()=>J.validate({...baseline,propertyId:'wrong'},D),/another/);assert.throws(()=>J.validate({...baseline,revision:'old'},D),/revision/);
assert(!J.tasks(D,baseline).some(t=>t.kind==='basement'),'Photo-supported heated lower ground is not an unanswered scope question');
const cool=J.revise(baseline,D,{choices:{...baseline.choices,basement:'cool'}},'Explore cool lower ground');assert(!J.tasks(D,cool).some(t=>t.kind==='basement'),'No homeowner heating-scope question, even for an imported cool scenario');assert(J.tasks(D,baseline).some(t=>t.kind==='geometry'));assert(J.tasks(D,baseline).some(t=>t.kind==='access'));
assert.equal(P.evaluate(D,shared.choices).scenario.totalW,J.metrics(D,shared).loadW,'Shared technical workbench sees the same heat loss');
console.log('Installation: explicit schedules, per-analogue capacity, preferences, measured updates, immutable replay, price coupling and pending geometry checks passed');
// Import preserves both lineages and rejects evidence identity collisions.
const imported=J.importProject(baseline,D,shared);assert.equal(imported.imports[0].source.events.length,shared.events.length);assert.equal(imported.observations.length,shared.observations.length);assert.equal(J.metrics(D,imported).loadW,J.metrics(D,shared).loadW);assert.equal(J.replay(imported,D,0).observations.length,0);
assert.throws(()=>J.importProject(revised,D,{...revised,observations:[{...o,note:'conflicting identity'}]}),/conflicts/);
assert.throws(()=>J.revise(revised,D,{observations:[]},'Erase'),/cannot|position/);
assert.throws(()=>J.observe(baseline,D,{...o,attachments:[{name:'bad',dataUrl:'https://external.invalid/image.png'}]}),/attachment/);
assert.throws(()=>J.validate({...revised,events:[{...revised.events[0],afterState:{...revised.events[0].afterState,observationCount:200}}]},D),/position/);
for(const flow of [45,50,55]){const choices={...project.choices,flow},technical=J.technicalResult(D,project,choices),candidate=J.packageFor(D,{...project,choices},flow);assert.equal(technical.budget.netTotal,candidate.net,'One budget across both views');}
console.log('Installation import lineage, append-only corrections, attachments and shared budgets passed');
assert(!('events' in shared.choices.events.at(-1).changes),'Observation changes never recursively embed prior event history');
const reverse={...baseline,choices:{...baseline.choices,operating:{...baseline.choices.operating,spf45:2,spf55:4}}};assert.equal(J.brief(D,reverse).suggested.flow,50);reverse.household={...reverse.household,priority:'running'};assert.equal(J.brief(D,reverse).suggested.flow,55,'Priority follows actual editable cost scenarios');assert.equal(J.packageFor(D,reverse,45).title,'Lower design flow');

// Heating presence, unknown output and replacement work are separate facts.
for(const p of options){assert.equal(p.emitterCost,300*p.panelCount);for(const room of p.rooms.filter(r=>r.action==='inventory')){assert.equal(room.heatingPresence,'assumed-present');assert.equal(room.existingW,null);assert.equal(room.proposedW,null);assert.equal(room.allowance,0);assert.equal(room.panels.length,0);assert.equal(room.capacityResolved,false);}}
assert.equal(options[1].result.rooms.filter(r=>r.included).length,13,'Existing default heating scope includes the occupied rooms');
const dearer={...baseline,choices:{...baseline.choices,rates:{...baseline.choices.rates,radiatorChange:450}}};assert.equal(J.packageFor(D,dearer,50).emitterCost,options[1].panelCount*450);
assert.equal(J.packageFor(D,dearer,50).loadW,options[1].loadW,'Pricing does not alter heat loss');
const absent=J.observe(baseline,D,{...o,id:'absent-test',target:options[1].rooms.find(r=>r.action==='inventory').id,output50:0});const absentRoom=J.packageFor(D,absent,50).rooms.find(r=>r.id===absent.observations[0].target);assert.equal(absentRoom.heatingPresence,'reported-absent');assert(absentRoom.panels.length>0,'Confirmed absence can introduce installation work');

// Flat rates can give equal prices with different dimensions; replay must retain those dimensions.
const comparison=J.compareOptions(options[1],options[2]);
assert(comparison.sameGross&&comparison.sameNet&&comparison.samePanelCount);
assert.equal(comparison.panelCount,8);assert(comparison.widthDeltaMm<0);assert(comparison.annualDelta>150);assert(comparison.rooms.length>0);
const hotter=J.revise(baseline,D,{selectedFlow:55,choices:{...baseline.choices,flow:55}},'Compare 55 C');
const change=hotter.events.at(-1);assert.equal(change.before.net,change.after.net);assert.notDeepEqual(change.before.rooms.map(r=>r.panels),change.after.rooms.map(r=>r.panels));
assert.equal(J.compareOptions({...options[1],net:null,gross:null},{...options[2],net:null,gross:null}).sameNet,false,'Unknown cost is not an equal price');
console.log('Heated-scope consistency, equal-price explanations and dimension replay passed');

// Household feedback creates actionable checks without inventing a new design temperature.
const feedback=J.revise(baseline,D,{household:{...baseline.household,roomFeedback:{[living.id]:{cold:true,use:'daytime',note:'Cold at my desk in the mornings'}}},choices:{...baseline.choices,preferences:{...baseline.choices.preferences,occupants:'4',hotWaterHabits:['morning','overlap'],hotWaterNotes:'School mornings'}}},'Household routines');
assert.equal(J.metrics(D,feedback).loadW,J.metrics(D,baseline).loadW);assert.equal(J.packageFor(D,feedback,50).annual,options[1].annual);
assert.equal(J.tasks(D,feedback)[0].id,'comfort-'+living.id);assert(J.tasks(D,feedback).some(t=>t.kind==='hot-water'&&t.why.includes('4 people')));
assert.equal(J.packageFor(D,feedback,50).rooms.find(r=>r.id===living.id).comfort.cold,true);
assert.throws(()=>J.revise(baseline,D,{household:{...baseline.household,roomFeedback:{bad:{cold:true,use:'usual',note:''}}}},'bad'),/feedback/);
assert.throws(()=>P.validate({...baseline.choices,preferences:{...baseline.choices.preferences,occupants:'2.5'}},D),/whole number/);
// Unassigned radiator -> one room -> corrected room -> unresolved, with immutable replay.
const image='8d1cee4f0ff1f1632f03ce295d77e9eb',room2=D.geometry.geometry.rooms.find(r=>r.sourceRoomId==='f-bed2'),room3=D.geometry.geometry.rooms.find(r=>r.sourceRoomId==='f-bed3');
const matched=J.assignPhoto(baseline,D,image,'f-bed2');
assert.equal(J.packageFor(D,matched,50).rooms.find(r=>r.id===room2.id).basis,'photo-estimate');
assert.equal(P.evaluate(D,matched.choices).unassigned.length,P.evaluate(D,baseline.choices).unassigned.length-1);
assert.equal(J.metrics(D,matched).loadW,J.metrics(D,baseline).loadW);
const corrected=J.assignPhoto(matched,D,image,'f-bed3');
assert.equal(J.packageFor(D,corrected,50).rooms.find(r=>r.id===room2.id).existingW,null);
assert(J.packageFor(D,corrected,50).rooms.find(r=>r.id===room3.id).existingW>0);
assert.equal(J.replay(corrected,D,1).choices.photoRooms[image],'f-bed2');assert.equal(J.replay(corrected,D,0).choices.photoRooms[image],undefined);
const unresolved=J.assignPhoto(corrected,D,image,null);assert.equal(J.packageFor(D,unresolved,50).rooms.find(r=>r.id===room3.id).existingW,null);
const duplicate=J.assignPhoto(matched,D,image,'f-bed2');assert.equal(J.packageFor(D,duplicate,50).rooms.find(r=>r.id===room2.id).existingW,J.packageFor(D,matched,50).rooms.find(r=>r.id===room2.id).existingW);
const noEstimate=J.assignPhoto(baseline,D,'76e4aee1a9ecc380a4783862c4f59f42','f-bed2');assert.equal(J.packageFor(D,noEstimate,50).rooms.find(r=>r.id===room2.id).existingW,null);assert(J.packageFor(D,noEstimate,50).rooms.find(r=>r.id===room2.id).photos.includes('76e4aee1a9ecc380a4783862c4f59f42'));
assert.throws(()=>J.assignPhoto(baseline,D,'bad-photo','f-bed2'),/valid photo/);assert.throws(()=>J.assignPhoto(baseline,D,image,'bad-room'),/valid photo/);
const measured=J.observe(matched,D,{...o,id:'measured-bedroom',target:room2.id});const moved=J.assignPhoto(measured,D,image,'f-bed3');
assert.equal(J.packageFor(D,moved,50).rooms.find(r=>r.id===room2.id).basis,'entered');assert.equal(J.packageFor(D,moved,50).rooms.find(r=>r.id===room2.id).inventoryVerified,false,'Changed attribution flags measured room inventory for review');
assert.equal(J.importProject(baseline,D,corrected).choices.photoRooms[image],'f-bed3');
console.log('Household comfort, hot-water brief, photo attribution, correction, unknowns, inventory precedence and replay passed');

const matches=J.photoMatches(D,baseline),queue=J.matchingQueue(D,baseline);
assert(matches.some(i=>i.status==='automatic'));assert(queue.length>0&&queue.length<matches.length);
assert(queue.some(i=>i.id==='35f17817024aeb5a833ac4f0ed4d592a'),'Heated status does not establish exact room identity');
assert(!queue.some(i=>i.id==='80c683d944553f0ea65667c4d3965e6c'),'Supported hall attribution needs no repeated question');
assert(!J.matchingQueue(D,matched).some(i=>i.id===image));assert(!J.matchingQueue(D,unresolved).some(i=>i.id===image),'Explicitly deferred photo is not asked again');
const styled=J.revise(baseline,D,{household:{...baseline.household,roomDesign:{[living.id]:{style:'ufh'}},sitePreferences:[{id:'front-test',side:'front',kind:'prefer',u:.5,v:.8}]}},'Design ideas');
assert(J.packageFor(D,styled,50).designPending);assert.equal(J.metrics(D,styled).loadW,J.metrics(D,baseline).loadW);assert.equal(J.metrics(D,styled).net,J.metrics(D,baseline).net,'Style request is not a fictitious priced product');
assert(J.tasks(D,styled).some(t=>t.id==='design-'+living.id));assert(J.tasks(D,styled).some(t=>t.id==='site-preferences'));
const capture=J.observe(baseline,D,{id:'capture-test',at:o.at,kind:'radiator-evidence',target:living.id,role:'homeowner',observer:'Fixture',note:'Test evidence',widthMm:900,heightMm:null,attachments:[{name:'test.jpg',dataUrl:'data:image/jpeg;base64,AAAA'}]});
assert.equal(J.metrics(D,capture).loadW,J.metrics(D,baseline).loadW);assert.equal(J.metrics(D,capture).net,J.metrics(D,baseline).net);assert(J.tasks(D,capture).some(t=>t.id==='review-photos-'+living.id));
assert.throws(()=>J.observe(baseline,D,{...capture.observations[0],widthMm:-1}),/optional dimensions/);
console.log('Confident match queue, homeowner design requests and unmeasured photo evidence passed');

const guideUnknown=J.roomGuide(J.packageFor(D,baseline,50).rooms.find(r=>r.existingW===null));
assert.equal(guideUnknown.status,'Output still unknown');assert(guideUnknown.implication.includes('No replacement is budgeted'));
const guidePhoto=J.roomGuide(J.packageFor(D,capture,50).rooms.find(r=>r.id===living.id));
assert.equal(guidePhoto.status,'Photos received · assessment pending');assert(guidePhoto.evidence.includes('not yet changed'));
const guideMeasured=J.roomGuide(J.packageFor(D,measured,50).rooms.find(r=>r.id===room2.id));
assert.equal(guideMeasured.status,'Inventory recorded');assert(guideMeasured.evidence.includes('No need to photograph'));
assert(J.roomGuide(J.packageFor(D,moved,50).rooms.find(r=>r.id===room2.id)).status!=='Inventory recorded','Changed attribution must reopen the evidence request');
console.log('Room guide distinguishes missing, submitted, rated and reopened evidence');
