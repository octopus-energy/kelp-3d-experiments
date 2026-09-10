// Pure validation and append-only replay for property-specific survey evidence.
(function(root,factory){if(typeof module!=='undefined'&&module.exports)module.exports=factory();else(root.SolarViz=root.SolarViz||{}).survey=factory();})(typeof window!=='undefined'?window:globalThis,function(){
 'use strict';
 const clone=x=>JSON.parse(JSON.stringify(x)),plain=x=>x&&typeof x==='object'&&!Array.isArray(x);
 function empty(workflow){return {schemaVersion:1,kind:'survey-evidence',propertyId:workflow.propertyId,workflowRevision:workflow.revision,events:[]};}
 function validate(packet,workflow){
  if(!plain(packet)||packet.schemaVersion!==1||packet.kind!=='survey-evidence')throw Error('Unsupported survey format.');
  if(packet.propertyId!==workflow.propertyId)throw Error('This survey belongs to another property.');
  if(packet.workflowRevision!==workflow.revision)throw Error('Evidence revision changed. Review and migrate the earlier survey before importing it.');
  if(!Array.isArray(packet.events)||packet.events.length>2000)throw Error('Invalid survey event list.');
  const tasks=new Map((workflow.case?.tasks||[]).map(t=>[t.id,t])),ids=new Set();let attachmentBytes=0;
  for(const e of packet.events){
   if(!plain(e)||typeof e.id!=='string'||!e.id.trim()||e.id.length>150||ids.has(e.id))throw Error('Missing or duplicate event ID.');ids.add(e.id);
   const task=tasks.get(e.taskId);if(!task||e.targetId!==task.targetId)throw Error('Unknown survey target.');
   if(e.role!==task.role)throw Error('Survey role does not match this task.');
   for(const key of ['observer','method','recordedAt'])if(typeof e[key]!=='string'||!e[key].trim()||e[key].length>1000)throw Error('Observer, method and date are required.');
   if(!Number.isFinite(Date.parse(e.recordedAt)))throw Error('Invalid observation date.');
   if(!['observed','partial-observation','not-accessible','homeowner-preference'].includes(e.status))throw Error('Invalid observation status.');
   if((e.role==='homeowner'&&!['homeowner-preference','not-accessible'].includes(e.status))||(e.role!=='homeowner'&&e.status==='homeowner-preference'))throw Error('Homeowner preferences and survey measurements must stay separate.');
   if(typeof e.notes!=='string'||e.notes.length>12000)throw Error('Invalid observation notes.');
   if(['not-accessible','partial-observation'].includes(e.status)&&!e.notes.trim())throw Error('Explain what could not be checked.');
   if(!plain(e.values))throw Error('Invalid measurements.');
   if(Object.keys(e.values).some(k=>!task.fields.some(f=>f.key===k)))throw Error('Unexpected measurement field.');
   if(e.status==='partial-observation'&&!Object.keys(e.values).length)throw Error('Record at least one partial measurement.');
   for(const f of task.fields){const value=e.values[f.key];if(value===undefined){if(f.required&&['observed','homeowner-preference'].includes(e.status))throw Error(f.label+' is required.');continue;}
    if(f.type==='number'&&(typeof value!=='number'||!Number.isFinite(value)||value<f.min||value>f.max))throw Error(f.label+' must be between '+f.min+' and '+f.max+' '+f.unit+'.');
    if(f.type==='text'&&(typeof value!=='string'||!value.trim()||value.length>12000))throw Error(f.label+' needs a description.');
   }
   if(!Array.isArray(e.evidenceRefs)||e.evidenceRefs.some(r=>typeof r!=='string'||r.length>1000))throw Error('Invalid evidence references.');
   if(!Array.isArray(e.attachments)||e.attachments.length>3)throw Error('Attach up to three photographs per observation.');
   for(const a of e.attachments){if(!plain(a)||typeof a.name!=='string'||a.name.length>250||typeof a.dataUrl!=='string'||!/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$/.test(a.dataUrl)||a.dataUrl.length>2800000)throw Error('Photographs must be JPEG, PNG or WebP, up to 2 MB each.');attachmentBytes+=a.dataUrl.length;}
  }
  if(attachmentBytes>16000000)throw Error('Survey photographs exceed the 12 MB packet limit; use file references for the rest.');
  return true;
 }
 function append(packet,event,workflow){const result=clone(packet);result.events.push(clone(event));validate(result,workflow);return result;}
 function merge(packet,incoming,workflow){validate(packet,workflow);validate(incoming,workflow);const result=clone(packet),byId=new Map(result.events.map(e=>[e.id,e]));for(const e of incoming.events){if(byId.has(e.id)){if(JSON.stringify(byId.get(e.id))!==JSON.stringify(e))throw Error('Conflicting event ID; existing evidence was preserved.');}else{result.events.push(clone(e));byId.set(e.id,e);}}validate(result,workflow);return result;}
 function summary(packet,workflow){validate(packet,workflow);const covered=new Set(packet.events.filter(e=>['observed','homeowner-preference'].includes(e.status)).map(e=>e.taskId)),changed=new Set(packet.events.map(e=>e.taskId));return {observations:packet.events.length,tasksWithEvidence:covered.size,totalTasks:workflow.case.tasks.length,designStatus:'not-approved',requiresReview:packet.events.length>0,affectedResults:[...new Set(workflow.case.tasks.filter(t=>changed.has(t.id)).flatMap(t=>t.invalidates||[]))],openTasks:workflow.case.tasks.filter(t=>!covered.has(t.id)).map(t=>t.id)};}
 return {empty,validate,append,merge,summary};
});
