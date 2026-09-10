window.SolarViz=window.SolarViz||{};
(function(SV){
'use strict';
const workflow=window.RECONSTRUCTION_WORKFLOW,$=id=>document.getElementById(id),S=SV.survey,ns='http://www.w3.org/2000/svg';
if(!workflow?.case){$('readiness').textContent='This dataset needs reviewed room and survey observations.';return;}
const data=workflow.case,key='reconstruction-survey:'+workflow.propertyId+':'+workflow.revision;
let packet=S.empty(workflow);
try{const saved=localStorage.getItem(key);if(saved){const parsed=JSON.parse(saved);S.validate(parsed,workflow);packet=parsed;}}catch(e){$('feedback').textContent='Saved evidence could not be loaded: '+e.message;}
function el(tag,text,parent){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;if(parent)parent.appendChild(node);return node;}
function svg(parent,tag,attrs){const node=document.createElementNS(ns,tag);for(const [k,v] of Object.entries(attrs))node.setAttribute(k,v);parent.appendChild(node);return node;}
function save(next){packet=next;try{localStorage.setItem(key,JSON.stringify(packet));$('feedback').textContent='Observation saved. Geometry and design inputs need designer review.';}catch(e){$('feedback').textContent='Evidence is in this page but browser storage is unavailable or full. Export the survey now to preserve it.';}renderRecords();}
const tasks=new Map(data.tasks.map(t=>[t.id,t]));
for(const t of data.tasks)$('survey-task').add(new Option((t.role==='homeowner'?'Homeowner · ':'Survey · ')+t.title,t.id));
function taskView(){
 const t=tasks.get($('survey-task').value);$('task-why').textContent=t.why;$('task-method').textContent=t.method;$('record-status').replaceChildren();
 $('record-status').add(new Option(t.role==='homeowner'?'Homeowner preference recorded':'Observation / measurement recorded',t.role==='homeowner'?'homeowner-preference':'observed'));$('record-status').add(new Option('Could not check / not accessible','not-accessible'));
 if(t.role==='surveyor')$('record-status').add(new Option('Partial observation — some details unknown','partial-observation'));
 $('fields').replaceChildren();for(const f of t.fields){const label=el('label',f.label+(f.unit?' ('+f.unit+')':''),$('fields'));const input=el(f.type==='text'?'textarea':'input',undefined,label);input.dataset.field=f.key;input.required=f.required;if(f.type==='number'){input.type='number';input.min=f.min;input.max=f.max;input.step='any';}}
 $('notes').value='';$('references').value='';$('attachments').value='';statusFields();
}
function statusFields(){const status=$('record-status').value,inaccessible=status==='not-accessible';for(const input of $('fields').querySelectorAll('input,textarea')){input.required=!inaccessible&&status!=='partial-observation';input.disabled=inaccessible;}$('notes').required=inaccessible||status==='partial-observation';}
$('survey-task').onchange=taskView;$('record-status').onchange=statusFields;taskView();
function selectTask(id){$('survey-task').value=id;taskView();$('survey-task').scrollIntoView({block:'nearest',behavior:'smooth'});}
function renderRecords(){
 const state=S.summary(packet,workflow);$('progress').textContent=`${state.tasksWithEvidence} of ${state.totalTasks} checks have complete records · ${state.observations} observations. ${state.requiresReview?'Review affected results: '+state.affectedResults.join(', ')+'.':'No on-site observations recorded.'}`;
 $('readiness').textContent='Survey evidence needed before sizing: room dimensions, building fabric, ventilation, emitters and service routes.';
 $('events').replaceChildren();for(const e of packet.events){const li=el('li',undefined,$('events'));el('strong',tasks.get(e.taskId).title,li);el('div',e.status+' · '+e.observer+' · '+new Date(e.recordedAt).toLocaleString(),li);el('div','Method: '+e.method,li);
  for(const f of tasks.get(e.taskId).fields)if(e.values[f.key]!==undefined)el('div',f.label+': '+e.values[f.key]+(f.unit?' '+f.unit:''),li);
  if(e.notes)el('div',e.notes,li);if(e.evidenceRefs.length)el('div','References: '+e.evidenceRefs.join(', '),li);for(const a of e.attachments){const img=el('img',undefined,li);img.src=a.dataUrl;img.alt=a.name;}
 }
 $('remaining').replaceChildren();for(const id of state.openTasks){const t=tasks.get(id),li=el('li',undefined,$('remaining')),button=el('button',t.title,li);button.onclick=()=>selectTask(id);}
}
$('survey-form').onsubmit=async event=>{
 event.preventDefault();const button=$('survey-form').querySelector('button');button.disabled=true;
 try{
  const t=tasks.get($('survey-task').value),values={},status=$('record-status').value,files=[...$('attachments').files];
  if(files.length>3||files.some(f=>f.size>2*1024*1024||!['image/jpeg','image/png','image/webp'].includes(f.type)))throw Error('Use up to three JPEG, PNG or WebP photos, at most 2 MB each.');
  if(status!=='not-accessible')for(const f of t.fields){const input=$('fields').querySelector('[data-field="'+f.key+'"]');if(input.value.trim())values[f.key]=f.type==='number'?Number(input.value):input.value.trim();}
  const attachments=await Promise.all(files.map(file=>new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve({name:file.name,dataUrl:reader.result});reader.onerror=()=>reject(Error('Could not read '+file.name));reader.readAsDataURL(file);})));
  const entry={id:crypto.randomUUID(),taskId:t.id,targetId:t.targetId,role:t.role,observer:$('observer').value.trim(),recordedAt:new Date().toISOString(),method:$('method').value.trim(),status,values,notes:$('notes').value.trim(),evidenceRefs:$('references').value.split('\n').map(s=>s.trim()).filter(Boolean),attachments};
  save(S.append(packet,entry,workflow));$('attachments').value='';
 }catch(e){$('feedback').textContent=e.message;}finally{button.disabled=false;}
};
$('export-survey').onclick=()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(packet,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=workflow.propertyId+'-survey-evidence.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
$('import-survey').onchange=async()=>{try{const file=$('import-survey').files[0];if(!file)return;if(file.size>20*1024*1024)throw Error('Survey packet exceeds 20 MB.');save(S.merge(packet,JSON.parse(await file.text()),workflow));}catch(e){$('feedback').textContent=e.message;}finally{$('import-survey').value='';}};
const plan=$('plan-overlay');plan.setAttribute('viewBox','0 0 '+data.planImageSize.join(' '));svg(plan,'image',{href:SV.imageUrl(window.IMAGE_DATA.floorplan),width:data.planImageSize[0],height:data.planImageSize[1]});
function roomView(r){$('room-detail').replaceChildren();el('h3',r.name+' · '+r.level,$('room-detail'));el('p',(r.printedMaxDimensionsM?'Printed maximum dimensions: '+r.printedMaxDimensionsM.join(' × ')+' m. ':'No printed dimensions. ')+'Net area, ceiling profile and thermal boundaries still need measurement.',$('room-detail'));const button=el('button','Record room measurements',$('room-detail'));button.onclick=()=>selectTask('room-'+r.id);for(const node of plan.querySelectorAll('polygon'))node.setAttribute('fill',node.dataset.room===r.id?'#087e8b66':'#4477aa22');}
for(const r of data.rooms){const node=svg(plan,'polygon',{points:r.planPolygon.map(p=>p.join(',')).join(' '),fill:'#4477aa22',stroke:'#087e8b','stroke-width':3,tabindex:0,role:'button','aria-label':r.name});node.dataset.room=r.id;node.onclick=()=>roomView(r);node.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();roomView(r);}};svg(node,'title',{}).textContent=r.name;
 const tr=el('tr',undefined,$('rooms'));el('td',r.name,tr);el('td',r.level,tr);el('td',r.printedMaxDimensionsM?r.printedMaxDimensionsM.join(' × ')+' m (max)':'Unmeasured',tr);
}
roomView(data.rooms[0]);for(const c of data.adjacencies)el('li',data.rooms.find(r=>r.id===c.a).name+' ↔ '+data.rooms.find(r=>r.id===c.b).name+' · '+c.connection+' · '+c.status,$('connections'));
for(const e of data.emitters)$('emitter').add(new Option(e.id+' · '+data.rooms.find(r=>r.id===e.roomId).name,e.id));
function emitterView(){const e=data.emitters.find(e=>e.id===$('emitter').value),im=window.IMAGE_DATA.images.find(im=>im.id===e.imageId),canvas=$('photo-overlay');canvas.replaceChildren();svg(canvas,'image',{href:SV.imageUrl(im),width:1024,height:683});svg(canvas,'rect',{x:e.bbox[0]*1024,y:e.bbox[1]*683,width:e.bbox[2]*1024,height:e.bbox[3]*683,fill:'none',stroke:'#ffd166','stroke-width':3});$('emitter-note').replaceChildren();el('p',e.observation,$('emitter-note'));const button=el('button','Record emitter measurements',$('emitter-note'));button.onclick=()=>selectTask('survey-'+e.id);}
$('emitter').onchange=emitterView;emitterView();
for(const option of data.options){el('h3',option.title,$('options'));el('p',option.tradeoff+' Status: '+option.status+'.',$('options'));}
for(const node of data.serviceNodes)el('li',node.kind.replaceAll('-',' ')+': location unknown',$('services'));
const os=workflow.os;if(os){for(const [k,v] of Object.entries(os.facts))el('p',k.replaceAll('_',' ')+': '+(v??'unknown'),$('os-evidence'));const p=os.building.properties;el('p','Basement evidence: '+p.basementpresence_evidencedate+' · '+p.basementpresence_thirdpartyprovenance+' · source '+p.basementpresence_source,$('os-evidence'));}
for(const s of workflow.sources){const tr=el('tr',undefined,$('sources'));el('td',s.path,tr);el('td',s.status,tr);const td=el('td',s.sha256?s.sha256.slice(0,12)+'…':'Missing',tr);td.title=s.sha256||'Missing';}
window.__SURVEY__={workflow,get packet(){return packet;},get summary(){return S.summary(packet,workflow);}};renderRecords();
})(window.SolarViz);
