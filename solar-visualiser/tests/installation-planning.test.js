const assert=require('node:assert/strict'),K=require('../js/building/installation-planning'),J=require('../js/building/installation'),D=require('../3broomroad-data/proposal/proposal.json');
const baseline=J.create(D),id='0:r11',f={method:'loan',extra:0,deposit:2000,apr:6,months:60,source:'Synthetic fixed-rate example'};
const loan=K.finance(12000,f);assert(Math.abs(loan.monthly-193.328)<.01);assert(Math.abs(loan.totalPaid-13599.68)<.1);assert.equal(K.finance(12000,{...f,apr:0}).interest,0);assert(Number.isFinite(K.finance(12000,{...f,apr:1e-15}).monthly));assert.equal(K.finance(12000,{...f,deposit:12000}).monthly,0);assert.equal(K.finance(12000,{...f,deposit:13000}).ready,false);assert.equal(K.finance(null,f).ready,false);assert.equal(K.finance(12000,{...f,extra:null}).ready,false);assert.equal(K.finance(12000,{...f,apr:null}).ready,false);
const stamp={at:'2026-09-11T12:00:00Z',role:'homeowner',observer:'Synthetic fixture',note:'Test data only'};
const single=J.observe(baseline,D,{...stamp,id:'glass',kind:'envelope',target:'bay-lower',value:'single'}),before=JSON.stringify(single),comparison=K.roomComparison(D,single,id,{'bay-lower':'double'});
for(const row of comparison){assert(row.proposed.loadW<row.current.loadW);assert.equal(row.current.availableW,row.proposed.availableW);}
assert.equal(comparison[0].current.loadW,comparison[2].current.loadW);assert(comparison[0].current.availableW<comparison[2].current.availableW);assert.equal(JSON.stringify(single),before,'What-if never mutates observed fabric or choices');
assert.throws(()=>K.roomComparison(D,single,id,{'rear-bedroom':'double'}),/Unsupported/);
let p=J.revise(single,D,{household:{...single.household,planning:{rooms:{[id]:{improvements:['glazing'],glazing:{'bay-lower':'double'}}},finance:f}}},'Improvement idea');
assert.equal(J.metrics(D,p).loadW,J.metrics(D,single).loadW);assert(K.pending(D,p).some(t=>t.target===id));assert.equal(J.replay(p,D,1).household.planning,undefined);
p=J.observe(p,D,{...stamp,id:'room',kind:'room-context',target:id,extension:'mixed'});p=J.observe(p,D,{...stamp,id:'service',kind:'service',target:'boiler',presence:'present',location:'Kitchen cupboard'});assert.equal(K.latestService(p,'boiler').location,'Kitchen cupboard');assert.equal(J.metrics(D,p).loadW,J.metrics(D,single).loadW);
const check={...stamp,id:'check',kind:'planning-check',target:'siting',status:'reviewed',reference:'Fixture assessment',scope:'Test model and courtyard',signature:'not-trusted',role:'surveyor'};
assert.throws(()=>J.observe(p,D,{...check,role:'homeowner'}),/review/);p=J.observe(p,D,check);assert.equal(K.checks(p).find(c=>c.id==='siting').status,'reviewed');assert.notEqual(p.observations.at(-1).signature,'not-trusted');assert(p.observations.at(-1).signature.length<100);
const payment=J.revise(p,D,{household:{...p.household,planning:{...p.household.planning,finance:{...f,apr:5}}}},'Finance only');assert.equal(K.checks(payment).find(c=>c.id==='siting').stale,false);
const moved=J.revise(p,D,{choices:{...p.choices,outdoor:'garden'}},'Move outdoor unit');assert.equal(K.checks(moved).find(c=>c.id==='siting').stale,true);assert.equal(K.checks(J.replay(moved,D,p.events.length)).find(c=>c.id==='siting').status,'reviewed');
assert.throws(()=>J.revise(p,D,{observations:p.observations.slice(1)},'Erase evidence'),/cannot|position/);
for(const finance of [{...f,apr:-1},{...f,months:1.2},{...f,extra:NaN}])assert.throws(()=>J.validate({...baseline,household:{...baseline.household,planning:{finance}}},D));
assert.throws(()=>J.validate({...baseline,household:{...baseline.household,planning:{rooms:[]}}},D));assert.throws(()=>J.observe(p,D,{...stamp,id:'invalid',kind:'service',target:'boiler',presence:'present',location:''}),/Describe/);
const imported=J.importProject(baseline,D,moved);assert.equal(imported.household.planning.rooms[id].glazing['bay-lower'],'double');assert.equal(imported.observations.length,moved.observations.length);assert.equal(K.checks(imported).find(c=>c.id==='siting').stale,true);
console.log('Room planning: factual vs proposed glazing, flow physics, null-aware finance, service provenance, append-only review, invalidation, import and replay passed');

assert(J.evidenceForTask(D,p,{id:'access',kind:'access',target:'utility'}).some(o=>o.kind==='service'),'Existing services are visible beside the technical access check');

const reopened=J.observe(single,D,{...stamp,id:'glass-reopened',kind:'envelope-uncertain',target:'bay-lower',note:'Earlier pane count is uncertain'});
assert.equal(reopened.choices.envelope['bay-lower'],undefined);assert.equal(J.metrics(D,reopened).loadW,J.metrics(D,baseline).loadW);assert.equal(reopened.observations[0].value,'single');assert.equal(J.replay(reopened,D,1).choices.envelope['bay-lower'].choice,'single');assert(J.tasks(D,reopened).some(t=>t.id==='envelope-bay-lower'));
