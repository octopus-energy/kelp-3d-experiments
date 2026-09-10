const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),crypto=require('node:crypto');
const S=require('../js/building/survey.js'),workflow=require('../3broomroad-data/reconstruction/workflow.json'),root=path.resolve(__dirname,'../3broomroad-data');
const ctx={window:{}};vm.runInNewContext(fs.readFileSync(path.join(root,'reconstruction/workflow-bundle.js'),'utf8'),ctx);assert.deepEqual(JSON.parse(JSON.stringify(ctx.window.RECONSTRUCTION_WORKFLOW)),workflow);
for(const s of workflow.sources)if(s.sha256)assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(root,s.path))).digest('hex'),s.sha256,s.path);
assert.equal(workflow.os.building.properties.description,'Mid-Terrace House');assert.equal(workflow.os.building.properties.basementpresence,'Present');assert.equal(workflow.os.buildingLocal[0].length,9);
assert.equal(workflow.case.readiness.roomHeatLoss,'blocked');assert(workflow.case.rooms.every(r=>r.netFloorAreaM2===null&&r.ceilingHeightM===null));
assert(workflow.case.emitters.every(e=>e.ratedOutputW===null&&e.replacementDecision==='undetermined'));
const task=workflow.case.tasks.find(t=>t.id==='survey-emitter-kitchen');
const event={id:'test-1',taskId:task.id,targetId:task.targetId,role:'surveyor',observer:'Test surveyor',recordedAt:'2026-09-10T12:00:00.000Z',method:'Laser and model label',status:'observed',values:{width:1000,height:600,depth:100,type:'Double panel, model to verify',pipes:'15 mm outside diameter'},notes:'Test data only',evidenceRefs:['site-photo-001.jpg'],attachments:[]};
const empty=S.empty(workflow),before=JSON.stringify(empty),packet=S.append(empty,event,workflow);
assert.equal(JSON.stringify(empty),before,'Append never mutates existing evidence');assert.equal(S.summary(packet,workflow).tasksWithEvidence,1);assert.equal(S.summary(packet,workflow).designStatus,'not-approved');
assert.deepEqual(S.merge(packet,packet,workflow),packet,'Reimport is idempotent');
assert.throws(()=>S.merge(packet,{...packet,events:[{...event,notes:'Changed'}]},workflow),/Conflicting/);
assert.throws(()=>S.validate({...packet,propertyId:'other'},workflow),/another property/);
assert.throws(()=>S.validate({...packet,workflowRevision:'stale'},workflow),/revision changed/);
for(const change of [{values:{...event.values,width:-1}},{values:{...event.values,height:Infinity}},{values:{...event.values,watts:1000}},{role:'homeowner'},{status:'confirmed'},{status:'not-accessible',notes:''},{observer:''},{attachments:[{name:'bad.svg',dataUrl:'data:image/svg+xml;base64,AAAA'}]}])assert.throws(()=>S.validate({...packet,events:[{...event,...change}]},workflow));
const inaccessible={...event,id:'test-2',values:{},status:'not-accessible',notes:'Furniture prevents access'};assert.equal(S.summary(S.append(empty,inaccessible,workflow),workflow).tasksWithEvidence,0);
const homeowner=workflow.case.tasks.find(t=>t.role==='homeowner'),choice={...event,id:'test-3',taskId:homeowner.id,targetId:homeowner.targetId,role:'homeowner',status:'homeowner-preference',values:{preferences:'Prefer hp-rear, pending sound and access checks'}};
assert(S.validate(S.append(packet,choice,workflow),workflow));assert.throws(()=>S.append(empty,{...choice,status:'observed'},workflow),/preferences/);
const ids=new Set(workflow.case.rooms.map(r=>r.id));for(const c of workflow.case.adjacencies){assert(ids.has(c.a));assert(ids.has(c.b));}
console.log('all checks passed: evidence hashes, room/emitter unknowns, survey validation, audit replay, property/revision isolation and homeowner separation');

const partial={...event,id:'partial',status:'partial-observation',values:{width:1000},notes:'Depth and type hidden behind furniture'};
const partialSummary=S.summary(S.append(empty,partial,workflow),workflow);assert.equal(partialSummary.tasksWithEvidence,0);assert(partialSummary.affectedResults.includes('emitter-sizing'));
assert.throws(()=>S.append(empty,{...partial,notes:''},workflow),/Explain/);
